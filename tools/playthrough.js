/* =============================================================================
 * tools/playthrough.js — 通し検証（各難易度 × 全ステージ）
 *
 *  検証する内容:
 *    1. ゲーム本体の更新ループが例外なく最後まで回るか
 *    2. 回避 AI が全フェーズを生き延びて STAGE CLEAR に到達できるか
 *       （＝「各難易度がクリア可能」であることの機械的な裏付け）
 *    3. 座標の NaN / 弾速上限違反 / 弾数上限違反が無いか
 *    4. フェーズ移行・結果画面・全クリアへの状態遷移が正しく起きるか
 *
 *  AI はゲームの入力系（moveVec）を通して操作する。プレイヤーの移動コード・
 *  当たり判定コードは本番と同じものが走る。
 *
 *  使い方:
 *    node tools/playthrough.js              # 全難易度 × 全ステージ
 *    node tools/playthrough.js --diff HARD  # 難易度を限定
 *    node tools/playthrough.js --stage 4    # 章を限定
 *    node tools/playthrough.js --runs 3     # 各条件を 3 回試す（乱数差の吸収）
 *    node tools/playthrough.js --verbose
 * ========================================================================== */
'use strict';
const { loadGame } = require('./headless');
const { DodgerAI } = require('./dodger-ai');

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] != null ? args[i + 1] : d; };
const ONLY_DIFF = argOf('--diff', null);
const ONLY_STAGE = argOf('--stage', null) ? Number(argOf('--stage')) : null;
const RUNS = Number(argOf('--runs', 1));
const VERBOSE = args.includes('--verbose');
const TIME_SCALE = Number(argOf('--scale', 1));   // 1 = 実時間相当

const DT = 1 / 60;

/* ------------------------------------------------------------ 環境 ---- */
const { HN, win } = loadGame();
HN.audio.init = () => false;
HN.audio.playSong = () => { };
HN.audio.setIntensity = () => { };

const W = 640, H = 480;   // プレイフィールド（ゲーム本体と同値）

/**
 * AI の移動目標をゲームの入力へ変換するダミー入力。
 * プレイヤー本体の移動・加速・壁処理は本番コードをそのまま通す。
 */
function makeAIInput(game, ai) {
  const dir = { x: 0, y: 0 };
  const input = {
    keys: Object.create(null), pressed: Object.create(null), released: Object.create(null),
    ptr: { x: 0, y: 0, active: false, down: false, dx: 0, dy: 0, id: -1, isTouch: false },
    anyInput: false, lastDevice: 'ai', _hit: Object.create(null),
    moveVec() {
      return { x: dir.x, y: dir.y, active: dir.x !== 0 || dir.y !== 0 };
    },
    // 集中（低速）モード。ゲーム側が速度を切り替えるので、指示だけ渡す。
    focusHeld: () => !!input._focus,
    down: () => false,
    hit(a) { return !!input._hit[a]; },
    up: () => false,
    endFrame() { input._hit = Object.create(null); },
    /** テスト側から「このフレームで押した」ことにする */
    press(a) { input._hit[a] = true; },
    // --- AI を 1 フレーム進めて方向を決める ---
    step(dt) {
      const p = game.player;
      const mv = ai.step(p.x, p.y, game.sys, dt, p.speedNormal, 2.0,
        { x0: 8, y0: 9, x1: W - 8, y1: H - 8 });
      // 目標点までの方向を単位ベクトルにして、本番の移動コードへ渡す
      const dx = mv.x - p.x, dy = mv.y - p.y;
      const len = Math.hypot(dx, dy);
      if (len < 1.2) { dir.x = 0; dir.y = 0; } else { dir.x = dx / len; dir.y = dy / len; }
      input._focus = !!mv.focus;
    },
  };
  return input;
}

/** ゲーム 1 本ぶんを構築する（ブラウザの main() 相当を最小構成で再現） */
function makeGame() {
  const game = new HN.Game();
  HN.game = game;
  // canvas はダミー（描画はしない。ロジックのみ検証）
  game.canvas = {
    width: W, height: H, style: {},
    getContext: () => win.document.getElementById().getContext('2d'),
    addEventListener() { }, removeEventListener() { }, focus() { },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
  };
  game.ctx = win.document.getElementById().getContext('2d');
  const b = HN.makeCanvas(W, H);
  game.buf = b.canvas; game.bctx = b.ctx;
  game.bg = new HN.Background();
  game.fx = new HN.Effects(W, H);
  game.sys = new HN.BulletSystem(W, H);
  game.player = new HN.Player(W, H);
  game.sys.player = game.player;
  game.sys.onCancel = () => { };
  game.boss = new HN.Boss('mie', W, H);
  HN.HUD.init();
  game.save = { unlocked: 4, cleared: [], best: {}, seenTutorial: true, seenIntro: {} };
  game.writeSave = () => { };
  game.opt = { masterVol: .8, musicVol: .7, sfxVol: .8, muted: true, scanlines: false, ambient: true };
  game.resize = () => { };
  game.present = () => { };
  game.drawWorld = () => { };
  game.drawBoot = () => { };
  return game;
}

/* ------------------------------------------------------------ 実行 ---- */
const rows = [];
let anyFail = false;

const diffs = ONLY_DIFF ? [ONLY_DIFF] : HN.DIFF_ORDER;
const stages = ONLY_STAGE != null ? [ONLY_STAGE - 1] : HN.STAGES.map((_, i) => i);

for (const dk of diffs) {
  for (const si of stages) {
    for (let run = 0; run < RUNS; run++) {
      const rec = {
        dk, stage: si + 1, run, ok: false,
        error: null, phases: 0, time: 0, hits: 0, hitsAt: [], maxSpeed: 0,
        maxCount: 0, reached: 0, state: '', gaugeMax: 0, observations: 0, minBossDist: 1e9, minBossDistRaw: 1e9,
      };
      try {
        runOne(rec);
      } catch (e) {
        rec.error = e.message + (VERBOSE ? '\n' + e.stack : '');
      }
      if (!rec.ok || rec.error) anyFail = true;
      rows.push(rec);
    }
  }
}

function runOne(rec) {
  const game = makeGame();
  const G = HN.G;
  game.startRun(rec.dk, rec.stage - 1, 'story');
  // 会話パートは飛ばして第 1 フェーズから始める（会話は別途フレーム検証済み）
  G.state = 'ingame';
  game.beginPhase(0);
  game.phaseState = 'active'; game.phaseStateT = 0;
  game.showQuote = false;

  const ai = new DodgerAI(G.dif);
  game.input = makeAIInput(game, ai);

  const totalPhase = HN.phasesFor(HN.STAGES[rec.stage - 1], G.dif).length;
  const phaseDur = HN.phasesFor(HN.STAGES[rec.stage - 1], G.dif).reduce((a, p) => a + p.duration, 0);

  let t = 0, hits = 0, phaseSeen = -1, guard = 0;
  const maxT = (phaseDur + totalPhase * 4 + 40) / TIME_SCALE;
  const startLives = G.lives;

  while (t < maxT && guard++ < 60 * 60 * 30) {
    // --- AI の操作を 1 フレームぶん決める ---
    const prevPhase = game.phaseIdx;
    if (game.deathT <= 0 && !game.player.dead) game.input.step(DT);
    // --- ゲーム更新（本番コード） ---
    game.updateIngame(DT);
    t += DT;

    // --- 監視 ---
    const cnt = game.sys.count;
    if (cnt > rec.maxCount) rec.maxCount = cnt;
    // 不変条件: 「ボスの移動」が自機へ 140px より近づかない（出現即直撃の排除）。
    // 自機が自分から突っ込むのはプレイヤーの選択なので判定対象にしない。
    // そのためボス側の更新直後の距離（boss.lastDist）だけを見る。
    // 猶予: ボスの退避は 1 フレーム最大 6px。最悪ケースでも 17 フレーム
    // （= 0.28 秒）で合法位置へ戻れるので、0.6 秒を過ぎてから検証する。
    {
      const B = game.boss;
      const bd = B.lastDist;
      const inZone = B.lastPlayerY > H * 0.5;
      if (bd !== undefined && inZone && bd < rec.minBossDistRaw) rec.minBossDistRaw = bd;
      if (bd !== undefined && inZone && B.legalT > 0.6 && bd < rec.minBossDist) rec.minBossDist = bd;
      if (bd !== undefined && inZone && B.legalT > 0.6 && bd < 139) {
        throw new Error(`ボスが近づきすぎた: ${bd.toFixed(1)}px`
          + ` (boss=${B.x.toFixed(0)},${B.y.toFixed(0)}`
          + ` player=${game.player.x.toFixed(0)},${game.player.y.toFixed(0)}`
          + ` legalT=${B.legalT.toFixed(2)}s pose=${B.pose})`);
      }
    }
    if (cnt > game.sys.maxBullets) throw new Error(`弾数上限超過: ${cnt} > ${game.sys.maxBullets}`);
    for (const b of game.sys.bullets) {
      if (!b.active) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) throw new Error('弾の座標が NaN/Infinity');
      if (sp > rec.maxSpeed) rec.maxSpeed = sp;
      if (sp > G.dif.speedCap + 1.5) {
        throw new Error(`弾速上限違反: ${sp.toFixed(1)} > ${G.dif.speedCap} (type=${b.type})`);
      }
    }
    if (G.lives < startLives - hits) {
      hits = startLives - G.lives;
      const info = `${t.toFixed(1)}s p${game.phaseIdx + 1} [${game.phaseState} -${G.phaseRemain.toFixed(1)}s] ${game.lastHitBy} 弾${game.sys.count} 弾速${Math.round(Math.hypot(game.player.vx, game.player.vy))} focus=${game.input._focus ? 1 : 0}`;
      rec.hitsAt.push(info);
      if (VERBOSE) console.log(`    [hit] ${info} (enemy=${game.lastHitBy})`);
    }
    if (G.gauge > rec.gaugeMax) rec.gaugeMax = G.gauge;
    // ゲージが満タンなら観測を撃つ（原作どおりのプレイ）
    if (G.gauge >= G.gaugeMax) { game.input._hit['cancel'] = true; }
    if (game.phaseIdx !== prevPhase) phaseSeen = Math.max(phaseSeen, prevPhase);

    // --- 終了条件 ---
    const st = G.state;
    if (st === 'gameover') { rec.state = 'gameover'; break; }
    if (st === 'results' || st === 'allclear') { rec.state = st; break; }
    if (G.lives < 0) { rec.state = 'dead'; break; }
  }

  rec.phases = Math.max(phaseSeen + 1, 1);
  rec.time = t;
  rec.hits = hits;
  rec.observations = G.observations;
  rec.reached = G.phaseIndex + 1;
  rec.maxCount = Math.max(rec.maxCount, game.sys.count);
  rec.ok = (rec.state === 'results' || rec.state === 'allclear') && G.lives >= 0;
  if (!rec.ok && !rec.error) rec.error = `未到達（${rec.state || '時間切れ'}）`;
  rec.diffPhases = totalPhase;
}

/* ------------------------------------------------------------ 出力 ---- */
const HEAD = ['難易度'.padEnd(8), '章'.padEnd(4), '結果'.padEnd(12), '生存'.padEnd(9),
  '残機'.padEnd(5), '被弾'.padEnd(5), '観測'.padEnd(5), '最大弾'.padEnd(8), '最大弾速'.padEnd(9)].join('');
console.log('通し検証: 回避AIに全フェーズを生存させ、STAGE CLEAR に到達できるかを確認');
console.log('（AI はゲームの入力系を通して操作。移動・当たり判定は本番コード）');
console.log('-'.repeat(96));
console.log(HEAD);
console.log('-'.repeat(96));

for (const r of rows) {
  const d = HN.DIFFICULTY[r.dk];
  const label = r.ok ? 'STAGE CLEAR' : (r.state === 'gameover' ? 'GAME OVER' : (r.state || '中断'));
  console.log(
    r.dk.padEnd(8) +
    String(r.stage).padEnd(4) +
    label.padEnd(12) +
    (r.time.toFixed(1) + 's').padEnd(9) +
    String(HN.G.lives).padEnd(5) +
    String(r.hits).padEnd(5) +
    String(r.observations).padEnd(5) +
    String(r.maxCount).padEnd(8) +
    String(Math.round(r.maxSpeed)).padEnd(9) +
    (r.ok ? 'OK' : 'NG')
  );
  if (r.error) console.log(`      → ${r.error}`);
  if (VERBOSE && r.hitsAt.length) console.log(`      被弾時刻: ${r.hitsAt.join(', ')}`);
}

const ng = rows.filter(r => !r.ok || r.error);
console.log('-'.repeat(96));
console.log(`合計 ${rows.length} 件 / NG ${ng.length} 件`);
if (ng.length) {
  console.log('\nNG 一覧:');
  for (const r of ng) console.log(`  ${r.dk} 第${r.stage}章  到達 PHASE ${r.reached}/${r.diffPhases}  ${r.error || '未クリア'}`);
}
process.exit(anyFail ? 1 : 0);
