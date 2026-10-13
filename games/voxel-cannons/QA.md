# 2.0 engine replacement QA

Candidate, 2026-10-13. Source review and deterministic tests are in progress. Actual public WebGL and viewport validation will be recorded after the exact candidate is deployed. Do not treat previous 1.0 browser results as coverage of this renderer.

Scope: WebGL initialization and shader compilation; camera/framing comparison; world-space cannon picking and projectiles; six same-origin iframe viewports; menus, save compatibility, win/loss and restart; no-WebGL message; context loss; dense-level draw calls and frame rate.
