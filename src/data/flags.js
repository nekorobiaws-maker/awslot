/**
 * 小役構成テーブル(通常時 / 3BET)。DESIGN.md 3.3 の値をそのまま保持する。
 * `denom` は「1/N」の N。LOSE は残り確率の自動割当。
 */

export const NORMAL_FLAGS = {
  id: 'normal_flags',
  bet: 3,
  flags: [
    { id: 'REPLAY',        name: 'リプレイ(DynamoDB)',  denom: 7.3,  payout: 3, rare: false },
    // スコアアタック化(2026-08-13)でコイン持ちを改善するため 1/6 → 1/5 へ。
    // 50回転しかないので「通常時にジリ貧で終わる回」を減らすのが狙い。
    { id: 'BELL',          name: 'ベル(EC2)',           denom: 5.0,  payout: 8, rare: false },
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
    { id: 'WEAK_CHERRY',   name: '弱チェリー(IAM)',     denom: 50,   payout: 2, rare: true },
    { id: 'STRONG_CHERRY', name: '強チェリー(IAM金)',   denom: 250,  payout: 2, rare: true },
    { id: 'MELON',         name: 'スイカ(S3)',          denom: 100,  payout: 5, rare: true },
    { id: 'CHANCE',        name: 'チャンス目(Lambda)',  denom: 180,  payout: 2, rare: true },
    { id: 'SHARK',         name: 'サメ揃い(BAR)',       denom: 1200, payout: 3, rare: true },
    { id: 'GHOST',         name: 'ゴースト揃い(幽霊7)', denom: 6000, payout: 0, rare: true },
    { id: 'LOSE',          name: 'ハズレ',              denom: null, payout: 0, rare: false },
  ],
};

/**
 * ボーナス中の小役構成テーブル(3BET)。DESIGN.md 3.7
 *
 * 仕様変更(2026-08-13 ユーザー決定): ボーナスは「固定純増n枚/G」をやめ、
 * 実機と同じ「ボーナス中はベルが高確率で揃い、揃うたびに15枚」で増える方式にした。
 *
 * 設計方針:
 *  - BELL は約1/1.2(= 5ゲームに4回強)。払出は 15枚(通常時の8枚は据え置き)
 *  - レア役は通常時と同じ確率で残す。Lambda REG 中のAT期待度示唆や
 *    ボーナス中のレア役演出(6.5)が死なないようにするため
 *  - REPLAY は出目のアクセントとして少量(1/20)だけ残す(払出3枚 = BET と同じで純増0)
 *  - 残りはハズレ。ベルがこぼれる瞬間があることで「揃った」の気持ち良さが立つ
 *
 * 【期待払出の検算】
 *   15×(1/1.2) + 3×(1/20) + 2×(1/50) + 2×(1/250) + 5×(1/100)
 *   + 2×(1/180) + 3×(1/1200) + 0×(1/6000) ≒ 12.76枚/G
 *   → 純増 ≒ 12.76 − 3 = 9.76枚/G
 *   → S3 BIG (15G) ≒ 146枚 / Lambda REG (6G) ≒ 59枚 / DynamoDB BIG ≒ 146枚/セット
 *   旧仕様(BIG 50G×純増3枚=150枚 / REG 30G×純増2枚=60枚)とほぼ同じ獲得量を、
 *   1/3〜1/5 の消化ゲーム数で一気に持ってくる形になる。
 *
 * ※ 累積で引くため BELL を先頭に置いている(drawFlag は上から順に加算する)。
 */
export const BONUS_FLAGS = {
  id: 'bonus_flags',
  bet: 3,
  flags: [
    { id: 'BELL',          name: 'ベル(EC2)',           denom: 1.2,  payout: 15, rare: false },
    { id: 'REPLAY',        name: 'リプレイ(DynamoDB)',  denom: 20,   payout: 3,  rare: false },
    { id: 'WEAK_CHERRY',   name: '弱チェリー(IAM)',     denom: 50,   payout: 2,  rare: true },
    { id: 'STRONG_CHERRY', name: '強チェリー(IAM金)',   denom: 250,  payout: 2,  rare: true },
    { id: 'MELON',         name: 'スイカ(S3)',          denom: 100,  payout: 5,  rare: true },
    { id: 'CHANCE',        name: 'チャンス目(Lambda)',  denom: 180,  payout: 2,  rare: true },
    { id: 'SHARK',         name: 'サメ揃い(BAR)',       denom: 1200, payout: 3,  rare: true },
    { id: 'GHOST',         name: 'ゴースト揃い(幽霊7)', denom: 6000, payout: 0,  rare: true },
    { id: 'LOSE',          name: 'ハズレ',              denom: null, payout: 0,  rare: false },
  ],
};

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

/** フラグID -> 定義 の逆引き(名前・レア判定は通常時テーブルを正とする) */
export const FLAG_BY_ID = Object.fromEntries(NORMAL_FLAGS.flags.map((f) => [f.id, f]));

/** レア役かどうか */
export function isRare(flagId) {
  return Boolean(FLAG_BY_ID[flagId]?.rare);
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
