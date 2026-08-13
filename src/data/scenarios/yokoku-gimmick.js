/**
 * ギミック予告シナリオ(担当D)。DESIGN.md 6.5 / IDEAS.md 2章
 *
 * 「動きで魅せる」予告をまとめたファイル。ID はすべて yg_ プレフィックス。
 * 使用する lcd.anim は src/staging/anims/lcdanims-extra.js の LCD_ANIMS_EXTRA
 * (sqs_queue_hold / sfn_arrow_step / deploy_progress / asg_multiply /
 *  cw_meter_swing / kinesis_color_stream / deep_racer_run)。
 *
 * データのみ。import は書かない(依存方向の厳守)。
 */

export default [
  // ── 通常時(FREE_TIER)のギミック予告 ─────────────────

  {
    id: 'yg_sqs_hold_gase',
    name: '【ガセ】SQS保留予告(白のまま溜まって終わる)',
    // IDEAS.md 2-6。保留変化型。ハズレ・小役でも稀に出して「保留が育つかも」と思わせる
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.40,  // 統合調律(2026-08-13): 非レア時の演出発火率30%に合わせて 0.05 → 0.40
    duration: 2600,
    cues: [
      { waitFor: 'stop1', layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'sqs_queue_hold', count: 1, level: 0 } },
      { waitFor: 'stop2', layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'sqs_queue_hold', count: 2, level: 0 } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'anim',
        params: { anim: 'sqs_queue_hold', count: 2, level: 0, ms: 1500 } },
      { waitFor: 'stop3', after: 260, layer: 'lcd', action: 'text',
        params: { text: 'QUEUE 2', sub: '保留は白のまま…', color: '#e8f1ff', ms: 1000 } },
    ],
  },

  {
    id: 'yg_sqs_hold_hot',
    name: 'SQS保留変化予告(白→金→赤まで育つ)',
    // IDEAS.md 2-6。停止ごとに保留が増え、色が上がるほど期待度アップ
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 3000,
    cues: [
      { at: 0, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0, layer: 'char', action: 'show', params: { char: 'kiro', pose: 'normal' } },
      { waitFor: 'stop1', layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'sqs_queue_hold', count: 1, level: 0 } },
      { waitFor: 'stop2', layer: 'sfx', action: 'synth', params: { preset: 'chance_flag' } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'sqs_queue_hold', count: 2, level: 1 } },
      { waitFor: 'stop2', after: 60, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'surprised' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'rare_flag' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'sqs_queue_hold', count: 4, level: 2, ms: 1800 } },
      { waitFor: 'stop3', after: 60, layer: 'overlay', action: 'flash', params: { color: '#ff5a5a', ms: 220 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'particles',
        params: { preset: 'spark', x: 46, y: 150, count: 14 } },
      { waitFor: 'stop3', after: 160, layer: 'char', action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      { waitFor: 'stop3', after: 300, layer: 'lcd', action: 'text',
        params: { text: 'QUEUE 4 — RED', sub: '保留が赤に変化', color: '#ff8a8a', ms: 1300 } },
    ],
  },

  /* ── Step Functions ワークフロー演出。IDEAS.md 2-17 ────────────────────
   *
   * デプロイ演出と同じ「結論は当落確定イベントでしか出さない」原則へ寄せた修正
   * (2026-08-13)。旧 yg_sfn_step_arrow はレア役を引いただけで
   * 「SUCCEEDED / 最終ステートに到達」と断言していたため、非当選ゲームでも
   * 成功の画が出ていた(しかもペアのガセ側が弱役=高頻度なので体感は失敗だらけ)。
   *
   * 予告(下の2本)は「何ステートまで進んだか」だけを見せて結論を出さない。
   * 結論は X-Ray 前兆(pattern:'xray')の顛末として出す:
   *   ENTRY → yg_sfn_result_success  全ステート制覇でトレースが緑に戻る
   *   MISS  → yg_sfn_result_wait     Wait State から動かず終わる
   * 「X-Ray に赤いトレースが出る → どのステートで詰まっているかを追う → Step Functions」
   * という筋で通る。
   *
   * 【付け替えの経緯】当初は sqs_backlog に紐付けていたが、SQS パターンの結末は
   * 「全メッセージ処理 / DLQ 行き」というユーザー仕様が別途決まったため
   * (data/scenarios/zencho.js の zn_sqs_result_*)、そちらを正としてこちらを xray へ移した。
   */
  {
    id: 'yg_sfn_step_arrow',
    name: 'Step Functionsステップアップ予告(レア役・4/5まで進む)',
    // 結論は出さない。到達ステート数だけで期待度を示す
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    duration: 2800,
    cues: [
      { at: 0, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'sfn_choice' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'sfn_arrow_step', step: 2, total: 5 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'sfn_arrow_step', step: 3, total: 5 } },
      { waitFor: 'stop2', layer: 'sfx', action: 'synth', params: { preset: 'sfn_choice' } },
      // step < total なので、アニメ側は「4 / 5 States」と出すだけで成否を語らない
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'sfn_arrow_step', step: 4, total: 5, ms: 1700 } },
      { waitFor: 'stop3', after: 80, layer: 'sfx', action: 'synth', params: { preset: 'sfn_choice' } },
      { waitFor: 'stop3', after: 160, layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { waitFor: 'stop3', after: 400, layer: 'lcd', action: 'text',
        params: { text: '4 / 5 States', sub: '最終ステートまであと1つ', color: '#ffd166', ms: 1400 } },
    ],
  },

  {
    id: 'yg_sfn_step_gase',
    name: 'Step Functionsステップアップ予告(弱役・2/5で止まる)',
    // かつての「ガセ」。結論を出さない低進捗の予告として残す
    when: { event: 'leverOn', flag: ['WEAK_CHERRY', 'MELON'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.35,
    duration: 2600,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'sfn_choice' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'sfn_arrow_step', step: 1, total: 5 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'sfn_arrow_step', step: 2, total: 5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'sfn_arrow_step', step: 2, total: 5, ms: 1500 } },
      { waitFor: 'stop3', after: 260, layer: 'lcd', action: 'text',
        params: { text: '2 / 5 States', sub: 'ワークフローは途中で止まっている', color: '#8ad4ff', ms: 1000 } },
    ],
  },

  {
    id: 'yg_sfn_result_success',
    name: 'Step Functions 全ステート制覇 → 突入【当選確定イベントのみ】',
    // 前兆が当選を保持したままCZへ送り出す最終Gにしか来ない。
    // ここでしか ok:true(= SUCCESS STATE)を渡さない
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_end'], value: ['ENTRY'], to: ['CZ'], pattern: ['xray'] },
    },
    weight: { FREE_TIER: 400, default: 0 },
    duration: 3000,
    cues: [
      { at: 40,   layer: 'sfx',     action: 'synth', params: { preset: 'sfn_choice' } },
      { at: 60,   layer: 'lcd',     action: 'anim',
        params: { anim: 'sfn_arrow_step', step: 5, total: 5, ok: true, ms: 2200 } },
      { at: 700,  layer: 'sfx',     action: 'synth', params: { preset: 'sfn_ok' } },
      { at: 740,  layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 300 } },
      { at: 760,  layer: 'overlay', action: 'shake', params: { power: 12, ms: 420 } },
      { at: 800,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 860,  layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 220, y: 80, count: 18 } },
      // 「突入」を含むので可読性エンジンが自動で sticky にする
      { at: 940,  layer: 'lcd',     action: 'text',
        params: { text: '調査を開始 — 突入', sub: '全ステート制覇。赤いトレースが消えた', color: '#ffe066', ms: 1900 } },
      { at: 1200, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_reg' } },
    ],
  },

  {
    id: 'yg_sfn_result_wait',
    name: '【ガセ】Step Functions Wait State で終わる【非当選確定イベントのみ】',
    // ガセ前兆が何も起きずに終わったときにしか来ない。ここからCZへ向かう経路は無い
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_end'], value: ['MISS'], pattern: ['xray'] },
    },
    weight: { FREE_TIER: 400, default: 0 },
    duration: 2600,
    cues: [
      { at: 0,    layer: 'lcd',   action: 'anim',
        params: { anim: 'sfn_arrow_step', step: 4, total: 5, ok: false, ms: 2000 } },
      { at: 900,  layer: 'sfx',   action: 'synth', params: { preset: 'sfn_ng' } },
      { at: 940,  layer: 'char',  action: 'show',  params: { char: 'kiro', pose: 'normal' } },
      { at: 1000, layer: 'lcd',   action: 'text',
        params: { text: 'WAIT STATE', sub: '最終ステートへは進めなかった', color: '#8aa0b4', ms: 1200 } },
      { at: 1300, layer: 'lamp',  action: 'pattern', params: { pattern: 'idle' } },
    ],
  },

  /* ── CodeDeploy デプロイ演出。IDEAS.md 2-4 ─────────────────────────────
   *
   * ユーザー指摘「必ずロールバックされる。しかもロールバックされたのに
   * チャンスゾーンに行ったりする」への修正(2026-08-13)。
   *
   * ■ 何が壊れていたか
   *   旧 yg_deploy_progress_100 … when は flag:['CHANCE','SHARK'] だけ。レア役なら
   *        当たっていなくても「DEPLOY 100% / デプロイ完了」と断言していた。
   *   旧 yg_deploy_rollback_gase … when は flag:['LOSE','BELL','REPLAY']。この3役は
   *        CZ_ENTRY テーブルに行が無く単独では当たらないが、**前兆(2〜5G)の最中**に
   *        引くと「ROLLBACK と出た数ゲーム後にCZ突入」になっていた。
   *        しかも成立頻度が桁違い(レア役 約1/156 に対しこの3役でほぼ毎ゲーム)で、
   *        chance 0.30 も掛かっていたため、体感はほぼ常にロールバックだった。
   *
   * ■ どう直したか(クイズ・Bedrock と同じ原則)
   *   途中経過(バーが伸びる)は当落と無関係なのでレバーONのままにし、
   *   **結論の画だけ**を「結果が確定したイベント」へ移した。
   *     成功  yg_deploy_result_success  … zencho_end / ENTRY / to:CZ = 突入確定
   *     失敗  yg_deploy_result_rollback … zencho_end / MISS        = 非当選確定
   *   さらに両方とも pattern:['canary'] で絞ってあるので、
   *   「カナリアリリースの前兆が始まった → その顛末としてデプロイ結果が出る」
   *   という筋が通り、無関係な前兆に横から結果だけ出ることもない。
   *   予告側(下の2本)は result を渡さないので DEPLOYING 表記のまま終わる。
   */
  {
    id: 'yg_deploy_progress_push',
    name: 'CodeDeployプログレスバー予告(レア役・高進捗)',
    // 期待度はバーの伸びで示す。結論は出さない(result を渡さない)
    when: { event: 'leverOn', flag: ['CHANCE', 'SHARK', 'STRONG_CHERRY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 80, default: 0 },
    duration: 3000,
    cues: [
      { at: 0, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim',
        params: { anim: 'deploy_progress', from: 0, to: 0.34 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim',
        params: { anim: 'deploy_progress', from: 0.34, to: 0.72 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'deploy_progress', from: 0.72, to: 0.94, ms: 1900 } },
      { waitFor: 'stop3', after: 700, layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 720, layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { waitFor: 'stop3', after: 900, layer: 'lcd', action: 'text',
        params: { text: 'DEPLOYING 94%', sub: '本番反映まであと少し', color: '#ffd166', ms: 1300 } },
    ],
  },

  {
    id: 'yg_deploy_progress_slow',
    name: 'CodeDeployプログレスバー予告(弱役・低進捗)',
    // かつての「ガセ=必ずロールバック」を、結論を出さない低進捗の予告へ置き換えた
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.30,  // 統合調律(2026-08-13): 非レア時の演出発火率30%に合わせる
    duration: 2800,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim',
        params: { anim: 'deploy_progress', from: 0, to: 0.28 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim',
        params: { anim: 'deploy_progress', from: 0.28, to: 0.48 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'deploy_progress', from: 0.48, to: 0.62, ms: 1800 } },
      { waitFor: 'stop3', after: 1250, layer: 'lcd', action: 'text',
        params: { text: 'DEPLOYING 62%', sub: '反映は途中で止まっている', color: '#8ad4ff', ms: 1100 } },
    ],
  },

  {
    id: 'yg_deploy_result_success',
    name: 'CodeDeploy デプロイ成功 → CZ突入【当選確定イベントのみ】',
    // 前兆が当選を保持したままCZへ送り出す最終Gにしか来ないイベント。
    // ここでしか result:'success'(= DEPLOY SUCCEEDED)を渡さない
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_end'], value: ['ENTRY'], to: ['CZ'], pattern: ['canary'] },
    },
    // カナリア前兆の顛末はデプロイ結果で締めたいので、他のCZ突入告知より強くする
    weight: { FREE_TIER: 400, default: 0 },
    duration: 3000,
    cues: [
      { at: 40,  layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 60,  layer: 'lcd',     action: 'anim',
        params: { anim: 'deploy_progress', from: 0.72, to: 1, result: 'success', ms: 2200 } },
      { at: 900, layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 300 } },
      { at: 920, layer: 'overlay', action: 'shake', params: { power: 12, ms: 420 } },
      { at: 940, layer: 'sfx',     action: 'synth', params: { preset: 'upgrade_chime' } },
      { at: 980, layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 1040, layer: 'lcd',    action: 'particles', params: { preset: 'spark', x: 270, y: 236, count: 18 } },
      // 「突入」を含むので可読性エンジンが自動で sticky にする
      { at: 1100, layer: 'lcd',    action: 'text',
        params: { text: 'DEPLOY 成功 — CZ突入', sub: '本番反映が完了しました', color: '#ffe066', ms: 1900 } },
      { at: 1400, layer: 'sfx',    action: 'synth', params: { preset: 'fanfare_reg' } },
    ],
  },

  {
    id: 'yg_deploy_result_rollback',
    name: '【ガセ】CodeDeploy ロールバック【非当選確定イベントのみ】',
    // ガセ前兆が何も起きずに終わったときにしか来ないイベント。
    // ここから CZ へ向かう経路は存在しないので「巻き戻ったのに突入」は起きない
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_end'], value: ['MISS'], pattern: ['canary'] },
    },
    weight: { FREE_TIER: 400, default: 0 },
    duration: 2600,
    cues: [
      { at: 0,    layer: 'lcd',   action: 'anim',
        params: { anim: 'deploy_progress', from: 0.86, to: 0.86, result: 'rollback', ms: 2000 } },
      { at: 1300, layer: 'sfx',   action: 'synth', params: { preset: 'error_buzz' } },
      { at: 1340, layer: 'char',  action: 'show',  params: { char: 'kiro', pose: 'normal' } },
      { at: 1380, layer: 'lcd',   action: 'text',
        params: { text: '本番反映は取り消し', sub: 'デプロイは巻き戻されました', color: '#ff8a8a', ms: 1200 } },
      { at: 1600, layer: 'lamp',  action: 'pattern', params: { pattern: 'idle' } },
    ],
  },

  {
    id: 'yg_asg_multiply_normal',
    name: 'Auto Scaling増殖予告(通常時 1→2→4→8)',
    // IDEAS.md 2-2。倍々に増えた数だけ期待度が上がる
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'MELON'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 60, default: 0 },
    duration: 2800,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'scale_out' } },
      { at: 0, layer: 'lcd', action: 'anim', params: { anim: 'asg_multiply', n: 1, prev: 0 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'asg_multiply', n: 2, prev: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'asg_multiply', n: 4, prev: 2 } },
      { waitFor: 'stop2', layer: 'sfx', action: 'synth', params: { preset: 'dynamo_scale' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'asg_multiply', n: 8, prev: 4, ms: 1600 } },
      { waitFor: 'stop3', after: 60, layer: 'sfx', action: 'synth', params: { preset: 'scale_out' } },
      { waitFor: 'stop3', after: 100, layer: 'overlay', action: 'flash', params: { color: '#7bf7d0', ms: 240 } },
      { waitFor: 'stop3', after: 140, layer: 'lcd', action: 'particles',
        params: { preset: 'scale', x: 220, y: 66, count: 20 } },
      { waitFor: 'stop3', after: 200, layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { waitFor: 'stop3', after: 420, layer: 'lcd', action: 'text',
        params: { text: '×8 INSTANCES', sub: '限界までスケールアウト', color: '#7bf7d0', ms: 1300 } },
    ],
  },

  {
    id: 'yg_kinesis_gold_stream',
    name: 'Kinesisデータ粒の川(青→金へ色変化)',
    // IDEAS.md 2-20。normal.js の青いままガセ(normal_kinesis_tease_gase)の上位版
    when: { event: 'leverOn', flag: ['WEAK_CHERRY', 'MELON'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 70, default: 0 },
    duration: 2600,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'stream_flow' } },
      { at: 0, layer: 'lcd', action: 'anim',
        params: { anim: 'kinesis_color_stream', level: 0, y: 238, count: 16 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim',
        params: { anim: 'kinesis_color_stream', level: 0, y: 238, count: 20 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'stream_flow' } },
      // caption:false … 直後に出す lcd.text('GOLD STREAM') と同じ内容なので、
      // アニメ内蔵のキャプションは消す(重なって両方読めなくなるため)
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'kinesis_color_stream', level: 1, y: 238, count: 24, ms: 1800, caption: false } },
      { waitFor: 'stop3', after: 120, layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 200 } },
      { waitFor: 'stop3', after: 160, layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { waitFor: 'stop3', after: 400, layer: 'lcd', action: 'text',
        params: { text: 'GOLD STREAM', sub: 'データ粒が金に変わった', color: '#ffe066', ms: 1200 } },
    ],
  },

  {
    id: 'yg_deep_racer_run',
    name: '【賑やかし】ミニDeepRacerが液晶下段を走り抜ける',
    // IDEAS.md 2-35。期待度は持たせない“いるだけ”演出
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    chance: 0.20,  // 統合調律(2026-08-13): 非レア時の演出発火率30%に合わせて 0.02 → 0.20
    duration: 2000,
    cues: [
      { waitFor: 'stop1', layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim',
        params: { anim: 'deep_racer_run', y: 244, dir: 1 } },
    ],
  },

  // ── RUSH中(AS_RUSH)の上乗せ期待予告 ────────────────

  {
    id: 'yg_rush_cw_meter_max',
    name: 'RUSH中:CloudWatchメーターが振り切れる(上乗せ期待濃厚)',
    // 針が THRESHOLD を超えると SCALE OUT 濃厚。振り切れは強レア役限定にして安売りしない
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE', 'SHARK'], mode: ['AS_RUSH'] },
    weight: { AS_RUSH: 100, default: 0 },
    duration: 3000,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
      { at: 0, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      // sub はデータ定義なので `${...}` は timeline 側で解決される。ただし値が取れない
      // 経路(デバッグ再生など)ではプレースホルダがそのまま液晶に出るうえ、
      // DC は液晶中央に常設表示されているので、ここは静的な文言にしておく
      { at: 0, layer: 'lcd', action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.62, over: false, label: 'CPU UTIL', sub: 'THRESHOLD 85%' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'alarm_beep' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.88, over: true, label: 'CPU UTIL', sub: 'IN ALARM', ms: 2000 } },
      { waitFor: 'stop3', after: 700, layer: 'overlay', action: 'flash', params: { color: '#ff5a5a', ms: 240 } },
      { waitFor: 'stop3', after: 720, layer: 'char', action: 'pose', params: { char: 'george', pose: 'grin' } },
      { waitFor: 'stop3', after: 760, layer: 'lcd', action: 'particles',
        params: { preset: 'spark', x: 118, y: 190, count: 14 } },
      { waitFor: 'stop3', after: 1000, layer: 'lcd', action: 'text',
        params: { text: 'THRESHOLD 超過', sub: 'スケールアウト濃厚', color: '#ff8a8a', ms: 1300 } },
    ],
  },

  {
    id: 'yg_rush_cw_meter_tease',
    name: '【ガセ】RUSH中:CloudWatchメーターが THRESHOLD 手前で止まる',
    // 弱レア役版。針が黄色ゾーンまでは来るが赤を超えない
    when: { event: 'leverOn', flag: ['WEAK_CHERRY', 'MELON'], mode: ['AS_RUSH'] },
    weight: { AS_RUSH: 100, default: 0 },
    duration: 2400,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.72, over: false, label: 'CPU UTIL', sub: 'THRESHOLD 85%', ms: 1800 } },
      { waitFor: 'stop3', after: 1100, layer: 'lcd', action: 'text',
        params: { text: '72%', sub: 'まだスケールしません', color: '#ffd166', ms: 900 } },
    ],
  },

  {
    id: 'yg_rush_racer_cheer',
    name: '【賑やかし】RUSH中:ミニDeepRacerが下段を走り抜ける',
    // IDEAS.md 2-35。RUSH の小役でも稀に走らせて画面を寂しくしない
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['AS_RUSH'] },
    weight: { AS_RUSH: 100, default: 0 },
    chance: 0.03,
    duration: 2000,
    cues: [
      { waitFor: 'stop1', layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim',
        params: { anim: 'deep_racer_run', y: 244, dir: -1, color: '#7bf7d0' } },
    ],
  },

  {
    id: 'yg_rush_kinesis_rainbow',
    name: 'RUSH中:データ粒の川が虹色になる(上乗せ濃厚)',
    // IDEAS.md 2-20 の最上位。RUSH の強レア役でのみ虹まで到達させる
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE', 'SHARK'], mode: ['AS_RUSH'] },
    weight: { AS_RUSH: 90, default: 0 },
    duration: 2800,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'stream_flow' } },
      { at: 0, layer: 'lcd', action: 'anim',
        params: { anim: 'kinesis_color_stream', level: 1, y: 250, x0: 110, count: 20 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      // caption:false … 直後の lcd.text('RAINBOW')と文言が重複するため内蔵表示は出さない
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'kinesis_color_stream', level: 2, y: 250, x0: 110, count: 28, ms: 1900, caption: false } },
      { waitFor: 'stop3', after: 120, layer: 'overlay', action: 'flash', params: { color: '#ffb0f0', ms: 240 } },
      { waitFor: 'stop3', after: 160, layer: 'char', action: 'motion', params: { char: 'george', motion: 'tailWhip' } },
      { waitFor: 'stop3', after: 500, layer: 'lcd', action: 'text',
        params: { text: 'RAINBOW', sub: '上乗せ濃厚', color: '#ffb0f0', ms: 1300 } },
    ],
  },
];
