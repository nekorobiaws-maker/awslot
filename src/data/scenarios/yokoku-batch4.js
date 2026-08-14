/**
 * 予告 第6弾(yb4_)。2026-08-15 ユーザー指示 U52b「予兆ネタをさらに10個追加」。
 *
 * 前回(yokoku-batch3.js)の作法をそのまま踏襲した続編:
 *   弱 … ハズレ寄りの役で出る = そのゲームの当選は 0%(= ガセ)
 *   中 … レア役でしか出ない   = 成立役の当選率がそのまま信頼度
 * 既存の予告(yokoku-*.js)・前兆(data/zencho.js)と **サービスが重複していない**
 * ことを grep で確認済み(Fargate / ECR / EFS / Service Quotas / Data Firehose /
 * DAX / WorkSpaces / Audit Manager / NLB / Organizations の10サービス。
 * いずれもこのファイルが台への初登場)。
 *
 * ══ U5(予告の総量は増やさない)をどう守っているか ═══════════════════
 *
 * director は「候補の中から weight で1本選び、その1本の chance で発火を間引く」ので、
 * **候補を増やしただけでは発火率は上がらない**(取り分が移るだけ)。
 * 上がるのは「chance を持たない候補」を chance 持ちのプールへ足したときだけ。
 *   → 弱(ハズレ寄り)は chance: CHANCE_WEAK。プールの実測発火率と同水準
 *   → 中(レア役限定)は chance なし。レア役プールは元から必ず1本出るので総量は動かない
 * 既存演出の取り分はそのぶん相対的に下がる(= 重みの按分)。
 * 数字を動かしたくなったら CHANCE_WEAK だけを触ればプール全体に効く。
 *
 *   【追加直前の実測(director の _matches をそのまま使った机上計算)】
 *     LOSE / 前兆なし … 候補94本・総重み7,087・発火率 0.375
 *     MELON           … 候補79本・発火率 0.983(レア役はほぼ必ず1本出る)
 *     CHANCE          … 候補99本・発火率 1.000
 *
 * ══ 信頼度の設計(何%でアタリか)═══════════════════════════════════
 *
 * 「そのゲーム単独の当選率」は成立役で決まる。
 * **数値は data/modes.js の CZ_ENTRY.table が唯一の正。ここには絶対に写さない**
 * (2026-08-15 検証指摘: ここに写した表が U48 の 0.5倍化を取りこぼし、
 *  ちょうど2倍ズレた数字のまま「期待度設計の台帳」を名乗っていた)。
 *
 *   | この演出が出る条件      | 期待度                                        |
 *   |------------------------|-----------------------------------------------|
 *   | 【弱】ハズレ/ベル/リプレイ | 0%(CZ_ENTRY に行が無い = そのゲームは当たらない) |
 *   | 【中】弱チェリー〜サメ揃い | CZ_ENTRY.table の cz + bonus + direct_at の和   |
 *   | 【中】ゴースト揃い       | 100%(bonus 1.000 の確定役)                    |
 *
 * 序列だけは固定で、弱チェ < スイカ < チャンス目 < 強チェ < サメ < ゴースト。
 * 実際の画面ではさらに czMultiplier(高確×2 / 激アツ×4)が上に乗るので、
 * **画面でこの手の数字を名乗らせないこと**(名乗った瞬間に嘘になる)。
 *
 * ══ 弱が「0%」を名乗れる条件(2026-08-15 検証指摘で強化)═══════════
 * 通常時に当選が生まれる経路は4つ。WEAK_WHEN で全部塞いである:
 *   1. 成立役契機の抽選     … flag が LOSE/BELL/REPLAY(CZ_ENTRY に行が無い)
 *   2. ステージの毎ゲーム抽選 … subState が COLD_START(czPerGame が 0 の帯)
 *   3. 天井の強制CZ         … NOT_CEILING_GAME
 *   4. レバーONフリーズ      … freeze が false
 * 2 は **成立役に一切依存せず走る**(高確 0.030/G・激アツ 0.119/G)ので、
 * 縛らないと激アツ滞在中は約8回に1回「当選しているゲームでガセを名乗る」ことになる。
 *
 * ══ 文言の3条件(U25)══════════════════════════════════════════════
 *   ① 初見で意味が分かる ② AWSネタが入っている ③ 事実に反しない
 * 数値のねつ造は禁止。ここで名乗っているのは各サービスに実在する概念だけ
 * (Fargate のタスク起動 / ECR のイメージプッシュとスキャン / EFS の同時マウント /
 *  Service Quotas の引き上げリクエスト / Data Firehose のバッファリング配信 /
 *  DAX のキャッシュヒット / WorkSpaces の仮想デスクトップ起動 /
 *  Audit Manager の証拠自動収集 / NLB の大量接続処理 /
 *  Organizations の一括請求とポリシー)。
 *
 * ══ 文字は必ず座布団の上に置く(V31-08 の教訓)═══════════════════════
 * 「明るい背景に文字が直接焼き込まれて読めない」を繰り返さないため、
 * このファイルは **読ませる文字を lcd.text だけで出す**。
 * lcd.text は lcdanims.js の TEXT_TONES が下敷き(plate)を必ず敷くので、
 * ステージ背景・キャラ絵の上でも読める。
 * 使う液晶アニメは **自前で文字を描かないもの** に限定してある:
 *   step_up / checklist_green / pillar_raise / az_failover /
 *   recover_burst / ttl_zero / cw_graph_appear
 * (deploy_progress や health_check のように内部で label を焼き込むアニメは使わない)
 *
 * ══ 色(U9)════════════════════════════════════════════════════════
 * 成立役を1つに絞れる中版は **その役の色**(色が出た = その役が成立した)。
 * 役をまたぐ中版(rare:true)は中色 #ffe066。弱は既存どおり #8ad4ff。
 */

// 天井(Auto Recovery)のゲーム数。NOT_CEILING_GAME の算出に使う(data/modes.js が唯一の正)
import { NORMAL_SUBSTATES } from '../modes.js';

/**
 * ハズレ寄りプールに合わせた発火率。yokoku-batch3.js / yokoku-bedrock.js と同じ値。
 * ここを揃えておけば本数が増えても総量は動かない。
 * 実効値は director の YOKOKU_CHANCE_SCALE が掛かったもの。
 * **係数の値をここに写さないこと**(staging/director.js が唯一の正。
 * U51 で 0.6 → 1.6 に動いたとき、写しの側が丸ごと嘘になった)。
 */
const CHANCE_WEAK = 0.245;

/** 弱の文字色(既存の弱予告と同じ) */
const COLOR_WEAK = '#8ad4ff';
/** 中の文字色(役を1つに絞れないとき) */
const COLOR_MID = '#ffe066';
/** 成立役の色(U9。yokoku-aruaru.js の FLAG_COLOR と同値) */
const COLOR_CHERRY = '#ff4d4d';
const COLOR_MELON = '#4ce0a0';
const COLOR_LAMBDA = '#ffd95e';

/**
 * 天井(Auto Recovery)に当たらないゲームの `modeState.games` 一覧。
 * freetier.js は onGame の先頭で games を +1 してから `games >= ceiling` を見るので、
 * レバーON時点の games が ceiling-1 のゲームが「天井で飛ぶゲーム」。
 * 数え方は data/scenarios/quiz.js の NOT_CEILING_GAME と同じ(あちらが先例)。
 */
const NOT_CEILING_GAME = Array.from(
  { length: Math.max(1, NORMAL_SUBSTATES.ceiling.games - 1) },
  (_, i) => i,
);

/**
 * ハズレ寄りの発火条件。「このゲームは当たらない」を名乗れる帯だけに限定する。
 * 条件の内訳はヘッダの「弱が『0%』を名乗れる条件」を参照。
 * 前兆中も外す(数ゲーム後の当選を保持していることがあるうえ、前兆の演出に画面を譲る)。
 */
const WEAK_WHEN = {
  event: 'leverOn',
  flag: ['LOSE', 'BELL', 'REPLAY'],
  mode: ['FREE_TIER'],
  match: {
    'modeState.zenchoActive': [false],
    'modeState.games': NOT_CEILING_GAME,
    'modeState.subState': ['COLD_START'],
    freeze: [false],
  },
};

export default [
  /* ══ 1. Fargate(サーバーを1台も持たずにタスクが起きる)═══════════════
   * ECS / EKS のタスクは PROVISIONING → PENDING → RUNNING と状態が進む。
   * 「起動しきるか」が当落の比喩。弱は PROVISIONING のまま終わる。
   * 中は「サーバーレスで即起動」なのでチャンス目(Lambda)対応。 */
  {
    id: 'yb4_fargate_weak',
    name: '【弱】Fargate予告(PROVISIONING のまま)',
    when: WEAK_WHEN,
    weight: { FREE_TIER: 58, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'step_up', step: 1 } },
      { at: 440, layer: 'lcd', action: 'text',
        params: { text: 'PROVISIONING', sub: 'タスクはまだ起動しきっていない', color: COLOR_WEAK, ms: 800 } },
    ],
  },
  {
    id: 'yb4_fargate_mid',
    name: '【中】Fargate予告(RUNNING = チャンス目成立)',
    when: { event: 'leverOn', flag: ['CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'serverless_up' } },
      { at: 40,  layer: 'lcd',  action: 'anim',  params: { anim: 'step_up', step: 3 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 80, layer: 'overlay', action: 'flash', params: { color: COLOR_LAMBDA, ms: 200 } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'text',
        params: { text: 'RUNNING', sub: 'Fargate — EC2 を1台も持たずに起動した', color: COLOR_LAMBDA, ms: 1300 } },
    ],
  },

  /* ══ 2. ECR(イメージを push するとスキャンが走る)═════════════════
   * プッシュ時のイメージスキャンは ECR に実在する機能。
   * 弱はレイヤーを送っている途中、中は latest が更新されてスキャンも通る。 */
  {
    id: 'yb4_ecr_weak',
    name: '【弱】ECR予告(レイヤーを送っている途中)',
    when: WEAK_WHEN,
    weight: { FREE_TIER: 56, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.45 } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'checklist_green', index: 1 } },
      { at: 440, layer: 'lcd', action: 'text',
        params: { text: 'PUSHING…', sub: 'イメージのレイヤーを送っている', color: COLOR_WEAK, ms: 800 } },
    ],
  },
  {
    id: 'yb4_ecr_mid',
    name: '【中】ECR予告(latest が更新されスキャンも通過)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 48, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'checklist_green', index: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'checklist_green', index: 2 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', layer: 'overlay', action: 'particles', params: { preset: 'spark', x: 360, y: 300, count: 12 } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'text',
        params: { text: 'latest が更新された', sub: 'ECR にイメージが上がり、スキャンも通過', color: COLOR_MID, ms: 1300 } },
    ],
  },

  /* ══ 3. EFS(全台が同じディレクトリを同時に見る)═══════════════════
   * EFS は複数のインスタンス/タスクから同時マウントできる NFS 共有で、
   * 容量はファイルを置いた分だけ自動で伸びる。
   * 「みんなで同じものを共有する」= ためる話なのでスイカ(S3)対応。 */
  {
    id: 'yb4_efs_weak',
    name: '【弱】EFS予告(まだ1台もマウントできていない)',
    when: WEAK_WHEN,
    weight: { FREE_TIER: 55, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.45 } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'pillar_raise', index: 1, count: 4 } },
      { at: 440, layer: 'lcd', action: 'text',
        params: { text: 'マウント待ち', sub: '共有ストレージにまだ誰も繋がっていない', color: COLOR_WEAK, ms: 800 } },
    ],
  },
  {
    id: 'yb4_efs_mid',
    name: '【中】EFS予告(全台が同じ場所を見た = スイカ成立)',
    when: { event: 'leverOn', flag: ['MELON'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'pillar_up' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 1, count: 4 } },
      { at: 240, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 2, count: 4 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'pillar_raise', index: 3, count: 4 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'pillar_raise', index: 4, count: 4 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'text',
        params: { text: '全台が同じ場所を見た', sub: 'EFS を同時マウント — 容量は自動で伸びる', color: COLOR_MELON, ms: 1300 } },
    ],
  },

  /* ══ 4. Service Quotas(上限そのものを引き上げる)═══════════════════
   * クォータの引き上げリクエストは Service Quotas に実在する手続き。
   * 「天井が上がる」= 上乗せの比喩として一番きれいに刺さるネタ。 */
  {
    id: 'yb4_quotas_weak',
    name: '【弱】Service Quotas予告(申請は審査中)',
    when: WEAK_WHEN,
    weight: { FREE_TIER: 57, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'step_up', step: 1 } },
      { at: 440, layer: 'lcd', action: 'text',
        params: { text: '引き上げ申請は審査中', sub: 'クォータはまだ据え置き', color: COLOR_WEAK, ms: 800 } },
    ],
  },
  {
    id: 'yb4_quotas_mid',
    name: '【中】Service Quotas予告(上限が引き上げられた)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 48, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'contract_sign', gain: 0.65 } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'step_up', step: 2 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 3 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'recover_burst' } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'text',
        params: { text: '上限が引き上げられた', sub: 'Service Quotas — 天井そのものが上がった', color: COLOR_MID, ms: 1300 } },
    ],
  },

  /* ══ 5. Data Firehose(バッファが溜まると配信される)═════════════════
   * Firehose はバッファサイズかバッファ間隔のどちらかに達した時点で
   * 配信先(S3 など)へ書き出す。「まだ届かない / 届いた」がそのまま弱と中になる。
   * 着地先が S3 なのでスイカ対応。 */
  {
    id: 'yb4_firehose_weak',
    name: '【弱】Data Firehose予告(バッファに溜め中)',
    when: WEAK_WHEN,
    weight: { FREE_TIER: 56, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'stream_flow', gain: 0.4 } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'cw_graph_appear' } },
      { at: 440, layer: 'lcd', action: 'text',
        params: { text: 'バッファに溜め中', sub: 'まだ配信の条件に届いていない', color: COLOR_WEAK, ms: 800 } },
    ],
  },
  {
    id: 'yb4_firehose_mid',
    name: '【中】Data Firehose予告(S3 へ着地 = スイカ成立)',
    when: { event: 'leverOn', flag: ['MELON'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 48, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'stream_flow' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'az_failover' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'edge_hit' } },
      { waitFor: 'stop3', after: 60, layer: 'lcd', action: 'anim', params: { anim: 'recover_burst' } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'text',
        params: { text: 'S3 へ着地した', sub: 'バッファがフラッシュされて配信された', color: COLOR_MELON, ms: 1300 } },
    ],
  },

  /* ══ 6. DAX(DynamoDB のマイクロ秒キャッシュ)═══════════════════════
   * DAX は DynamoDB 用のインメモリキャッシュで、ヒットすればミリ秒がマイクロ秒になる。
   * 弱はキャッシュミス(テーブルまで取りに行く)。 */
  {
    id: 'yb4_dax_weak',
    name: '【弱】DAX予告(キャッシュミス)',
    when: WEAK_WHEN,
    weight: { FREE_TIER: 55, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.45 } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'cw_graph_appear' } },
      { at: 420, layer: 'lcd', action: 'text',
        params: { text: 'キャッシュミス', sub: 'テーブルまで取りに行っている', color: COLOR_WEAK, ms: 800 } },
    ],
  },
  {
    id: 'yb4_dax_mid',
    name: '【中】DAX予告(キャッシュヒットでマイクロ秒)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 46, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'dynamo_scale' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'ttl_zero' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'text',
        params: { text: 'キャッシュヒット', sub: 'DAX がマイクロ秒で返した', color: COLOR_MID, ms: 1300 } },
    ],
  },

  /* ══ 7. WorkSpaces(仮想デスクトップ)═════════════════════════════
   * 弱だけのネタ。「立ち上がるのを待っている」= まだ何も始まっていない。 */
  {
    id: 'yb4_workspaces_weak',
    name: '【弱】WorkSpaces予告(デスクトップ起動待ち)',
    when: WEAK_WHEN,
    weight: { FREE_TIER: 54, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.4 } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'step_up', step: 1 } },
      { at: 440, layer: 'lcd', action: 'text',
        params: { text: 'デスクトップ起動待ち', sub: 'WorkSpaces がまだ立ち上がらない', color: COLOR_WEAK, ms: 800 } },
    ],
  },

  /* ══ 8. Audit Manager(証拠を自動で集める)═══════════════════════
   * 監査に必要なエビデンスを自動収集してレポートにまとめるサービス。
   * 「証跡・権限」の話なので IAM(チェリー)対応。色もチェリー(U9)。 */
  {
    id: 'yb4_auditmanager_mid',
    name: '【中】Audit Manager予告(証拠がそろった = IAM 成立)',
    when: { event: 'leverOn', flag: ['WEAK_CHERRY', 'STRONG_CHERRY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'checklist_ok' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'checklist_green', index: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'checklist_green', index: 2 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 80, layer: 'overlay', action: 'flash', params: { color: COLOR_CHERRY, ms: 200 } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'text',
        params: { text: '証拠がそろった', sub: 'Audit Manager がエビデンスを自動収集', color: COLOR_CHERRY, ms: 1300 } },
    ],
  },

  /* ══ 9. NLB(L4で一気にさばく)═══════════════════════════════════
   * Network Load Balancer は超低レイテンシで大量の接続をさばく L4 のロードバランサ。
   * 「一気に流れる」画なのでチャンス目(Lambda = 即時)対応。 */
  {
    id: 'yb4_nlb_mid',
    name: '【中】NLB予告(大量の接続を一気にさばく)',
    when: { event: 'leverOn', flag: ['CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 46, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'stream_flow' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'az_failover' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'edge_hit' } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'text',
        params: { text: '一気にさばけた', sub: 'NLB が大量の接続を低遅延で流している', color: COLOR_LAMBDA, ms: 1300 } },
    ],
  },

  /* ══ 10. Organizations(組織にまとめる)═════════════════════════════
   * 複数アカウントを組織に束ね、請求もポリシーも一括にする。
   * 「バラバラだったものが1つにまとまる」= 事態が動く合図。 */
  {
    id: 'yb4_organizations_mid',
    name: '【中】Organizations予告(アカウントが組織にまとまる)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 46, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 1, count: 3 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'pillar_raise', index: 2, count: 3 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'pillar_raise', index: 3, count: 3 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'text',
        params: { text: '組織にまとまった', sub: 'Organizations — 請求もポリシーも一括', color: COLOR_MID, ms: 1300 } },
    ],
  },
];
