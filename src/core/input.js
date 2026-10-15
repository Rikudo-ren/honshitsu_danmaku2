/**
 * 入力。キーボード / ゲームパッド / タッチ(仮想スティック) に対応。
 * 責務: 「押されている方向」と「エッジ(押した瞬間)」を提供するだけ。
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();     // このフレームで押された
    this.released = new Set();
    this.axis = { x: 0, y: 0 };
    this.raw = { x: 0, y: 0 };
    this.focused = false;         // Shift 相当 (低速移動)

    /** タッチ / 仮想スティック */
    this.touch = {
      active: false,
      id: null,
      ox: 0, oy: 0,       // スティック原点 (キャンバス座標)
      x: 0, y: 0,         // 現在位置
      dx: 0, dy: 0,       // 正規化された方向 -1..1
      mag: 0,             // 0..1
      second: false,      // 2本目の指 = 低速移動
    };
    this.padIndex = null;
    this.anyInput = false;

    this._bind();
  }

  _bind() {
    const stop = (e) => { if (e.cancelable) e.preventDefault(); };

    addEventListener('keydown', (e) => {
      if (e.repeat) { stop(e); return; }
      const k = this._norm(e);
      this.keys.add(k);
      this.pressed.add(k);
      this.anyInput = true;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(e.code)) stop(e);
    }, { passive: false });

    addEventListener('keyup', (e) => {
      const k = this._norm(e);
      this.keys.delete(k);
      this.released.add(k);
    });

    addEventListener('blur', () => { this.keys.clear(); });
    addEventListener('contextmenu', (e) => { if (e.target === this.canvas) e.preventDefault(); });

    /* ---- タッチ ---- */
    const c = this.canvas;
    const toLocal = (t) => {
      const r = c.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };

    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      stop(e);
      this.anyInput = true;
      const p = toLocal(e);
      if (!this.touch.active) {
        this.touch.active = true;
        this.touch.id = e.pointerId;
        this.touch.ox = p.x; this.touch.oy = p.y;
        this.touch.x = p.x; this.touch.y = p.y;
      } else {
        this.touch.second = true;
      }
    }, { passive: false });

    c.addEventListener('pointermove', (e) => {
      if (!this.touch.active || e.pointerId !== this.touch.id) return;
      stop(e);
      const p = toLocal(e);
      this.touch.x = p.x; this.touch.y = p.y;
    }, { passive: false });

    const endTouch = (e) => {
      if (e.pointerId === this.touch.id) {
        this.touch.active = false;
        this.touch.id = null;
        this.touch.dx = 0; this.touch.dy = 0; this.touch.mag = 0;
      } else {
        this.touch.second = false;
      }
    };
    c.addEventListener('pointerup', endTouch);
    c.addEventListener('pointercancel', endTouch);

    /* ---- マウス: ドラッグでも操作できるように ---- */
    this.mouse = { down: false, x: 0, y: 0, moved: false };
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.anyInput = true;
      this.mouse.down = true;
      this.mouse.relative = e.button === 0 && e.shiftKey;
      const p = toLocal(e);
      this.mouse.x = p.x; this.mouse.y = p.y;
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = c.getBoundingClientRect();
      this.mouse.sx = e.clientX - r.left;
      this.mouse.sy = e.clientY - r.top;
    });
    addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') this.mouse.down = false;
    });
  }

  _norm(e) {
    // 物理キーコードを論理名に寄せる
    const m = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
      ShiftLeft: 'focus', ShiftRight: 'focus',
      KeyZ: 'confirm', Enter: 'confirm', Space: 'confirm',
      KeyX: 'bomb', Escape: 'cancel', KeyC: 'cancel',
      KeyR: 'restart', KeyP: 'pause', KeyF: 'fullscreen',
      Tab: 'skip', KeyQ: 'skip',
    };
    return m[e.code] || e.code.toLowerCase();
  }

  /** 論理キーが押されているか (複数指定可) */
  down(...names) { return names.some((n) => this.keys.has(n)); }
  hit(...names) { return names.some((n) => this.pressed.has(n)); }

  /** ゲームパッドを読む */
  _pollPad() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
      const dz = 0.28;
      if (Math.abs(ax) > dz || Math.abs(ay) > dz) {
        this.raw.x = Math.abs(ax) > dz ? ax : 0;
        this.raw.y = Math.abs(ay) > dz ? ay : 0;
      }
      const b = p.buttons;
      if (b[0]?.pressed) this.keys.add('confirm'); else this.keys.delete('confirm');
      if (b[1]?.pressed) this.keys.add('cancel'); else this.keys.delete('cancel');
      if (b[2]?.pressed) this.keys.add('restart'); else this.keys.delete('restart');
      if (b[4]?.pressed || b[5]?.pressed) this.keys.add('focus'); else this.keys.delete('focus');
      if (b[9]?.pressed) this.keys.add('pause'); else this.keys.delete('pause');
      // 十字キー / スティック
      const dpad = { up: b[12]?.pressed, down: b[13]?.pressed, left: b[14]?.pressed, right: b[15]?.pressed };
      for (const [k, v] of Object.entries(dpad)) {
        if (v) { this.keys.add(k); if (!this._padHeld?.[k]) (this.pressed ?? this.pressed).add?.(k); }
        else this.keys.delete(k);
      }
      this._padHeld = dpad;
      this.padIndex = p.index;
      for (const btn of ['confirm', 'cancel', 'restart']) { /* edge は keyboard 側で十分 */ }
      break;
    }
  }

  /** 毎フレーム先頭で呼ぶ */
  update() {
    this.raw.x = 0; this.raw.y = 0;
    let x = 0, y = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('up')) y -= 1;
    if (this.down('down')) y += 1;

    this._pollPad();
    if (this.raw.x || this.raw.y) { x = this.raw.x; y = this.raw.y; }

    // タッチスティック
    if (this.touch.active) {
      const rect = this.canvas.getBoundingClientRect();
      const sx = rect.width / 140; // 140px 動かすと最大
      let dx = (this.touch.x - this.touch.ox) / rect.width * 140 / 140;
      let dy = (this.touch.y - this.touch.oy) / rect.height * 140 / 140;
      dx *= 140 / rect.width * (rect.width / 140);
      // 正規化: キャンバス座標で 60px 動かしたら最大
      const px = (this.touch.x - this.touch.ox) / rect.width;
      const py = (this.touch.y - this.touch.oy) / rect.height;
      const scale = rect.width / 62;
      let nx = (this.touch.x - this.touch.ox) / scale;
      let ny = (this.touch.y - this.touch.oy) / scale;
      const m = Math.hypot(nx, ny);
      if (m > 1) { nx /= m; ny /= m; }
      this.touch.dx = nx; this.touch.dy = ny; this.touch.mag = Math.min(1, m);
      if (m > 0.10) { x = nx; y = ny; }
    } else if (this.mouse.down && this.mouse.sx != null) {
      // マウスドラッグ: 自機をカーソルへ引き寄せるのではなく相対移動にする
      // (絶対移動は理不尽なので、しきい値を超えた分だけ速度として渡す)
      const nx = this.mouse.sx - (this.mouse.x ?? this.mouse.sx);
      const ny = this.mouse.sy - (this.mouse.y ?? this.mouse.sy);
      const m = Math.hypot(nx, ny);
      if (m > 4) { x = nx / m; y = ny / m; }
      this.mouse.x = this.mouse.sx; this.mouse.y = this.mouse.sy;
    }

    const mag = Math.hypot(x, y);
    if (mag > 1) { x /= mag; y /= mag; }
    this.axis.x = x; this.axis.y = y;
    this.focused = this.down('focus') || this.touch.second;

    this.pressed.clear();
    this.released.clear();
  }

  /** アナログ量 (0..1) — 斜め移動の速度を正規化するため */
  get mag() { return Math.min(1, Math.hypot(this.axis.x, this.axis.y)); }
}
