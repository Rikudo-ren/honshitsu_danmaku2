/**
 * dialogue.js — 会話 / カットイン
 *
 * 原作小説の場面を短い弾幕体験に圧縮するための「語り」の層。
 *
 * 表示の原則 (うそ防止のための仕様):
 *   ・原作から引用した台詞には必ず「原作」タグを出す
 *   ・本作のための台詞には「本作」タグを出す
 *   ・地の文 (ナレーション) は who を null にして、話者名を出さない
 *
 * 立ち絵は 立ち絵モチーフのピクセル化済み素材 (assets/px_hi) を使い、
 * 薄暗いグラデーションの上に重ねる。会話中は文字の可読性を最優先する。
 */
import { VIEW_W, VIEW_H, COLORS } from '../core/const.js';
import { drawText, wrapText, measureText } from '../render/text.js';
import { clamp, TAU } from '../core/util.js';
import { PORTRAITS as manifest } from '../game/portraits.js';
import { CHARACTERS } from '../game/characters.js';

/* ------------------------------------------------------------ 素材 ------ */

const PORTRAIT_CACHE = new Map();

function portraitUrl(key, size = 'px_hi') {
  const e = manifest[key];
  if (!e) return null;
  return (e[size] || e.px_hi || e.px).file;
}

function loadPortrait(key) {
  if (PORTRAIT_CACHE.has(key)) return PORTRAIT_CACHE.get(key);
  const url = portraitUrl(key);
  const rec = { img: null, ok: false };
  PORTRAIT_CACHE.set(key, rec);
  if (!url) return rec;
  const img = new Image();
  img.onload = () => { rec.ok = true; };
  img.src = url;
  rec.img = img;
  return rec;
}

/* ------------------------------------------------------------ 台本 ------ */

/**
 * ステージ導入 / 締めの会話。
 * v:true = 原作引用 (地の文で話者が明示されている行のみ) / v:false = 独自追加
 */
export const STAGE_DIALOGUE = {
  stage1: {
    title: '第一幕　✝本質✝、降下',
    intro: [
      { who: null, text: '桐葉高校。北棟。理数科 2年B組。偏差値六十。' },
      { who: null, text: '教室のどこかから、今日も ✝ が漏れ出している。' },
      { who: 'ryoma', text: '「✝は人類共通の記号だから」', v: true },
      { who: 'ryoma', text: '「わからないことが——」', v: true },
      { who: null, text: '——✝本質✝は、止まらない。' },
    ],
    outro: [
      { who: 'ryoma', text: '「嬉しいのが✝本質✝だよ」', v: true },
      { who: null, text: '第一幕、終了。教室はまだ、いつも通りだ。' },
    ],
  },
  stage2: {
    title: '第二幕　配信、視聴者、そして',
    intro: [
      { who: null, text: '〈星と地面とせいちちゃんねる〉。登録者、底辺。' },
      { who: 'terachi', text: '「寺地のチャンネルの名前を✝本質✝と一緒に出すな」', v: true },
      { who: 'terachi', text: '「宣伝になるだろ」', v: true },
      { who: null, text: '配信は続く。視聴者数は、まだ二桁だ。' },
    ],
    outro: [
      { who: 'terachi', text: '「——直接言いに来ないでください。怖いから」', v: true },
      { who: 'terachi', text: '「あれ、再生数、いつもより多い」', v: true },
    ],
  },
  stage3: {
    title: '第三幕　信徒、記録、断末魔',
    intro: [
      { who: null, text: '転入生、倉石暁。理数科 1年A組。' },
      { who: null, text: '中学のとき、あの配信を見て、この学校に入ることを決めた。' },
      { who: 'kuraishi', text: '「ファンじゃないです」', v: true },
      { who: 'kuraishi', text: '「信徒です」', v: true },
    ],
    outro: [
      { who: null, text: '記録は、消えない。消されるまで、消えない。' },
    ],
  },
  stage4: {
    title: '最終幕　観測',
    intro: [
      { who: null, text: '全科目学年首席。一位の欄に、毎回同じ名前が並ぶ。' },
      { who: null, text: 'なぜ理数科にいるのか。答えは誰も持っていない。' },
      { who: 'rei', text: '「家が近いから」', v: true },
      { who: 'rei', text: '「なんか、面白いな」', v: true },
      { who: null, text: '好意は観測されていない状態で重ね合わさっている。' },
      { who: null, text: '観測された瞬間に、確定する。' },
    ],
    outro: [
      { who: 'rei', text: '「観測、されました」', v: false },
      { who: null, text: '教室には、まだ ✝ が残っている。' },
    ],
  },
};

/* ------------------------------------------------------------ 本体 ------ */

export class DialogueBox {
  constructor() {
    this.active = false;
    this.mode = 'cutin';       // 'cutin' | 'box'
    this.lines = [];
    this.i = 0;
    this.reveal = 0;           // 文字送り
    this.t = 0;
    this.done = false;
    this.title = null;
    this.speaker = null;
    this.holdT = 0;
    this.onEnd = null;
  }

  /**
   * @param {Array}  lines [{who, text, v}]
   * @param {object} opt   { mode, title, onEnd, speakerName }
   */
  start(lines, opt = {}) {
    this.lines = lines || [];
    this.i = 0;
    this.reveal = 0;
    this.t = 0;
    this.active = this.lines.length > 0;
    this.done = !this.active;
    this.mode = opt.mode || 'cutin';
    this.title = opt.title || null;
    this.onEnd = opt.onEnd || null;
    this._bindSpeaker();
    for (const l of this.lines) if (l.who) loadPortrait(CHARACTERS[l.who]?.portrait || '');
  }

  _bindSpeaker() {
    const l = this.lines[this.i];
    this.speaker = l && l.who ? CHARACTERS[l.who] : null;
  }

  get cur() { return this.lines[this.i] || null; }

  /** 現在の行の全文字数 */
  get curLen() { return this.cur ? [...this.cur.text].length : 0; }

  get fullyRevealed() { return this.reveal >= this.curLen; }

  /** 入力: 文字送りの完了 or 次の行へ */
  advance() {
    if (!this.active) return;
    if (!this.fullyRevealed) { this.reveal = this.curLen; return; }
    this.i++;
    this.reveal = 0;
    if (this.i >= this.lines.length) {
      this.active = false;
      this.done = true;
      this.onEnd?.();
    } else {
      this._bindSpeaker();
    }
  }

  /** 行送りをすべて飛ばす */
  skipAll() {
    if (!this.active) return;
    this.i = this.lines.length;
    this.active = false;
    this.done = true;
    this.onEnd?.();
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.mode === 'box') this.holdT += dt;
    const cps = 34;
    if (!this.fullyRevealed) this.reveal = Math.min(this.curLen, this.reveal + cps * dt);
  }

  /* ---------------------------------------------------------- 描画 ----- */

  draw(ctx, t) {
    if (!this.active) return;
    const line = this.cur;
    if (!line) return;
    const shownChars = Math.floor(this.reveal);
    const text = [...line.text].slice(0, shownChars).join('');

    if (this.mode === 'cutin') this._drawCutin(ctx, line, text, t);
    else this._drawBox(ctx, line, text, t);
  }

  _drawCutin(ctx, line, text, t) {
    const appear = clamp(this.t / 0.28, 0, 1);
    const bare = (Math.sin(t * 5) * 0.5 + 0.5);

    // 背景を沈める (弾幕の上に文字を載せるため)
    ctx.save();
    ctx.fillStyle = 'rgba(4,3,10,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // 上下のシネマバー
    ctx.fillStyle = '#04030a';
    const bar = 34 + Math.round(bare * 0);
    ctx.fillRect(0, 0, VIEW_W, bar);
    ctx.fillRect(0, VIEW_H - bar, VIEW_W, bar);
    ctx.restore();

    // 立ち絵 (ピクセル化済み)。話者が居る行だけ出す。
    const ch = line.who ? CHARACTERS[line.who] : null;
    if (ch) {
      const rec = loadPortrait(ch.portrait);
      if (rec.ok && rec.img) {
        const h = 268;
        const w = Math.round(rec.img.naturalWidth * (h / rec.img.naturalHeight));
        const x = Math.round(VIEW_W - w - 26 + (1 - appear) * 18);
        const y = VIEW_H - bar - h + 6;
        ctx.save();
        ctx.globalAlpha = appear * 0.97;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(rec.img, x, y, w, h);
        // 色かぶせ (キャラ色)
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = ch.color;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
        // 足元を背景に溶かす
        ctx.save();
        ctx.globalAlpha = 0.85;
        const g = ctx.createLinearGradient(0, VIEW_H - bar - 40, 0, VIEW_H - bar + 4);
        g.addColorStop(0, 'rgba(4,3,10,0)');
        g.addColorStop(1, 'rgba(4,3,10,1)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 2, VIEW_H - bar - 40, w + 4, 44);
        ctx.restore();
      }
    }

    // 一番上の行: 幕タイトル
    if (this.title) {
      drawText(ctx, this.title, VIEW_W / 2, bar - 22, {
        size: 16, color: '#ffe9a8', align: 'center', outline: 1, glow: 6, glowColor: '#ffb066',
      });
    }

    // 本文 (左下寄せ)
    const tx = 26;
    const ty = VIEW_H - bar - 96;
    const lines = wrapText(ctx, text, 16, 300);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#05040c';
    ctx.fillRect(14, ty - 8, 340, 16 * lines.length + 22);
    ctx.restore();

    // 話者名
    if (line.who && this.speaker) {
      drawText(ctx, this.speaker.name, tx, ty - 22, {
        size: 16, color: this.speaker.color, outline: 1,
      });
      // 役割名は話者名の右隣に、名前の基線に揃えて置く (名前の下に重ねない)
      const nameW = measureText(ctx, this.speaker.name, 16);
      drawText(ctx, this.speaker.role, tx + nameW + 10, ty - 14, {
        size: 8, color: '#9c8fd0', outline: 1, alpha: 0.95,
      });
    }

    this._drawTag(ctx, line, tx + 320, ty - 22);

    lines.forEach((l, i) => {
      drawText(ctx, l, tx, ty + i * 16, { size: 16, color: COLORS.paper, outline: 1 });
    });

    // 続きを示す三角
    if (this.fullyRevealed) {
      const bx = VIEW_W / 2;
      const by = VIEW_H - bar - 14 + (bare > 0.5 ? 1 : 0);
      ctx.save();
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.moveTo(bx - 4, by - 3);
      ctx.lineTo(bx + 4, by - 3);
      ctx.lineTo(bx, by + 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  _drawBox(ctx, line, text, t) {
    const h = 86;
    const y = VIEW_H - h - 6;
    ctx.save();
    // パネル
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = '#0a0718';
    ctx.fillRect(6, y, VIEW_W - 12, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#4b3f78';
    ctx.lineWidth = 1;
    ctx.strokeRect(6.5, y + 0.5, VIEW_W - 13, h - 1);
    ctx.restore();

    const ch = line.who ? CHARACTERS[line.who] : null;
    let tx = 16;
    if (ch) {
      const rec = loadPortrait(ch.portrait);
      if (rec.ok && rec.img) {
        const bh = h - 12;
        const bw = Math.round(rec.img.naturalWidth * (bh / rec.img.naturalHeight));
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(rec.img, 12, y + 6, bw, bh);
        ctx.restore();
        tx = 16 + bw + 10;
      }
      drawText(ctx, ch.name, tx, y + 8, { size: 16, color: ch.color, outline: 1 });
      this._drawTag(ctx, line, tx, y + 26);
      tx += 0;
    } else {
      drawText(ctx, '——', tx, y + 8, { size: 16, color: '#6f66a8', outline: 0 });
      tx += 0;
    }

    const bodyX = ch ? tx : 16;
    const bodyY = ch ? y + 30 : y + 12;
    const wrapped = wrapText(ctx, text, 16, VIEW_W - bodyX - 18);
    wrapped.forEach((l, i) => {
      drawText(ctx, l, bodyX, bodyY + i * 17, { size: 16, color: COLORS.paper, outline: 1 });
    });

    if (this.fullyRevealed) {
      const bare = (Math.sin(t * 6) * 0.5 + 0.5);
      drawText(ctx, 'Z / Enter で進む', VIEW_W - 16, y + h - 12, {
        size: 8, color: '#8b80b8', align: 'right', outline: 1, alpha: 0.6 + bare * 0.4,
      });
    }
  }

  /** 「原作」/「本作」タグ — 引用と独自追加を取り違えないための表示 */
  _drawTag(ctx, line, x, y) {
    if (line.who == null) {
      drawText(ctx, '地の文', x, y, { size: 8, color: '#7f76a8', outline: 1, alpha: 0.9 });
      return;
    }
    if (line.v === true) drawText(ctx, '原作', x, y, { size: 8, color: '#7ce0a0', outline: 1 });
    else if (line.v === false) drawText(ctx, '本作', x, y, { size: 8, color: '#ffd77a', outline: 1 });
  }
}

/** フェーズ開始時の小さな掛け合い (右下に吹き出し) */
export class SpeechBubble {
  constructor() {
    this.text = '';
    this.t = 0;
    this.life = 0;
    this.who = null;
    this.v = null;
  }

  say(text, who = null, { life = 2.6, v = null } = {}) {
    this.text = text;
    this.who = who ? CHARACTERS[who] : null;
    this.t = 0;
    this.life = life;
    this.v = v;
  }

  update(dt) { if (this.life > 0) this.t += dt; }

  get active() { return this.t < this.life && this.text; }

  draw(ctx) {
    if (!this.active) return;
    const a = clamp(Math.min(this.t / 0.2, (this.life - this.t) / 0.3), 0, 1);
    const lines = wrapText(ctx, this.text, 8, 210);
    const h = 10 + lines.length * 11;
    const w = 226;
    const x = VIEW_W - w - 8;
    const y = VIEW_H - 96 - h;
    ctx.save();
    ctx.globalAlpha = 0.8 * a;
    ctx.fillStyle = '#0a0718';
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = a;
    ctx.strokeStyle = this.who ? this.who.color : '#4b3f78';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
    const nameX = x + 6;
    lines.forEach((l, i) => {
      drawText(ctx, l, nameX, y + 6 + i * 11, { size: 8, color: COLORS.paper, outline: 1, alpha: a });
    });
    if (this.who) {
      drawText(ctx, this.who.name, x + w - 6, y - 9, {
        size: 8, color: this.who.color, align: 'right', outline: 1, alpha: a,
      });
    }
    if (this.v === true) drawText(ctx, '原作', x + 6, y + h + 1, { size: 8, color: '#7ce0a0', outline: 1, alpha: a });
    else if (this.v === false) drawText(ctx, '本作', x + 6, y + h + 1, { size: 8, color: '#ffd77a', outline: 1, alpha: a });
  }
}

export default DialogueBox;
