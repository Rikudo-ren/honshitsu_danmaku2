/**
 * characters.js — 登場人物の定義
 *
 * 原作小説「偏差値60の教室から✝本質✝が漏れ出している件について」の
 * キャラクター設定と、本作での表現方針をまとめる。
 *
 * 表現方針 (プロンプトの 4 分類):
 *   ① 立ち絵をそのまま活用   → 会話・イベント・カットイン (assets/px と px_hi)
 *   ② 立ち絵をモチーフに翻案 → ボス本体 (assets/px/boss のドット絵化)
 *   ③ 外部アセットへ統合     → 本作では外部スプライトを取得できないため未使用
 *   ④ 立ち絵から着想した独自表現 → 弾幕の形・色彩・ボス周囲の機構パーツ
 *
 * forms の並びは「通常 → 感情の高まり → 限界」の順。フェーズが進むと
 * 原作立ち絵の表情が切り替わり、それが物語の進行そのものになる。
 */

export const CHARACTERS = {
  ryoma: {
    key: 'ryoma',
    name: '両馬 二郎',
    kana: 'りょうま じろう',
    role: '✝本質✝の発生源',
    affiliation: '理数科 2年B組',
    color: '#ffab4a',
    colorDark: '#5e2d05',
    accent: '#ffe9a8',
    /** ボス本体に使う立ち絵 (フェーズ順) */
    forms: [
      'chr_ryoma_02_niyari',
      'chr_ryoma_01_tsuujou',
      'chr_ryoma_09_goukyuu',
      'chr_ryoma_06_nakiwarai',
    ],
    /** 会話・イベント用 (プラスチックな原作の印象をそのまま残す) */
    portrait: 'chr_ryoma_01_tsuujou',
    expression: {
      tsuujou: 'chr_ryoma_01_tsuujou',
      niyari: 'chr_ryoma_02_niyari',
      magao: 'chr_ryoma_04_kyuu_magao',
      shonbori: 'chr_ryoma_05_shonbori',
      nakiwarai: 'chr_ryoma_06_nakiwarai',
      ketsui: 'chr_ryoma_07_shinken_ketsui',
      tere: 'chr_ryoma_08_terekakushi',
      goukyuu: 'chr_ryoma_09_goukyuu',
    },
    /** 弾幕のモチーフ */
    motif: {
      bullets: ['rice', 'kunai', 'cross', 'orb'],
      colors: ['ember', 'gold', 'orange', 'coffee'],
      theme: '降ってくるもの / 反復 / 掲示板の羅列 / ✝',
    },
    /**
     * 台詞。v:true の行は原作小説からの引用で、地の文で話者が明示されている
     * 行だけを採用した。v:false の行は本作のための独自追加。両者はゲーム内でも
     * 区別して表示する (原作引用 / 独自追加)。
     */
    quotes: {
      enter: [
        { t: '「✝は人類共通の記号だから」', v: true },
        { t: '「わからないことが——」', v: true },
      ],
      phase: [
        { t: '「✝本質✝に教祖はいないよ。✝本質✝は誰のものでもない。俺が始めたわけでもない。✝本質✝は元からあった。俺はそれに✝✝をつけただけだ」', v: true },
        { t: '「すげえ」', v: true },
        { t: '「まじ？」', v: true },
      ],
      clear: [
        { t: '「嬉しいのが✝本質✝だよ」', v: true },
        { t: '「✝本質✝は、まだ教室にいる」', v: false },
      ],
    },
  },

  terachi: {
    key: 'terachi',
    name: '寺地 星',
    kana: 'てらち せい',
    role: '底辺 YouTuber',
    affiliation: '理数科 2年B組',
    color: '#6fc7ff',
    colorDark: '#0f2f52',
    accent: '#d8f6ff',
    forms: [
      'chr_terachi_01_nemusou',
      'chr_terachi_06_maiku_no_ketsui',
      'chr_terachi_03_haishin_shinken',
      'chr_terachi_08_namida',
    ],
    portrait: 'chr_terachi_01_nemusou',
    expression: {
      nemusou: 'chr_terachi_01_nemusou',
      konwaku: 'chr_terachi_02_konwaku_katamaru',
      haishin: 'chr_terachi_03_haishin_shinken',
      ureshii: 'chr_terachi_04_ureshii',
      maiku: 'chr_terachi_06_maiku_no_ketsui',
      namida: 'chr_terachi_08_namida',
    },
    motif: {
      bullets: ['star4', 'star6', 'star8', 'orb'],
      colors: ['blue', 'ice', 'indigo', 'white'],
      theme: '星空 / 地質 / 再生回数五十回 / 届かない光',
    },
    quotes: {
      enter: [
        { t: '「星と地面とせいちちゃんねる、はじまりまーす」', v: false },
        { t: '「寺地のチャンネルの名前を✝本質✝と一緒に出すな」', v: true },
      ],
      phase: [
        { t: '「あの……〈✝本質✝の巫女〉って……俺は巫女じゃないです。男だし。聖典でもないです。机の引き出しに紙束入れてるだけです」', v: true },
        { t: '「明らかに両馬だ」', v: true },
        { t: '「避けられてますね。じゃあ、もっと置きます」', v: false },
      ],
      clear: [
        { t: '「——直接言いに来ないでください。怖いから」', v: true },
        { t: '「あれ、再生数、いつもより多い」', v: false, note: '翻案 (原作に同文なし。意図を要約)' },
      ],
    },
  },

  kuraishi: {
    key: 'kuraishi',
    name: '倉石 暁',
    kana: 'くらいし あきら',
    role: '✝本質✝の信徒 (自称)',
    affiliation: '理数科 1年A組',
    color: '#ff5470',
    colorDark: '#3a0510',
    accent: '#ffc2cd',
    forms: [
      'chr_kuraishi_03_chousa_shinken',
      'chr_kuraishi_01_nekkyou',
      'chr_kuraishi_02_kangeki',
      'chr_kuraishi_05_hokorashige',
      'chr_kuraishi_06_kotoba_ushinau',
    ],
    portrait: 'chr_kuraishi_01_nekkyou',
    expression: {
      nekkyou: 'chr_kuraishi_01_nekkyou',
      kangeki: 'chr_kuraishi_02_kangeki',
      chousa: 'chr_kuraishi_03_chousa_shinken',
      hokorashige: 'chr_kuraishi_05_hokorashige',
      kotoba: 'chr_kuraishi_06_kotoba_ushinau',
    },
    motif: {
      bullets: ['cross', 'eye', 'ring', 'shard'],
      colors: ['blood', 'red', 'magenta', 'shadow'],
      theme: '反復 / 記録 / 信徒 / 断末魔のコピー',
    },
    quotes: {
      enter: [
        { t: '「教祖に会えた」', v: true },
        { t: '「ファンじゃないです」', v: true },
        { t: '「信徒です」', v: true },
      ],
      phase: [
        { t: '「倉石暁、再投稿します。寺地先輩。あなたは✝本質✝の巫女です。」', v: true },
        { t: '「僕は信徒です。教祖とは違います」', v: true },
        { t: '「書きます。書きましょうか」', v: false },
      ],
      clear: [
        { t: '「記録、全部読みました」', v: false },
      ],
    },
  },

  rei: {
    key: 'rei',
    name: '數理 零',
    kana: 'かずさと れい',
    role: '全科目学年首席',
    affiliation: '理数科 1年B組 / 偏差値八十五',
    color: '#cbb8ff',
    colorDark: '#241a45',
    accent: '#ffffff',
    forms: [
      'chr_rei_01_suzushii',
      'chr_rei_05_data_shinken',
      'chr_rei_07_kotoba_erabu',
      'chr_rei_04_odoroki',
      'chr_rei_02_hohoemi',
    ],
    portrait: 'chr_rei_01_suzushii',
    expression: {
      suzushii: 'chr_rei_01_suzushii',
      hohoemi: 'chr_rei_02_hohoemi',
      odoroki: 'chr_rei_04_odoroki',
      data: 'chr_rei_05_data_shinken',
      kotoba: 'chr_rei_07_kotoba_erabu',
    },
    /** 最終ボスは「立ち絵から着想を得た独自表現」を最も強く出す */
    motif: {
      bullets: ['orbBig', 'orb', 'eye', 'ring', 'cross', 'shard'],
      colors: ['white', 'ghost', 'indigo', 'violet', 'ash', 'ice'],
      theme: '観測 / 重ね合わせ / 波動関数の崩壊 / 完璧な静けさ / 家が近い',
    },
    quotes: {
      enter: [
        { t: '「家が近いから」', v: true },
        { t: '「なんか、面白いな」', v: true },
      ],
      phase: [
        { t: '「変だけど、面白い」', v: true },
        { t: '「半減」', v: true },
        { t: '「避けられてますね。じゃあ、もっと置きます」', v: false },
      ],
      clear: [
        { t: '「観測、されました」', v: false },
        { t: '「最後まで残ったのは、あなただけです」', v: false },
      ],
    },
  },
};

/** 掛け合い会話 (原作の関係性をそのまま使う場面) */
export const DIALOGUES = {};
