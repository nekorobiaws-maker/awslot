/**
 * リール配列(21コマ × 3リール)。DESIGN.md 6.4
 *
 * 配列制約: 最大4コマ滑りで必ず引き込めるよう、
 *   「BELL と REPLAY は連続する5コマ窓のどこかに必ず1つ以上存在すること」
 * を満たす。= 同一絵柄の間隔が 4 以下(循環含む)。
 * 検証は verifyStrips() で行える(scripts/verify-reels.mjs から実行)。
 *
 * レア役絵柄(CHERRY/MELON/LAMBDA/GHOST7/SHARKBAR)は5コマ窓制約の対象外。
 * 21コマに5絵柄ぶんの窓制約を同時に満たすのは不可能なため、
 * reelctrl.js 側で「4コマで引き込めない場合は滑りコマ数を拡張して必ず引き込む」
 * (カジュアル方針=取りこぼしなし)としている。
 *
 * Phase 5: REPLAY2(Route 53)と ALARM(Bedrock)を追加した。
 * 追加はどちらも既存の BLANK コマを置き換える形で行い、
 * BELL / REPLAY の並びには一切触れていない(= 5コマ窓制約は不変)。
 */

import { TARGET_SYMBOL } from './flags.js';

export const REEL_LENGTH = 21;

/** 引き込み対象になっている絵柄(重複除去)。存在チェックに使う */
export const PULL_IN_SYMBOLS = [
  ...new Set(Object.values(TARGET_SYMBOL).flat().filter(Boolean)),
];

export const REEL_STRIPS = [
  // ── 左リール ──────────────────────────────
  [
    'BELL',     //  0
    'CHERRY',   //  1
    'REPLAY',   //  2
    'ALARM',    //  3  ← Phase 5(旧 BLANK)
    'BELL',     //  4
    'MELON',    //  5
    'REPLAY',   //  6
    'CHERRY',   //  7
    'BELL',     //  8
    'LAMBDA',   //  9
    'REPLAY',   // 10
    'MELON',    // 11
    'BELL',     // 12
    'REPLAY2',  // 13  ← Phase 5(旧 BLANK)
    'REPLAY',   // 14
    'GHOST7',   // 15
    'BELL',     // 16
    'REPLAY',   // 17
    'SHARKBAR', // 18
    'BELL',     // 19
    'REPLAY',   // 20
  ],
  // ── 中リール ──────────────────────────────
  [
    'BELL',     //  0
    'REPLAY',   //  1
    'MELON',    //  2
    'BELL',     //  3
    'ALARM',    //  4  ← Phase 5(旧 BLANK)
    'REPLAY',   //  5
    'GHOST7',   //  6
    'BELL',     //  7
    'CHERRY',   //  8
    'REPLAY',   //  9
    'REPLAY2',  // 10  ← Phase 5(旧 BLANK)
    'BELL',     // 11
    'LAMBDA',   // 12
    'REPLAY',   // 13
    'SHARKBAR', // 14
    'BELL',     // 15
    'REPLAY',   // 16
    'MELON',    // 17
    'BELL',     // 18
    'BLANK',    // 19
    'REPLAY',   // 20
  ],
  // ── 右リール ──────────────────────────────
  [
    'REPLAY',   //  0
    'BELL',     //  1
    'REPLAY2',  //  2  ← Phase 5(旧 BLANK)
    'REPLAY',   //  3
    'MELON',    //  4
    'BELL',     //  5
    'ALARM',    //  6  ← Phase 5(旧 BLANK)
    'REPLAY',   //  7
    'GHOST7',   //  8
    'BELL',     //  9
    'CHERRY',   // 10
    'REPLAY',   // 11
    'BELL',     // 12
    'MELON',    // 13
    'REPLAY',   // 14
    'LAMBDA',   // 15
    'BELL',     // 16
    'SHARKBAR', // 17
    'REPLAY',   // 18
    'BLANK',    // 19
    'BELL',     // 20
  ],
];

/**
 * 5コマ窓制約の検証。
 * @param {string[]} required 5コマ窓に必ず存在すべき絵柄ID
 * @returns {{ok: boolean, errors: string[]}}
 */
export function verifyStrips(required = ['BELL', 'REPLAY'], windowSize = 5, targets = PULL_IN_SYMBOLS) {
  const errors = [];
  REEL_STRIPS.forEach((strip, r) => {
    if (strip.length !== REEL_LENGTH) {
      errors.push(`reel${r}: 長さが ${strip.length} (期待 ${REEL_LENGTH})`);
    }
    for (const sym of required) {
      for (let i = 0; i < strip.length; i++) {
        let found = false;
        for (let k = 0; k < windowSize; k++) {
          if (strip[(i + k) % strip.length] === sym) { found = true; break; }
        }
        if (!found) errors.push(`reel${r}: index ${i} からの${windowSize}コマ窓に ${sym} がない`);
      }
    }
    // 引き込み対象の絵柄が1つも無いリールがあると、その役が永久に揃わない。
    // (Phase 5 で REPLAY2 / ALARM を足したので、存在チェックも併せて行う)
    for (const sym of targets ?? PULL_IN_SYMBOLS) {
      if (!strip.includes(sym)) errors.push(`reel${r}: 引き込み対象の ${sym} が1コマも無い`);
    }
  });
  return { ok: errors.length === 0, errors };
}
