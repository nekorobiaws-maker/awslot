/**
 * pub/sub イベントバス。演出システムの中核(DESIGN.md 4.2)。
 *
 * ゲームロジック(game/)は emit するだけで、誰が購読しているかを知らない。
 * これにより演出(staging/)・描画(render/)を後から足しても game/ に影響しない。
 */

export class EventBus {
  constructor({ debug = false } = {}) {
    this._handlers = new Map();
    this.debug = debug;
    /** 直近のイベント履歴(デバッグ表示用) */
    this.history = [];
    this.historyLimit = 40;
  }

  /**
   * @param {string} event イベント名 ('*' で全イベント購読)
   * @param {(payload:any, event:string)=>void} fn
   * @returns {()=>void} 解除関数
   */
  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this._handlers.get(event)?.delete(fn);
  }

  emit(event, payload = {}) {
    this.history.push({ event, payload, t: performance.now() });
    if (this.history.length > this.historyLimit) this.history.shift();
    if (this.debug) console.log('[bus]', event, payload);

    for (const fn of this._handlers.get(event) ?? []) {
      try { fn(payload, event); } catch (e) { console.error(`[bus] handler error on "${event}"`, e); }
    }
    for (const fn of this._handlers.get('*') ?? []) {
      try { fn(payload, event); } catch (e) { console.error('[bus] wildcard handler error', e); }
    }
  }
}
