/**
 * Web Audio 効果音プリセット + BGMパターン定義。DESIGN.md 6.6
 *
 * 外部音源ファイルは使わず、すべて合成生成する(キャラ音声を除く)。
 * ここは純粋なデータ定義で、鳴らす処理は src/engine/audio.js にある。
 * 音を足したいときは、原則このファイルにオブジェクトを1つ増やすだけで済む。
 *
 * ── ボイス(1発音)のスキーマ ─────────────────────────────
 * {
 *   type:     'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise',
 *   freq:     440,           // 固定周波数(Hz)。freqFrom/To を使うなら不要
 *   freqFrom: 880,           // スイープ開始
 *   freqTo:   220,           // スイープ終了
 *   sweep:    'exp'|'lin',   // 省略時 'exp'(0Hz を跨げないので注意)
 *   detune:   -7,            // セント
 *   dur:      0.12,          // 本体の長さ(秒)。リリースはこの後ろに付く
 *   env:      { a, d, s, r },// ADSR。a/d/r は秒、s は 0〜1 のサステイン比
 *   gain:     0.3,           // このボイスの音量(0〜1目安)
 *   filter:   { type:'lowpass', freq:1200, freqTo:400, q:6 },  // BiquadFilter(任意)
 *   delay:    0.06,          // 発音開始を遅らせる秒数(アルペジオ用)
 *   repeat:   { times:4, interval:0.18 },                      // 断続音(アラーム等)
 *   pan:      -0.4,          // -1(左)〜 1(右)。任意
 *   rate:     1.0,           // noise 専用。ノイズの再生速度
 *   fixedPitch: true,        // 動的ピッチ(step/semitones)の影響を受けない
 * }
 *
 * ── プリセットのスキーマ ────────────────────────────────
 * {
 *   gain:    1.0,            // プリセット全体の音量倍率(任意)
 *   dynamic: { stepSemitones: 2, maxSteps: 12 },  // 動的パラメータ(任意)
 *   voices:  [ ...ボイス ],
 * }
 *
 * `dynamic` があるプリセットは audio.playPreset(name, { step }) の step に応じて
 * 音程が stepSemitones 半音ずつ上がる(払出音が枚数で上がっていくアレ)。
 */

// ── 効果音プリセット ────────────────────────────────────

/** @type {Record<string, {gain?:number, dynamic?:object, voices:object[]}>} */
export const SFX_PRESETS = {
  // ── 基本操作 ──────────────────────────────────────
  /** BET / クレジット投入 */
  coin_in: {
    voices: [
      { type: 'square', freq: 1180, dur: 0.035, env: { a: 0.001, d: 0.03, s: 0, r: 0.01 }, gain: 0.14, filter: { type: 'lowpass', freq: 4200 } },
      { type: 'square', freq: 1560, dur: 0.045, delay: 0.045, env: { a: 0.001, d: 0.04, s: 0, r: 0.01 }, gain: 0.12, filter: { type: 'lowpass', freq: 5200 } },
      { type: 'noise', dur: 0.04, delay: 0.045, env: { a: 0.001, d: 0.03, s: 0, r: 0.01 }, filter: { type: 'highpass', freq: 4000 }, gain: 0.12 },
    ],
  },

  /** レバーON。ガコンという打感 */
  lever_on: {
    voices: [
      { type: 'noise', dur: 0.06, env: { a: 0.001, d: 0.05, s: 0, r: 0.01 }, filter: { type: 'highpass', freq: 2000 }, gain: 0.4 },
      { type: 'square', freqFrom: 880, freqTo: 220, dur: 0.12, env: { a: 0.001, d: 0.10, s: 0, r: 0.02 }, gain: 0.25 },
      { type: 'sine', freqFrom: 190, freqTo: 70, dur: 0.20, env: { a: 0.002, d: 0.18, s: 0, r: 0.04 }, gain: 0.34 },
    ],
  },

  /** リール始動のうなり */
  reel_spin: {
    voices: [
      { type: 'noise', dur: 0.45, env: { a: 0.06, d: 0.10, s: 0.5, r: 0.14 }, filter: { type: 'bandpass', freq: 320, freqTo: 720, q: 3 }, gain: 0.16 },
      { type: 'sawtooth', freqFrom: 60, freqTo: 130, dur: 0.40, env: { a: 0.05, d: 0.12, s: 0.4, r: 0.12 }, gain: 0.10, filter: { type: 'lowpass', freq: 600 } },
    ],
  },

  /** リール停止(設計書6.6のサンプルそのまま + 余韻) */
  reel_stop: {
    voices: [
      { type: 'noise', dur: 0.04, env: { a: 0.001, d: 0.03, s: 0, r: 0.01 }, filter: { type: 'bandpass', freq: 1200, q: 6 }, gain: 0.5 },
      { type: 'sine', freqFrom: 160, freqTo: 80, dur: 0.08, env: { a: 0.001, d: 0.07, s: 0, r: 0.01 }, gain: 0.3 },
      { type: 'triangle', freqFrom: 520, freqTo: 320, dur: 0.06, env: { a: 0.001, d: 0.05, s: 0, r: 0.02 }, gain: 0.12 },
    ],
  },

  /** 筐体ボタン押下 */
  button_push: {
    voices: [
      { type: 'noise', dur: 0.03, env: { a: 0.001, d: 0.02, s: 0, r: 0.01 }, filter: { type: 'highpass', freq: 3200 }, gain: 0.22 },
      { type: 'square', freqFrom: 620, freqTo: 380, dur: 0.05, env: { a: 0.001, d: 0.04, s: 0, r: 0.01 }, gain: 0.12 },
    ],
  },

  /** UIの選択音 */
  ui_select: {
    voices: [
      { type: 'square', freq: 1320, dur: 0.05, env: { a: 0.001, d: 0.04, s: 0, r: 0.02 }, gain: 0.10, filter: { type: 'lowpass', freq: 5000 } },
    ],
  },

  // ── 入賞・役 ──────────────────────────────────────
  /** ベル(EC2)入賞。三角波の C6-E6-G6 を2連打 */
  bell_win: {
    voices: [
      { type: 'triangle', freq: 1046.5, dur: 0.30, env: { a: 0.002, d: 0.26, s: 0, r: 0.10 }, gain: 0.17, repeat: { times: 2, interval: 0.17 } },
      { type: 'triangle', freq: 1318.5, dur: 0.30, env: { a: 0.002, d: 0.26, s: 0, r: 0.10 }, gain: 0.13, repeat: { times: 2, interval: 0.17 } },
      { type: 'triangle', freq: 1568.0, dur: 0.34, env: { a: 0.002, d: 0.30, s: 0, r: 0.12 }, gain: 0.10, repeat: { times: 2, interval: 0.17 } },
      { type: 'sine', freq: 2093.0, dur: 0.18, delay: 0.02, env: { a: 0.001, d: 0.16, s: 0, r: 0.06 }, gain: 0.05 },
    ],
  },

  /** リプレイ(DynamoDB)。柔らかい2音 */
  replay_win: {
    voices: [
      { type: 'sine', freq: 659.25, dur: 0.10, env: { a: 0.004, d: 0.09, s: 0, r: 0.04 }, gain: 0.16 },
      { type: 'sine', freq: 987.77, dur: 0.16, delay: 0.10, env: { a: 0.004, d: 0.14, s: 0, r: 0.06 }, gain: 0.14 },
    ],
  },

  /** 弱チェリー(IAM)。Access Granted 風の短い3音 */
  cherry_win: {
    voices: [
      { type: 'square', freq: 880, dur: 0.06, env: { a: 0.001, d: 0.05, s: 0, r: 0.02 }, gain: 0.13, filter: { type: 'lowpass', freq: 4000 } },
      { type: 'square', freq: 1174.7, dur: 0.06, delay: 0.07, env: { a: 0.001, d: 0.05, s: 0, r: 0.02 }, gain: 0.13, filter: { type: 'lowpass', freq: 4600 } },
      { type: 'square', freq: 1567.98, dur: 0.12, delay: 0.14, env: { a: 0.001, d: 0.10, s: 0, r: 0.05 }, gain: 0.12, filter: { type: 'lowpass', freq: 5200 } },
    ],
  },

  /** 強チェリー(IAM金)。上の派手版 */
  cherry_strong: {
    voices: [
      { type: 'square', freq: 880, dur: 0.06, env: { a: 0.001, d: 0.05, s: 0, r: 0.02 }, gain: 0.14 },
      { type: 'square', freq: 1108.7, dur: 0.06, delay: 0.06, env: { a: 0.001, d: 0.05, s: 0, r: 0.02 }, gain: 0.14 },
      { type: 'square', freq: 1318.5, dur: 0.06, delay: 0.12, env: { a: 0.001, d: 0.05, s: 0, r: 0.02 }, gain: 0.14 },
      { type: 'square', freq: 1760, dur: 0.22, delay: 0.18, env: { a: 0.001, d: 0.18, s: 0, r: 0.08 }, gain: 0.13 },
      { type: 'triangle', freq: 2637, dur: 0.30, delay: 0.18, env: { a: 0.004, d: 0.26, s: 0, r: 0.10 }, gain: 0.06 },
      { type: 'noise', dur: 0.30, delay: 0.18, env: { a: 0.01, d: 0.26, s: 0, r: 0.06 }, filter: { type: 'highpass', freq: 6000 }, gain: 0.10 },
    ],
  },

  /** スイカ(S3)。バケット全開放のシャワー感 */
  melon_win: {
    voices: [
      { type: 'triangle', freq: 784, dur: 0.09, env: { a: 0.002, d: 0.08, s: 0, r: 0.03 }, gain: 0.13 },
      { type: 'triangle', freq: 1046.5, dur: 0.09, delay: 0.08, env: { a: 0.002, d: 0.08, s: 0, r: 0.03 }, gain: 0.13 },
      { type: 'triangle', freq: 1318.5, dur: 0.09, delay: 0.16, env: { a: 0.002, d: 0.08, s: 0, r: 0.03 }, gain: 0.12 },
      { type: 'triangle', freq: 1760, dur: 0.20, delay: 0.24, env: { a: 0.002, d: 0.18, s: 0, r: 0.06 }, gain: 0.11 },
      { type: 'noise', dur: 0.45, delay: 0.24, env: { a: 0.02, d: 0.40, s: 0, r: 0.08 }, filter: { type: 'bandpass', freq: 5200, freqTo: 2200, q: 1.4 }, gain: 0.09 },
    ],
  },

  /** チャンス目(Lambda)。「関数が呼ばれました」の軽い電子音 */
  chance_flag: {
    voices: [
      { type: 'square', freq: 1244.5, dur: 0.05, env: { a: 0.001, d: 0.04, s: 0, r: 0.02 }, gain: 0.12, filter: { type: 'lowpass', freq: 5000 } },
      { type: 'square', freq: 1661.2, dur: 0.05, delay: 0.055, env: { a: 0.001, d: 0.04, s: 0, r: 0.02 }, gain: 0.12, filter: { type: 'lowpass', freq: 5600 } },
      { type: 'sine', freqFrom: 1661.2, freqTo: 2489, dur: 0.16, delay: 0.11, env: { a: 0.002, d: 0.14, s: 0, r: 0.05 }, gain: 0.10 },
    ],
  },

  /** レア役(汎用)。矩形波の上昇アルペジオ4音 */
  rare_flag: {
    voices: [
      { type: 'square', freq: 523.25, dur: 0.07, env: { a: 0.001, d: 0.06, s: 0, r: 0.02 }, gain: 0.14, filter: { type: 'lowpass', freq: 3600 } },
      { type: 'square', freq: 659.25, dur: 0.07, delay: 0.07, env: { a: 0.001, d: 0.06, s: 0, r: 0.02 }, gain: 0.14, filter: { type: 'lowpass', freq: 4000 } },
      { type: 'square', freq: 880, dur: 0.07, delay: 0.14, env: { a: 0.001, d: 0.06, s: 0, r: 0.02 }, gain: 0.14, filter: { type: 'lowpass', freq: 4600 } },
      { type: 'square', freq: 1174.66, dur: 0.24, delay: 0.21, env: { a: 0.001, d: 0.20, s: 0, r: 0.08 }, gain: 0.13, filter: { type: 'lowpass', freq: 5200 } },
      { type: 'triangle', freq: 2349.3, dur: 0.30, delay: 0.21, env: { a: 0.004, d: 0.26, s: 0, r: 0.10 }, gain: 0.05 },
    ],
  },

  /** サメ揃い(BAR)。低音のサブベース + ノイズの噛みつき音 */
  shark_bite: {
    voices: [
      { type: 'sine', freqFrom: 110, freqTo: 38, dur: 0.55, env: { a: 0.004, d: 0.20, s: 0.4, r: 0.20 }, gain: 0.45 },
      { type: 'noise', dur: 0.10, env: { a: 0.001, d: 0.09, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 2600, freqTo: 700, q: 2.2 }, gain: 0.42 },
      { type: 'noise', dur: 0.08, delay: 0.09, env: { a: 0.001, d: 0.07, s: 0, r: 0.02 }, filter: { type: 'bandpass', freq: 1800, freqTo: 500, q: 2.6 }, gain: 0.30 },
      { type: 'sawtooth', freqFrom: 220, freqTo: 60, dur: 0.24, env: { a: 0.002, d: 0.20, s: 0, r: 0.06 }, gain: 0.10, filter: { type: 'lowpass', freq: 900 } },
    ],
  },

  /** サメの気配(水中音)。姿の見えない予告用 */
  shark_swim: {
    voices: [
      { type: 'noise', dur: 1.20, env: { a: 0.35, d: 0.30, s: 0.5, r: 0.35 }, filter: { type: 'lowpass', freq: 260, freqTo: 900, q: 2 }, gain: 0.30 },
      { type: 'sine', freqFrom: 58, freqTo: 92, dur: 1.10, env: { a: 0.30, d: 0.30, s: 0.5, r: 0.30 }, gain: 0.26 },
      { type: 'sine', freq: 64, detune: 12, dur: 1.10, env: { a: 0.40, d: 0.30, s: 0.4, r: 0.30 }, gain: 0.18 },
    ],
  },

  /** 幽霊7揃い(プレミア)。不気味に揺れる高音 */
  ghost_seven: {
    voices: [
      { type: 'triangle', freqFrom: 392, freqTo: 1568, dur: 1.10, sweep: 'exp', env: { a: 0.06, d: 0.30, s: 0.6, r: 0.30 }, gain: 0.16, filter: { type: 'lowpass', freq: 3000 } },
      { type: 'triangle', freqFrom: 392, freqTo: 1568, detune: 18, dur: 1.10, sweep: 'exp', env: { a: 0.08, d: 0.30, s: 0.6, r: 0.30 }, gain: 0.14 },
      { type: 'sine', freq: 98, dur: 1.20, env: { a: 0.02, d: 0.40, s: 0.5, r: 0.30 }, gain: 0.30 },
      { type: 'noise', dur: 1.20, env: { a: 0.30, d: 0.40, s: 0.3, r: 0.30 }, filter: { type: 'highpass', freq: 5000 }, gain: 0.08 },
    ],
  },

  // ── 払出 ────────────────────────────────────────
  /**
   * 払出1枚ごとの音。playPreset('payout_tick', { step: n }) の n で
   * 2半音ずつ音程が上がる(12段で頭打ち)。
   */
  payout_tick: {
    dynamic: { stepSemitones: 2, maxSteps: 12 },
    voices: [
      { type: 'square', freq: 880, dur: 0.045, env: { a: 0.001, d: 0.04, s: 0, r: 0.015 }, gain: 0.11, filter: { type: 'lowpass', freq: 5200 } },
      { type: 'triangle', freq: 1760, dur: 0.05, env: { a: 0.001, d: 0.045, s: 0, r: 0.02 }, gain: 0.05 },
      { type: 'noise', dur: 0.02, env: { a: 0.001, d: 0.015, s: 0, r: 0.008 }, filter: { type: 'highpass', freq: 6000 }, gain: 0.08, fixedPitch: true },
    ],
  },

  /** 払出完了 */
  payout_end: {
    voices: [
      { type: 'triangle', freq: 1046.5, dur: 0.10, env: { a: 0.002, d: 0.09, s: 0, r: 0.04 }, gain: 0.13 },
      { type: 'triangle', freq: 1568, dur: 0.22, delay: 0.09, env: { a: 0.002, d: 0.20, s: 0, r: 0.08 }, gain: 0.12 },
    ],
  },

  // ── 演出 ────────────────────────────────────────
  /** Bedrock役(旧 CloudWatch アラーム)。矩形波1000Hzの断続 */
  alarm_beep: {
    voices: [
      { type: 'square', freq: 1000, dur: 0.09, env: { a: 0.002, d: 0.02, s: 0.9, r: 0.02 }, gain: 0.16, filter: { type: 'lowpass', freq: 3200 }, repeat: { times: 4, interval: 0.20 } },
      { type: 'square', freq: 1500, dur: 0.09, env: { a: 0.002, d: 0.02, s: 0.7, r: 0.02 }, gain: 0.07, filter: { type: 'lowpass', freq: 4200 }, repeat: { times: 4, interval: 0.20 } },
    ],
  },

  /** スケールアウト。上昇スイープ + ノイズバースト */
  scale_out: {
    voices: [
      { type: 'sawtooth', freqFrom: 180, freqTo: 1800, dur: 0.42, sweep: 'exp', env: { a: 0.01, d: 0.10, s: 0.7, r: 0.10 }, gain: 0.16, filter: { type: 'lowpass', freq: 1200, freqTo: 6000 } },
      { type: 'square', freqFrom: 360, freqTo: 3600, dur: 0.42, sweep: 'exp', env: { a: 0.02, d: 0.12, s: 0.5, r: 0.10 }, gain: 0.07 },
      { type: 'noise', dur: 0.24, delay: 0.36, env: { a: 0.004, d: 0.20, s: 0, r: 0.06 }, filter: { type: 'highpass', freq: 3000 }, gain: 0.24 },
      { type: 'triangle', freq: 2093, dur: 0.30, delay: 0.40, env: { a: 0.003, d: 0.26, s: 0, r: 0.10 }, gain: 0.10 },
    ],
  },

  /** ヘルスチェック。ピッ・ピッという確認音 */
  health_check: {
    voices: [
      { type: 'sine', freq: 1396.9, dur: 0.06, env: { a: 0.002, d: 0.05, s: 0, r: 0.02 }, gain: 0.13 },
      { type: 'sine', freq: 1760, dur: 0.09, delay: 0.13, env: { a: 0.002, d: 0.08, s: 0, r: 0.03 }, gain: 0.12 },
      { type: 'noise', dur: 0.05, delay: 0.13, env: { a: 0.001, d: 0.04, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 5000 }, gain: 0.06 },
    ],
  },

  /** テンパイ音(継続的なうねり) */
  tenpai: {
    voices: [
      { type: 'square', freq: 659.25, dur: 0.55, env: { a: 0.01, d: 0.10, s: 0.6, r: 0.14 }, gain: 0.11, filter: { type: 'bandpass', freq: 1200, q: 3 } },
      { type: 'square', freq: 659.25, detune: 14, dur: 0.55, env: { a: 0.01, d: 0.10, s: 0.6, r: 0.14 }, gain: 0.09, filter: { type: 'bandpass', freq: 1400, q: 3 } },
      { type: 'sine', freqFrom: 130, freqTo: 165, dur: 0.60, env: { a: 0.02, d: 0.16, s: 0.5, r: 0.16 }, gain: 0.18 },
    ],
  },

  /** 当選濃厚テンパイ音(重い) */
  tenpai_strong: {
    voices: [
      { type: 'sawtooth', freq: 220, dur: 0.90, env: { a: 0.01, d: 0.20, s: 0.7, r: 0.20 }, gain: 0.12, filter: { type: 'lowpass', freq: 900, freqTo: 2400 } },
      { type: 'sawtooth', freq: 220, detune: -16, dur: 0.90, env: { a: 0.01, d: 0.20, s: 0.7, r: 0.20 }, gain: 0.10, filter: { type: 'lowpass', freq: 1100, freqTo: 2600 } },
      { type: 'sine', freqFrom: 55, freqTo: 82, dur: 1.00, env: { a: 0.02, d: 0.30, s: 0.6, r: 0.24 }, gain: 0.34 },
      { type: 'square', freq: 1760, dur: 0.06, env: { a: 0.002, d: 0.05, s: 0, r: 0.02 }, gain: 0.06, repeat: { times: 6, interval: 0.15 } },
    ],
  },

  /** カットインの風切り音 */
  cutin_whoosh: {
    voices: [
      { type: 'noise', dur: 0.34, env: { a: 0.05, d: 0.12, s: 0.6, r: 0.12 }, filter: { type: 'bandpass', freq: 300, freqTo: 5200, q: 1.2 }, gain: 0.34 },
      { type: 'sawtooth', freqFrom: 90, freqTo: 700, dur: 0.30, sweep: 'exp', env: { a: 0.04, d: 0.10, s: 0.5, r: 0.10 }, gain: 0.09, filter: { type: 'lowpass', freq: 2000 } },
    ],
  },

  /** チャージアップ(期待度上昇) */
  charge_up: {
    voices: [
      { type: 'sawtooth', freqFrom: 110, freqTo: 880, dur: 1.00, sweep: 'exp', env: { a: 0.08, d: 0.20, s: 0.8, r: 0.14 }, gain: 0.12, filter: { type: 'lowpass', freq: 700, freqTo: 4200 } },
      { type: 'square', freqFrom: 220, freqTo: 1760, dur: 1.00, sweep: 'exp', env: { a: 0.20, d: 0.20, s: 0.7, r: 0.14 }, gain: 0.06 },
      { type: 'noise', dur: 1.00, env: { a: 0.40, d: 0.30, s: 0.5, r: 0.16 }, filter: { type: 'highpass', freq: 1200, freqTo: 6000 }, gain: 0.10 },
    ],
  },

  /** カウントダウンの刻み */
  countdown_tick: {
    voices: [
      { type: 'square', freq: 1500, dur: 0.04, env: { a: 0.001, d: 0.035, s: 0, r: 0.015 }, gain: 0.10, filter: { type: 'lowpass', freq: 5200 } },
      { type: 'noise', dur: 0.02, env: { a: 0.001, d: 0.015, s: 0, r: 0.008 }, filter: { type: 'highpass', freq: 5000 }, gain: 0.06 },
    ],
  },

  /** フリーズ・プレミア発生の一撃 */
  freeze_hit: {
    voices: [
      { type: 'sine', freqFrom: 160, freqTo: 30, dur: 1.20, env: { a: 0.001, d: 0.50, s: 0.3, r: 0.40 }, gain: 0.50 },
      { type: 'noise', dur: 0.70, env: { a: 0.001, d: 0.50, s: 0.1, r: 0.18 }, filter: { type: 'lowpass', freq: 6000, freqTo: 500 }, gain: 0.34 },
      { type: 'sawtooth', freqFrom: 880, freqTo: 55, dur: 0.60, sweep: 'exp', env: { a: 0.001, d: 0.40, s: 0.1, r: 0.16 }, gain: 0.14, filter: { type: 'lowpass', freq: 2400 } },
      { type: 'triangle', freq: 3136, dur: 0.90, delay: 0.05, env: { a: 0.004, d: 0.60, s: 0.1, r: 0.24 }, gain: 0.05 },
    ],
  },

  /** 失敗・障害発生のブザー */
  error_buzz: {
    voices: [
      { type: 'sawtooth', freq: 165, dur: 0.16, env: { a: 0.002, d: 0.04, s: 0.8, r: 0.04 }, gain: 0.16, filter: { type: 'lowpass', freq: 1400 }, repeat: { times: 2, interval: 0.22 } },
      { type: 'square', freq: 82.4, dur: 0.16, env: { a: 0.002, d: 0.04, s: 0.8, r: 0.04 }, gain: 0.14, repeat: { times: 2, interval: 0.22 } },
    ],
  },

  /**
   * クイズ番組の不正解ブザー「ブッ・ブー」(2026-08-14 追加 U13)。
   *
   * 「AWSあるある分岐予兆」(data/scenarios/yokoku-aruaru.js)専用。
   * リール停止でハズレが確定したとき、アンチパターンのセリフに重ねて鳴らす。
   *
   * 既存の error_buzz を流用しなかった理由:
   *   error_buzz は「障害が起きた」の警報で、同じ長さの2連打を低く鳴らすため
   *   事故の色が強い。ここで欲しいのは司会者が押す不正解ブザーなので、
   *   短い「ブッ」→ 長く垂れ下がる「ブー」の **非対称な2連** にして、
   *   2発目の終わりだけピッチを落とし、笑いに寄せた余韻を作っている。
   *
   * 音の作り: F3(174.6Hz)の矩形波 + 1オクターブ下のノコギリ波で
   * ブザーの濁りを出し、ローパスで角を落とす。頭に短いノイズを置いて
   * 「ボタンを叩いた」感を足す。
   */
  buzzer_wrong: {
    voices: [
      // 1発目「ブッ」
      { type: 'square', freq: 174.6, dur: 0.11, env: { a: 0.003, d: 0.02, s: 0.9, r: 0.03 }, gain: 0.17, filter: { type: 'lowpass', freq: 1100 } },
      { type: 'sawtooth', freq: 87.3, dur: 0.11, env: { a: 0.003, d: 0.02, s: 0.9, r: 0.03 }, gain: 0.13, filter: { type: 'lowpass', freq: 800 } },
      // 2発目「ブー」。語尾だけ半音ぶん垂れる
      { type: 'square', freqFrom: 174.6, freqTo: 146.8, dur: 0.42, delay: 0.17, env: { a: 0.003, d: 0.06, s: 0.85, r: 0.10 }, gain: 0.17, filter: { type: 'lowpass', freq: 1100 } },
      { type: 'sawtooth', freqFrom: 87.3, freqTo: 73.4, dur: 0.42, delay: 0.17, env: { a: 0.003, d: 0.06, s: 0.85, r: 0.10 }, gain: 0.13, filter: { type: 'lowpass', freq: 800 } },
      // ブザーを叩いた瞬間の当たり音
      { type: 'noise', dur: 0.05, env: { a: 0.001, d: 0.04, s: 0, r: 0.01 }, filter: { type: 'bandpass', freq: 900, q: 2 }, gain: 0.10 },
    ],
  },

  /** CZ成功 */
  cz_win: {
    voices: [
      { type: 'square', freq: 523.25, dur: 0.08, env: { a: 0.001, d: 0.07, s: 0, r: 0.03 }, gain: 0.13, filter: { type: 'lowpass', freq: 4200 } },
      { type: 'square', freq: 659.25, dur: 0.08, delay: 0.08, env: { a: 0.001, d: 0.07, s: 0, r: 0.03 }, gain: 0.13, filter: { type: 'lowpass', freq: 4400 } },
      { type: 'square', freq: 783.99, dur: 0.08, delay: 0.16, env: { a: 0.001, d: 0.07, s: 0, r: 0.03 }, gain: 0.13, filter: { type: 'lowpass', freq: 4600 } },
      { type: 'square', freq: 1046.5, dur: 0.40, delay: 0.24, env: { a: 0.001, d: 0.30, s: 0.2, r: 0.14 }, gain: 0.13, filter: { type: 'lowpass', freq: 5200 } },
      { type: 'triangle', freq: 1568, dur: 0.40, delay: 0.24, env: { a: 0.004, d: 0.30, s: 0.2, r: 0.14 }, gain: 0.08 },
      { type: 'noise', dur: 0.50, delay: 0.24, env: { a: 0.005, d: 0.40, s: 0, r: 0.10 }, filter: { type: 'highpass', freq: 5200 }, gain: 0.12 },
    ],
  },

  /** CZ失敗 */
  cz_lose: {
    voices: [
      { type: 'triangle', freq: 523.25, dur: 0.14, env: { a: 0.004, d: 0.12, s: 0, r: 0.05 }, gain: 0.12 },
      { type: 'triangle', freq: 415.3, dur: 0.14, delay: 0.14, env: { a: 0.004, d: 0.12, s: 0, r: 0.05 }, gain: 0.12 },
      { type: 'triangle', freq: 311.1, dur: 0.40, delay: 0.28, env: { a: 0.004, d: 0.34, s: 0, r: 0.12 }, gain: 0.13 },
      { type: 'sine', freq: 155.6, dur: 0.45, delay: 0.28, env: { a: 0.006, d: 0.38, s: 0, r: 0.12 }, gain: 0.16 },
    ],
  },

  /** 上乗せ・セット継続のチャイム */
  upgrade_chime: {
    voices: [
      { type: 'triangle', freq: 1046.5, dur: 0.10, env: { a: 0.002, d: 0.09, s: 0, r: 0.04 }, gain: 0.14 },
      { type: 'triangle', freq: 1318.5, dur: 0.10, delay: 0.07, env: { a: 0.002, d: 0.09, s: 0, r: 0.04 }, gain: 0.14 },
      { type: 'triangle', freq: 1568, dur: 0.26, delay: 0.14, env: { a: 0.002, d: 0.22, s: 0, r: 0.10 }, gain: 0.13 },
      { type: 'sine', freq: 3136, dur: 0.30, delay: 0.14, env: { a: 0.004, d: 0.26, s: 0, r: 0.10 }, gain: 0.05 },
    ],
  },

  /** ボーナス確定の大ファンファーレ */
  fanfare_big: {
    gain: 1.05,
    voices: [
      // ファンファーレ主旋律 C-E-G-C
      { type: 'square', freq: 523.25, dur: 0.14, env: { a: 0.004, d: 0.05, s: 0.8, r: 0.05 }, gain: 0.15, filter: { type: 'lowpass', freq: 4200 } },
      { type: 'square', freq: 659.25, dur: 0.14, delay: 0.16, env: { a: 0.004, d: 0.05, s: 0.8, r: 0.05 }, gain: 0.15, filter: { type: 'lowpass', freq: 4400 } },
      { type: 'square', freq: 783.99, dur: 0.14, delay: 0.32, env: { a: 0.004, d: 0.05, s: 0.8, r: 0.05 }, gain: 0.15, filter: { type: 'lowpass', freq: 4600 } },
      { type: 'square', freq: 1046.5, dur: 0.70, delay: 0.48, env: { a: 0.004, d: 0.20, s: 0.6, r: 0.30 }, gain: 0.16, filter: { type: 'lowpass', freq: 5200 } },
      // 和音の厚み
      { type: 'triangle', freq: 659.25, dur: 0.70, delay: 0.48, env: { a: 0.01, d: 0.20, s: 0.6, r: 0.30 }, gain: 0.10 },
      { type: 'triangle', freq: 783.99, dur: 0.70, delay: 0.48, env: { a: 0.01, d: 0.20, s: 0.6, r: 0.30 }, gain: 0.09 },
      { type: 'sine', freq: 130.8, dur: 0.80, delay: 0.48, env: { a: 0.01, d: 0.24, s: 0.6, r: 0.30 }, gain: 0.30 },
      // シンバル
      { type: 'noise', dur: 0.80, delay: 0.48, env: { a: 0.004, d: 0.60, s: 0.05, r: 0.20 }, filter: { type: 'highpass', freq: 4200 }, gain: 0.20 },
      { type: 'noise', dur: 0.10, env: { a: 0.001, d: 0.09, s: 0, r: 0.03 }, filter: { type: 'highpass', freq: 3000 }, gain: 0.16 },
    ],
  },

  /** REG級の短いファンファーレ */
  fanfare_reg: {
    voices: [
      { type: 'square', freq: 659.25, dur: 0.12, env: { a: 0.003, d: 0.05, s: 0.7, r: 0.04 }, gain: 0.13, filter: { type: 'lowpass', freq: 4200 } },
      { type: 'square', freq: 783.99, dur: 0.12, delay: 0.13, env: { a: 0.003, d: 0.05, s: 0.7, r: 0.04 }, gain: 0.13, filter: { type: 'lowpass', freq: 4400 } },
      { type: 'square', freq: 1046.5, dur: 0.40, delay: 0.26, env: { a: 0.003, d: 0.16, s: 0.5, r: 0.18 }, gain: 0.14, filter: { type: 'lowpass', freq: 5000 } },
      { type: 'sine', freq: 130.8, dur: 0.45, delay: 0.26, env: { a: 0.01, d: 0.18, s: 0.5, r: 0.18 }, gain: 0.24 },
      { type: 'noise', dur: 0.40, delay: 0.26, env: { a: 0.004, d: 0.32, s: 0, r: 0.12 }, filter: { type: 'highpass', freq: 4200 }, gain: 0.12 },
    ],
  },

  /** エンディング(re:Invent)のファンファーレ */
  fanfare_ending: {
    gain: 1.1,
    voices: [
      { type: 'square', freq: 783.99, dur: 0.18, env: { a: 0.004, d: 0.06, s: 0.8, r: 0.06 }, gain: 0.14 },
      { type: 'square', freq: 1046.5, dur: 0.18, delay: 0.20, env: { a: 0.004, d: 0.06, s: 0.8, r: 0.06 }, gain: 0.14 },
      { type: 'square', freq: 1318.5, dur: 0.18, delay: 0.40, env: { a: 0.004, d: 0.06, s: 0.8, r: 0.06 }, gain: 0.14 },
      { type: 'square', freq: 1568, dur: 1.10, delay: 0.60, env: { a: 0.006, d: 0.30, s: 0.6, r: 0.40 }, gain: 0.15 },
      { type: 'triangle', freq: 1046.5, dur: 1.10, delay: 0.60, env: { a: 0.02, d: 0.30, s: 0.6, r: 0.40 }, gain: 0.10 },
      { type: 'triangle', freq: 1318.5, dur: 1.10, delay: 0.60, env: { a: 0.02, d: 0.30, s: 0.6, r: 0.40 }, gain: 0.09 },
      { type: 'sine', freq: 196, dur: 1.20, delay: 0.60, env: { a: 0.02, d: 0.30, s: 0.6, r: 0.40 }, gain: 0.28 },
      { type: 'noise', dur: 1.20, delay: 0.60, env: { a: 0.006, d: 0.80, s: 0.05, r: 0.30 }, filter: { type: 'highpass', freq: 4000 }, gain: 0.18 },
    ],
  },

  // ── Phase 5 の派生ゾーン / 上位AT用(統合時に追加) ──────
  /** 汎用の予告音。エンディング中の新サービス発表など */
  announce: {
    voices: [
      { type: 'sine', freq: 1318.5, dur: 0.10, env: { a: 0.003, d: 0.09, s: 0, r: 0.05 }, gain: 0.15 },
      { type: 'sine', freq: 1760, dur: 0.26, delay: 0.11, env: { a: 0.003, d: 0.22, s: 0, r: 0.10 }, gain: 0.14 },
      { type: 'triangle', freq: 2637, dur: 0.20, delay: 0.11, env: { a: 0.004, d: 0.18, s: 0, r: 0.08 }, gain: 0.06 },
    ],
  },

  /** EC2 Burst 突入。クレジットが一気に吹き上がる */
  burst_start: {
    gain: 1.05,
    voices: [
      { type: 'noise', dur: 0.34, env: { a: 0.004, d: 0.30, s: 0, r: 0.10 }, filter: { type: 'highpass', freq: 900, freqTo: 5200, q: 2 }, gain: 0.26 },
      { type: 'sawtooth', freqFrom: 180, freqTo: 900, dur: 0.36, env: { a: 0.006, d: 0.14, s: 0.5, r: 0.14 }, gain: 0.13, filter: { type: 'lowpass', freq: 1400, freqTo: 4200 } },
      { type: 'square', freq: 1174.7, dur: 0.30, delay: 0.30, env: { a: 0.003, d: 0.12, s: 0.5, r: 0.14 }, gain: 0.12 },
      { type: 'sine', freq: 98, dur: 0.42, delay: 0.28, env: { a: 0.006, d: 0.20, s: 0.4, r: 0.16 }, gain: 0.26 },
    ],
  },

  /** CZ のチェックリストがグリーンになる。ピッと1項目 */
  checklist_ok: {
    voices: [
      { type: 'sine', freq: 1567.98, dur: 0.07, env: { a: 0.002, d: 0.06, s: 0, r: 0.03 }, gain: 0.14 },
      { type: 'sine', freq: 2093, dur: 0.14, delay: 0.06, env: { a: 0.002, d: 0.12, s: 0, r: 0.06 }, gain: 0.10 },
    ],
  },

  /** リザーブドインスタンス契約。判子を押す重み */
  contract_sign: {
    voices: [
      { type: 'noise', dur: 0.07, env: { a: 0.001, d: 0.06, s: 0, r: 0.02 }, filter: { type: 'lowpass', freq: 1100, q: 1 }, gain: 0.40 },
      { type: 'sine', freqFrom: 150, freqTo: 62, dur: 0.24, env: { a: 0.001, d: 0.20, s: 0, r: 0.07 }, gain: 0.36 },
      { type: 'triangle', freq: 523.25, dur: 0.34, delay: 0.14, env: { a: 0.006, d: 0.28, s: 0, r: 0.14 }, gain: 0.11 },
      { type: 'triangle', freq: 784, dur: 0.40, delay: 0.20, env: { a: 0.006, d: 0.32, s: 0, r: 0.16 }, gain: 0.09 },
    ],
  },

  /** Burst のクレジット残量が少ない警告。低く不安な断続音 */
  credit_low: {
    voices: [
      { type: 'square', freq: 220, dur: 0.10, env: { a: 0.003, d: 0.08, s: 0, r: 0.04 }, gain: 0.13, filter: { type: 'lowpass', freq: 1400 }, repeat: { times: 3, interval: 0.20 } },
      { type: 'square', freq: 233.08, dur: 0.10, delay: 0.02, env: { a: 0.003, d: 0.08, s: 0, r: 0.04 }, gain: 0.10, filter: { type: 'lowpass', freq: 1400 }, repeat: { times: 3, interval: 0.20 } },
    ],
  },

  /** レア役でクレジット回復。ぐんと持ち直す上昇音 */
  credit_recover: {
    voices: [
      { type: 'triangle', freqFrom: 392, freqTo: 1174.7, dur: 0.30, env: { a: 0.004, d: 0.10, s: 0.6, r: 0.14 }, gain: 0.15 },
      { type: 'sine', freq: 1567.98, dur: 0.26, delay: 0.26, env: { a: 0.004, d: 0.22, s: 0, r: 0.10 }, gain: 0.12 },
      { type: 'noise', dur: 0.24, env: { a: 0.02, d: 0.20, s: 0, r: 0.08 }, filter: { type: 'bandpass', freq: 1600, freqTo: 5200, q: 3 }, gain: 0.10 },
    ],
  },

  /** DynamoDB がスケールする。テーブルが伸びていく */
  dynamo_scale: {
    voices: [
      { type: 'sawtooth', freqFrom: 130.8, freqTo: 523.25, dur: 0.50, env: { a: 0.01, d: 0.16, s: 0.6, r: 0.18 }, gain: 0.11, filter: { type: 'lowpass', freq: 900, freqTo: 3600, q: 4 } },
      { type: 'triangle', freq: 1046.5, dur: 0.34, delay: 0.44, env: { a: 0.004, d: 0.28, s: 0, r: 0.14 }, gain: 0.13 },
      { type: 'triangle', freq: 1318.5, dur: 0.36, delay: 0.52, env: { a: 0.004, d: 0.30, s: 0, r: 0.15 }, gain: 0.11 },
      { type: 'sine', freq: 130.8, dur: 0.60, delay: 0.44, env: { a: 0.01, d: 0.24, s: 0.4, r: 0.22 }, gain: 0.22 },
    ],
  },

  /** CloudFront のエッジにヒット。近くで弾ける短い音 */
  edge_hit: {
    voices: [
      { type: 'noise', dur: 0.05, env: { a: 0.001, d: 0.04, s: 0, r: 0.02 }, filter: { type: 'highpass', freq: 5200 }, gain: 0.22 },
      { type: 'sine', freqFrom: 2637, freqTo: 1318.5, dur: 0.12, env: { a: 0.001, d: 0.10, s: 0, r: 0.05 }, gain: 0.13 },
      { type: 'triangle', freq: 1975.5, dur: 0.16, delay: 0.05, env: { a: 0.002, d: 0.14, s: 0, r: 0.07 }, gain: 0.08 },
    ],
  },

  /** Graviton の低いハム。省電力コアが静かに唸る */
  graviton_hum: {
    voices: [
      { type: 'sawtooth', freq: 55, dur: 0.90, env: { a: 0.08, d: 0.20, s: 0.7, r: 0.30 }, gain: 0.20, filter: { type: 'lowpass', freq: 260, freqTo: 620, q: 8 } },
      { type: 'sine', freq: 110, dur: 0.90, env: { a: 0.10, d: 0.20, s: 0.7, r: 0.30 }, gain: 0.16 },
      { type: 'triangle', freq: 165, detune: -8, dur: 0.80, delay: 0.06, env: { a: 0.12, d: 0.22, s: 0.5, r: 0.28 }, gain: 0.07 },
    ],
  },

  /** CZ の柱がせり上がる */
  pillar_up: {
    voices: [
      { type: 'sawtooth', freqFrom: 110, freqTo: 660, dur: 0.42, env: { a: 0.01, d: 0.12, s: 0.6, r: 0.16 }, gain: 0.12, filter: { type: 'lowpass', freq: 700, freqTo: 3000, q: 6 } },
      { type: 'noise', dur: 0.44, env: { a: 0.04, d: 0.16, s: 0.4, r: 0.16 }, filter: { type: 'bandpass', freq: 500, freqTo: 2600, q: 4 }, gain: 0.14 },
      { type: 'square', freq: 880, dur: 0.20, delay: 0.40, env: { a: 0.002, d: 0.16, s: 0, r: 0.08 }, gain: 0.11 },
    ],
  },

  /** マルチリージョンの地図が点灯する */
  region_light: {
    voices: [
      { type: 'sine', freq: 1046.5, dur: 0.18, env: { a: 0.004, d: 0.15, s: 0, r: 0.08 }, gain: 0.12 },
      { type: 'sine', freq: 1318.5, dur: 0.20, delay: 0.09, env: { a: 0.004, d: 0.17, s: 0, r: 0.09 }, gain: 0.11 },
      { type: 'sine', freq: 1975.5, dur: 0.30, delay: 0.18, env: { a: 0.004, d: 0.26, s: 0, r: 0.13 }, gain: 0.09 },
      { type: 'triangle', freq: 2637, dur: 0.34, delay: 0.18, env: { a: 0.01, d: 0.28, s: 0, r: 0.14 }, gain: 0.05 },
    ],
  },

  /** Route 53 のルーレットが回る */
  route53_spin: {
    voices: [
      { type: 'square', freq: 1174.7, dur: 0.035, env: { a: 0.001, d: 0.03, s: 0, r: 0.01 }, gain: 0.10, filter: { type: 'lowpass', freq: 4200 }, repeat: { times: 8, interval: 0.085 } },
      { type: 'noise', dur: 0.03, env: { a: 0.001, d: 0.02, s: 0, r: 0.01 }, filter: { type: 'highpass', freq: 3600 }, gain: 0.08, repeat: { times: 8, interval: 0.085 } },
    ],
  },

  /** サーバーレスへ昇格。EC2 から一段軽くなる */
  serverless_up: {
    gain: 1.05,
    voices: [
      { type: 'triangle', freqFrom: 261.63, freqTo: 1046.5, dur: 0.40, env: { a: 0.006, d: 0.12, s: 0.6, r: 0.16 }, gain: 0.14 },
      { type: 'square', freq: 1318.5, dur: 0.14, delay: 0.38, env: { a: 0.002, d: 0.05, s: 0.7, r: 0.06 }, gain: 0.12 },
      { type: 'square', freq: 1567.98, dur: 0.14, delay: 0.50, env: { a: 0.002, d: 0.05, s: 0.7, r: 0.06 }, gain: 0.12 },
      { type: 'square', freq: 2093, dur: 0.50, delay: 0.62, env: { a: 0.003, d: 0.18, s: 0.5, r: 0.24 }, gain: 0.12 },
      { type: 'sine', freq: 130.8, dur: 0.55, delay: 0.62, env: { a: 0.01, d: 0.22, s: 0.4, r: 0.22 }, gain: 0.22 },
    ],
  },

  /** Step Functions の分岐提示。「どっち?」と問いかける2音 */
  sfn_choice: {
    voices: [
      { type: 'triangle', freq: 880, dur: 0.12, env: { a: 0.004, d: 0.10, s: 0, r: 0.05 }, gain: 0.13 },
      { type: 'triangle', freq: 1174.7, dur: 0.22, delay: 0.13, env: { a: 0.004, d: 0.18, s: 0, r: 0.10 }, gain: 0.13 },
      { type: 'sine', freq: 1760, dur: 0.18, delay: 0.13, env: { a: 0.006, d: 0.15, s: 0, r: 0.08 }, gain: 0.06 },
    ],
  },

  /** ステート成功 */
  sfn_ok: {
    voices: [
      { type: 'square', freq: 1046.5, dur: 0.09, env: { a: 0.002, d: 0.07, s: 0, r: 0.03 }, gain: 0.12, filter: { type: 'lowpass', freq: 4600 } },
      { type: 'square', freq: 1567.98, dur: 0.20, delay: 0.09, env: { a: 0.002, d: 0.17, s: 0, r: 0.09 }, gain: 0.12, filter: { type: 'lowpass', freq: 5200 } },
      { type: 'sine', freq: 2093, dur: 0.18, delay: 0.09, env: { a: 0.003, d: 0.15, s: 0, r: 0.08 }, gain: 0.05 },
    ],
  },

  /** ステート失敗 */
  sfn_ng: {
    voices: [
      { type: 'square', freq: 311.13, dur: 0.14, env: { a: 0.002, d: 0.11, s: 0, r: 0.06 }, gain: 0.13, filter: { type: 'lowpass', freq: 1600 } },
      { type: 'square', freq: 233.08, dur: 0.28, delay: 0.14, env: { a: 0.002, d: 0.24, s: 0, r: 0.12 }, gain: 0.13, filter: { type: 'lowpass', freq: 1400 } },
      { type: 'sine', freqFrom: 160, freqTo: 70, dur: 0.30, delay: 0.14, env: { a: 0.004, d: 0.26, s: 0, r: 0.12 }, gain: 0.16 },
    ],
  },

  /** 天井到達の SLA クレジット付与。厳かで清らかな和音 */
  sla_credit: {
    gain: 1.05,
    voices: [
      { type: 'sine', freq: 523.25, dur: 0.90, env: { a: 0.03, d: 0.30, s: 0.5, r: 0.40 }, gain: 0.14 },
      { type: 'sine', freq: 783.99, dur: 0.90, delay: 0.05, env: { a: 0.03, d: 0.30, s: 0.5, r: 0.40 }, gain: 0.12 },
      { type: 'sine', freq: 1046.5, dur: 0.90, delay: 0.10, env: { a: 0.03, d: 0.30, s: 0.5, r: 0.40 }, gain: 0.10 },
      { type: 'triangle', freq: 1568, dur: 0.70, delay: 0.22, env: { a: 0.04, d: 0.28, s: 0.4, r: 0.34 }, gain: 0.06 },
      { type: 'noise', dur: 0.80, env: { a: 0.06, d: 0.50, s: 0.05, r: 0.30 }, filter: { type: 'highpass', freq: 5000 }, gain: 0.10 },
    ],
  },

  /** スポットゾーン突入。サメが突っ込んでくる */
  spot_entry: {
    gain: 1.05,
    voices: [
      { type: 'noise', dur: 0.40, env: { a: 0.10, d: 0.14, s: 0.5, r: 0.16 }, filter: { type: 'bandpass', freq: 240, freqTo: 1800, q: 2 }, gain: 0.24 },
      { type: 'sawtooth', freqFrom: 70, freqTo: 320, dur: 0.42, env: { a: 0.08, d: 0.14, s: 0.5, r: 0.16 }, gain: 0.14, filter: { type: 'lowpass', freq: 800, freqTo: 2200 } },
      { type: 'square', freq: 587.33, dur: 0.34, delay: 0.40, env: { a: 0.003, d: 0.14, s: 0.4, r: 0.16 }, gain: 0.12 },
      { type: 'sine', freq: 87.31, dur: 0.50, delay: 0.38, env: { a: 0.006, d: 0.22, s: 0.4, r: 0.20 }, gain: 0.28 },
    ],
  },

  /** 2分前の中断通知。心臓に悪い断続アラート */
  spot_notice: {
    voices: [
      { type: 'square', freq: 987.77, dur: 0.09, env: { a: 0.002, d: 0.07, s: 0, r: 0.03 }, gain: 0.13, filter: { type: 'lowpass', freq: 3200 }, repeat: { times: 4, interval: 0.17 } },
      { type: 'square', freq: 739.99, dur: 0.09, delay: 0.085, env: { a: 0.002, d: 0.07, s: 0, r: 0.03 }, gain: 0.12, filter: { type: 'lowpass', freq: 3000 }, repeat: { times: 4, interval: 0.17 } },
    ],
  },

  /** スポットゾーン終了。インスタンスが落ちる */
  spot_end: {
    voices: [
      { type: 'sawtooth', freqFrom: 420, freqTo: 60, dur: 0.60, env: { a: 0.004, d: 0.24, s: 0.3, r: 0.24 }, gain: 0.13, filter: { type: 'lowpass', freq: 2600, freqTo: 400 } },
      { type: 'noise', dur: 0.50, env: { a: 0.004, d: 0.40, s: 0, r: 0.16 }, filter: { type: 'lowpass', freq: 2400, freqTo: 300, q: 2 }, gain: 0.16 },
      { type: 'sine', freqFrom: 130, freqTo: 55, dur: 0.66, delay: 0.10, env: { a: 0.01, d: 0.30, s: 0.2, r: 0.26 }, gain: 0.22 },
    ],
  },

  /** 通常時のステージチェンジ(内部状態の昇格示唆) */
  stage_change: {
    voices: [
      { type: 'noise', dur: 0.30, env: { a: 0.06, d: 0.12, s: 0.4, r: 0.14 }, filter: { type: 'bandpass', freq: 700, freqTo: 3400, q: 2 }, gain: 0.14 },
      { type: 'triangle', freq: 659.25, dur: 0.16, delay: 0.16, env: { a: 0.004, d: 0.13, s: 0, r: 0.07 }, gain: 0.13 },
      { type: 'triangle', freq: 987.77, dur: 0.34, delay: 0.28, env: { a: 0.004, d: 0.28, s: 0, r: 0.14 }, gain: 0.12 },
      { type: 'sine', freq: 1975.5, dur: 0.26, delay: 0.28, env: { a: 0.006, d: 0.22, s: 0, r: 0.11 }, gain: 0.05 },
    ],
  },

  /** 上乗せストックを1つ消費する */
  stock_consume: {
    voices: [
      { type: 'square', freq: 880, dur: 0.05, env: { a: 0.001, d: 0.04, s: 0, r: 0.02 }, gain: 0.11, filter: { type: 'lowpass', freq: 4000 } },
      { type: 'triangle', freqFrom: 1174.7, freqTo: 1760, dur: 0.22, delay: 0.05, env: { a: 0.003, d: 0.18, s: 0, r: 0.09 }, gain: 0.12 },
      { type: 'sine', freq: 110, dur: 0.20, delay: 0.05, env: { a: 0.004, d: 0.16, s: 0, r: 0.08 }, gain: 0.16 },
    ],
  },

  /** Kinesis のレコードがレーンを流れる */
  stream_flow: {
    voices: [
      { type: 'noise', dur: 0.55, env: { a: 0.10, d: 0.16, s: 0.5, r: 0.22 }, filter: { type: 'bandpass', freq: 900, freqTo: 3200, q: 5 }, gain: 0.13, pan: -0.5 },
      { type: 'noise', dur: 0.55, delay: 0.12, env: { a: 0.10, d: 0.16, s: 0.5, r: 0.22 }, filter: { type: 'bandpass', freq: 1400, freqTo: 4200, q: 5 }, gain: 0.10, pan: 0.5 },
      { type: 'sine', freq: 1046.5, dur: 0.10, delay: 0.10, env: { a: 0.004, d: 0.08, s: 0, r: 0.04 }, gain: 0.07, repeat: { times: 4, interval: 0.12 } },
    ],
  },

  /** TTL のカウントダウン。1目盛り減る */
  ttl_tick: {
    voices: [
      { type: 'square', freq: 659.25, dur: 0.05, env: { a: 0.001, d: 0.04, s: 0, r: 0.02 }, gain: 0.11, filter: { type: 'lowpass', freq: 2600 } },
      { type: 'sine', freqFrom: 220, freqTo: 150, dur: 0.09, env: { a: 0.001, d: 0.08, s: 0, r: 0.03 }, gain: 0.10 },
    ],
  },

  /** TTL がゼロになる。切り替わる瞬間 */
  ttl_zero: {
    voices: [
      { type: 'square', freq: 392, dur: 0.10, env: { a: 0.002, d: 0.08, s: 0, r: 0.04 }, gain: 0.13, filter: { type: 'lowpass', freq: 2200 } },
      { type: 'square', freq: 261.63, dur: 0.30, delay: 0.10, env: { a: 0.002, d: 0.25, s: 0, r: 0.12 }, gain: 0.13, filter: { type: 'lowpass', freq: 1800 } },
      { type: 'noise', dur: 0.20, delay: 0.10, env: { a: 0.002, d: 0.17, s: 0, r: 0.07 }, filter: { type: 'highpass', freq: 2800 }, gain: 0.10 },
    ],
  },

  /**
   * エッジから吹き抜ける風(2026-08-14 追加)。
   * 「風が子役を運んでくる」演出(lcdanims-extra.js の edge_wind_carry)専用。
   *
   * 既存で一番近いのは cutin_whoosh だが、あれは「一撃で通り過ぎる」音で
   * 風が吹き続ける画に合わない(尾が短く、絵柄が着地する前に鳴り終わる)。
   * ここは 0.9 秒かけて左右にパンしながら抜けていく、長めの風にしてある。
   */
  wind_gust: {
    voices: [
      { type: 'noise', dur: 0.90, env: { a: 0.18, d: 0.24, s: 0.55, r: 0.28 }, filter: { type: 'bandpass', freq: 420, freqTo: 2600, q: 1.1 }, gain: 0.26, pan: 0.6 },
      { type: 'noise', dur: 0.86, delay: 0.10, env: { a: 0.20, d: 0.24, s: 0.5, r: 0.26 }, filter: { type: 'bandpass', freq: 900, freqTo: 3600, q: 1.6 }, gain: 0.18, pan: -0.6 },
      { type: 'sine', freqFrom: 210, freqTo: 96, dur: 0.80, env: { a: 0.14, d: 0.26, s: 0.4, r: 0.24 }, gain: 0.12 },
    ],
  },

  /** ゾーン終了 → 母体ATへ復帰。ふっと戻ってくる */
  zone_return: {
    voices: [
      { type: 'triangle', freqFrom: 1567.98, freqTo: 783.99, dur: 0.26, env: { a: 0.006, d: 0.20, s: 0.2, r: 0.12 }, gain: 0.12 },
      { type: 'sine', freq: 523.25, dur: 0.36, delay: 0.22, env: { a: 0.01, d: 0.30, s: 0, r: 0.15 }, gain: 0.13 },
      { type: 'sine', freq: 784, dur: 0.36, delay: 0.28, env: { a: 0.01, d: 0.30, s: 0, r: 0.15 }, gain: 0.09 },
      { type: 'noise', dur: 0.30, env: { a: 0.04, d: 0.24, s: 0, r: 0.10 }, filter: { type: 'bandpass', freq: 3200, freqTo: 1200, q: 3 }, gain: 0.08 },
    ],
  },
};

/**
 * 別名。シナリオ側の表記ゆれや、まだ専用音を作っていない名前を吸収する。
 * ここに書いておけば「未定義プリセット」の警告が出ない。
 */
export const SFX_ALIASES = {
  lever: 'lever_on',
  stop: 'reel_stop',
  bell: 'bell_win',
  rare: 'rare_flag',
  chance: 'chance_flag',
  shark: 'shark_bite',
  alarm: 'alarm_beep',
  payout: 'payout_tick',
  fanfare: 'fanfare_big',
  bonus_fanfare: 'fanfare_big',
  ending_fanfare: 'fanfare_ending',
  cutin: 'cutin_whoosh',
  whoosh: 'cutin_whoosh',
  freeze: 'freeze_hit',
  premium: 'freeze_hit',
  tenpai_win: 'tenpai_strong',
  spot_terminate: 'error_buzz',
  fail: 'error_buzz',
  // U13「AWSあるある分岐予兆」のハズレ音。呼び名の揺れを吸収する
  bubu: 'buzzer_wrong',
  wrong: 'buzzer_wrong',
  set_continue: 'upgrade_chime',
  level_up: 'upgrade_chime',
  // エンディングのファンファーレは専用音を作らず既存を共用する
  ed_fanfare: 'fanfare_ending',
};

/**
 * 成立役 → 効果音。main.js の judge / leverOn 配線で使う想定。
 * flags.js の id と対応(LOSE は無音)。
 */
export const FLAG_SFX = {
  REPLAY: 'replay_win',
  BELL: 'bell_win',
  ALARM: 'alarm_beep',
  WEAK_CHERRY: 'cherry_win',
  STRONG_CHERRY: 'cherry_strong',
  MELON: 'melon_win',
  CHANCE: 'chance_flag',
  SHARK: 'shark_bite',
  GHOST: 'ghost_seven',
  LOSE: null,
};

// ── BGM ────────────────────────────────────────────
/**
 * BGMは「1小節16ステップ(16分音符)」のグリッドで表現する。
 *
 * {
 *   bpm: 96,
 *   gain: 0.30,                        // この曲の音量
 *   transpose: 0,                      // 全体の移調(半音)
 *   chords: [ { root: 57, notes: [0,3,7,10] }, ... ],  // 1要素 = 1小節。root はMIDIノート番号
 *   parts: [
 *     {
 *       name: 'arp',
 *       type: 'triangle',              // オシレータ波形
 *       pitchMode: 'chord'|'semitone', // 省略時 'chord'(steps の値がコード構成音のindex)
 *       octave: 12,                    // 半音単位の移動(12 = 1オクターブ上)
 *       gain: 0.3, durSteps: 1.2,      // 音の長さ(ステップ数)
 *       env: {a,d,s,r}, filter: {...},
 *       chordAll: false,               // true ならコード全音を同時に鳴らす(パッド用)
 *       steps: [0, null, 1, 2, ...],   // 配列長は自由。絶対ステップの剰余で参照される
 *     },
 *   ],
 *   drums: { kick:'x---', snare:'----', hat:'--x-', gain: 0.5 },
 *   // 'x' = 強打 / 'o' = 弱打 / '-' = 休符。長さ自由(剰余で参照)
 * }
 *
 * MIDIノート番号のメモ: 48=C3 / 53=F3 / 55=G3 / 57=A3 / 60=C4 / 62=D4 / 65=F4
 */

/** @type {Record<string, object>} */
export const BGM_PATTERNS = {
  /** 通常時(Free Tier)。落ち着いたローファイ Am7-Fmaj7-Cmaj7-G7 */
  bgm_normal: {
    name: '通常時 / Free Tier',
    bpm: 94,
    gain: 0.30,
    chords: [
      { root: 57, notes: [0, 3, 7, 10] },  // Am7
      { root: 53, notes: [0, 4, 7, 11] },  // Fmaj7
      { root: 48, notes: [0, 4, 7, 11] },  // Cmaj7
      { root: 55, notes: [0, 4, 7, 10] },  // G7
    ],
    parts: [
      {
        name: 'arp', type: 'triangle', octave: 12, gain: 0.30, durSteps: 1.4,
        env: { a: 0.006, d: 0.14, s: 0.25, r: 0.12 },
        filter: { type: 'lowpass', freq: 2600 },
        steps: [0, null, 1, 2, null, 3, 2, null, 0, null, 1, 2, null, 2, 1, null],
      },
      {
        name: 'bass', type: 'sine', octave: -12, gain: 0.42, durSteps: 2.6,
        env: { a: 0.01, d: 0.22, s: 0.45, r: 0.14 },
        steps: [0, null, null, null, null, null, 0, null, null, null, 2, null, null, null, null, null],
      },
      {
        name: 'pad', type: 'sawtooth', octave: 0, gain: 0.09, durSteps: 15, chordAll: true,
        env: { a: 0.55, d: 0.60, s: 0.55, r: 0.70 },
        filter: { type: 'lowpass', freq: 900 },
        steps: [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
      },
    ],
    drums: {
      gain: 0.42,
      kick: 'x-------x-------',
      snare: '----x-------x---',
      hat: '--x---x---x---x-',
    },
  },

  /** CZ中。緊張感のある8ビート Am-F-G-E7 */
  bgm_cz: {
    name: 'チャンスゾーン',
    bpm: 132,
    gain: 0.32,
    chords: [
      { root: 57, notes: [0, 3, 7] },       // Am
      { root: 53, notes: [0, 4, 7] },       // F
      { root: 55, notes: [0, 4, 7] },       // G
      { root: 52, notes: [0, 4, 7, 10] },   // E7
    ],
    parts: [
      {
        name: 'arp', type: 'square', octave: 12, gain: 0.18, durSteps: 0.9,
        env: { a: 0.003, d: 0.08, s: 0.2, r: 0.05 },
        filter: { type: 'lowpass', freq: 3200 },
        steps: [0, 1, 2, 1, 0, 1, 2, 3, 0, 1, 2, 1, 3, 2, 1, 0],
      },
      {
        name: 'bass', type: 'sawtooth', octave: -12, gain: 0.26, durSteps: 0.9,
        env: { a: 0.004, d: 0.10, s: 0.3, r: 0.06 },
        filter: { type: 'lowpass', freq: 700 },
        steps: [0, null, 0, null, 0, null, 0, 0, 0, null, 0, null, 0, null, 0, 0],
      },
      {
        name: 'stab', type: 'triangle', octave: 0, gain: 0.10, durSteps: 2, chordAll: true,
        env: { a: 0.01, d: 0.18, s: 0.1, r: 0.10 },
        filter: { type: 'lowpass', freq: 1800 },
        steps: [0, null, null, null, null, null, null, null, 0, null, null, null, null, null, null, null],
      },
    ],
    drums: {
      gain: 0.5,
      kick: 'x---x---x---x---',
      snare: '----x-------x---',
      hat: 'x-x-x-x-x-x-x-xx',
    },
  },

  /** ボーナス中。明るいメジャー C-G-Am-F */
  bgm_bonus: {
    name: 'ボーナス',
    bpm: 140,
    gain: 0.32,
    chords: [
      { root: 48, notes: [0, 4, 7] },   // C
      { root: 55, notes: [0, 4, 7] },   // G
      { root: 57, notes: [0, 3, 7] },   // Am
      { root: 53, notes: [0, 4, 7] },   // F
    ],
    parts: [
      {
        name: 'lead', type: 'square', pitchMode: 'semitone', octave: 24, gain: 0.16, durSteps: 1.6,
        env: { a: 0.004, d: 0.12, s: 0.4, r: 0.10 },
        filter: { type: 'lowpass', freq: 4200 },
        steps: [
          0, null, 4, null, 7, null, 4, null, 12, null, null, 7, null, 4, null, null,
          7, null, 4, null, 0, null, 4, null, 7, null, null, 9, null, 7, null, null,
        ],
      },
      {
        name: 'arp', type: 'triangle', octave: 12, gain: 0.16, durSteps: 0.9,
        env: { a: 0.003, d: 0.08, s: 0.2, r: 0.05 },
        steps: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 0, 1],
      },
      {
        name: 'bass', type: 'sawtooth', octave: -12, gain: 0.28, durSteps: 1.2,
        env: { a: 0.004, d: 0.12, s: 0.3, r: 0.06 },
        filter: { type: 'lowpass', freq: 800 },
        steps: [0, null, 0, null, 2, null, 0, null, 0, null, 0, null, 2, null, 1, null],
      },
    ],
    drums: {
      gain: 0.55,
      kick: 'x--x--x---x-x---',
      snare: '----x-------x---',
      hat: 'x-xxx-x-x-xxx-x-',
    },
  },

  /** AS RUSH。疾走感のある Dm-Bb-F-C */
  bgm_rush: {
    name: 'Auto Scaling RUSH',
    bpm: 162,
    gain: 0.34,
    chords: [
      { root: 50, notes: [0, 3, 7] },   // Dm
      { root: 46, notes: [0, 4, 7] },   // Bb
      { root: 53, notes: [0, 4, 7] },   // F
      { root: 48, notes: [0, 4, 7] },   // C
    ],
    parts: [
      {
        name: 'lead', type: 'sawtooth', pitchMode: 'semitone', octave: 24, gain: 0.13, durSteps: 1.0,
        env: { a: 0.003, d: 0.10, s: 0.35, r: 0.08 },
        filter: { type: 'lowpass', freq: 3600 },
        steps: [
          0, null, 7, null, 12, null, 7, 10, 12, null, 7, null, 5, null, 3, null,
          0, null, 7, null, 12, null, 15, null, 12, null, 10, null, 7, null, 5, null,
        ],
      },
      {
        name: 'arp', type: 'square', octave: 12, gain: 0.09, durSteps: 0.8,
        env: { a: 0.002, d: 0.06, s: 0.15, r: 0.04 },
        filter: { type: 'lowpass', freq: 3800 },
        steps: [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1],
      },
      {
        name: 'bass', type: 'sawtooth', octave: -12, gain: 0.30, durSteps: 0.8,
        env: { a: 0.003, d: 0.08, s: 0.35, r: 0.05 },
        filter: { type: 'lowpass', freq: 900 },
        steps: [0, 0, null, 0, 0, null, 0, 0, 0, 0, null, 0, 0, null, 0, 0],
      },
    ],
    drums: {
      gain: 0.6,
      kick: 'x---x-x-x---x-x-',
      snare: '----x-------x---',
      hat: 'xoxoxoxoxoxoxoxx',
    },
  },

  /** ホットスタンバイ / 待機。静かで不安なアンビエント */
  bgm_standby: {
    name: 'ホットスタンバイ',
    bpm: 76,
    gain: 0.26,
    chords: [
      { root: 45, notes: [0, 7, 10] },      // Am(sus感)
      { root: 45, notes: [0, 5, 10] },      // Asus4
      { root: 43, notes: [0, 7, 10] },      // G
      { root: 41, notes: [0, 7, 11] },      // F
    ],
    parts: [
      {
        name: 'pad', type: 'sawtooth', octave: 12, gain: 0.11, durSteps: 15, chordAll: true,
        env: { a: 1.10, d: 0.80, s: 0.55, r: 1.20 },
        filter: { type: 'lowpass', freq: 620 },
        steps: [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
      },
      {
        name: 'bell', type: 'triangle', octave: 24, gain: 0.09, durSteps: 6,
        env: { a: 0.01, d: 0.90, s: 0.05, r: 0.60 },
        filter: { type: 'lowpass', freq: 3200 },
        steps: [null, null, null, null, 0, null, null, null, null, null, null, null, 2, null, null, null],
      },
      {
        name: 'bass', type: 'sine', octave: -12, gain: 0.34, durSteps: 8,
        env: { a: 0.06, d: 0.60, s: 0.4, r: 0.50 },
        steps: [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
      },
    ],
    drums: {
      gain: 0.22,
      kick: 'x---------------',
      snare: '----------------',
      hat: '--------o-------',
    },
  },

  /** エンディング(re:Invent)。壮大なメジャー C-Am-F-G */
  bgm_ending: {
    name: 're:Invent エンディング',
    bpm: 116,
    gain: 0.34,
    chords: [
      { root: 48, notes: [0, 4, 7, 11] },  // Cmaj7
      { root: 57, notes: [0, 3, 7, 10] },  // Am7
      { root: 53, notes: [0, 4, 7, 11] },  // Fmaj7
      { root: 55, notes: [0, 4, 7, 10] },  // G7
    ],
    parts: [
      {
        name: 'lead', type: 'triangle', pitchMode: 'semitone', octave: 24, gain: 0.16, durSteps: 3,
        env: { a: 0.02, d: 0.30, s: 0.5, r: 0.24 },
        filter: { type: 'lowpass', freq: 3600 },
        steps: [
          7, null, null, null, 4, null, null, null, 0, null, null, null, 4, null, 7, null,
          12, null, null, null, 9, null, null, null, 7, null, null, null, 4, null, null, null,
        ],
      },
      {
        name: 'pad', type: 'sawtooth', octave: 0, gain: 0.10, durSteps: 15, chordAll: true,
        env: { a: 0.40, d: 0.60, s: 0.6, r: 0.70 },
        filter: { type: 'lowpass', freq: 1200 },
        steps: [0, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
      },
      {
        name: 'bass', type: 'sine', octave: -12, gain: 0.40, durSteps: 3,
        env: { a: 0.01, d: 0.26, s: 0.4, r: 0.16 },
        steps: [0, null, null, null, 0, null, null, null, 2, null, null, null, 0, null, null, null],
      },
    ],
    drums: {
      gain: 0.45,
      kick: 'x---x---x---x---',
      snare: '----x-------x-x-',
      hat: 'x-x-x-x-x-x-x-x-',
    },
  },
};

/** BGM名の別名(シナリオ側の表記ゆれ吸収) */
export const BGM_ALIASES = {
  bgm_free_tier: 'bgm_normal',
  bgm_freetier: 'bgm_normal',
  bgm_as_rush: 'bgm_rush',
  bgm_asrush: 'bgm_rush',
  bgm_hot_standby: 'bgm_standby',
  bgm_recovery: 'bgm_standby',
  bgm_ed: 'bgm_ending',
  bgm_reinvent: 'bgm_ending',
  // Phase 5 のゾーン/上位AT。専用曲は作らず、下の MODE_BGM と同じ曲へ寄せる。
  // ここを MODE_BGM と一致させておくのが重要で、シナリオの bgm.change と
  // modeEnter の自動切替が同じ曲に解決される = changeBgm が no-op になり、
  // 「突入演出のたびに曲が鳴り直す」不具合を防げる。
  bgm_spot: 'bgm_cz',
  bgm_burst: 'bgm_rush',
  bgm_graviton: 'bgm_rush',
  bgm_sfn: 'bgm_bonus',
  bgm_serverless: 'bgm_bonus',
  bgm_multiregion: 'bgm_ending',
};

/**
 * モードID → BGM名。modeEnter でこの表を引いて changeBgm する想定。
 * 未定義のモード(短命な上乗せゾーン等)は BGM を変えない = 親モードの曲が続く。
 *
 * 曲数は6曲なので、近い性格のモードで共有している。
 * 専用曲がほしくなったら BGM_PATTERNS に足してこの表を書き換えるだけでよい。
 */
export const MODE_BGM = {
  FREE_TIER: 'bgm_normal',
  CZ: 'bgm_cz',
  BONUS: 'bgm_bonus',
  AS_RUSH: 'bgm_rush',
  /*
   * U11 の RUSH 3種。専用曲は作らず性格の近い曲を割り当てる。
   *   CloudFront … 払い出しが飛び続けるのでボーナス寄りの高揚
   *   Aurora     … 純増が育つ RUSH なので RUSH 曲
   *   ヒーロー   … プレミアなのでエンディング曲を借りて「特別な5G」にする
   */
  CF_RUSH: 'bgm_bonus',
  AURORA_RUSH: 'bgm_rush',
  HERO_RUSH: 'bgm_ending',
  // 派生ゾーン(RUSHの上に積まれる)
  SPOT_ZONE: 'bgm_cz',          // 中断通知の緊張感
  EC2_BURST: 'bgm_rush',
  GRAVITON: 'bgm_rush',
  RESERVED: 'bgm_rush',
  // 上乗せ特化ゾーン
  CLOUDFRONT: 'bgm_bonus',
  KINESIS: 'bgm_bonus',
  STEP_FUNCTIONS: 'bgm_bonus',
  // 上位AT
  SERVERLESS_RUSH: 'bgm_bonus',
  MULTI_REGION: 'bgm_ending',
  // 引き戻し・エンディング
  HOT_STANDBY: 'bgm_standby',
  ROUTE53_FAILOVER: 'bgm_standby',
  REINVENT_ED: 'bgm_ending',
};
