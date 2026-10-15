/**
 * stages.js — ステージ / フェーズ定義
 *
 * 本作は「倒す」ゲームではなく「耐える」ゲームなので、フェーズの本体は
 *   ・耐久時間 (len)
 *   ・弾幕 (actions)
 *   ・ボスの状態 (form / move / tint)
 * の 3 点セットで記述する。プレイヤーは len 秒を生き延びれば次のフェーズへ。
 *
 * actions は patterns.js の PhaseRunner が時間軸に並べる:
 *   { at, every, until, do(S), telegraph, charge, count, jitter }
 *
 * design メモは成果物ドキュメントの「フェーズ一覧」にそのまま転記できる形式で
 * 書いてある (発射位置 / 弾速 / 発射間隔 / 軌道変化 / 持続時間 / 回避ルート /
 * 視覚的予告 / フェーズ内の役割 / 原作対応)。
 *
 * cam: 'pseudo3d' を指定したフェーズだけが擬似3D演出に入る (全フェーズではない)。
 */
import { rad } from '../core/util.js';
import * as P from './patterns_lib.js';
import { CHARACTERS } from './characters.js';

const CX = 256;

/* ================================================================== *
 * 共通アクション部品
 * ================================================================== */

/** フェーズ開幕の予告 (弾を出さずに光と音だけ) */
const open = (color, strength = 1) => ({ at: 0.15, do: (S) => P.phaseTelegraph(S, { color, strength }) });

/* ================================================================== *
 * 第1幕 — 両馬 二郎
 * 原作対応: ✝本質✝の最初期。教室に降ってくる「✝」と、反復する掲示物。
 * ================================================================== */

const STAGE1 = {
  key: 'stage1',
  no: 1,
  act: '第一幕',
  name: '✝本質✝、降下',
  sub: '理数科 2年B組',
  char: 'ryoma',
  song: 'stage1',
  bg: 'stage1',
  bgTint: '#3b2a55',
  boss: {
    key: 'ryoma',
    name: CHARACTERS.ryoma.name,
    title: '✝本質✝の発生源',
    height: 150,
    drift: 17,
    bobAmp: 2.6,
    bobFreq: 0.40,
    tint: '#ffb066',
    chargeColor: '#ffd9a0',
    muzzleColor: '#fff0c0',
    attackPoints: [
      { dx: 0.00, dy: -0.50, name: 'core' },
      { dx: -0.34, dy: -0.14, name: 'left' },
      { dx: 0.34, dy: -0.14, name: 'right' },
      { dx: 0.00, dy: 0.02, name: 'crown' },
    ],
    intro: { from: { x: 256, y: -240 }, to: { x: 256, y: 132 }, dur: 2.0 },
    defeat: { rise: 18, dissolveAt: 1.4, endAt: 2.4 },
  },
  sheet: {
    id: 'boss_ryoma',
    faces: [
      'chr_ryoma_01_tsuujou',    // 0 NORMAL
      'chr_ryoma_02_niyari',     // 1 SMIRK
      'chr_ryoma_07_shinken_ketsui', // 2 FOCUS
      'chr_ryoma_06_nakiwarai',  // 3 CRY
    ],
  },
  forms: [
    {
      name: '第一形態「にやり」',
      face: 1, tint: '#ff9a3c', cast: null, bossScale: 1.0,
      move: { kind: 'patrol', speed: 26, min: 132, max: 380, dir: 1 },
    },
    {
      name: '第二形態「平常心」',
      face: 0, tint: '#ff7bb0', cast: null, bossScale: 1.06,
      move: { kind: 'lissajous', cx: CX, cy: 118, ax: 96, ay: 28, fx: 0.22, fy: 0.15 },
    },
    {
      name: '第三形態「✝本質✝全開」',
      face: 2, tint: '#ffe14d', cast: 'saturate(1.25) contrast(1.06)', bossScale: 1.14,
      move: { kind: 'orbit', cx: CX, cy: 122, w: 74, h: 22, speed: 0.55 },
    },
  ],
  phases: [
    /* ---------------------------------------------------------------- */
    {
      n: '第一段階「号令」',
      form: 0,
      len: 24,
      level: 0,
      actions: [
        open('#ffd9a0', 0.8),
        // 円形拡散 (回転する壁) — 導入。隙間は等間隔で必ず通れる
        { at: 1.4, every: 2.9, until: 18.0, do: (S) => P.spinRingBurst(S, { n: 12, speed: 56, offsetStep: 26, type: 'rice', color: 'gold', r: 5, life: 9 }) },
        // 一点狙い (3連) — 「今狙われた」と分かる軌道
        { at: 4.0, every: 5.4, until: 18.0, charge: 0.5, do: (S) => P.aimedVolley(S, { n: 3, speed: 96, spread: rad(16), gap: 0, type: 'kunai', color: 'orange', r: 4.6, life: 8 }) },
        // 隙間付きの壁 (上から) — 左右に逃げる練習
        { at: 8.4, every: 6.6, until: 19.0, telegraph: true, charge: 0.7, do: (S) => P.openingWall(S, { n: 11, speed: 62, gapWidth: 3, swing: 3.6, type: 'orb', color: 'ember', r: 5, life: 11, fromTop: true }) },
        { at: 20.5, do: (S) => P.phaseTelegraph(S, { color: '#ffd9a0', strength: 0.6 }) },
      ],
      design: '発射位置=ボス中心/左右。弾速56〜96。円形拡散(2.9s間隔)で基本の「回る壁」を提示し、一点狙いで「狙われている」ことを伝え、最後に隙間付きの壁で左右移動を要求する。回避ルート: リングの隙間は等間隔、壁の隙間は3個分。予告: 開幕の発光+リング。役割: 導入。原作対応: 教室に降る✝の反復。',
    },
    /* ---------------------------------------------------------------- */
    {
      n: '第二段階「✝の羅列」',
      form: 0,
      len: 26,
      level: 0,
      actions: [
        open('#ffe9a8', 0.9),
        // 十字 (✝) のリング。原作の記号そのものを弾にする
        { at: 1.6, every: 3.4, until: 20.0, do: (S) => P.crossRing(S, { n: 10, speed: 64, offsetStep: 17, arms: 2, type: 'cross', color: 'blood', r: 5.4, life: 10 }) },
        // 時間差連鎖 (掲示板の羅列)
        { at: 5.0, every: 6.0, until: 20.0, do: (S) => P.chainBurst(S, { stages: 4, perStage: 9, speed: 70, offsetStep: 11, delayStep: 0.32, type: 'shard', color: 'violet', r: 4.6, life: 10 }) },
        // 左右から挟む壁 (開閉)
        { at: 9.5, every: 7.2, until: 21.0, telegraph: true, charge: 0.7, do: (S) => P.openingWall(S, { n: 12, speed: 60, gapWidth: 3, swing: 5.0, type: 'orbBig', color: 'blue', r: 6.2, life: 11, fromTop: false }) },
        { at: 22.0, do: (S) => P.phaseTelegraph(S, { color: '#ffe9a8', strength: 0.6 }) },
      ],
      design: '発射位置=ボス中心/左右の対。弾速60〜70。✝型の十字リングと時間差の連鎖で「画面を埋めるが必ず隙間がある」状態を作る。回避ルート: 十字の腕と腕の間を縫う。開閉壁は中央の隙間が呼吸する。予告: 各壁の前にリング+チャージ音。役割: 展開。原作対応: 掲示板に並ぶ✝の羅列、反復。',
    },
    /* ---------------------------------------------------------------- */
    {
      n: '第三段階「本質の流出」',
      form: 1,
      len: 28,
      level: 1,
      actions: [
        open('#ff9dd0', 1.0),
        { at: 1.4, every: 3.8, until: 21.0, do: (S) => P.staringEyes(S, { n: 4, speed: 58, radius: 62, type: 'eye', color: 'ash', r: 7, life: 10 }) },
        { at: 3.2, every: 4.6, until: 22.0, charge: 0.6, do: (S) => P.homingPursuit(S, { n: 2, speed: 48, homingRate: rad(34), homingTime: 1.5, type: 'orb', color: 'orange', r: 6, life: 9, spread: rad(24) }) },
        { at: 7.0, every: 4.2, until: 22.0, charge: 0.5, do: (S) => P.holdAndTurn(S, { n: 8, speed: 104, hold: 0.9, turnDeg: 90, type: 'arrow', color: 'violet', r: 5, life: 10 }) },
        { at: 12.0, every: 8.4, until: 23.0, telegraph: true, charge: 0.9, do: (S) => P.rotatingLasers(S, { count: 3, width: 12, spinDeg: 20, fireTime: 2.2, color: '#ff9d4a', warnTime: 1.05 }) },
        { at: 24.0, do: (S) => P.phaseTelegraph(S, { color: '#ff9dd0', strength: 0.7 }) },
      ],
      design: '発射位置=ボス四肢(点/輪)。弾速48〜104。視線(eye)が常時画面にあり、低速の追尾が「置き場所」を制限し、方向転換弾が「止まって見る」ことを要求する。回転レーザーは1.05秒の予告線のあとに発火。回避ルート: 追尾は1.5秒で止まるので、止まった瞬間に外向きへ。役割: 展開〜山場。原作対応: ✝本質✝が教室から滲み出す場面の「視線」。',
    },
    /* ---------------------------------------------------------------- */
    {
      n: '最終段階「観測」',
      form: 2,
      len: 30,
      level: 3,
      cam: 'pseudo3d',           // ← ここだけ擬似3D
      actions: [
        open('#ffe14d', 1.2),
        { at: 2.2, every: 3.0, until: 24.0, do: (S) => P.tunnel3D(S, { n: 11, speed: 130, radius: 80, type: 'orb', color: 'ice', r: 6, life: 13 }) },
        { at: 5.0, every: 7.6, until: 25.0, telegraph: true, charge: 0.9, do: (S) => P.rotatingLasers3D(S, { count: 3, width: 12, spinDeg: 19, fireTime: 2.4, warnTime: 1.1 }) },
        { at: 9.0, every: 6.2, until: 25.0, do: (S) => P.starfall3D(S, { n: 7, speed: 120, spreadX: 200, spreadZ: 150, type: 'star6', color: 'white', r: 6, life: 13 }) },
        { at: 14.0, every: 9.0, until: 26.0, charge: 0.8, do: (S) => P.flower3D(S, { n: 16, speed: 112, radius: 145, type: 'orbBig', color: 'gold', r: 8, life: 13, ringCount: 2 }) },
        { at: 27.0, do: (S) => P.phaseTelegraph(S, { color: '#ffe14d', strength: 1.0 }) },
      ],
      design: '発射位置=消失点(奥)とボス。弾速112〜130。カメラを自機の後方上空へ移し、上下移動が奥行きになる。トンネルは「奥から手前に来る」ため、2Dの左右回避と同じ操作で避けられる。回転レーザーは奥の消失点から伸びる。回避ルート: 常に画面手前側に空間があり、奥に詰めなければ死なない。予告: カメラ移行に1.4秒のスムーズな移動+発光。役割: 山場。原作対応: ✝本質✝＝「観測されることで確定する」という終盤の主題。',
    },
  ],
  outro: {
    title: '第一幕 終了',
    lines: [
      { who: 'ryoma', text: '「はは、✝本質✝ってそういうことか」' },
      { who: 'naito', text: '「……両馬くん、まだ笑ってる」' },
    ],
  },
};

/* ================================================================== *
 * 第2幕 — 寺地 星
 * 原作対応: 認められたい底辺YouTuber。配信・視聴者・コメント欄。
 * ================================================================== */

const STAGE2 = {
  key: 'stage2',
  no: 2,
  act: '第二幕',
  name: '配信、視聴者、そして',
  sub: '再生回数のかたわらで',
  char: 'terachi',
  song: 'stage2',
  bg: 'stage2',
  bgTint: '#22375c',
  boss: {
    key: 'terachi',
    name: CHARACTERS.terachi.name,
    title: '底辺 YouTuber',
    height: 150,
    drift: 20,
    bobAmp: 2.2,
    bobFreq: 0.33,
    tint: '#7fd4ff',
    chargeColor: '#d8f6ff',
    muzzleColor: '#e8fbff',
    intro: { from: { x: 60, y: -230 }, to: { x: 256, y: 126 }, dur: 2.1 },
    defeat: { rise: 16, dissolveAt: 1.5, endAt: 2.6 },
  },
  sheet: {
    id: 'boss_terachi',
    faces: [
      'chr_terachi_01_nemusou',
      'chr_terachi_02_konwaku_katamaru',
      'chr_terachi_03_haishin_shinken',
      'chr_terachi_08_namida',
    ],
  },
  forms: [
    {
      name: '第一形態「眠そう」',
      face: 0, tint: '#5fbcff', cast: null, bossScale: 1.0,
      move: { kind: 'patrol', speed: 30, min: 124, max: 388, dir: -1 },
    },
    {
      name: '第二形態「マイクの決意」',
      face: 2, tint: '#6fc7ff', cast: null, bossScale: 1.05,
      move: { kind: 'moveTo', x: CX, y: 108, rate: 0.9 },
    },
    {
      name: '第三形態「配信者」',
      face: 1, tint: '#7ce0ff', cast: 'saturate(1.15)', bossScale: 1.1,
      move: { kind: 'lissajous', cx: CX, cy: 116, ax: 104, ay: 26, fx: 0.28, fy: 0.19 },
    },
    {
      name: '最終形態「涙」',
      face: 3, tint: '#b6e8ff', cast: 'saturate(0.72) brightness(1.08)', bossScale: 1.16,
      move: { kind: 'orbit', cx: CX, cy: 120, w: 62, h: 20, speed: 0.45 },
    },
  ],
  phases: [
    {
      n: '第一段階「配信開始」',
      form: 0,
      len: 22,
      level: 0,
      actions: [
        open('#d8f6ff', 0.8),
        { at: 1.3, every: 3.2, until: 17.0, do: (S) => P.spinRingBurst(S, { n: 13, speed: 58, offsetStep: -24, type: 'orb', color: 'ice', r: 5, life: 9 }) },
        { at: 4.6, every: 4.4, until: 18.0, charge: 0.5, do: (S) => P.aimedVolley(S, { n: 4, speed: 100, spread: rad(26), gap: rad(10), type: 'rice', color: 'blue', r: 4.6, life: 8, jitter: rad(3) }) },
        { at: 8.8, every: 5.6, until: 19.0, telegraph: true, charge: 0.7, do: (S) => P.rotatingLasers(S, { count: 2, width: 11, spinDeg: 15, fireTime: 2.0, color: '#7fd4ff', warnTime: 0.95 }) },
        { at: 19.4, do: (S) => P.phaseTelegraph(S, { color: '#d8f6ff', strength: 0.6 }) },
      ],
      design: '発射位置=ボス中心/左右。弾速58〜100。氷色のリングと、中央に隙間のある扇で「配信を始めた」静かな導入。回転レーザー2本は左右対称で回り、間隔が広いので歩いて避けられる。役割: 導入。原作対応: 教室で眠そうに配信を始める寺地。',
    },
    {
      n: '第二段階「視聴者数」',
      form: 1,
      len: 24,
      level: 1,
      actions: [
        open('#7fd4ff', 0.9),
        { at: 1.4, every: 4.0, until: 19.0, do: (S) => P.symmetricBurst(S, { speed: 74, lanes: 4, perLane: 4, spread: rad(22), type: 'shard', color: 'cyan', r: 4.6, life: 9 }) },
        { at: 4.2, every: 5.2, until: 19.0, do: (S) => P.chainBurst(S, { stages: 5, perStage: 8, speed: 72, offsetStep: -13, delayStep: 0.28, type: 'orb', color: 'ice', r: 4.8, life: 9, colors: ['ice', 'white', 'cyan'] }) },
        { at: 9.0, every: 6.4, until: 20.0, charge: 0.6, do: (S) => P.homingPursuit(S, { n: 3, speed: 50, homingRate: rad(30), homingTime: 1.4, type: 'orb', color: 'ice', r: 5.6, life: 9, spread: rad(30) }) },
        { at: 12.0, every: 8.0, until: 21.0, telegraph: true, charge: 0.8, do: (S) => P.openingWall(S, { n: 13, speed: 66, gapWidth: 3, swing: 4.4, type: 'rice', color: 'blue', r: 5, life: 11 }) },
        { at: 21.5, do: (S) => P.phaseTelegraph(S, { color: '#7fd4ff', strength: 0.7 }) },
      ],
      design: '発射位置=ボス中心+左右対称4方向。弾速66〜74。対称弾幕は左右が鏡像なので「読める」。追尾3発は1.4秒で失速するので、撃たれた瞬間に横へ。壁の隙間は呼吸する。役割: 展開。原作対応: 視聴者が増えていく感覚を幾何の対称性で表す。',
    },
    {
      n: '第三段階「コメント欄」',
      form: 2,
      len: 26,
      level: 2,
      actions: [
        open('#7ce0ff', 1.0),
        // 上から流れ落ちる壁 = コメント欄のスクロール
        { at: 1.6, every: 2.4, until: 20.0, do: (S) => P.openingWall(S, { n: 14, speed: 74, gapWidth: 3, swing: 6.2, base: 0.5, type: 'shard', color: 'ghost', r: 4.6, life: 10, fromTop: true }) },
        { at: 3.0, every: 5.8, until: 21.0, charge: 0.7, do: (S) => P.aimedVolley(S, { n: 6, speed: 108, spread: rad(38), gap: rad(14), type: 'kunai', color: 'red', r: 5, life: 9 }) },
        { at: 8.0, every: 6.8, until: 21.0, do: (S) => P.mirrorBullets(S, { n: 6, speed: 96, type: 'orb', color: 'jade', r: 5.4, life: 12, bounce: 2 }) },
        { at: 13.0, every: 9.2, until: 22.0, telegraph: true, charge: 0.9, do: (S) => P.rotatingLasers(S, { count: 4, width: 12, spinDeg: -18, fireTime: 2.3, color: '#7ce0ff', warnTime: 1.1 }) },
        { at: 23.0, do: (S) => P.phaseTelegraph(S, { color: '#7ce0ff', strength: 0.8 }) },
      ],
      design: '発射位置=画面上端(0.25画面幅ずつずらした2点)+ボス。弾速74〜108。上から絶えず落ちる壁が「コメント欄」、それに混ざって反射弾が左右から入る。反射は2回で消えるので永久には跳ねない。回避ルート: 落ちてくる壁の隙間を追いかければ、反射弾は自然に外れる。役割: 山場。原作対応: 配信のコメント欄が埋まっていく様子。',
    },
    {
      n: '最終段階「同時接続」',
      form: 3,
      len: 28,
      level: 3,
      cam: 'pseudo3d',           // ← ここだけ擬似3D
      actions: [
        open('#b6e8ff', 1.1),
        { at: 2.0, every: 2.8, until: 22.0, do: (S) => P.wall3D(S, { n: 13, speed: 142, span: 720, gapRatio: 0.5, gapWidth: 4, type: 'rice', color: 'blue', r: 5, life: 13 }) },
        { at: 5.4, every: 6.8, until: 23.0, do: (S) => P.spiral3D(S, { count: 3, speed: 138, arms: 2, radius: 104, radiusStep: 14, type: 'kunai', color: 'cyan', r: 5.5, life: 13 }) },
        { at: 10.0, every: 7.4, until: 24.0, telegraph: true, charge: 0.9, do: (S) => P.rotatingLasers3D(S, { count: 4, width: 12, spinDeg: -17, fireTime: 2.4, warnTime: 1.1 }) },
        { at: 16.0, every: 10.0, until: 25.0, charge: 0.8, do: (S) => P.flower3D(S, { n: 18, speed: 110, radius: 150, type: 'orbBig', color: 'violet', r: 8, life: 13, ringCount: 2 }) },
        { at: 25.6, do: (S) => P.phaseTelegraph(S, { color: '#b6e8ff', strength: 1.0 }) },
      ],
      design: '発射位置=消失点とボスの手。弾速110〜142。奥行きのある壁が「視聴者数の桁」として迫る。手前側には常に逃げ場がある。回避ルート: 3D壁は z が増えるほど横に広がるので、手前(下)に下がれば隙間が広がる。予告: 1.4秒のカメラ移行。役割: 山場。原作対応: 同時接続者数という数字が「本質」に置き換わる場面。',
    },
  ],
  outro: {
    title: '第二幕 終了',
    lines: [
      { who: 'terachi', text: '「……あれ、再生数、いつもより多い」' },
      { who: 'mie', text: '「……それ、✝本質✝が観てるだけじゃないの」' },
    ],
  },
};

/* ================================================================== *
 * 第3幕 — 倉石 暁
 * 原作対応: ✝本質✝の狂信者。「教祖はいない、僕は信徒です」。
 *           反復・記録・断末魔のコピーが弾幕の主題。
 * ================================================================== */

const STAGE3 = {
  key: 'stage3',
  no: 3,
  act: '第三幕',
  name: '信徒、記録、断末魔',
  sub: '記録は消えない',
  char: 'kuraishi',
  song: 'stage3',
  bg: 'stage3',
  bgTint: '#4a1220',
  boss: {
    key: 'kuraishi',
    name: CHARACTERS.kuraishi.name,
    title: '✝本質✝の信徒 (自称)',
    height: 148,
    drift: 22,
    bobAmp: 2.0,
    bobFreq: 0.55,
    tint: '#ff5470',
    chargeColor: '#ffc2cd',
    muzzleColor: '#ffd8e2',
    intro: { from: { x: 452, y: -240 }, to: { x: 256, y: 130 }, dur: 1.9 },
    defeat: { rise: 22, dissolveAt: 1.3, endAt: 2.6 },
  },
  sheet: {
    id: 'boss_kuraishi',
    faces: [
      'chr_kuraishi_03_chousa_shinken',
      'chr_kuraishi_01_nekkyou',
      'chr_kuraishi_02_kangeki',
      'chr_kuraishi_06_kotoba_ushinau',
    ],
  },
  forms: [
    {
      name: '第一形態「調査」',
      face: 0, tint: '#ff6b7f', cast: null, bossScale: 1.0,
      move: { kind: 'patrol', speed: 34, min: 118, max: 394, dir: 1 },
    },
    {
      name: '第二形態「熱狂」',
      face: 1, tint: '#ff3b5c', cast: 'saturate(1.3) contrast(1.05)', bossScale: 1.08,
      move: { kind: 'lissajous', cx: CX, cy: 112, ax: 112, ay: 30, fx: 0.34, fy: 0.23 },
    },
    {
      name: '第三形態「感極まり」',
      face: 2, tint: '#ff2f6b', cast: 'saturate(1.4)', bossScale: 1.14,
      move: { kind: 'orbit', cx: CX, cy: 118, w: 80, h: 24, speed: 0.62 },
    },
    {
      name: '最終形態「言葉を失う」',
      face: 3, tint: '#c9c0ff', cast: 'saturate(0.45) brightness(0.92)', bossScale: 1.2,
      move: { kind: 'hold' },
    },
  ],
  phases: [
    {
      n: '第一段階「信徒」',
      form: 0,
      len: 24,
      level: 1,
      actions: [
        open('#ffc2cd', 0.9),
        { at: 1.2, every: 2.6, until: 18.0, charge: 0.5, do: (S) => P.aimedVolley(S, { n: 4, speed: 104, spread: rad(22), gap: rad(9), type: 'cross', color: 'red', r: 5, life: 9 }) },
        { at: 4.4, every: 3.8, until: 19.0, do: (S) => P.spinRingBurst(S, { n: 14, speed: 62, offsetStep: 21, arms: 2, type: 'cross', color: 'blood', r: 5.4, life: 10 }) },
        { at: 9.0, every: 6.2, until: 20.0, telegraph: true, charge: 0.8, do: (S) => P.crossRing(S, { n: 12, speed: 68, offsetStep: 15, arms: 2, type: 'cross', color: 'magenta', r: 5.4, life: 11 }) },
        { at: 13.6, every: 7.6, until: 21.0, telegraph: true, charge: 0.9, do: (S) => P.rotatingLasers(S, { count: 3, width: 12, spinDeg: 24, fireTime: 2.2, color: '#ff5470', warnTime: 1.0, angleOffset: 60 }) },
        { at: 21.5, do: (S) => P.phaseTelegraph(S, { color: '#ffc2cd', strength: 0.8 }) },
      ],
      design: '発射位置=ボス中心+左右。弾速62〜104。✝型の弾を狙い撃ちとリングの両方で使う。「✝本質✝」の記号そのものを弾の形として使う唯一のステージ。回避ルート: 狙い撃ちには中央の隙間(9度)があるので、立ち位置を固定しなければ通る。役割: 導入。原作対応: 信徒としての宣言。',
    },
    {
      n: '第二段階「記録」',
      form: 1,
      len: 26,
      level: 2,
      actions: [
        open('#ff3b5c', 1.0),
        // 記録 = 同じ壁が絶えず書き足される
        { at: 1.4, every: 2.2, until: 20.0, do: (S) => P.openingWall(S, { n: 15, speed: 72, gapWidth: 3, swing: 5.6, type: 'shard', color: 'blood', r: 4.8, life: 10, fromTop: true }) },
        { at: 3.6, every: 5.4, until: 21.0, do: (S) => P.chainBurst(S, { stages: 5, perStage: 9, speed: 74, offsetStep: 12, delayStep: 0.26, type: 'shard', color: 'red', r: 4.6, life: 10 }) },
        { at: 8.0, every: 4.4, until: 21.0, charge: 0.5, do: (S) => P.holdAndTurn(S, { n: 9, speed: 110, hold: 0.8, turnDeg: 75, type: 'arrow', color: 'magenta', r: 5, life: 10 }) },
        { at: 12.6, every: 7.0, until: 22.0, charge: 0.7, do: (S) => P.homingPursuit(S, { n: 4, speed: 54, homingRate: rad(36), homingTime: 1.6, type: 'eye', color: 'shadow', r: 5.6, life: 9, spread: rad(44) }) },
        { at: 22.4, do: (S) => P.phaseTelegraph(S, { color: '#ff3b5c', strength: 0.9 }) },
      ],
      design: '発射位置=上端2点+ボス四肢。弾速54〜110。落ち続ける壁(記録) + 時間差連鎖(書き足し) + 方向転換弾(読み返し) + 低速追尾(視線)。4種が同時に走るが、全部が低速〜中速で、隙間は必ず残る。回避ルート: 落ちてくる壁の隙間を軸に、左右の端で方向転換弾をやり過ごす。役割: 展開〜山場。原作対応: 記録が消えないという恐怖。',
    },
    {
      n: '第三段階「断末魔のコピー」',
      form: 2,
      len: 28,
      level: 3,
      cam: 'pseudo3d',           // ← ここだけ擬似3D
      actions: [
        open('#ff2f6b', 1.2),
        { at: 2.0, every: 2.6, until: 22.0, do: (S) => P.tunnel3D(S, { n: 13, speed: 128, radius: 86, type: 'cross', color: 'blood', r: 5.6, life: 13 }) },
        { at: 5.0, every: 6.4, until: 23.0, do: (S) => P.spiral3D(S, { count: 4, speed: 132, arms: 3, radius: 96, radiusStep: 13, type: 'shard', color: 'magenta', r: 5.2, life: 13 }) },
        { at: 10.0, every: 7.8, until: 24.0, telegraph: true, charge: 1.0, do: (S) => P.rotatingLasers3D(S, { count: 4, width: 13, spinDeg: 26, fireTime: 2.5, color: '#ff2f6b', warnTime: 1.1, angleOffset: 45 }) },
        { at: 16.0, every: 9.4, until: 25.0, do: (S) => P.starfall3D(S, { n: 8, speed: 124, spreadX: 220, spreadZ: 170, type: 'eye', color: 'red', r: 6, life: 13 }) },
        { at: 25.6, do: (S) => P.phaseTelegraph(S, { color: '#ff2f6b', strength: 1.0 }) },
      ],
      design: '発射位置=消失点とボスの両腕。弾速124〜132。奥から手前へ、✝と破片が交互に迫る。レーザーは消失点で回転し、4本の扇になるので「奥の中心」に居続けると危ない。回避ルート: 画面手前2/3のどこかに必ず安全な扇がある。予告: カメラ移行1.4秒 + レーザーの警告線1.1秒。役割: 山場。原作対応: 断末魔がコピーされ増殖するイメージ。',
    },
    {
      n: '最終段階「僕は信徒です」',
      form: 3,
      len: 30,
      level: 3,
      actions: [
        open('#c9c0ff', 1.0),
        // 内側へ収束 → 交差して抜ける。中心から離れていると閉じ込められない
        { at: 1.8, every: 4.6, until: 24.0, do: (S) => P.inwardConverge(S, { n: 16, radius: 330, speed: 80, type: 'orb', color: 'blood', r: 5.2, life: 9, turn: rad(6) }) },
        { at: 3.4, every: 5.8, until: 24.0, do: (S) => P.spinRingBurst(S, { n: 16, speed: 60, offsetStep: 15, arms: 2, type: 'ring', color: 'shadow', r: 5.6, life: 11 }) },
        { at: 6.6, every: 4.2, until: 25.0, charge: 0.6, do: (S) => P.mirrorBullets(S, { n: 7, speed: 98, type: 'orb', color: 'jade', r: 5.4, life: 12, bounce: 3 }) },
        { at: 11.0, every: 6.6, until: 25.0, telegraph: true, charge: 0.9, do: (S) => P.rotatingLasers(S, { count: 5, width: 12, spinDeg: -22, fireTime: 2.3, color: '#c9c0ff', warnTime: 1.05, angleOffset: 20 }) },
        { at: 16.0, every: 7.2, until: 26.0, charge: 0.8, do: (S) => P.finaleBarrage(S, { n: 26, speed: 40, type: 'orb', color: 'gold', r: 5.5, offsetStep: 7, life: 12, layers: 2 }) },
        { at: 27.0, do: (S) => P.phaseTelegraph(S, { color: '#c9c0ff', strength: 1.0 }) },
      ],
      design: '発射位置=全周とボス中心。弾速40〜98。収束弾(中心が危険)とリング(外周が危険)を同時に置くので、プレイヤーは「中距離」という正解を自分で見つける。反射弾は3回で消える。最後は濃密だが低速のフィナーレ。回避ルート: 半径100〜180の輪帯が実質安全。役割: 締め。原作対応: 「教祖はいない、僕は信徒です」という自己否定の終わり。',
    },
  ],
  outro: {
    title: '第三幕 終了',
    lines: [
      { who: 'kuraishi', text: '「……記録、全部消えた。消された」' },
      { who: 'ryoma', text: '「消えないよ。✝本質✝は、誰かが観測してる限り」' },
    ],
  },
};

/* ================================================================== *
 * 第4幕 — 數理 零 (最終ボス)
 * 原作対応: 全科目学年首席。観測 / 重ね合わせ / 波動関数の崩壊 / 家が近い。
 *           「立ち絵から着想した独自表現」を最も強く出す。5形態。
 * ================================================================== */

const STAGE4 = {
  key: 'stage4',
  no: 4,
  act: '最終幕',
  name: '観測',
  sub: '家が近いから',
  char: 'rei',
  song: 'stage4',
  bg: 'stage4',
  bgTint: '#1a1533',
  boss: {
    key: 'rei',
    name: CHARACTERS.rei.name,
    title: '全科目学年首席 / 偏差値八十五',
    height: 150,
    drift: 15,
    bobAmp: 2.2,
    bobFreq: 0.28,
    tint: '#cbb8ff',
    chargeColor: '#ffffff',
    muzzleColor: '#f4f0ff',
    intro: { from: { x: 256, y: -250 }, to: { x: 256, y: 126 }, dur: 2.4 },
    defeat: { rise: 12, dissolveAt: 1.8, endAt: 3.2 },
  },
  sheet: {
    id: 'boss_rei',
    faces: [
      'chr_rei_01_suzushii',
      'chr_rei_02_hohoemi',
      'chr_rei_05_data_shinken',
      'chr_rei_04_odoroki',
    ],
  },
  forms: [
    {
      name: '第一形態「涼しい顔」',
      face: 0, tint: '#cbb8ff', cast: null, bossScale: 1.0,
      move: { kind: 'lissajous', cx: CX, cy: 112, ax: 74, ay: 20, fx: 0.17, fy: 0.12 },
    },
    {
      name: '第二形態「データを読む」',
      face: 2, tint: '#a98cff', cast: 'saturate(1.2)', bossScale: 1.06,
      move: { kind: 'orbit', cx: CX, cy: 114, w: 66, h: 18, speed: 0.4 },
    },
    {
      name: '第三形態「微笑」',
      face: 1, tint: '#e0d4ff', cast: 'saturate(1.1) brightness(1.06)', bossScale: 1.1,
      move: { kind: 'patrol', speed: 26, min: 140, max: 372, dir: 1 },
    },
    {
      name: '第四形態「驚き」',
      face: 3, tint: '#ffffff', cast: 'saturate(0.55) brightness(1.12)', bossScale: 1.18,
      move: { kind: 'lissajous', cx: CX, cy: 108, ax: 118, ay: 34, fx: 0.29, fy: 0.20 },
    },
    {
      name: '最終形態「✝本質✝」',
      face: 0, tint: '#ffffff', cast: 'saturate(0.08) brightness(1.35) contrast(1.1)', bossScale: 1.26,
      move: { kind: 'hold' },
    },
  ],
  phases: [
    {
      n: '第一段階「静けさ」',
      form: 0,
      len: 26,
      level: 0,
      actions: [
        open('#ffffff', 0.9),
        // 中心が安全な大きな花 = 最も美しく、最も分かりやすい回避ルート
        { at: 1.6, every: 4.2, until: 20.0, do: (S) => P.flowerSafe(S, { n: 20, speed: 54, stagger: 0.8, type: 'orbBig', color: 'white', r: 9, life: 11 }) },
        { at: 3.0, every: 5.6, until: 21.0, charge: 0.6, do: (S) => P.aimedVolley(S, { n: 5, speed: 92, spread: rad(30), gap: rad(13), type: 'orb', color: 'indigo', r: 5, life: 9 }) },
        { at: 7.6, every: 5.0, until: 21.0, do: (S) => P.spinRingBurst(S, { n: 15, speed: 56, offsetStep: 13, type: 'ring', color: 'ghost', r: 5, life: 11 }) },
        { at: 12.0, every: 7.4, until: 22.0, telegraph: true, charge: 0.8, do: (S) => P.rotatingLasers(S, { count: 3, width: 11, spinDeg: 12, fireTime: 2.4, color: '#cbb8ff', warnTime: 1.15 }) },
        { at: 23.0, do: (S) => P.phaseTelegraph(S, { color: '#ffffff', strength: 0.8 }) },
      ],
      design: '発射位置=ボス中心。弾速54〜92。開幕は「美しい」ことを最優先にした花。中心に弾が来ないので、避けるというより「佇む」フェーズ。そこに狙い撃ちとリングが重なり、徐々に中央を離れる判断が必要になる。役割: 導入。原作対応: 完璧な静けさ、「家が近いから」。',
    },
    {
      n: '第二段階「観測」',
      form: 1,
      len: 28,
      level: 1,
      actions: [
        open('#a98cff', 1.0),
        { at: 1.4, every: 3.2, until: 22.0, do: (S) => P.staringEyes(S, { n: 5, speed: 60, radius: 64, type: 'eye', color: 'ghost', r: 7, life: 10 }) },
        { at: 4.0, every: 4.6, until: 23.0, charge: 0.6, do: (S) => P.holdAndTurn(S, { n: 10, speed: 106, hold: 0.95, turnDeg: 90, type: 'arrow', color: 'violet', r: 5, life: 10 }) },
        { at: 8.4, every: 5.8, until: 23.0, do: (S) => P.interferenceSpiral(S, { count: 4, speed: 64, stepDeg: 30, arms: 3, type: 'orb', r: 5, life: 10, colorA: 'violet', colorB: 'white' }) },
        { at: 13.4, every: 6.8, until: 24.0, charge: 0.7, do: (S) => P.homingPursuit(S, { n: 4, speed: 50, homingRate: rad(38), homingTime: 1.8, type: 'orb', color: 'ice', r: 5.6, life: 9, spread: rad(48) }) },
        { at: 24.4, do: (S) => P.phaseTelegraph(S, { color: '#a98cff', strength: 0.9 }) },
      ],
      design: '発射位置=ボスの額/両手。弾速50〜106。視線が常時5つ漂い、干渉螺旋が2色で回る。「観測されている」感覚を作るのが目的で、弾数は多くない。回避ルート: 螺旋は3本腕で回転が遅いので、腕の間に入って回れば安全。役割: 展開。原作対応: 好意は観測された瞬間に確定する。',
    },
    {
      n: '第三段階「重ね合わせ」',
      form: 2,
      len: 30,
      level: 2,
      cam: 'pseudo3d',           // ← ここだけ擬似3D
      actions: [
        open('#e0d4ff', 1.1),
        { at: 2.0, every: 2.8, until: 24.0, do: (S) => P.tunnel3D(S, { n: 15, speed: 126, radius: 90, type: 'orb', color: 'ice', r: 6, life: 13 }) },
        { at: 5.2, every: 6.0, until: 25.0, do: (S) => P.spiral3D(S, { count: 4, speed: 128, arms: 3, radius: 100, radiusStep: 12, type: 'shard', color: 'white', r: 5.2, life: 13 }) },
        { at: 10.4, every: 7.0, until: 25.0, charge: 0.8, do: (S) => P.flower3D(S, { n: 22, speed: 108, radius: 160, type: 'orbBig', color: 'ghost', r: 8, life: 13, ringCount: 3 }) },
        { at: 16.6, every: 8.0, until: 26.0, telegraph: true, charge: 1.0, do: (S) => P.rotatingLasers3D(S, { count: 3, width: 14, spinDeg: 16, fireTime: 2.6, color: '#e0d4ff', warnTime: 1.15 }) },
        { at: 26.6, do: (S) => P.phaseTelegraph(S, { color: '#e0d4ff', strength: 1.0 }) },
      ],
      design: '発射位置=消失点。弾速108〜128。重ね合わせ = 複数の層が同時に存在する画面。トンネルと花が奥で重なり、手前の空間だけが動ける場所。回転レーザーは奥の消失点を軸に回る。回避ルート: 画面前方(下)は常に空いている。役割: 山場。原作対応: 波動関数の重ね合わせ。',
    },
    {
      n: '第四段階「崩壊」',
      form: 3,
      len: 30,
      level: 3,
      actions: [
        open('#ffffff', 1.2),
        { at: 1.6, every: 4.4, until: 24.0, do: (S) => P.inwardConverge(S, { n: 18, radius: 340, speed: 84, type: 'orb', color: 'indigo', r: 5.2, life: 9 }) },
        { at: 3.2, every: 3.4, until: 25.0, do: (S) => P.crossRing(S, { n: 12, speed: 70, offsetStep: 15, arms: 2, type: 'cross', color: 'blood', r: 5.4, life: 11 }) },
        { at: 7.0, every: 5.4, until: 25.0, do: (S) => P.mirrorBullets(S, { n: 8, speed: 94, type: 'orb', color: 'jade', r: 5.4, life: 12, bounce: 3 }) },
        { at: 12.0, every: 6.2, until: 26.0, telegraph: true, charge: 0.9, do: (S) => P.rotatingLasers(S, { count: 4, width: 12, spinDeg: -20, fireTime: 2.4, color: '#ffffff', warnTime: 1.05 }) },
        { at: 17.0, every: 7.0, until: 27.0, charge: 0.9, do: (S) => P.finaleBarrage(S, { n: 30, speed: 40, type: 'orb', color: 'white', r: 5.5, offsetStep: 6, life: 12, layers: 2 }) },
        { at: 27.6, do: (S) => P.phaseTelegraph(S, { color: '#ffffff', strength: 1.2 }) },
      ],
      design: '発射位置=全周とボス中心。弾速40〜94。収束(中心危険) + ✝リング(外周危険) + 反射(端で跳ねる)の三重拘束。ここが本作で最も密度が高いが、弾速は全て100以下。回避ルート: 半径100〜160を維持し、レーザー発火時だけ横へ抜ける。役割: 山場〜締め。原作対応: 観測による収束(崩壊)。',
    },
    {
      n: '最終段階「最後まで残ったのは、あなただけ」',
      form: 4,
      len: 32,
      level: 3,
      actions: [
        open('#ffffff', 1.3),
        { at: 1.8, every: 4.0, until: 26.0, do: (S) => P.finaleBarrage(S, { n: 32, speed: 38, type: 'orb', color: 'white', r: 5.5, offsetStep: 5, life: 13, layers: 3 }) },
        { at: 3.0, every: 5.0, until: 26.0, do: (S) => P.flowerSafe(S, { n: 24, speed: 52, stagger: 0.9, type: 'orbBig', color: 'ghost', r: 9, life: 12 }) },
        { at: 6.0, every: 3.2, until: 27.0, do: (S) => P.spinRingBurst(S, { n: 17, speed: 58, offsetStep: 11, type: 'ring', color: 'ice', r: 5, life: 11, arms: 2 }) },
        { at: 10.0, every: 5.6, until: 27.0, charge: 0.7, do: (S) => P.aimedVolley(S, { n: 7, speed: 96, spread: rad(42), gap: rad(15), type: 'kunai', color: 'violet', r: 5, life: 9 }) },
        { at: 15.0, every: 6.4, until: 28.0, telegraph: true, charge: 1.0, do: (S) => P.rotatingLasers(S, { count: 6, width: 12, spinDeg: 14, fireTime: 2.6, color: '#ffffff', warnTime: 1.2 }) },
        { at: 21.0, every: 8.0, until: 29.0, charge: 0.9, do: (S) => P.homingPursuit(S, { n: 5, speed: 48, homingRate: rad(30), homingTime: 1.6, type: 'orb', color: 'ghost', r: 5.6, life: 9, spread: rad(56) }) },
        { at: 30.6, do: (S) => P.phaseClimax(S, { color: '#ffffff' }) },
      ],
      design: '発射位置=全周 / 消失点 / ボス。弾速38〜96。本作の総まとめ: 濃密だが遅いフィナーレ(3層)、中心安全の花、回転リング、狙い撃ち、6本の回転レーザー、低速追尾。すべて既出の語彙なので「知っている動き」で切り抜けられる。回避ルート: 花の中心と外周を往復するのが最も安定。役割: 締め。原作対応: 「最後まで残ったのは、あなただけです」= 観測者の存在。',
    },
  ],
  outro: {
    title: '最終幕 終了',
    lines: [
      { who: 'rei', text: '「観測、されました」' },
      { who: 'ryoma', text: '「……✝本質✝って、そういうことか」' },
      { who: 'terachi', text: '「ね、ずっとやってるんだよ」' },
    ],
  },
};

export const STAGES = [STAGE1, STAGE2, STAGE3, STAGE4];

/** 全フェーズ数 (HUD の通し表示とドキュメント用) */
export const TOTAL_PHASES = STAGES.reduce((a, s) => a + s.phases.length, 0);

export default STAGES;
