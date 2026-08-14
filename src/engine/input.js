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
  /* デバッグ用の強制発火(2026-08-14 追加)。配線は src/main.js
   *   F … 次の1レバーONで必ずレバーONフリーズ(flow.forceFreeze)
   *   W … 「風が子役を運んでくる」演出をその場で再生
   *   P … 次に始まる前兆の演出パターンを順送りで固定 / 解除
   */
  KeyF: 'DEBUG_FREEZE',
  KeyW: 'DEBUG_WIND',
  KeyP: 'DEBUG_ZENCHO',
  /* RUSH 4種への強制突入(2026-08-14 U11。割当は data/rushes.js の DEBUG_RUSH_KEYS)
   *   Z … オートスケーリングRUSH / X … CloudFront RUSH
   *   C … Aurora RUSH            / V … ヒーローRUSH(1/50 のプレミア)
   */
  KeyZ: 'DEBUG_RUSH_1',
  KeyX: 'DEBUG_RUSH_2',
  KeyC: 'DEBUG_RUSH_3',
  KeyV: 'DEBUG_RUSH_4',
  /*
   * ここに **無い** デバッグキー(2026-08-14 U33 の棚卸し。凡例は src/main.js):
   *   L … ルナのカメオ強制 ON/OFF。data/scenarios/yokoku-luna.js が
   *       自前で window.keydown を張っている(演出データ側で完結させたいため)。
   * Hキーの凡例(main.js の HELP_* )は KEY_MAP とこの注記の両方を見て書くこと。
   */
};

export class Input {
  /** @param {HTMLElement} root data-action を持つ要素のルート */
  constructor(root = document.body) {
    this.root = root;
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
    this.enabled = true;
    /** 直近に pointerdown を拾った要素と時刻(click との二重発火よけ) */
    this._lastPointerEl = null;
    this._lastPointerAt = 0;
    /**
     * 直近にキーで処理した「要素」と時刻(同上)。
     *
     * 2026-08-15 検証指摘: 以前は時刻だけを見て「直近700ms以内にキー処理が
     * あれば無条件に click を捨てる」判定だったため、
     * デバッグキー(F / W / 0 …)を押した直後の Tab + Enter のように
     * **別の要素へのキーボード操作まで黙って落ちて**いた。
     * ポインタ側は要素一致(_lastPointerEl)を見ているので、粒度を揃える。
     * 要素を伴わないキー操作(KEY_MAP 経由)は null を入れる。
     * @type {Element|null}
     */
    this._lastKeyEl = null;
    this._lastKeyAt = 0;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onClick = this._onClick.bind(this);
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    this.root.addEventListener('pointerdown', this._onPointerDown);
    this.root.addEventListener('click', this._onClick);
    return this;
  }

  detach() {
    window.removeEventListener('keydown', this._onKeyDown);
    this.root.removeEventListener('pointerdown', this._onPointerDown);
    this.root.removeEventListener('click', this._onClick);
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
    /*
     * 修飾キー付きはブラウザ/OSのショートカット(⌘C コピー・⌘R リロード等)なので触らない。
     * 2026-08-14 に RUSH 強制突入で C / V を割り当てたため、
     * ここで弾かないと ⌘C・⌘V が preventDefault されてコピペが効かなくなる。
     */
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // フォーカスがフォーム部品 / ゲーム外のボタンにある間はゲーム操作にしない
    if (isFormFocused()) return;

    /*
     * 筐体のボタンにフォーカスが乗っているときの Enter / Space は、
     * **そのボタンの操作** として扱う(Tab で「もう一度やる」へ移って Enter、が効く)。
     * KEY_MAP をそのまま引くと Enter が常に BET になってしまい、
     * フォーカスしたボタンが何であっても押せないままだった。
     */
    const focused = document.activeElement;
    const focusAction = focused?.dataset?.action;
    if (focusAction && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      // この後ブラウザが同じ要素へ合成 click を投げてくるので、
      // **その要素の click だけ**を二重発火として捨てられるよう記録する
      this._lastKeyEl = focused;
      this._lastKeyAt = Date.now();
      this.fire(focusAction, { source: 'key', code: e.code, el: focused });
      return;
    }

    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    /*
     * キーで処理したことを記録(直後に来る click を二重発火として捨てる)。
     * この経路は要素を持たない(画面のどこにもフォーカスが無い状態の
     * ↑ / Space / デバッグキー)ので、el は null にしておく。
     * ここで前回の要素を残すと、無関係なキーの直後に来た
     * 正当なキーボード click まで捨ててしまう。
     */
    this._lastKeyEl = null;
    this._lastKeyAt = Date.now();
    this.fire(action, { source: 'key', code: e.code });
  }

  _onPointerDown(e) {
    const el = e.target instanceof Element ? e.target.closest('[data-action]') : null;
    if (!el) return;
    const action = el.dataset.action;
    if (!action) return;
    e.preventDefault();
    // 直後に来る click を二重発火とみなして捨てるための記録(_onClick 参照)
    this._lastPointerEl = el;
    this._lastPointerAt = Date.now();
    // キーボード操作の邪魔にならないようフォーカスは奪わない
    this.fire(action, { source: 'pointer', el });
  }

  /**
   * キーボードでボタンを押したとき(Enter / Space による click)だけ拾う。
   *
   * ポインタ操作は _onPointerDown が拾っているので、ここで二重に発火させない。
   * 見分けは `detail === 0`(キーボード由来の click はクリック回数が 0)。
   * これが無いと、Tab で MAX BET などにフォーカスを移した人は
   * **Enter を押しても何も起きない**(_onKeyDown 側が上のフォーム判定で
   * 降りてしまうため)。
   */
  _onClick(e) {
    if (e.detail !== 0) return;
    const el = e.target instanceof Element ? e.target.closest('[data-action]') : null;
    const action = el?.dataset.action;
    if (!action) return;
    /*
     * タッチ端末では合成 click の detail が 0 になることがあり、
     * それだけだと pointerdown と合わせて **1タップで2回** 発火してしまう
     * (BET が2回 = クレジットが余計に減る)。直前に同じ要素で
     * pointerdown を拾っていたら、その click はポインタ操作の続きとみなして捨てる。
     */
    if (el === this._lastPointerEl && Date.now() - (this._lastPointerAt ?? 0) < 700) return;
    /*
     * 同じ要素へのキー入力を _onKeyDown が既に処理していたら、その click は捨てる
     * (フォーカスが筐体ボタンに乗っている状態の Enter が BET を2回出さないように)。
     *
     * **要素が一致するときだけ**捨てるのが肝(2026-08-15 検証指摘)。
     * 時刻だけで判定していた頃は、デバッグキーを押した直後の Tab + Enter など
     * 「別の要素への正当なキーボード操作」まで無言で落ちていた。
     * ポインタ側(上の行)と同じ粒度に揃えてある。
     */
    if (el === this._lastKeyEl && Date.now() - (this._lastKeyAt ?? 0) < 700) return;
    this.fire(action, { source: 'key', el });
  }
}

/**
 * いまのフォーカスが「ゲーム操作より優先すべき部品」か(2026-08-15 の Enter 誤爆対策)。
 *
 * 【直した問題】
 * 甘スロ切替ボタン(main.js の setupAmaUi)にフォーカスが乗っている状態で
 * BET のつもりに Enter を押すと、ゲームは BET を受け付けたうえに
 * ブラウザがボタンを活性化して **ページが `?ama=1` へ再読込され、
 * 100回転が最初からになる**。keydown の preventDefault は
 * 「そのキーの既定動作」を止めるだけで、実装差で活性化が通る経路がある。
 *
 * 【方針】
 * ゲームの外のボタン(= data-action を持たないボタンやリンク)にフォーカスが
 * 乗っている間は、キーはそのボタンのものとして扱いゲームには渡さない。
 *
 * 筐体のボタン(data-action つき)は **これまでどおりゲーム操作を通す**。
 * ここでゲーム操作を止めてしまうと、マウスでボタンを押した拍子に
 * フォーカスが残る環境で「以降キーが一切効かない」台になってしまう。
 * キーで処理したぶんの click は Input._onClick が時刻で見分けて捨てる。
 */
function isFormFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable === true) return true;
  const isButtonLike = tag === 'BUTTON' || tag === 'A' || el.getAttribute?.('role') === 'button';
  // 筐体のボタン(data-action)はゲームの一部なので除外する
  return isButtonLike && el.dataset?.action == null;
}
