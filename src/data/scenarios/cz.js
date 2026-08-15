/**
 * CZ層の演出シナリオ。DESIGN.md 6.5 / IDEAS.md 2-1, 3章
 *
 * ── 結論の画は当落確定イベントにだけ紐付ける(プロジェクト共通の原則)──
 * 「SUCCESS STATE」「ALL GREEN」のように結果を断言する画は、
 * **突破が確定したイベントからしか発火させない**:
 *   cz_sfn_result_clear … setEnd の success:[true] のみ
 *   cz_ta_all_green     … cz.js の finalize が突破時にだけ投げる checklist_all_green のみ
 * 逆に途中経過(cz_sfn_state_step / 1項目ずつの checklist)は、
 * この後 Fail State に落ちうる段階なので結論を断言しない
 *   - SFN は最終ステート(last:true)を除外して「ステート1つの成否」しか出さない
 *   - チェックリストは最終ゲームまで failGreen(2項目)止まりで、全緑は突破時にしか作らない
 */

export default [
  {
    id: 'cz_cw_alarm_entry',
    name: 'CloudWatchアラートCZ突入',
    when: { event: 'modeEnter', enterMode: ['CZ'], match: { 'state.czId': ['CW_ALARM'] } },
    weight: { default: 100 },
    duration: 3200,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ff3b30', ms: 300 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,   layer: 'lcd',     action: 'anim',  params: { anim: 'cw_graph_appear' } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 240,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      { at: 400,  layer: 'lcd',     action: 'text',
        params: { text: '$state.goal', sub: '期待度 ${state.stars} — ${state.goalDetail}', color: '#7cf3ff', ms: 2400 } },
      { at: 500,  layer: 'voice',   action: 'play',  params: { key: 'luna_kita_01', force: true } },
      { at: 600,  layer: 'bgm',     action: 'change', params: { bgm: 'bgm_cz' } },
    ],
  },

  {
    id: 'cz_trusted_advisor_entry',
    name: 'Trusted Advisor CZ 突入(チェックリスト)',
    // IDEAS.md 2-26「Trusted Advisor警告予告」
    when: { event: 'modeEnter', enterMode: ['CZ'], match: { 'state.czId': ['TRUSTED_ADVISOR'] } },
    weight: { default: 100 },
    duration: 3200,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'checklist_ok' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffd166', ms: 300 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 400,  layer: 'lcd',     action: 'text',
        // 2026-08-13 ユーザー指示: 「全項目グリーン = ボーナス確定」がこのCZのルール。
        // ルール説明なので sticky にはしない(「確定」の語を入れると当選告知に化けるため)。
        params: { text: '$state.goal', sub: '期待度 ${state.stars} — ${state.goalDetail}', color: '#ffd166', ms: 2400 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'luna_kita_01', force: true } },
      { at: 1000, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_cz' } },
    ],
  },

  {
    id: 'cz_sfn_entry',
    name: 'Step Functions CZ 突入(ステートマシン起動)',
    // 2026-08-13 ユーザー指示で新設。RUSH中の STEP_FUNCTIONS ゾーン(選択あり)とは別物で、
    // こちらは選択なし・自動進行の「流れきるか」を見せるCZ。
    when: { event: 'modeEnter', enterMode: ['CZ'], match: { 'state.czId': ['SFN_CZ'] } },
    weight: { default: 100 },
    duration: 3400,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'sfn_choice' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#c0c0ff', ms: 320 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 120,  layer: 'lcd',     action: 'anim',
        params: { anim: 'sfn_arrow_step', step: 0, total: '$state.total', ok: true } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 240,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      { at: 450,  layer: 'lcd',     action: 'text',
        // ルール説明。sticky 語(確定/突入)を避けて次ゲームまで残らないようにする
        params: { text: '$state.goal', sub: '期待度 ${state.stars} — ${state.goalDetail}', color: '#c0c0ff', ms: 2400 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'luna_kita_01', force: true } },
      { at: 1000, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_cz' } },
    ],
  },

  {
    id: 'cz_well_architected_entry',
    name: 'Well-Architected CZ 突入(ご褒美CZ)',
    // IDEAS.md 2-30 / 4-10。突入時点でほぼ勝ちが見えている
    // 天井経由(fromCeiling:true)は下の cz_wa_ceiling_entry が受け持つので、
    // こちらは **抽選で引いた** Well-Architected 専用にする(S6: 保証と抽選を見分けさせる)
    when: {
      event: 'modeEnter', enterMode: ['CZ'],
      match: { 'state.czId': ['WELL_ARCHITECTED'], 'state.fromCeiling': [false] },
    },
    weight: { default: 100 },
    duration: 3800,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 380 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 16, ms: 600 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'pillar_up' } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 200,  layer: 'char',    action: 'motion', params: { char: 'george', motion: 'swimIn' } },
      { at: 500,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 700,  layer: 'lcd',     action: 'text',
        params: { text: '$state.goal', sub: '期待度 ${state.stars} — ${state.goalDetail}', color: '#ffe066', ms: 2400 } },
      { at: 1200, layer: 'voice',   action: 'play',  params: { key: 'luna_kita_01', force: true } },
      { at: 1400, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 22 } },
      { at: 1500, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_cz' } },
    ],
  },

  {
    id: 'cz_metric_spike',
    name: 'CZ中のレア役でメトリクスが跳ねる',
    // IDEAS.md 2-11「Cost Explorerグラフ跳ね上げ予告」の応用
    when: { event: 'leverOn', mode: ['CZ'], rare: true },
    weight: { CZ: 100, default: 0 },
    duration: 1600,
    cues: [
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 180 } },
      { at: 0,   layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 60,  layer: 'lcd',     action: 'particles', params: { preset: 'stream', x: 220, y: 200, count: 18 } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'anim',
        params: { anim: 'cw_graph_rise', step: '$modeState.total' } },
      { waitFor: 'stop3', after: 200, layer: 'lcd', action: 'text',
        params: { text: 'SPIKE!', sub: 'CPU使用率が跳ね上がった', color: '#ffe066', ms: 1100 } },
    ],
  },

  {
    id: 'cz_result_step',
    name: 'CloudWatch CZ 突破(OK → INSUFFICIENT_DATA → ALARM のステップアップ)',
    // IDEAS.md 2-1
    // 2026-08-13: 当落を1本で担っていたが、非突破側は cw_alarm_result が
    // OK → INSUFFICIENT_DATA → **OK** と戻るため画面に「OK」が2回出ていた
    // (ユーザー指摘)。ステップアップ演出は突破時だけの見せ場にして、
    // 非突破は下の cz_result_step_lose が「OK」1回で告知する。
    when: { event: 'setEnd', match: { 'result': ['CZ_RESULT'], czId: ['CW_ALARM'], success: [true] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 2600,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 0,    layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 100,  layer: 'lcd',     action: 'anim',  params: { anim: 'cw_alarm_result', result: true } },
      { at: 1500, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      // CZ突破 = 当選確定。間引かない(U68)
      { at: 1500, layer: 'voice',   action: 'play',  params: { key: 'luna_win_01', force: true } },
    ],
  },

  {
    id: 'cz_result_step_lose',
    name: 'CloudWatch CZ 非突破(アラームは OK へ復帰)',
    // 画面に出る「OK」はこのテキスト帯の1回だけ。
    // テロップ側(cz.js failTelop)は「アラームが戻った — 通常へ復帰」で OK を繰り返さない。
    when: { event: 'setEnd', match: { 'result': ['CZ_RESULT'], czId: ['CW_ALARM'], success: [false] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 2400,
    cues: [
      { at: 0,    layer: 'sfx',   action: 'synth', params: { preset: 'alarm_beep', gain: 0.6 } },
      { at: 0,    layer: 'char',  action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 300,  layer: 'lcd',   action: 'text',
        params: {
          text: 'BACK TO OK', sub: 'しきい値を割った — 通常へ',
          color: '#8ad4ff', ms: 1600, sticky: false,
        } },
      // CZ非突破。泣き顔をひと呼吸だけ(U71)。結果が確定した瞬間なので声は間引かない(U68)
      { at: 1200, layer: 'char',  action: 'pose',  params: { char: 'kiro', pose: 'lose' } },
      { at: 1300, layer: 'voice', action: 'play',  params: { key: 'luna_lose_01', force: true } },
      { at: 2100, layer: 'char',  action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'cz_sfn_state_step',
    name: 'Step Functions CZ: ステートが1つ進む',
    // ステート進行は cz.js の paramChange(param:'sfn_state')で通知される。
    // source を 'SFN_CZ' にしてあるので、RUSH中の STEP_FUNCTIONS ゾーン側の
    // sfn_task_ok(source:'STEP_FUNCTIONS')とは競合しない。
    // 最終ステート(last:true)は結果告知が主役なのでここでは拾わない。
    when: { event: 'paramChange', match: { param: ['sfn_state'], ok: [true], last: [false] } },
    weight: { default: 100 },
    duration: 1400,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'sfn_ok' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#7bf7d0', ms: 140 } },
      { at: 0,   layer: 'lcd',     action: 'anim',
        params: { anim: 'sfn_arrow_step', step: '$value', total: '$total', ok: true } },
      { at: 60,  layer: 'lcd',     action: 'anim',  params: { anim: 'sfn_task', ok: true } },
      { at: 80,  layer: 'lcd',     action: 'particles', params: { preset: 'scale', x: 220, y: 62, count: 12 } },
      { at: 100, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 1000, layer: 'char',   action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'cz_sfn_state_fail',
    name: 'Step Functions CZ: Fail State に落ちる',
    when: { event: 'paramChange', match: { param: ['sfn_state'], ok: [false] } },
    weight: { default: 100 },
    duration: 1800,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'sfn_ng' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 260 } },
      { at: 0,   layer: 'overlay', action: 'shake', params: { power: 10, ms: 380 } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'sfn_task', ok: false } },
      { at: 100, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 400, layer: 'lcd',     action: 'text',
        params: { text: 'FAIL STATE', sub: '${stateName} でエラー', color: '#ff8a8a', ms: 1300 } },
    ],
  },

  {
    id: 'cz_sfn_result_clear',
    name: 'Step Functions CZ: Success State まで流れきった(ボーナス確定)',
    when: { event: 'setEnd', match: { 'result': ['CZ_RESULT'], czId: ['SFN_CZ'], success: [true] } },
    weight: { default: 100 },
    // 結果告知枠(調停で視覚ごと落とされないよう明示する)
    priority: 'result',
    duration: 3000,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 420 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 18, ms: 640 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 80,   layer: 'lcd',     action: 'anim',
        // 最終ステートまで矢印が点灯しきる(step = total)
        params: { anim: 'sfn_arrow_step', step: '$state.total', total: '$state.total', ok: true } },
      { at: 200,  layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 300,  layer: 'lcd',     action: 'text',
        // 「確定」を含むので自動 sticky = 次のレバーONまで残る
        params: { text: 'ボーナス確定!!', sub: 'Step Functions — ワークフローを完走した', color: '#7bf7d0', ms: 2200, sticky: true } },
      { at: 500,  layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 26 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'luna_win_01', force: true } },
    ],
  },

  {
    id: 'cz_sfn_result_fail',
    name: 'Step Functions CZ: 実行失敗で終了',
    when: { event: 'setEnd', match: { 'result': ['CZ_RESULT'], czId: ['SFN_CZ'], success: [false] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 2400,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'error_buzz' } },
      { at: 0,    layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 100,  layer: 'lcd',  action: 'anim',
        params: { anim: 'health_check', ok: false, label: 'EXECUTION FAILED' } },
      { at: 1200, layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 280 } },
      // CZ非突破。**泣き顔をひと呼吸だけ**見せて「ざんねん…」と重ね、すぐ素へ戻る
      // (U71: cry の出番。引きずらないのは次のゲームへ気持ちを渡すため)
      { at: 1300, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'lose' } },
      { at: 1400, layer: 'voice', action: 'play', params: { key: 'luna_lose_01', force: true } },
      { at: 2200, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'cz_ta_all_green',
    name: 'Trusted Advisor: 全項目GREEN(ボーナス確定の瞬間)',
    // 最終ゲームで残りが一斉に緑へ点灯する。cz.js の finalize が投げる
    // paramChange(param:'checklist_all_green')が唯一の発火元。
    // 1項目ずつの 'checklist' とは param を分けてあるので
    // scenarios/upper.js の cz_checklist_green とは取り合いにならない。
    when: { event: 'paramChange', match: { param: ['checklist_all_green'] } },
    weight: { default: 100 },
    // 全緑カスケードは「見せ場そのもの」。調停に落とされると
    // 「全緑を見ていないのに確定と言われる」状態になるので結果告知枠を取る
    priority: 'result',
    duration: 3000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'checklist_ok' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      // 全項目が上から順に緑へ流れていく(既存の checklist_green を段差で重ねる)。
      // 項目数は CZ_SPEC_BY_ID.TRUSTED_ADVISOR.items(6項目)に合わせること。
      // 椿レビュー指摘: 5本止まりで最後の1項目が緑にならないまま確定していた
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'checklist_green', index: 1 } },
      { at: 100, layer: 'lcd',     action: 'anim',  params: { anim: 'checklist_green', index: 2 } },
      { at: 200, layer: 'lcd',     action: 'anim',  params: { anim: 'checklist_green', index: 3 } },
      { at: 300, layer: 'lcd',     action: 'anim',  params: { anim: 'checklist_green', index: 4 } },
      { at: 400, layer: 'lcd',     action: 'anim',  params: { anim: 'checklist_green', index: 5 } },
      { at: 500, layer: 'lcd',     action: 'anim',  params: { anim: 'checklist_green', index: 6 } },
      { at: 500, layer: 'sfx',     action: 'synth', params: { preset: 'checklist_ok' } },
      { at: 620, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 560, layer: 'overlay', action: 'flash', params: { color: '#4ce0a0', ms: 420 } },
      { at: 560, layer: 'overlay', action: 'shake', params: { power: 16, ms: 600 } },
      { at: 620, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 700, layer: 'lcd',     action: 'text',
        // 「確定」を含むので自動 sticky = 次のレバーONまで残る
        params: { text: 'ALL GREEN', sub: '全項目クリア — ボーナス確定!!', color: '#4ce0a0', ms: 2200, sticky: true } },
      { at: 800, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 26 } },
      { at: 1100, layer: 'voice',  action: 'play',  params: { key: 'luna_win_01', force: true } },
    ],
  },

  {
    id: 'cz_result_ta_fail',
    name: 'Trusted Advisor 結果告知(非突破)',
    // 突破時は cz_ta_all_green(全緑の瞬間)が告知を担当するので、
    // ここは「グリーンが足りなかった」側だけを受け持つ。
    when: { event: 'setEnd', match: { 'result': ['CZ_RESULT'], czId: ['TRUSTED_ADVISOR'], success: [false] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 2600,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'health_check' } },
      { at: 0,    layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 100,  layer: 'lcd',  action: 'anim',  params: { anim: 'health_check', ok: false, label: 'NEEDS WORK' } },
      { at: 1200, layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 300 } },
      // CZ非突破。**泣き顔をひと呼吸だけ**見せて「ざんねん…」と重ね、すぐ素へ戻る
      // (U71: cry の出番。引きずらないのは次のゲームへ気持ちを渡すため)
      { at: 1300, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'lose' } },
      { at: 1400, layer: 'voice', action: 'play', params: { key: 'luna_lose_01', force: true } },
      { at: 2200, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'cz_wa_ceiling_entry',
    name: 'Well-Architected CZ 突入(天井 Auto Recovery 保証)',
    /*
     * S6: 天井(Auto Recovery)経由のW-Aは突破確定なので、抽選で引いた
     * 参加型のW-A(小役で柱を積む)と**同じ顔で始めない**。
     * 「作業を見せられている」のではなく「救済が走った」と分かる画にする。
     * weight 900 で通常の突入シナリオを押しのける(match でも分離済み)。
     */
    when: {
      event: 'modeEnter', enterMode: ['CZ'],
      match: { 'state.czId': ['WELL_ARCHITECTED'], 'state.fromCeiling': [true] },
    },
    weight: { default: 900 },
    duration: 3600,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'sla_credit' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 420 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 80,   layer: 'lcd',     action: 'anim',  params: { anim: 'auto_recovery' } },
      { at: 300,  layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 300,  layer: 'char',    action: 'motion', params: { char: 'george', motion: 'swimIn' } },
      { at: 700,  layer: 'lcd',     action: 'text',
        params: { text: '$state.goal', sub: '$state.goalDetail', color: '#ffe066', ms: 2400, sticky: true } },
      { at: 1200, layer: 'voice',   action: 'play',  params: { key: 'luna_kita_01', force: true } },
      { at: 1400, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 24 } },
      { at: 1500, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_cz' } },
    ],
  },

  {
    id: 'cz_wa_pillars_final',
    name: 'Well-Architected: 6本目の柱が立つ(ボーナス確定の瞬間)',
    /*
     * U10(2026-08-14)で柱は小役でしか立たなくなった。pillar_final は
     * **6本目が立った瞬間**にだけ飛ぶ = ここがそのまま当選確定の画になる。
     *
     * 【用語の注意】このCZの柱だけは U22〜U24 のレア役統一の **唯一の例外** で、
     * 契機は「払出のある小役すべて」のまま(data/rareroles.js の冒頭コメント参照)。
     * レア役に絞ると10Gで柱が1本も立たない回が大半になるため。
     * したがって、ここを「レア役で柱が立つ」と書き換えてはいけない。
     */
    // 全立が金色(6本目 = DynamoDB BIG 確定)なら下の cz_wa_all_pillars が担当する。
    when: { event: 'paramChange', match: { param: ['pillar_final'], allPillars: [false] } },
    weight: { default: 100 },
    duration: 1800,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'pillar_up' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 200 } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'pillar_raise', index: '$value', count: '$total' } },
      { at: 60,  layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 60,  layer: 'char',    action: 'motion', params: { char: 'george', motion: 'tailWhip' } },
      { at: 700, layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 220, y: 190, count: 14 } },
    ],
  },

  {
    id: 'cz_wa_all_pillars',
    name: 'Well-Architected: 6本の柱がすべて立つ(DynamoDB BIG 確定)',
    // ジョージが最後に2本まとめて担いでくる瞬間。ここが全立の告知。
    when: { event: 'paramChange', match: { param: ['pillar_final'], allPillars: [true] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 3000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'pillar_up' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'pillar_raise', index: '$from', count: '$total' } },
      { at: 60,  layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 60,  layer: 'char',    action: 'motion', params: { char: 'george', motion: 'tailWhip' } },
      { at: 260, layer: 'lcd',     action: 'anim',  params: { anim: 'pillar_raise', index: '$value', count: '$total' } },
      { at: 300, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 300, layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 420 } },
      { at: 300, layer: 'overlay', action: 'shake', params: { power: 16, ms: 600 } },
      { at: 500, layer: 'lcd',     action: 'text',
        params: {
          text: 'ALL 6 PILLARS', sub: '6本の柱すべて — ゴーストボーナスSP 確定!!',
          color: '#ffe066', ms: 2200, sticky: true,
        } },
      { at: 800, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 26 } },
    ],
  },

  {
    id: 'cz_result_review',
    name: 'CZ結果告知(Well-Architected)',
    // Trusted Advisor は「全緑 = 確定」へ作り替えたので担当から外した(2026-08-13)
    when: { event: 'setEnd', match: { 'result': ['CZ_RESULT'], czId: ['WELL_ARCHITECTED'] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 2600,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'health_check' } },
      { at: 0,    layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 100,  layer: 'lcd',  action: 'anim',
        params: { anim: 'health_check', ok: '$success', label: "$success ? 'PASSED' : 'NEEDS WORK'" } },
      { at: 1200, layer: 'overlay', action: 'flash',
        params: { color: "$success ? '#4ce0a0' : '#ff4d4d'", ms: 300 } },
      // 突破は満面の笑み / 非突破は泣き顔をひと呼吸だけ(U71)
      { at: 1300, layer: 'char', action: 'pose',
        params: { char: 'kiro', pose: "$success ? 'happy' : 'lose'" } },
      { at: 1400, layer: 'voice', action: 'play',
        params: { key: "$success ? 'luna_win_01' : 'luna_lose_01'", force: true } },
      { at: 2300, layer: 'char', action: 'pose',
        params: { char: 'kiro', pose: "$success ? 'happy' : 'normal'" } },
    ],
  },

  /* ══ 新CZ4種(2026-08-14)══════════════════════════════════════════
   *
   * ■ 役割分担(ここを崩すと「見ていないのに確定と言われる」に戻る)
   *   突入        … modeEnter。ルール説明だけ。結論の語は入れない
   *   途中経過    … paramChange。1手ぶんの事実しか言わない(断言しない)
   *   着地の画    … 突破時だけ飛ぶ paramChange(alb_all_healthy / dlq_drained /
   *                  bg_shift last / fis_resilient)。**視覚専任**で文字は持たない
   *   結果告知    … setEnd(priority:'result')。文字はここが一手に引き受ける
   * 着地の画と結果告知は同じゲームに並ぶので、文字を両方に置くと告知枠を取り合う。
   * 視覚1 + 告知1 の同居は director が許しているので、この分け方なら両方出る。
   *
   * ■ 新規アセットは作らない
   * 既存のLCDアニメ / カットイン / SEだけで組んである
   * (health_check, health_check_impact, sqs_queue_result, deploy_progress,
   *  cw_meter_swing, recover_burst, waf_shield_block …)。
   */

  // ── ALB ターゲットグループCZ ───────────────────────
  {
    id: 'cz_alb_entry',
    name: 'ALB CZ 突入(503 からの復旧)',
    when: { event: 'modeEnter', enterMode: ['CZ'], match: { 'state.czId': ['ALB_CZ'] } },
    weight: { default: 100 },
    duration: 3200,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ff9a5a', ms: 300 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 240,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      { at: 420,  layer: 'lcd',     action: 'text',
        params: { text: '$state.goal', sub: '期待度 ${state.stars} — ${state.goalDetail}', color: '#8ad4ff', ms: 2400 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'luna_kita_01', force: true } },
      { at: 1000, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_cz' } },
    ],
  },

  {
    id: 'cz_alb_health_ok',
    name: 'ALB CZ: 1台が healthy になる',
    // 途中経過。1台ぶんの事実(HEALTHY n/3)しか言わない = ここからは当落を読めない
    when: { event: 'paramChange', match: { param: ['alb_health'] } },
    weight: { default: 100 },
    duration: 1500,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'health_check' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#7bf7d0', ms: 140 } },
      { at: 0,   layer: 'lcd',     action: 'anim',
        params: { anim: 'health_check', ok: true, label: 'HEALTHY ${value}/${total}' } },
      { at: 80,  layer: 'lcd',     action: 'particles', params: { preset: 'scale', x: 220, y: 120, count: 12 } },
      { at: 100, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 1100, layer: 'char',   action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'cz_alb_all_healthy',
    name: 'ALB CZ: 全ターゲットが healthy(完成の画)',
    // 突破時にしか飛ばない着地イベント。文字は結果告知(cz_alb_result_win)に任せ、
    // ここは「全台のランプが緑に変わる」視覚だけを受け持つ。
    when: { event: 'paramChange', match: { param: ['alb_all_healthy'] } },
    weight: { default: 100 },
    duration: 2600,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'health_check' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'health_check_impact', ok: true } },
      { at: 1500, layer: 'sfx',    action: 'synth', params: { preset: 'burst_start' } },
      { at: 1500, layer: 'overlay', action: 'flash', params: { color: '#4ce0a0', ms: 380 } },
      { at: 1500, layer: 'overlay', action: 'shake', params: { power: 14, ms: 520 } },
      { at: 1600, layer: 'lcd',    action: 'particles', params: { preset: 'scale', x: 220, y: 150, count: 20 } },
    ],
  },

  {
    id: 'cz_alb_result_win',
    name: 'ALB CZ 突破(HTTP 200)',
    when: { event: 'setEnd', match: { result: ['CZ_RESULT'], czId: ['ALB_CZ'], success: [true] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 3000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 200, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 300, layer: 'lcd',     action: 'text',
        // 「確定」を含むので自動 sticky = 次のレバーONまで残る
        params: { text: 'HTTP 200 OK', sub: '全ターゲット healthy — ボーナス確定!!', color: '#4ce0a0', ms: 2200, sticky: true } },
      { at: 500, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 26 } },
      { at: 900, layer: 'voice',   action: 'play',  params: { key: 'luna_win_01', force: true } },
    ],
  },

  {
    id: 'cz_alb_result_lose',
    name: 'ALB CZ 非突破(ターゲットが unhealthy のまま)',
    /*
     * 2026-08-14: ここは「HTTP 503」と断言していたが、いまのゲーム側は
     * **healthy が1台でも残れば 200(degraded)**、0台のときだけ 503 を返す
     * (game/modes/cz.js の advanceAlb / state.degraded)。
     * 非突破でも 503 とは限らないので、どちらでも嘘にならない
     * 「ターゲットが unhealthy のまま」を出す。実際の応答コードは
     * 盤面の結論行(render/lcd-cz-extra.js の drawCzAlb)が state から出している。
     */
    when: { event: 'setEnd', match: { result: ['CZ_RESULT'], czId: ['ALB_CZ'], success: [false] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 2400,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'error_buzz' } },
      { at: 0,    layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 100,  layer: 'lcd',  action: 'anim',
        params: { anim: 'health_check', ok: false, label: 'TARGET UNHEALTHY' } },
      { at: 1200, layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 280 } },
      // CZ非突破。**泣き顔をひと呼吸だけ**見せて「ざんねん…」と重ね、すぐ素へ戻る
      // (U71: cry の出番。引きずらないのは次のゲームへ気持ちを渡すため)
      { at: 1300, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'lose' } },
      { at: 1400, layer: 'voice', action: 'play', params: { key: 'luna_lose_01', force: true } },
      { at: 2200, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  // ── SQS デッドレター再処理CZ ───────────────────────
  {
    id: 'cz_dlq_entry',
    name: 'SQS デッドレター再処理CZ 突入(DLQ に滞留)',
    when: { event: 'modeEnter', enterMode: ['CZ'], match: { 'state.czId': ['SQS_REDRIVE'] } },
    weight: { default: 100 },
    duration: 3200,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep', gain: 0.6 } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ff8a5a', ms: 280 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 80,   layer: 'lcd',     action: 'anim',  params: { anim: 'sqs_queue_hold', count: 5, level: 1 } },
      { at: 220,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 440,  layer: 'lcd',     action: 'text',
        params: { text: '$state.goal', sub: '期待度 ${state.stars} — ${state.goalDetail}', color: '#ffb27a', ms: 2400 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'luna_kita_01', force: true } },
      { at: 1000, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_cz' } },
    ],
  },

  {
    id: 'cz_dlq_redrive',
    name: 'SQS CZ: メッセージが再処理されて減る',
    // 途中経過。何通捌けたかだけを見せる(残数が0になるかは言わない)
    when: { event: 'paramChange', match: { param: ['dlq_redrive'] } },
    weight: { default: 100 },
    duration: 1800,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'stream_flow' } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'sqs_queue_result', result: 'ok', count: 4 } },
      { at: 80,  layer: 'lcd', action: 'particles', params: { preset: 'stream', x: 250, y: 130, count: 14 } },
      { at: 120, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 1300, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'cz_dlq_drained',
    name: 'SQS CZ: キューを空にした(完成の画)',
    // 突破時にしか飛ばない着地イベント。文字は cz_dlq_result_win 側
    when: { event: 'paramChange', match: { param: ['dlq_drained'] } },
    weight: { default: 100 },
    duration: 2400,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'stream_flow' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'sqs_queue_result', result: 'ok', count: 3 } },
      { at: 900, layer: 'sfx',     action: 'synth', params: { preset: 'burst_start' } },
      { at: 900, layer: 'overlay', action: 'flash', params: { color: '#4ce0a0', ms: 380 } },
      { at: 900, layer: 'overlay', action: 'shake', params: { power: 14, ms: 520 } },
      { at: 1000, layer: 'lcd',    action: 'particles', params: { preset: 'scale', x: 220, y: 140, count: 20 } },
    ],
  },

  {
    id: 'cz_dlq_result_win',
    name: 'SQS CZ 突破(QUEUE EMPTY)',
    when: { event: 'setEnd', match: { result: ['CZ_RESULT'], czId: ['SQS_REDRIVE'], success: [true] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 3000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 200, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 300, layer: 'lcd',     action: 'text',
        params: { text: 'QUEUE EMPTY', sub: 'DLQ を空にした — ボーナス確定!!', color: '#4ce0a0', ms: 2200, sticky: true } },
      { at: 500, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 26 } },
      { at: 900, layer: 'voice',   action: 'play',  params: { key: 'luna_win_01', force: true } },
    ],
  },

  {
    id: 'cz_dlq_result_lose',
    name: 'SQS CZ 非突破(DLQ へ戻される)',
    when: { event: 'setEnd', match: { result: ['CZ_RESULT'], czId: ['SQS_REDRIVE'], success: [false] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 2600,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'error_buzz' } },
      { at: 0,    layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 100,  layer: 'lcd',  action: 'anim',  params: { anim: 'sqs_queue_result', result: 'dlq', count: 2 } },
      { at: 1200, layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 280 } },
      /*
       * U17(2026-08-14): ここにあった「BACK TO DLQ / 再処理しきれませんでした」は削除。
       * 同じことを **3か所** が同時に言っていた:
       *   盤面の結論行(render/lcd-cz-extra.js) … BACK TO DLQ
       *   テロップ(game/modes/cz.js failTelop) … maxReceiveCount 超過 — DLQ へ戻されました…
       *   このポップアップ                     … BACK TO DLQ / 再処理しきれませんでした
       * 非突破は「持続的な状態情報」なのでテロップと盤面が担当し(U8)、
       * ポップアップは音・光・メッセージが戻る画だけを受け持つ。
       * 他CZの非突破(ALB / SFN / GameDay)も文字を持たない形で揃えてある。
       */
      // 泣き顔をひと呼吸だけ(U71)
      { at: 1400, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'lose' } },
      { at: 1500, layer: 'voice', action: 'play', params: { key: 'luna_lose_01', force: true } },
      { at: 2300, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  /* ── CodeDeploy Blue/Green CZ ──────────────────────
   *
   * 【U16 / U17(2026-08-14)】ここから deploy_progress(演出側のプログレスバー)を外した。
   *   ・盤面(render/lcd-cz-extra.js の drawCzBlueGreen)が Blue/Green の割合・段階の
   *     目盛り・エラー率を **常設で** 出している = 持続的な状態情報はそちらの担当(U8)
   *   ・その上に同じ意味のバーを重ねると、シフト率が画面に2つ並ぶ(U17 の二重表示)
   *   ・演出側のバーは x118〜424 の左寄り固定だったため、
   *     「メーターが中央にない」(U16)の見え方そのものだった
   * → 盤面のバーへ一本化し、そこに「CodeDeploy」のラベルを添えた。
   *   このシナリオ群は **瞬間の出来事**(光・音・揺れ)だけを担当する。
   */
  {
    id: 'cz_bg_entry',
    name: 'CodeDeploy Blue/Green CZ 突入(デプロイ開始)',
    when: { event: 'modeEnter', enterMode: ['CZ'], match: { 'state.czId': ['CODEDEPLOY_BG'] } },
    weight: { default: 100 },
    duration: 3400,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'contract_sign' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#5aa8ff', ms: 300 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      // 1段目(Linear 20%)は盤面のバーが伸びて見せる。ここは光だけ添える
      { at: 100,  layer: 'lcd',     action: 'anim',
        params: { anim: 'lcd_flash', color: '#5aa8ff', strength: 0.35 } },
      { at: 220,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 460,  layer: 'lcd',     action: 'text',
        params: { text: '$state.goal', sub: '期待度 ${state.stars} — ${state.goalDetail}', color: '#8ad4ff', ms: 2400 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'luna_kita_01', force: true } },
      { at: 1000, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_cz' } },
    ],
  },

  {
    id: 'cz_bg_shift_step',
    name: 'Blue/Green CZ: トラフィックが1段シフトする',
    // 途中経過。最終段(last:true)は完成の画が主役なのでここでは拾わない
    when: { event: 'paramChange', match: { param: ['bg_shift'], ok: [true], last: [false] } },
    weight: { default: 100 },
    duration: 1600,
    cues: [
      { at: 0,  layer: 'sfx',     action: 'synth', params: { preset: 'charge_up', gain: 0.5 } },
      { at: 0,  layer: 'overlay', action: 'flash', params: { color: '#7bf7d0', ms: 130 } },
      // シフト率の数字は盤面のバーが出す。ここは「1段進んだ」流れだけを見せる
      { at: 80, layer: 'lcd',     action: 'particles', params: { preset: 'stream', x: 250, y: 150, count: 12 } },
      { at: 100, layer: 'char',   action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 1200, layer: 'char',  action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'cz_bg_complete',
    name: 'Blue/Green CZ: 100% シフト完了(完成の画)',
    // 最終段に到達した = 突破確定。文字は cz_bg_result_win 側が出す
    when: { event: 'paramChange', match: { param: ['bg_shift'], ok: [true], last: [true] } },
    weight: { default: 100 },
    duration: 2400,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'burst_start' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      // 100% に届いた画は盤面のバー(Green 100%)が担当。ここは全画面の爆発だけ
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'recover_burst' } },
      { at: 900, layer: 'overlay', action: 'flash', params: { color: '#4ce0a0', ms: 380 } },
      { at: 900, layer: 'overlay', action: 'shake', params: { power: 14, ms: 520 } },
      { at: 1000, layer: 'lcd',    action: 'particles', params: { preset: 'scale', x: 220, y: 150, count: 20 } },
    ],
  },

  {
    id: 'cz_bg_rollback',
    name: 'Blue/Green CZ: アラーム発報で自動ロールバック',
    when: { event: 'paramChange', match: { param: ['bg_rollback'] } },
    weight: { default: 100 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 260 } },
      { at: 0,   layer: 'overlay', action: 'shake', params: { power: 12, ms: 420 } },
      // バーが 0% へ巻き戻る画は盤面側(rolledBack)。ここは赤い明滅で事故感を出す
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'lcd_flash', color: '#ff4d4d', strength: 0.55 } },
      { at: 120, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
    ],
  },

  {
    id: 'cz_bg_result_win',
    name: 'Blue/Green CZ 突破(DEPLOYMENT SUCCEEDED)',
    when: { event: 'setEnd', match: { result: ['CZ_RESULT'], czId: ['CODEDEPLOY_BG'], success: [true] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 3000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 200, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 300, layer: 'lcd',     action: 'text',
        params: { text: 'DEPLOYMENT SUCCEEDED', sub: 'Green へ 100% — ボーナス確定!!', color: '#4ce0a0', ms: 2200, sticky: true } },
      { at: 500, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 26 } },
      { at: 900, layer: 'voice',   action: 'play',  params: { key: 'luna_win_01', force: true } },
    ],
  },

  {
    id: 'cz_bg_result_lose',
    name: 'Blue/Green CZ 非突破(自動ロールバック)',
    when: { event: 'setEnd', match: { result: ['CZ_RESULT'], czId: ['CODEDEPLOY_BG'], success: [false] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 2400,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'error_buzz' } },
      { at: 0,    layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      /*
       * U17: 「ROLLED BACK」は盤面の結論行が出していて、理由(エラー率が閾値超過)は
       * テロップが出している。ポップアップで3度目を言わない。
       * ここは赤い明滅と音で「戻された」瞬間だけを担当する。
       */
      { at: 300,  layer: 'lcd',  action: 'anim',  params: { anim: 'lcd_flash', color: '#ff4d4d', strength: 0.45 } },
      // CZ非突破。**泣き顔をひと呼吸だけ**見せて「ざんねん…」と重ね、すぐ素へ戻る
      // (U71: cry の出番。引きずらないのは次のゲームへ気持ちを渡すため)
      { at: 1300, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'lose' } },
      { at: 1400, layer: 'voice', action: 'play', params: { key: 'luna_lose_01', force: true } },
      { at: 2200, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  // ── GameDay CZ(FIS 障害注入)──────────────────────
  {
    id: 'cz_fis_entry',
    name: 'GameDay CZ 突入(障害注入が始まる)',
    when: { event: 'modeEnter', enterMode: ['CZ'], match: { 'state.czId': ['FIS_GAMEDAY'] } },
    weight: { default: 100 },
    duration: 3600,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 340 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 14, ms: 520 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 200,  layer: 'char',    action: 'motion', params: { char: 'george', motion: 'swimIn' } },
      { at: 500,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'panic' } },
      { at: 600,  layer: 'lcd',     action: 'text',
        params: { text: '$state.goal', sub: '期待度 ${state.stars} — ${state.goalDetail}', color: '#ffb27a', ms: 2400 } },
      { at: 1100, layer: 'voice',   action: 'play',  params: { key: 'luna_kita_01', force: true } },
      { at: 1300, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_cz' } },
    ],
  },

  {
    id: 'cz_fis_fault_survived',
    name: 'GameDay CZ: 障害を1つ耐えた',
    // 途中経過。残バジェットの事実だけを出す(耐え切れるかは言わない)
    when: { event: 'paramChange', match: { param: ['fis_fault'], ok: [true], recovered: [false] } },
    weight: { default: 100 },
    duration: 1900,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'burst_start', gain: 0.6 } },
      { at: 0,   layer: 'overlay', action: 'shake', params: { power: 9, ms: 320 } },
      /*
       * label は必ず渡す(2026-08-15 検証指摘)。省略すると cw_meter_swing の
       * 既定値 'CPU UTIL' が出て、fis 盤面上部の「ERROR BUDGET n%」と
       * 別名の指標が同じ画面に2つ並んでしまう。ここで見せているのは残バジェット。
       */
      { at: 0,   layer: 'lcd',     action: 'anim',
        params: { anim: 'cw_meter_swing', to: '$ratio', over: false, label: 'ERROR BUDGET' } },
      { at: 120, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 1400, layer: 'char',   action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'cz_fis_auto_recover',
    name: 'GameDay CZ: レア役で自動復旧(バジェット回復)',
    // 当落は動かない見せ場。レア役を引けたご褒美として画を大きくする
    when: { event: 'paramChange', match: { param: ['fis_fault'], recovered: [true] } },
    weight: { default: 100 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 40,  layer: 'overlay', action: 'cutin', params: { id: 'waf_shield_block' } },
      { at: 300, layer: 'lcd',     action: 'anim',  params: { anim: 'recover_burst' } },
      { at: 320, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 600, layer: 'lcd',     action: 'text',
        params: { text: 'AUTO RECOVERY', sub: 'エラーバジェットが回復した', color: '#7bf7d0', ms: 1500 } },
      { at: 700, layer: 'lcd',     action: 'particles', params: { preset: 'scale', x: 220, y: 130, count: 16 } },
    ],
  },

  {
    id: 'cz_fis_budget_broken',
    name: 'GameDay CZ: エラーバジェットが尽きる',
    when: { event: 'paramChange', match: { param: ['fis_fault'], ok: [false] } },
    weight: { default: 100 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'error_buzz' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 280 } },
      { at: 0,   layer: 'overlay', action: 'shake', params: { power: 14, ms: 460 } },
      // label 省略は既定の 'CPU UTIL' になる(cz_fis_fault_survived のコメント参照)
      { at: 0,   layer: 'lcd',     action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.04, over: false, label: 'ERROR BUDGET' } },
      { at: 120, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 500, layer: 'lcd',     action: 'text',
        params: { text: 'BUDGET EXHAUSTED', sub: '${name} に耐えられなかった', color: '#ff8a8a', ms: 1400 } },
    ],
  },

  {
    id: 'cz_fis_resilient',
    name: 'GameDay CZ: 全障害を耐え切った(完成の画)',
    // 突破時にしか飛ばない着地イベント。文字は cz_fis_result_win 側
    when: { event: 'paramChange', match: { param: ['fis_resilient'] } },
    weight: { default: 100 },
    duration: 2400,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'burst_start' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'recover_burst' } },
      { at: 200, layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 200, layer: 'char',    action: 'motion', params: { char: 'george', motion: 'tailWhip' } },
      { at: 700, layer: 'overlay', action: 'flash', params: { color: '#4ce0a0', ms: 380 } },
      { at: 700, layer: 'overlay', action: 'shake', params: { power: 14, ms: 520 } },
      { at: 800, layer: 'lcd',     action: 'particles', params: { preset: 'scale', x: 220, y: 140, count: 20 } },
    ],
  },

  {
    id: 'cz_fis_result_win',
    name: 'GameDay CZ 突破(RESILIENT)',
    when: { event: 'setEnd', match: { result: ['CZ_RESULT'], czId: ['FIS_GAMEDAY'], success: [true] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 3000,
    cues: [
      // 途中経過のゲージを先に畳む(cz_shield_result_win と同じ理由)
      { at: 0,   layer: 'lcd',     action: 'windDown', params: { ms: 160 } },
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 200, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 300, layer: 'lcd',     action: 'text',
        params: { text: 'RESILIENT', sub: '全障害を耐え切った — ボーナス確定!!', color: '#4ce0a0', ms: 2200, sticky: true } },
      { at: 500, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 26 } },
      { at: 900, layer: 'voice',   action: 'play',  params: { key: 'luna_win_01', force: true } },
    ],
  },

  {
    id: 'cz_fis_result_lose',
    name: 'GameDay CZ 非突破(SLO 違反)',
    when: { event: 'setEnd', match: { result: ['CZ_RESULT'], czId: ['FIS_GAMEDAY'], success: [false] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 2400,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'error_buzz' } },
      { at: 0,    layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 100,  layer: 'lcd',  action: 'anim',
        params: { anim: 'health_check', ok: false, label: 'SLO VIOLATION' } },
      { at: 1200, layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 280 } },
      // CZ非突破。**泣き顔をひと呼吸だけ**見せて「ざんねん…」と重ね、すぐ素へ戻る
      // (U71: cry の出番。引きずらないのは次のゲームへ気持ちを渡すため)
      { at: 1300, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'lose' } },
      { at: 1400, layer: 'voice', action: 'play', params: { key: 'luna_lose_01', force: true } },
      { at: 2200, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  /* ══ U52c(2026-08-15)で足したCZ3種の演出 ═══════════════════════
   *
   * 盤面(液晶の描画)は既存CZと共有しているので、**演出の担当は
   * 「そのCZでしか起きない出来事」だけ**にする:
   *   CONFIG_RULES  … ルールが1つ COMPLIANT になる / NON_COMPLIANT で打ち切り / 全ルール準拠
   *   DX_REDUNDANCY … 専用線が1本開通する / 4本一斉開通
   *   SHIELD_DDOS   … 波を緩和する / レートベースルールで遮断 / バジェット枯渇 / 全波緩和
   * paramChange の param 名は新CZ専用(config_rule / dx_link / shield_wave …)にしてあり、
   * 既存CZの演出(checklist_all_green / pillar_final / fis_fault)を巻き込まない。
   *
   * 新規アセットは作らない(checklist_green / pillar_raise / cw_meter_swing /
   * recover_burst / health_check / waf_shield_block などの既存物だけで組む)。
   */

  // ── AWS Config 準拠ルールCZ ─────────────────────────
  {
    id: 'cz_config_entry',
    name: 'AWS Config 準拠ルールCZ 突入(非準拠リソースの検出)',
    when: { event: 'modeEnter', enterMode: ['CZ'], match: { 'state.czId': ['CONFIG_RULES'] } },
    weight: { default: 100 },
    /*
     * duration は「visual 枠を握る時間」。文言の寿命は lcd.text の ms 側が持つので、
     * ここを短くしても目標プレートは読める時間だけ残る。
     * Config は1ゲームに1ルールずつ結果が出る打ち切り型で、
     * 突入プレートが長いと2ゲーム目の進行テロップが slot-busy で落ちる
     * (2026-08-15 検証指摘 F14)。
     */
    duration: 2400,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep', gain: 0.55 } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#8ad4ff', ms: 280 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 240,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      { at: 420,  layer: 'lcd',     action: 'text',
        // ルール説明。sticky 語(確定/突入)は入れない
        params: { text: '$state.goal', sub: '期待度 ${state.stars} — ${state.goalDetail}', color: '#8ad4ff', ms: 2400 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'luna_kita_01', force: true } },
      { at: 1000, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_cz' } },
    ],
  },

  {
    id: 'cz_config_rule_compliant',
    name: 'Config CZ: ルールが1つ COMPLIANT になる',
    // 途中経過。1ルールぶんの事実(何件目が直ったか)しか言わない
    when: { event: 'paramChange', match: { param: ['config_rule'], ok: [true], last: [false] } },
    weight: { default: 100 },
    duration: 1500,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'checklist_ok' } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'checklist_green', index: '$value' } },
      { at: 60,  layer: 'lcd', action: 'particles', params: { preset: 'scale', x: 220, y: 120, count: 10 } },
      { at: 100, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'happy' } },
      { at: 1100, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'cz_config_rule_violation',
    name: 'Config CZ: NON_COMPLIANT が確定して打ち切り',
    when: { event: 'paramChange', match: { param: ['config_rule'], ok: [false] } },
    weight: { default: 100 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'error_buzz' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 260 } },
      { at: 0,   layer: 'lcd',     action: 'anim',
        params: { anim: 'health_check', ok: false, label: 'NON_COMPLIANT' } },
      { at: 120, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 500, layer: 'lcd',     action: 'text',
        params: { text: 'REMEDIATION FAILED', sub: '${name} を修復できなかった', color: '#ff8a8a', ms: 1400 } },
    ],
  },

  {
    id: 'cz_config_all_compliant',
    name: 'Config CZ: 全ルール COMPLIANT(完成の画)',
    // 突破時にしか飛ばない着地イベント。文字は結果告知(cz_config_result_win)側
    when: { event: 'paramChange', match: { param: ['config_all_compliant'] } },
    weight: { default: 100 },
    duration: 2400,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'checklist_ok' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'checklist_green', index: 1 } },
      { at: 160, layer: 'lcd',     action: 'anim',  params: { anim: 'checklist_green', index: 2 } },
      { at: 320, layer: 'lcd',     action: 'anim',  params: { anim: 'checklist_green', index: 3 } },
      { at: 480, layer: 'lcd',     action: 'anim',  params: { anim: 'checklist_green', index: 4 } },
      { at: 900, layer: 'sfx',     action: 'synth', params: { preset: 'burst_start' } },
      { at: 900, layer: 'overlay', action: 'flash', params: { color: '#4ce0a0', ms: 380 } },
      { at: 900, layer: 'overlay', action: 'shake', params: { power: 14, ms: 520 } },
      { at: 1000, layer: 'lcd',    action: 'particles', params: { preset: 'scale', x: 220, y: 140, count: 20 } },
    ],
  },

  {
    id: 'cz_config_result_win',
    name: 'Config CZ 突破(全ルール COMPLIANT)',
    when: { event: 'setEnd', match: { result: ['CZ_RESULT'], czId: ['CONFIG_RULES'], success: [true] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 3000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 200, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 300, layer: 'lcd',     action: 'text',
        // 「確定」を含むので自動 sticky = 次のレバーONまで残る
        params: { text: 'ALL COMPLIANT', sub: '全ルールが準拠 — ボーナス確定!!', color: '#4ce0a0', ms: 2200, sticky: true } },
      { at: 500, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 26 } },
      { at: 900, layer: 'voice',   action: 'play',  params: { key: 'luna_win_01', force: true } },
    ],
  },

  {
    id: 'cz_config_result_lose',
    name: 'Config CZ 非突破(NON_COMPLIANT が残った)',
    when: { event: 'setEnd', match: { result: ['CZ_RESULT'], czId: ['CONFIG_RULES'], success: [false] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 2400,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'error_buzz' } },
      { at: 0,    layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 100,  layer: 'lcd',  action: 'anim',
        params: { anim: 'health_check', ok: false, label: 'NON_COMPLIANT' } },
      { at: 1200, layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 280 } },
      // CZ非突破。**泣き顔をひと呼吸だけ**見せて「ざんねん…」と重ね、すぐ素へ戻る
      // (U71: cry の出番。引きずらないのは次のゲームへ気持ちを渡すため)
      { at: 1300, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'lose' } },
      { at: 1400, layer: 'voice', action: 'play', params: { key: 'luna_lose_01', force: true } },
      { at: 2200, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  // ── Direct Connect 冗長化CZ ────────────────────────
  {
    id: 'cz_dx_entry',
    name: 'Direct Connect 冗長化CZ 突入(専用線の開通作業)',
    when: { event: 'modeEnter', enterMode: ['CZ'], match: { 'state.czId': ['DX_REDUNDANCY'] } },
    weight: { default: 100 },
    // cz_config_entry と同じ理由で短め(道中の開通テロップに visual 枠を早く譲る)
    duration: 2400,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'contract_sign' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#c8b4ff', ms: 300 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 240,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      { at: 450,  layer: 'lcd',     action: 'text',
        params: { text: '$state.goal', sub: '期待度 ${state.stars} — ${state.goalDetail}', color: '#c8b4ff', ms: 2400 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'luna_kita_01', force: true } },
      { at: 1000, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_cz' } },
    ],
  },

  {
    id: 'cz_dx_link_up',
    name: 'DX CZ: 専用線が1本開通する',
    // 途中経過。開通した本数の事実だけを出す(4本そろうかは言わない)
    when: { event: 'paramChange', match: { param: ['dx_link'] } },
    weight: { default: 100 },
    duration: 1600,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'pillar_up', gain: 0.6 } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'pillar_raise', index: '$value', count: '$total' } },
      { at: 80,  layer: 'lcd', action: 'particles', params: { preset: 'stream', x: 220, y: 170, count: 12 } },
      { at: 120, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'happy' } },
      { at: 1200, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'cz_dx_all_links',
    name: 'DX CZ: 4本が一斉に開通(完成の画)',
    // 突破時にしか飛ばない着地イベント。文字は結果告知(cz_dx_result_win)側
    when: { event: 'paramChange', match: { param: ['dx_all_links'] } },
    weight: { default: 100 },
    duration: 2600,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'pillar_up' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'pillar_raise', index: 2, count: '$total' } },
      { at: 180, layer: 'lcd',     action: 'anim',  params: { anim: 'pillar_raise', index: 3, count: '$total' } },
      { at: 360, layer: 'lcd',     action: 'anim',  params: { anim: 'pillar_raise', index: 4, count: '$total' } },
      { at: 900, layer: 'sfx',     action: 'synth', params: { preset: 'burst_start' } },
      { at: 900, layer: 'overlay', action: 'flash', params: { color: '#4ce0a0', ms: 380 } },
      { at: 900, layer: 'overlay', action: 'shake', params: { power: 14, ms: 520 } },
      { at: 1000, layer: 'lcd',    action: 'particles', params: { preset: 'scale', x: 220, y: 150, count: 20 } },
    ],
  },

  {
    id: 'cz_dx_result_win',
    name: 'DX CZ 突破(冗長構成が完成)',
    when: { event: 'setEnd', match: { result: ['CZ_RESULT'], czId: ['DX_REDUNDANCY'], success: [true] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 3000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 200, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 300, layer: 'lcd',     action: 'text',
        params: { text: 'ALL LINKS UP', sub: '専用線4本が開通 — ボーナス確定!!', color: '#4ce0a0', ms: 2200, sticky: true } },
      { at: 500, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 26 } },
      { at: 900, layer: 'voice',   action: 'play',  params: { key: 'luna_win_01', force: true } },
    ],
  },

  {
    id: 'cz_dx_result_lose',
    name: 'DX CZ 非突破(BGP セッションが上がらない)',
    when: { event: 'setEnd', match: { result: ['CZ_RESULT'], czId: ['DX_REDUNDANCY'], success: [false] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 2400,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'error_buzz' } },
      { at: 0,    layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 100,  layer: 'lcd',  action: 'anim',
        params: { anim: 'health_check', ok: false, label: 'BGP DOWN' } },
      { at: 1200, layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 280 } },
      // CZ非突破。**泣き顔をひと呼吸だけ**見せて「ざんねん…」と重ね、すぐ素へ戻る
      // (U71: cry の出番。引きずらないのは次のゲームへ気持ちを渡すため)
      { at: 1300, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'lose' } },
      { at: 1400, layer: 'voice', action: 'play', params: { key: 'luna_lose_01', force: true } },
      { at: 2200, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  // ── Shield / WAF DDoS 防御CZ ───────────────────────
  {
    id: 'cz_shield_entry',
    name: 'DDoS 防御CZ 突入(攻撃が始まる)',
    when: { event: 'modeEnter', enterMode: ['CZ'], match: { 'state.czId': ['SHIELD_DDOS'] } },
    weight: { default: 100 },
    /*
     * 【尺は他CZより短い】(2026-08-15 検証指摘 F13a / F14)
     * SHIELD は全3ゲームしかないうえ 1ゲームに2波来るので、他CZと同じ
     * 3,600ms / 文言 2,400ms だと **2ゲーム目の途中まで突入プレートが残り**、
     * その間ずっと波チップと「SURVIVED n/6」を隠してしまっていた。
     * さらに duration の間は visual 枠を握るため、道中の
     * cz_shield_wave_survived が slot-busy で連続して落ちていた。
     * 「短期決戦のCZは突入の尺も短い」で揃える。
     */
    duration: 2200,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 320 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 12, ms: 480 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 200,  layer: 'char',    action: 'motion', params: { char: 'george', motion: 'swimIn' } },
      { at: 400,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'panic' } },
      { at: 400,  layer: 'lcd',     action: 'text',
        params: { text: '$state.goal', sub: '期待度 ${state.stars} — ${state.goalDetail}', color: '#ffb27a', ms: 1500 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'luna_kita_01', force: true } },
      { at: 1000, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_cz' } },
    ],
  },

  {
    id: 'cz_shield_wave_survived',
    name: 'DDoS 防御CZ: 波を1つ緩和した',
    // 途中経過。残バジェットの事実だけ(耐え切れるかは言わない)
    when: { event: 'paramChange', match: { param: ['shield_wave'], ok: [true], mitigated: [false] } },
    weight: { default: 100 },
    duration: 1700,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'burst_start', gain: 0.55 } },
      { at: 0,   layer: 'overlay', action: 'shake', params: { power: 8, ms: 300 } },
      /*
       * label は必ず渡す。省略すると cw_meter_swing の既定値 'CPU UTIL' が出て、
       * 盤面上部の「ERROR BUDGET n%」と別名の指標が同じ画面に2つ並ぶ
       * (2026-08-15 検証指摘)。ここで見せているのは残エラーバジェット。
       */
      { at: 0,   layer: 'lcd',     action: 'anim',
        params: { anim: 'cw_meter_swing', to: '$ratio', over: false, label: 'ERROR BUDGET' } },
      { at: 120, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 1300, layer: 'char',   action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'cz_shield_rate_limit',
    name: 'DDoS 防御CZ: レア役でレートベースルールが遮断(被害なし)',
    // 当落は動かない見せ場。レア役を引けたご褒美として画を大きくする
    when: { event: 'paramChange', match: { param: ['shield_wave'], mitigated: [true] } },
    weight: { default: 100 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 40,  layer: 'overlay', action: 'cutin', params: { id: 'waf_shield_block' } },
      { at: 320, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 600, layer: 'lcd',     action: 'text',
        params: { text: 'RATE LIMITED', sub: '${name} を遮断 — 被害なし', color: '#7bf7d0', ms: 1500 } },
      { at: 700, layer: 'lcd',     action: 'particles', params: { preset: 'scale', x: 220, y: 130, count: 16 } },
    ],
  },

  {
    id: 'cz_shield_budget_broken',
    name: 'DDoS 防御CZ: エラーバジェットが尽きる',
    when: { event: 'paramChange', match: { param: ['shield_wave'], ok: [false] } },
    weight: { default: 100 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'error_buzz' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 280 } },
      { at: 0,   layer: 'overlay', action: 'shake', params: { power: 14, ms: 460 } },
      // label 省略は既定の 'CPU UTIL' になる(cz_shield_wave_survived のコメント参照)
      { at: 0,   layer: 'lcd',     action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.04, over: false, label: 'ERROR BUDGET' } },
      { at: 120, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 500, layer: 'lcd',     action: 'text',
        params: { text: 'BUDGET EXHAUSTED', sub: '${name} を捌ききれなかった', color: '#ff8a8a', ms: 1400 } },
    ],
  },

  {
    id: 'cz_shield_mitigated',
    name: 'DDoS 防御CZ: 全波を緩和しきった(完成の画)',
    // 突破時にしか飛ばない着地イベント。文字は結果告知(cz_shield_result_win)側
    when: { event: 'paramChange', match: { param: ['shield_mitigated'] } },
    weight: { default: 100 },
    /*
     * 1ゲームに2波来るCZなので、最終ゲームは道中の波2本に
     *   ・液晶演出の予算(MAX_LCD_SCENARIOS_PER_GAME = 2)
     *   ・visual 枠(同じ rank の gimmick は割り込めない)
     * を両方持っていかれ、一番の見せ場であるこの完成の画が
     * **構造的に必ず**落ちていた(2026-08-15 検証指摘 F14)。
     *   budgetExempt … 予算の逃がし弁(CZ 1回につき最大1度しか飛ばないので許される)
     *   priority      … 道中の波(gimmick / rank 1)より上の rank 2 にして割り込む。
     *                   結果告知(rank 3 / announce 枠)は空けたままなので、
     *                   直後の cz_shield_result_win が押し出されることはない。
     */
    budgetExempt: true,
    priority: 'cutin',
    duration: 2400,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'burst_start' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'recover_burst' } },
      { at: 200, layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 200, layer: 'char',    action: 'motion', params: { char: 'george', motion: 'tailWhip' } },
      { at: 700, layer: 'overlay', action: 'flash', params: { color: '#4ce0a0', ms: 380 } },
      { at: 700, layer: 'overlay', action: 'shake', params: { power: 14, ms: 520 } },
      { at: 800, layer: 'lcd',     action: 'particles', params: { preset: 'scale', x: 220, y: 140, count: 20 } },
    ],
  },

  {
    id: 'cz_shield_result_win',
    name: 'DDoS 防御CZ 突破(全波を緩和)',
    when: { event: 'setEnd', match: { result: ['CZ_RESULT'], czId: ['SHIELD_DDOS'], success: [true] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 3000,
    cues: [
      /*
       * 途中経過のゲージを先に畳む(2026-08-15 検証指摘 F12)。
       * cw_meter_swing は ms 1700 なので、これが無いと結果プレートの裏で
       * 途中の残バジェットが生き続け、盤面上部の値と食い違う数字が二重に見える。
       */
      { at: 0,   layer: 'lcd',     action: 'windDown', params: { ms: 160 } },
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 200, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 300, layer: 'lcd',     action: 'text',
        params: { text: 'ATTACK MITIGATED', sub: '全波を緩和しきった — ボーナス確定!!', color: '#4ce0a0', ms: 2200, sticky: true } },
      { at: 500, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 26 } },
      { at: 900, layer: 'voice',   action: 'play',  params: { key: 'luna_win_01', force: true } },
    ],
  },

  {
    id: 'cz_shield_result_lose',
    name: 'DDoS 防御CZ 非突破(サービス断)',
    when: { event: 'setEnd', match: { result: ['CZ_RESULT'], czId: ['SHIELD_DDOS'], success: [false] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 2400,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'error_buzz' } },
      { at: 0,    layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 100,  layer: 'lcd',  action: 'anim',
        params: { anim: 'health_check', ok: false, label: 'SERVICE DEGRADED' } },
      { at: 1200, layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 280 } },
      // CZ非突破。**泣き顔をひと呼吸だけ**見せて「ざんねん…」と重ね、すぐ素へ戻る
      // (U71: cry の出番。引きずらないのは次のゲームへ気持ちを渡すため)
      { at: 1300, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'lose' } },
      { at: 1400, layer: 'voice', action: 'play', params: { key: 'luna_lose_01', force: true } },
      { at: 2200, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },
];
