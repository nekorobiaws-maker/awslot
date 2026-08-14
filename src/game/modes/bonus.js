/**
 * M05〜M07. ボーナス層。DESIGN.md 2.2 / 3.7
 *
 *   LAMBDA_REG  シャークボーナス   6G          (RUSH当選率 12%)
 *   S3_BIG      ゴーストボーナス   8G          (RUSH当選率 45%)
 *   DYNAMO_BIG  ゴーストボーナスSP 1セット6G / 継続50%(RUSH当選率 85%)
 *   ※ G数と当選率の正は data/modes.js の BONUS_SPECS(ここは読み手向けの写し)
 *
 * 仕様変更(2026-08-13 ユーザー決定):
 *   旧仕様の「固定純増n枚/G」方式を撤去し、実機と同じ
 *   **ボーナス中はベルが約1/1.4で揃い、揃うたびに15枚** 払い出す方式にした
 *   (当初は 1/1.2。U22 でレア役を厚くしたぶんベルから取った)。
 *   小役テーブルは data/flags.js の BONUS_FLAGS(flagTable: 'BONUS')。
 *   払出は通常ゲームと同じく「停止形から判定した小役払出」がそのまま使われるため、
 *   このハンドラは payoutPerGame を返さない(= flow.js は lastResult.payout を払い出す)。
 *
 * ── U11(2026-08-14 ユーザー指示)/ ボーナス中のRUSH抽選 ──────────
 *
 * 旧実装は突入時に atRate を1回引いて RUSH の当落を決めていた。
 * つまりボーナス消化中は **結果がもう決まっていて、引いても何も起きない** 時間だった。
 *
 * 新実装では「**ボーナス中にレア役を引けたら RUSH 抽選**」が基本経路になる:
 *   ・**レア役が成立するたびに1回抽選**(U22。ベル・リプレイでは抽選しない)
 *   ・強い役ほど当選率が高い(data/rushes.js の RUSH_ENTRY.rateByFlag)
 *   ・サメ揃い・ゴースト揃いはボーナスの格にかかわらず当選確定(alwaysWinFlags)
 *   ・ボーナスの格(bonusMult)が全体の当選率を決める
 *     → 総合のRUSH突入率は旧 atRate と同じ 0.12 / 0.45 / 0.85 に着地する
 *       (シャークボーナスも同じロジック = U28)
 *   ・当選したらその場で告知。**どのRUSHへ行くかはボーナス終了時に確定**する
 *     (種別を state に早く載せると演出から先読みできてしまうため)
 *
 * ── U22(2026-08-14)/ 契機をレア役のみに ──────────────────────
 * 旧: 子役(払出のある成立役)すべてが契機 = ほぼ毎ゲーム抽選していたので、
 *     「ベルが揃った」も「スイカを引いた」も同じ重さに見えていた。
 * 新: **レア役だけが契機**。ボーナス中のレア役出現率は data/flags.js の BONUS_FLAGS で
 *     引き上げてあり(合計 1/4.7)、契機の総数は減っても総合当選率は据え置き。
 *
 * 突入は必ず BONUS_READY(入賞待ち)経由。当選 → 図柄を揃える → ここへ来る。
 *
 * ── U32(2026-08-14 ユーザー指示)/ 引き戻し成功の受け皿にもなった ──────────
 * RUSH から転落 → ホットスタンバイ成功、の復帰先が
 * 「同じRUSHへ直接復帰」から **ゴーストボーナス**(data/rushes.js の RECOVERY_BONUS / S3_BIG)
 * へ変わった。復帰の入口も通常の当たりと同じ BONUS_READY 経由で、
 * RUSHへ戻れるかどうかは **このボーナス中にレア役を引けるか**(当選率 45%)で決まる。
 * ※ 2026-08-14 検証: 採用しなかったシャークボーナス案(12%)の名前が残っていたので修正。
 * その場合だけ params.fromRecovery が立つ(演出・液晶が「復旧」を名乗るための目印で、
 * 抽選・払出はまったく同じ)。
 */

import { drawBonusRushWin, drawRushType } from '../lottery.js';
import { BONUS_SPEC_BY_ID } from '../../data/modes.js';
import { RUSH_ENTRY, RUSH_SPEC_BY_ID, expectedRushGain } from '../../data/rushes.js';
import { BET_PER_GAME, BONUS_NET_PER_GAME } from '../../data/payouts.js';
import { residualLine } from '../../data/session.js';

export const bonus = {
  id: 'BONUS',
  name: 'BONUS',
  type: 'BONUS',
  /** 消化中は専用の小役テーブル(ベル約1/1.4 / 15枚)を引く */
  flagTable: 'BONUS',

  onEnter(state, params = {}) {
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
    /**
     * RUSH当選(U11)。突入時点では **必ず未当選** で始まる。
     * レバーONフリーズの恩恵など「RUSH級の恩恵」だけは params で確定を持ち込める。
     */
    state.rushWin = Boolean(params.rushGuaranteed);
    /** プレミア振り分け(ヒーローRUSHが 1/4 になる)契機で当選したか */
    state.rushPremium = Boolean(params.premium);
    /** RUSHを引き当てた役(液晶・演出が「何で当たったか」を出すために持つ) */
    state.rushWinFlag = params.rushGuaranteed ? 'FREEZE' : null;
    /**
     * 引き戻し(ホットスタンバイ)成功から入ったボーナスか(U32)。
     * 抽選も払出もまったく同じで、**演出・液晶が「復旧」と名乗るためだけ**の目印。
     * 転落元のモードIDは params.recoveryFrom に入る(表示用)。
     */
    state.fromRecovery = Boolean(params.fromRecovery);
    state.recoveryFrom = params.recoveryFrom ?? null;
    state.telop = {
      S3_BIG: '11ナインの耐久性。レア役を引けば RUSH 抽選!!',
      DYNAMO_BIG: '無限にスケールする。レア役を引けば RUSH 抽選!!',
      LAMBDA_REG: '15分でタイムアウトします。レア役を引けば RUSH 抽選!!',
    }[spec.id] ?? '';
  },

  onGame(state, g) {
    const spec = BONUS_SPEC_BY_ID[state.bonusId];
    const events = [];
    state.remaining--;
    state.playedGames++;
    // 払出は小役テーブル(BONUS_FLAGS)そのもの。ベルなら15枚
    const payout = g.payout ?? 0;
    state.paidOut += payout;
    state.gained += payout - BET_PER_GAME;
    if (g.win === 'BELL') state.bellCount++;

    /* ── レア役契機のRUSH抽選(U11 の本丸 / U22 でレア役のみ)──────────
     *
     * 【必ずゲーム抽選RNGで引く】RUSH突入そのものを決める抽選なので、
     * 演出RNGからは絶対に引かない。
     * レア役以外は drawBonusRushWin が乱数を消費せず false を返す(= 抽選しない)。
     * 当選済みのあとは引かない = 1回のボーナスで当選は1回だけ。
     */
    let telop = null;
    if (!state.rushWin) {
      if (drawBonusRushWin(g.rng, g.flag, spec.id)) {
        state.rushWin = true;
        state.rushWinFlag = g.flag;
        state.rushPremium = RUSH_ENTRY.premiumFlags.includes(g.flag);
        events.push({
          name: 'paramChange',
          payload: {
            param: 'rush_win', value: g.flag, delta: 0, premium: state.rushPremium,
          },
        });
        // 「何のRUSHか」はまだ出さない(種別は終了時に確定する)
        telop = 'RUSH 当選!! — ボーナス消化後に突入';
      }
    }

    if (state.remaining > 0) return { telop, events };

    // ── セット継続型(DynamoDB BIG)──────────────
    if (state.isSet && g.rng.chance(spec.continueRate)) {
      state.setCount++;
      state.remaining = state.total;
      state.onDemand = g.rng.chance(0.25);
      return {
        events,
        setEnd: { result: 'CONTINUE', continued: true, healthLabel: 'CAPACITY OK' },
        // 2026-08-14 ユーザー指摘 U1: 継続ジャッジは「継続した」と一目で分かる文言にする
        // (旧: オンデマンドモードへ切替 / キャパシティ十分 — どちらも継続と読めなかった)
        telop: `ボーナス継続!! — SET ${state.setCount} へ`,
      };
    }

    if (state.rushWin) {
      /**
       * RUSH種別の振り分けはここで初めて引く(U11)。
       * 消化中に引いてしまうと state 経由で演出から先読みできてしまうため、
       * 「当選したことは即告知 / 何のRUSHかは突入して初めて分かる」に分けている。
       */
      const rushId = drawRushType(g.rng, state.rushPremium);
      const rushSpec = RUSH_SPEC_BY_ID[rushId];
      return {
        events,
        setEnd: { result: 'BONUS_END', continued: false, rushId },
        transition: { to: rushId, params: {} },
        telop: `${rushSpec?.short ?? 'RUSH'} 突入!!`,
      };
    }
    return {
      events,
      transition: {
        to: 'FREE_TIER',
        params: { subState: spec.onAtFail?.nextSubState ?? 'COLD_START', games: 0 },
      },
      telop: 'RUSH 非当選… 高確から再スタート',
    };
  },

  /**
   * 100回転終了時の残存価値(data/session.js)。
   * 残ゲーム数 × ボーナス中の期待純増(BONUS_NET_PER_GAME = **8.45枚/G**)。
   * 数値は data/payouts.js が data/flags.js の BONUS_FLAGS から算出した実値で、
   * ここに書き写さない(U22 でベルが 1/1.2 → 1/1.4 に下がり 9.7 → 8.45 になった際、
   * 古い数字だけが残って読み手を誤らせた。2026-08-14 検証)。
   * セット継続型でも「まだ引いていない継続」は買い取らない。
   *
   * U11: **確定済みのRUSH当選も買い取る**。
   * レア役契機は当たった瞬間に「RUSH 当選!!」と告知してしまうので、
   * そのまま100回転を使い切ると「見せられたのに0枚」になる(旧実装は
   * 当選が伏せられていたので気づかれなかったが、いまは明確な不公平)。
   * 種別はまだ引いていないため、振り分けで重み付けした期待獲得で買う。
   */
  residualValue(state) {
    const lines = [];
    if (state.remaining > 0) {
      lines.push(residualLine(`${state.name} 残り`, state.remaining, BONUS_NET_PER_GAME));
    }
    if (state.rushWin) {
      // プレミア契機(フリーズ / ゴースト揃い)は振り分けが違うので期待値も変わる
      lines.push(residualLine(
        'RUSH 当選ぶん(種別は未確定)', 1, expectedRushGain(state.rushPremium), 'stock',
      ));
    }
    return lines;
  },
};
