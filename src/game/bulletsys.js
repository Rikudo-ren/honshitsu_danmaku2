/* =============================================================================
 * src/game/bulletsys.js — 弾幕エンティティ・システム
 *
 *  ・オブジェクトプール（GC スパイクによる処理落ちを防ぐ）
 *  ・挙動（ビヘイビア）: 直進 / 旋回 / 追尾 / 反射 / 加速 / 減速 / 停止
 *  ・レーザー: 予告→発光→消滅の 3 段階。回転ビーム対応
 *  ・画面外出現弾は必ず「予告マーカー」を出す（理不尽さの排除）
 *
 *  設計上の絶対規則:
 *   1. 弾の速度上限を設ける（speedCap）。「超高速弾で難易度を稼ぐ」ことを構造的に禁止。
 *   2. 全弾が白コアを持つため、どの背景でも視認可能。
 *   3. 弾数上限を超えた場合、最も古い弾から消す（処理落ちの防止）。
 * ========================================================================== */
'use strict';

const BEHAVIOR = {
  /** 直進 */
  straight(b, dt) {
    b.x += b.vx * dt; b.y += b.vy * dt;
  },
  /** 旋回（角速度一定） */
  curve(b, dt) {
    const a = Math.atan2(b.vy, b.vx) + b.av * dt;
    const sp = Math.hypot(b.vx, b.vy);
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.rot = a + Math.PI / 2;
  },
  /** 加速・減速 */
  accel(b, dt) {
    let sp = Math.hypot(b.vx, b.vy);
    const a = Math.atan2(b.vy, b.vx);
    sp = Math.max(0, Math.min(b.speedCap, sp + b.acc * dt));
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    b.x += b.vx * dt; b.y += b.vy * dt;
  },
  /** 一定距離で方向転換（原作「一定距離で方向転換する弾」） */
  turnAtBase(b, dt) {
    if (!b.turned && b.life >= b.turnDelay) {
      b.turned = true;
      const a = Math.atan2(b.vy, b.vx) + b.turnAmount;
      b.vx = Math.cos(a) * b.turnSpeed; b.vy = Math.sin(a) * b.turnSpeed;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.rot = Math.atan2(b.vy, b.vx) + Math.PI / 2;
  },
  /** 緩やかな追尾（追尾強度は難易度で制御／原作の「緩やかに追尾する弾」） */
  homing(b, dt, sys) {
    const pl = sys.player;
    if (pl && b.track) {
      const ta = Math.atan2(pl.y - b.y, pl.x - b.x);
      const ca = Math.atan2(b.vy, b.vx);
      const na = ca + Math.max(-b.turnRate * dt, Math.min(b.turnRate * dt, window.HN.angleDelta(ca, ta)));
      let sp = Math.hypot(b.vx, b.vy);
      sp = Math.min(b.speedCap, sp + b.acc * dt);
      b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      b.rot = na + Math.PI / 2;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
  },
  /** 画面端で反射（原作「画面端で反射する弾」） */
  reflect(b, dt, sys) {
    const R = b.radius;
    if (b.x < R && b.vx < 0) { b.x = R; b.vx = -b.vx; b.bounces++; }
    if (b.x > sys.W - R && b.vx > 0) { b.x = sys.W - R; b.vx = -b.vx; b.bounces++; }
    if (b.y < R && b.vy < 0) { b.y = R; b.vy = -b.vy; b.bounces++; }
    if (b.y > sys.H - R && b.vy > 0) { b.y = sys.H - R; b.vy = -b.vy; b.bounces++; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.rot = Math.atan2(b.vy, b.vx) + Math.PI / 2;
  },
  /** 中心へ吸い込まれてから別方向へ（収束→拡散） */
  convergeThenDiverge(b, dt) {
    const cx = b.cx ?? b.ox, cy = b.cy ?? b.oy;
    if (b.life < b.convergeTime) {
      // 発射点へ戻るように減速しながら移動
      const a = Math.atan2(cy - b.y, cx - b.x);
      let sp = Math.hypot(b.vx, b.vy);
      sp = Math.max(0, sp - b.acc * 2.4 * dt);
      b.x += Math.cos(a) * sp * dt * 0.7;
      b.y += Math.sin(a) * sp * dt * 0.7;
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    } else {
      if (!b.dived) {
        b.dived = true;
        const a = b.divergedAngle ?? (b.baseAngle + b.divergedelta);
        b.vx = Math.cos(a) * b.turnSpeed; b.vy = Math.sin(a) * b.turnSpeed;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
    }
    b.rot = Math.atan2(b.vy, b.vx) + Math.PI / 2;
  },
  /** 重力（円弧を描く） */
  gravity(b, dt) {
    b.vy += b.g * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.rot = Math.atan2(b.vy, b.vx) + Math.PI / 2;
  },
  /** 静止（その場に留まり後に動く） */
  still(b, dt) {
    if (b.life >= b.startAfter) {
      b.behavior = b.thenBehavior || 'straight';
      if (b.thenSpeed) {
        const a = b.thenAngle !== undefined ? b.thenAngle : Math.atan2(b.vy, b.vx);
        b.vx = Math.cos(a) * b.thenSpeed; b.vy = Math.sin(a) * b.thenSpeed;
      }
    }
  },
};

class Bullet {
  constructor() { this.reset(); }
  reset() {
    this.active = false; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.type = 'riceNavy'; this.radius = 3; this.alpha = 1; this.scale = 1;
    this.behavior = 'straight'; this.rot = 0; this.spin = 0;
    this.life = 0; this.maxLife = 30; this.av = 0; this.acc = 0;
    this.speedCap = 400; this.turnRate = 0; this.track = false; this.turned = false;
    this.bounces = 0; this.maxBounces = 2; this.grazed = false; this.dived = false;
    this.glow = 1; this.cx = 0; this.cy = 0; this.convergeTime = 0;
    this.spawnDelay = 0; this.grow = 0; this.fadeIn = 0; this.fadeOut = 3;
    this.thenBehavior = null; this.thenSpeed = 0; this.thenAngle = undefined;
    this.startAfter = 0; this.offScreenSpawn = false; this.trail = 0;
    this.harmless = false; this.seed = 0; this.g = 0; this.wobble = 0; this.divergedAngle = null;
    // 再利用時に前の値が残らないよう必ず初期化する
    this.turnDelay = 1.2; this.turnAmount = Math.PI; this.turnSpeed = 0;
    this.baseAngle = 0; this.delay = 0; this.grazeRadius = 12; this._popped = false;
  }
}

/** 画面外から撃つ弾の予告マーカー */
class WarnMarker {
  constructor() { this.active = false; this.x = 0; this.y = 0; this.ang = 0; this.life = 0; this.dur = 0.7; this.ramp = null; }
}

class LaserBeam {
  constructor() { this.reset(); }
  reset() {
    this.active = false;
    this.x = 0; this.y = 0; this.ang = 0; this.width = 14; this.length = 2000;
    this.phase = 'warn'; this.t = 0; this.warnDur = 1.0; this.fireDur = 1.2; this.fadeDur = 0.35;
    this.rotate = 0; this.trackPlayer = false; this.ramp = null; this.alpha = 1;
    this.damaging = false; this.origin = false;
  }
}

class BulletSystem {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.bullets = [];
    this.lasers = [];
    this.warns = [];
    this.player = null;
    this.maxBullets = 1400;
    this.difficulty = null;
    this._pool = [];
    this._lp = [];
    this._wp = [];
    this.count = 0;
    this.danger = null;      // 背景演出用に「今の弾幕の主色」を保持
    this.onCancel = null;    // 弾消し時のコールバック（エフェクト用）
    this.freezeTime = 0;     // 弾幕停止（演出用）
    this.speedCapGlobal = 420;
  }

  /**
   * 全弾・レーザー・予告を破棄して初期状態に戻す。
   * ステージ開始時に呼ぶ。プールはそのまま再利用する（GC を避ける）。
   */
  reset() {
    for (const b of this.bullets) b.active = false;
    for (const l of this.lasers) l.active = false;
    for (const w of this.warns) w.active = false;
    this.bullets.length = 0;
    this.lasers.length = 0;
    this.warns.length = 0;
    this.count = 0;
    this.freezeTime = 0;
    return this;
  }

  /* ------------------------------------------------------------ 生成 ----- */
  spawn(o) {
    if (this.count >= this.maxBullets) { this._evictOldest(); }
    let b = this._pool.pop();
    if (!b) b = new Bullet();
    b.reset();
    b.x = o.x; b.y = o.y;
    const sp = o.speed ?? 100;
    const ang = o.ang ?? 0;
    b.vx = Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp;
    b.type = o.type ?? 'riceNavy';
    const def = window.HN.BULLET[b.type];
    b.radius = o.radius ?? (def ? def.radius : 3);
    b.alpha = o.alpha ?? 1;
    b.scale = o.scale ?? 1;
    b.behavior = o.behavior ?? 'straight';
    b.rot = o.rot ?? (ang + Math.PI / 2);
    b.spin = o.spin ?? (def && def.spin ? def.spin : 0);
    b.life = 0;
    b.maxLife = o.life ?? 22;
    b.av = o.av ?? 0;
    b.acc = o.acc ?? 0;
    b.speedCap = Math.min(this.speedCapGlobal * (o.speedCapMul ?? 1), o.speedCap ?? this.speedCapGlobal);
    b.turnRate = o.turnRate ?? 0;
    b.track = o.track ?? false;
    b.maxBounces = o.maxBounces ?? 2;
    b.turnDelay = o.turnDelay ?? 1.2; b.turnSpeed = o.turnSpeed ?? sp; b.turnAmount = o.turnAmount ?? Math.PI;
    b.glow = o.glow ?? 1;
    b.cx = o.cx ?? b.x; b.cy = o.cy ?? b.y;
    b.convergeTime = o.convergeTime ?? 0;
    b.divergedAngle = o.divergedAngle ?? null;
    b.thenBehavior = o.thenBehavior ?? null;
    b.thenSpeed = o.thenSpeed ?? 0; b.thenAngle = o.thenAngle;
    b.startAfter = o.startAfter ?? 0;
    b.baseAngle = ang;
    b.g = o.g ?? 0;
    b.wobble = o.wobble ?? 0;
    b.fadeIn = o.fadeIn ?? 0;
    b.grazeRadius = o.grazeRadius ?? (b.radius + 9);
    b.harmless = o.harmless ?? false;
    b.trail = o.trail ?? 0;
    b.delay = o.delay ?? 0;          // 発射までの待ち（その場に留まる）
    b.seed = (Math.random() * 1000) | 0;
    // 出現アニメーション（唐突な出現を避け、必ず立ち上がりを見せる）
    if (b.delay > 0) { b.behavior = 'still'; b.startAfter = b.delay; }
    b.active = true;
    this._add(b);
    return b;
  }

  _add(b) {
    // active な弾を配列前方にまとめるための挿入（末尾に置き、更新で前詰め）
    this.bullets.push(b); this.count++;
  }

  _evictOldest() {
    for (let i = 0; i < this.bullets.length; i++) {
      const b = this.bullets[i];
      if (b.active) { this.kill(b, false); return; }
    }
  }

  /** 画面外から出現する弾: 予告マーカーを出してから発射する */
  spawnFromEdge(o, sys) {
    const d = o.speed ?? 100;
    const m = this._wp.pop() || new WarnMarker();
    m.active = true;
    m.x = o.x; m.y = o.y; m.ang = o.ang; m.life = 0;
    m.dur = o.warnDur ?? 0.65;
    m.ramp = o.ramp;
    m.then = o;
    this.warns.push(m);
    return m;
  }

  /**
   * 弾を消す。ここではプールへ戻さず active=false にするだけ。
   * 実際の回収は update() の前詰め処理で行う（同フレーム内のプール二重取得を防ぐ）。
   */
  kill(b, pop = true) {
    if (!b.active) return;
    b.active = false; this.count--;
    if (pop && this.onCancel) this.onCancel(b);
  }

  clear(pop = true) {
    for (const b of this.bullets) if (b.active) this.kill(b, pop);
    for (const l of this.lasers) l.active = false;
    for (const w of this.warns) w.active = false;
  }

  /** 範囲内の弾を消す（ボム／被弾時の救済） */
  cancelInRadius(x, y, r, includeBig = false) {
    const r2 = r * r;
    let n = 0;
    for (const b of this.bullets) {
      if (!b.active) continue;
      if (!includeBig && b.radius > 8) continue;
      const dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy <= r2) { this.kill(b, true); n++; }
    }
    return n;
  }

  /* -------------------------------------------------------- レーザー ----- */
  spawnLaser(o) {
    const l = this._lp.pop() || new LaserBeam();
    l.reset();
    Object.assign(l, o);
    l.active = true;
    l.phase = 'warn'; l.t = 0;
    this.lasers.push(l);
    return l;
  }

  /* ------------------------------------------------------------ 更新 ----- */
  update(dt) {
    if (this.freezeTime > 0) { this.freezeTime -= dt; return; }
    dt = Math.min(dt, 1 / 30);  // 大きな dt によるすり抜けを防止

    // 弾
    const list = this.bullets;
    let writeIdx = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.active) continue;
      b.life += dt;
      (BEHAVIOR[b.behavior] || BEHAVIOR.straight)(b, dt, this);
      if (b.spin) b.rot += b.spin * dt;
      if (b.wobble) { b.rot += Math.sin(b.life * 6 + b.seed) * b.wobble * dt; }

      // 画面外判定（余裕を持たせ、戻ってくる弾は消さない）
      const M = 90 + b.radius;
      if (b.x < -M || b.x > this.W + M || b.y < -M || b.y > this.H + M) {
        if (b.behavior !== 'reflect' || b.bounces >= b.maxBounces) { this.kill(b, false); continue; }
      }
      if (b.life > b.maxLife) { this.kill(b, false); continue; }
      if (b.trail && (b.life % 0.05) < dt) {
        // 軌跡用（エフェクト側が拾う）
        (this.trailEmit || (() => { }))(b);
      }
      // 前詰め
      if (writeIdx !== i) list[writeIdx] = b;
      writeIdx++;
    }
    // 消えた弾をプールへ回収してから配列を縮める
    for (let i = writeIdx; i < list.length; i++) {
      const d = list[i];
      if (!d.active && !d._popped) { d._popped = true; this._pool.push(d); }
    }
    list.length = writeIdx;

    // レーザー
    const ls = this.lasers;
    let lw = 0;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      if (!l.active) continue;
      l.t += dt;
      if (l.rotate) l.ang += l.rotate * dt;
      if (l.trackPlayer && this.player && l.phase === 'warn' && l.t < l.warnDur) {
        const ta = Math.atan2(this.player.y - l.y, this.player.x - l.x);
        l.ang = window.HN.angleApproach(l.ang, ta, 1.2 * dt);
      }
      if (l.phase === 'warn' && l.t >= l.warnDur) { l.phase = 'fire'; l.t = 0; l.damaging = true; if (l.onFire) l.onFire(l); }
      else if (l.phase === 'fire' && l.t >= l.fireDur) { l.phase = 'fade'; l.t = 0; l.damaging = false; }
      else if (l.phase === 'fade' && l.t >= l.fadeDur) { l.active = false; this._lp.push(l); continue; }
      ls[lw++] = l;
    }
    ls.length = lw;

    // 予告マーカー
    const ws = this.warns;
    let ww = 0;
    for (let i = 0; i < ws.length; i++) {
      const m = ws[i];
      if (!m.active) continue;
      m.life += dt;
      if (m.life >= m.dur) {
        m.active = false;
        // 発射
        this.spawn(m.then);
        this._wp.push(m);
        continue;
      }
      ws[ww++] = m;
    }
    ws.length = ww;
  }

  /* -------------------------------------------------------- 当たり判定 --- */
  /**
   * 自機との衝突判定。
   * @returns {{hit:boolean, graze:number, hitBy:object|null}}
   */
  collide(px, py, hitR, grazeR, invuln) {
    let graze = 0, hit = false, hitBy = null;
    for (const b of this.bullets) {
      if (!b.active || b.harmless) continue;
      const dx = b.x - px, dy = b.y - py;
      const d2 = dx * dx + dy * dy;
      const rr = b.radius * 0.72 + hitR;   // 体感を優先し、見た目より少し寛容に
      if (!invuln && d2 <= rr * rr) { hit = true; hitBy = b; break; }
      if (!b.grazed) {
        const gr = b.radius + grazeR;
        if (d2 <= gr * gr) { b.grazed = true; graze++; }
      }
    }
    // レーザー
    if (!hit) {
      for (const l of this.lasers) {
        if (!l.active || !l.damaging || l.alpha <= 0) continue;
        const d = this._pointSegDist(px, py, l);
        const rr = l.width * 0.42 + hitR;
        if (!invuln && d <= rr) { hit = true; hitBy = null; break; }
        if (d <= l.width * 0.42 + grazeR) graze += 1;
      }
    }
    return { hit, graze, hitBy };
  }

  _pointSegDist(px, py, l) {
    const cx = Math.cos(l.ang), cy = Math.sin(l.ang);
    const dx = px - l.x, dy = py - l.y;
    const t = dx * cx + dy * cy;
    if (t < 0) return Math.hypot(dx, dy);
    const t2 = Math.min(t, l.length);
    return Math.hypot(dx - cx * t2, dy - cy * t2);
  }

  /** 画面上の弾数（HUD / パフォーマンス表示用） */
  get liveCount() { return this.count + this.lasers.reduce((a, l) => a + (l.active ? 1 : 0), 0); }
}

window.HN = window.HN || {};
Object.assign(window.HN, { BulletSystem, Bullet, LaserBeam, BEHAVIOR });
