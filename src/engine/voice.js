/**
 * キャラ音声(事前生成MP3)のロード・再生。DESIGN.md 6.7
 *
 * 音声ファイルは scripts/generate-voices.mjs が Aivis Cloud API で作り、
 * assets/voices/manifest.json に key → { file, char, text } として並ぶ。
 * ブラウザ側は key でしか音声を参照しないため、ファイル名を変えても
 * シナリオ定義(src/data/scenarios/*.js)には一切波及しない。
 *
 * 設計上のポイント3つ:
 *
 * 1. AudioContext は外部から注入する(initVoice の deps)。
 *    効果音エンジン(engine/audio.js)と AudioContext / masterGain を共有して
 *    音量とミュートを一元管理するため、ここでは自前に作らない。
 *    まだ AudioContext が無い段階でも import と生成はできて、
 *    後から init() で差し込める(自動再生ポリシー対策で初回操作まで待てる)。
 *
 * 2. 音声ファイル未生成でも黙って無効化する。
 *    manifest.json が無い/壊れている/キーが載っていない場合、play() は
 *    何もせず false を返すだけでコンソールを汚さない。音が無くても
 *    ゲームは完全に成立する(演出はゲーム進行に影響しない)という前提を守る。
 *
 * 3. 同時発話は1つまで。新しいセリフが来たら前のセリフを止めて差し替える
 *    (実機の「セリフが被らない」感覚)。
 *
 * ブラウザ以外(Node)から import しても副作用が無いよう、
 * モジュールのトップレベルで window / fetch / AudioContext には触れない。
 *
 * ══ 4. 喋りすぎない(2026-08-15 U68)═══════════════════════════════
 *
 * ルナが主役になってボイスが載ったので、**間引き**をここへ入れた。
 * 音は演出より耳に残るので、毎ゲーム喋ると一気に安っぽくなる。
 *   ・chance      … 呼ばれても鳴らさないことがある(予兆・煽りの類)
 *   ・1ゲーム1本 … レバーONで解禁(beginGame)。同じゲームの2本目は黙る
 *   ・cooldown    … 直前の発話から一定時間は鳴らさない(モードをまたぐ連発対策)
 *   ・force       … 確定告知(ボーナス確定 / RUSH突入 / 引き戻し / リザルト)だけは
 *                   上の3つを全部素通しする。**情報**なので間引いてはいけない。
 *
 * ■ なぜ間引きの乱数が演出RNG(engine/rng.js)ではないのか
 *   演出RNGは「シナリオ抽選の再現性」を持っている乱数列で、
 *   ここで1回でも余分に引くと **その後のシナリオ選択が全部ズレる**
 *   (scripts/compare-drivers.mjs / sim.mjs はこの列を共有して検証している)。
 *   音は記録も検証もしない完全な出力側なので、
 *   **演出RNGを1ステップも動かさない** Math.random をあえて使う。
 *   これで「ボイスを足したら予告の出方が変わった」が構造的に起きない。
 *
 * ══ 5. 同じ場面で同じ声を繰り返さない(2026-08-15 U71)═══════════════
 *
 * 前兆は1回の当たりに何ゲームも続くので、同じ場面に同じ key を貼ると
 * 毎回まったく同じ声が鳴る。そこで **プール**(data/voicepools.js)から
 * 1本引いて鳴らせるようにした。
 *   { pool: 'react', chance: 0.25 }        … 相槌プールから1本
 *   { key: ['luna_a','luna_b'] }           … その場で並べた候補から1本
 *   { key: 'luna_rush_01', force: true }   … 従来どおりの1本指定
 * 選択も **Math.random**(上と同じ理由で演出RNGは使わない)。
 * 直前に鳴らした key は候補から外すので、2連続で同じ声にはならない。
 */

import { VOICE_POOL_KEYS } from '../data/voicepools.js';

/** 読み込みに時間がかかりすぎたセリフは、演出とズレるので鳴らさない */
const DEFAULT_STALE_MS = 2000;

/**
 * 直前の発話からこれだけ空けないと次を鳴らさない(force を除く)。
 *
 * ── 2026-08-16 U81: 4000 → 3000 ───────────────────────────────
 * 【指示】「ルナの声をもっと頻繁に」。
 * 歯止めは3つ(chance / 1ゲーム1本 / cooldown)あるが、
 * **秩序を作っているのは「1ゲーム1本」のほう**なので、そちらは動かさずに
 * ここだけを縮めた。人が打つ1ゲームは 3〜5秒なので、4000 だと
 * 「前のゲームの終わりに喋った → 次のゲームの頭が丸ごと黙る」が起きていた。
 * 3000 にすると **ゲームをまたぐ連発は止めたまま**、
 * 次のゲームの相槌は通るようになる(1ゲーム1本の上限は変わらない)。
 */
const DEFAULT_COOLDOWN_MS = 3000;

export class VoicePlayer {
  /**
   * @param {object} [opts]
   * @param {string} [opts.basePath] manifest とMP3の置き場(index.html からの相対)
   * @param {number} [opts.volume] 0〜1
   * @param {number} [opts.staleMs] ロードがこれ以上かかったら再生を諦める
   * @param {boolean} [opts.debug] true でスキップ理由をコンソールに出す
   * @param {boolean} [opts.useSpeechFallback] 音声未生成時に Web Speech API で代読する
   * @param {number} [opts.cooldownMs] 直前の発話からこれだけ空ける(force は無視)
   */
  constructor({
    basePath = './assets/voices/',
    volume = 1,
    staleMs = DEFAULT_STALE_MS,
    debug = false,
    useSpeechFallback = false,
    cooldownMs = DEFAULT_COOLDOWN_MS,
  } = {}) {
    this.basePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
    this.volume = volume;
    this.staleMs = staleMs;
    this.debug = debug;
    this.useSpeechFallback = useSpeechFallback;
    this.cooldownMs = cooldownMs;
    this.muted = false;

    /** このゲーム(レバーON〜次のレバーON)で既に喋ったか */
    this._spokeThisGame = false;
    /** 直前に発話を始めた時刻(ms)。0 は未発話 */
    this._lastSpokeAt = 0;
    /** 直前に鳴らした key(U71: 2連続で同じ声にしないための除外用) */
    this._lastKey = null;

    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {GainNode|null} */
    this.masterGain = null;
    /** @type {GainNode|null} 音声だけの音量つまみ */
    this._gain = null;

    /** @type {{voices:Object, groups:Object}|null} manifest。null は未整備 */
    this.manifest = null;
    /** manifest が読めたか(読めなければ音声機能は静かに無効) */
    this.manifestFound = false;
    /** @type {Promise<boolean>|null} */
    this._manifestPromise = null;

    /** @type {Map<string, AudioBuffer>} デコード済みキャッシュ */
    this._buffers = new Map();
    /** @type {Map<string, Promise<AudioBuffer|null>>} 読み込み中 */
    this._loading = new Map();
    /** @type {Set<string>} 読み込みに失敗した key(再試行しない) */
    this._failed = new Set();

    /** @type {AudioBufferSourceNode|null} 再生中のセリフ(同時発話1つ) */
    this._current = null;
    /** 再生要求の世代。古い要求の遅延到着を捨てるために使う */
    this._token = 0;
  }

  /**
   * AudioContext を注入する。効果音エンジンの初期化後に呼ぶ。
   * 後から呼び直して差し替えることもできる。
   * @param {object} deps
   * @param {AudioContext} [deps.audioContext]
   * @param {GainNode} [deps.masterGain] 未指定なら ctx.destination に直結
   * @param {number} [deps.volume]
   * @returns {this}
   */
  init({ audioContext = null, masterGain = null, volume } = {}) {
    if (typeof volume === 'number') this.volume = volume;
    if (audioContext && audioContext !== this.ctx) {
      this.stop();
      this.ctx = audioContext;
      this._gain = null;
      // AudioContext が変わったらデコード済みバッファは使い回せない
      this._buffers.clear();
      this._loading.clear();
    }
    if (masterGain) this.masterGain = masterGain;
    if (this.ctx && !this._gain && typeof this.ctx.createGain === 'function') {
      this._gain = this.ctx.createGain();
      this._gain.gain.value = this.muted ? 0 : this.volume;
      this._gain.connect(this.masterGain ?? this.ctx.destination);
    }
    return this;
  }

  /** 音声を鳴らせる状態か(AudioContext があり manifest も読めている) */
  get enabled() {
    return Boolean(this.ctx && this.manifestFound && this.manifest);
  }

  /**
   * manifest.json を読む。無い場合(404・JSON壊れ)は静かに無効化する。
   * ネットワークタブに404が1件出るのは想定内で、コンソールには何も出さない。
   * @returns {Promise<boolean>} 読めたか
   */
  loadManifest() {
    if (this._manifestPromise) return this._manifestPromise;
    this._manifestPromise = (async () => {
      if (typeof fetch !== 'function') return false;
      try {
        const res = await fetch(`${this.basePath}manifest.json`, { cache: 'no-cache' });
        if (!res.ok) return false;
        const json = await res.json();
        if (!json || typeof json.voices !== 'object' || json.voices === null) return false;
        this.manifest = { voices: json.voices, groups: json.groups ?? {} };
        this.manifestFound = true;
        if (this.debug) {
          console.info(`[voice] manifest 読込: ${Object.keys(json.voices).length}件`);
        }
        return true;
      } catch {
        return false;
      }
    })();
    return this._manifestPromise;
  }

  /** manifest 上のエントリを引く。未整備・未登録なら null */
  entry(key) {
    return this.manifest?.voices?.[key] ?? null;
  }

  /** 登録済みの key 一覧(デバッグ用) */
  keys() {
    return Object.keys(this.manifest?.voices ?? {});
  }

  /**
   * モード突入時の遅延プリロード。
   * 起動時に全MP3をデコードすると重いので、そのモードで使うぶんだけ先読みする。
   * manifest の groups(生成スクリプトが PHRASES の modes から出力)を引く。
   * @param {string} modeId 例: 'CZ' / 'AS_RUSH'
   * @returns {Promise<void>}
   */
  async preloadMode(modeId) {
    if (!modeId) return;
    await this.loadManifest();
    const keys = this.manifest?.groups?.[modeId];
    if (!Array.isArray(keys) || keys.length === 0) return;
    await this.preload(keys);
  }

  /**
   * 指定 key を先読みしてデコードまで済ませる。失敗しても静かに諦める。
   * @param {string[]} keys
   * @returns {Promise<void>}
   */
  async preload(keys) {
    if (!Array.isArray(keys) || keys.length === 0) return;
    await this.loadManifest();
    if (!this.enabled) return;
    await Promise.all(keys.map((k) => this._load(k)));
  }

  /**
   * 1ゲームの区切り(レバーON)。「同じゲームで2本喋らない」の解禁を行う。
   * main.js の leverOn 配線から呼ぶ。呼ばれなくても cooldown 側で守られる。
   */
  beginGame() {
    this._spokeThisGame = false;
  }

  /**
   * 候補から実際に鳴らす1本を選ぶ(U71)。
   *
   *   'luna_x'                  … そのまま
   *   ['luna_a','luna_b']       … どれか1本
   *   opts.pool:'react'         … data/voicepools.js の束から1本
   *
   * 直前に鳴らした key は候補から外す(全部が直前と同じなら諦めてそれを返す)。
   * 乱数は Math.random = **演出RNGを1ステップも動かさない**(冒頭 4. の理由)。
   *
   * @param {string|string[]|null} key
   * @param {{pool?:string}} [opts]
   * @returns {string|null}
   */
  pick(key, opts = {}) {
    let candidates = null;
    if (Array.isArray(key)) candidates = key;
    else if (typeof key === 'string' && key) candidates = [key];
    else if (opts.pool) candidates = VOICE_POOL_KEYS[opts.pool] ?? null;
    if (!candidates || candidates.length === 0) return null;

    const usable = candidates.filter((k) => typeof k === 'string' && k);
    if (usable.length === 0) return null;
    if (usable.length === 1) return usable[0];

    const fresh = usable.filter((k) => k !== this._lastKey);
    const from = fresh.length > 0 ? fresh : usable;
    return from[Math.floor(Math.random() * from.length)];
  }

  /**
   * セリフを再生する。同時発話は1つまでで、鳴っている途中なら差し替える。
   * 音声が無い/未整備でも例外は投げず、黙って false を返す。
   *
   * @param {string|string[]|null} key
   *   key 直指定 / その場の候補配列 / null(opts.pool を使う)
   * @param {object} [opts] シナリオの voice.play キューの params がそのまま届く
   * @param {string} [opts.pool] data/voicepools.js のプール名(U71)
   * @param {number} [opts.chance] 0〜1。省略時は必ず鳴らそうとする
   * @param {boolean} [opts.force] true で間引き(chance / 1ゲーム1本 / cooldown)を全部素通し。
   *   **確定告知にだけ付ける**(ボーナス確定・RUSH突入・引き戻し成功・リザルト)
   * @param {number} [opts.cooldownMs] このセリフだけ cooldown を変える
   * @returns {string|false} 実際に鳴らす(ロードを始めた)key。鳴らさないときは false
   */
  play(keyOrList, opts = {}) {
    if (this.muted) return false;
    const key = this.pick(keyOrList, opts);
    if (!key) return false;
    /*
     * 未生成のキーはここで打ち切る(間引きの記帳より **前**)。
     * 順序が逆だと「MP3が無いセリフ」が 1ゲーム1本の枠と cooldown を食ってしまい、
     * その後に来た本物のセリフが黙る = 音が減った理由が誰にも分からなくなる。
     * manifest 未読(manifestFound=false)のときは下の分岐が読み込みへ回す。
     */
    if (this.manifestFound && !this.entry(key)) {
      if (this.debug) console.info(`[voice] skip(manifest未登録): ${key}`);
      return this._speakFallback(key) ? key : false;
    }
    if (!this._admit(opts)) return false;
    // 次に同じプールを引いたとき、この1本は候補から外れる(2連続で同じ声にしない)
    this._lastKey = key;

    const token = ++this._token;

    if (!this.ctx) {
      // AudioContext 未注入。効果音エンジンの初期化前に演出が走ったケース
      if (this.debug) console.info(`[voice] skip(no AudioContext): ${key}`);
      return false;
    }
    if (!this.manifestFound) {
      // manifest 未読の可能性があるので、読んでから間に合えば鳴らす
      this.loadManifest().then((ok) => {
        if (ok && token === this._token) this._playWhenReady(key, token, performance.now());
      });
      return false;
    }

    const cached = this._buffers.get(key);
    if (cached) {
      this._start(cached);
      return key;
    }
    if (!this.entry(key)) {
      if (this.debug) console.info(`[voice] skip(manifest未登録): ${key}`);
      return this._speakFallback(key) ? key : false;
    }
    this._playWhenReady(key, token, performance.now());
    return key;
  }

  /** 再生中のセリフを止める */
  stop() {
    if (!this._current) return;
    try { this._current.stop(); } catch { /* 既に停止済み */ }
    this._current = null;
  }

  /** @param {number} v 0〜1 */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this._gain) this._gain.gain.value = this.muted ? 0 : this.volume;
  }

  /** @param {boolean} on */
  setMuted(on) {
    this.muted = Boolean(on);
    if (this.muted) this.stop();
    if (this._gain) this._gain.gain.value = this.muted ? 0 : this.volume;
  }

  /**
   * EventBus を購読して自動運転する(任意)。
   *   modeEnter … そのモードで使うセリフのプリロード
   *   leverOn   … 1ゲーム1本の解禁(beginGame)
   * engine 層なので EventBus のインターフェース(on)しか触らない。
   * @param {{on:(event:string, fn:Function)=>Function}} bus
   * @returns {()=>void} 解除関数
   */
  attachBus(bus) {
    if (!bus || typeof bus.on !== 'function') return () => {};
    const offMode = bus.on('modeEnter', (p) => { this.preloadMode(p?.id); });
    const offLever = bus.on('leverOn', () => { this.beginGame(); });
    return () => { offMode?.(); offLever?.(); };
  }

  // ── 内部 ──────────────────────────────────

  /**
   * 喋ってよいかの調停(U68)。
   * 通ったら「喋った」ことにして記帳する(実際に音が出るかは manifest 次第だが、
   * 記帳しないと未生成キーの呼び出しで1ゲーム1本の枠が無限に空いてしまう)。
   * @param {object} opts play() の第2引数
   * @returns {boolean}
   */
  _admit({ chance, force = false, cooldownMs } = {}) {
    if (force) {
      this._mark();
      return true;
    }
    if (this._spokeThisGame) {
      if (this.debug) console.info('[voice] skip(このゲームは発話済み)');
      return false;
    }
    const cd = cooldownMs ?? this.cooldownMs;
    if (cd > 0 && this._lastSpokeAt > 0 && this._now() - this._lastSpokeAt < cd) {
      if (this.debug) console.info('[voice] skip(cooldown)');
      return false;
    }
    // 演出RNGは使わない(ファイル冒頭 4. の理由)
    if (typeof chance === 'number' && chance < 1 && Math.random() >= chance) return false;
    this._mark();
    return true;
  }

  /** 発話を記帳する */
  _mark() {
    this._spokeThisGame = true;
    this._lastSpokeAt = this._now();
  }

  /** performance.now が無い環境(Node のテスト)でも動くようにしておく */
  _now() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  async _playWhenReady(key, token, requestedAt) {
    const buffer = await this._load(key);
    if (!buffer) return;
    // 別のセリフが後から来ていたら、こちらは捨てる(同時発話1つの原則)
    if (token !== this._token) return;
    // 読み込みに時間がかかりすぎた場合も、演出とズレるので鳴らさない
    if (performance.now() - requestedAt > this.staleMs) {
      if (this.debug) console.info(`[voice] skip(遅延): ${key}`);
      return;
    }
    this._start(buffer);
  }

  /** @returns {Promise<AudioBuffer|null>} */
  _load(key) {
    if (this._buffers.has(key)) return Promise.resolve(this._buffers.get(key));
    if (this._failed.has(key)) return Promise.resolve(null);
    const existing = this._loading.get(key);
    if (existing) return existing;

    const entry = this.entry(key);
    if (!entry || !this.ctx || typeof fetch !== 'function') return Promise.resolve(null);

    const task = (async () => {
      try {
        const res = await fetch(this._url(entry), { cache: 'force-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.arrayBuffer();
        if (raw.byteLength === 0) throw new Error('empty');
        const buffer = await this._decode(raw);
        this._buffers.set(key, buffer);
        return buffer;
      } catch (e) {
        // 1本欠けてもゲームは続くので、静かに諦めて以後は試さない
        this._failed.add(key);
        if (this.debug) console.info(`[voice] load失敗: ${key}`, e);
        return null;
      } finally {
        this._loading.delete(key);
      }
    })();
    this._loading.set(key, task);
    return task;
  }

  /** manifest の file は基本ファイル名。パス区切りを含む場合はそのまま使う */
  _url(entry) {
    const file = entry.file ?? '';
    if (file.includes('/')) return this.basePath + file;
    return `${this.basePath}${entry.char}/${file}`;
  }

  /** decodeAudioData は Safari で Promise を返さない実装があるのでコールバックも受ける */
  _decode(arrayBuffer) {
    return new Promise((res, rej) => {
      const maybe = this.ctx.decodeAudioData(arrayBuffer, res, rej);
      if (maybe && typeof maybe.then === 'function') maybe.then(res, rej);
    });
  }

  _start(buffer) {
    if (!this.ctx || this.muted) return;
    // 自動再生ポリシーで suspended のままなら再開を試みる(失敗は無視)
    if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      this.ctx.resume().catch(() => {});
    }
    if (!this._gain) this.init({});
    this.stop();

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this._gain ?? this.ctx.destination);
    src.onended = () => { if (this._current === src) this._current = null; };
    this._current = src;
    try {
      src.start();
    } catch {
      this._current = null;
    }
  }

  /**
   * 音声ファイルが無いときの暫定フォールバック(DESIGN.md 6.7)。
   * キャラボイスにはならないので既定はOFF。開発中に台詞を確認したいときだけ使う。
   */
  _speakFallback(key) {
    if (!this.useSpeechFallback) return false;
    const synth = globalThis.speechSynthesis;
    const Utterance = globalThis.SpeechSynthesisUtterance;
    const text = this.entry(key)?.text ?? '';
    if (!synth || !Utterance || !text) return false;
    try {
      synth.cancel();
      const u = new Utterance(text);
      u.lang = 'ja-JP';
      synth.speak(u);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * VoicePlayer を作って manifest の読み込みを開始する。
 *
 *   const voice = initVoice({ audioContext: audio.ctx, masterGain: audio.master });
 *   voice.play('kiro_cz_start_01');
 *
 * AudioContext がまだ無い段階で呼んでも構わない(後から voice.init({...}) で注入)。
 * @param {object} [deps]
 * @param {AudioContext} [deps.audioContext]
 * @param {GainNode} [deps.masterGain]
 * @param {string} [deps.basePath]
 * @param {number} [deps.volume]
 * @param {boolean} [deps.debug]
 * @param {boolean} [deps.useSpeechFallback]
 * @returns {VoicePlayer}
 */
export function initVoice({
  audioContext = null,
  masterGain = null,
  basePath,
  volume,
  debug = false,
  useSpeechFallback = false,
} = {}) {
  const player = new VoicePlayer({ basePath, volume, debug, useSpeechFallback });
  player.init({ audioContext, masterGain, volume });
  // 起動をブロックしないよう、manifest 読込は投げっぱなしにする
  player.loadManifest();
  return player;
}
