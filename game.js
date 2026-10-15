'use strict';
/*
 * ✝本質✝ 耐久弾幕（非公式ファン制作プロトタイプ）
 * 原作小説「偏差値60の教室から✝本質✝が漏れ出している件について」（作者名未確認）と
 * 立ち絵（Google Drive「chr」フォルダ内、作者未確認）を基に、ゲーム向けに翻案した作品です。
 * 素材の出典・ライセンスは README.md を参照してください。
 */
(() => {
const W = 480, H = 720, MAXB = 700, CAMD = 3, F3 = 300, HOR = 300, CAMY = 2.4;
const cv = document.getElementById('game');
const g = cv.getContext('2d');
cv.width = W; cv.height = H;
g.imageSmoothingEnabled = false;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const P = n => `assets/portraits/chr_${n}.png`;

// ---------- 定義 ----------
const DIFF = [
  { name: 'EASY',   lives: 4, inv: 3.0, spd: 0.80, den: 0.70, hom: 0.5, gap: 96 },
  { name: 'NORMAL', lives: 3, inv: 2.5, spd: 1.00, den: 1.00, hom: 1.0, gap: 74 },
  { name: 'HARD',   lives: 2, inv: 2.0, spd: 1.15, den: 1.30, hom: 1.4, gap: 58 },
];

const IMGS = {};
const PORTRAIT_FILES = ['ryoma_01_tsuujou','ryoma_07_shinken_ketsui','ryoma_06_nakiwarai',
  'rei_01_suzushii','rei_05_data_shinken','rei_07_kotoba_erabu',
  'terachi_01_nemusou','terachi_03_haishin_shinken','terachi_06_maiku_no_ketsui','terachi_08_namida',
  'mie_01_reishou','mie_09_sunao_hohoemi','naitou_05_yasashii_me','satou_05_camera','sakura_05_egao'];

const STAGES = [
  { tag: 'STAGE 1', name: '両馬二郎の✝本質✝投稿', kind: 'glyph', glyph: '✝', col: '#ffd45c', bg: 's1',
    root: 220, scale: [0, 3, 7, 10, 12, 10, 7, 3], bpm: 96, bossName: '両馬二郎', base: 140, amp: 80,
    imgs: ['ryoma_01_tsuujou', 'ryoma_07_shinken_ketsui', 'ryoma_06_nakiwarai'], cut: 'mie_09_sunao_hohoemi',
    intro: '「いや、だから何が本質なんだよ」', introFrom: '三重県臣（原作の台詞を引用）',
    phases: [
      { name: '✝の螺旋', sub: '本質は、降りてくる。', dur: 26, img: 0, run: pS1a },
      { name: '電線の壁', sub: '隙間にだけ、本質がある。', dur: 26, img: 1, run: pS1b },
      { name: '降りてきた本質', sub: '「いま道歩いてたらすごい✝本質✝が降りてきた」', dur: 30, img: 2, run: pS1c },
    ] },
  { tag: 'STAGE 2', name: '数理零の証明', kind: 'digit', col: '#8ff0ff', bg: 's2',
    root: 261.6, scale: [0, 4, 7, 11, 14, 11, 7, 4], bpm: 108, bossName: '数理零', base: 150, amp: 110,
    imgs: ['rei_01_suzushii', 'rei_05_data_shinken', 'rei_07_kotoba_erabu'], cut: 'naitou_05_yasashii_me',
    intro: '「家が近いから」', introFrom: '数理零（原作の台詞を引用）',
    phases: [
      { name: '素数の波', sub: '5, 7, 11, 13 ── 波は素数で割り切れない。', dur: 24, img: 0, run: pS2a },
      { name: '対称の証明', sub: '四方向は、同じ式で表せる。', dur: 28, img: 1, run: pS2b },
      { name: '零の計算式', sub: '開いた隙間は、解の数だけ残る。', dur: 30, img: 2, run: pS2c },
    ] },
  { tag: 'STAGE 3', name: '寺地星の非公開配信', kind: 'orb', col: '#7fd6ff', bg: 's3',
    root: 196, scale: [0, 2, 3, 7, 9, 7, 3, 2], bpm: 84, bossName: '寺地星', base: 140, amp: 70,
    imgs: ['terachi_01_nemusou', 'terachi_03_haishin_shinken', 'terachi_06_maiku_no_ketsui', 'terachi_08_namida'],
    cut: 'satou_05_camera', intro: '「三十二人がちょうどいい」', introFrom: '寺地星（原作の台詞を引用）',
    phases: [
      { name: '地形図', sub: '等高線は、中心から広がる。中は安全。', dur: 24, img: 0, run: pS3a },
      { name: '等高線', sub: '一本の線が、ひとりに向かってくる。', dur: 26, img: 1, run: pS3b },
      { name: '非公開配信', sub: '奥行きに、本質がある。（3D フェーズ）', dur: 30, img: 2, run: pS3c, mode3d: true },
      { name: '三十二人の本質', sub: 'ゆっくり、全部読める。', dur: 34, img: 3, run: pS3d },
    ] },
];
const CUTS = ['mie_01_reishou'];

// ---------- 状態 ----------
const M = { sel: 2, diff: 1, stage: 0 };
const S = {
  scene: 'title', s: 'title', d: DIFF[1], st: null, si: 0, pi: 0, ph: null,
  clock: 0, dt: 0, timer: 0, q: [], bl: [], lz: [], b3: [], PT: [],
  x: W / 2, y: H * 0.8, wx: 0, wh: 1.0, wz: 8, pzPrev: 8,
  inv: 0, lives: 3, maxLives: 3, graze: 0, score: 0, noMiss: true, shake: 0,
  is3d: false, tv: 0, tv0: 0, drag: false, tgt: null, pausedFrom: 'play',
  boss: { x: W / 2, y: 140, base: 140, amp: 80, shake: 0, charge: 0, img: 0, dis: false },
};
const keys = {};

// ---------- 画像 ----------
function loadImg(src) {
  return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
}
const PIX = {};
function pixel(img, h, col) {
  if (!img) return null;
  const key = img.src + '|' + h + '|' + (col || '');
  if (PIX[key]) return PIX[key];
  const w = Math.round(h * img.width / img.height);
  const sm = document.createElement('canvas');
  sm.width = Math.max(8, Math.round(w / 4)); sm.height = Math.round(h / 4);
  sm.getContext('2d').drawImage(img, 0, 0, sm.width, sm.height);            // ピクセル化（縮小）
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.drawImage(sm, 0, 0, w, h);                                             // 最近傍で拡大
  if (col) {                                                                // 色調の統一（ステージ色を薄く乗せる）
    x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 0.18;
    x.fillStyle = col; x.fillRect(0, 0, w, h);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }
  return (PIX[key] = c);
}
function portrait(name, h, col) { return pixel(IMGS[P(name)], h, col); }

// 弾のスプライト（キャッシュ）
const SPR = {};
function spr(col, ch) {
  const k = col + '|' + (ch || '');
  if (SPR[k]) return SPR[k];
  const c = document.createElement('canvas'); c.width = c.height = 24;
  const x = c.getContext('2d');
  if (ch) {
    x.font = 'bold 15px "Noto Sans JP","Yu Gothic","Hiragino Sans",sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = col; x.shadowBlur = 7; x.fillStyle = '#fff'; x.fillText(ch, 12, 13);
    x.shadowBlur = 0; x.globalAlpha = 0.35; x.fillStyle = col; x.fillText(ch, 12, 13);
  } else {
    const gr = x.createRadialGradient(12, 12, 0, 12, 12, 12);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 24, 24);
  }
  return (SPR[k] = c);
}
function kindSpr() {
  const st = S.st;
  if (st.kind === 'digit') return spr(st.col, String(Math.floor(Math.random() * 10)));
  if (st.kind === 'glyph') return spr(st.col, st.glyph);
  return spr(st.col, null);
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- 音（手続き生成） ----------
let AC = null, master = null, nextT = 0, mstep = 0, musicOn = false;
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.22; master.connect(AC.destination);
    setInterval(scheduleMusic, 40);
  } catch (e) { AC = null; }
}
function tone(f, t, d, type, vol, slide) {
  if (!AC) return;
  const o = AC.createOscillator(), gn = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
  gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.01);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(gn); gn.connect(master); o.start(t); o.stop(t + d + 0.05);
}
function sfx(k) {
  if (!AC) return; const t = AC.currentTime;
  if (k === 'graze') tone(1400, t, 0.05, 'sine', 0.05);
  if (k === 'hit') tone(260, t, 0.5, 'sawtooth', 0.18, 40);
  if (k === 'phase') tone(300, t, 0.6, 'triangle', 0.15, 1200);
  if (k === 'clear') [0, 4, 7, 12].forEach((n, i) => tone(523 * Math.pow(2, n / 12), t + i * 0.12, 0.5, 'triangle', 0.13));
}
function curIntensity() {
  if (!S.ph || S.s !== 'play') return 0.2;
  return (S.ph.dur - S.ph.t) < 5 ? 1 : 0.3;
}
function scheduleMusic() {
  if (!AC || !musicOn || !S.st) { if (AC) nextT = AC.currentTime + 0.1; return; }
  const bpm = S.st.bpm + S.pi * 6 + (curIntensity() > 0.5 ? 16 : 0);
  const beat = 60 / bpm / 2;
  while (nextT < AC.currentTime + 0.15) {
    const sc = S.st.scale, deg = sc[mstep % sc.length];
    const f = S.st.root * Math.pow(2, deg / 12);
    tone(f, nextT, beat * 0.9, 'square', 0.035 + 0.02 * curIntensity());
    if (mstep % 8 === 0) tone(S.st.root / 2, nextT, beat * 4, 'triangle', 0.12);
    if (curIntensity() > 0.5 && mstep % 2 === 0) tone(f * 2, nextT, beat * 0.4, 'triangle', 0.03);
    nextT += beat; mstep++;
  }
}

// ---------- パターン補助 ----------
function E(key, iv, fn) {
  const tm = S.ph.tm;
  if (tm[key] === undefined) tm[key] = iv;
  tm[key] += S.dt;
  if (tm[key] >= iv) { tm[key] -= iv; fn(); }
}
function tele(d, fn) { S.q.push({ at: S.ph.t + d, fn }); S.boss.charge = d; }
function B(x, y, ang, sp, o) {
  o = o || {};
  if (S.bl.length >= MAXB) return;
  const s = sp * S.d.spd;
  S.bl.push({ x, y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, r: o.r || 3, hom: o.hom || 0,
    life: o.life || 30, age: 0, bounce: o.bounce || 0, turnAt: o.turnAt || 0, turnTo: o.turnTo || 0,
    g: false, sc: kindSpr() });
}
function ring(x, y, n, sp, off, r0) {
  const m = Math.max(4, Math.round(n * S.d.den));
  for (let i = 0; i < m; i++) {
    const a = off + i * Math.PI * 2 / m;
    B(x + Math.cos(a) * (r0 || 0), y + Math.sin(a) * (r0 || 0), a, sp);
  }
}
function aimAt(x, y, spread, n, sp) {
  const base = Math.atan2(S.y - y, S.x - x);
  for (let i = 0; i < n; i++) B(x, y, base + (i - (n - 1) / 2) * spread, sp);
}
function wall(y, gcFn, gw, sp) {
  const gc = gcFn();
  for (let x = 8; x < W; x += 15) if (Math.abs(x - gc) > gw / 2) B(x, y, Math.PI / 2, sp);
}
function laser(x, y, a, om, len, warn, life) { S.lz.push({ x, y, a, om, len, warn, life, t: 0 }); }
function B3(wx, wy, wz, vz, r) { if (S.b3.length < MAXB) S.b3.push({ wx, wy, wz, vz, r, g: false, sc: kindSpr() }); }
function burst(x, y, n, col, sp) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = sp * (0.3 + Math.random());
    S.PT.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.6, max: 1.2, c: col });
  }
  if (S.PT.length > 900) S.PT.splice(0, S.PT.length - 900);
}

// ---------- 各フェーズの弾幕 ----------
// Stage 1：両馬二郎 ─ ✝ の螺旋 / 電線の壁 / 降りてきた本質
function pS1a() {
  const b = S.boss;
  E('sp', 0.2, () => { S.arm = (S.arm || 0) + 0.33; B(b.x, b.y, S.arm, 66); B(b.x, b.y, S.arm + Math.PI, 66); });
  E('ring', 4.2, () => tele(0.7, () => ring(S.boss.x, S.boss.y, 22, 58, S.ph.t * 0.13)));
}
function pS1b() {
  const b = S.boss;
  const gc = () => W / 2 + Math.sin(S.ph.t * 1.3) * 130;
  E('wall', 2.2, () => tele(0.6, () => wall(S.boss.y + 40, gc, S.d.gap, 55)));
  E('aim', 1.6, () => aimAt(b.x, b.y, 0.22, 3, 95));
}
function pS1c() {
  const b = S.boss;
  E('hom', 1.3, () => { for (let i = -1; i <= 1; i++) B(b.x, b.y, Math.PI / 2 + i * 0.5, 62, { hom: 1.2, life: 4.5 }); });
  E('bounce', 6, () => tele(0.7, () => { for (let i = 0; i < 6; i++) B(10, 220 + i * 18, 0, 58, { bounce: 2, life: 12 }); }));
}

// Stage 2：数理零 ─ 素数の波 / 対称の証明 / 零の計算式
const PRIMES = [5, 7, 11, 13];
function pS2a() {
  const b = S.boss;
  E('ring', 1.5, () => ring(b.x, b.y, PRIMES[Math.floor(S.ph.t / 1.5) % 4] * 2, 64, S.ph.t));
  E('laser', 6, () => tele(1.0, () => laser(S.boss.x, S.boss.y, 0.2 + Math.random() * 2.7, 0.5, 460, 1.1, 3.2)));
}
function pS2b() {
  const b = S.boss;
  E('mir', 0.9, () => { const a = S.ph.t * 0.9; for (let k = 0; k < 4; k++) B(b.x, b.y, a + k * Math.PI / 2, 74, { bounce: 2, life: 14 }); });
  E('safe', 3, () => tele(0.6, () => ring(S.boss.x, S.boss.y, 20, 70, S.ph.t, 60)));
}
function pS2c() {
  const b = S.boss;
  const gw = () => 40 + 80 * (0.5 + 0.5 * Math.sin(S.ph.t * 2.6));
  const gc = () => W / 2 + Math.sin(S.ph.t * 0.8) * 100;
  E('wall', 3, () => tele(0.6, () => wall(S.boss.y + 30, gc, gw(), 50)));
  E('fan', 1.2, () => {
    const base = Math.atan2(S.y - b.y, S.x - b.x);
    for (let i = -2; i <= 2; i++) {
      B(b.x, b.y, base + i * 0.25, 80, { turnAt: 0.7, turnTo: base + (i > 0 ? 1.4 : -1.4) + i * 0.1, life: 8 });
    }
  });
}

// Stage 3：寺地星 ─ 地形図 / 等高線 / 非公開配信(3D) / 三十二人の本質
function pS3a() {
  const b = S.boss;
  E('c', 2.0, () => tele(0.6, () => ring(S.boss.x, S.boss.y, 28, 56, S.ph.t * 0.2, 50)));
  E('aim', 1.5, () => aimAt(b.x, b.y, 0.3, 3, 78));
}
function pS3b() {
  const b = S.boss;
  E('chain', 3.2, () => tele(0.5, () => {
    for (let i = 0; i < 10; i++) S.q.push({ at: S.ph.t + i * 0.09, fn: () => aimAt(S.boss.x, S.boss.y, 0, 1, 85) });
  }));
  E('wall', 4.5, () => tele(0.6, () => wall(S.boss.y + 30, () => W / 2 + Math.sin(S.ph.t * 0.7) * 120, S.d.gap + 10, 52)));
}
function pS3c() {
  // 3D：奥から来る壁。隙間の位置・幅がゆっくり変化する（開閉）
  E('wall3', 3.0, () => tele(0.5, () => {
    const gx = Math.sin(S.ph.t * 0.9) * 1.8;
    const gw = (0.6 + 0.4 * S.d.gap / 74) * (0.9 + 0.5 * Math.sin(S.ph.t * 1.7));
    for (let wx = -2.5; wx <= 2.51; wx += 0.5) {
      if (Math.abs(wx - gx) < gw) continue;
      for (let wy = 0.2; wy <= 2.5; wy += 0.55) B3(wx, wy, 22, 3.4, 0.13);
    }
  }));
}
function pS3d() {
  const b = S.boss;
  E('ring', 0.5, () => ring(b.x, b.y, 24, 38, S.ph.t * 0.5));
  E('spiral', 0.25, () => { S.arm2 = (S.arm2 || 0) + 0.27; B(b.x, b.y, S.arm2, 44); B(b.x, b.y, S.arm2 + Math.PI, 44); });
  E('laser', 9, () => tele(1.4, () => laser(S.boss.x, S.boss.y, Math.random() * 6.28, 0.35, 480, 1.4, 4.2)));
}

// ---------- ステージ・フェーズ制御 ----------
function totalDur() { return S.st.phases.reduce((a, p) => a + p.dur, 0); }
function remainSec() {
  let fin = 0; for (let i = 0; i < S.pi; i++) fin += S.st.phases[i].dur;
  const el = fin + (S.ph ? S.ph.t : 0);
  return Math.max(0, Math.ceil(totalDur() - el));
}
function startStage(i, fresh) {
  if (fresh) { S.d = DIFF[M.diff]; S.score = 0; }
  S.scene = 'game'; S.si = i; S.st = STAGES[i]; S.pi = 0; S.ph = null;
  S.lives = S.d.lives; S.maxLives = S.d.lives; S.inv = 0; S.graze = 0; S.noMiss = true;
  S.bl = []; S.lz = []; S.b3 = []; S.q = []; S.PT = [];
  S.is3d = false; S.tv = 0; S.tv0 = 0; S.x = W / 2; S.y = H * 0.8;
  S.boss = { x: W / 2, y: S.st.base, base: S.st.base, amp: S.st.amp, shake: 0, charge: 0, img: 0, dis: false };
  S.s = 'intro'; S.timer = 0; S.clock = S.clock || 0; musicOn = true; mstep = 0;
  if (AC) nextT = AC.currentTime + 0.1;
}
function startPhase() {
  const def = S.st.phases[S.pi];
  S.ph = { def, t: 0, tm: {}, dur: def.dur, name: def.name };
  S.boss.img = def.img; S.q = []; S.boss.charge = 0;
  S.s = 'banner'; S.timer = 0; sfx('phase');
}
function enterMode() {
  if (S.is3d) { S.wx = 0; S.wh = 1.0; S.wz = 8; S.pzPrev = 8; S.b3 = []; }
  else { S.x = W / 2; S.y = H * 0.8; }
  S.bl = []; S.inv = Math.max(S.inv, 1.0);
}
function phaseEnd() {
  S.bl.forEach(b => { if (Math.random() < 0.15) S.PT.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.5, max: 0.5, c: S.st.col }); });
  S.bl = []; S.lz = []; S.b3 = [];
  S.pi++;
  if (S.pi < S.st.phases.length) startPhase();
  else { S.s = 'dissolve'; S.timer = 0; S.boss.dis = true; spawnBossDissolve(); musicOn = false; }
}
function spawnBossDissolve() {
  const img = portrait(S.st.imgs[S.boss.img], 230, S.st.col);
  if (!img) return;
  let data = null;
  try { data = img.getContext('2d').getImageData(0, 0, img.width, img.height).data; } catch (e) { data = null; }
  const ox = S.boss.x - img.width / 2, oy = S.boss.y - 20;
  for (let y = 0; y < img.height; y += 3) for (let x = 0; x < img.width; x += 3) {
    let col = S.st.col, a = 1;
    if (data) { const i = (y * img.width + x) * 4; if (data[i + 3] < 60) continue; col = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`; }
    const p = { x: ox + x, y: oy + y, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 60, life: 1.6 + Math.random() * 0.9, max: 2.5, c: col };
    S.PT.push(p);
  }
  if (S.PT.length > 1400) S.PT.splice(0, S.PT.length - 1400);
}

function takeHit() {
  S.lives--; S.noMiss = false; sfx('hit');
  burst(S.is3d ? W / 2 : S.x, S.is3d ? H * 0.8 : S.y, 40, '#fff', 180);
  S.bl.forEach(b => { if (Math.random() < 0.3) S.PT.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.6, max: 0.6, c: S.st.col }); });
  S.bl = []; S.lz = []; S.b3 = [];
  S.shake = 0.35;
  if (S.lives <= 0) { S.s = 'over'; musicOn = false; return; }
  S.inv = S.d.inv;
  if (S.is3d) { S.wx = 0; S.wz = 8; S.wh = 1.0; } else { S.x = W / 2; S.y = H * 0.8; }
}

function updateBullets(dt) {
  for (const b of S.bl) {
    b.age += dt;
    if (b.hom > 0) {
      const want = Math.atan2(S.y - b.y, S.x - b.x);
      let cur = Math.atan2(b.vy, b.vx);
      const diff = wrap(want - cur), mx = b.hom * S.d.hom * dt;
      cur += clamp(diff, -mx, mx);
      const sp = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(cur) * sp; b.vy = Math.sin(cur) * sp;
    }
    if (b.turnAt && b.age >= b.turnAt) {
      b.turnAt = 0; const sp = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(b.turnTo) * sp; b.vy = Math.sin(b.turnTo) * sp;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.bounce > 0 && ((b.x < 4 && b.vx < 0) || (b.x > W - 4 && b.vx > 0))) { b.vx = -b.vx; b.bounce--; b.x = clamp(b.x, 4, W - 4); }
  }
  S.bl = S.bl.filter(b => b.age < b.life && b.y > -40 && b.y < H + 40 && b.x > -40 && b.x < W + 40);
  for (const L of S.lz) { L.t += dt; L.a += L.om * dt; }
  S.lz = S.lz.filter(L => L.t < L.warn + L.life);
}
function updateB3(dt) {
  for (const b of S.b3) b.wz -= b.vz * dt * S.d.spd;
  S.b3 = S.b3.filter(b => b.wz > S.wz - CAMD - 1);
}

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}
function checkCollisions() {
  if (S.is3d) {
    // 弾が自機の奥行き面（wz = S.wz）を手前側へ跨いだ瞬間に判定する
    for (const b of S.b3) {
      const dz = b.wz - S.wz;
      const crossed = b.pdz !== undefined && b.pdz > 0 && dz <= 0;
      b.pdz = dz;
      const dx = b.wx - S.wx, dy = b.wy - S.wh, d2 = dx * dx + dy * dy;
      if (!b.g && Math.abs(dz) < 0.6 && d2 < (b.r + 0.5) * (b.r + 0.5)) {
        b.g = true;
        if (S.inv <= 0) { S.graze++; S.score += 20; sfx('graze'); S.boss.shake = 0.12; }
      }
      if (crossed && S.inv <= 0 && d2 < (b.r + 0.18) * (b.r + 0.18)) { takeHit(); return; }
    }
    return;
  }
  const px = S.x, py = S.y, pr = 2.6;
  let hit = false;
  for (const b of S.bl) {
    const dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy, rr = pr + b.r;
    if (d2 < rr * rr) { hit = true; break; }
    if (!b.g && d2 < (rr + 14) * (rr + 14)) {
      b.g = true;
      if (S.inv <= 0) { S.graze++; S.score += 20; sfx('graze'); S.boss.shake = 0.12; }
    }
  }
  if (!hit) for (const L of S.lz) {
    if (L.t < L.warn) continue;
    const ex = L.x + Math.cos(L.a) * L.len, ey = L.y + Math.sin(L.a) * L.len;
    if (segDist(px, py, L.x, L.y, ex, ey) < pr + 2.5) { hit = true; break; }
  }
  if (hit && S.inv <= 0) takeHit();
}

function update(dt) {
  S.clock += dt; S.dt = dt;
  if (S.shake > 0) S.shake -= dt;
  if (S.boss.shake > 0) S.boss.shake -= dt;
  if (S.boss.charge > 0) S.boss.charge -= dt;
  for (let i = S.PT.length - 1; i >= 0; i--) {
    const p = S.PT[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0) S.PT.splice(i, 1);
  }
  if (!S.st) return;
  switch (S.s) {
    case 'intro':
      S.timer += dt; if (S.timer > 2.6) startPhase(); break;
    case 'banner':
      S.timer += dt;
      if (S.timer > 1.6) {
        S.timer = 0;
        if (!!S.ph.def.mode3d !== S.is3d) { S.tv0 = S.tv; S.s = 'tilt'; S.bl = []; }
        else S.s = 'play';
      }
      break;
    case 'tilt': {
      S.timer += dt;
      const k = Math.min(1, S.timer / 1.2), to = S.ph.def.mode3d ? 1 : 0;
      S.tv = S.tv0 + (to - S.tv0) * k;
      if (k >= 1) { S.is3d = !!S.ph.def.mode3d; S.tv = to; enterMode(); S.s = 'play'; S.timer = 0; }
      break;
    }
    case 'play': {
      S.ph.t += dt;
      if (S.inv > 0) S.inv -= dt;
      S.score += dt * 5;
      // 入力
      let ax = 0, ay = 0;
      if (keys.ArrowLeft || keys.KeyA) ax -= 1;
      if (keys.ArrowRight || keys.KeyD) ax += 1;
      if (keys.ArrowUp || keys.KeyW) ay -= 1;
      if (keys.ArrowDown || keys.KeyS) ay += 1;
      const focus = keys.ShiftLeft || keys.ShiftRight;
      if (S.is3d) {
        S.pzPrev = S.wz;
        S.wx = clamp(S.wx + ax * 2.4 * dt * (focus ? 0.5 : 1), -2.6, 2.6);
        S.wz = clamp(S.wz - ay * 4.2 * dt * (focus ? 0.5 : 1), 4, 16);
        if (S.drag && S.tgt) {
          S.wx = clamp((S.tgt.x - W / 2) / 85, -2.6, 2.6);
          S.wz = clamp(4 + (H - S.tgt.y) / H * 12, 4, 16);
        }
      } else {
        const sp = focus ? 110 : 230;
        S.x = clamp(S.x + ax * sp * dt, 12, W - 12);
        S.y = clamp(S.y + ay * sp * dt, 40, H - 30);
        if (S.drag && S.tgt) {
          const dx = S.tgt.x - S.x, dy = S.tgt.y - S.y, m = Math.hypot(dx, dy) || 1, st = Math.min(m, 340 * dt);
          S.x += dx / m * st; S.y += dy / m * st;
        }
      }
      // 弾幕
      const b = S.boss;
      if (!S.is3d) { b.x = W / 2 + Math.sin(S.ph.t * 0.55) * S.st.amp * (S.ph.def.name.includes('壁') ? 1.3 : 1); b.y = b.base + Math.sin(S.ph.t * 0.9) * 10; }
      S.ph.def.run();
      for (let i = S.q.length - 1; i >= 0; i--) if (S.ph.t >= S.q[i].at) { const f = S.q[i].fn; S.q.splice(i, 1); f(); }
      if (S.is3d) updateB3(dt); else updateBullets(dt);
      if (!S.is3d) S.pzPrev = S.wz;
      if (S.inv > 0) S.inv = Math.max(0, S.inv);
      checkCollisions();
      if (S.s !== 'play') break;
      if (S.ph.t >= S.ph.dur) phaseEnd();
      break;
    }
    case 'dissolve':
      S.timer += dt;
      if (S.timer > 2.4) { S.s = 'result'; S.timer = 0; sfx('clear'); saveHS(); }
      break;
    default: break;
  }
}

function saveHS() {
  try {
    const k = 'hs_' + S.d.name + '_' + S.si; const best = Math.max(+localStorage.getItem(k) || 0, Math.floor(S.score));
    localStorage.setItem(k, best);
  } catch (e) { /* localStorage 不可なら無視 */ }
}
function hs(i, d) { try { return +localStorage.getItem('hs_' + DIFF[d].name + '_' + i) || 0; } catch (e) { return 0; } }

function nextStage() {
  if (S.si + 1 < STAGES.length) startStage(S.si + 1, false);
  else { S.s = 'allclear'; musicOn = false; }
}
function toTitle() { S.scene = 'title'; S.s = 'title'; musicOn = false; }

// ---------- 描画 ----------
function drawBG() {
  const t = S.clock, st = S.st || STAGES[M.stage];
  if (st.bg === 's1') {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1f1607'); gr.addColorStop(1, '#060403');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,200,90,.10)'; g.lineWidth = 2; g.beginPath();
    for (let i = -2; i < 9; i++) { const x = i * 70 + ((t * 18) % 70); g.moveTo(x, 0); g.lineTo(x + 40, H); }
    g.stroke();
  } else if (st.bg === 's2') {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#031a26'); gr.addColorStop(1, '#00060b');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(143,240,255,.10)'; g.lineWidth = 1; g.beginPath();
    for (let y = (t * 40) % 40; y < H; y += 40) { g.moveTo(0, y); g.lineTo(W, y); }
    for (let x = 0; x <= W; x += 40) { g.moveTo(x, 0); g.lineTo(x, H); }
    g.stroke();
  } else {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#071433'); gr.addColorStop(1, '#00020a');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(127,214,255,.13)'; g.lineWidth = 1;
    for (let k = 0; k < 14; k++) {
      g.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const y = ((k * 48 + t * 14) % 672) - 40 + Math.sin(x * 0.015 + t * 0.25 + k * 0.5) * 14;
        x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
  }
}

function drawBoss2D() {
  const b = S.boss; if (b.dis) return;
  const st = S.st;
  const img = portrait(st.imgs[b.img], 230, st.col); if (!img) return;
  const cx = b.x + (b.shake > 0 ? (Math.random() - 0.5) * 6 : 0);
  const pulse = b.charge > 0 ? 0.5 + 0.5 * Math.sin(S.clock * 18) : 0;
  const gl = g.createRadialGradient(cx, b.y + 100, 10, cx, b.y + 100, 170);
  gl.addColorStop(0, hexA(st.col, 0.25 + 0.35 * pulse)); gl.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gl; g.fillRect(cx - 180, b.y - 80, 360, 360);
  if (b.charge > 0) {
    g.strokeStyle = hexA(st.col, 0.6); g.lineWidth = 2; g.beginPath();
    g.arc(cx, b.y + 100, 60 + (1 - b.charge / 0.7 > 0 ? 0 : 0) + 30 * pulse, 0, 6.283); g.stroke();
  }
  g.drawImage(img, cx - img.width / 2, b.y - 20);
}

function drawLasers() {
  for (const L of S.lz) {
    const ex = L.x + Math.cos(L.a) * L.len, ey = L.y + Math.sin(L.a) * L.len;
    if (L.t < L.warn) {
      g.setLineDash([6, 6]); g.strokeStyle = hexA(S.st.col, 0.5); g.lineWidth = 1;
      g.beginPath(); g.moveTo(L.x, L.y); g.lineTo(ex, ey); g.stroke(); g.setLineDash([]);
    } else {
      g.strokeStyle = hexA(S.st.col, 0.35); g.lineWidth = 14;
      g.beginPath(); g.moveTo(L.x, L.y); g.lineTo(ex, ey); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(L.x, L.y); g.lineTo(ex, ey); g.stroke();
    }
  }
}

function drawPlayer2D() {
  if (S.inv > 0 && Math.floor(S.clock * 14) % 2 === 0) return;
  const x = S.x, y = S.y;
  g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(x, y, 9, 0, 6.283); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 2.6, 0, 6.283); g.fill();
  g.strokeStyle = hexA(S.st.col, 0.9); g.lineWidth = 1; g.beginPath(); g.arc(x, y, 5, 0, 6.283); g.stroke();
}

function draw2D() {
  drawBoss2D();
  drawLasers();
  for (const b of S.bl) g.drawImage(b.sc, b.x - 12, b.y - 12);
  drawPlayer2D();
}

// 擬似3D：カメラは自機の後方。自機の深さ（wz）が進むと、床の等高線が手前へ流れる
function pj(wx, wy, wz) {
  const cz = S.wz - CAMD, cx = S.wx * 0.5;
  const dz = wz - cz; if (dz < 0.15) return null;
  const k = F3 / dz;
  return [W / 2 + (wx - cx) * k, HOR + (CAMY - wy) * k, k];
}
function draw3D() {
  const cz = S.wz - CAMD;
  g.strokeStyle = hexA(S.st.col, 0.22); g.lineWidth = 1;
  g.beginPath();
  for (let z = Math.ceil(cz + 0.5); z < cz + 26; z += 1) {
    const a = pj(-14, 0, z), c = pj(14, 0, z); if (a && c) { g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); }
  }
  for (let xw = -14; xw <= 14; xw += 2) {
    const a = pj(xw, 0, cz + 0.3), c = pj(xw, 0, cz + 26); if (a && c) { g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); }
  }
  g.stroke();
  // 遠景のボス（ビルボード）
  const bp = pj(0, 2.6, 22);
  const img = portrait(S.st.imgs[S.boss.img], 230, S.st.col);
  if (bp && img && !S.boss.dis) {
    const hpx = 2.6 * bp[2], dw = img.width * hpx / img.height;
    g.drawImage(img, bp[0] - dw / 2, bp[1] - hpx / 2, dw, hpx);
  }
  // 弾（奥→手前）
  const sorted = S.b3.slice().sort((a, b) => b.wz - a.wz);
  for (const b of sorted) {
    const p = pj(b.wx, b.wy, b.wz); if (!p) continue;
    const size = Math.max(4, b.r * p[2] * 2.4);
    g.drawImage(b.sc, p[0] - size / 2, p[1] - size / 2, size, size);
  }
  // 自機とその影
  const sh = pj(S.wx, 0, S.wz), me = pj(S.wx, S.wh, S.wz);
  if (sh) { g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(sh[0], sh[1], 14, 5, 0, 0, 6.283); g.fill(); }
  if (me && !(S.inv > 0 && Math.floor(S.clock * 14) % 2 === 0)) {
    g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.arc(me[0], me[1], 10, 0, 6.283); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(me[0], me[1], 2.8, 0, 6.283); g.fill();
    g.strokeStyle = hexA(S.st.col, 0.9); g.beginPath(); g.arc(me[0], me[1], 6, 0, 6.283); g.stroke();
  }
}

function drawParticles() {
  for (const p of S.PT) {
    g.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
    g.fillStyle = p.c; g.fillRect(p.x - 1, p.y - 1, 2, 2);
  }
  g.globalAlpha = 1;
}

function drawHUD() {
  const st = S.st;
  g.textBaseline = 'top'; g.textAlign = 'left';
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, 230, 62);
  g.fillStyle = st.col; g.font = 'bold 12px "Noto Sans JP",sans-serif';
  g.fillText(`${st.tag}  ${st.name}`, 8, 6);
  g.fillStyle = '#ddd'; g.font = '12px monospace';
  g.fillText(`SCORE ${Math.floor(S.score).toString().padStart(7, '0')}  GRAZE ${S.graze}`, 8, 24);
  for (let i = 0; i < S.maxLives; i++) {
    g.fillStyle = i < S.lives ? st.col : 'rgba(255,255,255,.18)';
    g.beginPath(); g.moveTo(12 + i * 18, 46); g.lineTo(20 + i * 18, 40); g.lineTo(28 + i * 18, 46); g.lineTo(20 + i * 18, 54); g.closePath(); g.fill();
  }
  g.fillStyle = '#aaa'; g.font = '11px monospace';
  g.fillText(S.d.name, 120, 42);
  // 残り秒数（右上・大きく）
  const rem = remainSec(), tot = totalDur();
  g.textAlign = 'right';
  const blink = rem <= 5 && Math.floor(S.clock * 4) % 2 === 0;
  g.fillStyle = blink ? '#ff6666' : '#fff';
  g.font = 'bold 40px monospace';
  g.fillText(String(rem).padStart(2, '0'), W - 12, 4);
  g.fillStyle = '#aaa'; g.font = '11px sans-serif';
  g.fillText('残り秒', W - 12, 46);
  let fin = 0; for (let i = 0; i < S.pi; i++) fin += st.phases[i].dur;
  const prog = S.ph ? (fin + S.ph.t) / tot : 0;
  g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(W - 170, 66, 158, 4);
  g.fillStyle = st.col; g.fillRect(W - 170, 66, 158 * clamp(prog, 0, 1), 4);
  if (S.ph) {
    g.fillStyle = '#ccc'; g.font = '11px sans-serif'; g.textAlign = 'right';
    g.fillText(`P${S.pi + 1}/${st.phases.length}  ${S.ph.name}${S.ph.def.mode3d ? '  [3D]' : ''}`, W - 12, 74);
  }
  g.textAlign = 'left';
}

function centerText(t, y, size, col, sub) {
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${size}px "Noto Sans JP","Yu Gothic",sans-serif`;
  g.shadowColor = col; g.shadowBlur = 16; g.fillStyle = col; g.fillText(t, W / 2, y);
  g.shadowBlur = 0;
  if (sub) { g.font = '13px "Noto Sans JP",sans-serif'; g.fillStyle = '#eee'; g.fillText(sub, W / 2, y + size * 0.9); }
  g.textAlign = 'left'; g.textBaseline = 'top';
}

function drawOverlays() {
  const st = S.st;
  if (S.s === 'intro') {
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 230, W, 260);
    centerText(st.tag, 290, 18, st.col);
    centerText(st.name, 335, 28, '#fff');
    centerText(st.intro, 395, 16, '#eee', st.introFrom);
  }
  if (S.s === 'banner') {
    const a = Math.min(1, S.timer * 4);
    g.globalAlpha = a; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 300, W, 130);
    centerText(`PHASE ${S.pi + 1}  ${S.ph.name}`, 340, 30, st.col, S.ph.def.sub);
    g.globalAlpha = 1;
  }
  if (S.s === 'tilt') {
    const k = S.timer / 1.2;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, W, H);
    g.fillStyle = hexA(st.col, 0.5); g.fillRect(0, 360 - 2, W * Math.min(1, k * 1.2), 4);
    centerText(S.ph.def.mode3d ? '視点転換' : '視点復帰', 330, 20, st.col);
  }
  if (S.s === 'pause') {
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, W, H);
    centerText('PAUSE', 320, 34, '#fff', 'Esc: 再開 ／ T: タイトル');
  }
  if (S.s === 'over') {
    g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(0, 0, W, H);
    centerText('耐久失敗', 300, 34, '#ff7a7a', `Enter: リトライ ／ Esc: タイトル　（SCORE ${Math.floor(S.score)}）`);
  }
  if (S.s === 'result') {
    g.fillStyle = 'rgba(0,0,0,.72)'; g.fillRect(0, 0, W, H);
    const cut = portrait(S.st.cut, 420);
    if (cut) g.drawImage(cut, W - cut.width - 6, H - cut.height - 40);
    centerText('STAGE CLEAR', 220, 40, st.col);
    g.textAlign = 'left'; g.font = '15px "Noto Sans JP",sans-serif'; g.fillStyle = '#eee';
    const lines = [
      `残機 ${S.lives} / ${S.maxLives}`,
      `ノーミス ${S.noMiss ? 'はい' : 'いいえ'}`,
      `グレイズ ${S.graze}`,
      `SCORE ${Math.floor(S.score)}`,
      `ハイスコア ${hs(S.si, M.diff)}`,
    ];
    lines.forEach((l, i) => g.fillText(l, 40, 300 + i * 26));
    g.fillStyle = '#ffd'; g.font = '13px "Noto Sans JP",sans-serif';
    g.fillText(S.si + 1 < STAGES.length ? 'Enter: 次のステージへ' : 'Enter: 最終結果へ', 40, 470);
  }
  if (S.s === 'allclear') {
    g.fillStyle = 'rgba(0,0,0,.8)'; g.fillRect(0, 0, W, H);
    const cut = portrait('sakura_05_egao', 440);
    if (cut) g.drawImage(cut, W - cut.width - 4, H - cut.height - 30);
    centerText('ALL CLEAR', 240, 40, '#fff', `SCORE ${Math.floor(S.score)}  /  ${S.d.name}`);
    g.font = '13px "Noto Sans JP",sans-serif'; g.fillStyle = '#ddd'; g.textAlign = 'left';
    g.fillText('耐久、完了。', 40, 320);
    g.fillText('Enter: タイトルへ', 40, 350);
  }
}

function drawGame() {
  drawBG();
  const tv = S.tv;
  if (tv < 1 && !S.is3d) {
    g.globalAlpha = 1 - tv; draw2D(); g.globalAlpha = 1;
  }
  if (tv > 0) {
    g.globalAlpha = tv; draw3D(); g.globalAlpha = 1;
  }
  drawParticles();
  if (S.s !== 'intro' && S.s !== 'result' && S.s !== 'allclear' && S.s !== 'over') drawHUD();
  drawOverlays();
}

function drawTitle() {
  drawBG.call(null);
  const st = STAGES[M.stage];
  g.textAlign = 'center';
  centerText('✝本質✝ 耐久弾幕', 110, 40, '#fff', '避け続けて、ステージを耐え抜く');
  g.textBaseline = 'top';
  const rows = [
    `DIFFICULTY   < ${DIFF[M.diff].name} >`,
    `STAGE        < ${M.stage + 1}  ${st.bossName} >`,
    'START',
  ];
  rows.forEach((t, i) => {
    g.font = 'bold 20px "Noto Sans JP",monospace'; g.textAlign = 'center';
    g.fillStyle = i === M.sel ? '#ffd45c' : '#999';
    g.fillText((i === M.sel ? '▶ ' : '   ') + t, W / 2, 330 + i * 42);
  });
  g.font = '12px "Noto Sans JP",sans-serif'; g.fillStyle = '#aab'; g.textAlign = 'center';
  g.fillText(`ハイスコア（${DIFF[M.diff].name} / ${st.tag}）: ${hs(M.stage, M.diff)}`, W / 2, 470);
  g.fillText('移動: 矢印 / WASD ・ 低速: Shift ・ ポーズ: Esc ・ 全画面: F', W / 2, 500);
  g.fillText('タッチ・マウス: ドラッグで移動', W / 2, 520);
  g.fillText('攻撃はありません。弾を避けて、残り秒数の終わりまで耐えてください。', W / 2, 560);
  g.fillStyle = '#667'; g.font = '11px "Noto Sans JP",sans-serif';
  g.fillText('原作小説・立ち絵の出典はREADMEを参照（非公式ファン制作）', W / 2, 690);
  g.textAlign = 'left';
  // 立ち絵の小さな登場
  const im = portrait('mie_01_reishou', 200, '#ffffff');
  if (im) g.drawImage(im, 16, H - 220, im.width * 200 / im.height * 0.9, 200 * 0.9);
  const cs = portrait(st.imgs[0], 200, st.col);
  if (cs) g.drawImage(cs, W - cs.width - 10, H - 230, cs.width, cs.height);
}

function render() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  if (S.shake > 0 && S.scene === 'game') g.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * 8 * S.shake, (Math.random() - 0.5) * 4 * S.shake);
  if (S.scene === 'title' || !S.st) drawTitle();
  else drawGame();
  g.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------- 入力 ----------
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  onKey(e.code);
});
addEventListener('keyup', e => { keys[e.code] = false; });
function toggleFS() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  else document.exitFullscreen && document.exitFullscreen();
}
function onKey(c) {
  audioInit();
  if (c === 'KeyF') { toggleFS(); return; }
  if (S.scene === 'title' || !S.st) {
    if (c === 'ArrowUp' || c === 'KeyW') M.sel = (M.sel + 2) % 3;
    if (c === 'ArrowDown' || c === 'KeyS') M.sel = (M.sel + 1) % 3;
    if (c === 'ArrowLeft' || c === 'KeyA') { if (M.sel === 0) M.diff = (M.diff + 2) % 3; if (M.sel === 1) M.stage = (M.stage + 2) % 3; }
    if (c === 'ArrowRight' || c === 'KeyD') { if (M.sel === 0) M.diff = (M.diff + 1) % 3; if (M.sel === 1) M.stage = (M.stage + 1) % 3; }
    if (c === 'Enter' || c === 'Space') { if (M.sel === 2) { audioInit(); startStage(M.stage, true); } else M.sel = 2; }
    return;
  }
  if (c === 'Escape') {
    if (S.s === 'pause') S.s = S.pausedFrom;
    else if (['play', 'banner', 'tilt', 'intro'].includes(S.s)) { S.pausedFrom = S.s; S.s = 'pause'; }
    else if (['over', 'result', 'allclear'].includes(S.s)) toTitle();
    return;
  }
  if (c === 'KeyT' && S.s === 'pause') { toTitle(); return; }
  if (c === 'Enter' || c === 'Space' || c === 'KeyZ') {
    if (S.s === 'result') nextStage();
    else if (S.s === 'over') startStage(S.si, false);
    else if (S.s === 'allclear') toTitle();
    else if (S.s === 'pause') S.s = S.pausedFrom;
    else if (S.s === 'intro') startPhase();
  }
}
function toLogical(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}
cv.addEventListener('pointerdown', e => {
  audioInit();
  if (S.scene === 'title') { onKey('Enter'); return; }
  if (['result', 'over', 'allclear'].includes(S.s)) { onKey('Enter'); return; }
  S.drag = true; S.tgt = toLogical(e);
});
cv.addEventListener('pointermove', e => { if (S.drag) S.tgt = toLogical(e); });
addEventListener('pointerup', () => { S.drag = false; S.tgt = null; });
const fsBtn = document.getElementById('fs');
if (fsBtn) fsBtn.addEventListener('click', toggleFS);

// ---------- 起動 ----------
Promise.all(PORTRAIT_FILES.map(n => loadImg(P(n)).then(im => { IMGS[P(n)] = im; }))).then(() => {
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    if (S.s !== 'pause') update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});

// テスト用フック（ブラウザ・Node検証で使用）
if (typeof window !== 'undefined' && window.__DM_TEST) {
  window.__DM = { S, M, STAGES, DIFF, update, startStage, startPhase, onKey, render, keys, IMGS };
}
})();
