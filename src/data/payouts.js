/**
 * 配当表。DESIGN.md 3.3 の payout をそのまま持つ。
 * 有効ラインは中段横一直線の1ラインのみ(DESIGN.md 3.2)。
 */

import { NORMAL_FLAGS, FLAG_TABLES, DEFAULT_FLAG_TABLE } from './flags.js';

export const BET_PER_GAME = NORMAL_FLAGS.bet;

export const PAYOUT_TABLE = Object.fromEntries(
  NORMAL_FLAGS.flags.map((f) => [f.id, f.payout]),
);

/**
 * 小役テーブルIDごとの配当表。
 * ボーナス中はベルが 15枚 になるなど、同じ役でも払出が変わる(DESIGN.md 3.7)。
 */
export const PAYOUT_TABLES = Object.fromEntries(
  Object.entries(FLAG_TABLES).map(([id, t]) => [
    id, Object.fromEntries(t.flags.map((f) => [f.id, f.payout])),
  ]),
);

/**
 * 中段3コマの停止形から成立役カテゴリを判定する。
 * 判定優先順:
 *   1. GHOST7 / SHARKBAR / MELON / REPLAY / BELL の3つ揃い
 *   2. 左リール中段 CHERRY (単独役)
 *   3. 左リール中段 LAMBDA (チャンス目)
 * @param {string[]} center 中段3コマの絵柄ID [左, 中, 右]
 * @returns {string} 役カテゴリ (WEAK_CHERRY と STRONG_CHERRY は 'CHERRY_ANY' に丸める)
 */
export function categorizeLine(center) {
  const [l, c, r] = center;
  const all = (sym) => l === sym && c === sym && r === sym;
  if (all('GHOST7')) return 'GHOST';
  if (all('SHARKBAR')) return 'SHARK';
  if (all('MELON')) return 'MELON';
  if (all('REPLAY')) return 'REPLAY';
  if (all('REPLAY2')) return 'REPLAY2';
  if (all('ALARM')) return 'ALARM';
  if (all('BELL')) return 'BELL';
  if (l === 'CHERRY') return 'CHERRY_ANY';
  if (l === 'LAMBDA') return 'CHANCE';
  return 'LOSE';
}

/**
 * 役IDから払出枚数を引く。
 * @param {string} flagId
 * @param {string} [tableId] 小役テーブルID('NORMAL' / 'BONUS')
 */
export function payoutOf(flagId, tableId = DEFAULT_FLAG_TABLE) {
  const table = PAYOUT_TABLES[tableId] ?? PAYOUT_TABLE;
  // 当該テーブルに定義の無い役(ボーナス中の REPLAY2 など)は通常時の配当にフォールバック
  return table[flagId] ?? PAYOUT_TABLE[flagId] ?? 0;
}

/**
 * 小役テーブルの1ゲームあたり期待払出枚数。
 * 買い取り(data/session.js)でボーナスの残Gを枚数へ換算するのに使う。
 * @param {string} tableId
 */
export function expectedPayoutPerGame(tableId = DEFAULT_FLAG_TABLE) {
  const table = FLAG_TABLES[tableId] ?? NORMAL_FLAGS;
  return table.flags.reduce(
    (sum, f) => (f.denom === null ? sum : sum + f.payout / f.denom),
    0,
  );
}

/** 通常時の期待純増(参考値。マイナスになる) */
export const NORMAL_NET_PER_GAME = expectedPayoutPerGame('NORMAL') - BET_PER_GAME;

/**
 * ボーナス中の期待純増(枚/G)。
 * ベル約1/1.4 × 15枚 が効くので **8.45枚前後**(U22 の前は 1/1.2 で 9.76枚)。
 * 買い取りではこの値に残ゲーム数を掛ける。
 * ここは BONUS_FLAGS から毎回算出しているので、枚数を語る他所のコメントは
 * この定数を参照して書くこと(数字の写しは陳腐化する)。
 */
export const BONUS_NET_PER_GAME = expectedPayoutPerGame('BONUS') - BET_PER_GAME;
