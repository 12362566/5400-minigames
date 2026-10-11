# Single-screen UI checks

Run the dependency-free checks from the project root:

```sh
node --test engine.test.mjs tests/*.test.mjs
node --check app.js
node --check tests/layout-audit.mjs
```

The existing 27 engine tests remain unchanged. `screen-layout.test.mjs` adds geometry-audit regression checks and the exact engine SHA-256 guard. `app-ui-flow.test.mjs` exercises the real app handlers with the real engine inside a minimal VM DOM: drawers, quick bids, validation/confirmation, tools, full five-lot play, ending/replay, storage/continue and viewport updates. These mocked DOM/geometry checks are not browser layout tests and do not prove CSS rendering or native focus behavior.

## Real same-origin browser fixture

Open `tests/mobile-preview.html` through the same HTTP/HTTPS static server as the game. Do not use a file URL. The authored iframe loads `../index.html?v=1.1.0` and sets both CSS width and height, without a maximum width, zoom or transforms. The outer test page may scroll to reveal a large desktop frame; the inner game document must not scroll.

Presets:

- 320 × 568: smallest portrait target
- 390 × 844: standard portrait
- 410 × 820: wide portrait
- 568 × 320: landscape
- 390 × 480: available-height approximation with an open soft keyboard
- 1280 × 720: desktop

Start or continue a game in the frame and close its welcome drawer. Switch presets without reloading or clearing local storage, then press **检查布局**. The fixture exposes `window.auditLayout()` and retains the most recent result as `window.lastLayoutAudit`. Auditing is read-only: it does not start a game, bid, change save data, or click through confirmations.

The report includes:

- Requested dimensions and actual `innerWidth`/`innerHeight`, plus visual-viewport dimensions when available
- Document/body client and scroll dimensions, root X/Y overflow and scroll position
- Game HUD, warehouse/stage, rail and bid-dock rectangles; pairwise main-region overlap
- Bid control and rail-button rectangles, viewport overflow, clipping ancestors and unreachable bottom edges
- Rail targets of at least 44 × 44 CSS pixels
- Visible warehouse item containment
- Open dialog bounds and internal scroll containers, reported separately from the main document

A `PASS` is a geometric check of the current state, not proof of all game phases or visual quality. `NOT_IN_GAME` means the single-screen assertions have not been exercised. Hidden overflow cannot by itself produce a pass: offscreen regions, controls and clipped descendants are still checked. An open dialog may intentionally cover the game; close it when testing interactions behind it.

## Manual state matrix

Check each preset in bidding and round/lot result phases. Also check the 320 × 568, 568 × 320 and 390 × 480 cases after the following actions:

1. Enter each role, close welcome/help, and confirm HUD, warehouse, side rail and bid controls fit simultaneously.
2. Open/close clues, tools, history, catalog and help. Expand catalog groups, scroll long content internally, use close buttons/Escape, and confirm focus returns to the originating control. A drawer must not move the underlying document.
3. Enter an invalid bid and an over-balance bid; error text must not push submit/pass below the viewport. Open full-balance confirmation, cancel, then resume editing.
4. Submit zero/pass, a normal bid and next-round. Reveal the lot and continue; the primary next action must remain visible in result states.
5. Buy an available tool only in a disposable local test game; check the confirmed fee and used state, reopen clues, and confirm the same game layout remains fitted.
6. Return home and continue saved progress. Reload, continue, and verify phase/round/identity and local storage behavior remain unchanged.
7. Finish all five lots, inspect the final lot, return home and replay. Check the final summary/ledger remains reachable using its intended drawer if present.
8. Rotate between portrait/landscape and restore portrait while both bidding and a drawer are open. Check no stranded scroll position or clipped primary button.

Real devices still need manual address-bar collapse, safe-area/notch and keyboard testing. The 390 × 480 frame validates reduced layout height; it cannot reproduce the full browser's virtual-keyboard viewport policy or OS overlays. Do not claim those checks passed solely from the fixture or Node tests.


## Recorded browser result — 2026-10-11

Runtime commit `c1ebd364cd1bb90858836c3262203159e5a90a42` / asset version `1.1.0` was tested on public GitHub Pages using the fixture above. All six presets passed in both bidding and ending states with zero issues and document scroll dimensions equal to client dimensions. All five lot settlements passed while naturally playing a complete game. This is actual browser geometry, not the VM test harness.

Observed interactions include all five rail panels, internal catalog scrolling (568px client height,1111px scroll height,495px internal scroll; root remained0), drawer rotation, close/Escape focus return, typed draft preservation after confirmed scan purchase, over-balance rejection, full-balance cancel, normal bid, five-round bidding, early settlement, next-lot from a settlement drawer, reload/continue, complete ledger, inspect-last/return-to-ending, replay and return home. The 320×568 and568×320 landing pages also kept all role and continue/new-game buttons in view. See `../QA.md` for values and exact observations.

No runtime fixes were needed after this browser pass. Physical mobile keyboard, safe-area and address-bar behavior remain unverified; the reduced-height frame is only a layout approximation.
