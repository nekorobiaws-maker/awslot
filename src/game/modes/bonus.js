/**
 * M05〜M07. ボーナス層。DESIGN.md 2.2 / 3.7
 *
 *   LAMBDA_REG   6G / AT当選30%(非当選なら Warm Pool から再スタート)
 *   S3_BIG      15G / AT確定 + DC初期値抽選
 *   DYNAMO_BIG  1セット15G / 継続70% / AT確定 + DC初期値+2
 *
 * 仕様変更(2026-08-13 ユーザー決定):
 *   旧仕様の「固定純増n枚/G」方式を撤去し、実機と同じ
 *   **ボーナス中はベルが約1/1.2で揃い、揃うたびに15枚** 払い出す方式にした。
 *   小役テーブルは data/flags.js の BONUS_FLAGS(flagTable: 'BONUS')。
 *   払出は通常ゲームと同じく「停止形から判定した小役払出」がそのまま使われるため、
 *   このハンドラは payoutPerGame を返さない(= flow.js は lastResult.payout を払い出す)。
 *
 * レア役は通常時と同じ確率で残してあるので、Lambda REG 中のレア役=AT期待度示唆や
 * ボーナス中のレア役演出(6.5)はこれまでどおり機能する。
 *
 * 突入は必ず BONUS_READY(入賞待ち)経由。当選 → 図柄を揃える → ここへ来る。
 */

import { drawAtWin, drawInitialDc } from '../lottery.js';
import { BONUS_SPEC_BY_ID } from '../../data/modes.js';
import { BET_PER_GAME, BONUS_NET_PER_GAME } from '../../data/payouts.js';
import { residualLine } from '../../data/session.js';

export const bonus = {
  id: 'BONUS',
  name: 'BONUS',
  type: 'BONUS',
  /** 消化中は専用の小役テーブル(ベル約1/1.2 / 15枚)を引く */
  flagTable: 'BONUS',

  onEnter(state, params = {}, ctx) {
    const spec = BONUS_SPEC_BY_ID[params.bonusId] ?? BONUS_SPEC_BY_ID.LAMBDA_REG;
    state.bonusId = spec.id;
    state.name = spec.name;
    state.title = spec.shortName;      // 液晶に出す大文字(BIG BONUS / REG BONUS)
    state.isSet = spec.type === 'set';
    state.total = state.isSet ? spec.setGames : spec.games;
    state.remaining = state.total;
    state.setCount = 1;
    /** 純増ベースの獲得枚数(払出 − BET の累計) */
    state.gained = 0;
    /** 総払出枚数(液晶の内訳表示・検証用) */
    state.paidOut = 0;
    /** 消化した総ゲーム数(セット継続を含む) */
    state.playedGames = 0;
    /** ベルが揃った回数 */
    state.bellCount = 0;
    /** DynamoDB BIG のみ: オンデマンドモード(継続確定)に切り替わったか */
    state.onDemand = false;
    // AT当選とDC初期値は突入時に確定させる(演出は結果を先に知る)
    state.atWin = drawAtWin(ctx.rng, spec.id);
    state.dc = spec.dcInitDist ? drawInitialDc(ctx.rng, spec.id) : 1;
    state.dcBonus = spec.dcBonus ?? 0;
    state.telop = {
      S3_BIG: '11ナインの耐久性。',
      DYNAMO_BIG: '無限にスケールする。',
      LAMBDA_REG: '15分でタイムアウトします。',
    }[spec.id] ?? '';
  },

  onGame(state, g) {
    const spec = BONUS_SPEC_BY_ID[state.bonusId];
    state.remaining--;
    state.playedGames++;
    // 払出は小役テーブル(BONUS_FLAGS)そのもの。ベルなら15枚
    const payout = g.payout ?? 0;
    state.paidOut += payout;
    state.gained += payout - BET_PER_GAME;
    if (g.win === 'BELL') state.bellCount++;

    if (state.remaining > 0) return null;

    // ── セット継続型(DynamoDB BIG)──────────────
    if (state.isSet && g.rng.chance(spec.continueRate)) {
      state.setCount++;
      state.remaining = state.total;
      state.onDemand = g.rng.chance(0.25);
      return {
        setEnd: { result: 'CONTINUE', continued: true, healthLabel: 'CAPACITY OK' },
        telop: state.onDemand
          ? `オンデマンドモードへ切替 — SET ${state.setCount}`
          : `キャパシティ十分 — SET ${state.setCount}`,
      };
    }

    if (state.atWin) {
      return {
        setEnd: state.isSet ? { result: 'BONUS_END', continued: false } : undefined,
        transition: { to: 'AS_RUSH', params: { dc: state.dc + state.dcBonus } },
        telop: 'AUTO SCALING RUSH 突入!!',
      };
    }
    return {
      transition: {
        to: 'FREE_TIER',
        params: { subState: spec.onAtFail?.nextSubState ?? 'COLD_START', games: 0 },
      },
      telop: 'AT 非当選… 高確から再スタート',
    };
  },

  /**
   * 50回転終了時の残存価値(data/session.js)。
   * 残ゲーム数 × ボーナス中の期待純増(ベル約1/1.2 × 15枚 ≒ 9.7枚/G)。
   * セット継続型でも「まだ引いていない継続」は買い取らない。
   */
  residualValue(state) {
    if (!(state.remaining > 0)) return [];
    return [residualLine(`${state.name} 残り`, state.remaining, BONUS_NET_PER_GAME)];
  },
};
