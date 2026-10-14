import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { build } from 'esbuild';
import { buildGame, bundleOptions } from '../build.mjs';

const root = new URL('../', import.meta.url);
const read = relative => fs.readFile(new URL(relative, root));

test('engine and bundler dependencies are exact and match the reproducible lockfile', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const lock = JSON.parse(await read('package-lock.json'));
  assert.equal(pkg.version, '2.0.1');
  assert.equal(lock.version, pkg.version);
  assert.equal(pkg.dependencies['@babylonjs/core'], '9.30.0');
  assert.equal(pkg.devDependencies.esbuild, '0.28.2');
  for (const name of ['@babylonjs/core', 'esbuild']) {
    const entry = lock.packages[`node_modules/${name}`];
    assert.equal(entry.version, pkg.dependencies[name] || pkg.devDependencies[name]);
    assert.ok(entry.resolved.startsWith('https://registry.npmjs.org/'));
    assert.ok(entry.integrity.startsWith('sha512-'));
  }
});

test('redistribution preserves the exact Babylon license and NOTICE, plus esbuild license', async () => {
  for (const [source, target] of [
    ['node_modules/@babylonjs/core/license.md', 'vendor/BABYLON-LICENSE.txt'],
    ['node_modules/@babylonjs/core/NOTICE.md', 'vendor/BABYLON-NOTICE.txt'],
    ['node_modules/esbuild/LICENSE.md', 'vendor/ESBUILD-LICENSE.txt'],
  ]) assert.deepEqual(await read(target), await read(source));
});

test('application builds as one classic script with no external module imports or source map', async () => {
  const result = await buildGame({ write: false });
  assert.equal(result.outputFiles.length, 1);
  assert.equal(result.report.runtimeImports.length, 0);
  assert.ok(result.report.bytes > 1000);
  assert.ok(result.outputFiles[0].path.endsWith('game.js'));
  assert.doesNotThrow(() => new vm.Script(result.outputFiles[0].text));
  assert.ok(!result.outputFiles[0].text.includes('sourceMappingURL='));
});

test('Babylon material shader imports are bundled into the same classic script', async () => {
  const result = await build({
    ...bundleOptions,
    entryPoints: undefined,
    stdin: {
      contents: `import { Engine } from '@babylonjs/core/Engines/engine.js';
        import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
        globalThis.babylonBundleFixture = { Engine, StandardMaterial };`,
      resolveDir: bundleOptions.absWorkingDir,
      sourcefile: 'babylon-bundle-fixture.js',
      loader: 'js',
    },
  });
  assert.equal(result.outputFiles.length, 1);
  assert.ok(Object.keys(result.metafile.inputs).some(name => name.endsWith('/Shaders/default.vertex.js')));
  assert.ok(Object.keys(result.metafile.inputs).some(name => name.endsWith('/Shaders/default.fragment.js')));
  for (const output of Object.values(result.metafile.outputs)) assert.deepEqual(output.imports, []);
  assert.doesNotThrow(() => new vm.Script(result.outputFiles[0].text));
});
