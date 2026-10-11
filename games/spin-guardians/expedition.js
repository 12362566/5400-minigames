/**
 * Long-run campaign. Classic Game and version-one saves stay in engine.js.
 * All changing combat, encounter and pending-node data lives under state.
 * Fixed-step simulation is inherited from Game.update (60 Hz).
 */
import { Game, HEROES, MAPS, COLS, ROWS, MAX_HEROES, MAX_EFFECTS, isBuildable, heroStats as baseHeroStats } from './engine.js';
import { CHAPTERS, TALENTS, RELICS_LONG, REACTIONS, COMBOS, ENEMIES, EVENTS, SHOP_ITEMS, BOSSES, CAMP_OPTIONS, getEncounter } from './content.js';

export const EXPEDITION_WAVES = 30;
export const MAX_ENEMIES = 72;
export const ACTIVE_SKILLS = Object.freeze({
  rally: Object.freeze({ id: 'rally', name: '集结战吼', icon: '⚑', cooldown: 32, description: '全队伤害 +45%，持续 8 秒。' }),
  blizzard: Object.freeze({ id: 'blizzard', name: '极寒脉冲', icon: '❄', cooldown: 40, description: '全场减速 65% 持续 4 秒，并打断首领蓄力。' }),
  mend: Object.freeze({ id: 'mend', name: '生命祷言', icon: '♥', cooldown: 75, description: '恢复 3 点生命。' }),
});
const STEP = 1 / 60, TAU = Math.PI * 2;
const PHASES = ['build', 'battle', 'reward', 'route', 'event', 'shop', 'camp', 'won', 'lost'];
const ROUTES = ['balanced', 'elite', 'fortune'];
const CLASSES = Object.keys(HEROES);
const owns = (object, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(object, key);
const clone = value => JSON.parse(JSON.stringify(value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = value => ((value % TAU) + TAU) % TAU;
const position = (path, progress) => {
  const p = Math.max(0, Math.min(path.length - 1, progress));
  const i = Math.min(path.length - 2, Math.floor(p)), t = p - i;
  return { x: path[i][0] + (path[i + 1][0] - path[i][0]) * t, y: path[i][1] + (path[i + 1][1] - path[i][1]) * t };
};

export class ExpeditionGame extends Game {
  constructor(seed = 123) {
    super(seed, 'roguelike');
    Object.assign(this.state, {
      version: 2, mode: 'expedition', totalWaves: EXPEDITION_WAVES,
      gold: 220, lives: 20, maxLives: 20, level: 1, xp: 0, xpNext: 1, talentPoints: 0,
      talents: {}, relicRanks: {}, combos: [], unlockedCombos: [], classMilestones: { blade: 1, fire: 1, frost: 1, thunder: 1 },
      activeSkill: 'rally', activeCooldown: 0, rallyUntil: 0, comboCooldowns: {},
      route: 'balanced', shopOffers: [], eventId: null, nodeQueue: [],
      nextReinforcement: 0, bossWarning: '', encounter: null, pendingRoute: false,
      earlyCalls: 0, currentBatch: -1, calledBatches: [], waveKills: 0, reactionLog: [], globalWardUntil: 0,
      lastMessage: '五章三十波远征：先在弯道部署英雄；每波结束获得天赋点。',
    });
    Object.assign(this.state.stats, { reactions: 0, comboTriggers: 0, interrupts: 0, bossDelays: 0, earlyCalls: 0, promotions: 0 });
  }

  // Public API: buy/move/sell/update/isBuildable/heroAt are inherited unchanged.
  previewWave(wave = this.state.phase === 'battle' ? this.state.wave : this.state.wave + 1) {
    if (!Number.isInteger(wave) || wave < 1 || wave > EXPEDITION_WAVES) return null;
    return this._preview(wave);
  }
  getBuildInfo() { return { talents: TALENTS, combos: COMBOS, activeSkills: ACTIVE_SKILLS }; }
  _preview(wave) {
    const encounter = getEncounter(wave, this.state.route);
    const chapter = Object.values(CHAPTERS).find(c => c.id === encounter.chapter || c.index === encounter.chapter) || Object.values(CHAPTERS)[Math.ceil(wave / 6) - 1];
    return { ...clone(encounter), mapIndex: this.state.mapIndex, baseHp: encounter.hp,
      bossCount: encounter.counts?.boss || 0, types: Object.keys(encounter.counts || {}).filter(id => encounter.counts[id]),
      tips: encounter.threats || [], chapter, bossName: encounter.bossName || '',
      schedule: encounter.schedule.map(entry => entry.type) };
  }
  _rank(id) { return owns(this.state.relicRanks, id) ? this.state.relicRanks[id] : 0; }
  _talent(id) { return owns(this.state.talents, id) ? this.state.talents[id] : 0; }
  _mods(type = null) {
    const result = {};
    for (const [catalog, ranks] of [[RELICS_LONG, this.state.relicRanks], [TALENTS, this.state.talents]]) {
      for (const [id, rank] of Object.entries(ranks)) {
        const item = owns(catalog, id) ? catalog[id] : null;
        if (!item || (item.class && item.class !== type)) continue;
        for (const [key, value] of Object.entries(item.effects || {})) if (typeof value === 'number') result[key] = (result[key] || 0) + value * rank;
      }
    }
    return result;
  }
  _addHero(type, x, y, level = 1) {
    const hero = super._addHero(type, x, y, level);
    hero.disabledUntil = 0; hero.disruptedUntil = 0;
    this.state.stats.highestLevel = Math.max(this.state.stats.highestLevel, level);
    if (this.state.classMilestones) this._refreshCombos();
    return hero;
  }
  merge(from, to) {
    const result = super.merge(from, to);
    if (result) this._refreshCombos();
    return result;
  }
  _refreshCombos() {
    const s = this.state;
    for (const hero of s.heroes) s.classMilestones[hero.type] = Math.max(s.classMilestones[hero.type], hero.level);
    for (const [id, combo] of Object.entries(COMBOS)) {
      const pair = combo.classes || combo.pair || id.replace('combo_', '').split('_');
      if (pair.every(type => s.classMilestones[type] >= 3) && !s.unlockedCombos.includes(id)) {
        s.unlockedCombos.push(id);
        if (s.combos.length < 2) s.combos.push(id);
        this._message(`组合技解锁：${combo.name}。最多同时装备 2 个。`);
      }
    }
  }
  train(id) {
    const s = this.state, talent = owns(TALENTS, id) ? TALENTS[id] : null;
    if (!talent || ['won', 'lost'].includes(s.phase)) return this._message('请选择可用天赋。');
    if (!s.talentPoints) return this._message('没有可用天赋点，每波完成后获得 1 点。');
    const rank = this._talent(id);
    if (rank >= 3) return this._message('这项天赋已达到 3 级。');
    if (talent.class && Object.entries(TALENTS).some(([other, data]) => data.class === talent.class && other !== id && this._talent(other))) return this._message('这个职业已经选择另一条专精，当前远征不能改选。');
    s.talents[id] = rank + 1; s.talentPoints--;
    return this._message(`${talent.name}提升至 ${rank + 1} 级。`, true);
  }
  promotionCost(id) {
    const hero = this.state.heroes.find(unit => unit.id === id);
    return hero && hero.level < 6 ? Math.ceil(HEROES[hero.type].cost * Math.pow(2, hero.level - 1) * 1.25) : null;
  }
  promote(id) {
    const s = this.state, hero = s.heroes.find(unit => unit.id === id), cost = this.promotionCost(id);
    if (s.phase !== 'build') return this._message('营地晋升只能在下一波准备阶段进行。');
    if (!hero || cost === null) return this._message('请选择尚未达到 6 级的英雄。');
    if (s.gold < cost) return this._message(`晋升需要 ${cost} 金币，还差 ${cost - s.gold}。`);
    s.gold -= cost; s.stats.spent += cost; hero.invested += cost; hero.level++; hero.cooldown = 0;
    s.stats.promotions++; s.stats.highestLevel = Math.max(s.stats.highestLevel, hero.level);
    this._refreshCombos(); this._effect('merge', hero.x, hero.y, { color: HEROES[hero.type].color, value: hero.level });
    return this._message(`${HEROES[hero.type].name}晋升至 ${hero.level} 级，花费 ${cost} 金币。`, true);
  }
  equipCombo(id) {
    const s = this.state;
    if (['won', 'lost'].includes(s.phase) || !owns(COMBOS, id) || !s.unlockedCombos.includes(id)) return this._message('需要关联的两个职业都曾达到 3 级。');
    if (s.combos.includes(id)) { s.combos = s.combos.filter(item => item !== id); return this._message(`已卸下${COMBOS[id].name}。`, true); }
    if (s.combos.length >= 2) return this._message('最多装备 2 个组合技，请先卸下一个。');
    s.combos.push(id);
    return this._message(`已装备${COMBOS[id].name}。`, true);
  }
  setActive(id) {
    if (!owns(ACTIVE_SKILLS, id) || this.state.phase === 'battle' || ['won', 'lost'].includes(this.state.phase)) return this._message('战斗间歇才能更换主动技能。');
    this.state.activeSkill = id;
    return this._message(`主动技能已更换为${ACTIVE_SKILLS[id].name}。`, true);
  }
  useActive() {
    const s = this.state;
    if (s.phase !== 'battle') return this._message('主动技能仅能在战斗中使用。');
    if (s.activeCooldown > 0) return this._message(`技能还需冷却 ${Math.ceil(s.activeCooldown)} 秒。`);
    const id = s.activeSkill, mods = this._mods();
    if (id === 'mend' && s.lives === s.maxLives) return this._message('生命已满，暂时无需治疗。');
    s.activeCooldown = ACTIVE_SKILLS[id].cooldown * Math.max(0.4, 1 - (mods.activeCooldown || 0));
    if (id === 'rally') s.rallyUntil = s.battleTime + 8 + (mods.activeDuration || 0);
    if (id === 'blizzard') for (const enemy of s.enemies) {
      if (enemy.dead) continue;
      enemy.slowUntil = Math.max(enemy.slowUntil, s.battleTime + 4 + (mods.activeDuration || 0)); enemy.slowFactor = Math.min(enemy.slowFactor, 0.35);
      this._interrupt(enemy, 'active');
    }
    if (id === 'mend') s.lives = Math.min(s.maxLives, s.lives + 3);
    this._effect('blast', 4, 4, { radius: 4, color: id === 'blizzard' ? '#8ce6f3' : '#a9e9c0' });
    return this._message(`${ACTIVE_SKILLS[id].name}已发动！`, true);
  }
  startWave() {
    const s = this.state;
    if (s.phase !== 'build' || s.wave >= EXPEDITION_WAVES) return this._message('先完成当前节点，再开始下一波。');
    if (!s.heroes.length) return this._message('先在道路旁部署至少一位英雄。');
    s.wave++; s.stage = Math.ceil(s.wave / 6); s.phase = 'battle'; s.waveElapsed = 0; s.waveKills = 0; s.earlyCalls = 0; s.currentBatch = -1; s.calledBatches = [];
    s.encounter = clone(getEncounter(s.wave, s.route));
    s.spawnQueue = s.encounter.schedule.map(entry => ({ ...entry }));
    s.xp = 0; s.xpNext = s.encounter.count; s.choices = []; s.nodeQueue = []; s.eventId = null; s.shopOffers = [];
    s.spawnTimer = s.spawnQueue[0]?.at ?? 0; s.bossWarning = ''; s.pendingRoute = false;
    this._updateReinforcement(); this._refreshCombos();
    if (!s.eggs.length) this._spawnEgg(0.2);
    const ward = this._mods().startWard || 0;
    if (ward) s.globalWardUntil = s.battleTime + ward;
    return this._message(`第 ${s.wave}/30 波来袭！增援分批进入，可在空档提前召来。`, true);
  }
  _updateReinforcement() {
    const s = this.state;
    const next = s.spawnQueue.find(entry => entry.batch > s.currentBatch);
    s.nextReinforcement = next ? Math.max(0, next.at - s.waveElapsed) : 0;
    s.spawnTimer = s.spawnQueue.length ? Math.max(0, s.spawnQueue[0].at - s.waveElapsed) : 0;
  }
  callReinforcements() {
    const s = this.state;
    if (s.phase !== 'battle' || s.currentBatch < 0) return this._message('先遣部队正在进入战场。');
    const next = s.spawnQueue.find(entry => entry.batch > s.currentBatch);
    if (!next || s.calledBatches.includes(next.batch)) return this._message('没有等待中的增援批次。');
    if (s.enemies.filter(enemy => !enemy.dead).length > 6) return this._message('场上敌人不超过 6 个时才能提前召来增援。');
    const delta = next.at - s.waveElapsed;
    if (delta < 3) return this._message('增援已经临近。');
    for (const entry of s.spawnQueue) entry.at = Math.max(s.waveElapsed, entry.at - delta);
    s.calledBatches.push(next.batch); s.earlyCalls++; s.stats.earlyCalls++;
    const value = this._earn(6 + s.stage * 2);
    this._updateReinforcement();
    return this._message(`增援提前抵达，勇气奖励 ${value} 金币。`, true);
  }
  _finishWave() {
    const s = this.state;
    if (s.phase !== 'battle' || s.stats.wavesCleared >= s.wave) return;
    s.stats.wavesCleared = s.wave; s.level++; s.talentPoints++;
    s.xp = s.xpNext;
    const mods = this._mods();
    const bonus = this._earn((32 + s.wave * 5 + (mods.waveGold || 0)) * this._incomeMultiplier());
    if (mods.waveHeal) s.lives = Math.min(s.maxLives, s.lives + Math.floor(mods.waveHeal));
    s.enemies = []; s.spawnQueue = []; s.nextReinforcement = 0; s.bossWarning = ''; s.encounter = null;
    for (const egg of s.eggs) { egg.progress = Math.min(egg.progress, 3.2); Object.assign(egg, position(MAPS[s.mapIndex].eggPath, egg.progress)); }
    if (s.wave === EXPEDITION_WAVES) {
      s.phase = 'won'; s.choices = []; s.nodeQueue = []; this._message('五章三十波全部守住！远征完成。'); return;
    }
    this._spawnEgg(0);
    const slot = (s.wave - 1) % 6 + 1;
    s.nodeQueue = slot === 2 ? ['event'] : slot === 5 ? ['camp'] : slot === 3 ? ['reward', 'shop'] : slot === 6 ? ['reward', 'route'] : ['reward'];
    s.pendingRoute = s.nodeQueue.includes('route');
    this._advanceNode();
    this._message(`第 ${s.wave} 波守住！获得 ${bonus} 金币和 1 天赋点。`);
  }
  _advanceNode() {
    const s = this.state;
    s.choices = []; s.eventId = null; s.shopOffers = [];
    const phase = s.nodeQueue.shift() || 'build'; s.phase = phase;
    if (phase === 'reward') {
      const pool = Object.keys(RELICS_LONG).filter(id => this._rank(id) < 3);
      while (s.choices.length < 3 && pool.length) s.choices.push(pool.splice(Math.floor(this._random() * pool.length), 1)[0]);
      if (!s.choices.length) s.choices = ['gold'];
    }
    if (phase === 'route') { s.choices = ROUTES.slice(); s.pendingRoute = true; }
    if (phase === 'event') this._openEvent();
    if (phase === 'shop') this._openShop();
    if (phase === 'camp') s.choices = Object.keys(CAMP_OPTIONS);
    if (phase === 'build') s.pendingRoute = false;
  }
  _grantRelic(id) {
    const s = this.state;
    if (!owns(RELICS_LONG, id) || this._rank(id) >= 3) { this._earn(60 + s.stage * 20); return false; }
    s.relicRanks[id] = this._rank(id) + 1;
    if (!s.relics.includes(id)) s.relics.push(id);
    const effects = RELICS_LONG[id].effects || {};
    if (effects.goldOnAcquire) this._earn(effects.goldOnAcquire);
    if (effects.maxLives) s.maxLives += effects.maxLives;
    if (effects.healOnAcquire) s.lives = Math.min(s.maxLives, s.lives + effects.healOnAcquire);
    return true;
  }
  chooseRelic(id) {
    const s = this.state;
    if (s.phase !== 'reward' || !s.choices.includes(id)) return this._message('请选择本次出现的一件遗物。');
    const valid = id === 'gold' || (owns(RELICS_LONG, id) && this._rank(id) < 3);
    if (!valid) return this._message('这件遗物已经满级。');
    if (id === 'gold') this._earn(100); else this._grantRelic(id);
    this._advanceNode();
    return this._message(id === 'gold' ? '遗物已满，获得 100 金币。' : `获得${RELICS_LONG[id].name}，当前 ${this._rank(id)}/3 级。`, true);
  }
  chooseRoute(id) {
    const s = this.state;
    if (s.phase !== 'route' || !ROUTES.includes(id) || !s.choices.includes(id)) return this._message('请选择可用路线。');
    s.route = id; s.mapIndex = ROUTES.indexOf(id); s.stage = Math.min(5, Math.floor(s.wave / 6) + 1);
    const displaced = s.heroes.filter(hero => !this.isBuildable(hero.x, hero.y));
    s.heroes = s.heroes.filter(hero => this.isBuildable(hero.x, hero.y));
    for (const hero of displaced) {
      const cell = this._freeCells().sort((a, b) => distance(a, hero) - distance(b, hero) || a.y - b.y || a.x - b.x)[0];
      if (cell) { hero.x = cell.x; hero.y = cell.y; s.heroes.push(hero); }
    }
    for (const egg of s.eggs) Object.assign(egg, position(MAPS[s.mapIndex].eggPath, egg.progress));
    s.effects = []; s.pendingRoute = false; this._advanceNode();
    return this._message(`来到${MAPS[s.mapIndex].name}。所有英雄已随队转移，可重新布阵。`, true);
  }
  _incomeMultiplier() { return (this.state.route === 'elite' ? 1.25 : this.state.route === 'fortune' ? 1.35 : 1) * (1 + (this._mods().income || 0)); }

  heroStats(hero) {
    const stats = baseHeroStats(hero, []), mods = this._mods(hero.type), s = this.state;
    stats.damage = Math.round(stats.damage * (1 + (mods.damage || 0)) * (s.rallyUntil > s.battleTime ? 1.45 : 1));
    stats.range += Math.min(0.5, mods.range || 0); stats.orbit = stats.range - 0.38;
    stats.period /= 1 + Math.min(1, mods.rotation || 0);
    if ((hero.disruptedUntil || 0) > s.battleTime) stats.period /= 0.65;
    stats.burn *= 1 + (mods.burnDamage || 0);
    stats.slow = Math.max(0.2, stats.slow - (mods.slowStrength || 0));
    stats.chain += Math.min(4, mods.chainTargets || 0);
    return stats;
  }
  _spawnEnemy(type, progress = 0, child = false) {
    const s = this.state;
    if (s.enemies.filter(enemy => !enemy.dead).length >= MAX_ENEMIES || !owns(ENEMIES, type)) return null;
    const cfg = s.encounter || getEncounter(Math.max(1, s.wave), s.route), data = ENEMIES[type];
    const bossId = type === 'boss' ? cfg.bossId : null, boss = bossId ? BOSSES[bossId] : null;
    const hp = Math.max(1, Math.round(cfg.hp * (boss?.hpMultiplier || data.hpMultiplier || 1)));
    const enemy = {
      id: this._id('e'), type, hp, maxHp: hp, progress, ...position(MAPS[s.mapIndex].path, progress),
      speed: cfg.speed * (boss?.speedMultiplier || data.speedMultiplier || 1), armor: data.armor || 0,
      radius: type === 'boss' ? 0.44 : type === 'shard' ? 0.2 : 0.29,
      slowUntil: 0, slowFactor: 1, burnUntil: 0, burnDamage: 0, hitMemory: {}, child, dead: false,
      marks: {}, reactionReady: 0, vulnerableUntil: 0, armorBreakUntil: 0, armorBreak: 0, shield: 0, shieldUntil: 0,
      abilityAt: s.battleTime + (data.ability?.cooldown || 5), hasteUntil: 0, stunUntil: 0, bossId, bossPhase: 1, bossCast: null,
      bossNextCast: s.battleTime + 7, bossCycle: 0, summons: 0, phoenixUsed: false, siphonSpent: false,
    };
    s.enemies.push(enemy); return enemy;
  }
  _spawnEgg(progress = 0) {
    const s = this.state;
    if (s.eggs.length >= 3) return;
    const hp = 20 + Math.max(0, s.wave) * 5;
    s.eggs.push({ id: this._id('egg'), hp, maxHp: hp, progress, ...position(MAPS[s.mapIndex].eggPath, progress), speed: 0.105, radius: 0.37, hitMemory: {}, dead: false });
  }
  _effect(type, x, y, extra = {}) {
    // Keep floating damage labels bounded independently of the total effect pool.
    if (type === 'hit' && this.state.effects.filter(effect => effect.type === 'hit').length >= 24) return;
    super._effect(type, x, y, extra);
  }
  _nearby(target, radius, maximum = 6) {
    return this.state.enemies.filter(enemy => enemy !== target && !enemy.dead && distance(enemy, target) <= radius)
      .sort((a, b) => distance(a, target) - distance(b, target) || a.progress - b.progress).slice(0, maximum);
  }
  _hit(target, amount, hero, special = true, attack = {}) {
    if (!target || target.dead || target.hp <= 0) return;
    const s = this.state, egg = target.id.startsWith('egg'), mods = hero ? this._mods(hero.type) : this._mods();
    let damage = amount;
    if (egg) damage *= 1 + (mods.eggDamage || 0);
    else {
      let armor = target.armor || 0;
      if (target.armorBreakUntil > s.battleTime) armor = Math.max(0, armor - target.armorBreak);
      armor = Math.max(0, armor - (mods.armorPierce || 0) - (attack.armorPierce || 0));
      damage *= 1 - armor * (hero?.type === 'fire' ? 0.45 : hero?.type === 'thunder' ? 0.7 : 1);
      if (special && target.hp < target.maxHp * 0.35) damage *= 1 + (mods.executeDamage || 0);
      if (target.type === 'boss') damage *= 1 + (mods.bossDamage || 0);
      if (target.slowUntil > s.battleTime) damage *= 1 + (mods.slowedDamage || 0);
      if (target.vulnerableUntil > s.battleTime) damage *= 1.2;
      if (target.shieldUntil > s.battleTime && target.shield > 0) {
        const blocked = Math.min(target.shield, damage); target.shield -= blocked; damage -= blocked;
      }
    }
    damage = Math.max(0, damage);
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage); s.stats.damage += dealt;
    this._effect('hit', target.x, target.y, { value: Math.round(dealt), color: HEROES[hero?.type]?.color || '#ffd879', targetId: target.id });
    if (target.hp <= 0) { target.dead = true; if (egg) this._hatch(target); else this._kill(target); }
    if (egg || !special || !hero) return;
    const stats = this.heroStats(hero);
    if (!target.dead) {
      if (hero.type === 'frost') { target.slowUntil = Math.max(target.slowUntil, s.battleTime + 1.45 + (mods.slowDuration || 0)); target.slowFactor = Math.min(target.slowFactor, stats.slow); }
      if (hero.type === 'fire' || mods.allBurn) {
        target.burnUntil = Math.max(target.burnUntil, s.battleTime + 2 + (mods.burnDuration || 0));
        target.burnDamage = Math.max(target.burnDamage, (stats.burn + stats.damage * (mods.allBurn || 0) * (1 + (mods.burnDamage || 0))));
      }
    }
    if (hero.type === 'fire') {
      this._effect('blast', target.x, target.y, { radius: 0.85, color: HEROES.fire.color });
      for (const other of this._nearby(target, 0.85)) this._hit(other, amount * (0.36 + (mods.splashDamage || 0)), hero, false);
    }
    if (hero.type === 'blade' && mods.splashDamage) for (const other of this._nearby(target, 0.7, 6)) this._hit(other, amount * mods.splashDamage, hero, false);
    if (hero.type === 'thunder') for (const other of this._nearby(target, 1.55, Math.min(6, stats.chain))) {
      this._effect('chain', other.x, other.y, { fromX: target.x, fromY: target.y, color: HEROES.thunder.color });
      this._hit(other, amount * (0.62 + (mods.chainDamage || 0)), hero, false);
    }
    if (!target.dead) this._applyElement(target, hero, amount, mods);
    this._triggerCombo(target, hero, amount);
  }
  _procMods(heroType) {
    const mods = this._mods(heroType);
    // The alchemist and conductor explicitly strengthen the team's reactions / combos.
    for (const [id, rank] of Object.entries(this.state.talents)) {
      const talent = TALENTS[id];
      if (!talent?.class || talent.class === heroType) continue;
      for (const key of ['reactionDamage', 'reactionWindow', 'comboDamage', 'comboCooldown']) mods[key] = (mods[key] || 0) + (talent.effects[key] || 0) * rank;
    }
    return mods;
  }
  _applyProc(target, hero, power, effects, mods) {
    const s = this.state, limit = Math.min(6, effects.targets || (effects.radius ? 6 : 1));
    const targets = [target, ...this._nearby(target, effects.radius || 0, limit - 1)].filter(enemy => !enemy.dead).slice(0, limit);
    for (const enemy of targets) {
      if (effects.slow) { enemy.slowUntil = Math.max(enemy.slowUntil, s.battleTime + (effects.duration || 2)); enemy.slowFactor = Math.min(enemy.slowFactor, effects.slow); }
      if (effects.stun) enemy.stunUntil = Math.max(enemy.stunUntil, s.battleTime + effects.stun * (enemy.type === 'boss' ? 0.4 : 1));
      if (effects.armorBreak) { enemy.armorBreakUntil = s.battleTime + (effects.duration || 3); enemy.armorBreak = effects.armorBreak; }
      if (effects.burn) { enemy.burnUntil = Math.max(enemy.burnUntil, s.battleTime + (effects.duration || 3)); enemy.burnDamage = Math.max(enemy.burnDamage, power * effects.burn * (1 + (mods.burnDamage || 0))); }
      this._interrupt(enemy);
      this._hit(enemy, power * (effects.damage || 0), hero, false, { armorPierce: effects.armorPierce || 0 });
      if (effects.targets) this._effect('chain', enemy.x, enemy.y, { fromX: target.x, fromY: target.y, color: '#c8b0ff' });
    }
  }
  _applyElement(target, hero, amount) {
    const s = this.state, mods = this._procMods(hero.type);
    target.marks[hero.type] = s.battleTime + 3 + (mods.reactionWindow || 0);
    if (target.reactionReady > s.battleTime) return;
    const partner = CLASSES.find(type => type !== hero.type && (target.marks[type] || 0) > s.battleTime);
    if (!partner) return;
    const pair = CLASSES.filter(type => type === hero.type || type === partner).join('_');
    if (!owns(REACTIONS, pair)) return;
    target.reactionReady = s.battleTime + 1.2;
    delete target.marks[hero.type]; delete target.marks[partner];
    s.stats.reactions++; s.reactionLog.push({ id: pair, at: s.battleTime, x: target.x, y: target.y });
    if (s.reactionLog.length > 8) s.reactionLog.shift();
    this._applyProc(target, hero, amount * (1 + (mods.reactionDamage || 0)), REACTIONS[pair].effects, mods);
    this._effect('blast', target.x, target.y, { radius: REACTIONS[pair].effects.radius || 0.8, color: '#f8d16d' });
    this._effect('reaction', target.x, target.y, { label: REACTIONS[pair].name, reactionId: pair, color: '#f8d16d' });
  }
  _triggerCombo(target, hero, amount) {
    const s = this.state;
    for (const id of s.combos) {
      const combo = COMBOS[id];
      if (!combo.classes.includes(hero.type) || (s.comboCooldowns[id] || 0) > s.battleTime) continue;
      const mods = this._procMods(hero.type);
      s.comboCooldowns[id] = s.battleTime + combo.cooldown * Math.max(0.5, 1 - (mods.comboCooldown || 0));
      s.stats.comboTriggers++;
      this._applyProc(target, hero, amount * (1 + (mods.comboDamage || 0)), combo.effects, mods);
      this._effect('blast', target.x, target.y, { radius: combo.effects.radius || 0.8, color: '#f2c2ff' });
      this._effect('combo', target.x, target.y, { label: combo.name, comboId: id, color: '#f2c2ff' });
      break;
    }
  }
  _kill(enemy) {
    const s = this.state;
    s.stats.kills++; s.waveKills++; s.xp = Math.min(s.xpNext, s.xp + (enemy.child ? 0 : 1));
    if (enemy.type === 'boss') {
      s.stats.bosses++;
      s.lives = Math.min(s.maxLives, s.lives + (this._mods().healOnBoss || 0));
      if (enemy.bossCast) enemy.bossCast = null;
    }
    const value = this._earn((enemy.type === 'boss' ? 65 + s.stage * 12 : enemy.type === 'shard' ? 2 : 4 + Math.floor(s.wave / 6)) * this._incomeMultiplier());
    this._effect('kill', enemy.x, enemy.y, { value, boss: enemy.type === 'boss' });
    if (enemy.type === 'splitter' && !enemy.child) {
      this._spawnEnemy('shard', Math.max(0, enemy.progress - 0.15), true);
      this._spawnEnemy('shard', Math.max(0, enemy.progress - 0.55), true);
    }
  }
  _hatch(egg) {
    const s = this.state; s.stats.hatched++;
    const cells = this._freeCells().sort((a, b) => distance(a, egg) - distance(b, egg) || a.y - b.y || a.x - b.x);
    let hero = null;
    if (cells.length && s.heroes.length < MAX_HEROES) {
      const type = CLASSES[Math.floor(this._random() * CLASSES.length)];
      hero = this._addHero(type, cells[0].x, cells[0].y);
      this._message(`蛋孵化啦！获得 1 级${HEROES[type].name}。`);
    } else { this._earn(45); this._message('阵地已满，孵化奖励兑换为 45 金币。'); }
    this._earn(this._mods().hatchGold || 0);
    this._effect('hatch', egg.x, egg.y, { heroId: hero?.id, color: hero ? HEROES[hero.type].color : '#ffda76' });
  }

  _interrupt(enemy, source = 'reaction') {
    if (!enemy?.bossCast || enemy.bossCast.interrupted) return false;
    if (enemy.bossPhase === 2 && source !== 'active') {
      if (enemy.bossCast.delayed) return false;
      enemy.bossCast.delayed = true; enemy.bossCast.resolveAt += 1;
      this.state.stats.bossDelays++;
      this._effect('reaction', enemy.x, enemy.y, { label: '读条延后 1 秒', color: '#8ce6f3' });
      return true;
    }
    enemy.bossCast.interrupted = true;
    enemy.stunUntil = Math.max(enemy.stunUntil, this.state.battleTime + 0.5);
    this.state.stats.interrupts++;
    this._effect('blast', enemy.x, enemy.y, { radius: 0.8, color: '#8ce6f3' });
    return true;
  }
  _bossTick(enemy) {
    const s = this.state, boss = BOSSES[enemy.bossId];
    if (!boss) return;
    if (enemy.bossPhase === 1 && enemy.hp <= enemy.maxHp * (boss.phaseAt || 0.5)) {
      enemy.bossPhase = 2; enemy.bossNextCast = Math.min(enemy.bossNextCast, s.battleTime + 2.5);
      this._effect('blast', enemy.x, enemy.y, { radius: 1.3, color: '#fb8c54' });
    }
    if (enemy.bossCast) {
      const cast = enemy.bossCast;
      if (s.battleTime < cast.resolveAt) return;
      const heroes = s.heroes.filter(hero => distance(hero, cast) <= cast.radius);
      if (!cast.interrupted && (cast.kind !== 'silence' || heroes.length)) {
        if (cast.kind === 'summon') {
          const count = enemy.bossPhase === 2 ? boss.phaseCount || 6 : boss.summonCount || 4;
          for (let n = 0; n < count && enemy.summons < 24; n++) {
            if (this._spawnEnemy(boss.summonType || 'runner', Math.max(0, enemy.progress - 1 - n * 0.4), true)) enemy.summons++;
          }
        }
        if (cast.kind === 'shield') {
          const fraction = enemy.bossPhase === 2 ? boss.phaseShieldFraction || 0.30 : boss.shieldFraction || 0.20;
          for (const other of [enemy, ...this._nearby(enemy, boss.radius || 2.2, 6)]) {
            other.shield = Math.max(other.shield, other.maxHp * fraction); other.shieldUntil = s.battleTime + 7;
          }
        }
        if (cast.kind === 'silence') for (const hero of heroes) hero.disabledUntil = Math.max(hero.disabledUntil || 0, s.battleTime + (boss.duration || 4));
        if (cast.kind === 'drain') {
          const fraction = enemy.bossPhase === 2 ? boss.phaseHealFraction || 0.12 : boss.healFraction || 0.08;
          enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * fraction);
          s.activeCooldown = Math.min(120, s.activeCooldown + (boss.cooldownDrain || 8));
        }
        this._effect('blast', cast.x, cast.y, { radius: cast.radius, color: '#e583bd' });
      } else if (!cast.interrupted) {
        this._message('成功移开目标区域的英雄，首领技能落空！');
      }
      enemy.bossCast = null;
      enemy.bossNextCast = s.battleTime + (enemy.bossPhase === 2 ? boss.phaseCooldown || (boss.cooldown || 12) * 0.72 : boss.cooldown || 12);
      return;
    }
    if (s.battleTime < enemy.bossNextCast || !s.heroes.length) return;
    const hero = s.heroes[Math.floor(this._random() * s.heroes.length)];
    const cycle = boss.pattern || ['summon', 'shield', 'silence', 'drain'];
    const kind = boss.mechanic === 'cycle' ? cycle[enemy.bossCycle++ % cycle.length] : boss.mechanic;
    const center = kind === 'silence' ? hero : enemy;
    enemy.bossCast = { kind, x: center.x, y: center.y, radius: enemy.bossPhase === 2 ? boss.phaseRadius || boss.radius || 1.5 : boss.radius || 1.5, resolveAt: s.battleTime + (boss.warning || 2), interrupted: false, delayed: false };
  }
  _enemyAbility(enemy) {
    const s = this.state;
    if (enemy.type === 'boss') { this._bossTick(enemy); return; }
    const ability = ENEMIES[enemy.type].ability;
    if (!ability || s.battleTime < enemy.abilityAt || enemy.stunUntil > s.battleTime) return;
    enemy.abilityAt = s.battleTime + (ability.cooldown || 5);
    if (ability.type === 'heal') {
      for (const other of this._nearby(enemy, ability.radius, Math.min(6, ability.targets))) {
        other.hp = Math.min(other.maxHp, other.hp + other.maxHp * ability.fraction);
        this._effect('chain', other.x, other.y, { fromX: enemy.x, fromY: enemy.y, color: '#9ad68f' });
      }
    }
    if (ability.type === 'shield') for (const other of this._nearby(enemy, ability.radius, Math.min(6, ability.targets))) {
      other.shield = Math.max(other.shield, other.maxHp * ability.fraction); other.shieldUntil = s.battleTime + ability.cooldown;
    }
    if (ability.type === 'disrupt') for (const hero of s.heroes.filter(unit => distance(unit, enemy) <= ability.radius)) {
      hero.disruptedUntil = Math.max(hero.disruptedUntil || 0, s.battleTime + ability.duration);
      this._effect('chain', hero.x, hero.y, { fromX: enemy.x, fromY: enemy.y, color: '#bc92e3' });
    }
    if (ability.type === 'siphon') s.activeCooldown = Math.min(120, s.activeCooldown + ability.amount);
  }
  _step(dt) {
    const s = this.state;
    for (const effect of s.effects) effect.life -= dt;
    s.effects = s.effects.filter(effect => effect.life > 0);
    if (s.phase === 'won' || s.phase === 'lost') return;
    s.time += dt;
    const battle = s.phase === 'battle';
    if (battle) {
      s.battleTime += dt; s.waveElapsed += dt; s.activeCooldown = Math.max(0, s.activeCooldown - dt);
      // Leave blocked entries in the queue: the mobile population cap never deletes enemies.
      while (s.spawnQueue.length && s.spawnQueue[0].at <= s.waveElapsed + 1e-8 && s.enemies.filter(enemy => !enemy.dead).length < MAX_ENEMIES) {
        const next = s.spawnQueue.shift(); s.currentBatch = Math.max(s.currentBatch, next.batch); this._spawnEnemy(next.type);
      }
      this._updateReinforcement();
      const mods = this._mods(), path = MAPS[s.mapIndex].path;
      for (const enemy of s.enemies.slice()) {
        if (enemy.dead) continue;
        if (enemy.burnUntil > s.battleTime) {
          const damage = Math.min(enemy.hp, enemy.burnDamage * dt); enemy.hp = Math.max(0, enemy.hp - damage); s.stats.damage += damage;
          if (!enemy.hp) { enemy.dead = true; this._kill(enemy); continue; }
        }
        this._enemyAbility(enemy);
        const slowed = enemy.slowUntil > s.battleTime ? enemy.slowFactor : 1;
        if (enemy.slowUntil <= s.battleTime) enemy.slowFactor = 1;
        const berserk = enemy.type === 'berserker' && enemy.hp < enemy.maxHp * ENEMIES.berserker.ability.threshold ? 1 + ENEMIES.berserker.ability.speed : 1;
        const phase = enemy.type === 'boss' && enemy.bossPhase === 2 ? 1.12 : 1;
        enemy.progress += enemy.speed * dt * slowed * berserk * phase * Math.max(0.55, 1 - (mods.enemySlow || 0)) * (enemy.stunUntil > s.battleTime ? 0 : 1);
        Object.assign(enemy, position(path, enemy.progress));
        if (enemy.progress >= path.length - 1) {
          enemy.dead = true; s.stats.leaked++;
          const damage = ENEMIES[enemy.type].leakDamage || (enemy.type === 'boss' ? 4 : 1);
          s.lives = Math.max(0, s.lives - damage);
          this._effect('leak', enemy.x, enemy.y, { value: damage });
          if (!s.lives) { s.phase = 'lost'; s.choices = []; s.nodeQueue = []; s.bossWarning = ''; this._message('防线被突破了。检查先手覆盖、元素配对和天赋，再尝试新构筑。'); break; }
        }
      }
      for (const egg of s.eggs) {
        egg.progress = Math.min(MAPS[s.mapIndex].eggPath.length - 1, egg.progress + dt * egg.speed);
        Object.assign(egg, position(MAPS[s.mapIndex].eggPath, egg.progress));
      }
      const casting = s.enemies.find(enemy => !enemy.dead && enemy.bossCast && !enemy.bossCast.interrupted);
      const labels = { summon: '荆棘召援', shield: '钢铁壁垒', silence: '风暴禁言', drain: '虚空汲取' };
      s.bossWarning = casting ? `${BOSSES[casting.bossId].name}：${labels[casting.bossCast.kind]}！${Math.max(0, casting.bossCast.resolveAt - s.battleTime).toFixed(1)} 秒，${casting.bossPhase === 2 ? '二阶段：反应仅延缓，极寒脉冲打断' : '元素反应或极寒脉冲可打断'}${casting.bossCast.kind === 'silence' ? '；移开圈内英雄可躲避' : ''}` : '';
    }
    for (const hero of s.heroes.slice()) {
      const stats = this.heroStats(hero), previous = hero.angle, delta = TAU / stats.period * dt;
      hero.angle = angle(hero.angle + delta); hero.cooldown = Math.max(0, hero.cooldown - dt);
      if (battle && s.phase === 'battle' && (hero.disabledUntil || 0) <= s.battleTime) {
        for (const target of [...s.enemies, ...s.eggs]) this._contact(hero, target, stats, previous, delta);
      }
    }
    s.enemies = s.enemies.filter(enemy => !enemy.dead); s.eggs = s.eggs.filter(egg => !egg.dead);
    this._refreshCombos();
    if (s.phase === 'battle' && !s.spawnQueue.length && !s.enemies.length) this._finishWave();
  }

  _openEvent() {
    const s = this.state;
    const pool = Object.values(EVENTS).filter(event => !event.minChapter || event.minChapter <= s.stage);
    const event = pool[Math.floor(this._random() * pool.length)];
    if (!event) { s.phase = 'build'; return; }
    s.eventId = event.id;
    s.choices = (Array.isArray(event.options) ? event.options : Object.values(event.options)).map(option => option.id);
  }
  _openShop() {
    const s = this.state, pool = Object.keys(SHOP_ITEMS);
    s.shopOffers = [];
    while (s.shopOffers.length < 4 && pool.length) {
      const id = pool.splice(Math.floor(this._random() * pool.length), 1)[0];
      const offer = { id, price: Math.round(SHOP_ITEMS[id].price * (1 + 0.12 * (s.stage - 1))), sold: false };
      if (SHOP_ITEMS[id].effects.relic === 'random') offer.relicId = this._randomRelic();
      if (SHOP_ITEMS[id].effects.hero === 'random') offer.heroType = CLASSES[Math.floor(this._random() * CLASSES.length)];
      s.shopOffers.push(offer);
    }
  }
  _randomRelic() {
    const pool = Object.keys(RELICS_LONG).filter(id => this._rank(id) < 3);
    return pool.length ? pool[Math.floor(this._random() * pool.length)] : 'gold';
  }
  _awardHero(type, level = 1) {
    const s = this.state;
    if (type === 'random') type = CLASSES[Math.floor(this._random() * CLASSES.length)];
    const cells = this._freeCells().sort((a, b) => a.y - b.y || a.x - b.x);
    if (cells.length && s.heroes.length < MAX_HEROES && owns(HEROES, type)) this._addHero(type, cells[0].x, cells[0].y, level);
    else this._earn(60 * Math.pow(2, level - 1));
  }
  _applyNodeEffects(effects, resolved = {}) {
    const s = this.state;
    if (effects.gold) {
      if (effects.gold > 0) this._earn(effects.gold);
      else { s.gold += effects.gold; s.stats.spent -= effects.gold; }
    }
    if (effects.maxLives) { s.maxLives += effects.maxLives; s.lives += effects.maxLives; }
    if (effects.heal) s.lives = Math.min(s.maxLives, s.lives + effects.heal);
    if (effects.lives) s.lives = Math.min(s.maxLives, s.lives + effects.lives);
    if (effects.talentPoints) s.talentPoints += effects.talentPoints;
    if (effects.egg) for (let n = 0; n < effects.egg; n++) {
      if (s.eggs.length >= 3) this._earn(35); else this._spawnEgg(n * 0.4);
    }
    if (effects.hero) this._awardHero(resolved.heroType || effects.hero, effects.heroLevel || 1);
    if (effects.relic) this._grantRelic(effects.relic === 'random' ? resolved.relicId || this._randomRelic() : effects.relic);
  }
  chooseEvent(optionId) {
    const s = this.state;
    if (!['event', 'camp'].includes(s.phase) || !s.choices.includes(optionId)) return this._message('请选择当前节点的一个选项。');
    const event = s.phase === 'event' && owns(EVENTS, s.eventId) ? EVENTS[s.eventId] : null;
    const options = event ? (Array.isArray(event.options) ? event.options : Object.values(event.options)) : Object.values(CAMP_OPTIONS);
    const option = options.find(item => item.id === optionId);
    if (!option) return this._message('这个选项不可用。');
    const effects = option.effects || {}, requirements = option.requirements || {};
    if (effects.relic && effects.relic !== 'random' && this._rank(effects.relic) >= 3) return this._message('这件遗物已经达到 3 级，请选择其他奖励。');
    const goldRequired = Math.max(requirements.gold || 0, -(effects.gold || 0));
    const livesRequired = Math.max(requirements.minLives || 1, 1 - (effects.lives || 0));
    if (s.gold < goldRequired) return this._message(`需要至少 ${goldRequired} 金币。`);
    if (s.lives < livesRequired) return this._message(`需要至少 ${livesRequired} 点生命。`);
    this._applyNodeEffects(effects);
    this._advanceNode();
    return this._message(`已选择：${option.name}。`, true);
  }
  buyOffer(id) {
    const s = this.state;
    if (s.phase !== 'shop' || !owns(SHOP_ITEMS, id)) return this._message('只能在商店购买当前商品。');
    const offer = s.shopOffers.find(item => item.id === id);
    if (!offer || offer.sold) return this._message('这件商品已经售出或不在当前商店。');
    const relicId = offer.relicId || SHOP_ITEMS[id].effects.relic;
    if (relicId && relicId !== 'random' && relicId !== 'gold' && this._rank(relicId) >= 3) return this._message('这件遗物已经达到 3 级。');
    if (SHOP_ITEMS[id].effects.hero && s.heroes.length >= MAX_HEROES) return this._message('阵地已满，先在下一波准备阶段合成以腾出位置。');
    if (SHOP_ITEMS[id].effects.egg && s.eggs.length >= 3) return this._message('蛋槽已满，先孵化已有的蛋。');
    if (s.gold < offer.price) return this._message(`金币不足，还差 ${offer.price - s.gold}。`);
    s.gold -= offer.price; s.stats.spent += offer.price; offer.sold = true;
    this._applyNodeEffects(SHOP_ITEMS[id].effects, offer);
    return this._message(`购买成功：${SHOP_ITEMS[id].name}。`, true);
  }
  leaveNode() {
    if (this.state.phase !== 'shop') return this._message('请先完成当前选择。');
    this._advanceNode();
    return this._message('离开商店，准备下一波。', true);
  }

  static restore(data) {
    const fail = () => { throw new Error('远征存档数据无效，请开启新旅程。'); };
    let parsed;
    try {
      if (typeof data === 'string' && data.length > 2000000) fail();
      parsed = typeof data === 'string' ? JSON.parse(data) : clone(data);
    } catch { fail(); }
    if (!parsed || parsed.version !== 2 || !parsed.state || parsed.state.version !== 2 || parsed.state.mode !== 'expedition') throw new Error('不支持的远征存档版本。');
    const s = parsed.state;
    const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const num = (value, low = 0, high = 1e12) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
    const integer = (value, low = 0, high = 1e12) => num(value, low, high) && Number.isInteger(value);
    const bool = value => typeof value === 'boolean';
    const str = value => typeof value === 'string' && value.length <= 1000;
    const array = (value, max) => Array.isArray(value) && value.length <= max;
    const unique = values => new Set(values).size === values.length;
    let nodes = 0;
    const safeTree = (value, depth = 0) => {
      if (++nodes > 80000 || depth > 12) fail();
      if (value === null || typeof value === 'boolean') return;
      if (typeof value === 'number') { if (!Number.isFinite(value)) fail(); return; }
      if (typeof value === 'string') { if (value.length > 1000) fail(); return; }
      if (typeof value !== 'object') fail();
      for (const [key, child] of Object.entries(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) fail();
        safeTree(child, depth + 1);
      }
    };
    safeTree(s);
    const schema = new ExpeditionGame(123).state;
    if (Object.keys(s).some(key => !owns(schema, key)) || Object.keys(schema).some(key => !owns(s, key))) fail();
    if (!PHASES.includes(s.phase) || s.totalWaves !== 30 || !integer(s.wave, 0, 30) || !integer(s.stage, 1, 5)
      || !integer(s.mapIndex, 0, 2) || !ROUTES.includes(s.route) || s.mapIndex !== ROUTES.indexOf(s.route)
      || !integer(s.gold, 0, 1e9) || !integer(s.lives, 0, 40) || !integer(s.maxLives, 20, 40) || s.lives > s.maxLives
      || !integer(s.seed, 0, 4294967295) || !integer(s.rng, 1, 4294967295) || !integer(s.nextId, 1, 1e10)
      || !str(s.lastMessage) || !owns(HEROES, s.selectedType) || !bool(s.pendingRoute)
      || !integer(s.level, 1, 31) || !integer(s.xp, 0, 100) || !integer(s.xpNext, 1, 100) || s.xp > s.xpNext
      || !integer(s.talentPoints, 0, 100) || !owns(ACTIVE_SKILLS, s.activeSkill)
      || !num(s.activeCooldown, 0, 120) || !num(s.rallyUntil) || !num(s.globalWardUntil)
      || !num(s.nextReinforcement, 0, 100) || !str(s.bossWarning) || !integer(s.earlyCalls, 0, 3)
      || !integer(s.currentBatch, -1, 3) || !integer(s.waveKills, 0, 1000)) fail();
    for (const key of ['time', 'battleTime', 'waveElapsed']) if (!num(s[key])) fail();
    if (s.battleTime > s.time + 1e-6 || s.waveElapsed > s.battleTime + 1e-6
      || !num(s.accumulator, 0, STEP + 1e-7) || !num(s.spawnTimer, 0, 100)) fail();
    const arrays = { heroes: MAX_HEROES, enemies: MAX_ENEMIES, eggs: 3, effects: MAX_EFFECTS, relics: 24, choices: 3,
      spawnQueue: 100, nodeQueue: 2, shopOffers: 4, combos: 2, unlockedCombos: 6, reactionLog: 8, calledBatches: 3 };
    for (const [key, max] of Object.entries(arrays)) if (!array(s[key], max)) fail();
    for (const key of ['relics', 'choices', 'combos', 'unlockedCombos', 'calledBatches']) if (!unique(s[key])) fail();
    const statKeys = Object.keys(schema.stats);
    if (!object(s.stats) || Object.keys(s.stats).some(key => !statKeys.includes(key)) || statKeys.some(key => !num(s.stats[key]))) fail();
    for (const key of statKeys.filter(key => key !== 'damage')) if (!integer(s.stats[key])) fail();
    if (!integer(s.stats.highestLevel, 1, 6) || !integer(s.stats.wavesCleared, 0, 30) || s.level !== s.stats.wavesCleared + 1) fail();
    for (const [ranks, catalog] of [[s.talents, TALENTS], [s.relicRanks, RELICS_LONG]]) {
      if (!object(ranks) || Object.entries(ranks).some(([id, rank]) => !owns(catalog, id) || !integer(rank, 1, 3))) fail();
    }
    if (Object.keys(s.relicRanks).length !== s.relics.length || s.relics.some(id => !owns(s.relicRanks, id)) || s.maxLives !== 20 + (s.relicRanks.ward || 0)) fail();
    for (const type of CLASSES) if (Object.keys(s.talents).filter(id => TALENTS[id].class === type).length > 1) fail();
    if (!object(s.classMilestones) || Object.keys(s.classMilestones).length !== 4 || CLASSES.some(type => !integer(s.classMilestones[type], 1, 6))) fail();
    if (s.unlockedCombos.some(id => !owns(COMBOS, id) || !COMBOS[id].classes.every(type => s.classMilestones[type] >= 3))
      || Object.keys(COMBOS).some(id => COMBOS[id].classes.every(type => s.classMilestones[type] >= 3) && !s.unlockedCombos.includes(id))
      || s.combos.some(id => !s.unlockedCombos.includes(id))) fail();
    if (!object(s.comboCooldowns) || Object.entries(s.comboCooldowns).some(([id, at]) => !owns(COMBOS, id) || !s.unlockedCombos.includes(id) || !num(at, 0, s.battleTime + 15))) fail();
    if (s.calledBatches.some(batch => !integer(batch, 1, 3)) || s.calledBatches.length !== s.earlyCalls) fail();
    for (const entry of s.reactionLog) if (!object(entry) || !owns(REACTIONS, entry.id) || !num(entry.at, 0, s.battleTime + 1e-6) || !num(entry.x, 0, 8) || !num(entry.y, 0, 10)) fail();
    const slot = s.wave ? (s.wave - 1) % 6 + 1 : 0;
    const completedPhase = !['battle', 'lost'].includes(s.phase);
    if (s.stats.wavesCleared !== s.wave - (completedPhase ? 0 : 1) || (s.wave === 0 && s.phase !== 'build')
      || (s.phase === 'won' && s.wave !== 30) || (s.wave === 30 && completedPhase && s.phase !== 'won')
      || (s.phase === 'lost' ? s.lives !== 0 : s.lives === 0)) fail();
    const expectedStage = s.phase === 'build' && s.wave > 0 && slot === 6 ? Math.min(5, Math.floor(s.wave / 6) + 1) : Math.ceil(Math.max(1, s.wave) / 6);
    if (s.stage !== expectedStage) fail();
    const expectedQueue = s.phase === 'reward' && slot === 3 ? ['shop'] : s.phase === 'reward' && slot === 6 ? ['route'] : [];
    if (JSON.stringify(s.nodeQueue) !== JSON.stringify(expectedQueue)) fail();
    if (s.pendingRoute !== (s.phase === 'route' || (s.phase === 'reward' && slot === 6))) fail();
    if (s.choices.some(id => !str(id))) fail();
    if (s.phase === 'reward') {
      if (![1, 3, 4, 6].includes(slot) || !s.choices.length) fail();
      if (s.choices.includes('gold')) { if (s.choices.length !== 1 || Object.keys(RELICS_LONG).some(id => (s.relicRanks[id] || 0) < 3)) fail(); }
      else if (s.choices.some(id => !owns(RELICS_LONG, id) || (s.relicRanks[id] || 0) >= 3)) fail();
    } else if (s.phase === 'route') {
      if (slot !== 6 || s.choices.length !== 3 || ROUTES.some(id => !s.choices.includes(id))) fail();
    } else if (s.phase === 'event') {
      if (slot !== 2 || !owns(EVENTS, s.eventId)) fail();
      const choices = EVENTS[s.eventId].options.map(option => option.id);
      if (JSON.stringify(s.choices) !== JSON.stringify(choices)) fail();
    } else if (s.phase === 'camp') {
      if (slot !== 5 || JSON.stringify(s.choices) !== JSON.stringify(Object.keys(CAMP_OPTIONS))) fail();
    } else if (s.choices.length) fail();
    if (s.phase !== 'event' && s.eventId !== null) fail();
    if (s.phase === 'shop') {
      if (slot !== 3 || s.shopOffers.length !== 4 || !unique(s.shopOffers.map(offer => offer.id))) fail();
      for (const offer of s.shopOffers) {
        if (!object(offer) || !owns(SHOP_ITEMS, offer.id) || !bool(offer.sold)
          || offer.price !== Math.round(SHOP_ITEMS[offer.id].price * (1 + 0.12 * (s.stage - 1)))) fail();
        const effects = SHOP_ITEMS[offer.id].effects;
        if (effects.relic === 'random' && !(offer.relicId === 'gold' || owns(RELICS_LONG, offer.relicId))) fail();
        if (effects.hero === 'random' && !owns(HEROES, offer.heroType)) fail();
        if (Object.keys(offer).some(key => !['id', 'price', 'sold', 'relicId', 'heroType'].includes(key))) fail();
      }
    } else if (s.shopOffers.length) fail();
    if (['battle', 'lost'].includes(s.phase)) {
      const encounter = getEncounter(s.wave, s.route);
      if (JSON.stringify(s.encounter) !== JSON.stringify(encounter)) fail();
      if (s.currentBatch >= encounter.batchCount || s.calledBatches.some(batch => batch >= encounter.batchCount)) fail();
      let previous = -1, previousBatch = -1;
      for (const entry of s.spawnQueue) {
        if (!object(entry) || !owns(ENEMIES, entry.type) || !num(entry.at, 0, encounter.duration)
          || !integer(entry.batch, 0, encounter.batchCount - 1) || entry.at < previous || entry.batch < previousBatch
          || Object.keys(entry).some(key => !['type', 'at', 'batch'].includes(key))) fail();
        previous = entry.at; previousBatch = entry.batch;
      }
      // Queue types and batches must be an untouched suffix; only spawn times can be accelerated.
      const source = encounter.schedule.slice(encounter.schedule.length - s.spawnQueue.length);
      if (source.some((entry, i) => entry.type !== s.spawnQueue[i].type || entry.batch !== s.spawnQueue[i].batch || s.spawnQueue[i].at > entry.at + 1e-6)) fail();
    } else if (s.encounter !== null || s.enemies.length || s.spawnQueue.length || s.nextReinforcement !== 0) fail();
    const ids = new Set(), occupied = new Set();
    const entity = (value, prefix) => {
      if (!object(value) || !str(value.id) || !new RegExp('^' + prefix + '[1-9][0-9]*$').test(value.id)
        || ids.has(value.id) || Number(value.id.slice(prefix.length)) >= s.nextId
        || !num(value.x, 0, COLS - 1) || !num(value.y, 0, ROWS - 1)) fail();
      ids.add(value.id);
    };
    for (const hero of s.heroes) {
      entity(hero, 'h');
      const key = `${hero.x},${hero.y}`;
      if (!owns(HEROES, hero.type) || !integer(hero.level, 1, 6) || !isBuildable(hero.x, hero.y, s.mapIndex) || occupied.has(key)
        || !num(hero.angle, 0, TAU + 1e-8) || !num(hero.cooldown, 0, 1) || !integer(hero.invested, 1, 1e6)
        || !num(hero.disabledUntil) || !num(hero.disruptedUntil) || hero.level > s.classMilestones[hero.type] || hero.level > s.stats.highestLevel) fail();
      occupied.add(key);
    }
    for (const [targets, prefix, path] of [[s.enemies, 'e', MAPS[s.mapIndex].path], [s.eggs, 'egg', MAPS[s.mapIndex].eggPath]]) for (const target of targets) {
      entity(target, prefix);
      if (!num(target.hp, 0, 1e8) || !num(target.maxHp, 0.1, 1e8) || target.hp > target.maxHp
        || !num(target.progress, 0, path.length) || !num(target.speed, 0, 10) || !num(target.radius, 0.01, 2)
        || !bool(target.dead) || !object(target.hitMemory) || Object.keys(target.hitMemory).length > 1000
        || Object.entries(target.hitMemory).some(([id, at]) => !/^h[1-9][0-9]*$/.test(id) || Number(id.slice(1)) >= s.nextId || !num(at, 0, s.battleTime + 30))) fail();
      const located = position(path, target.progress);
      if (Math.abs(located.x - target.x) > 1e-6 || Math.abs(located.y - target.y) > 1e-6) fail();
      if (prefix === 'egg') continue;
      if (!owns(ENEMIES, target.type) || !num(target.armor, 0, 1) || !num(target.slowFactor, 0, 1) || !num(target.burnDamage)
        || !bool(target.child) || !bool(target.siphonSpent) || !bool(target.phoenixUsed) || !num(target.shield, 0, 1e8)
        || !num(target.armorBreak, 0, 1) || !integer(target.bossPhase, 1, 2) || !integer(target.bossCycle, 0, 1e6) || !integer(target.summons, 0, 24)
        || !object(target.marks) || Object.entries(target.marks).some(([id, at]) => !owns(HEROES, id) || !num(at, 0, s.battleTime + 30))) fail();
      for (const key of ['slowUntil', 'burnUntil', 'reactionReady', 'vulnerableUntil', 'armorBreakUntil', 'shieldUntil', 'abilityAt', 'hasteUntil', 'stunUntil', 'bossNextCast']) if (!num(target[key])) fail();
      if (target.type === 'boss' ? target.bossId !== s.encounter?.bossId || !owns(BOSSES, target.bossId) : target.bossId !== null || target.bossCast !== null) fail();
      if (target.bossCast !== null) {
        const cast = target.bossCast;
        if (!object(cast) || !['summon', 'shield', 'silence', 'drain'].includes(cast.kind) || !num(cast.x, 0, 8) || !num(cast.y, 0, 10)
          || !num(cast.radius, 0.1, 3) || !num(cast.resolveAt, 0, s.battleTime + 3 + 1e-6) || !bool(cast.interrupted) || !bool(cast.delayed)) fail();
      }
    }
    const effectTypes = ['deploy', 'hit', 'blast', 'chain', 'kill', 'hatch', 'merge', 'sell', 'leak', 'reaction', 'combo'];
    for (const effect of s.effects) {
      entity(effect, 'fx');
      if (!effectTypes.includes(effect.type) || !num(effect.life, 0, 2) || !num(effect.maxLife, 0.01, 2) || effect.life > effect.maxLife) fail();
      for (const key of ['value', 'radius', 'fromX', 'fromY']) if (key in effect && !num(effect[key])) fail();
      for (const key of ['label', 'color', 'targetId', 'heroId']) if (key in effect && !str(effect[key])) fail();
      if ('reactionId' in effect && !owns(REACTIONS, effect.reactionId)) fail();
      if ('comboId' in effect && !owns(COMBOS, effect.comboId)) fail();
    }
    const game = new ExpeditionGame(s.seed); game.state = s; return game;
  }

  serialize() { return clone({ version: 2, state: this.state }); }
}
export default ExpeditionGame;
