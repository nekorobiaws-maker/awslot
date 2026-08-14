/**
 * 抽選エンジン(テーブル駆動)。DESIGN.md 3章。
 * ここには「テーブルを引くだけ」の純粋関数を置き、
 * モード固有の判断は game/modes/ 側に持たせる。
 */

import { DEFAULT_FLAG_TABLE, flagTableOf } from '../data/flags.js';
import { FREEZE } from '../data/freeze.js';
import {
  CZ_ENTRY, CZ_TYPES, CZ_SPEC_BY_ID, AS_RUSH_CORE, BONUS_SPEC_BY_ID,
  DIRECT_BONUS_DIST, RUSH_DERIVED_ENTRY, SERVERLESS_UPGRADE, ZONE_NESTED_ENTRY,
  ZONE_SPEC_BY_ID, NORMAL_SUBSTATES,
} from '../data/modes.js';
import { RUSH_ENTRY, RUSH_TYPES, RUSH_SPEC_BY_ID } from '../data/rushes.js';
import { isRareRole } from '../data/rareroles.js';

/**
 * 小役抽選。DESIGN.md 3.3 / 3.7
 * @param {import('../engine/rng.js').Rng} rng
 * @param {string|null} forced デバッグ用の強制成立フラグ
 * @param {string} [tableId] 小役テーブルID('NORMAL' / 'BONUS')
 * @returns {string} フラグID
 */
export function drawFlag(rng, forced = null, tableId = DEFAULT_FLAG_TABLE) {
  if (forced) return forced;
  const r = rng.next();
  let acc = 0;
  for (const f of flagTableOf(tableId).flags) {
    if (f.denom === null) continue;
    acc += 1 / f.denom;
    if (r < acc) return f.id;
  }
  return 'LOSE';
}

/**
 * レバーONフリーズの抽選(data/freeze.js)。
 *
 * 【必ずゲーム抽選RNGで呼ぶこと】恩恵がボーナス直撃なので結果に効く。
 * 演出RNG(stagingRng)から呼んではいけない。
 *
 * 乱数消費の約束:
 *   - FREEZE.modes に含まれないモード … **1回も消費しない**(通常時以外で乱数列がズレない)
 *   - 含まれるモード                 … 役の率にかかわらず **必ず1回だけ** 消費する
 *
 * 後者を rng.chance() ではなく next() の直接比較で書いているのは、
 * Rng#chance が p<=0 のとき next() を消費せずに返すため。
 * 率を 0 にした瞬間に以降の乱数列が丸ごとズレて同じシードの再現が壊れるので、
 * game/modes/freetier.js の drawWeightedFixed と同じ「消費数固定」の作法に揃える。
 *
 * @param {import('../engine/rng.js').Rng} rng ゲーム抽選RNG
 * @param {string} flag 成立役(drawFlag の結果。= 出目は既に確定している)
 * @param {string} modeId レバーON時点のモードID
 * @returns {boolean} フリーズ当選か
 */
export function drawFreeze(rng, flag, modeId) {
  if (!FREEZE.modes.includes(modeId)) return false;
  const rate = FREEZE.rateByFlag[flag] ?? 0;
  const r = rng.next();
  return rate > 0 && r < rate;
}

/**
 * 内部状態の czMultiplier を当選率へ適用する。DESIGN.md 3.4
 *
 * 単純な `min(1, p * mult)` だと、確率の高い行(強チェリー0.85など)が
 * Warm Pool(×2)の時点で 1.0 に張り付き、Provisioned(×4)との差が消えてしまう。
 * = 内部状態3段階という看板機能が実質2段階以下になる。
 *
 * そこで「非当選側を mult 回ぶん重ねる」形にする:
 *   p_eff = 1 - (1 - p)^mult
 * ・p が小さい帯では ほぼ p * mult(設計意図どおりの体感)
 * ・p が 1 に近い帯でも 1 を超えず、必ず状態差が残る(飽和しない)
 * 例: p=0.30 → ×2:0.51 / ×4:0.7599、p=0.85 → ×2:0.9775 / ×4:0.99949
 *
 * @param {number} p 基準確率(Cold Start 基準)
 * @param {number} mult 内部状態の倍率(1.0 / 2.0 / 4.0)
 */
export function applyCzMultiplier(p, mult = 1) {
  if (!(p > 0)) return 0;
  if (p >= 1 || mult <= 1) return Math.min(1, p);
  return 1 - (1 - p) ** mult;
}

/**
 * CZ / ボーナス / AT直撃の当選抽選。DESIGN.md 3.5
 * @returns {{cz:boolean, bonus:boolean, directAt:boolean}}
 */
export function drawCzEntry(rng, flag, czMultiplier = 1.0) {
  const row = CZ_ENTRY.table[flag];
  const none = { cz: false, bonus: false, directAt: false };
  if (!row) return none;

  // 上位のものから順に判定する(ボーナス直撃 > AT直撃 > CZ)
  if (rng.chance(applyCzMultiplier(row.bonus, czMultiplier))) {
    return { cz: false, bonus: true, directAt: false };
  }
  if (rng.chance(applyCzMultiplier(row.direct_at, czMultiplier))) {
    return { cz: false, bonus: false, directAt: true };
  }
  if (rng.chance(applyCzMultiplier(row.cz, czMultiplier))) {
    return { cz: true, bonus: false, directAt: false };
  }
  return none;
}

/**
 * CZ種別の振り分け。DESIGN.md 3.6
 * @param {string[]} [allow] 実装済みCZに限定したい場合に指定
 */
export function drawCzType(rng, allow = null) {
  let dist = CZ_TYPES.distribution;
  if (allow) {
    dist = Object.fromEntries(Object.entries(dist).filter(([k]) => allow.includes(k)));
  }
  return rng.weighted(dist) ?? 'CW_ALARM';
}

/**
 * CZ突破時のボーナス振り分け。DESIGN.md 3.6
 * @param {string[]} [allow] 実装済みボーナスに限定したい場合に指定
 */
export function drawBonusType(rng, czId, allow = null) {
  const spec = CZ_SPEC_BY_ID[czId];
  let dist = spec?.bonusDist ?? { LAMBDA_REG: 1 };
  if (allow) {
    const filtered = Object.fromEntries(Object.entries(dist).filter(([k]) => allow.includes(k)));
    if (Object.keys(filtered).length > 0) dist = filtered;
  }
  return rng.weighted(dist) ?? 'LAMBDA_REG';
}

/** ボーナスのDC初期値抽選。DESIGN.md 3.7 */
export function drawInitialDc(rng, bonusId) {
  const spec = BONUS_SPEC_BY_ID[bonusId];
  if (!spec?.dcInitDist) return 1;
  const picked = rng.weighted(spec.dcInitDist);
  return picked ? Number(picked) : 1;
}

/**
 * RUSH中のスケールアウト抽選。DESIGN.md 3.8
 *
 * 2026-08-13 のユーザー補足(「ゲーム数ではなく純増が増えていく形にしたい」)を受けて、
 * 「当たったか」ではなく **何台増えたか** を返す形に変えた。
 *  - 役ごとの基礎確率に、現在DCの渋み係数(scaleOutDcFactor)を掛ける
 *  - 強いレア役はダブルスケールアウト(+2)を抽選する
 *
 * @param {import('../engine/rng.js').Rng} rng
 * @param {string} flag 成立役
 * @param {number} dc 現在のDC(高いほど上がりにくい)
 * @returns {number} 増える台数(0 / 1 / 2)
 */
export function drawScaleOut(rng, flag, dc = 1) {
  const base = AS_RUSH_CORE.scaleOut[flag];
  if (!base) return 0;
  const factor = AS_RUSH_CORE.scaleOutDcFactor[dc] ?? 1;
  if (factor <= 0) return 0;
  if (!rng.chance(base * factor)) return 0;

  const dbl = AS_RUSH_CORE.doubleScaleOut[flag] ?? 0;
  return dbl > 0 && rng.chance(dbl) ? 2 : 1;
}

/** 高DC帯のベル強化(純増の波)。@returns 上乗せ枚数 */
export function bellBoostOf(dc) {
  return AS_RUSH_CORE.bellBoost[dc] ?? 0;
}

/**
 * 【退役】AT当選抽選(ボーナス突入時の一発判定)。DESIGN.md 3.7
 *
 * 2026-08-14 の U11(RUSH体系の作り替え)で、RUSH突入の判定は
 * **ボーナス中のレア役契機**(drawBonusRushWin)へ移った(U22)。
 * 旧経路の比較・検証用にデータごと残してあるが、ゲーム進行からは呼ばれない。
 */
export function drawAtWin(rng, bonusId) {
  const spec = BONUS_SPEC_BY_ID[bonusId];
  return rng.chance(spec?.atRate ?? 0);
}

// ── U11: RUSH 体系(data/rushes.js)──────────────

/**
 * ボーナス中の **レア役契機** RUSH抽選(U11 の主経路 / U22・U28 でレア役限定)。
 *
 * 【必ずゲーム抽選RNGで呼ぶこと】RUSH突入そのものを決める抽選。
 *
 * 抽選が走る条件は **レア役が成立したゲームだけ**(data/rareroles.js が正)。
 * ベル・リプレイ・Bedrock役・ハズレでは抽選そのものが走らない(U22)。
 * シャークボーナスも同じロジックで抽選する(U28)。
 *
 * 乱数消費の約束:
 *   - レア役以外のゲーム … **1回も消費しない**
 *   - レア役のゲーム     … 役の率にかかわらず **必ず1回だけ** 消費する
 * 率が 1.0(サメ揃い・ゴースト揃い)でも next() を引くのは、
 * data/rushes.js の率をいじった瞬間に乱数列がズレて再現が壊れるのを防ぐため
 * (game/modes/freetier.js の drawWeightedFixed と同じ作法)。
 *
 * @param {import('../engine/rng.js').Rng} rng ゲーム抽選RNG
 * @param {string} flag 成立役
 * @param {string} bonusId ボーナス種別(倍率 = ボーナスの格)
 * @returns {boolean} RUSH当選か
 */
export function drawBonusRushWin(rng, flag, bonusId) {
  if (!isRareRole(flag)) return false;           // レア役以外は抽選しない(U22)
  const p = bonusRushWinRate(flag, bonusId);
  return rng.next() < p;
}

/**
 * レア役1回あたりのRUSH当選率(抽選せずに率だけ引く)。
 * 液晶の期待度表示・検証(scripts/sim.mjs)が抽選と同じ式を二度書かないための共通処理。
 * @param {string} flag 成立役
 * @param {string} bonusId ボーナス種別
 * @returns {number} 0〜1(レア役以外は 0)
 */
export function bonusRushWinRate(flag, bonusId) {
  if (!isRareRole(flag)) return 0;
  // 確定役系(サメ揃い / ゴースト揃い)はボーナスの格にかかわらず当選確定
  if (RUSH_ENTRY.alwaysWinFlags.includes(flag)) return 1;
  const base = RUSH_ENTRY.rateByFlag[flag] ?? 0;
  const mult = RUSH_ENTRY.bonusMult[bonusId] ?? 1;
  return Math.min(1, base * mult);
}

/**
 * RUSH種別の振り分け(data/rushes.js の RUSH_TYPES)。
 *
 * @param {import('../engine/rng.js').Rng} rng ゲーム抽選RNG
 * @param {boolean} [premium] プレミア契機(フリーズ / ボーナス中のゴースト揃い)か。
 *                            true ならヒーローRUSHの当選率が跳ね上がる
 * @returns {string} RUSHのモードID
 */
export function drawRushType(rng, premium = false) {
  const dist = premium ? RUSH_TYPES.premiumDistribution : RUSH_TYPES.distribution;
  return rng.weighted(dist) ?? 'AS_RUSH';
}

/** オートスケーリングRUSH の初期台数(= 初期ゲーム数)抽選 */
export function drawRushInitUnits(rng) {
  const spec = RUSH_SPEC_BY_ID.AS_RUSH;
  return Number(rng.weighted(spec.initUnitsDist) ?? 3);
}

/**
 * CloudFront RUSH の毎ゲーム払い出し抽選。
 * 乱数は「ヒット判定 → 枚数」の順に最大2回。非ヒット時は1回。
 * @returns {number} 払い出し枚数(非ヒットなら0)
 */
export function drawCloudFrontHit(rng) {
  const spec = RUSH_SPEC_BY_ID.CF_RUSH;
  if (!rng.chance(spec.hitRate)) return 0;
  return Number(rng.weighted(spec.hitCoinDist) ?? 10);
}

/**
 * ヒーローRUSH の毎ゲーム抽選。
 * 当選率・当選枚数は data/rushes.js の `HERO_RUSH`(hitRate / hitCoin)が正。
 * U40(2026-08-15)で当選枚数が 100 → 50枚 になったので、**数字はここに書き写さない**。
 */
export function drawHeroHit(rng) {
  const spec = RUSH_SPEC_BY_ID.HERO_RUSH;
  return rng.chance(spec.hitRate) ? spec.hitCoin : 0;
}

// ── Phase 5 ──────────────────────────────────

/** ボーナス直撃時の種別振り分け(当選率そのものは 3.5 のまま) */
export function drawDirectBonus(rng, flag) {
  const dist = DIRECT_BONUS_DIST.byFlag[flag] ?? DIRECT_BONUS_DIST.byFlag.default;
  return rng.weighted(dist) ?? 'S3_BIG';
}

/**
 * 「上から順に累積で引く」テーブル抽選の共通処理。
 * 合計が 1 未満なら残りは非当選(null)。
 * @param {Record<string, number>} row
 */
function drawCumulative(rng, row) {
  if (!row) return null;
  const r = rng.next();
  let acc = 0;
  for (const [id, p] of Object.entries(row)) {
    acc += p;
    if (r < acc) return id;
  }
  return null;
}

/**
 * RUSH中の派生ゾーン当選抽選。DESIGN.md 3.9
 * @returns {string|null} ゾーンID / 'SERVERLESS_UP' / 非当選なら null
 */
export function drawDerivedZone(rng, flag) {
  return drawCumulative(rng, RUSH_DERIVED_ENTRY.table[flag]);
}

/** Serverless RUSH 昇格抽選(サメ揃い契機。DESIGN.md 2.2 M09) */
export function drawServerlessUpgrade(rng, flag) {
  const p = SERVERLESS_UPGRADE.onFlag[flag];
  return p ? rng.chance(p) : false;
}

/** 派生ゾーン中の上乗せ特化ゾーン当選(入れ子。DESIGN.md 6.3) */
export function drawNestedZone(rng, flag) {
  return drawCumulative(rng, ZONE_NESTED_ENTRY.table[flag]);
}

/** Reserved Instance の契約年数抽選。DESIGN.md 3.10 */
export function drawReservedContract(rng) {
  const spec = ZONE_SPEC_BY_ID.RESERVED;
  return rng.weighted(spec.contractDist) ?? '1year';
}

/** Kinesis のシャード数抽選。DESIGN.md 3.10 */
export function drawKinesisShards(rng) {
  const spec = ZONE_SPEC_BY_ID.KINESIS;
  return Number(rng.weighted(spec.shardDist) ?? 1);
}

/**
 * Kinesis の1シャードあたり上乗せ枚数。DESIGN.md 3.10
 * スコアアタック化(2026-08-13)でセット上乗せ → 枚数上乗せへ変更。
 */
export function drawKinesisAddCoin(rng) {
  const spec = ZONE_SPEC_BY_ID.KINESIS;
  return Number(rng.weighted(spec.addCoinPerShardDist) ?? 5);
}

/**
 * CloudFront の1ゲームあたり上乗せ枚数。DESIGN.md 3.10
 * スコアアタック化(2026-08-13)でセット上乗せ → 枚数上乗せへ変更。
 */
export function drawCloudFrontAddCoin(rng) {
  const spec = ZONE_SPEC_BY_ID.CLOUDFRONT;
  return Number(rng.weighted(spec.addCoinPerGameDist) ?? 0);
}

/**
 * 通常時の内部状態の昇格抽選。DESIGN.md 3.4
 * @returns {string|null} 昇格先のID(昇格しないなら null)
 */
export function drawSubStateUpgrade(rng, flag, current) {
  const row = NORMAL_SUBSTATES.upgrade[flag];
  if (!row) return null;
  const order = ['COLD_START', 'WARM_POOL', 'PROVISIONED'];
  const curIdx = order.indexOf(current);
  // 上位から判定する(PROVISIONED を先に引く)
  for (const id of ['PROVISIONED', 'WARM_POOL']) {
    if (order.indexOf(id) <= curIdx) continue;
    if (rng.chance(row[id] ?? 0)) return id;
  }
  return null;
}

/**
 * 通常時の内部状態の転落抽選。DESIGN.md 3.4
 * @returns {string|null} 転落先のID(転落しないなら null)
 */
export function drawSubStateDowngrade(rng, current) {
  const p = NORMAL_SUBSTATES.downgradePerGame[current];
  if (!p || !rng.chance(p)) return null;
  return current === 'PROVISIONED' ? 'WARM_POOL' : 'COLD_START';
}
