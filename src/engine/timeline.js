/**
 * 演出タイムライン実行器。DESIGN.md 6.5
 *
 * キューは3種類:
 *   { at: 300, ... }                 … シナリオ開始からの経過時間で発火
 *   { waitFor: "stop2", ... }        … 指定イベントが来たら発火
 *   { waitFor: "stop3", after: 200 } … 指定イベントから after ms 後に発火
 *
 * params の値に "$result.cz" のように書くと実行時のコンテキストから解決される(遅延バインド)。
 * "$result.cz ? 'a' : 'b'" の三項形式もサポートする。
 * テロップのように文字列の一部へ差し込みたい場合は "${value} GAMES LEFT" と書く。
 */

/** "$path.to.value" / "$path ? 'a' : 'b'" / "…${path}…" を解決する */
const TERNARY_RE = /^\$([\w.$]+)\s*\?\s*(.+?)\s*:\s*(.+)$/;
const REF_RE = /^\$([\w.$]+)$/;
const INTERP_RE = /\$\{([\w.$]+)\}/g;

function unquote(s) {
  const t = String(s).trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  const n = Number(t);
  return Number.isFinite(n) && t !== '' ? n : t;
}

/** ドット記法でコンテキストから値を取り出す */
export function getPath(obj, path) {
  return String(path).split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/** 単一の値を解決する */
export function resolveValue(value, ctx) {
  if (typeof value !== 'string') return value;

  // 文字列の一部だけ差し込む形。"${value} GAMES LEFT" のようなテロップ用。
  // 値が取れない場合は空文字にせず、プレースホルダを残して気付けるようにする。
  if (value.includes('${')) {
    return value.replace(INTERP_RE, (whole, path) => {
      const v = getPath(ctx, path);
      return v == null ? whole : String(v);
    });
  }
  if (!value.startsWith('$')) return value;

  const ternary = value.match(TERNARY_RE);
  if (ternary) {
    const [, path, whenTrue, whenFalse] = ternary;
    return getPath(ctx, path) ? unquote(whenTrue) : unquote(whenFalse);
  }
  const ref = value.match(REF_RE);
  if (ref) return getPath(ctx, ref[1]);
  return value;
}

/** params オブジェクトを再帰的に解決する */
export function resolveParams(params, ctx) {
  if (params == null) return params;
  if (Array.isArray(params)) return params.map((v) => resolveParams(v, ctx));
  if (typeof params === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(params)) out[k] = resolveParams(v, ctx);
    return out;
  }
  return resolveValue(params, ctx);
}

/** 実行中の1シナリオ */
class Playing {
  /**
   * @param {object} scenario
   * @param {object} ctx
   * @param {((cue:object)=>boolean)|null} [cueFilter] false を返したキューは最初から無かったことにする
   */
  constructor(scenario, ctx, cueFilter = null) {
    this.scenario = scenario;
    this.ctx = ctx;
    this.elapsed = 0;
    this.cues = (scenario.cues ?? [])
      .filter((cue) => (cueFilter ? cueFilter(cue) : true))
      .map((cue) => ({
        cue,
        fired: false,
        /** waitFor キューが解放された時刻(未解放なら null) */
        releasedAt: cue.waitFor ? null : 0,
      }));
    this.duration = scenario.duration ?? 0;
    /** waitFor 待ちが残る場合の保険 */
    this.maxLifetime = this.duration + 20000;
  }

  get hasPendingWait() {
    return this.cues.some((c) => !c.fired && c.cue.waitFor && c.releasedAt === null);
  }

  get done() {
    if (this.elapsed >= this.maxLifetime) return true;
    const allFired = this.cues.every((c) => c.fired);
    return allFired && this.elapsed >= this.duration;
  }

  notify(eventName) {
    for (const c of this.cues) {
      if (!c.fired && c.cue.waitFor === eventName && c.releasedAt === null) {
        c.releasedAt = this.elapsed;
      }
    }
  }
}

export class Timeline {
  /**
   * @param {object} opts
   * @param {Record<string, Function>} opts.actions アクションレジストリ
   * @param {(msg:string, e:Error)=>void} [opts.onError]
   */
  constructor({ actions, onError = null }) {
    this.actions = actions;
    this.onError = onError;
    /** @type {Playing[]} */
    this.playing = [];
    /** 同時実行数の上限(演出が積み上がって重くなるのを防ぐ) */
    this.maxConcurrent = 6;
    /** notify() の転送先(シナリオより長生きする表示物の受け口) @type {Set<Function>} */
    this._notifyListeners = new Set();
    /** シナリオが終わったときの通知先 @type {Set<Function>} */
    this._finishListeners = new Set();
  }

  /**
   * シナリオが終わった(または早送りで止められた)ときに呼ばれる。
   * 全面占有演出の解除など「終わりを知らないと戻せない状態」を持つ側が使う。
   * @param {(playing:Playing)=>void} fn
   * @returns {() => void} 解除関数
   */
  onFinish(fn) {
    this._finishListeners.add(fn);
    return () => this._finishListeners.delete(fn);
  }

  _emitFinish(playing) {
    for (const fn of this._finishListeners) {
      try {
        fn(playing);
      } catch (e) {
        if (this.onError) this.onError(`finish:${playing?.scenario?.id}`, e);
        else console.error('[timeline] finish 通知エラー', e);
      }
    }
  }

  /**
   * notify() されたイベントを外部へも転送する。
   *
   * テキスト帯のように「シナリオが終わっても画面に残り続ける表示物」は、
   * 自分の寿命を決めるためにゲーム進行イベント(レバーON等)を知る必要がある。
   * Timeline から表示実装を直接 import せずに済むよう、購読の口だけを用意する。
   * @param {(eventName:string)=>void} fn
   * @returns {() => void} 解除関数
   */
  onNotify(fn) {
    this._notifyListeners.add(fn);
    return () => this._notifyListeners.delete(fn);
  }

  get isPlaying() { return this.playing.length > 0; }

  /** 実行中シナリオIDの一覧(デバッグ用) */
  get activeIds() { return this.playing.map((p) => p.scenario.id); }

  /**
   * シナリオを再生する。
   * @param {object} scenario
   * @param {object} ctx 遅延バインド用のコンテキスト
   * @param {object} [opts]
   * @param {(cue:object)=>boolean} [opts.cueFilter]
   *   false を返したキューは再生しない。演出の調停(director)が
   *   「テキストだけ抑制して視覚は出す」といった部分再生をするために使う。
   * @returns {Playing|null}
   */
  play(scenario, ctx = {}, { cueFilter = null } = {}) {
    if (!scenario) return null;
    // 同じシナリオが走っていたら差し替える
    this.playing = this.playing.filter((p) => p.scenario.id !== scenario.id);
    if (this.playing.length >= this.maxConcurrent) this.playing.shift();

    const p = new Playing(scenario, ctx, cueFilter);
    this.playing.push(p);
    // at:0 のキューを取りこぼさないよう、その場で0msぶん進める
    this._advance(p, 0);
    return p;
  }

  /** その Playing がまだ動いているか */
  isActive(playing) {
    return Boolean(playing) && this.playing.includes(playing);
  }

  /**
   * 進行中のシナリオを早送りで終わらせる。
   * 未発火のキューは捨てる(まとめて発火させると逆に画面が荒れるため)。
   * すでに画面へ出したものには触れない。
   * @param {Playing} playing
   */
  stop(playing) {
    if (!playing) return;
    const wasActive = this.playing.includes(playing);
    for (const c of playing.cues) c.fired = true;
    playing.elapsed = Math.max(playing.elapsed, playing.maxLifetime);
    this.playing = this.playing.filter((p) => p !== playing);
    if (wasActive) this._emitFinish(playing);
  }

  /** リール停止などのイベントを待機キューへ通知する */
  notify(eventName) {
    for (const p of this.playing) p.notify(eventName);
    for (const fn of this._notifyListeners) {
      try {
        fn(eventName);
      } catch (e) {
        if (this.onError) this.onError(`notify:${eventName}`, e);
        else console.error(`[timeline] notify 転送エラー: ${eventName}`, e);
      }
    }
  }

  update(dt) {
    if (this.playing.length === 0) return;
    for (const p of this.playing) this._advance(p, dt);
    // 終わったシナリオは「これ以上キューを発火しない」だけの意味で捨てる。
    // すでに画面へ出したもの(テキスト帯・キャラ・電飾)には一切触らない。
    // duration を過ぎた瞬間にテキストを巻き添えで消すと、
    // 最低表示時間や sticky の保証が壊れてしまう。
    if (!this.playing.some((p) => p.done)) return;
    const finished = this.playing.filter((p) => p.done);
    this.playing = this.playing.filter((p) => !p.done);
    for (const p of finished) this._emitFinish(p);
  }

  /**
   * 全演出を止める。
   * 止めるのは「これから発火する予定のキュー」だけで、
   * すでに出した表示物の寿命はそれぞれの表示側(LcdAnims 等)が持つ。
   */
  clear() {
    this.playing = [];
  }

  _advance(p, dt) {
    p.elapsed += dt;
    for (const c of p.cues) {
      if (c.fired) continue;
      const { cue } = c;
      let fireAt;
      if (cue.waitFor) {
        if (c.releasedAt === null) continue;
        fireAt = c.releasedAt + (cue.after ?? 0);
      } else {
        fireAt = cue.at ?? 0;
      }
      if (p.elapsed >= fireAt) {
        c.fired = true;
        this._fire(cue, p.ctx);
      }
    }
  }

  _fire(cue, ctx) {
    const key = `${cue.layer}.${cue.action}`;
    const fn = this.actions[key];
    if (!fn) {
      console.warn(`[timeline] 未登録のアクション: ${key}`);
      return;
    }
    try {
      fn(resolveParams(cue.params ?? {}, ctx), ctx);
    } catch (e) {
      if (this.onError) this.onError(key, e);
      else console.error(`[timeline] アクション実行エラー: ${key}`, e);
    }
  }
}
