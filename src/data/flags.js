/**
 * 小役構成テーブル(通常時 / 3BET)。DESIGN.md 3.3 の値をそのまま保持する。
 * `denom` は「1/N」の N。LOSE は残り確率の自動割当。
 *
 * `rare:` フィールドは **表示・資料用の写し**で、判定の正は data/rareroles.js。
 * ズレは rareFlagMismatches()(このファイル下部)が検出する。
 *
 * ■ 甘スロ(U44 / ?ama=1)
 * 起動時のURLクエリが ?ama=1 だった場合に限り、**このファイルの読み込み時に1回だけ**
 * 通常時テーブルのレア役の出現率を2倍に書き換える(applyAmaRareBoost)。
 * U48(2026-08-15)で通常設定そのものが従来の2倍、
 * **U63(2026-08-15)でさらに2倍 = 従来比4倍** になったので、
 * 甘スロは **従来比8倍**(レア役合計 1/3.1)になる。
 * = 「いまの通常設定が、U48時代の甘スロ相当」「甘スロはそこからさらに倍」。
 * レア役かどうかの判定は data/rareroles.js が一元的に持っているので、
 * ステージ昇格・CZ抽選・RUSH中の上乗せ・ホットスタンバイの延長といった
 * **レア役契機のシステムすべてが自動的に連動する**(個別の対応は不要)。
 * ボーナス中テーブル(BONUS_FLAGS)は据え置き = ボーナス→RUSHの当選率は通常と同じ。
 */

import { isRareRole } from './rareroles.js';
import { AMA, AMA_MODE } from './ama.js';

export const NORMAL_FLAGS = {
  id: 'normal_flags',
  bet: 3,
  flags: [
    { id: 'REPLAY',        name: 'リプレイ(DynamoDB)',  denom: 7.3,  payout: 3, rare: false },
    // スコアアタック化(2026-08-13)でコイン持ちを改善するため 1/6 → 1/5 へ。
    // 100回転しかないので「通常時にジリ貧で終わる回」を減らすのが狙い。
    //
    // 【2026-08-14 バランス調整で点検・据え置き(rin の点検項目 7-a)】
    // 通常時の期待払出は 1.93枚/G(BET3)= **純増 −1.07枚/G**。
    // 初当りを 1/100 まで絞ったので通常時は約81G/セッション = 約 −87枚。
    // ここを甘くする(ベル9枚など)と中央値とプラス収支率は上がるが、
    // 「当てないと勝てない」というスコアアタックの緊張が薄れるため **据え置き**とした。
    // コイン持ちを触るならここが最初のレバーになる(1枚上げるとセッション +16枚)。
    //
    // 【U63(2026-08-15)で 8枚 → 7枚】
    // レア役をさらに2倍にしたので、通常時の期待払出が **+0.223枚/G** 増えた
    // (レア役ぶん 0.223 → 0.446枚/G)。ここを据え置くとコイン持ちが2割伸びて
    // 中央値が 165 → 209枚・機械割が 193% まで浮いてしまう
    // (100回転を投げ切る前に飲まれる回が消えて「当てないと勝てない」が壊れる)。
    // 上のコメントどおり **コイン持ちの第一レバーはここ**なので、
    // 増えたぶんをベル1枚(−0.2枚/G)で戻している。
    //   U48時代 2.318枚/G(純増 −0.68)→ U63 で 2.541 → ベル7枚で **2.341枚/G**(純増 −0.66)
    // = レア役は倍見えるが、通常時の減り方は据え置き。
    { id: 'BELL',          name: 'ベル(EC2)',           denom: 5.0,  payout: 7, rare: false },
    // Phase 5 追加(DESIGN.md 3.1)。どちらもレア役ではない(内部状態の昇格には絡まない)。
    // REPLAY2 は出目と演出のバリエーション専用。
    // ALARM は「特殊役(Bedrock役)」なので、通常時のCZ抽選と
    // RUSH中のスケールアウト抽選(3.8 / 6%)、EC2バーストのクレジット回復(3.10)にだけ参加する。
    //
    // 【期待払出への影響】DESIGN.md 3.3 の検算値 1.85枚/G は この2役を含まない。
    // 3×(1/60) + 4×(1/120) = +0.083枚/G ぶん増えて 約1.93枚/G。
    // コイン持ちは 50 ÷ (3 − 1.93) ≒ 47G/50枚(設計値の43Gより少し伸びている)。
    { id: 'REPLAY2',       name: 'リプレイ2(Route 53)', denom: 60,   payout: 3, rare: false },
    { id: 'ALARM',         name: 'Bedrock(生成AI)',     denom: 120, payout: 4, rare: false },
    /*
     * ══ U48(2026-08-15 ユーザー指示)/ レア役の基準を2倍に ═══════════════
     *
     * 「レア役をもっと見たい」= **通常モードのレア役出現率を従来の2倍**にした
     * (従来の甘スロ相当が、これからの通常設定)。
     *   弱チェリー 1/50 → **1/25**   / 強チェリー 1/250 → **1/125**
     *   スイカ     1/100 → **1/50**  / チャンス目 1/180 → **1/90**
     *   サメ揃い   1/1200 → **1/600** / ゴースト揃い 1/6000 → **1/3000**
     *   レア役合計 1/24.7 → **1/12.3**(0.0406 → 0.0811 /G)
     * 増えたぶんは LOSE から取っている(合計は 0.443 で 1 を超えない)。
     *
     * ■ 「よく見るが重さは同じ」を守るための相殺(同時に実施)
     * レア役はこの台のほぼ全システムの契機なので、出現率だけ倍にすると
     * 初当りも出玉も倍になる。**レア役1回あたりの変換率を約半分**にして相殺した:
     *   data/modes.js  … CZ_ENTRY(レア役→CZ/直撃)を 0.5倍 /
     *                    ステージ昇格を 0.7倍 / czPerGame を **約0.60倍**
     *                    (高確 0.05→0.030 = 0.600倍 / 激アツ 0.20→0.119 = 0.595倍。
     *                     0.7倍だと実測の初当りが 1/92 と軽かったのでもう一段しぼった) /
     *                    RUSH中のスケールアウトと派生ゾーンを 0.5倍
     *   data/rushes.js … CF の確定クレジット / Aurora の ACU 上げ幅 /
     *                    ヒーローの +α を 0.5倍(1ゲームあたりの期待値は据え置き)
     *   data/freeze.js … レア役のフリーズ率を 0.5倍(遭遇率 8〜12% を維持)
     * → 実測(3,000セッション×3シード)は初当り 1/95〜110・平均220〜340枚・
     *   機械割 150〜190% の目標レンジに収まったまま、レア役の遭遇だけが倍になっている。
     *
     * ■ 期待払出への影響
     * レア役の払出は小さい(2/2/5/2/3/0枚)ので、増えたぶんは +0.11枚/G。
     * 通常時の純増は −1.07 → **−0.96枚/G**(コイン持ちがごくわずかに伸びる)。
     */
    /*
     * ══ U63(2026-08-15 ユーザー指示)/ レア役の基準をもう一段2倍に ═══════
     *
     * 「通常モードを、いまの甘スロ相当にしてほしい」= **U48 の値をさらに2倍**
     * (= U48 より前の従来比 **4倍**)。甘スロ(?ama=1)は倍率2のままなので、
     * 甘スロは新しい通常設定よりさらに甘い **従来比8倍** になる。
     *   弱チェリー 1/25 → **1/12.5**  / 強チェリー 1/125 → **1/62.5**
     *   スイカ     1/50 → **1/25**    / チャンス目 1/90  → **1/45**
     *   サメ揃い   1/600 → **1/300**  / ゴースト揃い 1/3000 → **1/1500**
     *   レア役合計 1/12.3 → **1/6.17**(0.0811 → 0.1622 /G = 6ゲームに1回)
     * 増えたぶんは LOSE から取っている(合計 0.524 で 1 を超えない)。
     * 甘スロ適用後でも 0.686 なので、下の役が死ぬことはない
     * (applyAmaRareBoost の 1.0 チェックにも余裕がある)。
     *
     * ■ 相殺(U48 と同じ手法。レア役1回あたりの変換率をもう一段しぼる)
     *   data/modes.js  … CZ_ENTRY(レア役→CZ/直撃)を 0.5倍 /
     *                    ステージ昇格を 0.7倍 / czPerGame を 0.60倍 /
     *                    Well-Architected CZ を 9G → **7G** /
     *                    RUSH中の派生ゾーンを 0.5倍
     *   data/rushes.js … AS の上乗せ台数 / CF の確定クレジット /
     *                    Aurora の ACU 上げ幅 / ヒーローの +α を 0.5倍
     *                    (**確定役の行だけは据え置き**。1回あたりが薄くなると
     *                     「サメを引いた瞬間が一番おいしい」が消えるうえ、
     *                     出現率が倍でも合計への寄与は +1〜2% しかないため)
     *   data/freeze.js … レア役のフリーズ率を 0.5倍(遭遇率 8〜12% を維持)
     *
     * ■ 期待払出への影響(→ ベルを 8 → 7枚にして相殺した。上の BELL のコメント参照)
     * レア役ぶんの払出が 0.223 → **0.446枚/G** に増えるので、
     * 何もしないと通常時の純増が −0.68 → −0.46枚/G = コイン持ちが3割伸びて
     * 中央値と機械割が浮く。ベルの払出 1枚(−0.2枚/G)で戻して **−0.66枚/G**
     * = レア役は倍見えるが、通常時の減り方は U48 と同じ、にしてある。
     */
    { id: 'WEAK_CHERRY',   name: '弱チェリー(IAM)',     denom: 12.5, payout: 2, rare: true },
    { id: 'STRONG_CHERRY', name: '強チェリー(IAM金)',   denom: 62.5, payout: 2, rare: true },
    { id: 'MELON',         name: 'スイカ(S3)',          denom: 25,   payout: 5, rare: true },
    { id: 'CHANCE',        name: 'チャンス目(Lambda)',  denom: 45,   payout: 2, rare: true },
    { id: 'SHARK',         name: 'サメ揃い(BAR)',       denom: 300,  payout: 3, rare: true },
    { id: 'GHOST',         name: 'ゴースト揃い(幽霊7)', denom: 1500, payout: 0, rare: true },
    { id: 'LOSE',          name: 'ハズレ',              denom: null, payout: 0, rare: false },
  ],
  /** U63(レア役さらに2倍)の直前のベル払出。コイン持ちを戻すならここが第一レバー */
  previousBellPayout: 8,
  /** U63(レア役さらに2倍)の直前値 = U48 の値。戻すときの基準として保持 */
  previousRareDenomsU48: {
    WEAK_CHERRY: 25, STRONG_CHERRY: 125, MELON: 50, CHANCE: 90, SHARK: 600, GHOST: 3000,
  },
  /** U48(レア役2倍)の直前値。戻すときの基準として保持 */
  previousRareDenoms: {
    WEAK_CHERRY: 50, STRONG_CHERRY: 250, MELON: 100, CHANCE: 180, SHARK: 1200, GHOST: 6000,
  },
};

/**
 * ボーナス中の小役構成テーブル(3BET)。DESIGN.md 3.7
 *
 * 仕様変更(2026-08-13 ユーザー決定): ボーナスは「固定純増n枚/G」をやめ、
 * 実機と同じ「ボーナス中はベルが高確率で揃い、揃うたびに15枚」で増える方式にした。
 *
 * 設計方針:
 *  - BELL は高確率で揃う。払出は 15枚(通常時の8枚は据え置き)
 *  - REPLAY は出目のアクセントとして少量(1/20)だけ残す(払出3枚 = BET と同じで純増0)
 *  - 残りはハズレ。ベルがこぼれる瞬間があることで「揃った」の気持ち良さが立つ
 *
 * ── U22(2026-08-14 ユーザー指示)/ レア役の出現率を引き上げた ────────────
 *
 * RUSH抽選の契機が **レア役成立時のみ** になった(旧: 子役全部)。
 * 旧テーブルはレア役が通常時と同じ確率(合計 1/24.7 = 0.0406/G)しか無く、
 * これでは全部のレア役をRUSH確定にしても総合当選率が
 *   シャークボーナス 22% / ゴーストボーナス 28% / SP 69%
 * にしか届かない(目標 12 / 45 / 85%)。**契機を絞ったぶん、契機そのものを増やす**
 * のが唯一の解なので、ボーナス中だけレア役の出現率を引き上げた:
 *
 *   弱チェリー 1/50 → **1/10** / スイカ 1/100 → **1/18**
 *   チャンス目 1/180 → **1/28** / 強チェリー 1/250 → **1/60**
 *   サメ揃い   1/1200 → **1/400**(ボーナス中は引けたらRUSH確定)
 *   ゴースト揃い 1/6000(据え置き。プレミア振り分けの希少性を守るため)
 *   → レア役の合計 **0.2106/G**(ボーナス5ゲームに1回はレア役が成立する)
 *
 * 増やしたぶんの確率はベルから取った(1/1.2 → **1/1.4**)。
 * data/rushes.js の RUSH_ENTRY はこの出現率から当選率を逆算しているので、
 * **ここを動かしたら必ず bonusMult を引き直すこと**(scripts/sim.mjs の検証25が落ちる)。
 *
 * 【期待払出の検算】
 *   15×(1/1.4) + 3×(1/20) + 2×(1/10) + 2×(1/60) + 5×(1/18)
 *   + 2×(1/28) + 3×(1/400) + 0×(1/6000) ≒ 11.45枚/G
 *   → 純増 ≒ 11.45 − 3 = **8.45枚/G**(旧 9.76枚/G から −13.4%)
 *   → シャークボーナス(6G)≒ 51枚 / ゴーストボーナス(8G)≒ 68枚 /
 *     ゴーストボーナスSP(平均12G)≒ 101枚
 *   ※ ベルの出現率を下げたぶん純増が落ちている。据え置きに戻すなら
 *     **ベルの払出を 15 → 17枚**(net 9.9枚/G)が一番副作用が少ない。
 *     バランス担当の判断待ちなので、ここでは払出に触れていない。
 *
 * ※ 累積で引くため BELL を先頭に置いている(drawFlag は上から順に加算する)。
 */
export const BONUS_FLAGS = {
  id: 'bonus_flags',
  bet: 3,
  flags: [
    { id: 'BELL',          name: 'ベル(EC2)',           denom: 1.4,  payout: 15, rare: false },
    { id: 'REPLAY',        name: 'リプレイ(DynamoDB)',  denom: 20,   payout: 3,  rare: false },
    { id: 'WEAK_CHERRY',   name: '弱チェリー(IAM)',     denom: 10,   payout: 2,  rare: true },
    { id: 'STRONG_CHERRY', name: '強チェリー(IAM金)',   denom: 60,   payout: 2,  rare: true },
    { id: 'MELON',         name: 'スイカ(S3)',          denom: 18,   payout: 5,  rare: true },
    { id: 'CHANCE',        name: 'チャンス目(Lambda)',  denom: 28,   payout: 2,  rare: true },
    { id: 'SHARK',         name: 'サメ揃い(BAR)',       denom: 400,  payout: 3,  rare: true },
    { id: 'GHOST',         name: 'ゴースト揃い(幽霊7)', denom: 6000, payout: 0,  rare: true },
    { id: 'LOSE',          name: 'ハズレ',              denom: null, payout: 0,  rare: false },
  ],
  /** U22 でレア役を増やす前の出現率(戻す時の基準として保持) */
  previousDenoms: {
    BELL: 1.2, WEAK_CHERRY: 50, STRONG_CHERRY: 250, MELON: 100, CHANCE: 180, SHARK: 1200,
  },
};

/**
 * 甘スロを適用する前の通常時テーブルの分母(1/N の N)。
 * 「いま何倍になっているか」を表示・検証から引けるように、書き換え前の値を残す。
 */
export const NORMAL_BASE_DENOMS = Object.fromEntries(
  NORMAL_FLAGS.flags.map((f) => [f.id, f.denom]),
);

/**
 * 小役テーブルの当選確率の合計(= LOSE 以外の合計)。
 * drawFlag は「上から累積で引き、どれにも当たらなければ LOSE」なので、
 * この合計が 1 を超えるとテーブルの下の方の役が永久に成立しなくなる。
 * @param {{flags: Array<{denom:number|null}>}} table
 * @returns {number} 0〜1
 */
export function flagTableRate(table) {
  return (table?.flags ?? []).reduce((a, f) => (f.denom ? a + 1 / f.denom : a), 0);
}

/**
 * 甘スロ(U44): 通常時テーブルの **レア役だけ** の出現率を mult 倍にする。
 *
 * 「1/N の N を mult で割る」= 当選値(1/N)が mult 倍になる。
 * 増えたぶんは LOSE(残り確率の自動割当)から取られるので、
 * テーブル全体は **合計が1を超えない限り自動的に正規化される**。
 * 万一 1 を超える設定を入れた場合は下の役が死ぬので、その場で警告して倍率を諦める
 * (壊れたテーブルのまま黙って走るより、通常設定で遊べるほうが良い)。
 *
 * @param {{flags: Array<{id:string, denom:number|null}>}} table 書き換える小役テーブル
 * @param {number} [mult] 倍率(既定は AMA.rareMultiplier = 2)
 * @returns {boolean} 実際に適用したか
 */
export function applyAmaRareBoost(table, mult = AMA.rareMultiplier) {
  if (!(mult > 1)) return false;
  const boosted = (table?.flags ?? []).reduce(
    (a, f) => (f.denom && isRareRole(f.id) ? a + (1 / f.denom) * (mult - 1) : a),
    0,
  );
  // LOSE の取り分が残らない倍率は適用しない(下位の役が引けなくなる)
  if (flagTableRate(table) + boosted >= 1) {
    console.warn(`[flags] 甘スロ ×${mult} は確率合計が1を超えるため適用しません`);
    return false;
  }
  for (const f of table.flags) {
    if (!f.denom || !isRareRole(f.id)) continue;
    f.denom /= mult;
  }
  return true;
}

/**
 * 甘スロが実際に効いているか(表示・検証用)。
 * URLクエリが ?ama=1 でも、倍率が不正でテーブルを書き換えなかった場合は false になる。
 */
export const AMA_APPLIED = AMA_MODE ? applyAmaRareBoost(NORMAL_FLAGS) : false;

/**
 * 小役テーブルのレジストリ。
 * モードハンドラが `flagTable: 'BONUS'` と宣言すると、その滞在中は
 * 抽選(lottery.drawFlag)と払出(payouts.payoutOf)がこちらのテーブルを引く。
 */
export const FLAG_TABLES = {
  NORMAL: NORMAL_FLAGS,
  BONUS: BONUS_FLAGS,
};

/** 既定(通常時)の小役テーブルID */
export const DEFAULT_FLAG_TABLE = 'NORMAL';

/** テーブルIDから小役テーブルを引く(未知のIDは通常時扱い) */
export function flagTableOf(tableId = DEFAULT_FLAG_TABLE) {
  return FLAG_TABLES[tableId] ?? NORMAL_FLAGS;
}

/** フラグID -> 定義 の逆引き(名前・払出は通常時テーブルを正とする) */
export const FLAG_BY_ID = Object.fromEntries(NORMAL_FLAGS.flags.map((f) => [f.id, f]));

/**
 * レア役かどうか。
 *
 * 【判定の本体は data/rareroles.js】(2026-08-14 / U22〜U24 のレア役統一)。
 * ゲーム側の契機判定は isRareRole を直接 import すること。
 * ここは表示系(src/main.js など)からの既存 import を壊さないための別名で、
 * テーブルの `rare:` フィールドではなく **必ず共通定義**を引く。
 * @param {string} flagId
 */
export function isRare(flagId) {
  return isRareRole(flagId);
}

/**
 * 小役テーブルの `rare:` フィールドと共通定義(data/rareroles.js)のズレを検出する。
 * 役を足したときに片方だけ直す事故を防ぐための開発用チェックで、
 * scripts/sim.mjs の狙い撃ち確認が毎回呼ぶ。
 * @returns {string[]} ズレている役ID(空なら整合)
 */
export function rareFlagMismatches() {
  const out = [];
  for (const table of Object.values(FLAG_TABLES)) {
    for (const f of table.flags) {
      if (f.id === 'LOSE') continue;
      if (Boolean(f.rare) !== isRareRole(f.id)) out.push(`${table.id}:${f.id}`);
    }
  }
  return out;
}

/**
 * 成立役ごとの「狙う絵柄」。DESIGN.md 6.4 の TARGET_SYMBOL。
 * null は自由停止(入賞を作らない位置を選ぶ)。
 * - CHERRY 系は左リール中段停止で成立する単独役(DESIGN.md 3.2)
 * - CHANCE は左リール中段に LAMBDA が絡む出目
 */
export const TARGET_SYMBOL = {
  REPLAY:        ['REPLAY', 'REPLAY', 'REPLAY'],
  BELL:          ['BELL', 'BELL', 'BELL'],
  REPLAY2:       ['REPLAY2', 'REPLAY2', 'REPLAY2'],
  ALARM:         ['ALARM', 'ALARM', 'ALARM'],
  WEAK_CHERRY:   ['CHERRY', null, null],
  STRONG_CHERRY: ['CHERRY', null, null],
  MELON:         ['MELON', 'MELON', 'MELON'],
  CHANCE:        ['LAMBDA', null, null],
  SHARK:         ['SHARKBAR', 'SHARKBAR', 'SHARKBAR'],
  GHOST:         ['GHOST7', 'GHOST7', 'GHOST7'],
  LOSE:          [null, null, null],
};

/**
 * デバッグ用の強制成立キー割当(キー 1〜8)。DESIGN.md 6.9
 */
export const DEBUG_FLAG_KEYS = [
  { key: '1', flag: 'WEAK_CHERRY',   short: '弱チェリー' },
  { key: '2', flag: 'STRONG_CHERRY', short: '強チェリー' },
  { key: '3', flag: 'MELON',         short: 'スイカ' },
  { key: '4', flag: 'CHANCE',        short: 'チャンス目' },
  { key: '5', flag: 'BELL',          short: 'ベル' },
  { key: '6', flag: 'REPLAY',        short: 'リプレイ' },
  { key: '7', flag: 'SHARK',         short: 'サメ揃い' },
  { key: '8', flag: 'GHOST',         short: 'ゴースト揃い' },
  { key: '9', flag: 'REPLAY2',       short: 'リプレイ2' },
  { key: '-', flag: 'ALARM',         short: 'Bedrock' },
];
