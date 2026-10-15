/**
 * camera.js — 2D と 擬似3D を連続的にブレンドするカメラ
 *
 * t = 0 : 完全な 2D (画面上の座標がそのままゲーム座標)
 * t = 1 : 自機の後方やや上からの透視投影。奥行きがそのまま画面上方へ伸びる。
 *
 * ゲームロジックは常に 512x384 の 2D 平面上で行い、このカメラは
 * 「どう見せるか」だけを担当する。これにより 3D フェーズでも
 * 当たり判定の公平性が完全に保たれる。
 *
 * 透視パラメータ (設計値):
 *   camY    = 736   フィールド手前 (y=384) より 352 後方にカメラを置く
 *   FOCAL   = 405
 *   H       = 283   カメラ高
 *   horizon = -6    地平線は画面外 (宇宙を飛ぶ表現では空の帯が不要なため)
 *   -> フィールド y=384 で scale 1.15 / 画面 y≈320
 *      y=  0 で scale 0.55 / 画面 y≈150
 *   自機の上下移動がそのまま「奥へ進む / 手前へ戻る」として知覚される。
 */
import { VIEW_W, VIEW_H } from '../core/const.js';
import { clamp, lerp, smoothstep, TAU } from '../core/util.js';

const CAM_Y = 736;
const FOCAL = 405;
const CAM_H = 283;
const HORIZON = -6;
const WORLD_CX = VIEW_W / 2;

export class Camera {
  constructor() {
    this.mode = 'flat';        // 'flat' | 'pseudo3d'
    this.t = 0;                // 0..1 ブレンド率
    this.targetT = 0;
    this.speed = 1.6;          // t の追従速度 (1/秒)
    this.zoom = 1;             // 画面全体のズーム (ブレンド演出用)
    this.scaleMul = 1;         // 弾/自機のスプライト倍率 (弾に掛かる)
    this.roll = 0;
    this.ss = 0;               // スクリーンセーブ用の余韻
    this.fog = 0;              // 0..1 奥行きフォグ
    this.fogColor = '#050409';
    this.horizonBias = 0;
    this.orbitX = 0;           // カメラの横揺れ (演出)
    this.orbitY = 0;
    this._blend = 0;
    this.fovPump = 0;
    this.time = 0;
  }

  reset() {
    this.mode = 'flat'; this.t = 0; this.targetT = 0;
    this.zoom = 1; this.scaleMul = 1; this.roll = 0;
    this.fog = 0; this.orbitX = 0; this.orbitY = 0;
    this.fovPump = 0;
  }

  /** フェーズ開始時に呼ぶ */
  setMode(mode, { instant = false, speed = 1.6 } = {}) {
    this.mode = mode;
    this.targetT = mode === 'pseudo3d' ? 1 : 0;
    this.speed = speed;
    if (instant) this.t = this.targetT;
  }

  update(dt) {
    this.time += dt;
    const before = this.t;
    const rate = this.speed * (this.t < this.targetT ? 1 : 1.35);
    if (this.t < this.targetT) this.t = Math.min(this.targetT, this.t + rate * dt);
    else if (this.t > this.targetT) this.t = Math.max(this.targetT, this.t - rate * dt);
    this._blend = smoothstep(this.t);

    // フォグは 3D のときだけ
    this.fog = lerp(this.fog, this.targetT * 1, 1 - Math.pow(0.94, dt * 60));
    this.fovPump = Math.max(0, this.fovPump - dt * 1.8);
    this.scaleMul = lerp(this.scaleMul, 1, 1 - Math.pow(0.90, dt * 60));

    // カメラの揺らぎ (3D 中のみ)
    if (this.t > 0.02) {
      this.orbitX = Math.sin(this.time * 0.31) * 5 * this.t;
      this.orbitY = Math.sin(this.time * 0.23 + 1.7) * 3 * this.t;
    } else {
      this.orbitX = 0; this.orbitY = 0;
    }
    return before !== this.t;
  }

  get active() { return this._blend > 0.001; }
  get is3D() { return this.mode === 'pseudo3d' || this.targetT > 0.5; }

  /**
   * ワールド座標 -> 画面座標。
   * @param {number} z 平面からの高さ (3D 時のみ意味を持つ)
   * @returns {{sx:number, sy:number, scale:number, behind:boolean, f:number}}
   */
  project(x, y, z = 0) {
    if (this._blend < 0.001) {
      return { sx: x, sy: y, scale: 1, behind: false, f: 1 };
    }
    const camY = CAM_Y + this.orbitY;
    const camX = WORLD_CX + this.orbitX;
    const f = camY - y;
    if (f < 26) {
      return { sx: x, sy: y, scale: 1, behind: true, f };
    }
    const k = FOCAL / f;
    const pump = 1 + this.fovPump * 0.6;
    const sx3 = VIEW_W / 2 + (x - camX) * k * pump;
    const sy3 = HORIZON + this.horizonBias + (CAM_H - z) * k * pump;
    const sc3 = k * 3.0 * pump;      // FOCAL/CAM_Y*3 ≈ 1.65 でフィールド奥が小さく見えすぎない

    const b = this._blend;
    return {
      sx: lerp(x, sx3, b),
      sy: lerp(y, sy3, b),
      scale: lerp(1, sc3, b),
      behind: false,
      f,
    };
  }

  /** 奥行きによるフェード (遠すぎる弾を少し落として視認性を保つ) */
  depthFade(y) {
    if (this._blend < 0.001) return 1;
    const f = (CAM_Y - y) / CAM_Y;
    // 奥ほど 0.62 まで落とす。0.62 を下回らないので視認性は保たれる。
    return lerp(1, clamp(0.62 + f * 0.38, 0.62, 1), this._blend);
  }

  /** 奥行きスケール (弾のサイズ補正に使う) */
  depthScale(y) {
    if (this._blend < 0.001) return 1;
    const f = CAM_Y - y;
    if (f < 26) return 1;
    const k = clamp((FOCAL / f) * 3.0, 0.4, 2.4);
    return lerp(1, k, this._blend);
  }

  /**
   * 3D 空間の格子・トンネル背景を描くための投影ヘルパ。
   * 地平線より上の空領域も含めて描ける。
   */
  projectFree(x, y, z) {
    const camY = CAM_Y + this.orbitY;
    const camX = WORLD_CX + this.orbitX;
    const f = camY - y;
    if (f < 12) return null;
    const k = FOCAL / f;
    return {
      sx: VIEW_W / 2 + (x - camX) * k,
      sy: HORIZON + this.horizonBias + (CAM_H - z) * k,
      f,
      k,
    };
  }

  /** 画面全体を揺らす演出 */
  punch(amount) { this.scaleMul = 1 + amount; }
  pumpFov(amount) { this.fovPump = Math.max(this.fovPump, amount); }

  /** 2D に戻すときの締め演出 */
  collapse() { this.fovPump = 0.4; this.scaleMul = 1.14; }
}

export const CAM = { CAM_Y, FOCAL, CAM_H, HORIZON };
