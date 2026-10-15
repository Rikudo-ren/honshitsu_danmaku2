/* =============================================================================
 * src/ui/screens.js — タイトル / 難易度選択 / 練習 / 記録 / 用語集 / クレジット
 *
 *  【方針】UI は最小限。原作の空気（静けさ・記号・余白）を保つため、
 *  装飾より文字と ✝ の動きで見せる。
 *  すべて 640×480 の論理解像度で描き、game.js が拡大表示する。
 * ========================================================================== */
'use strict';

const Screens = {
  /* =========================================================== 管理 ==== */
  idx: 0,
  sub: 0,
  scroll: 0,
  t: 0,
  cursor: { x: 320, y: 300 },
  message: null,
  messageT: 0,
  confirmQuit: false,

  reset(stack = ['title']) {
    this.stack = stack;
    this.idx = 0; this.sub = 0; this.scroll = 0;
    this.message = null;
  },

  cur() { return this.stack[this.stack.length - 1]; },
  push(s) { this.stack.push(s); this.idx = 0; this.scroll = 0; window.HN.audio.sfx('ui_ok'); },
  pop() { if (this.stack.length > 1) { this.stack.pop(); this.idx = 0; this.scroll = 0; window.HN.audio.sfx('ui_back'); } },
  toast(m) { this.message = m; this.messageT = 1.4; },

  /** 各画面の選択肢 */
  items(G) {
    const S = window.HN;
    switch (this.cur()) {
      case 'title': {
        const list = [
          { label: 'はじめる', act: () => this.push('diff') },
          { label: '練習', act: () => this.push('practice') },
          { label: '用語集', act: () => this.push('archive') },
          { label: '操作', act: () => this.push('help') },
          { label: '記録', act: () => this.push('records') },
          { label: '設定', act: () => this.push('options') },
          { label: 'クレジット', act: () => this.push('credits') },
        ];
        return list;
      }
      case 'diff':
        return S.DIFF_ORDER.map(k => ({
          label: `${S.DIFFICULTY[k].label} — ${S.DIFFICULTY[k].jp}`,
          sub: S.DIFFICULTY[k].sub,
          color: S.DIFFICULTY[k].color,
          act: () => { G.difKey = k; this.push('stage'); },
        }));
      case 'stage': {
        const out = [];
        const unlocked = G.save.unlocked;
        for (let i = 0; i < S.STAGES.length; i++) {
          const st = S.STAGES[i];
          const ok = i < unlocked;
          out.push({
            label: ok ? `第${i + 1}章　${st.title}` : `第${i + 1}章　？？？`,
            sub: ok ? st.subtitle : '前の章をクリアすると開放されます',
            color: ok ? '#e8ecf7' : '#5a6480',
            act: ok ? () => {
              if (!G.save.seenTutorial) { this.reset(['tutorial']); G.pendingRun = [G.difKey, i, 'story']; return; }
              G.game.startRun(G.difKey, i, 'story');
            } : null,
          });
        }
        return out;
      }
      case 'practice': {
        const out = [];
        for (let i = 0; i < S.STAGES.length; i++) {
          const st = S.STAGES[i];
          for (let p = 0; p < st.phases.length; p++) {
            const ph = st.phases[p];
            out.push({
              label: `第${i + 1}章 P${p + 1}　${ph.name}`,
              sub: `${Math.round(ph.duration)}秒　${st.title}`,
              act: () => G.game.startRun(G.difKey, i, 'practice', p),
            });
          }
        }
        return out;
      }
      case 'options':
        return [
          {
            label: '音量（全体）', bar: () => G.opt.masterVol,
            act: (dir) => { G.opt.masterVol = clamp01(G.opt.masterVol + dir * 0.1); G.writeOpt(); },
          },
          {
            label: '音量（音楽）', bar: () => G.opt.musicVol,
            act: (dir) => { G.opt.musicVol = clamp01(G.opt.musicVol + dir * 0.1); G.writeOpt(); this.previewMusic(); },
          },
          {
            label: '音量（効果音）', bar: () => G.opt.sfxVol,
            act: (dir) => { G.opt.sfxVol = clamp01(G.opt.sfxVol + dir * 0.1); G.writeOpt(); window.HN.audio.sfx('ui_ok'); },
          },
          { label: 'ミュート', toggle: () => G.opt.muted, act: () => { G.opt.muted = !G.opt.muted; G.writeOpt(); } },
          { label: '走査線', toggle: () => G.opt.scanlines, act: () => { G.opt.scanlines = !G.opt.scanlines; G.writeOpt(); } },
          { label: '環境エフェクト', toggle: () => G.opt.ambient, act: () => { G.opt.ambient = !G.opt.ambient; G.writeOpt(); } },
          { label: '全画面（F）', act: () => window.HN.Fullscreen.toggle() },
          { label: '記録を消す', act: () => { this.confirmQuit = true; this.toast('Enter でもう一度押すと記録を消します'); } },
          { label: 'もどる', act: () => this.pop() },
        ];
      case 'tutorial':
        return [{ label: 'はじめる', act: () => { if (G.pendingRun) { G.game.startRun(...G.pendingRun); G.pendingRun = null; } } }];
      case 'help':
      case 'archive':
      case 'records':
      case 'credits':
        return [{ label: 'もどる', act: () => this.pop() }];
    }
    return [{ label: 'もどる', act: () => this.pop() }];
  },

  previewMusic() {
    const A = window.HN.audio;
    if (!A.ready) return;
    A.resume();
    if (!A.song || A.song.key !== 'menu') A.playSong('menu', { intensity: 0.3 });
  },

  /* =========================================================== 更新 ==== */
  update(dt, I, G) {
    this.t += dt;
    if (this.messageT > 0) this.messageT -= dt;
    if (!this.stack) this.reset(['title']);
    const st = this.cur();
    const items = this.items(G);

    // 決定
    if (I.hit('confirm')) {
      const it = items[this.idx];
      if (it && it.act) { it.act(1); }
      else if (it) window.HN.audio.sfx('ui_back');
      return;
    }
    // キャンセル
    if (I.hit('cancel') || I.hit('esc')) {
      if (st === 'title') { this.toast('タイトル画面です'); return; }
      if (st === 'options' && this.confirmQuit) { this.confirmQuit = false; this.toast('解除しました'); return; }
      this.pop();
      return;
    }
    // 上下
    if (I.hit('up')) { if (this.idx > 0) { this.idx--; window.HN.audio.sfx('ui_move'); } }
    if (I.hit('down')) { if (this.idx < items.length - 1) { this.idx++; window.HN.audio.sfx('ui_move'); } }
    // 左右（スライダー・トグル）
    const it = items[this.idx];
    if (it && (it.bar || it.toggle)) {
      if (I.hit('left')) it.act(-1);
      if (I.hit('right')) it.act(1);
    }
    // スクロール画面
    if (st === 'archive' || st === 'credits' || st === 'records' || st === 'help') {
      if (I.down('up')) this.scroll = Math.max(0, this.scroll - 260 * dt);
      if (I.down('down')) this.scroll = Math.min(this.maxScroll || 0, this.scroll + 260 * dt);
      if (I.down('focus')) this.scroll += 0; // 長押しでも変化なし（誤操作防止）
    }
    // タッチ: タップで決定（input.js が confirm を発火させる）
  },

  /* =========================================================== 描画 ==== */
  draw(ctx, game, G) {
    const S = window.HN;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    switch (this.cur()) {
      case 'title': this.drawTitle(ctx, game, G); break;
      case 'diff': this.drawList(ctx, game, G, '難易度をえらぶ', 'EASY / NORMAL / HARD　—　すべてクリア可能であることを検証済み'); break;
      case 'stage': this.drawList(ctx, game, G, '章をえらぶ', G.difKey); break;
      case 'practice': this.drawList(ctx, game, G, '練習するフェーズをえらぶ', 'ひとつのフェーズだけを短く反復できます', true); break;
      case 'options': this.drawList(ctx, game, G, '設定', '←→ で調整　Esc でもどる'); break;
      case 'tutorial': this.drawTutorial(ctx, game, G); break;
      case 'help': this.drawHelp(ctx, game, G); break;
      case 'archive': this.drawArchive(ctx, game, G); break;
      case 'records': this.drawRecords(ctx, game, G); break;
      case 'credits': this.drawCredits(ctx, game, G); break;
      default: this.drawTitle(ctx, game, G);
    }
    this.drawFooter(ctx, G);
    if (this.messageT > 0 && this.message) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.messageT / 0.4);
      S.drawText(ctx, this.message, 320, 452, { size: 11, color: '#f0cf6a', align: 'center', outline: 3 });
      ctx.restore();
    }
  },

  /* ------------------------------------------------------- 背景 -------- */
  bg(ctx, game, tint = '#05060c') {
    if (game.bg && game.bg.built) { game.bg.draw(ctx); return; }
    ctx.fillStyle = tint; ctx.fillRect(0, 0, 640, 480);
  },

  /* --------------------------------------------------------- タイトル -- */
  drawTitle(ctx, game, G) {
    const S = window.HN;
    const t = this.t;
    // 背景を最初のステージのもので構築（未構築ならその場で作る）
    if (!game.bg.built) {
      game.bg.setStage(S.STAGES[0]);
      game.bg.update(1 / 60, 0.25, 1);
    }
    game.bg.update(1 / 60, 0.25, 1);
    game.bg.draw(ctx);

    // 上下を落として中央に集める
    ctx.fillStyle = 'rgba(5,6,12,0.42)';
    ctx.fillRect(0, 0, 640, 96);
    ctx.fillRect(0, 396, 640, 84);

    // ✝ の光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    S.drawCross(ctx, 320, 54, { scale: 4, pulse: 0.5 + 0.5 * Math.sin(t * 1.6), alpha: 0.95, glow: 1.2 });
    ctx.restore();

    // タイトル
    ctx.save();
    S.drawText(ctx, '本質', 320, 104, {
      size: 44, color: '#fffbe8', align: 'center', outline: 6, outlineColor: '#05060c',
    });
    S.drawText(ctx, '— 耐久型 弾幕 —', 320, 156, {
      size: 13, color: '#f0cf6a', align: 'center', outline: 4, outlineColor: '#05060c',
    });
    S.drawText(ctx, '「偏差値60の教室から✝本質✝が漏れ出している件について」より', 320, 180,
      { size: 10, color: '#8b94ad', align: 'center', outline: 3, outlineColor: '#05060c' });
    ctx.restore();
    ctx.strokeStyle = 'rgba(240,207,106,0.30)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(180, 200); ctx.lineTo(460, 200); ctx.stroke();

    // メニュー
    const items = this.items(G);
    const x = 320, y0 = 216, gap = 26;
    const bx0 = x - 118, bw = 236;
    ctx.fillStyle = 'rgba(5,6,12,0.55)';
    ctx.fillRect(bx0 - 4, y0 - 8, bw + 8, items.length * gap + 6);
    items.forEach((it, i) => {
      const sel = i === this.idx;
      const yy = y0 + i * gap;
      if (sel) {
        ctx.fillStyle = 'rgba(240,207,106,0.14)';
        ctx.fillRect(bx0 - 4, yy - 5, bw + 8, gap - 3);
        ctx.fillStyle = '#f0cf6a';
        ctx.fillRect(bx0 - 4, yy - 5, 2, gap - 3);
        ctx.fillRect(bx0 + bw + 2, yy - 5, 2, gap - 3);
      }
      S.drawText(ctx, it.label, x, yy, {
        size: 14, color: sel ? '#fffbe8' : '#a8b0c6', align: 'center', outline: 3,
      });
    });

    // 小さな記録表示
    const cleared = (G.save.cleared || []).filter(Boolean).length;
    S.drawText(ctx, `クリア ${cleared} / ${S.STAGES.length}`, 12, 404,
      { size: 10, color: '#8b94ad', outline: 2 });
    S.drawText(ctx, '攻撃はできません。右上の残り秒数が尽きるまで避け続けてください。', 320, 406,
      { size: 9, color: '#6f7893', align: 'center', outline: 2 });
    S.drawText(ctx, 'Z / Enter 決定　↑↓ 選択　F 全画面　M ミュート', 320, 424,
      { size: 9, color: '#5a6480', align: 'center', outline: 2 });
  },

  /* ------------------------------------------------------ リスト画面 --- */
  drawList(ctx, game, G, title, sub, compact = false) {
    const S = window.HN;
    this.bg(ctx, game, '#07080f');
    ctx.fillStyle = 'rgba(5,6,12,0.78)';
    ctx.fillRect(0, 0, 640, 480);

    S.drawText(ctx, title, 320, 26, { size: 22, color: '#fffbe8', align: 'center', outline: 5 });
    if (sub) S.drawText(ctx, sub, 320, 52, { size: 10, color: '#8b94ad', align: 'center', outline: 3 });
    ctx.strokeStyle = 'rgba(240,207,106,0.35)';
    ctx.beginPath(); ctx.moveTo(120, 66); ctx.lineTo(520, 66); ctx.stroke();

    const items = this.items(G);
    const rowH = compact ? 24 : 34;
    const maxRows = compact ? 11 : 8;
    // 選択項目が見えるようにスクロール
    const first = Math.max(0, Math.min(items.length - maxRows, this.idx - Math.floor(maxRows / 2)));
    for (let i = first; i < Math.min(items.length, first + maxRows); i++) {
      const it = items[i];
      const sel = i === this.idx;
      const y = 92 + (i - first) * rowH;
      if (sel) {
        ctx.fillStyle = 'rgba(240,207,106,0.10)';
        ctx.fillRect(90, y - 5, 460, rowH - 4);
        ctx.fillStyle = '#f0cf6a';
        ctx.fillRect(90, y - 5, 2, rowH - 4);
      }
      const col = it.color || (it.act ? (sel ? '#fffbe8' : '#c9cfe2') : '#5a6480');
      S.drawText(ctx, (sel ? '▶ ' : '　') + it.label, 106, y,
        { size: compact ? 12 : 15, color: col, outline: 3 });
      if (it.sub && !compact) {
        S.drawText(ctx, it.sub, 560, y + 1, { size: 10, color: '#8b94ad', align: 'right', outline: 2 });
      } else if (it.sub) {
        S.drawText(ctx, it.sub, 560, y + 1, { size: 9, color: '#7c86a2', align: 'right', outline: 2 });
      }
      // スライダー
      if (it.bar) {
        const v = it.bar();
        const bw = 110, bx = 430, by = y + 4;
        ctx.fillStyle = 'rgba(5,6,12,0.8)';
        ctx.fillRect(bx, by, bw, 7);
        ctx.fillStyle = '#f0cf6a';
        ctx.fillRect(bx, by, Math.round(bw * v), 7);
        ctx.strokeStyle = 'rgba(232,236,247,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx - 0.5, by - 0.5, bw + 1, 8);
        S.drawText(ctx, String(Math.round(v * 100)), 566, by - 3,
          { size: 9, color: '#8b94ad', align: 'right', latin: true });
      }
      if (it.toggle) {
        S.drawText(ctx, it.toggle() ? 'ON' : 'OFF', 550, y + 1,
          { size: 11, color: it.toggle() ? '#7fd6a0' : '#5a6480', align: 'right', latin: true });
      }
    }

    // 難易度選択のときは説明文を出す
    if (this.cur() === 'diff') {
      const k = window.HN.DIFF_ORDER[this.idx];
      const d = window.HN.DIFFICULTY[k];
      const lines = (window.HN.DIFF_DESC[k].body || '').split('\n');
      ctx.fillStyle = 'rgba(5,6,12,0.72)';
      ctx.fillRect(120, 350, 400, lines.length * 16 + 34);
      ctx.strokeStyle = 'rgba(240,207,106,0.25)';
      ctx.strokeRect(120.5, 350.5, 399, lines.length * 16 + 33);
      S.drawText(ctx, window.HN.DIFF_DESC[k].title, 320, 358,
        { size: 14, color: d.color, align: 'center', outline: 3 });
      lines.forEach((ln, i) => {
        S.drawText(ctx, ln, 320, 378 + i * 16, { size: 11, color: '#c9cfe2', align: 'center', outline: 2 });
      });
    }
  },

  /* --------------------------------------------------------- 操作 ------ */
  drawHelp(ctx, game, G) {
    const S = window.HN;
    this.bg(ctx, game);
    ctx.fillStyle = 'rgba(5,6,12,0.82)';
    ctx.fillRect(0, 0, 640, 480);
    S.drawText(ctx, 'そうさ', 320, 24, { size: 22, color: '#fffbe8', align: 'center', outline: 5 });
    const rows = [
      ['移動', 'WASD / ←↑↓→'],
      ['集中（低速＋当たり判定の可視化）', 'Shift を押している間'],
      ['観測（重ね合わせの収束）', 'X ／ Ctrl'],
      ['一時停止', 'P ／ Esc'],
      ['フルスクリーン', 'F'],
      ['ミュート', 'M'],
      ['タッチ操作', '画面をドラッグ（相対移動）。メニューはタップで決定。'],
    ];
    let y = 72;
    for (const [k, v] of rows) {
      S.drawText(ctx, k, 76, y, { size: 12, color: '#f0cf6a', outline: 3 });
      S.drawText(ctx, v, 300, y, { size: 12, color: '#c9cfe2', outline: 3 });
      y += 26;
    }
    ctx.strokeStyle = 'rgba(240,207,106,0.3)';
    ctx.beginPath(); ctx.moveTo(76, y + 4); ctx.lineTo(564, y + 4); ctx.stroke();
    y += 18;
    const tips = [
      '・このゲームに攻撃はありません。右上の残り秒数が尽きるまで避け続けてください。',
      '・被弾しても即死しません。残機を 1 消費し、無敵時間つきでその場に戻ります。',
      '・弾にかするとゲージが溜まります。満タンで X を押すと「観測」が発動し、',
      '　画面の弾が消え、ボスの重ね合わせが収束して硬直します。',
      '・残り時間が少なくなると弾幕の密度が上がります。原作の記述どおりです。',
    ];
    for (const tp of tips) {
      S.drawText(ctx, tp, 76, y, { size: 11, color: '#b6bdd0', outline: 3 });
      y += 19;
    }
    window.HN.drawCross(ctx, 560, 430, { scale: 2, pulse: 0.5 + 0.5 * Math.sin(this.t * 2), alpha: 0.8 });
  },

  /* ------------------------------------------------------- チュートリアル */
  drawTutorial(ctx, game, G) {
    const S = window.HN;
    this.bg(ctx, game);
    ctx.fillStyle = 'rgba(5,6,12,0.86)';
    ctx.fillRect(0, 0, 640, 480);
    S.drawText(ctx, 'ルール', 320, 44, { size: 26, color: '#fffbe8', align: 'center', outline: 6 });
    const T = S.TUTORIAL;
    let y = 108;
    for (const t of T) {
      ctx.fillStyle = 'rgba(240,207,106,0.06)';
      ctx.fillRect(70, y - 8, 500, 60);
      ctx.strokeStyle = 'rgba(240,207,106,0.28)';
      ctx.strokeRect(70.5, y - 7.5, 499, 59);
      S.drawText(ctx, t.jp, 92, y, { size: 16, color: '#f0cf6a', outline: 3 });
      const lines = S.wrapText(ctx, t.desc, 380, { size: 12 });
      lines.forEach((ln, i) => S.drawText(ctx, ln, 200, y + i * 18,
        { size: 12, color: '#e6e9f2', outline: 3 }));
      y += 74;
    }
    S.drawText(ctx, 'Enter / Z で開始', 320, 430,
      { size: 13, color: '#f0cf6a', align: 'center', outline: 3, alpha: 0.6 + 0.4 * Math.sin(this.t * 4) });
  },

  /* --------------------------------------------------------- 用語集 ---- */
  drawArchive(ctx, game, G) {
    const S = window.HN;
    this.bg(ctx, game);
    ctx.fillStyle = 'rgba(5,6,12,0.88)';
    ctx.fillRect(0, 0, 640, 480);
    S.drawText(ctx, '用語集／弾幕アーカイブ', 320, 22,
      { size: 19, color: '#fffbe8', align: 'center', outline: 5 });

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 40, 640, 396); ctx.clip();
    let y = 56 - this.scroll;
    const P = window.HN.PATTERNS, info = window.HN.PATTERN_INFO;

    S.drawText(ctx, '■ 弾幕（このゲームで実際に使われている 21 種）', 30, y,
      { size: 13, color: '#f0cf6a', outline: 3 }); y += 22;
    for (const k of Object.keys(P)) {
      const p = P[k];
      S.drawText(ctx, `・${p.jp}`, 42, y, { size: 12, color: '#fffbe8', outline: 3 });
      S.drawText(ctx, k, 610, y, { size: 10, color: '#7c86a2', align: 'right', latin: true });
      y += 17;
      const lore = window.HN.PATTERN_LORE[k] || p.novel || '';
      const lines = S.wrapText(ctx, lore, 540, { size: 10 });
      for (const ln of lines) { S.drawText(ctx, ln, 56, y, { size: 10, color: '#a8b0c6', outline: 2 }); y += 15; }
      S.drawText(ctx, `原作: ${p.novel || '—'}`, 56, y, { size: 9, color: '#6f7893', outline: 2 });
      y += 22;
    }

    y += 10;
    S.drawText(ctx, '■ 原作からの採用（そのまま）', 30, y, { size: 13, color: '#7fd6a0', outline: 3 }); y += 20;
    for (const s of window.HN.ADAPTATION_NOTES.adopted) {
      const lines = S.wrapText(ctx, '・' + s, 560, { size: 10 });
      for (const ln of lines) { S.drawText(ctx, ln, 42, y, { size: 10, color: '#b6bdd0', outline: 2 }); y += 15; }
    }
    y += 12;
    S.drawText(ctx, '■ 翻案（原作を読み替えた部分）', 30, y, { size: 13, color: '#f0cf6a', outline: 3 }); y += 20;
    for (const s of window.HN.ADAPTATION_NOTES.adapted) {
      const lines = S.wrapText(ctx, '・' + s, 560, { size: 10 });
      for (const ln of lines) { S.drawText(ctx, ln, 42, y, { size: 10, color: '#b6bdd0', outline: 2 }); y += 15; }
    }
    y += 12;
    S.drawText(ctx, '■ 独自追加（このゲームで新たに作ったもの）', 30, y,
      { size: 13, color: '#8fe8f2', outline: 3 }); y += 20;
    for (const s of window.HN.ADAPTATION_NOTES.original) {
      const lines = S.wrapText(ctx, '・' + s, 560, { size: 10 });
      for (const ln of lines) { S.drawText(ctx, ln, 42, y, { size: 10, color: '#b6bdd0', outline: 2 }); y += 15; }
    }
    y += 12;
    S.drawText(ctx, '■ 原作の抜粋', 30, y, { size: 13, color: '#e05575', outline: 3 }); y += 20;
    for (const ex of window.HN.NOVEL_EXCERPTS) {
      S.drawText(ctx, `［${ex.ch}］`, 42, y, { size: 9, color: '#8b94ad', outline: 2 });
      const lines = S.wrapText(ctx, ex.text.replace(/\n/g, ' ／ '), 520, { size: 10 });
      let yy = y;
      for (const ln of lines) { S.drawText(ctx, ln, 96, yy, { size: 10, color: '#d6dbe8', outline: 2 }); yy += 15; }
      if (ex.who) { S.drawText(ctx, `— ${ex.who}`, 600, yy - 15, { size: 9, color: '#7c86a2', align: 'right', outline: 2 }); }
      y = yy + 10;
    }
    y += 20;
    this.maxScroll = Math.max(0, y + this.scroll - 400);
    ctx.restore();

    // スクロールバー
    const total = this.maxScroll + 396;
    const frac = this.maxScroll > 0 ? this.scroll / this.maxScroll : 0;
    ctx.fillStyle = 'rgba(232,236,247,0.10)';
    ctx.fillRect(630, 44, 4, 388);
    ctx.fillStyle = 'rgba(240,207,106,0.55)';
    ctx.fillRect(630, 44 + Math.round(388 * frac), 4, Math.round(388 * (396 / Math.max(1, total))));
    S.drawText(ctx, '↑↓ でスクロール ／ Esc でもどる', 320, 456,
      { size: 10, color: '#8b94ad', align: 'center', outline: 3 });
  },

  /* --------------------------------------------------------- 記録 ------ */
  drawRecords(ctx, game, G) {
    const S = window.HN;
    this.bg(ctx, game);
    ctx.fillStyle = 'rgba(5,6,12,0.86)';
    ctx.fillRect(0, 0, 640, 480);
    S.drawText(ctx, '記録', 320, 24, { size: 22, color: '#fffbe8', align: 'center', outline: 5 });
    let y = 66;
    S.drawText(ctx, '章 / 難易度', 60, y, { size: 11, color: '#8b94ad', outline: 2 });
    S.drawText(ctx, 'SCORE', 380, y, { size: 11, color: '#8b94ad', align: 'right', latin: true, outline: 2 });
    S.drawText(ctx, 'かすり', 460, y, { size: 11, color: '#8b94ad', align: 'right', outline: 2 });
    S.drawText(ctx, 'ノーミス', 570, y, { size: 11, color: '#8b94ad', align: 'right', outline: 2 });
    y += 20;
    ctx.strokeStyle = 'rgba(240,207,106,0.28)';
    ctx.beginPath(); ctx.moveTo(60, y - 6); ctx.lineTo(580, y - 6); ctx.stroke();
    const keys = Object.keys(G.save.best || {}).sort();
    if (!keys.length) {
      S.drawText(ctx, 'まだ記録がありません', 320, 220,
        { size: 14, color: '#5a6480', align: 'center', outline: 3 });
    }
    for (const k of keys) {
      if (y > 430) break;
      const b = G.save.best[k];
      const m = k.match(/^([sp])(\d)_(\w+)$/);
      const label = m ? `${m[1] === 's' ? '第' + m[2] + '章' : '練習' + m[2]} / ${m[3]}` : k;
      S.drawText(ctx, label, 60, y, { size: 12, color: '#c9cfe2', outline: 2 });
      S.drawText(ctx, window.HN.fmtNum(b.score || 0), 380, y,
        { size: 12, color: '#fffbe8', align: 'right', latin: true, outline: 2 });
      S.drawText(ctx, String(b.graze || 0), 460, y,
        { size: 12, color: '#8fe8f2', align: 'right', latin: true, outline: 2 });
      S.drawText(ctx, b.noMiss ? '○' : '×', 570, y,
        { size: 12, color: b.noMiss ? '#7fd6a0' : '#5a6480', align: 'right', outline: 2 });
      y += 24;
    }
    const cl = (G.save.cleared || []).filter(Boolean).length;
    S.drawText(ctx, `クリア章数 ${cl} / ${S.STAGES.length}`, 60, 448,
      { size: 11, color: '#8b94ad', outline: 2 });
  },

  /* ------------------------------------------------------- クレジット -- */
  drawCredits(ctx, game, G) {
    const S = window.HN;
    const C = S.CREDITS;
    this.bg(ctx, game);
    ctx.fillStyle = 'rgba(5,6,12,0.90)';
    ctx.fillRect(0, 0, 640, 480);
    S.drawText(ctx, 'クレジット', 320, 20, { size: 20, color: '#fffbe8', align: 'center', outline: 5 });

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 38, 640, 398); ctx.clip();
    let y = 56 - this.scroll;
    S.drawText(ctx, C.work, 320, y, { size: 15, color: '#f0cf6a', align: 'center', outline: 3 }); y += 26;
    S.drawText(ctx, '原作', 320, y, { size: 11, color: '#8b94ad', align: 'center', outline: 2 }); y += 16;
    for (const ln of S.wrapText(ctx, C.original.title, 520, { size: 12 })) {
      S.drawText(ctx, ln, 320, y, { size: 12, color: '#e6e9f2', align: 'center', outline: 3 }); y += 18;
    }
    S.drawText(ctx, C.original.author, 320, y, { size: 10, color: '#8b94ad', align: 'center', outline: 2 }); y += 20;
    for (const ln of S.wrapText(ctx, C.original.note, 520, { size: 10 })) {
      S.drawText(ctx, ln, 320, y, { size: 10, color: '#b6bdd0', align: 'center', outline: 2 }); y += 15;
    }
    y += 16;
    ctx.strokeStyle = 'rgba(240,207,106,0.3)';
    ctx.beginPath(); ctx.moveTo(80, y); ctx.lineTo(560, y); ctx.stroke(); y += 18;
    for (const l of C.lines) {
      S.drawText(ctx, l.role, 62, y, { size: 10, color: '#8b94ad', outline: 2 });
      for (const ln of S.wrapText(ctx, l.who, 300, { size: 11 })) {
        S.drawText(ctx, ln, 300, y, { size: 11, color: '#e6e9f2', outline: 2 }); y += 16;
      }
      y += 8;
    }
    y += 10;
    S.drawText(ctx, 'フォント', 320, y, { size: 12, color: '#f0cf6a', align: 'center', outline: 3 }); y += 20;
    for (const f of C.fonts) {
      S.drawText(ctx, `${f.name}  —  ${f.by}`, 320, y, { size: 11, color: '#e6e9f2', align: 'center', outline: 2 }); y += 16;
      S.drawText(ctx, `${f.license}   ／   同梱ファイル: ${f.file}`, 320, y,
        { size: 9, color: '#8b94ad', align: 'center', latin: true, outline: 2 }); y += 15;
      S.drawText(ctx, `取得元: ${f.source}`, 320, y, { size: 9, color: '#7c86a2', align: 'center', latin: true, outline: 2 }); y += 22;
    }
    y += 8;
    for (const ln of S.wrapText(ctx, C.note, 520, { size: 10 })) {
      S.drawText(ctx, ln, 320, y, { size: 10, color: '#b6bdd0', align: 'center', outline: 2 }); y += 15;
    }
    y += 24;
    window.HN.drawCross(ctx, 320, y + 10, { scale: 2, pulse: 0.5 + 0.5 * Math.sin(this.t * 1.8), alpha: 0.9 });
    y += 40;
    this.maxScroll = Math.max(0, y + this.scroll - 400);
    ctx.restore();
    S.drawText(ctx, '↑↓ でスクロール ／ Esc でもどる', 320, 456,
      { size: 10, color: '#8b94ad', align: 'center', outline: 3 });
  },

  drawFooter(ctx, G) {
    const S = window.HN;
    S.drawText(ctx, `ver 1.0　—　外部素材は使用していません（フォントを除く）`, 8, 470,
      { size: 8, color: '#4d5670', outline: 2 });
  },
};

function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

window.HN = window.HN || {};
Object.assign(window.HN, { Screens });
