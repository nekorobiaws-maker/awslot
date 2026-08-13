/**
 * AI・データ分析系AWSサービスの予告シナリオ集(担当ルナ)。DESIGN.md 6.5
 *
 * まだ演出に登場していなかった14サービス(Athena / Redshift / Glue / EMR /
 * SageMaker / Rekognition / Polly / Transcribe / Translate / Comprehend /
 * Textract / Amazon Q / OpenSearch / QuickSight)を題材にした通常時の
 * 弱〜強予告。既存シナリオ(scenarios/*)は grep 済みで、これらのサービス名は
 * 一件も出てこないことを確認してから書いている(quiz.js の decoy に
 * 'Redshift' が1件あるだけで、演出テーマとしては未使用)。
 *
 * ■ 語彙は6種類だけに絞っている
 *   新規アニメ実装はしない前提で、cues は
 *     lcd.text / (lcd|overlay).particles / overlay.flash / char(show/pose) /
 *     lamp.pattern / sfx.synth
 *   の組み合わせだけで構成する(lcd.anim・overlay.cutin は一切使わない)。
 *   AIサービスらしい「解析中→結果」の流れは、lcd.text を連投して
 *   ログが更新されていくように見せることで表現している
 *   (Bedrockタイピング予告のようなパネルUIは新規アニメが要るので使わない=見た目が別物になる)。
 *
 * 期待度の作り方は yokoku-light.js / yokoku-heavy.js を踏襲:
 *   - 弱  … when.flag に LOSE/BELL/REPLAY 等、weight 35〜60、chance で間引く
 *   - 中  … when.rare または STRONG_CHERRY/CHANCE、weight 40〜55、chance なし
 *   - 強  … hit(高期待度flag・weight90〜140) / gase(LOSE等・weight35〜50・低chance)
 *           のペアで、見た目は同じにして統計的にしか差が出ないようにしてある
 *           (yokoku-heavy.js の GuardDuty 等と同じ作法)
 *   すべて mode:['FREE_TIER'] 限定 + weight:{ FREE_TIER:N, default:0 } で明示。
 *   ゲーム抽選RNGは使わず、既存の flag/rare 判定に乗るだけ。
 *
 * ■ 「BONUS」「確定」「突入」等の sticky トリガー語は使わない
 *   このファイルのシナリオはどれも当選確定イベントではない(通常のleverOn予告)ため、
 *   lcdanims.js の STICKY_KEYWORDS / TEXT_CATEGORIES に触れる語(BONUS/確定/突入/RUSH/
 *   昇格/継続/CONTINUE/BIG/REG/ゴースト7/GHOST7 等)は書かない。Rekognitionの
 *   「ゴースト柄」演出も 'PHANTOM' という表記にして GHOST7 カテゴリに引っかからないようにしている。
 *
 * 依頼: src/data/scenarios/index.js に
 *   import yokokuAi from './yokoku-ai.js';
 *   ...SCENARIOS配列へ ...yokokuAi を追加
 * をお願いします(このファイル単体ではまだ読み込まれません)。
 */

export default [
  // ── Athena: クエリ実行→スキャン量が示唆する期待度 ──────────────────
  {
    id: 'ya_athena_scan_weak',
    name: '【弱】Athenaクエリ予告(スキャン量少なめでハズレ濃厚)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.6 } },
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'Athena: QUERY RUNNING…', color: '#8ad4ff', ms: 500 } },
      { at: 550, layer: 'lcd', action: 'text',  params: { text: 'SCAN 0.6GB — 0 HIT', color: '#8ad4ff', ms: 700 } },
    ],
  },
  {
    id: 'ya_athena_scan_mid',
    name: '【中】Athenaクエリ予告(スキャン量が跳ね上がりヒット多数)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 50,   layer: 'lcd',  action: 'text', params: { text: 'Athena: QUERY RUNNING…', color: '#ffd166', ms: 500 } },
      { at: 650,  layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 220, y: 190, count: 14 } },
      { at: 700,  layer: 'lcd',  action: 'text', params: { text: 'SCAN 812GB…', color: '#ffd166', ms: 600 } },
      { at: 1300, layer: 'lcd',  action: 'text', params: { text: '128,000 HIT !!', sub: '全件フルスキャン', color: '#ffe066', ms: 900 } },
      { at: 1350, layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 200 } },
      { at: 1400, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'happy' } },
    ],
  },

  // ── Redshift: データウェアハウスのウォームアップ(弱のみ) ──────────
  {
    id: 'ya_redshift_warmup_weak',
    name: '【弱】Redshiftウェアハウス予告(ジョブ1件が積まれるだけ)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.30,
    duration: 900,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'Redshift: WAREHOUSE WARMING…', color: '#8ad4ff', ms: 500 } },
      { at: 500, layer: 'lcd', action: 'text',  params: { text: 'queued: 1 job', color: '#8ad4ff', ms: 500 } },
    ],
  },

  // ── Glue: クローラがデータカタログを埋めていく ───────────────────
  // ETL ジョブとクローラは別機能なので、この演出はクローラ側の語彙で統一する(椿レビュー)
  {
    id: 'ya_glue_etl_weak',
    name: '【弱】Glueクローラ予告(1データセットだけ登録される)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1000,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'dynamo_scale', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'Glue: CRAWLER STARTING…', color: '#8ad4ff', ms: 500 } },
      { at: 500, layer: 'lcd', action: 'particles', params: { preset: 'scale', x: 210, y: 200, count: 6 } },
      { at: 550, layer: 'lcd', action: 'text',  params: { text: 'connected: 1 / 5', color: '#8ad4ff', ms: 600 } },
    ],
  },
  {
    id: 'ya_glue_etl_mid',
    name: '【中】Glueクローラ予告(データセットが次々登録され完走)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 1800,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'char', action: 'show', params: { char: 'kiro', pose: 'panic' } },
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'dynamo_scale' } },
      { at: 50,   layer: 'lcd',  action: 'text', params: { text: 'Glue: CRAWLER RUNNING…', color: '#ffd166', ms: 500 } },
      { at: 600,  layer: 'lcd',  action: 'particles', params: { preset: 'scale', x: 210, y: 200, count: 18 } },
      { at: 650,  layer: 'lcd',  action: 'text', params: { text: 'connected: 4 / 5', color: '#ffd166', ms: 600 } },
      { at: 1250, layer: 'sfx',  action: 'synth', params: { preset: 'upgrade_chime' } },
      { at: 1300, layer: 'lcd',  action: 'text', params: { text: 'CRAWLER COMPLETE', sub: '全データ連結済み', color: '#ffe066', ms: 900 } },
      { at: 1320, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'happy' } },
    ],
  },

  // ── EMR: クラスタのノードが並列で増える(中のみ) ─────────────────
  {
    id: 'ya_emr_cluster_mid',
    name: '【中】EMRクラスタ予告(ノードが並列で一気に増える)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'scale_out', gain: 0.7 } },
      { at: 50,   layer: 'lcd',  action: 'text', params: { text: 'EMR: CLUSTER BOOTING…', color: '#ffd166', ms: 500 } },
      { at: 600,  layer: 'lcd',  action: 'particles', params: { preset: 'scale', x: 220, y: 210, count: 16 } },
      { at: 650,  layer: 'lcd',  action: 'text', params: { text: 'NODES x6', sub: '並列ノードが立ち上がった', color: '#ffe066', ms: 800 } },
      { at: 1250, layer: 'sfx',  action: 'synth', params: { preset: 'charge_up', gain: 0.6 } },
    ],
  },

  // ── SageMaker: 学習ジョブの進捗と精度 ───────────────────────────
  {
    id: 'ya_sagemaker_train_weak',
    name: '【弱】SageMaker学習予告(精度が低いまま終わる)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'SageMaker: TRAINING JOB…', color: '#8ad4ff', ms: 500 } },
      { at: 550, layer: 'lcd', action: 'text',  params: { text: 'epoch 3/10 acc 58%', color: '#8ad4ff', ms: 600 } },
    ],
  },
  {
    id: 'ya_sagemaker_train_mid',
    name: '【中】SageMaker学習予告(精度が99%まで上がりきる)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 50,   layer: 'lcd',  action: 'text', params: { text: 'SageMaker: TRAINING JOB…', color: '#ffd166', ms: 500 } },
      { at: 650,  layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 220, y: 200, count: 14 } },
      { at: 700,  layer: 'lcd',  action: 'text', params: { text: 'epoch 7/10 acc 88%', color: '#ffd166', ms: 600 } },
      { at: 1350, layer: 'lcd',  action: 'particles', params: { preset: 'rainbow', x: 220, y: 200, count: 20 } },
      { at: 1400, layer: 'lcd',  action: 'text', params: { text: 'epoch 10/10 acc 99.2%', sub: '収束しきった', color: '#ffe066', ms: 1000 } },
      { at: 1420, layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 220 } },
      { at: 1450, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'happy' } },
    ],
  },

  // ── Rekognition: リール絵柄の画像解析 ───────────────────────────
  {
    id: 'ya_rekognition_scan_mid',
    name: '【中】Rekognition解析予告(判定枠が出るが信頼度は控えめ)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'rare_flag' } },
      { at: 40,   layer: 'lcd',  action: 'text', params: { text: 'Rekognition: ANALYZING SYMBOL…', color: '#ffd166', ms: 500 } },
      { at: 600,  layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 220, y: 190, count: 12 } },
      { at: 650,  layer: 'lcd',  action: 'text', params: { text: 'LABEL: CHERRY (76%)', color: '#ffd166', ms: 800 } },
      { at: 1300, layer: 'sfx',  action: 'synth', params: { preset: 'edge_hit', gain: 0.6 } },
    ],
  },
  {
    id: 'ya_rekognition_ghost_hit',
    name: 'Rekognition解析カットイン(本物・強チェリー/チャンス目)',
    // 「実は激アツ」ペア: 見た目は gase 版と同一にして、統計的にしか差が出ないようにしてある
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 120, default: 0 },
    duration: 2400,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 60,  layer: 'lcd',  action: 'text', params: { text: 'Rekognition: ANALYZING SYMBOL…', color: '#ffd166', ms: 600 } },
      { at: 700, layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 220, y: 190, count: 16 } },
      { at: 750, layer: 'lcd',  action: 'text', params: { text: 'LABEL: PHANTOM (74%)', color: '#ffd166', ms: 700 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'particles', params: { preset: 'rainbow', x: 220, y: 190, count: 26 } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'LABEL: PHANTOM (98%)', sub: '信頼度がほぼ振り切れた', color: '#ffe066', ms: 1400 } },
      { waitFor: 'stop3', after: 200, layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 260 } },
      { waitFor: 'stop3', after: 240, layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 280, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'happy' } },
    ],
  },
  {
    id: 'ya_rekognition_ghost_gase',
    name: '【ガセ】Rekognition解析カットイン(通常ハズレ・ベルでも出る)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 40, default: 0 },
    chance: 0.03,
    duration: 2400,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 60,  layer: 'lcd',  action: 'text', params: { text: 'Rekognition: ANALYZING SYMBOL…', color: '#ffd166', ms: 600 } },
      { at: 700, layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 220, y: 190, count: 16 } },
      { at: 750, layer: 'lcd',  action: 'text', params: { text: 'LABEL: PHANTOM (74%)', color: '#ffd166', ms: 700 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'particles', params: { preset: 'rainbow', x: 220, y: 190, count: 26 } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'LABEL: PHANTOM (98%)', sub: '信頼度がほぼ振り切れた', color: '#ffe066', ms: 1400 } },
      { waitFor: 'stop3', after: 200, layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 260 } },
      { waitFor: 'stop3', after: 240, layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 280, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'happy' } },
    ],
  },

  // ── Polly: テロップの読み上げ風演出(弱のみ) ────────────────────
  {
    id: 'ya_polly_readout_weak',
    name: '【弱】Polly読み上げ予告(内容はただの日常ログ)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1000,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'announce', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'Polly: SPEAKING…', sub: 'テロップを読み上げ中', color: '#8ad4ff', ms: 500 } },
      { at: 500, layer: 'lcd', action: 'text',  params: { text: '「本日は晴天なり」', color: '#8ad4ff', ms: 600 } },
    ],
  },

  // ── Transcribe: 音声認識のテキスト化(弱のみ) ────────────────────
  {
    id: 'ya_transcribe_voice_weak',
    name: '【弱】Transcribe音声認識予告(内容が薄い)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.30,
    duration: 900,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'Transcribe: LISTENING…', color: '#8ad4ff', ms: 500 } },
      { at: 500, layer: 'lcd', action: 'text',  params: { text: '「…特に異常なし」', color: '#8ad4ff', ms: 500 } },
    ],
  },

  // ── Translate: テロップが英訳される。訳文が意味深なら熱い ────────
  {
    id: 'ya_translate_en_weak',
    name: '【弱】Translate英訳予告(訳文もただの直訳)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: '原文: 「S3バケットを同期中」', color: '#8ad4ff', ms: 500 } },
      { at: 550, layer: 'lcd', action: 'text',  params: { text: 'EN: "Syncing S3 bucket"', color: '#8ad4ff', ms: 700 } },
    ],
  },
  {
    id: 'ya_translate_en_mid',
    name: '【中】Translate英訳予告(訳文がやけに意味深)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 50,   layer: 'lcd',  action: 'text', params: { text: '原文: 「そろそろ…来るかも」', color: '#ffd166', ms: 600 } },
      { at: 650,  layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 220, y: 200, count: 12 } },
      { at: 700,  layer: 'lcd',  action: 'text', params: { text: 'EN: "It is coming very soon"', sub: '訳文がやけに具体的', color: '#ffe066', ms: 1100 } },
      { at: 1350, layer: 'sfx',  action: 'synth', params: { preset: 'upgrade_chime', gain: 0.7 } },
      { at: 1380, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'happy' } },
    ],
  },

  // ── Comprehend: 感情分析でPOSITIVE判定(中のみ) ──────────────────
  {
    id: 'ya_comprehend_sentiment_mid',
    name: '【中】Comprehend感情分析予告(POSITIVE判定で盛り上がる)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'checklist_ok' } },
      { at: 40,   layer: 'lcd',  action: 'text', params: { text: 'Comprehend: ANALYZING SENTIMENT…', color: '#ffd166', ms: 500 } },
      { at: 600,  layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 220, y: 200, count: 12 } },
      { at: 650,  layer: 'lcd',  action: 'text', params: { text: 'POSITIVE 92%', sub: 'ポジティブ判定', color: '#ffe066', ms: 900 } },
      { at: 1250, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'happy' } },
    ],
  },

  // ── Textract: リール絵柄をOCR、読み取り結果があいまい(弱のみ) ────
  {
    id: 'ya_textract_ocr_weak',
    name: '【弱】Textract OCR予告(信頼度が低くて読み取れない)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1000,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'Textract: READING SYMBOL…', color: '#8ad4ff', ms: 500 } },
      { at: 550, layer: 'lcd', action: 'text',  params: { text: '読取結果: ???(低信頼度)', color: '#8ad4ff', ms: 600 } },
    ],
  },

  // ── Amazon Q: チャット風の質問と回答(中のみ) ────────────────────
  {
    id: 'ya_amazonq_chat_mid',
    name: '【中】Amazon Qチャット予告(期待させる回答が返る)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'announce' } },
      { at: 50,   layer: 'lcd',  action: 'text', params: { text: 'Q: このゲーム、そろそろ来る?', sub: 'Amazon Q に質問中…', color: '#ffd166', ms: 800 } },
      { at: 850,  layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 220, y: 200, count: 12 } },
      { at: 900,  layer: 'lcd',  action: 'text', params: { text: 'A: 可能性は十分にあります', color: '#ffe066', ms: 1000 } },
      { at: 1500, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'happy' } },
      { at: 1520, layer: 'sfx',  action: 'synth', params: { preset: 'charge_up', gain: 0.6 } },
    ],
  },

  // ── OpenSearch: 検索クエリのヒット件数(弱のみ) ──────────────────
  {
    id: 'ya_opensearch_query_weak',
    name: '【弱】OpenSearch検索予告(ヒット0件)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.30,
    duration: 900,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'text',  params: { text: 'OpenSearch: QUERY実行中…', color: '#8ad4ff', ms: 500 } },
      { at: 500, layer: 'lcd', action: 'text',  params: { text: '0 件 HIT', color: '#8ad4ff', ms: 500 } },
    ],
  },

  // ── QuickSight: ダッシュボードのグラフが跳ね上がる(中のみ) ───────
  {
    id: 'ya_quicksight_dashboard_mid',
    name: '【中】QuickSightダッシュボード予告(グラフが急上昇)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 1800,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 50,   layer: 'lcd',  action: 'text', params: { text: 'QuickSight: レポート生成中…', color: '#ffd166', ms: 600 } },
      { at: 650,  layer: 'lcd',  action: 'particles', params: { preset: 'rainbow', x: 220, y: 200, count: 18 } },
      { at: 700,  layer: 'lcd',  action: 'text', params: { text: 'アクセス数 240%増', sub: 'グラフが跳ね上がった', color: '#ffe066', ms: 1000 } },
      { at: 1350, layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 200 } },
      { at: 1380, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'happy' } },
    ],
  },
];
