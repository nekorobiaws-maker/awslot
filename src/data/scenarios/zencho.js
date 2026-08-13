/**
 * 前兆演出シナリオ。DESIGN.md 6.5 / IDEAS.md 2章・3章 / data/zencho.js
 *
 * game/modes/freetier.js が前兆中に流す paramChange を拾って組み立てる。
 *   param: 'zencho'         … 前兆の各ゲーム(最終Gを除く)
 *      value / strength … 強度 1〜3(本前兆かガセかは分からない値)
 *      pattern          … 演出パターンID(data/zencho.js の patterns)
 *      step             … 何ゲーム目か(1始まり)
 *      level            … step を 1〜3 に丸めた段階値(step_up 用)
 *      left / total     … 残り・総ゲーム数(判定用。画面へ出さないこと)
 *   param: 'zencho_upgrade' … 前兆中に当選した(= 本前兆確定の格上げ)
 *   param: 'zencho_end'     … 最終Gの結果告知
 *      value: 'ENTRY' | 'MISS' / to: 'CZ' | 'BONUS' | 'AT' | null
 *
 * ■ 表示してはいけない値
 *   left / total を画面へ出すと前兆の長さが割れる。
 *   「5G目まで伸びたら本前兆確定」という期待度設計が成立しなくなるため、
 *   テロップに出してよいのは step / level だけ。
 */

export default [
  // ── 演出パターン(弱)───────────────────────

  {
    id: 'zn_deepracer_run',
    name: '【前兆・弱】ミニDeepRacerがリール下を走り抜ける',
    // IDEAS.md 2-35。賑やかしだが、前兆中に出ている時点で少しだけ期待できる
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: ['deepracer'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 1400,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 0,   layer: 'lcd', action: 'particles', params: { preset: 'stream', x: 40, y: 250, count: 10 } },
      { at: 200, layer: 'lcd', action: 'particles', params: { preset: 'stream', x: 200, y: 252, count: 10 } },
      { at: 400, layer: 'lcd', action: 'particles', params: { preset: 'stream', x: 360, y: 254, count: 10 } },
      { at: 460, layer: 'lcd', action: 'text',
        params: { text: 'LAP ${step}', sub: 'DeepRacer が試走している', color: '#8ad4ff', ms: 900 } },
    ],
  },

  {
    id: 'zn_sqs_backlog',
    name: '【前兆・弱】SQS保留メッセージが捌けない',
    // IDEAS.md 2-6「隅の保留メッセージ数字が増えるほど期待度アップ」
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: ['sqs_backlog'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'announce' } },
      { at: 60,  layer: 'lcd',  action: 'anim',  params: { anim: 'step_up', step: '$level' } },
      { at: 200, layer: 'lcd',  action: 'text',
        params: { text: 'BACKLOG: ${step}', sub: 'SQS のキューが捌けていない', color: '#ffd166', ms: 1100 } },
      { at: 240, layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 1400, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'zn_canary_release',
    name: '【前兆・弱〜中】カナリアリリースのトラフィックが増えていく',
    // IDEAS.md 3-3「10%→50%→100% と増え、100%到達で当選濃厚」
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: ['canary'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 1800,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'dynamo_scale' } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'cw_graph_rise', step: '$step' } },
      // 段階に応じてデプロイのバーも伸ばす(結論は出さない = result を渡さない)。
      // このパターンの顛末は最終Gの yg_deploy_result_success / _rollback が締める
      { at: 60,  layer: 'lcd', action: 'anim',  params: { anim: 'deploy_progress', stage: '$level', ms: 1500 } },
      { at: 300, layer: 'lcd', action: 'particles', params: { preset: 'scale', x: 300, y: 200, count: 12 } },
      // ${step} で毎ゲーム数字が動く(1G目 10% → 2G目 20% …)。
      // 同じ絵が繰り返されると前兆が単調になるので、段階が見える文言にしてある
      { at: 360, layer: 'lcd', action: 'text',
        params: { text: 'CANARY ${step}0%', sub: '新バージョンへ流量を寄せている', color: '#7bf7d0', ms: 1100 } },
    ],
  },

  // ── 演出パターン(中)───────────────────────

  {
    id: 'zn_xray_trace',
    name: '【前兆・中】X-Ray に赤いエラートレースが走る',
    // IDEAS.md 2-27「赤いエラートレースが走ると実は激アツ」
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: ['xray'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,   layer: 'sfx',    action: 'synth', params: { preset: 'error_buzz' } },
      { at: 0,   layer: 'lamp',   action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,  layer: 'lcd',    action: 'particles', params: { preset: 'stream', x: 80, y: 150, count: 16 } },
      { at: 140, layer: 'reelfx', action: 'highlight', params: { ms: 520, color: '#ff6b6b' } },
      { at: 220, layer: 'lcd',    action: 'anim',  params: { anim: 'step_up', step: '$level' } },
      { at: 300, layer: 'lcd',    action: 'text',
        params: { text: 'TRACE 5xx ×${step}', sub: 'X-Ray の赤いトレースが増えていく', color: '#ff6b6b', ms: 1200 } },
    ],
  },

  {
    id: 'zn_health_maintenance',
    name: '【前兆・中】AWS Health Dashboard の緊急メンテナンス通知',
    // IDEAS.md 2-29「『緊急メンテナンス』通知で強」
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: ['health'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'announce' } },
      { at: 0,    layer: 'char', action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 80,   layer: 'lcd',  action: 'anim',  params: { anim: 'step_up', step: '$level' } },
      { at: 240,  layer: 'lcd',  action: 'text',
        params: { text: 'MAINTENANCE', sub: '影響範囲 ${step} リージョンへ拡大', color: '#ffd166', ms: 1300 } },
      { at: 900,  layer: 'char', action: 'motion', params: { char: 'kiro', motion: 'shake' } },
      { at: 1700, layer: 'char', action: 'pose',   params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'zn_guardduty_alert',
    name: '【前兆・中】GuardDuty が不審なアクセスを検知',
    // IDEAS.md 2-10「『不審なアクセス検知』ポップアップは実は激アツ前兆」
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: ['guardduty'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 80,  layer: 'overlay', action: 'cutin', params: { id: 'mini_ghost_peek', side: 'right' } },
      { at: 200, layer: 'lcd',     action: 'anim',  params: { anim: 'step_up', step: '$level' } },
      { at: 240, layer: 'lcd',     action: 'anim',  params: { anim: 'lcd_flash', color: '#ff9f43', strength: 0.6 } },
      { at: 300, layer: 'lcd',     action: 'text',
        params: { text: 'FINDING ×${step}', sub: 'GuardDuty: UnauthorizedAccess', color: '#ff9f43', ms: 1200 } },
      { at: 820, layer: 'overlay', action: 'flash', params: { color: '#ff9f43', ms: 160 } },
    ],
  },

  // ── 演出パターン(強度3でしか出ない)──────────

  {
    id: 'zn_cloudtrail_root',
    name: '【前兆・強】CloudTrail に Root User Login が流れる',
    // IDEAS.md 2-23「『Root User Login』の文字が出たら激アツ」/ 3-14 ルートユーザー緊急ログイン
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: ['cloudtrail'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 2400,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'stream_flow' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'lcd',     action: 'particles', params: { preset: 'stream', x: 60, y: 120, count: 14 } },
      { at: 300,  layer: 'sfx',     action: 'synth', params: { preset: 'error_buzz' } },
      { at: 340,  layer: 'overlay', action: 'shake', params: { power: 10, ms: 420 } },
      { at: 360,  layer: 'lcd',     action: 'text',
        params: { text: 'Root User Login', sub: 'CloudTrail — ${step} 件目のルートログイン', color: '#ff4d4d', ms: 1500 } },
      { at: 420,  layer: 'char',    action: 'show', params: { char: 'kiro', pose: 'panic' } },
      { at: 1900, layer: 'char',    action: 'pose', params: { char: 'kiro', pose: 'surprised' } },
    ],
  },

  {
    id: 'zn_reinvent_stage',
    name: '【前兆・特殊】エンディング帰りの持ち越し当選(carryWin 専用)',
    // 2026-08-13: 「会場のライトが光り始めた」は内部状態昇格のステージチェンジへ移した
    // (data/scenarios/normal.js の stage_up_provisioned)。
    // このパターンは data/zencho.js で weight 0 にしてあるので通常の前兆抽選では出ない。
    // ただし game/modes/freetier.js の carryWin(エンディングから当選を持ち帰った経路)が
    // pattern:'reinvent' を直接指定しており、そこだけは今も通る。game/ は編集禁止なので
    // シナリオは残し、ステージチェンジと文言がぶつからないよう「会場帰り」の体に変えた。
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: ['reinvent'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 2400,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'stage_change' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#7b5cff', ms: 260 } },
      { at: 140,  layer: 'overlay', action: 'particles', params: { preset: 'spark', x: 360, y: 260, count: 18 } },
      { at: 240,  layer: 'lcd',     action: 'text',
        params: { text: 'ENCORE', sub: '会場の熱気がまだ残っている', color: '#a78bfa', ms: 1500 } },
      { at: 300,  layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'happy' } },
      { at: 340,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'zoom' } },
      { at: 1000, layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 200, y: 180, count: 12 } },
      { at: 2000, layer: 'char',    action: 'pose',   params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  // ── 最終G手前の煽り(段階3まで伸びた前兆だけ)──

  {
    id: 'zn_final_push',
    name: '【前兆】インシデントレベル引き上げ(次ゲームで判定)',
    // 前兆が段階3まで伸び、かつ残り1G。長く伸びている時点で本前兆寄り
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], level: [3], left: [1] } },
    weight: { FREE_TIER: 200, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 8, ms: 500 } },
      { at: 140,  layer: 'lcd',     action: 'anim',  params: { anim: 'step_up', step: 3 } },
      // 赤文字予兆。level3 かつ残り1G = 前兆が伸びきった状態で、最も信頼できるサイン
      { at: 260,  layer: 'lcd',     action: 'text',
        params: { text: 'ESCALATED', sub: 'エスカレーション先を選定中…', tone: 'hot', color: '#ff3b30', ms: 1400 } },
      { at: 300,  layer: 'char',    action: 'show', params: { char: 'kiro', pose: 'panic' } },
      { at: 1000, layer: 'sfx',     action: 'synth', params: { preset: 'countdown_tick' } },
      { at: 1700, layer: 'char',    action: 'pose', params: { char: 'kiro', pose: 'surprised' } },
    ],
  },

  // ── 前兆中の当選(格上げ)= 本前兆確定 ────────

  {
    id: 'zn_promote_flash',
    name: '【前兆】インシデント格上げフラッシュ(前兆中の当選)',
    // reason: PROMOTE(ガセ→本前兆)/ RANKUP(上位へ差し替え)だけがフル演出。
    // ABSORB(同格以下を吸収)は格が上がっていないので下の弱演出へ回す
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_upgrade'], reason: ['PROMOTE', 'RANKUP'] },
    },
    weight: { FREE_TIER: 1000, default: 0 },
    duration: 2500,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 300 } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 100,  layer: 'overlay', action: 'shake', params: { power: 14, ms: 520 } },
      { at: 160,  layer: 'lcd',     action: 'anim',  params: { anim: 'lcd_flash', color: '#ffe066', strength: 1 } },
      { at: 240,  layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'premium' } },
      { at: 280,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'zoom' } },
      { at: 340,  layer: 'lcd',     action: 'text',
        params: { text: 'ESCALATION', sub: 'インシデントレベルが引き上げられた', color: '#ffe066', ms: 1600 } },
      { at: 640,  layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 352, y: 176, count: 20 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'kiro_alarm_01' } },
      { at: 2000, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'surprised' } },
    ],
  },

  {
    id: 'zn_absorb_merge',
    name: '【前兆】重複インシデントの統合(格上げなしの再当選)',
    // 保持中の当選と同格以下を引いたケース。中身は増えていないので、
    // 虹パーティクルや premium ポーズは使わずワンランク下の見せ方にする
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_upgrade'], reason: ['ABSORB'] },
    },
    weight: { FREE_TIER: 1000, default: 0 },
    duration: 1500,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'announce' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#8ad4ff', ms: 180 } },
      { at: 80,  layer: 'lcd',     action: 'anim',  params: { anim: 'lcd_flash', color: '#8ad4ff', strength: 0.5 } },
      { at: 160, layer: 'lcd',     action: 'text',
        params: { text: 'CORRELATED', sub: '既存のインシデントに統合された', color: '#8ad4ff', ms: 1100 } },
      { at: 220, layer: 'char',    action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 1300, layer: 'char',   action: 'pose', params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  // ── 最終Gの結果告知 ──────────────────────────

  {
    id: 'zn_result_entry_cz',
    name: '【前兆・結果】CZ突入告知',
    // CZ側の modeEnter シナリオと同時に走るので、液晶は短く譲る
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho_end'], value: ['ENTRY'], to: ['CZ'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 1400,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'cutin_whoosh' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#7bf7d0', ms: 260 } },
      { at: 60,  layer: 'overlay', action: 'shake', params: { power: 10, ms: 400 } },
      { at: 140, layer: 'lcd',     action: 'text',
        params: { text: 'ESCALATE', sub: '調査を開始します', color: '#7bf7d0', ms: 800 } },
      { at: 200, layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
    ],
  },

  {
    id: 'zn_result_entry_direct',
    name: '【前兆・結果】ボーナス / AT 直撃告知(Sev1)',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_end'], value: ['ENTRY'], to: ['BONUS', 'AT'] },
    },
    weight: { FREE_TIER: 800, default: 0 },
    duration: 2300,
    cues: [
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 380 } },
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 80,  layer: 'overlay', action: 'shake', params: { power: 16, ms: 620 } },
      { at: 180, layer: 'lcd',     action: 'anim',  params: { anim: 'lcd_flash', color: '#ffe066', strength: 1 } },
      { at: 240, layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'premium' } },
      { at: 280, layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'zoom' } },
      { at: 340, layer: 'lcd',     action: 'text',
        params: { text: 'SEV1', sub: '最上位インシデント — 即応せよ', color: '#ffe066', ms: 1400 } },
      { at: 760, layer: 'overlay', action: 'particles', params: { preset: 'rainbow', x: 360, y: 400, count: 24 } },
    ],
  },

  {
    id: 'zn_result_miss',
    name: '【前兆・結果】ガセ終了(誤検知でした)',
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho_end'], value: ['MISS'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 1800,
    cues: [
      { at: 0,    layer: 'sfx',   action: 'synth', params: { preset: 'health_check' } },
      { at: 0,    layer: 'lcd',   action: 'anim',  params: { anim: 'health_check', ok: true, label: 'NO ISSUE' } },
      { at: 260,  layer: 'lcd',   action: 'text',
        params: { text: 'RESOLVED', sub: '誤検知でした', color: '#8aa0b4', ms: 1200 } },
      { at: 300,  layer: 'char',  action: 'show', params: { char: 'kiro', pose: 'normal' } },
      { at: 900,  layer: 'lamp',  action: 'pattern', params: { pattern: 'idle' } },
      { at: 1100, layer: 'voice', action: 'play', params: { key: 'kiro_talk_02' } },
    ],
  },

  /* ── Macie 機密データスキャンの結末(当落連動)────────────────────────
   *
   * ユーザー指摘(2026-08-13):「Macieの検出イベントで『検出なし』なのにクイズ(CZ告知)へ
   * 移行した。『個人情報を発見!』の場合にCZへ移行すべき」。
   *
   * 原因は ys_macie_scan_weak(「該当データなし」で終わる弱予告)が前兆中=当選保持中の
   * ゲームでも発火していたこと。対処は2段構え:
   *   1. 弱予告側に match {'modeState.zenchoActive': [false]} を付けて前兆中は発火禁止
   *      (yokoku-secnet.js。ガセ前兆中も等しく抑制されるので秘匿性は保たれる)
   *   2. 「発見!」の画を当選確定イベントへ移す = この2本
   *
   * GuardDuty の前兆パターン(不審アクセス検知)の顛末として出す。
   * 「不審な動きを検知 → Macie が中身を特定 → 個人情報を発見 → 調査開始(CZ)」の筋。
   * デプロイ / Step Functions / Well-Architected と同じ流儀。
   */
  {
    id: 'zn_macie_result_found',
    name: 'Macie 個人情報を発見 → CZ突入【当選確定イベントのみ】',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_end'], value: ['ENTRY'], to: ['CZ'], pattern: ['guardduty'] },
    },
    weight: { FREE_TIER: 400, default: 0 },
    duration: 3000,
    cues: [
      { at: 40,   layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 60,   layer: 'lcd',     action: 'text',
        params: { text: 'SCANNING…', sub: 'Macie がバケットを走査中', color: '#ffd166', ms: 700 } },
      { at: 700,  layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 900,  layer: 'overlay', action: 'flash', params: { color: '#ff8a00', ms: 320 } },
      { at: 920,  layer: 'overlay', action: 'shake', params: { power: 12, ms: 420 } },
      { at: 960,  layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 220, y: 140, count: 20 } },
      { at: 980,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'panic' } },
      // 「突入」を含むので可読性エンジンが自動で sticky にする
      { at: 1040, layer: 'lcd',     action: 'text',
        params: { text: '個人情報を発見! CZ突入', sub: 'SENSITIVE DATA FOUND', color: '#ff8a00', ms: 2000 } },
      { at: 1300, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_reg' } },
    ],
  },
  {
    id: 'zn_macie_result_none',
    name: '【ガセ】Macie 該当データなし【非当選確定イベントのみ】',
    // ガセ前兆が何も起きずに終わったときにしか来ない。ここからCZへ向かう経路は無い
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_end'], value: ['MISS'], pattern: ['guardduty'] },
    },
    weight: { FREE_TIER: 400, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { at: 40,   layer: 'lcd',  action: 'text',
        params: { text: 'SCANNING…', sub: 'Macie がバケットを走査中', color: '#8ad4ff', ms: 700 } },
      { at: 800,  layer: 'sfx',  action: 'synth', params: { preset: 'health_check' } },
      { at: 860,  layer: 'char', action: 'show', params: { char: 'kiro', pose: 'normal' } },
      { at: 900,  layer: 'lcd',  action: 'text',
        params: { text: 'NO FINDING', sub: '該当データなし — 誤検知でした', color: '#8aa0b4', ms: 1200 } },
      { at: 1200, layer: 'lamp', action: 'pattern', params: { pattern: 'idle' } },
    ],
  },

  /* ── DeepRacer 擬似連 ───────────────────────────────────────────────
   *
   * ゲームロジック(CZ担当実装)からのイベント契約:
   *   paramChange { param:'deepracer', step:1..4, cars:台数, result:null|'cz'|'bonus'|'miss' }
   *
   * 毎 step で必ず車が走る。step が進むほど台数と速度が上がり、step4 は大量走行の激アツ。
   * 擬似連カウント(×2 / ×3 / ×4)は step2 以降の冒頭に出す(パチンコの擬似連の流儀。
   * 1回目はまだ「連チャン」していないのでカウントを出さない)。
   *
   * ■ 整合の担保
   *   step だけのイベント(result:null)は**結論を出さない**。走る画とカウントだけ。
   *   突入・確定の画は result が来たときにしか出さない:
   *     result:'cz'    → CZ突入告知(sticky)
   *     result:'bonus' → ボーナス確定告知(sticky)
   *     result:'miss'  → 何も起きずに終わる
   *   result 付きのイベントでは step 側のシナリオが match: { result: [null] } で
   *   外れるので、結果告知と二重再生になることもない。
   */
  {
    id: 'dr_pseudo_step1',
    name: 'DeepRacer擬似連 1回目(1台がトコトコ走る)',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['deepracer'], step: [1], result: [null] },
    },
    weight: { FREE_TIER: 2000, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 60,  layer: 'lcd', action: 'anim',
        params: { anim: 'deepracer_race', step: 1, cars: '$cars', ms: 2000 } },
      { at: 300, layer: 'lcd', action: 'text',
        params: { text: 'LAP 1', sub: 'DeepRacer が試走を始めた', color: '#8ad4ff', ms: 1000 } },
    ],
  },
  {
    id: 'dr_pseudo_step2',
    name: 'DeepRacer擬似連 ×2(2台・少し速く)',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['deepracer'], step: [2], result: [null] },
    },
    weight: { FREE_TIER: 2000, default: 0 },
    duration: 2400,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#8ad4ff', ms: 180 } },
      { at: 60,  layer: 'lcd',     action: 'anim',
        params: { anim: 'deepracer_race', step: 2, cars: '$cars', label: '×2', ms: 2200 } },
      { at: 1100, layer: 'lcd',    action: 'text',
        params: { text: 'LAP 2', sub: '2台目が追いついてきた', color: '#7bf7d0', ms: 1000 } },
    ],
  },
  {
    id: 'dr_pseudo_step3',
    name: 'DeepRacer擬似連 ×3(3台・移行抽選の緊張感)',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['deepracer'], step: [3], result: [null] },
    },
    weight: { FREE_TIER: 2000, default: 0 },
    duration: 2600,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffd166', ms: 220 } },
      { at: 60,   layer: 'lcd',     action: 'anim',
        params: { anim: 'deepracer_race', step: 3, cars: '$cars', label: '×3', ms: 2400 } },
      { at: 900,  layer: 'char',    action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 1400, layer: 'sfx',     action: 'synth', params: { preset: 'countdown_tick' } },
      { at: 1500, layer: 'lcd',     action: 'text',
        params: { text: 'LAP 3', sub: '最終コーナーへ', color: '#ffd166', ms: 1100 } },
    ],
  },
  {
    id: 'dr_pseudo_step4',
    name: 'DeepRacer擬似連 ×4(大量走行・激アツ)',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['deepracer'], step: [4], result: [null] },
    },
    weight: { FREE_TIER: 2000, default: 0 },
    duration: 3200,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 320 } },
      { at: 20,   layer: 'overlay', action: 'shake', params: { power: 18, ms: 620 } },
      { at: 60,   layer: 'lcd',     action: 'anim',
        params: { anim: 'deepracer_race', step: 4, cars: '$cars', label: '×4', ms: 3000 } },
      { at: 700,  layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 900,  layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'premium' } },
      { at: 940,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'zoom' } },
      { at: 1200, layer: 'overlay', action: 'particles', params: { preset: 'rainbow', x: 360, y: 380, count: 26 } },
      // 結論は出さない。ここは「大量に走ってきた」画までで、当落は result 側が告げる
      { at: 1600, layer: 'lcd',     action: 'text',
        params: { text: 'FULL GRID', sub: '全車がコースへ入った', color: '#ffe066', ms: 1400 } },
    ],
  },

  {
    id: 'dr_pseudo_result_cz',
    name: 'DeepRacer擬似連 → CZ突入【result:cz のときだけ】',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['deepracer'], result: ['cz'] },
    },
    weight: { FREE_TIER: 3000, default: 0 },
    duration: 3000,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,   layer: 'lcd',     action: 'anim',
        params: { anim: 'deepracer_race', step: '$step', cars: '$cars', ms: 2200 } },
      { at: 900,  layer: 'overlay', action: 'flash', params: { color: '#7bf7d0', ms: 300 } },
      { at: 920,  layer: 'overlay', action: 'shake', params: { power: 12, ms: 420 } },
      { at: 960,  layer: 'sfx',     action: 'synth', params: { preset: 'upgrade_chime' } },
      { at: 1000, layer: 'char',    action: 'show', params: { char: 'kiro', pose: 'happy' } },
      { at: 1060, layer: 'lcd',     action: 'text',
        params: { text: 'CHECKERED FLAG — CZ突入', sub: 'ゴールした!', color: '#7bf7d0', ms: 1900 } },
      { at: 1300, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_reg' } },
    ],
  },
  {
    id: 'dr_pseudo_result_bonus',
    name: 'DeepRacer擬似連 → ボーナス確定【result:bonus のときだけ】',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['deepracer'], result: ['bonus'] },
    },
    weight: { FREE_TIER: 3000, default: 0 },
    duration: 3400,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 380 } },
      { at: 20,   layer: 'overlay', action: 'shake', params: { power: 20, ms: 700 } },
      { at: 60,   layer: 'lcd',     action: 'anim',
        params: { anim: 'deepracer_race', step: 4, cars: '$cars', ms: 2600 } },
      { at: 900,  layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 940,  layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'premium' } },
      { at: 980,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'zoom' } },
      // 「確定」を含むので可読性エンジンが自動で sticky にする
      { at: 1060, layer: 'lcd',     action: 'text',
        params: { text: 'BONUS 確定!!', sub: '表彰台まで駆け抜けた', color: '#ffe066', ms: 2200 } },
      { at: 1400, layer: 'overlay', action: 'particles', params: { preset: 'rainbow', x: 360, y: 400, count: 34 } },
    ],
  },
  {
    id: 'dr_pseudo_result_miss',
    name: '【ガセ】DeepRacer擬似連 リタイア【result:miss のときだけ】',
    // 非当選が確定したイベントでしか来ない。ここからCZ/ボーナスへ向かう経路は無い
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['deepracer'], result: ['miss'] },
    },
    weight: { FREE_TIER: 3000, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'lcd',  action: 'anim',
        params: { anim: 'deepracer_race', step: '$step', cars: '$cars', ms: 1800 } },
      { at: 800, layer: 'sfx',  action: 'synth', params: { preset: 'error_buzz', gain: 0.6 } },
      { at: 860, layer: 'char', action: 'show', params: { char: 'kiro', pose: 'normal' } },
      { at: 900, layer: 'lcd',  action: 'text',
        params: { text: 'RETIRE', sub: 'コースアウトした…', color: '#8aa0b4', ms: 1200 } },
      { at: 1200, layer: 'lamp', action: 'pattern', params: { pattern: 'idle' } },
    ],
  },

  /* ── SQS キュー滞留の結末(当落連動)──────────────────────────────
   *
   * ユーザー仕様(2026-08-13):
   *   成功(当選)  … すべてのメッセージを処理できた。キューが空になる + 処理完了カウント
   *   失敗(非当選)… エラーが発生してデッドレターキュー(DLQ)へ入った
   *
   * 途中経過(キューが溜まっていく画)は zn_sqs_backlog が担当し、結論は出さない。
   * 結論はこの2本だけが出す。sqs_backlog パターンの顛末はこのSQS仕様が正で、
   * 以前ここへ紐付けていた Step Functions の結末画は xray パターンへ付け替えた
   * (yokoku-gimmick.js の yg_sfn_result_*)。
   */
  {
    id: 'zn_sqs_result_drained',
    name: 'SQS 全メッセージ処理完了 → 突入【当選確定イベントのみ】',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_end'], value: ['ENTRY'], to: ['CZ'], pattern: ['sqs_backlog'] },
    },
    weight: { FREE_TIER: 400, default: 0 },
    duration: 3000,
    cues: [
      { at: 40,   layer: 'sfx',     action: 'synth', params: { preset: 'stream_flow' } },
      { at: 60,   layer: 'lcd',     action: 'anim',
        params: { anim: 'sqs_queue_result', result: 'drained', count: 5, ms: 2400 } },
      { at: 900,  layer: 'sfx',     action: 'synth', params: { preset: 'checklist_ok' } },
      { at: 1300, layer: 'overlay', action: 'flash', params: { color: '#4ce0a0', ms: 300 } },
      { at: 1320, layer: 'overlay', action: 'shake', params: { power: 10, ms: 380 } },
      { at: 1360, layer: 'sfx',     action: 'synth', params: { preset: 'upgrade_chime' } },
      { at: 1400, layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 1440, layer: 'lcd',     action: 'particles', params: { preset: 'scale', x: 120, y: 170, count: 16 } },
      // 「突入」を含むので可読性エンジンが自動で sticky にする
      { at: 1500, layer: 'lcd',     action: 'text',
        params: { text: '全メッセージ処理完了 — 突入', sub: 'キューが空になった', color: '#4ce0a0', ms: 2000 } },
      { at: 1800, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_reg' } },
    ],
  },
  {
    id: 'zn_sqs_result_dlq',
    name: '【ガセ】SQS エラーで DLQ 行き【非当選確定イベントのみ】',
    // ガセ前兆が何も起きずに終わったときにしか来ない。ここからCZへ向かう経路は無い
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_end'], value: ['MISS'], pattern: ['sqs_backlog'] },
    },
    weight: { FREE_TIER: 400, default: 0 },
    duration: 2600,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'error_buzz', gain: 0.7 } },
      { at: 60,   layer: 'lcd',  action: 'anim',
        params: { anim: 'sqs_queue_result', result: 'dlq', count: 4, ms: 2200 } },
      { at: 900,  layer: 'char', action: 'show', params: { char: 'kiro', pose: 'panic' } },
      { at: 1200, layer: 'lcd',  action: 'text',
        params: { text: '再処理は打ち切り', sub: 'エラーで処理できなかった', color: '#ff8a8a', ms: 1400 } },
      { at: 1600, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'normal' } },
      { at: 1700, layer: 'lamp', action: 'pattern', params: { pattern: 'idle' } },
    ],
  },

  /* ══ 赤文字予兆(HOT サイン)══════════════════════════════════════
   *
   * ユーザー指示:「熱い演出は赤い文字で予兆を表示。赤の時はだいたいステージ昇格
   * もしくはCZに入る」。
   *
   * ■ 何を根拠に赤くするか
   *   前兆の強度(strength)は data/zencho.js の振り分けで
   *     本前兆 {1:20, 2:35, 3:45} / ガセ {1:55, 2:33, 3:12}
   *   と分かれている。つまり **強度が高いほど本前兆に偏る**。
   *   赤の条件を strength 2 以上にすると、実測で「赤から5G以内に昇格orCZ」が
   *   目標帯(75〜85%)へ収まる。strength 3 だけに絞ると 95% まで上がってしまい、
   *   「赤 = 確定」になって裏切りが無くなるので、あえて強度2も混ぜている。
   *   strength 1(ガセ寄り)は白のままなので「白→赤」の対比は保たれる。
   *   本前兆は最長5Gで必ず告知されるので、赤から5G以内にCZ/ボーナスへ到達する。
   *
   * ■ 乱発させない工夫
   *   step:[2,3,4,5] に限定し、前兆の1G目では赤くしない。
   *   「白で始まって、伸びたら赤くなる」= 見たら身構える頻度に収まり、
   *   かつ「伸びるほど熱い」という前兆の期待度設計とも噛み合う。
   *
   * ■ tone について
   *   テキスト帯の tone:'hot'(赤表示)は調停担当が実装中。
   *   まだ入っていない環境でも赤く出るよう color も併記してある(前方互換)。
   */
  {
    id: 'zn_hot_xray',
    name: '【赤】X-Ray 赤トレースが止まらない(強度3)',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho'], pattern: ['xray'], strength: [2, 3], step: [2, 3, 4, 5] },
    },
    weight: { FREE_TIER: 900, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',    action: 'synth', params: { preset: 'error_buzz' } },
      { at: 0,   layer: 'lamp',   action: 'pattern', params: { pattern: 'rare' } },
      { at: 40,  layer: 'overlay', action: 'flash', params: { color: '#ff3b30', ms: 200 } },
      { at: 80,  layer: 'lcd',    action: 'particles', params: { preset: 'stream', x: 80, y: 150, count: 18 } },
      { at: 140, layer: 'reelfx', action: 'highlight', params: { ms: 560, color: '#ff3b30' } },
      { at: 220, layer: 'lcd',    action: 'anim',  params: { anim: 'step_up', step: '$level' } },
      { at: 300, layer: 'lcd',    action: 'text',
        params: { text: 'TRACE 5xx ×${step}', sub: '赤いトレースが止まらない', tone: 'hot', color: '#ff3b30', ms: 1300 } },
    ],
  },
  {
    id: 'zn_hot_health',
    name: '【赤】AWS Health Dashboard の障害が全リージョンへ拡大(強度3)',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho'], pattern: ['health'], strength: [2, 3], step: [2, 3, 4, 5] },
    },
    weight: { FREE_TIER: 900, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'sfx',    action: 'synth', params: { preset: 'announce' } },
      { at: 0,   layer: 'lamp',   action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,  layer: 'overlay', action: 'flash', params: { color: '#ff3b30', ms: 220 } },
      { at: 80,  layer: 'char',   action: 'show',  params: { char: 'kiro', pose: 'panic' } },
      { at: 120, layer: 'lcd',    action: 'anim',  params: { anim: 'step_up', step: '$level' } },
      { at: 260, layer: 'lcd',    action: 'text',
        params: { text: 'CRITICAL ×${step}', sub: '影響範囲が広がり続けている', tone: 'hot', color: '#ff3b30', ms: 1400 } },
      { at: 1700, layer: 'char',  action: 'pose',  params: { char: 'kiro', pose: 'surprised' } },
    ],
  },
  {
    id: 'zn_hot_guardduty',
    name: '【赤】GuardDuty の検知が連続している(強度3)',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho'], pattern: ['guardduty'], strength: [2, 3], step: [2, 3, 4, 5] },
    },
    weight: { FREE_TIER: 900, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,  layer: 'overlay', action: 'flash', params: { color: '#ff3b30', ms: 220 } },
      { at: 120, layer: 'lcd',     action: 'anim',  params: { anim: 'step_up', step: '$level' } },
      { at: 180, layer: 'lcd',     action: 'anim',  params: { anim: 'lcd_flash', color: '#ff3b30', strength: 0.6 } },
      { at: 300, layer: 'lcd',     action: 'text',
        params: { text: 'FINDING ×${step}', sub: '検知が止まらない', tone: 'hot', color: '#ff3b30', ms: 1300 } },
    ],
  },
  {
    id: 'zn_hot_cloudtrail',
    name: '【赤】CloudTrail に Root ログインが続く(強度3)',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho'], pattern: ['cloudtrail'], strength: [2, 3], step: [2, 3, 4, 5] },
    },
    weight: { FREE_TIER: 900, default: 0 },
    duration: 2400,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'stream_flow' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,  layer: 'overlay', action: 'flash', params: { color: '#ff3b30', ms: 240 } },
      { at: 80,  layer: 'lcd',     action: 'particles', params: { preset: 'stream', x: 60, y: 120, count: 16 } },
      { at: 300, layer: 'sfx',     action: 'synth', params: { preset: 'error_buzz' } },
      { at: 340, layer: 'overlay', action: 'shake', params: { power: 10, ms: 420 } },
      { at: 380, layer: 'lcd',     action: 'text',
        params: { text: 'Root Login ×${step}', sub: '誰かが入り続けている', tone: 'hot', color: '#ff3b30', ms: 1500 } },
      { at: 420, layer: 'char',    action: 'show', params: { char: 'kiro', pose: 'panic' } },
    ],
  },
];
