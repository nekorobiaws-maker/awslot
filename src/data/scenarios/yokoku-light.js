/**
 * 通常時の弱〜中予告シナリオ集(担当B)。DESIGN.md 6.5 / IDEAS.md 2章
 *
 * 既存の演出語彙(lcdanims / cutins / particles / sfx-presets / キャラポーズ)の
 * 組み合わせだけで構成する。新規アニメ実装は一切不要。
 *
 * 期待度の作り方:
 *   - 「弱」は when.flag に LOSE/BELL/REPLAY 等を含め、chance で発火自体を薄く間引く
 *     (=ハズレでもたまに出る「ガセ寄り」演出)。
 *   - 「中」は when.rare / when.flag の STRONG_CHERRY・CHANCE を条件にし、
 *     chance を持たせない(=レア役成立時のみ出現、出た時点で少し期待していい)。
 *   - 同じテーマの弱/中を対にして、演出強度・色・SFXの有無で段階を作る
 *     (弱=控えめな単発SFX/淡い色、中=lamp.rare+複数キュー/金〜緑の強調色)。
 *   - when.expectationRange は ctx.expectation が leverOn 系イベントでは一度も
 *     populate されない(director.js の payload/snapshot いずれにも存在しない)ため
 *     採用しなかった。使うと「中」判定が常に不一致になり無音で死ぬ危険があるので、
 *     既存シナリオ(normal.js)と同じ flag/rare + weight + chance の組み合わせに統一した。
 *   - すべて mode:['FREE_TIER'] に限定し、weight は { FREE_TIER: N, default: 0 } の
 *     形で明示(directorのフォールバック weight:10 に巻き込まれないようにするため)。
 */

export default [
  // ── A. Auto Scaling 増殖予告(IDEAS 2-2) ──────────────────────────
  {
    id: 'yl_autoscale_tease_weak',
    name: '【弱】Auto Scaling予告(x2どまり)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 60, default: 0 },
    chance: 0.40,  // 統合調律(2026-08-13): 非レア時の演出発火率30%に合わせて 0.05 → 0.40
    duration: 1200,
    cues: [
      { at: 0,   layer: 'lcd', action: 'particles', params: { preset: 'scale', x: 200, y: 200, count: 8 } },
      { at: 50,  layer: 'sfx', action: 'synth', params: { preset: 'scale_out', gain: 0.6 } },
      { at: 400, layer: 'lcd', action: 'text', params: { text: 'x2', sub: 'インスタンスが少し増えた', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'yl_autoscale_tease_mid',
    name: '【中】Auto Scaling予告(x4まで倍増)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'particles', params: { preset: 'scale', x: 200, y: 200, count: 16 } },
      { at: 60,  layer: 'sfx',  action: 'synth', params: { preset: 'scale_out' } },
      { waitFor: 'stop2', layer: 'lcd', action: 'particles', params: { preset: 'scale', x: 200, y: 200, count: 22 } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text', params: { text: 'x4', sub: 'インスタンスが倍々に増えている', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── B. ECS コンテナ増殖予告(IDEAS 2-22、パーティクルで代用) ──────
  {
    id: 'yl_ecs_task_tease_weak',
    name: '【弱】ECSタスク起動予告(1個だけ)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.35,  // 統合調律(2026-08-13): 非レア時の演出発火率30%に合わせて 0.04 → 0.35
    duration: 1100,
    cues: [
      { at: 0,   layer: 'lcd', action: 'particles', params: { preset: 'scale', x: 260, y: 220, count: 6 } },
      { at: 50,  layer: 'sfx', action: 'synth', params: { preset: 'dynamo_scale', gain: 0.5 } },
      { at: 350, layer: 'lcd', action: 'text', params: { text: 'TASK x1', sub: 'コンテナが1個起動', color: '#8ad4ff', ms: 700 } },
    ],
  },
  {
    id: 'yl_ecs_task_tease_mid',
    name: '【中】ECSタスク起動予告(一気に増殖)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 1600,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'particles', params: { preset: 'scale', x: 260, y: 220, count: 18 } },
      { at: 60,  layer: 'sfx',  action: 'synth', params: { preset: 'dynamo_scale' } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'text', params: { text: 'TASK x5', sub: 'コンテナが一気に増殖中', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── C. ALBヘルスチェック予告(IDEAS 2-8) ───────────────────────
  {
    id: 'yl_healthcheck_tease_weak',
    name: '【弱】ALBヘルスチェック予告(チェック中どまり)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 60, default: 0 },
    chance: 0.40,  // 統合調律(2026-08-13): 非レア時の演出発火率30%に合わせて 0.05 → 0.40
    duration: 1200,
    cues: [
      { at: 0,  layer: 'lcd', action: 'anim',  params: { anim: 'health_check', ok: false, label: 'CHECKING' } },
      { at: 40, layer: 'sfx', action: 'synth', params: { preset: 'health_check', gain: 0.6 } },
    ],
  },
  {
    id: 'yl_healthcheck_tease_mid',
    name: '【中】ALBヘルスチェック予告(全部緑)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'anim',  params: { anim: 'health_check', ok: true, label: 'HEALTHY' } },
      { at: 60,  layer: 'sfx',  action: 'synth', params: { preset: 'health_check' } },
      { waitFor: 'stop3', after: 150, layer: 'overlay', action: 'flash', params: { color: '#4ce0a0', ms: 180 } },
    ],
  },

  // ── D. Route53フェイルオーバー予告(IDEAS 2-9、"中"のみの案) ─────
  {
    id: 'yl_route53_failover_tease',
    name: '【中】Route53フェイルオーバー予告',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 1800,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'route53_spin' } },
      { at: 60,  layer: 'lcd', action: 'anim',  params: { anim: 'az_failover' } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text', params: { text: 'FAILOVER', sub: '予備リージョンへ切替中…', color: '#7cf3ff', ms: 1100 } },
    ],
  },

  // ── E. EventBridge稲妻予告(IDEAS 2-16、flash+SFXで代用) ─────────
  {
    id: 'yl_eventbridge_tease_weak',
    name: '【弱】EventBridge稲妻予告(一瞬光るだけ)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.30,  // 統合調律(2026-08-13): 非レア時の演出発火率30%に合わせて 0.03 → 0.30
    duration: 800,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'charge_up', gain: 0.5 } },
      { at: 120, layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 140 } },
    ],
  },
  {
    id: 'yl_eventbridge_tease_mid',
    name: '【中】EventBridge稲妻予告(火花付き)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1300,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 100, layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 180, layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 220 } },
      { at: 180, layer: 'overlay', action: 'particles', params: { preset: 'spark', x: 360, y: 200, count: 14 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'text', params: { text: 'EVENT FIRED', sub: 'EventBridgeが発火した', color: '#ffe066', ms: 900 } },
    ],
  },

  // ── F. CloudFront Cache HIT文字予告(IDEAS 2-18) ─────────────────
  {
    id: 'yl_cloudfront_cachehit_weak',
    name: '【弱】CloudFront Cache HIT予告(拠点名なし)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,  // 統合調律(2026-08-13): 非レア時の演出発火率30%に合わせて 0.04 → 0.35
    duration: 900,
    cues: [
      { at: 0, layer: 'lcd', action: 'text',  params: { text: 'Cache HIT', color: '#8ad4ff', ms: 700 } },
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'edge_hit', gain: 0.5 } },
    ],
  },
  {
    id: 'yl_cloudfront_cachehit_mid',
    name: '【中】CloudFront Cache HIT予告(拠点名まで表示)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 1500,
    cues: [
      { at: 0,  layer: 'lcd', action: 'anim',  params: { anim: 'cf_edge_fly', add: 1, edge: 'left' } },
      { at: 40, layer: 'sfx', action: 'synth', params: { preset: 'edge_hit' } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'text', params: { text: 'Cache HIT', sub: 'edge: NRT51-C1', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── G. RDSスナップショット通知予告(IDEAS 2-21) ──────────────────
  {
    id: 'yl_rds_snapshot_tease_weak',
    name: '【弱】RDSスナップショット通知予告(1回だけ)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,  // 統合調律(2026-08-13): 非レア時の演出発火率30%に合わせて 0.04 → 0.35
    duration: 900,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'announce', gain: 0.5 } },
      { at: 100, layer: 'lcd', action: 'text', params: { text: 'SNAPSHOT', sub: 'バックアップを1件作成', color: '#8ad4ff', ms: 700 } },
    ],
  },
  {
    id: 'yl_rds_snapshot_tease_mid',
    name: '【中】RDSスナップショット通知予告(2連続で来る)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'announce' } },
      { at: 100, layer: 'lcd', action: 'text', params: { text: 'SNAPSHOT ×1', sub: 'バックアップを作成中…', color: '#ffe066', ms: 700 } },
      { waitFor: 'stop2', layer: 'sfx', action: 'synth', params: { preset: 'announce' } },
      { waitFor: 'stop2', after: 50, layer: 'lcd', action: 'text', params: { text: 'SNAPSHOT ×2', sub: '2件連続でバックアップ完了', color: '#ffe066', ms: 900 } },
    ],
  },

  // ── I. Well-Architected 5本柱予告(IDEAS 2-30) ───────────────────
  {
    id: 'yl_pillar_tease_weak',
    name: '【弱】Well-Architected予告(柱1本だけ)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,  // 統合調律(2026-08-13): 非レア時の演出発火率30%に合わせて 0.04 → 0.35
    duration: 1000,
    cues: [
      { at: 0,  layer: 'lcd', action: 'anim',  params: { anim: 'pillar_raise', index: 1, count: 6 } },
      { at: 60, layer: 'sfx', action: 'synth', params: { preset: 'pillar_up', gain: 0.5 } },
    ],
  },
  {
    id: 'yl_pillar_tease_mid',
    name: '【中】Well-Architected予告(柱3本まで点灯)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'anim',  params: { anim: 'pillar_raise', index: 1, count: 6 } },
      { at: 60,  layer: 'sfx',  action: 'synth', params: { preset: 'pillar_up' } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'pillar_raise', index: 2, count: 6 } },
      { waitFor: 'stop2', after: 60, layer: 'sfx', action: 'synth', params: { preset: 'pillar_up' } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'anim', params: { anim: 'pillar_raise', index: 3, count: 6 } },
    ],
  },

  // ── J. Trusted Advisorチェックリスト予告(IDEAS 2-26、"中"のみの案) ─
  {
    id: 'yl_checklist_tease_mid',
    name: '【中】Trusted Advisor チェックリスト予告',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 40, default: 0 },
    duration: 1500,
    cues: [
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'checklist_green', index: 1 } },
      { at: 40,  layer: 'sfx', action: 'synth', params: { preset: 'checklist_ok' } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'checklist_green', index: 2 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'text', params: { text: 'TRUSTED ADVISOR', sub: '推奨項目を確認中…', color: '#ffd166', ms: 900 } },
    ],
  },

  // ── K. サメの唸り声のみ予告(IDEAS 2-32、音のみ・姿は見えない) ────
  {
    id: 'yl_shark_growl_weak',
    name: '【弱】サメの唸り声のみ予告(音だけ)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 60, default: 0 },
    chance: 0.30,  // 統合調律(2026-08-13): 非レア時の演出発火率30%に合わせて 0.03 → 0.30
    duration: 600,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'shark_swim', gain: 0.5, rate: 0.85 } },
    ],
  },
  {
    id: 'yl_shark_growl_mid',
    name: '【中】サメの唸り声のみ予告(微振動付き・稀に強)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 35, default: 0 },
    duration: 900,
    cues: [
      { at: 0,  layer: 'sfx',     action: 'synth', params: { preset: 'shark_swim' } },
      { at: 80, layer: 'overlay', action: 'shake', params: { power: 6, ms: 260 } },
    ],
  },

  // ── L. Lambda保留変化予告(IDEAS 2-33) ───────────────────────────
  {
    id: 'yl_lambda_invoke_weak',
    name: '【弱】Lambda呼び出し予告(コールドスタートのまま終わる)',
    // 旧実装は sfn_task に ok:false を渡して「FAILED」と断言していたが、
    // レバーON時点では当落が決まっていないため嘘になり得た(失敗と出たのに
    // 数ゲーム後にCZへ入る)。結論を出さない実行中表示に差し替えてある。
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.35,  // 統合調律(2026-08-13): 非レア時の演出発火率30%に合わせて 0.04 → 0.35
    duration: 1200,
    cues: [
      { at: 0, layer: 'lcd', action: 'text', params: { text: 'INVOKING…', color: '#8ad4ff', ms: 500 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'sfn_task', result: 'running' } },
      { waitFor: 'stop3', after: 40, layer: 'sfx', action: 'synth', params: { preset: 'sfn_choice', gain: 0.6 } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'text',
        params: { text: 'COLD START', sub: 'まだ温まっていない', color: '#8ad4ff', ms: 900 } },
    ],
  },
  {
    id: 'yl_lambda_invoke_mid',
    name: '【中】Lambda呼び出し予告(同時実行数が伸びる)',
    // 旧実装は sfn_task に ok:true を渡して「SUCCEEDED」と断言していた。
    // レア役を引いただけで成功の画が出るため非当選ゲームでも出ていたので、
    // 結論を出さず「実行中 + 同時実行数」で期待度だけを示す形へ変更。
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 1700,
    cues: [
      { at: 0, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0, layer: 'lcd',  action: 'text', params: { text: 'INVOKING…', color: '#ffe066', ms: 600 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'sfn_task', result: 'running' } },
      { waitFor: 'stop3', after: 40, layer: 'sfx', action: 'synth', params: { preset: 'sfn_choice' } },
      { waitFor: 'stop3', after: 80, layer: 'overlay', action: 'flash', params: { color: '#ffd166', ms: 180 } },
      { waitFor: 'stop3', after: 140, layer: 'lcd', action: 'text',
        params: { text: 'CONCURRENCY ×3', sub: '同時実行数が伸びている', color: '#ffe066', ms: 1100 } },
    ],
  },
];
