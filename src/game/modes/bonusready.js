/**
 * M05a. ボーナス入賞待ち(BONUS_READY)。DESIGN.md 2.2 / 3.7
 *
 * 仕様追加(2026-08-13 ユーザー決定 その2):
 * ボーナスは当選した瞬間に消化が始まるのではなく、実機と同じく
 *   「ボーナス確定!」→「ゴースト7を揃えろ!」→ プレイヤーが揃える → 消化開始
 * という手順を踏む。その「揃えろ!」の区間がこのモード。
 *
 *   BIG系(S3 BIG / DynamoDB BIG) … GHOST7(ゴースト7)を揃える
 *   REG (Lambda REG)             … SHARKBAR(サメBAR)を揃える
 *
 * 進行ルール:
 *   - 小役テーブルは通常時のまま(flagTable 未指定 = 'NORMAL')。BETも3枚のまま
 *   - 小役が成立したゲームは小役が優先され、ボーナス図柄は揃わない(リプレイは再遊技)
 *   - ハズレのゲームだけ reelTargetFor() がボーナス図柄を返し、
 *     引き込み(reelctrl の decideStopPosition)で必ず中段に揃う = 目押し不要
 *   - 通常時のハズレは約63%なので、平均 1.6G ほどで揃う(コインが減り続けることはない)
 *
 * 揃った瞬間に BONUS へ遷移する。ボーナス突入演出(サメ噛みつき / 幽霊+7ドン)は
 * modeEnter BONUS を契機にしているため、自動的に「揃った瞬間」の演出になる。
 */

import { BONUS_SPEC_BY_ID } from '../../data/modes.js';
import { BET_PER_GAME, BONUS_NET_PER_GAME } from '../../data/payouts.js';
import { residualLine } from '../../data/session.js';

export const bonusReady = {
  id: 'BONUS_READY',
  name: 'BONUS 入賞待ち',
  type: 'BONUS_READY',

  onEnter(state, params = {}) {
    const spec = BONUS_SPEC_BY_ID[params.bonusId] ?? BONUS_SPEC_BY_ID.LAMBDA_REG;
    state.bonusId = spec.id;
    state.name = `${spec.name} 入賞待ち`;
    state.title = 'BONUS 確定';
    state.shortName = spec.shortName;
    /** 揃えるべき絵柄ID(reelctrl の引き込み目標になる) */
    state.targetSymbol = spec.entrySymbol ?? 'GHOST7';
    /** 液晶・テロップに出す絵柄の呼び名 */
    state.targetLabel = spec.entryLabel ?? 'ボーナス図柄';
    state.games = 0;
    /** 入賞待ち中に小役で拾った純増(参考値。ほぼ0近辺) */
    state.gained = 0;
    /** 揃ったか(液晶のフラッシュ判定用) */
    state.hit = false;
    state.instruction = `${state.targetLabel}を揃えろ!`;
    state.telop = `ボーナス確定!! ${state.instruction}`;
  },

  /**
   * 入賞待ち中のリール引き込み目標(DESIGN.md 6.4)。
   * ハズレのゲームだけボーナス図柄を狙う。小役成立時は null を返して
   * 通常どおり小役を引き込ませる(= 小役優先で、その回は揃わない)。
   * @param {object} state
   * @param {string} flag 今ゲームの成立フラグ
   * @returns {string[]|null} [左, 中, 右] の引き込み目標
   */
  reelTargetFor(state, flag) {
    if (flag !== 'LOSE') return null;
    const s = state.targetSymbol;
    return [s, s, s];
  },

  /**
   * 画面に出す成立役名の上書き。
   * 入賞待ちのハズレは「揃えるゲーム」なので「ハズレ」と表示させない。
   */
  flagLabelFor(state, flag) {
    return flag === 'LOSE' ? `${state.targetLabel} 狙え!` : null;
  },

  onGame(state, g) {
    state.games++;
    state.gained += (g.payout ?? 0) - BET_PER_GAME;

    // 小役成立ゲームは揃わない。指示テロップを出し続けて「まだ揃えろ」を伝える
    if (g.flag !== 'LOSE') {
      state.hit = false;
      return { telop: `${state.instruction}  (${state.games}G)` };
    }

    // ハズレ = 引き込みでボーナス図柄が中段に揃ったゲーム。ここが入賞の瞬間
    state.hit = true;
    return {
      transition: { to: 'BONUS', params: { bonusId: state.bonusId, viaReady: true } },
      telop: `${state.targetLabel} 揃った!!`,
    };
  },

  /**
   * 50回転終了時の残存価値(data/session.js)。
   * 入賞待ちは「ボーナス当選が確定していて、まだ1枚も受け取っていない」状態なので
   * ボーナス1回ぶんを丸ごと買い取る。ここを0にすると
   * 「49回転目にボーナスを引いたのに0枚で終わる」という一番きつい理不尽が残る。
   */
  residualValue(state) {
    const spec = BONUS_SPEC_BY_ID[state.bonusId];
    if (!spec) return [];
    const games = spec.type === 'set' ? spec.setGames : spec.games;
    return [residualLine(`${spec.name} 入賞前(確定)`, games, BONUS_NET_PER_GAME)];
  },
};
