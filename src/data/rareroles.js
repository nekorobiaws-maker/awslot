/**
 * レア役セットの一元定義(2026-08-14 ユーザー指示 U22 / U23 / U24 / U28 の共通土台)
 *
 * ■ なぜ独立したファイルにしたか
 * 「ボーナス中のRUSH抽選」「ホットスタンバイの+1G」「RUSH中の上乗せ」など、
 * ゲームの契機が **すべて「レア役成立時のみ」へ統一** された。
 * 判定が data/flags.js の `rare: true` フィールドと各モードの直書き条件
 * (`g.flag !== 'LOSE'` など)に散らばっていると、
 * 役を1つ足した / 契機を1つ足した瞬間にどこかが取りこぼす。
 * **レア役かどうかの答えはこのファイルだけが持つ**。
 *
 * ■ レア役とは(ユーザー定義)
 *   スイカ(S3)/ 弱チェリー(IAM)/ 強チェリー(IAM金)/ チャンス目(Lambda)
 *   + 確定役系(サメ揃い / ゴースト揃い)
 * ベル(EC2)・リプレイ(DynamoDB / Route 53)・Bedrock役は **レア役ではない**。
 *
 * ■ 例外(1つだけ)
 * Well-Architected CZ(6本の柱)の「通常小役で +1本」だけは、
 * ユーザー指示により **小役(払出のある成立役)全部** が対象のまま。
 * あのCZは「引けた役の強さで柱が伸びる」参加型が主題なので、
 * ここでレア役に絞ると柱が1本も立たない回が大半になってしまう。
 * → game/modes/cz.js の pillarGainOf は意図的に isRareRole を使わない。
 *
 * ■ 依存を持たない
 * 演出シナリオ(data/scenarios/**)からも import できるよう、
 * **このファイルは何も import しない**。data/flags.js は逆にここを参照する
 * (flags.js → rareroles.js の一方向。循環参照を作らないこと)。
 *
 * ■ 甘スロ(U44 / ?ama=1)との関係
 * 甘スロは **レア役の出現率だけ** を2倍にする設定(data/flags.js の applyAmaRareBoost)。
 * どの役がレア役かの定義(この配列)は変わらないので、
 * レア役契機のシステムは何も直さずに自動で連動する。
 */

/**
 * レア役のフラグID(この配列が唯一の正)。
 * data/flags.js の小役テーブルにある `rare: true` はこの配列と一致していなければならず、
 * ズレは flags.js の rareFlagMismatches() が検出する(scripts/sim.mjs が毎回チェックする)。
 */
export const RARE_ROLE_IDS = [
  'WEAK_CHERRY',   // 弱チェリー(IAM)
  'STRONG_CHERRY', // 強チェリー(IAM金)
  'MELON',         // スイカ(S3)
  'CHANCE',        // チャンス目(Lambda)
  'SHARK',         // サメ揃い(BAR)    … 確定役系
  'GHOST',         // ゴースト揃い(幽霊7)… 確定役系
];

/**
 * 確定役系。「引けた時点で恩恵が確定する」枠。
 * ボーナス中のRUSH抽選(data/rushes.js の alwaysWinFlags)や
 * 通常時のボーナス直撃(data/modes.js の CZ_ENTRY)がここを特別扱いする。
 */
export const CONFIRMED_ROLE_IDS = ['SHARK', 'GHOST'];

const RARE_SET = new Set(RARE_ROLE_IDS);

/**
 * レア役か。ゲーム側の契機判定は **必ずこの関数を通す**。
 * @param {string} flagId 成立役のフラグID
 * @returns {boolean}
 */
export function isRareRole(flagId) {
  return RARE_SET.has(flagId);
}

/**
 * レア役の系統。予告の色分け(スイカ=緑 / チェリー=赤)など、
 * **演出側が「どの系統のレア役か」で分岐する**ときに使う。
 * 演出シナリオからも import 可能(このファイルは依存を持たないため)。
 *
 * ※ 2026-08-14 時点でゲーム側からの参照は無く、**演出担当向けの公開口**として残している
 *   (data/scenarios/** が系統別の予告を足すときの入口)。
 *   使われないまま次のレビューを迎えたら、そのときに削除してよい。
 */
export const RARE_ROLE_GROUP = {
  WEAK_CHERRY: 'cherry',
  STRONG_CHERRY: 'cherry',
  MELON: 'melon',
  CHANCE: 'chance',
  SHARK: 'confirmed',
  GHOST: 'confirmed',
};

/**
 * 系統を引く(レア役でなければ null)。
 * @param {string} flagId
 * @returns {'cherry'|'melon'|'chance'|'confirmed'|null}
 */
export function rareRoleGroupOf(flagId) {
  return RARE_ROLE_GROUP[flagId] ?? null;
}

/**
 * 小役テーブル(data/flags.js の NORMAL_FLAGS / BONUS_FLAGS)における
 * **レア役の合計出現率**(1ゲームあたり)。
 *
 * 「レア役契機の当選率を逆算する」計算(data/rushes.js の設計コメント、
 * scripts/sim.mjs の検証)が同じ式を二度書かないための共通処理。
 * @param {{flags: Array<{id:string, denom:number|null}>}} flagTable
 * @returns {number} 0〜1
 */
export function rareRateOf(flagTable) {
  return (flagTable?.flags ?? []).reduce(
    (sum, f) => (f.denom && RARE_SET.has(f.id) ? sum + 1 / f.denom : sum),
    0,
  );
}
