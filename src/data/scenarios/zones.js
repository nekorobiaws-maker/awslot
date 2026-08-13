/**
 * 派生ゾーン / 上乗せ特化ゾーンの演出シナリオ(Phase 5)。
 * DESIGN.md 6.5 / IDEAS.md 2-2, 2-18, 2-20, 3-5, 3-13, 5章
 *
 * 各ゾーンに「突入演出」と「そのゾーンらしい特徴演出」を必ず1つずつ用意している。
 * ゲームロジックには一切影響しない(データ追加のみ)。
 */

import { ZONE_SPEC_BY_ID } from '../modes.js';

/*
 * スペック数値は data/modes.js から取り込んでテンプレートで組み立てる(2026-08-13)。
 *
 * 以前は「純増8枚」「1セット10G」のように文言へ直接書いていたため、
 * バランス調整のたびに画面表示だけが旧値のまま取り残されていた
 * (椿のレビューで11件の乖離を検出)。ここで参照にしておけば二度とズレない。
 * data → data の import なので依存方向の問題は無く、
 * モジュール読み込み時に文字列が確定するので実行時コストも増えない。
 */

const SPOT = ZONE_SPEC_BY_ID.SPOT_ZONE;
const BURST = ZONE_SPEC_BY_ID.EC2_BURST;
const GRAV = ZONE_SPEC_BY_ID.GRAVITON;
const RSV = ZONE_SPEC_BY_ID.RESERVED;
const CF = ZONE_SPEC_BY_ID.CLOUDFRONT;

export default [
  // ── M11. Spot インスタンスゾーン ────────────────
  {
    id: 'spot_entry',
    name: 'Spot ゾーン突入(サメが突っ込んでくる)',
    // IDEAS.md 3-13「スポットインスタンス強制終了サバイバル」
    when: { event: 'modeEnter', enterMode: ['SPOT_ZONE'], match: { resumed: [false] } },
    weight: { default: 100 },
    duration: 3600,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash',  params: { color: '#ff8a20', ms: 340 } },
      { at: 0,    layer: 'overlay', action: 'shake',  params: { power: 20, ms: 700 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'sfx',     action: 'synth',  params: { preset: 'spot_entry' } },
      { at: 80,   layer: 'overlay', action: 'cutin',  params: { id: 'spot_entry' } },
      { at: 600,  layer: 'char',    action: 'show',   params: { char: 'george', pose: 'grin' } },
      { at: 600,  layer: 'char',    action: 'motion', params: { char: 'george', motion: 'swimIn' } },
      { at: 800,  layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'panic' } },
      { at: 1400, layer: 'voice',   action: 'play',   params: { key: 'george_spot_start_01' } },
      { at: 1800, layer: 'lcd',     action: 'text',
        params: { text: `純増 ${SPOT.payoutPerGame}枚/G`, sub: `最低${SPOT.minGames}G保証 — 逃げんじゃねえぞスポットインスタンス`, color: '#ffb46a', ms: 2000 } },
      { at: 2000, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_spot' } },
      { at: 2100, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 26 } },
    ],
  },
  {
    id: 'spot_interruption',
    name: 'Spot 中断通知(サメが通知を運んでくる)',
    when: { event: 'paramChange', match: { param: ['spot_notice'] } },
    weight: { default: 100 },
    duration: 2600,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'spot_notice' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ff3b30', ms: 300 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 16, ms: 600 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,   layer: 'lcd',     action: 'anim',  params: { anim: 'spot_notice', left: '$value' } },
      { at: 120,  layer: 'char',    action: 'show',  params: { char: 'george', pose: 'angry' } },
      { at: 120,  layer: 'char',    action: 'motion', params: { char: 'george', motion: 'bite' } },
      { at: 200,  layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 700,  layer: 'voice',   action: 'play',  params: { key: 'george_spot_end_01' } },
      // 残りG数は「通知時点の残り」= paramChange.value。
      // ZONE_SPEC_BY_ID.SPOT_ZONE.minGames の最低保証があるので、早い段階で通知が出ると
      // 猶予(graceGames)ではなく保証の残りG数が入ることがある(液晶の T-n と揃える)。
      // 旧コメントは「最低15G保証」と書いてあったが実装値と乖離していた(椿レビュー)
      { at: 1600, layer: 'lcd',     action: 'text',
        params: { text: '${value} GAMES LEFT', sub: '中断通知。悪く思うな', color: '#ff6b6b', ms: 1400 } },
    ],
  },
  {
    id: 'spot_reclaim',
    name: 'Spot 強制終了(インスタンス回収)',
    when: { event: 'modeExit', match: { id: ['SPOT_ZONE'] } },
    weight: { default: 100 },
    duration: 1800,
    cues: [
      { at: 0,   layer: 'sfx',   action: 'synth', params: { preset: 'spot_end' } },
      { at: 0,   layer: 'lcd',   action: 'anim',  params: { anim: 'lcd_flash', color: '#ff5a5a', strength: 0.5 } },
      { at: 0,   layer: 'char',  action: 'motion', params: { char: 'george', motion: 'swimOut' } },
      { at: 300, layer: 'lcd',   action: 'text',
        params: { text: 'RECLAIMED', sub: 'インスタンスは回収されました', color: '#ff9a9a', ms: 1200 } },
    ],
  },

  // ── M12. EC2 バーストモード ─────────────────────
  {
    id: 'burst_entry',
    name: 'EC2 バースト突入(CPUクレジット100)',
    when: { event: 'modeEnter', enterMode: ['EC2_BURST'], match: { resumed: [false] } },
    weight: { default: 100 },
    duration: 3000,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffc04a', ms: 320 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 14, ms: 520 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'burst_start' } },
      { at: 100,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 100,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'zoom' } },
      { at: 400,  layer: 'lcd',     action: 'text',
        params: { text: `CPU CREDIT ${BURST.creditInit}`, sub: `使い切るまで純増${BURST.payoutPerGame}枚`, color: '#ffe066', ms: 2000 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'kiro_burst_01' } },
      { at: 1200, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_burst' } },
      { at: 1400, layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 220, y: 108, count: 20 } },
    ],
  },
  {
    id: 'burst_recover',
    name: 'バースト中のクレジット回復(レア役)',
    when: { event: 'paramChange', match: { param: ['burst_credit'] } },
    weight: { default: 100 },
    duration: 1500,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'credit_recover' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#7bf7d0', ms: 200 } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'burst_recover', amount: '$delta' } },
      { at: 40,  layer: 'lcd',     action: 'particles', params: { preset: 'scale', x: 220, y: 150, count: 18 } },
      { at: 60,  layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 700, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },
  {
    id: 'burst_low_warning',
    name: 'バースト中のクレジット残少警告',
    when: { event: 'leverOn', mode: ['EC2_BURST'] },
    weight: { EC2_BURST: 100, default: 0 },
    // 毎ゲームは出さない。ヒヤッとする頻度に間引く
    chance: 0.22,
    duration: 1400,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'credit_low' } },
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'anim',
        params: { anim: 'lcd_flash', color: '#ff8a00', strength: 0.35 } },
    ],
  },

  // ── M13. Graviton モード ────────────────────────
  {
    id: 'graviton_entry',
    name: 'Graviton 突入(ARM は静かに強い)',
    when: { event: 'modeEnter', enterMode: ['GRAVITON'], match: { resumed: [false] } },
    weight: { default: 100 },
    duration: 3000,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#8fe6f5', ms: 280 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rush' } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'graviton_hum' } },
      { at: 100,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'normal' } },
      { at: 400,  layer: 'lcd',     action: 'text',
        params: { text: 'GRAVITON', sub: `低純増・高継続 — 1セット${GRAV.setGames}G / 継続${Math.round(GRAV.continueRate * 100)}%`, color: '#8fe6f5', ms: 2000 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'kiro_graviton_01' } },
      { at: 1200, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_graviton' } },
    ],
  },
  {
    id: 'graviton_continue',
    name: 'Graviton セット継続(省電力のまま延命)',
    when: { event: 'setEnd', match: { zone: ['GRAVITON'], continued: true } },
    weight: { default: 200 },
    duration: 1800,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'graviton_hum' } },
      { at: 0,   layer: 'lcd',  action: 'anim',  params: { anim: 'health_check', ok: true, label: 'EFFICIENT' } },
      { at: 600, layer: 'lamp', action: 'pattern', params: { pattern: 'rush' } },
      { at: 700, layer: 'lcd',  action: 'particles', params: { preset: 'stream', x: 220, y: 200, count: 14 } },
    ],
  },

  // ── M14. Reserved Instance ゾーン ────────────────
  {
    id: 'reserved_entry',
    name: 'Reserved 契約(契約書にサイン)',
    when: { event: 'modeEnter', enterMode: ['RESERVED'], match: { resumed: [false] } },
    weight: { default: 100 },
    duration: 3400,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#c8b0ff', ms: 300 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'contract_sign' } },
      { at: 200,  layer: 'lcd',     action: 'anim',  params: { anim: 'reserved_sign', label: '$state.contractLabel' } },
      { at: 300,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 1200, layer: 'lcd',     action: 'text',
        params: { text: 'RESERVED', sub: '契約中はヘルスチェック免除', color: '#c8b0ff', ms: 1800 } },
      { at: 1400, layer: 'voice',   action: 'play',  params: { key: 'kiro_reserved_01' } },
    ],
  },
  {
    id: 'reserved_3year',
    name: 'Reserved 3年契約(激アツ)',
    when: {
      event: 'modeEnter', enterMode: ['RESERVED'],
      match: { resumed: [false], 'state.contract': ['3year'] },
    },
    weight: { default: 400 },
    duration: 3600,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 380 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 18, ms: 640 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 100,  layer: 'lcd',     action: 'anim',  params: { anim: 'reserved_sign', label: '3年契約' } },
      { at: 300,  layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 300,  layer: 'char',    action: 'motion', params: { char: 'george', motion: 'tailWhip' } },
      { at: 1000, layer: 'lcd',     action: 'text',
        params: { text: `3 YEAR / ${RSV.guaranteeGames['3year']}G 保証`, sub: '契約中はヘルスチェックで終わらない', color: '#ffe066', ms: 2200 } },
      { at: 1200, layer: 'overlay', action: 'particles', params: { preset: 'rainbow', x: 360, y: 380, count: 34 } },
      { at: 1400, layer: 'voice',   action: 'play',  params: { key: 'george_reserved_3y_01' } },
    ],
  },

  // ── M15. CloudFront エッジ上乗せ ─────────────────
  {
    id: 'cloudfront_entry',
    name: 'CloudFront 上乗せ突入(エッジ配信開始)',
    // IDEAS.md 2-18「CloudFront『Cache HIT』文字予告」
    when: { event: 'modeEnter', enterMode: ['CLOUDFRONT'], match: { resumed: [false] } },
    weight: { default: 100 },
    duration: 2800,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#7ba0ff', ms: 300 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rush' } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'edge_hit' } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 400,  layer: 'lcd',     action: 'text',
        params: { text: 'EDGE BOOST', sub: `${CF.games}ゲームだけの上乗せ祭り`, color: '#bcd4ff', ms: 1900 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'kiro_cloudfront_01' } },
    ],
  },
  {
    id: 'cloudfront_addset',
    name: 'CloudFront エッジからセット数が飛んでくる',
    when: { event: 'paramChange', match: { source: ['CLOUDFRONT'] } },
    weight: { default: 100 },
    duration: 1200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'edge_hit' } },
      { at: 0,   layer: 'lcd', action: 'anim',
        params: { anim: 'cf_edge_fly', add: '$delta', edge: '$edge', index: '$value' } },
      { at: 120, layer: 'lcd', action: 'particles', params: { preset: 'scale', x: 220, y: 124, count: 14 } },
      { at: 150, layer: 'overlay', action: 'flash', params: { color: '#bcd4ff', ms: 140 } },
    ],
  },

  // ── M16. Kinesis 上乗せストリーム ────────────────
  {
    id: 'kinesis_entry',
    name: 'Kinesis 突入(シャード数決定)',
    // IDEAS.md 2-20「Kinesisストリーム流れ予告」
    when: { event: 'modeEnter', enterMode: ['KINESIS'], match: { resumed: [false] } },
    weight: { default: 100 },
    duration: 3000,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#6ee0f5', ms: 300 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 10, ms: 400 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rush' } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'stream_flow' } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 400,  layer: 'lcd',     action: 'text',
        params: { text: 'SHARDS', sub: 'シャードの数だけ上乗せが流れる', color: '#6ee0f5', ms: 1900 } },
      { at: 800,  layer: 'lcd',     action: 'particles', params: { preset: 'stream', x: 220, y: 220, count: 24 } },
      { at: 1000, layer: 'voice',   action: 'play',  params: { key: 'kiro_kinesis_01' } },
    ],
  },
  {
    id: 'kinesis_record',
    name: 'Kinesis 上乗せレコードが流れる',
    when: { event: 'paramChange', match: { source: ['KINESIS'] } },
    weight: { default: 100 },
    duration: 1100,
    cues: [
      { at: 0,  layer: 'sfx', action: 'synth', params: { preset: 'stream_flow' } },
      { at: 0,  layer: 'lcd', action: 'anim',  params: { anim: 'kinesis_record', add: '$delta', shard: '$shard' } },
      { at: 80, layer: 'lcd', action: 'particles', params: { preset: 'stream', x: 380, y: 150, count: 10 } },
    ],
  },

  // ── M17. Step Functions チャレンジ ───────────────
  {
    id: 'sfn_entry',
    name: 'Step Functions 突入(ステートマシン起動)',
    // IDEAS.md 2-17「Step Functionsステップアップ予告」
    when: { event: 'modeEnter', enterMode: ['STEP_FUNCTIONS'], match: { resumed: [false] } },
    weight: { default: 100 },
    duration: 3200,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#9a9aff', ms: 320 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 14, ms: 520 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'sfn_choice' } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 500,  layer: 'lcd',     action: 'text',
        params: { text: 'STATE MACHINE', sub: '分岐を選んで Success State へ', color: '#c0c0ff', ms: 2100 } },
      { at: 1000, layer: 'voice',   action: 'play',  params: { key: 'kiro_sfn_01' } },
      { at: 1200, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_sfn' } },
    ],
  },
  {
    id: 'sfn_choice',
    name: 'Step Functions 分岐選択(プレイヤー操作)',
    when: { event: 'paramChange', match: { param: ['choice'] } },
    weight: { default: 100 },
    duration: 900,
    cues: [
      { at: 0,  layer: 'sfx',     action: 'synth', params: { preset: 'sfn_choice' } },
      { at: 0,  layer: 'overlay', action: 'flash', params: { color: '#c0c0ff', ms: 150 } },
      { at: 0,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
    ],
  },
  {
    id: 'sfn_task_ok',
    name: 'Step Functions タスク成功(+1セット)',
    when: { event: 'paramChange', match: { source: ['STEP_FUNCTIONS'] } },
    weight: { default: 100 },
    duration: 1300,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'sfn_ok' } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'sfn_task', result: 'success' } },
      { at: 60,  layer: 'lcd', action: 'particles', params: { preset: 'scale', x: 220, y: 62, count: 14 } },
      { at: 80,  layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'happy' } },
      { at: 900, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'normal' } },
    ],
  },
  {
    id: 'sfn_fail',
    name: 'Step Functions 失敗(Fail State に落ちる)',
    when: { event: 'setEnd', match: { zone: ['STEP_FUNCTIONS'], continued: false } },
    weight: { default: 100 },
    duration: 1600,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'sfn_ng' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 240 } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'sfn_task', result: 'fail' } },
      { at: 100, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 400, layer: 'lcd',     action: 'text',
        params: { text: 'FAIL STATE', sub: 'ワークフロー終了', color: '#ff8a8a', ms: 1100 } },
    ],
  },
  {
    id: 'sfn_clear',
    name: 'Step Functions 全制覇 → Multi-Region',
    when: { event: 'setEnd', match: { result: ['SFN_CLEAR'] } },
    weight: { default: 1000 },
    duration: 3200,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 400 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 22, ms: 800 } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 100,  layer: 'lcd',     action: 'anim',  params: { anim: 'sfn_task', result: 'success' } },
      { at: 300,  layer: 'lcd',     action: 'text',
        params: { text: 'Multi-Region へ昇格', sub: '全ステート制覇!!', color: '#7bf7d0', ms: 2200 } },
      { at: 400,  layer: 'overlay', action: 'particles', params: { preset: 'rainbow', x: 360, y: 400, count: 40 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'george_sfn_clear_01' } },
    ],
  },

  // ── 共通: ゾーンから親ATへ復帰 ───────────────────
  {
    id: 'zone_return',
    name: 'ゾーン終了 → 母体ATへ復帰',
    when: { event: 'modeEnter', match: { resumed: [true] } },
    weight: { default: 100 },
    duration: 1400,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'zone_return' } },
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rush' } },
      { at: 0,   layer: 'lcd',  action: 'anim',  params: { anim: 'lcd_flash', color: '#7bf7d0', strength: 0.4 } },
      { at: 150, layer: 'lcd',  action: 'text',
        params: { text: 'RESUME', sub: '母体のRUSHへ戻ります', color: '#7bf7d0', ms: 1000 } },
    ],
  },
];
