/* =============================================================================
 * src/game/game.js — ゲーム本体（状態遷移・フェーズ進行・画面合成）
 *
 *  【このゲームのルール】
 *    ・プレイヤーは攻撃できない。右上の残り秒数が尽きるまで避け続ける。
 *    ・ボスに HP は無い。フェーズを耐えきれば先へ進む。全フェーズ＝STAGE CLEAR。
 *    ・被弾しても即死しない。残機を 1 消費し、無敵時間つきで復帰する。
 *    ・唯一の干渉手段は「観測」— かすりでゲージを溜め、発動すると
 *      重ね合わせが収束し、画面上の弾が消えてボスが硬直する。
 *      （原作: 櫻優の「観測された瞬間に好意は確定する」）
 *
 *  【描画】640×480 の論理解像度に固定し、画面へは最近傍で拡大。
 *    ピクセルアートの輪郭を保ち、端末差で見た目が変わらないようにする。
 *    すべての内部描画は this.buf（オフスクリーン）に対して行い、
 *    シェイクやフラッシュの揺れを他の要素に波及させない。
 * ========================================================================== */
'use strict';

const FIELD_W = 640, FIELD_H = 480;
/** 背景アニメ用の固定 dt（描画からも進める必要がある箇所で使用） */
const dt0 = () => 1 / 60;
/** ポーズメニューの項目（描画・入力・タップの当たり判定で同じ配列を使う） */
const PAUSE_ITEMS = ['再開', '最初から', 'タイトルへ', 'フルスクリーン', 'ミュート'];
const SAVE_KEY = 'honshitsu.save.v1';
const OPT_KEY = 'honshitsu.options.v1';

/* ゲーム状態（screens.js から参照するのでモジュール定数として公開） */
const G = {
  state: 'boot',
  stateT: 0,
  stage: null,
  stageIdx: 0,
  dif: null,
  difKey: 'NORMAL',
  lives: 3, score: 0, graze: 0, gauge: 0, gaugeMax: 60,
  observations: 0, misses: 0, noMiss: true,
  time: 0,
  phaseIndex: 0, phaseTotal: 4, phaseRemain: 30, phaseDuration: 30,
  runTime: 0,
  phaseClearBonus: 0,
  mode: 'story',
  practiceStage: 0, practicePhase: 0,
  best: {},
  fps: 60,
};

class Game {
  constructor() {
    this.canvas = null; this.ctx = null;
    this.buf = null; this.bctx = null;
    this.input = null;
    this.G = G;
    this.acc = 0; this.last = 0;
    this.running = false;
    this.fixed = 1 / 60;
    this.paused = false;
    this.msg = null;
    this.loaded = false;
    this.loadProg = 0;
    this.titleT = 0;
    this.results = null;
    this.deathT = 0;
    this.songDuckT = 0;         // 曲の切り替え時に音量を絞っている残り時間
    this.phaseState = 'idle';   // idle|intro|active|shift|clear
    this.phaseStateT = 0;
    this.layers = [];
    this.warnedTime = false;
    this.grazeMile = 0;
    this.save = this.loadSave();
    this.opt = this.loadOpt();
    // screens.js から参照するための公開（G は画面横断の状態置き場）
    G.save = this.save; G.opt = this.opt; G.game = this;
    this.menuIndex = 0;
    this.touchHint = false;
    this.showArchiveFrom = 'title';
    this.lastFrame = 0;
    this.autoPaused = false;
    /* カメラ（演出用）。フィールド全体にだけ掛かり、HUD には掛けない。
     *   z は 1 以上にしかならない（1 未満にすると画面の端に黒い隙間が出る）。
     * ここ（constructor）で初期化する。boot() に置くと、boot() を呼ばずに
     * Game を組み立てる検証環境（render-frames / playthrough）で未定義になる。 */
    this.cam = { z: 1, kx: 0, ky: 0 };
  }

  /* =========================================================== 起動 ==== */
  boot() {
    this.canvas = document.getElementById('game');
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      document.body.appendChild(this.canvas);
    }
    this.canvas.width = FIELD_W;
    this.canvas.height = FIELD_H;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    // 粗いポインタ（スマホ・タブレット）ならタッチ用ボタンを最初から出す
    try {
      window.HN.coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    } catch (e) { window.HN.coarsePointer = false; }

    const b = window.HN.makeCanvas(FIELD_W, FIELD_H);
    this.buf = b.canvas; this.bctx = b.ctx;
    this.bctx.imageSmoothingEnabled = false;

    // 弾スプライトのアトラスを焼く（回転 32 段 × 全弾種）
    window.HN.Render.build();

    this.input = new window.HN.Input(this.canvas);
    this.sys = new window.HN.BulletSystem(FIELD_W, FIELD_H);
    this.bg = new window.HN.Background();
    this.fx = new window.HN.Effects(FIELD_W, FIELD_H);
    this.player = new window.HN.Player(FIELD_W, FIELD_H);
    this.sys.player = this.player;
    this.sys.onCancel = (b, silent) => {
      if (!silent) this.fx.bulletPop(b.x, b.y, this.rampNow, true);
    };
    this.boss = new window.HN.Boss('mie', FIELD_W, FIELD_H);
    window.HN.HUD.init();

    window.HN.audio.masterVol = this.opt.masterVol;
    window.HN.audio.setMusicVol(this.opt.musicVol);
    window.HN.audio.setSfxVol(this.opt.sfxVol);
    window.HN.audio.setMuted(this.opt.muted);

    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    // 不用意なタブ切替で死なないよう自動ポーズ
    addEventListener('blur', () => { if (G.state === 'ingame') this.pause(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && G.state === 'ingame') this.pause();
    });

    // アセット（立ち絵・顔アイコン）読み込み
    this.setState('boot');
    window.HN.loadAssets((p) => {
      this.loadProg = p;
      if (G.state === 'boot') this.drawBoot();
    }).then(() => {
      this.loaded = true;
      window.HN.Fonts.load().then(() => { this.fontsReady = true; }).catch(() => { });
      this.setState('title');
    }).catch(() => {
      this.loaded = true; this.setState('title');
    });

    const loop = (ts) => {
      if (!this.running) { this.running = true; this.last = ts; }
      let dt = (ts - this.last) / 1000;
      this.last = ts;
      if (!(dt > 0)) dt = 1 / 60;
      dt = Math.min(dt, 0.05);
      G.fps = G.fps + ((1 / Math.max(dt, 1e-3)) - G.fps) * 0.08;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  resize() {
    const pad = 0;
    const availW = innerWidth - pad, availH = innerHeight - pad;
    const s = Math.max(1, Math.min(availW / FIELD_W, availH / FIELD_H));
    const w = Math.floor(FIELD_W * s), h = Math.floor(FIELD_H * s);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.canvas.style.left = Math.floor((availW - w) / 2) + 'px';
    this.canvas.style.top = Math.floor((availH - h) / 2) + 'px';
    this.scale = s;
  }

  /* ======================================================= セーブ ====== */
  loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      return Object.assign({ unlocked: 1, cleared: [], best: {}, seenTutorial: false, seenIntro: {} }, s);
    } catch (e) {
      return { unlocked: 1, cleared: [], best: {}, seenTutorial: false, seenIntro: {} };
    }
  }
  writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { } }
  loadOpt() {
    try {
      return Object.assign({
        masterVol: 0.8, musicVol: 0.72, sfxVol: 0.8, muted: false, scanlines: true, ambient: true,
      }, JSON.parse(localStorage.getItem(OPT_KEY) || '{}'));
    } catch (e) {
      return { masterVol: 0.8, musicVol: 0.72, sfxVol: 0.8, muted: false, scanlines: true, ambient: true };
    }
  }
  writeOpt() {
    try { localStorage.setItem(OPT_KEY, JSON.stringify(this.opt)); } catch (e) { }
    window.HN.audio.masterVol = this.opt.masterVol;
    window.HN.audio.setMusicVol(this.opt.musicVol);
    window.HN.audio.setSfxVol(this.opt.sfxVol);
    window.HN.audio.setMuted(this.opt.muted);
  }

  /* ==================================================== 状態遷移 ======= */
  setState(s) {
    const prev = G.state;
    G.state = s; G.stateT = 0;
    if (s !== prev) this.onEnter(s, prev);
  }

  onEnter(s, prev) {
    const A = window.HN.audio;
    switch (s) {
      case 'title':
        A.playSong('title', { intensity: 0.3 });
        window.HN.HUD.init();
        this.menuIndex = 0;
        break;
      case 'diff':
      case 'help':
      case 'archive':
      case 'credits':
      case 'practice':
        A.setIntensity(0.15);
        break;
      case 'ingame':
        break;
      case 'gameover':
        A.stopSong(0.6);
        A.sfx('gameover');
        break;
      case 'results':
        A.playSong('clear', { intensity: 0.35 });
        break;
      case 'allclear':
        A.playSong('clear', { intensity: 0.8 });
        break;
      case 'pause':
        A.setIntensity(0.1, true);
        break;
    }
  }

  /* =================================================== ステージ開始 ==== */
  startRun(difKey, stageIdx, mode = 'story', phaseIdx = 0) {
    G.difKey = difKey;
    G.dif = new window.HN.DiffHelper(difKey);
    G.mode = mode;
    G.stageIdx = stageIdx;
    this.stageDef = window.HN.STAGES[stageIdx];
    G.stage = this.stageDef;
    G.lives = G.dif.lives;
    G.score = 0; G.graze = 0; G.gauge = 0; G.observations = 0;
    G.misses = 0; G.noMiss = true; G.runTime = 0;
    this.grazeMile = 0;
    this.gaugeMax = G.dif.bombs > 2 ? 54 : 60;
    G.gaugeMax = this.gaugeMax;

    this.player.reset();
    this.player.invuln = 2.4;
    this.sys.reset();
    this.sys.difficulty = G.dif;
    this.sys.speedCapGlobal = G.dif.speedCap;
    this.sys.maxBullets = 1400;
    this.fx.clear();
    this.bg.setStage(G.stage);
    this.boss.setType(G.stage.boss);
    this.boss.W = FIELD_W; this.boss.H = FIELD_H;
    this.boss.homeX = FIELD_W / 2;
    this.boss.homeY = FIELD_H * (G.stage.bossHomeY ?? 0.26);
    this.boss.auraTarget = 0.25;
    this.rampNow = window.HN.RAMP.navy;

    this.ramp = this.pickRamp();

    // 練習モード: 開始フェーズだけの短い挑戦
    this.practicePhaseIdx = phaseIdx;
    if (mode === 'practice') {
      this.phaseList = [this.stageDef.phases[phaseIdx]];
      G.phaseTotal = 1;
      G.stage = Object.assign({}, this.stageDef, {
        title: `練習 — ${this.stageDef.title}`,
        subtitle: `PHASE ${phaseIdx + 1}「${this.phaseList[0].name}」`,
      });
    } else {
      this.phaseList = window.HN.phasesFor(this.stageDef, G.dif);
      G.phaseTotal = this.phaseList.length;
    }

    this.layerDefs = []; this.layers = [];
    this.phaseIdx = -1;
    this.deathT = 0;
    this.warnedTime = false;
    this.phaseState = 'idle'; this.phaseStateT = 0;
    this.showQuote = false;
    this.paused = false;
    this.goIdx = 0; this.idx2 = 0;
    this.resultPhase = null; this.acIdx = null; this.acPhase = null;
    this.introIdx = -1;

    window.HN.audio.resume();
    /* 章の導入（扉・会話）は静かな曲。会話が終わって戦闘が始まるところで
     * 章の曲に切り替わるので、「ここから始まる」が音でも分かる。 */
    const willIntro = (mode !== 'practice') && !this.save.seenIntro[G.stage.key];
    window.HN.audio.playSong(willIntro ? 'quiet' : G.stage.song, { intensity: willIntro ? 0.35 : 0.0 });

    this.setState('ingame');
    G.score = 0;
    this.mode = mode;
    this.introIdx = -1;

    if (mode === 'practice') {
      this.beginPhase(0);
    } else if (!this.save.seenIntro[this.stageDef.key]) {
      this.save.seenIntro[this.stageDef.key] = 1; this.writeSave();
      this.intro = this.stageDef.intro.slice();
      this.round = 0;
      this.setState('stageintro');
    } else {
      this.beginPhase(0);
    }
  }

  /** 章の基本配色。フェーズごとの配色は phaseRamp() が返す。 */
  pickRamp() {
    const T = window.HN.STAGE_THEME;
    const t = T['stage' + G.stage.id];
    return (t && t.main) ? t.main : window.HN.RAMP.navy;
  }

  /** フェーズ i の配色（無ければ章の基本配色） */
  phaseRamp(i) {
    const PA = window.HN.PHASE_ACCENT;
    const list = PA && PA[G.stage.id];
    return (list && list[i]) ? list[i] : this.pickRamp();
  }

  /* ==================================================== フェーズ制御 == */
  beginPhase(i) {
    this.phaseIdx = i;
    const ph = this.phaseList[i];
    G.phaseIndex = i;
    G.phaseDuration = ph.duration;
    G.phaseRemain = ph.duration;
    this.phaseDur = ph.duration;
    this.warnedTime = false;

    // 弾を全部消して状態を作り直す（移行時の事故を防ぐ）
    this.sys.clear(false);
    this.sys.warns.length = 0;
    this.layers = [];
    for (const L of ph.layers) {
      const info = window.HN.PATTERNS[L.p];
      if (!info) { console.warn('未定義のパターン:', L.p); continue; }
      const dif = G.dif;
      let mydif = dif;
      // レイヤー個別の係数（重ねたときに間隔が揃いすぎないようにする）
      if (L.ivMul || L.denseMul) {
        const d = Object.create(dif);
        d.iv = (b) => dif.iv(b) * (L.ivMul ?? 1);
        d.dense = (b) => dif.dense(b) * (L.denseMul ?? 1);
        mydif = d;
      }
      this.layers.push({
        key: L.p, info, inst: info.make(mydif),
        at: L.at, until: L.until, started: false, layer: L,
      });
    }
    /* ---- フェーズ固有の配色とボスの形態 ----
     * フェーズが進むごとに、ボスの色・後光・装飾が変わる。
     * 「同じ人物が、段階を踏んで✝本質✝へ近づいていく」ことを
     * 色と形で示すのが狙い（弾幕の色もこれに合わせる）。
     */
    this.ramp = this.phaseRamp(i);
    this.rampNow = (this.ramp && this.ramp[2]) ? this.ramp : window.HN.RAMP.navy;
    this.boss.form = Math.min(i, 3);
    this.boss.accent = this.rampNow;
    this.boss.setMove(ph.move || 'sway', FIELD_W, FIELD_H, G.dif.bmv(G.stage.bossMoveMul ?? 1));
    this.boss.auraTarget = 0.2 + ph.intensity * 0.8;
    this.boss.glassGlint = 0.4;
    this.boss.setPose('charge', 1.1);
    this.boss.say(this.boss.type.lines.phase[Math.min(i, this.boss.type.lines.phase.length - 1)], 3.2);

    window.HN.HUD.showBanner(ph.name, `PHASE ${i + 1} / ${G.phaseTotal}`, 3.0);
    this.phaseState = 'intro';
    this.phaseStateT = 0;
    this.phaseQuote = ph.quote;
    window.HN.audio.setIntensity(ph.intensity * 0.8);
    window.HN.audio.sfx('phase_warn');
    this.fx.phaseShift(this.boss.x, this.boss.y, this.ramp, G.stage.accent || '#fffbe8');
    this.bg.flashScreen(G.stage.accent || '#fffbe8', 0.35);
    this.bg.pulseOnce();
    /* カメラワーク: フェーズの切り替わりで一度だけ寄る（1.1 秒かけて戻す）。
     * 引いた状態から戻すのではなく「寄る」方向にするのは、
     * 寄ると視野が狭まって弾が見えにくくなるため（可読性優先）。
     * ここで寄りを入れると、ボスが予備動作に入る瞬間に視線が自然に集まる。 */
    this.cam.z = 1.055;
    this.cam.kx = (this.boss.x - FIELD_W / 2) * 0.06;
    this.cam.ky = (this.boss.y - FIELD_H / 2) * 0.06;
    /* BGM: 最終フェーズだけボス曲（第 4 章は 'final'）に切り替える。
     * 章のクライマックスで曲が変わることが、そのまま「ここが山場だ」の合図になる。 */
    /* 練習モードでは phaseList が 1 枚だけなので、i >= length-1 が常に真になる。
     *  それだと第 1 フェーズの練習でもボス曲が鳴ってしまうため、
     *  練習中は「章の本当の最終フェーズかどうか」で判定する。 */
    const isLast = (G.mode === 'practice')
      ? (this.practicePhaseIdx >= this.stageDef.phases.length - 1)
      : (i >= this.phaseList.length - 1);
    if ((isLast || ph.tier === 'final') && G.stage.songBoss && G.stage.songBoss !== G.stage.song) {
      this.switchSong(G.stage.songBoss, ph.intensity * 0.9);
    } else if (window.HN.audio.song !== G.stage.song) {
      this.switchSong(G.stage.song, ph.intensity * 0.8);
    }
    // フェーズ移行でプレイヤーが理不尽に死なないよう短い保護
    this.player.invuln = Math.max(this.player.invuln, 1.5);
    if (!this.save.seenIntro['q' + G.stage.key + i]) {
      this.save.seenIntro['q' + G.stage.key + i] = 1; this.writeSave();
      this.showQuote = true;
    } else this.showQuote = true;
  }

  /**
   * 曲を切り替える。
   *
   *  audio.playSong() は前の曲を止めて即座に次を始める（クロスフェードは無い）。
   *  そのまま切り替えると、位相が変わる瞬間に音が唐突にブツ切れる。
   *  そこで「一瞬だけ音楽を絞ってから切り替え、0.7 秒かけて戻す」という
   *  ダッキングにしてある。曲そのものは切り替わるので、
   *  「章のクライマックスで曲が変わる」ことが耳で分かる。
   */
  switchSong(key, intensity) {
    const A = window.HN.audio;
    if (!key || !A.playSong) return;
    if (A.song === key) { A.setIntensity(intensity); return; }
    A.setMusicVol(this.opt.musicVol * 0.18);
    A.playSong(key, { intensity });
    this.songDuckT = 0.7;
  }

  /** 絞った音量を戻す（switchSong の後始末） */
  updateSongDuck(dt) {
    if (!(this.songDuckT > 0)) return;
    this.songDuckT -= dt;
    if (this.songDuckT <= 0) window.HN.audio.setMusicVol(this.opt.musicVol);
  }

  updateIngame(dt) {
    const G_ = G;
    G_.time += dt;
    this.updateSongDuck(dt);
    G_.runTime += dt;
    window.HN.HUD.update(dt);

    /* ---- 一時停止 ---- */
    if (this.input.hit('pause') || this.input.hit('esc')) { this.pause(); return; }
    if (this.input.hit('fullscreen')) window.HN.Fullscreen.toggle();
    if (this.input.hit('mute')) {
      this.opt.muted = !this.opt.muted; this.writeOpt();
      this.fx.text(FIELD_W / 2, 60, this.opt.muted ? 'MUTE' : 'SOUND ON',
        { col: '#f0cf6a', size: 13, max: 1.0, latin: true });
    }

    /* ---- フェーズ進行 ---- */
    this.phaseStateT += dt;
    if (this.phaseState === 'intro') {
      if (this.phaseStateT >= 2.6) {
        this.phaseState = 'active'; this.phaseStateT = 0;
        window.HN.audio.sfx('boss_appear');
      }
    } else if (this.phaseState === 'active') {
      G_.phaseRemain -= dt;
      if (!this.warnedTime && G_.phaseRemain <= 10) {
        this.warnedTime = true; window.HN.audio.sfx('time_warning');
      }
      if (G_.phaseRemain <= 0) {
        G_.phaseRemain = 0;
        this.completePhase();
      }
    } else if (this.phaseState === 'shift') {
      if (this.phaseStateT >= 1.9) {
        this.beginPhase(this.phaseIdx + 1);
      }
    } else if (this.phaseState === 'clear') {
      if (this.phaseStateT >= 3.4) this.finishStage();
    }

    /* ---- カメラ（演出）---- */
    if (this.cam.z > 1.0005 || this.cam.kx || this.cam.ky) {
      const k = Math.min(1, dt * 3.0);
      this.cam.z += (1 - this.cam.z) * k;
      this.cam.kx += (0 - this.cam.kx) * k;
      this.cam.ky += (0 - this.cam.ky) * k;
      if (Math.abs(this.cam.z - 1) < 0.0005) { this.cam.z = 1; this.cam.kx = 0; this.cam.ky = 0; }
    }

    /* ---- ボスの更新 ---- */
    this.boss.update(dt, this);
    this.boss.homeY = FIELD_H * (G_.stage.bossHomeY ?? 0.26);

    /* ---- パターンの更新 ---- */
    if (this.phaseState === 'active' || this.phaseState === 'intro') {
      const ph = this.phaseList[this.phaseIdx];
      const pt = this.phaseStateT + (this.phaseState === 'intro' ? (this.phaseDur - 2.6) * -1 : 0);
      const elapsed = this.phaseState === 'intro' ? 0 : this.phaseStateT;
      const active = this.phaseState === 'active';
      for (const L of this.layers) {
        if (!active && L.at > 0) continue;
        if (!L.started) {
          if (!active) continue;
          if (elapsed < L.at) continue;
          L.started = true;
          L.inst.t = elapsed - L.at;
        }
        if (L.until != null && elapsed > L.until) continue;
        const c = this.patCtx(elapsed - L.at);
        try { L.inst.update(dt, c); } catch (e) {
          console.error('パターン例外', L.key, e);
          L.started = false;  // ループ暴走を避ける
          this.layers.splice(this.layers.indexOf(L), 1);
          break;
        }
      }
      // ステージ終盤で密度を上げる（原作の「密度が上がる」）
      if (active) {
        const prog = 1 - G_.phaseRemain / this.phaseDur;
        window.HN.audio.setIntensity((ph.intensity * 0.8) + prog * 0.35);
      }
    }

    /* ---- プレイヤー ---- */
    if (this.deathT > 0) {
      this.deathT -= dt;
      if (this.deathT <= 0) {
        if (G_.lives < 0) { this.setState('gameover'); return; }
        this.player.respawn();
        this.sys.cancelInRadius(this.player.x, this.player.y, 150, true);
        this.fx.ring({ x: this.player.x, y: this.player.y, r0: 4, r1: 80, max: 0.5, col: '#8fe8f2', width: 3 });
      }
    } else {
      this.player.update(dt, this.input, this.sys);
      // 観測の発動（X / Backspace）
      if (this.input.hit('cancel')) this.tryObserve();
    }

    /* ---- 弾 ---- */
    const wasCount = this.sys.count;
    this.sys.speedCapGlobal = G_.dif.speedCap;
    this.sys.update(dt);

    /* ---- 衝突 ---- */
    if (this.deathT <= 0 && !this.player.dead) {
      const c = this.sys.collide(this.player.x, this.player.y, this.player.r,
        this.player.grazeR, this.player.invulnerable);
      if (c.graze > 0) {
        G_.graze += c.graze;
        G_.gauge = Math.min(G_.gaugeMax, G_.gauge + c.graze * 1.6);
        G_.score += Math.round(c.graze * 120 * G_.dif.grazeBonus);
        window.HN.audio.sfx('graze');
        this.fx.graze(this.player.x, this.player.y);
        if (Math.floor(G_.graze / 100) > this.grazeMile) {
          this.grazeMile = Math.floor(G_.graze / 100);
          window.HN.audio.sfx('graze_milestone');
          this.fx.text(this.player.x, this.player.y - 22, `GRAZE ${this.grazeMile * 100}`,
            { col: '#8fe8f2', size: 11, max: 1.1, latin: true });
        }
      }
      if (c.hit) { this.lastHitBy = c.hitBy ? c.hitBy.type : 'laser'; this.playerDown(); }
    }

    /* ---- 演出 ---- */
    if (this.opt.ambient) this.fx.ambient(FIELD_W, FIELD_H, dt);
    this.fx.update(dt);
    if (this.fx.shake > 0) this.bg.shake = Math.max(this.bg.shake, this.fx.shake * 0.35);
    const prog = this.phaseState === 'active'
      ? 1 - Math.max(0, G_.phaseRemain) / this.phaseDur : 0;
    const bgState = window.HN.lerp(
      (this.phaseList[Math.max(0, this.phaseIdx)] || {}).bgState ?? 0,
      1, prog * 0.55);
    this.bg.update(dt, bgState, 1 + (G_.dif.d.speedMul - 1) * 0.5);

  }

  patCtx(elapsed) {
    const b = this.boss;
    return {
      sys: this.sys, dif: G.dif, player: this.player,
      W: FIELD_W, H: FIELD_H, t: elapsed,
      bx: b.x, by: b.y + 6,
      ramp: this.rampNow,
      rand: Math.random,
      aim: () => Math.atan2(this.player.y - (b.y + 6), this.player.x - b.x),
      sfx: (n, o) => window.HN.audio.sfx(n, o),
    };
  }

  /* -------------------------------------------------- 被弾・死亡 ------- */
  playerDown() {
    if (!this.player.takeHit()) return;
    G.lives--; G.misses++; G.noMiss = false;
    G.score = Math.max(0, G.score - 0);
    // ゲージは 1/3 に減るが 0 にはしない（立て直しの余地を残す）
    G.gauge = Math.floor(G.gauge / 3);
    window.HN.audio.sfx('hit');
    this.fx.playerHit(this.player.x, this.player.y);
    this.bg.flashScreen('#e05575', 0.3);
    this.player.die();
    this.deathT = 1.35;
    this.sys.cancelInRadius(this.player.x, this.player.y, 190, true);
    window.HN.audio.setIntensity(Math.max(0.05, window.HN.audio.intensity - 0.3), true);
  }

  /* -------------------------------------------------- 観測 -------------- */
  tryObserve() {
    if (G.gauge < G.gaugeMax) {
      window.HN.audio.sfx('ui_back');
      this.fx.text(this.player.x, this.player.y - 24, 'まだ', { col: '#8b94ad', size: 11, max: 0.6 });
      return;
    }
    G.gauge = 0; G.observations++;
    window.HN.audio.sfx('bomb');
    this.fx.observation(this.player.x, this.player.y);
    this.bg.flashScreen('#fffbe8', 0.4);
    this.bg.shakeScreen(0.8);
    // 弾を消して点に変換
    const n = this.sys.cancelInRadius(FIELD_W / 2, FIELD_H / 2, 900, true);
    G.score += n * 40;
    // ボスの重ね合わせが収束 → 硬直（＝時間が止まる）
    this.boss.flapStun(4.4);
    this.boss.flash(0.5);
    this.sys.freezeTime = 0.25;
    window.HN.audio.sfx('bullet_cancel');
    this.fx.text(FIELD_W / 2, FIELD_H * 0.42, '観測', { col: '#fffbe8', size: 26, max: 1.4, outline: 4 });
    this.fx.text(FIELD_W / 2, FIELD_H * 0.42 + 22, '— 重ね合わせの収束 —',
      { col: '#f0cf6a', size: 11, max: 1.6 });
  }

  /* -------------------------------------------------- フェーズ完了 ------ */
  completePhase() {
    if (this.phaseState !== 'active') return;
    const last = this.phaseIdx >= this.phaseList.length - 1;
    const bonus = 5000 + Math.round(this.phaseRemain * 0 + 0);
    const timeBonus = 0;
    G.score += bonus;
    G.phaseRemain = 0;
    this.sys.clear(true);
    if (last) {
      this.phaseState = 'clear'; this.phaseStateT = 0;
      window.HN.audio.sfx('stage_clear');
      this.boss.setPose('defeat');
      this.boss.say(this.boss.type.lines.defeat[0], 4.0);
      this.fx.bossBreak(this.boss.x, this.boss.y, this.ramp);
      this.bg.flashScreen('#fffbe8', 0.6);
      window.HN.audio.setIntensity(0.9);
      this.fx.stageClear(FIELD_W, FIELD_H);
      const nb = this.mode === 'story' ? (this.stageDef.id) : 0;
      if (nb > 0) {
        this.save.cleared[this.stageDef.id - 1] = true;
        this.save.unlocked = Math.max(this.save.unlocked, Math.min(window.HN.STAGES.length, this.stageDef.id + 1));
      }
      const key = `${this.mode === 'story' ? 's' : 'p'}${this.stageDef.id}_${G.difKey}`;
      this.save.best[key] = {
        score: Math.max(G.score, (this.save.best[key] || {}).score || 0),
        graze: Math.max(G.graze, (this.save.best[key] || {}).graze || 0),
        noMiss: this.save.best[key] && this.save.best[key].noMiss ? true : (G.noMiss && true),
        clear: true,
      };
      this.writeSave();
    } else {
      this.phaseState = 'shift'; this.phaseStateT = 0;
      window.HN.audio.sfx('phase_change');
      this.boss.setPose('shift', 1.4);
      this.boss.flash(0.4);
      this.fx.phaseShift(this.boss.x, this.boss.y, this.ramp, G.stage.accent || '#fffbe8');
      this.bg.flashScreen('#fffbe8', 0.35);
      this.fx.text(FIELD_W / 2, FIELD_H * 0.44, 'PHASE CLEAR', { col: '#f0cf6a', size: 20, max: 1.6, latin: true });
      this.fx.text(FIELD_W / 2, FIELD_H * 0.44 + 20, `+${bonus}`, { col: '#e8ecf7', size: 12, max: 1.6, latin: true });
    }
  }

  finishStage() {
    this.results = {
      stage: G.stage.title,
      score: G.score, graze: G.graze, misses: G.misses,
      observations: G.observations, noMiss: G.noMiss,
      lives: G.lives, dif: G.difKey,
      time: G.runTime,
      mode: this.mode,
      phases: G.phaseTotal,
    };
    if (this.mode === 'story' && this.stageDef.finale) this.setState('allclear');
    else this.setState('results');
  }

  /* ========================================================= ループ ===== */
  frame(dt) {
    const I = this.input;
    if (!I) return;
    this.pollResize();
    // 画面内ボタン（タッチ端末）はゲーム中とポーズ中だけ有効にする。
    // メニューでは画面のどこを叩いても「決定」にしたいため。
    I.touchUI = (G.state === 'ingame' || G.state === 'pause');
    // どの画面でも効くショートカット
    if (I.hit('fullscreen')) window.HN.Fullscreen.toggle();

    switch (G.state) {
      case 'boot': this.drawBoot(); break;
      case 'stageintro': this.updateIntro(dt); this.drawStageIntro(); break;
      case 'ingame':
        if (this.paused) { this.updatePause(dt); this.drawPaused(); }
        else {
          this.updateIngame(dt);
          if (G.state === 'gameover') { this.drawGameOver(); break; }
          this.drawWorld();
          window.HN.HUD.draw(this.bctx, G);
          if (this.showQuote) this.drawQuote();
          this.present();
        }
        break;
      case 'gameover': this.updateGameOver(dt); break;
      case 'pause': this.updatePause(dt); this.drawPaused(); break;
      case 'results': this.updateResults(dt); break;
      case 'allclear': this.updateAllClear(dt); break;
      default:
        // メニュー系は screens.js に委譲
        window.HN.Screens.update(dt, I, this);
        window.HN.Screens.draw(this.bctx, this, G);
        this.present();
        break;
    }
    I.endFrame();
    G.stateT += dt;
  }

  pollResize() {
    if (this._w !== innerWidth || this._h !== innerHeight) {
      this._w = innerWidth; this._h = innerHeight;
      this.resize();
    }
  }

  pause() {
    if (G.state !== 'ingame' && G.state !== 'stageintro') return;
    this.paused = true;
    this.pauseIdx = 0;
    window.HN.audio.setIntensity(0.0, true);
    window.HN.audio.setMusicVol(this.opt.musicVol * 0.35);
  }
  unpause() {
    this.paused = false;
    window.HN.audio.setMusicVol(this.opt.musicVol);
    if (this.phaseList && this.phaseList[this.phaseIdx]) {
      window.HN.audio.setIntensity(this.phaseList[this.phaseIdx].intensity * 0.8);
    }
  }

  updatePause(dt) {
    const I = this.input;
    const items = PAUSE_ITEMS;
    if (I.hit('up')) { this.pauseIdx = (this.pauseIdx + items.length - 1) % items.length; window.HN.audio.sfx('ui_move'); }
    if (I.hit('down')) { this.pauseIdx = (this.pauseIdx + 1) % items.length; window.HN.audio.sfx('ui_move'); }
    /* ポーズを開くのは P / Esc だが、閉じる側に Esc が入っていなかった。
     *  「P / Esc で再開」と画面にも書いてあるので、Esc でも閉じられるようにする。 */
    if (I.hit('pause') || I.hit('esc') || I.hit('cancel')) { this.unpause(); window.HN.audio.sfx('ui_back'); return; }
    if (I.hit('confirm')) {
      // タップで選ぶ（スマホには十字キーが無い）。
      // 「決定」がポインタ由来なら、指の位置にある項目を選んでから実行する。
      if (I.lastDevice === 'pointer' && I.ptr.active) {
        const i = this.pauseItemAt(I.ptr.y);
        if (i >= 0) this.pauseIdx = i;
      }
      window.HN.audio.sfx('ui_ok');
      switch (this.pauseIdx) {
        case 0: this.unpause(); break;
        case 1: this.paused = false; this.startRun(G.difKey, G.stageIdx, this.mode); break;
        case 2: this.paused = false; this.sys.clear(false); this.setState('title'); break;
        case 3: window.HN.Fullscreen.toggle(); break;
        case 4: this.opt.muted = !this.opt.muted; this.writeOpt(); break;
      }
    }
  }

  /** ポーズメニューの項目の当たり判定（描画と同じ座標から求める） */
  pauseItemAt(y) {
    for (let i = 0; i < PAUSE_ITEMS.length; i++) {
      const iy = 200 + i * 30;
      if (y >= iy - 4 && y <= iy + 22) return i;
    }
    return -1;
  }

  drawPaused() {
    this.drawWorld();
    window.HN.HUD.draw(this.bctx, G);
    const ctx = this.bctx;
    ctx.save();
    ctx.fillStyle = 'rgba(5,6,12,0.72)';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    const { drawText } = window.HN;
    drawText(ctx, 'PAUSE', FIELD_W / 2, 120, {
      size: 30, color: '#fffbe8', align: 'center', outline: 5, latin: true, bold: true,
    });
    drawText(ctx, '— 一時停止 —', FIELD_W / 2, 152, { size: 11, color: '#8b94ad', align: 'center', outline: 3 });
    const items = PAUSE_ITEMS;
    items.forEach((it, i) => {
      const sel = i === this.pauseIdx;
      const y = 200 + i * 30;
      if (sel) {
        ctx.fillStyle = 'rgba(240,207,106,0.14)';
        ctx.fillRect(FIELD_W / 2 - 130, y - 4, 260, 26);
      }
      drawText(ctx, it, FIELD_W / 2, y, {
        size: 15, color: sel ? '#f0cf6a' : '#c9cfe2', align: 'center', outline: 3,
      });
      if (i === 4) drawText(ctx, this.opt.muted ? 'MUTE' : 'ON', FIELD_W / 2 + 82, y + 1,
        { size: 10, color: '#8b94ad', align: 'center', latin: true, outline: 2 });
    });
    drawText(ctx, 'P / Esc で再開   F でフルスクリーン   タップで項目を選ぶ', FIELD_W / 2, FIELD_H - 42,
      { size: 10, color: '#7c86a2', align: 'center', outline: 2 });
    ctx.restore();
    this.present();
  }

  /**
   * 会話ウィンドウを描く（導入・クリア後・全クリア後で共通）。
   *
   *  レイアウトは「顔チップ＋名前」を上段、本文を下段の全幅に置く。
   *  本文とチップが重ならないことを構造的に保証する。
   *  立ち絵が出ている場合は顔チップを省く（同じ顔が二重になるため）。
   *
   * @param t 表示開始からの経過秒（1 秒 48 文字で送る）
   * @param useCutin 立ち絵を出しているか
   */
  drawDialogBox(ctx, line, t, useCutin) {
    const { drawText, wrapText } = window.HN;
    const c = window.HN.CHARS[line.who];
    const showingChar = !!c && c.face !== 'none';
    const bh = 152, bx = 30, by = FIELD_H - bh - 10, bw = FIELD_W - 60;

    ctx.save();
    ctx.fillStyle = 'rgba(5,6,12,0.88)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = c ? 'rgba(240,207,106,0.45)' : 'rgba(139,148,173,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = c ? 'rgba(240,207,106,0.60)' : 'rgba(139,148,173,0.50)';
    ctx.fillRect(bx + 1, by + 1, 3, bh - 2);

    // 上段: 顔チップ＋名前（立ち絵が無いときだけチップを出す）
    let textTop = by + 20;
    if (showingChar) {
      const chip = 64;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#0a0c14';
      ctx.fillRect(bx + 14, by + 14, chip + 4, chip + 4);
      ctx.restore();
      if (!useCutin) window.HN.drawFace(ctx, line.who, bx + 16, by + 16, { scale: chip / 48 });
      drawText(ctx, c.name, bx + 20 + (useCutin ? 0 : chip + 16), by + 18,
        { size: 16, color: '#f0cf6a', outline: 3 });
      if (c.role) {
        drawText(ctx, c.role, bx + 20 + (useCutin ? 0 : chip + 16), by + 40,
          { size: 9, color: '#8b94ad', outline: 2 });
      }
      textTop = by + 60;
    } else {
      // 地の文: 名前に代えて記号を置く
      ctx.save();
      ctx.globalAlpha = 0.8;
      window.HN.drawCross(ctx, bx + 22, by + 22, { scale: 1, glow: 0, pulse: 0, alpha: 0.5 });
      ctx.restore();
      drawText(ctx, '地の文', bx + 36, by + 16, { size: 11, color: '#7c86a2', outline: 2 });
      textTop = by + 40;
    }

    // 下段: 本文（全幅）。1 秒あたり 48 文字で送る。
    const lines = wrapText(ctx, line.text, bw - 40, { size: 13 });
    let remaining = Math.floor(Math.max(0, t) * 48);
    for (let i = 0; i < lines.length; i++) {
      if (remaining <= 0) break;
      const part = remaining >= lines[i].length ? lines[i] : lines[i].slice(0, remaining);
      remaining -= lines[i].length;
      drawText(ctx, part, bx + 20, textTop + i * 20, { size: 13, color: '#e6e9f2', outline: 3 });
    }

    // 注記（翻案であることの明示）
    if (line.note) {
      drawText(ctx, `※ ${line.note}`, bx + 20, by + bh - 34, { size: 8, color: '#7c86a2', outline: 2 });
    }

    // 進行ドット＋ヒント
    const dotsY = by + bh - 16;
    const dots = this.intro || this.outro || window.HN.ALL_CLEAR_DIALOGUE;
    const total = dots ? dots.length : 1;
    const cur = this.intro ? this.introIdx : (this.outro ? this.resultIdx : this.acIdx);
    for (let i = 0; i < Math.min(total, 24); i++) {
      ctx.fillStyle = i <= (cur || 0) ? '#f0cf6a' : 'rgba(232,236,247,0.20)';
      ctx.fillRect(bx + 20 + i * 9, dotsY, 6, 3);
    }
    drawText(ctx, 'Z / Enter で進む', bx + bw - 16, dotsY - 4,
      { size: 9, color: '#7c86a2', align: 'right', outline: 2 });
    ctx.restore();
  }

  /* ================================================== ステージ導入 ===== */
  /** 章の扉 → 原作の会話 → 戦闘開始 */
  updateIntro(dt) {
    const I = this.input;
    this.updateSongDuck(dt);
    // 扉（0.0〜2.2 秒）→ 会話
    if (this.introT == null) this.introT = 0;
    this.introT += dt;
    if (this.phaseState !== 'door' && this.phaseState !== 'talk') {
      this.phaseState = 'door'; this.phaseStateT = 0;
    }
    /* 扉と会話の経過時間は phaseStateT で数える。
     *  ++ は updateIngame の中にしか無く、この状態では updateIngame が走らないため、
     *  ここで進めないと**扉（2.4 秒）から永久に先へ進まない**。
     *  （新規データで章を始めると、会話に入れず扉の画面で固まっていた。
     *    tools/test-flow.js がこの不具合を見つけた。） */
    this.phaseStateT += dt;
    const line = this.intro[this.introIdx];
    if (this.phaseState === 'door' && this.phaseStateT > 2.4) {
      this.phaseState = 'talk'; this.phaseStateT = 0; this.introIdx = 0; this.lineT = 0;
      return;
    }
    if (this.phaseState === 'talk') {
      this.lineT = (this.lineT || 0) + dt;
      const dur = line ? (line.dur ?? 3.4) : 0;
      const advance = I.hit('confirm') || I.hit('cancel') || this.lineT >= dur + 0.35;
      if (advance) {
        this.introIdx++; this.lineT = 0;
        if (this.introIdx >= this.intro.length) {
          this.phaseState = 'idle';
          this.setState('ingame');
          this.switchSong(G.stage.song, 0.25);
          this.beginPhase(0);
        } else window.HN.audio.sfx('ui_move');
      }
      if (I.hit('pause') || I.hit('esc')) {
        this.phaseState = 'idle'; this.showQuote = false;
        this.setState('ingame'); this.beginPhase(0);
      }
    }
  }

  drawStageIntro() {
    const ctx = this.bctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    if (!this.bg.built) this.bg.setStage(G.stage);
    this.bg.update(dt0(this), 0.1, 0.6);
    this.bg.draw(ctx);
    ctx.fillStyle = 'rgba(4,5,10,0.58)';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);

    const { drawText, drawCross, wrapText, drawFace, CHARS } = window.HN;

    if (this.phaseState === 'door') {
      const t = this.phaseStateT;
      const a = Math.min(1, t / 0.6) * Math.min(1, Math.max(0, (2.4 - t)) / 0.5);
      ctx.save(); ctx.globalAlpha = Math.max(0, a);
      drawText(ctx, `第${this.stageDef.id}章`, FIELD_W / 2, 150, {
        size: 14, color: '#8b94ad', align: 'center', outline: 3,
      });
      drawText(ctx, G.stage.title, FIELD_W / 2, 180, {
        size: 30, color: '#fffbe8', align: 'center', outline: 6,
      });
      drawText(ctx, G.stage.subtitle, FIELD_W / 2, 222, {
        size: 11, color: '#c9cfe2', align: 'center', outline: 3,
      });
      ctx.save();
      ctx.globalAlpha = a * 0.9;
      drawCross(ctx, FIELD_W / 2, 285, { scale: 3, pulse: 0.5 + 0.5 * Math.sin(G.stateT * 2), alpha: 0.9 });
      ctx.restore();
      drawText(ctx, `${G.dif.label}　—　フェーズ ${this.phaseList ? this.phaseList.length : G.dif.phaseCount}`,
        FIELD_W / 2, 340, { size: 10, color: G.dif.d.color, align: 'center', latin: true, outline: 3 });
      ctx.restore();
    } else if (this.phaseState === 'talk') {
      const line = this.intro[this.introIdx];
      if (!line) return;
      const c = window.HN.CHARS[line.who];
      if (c && c.face !== 'none') {
        window.HN.drawCutin(ctx, line.who,
          line.side === 'left' ? 150 : FIELD_W - 150, FIELD_H - 6,
          {
            side: line.side === 'left' ? 'left' : 'right',
            alpha: Math.min(1, (this.lineT || 0) / 0.35) * 0.98, scale: 0.9,
          });
      }
      this.drawDialogBox(ctx, line, this.lineT || 0, !!(c && c.face !== 'none'));
    }
    this.present();
  }

  /* ================================================== ゲームオーバー === */
  drawGameOver() {
    this.sys.clear(false);
    this.drawWorld();
    window.HN.HUD.draw(this.bctx, G);
    const ctx = this.bctx;
    ctx.save();
    ctx.fillStyle = 'rgba(5,6,12,0.80)';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    window.HN.drawText(ctx, 'GAME OVER', FIELD_W / 2, 150, {
      size: 34, color: '#e05575', align: 'center', outline: 6, latin: true, bold: true,
    });
    window.HN.drawText(ctx, '「残り時間」を残せなかった。', FIELD_W / 2, 196, {
      size: 12, color: '#c9cfe2', align: 'center', outline: 3,
    });
    window.HN.drawText(ctx, `到達 第${this.stageDef.id}章　PHASE ${G.phaseIndex + 1}`, FIELD_W / 2, 224,
      { size: 11, color: '#8b94ad', align: 'center', outline: 3 });
    const opts = this.goItems();
    opts.forEach((o, i) => {
      const sel = i === this.goIdx;
      const y = 280 + i * 30;
      if (sel) { ctx.fillStyle = 'rgba(240,207,106,0.12)'; ctx.fillRect(FIELD_W / 2 - 130, y - 5, 260, 24); }
      window.HN.drawText(ctx, o, FIELD_W / 2, y, {
        size: 14, color: sel ? '#f0cf6a' : '#c9cfe2', align: 'center', outline: 3,
      });
    });
    ctx.restore();
    this.present();
  }

  goItems() {
    return this.mode === 'practice'
      ? ['もう一度', 'タイトルへ']
      : ['もう一度（この章）', '章をえらぶ', 'タイトルへ'];
  }

  updateGameOver(dt) {
    const I = this.input;
    const n = this.goItems().length;
    if (this.goIdx == null) this.goIdx = 0;
    if (I.hit('up')) { this.goIdx = (this.goIdx + n - 1) % n; window.HN.audio.sfx('ui_move'); }
    if (I.hit('down')) { this.goIdx = (this.goIdx + 1) % n; window.HN.audio.sfx('ui_move'); }
    if (I.hit('cancel') || I.hit('esc')) { this.goIdx = n - 1; }
    if (!I.hit('confirm')) { this.sys.update(dt); this.fx.update(dt); this.drawGameOver(); return; }
    window.HN.audio.sfx('ui_ok');
    if (this.mode === 'practice') {
      if (this.goIdx === 0) this.startRun(G.difKey, G.stageIdx, 'practice', this.practicePhase);
      else { this.goIdx = 0; this.setState('title'); window.HN.Screens.reset(['title']); }
      return;
    }
    if (this.goIdx === 0) this.startRun(G.difKey, G.stageIdx, 'story');
    else if (this.goIdx === 1) { this.goIdx = 0; window.HN.Screens.reset(['title', 'diff', 'stage']); this.setState('title'); }
    else { this.goIdx = 0; window.HN.Screens.reset(['title']); this.setState('title'); }
  }

  /* ================================================== リザルト ========= */
  updateResults(dt) {
    const I = this.input;
    // 1) クリア後の会話 → 2) 成績表
    if (this.resultPhase == null) {
      this.resultPhase = 'talk';
      this.resultIdx = 0; this.resultT = 0;
      this.outro = (window.HN.OUTROS[this.stageDef.id] || []).slice();
    }
    if (this.resultPhase === 'talk') {
      this.resultT += dt;
      const line = this.outro[this.resultIdx];
      const dur = line ? (line.dur ?? 3.4) : 0;
      if (I.hit('confirm') || I.hit('cancel') || I.hit('esc') || this.resultT >= dur + 0.4) {
        this.resultIdx++; this.resultT = 0;
        if (this.resultIdx >= this.outro.length || this.outro.length === 0) this.resultPhase = 'board';
        else window.HN.audio.sfx('ui_move');
      }
    } else {
      const n = 3;
      if (I.hit('up')) { this.idx2 = (this.idx2 ?? 0); this.idx2 = (this.idx2 + n - 1) % n; window.HN.audio.sfx('ui_move'); }
      if (I.hit('down')) { this.idx2 = ((this.idx2 ?? 0) + 1) % n; window.HN.audio.sfx('ui_move'); }
      if (I.hit('confirm')) {
        window.HN.audio.sfx('ui_ok');
        const i = this.idx2 ?? 0;
        const next = this.stageDef.id;   // STAGES は 0 始まりの配列なので id がそのまま次の添字
        if (i === 0) {
          if (this.mode === 'story' && next < window.HN.STAGES.length) {
            this.resultPhase = null; this.idx2 = 0;
            this.startRun(G.difKey, next, 'story');
          } else { this.resultPhase = null; this.idx2 = 0; this.setState('title'); window.HN.Screens.reset(['title']); }
        } else if (i === 1) {
          this.resultPhase = null; this.idx2 = 0; this.startRun(G.difKey, this.stageDef.id - 1, 'story');
        } else {
          this.resultPhase = null; this.idx2 = 0;
          window.HN.Screens.reset(['title']); this.setState('title');
        }
      }
    }
    this.drawResults();
  }

  drawResults() {
    const ctx = this.bctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (!this.bg.built) this.bg.setStage(G.stage);
    this.bg.update(1 / 60, 0.5, 0.5);
    this.bg.draw(ctx);
    ctx.fillStyle = 'rgba(5,6,12,0.78)';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    const R = this.results || {};
    const { drawText, wrapText, CHARS } = window.HN;

    if (this.resultPhase === 'talk') {
      const line = this.outro[this.resultIdx];
      if (line) {
        const c = CHARS[line.who];
        const hasArt = !!(c && c.face !== 'none');
        if (hasArt) {
          window.HN.drawCutin(ctx, line.who,
            line.side === 'left' ? 150 : FIELD_W - 150, FIELD_H - 6,
            {
              side: line.side === 'left' ? 'left' : 'right',
              alpha: Math.min(1, this.resultT / 0.35) * 0.98, scale: 0.9,
            });
        }
        this.drawDialogBox(ctx, line, this.resultT, hasArt);
      }
    } else {
      // 成績表
      drawText(ctx, 'STAGE CLEAR', FIELD_W / 2, 34, {
        size: 28, color: '#f0cf6a', align: 'center', outline: 6, latin: true, bold: true,
      });
      drawText(ctx, `${R.stage}`, FIELD_W / 2, 70, {
        size: 14, color: '#e8ecf7', align: 'center', outline: 3,
      });
      const rows = [
        ['SCORE', window.HN.fmtNum(R.score || 0), '#fffbe8'],
        ['かすり GRAZE', String(R.graze || 0), '#8fe8f2'],
        ['観測 OBSERVE', String(R.observations || 0), '#f0cf6a'],
        ['被弾 MISS', String(R.misses || 0), R.misses ? '#e05575' : '#7fd6a0'],
        ['残機 LIVES', String(Math.max(0, R.lives || 0)), '#e8ecf7'],
        ['難易度', R.dif || '', window.HN.DIFFICULTY[R.dif] ? window.HN.DIFFICULTY[R.dif].color : '#e8ecf7'],
        ['所要時間', window.HN.fmtTime(R.time || 0), '#c9cfe2'],
      ];
      let y = 112;
      for (const [k, v, col] of rows) {
        drawText(ctx, k, 150, y, { size: 12, color: '#8b94ad', outline: 3 });
        drawText(ctx, String(v), 470, y, { size: 15, color: col, align: 'right', latin: true, outline: 3 });
        y += 26;
      }
      if (R.noMiss) {
        const a = 0.6 + 0.4 * Math.sin(G.stateT * 5);
        ctx.save(); ctx.globalAlpha = a;
        drawText(ctx, 'NO MISS', 320, y + 6, { size: 18, color: '#7fd6a0', align: 'center', outline: 4, latin: true });
        ctx.restore();
      }
      const opts = this.resultPhase === 'board' ? [
        this.stageDef.id < window.HN.STAGES.length ? `次の章へ（第${this.stageDef.id + 1}章）` : 'タイトルへ',
        'この章をもう一度', 'タイトルへ',
      ] : [];
      const n = 3;
      this.idx2 = this.idx2 ?? 0;
      opts.forEach((o, i) => {
        const sel = i === this.idx2;
        const yy = 344 + i * 28;
        if (sel) { ctx.fillStyle = 'rgba(240,207,106,0.12)'; ctx.fillRect(FIELD_W / 2 - 140, yy - 5, 280, 24); }
        drawText(ctx, o, FIELD_W / 2, yy, {
          size: 13, color: sel ? '#f0cf6a' : '#c9cfe2', align: 'center', outline: 3,
        });
      });
    }
    this.present();
  }

  /* ================================================== 全クリア ========= */
  updateAllClear(dt) {
    const I = this.input;
    if (this.acIdx == null) { this.acIdx = 0; this.acT = 0; this.acPhase = 'talk'; }
    if (this.acPhase === 'talk') {
      this.acT += dt;
      const lines = window.HN.ALL_CLEAR_DIALOGUE;
      const line = lines[this.acIdx];
      const dur = line ? (line.dur ?? 3.4) : 0;
      if (I.hit('confirm') || this.acT >= dur + 0.4) {
        this.acIdx++; this.acT = 0;
        if (this.acIdx >= lines.length) this.acPhase = 'end';
        else window.HN.audio.sfx('ui_move');
      }
    } else {
      this.acT += dt;
      if (I.hit('confirm') || I.hit('cancel') || this.acT > 4) {
        window.HN.Screens.reset(['title']); this.setState('title');
      }
    }
    this.drawAllClear();
  }

  drawAllClear() {
    const ctx = this.bctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (!this.bg.built) this.bg.setStage(G.stage);
    this.bg.update(1 / 60, 1.0, 0.5);
    this.bg.draw(ctx);
    ctx.fillStyle = 'rgba(5,6,12,0.80)';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    const { drawText, drawCross, wrapText, CHARS } = window.HN;

    if (this.acPhase === 'talk') {
      const lines = window.HN.ALL_CLEAR_DIALOGUE;
      const line = lines[this.acIdx];
      if (line) {
        const c = CHARS[line.who];
        const hasArt = !!(c && c.face !== 'none');
        if (hasArt) {
          window.HN.drawCutin(ctx, line.who, FIELD_W - 150, FIELD_H - 6,
            { side: 'right', alpha: Math.min(1, this.acT / 0.35) * 0.98, scale: 0.9 });
        }
        this.outro = null;   // 進行ドットは ALL_CLEAR_DIALOGUE 側を参照させる
        this.drawDialogBox(ctx, line, this.acT, hasArt);
      }
    } else {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawCross(ctx, FIELD_W / 2, 120, { scale: 7, pulse: 0.5 + 0.5 * Math.sin(G.stateT * 1.4), alpha: 0.95, glow: 1.2 });
      ctx.restore();
      drawText(ctx, '✝', FIELD_W / 2, 210, { size: 10, color: '#f0cf6a', align: 'center', outline: 3 });
      drawText(ctx, 'わからないことが、✝本質✝。', FIELD_W / 2, 232, {
        size: 20, color: '#fffbe8', align: 'center', outline: 5,
      });
      drawText(ctx, 'でも、来年もある。それだけで十分だ。', FIELD_W / 2, 264, {
        size: 13, color: '#c9cfe2', align: 'center', outline: 3,
      });
      const R = this.results || {};
      drawText(ctx, `${R.dif}　SCORE ${window.HN.fmtNum(R.score || 0)}　かすり ${R.graze || 0}　被弾 ${R.misses}`,
        FIELD_W / 2, 316, { size: 11, color: '#8b94ad', align: 'center', outline: 3, latin: true });
      drawText(ctx, (this.save.cleared || []).filter(Boolean).length >= window.HN.STAGES.length
        ? '— ALL STAGES CLEARED —' : '', FIELD_W / 2, 340,
        { size: 12, color: '#7fd6a0', align: 'center', outline: 3, latin: true });
      drawText(ctx, 'Z / Enter でもどる', FIELD_W / 2, 420, {
        size: 12, color: '#f0cf6a', align: 'center', outline: 3,
        alpha: 0.6 + 0.4 * Math.sin(G.stateT * 4),
      });
    }
    this.present();
  }

  /* --------------------------------------------------- 引用表示 -------- */
  drawQuote() {
    const q = this.phaseQuote;
    if (!q) { this.showQuote = false; return; }
    const t = this.phaseStateT;
    if (this.phaseState !== 'intro' && t > 1.2) { this.showQuote = false; return; }
    if (this.phaseState === 'intro' && t > 2.6) { this.showQuote = false; return; }
    const a = this.phaseState === 'intro'
      ? Math.min(1, t / 0.35) * Math.min(1, Math.max(0, (2.7 - t)) / 0.4)
      : Math.max(0, 1 - t / 1.2);
    if (a <= 0.01) return;
    const ctx = this.bctx;
    const lines = window.HN.wrapText(ctx, q, 440, { size: 12 });
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a)) * 0.95;
    const bh = lines.length * 18 + 20;
    const by = FIELD_H * 0.30 - bh / 2;
    ctx.fillStyle = 'rgba(5,6,12,0.62)';
    ctx.fillRect(FIELD_W / 2 - 244, by, 488, bh);
    ctx.strokeStyle = 'rgba(240,207,106,0.32)';
    ctx.lineWidth = 1;
    ctx.strokeRect(FIELD_W / 2 - 243.5, by + 0.5, 487, bh - 1);
    lines.forEach((ln, i) => {
      window.HN.drawText(ctx, ln, FIELD_W / 2, by + 11 + i * 18, {
        size: 12, color: '#e6dcc0', align: 'center', outline: 2, outlineColor: '#05060c',
      });
    });
    ctx.restore();
  }

  /* --------------------------------------------------- 描画本体 -------- */
  /** フィールド（背景〜自機〜エフェクト）を buf に描く。present() は呼び出し側で 1 回だけ。 */
  drawWorld() {
    const ctx = this.bctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    // カメラ: フェーズ開始の寄り。弾の可読性を損なわない範囲（最大 5.5%）に制限する。
    const cam = this.cam;
    // save/restore の対応を構造的に保証するため、条件は 1 度だけ評価して変数に持つ
    const camOn = cam.z > 1.0005 || cam.kx !== 0 || cam.ky !== 0;
    if (camOn) {
      ctx.save();
      ctx.translate(FIELD_W / 2, FIELD_H / 2);
      ctx.scale(cam.z, cam.z);
      ctx.translate(-FIELD_W / 2 + cam.kx, -FIELD_H / 2 + cam.ky);
    }
    this.bg.draw(ctx);
    /* 描画順（後から描くものほど手前）:
     *   背景 → ボス → 予告線 → 弾グロー → 弾コア → レーザー → 予告マーカー
     *        → 自機 → エフェクト
     *
     * ボスは必ず**弾より奥**に置く。逆にすると、ボスの体と、ボスの後ろに敷いている
     * 暗い下地（alpha 0.62）が弾を隠してしまい、見えない弾に当たる事故になる。
     * 弾の視認性はこのゲームで最も優先される性質なので、ボスの見栄えより優先する。
     * ボス自身が弾に隠れてしまう問題は、後光（加算合成）と輪郭で担保している。
     */
    this.boss.draw(ctx, G.time);
    window.HN.Render.drawField(ctx, this.sys, G.time);
    if (this.deathT <= 0) this.player.draw(ctx);
    this.fx.draw(ctx);
    if (camOn) ctx.restore();
    // 低速時はフィールド全体を落として集中を促す
    if (this.player.focusT > 0.02) {
      ctx.save();
      ctx.globalAlpha = this.player.focusT * 0.16;
      ctx.fillStyle = '#05060c';
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
      ctx.restore();
    }
  }

  present() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, FIELD_W, FIELD_H);
    ctx.drawImage(this.buf, 0, 0);
    if (this.opt.scanlines) {
      ctx.save();
      ctx.globalAlpha = 0.055;
      ctx.fillStyle = '#000';
      for (let y = 0; y < FIELD_H; y += 3) ctx.fillRect(0, y, FIELD_W, 1);
      ctx.restore();
    }
  }

  drawBoot() {
    const ctx = this.bctx;
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    const { drawCross, drawText } = window.HN;
    const t = performance.now() / 1000;
    drawCross(ctx, FIELD_W / 2, FIELD_H / 2 - 30, { scale: 3, pulse: 0.5 + 0.5 * Math.sin(t * 1.6), alpha: 0.9 });
    drawText(ctx, '本質', FIELD_W / 2, FIELD_H / 2 + 34, {
      size: 22, color: '#f0cf6a', align: 'center', outline: 4,
    });
    const w = 260;
    ctx.fillStyle = 'rgba(232,236,247,0.18)';
    ctx.fillRect(FIELD_W / 2 - w / 2, FIELD_H / 2 + 74, w, 3);
    ctx.fillStyle = '#f0cf6a';
    ctx.fillRect(FIELD_W / 2 - w / 2, FIELD_H / 2 + 74, Math.round(w * this.loadProg), 3);
    drawText(ctx, '立ち絵を読み込み中…', FIELD_W / 2, FIELD_H / 2 + 86, {
      size: 10, color: '#8b94ad', align: 'center', outline: 2,
    });
    this.present();
  }
}

/* 画面リサイズでキャンバスの配置が CSS 前提になるため、外側のスタイルを保証する */
window.HN = window.HN || {};
Object.assign(window.HN, { Game, G, FIELD_W, FIELD_H, SAVE_KEY });
