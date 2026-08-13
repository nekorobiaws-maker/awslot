/**
 * RESULT. 50回転スコアアタックのリザルト。docs/BACKLOG.md 「M: メカニクス改修」
 *
 * 50回転を使い切った時点で GameFlow が全モードを畳んでここへ移す。
 * このモードはゲームが進まない終端状態で、次の入力(R / レバー / ↑)で
 * 新しいセッションが始まる。
 *
 * ■ このファイルは「数字を保持するだけ」
 *   リザルト画面の描画は後続タスク(P2)の担当。ここでは描画に必要な値を
 *   すべて state に載せておくことに徹する。
 *   `state.stage` には既存のステージID(stage_prov)を入れてある。
 *   render/lcd.js は未知の modeId を default 分岐で通常時として描くため、
 *   専用描画が入るまでの間も背景が欠けたり例外になったりしない。
 */

import { SESSION } from '../../data/session.js';

export const result = {
  id: 'RESULT',
  name: 'RESULT',
  type: 'RESULT',

  onEnter(state, params = {}) {
    state.short = 'RESULT';
    /** 既存ステージIDを入れておく(専用描画が入るまでのフォールバック) */
    state.stage = 'stage_prov';

    /** セッションのスコア = 差枚(買い取りを含む) */
    state.score = Math.round(params.score ?? 0);
    /** 買い取り前の差枚 */
    state.baseScore = Math.round(params.baseScore ?? 0);
    /** 買い取り合計枚数 */
    state.buyout = Math.round(params.buyout ?? 0);
    /** 買い取り明細 [{label, kind, games, perGame, coins}] */
    state.breakdown = params.breakdown ?? [];
    /** 終了時点のクレジット */
    state.finalCredit = params.finalCredit ?? 0;
    /** 総投入 / 総払出(検証用) */
    state.totalIn = params.totalIn ?? 0;
    state.totalOut = params.totalOut ?? 0;
    /** 消化した回転数(= SESSION.totalGames) */
    state.totalGames = params.totalGames ?? SESSION.totalGames;
    /** セッション中の戦績 */
    state.bonusCount = params.bonusCount ?? 0;
    state.atCount = params.atCount ?? 0;
    state.czCount = params.czCount ?? 0;
    state.zoneCount = params.zoneCount ?? 0;
    state.endingCount = params.endingCount ?? 0;
    /** 終了時に滞在していたモード(「途中で終わった」表示に使う) */
    state.endedIn = params.endedIn ?? null;
    /** スコアの評価ランク */
    state.rank = rankOf(state.score);

    state.telop = state.buyout > 0
      ? `RESULT ${state.score}枚(買い取り +${state.buyout}枚)— R でもう一度`
      : `RESULT ${state.score}枚 — R でもう一度`;
  },

  /** 終端状態なのでゲームは進まない(flow 側で BET も止めている) */
  onGame() {
    return null;
  },

  residualValue() {
    return [];
  },
};

/**
 * スコアのランク付け。平均200〜300枚・上振れ1000枚超という
 * 分散設計(BACKLOG「M」)に合わせた刻み。
 */
export function rankOf(score) {
  if (score >= 2222) return { id: 'REINVENT', label: 're:INVENT KEYNOTE', color: '#ff2fa0' };
  if (score >= 1000) return { id: 'S', label: 'MULTI-REGION', color: '#ffd166' };
  if (score >= 600)  return { id: 'A', label: 'AUTO SCALING', color: '#7bf7d0' };
  if (score >= 300)  return { id: 'B', label: 'STEADY STATE', color: '#8ab4ff' };
  if (score >= 100)  return { id: 'C', label: 'WARM POOL', color: '#c8d2e8' };
  if (score > 0)     return { id: 'D', label: 'COLD START', color: '#9aa6bf' };
  return { id: 'E', label: 'THROTTLED', color: '#7a8399' };
}
