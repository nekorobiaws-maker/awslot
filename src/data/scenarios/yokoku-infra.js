/**
 * インフラ・エッジ・宇宙ロマン系AWSサービスの予告演出集(担当:桃山るな追加分)。
 * DESIGN.md 6.5 / IDEAS.md 2章
 *
 * まだ演出に登場していなかったAWSサービスを、既存の演出語彙
 * (lcdanims / lcdanims-extra / particles / sfx-presets / char)だけで組み立てる。
 * 新規アニメ・新規SFXプリセットの実装は一切なし。
 *
 * 対象サービス: Braket / Snowファミリー(Snowcone→Snowball→
 * Snowmobile) / IoT Core / Control Tower / Budgets / Batch / Elastic Beanstalk /
 * Greengrass / RoboMaker / Outposts / Lightsail / EKS / App Runner。
 * ※ Ground Station(人工衛星)は U46a(2026-08-15)で削除済み。下の A. のコメント参照。
 *
 * ■ 語彙の使い回し方針
 *   既存アニメは「見た目は同じだが params(label/sub/text)で意味を変える」形で
 *   使い回している。これは既存コードベース自体が health_check の label 差し替えや
 *   reserved_sign の label 差し替え、deploy_progress / cw_meter_swing の汎用ゲージ化で
 *   既にやっている流儀と同じ(1つのアニメが複数サービスの演出を兼務する)。
 *     - health_check(label可変)      … IoT Core / Greengrass のオンライン確認
 *     - reserved_sign(label可変)     … Outposts の設置契約サイン
 *     - cw_meter_swing(label/sub可変) … Braket の量子ビット確率ゲージ
 *     - deploy_progress               … Elastic Beanstalk / App Runner の自動デプロイ
 *     - step_up(3灯)                  … IoT Core のセンサー数 / Snowファミリーの3段階
 *     - pillar_raise / checklist_green … Batch のジョブ進行 / EKS の Pod起立 /
 *                                        Control Tower のコントロール通過
 *       (index は1始まり。index:1→1本目。0始まりで渡すと1本ズレるので注意)
 *     - az_failover / ttl_zero / recover_burst … テキスト焼き込みのない純粋な光の演出
 *
 * ■ 期待度の作り方(yokoku-light.js に合わせる)
 *   - 「弱」は flag に LOSE/BELL/REPLAY 等を含め、chance(≈0.28〜0.35)で発火自体を
 *     薄く間引く(=ハズレでもたまに出るガセ寄り演出)。
 *   - 「中」は rare:true か強レア役限定の flag 配列にし、chance を持たせない
 *     (=出た時点でそれなりに期待していい)。これが「強演出はガセ薄め」に対応する
 *     ペア構成(weak=薄いガセ / mid=レア役限定の本物寄り)。
 *   - すべて mode:['FREE_TIER'] + weight:{FREE_TIER:N, default:0} を基本とし、
 *     RUSH中限定は yi_braket_rush_collapse の1本だけ
 *     (mode: RUSH_MODES + weight: rushWeight(N))。
 *     ※U46a(2026-08-15)で yi_groundstation_rush_downlink を削除したため2本→1本。
 *     ※2026-08-14 修正: U11 で RUSH が4種になったので `AS_RUSH` 直書きをやめ、
 *       data/rushes.js の RUSH_IDS から生成する形にした(RUSH追加に自動追従)。
 *     cw_meter_swing は lcdanims-extra.js のコメントにある
 *     RUSH安全座標(cx:118/cy:224/r:40)をそのまま使っている。
 *   - ゲーム抽選RNGは一切使わない(chance は director.js の演出専用RNG)。
 *   - 「BONUS」を含む文言・「確定/突入/継続」等の当選確定を匂わせる語は使わない
 *     (すべて予告であって当選保証ではないため)。
 *
 * index.js への登録はこのファイルの担当外(依頼者側で実施)。
 */

import { RUSH_IDS, rushWeight } from '../rushes.js';

/** RUSH 全種(when.mode 用)。data/rushes.js が正 */
const RUSH_MODES = RUSH_IDS;

export default [
  /* ── A.【削除済み】AWS Ground Station(人工衛星との交信)────────────
   *
   * 2026-08-15 ユーザー指示 U46a「アンテナ・衛星ネタはやめる」により
   *   yi_groundstation_weak / yi_groundstation_mid / yi_groundstation_rush_downlink
   * の3本を削除した(data/quiz.js の satellite 問題も同時に削除)。
   *
   * 【発火量への影響】director は候補の中から weight で1本を選ぶ(重みの取り合い)ので、
   * 候補を減らしたぶんの重みは **同じプールの残りへ自動で按分** される。
   *   弱プール    … 削除した55は残り候補へ配分。chance も同水準(0.28〜0.35)なので総量は据え置き
   *   中(rare)   … 48ぶんが他の rare 予告へ回るだけ
   *   RUSH中プール … rushWeight(90)ぶんが他のRUSH予告へ回るだけ
   * したがって「予告が出る頻度」は変わらず、**衛星ネタが出なくなる**だけになる。
   * 復活させたくなったら git 履歴(このコミットの1つ前)から戻せる。
   */

  // ── B. Amazon Braket(量子コンピュータ・観測で当否が確定する) ──
  {
    id: 'yi_braket_weak',
    name: '【弱】Braket予告(重ね合わせのまま終わる)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.30,
    duration: 1300,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.4, over: false, label: 'QUBIT P(1)', sub: '重ね合わせ中' } },
      { at: 500, layer: 'lcd', action: 'text', params: { text: '未観測', sub: 'まだ確定していない', color: '#8ad4ff', ms: 700 } },
    ],
  },
  {
    id: 'yi_braket_mid',
    name: '【中】Braket予告(観測で収束)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 48, default: 0 },
    duration: 2300,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 40,  layer: 'lcd',  action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.6, over: false, label: 'QUBIT P(1)', sub: '確率が揺れている' } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.9, over: true, label: 'QUBIT P(1)', sub: '収束間近', ms: 1600 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 100, layer: 'overlay', action: 'flash', params: { color: '#c8b0ff', ms: 220 } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: '観測完了', sub: '状態が収束した', color: '#ffe066', ms: 1300 } },
    ],
  },
  {
    id: 'yi_braket_rush_collapse',
    name: 'RUSH中: Braket量子ビット収束(上乗せ濃厚)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE', 'SHARK'], mode: RUSH_MODES },
    weight: rushWeight(85),
    duration: 2800,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,   layer: 'lcd', action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.55, over: false, label: 'QUBIT P(1)', sub: '重ね合わせ中' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'alarm_beep' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.95, over: true, label: 'QUBIT P(1)', sub: '観測: 収束', ms: 2000 } },
      { waitFor: 'stop3', after: 700, layer: 'overlay', action: 'flash', params: { color: '#c8b0ff', ms: 240 } },
      { waitFor: 'stop3', after: 900, layer: 'lcd', action: 'text',
        params: { text: 'COLLAPSED', sub: '波動関数が収束した', color: '#ffe066', ms: 1200 } },
    ],
  },

  // ── C. Snowファミリー(Snowcone→Snowball→Snowmobileの3段階) ──
  {
    id: 'yi_snowfamily_weak',
    name: '【弱】Snowファミリー予告(Snowballどまり)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.32,
    duration: 1300,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'step_up', step: 2 } },
      { at: 500, layer: 'lcd', action: 'text',  params: { text: 'SNOWBALL 到着', sub: 'まだ増えるかも…', color: '#8ad4ff', ms: 700 } },
    ],
  },
  {
    id: 'yi_snowfamily_mid',
    name: '【中】Snowファミリー予告(Snowmobileが来た)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 60,  layer: 'lcd',  action: 'anim',  params: { anim: 'step_up', step: 3 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 220 } },
      { waitFor: 'stop3', after: 60, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 20 } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'SNOWMOBILE 到着', sub: 'トラックごと運んできた', color: '#ffe066', ms: 1300 } },
    ],
  },

  // ── D. AWS IoT Core(センサーが次々オンラインになる) ──────────
  {
    id: 'yi_iotcore_weak',
    name: '【弱】IoT Core予告(1台だけオンライン)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'step_up', step: 1 } },
      { at: 400, layer: 'lcd', action: 'text', params: { text: 'DEVICE ONLINE ×1', color: '#8ad4ff', ms: 600 } },
    ],
  },
  {
    id: 'yi_iotcore_mid',
    name: '【中】IoT Core予告(全センサー接続完了)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 60,  layer: 'lcd',  action: 'anim',  params: { anim: 'step_up', step: 3 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'health_check', ok: true, label: 'FLEET ONLINE' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 200, layer: 'lcd', action: 'text',
        params: { text: 'FLEET READY', sub: '全センサーが接続完了', color: '#ffe066', ms: 1300 } },
    ],
  },

  // ── E. AWS Control Tower(コントロール全通過) ────────────────
  // 2023年に「ガードレール」は「コントロール」へ改称された
  {
    id: 'yi_controltower_weak',
    name: '【弱】Control Tower予告(コントロール1/3)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.32,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'checklist_ok', gain: 0.6 } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'checklist_green', index: 1 } },
      { at: 400, layer: 'lcd', action: 'text', params: { text: 'CONTROL 1/3', color: '#8ad4ff', ms: 600 } },
    ],
  },
  {
    id: 'yi_controltower_mid',
    name: '【中】Control Tower予告(全コントロール通過)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE', 'SHARK'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    duration: 3400,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'checklist_ok' } },
      { at: 40,  layer: 'lcd',  action: 'anim',  params: { anim: 'checklist_green', index: 1 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'checklist_green', index: 2 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'checklist_green', index: 3 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'all_regions_light' } },
      { waitFor: 'stop3', after: 1700, layer: 'lcd', action: 'text',
        params: { text: 'LANDING ZONE OK', sub: '全コントロール通過', color: '#ffe066', ms: 1300 } },
    ],
  },

  // ── F. AWS Budgets(今月の運勢、超過見込み) ──────────────────
  {
    id: 'yi_budgets_weak',
    name: '【弱】Budgets予告(支出がゆるやかに増加)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1000,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'cw_graph_rise', step: 2 } },
      { at: 400, layer: 'lcd', action: 'text', params: { text: '支出 微増', color: '#8ad4ff', ms: 600 } },
    ],
  },
  {
    id: 'yi_budgets_mid',
    name: '【中】Budgets予告(予算超過アラート)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'char', action: 'pose',   params: { char: 'kiro', pose: 'panic' } },
      { at: 40,  layer: 'lcd',  action: 'anim',   params: { anim: 'cw_graph_rise', step: 3 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'cw_graph_rise', step: 4 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'cw_graph_rise', step: 5 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'alarm_beep' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'ttl_zero' } },
      { waitFor: 'stop3', after: 150, layer: 'overlay', action: 'flash', params: { color: '#ff8a00', ms: 220 } },
      { waitFor: 'stop3', after: 200, layer: 'lcd', action: 'text',
        params: { text: '予算超過見込み', sub: '今月の運勢、オーバーラン', color: '#ffd166', ms: 1300 } },
    ],
  },

  // ── G. AWS Batch(深夜バッチが静かに走る) ────────────────────
  {
    id: 'yi_batch_weak',
    name: '【弱】Batch予告(1件だけ静かに完了)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.30,
    duration: 1000,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'pillar_raise', index: 1, count: 5 } },
      { at: 350, layer: 'lcd', action: 'text', params: { text: 'JOB #1 完了', color: '#8ad4ff', ms: 600 } },
    ],
  },
  {
    id: 'yi_batch_mid',
    name: '【中】Batch予告(深夜ジョブが一気に完了)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 48, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 1, count: 5 } },
      { at: 120, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 2, count: 5 } },
      { at: 240, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 3, count: 5 } },
      { at: 360, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 4, count: 5 } },
      { at: 480, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 5, count: 5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'burst_recover', amount: 42 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'BATCH 完了', sub: '42件を静かに処理した', color: '#ffe066', ms: 1300 } },
    ],
  },

  // ── H. AWS Elastic Beanstalk(プラットフォーム自動デプロイ) ───
  {
    id: 'yi_beanstalk_weak',
    name: '【弱】Elastic Beanstalk予告(デプロイ道半ば)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.32,
    duration: 1000,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 0,   layer: 'lcd', action: 'anim', params: { anim: 'deploy_progress', from: 0, to: 0.4 } },
      { at: 400, layer: 'lcd', action: 'text', params: { text: 'DEPLOYING…', color: '#8ad4ff', ms: 600 } },
    ],
  },
  {
    id: 'yi_beanstalk_mid',
    name: '【中】Elastic Beanstalk予告(自動デプロイ完了)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 48, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'deploy_progress', from: 0, to: 1, ms: 1800 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', layer: 'overlay', action: 'particles', params: { preset: 'spark', x: 360, y: 300, count: 16 } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'BEANSTALK', sub: '環境を自動構築→公開', color: '#ffe066', ms: 1400 } },
    ],
  },

  // ── I. AWS IoT Greengrass(切断されてもエッジ推論は止まらない) ─
  {
    id: 'yi_greengrass_mid',
    name: 'Greengrass予告(クラウド切断中もエッジ推論は止まらない)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'graviton_hum', gain: 0.6 } },
      { at: 60,  layer: 'lcd',  action: 'anim', params: { anim: 'health_check', ok: true, label: 'EDGE ONLINE' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'text',
        params: { text: 'GREENGRASS', sub: 'クラウドが切れてもエッジは止まらない', color: '#8fe6f5', ms: 1300 } },
    ],
  },

  // ── J. AWS RoboMaker(ロボットのシミュレーションが成功) ───────
  {
    id: 'yi_robomaker_mid',
    name: 'RoboMaker予告(シミュレーション実行中)',
    // 旧実装は sfn_task に ok:true を渡して「SUCCEEDED」と断言していた。
    // レバーON時点では当落が未確定なので、結論は出さず実行中表示に留める
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 48, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 60,  layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'surprised' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'sfn_task', result: 'running' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'sfn_choice' } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'ROBOMAKER', sub: 'シミュレーションを実行中', color: '#ffe066', ms: 1400 } },
    ],
  },

  // ── K. AWS Outposts(オンプレへの設置契約) ───────────────────
  {
    id: 'yi_outposts_mid',
    name: 'Outposts予告(設置契約書にサイン)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'contract_sign' } },
      { at: 100, layer: 'lcd',  action: 'anim', params: { anim: 'reserved_sign', label: 'OUTPOSTS' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'text',
        params: { text: 'OUTPOSTS 設置契約', sub: 'ラックがそちらへ向かいます', color: '#c8b0ff', ms: 1400 } },
    ],
  },

  // ── L. Amazon Lightsail(ワンクリックでお手軽に起動) ──────────
  {
    id: 'yi_lightsail_weak',
    name: '【弱】Lightsail予告(お手軽インスタンス起動)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    chance: 0.28,
    duration: 900,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 0,   layer: 'lcd', action: 'particles', params: { preset: 'spark', x: 220, y: 150, count: 8 } },
      { at: 300, layer: 'lcd', action: 'text', params: { text: 'LIGHTSAIL', sub: 'ワンクリックで起動', color: '#8ad4ff', ms: 600 } },
    ],
  },

  // ── M. Amazon EKS(Podがオーケストラのように一斉に立ち上がる) ─
  {
    id: 'yi_eks_mid',
    name: 'EKS予告(Podが一斉に立ち上がる)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE', 'SHARK'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'dynamo_scale' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 1, count: 6 } },
      { at: 140, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 2, count: 6 } },
      { at: 240, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 3, count: 6 } },
      { at: 340, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 4, count: 6 } },
      { at: 440, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 5, count: 6 } },
      { at: 540, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 6, count: 6 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', layer: 'overlay', action: 'particles', params: { preset: 'scale', x: 360, y: 380, count: 18 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'text',
        params: { text: 'EKS', sub: 'Podが一斉に立ち上がった', color: '#7bf7d0', ms: 1300 } },
    ],
  },

  // ── N. AWS App Runner(pushしただけで公開まで自動) ────────────
  {
    id: 'yi_apprunner_mid',
    name: 'App Runner予告(pushから自動公開)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'deploy_progress', from: 0, to: 1, ms: 1600 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', layer: 'overlay', action: 'particles', params: { preset: 'spark', x: 360, y: 300, count: 16 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'text',
        params: { text: 'APP RUNNER', sub: 'pushしただけで公開完了', color: '#ffe066', ms: 1400 } },
    ],
  },
];
