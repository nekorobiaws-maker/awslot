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
 */

/** 読み込みに時間がかかりすぎたセリフは、演出とズレるので鳴らさない */
const DEFAULT_STALE_MS = 2000;

export class VoicePlayer {
  /**
   * @param {object} [opts]
   * @param {string} [opts.basePath] manifest とMP3の置き場(index.html からの相対)
   * @param {number} [opts.volume] 0〜1
   * @param {number} [opts.staleMs] ロードがこれ以上かかったら再生を諦める
   * @param {boolean} [opts.debug] true でスキップ理由をコンソールに出す
   * @param {boolean} [opts.useSpeechFallback] 音声未生成時に Web Speech API で代読する
   */
  constructor({
    basePath = './assets/voices/',
    volume = 1,
    staleMs = DEFAULT_STALE_MS,
    debug = false,
    useSpeechFallback = false,
  } = {}) {
    this.basePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
    this.volume = volume;
    this.staleMs = staleMs;
    this.debug = debug;
    this.useSpeechFallback = useSpeechFallback;
    this.muted = false;

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
   * セリフを再生する。同時発話は1つまでで、鳴っている途中なら差し替える。
   * 音声が無い/未整備でも例外は投げず、黙って false を返す。
   * @param {string} key
   * @returns {boolean} 再生(またはロード開始)したか
   */
  play(key) {
    if (!key || typeof key !== 'string') return false;
    if (this.muted) return false;

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
      return true;
    }
    if (!this.entry(key)) {
      if (this.debug) console.info(`[voice] skip(manifest未登録): ${key}`);
      return this._speakFallback(key);
    }
    this._playWhenReady(key, token, performance.now());
    return true;
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
   * EventBus の modeEnter を購読して自動プリロードする(任意)。
   * engine 層なので EventBus のインターフェース(on)しか触らない。
   * @param {{on:(event:string, fn:Function)=>Function}} bus
   * @returns {()=>void} 解除関数
   */
  attachBus(bus) {
    if (!bus || typeof bus.on !== 'function') return () => {};
    return bus.on('modeEnter', (p) => { this.preloadMode(p?.id); });
  }

  // ── 内部 ──────────────────────────────────

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
