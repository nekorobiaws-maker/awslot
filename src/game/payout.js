/**
 * 入賞判定・払出計算。DESIGN.md 3.2 / 3.3
 * 有効ラインは中段横一直線の1ラインのみ。
 */

import { categorizeLine, payoutOf } from '../data/payouts.js';
import { FLAG_BY_ID, DEFAULT_FLAG_TABLE } from '../data/flags.js';

/**
 * @param {string[]} centerLine 中段3コマ [左, 中, 右]
 * @param {string} flag 成立フラグ
 * @param {string} [tableId] 小役テーブルID。ボーナス中はベルが15枚になる(DESIGN.md 3.7)
 * @returns {{win:string, payout:number, matched:boolean, name:string}}
 */
export function judge(centerLine, flag, tableId = DEFAULT_FLAG_TABLE) {
  const category = categorizeLine(centerLine);

  // 弱/強チェリーは停止形が同じなので、成立フラグ側で確定させる
  let win = category;
  if (category === 'CHERRY_ANY') {
    win = flag === 'STRONG_CHERRY' ? 'STRONG_CHERRY' : 'WEAK_CHERRY';
  }

  return {
    win,
    payout: payoutOf(win, tableId),
    // 成立フラグどおりの停止形になったか(カジュアル方針では常に true になるはず)
    matched: win === flag,
    name: FLAG_BY_ID[win]?.name ?? 'ハズレ',
  };
}
