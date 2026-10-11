/**
 * Expedition data. All rankable effects are PER-RANK additive increments.
 * Duration units: seconds; distance units: grid cells. Fractions use 0.20 = 20%.
 * getEncounter is pure, route-adjusted, and independent of the gameplay RNG.
 */
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const indexed = entries => freeze(Object.fromEntries(entries.map(entry => [entry.id, entry])));
const talent = (id, name, icon, description, effects, extra = {}) => ({ id, name, icon, description, effects, maxRank: 3, class: null, group: 'global', branch: null, ...extra });
const branch = (id, name, icon, description, effects, type, excludes) => talent(id, name, icon, description, effects, { class: type, group: type, branch: id.split('_')[1], excludes, requirement: '每点消耗 1 天赋点；选择后锁定本职业另一专精。' });
const relic = (id, name, icon, description, effects, tags, color = '#f5ce81') => ({ id, name, icon, description, effects, tags, maxRank: 3, color });

export const TALENTS = indexed([
  talent('might', '战阵磨砺', '⚔', '每级：所有英雄接触伤害 +8%。', { damage: 0.08 }),
  talent('rhythm', '同心律动', '≋', '每级：武器旋转速度 +6%。', { rotation: 0.06 }),
  talent('reachcraft', '延展技艺', '↗', '每级：武器攻击半径 +0.06 格。', { range: 0.06 }),
  talent('prosperity', '行军商路', '◈', '每级：击杀及通关金币 +10%。', { income: 0.10 }),
  talent('incubation', '暖巢训练', '◉', '每级：对蛋伤害 +25%，孵化额外获得 5 金币。', { eggDamage: 0.25, hatchGold: 5 }),
  talent('command', '临阵指挥', '✧', '每级：主动技能冷却缩短 8%。', { activeCooldown: 0.08 }),
  branch('blade_reaper', '旋刃 · 扫荡', '⚔', '每级：旋刃接触向周围最多 6 名敌人溅射 18% 伤害。', { splashDamage: 0.18 }, 'blade', 'blade_duelist'),
  branch('blade_duelist', '旋刃 · 决斗', '◆', '每级：旋刃忽略 12% 护甲，对首领伤害 +18%。', { armorPierce: 0.12, bossDamage: 0.18 }, 'blade', 'blade_reaper'),
  branch('fire_inferno', '烈焰 · 燎原', '🔥', '每级：烈焰灼烧伤害 +35%，持续时间 +0.6 秒。', { burnDamage: 0.35, burnDuration: 0.60 }, 'fire', 'fire_alchemist'),
  branch('fire_alchemist', '烈焰 · 炼金', '✹', '每级：元素反应伤害 +22%，元素印记保留时间 +0.4 秒。', { reactionDamage: 0.22, reactionWindow: 0.40 }, 'fire', 'fire_inferno'),
  branch('frost_glacier', '寒霜 · 冰川', '❄', '每级：寒霜减速再增强 5 个百分点，持续时间 +0.4 秒。', { slowStrength: 0.05, slowDuration: 0.40 }, 'frost', 'frost_shatter'),
  branch('frost_shatter', '寒霜 · 碎晶', '◇', '每级：寒霜对处于减速中的敌人伤害 +22%。', { slowedDamage: 0.22 }, 'frost', 'frost_glacier'),
  branch('thunder_tempest', '雷鸣 · 风暴', 'ϟ', '每级：雷电连锁多 1 个目标，连锁伤害 +8%。', { chainTargets: 1, chainDamage: 0.08 }, 'thunder', 'thunder_conductor'),
  branch('thunder_conductor', '雷鸣 · 共振', '⌁', '每级：组合技冷却缩短 10%，组合技伤害 +10%。', { comboCooldown: 0.10, comboDamage: 0.10 }, 'thunder', 'thunder_tempest'),
]);

export const RELICS_LONG = indexed([
  relic('sharp', '磨刀石', '✦', '每级：所有英雄接触伤害 +16%。', { damage: 0.16 }, ['通用', '接触']),
  relic('haste', '疾风铃', '≋', '每级：所有武器旋转速度 +12%。', { rotation: 0.12 }, ['通用', '接触'], '#a9e9c0'),
  relic('reach', '长柄徽章', '↗', '每级：攻击半径 +0.08 格；同时扩大武器轨道。', { range: 0.08 }, ['站位', '接触'], '#9ddcf0'),
  relic('bounty', '招财铜钱', '◈', '每级：立即获得 35 金币；击杀及通关金币 +12%。', { goldOnAcquire: 35, income: 0.12 }, ['经济'], '#ffcc72'),
  relic('hatchery', '孵化护符', '◉', '每级：对蛋伤害 +35%，孵化额外获得 10 金币。', { eggDamage: 0.35, hatchGold: 10 }, ['孵化', '经济'], '#f2c2ff'),
  relic('fortress', '守护之心', '♥', '每级：立即恢复 3 生命；所有英雄接触伤害 +5%。', { healOnAcquire: 3, damage: 0.05 }, ['生存', '接触'], '#ff9d9d'),
  relic('winter', '霜冬沙漏', '⌛', '每级：所有敌人的基础移动速度降低 6%。', { enemySlow: 0.06 }, ['控制'], '#99dfed'),
  relic('ember', '余烬之种', '✹', '每级：任意职业接触附加每秒 6% 接触伤害的灼烧，持续 2 秒。', { allBurn: 0.06 }, ['灼烧', '混编'], '#ffa974'),
  relic('execution', '斩落徽记', '▼', '每级：对生命低于 35% 的敌人，接触伤害 +20%。', { executeDamage: 0.20 }, ['接触', '收割']),
  relic('mirror', '破王之镜', '◆', '每级：所有英雄对首领的接触伤害 +18%。', { bossDamage: 0.18 }, ['首领']),
  relic('kindling', '不灭火绒', '♨', '每级：所有灼烧伤害 +30%。', { burnDamage: 0.30 }, ['灼烧'], '#ffb074'),
  relic('crucible', '虹彩坩埚', '⚗', '每级：六种元素反应的伤害 +18%。', { reactionDamage: 0.18 }, ['反应', '混编'], '#edb6ef'),
  relic('deepfreeze', '冻海蓝晶', '❆', '每级：寒霜命中减速持续时间 +0.5 秒。', { slowDuration: 0.50 }, ['控制'], '#a7e4f0'),
  relic('icebreaker', '碎冰尖刺', '◇', '每级：所有英雄对已减速目标的接触伤害 +15%。', { slowedDamage: 0.15 }, ['控制', '接触'], '#b7edff'),
  relic('conductor', '导电枝杈', 'ϟ', '每级：雷电连锁伤害 +15%。', { chainDamage: 0.15 }, ['连锁'], '#c8b0ff'),
  relic('coil', '回环线圈', '⌁', '每级：雷电连锁多 1 个目标，最多连锁 6 名敌人。', { chainTargets: 1 }, ['连锁', '群体'], '#c8b0ff'),
  relic('resonance', '共鸣乐章', '♫', '每级：已装备组合技的伤害 +20%。', { comboDamage: 0.20 }, ['组合技', '混编']),
  relic('hourglass', '回响沙漏', '⋈', '每级：已装备组合技的冷却缩短 8%。', { comboCooldown: 0.08 }, ['组合技'], '#d2c6ff'),
  relic('warbanner', '不退战旗', '⚑', '每级：集结和极寒脉冲的效果持续时间 +1.5 秒。', { activeDuration: 1.50 }, ['主动技能'], '#ffbb86'),
  relic('ward', '城垣纹章', '⬡', '每级：最大生命 +1，并立即恢复 1 生命。', { maxLives: 1, healOnAcquire: 1 }, ['生存'], '#aad5cf'),
  relic('phoenix', '归巢羽毛', '羽', '每级：击败首领时恢复 3 生命。', { healOnBoss: 3 }, ['首领', '生存'], '#fcb597'),
  relic('compound', '远征账本', '▤', '每级：每波基础通关奖金 +15 金币，受金币收益加成影响。', { waveGold: 15 }, ['经济'], '#dbcb98'),
  relic('magnet', '育雏金环', '◎', '每级：每次孵化额外获得 12 金币。', { hatchGold: 12 }, ['孵化', '经济'], '#f0d286'),
  relic('catalyst', '元素棱镜', '✧', '每级：元素印记保留时间 +0.5 秒，更易触发双职业反应。', { reactionWindow: 0.50 }, ['反应', '混编'], '#b4e3dc'),
]);

export const REACTIONS = indexed([
  { id: 'blade_fire', name: '熔刃', icon: '✹', classes: ['blade', 'fire'], description: '旋刃与烈焰：灼热斩击周围最多 6 敌，并附加灼烧。', counter: '成群小怪、护甲敌人', effects: { damage: 0.70, radius: 1.05, burn: 0.18, duration: 3, armorPierce: 0.35 } },
  { id: 'blade_frost', name: '碎冰', icon: '◇', classes: ['blade', 'frost'], description: '旋刃与寒霜：额外单体伤害，并强力减速 2 秒。', counter: '奔跑者、狂战士', effects: { damage: 1.15, slow: 0.35, duration: 2 } },
  { id: 'blade_thunder', name: '磁裂', icon: 'ϟ', classes: ['blade', 'thunder'], description: '旋刃与雷鸣：跳向附近最多 4 敌，削弱护甲 3 秒。', counter: '盾卫、密集重甲', effects: { damage: 0.65, radius: 1.80, targets: 4, armorBreak: 0.20, duration: 3 } },
  { id: 'fire_frost', name: '蒸汽冲击', icon: '♨', classes: ['fire', 'frost'], description: '烈焰与寒霜：范围冲击最多 6 敌，短暂定身。', counter: '治疗群、首领读条', effects: { damage: 0.80, radius: 1.10, stun: 0.55 } },
  { id: 'fire_thunder', name: '超载', icon: '✷', classes: ['fire', 'thunder'], description: '烈焰与雷鸣：范围爆炸最多 6 敌，擅长清理密集单位。', counter: '分裂群、召唤群', effects: { damage: 1.10, radius: 1.25 } },
  { id: 'frost_thunder', name: '寒链', icon: '❆', classes: ['frost', 'thunder'], description: '寒霜与雷鸣：跳向附近最多 5 敌，减速 2.5 秒。', counter: '快速援军、干扰者', effects: { damage: 0.55, radius: 2.00, targets: 5, slow: 0.40, duration: 2.50 } },
].map(entry => ({ ...entry, cooldown: 1.2, markDuration: 3, requirement: '不同职业在印记有效期内先后接触同一敌人；每个敌人共用 1.2 秒反应冷却。' })));

export const COMBOS = indexed([
  { id: 'combo_blade_fire', name: '焰轮堡垒', icon: '☀', classes: ['blade', 'fire'], cooldown: 10, description: '接触触发：目标周围最多 6 敌受到 240% 伤害，并灼烧 4 秒。', effects: { damage: 2.40, radius: 1.65, burn: 0.25, duration: 4 } },
  { id: 'combo_blade_frost', name: '冰棱处刑', icon: '◇', classes: ['blade', 'frost'], cooldown: 8, description: '接触触发：单体造成 420% 伤害，并定身 1.2 秒。', effects: { damage: 4.20, stun: 1.20 } },
  { id: 'combo_blade_thunder', name: '雷刃风车', icon: 'ϟ', classes: ['blade', 'thunder'], cooldown: 9, description: '接触触发：连锁附近最多 6 敌，各造成 220% 伤害。', effects: { damage: 2.20, radius: 2.50, targets: 6 } },
  { id: 'combo_fire_frost', name: '冷热坍缩', icon: '◎', classes: ['fire', 'frost'], cooldown: 12, description: '接触触发：范围内最多 6 敌受到 300% 伤害，并定身 1 秒。', effects: { damage: 3.00, radius: 1.80, stun: 1 } },
  { id: 'combo_fire_thunder', name: '天火裁决', icon: '✷', classes: ['fire', 'thunder'], cooldown: 11, description: '接触触发：目标周围最多 6 敌受到 340% 伤害。', effects: { damage: 3.40, radius: 2.00 } },
  { id: 'combo_frost_thunder', name: '极地磁暴', icon: '❄', classes: ['frost', 'thunder'], cooldown: 10, description: '接触触发：附近最多 6 敌受到 200% 伤害，并减速 80% 持续 3 秒。', effects: { damage: 2.00, radius: 2.50, targets: 6, slow: 0.20, duration: 3 } },
].map(entry => ({ ...entry, requiredLevel: 3, requirement: '两种对应职业都曾达到 3 级；最多装备 2 个组合技。首领定身持续时间为普通敌人的 40%。二阶段首领蓄力仅延后 1 秒一次。' })));

export const ENEMIES = indexed([
  { id: 'normal', name: '苔原团子', icon: '●', description: '普通行军单位，适合练习弯道交叉火力。', counter: '在弯道两侧部署，增加真实武器接触。', hpMultiplier: 1, speedMultiplier: 1, armor: 0, leakDamage: 1, introducedWave: 1, color: '#81b972' },
  { id: 'runner', name: '疾行团子', icon: '»', description: '生命较低，移动速度为普通敌人的 1.5 倍。', counter: '寒霜减速、寒链反应。', hpMultiplier: 0.72, speedMultiplier: 1.50, armor: 0, leakDamage: 1, introducedWave: 1, color: '#e5ba76' },
  { id: 'armored', name: '铁甲团子', icon: '⬡', description: '生命较高，护甲减伤 28%。', counter: '烈焰、雷鸣、决斗专精与磁裂破甲。', hpMultiplier: 1.50, speedMultiplier: 0.85, armor: 0.28, leakDamage: 1, introducedWave: 2, color: '#aab0bd' },
  { id: 'splitter', name: '裂芽母体', icon: '✿', description: '被击败后分成 2 个碎芽；碎芽也会突破防线。', counter: '范围接触、超载与雷电连锁。', hpMultiplier: 1.15, speedMultiplier: 0.92, armor: 0, leakDamage: 1, introducedWave: 3, color: '#b4ca7b' },
  { id: 'shard', name: '碎芽', icon: '·', description: '分裂或召唤生成的低生命单位。', counter: '用群伤收尾；不要只盯着母体。', hpMultiplier: 0.30, speedMultiplier: 1.25, armor: 0, leakDamage: 1, introducedWave: 3, color: '#d1da85' },
  { id: 'healer', name: '苔藓祭司', icon: '+', description: '每 5 秒治疗附近最多 6 名敌人，各恢复 8% 最大生命。', counter: '前段交叉火力优先击杀，蒸汽冲击打断。', hpMultiplier: 0.95, speedMultiplier: 0.83, armor: 0, leakDamage: 1, introducedWave: 4, color: '#98e0c0', ability: { type: 'heal', cooldown: 5, radius: 1.8, fraction: 0.08, targets: 6 } },
  { id: 'shielder', name: '琥珀盾卫', icon: '▣', description: '每 6 秒为附近最多 6 敌添加相当于 18% 最大生命的护盾。', counter: '爆发打破护盾；范围与磁裂可同时压制护卫。', hpMultiplier: 1.65, speedMultiplier: 0.78, armor: 0.18, leakDamage: 1, introducedWave: 7, color: '#d3b574', ability: { type: 'shield', cooldown: 6, radius: 1.7, fraction: 0.18, targets: 6 } },
  { id: 'disruptor', name: '静电扰乱者', icon: '⌁', description: '每 7 秒压制周围英雄，使其旋转速度降低 35%，持续 2.5 秒。', counter: '分散站位，移动英雄远离压制范围。', hpMultiplier: 0.95, speedMultiplier: 1.05, armor: 0, leakDamage: 1, introducedWave: 13, color: '#c4a7e8', ability: { type: 'disrupt', cooldown: 7, radius: 1.55, fraction: 0.35, duration: 2.5 } },
  { id: 'berserker', name: '赤潮狂战士', icon: '▲', description: '生命降到 50% 后，移动速度提高 65%。', counter: '用碎冰控制，集中爆发避免残血逃逸。', hpMultiplier: 1.45, speedMultiplier: 0.90, armor: 0.10, leakDamage: 1, introducedWave: 19, color: '#e28b78', ability: { type: 'rage', threshold: 0.5, speed: 0.65 } },
  { id: 'siphon', name: '虚空窃能者', icon: '◉', description: '每 8 秒使主动技能的剩余冷却增加 4 秒。', counter: '尽早击杀；把主动技能用在它施法之前。', hpMultiplier: 1.05, speedMultiplier: 0.95, armor: 0.12, leakDamage: 1, introducedWave: 25, color: '#a78cbb', ability: { type: 'siphon', cooldown: 8, amount: 4 } },
  { id: 'boss', name: '章节首领', icon: '♛', description: '每章第 6 波出现；半血进入第二阶段；突破扣除 4 生命。首领定身持续时间为普通敌人的 40%。', counter: '预警 2 秒。一阶段可被反应或组合技打断；二阶段每次蓄力仅被延后 1 秒一次。极寒脉冲始终能打断。', hpMultiplier: 18, speedMultiplier: 0.65, armor: 0.12, leakDamage: 4, introducedWave: 6, color: '#dc879a' },
]);

export const BOSSES = indexed([
  { id: 'thorn_king', name: '荆冠古树', icon: '♜', mechanic: 'summon', description: '荆冠号令：预警后召唤 4 个疾行团子；半血后改为 6 个。', counter: '一阶段用反应打断号令；二阶段保留极寒脉冲，范围组合技处理援军。', hpMultiplier: 18, speedMultiplier: 0.58, cooldown: 12, summonType: 'runner', summonCount: 4, phaseCount: 6 },
  { id: 'iron_matron', name: '琥珀铁母', icon: '⬡', mechanic: 'shield', description: '钢铁壁垒：预警后为自身与附近 6 敌加盾；半血后护盾增强。', counter: '一阶段用反应打断壁垒；二阶段用极寒脉冲。决斗与磁裂削弱铁甲。', hpMultiplier: 20, speedMultiplier: 0.55, cooldown: 11, shieldFraction: 0.20, phaseShieldFraction: 0.30, radius: 2.2 },
  { id: 'storm_oracle', name: '风暴先知', icon: 'ϟ', mechanic: 'silence', description: '静电禁区：标记一位英雄的位置，2 秒后压制范围内英雄；半血后范围扩大。', counter: '把英雄移出红色预警圈，或在生效前打断。', hpMultiplier: 19, speedMultiplier: 0.66, cooldown: 10, radius: 1.35, phaseRadius: 1.90, duration: 4 },
  { id: 'void_collector', name: '噬光征收者', icon: '◈', mechanic: 'drain', description: '汲能仪式：预警后回复自身生命，并延长主动冷却；半血后汲取增强。', counter: '保留极寒脉冲中断汲取；一阶段反应可打断，二阶段反应只延后 1 秒。', hpMultiplier: 21, speedMultiplier: 0.58, cooldown: 11, healFraction: 0.08, phaseHealFraction: 0.12, cooldownDrain: 8 },
  { id: 'world_eater', name: '界隙吞噬者', icon: '✺', mechanic: 'cycle', description: '终局轮转：依次使用召唤、护盾、禁区、汲能；半血后读条间隔缩短。', counter: '看清当前读条类型；移动避开禁区，把打断留给护盾或汲能。', hpMultiplier: 26, speedMultiplier: 0.52, cooldown: 10, phaseCooldown: 7, pattern: ['summon', 'shield', 'silence', 'drain'], summonType: 'berserker', summonCount: 3, phaseCount: 4, shieldFraction: 0.15, phaseShieldFraction: 0.22, radius: 1.7, phaseRadius: 2.1, duration: 4, healFraction: 0.06, phaseHealFraction: 0.09, cooldownDrain: 6 },
].map(entry => ({ ...entry, description: `${entry.description} 二阶段反应与组合技仅延后本次蓄力 1 秒一次；极寒脉冲仍可打断。`, warning: 2, phaseAt: 0.5, interruptible: true, maxTargets: 6, phaseTwoCounter: '反应及组合技每次蓄力仅延迟 1 秒一次；极寒脉冲完整打断。' })));

export const CHAPTERS = freeze({
  1: { id: 1, name: '青苔启程', icon: '❧', waves: [1, 6], bossId: 'thorn_king', bossName: '荆冠古树', description: '接触、分裂与治疗的初试。建立至少两种职业的交叉火力。', counter: '治疗者留在后排，范围伤害负责清理分裂与召唤。', introduced: ['normal', 'runner', 'armored', 'splitter', 'healer'], color: '#9ac68f' },
  2: { id: 2, name: '琥珀重围', icon: '⬡', waves: [7, 12], bossId: 'iron_matron', bossName: '琥珀铁母', description: '盾卫掩护重甲推进。选择破甲、灼烧或反应路线。', counter: '用集中输出击破护盾，打断铁母壁垒。', introduced: ['shielder'], color: '#d5b879' },
  3: { id: 3, name: '雷雨前哨', icon: 'ϟ', waves: [13, 18], bossId: 'storm_oracle', bossName: '风暴先知', description: '扰乱者压制密集阵地。学会移动英雄躲避预警。', counter: '分散关键英雄，避开静电禁区。', introduced: ['disruptor'], color: '#b6a4db' },
  4: { id: 4, name: '赤潮裂隙', icon: '▲', waves: [19, 24], bossId: 'void_collector', bossName: '噬光征收者', description: '狂战士在残血时加速；首领试图用汲取拖垮输出。', counter: '减速配爆发，保留一次打断应对汲能。', introduced: ['berserker'], color: '#d99886' },
  5: { id: 5, name: '界隙终章', icon: '✺', waves: [25, 30], bossId: 'world_eater', bossName: '界隙吞噬者', description: '窃能者干扰主动技能；终局首领轮转前四章能力。', counter: '识别读条，调整站位与两种组合技，完成最终守护。', introduced: ['siphon'], color: '#b694cd' },
});

const option = (id, name, description, effects, requirements = {}) => ({ id, name, description, effects, requirements });
const pass = () => option('leave', '继续前进', '无花费，无奖励。', {});
export const EVENTS = indexed([
  { id: 'lost_caravan', name: '迷途商队', icon: '◈', description: '商队愿意分出补给。任选一项，结果固定。', options: [option('coins', '取行军金', '获得 75 金币。', { gold: 75 }), option('supplies', '拿急救包', '恢复 4 生命。', { heal: 4 }), option('egg', '领养遗落的蛋', '获得 1 枚待孵化的蛋；蛋位已满则获得 35 金币。', { egg: 1 })] },
  { id: 'ancient_forge', name: '古老锻炉', icon: '⚒', description: '余温仍在，投入物资可以升级遗物。', options: [option('temper', '锻造磨刀石', '支付 100 金币，磨刀石升 1 级；最高 3 级。', { gold: -100, relic: 'sharp' }, { gold: 100 }), option('sacrifice', '以伤淬刃', '失去 2 生命，疾风铃升 1 级；最高 3 级。', { lives: -2, relic: 'haste' }, { minLives: 3 }), pass()] },
  { id: 'frozen_spring', name: '结霜温泉', icon: '❄', description: '泉水能够疗伤，也能凝成控制遗物。', options: [option('rest', '浸泡疗伤', '恢复 5 生命。', { heal: 5 }), option('crystal', '凝结霜晶', '支付 90 金币，冻海蓝晶升 1 级；最高 3 级。', { gold: -90, relic: 'deepfreeze' }, { gold: 90 }), pass()] },
  { id: 'veteran_lesson', name: '老兵的一课', icon: '⚑', description: '行军间隙，老兵愿意传授临阵经验。', options: [option('lesson', '购入战术笔记', '支付 120 金币，获得 1 天赋点。', { gold: -120, talentPoints: 1 }, { gold: 120 }), option('drill', '负伤特训', '失去 3 生命，获得 1 天赋点。', { lives: -3, talentPoints: 1 }, { minLives: 4 }), option('story', '听完行军故事', '获得 35 金币。', { gold: 35 })] },
  { id: 'abandoned_nest', name: '被遗弃的暖巢', icon: '◉', description: '暖巢里留下了补给和一枚尚未孵化的蛋。', options: [option('adopt', '带走巢中蛋', '获得 1 枚蛋与 25 金币；蛋位已满时共获得 60 金币。', { egg: 1, gold: 25 }), option('charm', '修好孵化护符', '支付 100 金币，孵化护符升 1 级；最高 3 级。', { gold: -100, relic: 'hatchery' }, { gold: 100 }), pass()] },
  { id: 'storm_shrine', name: '雷雨祭台', icon: 'ϟ', description: '祭台回路完整，只需选择带走哪种力量。', options: [option('coil', '取回环线圈', '支付 110 金币，回环线圈升 1 级；最高 3 级。', { gold: -110, relic: 'coil' }, { gold: 110 }), option('prism', '以血唤醒棱镜', '失去 2 生命，元素棱镜升 1 级；最高 3 级。', { lives: -2, relic: 'catalyst' }, { minLives: 3 }), pass()] },
  { id: 'wounded_guardian', name: '受伤的守卫', icon: '♥', description: '守卫请求药资，也愿意用自己的物资交换。', options: [option('aid', '交换守护之心', '支付 80 金币，守护之心升 1 级，并触发其恢复效果。', { gold: -80, relic: 'fortress' }, { gold: 80 }), option('trade', '交换应急物资', '获得 55 金币。', { gold: 55 }), pass()] },
  { id: 'sealed_archive', name: '封存的远征档案', icon: '▤', description: '档案列着明确的交换条件，没有隐藏概率。', options: [option('manual', '誊写天赋手册', '支付 150 金币，获得 1 天赋点。', { gold: -150, talentPoints: 1 }, { gold: 150 }), option('ledger', '以伤开启账本', '失去 2 生命，远征账本升 1 级；最高 3 级。', { lives: -2, relic: 'compound' }, { minLives: 3 }), option('coins', '带走备用资金', '获得 65 金币。', { gold: 65 })] },
]);

export const SHOP_ITEMS = indexed([
  { id: 'field_medicine', name: '野战药箱', icon: '+', price: 90, description: '立即恢复 5 生命，不超过生命上限。', effects: { heal: 5 } },
  { id: 'reinforced_wall', name: '城垣纹章', icon: '⬡', price: 140, description: '城垣纹章升 1 级：生命上限 +1，并恢复 1 生命。', effects: { relic: 'ward' } },
  { id: 'hero_voucher', name: '精锐招募券', icon: '⚑', price: 155, description: '招募 1 位随机职业的 2 级英雄；阵地满员时不可购买。', effects: { hero: 'random', heroLevel: 2 } },
  { id: 'royal_egg', name: '暖巢补给', icon: '◉', price: 75, description: '获得 1 枚待孵化的蛋；蛋槽已满时不可购买。', effects: { egg: 1 } },
  { id: 'relic_cache', name: '遗物匣', icon: '✧', price: 180, description: '随机一件未满级遗物升 1 级；购买前可见具体遗物。', effects: { relic: 'random' } },
  { id: 'talent_manual', name: '天赋手册', icon: '▤', price: 210, description: '获得 1 天赋点，用于通用天赋或职业专精。', effects: { talentPoints: 1 } },
]);

export const CAMP_OPTIONS = indexed([
  option('rest', '围炉休息', '恢复 5 生命。', { heal: 5 }),
  option('train', '夜间训练', '获得 1 天赋点。', { talentPoints: 1 }),
  option('scavenge', '搜集补给', '获得 100 金币。', { gold: 100 }),
].map(entry => ({ ...entry, icon: entry.id === 'rest' ? '♥' : entry.id === 'train' ? '⚑' : '◈' })));

export const ROUTES = indexed([
  { id: 'balanced', name: '稳健行军', icon: '❧', description: '标准敌人和金币收益，沿青苔曲径前进。', mapIndex: 0, hpMultiplier: 1, speedMultiplier: 1, goldMultiplier: 1 },
  { id: 'elite', name: '精英狩猎', icon: '⬡', description: '敌人生命 +20%，金币收益 +25%，沿琥珀矿道前进。', mapIndex: 1, hpMultiplier: 1.2, speedMultiplier: 1, goldMultiplier: 1.25 },
  { id: 'fortune', name: '逐金急行', icon: '◈', description: '敌人速度 +12%，金币收益 +35%，沿清霜溪谷前进。', mapIndex: 2, hpMultiplier: 1, speedMultiplier: 1.12, goldMultiplier: 1.35 },
]);

/** Pure 1-based schedule. The 72–96 sec spawn windows are pacing data, not a playtime claim. */
export function getEncounter(wave, route = 'balanced') {
  if (!Number.isInteger(wave) || wave < 1 || wave > 30) return null;
  const routeData = ROUTES[route] || ROUTES.balanced;
  const chapter = Math.ceil(wave / 6), chapterWave = (wave - 1) % 6 + 1;
  const elite = chapterWave === 3, boss = chapterWave === 6;
  const duration = 72 + (chapter - 1) * 6;
  const batchCount = chapter < 3 ? 3 : 4;
  const count = Math.min(80, 40 + Math.floor((wave - 1) * 1.25) + (elite ? 4 : 0));
  const hp = Math.round(38 * Math.pow(1.16, wave - 1) * (elite ? 1.12 : 1) * routeData.hpMultiplier);
  const speed = +(Math.min(0.91, 0.61 + (wave - 1) * 0.009) * routeData.speedMultiplier).toFixed(4);
  const types = [];
  for (let i = 0; i < count; i++) {
    let type = 'normal';
    if (wave >= 25 && i % 11 === 9) type = 'siphon';
    else if (wave >= 19 && i % 9 === 6) type = 'berserker';
    else if (wave >= 13 && i % 13 === 7) type = 'disruptor';
    else if (wave >= 7 && i % 10 === 4) type = 'shielder';
    else if (wave >= 4 && i % 13 === 10) type = 'healer';
    else if (wave >= 3 && i % 9 === 5) type = 'splitter';
    else if (wave >= 2 && i % 5 === 3) type = 'armored';
    else if (i % 6 === 2) type = 'runner';
    types.push(type);
  }
  // A boss arrives early enough to interact with the latter two reinforcement groups.
  if (boss) types[Math.floor(count * 0.48)] = 'boss';
  const schedule = [], batches = [];
  for (let batch = 0; batch < batchCount; batch++) {
    const start = Math.floor(count * batch / batchCount), end = Math.floor(count * (batch + 1) / batchCount);
    const at = batch * duration / batchCount, window = duration / batchCount - 0.5;
    const batchTypes = types.slice(start, end), batchCounts = {};
    for (let j = 0; j < batchTypes.length; j++) {
      const type = batchTypes[j]; batchCounts[type] = (batchCounts[type] || 0) + 1;
      schedule.push({ type, at: +(at + j * window / Math.max(1, batchTypes.length - 1)).toFixed(3), batch });
    }
    batches.push({ id: batch, at: +at.toFixed(3), count: batchTypes.length, counts: batchCounts, name: batch === 0 ? '先遣部队' : `第 ${batch} 轮援军` });
  }
  const counts = {};
  for (const type of types) counts[type] = (counts[type] || 0) + 1;
  const threats = Object.keys(counts).filter(id => id !== 'normal').map(id => `${ENEMIES[id].name}：${ENEMIES[id].counter}`);
  if (boss) threats.unshift(`${CHAPTERS[chapter].bossName}：${BOSSES[CHAPTERS[chapter].bossId].counter}`);
  return { wave, chapter, chapterWave, chapterData: CHAPTERS[chapter], route: routeData.id, hp, baseHp: hp, speed, duration, batches, batchCount, count, counts, schedule, types: Object.keys(counts), elite, bossId: boss ? CHAPTERS[chapter].bossId : null, bossName: boss ? CHAPTERS[chapter].bossName : '', bossCount: boss ? 1 : 0, threats, tips: threats, goldMultiplier: routeData.goldMultiplier };
}
