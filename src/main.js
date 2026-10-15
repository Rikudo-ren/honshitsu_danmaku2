/**
 * main.js — ゲーム本体 (状態機械 + ループ + 進行)
 *
 * 画面の流れ:
 *   boot → title → (help) → difficulty → play(幕) → result → 次の幕 … → allclear
 *                                     ↘ practice (幕/フェーズ選択) ↗
 *                                     ↘ pause / gameover
 *
 * ゲームプレイの原則:
 *   ・自機は攻撃しない。フェーズの残り時間を耐えるだけ。
 *   ・残り時間は常に右上に大きく表示する (hud.js)。
 *   ・理不尽を作らない: 被弾時は弾を消し、無敵時間を与え、必ず立て直せる。
 */
import {
  VIEW_W, VIEW_H, VIEW_H as VH, FIELD, DIFFICULTIES, DIFFICULTY_ORDER,
  BOMB, MAX_FRAME_DT, COLORS,
} from './core/const.js';
import { clamp, lerp, fmtScore, fmtTime } from './core/util.js';
import { RNG } from './core/rng.js';
import { Input } from './core/input.js';
import { audio } from './core/audio.js';
import { Surface } from './render/surface.js';
import { FX } from './render/fx.js';
import { Camera } from './render/camera.js';
import { Background } from './render/background.js';
import { loadDotFont, drawText } from './render/text.js';
import { Bullets } from './game/bullets.js';
import { Lasers } from './game/lasers.js';
import { Player } from './game/player.js';
import { Boss, STATE as BS, FACE } from './game/boss.js';
import { Diff, PhaseRunner } from './game/patterns.js';
import { drawHud, drawHint, drawTimer } from './game/hud.js';
import { STAGES } from './game/stages.js';
import { CHARACTERS } from './game/characters.js';
import { DialogueBox, SpeechBubble, STAGE_DIALOGUE } from './ui/dialogue.js';
import * as UI from './ui/screens.js';
import * as saveMod from './core/save.js';

/* ------------------------------------------------------------------ *
 * 効果音の一覧 (public/assets/sfx/*.wav — tools/gen_sfx.mjs が生成)
 * ------------------------------------------------------------------ */
const SFX_NAMES = [
  'ui_move', 'ui_select', 'ui_cancel', 'shot_small', 'shot_medium', 'shot_heavy',
  'charge', 'beam_start', 'warn', 'phase_in', 'phase_break', 'boss_appear',
  'player_hit', 'player_death', 'graze', 'cancel', 'extend', 'time_low',
  'stage_clear', 'gameover', 'tick', 'bell', 'noise_sweep', 'glitch',
  'warp_in', 'warp_out', 'fanfare',
];

/* ------------------------------------------------------------------ *
 * クレジット (タイトル/ヘルプに表示する。詳細は docs/ASSETS.md)
 * ------------------------------------------------------------------ */
const CREDITS = [
  '原作小説: ユーザー提供 (立ち絵 78点も同様)',
  'ドットフォント: DotGothic16 / Fontworks Inc. (SIL OFL 1.1)',
  '効果音: 自作 (grumdrig/jsfxr, Unlicense の合成コアを使用して生成)',
  'BGM: 自作 (Web Audio によるリアルタイム合成)',
  '立ち絵のピクセル化: tools/make_portraits.py (自作パイプライン)',
  '弾・背景・UI・エフェクト: すべて自作 (外部素材は取得できず未使用)',
];

/* ------------------------------------------------------------------ *
 * 小さなメニュー
 * ------------------------------------------------------------------ */
class Menu {
  constructor(items = []) { this.items = items; this.cur = 0; }
  set(items, cur = 0) { this.items = items; this.cur = clamp(cur, 0, Math.max(0, items.length - 1)); }
  move(d) {
    const n = this.items.length;
    if (!n) return;
    this.cur = (this.cur + d + n) % n;
    audio.play('ui_move', { vol: 0.35 });
  }
  get sel() { return this.items[this.cur]; }
  get label() {
    const s = this.sel;
    return typeof s === 'string' ? s : (s?.label ?? '');
  }
}

/* ------------------------------------------------------------------ *
 * Game
 * ------------------------------------------------------------------ */
class Game {
  constructor() {
    this.canvas = document.getElementById('screen');
    this.s = new Surface(this.canvas);
    this.fx = new FX();
    this.input = new Input(this.canvas);
    this.cam = this.s.cam = new Camera();
    this.bg = new Background();
    this.bullets = new Bullets();
    this.lasers = new Lasers();
    this.player = new Player(this.fx);
    this.boss = null;

    this.rng = new RNG(0x4d2a1f7b);
    this.runner = new PhaseRunner();
    this.runner.rnd = () => this.rng.next();

    this.menu = new Menu();
    this.dialogue = new DialogueBox();
    this.bubble = new SpeechBubble();

    this.mode = 'boot';
    this.modeT = 0;
    this.time = 0;
    this.lowTickAt = 0;
    this.sub = 'active';
    this.subT = 0;
    this.prevAlive = true;

    this.diffKey = 'NORMAL';
    this.stageIndex = 0;
    this.phaseIndex = 0;
    this.practice = false;
    this.practicePhase = 0;

    this.gauge = { value: 0, max: BOMB.max };
    this.lives = 3;
    this.score = 0;
    this.graze = 0;
    this.dodge = 0;
    this.maxDodge = 0;
    this.hits = 0;
    this.bombsUsed = 0;
    this.elapsed = 0;
    this.phaseElapsed = 0;
    this.phaseFastest = null;
    this.phaseTimes = [];

    this.hud = {
      hud: 'on', act: '', stageName: '', phaseLabel: '', phaseIndex: 0, phaseTotal: 0,
      timeLeft: 0, phaseLen: 0, bossName: '', bossTitle: '', lives: 3, bombs: 3,
      bombGauge: 0, score: 0, graze: 0, dodged: 0, hits: 0, noMiss: true,
      elapsed: 0, practice: false, formIndex: 0, formTotal: 0,
    };

    this.save = saveMod.loadSave();
    this.booting = true;
    this.fps = 60;
    this.perf = { avg: 16.7, slow: 0, warn: 0 };

    // 乱数だけで理不尽を出さないため、幕ごとにシードを固定する
    this.stageSeed = 0;
  }

  /* ================================================================ *
   * 起動
   * ================================================================ */
  async boot() {
    const bar = document.getElementById('bootbar');
    const msg = document.getElementById('bootmsg');
    const set = (p, m) => {
      if (bar) bar.style.width = `${Math.round(p * 100)}%`;
      if (msg && m) msg.textContent = m;
    };
    set(0.05, 'フォント読み込み中…');
    await loadDotFont();
    set(0.35, '効果音を生成/読み込み中…');
    await audio.loadSfx(SFX_NAMES, (p) => set(0.35 + p * 0.5));
    set(0.9, '起動');
    audio.setVolume(this.save.settings.volume ?? 0.85);
    audio.setMuted(!!this.save.settings.muted);

    const boot = document.getElementById('boot');
    if (boot) { boot.classList.add('hidden'); setTimeout(() => boot.remove(), 600); }
    this.booting = false;
    this.setMode(this.save.resume ? 'title' : 'title');
    this.menu.set(TITLE_MENU(this.save));
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  setMode(m) {
    this.mode = m;
    this.modeT = 0;
    if (m === 'title') {
      audio.playSong('title', { intensity: 2, fade: 0.8 });
      this.menu.set(TITLE_MENU(this.save));
    } else if (m === 'diff') {
      this.menu.set(DIFFICULTY_ORDER.map((k) => ({ label: DIFFICULTIES[k].label, sub: DIFFICULTIES[k].jp })));
    } else if (m === 'practice') {
      this.practiceMenu = { col: 0, row: 0, idx: 0 };
      this.menu.set(['practice']);
    } else if (m === 'help') {
      this.menu.set(['戻る']);
    }
  }

  /* ================================================================ *
   * ループ
   * ================================================================ */
  loop(now) {
    requestAnimationFrame(this.loop);
    if (this._last == null) this._last = now;
    let dtMs = now - this._last;
    this._last = now;
    if (dtMs > MAX_FRAME_DT * 6) dtMs = MAX_FRAME_DT * 2;   // タブ復帰
    const dt = clamp(dtMs / 1000, 0, MAX_FRAME_DT / 1000);
    this.time += dt;
    this.fps = lerp(this.fps, 1000 / Math.max(1, dtMs), 0.06);

    try {
      this.update(dt);
      this.render();
    } catch (e) {
      console.error('[loop] 例外:', e);
      this.mode = 'error';
      this.error = e;
    }
    this.input.update();
  }

  /* ================================================================ *
   * 更新
   * ================================================================ */
  update(dt) {
    this.modeT += dt;
    const inp = this.input;

    switch (this.mode) {
      case 'error': if (inp.hit('confirm')) location.reload(); break;
      case 'title': this._updTitle(dt, inp); break;
      case 'help': if (inp.hit('cancel', 'confirm', 'bomb')) { audio.play('ui_cancel', { vol: 0.4 }); this.setMode('title'); } break;
      case 'diff': this._updDiff(dt, inp); break;
      case 'practice': this._updPractice(dt, inp); break;
      case 'story': this._updStory(dt, inp); break;
      case 'play': this._updPlay(dt, inp); break;
      case 'pause': this._updPause(dt, inp); break;
      case 'result': this._updResult(dt, inp); break;
      case 'gameover': this._updGameOver(dt, inp); break;
      case 'allclear': this._updAllClear(dt, inp); break;
      default: break;
    }
    if (this.mode !== 'play' && this.mode !== 'pause') this.bg.update(dt, { camera: this.cam, intensity: 0.4 });
  }

  /* ---------------------------------------------------------- title --- */
  _updTitle(dt, inp) {
    const items = TITLE_MENU(this.save);
    if (this.menu.items.length !== items.length) this.menu.set(items);
    if (inp.hit('up')) this.menu.move(-1);
    if (inp.hit('down')) this.menu.move(1);
    if (inp.hit('confirm')) {
      audio.play('ui_select', { vol: 0.5 });
      const label = this.menu.label;
      if (label === 'つづきから' && this.save.resume) {
        this.diffKey = this.save.resume.diffKey || 'NORMAL';
        this.practice = false;
        this._startRun(this.save.resume.stageIndex, this.save.resume.phaseIndex, { skipStory: true });
      } else if (label === 'はじめから' || label === '幕をえらぶ') {
        this.practice = label === '幕をえらぶ';
        this.setMode('diff');
      } else if (label === '操作とクレジット') {
        this.setMode('help');
      }
    }
    if (inp.hit('fullscreen')) this.s.toggleFullscreen();
    if (inp.hit('keym')) { audio.setMuted(!audio.muted); saveMod.setSetting('muted', audio.muted); }
  }

  /* ------------------------------------------------------ difficulty --- */
  _updDiff(dt, inp) {
    if (inp.hit('up')) this.menu.move(-1);
    if (inp.hit('down')) this.menu.move(1);
    if (inp.hit('cancel', 'bomb')) { audio.play('ui_cancel', { vol: 0.45 }); this.setMode('title'); return; }
    if (inp.hit('confirm')) {
      audio.play('ui_select', { vol: 0.55 });
      this.diffKey = DIFFICULTY_ORDER[this.menu.cur];
      if (this.practice) this.setMode('practice');
      else this._startRun(0, 0, {});
    }
  }

  /* ------------------------------------------------------- practice --- */
  _updPractice(dt, inp) {
    const pm = this.practiceMenu;
    const st = STAGES[pm.row];
    if (inp.hit('left') && pm.col === 1) { pm.col = 0; audio.play('ui_move', { vol: 0.3 }); }
    else if (inp.hit('right') && pm.col === 0) { pm.col = 1; audio.play('ui_move', { vol: 0.3 }); }
    else if (inp.hit('up')) {
      if (pm.col === 0) { pm.row = (pm.row - 1 + STAGES.length) % STAGES.length; pm.idx = 0; }
      else pm.idx = (pm.idx - 1 + st.phases.length) % st.phases.length;
      audio.play('ui_move', { vol: 0.32 });
    } else if (inp.hit('down')) {
      if (pm.col === 0) { pm.row = (pm.row + 1) % STAGES.length; pm.idx = 0; }
      else pm.idx = (pm.idx + 1) % st.phases.length;
      audio.play('ui_move', { vol: 0.32 });
    }
    if (inp.hit('cancel', 'bomb')) { audio.play('ui_cancel', { vol: 0.45 }); this.setMode('diff'); return; }
    if (inp.hit('confirm')) {
      audio.play('ui_select', { vol: 0.55 });
      this.practice = true;
      this._startRun(pm.row, pm.idx, { skipStory: true });
    }
  }

  /* ---------------------------------------------------------- story --- */
  _updStory(dt, inp) {
    this.dialogue.update(dt);
    if (inp.hit('skip')) { this.dialogue.skipAll(); }
    else if (inp.hit('confirm', 'bomb')) { audio.play('ui_move', { vol: 0.28 }); this.dialogue.advance(); }
    if (this.dialogue.done) {
      // 導入ならその幕を開始、締めならリザルトへ
      if (this.storyPurpose === 'outro') this.setMode('result');
      else this._beginStagePlay();
      return;
    }
    this.bg.update(dt, { camera: this.cam, intensity: 0.3 });
  }

  /* ----------------------------------------------------------- play --- */
  _startRun(stageIndex, phaseIndex, { skipStory = false } = {}) {
    this.stageIndex = clamp(stageIndex, 0, STAGES.length - 1);
    this.phaseIndex = clamp(phaseIndex, 0, STAGES[this.stageIndex].phases.length - 1);
    this.score = 0; this.graze = 0; this.dodge = 0; this.maxDodge = 0;
    this.hits = 0; this.bombsUsed = 0; this.elapsed = 0;
    this.phaseTimes = [];
    this.gauge.value = 0;
    this.diff = DIFFICULTIES[this.diffKey];
    this.lives = this.diff.lives;
    this.bombs = this.diff.bomb;
    this.player.reset(false);
    this.player.invuln = 0;
    this.bullets.clear();
    this.lasers.clear();
    this.fx.reset();
    this.cam.reset();

    const stage = STAGES[this.stageIndex];
    this.stage = stage;
    this.bg.setTheme(stage.bg, { instant: true });
    audio.playSong(stage.song, { intensity: 0, fade: 0.6 });

    // ボス生成 (幕ごとに 1 体)
    this.boss = new Boss({ ...stage.boss, sheet: stage.sheet }, {
      s: this.s, fx: this.fx, audio, bullets: this.bullets, spawn: null,
    });
    this.boss.sheet.ready.then(() => { /* 立ち絵スプライトの準備完了 */ }).catch((e) => console.error('[boss]', e));

    this.bullets.attach({
      fx: this.fx, player: this.player, rng: this.rng,
      onGraze: (b) => {
        this.graze += 1;
        this.score += Math.round(60 * this.diff.grazeGain);
        this.gauge.value = Math.min(this.gauge.max, this.gauge.value + BOMB.grazePer * this.diff.grazeGain);
        audio.play('graze', { vol: 0.22, minGap: 0.05 });
        this.fx.burst(b.x, b.y, 2, { speed: 40, life: 0.25, size: 1, color: '#7cf0ff' });
      },
      onCancel: (b) => { this.score += 80; },
    });
    this.lasers.attach({ fx: this.fx, player: this.player, rng: this.rng });

    if (!skipStory && STAGE_DIALOGUE[stage.key]) {
      const d = STAGE_DIALOGUE[stage.key];
      this.storyPurpose = 'intro';
      this.setMode('story');
      this.dialogue.start(d.intro, {
        mode: 'cutin', title: d.title,
        onEnd: null,
      });
      // ボスの登場音だけ先に
      audio.play('boss_appear', { vol: 0.6 });
      return;
    }
    this._beginStagePlay();
  }

  _beginStagePlay() {
    this.setMode('play');
    this.sub = 'intro';
    this.subT = 0;
    this.boss.to(BS.INTRO);
    this.boss.fade = 1;
    this.phaseIndex = clamp(this.phaseIndex, 0, this.stage.phases.length - 1);
    this._pendingPhase = this.phaseIndex;
    audio.play('boss_appear', { vol: 0.6 });
    this.fx.addFlash(0.18, '#ffffff');
  }

  _phase() { return this.stage.phases[this.phaseIndex]; }

  _enterPhase(i) {
    const stage = this.stage;
    const phase = stage.phases[i];
    const form = stage.forms[phase.form];
    this.phaseIndex = i;
    this.sub = 'active';
    this.subT = 0;
    this.phaseElapsed = 0;

    this.boss.setPhase(i, {
      ...form,
      move: phase.move ?? form.move,
      bossScale: phase.bossScale ?? form.bossScale,
      tint: phase.tint ?? form.tint,
      bobAmp: phase.bobAmp ?? form.bobAmp,
      swayAmp: phase.swayAmp ?? form.swayAmp,
      face: phase.face ?? form.face,
      home: phase.home,
    });
    this.boss.fade = 1;
    this.boss.to(BS.FLOAT);

    this.diffObj = new Diff(this.diff);
    this.runner.reset(phase.actions);

    const len = phase.len * this.diff.phaseLen;
    this.hud.phaseLen = len;
    this.hud.timeLeft = len;
    this.phaseLen = len;

    // カメラ: 擬似3D は「指定されたフェーズだけ」
    if (phase.cam === 'pseudo3d') {
      this.cam.setMode('pseudo3d', { speed: 0.85 });
      this.cam.pumpFov(0.35);
    } else {
      this.cam.setMode('flat', { speed: 1.5 });
    }
    audio.setIntensity(phase.level ?? 0, 1.4);

    this.bg.pulse = 1;
    this.fx.addFlash(0.22, phase.cam === 'pseudo3d' ? '#ffffff' : '#ffe9a8');
    audio.play('phase_in', { vol: 0.5 });

    // ボスの台詞 (フェーズ頭に小さく出す)
    const ch = CHARACTERS[stage.boss.key];
    const q = ch?.quotes?.phase?.[i];
    if (q) this.bubble.say(q.t, stage.boss.key, { life: 3.0, v: q.v });

    this.hud.act = stage.act;
    this.hud.stageName = stage.name;
    this.hud.phaseLabel = phase.n;
    this.hud.phaseIndex = i;
    this.hud.phaseTotal = stage.phases.length;
    this.hud.formIndex = phase.form;
    this.hud.formTotal = stage.forms.length;
    this.hud.bossName = stage.boss.name;
    this.hud.bossTitle = `${stage.boss.title}　${form.name}`;

    saveMod.setResume(this.stageIndex, i, this.diffKey);
  }

  _updPlay(dt, inp) {
    this.subT += dt;
    this.elapsed += dt;
    if (inp.hit('fullscreen')) this.s.toggleFullscreen();

    // ポーズ
    if (inp.hit('pause') || inp.hit('cancel')) {
      audio.play('ui_select', { vol: 0.45 });
      this.setMode('pause');
      this.menu.set(['再開する', '幕の頭からやり直す', 'タイトルへ戻る']);
      return;
    }

    // ボス
    const alive = this.boss.update(dt);
    // ボスが「重い予備動作」中はカメラを少し引く
    if (this.boss.state === BS.ATTACK) this.cam.punch(0.004);

    switch (this.sub) {
      case 'intro': {
        if (this.subT > (this.stage.boss.intro?.dur ?? 2.0) + 0.4) this._enterPhase(this.phaseIndex);
        break;
      }
      case 'active': {
        // 弾幕の時間軸を進める
        const S = this.runner.spawner;
        S.boss = this.boss; S.player = this.player; S.bullets = this.bullets;
        S.lasers = this.lasers; S.d = this.diffObj; S.fx = this.fx;
        S.audio = audio; S.phase = this._phase();
        this.runner.update(dt, S);
        this.phaseElapsed += dt;
        this.hud.timeLeft = Math.max(0, this.hud.timeLeft - dt);

        // 残り10秒/5秒の警告
        if (this.hud.timeLeft <= 10 && this.lowTickAt < 10) { this.lowTickAt = 10; audio.play('time_low', { vol: 0.5 }); }
        if (this.hud.timeLeft <= 3.05 && this.lowTickAt < 3) { this.lowTickAt = 3; audio.play('tick', { vol: 0.45, rate: 1.1 }); }

        if (this.hud.timeLeft <= 0) this._endPhase();
        break;
      }
      case 'clear': {
        if (this.subT > 2.0) {
          const next = this.phaseIndex + 1;
          if (next < this.stage.phases.length) this._enterPhase(next);
          else this._stageCleared();
        }
        break;
      }
      case 'defeat': {
        if (!this.boss.visible || this.boss.state === BS.GONE) this._stageCleared();
        break;
      }
      default: break;
    }

    // 弾 / レーザー
    const bounds = { x0: -48, x1: VIEW_W + 48, y0: -80, y1: VIEW_H + 80 };
    this.bullets.update(dt, { player: this.player, difficulty: this.diff, bounds, camera: this.cam });
    this.lasers.update(dt);

    // 自機
    this.player.update(dt, inp, { difficulty: this.diff, camera: this.cam });
    if (this.prevAlive && !this.player.alive) this._onPlayerHit();
    this.prevAlive = this.player.alive;

    // ✝本質✝ (弾消し) — ストック、またはグレイズで満タンになったゲージを消費する
    if (inp.hit('bomb') && this.player.alive) {
      let ok = false;
      if (this.bombs > 0) {
        const saved = this.gauge.value;
        this.gauge.value = this.gauge.max;      // ストック消費としてゲージ満タンを一時的に満たす
        ok = this.player.fireBomb(this.gauge);
        this.gauge.value = ok ? saved : saved;
        if (ok) this.bombs--;
      } else {
        ok = this.player.fireBomb(this.gauge);
      }
      if (ok) {
        this.bombsUsed++;
        this.bullets.cancelAll(() => { this.score += 120; });
        this.lasers.clear();
        audio.play('cancel', { vol: 0.7 });
        this.fx.addFlash(0.5, '#ffffff');
        this.cam.punch(0.03);
      }
    }
    if (this.player.bombActive > 0) {
      // 発動中は弾を消し続ける (押しっぱなしでなくても効果が続く)
      this.bullets.cancelAll((b) => { this.score += 120; });
      this.lasers.clear();
    }

    // グレイズ数 = 「回避」スコア。被弾でリセット
    this.dodge = Math.max(this.dodge, this.graze);
    this.maxDodge = Math.max(this.maxDodge, this.dodge);

    this.bubble.update(dt);
    this.fx.update(dt);
    this.bg.update(dt, { camera: this.cam, intensity: (this._phase()?.level ?? 0) / 3, hint: this.boss.x });
    this.cam.update(dt);

    this._syncHud();
  }

  _syncHud() {
    const h = this.hud;
    h.lives = this.lives;
    h.bombs = this.bombs;      // ✝本質✝ の残りストック数
    h.bombGauge = this.gauge.value;
    h.score = this.score;
    h.graze = this.graze;
    h.dodged = this.maxDodge;
    h.hits = this.hits;
    h.noMiss = this.hits === 0;
    h.elapsed = this.elapsed;
    h.practice = this.practice;
    h.timeLeft = this.hud.timeLeft;
  }

  _onPlayerHit() {
    this.hits++;
    this.lives--;
    this.graze = 0;
    audio.play('player_hit', { vol: 0.8 });
    this.fx.addShake(5.5, 0.87);
    this.fx.addFlash(0.4, '#ff5e8a');
    this.fx.addChroma(0.9);
    this.cam.punch(0.05);
    // 理不尽の排除: 被弾したら周囲の弾を消し、無敵時間を与える
    this.bullets.clear();
    this.lasers.clear();
    if (this.lives < 0) {
      this._gameOver();
      return;
    }
    this.player.reset();
    this.player.invuln = this.diff.invuln;
    this.player.vulnerable = false;
    audio.play('extend', { vol: 0.5 });
    this.bubble.say('まだ終わらない。', 'ryoma', { life: 1.8 });
  }

  _endPhase() {
    this.bullets.clear();
    this.lasers.clear();
    this.phaseTimes.push(this.phaseElapsed);
    const last = this.phaseIndex >= this.stage.phases.length - 1;
    if (last) {
      this.sub = 'defeat';
      this.subT = 0;
      this.boss.startDefeat();
      audio.play('warp_out', { vol: 0.6 });
      this.fx.addFlash(0.5, '#ffffff');
      this.fx.addShake(6, 0.9);
      this.cam.setMode('flat', { speed: 2.4 });
    } else {
      this.sub = 'clear';
      this.subT = 0;
      this.boss.startTransition();
      this.boss.setFace(FACE.FOCUS);
      this.boss.hurt(0, false);
      audio.play('phase_break', { vol: 0.65 });
      this.fx.addFlash(0.42, this.stage.forms[this._phase().form].tint || '#ffffff');
      this.fx.addShake(4.5, 0.88);
      this.cam.collapse();
      this.cam.setMode('flat', { speed: 2.2 });
    }
  }

  _stageCleared() {
    const stage = this.stage;
    saveMod.markStageCleared(stage.key);
    saveMod.clearResume();
    saveMod.updateBest({
      stage: this.stageIndex + 1, phases: stage.phases.length, score: this.score, diff: this.diffKey,
    });
    audio.playSong('clear', { intensity: 3, fade: 0.8 });
    audio.play('stage_clear', { vol: 0.7 });
    const d = STAGE_DIALOGUE[stage.key];
    const q = CHARACTERS[stage.boss.key]?.quotes?.clear?.[0];
    const fastest = this.phaseTimes.length ? Math.min(...this.phaseTimes) : null;
    this.result = {
      allClear: this.stageIndex >= STAGES.length - 1,
      act: stage.act, stageName: stage.name, diff: this.diffKey,
      phasesCleared: stage.phases.length, elapsed: this.elapsed,
      score: this.score, maxDodge: this.maxDodge, graze: this.graze, hits: this.hits,
      bombsUsed: this.bombsUsed, lives: this.lives,
      fastestPhase: fastest != null ? `${fastest.toFixed(1)}s` : '—',
      rank: this._rank(), rankColor: this._rankColor(),
      quote: q ? q.t : null, quoteTag: q ? (q.v ? '原作' : '本作') : null, quoteV: q?.v,
      outro: d?.outro || null,
    };
    this.menu.set(this._resultMenu());
    // 締めの会話があれば先に出す
    if (d?.outro?.length) {
      this.storyPurpose = 'outro';
      this.setMode('story');
      this.dialogue.start(d.outro, { mode: 'box', title: stage.act });
    } else {
      this.setMode('result');
    }
  }

  _resultMenu() {
    const last = this.stageIndex >= STAGES.length - 1;
    if (last) return ['タイトルへ', '最終幕をもう一度', '練習する'];
    return ['次の幕へ', 'この幕をもう一度', '練習する', 'タイトルへ'];
  }

  _rank() {
    if (this.hits === 0 && this.bombsUsed === 0) return 'S+';
    if (this.hits === 0) return 'S';
    if (this.hits <= 1) return 'A';
    if (this.hits <= 3) return 'B';
    return 'C';
  }

  _rankColor() {
    const r = this._rank();
    return r === 'S+' ? '#ffe9a8' : r === 'S' ? '#7ce0a0' : r === 'A' ? '#8fc2ff' : r === 'B' ? '#cfc4ff' : '#ff9d7a';
  }

  _gameOver() {
    this.player.alive = false;
    audio.playSong('gameover', { intensity: 2, fade: 0.5 });
    audio.play('gameover', { vol: 0.7 });
    this.gameOver = {
      act: this.stage.act, phaseLabel: this._phase()?.n ?? '',
      stageNo: this.stageIndex + 1, phaseIndex: this.phaseIndex,
      phaseTotal: this.stage.phases.length,
      score: this.score, graze: this.graze, hits: this.hits,
    };
    this.setMode('gameover');
    this.menu.set(['この幕をやり直す', 'このフェーズから', 'タイトルへ']);
  }

  /* ---------------------------------------------------------- pause --- */
  _updPause(dt, inp) {
    this.fx.update(dt);
    if (inp.hit('pause') || inp.hit('cancel')) { audio.play('ui_cancel', { vol: 0.45 }); this.setMode('play'); return; }
    if (inp.hit('up')) this.menu.move(-1);
    if (inp.hit('down')) this.menu.move(1);
    if (inp.hit('confirm')) {
      const l = this.menu.label;
      if (l === '再開する') this.setMode('play');
      else if (l === '幕の頭からやり直す') this._startRun(this.stageIndex, 0, { skipStory: true });
      else { audio.playSong('title', { intensity: 2 }); this.setMode('title'); }
    }
    this.fx.update(dt);
  }

  /* --------------------------------------------------------- result --- */
  _updResult(dt, inp) {
    this.fx.update(dt);
    this.bg.update(dt, { camera: this.cam, intensity: 0.5 });
    if (this.dialogue.active) { this.dialogue.update(dt); if (inp.hit('confirm', 'skip', 'bomb')) this.dialogue.advance(); return; }
    if (inp.hit('up')) this.menu.move(-1);
    if (inp.hit('down')) this.menu.move(1);
    if (inp.hit('confirm')) {
      audio.play('ui_select', { vol: 0.5 });
      const l = this.menu.label;
      if (l === '次の幕へ') this._startRun(this.stageIndex + 1, 0, {});
      else if (l === 'この幕をもう一度' || l === '最終幕をもう一度') this._startRun(this.stageIndex, 0, { skipStory: true });
      else if (l === '練習する') { this.practice = true; this.setMode('practice'); }
      else { audio.playSong('title', { intensity: 2 }); this.setMode('title'); }
    }
  }

  /* ------------------------------------------------------- game over --- */
  _updGameOver(dt, inp) {
    this.fx.update(dt);
    this.bg.update(dt, { camera: this.cam, intensity: 0.2 });
    if (inp.hit('up')) this.menu.move(-1);
    if (inp.hit('down')) this.menu.move(1);
    if (inp.hit('confirm') || inp.hit('restart')) {
      audio.play('ui_select', { vol: 0.5 });
      const l = this.menu.label;
      if (l === 'この幕をやり直す') this._startRun(this.stageIndex, 0, { skipStory: true });
      else if (l === 'このフェーズから') this._startRun(this.stageIndex, this.phaseIndex, { skipStory: true });
      else { audio.playSong('title', { intensity: 2 }); this.setMode('title'); }
    }
  }

  _updAllClear(dt, inp) {
    if (inp.hit('confirm', 'cancel', 'bomb')) { audio.playSong('title', { intensity: 2 }); this.setMode('title'); }
  }

  /* ================================================================ *
   * 描画
   * ================================================================ */
  render() {
    const s = this.s;
    const ctx = s.ctx;
    s.begin('#050409');
    this._updatePost();

    switch (this.mode) {
      case 'error': this._drawError(ctx); break;
      case 'boot': break;
      case 'title': UI.drawTitle(ctx, this.time, this.save); break;
      case 'help': UI.drawHelp(ctx, this.time, CREDITS); break;
      case 'diff': UI.drawDifficulty(ctx, this.menu, this.time); break;
      case 'practice': UI.drawPractice(ctx, this.practiceMenu, this.time, STAGES); break;
      case 'story': this._drawStory(ctx); break;
      case 'result': UI.drawResult(ctx, this.menu, this.modeT, this.result || {}); break;
      case 'gameover': UI.drawGameOver(ctx, this.menu, this.modeT, this.gameOver || {}); break;
      case 'allclear': UI.drawResult(ctx, this.menu, this.modeT, this.result || {}); break;
      case 'pause':
      case 'play': this._drawPlay(ctx); break;
      default: break;
    }

    s.present({ shakeX: this.fx.shake.x, shakeY: this.fx.shake.y });
  }

  _updatePost() {
    const p = this.s.post;
    this.fx.applyPost(p);
    const low = this.mode === 'play' && this.hud.timeLeft <= 10;
    p.scanline = this.save.settings.reducedFx ? 0.06 : 0.14;
    p.vignette = 0.42 + (low ? 0.10 : 0);
    if (this.mode === 'story') p.vignette = 0.6;
  }

  _drawStory(ctx) {
    if (this.mode === 'story' && this.dialogue.active) {
      this.dialogue.draw(ctx, this.time);
      return;
    }
    // 会話が終わった直後 (モード切替待ち)
  }

  _drawPlay(ctx) {
    const s = this.s;
    this.bg.draw(ctx, this.cam);
    if (this.boss) this.boss.draw(s);
    this.lasers.draw(ctx, this.cam);
    this.bullets.draw(ctx, this.cam);
    this.player.draw(ctx, this.cam);
    this.fx.draw(ctx);

    // カメラ移行中の「ワイプ」表現: 画面端に細い線
    if (this.cam.t > 0.02 && this.cam.t < 0.98) {
      ctx.save();
      ctx.globalAlpha = 0.25 * Math.sin(this.cam.t * Math.PI);
      ctx.fillStyle = '#8fc2ff';
      ctx.fillRect(0, 0, VIEW_W, 1);
      ctx.fillRect(0, VIEW_H - 1, VIEW_W, 1);
      ctx.restore();
    }

    drawHud(ctx, this.hud, this.time);
    this.bubble.draw(ctx);

    if (this.sub === 'intro') {
      drawHint(ctx, '── ✝本質✝ 出現 ──', VIEW_H - 60, 1);
    } else if (this.sub === 'clear') {
      drawHint(ctx, `${this.stage.phases[this.phaseIndex + 1]?.n ?? ''} へ`, VIEW_H - 60, 1);
    } else if (this.sub === 'defeat') {
      drawHint(ctx, 'STAGE CLEAR', VIEW_H - 60, 1);
    } else if (this.mode === 'play' && this.modeT < 6 && !this.practice) {
      drawHint(ctx, 'Shift … 低速移動　　X … ✝本質✝ (ゲージ満タン)', VIEW_H - 40, 1);
    }

    if (this.mode === 'pause') UI.drawPause(ctx, this.menu, this.time, this.hud);
  }

  _drawError(ctx) {
    drawText(ctx, 'エラーが発生しました', VIEW_W / 2, 60, { size: 32, color: '#ff5c7a', align: 'center', outline: 2 });
    drawText(ctx, String(this.error?.message || this.error), VIEW_W / 2, 110, { size: 8, color: '#ffc2cd', align: 'center', outline: 1 });
    const stack = String(this.error?.stack || '').split('\n').slice(0, 8);
    stack.forEach((l, i) => {
      drawText(ctx, l.slice(0, 74), 16, 136 + i * 12, { size: 8, color: '#8b80b8', outline: 0 });
    });
    drawText(ctx, 'Console に詳細があります。Z / Enter で再読み込み。', VIEW_W / 2, VIEW_H - 40, {
      size: 8, color: '#cfc4ff', align: 'center', outline: 1,
    });
  }
}

/* ------------------------------------------------------------------ *
 * タイトルメニュー
 * ------------------------------------------------------------------ */
function TITLE_MENU(save) {
  const items = [];
  if (save.resume) items.push({ label: 'つづきから', sub: `${STAGES[save.resume.stageIndex]?.act ?? ''} ${save.resume.phaseIndex + 1}フェーズ目` });
  items.push('はじめから');
  items.push('幕をえらぶ');
  items.push('操作とクレジット');
  return items;
}

/* ------------------------------------------------------------------ *
 * 起動
 * ------------------------------------------------------------------ */
const game = new Game();
window.__game = game;      // デバッグ用
game.boot().catch((e) => {
  console.error('[boot] 起動に失敗:', e);
  const msg = document.getElementById('bootmsg');
  if (msg) msg.textContent = '起動に失敗しました: ' + e.message;
});

// 音声は操作を起点に有効化する (ブラウザの自動再生制限)
const unlock = async () => {
  await audio.resume();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });
