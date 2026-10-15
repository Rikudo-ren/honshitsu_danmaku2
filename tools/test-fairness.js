/* =============================================================================
 * tools/test-fairness.js — 公平性の不変条件を直接叩く検証
 *
 *  通し検証（tools/playthrough.js）は「実際に遊べるか」を見るが、
 *  ボスの最小距離のような**レアケース**は、回避 AI の偶然の立ち回りに
 *  依存してしまい、再現性が低い。
 *
 *  ここではボスと自機だけを抜き出し、自機を**意地悪な動き**で動かして
 *  不変条件を狙い撃ちで検査する。
 *
 *  検査する不変条件:
 *    「自機が画面下半分（y > H*0.50）に居るとき、
 *      ボスは中心間距離 140px を下回らない（猶予 0.6 秒のあとから判定）」
 *
 *  自機の動かし方（それぞれ 4 章 × 全フェーズの動きで実行）:
 *    ① 停止        … 画面内の格子点に立ち止まる
 *    ② 突っ込む    … ボスへ一直線に近づく
 *    ③ 壁沿い      … 画面端を這う（可動域の外側＝最も条件が悪い）
 *    ④ 上下          … 境界 y=H*0.50 を跨いで往復する
 *    ⑤ ランダム      … 乱数で歩き回る
 *
 *  使い方: node tools/test-fairness.js [--verbose]
 * ========================================================================== */
'use strict';
const path = require('path');
const { loadGame } = require('./headless.js');

const VERBOSE = process.argv.includes('--verbose');
const { HN } = loadGame({});

const W = 640, H = 480;
const MIN_D = 140;
const EPS = 1;             // 許容誤差[px]
const GRACE = 0.6;         // 猶予[秒]
const DT = 1 / 60;

const failures = [];
let cases = 0;

/* 自機の動かし方 */
const MOVES = {
  '停止': (p, t, rng) => { },
  '突っ込む': (p, t, rng, boss) => {
    const a = Math.atan2(boss.y - p.y, boss.x - p.x);
    p.x += Math.cos(a) * 3.1; p.y += Math.sin(a) * 3.1;
  },
  '壁沿い': (p, t, rng) => {
    // 画面の縁を **連続的に** 這う。自機は瞬間移動できないので、
    // ここでも 1 フレームの移動量を自機の速度（約 4px）以内に収める。
    // 最も条件が悪いのは「可動域の外側・かつ対象域の下端付近」に居るとき。
    const R = 3.4;
    const edge = Math.floor(t / 4) % 4;
    const tx = [W - 8, W - 8, 8, 8][edge];
    const ty = [H * 0.52, H - 8, H - 8, H * 0.52][edge];
    const dx = tx - p.x, dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.001) { p.x += (dx / d) * Math.min(R, d); p.y += (dy / d) * Math.min(R, d); }
  },
  '上下': (p, t) => {
    // 境界 y = H*0.50 を跨いで往復する（対象域の出入りを繰り返す）
    p.y = H * 0.50 + Math.sin(t * 1.7) * H * 0.10;
  },
  'ランダム': (p, t, rng) => {
    p.x += (rng() - 0.5) * 6;
    p.y += (rng() - 0.5) * 6;
  },
};

function clampPlayer(p) {
  p.x = Math.max(8, Math.min(W - 8, p.x));
  p.y = Math.max(8, Math.min(H - 10, p.y));
}

/* 章 × フェーズ × 動き の組み合わせで検査 */
for (const st of HN.STAGES) {
  for (const ph of st.phases) {
    for (const [mname, move] of Object.entries(MOVES)) {
      // 同一条件で 3 通りの初期配置を試す
      for (const seed of [1, 2, 3]) {
        const rng = HN.makeRNG ? HN.makeRNG(seed * 7919) : Math.random;
        const boss = new HN.Boss(st.boss, W, H);
        boss.homeX = W / 2;
        boss.homeY = H * (st.bossHomeY ?? 0.26);
        boss.x = boss.homeX; boss.y = boss.homeY;
        boss.setMove(ph.move || 'sway', W, H, 1.16);
        boss.setPose('idle');
        boss.pose = 'idle';
        boss.alpha = 1; boss.scale = 1;

        const player = { x: 120 + seed * 130, y: H * 0.6 + seed * 20, vx: 0, vy: 0 };
        const sys = { player, count: 0 };

        let worst = Infinity, worstT = 0;
        const T = 22;                       // 22 秒ぶん回す
        for (let i = 0, n = Math.round(T / DT); i < n; i++) {
          const t = i * DT;
          move(player, t, rng, boss);
          clampPlayer(player);
          // ボスへ渡す sys はゲーム本体と同じ形にする
          boss.update(DT, sys);
          if (player.y > H * 0.50 && boss.legalT > GRACE) {
            const d = Math.hypot(boss.x - player.x, boss.y - player.y);
            if (d < worst) { worst = d; worstT = t; }
          }
        }
        cases++;
        if (worst < MIN_D - EPS) {
          failures.push({
            stage: st.id, phase: ph.name, move: mname, seed,
            worst, worstT, legalT: boss.legalT,
          });
          if (VERBOSE) {
            console.log(`  ✗ 第${st.id}章 ${ph.name} / ${mname} / seed${seed}: `
              + `${worst.toFixed(1)}px (t=${worstT.toFixed(1)}s)`);
          }
        }
      }
    }
  }
}

console.log('公平性の不変条件を直接検査した');
console.log(`  ボスの最小距離 ${MIN_D}px（猶予 ${GRACE} 秒後から判定）`);
console.log(`  自機の動かし方 ${Object.keys(MOVES).length} 種 × 全 ${HN.STAGES.length} 章 × 全フェーズ × 3 配置`);
console.log(`  合計 ${cases} 件`);

if (failures.length) {
  console.log(`\nNG ${failures.length} 件:`);
  for (const f of failures.slice(0, 25)) {
    console.log(`  第${f.stage}章 ${f.phase} / ${f.move} / seed${f.seed}: `
      + `${f.worst.toFixed(1)}px (t=${f.worstT.toFixed(1)}s)`);
  }
  if (failures.length > 25) console.log(`  … ほか ${failures.length - 25} 件`);
  process.exit(1);
}
console.log('\nすべての条件でボスは 140px より近づかなかった');
