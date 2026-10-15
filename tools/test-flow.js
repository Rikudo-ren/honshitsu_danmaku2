/* =============================================================================
 * tools/test-flow.js — 画面遷移と BGM の検証
 *
 *  なぜ必要か:
 *   tools/playthrough.js は「ステージをクリアできるか」を見るが、
 *   タイトル → 難易度 → 章 → 開始 → クリア → リザルト → タイトル という
 *   **ゲーム全体の流れ**（メニューの操作、章の開放、リトライ、ポーズ）は通らない。
 *   また BGM についても「波形が出ているか」しか見ていなかったため、
 *   **曲が鳴り始める／切り替わるタイミングが間違っていても気づけなかった**
 *   （実際、章のボス曲 `songBoss` は定義されているのに一度も鳴っていなかった）。
 *
 *  この検証は、本番の Input にキーイベントを流し、本番の Game.frame() を回して
 *  実際にメニューを操作する。BGM は「鳴らさずに、鳴った曲だけ記録する」。
 *
 *  使い方:  node tools/test-flow.js
 * ========================================================================== */
'use strict';
const { loadGame } = require('./headless');

const { HN, win, listeners } = loadGame();
HN.audio.init = () => false;

/* ---- 音は鳴らさず、要求された曲だけを記録する ---- */
const played = [];
HN.audio.playSong = (key, opt = {}) => {
  if (HN.audio.song !== key || opt.restart !== false) played.push(key);
  HN.audio.song = key;
};
HN.audio.setMusicVol = () => { };
HN.audio.setIntensity = () => { };
HN.audio.sfx = () => { };
HN.audio.resume = () => { };

let ng = 0, ok = 0;
function check(name, cond, detail) {
  if (cond) { ok++; console.log(`  OK   ${name}`); }
  else { ng++; console.log(`  NG   ${name}${detail ? '  → ' + detail : ''}`); }
}

/* ------------------------------------------------------------ 起動 ---- */
const game = new HN.Game();
game.boot();
const G = game.G;
const input = game.input;

const fire = (type, ev) => { for (const f of listeners[type] || []) f(ev); };
/* 1 フレーム進める。ときどきイベントループに制御を返すのは、
 * アセット読み込み（Promise）が進まないとタイトルへ行けないため。 */
const tick = () => new Promise((r) => setTimeout(r, 0));
async function run(n) {
  for (let i = 0; i < n; i++) {
    game.frame(1 / 60);
    if ((i & 7) === 7) await tick();
  }
}
async function press(action) { input.pressed[action] = true; await run(1); }
async function waitFor(pred, max = 4000) {
  for (let i = 0; i < max; i++) { if (pred()) return true; await run(1); }
  return !!pred();
}

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
/* ============================================ 1. 起動 → タイトル ===== */
console.log('■ 起動 → タイトル');
{
  const reached = await waitFor(() => G.state === 'title', 600);
  check('アセット読み込み後にタイトルへ進む', reached, `state=${G.state}`);
  check('タイトルで曲が鳴る', played.includes('title'), played.join(' → '));
  await run(3);   // Screens は最初の update でスタックを初期化する（ゲーム側の自己修復）
  check('タイトル画面に遷移先がある', HN.Screens.items(G).length >= 5);
}

/* ================================== 2. タイトル → 難易度 → 章 → 開始 == */
console.log('■ タイトル → 難易度 → 章 → 開始');
{
  game.save.seenTutorial = true;      // チュートリアルは挟まない
  game.save.seenIntro = {};           // 章の導入（会話）を見る
  played.length = 0;

  await press('confirm');                   // はじめる → 難易度
  check('「はじめる」で難易度選択へ', HN.Screens.cur() === 'diff', HN.Screens.cur());
  const diffs = HN.Screens.items(G);
  check('難易度は 3 つ以上', diffs.length >= 3, `${diffs.length}`);

  (diffs.find(d => /NORMAL/.test(d.label)) || diffs[1]).act();
  await run(4);
  check('難易度を選ぶと章選択へ', HN.Screens.cur() === 'stage', HN.Screens.cur());

  const stages = HN.Screens.items(G);
  check('章の一覧が出る', stages.length === HN.STAGES.length, `${stages.length}`);
  check('第 1 章は開放されている', typeof stages[0].act === 'function');
  check('未開放の章は選べない', stages.length < 2 || typeof stages[1].act !== 'function' || G.save.unlocked > 1);

  stages[0].act();
  await run(4);
  check('章を選ぶとゲームが始まる', G.state === 'ingame' || G.state === 'stageintro', G.state);
  check('導入では静かな曲（quiet）が鳴る', played.includes('quiet'), played.join(' → '));
}

/* ============================================ 3. 会話 → 戦闘開始 ==== */
console.log('■ 章の導入（会話）→ 戦闘開始');
{
  check('導入は stageintro から始まる', G.state === 'stageintro' || game.introIdx >= 0, G.state);
  game.player.invuln = 1e9;           // 会話中に死なないように（検証のための保護）
  // 会話は confirm（Z / タップ）で送る
  let guard = 0;
  while (G.state === 'stageintro' && guard++ < 200) press('confirm');
  check('会話が終わるとゲーム本編に入る', G.state === 'ingame', G.state);
  check('本編の曲に切り替わる', played.includes('stage1'), played.join(' → '));
  check('第 1 フェーズが始まっている', G.phaseIndex === 0 && G.phaseTotal >= 3,
    `phase=${G.phaseIndex + 1}/${G.phaseTotal}`);
}

/* ==================================================== 4. ポーズ ====== */
console.log('■ ポーズ');
{
  await press('esc');
  check('Esc でポーズする', game.paused === true);
  const before = G.phaseRemain;
  await run(30);
  check('ポーズ中は残り時間が減らない', Math.abs(G.phaseRemain - before) < 1e-9,
    `${before} → ${G.phaseRemain}`);
  await press('esc');
  check('Esc で再開する', game.paused === false);
  {
    // フェーズの導入（ボスの予備動作）では残り時間が止まる仕様なので、
    // 本編（active）になってから測る。
    await waitFor(() => game.phaseState === 'active', 600);
    const b = G.phaseRemain;
    await run(30);
    check('再開後は残り時間が減る', G.phaseRemain < b, `${b} → ${G.phaseRemain}`);
  }
}

/* ================================= 5. フェーズ進行 → ボス曲 → クリア == */
console.log('■ フェーズ進行と BGM の切り替え');
{
  const startStageIdx = G.phaseTotal;
  check('章の曲で始まっている', HN.audio.song === 'stage1', String(HN.audio.song));
  // 最終フェーズまで進める（フェーズの残り時間を短くして消化する）
  let guard = 0;
  while (G.state === 'ingame' && G.stageIdx === 0 && G.phaseIndex < startStageIdx - 1 && guard++ < 4000) {
    G.phaseRemain = Math.min(G.phaseRemain, 0.02);
    await run(1);
  }
  check('最終フェーズに到達した', G.phaseIndex === startStageIdx - 1, `${G.phaseIndex + 1}/${startStageIdx}`);
  check('最終フェーズでボス曲に切り替わる', HN.audio.song === HN.STAGES[0].songBoss,
    `${HN.audio.song}（期待 ${HN.STAGES[0].songBoss}）`);

  // クリアまで進める
  guard = 0;
  while (G.state === 'ingame' && guard++ < 4000) {
    G.phaseRemain = Math.min(G.phaseRemain, 0.02);
    await run(1);
  }
  check('クリアするとリザルトへ', G.state === 'results' || G.state === 'allclear', G.state);
  check('クリア後に曲が変わる', played.includes('clear'), played.slice(-4).join(' → '));
  check('章がクリア済みとして保存される', G.save.cleared[0] === true, JSON.stringify(G.save.cleared));
  check('次の章が開放される', G.save.unlocked >= 2, String(G.save.unlocked));
}

/* ======================================== 6. リザルト → 章選択 → タイトル == */
console.log('■ リザルトからの戻り');
{
  // リザルトは会話 → 成績表の順に進み、どちらも決定キーで送る
  let guard = 0;
  while (G.state === 'results' && guard++ < 3000) await press('confirm');
  check('リザルトを抜けられる（クリア後の会話 → 成績表 → 次の画面）',
    G.state !== 'results', G.state);
  // リザルトからは「もう一度 / 章をえらぶ / タイトルへ」のどれかへ進む。
  // ここでは決定を押し続けるので、章選択を通って次の章が始まることがある。
  check('進んだ先が想定の画面のいずれか',
    ['title', 'allclear', 'stageintro', 'ingame'].includes(G.state), G.state);
}

/* ============================================ 7. ゲームオーバー → リトライ == */
console.log('■ ゲームオーバーとリトライ');
{
  game.save.seenIntro[HN.STAGES[0].key] = 1;   // 導入は飛ばす
  game.startRun('NORMAL', 0, 'story');
  await run(4);
  check('章の導入なしで本編に入る', G.state === 'ingame', G.state);
  const lives0 = G.lives;
  check('残機がある', lives0 > 0, String(lives0));

  // 本番の被弾処理で最後の 1 機を失わせる（G.lives を直接いじるだけでは
  // deathT の死亡演出を経ないのでゲームオーバーにならない）
  await run(20);
  game.player.invuln = 0; game.player.spawnGrace = 0;   // 保護を外してから被弾させる
  G.lives = 0;
  game.playerDown();
  check('被弾で残機が減る', G.lives === -1, String(G.lives));
  await waitFor(() => G.state === 'gameover', 300);
  check('残機が尽きるとゲームオーバーへ', G.state === 'gameover', G.state);

  const items = game.goItems();
  check('ゲームオーバーの選択肢がある', items.length >= 2, items.join(' / '));
  check('「もう一度」が既定', game.goIdx === 0);
  await press('confirm');
  await run(4);
  check('「もう一度」で同じ章をやり直せる', G.state === 'ingame' || G.state === 'stageintro', G.state);
  check('残機が戻っている', G.lives === G.dif.lives, `${G.lives} / ${G.dif.lives}`);
}

/* ================================================ 8. 練習モード ====== */
console.log('■ 練習モード（フェーズ単体）');
{
  played.length = 0;
  game.startRun('EASY', 1, 'practice', 2);
  await run(4);
  check('練習は指定フェーズだけを並べる', game.phaseList.length === 1, String(game.phaseList.length));
  check('練習のフェーズが指定どおり',
    game.phaseList[0] === HN.STAGES[1].phases[2] ||
    game.phaseList[0].name === HN.STAGES[1].phases[2].name, String(game.phaseList[0].name));
  check('練習は進行度を 1 フェーズとして扱う', G.phaseTotal === 1, String(G.phaseTotal));
  check('練習は会話を挟まない', !played.includes('quiet'), played.join(' → '));
  check('練習でも章の曲が鳴る', HN.audio.song === HN.STAGES[1].song, String(HN.audio.song));
  check('難易度が反映される', G.difKey === 'EASY', G.difKey);
  // 章の最終フェーズでない練習では、ボス曲に切り替わらないこと。
  // （以前は練習の phaseList が 1 枚であるために「常に最終」と判定され、
  //   第 1 フェーズの練習でもボス曲が鳴っていた）
  const finalPhase = HN.STAGES[1].phases.length - 1;
  const isFinal = 2 >= finalPhase;
  check('途中フェーズの練習ではボス曲にならない',
    isFinal || HN.audio.song === HN.STAGES[1].song, `${HN.audio.song}（boos=${HN.STAGES[1].songBoss}）`);
  // 最終フェーズの練習ではボス曲になる
  game.startRun('EASY', 1, 'practice', finalPhase);
  await run(8);
  check('最終フェーズの練習ではボス曲になる',
    HN.audio.song === HN.STAGES[1].songBoss, `${HN.audio.song}（期待 ${HN.STAGES[1].songBoss}）`);
}

/* ============================================ 9. 全クリア（最終章） == */
console.log('■ 最終章 → ALL CLEAR');
{
  game.save.seenIntro[HN.STAGES[3].key] = 1;
  game.startRun('NORMAL', 3, 'story');
  await run(4);
  game.player.invuln = 1e9;
  check('最終章が始まる', G.state === 'ingame' && G.stageIdx === 3, `${G.state} / 章${G.stageIdx + 1}`);
  let guard = 0;
  while (G.state === 'ingame' && guard++ < 6000) {
    G.phaseRemain = Math.min(G.phaseRemain, 0.02);
    await run(1);
  }
  check('最終章をクリアすると ALL CLEAR へ', G.state === 'allclear', G.state);
  check('最終フェーズは final 曲', HN.STAGES[3].songBoss === 'final' && played.includes('final'),
    played.slice(-3).join(' → '));
}

/* ================================================== 10. 記録の保存 == */
console.log('■ 保存（localStorage）');
{
  const raw = win.localStorage.getItem('honshitsu.save.v1');
  check('進行状況が保存されている', !!raw, String(raw).slice(0, 60));
  if (raw) {
    const s = JSON.parse(raw);
    check('開放済みの章が記録されている', s.unlocked >= 1, String(s.unlocked));
    check('クリア状況が記録されている', Array.isArray(s.cleared), typeof s.cleared);
  }
  // 設定は「変更したとき」に書かれる。実際に変更して往復を確かめる。
  game.opt.masterVol = 0.55;
  game.writeOpt();
  const opt = win.localStorage.getItem('honshitsu.options.v1');
  check('設定を変更すると保存される', !!opt, String(opt).slice(0, 60));
  if (opt) check('保存した設定が読み戻せる', JSON.parse(opt).masterVol === 0.55, opt);
}

console.log('-'.repeat(60));
console.log(`合計 ${ok + ng} 件 / NG ${ng} 件`);
if (ng) console.log('\n鳴った曲の記録: ' + played.join(' → '));
process.exit(ng ? 1 : 0);
}
