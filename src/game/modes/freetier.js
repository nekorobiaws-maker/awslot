/**
 * M01. Free Tier(通常時)。DESIGN.md 2.2 / 3.4 / 3.5
 *
 * ── いまのCZ導線(U72 / 2026-08-15 ユーザー指示)────────────────────────
 * **チャンス目(Lambda)を引いたらチャンスゾーン。サメ揃いも同じ。**
 * この1行がこのモードの主線で、他のレア役はステージ昇格の担当。
 *   1. 確定役が成立 → その場で「チャンス目 — CHANCE ZONE 確定!!」と告知
 *   2. **2〜3Gの短い移行前兆**(擬似連を生かすための尺。下の czConfirmed を参照)
 *   3. 前兆の最終Gで突入告知 → 次のレバーONでCZの1ゲーム目
 * ステージの毎ゲーム抽選(NORMAL_SUBSTATES.czPerGame)と天井(78G)は残っているが、
 * 前者は「おまけ」・後者は「救済」で、主線ではない。
 *
 * Phase 5 で以下を実装:
 *  - 内部状態3段階(Cold Start / Warm Pool / Provisioned Concurrency)
 *    CZ抽選確率が ×1.0 / ×2.0 / ×4.0 に変動し、ステージ背景で示唆される
 *  - 天井999G「SLA 99.9% 保証」で CZ(Well-Architected)当選確定
 *  - CZ 3種すべてへの振り分け(3.6)
 *
 * 内部状態は「CZ抽選 → 昇格抽選 → 転落抽選」の順で処理する。
 * (同じゲームで昇格した状態が即その回の抽選に効くと、体感より当たりすぎるため)
 *
 * Phase 6 で前兆システムを追加(data/zencho.js):
 *  - 当選しても即突入せず、当選内容を保持したまま 2〜5G の本前兆を挟む
 *  - 非当選時も 1/40 で 2〜4G のガセ前兆が走り、最後に何も起きずに終わる
 *  - 前兆中も当選抽選は毎ゲーム引き続ける。ガセ前兆中の当選は本前兆へ格上げし、
 *    本前兆中の再当選は上位のもの(BONUS > AT > CZ)だけ採用する
 *    = 保持中の当選より価値が下がることはない(同格以下はランク吸収)
 *
 * 保持中の当選を消さないための扱い(2026-08-13 修正):
 *  - 天井到達 … BONUS / AT を保持していれば天井CZより上位なのでそちらへ送る。
 *               CZ 保持は「突破確定の天井CZ(Well-Architected)」が上位互換なので吸収する。
 *  - エンディング … forceMode でスタックごと畳まれると告知前の当選が無告知で消えるため、
 *               flow.js が takePendingWin() で退避し、エンディング終了後の FREE_TIER へ
 *               params.carryWin で返す。戻った側は最短の本前兆を組み直して告知する。
 *
 * 2026-08-14 の追加:
 *  - 擬似連を DeepRacer 専用実装からスペック駆動へ一般化(CodePipeline 擬似連を追加)。
 *    擬似連を増やしても **総発生量は据え置き**(data/zencho.js で weight を分け合う)。
 *  - レバーONフリーズの恩恵受け(gctx.freeze)。抽選は game/flow.js のレバーON直後で、
 *    ここは「当たった結果」を遷移へ化けさせるだけ。
 *  - 演出パターンのデバッグ固定(setDebugPattern)。RNG消費数は変えない。
 *
 * 前兆の進行状態(本前兆かガセか)は state に置かない。
 * state は EventBus の payload と director のスナップショット(main.js の getContext)へ
 * そのまま渡るので、state.zenchoPending があると演出データ側から
 *   match: { 'modeState.zenchoPending.kind': ['BONUS'] }
 * の1行で本前兆が確定で読めてしまう。モジュール内の WeakMap に隔離する。
 */

import {
  drawCzEntry, drawCzType, drawDirectBonus, drawRushType,
  drawSubStateUpgrade, drawSubStateDowngrade,
} from '../lottery.js';
import { NORMAL_SUBSTATES, CZ_ENTRY } from '../../data/modes.js';
import {
  ZENCHO, ZENCHO_PATTERN_BY_ID, ZENCHO_WIN_RANK, CHAIN_SPEC_BY_PATTERN,
} from '../../data/zencho.js';
// FLAG_BY_ID の import は U64-4(成立役テロップの廃止)で不要になったため外した
import { isRareRole } from '../../data/rareroles.js';

const SUBSTATE_BY_ID = Object.fromEntries(NORMAL_SUBSTATES.states.map((s) => [s.id, s]));

/**
 * CZ確定役かどうか(U72 / 2026-08-15 ユーザー指示「チャンス目が出たらチャンスゾーン」)。
 *
 * **判定はデータ側(data/modes.js の CZ_ENTRY.table)を見るだけ**にしてある。
 * ここに役IDを直書きすると、確定役を足したり外したりしたときに
 * 「テーブルは 1.000 なのに即告知されない」という食い違いが起きるため。
 * @param {string} flag 成立役
 * @returns {boolean} その役でCZが確定するか
 */
function isCzConfirmFlag(flag) {
  return (CZ_ENTRY.table[flag]?.cz ?? 0) >= 1;
}

/**
 * CZ確定役の告知テロップ(U72)。
 *
 * 【U64-4「成立役テロップは書き戻さない」との関係】
 * U64-4 が禁じたのは「チャンス目 — 次に期待」のような **成立しただけで何も確定していない**
 * 役名テロップ(予告演出と同じことを2か所で言っていた)。
 * こちらは **その役でCZ突入が確定した瞬間の当選告知**で、
 * 「この役を引いたからCZに入った」という因果をプレイヤーへ伝えるのが仕事。
 * U72 の指示「チャンス目=CZ がプレイヤーに伝わる一言」の置き場所そのものなので、
 * 役名を出すのが正しい(ここを消すと、新ルールを画面から学ぶ手段が無くなる)。
 */
const CZ_CONFIRM_TELOP = {
  CHANCE: 'チャンス目 — CHANCE ZONE 確定!!',
  SHARK: 'サメ揃い — CHANCE ZONE 確定!!',
};

/** CZ確定役の入口ラベル(検証・プローブの内訳集計用) */
const CZ_CONFIRM_ROUTE = { CHANCE: 'chance', SHARK: 'shark' };

/**
 * CZ確定役の告知から突入までに挟む移行前兆の最長ゲーム数(U72)。
 *
 * 0 にすると「確定告知 → 次スピンでCZ」になるが、**本前兆が1回も走らなくなる**
 * ため擬似連(分散マップ / CodePipeline)が構造的に出なくなる(2026-08-15 ユーザー指摘)。
 * 通常の本前兆は 2〜5G(data/zencho.js の ZENCHO.real.gamesDist)なので、
 * 確定後の待ち時間として長すぎない **3G** で頭打ちにしている。
 */
const CZ_CONFIRM_ZENCHO_MAX_GAMES = 3;

/**
 * 前兆の進行状態。ファイル冒頭のとおり state には持たせない。
 *   z       … 前兆そのもの(総G/残G/経過ステップ/強度/演出パターン)
 *   pending … 保持中の当選(ガセ前兆なら null)
 * @type {WeakMap<object, {z: object|null, pending: object|null}>}
 */
const ZENCHO_STATE = new WeakMap();

/** エンディングから当選を引き継いだときに組み直す本前兆の長さ(G) */
const CARRY_ZENCHO_GAMES = 2;

/**
 * デバッグ用の演出パターン固定(?pattern=bill_shock / window.AWSLOT.setZenchoPattern)。
 *
 * 【出目不変の約束】固定していても drawPattern は必ず drawWeightedFixed を通り、
 * ゲーム抽選RNGを1回消費する。固定は「引いた結果を上書きする」だけなので、
 * デバッグ固定の有無で以降の乱数列はズレない。
 * @type {string|null}
 */
let DEBUG_PATTERN = null;

/**
 * 次に始まる前兆の演出パターンを固定する(デバッグ用)。
 * @param {string|null} id ZENCHO.patterns の id。null / 未知のIDで解除
 * @returns {string|null} 実際に設定された値
 */
export function setDebugPattern(id) {
  DEBUG_PATTERN = id && ZENCHO_PATTERN_BY_ID[id] ? id : null;
  return DEBUG_PATTERN;
}

/** 現在のデバッグ固定パターン(検証用の読み出し口) */
export function getDebugPattern() {
  return DEBUG_PATTERN;
}

/**
 * デバッグ用の前兆強度の固定(?strength=3 / 2026-08-15 検証指摘 F5)。
 *
 * 【なぜ要るか】演出パターンには `minStrength`(この強度以上でしか出ない)があり、
 *   ?pattern=fis_az_down のような強度3専用パターンを固定しても、
 *   強度が 1 や 2 に決まった前兆では **一度も発火しない**ため確認できなかった。
 *
 * 【出目不変の約束】強度は必ず drawNumber を通してから上書きする。
 * デバッグ指定の有無でゲーム抽選RNGの消費数は1つも変わらない。
 * @type {number|null}
 */
let DEBUG_STRENGTH = null;

/**
 * 前兆の強度を固定する(デバッグ用)。
 * @param {number|null} n 1〜3。範囲外 / null で解除
 * @returns {number|null} 実際に設定された値
 */
export function setDebugStrength(n) {
  const v = Number(n);
  DEBUG_STRENGTH = Number.isInteger(v) && v >= 1 && v <= 3 ? v : null;
  return DEBUG_STRENGTH;
}

/** 現在のデバッグ固定強度(検証用の読み出し口) */
export function getDebugStrength() {
  return DEBUG_STRENGTH;
}

/**
 * 抽選で決まった強度に、デバッグ指定を反映して返す。
 *
 * 優先順は ?strength= > ?pattern= の要求強度 > 抽選値。
 * **?pattern= だけを指定したときは、そのパターンの minStrength まで自動で持ち上げる**
 * (F5: 強度3専用パターンを固定しても発火しない、を解消する)。
 * @param {number} drawn 抽選で決まった強度
 * @returns {number}
 */
function debugStrength(drawn) {
  if (DEBUG_STRENGTH != null) return DEBUG_STRENGTH;
  if (!DEBUG_PATTERN) return drawn;
  const p = ZENCHO_PATTERN_BY_ID[DEBUG_PATTERN];
  return p ? Math.max(drawn, p.minStrength ?? 1) : drawn;
}

/** state に対応する前兆状態を取り出す(無ければ空で作る) */
function zenchoOf(state) {
  let zs = ZENCHO_STATE.get(state);
  if (!zs) {
    zs = { z: null, pending: null };
    ZENCHO_STATE.set(state, zs);
  }
  return zs;
}

/**
 * 検証・デバッグ用の読み出し口。
 * 演出データ(data/scenarios/)は import を書けないのでここへは到達できない。
 * @returns {{zencho: object|null, pending: object|null}}
 */
export function inspectZencho(state) {
  const zs = ZENCHO_STATE.get(state);
  return { zencho: zs?.z ?? null, pending: zs?.pending ?? null };
}

export const freeTier = {
  id: 'FREE_TIER',
  name: '通常ステージ',
  type: 'NORMAL',

  onEnter(state, params = {}) {
    const sub = SUBSTATE_BY_ID[params.subState] ?? SUBSTATE_BY_ID.COLD_START;
    state.games = params.reset ? 0 : (params.games ?? 0);
    state.subState = sub.id;
    state.subStateName = sub.name;
    state.czMultiplier = sub.czMultiplier;
    state.stage = sub.stage;
    state.ceiling = NORMAL_SUBSTATES.ceiling.games;
    /**
     * 通常時へ戻ったときのテロップ(2026-08-14 ユーザー指摘 U4)。
     *
     * 以前はここで台名「オースロット」を出していたため、
     * ボーナス終了で通常ステージへ戻るたびにタイトルが表示されていた。
     * null にすると GameFlow の `this.telop = state.telop ?? this.telop` が
     * **直前のテロップ(ボーナス終了の獲得枚数など)をそのまま残す**ので、
     * 台名で結果を上書きしてしまうこともなくなる。
     */
    state.telop = params.telop ?? null;
    // 前兆の進行状態は WeakMap 側に持つ(state に置くと演出から本前兆が読めるため)。
    // 演出へ渡してよい情報は paramChange の payload に限る。
    //
    // エンディングへ退避されていた当選を引き継いだ場合は、告知の尺として
    // 最短の本前兆を組み直してから渡す(退避した当選は必ずここで戻ってくる)。
    // 抽選は挟まないので、引き継ぎの有無でゲーム抽選RNGの消費数は変わらない。
    ZENCHO_STATE.set(state, params.carryWin
      ? {
        z: {
          total: CARRY_ZENCHO_GAMES,
          left: CARRY_ZENCHO_GAMES,
          step: 0,
          strength: 3,
          pattern: 'reinvent',
        },
        pending: params.carryWin,
      }
      : { z: null, pending: null });
    // 前兆が走っているかだけを演出へ公開する(本前兆・ガセの区別は載せない。setZenchoActive 参照)
    state.zenchoActive = Boolean(params.carryWin);
  },

  /**
   * 前兆で保持している当選を取り出し、前兆を畳む(エンディングへの退避用)。
   * 取り出した側は必ず遷移先へ引き継ぐこと。捨てると当選が無告知で消える。
   * @returns {object|null} 保持していた当選(無ければ null)
   */
  takePendingWin(state) {
    const zs = ZENCHO_STATE.get(state);
    if (!zs?.pending) return null;
    const win = zs.pending;
    clearZencho(zs, state);
    return win;
  },

  onGame(state, g) {
    state.games++;
    const zs = zenchoOf(state);

    /* ── レバーONフリーズの恩恵(2026-08-14 追加。data/freeze.js)──────────
     *
     * 抽選そのものは game/flow.js のレバーON直後(= 出目が確定した瞬間)で終わっており、
     * ここへは「当たった」という結果だけが gctx.freeze で渡ってくる。
     * 付与をモード層でやるのは、当選をどの遷移に化けさせるかが通常時の事情
     * (前兆で既に当選を持っているか等)だからで、flow に持たせると二重管理になる。
     *
     * 見せ方はゴースト揃いと同格の **即告知**。前兆は挟まない
     * (フリーズしておいて「前兆が始まりました」では格が下がる)。
     * ただし前兆で保持していた当選は絶対に捨てない。upgradePending を通して
     * 上位のほうを採用する = フリーズで損をすることはない。
     */
    if (g.freeze) {
      const win = {
        kind: g.freeze.kind ?? 'BONUS',
        bonusId: g.freeze.bonusId,
        // U11: フリーズの恩恵は「ボーナス + RUSH確定 + プレミア振り分け」
        rushGuaranteed: Boolean(g.freeze.rushGuaranteed),
        premium: Boolean(g.freeze.premium),
      };
      // 保持中の当選があれば上位のみ採用(格が下がることはない)。
      upgradePending(zs, win);
      /*
       * upgradePending は「格(kind)」でしか比べないので、ボーナス同士だと
       * 先に保持していた軽いボーナス(LAMBDA_REG など)が残ってしまう。
       * フリーズの恩恵はボーナスの最上位(ゴーストボーナスSP)なので、
       * 同格のときはフリーズ側を採用する = プレミアを引いて損はしない。
       */
      if (zs.pending && win.kind === zs.pending.kind) zs.pending = win;
      const pending = zs.pending ?? win;
      const events = [{
        name: 'paramChange',
        payload: { param: 'freeze_win', value: pending.kind, delta: 0, bonusId: pending.bonusId ?? null },
      }];
      // 走っていた前兆は畳んでから告知へ渡す(告知が二重にならないように)
      clearZencho(zs, state);
      state.winRoute = 'freeze';
      return {
        ...transitionFor(pending, state),
        events,
        telop: 'FREEZE!! ゴーストボーナスSP + RUSH 確定!!',
      };
    }

    // ── 天井(SLA 99.9% 保証)────────────────
    if (state.games >= state.ceiling) {
      const events = [{ name: 'paramChange', payload: { param: 'ceiling', value: state.games, delta: 0 } }];
      // 保持中の当選が天井CZより上位(BONUS / AT 直撃)なら、天井より当選を優先する。
      // 天井で上書きすると czId から引き直しになり、AT直撃はボーナス経由へ格下げされて
      // 当選そのものが消えることがある。天井カウンタは遷移先から戻ったときに 0 から数え直す。
      const pending = zs.pending;
      if (pending && (pending.kind === 'BONUS' || pending.kind === 'AT')) {
        events.push(zenchoEndEvent(zs, 'ENTRY', pending.kind));
        clearZencho(zs, state);
        return { ...transitionFor(pending, state), events };
      }
      // 前兆中に天井へ到達したら、前兆は「突入」で畳んでから天井CZへ送る。
      // 天井CZ(Well-Architected)は突破確定なので、保持していたCZ当選は上位互換で吸収される。
      if (zs.z) events.push(zenchoEndEvent(zs, 'ENTRY', 'CZ'));
      clearZencho(zs, state);
      state.winRoute = 'ceiling';
      return {
        transition: {
          to: 'CZ',
          params: { czId: 'WELL_ARCHITECTED', normalGames: state.games, ceiling: true, route: 'ceiling' },
          // 天井到達の告知も通常画面のまま見せ、次のスピンでCZへ入る
          onNextSpin: true,
        },
        events,
        // SLA→Auto Recovery 改名の取り残し修正(2026-08-13 ユーザー指摘)。
        // 「サービスクレジット」はSLA未達時の返金補償で、自動復旧のご褒美文言としては意味が通らなかった。
        telop: `${NORMAL_SUBSTATES.ceiling.name} 発動 — 自動復旧します`,
      };
    }

    const events = [];

    // ── CZ / ボーナス / AT直撃 ─────────────────
    // 前兆中も止めない。止めると「前兆中のゲームだけ抽選されない」ことになり、
    // 前兆を挟んだぶんだけ初当り確率が落ちてしまう。
    const res = drawCzEntry(g.rng, g.flag, state.czMultiplier);
    let win = null;
    if (res.bonus) win = { kind: 'BONUS', bonusId: drawDirectBonus(g.rng, g.flag) };
    /**
     * RUSH直撃(U11)。どのRUSHへ行くかはここで確定させる。
     * 【申し送り】直撃が当たったゲームだけ drawRushType のぶん
     * ゲーム抽選RNGの消費が1つ増える(当選率そのものは不変)。
     */
    else if (res.directAt) win = { kind: 'AT', rushId: drawRushType(g.rng) };
    else if (res.cz) win = { kind: 'CZ', czId: drawCzType(g.rng) };
    /**
     * 当選の入口(検証用。チャンス目 / サメ揃い / 直接 / 高確 / 激アツ / 天井)。
     * U72 でCZ確定役(チャンス目・サメ揃い)は **ステージに関係なく確定** になったので、
     * ステージ名ではなく役そのものをラベルにする(そうしないと
     * 「高確で引いたチャンス目」が stage:WARM_POOL として数えられ、
     *  主線がチャンス目なのかステージなのかがプローブから読めなくなる)。
     */
    if (win) {
      state.winRoute = CZ_CONFIRM_ROUTE[g.flag]
        ?? (state.subState === 'COLD_START' ? 'direct' : `stage:${state.subState}`);
    }

    /**
     * ステージ滞在中の毎ゲーム抽選(2026-08-13 ユーザー指示)。
     *
     * 「高確/激アツに入ってからCZ」を主ルートにするための本体。
     * レア役契機(上の drawCzEntry)は約1/25でしか回ってこないので、
     * (U63 で 1/6.17 になったが、1回あたりの当選率を 0.5倍にして相殺しているため
     *  「レア役単発ではCZに入らない」という関係は変わっていない)
     * ステージ自体が毎ゲーム抽選を持つことで
     * 「上がったのに何も起きずに転落」を減らし、
     * 激アツは数ゲーム以内にほぼ勝負が決まるようにしている。
     */
    if (!win) {
      const stageRate = NORMAL_SUBSTATES.czPerGame?.[state.subState] ?? 0;
      if (stageRate > 0 && g.rng.chance(stageRate)) {
        const bonusShare = NORMAL_SUBSTATES.bonusShareOfStageDraw?.[state.subState] ?? 0;
        win = bonusShare > 0 && g.rng.chance(bonusShare)
          ? { kind: 'BONUS', bonusId: drawDirectBonus(g.rng, g.flag) }
          : { kind: 'CZ', czId: drawCzType(g.rng) };
        state.winRoute = `stage:${state.subState}`;
      }
    }

    // 擬似連(DeepRacer / CodePipeline)の最中にレア役を引いたらボーナス確定
    // (2026-08-13 ユーザー仕様)。「小役」ではなくレア役に限定している理由は
    // data/zencho.js の DEEPRACER 参照。
    if (zs.z?.chain?.spec?.rareUpgradesToBonus && isRareRole(g.flag)) {
      win = { kind: 'BONUS', bonusId: drawDirectBonus(g.rng, g.flag) };
    }

    // 格上げの理由。演出は「1ゲームに1本」しか流せないので、
    // ここでは理由だけ決めておき、前兆の消化まで進めてからイベントを1本に絞る。
    let upgradeReason = null;
    /** CZ確定役の告知テロップ(この後の前兆テロップより優先する) */
    let czConfirmTelop = null;
    /**
     * ── U72: CZ確定役(チャンス目 / サメ揃い)の扱い(2026-08-15 ユーザー指示)──
     *
     * ユーザー指示は「チャンス目が出たらチャンスゾーンに入る。シンプルでいい」。
     * **確定したことはその場のテロップで言い切る**(= ルールは1ゲームで伝わる)。
     *
     * ■ それでも前兆を挟む理由(2026-08-15 追加指示)
     * 最初の実装は天井・フリーズと同じ「即告知 → 次スピンで突入」にしていたが、
     * それだと **本前兆が1回も走らなくなる**。前兆の演出パターンには
     * 擬似連(分散マップ / CodePipeline)が含まれていて、
     * 擬似連が出られるのは「前兆が走っている間」だけなので、
     * 確定役をCZへ直結させると **擬似連が構造的に死ぬ**(ユーザー指摘「擬似連が出ない」)。
     * そこで確定役は
     *   その場で「確定」を告知 → **短い移行前兆(2〜3G / 擬似連なら自分のstep数)** → CZ突入
     * という形にした。当選は既に確定しているので前兆は当落を煽る装置ではなく、
     * **突入までの見せ場**(擬似連が走る場所)として使う。
     * 前兆の長さを 2〜3G に詰めてあるのは、告知から突入までが間延びしないため
     * (通常の本前兆は 2〜5G / ZENCHO.real.gamesDist)。
     *
     * ■ 例外は1つだけ
     * 前兆で **CZより上位の当選(ボーナス / RUSH直撃)** を保持しているときは、
     * 確定役のCZで上書きすると格下げになるので通常処理へ落とす(格は絶対に下げない)。
     * 擬似連のボーナス格上げより後ろに置いてあるのも同じ理由。
     */
    const czConfirmed = win?.kind === 'CZ' && isCzConfirmFlag(g.flag)
      && !(zs.pending && ZENCHO_WIN_RANK[zs.pending.kind] > ZENCHO_WIN_RANK.CZ);
    if (czConfirmed) {
      if (!zs.z) {
        startZencho(zs, g.rng, 'real', win, state);
        shortenConfirmZencho(zs);
      } else if (zs.z.chain) {
        // 擬似連は自分の step 数で完結させる(尺を詰めると step4 のボーナス確定が消える)
        upgradePending(zs, win);
      } else if (!zs.pending) {
        promoteZencho(zs, g.rng, win);
        shortenConfirmZencho(zs);
      } else {
        // 同格(CZ)の保持を、いま確定した当選で置き換えてから尺を詰める
        zs.pending = win;
        shortenConfirmZencho(zs);
      }
      czConfirmTelop = CZ_CONFIRM_TELOP[g.flag] ?? 'CHANCE ZONE 確定!!';
      /**
       * 演出フック。どの役でCZが確定したかを1本だけ流す。
       * 既存シナリオはどれも param 名か source で絞っているので、
       * 新しい param 名を足しても既存の演出を巻き込むことはない。
       */
      events.push({
        name: 'paramChange',
        payload: { param: 'cz_confirmed', value: g.flag, delta: 0, czId: win.czId },
      });
    } else if (win) {
      if (!zs.z) {
        // 通常の当選 → 本前兆スタート
        startZencho(zs, g.rng, 'real', win, state);
      } else if (zs.z.chain) {
        // 擬似連は自分の step 数で完結するので前兆の尺は伸ばさない。当選だけ格上げする
        upgradeReason = upgradePending(zs, win) ? 'RANKUP' : 'ABSORB';
      } else if (!zs.pending) {
        // ガセ前兆中に当選 → 本前兆へ格上げ(ここで当選を捨てない)
        promoteZencho(zs, g.rng, win);
        upgradeReason = 'PROMOTE';
      } else {
        // 本前兆中の再当選 → 上位のものだけ採用(実機と同じ格上げ処理)。
        // 同格以下は保持中の当選に吸収される(= 引いた当選は破棄されるが価値は下がらない)。
        const better = ZENCHO_WIN_RANK[win.kind] > ZENCHO_WIN_RANK[zs.pending.kind];
        if (better) zs.pending = win;
        upgradeReason = better ? 'RANKUP' : 'ABSORB';
      }
    } else if (!zs.z && g.rng.chanceDenom(ZENCHO.fake.denom)) {
      // ── ガセ前兆の発生 ───────────────────────
      startZencho(zs, g.rng, 'fake', null, state);
    }

    // ── 前兆の消化(1ゲームぶん)──────────────
    let zenchoTelop = null;
    if (zs.z) {
      const z = zs.z;
      z.step++;
      z.left--;

      // 擬似連(DeepRacer / CodePipeline)。step3のCZ移行・step4のボーナス確定は
      // ここで確定し、移行が決まった場合は z.left を 0 にして下の告知ブロックへ落とす。
      const chainTelop = z.chain ? advanceChain(zs, g, events) : null;

      if (z.left > 0) {
        // 擬似連は自前の chainParam イベント(deepracer / codepipeline)で進行を語るので、
        // 汎用の前兆イベントは出さない(1ゲームに2本流すと後勝ちで先のテロップが消える)。
        if (!z.chain) {
          // 格上げが起きたゲームは step 演出を出さない。
          events.push(upgradeReason ? zenchoUpgradeEvent(zs, upgradeReason) : zenchoStepEvent(zs));
        }
        zenchoTelop = chainTelop ?? ZENCHO_PATTERN_BY_ID[z.pattern]?.telop ?? null;
      } else if (zs.pending) {
        // 最終G(本前兆)= 告知して突入。格上げ演出は結果告知に譲る
        const pending = zs.pending;
        events.push(zenchoEndEvent(zs, 'ENTRY', pending.kind));
        clearZencho(zs, state);
        return { ...transitionFor(pending, state), events };
      } else {
        // 最終G(ガセ)= 何も起きずに終わる
        events.push(zenchoEndEvent(zs, 'MISS', null));
        clearZencho(zs, state);
        zenchoTelop = chainTelop ? `${chainTelop} — 惜しくも終了…` : ZENCHO.telops.miss;
      }
    }

    // ── 内部状態の昇格 / 転落(3.4)──────────────
    let telop = null;

    const up = isRareRole(g.flag) ? drawSubStateUpgrade(g.rng, g.flag, state.subState) : null;
    if (up) {
      applySubState(state, up);
      // 2026-08-14 ユーザー指摘 U6: 「近づいてきた」ではなく到着したと言い切る
      telop = up === 'PROVISIONED'
        ? 'Invent会場に到着した — 激アツ!!'
        : 'サミット会場に到着した — 高確';
      events.push({
        name: 'paramChange',
        payload: { param: 'substate', value: state.subState, delta: 1 },
      });
    } else {
      const down = drawSubStateDowngrade(g.rng, state.subState);
      if (down) {
        applySubState(state, down);
        events.push({
          name: 'paramChange',
          payload: { param: 'substate', value: state.subState, delta: -1 },
        });
      }
    }

    /*
     * CZ確定の告知 > 昇格テロップ > 前兆テロップ の優先順。
     *
     * ── 成立役テロップを廃止した(2026-08-15 ユーザー指示 U64-4)────────────
     * ここには以前 `${役名} — 次に期待`(「チャンス目 — 次に期待」等)を出していたが、
     * **成立役の告知は予告演出側(液晶のポップアップ・役色・効果音)の担当**で、
     * 下部テロップにも同じことを書くと U8(同じ情報を2か所に出さない)に反する。
     * レア役を引いたことは画と音で必ず伝わるので、テロップからは落とす。
     * **役名を出すテロップをここへ書き戻さないこと。**
     * (U72 の CZ_CONFIRM_TELOP は「成立しました」ではなく「CZが確定しました」= 当選告知。
     *  この1行だけが新ルールをプレイヤーへ伝える場所なので、昇格告知より優先する)
     */
    if (czConfirmTelop) telop = czConfirmTelop;
    else if (!telop) telop = zenchoTelop;
    return { telop, events };
  },
};

function applySubState(state, id) {
  const sub = SUBSTATE_BY_ID[id];
  if (!sub) return;
  state.subState = sub.id;
  state.subStateName = sub.name;
  state.czMultiplier = sub.czMultiplier;
  state.stage = sub.stage;
}

// ── 前兆 ──────────────────────────────────────

/**
 * 重み付き抽選。ゲーム抽選RNGの消費数を必ず1回に固定する。
 *
 * Rng#weighted は候補が空だと next() を消費せずに null を返すため、
 * 演出パターンの weight を将来 0 にした瞬間に以降のRNG列が丸ごとズレて、
 * 同じシードでも別の展開になる(= デバッグ再現性が壊れる)。
 * 前兆はゲーム側の抽選と同じ列を使うので、ここは消費数固定で実装する。
 * @param {Record<string, number>} table
 * @param {string} fallback 候補が空のときに返す値
 */
function drawWeightedFixed(rng, table, fallback) {
  const r = rng.next();
  const entries = Object.entries(table).filter(([, w]) => w > 0);
  if (entries.length === 0) return fallback;
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let acc = r * total;
  for (const [k, w] of entries) {
    acc -= w;
    if (acc < 0) return k;
  }
  return entries[entries.length - 1][0];
}

/** 数値キーの重み配分を引いて数値で返す */
function drawNumber(rng, dist) {
  return Number(drawWeightedFixed(rng, dist, Object.keys(dist)[0]));
}

/**
 * 演出パターンを引く。強度で候補を絞ってから本/ガセ別の重みで抽選する。
 * @param {'real'|'fake'} kind
 */
function drawPattern(rng, strength, kind) {
  const table = {};
  for (const p of ZENCHO.patterns) {
    if (p.minStrength > strength) continue;
    const w = p.weight[kind] ?? 0;
    if (w > 0) table[p.id] = w;
  }
  const picked = drawWeightedFixed(rng, table, ZENCHO.patterns[0].id);
  /*
   * デバッグ固定(?pattern= / window.AWSLOT.setZenchoPattern)。
   * **必ず drawWeightedFixed を通してRNGを1回消費したあと** に上書きする。
   * 先に return してしまうと固定の有無で乱数列がズレて、
   * 「固定した瞬間に別の展開になる」= 演出だけ見たいのに出目が変わる、という事故になる。
   */
  if (DEBUG_PATTERN) {
    const p = ZENCHO_PATTERN_BY_ID[DEBUG_PATTERN];
    // 強度が足りない(minStrength を満たさない)パターンは固定しても出せない
    if (p && p.minStrength <= strength) return DEBUG_PATTERN;
  }
  return picked;
}

/**
 * 前兆を開始する。当選ゲームを1G目として数える。
 * @param {{z:object|null, pending:object|null}} zs 前兆状態
 * @param {'real'|'fake'} kind
 * @param {object|null} pending 保持する当選(ガセなら null)
 */
function startZencho(zs, rng, kind, pending, state = null) {
  const spec = kind === 'real' ? ZENCHO.real : ZENCHO.fake;
  const total = drawNumber(rng, spec.gamesDist);
  // 引いてから上書きする(RNGの消費数はデバッグ指定の有無で変わらない)
  const strength = debugStrength(drawNumber(rng, spec.strengthDist));
  const pattern = drawPattern(rng, strength, kind);
  /**
   * 擬似連パターン(DeepRacer / CodePipeline)。到達step を先に決め、
   * 前兆の長さを **その step 数** に合わせる(1つの時計で回すため)。
   * step3 のCZ移行・step4 のボーナス確定は advanceChain が担当する。
   *
   * 【RNG消費数の注意】擬似連パターンを引いたときだけ target 抽選で1回多く消費する。
   * これは擬似連が始まった時点で分岐しているので問題ない(パターン抽選の後なので、
   * 同じ乱数列から見れば「擬似連を引いた枝」と「引かなかった枝」で別々に進むだけ)。
   */
  const chainSpec = CHAIN_SPEC_BY_PATTERN[pattern] ?? null;
  const chain = chainSpec
    ? { spec: chainSpec, target: drawNumber(rng, chainSpec.targetDist), value: null }
    : null;
  // 本前兆(当選を保持している)なら最低2step。
  // 1stepだと「車が1回走って即突入」になり、前兆としての溜めが消えるうえ、
  // 天井や他の当選と重なったときの吸収処理が働く前に遷移してしまう。
  if (chain && pending) chain.target = Math.max(2, chain.target);
  zs.z = {
    total: chain ? chain.target : total,
    left: chain ? chain.target : total,
    step: 0,
    strength,
    pattern,
    chain,
  };
  zs.pending = pending ?? null;
  // 演出向けの公開フラグ(本前兆・ガセの区別は載せない。後述 setZenchoActive)
  setZenchoActive(state, true);
}

/**
 * CZ確定役(U72)の移行前兆を短く詰める。
 *
 * 確定を告知したあとの前兆は **当落を煽る装置ではなく突入までの見せ場**なので、
 * 通常の本前兆(2〜5G)より短い **最長 CZ_CONFIRM_ZENCHO_MAX_GAMES** に収める。
 * 経過ぶん(step)は動かさないので、ガセからの格上げでも見た目が巻き戻らない。
 *
 * 【擬似連は詰めない】擬似連は自分の step 数(1〜4)で完結する時計で、
 * step3 のCZ移行・step4 のボーナス確定がその尺に紐づいている。
 * ここで尺を切ると **step4 に到達できなくなり、ボーナスへの格上げを player から奪う**。
 * もともと最長4stepなので詰める必要もない。
 * @param {{z: object|null}} zs 前兆状態
 */
function shortenConfirmZencho(zs) {
  const z = zs.z;
  if (!z || z.chain) return;
  z.left = Math.max(1, Math.min(z.left, CZ_CONFIRM_ZENCHO_MAX_GAMES));
  z.total = z.step + z.left;
}

/**
 * ガセ前兆を本前兆へ格上げする。
 * 総ゲーム数は「ここまで見せたぶん + 残り」で組み直すので、
 * プレイヤーから見た経過ステップは巻き戻らない。
 */
function promoteZencho(zs, rng, win) {
  const z = zs.z;
  zs.pending = win;
  // 格上げ側もデバッグ指定を反映する(消費数は変えない。F5)
  z.strength = debugStrength(Math.max(z.strength, drawNumber(rng, ZENCHO.real.strengthDist)));
  z.pattern = drawPattern(rng, z.strength, 'real');
  z.left = Math.max(z.left, ZENCHO.upgrade.minLeft);
  z.total = z.step + z.left;
}

/**
 * 擬似連の1step(2026-08-13 ユーザー仕様 / 2026-08-14 に汎用化)。
 *
 * 呼ばれるのは前兆の消化(z.step++ / z.left-- の直後)。
 * 擬似連自身が当選を生むのはここだけ:
 *   step3 … czRateAtStep3 で CZ を付与し、その場で擬似連を終える(= 移行)
 *   step4 … ボーナスを付与(到達=確定)
 * どちらも upgradePending 経由なので、既に保持している当選より下がることはない。
 *
 * DeepRacer 専用だった実装を data/zencho.js のスペック駆動へ一般化した。
 * 擬似連を増やすときは CHAIN_SPEC_BY_PATTERN に1行足すだけでここは変えなくてよい。
 *
 * 演出契約(演出担当と共有):
 *   DeepRacer    … { param:'deepracer',    step, cars,  result }
 *   CodePipeline … { param:'codepipeline', step, stage, result }
 * param を分けてあるので、シナリオ側で絵を取り違えることがない。
 *
 * @returns {string|null} テロップ
 */
function advanceChain(zs, g, events) {
  const z = zs.z;
  const c = z.chain;
  const spec = c.spec;
  // step ごとの見た目パラメータ(DeepRacer=台数 / CodePipeline=ステージ名)
  c.value = spec.stepValues?.[z.step] ?? c.value;

  // step3: CZ移行抽選(外れたら終了 or step4 へ)
  if (z.step === spec.czStep && g.rng.chance(spec.czRateAtStep3)) {
    upgradePending(zs, { kind: 'CZ', czId: drawCzType(g.rng) });
    z.left = 0;
  }
  // step4: 到達 = ボーナス確定
  if (z.step >= spec.bonusStep) {
    upgradePending(zs, { kind: 'BONUS', bonusId: drawDirectBonus(g.rng, g.flag) });
    z.left = 0;
  }

  const isFinal = z.left <= 0;
  const result = isFinal
    ? (zs.pending ? (zs.pending.kind === 'CZ' ? 'cz' : 'bonus') : 'miss')
    : null;
  events.push({
    name: 'paramChange',
    payload: {
      param: spec.chainParam,
      step: z.step,
      [spec.stepField]: c.value,
      result,
    },
  });
  return spec.telops[z.step] ?? null;
}

/**
 * 保持中の当選を、より上位のものにだけ差し替える。
 * 擬似連が生む当選(CZ / BONUS)も必ずここを通すので、
 * 「前兆で保持していた当選が擬似連のせいで格下げされる」ことは起きない。
 * @returns {boolean} 差し替えたか
 */
function upgradePending(zs, win) {
  const cur = zs.pending;
  if (cur && ZENCHO_WIN_RANK[win.kind] <= ZENCHO_WIN_RANK[cur.kind]) return false;
  zs.pending = win;
  return true;
}

function clearZencho(zs, state = null) {
  zs.z = null;
  zs.pending = null;
  setZenchoActive(state, false);
}

/**
 * 前兆が走っているかの公開フラグ(2026-08-13 演出整合のため追加)。
 *
 * 「検出なし」「異常なし」のような**否定的な結末を持つ弱予告**が前兆中に出ると、
 * その直後の当選告知と矛盾する。シナリオ側が
 *   match: { 'modeState.zenchoActive': [false] }
 * で自分を抑制できるようにするための1ビット。
 *
 * 【重要】本前兆とガセ前兆を区別しない。区別できる情報を state に載せると
 * 「このフラグ = 本物」と読めてしまい、前兆の秘匿性(pending を WeakMap に隠している意味)が壊れる。
 * ガセ前兆中も等しく true になるので、抑制はかかっても本物はバレない。
 */
function setZenchoActive(state, active) {
  if (state) state.zenchoActive = Boolean(active);
}

/**
 * 前兆1ゲームぶんの通知。
 * left は演出ロジック用(最終G煽りの判定)であって、画面へ出してはいけない。
 * total は「本前兆最長5G / ガセ最長4G」をそのまま示す値なので payload に載せない
 * (載せると `match: { total: [5] }` の1行で本前兆が確定してしまう)。
 */
function zenchoStepEvent(zs) {
  const z = zs.z;
  return {
    name: 'paramChange',
    payload: {
      param: 'zencho',
      value: z.strength,
      delta: z.left,
      strength: z.strength,
      pattern: z.pattern,
      step: z.step,
      // 液晶のステップアップ用に 1〜3 へ丸めた段階値
      level: Math.min(3, z.step),
      left: z.left,
    },
  };
}

/**
 * 前兆中の当選(格上げ)。発生した時点で本前兆が確定する。
 * reason で演出の強さを出し分ける:
 *   PROMOTE … ガセ前兆が本前兆へ昇格(実質的な格上げ)
 *   RANKUP  … 保持中の当選より上位を引き当てた(本物の格上げ)
 *   ABSORB  … 同格以下だったので保持中の当選に吸収(格は上がっていない)
 */
function zenchoUpgradeEvent(zs, reason) {
  const z = zs.z;
  return {
    name: 'paramChange',
    payload: {
      param: 'zencho_upgrade',
      value: z.strength,
      delta: z.left,
      strength: z.strength,
      pattern: z.pattern,
      step: z.step,
      reason,
    },
  };
}

/** 前兆最終Gの結果告知 */
function zenchoEndEvent(zs, result, to) {
  const z = zs.z ?? {};
  return {
    name: 'paramChange',
    payload: {
      param: 'zencho_end',
      value: result,
      delta: 0,
      to: to ?? null,
      strength: z.strength ?? 0,
      pattern: z.pattern ?? null,
      step: z.step ?? 0,
      total: z.total ?? 0,
    },
  };
}

/**
 * 保持していた当選を実際の遷移へ変換する。
 *
 * すべて `onNextSpin: true` を付ける(2026-08-13 ユーザー指摘)。
 * 当選告知(デプロイ成功・クイズ正解・前兆の結果)は **通常ステージの画面のまま**
 * 出し切って、そのゲームはそこで終わる。CZ/ボーナスへ入るのは
 * **次にレバーを引いた瞬間**で、そのスピンが新モードの1ゲーム目になる。
 * 告知の裏で背景だけ先に切り替わる、という不自然さをここで断つ。
 */
function transitionFor(pending, state) {
  if (pending.kind === 'BONUS') {
    return {
      transition: {
        to: 'BONUS',
        params: {
          bonusId: pending.bonusId,
          /**
           * U11: 「RUSH級の恩恵」はボーナスへそのまま持ち込む。
           * レバーONフリーズ(data/freeze.js の reward)はここを通って
           * 「ボーナス + RUSH確定 + プレミア振り分け」になる。
           */
          rushGuaranteed: Boolean(pending.rushGuaranteed),
          premium: Boolean(pending.premium),
        },
        onNextSpin: true,
      },
      telop: ZENCHO.telops.bonus,
    };
  }
  if (pending.kind === 'AT') {
    // RUSH直撃。種別は当選時に確定済み(未指定なら標準のオートスケーリングRUSH)
    return {
      transition: { to: pending.rushId ?? 'AS_RUSH', params: {}, onNextSpin: true },
      telop: ZENCHO.telops.at,
    };
  }
  return {
    transition: {
      to: 'CZ',
      params: { czId: pending.czId, normalGames: state.games, route: state.winRoute ?? 'direct' },
      onNextSpin: true,
    },
    telop: ZENCHO.telops.cz,
  };
}
