import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, HEROES, RELICS, MAPS, WAVE_CONFIG, COLS, ROWS, MAX_EFFECTS, MAX_HEROES, isBuildable, heroStats, wavePreview, mergePreview } from '../engine.js';

function freeCells(game) {
  const path = MAPS[game.state.mapIndex].path;
  const cells = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (game.isBuildable(x, y) && !game.heroAt(x, y)) {
      const score = path.reduce((sum, p) => sum + (Math.hypot(x - p[0], y - p[1]) < 1.7 ? 1 : 0), 0) + (y === 9 ? 0.5 : 0);
      cells.push({ x, y, score });
    }
  }
  return cells.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
}
function forceEnd(game, wave) {
  game.state.wave = wave; game.state.phase = 'battle';
  game.state.spawnQueue = []; game.state.enemies = [];
  game.update(1 / 60);
}
function army(game) {
  const s = game.state;
  let guard = 0;
  while (s.gold >= 50 && guard++ < 70) {
    if (s.heroes.length >= 12) {
      const a = s.heroes.find(a => a.level < 6 && s.heroes.some(b => a !== b && a.type === b.type && a.level === b.level));
      if (a) {
        const b = s.heroes.find(b => b !== a && b.type === a.type && b.level === a.level);
        assert.equal(game.merge(a.id, b.id), true);
        continue;
      }
    }
    const cell = freeCells(game)[0];
    if (!cell) break;
    const type = s.heroes.filter(h => h.type === 'frost').length < 2 && s.gold >= 70 ? 'frost'
      : s.heroes.filter(h => h.type === 'thunder').length < 2 && s.gold >= 80 ? 'thunder'
      : s.heroes.filter(h => h.type === 'fire').length < 3 && s.gold >= 60 ? 'fire' : 'blade';
    if (!game.buy(type, cell.x, cell.y)) break;
  }
}
function campaign(seed, mode, route = 0) {
  const g = new Game(seed, mode);
  assert.ok(g.buy('blade', 2, 2)); assert.ok(g.buy('blade', 6, 4)); assert.ok(g.buy('fire', 3, 9));
  let ticks = 0;
  const transitions = [];
  while (!['won', 'lost'].includes(g.state.phase) && ticks < 12000) {
    const s = g.state;
    if (s.phase === 'build') { army(g); assert.ok(g.startWave()); transitions.push(`wave${s.wave}`); }
    else if (s.phase === 'reward') {
      transitions.push(`reward${s.wave}`);
      assert.ok(g.chooseRelic(['sharp', 'haste', 'winter', 'reach', 'bounty', 'ember', 'fortress', 'hatchery'].find(id => s.choices.includes(id))));
    } else if (s.phase === 'route') { transitions.push(`route${s.wave}`); assert.ok(g.chooseRoute(route)); }
    g.update(0.1); ticks++;
    assert.ok(s.effects.length <= MAX_EFFECTS);
    assert.ok(s.heroes.length <= MAX_HEROES);
    assert.ok(s.gold >= 0);
  }
  return { game: g, transitions, seconds: ticks / 10 };
}

test('constants expose four heroes, eight relics, three legal continuous maps', () => {
  assert.deepEqual(Object.keys(HEROES), ['blade', 'fire', 'frost', 'thunder']);
  assert.equal(Object.keys(RELICS).length, 8); assert.equal(MAPS.length, 3); assert.equal(WAVE_CONFIG.length, 8);
  for (const [index, map] of MAPS.entries()) {
    assert.ok(map.path.length >= 25); assert.ok(map.eggPath.length >= 5);
    const keys = new Set();
    for (const path of [map.path, map.eggPath]) {
      for (let i = 0; i < path.length; i++) {
        const [x, y] = path[i];
        assert.ok(x >= 0 && x < COLS && y >= 0 && y < ROWS);
        assert.equal(isBuildable(x, y, index), false);
        assert.equal(keys.has(`${x},${y}`), false); keys.add(`${x},${y}`);
        if (i) assert.equal(Math.abs(x - path[i - 1][0]) + Math.abs(y - path[i - 1][1]), 1);
      }
    }
  }
});

test('placement enforces grass, occupancy, budget and integer bounds', () => {
  const g = new Game();
  assert.equal(g.state.gold, 180); assert.equal(g.state.eggs.length, 1);
  assert.equal(g.buy('blade', 1, 0), false); assert.equal(g.buy('blade', 3, 10), false);
  assert.equal(g.buy('blade', -1, 0), false); assert.equal(g.buy('blade', 9, 0), false);
  assert.equal(g.buy('blade', 0.5, 0), false); assert.equal(g.buy('unknown', 2, 2), false);
  assert.equal(g.buy('blade', 2, 2), true); assert.equal(g.state.gold, 130);
  assert.equal(g.buy('blade', 2, 2), false); assert.equal(g.state.gold, 130);
  assert.equal(g.buy('thunder', 2, 4), true); assert.equal(g.state.gold, 50);
  assert.equal(g.buy('fire', 3, 4), false); assert.equal(g.state.gold, 50);
  assert.match(g.state.lastMessage, /不足/);
});

test('select supports selection and placement alias; no wave without heroes', () => {
  const g = new Game();
  assert.equal(g.startWave(), false);
  assert.equal(g.select('fire'), true); assert.equal(g.state.selectedType, 'fire');
  assert.equal(g.select('blade', 2, 2), true); assert.equal(g.state.heroes.length, 1);
  assert.equal(g.startWave(), true); assert.equal(g.startWave(), false);
});

test('wave previews exactly match every scheduled and spawned enemy on all routes', () => {
  // Fixed pre-preview balance fixtures: normal, runner, armored, splitter, boss.
  const expectedCounts = [
    [13, 3, 0, 0, 0], [14, 3, 4, 0, 0], [16, 2, 4, 3, 0], [18, 3, 4, 3, 1],
    [21, 3, 6, 4, 0], [25, 3, 6, 4, 0], [28, 3, 7, 5, 0], [29, 4, 8, 5, 2],
  ];
  for (let mapIndex = 0; mapIndex < MAPS.length; mapIndex++) {
    for (let wave = 1; wave <= WAVE_CONFIG.length; wave++) {
      const g = new Game(); g.state.mapIndex = mapIndex; g.state.wave = wave - 1;
      const cell = freeCells(g)[0]; assert.ok(g.buy('blade', cell.x, cell.y));
      const before = g.serialize(), preview = wavePreview(wave, mapIndex);
      assert.deepEqual(g.serialize(), before, 'preview does not mutate the game');
      assert.equal(preview.wave, wave); assert.equal(preview.mapIndex, mapIndex);
      assert.equal(preview.count, WAVE_CONFIG[wave - 1].count);
      assert.deepEqual(Object.values(preview.counts), expectedCounts[wave - 1]);
      assert.equal(preview.bossCount, preview.counts.boss);
      assert.equal(Object.values(preview.counts).reduce((sum, count) => sum + count, 0), preview.count);
      assert.deepEqual(preview.types, Object.keys(preview.counts).filter(type => preview.counts[type] > 0));
      assert.equal(preview.baseHp, Math.round(WAVE_CONFIG[wave - 1].hp * MAPS[mapIndex].healthMultiplier));
      assert.ok(preview.tips.length > 0 && preview.tips.every(tip => typeof tip === 'string' && /[\u3400-\u9fff]/u.test(tip)));
      assert.equal(preview.tips.some(tip => tip.includes('首领')), preview.bossCount > 0);
      assert.equal(preview.tips.some(tip => tip.includes('碎片')), preview.counts.splitter > 0);
      assert.ok(g.startWave()); assert.deepEqual(g.state.spawnQueue, preview.schedule);
      // Stop attacks so all scheduled spawns remain observable without kill-born shards.
      g.state.heroes = []; g.state.eggs = [];
      for (let ticks = 0; g.state.spawnQueue.length && ticks < 200; ticks++) g.update(0.1);
      assert.equal(g.state.spawnQueue.length, 0);
      assert.deepEqual(g.state.enemies.map(enemy => enemy.type), preview.schedule);
      assert.ok(g.state.enemies.filter(enemy => enemy.type === 'normal').every(enemy => enemy.maxHp === preview.baseHp));
    }
  }
});

test('wave previews are independent values, reject invalid indices and preserve boss positions', () => {
  assert.deepEqual(wavePreview(1), wavePreview(1, 0));
  const first = wavePreview(8), pristine = structuredClone(first);
  first.schedule[0] = 'boss'; first.counts.normal = 0; first.types.push('shard'); first.tips.length = 0;
  assert.deepEqual(wavePreview(8), pristine);
  assert.deepEqual(wavePreview(4).schedule.flatMap((type, i) => type === 'boss' ? [i] : []), [28]);
  assert.deepEqual(wavePreview(8).schedule.flatMap((type, i) => type === 'boss' ? [i] : []), [40, 47]);
  for (const wave of [undefined, null, 0, -1, 9, 1.5, '1', NaN, Infinity]) assert.equal(wavePreview(wave), null);
  for (const mapIndex of [null, -1, 3, 0.5, '0', NaN, Infinity]) assert.equal(wavePreview(1, mapIndex), null);
});

test('move is safe during build and battle; cannot occupy roads or other heroes', () => {
  const g = new Game(); g.buy('blade', 2, 2); g.buy('blade', 3, 2);
  const h = g.state.heroes[0];
  assert.equal(g.move(h.id, 3, 2), false); assert.equal(g.move(h.id, 1, 2), false);
  assert.equal(g.move(h.id, 4, 2), true); assert.equal(h.x, 4);
  assert.equal(g.move(h.id, 4, 2), true);
  g.startWave(); assert.equal(g.move(h.id, 5, 2), true);
  assert.equal(g.buy('blade', 2, 2), true);
});

test('merge is guaranteed, type-and-level exact, capped, and preserves investment', () => {
  const g = new Game(); g.state.gold = 1000;
  g.buy('blade', 2, 2); g.buy('blade', 3, 2); g.buy('fire', 4, 2);
  const [a, b, c] = g.state.heroes;
  assert.equal(g.merge(a.id, a.id), false); assert.equal(g.merge(a.id, c.id), false);
  const gold = g.state.gold;
  assert.equal(g.merge(a.id, b.id), true); assert.equal(b.level, 2); assert.equal(b.invested, 100);
  assert.equal(g.state.gold, gold); assert.equal(g.state.heroes.length, 2); assert.equal(g.state.stats.merges, 1);
  assert.ok(g.state.effects.some(fx => fx.type === 'merge'));
  g.buy('blade', 2, 2); const d = g.state.heroes.at(-1);
  assert.equal(g.merge(d.id, b.id), false);
  b.level = 6; d.level = 6; assert.equal(g.merge(d.id, b.id), false);
  g.state.phase = 'reward'; assert.equal(g.merge(d.id, b.id), false);
});

test('merge preview is pure and matches actual upgraded stats at every level and class', () => {
  for (const type of Object.keys(HEROES)) for (let level = 1; level < 6; level++) {
    for (const relics of [[], ['sharp', 'haste', 'reach'], ['fortress', 'ember', 'winter']]) {
      const g = new Game(); g.state.relics = relics.slice();
      const a = g._addHero(type, 2, 2, level), b = g._addHero(type, 3, 2, level);
      const before = g.serialize();
      const preview = mergePreview(Object.freeze({ ...a }), Object.freeze({ ...b }), Object.freeze(relics.slice()));
      assert.deepEqual(g.serialize(), before);
      assert.equal(preview.eligible, true); assert.equal(preview.reason, ''); assert.equal(preview.level, level + 1);
      assert.deepEqual(preview.nextStats, heroStats({ type, level: level + 1 }, relics));
      assert.ok(g.merge(a.id, b.id)); assert.equal(b.level, preview.level);
      assert.deepEqual(g.heroStats(b), preview.nextStats);
      preview.nextStats.damage = -1;
      assert.ok(g.heroStats(b).damage > 0, 'returned stats are detached from game state');
    }
  }
});

test('merge preview explains missing, self, mismatched and capped merges without mutations', () => {
  const blade = Object.freeze({ id: 'h1', type: 'blade', level: 1 });
  const cases = [
    [null, blade, /两位/], [blade, undefined, /两位/], [blade, blade, /两位/],
    [blade, { ...blade }, /两位/],
    [blade, { id: 'h2', type: 'fire', level: 1 }, /职业和等级/],
    [blade, { id: 'h2', type: 'blade', level: 2 }, /职业和等级/],
    [{ type: 'blade', level: 6 }, { type: 'blade', level: 6 }, /6 级/],
    [{ type: 'toString', level: 1 }, { type: 'toString', level: 1 }, /职业和等级/],
    [{ type: 'blade', level: 0 }, { type: 'blade', level: 0 }, /职业和等级/],
    [{ type: 'blade', level: 1.5 }, { type: 'blade', level: 1.5 }, /职业和等级/],
  ];
  for (const [a, b, reason] of cases) {
    const before = structuredClone([a, b]), preview = mergePreview(a, b);
    assert.equal(preview.eligible, false); assert.match(preview.reason, reason);
    assert.equal(preview.level, null); assert.equal(preview.nextStats, null);
    assert.deepEqual([a, b], before);
  }
  // Distinct stat-only hero descriptions do not require game IDs.
  assert.equal(mergePreview({ type: 'blade', level: 1 }, { type: 'blade', level: 1 }).eligible, true);
  const g = new Game(); g.buy('blade', 2, 2); g.buy('fire', 3, 2);
  const [a, b] = g.state.heroes, preview = mergePreview(a, b);
  assert.equal(g.merge(a.id, b.id), false); assert.equal(g.state.lastMessage, preview.reason);
});

test('sell returns 65% of total invested cost, cannot duplicate refund', () => {
  const g = new Game(); g.buy('blade', 2, 2); g.buy('blade', 3, 2);
  const [a, b] = g.state.heroes; g.merge(a.id, b.id);
  assert.ok(g.sell(b.id)); assert.equal(g.state.gold, 145); assert.equal(g.state.heroes.length, 0);
  assert.equal(g.sell(b.id), false); assert.equal(g.state.gold, 145);
});

test('stats improve by level, all classes available, relic effects are reflected', () => {
  for (const type of Object.keys(HEROES)) {
    const one = heroStats({ type, level: 1 }), two = heroStats({ type, level: 2 });
    assert.ok(two.damage > one.damage); assert.ok(two.blades > one.blades); assert.ok(two.period < one.period);
    assert.ok(one.range > 1.5 && one.range < 2);
  }
  const hero = { type: 'blade', level: 1 }, base = heroStats(hero), buffed = heroStats(hero, ['sharp', 'haste', 'reach', 'fortress']);
  assert.ok(buffed.damage > base.damage * 1.25); assert.ok(buffed.period < base.period); assert.ok(buffed.range > base.range);
});

test('weapon damage requires physical swept contact, not mere proximity', () => {
  const g = new Game(); g.buy('blade', 2, 2); const hero = g.state.heroes[0], stats = g.heroStats(hero);
  const target = { id: 'e-test', type: 'normal', hp: 100, maxHp: 100, x: 2 + stats.orbit, y: 2, radius: 0.29, armor: 0, hitMemory: {}, dead: false };
  g.state.battleTime = 10;
  assert.equal(g._contact(hero, target, stats, Math.PI, 0.1), false); assert.equal(target.hp, 100);
  assert.equal(g._contact(hero, target, stats, -0.08, 0.1), true); assert.equal(target.hp, 86);
  assert.equal(g._contact(hero, target, stats, -0.08, 0.1), false); assert.equal(target.hp, 86);
  g.state.battleTime += stats.period;
  assert.equal(g._contact(hero, target, stats, -0.08, 0.1), true);
});

test('specialists burn, slow and chain; armor reduces damage; splitters produce two shards', () => {
  for (const type of ['fire', 'frost', 'thunder']) {
    const g = new Game(); g.buy(type, 2, 2); g.startWave();
    const hero = g.state.heroes[0], target = g._spawnEnemy('normal', 3), neighbor = g._spawnEnemy('normal', 3.2);
    const hp = neighbor.hp;
    g._hit(target, 5, hero);
    if (type === 'fire') { assert.ok(target.burnDamage > 0); assert.ok(neighbor.hp < hp); }
    if (type === 'frost') { assert.equal(target.slowFactor, 0.52); assert.ok(target.slowUntil > 0); }
    if (type === 'thunder') { assert.ok(neighbor.hp < hp); assert.ok(g.state.effects.some(e => e.type === 'chain')); }
  }
  const g = new Game(); g.buy('blade', 2, 2); g.startWave();
  const target = g._spawnEnemy('armored', 3), hp = target.hp;
  g._hit(target, 10, g.state.heroes[0]); assert.ok(hp - target.hp < 10);
  const splitter = g._spawnEnemy('splitter', 5); g._hit(splitter, 1000, g.state.heroes[0]);
  assert.equal(g.state.enemies.filter(e => e.type === 'shard').length, 2);
});

test('egg hatches an actual level-one hero on free grass and compensates full field', () => {
  const g = new Game(); const egg = g.state.eggs[0];
  g._hit(egg, 1000, null);
  assert.equal(g.state.stats.hatched, 1); assert.equal(g.state.heroes.length, 1);
  assert.equal(g.state.heroes[0].level, 1); assert.ok(g.isBuildable(g.state.heroes[0].x, g.state.heroes[0].y));
  assert.ok(g.state.effects.some(f => f.type === 'hatch'));
  while (g.state.heroes.length < MAX_HEROES) { const cell = freeCells(g)[0]; g._addHero('blade', cell.x, cell.y); }
  g._spawnEgg(); const before = g.state.gold; g._hit(g.state.eggs.at(-1), 1000, null);
  assert.equal(g.state.gold, before + 45); assert.equal(g.state.heroes.length, MAX_HEROES);
});

test('roguelike transitions cover rewards on 2/4/6, routes on 3/6, win on 8', () => {
  const g = new Game(1); g.buy('blade', 2, 2);
  forceEnd(g, 1); assert.equal(g.state.phase, 'build');
  forceEnd(g, 2); assert.equal(g.state.phase, 'reward'); assert.equal(g.state.choices.length, 3);
  assert.equal(g.chooseRelic('invalid'), false); assert.equal(g.startWave(), false); assert.equal(g.buy('blade', 3, 2), false);
  const chosen = g.state.choices[0]; assert.ok(g.chooseRelic(chosen)); assert.equal(g.state.phase, 'build');
  forceEnd(g, 3); assert.equal(g.state.phase, 'route'); assert.equal(g.chooseRoute(99), false);
  assert.ok(g.chooseRoute('1')); assert.equal(g.state.stage, 2); assert.equal(g.state.mapIndex, 1);
  forceEnd(g, 4); assert.equal(g.state.phase, 'reward'); assert.ok(!g.state.choices.includes(chosen)); g.chooseRelic(g.state.choices[0]);
  forceEnd(g, 5); assert.equal(g.state.phase, 'build');
  forceEnd(g, 6); assert.equal(g.state.phase, 'reward'); g.chooseRelic(g.state.choices[0]); assert.equal(g.state.phase, 'route');
  assert.ok(g.chooseRoute(2)); assert.equal(g.state.stage, 3);
  forceEnd(g, 7); assert.equal(g.state.phase, 'build');
  forceEnd(g, 8); assert.equal(g.state.phase, 'won'); assert.equal(g.state.stats.wavesCleared, 8);
  assert.equal(g.startWave(), false); assert.equal(g.chooseRoute(0), false); assert.equal(g.chooseRelic(chosen), false);
});

test('classic is an independent eight-wave campaign without choice menus', () => {
  const g = new Game(1, 'classic'); g.buy('blade', 2, 2);
  for (let wave = 1; wave <= 8; wave++) { forceEnd(g, wave); assert.equal(g.state.phase, wave === 8 ? 'won' : 'build'); }
  assert.equal(g.state.relics.length, 0); assert.equal(g.state.stage, 1); assert.equal(g.state.mode, 'classic');
});

test('route remaps every hero to legal unique grass and preserves IDs, levels, and classes', () => {
  const g = new Game();
  while (g.state.heroes.length < MAX_HEROES) { const cell = freeCells(g)[0]; g._addHero('blade', cell.x, cell.y); }
  const ids = g.state.heroes.map(h => h.id).sort();
  forceEnd(g, 3); g.chooseRoute(1);
  assert.deepEqual(g.state.heroes.map(h => h.id).sort(), ids);
  assert.equal(new Set(g.state.heroes.map(h => `${h.x},${h.y}`)).size, MAX_HEROES);
  assert.ok(g.state.heroes.every(h => g.isBuildable(h.x, h.y)));
});

test('reward direct effects and route tradeoffs are meaningful', () => {
  const g = new Game(); g.state.phase = 'reward'; g.state.choices = ['bounty'];
  assert.ok(g.chooseRelic('bounty')); assert.equal(g.state.gold, 230);
  g.state.phase = 'reward'; g.state.choices = ['fortress']; g.state.lives = 8;
  assert.ok(g.chooseRelic('fortress')); assert.equal(g.state.lives, 12);
  assert.ok(MAPS[1].healthMultiplier > 1 && MAPS[1].goldMultiplier > 1);
  assert.ok(MAPS[2].healthMultiplier < 1 && MAPS[2].goldMultiplier < 1);
});

test('effects are bounded and expire, including after a terminal result', () => {
  const g = new Game();
  for (let i = 0; i < 1000; i++) g._effect('hit', 1, 1, { value: i });
  assert.equal(g.state.effects.length, MAX_EFFECTS);
  g.state.phase = 'won'; g.update(2); assert.equal(g.state.effects.length, 0);
});

test('seeded simulations and choices are deterministic', () => {
  const a = new Game(456), b = new Game(456);
  for (const g of [a, b]) { g.buy('blade', 2, 2); g.buy('fire', 6, 4); g.startWave(); }
  for (let i = 0; i < 100; i++) { a.update(0.1); b.update(0.1); }
  assert.deepEqual(a.serialize(), b.serialize());
  forceEnd(a, 2); forceEnd(b, 2); assert.deepEqual(a.state.choices, b.state.choices);
  const c = new Game(457); c.buy('blade', 2, 2); assert.notEqual(c.state.heroes[0].angle, a.state.heroes[0].angle);
});

test('save/restore resumes exact battle, transient contacts, effects, and PRNG', () => {
  const original = new Game(678, 'classic'); original.buy('blade', 2, 2); original.buy('fire', 6, 4); original.startWave();
  for (let i = 0; i < 137; i++) original.update(0.1);
  const objectSave = original.serialize(), restored = Game.restore(JSON.stringify(objectSave));
  assert.deepEqual(restored.serialize(), objectSave);
  restored.state.gold++; assert.notEqual(restored.state.gold, original.state.gold); restored.state.gold--;
  for (let i = 0; i < 240; i++) { original.update(0.05); restored.update(0.05); }
  assert.deepEqual(restored.serialize(), original.serialize());
  assert.throws(() => Game.restore({ version: 9 }), /版本/);
  const broken = original.serialize(); broken.state.gold = -1; assert.throws(() => Game.restore(broken), /无效/);
});

test('invalid or zero elapsed time does not advance the simulation', () => {
  const g = new Game(), before = g.serialize();
  for (const dt of [0, -1, Infinity, NaN, undefined]) g.update(dt);
  assert.deepEqual(g.serialize(), before);
});

test('unattended weak placement can lose; no income or kill reward is awarded for leaks', () => {
  const g = new Game(321, 'classic'); g.buy('blade', 8, 10); g.startWave();
  g.state.heroes = []; g.state.eggs = [];
  const before = g.state.gold;
  for (let i = 0; i < 1500 && g.state.phase === 'battle'; i++) g.update(0.1);
  assert.equal(g.state.phase, 'lost'); assert.equal(g.state.lives, 0); assert.equal(g.state.stats.kills, 0);
  assert.equal(g.state.gold, before); assert.equal(g.startWave(), false);
});

for (const mode of ['classic', 'roguelike']) {
  test(`${mode}: entire unmodified eight-wave campaign is winnable with earned money and ordinary placement/merge`, () => {
    const { game: g, transitions, seconds } = campaign(123, mode);
    assert.equal(g.state.phase, 'won'); assert.equal(g.state.wave, 8); assert.ok(g.state.lives > 0);
    assert.ok(g.state.stats.kills > 250); assert.equal(g.state.stats.bosses, 3);
    assert.ok(g.state.stats.hatched >= 1); assert.ok(g.state.stats.merges >= 10); assert.ok(g.state.stats.highestLevel >= 4);
    assert.ok(seconds > 90 && seconds < 900);
    assert.equal(g.state.stats.wavesCleared, 8);
    if (mode === 'roguelike') {
      assert.equal(g.state.relics.length, 3); assert.equal(g.state.stage, 3);
      assert.ok(transitions.includes('reward2') && transitions.includes('reward4') && transitions.includes('reward6'));
      assert.ok(transitions.includes('route3') && transitions.includes('route6'));
    } else assert.equal(g.state.relics.length, 0);
  });
}

test('both alternate routes remain winnable with the same transparent strategy', () => {
  for (const route of [1, 2]) {
    const { game } = campaign(42, 'roguelike', route);
    assert.equal(game.state.phase, 'won', `route ${route}: ${game.state.lastMessage}`);
    assert.equal(game.state.stage, 3);
  }
});

test('restore rejects every missing required container, counter, mode and timer', () => {
  const save = new Game().serialize();
  for (const key of ['phase', 'mode', 'mapIndex', 'stage', 'wave', 'totalWaves', 'gold', 'lives', 'maxLives', 'seed', 'rng', 'nextId', 'lastMessage', 'selectedType', 'pendingRoute', 'time', 'battleTime', 'waveElapsed', 'accumulator', 'spawnTimer', 'heroes', 'enemies', 'eggs', 'effects', 'relics', 'choices', 'spawnQueue', 'stats']) {
    const bad = structuredClone(save); delete bad.state[key];
    assert.throws(() => Game.restore(bad), undefined, `missing ${key}`);
  }
  for (const key of Object.keys(save.state.stats)) {
    const bad = structuredClone(save); delete bad.state.stats[key];
    assert.throws(() => Game.restore(bad), undefined, `missing stats.${key}`);
  }
});

test('restore rejects malformed entities, non-finite numbers, duplicate positions and unsafe lookup keys', () => {
  const g = new Game(); g.buy('blade', 2, 2); g.buy('fire', 3, 2); g.startWave(); g.update(1);
  const save = g.serialize();
  const mutations = [
    s => { s.effects = null; }, s => { s.stats = []; }, s => { s.choices = ['invalid']; },
    s => { s.wave = 0; }, s => { s.mode = 'invalid'; }, s => { s.gold = '100'; },
    s => { s.battleTime = NaN; }, s => { s.spawnTimer = Infinity; }, s => { s.nextId = 1; },
    s => { s.heroes[0].angle = NaN; }, s => { s.heroes[0].type = 'toString'; },
    s => { s.heroes[1].x = s.heroes[0].x; s.heroes[1].y = s.heroes[0].y; },
    s => { s.heroes[1].id = s.heroes[0].id; }, s => { s.heroes[0].cooldown = undefined; },
    s => { s.enemies[0].hp = NaN; }, s => { s.enemies[0].hitMemory = null; },
    s => { s.enemies[0].speed = -1; }, s => { s.enemies[0].type = 'invalid'; },
    s => { s.eggs[0].progress = Infinity; }, s => { s.eggs[0].radius = 'small'; },
    s => { s.spawnQueue.push('invalid'); }, s => { s.relics.push('toString'); },
    s => { s.selectedType = 'constructor'; },
  ];
  for (const mutate of mutations) {
    const bad = structuredClone(save); mutate(bad.state);
    assert.throws(() => Game.restore(bad));
  }
  assert.equal(g.buy('toString', 4, 2), false); assert.equal(g.select('constructor'), false);
  assert.equal(isBuildable(2, 2, 'map'), false);
  const restored = Game.restore(save); assert.doesNotThrow(() => restored.update(0.2));
});

test('capped fire explosions affect at most three secondary targets', () => {
  const g = new Game(); g.buy('fire', 2, 2); g.startWave();
  const primary = g._spawnEnemy('normal', 3), neighbors = Array.from({ length: 10 }, (_, i) => g._spawnEnemy('normal', 3 + (i + 1) * 0.03));
  g._hit(primary, 1, g.state.heroes[0]);
  assert.equal(neighbors.filter(e => e.hp < e.maxHp).length, 3);
});

test('fixed simulation is identical at 60 FPS, 30 FPS, and batched updates', () => {
  const games = [new Game(444), new Game(444), new Game(444)];
  for (const game of games) { game.buy('blade', 2, 2); game.buy('fire', 6, 4); game.startWave(); }
  for (let i = 0; i < 1200; i++) games[0].update(1 / 60);
  for (let i = 0; i < 600; i++) games[1].update(1 / 30);
  for (let i = 0; i < 40; i++) games[2].update(0.5);
  assert.deepEqual(games[0].serialize(), games[1].serialize());
  assert.deepEqual(games[1].serialize(), games[2].serialize());
});
