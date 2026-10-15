/* =============================================================================
 * src/core/input.js — 入力（キーボード / マウス / タッチ / ゲームパッド）
 *  · キーボード: 矢印 or WASD 移動, Shift 低速, Z/Enter 決定, X/Esc キャンセル
 *  · タッチ: 画面上のドラッグで相対移動（指で自機が隠れないようオフセット）
 * ========================================================================== */
'use strict';

const KEYMAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  ShiftLeft: 'focus', ShiftRight: 'focus',
  KeyZ: 'confirm', Enter: 'confirm', Space: 'confirm',
  KeyX: 'cancel', Backspace: 'cancel',
  Escape: 'esc',          // ゲーム中はポーズ、メニューでは「もどる」
  KeyP: 'pause', KeyR: 'retry', KeyF: 'fullscreen', KeyM: 'mute',
  Tab: 'hint',
};

class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = Object.create(null);      // 押下中
    this.pressed = Object.create(null);   // このフレームで押された
    this.released = Object.create(null);  // このフレームで離された
    this.ptr = { x: 0, y: 0, active: false, down: false, dx: 0, dy: 0, id: -1, isTouch: false };
    this.pointerMoved = false;
    this.anyInput = false;
    this.lastDevice = 'keyboard';
    this._bind();
  }

  _bind() {
    const prevent = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab', 'Enter']);
    addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (prevent.has(e.code)) e.preventDefault();
      if (!a) return;
      if (!this.keys[a]) this.pressed[a] = true;
      this.keys[a] = true;
      this.anyInput = true;
      this.lastDevice = 'keyboard';
    }, { passive: false });
    addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      this.keys[a] = false;
      this.released[a] = true;
    });
    addEventListener('blur', () => { this.keys = Object.create(null); this.ptr.down = false; });

    const c = this.canvas;
    const toLocal = (ev) => {
      const r = c.getBoundingClientRect();
      return {
        x: (ev.clientX - r.left) * (c.width / r.width),
        y: (ev.clientY - r.top) * (c.height / r.height),
      };
    };

    c.addEventListener('pointerdown', (ev) => {
      if (this.ptr.down) return;
      const p = toLocal(ev);
      this.ptr.x = p.x; this.ptr.y = p.y;
      this.ptr.active = true; this.ptr.down = true;
      this.ptr.id = ev.pointerId; this.ptr.isTouch = ev.pointerType === 'touch';
      this.ptr.dx = 0; this.ptr.dy = 0;
      c.setPointerCapture?.(ev.pointerId);
      this.anyInput = true; this.lastDevice = 'pointer';
      this.pressed.confirm = this.pressed.confirm || false;
    });
    c.addEventListener('pointermove', (ev) => {
      const p = toLocal(ev);
      if (this.ptr.down && ev.pointerId === this.ptr.id) {
        this.ptr.dx += p.x - this.ptr.x;
        this.ptr.dy += p.y - this.ptr.y;
        this.ptr.x = p.x; this.ptr.y = p.y;
        this.pointerMoved = true;
        this.lastDevice = 'pointer';
      } else if (!this.ptr.down) {
        this.ptr.x = p.x; this.ptr.y = p.y;
        this.ptr.active = true;
      }
    });
    const up = (ev) => {
      if (ev.pointerId !== undefined && ev.pointerId !== this.ptr.id) return;
      // 軽いタップは決定として扱う
      if (this.ptr.down) this.pressed.confirm = true;
      this.ptr.down = false; this.ptr.id = -1;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', (ev) => { if (this.ptr.isTouch) up(ev); });
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    // ゲームパッド（あれば）
    addEventListener('gamepadconnected', () => { this.pad = true; });
  }

  /** 毎フレーム末に呼ぶ */
  endFrame() {
    this.pressed = Object.create(null);
    this.released = Object.create(null);
    this.ptr.dx = 0; this.ptr.dy = 0;
    this.pointerMoved = false;
  }

  down(a) { return !!this.keys[a]; }
  hit(a) { return !!this.pressed[a]; }
  up(a) { return !!this.released[a]; }

  /** 移動ベクトル (-1..1)。正規化済み。 */
  moveVec() {
    let x = 0, y = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('up')) y -= 1;
    if (this.down('down')) y += 1;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    // ゲームパッド
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    if (pads) {
      for (const p of pads) {
        if (!p) continue;
        const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
        if (Math.abs(ax) > .18 || Math.abs(ay) > .18) { x = ax; y = ay; break; }
      }
    }
    return { x, y, active: x !== 0 || y !== 0 };
  }

  focusHeld() {
    if (this.down('focus')) return true;
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    if (pads) for (const p of pads) if (p && (p.buttons[6]?.pressed || p.buttons[4]?.pressed)) return true;
    if (this.ptr.down && !this.ptr.isTouch) return false;
    return false;
  }
}

/* ------------------------------------------------------- フルスクリーン ----- */
const Fullscreen = {
  get active() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
  async toggle() {
    const el = document.documentElement;
    try {
      if (!this.active) {
        await (el.requestFullscreen?.({ navigationUI: 'hide' }) ||
          el.webkitRequestFullscreen?.());
        if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => { });
      } else {
        await (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
      }
      return true;
    } catch (e) { return false; }
  },
};

window.HN = window.HN || {};
Object.assign(window.HN, { Input, Fullscreen });
