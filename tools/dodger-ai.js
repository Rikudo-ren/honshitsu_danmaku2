/* =============================================================================
 * tools/dodger-ai.js — 回避 AI（公平性の自動検証用）
 *
 *  ブラウザが使えない環境で「実際に遊んで確かめる」代わりに、
 *  人間の操作に近い回避 AI を走らせる。
 *
 *  改良点:
 *  ・候補地点までの「経路」を複数点でサンプリングし、通過中の余裕を評価する
 *  ・弾の未来位置を数点予測し、先読みして評価する
 *  ・影響半径内の弾だけを見る空間フィルタで高速化
 *  ・壁際ペナルティと「その場に留まる」選択で、不自然な端の張り付きを防ぐ
 *
 *  EASY / NORMAL で生存できなければ、そのパターンは人間にも厳しすぎる可能性が高い。
 * ========================================================================== */
'use strict';

// ゲーム本体の弾挙動テーブル。Node から直接使うために headless 経由で読む
// （window を参照しないよう、このモジュールはあくまで HN 経由で受け取る）
const { loadGame } = require('./headless');
let _BEHAVIOR = null;
try {
  _BEHAVIOR = loadGame({ sources: ['src/core/util.js', 'src/game/bulletsys.js'] }).HN.BEHAVIOR;
} catch (e) {
  _BEHAVIOR = null;
}
if (!_BEHAVIOR) {
  // 読み込めない場合の退避（直進のみ）。検証精度は落ちるが落ちはしない。
  _BEHAVIOR = { straight(b, dt) { b.x += b.vx * dt; b.y += b.vy * dt; } };
}

const CANDIDATES = 32;      // 1 段目の移動候補方向
const PATH_SAMPLES = 6;     // 経路上の評価点
const HORIZON = 0.32;       // 1 手の到達時間（秒）
const INFLUENCE = 260;      // 影響半径(px)。これより遠い弾は「今の判断」に効かせない
const CELL = 20;            // 危険度マップのセルサイズ(px)
const GRAZE_BAND = 15;      // 「かすり」を狙う距離帯[px]（これより遠い弾は加点しない）
const GRAZE_GAP = 2.5;      // これ以下まで寄る経路は加点しない（加点のために死なない）
const GRAZE_W = 0.55;       // かすりの重み。余裕（worst*2.4）を食わない程度に小さくする
const BUCKETS = 8;          // 時間バケット数
const SLICE = 0.11;         // 1 バケットの長さ（秒）→ 合計 0.88 秒先まで

/**
 * 回避 AI（公平性の自動検証用）
 *
 *  ブラウザが使えない環境で「実際に遊んで確かめる」代わりに走らせる。
 *  人間の「読む・先回りする・待つ」に相当する判断を、次の 2 つの指標で近似する。
 *
 *   ① 余裕（clearance）
 *      経路上の各点で、弾の現在位置と 0.15/0.30 秒後の位置までの最短距離を測り、
 *      その最悪値を評価する。近くの弾を反射的に避ける役割。
 *
 *   ② 時間つき危険度マップ
 *      画面を 20px のセルに切り、各セルを「何秒後に危険になるか」のバケットに分けて
 *      未来位置を焼き込む。評価時は「自分がそこに居る時刻のバケット」だけを見る。
 *      これにより「今は空いているが自分が着くころには閉じる隙間」を避けられる。
 *      時間を見ない単純な危険度マップだと、0.9 秒後にしか危険にならないセルまで
 *      避けようとして判断が鈍る（実際に試して失敗した）。
 *
 *  EASY / NORMAL で生存できなければ、そのパターンは人間にも厳しすぎる可能性が高い。
 */
class DodgerAI {
  constructor(dif) {
    this.dif = dif;
    this.jitter = 0;
  }

  /**
   * @returns {{x,y,threat,focus}} focus=true なら低速（集中）モードを要求する。
   *
   *  集中モードを使うのは人間と同じ理由。弾幕の隙間は 30px 前後しかないことが多く、
   *  等速 292px/s では 1 フレーム 5px 進んでしまい狙った位置に止まれない。
   *  低速（132px/s）なら 2px/フレームになり、隙間を抜けながら微調整できる。
   *  この AI は当初これを知らなかったため、狭い局面で無駄に被弾していた。
   */
  step(px, py, sys, dt, speed, hitR, bounds) {
    // すでに弾と重なっている（復帰直後など）なら、いったん安全方向へ抜ける
    if (this._clearance(px, py, sys, hitR) < 0) {
      this.focus = false;
      this.jitter += 0.017;
      const a = this.jitter * 2.3;
      return {
        x: Math.max(bounds.x0, Math.min(bounds.x1, px + Math.cos(a) * speed * 0.15)),
        y: Math.max(bounds.y0, Math.min(bounds.y1, py + Math.sin(a) * speed * 0.15)),
        threat: 1e3,
      };
    }

    this._buildMaps(sys, px, py, bounds);

    // 余裕が乏しいときは集中モード（低速）で探索する。狭い隙間は低速でしか抜けられない。
    const slack = this._clearance(px, py, sys, hitR);
    this.focus = slack < 30;
    const spd = this.focus ? speed * 0.45 : speed;
    const d = spd * HORIZON;

    let bestA = null, bestScore = -1e9;
    for (let i = 0; i < CANDIDATES; i++) {
      const a = (i / CANDIDATES) * Math.PI * 2;
      const s = this._score(px, py, a, d, bounds, sys, hitR);
      if (s > bestScore) { bestScore = s; bestA = a; }
    }
    // 最良方向の周辺を細かく探る（32 方向では粒度が足りない局面がある）
    for (let i = -6; i <= 6; i++) {
      if (i === 0) continue;
      const a = bestA + i * (Math.PI * 2 / (CANDIDATES * 6));
      const s = this._score(px, py, a, d, bounds, sys, hitR);
      if (s > bestScore) { bestScore = s; bestA = a; }
    }
    // 「留まる」も候補に入れる（行き止まりで突っ込まない）
    {
      const s = this._score(px, py, null, 0, bounds, sys, hitR) + (this.focus ? 1.4 : 0.5);
      if (s > bestScore) { bestScore = s; bestA = null; }
    }

    if (bestA === null) return { x: px, y: py, threat: -bestScore, focus: this.focus };
    const nx0 = px + Math.cos(bestA) * d, ny0 = py + Math.sin(bestA) * d;
    return {
      x: Math.max(bounds.x0, Math.min(bounds.x1, nx0)),
      y: Math.max(bounds.y0, Math.min(bounds.y1, ny0)),
      threat: -bestScore,
      focus: this.focus,
    };
  }

  /** 今の位置の余裕（負なら当たっている） */
  _clearance(px, py, sys, hitR) {
    let worst = 1e9;
    const list = sys.bullets;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.active || b.harmless) continue;
      if (Math.abs(b.x - px) > 90 || Math.abs(b.y - py) > 90) continue;
      const dd = Math.hypot(b.x - px, b.y - py) - (b.radius * 0.72 + hitR);
      if (dd < worst) worst = dd;
    }
    for (const l of sys.lasers) {
      if (!l.active || !l.damaging) continue;
      const dd = this._laserSegDist(px, py, l) - (l.width * 0.42 + hitR);
      if (dd < worst) worst = dd;
    }
    return worst;
  }

  /**
   * 時間バケット付き危険度マップを作る。
   * バケット k は「今から k*SLICE 秒後に危険になるセル」を表す。
   */
  _buildMaps(sys, px, py, bounds) {
    const w = Math.ceil((bounds.x1 - bounds.x0) / CELL) + 3;
    const h = Math.ceil((bounds.y1 - bounds.y0) / CELL) + 3;
    if (!this._maps || this._mw !== w || this._mh !== h) {
      this._maps = [];
      for (let k = 0; k < BUCKETS; k++) this._maps.push(new Float32Array(w * h));
      this._mw = w; this._mh = h;
    } else {
      for (let k = 0; k < BUCKETS; k++) this._maps[k].fill(0);
    }
    this._mx0 = bounds.x0; this._my0 = bounds.y0;

    const stamp = (map, x, y, v) => {
      const gx = Math.floor((x - this._mx0) / CELL) + 1;
      const gy = Math.floor((y - this._my0) / CELL) + 1;
      if (gx < 0 || gy < 0 || gx >= w || gy >= h) return;
      if (v > map[gy * w + gx]) map[gy * w + gx] = v;
      // 隣接セルにも薄く置く（セル境界をまたぐ弾の取りこぼしを防ぐ）
      const half = v * 0.45;
      if (gx > 0 && half > map[gy * w + gx - 1]) map[gy * w + gx - 1] = half;
      if (gx + 1 < w && half > map[gy * w + gx + 1]) map[gy * w + gx + 1] = half;
      if (gy > 0 && half > map[(gy - 1) * w + gx]) map[(gy - 1) * w + gx] = half;
      if (gy + 1 < h && half > map[(gy + 1) * w + gx]) map[(gy + 1) * w + gx] = half;
    };

    const list = sys.bullets;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.active || b.harmless) continue;
      if (Math.abs(b.x - px) > INFLUENCE || Math.abs(b.y - py) > INFLUENCE) continue;
      const wgt = b.radius > 8 ? 1.0 : 0.92;   // 大きい弾はわずかに重く見る
      const curving = b.track || b.av || b.acc || b.behavior === 'curve'
        || b.behavior === 'homing' || b.behavior === 'convergeThenDiverge'
        || b.behavior === 'turnAtBase';
      for (let k = 0; k < BUCKETS; k++) {
        const tf = k * SLICE;
        const decay = 1 - k / BUCKETS;
        if (curving) {
          // 旋回する弾は本体の挙動で投影する
          const f = this._project(b, sys, k === 0 ? 0.001 : tf);
          stamp(this._maps[k], f.x, f.y, decay * wgt);
        } else {
          stamp(this._maps[k], b.x + b.vx * tf, b.y + b.vy * tf, decay * wgt);
        }
      }
    }
    // レーザー：警告中は薄く、発射中は濃く。回転も予測して焼く
    for (const l of sys.lasers) {
      if (!l.active) continue;
      const span = Math.min(l.length, 900);
      const n = Math.max(2, Math.floor(span / 26));
      for (let k = 0; k < BUCKETS; k++) {
        const tf = k * SLICE;
        const ang = l.ang + (l.rotate || 0) * tf;
        const decay = 1 - k / BUCKETS;
        const wgt = l.phase === 'warn' ? 0.45 : 1.0;
        for (let j = 0; j <= n; j++) {
          const t = (j / n) * span;
          const x = l.x + Math.cos(ang) * t, y = l.y + Math.sin(ang) * t;
          if (Math.abs(x - px) > INFLUENCE || Math.abs(y - py) > INFLUENCE) continue;
          stamp(this._maps[k], x, y, decay * wgt);
        }
      }
    }
    return this._maps;
  }

  /** セルの危険度（バケット idx） */
  _at(map, x, y) {
    const gx = Math.floor((x - this._mx0) / CELL) + 1;
    const gy = Math.floor((y - this._my0) / CELL) + 1;
    if (gx < 0 || gy < 0 || gx >= this._mw || gy >= this._mh) return 0;
    const v = map[gy * this._mw + gx];
    return v === undefined ? 0 : v;
  }

  /** ある方向へ 1 手ぶん動いたときの評価（大きいほど安全） */
  /**
   * 経路の評価。
   *
   *  ④ かすり（グレイズ）への誘導を追加した理由:
   *   このゲームの「観測」（弾消し＋ボス硬直）は、かすった弾の数で溜まるゲージで撃つ。
   *   かすりを狙わない AI はゲージが溜まらず、**一度も観測を使えない**（実測 24 回の
   *   通し検証で 0 回）。観測は人間が普通に使う立て直しの手段なので、それを使えない
   *   AI は人間より弱く、クリア可否の判定を実際より厳しく見積もってしまう。
   *   そこで「当たらない範囲で弾に寄る」経路をわずかに加点する。
   *   GRAZE_GAP 以下まで寄る経路は加点しない（加点のために被弾しないため）。
   */
  _score(px, py, ang, d, bounds, sys, hitR) {
    const nx0 = ang === null ? px : px + Math.cos(ang) * d;
    const ny0 = ang === null ? py : py + Math.sin(ang) * d;
    const nx = Math.max(bounds.x0, Math.min(bounds.x1, nx0));
    const ny = Math.max(bounds.y0, Math.min(bounds.y1, ny0));
    const blocked = Math.hypot(nx - nx0, ny - ny0);

    // ---- ① 経路の余裕 ----
    const near = this._near(sys, px, py);
    let worst = 1e9, acc = 0, cnt = 0, graze = 0;
    for (let s = 0; s <= PATH_SAMPLES; s++) {
      const t = s / PATH_SAMPLES;
      const cx = px + (nx - px) * t;
      const cy = py + (ny - py) * t;
      let m = 1e9;
      for (let i = 0; i < near.length; i++) {
        const o = near[i];
        let dd = Math.hypot(o.x - cx, o.y - cy) - (o.r + hitR);
        if (dd < m) m = dd;
        dd = Math.hypot(o.fx1 - cx, o.fy1 - cy) - (o.r + hitR);
        if (dd < m) m = dd;
        dd = Math.hypot(o.fx2 - cx, o.fy2 - cy) - (o.r + hitR);
        if (dd < m) m = dd;
      }
      if (m < worst) worst = m;
      acc += m; cnt++;
      // ---- ④ かすりの誘導（当たらない範囲でだけ）----
      if (m > GRAZE_GAP && m < GRAZE_BAND) graze += (GRAZE_BAND - m);
    }
    const avg = acc / Math.max(1, cnt);

    // ---- ② 自分の到達時刻に対応するバケットの危険度 ----
    // 経路前半は「今から 1 バケット後」、終点は「HORIZON 後」を見る
    const kEnd = Math.max(0, Math.min(BUCKETS - 1, Math.round(HORIZON / SLICE)));
    const kMid = Math.max(0, kEnd >> 1);
    let danger = 0;
    for (let s = 0; s <= PATH_SAMPLES; s++) {
      const t = s / PATH_SAMPLES;
      const cx = px + (nx - px) * t;
      const cy = py + (ny - py) * t;
      const k = Math.round(kEnd * t);
      const v = this._at(this._maps[k], cx, cy);
      if (v > danger) danger = v;
    }
    danger = Math.max(danger, this._at(this._maps[kMid], (px + nx) / 2, (py + ny) / 2));

    // ---- ③ 壁際ペナルティ ----
    const edge = Math.min(nx - bounds.x0, ny - bounds.y0, bounds.x1 - nx, bounds.y1 - ny);
    const edgePen = edge < 26 ? (26 - edge) * 0.55 : 0;

    // 余裕を主軸、マップを「読み」として加算する。かすりは最後に少量だけ足す。
    const grazeAvg = graze / Math.max(1, cnt);
    return worst * 2.4 + avg * 0.9 - danger * 210 - edgePen - blocked * 2.0
      + grazeAvg * GRAZE_W;
  }

  /**
   * 弾の未来位置を投影する。
   *
   *  等速直線で近似すると、追尾弾（track）や旋回弾（curve）の未来位置を
   *  外してしまう。実際この近似のせいで、AI は追尾弾に弱かった
   *  （＝検証が「人間より下手」になり、公平性の判定を誤る）。
   *  そこでゲーム本体の BEHAVIOR をそのまま弾の複製に適用して投影する。
   *  挙動コードが一箇所しか無いので、仕様変更にも自動で追随する。
   */
  _project(b, sys, t) {
    const sc = this._scratch || (this._scratch = {});
    // 必要なフィールドだけコピーして挙動関数を回す
    sc.x = b.x; sc.y = b.y; sc.vx = b.vx; sc.vy = b.vy;
    sc.radius = b.radius; sc.av = b.av; sc.acc = b.acc; sc.turnRate = b.turnRate;
    sc.speedCap = b.speedCap; sc.track = b.track; sc.behavior = b.behavior;
    sc.bounces = b.bounces; sc.maxBounces = b.maxBounces; sc.baseAngle = b.baseAngle;
    sc.turnDelay = b.turnDelay; sc.turnAmount = b.turnAmount; sc.turnSpeed = b.turnSpeed;
    sc.life = b.life; sc.maxLife = b.maxLife; sc.cx = b.cx; sc.cy = b.cy;
    sc.convergeTime = b.convergeTime; sc.divergedAngle = b.divergedAngle;
    sc.thenBehavior = b.thenBehavior; sc.thenSpeed = b.thenSpeed; sc.thenAngle = b.thenAngle;
    sc.startAfter = b.startAfter; sc.g = b.g; sc.wobble = b.wobble; sc.seed = b.seed;
    sc.active = true; sc.harmless = true; sc.delay = 0; sc.turned = false; sc.dived = false;
    const fn = _BEHAVIOR[sc.behavior] || _BEHAVIOR.straight;
    const steps = Math.min(40, Math.round(t * 60));
    for (let i = 0; i < steps; i++) {
      try { fn(sc, 1 / 60, sys); } catch (e) { break; }
    }
    return sc;
  }

  /** 自機の近くの弾（現在＋未来 2 点）をまとめて取り出す */
  _near(sys, px, py) {
    const out = [];
    const R = 200;
    const list = sys.bullets;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.active || b.harmless) continue;
      if (Math.abs(b.x - px) > R || Math.abs(b.y - py) > R) continue;
      const r = b.radius * 0.72;
      // 追尾・旋回する弾だけ本体の挙動で投影する（直進弾は等速で十分速い）
      if (b.track || b.av || b.acc || b.behavior === 'curve' || b.behavior === 'homing'
        || b.behavior === 'convergeThenDiverge' || b.behavior === 'turnAtBase') {
        const f1 = this._project(b, sys, 0.15);
        const x1 = f1.x, y1 = f1.y;
        const f2 = this._project(b, sys, 0.30);
        out.push({ x: b.x, y: b.y, r, fx1: x1, fy1: y1, fx2: f2.x, fy2: f2.y });
      } else {
        out.push({
          x: b.x, y: b.y, r,
          fx1: b.x + b.vx * 0.15, fy1: b.y + b.vy * 0.15,
          fx2: b.x + b.vx * 0.30, fy2: b.y + b.vy * 0.30,
        });
      }
    }
    for (const l of sys.lasers) {
      if (!l.active) continue;
      for (let fut = 0; fut < 3; fut++) {
        const tF = fut * 0.15;
        const ang = l.ang + (l.rotate || 0) * tF;
        const warn = l.phase === 'warn' && fut === 0;
        const span = Math.min(l.length, 900);
        const n = Math.max(2, Math.floor(span / 26));
        for (let k = 0; k <= n; k++) {
          const t = (k / n) * span;
          const x = l.x + Math.cos(ang) * t, y = l.y + Math.sin(ang) * t;
          if (Math.abs(x - px) > R || Math.abs(y - py) > R) continue;
          out.push({ x, y, r: l.width * 0.42, fx1: x, fy1: y, fx2: x, fy2: y });
        }
      }
    }
    return out;
  }

  _laserSegDist(px, py, l) {
    const cx = Math.cos(l.ang), cy = Math.sin(l.ang);
    const dx = px - l.x, dy = py - l.y;
    const t = dx * cx + dy * cy;
    if (t < 0) return Math.hypot(dx, dy);
    const t2 = Math.min(t, l.length);
    return Math.hypot(dx - cx * t2, dy - cy * t2);
  }

  /** 影響範囲内の弾＋未来位置をまとめて取り出す（毎フレーム1回） */
  _gather(sys, px, py) {
    const out = [];
    const R = INFLUENCE + 120;
    const list = sys.bullets;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.active || b.harmless) continue;
      if (Math.abs(b.x - px) > R || Math.abs(b.y - py) > R) continue;
      const r = b.radius * 0.72;
      out.push({
        x: b.x, y: b.y, r,
        fx1: b.x + b.vx * 0.15, fy1: b.y + b.vy * 0.15,
        fx2: b.x + b.vx * 0.30, fy2: b.y + b.vy * 0.30,
      });
    }
    for (const l of sys.lasers) {
      if (!l.active) continue;
      // 回転レーザーは「未来の角度」も予測してサンプリングする。
      // これを見落とすと AI が回転ビームに突っ込んでしまい、検証の意味が薄れる。
      for (let fut = 0; fut < 3; fut++) {
        const dtF = fut * 0.15;
        const ang = l.ang + (l.rotate || 0) * dtF;
        const warn = l.phase === 'warn' && fut === 0;
        // サンプル間隔を細かくしないと「線分の隙間」を誤認して
        // AI がレーザーを突っ切ってしまう（＝検証が無意味になる）
        const span = Math.min(l.length, 900);
        const step = 26;
        const n = Math.max(2, Math.floor(span / step));
        for (let k = 0; k <= n; k++) {
          const t = (k / n) * span;
          const x = l.x + Math.cos(ang) * t, y = l.y + Math.sin(ang) * t;
          if (Math.abs(x - px) > R || Math.abs(y - py) > R) continue;
          const rr = l.width * 0.42;
          out.push({
            x, y, r: rr, fx1: x, fy1: y, fx2: x, fy2: y,
            w: warn ? 0.7 : 1.0,
          });
        }
      }
    }
    return out;
  }

  /** 経路の安全性を評価する（大きいほど安全） */
  _evalPath(px, py, nx, ny, near, hitR, sys, horizon) {
    let worst = 1e9;
    let acc = 0, cnt = 0;
    for (let s = 0; s <= PATH_SAMPLES; s++) {
      const t = s / PATH_SAMPLES;
      const cx = px + (nx - px) * t;
      const cy = py + (ny - py) * t;
      // 3 時点（現在・0.15s後・0.30s後）で余裕を見る
      let m = 1e9;
      for (let i = 0; i < near.length; i++) {
        const n = near[i];
        const w = n.w || 1;
        let d = Math.hypot(n.x - cx, n.y - cy) - (n.r + hitR);
        if (d < m) m = d;
        d = Math.hypot(n.fx1 - cx, n.fy1 - cy) - (n.r + hitR);
        if (d < m) m = d;
        d = Math.hypot(n.fx2 - cx, n.fy2 - cy) - (n.r + hitR);
        if (d < m) m = d;
      }
      if (m < worst) worst = m;
      acc += m; cnt++;
    }
    const avg = acc / Math.max(1, cnt);
    // 壁際ペナルティ（人間も画面端に張り付き続けない）
    const edge = Math.min(nx, ny, sys.W - nx, sys.H - ny);
    const edgePen = edge < 30 ? (30 - edge) * 0.55 : 0;
    // 最悪値重視＋平均で同点を崩す
    return worst * 2.6 + avg * 1.0 - edgePen;
  }
}

module.exports = { DodgerAI };
