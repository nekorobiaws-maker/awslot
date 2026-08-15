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
 *
 * ── 【重要】このモードは「素通しの中継地点」である(2026-08-14 修正)────────
 *
 * ボーナスは ModeMachine の ENTRY_GATE(modemachine.js)により **必ず** ここを経由する。
 * ゲートは `_push('BONUS', params)` を `_push('BONUS_READY', params)` へ差し替えるだけで、
 * **params は一切加工せずそのまま渡してくる**。
 * つまりここには「本当は BONUS に渡したかったパラメータ」が丸ごと届いている。
 *
 * 以前はこの onGame が `{ bonusId, viaReady }` だけを作り直して BONUS へ渡していたため、
 * レバーONフリーズの恩恵(rushGuaranteed / premium)が **入口で消えていた**。
 * 「FREEZE!! ゴーストボーナスSP + RUSH確定!!」と告知した直後に
 * RUSH確定が無くなる = data/freeze.js の「フリーズは裏切ってはいけない」が
 * 構造的に破れていた状態だった。
 *
 * 対策の原則: **受け取った params を落とさない**。
 * 新しい恩恵パラメータが将来増えても、ここを直さなくても勝手に BONUS へ届く。
 */

import { BONUS_SPEC_BY_ID } from '../../data/modes.js';
import { expectedRushGain } from '../../data/rushes.js';
import { BET_PER_GAME, BONUS_NET_PER_GAME } from '../../data/payouts.js';
import { residualLine } from '../../data/session.js';

export const bonusReady = {
  id: 'BONUS_READY',
  name: 'BONUS 入賞待ち',
  type: 'BONUS_READY',

  onEnter(state, params = {}) {
    const spec = BONUS_SPEC_BY_ID[params.bonusId] ?? BONUS_SPEC_BY_ID.LAMBDA_REG;
    /**
     * 入口ゲートが素通しした params の控え。揃った瞬間にそのまま BONUS へ渡す。
     * ここで拾い忘れると恩恵が消えるので、個別のキーではなく丸ごと保持する。
     */
    state.entryParams = { ...params };
    /**
     * RUSH確定の恩恵(レバーONフリーズ = data/freeze.js の reward)。
     * bonus.js の onEnter が params.rushGuaranteed として読む。
     */
    state.rushGuaranteed = Boolean(params.rushGuaranteed);
    /** RUSH種別がプレミア振り分け(ヒーローRUSH 1/4)になる恩恵 */
    state.premium = Boolean(params.premium);
    state.bonusId = spec.id;
    state.name = `${spec.name} 入賞待ち`;
    state.title = 'BONUS 確定';
    state.shortName = spec.shortName;
    /*
     * 液晶ヘッダの名前(V80-7 / bonus.js と同じ共通仕様で英字へ寄せる)。
     * 「入賞待ち」はこのモードの本質なので英字側にも残す。
     */
    state.headerName = `${spec.shortName} 入賞待ち`;
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
    /*
     * テロップは空にする(2026-08-14 検証指摘 V21-02 / U8)。
     * 突入の瞬間は演出のポップアップ(data/scenarios/bonus.js の
     * 「BONUS 確定 / ゴースト7を揃えろ!」)が言い、
     * 消化中ずっと出すべき指示は液晶の盤面(render/lcd.js の _drawBonusReady)が持つ。
     * ここで同じ文をテロップにも入れると、同じ指示が画面に3か所並ぶ。
     */
    state.telop = '';
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

  /**
   * ══ 入賞までの滞在ゲーム数について(2026-08-14 検証指摘 V21-04)═══════
   *
   * 「?mode=BONUS 直起動で入賞待ちから抜けられない」という報告があったが、
   * ヘッドレスで 60シード × 人の打ち方(停止順ランダム / 待ち時間つき)を回した結果、
   * **抜けられない組み合わせは1つも無かった**(平均 1.7G / 最大 11G)。
   * 通常時のハズレは約60%なので 5G 連続で揃わない確率は約1%あり、
   * 「揃えたのに入賞しない」と読まれたのは
   *   ・小役成立ゲームは揃わない、というルールが画面に書いていなかったこと
   *   ・盤面の (nG) と下部テロップの (nG) が別々に出ていて数字がズレて見えたこと
   * が原因と判断した(どちらも表示側で対処済み。render/lcd.js の _drawBonusReady)。
   * ゲーム側のルール(小役優先・ハズレで必ず揃う)は仕様どおりなので変えていない。
   */
  onGame(state, g) {
    state.games++;
    state.gained += (g.payout ?? 0) - BET_PER_GAME;

    /*
     * 小役成立ゲームは揃わない。
     *
     * ここで「サメBARを揃えろ!(3G)」のような **指示テロップを返さない**(U8)。
     * 同じ指示は液晶の盤面が常設で出しており、テロップにも出すと
     * 同一情報が画面に2つ並ぶ(2026-08-14 検証指摘 V21-02)。
     * 消化ゲーム数も盤面側だけが持つ。
     */
    if (g.flag !== 'LOSE') {
      state.hit = false;
      return null;
    }

    // ハズレ = 引き込みでボーナス図柄が中段に揃ったゲーム。ここが入賞の瞬間
    state.hit = true;
    return {
      transition: {
        to: 'BONUS',
        params: {
          // 受け取ったものを丸ごと引き渡す(恩恵の取りこぼし防止。ファイル冒頭の注記を参照)
          ...state.entryParams,
          bonusId: state.bonusId,
          rushGuaranteed: state.rushGuaranteed,
          premium: state.premium,
          // ゲートを二重に通らないための印。entryParams を展開したあとに必ず立てる
          viaReady: true,
        },
      },
      telop: `${state.targetLabel} 揃った!!`,
    };
  },

  /**
   * 100回転終了時の残存価値(data/session.js)。
   * 入賞待ちは「ボーナス当選が確定していて、まだ1枚も受け取っていない」状態なので
   * ボーナス1回ぶんを丸ごと買い取る。ここを0にすると
   * 「49回転目にボーナスを引いたのに0枚で終わる」という一番きつい理不尽が残る。
   *
   * さらに **RUSH確定の恩恵を持ったまま入賞待ちで終わった場合** は
   * そのぶんも買い取る(bonus.js の residualValue と同じ 'stock' 行)。
   * フリーズで「RUSH確定!!」と告知した以上、揃える前に100回転が尽きても
   * 0枚で流してはいけない。
   */
  residualValue(state) {
    const spec = BONUS_SPEC_BY_ID[state.bonusId];
    if (!spec) return [];
    const games = spec.type === 'set' ? spec.setGames : spec.games;
    const lines = [residualLine(`${spec.name} 入賞前(確定)`, games, BONUS_NET_PER_GAME)];
    if (state.rushGuaranteed) {
      lines.push(residualLine(
        'RUSH 確定ぶん(種別は未確定)', 1, expectedRushGain(state.premium), 'stock',
      ));
    }
    return lines;
  },
};
