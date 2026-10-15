/* =============================================================================
 * src/game/stages.js — ステージ／フェーズ構成
 *
 *  【構成の考え方】
 *  原作小説は「何も劇的なことは起きなかった」一年間を描く。したがって
 *  ステージは戦闘ではなく「授業」「配信」「掲示板」という"時間"であり、
 *  フェーズはその時間の区切りである。プレイヤーは各フェーズを
 *  「耐える」＝「その時間を過ごす」ことで先へ進む。
 *
 *  各フェーズには必ず以下を定義する:
 *    ・名称（右上に出す）       ・原作の引用（フェーズ開始時に一瞬だけ出る）
 *    ・制限時間                 ・弾幕パターンの重ね方と切り替え
 *    ・ボスの移動軌道           ・BGM 強度（＝レイヤーの重なり）
 *    ・背景の状態
 *
 *  難易度による差:
 *    ・EASY は 3 フェーズ、NORMAL / HARD は 4 フェーズ（最終フェーズは追加の試練）
 *    ・密度・弾速・間隔・追尾・安全地帯は difficulty.js が係数で制御する
 * ========================================================================== */
'use strict';

/**
 * フェーズ定義の記法
 *  layers: [{p:'パターン名', at:開始秒, until:終了秒|null}, ...]
 *    → 複数重ねることで「高密度だが役割の違う弾が混ざる」状態を作る
 */
const STAGES = [
  /* ======================================================================
   * STAGE 1 — 序「南棟と北棟」
   * 原作: 序章。見えない国境。偏差値七十と六十。ネクタイの色。
   * ==================================================================== */
  {
    id: 1, key: 'stage1',
    title: '南棟と北棟', subtitle: '序 — 桐葉高校という二重構造',
    song: 'stage1', songBoss: 'boss',
    bg: 'geometric',
    theme: ['#16275e', '#30509f', '#6b8ce0', '#6b8ce0'],
    themeSub: ['#5c1226', '#a82244', '#e05575', '#e05575'],
    accent: '#f2e8cd',
    lumi: 0xd0dae8,
    boss: 'mie',
    bossHomeY: 0.25,
    bossMoveMul: 1.0,
    intro: [
      { who: 'narr', text: '桐葉高校には国境がある。', dur: 3.4 },
      { who: 'narr', text: '見えないが、ある。', dur: 3.0 },
      { who: 'satou', text: '……コーンスープ、また補充されてない', dur: 3.6 },
      { who: 'mie', text: '北棟の自販機だろ。関係ない', dur: 3.2 },
      { who: 'narr', text: '南棟。中高一貫コース。偏差値七十。\n北棟。理数科。偏差値六十。', dur: 4.2 },
      { who: 'ryoma', text: 'これまじ✝本質✝', dur: 2.8 },
    ],
    phases: [
      {
        id: 'p1', name: '区分け', duration: 24,
        quote: '「あいつ理数科でしょ」という言い方は、「あいつ隣のクラスでしょ」と同じトーンで発される。',
        move: 'sway', intensity: 0.10, bgState: 0.0,
        layers: [
          { p: 'ringsNavy', at: 0.5, until: null },
          { p: 'rainRice', at: 6.0, until: null },
        ],
      },
      {
        id: 'p2', name: '見えない壁', duration: 26,
        quote: 'この「十」が、ネクタイの色の差と重なって、見えない壁を作っている。',
        move: 'lissajous', intensity: 0.42, bgState: 0.35,
        layers: [
          { p: 'symmetryTies', at: 0, until: null },
          { p: 'laserBoundary', at: 5.0, until: null },
        ],
      },
      {
        id: 'p3', name: 'まあ', duration: 28,
        quote: '三重は「まあ」を二回言うとき、内心では面白いと思っている。\nこれは三重の冷笑システムの隙間であり、伊崎はそこを正確に突いている。',
        move: 'figure8', intensity: 0.70, bgState: 0.6,
        layers: [
          { p: 'convergeSpread', at: 0, until: null },
          { p: 'halfStep', at: 3.0, until: null },
        ],
        midEvent: { at: 14, kind: 'bossSay', text: '……まあ' },
      },
      {
        id: 'p4', name: 'は？', duration: 26, tier: 'extra',
        quote: '三重県臣は学期中に推定二十回は「は？」と言っている。',
        move: 'approach', intensity: 1.0, bgState: 0.85,
        // 「重ねる」のではなく「順に呼び出す」構成にする。
        // 同時 3 枚重ねは山場ではなく単なる圧になり、読みづらく不公平になる。
        // 前半で追尾＋輪を重ね、後半は密度（最も遅く最も多い）だけにする。
        // 輪は前半だけ。追尾と輪を最後まで重ねると、逃げ道が「輪の内側」に
        // 限定されたところへ追尾弾が入ってきて、避けようのない詰みが生まれる
        // （実測: 生存 5/8 → 輪を 10 秒で止めて 10/10）。
        layers: [
          { p: 'chaserMie', at: 0, until: 17 },
          { p: 'ringsNavy', at: 0, until: 10, ivMul: 1.7 },
          { p: 'finaleDense', at: 17, until: null },
        ],
      },
    ],
  },

  /* ======================================================================
   * STAGE 2 — 第二章「火曜三限、味噌の地政学」
   * 原作: 塀勝也の地理の授業。糸魚川-静岡構造線。味噌の分布。河岸段丘。
   * ==================================================================== */
  {
    id: 2, key: 'stage2',
    title: '火曜三限、味噌の地政学', subtitle: '第二章 — 朝飯が何億年前の地面で決まってる',
    song: 'stage2', songBoss: 'boss',
    bg: 'boundary',
    theme: ['#66301a', '#b1592c', '#e29b64', '#e29b64'],
    themeSub: ['#2a261c', '#b3a583', '#f2e8cd', '#f2e8cd'],
    accent: '#2a9dae',
    lumi: 0xe0c8a8,
    boss: 'katsuya',
    bossHomeY: 0.27,
    bossMoveMul: 0.9,
    intro: [
      { who: 'narr', text: '火曜三限。地理。理数科B組にとって、地理は「時間割にある」科目だ。', dur: 5.0 },
      { who: 'katsuya', text: '糸魚川-静岡構造線。聞いたことあるか', dur: 3.6 },
      { who: 'katsuya', text: 'ここを境に日本列島の地質が変わる。\n石が違うと土壌が違う。土壌が違うと作物が違う。', dur: 5.4 },
      { who: 'katsuya', text: '味噌が違う', dur: 2.6 },
      { who: 'ryoma', text: 'まじ？', dur: 2.0 },
      { who: 'katsuya', text: 'まじだ', dur: 2.0 },
      { who: 'izaki', text: '朝飯が何億年前の地面で決まってるって、冷静に考えるとやばくないか', dur: 5.0 },
    ],
    phases: [
      {
        id: 'p1', name: '構造線', duration: 24,
        quote: 'ここを境に日本列島の地質が変わる。',
        move: 'center', intensity: 0.12, bgState: 0.05,
        layers: [
          { p: 'laserBoundary', at: 1.0, until: null },
          { p: 'rainRice', at: 4.0, until: null },
        ],
      },
      {
        id: 'p2', name: '味噌の境界', duration: 26,
        quote: '味噌の分布が地質境界線と重なってる。\nお前らが今朝飲んだ味噌汁は、地殻変動が決めてる。',
        move: 'sway', intensity: 0.45, bgState: 0.3,
        layers: [
          { p: 'wallMiso', at: 0, until: null },
          { p: 'symmetryTies', at: 4.0, until: null },
        ],
      },
      {
        id: 'p3', name: '河岸段丘', duration: 28,
        quote: 'まず、今お前らが立ってる地面がここだ。その下にもう一段ある。\nもう一段古い地面。時間を掘ってると思ってくれ。',
        move: 'lissajous', intensity: 0.72, bgState: 0.58,
        layers: [
          { p: 'terraceStairs', at: 0, until: 16 },
          { p: 'contourWaves', at: 4.0, until: null },
          { p: 'terraceStairs', at: 17, until: null },
        ],
        midEvent: { at: 15, kind: 'bossSay', text: '今を起点にすると、地面って時間の積み重ねなんだ' },
      },
      {
        id: 'p4', name: '上から描く', duration: 26, tier: 'extra',
        quote: '普通の教師は下の層から描く。古い方から新しい方に。\n勝也は逆だ。上から描く。今の地表から始めて、過去に向かって掘り下げていく。',
        move: 'descend', intensity: 1.0, bgState: 0.9,
        layers: [
          { p: 'contourWaves', at: 0, until: null, ivMul: 0.8 },
          { p: 'turnTerrace', at: 2.0, until: null },
          { p: 'finaleDense', at: 13, until: null },
        ],
      },
    ],
  },

  /* ======================================================================
   * STAGE 3 — 第三章「✝本質✝が漏れ出す」
   * 原作: 倉石暁（狂信）、寺地の配信の拡散と炎上、切り抜き、グレートチェーン。
   * ==================================================================== */
  {
    id: 3, key: 'stage3',
    title: '✝本質✝が漏れ出す', subtitle: '第三章 — 広がった先で別のものになる',
    song: 'stage3', songBoss: 'boss',
    bg: 'contour',
    theme: ['#5c1226', '#a82244', '#e05575', '#e05575'],
    themeSub: ['#3a2c08', '#a5821f', '#f0cf6a', '#fffbe8'],
    accent: '#8fe8f2',
    lumi: 0xe8b0b8,
    boss: 'kuraishi',
    bossHomeY: 0.26,
    bossMoveMul: 1.1,
    intro: [
      { who: 'narr', text: '四月。理数科一年A組。四十人の新入生が、新しい教室の匂いを嗅いでいる。', dur: 5.0 },
      { who: 'kuraishi', text: 'これまじ✝本質✝', dur: 2.6 },
      { who: 'narr', text: '倉石のノートの表紙には、太いマジックペンで「✝」と書いてある。\n筆箱にも「✝」と書いてある。', dur: 5.6 },
      { who: 'kuraishi', text: '聖典です', dur: 2.4 },
      { who: 'mie', text: '信者きもい、ってコメント欄が言ってる', dur: 4.2 },
      { who: 'terachi', text: '切り抜きだけで十五万再生。本編は三千再生。', dur: 4.4 },
      { who: 'kuraishi', text: '✝本質✝は、私の理論を壊しに来たんですか', dur: 4.4 },
      { who: 'ryoma', text: '壊しに行ってない。✝本質✝は壊すために存在するんじゃなくて、あるから、あるだけだよ', dur: 6.0 },
    ],
    phases: [
      {
        id: 'p1', name: '聖典', duration: 24,
        quote: '制服のブレザーの裏地に、白い修正液で「✝本質✝」と書いてある。\n入学初日にこの装備で来る人間は、桐葉高校の歴史上おそらくいない。',
        move: 'float', intensity: 0.14, bgState: 0.1,
        layers: [
          { p: 'crossFlower', at: 0.5, until: null },
          { p: 'rainRice', at: 7.0, until: null },
        ],
      },
      {
        id: 'p2', name: '拡散', duration: 26,
        quote: '登録者が跳ねた。千四百人から一万人。一週間で。',
        move: 'figure8', intensity: 0.5, bgState: 0.4,
        layers: [
          { p: 'chainDelay', at: 0, until: null },
          { p: 'symmetryTies', at: 3.0, until: null },
          { p: 'sweepLaser', at: 12.0, until: null },
        ],
      },
      {
        id: 'p3', name: '炎上', duration: 28,
        quote: '「これ何が面白いの？」「宗教？　信者きもい」\n「学校特定したら面白くね？」',
        move: 'lissajous', intensity: 0.78, bgState: 0.65,
        layers: [
          { p: 'reflectArena', at: 0, until: null },
          { p: 'finaleDense', at: 5.0, until: null, denseMul: 0.85 },
        ],
        midEvent: { at: 15, kind: 'bossSay', text: '聖典です' },
      },
      {
        id: 'p4', name: 'グレートチェーン', duration: 26, tier: 'extra',
        quote: 'まとめサイトに、両馬の匿名掲示板が取り上げられた。\n「【永久保存版】三年間✝本質✝と書き続ける謎の高校生スレが面白すぎるwwwww」',
        move: 'approach', intensity: 1.0, bgState: 0.95,
        layers: [
          { p: 'honshitsuWall', at: 0, until: 16 },
          { p: 'crossFlower', at: 0, until: 16, ivMul: 1.5 },
          { p: 'finaleDense', at: 16, until: null },
        ],
      },
    ],
  },

  /* ======================================================================
   * STAGE 4 — 最終章「最後の地形図」
   * 原作: 勝也が三年間同じ地図を見せて待ったこと。零の「見えないけどある」。
   *       桜は同じ。何も解決しない。それでも来年がある。
   * ==================================================================== */
  {
    id: 4, key: 'stage4',
    title: '最後の地形図', subtitle: '最終章 — 見えないが、ある',
    song: 'stage4', songBoss: 'final',
    bg: 'contour',
    theme: ['#6b5320', '#c39a3c', '#f5df95', '#fffbe8'],
    themeSub: ['#0e4c59', '#2a9dae', '#8fe8f2', '#8fe8f2'],
    accent: '#ffffff',
    lumi: 0xf0e0b0,
    boss: 'honshitsu',
    bossHomeY: 0.25,
    bossMoveMul: 1.0,
    intro: [
      { who: 'katsuya', text: '三回目だ。同じ地図。一年目と同じに見えるか？', dur: 4.8 },
      { who: 'narr', text: '沈黙。だが一年目の沈黙とは違う。\n一年目は興味がなかった。三年目は答えを持っている。', dur: 6.2 },
      { who: 'satou', text: '先生。この等高線のここ、河岸段丘ですよね。', dur: 4.4 },
      { who: 'narr', text: '砂糖東洋。三年間ゲーム画面を見ていた男。\n地理の授業で一度も発言したことがない男。その男の手が上がった。', dur: 7.0 },
      { who: 'katsuya', text: '正解だ。全部正解だ', dur: 3.4 },
      { who: 'narr', text: 'それだけ言って、砂糖を三秒見た。何かを言いかけて、やめた。\nやめてから、目を窓の外に向けた。三秒。', dur: 6.4 },
      { who: 'katsuya', text: '……よかった', dur: 3.0 },
      { who: 'rei', text: '等高線の感覚。地形図って、実際の地面は見えないだろ。\nでも等高線を読むと地形が見える。✝本質✝も等高線みたいなもので、\n直接は見えないけど、何かのサインを読むと存在がわかる', dur: 9.0 },
    ],
    phases: [
      {
        id: 'p1', name: '同じ地図', duration: 26,
        quote: '同じ地図だ。一学期に見たのと同じ。等高線。川。集落。記号。\nでも、お前ら、一学期と同じに見えるか？',
        move: 'sway', intensity: 0.16, bgState: 0.1,
        layers: [
          { p: 'contourWaves', at: 1.0, until: null },
          { p: 'ringsNavy', at: 6.0, until: null },
        ],
      },
      {
        id: 'p2', name: '三年間', duration: 26,
        quote: 'ヘイカツはそれを待ってた。三年間同じ地図を出して、\n見る側が変わるのを待ってた。\n教育の✝本質✝がここにある。同じものを出して、待つ。',
        move: 'lissajous', intensity: 0.52, bgState: 0.42,
        layers: [
          { p: 'terraceStairs', at: 0, until: null },
          { p: 'convergeSpread', at: 4.0, until: null },
          { p: 'starfield', at: 13.0, until: null },
        ],
      },
      {
        id: 'p3', name: '待つ', duration: 28,
        quote: '「見えないけどある」って最近よく思うんだよ。\n……昼でも星はある。太陽が明るすぎて見えないだけ。',
        move: 'float', intensity: 0.8, bgState: 0.7,
        layers: [
          { p: 'safeCenterCaldera', at: 0, until: null },
          { p: 'starfield', at: 3.0, until: null },
          { p: 'laserBoundary', at: 12.0, until: null },
        ],
        midEvent: { at: 17, kind: 'bossSay', text: '今は少しは見えるか' },
      },
      {
        id: 'p4', name: '✝本質✝', duration: 30, tier: 'final',
        quote: 'わからないことが✝本質✝。\nでも、来年もある。それだけで十分だ。',
        move: 'approach', intensity: 1.0, bgState: 1.0,
        // 最終局面。これまで各章で見せた要素を「同時に全部」ではなく
        // 順に呼び出し、最後に最も多い「密度」だけを残す。
        layers: [
          { p: 'honshitsuWall', at: 0, until: 14 },
          { p: 'crossFlower', at: 1.0, until: 14 },
          { p: 'convergeSpread', at: 6.0, until: 17 },
          { p: 'starfield', at: 15, until: 23 },
          { p: 'finaleDense', at: 23, until: null },
        ],
      },
    ],
    finale: true,
  },
];

/** 難易度に応じたフェーズ一覧を返す */
function phasesFor(stage, dif) {
  const n = dif.phaseCount;
  const list = stage.phases;
  if (list.length <= n) return list.slice();
  // 「extra」と印の付いた追加フェーズを落とし、本文の流れは保つ
  const out = [];
  for (const ph of list) {
    if (ph.tier === 'extra' && out.length + 1 > n) continue;
    out.push(ph);
    if (out.length >= n) break;
  }
  return out;
}

/** ステージの総耐久時間（UI 表示用） */
function stageDuration(stage, dif) {
  return phasesFor(stage, dif).reduce((a, p) => a + p.duration, 0);
}

window.HN = window.HN || {};
Object.assign(window.HN, { STAGES, phasesFor, stageDuration });
