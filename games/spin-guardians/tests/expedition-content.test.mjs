import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TALENTS, RELICS_LONG, REACTIONS, COMBOS, ENEMIES, BOSSES,
  CHAPTERS, EVENTS, SHOP_ITEMS, CAMP_OPTIONS, ROUTES, getEncounter,
} from '../content.js';

const CLASSES = ['blade', 'fire', 'frost', 'thunder'];
const ORIGINAL_RELICS = ['sharp', 'haste', 'reach', 'bounty', 'hatchery', 'fortress', 'winter', 'ember'];
const RANK_EFFECT_KEYS = new Set([
  'damage', 'rotation', 'range', 'income', 'eggDamage', 'activeCooldown',
  'splashDamage', 'armorPierce', 'bossDamage', 'burnDamage', 'burnDuration',
  'reactionDamage', 'reactionWindow', 'slowStrength', 'slowDuration',
  'slowedDamage', 'chainTargets', 'chainDamage', 'comboCooldown', 'comboDamage',
  'goldOnAcquire', 'healOnAcquire', 'enemySlow', 'allBurn', 'executeDamage',
  'activeDuration', 'maxLives', 'healOnBoss', 'waveGold', 'hatchGold',
]);
const NODE_EFFECT_KEYS = new Set(['gold', 'heal', 'lives', 'talentPoints', 'egg', 'relic', 'hero', 'heroLevel']);
const COMBAT_EFFECT_KEYS = new Set(['damage', 'radius', 'burn', 'duration', 'armorPierce', 'slow', 'stun', 'targets', 'armorBreak']);
const pairs = CLASSES.flatMap((type, i) => CLASSES.slice(i + 1).map(other => [type, other].sort().join(':')));

function assertCatalog(catalog) {
  assert.ok(Object.isFrozen(catalog));
  for (const [id, entry] of Object.entries(catalog)) {
    assert.equal(String(entry.id), id);
    assert.equal(typeof entry.name, 'string'); assert.ok(entry.name.length > 0);
    assert.equal(typeof entry.icon, 'string'); assert.ok(entry.icon.length > 0);
    assert.equal(typeof entry.description, 'string'); assert.ok(entry.description.length > 0);
    assert.ok(Object.isFrozen(entry));
  }
}

function assertNodeEffects(entry) {
  assert.ok(entry.effects && typeof entry.effects === 'object');
  for (const [key, value] of Object.entries(entry.effects)) {
    assert.ok(NODE_EFFECT_KEYS.has(key), `unknown node effect: ${key}`);
    if (key === 'relic') assert.ok(value === 'random' || RELICS_LONG[value]);
    else if (key === 'hero') assert.ok(value === 'random' || CLASSES.includes(value));
    else assert.ok(Number.isFinite(value) && Number.isInteger(value), `${key} must be an integer`);
  }
  if (entry.effects.gold < 0) assert.ok(entry.requirements.gold >= -entry.effects.gold, entry.id);
  if (entry.effects.lives < 0) assert.ok(entry.requirements.minLives > -entry.effects.lives, entry.id);
  if (entry.effects.hero) assert.ok(entry.effects.heroLevel >= 1 && entry.effects.heroLevel <= 6);
}

test('all content catalogs are named, described, keyed, immutable records', () => {
  for (const catalog of [TALENTS, RELICS_LONG, REACTIONS, COMBOS, ENEMIES, BOSSES, CHAPTERS, EVENTS, SHOP_ITEMS, CAMP_OPTIONS, ROUTES]) assertCatalog(catalog);
});

test('six global talents and four mutually exclusive rank-three class pairs', () => {
  assert.equal(Object.keys(TALENTS).length, 14);
  const globals = Object.values(TALENTS).filter(t => !t.class);
  assert.equal(globals.length, 6);
  assert.ok(globals.every(t => t.group === 'global' && t.branch === null));
  for (const type of CLASSES) {
    const branches = Object.values(TALENTS).filter(t => t.class === type);
    assert.equal(branches.length, 2, type);
    assert.equal(branches[0].excludes, branches[1].id);
    assert.equal(branches[1].excludes, branches[0].id);
    assert.notEqual(branches[0].branch, branches[1].branch);
    assert.ok(branches.every(t => t.group === type && t.requirement));
    assert.notDeepEqual(branches[0].effects, branches[1].effects);
  }
  const spendable = globals.reduce((sum, t) => sum + t.maxRank, 0) + CLASSES.reduce((sum, type) => sum + Object.values(TALENTS).find(t => t.class === type).maxRank, 0);
  assert.equal(spendable, 30, 'six globals and one branch per class provide 30 usable ranks');
});

test('24 genuinely rankable relics preserve the original eight IDs', () => {
  assert.equal(Object.keys(RELICS_LONG).length, 24);
  for (const id of ORIGINAL_RELICS) assert.ok(RELICS_LONG[id]);
  for (const relic of Object.values(RELICS_LONG)) assert.ok(relic.tags.length >= 1);
});

test('every rank effect is a finite positive additive modifier and has a declared consumer category', () => {
  const encountered = new Set();
  for (const entry of [...Object.values(TALENTS), ...Object.values(RELICS_LONG)]) {
    assert.equal(entry.maxRank, 3, entry.id);
    assert.ok(Object.keys(entry.effects).length > 0, entry.id);
    for (const [key, value] of Object.entries(entry.effects)) {
      assert.ok(RANK_EFFECT_KEYS.has(key), `${entry.id}.${key} has no supported consumer`);
      assert.ok(Number.isFinite(value) && value > 0, `${entry.id}.${key}`);
      assert.equal(value * entry.maxRank, value * 3, `${entry.id} rank 3 is numerically reachable`);
      encountered.add(key);
    }
  }
  assert.deepEqual([...encountered].sort(), [...RANK_EFFECT_KEYS].sort(), 'no unowned or misspelled modifier keys');
});

test('six reactions and six equip-able combos cover each unordered class pair exactly once', () => {
  for (const catalog of [REACTIONS, COMBOS]) {
    assert.equal(Object.keys(catalog).length, 6);
    const actualPairs = Object.values(catalog).map(entry => {
      assert.equal(entry.classes.length, 2);
      assert.notEqual(entry.classes[0], entry.classes[1]);
      assert.ok(entry.classes.every(type => CLASSES.includes(type)));
      assert.ok(entry.requirement.length > 0);
      for (const [key, value] of Object.entries(entry.effects)) {
        assert.ok(COMBAT_EFFECT_KEYS.has(key), `${entry.id}.${key}`);
        assert.ok(Number.isFinite(value) && value > 0);
      }
      return [...entry.classes].sort().join(':');
    });
    assert.deepEqual(actualPairs.sort(), [...pairs].sort());
  }
  for (const reaction of Object.values(REACTIONS)) {
    assert.equal(reaction.cooldown, 1.2);
    assert.equal(reaction.markDuration, 3);
    assert.ok(reaction.counter);
  }
  for (const combo of Object.values(COMBOS)) {
    assert.equal(combo.requiredLevel, 3);
    assert.ok(combo.cooldown >= 8 && combo.cooldown <= 12);
    assert.ok(!combo.effects.targets || combo.effects.targets <= 6);
  }
});

test('five six-wave chapters have distinct bosses and sequential enemy introductions', () => {
  assert.equal(Object.keys(CHAPTERS).length, 5);
  assert.equal(Object.keys(BOSSES).length, 5);
  assert.equal(new Set(Object.values(BOSSES).map(b => b.mechanic)).size, 5);
  for (let chapter = 1; chapter <= 5; chapter++) {
    const data = CHAPTERS[chapter], boss = BOSSES[data.bossId];
    assert.deepEqual(data.waves, [(chapter - 1) * 6 + 1, chapter * 6]);
    assert.equal(data.bossName, boss.name);
    assert.ok(data.counter && boss.counter);
    assert.equal(boss.warning, 2);
    assert.equal(boss.phaseAt, 0.5);
    assert.equal(boss.interruptible, true);
    for (const id of data.introduced) {
      assert.ok(ENEMIES[id]);
      assert.ok(ENEMIES[id].introducedWave >= data.waves[0] && ENEMIES[id].introducedWave <= data.waves[1]);
    }
  }
  for (const id of ['healer', 'shielder', 'disruptor', 'berserker', 'siphon']) assert.ok(ENEMIES[id].ability);
  assert.deepEqual(BOSSES.world_eater.pattern, ['summon', 'shield', 'silence', 'drain']);
});

test('30 deterministic waves have bounded counts, monotonic schedules, and real multi-batch spawning', () => {
  let totalSpawnSeconds = 0, totalEnemies = 0;
  for (let wave = 1; wave <= 30; wave++) {
    const encounter = getEncounter(wave);
    assert.deepEqual(encounter, getEncounter(wave));
    assert.equal(encounter.wave, wave);
    assert.equal(encounter.chapter, Math.ceil(wave / 6));
    assert.equal(encounter.chapterWave, (wave - 1) % 6 + 1);
    assert.equal(encounter.elite, wave % 6 === 3);
    assert.ok(encounter.duration >= 72 && encounter.duration <= 96);
    assert.ok(encounter.count >= 40 && encounter.count <= 80);
    assert.equal(encounter.schedule.length, encounter.count);
    assert.equal(encounter.batches.length, encounter.batchCount);
    assert.ok(encounter.batchCount === 3 || encounter.batchCount === 4);
    assert.equal(encounter.schedule[0].at, 0);
    assert.ok(encounter.schedule.at(-1).at >= encounter.duration - 1);
    assert.ok(encounter.schedule.at(-1).at <= encounter.duration);
    let previousAt = -1;
    const counts = {};
    for (const spawn of encounter.schedule) {
      assert.ok(ENEMIES[spawn.type]);
      assert.ok(ENEMIES[spawn.type].introducedWave <= wave);
      assert.ok(Number.isFinite(spawn.at) && spawn.at >= previousAt);
      assert.ok(spawn.at - previousAt <= 3, 'no artificial long empty gap between scheduled spawns');
      assert.ok(Number.isInteger(spawn.batch) && spawn.batch >= 0 && spawn.batch < encounter.batchCount);
      previousAt = spawn.at;
      counts[spawn.type] = (counts[spawn.type] || 0) + 1;
    }
    assert.deepEqual(counts, encounter.counts);
    for (const batch of encounter.batches) {
      const batchEntries = encounter.schedule.filter(entry => entry.batch === batch.id);
      assert.equal(batchEntries.length, batch.count);
      assert.equal(batchEntries[0].at, batch.at);
      assert.ok(batch.count >= 12 && batch.count <= 26);
      assert.equal(Object.values(batch.counts).reduce((sum, n) => sum + n, 0), batch.count);
    }
    assert.equal(counts.boss || 0, wave % 6 === 0 ? 1 : 0);
    assert.equal(encounter.bossId, wave % 6 === 0 ? CHAPTERS[encounter.chapter].bossId : null);
    if (encounter.bossId) {
      const bossAt = encounter.schedule.find(s => s.type === 'boss').at;
      assert.ok(bossAt > encounter.duration * 0.35 && bossAt < encounter.duration * 0.60);
      assert.ok(encounter.threats[0].includes(encounter.bossName));
    }
    totalSpawnSeconds += encounter.duration;
    totalEnemies += encounter.count;
  }
  assert.equal(totalSpawnSeconds, 2520, '42 minutes of scheduled spawning before optional early calls');
  assert.ok(totalEnemies >= 1500 && totalEnemies <= 2100);
});

test('each enemy first appears on its promised introduction wave', () => {
  for (const enemy of Object.values(ENEMIES).filter(e => e.id !== 'shard')) {
    const first = Array.from({ length: 30 }, (_, index) => getEncounter(index + 1)).find(e => e.counts[enemy.id]);
    assert.equal(first.wave, enemy.introducedWave, enemy.id);
  }
});

test('routes change pressure and payout, without changing the deterministic composition', () => {
  for (let wave = 1; wave <= 30; wave++) {
    const balanced = getEncounter(wave, 'balanced'), elite = getEncounter(wave, 'elite'), fortune = getEncounter(wave, 'fortune');
    assert.deepEqual(elite.schedule, balanced.schedule);
    assert.deepEqual(fortune.schedule, balanced.schedule);
    assert.ok(Math.abs(elite.hp / balanced.hp - 1.2) < 0.03);
    assert.equal(elite.speed, balanced.speed);
    assert.ok(Math.abs(fortune.speed / balanced.speed - 1.12) < 0.001);
    assert.equal(fortune.hp, balanced.hp);
    assert.equal(elite.goldMultiplier, 1.25);
    assert.equal(fortune.goldMultiplier, 1.35);
    assert.deepEqual(getEncounter(wave, 'unknown'), balanced);
  }
  for (const invalid of [0, 31, -1, 1.1, NaN, Infinity, '1', null]) assert.equal(getEncounter(invalid), null);
});

test('eight events expose deterministic costs and rewards, with a free safe option', () => {
  assert.equal(Object.keys(EVENTS).length, 8);
  for (const event of Object.values(EVENTS)) {
    assert.equal(event.options.length, 3, event.id);
    assert.equal(new Set(event.options.map(option => option.id)).size, 3);
    assert.ok(event.options.some(option => Object.keys(option.requirements).length === 0), event.id);
    for (const option of event.options) {
      assert.ok(option.name && option.description);
      assertNodeEffects(option);
      assert.ok(option.effects.relic !== 'random', 'events promise a deterministic named relic');
    }
  }
});

test('shops and camps provide actual bounded progression and recovery choices', () => {
  assert.equal(Object.keys(SHOP_ITEMS).length, 6);
  assert.deepEqual(Object.keys(CAMP_OPTIONS).sort(), ['rest', 'scavenge', 'train']);
  for (const entry of Object.values(SHOP_ITEMS)) {
    assert.ok(Number.isInteger(entry.price) && entry.price > 0);
    assertNodeEffects(entry);
  }
  for (const entry of Object.values(CAMP_OPTIONS)) assertNodeEffects(entry);
  assert.equal(SHOP_ITEMS.relic_cache.effects.relic, 'random');
  assert.equal(SHOP_ITEMS.hero_voucher.effects.heroLevel, 2);
});

// Runtime contract tests: catalog text is only trusted when its observable effects agree.
import { ExpeditionGame, ACTIVE_SKILLS } from '../expedition.js';
import { heroStats as originalHeroStats } from '../engine.js';
const close = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);
function fixture(type = 'blade', wave = 6) {
  const game = new ExpeditionGame(1729);
  const s = game.state;
  s.eggs = []; s.enemies = []; s.heroes = []; s.effects = [];
  const hero = game._addHero(type, 0, 10, 1);
  Object.assign(s, { phase: 'battle', wave, stage: Math.ceil(wave / 6), battleTime: 10, waveElapsed: 10, encounter: getEncounter(wave), currentBatch: 0, spawnQueue: [{ type: 'normal', at: 9999, batch: 0 }] });
  const enemy = game._spawnEnemy('normal');
  Object.assign(enemy, { x: 4, y: 4, hp: 10000, maxHp: 10000 });
  return { game, s, hero, enemy };
}
function neighbor(game, x, y, type = 'normal') {
  const enemy = game._spawnEnemy(type);
  Object.assign(enemy, { x, y, hp: 10000, maxHp: 10000 });
  return enemy;
}

test('runtime: every talent reaches rank three and then caps; opposite specializations remain locked', () => {
  for (const talent of Object.values(TALENTS)) {
    const game = new ExpeditionGame(7);
    game.state.talentPoints = 5;
    for (let rank = 1; rank <= 3; rank++) {
      assert.equal(game.train(talent.id), true, `${talent.id} rank ${rank}`);
      assert.equal(game.state.talents[talent.id], rank);
    }
    assert.equal(game.train(talent.id), false);
    if (talent.excludes) assert.equal(game.train(talent.excludes), false);
    assert.equal(game.state.talentPoints, 2);
  }
});

test('runtime: all 24 relics upgrade exactly three times and consume their complete numeric effect map', () => {
  for (const relic of Object.values(RELICS_LONG)) {
    const game = new ExpeditionGame(8);
    for (let rank = 1; rank <= 3; rank++) assert.equal(game._grantRelic(relic.id), true);
    assert.equal(game._grantRelic(relic.id), false);
    assert.equal(game.state.relicRanks[relic.id], 3);
    assert.deepEqual(game.state.relics, [relic.id]);
    const mods = game._mods();
    for (const [key, value] of Object.entries(relic.effects)) close(mods[key], value * 3, `${relic.id}.${key}`);
  }
});

test('runtime: stat, damage, range, rotation, burn, slow, and chain modifiers alter real hero stats', () => {
  for (const type of CLASSES) {
    const { game, s, hero } = fixture(type);
    Object.assign(s.relicRanks, { sharp: 3, haste: 3, reach: 3, kindling: 3, coil: 3 });
    Object.assign(s.talents, { might: 3, rhythm: 3, reachcraft: 3 });
    if (type === 'frost') s.talents.frost_glacier = 3;
    const raw = originalHeroStats(hero), stats = game.heroStats(hero), mods = game._mods(type);
    assert.equal(stats.damage, Math.round(raw.damage * (1 + mods.damage)));
    close(stats.range, raw.range + mods.range);
    close(stats.period, raw.period / (1 + mods.rotation));
    close(stats.burn, raw.burn * (1 + mods.burnDamage));
    close(stats.chain, raw.chain + mods.chainTargets);
    if (type === 'frost') close(stats.slow, raw.slow - mods.slowStrength);
  }
});

test('runtime: execution, boss damage, armor pierce, and slowed damage change the hit result', () => {
  {
    const { game, s, hero, enemy } = fixture();
    s.relicRanks.execution = 3; enemy.hp = 3000;
    game._hit(enemy, 100, hero);
    close(enemy.hp, 2840, 'execution at low HP');
  }
  {
    const { game, s, hero, enemy } = fixture();
    s.talents.blade_duelist = 3; s.relicRanks.mirror = 3;
    enemy.type = 'boss'; enemy.armor = 0.28;
    game._hit(enemy, 100, hero, false);
    close(10000 - enemy.hp, 100 * (1 + 0.18 * 6), 'duelist bypasses armor and stacks boss damage');
  }
  {
    const { game, s, hero, enemy } = fixture('frost');
    s.talents.frost_shatter = 3; s.relicRanks.icebreaker = 3;
    enemy.slowUntil = 100;
    game._hit(enemy, 100, hero, false);
    close(10000 - enemy.hp, 100 * (1 + 0.22 * 3 + 0.15 * 3), 'damage against slowed target');
  }
});

test('runtime: swept blades hit six secondary targets and lightning respects its six-target cap', () => {
  for (const type of ['blade', 'thunder']) {
    const { game, s, hero, enemy } = fixture(type);
    if (type === 'blade') s.talents.blade_reaper = 3;
    else { s.talents.thunder_tempest = 3; s.relicRanks.coil = 3; s.relicRanks.conductor = 3; }
    const others = Array.from({ length: 8 }, (_, i) => neighbor(game, 4.1 + i * 0.05, 4));
    game._hit(enemy, 100, hero);
    assert.equal(others.filter(e => e.hp < e.maxHp).length, 6, type);
    const expected = type === 'blade' ? 100 * 0.18 * 3 : 100 * (0.62 + 0.08 * 3 + 0.15 * 3);
    close(10000 - others[0].hp, expected, `${type} secondary multiplier`);
  }
});

test('runtime: universal burn adds to fire burn and all burn modifiers multiply its damage', () => {
  for (const type of ['blade', 'fire']) {
    const { game, s, hero, enemy } = fixture(type);
    s.relicRanks.ember = 3; s.relicRanks.kindling = 3;
    if (type === 'fire') s.talents.fire_inferno = 3;
    game._hit(enemy, 100, hero);
    const mods = game._mods(type), base = originalHeroStats(hero);
    close(enemy.burnDamage, (base.burn + game.heroStats(hero).damage * mods.allBurn) * (1 + mods.burnDamage));
    close(enemy.burnUntil, 12 + (mods.burnDuration || 0));
  }
});

test('runtime: frost duration, world slow, and incubation change status, motion, and egg damage', () => {
  {
    const { game, s, hero, enemy } = fixture('frost');
    s.talents.frost_glacier = 3; s.relicRanks.deepfreeze = 3;
    game._hit(enemy, 10, hero);
    close(enemy.slowUntil, 10 + 1.45 + 0.4 * 3 + 0.5 * 3);
    close(enemy.slowFactor, 0.52 - 0.05 * 3);
  }
  {
    const { game, s, enemy } = fixture();
    s.relicRanks.winter = 3; s.heroes = [];
    const before = enemy.progress;
    game._step(1 / 60);
    close(enemy.progress - before, enemy.speed / 60 * (1 - 0.06 * 3));
  }
  {
    const { game, s, hero } = fixture();
    s.talents.incubation = 3; s.relicRanks.hatchery = 3;
    game._spawnEgg(0); const egg = s.eggs[0]; egg.hp = egg.maxHp = 10000;
    game._hit(egg, 100, hero);
    close(10000 - egg.hp, 100 * (1 + 0.25 * 3 + 0.35 * 3));
  }
});

test('runtime: every reaction consumes its stated damage, radius, target limit and status values', () => {
  for (const reaction of Object.values(REACTIONS)) {
    const { game, s, hero, enemy } = fixture(reaction.classes[0]);
    const near = Array.from({ length: 7 }, (_, i) => neighbor(game, 4.15 + i * 0.05, 4));
    const far = neighbor(game, 8, 8);
    enemy.marks[reaction.classes[1]] = 100;
    game._applyElement(enemy, hero, 100);
    close(10000 - enemy.hp, 100 * reaction.effects.damage, reaction.id);
    const count = Math.min(6, reaction.effects.targets || (reaction.effects.radius ? 6 : 1));
    assert.equal(near.filter(e => e.hp < e.maxHp).length, count - 1, reaction.id);
    assert.equal(far.hp, far.maxHp);
    if (reaction.effects.slow) { close(enemy.slowFactor, reaction.effects.slow); close(enemy.slowUntil, 10 + reaction.effects.duration); }
    if (reaction.effects.stun) close(enemy.stunUntil, 10 + reaction.effects.stun);
    if (reaction.effects.burn) { close(enemy.burnDamage, 100 * reaction.effects.burn); close(enemy.burnUntil, 10 + reaction.effects.duration); }
    if (reaction.effects.armorBreak) { close(enemy.armorBreak, reaction.effects.armorBreak); close(enemy.armorBreakUntil, 10 + reaction.effects.duration); }
    assert.equal(s.stats.reactions, 1);
    const damageAfter = s.stats.damage;
    enemy.marks[reaction.classes[1]] = 100; game._applyElement(enemy, hero, 100);
    assert.equal(s.stats.damage, damageAfter, 'per-target reaction cooldown prevents recursion/repeat');
  }
});

test('runtime: all six combos apply their specified payload once per cooldown', () => {
  for (const combo of Object.values(COMBOS)) {
    const { game, s, hero, enemy } = fixture(combo.classes[0]);
    s.combos = [combo.id];
    const near = Array.from({ length: 7 }, (_, i) => neighbor(game, 4.15 + i * 0.05, 4));
    game._triggerCombo(enemy, hero, 100);
    close(10000 - enemy.hp, 100 * combo.effects.damage, combo.id);
    const count = Math.min(6, combo.effects.targets || (combo.effects.radius ? 6 : 1));
    assert.equal(near.filter(e => e.hp < e.maxHp).length, count - 1, combo.id);
    if (combo.effects.slow) { close(enemy.slowFactor, combo.effects.slow); close(enemy.slowUntil, 10 + combo.effects.duration); }
    if (combo.effects.stun) close(enemy.stunUntil, 10 + combo.effects.stun);
    if (combo.effects.burn) { close(enemy.burnDamage, 100 * combo.effects.burn); close(enemy.burnUntil, 10 + combo.effects.duration); }
    close(s.comboCooldowns[combo.id], 10 + combo.cooldown);
    const damageAfter = s.stats.damage;
    game._triggerCombo(enemy, hero, 100);
    assert.equal(s.stats.damage, damageAfter);
    assert.equal(s.stats.comboTriggers, 1);
  }
});

test('runtime: alchemist and conductor strengthen teammates, and mark/cooldown relics have effect', () => {
  {
    const { game, s, hero, enemy } = fixture('blade');
    s.talents.fire_alchemist = 3; s.relicRanks.crucible = 3; s.relicRanks.catalyst = 3;
    game._applyElement(enemy, hero, 100);
    close(enemy.marks.blade, 10 + 3 + 0.4 * 3 + 0.5 * 3);
    enemy.marks.fire = 100;
    game._applyElement(enemy, hero, 100);
    close(10000 - enemy.hp, 100 * REACTIONS.blade_fire.effects.damage * (1 + 0.22 * 3 + 0.18 * 3));
  }
  {
    const { game, s, hero, enemy } = fixture('blade');
    s.talents.thunder_conductor = 3; s.relicRanks.resonance = 3; s.relicRanks.hourglass = 3;
    s.combos = ['combo_blade_frost'];
    game._triggerCombo(enemy, hero, 100);
    close(10000 - enemy.hp, 100 * COMBOS.combo_blade_frost.effects.damage * (1 + 0.1 * 3 + 0.2 * 3));
    close(s.comboCooldowns.combo_blade_frost, 10 + 8 * 0.5, 'cooldown reduction capped at 50%');
  }
});

test('runtime: active duration and cooldown talents modify both combat skills', () => {
  for (const skill of ['rally', 'blizzard']) {
    const { game, s, enemy } = fixture();
    s.activeSkill = skill; s.relicRanks.warbanner = 3; s.talents.command = 3;
    assert.equal(game.useActive(), true);
    close(s.activeCooldown, ACTIVE_SKILLS[skill].cooldown * (1 - 0.08 * 3));
    if (skill === 'rally') close(s.rallyUntil, 10 + 8 + 1.5 * 3);
    else { close(enemy.slowUntil, 10 + 4 + 1.5 * 3); close(enemy.slowFactor, 0.35); }
  }
});

test('runtime: acquisition, max life, boss healing, wave gold, and hatch gold yield real resources', () => {
  {
    const { game, s } = fixture(); const startGold = s.gold;
    s.lives = 1;
    game._grantRelic('bounty'); game._grantRelic('fortress'); game._grantRelic('ward');
    assert.equal(s.gold - startGold, 35); assert.equal(s.maxLives, 21); assert.equal(s.lives, 5);
  }
  {
    const { game, s, enemy } = fixture(); s.lives = 1; s.relicRanks.phoenix = 3; enemy.type = 'boss';
    game._kill(enemy); assert.equal(s.lives, 10);
  }
  {
    const { game, s } = fixture(); s.relicRanks.compound = 3; const startGold = s.gold;
    game._finishWave(); assert.equal(s.gold - startGold, 32 + s.wave * 5 + 15 * 3);
  }
  {
    const { game, s } = fixture(); s.relicRanks.magnet = 3; s.relicRanks.hatchery = 3; s.talents.incubation = 3;
    game._spawnEgg(); const startGold = s.gold;
    game._hatch(s.eggs[0]); assert.equal(s.gold - startGold, 12 * 3 + 10 * 3 + 5 * 3);
  }
  {
    const { game, s, enemy } = fixture(); s.relicRanks.bounty = 3; s.talents.prosperity = 3;
    const startGold = s.gold; game._kill(enemy);
    assert.equal(s.gold - startGold, Math.round((4 + Math.floor(s.wave / 6)) * (1 + 0.12 * 3 + 0.1 * 3)));
  }
});

test('runtime: all five special enemy abilities match their readable metadata', () => {
  for (const type of ['healer', 'shielder']) {
    const { game, s, enemy } = fixture();
    enemy.type = type; enemy.abilityAt = 0;
    const others = Array.from({ length: 7 }, (_, i) => neighbor(game, 4.15 + i * 0.05, 4));
    others.forEach(other => { other.hp = 5000; });
    game._enemyAbility(enemy);
    const ability = ENEMIES[type].ability;
    close(enemy.abilityAt, 10 + ability.cooldown);
    assert.equal(others.filter(other => type === 'healer' ? other.hp > 5000 : other.shield > 0).length, ability.targets);
    if (type === 'healer') close(others[0].hp, 5000 + 10000 * ability.fraction);
    else close(others[0].shield, 10000 * ability.fraction);
  }
  {
    const { game, s, hero, enemy } = fixture(); enemy.type = 'disruptor'; enemy.abilityAt = 0;
    hero.x = 4.2; hero.y = 4;
    const originalPeriod = game.heroStats(hero).period; game._enemyAbility(enemy);
    close(hero.disruptedUntil, 10 + ENEMIES.disruptor.ability.duration);
    close(game.heroStats(hero).period, originalPeriod / (1 - ENEMIES.disruptor.ability.fraction));
  }
  {
    const { game, s, enemy } = fixture(); enemy.type = 'siphon'; enemy.abilityAt = 0;
    s.activeCooldown = 15; const gold = s.gold; game._enemyAbility(enemy);
    assert.equal(s.activeCooldown, 19); assert.equal(s.gold, gold);
    close(enemy.abilityAt, 10 + ENEMIES.siphon.ability.cooldown);
  }
  {
    const { game, s, enemy } = fixture(); s.heroes = []; enemy.type = 'berserker'; enemy.hp = 4000;
    const start = enemy.progress; game._step(1 / 60);
    close(enemy.progress - start, enemy.speed / 60 * (1 + ENEMIES.berserker.ability.speed));
  }
});

test('runtime: all bosses read their telegraph, phase, summon, shield, silence and drain data', () => {
  for (const boss of Object.values(BOSSES)) {
    for (const phase of [1, 2]) {
      const { game, s, hero, enemy } = fixture('blade', CHAPTERS[Object.values(CHAPTERS).find(c => c.bossId === boss.id).id].waves[1]);
      enemy.type = 'boss'; enemy.bossId = boss.id; enemy.bossPhase = phase; enemy.bossNextCast = 0;
      enemy.hp = phase === 1 ? 8000 : 4000; hero.x = 4.2; hero.y = 4;
      const kinds = boss.pattern || [boss.mechanic];
      for (const kind of kinds) {
        enemy.bossNextCast = 0;
        game._bossTick(enemy);
        assert.equal(enemy.bossCast.kind, kind);
        close(enemy.bossCast.resolveAt, s.battleTime + boss.warning);
        if (kind === 'silence') close(enemy.bossCast.radius, phase === 2 ? boss.phaseRadius : boss.radius);
        s.battleTime = enemy.bossCast.resolveAt;
        const startCount = s.enemies.length, startHp = enemy.hp, startCooldown = s.activeCooldown;
        game._bossTick(enemy);
        if (kind === 'summon') {
          assert.equal(s.enemies.length - startCount, phase === 2 ? boss.phaseCount : boss.summonCount);
          assert.ok(s.enemies.slice(startCount).every(e => e.type === boss.summonType));
        }
        if (kind === 'shield') close(enemy.shield, enemy.maxHp * (phase === 2 ? boss.phaseShieldFraction : boss.shieldFraction));
        if (kind === 'silence') close(hero.disabledUntil, s.battleTime + boss.duration);
        if (kind === 'drain') {
          close(enemy.hp, Math.min(enemy.maxHp, startHp + enemy.maxHp * (phase === 2 ? boss.phaseHealFraction : boss.healFraction)));
          close(s.activeCooldown, startCooldown + boss.cooldownDrain);
        }
        assert.equal(enemy.bossCast, null);
      }
    }
  }
});

test('runtime: early calls can advance continuous-pressure batches without deleting queued enemies', () => {
  const game = new ExpeditionGame(77);
  game._addHero('blade', 0, 10, 1); game.startWave(); game.update(1 / 60);
  assert.equal(game.state.currentBatch, 0);
  assert.ok(game.state.nextReinforcement > 20);
  const queued = game.state.spawnQueue.length, gold = game.state.gold;
  assert.equal(game.callReinforcements(), true);
  assert.equal(game.state.spawnQueue.length, queued);
  assert.equal(game.state.gold, gold + 8);
  assert.equal(game.callReinforcements(), false, 'same batch cannot be called twice before spawning');
  assert.ok(game.state.spawnQueue.every((entry, index, list) => index === 0 || entry.at >= list[index - 1].at));
});

test('runtime: every event option pays exactly its disclosed cost and fixed reward once', () => {
  for (const event of Object.values(EVENTS)) for (const option of event.options) {
    const game = new ExpeditionGame(71), s = game.state;
    Object.assign(s, { phase: 'event', eventId: event.id, choices: event.options.map(o => o.id), nodeQueue: [], gold: 1000, lives: 10, eggs: [] });
    assert.equal(game.chooseEvent(option.id), true, `${event.id}.${option.id}`);
    const effect = option.effects, relic = effect.relic ? RELICS_LONG[effect.relic].effects : {};
    assert.equal(s.gold, 1000 + (effect.gold || 0) + (relic.goldOnAcquire || 0));
    assert.equal(s.lives, Math.min(s.maxLives, 10 + (effect.lives || 0) + (effect.heal || 0) + (relic.healOnAcquire || 0)));
    assert.equal(s.talentPoints, effect.talentPoints || 0);
    assert.equal(s.eggs.length, effect.egg || 0);
    if (effect.relic) assert.equal(s.relicRanks[effect.relic], 1);
    assert.equal(s.phase, 'build');
    const gold = s.gold, lives = s.lives;
    assert.equal(game.chooseEvent(option.id), false);
    assert.equal(s.gold, gold); assert.equal(s.lives, lives);
  }
});

test('runtime: unaffordable, lethal and capped event costs are rejected without loss', () => {
  for (const event of Object.values(EVENTS)) for (const option of event.options) {
    if (!option.effects.relic && !option.effects.gold && !option.effects.lives) continue;
    const game = new ExpeditionGame(72), s = game.state;
    Object.assign(s, { phase: 'event', eventId: event.id, choices: event.options.map(o => o.id), gold: 0, lives: 1 });
    if (option.effects.gold < 0 || option.effects.lives < 0) {
      assert.equal(game.chooseEvent(option.id), false, `${event.id}.${option.id}`);
      assert.equal(s.gold, 0); assert.equal(s.lives, 1); assert.equal(s.phase, 'event');
    }
    if (option.effects.relic) {
      s.gold = 1000; s.lives = 20; s.relicRanks[option.effects.relic] = 3;
      assert.equal(game.chooseEvent(option.id), false, `capped ${event.id}.${option.id}`);
      assert.equal(s.gold, 1000); assert.equal(s.lives, 20); assert.equal(s.phase, 'event');
    }
  }
});

test('runtime: every shop product is a single bounded purchase with its promised effect', () => {
  for (const product of Object.values(SHOP_ITEMS)) {
    const game = new ExpeditionGame(73), s = game.state;
    Object.assign(s, { phase: 'shop', gold: 1000, lives: 10, eggs: [], shopOffers: [{ id: product.id, price: product.price, sold: false, relicId: product.effects.relic === 'random' ? 'sharp' : undefined, heroType: 'fire' }] });
    assert.equal(game.buyOffer(product.id), true, product.id);
    assert.equal(s.gold, 1000 - product.price);
    if (product.effects.heal) assert.equal(s.lives, 10 + product.effects.heal);
    if (product.effects.talentPoints) assert.equal(s.talentPoints, product.effects.talentPoints);
    if (product.effects.egg) assert.equal(s.eggs.length, 1);
    if (product.effects.hero) { assert.equal(s.heroes.length, 1); assert.equal(s.heroes[0].level, 2); assert.equal(s.heroes[0].type, 'fire'); }
    if (product.effects.relic) assert.equal(s.relicRanks[product.effects.relic === 'random' ? 'sharp' : product.effects.relic], 1);
    assert.equal(s.shopOffers[0].sold, true);
    const gold = s.gold; assert.equal(game.buyOffer(product.id), false); assert.equal(s.gold, gold);
  }
});

test('runtime: shops refuse full hero and egg slots without taking payment', () => {
  for (const id of ['hero_voucher', 'royal_egg']) {
    const game = new ExpeditionGame(74), s = game.state;
    const cells = game._freeCells();
    if (id === 'hero_voucher') for (const cell of cells.slice(0, 12)) game._addHero('blade', cell.x, cell.y, 1);
    else { s.eggs = []; for (let n = 0; n < 3; n++) game._spawnEgg(0); }
    Object.assign(s, { phase: 'shop', gold: 1000, shopOffers: [{ id, price: SHOP_ITEMS[id].price, sold: false }] });
    assert.equal(game.buyOffer(id), false); assert.equal(s.gold, 1000); assert.equal(s.shopOffers[0].sold, false);
  }
});

test('runtime: first-phase interrupts stop casts; second-phase reactions delay once; active cancels both', () => {
  for (const phase of [1, 2]) {
    const { game, s, enemy } = fixture();
    Object.assign(enemy, { type: 'boss', bossId: 'thorn_king', bossPhase: phase, bossCast: { kind: 'summon', x: 4, y: 4, radius: 1.5, resolveAt: 12, interrupted: false, delayed: false } });
    assert.equal(game._interrupt(enemy), true);
    if (phase === 1) {
      assert.equal(enemy.bossCast.interrupted, true); assert.equal(s.stats.interrupts, 1);
    } else {
      assert.equal(enemy.bossCast.interrupted, false); assert.equal(enemy.bossCast.delayed, true);
      close(enemy.bossCast.resolveAt, 13); assert.equal(s.stats.bossDelays, 1);
      assert.equal(game._interrupt(enemy), false); close(enemy.bossCast.resolveAt, 13);
      assert.equal(game._interrupt(enemy, 'active'), true); assert.equal(enemy.bossCast.interrupted, true);
      assert.equal(s.stats.interrupts, 1);
    }
    const count = s.enemies.length;
    s.battleTime = enemy.bossCast.resolveAt; game._bossTick(enemy);
    assert.equal(s.enemies.length, count, 'cancelled summon creates no enemies');
  }
});

test('runtime: boss immobilization is exactly 40 percent and its silence zone can be dodged', () => {
  {
    const { game, s, hero, enemy } = fixture(); enemy.type = 'boss';
    game._applyProc(enemy, hero, 100, { damage: 1, stun: 2 }, {});
    close(enemy.stunUntil, 10 + 2 * 0.4);
  }
  {
    const { game, s, hero, enemy } = fixture('blade', 18);
    Object.assign(enemy, { type: 'boss', bossId: 'storm_oracle', bossNextCast: 0 });
    hero.x = 4; hero.y = 4; game._bossTick(enemy);
    const cast = enemy.bossCast; hero.x = 0; hero.y = 10;
    s.battleTime = cast.resolveAt; game._bossTick(enemy);
    assert.equal(hero.disabledUntil, 0); assert.equal(enemy.bossCast, null);
  }
});
