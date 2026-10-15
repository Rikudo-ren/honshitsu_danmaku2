/**
 * bulletart.js — 弾スプライトの生成
 *
 * すべて 1px 単位で色を決めて書き込む「ドット絵」として生成する。
 * canvas の arc() 等はアンチエイリアスがかかってドット絵が潰れるため使わない。
 *
 * (type, colorName) の組ごとに「回転フレームを並べた短冊」を遅延生成してキャッシュする。
 * 実際に使われた組み合わせしか生成しないのでメモリは小さく済む。
 */

export const FRAMES = 16;          // 回転フレーム数 (22.5 度刻み)

export const BULLET_COLORS = {
  white:   { rim: '#3d3a5c', body: '#ccd4ff', hi: '#f4f6ff', core: '#ffffff' },
  ice:     { rim: '#1b3f63', body: '#7fd8ff', hi: '#d8f6ff', core: '#ffffff' },
  cyan:    { rim: '#0b4a5c', body: '#38e8e0', hi: '#c9fffb', core: '#ffffff' },
  blue:    { rim: '#182a72', body: '#5a7dff', hi: '#c3d4ff', core: '#ffffff' },
  indigo:  { rim: '#241565', body: '#7a5cff', hi: '#d6c9ff', core: '#ffffff' },
  violet:  { rim: '#411060', body: '#b45cff', hi: '#e8ccff', core: '#ffffff' },
  magenta: { rim: '#5e0d47', body: '#ff5cff', hi: '#ffd0ff', core: '#ffffff' },
  pink:    { rim: '#6d1d3e', body: '#ff8fc4', hi: '#ffdcea', core: '#ffffff' },
  red:     { rim: '#5e0e1d', body: '#ff4166', hi: '#ffc2cd', core: '#ffffff' },
  orange:  { rim: '#5e2d05', body: '#ff9a3c', hi: '#ffdcae', core: '#ffffff' },
  gold:    { rim: '#5e4905', body: '#ffd447', hi: '#fff3c0', core: '#ffffff' },
  green:   { rim: '#0d4823', body: '#5ce08a', hi: '#c8ffdb', core: '#ffffff' },
  jade:    { rim: '#0b4f41', body: '#3cdec0', hi: '#bffff2', core: '#ffffff' },
  shadow:  { rim: '#11081f', body: '#4a3a78', hi: '#a99cd8', core: '#e8e2ff' },
  ash:     { rim: '#242433', body: '#8b91a8', hi: '#e4e8f2', core: '#ffffff' },
  coffee:  { rim: '#33200e', body: '#b87a3f', hi: '#f0d1a8', core: '#ffffff' },
  ember:   { rim: '#4a1408', body: '#ff6b2c', hi: '#ffc290', core: '#fff2d8' },
  blood:   { rim: '#3a0510', body: '#c41840', hi: '#ff8aa0', core: '#ffdde4' },
  ghost:   { rim: '#20243a', body: '#5b6b9c', hi: '#bfcbee', core: '#eef2ff' },
  candy:   { rim: '#5e2050', body: '#ff9ad5', hi: '#ffe0f4', core: '#ffffff' },
};

export const COLOR_NAMES = Object.keys(BULLET_COLORS);

const hexToRgb = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/* ------------------------------------------------------------------ *
 * 形状関数: 中心からの相対座標 (nx, ny は -1..1) と角度 a から
 * 「内側かどうか」と「明るさ 0..1」を返す。
 * ------------------------------------------------------------------ */
const SHAPES = {
  orb: (nx, ny, r) => (r > 1 ? 0 : 1 - r * 0.55),

  /** 大きめの柔らかい球。縁にリングを持たせる */
  orbBig: (nx, ny, r) => {
    if (r > 1) return 0;
    if (r > 0.86) return 0.30 + (1 - r) * 2.0;
    return 0.55 + (1 - r) * 0.9;
  },

  /** 米弾 (速度方向に長い楕円) */
  rice: (nx, ny) => {
    const a = 1.0, b = 0.46;
    const d = Math.sqrt((nx / a) ** 2 + (ny / b) ** 2);
    return d > 1 ? 0 : 1 - d * 0.62;
  },

  /** くない (先端が尖り、後方が広がる) */
  kunai: (nx, ny) => {
    if (nx <= 0) {
      const w = 0.52 * Math.pow(-nx + 1, 0.62);
      if (Math.abs(ny) > w) return 0;
      const t = Math.abs(ny) / Math.max(0.001, w);
      return 0.55 + (1 - t) * 0.45 + nx * 0.2;
    }
    const w = 0.52 * Math.pow(1 - nx, 0.85);
    if (Math.abs(ny) > w) return 0;
    const t = Math.abs(ny) / Math.max(0.001, w);
    return 1 - nx * 0.5 - t * 0.5;
  },

  /** 菱形のかけら */
  shard: (nx, ny) => {
    const d = Math.abs(nx) * 0.72 + Math.abs(ny) * 1.02;
    return d > 1 ? 0 : 1 - d * 0.6;
  },

  star4: (nx, ny, r, a) => {
    const k = 1 - 0.52 * Math.abs(Math.cos(2 * a));
    if (r > k) return 0;
    return 1 - (r / k) * 0.55;
  },
  star6: (nx, ny, r, a) => {
    const k = 1 - 0.46 * Math.abs(Math.cos(3 * a));
    if (r > k) return 0;
    return 1 - (r / k) * 0.55;
  },
  star8: (nx, ny, r, a) => {
    const k = 1 - 0.42 * Math.abs(Math.cos(4 * a));
    if (r > k) return 0;
    return 1 - (r / k) * 0.5;
  },

  /** 花びら (桜のテーマ用) */
  petal: (nx, ny, r, a) => {
    const k = 1 - 0.30 * Math.abs(Math.cos(a)) + 0.10 * Math.cos(2 * a);
    if (r > k) return 0;
    return 1 - (r / k) * 0.6;
  },

  /** 矢印 (向きがはっきり分かる) */
  arrow: (nx, ny) => {
    const y = nx;             // 進行方向を +x とする
    if (y > 0) {
      const w = 0.70 * (1 - y);
      if (Math.abs(ny) > w) return 0;
      return 0.85 - Math.abs(ny) / Math.max(0.001, w) * 0.3;
    }
    const w = 0.30 + 0.40 * (-y) * (1 - Math.abs(ny) * 1.6);
    if (Math.abs(ny) > w) return 0;
    return 0.55 + (1 + y) * 0.35;
  },

  /** 中空のリング (レーザー予告・収束弾) */
  ring: (nx, ny, r) => {
    if (r > 1 || r < 0.52) return 0;
    const edge = Math.min(1 - r, r - 0.52) * 3.2;
    return 0.42 + Math.min(1, edge) * 0.5;
  },

  /** 四角 (回転するブロック弾) */
  square: (nx, ny) => {
    if (Math.abs(nx) > 0.92 || Math.abs(ny) > 0.92) return 0;
    const m = Math.max(Math.abs(nx), Math.abs(ny));
    return 1 - m * 0.62;
  },

  /** 彗星弾 (尾を引く球) */
  comet: (nx, ny, r) => {
    const y = nx;
    if (y > 0.30) {
      const rr = Math.sqrt((y - 0.30) ** 2 * 1.0 + ny * ny * 4.0);
      if (rr > 0.78) return 0;
      return 0.95 - rr * 0.5;
    }
    const tail = (-y + 0.30) / 1.30;
    const w = 0.52 * (1 - tail * 0.92);
    if (Math.abs(ny) > w) return 0;
    return 0.45 + (1 - tail) * 0.5;
  },

  /** ✝ — この作品の記号 */
  cross: (nx, ny) => {
    const t = 0.24;           // 線の太さ (半径比)
    const vRatio = 0.98, hRatio = 0.60, barY = -0.16;
    const inV = Math.abs(nx) < t && Math.abs(ny) < vRatio;
    const inH = Math.abs(nx) < hRatio && Math.abs(ny - barY) < t;
    if (!inV && !inH) return 0;
    const d = Math.min(
      inV ? t - Math.abs(nx) : 9,
      inH ? t - Math.abs(ny - barY) : 9,
      vRatio - Math.abs(ny),
      inH ? hRatio - Math.abs(nx) : 9,
    );
    return 0.5 + Math.min(1, d / t) * 0.5;
  },

  /** 目 (観測される側) */
  eye: (nx, ny) => {
    const a = 1.02, b = 0.60;
    const d = Math.sqrt((nx / a) ** 2 + (ny / b) ** 2);
    if (d > 1) return 0;
    const pupil = Math.sqrt(nx * nx + (ny + 0.02) ** 2 * 1.6);
    if (pupil < 0.30) return 1.0;
    if (pupil < 0.44) return 0.72;
    return 0.34;
  },

  /** 音符は使わないが、コーンスープ (ステージ1の小ネタ) 用の楕円 */
  bean: (nx, ny) => {
    const d = Math.sqrt(nx * nx * 1.35 + ny * ny * 1.9);
    return d > 1 ? 0 : 1 - d * 0.6;
  },
};

/* ------------------------------------------------------------------ *
 * スプライト生成
 * ------------------------------------------------------------------ */

/**
 * 1 フレーム分のピクセルデータを作る。
 * @returns {{data: Uint8ClampedArray, size: number}}
 */
function renderFrame(size, type, col, rotTurns) {
  const img = new ImageData(size, size);
  const d = img.data;
  const c = size / 2;
  const rim = hexToRgb(col.rim), body = hexToRgb(col.body),
        hi = hexToRgb(col.hi), core = hexToRgb(col.core);
  const shape = SHAPES[type] || SHAPES.orb;
  const R = size / 2 - 1.0;

  // 明度マップを作る (0 = 外側)
  const levels = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - c) / R;
      const dy = (y + 0.5 - c) / R;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 1.3) continue;
      // 回転を打ち消して形状空間で評価する
      const ca = Math.cos(-rotTurns), sa = Math.sin(-rotTurns);
      const rx = dx * ca - dy * sa;
      const ry = dx * sa + dy * ca;
      const a = Math.atan2(ry, rx);
      let v = shape(rx, ry, r, a);
      if (v <= 0) continue;
      // 上左からの光
      const light = 1 - (rx * -0.42 + ry * -0.42) * 0.5;
      v = Math.min(1, v * (0.72 + light * 0.42));
      levels[y * size + x] = v;
    }
  }

  // 輪郭 (内側に隣接する外側ピクセルを暗色で埋める)
  const inside = (x, y) => x >= 0 && y >= 0 && x < size && y < size && levels[y * size + x] > 0.001;
  const outline = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inside(x, y)) continue;
      if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) {
        outline[y * size + x] = 1;
      }
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (outline[y * size + x]) {
        d[i] = rim[0]; d[i + 1] = rim[1]; d[i + 2] = rim[2]; d[i + 3] = 255;
        continue;
      }
      const v = levels[y * size + x];
      if (v <= 0.001) continue;
      let rgb;
      if (v < 0.34) rgb = rim;
      else if (v < 0.62) rgb = body;
      else if (v < 0.88) rgb = hi;
      else rgb = core;
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
    }
  }
  return img;
}

/** サイズは形状ごとに決める (小さすぎても大きくてもドット絵が破綻する) */
const SIZE_OF = {
  orb: 16, orbBig: 30, rice: 20, kunai: 22, shard: 18, star4: 20, star6: 22, star8: 24,
  petal: 20, arrow: 20, ring: 24, square: 16, comet: 24, cross: 20, eye: 24, bean: 18,
};

/** 描画半径 (ゲーム内の当たり判定に使う) */
export const BULLET_RADIUS = {
  orb: 5.0, orbBig: 11.0, rice: 4.6, kunai: 5.0, shard: 4.6, star4: 5.2, star6: 5.6, star8: 5.8,
  petal: 5.0, arrow: 5.0, ring: 7.0, square: 4.4, comet: 6.0, cross: 5.2, eye: 7.0, bean: 5.0,
};

const cache = new Map();

/**
 * (type, color) の回転フレーム短冊を取得する。初回のみ生成。
 * @returns {{canvas: HTMLCanvasElement, size: number, frames: number}}
 */
export function getStrip(type, colorName) {
  const key = type + '|' + colorName;
  let s = cache.get(key);
  if (s) return s;

  const size = SIZE_OF[type] || 18;
  const col = BULLET_COLORS[colorName] || BULLET_COLORS.white;
  const cv = document.createElement('canvas');
  cv.width = size * FRAMES;
  cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  for (let f = 0; f < FRAMES; f++) {
    const img = renderFrame(size, type, col, (f / FRAMES) * Math.PI * 2);
    ctx.putImageData(img, f * size, 0);
  }
  s = { canvas: cv, size, frames: FRAMES };
  cache.set(key, s);
  return s;
}

/** 角度 -> フレーム番号 */
export function angleToFrame(angle) {
  let a = angle % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return Math.round((a / (Math.PI * 2)) * FRAMES) % FRAMES;
}

/**
 * 弾を描画する。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} angle 描画方向 (ラジアン, +x が 0)
 */
export function drawBullet(ctx, type, colorName, angle, x, y, scale = 1) {
  const s = getStrip(type, colorName);
  const f = angleToFrame(angle);
  const sz = s.size * scale;
  ctx.drawImage(
    s.canvas,
    f * s.size, 0, s.size, s.size,
    Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz
  );
}

/** 弾のグロー (加算合成用の柔らかい円)。連続的に生成・再利用する。 */
const glowCache = new Map();
export function getGlow(colorName, radius) {
  const key = colorName + '|' + radius;
  let g = glowCache.get(key);
  if (g) return g;
  const size = radius * 2;
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  const col = BULLET_COLORS[colorName] || BULLET_COLORS.white;
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, col.hi);
  grad.addColorStop(0.35, col.body);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(radius, radius, radius, 0, Math.PI * 2); ctx.fill();
  glowCache.set(key, cv);
  return cv;
}

export function clearBulletCache() {
  cache.clear();
  glowCache.clear();
}
