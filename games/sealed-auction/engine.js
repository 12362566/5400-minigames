/**
 * 仓库竞拍: original offline sealed-bid auction engine.
 * All actions are immutable. Never render the internal game object directly;
 * publicView() deliberately excludes unrevealed identities, prices and sealed bids.
 * Virtual coins only. A browser-local save is not an anti-cheat/security boundary.
 */
export const VERSION = 1;
export const CONSTANTS = Object.freeze({ initialWallet: 1200000, totalLots: 5, rounds: 5, gridSize: 8, earlyRatio: 1.4 });
export const RARITIES = Object.freeze([
  { id: 0, name: '普通', color: '#a3a7b2' }, { id: 1, name: '优良', color: '#67bc88' },
  { id: 2, name: '稀有', color: '#61a4ed' }, { id: 3, name: '史诗', color: '#aa7de1' },
  { id: 4, name: '珍品', color: '#e6b84d' }, { id: 5, name: '传奇', color: '#ed6f6d' },
].map(Object.freeze));
export const ROLES = Object.freeze([
  { id: 'appraiser', name: '鉴宝师', description: '每仓私享一件最高品质藏品的名称与价值。', icon: '◇' },
  { id: 'analyst', name: '分析师', description: '每仓获知藏品总数与数量最多的类别。', icon: '▤' },
  { id: 'scout', name: '勘探员', description: '每仓额外看清三件藏品的轮廓与品质。', icon: '⌕' },
].map(Object.freeze));
export const TOOLS = Object.freeze([
  { id: 'scan', name: '定点扫描', cost: 12000, description: '随机鉴定一件尚未鉴定的藏品。' },
  { id: 'appraisal', name: '品质估价', cost: 18000, description: '获知本仓最高品质藏品的总价值。' },
].map(Object.freeze));
const KINDS = [
  ['vase', '瓷器', 1, 2, ['旧陶瓶', '青釉小瓶', '云纹瓷瓶', '月白赏瓶', '鎏彩梅瓶', '星河天青瓶']],
  ['coin', '钱币', 1, 1, ['旧铜币', '花纹银币', '航海纪念币', '古城银章', '金羽纪念章', '孤星铸金币']],
  ['ring', '首饰', 1, 1, ['铜指环', '嵌石银环', '蓝玉戒指', '紫晶指环', '金丝宝石戒', '赤曜王冠戒']],
  ['scroll', '书画', 2, 1, ['旧字卷', '山间画轴', '林泉墨卷', '暮山长卷', '金秋孤本', '万象星图卷']],
  ['camera', '器械', 2, 2, ['旧相机', '折叠相机', '黄铜镜头机', '银壳古典机', '金标珍藏机', '极光原型相机']],
  ['watch', '钟表', 1, 1, ['旧怀表', '镀银怀表', '月相机械表', '珐琅怀表', '金壳星盘表', '天文孤品怀表']],
  ['bottle', '玻璃', 1, 2, ['旧玻璃瓶', '彩色香水瓶', '雕花琉璃瓶', '虹彩玻璃瓶', '金丝琉璃瓶', '流光秘色瓶']],
  ['cup', '茶器', 1, 1, ['旧茶杯', '青釉茶盏', '蓝纹茶杯', '紫砂名家杯', '描金星纹盏', '赤霞孤品茶盏']],
  ['statue', '雕塑', 2, 3, ['木雕摆件', '青石小像', '青铜鹤像', '紫檀山水雕', '金玉飞鸟像', '赤金星辰雕']],
  ['gem', '矿石', 1, 1, ['碎石标本', '绿色晶簇', '蓝晶原石', '紫辉晶石', '金光宝石', '赤星宝钻']],
];
const BASE_VALUES = [1400, 6200, 16500, 44000, 110000, 280000];
export const CATALOG = Object.freeze(KINDS.flatMap(([kind, category, w, h, names], kindIndex) => names.map((name, rarity) => Object.freeze({
  id: `${kind}-${rarity}`, kind, category, w, h, name, rarity,
  value: Math.round(BASE_VALUES[rarity] * (0.76 + ((kindIndex * 7 + rarity * 3) % 11) * 0.048) / 100) * 100,
}))));
const RARITY_WEIGHTS = [25, 27, 24, 14, 8, 2];
const RIVAL_PROFILES = [
  { id: 'rival-1', name: '老许', role: 'appraiser', strategy: '稳健鉴藏', risk: 0.92 },
  { id: 'rival-2', name: '阿岚', role: 'scout', strategy: '敢拍敢收', risk: 1.09 },
  { id: 'rival-3', name: '柏叔', role: 'analyst', strategy: '谨慎算账', risk: 0.98 },
];
const LOT_NAMES = ['旧城藏家库', '河畔寄存库', '山间旧宅库', '港口收藏库', '星辉私人库'];
const MAX_ACTIONS = 110;
const clone = value => JSON.parse(JSON.stringify(value));
const success = state => ({ ok: true, state });
const failure = (state, error) => ({ ok: false, state, error });
const isInt = value => Number.isSafeInteger(value) && value >= 0;
function hash(text) {
  let n = 2166136261;
  for (let i = 0; i < text.length; i++) { n ^= text.charCodeAt(i); n = Math.imul(n, 16777619); }
  return n >>> 0;
}
function seedNumber(seed) {
  if (typeof seed === 'string' && seed.length > 0 && seed.length <= 128) return hash(seed);
  if (isInt(seed) && seed <= 0xffffffff) return seed;
  throw new Error('种子必须是 0–4294967295 的整数或 1–128 字符的文本。');
}
function random(state) {
  state.rng = (state.rng + 0x6D2B79F5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
const pick = (state, values) => values[Math.floor(random(state) * values.length)];
function shuffle(state, values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random(state) * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
function rarityRoll(state) {
  let number = random(state) * 100;
  for (let i = 0; i < RARITY_WEIGHTS.length; i++) { number -= RARITY_WEIGHTS[i]; if (number < 0) return i; }
  return 5;
}
function newLot(state) {
  const items = [], occupied = new Set(), count = 12 + Math.floor(random(state) * 7);
  for (let i = 0; i < count; i++) {
    let rarity = rarityRoll(state);
    // A single interesting piece per warehouse, without guaranteeing a jackpot.
    if (i === 0) rarity = 3 + (random(state) < 0.25 ? 1 : 0);
    let candidate = pick(state, CATALOG.filter(item => item.rarity === rarity));
    let options = placements(candidate, occupied);
    if (!options.length) { candidate = pick(state, CATALOG.filter(item => item.rarity === rarity && item.w === 1 && item.h === 1)); options = placements(candidate, occupied); }
    const { x, y } = pick(state, options);
    const item = { ...candidate, catalogId: candidate.id, id: `item-${hash(`${state.seed}:${state.lotIndex}:${i}`).toString(36)}`, x, y };
    items.push(item);
    for (let yy = y; yy < y + item.h; yy++) for (let xx = x; xx < x + item.w; xx++) occupied.add(`${xx},${yy}`);
  }
  const lot = {
    name: LOT_NAMES[state.lotIndex], items, round: 1, publicSeen: {}, privateSeen: {},
    revealOrder: shuffle(state, items.map(item => item.id)), revealCursor: 0,
    history: [], toolsUsed: [], toolCost: 0, toolClues: [], roleClues: {}, lockedBids: {}, result: null,
  };
  state.lot = lot;
  revealPublic(lot);
  for (const bidder of state.bidders) givePrivateClue(state, bidder);
  lockAiBids(state);
}
function placements(item, occupied) {
  const options = [];
  for (let y = 0; y <= 8 - item.h; y++) for (let x = 0; x <= 8 - item.w; x++) {
    let valid = true;
    for (let yy = y; yy < y + item.h; yy++) for (let xx = x; xx < x + item.w; xx++) if (occupied.has(`${xx},${yy}`)) valid = false;
    if (valid) options.push({ x, y });
  }
  return options;
}
function revealPublic(lot) {
  for (let n = 0; n < 2 && lot.revealCursor < lot.revealOrder.length; n++) {
    const id = lot.revealOrder[lot.revealCursor++];
    lot.publicSeen[id] = { outline: true, rarity: lot.round > 1 };
  }
}
function givePrivateClue(state, bidder) {
  const lot = state.lot, seen = {}, clues = [];
  if (bidder.role === 'appraiser') {
    const rarity = Math.max(...lot.items.map(item => item.rarity));
    const item = pick(state, lot.items.filter(item => item.rarity === rarity));
    seen[item.id] = { outline: true, rarity: true, exact: true };
    clues.push({ type: 'private', text: `鉴宝师私讯：最高品质中有一件${item.name}，价值 ${item.value.toLocaleString('zh-CN')}。`, itemId: item.id });
  } else if (bidder.role === 'scout') {
    const candidates = lot.items.filter(item => !lot.publicSeen[item.id]);
    for (const item of shuffle(state, candidates).slice(0, 3)) seen[item.id] = { outline: true, rarity: true };
    clues.push({ type: 'private', text: '勘探员私讯：已额外标出三件藏品的轮廓和品质。' });
  } else {
    const counts = {};
    for (const item of lot.items) counts[item.category] = (counts[item.category] || 0) + 1;
    const [category, amount] = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))[0];
    clues.push({ type: 'private', count: lot.items.length, category, categoryCount: amount, text: `分析师私讯：本仓共 ${lot.items.length} 件藏品，${category}类最多，共 ${amount} 件。` });
  }
  lot.privateSeen[bidder.id] = seen;
  lot.roleClues[bidder.id] = clues;
}
function itemView(item, observation, reveal = false) {
  const exact = reveal || Boolean(observation.exact);
  const visible = exact || observation.outline;
  const result = { id: item.id, x: item.x, y: item.y, w: item.w, h: item.h, visibility: exact ? 'appraised' : visible ? 'outline' : 'hidden' };
  if (visible) { result.kind = item.kind; result.category = item.category; }
  if (exact || observation.rarity) result.rarity = item.rarity;
  if (exact) { result.name = item.name; result.value = item.value; }
  return result;
}
function observedItems(state, bidderId, reveal = false) {
  const lot = state.lot;
  return lot.items.filter(item => reveal || lot.publicSeen[item.id] || lot.privateSeen[bidderId]?.[item.id]).map(item => itemView(item, { ...(lot.publicSeen[item.id] || {}), ...(lot.privateSeen[bidderId]?.[item.id] || {}) }, reveal));
}
/** AI estimation accepts only observed data, never raw warehouse items/total. */
function estimateFromObservations(observations, disclosedCount) {
  const priorCount = disclosedCount === undefined ? 15 : disclosedCount;
  const priorValue = CATALOG.reduce((sum, item) => sum + item.value * RARITY_WEIGHTS[item.rarity], 0) / (100 * KINDS.length);
  const unknownPrior = Math.max(0, priorCount - observations.length) * priorValue;
  return observations.reduce((total, item) => {
    if (item.visibility === 'appraised') return total + item.value;
    let candidates = CATALOG.filter(entry => entry.w === item.w && entry.h === item.h);
    if (item.kind !== undefined) candidates = candidates.filter(entry => entry.kind === item.kind);
    if (item.rarity !== undefined) candidates = candidates.filter(entry => entry.rarity === item.rarity);
    let weights = 0, weightedValue = 0;
    for (const entry of candidates) { const weight = item.rarity !== undefined ? 1 : RARITY_WEIGHTS[entry.rarity]; weights += weight; weightedValue += entry.value * weight; }
    return total + weightedValue / weights;
  }, unknownPrior);
}
function lockAiBids(state) {
  const lot = state.lot;
  lot.lockedBids = {};
  for (const bidder of state.bidders.slice(1)) {
    const disclosedCount = lot.roleClues[bidder.id].find(clue => clue.count !== undefined)?.count;
    let estimate = estimateFromObservations(observedItems(state, bidder.id), disclosedCount);
    // Published past bids are signals, not access to other players' observations.
    const past = lot.history.at(-1);
    if (past) {
      const positive = past.bids.filter(bid => bid.amount > 0).map(bid => bid.amount).sort((a, b) => a - b);
      if (positive.length) estimate = estimate * 0.94 + positive[Math.floor(positive.length / 2)] * 0.06;
    }
    const aggression = (0.71 + (lot.round - 1) * 0.066) * bidder.risk;
    const uncertainty = 0.94 + random(state) * 0.12;
    const bid = Math.floor(estimate * aggression * uncertainty / 1000) * 1000;
    lot.lockedBids[bidder.id] = Math.min(bidder.wallet, Math.max(0, bid));
  }
}
export function createGame({ seed = 20261011, role = 'appraiser' } = {}) {
  if (!ROLES.some(entry => entry.id === role)) throw new Error('未知角色。');
  const normalizedSeed = seedNumber(seed);
  const state = {
    version: VERSION, seed: normalizedSeed, rng: normalizedSeed, role, lotIndex: 0,
    phase: 'bidding', actions: [], completedLots: [],
    bidders: [{ id: 'player', name: '你', role, wallet: CONSTANTS.initialWallet }, ...RIVAL_PROFILES.map(profile => ({ ...profile, wallet: CONSTANTS.initialWallet }))],
  };
  newLot(state);
  return state;
}
function record(state, action) { state.actions.push(action); }
function settle(state, bids, early) {
  const lot = state.lot;
  if (lot.result) throw new Error('此仓已结算。');
  const highest = Math.max(...bids.map(bid => bid.amount));
  const tiedIds = bids.filter(bid => bid.amount === highest).map(bid => bid.id);
  // Uniform seeded lottery over tied positive bids, fixed bidder order, reproducible on restore.
  const winnerId = highest === 0 ? null : pick(state, tiedIds);
  const winner = state.bidders.find(bidder => bidder.id === winnerId);
  const lotValue = lot.items.reduce((total, item) => total + item.value, 0);
  if (winner) winner.wallet += lotValue - highest;
  const playerWon = winnerId === 'player';
  lot.result = {
    winnerId, winnerName: winner?.name || '流拍', winningBid: highest, lotValue,
    profit: playerWon ? lotValue - highest : 0,
    netProfit: (playerWon ? lotValue - highest : 0) - lot.toolCost,
    playerWon, early, tiedIds: highest > 0 ? tiedIds : [], tie: highest > 0 && tiedIds.length > 1,
    unsold: highest === 0, round: lot.round, toolCost: lot.toolCost,
  };
  state.completedLots.push({ lotIndex: state.lotIndex, lotName: lot.name, ...clone(lot.result) });
  state.phase = 'lot-result';
}
export function submitBid(game, amount) {
  if (game.phase !== 'bidding') return failure(game, '当前不能出价。');
  if (!isInt(amount)) return failure(game, '请输入不小于零的整数。');
  if (amount > game.bidders[0].wallet) return failure(game, '出价不能超过现有资金。');
  const state = clone(game), lot = state.lot;
  const bids = state.bidders.map(bidder => ({ id: bidder.id, name: bidder.name, amount: bidder.id === 'player' ? amount : lot.lockedBids[bidder.id] }));
  const sorted = [...bids].sort((a, b) => b.amount - a.amount);
  // Integer cross multiplication makes the strict 1.4 boundary exact.
  const early = sorted[0].amount * 5 > sorted[1].amount * 7;
  const top = sorted[0].amount;
  lot.history.push({ round: lot.round, bids, highest: top, tiedIds: bids.filter(bid => bid.amount === top).map(bid => bid.id), early });
  record(state, { type: 'bid', amount });
  if (early || lot.round === CONSTANTS.rounds) settle(state, bids, early);
  else state.phase = 'round-result';
  return success(state);
}
export function nextRound(game) {
  if (game.phase !== 'round-result') return failure(game, '请先完成本轮竞价。');
  const state = clone(game);
  state.lot.round += 1;
  state.phase = 'bidding';
  revealPublic(state.lot);
  lockAiBids(state);
  record(state, { type: 'nextRound' });
  return success(state);
}
export function useTool(game, id) {
  if (game.phase !== 'bidding') return failure(game, '只能在提交本轮出价前使用道具。');
  const tool = TOOLS.find(entry => entry.id === id);
  if (!tool) return failure(game, '未知道具。');
  if (game.lot.toolsUsed.includes(id)) return failure(game, '本仓已使用过这个道具。');
  if (game.bidders[0].wallet < tool.cost) return failure(game, '资金不足，无法使用道具。');
  const state = clone(game), lot = state.lot, seen = lot.privateSeen.player;
  if (id === 'scan') {
    const options = lot.items.filter(item => !seen[item.id]?.exact);
    if (!options.length) return failure(game, '所有藏品都已鉴定。');
    const item = pick(state, options);
    seen[item.id] = { outline: true, rarity: true, exact: true };
    lot.toolClues.push({ type: 'tool', text: `扫描结果：${item.name}，价值 ${item.value.toLocaleString('zh-CN')}。`, itemId: item.id });
  } else {
    const rarity = Math.max(...lot.items.map(item => item.rarity));
    const items = lot.items.filter(item => item.rarity === rarity);
    const value = items.reduce((sum, item) => sum + item.value, 0);
    lot.toolClues.push({ type: 'tool', rarity, value, text: `品质估价：本仓${RARITIES[rarity].name}品质藏品共 ${items.length} 件，总价值 ${value.toLocaleString('zh-CN')}。` });
  }
  state.bidders[0].wallet -= tool.cost;
  lot.toolCost += tool.cost;
  lot.toolsUsed.push(id);
  record(state, { type: 'tool', id });
  return success(state);
}
export function nextLot(game) {
  if (game.phase !== 'lot-result') return failure(game, '请先完成本仓竞拍。');
  const state = clone(game);
  record(state, { type: 'nextLot' });
  if (state.lotIndex === CONSTANTS.totalLots - 1) state.phase = 'finished';
  else { state.lotIndex += 1; state.phase = 'bidding'; newLot(state); }
  return success(state);
}
export function publicView(game) {
  const lot = game.lot, reveal = game.phase === 'lot-result' || game.phase === 'finished';
  const player = game.bidders[0];
  const publicClues = [{ type: 'public', text: `公共线索：已公开 ${lot.revealCursor} 件藏品轮廓${lot.round > 1 ? '，本轮新增藏品的品质可见' : ''}。` }];
  return {
    version: VERSION, seed: game.seed, role: game.role, wallet: player.wallet,
    initialWallet: CONSTANTS.initialWallet, profit: player.wallet - CONSTANTS.initialWallet,
    lotIndex: game.lotIndex, totalLots: CONSTANTS.totalLots, lotName: lot.name,
    round: lot.round, maxRounds: CONSTANTS.rounds, phase: game.phase,
    gridSize: CONSTANTS.gridSize, items: observedItems(game, 'player', reveal),
    clues: clone([...publicClues, ...lot.roleClues.player, ...lot.toolClues]),
    history: clone(lot.history), result: clone(lot.result),
    rivals: game.bidders.slice(1).map(bidder => ({ id: bidder.id, name: bidder.name, role: bidder.role, strategy: bidder.strategy, wallet: bidder.wallet })),
    tools: TOOLS.map(tool => ({ ...tool, used: lot.toolsUsed.includes(tool.id), available: game.phase === 'bidding' && !lot.toolsUsed.includes(tool.id) && player.wallet >= tool.cost })),
    toolCost: lot.toolCost,
    stats: { lotsWon: game.completedLots.filter(result => result.playerWon).length, lotsCompleted: game.completedLots.length, totalProfit: player.wallet - CONSTANTS.initialWallet, toolCost: game.completedLots.reduce((total, result) => total + result.toolCost, 0) + (reveal ? 0 : lot.toolCost) },
    completedLots: clone(game.completedLots),
  };
}
function savePayload(game) { return { version: VERSION, seed: game.seed, role: game.role, actions: game.actions }; }
export function serialize(game) {
  const payload = savePayload(game);
  return JSON.stringify({ ...payload, checksum: hash(JSON.stringify(payload)).toString(16).padStart(8, '0') });
}
function exactKeys(object, keys) {
  return object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).sort().join(',') === [...keys].sort().join(',');
}
/** Restore from a versioned action log, then replay; mutable money/items are never trusted. */
export function restore(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 25000) throw new Error('存档格式无效。');
    const saved = JSON.parse(raw);
    if (!exactKeys(saved, ['version', 'seed', 'role', 'actions', 'checksum']) || saved.version !== VERSION) throw new Error('存档版本不兼容。');
    if (!isInt(saved.seed) || saved.seed > 0xffffffff || !ROLES.some(role => role.id === saved.role)) throw new Error('存档角色或种子无效。');
    if (!Array.isArray(saved.actions) || saved.actions.length > MAX_ACTIONS || typeof saved.checksum !== 'string') throw new Error('存档记录无效。');
    const payload = { version: saved.version, seed: saved.seed, role: saved.role, actions: saved.actions };
    if (saved.checksum !== hash(JSON.stringify(payload)).toString(16).padStart(8, '0')) throw new Error('存档校验失败。');
    let state = createGame({ seed: saved.seed, role: saved.role });
    for (const action of saved.actions) {
      let result;
      if (action?.type === 'bid' && exactKeys(action, ['type', 'amount']) && isInt(action.amount)) result = submitBid(state, action.amount);
      else if (action?.type === 'tool' && exactKeys(action, ['type', 'id']) && typeof action.id === 'string') result = useTool(state, action.id);
      else if (action?.type === 'nextRound' && exactKeys(action, ['type'])) result = nextRound(state);
      else if (action?.type === 'nextLot' && exactKeys(action, ['type'])) result = nextLot(state);
      else throw new Error('存档包含无效操作。');
      if (!result.ok) throw new Error('存档操作顺序无效。');
      state = result.state;
    }
    return success(state);
  } catch (error) { return { ok: false, state: null, error: error instanceof Error ? error.message : '无法读取存档。' }; }
}
