/**
 * Web Audio エンジン(効果音の合成 + BGM簡易シーケンサ)。DESIGN.md 6.6
 *
 * ・AudioContext はシングルトン。マスターGainで音量とミュートを一元管理する
 * ・発音ごとに Oscillator / ノイズBuffer + ADSR用Gain + BiquadFilter を生成し、
 *   鳴り終わったら onended で自動的に disconnect する(ノードを溜め込まない)
 * ・BGM はコード進行とパターンのデータ(data/sfx-presets.js)を
 *   16分音符グリッドで先読みスケジュールする。モード遷移ではクロスフェードで切り替える
 *
 * 【遅延初期化】
 * import しただけでは AudioContext を作らない。window が無い環境(Node)でも
 * このモジュールは安全に import できる。
 * 【重要】AudioContext を生成するのは resume()(= unlockOnFirstGesture 経由)だけ。
 * playPreset() / changeBgm() は既存の this.ctx しか見ず、無ければ鳴らさない(BGMは予約する)。
 * こうしないとブラウザの自動再生ポリシーに引っかかり、
 * クリック前に suspended な AudioContext が出来てしまう(DESIGN.md 注意事項2)。
 *
 * 【データとの関係】
 * プリセットとBGMのデータは data/sfx-presets.js から既定値として読み込むが、
 * コンストラクタで差し替えできる(テスト時に無音データを渡す等)。
 */

import {
  SFX_PRESETS, SFX_ALIASES, BGM_PATTERNS, BGM_ALIASES,
} from '../data/sfx-presets.js';

/** 1小節あたりのステップ数(16分音符) */
const STEPS_PER_BAR = 16;
/** スケジューラの起動間隔(ms) */
const SCHED_INTERVAL_MS = 25;
/** 何秒先まで先読みして予約するか */
const LOOKAHEAD_SEC = 0.14;
/** 同時発音数の上限(これを超える発音は捨てる) */
const MAX_VOICES = 64;
/** 1回のスケジュールで進めるステップ数の上限(タブ復帰時の暴走よけ) */
const MAX_STEPS_PER_TICK = 64;

/** ドラムの音色定義。BGMパターンの 'x'(強打) / 'o'(弱打) で鳴る */
const DRUM_VOICES = {
  kick: [
    { type: 'sine', freqFrom: 150, freqTo: 45, dur: 0.22, env: { a: 0.001, d: 0.20, s: 0, r: 0.03 }, gain: 0.85 },
    { type: 'noise', dur: 0.03, env: { a: 0.001, d: 0.02, s: 0, r: 0.01 }, filter: { type: 'lowpass', freq: 1800 }, gain: 0.22 },
  ],
  snare: [
    { type: 'noise', dur: 0.15, env: { a: 0.001, d: 0.13, s: 0, r: 0.03 }, filter: { type: 'bandpass', freq: 1900, q: 0.9 }, gain: 0.42 },
    { type: 'triangle', freqFrom: 320, freqTo: 180, dur: 0.10, env: { a: 0.001, d: 0.09, s: 0, r: 0.02 }, gain: 0.16 },
  ],
  hat: [
    { type: 'noise', dur: 0.05, env: { a: 0.001, d: 0.04, s: 0, r: 0.012 }, filter: { type: 'highpass', freq: 7000 }, gain: 0.20 },
  ],
};

const DRUM_KINDS = Object.keys(DRUM_VOICES);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** MIDIノート番号 → Hz */
export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * コード構成音の index から MIDIノート番号を作る。
 * index が構成音数を超えたら自動的にオクターブ上へ回る。
 */
function chordNote(chord, index, octaveSemitones) {
  const n = chord.notes.length;
  const oct = Math.floor(index / n);
  const deg = ((index % n) + n) % n;
  return chord.root + chord.notes[deg] + oct * 12 + octaveSemitones;
}

/**
 * ADSR を GainNode に流し込む。
 * exponentialRamp は 0 を扱えないので、全て linearRamp で組む。
 * @returns {number} 発音が完全に終わる時刻
 */
function applyEnvelope(param, t0, dur, env, peak) {
  const a = Math.max(0.001, env.a ?? 0.005);
  const d = Math.max(0.001, env.d ?? 0.05);
  const s = clamp(env.s ?? 0, 0, 1);
  const r = Math.max(0.005, env.r ?? 0.05);
  const sustain = peak * s;
  const decayEnd = t0 + a + d;
  const bodyEnd = Math.max(t0 + dur, decayEnd);

  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(peak, t0 + a);
  param.linearRampToValueAtTime(sustain, decayEnd);
  if (bodyEnd > decayEnd) param.setValueAtTime(sustain, bodyEnd);
  param.linearRampToValueAtTime(0, bodyEnd + r);
  return bodyEnd + r;
}

export class AudioEngine {
  /**
   * @param {object} [opts]
   * @param {number} [opts.volume]     マスター音量 0〜1
   * @param {number} [opts.sfxVolume]  効果音バスの音量
   * @param {number} [opts.bgmVolume]  BGMバスの音量
   * @param {boolean} [opts.muted]     初期ミュート状態
   * @param {object} [opts.presets]    効果音プリセット(既定 SFX_PRESETS)
   * @param {object} [opts.bgms]       BGMパターン(既定 BGM_PATTERNS)
   */
  constructor({
    volume = 0.7,
    sfxVolume = 1.0,
    bgmVolume = 0.75,
    muted = false,
    presets = SFX_PRESETS,
    bgms = BGM_PATTERNS,
    sfxAliases = SFX_ALIASES,
    bgmAliases = BGM_ALIASES,
  } = {}) {
    this.presets = { ...presets };
    this.bgms = { ...bgms };
    this.sfxAliases = { ...sfxAliases };
    this.bgmAliases = { ...bgmAliases };

    this.volume = clamp(volume, 0, 1);
    this.sfxVolume = clamp(sfxVolume, 0, 1);
    this.bgmVolume = clamp(bgmVolume, 0, 1);
    this.muted = !!muted;

    /** @type {AudioContext|null} */
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.bgmBus = null;

    /** 現在鳴っているBGM名(null = 無音) */
    this.currentBgm = null;
    /** ctx が動き出したら流すBGM。undefined = 予約なし */
    this._pendingBgm = undefined;

    /** @type {object[]} 再生中のBGMトラック(クロスフェード中は2本になる) */
    this._tracks = [];
    this._timer = null;
    this._noiseBuffer = null;
    this._voices = 0;
    this._unavailable = false;
    this._unlocked = false;
    /** 同じ警告を何度も出さないための記録 */
    this._warned = new Set();
  }

  // ── 初期化・ライフサイクル ─────────────────────────

  /** Web Audio が使える環境か(AudioContext を作らずに判定) */
  get supported() {
    if (typeof window === 'undefined') return false;
    return typeof (window.AudioContext ?? window.webkitAudioContext) === 'function';
  }

  /** 音が今すぐ出せる状態か */
  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /**
   * AudioContext を1つだけ生成する。
   * 【呼び出しは resume() からのみ】= 初回ユーザー操作より前には走らせない。
   * 音を出す側(playPreset / changeBgm)からは呼ばないこと。
   * @returns {AudioContext|null} 使えない環境では null
   */
  ensure() {
    if (this.ctx) return this.ctx;
    if (this._unavailable) return null;
    if (!this.supported) {
      this._unavailable = true;
      console.info('[audio] Web Audio が使えない環境のため、音は無効になります');
      return null;
    }
    try {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      const ctx = new Ctor();
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(ctx.destination);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume;
      this.sfxBus.connect(this.master);

      this.bgmBus = ctx.createGain();
      this.bgmBus.gain.value = this.bgmVolume;
      this.bgmBus.connect(this.master);

      return ctx;
    } catch (e) {
      this._unavailable = true;
      console.warn('[audio] AudioContext の生成に失敗しました', e);
      return null;
    }
  }

  /**
   * 自動再生ポリシー対策。初回のユーザー操作から呼ぶ。
   * @returns {Promise<boolean>} 音が出せる状態になったか
   */
  async resume() {
    const ctx = this.ensure();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* 操作起点でなければ失敗する。次の操作で再試行される */ }
    }
    if (ctx.state === 'running' && this._pendingBgm !== undefined) {
      const next = this._pendingBgm;
      this._pendingBgm = undefined;
      this.changeBgm(next, { fadeMs: 400 });
    }
    return ctx.state === 'running';
  }

  /**
   * 最初のユーザー操作(クリック/キー/タッチ)で自動的に resume する。
   * main.js から1回呼んでおけば、ボタン配線を気にしなくてよくなる。
   * @param {EventTarget} [target]
   */
  unlockOnFirstGesture(target = typeof window !== 'undefined' ? window : null) {
    if (!target || this._unlocked) return this;
    this._unlocked = true;
    const events = ['pointerdown', 'keydown', 'touchstart'];
    // capture フェーズで捕まえる。こうしないと、キャビネット要素に付いている
    // ゲーム側のハンドラ(bet/lever の効果音)の方が先に走り、
    // AudioContext がまだ無いせいで初回操作の音だけ鳴らない。
    const opts = { passive: true, capture: true };
    const handler = () => {
      // AudioContext を生成してよい唯一の経路。ここだけが ensure() を通る。
      this.resume().then((ok) => {
        if (ok) events.forEach((ev) => target.removeEventListener(ev, handler, opts));
      });
    };
    events.forEach((ev) => target.addEventListener(ev, handler, opts));
    return this;
  }

  /** タブ非表示などで一時停止したいとき */
  async suspend() {
    if (this.ctx && this.ctx.state === 'running') {
      try { await this.ctx.suspend(); } catch { /* noop */ }
    }
  }

  /** 全部止めて AudioContext を閉じる(通常は呼ばない) */
  dispose() {
    this._stopScheduler();
    for (const track of this._tracks) {
      try { track.gain.disconnect(); } catch { /* noop */ }
    }
    this._tracks = [];
    this.currentBgm = null;
    if (this.ctx) {
      try { this.ctx.close(); } catch { /* noop */ }
    }
    this.ctx = null;
    this.master = this.sfxBus = this.bgmBus = null;
  }

  // ── 音量・ミュート ───────────────────────────────

  /** @param {number} v 0〜1 */
  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    this._applyMasterGain();
    return this.volume;
  }

  setSfxVolume(v) {
    this.sfxVolume = clamp(v, 0, 1);
    if (this.sfxBus) this._ramp(this.sfxBus.gain, this.sfxVolume);
    return this.sfxVolume;
  }

  setBgmVolume(v) {
    this.bgmVolume = clamp(v, 0, 1);
    if (this.bgmBus) this._ramp(this.bgmBus.gain, this.bgmVolume);
    return this.bgmVolume;
  }

  /** @param {boolean} on */
  setMuted(on) {
    this.muted = !!on;
    this._applyMasterGain();
    return this.muted;
  }

  /** @returns {boolean} 切り替え後のミュート状態 */
  toggleMute() {
    return this.setMuted(!this.muted);
  }

  _applyMasterGain() {
    if (this.master) this._ramp(this.master.gain, this.muted ? 0 : this.volume);
  }

  _ramp(param, value, sec = 0.06) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(value, now + sec);
    } catch {
      param.value = value;
    }
  }

  // ── 効果音 ────────────────────────────────────

  /** プリセットを後から追加・上書きする */
  registerPresets(presets) {
    Object.assign(this.presets, presets);
    return this;
  }

  /** 別名を解決する */
  resolvePresetName(name) {
    if (!name) return null;
    if (this.presets[name]) return name;
    const alias = this.sfxAliases[name];
    return alias && this.presets[alias] ? alias : null;
  }

  /**
   * 効果音を1発鳴らす。
   * @param {string} name プリセット名(SFX_ALIASES の別名も可)
   * @param {object} [opts]
   * @param {number} [opts.step]      動的ピッチ用のステップ番号(payout_tick 等)
   * @param {number} [opts.semitones] 半音単位の音程オフセット
   * @param {number} [opts.gain]      音量倍率(既定1)
   * @param {number} [opts.rate]      速度倍率。2 で倍速(音は短くなる)
   * @param {number} [opts.delay]     発音を遅らせる秒数
   * @param {number} [opts.pan]       -1〜1
   * @returns {boolean} 実際に発音を予約したか
   */
  playPreset(name, opts = {}) {
    if (this.muted) return false;
    const key = this.resolvePresetName(name);
    if (!key) {
      this._warnOnce(`sfx:${name}`, `[audio] 未定義の効果音プリセット: ${name}`);
      return false;
    }
    // AudioContext は初回ユーザー操作(resume)まで作らない。
    // ここで ensure() を呼ぶと、起動直後のBGM/効果音要求だけで
    // クリック前に AudioContext が生まれてしまう(DESIGN.md 注意事項2 / 6.6)。
    const ctx = this.ctx;
    if (!ctx) return false;
    if (ctx.state !== 'running') {
      // タブ復帰直後などで停止中。resume を試みて今回の音は捨てる
      this.resume();
      return false;
    }

    const preset = this.presets[key];
    const rate = opts.rate && opts.rate > 0 ? opts.rate : 1;
    const gainMul = (opts.gain ?? 1) * (preset.gain ?? 1);
    const semitones = this._semitonesFor(preset, opts);
    const start = ctx.currentTime + Math.max(0, opts.delay ?? 0);

    for (const voice of preset.voices ?? []) {
      const times = Math.max(1, voice.repeat?.times ?? 1);
      const interval = voice.repeat?.interval ?? 0.2;
      for (let i = 0; i < times; i++) {
        this._playVoice(voice, start + (i * interval) / rate, this.sfxBus, {
          gain: gainMul, semitones, rate, pan: opts.pan,
        });
      }
    }
    return true;
  }

  /** 動的パラメータから半音オフセットを求める(払出音のピッチ上昇など) */
  _semitonesFor(preset, opts) {
    let semi = opts.semitones ?? 0;
    const dyn = preset.dynamic;
    if (dyn && opts.step != null && Number.isFinite(opts.step)) {
      const max = dyn.maxSteps ?? 24;
      const step = clamp(Math.floor(opts.step), 0, max);
      semi += step * (dyn.stepSemitones ?? 0);
    }
    return semi;
  }

  /**
   * ボイス1つを組み立てて予約する。鳴り終わったノードは自動破棄。
   * @param {object} v ボイス定義
   * @param {number} startTime AudioContext の時刻
   * @param {AudioNode} dest 出力先
   */
  _playVoice(v, startTime, dest, { gain = 1, semitones = 0, rate = 1, pan = null } = {}) {
    const ctx = this.ctx;
    if (!ctx || !dest) return;
    if (this._voices >= MAX_VOICES) return;

    const peak = Math.max(0, (v.gain ?? 0.2) * gain);
    if (peak <= 0.0001) return;

    const dur = Math.max(0.01, (v.dur ?? 0.15) / rate);
    const t0 = startTime + (v.delay ?? 0) / rate;
    const pitchMul = v.fixedPitch ? 1 : Math.pow(2, semitones / 12);

    /** @type {AudioNode[]} 後で disconnect する対象 */
    const nodes = [];
    const gainNode = ctx.createGain();
    const endTime = applyEnvelope(gainNode.gain, t0, dur, v.env ?? {}, peak);
    nodes.push(gainNode);

    let source;
    if (v.type === 'noise') {
      source = ctx.createBufferSource();
      source.buffer = this._noise();
      source.loop = true;
      if (v.rate) source.playbackRate.value = v.rate;
    } else {
      source = ctx.createOscillator();
      source.type = v.type ?? 'sine';
      const from = Math.max(1, (v.freqFrom ?? v.freq ?? 440) * pitchMul);
      source.frequency.setValueAtTime(from, t0);
      if (v.freqTo != null) {
        const to = Math.max(1, v.freqTo * pitchMul);
        if ((v.sweep ?? 'exp') === 'lin') source.frequency.linearRampToValueAtTime(to, t0 + dur);
        else source.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      }
      if (v.detune) source.detune.setValueAtTime(v.detune, t0);
    }
    nodes.push(source);

    let head = source;
    if (v.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = v.filter.type ?? 'lowpass';
      filter.frequency.setValueAtTime(Math.max(20, v.filter.freq ?? 1000), t0);
      if (v.filter.freqTo != null) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, v.filter.freqTo), t0 + dur);
      }
      if (v.filter.q != null) filter.Q.value = v.filter.q;
      head.connect(filter);
      head = filter;
      nodes.push(filter);
    }
    head.connect(gainNode);

    let tail = gainNode;
    const panValue = pan ?? v.pan;
    if (panValue != null && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(panValue, -1, 1);
      gainNode.connect(panner);
      tail = panner;
      nodes.push(panner);
    }
    tail.connect(dest);

    this._voices++;
    source.onended = () => {
      this._voices--;
      for (const n of nodes) {
        try { n.disconnect(); } catch { /* noop */ }
      }
    };

    try {
      if (v.type === 'noise') {
        // 毎回違う位置から読むことで、同じ音の連打でも質感が揃いすぎない
        source.start(t0, Math.random() * 1.5);
      } else {
        source.start(t0);
      }
      source.stop(endTime + 0.02);
    } catch (e) {
      this._voices--;
      for (const n of nodes) {
        try { n.disconnect(); } catch { /* noop */ }
      }
      this._warnOnce('start', `[audio] 発音に失敗しました: ${e?.message ?? e}`);
    }
  }

  /** ホワイトノイズのバッファ(使い回す) */
  _noise() {
    if (this._noiseBuffer) return this._noiseBuffer;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
    return buf;
  }

  // ── BGM ──────────────────────────────────────

  /** BGMパターンを後から追加・上書きする */
  registerBgm(bgms) {
    Object.assign(this.bgms, bgms);
    return this;
  }

  /** @returns {string|null} 解決後のBGM名。停止指定なら null */
  resolveBgmName(name) {
    if (!name || name === 'none' || name === 'off' || name === 'stop') return null;
    if (this.bgms[name]) return name;
    const alias = this.bgmAliases[name];
    if (alias && this.bgms[alias]) return alias;
    this._warnOnce(`bgm:${name}`, `[audio] 未定義のBGM: ${name}`);
    return null;
  }

  /**
   * BGMを切り替える(クロスフェード)。同じ曲なら何もしない。
   * ユーザー操作前に呼ばれた場合は予約だけして、resume() 時に流し始める。
   * @param {string|null} name
   * @param {{fadeMs?:number}} [opts]
   */
  changeBgm(name, { fadeMs = 800 } = {}) {
    const target = this.resolveBgmName(name);
    const current = this._pendingBgm !== undefined ? this._pendingBgm : this.currentBgm;
    if (target === current) return target;

    // playPreset と同様、ここでも AudioContext は作らない。
    // 未生成なら予約だけして、初回ユーザー操作の resume() で流し始める。
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') {
      this._pendingBgm = target;
      if (ctx) this.resume();
      return target;
    }
    this._pendingBgm = undefined;

    const fade = Math.max(0.02, fadeMs / 1000);
    const now = ctx.currentTime;

    // 既存トラックをフェードアウト(鳴らしたまま重ねるのでクロスフェードになる)
    for (const track of this._tracks) {
      if (track.fading) continue;
      track.fading = true;
      track.endAt = now + fade;
      this._ramp(track.gain.gain, 0, fade);
    }

    if (target) {
      const track = this._makeTrack(target, this.bgms[target]);
      this._tracks.push(track);
      this._ramp(track.gain.gain, track.level, fade);
      this._startScheduler();
    }
    this.currentBgm = target;
    return target;
  }

  /** BGMを止める */
  stopBgm({ fadeMs = 600 } = {}) {
    return this.changeBgm(null, { fadeMs });
  }

  _makeTrack(name, def) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.bgmBus);
    const bpm = def.bpm > 0 ? def.bpm : 120;
    return {
      name,
      def,
      gain,
      level: clamp(def.gain ?? 0.3, 0, 1),
      stepDur: 60 / bpm / (STEPS_PER_BAR / 4),
      totalSteps: Math.max(1, (def.chords?.length ?? 1) * STEPS_PER_BAR),
      step: 0,
      nextTime: ctx.currentTime + 0.06,
      fading: false,
      endAt: Infinity,
    };
  }

  _startScheduler() {
    if (this._timer != null) return;
    this._timer = setInterval(() => this._tick(), SCHED_INTERVAL_MS);
  }

  _stopScheduler() {
    if (this._timer == null) return;
    clearInterval(this._timer);
    this._timer = null;
  }

  /** 先読みスケジューラ本体。setInterval は「いつ予約するか」だけを決め、発音時刻は ctx の時計で決める */
  _tick() {
    const ctx = this.ctx;
    if (!ctx) { this._stopScheduler(); return; }
    if (ctx.state !== 'running') return;

    const now = ctx.currentTime;
    const until = now + LOOKAHEAD_SEC;
    const silent = this.muted;

    for (const track of this._tracks) {
      // タブが裏に回るなどして大きく遅れたら、現在時刻に合わせ直す
      if (track.nextTime < now - 0.5) track.nextTime = now + 0.05;
      let guard = 0;
      while (track.nextTime < until && guard++ < MAX_STEPS_PER_TICK) {
        if (!silent) this._scheduleStep(track, track.step, track.nextTime);
        track.step = (track.step + 1) % track.totalSteps;
        track.nextTime += track.stepDur;
      }
    }

    // フェードし切ったトラックを片付ける
    for (let i = this._tracks.length - 1; i >= 0; i--) {
      const track = this._tracks[i];
      if (track.fading && now > track.endAt + 0.3) {
        try { track.gain.disconnect(); } catch { /* noop */ }
        this._tracks.splice(i, 1);
      }
    }
    if (this._tracks.length === 0) this._stopScheduler();
  }

  /** 1ステップぶんのノートとドラムを予約する */
  _scheduleStep(track, step, time) {
    const def = track.def;
    const chords = def.chords ?? [];
    const chord = chords.length > 0
      ? chords[Math.floor(step / STEPS_PER_BAR) % chords.length]
      : null;
    const transpose = def.transpose ?? 0;

    for (const part of def.parts ?? []) {
      const steps = part.steps;
      if (!Array.isArray(steps) || steps.length === 0) continue;
      const value = steps[step % steps.length];
      if (value == null) continue;
      if (!chord) continue;

      const octave = part.octave ?? 0;
      const notes = [];
      if (part.chordAll) {
        for (let i = 0; i < chord.notes.length; i++) {
          notes.push(chordNote(chord, i, octave) + transpose);
        }
      } else if (part.pitchMode === 'semitone') {
        notes.push(chord.root + value + octave + transpose);
      } else {
        notes.push(chordNote(chord, value, octave) + transpose);
      }

      // 和音は重なるぶん音量を落とす
      const spread = notes.length > 1 ? 1 / Math.sqrt(notes.length) : 1;
      const dur = (part.durSteps ?? 0.9) * track.stepDur;
      for (const midi of notes) {
        this._playVoice({
          type: part.type ?? 'triangle',
          freq: midiToFreq(midi),
          dur,
          env: part.env ?? { a: 0.01, d: 0.10, s: 0.3, r: 0.10 },
          gain: (part.gain ?? 0.2) * spread,
          filter: part.filter,
          detune: part.detune,
          pan: part.pan,
          fixedPitch: true,
        }, time, track.gain);
      }
    }

    const drums = def.drums;
    if (!drums) return;
    const drumGain = drums.gain ?? 0.5;
    for (const kind of DRUM_KINDS) {
      const pattern = drums[kind];
      if (typeof pattern !== 'string' || pattern.length === 0) continue;
      const hit = pattern[step % pattern.length];
      if (hit !== 'x' && hit !== 'o') continue;
      const level = drumGain * (hit === 'o' ? 0.45 : 1);
      for (const voice of DRUM_VOICES[kind]) {
        this._playVoice(voice, time, track.gain, { gain: level });
      }
    }
  }

  // ── その他 ────────────────────────────────────

  _warnOnce(key, message) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(message);
  }

  /** デバッグ表示用の状態スナップショット */
  get status() {
    return {
      supported: this.supported,
      state: this.ctx?.state ?? 'none',
      muted: this.muted,
      volume: this.volume,
      bgm: this.currentBgm,
      pendingBgm: this._pendingBgm,
      voices: this._voices,
      tracks: this._tracks.length,
      presets: Object.keys(this.presets).length,
    };
  }
}

/**
 * アプリ全体で共有するシングルトン。
 * ここでは AudioContext を作らないので、import だけなら Node でも安全。
 */
export const audio = new AudioEngine();
