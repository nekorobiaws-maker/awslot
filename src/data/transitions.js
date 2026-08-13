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
    { from: 'FREE_TIER',        on: 'at_direct',     to: 'AS_RUSH',             kind: 'replace', implemented: true },
    { from: 'FREE_TIER',        on: 'ceiling_999',   to: 'CZ_WELL_ARCHITECTED', kind: 'replace', implemented: true },
    { from: 'CZ_*',             on: 'success',       to: 'BONUS_READY',         kind: 'replace', implemented: true },
    { from: 'CZ_*',             on: 'fail',          to: 'FREE_TIER',           kind: 'replace', implemented: true },
    // 入賞待ち: ボーナス図柄(BIG=GHOST7 / REG=SHARKBAR)が中段に揃った瞬間に消化開始
    { from: 'BONUS_READY',      on: 'symbol_hit',    to: 'BONUS_*',             kind: 'replace', implemented: true },
    { from: 'BONUS_LAMBDA_REG', on: 'end_at_win',    to: 'AS_RUSH',             kind: 'replace', implemented: true },
    { from: 'BONUS_LAMBDA_REG', on: 'end_at_lose',   to: 'FREE_TIER',           kind: 'replace', implemented: true },
    { from: 'BONUS_S3_BIG',     on: 'end',           to: 'AS_RUSH',             kind: 'replace', implemented: true },
    { from: 'BONUS_DYNAMO_BIG', on: 'set_continue',  to: 'BONUS_DYNAMO_BIG',    kind: 'stay',    implemented: true },
    { from: 'BONUS_DYNAMO_BIG', on: 'end',           to: 'AS_RUSH',             kind: 'replace', implemented: true },
    { from: 'AS_RUSH',          on: 'derived_win',   to: 'ZONE_*',              kind: 'push',    implemented: true },
    { from: 'AS_RUSH',          on: 'streak_5',      to: 'SERVERLESS_RUSH',     kind: 'replace', implemented: true },
    { from: 'AS_RUSH',          on: 'shark_upgrade', to: 'SERVERLESS_RUSH',     kind: 'replace', implemented: true },
    { from: 'AS_RUSH',          on: 'healthcheck_fail_dc0', to: 'HOT_STANDBY',  kind: 'replace', implemented: true },
    { from: 'ZONE_*',           on: 'end',           to: 'RETURN_TO_PARENT',    kind: 'pop',     implemented: true },
    { from: 'ZONE_*',           on: 'nested_win',    to: 'ZONE_ADDSET_*',       kind: 'push',    implemented: true },
    { from: 'STEP_FUNCTIONS',   on: 'all_clear',     to: 'MULTI_REGION',        kind: 'popThenTo', implemented: true },
    { from: 'SERVERLESS_RUSH',  on: 'ghost',         to: 'MULTI_REGION',        kind: 'replace', implemented: true },
    { from: 'SERVERLESS_RUSH',  on: 'set_fail',      to: 'HOT_STANDBY',         kind: 'replace', implemented: true },
    { from: 'MULTI_REGION',     on: 'set_fail',      to: 'HOT_STANDBY',         kind: 'replace', implemented: true },
    { from: 'HOT_STANDBY',      on: 'success',       to: 'RESUME_PREVIOUS_AT',  kind: 'replace', implemented: true },
    { from: 'HOT_STANDBY',      on: 'fail',          to: 'ROUTE53_FAILOVER',    kind: 'replace', implemented: true },
    { from: 'ROUTE53_FAILOVER', on: 'success',       to: 'RESUME_PREVIOUS_AT',  kind: 'replace', implemented: true },
    { from: 'ROUTE53_FAILOVER', on: 'fail',          to: 'FREE_TIER',           kind: 'replace', implemented: true },
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
export const AT_IDS = ['AS_RUSH', 'SERVERLESS_RUSH', 'MULTI_REGION'];
