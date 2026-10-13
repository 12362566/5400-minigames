/** Original tall voxel sculptures. No assets from the reference video. */
import { LEVELS as LEGACY_LEVELS } from './legacy-levels.js';

export const COLORS = Object.freeze(['green', 'pink', 'cyan', 'ink']);
export const CAMPAIGN_LENGTH = 12;
export const CURRENT_CAMPAIGN_VERSION = 2;
export { LEGACY_LEVELS };

// The front is z=0. The opening sculpture has the reference’s broad roof and
// eight-course front wall; later sculptures explore taller 14–16-course forms.
const specs = [
  { name: '脉冲花园', subtitle: '选中同色炮台，让色块飞散。', width: 18, depth: 16, height: 8, shape: 'garden', motif: 'sprout', palette: 0 },
  { name: '莓心小岛', subtitle: '一颗颗色块，拼出心动的模样。', width: 18, depth: 10, height: 14, shape: 'heart', motif: 'heart', palette: 1 },
  { name: '潮汐之门', subtitle: '看清前排颜色，逐层打开大门。', width: 20, depth: 8, height: 14, shape: 'gate', motif: 'wave', palette: 2 },
  { name: '回路王冠', subtitle: '留一个空位，迎接下一个颜色。', width: 20, depth: 10, height: 14, shape: 'crown', motif: 'crown', palette: 3 },
  { name: '月光花圃', subtitle: '花瓣深处，藏着新的色彩。', width: 20, depth: 10, height: 15, shape: 'flower', motif: 'flower', palette: 1 },
  { name: '双子城堡', subtitle: '双塔并肩，考验你的出场顺序。', width: 20, depth: 10, height: 15, shape: 'citadel', motif: 'twin', palette: 0 },
  { name: '晶石要塞', subtitle: '层层剥开晶石，为新颜色留出位置。', width: 22, depth: 10, height: 15, shape: 'crystal', motif: 'diamond', palette: 2 },
  { name: '环轨空间站', subtitle: '沿着色彩，探索环形空间站。', width: 22, depth: 12, height: 15, shape: 'orbit', motif: 'orbit', palette: 3 },
  { name: '港湾灯塔', subtitle: '清出一条路，点亮港湾。', width: 22, depth: 10, height: 16, shape: 'beacon', motif: 'beacon', palette: 0 },
  { name: '云顶神殿', subtitle: '每一层，都有自己的节奏。', width: 22, depth: 12, height: 16, shape: 'temple', motif: 'temple', palette: 1 },
  { name: '星云核心', subtitle: '为即将露出的颜色留一个空位。', width: 22, depth: 12, height: 16, shape: 'nebula', motif: 'star', palette: 2 },
  { name: '无尽花园', subtitle: '最后一座雕塑，让它绽放。', width: 22, depth: 12, height: 16, shape: 'infinity', motif: 'infinity', palette: 3 },
];

// Small original pixel-art drawings, mapped across the roof in broad pixels.
// G is a green field; P/C/I are pink, cyan and ink. These are not image assets.
const motifs = {
  sprout: ['GGIIGIIGG', 'GIPIIIPIG', 'GIPPPIPIG', 'GGGIPIGGG', 'GGGICIGGG'],
  heart: ['GIIIGIIIG', 'IPPPIPPPI', 'IPPPPPPPI', 'GIPPPPPIG', 'GGGIPIGGG'],
  wave: ['GGIIIGGGG', 'GICCCIGGG', 'ICGGGCIGI', 'IGGGGICCI', 'GGGGGGIIG'],
  crown: ['IGGGIGGGI', 'IPGIPIGPI', 'IPPIPIPPI', 'GIPPPPPIG', 'GIIIIIIIG'],
  flower: ['GGGIIIGGG', 'GGIPPPIGG', 'IIPPCPPII', 'GGIPPPIGG', 'GGGIIIGGG'],
  twin: ['GIIIGIIIG', 'GICIGIPIG', 'GICIIIPIG', 'GICCCPPIG', 'GIIIIIIIG'],
  diamond: ['GGGGIGGGG', 'GGGICIGGG', 'GGICCCIGG', 'GGGICIGGG', 'GGGGIGGGG'],
  orbit: ['GGIIIIIGG', 'GICGGGCIG', 'ICGGPGGCI', 'GICGGGCIG', 'GGIIIIIGG'],
  beacon: ['GGGIIIGGG', 'GGICCCIGG', 'GGGIPIGGG', 'GGGIPIGGG', 'GGIIIIIGG'],
  temple: ['GGGGIGGGG', 'GGGIPIGGG', 'GGIPPPIGG', 'GIPIPIPIG', 'GIIIIIIIG'],
  star: ['GGGGIGGGG', 'GIIGPIIGG', 'GIPPCPPIG', 'GGIPPPIGG', 'GGIGGIGGG'],
  infinity: ['GGIIGIIGG', 'GIPPIIPPIG', 'GIPPIPPIG', 'GIPPIIPPIG', 'GGIIGIIGG'],
};
const motifColors = { G: 'green', P: 'pink', C: 'cyan', I: 'ink' };

function occupied(s, x, y, z) {
  const dx = Math.abs(x - (s.width - 1) / 2);
  const dz = Math.abs(z - (s.depth - 1) / 2);
  const nx = dx / (s.width / 2);
  const nz = dz / (s.depth / 2);
  const h = s.height;
  const chamfer = !(dx > s.width / 2 - 2 && dz > s.depth / 2 - 2);
  switch (s.shape) {
    case 'garden':
      return chamfer && y < h - (nx > 0.78 || nz > 0.77 ? 1 : 0);
    case 'heart': {
      const a = (x - (s.width - 1) / 2) / (s.width / 2);
      const b = ((s.depth - 1) / 2 - z) / (s.depth / 2);
      const u = a * a + b * b - 0.78;
      return u * u * u - a * a * b * b * b < 0 && y < h - (nx > 0.75 ? 1 : 0);
    }
    case 'gate':
      return chamfer && !(dx < 3 && y > 1 && y < h - 4);
    case 'crown': {
      const tooth = x < 4 || x >= s.width - 4 || dx < 2;
      return chamfer && y < h - (tooth ? 0 : 3);
    }
    case 'flower': {
      const cross = nx < 0.48 || nz < 0.49;
      return (cross || nx * nx + nz * nz < 0.9) && y < h - (nx + nz > 1.05 ? 2 : 0);
    }
    case 'citadel': {
      const tower = x < 6 || x >= s.width - 6;
      const tooth = (x % 5 < 3 || z > 1 && z < s.depth - 2);
      return chamfer && (tower ? y < h - (tooth ? 0 : 1) : y < h - 4 && !(y > 2 && y < 7));
    }
    case 'crystal':
      return nx + nz < 1.62 && y < h - (nx + nz > 1.1 ? 3 : nx + nz > 0.65 ? 1 : 0);
    case 'orbit': {
      const radius = nx * nx + nz * nz;
      const ring = radius < 1.08 && radius > 0.16;
      return ring && y < h - (radius > 0.72 ? 1 : 0) || y < 3 && nx < 0.18 && nz < 0.95;
    }
    case 'beacon':
      return chamfer && y < (nx < 0.43 && nz < 0.65 ? h : h - 4);
    case 'temple': {
      const edge = Math.max(nx, nz);
      const roof = edge > 0.8 ? h - 4 : edge > 0.6 ? h - 2 : h;
      return chamfer && y < roof && !(dx < 2 && z < 3 && y > 1 && y < 8);
    }
    case 'nebula': {
      const star = nx < 0.4 || nz < 0.5 || nx + nz < 1.25;
      return star && y < h - (nx + nz > 1.0 ? 2 : 0);
    }
    case 'infinity': {
      const ax = (x - (s.width - 1) / 2) / (s.width / 2);
      const az = (z - (s.depth - 1) / 2) / (s.depth / 2);
      const left = Math.hypot(ax - 0.39, az), right = Math.hypot(ax + 0.39, az);
      const band = left < 0.75 && left > 0.24 || right < 0.75 && right > 0.24;
      return band && y < h - (nz > 0.62 ? 2 : 0);
    }
    default: return false;
  }
}

function colorAt(s, x, y, z, top) {
  if (y === top) {
    const drawing = motifs[s.motif];
    const row = drawing[Math.min(drawing.length - 1, Math.floor(z / s.depth * drawing.length))];
    return motifColors[row[Math.min(row.length - 1, Math.floor(x / s.width * row.length))]];
  }
  // Broad vertical ribbons wrap around the sculpture. Depth changes the next
  // exposed field, while the two-course dark foundation anchors its height.
  if (y < 2) return 'ink';
  const column = Math.min(3, Math.floor(x / s.width * 4));
  const ribbon = [2, 0, 0, 1][column];
  const depthBand = Math.floor(z / (s.depth <= 8 ? 3 : 4));
  return COLORS[(ribbon + depthBand + s.palette) % COLORS.length];
}

function packets(count, color, levelIndex) {
  const desired = Math.min(112, 56 + levelIndex * 5);
  const number = Math.max(1, Math.ceil(count / desired));
  const small = Math.floor(count / number);
  const extra = count % number;
  return Array.from({ length: number }, (_, i) => Object.freeze({
    id: `v2-l${levelIndex}-${color}-${i}`,
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
  const tops = Array.from({ length: s.depth }, (_, z) => Array.from({ length: s.width }, (_, x) => {
    for (let y = s.height - 1; y >= 0; y--) if (occupied(s, x, y, z)) return y;
    return -1;
  }));
  for (let z = 0; z < s.depth; z++) {
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        if (!occupied(s, x, y, z)) continue;
        const color = colorAt(s, x, y, z, tops[z][x]);
        colorCounts[color]++;
        voxels.push(Object.freeze({ id: voxels.length, x, y, z, color, alive: true }));
      }
    }
  }
  return Object.freeze({
    index,
    id: `sculpture-v2-${index + 1}`,
    campaignVersion: CURRENT_CAMPAIGN_VERSION,
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

/** Resolve old saves using their original geometry, colors, and cannon IDs. */
export function getLevel(index, campaignVersion = CURRENT_CAMPAIGN_VERSION) {
  if (campaignVersion !== 1 && campaignVersion !== CURRENT_CAMPAIGN_VERSION) {
    throw new RangeError('Unknown campaign version.');
  }
  const levels = campaignVersion === 1 ? LEGACY_LEVELS : LEVELS;
  if (!Number.isInteger(index) || index < 0 || index >= levels.length) {
    throw new RangeError(`Level index must be between 0 and ${levels.length - 1}.`);
  }
  return levels[index];
}

/** Campaign indices are zero-based. There is deliberately no wraparound. */
export function nextLevelIndex(index, campaignVersion = CURRENT_CAMPAIGN_VERSION) {
  getLevel(index, campaignVersion);
  return index + 1 < CAMPAIGN_LENGTH ? index + 1 : null;
}
