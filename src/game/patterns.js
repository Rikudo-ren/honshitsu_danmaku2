/* =============================================================================
 * src/game/patterns.js — 弾幕パターン集
 *
 *  各パターンは「発射位置・弾速・発射間隔・軌道の変化・持続時間・回避ルート・
 *  視覚的予告・フェーズ内での役割・原作テーマ」をすべて設計したうえで実装する。
 *
 *  【共通の公平性規則】
 *   ／ 画面外から出す弾は spawnFromEdge を使い、必ず予告マーカーを伴う
 *   ／ 壁系は必ず安全な隙間を計算して配置する（safe() で難易度に応じ拡縮）
 *   ／ 弾速は dif.v() を通し、難易度ごとの上限を超えない
 *   ／ 1 パターンは 20〜40 秒で「展開→発展→収束」の流れを持つ
 * ========================================================================== */
'use strict';

const PATTERNS = {};

/** パターン登録: cfg = {name, jp, novel, tags, make(dif) -> {update(dt,ctx)}} */
function defPattern(key, cfg) { cfg.key = key; PATTERNS[key] = cfg; }

/* --------------------------------------------------------------- 補助 ----- */
const { TAU: _TAU, lerp: _lerp, mod: _mod } = window.HN;
const d0 = (v) => (Number.isFinite(v) ? Math.floor(v) : 0);

/** 周期的に「発射の刻」か判定するタイマー */
class Tick {
  constructor(iv) { this.iv = iv; this.t = 0; this.n = 0; }
  update(dt) { this.t += dt; if (this.t >= this.iv) { this.t -= this.iv; this.n++; return true; } return false; }
  reset(iv) { this.t = 0; this.n = 0; if (iv) this.iv = iv; }
}

/* =========================================================================
 * 1. 円形拡散 — 南棟と北棟、区分けと見えない壁
 *    原作: 「この『十』が…見えない壁を作っている」
 * ======================================================================= */
defPattern('ringsNavy', {
  name: 'ringsNavy', jp: '区分けの輪', novel: '序 桐葉高校という二重構造',
  tags: ['円形拡散', '読める'],
  make(dif) {
    const tk = new Tick(dif.iv(1.15));
    const t2 = new Tick(dif.iv(3.4));
    let ring = 0;
    return {
      update(dt, ctx) {
        // 本体: 均等な円形拡散（必ず隙間が均等に存在する）
        if (tk.update(dt)) {
          const n = dif.n(14 + (ring % 3) * 3);
          const base = ctx.rand() * _TAU + ring * 0.31;
          ring++;
          for (let i = 0; i < n; i++) {
            const a = base + (i / n) * _TAU;
            ctx.sys.spawn({
              x: ctx.bx, y: ctx.by, ang: a, speed: dif.v(78 + (ring % 4) * 6),
              type: ring % 2 ? 'riceNavy' : 'riceEnji',
              life: 14, av: (ring % 2 ? 1 : -1) * 0.16, glow: .8,
            });
          }
          ctx.sfx('shot');
        }
        // 内省: 遅い第二波が外側から内側へ重なる（密度の重なり）
        if (t2.update(dt)) {
          const n = dif.n(10);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * _TAU + 0.2;
            ctx.sys.spawn({
              x: ctx.bx, y: ctx.by, ang: a, speed: dif.v(46), type: 'riceCream',
              life: 16, av: -0.1, glow: .6,
            });
          }
          ctx.sfx('shot');
        }
      },
    };
  },
});

/* =========================================================================
 * 2. 螺旋弾幕 — 理数科のえんじが二重に巻く
 *    原作: 「内進は紺、理数科はえんじ」
 * ======================================================================= */
defPattern('spiralEnji', {
  name: 'spiralEnji', jp: '二重螺旋', novel: '第一〜二章（制服と偏差値）',
  tags: ['螺旋', '高密度'],
  make(dif) {
    const tk = new Tick(dif.iv(0.085));
    let a = 0;
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        const arms = dif.n(2);
        a += 0.38;
        for (let k = 0; k < arms; k++) {
          const base = a + (k / arms) * _TAU;
          // 外へ向かう正巻き
          ctx.sys.spawn({
            x: ctx.bx, y: ctx.by, ang: base, speed: dif.v(96), type: 'riceEnji',
            life: 8.0, av: 0.20, glow: .7,
          });
          // 内へ戻る逆巻き（重なるが必ず隙間が動く）
          ctx.sys.spawn({
            x: ctx.bx, y: ctx.by, ang: -base * 0.86, speed: dif.v(70), type: 'riceNavy',
            life: 8.0, av: -0.16, glow: .6,
          });
        }
        if (tk.n % 12 === 0) ctx.sfx('shot');
      },
    };
  },
});

/* =========================================================================
 * 3. 回転レーザー — 糸魚川-静岡構造線
 *    原作: 「ここを境に日本列島の地質が変わる」
 * ======================================================================= */
defPattern('laserBoundary', {
  name: 'laserBoundary', jp: '構造線', novel: '第二章 火曜三限、味噌の地政学',
  tags: ['レーザー', '回転', '壁'],
  make(dif) {
    // 発射間隔は「警告+発光+余白」より必ず長くする。
    // これを守らないとレーザーが常時重なり、レーザーの無い安全な時間が消える。
    const WARN = 1.5, FIRE = 1.25, GAP = 1.15;
    const tk = new Tick(dif.iv(WARN + FIRE + GAP));
    let n = 0;
    return {
      update(dt, ctx) {
        if (tk.update(dt)) {
          const arms = Math.max(2, dif.n(2));
          const dir = (n % 2 ? 1 : -1);
          for (let i = 0; i < arms; i++) {
            const a0 = (i / arms) * _TAU + n * 0.55;
            ctx.sys.spawnLaser({
              x: ctx.bx, y: ctx.by, ang: a0, width: 12,
              warnDur: WARN, fireDur: FIRE, fadeDur: 0.3,
              rotate: dir * 0.20, length: 1600,
              ramp: ctx.ramp, onFire: () => ctx.sfx('laser'),
            });
          }
          ctx.sfx('warn');
          n++;
        }
        // レーザーを避けながら隙間を通るための低速弾
        if (tk.n % 2 === 1 && Math.random() < dt * 3.2) {
          const n2 = dif.n(6);
          for (let i = 0; i < n2; i++) {
            ctx.sys.spawn({
              x: ctx.bx + Math.cos((i / n2) * _TAU) * 30,
              y: ctx.by + Math.sin((i / n2) * _TAU) * 30,
              ang: (i / n2) * _TAU + 0.5, speed: dif.v(58), type: 'riceCyan',
              life: 9, glow: .7,
            });
          }
        }
      },
    };
  },
});

/* =========================================================================
 * 4. 隙間のある壁 — 味噌の境界線
 *    原作: 「味噌の分布が地質境界線と重なってる」
 * ======================================================================= */
defPattern('wallMiso', {
  name: 'wallMiso', jp: '味噌の境界', novel: '第二章 火曜三限、味噌の地政学',
  tags: ['壁', '隙間通過'],
  make(dif) {
    const tk = new Tick(dif.iv(1.5));
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        const dir = (tk.n % 2) ? 1 : -1;          // 上から／下から交互
        const cols = dif.n(11);
        // 安全な隙間の位置（難易度で幅が変わる）
        const gapW = Math.max(1, Math.min(cols - 2, Math.round(dif.safe(2.1))));
        const slots = Math.max(1, cols - 1 - gapW);
        const gapC = d0((tk.n * 3 + Math.floor(ctx.rand() * 4)) % slots) + 1;
        const y0 = dir > 0 ? -18 : ctx.H + 18;
        const sp = dif.v(92);
        for (let i = 0; i < cols; i++) {
          if (i >= gapC && i < gapC + gapW) continue;   // ← 目に見える隙間
          const x = (i + 0.5) / cols * ctx.W;
          ctx.sys.spawnFromEdge({
            x, y: y0, ang: dir > 0 ? Math.PI / 2 : -Math.PI / 2, speed: sp,
            type: i % 2 ? 'miso' : 'riceMiso', life: 12, warnDur: 0.7, ramp: ctx.ramp,
          });
        }
        ctx.sfx('warn');
      },
    };
  },
});

/* =========================================================================
 * 5. 開閉弾幕 — コーンスープの不在と帰還
 *    原作: 第十二章「三学期・コーンスープの帰還」
 * ======================================================================= */
defPattern('gateCorn', {
  name: 'gateCorn', jp: '自販機の蓋', novel: '第十二章 三学期・コーンスープの帰還',
  tags: ['開閉', '溜め'],
  make(dif) {
    const tk = new Tick(dif.iv(2.6));
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        const closed = (tk.n % 2) === 0;
        const arms = dif.n(8);
        if (closed) {
          // 閉: 全方位を塞ぐが、旋回して必ず開く
          for (let i = 0; i < arms; i++) {
            const a = (i / arms) * _TAU + tk.n * 0.2;
            for (let k = 0; k < 2; k++) {
              ctx.sys.spawn({
                x: ctx.bx, y: ctx.by, ang: a + k * 0.12, speed: dif.v(72),
                type: 'riceGold',
                life: 11, av: 0.34, glow: .8,
              });
            }
          }
          ctx.sfx('shot_big');
        } else {
          // 開: 中心からゆっくり広がる輪。中心付近が手薄になる
          const n = dif.n(18);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * _TAU;
            ctx.sys.spawn({
              x: ctx.bx, y: ctx.by, ang: a, speed: dif.v(40), type: 'riceGold',
              life: 13, acc: 26, glow: .9,
            });
          }
          ctx.sfx('shot');
        }
      },
    };
  },
});

/* =========================================================================
 * 6. 追尾弾 — 三重県臣の「は？」（緩やかに追いすがる）
 *    原作: 「三重は……否定しながら聞いてる」
 * ======================================================================= */
defPattern('chaserMie', {
  name: 'chaserMie', jp: '冷笑の追尾', novel: '第七章 三重県臣が冷笑を失う日',
  tags: ['追尾', '圧'],
  make(dif) {
    const tk = new Tick(dif.iv(1.05));
    const side = new Tick(dif.iv(0.9));
    return {
      update(dt, ctx) {
        if (tk.update(dt)) {
          const n = dif.n(3);
          for (let i = 0; i < n; i++) {
            const a = ctx.aim() + (i - (n - 1) / 2) * 0.44;
            ctx.sys.spawn({
              x: ctx.bx, y: ctx.by, ang: a, speed: dif.v(62), type: 'chaser',
              behavior: 'homing', turnRate: dif.turn(0.78), track: true,
              acc: 10, life: 7.2, glow: .8,
            });
          }
          ctx.sfx('shot');
        }
        // 追尾をいなしやすいよう、低速の粒を撒いて逃げ道を作る
        if (side.update(dt)) {
          const n = dif.n(5);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * _TAU + ctx.t * 0.7;
            ctx.sys.spawn({
              x: ctx.bx, y: ctx.by, ang: a, speed: dif.v(48), type: 'pellet',
              life: 10, av: 0.3,
            });
          }
        }
      },
    };
  },
});

/* =========================================================================
 * 7. 一定距離で方向転換 — 台地の縁で折れる道
 *    原作: 「台地の縁だ。台地の上と下で集落の形が違う」
 * ======================================================================= */
defPattern('turnTerrace', {
  name: 'turnTerrace', jp: '台地の縁', novel: '第十二章 同じ地形図の再読',
  tags: ['方向転換', '読み'],
  make(dif) {
    const tk = new Tick(dif.iv(1.25));
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        const n = dif.n(10);
        const base = ctx.aim();
        for (let i = 0; i < n; i++) {
          const a = base + (i / (n - 1) - 0.5) * 1.5;
          ctx.sys.spawn({
            x: ctx.bx, y: ctx.by, ang: a, speed: dif.v(104), type: 'terrace',
            behavior: 'turnAtBase',
            turnDelay: 0.55,
            turnAmount: (i % 2 ? 1 : -1) * (Math.PI / 2) * dif.safe(1),
            turnSpeed: dif.v(74),
            life: 11, glow: .5,
          });
        }
        ctx.sfx('shot_big');
      },
    };
  },
});

/* =========================================================================
 * 8. 反射弾 — 地形図の向こう側
 *    原作: 「地形図の向こう側が見えてるんだよ」
 * ======================================================================= */
defPattern('reflectArena', {
  name: 'reflectArena', jp: '反射する地形', novel: '第七章 地形図の向こう側',
  tags: ['反射', '長期滞在'],
  make(dif) {
    const tk = new Tick(dif.iv(1.7));
    const tk2 = new Tick(dif.iv(0.9));
    return {
      update(dt, ctx) {
        if (tk.update(dt)) {
          const n = dif.n(6);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * _TAU + ctx.t * 0.23;
            ctx.sys.spawn({
              x: ctx.bx, y: ctx.by, ang: a, speed: dif.v(122), type: 'reflector',
              behavior: 'reflect', maxBounces: 2, life: 8.5, glow: .8,
            });
          }
          ctx.sfx('shot_big');
        }
        if (tk2.update(dt)) {
          const n = dif.n(3);
          for (let i = 0; i < n; i++) {
            const a = ctx.aim() + (i - (n - 1) / 2) * 0.7;
            ctx.sys.spawn({
              x: ctx.bx, y: ctx.by, ang: a, speed: dif.v(70), type: 'pellet',
              behavior: 'reflect', maxBounces: 2, life: 7.5,
            });
          }
        }
      },
    };
  },
});

/* =========================================================================
 * 9. 対称弾幕 — 内進と理数科の対比
 *    原作: 「ネクタイの色の差——内進は紺、理数科はえんじ」
 * ======================================================================= */
defPattern('symmetryTies', {
  name: 'symmetryTies', jp: '対のネクタイ', novel: '序 / 第一章',
  tags: ['対称', '美'],
  make(dif) {
    const tk = new Tick(dif.iv(0.62));
    const arms = Math.max(2, dif.n(3));
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        const spin = (tk.n % 2 ? 1 : -1);
        const rot = ctx.t * 0.42 * spin;
        for (let i = 0; i < arms; i++) {
          const a = rot + (i / arms) * _TAU;
          // 紺とえんじの対。腕ごとに必ず反対側が空くよう 2 発ずつに留める。
          ctx.sys.spawn({
            x: ctx.bx, y: ctx.by, ang: a, speed: dif.v(84), type: 'riceNavy',
            life: 7.2, av: 0.06 * spin, glow: .75,
          });
          ctx.sys.spawn({
            x: ctx.bx, y: ctx.by, ang: a + Math.PI / arms, speed: dif.v(84),
            type: 'riceEnji', life: 7.2, av: -0.06 * spin, glow: .75,
          });
        }
        if (tk.n % 8 === 0) ctx.sfx('shot');
      },
    };
  },
});

/* =========================================================================
 * 10. 時間差連鎖 — 本質配信の投稿が遅れて届く
 *    原作: 第三章「本質配信、始動」「時間差で発射される連鎖弾幕」
 * ======================================================================= */
defPattern('chainDelay', {
  name: 'chainDelay', jp: '遅れて届く投稿', novel: '第三章 本質配信、始動',
  tags: ['時間差', '連鎖'],
  make(dif) {
    const tk = new Tick(dif.iv(2.0));
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        const n = dif.n(9);
        const base = ctx.aim();
        for (let i = 0; i < n; i++) {
          const a = base + (i / (n - 1) - 0.5) * 1.9 - 0.3;
          const d = i * 0.16;               // ← 時間差で連鎖
          ctx.sys.spawn({
            x: ctx.bx, y: ctx.by, ang: a, speed: dif.v(84), type: 'riceGold',
            life: 12, delay: d, thenSpeed: dif.v(84), glow: .85,
          });
        }
        ctx.sfx('charge');
        // 連鎖が終わったころに反対側から同期した輪
        for (let i = 0; i < dif.n(6); i++) {
          const a = (i / dif.n(6)) * _TAU;
          ctx.sys.spawn({
            x: ctx.bx, y: ctx.by, ang: a, speed: dif.v(74), type: 'riceCream',
            life: 12, delay: n * 0.16 + 0.2, thenSpeed: dif.v(74), glow: .7,
          });
        }
      },
    };
  },
});

/* =========================================================================
 * 11. 中心に安全地帯 — ハワイの溶岩台地（中央火口）
 *    原作: 第九章「ハワイの✝本質✝」溶岩台地の真ん中
 * ======================================================================= */
defPattern('safeCenterCaldera', {
  name: 'safeCenterCaldera', jp: '火口', novel: '第九章（溶岩台地の比喩）',
  tags: ['安全地帯', '美', '見せる'],
  make(dif) {
    const tk = new Tick(dif.iv(1.3));
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        const R = dif.safe(84);
        const n = dif.n(26);
        // 安全地帯の円周から外へ向かう（中心が空く）
        for (let i = 0; i < n; i++) {
          const a = (i / n) * _TAU + tk.n * 0.13;
          const sp = dif.v(56);
          ctx.sys.spawn({
            x: ctx.bx + Math.cos(a) * R, y: ctx.by + Math.sin(a) * R,
            ang: a, speed: sp, type: 'riceMiso',
            life: Math.max(3, (ctx.H * 0.7) / Math.max(1, sp) * 3),
            glow: .55,
          });
        }
        ctx.sfx('shot');
        // そのうえで中心へ向かって落ちてくる「火の粉」（中心は危ない瞬間がある）
        // 火の粉は外周から外へ流れるだけにして、中心の安全地帯を守る
        for (let i = 0; i < dif.n(4); i++) {
          const a = (i / Math.max(1, dif.n(4))) * _TAU + tk.n * 0.7;
          const rr = R * 1.55;
          ctx.sys.spawn({
            x: ctx.bx + Math.cos(a) * rr, y: ctx.by + Math.sin(a) * rr,
            ang: a, speed: dif.v(52), type: 'pellet', life: 5.5, acc: 22,
          });
        }
      },
    };
  },
});

/* =========================================================================
 * 12. 等高線の波 — 線が読めると地形が見える
 *    原作: 「等高線の一本に測量した人間の足跡がある」
 * ======================================================================= */
defPattern('contourWaves', {
  name: 'contourWaves', jp: '等高線', novel: '第十二章 同じ地形図を三度見る',
  tags: ['線', '読解', '美'],
  make(dif) {
    const tk = new Tick(dif.iv(1.15));
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        // 画面の片側から「等高線の壁」が掃引してくる。必ず隙間が 1 本空いている。
        // 全幅に瞬間出現させない（＝プレイヤーが接近を見てから動ける）。
        const rows = dif.n(6);
        const gapH = Math.max(1, Math.round(dif.safe(1.7)));
        const slotsR = Math.max(1, rows - gapH);
        const gapRow = (tk.n * 3) % slotsR;
        const fromLeft = tk.n % 2 === 0;
        const sp = dif.v(96);
        for (let r = 0; r < rows; r++) {
          if (r >= gapRow && r < gapRow + gapH) continue;   // ← 動ける隙間
          const y = ((r + 0.5) / rows) * ctx.H;
          // 進行方向へ 3 列ぶんの厚みだけ置き、壁そのものが移動する
          for (let k = 0; k < 3; k++) {
            const off = k * 26;
            ctx.sys.spawn({
              x: fromLeft ? -18 - off : ctx.W + 18 + off, y,
              ang: fromLeft ? 0 : Math.PI, speed: sp,
              type: 'contour', life: 9,
            });
          }
        }
        ctx.sfx('shot_big');
      },
    };
  },
});

/* =========================================================================
 * 13. 段丘の階段 — 上から掘り下げる地形
 *    原作: 「勝也は逆だ。上から描く。今の地表から始めて、過去に向かって掘り下げていく」
 * ======================================================================= */
defPattern('terraceStairs', {
  name: 'terraceStairs', jp: '段丘を掘る', novel: '第四章 金曜五限はいつも死んでいる',
  tags: ['階段', 'リズム'],
  make(dif) {
    const tk = new Tick(dif.iv(0.42));
    let step = 0;
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        // 下へ降りる段。段ごとに左右が入れ替わる。
        // 段は左右の外側から進入する。段の高さが交互に変わりリズムを作る。
        const n = dif.n(7);
        const y = 44 + ((step * 31) % (ctx.H - 88));
        const fromLeft = step % 2 === 0;
        const ang = fromLeft ? 0.06 : Math.PI - 0.06;
        for (let i = 0; i < n; i++) {
          const x = fromLeft ? -18 - i * 22 : ctx.W + 18 + i * 22;
          ctx.sys.spawn({
            x, y, ang, speed: dif.v(96), type: 'terrace', life: 8.4, glow: .45,
          });
        }
        if (step % 8 === 7) ctx.sfx('shot');
        else if (step % 2 === 0) ctx.sfx('shot');
        step++;
      },
    };
  },
});

/* =========================================================================
 * 14. 星空 — 天文学フォーラム / 寺地の配信
 *    原作: 「昼でも星はある。太陽が明るすぎて見えないだけ」
 * ======================================================================= */
defPattern('starfield', {
  name: 'starfield', jp: '昼の星', novel: '第三章 / 第十章（天文学フォーラム）',
  tags: ['星', '減速', '美'],
  make(dif) {
    const tk = new Tick(dif.iv(0.55));
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        const n = dif.n(5);
        const a0 = ctx.t * 0.4;
        for (let i = 0; i < n; i++) {
          const a = a0 + (i / n) * _TAU;
          ctx.sys.spawn({
            x: ctx.bx, y: ctx.by, ang: a, speed: dif.v(150), type: 'star',
            life: 5.0, acc: -26, glow: 1,
          });
          ctx.sys.spawn({
            x: ctx.bx, y: ctx.by, ang: a + 0.31, speed: dif.v(120), type: 'pellet',
            life: 5.0, acc: -18,
          });
        }
        if (tk.n % 4 === 0) ctx.sfx('shot');
      },
    };
  },
});

/* =========================================================================
 * 15. ✝ 十字花 — 原作の中心記号が花のように開く
 *    原作: 全編を通した ✝本質✝ の記号
 * ======================================================================= */
defPattern('crossFlower', {
  name: 'crossFlower', jp: '✝の花', novel: '全編（✝本質✝の記号）',
  tags: ['十字', '象徴', '美'],
  make(dif) {
    const tk = new Tick(dif.iv(0.9));
    let rot = 0;
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        rot += 0.19;
        const arms = dif.n(4);
        for (let k = 0; k < arms; k++) {
          const a = rot + (k / arms) * _TAU;
          // 十字そのものを弾で描く: 中心から腕が出る
          const len = dif.n(5);
          for (let i = 1; i <= len; i++) {
            const d = i * 13;
              ctx.sys.spawn({
              x: ctx.bx + Math.cos(a) * d,
              y: ctx.by + Math.sin(a) * d,
              ang: a, speed: dif.v(64 + i * 4), type: 'crossHonshitsu',
              life: 11, glow: 1,
            });
          }
        }
        ctx.sfx('ui_credit');
      },
    };
  },
});

/* ========================================================================
 * 16. 中心収束→拡散 — 掲示板に集まり、また散らばる
 *    原作: 第十章 掲示板の考古学
 * ====================================================================== */
defPattern('convergeSpread', {
  name: 'convergeSpread', jp: '掲示板', novel: '第十章 掲示板の考古学',
  tags: ['収束', '拡散', '読み'],
  make(dif) {
    const tk = new Tick(dif.iv(3.0));
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        const n = dif.n(16);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * _TAU;
          const R = 230;
          ctx.sys.spawn({
            x: ctx.bx + Math.cos(a) * R, y: ctx.by + Math.sin(a) * R,
            ang: a + Math.PI, speed: dif.v(92), type: 'riceCream',
            behavior: 'convergeThenDiverge', convergeTime: 0.9,
            acc: 60, turnSpeed: dif.v(70),
            divergedAngle: a + Math.PI + (i % 2 ? 0.8 : -0.8),
            cx: ctx.bx, cy: ctx.by, life: 7, glow: .6,
          });
        }
        ctx.sfx('charge');
      },
    };
  },
});

/* ========================================================================
 * 17. 高密度低速の最終盤 — 原作の「残り時間が少ないほど密度が上がる」
 *    原作: 「残り時間が少ないほど、密度が上がる」
 * ====================================================================== */
defPattern('finaleDense', {
  name: 'finaleDense', jp: '密度', novel: '第三年 第一章（密度の比喩）',
  tags: ['最終盤', '高密度', '低速'],
  make(dif) {
    const tk = new Tick(dif.iv(0.36));
    const ring = new Tick(dif.iv(1.6));
    return {
      update(dt, ctx) {
        if (tk.update(dt)) {
          const arms = dif.n(3);
          for (let i = 0; i < arms; i++) {
            const a = tk.n * 0.24 + (i / arms) * _TAU;
            ctx.sys.spawn({
              x: ctx.bx, y: ctx.by, ang: a, speed: dif.v(58), type: 'riceGold',
              life: 16, av: 0.2, glow: .9,
            });
            ctx.sys.spawn({
              x: ctx.bx, y: ctx.by, ang: -a, speed: dif.v(52), type: 'riceEnji',
              life: 16, av: -0.2, glow: .8,
            });
          }
        }
        if (ring.update(dt)) {
          const n = Math.max(6, Math.round(dif.dense(dif.n(18))));
          for (let i = 0; i < n; i++) {
            const a = (i / n) * _TAU;
            ctx.sys.spawn({
              x: ctx.bx, y: ctx.by, ang: a, speed: dif.v(44), type: 'orbGold',
              life: 18, acc: 8, glow: 1, scale: 0.8,
            });
          }
          ctx.sfx('shot_big');
        }
      },
    };
  },
});

/* ========================================================================
 * 18. ✝ 本質 — 十字の壁が中心で開く（最終局面専用）
 *    原作: 「✝本質✝は、私の理論を壊しに来たんですか」「壊しに行ってない」
 * ====================================================================== */
defPattern('honshitsuWall', {
  name: 'honshitsuWall', jp: '本質の枠',
  novel: '第十四章 「枠が広がると、前の枠に入ってたものがこぼれて、壊れたように見える。でも壊れてない。広がっただけ」',
  tags: ['枠', '十字', '最終', '四隅が常に逃げ道'],
  /**
   * 設計（再設計版）:
   *  ・✝ は常に 4 本（原作の象徴を崩さない）
   *  ・腕の「届く距離」は固定する: R0 + CELLS*step。画面四隅はいつでも安全圏。
   *    （届く距離を難易度で伸ばすと「逃げ場が消える」＝不公平になるため、
   *      難易度は本数・間隔・発射間隔で上げる）
   *  ・1 セル 1 弾。以前は 3 幅に重ねていたが、近距離で団子・遠距離で散弾になり
   *    読みづらく、かつ本数だけが増えていたので 1 本の線にした。
   *  ・HARD のみ「×」を重ね、✝ と × の 8 本にする（＝枠が広がった状態）。
   *    見た目も 2 つの字として読めるので、8 本の無名な腕より視認性が高い。
   */
  make(dif) {
    const tk = new Tick(dif.iv(2.4));
    const R0 = 40;
    const CELLS = 6;                       // 固定長（届く距離を難易度で伸ばさない）
    const step = dif.safe(34) < 28 ? 28 : 34;  // HARD は枠を詰める（safe が狭いほど密）
    const sp = dif.v(58);
    const diag = dif.d.countMul >= 1.2;    // HARD のみ × を重ねる
    const ARMS = 4;
    let rot = 0;
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        rot += 0.20;                       // 予測できる一定の回転
        for (let arm = 0; arm < ARMS; arm++) {
          const a = rot + (arm / ARMS) * _TAU;
          for (let i = 0; i < CELLS; i++) {
            const d = R0 + i * step;
            ctx.sys.spawn({
              x: ctx.bx + Math.cos(a) * d, y: ctx.by + Math.sin(a) * d,
              ang: a, speed: sp, type: 'crossHonshitsu', life: 9, glow: 1,
            });
          }
        }
        if (diag) {
          for (let arm = 0; arm < ARMS; arm++) {
            const a = rot + Math.PI / 4 + (arm / ARMS) * _TAU;
            for (let i = 0; i < CELLS; i++) {
              const d = R0 + i * step;
              ctx.sys.spawn({
                x: ctx.bx + Math.cos(a) * d, y: ctx.by + Math.sin(a) * d,
                ang: a, speed: sp * 1.08, type: 'crossHonshitsu', life: 9, glow: 1,
              });
            }
          }
        }
        ctx.sfx('ui_credit');
        if (tk.n % 2 === 1) ctx.sfx('phase_warn');
      },
    };
  },
});

/* ========================================================================
 * 19. 米弾の雨 — 原作の「米」と気質（やわらかい導入）
 * ====================================================================== */
defPattern('rainRice', {
  name: 'rainRice', jp: '米の雨', novel: '第二章（味噌・餅・米の話）',
  tags: ['雨', '導入'],
  make(dif) {
    const tk = new Tick(dif.iv(0.42));
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        // ランダムな雨ではなく「列」で降らせる。必ず 2 列ぶんの間隔が空く。
        const cols = dif.n(9);
        const gapW = Math.max(1, Math.round(dif.safe(1.8)));
        const slots = Math.max(1, cols - gapW);
        const gap = (tk.n * 3) % slots;
        const sp = dif.v(88);
        for (let c = 0; c < cols; c++) {
          if (c >= gap && c < gap + gapW) continue;
          const x = ((c + 0.5) / cols) * ctx.W;
          ctx.sys.spawn({
            x, y: -14, ang: Math.PI / 2, speed: sp,
            type: c % 2 ? 'riceCream' : 'riceNavy', life: 11, glow: .5,
          });
        }
        if (tk.n % 5 === 0) ctx.sfx('shot');
      },
    };
  },
});

/* ========================================================================
 * 20. 遠慮がちな追い詰め — 伊豆見が半歩ずれる
 *    原作: 第十三章 伊豆見、半歩ずれる
 * ====================================================================== */
defPattern('halfStep', {
  name: 'halfStep', jp: '半歩', novel: '第十三章 伊豆見、半歩ずれる',
  tags: ['圧縮', '読み'],
  make(dif) {
    const tk = new Tick(dif.iv(1.9));
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        // 四方から少しずつ寄る。ただし
        //  ・必ず画面外の 1 辺ずつ（＝進入が見える）
        //  ・各辺の中央は空けておく（＝逃げ道が残る）
        const n = dif.n(6);
        const edges = [
          { horiz: true, from: -1 }, { horiz: false, from: -1 },
          { horiz: true, from: 1 }, { horiz: false, from: 1 },
        ];
        const e = edges[tk.n % edges.length];
        const gapW = Math.max(1, Math.round(dif.safe(1.6)));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          if (t > 0.5 - gapW / (2 * n) && t < 0.5 + gapW / (2 * n)) continue;
          let x, y, ang;
          if (e.horiz) {
            x = e.from < 0 ? -16 : ctx.W + 16;
            y = t * ctx.H;
            ang = e.from < 0 ? 0 : Math.PI;
          } else {
            y = e.from < 0 ? -16 : ctx.H + 16;
            x = t * ctx.W;
            ang = e.from < 0 ? Math.PI / 2 : -Math.PI / 2;
          }
          ctx.sys.spawn({
            x, y, ang, speed: dif.v(70), type: 'riceCyan', life: 8, glow: .6,
          });
        }
        ctx.sfx('shot');
      },
    };
  },
});

/* ========================================================================
 * 21. レーザー掃引＋弾の雨（複合）
 * ====================================================================== */
defPattern('sweepLaser', {
  name: 'sweepLaser', jp: '掃引', novel: '第十二章 / 球技大会（時間の圧）',
  tags: ['レーザー', '複合'],
  make(dif) {
    const tk = new Tick(dif.iv(2.8));
    return {
      update(dt, ctx) {
        if (!tk.update(dt)) return;
        const fromLeft = tk.n % 2 === 0;
        ctx.sys.spawnLaser({
          x: fromLeft ? -40 : ctx.W + 40, y: ctx.H * 0.5,
          ang: 0, width: 15, length: ctx.W + 120,
          warnDur: 1.2, fireDur: 1.6, fadeDur: 0.3, rotate: 0,
          ramp: ctx.ramp, onFire: () => ctx.sfx('laser'),
        });
        for (let i = 0; i < dif.n(10); i++) {
          const x = (i + 0.5) / dif.n(10) * ctx.W;
          ctx.sys.spawn({
            x, y: fromLeft ? -16 : ctx.H + 16,
            ang: fromLeft ? Math.PI / 2 : -Math.PI / 2, speed: dif.v(76),
            type: 'riceGold', life: 12, glow: .7,
          });
        }
        ctx.sfx('charge');
      },
    };
  },
});

/** パターンの説明文（アーカイブ画面などで使う） */
const PATTERN_INFO = Object.fromEntries(
  Object.values(PATTERNS).map(p => [p.key, { jp: p.jp, novel: p.novel, tags: p.tags }])
);

window.HN = window.HN || {};
Object.assign(window.HN, { PATTERNS, defPattern, PATTERN_INFO, Tick });
