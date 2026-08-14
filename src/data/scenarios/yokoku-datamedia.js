/**
 * データ基盤・メディア・エンタメ系AWSサービスの予告演出集(担当: 桃山るな 演出量産第3弾)。
 * DESIGN.md 6.5 / IDEAS.md 2章。ID はすべて ym_ プレフィックス。
 *
 * まだ演出に登場していないAWSサービスを、既存の演出語彙
 * (lcdanims / lcdanims-extra / particles / sfx-presets / char)だけで組み立てる。
 * 新規アニメ・新規SFXプリセットの実装は一切なし。
 *
 * 対象サービス: MSK(Kafka) / Amazon MQ / AppFlow / Lake Formation / Neptune /
 * Timestream / DocumentDB / MemoryDB / GameLift / IVS / MediaConvert /
 * Elemental MediaLive / Kendra / Lex / Amazon Connect。
 * (ElastiCache はクイズの出題選択肢のみで演出未登場だったが今回は対象外。
 *  Polly は yokoku-ai.js で既出のため対象外)
 *
 * ■ 語彙の使い回し方針(既存コードベースの流儀を踏襲)
 *   「見た目は同じだが params(label/sub/text)で意味を変える」形で使い回す。
 *     - health_check(label可変) … Amazon MQ のブリッジ接続 / MediaLive の入力ロス復旧 /
 *       Connect のオペレーター接続、いずれも「一度保留してから繋がる」系の絵に流用。
 *     - step_up(3灯)            … Neptune の関係グラフが繋がっていく段階表示。
 *       Detective(yokoku-secnet.js)は「調査→ストリーム粒子→カットイン」の絵だが、
 *       Neptune はランプ演出のみで済ませて画を分けている(要件の「絵が被らない工夫」)。
 *     - checklist_green(index)  … Lake Formation の権限が一括付与されていく。
 *     - deploy_progress(from/to/ms のみ、result は一切渡さない) … MediaConvert の
 *       トランスコードジョブ進捗。結論(成功/失敗)は当落確定イベントの専用シナリオでしか
 *       出してはいけないため、このファイルでは常に「進行中」表示止まりにしてある。
 *     - kinesis_color_stream(caption:false) … RUSH中の IVS 同時視聴が伸びる絵に流用。
 *     - lcd_flash                … MemoryDB の「一瞬で永続化完了」瞬間芸のフラッシュ。
 *
 * ■ 期待度の作り方(yokoku-secnet.js / yokoku-infra.js に合わせる)
 *   - 「弱」= flag に LOSE/BELL/REPLAY 等を含め chance(≈0.28〜0.35)で発火自体を
 *     薄く間引く。結末は明確に否定的(該当なし/変化なし/繋がらず等)にするため、
 *     すべて match:{ 'modeState.zenchoActive': [false] } を付けて前兆中と衝突しない
 *     ようにしてある(前兆中に「該当なし」と出ると直後の当選告知と矛盾するため)。
 *   - 「中」= when.rare:true のみで chance を持たせない(レア役成立時だけ出現。
 *     出た時点でそれなりに期待していい「本物寄り」)。
 *   - すべて mode:['FREE_TIER'] + weight:{FREE_TIER:N, default:0} を基本とし、
 *     RUSH中限定は ym_neptune_rush_fullmesh / ym_ivs_rush_viral の2本だけ
 *     (mode: RUSH_MODES + weight: rushWeight(N))。
 *     ※2026-08-14 修正: U11 で RUSH が4種になったので `AS_RUSH` 直書きをやめ、
 *       data/rushes.js の RUSH_IDS から生成する形にした(RUSH追加に自動追従)。
 *   - ゲーム抽選RNGは一切使わない(chance は director.js の演出専用RNG)。
 *   - 「BONUS」を含む文言・STICKY_KEYWORDS(確定/突入/RUSH/昇格/継続/CONTINUE)は
 *     すべて予告であって当選保証ではないため一切使わない。
 *
 * index.js への登録はこのファイルの担当外(依頼者側で実施)。
 */

import { RUSH_IDS, rushWeight } from '../rushes.js';

/** RUSH 全種(when.mode 用)。data/rushes.js が正 */
const RUSH_MODES = RUSH_IDS;

export default [
  // ── A. MSK(Amazon Managed Streaming for Apache Kafka) ────────────
  // コンシューマラグが溜まる→一気に消化しきる、で期待度を作る。
  {
    id: 'ym_msk_lag_weak',
    name: '【弱】MSKコンシューマラグ予告(遅延したまま終わる)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.32,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'LAG 128,000', sub: 'コンシューマが追いつけていない', color: '#8ad4ff', ms: 650 } },
      { at: 20,  layer: 'sfx', action: 'synth', params: { preset: 'stream_flow', gain: 0.4 } },
      { at: 650, layer: 'lcd', action: 'text',  params: { text: 'LAG変化なし', sub: '滞留したまま', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'ym_msk_catchup_mid',
    name: '【中】MSKコンシューマラグ予告(一気に消化)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 48, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'text',    params: { text: 'LAG 128,000', sub: 'コンシューマが追いつけていない', color: '#ffe066', ms: 600 } },
      { at: 30,  layer: 'sfx',  action: 'synth',   params: { preset: 'stream_flow' } },
      { at: 700, layer: 'sfx',  action: 'synth',   params: { preset: 'credit_recover' } },
      { at: 720, layer: 'lcd',  action: 'particles', params: { preset: 'stream', x: 200, y: 200, count: 14 } },
      { at: 900, layer: 'sfx',  action: 'synth',   params: { preset: 'upgrade_chime' } },
      { at: 950, layer: 'lcd',  action: 'text',    params: { text: 'LAG消化完了', sub: '一気に追いついた', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── B. Amazon MQ 新旧資産ブリッジ予告 ─────────────────────────────
  {
    id: 'ym_amazonmq_bridge_weak',
    name: '【弱】Amazon MQブリッジ予告(接続保留のまま)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.30,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'health_check', ok: false, label: 'CONNECTING' } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { at: 700, layer: 'lcd', action: 'text',  params: { text: '接続保留', sub: '旧資産からの橋渡し待ち', color: '#8ad4ff', ms: 600 } },
    ],
  },
  {
    id: 'ym_amazonmq_bridge_mid',
    name: '【中】Amazon MQブリッジ予告(新旧資産が接続)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'lcd',  action: 'anim',    params: { anim: 'health_check', ok: false, label: 'CONNECTING' } },
      { at: 40,   layer: 'sfx',  action: 'synth',   params: { preset: 'countdown_tick' } },
      { at: 800,  layer: 'lcd',  action: 'anim',    params: { anim: 'health_check', ok: true, label: 'BROKER UP' } },
      { at: 840,  layer: 'sfx',  action: 'synth',   params: { preset: 'checklist_ok' } },
      { at: 1200, layer: 'lcd',  action: 'text',    params: { text: 'ブリッジ確立', sub: '新旧の資産がつながった', color: '#ffe066', ms: 900 } },
    ],
  },

  // ── C. AppFlow SaaS間データ連携予告 ───────────────────────────────
  {
    id: 'ym_appflow_sync_weak',
    name: '【弱】AppFlow同期予告(同期されないまま)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 60, default: 0 },
    chance: 0.35,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'SYNCING…', sub: 'SaaSからS3へ連携中', color: '#8ad4ff', ms: 600 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 630, layer: 'lcd', action: 'text',  params: { text: 'SYNC 0件', sub: '今回は動きなし', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'ym_appflow_sync_mid',
    name: '【中】AppFlow同期予告(大量データが同期)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 42, default: 0 },
    duration: 1800,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'text',    params: { text: 'SYNCING…', sub: 'SaaSからS3へ連携中', color: '#ffe066', ms: 600 } },
      { at: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'charge_up' } },
      { at: 750, layer: 'lcd',  action: 'particles', params: { preset: 'stream', x: 200, y: 200, count: 14 } },
      { at: 780, layer: 'sfx',  action: 'synth',   params: { preset: 'upgrade_chime' } },
      { at: 900, layer: 'lcd',  action: 'text',    params: { text: 'SYNC 48,000件', sub: '大量データが同期完了', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── D. Lake Formation 権限一括付与予告 ────────────────────────────
  {
    id: 'ym_lakeformation_grant_weak',
    name: '【弱】Lake Formation権限予告(未整備のまま)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.32,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'checklist_green', index: 1 } },
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { at: 600, layer: 'lcd', action: 'text',  params: { text: '権限未整備', sub: 'このデータレイクはまだ', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'ym_lakeformation_grant_mid',
    name: '【中】Lake Formation権限予告(全テーブルへ一括付与)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth',   params: { preset: 'contract_sign' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'checklist_green', index: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'checklist_green', index: 2 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'checklist_green', index: 3 } },
      { waitFor: 'stop3', after: 120, layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 180, layer: 'lcd', action: 'text',
        params: { text: '権限一括付与', sub: '全テーブルに行き渡った', color: '#ffe066', ms: 1100 } },
    ],
  },

  // ── E. Neptune 関係グラフ予告(Detectiveとは絵を分ける) ────────────
  // ランプの3灯だけで「繋がっていく」を見せ、粒子・カットインは使わない。
  {
    id: 'ym_neptune_relation_weak',
    name: '【弱】Neptune関係グラフ予告(共通点なしで終わる)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 58, default: 0 },
    chance: 0.33,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'step_up', step: 1 } },
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 600, layer: 'lcd', action: 'text',  params: { text: 'RELATION 1件', sub: '共通点は見つからず', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'ym_neptune_relation_mid',
    name: '【中】Neptune関係グラフ予告(全ノードが1つに繋がる)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth',   params: { preset: 'charge_up' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 2 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 3, ms: 1400 } },
      { waitFor: 'stop3', after: 160, layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 220, layer: 'lcd', action: 'text',
        params: { text: 'GRAPH CONNECTED', sub: '全ノードが1つに繋がった', color: '#ffe066', ms: 1200 } },
    ],
  },
  {
    id: 'ym_neptune_rush_fullmesh',
    name: 'RUSH中: Neptuneフルメッシュ化(上乗せ濃厚)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE', 'SHARK'], mode: RUSH_MODES },
    weight: rushWeight(90),
    duration: 2600,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
      { at: 0, layer: 'lcd', action: 'anim',  params: { anim: 'step_up', step: 1 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 2 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 3, ms: 1300 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'freeze_hit' } },
      { waitFor: 'stop3', after: 100, layer: 'overlay', action: 'flash', params: { color: '#7cf3ff', ms: 220 } },
      { waitFor: 'stop3', after: 160, layer: 'lcd', action: 'text',
        params: { text: 'FULL MESH', sub: '全リソースが繋がりきった', color: '#7cf3ff', ms: 1200 } },
    ],
  },

  // ── F. Timestream 時系列波形予告 ──────────────────────────────────
  {
    id: 'ym_timestream_wave_weak',
    name: '【弱】Timestream波形予告(横ばいで終わる)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 42, default: 0 },
    chance: 0.30,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: '128 pt', sub: '時系列データを収集中', color: '#8ad4ff', ms: 600 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { at: 630, layer: 'lcd', action: 'text',  params: { text: '130 pt', sub: '横ばいのまま', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'ym_timestream_wave_mid',
    name: '【中】Timestream波形予告(波形が跳ねる)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 44, default: 0 },
    duration: 1800,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'text',    params: { text: '128 pt', sub: '時系列データを収集中', color: '#ffe066', ms: 600 } },
      { at: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'charge_up' } },
      { at: 750, layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 200, y: 200, count: 14 } },
      { at: 780, layer: 'sfx',  action: 'synth',   params: { preset: 'upgrade_chime' } },
      { at: 900, layer: 'lcd',  action: 'text',    params: { text: '3,200 pt', sub: '波形が大きく跳ねた', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── G. DocumentDB 文書検索予告 ────────────────────────────────────
  {
    id: 'ym_documentdb_query_weak',
    name: '【弱】DocumentDB検索予告(該当なしで終わる)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 52, default: 0 },
    chance: 0.32,
    duration: 1000,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'QUERYING…', sub: 'JSON文書を検索中', color: '#8ad4ff', ms: 600 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { at: 630, layer: 'lcd', action: 'text',  params: { text: '0件ヒット', sub: '該当文書なし', color: '#8ad4ff', ms: 400 } },
    ],
  },
  {
    id: 'ym_documentdb_query_mid',
    name: '【中】DocumentDB検索予告(大量ヒット)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 47, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'text',    params: { text: 'QUERYING…', sub: 'JSON文書を検索中', color: '#ffe066', ms: 600 } },
      { at: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'charge_up' } },
      { at: 700, layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 200, y: 200, count: 14 } },
      { at: 730, layer: 'sfx',  action: 'synth',   params: { preset: 'upgrade_chime' } },
      { at: 850, layer: 'lcd',  action: 'text',    params: { text: '42,195件ヒット', sub: '大量に一致した', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── H. MemoryDB 書き込み予告(瞬間芸) ─────────────────────────────
  {
    id: 'ym_memorydb_write_weak',
    name: '【弱】MemoryDB書き込み予告(保留のまま終わる)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 38, default: 0 },
    chance: 0.28,
    duration: 800,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'WRITE PENDING', sub: '永続化を待っている', color: '#8ad4ff', ms: 500 } },
      { at: 20,  layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 520, layer: 'lcd', action: 'text',  params: { text: '書き込み保留', sub: '今回はここまで', color: '#8ad4ff', ms: 400 } },
    ],
  },
  {
    id: 'ym_memorydb_write_mid',
    name: '【中】MemoryDB書き込み予告(一瞬で永続化完了)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 40, default: 0 },
    duration: 900,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth',   params: { preset: 'contract_sign' } },
      { at: 0,   layer: 'lcd',  action: 'anim',    params: { anim: 'lcd_flash', color: '#ffe066', strength: 0.6 } },
      { at: 60,  layer: 'sfx',  action: 'synth',   params: { preset: 'checklist_ok' } },
      { at: 120, layer: 'lcd',  action: 'text',
        params: { text: 'PERSISTED', sub: 'Redis互換メモリに書込完了', color: '#ffe066', ms: 700 } },
    ],
  },

  // ── I. GameLift マッチメイキング予告 ──────────────────────────────
  {
    id: 'ym_gamelift_match_weak',
    name: '【弱】GameLiftマッチング予告(相手見つからず)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 44, default: 0 },
    chance: 0.30,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'MATCHING…', sub: '対戦相手を探索中', color: '#8ad4ff', ms: 600 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { at: 630, layer: 'lcd', action: 'text',  params: { text: 'MATCH TIMEOUT', sub: '相手が見つからず', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'ym_gamelift_match_mid',
    name: '【中】GameLiftマッチング予告(手強い相手が見つかる)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 46, default: 0 },
    duration: 1800,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'text',    params: { text: 'MATCHING…', sub: '対戦相手を探索中', color: '#ffe066', ms: 600 } },
      { at: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'rare_flag' } },
      { at: 750, layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 200, y: 200, count: 14 } },
      { at: 780, layer: 'sfx',  action: 'synth',   params: { preset: 'cutin_whoosh', gain: 0.6 } },
      { at: 900, layer: 'lcd',  action: 'text',    params: { text: 'MATCH FOUND', sub: '相手: 手強い影の軍団', color: '#ffe066', ms: 1100 } },
    ],
  },

  // ── J. IVS ライブ配信視聴者数予告 ─────────────────────────────────
  {
    id: 'ym_ivs_viewer_weak',
    name: '【弱】IVS視聴者数予告(変化なしで終わる)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 56, default: 0 },
    chance: 0.34,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: '視聴者 12人', sub: 'ライブ配信中', color: '#8ad4ff', ms: 600 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 630, layer: 'lcd', action: 'text',  params: { text: '視聴者 14人', sub: '伸び悩んでいる', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'ym_ivs_viewer_mid',
    name: '【中】IVS視聴者数予告(配信がバズる)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 53, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',     action: 'text',    params: { text: '視聴者 12人', sub: 'ライブ配信中', color: '#ffe066', ms: 600 } },
      { at: 40,  layer: 'sfx',     action: 'synth',   params: { preset: 'charge_up' } },
      { at: 800, layer: 'overlay', action: 'flash',   params: { color: '#ff5ad0', ms: 200 } },
      { at: 820, layer: 'lcd',     action: 'particles', params: { preset: 'rainbow', x: 200, y: 200, count: 20 } },
      { at: 840, layer: 'sfx',     action: 'synth',   params: { preset: 'upgrade_chime' } },
      { at: 950, layer: 'lcd',     action: 'text',    params: { text: '視聴者 1,800人', sub: '配信がバズった', color: '#ff8a00', ms: 1200 } },
    ],
  },
  {
    id: 'ym_ivs_rush_viral',
    name: 'RUSH中: IVS同時視聴が爆伸び(上乗せ濃厚)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE', 'SHARK'], mode: RUSH_MODES },
    weight: rushWeight(85),
    duration: 2600,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
      { at: 0, layer: 'lcd', action: 'anim',
        params: { anim: 'kinesis_color_stream', level: 1, y: 250, x0: 110, count: 16, caption: false } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'kinesis_color_stream', level: 2, y: 250, x0: 110, count: 24, ms: 1800, caption: false } },
      { waitFor: 'stop3', after: 120, layer: 'overlay', action: 'flash', params: { color: '#ff5ad0', ms: 220 } },
      { waitFor: 'stop3', after: 500, layer: 'lcd', action: 'text',
        params: { text: 'VIEWERS ×50', sub: '同時接続が爆発的に増加', color: '#ff5ad0', ms: 1200 } },
    ],
  },

  // ── K. MediaConvert トランスコードジョブ予告 ──────────────────────
  // 結論(SUCCEEDED等)は一切出さない。進行中バーが伸びるところまでで止める。
  {
    id: 'ym_mediaconvert_job_weak',
    name: '【弱】MediaConvert変換予告(途中で止まる)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 48, default: 0 },
    chance: 0.30,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'deploy_progress', from: 0, to: 0.3 } },
      { at: 20,  layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 700, layer: 'lcd', action: 'text',  params: { text: '変換キャンセル', sub: 'ジョブが止まった', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'ym_mediaconvert_job_mid',
    name: '【中】MediaConvert変換予告(レンダーファーム全開)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 49, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth',   params: { preset: 'charge_up' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'deploy_progress', from: 0, to: 0.4 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'deploy_progress', from: 0.4, to: 0.75 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'deploy_progress', from: 0.75, to: 0.97, ms: 1800 } },
      { waitFor: 'stop3', after: 700, layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 750, layer: 'lcd', action: 'text',
        params: { text: '変換 97%', sub: 'レンダーファーム全開', color: '#ffe066', ms: 1100 } },
    ],
  },

  // ── L. Elemental MediaLive 入力ロス予告 ───────────────────────────
  {
    id: 'ym_medialive_input_weak',
    name: '【弱】MediaLive入力予告(途切れたまま)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 40, default: 0 },
    chance: 0.30,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'health_check', ok: false, label: 'INPUT LOSS' } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'error_buzz', gain: 0.5 } },
      { at: 700, layer: 'lcd', action: 'text',  params: { text: '映像途切れたまま', sub: '今回は復旧せず', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'ym_medialive_input_mid',
    name: '【中】MediaLive入力予告(配信ソースが復旧)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 44, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'lcd',  action: 'anim',    params: { anim: 'health_check', ok: false, label: 'INPUT LOSS' } },
      { at: 40,   layer: 'sfx',  action: 'synth',   params: { preset: 'countdown_tick' } },
      { at: 800,  layer: 'lcd',  action: 'anim',    params: { anim: 'health_check', ok: true, label: 'LIVE' } },
      { at: 840,  layer: 'sfx',  action: 'synth',   params: { preset: 'checklist_ok' } },
      { at: 1200, layer: 'lcd',  action: 'text',    params: { text: '配信ソース復旧', sub: '安定して届いている', color: '#ffe066', ms: 900 } },
    ],
  },

  // ── M. Kendra 意味検索予告 ─────────────────────────────────────────
  {
    id: 'ym_kendra_search_weak',
    name: '【弱】Kendra検索予告(該当ドキュメントなし)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 54, default: 0 },
    chance: 0.32,
    duration: 1000,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'SEARCHING…', sub: '意味検索を実行中', color: '#8ad4ff', ms: 600 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { at: 630, layer: 'lcd', action: 'text',  params: { text: '0件ヒット', sub: '該当ドキュメントなし', color: '#8ad4ff', ms: 400 } },
    ],
  },
  {
    id: 'ym_kendra_search_mid',
    name: '【中】Kendra検索予告(意味深な文書がヒット)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 51, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'text',    params: { text: 'SEARCHING…', sub: '意味検索を実行中', color: '#ffe066', ms: 600 } },
      { at: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'charge_up' } },
      { at: 750, layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 200, y: 200, count: 14 } },
      { at: 780, layer: 'sfx',  action: 'synth',   params: { preset: 'upgrade_chime' } },
      { at: 900, layer: 'lcd',  action: 'text',
        params: { text: 'FINAL_REPORT_v9.pdf', sub: '意味深な文書が一致した', color: '#ffe066', ms: 1300 } },
    ],
  },

  // ── N. Lex チャットボット予告(Bedrock/Amazon Qとは絵を分ける) ─────
  // タイピング演出は使わず、一問一答のインテント認識だけで見せる。
  {
    id: 'ym_lex_intent_weak',
    name: '【弱】Lexチャットボット予告(意図を認識できず)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 46, default: 0 },
    chance: 0.30,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'ご用件は?', sub: 'Botが聞き取り中', color: '#8ad4ff', ms: 600 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'sfn_choice', gain: 0.5 } },
      { at: 700, layer: 'lcd', action: 'text',  params: { text: '聞き取れません', sub: 'もう一度どうぞ', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'ym_lex_intent_mid',
    name: '【中】Lexチャットボット予告(インテントを認識)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 44, default: 0 },
    duration: 1800,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'text',    params: { text: 'ご用件は?', sub: 'Botが聞き取り中', color: '#ffe066', ms: 600 } },
      { at: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'sfn_choice' } },
      { at: 750, layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 200, y: 200, count: 12 } },
      { at: 780, layer: 'sfx',  action: 'synth',   params: { preset: 'upgrade_chime' } },
      { at: 900, layer: 'lcd',  action: 'text',    params: { text: 'インテント認識', sub: '意図をくみ取りました', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── O. Amazon Connect オペレーター接続予告 ────────────────────────
  {
    id: 'ym_connect_hold_weak',
    name: '【弱】Amazon Connect予告(繋がらないまま)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.30,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'ただいま混み合って', sub: 'おつなぎしています', color: '#8ad4ff', ms: 650 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { at: 680, layer: 'lcd', action: 'text',  params: { text: '呼び出し終了', sub: '繋がらなかった', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'ym_connect_hold_mid',
    name: '【中】Amazon Connect予告(オペレーターに接続)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'lcd',  action: 'anim',    params: { anim: 'health_check', ok: false, label: 'ON HOLD' } },
      { at: 40,   layer: 'sfx',  action: 'synth',   params: { preset: 'countdown_tick' } },
      { at: 800,  layer: 'lcd',  action: 'anim',    params: { anim: 'health_check', ok: true, label: 'CONNECTED' } },
      { at: 840,  layer: 'sfx',  action: 'synth',   params: { preset: 'checklist_ok' } },
      { at: 1200, layer: 'lcd',  action: 'text',    params: { text: 'オペレーター接続', sub: 'ついに繋がった', color: '#ffe066', ms: 900 } },
    ],
  },
];
