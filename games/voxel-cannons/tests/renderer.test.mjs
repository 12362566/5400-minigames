import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Camera } from '@babylonjs/core/Cameras/camera.js';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { createGame, getStateLevel, deploy } from '../src/engine.js';
import { LEVELS } from '../src/levels.js';

// Exercise the real renderer with Babylon's CPU-only NullEngine. These tests
// verify geometry, transforms, lifecycle and buffer API calls, not WebGL shader
// compilation, GPU output, pixel appearance, or actual context restoration.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.hidden = false; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this[key] = value; }
  getBoundingClientRect() { return { width: 800, height: 1200 }; }
  addEventListener() {}
  removeEventListener() {}
  getContext() {
    return { canvas: this, clearRect() {}, fillRect() {}, strokeText() {}, fillText() {},
      drawImage() {}, measureText(text) { return { width: text.length * 10 }; },
      save() {}, restore() {}, translate() {}, scale() {} };
  }
}
globalThis.document = { createElement: tag => new Element(tag), addEventListener() {}, removeEventListener() {} };
globalThis.devicePixelRatio = 1;
globalThis.ResizeObserver = class { observe() {} disconnect() { this.disconnected = true; } };
globalThis.__RendererTestEngine = class extends NullEngine {
  static isSupported() { return true; }
  constructor() {
    super({ renderWidth: 800, renderHeight: 1200 });
    // NullEngine does not expose real GPU instancing. Enable the capability so
    // the real Babylon thin-instance bookkeeping and upload path can be tested.
    this._caps.instancedArrays = true;
    this.dynamicBufferUpdates = 0;
  }
  updateDynamicVertexBuffer(...args) {
    this.dynamicBufferUpdates++;
    return super.updateDynamicVertexBuffer(...args);
  }
};
let source = await fs.readFile(new URL('../src/renderer.js', import.meta.url), 'utf8');
source = source.replace("import { Engine } from '@babylonjs/core/Engines/engine.js';", 'const Engine = globalThis.__RendererTestEngine;');
source = source.replace(/(['"])(@babylonjs\/core\/[^'"]+)\1/g, (_, quote, specifier) => quote + import.meta.resolve(specifier) + quote);
source += '\nexport { roundedCube };\n//# sourceURL=renderer-null-fixture.mjs';
const { VoxelRenderer, roundedCube } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
function fixture(t, { state = createGame(0), ...options } = {}) {
  const canvas = new Element('canvas'); canvas.parentElement = new Element('div');
  const renderer = new VoxelRenderer(canvas, options);
  t.after(() => renderer.dispose());
  if (state) renderer.setState(state, getStateLevel(state));
  return renderer;
}
function close(actual, expected, epsilon = 1e-5) { assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`); }
function vectorClose(actual, expected, epsilon = 1e-5) { actual.asArray().forEach((n, i) => close(n, expected.asArray()[i], epsilon)); }
function triangleNormalDots(mesh) {
  const p = mesh.getVerticesData('position'), n = mesh.getVerticesData('normal'), indices = mesh.getIndices(), dots = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    const va = Vector3.FromArray(p, a * 3), vb = Vector3.FromArray(p, b * 3), vc = Vector3.FromArray(p, c * 3);
    dots.push(Vector3.Dot(Vector3.Cross(vb.subtract(va), vc.subtract(va)), Vector3.FromArray(n, a * 3)));
  }
  return dots;
}

test('rounded cube normals face out and all triangles use Babylon left-handed front winding', t => {
  const renderer = fixture(t, { state: null });
  const cube = roundedCube(renderer.scene, 'geometry-test');
  const reference = MeshBuilder.CreateBox('babylon-reference', {}, renderer.scene);
  assert.ok(triangleNormalDots(reference).every(dot => dot < 0));
  assert.ok(triangleNormalDots(cube).every(dot => dot < -1e-6));
  assert.equal(cube.getTotalVertices(), 150);
  assert.equal(cube.getTotalIndices(), 576);
  const p = cube.getVerticesData('position'), n = cube.getVerticesData('normal');
  for (let i = 0; i < p.length; i += 3) {
    const point = Vector3.FromArray(p, i), normal = Vector3.FromArray(n, i);
    close(normal.length(), 1);
    assert.ok(Vector3.Dot(point, normal) > 0);
    assert.ok(point.asArray().every(v => Number.isFinite(v) && Math.abs(v) <= .500001));
  }
});

test('opening camera is real orthographic and reproduces measured edge slopes', t => {
  const r = fixture(t);
  r.scene.updateTransformMatrix(true);
  assert.equal(r.camera.mode, Camera.ORTHOGRAPHIC_CAMERA);
  const o = r.project(Vector3.Zero()), x = r.project(Vector3.Right()), y = r.project(Vector3.Up()), z = r.project(Vector3.Forward());
  close((x.y - o.y) / (x.x - o.x), -.17935155);
  close((z.y - o.y) / (z.x - o.x), 2.88511442);
  close(y.x, o.x);
  assert.ok(y.y < o.y);
  const deep = new Vector3(4, 5, 7);
  vectorClose(r.project(deep.add(Vector3.Right())).subtract(r.project(deep)), x.subtract(o));
  r.setCameraPreset('side');
  assert.equal(r.camera.mode, Camera.ORTHOGRAPHIC_CAMERA);
  assert.equal(r.info().camera.yaw, 32);
  assert.equal(r.info().camera.elevation, 32);
  r.setCameraPreset('opening');
  assert.equal(r.info().camera.yaw, 14);
});

test('both cameras frame sculpture and four queue rows at tall and wide aspect ratios', t => {
  const r = fixture(t);
  for (const level of LEVELS) for (const preset of ['opening', 'side']) for (const [width, height] of [[320, 568], [800, 1200], [1200, 800]]) {
    r.level = level; r.width = width; r.height = height; r.setCameraPreset(preset);
    const transform = r.camera.getViewMatrix(true).multiply(r.camera.getProjectionMatrix(true));
    const viewport = r.camera.viewport.toGlobal(width, height);
    const points = [];
    for (const x of [-level.width / 2 - .5, level.width / 2 + .5])
      for (const y of [0, level.height + .4])
        for (const z of [0, level.depth + .3]) points.push(new Vector3(x, y, z));
    for (const x of [-4.6, 4.6]) points.push(new Vector3(x, 0, -10.5));
    for (const point of points) {
      const p = Vector3.Project(point, Matrix.Identity(), transform, viewport);
      assert.ok(p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height,
        `${level.id} ${preset} ${width}x${height}: ${point.asArray()} projects outside to ${p.asArray()}`);
      assert.ok(p.z > 0 && p.z < 1);
    }
  }
});

test('thin-instance removal swaps live matrices, requests dynamic upload and disables the zero-count source', t => {
  const r = fixture(t);
  const group = r.voxelGroups.get('green');
  const removed = r.state.voxels.find(v => v.id === group.ids[0]);
  const lastId = group.ids.at(-1), lastMatrix = [...group.buffer.slice((group.count - 1) * 16, group.count * 16)];
  const before = group.count, uploads = r.engine.dynamicBufferUpdates;
  assert.equal(group.mesh.thinInstanceCount, before);
  r.removeVoxel(removed);
  assert.equal(group.count, before - 1);
  assert.equal(group.mesh.thinInstanceCount, before - 1);
  assert.equal(group.ids[0], lastId);
  assert.equal(group.index.get(lastId), 0);
  assert.equal(group.index.has(removed.id), false);
  assert.deepEqual([...group.buffer.slice(0, 16)], lastMatrix);
  assert.ok(r.engine.dynamicBufferUpdates > uploads);
  const after = group.count;
  r.removeVoxel(removed);
  assert.equal(group.count, after, 'duplicate removal must be harmless');
  for (const voxel of r.state.voxels.filter(v => v.color === 'green')) r.removeVoxel(voxel);
  assert.equal(group.count, 0);
  assert.equal(group.mesh.thinInstanceCount, 0);
  assert.equal(group.mesh.isEnabled(), false, 'zero thin instances otherwise render the original source mesh');
  assert.equal(group.ids.length, 0);
  assert.equal(group.index.size, 0);
});

test('all initial instance translations lie within the mesh bounding box', t => {
  const r = fixture(t);
  for (const group of r.voxelGroups.values()) {
    group.mesh.computeWorldMatrix(true);
    const bounds = group.mesh.getBoundingInfo().boundingBox;
    for (const id of group.ids) {
      const voxel = r.state.voxels.find(v => v.id === id), world = r.world(voxel);
      const matrix = Matrix.FromArray(group.buffer, group.index.get(id) * 16);
      vectorClose(matrix.getTranslation(), world);
      for (const axis of ['x', 'y', 'z']) {
        assert.ok(bounds.minimumWorld[axis] <= world[axis] - .49999);
        assert.ok(bounds.maximumWorld[axis] >= world[axis] + .49999);
      }
    }
  }
});

test('projectiles start at the actual aimed world-space muzzle and reach the voxel front face', t => {
  const state = createGame(0); assert.equal(deploy(state, 0).ok, true);
  const r = fixture(t, { state });
  const cannon = r.cannons.get('slot0'), target = state.voxels.find(v => v.alive);
  r.events([{ type: 'shot', slotIndex: 0, color: cannon.color, target }]);
  assert.equal(r.bullets.length, 1);
  const bullet = r.bullets[0];
  cannon.root.computeWorldMatrix(true); cannon.muzzle.computeWorldMatrix(true);
  vectorClose(bullet.start, cannon.muzzle.getAbsolutePosition());
  vectorClose(bullet.mesh.position, bullet.start);
  const expectedEnd = r.world(target); expectedEnd.z -= .47;
  vectorClose(bullet.end, expectedEnd);
  const aim = expectedEnd.subtract(cannon.position.add(new Vector3(0, .92, .3))).normalize();
  cannon.barrel.computeWorldMatrix(true);
  vectorClose(Vector3.TransformNormal(Vector3.Up(), cannon.barrel.getWorldMatrix()).normalize(), aim);
  // Animation lifecycle only: rasterization is deliberately not claimed here.
  r.scene.render = () => {};
  r.reduced = true;
  r.render(bullet.duration + .001);
  assert.equal(r.bullets.length, 0);
  assert.equal(bullet.mesh.isDisposed(), true);
  assert.equal(bullet.trail.isDisposed(), true);
});

test('context loss blocks animation, notifies pause, and restoration clears the notice', t => {
  const r = fixture(t); const notifications = [];
  r.onContextChange = blocked => notifications.push(blocked);
  r.engine.onContextLostObservable.notifyObservers(r.engine);
  assert.equal(r.blocked, true); assert.equal(r.message.hidden, false);
  const before = r.time; r.render(1); assert.equal(r.time, before);
  r.engine.onContextRestoredObservable.notifyObservers(r.engine);
  assert.equal(r.blocked, false); assert.equal(r.message.hidden, true);
  assert.deepEqual(notifications, [true, false]);
});

test('unsupported WebGL leaves a readable blocking notice and no simulation rendering', t => {
  const r = fixture(t, { forceUnavailable: true });
  assert.equal(r.available, false); assert.equal(r.blocked, true);
  assert.equal(r.canvas.dataset.engine, 'unavailable');
  assert.equal(r.message.role, 'alert'); assert.equal(r.message.hidden, false);
  assert.match(r.message.children.map(c => c.textContent).join(' '), /WebGL/);
  assert.doesNotThrow(() => { r.events([]); r.render(1); r.resize(); });
});

test('replacing state releases old cannon meshes, labels and textures without growth', t => {
  const r = fixture(t);
  const counts = () => ({ meshes: r.scene.meshes.length, materials: r.scene.materials.length,
    textures: r.scene.textures.length, nodes: r.scene.transformNodes.length,
    shadowCasters: r.shadow.getShadowMap().renderList.length });
  const baseline = counts(), oldCannon = r.cannons.values().next().value;
  for (let i = 0; i < 4; i++) { const state = createGame(0); r.setState(state, getStateLevel(state)); }
  assert.deepEqual(counts(), baseline);
  assert.equal(oldCannon.root.isDisposed(), true);
  assert.equal(oldCannon.label.isDisposed(), true);
  assert.ok(oldCannon.parts.every(part => part.isDisposed()));
  r.dispose();
  assert.equal(r.scene.isDisposed, true);
  assert.equal(r.observer.disconnected, true);
});


test('all four world-space queue heads are pickable with both cameras and high-DPI scaling', t => {
  const r = fixture(t);
  const selected = []; r.onSelectColumn = col => selected.push(col);
  for (const scaling of [1, 1 / 1.5]) for (const preset of ['opening', 'side']) {
    r.engine.setHardwareScalingLevel(scaling); r.setCameraPreset(preset);
    r.scene.updateTransformMatrix(true);
    for (const mesh of r.scene.meshes) mesh.computeWorldMatrix(true);
    for (let column = 0; column < 4; column++) {
      const diagnostic = r.pickQueue(column);
      assert.equal(diagnostic.column, column, `${preset}, hardware scaling ${scaling}, column ${column}`);
      const picked = r.scene.pick(diagnostic.x, diagnostic.y);
      assert.equal(picked.hit, true);
      assert.equal(picked.pickedMesh.metadata.column, column);
      r.scene.onPointerDown({}, picked);
      assert.equal(selected.at(-1), column);
    }
  }
  for (const cannon of r.cannons.values()) {
    assert.equal(cannon.label.isPickable, false);
    for (const part of cannon.parts) assert.equal(part.isPickable, cannon.column !== null);
  }
});

test('actual cannon mesh corners fit six viewports in both presets, all levels', t => {
 const r=fixture(t); const viewports=[[320,568],[390,844],[844,390],[1440,900],[1280,720],[768,1024]];
 for(let index=0;index<LEVELS.length;index++){
  const state=createGame(index);for(let i=0;i<5;i++)deploy(state,i%4);r.setState(state,getStateLevel(state));
  for(const preset of ['opening','side'])for(const [width,height] of viewports){
   r.width=width;r.height=height;r.setCameraPreset(preset);
   const transform=r.camera.getViewMatrix(true).multiply(r.camera.getProjectionMatrix(true));
   const viewport=r.camera.viewport.toGlobal(width,height);
   for(const c of r.cannons.values())for(const mesh of [...c.parts,c.label]){
    mesh.computeWorldMatrix(true);
    for(const point of mesh.getBoundingInfo().boundingBox.vectorsWorld){
     const p=Vector3.Project(point,Matrix.Identity(),transform,viewport);
     assert.ok(p.x>=0 && p.x<=width && p.y>=0 && p.y<=height, `${index} ${preset} ${width}x${height} ${mesh.name} out of frame ${p.asArray()}`);
    }
   }
  }
 }
});
