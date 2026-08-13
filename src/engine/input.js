/**
 * 入力の正規化(キーボード / クリック / タッチ)。
 *
 * DOM側は data-action 属性でアクション名を宣言する。
 *   <button data-action="BET">…</button>
 * キーボードは KEY_MAP で同じアクション名に写像する。
 */

/**
 * キー -> アクション名
 *
 * 矢印キー(2026-08-13 追加): 片手で完結する操作系。
 *   ↑ … PLAY(状態で自動判別。BET前ならMAX BET、BET後ならレバーON、
 *        リザルト表示中ならリスタート)。振り分けは game/flow.js の play() が持つ
 *   ← ↓ → … 左 / 中 / 右リール停止
 * 既存の Enter / Space / A / S / D はそのまま併用できる。
 * ブラウザのスクロールは _onKeyDown 側の preventDefault で止めている。
 */
export const KEY_MAP = {
  Enter: 'BET',
  Space: 'LEVER',
  KeyA: 'STOP0',
  KeyS: 'STOP1',
  KeyD: 'STOP2',
  ArrowUp: 'PLAY',
  ArrowLeft: 'STOP0',
  ArrowDown: 'STOP1',
  ArrowRight: 'STOP2',
  KeyR: 'RESTART',
  Digit1: 'DEBUG_FLAG_1',
  Digit2: 'DEBUG_FLAG_2',
  Digit3: 'DEBUG_FLAG_3',
  Digit4: 'DEBUG_FLAG_4',
  Digit5: 'DEBUG_FLAG_5',
  Digit6: 'DEBUG_FLAG_6',
  Digit7: 'DEBUG_FLAG_7',
  Digit8: 'DEBUG_FLAG_8',
  Digit9: 'DEBUG_FLAG_9',
  Minus: 'DEBUG_FLAG_10',
  Digit0: 'DEBUG_CREDIT',
  KeyH: 'TOGGLE_HELP',
  KeyM: 'TOGGLE_MUTE',
};

export class Input {
  /** @param {HTMLElement} root data-action を持つ要素のルート */
  constructor(root = document.body) {
    this.root = root;
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
    this.enabled = true;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    this.root.addEventListener('pointerdown', this._onPointerDown);
    return this;
  }

  detach() {
    window.removeEventListener('keydown', this._onKeyDown);
    this.root.removeEventListener('pointerdown', this._onPointerDown);
  }

  /**
   * @param {string} action アクション名
   * @param {(payload:object)=>void} fn
   */
  on(action, fn) {
    if (!this._handlers.has(action)) this._handlers.set(action, new Set());
    this._handlers.get(action).add(fn);
    return this;
  }

  fire(action, payload = {}) {
    if (!this.enabled) return;
    for (const fn of this._handlers.get(action) ?? []) {
      try { fn(payload); } catch (e) { console.error(`[input] handler error: ${action}`, e); }
    }
  }

  _onKeyDown(e) {
    if (e.repeat) return;
    // 入力欄にフォーカスがある場合は無視
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    this.fire(action, { source: 'key', code: e.code });
  }

  _onPointerDown(e) {
    const el = e.target instanceof Element ? e.target.closest('[data-action]') : null;
    if (!el) return;
    const action = el.dataset.action;
    if (!action) return;
    e.preventDefault();
    // キーボード操作の邪魔にならないようフォーカスは奪わない
    this.fire(action, { source: 'pointer', el });
  }
}
