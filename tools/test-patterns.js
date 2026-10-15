/* =============================================================================
 * tools/test-patterns.js — 弾幕パターンの自動検証
 *
 *  検証項目:
 *   1. 例外なく 20 秒間回るか
 *   2. 座標が NaN / Infinity にならないか
 *   3. 弾速が難易度の上限を超えていないか（超高速弾の構造的排除）
 *   4. 弾数が上限内に収まるか（処理落ち防止）
 *   5. 回避 AI が生存できるか（公平性）— EASY/NORMAL は必須、HARD は参考
 * ========================================================================== */
'use strict';
const { loadGame } = require('./headless');
const { DodgerAI } = require('./dodger-ai');

const { HN } = loadGame();
HN.audio.init = () => false;   // 音は鳴らさない

const { BulletSystem, DiffHelper, DIFF_ORDER } = HN;
const W = 640, H = 480, dt = 1 / 60, DUR = 20;

function ctxFor(dif, sys, player) {
  return {
    sys, dif, player, W, H, t: 0,
    bx: W / 2, by: H * 0.28,
    ramp: HN.RAMP.navy,
    rand: () => Math.random(),
    aim: () => Math.atan2(player.y - H * 0.28, player.x - W / 2),
    sfx: () => { },
  };
}

const rows = [];
let anyFail = false;

for (const pkey of Object.keys(HN.PATTERNS)) {
  const pat = HN.PATTERNS[pkey];
  for (const dkey of DIFF_ORDER) {
    const dif = new DiffHelper(dkey);
    const sys = new BulletSystem(W, H);
    const player = { x: W / 2, y: H - 70 };
    sys.player = player;
    const ctx = ctxFor(dif, sys, player);
    const inst = pat.make(dif);
    const ai = new DodgerAI(dif);
    const speed = 285;                    // 自機の移動速度 (px/s)
    const hitR = 2.0;

    let nan = false, maxSpeed = 0, maxCount = 0, hitAt = -1, t = 0;
    let grazeTotal = 0, focusT = 0, focusN = 0;
    try {
      while (t < DUR) {
        ctx.t = t;
        inst.update(dt, ctx);
        sys.update(dt);
        // NaN 検査と速度検査
        for (const b of sys.bullets) {
          if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) { nan = true; break; }
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > maxSpeed) maxSpeed = sp;
        }
        if (nan) break;
        if (sys.count > maxCount) maxCount = sys.count;
        // 回避 AI
        const mv = ai.step(player.x, player.y, sys, dt, speed, hitR,
          { x0: 8, y0: 8, x1: W - 8, y1: H - 8 });
        // 集中モード（ゲーム本編と同じ: 292 → 132 px/s）
        const v = mv.focus ? speed * 0.45 : speed;
        focusN++; if (mv.focus) focusT += dt;
        const k = Math.min(1, v * dt / Math.max(1e-6, Math.hypot(mv.x - player.x, mv.y - player.y)));
        player.x += (mv.x - player.x) * k;
        player.y += (mv.y - player.y) * k;
        const c = sys.collide(player.x, player.y, hitR, 11, false);
        grazeTotal += c.graze;
        if (c.hit) { hitAt = t; break; }
        t += dt;
      }
    } catch (e) {
      rows.push({ pkey, dkey, err: e.message });
      anyFail = true;
      continue;
    }

    const cap = dif.speedCap + 1;
    const overSpeed = maxSpeed > cap;
    const overCount = maxCount > sys.maxBullets;
    // 判定: EASY/NORMAL は 20 秒生存が望ましい。HARD は 8 秒以上を許容。
    const needSurvive = dkey === 'HARD' ? 8 : DUR;
    const survived = hitAt < 0 || hitAt >= needSurvive;
    const bad = nan || overSpeed || overCount || !survived;
    if (bad) anyFail = true;
    rows.push({
      pkey, dkey, nan, overSpeed, overCount, survived, hitAt,
      maxSpeed: Math.round(maxSpeed), cap, maxCount, graze: grazeTotal, bad,
      focus: focusN ? focusT / (focusN * dt) : 0,
      detail: `${pat.jp}`,
    });
  }
}

/* ------------------------------------------------------------- 出力 ------ */
console.log('パターン検証: 各20秒 / 回避AIによる生存確認');
console.log('パターン'.padEnd(20) + '難易度'.padEnd(8) + '最大弾速'.padEnd(10) + '上限'.padEnd(7) +
  '最大弾数'.padEnd(10) + '被弾(s)'.padEnd(10) + '判定');
console.log('-'.repeat(84));
for (const r of rows) {
  if (r.err) { console.log(`${r.pkey.padEnd(20)}${r.dkey.padEnd(8)}例外: ${r.err}`); continue; }
  const hit = r.hitAt < 0 ? '生存' : r.hitAt.toFixed(2);
  console.log(
    r.pkey.padEnd(20) + r.dkey.padEnd(8) +
    String(r.maxSpeed).padEnd(10) + String(r.cap).padEnd(7) +
    String(r.maxCount).padEnd(10) + hit.padEnd(10) +
    (r.bad ? 'NG' : 'OK') + (r.nan ? ' NaN!' : '') + (r.overSpeed ? ' SPEED!' : '') + (r.overCount ? ' COUNT!' : '')
  );
}

const ng = rows.filter(r => r.bad);
console.log('-'.repeat(84));
console.log(`合計 ${rows.length} 件 / NG ${ng.length} 件`);
if (ng.length) {
  console.log('\nNG 一覧:');
  for (const r of ng) console.log(`  ${r.pkey} [${r.dkey}] ${r.detail} hitAt=${r.hitAt.toFixed(2)} maxSpeed=${r.maxSpeed} maxBullets=${r.maxCount}`);
}
process.exit(anyFail ? 1 : 0);
