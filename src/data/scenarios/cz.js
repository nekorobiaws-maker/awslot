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
      { at: 500,  layer: 'voice',   action: 'play',  params: { key: 'kiro_cz_start_01' } },
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
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'kiro_cz_ta_01' } },
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
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'kiro_cz_start_01' } },
      { at: 1000, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_cz' } },
    ],
  },

  {
    id: 'cz_well_architected_entry',
    name: 'Well-Architected CZ 突入(ご褒美CZ)',
    // IDEAS.md 2-30 / 4-10。突入時点でほぼ勝ちが見えている
    when: { event: 'modeEnter', enterMode: ['CZ'], match: { 'state.czId': ['WELL_ARCHITECTED'] } },
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
      { at: 1200, layer: 'voice',   action: 'play',  params: { key: 'george_cz_wa_01' } },
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
      { at: 1500, layer: 'voice',   action: 'play',  params: { key: 'kiro_cz_win' } },
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
      { at: 1200, layer: 'char',  action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
      { at: 1300, layer: 'voice', action: 'play',  params: { key: 'kiro_cz_lose' } },
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
        params: { text: 'ボーナス確定!!', sub: 'ワークフローを完走した', color: '#7bf7d0', ms: 2200, sticky: true } },
      { at: 500,  layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 26 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'kiro_cz_win' } },
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
      { at: 1300, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
      { at: 1400, layer: 'voice', action: 'play', params: { key: 'kiro_cz_lose' } },
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
      { at: 1100, layer: 'voice',  action: 'play',  params: { key: 'kiro_cz_win' } },
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
      { at: 1300, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
      { at: 1400, layer: 'voice', action: 'play', params: { key: 'kiro_cz_lose' } },
    ],
  },

  {
    id: 'cz_wa_pillars_final',
    name: 'Well-Architected: 最終ゲームで残りの柱が立つ',
    // games:5 に対して柱は6本あるので、最終ゲームは finalize がまとめて立てる
    // (しおん指摘「1G1本だと5本までしか立たず数合わせになる」への対応)。
    // 全立(6本 = DynamoDB BIG 確定)は下の cz_wa_all_pillars が担当する。
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
      { at: 1300, layer: 'char', action: 'pose',
        params: { char: 'kiro', pose: "$success ? 'happy' : 'normal'" } },
      { at: 1400, layer: 'voice', action: 'play',
        params: { key: "$success ? 'kiro_cz_win' : 'kiro_cz_lose'" } },
    ],
  },
];
