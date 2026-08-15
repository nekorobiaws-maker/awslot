/**
 * 開発者ツール・アプリ系の弱〜強予告シナリオ集(担当: 演出量産第3弾)。
 * DESIGN.md 6.5 / IDEAS.md 2章。ID はすべて yd_ プレフィックス。
 *
 * まだ演出に登場していない AWS サービス
 *   CodeBuild / CodeArtifact / Amazon Q Developer / DevOps Guru / CDK / Amplify /
 *   AppSync / EventBridge Scheduler / Systems Manager / AWS Config /
 *   Service Catalog / AWS SAM / CloudShell / License Manager
 * を題材にする(全ファイル grep 済み)。CodeDeploy / X-Ray は
 * yokoku-gimmick.js・zencho.js で、CodePipeline / CloudFormation は未使用のまま
 * 残っているが今回は対象外、
 * API Gateway は yokoku-secnet.js の「API Gatewayレート制限予告」で既出のため
 * それぞれ対象から外した。
 *
 * ■ 【題材の差し替え】提供終了サービスを画面から外した(2026-08-16 しおん指摘)
 *   ・C. CodeGuru Reviewer → **Amazon Q Developer**(新規利用の受付が終了したため)
 *   ・L. AWS Proton        → **AWS SAM**(新規受付が終了したため)
 *   学習台で「もう始められないサービス」を覚えさせるのは害なので題材ごと替えた。
 *   **id(yd_codeguru_* / yd_proton_*)は互換のため据え置き**。IDだけが旧題材の名残で、
 *   画面に出る文言・name はすべて新しい題材に揃えてある。
 *   Amazon Q は yokoku-ai.js のチャット予告と同名だが、あちらは「AIアシスタントに質問」、
 *   こちらは「AI がコードをレビュー」で見せ場が別。CodeGuru Reviewer の後継でもある。
 *
 * 既存の演出語彙(lcdanims / lcdanims-extra / particles / sfx-presets /
 * キャラポーズ)の組み合わせだけで構成する。新規アニメ実装は一切不要。
 * 新しい AWS サービス名を画面に出す専用アニメは無いので、ほぼ全編を
 * lcd.text(自由記述テキスト)+ sfx.synth + particles/flash/shake の
 * 組み合わせで作り、既存コードベースの慣例どおり汎用アニメを label/sub
 * 差し替えで使い回す(yokoku-infra.js の Outposts=reserved_sign / Braket=cw_meter_swing
 * 転用と同じ流儀):
 *   - step_up(3灯)                    … CodeBuild のビルド段階(BUILD/TEST/PACKAGE)
 *   - checklist_green(index)           … Amazon Q Developer の指摘解消 / Systems Manager の
 *                                         Run Command 実行状況 / Service Catalog の
 *                                         プロビジョニング項目
 *   - pillar_raise(index,count)        … AWS SAM のスタック配備(リソースが1つずつ立つ)
 *   - cw_meter_swing(label/sub可変)    … Amplify push の進捗ゲージ / License Manager
 *                                         のライセンス使用率ゲージ
 *   - health_check(label可変)          … AppSync のサブスクリプション接続確認
 *   - ttl_zero                         … EventBridge Scheduler のカウントダウン着地
 *   - reserved_sign(label可変)         … License Manager のライセンス確保(契約書)
 *
 * ■ deploy_progress / sfn_task を使わない理由
 *   deploy_progress は 'DEPLOYING…' / 'DEPLOY SUCCEEDED' / 'ROLLBACK' という
 *   固定文言を描く(yokoku-gimmick.js の CodeDeploy 専用)。CodeBuild や Amplify push
 *   にそのまま流用すると「デプロイ完了」という別サービスの断言が混ざるため、
 *   本ファイルでは避け、進捗はすべて lcd.text の独自パーセンテージ表記に統一した。
 *
 * ■ 「途中経過まで」に留めたサービス(CodeBuild / Amplify / Service Catalog / AWS SAM)
 *   ユーザー指示どおり、ビルド/デプロイ系のプログレスは常に「PROGRESS 表示のまま
 *   終わる」形にしてある(結末を出すと当落断言になるため)。結末を出すには前兆の
 *   当落確定イベント(zencho_end ENTRY/MISS)に新しい pattern 値で紐付ける必要があるが、
 *   それには game/modes/freetier.js・data/scenarios/zencho.js の編集が要り、本タスクは
 *   新規ファイル1つのみ(他ファイル編集禁止)なので見送った。
 *
 * 期待度の作り方は yokoku-light.js / yokoku-secnet.js に合わせる:
 *   - 「弱」= when.flag に LOSE/BELL/REPLAY を含め chance で間引く(ガセ寄り)。
 *     否定的・停滞した結末には match:{'modeState.zenchoActive':[false]} を付け、
 *     前兆(zencho)進行中に「進まなかった/なかった」と矛盾して出ないようにする。
 *   - 「中」= when.rare か when.flag(STRONG_CHERRY/CHANCE 等)のみで chance なし
 *     (レア役成立時だけ出現)。
 *   - DevOps Guru / CDK だけは「本物/ガセ」ペア(secnet.js の Detective/Cognito と同格)。
 *     本物は SHARK・GHOST 級の最上位レア役、ガセは低 chance の弱役側に置く。
 *   - すべて mode:['FREE_TIER'] に限定し、weight は { FREE_TIER: N, default: 0 }
 *     の形で明示する(director のフォールバック weight:10 に巻き込まれないため)。
 *   - ゲームの抽選 RNG は一切参照しない。chance は director 側の演出専用ダイス
 *     (staging 層のみで完結)であり、実際の当否には影響しない。
 *   - 「BONUS」を含む文言、STICKY_KEYWORDS(確定/突入/RUSH/昇格/継続/CONTINUE)は
 *     一切使わない。各サービス自身の作業完了(パッケージ公開・鍵ではなくライセンス
 *     確保・ポリシー適用など)を示す表現は既存ファイルの慣例(yokoku-secnet.js の
 *     「鍵交換完了」「POLICY適用完了」等)にならって使うが、ゲームの当落そのものを
 *     断言する語(SUCCEEDED / DEPLOYED 等)は避けている。
 */

export default [
  // ── A. CodeBuild ビルドログ進行予告(途中経過のみ) ────────────────
  {
    id: 'yd_codebuild_progress_weak',
    name: '【弱】CodeBuildビルド予告(コンパイル序盤で止まる)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1300,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'BUILD STARTED', sub: 'CodeBuildが起動した', color: '#8ad4ff', ms: 500 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',  params: { anim: 'step_up', step: 1 } },
      { waitFor: 'stop3', after: 250, layer: 'lcd', action: 'text',  params: { text: 'COMPILING 38%', sub: 'AWS CodeBuild — コンパイルの途中で止まった', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'yd_codebuild_progress_mid',
    name: '【中】CodeBuildビルド予告(テスト直前まで一気に進む)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'text',    params: { text: 'BUILD STARTED', sub: 'ビルドキューが動いた', color: '#ffe066', ms: 500 } },
      { at: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'dynamo_scale' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 2 } },
      { waitFor: 'stop2', layer: 'sfx', action: 'synth', params: { preset: 'checklist_ok' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 3, ms: 1300 } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'COMPILING 92%', sub: 'AWS CodeBuild — テスト直前まで進んだ', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── B. CodeArtifact パッケージ公開予告 ────────────────────────────
  {
    id: 'yd_codeartifact_publish_weak',
    name: '【弱】CodeArtifactパッケージ公開予告(1件だけ)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1000,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'PUBLISHING…', sub: 'AWS CodeArtifact — パッケージを公開中', color: '#8ad4ff', ms: 550 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',  params: { text: 'PACKAGE ×1', sub: 'AWS CodeArtifact — パッケージは1件だけ公開された', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'yd_codeartifact_publish_mid',
    name: '【中】CodeArtifactパッケージ公開予告(依存関係も一気に解決)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'text',    params: { text: 'PUBLISHING…', sub: 'AWS CodeArtifact — 複数パッケージを公開中', color: '#ffe066', ms: 600 } },
      { at: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'announce' } },
      { waitFor: 'stop3', layer: 'lcd',  action: 'particles', params: { preset: 'stream', x: 200, y: 200, count: 12 } },
      { waitFor: 'stop3', after: 20, layer: 'sfx',  action: 'synth',   params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 200, layer: 'lcd',  action: 'text',    params: { text: 'PACKAGE ×5', sub: 'AWS CodeArtifact — 依存関係もすべて解決した', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── C. Amazon Q Developer コードレビュー予告(id は旧 CodeGuru のまま据え置き)──
  {
    id: 'yd_codeguru_review_weak',
    name: '【弱】Amazon Q Developerコードレビュー予告(軽微な指摘が残る)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'REVIEWING…', sub: 'Amazon Q Developer — AI がコードをレビュー中', color: '#8ad4ff', ms: 600 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',  params: { text: 'FINDING ×1', sub: 'Amazon Q Developer — 軽微な指摘が1件残った', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'yd_codeguru_review_mid',
    name: '【中】Amazon Q Developerコードレビュー予告(指摘がすべて解消)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'lcd',  action: 'text',    params: { text: 'REVIEWING…', sub: 'Amazon Q Developer — AI がコードをレビュー中', color: '#ffe066', ms: 600 } },
      { at: 40,   layer: 'sfx',  action: 'synth',   params: { preset: 'countdown_tick' } },
      { waitFor: 'stop3',  layer: 'lcd',  action: 'anim',    params: { anim: 'checklist_green', index: 1 } },
      { waitFor: 'stop3', after: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'checklist_ok' } },
      { waitFor: 'stop3', after: 200,  layer: 'lcd',  action: 'anim',    params: { anim: 'checklist_green', index: 2 } },
      { waitFor: 'stop3', after: 240,  layer: 'sfx',  action: 'synth',   params: { preset: 'checklist_ok' } },
      { waitFor: 'stop3', after: 400, layer: 'lcd',  action: 'text',    params: { text: 'ALL RESOLVED', sub: 'Amazon Q Developer — 指摘がすべて解消した', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── D. DevOps Guru インサイト検出予告(本物/ガセ) ──────────────────
  {
    id: 'yd_devopsguru_insight_hit',
    name: 'DevOps Guruインサイト予告(本物・最上位レア役で重大度CRITICAL)',
    when: { event: 'leverOn', flag: ['SHARK', 'GHOST'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 130, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 40,  layer: 'char', action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 60,  layer: 'lcd',  action: 'text',  params: { text: 'INSIGHT DETECTED', sub: 'DevOps Guruが異常を検知', color: '#ffe066', ms: 650 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'particles', params: { preset: 'spark', x: 200, y: 200, count: 16 } },
      { waitFor: 'stop3', after: 120, layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { waitFor: 'stop3', after: 150, layer: 'overlay', action: 'flash', params: { color: '#ff8a00', ms: 220 } },
      { waitFor: 'stop3', after: 200, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { waitFor: 'stop3', after: 260, layer: 'lcd',     action: 'text',
        params: { text: 'SEVERITY: HIGH', sub: 'Amazon DevOps Guru — 見過ごせない規模の異常', color: '#ff8a00', ms: 1200 } },
    ],
  },
  {
    id: 'yd_devopsguru_insight_gase',
    name: '【ガセ】DevOps Guruインサイト予告(通常ハズレでも出るが重大度LOW)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 45, default: 0 },
    chance: 0.03,
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'charge_up', gain: 0.6 } },
      { at: 60,  layer: 'lcd', action: 'text',  params: { text: 'INSIGHT DETECTED', sub: 'DevOps Guruが異常を検知', color: '#8ad4ff', ms: 650 } },
      { waitFor: 'stop3', after: 150, layer: 'sfx', action: 'synth', params: { preset: 'checklist_ok' } },
      { waitFor: 'stop3', after: 200, layer: 'lcd', action: 'text',
        params: { text: 'SEVERITY: LOW', sub: 'Amazon DevOps Guru — 異常は自動で解消された', color: '#8ad4ff', ms: 1000 } },
    ],
  },

  // ── E. CDK diff 差分予告(本物/ガセ) ───────────────────────────────
  {
    id: 'yd_cdk_diff_hit',
    name: 'CDK diff予告(本物・最上位レア役でかつてない差分)',
    when: { event: 'leverOn', flag: ['SHARK', 'GHOST'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 140, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,  layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,  layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 60, layer: 'lcd',  action: 'text',  params: { text: 'cdk diff 実行中…', sub: 'スタックを比較しています', color: '#ffe066', ms: 600 } },
      { waitFor: 'stop2', layer: 'reelfx', action: 'highlight', params: { ms: 500, color: '#ffe066' } },
      { waitFor: 'stop3', layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit' } },
      { waitFor: 'stop3', layer: 'overlay', action: 'shake',  params: { power: 12, ms: 320 } },
      { waitFor: 'stop3', after: 80,  layer: 'overlay', action: 'flash', params: { color: '#ff8a00', ms: 240 } },
      { waitFor: 'stop3', after: 140, layer: 'lcd',     action: 'text',
        params: { text: '+42 resources 差分', sub: 'AWS CDK — かつてない規模の構成変更', color: '#ff8a00', ms: 1200 } },
    ],
  },
  {
    id: 'yd_cdk_diff_gase',
    name: '【ガセ】CDK diff予告(通常ハズレでも出るが差分なし)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 45, default: 0 },
    chance: 0.025,
    duration: 2100,
    cues: [
      { at: 0,  layer: 'sfx', action: 'synth', params: { preset: 'charge_up', gain: 0.6 } },
      { at: 60, layer: 'lcd', action: 'text',  params: { text: 'cdk diff 実行中…', sub: 'スタックを比較しています', color: '#8ad4ff', ms: 600 } },
      { waitFor: 'stop3', after: 150, layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.6 } },
      { waitFor: 'stop3', after: 200, layer: 'lcd', action: 'text',
        params: { text: 'There were no differences', sub: 'AWS CDK — 構成に差分はなかった', color: '#8ad4ff', ms: 900 } },
    ],
  },

  // ── F. Amplify push 進行予告(途中経過のみ) ───────────────────────
  {
    id: 'yd_amplify_push_weak',
    name: '【弱】Amplify push予告(3割どまり)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1400,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'amplify push', sub: 'デプロイを開始した', color: '#8ad4ff', ms: 550 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim',  params: { anim: 'cw_meter_swing', to: 0.32, over: false, label: 'PUSH PROGRESS', sub: 'HOSTING', ms: 900 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',  params: { text: 'PUSHING 32%', sub: 'AWS Amplify — 反映はまだ途中', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'yd_amplify_push_mid',
    name: '【中】Amplify push予告(8割まで一気に進む)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'lcd',  action: 'text',    params: { text: 'amplify push', sub: 'ホスティングを更新中', color: '#ffe066', ms: 600 } },
      { at: 40,   layer: 'sfx',  action: 'synth',   params: { preset: 'dynamo_scale' } },
      { waitFor: 'stop1',  layer: 'lcd',  action: 'anim',    params: { anim: 'cw_meter_swing', to: 0.81, over: false, label: 'PUSH PROGRESS', sub: 'HOSTING', ms: 1600 } },
      { waitFor: 'stop3', layer: 'lcd',  action: 'text',    params: { text: 'PUSHING 81%', sub: 'AWS Amplify — あと少しで反映される', color: '#ffe066', ms: 900 } },
    ],
  },

  // ── G. AppSync サブスクリプション接続予告 ─────────────────────────
  {
    id: 'yd_appsync_subscribe_weak',
    name: '【弱】AppSync接続予告(未接続のまま)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1000,
    cues: [
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'health_check', ok: false, label: 'SUBSCRIBING' } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'health_check', gain: 0.5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',  params: { text: 'PENDING', sub: 'AWS AppSync — まだ接続できていない', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'yd_appsync_subscribe_mid',
    name: '【中】AppSync接続予告(GraphQL接続が確立)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'anim',    params: { anim: 'health_check', ok: true, label: 'SUBSCRIBED' } },
      { at: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'health_check' } },
      { waitFor: 'stop3', layer: 'lcd',  action: 'text',    params: { text: 'GraphQL接続確立', sub: 'リアルタイム同期が繋がった', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── H. EventBridge Scheduler カウントダウン予告 ───────────────────
  {
    id: 'yd_evbscheduler_countdown_weak',
    name: '【弱】EventBridge Schedulerカウントダウン予告(延期される)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1300,
    cues: [
      { at: 0,    layer: 'lcd', action: 'text',  params: { text: 'SCHEDULE 5秒前', sub: 'EventBridge Scheduler — 次の実行を待機中', color: '#8ad4ff', ms: 500 } },
      { at: 30,   layer: 'sfx', action: 'synth', params: { preset: 'ttl_tick', gain: 0.5 } },
      { waitFor: 'stop1',  layer: 'lcd', action: 'text',  params: { text: 'SCHEDULE 3秒前', sub: 'EventBridge Scheduler — カウントダウン中', color: '#8ad4ff', ms: 500 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',  params: { text: '延期', sub: 'EventBridge Scheduler — 今回は実行されず', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'yd_evbscheduler_countdown_mid',
    name: '【中】EventBridge Schedulerカウントダウン予告(ゼロ着地でルール実行)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'sfx',  action: 'synth',   params: { preset: 'ttl_tick' } },
      { at: 0,    layer: 'lcd',  action: 'text',    params: { text: 'SCHEDULE 3秒前', sub: 'EventBridge Scheduler — カウントダウン中', color: '#ffe066', ms: 500 } },
      { waitFor: 'stop1',  layer: 'sfx',  action: 'synth',   params: { preset: 'ttl_tick' } },
      { waitFor: 'stop1',  layer: 'lcd',  action: 'text',    params: { text: 'SCHEDULE 1秒前', sub: 'EventBridge Scheduler — まもなく実行', color: '#ffe066', ms: 500 } },
      { waitFor: 'stop2', layer: 'lcd',  action: 'anim',    params: { anim: 'ttl_zero', ms: 1000 } },
      { waitFor: 'stop2', after: 20, layer: 'sfx',  action: 'synth',   params: { preset: 'ttl_zero' } },
      { waitFor: 'stop3', layer: 'lcd',  action: 'text',    params: { text: 'SCHEDULE FIRED', sub: 'EventBridge Scheduler — 予定どおり実行された', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── I. Systems Manager Run Command 実行予告 ───────────────────────
  {
    id: 'yd_ssm_runcommand_weak',
    name: '【弱】Systems Manager Run Command予告(1台だけ完了)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'RUN COMMAND', sub: 'コマンドを配信中', color: '#8ad4ff', ms: 550 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',  params: { text: '1 / 3 実行完了', sub: 'SSM Run Command — まだ全部は終わってない', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'yd_ssm_runcommand_mid',
    name: '【中】Systems Manager Run Command予告(全台へ反映)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'lcd',  action: 'text',    params: { text: 'RUN COMMAND', sub: '全インスタンスへ配信中', color: '#ffe066', ms: 600 } },
      { at: 40,   layer: 'sfx',  action: 'synth',   params: { preset: 'countdown_tick' } },
      { waitFor: 'stop3',  layer: 'lcd',  action: 'anim',    params: { anim: 'checklist_green', index: 1 } },
      { waitFor: 'stop3', after: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'checklist_ok' } },
      { waitFor: 'stop3', after: 200,  layer: 'lcd',  action: 'anim',    params: { anim: 'checklist_green', index: 2 } },
      { waitFor: 'stop3', after: 240,  layer: 'sfx',  action: 'synth',   params: { preset: 'checklist_ok' } },
      { waitFor: 'stop3', after: 400, layer: 'lcd',  action: 'anim',    params: { anim: 'checklist_green', index: 3 } },
      { waitFor: 'stop3', after: 440, layer: 'sfx',  action: 'synth',   params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 600, layer: 'lcd',  action: 'text',    params: { text: '3 / 3 実行完了', sub: '全インスタンスに反映', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── J. AWS Config 構成変更検出予告 ────────────────────────────────
  {
    id: 'yd_awsconfig_drift_weak',
    name: '【弱】AWS Config構成変更予告(軽微な差分のみ)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'CONFIG RULE 評価中', sub: '構成変更を検出中', color: '#8ad4ff', ms: 600 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',  params: { text: 'NON_COMPLIANT ×1', sub: '軽微な差分のみ', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'yd_awsconfig_drift_mid',
    name: '【中】AWS Config構成変更予告(大量の変更を検出)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'text',    params: { text: 'CONFIG RULE 評価中', sub: '構成変更を検出中', color: '#ffe066', ms: 600 } },
      { at: 40,  layer: 'sfx',  action: 'synth',   params: { preset: 'countdown_tick' } },
      { waitFor: 'stop3', layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 200, y: 200, count: 14 } },
      { waitFor: 'stop3', after: 20, layer: 'sfx',  action: 'synth',   params: { preset: 'alarm_beep', gain: 0.6 } },
      { waitFor: 'stop3', after: 200, layer: 'lcd',  action: 'text',    params: { text: 'NON_COMPLIANT ×7', sub: '大量の構成変更を検出', color: '#ff8a00', ms: 1000 } },
    ],
  },

  // ── K. Service Catalog プロビジョニング予告(途中経過のみ) ────────
  {
    id: 'yd_servicecatalog_provision_weak',
    name: '【弱】Service Catalog起動予告(1/4で止まる)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 45, default: 0 },
    chance: 0.35,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'PRODUCT 起動中', sub: 'カタログから起動を要求', color: '#8ad4ff', ms: 550 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',  params: { anim: 'checklist_green', index: 1 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'text',  params: { text: 'PROVISIONING 1/4', sub: 'AWS Service Catalog — 起動は途中で止まっている', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'yd_servicecatalog_provision_mid',
    name: '【中】Service Catalog起動予告(3/4まで一気に進む)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,  layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,  layer: 'lcd',  action: 'text',    params: { text: 'PRODUCT 起動中', sub: 'カタログから起動を要求', color: '#ffe066', ms: 600 } },
      { at: 40, layer: 'sfx',  action: 'synth',   params: { preset: 'contract_sign' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'checklist_green', index: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'checklist_green', index: 2 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'checklist_green', index: 3, ms: 1300 } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'PROVISIONING 3/4', sub: 'AWS Service Catalog — あと1項目まで進んだ', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── L. AWS SAM サーバーレス配備予告(途中経過のみ / id は旧 Proton のまま据え置き)──
  {
    id: 'yd_proton_deploy_weak',
    name: '【弱】AWS SAM配備予告(1/4で止まる)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 45, default: 0 },
    chance: 0.35,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'SAM DEPLOY 中', sub: 'AWS SAM — 短いテンプレートでサーバーレスを配備', color: '#8ad4ff', ms: 600 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',  params: { anim: 'pillar_raise', index: 1, count: 4 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'text',  params: { text: 'STACK 1/4', sub: 'AWS SAM — 配備は途中で止まっている', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'yd_proton_deploy_mid',
    name: '【中】AWS SAM配備予告(3/4まで一気に配備)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,  layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,  layer: 'lcd',  action: 'text',    params: { text: 'SAM DEPLOY 中', sub: 'AWS SAM — 短いテンプレートでサーバーレスを配備', color: '#ffe066', ms: 600 } },
      { at: 40, layer: 'sfx',  action: 'synth',   params: { preset: 'dynamo_scale' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'pillar_raise', index: 1, count: 4 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'pillar_raise', index: 2, count: 4 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'pillar_raise', index: 3, count: 4, ms: 1300 } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'STACK 3/4', sub: 'AWS SAM — あと1つで配備完了', color: '#ffe066', ms: 1000 } },
    ],
  },

  // ── M. CloudShell ターミナル入力予告 ──────────────────────────────
  {
    id: 'yd_cloudshell_typing_weak',
    name: '【弱】CloudShellターミナル予告(当たり障りのないコマンド)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: '$ aws s3 ls', color: '#8ad4ff', ms: 500 } },
      { at: 30,  layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.4 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',  params: { text: '$ echo ok', sub: 'AWS CloudShell — 当たり障りのない操作で終わった', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'yd_cloudshell_typing_mid',
    name: '【中】CloudShellターミナル予告(台数を増やすコマンドが打たれる)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2600,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'lcd',  action: 'text',    params: { text: '$ aws ec2 run-instances', color: '#ffe066', ms: 550 } },
      { at: 40,   layer: 'sfx',  action: 'synth',   params: { preset: 'ui_select' } },
      { waitFor: 'stop1',  layer: 'lcd',  action: 'text',    params: { text: '$ aws autoscaling set-desired-capacity --desired-capacity 8', sub: '台数を増やす気配がする', color: '#ffe066', ms: 900 } },
      { waitFor: 'stop3', layer: 'sfx',  action: 'synth',   params: { preset: 'charge_up', gain: 0.6 } },
      { waitFor: 'stop3', after: 50, layer: 'lcd',  action: 'text',    params: { text: 'Enterキー待ち…', sub: 'AWS CloudShell — 実行するかはまだ分からない', color: '#ffe066', ms: 900 } },
    ],
  },

  // ── N. License Manager ライセンス使用率予告 ───────────────────────
  {
    id: 'yd_licensemgr_usage_weak',
    name: '【弱】License Manager使用率予告(まだ余裕がある)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.35,
    duration: 1300,
    cues: [
      { at: 0,    layer: 'lcd', action: 'anim',  params: { anim: 'cw_meter_swing', to: 0.55, over: false, label: 'LICENSE USE', sub: '残り枠を確認中', ms: 1200 } },
      { at: 30,   layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',  params: { text: 'License Manager — 残り枠あり', sub: '同時実行ライセンスは上限まで余裕', color: '#8ad4ff', ms: 500 } },
    ],
  },
  {
    id: 'yd_licensemgr_usage_mid',
    name: '【中】License Manager使用率予告(上限ぎりぎりで確保成功)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'lcd',  action: 'anim',    params: { anim: 'cw_meter_swing', to: 0.92, over: false, label: 'LICENSE USE', sub: '上限に接近中', ms: 1300 } },
      { at: 40,   layer: 'sfx',  action: 'synth',   params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', layer: 'sfx',  action: 'synth',   params: { preset: 'contract_sign' } },
      { waitFor: 'stop1', after: 50, layer: 'lcd',  action: 'anim',    params: { anim: 'reserved_sign', label: 'LICENSED', ms: 1400 } },
      { waitFor: 'stop3', layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 220, y: 150, count: 12 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd',  action: 'text',    params: { text: 'License Manager — 空き枠を確保', sub: '上限ぎりぎりで割当に成功', color: '#ffe066', ms: 1000 } },
    ],
  },
];
