/* =============================================================================
 * src/game/difficulty.js — 難易度設計
 *
 *  難易度は「弾を増やす」だけでは作らない。以下を独立に調整する:
 *    弾数係数 / 弾速係数 / 発射間隔係数 / 追尾強度 / 安全地帯の広さ /
 *    ボス移動速度 / 残機 / 無敵時間 / フェーズ数 / 弾速上限
 *
 *  EASY   … 弾少なめ・遅い・余白広い。初めての弾幕でも抜けられる。
 *  NORMAL … 標準。読み合いが成立する速度と密度。
 *  HARD   … 弾多め・中速〜やや速い・余白狭い。ただし弾速上限は必ず守る。
 *
 *  弾速上限(speedCap)は「超高速弾で難易度を稼がない」ための構造的保証。
 * ========================================================================== */
'use strict';

const DIFFICULTY = {
  EASY: {
    key: 'EASY', label: 'EASY', jp: '易', sub: '弾幕に不慣れな人へ',
    color: '#7fd6a0',
    countMul: 0.66,     // 同時発射数の係数
    speedMul: 0.84,     // 弾速の係数
    intervalMul: 1.34,  // 発射間隔の係数（大きい＝ゆっくり撃つ）
    turnRateMul: 0.6,   // 追尾の強さ
    safeZoneMul: 1.42,  // 安全地帯の広さ
    bossMoveMul: 0.82,
    lives: 4,
    bombs: 3,
    invulnTime: 3.2,    // 被弾後の無敵時間（秒）
    phaseCount: 3,      // 各ステージのフェーズ数
    speedCap: 300,      // 弾速の絶対上限 (px/s)
    grazeBonus: 1.0,    // かすり点係数
    autoCollect: true,  // 弾の自動回収（アイテム処理を簡略化）
    denseFinale: 0.7,   // 最終フェーズの密度係数
  },
  NORMAL: {
    key: 'NORMAL', label: 'NORMAL', jp: '標準', sub: '弾幕ゲームの経験者へ',
    color: '#f0cf6a',
    countMul: 1.0,
    speedMul: 1.0,
    intervalMul: 1.0,
    turnRateMul: 1.0,
    safeZoneMul: 1.0,
    bossMoveMul: 1.0,
    lives: 3,
    bombs: 2,
    invulnTime: 2.6,
    phaseCount: 4,
    speedCap: 340,
    grazeBonus: 1.4,
    autoCollect: true,
    denseFinale: 1.0,
  },
  HARD: {
    key: 'HARD', label: 'HARD', jp: '難', sub: '経験者・やり込み向け',
    color: '#e05575',
    countMul: 1.42,
    speedMul: 1.18,
    intervalMul: 0.78,
    turnRateMul: 1.35,
    safeZoneMul: 0.76,
    bossMoveMul: 1.16,
    lives: 2,
    bombs: 2,
    invulnTime: 2.0,
    phaseCount: 4,
    speedCap: 372,      // ← 上限は上げるが「超高速」にはしない
    grazeBonus: 1.8,
    autoCollect: true,
    // 注: 1.28 にすると finaleDense だけ「countMul×intervalMul×1.28」の三重取りになり、
    //     HARD の最終盤が平均 8 回中 3 回しか生存できない水準まで落ちる（実測）。
    //     密度差は countMul(1.42) と intervalMul(0.78) で既に十分ついているため、
    //     ここは EASY をさらに緩めるための「減点」ノブとして使う。
    denseFinale: 1.0,
  },
};

const DIFF_ORDER = ['EASY', 'NORMAL', 'HARD'];

/** パターン側が使う係数ヘルパ */
class DiffHelper {
  constructor(key) { this.set(key); }
  set(key) { this.key = key; this.d = DIFFICULTY[key] || DIFFICULTY.NORMAL; return this; }
  get label() { return this.d.label; }
  /** 弾数（最低 1 発は保証） */
  n(base) { return Math.max(1, Math.round(base * this.d.countMul)); }
  /** 弾速 */
  v(base) { return Math.min(base * this.d.speedMul, this.d.speedCap); }
  /** 発射間隔 */
  iv(base) { return base * this.d.intervalMul; }
  /** 追尾の旋回速度 */
  turn(base) { return base * this.d.turnRateMul; }
  /** 安全地帯の半径 */
  safe(base) { return base * this.d.safeZoneMul; }
  /** ボスの移動速度 */
  bmv(base) { return base * this.d.bossMoveMul; }
  /** 最終盤の密度 */
  dense(base) { return base * this.d.denseFinale; }
  get lives() { return this.d.lives; }
  get bombs() { return this.d.bombs; }
  get invulnTime() { return this.d.invulnTime; }
  get phaseCount() { return this.d.phaseCount; }
  get speedCap() { return this.d.speedCap; }
  get grazeBonus() { return this.d.grazeBonus; }
}

window.HN = window.HN || {};
Object.assign(window.HN, { DIFFICULTY, DIFF_ORDER, DiffHelper });
