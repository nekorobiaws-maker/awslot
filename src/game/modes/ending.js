/**
 * M20. re:Invent キーノートエンディング。DESIGN.md 2.2 / 3.13
 *
 * 差枚(ENDING.conditions の diffCoins)到達、または ATセット数到達で突入する完走エンディング。
 * 閾値は data/modes.js の ENDING が正(U50 で差枚 2222 → 1500)。
 * 突入判定そのものは差枚を持つ GameFlow 側で行い、
 * ここは「30G消化して Free Tier へ全リセット」だけを担当する。
 *
 * 獲得枚数は「発表された新サービス数」として表示するため、
 * 消化ゲームごとに1つずつサービス名を積んでいく。
 */

import { ENDING } from '../../data/modes.js';
import { residualLine } from '../../data/session.js';

/**
 * エンディング突入時に通常時の前兆から退避してきた当選の預かり所。
 * state に持たせると演出のスナップショット(main.js の getContext)へ乗ってしまい、
 * キーノート中に「この後ボーナスが控えている」ことが読めてしまうため WeakMap に隔離する。
 * @type {WeakMap<object, object|null>}
 */
const CARRIED_WIN = new WeakMap();

export const reinventEd = {
  id: 'REINVENT_ED',
  name: 're:INVENT KEYNOTE',
  type: 'ENDING',

  onEnter(state, params = {}) {
    state.short = 're:INVENT';
    state.total = ENDING.games;
    state.remaining = ENDING.games;
    state.payoutPerGame = ENDING.payoutPerGame;
    state.gained = 0;
    /** 突入契機('diffCoins' / 'atSetCount') */
    state.reason = params.reason ?? 'diffCoins';
    state.diff = params.diff ?? 0;
    state.atSetCount = params.atSetCount ?? 0;
    /** 発表済みの新サービス名 */
    state.announced = [];
    state.telop = 'ラスベガスへようこそ — 完走おめでとう!!';
    // 通常時の前兆が保持していた当選(あれば)。終了時に FREE_TIER へ返す
    CARRIED_WIN.set(state, params.carryWin ?? null);
  },

  onGame(state) {
    state.remaining--;
    const pay = state.payoutPerGame;
    state.gained += pay;

    // 消化ゲームに比例してサービスを発表する(短縮された 5G でも 10件出し切る)
    const progressed = state.total - state.remaining;
    const shown = Math.min(
      ENDING.services.length,
      Math.ceil((progressed / Math.max(1, state.total)) * ENDING.services.length),
    );
    let telop = null;
    while (shown > state.announced.length) {
      const name = ENDING.services[state.announced.length];
      state.announced.push(name);
      telop = `新サービス発表: ${name}`;
    }

    if (state.remaining > 0) return { payoutPerGame: pay, telop };

    // 預かっていた当選は必ず通常時へ返す(freetier.js が短い前兆を組み直して告知する)
    const carryWin = CARRIED_WIN.get(state) ?? null;
    CARRIED_WIN.set(state, null);

    return {
      payoutPerGame: pay,
      setEnd: { result: 'ENDING_END', continued: false, gained: state.gained },
      transition: {
        to: 'FREE_TIER',
        params: { reset: true, telop: 'また無料枠から始めよう。', carryWin },
      },
      telop: 'キーノート終了 — 通常時へリセット',
    };
  },

  residualValue(state) {
    if (!(state.remaining > 0)) return [];
    return [residualLine('re:INVENT キーノート 残り', state.remaining, state.payoutPerGame)];
  },
};
