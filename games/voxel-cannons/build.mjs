import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('.', import.meta.url));

/** One local, classic-script artifact. esbuild inlines static and literal dynamic imports. */
export const bundleOptions = Object.freeze({
  absWorkingDir: root,
  entryPoints: ['src/app.js'],
  outfile: 'game.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  treeShaking: true,
  minify: true,
  splitting: false,
  sourcemap: false,
  charset: 'utf8',
  legalComments: 'inline',
  metafile: true,
  write: false,
  logLevel: 'warning',
  banner: {
    js: '/* Cube Salvo 2.0.1 · bundled local Babylon.js runtime. Licenses: THIRD_PARTY_NOTICES.md and vendor/. */',
  },
});

export async function buildGame({ write = true } = {}) {
  const result = await build(bundleOptions);
  const outputs = Object.entries(result.metafile.outputs);
  if (result.outputFiles.length !== 1 || outputs.length !== 1 || !outputs[0][0].endsWith('game.js')) {
    throw new Error('The offline game must produce exactly one JavaScript file.');
  }
  if (outputs.some(([, output]) => output.imports.length !== 0)) {
    throw new Error('The offline game must not have runtime module imports or shader chunks.');
  }
  const [{ contents }] = result.outputFiles;
  if (write) await fs.writeFile(path.join(root, 'game.js'), contents);
  const report = {
    bytes: contents.byteLength,
    gzipBytes: gzipSync(contents).byteLength,
    sha256: createHash('sha256').update(contents).digest('hex'),
    modules: Object.keys(result.metafile.inputs).length,
    runtimeImports: outputs.flatMap(([, output]) => output.imports),
  };
  return { ...result, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { report } = await buildGame();
  console.log(`Built game.js: ${report.bytes.toLocaleString('en-US')} bytes (${report.gzipBytes.toLocaleString('en-US')} gzip), ${report.modules} local modules, zero runtime imports.`);
  console.log(`SHA-256: ${report.sha256}`);
}
