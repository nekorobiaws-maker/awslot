/**
 * ギミック予告シナリオ(担当D)。DESIGN.md 6.5 / IDEAS.md 2章
 *
 * 「動きで魅せる」予告をまとめたファイル。ID はすべて yg_ プレフィックス。
 * 使用する lcd.anim は src/staging/anims/lcdanims-extra.js の LCD_ANIMS_EXTRA
 * (sqs_queue_hold / sfn_arrow_step / deploy_progress / asg_multiply /
 *  cw_meter_swing / kinesis_color_stream / distmap_run)。
 *
 * データのみ。演出の実装(anims / sfx)には依存しない。
 *
 * ── RUSH限定シナリオは RUSH_MODES / rushWeight を使うこと(2026-08-14 修正)──
 * U11 で RUSH が4種になったのに `mode:['AS_RUSH']` のままだったため、
 * CloudFront / Aurora / ヒーロー RUSH では1本も発火していなかった。
 * data/rushes.js の RUSH_IDS を単一の正にして、RUSH が増えても自動追従させる。
 */

import { RUSH_IDS, rushWeight } from '../rushes.js';
import { COLOR_NEUTRAL_MID } from '../rolecolors.js';

/** RUSH 全種(when.mode 用)。data/rushes.js が正 */
const RUSH_MODES = RUSH_IDS;

/* ══ パチンコ用語を持ち込まない(2026-08-15 ユーザー指示 U67-1)══════════
 *
 * この台は **パチスロ** なので、盤面・ポップアップに「保留」「保留変化」
 * 「保留が赤に変化」といったパチンコ側の言い回しを出さない。
 * 「保留が赤に変化」は台の仕組みとして存在しないものを指しており、
 * プレイヤーには何が起きたのか一切伝わらなかった(ユーザー指摘)。
 *
 * 代わりに **AWS 側で実際に起きていること** をそのまま書く:
 *   ×  「保留が赤に変化」
 *   ○  「SQS — メッセージが4件たまった」
 * サービス名は必ず入れる(何の画なのかが1行で分かるように)。
 *
 * 液晶の絵(lcdanims-extra.js の sqs_queue_hold)は封筒カードが積み上がり、
 * 枚数と枠色(白→金→赤)で熱さを示す。**色は絵の熱さの表現であって
 * 「保留の色」ではない**ので、文言側では色に言及しない。
 */

export default [
  // ── 通常時(FREE_TIER)のギミック予告 ─────────────────

  {
    id: 'yg_sqs_hold_gase',
    name: '【ガセ】SQSキュー滞留予告(2件たまったまま終わる)',
    // IDEAS.md 2-6。ハズレ・小役でも稀に出して「まだ増えるかも」と思わせる枠。
    // U67-1: 旧名「SQS保留予告(白のまま溜まって終わる)」= パチンコ語だったので改名
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
      /*
       * U67-1: 「保留は白のまま…」→ 実態(キューに何件たまったか)へ。
       * 色は結論行ではない **煽りの装飾色**(rolecolors.js の但し書き)。
       * 役を1つも名乗っていないので役色は使わない。
       */
      { waitFor: 'stop3', after: 260, layer: 'lcd', action: 'text',
        params: { text: 'QUEUE 2', sub: 'SQS — メッセージが2件たまったまま', color: '#e8f1ff', ms: 1000 } },
    ],
  },

  {
    id: 'yg_sqs_hold_hot',
    name: 'SQSキュー滞留予告(停止ごとに増えて4件まで積み上がる)',
    // IDEAS.md 2-6。停止ごとにメッセージが増え、たまるほど期待度アップ。
    // U67-1: 旧名「SQS保留変化予告(白→金→赤まで育つ)」= パチンコ語だったので改名
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
      /*
       * U67-1(ユーザー指摘の本丸): 旧「QUEUE 4 — RED / 保留が赤に変化」は
       * この台に存在しない仕組みを指していて意味が通らなかった。
       * 何件たまったのかという **実態** を出す。
       *
       * 色: when が rare:true = **成立役が1つに決まらない**ので役色は使えない
       *     (U62)。中立色 COLOR_NEUTRAL_MID を明示する。旧 #ff8a8a は赤系で、
       *     ROLE_COLORS のチェリー(赤)と読み違える余地があった。
       *     絵(封筒カード)の赤い枠は熱さの表現なので、そのまま level:2 で残す。
       */
      { waitFor: 'stop3', after: 300, layer: 'lcd', action: 'text',
        params: { text: 'QUEUE 4', sub: 'SQS — メッセージが4件たまった', color: COLOR_NEUTRAL_MID, ms: 1300 } },
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
        params: { text: '4 / 5 States', sub: 'Step Functions — 最終ステートまであと1つ', color: '#ffd166', ms: 1400 } },
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
        params: { text: '2 / 5 States', sub: 'Step Functions — ワークフローは途中で止まっている', color: '#8ad4ff', ms: 1000 } },
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
        params: { text: '調査を開始 — 突入', sub: 'Step Functions 全ステート制覇 — X-Ray の赤いトレースが消えた', color: '#ffe066', ms: 1900 } },
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
        params: { text: 'WAIT STATE', sub: 'Step Functions — 最終ステートへは進めなかった', color: '#8aa0b4', ms: 1200 } },
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
        params: { text: '本番反映は取り消し', sub: 'CodeDeploy — デプロイは巻き戻されました', color: '#ff8a8a', ms: 1200 } },
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
      // caption:false … 直後に出す lcd.text と役割が重なるので、
      // アニメ内蔵のキャプションは消す(重なって両方読めなくなるため)
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'kinesis_color_stream', level: 1, y: 238, count: 24, ms: 1800, caption: false } },
      { waitFor: 'stop3', after: 120, layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 200 } },
      { waitFor: 'stop3', after: 160, layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      /*
       * U78: 旧「GOLD STREAM」/「データ粒が金に変わった」は
       * **液晶を流れている粒の色**の説明で、絵を見ていないと何のことか分からなかった。
       * 色ではなく「Kinesis のストリームから拾えたもの」を書く。
       * 役は弱チェリー(IAM)とスイカ(S3)の2通りあるので、色は役色ではなく中立色のまま
       * (rolecolors.js の COLOR_NEUTRAL_MID と同値)。
       */
      { waitFor: 'stop3', after: 400, layer: 'lcd', action: 'text',
        params: {
          text: 'めぼしいデータが流れてきた',
          sub: 'Amazon Kinesis — 処理すべきレコードを拾い上げた',
          color: '#ffe066', ms: 1200,
        } },
    ],
  },

  {
    id: 'yg_deep_racer_run',
    name: '【賑やかし】分散マップの子の実行が液晶下段を走り抜ける',
    /*
     * IDEAS.md 2-35。期待度は持たせない“いるだけ”演出。
     * 2026-08-15 U58: 題材を DeepRacer(2025-12 提供終了)から
     * **Step Functions 分散マップの子の実行** へ差し替えた(絵の骨格はそのまま)。
     * シナリオIDは他所からの参照を壊さないため据え置き。
     */
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    chance: 0.20,  // 統合調律(2026-08-13): 非レア時の演出発火率30%に合わせて 0.02 → 0.20
    duration: 2000,
    cues: [
      { waitFor: 'stop1', layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim',
        params: { anim: 'distmap_run', y: 244, dir: 1 } },
    ],
  },

  /* ══ RUSH中の上乗せ期待予告 ══════════════════════════════════════════
   *
   * ── 【ルール】否定文言は、そのイベントが起きる回には構造的に出さない ──
   *    (2026-08-15 ユーザー指摘 U67-2)
   *
   * 【何が起きていたか】
   *   Aurora RUSH でスイカ(レア役)を引くと、同じゲームで
   *     ・aurora_scale_up  「SCALE UP!! ACU が上がった」(rushes.js / 事実)
   *     ・yg_rush_cw_meter_tease「まだスケールしません」(ここ / 否定)
   *   が **同時に** 出て、画面が自分で自分を否定していた。
   *
   * 【なぜ起きたか】
   *   RUSH の上乗せ契機は4種とも **レア役(data/rareroles.js の isRareRole)** で統一
   *   されているのに、否定側の予告が `flag:['WEAK_CHERRY','MELON']`
   *   = **レア役の一部** を条件にしていたため。弱いレア役でも上乗せは必ず走る。
   *     AS_RUSH     addUnitsByFlag  … 台数(= 残りG)が増える
   *     AURORA_RUSH acuUpByFlag     … ACU(純増)が上がる + 残りG +1
   *     CF_RUSH     coinByFlag      … 確定クレジットが乗る
   *     HERO_RUSH   coinByFlag      … +α が乗る
   *   どれも「レア役なら必ず何かが乗る」ので、レア役のゲームに
   *   「まだ〜しません / 起きません」系を出した時点で必ず嘘になる。
   *
   * 【これから守ること】
   *   否定・待機系(「まだ〜」「届かない」「変わらない」)を書くときは、
   *   **そのイベントが起きうる成立役を when から丸ごと外す**。
   *   文言の言い回しでごまかさず、発火条件で構造的に交わらないようにする。
   *     ・レア役契機のイベントを否定するなら `rare: false`
   *       (data/rareroles.js が唯一の正なので、役が増減しても自動追従する)
   *     ・payload で分かるものは match で外す
   *       例) rushes.js の hero_rush_miss は `bonus:[0]` を条件に持ち、
   *           レア役 +α が乗ったゲーム(hero_rush_bonus / _bonus_hit)とは
   *           **絶対に重ならない**。これが正しい形。
   *   `flag:[...]` に個別の役を並べる書き方は、役や契機が増えたときに
   *   静かに穴が開く(今回の事故がまさにそれ)。
   *
   * 【点検結果(2026-08-15 / 4RUSH + 引き戻し層)】
   *   AS   スケールアウト待ち … yg_rush_cw_meter_tease が穴だった → 下で修正
   *   Aurora スケールアップ待ち … 同上(同じシナリオが両方を兼ねていた)
   *   CF   ヒット待ち        … 否定ポップアップは存在しない(cf_rush_hit は
   *                            ヒットした瞬間だけ。キャッシュミスは無言)= 穴なし
   *   HERO +α待ち           … hero_rush_miss が bonus:[0] で除外済み、
   *                            かつ文字を出さない(表情と音だけ)= 穴なし
   *   HOT_STANDBY 切替待ち   … standby_progress はゲージの絵だけで文字なし。
   *                            レア役の +1G(pf_standby_extend)とは競合しない = 穴なし
   */

  {
    id: 'yg_rush_cw_meter_max',
    name: 'RUSH中:CloudWatchメーターが振り切れる(上位レア役)',
    /*
     * 針が THRESHOLD を超える強い版。振り切れは上位レア役限定にして安売りしない。
     *
     * U67-2: sub を「スケールアウト濃厚」から事実ベースへ変えた。
     * スケール**アウト**(台数が横に増える)は AS_RUSH だけの現象で、
     * Aurora はスケール**アップ**(ACU が上がる)、CF・HERO はそもそも
     * スケールしない(コインが乗る)。RUSH 4種すべてで出る予告なので、
     * 4種に共通して正しいことだけを言う = 「レア役ぶんの恩恵が乗る」。
     * 何がどれだけ乗ったかは直後の結果告知(as_rush_scale_out /
     * aurora_scale_up / cf_rush_win_coin / hero_rush_bonus*)が出す。
     */
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE', 'SHARK'], mode: RUSH_MODES },
    weight: rushWeight(100),
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
        params: { text: 'THRESHOLD 超過', sub: 'CloudWatch がアラーム — レア役ぶんの恩恵が乗る', color: '#ff8a8a', ms: 1300 } },
    ],
  },

  {
    id: 'yg_rush_cw_meter_tease',
    name: 'RUSH中:CloudWatchメーターが THRESHOLD 手前で止まる(非レア役)',
    /*
     * ── U67-2(ユーザー指摘の本丸)で発火条件を差し替えた ──────────────
     *
     * 旧: `flag: ['WEAK_CHERRY', 'MELON']`(= レア役の一部)
     * 新: `rare: false`(= レア役以外すべて)
     *
     * 旧条件だと Aurora RUSH でスイカを引いたゲームに
     *   「SCALE UP!! ACU 30 → 39」(aurora_scale_up)
     *   「まだスケールしません」(この予告)
     * が同時に出て矛盾していた。弱いレア役でも上乗せは必ず走るため、
     * **レア役を1つでも when に残した時点で構造的に矛盾する**。
     * このセクション冒頭のルールどおり、レア役を丸ごと外して交わらせない。
     *
     * `rare` は director が data/rareroles.js の isRareRole() から立てる値
     * (game/flow.js の leverOn payload)。役や契機が増えても自動追従する。
     *
     * 文言も「まだスケールしません」= 否定の言い切りをやめ、
     * **メーターが何を示しているか** だけを述べる形にした。
     * これなら AS / Aurora(しきい値未達 = 増強は走らない)でも、
     * そもそもスケールしない CF / HERO でも嘘にならない。
     *
     * chance: 非レア役はレア役より遥かに多いので、絞らないと出過ぎる。
     * 200セッション(RUSH滞在 約820ゲーム)の実測で発火量を旧条件に合わせた:
     *   旧 flag:['WEAK_CHERRY','MELON'] / chance なし … 60回(RUSH の約7.3%)
     *   新 rare:false / chance 0.12                  … 57回(RUSH の約7.0%)
     * ほぼ同じ量に収まるので、他の予告の見え方(重み配分)を動かさない。
     * ついでに「レア役の結果告知と枠を奪い合う」形でもなくなったので、
     * 静かなゲームの穴埋めとして働くようになった。
     */
    when: { event: 'leverOn', rare: false, mode: RUSH_MODES },
    weight: rushWeight(100),
    chance: 0.12,
    duration: 2400,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.72, over: false, label: 'CPU UTIL', sub: 'THRESHOLD 85%', ms: 1800 } },
      { waitFor: 'stop3', after: 1100, layer: 'lcd', action: 'text',
        params: { text: 'CPU 72%', sub: 'CloudWatch — しきい値 85% には届かず', color: '#ffd166', ms: 900 } },
    ],
  },

  {
    id: 'yg_rush_racer_cheer',
    name: '【賑やかし】RUSH中:分散マップの子の実行が下段を走り抜ける',
    // IDEAS.md 2-35。RUSH の小役でも稀に走らせて画面を寂しくしない(U58 で題材差し替え)
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: RUSH_MODES },
    weight: rushWeight(100),
    chance: 0.03,
    duration: 2000,
    cues: [
      { waitFor: 'stop1', layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim',
        params: { anim: 'distmap_run', y: 244, dir: -1, color: '#7bf7d0' } },
    ],
  },

  {
    id: 'yg_rush_kinesis_rainbow',
    name: 'RUSH中:データ粒の川が虹色になる(上乗せ濃厚)',
    // IDEAS.md 2-20 の最上位。RUSH の強レア役でのみ虹まで到達させる
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE', 'SHARK'], mode: RUSH_MODES },
    weight: rushWeight(90),
    duration: 2800,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'stream_flow' } },
      { at: 0, layer: 'lcd', action: 'anim',
        params: { anim: 'kinesis_color_stream', level: 1, y: 250, x0: 110, count: 20 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      // caption:false … 直後の lcd.text と役割が重なるため内蔵表示は出さない
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'kinesis_color_stream', level: 2, y: 250, x0: 110, count: 28, ms: 1900, caption: false } },
      { waitFor: 'stop3', after: 120, layer: 'overlay', action: 'flash', params: { color: '#ffb0f0', ms: 240 } },
      { waitFor: 'stop3', after: 160, layer: 'char', action: 'motion', params: { char: 'george', motion: 'tailWhip' } },
      /*
       * U78: 旧「RAINBOW」/「上乗せ濃厚」は
       *   ・虹 = 粒の色の話で、絵を見ていないと分からない
       *   ・AWS のことを1文字も言っていない(パチスロの機能語だけ)
       * の二重NG。ストリームの実態(シャードが開いて流量が上がる)へ書き直し、
       * ゲーム上の意味(上乗せ濃厚)はサブの後半に残す。
       */
      { waitFor: 'stop3', after: 500, layer: 'lcd', action: 'text',
        params: {
          text: '全シャードが最大まで開いた',
          sub: 'Amazon Kinesis — 流量が跳ね上がった。上乗せ濃厚',
          color: '#ffb0f0', ms: 1300,
        } },
    ],
  },
];
