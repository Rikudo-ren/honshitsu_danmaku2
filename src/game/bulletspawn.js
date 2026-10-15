/**
 * bulletspawn.js — 弾幕の「語彙」
 *
 * 各弾幕はこの関数群を組み合わせて記述する。すべて以下の設計項目を
 * 明示できるようにしてある:
 *   発射位置 / 弾速 / 発射間隔 / 軌道の変化 / 持続時間 / 回避ルート / 視覚的な予告
 *
 * 難易度補正 (density / speed / safe) は呼び出し側 (patterns) が責任を持って行う。
 * ここでは「指定された通りの幾何」を正確に生成することだけを担う。
 */

import { TAU, rad } from '../core/util.js';

/** 目標への角度 */
export function aimAt(fromX, fromY, tx, ty) {
  return Math.atan2(ty - fromY, tx - fromX);
}

/** 目標への角度に「ばらつき」を加える (狙いが完全でない方が避けやすい) */
export function aimSpread(fromX, fromY, tx, ty, spread = 0) {
  return aimAt(fromX, fromY, tx, ty) + (Math.random() * 2 - 1) * spread;
}

/**
 * 全方位リング。offset で角度をずらし、複数段を重ねると
 * 「回転しているように見える壁」を作れる。
 */
export function ring(B, o) {
  const {
    x, y, n, speed, offset = 0, type = 'orb', color = 'white', r, scale = 1,
    turn = 0, speedAccel = 0, life = 8, minSpeed = 0, maxSpeed = 1e9,
    homingRate = 0, homingTime = 0, bounce = 0, delay = 0, z = 0, vz = 0,
    fixedAngle = null,      // 数値を指定すると全弾その向きのまま飛ぶ (回転しない弾)
  } = o;
  const step = TAU / n;
  for (let i = 0; i < n; i++) {
    const a = offset + step * i;
    B.spawn({
      x, y, z, speed, angle: a,
      type, color, r, scale, turn, speedAccel, life, minSpeed, maxSpeed,
      homingRate, homingTime, bounce, delay, vz,
      visAngle: fixedAngle,
    });
  }
}

/**
 * 螺旋。段ごとに角度を進める。「回転しながら弾が出続ける」表現。
 */
export function spiral(B, o) {
  const {
    x, y, count, stepDeg, startDeg = 0, arms = 1, arcs = 1, speed,
    type = 'orb', color = 'white', r, scale = 1, turn = 0, life = 8,
    speedAccel = 0, minSpeed = 0, maxSpeed = 1e9,
    homingRate = 0, homingTime = 0, delay = 0, z = 0, vz = 0, fixedAngle = null,
  } = o;
  const step = rad(stepDeg);
  for (let i = 0; i < count; i++) {
    const base = rad(startDeg) + step * i;
    for (let arm = 0; arm < arms; arm++) {
      const a = base + (TAU / arms) * arm;
      B.spawn({
        x, y, z, speed, angle: a, type, color, r, scale,
        turn, life, speedAccel, minSpeed, maxSpeed,
        homingRate, homingTime, delay, vz, visAngle: fixedAngle,
      });
    }
  }
}

/**
 * 扇。中心角から左右へ spread/2 ずつ広げる。
 * gap を指定すると中央に安全地帯 (回避ルート) が空く。
 */
export function fan(B, o) {
  const {
    x, y, n, speed, angle, spread = rad(60), gap = 0,
    type = 'orb', color = 'white', r, scale = 1, turn = 0,
    speedAccel = 0, life = 8, minSpeed = 0, maxSpeed = 1e9,
    homingRate = 0, homingTime = 0, delay = 0, z = 0, vz = 0,
    jitter = 0, fixedAngle = null,
  } = o;
  const half = spread / 2;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    let a = angle - half + spread * t;
    if (gap > 0) {
      // 中央を削る: |a-angle| < gap/2 の弾はスキップ
      if (Math.abs(a - angle) < gap / 2) continue;
    }
    a += (Math.random() * 2 - 1) * jitter;
    B.spawn({
      x, y, z, speed, angle: a, type, color, r, scale,
      turn, speedAccel, life, minSpeed, maxSpeed,
      homingRate, homingTime, delay, vz, visAngle: fixedAngle,
    });
  }
}

/**
 * 壁。一直線上に弾を並べ、隙間を 1 つ以上空ける。
 * gapCount 個の隙間を、位置 (0..1) で指定する。
 * 「壁を作り、隙間だけを通す弾幕」の中核。
 */
export function wall(B, o) {
  const {
    n, speed, angle, gapAt, gapWidth = 1, // gapAt: 弾何個分の位置に穴を開けるか (配列可)
    originX, originY, normalOffset = 0,
    type = 'orb', color = 'white', r, scale = 1,
    life = 8, speedAccel = 0, turn = 0, curve = 0,
    type2 = null, color2 = null, fixedAngle = null,
  } = o;
  const gaps = Array.isArray(gapAt) ? gapAt : [gapAt];
  const step = 24;  // 弾間隔 (px)
  const perp = angle + Math.PI / 2;
  const total = (n - 1) * step;
  for (let i = 0; i < n; i++) {
    let skip = false;
    for (const g of gaps) {
      for (let k = 0; k < gapWidth; k++) {
        if (i === g + k) skip = true;
      }
    }
    if (skip) continue;
    const off = -total / 2 + i * step;
    const x = originX + Math.cos(perp) * off + Math.cos(angle) * normalOffset;
    const y = originY + Math.sin(perp) * off + Math.sin(angle) * normalOffset;
    const useT = (type2 && i % 2 === 1) ? type2 : type;
    const useC = (color2 && i % 2 === 1) ? color2 : color;
    B.spawn({
      x, y, speed, angle, type: useT, color: useC, r, scale,
      life, speedAccel, turn, visAngle: fixedAngle,
    });
  }
}

/**
 * 二重螺旋 (対称弾幕)。arms 本の腕を同時に回す。
 */
export function doubleSpiral(B, o) {
  spiral(B, { ...o, arms: o.arms ?? 2 });
}

/**
 * 開閉弾幕。時間で扇の角度を広げたり閉じたりするのは呼び出し側のタイムラインで行い、
 * ここでは「ある瞬間の扇」を作る fan を使う。
 */

/**
 * 一点集中型: プレイヤー方向に n 発を連続で。
 */
export function aimedFan(B, o) {
  const { x, y, tx, ty, ...rest } = o;
  const angle = aimAt(x, y, tx, ty);
  fan(B, { x, y, angle, ...rest });
}

/**
 * 収束 / 拡散する弾幕。全弾がリング状に並び、旋回して中央へ集まる
 * (あるいは中央から広がる)。中心付近に安全地帯が生まれる。
 */
export function converge(B, o) {
  const {
    x, y, radius, n, speed, offset = 0, inward = true,
    type = 'orbBig', color = 'violet', r, scale = 1, life = 8,
    turn = 0, delay = 0, z = 0, fixedAngle = null,
  } = o;
  for (let i = 0; i < n; i++) {
    const a = offset + (TAU / n) * i;
    const bx = x + Math.cos(a) * radius;
    const by = y + Math.sin(a) * radius;
    // 中心へ向かう = 内向き
    const dir = inward ? a + Math.PI : a;
    B.spawn({
      x: bx, y: by, z, speed, angle: dir, type, color, r, scale,
      life, turn, delay, visAngle: fixedAngle,
    });
  }
}

/**
 * 交差弾幕 (X字)。2 本の線が交差する。
 */
export function crossFire(B, o) {
  const { x, y, n, speed, angle, separation, ...rest } = o;
  fan(B, { x, y, n, speed, angle, spread: 0, ...rest });
  fan(B, { x, y, n, speed, angle: angle + Math.PI, spread: 0, ...rest });
}

/**
 * 時間差連鎖弾幕。delay をずらしたリングを多段的に撃つ。
 */
export function chainRing(B, o) {
  const {
    x, y, stages, perStage, speed, offsetStep = 6, delayStep = 0.28,
    type = 'orb', color = 'white', r, scale = 1, life = 8,
    turn = 0, speedAccel = 0, colors = null,
  } = o;
  for (let s = 0; s < stages; s++) {
    ring(B, {
      x, y, n: perStage, speed: speed + s * (o.speedRamp ?? 0),
      offset: rad(offsetStep) * s * (o.offsetDir ?? 1),
      type, color: colors ? colors[s % colors.length] : color,
      r, scale, life, turn, speedAccel, delay: delayStep * s,
    });
  }
}

/**
 * 境界反射弾。bounce 回数だけ壁で跳ね返る。
 */
export function bounceBullets(B, o) {
  const { x, y, n, speed, offset = 0, bounce = 3, ...rest } = o;
  for (let i = 0; i < n; i++) {
    const a = offset + (TAU / n) * i;
    B.spawn({ x, y, speed, angle: a, bounce, ...rest });
  }
}

/** 弾を 1 発だけ、正確に狙って撃つ */
export function aimedShot(B, o) {
  const { x, y, tx, ty, ...rest } = o;
  B.spawn({ x, y, angle: aimAt(x, y, tx, ty), ...rest });
}

/**
 * 「美しいが中心に安全地帯がある弾幕」。
 * 大きなリングの内側に弾が来ないので中央に立てば安全。
 * stagger で 1 発ずつ時間差発射し、花が開くように見せる。
 */
export function safeCore(B, o) {
  const {
    x, y, n, speed, offset = 0, stagger = 0.5,
    type = 'orb', color = 'gold', r, scale = 1, life = 8,
    delay = 0, turn = 0, z = 0,
  } = o;
  for (let i = 0; i < n; i++) {
    const a = offset + (TAU / n) * i;
    B.spawn({
      x, y, z, speed, angle: a, type, color, r, scale, life, turn,
      delay: delay + (i / n) * stagger,
    });
  }
}

/**
 * 「一定時間その場に留まり、その後方向転換して飛ぶ弾」。
 * 停滞中は白く点滅するので、プレイヤーは「これから動く」と判断できる。
 * 回避ルートは停滞位置の間隙として生まれる。
 */
export function turnAt(B, o) {
  const {
    x, y, n, speed, offset = 0, hold = 0.85, turnDeg = 90,
    type = 'arrow', color = 'cyan', r, scale = 1, life = 10,
    radius = 0, holdSpread = 0,
  } = o;
  for (let i = 0; i < n; i++) {
    const a = offset + (TAU / n) * i;
    const bx = x + Math.cos(a) * radius;
    const by = y + Math.sin(a) * radius;
    B.spawn({
      x: bx, y: by, speed: 0, angle: a, type, color, r, scale, life,
      hold: hold + (holdSpread ? ((i / n) - 0.5) * holdSpread : 0),
      afterHold: { speed, angleDelta: rad(turnDeg) },
      visAngle: a,
    });
  }
}

/**
 * 予告付きの壁。視覚的な予告として「薄い弾」を先に置き、
 * 本命の弾が遅れて同じ場所に現れる。
 * ※予告は patterns 側で ring/wall を薄い色で先撃ちするのが基本だが、
 *   ここでは delay 付きの壁を返して 1 関数で完結させる。
 */
export function telegraphedWall(B, o) {
  const { telegraphDelay = 0.55, ...rest } = o;
  wall(B, { ...rest, delay: telegraphDelay });
}
