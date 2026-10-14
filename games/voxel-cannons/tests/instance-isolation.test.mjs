import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { createGame, getStateLevel } from '../src/engine.js';
import { LEVELS } from '../src/levels.js';

// Same CPU-only renderer fixture as renderer.test.mjs, with upload recording.
// The regression checks Geometry's actual shader-facing world0..3 attributes,
// not only each mesh's private thin-instance bookkeeping. This does not claim
// real WebGL rasterization, shader compilation or pixel appearance coverage.
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
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.__InstanceIsolationEngine = class extends NullEngine {
  static isSupported() { return true; }
  constructor() {
    super({ renderWidth: 800, renderHeight: 1200 });
    this._caps.instancedArrays = true;
  }
  createDynamicVertexBuffer(vertices) {
    const native = super.createDynamicVertexBuffer(vertices);
    this.uploadedBuffers ??= new Map();
    this.uploadedBuffers.set(native, Float32Array.from(vertices));
    return native;
  }
  updateDynamicVertexBuffer(native, vertices, byteOffset = 0, byteLength) {
    const upload = Float32Array.from(vertices);
    const source = new Uint8Array(upload.buffer, 0, byteLength ?? upload.byteLength);
    const existing = this.uploadedBuffers.get(native);
    assert.ok(existing, 'an update must target a previously created native buffer');
    new Uint8Array(existing.buffer).set(source, byteOffset);
    return super.updateDynamicVertexBuffer(native, vertices, byteOffset, byteLength);
  }
};
let source = await fs.readFile(new URL('../src/renderer.js', import.meta.url), 'utf8');
source = source.replace("import { Engine } from '@babylonjs/core/Engines/engine.js';", 'const Engine = globalThis.__InstanceIsolationEngine;');
source = source.replace(/(['"])(@babylonjs\/core\/[^'"]+)\1/g, (_, quote, specifier) => quote + import.meta.resolve(specifier) + quote);
source += '\n//# sourceURL=renderer-instance-isolation-fixture.mjs';
const { VoxelRenderer, PALETTE } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
function fixture(t, levelIndex = 0) {
  const canvas = new Element('canvas'); canvas.parentElement = new Element('div');
  const renderer = new VoxelRenderer(canvas);
  t.after(() => renderer.dispose());
  assert.equal(renderer.available, true, renderer.error);
  const state = createGame(levelIndex);
  renderer.setState(state, getStateLevel(state));
  return renderer;
}
function expectedMatrix(renderer, voxel) {
  // Independent oracle: do not derive coordinates from the renderer buffer.
  return Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0,
    voxel.x - renderer.level.width / 2 + .5, voxel.y + .8, voxel.z + .5, 1]);
}
function assertBoundMatrices(renderer, label = '') {
  const byId = new Map(renderer.state.voxels.map(voxel => [voxel.id, voxel]));
  for (const [color, group] of renderer.voxelGroups) {
    assert.equal(group.mesh.thinInstanceCount, group.count);
    assert.equal(group.ids.length, group.count);
    for (let column = 0; column < 4; column++) {
      const kind = `world${column}`;
      const attribute = group.mesh.geometry.getVertexBuffer(kind);
      assert.ok(attribute, `${label} ${color} ${kind} missing from bound geometry`);
      assert.equal(attribute.getIsInstanced(), true);
      assert.equal(attribute.byteStride, 64);
      assert.equal(attribute.byteOffset, column * 16);
      assert.equal(attribute.getSize(), 4);
      const uploaded = renderer.engine.uploadedBuffers.get(attribute.getBuffer());
      assert.ok(uploaded, `${label} ${color} ${kind} must bind a recorded native buffer`);
      assert.ok(uploaded.length >= group.count * 16,
        `${label} ${color} ${kind}: bound capacity ${uploaded.length / 16} is below draw count ${group.count}`);
      for (let index = 0; index < group.count; index++) {
        const voxel = byId.get(group.ids[index]);
        assert.equal(voxel.color, color);
        const expected = expectedMatrix(renderer, voxel).slice(column * 4, column * 4 + 4);
        const offset = index * 16 + column * 4;
        const actual = uploaded.slice(offset, offset + 4);
        assert.deepEqual([...actual], [...expected],
          `${label} ${color} ${kind} instance ${index} (${voxel.id}) must use its own matrix`);
      }
    }
  }
}

test('all twelve sculptures bind their own per-color matrices to actual world0..3 attributes', t => {
  const r = fixture(t);
  for (let index = 0; index < LEVELS.length; index++) {
    if (index) { const state = createGame(index); r.setState(state, getStateLevel(state)); }
    assertBoundMatrices(r, `level ${index + 1}`);
  }
});

test('color batches own geometry, native matrix buffers and palette materials without contaminating template or cannons', t => {
  const r = fixture(t);
  const groups = [...r.voxelGroups.values()];
  assert.equal(new Set(groups.map(group => group.mesh.geometry)).size, 4);
  assert.equal(new Set(groups.map(group => group.mesh.material)).size, 4);
  assert.equal(new Set(groups.map(group => group.mesh.geometry.getVertexBuffer('world0').getBuffer())).size, 4);
  for (const [color, group] of r.voxelGroups) {
    assert.notEqual(group.mesh.geometry, r.cubeTemplate.geometry);
    assert.equal(group.mesh.material, r.materials[color]);
    assert.deepEqual(group.mesh.material.diffuseColor.asArray(), Color3.FromHexString(PALETTE[color].hex).asArray());
    assert.equal(group.mesh.material.alpha, 1);
    const native = group.mesh.geometry.getVertexBuffer('world0').getBuffer();
    for (let column = 0; column < 4; column++) {
      assert.equal(group.mesh.geometry.getVertexBuffer(`world${column}`).getBuffer(), native);
      assert.equal(r.cubeTemplate.geometry.getVertexBuffer(`world${column}`), undefined);
      for (const cannon of r.cannons.values()) {
        assert.equal(cannon.parts[0].geometry.getVertexBuffer(`world${column}`), undefined);
      }
    }
  }
});

test('swap removal updates the bound native buffer only for its color, including an empty batch', t => {
  const r = fixture(t, 1);
  for (const [color, group] of r.voxelGroups) {
    const otherUploads = [...r.voxelGroups].filter(([other]) => other !== color).map(([, other]) => {
      const native = other.mesh.geometry.getVertexBuffer('world0').getBuffer();
      return [native, r.engine.uploadedBuffers.get(native).slice()];
    });
    const removed = r.state.voxels.find(voxel => voxel.id === group.ids[0]);
    const lastId = group.ids.at(-1), before = group.count;
    removed.alive = false;
    r.removeVoxel(removed);
    assert.equal(group.count, before - 1);
    assert.equal(group.ids[0], lastId);
    assertBoundMatrices(r, `after ${color} swap removal`);
    for (const [native, previous] of otherUploads) {
      assert.deepEqual(r.engine.uploadedBuffers.get(native), previous, `${color} update must not alter another color's upload`);
    }
  }
  const emptied = r.voxelGroups.get('pink');
  for (const id of [...emptied.ids]) {
    const voxel = r.state.voxels.find(voxel => voxel.id === id);
    voxel.alive = false;
    r.removeVoxel(voxel);
  }
  assert.equal(emptied.mesh.thinInstanceCount, 0);
  assert.equal(emptied.mesh.isEnabled(), false);
  assertBoundMatrices(r, 'after emptying pink');
  r.setState(r.state, r.level);
  assert.equal(r.voxelGroups.get('pink').mesh.isEnabled(), false);
  assertBoundMatrices(r, 'after reloading partially cleared state');
});

test('repeated level reloads replace all bound matrix buffers and keep the source geometry clean', t => {
  const r = fixture(t);
  for (const levelIndex of [1, 0, 11, 1]) {
    const previous = [...r.voxelGroups.values()].map(group => ({ mesh: group.mesh,
      native: group.mesh.geometry.getVertexBuffer('world0').getBuffer() }));
    const state = createGame(levelIndex);
    r.setState(state, getStateLevel(state));
    const next = [...r.voxelGroups.values()].map(group => group.mesh.geometry.getVertexBuffer('world0').getBuffer());
    assert.equal(new Set(next).size, 4);
    for (const old of previous) {
      assert.equal(old.mesh.isDisposed(), true);
      assert.ok(!next.includes(old.native), 'replacement state must not bind a disposed batch buffer');
    }
    assertBoundMatrices(r, `reloaded level ${levelIndex + 1}`);
    for (let column = 0; column < 4; column++) {
      assert.equal(r.cubeTemplate.geometry.getVertexBuffer(`world${column}`), undefined);
    }
  }
});
