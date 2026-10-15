/* =============================================================================
 * tools/test-input.js — 入力の検証（キーボード / タッチ / ポインタ）
 *
 *  なぜ必要か:
 *   tools/playthrough.js と tools/test-patterns.js は「回避 AI」を動かすため、
 *   本番の入力クラス（src/core/input.js）を通らない。つまり
 *   **キー割り当て・タッチのドラッグ・集中モードの判定は、どの検証も通っていなかった。**
 *   ここが壊れるとゲームは「遊べない」のに、絵も弾幕も正常に見えてしまう。
 *
 *  この検証は、ブラウザで起きることをそのまま再現する:
 *    1. 登録されたイベントリスナーを実際に呼ぶ（keydown / keyup / pointerdown / …）
 *    2. 入力クラスが本番コードそのもの
 *    3. 最後に **本番の Player を動かして**、意図した方向へ実際に移動するかを確認する
 *
 *  使い方:  node tools/test-input.js
 * ========================================================================== */
'use strict';
const { loadGame, makeCanvasStub } = require('./headless');

const W = 640, H = 480;
const DT = 1 / 60;

const { HN, win, listeners } = loadGame();
HN.audio.init = () => false;
HN.audio.sfx = () => { };

/* 検証したいのは入力と移動だけなので、描画は走らせない（Player.update は描画を呼ばない） */

let ng = 0, ok = 0;
function check(name, cond, detail) {
  if (cond) { ok++; console.log(`  OK   ${name}`); }
  else { ng++; console.log(`  NG   ${name}${detail ? '  → ' + detail : ''}`); }
}

/* ------------------------------------------------------------ 環境 ---- */
const canvas = makeCanvasStub(W, H);
const input = new HN.Input(canvas);

/** ブラウザのイベントを模して、実際に登録されたリスナーを呼ぶ */
function fireKey(type, code, extra = {}) {
  const ev = {
    code, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    ...extra,
  };
  for (const f of listeners[type] || []) f(ev);
  return ev;
}
function firePointer(type, ev) {
  for (const f of canvas._listeners[type] || []) f(ev);
}
const ptrEvent = (id, x, y, pointerType) => ({
  pointerId: id, clientX: x, clientY: y, pointerType,
  preventDefault() { }, button: 0,
});

/* ==================================================== 1. キー割り当て == */
console.log('■ キーボード');
{
  const cases = [
    ['ArrowLeft', 'left', 'moveVec'], ['ArrowRight', 'right', 'moveVec'],
    ['ArrowUp', 'up', 'moveVec'], ['ArrowDown', 'down', 'moveVec'],
    ['KeyA', 'left', 'moveVec'], ['KeyD', 'right', 'moveVec'],
    ['KeyW', 'up', 'moveVec'], ['KeyS', 'down', 'moveVec'],
  ];
  for (const [code, action, kind] of cases) {
    fireKey('keydown', code);
    const mv = input.moveVec();
    const down = input.down(action);
    check(`${code} → ${action}`, down && mv.active, `down=${down} mv=${JSON.stringify(mv)}`);
    fireKey('keyup', code);
    input.endFrame();
  }

  const hits = [
    ['ShiftLeft', 'focus'], ['ShiftRight', 'focus'],
    ['KeyZ', 'confirm'], ['Enter', 'confirm'], ['Space', 'confirm'],
    ['KeyX', 'cancel'], ['Backspace', 'cancel'],
    ['Escape', 'esc'], ['KeyP', 'pause'], ['KeyR', 'retry'],
    ['KeyF', 'fullscreen'], ['KeyM', 'mute'], ['Tab', 'hint'],
  ];
  for (const [code, action] of hits) {
    fireKey('keydown', code);
    const got = input.hit(action);
    check(`${code} → ${action}`, got, `hit=${got}`);
    fireKey('keyup', code);
    input.endFrame();
  }

  // hit() は 1 フレームだけ。押しっぱなしで連射しない（メニューの暴走を防ぐ）
  fireKey('keydown', 'KeyZ');
  const first = input.hit('confirm');
  const stillDown = input.down('confirm');   // keyup の前に見る（押しっぱなしの意味）
  input.endFrame();
  const second = input.hit('confirm');
  fireKey('keyup', 'KeyZ');
  check('hit() は 1 フレームで消える', first && !second, `first=${first} second=${second}`);
  check('押しっぱなしの down() は残る', stillDown);

  // ブラウザの標準動作を止める（矢印でページがスクロールすると操作が奪われる）
  const evL = fireKey('keydown', 'ArrowLeft');
  const evSp = fireKey('keydown', 'Space');
  fireKey('keyup', 'ArrowLeft'); fireKey('keyup', 'Space');
  check('矢印キーの既定動作を止める', evL.defaultPrevented);
  check('Space の既定動作を止める', evSp.defaultPrevented);
  input.endFrame();

  // 斜め移動は正規化される（斜めだけ速い、を防ぐ）
  fireKey('keydown', 'ArrowLeft'); fireKey('keydown', 'ArrowUp');
  const diag = input.moveVec();
  fireKey('keyup', 'ArrowLeft'); fireKey('keyup', 'ArrowUp');
  check('斜め移動が正規化される', Math.abs(Math.hypot(diag.x, diag.y) - 1) < 1e-6,
    `|v|=${Math.hypot(diag.x, diag.y).toFixed(4)}`);

  // 未割り当てのキーで落ちない
  let threw = false;
  try { fireKey('keydown', 'F13'); } catch (e) { threw = true; }
  check('未割り当てキーで例外を出さない', !threw);
  input.endFrame();

  // ウィンドウがフォーカスを失ったら押しっぱなしを解除する
  fireKey('keydown', 'ArrowLeft');
  fireKey('blur', '');
  const afterBlur = input.moveVec();
  check('blur で押しっぱなしが解除される', !afterBlur.active, JSON.stringify(afterBlur));
  input.endFrame();
}

/* ==================================================== 2. 集中モード == */
console.log('■ 集中（低速）モード');
{
  check('Shift で集中', (() => { fireKey('keydown', 'ShiftLeft'); const r = input.focusHeld(); fireKey('keyup', 'ShiftLeft'); return r; })());
  check('離すと解除', !input.focusHeld());
  input.endFrame();
}

/* ==================================================== 3. タッチ / ポインタ == */
console.log('■ タッチ / ポインタ');
{
  const cw = canvas.getBoundingClientRect();
  check('キャンバスが 640x480', canvas.width === W && canvas.height === H, `${canvas.width}x${canvas.height}`);
  check('getBoundingClientRect が取れる', cw.width === W);

  firePointer('pointerdown', ptrEvent(1, 100, 100, 'touch'));
  check('pointerdown でドラッグ開始', input.ptr.down && input.ptr.isTouch,
    `down=${input.ptr.down} touch=${input.ptr.isTouch}`);
  check('開始位置が論理解像度で入る', Math.abs(input.ptr.x - 100) < 1e-6 && Math.abs(input.ptr.y - 100) < 1e-6,
    `${input.ptr.x},${input.ptr.y}`);

  firePointer('pointermove', ptrEvent(1, 110, 130, 'touch'));
  check('pointermove で差分が溜まる', Math.abs(input.ptr.dx - 10) < 1e-6 && Math.abs(input.ptr.dy - 30) < 1e-6,
    `dx=${input.ptr.dx} dy=${input.ptr.dy}`);
  check('pointerMoved が立つ', input.pointerMoved);

  // 2 本目の指 → 集中モード（実機のタッチパネルが無くても、ここで判定を守れる）
  firePointer('pointerdown', ptrEvent(2, 300, 300, 'touch'));
  check('2 本目の指で集中モード', input.focusHeld());
  const beforeX = input.ptr.x;
  firePointer('pointermove', ptrEvent(2, 400, 400, 'touch'));
  check('2 本目の指は移動を奪わない', input.ptr.x === beforeX, `x=${input.ptr.x}`);
  firePointer('pointerup', ptrEvent(2, 400, 400, 'touch'));
  check('2 本目を離すと集中解除', !input.focusHeld());
  input.endFrame();

  firePointer('pointerup', ptrEvent(1, 110, 130, 'touch'));
  check('タップで confirm が立つ', input.hit('confirm'));
  check('指を離すとドラッグ終了', !input.ptr.down);
  input.endFrame();

  // マウス（非タッチ）でも移動できる
  firePointer('pointerdown', ptrEvent(3, 200, 200, 'mouse'));
  check('マウスでもドラッグ開始', input.ptr.down && !input.ptr.isTouch);
  firePointer('pointermove', ptrEvent(3, 180, 200, 'mouse'));
  check('マウスの差分が溜まる', Math.abs(input.ptr.dx + 20) < 1e-6, `dx=${input.ptr.dx}`);
  firePointer('pointercancel', ptrEvent(3, 180, 200, 'mouse'));
  check('pointercancel でドラッグ終了', !input.ptr.down);
  input.endFrame();

  // 拡大表示（CSS サイズ ≠ 論理解像度）でも座標が合う
  canvas.getBoundingClientRect = () => ({ left: 20, top: 10, width: W * 2, height: H * 2 });
  firePointer('pointerdown', ptrEvent(4, 20 + 200, 10 + 100, 'touch'));
  const sc = { x: input.ptr.x, y: input.ptr.y };
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H });
  firePointer('pointerup', ptrEvent(4, 0, 0, 'touch'));
  check('拡大表示でも座標が論理解像度に変換される',
    Math.abs(sc.x - 100) < 1e-6 && Math.abs(sc.y - 50) < 1e-6, `${sc.x},${sc.y}`);
  input.endFrame();
}

/* ============================================ 4. 本番の自機を動かす == */
console.log('■ 入力 → 自機の移動（本番コード）');
{
  const mk = () => {
    const p = new HN.Player(W, H);
    p.reset();
    return p;
  };
  const fresh = () => {
    input.ptr.down = false; input.ptr.second = false; input.ptr.dx = 0; input.ptr.dy = 0;
    input.keys = Object.create(null); input.endFrame();
  };

  // 右へ
  {
    const p = mk(); fresh();
    const x0 = p.x;
    fireKey('keydown', 'ArrowRight');
    for (let i = 0; i < 60; i++) { p.update(DT, input, null); input.endFrame(); }
    fireKey('keyup', 'ArrowRight');
    check('右キーで右へ進む', p.x > x0 + 20, `Δx=${(p.x - x0).toFixed(1)}`);
  }
  // 上へ
  {
    const p = mk(); fresh();
    const y0 = p.y;
    fireKey('keydown', 'ArrowUp');
    for (let i = 0; i < 60; i++) { p.update(DT, input, null); input.endFrame(); }
    fireKey('keyup', 'ArrowUp');
    check('上キーで上へ進む', p.y < y0 - 20, `Δy=${(p.y - y0).toFixed(1)}`);
  }
  // 集中モードは遅い（＝精密に動ける）
  {
    const p1 = mk(), p2 = mk(); fresh();
    fireKey('keydown', 'ArrowRight');
    for (let i = 0; i < 60; i++) { p1.update(DT, input, null); input.endFrame(); }
    fireKey('keyup', 'ArrowRight');

    fresh();
    fireKey('keydown', 'ArrowRight'); fireKey('keydown', 'ShiftLeft');
    for (let i = 0; i < 60; i++) { p2.update(DT, input, null); input.endFrame(); }
    fireKey('keyup', 'ArrowRight'); fireKey('keyup', 'ShiftLeft');
    check('集中モードは同じ 1 秒で進む距離が短い', p2.x < p1.x - 40,
      `通常=${(p1.x - 320).toFixed(1)} 集中=${(p2.x - 320).toFixed(1)}`);
    check('集中モード中のフラグが立つ', p2.focusT > 0.5, `focusT=${p2.focusT.toFixed(2)}`);
  }
  // タッチのドラッグで移動する（指の移動量が自機に伝わる）
  {
    const p = mk(); fresh();
    const x0 = p.x, y0 = p.y;
    firePointer('pointerdown', ptrEvent(11, 320, 300, 'touch'));
    for (let k = 0; k < 20; k++) { firePointer('pointermove', ptrEvent(11, 320 - (k + 1) * 5, 300 + (k + 1) * 2, 'touch')); p.update(DT, input, null); input.endFrame(); }
    firePointer('pointerup', ptrEvent(11, 0, 0, 'touch'));
    check('タッチのドラッグで左へ動く', p.x < x0 - 50, `Δx=${(p.x - x0).toFixed(1)}`);
    check('タッチのドラッグで下へ動く', p.y > y0 + 20, `Δy=${(p.y - y0).toFixed(1)}`);
  }
  // 2 本目の指を置くと、ドラッグの移動量が小さくなる（集中）
  {
    const p1 = mk(), p2 = mk(); fresh();
    firePointer('pointerdown', ptrEvent(21, 320, 300, 'touch'));
    for (let k = 0; k < 20; k++) { firePointer('pointermove', ptrEvent(21, 320 - (k + 1) * 5, 300, 'touch')); p1.update(DT, input, null); input.endFrame(); }
    firePointer('pointerup', ptrEvent(21, 0, 0, 'touch'));

    fresh();
    firePointer('pointerdown', ptrEvent(22, 320, 300, 'touch'));
    firePointer('pointerdown', ptrEvent(23, 500, 400, 'touch'));
    for (let k = 0; k < 20; k++) { firePointer('pointermove', ptrEvent(22, 320 - (k + 1) * 5, 300, 'touch')); p2.update(DT, input, null); input.endFrame(); }
    firePointer('pointerup', ptrEvent(23, 0, 0, 'touch'));
    firePointer('pointerup', ptrEvent(22, 0, 0, 'touch'));
    const d1 = 320 - p1.x, d2 = 320 - p2.x;
    check('2 本目の指ありのドラッグは移動量が小さい', d2 < d1 - 15,
      `通常=${d1.toFixed(1)}px 集中=${d2.toFixed(1)}px`);
  }
  // 画面外へは出ない（壁で止まる）
  {
    const p = mk(); fresh();
    fireKey('keydown', 'ArrowRight');
    for (let i = 0; i < 60 * 8; i++) { p.update(DT, input, null); input.endFrame(); }
    fireKey('keyup', 'ArrowRight');
    check('右端で止まる', p.x <= W - 8 + 1e-6, `x=${p.x.toFixed(1)}`);
    fireKey('keydown', 'ArrowDown');
    for (let i = 0; i < 60 * 8; i++) { p.update(DT, input, null); input.endFrame(); }
    fireKey('keyup', 'ArrowDown');
    check('下端で止まる', p.y <= H - 8 + 1e-6, `y=${p.y.toFixed(1)}`);
  }
}

/* ======================================== 5. 画面内ボタン（タッチ UI） == */
console.log('■ 画面内ボタン（タッチ端末）');
{
  const rects = HN.HUD.buttonRects();
  check('観測ボタンが画面の内側にある',
    rects.observe.x > 0 && rects.observe.x < W && rects.observe.y > 0 && rects.observe.y < H);
  check('ポーズボタンが画面の内側にある',
    rects.pause.x > 0 && rects.pause.x < W && rects.pause.y > 0 && rects.pause.y < H);
  check('2 つのボタンが重なっていない',
    Math.hypot(rects.observe.x - rects.pause.x, rects.observe.y - rects.pause.y)
      > rects.observe.r + rects.pause.r);
  // HUD の文字と重ならないこと（残機ラベル・かすり・スコアの位置から確認）
  check('ポーズボタンが残機ラベルより上', rects.pause.y + rects.pause.r < H - 46, `y=${rects.pause.y}`);
  check('観測ボタンがスコア表示より上', rects.observe.y + rects.observe.r <= H - 36, `y=${rects.observe.y}`);

  check('hitButton が中心を拾う', HN.HUD.hitButton(rects.observe.x, rects.observe.y) === 'observe');
  check('hitButton が外側を拾わない', HN.HUD.hitButton(rects.observe.x - rects.observe.r - 2, rects.observe.y) === null);
  check('hitButton がポーズを拾う', HN.HUD.hitButton(rects.pause.x, rects.pause.y) === 'pause');

  // ゲーム中はボタンが効く
  input.touchUI = true;
  input.endFrame();
  firePointer('pointerdown', ptrEvent(31, rects.observe.x, rects.observe.y, 'touch'));
  check('観測ボタンで観測（cancel）が立つ', input.hit('cancel'));
  firePointer('pointerup', ptrEvent(31, rects.observe.x, rects.observe.y, 'touch'));
  check('ボタンのタップは決定にしない', !input.hit('confirm'));
  check('ボタンのタップではドラッグが始まらない', !input.ptr.down);
  check('タッチが使われたことを記録する', win.HN.touchUsed === true);
  input.endFrame();

  firePointer('pointerdown', ptrEvent(32, rects.pause.x, rects.pause.y, 'touch'));
  check('ポーズボタンでポーズが立つ', input.hit('pause'));
  firePointer('pointerup', ptrEvent(32, rects.pause.x, rects.pause.y, 'touch'));
  input.endFrame();

  // ゲーム中でなければボタンは効かない（メニューはどこを叩いても決定にしたい）
  input.touchUI = false;
  firePointer('pointerdown', ptrEvent(33, rects.observe.x, rects.observe.y, 'touch'));
  check('ゲーム外ではボタンを拾わない', !input.hit('cancel') && input.ptr.down);
  firePointer('pointerup', ptrEvent(33, rects.observe.x, rects.observe.y, 'touch'));
  check('ゲーム外のタップは決定になる', input.hit('confirm'));
  input.endFrame();

  // ポーズメニューをタップで選べる（本番の Game の当たり判定）
  const game = new HN.Game();
  check('タップ位置 → 1 番目の項目', game.pauseItemAt(200) === 0, String(game.pauseItemAt(200)));
  check('タップ位置 → 4 番目の項目', game.pauseItemAt(290) === 3, String(game.pauseItemAt(290)));
  check('タップ位置 → 最後の項目', game.pauseItemAt(320) === 4, String(game.pauseItemAt(320)));
  check('項目より上は選択なし', game.pauseItemAt(150) === -1, String(game.pauseItemAt(150)));
  check('最後の項目より下は選択なし', game.pauseItemAt(200 + 5 * 30) === -1, String(game.pauseItemAt(350)));
}

console.log('-'.repeat(60));
console.log(`合計 ${ok + ng} 件 / NG ${ng} 件`);
process.exit(ng ? 1 : 0);
