# 2.0 engine replacement QA

Date: 2026-10-13. Runtime deployed in commit `436a34036384292f8ba8aa89857f0e638f51b4a9`; diagnostic added in `f915c65df28a133683e8a3c4ecb5b6f072978326` without changing the runtime. Both exact-SHA Pages deployments succeeded. Published index, CSS, game bundle and viewport fixture match the frozen SHA-256 files.

## Verified

- `npm test`: **43/43 pass** (16 deterministic engine, 12 app integration, 11 renderer/NullEngine, 4 build/provenance tests).
- All 12 current and 12 legacy levels are solvable. Ammunition is conserved; old mid-round geometry, progress and cooldowns restore exactly. Untouched old rounds upgrade; a confirmed restart/next round uses the current campaign.
- Renderer tests verify outward Babylon mesh winding; opening-camera projected slopes approximately −0.179 and +2.885; both fixed camera presets; all level/cannon bounds at six aspect ratios; four in-world cannon picks at DPR 1 and 1.5; muzzle/trajectory alignment; live thin-instance removal; resource disposal; context-loss callbacks.
- Bundle: pinned Babylon.js 9.30.0, 1,835,319 bytes (442,966 gzip), 566 local modules, one classic IIFE, no external module imports. Runtime SHA-256: `bc3b463c4098f2f006c6c8f042fbeaa2c6f01b973cbdab076cc9c528cf07da3e`.
- Independent download of official npm archives matched lockfile integrity; all three redistributed license/NOTICE files exactly match the upstream packages.
- Actual browser same-origin iframe layout checks passed at **320×568, 390×844, 410×820, 844×390, 568×320 and 1280×900**: no document overflow, canvas/controls separated and inside the viewport, menu and four selection targets at least 44px. These are fallback-layout checks, not 3D rendering checks. The zero-valued DPR field in this unavailable environment is not evidence of GPU scaling.
- Actual 320×568 browser UI: menu opens, camera option label switches, win preview has a visible 45px next button and advances to level 2, loss preview hides next and provides a visible 45px retry button. Dialogs remain within the viewport.
- Explicit unsupported-mode route: **2/2 checks pass**. The message clearly explains WebGL is unavailable, simulation remains paused, and cannon buttons are disabled. It never displays a substitute image as rendered 3D.

## GPU validation blocker — still unverified

The cloud browser cannot create any standard WebGL context. The standalone, engine-independent `qa/webgl-check.html` tried `webgl2`, `webgl`, and `experimental-webgl`; all returned null and a `webglcontextcreationerror` containing **GL_VENDOR = Disabled, GL_RENDERER = Disabled**. No browser GPU/security settings were changed.

Therefore **actual GPU shader compilation, final 3D pixels/camera appearance, real pointer-to-3D picking, live context restoration, frame rate and device performance are not accepted as verified**. The browser fixture correctly records three GPU-dependent failures at every viewport; these are retained in `qa/browser-results-v2.json`, not relabeled as passing. Capability evidence is in `qa/webgl-capability-result.json`.

NullEngine tests validate geometry and application behavior, not rendering. Private reference/before screenshots were inspected, but no successful after-render screenshot exists in this browser. Visual acceptance requires a WebGL-enabled authorized browser or the user's device. The two camera parameters are estimates from separate video segments, not recovered original engine settings.

## Re-run on a WebGL-enabled browser

- Open `qa/viewport.html?w=390&h=844&v=2.0.0&auto=1`, then repeat the other five dimensions.
- Check the default opening camera and menu's side camera against the referenced segments.
- Click a visible front-row 3D cannon and check that the shot originates at its aimed muzzle.
- Run the context-loss/restoration and dense-scene controls; inspect draw calls/frame rate, console errors, and same-origin-only runtime resources.
- Confirm shaders/materials/shadows and the 3D composition visually before calling the renderer fully accepted.
