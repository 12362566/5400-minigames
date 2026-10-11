# Auction engine integration and audit

`engine.js` is an original dependency-free ES module, usable from a browser module script or modern Node. It has no DOM, network, storage, timer or real-payment dependencies. `engine.test.mjs` runs with `node --test engine.test.mjs`.

## API

- `createGame({seed, role})` returns a new game. A seed is an unsigned 32-bit integer or a 1–128 character string. Roles are `appraiser`, `analyst`, `scout`. Defaults are seed `20261011`, role `appraiser`.
- `publicView(game)` returns detached, render-safe objects. Never render or log the internal game in the UI.
- `submitBid(game, integer)`, `useTool(game, id)`, `nextRound(game)`, and `nextLot(game)` return `{ok:true,state}` or `{ok:false,state:originalGame,error}`. Actions never mutate their input. Adopt `result.state` on success; display `result.error` on failure.
- `serialize(game)` returns a JSON string. `restore(raw)` returns `{ok:true,state}` or `{ok:false,state:null,error}`. Reject failed restores and preserve the old save until the user chooses to start anew.

The five phases/transition choices are: initial `bidding`; after a nonfinal bid, `round-result` → `nextRound`; after settlement, `lot-result` → `nextLot`; the fifth lot's `nextLot` produces `finished`. There is no separate pending/animation phase in the engine. Repeated actions after a phase transition reject without charging/paying again.

## Public fields

Top level: `version`, `seed`, `role`, `wallet`, `initialWallet`, `profit`, `lotIndex` (0-based), `totalLots`, `lotName`, `round` (1-based), `maxRounds`, `phase`, `gridSize`, `items`, `clues`, `history`, `result`, `rivals`, `tools`, `toolCost`, `stats`, `completedLots`.

- `items`: only observed items before settlement; all items after settlement. `{id,x,y,w,h,visibility,kind?,category?,rarity?,name?,value?}`. Visibility is `outline` or `appraised`. Undiscovered item count, coordinates, dimensions and IDs are omitted. IDs are opaque. `name/value` are present only for appraised items; `rarity` is 0–5 when known. Never assume every outline has a rarity.
- `clues`: `{type:'public'|'private'|'tool',text,itemId?,rarity?,value?,count?,category?,categoryCount?}`. Analyst's private clue is the only pre-settlement disclosure of the full item count.
- `history`: `{round,bids:[{id,name,amount}],highest,tiedIds:[id],early}`. Contains completed rounds only; never the current AI bids.
- `rivals`: `{id,name,role,strategy,wallet}`. IDs are `rival-1`, `rival-2`, `rival-3`; the human ID is `player`.
- `tools`: `{id,name,cost,description,used,available}`. `scan` costs 12,000 and appraises one random unknown identity. `appraisal` costs 18,000 and reveals the count and combined value of the warehouse's highest rarity. Each can be used once per warehouse, only while the current round is awaiting a bid.
- `result`: `null` before settlement; then `{winnerId,winnerName,winningBid,lotValue,profit,netProfit,playerWon,early,tiedIds,tie,unsold,round,toolCost}`. `profit` is the human's auction profit (0 if they lose); `netProfit` also subtracts this warehouse's tool costs.
- `stats`: `{lotsWon,lotsCompleted,totalProfit,toolCost}`. Total profit includes tools already paid in the current warehouse.
- `completedLots`: settled results with additional `lotIndex`, `lotName`.

Exports: `CONSTANTS`, `RARITIES` (`{id,name,color}`), `ROLES` (`{id,name,description,icon}`), `TOOLS` (`{id,name,cost,description}`), and 60 original `CATALOG` entries (`{id,kind,category,w,h,name,rarity,value}`). Supported SVG kinds: vase, coin, ring, scroll, camera, watch, bottle, cup, statue, gem.

## Rules and implementation choices

- Five warehouses, starting cash 1,200,000 fictional coins, 12–18 packed items per 8×8 warehouse, five sealed-bid rounds maximum. Each round reveals two public outlines; from round 2 their rarity is also disclosed.
- The player may lower later bids or pass with 0; losing bids are never charged. There is no permanent withdrawal.
- The highest bid **strictly greater** than 1.4×second-highest ends the auction immediately, from any bidder. Integer cross multiplication avoids floating-point threshold ambiguity. Exactly 1.4× does not settle early.
- Otherwise the fifth round settles. Positive tied highest bids use a reproducible seeded uniform lottery among tied bidders. All-zero final bidding is unsold. This tie rule is an explicit implementation choice, not a claim about the reference game's tie behavior.
- Winner's items are immediately sold at their revealed catalog value; wallet changes by warehouse total minus winning bid. Tools are charged separately at use time. There is no inventory/investment/metagame or real-money purchase.
- AI bids are locked before the user acts each round. Estimation accepts only the AI's independently observed items, public prior rounds and catalog priors. No hidden total, hidden layout, hidden count or current human bid is passed to the estimator. Unknown count uses the midpoint prior of 15 except the analyst's disclosed exact count. Tool use does not recompute already sealed AI bids.
- Internal state necessarily contains the offline game's secrets. Public view is a UI information boundary, not a cryptographic security boundary. Local developer tools and source can inspect the simulation.

## Saves

Version 1 stores a bounded action log, normalized seed, role and accidental-corruption checksum, not trusted wallet/items/result objects. Restoration validates exact field names, version, input types, numeric bounds, checksum and every action via canonical replay. Duplicate purchases and impossible phase transitions are rejected even with a recomputed checksum. The checksum is not authentication/anti-cheat protection. A changed engine algorithm requires a save-version bump.

## Verification

The test suite audits deterministic generation/actions/replay; 1,000 nonoverlapping layouts; complete public-view nonleakage; intended role clues; immutable rejected actions; pass/lower bids; exact 1.4 boundary; full fifth round; ties and unsold lots; winner/loser accounting; tools; duplicate actions; all five warehouses; terminal-state rejection; corrupt saves; and sealed AI independence, including a test that changes invisible value/dimensions/count without changing AI bids.

Seeded balance checks include 150 fixed-prior sessions (750 warehouses) and 250 information-based appraiser sessions (1,250 warehouses). The fixed aggressive blind strategy loses on average. The conservative observation-only strategy averages +43,786 coins across the pinned 250 seeds, with 142 wins, 96 profitable wins and 38 losing sessions. This is a reproducible simulation check, not a promise of profit or an optimized strategy.
