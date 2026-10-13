/** Frozen campaign 1 definitions. Preserve exactly for cube-salvo-v1 saves. */
export const COLORS = Object.freeze(['green', 'pink', 'cyan', 'ink']);
export const CAMPAIGN_LENGTH = 12;

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

export const LEVELS = Object.freeze(specs.map(makeLevel));

/** Campaign indices are zero-based. There is deliberately no wraparound. */
export function getLevel(index) {
  if (!Number.isInteger(index) || index < 0 || index >= LEVELS.length) {
    throw new RangeError(`Level index must be between 0 and ${LEVELS.length - 1}.`);
  }
  return LEVELS[index];
}

export function nextLevelIndex(index) {
  getLevel(index);
  return index + 1 < LEVELS.length ? index + 1 : null;
}
