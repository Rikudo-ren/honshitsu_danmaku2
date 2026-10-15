/**
 * patterns_lib.js — 弾幕の部品集
 *
 * 各関数は「1 回の発射イベント」を担当する。ステージ定義 (stages.js) が
 * これらを時間軸に並べることでフェーズが構成される。
 *
 * すべての関数は以下を満たすよう設計している:
 *   ・発射位置が明確 (ボスの発射点 / 画面端 / 消失点)
 *   ・弾速は基本 40〜170 px/s (超高速弾を使わない)
 *   ・回避ルートが幾何学的に保証される (隙間・安全地帯・タイミング)
 *   ・視覚的な予告がある (予備動作 or 薄い先行弾)
 *   ・フェーズ内での役割が決まっている (導入 / 展開 / 山場 / 締め)
 */
import { VIEW_W, VIEW_H, FIELD } from '../core/const.js';
import { TAU, rad, clamp, lerp } from '../core/util.js';
import * as SP from './bulletspawn.js';

/* ================================================================== *
 * 2D パターン
 * ================================================================== */

/**
 * 【円形拡散】回転するリングバースト。
 * 発射ごとにリングの角度が進むので「回っている壁」に見える。
 * 隙間は常に等間隔 → プレイヤーは回転の隙間を縫って移動する。
 */
export function spinRingBurst(S, o = {}) {
  const {
    n = 15, speed = 60, offsetStep = 24, type = 'rice', color = 'gold',
    r = 5, arms = 1, life = 9, turn = 0,
  } = o;
  const p = S.pt;
  S.ring({
    x: p.x, y: p.y, n, speed, type, color, r, life, turn,
    offset: rad(S.n * offsetStep),
    fixedAngle: S.n * offsetStep + 90,
  });
  if (arms > 1) {
    for (let a = 1; a < arms; a++) {
      S.ring({
        x: p.x, y: p.y, n: Math.max(3, Math.round(n / 2)), speed: speed * 0.86,
        type, color, r, life,
        offset: rad(S.n * offsetStep + (360 / arms) * a),
        delay: 0.16 * a,
      });
    }
  }
  S.sound('shot_medium', { vol: 0.5 });
  S.glow(p.x, p.y, 8, '#ffe9a8');
}

/**
 * 【隙間を通す壁】開閉する壁。
 * 2 つの隙間が左右にゆっくり動き、閉じたり開いたりする。
 * 「一定間隔で開く・閉じる弾幕」。
 * 隙間は最低限の幅を常に確保するので、詰みは発生しない。
 */
export function openingWall(S, o = {}) {
  const {
    n = 16, speed = 68, gapWidth = 2, swing = 4.2, base = 0.5,
    type = 'orb', color = 'blue', r = 5, life = 10, fromTop = true,
  } = o;
  const t = S.t;
  const center = base * n;
  const g1 = Math.round(center + Math.sin(t * 1.15) * swing);
  const g2 = Math.round(center + Math.sin(t * 1.15 + Math.PI) * swing);
  const gapAt = [clamp(g1, 1, n - 1 - gapWidth), clamp(g2, 1, n - 1 - gapWidth)];
  S.wall({
    n, speed, angle: fromTop ? rad(90) : rad(-90),
    originX: VIEW_W / 2, originY: fromTop ? -8 : VIEW_H + 8,
    gapAt, gapWidth, type, color, r, life,
  });
  S.sound('shot_small', { vol: 0.36, rate: 0.9 });
}

/**
 * 【時間差連鎖】リングを少しずつずらして連鎖発射。
 * 1 発目を避けた方向に 2 発目が来るので「避けた後の判断」を要求する。
 */
export function chainBurst(S, o = {}) {
  const {
    stages = 4, perStage = 12, speed = 74, offsetStep = 9, delayStep = 0.30,
    type = 'shard', color = 'violet', r = 4.6, life = 9, colors = null,
  } = o;
  const p = S.pt;
  S.chainRing({
    x: p.x, y: p.y, stages, perStage, speed, offsetStep, delayStep,
    type, color, r, life, colors,
    offsetDir: S.n % 2 === 0 ? 1 : -1,
  });
  S.sound('shot_small', { vol: 0.40, rate: 1.15 });
  S.mark(p.x, p.y, '#c9a8ff');
}

/**
 * 【追尾】緩やかに自機を追う弾。
 * 追尾時間を 1.2〜2.0 秒に限定し、追尾中は弾速を遅くする。
 * = 「ずっと追いかけてくる理不尽」を避けつつ、置き場所を制限する圧を作る。
 */
export function homingPursuit(S, o = {}) {
  const {
    n = 2, speed = 52, homingRate = rad(42), homingTime = 1.7,
    type = 'orb', color = 'coffee', r = 6, life = 8, spread = rad(26),
  } = o;
  for (let i = 0; i < n; i++) {
    const p = S.p(i);
    const a = S.aimFrom(p.x, p.y) + (i - (n - 1) / 2) * spread;
    S.B.spawn({
      x: p.x, y: p.y, speed: S.d.v(speed), angle: a, type, color, r,
      life: S.d.life(life), homingRate, homingTime,
    });
  }
  S.sound('charge', { vol: 0.32 });
  S.boss.onCharge(0.4);
}

/**
 * 【中心に安全地帯】大きな花。中心には弾が来ない。
 * 見た目が最も華やかで、かつ「中央に立てば安全」という分かりやすい回避ルートを持つ。
 * 他弾幕と重なると「いつ中央を離れるか」の判断になる。
 */
export function flowerSafe(S, o = {}) {
  const {
    n = 22, speed = 56, stagger = 0.75, type = 'orbBig', color = 'gold',
    r = 10, life = 9, turn = 0,
  } = o;
  const p = S.pt;
  S.safeCore({
    x: p.x, y: p.y, n, speed, stagger, type, color, r, life, turn,
    offset: rad(S.n * 11),
  });
  S.sound('beam_start', { vol: 0.30, rate: 1.25 });
  S.fx?.ring(p.x, p.y, { r0: 3, r1: 70, life: 0.8, color: '#fff3c0', width: 2 });
}

/**
 * 【対称弾幕】複数方向へ同時展開。
 * 縦横 4 方向 + 斜めの扇を同時に撃つ。左右対称なので「美しく、読める」。
 */
export function symmetricBurst(S, o = {}) {
  const {
    speed = 78, type = 'shard', color = 'magenta', r = 4.6, life = 9,
    lanes = 4, perLane = 5, spread = rad(24),
  } = o;
  const p = S.pt;
  const base = rad(S.n * 13);
  for (let l = 0; l < lanes; l++) {
    const a = base + (TAU / lanes) * l;
    S.fan({
      x: p.x, y: p.y, n: perLane, speed, angle: a, spread,
      type, color, r, life,
    });
  }
  S.sound('shot_heavy', { vol: 0.42 });
  S.glow(p.x, p.y, 12, '#ffd0ff');
}

/**
 * 【反射】左右の壁で跳ね返る弾。
 * 反射回数を 3 回に制限し、反射のたびにエフェクトを出すので軌道が読める。
 * 反射後は減速するため、終盤はほぼ静止して障害物になる。
 */
export function mirrorBullets(S, o = {}) {
  const {
    n = 7, speed = 130, type = 'orb', color = 'jade', r = 5.5,
    life = 12, bounce = 3, fromY = null,
  } = o;
  const y = fromY ?? S.pt.y;
  for (let i = 0; i < n; i++) {
    const a = rad(-70 - 40 * (i / Math.max(1, n - 1)));
    S.B.spawn({
      x: i % 2 === 0 ? FIELD.x + 6 : VIEW_W - FIELD.x - 6,
      y,
      speed: S.d.v(speed), angle: a, type, color, r,
      life: S.d.life(life), bounce, speedAccel: -6,
    });
  }
  S.sound('shot_medium', { vol: 0.4, rate: 0.85 });
}

/**
 * 【停滞→方向転換】その場に留まり、白く光ってから一斉に方向転換する。
 * 停滞中は当たり判定があるが動かないので、位置を確認して避けられる。
 * 「一定距離/一定時間で方向転換する弾」。
 */
export function holdAndTurn(S, o = {}) {
  const {
    n = 10, speed = 120, hold = 0.85, turnDeg = 90,
    type = 'arrow', color = 'cyan', r = 5, life = 10, radius = 0,
  } = o;
  const p = S.pt;
  S.turnAt({
    x: p.x, y: p.y, n, speed, hold: hold + (S.n % 2) * 0.18, turnDeg,
    type, color, r, life, radius,
  });
  S.sound('warn', { vol: 0.44 });
  S.fx?.ring(p.x, p.y, { r0: 8, r1: 60, life: hold, color: '#9ffff0', width: 1 });
}

/**
 * 【回転レーザー】一定間隔で回転するレーザー。
 * 必ず 1 秒の予告 (細い線) を出してから発射する。
 * 回転速度は 20〜34 度/秒に抑え、プレイヤーが回り込めるようにする。
 */
export function rotatingLasers(S, o = {}) {
  const {
    count = null, width = 13, spinDeg = 26, fireTime = 2.4,
    color = '#ff7aa8', colorCore = '#ffffff', warnTime = 1.0,
    angleOffset = 0, length = 900,
  } = o;
  const c = count ?? Math.max(2, Math.round(3 * (S.d.density > 1.1 ? 1.34 : 1)));
  const p = S.pt;
  for (let i = 0; i < c; i++) {
    const a = rad(angleOffset) + (TAU / c) * i;
    S.L.spawn({
      x: p.x, y: p.y, angle: a, width, length,
      warnTime, fireTime, fadeTime: 0.30,
      spin: rad(spinDeg) * (S.n % 2 === 0 ? 1 : -1),
      color, colorCore,
      origin: 'boss', follow: 'boss',
      offsetX: p.x - S.boss.x, offsetY: p.y - S.boss.y,
    });
  }
  S.sound('beam_start', { vol: 0.5 });
  S.boss.onCharge(0.7);
  S.fx?.ring(p.x, p.y, { r0: 4, r1: 42, life: warnTime, color: '#ffd8e4', width: 1 });
}

/**
 * 【一点狙いの扇】自機へ向けた扇。gap で中央が空く = 正面に逃げられる。
 * 「狙われている」圧力を与えつつ、必ず正面回避を許す。
 */
export function aimedVolley(S, o = {}) {
  const {
    n = 5, speed = 118, spread = rad(34), gap = rad(12),
    type = 'kunai', color = 'red', r = 5, life = 9, jitter = 0,
  } = o;
  const p = S.pt;
  S.fan({
    x: p.x, y: p.y, n, speed, angle: S.aimFrom(p.x, p.y), spread, gap,
    type, color, r, life, jitter,
  });
  S.sound('shot_heavy', { vol: 0.44 });
}

/**
 * 【高密度・低速の最終弾幕】
 * フェーズ終盤だけに出す。弾数は多いが遅いので「置かれた障害物を縫う」感覚になる。
 * 弾速 34〜46 px/s。回避は「読んで動く」ことで成立する。
 */
export function finaleBarrage(S, o = {}) {
  const {
    n = 30, speed = 40, type = 'orb', color = 'gold', r = 5.5,
    offsetStep = 7, life = 11, layers = 2,
  } = o;
  const p = S.pt;
  for (let l = 0; l < layers; l++) {
    S.ring({
      x: p.x, y: p.y, n: Math.max(6, n - l * 4), speed: speed * (1 + l * 0.22),
      type, color: l === 0 ? color : 'white', r, life,
      offset: rad(S.n * offsetStep + l * 12),
      delay: l * 0.24,
    });
  }
  S.sound('shot_medium', { vol: 0.34, rate: 0.8 });
}

/**
 * 【十字弾幕】✝ の記号を保ったまま飛ぶ弾。
 * 進行方向に回転させない (fixedAngle = 上向き) ので、常に ✝ に見える。
 * 作品の象徴を弾幕そのものに刻むためのパターン。
 */
export function crossRing(S, o = {}) {
  const {
    n = 12, speed = 70, type = 'cross', color = 'blood', r = 5.4,
    life = 10, offsetStep = 15, arms = 2,
  } = o;
  const p = S.pt;
  for (let a = 0; a < arms; a++) {
    S.ring({
      x: p.x, y: p.y, n, speed: speed * (a === 0 ? 1 : 0.82), type, color, r, life,
      offset: rad(S.n * offsetStep + a * (180 / arms)),
      delay: a * 0.22,
      fixedAngle: -Math.PI / 2,
    });
  }
  S.sound('shot_heavy', { vol: 0.42, rate: 0.92 });
  S.glow(p.x, p.y, 10, '#ffd8e0');
}

/**
 * 【視線】「目」の弾。常に自機の方を向いたまま飛ぶ。
 * 視線が合っている = 自分が観測されている、という演出。
 */
export function staringEyes(S, o = {}) {
  const {
    n = 5, speed = 62, type = 'eye', color = 'ash', r = 7, life = 9,
    radius = 60,
  } = o;
  const p = S.pt;
  const dir = S.aimFrom(p.x, p.y);
  for (let i = 0; i < n; i++) {
    const a = dir + (TAU / n) * i;
    const bx = p.x + Math.cos(a) * radius;
    const by = p.y + Math.sin(a) * radius;
    const toPlayer = Math.atan2(S.player.y - by, S.player.x - bx);
    S.B.spawn({
      x: bx, y: by, speed: S.d.v(speed), angle: a + Math.PI,
      type, color, r, life: S.d.life(life),
      visAngle: toPlayer,        // 自機を見つめ続ける
      homingRate: rad(20), homingTime: 2.2,
    });
  }
  S.sound('charge', { vol: 0.38, rate: 0.8 });
  S.fx?.ring(p.x, p.y, { r0: radius, r1: radius - 10, life: 0.4, color: '#bfcbee', width: 1 });
}

/**
 * 【重ね合わせ】逆回転する 2 本の螺旋。
 * 位相が合う瞬間とずれる瞬間があり「干渉縞」のように見える。
 * 隙間は常にどこかに存在し、プレイヤーは干渉で潰れた領域を避けて生き延びる。
 */
export function interferenceSpiral(S, o = {}) {
  const {
    count = 3, speed = 66, stepDeg = 34, arms = 3,
    type = 'orb', r = 5, life = 9, colorA = 'violet', colorB = 'white',
  } = o;
  const p = S.pt;
  S.spiral({
    x: p.x, y: p.y, count, stepDeg, arms, speed,
    type, color: colorA, r, life, startDeg: S.n * 7,
  });
  S.spiral({
    x: p.x, y: p.y, count, stepDeg: -stepDeg, arms, speed: speed * 0.92,
    type, color: colorB, r: r * 0.9, life,
    startDeg: 180 - S.n * 7,
  });
  S.sound('shot_small', { vol: 0.38 });
}

/**
 * 【収束】外周から中心へ向かう弾。中心は安全。
 * 収束した後は減速して滞留し、徐々に「壁」へ変わる。
 */
export function inwardConverge(S, o = {}) {
  const {
    n = 18, radius = 320, speed = 78, type = 'orb', r = 5, life = 8,
    color = 'ice', turn = 0,
  } = o;
  const p = S.pt;
  S.converge({
    x: p.x, y: p.y, radius, n, speed, type, color, r, life, turn,
    offset: rad(S.n * 8), inward: true,
  });
  S.sound('noise_sweep', { vol: 0.34 });
  S.boss.onCharge(0.5);
}

/* ================================================================== *
 * 擬似3D パターン
 *
 * カメラが後方視点のとき、y が奥行き・z が高さになる。
 * 当たり判定はスクリーン座標で行われるため、
 * 「画面上で見えている通りに避けられる」ことが保証される。
 * ================================================================== */

/**
 * 【3D トンネル】進行方向に垂直なリングをくぐる。
 * リングは画面では消失点を囲む輪として描かれ、中心の穴が回避ルート。
 * 軸 (axisX) がゆっくり動くので、プレイヤーは穴に合わせて左右に動く。
 */
export function tunnel3D(S, o = {}) {
  const {
    n = 14, speed = 150, radius = 84, axisX = null, z0 = 20,
    type = 'orb', color = 'ice', r = 6, life = 12, spreadZ = 1,
  } = o;
  const cx = axisX != null ? axisX : VIEW_W / 2 + Math.sin(S.t * 0.42) * 96;
  for (let i = 0; i < n; i++) {
    const a = (TAU / n) * i + S.n * 0.28;
    S.B.spawn({
      x: cx + Math.cos(a) * radius,
      y: -90,
      z: z0 + Math.sin(a) * radius * spreadZ,
      vx: 0, vy: S.d.v(speed), vz: 0,
      type, color, r: r, life: S.d.life(life),
    });
  }
  S.sound('shot_small', { vol: 0.34, rate: 0.9 });
}

/**
 * 【3D 回廊の壁】横一列の弾が奥から手前へ流れてくる。隙間を縫って進む。
 * 奥では小さく、手前で大きくなるので「迫ってくる」感覚が強い。
 * gapAt は 0..1 の割合で指定し、時間で動かすこともできる。
 */
export function wall3D(S, o = {}) {
  const {
    n = 15, speed = 165, span = 760, gapRatio = 0.5, gapWidth = 3,
    type = 'rice', color = 'blue', r = 5, life = 12, z = 0,
  } = o;
  const step = span / (n - 1);
  const gi = Math.round(gapRatio * (n - 1));
  for (let i = 0; i < n; i++) {
    if (i >= gi && i < gi + gapWidth) continue;
    S.B.spawn({
      x: VIEW_W / 2 - span / 2 + i * step,
      y: -80,
      z,
      vx: 0, vy: S.d.v(speed), vz: 0,
      type, color, r, life: S.d.life(life),
    });
  }
  S.sound('shot_medium', { vol: 0.38, rate: 0.88 });
}

/**
 * 【3D 星落とし】消失点付近から四方へ散る弾。
 * 奥から手前へ広がりながら迫るので、視界の端から中央へ流れが生まれる。
 */
export function starfall3D(S, o = {}) {
  const {
    n = 9, speed = 140, spreadX = 220, spreadZ = 160, type = 'star6',
    color = 'white', r = 6, life = 12, zBase = 10,
  } = o;
  const p = S.pt;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    S.B.spawn({
      x: p.x + t * spreadX * 0.6,
      y: -80,
      z: zBase + t * spreadZ,
      vx: t * 60, vy: S.d.v(speed), vz: -t * 16,
      type, color, r, life: S.d.life(life),
      spin: 0, fixedAngle: false,
    });
  }
  S.sound('cancel', { vol: 0.34, rate: 1.3 });
}

/**
 * 【3D 花】奥で開く大きな花。中心に安全地帯。
 * 2D 版の flowerSafe と対比させることで、3D の立体感を強調する。
 */
export function flower3D(S, o = {}) {
  const {
    n = 20, speed = 130, radius = 150, type = 'orbBig', color = 'violet',
    r = 8, life = 12, ringCount = 2,
  } = o;
  const cx = VIEW_W / 2 + Math.sin(S.t * 0.3) * 70;
  for (let k = 0; k < ringCount; k++) {
    const rr = radius * (1 + k * 0.42);
    for (let i = 0; i < n; i++) {
      const a = (TAU / n) * i + k * 0.3;
      S.B.spawn({
        x: cx + Math.cos(a) * rr,
        y: -90 - k * 20,
        z: Math.sin(a) * rr,
        vx: 0, vy: S.d.v(speed), vz: 0,
        type, color: k === 0 ? color : 'white', r,
        life: S.d.life(life), delay: k * 0.2,
      });
    }
  }
  S.sound('beam_start', { vol: 0.34, rate: 1.4 });
  S.fx?.addFlash(0.10, '#e8dcff');
}

/**
 * 【3D 回転レーザー】奥から手前へ伸びるビームが回転する。
 * 2D の回転レーザーより「空間を切り裂く」印象になる。
 */
export function rotatingLasers3D(S, o = {}) {
  const {
    count = 3, width = 12, spinDeg = 22, fireTime = 2.4,
    color = '#a98cff', colorCore = '#ffffff',
    warnTime = 1.05, angleOffset = 0,   // angleOffset は「度」
  } = o;
  const p = S.pt;
  for (let i = 0; i < count; i++) {
    S.L.spawn({
      x: p.x, y: p.y, z: 40,
      angle: rad(90 + angleOffset + (360 / count) * i),
      width, length: 1000,
      warnTime, fireTime, fadeTime: 0.3,
      spin: rad(spinDeg) * (S.n % 2 === 0 ? 1 : -1),
      color, colorCore,
      origin: 'fixed',
    });
  }
  S.sound('beam_start', { vol: 0.5 });
  S.boss.onCharge(0.7);
}

/**
 * 【3D 螺旋】奥から螺旋状にねじれて迫る。
 * 位相が回るので、プレイヤーは「ねじれの谷」を探して動く。
 */
export function spiral3D(S, o = {}) {
  const {
    count = 4, speed = 155, arms = 2, radius = 110, radiusStep = 12,
    type = 'kunai', color = 'cyan', r = 5.5, life = 12,
  } = o;
  for (let i = 0; i < count; i++) {
    const ph = (S.n * count + i) * 0.36;
    const rr = radius + Math.sin(ph * 0.7) * radiusStep * 3;
    for (let a = 0; a < arms; a++) {
      const ang = ph + (TAU / arms) * a;
      S.B.spawn({
        x: VIEW_W / 2 + Math.cos(ang) * rr,
        y: -80 - i * 26,
        z: Math.sin(ang) * rr,
        vx: 0, vy: S.d.v(speed), vz: 0,
        type, color, r, life: S.d.life(life),
        visAngle: Math.PI / 2,
      });
    }
  }
  S.sound('shot_small', { vol: 0.32, rate: 1.05 });
}

/* ================================================================== *
 * 幕開け / 締め の演出用
 * ================================================================== */

/** フェーズ開始の「間」。弾を出さずに光と音だけで次を予告する。 */
export function phaseTelegraph(S, o = {}) {
  const { color = '#ffffff', strength = 1 } = o;
  S.boss.onCharge(1.2 * strength);
  S.fx?.addFlash(0.14 * strength, color);
  S.fx?.ring(S.boss.x, S.boss.y, {
    r0: 6, r1: 150 * strength, life: 0.65, color, width: 2,
  });
  S.sound('phase_in', { vol: 0.5 });
}

/** フェーズ終盤の「時が満ちる」演出 */
export function phaseClimax(S, o = {}) {
  const { color = '#ffffff' } = o;
  S.fx?.addFlash(0.22, color);
  S.fx?.addShake(2.2);
  S.fx?.ring(S.boss.x, S.boss.y, {
    r0: 4, r1: 220, life: 0.8, color, width: 3,
  });
  S.sound('phase_break', { vol: 0.5 });
  S.boss.onCharge(1.0);
}
