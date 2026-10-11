/**
 * Deterministic, DOM-free marble-road defense simulation.
 * All live data is under game.state. Coordinates are grid-cell centers (0..8, 0..10).
 * update(seconds) uses 60 Hz fixed steps, accepting up to five elapsed seconds per call.
 * serialize() returns a JSON-safe object; Game.restore accepts that object or its JSON.
 */
export const COLS = 9;
export const ROWS = 11;
export const TOTAL_WAVES = 8;
export const MAX_HEROES = 12;
export const MAX_EFFECTS = 100;
const STEP = 1 / 60;
const TAU = Math.PI * 2;
const PHASES = ['build', 'battle', 'reward', 'route', 'won', 'lost'];
const owns = (object, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(object, key);

export const HEROES = Object.freeze({
  blade: Object.freeze({ id: 'blade', name: '旋刃卫', short: '刃', icon: '⚔', cost: 50, color: '#f8d16d', damage: 14, range: 1.75, period: 1.8, description: '旋转利刃，近身群伤；合成后增加刀刃。' }),
  fire: Object.freeze({ id: 'fire', name: '烈焰师', short: '焰', icon: '🔥', cost: 60, color: '#fb8c54', damage: 12, range: 1.72, period: 2.05, description: '火球绕身，接触爆炸并留下灼烧。' }),
  frost: Object.freeze({ id: 'frost', name: '寒霜灵', short: '霜', icon: '❄', cost: 70, color: '#8ce6f3', damage: 10, range: 1.83, period: 1.95, description: '冰晶接触减速，让敌人多挨几刀。' }),
  thunder: Object.freeze({ id: 'thunder', name: '雷鸣使', short: '雷', icon: 'ϟ', cost: 80, color: '#ccafff', damage: 13, range: 1.78, period: 1.95, description: '雷珠命中后，闪电弹向附近两个敌人。' }),
});

export const RELICS = Object.freeze({
  sharp: Object.freeze({ id: 'sharp', name: '磨刀石', icon: '✦', color: '#f8d16d', description: '所有英雄伤害 +25%。' }),
  haste: Object.freeze({ id: 'haste', name: '疾风铃', icon: '≋', color: '#a9e9c0', description: '所有武器旋转速度 +22%。' }),
  reach: Object.freeze({ id: 'reach', name: '长柄徽章', icon: '↗', color: '#9ddcf0', description: '所有武器攻击半径 +0.18 格。' }),
  bounty: Object.freeze({ id: 'bounty', name: '招财铜钱', icon: '◈', color: '#ffcc72', description: '立即获得 50 金币；击杀金币 +30%。' }),
  hatchery: Object.freeze({ id: 'hatchery', name: '孵化护符', icon: '◉', color: '#f2c2ff', description: '蛋所受伤害 +70%；孵化时额外获得 15 金币。' }),
  fortress: Object.freeze({ id: 'fortress', name: '守护之心', icon: '♥', color: '#ff9d9d', description: '恢复 4 点生命；所有英雄伤害 +10%。' }),
  winter: Object.freeze({ id: 'winter', name: '霜冬沙漏', icon: '⌛', color: '#99dfed', description: '所有敌人移动速度 -15%。' }),
  ember: Object.freeze({ id: 'ember', name: '余烬之种', icon: '✹', color: '#ffa974', description: '每次武器接触额外灼烧敌人 2 秒。' }),
});

function linePath(points) {
  const result = [points[0].slice()];
  for (let i = 1; i < points.length; i++) {
    let [x, y] = result[result.length - 1];
    const [tx, ty] = points[i];
    while (x !== tx || y !== ty) {
      if (x !== tx) x += Math.sign(tx - x);
      else y += Math.sign(ty - y);
      result.push([x, y]);
    }
  }
  return result;
}
const EGG_PATH = [[2, 10], [3, 10], [4, 10], [5, 10], [6, 10], [7, 10]];
export const MAPS = Object.freeze([
  { id: 'meadow', name: '青苔曲径', title: '青苔曲径', description: '均衡路线，弯道适合夹击。', path: linePath([[0, 0], [1, 0], [1, 3], [7, 3], [7, 6], [1, 6], [1, 8], [8, 8]]), eggPath: EGG_PATH, goldMultiplier: 1, healthMultiplier: 1, speedMultiplier: 1, color: '#80b772' },
  { id: 'quarry', name: '琥珀矿道', title: '琥珀矿道', description: '敌人生命 +16%，金币收益 +25%。', path: linePath([[8, 0], [7, 0], [7, 2], [1, 2], [1, 5], [7, 5], [7, 8], [0, 8]]), eggPath: EGG_PATH, goldMultiplier: 1.25, healthMultiplier: 1.16, speedMultiplier: 1, color: '#b8a263' },
  { id: 'brook', name: '清霜溪谷', title: '清霜溪谷', description: '敌人生命 -12%，金币收益 -15%。', path: linePath([[0, 0], [1, 0], [1, 2], [7, 2], [7, 5], [1, 5], [1, 8], [8, 8]]), eggPath: EGG_PATH, goldMultiplier: 0.85, healthMultiplier: 0.88, speedMultiplier: 1, color: '#78b8a9' },
].map(map => Object.freeze({ ...map, path: Object.freeze(map.path.map(Object.freeze)), eggPath: Object.freeze(map.eggPath.map(point => Object.freeze(point.slice()))) })));

export function isBuildable(x, y, mapIndex = 0) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
  const map = Number.isInteger(mapIndex) ? MAPS[mapIndex] : null;
  return !!map && !map.path.some(p => p[0] === x && p[1] === y) && !map.eggPath.some(p => p[0] === x && p[1] === y);
}

export function heroStats(hero, relics = []) {
  const base = owns(HEROES, hero?.type) ? HEROES[hero.type] : HEROES.blade;
  const level = Math.max(1, Math.min(6, Math.trunc(hero?.level || 1)));
  const has = id => relics.includes(id);
  const blades = 1 + Math.floor(level / 2);
  const range = base.range + (level - 1) * 0.025 + (has('reach') ? 0.18 : 0);
  return {
    damage: Math.round(base.damage * Math.pow(1.61, level - 1) * (has('sharp') ? 1.25 : 1) * (has('fortress') ? 1.1 : 1)),
    range, orbit: range - 0.38, period: base.period / (1 + (level - 1) * 0.045) / (has('haste') ? 1.22 : 1),
    blades, level, type: base.id, color: base.color,
    burn: base.id === 'fire' ? 4 * Math.pow(1.5, level - 1) : 0,
    slow: base.id === 'frost' ? 0.52 : 1,
    chain: base.id === 'thunder' ? 2 : 0,
  };
}

/** Pure merge eligibility and the surviving hero's resulting level/stats. */
export function mergePreview(a, b, relics = []) {
  const unavailable = reason => ({ eligible: false, reason, level: null, nextStats: null });
  if (!a || !b || a === b || (a.id != null && a.id === b.id)) return unavailable('请选择两位相同的英雄。');
  if (!owns(HEROES, a.type) || !owns(HEROES, b.type)
    || !Number.isInteger(a.level) || !Number.isInteger(b.level) || a.level < 1 || b.level < 1
    || a.type !== b.type || a.level !== b.level) return unavailable('只有职业和等级都相同的英雄才能合成。');
  if (b.level >= 6) return unavailable('这位英雄已经达到 6 级。');
  const level = b.level + 1;
  return { eligible: true, reason: '', level, nextStats: heroStats({ type: b.type, level }, relics) };
}

export const WAVE_CONFIG = Object.freeze([
  { count: 16, hp: 31, speed: 0.58, gap: 0.48 },
  { count: 21, hp: 46, speed: 0.60, gap: 0.40 },
  { count: 25, hp: 65, speed: 0.61, gap: 0.36 },
  { count: 29, hp: 89, speed: 0.62, gap: 0.34 },
  { count: 34, hp: 120, speed: 0.63, gap: 0.31 },
  { count: 38, hp: 158, speed: 0.64, gap: 0.29 },
  { count: 43, hp: 210, speed: 0.65, gap: 0.27 },
  { count: 48, hp: 275, speed: 0.66, gap: 0.25 },
].map(Object.freeze));

// One source for the preview and the live spawn queue. Shards arise on kills,
// so they are deliberately not included in this scheduled enemy count.
function waveSchedule(wave) {
  const config = WAVE_CONFIG[wave - 1];
  return Array.from({ length: config.count }, (_, i) => {
    if ((wave === 4 && i === config.count - 1) || (wave === 8 && (i === config.count - 1 || i === config.count - 8))) return 'boss';
    if (wave >= 3 && i % 9 === 5) return 'splitter';
    if (wave >= 2 && i % 5 === 3) return 'armored';
    if (i % 6 === 2) return 'runner';
    return 'normal';
  });
}

function enemyHealth(type, wave, mapIndex) {
  const config = WAVE_CONFIG[Math.max(0, wave - 1)];
  const scale = type === 'boss' ? (wave === 8 ? 6 : 4.8) : type === 'armored' ? 1.5 : type === 'runner' ? 0.72 : type === 'splitter' ? 1.15 : type === 'shard' ? 0.30 : 1;
  return Math.round(config.hp * scale * MAPS[mapIndex].healthMultiplier);
}

/** Preview a 1-based wave; invalid wave/map inputs return null. No game state is read. */
export function wavePreview(wave, mapIndex = 0) {
  if (!Number.isInteger(wave) || wave < 1 || wave > TOTAL_WAVES || !Number.isInteger(mapIndex) || !MAPS[mapIndex]) return null;
  const schedule = waveSchedule(wave);
  const counts = { normal: 0, runner: 0, armored: 0, splitter: 0, boss: 0 };
  for (const type of schedule) counts[type]++;
  const tips = [];
  if (counts.runner) tips.push('快跑敌人移动速度为普通敌人的 1.5 倍；寒霜命中可减速。');
  if (counts.armored) tips.push('护甲敌人减伤 28%；烈焰与雷电的接触伤害受护甲影响较小。');
  if (counts.splitter) tips.push('分裂敌人被击败后生成 2 个碎片；预告数量不包含这些碎片。');
  if (counts.boss) tips.push('每位首领漏过会扣除 4 点生命；寒霜减速可延长输出时间。');
  return {
    wave, mapIndex, count: schedule.length, baseHp: enemyHealth('normal', wave, mapIndex),
    bossCount: counts.boss, counts, types: Object.keys(counts).filter(type => counts[type] > 0), schedule, tips,
  };
}

const copy = value => JSON.parse(JSON.stringify(value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const active = s => s.phase === 'build' || s.phase === 'battle';
function position(path, progress) {
  const p = Math.max(0, Math.min(path.length - 1, progress));
  const index = Math.min(path.length - 2, Math.floor(p));
  const part = p - index;
  return { x: path[index][0] + (path[index + 1][0] - path[index][0]) * part, y: path[index][1] + (path[index + 1][1] - path[index][1]) * part };
}
function positiveAngle(angle) { return ((angle % TAU) + TAU) % TAU; }

export class Game {
  constructor(seed = 123, mode = 'roguelike') {
    this.state = {
      version: 1, seed: Number(seed) >>> 0, rng: (Number(seed) >>> 0) || 123, nextId: 1,
      mode: mode === 'classic' ? 'classic' : 'roguelike', phase: 'build', gold: 180, lives: 15, maxLives: 15, wave: 0, totalWaves: TOTAL_WAVES, stage: 1, mapIndex: 0,
      heroes: [], enemies: [], eggs: [], effects: [], relics: [], choices: [], selectedType: 'blade',
      stats: { kills: 0, damage: 0, merges: 0, hatched: 0, leaked: 0, wavesCleared: 0, spent: 0, earned: 0, highestLevel: 1, bosses: 0 },
      time: 0, battleTime: 0, accumulator: 0, waveElapsed: 0, spawnTimer: 0, spawnQueue: [], pendingRoute: false,
      lastMessage: '先选英雄，再点草地部署。相同英雄拖到一起即可合成。',
    };
    this._spawnEgg(0.35);
  }

  _random() {
    let x = this.state.rng;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state.rng = x >>> 0;
    return this.state.rng / 4294967296;
  }
  _id(prefix) { return `${prefix}${this.state.nextId++}`; }
  _message(text, success = false) { this.state.lastMessage = text; return success; }
  _effect(type, x, y, extra = {}) {
    const life = type === 'merge' || type === 'hatch' ? 0.85 : type === 'chain' ? 0.22 : 0.45;
    this.state.effects.push({ id: this._id('fx'), type, x, y, life, maxLife: life, ...extra });
    if (this.state.effects.length > MAX_EFFECTS) this.state.effects.splice(0, this.state.effects.length - MAX_EFFECTS);
  }
  _earn(amount) {
    const n = Math.max(0, Math.round(amount));
    this.state.gold += n; this.state.stats.earned += n;
    return n;
  }
  isBuildable(x, y) { return isBuildable(x, y, this.state.mapIndex); }
  heroStats(hero) { return heroStats(hero, this.state.relics); }
  heroAt(x, y) { return this.state.heroes.find(h => h.x === x && h.y === y) || null; }
  _freeCells() {
    const result = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (this.isBuildable(x, y) && !this.heroAt(x, y)) result.push({ x, y });
    return result;
  }
  _addHero(type, x, y, level = 1) {
    const hero = { id: this._id('h'), type, level, x, y, angle: this._random() * TAU, cooldown: 0, invested: HEROES[type].cost * Math.pow(2, level - 1) };
    this.state.heroes.push(hero);
    return hero;
  }
  select(type, x, y) {
    if (arguments.length >= 3) return this.buy(type, x, y);
    if (!owns(HEROES, type)) return this._message('请选择可用的英雄。');
    this.state.selectedType = type;
    return this._message(`已选${HEROES[type].name}，点空草地部署。`, true);
  }
  buy(type, x, y) {
    const s = this.state, hero = owns(HEROES, type) ? HEROES[type] : null;
    if (!active(s)) return this._message('先完成当前选择，再部署英雄。');
    if (!hero) return this._message('请选择可用的英雄。');
    if (!this.isBuildable(x, y)) return this._message('英雄只能放在草地上，不能挡住道路或蛋道。');
    if (this.heroAt(x, y)) return this._message('这里已有英雄，可将相同英雄合成。');
    if (s.heroes.length >= MAX_HEROES) return this._message(`已部署 ${MAX_HEROES} 位英雄，合成可以腾出位置。`);
    if (s.gold < hero.cost) return this._message(`金币不足，还差 ${hero.cost - s.gold}。`);
    s.gold -= hero.cost; s.stats.spent += hero.cost;
    this._addHero(type, x, y); this._effect('deploy', x, y, { color: hero.color });
    return this._message(`${hero.name}已部署。`, true);
  }
  move(id, x, y) {
    if (!active(this.state)) return this._message('先完成当前选择，再移动英雄。');
    const hero = this.state.heroes.find(h => h.id === id);
    if (!hero) return this._message('没有找到这位英雄。');
    if (hero.x === x && hero.y === y) return this._message('英雄已经在这里。', true);
    if (!this.isBuildable(x, y) || this.heroAt(x, y)) return this._message('请选择一块空草地。');
    hero.x = x; hero.y = y;
    return this._message(`${HEROES[hero.type].name}已移动。`, true);
  }
  merge(fromId, toId) {
    const s = this.state;
    if (!active(s)) return this._message('先完成当前选择，再合成英雄。');
    const a = s.heroes.find(h => h.id === fromId), b = s.heroes.find(h => h.id === toId);
    const preview = mergePreview(a, b, s.relics);
    if (!preview.eligible) return this._message(preview.reason);
    b.level = preview.level; b.invested += a.invested; b.cooldown = 0;
    s.heroes = s.heroes.filter(h => h.id !== fromId); s.stats.merges++;
    s.stats.highestLevel = Math.max(s.stats.highestLevel, b.level);
    this._effect('merge', b.x, b.y, { color: HEROES[b.type].color, value: b.level });
    return this._message(`合成成功！${HEROES[b.type].name}升至 ${b.level} 级。`, true);
  }
  sell(id) {
    if (!active(this.state)) return this._message('先完成当前选择，再回收英雄。');
    const hero = this.state.heroes.find(h => h.id === id);
    if (!hero) return this._message('没有找到这位英雄。');
    const value = this._earn(Math.floor(hero.invested * 0.65));
    this.state.heroes = this.state.heroes.filter(h => h.id !== id);
    this._effect('sell', hero.x, hero.y, { value });
    return this._message(`英雄已回收，获得 ${value} 金币。`, true);
  }
  startWave() {
    const s = this.state;
    if (s.phase !== 'build' || s.wave >= TOTAL_WAVES) return this._message('当前不能开始下一波。');
    if (!s.heroes.length) return this._message('先在道路旁部署至少一位英雄。');
    s.wave++; s.phase = 'battle'; s.waveElapsed = 0; s.spawnTimer = 0.3; s.choices = [];
    s.spawnQueue = waveSchedule(s.wave);
    if (!s.eggs.length) this._spawnEgg(0.2);
    return this._message(`第 ${s.wave} 波来袭！战斗中也能部署、移动和合成。`, true);
  }
  _spawnEnemy(type, progress = 0, child = false) {
    const s = this.state, cfg = WAVE_CONFIG[Math.max(0, s.wave - 1)], map = MAPS[s.mapIndex];
    const speedScale = type === 'runner' ? 1.5 : type === 'boss' ? 0.68 : type === 'armored' ? 0.84 : type === 'shard' ? 1.3 : 1;
    const hp = enemyHealth(type, s.wave, s.mapIndex);
    const enemy = { id: this._id('e'), type, hp, maxHp: hp, progress, ...position(map.path, progress), speed: cfg.speed * speedScale * map.speedMultiplier,
      armor: type === 'armored' ? 0.28 : type === 'boss' ? 0.12 : 0, radius: type === 'boss' ? 0.42 : type === 'shard' ? 0.20 : 0.29,
      slowUntil: 0, slowFactor: 1, burnUntil: 0, burnDamage: 0, hitMemory: {}, child, dead: false };
    s.enemies.push(enemy); return enemy;
  }
  _spawnEgg(progress = 0) {
    const s = this.state;
    if (s.eggs.length >= 3) return;
    const hp = 20 + Math.max(0, s.wave) * 6;
    s.eggs.push({ id: this._id('egg'), hp, maxHp: hp, progress, ...position(MAPS[s.mapIndex].eggPath, progress), speed: 0.105, radius: 0.37, hitMemory: {}, dead: false });
  }
  _hit(target, amount, hero, special = true) {
    if (target.dead || target.hp <= 0) return;
    const s = this.state, egg = target.id.startsWith('egg');
    let damage = amount;
    if (egg) damage *= s.relics.includes('hatchery') ? 1.7 : 1;
    else damage *= 1 - (target.armor || 0) * (hero?.type === 'fire' ? 0.45 : hero?.type === 'thunder' ? 0.7 : 1);
    damage = Math.max(0.1, damage);
    const dealt = Math.min(target.hp, damage);
    target.hp -= damage; s.stats.damage += dealt;
    this._effect('hit', target.x, target.y, { value: Math.round(dealt), color: HEROES[hero?.type]?.color || '#ffd879', targetId: target.id });
    if (target.hp <= 0) {
      target.hp = 0; target.dead = true;
      if (egg) this._hatch(target);
      else this._kill(target);
    }
    if (egg || !special || !hero) return;
    const stats = this.heroStats(hero);
    if (hero.type === 'frost' && !target.dead) { target.slowUntil = s.battleTime + 1.45; target.slowFactor = 0.52; }
    if (!target.dead && (hero.type === 'fire' || s.relics.includes('ember'))) {
      target.burnUntil = s.battleTime + 2;
      target.burnDamage = Math.max(target.burnDamage, stats.burn || stats.damage * 0.13);
    }
    if (hero.type === 'fire') {
      this._effect('blast', target.x, target.y, { radius: 0.8, color: HEROES.fire.color });
      const nearby = s.enemies.filter(other => other !== target && !other.dead && distance(target, other) < 0.8).sort((a, b) => distance(a, target) - distance(b, target)).slice(0, 3);
      for (const other of nearby) this._hit(other, amount * 0.36, hero, false);
    }
    if (hero.type === 'thunder') {
      const neighbors = s.enemies.filter(e => e !== target && !e.dead && distance(e, target) < 1.5).sort((a, b) => distance(a, target) - distance(b, target)).slice(0, 2);
      for (const other of neighbors) {
        this._effect('chain', other.x, other.y, { fromX: target.x, fromY: target.y, color: HEROES.thunder.color });
        this._hit(other, amount * 0.62, hero, false);
      }
    }
  }
  _kill(enemy) {
    const s = this.state, map = MAPS[s.mapIndex];
    s.stats.kills++;
    if (enemy.type === 'boss') s.stats.bosses++;
    const value = this._earn((enemy.type === 'boss' ? 35 : enemy.type === 'shard' ? 2 : 5 + Math.floor(s.wave / 3)) * map.goldMultiplier * (s.relics.includes('bounty') ? 1.3 : 1));
    this._effect('kill', enemy.x, enemy.y, { value, boss: enemy.type === 'boss' });
    if (enemy.type === 'splitter' && !enemy.child) {
      this._spawnEnemy('shard', Math.max(0, enemy.progress - 0.15), true);
      this._spawnEnemy('shard', Math.max(0, enemy.progress - 0.55), true);
    }
  }
  _hatch(egg) {
    const s = this.state;
    s.stats.hatched++;
    const cells = this._freeCells().sort((a, b) => distance(a, egg) - distance(b, egg) || a.y - b.y || a.x - b.x);
    let hero = null;
    if (cells.length && s.heroes.length < MAX_HEROES) {
      const types = Object.keys(HEROES), type = types[Math.floor(this._random() * types.length)];
      hero = this._addHero(type, cells[0].x, cells[0].y);
      this._message(`蛋孵化啦！获得 1 级${HEROES[type].name}。`);
    } else { this._earn(45); this._message('阵地已满，孵化奖励兑换为 45 金币。'); }
    if (s.relics.includes('hatchery')) this._earn(15);
    this._effect('hatch', egg.x, egg.y, { heroId: hero?.id, color: hero ? HEROES[hero.type].color : '#ffda76' });
  }
  _contact(hero, target, stats, previousAngle, deltaAngle) {
    const s = this.state;
    if (target.dead || (target.hitMemory[hero.id] ?? -1) > s.battleTime) return false;
    const dx = target.x - hero.x, dy = target.y - hero.y, d = Math.hypot(dx, dy);
    const hitRadius = (target.radius || 0.29) + 0.16;
    if (Math.abs(d - stats.orbit) > hitRadius) return false;
    const targetAngle = Math.atan2(dy, dx);
    for (let blade = 0; blade < stats.blades; blade++) {
      const start = previousAngle + TAU * blade / stats.blades;
      const arc = positiveAngle(targetAngle - start);
      let closest;
      if (arc <= deltaAngle) closest = Math.abs(d - stats.orbit);
      else {
        const x1 = Math.cos(start) * stats.orbit, y1 = Math.sin(start) * stats.orbit;
        const x2 = Math.cos(start + deltaAngle) * stats.orbit, y2 = Math.sin(start + deltaAngle) * stats.orbit;
        closest = Math.min(Math.hypot(dx - x1, dy - y1), Math.hypot(dx - x2, dy - y2));
      }
      if (closest <= hitRadius) {
        target.hitMemory[hero.id] = s.battleTime + stats.period / stats.blades * 0.82;
        this._hit(target, stats.damage, hero);
        hero.cooldown = 0.14;
        return true;
      }
    }
    return false;
  }
  _finishWave() {
    const s = this.state;
    s.stats.wavesCleared = s.wave;
    const bonus = this._earn((35 + s.wave * 9) * MAPS[s.mapIndex].goldMultiplier);
    s.enemies = []; s.spawnQueue = [];
    // Surviving eggs stay in the nook for the next wave instead of disappearing at a menu.
    for (const egg of s.eggs) { egg.progress = Math.min(egg.progress, 3.2); Object.assign(egg, position(MAPS[s.mapIndex].eggPath, egg.progress)); }
    if (s.wave === TOTAL_WAVES) {
      s.phase = 'won'; s.choices = [];
      this._message(`八波守住了！获得 ${bonus} 金币，远征完成。`);
      return;
    }
    this._spawnEgg(0);
    s.pendingRoute = s.mode === 'roguelike' && (s.wave === 3 || s.wave === 6);
    if (s.mode === 'roguelike' && [2, 4, 6].includes(s.wave)) {
      s.phase = 'reward';
      const pool = Object.keys(RELICS).filter(id => !s.relics.includes(id));
      s.choices = [];
      while (s.choices.length < 3 && pool.length) s.choices.push(pool.splice(Math.floor(this._random() * pool.length), 1)[0]);
      this._message(`本波奖励 ${bonus} 金币。选择一件遗物，强化整支队伍。`);
    } else if (s.pendingRoute) this._showRoutes();
    else { s.phase = 'build'; this._message(`第 ${s.wave} 波守住！奖励 ${bonus} 金币，可继续部署。`); }
  }
  _showRoutes() { this.state.phase = 'route'; this.state.choices = ['0', '1', '2']; this._message('选择下一段路线，所有英雄会随队转移。'); }
  chooseRelic(id) {
    const s = this.state;
    if (s.phase !== 'reward' || !s.choices.includes(id) || !owns(RELICS, id) || s.relics.includes(id)) return this._message('请选择本次出现的一件遗物。');
    s.relics.push(id); s.choices = [];
    if (id === 'bounty') this._earn(50);
    if (id === 'fortress') s.lives = Math.min(s.maxLives, s.lives + 4);
    if (s.pendingRoute) this._showRoutes();
    else { s.phase = 'build'; this._message(`已获得${RELICS[id].name}。准备好后开始下一波。`); }
    return true;
  }
  chooseRoute(index) {
    const s = this.state, next = typeof index === 'string' && /^\d+$/.test(index) ? Number(index) : index;
    if (s.phase !== 'route' || !Number.isInteger(next) || !MAPS[next] || !s.choices.includes(String(next))) return this._message('请选择一条可用路线。');
    s.mapIndex = next; s.stage++; s.pendingRoute = false; s.choices = []; s.phase = 'build';
    const needsMove = s.heroes.filter(h => !this.isBuildable(h.x, h.y));
    // Temporarily remove displaced heroes so occupied legal positions are preserved.
    s.heroes = s.heroes.filter(h => this.isBuildable(h.x, h.y));
    for (const hero of needsMove) {
      const cell = this._freeCells().sort((a, b) => distance(a, hero) - distance(b, hero) || a.y - b.y || a.x - b.x)[0];
      if (cell) { hero.x = cell.x; hero.y = cell.y; s.heroes.push(hero); }
    }
    for (const egg of s.eggs) Object.assign(egg, position(MAPS[next].eggPath, egg.progress));
    s.effects = [];
    return this._message(`来到${MAPS[next].name}。英雄已就位，可以重新布阵。`, true);
  }
  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const s = this.state;
    s.accumulator += Math.min(dt, 5);
    let guard = 0;
    while (s.accumulator + 1e-9 >= STEP && guard++ < 301) {
      s.accumulator = Math.max(0, s.accumulator - STEP);
      this._step(STEP);
    }
    if (s.accumulator < 1e-9) s.accumulator = 0;
  }
  _step(dt) {
    const s = this.state;
    if (s.phase === 'won' || s.phase === 'lost') {
      for (const effect of s.effects) effect.life -= dt;
      s.effects = s.effects.filter(fx => fx.life > 0);
      return;
    }
    s.time += dt;
    for (const effect of s.effects) effect.life -= dt;
    s.effects = s.effects.filter(fx => fx.life > 0);
    const isBattle = s.phase === 'battle';
    if (isBattle) {
      s.battleTime += dt; s.waveElapsed += dt; s.spawnTimer -= dt;
      const cfg = WAVE_CONFIG[s.wave - 1];
      while (s.spawnQueue.length && s.spawnTimer <= 0) { this._spawnEnemy(s.spawnQueue.shift()); s.spawnTimer += cfg.gap; }
      const path = MAPS[s.mapIndex].path;
      for (const enemy of s.enemies.slice()) {
        if (enemy.dead) continue;
        if (enemy.burnUntil > s.battleTime) {
          const amount = Math.min(enemy.hp, enemy.burnDamage * dt);
          enemy.hp -= amount; s.stats.damage += amount;
          if (enemy.hp <= 0) { enemy.dead = true; this._kill(enemy); continue; }
        }
        const slow = enemy.slowUntil > s.battleTime ? enemy.slowFactor : 1;
        enemy.progress += enemy.speed * dt * slow * (s.relics.includes('winter') ? 0.85 : 1);
        Object.assign(enemy, position(path, enemy.progress));
        if (enemy.progress >= path.length - 1) {
          enemy.dead = true; s.stats.leaked++;
          s.lives = Math.max(0, s.lives - (enemy.type === 'boss' ? 4 : 1));
          this._effect('leak', enemy.x, enemy.y, { value: enemy.type === 'boss' ? 4 : 1 });
          if (!s.lives) { s.phase = 'lost'; s.choices = []; this._message('防线被突破了。试试在弯道布阵，再合成高阶英雄。'); break; }
        }
      }
      for (const egg of s.eggs) {
        egg.progress = Math.min(MAPS[s.mapIndex].eggPath.length - 1, egg.progress + dt * egg.speed);
        Object.assign(egg, position(MAPS[s.mapIndex].eggPath, egg.progress));
      }
    }
    for (const hero of s.heroes.slice()) {
      const stats = this.heroStats(hero), previous = hero.angle;
      const delta = TAU / stats.period * dt;
      hero.angle = positiveAngle(hero.angle + delta); hero.cooldown = Math.max(0, hero.cooldown - dt);
      if (isBattle && s.phase === 'battle') for (const target of [...s.enemies, ...s.eggs]) this._contact(hero, target, stats, previous, delta);
    }
    s.enemies = s.enemies.filter(e => !e.dead);
    s.eggs = s.eggs.filter(e => !e.dead);
    if (s.phase === 'battle' && !s.spawnQueue.length && !s.enemies.length) this._finishWave();
  }
  serialize() { return copy({ version: 1, state: this.state }); }
  static restore(data) {
    let parsed;
    try { parsed = typeof data === 'string' ? JSON.parse(data) : copy(data); }
    catch { throw new Error('存档数据无效。'); }
    if (!parsed || parsed.version !== 1 || !parsed.state || parsed.state.version !== 1) throw new Error('不支持的存档版本。');
    const s = parsed.state;
    const fail = () => { throw new Error('存档数据无效，请开启新旅程。'); };
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const num = (value, low = 0, high = 1e10) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
    const integer = (value, low, high) => num(value, low, high) && Number.isInteger(value);
    const bool = value => typeof value === 'boolean';
    const str = value => typeof value === 'string';
    if (!object(s) || !PHASES.includes(s.phase) || !['classic', 'roguelike'].includes(s.mode)
      || !integer(s.mapIndex, 0, MAPS.length - 1) || !integer(s.stage, 1, 3)
      || !integer(s.wave, 0, TOTAL_WAVES) || s.totalWaves !== TOTAL_WAVES
      || !integer(s.gold, 0, 1e9) || !integer(s.lives, 0, 15) || s.maxLives !== 15
      || !integer(s.seed, 0, 4294967295) || !integer(s.rng, 1, 4294967295) || !integer(s.nextId, 1, 1e10)
      || !str(s.lastMessage) || s.lastMessage.length > 1000 || !owns(HEROES, s.selectedType) || !bool(s.pendingRoute)) fail();
    for (const key of ['time', 'battleTime', 'waveElapsed']) if (!num(s[key])) fail();
    if (!num(s.accumulator, 0, STEP + 1e-7) || !num(s.spawnTimer, -1e5, 10)) fail();
    const limits = { heroes: MAX_HEROES, enemies: 160, eggs: 3, effects: MAX_EFFECTS, relics: 3, choices: 3, spawnQueue: 48 };
    for (const [key, limit] of Object.entries(limits)) if (!Array.isArray(s[key]) || s[key].length > limit) fail();
    const statKeys = ['kills', 'damage', 'merges', 'hatched', 'leaked', 'wavesCleared', 'spent', 'earned', 'highestLevel', 'bosses'];
    if (!object(s.stats) || statKeys.some(key => !num(s.stats[key]))) fail();
    if (!integer(s.stats.wavesCleared, 0, TOTAL_WAVES) || !integer(s.stats.highestLevel, 1, 6)) fail();
    if (s.relics.some(id => !str(id) || !owns(RELICS, id)) || new Set(s.relics).size !== s.relics.length) fail();
    if (s.mode === 'classic' && (s.relics.length || s.phase === 'route' || s.phase === 'reward')) fail();
    if (s.choices.some(id => !str(id)) || new Set(s.choices).size !== s.choices.length) fail();
    if (s.phase === 'reward' ? !s.choices.length || s.choices.some(id => !owns(RELICS, id) || s.relics.includes(id))
      : s.phase === 'route' ? s.choices.length !== 3 || s.choices.some(id => !['0', '1', '2'].includes(id)) : s.choices.length !== 0) fail();
    if ((s.phase === 'battle' && s.wave === 0) || (s.phase === 'build' && s.wave === TOTAL_WAVES)
      || (s.phase === 'won' && (s.wave !== TOTAL_WAVES || s.stats.wavesCleared !== TOTAL_WAVES))
      || (s.phase === 'lost' && s.lives !== 0) || (s.phase !== 'lost' && s.lives === 0)) fail();
    const enemyTypes = ['normal', 'runner', 'armored', 'splitter', 'boss', 'shard'];
    if (s.spawnQueue.some(type => !enemyTypes.includes(type))) fail();
    const ids = new Set(), occupied = new Set();
    const entity = (value, prefix) => {
      if (!object(value) || !str(value.id) || !new RegExp('^' + prefix + '[1-9][0-9]*$').test(value.id)
        || ids.has(value.id) || Number(value.id.slice(prefix.length)) >= s.nextId || !num(value.x, 0, COLS - 1) || !num(value.y, 0, ROWS - 1)) fail();
      ids.add(value.id);
    };
    for (const h of s.heroes) {
      entity(h, 'h');
      const key = `${h.x},${h.y}`;
      if (!owns(HEROES, h.type) || !integer(h.level, 1, 6) || !isBuildable(h.x, h.y, s.mapIndex) || occupied.has(key)
        || !num(h.angle, 0, TAU + 1e-8) || !num(h.cooldown, 0, 1) || !integer(h.invested, 1, 10000)) fail();
      occupied.add(key);
    }
    for (const [targets, prefix, path] of [[s.enemies, 'e', MAPS[s.mapIndex].path], [s.eggs, 'egg', MAPS[s.mapIndex].eggPath]]) {
      for (const target of targets) {
        entity(target, prefix);
        if (!num(target.hp, 0, 1e7) || !num(target.maxHp, 0.1, 1e7) || target.hp > target.maxHp
          || !num(target.progress, 0, path.length) || !num(target.speed, 0, 10) || !num(target.radius, 0.01, 2)
          || !bool(target.dead) || !object(target.hitMemory) || Object.keys(target.hitMemory).length > 10000
          || Object.entries(target.hitMemory).some(([id, at]) => !/^h[1-9][0-9]*$/.test(id) || !num(at))) fail();
        if (prefix === 'e' && (!enemyTypes.includes(target.type) || !num(target.armor, 0, 1) || !num(target.slowUntil)
          || !num(target.slowFactor, 0, 1) || !num(target.burnUntil) || !num(target.burnDamage) || !bool(target.child))) fail();
      }
    }
    const effectTypes = ['deploy', 'hit', 'blast', 'chain', 'kill', 'hatch', 'merge', 'sell', 'leak'];
    for (const effect of s.effects) {
      entity(effect, 'fx');
      if (!effectTypes.includes(effect.type) || !num(effect.life, 0, 2) || !num(effect.maxLife, 0.01, 2)) fail();
      for (const key of ['value', 'radius', 'fromX', 'fromY']) if (key in effect && !num(effect[key])) fail();
      if ('color' in effect && (!str(effect.color) || effect.color.length > 50)) fail();
    }
    const game = new Game(s.seed, s.mode);
    game.state = s;
    return game;
  }
}

export default Game;
