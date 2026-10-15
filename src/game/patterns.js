/**
 * patterns.js — 弾幕パターン記述のためのランタイム
 *
 * フェーズは「アクションの配列」として宣言する:
 *
 *   { at: 0.0, every: 1.6, until: 14, do: (S) => { ... } }
 *
 *   at     : フェーズ開始からの秒数
 *   every  : 繰り返し間隔 (省略時は 1 回だけ)
 *   until  : 繰り返しの終了秒
 *   count  : 繰り返し回数の上限
 *   jitter : 発火タイミングのゆらぎ (秒)
 *   do     : 発火時に呼ばれる。S (Spawner) 経由で弾・レーザーを出す。
 *   telegraph: true なら do の直前に予告演出を出す
 *   charge : 予備動作の強さ (0..1.4)
 *
 * Spawner (S) が提供するもの:
 *   S.boss      ボス本体 (座標・発射点)
 *   S.p(i)      発射点の座標
 *   S.player    自機
 *   S.B         弾管理
 *   S.L         レーザー管理
 *   S.d         難易度補正オブジェクト (speed/density/safe/homing)
 *   S.t         フェーズ開始からの経過秒
 *   S.n         このアクションの実行回数 (0 始まり)
 *   S.pt        今回使う発射点
 *   S.aim()     自機への角度
 *   S.rnd()     乱数 (0..1)
 *   S.ring/fan/wall/... bulletspawn の関数 (難易度補正済み)
 *   S.laser()   レーザー生成
 *   S.fx        エフェクト
 *   S.sound(n)  効果音
 */
import { TAU, rad, clamp, lerp } from '../core/util.js';
import * as SP from './bulletspawn.js';
import { BULLET_RADIUS } from './bulletart.js';

/** 難易度補正を適用した「弾数・速度・隙間」の計算ヘルパ */
export class Diff {
  constructor(d) {
    this.raw = d;
    this.speed = d.speed;
    this.density = d.density;
    this.safe = d.safe;
    this.homing = d.homing;
    this.bulletLife = d.bulletLife;
  }
  /** 弾数 */
  n(base) { return Math.max(1, Math.round(base * this.density)); }
  /** 弾速 */
  v(base) { return base * this.speed; }
  /** 隙間の広さ (safe が大きいほど隙間が広い = 弾数が減る) */
  gap(base) { return base * this.safe; }
  /** 隙間の個数 (EASY では増える) */
  gaps(base) { return Math.max(1, Math.round(base * this.safe)); }
  /** 持続時間 */
  life(base) { return base * this.bulletLife; }
}

/** 発射点を使い回すためのカーソル */
class Spawner {
  constructor() {
    this.action = null;
    this.n = 0;
  }

  bind({ action, boss, player, bullets, lasers, diff, fx, audio, t, rnd, phase }) {
    this.action = action;
    this.boss = boss;
    this.player = player;
    this.B = bullets;
    this.L = lasers;
    this.d = diff;
    this.fx = fx;
    this.audio = audio;
    this.t = t;
    this.n = action.n ?? 0;
    this.rnd = rnd;
    this.phase = phase;
    // アクションごとに別の発射点を使う (同時に複数アクションが動いても
    // 弾が同じ 1 点から出て見えなくなるのを防ぐ)
    const pc = Math.max(1, this.boss.pointCount ?? 1);
    this._ptIdx = ((action.idx ?? 0) % pc + pc) % pc;
  }

  /** 発射点 (毎回違う点を順に使う) */
  p(i) {
    const idx = i === undefined ? (this.action.n ?? 0) : i;
    return this.boss.point(idx);
  }
  /** 現在の発射点を進める */
  nextPoint() {
    const n = this.boss.pointCount;
    this._ptIdx = (this._ptIdx + 1) % n;
    return this.boss.point(this._ptIdx);
  }
  get pt() { return this.boss.point(this._ptIdx); }
  get pts() { return this.boss.attackPointsWorld; }

  aim(spreadRnd = 0) {
    const p = this.pt;
    const a = Math.atan2(this.player.y - p.y, this.player.x - p.x);
    return a + (spreadRnd ? (this.rnd() * 2 - 1) * spreadRnd : 0);
  }
  aimFrom(x, y, spreadRnd = 0) {
    const a = Math.atan2(this.player.y - y, this.player.x - x);
    return a + (spreadRnd ? (this.rnd() * 2 - 1) * spreadRnd : 0);
  }

  sound(name, opt) { this.audio?.play(name, opt); }
  shake(a) { this.fx?.addShake(a); }
  flash(a, c) { this.fx?.addFlash(a, c); }
  glow(x, y, n = 10, color = '#ffffff') { this.fx?.burst(x, y, n, { speed: 70, life: 0.3, size: 1, color, add: true }); }
  mark(x, y, color = '#ffffff') { this.fx?.ring(x, y, { r0: 2, r1: 34, life: 0.35, color, width: 1 }); }

  /* --- 難易度補正込みの弾幕ショートハンド --- */

  /** 全方位リング */
  ring(o) {
    const n = o.n != null ? this.d.n(o.n) : undefined;
    return SP.ring(this.B, {
      ...o,
      n: n ?? o.n,
      speed: o.speed != null ? this.d.v(o.speed) : 0,
      life: this.d.life(o.life ?? 8),
      ...(o.r == null ? {} : {}),
    });
  }

  /** 扇 (gap は safe で広がる) */
  fan(o) {
    return SP.fan(this.B, {
      ...o,
      n: o.n != null ? this.d.n(o.n) : o.n,
      speed: o.speed != null ? this.d.v(o.speed) : o.speed,
      gap: o.gap != null ? this.d.gap(o.gap) : o.gap,
      spread: o.spread != null ? o.spread : rad(60),
      life: this.d.life(o.life ?? 8),
    });
  }

  /** 螺旋 (arms は EASY で減る) */
  spiral(o) {
    return SP.spiral(this.B, {
      ...o,
      count: o.count,
      arms: o.arms != null ? Math.max(1, Math.round(o.arms * this.d.density)) : 1,
      speed: this.d.v(o.speed ?? 0),
      life: this.d.life(o.life ?? 8),
    });
  }

  /** 壁 (隙間の個数と幅を難易度で調整) */
  wall(o) {
    const gaps = o.gapAt == null ? [Math.round((o.n ?? 10) / 2)] : (Array.isArray(o.gapAt) ? o.gapAt : [o.gapAt]);
    const widened = gaps.map((g) => g);
    return SP.wall(this.B, {
      ...o,
      n: o.n,
      speed: this.d.v(o.speed),
      gapWidth: Math.max(1, Math.round((o.gapWidth ?? 1) * this.d.safe)),
      gapAt: widened,
      life: this.d.life(o.life ?? 8),
    });
  }

  /** 収束弾 */
  converge(o) { return SP.converge(this.B, { ...o, speed: this.d.v(o.speed) }); }

  /** 時間差連鎖 */
  chainRing(o) {
    return SP.chainRing(this.B, {
      ...o,
      perStage: this.d.n(o.perStage),
      speed: this.d.v(o.speed),
      life: this.d.life(o.life ?? 8),
    });
  }

  /** 停滞 → 方向転換 */
  turnAt(o) { return SP.turnAt(this.B, { ...o, n: o.n, speed: this.d.v(o.speed) }); }

  /** 反射弾 */
  bounce(o) {
    return SP.bounceBullets(this.B, {
      ...o,
      n: this.d.n(o.n),
      speed: this.d.v(o.speed),
      life: this.d.life(o.life ?? 10),
    });
  }

  /** 一点狙い */
  aimed(o) {
    const p = o.x != null ? { x: o.x, y: o.y } : this.pt;
    const a = o.angle ?? this.aimFrom(p.x, p.y, o.spread ?? 0);
    return SP.aimedShot(this.B, {
      ...o, x: p.x, y: p.y, angle: a, speed: this.d.v(o.speed ?? 0),
      life: this.d.life(o.life ?? 8),
    });
  }

  /** 安全地帯付きの花 */
  safeCore(o) {
    return SP.safeCore(this.B, {
      ...o, n: this.d.n(o.n), speed: this.d.v(o.speed),
      life: this.d.life(o.life ?? 8),
    });
  }

  /** レーザー */
  laser(o) {
    const p = o.x != null ? { x: o.x, y: o.y } : this.pt;
    const angle = o.angle ?? this.aimFrom(p.x, p.y, 0);
    const l = this.L.spawn({
      ...o,
      x: p.x, y: p.y, angle,
      width: o.width ?? 12,
      length: o.length ?? 900,
      warnTime: o.warnTime ?? 0.95,
      fireTime: o.fireTime ?? 2.0,
      follow: o.follow ?? 'boss',
      offsetX: o.offsetX ?? (p.x - this.boss.x),
      offsetY: o.offsetY ?? (p.y - this.boss.y),
    });
    this.audio?.play('warn', { vol: 0.5 });
    return l;
  }
}

/* ------------------------------------------------------------------ *
 * Phase: アクション一覧を時間で実行する
 * ------------------------------------------------------------------ */
export class PhaseRunner {
  constructor() {
    this.actions = [];
    this.t = 0;
    this.ended = false;
    this.spawner = new Spawner();
    this.rnd = Math.random;
    this.rngState = 0;
    this.events = [];
  }

  /** @param {Array} actions */
  reset(actions) {
    this.actions = actions.map((a, i) => ({
      ...a, n: 0, fired: false, nextAt: a.at ?? 0, idx: i,
      totalCount: a.count ?? (a.every ? Math.ceil(((a.until ?? 1e9) - (a.at ?? 0)) / a.every) + 1 : 1),
    }));
    this.t = 0;
    this.ended = false;
    this.events.length = 0;
  }

  update(dt, S) {
    this.t += dt;
    for (const a of this.actions) {
      const until = a.until ?? Infinity;
      const maxN = a.count ?? Infinity;
      let guard = 0;
      while (!a.fired && this.t >= a.nextAt - (a.jitter ? this.rnd() * a.jitter : 0) && a.n < maxN && this.t <= until + 0.001 && guard++ < 8) {
        // タイミングが来たので発火
        S.bind({
          action: a, boss: S.boss, player: S.player, bullets: S.bullets, lasers: S.lasers,
          diff: S.d, fx: S.fx, audio: S.audio, t: this.t, rnd: this.rnd, phase: S.phase,
        });
        // 予備動作
        if (a.charge) S.boss.onCharge(a.charge);
        if (a.telegraph) this._telegraph(a, S);
        try {
          a.do(S);
        } catch (e) {
          console.error(`[patterns] アクション ${a.idx} (at=${a.at}) で例外:`, a, e);
        }
        S.boss.onFire(a.pulse ?? 0.7);
        a.n++;
        this.events.push({ idx: a.idx, n: a.n, t: this.t });
        if (a.every && this.t + a.every <= until && a.n < maxN) {
          a.nextAt = a.at + a.every * a.n;
        } else {
          a.fired = true;
        }
      }
    }
  }

  /**
   * 予告: 発射位置に薄いリング/点滅を出しておく。
   * 「画面外から出現するまで見えない超高速弾」を禁止するための仕組み。
   */
  _telegraph(a, S) {
    const p = S.boss.point(a.n ?? 0);
    S.fx?.ring(p.x, p.y, {
      r0: 40, r1: 8, life: a.telegraphTime ?? 0.45,
      color: a.telegraphColor ?? '#ffffff', width: 1, add: true,
    });
    S.audio?.play('charge', { vol: 0.34 });
  }

  /** 全アクションが終わったか */
  get finished() {
    return this.actions.every((a) => a.fired || ((a.until ?? Infinity) < this.t && a.n >= (a.count ?? 1)));
  }

  /** 進捗 (残り時間の表示以外のデバッグ用途) */
  progress(totalSec) { return clamp(this.t / totalSec, 0, 1); }
}

/* ------------------------------------------------------------------ *
 * 弾幕を書くための便利関数 (パターン定義側で使う)
 * ------------------------------------------------------------------ */

/** 交互に色を変えながら n 回撃つ */
export function alternate(list, n) { return list[n % list.length]; }

/** 発射点を毎回切り替える */
export const P = (S, i) => S.p(i ?? S.n);

/** 3 点同時 (中心 + 左右) */
export function tripleFan(S, { speed, spread = rad(22), ...rest }) {
  const p = S.pt;
  const base = S.aimFrom(p.x, p.y);
  for (const d of [-1, 0, 1]) {
    S.fan({ x: p.x, y: p.y, n: 3, speed, angle: base + d * spread, spread: rad(8), ...rest });
  }
}

/** 定番の「壁 → 隙間 → 追いかけ」のコンボ */
export function wallThenAim(S, { wallN = 12, wallSpeed = 70, gapAt, aimN = 5, aimSpeed = 130, aimSpread = rad(18) }) {
  const p = S.pt;
  const down = rad(90);
  S.wall({
    n: wallN, speed: wallSpeed, angle: down, originX: p.x, originY: p.y - 40,
    gapAt: gapAt ?? Math.floor(wallN / 2), gapWidth: 3,
    type: 'rice', color: 'blue', life: 12,
  });
  S.aimed({ n: aimN, speed: aimSpeed, spread: aimSpread, spread: aimSpread, type: 'kunai', color: 'red', life: 10 });
}

/** 偶数フレームだけ鳴らすなど、音の連打を抑える */
export function everyOther(n) { return n % 2 === 0; }
