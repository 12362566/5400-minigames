# Third-party notices

Cube Salvo 2.0.1 bundles the local Babylon.js 3D engine into `game.js`. No CDN script is needed to load this game. Source dependencies are pinned in `package.json`; complete archive URLs, exact versions, and SHA-512 integrity values are committed in `package-lock.json`.

## Babylon.js

- Package: `@babylonjs/core`
- Version: **9.30.0**
- License: **Apache-2.0**
- Project: https://www.babylonjs.com/
- Source: https://github.com/BabylonJS/Babylon.js
- Official package archive: https://registry.npmjs.org/@babylonjs/core/-/core-9.30.0.tgz
- Archive integrity: `sha512-rV+kc7B9oEtREaWh0YYNinoqYshRbHLHj7t4s4woDjDXFXWKHu1d8S914CNfs3KTOI8V8DvoVKLe2yDHZXfZEA==`
- Exact license distributed by this package: [vendor/BABYLON-LICENSE.txt](vendor/BABYLON-LICENSE.txt)
- Exact package notice, including upstream component attribution: [vendor/BABYLON-NOTICE.txt](vendor/BABYLON-NOTICE.txt)

The application uses Babylon.js for its scene graph, camera, meshes, materials, lighting, and WebGL rendering. Babylon.js itself is unmodified; esbuild bundles and minifies the imported engine modules together with the application code. Refer to the preserved package NOTICE for notices shipped upstream. Unused optional decoder/compiler services are not required by this game's locally generated geometry and standard materials.

## esbuild (build-time only)

- Package: `esbuild`
- Version: **0.28.2**
- License: **MIT**
- Project: https://esbuild.github.io/
- Source: https://github.com/evanw/esbuild
- Official package archive: https://registry.npmjs.org/esbuild/-/esbuild-0.28.2.tgz
- Archive integrity: `sha512-HKVLS8dvII+xoKW9kmqxbRKrnWEXfJJr/FZhhJmiqIB0e053QNYFqOBouTMO/k5sID4MvCiUCvv8b9M4h32wIA==`
- Exact license distributed by this package: [vendor/ESBUILD-LICENSE.txt](vendor/ESBUILD-LICENSE.txt)

esbuild and the matching platform-specific `@esbuild/*` executable are build tools. They are not needed to play the generated browser game. The lockfile pins platform packages and their integrity hashes.

## Reproduce the build

Requirements: Node.js 20 or later and npm.

```sh
npm --cache /tmp/cube-salvo-npm-cache ci
npm test
npm run build
```

The build uses local dependencies, tree-shakes and minifies into one classic-script IIFE, embeds imported shader modules, and emits no source map or runtime module chunks. It rejects external module imports. Output size, gzip size, module count, and SHA-256 are printed after a successful build. Preserve this notice and the `vendor/` license files with redistributed source or game bundles.
