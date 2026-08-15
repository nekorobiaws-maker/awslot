/**
 * セキュリティ・ネットワーク系の弱〜強予告シナリオ集(担当: 演出量産第2弾)。
 * DESIGN.md 6.5 / IDEAS.md 2章。ID はすべて ys_ プレフィックス。
 *
 * まだ演出に登場していない AWS サービス
 *   Macie / Security Hub / Inspector / Detective / Cognito / API Gateway /
 *   Transit Gateway / Direct Connect / PrivateLink / Network Firewall /
 *   Site-to-Site VPN / Firewall Manager / ACM(証明書) / Secrets Manager
 * を題材にする。GuardDuty / WAF / Shield / CloudTrail / IAM 等は
 * yokoku-heavy.js で既出のため対象外。Global Accelerator は
 * upper.js の Multi-Region 演出(IDEAS.md 3-17)で既に着想元として
 * コメント参照されているため、こちらでは扱わない。
 *
 * 既存の演出語彙(lcdanims / lcdanims-extra / particles / sfx-presets /
 * キャラポーズ)の組み合わせだけで構成する。新規アニメ実装は一切不要。
 * 新しい AWS サービス名を画面に出す専用アニメは無いので、ほぼ全編を
 * lcd.text(自由記述テキスト)+ sfx.synth + particles/flash/shake の
 * 組み合わせで作り、一部だけ汎用アニメ(health_check / step_up /
 * checklist_green)を意味が合う範囲で借用する。
 *   - health_check(ok, label) … ALB ヘルスチェックの汎用「合否ランプ」。
 *     API Gateway のスロットル解除・PrivateLink 接続・VPN トンネル確立など
 *     「一度失敗して次に成功する/成功する」系の見た目に流用。
 *     ラベルは既存の最長実績("NEEDS WORK")を超えない範囲の短い文字列にする
 *     (health_check の描画は自動縮小しない固定フォントサイズのため)。
 *   - step_up(step) … normal.js / zencho.js 等で使われている汎用の
 *     3灯ステップ表示。Security Hub のスコア集約・Transit Gateway の
 *     経路集約という「段階的に積み上がる」絵に流用。
 *   - checklist_green(index) … Well-Architected / Trusted Advisor と同じ
 *     「行が緑に光る」チェックリスト表現。Firewall Manager のポリシー
 *     一括適用に流用。
 *
 * 期待度の作り方は yokoku-light.js / yokoku-heavy.js に合わせる:
 *   - 「弱」= when.flag に LOSE/BELL/REPLAY を含め chance で間引く(ガセ寄り)。
 *   - 「中」= when.rare か when.flag(STRONG_CHERRY/CHANCE 等)のみで chance なし
 *     (レア役成立時だけ出現)。
 *   - 「本物/ガセ」ペア(hit/gase)は SHARK・GHOST 級の最上位レア役だけを hit にし、
 *     gase 側は LOSE/BELL/WEAK_CHERRY 等 + 低 chance(0.02〜0.05)で薄く混ぜる
 *     (「強演出はガセ薄め」)。見た目が同じでもオチが違う形にして
 *     「実は激アツ」の温度差を作る(Cognito の MFA 突破・Direct Connect の
 *     専用線直結・Detective の調査完了が該当)。
 *   - すべて mode:['FREE_TIER'] に限定し、weight は { FREE_TIER: N, default: 0 }
 *     の形で明示する(director のフォールバック weight:10 に巻き込まれないため)。
 *   - ゲームの抽選 RNG は一切参照しない。chance は director 側の演出専用ダイス
 *     (staging 層のみで完結)であり、実際の当否には影響しない。
 *   - 「BONUS」を含む文言は使わない。STICKY_KEYWORDS(確定/突入/RUSH/昇格/継続/
 *     CONTINUE)も誤読み防止のため避けている。
 */

export default [
  // ── A. Macie 機密データスキャン予告 ──────────────────────────────
  // IDEAS.md 2章「機密データをスキャン中…」→重要データ発見は実はアツい、の系統。
  {
    id: 'ys_macie_scan_weak',
    name: '【弱】Macie機密データスキャン予告(該当なしで終わる)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'SCANNING…', sub: 'Macieが機密データを検索中', color: '#8ad4ff', ms: 650 } },
      { at: 20,  layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',  params: { text: 'NO FINDING', sub: 'Amazon Macie — 該当する機密データは無かった', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'ys_macie_scan_mid',
    name: '【中】Macie機密データスキャン予告(機密情報を検出)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'text',    params: { text: 'SCANNING…', sub: 'S3バケットを走査中', color: '#ffe066', ms: 600 } },
      { at: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'countdown_tick' } },
      { waitFor: 'stop3', layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 200, y: 200, count: 14 } },
      { waitFor: 'stop3', after: 20, layer: 'sfx',  action: 'synth',   params: { preset: 'alarm_beep' } },
      { waitFor: 'stop3', after: 200, layer: 'lcd',  action: 'text',    params: { text: 'SENSITIVE DATA FOUND', sub: 'Amazon Macie — S3 から機密情報を検出した', color: '#ff8a00', ms: 1000 } },
    ],
  },

  // ── B. Security Hub 検出結果集約ステップアップ予告 ───────────────
  // 検出結果が集約されてスコアが上がっていく段階演出(IDEAS.md 2章)。
  {
    id: 'ys_securityhub_score_weak',
    name: '【弱】Security Hubスコア予告(1段どまり)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'step_up', step: 1 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',  params: { text: 'FINDINGS 3', sub: 'Security Hub 検出結果', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'ys_securityhub_score_mid',
    name: '【中】Security Hubスコア予告(3段まで一気に集約)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth',   params: { preset: 'checklist_ok' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 2 } },
      { waitFor: 'stop2', layer: 'sfx', action: 'synth', params: { preset: 'checklist_ok' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 3, ms: 1400 } },
      { waitFor: 'stop3', after: 160, layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 220, layer: 'lcd', action: 'text',
        params: { text: 'SCORE 98', sub: 'AWS Security Hub — 検出結果が一気に集約された', color: '#ffe066', ms: 1100 } },
    ],
  },

  // ── C. Inspector 脆弱性スキャン予告 ───────────────────────────────
  // 「不穏だけど実はアツい」系。CRITICAL の赤文字で不安を煽ってから期待させる。
  {
    id: 'ys_inspector_finding_mid',
    name: '【中】Inspector脆弱性スキャン予告(重大な検出で不穏にアツい)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'text',    params: { text: 'SCANNING…', sub: 'Inspectorが脆弱性を検査中', color: '#ffe066', ms: 600 } },
      { at: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'countdown_tick' } },
      { waitFor: 'stop3', layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 220, y: 200, count: 14 } },
      { waitFor: 'stop3', after: 30, layer: 'sfx',  action: 'synth',   params: { preset: 'error_buzz' } },
      { waitFor: 'stop3', after: 200, layer: 'lcd',  action: 'text',    params: { text: 'CRITICAL FINDING', sub: '重大な脆弱性を検出', color: '#ff5a5a', ms: 1000 } },
    ],
  },

  // ── D. Detective 調査グラフ予告(本物/ガセ) ────────────────────────
  // 調査グラフが繋がっていき、真犯人(=当選)に到達する(IDEAS.md 2章)。
  {
    id: 'ys_detective_graph_hit',
    name: 'Detective調査グラフ予告(本物・最上位レア役で全経路が繋がる)',
    when: { event: 'leverOn', flag: ['SHARK', 'GHOST'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 130, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 40,  layer: 'char', action: 'pose',   params: { char: 'kiro', pose: 'surprised' } },
      { at: 60,  layer: 'lcd',  action: 'text',   params: { text: 'INVESTIGATING…', sub: 'Detectiveが行動履歴を追跡中', color: '#ffe066', ms: 650 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'particles', params: { preset: 'stream', x: 200, y: 200, count: 10 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'particles', params: { preset: 'stream', x: 200, y: 200, count: 14 } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'particles', params: { preset: 'spark', x: 200, y: 200, count: 18 } },
      { waitFor: 'stop3', after: 150, layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 200, layer: 'overlay', action: 'flash', params: { color: '#ff8a00', ms: 200 } },
      { waitFor: 'stop3', after: 260, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'happy' } },
      { waitFor: 'stop3', after: 300, layer: 'lcd', action: 'text',
        params: { text: 'ROOT CAUSE FOUND', sub: 'すべての経路がここに繋がった', color: '#ff8a00', ms: 1200 } },
    ],
  },
  {
    id: 'ys_detective_graph_gase',
    name: '【ガセ】Detective調査グラフ予告(通常ハズレ・ベルでも出るが糸が切れる)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    chance: 0.03,
    duration: 2200,
    cues: [
      { at: 0,  layer: 'sfx', action: 'synth', params: { preset: 'charge_up', gain: 0.6 } },
      { at: 60, layer: 'lcd', action: 'text',  params: { text: 'INVESTIGATING…', sub: 'Detectiveが行動履歴を追跡中', color: '#8ad4ff', ms: 650 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'particles', params: { preset: 'stream', x: 200, y: 200, count: 8 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'particles', params: { preset: 'stream', x: 200, y: 200, count: 8 } },
      { waitFor: 'stop3', after: 150, layer: 'sfx', action: 'synth', params: { preset: 'error_buzz', gain: 0.5 } },
      // U78: 「手がかりの糸」は液晶に描かれる調査グラフの線を指した言い方で、
      //      絵を見ていないと通じない。サービス名 + 何ができなかったかを書く
      { waitFor: 'stop3', after: 200, layer: 'lcd', action: 'text',
        params: { text: 'TRACE LOST', sub: 'Detective — 原因までたどり着けなかった', color: '#8ad4ff', ms: 1000 } },
    ],
  },

  // ── E. Cognito ログイン→MFA突破予告(本物/ガセ) ───────────────────
  // ログイン画面風→「認証成功」の格で期待度。MFA突破は激アツ(IDEAS.md 2章)。
  {
    id: 'ys_cognito_mfa_hit',
    name: 'Cognito MFA予告(本物・強レア役でMFAを突破)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE', 'SHARK'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 110, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'rare_flag' } },
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,  layer: 'lcd',  action: 'text',  params: { text: 'AUTHENTICATING…', sub: 'Cognitoでログイン中', color: '#ffe066', ms: 600 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'text', params: { text: 'MFA CHALLENGE', sub: '追加認証を要求された', color: '#ffe066', ms: 700 } },
      { waitFor: 'stop1', layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop3', after: 100, layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit' } },
      { waitFor: 'stop3', after: 120, layer: 'overlay', action: 'flash', params: { color: '#7bf7d0', ms: 220 } },
      { waitFor: 'stop3', after: 160, layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { waitFor: 'stop3', after: 220, layer: 'lcd',     action: 'text',
        params: { text: 'MFA VERIFIED', sub: '認証を突破した', color: '#7bf7d0', ms: 1200 } },
    ],
  },
  {
    id: 'ys_cognito_mfa_gase',
    name: '【ガセ】Cognito MFA予告(弱チェリー/スイカでもMFAで弾かれる)',
    when: { event: 'leverOn', flag: ['WEAK_CHERRY', 'MELON'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 40, default: 0 },
    chance: 0.05,
    duration: 2200,
    cues: [
      { at: 0,  layer: 'sfx', action: 'synth', params: { preset: 'rare_flag', gain: 0.6 } },
      { at: 60, layer: 'lcd', action: 'text',  params: { text: 'AUTHENTICATING…', sub: 'Cognitoでログイン中', color: '#8ad4ff', ms: 600 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'text', params: { text: 'MFA CHALLENGE', sub: '追加認証を要求された', color: '#8ad4ff', ms: 700 } },
      { waitFor: 'stop3', after: 150, layer: 'sfx', action: 'synth', params: { preset: 'error_buzz' } },
      { waitFor: 'stop3', after: 200, layer: 'lcd', action: 'text',
        params: { text: 'MFA DENIED', sub: 'ここで弾かれた', color: '#8ad4ff', ms: 1000 } },
    ],
  },

  // ── F. API Gateway レート制限解除予告 ─────────────────────────────
  {
    id: 'ys_apigateway_throttle_mid',
    name: '【中】API Gatewayレート制限予告(429から200 OKへ)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 60, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'lcd',  action: 'anim',    params: { anim: 'health_check', ok: false, label: 'THROTTLED' } },
      { at: 40,   layer: 'sfx',  action: 'synth',   params: { preset: 'health_check' } },
      { waitFor: 'stop1',  layer: 'lcd',  action: 'anim',    params: { anim: 'health_check', ok: true, label: '200 OK' } },
      { waitFor: 'stop1', after: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'checklist_ok' } },
      { waitFor: 'stop3', layer: 'lcd',  action: 'text',    params: { text: 'RATE LIMIT解除', sub: 'API Gatewayが通過を許可した', color: '#ffe066', ms: 900 } },
    ],
  },

  // ── G. Transit Gateway 経路集約予告 ──────────────────────────────
  {
    id: 'ys_transitgw_route_mid',
    name: '【中】Transit Gateway経路集約予告(複数経路が1本に)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,  layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,  layer: 'sfx',  action: 'synth',   params: { preset: 'charge_up' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 2 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 3, ms: 1300 } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'ROUTE MERGED', sub: '経路がすべて1本に集約された', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── H. Direct Connect 専用線直結予告(本物/ガセ) ──────────────────
  // 専用線がつながる→直結=直撃示唆(IDEAS.md 2章)。
  {
    id: 'ys_directconnect_link_hit',
    name: 'Direct Connect専用線予告(本物・最上位レア役で直結)',
    when: { event: 'leverOn', flag: ['SHARK', 'GHOST'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 140, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,  layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,  layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 60, layer: 'lcd',  action: 'text',  params: { text: 'ESTABLISHING LINK…', sub: '専用線を敷設中', color: '#ffe066', ms: 600 } },
      { waitFor: 'stop2', layer: 'reelfx', action: 'highlight', params: { ms: 500, color: '#ffe066' } },
      { waitFor: 'stop3', layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit' } },
      { waitFor: 'stop3', layer: 'overlay', action: 'shake',  params: { power: 12, ms: 320 } },
      { waitFor: 'stop3', after: 80,  layer: 'overlay', action: 'flash', params: { color: '#ff8a00', ms: 240 } },
      { waitFor: 'stop3', after: 140, layer: 'lcd',     action: 'text',
        params: { text: '1:1 DIRECT CONNECT', sub: 'インターネットを経由せず直結した', color: '#ff8a00', ms: 1200 } },
    ],
  },
  {
    id: 'ys_directconnect_link_gase',
    name: '【ガセ】Direct Connect専用線予告(通常ハズレ・リプレイでも出るが開通しない)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    chance: 0.025,
    duration: 2100,
    cues: [
      { at: 0,  layer: 'sfx', action: 'synth', params: { preset: 'charge_up', gain: 0.6 } },
      { at: 60, layer: 'lcd', action: 'text',  params: { text: 'ESTABLISHING LINK…', sub: '専用線を敷設中', color: '#8ad4ff', ms: 600 } },
      { waitFor: 'stop3', after: 150, layer: 'sfx', action: 'synth', params: { preset: 'error_buzz' } },
      { waitFor: 'stop3', after: 200, layer: 'lcd', action: 'text',
        params: { text: 'LINK DOWN', sub: 'AWS Direct Connect — 専用線は開通できなかった', color: '#8ad4ff', ms: 900 } },
    ],
  },

  // ── I. PrivateLink プライベート接続確立予告 ───────────────────────
  {
    id: 'ys_privatelink_connect_mid',
    name: '【中】PrivateLink接続予告(インターネットを経由せず直結)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'anim',    params: { anim: 'health_check', ok: true, label: 'CONNECTED' } },
      { at: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'health_check' } },
      { waitFor: 'stop3', layer: 'lcd',  action: 'text',    params: { text: 'PRIVATE接続', sub: 'AWS PrivateLink — インターネットを経由せず繋がった', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── J. Network Firewall パケット検査予告 ─────────────────────────
  {
    id: 'ys_netfirewall_scan_weak',
    name: '【弱】Network Firewall検査予告(異常なしで終わる)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1000,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'INSPECTING…', sub: 'パケットを検査中', color: '#8ad4ff', ms: 600 } },
      { at: 40,  layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',  params: { text: 'PASS', sub: 'AWS Network Firewall — 通信に異常なし', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'ys_netfirewall_scan_mid',
    name: '【中】Network Firewall検査予告(不審な通信を大量ブロック)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',     action: 'text',    params: { text: 'INSPECTING…', sub: 'パケットを検査中', color: '#ffe066', ms: 600 } },
      { at: 40,  layer: 'sfx',     action: 'synth',   params: { preset: 'countdown_tick' } },
      { waitFor: 'stop3', layer: 'overlay', action: 'shake',   params: { power: 8, ms: 220 } },
      { waitFor: 'stop3', after: 10, layer: 'sfx',     action: 'synth',   params: { preset: 'error_buzz' } },
      { waitFor: 'stop3', after: 50, layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 200, y: 200, count: 16 } },
      { waitFor: 'stop3', after: 200, layer: 'lcd',     action: 'text',    params: { text: 'BLOCKED', sub: '不審な通信を大量に遮断', color: '#ff8a00', ms: 1000 } },
    ],
  },

  // ── K. Site-to-Site VPN トンネル確立予告 ─────────────────────────
  {
    id: 'ys_s2svpn_tunnel_mid',
    name: '【中】Site-to-Site VPN予告(トンネルが確立)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'lcd',  action: 'anim',    params: { anim: 'health_check', ok: false, label: 'HANDSHAKE' } },
      { at: 40,   layer: 'sfx',  action: 'synth',   params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1',  layer: 'lcd',  action: 'anim',    params: { anim: 'health_check', ok: true, label: 'TUNNEL UP' } },
      { waitFor: 'stop1', after: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'health_check' } },
      { waitFor: 'stop3', layer: 'lcd',  action: 'text',    params: { text: 'VPN TUNNEL確立', sub: '2本の経路が繋がった', color: '#ffe066', ms: 900 } },
    ],
  },

  // ── L. Firewall Manager ポリシー一括適用予告 ─────────────────────
  {
    id: 'ys_firewallmgr_policy_mid',
    name: '【中】Firewall Managerポリシー予告(全アカウントへ一括適用)',
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
        params: { text: 'POLICY適用完了', sub: '全アカウントへ一括適用', color: '#ffe066', ms: 1100 } },
    ],
  },

  /* ── M. ACM 証明書の自動更新予告 ───────────────────────────────────
   *
   * ── 2026-08-15 ユーザー指示 U64-5「ACM前兆を前向きに」──────────────
   * 旧: 「証明書 残り3日 / 有効期限が近づいている」「このままでは失効する」
   *   → 失効の不安を煽る画だった。ACM の実際の値打ちは
   *     **黙っていても自動で更新してくれる**ところにあるので、
   *     「危ない」ではなく「ACM が更新してくれた」= 片付いた画へ作り替えた。
   * 弱 = 更新が1本走った / 中 = 更新が全部片付いた、という濃さの差だけを持たせる。
   * data/scenarios/yokoku-batch5.js の yb5_acm_renew_weak と
   * data/quiz.js の豆知識(AWS Certificate Manager)も同じ「自動更新」の話に揃えてある。
   */
  {
    id: 'ys_acm_cert_weak',
    name: '【弱】ACM証明書予告(自動更新が1本走った)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'ACM 自動更新', sub: 'HTTPS 証明書を ACM が更新した', color: '#8ad4ff', ms: 700 } },
      { at: 40,  layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',  params: { text: '更新は1本だけ', sub: 'ACM — 自動更新は1枚で終わった', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'ys_acm_cert_mid',
    name: '【中】ACM証明書予告(自動更新がまとめて完了)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'text',    params: { text: 'ACM DNS検証 完了', sub: '更新の手続きが自動で進んでいる', color: '#ffe066', ms: 600 } },
      { at: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'ui_select' } },
      { waitFor: 'stop3', layer: 'sfx',  action: 'synth',   params: { preset: 'contract_sign' } },
      { waitFor: 'stop3', after: 50, layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 200, y: 200, count: 14 } },
      { waitFor: 'stop3', after: 200, layer: 'lcd',  action: 'text',    params: { text: '証明書更新完了', sub: 'ACM が全部まとめて差し替えた', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── N. Secrets Manager ローテーション予告 ────────────────────────
  // 鍵が光って回転すれば強(IDEAS.md 2-25)。
  {
    id: 'ys_secretsmgr_rotate_mid',
    name: '【中】Secrets Managerローテーション予告(鍵が新しく切り替わる)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'text',    params: { text: 'ROTATING KEY…', sub: '鍵を自動ローテーション中', color: '#ffe066', ms: 650 } },
      { at: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'countdown_tick' } },
      { waitFor: 'stop3', layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 200, y: 200, count: 14 } },
      { waitFor: 'stop3', after: 30, layer: 'sfx',  action: 'synth',   params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 150, layer: 'lcd',  action: 'text',    params: { text: '鍵交換完了', sub: 'Secrets Manager — 新しい鍵に切り替わった', color: '#ffe066', ms: 1000 } },
    ],
  },
];
