/* =============================================================================
 * src/game/boss.js — ボス・エンティティ
 *
 *  【設計】ボスに HP は無い。プレイヤーは攻撃しないからだ。
 *  ボスは「時間」で進行し、各フェーズを耐えきることで先へ進む。
 *
 *  【観測】プレイヤーが唯一ボスへ干渉できる手段。
 *  かすり（グレイズ）で「観測値」が溜まり、満タンで発動すると
 *  ボスの重ね合わせが収束して硬直し、周囲の弾が消える。
 *  これは櫻優の第七〜十三法則（シュレディンガーの好意・観測による確定）を
 *  そのままゲーム機構にしたものであり、原作に攻撃手段が無いことを
 *  欠落ではなくルールとして成立させている。
 *
 *  ポーズ: appear / idle / float / move / charge / attack / shift / stunned / defeat
 * ========================================================================== */
'use strict';

const BOSS_TYPES = {
  /* ---- 三重県臣: 冷笑 ---- */
  mie: {
    key: 'mie', char: 'mie',
    name: '三重 県臣', title: '冷笑',
    head: 'mie', body: 'suit',
    px: 3.4, armLen: 13, height: 27, shoulder: 14,
    tie: '#94203c', tieLt: '#c9556e', tieDk: '#5e0f22',
    aura: '#c9556e', auraRamp: null,
    palette: ['#5c1226', '#a82244', '#c9556e', '#f0cf6a'],
    lines: {
      appear: ['……は？', '何見てるんだ'],
      phase: ['まあ。', '……まあ', 'まあ、そうか'],
      stunned: ['……'],
      defeat: ['……まあ', '（三重は追及をやめた）'],
      quote: '三重県臣は「まあ」を二回言うとき、内心では面白いと思っている。',
    },
  },

  /* ---- 塀勝也: 地形図 ---- */
  katsuya: {
    key: 'katsuya', char: 'katsuya',
    name: '塀 勝也', title: '地形図の向こう側',
    head: 'katsuya', body: 'cardigan',
    px: 3.4, armLen: 13, height: 27, shoulder: 14,
    tie: null,
    aura: '#c39a3c', auraRamp: ['#241a06', '#6b5320', '#c39a3c', '#f5df95'],
    palette: ['#17402a', '#2d7a4e', '#7fd6a0', '#f5df95'],
    heldMap: { w: 36, h: 25, dx: 19, dy: -8, rot: -0.22, glow: 0.5 },
    lines: {
      appear: ['糸魚川-静岡構造線。聞いたことあるか', '同じ地図だ。一年目と同じに見えるか？'],
      phase: ['ここを境に日本列島の地質が変わる', '時間を掘ってると思ってくれ', '今を起点にすると、地面って時間の積み重ねなんだ'],
      stunned: ['……'],
      defeat: ['正解だ。全部正解だ', '（勝也は窓の外を見た。五秒くらい。口が動いた）'],
      quote: '三年間同じ地図を出して、見る側が変わるのを待っていた。',
    },
  },

  /* ---- 倉石暁: 狂信 ---- */
  kuraishi: {
    key: 'kuraishi', char: 'kuraishi',
    name: '倉石 暁', title: '✝の狂信',
    head: 'kuraishi', body: 'suit',
    px: 3.4, armLen: 13, height: 27, shoulder: 13,
    tie: '#2f4fa0', tieLt: '#5f7fd0', tieDk: '#1d3370',
    aura: '#f0cf6a', auraRamp: ['#3a2c08', '#a5821f', '#f0cf6a', '#fffbe8'],
    halo: true, haloR: 84, showCross: true, crossScale: 1.1,
    palette: ['#5c1226', '#a82244', '#e05575', '#f0cf6a'],
    lines: {
      appear: ['これまじ✝本質✝', '聖典です', '両馬さん……！'],
      phase: ['✝本質✝は誰のものでもない', '書きます。✝', '見てました'],
      stunned: ['……✝'],
      defeat: ['✝は一つでいい', '（倉石は三秒ほど黙って、ノートに書いた）'],
      quote: '筆箱にも「✝」と書いてある。入学初日にこの装備で来る人間は、桐葉高校の歴史上おそらくいない。',
    },
  },

  /* ---- 塀勝也・最終形態: 地形図そのもの ---- */
  honshitsu: {
    key: 'honshitsu', char: 'katsuya',
    name: '地形図の向こう側', title: '最後の地形図',
    head: 'katsuya', body: 'contour',
    px: 3.4, armLen: 13, height: 30, shoulder: 15,
    tie: null,
    aura: '#f0cf6a', auraRamp: ['#3a2c08', '#a5821f', '#f0cf6a', '#fffbe8'],
    halo: true, haloR: 96, showCross: true, contourBody: true, crossScale: 1.2,
    palette: ['#17402a', '#2d7a4e', '#7fd6a0', '#f5df95'],
    lines: {
      appear: ['また同じ地図か。三回目だ', '問うんじゃない。'],
      phase: ['同じ地図なのに、見え方が違う', '同じ本を二回読んだら違う本になってる',
        '見る側が変わるから', 'それが、✝本質✝だ'],
      stunned: ['……'],
      defeat: ['お前ら、一学期と同じに見えるか？', '今は少しは見えるか'],
      quote: '見えないが、ある。',
    },
  },
};

class Boss {
  constructor(typeKey, W, H) {
    this.W = W; this.H = H;
    this.setType(typeKey);
    this.x = W / 2; this.y = H * 0.26;
    this.t = 0;
    this.pose = 'appear';
    this.poseT = 0;
    this.expr = 'idle';
    this.blink = false;
    this.blinkT = 1.5 + Math.random();
    this.moveT = 0;
    this.movePhase = 0;
    this.moveSpeed = 1;
    this.homeX = W / 2; this.homeY = H * 0.26;
    this.targetX = this.homeX; this.targetY = this.homeY;
    this.auraLevel = 0;
    this.shakeT = 0;
    this.flashT = 0;
    this.stunT = 0;
    this.glassGlint = 0.35;
    this.trail = [];
    this.scale = 1;
    this.alpha = 1;
    this.spin = 0;
    this.defeatT = 0;
    this.speech = null;        // 現在表示中の台詞
    this.speechT = 0;
    this.emergeFrom = null;
    this.legalT = 0;          // 不変条件の猶予タイマ（検証用）
    this.lastDist = undefined;
    this.lastPlayerY = undefined;
  }

  setType(key) {
    const t = BOSS_TYPES[key] || BOSS_TYPES.mie;
    this.type = t;
    this.def = t;
  }

  get name() { return this.type.name; }
  get title() { return this.type.title; }

  /** 登場演出を開始 */
  appear(fromY) {
    this.pose = 'appear'; this.poseT = 0;
    this.y = fromY ?? -80;
    this.alpha = 0;
    this.scale = 1.3;
    this.emergeFrom = this.y;
  }

  say(text, dur = 2.6) { this.speech = text; this.speechT = dur; }

  setPose(p, dur = 0) { this.pose = p; this.poseT = 0; this.poseDur = dur; }

  flapStun(sec = 1.1) {
    this.stunT = sec;
    this.setPose('stunned');
    this.say('……', 1.0);
  }

  flash(sec = 0.3) { this.flashT = sec; }

  /** 移動目標を決める（フェーズごとの軌道） */
  setMove(kind, W, H, speedMul = 1) {
    this.moveKind = kind;
    this.moveSpeed = speedMul;
    this.moveT = 0;
    this.movePhase++;
  }

  update(dt, sys) {
    this.t += dt;
    this.poseT += dt;
    if (this.stunT > 0) this.stunT -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.speechT > 0) { this.speechT -= dt; if (this.speechT <= 0) this.speech = null; }
    // 瞬き
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = !this.blink; this.blinkT = this.blink ? 0.12 : (2.2 + Math.random() * 2.4); }

    // 登場
    if (this.pose === 'appear') {
      const k = Math.min(1, this.poseT / 1.5);
      const e = window.HN.ease.outCubic(k);
      this.y = window.HN.lerp(this.emergeFrom, this.homeY, e);
      this.alpha = Math.min(1, k * 1.6);
      this.scale = window.HN.lerp(1.3, 1, e);
      if (k >= 1) { this.setPose('idle'); this.scale = 1; }
      return;
    }
    // 敗北
    if (this.pose === 'defeat') {
      this.defeatT += dt;
      this.y += 8 * dt;
      this.spin += dt * 0.8;
      this.alpha = Math.max(0, 1 - this.defeatT / 2.4);
      this.scale = Math.max(0.2, 1 - this.defeatT / 3.2);
      return;
    }

    this.scale += (1 - this.scale) * Math.min(1, dt * 4);
    this.alpha += (1 - this.alpha) * Math.min(1, dt * 4);

    // 移動（ポーズに応じて）
    const stunned = this.pose === 'stunned';
    this.moveT += dt;
    if (!stunned && this.pose !== 'charge') {
      switch (this.moveKind) {
        case 'sway':            // ゆっくり左右
          this.x = this.homeX + Math.sin(this.moveT * 0.55 * this.moveSpeed) * this.W * 0.22;
          this.y = this.homeY + Math.sin(this.moveT * 0.9 * this.moveSpeed) * 10;
          break;
        case 'lissajous':       // リサージュ（二次元の漂い）
          this.x = this.homeX + Math.sin(this.moveT * 0.42 * this.moveSpeed) * this.W * 0.26;
          this.y = this.homeY + Math.sin(this.moveT * 0.63 * this.moveSpeed + 1.1) * this.H * 0.10;
          break;
        case 'figure8':
          this.x = this.homeX + Math.sin(this.moveT * 0.5 * this.moveSpeed) * this.W * 0.24;
          this.y = this.homeY + Math.sin(this.moveT * 1.0 * this.moveSpeed) * this.H * 0.09;
          break;
        case 'descend':         // 徐々に降りてくる（圧）
          this.y += 5.5 * dt * this.moveSpeed;
          this.x += Math.sin(this.moveT * 0.8) * 14 * dt;
          this.y = Math.min(this.y, this.H * 0.40);
          break;
        case 'approach':        // プレイヤーへ寄る
          if (sys.player) {
            const tx = sys.player.x, ty = Math.max(this.H * 0.16, sys.player.y - this.H * 0.42);
            this.x += (tx - this.x) * Math.min(1, dt * 0.8 * this.moveSpeed);
            this.y += (ty - this.y) * Math.min(1, dt * 0.5 * this.moveSpeed);
          }
          break;
        case 'center':
          this.x += (this.homeX - this.x) * Math.min(1, dt * 1.4);
          this.y += (this.homeY - this.y) * Math.min(1, dt * 1.4);
          break;
        case 'recoil':          // 攻撃後のがくん
          this.x += (this.homeX - this.x) * Math.min(1, dt * 2.2);
          this.y += (this.homeY + 8 - this.y) * Math.min(1, dt * 2.2);
          break;
        default:
          this.x = this.homeX; this.y = this.homeY;
      }
    } else if (stunned) {
      // 硬直中は微振動
      this.x += Math.sin(this.t * 42) * 0.7;
    }
    // 画面内に拘束
    this.x = window.HN.clamp(this.x, this.W * 0.16, this.W * 0.84);
    this.y = window.HN.clamp(this.y, this.H * 0.12, this.H * 0.42);

    /* ---- 公平性の不変条件: ボスは自分から自機へ近づきすぎない ----
     * ボスが自機のすぐ近くまで来ると、ボスの位置から弾が生まれるパターン
     * （ringsNavy / chaserMie / contourWaves など）が「出現即直撃」になる。
     * 反応する時間が無い弾は難易度ではなく事故なので、これを構造的に防ぐ。
     *
     * ・対象は「自機が画面下半分（y > H*0.50）に居るとき」だけ。
     *   自機が自分から画面上部へ突っ込むのはプレイヤーの選択であり、
     *   「上に行くと危険」は弾幕ゲームの基本の駆け引きなので妨げない。
     * ・この下限は「ボスの可動域」の中で必ず満たせる必要がある。
     *   ボスの可動域は y ∈ [H*0.12, H*0.42] なので、自機が y = H*0.50 に居るときの
     *   縦距離は最大 H*0.50 - H*0.12 = 182.4px。したがって MIN_D = 140 なら
     *   常に「真上へ逃げ切れる」余裕（42.4px）がある。170 にすると
     *   自機が y ≒ H*0.45 付近に居るとき満たせず、クランプと喧嘩して破れる。
     * ・押し戻しは 1 フレーム MAX_STEP px までに制限し、瞬間移動に見せない。
     *   最も厳しいケース（自機 y=H*0.50 の真下、ボスが降下して y=H*0.42）でも
     *   必要な退避量は 201.6-140+... ≒ 101px = 17 フレーム = 0.28 秒で済む。
     *   playthrough.js は 0.6 秒の猶予後にだけ不変条件を検証する。
     */
    if (sys && sys.player) {
      const MIN_D = 140;      // 自機の中心とボスの中心の最小距離[px]
      const MAX_STEP = 6;     // 1 フレームの最大退避量[px] = 6*60 = 360px/s
      const inZone = sys.player.y > this.H * 0.5;
      // 猶予タイマ: 自機が上に居る／ボスが出題移動中のときは 0 に戻す
      if (!inZone || this.pose === 'appear' || this.pose === 'shift') this.legalT = 0;
      else this.legalT += dt;

      if (inZone) {
        let dx = this.x - sys.player.x, dy = this.y - sys.player.y;
        let d = Math.hypot(dx, dy);
        if (d < MIN_D && d > 1e-4) {
          const step = Math.min(MIN_D - d, MAX_STEP);
          this.x += (dx / d) * step;
          this.y += (dy / d) * step;
        }
        // 画面内拘束（ボスの可動域）
        const box = () => {
          this.x = window.HN.clamp(this.x, this.W * 0.16, this.W * 0.84);
          this.y = window.HN.clamp(this.y, this.H * 0.12, this.H * 0.42);
        };
        box();
        // クランプで押し戻されて距離が足りない場合の逃げ道:
        //   ① 自機から遠い側の水平端へ寄る ② それでも足りなければ真上へ
        let d2 = Math.hypot(this.x - sys.player.x, this.y - sys.player.y);
        if (d2 < MIN_D) {
          const side = sys.player.x <= this.x ? 1 : -1;
          this.x = window.HN.clamp(
            this.x + side * Math.min(MIN_D - d2, MAX_STEP), this.W * 0.16, this.W * 0.84);
          d2 = Math.hypot(this.x - sys.player.x, this.y - sys.player.y);
          if (d2 < MIN_D) {
            this.y = Math.max(this.H * 0.12, this.y - Math.min(MIN_D - d2, MAX_STEP));
          }
        }
      }
      // 検証用: ボス自身の移動直後の距離を記録する。
      this.lastDist = Math.hypot(this.x - sys.player.x, this.y - sys.player.y);
      this.lastPlayerY = sys.player.y;
    }

    // ポーズの自動復帰
    if (this.poseDur && this.poseT >= this.poseDur) this.setPose('idle');
    else if (this.pose === 'stunned' && this.stunT <= 0) this.setPose('idle');
    else if (this.pose === 'hit' && this.poseT > 0.24) this.setPose('idle');
    else if (this.pose === 'attack' && this.poseT > 0.35) this.setPose('idle');

    // オーラの強度（フェーズが進むほど強く）
    this.auraLevel += ((this.auraTarget ?? 0.4) - this.auraLevel) * Math.min(1, dt * 0.8);

    // 残像
    if (this.pose === 'shift' || this.pose === 'appear' || this.auraLevel > 0.7) {
      this.trail.push({ x: this.x, y: this.y, life: 0, a: this.alpha, p: this.pose, t: this.t });
      if (this.trail.length > 8) this.trail.shift();
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life += dt;
      if (this.trail[i].life > 0.5) this.trail.splice(i, 1);
    }
  }

  /* -------------------------------------------------------------- 描画 --- */
  draw(ctx, time) {
    if (this.alpha <= 0.01) return;
    // 残像
    for (const tr of this.trail) {
      const a = (1 - tr.life / 0.5) * 0.22 * this.alpha;
      if (a <= 0.01) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.translate(tr.x, tr.y);
      ctx.scale(this.scale, this.scale);
      ctx.translate(0, 0);
      window.HN.drawBoss(ctx, this._drawOpts(tr.t));
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = this.alpha;
    const sx = this.shakeT > 0 ? (Math.random() - 0.5) * this.shakeT * 22 : 0;
    const sy = this.shakeT > 0 ? (Math.random() - 0.5) * this.shakeT * 22 : 0;
    ctx.translate(this.x + sx, this.y + sy);
    ctx.scale(this.scale, this.scale);
    ctx.rotate(this.pose === 'defeat' ? this.spin : Math.sin(this.t * 0.8) * 0.012);
    window.HN.drawBoss(ctx, this._drawOpts(this.t));
    // 被弾・移行のフラッシュ（白飛び）
    if (this.flashT > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, this.flashT * 3) * 0.7;
      ctx.fillStyle = '#fffbe8';
      const r = 62;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  _drawOpts(time) {
    const d = this.def;
    const expr = this.pose === 'stunned' ? 'closed'
      : this.pose === 'attack' ? 'grim'
        : this.pose === 'shift' ? 'wide'
          : (this.pose === 'defeat' ? 'closed' : 'idle');
    return {
      head: d.head, body: d.body, px: d.px, pose: this.pose === 'stunned' ? 'hit' : this.pose,
      t: time, tie: d.tie, tieLt: d.tieLt, tieDk: d.tieDk,
      aura: d.aura, halo: d.halo, haloR: d.haloR, showCross: d.showCross,
      heldMap: d.heldMap, contourBody: d.contourBody,
      crossScale: d.crossScale ?? 2.0,
      height: d.height, shoulder: d.shoulder, armLen: d.armLen,
      expr, blink: this.blink, glassGlint: this.glassGlint + Math.sin(this.t * 0.7) * 0.25,
      crossRot: Math.sin(this.t * 0.5) * 0.15,
      crossAlpha: this.pose === 'appear' || this.pose === 'shift' ? 1 : 0.55,
    };
  }
}

window.HN = window.HN || {};
Object.assign(window.HN, { Boss, BOSS_TYPES });
