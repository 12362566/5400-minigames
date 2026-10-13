/**
 * Deterministic simulation for a color-sorting voxel shooter.
 *
 * Deliberate adaptation: every cube takes exactly ONE matching hit. A shot
 * reserves/removes its cube immediately; renderer bullets are cosmetic only.
 * Four front-to-back reserve queues feed five active slots. Timers are integer
 * microseconds. No DOM, random source, wall clock, renderer, or dependencies.
 */
import { COLORS, LEVELS, getLevel, nextLevelIndex } from './levels.js';

export { COLORS, LEVELS, nextLevelIndex };
export const SLOT_COUNT = 5;
export const FIRE_INTERVAL = 0.095;
export const FIRE_INTERVAL_US = 95_000;
export const SAVE_VERSION = 1;
const US = 1_000_000;
const STATUSES = ['playing', 'won', 'lost'];

const copyCannon = cannon => ({ ...cannon, cooldown: 0, cooldownUs: 0 });
const counts = () => Object.fromEntries(COLORS.map(color => [color, 0]));

export function createGame(levelIndex = 0) {
  const level = getLevel(levelIndex);
  return {
    version: SAVE_VERSION,
    levelIndex,
    levelId: level.id,
    voxels: level.voxels.map(voxel => ({ ...voxel })),
    slots: Array(SLOT_COUNT).fill(null),
    queues: level.queues.map(queue => queue.map(copyCannon)),
    status: 'playing',
    elapsed: 0,
    timeUs: 0,
    hits: 0,
    total: level.total,
    shotCount: 0,
    progress: { hits: 0, total: level.total },
  };
}

/** A frontmost live cube in each (x,y) ray, including after holes open up. */
export function exposedTargets(state) {
  const rays = new Map();
  for (const voxel of state.voxels) {
    if (!voxel.alive) continue;
    const key = `${voxel.x},${voxel.y}`;
    const previous = rays.get(key);
    if (!previous || voxel.z < previous.z) rays.set(key, voxel);
  }
  // Surface peeling is stable and favors the closest, uppermost matching cube.
  return [...rays.values()].sort((a, b) => a.z - b.z || b.y - a.y || a.x - b.x || a.id - b.id);
}

export function deploy(state, columnIndex) {
  if (state.status !== 'playing') return { ok: false, reason: 'round-over' };
  if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= COLORS.length) {
    return { ok: false, reason: 'invalid-column' };
  }
  if (!state.queues[columnIndex].length) return { ok: false, reason: 'empty-column' };
  const slotIndex = state.slots.indexOf(null);
  if (slotIndex === -1) return { ok: false, reason: 'slots-full' };
  const cannon = state.queues[columnIndex].shift();
  cannon.cooldown = 0;
  cannon.cooldownUs = 0;
  state.slots[slotIndex] = cannon;
  return { ok: true, slotIndex, cannon };
}

function anyMatchingTarget(state, targets = exposedTargets(state)) {
  const visibleColors = new Set(targets.map(voxel => voxel.color));
  return state.slots.some(cannon => cannon && visibleColors.has(cannon.color));
}

function currentOutcome(state) {
  if (state.hits === state.total) return 'won';
  if (state.slots.every(Boolean) && !anyMatchingTarget(state)) return 'lost';
  return 'playing';
}

function advanceTime(state, amount) {
  state.timeUs += amount;
  state.elapsed = state.timeUs / US;
  for (const cannon of state.slots) {
    if (!cannon) continue;
    cannon.cooldownUs = Math.max(0, cannon.cooldownUs - amount);
    cannon.cooldown = cannon.cooldownUs / US;
  }
}

function finishIfNecessary(state, events) {
  const outcome = currentOutcome(state);
  if (outcome === 'playing') return false;
  state.status = outcome;
  events.push({ type: outcome === 'won' ? 'win' : 'loss', levelIndex: state.levelIndex, elapsed: state.elapsed,
    reason: outcome === 'lost' ? 'all-slots-blocked' : undefined,
    campaignComplete: outcome === 'won' && nextLevelIndex(state.levelIndex) === null });
  return true;
}

/**
 * Advance by nonnegative seconds; returns ordered shot/hit/exhausted/win/loss
 * events. tick(state, 0) resolves ready shots and a just-created blockade.
 * Stopped cannons retain their ammunition. An empty slot permits recovery;
 * only FIVE occupied slots with no matching exposed color is a loss.
 */
export function tick(state, dt) {
  if (!Number.isFinite(dt) || dt < 0 || dt > 3600) {
    throw new RangeError('Tick duration must be finite and between 0 and 3600 seconds.');
  }
  if (state.status !== 'playing') return [];
  const events = [];
  let remaining = Math.round(dt * US);
  while (state.status === 'playing') {
    let fired = false;
    for (let slotIndex = 0; slotIndex < SLOT_COUNT; slotIndex++) {
      const cannon = state.slots[slotIndex];
      if (!cannon || cannon.cooldownUs > 0) continue;
      const voxel = exposedTargets(state).find(target => target.color === cannon.color);
      if (!voxel) continue;
      const target = { id: voxel.id, x: voxel.x, y: voxel.y, z: voxel.z, color: voxel.color };
      voxel.alive = false;
      cannon.ammo--;
      state.hits++;
      state.shotCount++;
      state.progress.hits = state.hits;
      const event = { slotIndex, cannonId: cannon.id, color: cannon.color, target, elapsed: state.elapsed, ammo: cannon.ammo };
      events.push({ type: 'shot', ...event }, { type: 'hit', ...event });
      fired = true;
      if (cannon.ammo === 0) {
        state.slots[slotIndex] = null;
        events.push({ type: 'exhausted', slotIndex, cannonId: cannon.id, color: cannon.color, elapsed: state.elapsed });
      } else {
        cannon.cooldownUs = FIRE_INTERVAL_US;
        cannon.cooldown = FIRE_INTERVAL;
      }
    }
    if (finishIfNecessary(state, events)) break;
    // Revisit a previously blocked, ready cannon if another slot exposed its
    // color at this same timestamp. This makes target reservation deterministic.
    if (fired) continue;
    if (remaining === 0) break;
    let nextShot = Infinity;
    for (const cannon of state.slots) {
      if (cannon && cannon.cooldownUs > 0) nextShot = Math.min(nextShot, cannon.cooldownUs);
    }
    const step = Math.min(remaining, nextShot);
    advanceTime(state, step);
    remaining -= step;
    if (nextShot === Infinity) break;
  }
  return events;
}

export function summarize(state) {
  const remainingByColor = counts();
  const exposedByColor = counts();
  for (const voxel of state.voxels) if (voxel.alive) remainingByColor[voxel.color]++;
  for (const voxel of exposedTargets(state)) exposedByColor[voxel.color]++;
  const activeCount = state.slots.filter(Boolean).length;
  const reserveCount = state.queues.reduce((sum, queue) => sum + queue.length, 0);
  const reserveAmmo = state.queues.flat().reduce((sum, cannon) => sum + cannon.ammo, 0);
  const activeAmmo = state.slots.reduce((sum, cannon) => sum + (cannon?.ammo || 0), 0);
  const progress = state.total ? state.hits / state.total : 1;
  return {
    status: state.status,
    levelIndex: state.levelIndex,
    levelNumber: state.levelIndex + 1,
    levelName: LEVELS[state.levelIndex].name,
    hits: state.hits,
    total: state.total,
    remaining: state.total - state.hits,
    progress,
    percent: Math.floor(progress * 100),
    elapsed: state.elapsed,
    activeCount,
    freeSlots: SLOT_COUNT - activeCount,
    reserveCount,
    reserveAmmo,
    activeAmmo,
    ammo: reserveAmmo + activeAmmo,
    remainingByColor,
    exposedByColor,
    blockedColors: COLORS.filter(color => !exposedByColor[color] && state.slots.some(c => c?.color === color)),
    canDeploy: state.queues.map(queue => state.status === 'playing' && activeCount < SLOT_COUNT && queue.length > 0),
    campaignComplete: state.status === 'won' && nextLevelIndex(state.levelIndex) === null,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid save: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Compact, versioned, canonical snapshot. Geometry is re-derived on restore. */
export function serialize(state) {
  const snapshot = {
    version: SAVE_VERSION,
    levelIndex: state.levelIndex,
    status: state.status,
    timeUs: state.timeUs,
    hits: state.hits,
    shotCount: state.shotCount,
    alive: state.voxels.map(voxel => voxel.alive ? 1 : 0),
    slots: state.slots.map(cannon => cannon ? [cannon.id, cannon.ammo, cannon.cooldownUs] : null),
    queueIds: state.queues.map(queue => queue.map(cannon => cannon.id)),
  };
  return JSON.stringify(snapshot);
}

/**
 * Strictly rejects malformed/stale/contradictory snapshots, including per-color
 * ammo cheats, impossible queue orders, duplicate cannon IDs and false wins.
 * Caller owns corrupted-storage recovery (usually createGame(0)).
 */
export function restore(json) {
  assert(typeof json === 'string' && json.length <= 250_000, 'expected a bounded JSON string');
  let data;
  try { data = JSON.parse(json); } catch { throw new Error('Invalid save: malformed JSON'); }
  assert(isRecord(data), 'expected an object');
  assert(data.version === SAVE_VERSION, 'unsupported version');
  assert(Number.isInteger(data.levelIndex) && data.levelIndex >= 0 && data.levelIndex < LEVELS.length, 'unknown level');
  assert(STATUSES.includes(data.status), 'unknown status');
  assert(Number.isSafeInteger(data.timeUs) && data.timeUs >= 0, 'bad elapsed time');
  const state = createGame(data.levelIndex);
  const level = LEVELS[data.levelIndex];
  assert(Array.isArray(data.alive) && data.alive.length === level.total && data.alive.every(value => value === 0 || value === 1), 'bad voxel mask');
  // Every legal ray has a removed prefix followed by a surviving suffix.
  // A removed cube behind a surviving foreground cube cannot be reached.
  const survivingRays = new Set();
  for (let index = 0; index < level.voxels.length; index++) {
    const voxel = level.voxels[index];
    const ray = `${voxel.x},${voxel.y}`;
    if (data.alive[index]) survivingRays.add(ray);
    else assert(!survivingRays.has(ray), 'voxel removed through an obstructed ray');
  }
  const hits = data.alive.reduce((sum, alive) => sum + 1 - alive, 0);
  assert(data.hits === hits && data.shotCount === hits, 'inconsistent hit count');
  assert(Array.isArray(data.slots) && data.slots.length === SLOT_COUNT, 'bad slot count');
  assert(Array.isArray(data.queueIds) && data.queueIds.length === COLORS.length, 'bad reserve columns');
  state.voxels.forEach((voxel, index) => { voxel.alive = Boolean(data.alive[index]); });
  state.timeUs = data.timeUs;
  state.elapsed = data.timeUs / US;
  state.hits = hits;
  state.shotCount = hits;
  state.progress.hits = hits;
  state.status = data.status;
  const catalogue = new Map(level.queues.flat().map(cannon => [cannon.id, cannon]));
  const queued = new Set();
  const deployed = new Set();
  const queueStarts = [];
  state.queues = data.queueIds.map((ids, columnIndex) => {
    const expected = level.queues[columnIndex];
    assert(Array.isArray(ids) && ids.length <= expected.length, 'bad reserve queue');
    const start = expected.length - ids.length;
    queueStarts[columnIndex] = start;
    return ids.map((id, index) => {
      assert(typeof id === 'string' && id === expected[start + index].id, 'reserve queue is not a valid suffix');
      assert(!queued.has(id), 'duplicate reserve cannon');
      queued.add(id);
      return copyCannon(catalogue.get(id));
    });
  });
  state.slots = data.slots.map(raw => {
    if (raw === null) return null;
    assert(Array.isArray(raw) && raw.length === 3, 'bad active cannon');
    const [id, ammo, cooldownUs] = raw;
    assert(typeof id === 'string' && catalogue.has(id), 'unknown cannon');
    assert(!queued.has(id) && !deployed.has(id), 'duplicate active cannon');
    const canonical = catalogue.get(id);
    const columnIndex = COLORS.indexOf(canonical.color);
    assert(level.queues[columnIndex].findIndex(cannon => cannon.id === id) < queueStarts[columnIndex], 'undeployed cannon in slot');
    assert(Number.isInteger(ammo) && ammo > 0 && ammo <= canonical.total, 'bad ammunition');
    assert(Number.isInteger(cooldownUs) && cooldownUs >= 0 && cooldownUs <= FIRE_INTERVAL_US, 'bad cooldown');
    deployed.add(id);
    return { ...canonical, ammo, cooldownUs, cooldown: cooldownUs / US };
  });
  const left = counts();
  const ammunition = counts();
  for (const voxel of state.voxels) if (voxel.alive) left[voxel.color]++;
  for (const cannon of [...state.slots.filter(Boolean), ...state.queues.flat()]) ammunition[cannon.color] += cannon.ammo;
  assert(COLORS.every(color => left[color] === ammunition[color]), 'per-color ammunition conservation failed');
  const outcome = currentOutcome(state);
  // A deploy followed immediately by a save may contain a not-yet-evaluated
  // blockade. Resolve it on the next tick, just as the original simulation does.
  assert(state.status === outcome || (state.status === 'playing' && outcome === 'lost'), 'status contradicts the board');
  return state;
}

/** Useful for diagnostics and tests; does not mutate the provided state. */
export function validateState(state) {
  assert(isRecord(state), 'expected a game state');
  const restored = restore(serialize(state));
  assert(state.version === SAVE_VERSION && state.levelId === restored.levelId, 'bad state identity');
  assert(state.total === restored.total && state.elapsed === restored.elapsed, 'inconsistent derived state');
  assert(isRecord(state.progress) && state.progress.hits === restored.hits && state.progress.total === restored.total, 'inconsistent progress');
  assert(state.voxels.every((voxel, index) => {
    const expected = restored.voxels[index];
    return voxel.id === expected.id && voxel.x === expected.x && voxel.y === expected.y &&
      voxel.z === expected.z && voxel.color === expected.color && voxel.alive === expected.alive;
  }), 'modified voxel geometry');
  for (const cannon of [...state.slots.filter(Boolean), ...state.queues.flat()]) {
    const expected = LEVELS[state.levelIndex].queues.flat().find(entry => entry.id === cannon.id);
    assert(expected && cannon.color === expected.color && cannon.total === expected.total, 'modified cannon identity');
    assert(cannon.cooldown === cannon.cooldownUs / US, 'inconsistent derived cooldown');
  }
  return true;
}
