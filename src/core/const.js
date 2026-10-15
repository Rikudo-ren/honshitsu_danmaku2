/**
 * 画面・難易度・ゲームバランスの基準値。
 * すべて「ゲーム内ピクセル」単位。描画は 512x384 の低解像度バッファに対して行い、
 * それを整数倍 (または画面にフィットする倍率) で拡大する。
 */

export const VIEW_W = 512;
export const VIEW_H = 384;

/** プレイフィールド (HUD を除いた弾幕が飛ぶ領域) */
export const FIELD = {
  x: 0,
  y: 0,
  w: VIEW_W,
  h: VIEW_H,
  /** 自機が侵入できる範囲 (端に寄りすぎないように) */
  margin: 10,
};

export const FRAME_MS = 1000 / 60;
export const MAX_FRAME_DT = 1000 / 20; // これ以上空いたら 1/20 秒として扱う (タブ復帰対策)

/** 弾の総数上限。超過したら最も古い弾から消す (処理落ち防止) */
export const BULLET_CAP = 2600;
export const LASER_CAP = 64;
export const PARTICLE_CAP = 900;

/* ------------------------------------------------------------------ *
 * 難易度
 *   speed    : 弾速倍率
 *   density  : 同時発射数・発射間隔の倍率 (高いほど密)
 *   safe     : 安全地帯・隙間の広さ倍率
 *   homing   : 誘導弾の追尾強度倍率
 *   boss     : ボスの移動速度倍率
 *   lives    : 残機
 *   invuln   : 被弾後の無敵時間(秒)
 *   phaseLen : フェーズ耐久時間の倍率
 *   bomb     : 初期 ✝本質✝ ゲージ本数
 * ------------------------------------------------------------------ */
export const DIFFICULTIES = {
  EASY: {
    key: 'EASY', label: 'EASY', jp: '易', color: '#7ce0a0',
    speed: 0.80, density: 0.62, safe: 1.34, homing: 0.55,
    boss: 0.78, lives: 4, invuln: 2.6, phaseLen: 1.10, bomb: 3,
    grazeGain: 1.35, bulletLife: 0.85,
    desc: '弾は少なく遅い。隙間は広い。まず世界観を味わうための難易度。',
  },
  NORMAL: {
    key: 'NORMAL', label: 'NORMAL', jp: '常', color: '#8fc2ff',
    speed: 1.00, density: 1.00, safe: 1.00, homing: 1.00,
    boss: 1.00, lives: 3, invuln: 1.9, phaseLen: 1.00, bomb: 3,
    grazeGain: 1.00, bulletLife: 1.00,
    desc: '基準難易度。各フェーズの意図した密度とリズムで遊べる。',
  },
  HARD: {
    key: 'HARD', label: 'HARD', jp: '難', color: '#ff9d7a',
    speed: 1.15, density: 1.34, safe: 0.78, homing: 1.35,
    boss: 1.22, lives: 2, invuln: 1.45, phaseLen: 0.94, bomb: 2,
    grazeGain: 0.85, bulletLife: 1.12,
    desc: '同時発射数と発射間隔が厳しくなる。安全地帯は狭く、予告を見て動く必要がある。',
  },
};

export const DIFFICULTY_ORDER = ['EASY', 'NORMAL', 'HARD'];

/** 自機 */
export const PLAYER = {
  speed: 2.55,
  focusSpeed: 1.20,
  radius: 2.2,          // 当たり判定 (見た目より遥かに小さい)
  grazeRadius: 24,
  respawnInvuln: 1.9,
  deathPenalty: 0.0,
  startX: VIEW_W / 2,
  startY: VIEW_H - 56,
};

/** ✝本質✝ ゲージ (グレイズで貯まり、消費して弾を消す) */
export const BOMB = {
  max: 100,
  grazePer: 1.15,
  duration: 2.6,
  invuln: 3.0,
  clearRadius: 360,
  // 使用中はボスを大きく減速させる
  bossSlow: 0.35,
};

/** 色。全ステージ共通の基準パレット。 */
export const COLORS = {
  ink: '#0a0812',
  paper: '#f4f0ff',
  danger: '#ff3b6b',
  graze: '#7cf0ff',
  gold: '#ffd77a',
};
