/**
 * RUSH 3種(CloudFront / Aurora / ヒーロー)と、RUSH共通の終了処理。
 * U11(2026-08-14 ユーザー指示)で新設。仕様値は data/rushes.js。
 *
 *   CF_RUSH     … 直接払い出し特化。毎ゲーム確率でクレジット + **レア役**で確定クレジット
 *   AURORA_RUSH … 純増特化。**レア役**でACU(純増)が上がり、ゲーム数も +1
 *   HERO_RUSH   … 5G固定のプレミア。毎ゲーム抽選でクレジット + **レア役**で +α
 *                 (当選率と枚数の正は data/rushes.js の HERO_RUSH.hitRate / hitCoin。
 *                  文言は同ファイルの heroHitLabel() を使い、数値を書き写さない)
 *
 * ※ 上乗せの契機は3種とも U24(2026-08-14 ユーザー指示)で **レア役のみ** に統一。
 *   判定は data/rareroles.js の isRareRole が唯一の正。
 *
 * オートスケーリングRUSH(ゲーム数特化)は game/modes/asrush.js。
 *
 * ■ 4種が必ず守る共通の契約(液晶・派生ゾーン・買い取りがこれだけを読む)
 *   state.rushId     … RUSHのID(液晶の描き分け)
 *   state.netPerGame … 1ゲームあたりの純増の目安(母体AT準拠のゾーンが読む)
 *   state.remaining / state.total … 残りゲーム数
 *   state.gained     … このRUSHで得た枚数の累計
 *   終了時 setEnd { result:'RUSH_END', rushId } → 引き戻し層(ホットスタンバイ)へ
 */

import { drawCloudFrontHit, drawHeroHit } from '../lottery.js';
import { RUSH_SPEC_BY_ID, recoveryEntryParams } from '../../data/rushes.js';
import { isRareRole } from '../../data/rareroles.js';
import { residualLine } from '../../data/session.js';

/**
 * RUSH終了の共通処理。
 *
 * 4種とも終わり方は同じ「引き戻し層(ホットスタンバイ)へ落ちる」。
 * 転落の告知は **このゲームの画面のまま** 見せ切りたいので onNextSpin を付ける
 * (即時遷移だと modeEnter の後片付けで結果の画が1フレームも見えずに消える。
 *  旧 asrush.js の EXIT に付いていた注意書きと同じ理由)。
 *
 * ── 2026-08-14 しおん指摘 minor-a / 復帰パラメータを4種で統一 ──────────
 * 以前は呼び出し側が resumeParams を自分で作っていたため、
 * AS_RUSH だけ「3台で再開」・他3種は「満額で再開」という不整合があった。
 * いまは **data/rushes.js の recoveryEntryParams が唯一の正**。
 * 引き戻し層の買い取り(recovery.js の resumeValueOf)も同じ値を読む。
 *
 * ── U32(2026-08-14 ユーザー指示)/ 復帰先は「普通のボーナス」──────────
 * 引き戻しに成功しても **同じRUSHへは直接戻らない**。
 * 復帰先は **ゴーストボーナス**(data/rushes.js の RECOVERY_BONUS / S3_BIG。8G ≒ 68枚)で、
 * RUSHへ戻れるかどうかはそのボーナス中にレア役を引けるか次第(当選率 45%)になった。
 * ※ 2026-08-14 検証: ここに採用しなかったシャークボーナス案(12%)の名前が残っていた。
 *   種別・当選率の正は必ず RECOVERY_BONUS を見ること。
 *
 * @param {object} state RUSHのstate
 * @param {object} opts
 * @param {string} opts.telop 終了時のテロップ
 * @param {object} [opts.resumeParams] 復帰パラメータの上書き(通常は指定しない)
 * @returns {{setEnd:object, transition:object, telop:string}}
 */
export function rushEndResult(state, { telop, resumeParams = null }) {
  const params = recoveryEntryParams(state.rushId);
  if (resumeParams) params.resumeParams = resumeParams;
  return {
    setEnd: {
      result: 'RUSH_END',
      rushId: state.rushId,
      continued: false,
      gained: Math.floor(state.gained ?? 0),
    },
    transition: {
      to: 'HOT_STANDBY',
      params,
      onNextSpin: true,
    },
    telop,
  };
}

/**
 * 母体RUSHへゲーム数を上乗せする(派生ゾーンからの上乗せ・スケールアウト用)。
 * ゲーム数が軸のRUSH(AS / Aurora)だけが伸び、それ以外は0を返す。
 * @returns {number} 実際に伸びたゲーム数
 */
export function addRushGames(hostState, n = 1) {
  if (!hostState || !(n > 0)) return 0;
  if (hostState.rushId === 'AS_RUSH') {
    /**
     * AS_RUSH は「EC2の台数 = 残りゲーム数」が不変条件(game/modes/asrush.js の冒頭)。
     * 台数だけ / 残Gだけを動かすと液晶とテロップが食い違うので、必ず両方を同じ値にする。
     *
     * ── U50(2026-08-15)/ 通算上限もここで見る ────────────────────
     * AS_RUSH に maxTotalGames(通算22G)が付いたので、**ゾーン経由の上乗せも
     * 同じ上限に従わせる**。ここを素通しにすると「ゾーンから積めば青天井」という
     * 抜け道になり、一撃770枚という構造上の上限が嘘になる。
     */
    const spec = RUSH_SPEC_BY_ID.AS_RUSH;
    const before = hostState.remaining ?? hostState.units ?? 0;
    const room = Math.max(0, spec.maxTotalGames - (hostState.total ?? before));
    const max = Math.min(spec.maxUnits, before + room);
    hostState.remaining = Math.min(max, before + n);
    hostState.units = hostState.remaining;
    const delta = hostState.remaining - before;
    hostState.total = (hostState.total ?? before) + delta;
    hostState.addedUnits = (hostState.addedUnits ?? 0) + delta;
    hostState.peakUnits = Math.max(hostState.peakUnits ?? 0, hostState.units);
    return delta;
  }
  if (hostState.rushId === 'AURORA_RUSH') {
    const max = RUSH_SPEC_BY_ID.AURORA_RUSH.maxTotalGames;
    const delta = Math.max(0, Math.min(n, max - (hostState.total ?? 0)));
    hostState.remaining += delta;
    hostState.total += delta;
    return delta;
  }
  return 0;
}

// ── M08b. CloudFront RUSH(直接払い出し特化)─────────

const CF = RUSH_SPEC_BY_ID.CF_RUSH;

export const cfRush = {
  id: 'CF_RUSH',
  name: CF.name,
  type: 'AT',

  onEnter(state, params = {}) {
    state.rushId = CF.id;
    state.short = CF.short;
    state.axis = CF.axis;
    state.total = params.games ?? CF.games;
    state.remaining = state.total;
    /** 純増の目安(実際の払い出しはゲームごとに跳ねる)。ゾーン・買い取りが読む */
    state.netPerGame = CF.expectedPerGame;
    state.gained = 0;
    state.playedGames = 0;
    /** キャッシュヒットした回数 */
    state.hits = 0;
    /** 直近のヒット枚数(液晶の大きい数字) */
    state.lastCoin = 0;
    /** いま光っているエッジロケーション */
    state.edge = CF.edges[0];
    state.telop = 'エッジでキャッシュヒットするたびにコインが飛んでくる';
  },

  onGame(state, g) {
    const events = [];
    state.remaining--;
    state.playedGames++;
    // エッジは毎ゲーム順に切り替える(演出と液晶で同じ場所を指すよう state に持つ)
    state.edge = CF.edges[state.playedGames % CF.edges.length];

    // ── 毎ゲームのキャッシュヒット抽選(基本部分。U24 でも変更していない)──
    const hit = drawCloudFrontHit(g.rng);
    // ── **レア役**成立ぶんの確定クレジット(U24: ベル・リプレイでは出ない)──
    const coin = isRareRole(g.flag) ? (CF.coinByFlag[g.flag] ?? 0) : 0;
    const pay = hit + coin;
    state.lastCoin = pay;
    state.gained += pay;
    if (hit > 0) state.hits++;

    let telop = null;
    if (hit > 0) {
      events.push({
        name: 'paramChange',
        payload: { param: 'cf_hit', value: hit, delta: hit, edge: state.edge },
      });
      telop = `CACHE HIT(${state.edge})— +${hit} 枚`;
    }
    if (coin > 0) {
      events.push({
        name: 'paramChange',
        payload: { param: 'cf_win_coin', value: coin, delta: coin, flag: g.flag },
      });
      telop = hit > 0
        ? `HIT + オリジン応答 — 合計 +${pay} 枚`
        : `オリジンから配信 — +${coin} 枚`;
    }
    if (!telop) telop = `キャッシュミス(${state.edge})— 次のリクエストへ`;

    if (state.remaining > 0) return { payoutPerGame: pay, telop, events };

    return {
      payoutPerGame: pay,
      events,
      ...rushEndResult(state, { telop: 'ディストリビューション終了… ホットスタンバイへ' }),
    };
  },

  /** 残りゲーム数 × 1ゲームあたりの期待枚数(まだ引いていない払い出しは期待値で買う) */
  residualValue(state) {
    if (!(state.remaining > 0)) return [];
    return [residualLine(`${CF.short} 残り`, state.remaining, CF.expectedPerGame)];
  },
};

// ── M08c. Aurora RUSH(純増特化)────────────────

const AURORA = RUSH_SPEC_BY_ID.AURORA_RUSH;

export const auroraRush = {
  id: 'AURORA_RUSH',
  name: AURORA.name,
  type: 'AT',

  onEnter(state, params = {}) {
    state.rushId = AURORA.id;
    state.short = AURORA.short;
    state.axis = AURORA.axis;
    state.total = params.games ?? AURORA.initGames;
    state.remaining = state.total;
    /** ACU(Aurora Capacity Unit)がそのまま純増。レア役でスケールアップする */
    state.acu = params.acu ?? AURORA.acuInit;
    state.netPerGame = state.acu;
    state.gained = 0;
    state.playedGames = 0;
    /** ゲーム数が伸びた回数(液晶の「+1G」表示と検証用) */
    state.extended = 0;
    state.peakAcu = state.acu;
    state.telop = `ACU ${state.acu} で起動 — レア役でスケールアップ(+1G)`;
  },

  onGame(state, g) {
    const events = [];
    state.remaining--;
    state.playedGames++;

    /**
     * U24(2026-08-14): スケールアップも +1G も **レア役のときだけ**。
     * 旧実装は「払出のある成立役すべて」だったので、ベルを引いただけで
     * 純増もゲーム数も伸び、レア役の価値が埋もれていた。
     */
    const rare = isRareRole(g.flag);

    // ── スケールアップ(純増が上がる)──
    const up = rare ? (AURORA.acuUpByFlag[g.flag] ?? 0) : 0;
    let telop = null;
    if (up > 0 && state.acu < AURORA.acuMax) {
      const before = state.acu;
      state.acu = Math.min(AURORA.acuMax, state.acu + up);
      state.netPerGame = state.acu;
      state.peakAcu = Math.max(state.peakAcu, state.acu);
      events.push({
        name: 'paramChange',
        payload: {
          param: 'acu_up', value: state.acu, delta: state.acu - before, flag: g.flag,
        },
      });
      telop = `SCALE UP!! ACU ${before} → ${state.acu}(純増 ${state.acu} 枚/G)`;
    }

    /**
     * ゲーム数も +1(U11 の指定 / U24 でレア役のみ)。
     * 100回転を1モードで食い潰さないよう、延長込みの総ゲーム数に上限を持つ
     * (引き戻し層の U2-b と同じ安全弁)。
     *
     * ※ paramChange 'aurora_addgame' は現時点で受け手のシナリオが無い
     *   (2026-08-14 しおん指摘 minor-f)。レア役限定になって
     *   「+1G が来た瞬間」が見せ場になったので **イベントは残す**。
     *   演出担当がここを拾って「リードレプリカ追加」の画を付ける想定。
     */
    if (rare && state.total < AURORA.maxTotalGames) {
      state.remaining += AURORA.addGamePerWin;
      state.total += AURORA.addGamePerWin;
      state.extended++;
      events.push({
        name: 'paramChange',
        payload: {
          param: 'aurora_addgame',
          value: state.remaining, delta: AURORA.addGamePerWin, flag: g.flag,
        },
      });
      if (!telop) telop = `レプリカ追加 — 残り ${state.remaining} G`;
    }

    // 払出はスケールアップ後のACU(引けたゲームからすぐ効く)
    const pay = state.acu;
    state.gained += pay;

    if (state.remaining > 0) return { payoutPerGame: pay, telop, events };

    return {
      payoutPerGame: pay,
      events,
      // 復帰は「転落時点のACUを引き継いだ短い再開」(recoveryParamsFor)。
      // 旧実装は acuInit で満額再開していた(2026-08-14 minor-a)
      ...rushEndResult(state, { telop: 'クラスターが縮退… ホットスタンバイへ' }),
    };
  },

  residualValue(state) {
    if (!(state.remaining > 0)) return [];
    return [residualLine(`${AURORA.short} 残り(ACU ${state.acu})`, state.remaining, state.acu)];
  },
};

// ── M08d. ヒーローRUSH(プレミア枠)───────────────

const HERO = RUSH_SPEC_BY_ID.HERO_RUSH;

export const heroRush = {
  id: 'HERO_RUSH',
  name: HERO.name,
  type: 'AT',

  onEnter(state, params = {}) {
    state.rushId = HERO.id;
    state.short = HERO.short;
    state.axis = HERO.axis;
    // params.games は復帰・デバッグ起動用(通常突入は spec の 5G 固定)
    state.total = params.games ?? HERO.games;
    state.remaining = state.total;
    state.netPerGame = HERO.expectedPerGame;
    state.gained = 0;
    state.playedGames = 0;
    /** 毎ゲーム抽選(HERO.hitCoin 枚)を引き当てた回数(液晶の星の数) */
    state.hits = 0;
    state.lastCoin = 0;
    /*
     * 当選率は「1/2」と直書きせず spec から作る(U50 で 1/2 → 80% に変わり、
     * 直書きだったこの文言だけが嘘になっていた。数値はデータから導くこと)。
     */
    state.telop = `AWS Hero に選出 — ${HERO.games}G 限定、毎ゲーム ${Math.round(HERO.hitRate * 100)}% で ${HERO.hitCoin}枚`;
  },

  onGame(state, g) {
    const events = [];
    state.remaining--;
    state.playedGames++;

    const hit = drawHeroHit(g.rng);
    // +α は **レア役のときだけ**(U24)。毎ゲーム 1/2 の骨格は変更しない
    const coin = isRareRole(g.flag) ? (HERO.coinByFlag[g.flag] ?? 0) : 0;
    const pay = hit + coin;
    state.lastCoin = pay;
    state.gained += pay;
    if (hit > 0) state.hits++;

    events.push({
      name: 'paramChange',
      payload: {
        param: 'hero_game', value: pay, delta: pay, hit: hit > 0, bonus: coin, flag: g.flag,
      },
    });

    let telop;
    if (hit > 0 && coin > 0) telop = `HERO!! ${hit} + ${coin} = +${pay} 枚`;
    else if (hit > 0) telop = `HERO!! +${hit} 枚`;
    else if (coin > 0) telop = `コミュニティ貢献 — +${coin} 枚`;
    else telop = '今回は静かに… 次のゲームへ';

    if (state.remaining > 0) return { payoutPerGame: pay, telop, events };

    return {
      payoutPerGame: pay,
      events,
      ...rushEndResult(state, {
        telop: `HERO RUSH 終了 — 合計 +${Math.floor(state.gained)} 枚`,
      }),
    };
  },

  residualValue(state) {
    if (!(state.remaining > 0)) return [];
    return [residualLine(`${HERO.short} 残り`, state.remaining, HERO.expectedPerGame)];
  },
};
