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
 *
 * ══ 色のルール(2026-08-14 ユーザー指摘 U9)═══════════════════════════
 *
 * 「スイカ(S3)対応の予兆は緑、チェリー(IAM)対応は赤」という要望と、
 * 既存の「赤文字予兆 = 信頼度85%」がどちらも赤を使うので、**レイヤーを分けて**両立させる。
 * 定義の本体は data/zencho.js の ZENCHO_TEXT_COLORS(このファイルは import を書けないので値は直書き)。
 *
 *   信頼度示唆 … tone:'hot' + color:'#ff3b30'
 *                 帯の下敷きごと赤くなり、文字が一段大きく脈打つ = 「赤帯」
 *                 これが付くのは strength 2以上 かつ step 2以降の予兆だけ(zn_hot_*)
 *   対応役示唆 … tone なし。文字色だけで示す = 「文字だけ色付き」
 *                 緑 #4ce0a0 … スイカ(S3)対応 / 赤 #ff4d4d … チェリー(IAM)対応
 *                 青 #8ad4ff・金 #ffd166 … 対応役なし(汎用の弱・中)
 *
 * 【厳守】役対応色は tone:'hot' と併用しない。逆に tone:'hot' の color は必ず #ff3b30。
 *         こうしておけば「脈打つ赤帯 = 信頼度」「文字だけ赤 = IAM対応」で必ず読み分けられる。
 */

/* ══ U58(2026-08-15)/ 追加18パターンを量産するための共通形 ═══════════
 *
 * zn_sqs_backlog(弱)と zn_hot_cloudtrail(熱)の cues の並びを、
 * **テキストと色だけ差し替えれば増やせる**形に切り出したもの。
 * このファイルは import を持たない方針なので、色は下の定数へ直書きしてある
 * (定義の正は data/zencho.js の ZENCHO_TEXT_COLORS。値を変えるときは両方直す)。
 *
 * 【厳守】U9 の色ルール
 *   ・zenchoBeat  … tone を付けない = **対応役示唆**。color は下の C_* だけを使う
 *   ・zenchoHot   … tone:'hot' + C.HOT = **信頼度示唆**。役対応色とは絶対に併用しない
 * 【厳守】結論は出さない
 *   前兆の1コマは「まだ何も言い切っていない」経過表示なので、
 *   U57 の conclusionCue(結論行)は使わない。当落は zencho_end 側が告げる。
 */

/** U9 の対応役示唆カラー(ZENCHO_TEXT_COLORS.SYMBOL の写し) */
const C = {
  /** 汎用(弱) */
  WEAK: '#8ad4ff',
  /** 汎用(中・熱の平常時) */
  MID: '#ffd166',
  /** スイカ(S3)対応 */
  MELON: '#4ce0a0',
  /** チェリー(IAM)対応 */
  CHERRY: '#ff4d4d',
  /** 信頼度示唆の赤(tone:'hot' と必ずセット) */
  HOT: '#ff3b30',
};

/**
 * 前兆の1コマ(経過表示)。
 * @param {object} p
 * @param {string} p.id
 * @param {string} p.name
 * @param {string} p.pattern data/zencho.js の patterns[].id
 * @param {string} p.text メイン行(${step} で毎ゲーム数字が動く)
 * @param {string} p.sub  サブ行(そのサービスで実際に起きること)
 * @param {string} p.color C.* のどれか
 * @param {string} [p.sfx] 効果音プリセット
 * @param {number} [p.gain]
 * @param {string} [p.particles] 添えるパーティクル(なしなら省略)
 * @param {boolean} [p.lamp] レア役ランプを焚くか(中・熱だけ true)
 */
function zenchoBeat({
  id, name, pattern, text, sub, color,
  sfx = 'ui_select', gain = 0.5, particles = null, lamp = false,
}) {
  return {
    id,
    name,
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: [pattern] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 1800,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: sfx, gain } },
      ...(lamp ? [{ at: 0, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } }] : []),
      // step_up は自分で文字を描かないアニメ(V31-08 の座布団ルールを守れる)
      { at: 60, layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: '$level' } },
      ...(particles
        ? [{ at: 140, layer: 'lcd', action: 'particles', params: { preset: particles, x: 110, y: 150, count: 12 } }]
        : []),
      // 読ませる文字はすべて lcd.text = 座布団つき(V31-08)
      { at: 240, layer: 'lcd', action: 'text', params: { text, sub, color, ms: 1100 } },
      /*
       * 前兆中の相槌(U71)。「あれ?」「なんか来てる…?」あたりが **たまに** ぽつりと鳴る。
       *
       * ■ chance 0.25 の理由
       *   前兆は 3〜5ゲーム続き、そのあいだ毎ゲームこの1コマが出る。
       *   毎回喋ると相棒がうるさくなるので、4回に1回くらい = 前兆1回につき1度あるかないか。
       *   さらに engine/voice.js が「1ゲーム1本 + cooldown 4秒」で二重に抑えるので、
       *   赤文字予兆(下の zenchoHot)と重なった回はどちらか片方しか鳴らない。
       * ■ 断定しない
       *   react は全部が疑問形。ガセ前兆で鳴っても嘘にならない(data/voicepools.js)。
       */
      { at: 620, layer: 'voice', action: 'play', params: { pool: 'react', chance: 0.25 } },
    ],
  };
}

/**
 * 赤文字予兆(信頼度示唆)。強度2以上 かつ 2G目以降でしか出ない。
 * 既存の zn_hot_*(xray / health / guardduty / region_evacuation / cloudtrail)と同じ形。
 *
 * **赤の総量は据え置き**: data/zencho.js 側で「hot 版を持つパターンの重み比」を
 * 追加前と同じに保ってあるので、hot 版を持つ新パターンを足しても
 * 「前兆が赤くなる割合」は変わらない(理由は data/zencho.js の patterns 冒頭)。
 */
function zenchoHot({ id, name, pattern, text, sub, sfx = 'alarm_beep' }) {
  return {
    id,
    name,
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho'], pattern: [pattern], strength: [2, 3], step: [2, 3, 4, 5] },
    },
    weight: { FREE_TIER: 900, default: 0 },
    duration: 2100,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: sfx } },
      { at: 0, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 60, layer: 'overlay', action: 'flash', params: { color: C.HOT, ms: 220 } },
      { at: 120, layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: '$level' } },
      { at: 300, layer: 'lcd', action: 'text',
        params: { text, sub, tone: 'hot', color: C.HOT, ms: 1300 } },
      /*
       * 赤文字予兆の煽り(U71)。tease は「これは…」「激アツ?」「くるかも…」など
       * **全部が疑問形**なので、鳴っても信頼度は漏れない(赤帯そのものが示唆の本体)。
       * 弱い1コマ(zenchoBeat)より少しだけ出やすくして、赤のときの温度差を作る。
       */
      { at: 700, layer: 'voice', action: 'play', params: { pool: 'tease', chance: 0.35 } },
    ],
  };
}

export default [
  // ── 演出パターン(弱)───────────────────────

  {
    id: 'zn_distmap_run',
    name: '【前兆・弱】分散マップの子の実行がリール下を走り抜ける【到達不能・保全】',
    /*
     * IDEAS.md 2-35。賑やかしだが、前兆中に出ている時点で少しだけ期待できる。
     * 2026-08-15 U58: 題材を DeepRacer(2025-12 提供終了)から
     * **Step Functions 分散マップ** へ差し替え。pattern の内部IDは 'deepracer' のまま
     * (data/zencho.js の DEEPRACER のコメント参照。scripts/sim.mjs が読む契約名)。
     *
     * ══ 【到達不能・保全】2026-08-15 椿レビュー #7 ═══════════════════
     * **このシナリオは現在の game/ からは1度も発火しない。**
     * ここが待っているのは汎用の前兆イベント paramChange{ param:'zencho' } だが、
     * game/modes/freetier.js は擬似連パターン(deepracer / codepipeline)のときだけ
     *   「擬似連は自前の chainParam イベントで進行を語るので、
     *     汎用の前兆イベントは出さない(1ゲームに2本流すと後勝ちで先のテロップが消える)」
     * として zenchoStepEvent を **push しない**。したがって
     * pattern:'deepracer' と param:'zencho' が同時に立つことがない。
     * 実際の擬似連の絵は下の dr_pseudo_*(param:'deepracer' を拾う7本)が出している。
     *
     * それでも消していないのは zn_reinvent_stage と同じ理由で、
     *   ・game/ は編集禁止なので、向こう側の分岐が変われば即座に生き返る枠であること
     *   ・distmap_run(リール下を走り抜ける絵)の呼び出し例がここ以外に無く、
     *     yokoku-gimmick.js から使い方をたどる入口になっていること
     * の2つ。**当落にも発火量にも影響しない**(候補に上がらない = 重みも取らない)。
     */
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: ['deepracer'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 1400,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 0,   layer: 'lcd', action: 'particles', params: { preset: 'stream', x: 40, y: 250, count: 10 } },
      { at: 200, layer: 'lcd', action: 'particles', params: { preset: 'stream', x: 200, y: 252, count: 10 } },
      { at: 400, layer: 'lcd', action: 'particles', params: { preset: 'stream', x: 360, y: 254, count: 10 } },
      { at: 460, layer: 'lcd', action: 'text',
        params: { text: 'MAP RUN ${step}', sub: '子の実行が並列に走り出している', color: '#8ad4ff', ms: 900 } },
    ],
  },

  {
    id: 'zn_sqs_backlog',
    name: '【前兆・弱】SQS の未処理メッセージが捌けない',
    // IDEAS.md 2-6「隅の未処理メッセージ数が増えるほど期待度アップ」
    // U67-1: 「保留」はこの台(パチスロ)に無い概念なので実態の語へ統一
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: ['sqs_backlog'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 1700,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'announce' } },
      { at: 60,  layer: 'lcd',  action: 'anim',  params: { anim: 'step_up', step: '$level' } },
      { at: 200, layer: 'lcd',  action: 'text',
        params: { text: 'SQS BACKLOG ${step}', sub: '未処理のメッセージが積み上がっている', color: '#ffd166', ms: 1100 } },
      { at: 240, layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      /*
       * 前兆の入りの相槌(U68 → U71 でプール化)。
       * 「あれ?」「なになに?」「ん?」… のどれかが鳴る。前兆は何ゲームも続くので、
       * 1本固定だと同じ声を繰り返し聞くことになる(pool の詳細は data/voicepools.js)。
       */
      { at: 320, layer: 'voice', action: 'play', params: { pool: 'react', chance: 0.25 } },
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
      /*
       * CZ示唆の相槌(U68 → U71 でプール化)。カナリアリリースは CZ の題材そのもの。
       * tease プールは「チャンスかも?」「これは…」「くるかも…」など **全部が疑問形**なので、
       * どれが鳴っても断定しない = ガセ前兆で鳴っても嘘にならない。
       */
      { at: 700, layer: 'voice', action: 'play', params: { pool: 'tease', chance: 0.28 } },
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
      /*
       * ステージ昇格への願望(U68)。「Invent会場(激アツステージ)に行きたい」。
       * ■ なぜ前兆に貼るのか
       *   ステージ昇格そのものは paramChange で **一瞬で決まって告知される** ので、
       *   「昇格しそう」という前置きの場面が構造的に存在しない。
       *   前兆 = 何かが動いている時間なので、期待を口にする場としてはここが一番近い。
       *   到着の告知(normal.js の stage_up_*)には貼らない — あちらは結果であって願望ではない。
       */
      { at: 800, layer: 'voice',  action: 'play', params: { key: 'luna_stage_invent_01', chance: 0.2 } },
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

  /* ── 2026-08-14 追加の演出パターン ────────────────────────────────
   *
   * 前兆の "絵の種類" を増やして被りを減らすための追加分。
   * **前兆の発生回数は増えない**(総量は data/zencho.js の ZENCHO.fake.denom が握っており、
   * U5 対応で 1/40 → 1/90 へ絞ってある)。ここは「出たときに何が見えるか」の話。
   * 新規アニメは足さず、既存資産(cw_meter_swing / sqs_queue_hold / step_up /
   * bedrock_typing / guardduty_alert / cloudtrail_root_login / stream / spark)で組む。
   */

  {
    id: 'zn_bill_shock',
    name: '【前兆・弱】請求アラートが急上昇していく',
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: ['bill_shock'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 1800,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'alarm_beep', gain: 0.6 } },
      // メーターが振り切れていく = 請求額のグラフ。
      // 針が振り切れるのは「金額が上がった」以上の意味を持たない(当落は断言しない)
      // label を省くと既定の 'CPU UTIL' が出て請求の話にならない(2026-08-15 検証指摘)。
      // EstimatedCharges は CloudWatch の請求メトリクスの実名
      { at: 40,  layer: 'lcd', action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.92, over: true, ms: 1600, label: 'EST. CHARGES' } },
      { at: 260, layer: 'lcd', action: 'particles', params: { preset: 'spark', x: 330, y: 120, count: 8 } },
      // U9: 対応役なし(汎用の中)なので金
      { at: 320, layer: 'lcd', action: 'text',
        params: { text: 'BILLING +${step}00%', sub: '今月の請求額が跳ね上がっている', color: '#ffd166', ms: 1100 } },
      // ステージ昇格への願望(U68)。こちらは1段目の「サミット会場(高確)」版。
      // 貼り先の考え方は zn_xray_trace のコメントを参照
      { at: 760, layer: 'voice', action: 'play', params: { key: 'luna_stage_summit_01', chance: 0.2 } },
    ],
  },

  {
    id: 'zn_glacier_restore',
    name: '【前兆・弱】Glacier からの復元を待っている',
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: ['glacier_restore'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'stream_flow', gain: 0.6 } },
      // 復元の進捗バー。result を渡さない = 'run'(進行中)なので結論は出ない
      { at: 40,  layer: 'lcd',  action: 'anim',  params: { anim: 'deploy_progress', stage: '$level', ms: 1700 } },
      { at: 200, layer: 'lcd',  action: 'particles', params: { preset: 'stream', x: 120, y: 150, count: 10 } },
      // U9: S3(スイカ)対応の示唆なので緑。tone は付けない
      { at: 300, layer: 'lcd',  action: 'text',
        params: { text: 'RESTORE ${step}/5', sub: 'Glacier からの復元が進んでいる', color: '#4ce0a0', ms: 1200 } },
      // 復元が終わるまで待つ場面なので、考え中の顔で眺めている(U71: think)
      { at: 340, layer: 'char', action: 'show', params: { char: 'kiro', pose: 'think' } },
      { at: 1750, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'zn_lambda_coldstart',
    name: '【前兆・弱】コールドスタートで待たされているだけ',
    // ガセ寄りの枠。何も起きないまま引っ張るのがこのパターンの役目なので、
    // 派手なキューは置かず「待たされている」以上のことは言わない
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: ['lambda_coldstart'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 1500,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { at: 40,  layer: 'lcd', action: 'anim',  params: { anim: 'step_up', step: '$level' } },
      // 待たされている間はノートPCを開いて作業(U71: work → coding)。
      // 何も起きないのがこのパターンの役目なので、表情も「手を動かしているだけ」に留める
      { at: 60,  layer: 'char', action: 'show', params: { char: 'kiro', pose: 'work' } },
      { at: 240, layer: 'lcd', action: 'text',
        params: { text: 'INIT… ${step}', sub: 'コールドスタートで少し待たされている', color: '#8ad4ff', ms: 1000 } },
      { at: 1350, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'zn_chatops_incident',
    name: '【前兆・中】Slack に #incident チャンネルが立つ',
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: ['chatops_incident'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'announce' } },
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      // 書き込みが積み上がっていく画。SQS のキューカードを Slack のメッセージに見立てる
      { at: 60,  layer: 'lcd',  action: 'anim',
        params: { anim: 'sqs_queue_hold', count: '$step', level: '$level', x: 12, baseY: 150 } },
      { at: 240, layer: 'char', action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 320, layer: 'lcd',  action: 'text',
        params: { text: '#incident (${step})', sub: '対応メンバーが集まってきた', color: '#ffd166', ms: 1200 } },
      { at: 1800, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'zn_region_evacuation',
    name: '【前兆・強】別リージョンへの退避が始まる(強度3専用)',
    when: { event: 'paramChange', mode: ['FREE_TIER'], match: { param: ['zencho'], pattern: ['region_evacuation'] } },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 2300,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'region_light' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,   layer: 'lcd',     action: 'particles', params: { preset: 'stream', x: 90, y: 130, count: 14 } },
      { at: 200,  layer: 'lcd',     action: 'anim',  params: { anim: 'step_up', step: '$level' } },
      { at: 300,  layer: 'lcd',     action: 'text',
        params: { text: 'EVACUATING ${step}', sub: '別リージョンへ退避を始めた', color: '#ffd166', ms: 1300 } },
      { at: 360,  layer: 'char',    action: 'show', params: { char: 'kiro', pose: 'panic' } },
      { at: 1900, layer: 'char',    action: 'pose', params: { char: 'kiro', pose: 'surprised' } },
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
      // 前兆が伸びきった場面の煽り(U68 → U71 でプール化)。tease は全部が疑問形なので断定しない
      { at: 620,  layer: 'voice',   action: 'play', params: { pool: 'tease', chance: 0.5 } },
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
      // 格上げ = 本前兆が確定した瞬間。確定告知なので間引かない(U68)
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'luna_kita_01', force: true } },
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
      // ガセ終了。肩透かしを食った顔をひとつ挟んでから素へ戻る(U71: cry ではなく sulk。
      // ここは泣くほどの負けではない = 表情の格を場面に合わせる)
      { at: 300,  layer: 'char',  action: 'show', params: { char: 'kiro', pose: 'angry' } },
      { at: 900,  layer: 'lamp',  action: 'pattern', params: { pattern: 'idle' } },
      // 落胆しすぎない「気のせいかな?」「んー…」あたりで流す(U68 → U71 でプール化)
      { at: 1100, layer: 'voice', action: 'play', params: { pool: 'doubt', chance: 0.5 } },
      { at: 1650, layer: 'char',  action: 'pose', params: { char: 'kiro', pose: 'normal' } },
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

  /* ── 分散マップ擬似連(旧 DeepRacer 擬似連)──────────────────────────
   *
   * ゲームロジック(CZ担当実装)からのイベント契約:
   *   paramChange { param:'deepracer', step:1..4, cars:本数, result:null|'cz'|'bonus'|'miss' }
   *   ※ param 名 'deepracer' は **内部の契約キー**。題材は U58 で
   *     AWS Step Functions の分散マップ(Distributed Map)へ差し替えてある。
   *
   * 毎 step で必ず子の実行が走る。step が進むほど本数と速度が上がり、step4 は大量並列の激アツ。
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
    name: '分散マップ擬似連 1回目(子の実行が1本だけ走る)',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['deepracer'], step: [1], result: [null] },
    },
    weight: { FREE_TIER: 2000, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 60,  layer: 'lcd', action: 'anim',
        params: { anim: 'distmap_race', step: 1, cars: '$cars', ms: 2000 } },
      { at: 300, layer: 'lcd', action: 'text',
        params: { text: 'MAP RUN 1', sub: '子の実行が1本だけ走り出した', color: '#8ad4ff', ms: 1000 } },
    ],
  },
  {
    id: 'dr_pseudo_step2',
    name: '分散マップ擬似連 ×2(2本・少し速く)',
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
        params: { anim: 'distmap_race', step: 2, cars: '$cars', label: '×2', ms: 2200 } },
      { at: 1100, layer: 'lcd',    action: 'text',
        params: { text: 'MAP RUN 2', sub: '2本目の実行が並んで走り出した', color: '#7bf7d0', ms: 1000 } },
    ],
  },
  {
    id: 'dr_pseudo_step3',
    name: '分散マップ擬似連 ×3(4本・移行抽選の緊張感)',
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
        params: { anim: 'distmap_race', step: 3, cars: '$cars', label: '×3', ms: 2400 } },
      { at: 900,  layer: 'char',    action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 1400, layer: 'sfx',     action: 'synth', params: { preset: 'countdown_tick' } },
      { at: 1500, layer: 'lcd',     action: 'text',
        params: { text: 'MAP RUN 3', sub: '4本が同時に走っている', color: '#ffd166', ms: 1100 } },
    ],
  },
  {
    id: 'dr_pseudo_step4',
    name: '分散マップ擬似連 ×4(大量並列・激アツ)',
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
        params: { anim: 'distmap_race', step: 4, cars: '$cars', label: '×4', ms: 3000 } },
      { at: 700,  layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 900,  layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'premium' } },
      { at: 940,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'zoom' } },
      { at: 1200, layer: 'overlay', action: 'particles', params: { preset: 'rainbow', x: 360, y: 380, count: 26 } },
      // 結論は出さない。ここは「大量に走ってきた」画までで、当落は result 側が告げる
      { at: 1600, layer: 'lcd',     action: 'text',
        params: { text: 'MAX CONCURRENCY', sub: '子の実行が一斉に立ち上がった', color: '#ffe066', ms: 1400 } },
    ],
  },

  {
    id: 'dr_pseudo_result_cz',
    name: '分散マップ擬似連 → CZ突入【result:cz のときだけ】',
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
        params: { anim: 'distmap_race', step: '$step', cars: '$cars', ms: 2200 } },
      { at: 900,  layer: 'overlay', action: 'flash', params: { color: '#7bf7d0', ms: 300 } },
      { at: 920,  layer: 'overlay', action: 'shake', params: { power: 12, ms: 420 } },
      { at: 960,  layer: 'sfx',     action: 'synth', params: { preset: 'upgrade_chime' } },
      { at: 1000, layer: 'char',    action: 'show', params: { char: 'kiro', pose: 'happy' } },
      { at: 1060, layer: 'lcd',     action: 'text',
        params: { text: '全実行 SUCCEEDED — CZ突入', sub: '子の実行が全部そろって返ってきた!', color: '#7bf7d0', ms: 1900 } },
      { at: 1300, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_reg' } },
    ],
  },
  {
    id: 'dr_pseudo_result_bonus',
    name: '分散マップ擬似連 → ボーナス確定【result:bonus のときだけ】',
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
        params: { anim: 'distmap_race', step: 4, cars: '$cars', ms: 2600 } },
      { at: 900,  layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 940,  layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'premium' } },
      { at: 980,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'zoom' } },
      // 「確定」を含むので可読性エンジンが自動で sticky にする
      { at: 1060, layer: 'lcd',     action: 'text',
        params: { text: 'BONUS 確定!!', sub: '1万並列まで振り切った', color: '#ffe066', ms: 2200 } },
      { at: 1400, layer: 'overlay', action: 'particles', params: { preset: 'rainbow', x: 360, y: 400, count: 34 } },
    ],
  },
  {
    id: 'dr_pseudo_result_miss',
    name: '【ガセ】分散マップ擬似連 実行失敗【result:miss のときだけ】',
    // 非当選が確定したイベントでしか来ない。ここからCZ/ボーナスへ向かう経路は無い
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['deepracer'], result: ['miss'] },
    },
    weight: { FREE_TIER: 3000, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'lcd',  action: 'anim',
        params: { anim: 'distmap_race', step: '$step', cars: '$cars', ms: 1800 } },
      { at: 800, layer: 'sfx',  action: 'synth', params: { preset: 'error_buzz', gain: 0.6 } },
      { at: 860, layer: 'char', action: 'show', params: { char: 'kiro', pose: 'normal' } },
      { at: 900, layer: 'lcd',  action: 'text',
        params: { text: 'FAILED', sub: '子の実行が途中で落ちた…', color: '#8aa0b4', ms: 1200 } },
      { at: 1200, layer: 'lamp', action: 'pattern', params: { pattern: 'idle' } },
    ],
  },

  /* ── CodePipeline 擬似連(2026-08-14 追加)──────────────────────────
   *
   * ゲームロジックからのイベント契約:
   *   paramChange { param:'codepipeline', step:1..4, stage:'Source'|'Build'|'Test'|'Deploy',
   *                 result:null|'cz'|'bonus'|'miss' }
   *
   * 分散マップ擬似連(dr_pseudo_*)と同じ骨格。param を分けてあるので絵を取り違えない。
   * **擬似連の総発生量は据え置き**(data/zencho.js で分散マップ側と weight を分け合っている)。
   *
   * ■ 整合の担保(dr_pseudo_* と同じ)
   *   step だけのイベント(result:null)は結論を出さない。進捗バーとステージ名だけ。
   *   突入・確定の画は result が来たときにしか出さない。
   */
  {
    id: 'cp_pseudo_step1',
    name: 'CodePipeline擬似連 1回目(Source を取得)',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['codepipeline'], step: [1], result: [null] },
    },
    weight: { FREE_TIER: 2000, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 60,  layer: 'lcd', action: 'anim',
        params: { anim: 'deploy_progress', stage: 1, ms: 2000 } },
      { at: 300, layer: 'lcd', action: 'text',
        params: { text: 'STAGE: ${stage}', sub: 'ソースを取得した', color: '#8ad4ff', ms: 1000 } },
    ],
  },
  {
    id: 'cp_pseudo_step2',
    name: 'CodePipeline擬似連 ×2(Build が走り出す)',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['codepipeline'], step: [2], result: [null] },
    },
    weight: { FREE_TIER: 2000, default: 0 },
    duration: 2400,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#8ad4ff', ms: 180 } },
      { at: 60,   layer: 'lcd',     action: 'anim',
        params: { anim: 'deploy_progress', stage: 2, ms: 2200 } },
      { at: 1100, layer: 'lcd',     action: 'text',
        params: { text: 'STAGE: ${stage}', sub: 'ビルドが走り出した', color: '#7bf7d0', ms: 1000 } },
    ],
  },
  {
    id: 'cp_pseudo_step3',
    name: 'CodePipeline擬似連 ×3(Test 通過。移行抽選の緊張感)',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['codepipeline'], step: [3], result: [null] },
    },
    weight: { FREE_TIER: 2000, default: 0 },
    duration: 2600,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffd166', ms: 220 } },
      { at: 60,   layer: 'lcd',     action: 'anim',
        params: { anim: 'deploy_progress', stage: 3, ms: 2400 } },
      { at: 900,  layer: 'char',    action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { at: 1400, layer: 'sfx',     action: 'synth', params: { preset: 'countdown_tick' } },
      { at: 1500, layer: 'lcd',     action: 'text',
        params: { text: 'STAGE: ${stage}', sub: 'テストを通過した', color: '#ffd166', ms: 1100 } },
    ],
  },
  {
    id: 'cp_pseudo_step4',
    name: 'CodePipeline擬似連 ×4(Deploy へ到達。激アツ)',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['codepipeline'], step: [4], result: [null] },
    },
    weight: { FREE_TIER: 2000, default: 0 },
    duration: 3200,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 320 } },
      { at: 20,   layer: 'overlay', action: 'shake', params: { power: 18, ms: 620 } },
      { at: 60,   layer: 'lcd',     action: 'anim',
        params: { anim: 'deploy_progress', from: 0.86, to: 0.97, ms: 3000 } },
      { at: 700,  layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 900,  layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'premium' } },
      { at: 940,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'zoom' } },
      { at: 1200, layer: 'overlay', action: 'particles', params: { preset: 'rainbow', x: 360, y: 380, count: 26 } },
      // 結論は出さない。「本番反映の直前まで来た」画までで、当落は result 側が告げる
      { at: 1600, layer: 'lcd',     action: 'text',
        params: { text: 'STAGE: ${stage}', sub: '本番環境へ流れ込む', color: '#ffe066', ms: 1400 } },
    ],
  },

  {
    id: 'cp_pseudo_result_cz',
    name: 'CodePipeline擬似連 → CZ突入【result:cz のときだけ】',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['codepipeline'], result: ['cz'] },
    },
    weight: { FREE_TIER: 3000, default: 0 },
    duration: 3000,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,   layer: 'lcd',     action: 'anim',
        params: { anim: 'deploy_progress', stage: 3, ms: 2200 } },
      { at: 900,  layer: 'overlay', action: 'flash', params: { color: '#7bf7d0', ms: 300 } },
      { at: 920,  layer: 'overlay', action: 'shake', params: { power: 12, ms: 420 } },
      { at: 960,  layer: 'sfx',     action: 'synth', params: { preset: 'upgrade_chime' } },
      { at: 1000, layer: 'char',    action: 'show', params: { char: 'kiro', pose: 'happy' } },
      // 「突入」を含むので可読性エンジンが自動で sticky にする
      { at: 1060, layer: 'lcd',     action: 'text',
        params: { text: 'TEST 全通過 — CZ突入', sub: 'デプロイ承認が下りた', color: '#7bf7d0', ms: 1900 } },
      { at: 1300, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_reg' } },
    ],
  },
  {
    id: 'cp_pseudo_result_bonus',
    name: 'CodePipeline擬似連 → ボーナス確定【result:bonus のときだけ】',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['codepipeline'], result: ['bonus'] },
    },
    weight: { FREE_TIER: 3000, default: 0 },
    duration: 3400,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 380 } },
      { at: 20,   layer: 'overlay', action: 'shake', params: { power: 20, ms: 700 } },
      { at: 60,   layer: 'lcd',     action: 'anim',
        params: { anim: 'deploy_progress', from: 0.62, result: 'success', ms: 2600 } },
      { at: 900,  layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 940,  layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'premium' } },
      { at: 980,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'zoom' } },
      // 「確定」を含むので可読性エンジンが自動で sticky にする
      { at: 1060, layer: 'lcd',     action: 'text',
        params: { text: 'BONUS 確定!!', sub: '本番環境へデプロイ完了', color: '#ffe066', ms: 2200 } },
      { at: 1400, layer: 'overlay', action: 'particles', params: { preset: 'rainbow', x: 360, y: 400, count: 34 } },
    ],
  },
  {
    id: 'cp_pseudo_result_miss',
    name: '【ガセ】CodePipeline擬似連 ロールバック【result:miss のときだけ】',
    // 非当選が確定したイベントでしか来ない。ここからCZ/ボーナスへ向かう経路は無い
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['codepipeline'], result: ['miss'] },
    },
    weight: { FREE_TIER: 3000, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,    layer: 'lcd',  action: 'anim',
        params: { anim: 'deploy_progress', result: 'rollback', ms: 1800 } },
      { at: 800,  layer: 'sfx',  action: 'synth', params: { preset: 'error_buzz', gain: 0.6 } },
      { at: 860,  layer: 'char', action: 'show', params: { char: 'kiro', pose: 'normal' } },
      { at: 900,  layer: 'lcd',  action: 'text',
        params: { text: 'ROLLBACK', sub: 'デプロイは巻き戻された…', color: '#8aa0b4', ms: 1200 } },
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
        params: { text: '全メッセージ処理完了 — 突入', sub: 'Amazon SQS — キューが空になった', color: '#4ce0a0', ms: 2000 } },
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
        params: { text: '再処理は打ち切り', sub: 'Amazon SQS — 処理できずデッドレターキューへ', color: '#ff8a8a', ms: 1400 } },
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
    id: 'zn_hot_region_evacuation',
    name: '【赤】退避先リージョンが次々に切り替わる(強度3専用)',
    /*
     * 2026-08-14 追加。region_evacuation は minStrength:3 なので、
     * このシナリオは **必ず強度3のときにしか出ない**(= 既存の赤より一段信頼できる)。
     *
     * 【赤を増やしたぶんの手当て】
     * 赤を1本足すと「赤 = 確定」へ寄る。裏切り枠(構造的に必ず空振りする赤)を
     * 同じだけ増やして相殺している。既存の裏切り枠 yh_hot_false_alarm は
     * 別担当のファイル(yokoku-heavy.js)なので触らず、
     * data/scenarios/yokoku-wind.js に yw_hot_false_evacuation を新設した。
     * 実測での最終調整はバランス担当へ申し送り。
     */
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho'], pattern: ['region_evacuation'], strength: [2, 3], step: [2, 3, 4, 5] },
    },
    weight: { FREE_TIER: 900, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'region_light' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,  layer: 'overlay', action: 'flash', params: { color: '#ff3b30', ms: 220 } },
      { at: 100, layer: 'lcd',     action: 'particles', params: { preset: 'stream', x: 90, y: 130, count: 18 } },
      { at: 200, layer: 'lcd',     action: 'anim',  params: { anim: 'step_up', step: '$level' } },
      // 信頼度示唆の赤。tone:'hot' + #ff3b30 のセットで「赤帯」になる(U9 の色ルール)
      { at: 300, layer: 'lcd',     action: 'text',
        params: { text: 'EVACUATE ×${step}', sub: '退避先が次々に切り替わる', tone: 'hot', color: '#ff3b30', ms: 1400 } },
      { at: 360, layer: 'char',    action: 'show', params: { char: 'kiro', pose: 'panic' } },
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
  /* ══ U58(2026-08-15)追加分の演出 ═══════════════════════════════════
   *
   * data/zencho.js に足した18パターンの受け皿。全部 zenchoBeat / zenchoHot の共通形で、
   * **前兆の発生量は1回も増えない**(重みはグループ合計を固定して分け合っている)。
   * 中(7)と熱(3)には赤文字版(zn_hot_*)を必ず1本ずつ持たせてある。
   */

  /* ── 弱(青 / 対応役があるものはその色)8本 ───────────────────── */
  zenchoBeat({
    id: 'zn_ec2_mac',
    name: '【前兆・弱】EC2 Mac インスタンス(実機を借りた)',
    pattern: 'ec2_mac',
    /*
     * 2026-08-15 ユーザー指摘 U64-1「文言が意味不明」対応。
     * 旧: text 'DEDICATED ${step}' / sub 'Mac ホストは24時間は解放できない'
     *   → 「DEDICATED」も「最低確保」も社内語で、何の話か伝わらなかった。
     * 新: 起きた出来事(実機を確保した)を主役にして、24時間の縛りは
     *     「返却できるのは24時間後」と日常語で添える。
     *     step の数字は step_up アニメが出しているので文字からは外した。
     * data/zencho.js の ec2_mac.telop も同じ言い回しに揃えてある。
     */
    text: 'MAC 実機を確保',
    sub: 'Mac の実機を借りた — 返却できるのは24時間後',
    color: C.WEAK,
  }),
  zenchoBeat({
    id: 'zn_device_farm',
    name: '【前兆・弱】Device Farm の実機ラックが一斉に点灯する',
    pattern: 'device_farm',
    text: 'DEVICES ×${step}',
    sub: '実機のスマホが一斉に画面点灯した',
    color: C.WEAK,
    sfx: 'ui_select',
    particles: 'spark',
  }),
  zenchoBeat({
    id: 'zn_session_manager',
    name: '【前兆・弱】Session Manager で踏み台なしのシェルが開く',
    pattern: 'session_manager',
    text: 'SESSION ${step}',
    sub: '踏み台も鍵もなくシェルが1本開いた',
    // 権限(IAM)の話なので U9 の赤(tone は付けない)
    color: C.CHERRY,
  }),
  zenchoBeat({
    id: 'zn_logs_insights',
    name: '【前兆・弱】CloudWatch Logs Insights が数件だけ返す',
    pattern: 'logs_insights',
    text: 'HITS ${step}',
    sub: '大量のログをなめて数件だけ返ってきた',
    color: C.WEAK,
    sfx: 'countdown_tick',
    gain: 0.5,
  }),
  zenchoBeat({
    id: 'zn_datasync_night',
    name: '【前兆・弱】DataSync が夜間にファイルを渡している',
    pattern: 'datasync_night',
    text: 'SYNC ${step}/5',
    sub: 'オンプレのファイルが少しずつ渡っている',
    // 着地先は S3。スイカ対応なので緑
    color: C.MELON,
    sfx: 'stream_flow',
    gain: 0.55,
    particles: 'stream',
  }),
  zenchoBeat({
    id: 'zn_transfer_sftp',
    name: '【前兆・弱】Transfer Family の SFTP がまだ1本つながっている',
    pattern: 'transfer_sftp',
    text: 'SFTP ${step}',
    sub: '昔ながらの経路で S3 へ出し入れしている',
    color: C.MELON,
    sfx: 'stream_flow',
    gain: 0.45,
  }),
  zenchoBeat({
    id: 'zn_route53_resolver',
    name: '【前兆・弱】Route 53 Resolver の名前解決が外を向く',
    pattern: 'route53_resolver',
    text: 'RESOLVE ${step}',
    sub: 'VPC の中の名前解決が1回だけ外を向いた',
    color: C.WEAK,
  }),
  zenchoBeat({
    id: 'zn_cost_anomaly',
    name: '【前兆・弱】Cost Anomaly Detection が違和感を覚える',
    pattern: 'cost_anomaly',
    text: 'ANOMALY ${step}',
    sub: '今月の使い方が普段と違うらしい',
    color: C.WEAK,
    sfx: 'alarm_beep',
    gain: 0.45,
  }),

  /* ── 中(金 / 対応役があるものはその色)7本 + 赤文字版 ───────────── */
  zenchoBeat({
    id: 'zn_vpc_lattice',
    name: '【前兆・中】VPC Lattice がサービス同士を名前で結線する',
    pattern: 'vpc_lattice',
    text: 'LINKED ×${step}',
    sub: 'サービス同士が名前だけで結線された',
    color: C.MID,
    sfx: 'announce',
    lamp: true,
  }),
  zenchoHot({
    id: 'zn_hot_vpc_lattice',
    name: '【赤】VPC Lattice の結線が増え続ける',
    pattern: 'vpc_lattice',
    text: 'LINKED ×${step}',
    sub: '結線が次々に増えていく',
    sfx: 'announce',
  }),

  zenchoBeat({
    id: 'zn_clean_rooms',
    name: '【前兆・中】Clean Rooms が重なりだけを見つける',
    pattern: 'clean_rooms',
    text: 'OVERLAP ${step}',
    sub: '相手の生データを見ずに重なりが分かった',
    color: C.MID,
    sfx: 'checklist_ok',
    lamp: true,
  }),
  zenchoHot({
    id: 'zn_hot_clean_rooms',
    name: '【赤】Clean Rooms の重なりが広がり続ける',
    pattern: 'clean_rooms',
    text: 'OVERLAP ×${step}',
    sub: '重なりがどんどん見えてきた',
    sfx: 'charge_up',
  }),

  zenchoBeat({
    id: 'zn_entity_resolution',
    name: '【前兆・中】Entity Resolution が別レコードを同一人物と判定する',
    pattern: 'entity_resolution',
    text: 'MATCHED ×${step}',
    sub: '別々の顧客レコードが同一人物と判定された',
    color: C.MID,
    sfx: 'ui_select',
    gain: 0.6,
    lamp: true,
  }),
  zenchoHot({
    id: 'zn_hot_entity_resolution',
    name: '【赤】Entity Resolution の一致が止まらない',
    pattern: 'entity_resolution',
    text: 'MATCHED ×${step}',
    sub: '同一人物が次々に見つかる',
    sfx: 'charge_up',
  }),

  zenchoBeat({
    id: 'zn_ram_share',
    name: '【前兆・中】Resource Access Manager が隣のアカウントへ共有する',
    pattern: 'ram_share',
    text: 'SHARED ×${step}',
    sub: '隣のアカウントへサブネットが共有された',
    // アカウントをまたぐ権限の話なので U9 の赤(tone は付けない)
    color: C.CHERRY,
    sfx: 'contract_sign',
    gain: 0.6,
    lamp: true,
  }),
  zenchoHot({
    id: 'zn_hot_ram_share',
    name: '【赤】Resource Access Manager の共有先が増え続ける',
    pattern: 'ram_share',
    text: 'SHARED ×${step}',
    sub: '共有先が増え続けている',
    sfx: 'contract_sign',
  }),

  zenchoBeat({
    id: 'zn_kb_citation',
    name: '【前兆・中】Bedrock Knowledge Bases が根拠を引いてくる',
    pattern: 'kb_citation',
    text: 'CITATION ${step}',
    sub: '社内文書から根拠が1件、引かれてきた',
    color: C.MID,
    sfx: 'announce',
    lamp: true,
  }),
  zenchoHot({
    id: 'zn_hot_kb_citation',
    name: '【赤】Bedrock Knowledge Bases の根拠が次々に出てくる',
    pattern: 'kb_citation',
    text: 'CITATION ×${step}',
    sub: '根拠が次々に引かれてくる',
    sfx: 'announce',
  }),

  zenchoBeat({
    id: 'zn_mwaa_dag',
    name: '【前兆・中】MWAA の DAG が依存を解いて走り出す',
    pattern: 'mwaa_dag',
    text: 'DAG ${step}',
    sub: '依存が解けてタスクが走り出した',
    color: C.MID,
    sfx: 'dynamo_scale',
    lamp: true,
  }),
  zenchoHot({
    id: 'zn_hot_mwaa_dag',
    name: '【赤】MWAA のタスクが止まらない',
    pattern: 'mwaa_dag',
    text: 'DAG ×${step}',
    sub: '走り出したタスクが止まらない',
    sfx: 'dynamo_scale',
  }),

  zenchoBeat({
    id: 'zn_local_zones',
    name: '【前兆・中】Local Zones へ処理が寄っていく',
    pattern: 'local_zones',
    text: 'LOCAL ZONE ${step}',
    sub: '大都市の出島側へ処理が寄っていった',
    color: C.MID,
    sfx: 'region_light',
    lamp: true,
    particles: 'stream',
  }),
  zenchoHot({
    id: 'zn_hot_local_zones',
    name: '【赤】Local Zones 側へ処理が全部寄っていく',
    pattern: 'local_zones',
    text: 'LOCAL ×${step}',
    sub: '処理が全部エッジ側へ寄っていく',
    sfx: 'region_light',
  }),

  /* ── 熱(強度3専用)3本 + 赤文字版 ──────────────────────────── */
  zenchoBeat({
    id: 'zn_fis_az_down',
    name: '【前兆・強】Fault Injection Service が AZ 全電源断を投入する(強度3専用)',
    pattern: 'fis_az_down',
    text: 'AZ INJECTION ${step}',
    sub: 'AZ 全電源断のシナリオが投入された',
    color: C.MID,
    sfx: 'error_buzz',
    lamp: true,
  }),
  zenchoHot({
    id: 'zn_hot_fis_az_down',
    name: '【赤】注入した障害が広がり続ける(強度3専用)',
    pattern: 'fis_az_down',
    text: 'AZ DOWN ×${step}',
    sub: '注入した障害が広がり続けている',
    sfx: 'error_buzz',
  }),

  zenchoBeat({
    id: 'zn_trainium_cluster',
    name: '【前兆・強】Trainium の学習クラスタに火が入る(強度3専用)',
    pattern: 'trainium_cluster',
    text: 'TRN CLUSTER ${step}',
    sub: '学習専用チップのクラスタに火が入った',
    color: C.MID,
    sfx: 'charge_up',
    lamp: true,
    particles: 'spark',
  }),
  zenchoHot({
    id: 'zn_hot_trainium_cluster',
    name: '【赤】Trainium のクラスタが次々に立ち上がる(強度3専用)',
    pattern: 'trainium_cluster',
    text: 'TRN ×${step}',
    sub: 'クラスタが次々に立ち上がる',
    sfx: 'charge_up',
  }),

  zenchoBeat({
    id: 'zn_dtt_ingest',
    name: '【前兆・強】Data Transfer Terminal がディスクを吸い上げる(強度3専用)',
    pattern: 'dtt_ingest',
    text: 'INGEST ${step}',
    sub: '持ち込んだディスクを高速で吸い上げている',
    color: C.MID,
    sfx: 'stream_flow',
    lamp: true,
    particles: 'stream',
  }),
  zenchoHot({
    id: 'zn_hot_dtt_ingest',
    name: '【赤】Data Transfer Terminal の吸い上げが止まらない(強度3専用)',
    pattern: 'dtt_ingest',
    text: 'INGEST ×${step}',
    sub: '吸い上げが止まらない',
    sfx: 'stream_flow',
  }),
];
