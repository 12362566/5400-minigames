import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createGame, deploy, tick, exposedTargets, summarize, serialize, restore,
  validateState, COLORS, LEVELS, SLOT_COUNT, FIRE_INTERVAL, nextLevelIndex, getStateLevel, SAVE_VERSION,
} from '../src/engine.js';

function assertConservation(state) {
  for (const color of COLORS) {
    const remaining = state.voxels.filter(voxel => voxel.alive && voxel.color === color).length;
    const ammunition = [...state.slots.filter(Boolean), ...state.queues.flat()]
      .filter(cannon => cannon.color === color).reduce((sum, cannon) => sum + cannon.ammo, 0);
    assert.equal(ammunition, remaining, `${color} ammunition is conserved`);
  }
  assert.equal(state.hits, state.voxels.filter(voxel => !voxel.alive).length);
  assert.equal(state.shotCount, state.hits);
  assert.equal(state.progress.hits, state.hits);
  assert.equal(state.progress.total, state.total);
}

function supplyVisibleColors(state) {
  const visible = new Set(exposedTargets(state).map(voxel => voxel.color));
  for (let column = 0; column < COLORS.length; column++) {
    const color = COLORS[column];
    if (visible.has(color) && state.queues[column].length && !state.slots.some(c => c?.color === color)) {
      assert.equal(deploy(state, column).ok, true);
    }
  }
}

test('all twelve original tall levels are finite, deterministic, distinct, and balanced', () => {
  assert.equal(LEVELS.length, 12);
  assert.equal(new Set(LEVELS.map(level => level.name)).size, 12);
  assert.equal(LEVELS[0].total, 2072);
  for (const level of LEVELS) {
    assert.equal(level.total, level.voxels.length);
    assert.ok([18, 20, 22].includes(level.width));
    if (level.index === 0) {
      assert.deepEqual(level.dimensions, { width: 18, height: 8, depth: 16 });
    } else {
      assert.ok(level.height >= 14 && level.height <= 16);
      assert.ok(level.depth >= 8 && level.depth <= 12);
    }
    assert.equal(Math.max(...level.voxels.map(v => v.y)) + 1, level.height);
    assert.equal(createGame(level.index).campaignVersion, 2);
    assert.deepEqual(createGame(level.index).dimensions, level.dimensions);
    assert.equal(level.queues.length, 4);
    assert.equal(new Set(level.voxels.map(v => `${v.x},${v.y},${v.z}`)).size, level.total);
    for (const color of COLORS) {
      assert.ok(level.colorCounts[color] > 0);
      assert.equal(level.colorCounts[color], level.queues.flat().filter(c => c.color === color).reduce((sum, c) => sum + c.ammo, 0));
    }
    for (const cannon of level.queues.flat()) assert.ok(cannon.total >= 40 && cannon.total <= 120);
    assert.equal(serialize(createGame(level.index)), serialize(createGame(level.index)));
    assertConservation(createGame(level.index));
  }
  assert.equal(nextLevelIndex(10), 11);
  assert.equal(nextLevelIndex(11), null);
  for (const bad of [-1, 12, 0.5, NaN, Infinity, '0']) assert.throws(() => createGame(bad), RangeError);
});

test('deployment consumes only the front reserve cannon and takes the first free slot', () => {
  const state = createGame();
  const first = state.queues[0][0].id;
  const second = state.queues[0][1].id;
  const result = deploy(state, 0);
  assert.equal(result.ok, true);
  assert.equal(result.slotIndex, 0);
  assert.equal(state.slots[0].id, first);
  assert.equal(state.queues[0][0].id, second);
  assert.equal(deploy(state, 1).slotIndex, 1);
  assert.equal(deploy(state, -1).reason, 'invalid-column');
  assert.equal(deploy(state, 4).reason, 'invalid-column');
  assert.equal(deploy(state, 0.5).reason, 'invalid-column');
  assertConservation(state);
});

test('front-ray exposure skips gaps and never shoots through a different color', () => {
  const state = createGame();
  state.voxels = [
    { id: 0, x: 0, y: 0, z: 0, color: 'green', alive: true },
    { id: 1, x: 0, y: 0, z: 5, color: 'pink', alive: true },
    { id: 2, x: 0, y: 0, z: 9, color: 'green', alive: true },
    { id: 3, x: 1, y: 1, z: 3, color: 'cyan', alive: true },
  ];
  state.total = state.progress.total = 4;
  deploy(state, 0);
  assert.deepEqual(exposedTargets(state).map(v => v.id), [0, 3]);
  const events = tick(state, 2);
  const shots = events.filter(event => event.type === 'shot');
  assert.equal(shots.length, 1);
  assert.equal(shots[0].target.id, 0);
  assert.equal(shots[0].target.color, shots[0].color);
  assert.equal(state.voxels[0].alive, false);
  assert.equal(state.voxels[2].alive, true);
  assert.deepEqual(exposedTargets(state).map(v => v.id), [3, 1]);
  assert.equal(state.status, 'playing');
  assert.equal(state.slots[0].ammo, state.slots[0].total - 1);
});

test('simultaneous cannons reserve distinct targets immediately', () => {
  const state = createGame();
  deploy(state, 0);
  deploy(state, 0);
  const shots = tick(state, 0).filter(event => event.type === 'shot');
  assert.equal(shots.length, 2);
  assert.equal(new Set(shots.map(event => event.target.id)).size, 2);
  for (const shot of shots) assert.equal(state.voxels[shot.target.id].alive, false);
  assertConservation(state);
});

test('a ready cannon resumes when another slot exposes its color at the same timestamp', () => {
  const state = createGame();
  state.voxels = [
    { id: 0, x: 0, y: 0, z: 0, color: 'pink', alive: true },
    { id: 1, x: 0, y: 0, z: 3, color: 'green', alive: true },
  ];
  state.total = state.progress.total = 2;
  deploy(state, 0); // green blocked until slot 1 fires
  deploy(state, 1);
  const shots = tick(state, 0).filter(event => event.type === 'shot');
  assert.deepEqual(shots.map(event => event.color), ['pink', 'green']);
  assert.deepEqual(shots.map(event => event.elapsed), [0, 0]);
  assert.equal(state.status, 'won');
});

test('simulation produces the same state and events across tick partitioning', () => {
  const whole = createGame();
  for (let color = 0; color < 4; color++) deploy(whole, color);
  const split = restore(serialize(whole));
  const wholeEvents = tick(whole, FIRE_INTERVAL * 4);
  const splitEvents = Array.from({ length: 4 }, () => tick(split, FIRE_INTERVAL)).flat();
  assert.deepEqual(splitEvents, wholeEvents);
  assert.equal(serialize(split), serialize(whole));
});

test('all 12 levels are winnable by choosing currently visible colors', () => {
  for (let levelIndex = 0; levelIndex < LEVELS.length; levelIndex++) {
    const state = createGame(levelIndex);
    let eventHits = 0;
    let wins = 0;
    let lastHits = 0;
    let stalled = 0;
    for (let frame = 0; frame < 2000 && state.status === 'playing'; frame++) {
      supplyVisibleColors(state);
      const events = tick(state, 0.25);
      eventHits += events.filter(event => event.type === 'hit').length;
      wins += events.filter(event => event.type === 'win').length;
      for (const shot of events.filter(event => event.type === 'shot')) {
        assert.equal(shot.color, shot.target.color);
        assert.equal(state.voxels[shot.target.id].alive, false);
      }
      if (state.hits === lastHits) stalled++; else stalled = 0;
      assert.ok(stalled < 5, `level ${levelIndex + 1} stalled`);
      lastHits = state.hits;
      assertConservation(state);
      if (frame % 20 === 0) validateState(state);
    }
    assert.equal(state.status, 'won', `level ${levelIndex + 1} can be won`);
    assert.equal(state.hits, state.total);
    assert.equal(eventHits, state.total);
    assert.equal(wins, 1);
    assert.equal(state.queues.flat().length, 0);
    assert.equal(state.slots.filter(Boolean).length, 0);
    assert.equal(summarize(state).progress, 1);
    assert.equal(summarize(state).campaignComplete, levelIndex === 11);
    assert.deepEqual(tick(state, 5), []);
    assert.equal(deploy(state, 0).reason, 'round-over');
    assert.equal(restore(serialize(state)).status, 'won');
  }
});

test('five blocked slots produce one recoverable loss with ammunition intact', () => {
  const state = createGame(6);
  assert.ok(state.queues[0].length >= 5);
  for (let slot = 0; slot < SLOT_COUNT; slot++) assert.equal(deploy(state, 0).ok, true);
  assert.equal(deploy(state, 1).reason, 'slots-full');
  const events = tick(state, 100);
  assert.equal(state.status, 'lost');
  assert.equal(events.filter(event => event.type === 'loss').length, 1);
  assert.ok(state.slots.every(cannon => cannon && cannon.ammo > 0));
  assert.ok(state.hits > 0 && state.hits < state.total);
  assertConservation(state);
  assert.equal(restore(serialize(state)).status, 'lost');
  const before = serialize(state);
  assert.deepEqual(tick(state, 1), []);
  assert.equal(serialize(state), before);
  const retry = createGame(state.levelIndex);
  assert.equal(retry.status, 'playing');
  assert.equal(retry.hits, 0);
  assert.equal(retry.levelIndex, 6);
});

test('fewer than five blocked slots wait without losing', () => {
  const state = createGame(6);
  for (let slot = 0; slot < 4; slot++) deploy(state, 0);
  tick(state, 100);
  assert.equal(state.status, 'playing');
  assert.equal(state.slots.filter(Boolean).length, 4);
  assert.equal(summarize(state).exposedByColor.green, 0);
  assert.equal(deploy(state, 1).ok, true);
  const oldHits = state.hits;
  tick(state, 1);
  assert.ok(state.hits > oldHits);
});

test('mid-round save resumes precisely, preserving cooldowns, queues, and target order', () => {
  const original = createGame(9);
  for (let i = 0; i < 4; i++) deploy(original, i);
  tick(original, 0.321);
  const resumed = restore(serialize(original));
  assert.equal(serialize(resumed), serialize(original));
  for (const dt of [0, 0.016, 0.033, 0.104, 0.5, 0.016, 1]) {
    assert.deepEqual(tick(resumed, dt), tick(original, dt));
    assert.equal(serialize(resumed), serialize(original));
  }
  assertConservation(resumed);
});

test('corrupted or inconsistent saves are rejected instead of partially restored', () => {
  for (const bad of [null, '', '{', 'null', '[]', '{}', '"hello"', 'x'.repeat(250001)]) assert.throws(() => restore(bad), /Invalid save/);
  const base = JSON.parse(serialize(createGame()));
  const changes = [
    data => { data.version = 999; },
    data => { data.campaignVersion = 99; },
    data => { delete data.campaignVersion; },
    data => { data.campaignVersion = 1; },
    data => { data.version = 1; },
    data => { data.levelIndex = 12; },
    data => { data.timeUs = -1; },
    data => { data.timeUs = 0.5; },
    data => { data.alive.pop(); },
    data => { data.alive[0] = 2; },
    data => { data.hits = 1; },
    data => { data.shotCount = 1; },
    data => { data.status = 'won'; },
    data => { data.status = 'lost'; },
    data => { data.slots.pop(); },
    data => { data.queueIds[0].reverse(); },
    data => { data.queueIds[0].shift(); },
    data => { data.slots[0] = [data.queueIds[0][0], 1, 0]; },
  ];
  for (const change of changes) {
    const damaged = structuredClone(base);
    change(damaged);
    assert.throws(() => restore(JSON.stringify(damaged)), /Invalid save/);
  }
  const state = createGame();
  deploy(state, 0);
  const live = JSON.parse(serialize(state));
  const damagedAmmo = structuredClone(live);
  damagedAmmo.slots[0][1]--;
  assert.throws(() => restore(JSON.stringify(damagedAmmo)), /ammunition conservation/);
  const damagedTimer = structuredClone(live);
  damagedTimer.slots[0][2] = 9999999;
  assert.throws(() => restore(JSON.stringify(damagedTimer)), /cooldown/);
});

test('invalid time steps cannot hang or mutate the game', () => {
  const state = createGame();
  deploy(state, 0);
  const before = serialize(state);
  for (const dt of [-1, NaN, Infinity, '1', undefined, 3601]) assert.throws(() => tick(state, dt), RangeError);
  assert.equal(serialize(state), before);
});

test('strict validation rejects blocked-ray removal and altered runtime identities', () => {
  const state = createGame();
  deploy(state, 0);
  tick(state, 0.1);
  const save = JSON.parse(serialize(state));
  const negative = structuredClone(save);
  negative.slots[0][1] = -1;
  assert.throws(() => restore(JSON.stringify(negative)), /bad ammunition/);

  const fresh = createGame();
  const invalidRay = JSON.parse(serialize(fresh));
  const front = fresh.voxels[0];
  const behind = fresh.voxels.find(v => v.x === front.x && v.y === front.y && v.z > front.z);
  assert.ok(behind);
  invalidRay.alive[behind.id] = 0;
  invalidRay.hits = invalidRay.shotCount = 1;
  assert.throws(() => restore(JSON.stringify(invalidRay)), /obstructed ray/);

  const changed = restore(serialize(state));
  changed.voxels[0].x += 1;
  assert.throws(() => validateState(changed), /modified voxel geometry/);
  const changedCannon = restore(serialize(state));
  changedCannon.slots[0].color = 'cyan';
  assert.throws(() => validateState(changedCannon), /modified cannon identity/);
});


test('pre-redesign schema-1 fixture restores the exact original 476-cube layout', () => {
  // Captured with the old engine BEFORE tall campaign definitions were added.
  // Its static IDs/mask ensure this cannot silently become a new-campaign test.
  const fixture = readFileSync(new URL('./fixtures/legacy-v1-midround.json', import.meta.url), 'utf8').trim();
  const state = restore(fixture);
  assert.equal(state.version, SAVE_VERSION);
  assert.equal(state.campaignVersion, 1);
  assert.equal(state.levelId, 'sculpture-1');
  assert.deepEqual(state.dimensions, { width: 12, height: 5, depth: 12 });
  assert.equal(state.total, 476);
  assert.equal(state.hits, 8);
  assert.equal(state.timeUs, 321000);
  assert.deepEqual(state.voxels[0], { id: 0, x: 2, y: 0, z: 0, color: 'green', alive: false });
  assert.deepEqual(state.voxels.at(-1), { id: 475, x: 9, y: 2, z: 11, color: 'cyan', alive: true });
  assert.equal(state.slots[0].id, 'l0-green-0');
  assert.equal(state.slots[0].ammo, 39);
  assert.equal(state.slots[0].cooldownUs, 59000);
  assert.equal(getStateLevel(state).total, 476);
  assertConservation(state);
  validateState(state);

  const newSave = JSON.parse(serialize(state));
  assert.equal(newSave.version, 2);
  assert.equal(newSave.campaignVersion, 1);
  const resumed = restore(JSON.stringify(newSave));
  const baseline = createGame(0, 1);
  deploy(baseline, 0); deploy(baseline, 1); tick(baseline, 0.321);
  for (const dt of [0.016, 0.059, 0.105, 0.5]) {
    assert.deepEqual(tick(resumed, dt), tick(baseline, dt));
    assert.equal(serialize(resumed), serialize(baseline));
  }
});

test('new campaign fixture restores broad-roof opening geometry and version-specific cannon IDs', () => {
  // Regenerate with createGame(0), deploy green then pink, and tick 0.321 s.
  // The opening layout follows the reference’s green-scene roof proportions.
  const fixture = readFileSync(new URL('./fixtures/tall-v2-midround.json', import.meta.url), 'utf8').trim();
  const state = restore(fixture);
  assert.equal(state.version, 2);
  assert.equal(state.campaignVersion, 2);
  assert.equal(state.levelId, 'sculpture-v2-1');
  assert.deepEqual(state.dimensions, { width: 18, height: 8, depth: 16 });
  assert.equal(state.total, 2072);
  assert.equal(state.hits, 8);
  assert.equal(state.timeUs, 321000);
  assert.equal(state.slots[0].id, 'v2-l0-green-0');
  assert.equal(serialize(state), fixture);
  assertConservation(state);
  validateState(state);
  const baseline = createGame(0);
  deploy(baseline, 0); deploy(baseline, 1); tick(baseline, 0.321);
  assert.equal(serialize(state), serialize(baseline));
});

test('all twelve legacy rounds preserve geometry and can still finish after migration', () => {
  for (let levelIndex = 0; levelIndex < 12; levelIndex++) {
    const state = createGame(levelIndex, 1);
    // Exercise old-format migration across the entire previous catalogue.
    const snapshot = JSON.parse(serialize(state));
    snapshot.version = 1;
    delete snapshot.campaignVersion;
    const migrated = restore(JSON.stringify(snapshot));
    assert.equal(migrated.levelId, `sculpture-${levelIndex + 1}`);
    assert.equal(migrated.total, getStateLevel(migrated).total);
    for (let frame = 0; frame < 2000 && migrated.status === 'playing'; frame++) {
      supplyVisibleColors(migrated);
      tick(migrated, 0.25);
    }
    assert.equal(migrated.status, 'won', `legacy round ${levelIndex + 1} is winnable`);
    validateState(migrated);
  }
});
