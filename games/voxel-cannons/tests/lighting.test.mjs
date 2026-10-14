import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

// Use the real renderer constructor with the same CPU-only NullEngine approach
// as renderer.test.mjs. The predictions below reproduce Babylon 9.30's standard
// shader arithmetic; they are NOT GPU rendering, screenshot or pixel tests.
class Element {
  constructor() { this.children = []; this.dataset = {}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this[key] = value; }
  getBoundingClientRect() { return { width: 800, height: 1200 }; }
  addEventListener() {}
  removeEventListener() {}
}
globalThis.document = { createElement: () => new Element(), addEventListener() {}, removeEventListener() {} };
globalThis.devicePixelRatio = 1;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.__LightingTestEngine = class extends NullEngine {
  static isSupported() { return true; }
  constructor() { super({ renderWidth: 800, renderHeight: 1200 }); }
};
let source = await fs.readFile(new URL('../src/renderer.js', import.meta.url), 'utf8');
source = source.replace("import { Engine } from '@babylonjs/core/Engines/engine.js';", 'const Engine = globalThis.__LightingTestEngine;');
source = source.replace(/(['"])(@babylonjs\/core\/[^'"]+)\1/g, (_, quote, specifier) => quote + import.meta.resolve(specifier) + quote);
source += '\n//# sourceURL=renderer-lighting-null-fixture.mjs';
const { VoxelRenderer, PALETTE } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

function fixture(t) {
  const canvas = new Element(); canvas.parentElement = new Element();
  const renderer = new VoxelRenderer(canvas);
  t.after(() => renderer.dispose());
  assert.equal(renderer.available, true, renderer.error);
  return renderer;
}
function lights(renderer) {
  const fill = renderer.scene.getLightByName('soft-sky');
  const key = renderer.scene.getLightByName('sun');
  assert.equal(fill?.getClassName(), 'HemisphericLight');
  assert.equal(key?.getClassName(), 'DirectionalLight');
  return { fill, key };
}
// lightsFragmentFunctions: hemi mixes ground/sky with (N.H + 1)/2;
// directional diffuse is max(0, N.L). lightFragment adds the contributions;
// default.fragment clamps diffuseColor * diffuseBase before adding specular.
function diffuseAtNormal(fill, key, normal, { fillIntensity = fill.intensity, keyIntensity = key.intensity, shadow = 1 } = {}) {
  const hemiMix = (Vector3.Dot(normal, fill.direction.normalizeToNew()) + 1) / 2;
  const lambert = Math.max(0, Vector3.Dot(normal, key.direction.normalizeToNew().negate()));
  return fill.diffuse.asArray().map((sky, i) =>
    fillIntensity * (fill.groundColor.asArray()[i] * (1 - hemiMix) + sky * hemiMix)
    + keyIntensity * key.diffuse.asArray()[i] * lambert * shadow);
}
function rawDiffuse(material, gain) {
  return material.diffuseColor.asArray().map((value, i) => value * gain[i]);
}
function bytes(values) { return values.map(value => Math.round(Math.max(0, Math.min(1, value)) * 255)); }

test('renderer preserves authored gamma-space palette and floor colors', t => {
  const r = fixture(t);
  const expected = { green: '#48ba30', pink: '#f26398', cyan: '#25beda', ink: '#303944' };
  assert.deepEqual(Object.keys(PALETTE), Object.keys(expected));
  for (const [name, hex] of Object.entries(expected)) {
    assert.equal(PALETTE[name].hex, hex);
    assert.deepEqual(r.materials[name].diffuseColor.asArray(), Color3.FromHexString(hex).asArray(),
      `${name} must not receive a speculative toLinearSpace conversion`);
  }
  for (const [name, hex] of Object.entries({ groundMat: '#f8a459', padMat: '#ffe8c9', plinthMat: '#b940c1', muzzleMat: '#19252b', whiteMat: '#fff8d8' })) {
    assert.deepEqual(r[name].diffuseColor.asArray(), Color3.FromHexString(hex).asArray());
  }
});

test('actual initial lights have a bounded diffuse budget for every surface normal', t => {
  const r = fixture(t), { fill, key } = lights(r);
  assert.equal(r.scene.lights.length, 2);
  assert.ok(fill.intensity >= 0 && key.intensity >= 0);
  assert.ok(fill.intensity + key.intensity <= 1, 'summed white-light diffuse budget must not exceed one');
  assert.deepEqual(fill.diffuse.asArray(), [1, 1, 1]);
  assert.deepEqual(key.diffuse.asArray(), [1, 1, 1]);
  assert.equal(fill.getScaledIntensity(), fill.intensity);
  assert.equal(key.getScaledIntensity(), key.intensity);
  assert.ok(fill.groundColor.asArray().every(value => value >= 0 && value <= 1));
  // Each channel is a + b*N.H + k*max(0,N.L). Its directional-on branch is
  // bounded by a + |b*H + k*L|, and its directional-off branch by a + |b|.
  const h = fill.direction.normalizeToNew(), l = key.direction.normalizeToNew().negate();
  for (const ground of fill.groundColor.asArray()) {
    const a = fill.intensity * (1 + ground) / 2;
    const b = fill.intensity * (1 - ground) / 2;
    const bound = Math.max(a + Math.abs(b), a + h.scale(b).add(l.scale(key.intensity)).length());
    assert.ok(bound <= 1, `all-normal diffuse bound ${bound} must not clip`);
  }
  // A nonzero scene ambient alone adds nothing when material ambient is black.
  for (const material of [r.groundMat, r.plinthMat, ...Object.values(r.materials)]) {
    assert.deepEqual(material.ambientColor.asArray(), [0, 0, 0]);
    assert.deepEqual(material.emissiveColor.asArray(), [0, 0, 0]);
  }
  const defines = {};
  r.scene.imageProcessingConfiguration.prepareDefines(defines);
  assert.equal(defines.IMAGEPROCESSING, false, 'CPU prediction assumes no exposure/tone mapping/color processing');
  assert.equal(defines.IMAGEPROCESSINGPOSTPROCESS, false);
});

test('former light intensities reproduce the reported lemon floor by CPU shader arithmetic', t => {
  const r = fixture(t), { fill, key } = lights(r);
  const former = { fillIntensity: .85, keyIntensity: 1.15 };
  const gain = diffuseAtNormal(fill, key, Vector3.Up(), former);
  const raw = rawDiffuse(r.groundMat, gain);
  assert.ok(raw[0] > 1 && raw[1] > 1 && raw[2] < 1, 'red and green clipped while blue remained proportional');
  // The supplied JPEG has an unobstructed floor patch exactly (255,255,157).
  assert.deepEqual(bytes(raw), [255, 255, 157]);
  assert.deepEqual(bytes(rawDiffuse(r.plinthMat, gain)), [255, 113, 255]);
  const shadowGain = diffuseAtNormal(fill, key, Vector3.Up(), { ...former, shadow: r.shadow.darkness });
  assert.deepEqual(bytes(rawDiffuse(r.groundMat, shadowGain)), [255, 172, 94]);
});

test('current upward floor keeps apricot channel ordering with no diffuse or specular-budget clipping', t => {
  const r = fixture(t), { fill, key } = lights(r);
  const raw = rawDiffuse(r.groundMat, diffuseAtNormal(fill, key, Vector3.Up()));
  assert.deepEqual(bytes(raw), [230, 152, 83]);
  assert.ok(raw[0] > raw[1] && raw[1] > raw[2]);
  assert.ok(raw.every(value => value > 0 && value < 1));
  // Even an intentionally loose maximum specular bound cannot clip this floor.
  // This does not assert that cannon specular highlights can never clip.
  const specular = r.groundMat.specularColor.asArray();
  raw.forEach((value, i) => {
    const specularBound = specular[i] * (fill.intensity * fill.specular.asArray()[i] + key.intensity * key.specular.asArray()[i]);
    assert.ok(value + specularBound < 1);
  });
});
