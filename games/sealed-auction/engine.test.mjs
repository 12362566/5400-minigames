import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, publicView, submitBid, useTool, nextRound, nextLot, serialize, restore, CONSTANTS, CATALOG, ROLES, RARITIES, TOOLS } from './engine.js';
const copy = value => JSON.parse(JSON.stringify(value));
const act = result => { assert.equal(result.ok, true, result.error); return result.state; };
function locked(game, values = [100000, 100000, 100000]) {
  const state = copy(game);
  state.lot.lockedBids = Object.fromEntries(values.map((value, i) => [`rival-${i + 1}`, value]));
  return state;
}
function finalRound(game, human = 100000, rivals = [100000, 100000, 100000]) {
  let state = game;
  for (let round = 1; round <= 5; round++) {
    state = act(submitBid(locked(state, rivals), human));
    if (round < 5) { assert.equal(state.phase, 'round-result'); state = act(nextRound(state)); }
  }
  return state;
}
function recalculateChecksum(saved) {
  const payload = { version: saved.version, seed: saved.seed, role: saved.role, actions: saved.actions };
  let n = 2166136261;
  for (const character of JSON.stringify(payload)) { n ^= character.charCodeAt(0); n = Math.imul(n, 16777619); }
  saved.checksum = (n >>> 0).toString(16).padStart(8, '0');
  return JSON.stringify(saved);
}

test('catalog, roles and constants are bounded and original', () => {
  assert.equal(CATALOG.length, 60); assert.equal(ROLES.length, 3); assert.equal(RARITIES.length, 6);
  assert.equal(CONSTANTS.totalLots, 5); assert.equal(CONSTANTS.rounds, 5);
  assert.equal(new Set(CATALOG.map(item => item.id)).size, CATALOG.length);
  assert.ok(CATALOG.every(item => Number.isInteger(item.value) && item.value > 0));
});

test('identical seeds produce identical immutable games, actions and saves', () => {
  const a = createGame({ seed: 'warehouse-42', role: 'scout' });
  const b = createGame({ seed: 'warehouse-42', role: 'scout' });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.lot.items, createGame({ seed: 'warehouse-43', role: 'scout' }).lot.items);
  const before = copy(a); const result = useTool(a, 'scan');
  assert.deepEqual(a, before); assert.notEqual(result.state, a);
  assert.deepEqual(result, useTool(b, 'scan'));
  assert.equal(serialize(result.state), serialize(useTool(b, 'scan').state));
});

test('invalid seeds and roles are rejected without coercion', () => {
  for (const seed of [-1, 0.1, NaN, Infinity, {}, '', 'x'.repeat(129), 2 ** 32]) assert.throws(() => createGame({ seed }));
  assert.throws(() => createGame({ role: 'omniscient' }));
  assert.doesNotThrow(() => createGame({ seed: 0 }));
});

test('1,000 warehouse layouts pack 12–18 nonoverlapping original items within 8×8', () => {
  for (let seed = 0; seed < 1000; seed++) {
    const { lot } = createGame({ seed }); const occupied = new Set();
    assert.ok(lot.items.length >= 12 && lot.items.length <= 18);
    assert.equal(new Set(lot.items.map(item => item.id)).size, lot.items.length);
    for (const item of lot.items) {
      assert.ok(item.x >= 0 && item.y >= 0 && item.x + item.w <= 8 && item.y + item.h <= 8);
      for (let y = item.y; y < item.y + item.h; y++) for (let x = item.x; x < item.x + item.w; x++) {
        assert.ok(!occupied.has(`${x},${y}`), `overlap at seed ${seed}`); occupied.add(`${x},${y}`);
      }
    }
  }
});

test('public view contains only observed positions, no hidden count, prices or sealed bids', () => {
  for (const role of ROLES) {
    const game = createGame({ seed: 24, role: role.id }); const view = publicView(game);
    const knownIds = new Set([...Object.keys(game.lot.publicSeen), ...Object.keys(game.lot.privateSeen.player)]);
    assert.equal(view.items.length, knownIds.size);
    assert.ok(!('itemCount' in view) && !('hiddenCount' in view) && !('lockedBids' in view));
    assert.equal(view.history.length, 0); assert.equal(view.result, null);
    for (const item of view.items) {
      assert.ok(knownIds.has(item.id)); assert.notEqual(item.visibility, 'hidden');
      if (item.visibility !== 'appraised') assert.ok(!('name' in item) && !('value' in item));
      assert.ok(!('catalogId' in item));
    }
    for (const hidden of game.lot.items.filter(item => !knownIds.has(item.id))) assert.ok(!JSON.stringify(view).includes(hidden.id));
    assert.ok(!JSON.stringify(view).includes('rng'));
  }
});

test('each role receives its own exact intended advantage', () => {
  const appraiser = createGame({ seed: 58, role: 'appraiser' });
  const item = publicView(appraiser).items.find(item => item.visibility === 'appraised');
  assert.equal(item.rarity, Math.max(...appraiser.lot.items.map(item => item.rarity)));
  const scout = createGame({ seed: 58, role: 'scout' });
  assert.equal(Object.keys(scout.lot.privateSeen.player).length, 3);
  assert.equal(publicView(scout).items.length, 5);
  const analyst = createGame({ seed: 58, role: 'analyst' });
  const clue = publicView(analyst).clues.find(clue => clue.count);
  assert.equal(clue.count, analyst.lot.items.length);
  assert.equal(clue.categoryCount, analyst.lot.items.filter(item => item.category === clue.category).length);
  assert.equal(publicView(analyst).items.length, 2);
});

test('views are detached and cannot mutate state', () => {
  const game = createGame(); const before = copy(game); const view = publicView(game);
  view.items[0].x = 999; view.clues[0].text = 'cheat'; view.rivals[0].wallet = 0; view.tools[0].cost = 0;
  assert.deepEqual(game, before);
});

test('invalid noninteger, negative, nonnumeric and overbudget bids never mutate state', () => {
  const game = createGame(); const before = copy(game);
  for (const amount of [-1, 1.5, NaN, Infinity, -Infinity, '100', null, undefined, {}, Number.MAX_SAFE_INTEGER, 1200001]) {
    const result = submitBid(game, amount); assert.equal(result.ok, false); assert.equal(result.state, game); assert.deepEqual(game, before);
  }
});

test('zero is a valid pass and losers pay nothing', () => {
  const game = locked(createGame(), [300000, 100000, 100000]); const before = game.bidders[0].wallet;
  const state = act(submitBid(game, 0));
  assert.equal(state.phase, 'lot-result'); assert.equal(state.lot.result.playerWon, false); assert.equal(state.bidders[0].wallet, before);
  assert.equal(state.lot.history[0].bids[0].amount, 0);
});

test('each later round can lower its bid, publishes all bids and reveals exactly two more outlines', () => {
  let state = locked(createGame(), [100000, 100000, 100000]);
  state = act(submitBid(state, 110000)); assert.equal(state.phase, 'round-result');
  assert.equal(publicView(state).history[0].bids.length, 4);
  const known = Object.keys(state.lot.publicSeen).length;
  state = act(nextRound(state)); assert.equal(state.lot.round, 2);
  assert.equal(Object.keys(state.lot.publicSeen).length, known + 2);
  state = act(submitBid(locked(state), 90000)); assert.equal(state.lot.history[1].bids[0].amount, 90000);
});

test('strict early threshold: 140% is not early; one coin above is early', () => {
  const game = locked(createGame());
  assert.equal(act(submitBid(game, 140000)).phase, 'round-result');
  const result = act(submitBid(game, 140001));
  assert.equal(result.phase, 'lot-result'); assert.equal(result.lot.result.early, true); assert.equal(result.lot.result.winnerId, 'player');
});

test('positive lone bidder wins immediately, while all-zero bids remain unsold after round five', () => {
  assert.equal(act(submitBid(locked(createGame(), [0, 0, 0]), 1)).lot.result.playerWon, true);
  const state = finalRound(createGame(), 0, [0, 0, 0]);
  assert.equal(state.lot.result.unsold, true); assert.equal(state.lot.result.winnerId, null);
  assert.equal(state.bidders[0].wallet, CONSTANTS.initialWallet);
});

test('fifth round highest wins even without a 40% lead', () => {
  const state = finalRound(createGame(), 110000);
  assert.equal(state.lot.result.round, 5); assert.equal(state.lot.result.early, false);
  assert.equal(state.lot.result.playerWon, true); assert.equal(state.lot.history.length, 5);
});

test('positive tied bids use reproducible seeded lottery with no fixed player preference', () => {
  const counts = new Map();
  for (let seed = 0; seed < 400; seed++) {
    const state = finalRound(createGame({ seed }));
    const winner = state.lot.result.winnerId;
    counts.set(winner, (counts.get(winner) || 0) + 1);
    assert.equal(state.lot.result.tie, true); assert.equal(state.lot.result.tiedIds.length, 4);
    if (seed < 8) assert.equal(finalRound(createGame({ seed })).lot.result.winnerId, winner);
  }
  assert.equal(counts.size, 4);
  for (const count of counts.values()) assert.ok(count > 65 && count < 135, `tie spread: ${JSON.stringify([...counts])}`);
});

test('winner books exactly total value minus winning bid; every loser remains unchanged', () => {
  const original = locked(createGame(), [100000, 100000, 100000]);
  const game = act(submitBid(original, 140001));
  const value = original.lot.items.reduce((total, item) => total + item.value, 0);
  assert.equal(game.bidders[0].wallet, 1200000 + value - 140001);
  assert.equal(game.lot.result.profit, value - 140001);
  for (let i = 1; i < 4; i++) assert.equal(game.bidders[i].wallet, original.bidders[i].wallet);
  assert.equal(publicView(game).items.length, original.lot.items.length);
  assert.ok(publicView(game).items.every(item => item.visibility === 'appraised' && item.name && item.value));
});

test('tools charge once each, reveal their promised information and leave sealed AI bids unchanged', () => {
  let state = createGame(); const sealed = copy(state.lot.lockedBids);
  const initialExact = publicView(state).items.filter(item => item.visibility === 'appraised').length;
  state = act(useTool(state, 'scan'));
  assert.equal(state.bidders[0].wallet, 1200000 - TOOLS[0].cost);
  assert.equal(publicView(state).items.filter(item => item.visibility === 'appraised').length, initialExact + 1);
  assert.equal(useTool(state, 'scan').ok, false);
  state = act(useTool(state, 'appraisal'));
  assert.equal(state.bidders[0].wallet, 1170000); assert.equal(state.lot.toolCost, 30000);
  const clue = state.lot.toolClues.find(clue => clue.rarity !== undefined);
  assert.equal(clue.value, state.lot.items.filter(item => item.rarity === clue.rarity).reduce((sum, item) => sum + item.value, 0));
  assert.equal(useTool(state, 'appraisal').ok, false); assert.deepEqual(state.lot.lockedBids, sealed);
  assert.equal(useTool(state, 'unknown').ok, false);
});

test('tools reject insufficient funds and postbid phases without any mutation', () => {
  const broke = createGame(); broke.bidders[0].wallet = 11999;
  assert.equal(useTool(broke, 'scan').ok, false); assert.equal(broke.bidders[0].wallet, 11999);
  const roundResult = act(submitBid(locked(createGame()), 100000));
  assert.equal(useTool(roundResult, 'scan').ok, false);
  const settled = act(submitBid(locked(createGame()), 140001));
  assert.equal(useTool(settled, 'appraisal').ok, false);
});

test('tool costs count even on a loss and in both lot/session accounting', () => {
  let state = act(useTool(createGame(), 'scan'));
  state = act(submitBid(locked(state, [300000, 100000, 100000]), 0));
  assert.equal(state.lot.result.profit, 0); assert.equal(state.lot.result.netProfit, -12000);
  assert.equal(publicView(state).profit, -12000); assert.equal(publicView(state).stats.totalProfit, -12000);
  assert.equal(publicView(state).stats.toolCost, 12000);
});

test('sealed AI bids are decided before human submission, regardless of amount', () => {
  const game = createGame({ seed: 77 }); const bids = copy(game.lot.lockedBids);
  const zero = act(submitBid(game, 0)); const rich = act(submitBid(game, 1200000));
  for (const [id, amount] of Object.entries(bids)) {
    assert.equal(zero.lot.history[0].bids.find(bid => bid.id === id).amount, amount);
    assert.equal(rich.lot.history[0].bids.find(bid => bid.id === id).amount, amount);
  }
});

test('AI estimates do not read unrevealed identities, prices, dimensions or item count', () => {
  let a = act(submitBid(locked(createGame({ seed: 831 })), 100000));
  const b = copy(a);
  const visible = new Set([...Object.keys(a.lot.publicSeen), ...Object.values(a.lot.privateSeen).flatMap(seen => Object.keys(seen)), ...a.lot.revealOrder.slice(a.lot.revealCursor, a.lot.revealCursor + 2)]);
  const hidden = b.lot.items.filter(item => !visible.has(item.id)); assert.ok(hidden.length > 0);
  for (const item of hidden) { item.value = 900000000; item.rarity = 5; item.w = 7; item.h = 7; item.kind = 'fictional'; }
  // This intentionally impossible additional item is not in any observation.
  b.lot.items.push({ ...hidden[0], id: 'secret-extra' });
  assert.deepEqual(act(nextRound(a)).lot.lockedBids, act(nextRound(b)).lot.lockedBids);
});

test('duplicate submits, advances and resolves cannot double charge or double pay', () => {
  let state = act(submitBid(locked(createGame()), 140001)); const before = copy(state);
  assert.equal(submitBid(state, 1).ok, false); assert.equal(nextRound(state).ok, false); assert.deepEqual(state, before);
  const next = act(nextLot(state)); assert.equal(next.lotIndex, 1);
  assert.equal(nextLot(next).ok, false); assert.equal(next.bidders[0].wallet, state.bidders[0].wallet);
  assert.equal(next.lot.toolsUsed.length, 0); assert.equal(next.lot.history.length, 0);
});

test('a full five-lot natural session reaches terminal state with no sixth lot', () => {
  let state = createGame({ seed: 99 });
  while (state.phase !== 'finished') {
    if (state.phase === 'bidding') state = act(submitBid(state, 0));
    else if (state.phase === 'round-result') state = act(nextRound(state));
    else state = act(nextLot(state));
  }
  assert.equal(state.lotIndex, 4); assert.equal(state.completedLots.length, 5);
  assert.equal(nextLot(state).ok, false); assert.equal(nextRound(state).ok, false); assert.equal(submitBid(state, 0).ok, false);
  assert.equal(useTool(state, 'scan').ok, false); assert.equal(publicView(state).stats.lotsCompleted, 5);
});

test('save/restore roundtrips every phase and entire natural session exactly', () => {
  let state = createGame({ seed: 'save-test', role: 'analyst' });
  while (true) {
    assert.deepEqual(act(restore(serialize(state))), state);
    if (state.phase === 'finished') break;
    if (state.phase === 'bidding') {
      if (!state.lot.toolsUsed.includes('scan')) state = act(useTool(state, 'scan'));
      assert.deepEqual(act(restore(serialize(state))), state);
      state = act(submitBid(state, 0));
    } else if (state.phase === 'round-result') state = act(nextRound(state));
    else state = act(nextLot(state));
  }
});

test('save validation rejects corruption, unknown keys/versions, impossible actions and unsafe numbers', () => {
  const valid = JSON.parse(serialize(createGame()));
  for (const raw of [null, undefined, 2, '', '{}', '{', '[]', 'null', 'x'.repeat(25001)]) assert.equal(restore(raw).ok, false);
  for (const patch of [{ version: 2 }, { seed: -1 }, { role: 'god' }, { checksum: 'bad' }, { wallet: 999999 }, { actions: [{}] }, { actions: new Array(111).fill({ type: 'nextRound' }) }]) {
    assert.equal(restore(JSON.stringify({ ...valid, ...patch })).ok, false);
  }
  for (const actions of [
    [{ type: 'nextRound' }], [{ type: 'nextLot' }], [{ type: 'bid', amount: -1 }],
    [{ type: 'bid', amount: 1200001 }], [{ type: 'bid', amount: 1, injected: true }],
    [{ type: 'tool', id: 'scan' }, { type: 'tool', id: 'scan' }], [{ type: '__proto__' }],
  ]) assert.equal(restore(recalculateChecksum({ ...valid, actions })).ok, false);
});

test('seeded simulation audit: bounded bids, exact ledger, both profits/losses and varied warehouse values', () => {
  let min = Infinity, max = -Infinity, wins = 0, losses = 0, early = 0, rounds = 0, net = 0;
  for (let seed = 0; seed < 150; seed++) {
    let state = createGame({ seed, role: ROLES[seed % 3].id });
    let expected = 1200000;
    while (state.phase !== 'finished') {
      if (state.phase === 'bidding') {
        for (const bidder of state.bidders.slice(1)) assert.ok(state.lot.lockedBids[bidder.id] <= bidder.wallet && state.lot.lockedBids[bidder.id] >= 0);
        // A deliberately modest fixed-prior strategy, no access to hidden total.
        const bid = Math.min(state.bidders[0].wallet, 270000 + state.lot.round * 20000);
        state = act(submitBid(state, bid)); rounds++;
        if (state.phase === 'lot-result') {
          const result = state.lot.result; expected += result.netProfit;
          assert.equal(state.bidders[0].wallet, expected);
          min = Math.min(min, result.lotValue); max = Math.max(max, result.lotValue);
          if (result.playerWon) { wins++; if (result.profit < 0) losses++; }
          early += Number(result.early);
        }
      } else if (state.phase === 'round-result') state = act(nextRound(state));
      else state = act(nextLot(state));
    }
    net += state.bidders[0].wallet - 1200000;
    assert.equal(publicView(state).stats.totalProfit, state.bidders[0].wallet - 1200000);
    assert.ok(state.bidders.every(bidder => Number.isSafeInteger(bidder.wallet) && bidder.wallet >= 0));
  }
  assert.ok(wins > 0 && losses > 0 && early > 0);
  assert.ok(max > min * 3);
  console.log('Simulation audit', { seeds: 150, lots: 750, wins, lossMakingWins: losses, early, meanRounds: +(rounds / 750).toFixed(2), minLotValue: min, maxLotValue: max, meanSessionNet: Math.round(net / 150) });
});

test('session profit includes paid tools immediately, before warehouse settlement', () => {
  const state = act(useTool(createGame(), 'scan'));
  assert.equal(publicView(state).profit, -12000);
  assert.equal(publicView(state).stats.totalProfit, -12000);
  assert.equal(publicView(state).stats.toolCost, 12000);
});

test('an observation-only conservative appraiser strategy can profit without guaranteeing wins', () => {
  const weights = [25, 27, 24, 14, 8, 2];
  let net = 0, wins = 0, profitableWins = 0, losingSessions = 0;
  for (let seed = 0; seed < 250; seed++) {
    let state = createGame({ seed, role: 'appraiser' });
    while (state.phase !== 'finished') {
      if (state.phase === 'bidding') {
        const view = publicView(state);
        const maximumRarity = view.items.find(item => item.visibility === 'appraised').rarity;
        const pool = CATALOG.filter(item => item.rarity <= maximumRarity);
        const average = entries => entries.reduce((sum, item) => sum + item.value * weights[item.rarity], 0) / entries.reduce((sum, item) => sum + weights[item.rarity], 0);
        let estimate = Math.max(0, 15 - view.items.length) * average(pool);
        for (const item of view.items) estimate += item.value ?? average(pool.filter(entry => entry.kind === item.kind && (item.rarity === undefined || entry.rarity === item.rarity)));
        const amount = Math.min(view.wallet, Math.floor(estimate * 0.9 / 1000) * 1000);
        state = act(submitBid(state, amount));
        if (state.phase === 'lot-result' && state.lot.result.playerWon) { wins++; if (state.lot.result.profit > 0) profitableWins++; }
      } else if (state.phase === 'round-result') state = act(nextRound(state));
      else state = act(nextLot(state));
    }
    const profit = publicView(state).profit; net += profit;
    if (profit < 0) losingSessions++;
  }
  assert.ok(net > 0 && wins > 50 && profitableWins > wins / 2 && losingSessions > 0);
  console.log('Observation-only strategy audit', { seeds: 250, lots: 1250, wins, profitableWins, losingSessions, meanSessionNet: Math.round(net / 250) });
});
