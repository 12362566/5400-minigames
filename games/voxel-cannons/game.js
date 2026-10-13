/* Cube Salvo · original offline browser game · generated from src/ by node build.mjs */
(()=>{
"use strict";
const __levels=(()=>{
/** Original, deterministic voxel sculptures. No assets from the reference video. */
const COLORS = Object.freeze(['green', 'pink', 'cyan', 'ink']);
const CAMPAIGN_LENGTH = 12;

const specs = [
  { name: '脉冲花园', subtitle: '选中同色炮台，让色块飞散。', width: 12, depth: 12, height: 5, shape: 'garden', palette: 0 },
  { name: '莓心小岛', subtitle: '一颗颗色块，拼出心动的模样。', width: 14, depth: 12, height: 6, shape: 'heart', palette: 1 },
  { name: '潮汐之门', subtitle: '看清前排颜色，逐层打开大门。', width: 14, depth: 14, height: 6, shape: 'gate', palette: 2 },
  { name: '回路王冠', subtitle: '留一个空位，迎接下一个颜色。', width: 16, depth: 14, height: 6, shape: 'crown', palette: 3 },
  { name: '月光花圃', subtitle: '花瓣深处，藏着新的色彩。', width: 16, depth: 16, height: 7, shape: 'flower', palette: 1 },
  { name: '双子城堡', subtitle: '双塔并肩，考验你的出场顺序。', width: 16, depth: 18, height: 7, shape: 'citadel', palette: 0 },
  { name: '晶石要塞', subtitle: '层层剥开晶石，为新颜色留出位置。', width: 18, depth: 18, height: 7, shape: 'crystal', palette: 2 },
  { name: '环轨空间站', subtitle: '沿着色彩，探索环形空间站。', width: 18, depth: 20, height: 7, shape: 'orbit', palette: 3 },
  { name: '港湾灯塔', subtitle: '清出一条路，点亮港湾。', width: 18, depth: 20, height: 8, shape: 'beacon', palette: 0 },
  { name: '云顶神殿', subtitle: '每一层，都有自己的节奏。', width: 20, depth: 20, height: 8, shape: 'temple', palette: 1 },
  { name: '星云核心', subtitle: '为即将露出的颜色留一个空位。', width: 20, depth: 22, height: 8, shape: 'nebula', palette: 2 },
  { name: '无尽花园', subtitle: '最后一座雕塑，让它绽放。', width: 20, depth: 24, height: 8, shape: 'infinity', palette: 3 },
];

function occupied(s, x, y, z) {
  const dx = Math.abs(x - (s.width - 1) / 2);
  const dz = Math.abs(z - (s.depth - 1) / 2);
  const nx = dx / (s.width / 2);
  const nz = dz / (s.depth / 2);
  switch (s.shape) {
    case 'garden': {
      // A stepped, chamfered ziggurat: 476 cubes, a short first round.
      if (dx + dz > 9) return false;
      const h = Math.max(dx, dz) < 2 ? 5 : Math.max(dx, dz) < 4 ? 4 : 3;
      return y < h;
    }
    case 'heart': {
      // A volumetric heart footprint with a raised center.
      const a = (x - (s.width - 1) / 2) / (s.width / 2);
      const b = ((s.depth - 1) / 2 - z) / (s.depth / 2);
      const u = a * a + b * b - 0.7;
      const inside = u * u * u - a * a * b * b * b < 0;
      return inside && y < (nx + nz < 0.9 ? 6 : 4);
    }
    case 'gate':
      return (dx + dz < 11) && (y < 2 || y >= 4 || dx > 3.5);
    case 'crown':
      return (dx + dz < 12) && (y < 3 || (Math.max(dx, dz) > 4 && (y < 5 || ((x + 2 * z) % 6 < 3))));
    case 'flower': {
      const cross = (nx < 0.35 && nz < 0.9) || (nz < 0.35 && nx < 0.9);
      const round = nx * nx + nz * nz < 0.62;
      return (cross || round) && y < (nx + nz < 0.58 ? 7 : nx + nz < 0.98 ? 6 : 4);
    }
    case 'citadel': {
      const tower = (x < 5 || x >= s.width - 5) && z >= 3 && z < s.depth - 3;
      const bridge = z >= 7 && z < 11;
      return dx + dz < 14 && (y < 2 || (tower && (y < 6 || (x + z) % 4 < 2)) || (bridge && y >= 4 && y < 6));
    }
    case 'crystal':
      return nx + nz < 1.26 && y < Math.min(7, 2 + Math.ceil((1.26 - nx - nz) * 6));
    case 'orbit': {
      const r = Math.sqrt(nx * nx + nz * nz);
      const ring = r > 0.37 && r < 0.92;
      const core = nx < 0.19 && nz < 0.19;
      return (ring && y < (r < 0.73 ? 6 : 4)) || (core && y < 7) || (y < 2 && (nx < 0.1 || nz < 0.1) && r < 0.92);
    }
    case 'beacon': {
      const base = dx + dz < 14;
      const tower = nx < 0.45 && nz < 0.55;
      const lantern = nx < 0.64 && nz < 0.55;
      return (base && y < 3) || (tower && y < 6) || (lantern && y >= 6 && (y < 7 || dx + dz < 8));
    }
    case 'temple': {
      const boundary = y < 2 ? 0.98 : y < 4 ? 0.77 : y < 6 ? 0.56 : 0.35;
      return Math.max(nx, nz) < boundary && !(y < 4 && nx < 0.2 && z < s.depth / 2);
    }
    case 'nebula': {
      const r = Math.sqrt(nx * nx + nz * nz);
      const arms = (dx < 3.5 || dz < 3.5) && r < 1.03;
      const core = r < 0.72;
      return (arms || core) && y < (r < 0.25 ? 8 : r < 0.49 ? 7 : r < 0.73 ? 6 : 4);
    }
    case 'infinity': {
      const signedX = (x - (s.width - 1) / 2) / (s.width / 2);
      const signedZ = (z - (s.depth - 1) / 2) / (s.depth / 2);
      const a = Math.hypot(signedX - 0.34, signedZ);
      const b = Math.hypot(signedX + 0.34, signedZ);
      const band = (a < 0.68 && a > 0.23) || (b < 0.68 && b > 0.23);
      const central = nx < 0.22 && nz < 0.27;
      return (band && y < (nz < 0.5 ? 6 : 4)) || (central && y < 8);
    }
    default: return false;
  }
}

function colorAt(s, x, y, z, index) {
  // Broad coherent color bands, never random noise. Late depth bands reward
  // watching the newly exposed face instead of filling all five slots blindly.
  const region = index < 3
    ? Math.floor(x / 3) + Math.floor(z / 3) + Math.floor(y / 3)
    : Math.floor(x / 4) + Math.floor(z / (index < 8 ? 4 : 5)) + Math.floor(y / 2);
  return COLORS[(region + s.palette) % COLORS.length];
}

function packets(count, color, levelIndex) {
  const desired = Math.min(112, 56 + levelIndex * 5);
  const number = Math.max(1, Math.ceil(count / desired));
  const small = Math.floor(count / number);
  const extra = count % number;
  return Array.from({ length: number }, (_, i) => Object.freeze({
    id: `l${levelIndex}-${color}-${i}`,
    color,
    ammo: small + (i < extra ? 1 : 0),
    total: small + (i < extra ? 1 : 0),
    cooldown: 0,
    cooldownUs: 0,
  }));
}

function makeLevel(s, index) {
  const voxels = [];
  const colorCounts = Object.fromEntries(COLORS.map(color => [color, 0]));
  for (let z = 0; z < s.depth; z++) {
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        if (!occupied(s, x, y, z)) continue;
        const color = colorAt(s, x, y, z, index);
        colorCounts[color]++;
        voxels.push(Object.freeze({ id: voxels.length, x, y, z, color, alive: true }));
      }
    }
  }
  return Object.freeze({
    index,
    id: `sculpture-${index + 1}`,
    name: s.name,
    subtitle: s.subtitle,
    width: s.width,
    height: s.height,
    depth: s.depth,
    dimensions: Object.freeze({ width: s.width, height: s.height, depth: s.depth }),
    voxels: Object.freeze(voxels),
    total: voxels.length,
    colorCounts: Object.freeze(colorCounts),
    queues: Object.freeze(COLORS.map(color => Object.freeze(packets(colorCounts[color], color, index)))),
  });
}

const LEVELS = Object.freeze(specs.map(makeLevel));

/** Campaign indices are zero-based. There is deliberately no wraparound. */
function getLevel(index) {
  if (!Number.isInteger(index) || index < 0 || index >= LEVELS.length) {
    throw new RangeError(`Level index must be between 0 and ${LEVELS.length - 1}.`);
  }
  return LEVELS[index];
}

function nextLevelIndex(index) {
  getLevel(index);
  return index + 1 < LEVELS.length ? index + 1 : null;
}

return {COLORS,CAMPAIGN_LENGTH,LEVELS,getLevel,nextLevelIndex};
})();
const __engine=(()=>{
/**
 * Deterministic simulation for a color-sorting voxel shooter.
 *
 * Deliberate adaptation: every cube takes exactly ONE matching hit. A shot
 * reserves/removes its cube immediately; renderer bullets are cosmetic only.
 * Four front-to-back reserve queues feed five active slots. Timers are integer
 * microseconds. No DOM, random source, wall clock, renderer, or dependencies.
 */
const { COLORS, LEVELS, getLevel, nextLevelIndex } = __levels;

const SLOT_COUNT = 5;
const FIRE_INTERVAL = 0.095;
const FIRE_INTERVAL_US = 95_000;
const SAVE_VERSION = 1;
const US = 1_000_000;
const STATUSES = ['playing', 'won', 'lost'];

const copyCannon = cannon => ({ ...cannon, cooldown: 0, cooldownUs: 0 });
const counts = () => Object.fromEntries(COLORS.map(color => [color, 0]));

function createGame(levelIndex = 0) {
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
function exposedTargets(state) {
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

function deploy(state, columnIndex) {
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
function tick(state, dt) {
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

function summarize(state) {
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
function serialize(state) {
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
function restore(json) {
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
function validateState(state) {
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

return {COLORS,LEVELS,nextLevelIndex,SLOT_COUNT,FIRE_INTERVAL,FIRE_INTERVAL_US,SAVE_VERSION,createGame,exposedTargets,deploy,tick,summarize,serialize,restore,validateState};
})();
const __renderer=(()=>{
const PALETTE = {
  green: {name:'青柠',hex:'#74c95a',light:'#a3e879',dark:'#429940',side:'#59ac48',ink:'#234329',symbol:'◆'},
  pink: {name:'莓果',hex:'#f27a9e',light:'#ffafbd',dark:'#cd527b',side:'#de638c',ink:'#702c48',symbol:'♥'},
  cyan: {name:'晴空',hex:'#59cbdc',light:'#96e9ed',dark:'#279daF',side:'#3ab5ca',ink:'#22596b',symbol:'●'},
  ink: {name:'墨蓝',hex:'#56627c',light:'#8591a8',dark:'#333e58',side:'#424e67',ink:'#fff',symbol:'✦'}
};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function polygon(ctx,p,fill,stroke){ctx.beginPath();p.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.55;ctx.stroke();}}
function mix(a,b,t){return a.map((v,i)=>v+(b[i]-v)*t);}
function cannonSVG(color, ammo, options={}){
  const p=PALETTE[color]||PALETTE.green;
  return `<svg viewBox="0 0 80 76" aria-hidden="true" focusable="false"><ellipse cx="40" cy="66" rx="29" ry="6" fill="#243244" opacity=".13"/><path d="M15 50Q13 43 21 42H59Q67 43 65 50L62 61Q59 67 52 67H27Q20 66 18 61Z" fill="${p.dark}"/><path d="M17 44Q17 38 24 37H56Q64 39 64 45L61 57Q59 62 52 62H28Q21 62 19 56Z" fill="${p.hex}" stroke="${p.dark}" stroke-width="1.4"/><path d="M23 40Q27 36 40 36Q56 36 59 41L55 48H27Z" fill="${p.light}"/><rect x="30" y="5" width="21" height="31" rx="8" fill="${p.dark}"/><rect x="33" y="4" width="17" height="30" rx="7" fill="${p.hex}"/><ellipse cx="41.5" cy="7" rx="8.5" ry="4.5" fill="${p.light}"/><ellipse cx="41.5" cy="7" rx="5.7" ry="2.7" fill="${p.dark}"/><path d="M24 33Q24 22 40 22Q56 22 57 34L55 44Q52 50 40 50Q28 50 25 44Z" fill="${p.hex}" stroke="${p.dark}" stroke-width="1.3"/><path d="M29 28Q38 22 49 27" fill="none" stroke="${p.light}" stroke-width="3" stroke-linecap="round"/><text x="40" y="41" text-anchor="middle" font-family="ui-rounded,system-ui,sans-serif" font-size="16" font-weight="900" fill="white" stroke="${p.dark}" stroke-width="3" paint-order="stroke">${ammo}</text><path d="M24 54H30M50 54H56" stroke="${p.light}" stroke-width="3" stroke-linecap="round"/></svg>`;
}
class VoxelRenderer {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:true});
    this.cache=document.createElement('canvas');this.bctx=this.cache.getContext('2d');
    this.state=null;this.level=null;this.lastRevision='';this.bullets=[];this.particles=[];this.rings=[];
    this.time=0;this.reduced=false;this.frame=0;this.lastPaint=0;this.width=1;this.height=1;
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
  }
  resize(){
    const r=this.canvas.getBoundingClientRect();if(r.width<1||r.height<1)return;
    this.width=r.width;this.height=r.height;this.dpr=Math.min(devicePixelRatio||1,2);
    this.canvas.width=Math.round(r.width*this.dpr);this.canvas.height=Math.round(r.height*this.dpr);
    this.cache.width=this.canvas.width;this.cache.height=this.canvas.height;
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.bctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    this.layout();this.lastRevision='';
  }
  setState(state,level){this.state=state;this.level=level;this.bullets=[];this.particles=[];this.rings=[];this.sorted=state.voxels.slice().sort((a,b)=>(a.x-a.z+a.y*.7)-(b.x-b.z+b.y*.7));this.layout();this.lastRevision='';}
  layout(){
    if(!this.level)return;
    const l=this.level,w=l.width,d=l.depth,h=l.height;
    const rawW=w+d*.38,rawH=w*.15+d*.70+h*.90;
    const top=this.height<230?10:18,bottom=this.height<230?27:42;
    this.scale=Math.min((this.width-30)/rawW,(this.height-top-bottom)/rawH);
    this.scale=Math.max(1,this.scale);
    this.originX=(this.width-rawW*this.scale)/2+d*.38*this.scale;
    const freeHeight=Math.max(0,this.height-top-bottom-rawH*this.scale);
    this.originY=top+freeHeight*.48+rawH*this.scale;
    this.modelBounds={left:(this.width-rawW*this.scale)/2,top:top+freeHeight*.48,width:rawW*this.scale,height:rawH*this.scale};
  }
  point(x,y,z){return [this.originX+(x-z*.38)*this.scale,this.originY+(-x*.15-z*.70-y*.90)*this.scale];}
  frontPoint(v){return this.point(v.x+.5,v.y+.5,v.z);}
  sourcePoint(slot){
    const cannon=document.querySelector(`#active-slots .slot:nth-child(${slot+1}) .cannon`);
    if(cannon){const r=cannon.getBoundingClientRect(),c=this.canvas.getBoundingClientRect();return [r.left+r.width*.52-c.left,r.top+r.height*.12-c.top];}
    return [this.width*(.16+slot*.17),this.height+5];
  }
  events(events){
    for(const e of events){if(e.type==='shot'){
      const end=this.frontPoint(e.target),start=this.sourcePoint(e.slotIndex),duration=.15+Math.abs(end[1]-start[1])/1500;
      this.bullets.push({start,end,color:e.color,t:0,duration,target:e.target,seed:(e.target.id*17||this.frame)%997});
    }}
  }
  drawBoard(){
    const c=this.bctx;c.clearRect(0,0,this.width,this.height);if(!this.state)return;
    const l=this.level,s=this.scale;
    // Low, dark-rimmed display plinth gives every sculpture a stable footprint.
    const footprint=[this.point(-.7,-.22,-.6),this.point(l.width+.7,-.22,-.6),this.point(l.width+.7,-.22,l.depth+.6),this.point(-.7,-.22,l.depth+.6)];
    const shadow=footprint.map(p=>[p[0]+s*.45,p[1]+s*.9]);polygon(c,shadow,'rgba(68,50,70,.10)');
    const lower=footprint.map(p=>[p[0],p[1]+s*.4]);
    polygon(c,[footprint[0],footprint[1],lower[1],lower[0]],'#454157');
    polygon(c,[footprint[1],footprint[2],lower[2],lower[1]],'#39384e');
    polygon(c,footprint,'#777089','#514962');
    const rim=[this.point(-.28,-.15,-.24),this.point(l.width+.28,-.15,-.24),this.point(l.width+.28,-.15,l.depth+.24),this.point(-.28,-.15,l.depth+.24)];
    polygon(c,rim,'#e5d7dc');
    // Exposed faces only. Every cube occupies an actual 3D grid coordinate.
    const occupied=new Set(this.state.voxels.filter(v=>v.alive).map(v=>`${v.x},${v.y},${v.z}`));
    const has=(x,y,z)=>occupied.has(`${x},${y},${z}`);
    for(const v of this.sorted){
      if(!v.alive)continue;
      const top=!has(v.x,v.y+1,v.z),front=!has(v.x,v.y,v.z-1),right=!has(v.x+1,v.y,v.z);
      if(!top&&!front&&!right)continue;
      const p=PALETTE[v.color],x=v.x,y=v.y,z=v.z,gap=.035;
      const a=this.point(x+gap,y+gap,z+gap),b=this.point(x+1-gap,y+gap,z+gap),c0=this.point(x+1-gap,y+1-gap,z+gap),d0=this.point(x+gap,y+1-gap,z+gap);
      const e=this.point(x+gap,y+1-gap,z+1-gap),f=this.point(x+1-gap,y+1-gap,z+1-gap),g=this.point(x+1-gap,y+gap,z+1-gap);
      if(front){polygon(c,[a,b,c0,d0],p.hex,p.dark);if(s>8){c.strokeStyle=p.light;c.lineWidth=.6;c.beginPath();c.moveTo(d0[0]+.7,d0[1]+.8);c.lineTo(c0[0]-.7,c0[1]+.8);c.stroke();}}
      if(right)polygon(c,[b,g,f,c0],p.side,p.dark);
      if(top){polygon(c,[d0,c0,f,e],p.light,p.hex);if(s>10){const center=mix(mix(d0,c0,.5),mix(e,f,.5),.5);const inset=[d0,c0,f,e].map(q=>mix(center,q,.55));polygon(c,inset,p.hex);c.globalAlpha=.35;polygon(c,inset,p.light);c.globalAlpha=1;}}
    }
    // Inset ticks signal the shooting edge without explanatory UI.
    c.strokeStyle='rgba(255,255,255,.65)';c.lineWidth=2;
    for(let i=0;i<5;i++){const q=this.point(l.width*(.13+.18*i),-.6,-.5);c.beginPath();c.moveTo(q[0]-s*.28,q[1]);c.lineTo(q[0]+s*.28,q[1]-s*.07);c.stroke();}
  }
  burst(b){
    const p=PALETTE[b.color];this.rings.push({x:b.end[0],y:b.end[1],t:0,color:p.light});
    if(this.reduced)return;
    for(let i=0;i<6;i++){const angle=(b.seed*.47+i*2.399),speed=25+(i%3)*18;this.particles.push({x:b.end[0],y:b.end[1],vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-24,t:0,size:2.5+(i%3),color:i%2?p.light:p.hex});}
  }
  render(dt){
    this.time+=dt;this.frame++;const c=this.ctx;
    const revision=this.state?`${this.state.levelIndex}:${this.state.hits}:${this.width}:${this.height}`:'';
    if(revision!==this.lastRevision){this.drawBoard();this.lastRevision=revision;}
    c.clearRect(0,0,this.width,this.height);c.drawImage(this.cache,0,0,this.width,this.height);
    for(let i=this.bullets.length-1;i>=0;i--){const b=this.bullets[i];b.t+=dt;const t=clamp(b.t/b.duration,0,1);if(t>=1){this.burst(b);this.bullets.splice(i,1);continue;}
      const q=mix(b.start,b.end,t),tail=mix(b.start,b.end,Math.max(0,t-.17));
      c.beginPath();c.moveTo(tail[0],tail[1]);c.lineTo(q[0],q[1]);c.lineWidth=this.reduced?2:4;c.lineCap='round';c.strokeStyle=PALETTE[b.color].light;c.stroke();
      c.beginPath();c.moveTo(tail[0],tail[1]);c.lineTo(q[0],q[1]);c.lineWidth=1.8;c.strokeStyle='#fffef4';c.stroke();
      c.beginPath();c.arc(q[0],q[1],2.8,0,Math.PI*2);c.fillStyle='#fff';c.fill();
    }
    for(let i=this.rings.length-1;i>=0;i--){const r=this.rings[i];r.t+=dt;if(r.t>.23){this.rings.splice(i,1);continue;}c.globalAlpha=(1-r.t/.23)*.7;c.strokeStyle=r.color;c.lineWidth=2;c.beginPath();c.arc(r.x,r.y,3+r.t*35,0,Math.PI*2);c.stroke();}
    c.globalAlpha=1;
    for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.t+=dt;if(p.t>.58){this.particles.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=100*dt;c.globalAlpha=1-p.t/.58;c.fillStyle=p.color;c.save();c.translate(p.x,p.y);c.rotate(p.t*4);c.fillRect(-p.size/2,-p.size/2,p.size,p.size);c.restore();}c.globalAlpha=1;
  }
  destroy(){this.observer.disconnect();}
}

return {PALETTE,cannonSVG,VoxelRenderer};
})();
const __app=(()=>{
const { createGame, deploy, tick, exposedTargets, serialize, restore } = __engine;
const { LEVELS } = __levels;
const { VoxelRenderer, PALETTE, cannonSVG } = __renderer;
const $=id=>document.getElementById(id);
const SAVE_KEY='cube-salvo-v1';
const query=new URLSearchParams(location.search);
const qaMode=query.has('qa');
let state,unlocked=1,best={},sound=false,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,userPaused=false,saveError=false;
let dirty=false,lastSave=0,lastFrame=0,lastHUD=0,toastUntil=0,lastUI='',lastQueues='',lastStatus='',resultShown=false;
let audioContext=null,lastAudio=0,confirmAction=null;
function safeLoad(){
  if(qaMode)return;
  try{
    const raw=localStorage.getItem(SAVE_KEY);if(!raw)return;
    const data=JSON.parse(raw);if(data.version!==1)throw new Error('save version');
    state=restore(data.game);unlocked=Math.max(1,Math.min(LEVELS.length,Math.floor(Number(data.unlocked)||1)));
    if(state.levelIndex>=unlocked)unlocked=state.levelIndex+1;
    if(data.best&&typeof data.best==='object')for(const [k,v] of Object.entries(data.best)){if(/^\d+$/.test(k)&&Number.isFinite(v)&&v>=0)best[k]=v;}
    sound=data.sound===true;reduced=data.reduced===true||reduced;
    userPaused=state.status==='playing'&&state.slots.some(Boolean);
  }catch(e){state=null;toastUntil=-1;}
}
safeLoad();
state=state||createGame(0);
const renderer=new VoxelRenderer($('game-canvas'));
renderer.setState(state,LEVELS[state.levelIndex]);renderer.reduced=reduced;
const pauseCard=document.createElement('div');pauseCard.id='pause-card';pauseCard.className='pause-card';pauseCard.hidden=true;
pauseCard.innerHTML='<span class="pause-symbol" aria-hidden="true">Ⅱ</span><strong>歇一会儿</strong><span>进度在这里，随时接着打</span><button id="continue-game" class="button button-primary">继续游戏</button>';
$('stage').append(pauseCard);
const dialogIds=['menu-dialog','level-dialog','result-dialog','confirm-dialog'];
const dialogs=dialogIds.map($);
function anyDialog(){return dialogs.some(d=>d.open);}
function paused(){return userPaused||anyDialog()||document.hidden;}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');toastUntil=performance.now()+2300;}
function save(force=false){
  if(qaMode)return;
  if(!force&&!dirty)return;
  lastSave=performance.now();
  try{localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,game:serialize(state),unlocked,best,sound,reduced}));dirty=false;saveError=false;lastSave=performance.now();}
  catch(e){if(!saveError){toast('浏览器暂时不能保存，当前游戏仍可继续');saveError=true;}}
}
function soundInit(){if(!sound)return;try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();}catch(e){sound=false;}}
function ping(color){
  if(!sound||!audioContext||performance.now()-lastAudio<65)return;
  lastAudio=performance.now();const a=audioContext,t=a.currentTime,o=a.createOscillator(),g=a.createGain();
  o.type='sine';const f={green:590,pink:740,cyan:880,ink:440}[color]||590;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f*.65,t+.055);
  g.gain.setValueAtTime(.025,t);g.gain.exponentialRampToValueAtTime(.0001,t+.075);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+.08);
}
function closeAll(){dialogs.forEach(d=>{if(d.open)d.close();});}
function openDialog(id){const d=$(id);if(!d.open)d.showModal();renderHUD(true);save(true);}
function updateSettings(){
  $('sound-button').textContent=`音效：${sound?'开':'关'}`;$('sound-button').setAttribute('aria-pressed',String(sound));
  $('motion-button').textContent=`轻动效：${reduced?'开':'关'}`;$('motion-button').setAttribute('aria-pressed',String(reduced));
  document.body.classList.toggle('reduce-motion',reduced);renderer.reduced=reduced;
}
function theme(color){const p=PALETTE[color];return `--c:${p.hex};--dark:${p.dark};--light:${p.light}`;}
function updateQueues(){
  const signature=state.queues.map(q=>q.map(c=>`${c.id}:${c.ammo}`).join(',')).join('|');
  const disabled=paused()||state.status!=='playing'||state.slots.every(Boolean);
  let focusColumn=null;
  if(signature!==lastQueues){
    focusColumn=document.activeElement?.dataset?.column??null;
    lastQueues=signature;
    $('queue-buttons').innerHTML=state.queues.map((q,col)=>{
      const color=q[0]?.color||Object.keys(PALETTE)[col],p=PALETTE[color],head=q[0];
      return `<button class="queue-button ${head?'':'empty'}" data-column="${col}" style="${theme(color)}" aria-label="${head?`${p.name}炮手，${head.ammo}发，待命${q.length}个。按${col+1}上阵`:`${p.name}炮手已用完`}" ${head?'':'disabled'}><span class="queue-tail" style="--i:2" aria-hidden="true"></span><span class="queue-tail" style="--i:1" aria-hidden="true"></span><span class="queue-tail" style="--i:0" aria-hidden="true"></span><span class="queue-art">${head?cannonSVG(color,head.ammo):'<span class="queue-finished">✓</span>'}</span><span class="queue-label"><span class="color-label">${p.symbol} ${p.name}</span><span class="queue-count">${head?`×${q.length}`:'完成'}</span></span><span class="key-cap" aria-hidden="true">${col+1}</span></button>`;
    }).join('');
  }
  $('queue-buttons').querySelectorAll('button').forEach((b,i)=>b.disabled=disabled||!state.queues[i].length);
  if(focusColumn!==null){const replacement=$('queue-buttons').querySelector(`[data-column="${focusColumn}"]`);if(replacement&&!replacement.disabled)replacement.focus({preventScroll:true});else ($('queue-buttons').querySelector('button:not(:disabled)')||$('menu-button')).focus({preventScroll:true});}
}
function renderHUD(force=false){
  const active=state.slots.filter(Boolean).length,visible=exposedTargets(state);
  const signature=state.slots.map(c=>c?`${c.id}:${c.ammo}`:'_').join('|');
  if(signature!==lastUI||force){
    lastUI=signature;
    const targets=new Set(visible.map(v=>v.color));
    $('active-slots').innerHTML=state.slots.map((c,i)=>c?`<div role="group" class="slot occupied ${targets.has(c.color)?'firing':'blocked'}" style="${theme(c.color)}" aria-label="${PALETTE[c.color].name}炮手，剩${c.ammo}发，${targets.has(c.color)?'射击中':'等待同色方块'}"><span class="cannon">${cannonSVG(c.color,c.ammo)}</span><span class="slot-state">${targets.has(c.color)?'射击中':'等待同色'}</span></div>`:`<div role="group" class="slot empty" aria-label="空闲炮位 ${i+1}"><span class="slot-number">${i+1}</span><span class="slot-state">空位</span></div>`).join('');
  }
  const level=LEVELS[state.levelIndex],pct=Math.round(state.hits/state.total*100);
  $('level-label').textContent=`${String(state.levelIndex+1).padStart(2,'0')} / ${String(LEVELS.length).padStart(2,'0')} · ${level.name}`;
  $('progress-label').textContent=`${pct}%`;$('progress-fill').style.width=`${pct}%`;
  $('progress-fill').parentElement.setAttribute('aria-valuenow',String(pct));
  if($('remaining-label'))$('remaining-label').textContent=`剩余 ${state.total-state.hits} 块`;
  const surface=Object.keys(PALETTE).map(color=>{const count=visible.filter(v=>v.color===color).length;return count?`${PALETTE[color].name}${count}块`:null;}).filter(Boolean).join('、');
  $('game-canvas').setAttribute('aria-label',`${level.name}，立体方块雕塑，剩余${state.total-state.hits}块。当前外层可命中：${surface||'已清空'}。下方选择同色炮手自动射击。`);
  let hint='点下方炮手上阵，自动击碎同色方块';
  if(active===5)hint='炮位已满，等弹药用完就会空出位置';
  else if(state.hits>0)hint='留意外层颜色，给新颜色留一个空位';
  if(state.status==='won')hint='所有方块已清空，漂亮！';
  if(state.status==='lost')hint='炮位被堵住了，换个上阵顺序再试';
  if(userPaused)hint='游戏已暂停，进度已保留';
  $('hint').textContent=hint;
  const status=paused()?'已暂停':active?`上阵 ${active} / 5`:'选一位炮手开始';
  if(status!==lastStatus){$('status-label').textContent=status;lastStatus=status;}
  pauseCard.hidden=!userPaused||anyDialog();
  updateQueues();
}
function selectColumn(col){
  if(paused()||state.status!=='playing')return;
  soundInit();
  const result=deploy(state,col);
  if(result.ok){dirty=true;renderHUD(true);save(true);}
  else if(result.reason==='slots-full')toast('5 个炮位已经满了，等一个空位');
}
$('queue-buttons').addEventListener('click',e=>{const b=e.target.closest('[data-column]');if(b)selectColumn(Number(b.dataset.column));});
$('menu-button').addEventListener('click',()=>openDialog('menu-dialog'));
$('close-menu').addEventListener('click',()=>{$('menu-dialog').close();renderHUD(true);});
$('resume-button').addEventListener('click',()=>{closeAll();userPaused=false;soundInit();renderHUD(true);});
$('continue-game').addEventListener('click',()=>{userPaused=false;soundInit();renderHUD(true);});
function askRestart(){
  $('confirm-title').textContent='重新开始这一关？';$('confirm-copy').textContent='这一关的消除进度会重置，已经解锁的关卡会保留。';$('confirm-ok').textContent='重新开始';
  confirmAction=()=>startLevel(state.levelIndex);openDialog('confirm-dialog');
}
$('restart-button').addEventListener('click',askRestart);
$('confirm-cancel').addEventListener('click',()=>{$('confirm-dialog').close();confirmAction=null;renderHUD(true);});
$('confirm-ok').addEventListener('click',()=>{const action=confirmAction;confirmAction=null;$('confirm-dialog').close();action?.();});
$('sound-button').addEventListener('click',()=>{sound=!sound;soundInit();updateSettings();dirty=true;save(true);});
$('motion-button').addEventListener('click',()=>{reduced=!reduced;updateSettings();dirty=true;save(true);});
function renderLevels(){
  $('level-grid').innerHTML=LEVELS.map((l,i)=>`<button class="level-button ${i===state.levelIndex?'current':''} ${best[i]!==undefined?'completed':''}" data-level="${i}" ${i>=unlocked?'disabled':''} aria-label="第${i+1}关 ${l.name}${i>=unlocked?'，未解锁':best[i]!==undefined?'，已通关':''}"><span class="level-number">${i>=unlocked?'锁定':String(i+1).padStart(2,'0')}</span><span>${l.name}</span><span class="level-mark">${best[i]!==undefined?'✓':i===state.levelIndex?'进行中':''}</span></button>`).join('');
}
$('levels-button').addEventListener('click',()=>{renderLevels();openDialog('level-dialog');});
$('close-levels').addEventListener('click',()=>{$('level-dialog').close();renderHUD(true);});
$('level-grid').addEventListener('click',e=>{
  const b=e.target.closest('[data-level]');if(!b||b.disabled)return;const n=Number(b.dataset.level);
  if(n===state.levelIndex){closeAll();renderHUD(true);return;}
  if(state.hits>0&&state.status==='playing'){
    $('confirm-title').textContent='切换关卡？';$('confirm-copy').textContent='当前关卡的消除进度会重置，已经解锁的关卡会保留。';$('confirm-ok').textContent='切换关卡';confirmAction=()=>startLevel(n);openDialog('confirm-dialog');
  }else startLevel(n);
});
function startLevel(index){
  if(index<0||index>=LEVELS.length||index>=unlocked)return;
  closeAll();state=createGame(index);userPaused=false;resultShown=false;lastQueues='';lastUI='';
  renderer.setState(state,LEVELS[index]);dirty=true;renderHUD(true);save(true);
}
function showResult(){
  if(resultShown)return;resultShown=true;
  const won=state.status==='won',final=won&&state.levelIndex===LEVELS.length-1;
  if(won){unlocked=Math.min(LEVELS.length,Math.max(unlocked,state.levelIndex+2));best[state.levelIndex]=Math.min(best[state.levelIndex]??Infinity,Math.round(state.elapsed));}
  $('result-eyebrow').textContent=won?(final?'ALL CLEAR · 全部通关':'LEVEL CLEAR · 清空成功'):'TRY AGAIN · 再来一次';
  $('result-title').textContent=won?(final?'12 座方块岛，全部清空！':'这一关，清得漂亮！'):'炮位有点挤';
  $('result-copy').textContent=won?`你用 ${state.shotCount} 发弹药清空了 ${state.total} 块方块。${final?'全部关卡已完成，可以回到第一关挑战新的上阵顺序。':'下一座雕塑已经解锁。'}`:'5 个炮位都在等待被挡住的颜色。先选能打到外层的炮手，给新颜色留一个空位。';
  $('next-button').hidden=!won;$('next-button').textContent=final?'从第一关再玩':'下一关';$('retry-button').textContent=won?'重玩这一关':'重新挑战';
  dirty=true;save(true);openDialog('result-dialog');
}
$('next-button').addEventListener('click',()=>startLevel(state.levelIndex===LEVELS.length-1?0:state.levelIndex+1));
$('retry-button').addEventListener('click',()=>startLevel(state.levelIndex));
for(const d of dialogs){
  d.addEventListener('close',()=>{if(d.id==='result-dialog'&&state.status!=='playing')resultShown=false;renderHUD(true);});
  d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){if(d.id!=='result-dialog')d.close();}});
}
$('result-dialog').addEventListener('cancel',e=>e.preventDefault());
window.addEventListener('keydown',e=>{
  if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  if(anyDialog())return;
  if(/^[1-4]$/.test(e.key)){e.preventDefault();selectColumn(Number(e.key)-1);}
  if(e.code==='Space'&&!e.target.closest?.('button,a,summary,[role=button]')){e.preventDefault();if(state.status==='playing'){userPaused=!userPaused;renderHUD(true);save(true);}}
  if(e.key==='Escape'){e.preventDefault();openDialog('menu-dialog');}
  if(e.key.toLowerCase()==='r'){e.preventDefault();askRestart();}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){save(true);if(state.status==='playing'&&state.slots.some(Boolean))userPaused=true;}lastFrame=0;renderHUD(true);});
window.addEventListener('pagehide',()=>save(true));
window.addEventListener('beforeunload',()=>save(true));
updateSettings();renderHUD(true);
if(toastUntil===-1)toast('旧进度无法读取，已为你开启新的一关');
function frame(now){
  const dt=lastFrame?Math.min((now-lastFrame)/1000,.05):0;lastFrame=now;
  if(!paused()&&state.status==='playing'){
    const events=tick(state,dt);
    if(events.length){renderer.events(events);dirty=true;const shot=events.find(e=>e.type==='shot');if(shot)ping(shot.color);}
  }
  renderer.render(paused()?0:dt);
  if(now-lastHUD>90){renderHUD();lastHUD=now;}
  if(state.status!=='playing'&&!resultShown&&!anyDialog())showResult();
  if(dirty&&now-lastSave>1800)save();
  if(toastUntil>0&&now>toastUntil){$('toast').classList.remove('show');toastUntil=0;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// A local, explicit test route. It is inert in the normal game and never contacts a service.
if(qaMode){window.cubeSalvoQA={get state(){return state;},get unlocked(){return unlocked;},get paused(){return paused();},get renderer(){return renderer;},createGame,deploy,tick,restore,serialize,LEVELS,exposedTargets,
  load(s){closeAll();state=s;unlocked=12;userPaused=false;resultShown=false;lastQueues='';renderer.setState(state,LEVELS[state.levelIndex]);renderHUD(true);},
  render(){renderHUD(true);renderer.render(0);},setPaused(value){userPaused=value;renderHUD(true);},startLevel,
  checkGeometry(){const items=['game-canvas','menu-button','queue-buttons','active-slots','hint','controls'];return Object.fromEntries(items.map(id=>{const r=$(id).getBoundingClientRect();return[id,{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}]}));}};}

return {};
})();
})();
