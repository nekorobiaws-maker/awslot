/**
 * モード移行表(DESIGN.md 3.14)。
 * Phase 5 で全ての行が実装済みになった。
 *
 * `kind` は実装上の遷移種別:
 *   replace … 現在モードを差し替える
 *   push    … 現在モードの上に積む(終了で親へ復帰)
 *   pop     … 自分を畳んで親へ戻る
 *   force   … スタックを全部畳んでから移る(エンディング)
 */

export const MODE_TRANSITIONS = {
  id: 'mode_transitions',
  transitions: [
    { from: 'FREE_TIER',        on: 'cz_win',        to: 'CZ_*',                kind: 'replace', implemented: true },
    { from: 'FREE_TIER',        on: 'bonus_direct',  to: 'BONUS_READY',         kind: 'replace', implemented: true },
    { from: 'FREE_TIER',        on: 'at_direct',     to: 'RUSH_*',              kind: 'replace', implemented: true },
    { from: 'FREE_TIER',        on: 'ceiling_999',   to: 'CZ_WELL_ARCHITECTED', kind: 'replace', implemented: true },
    { from: 'CZ_*',             on: 'success',       to: 'BONUS_READY',         kind: 'replace', implemented: true },
    { from: 'CZ_*',             on: 'fail',          to: 'FREE_TIER',           kind: 'replace', implemented: true },
    // 入賞待ち: ボーナス図柄(BIG=GHOST7 / REG=SHARKBAR)が中段に揃った瞬間に消化開始
    { from: 'BONUS_READY',      on: 'symbol_hit',    to: 'BONUS_*',             kind: 'replace', implemented: true },
    // U11/U22: RUSH当選はボーナス中のレア役契機。種別(RUSH_*)は消化後に振り分ける
    { from: 'BONUS_LAMBDA_REG', on: 'end_rush_win',  to: 'RUSH_*',              kind: 'replace', implemented: true },
    { from: 'BONUS_*',          on: 'end_rush_lose', to: 'FREE_TIER',           kind: 'replace', implemented: true },
    { from: 'BONUS_S3_BIG',     on: 'end_rush_win',  to: 'RUSH_*',              kind: 'replace', implemented: true },
    { from: 'BONUS_DYNAMO_BIG', on: 'set_continue',  to: 'BONUS_DYNAMO_BIG',    kind: 'stay',    implemented: true },
    { from: 'BONUS_DYNAMO_BIG', on: 'end_rush_win',  to: 'RUSH_*',              kind: 'replace', implemented: true },
    { from: 'AS_RUSH',          on: 'derived_win',   to: 'ZONE_*',              kind: 'push',    implemented: true },
    // U11: セット継続が無くなったので 'streak_5'(5セット連続)は退役
    { from: 'AS_RUSH',          on: 'shark_upgrade', to: 'SERVERLESS_RUSH',     kind: 'replace', implemented: true },
    { from: 'RUSH_*',           on: 'games_out',     to: 'HOT_STANDBY',         kind: 'replace', implemented: true },
    { from: 'ZONE_*',           on: 'end',           to: 'RETURN_TO_PARENT',    kind: 'pop',     implemented: true },
    { from: 'ZONE_*',           on: 'nested_win',    to: 'ZONE_ADDSET_*',       kind: 'push',    implemented: true },
    { from: 'STEP_FUNCTIONS',   on: 'all_clear',     to: 'MULTI_REGION',        kind: 'popThenTo', implemented: true },
    { from: 'SERVERLESS_RUSH',  on: 'ghost',         to: 'MULTI_REGION',        kind: 'replace', implemented: true },
    { from: 'SERVERLESS_RUSH',  on: 'set_fail',      to: 'HOT_STANDBY',         kind: 'replace', implemented: true },
    { from: 'MULTI_REGION',     on: 'set_fail',      to: 'HOT_STANDBY',         kind: 'replace', implemented: true },
    // U32(2026-08-14): 引き戻し成功の復帰先は「元のAT」ではなく **ボーナス**。
    // 種別は data/rushes.js の RECOVERY_BONUS(ゴーストボーナス)で、
    // 入口ゲートにより BONUS_READY(ゴースト7を揃える)を必ず経由する。
    { from: 'HOT_STANDBY',      on: 'success',       to: 'BONUS_READY',         kind: 'replace', implemented: true },
    // 2026-08-13: 引き戻しは1段に統合。失敗はそのまま通常時へ転落する
    { from: 'HOT_STANDBY',      on: 'fail',          to: 'FREE_TIER',           kind: 'replace', implemented: true },
    // 【退役】ROUTE53_FAILOVER は通常プレイから到達しない(直撃デバッグ用にハンドラのみ残置)
    { from: '*',                on: 'ending_cond',   to: 'REINVENT_ED',         kind: 'force',   implemented: true },
    { from: 'REINVENT_ED',      on: 'end',           to: 'FREE_TIER',           kind: 'replace', implemented: true },
  ],
};

/** 派生ゾーン(親の上に積まれるモード)のID一覧 */
export const ZONE_IDS = [
  'SPOT_ZONE', 'EC2_BURST', 'GRAVITON', 'RESERVED',
  'CLOUDFRONT', 'KINESIS', 'STEP_FUNCTIONS',
];

/** ATモード(母体・上位)のID一覧 */
export const AT_IDS = [
  // U11: RUSH 4種(data/rushes.js)
  'AS_RUSH', 'CF_RUSH', 'AURORA_RUSH', 'HERO_RUSH',
  'SERVERLESS_RUSH', 'MULTI_REGION',
];
