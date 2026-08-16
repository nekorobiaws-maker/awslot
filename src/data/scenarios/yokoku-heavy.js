/**
 * 強予告・カットイン系シナリオ(担当C)。DESIGN.md 6.5 / IDEAS.md 2章・4章
 *
 * 「実は激アツ」系のカットイン(GuardDuty / WAF / IAMロール / CloudTrail)は
 * hit(レア役で高weight) / gase(通常ハズレ等で低weight+低chance) のペアで用意し、
 * 見た目の熱さと実際の期待度が一致しない「強予告のガセ」を成立させている
 * (`when.expectationRange` は director.js 実装はあるが、どのイベントpayloadにも
 * `ctx.expectation` が乗っておらず死に機能のため、この hit/gase ペア方式で代用した)。
 *
 * 新規カットイン(guardduty_alert / waf_shield_block / iam_admin_badge /
 * cloudtrail_root_login)は `src/staging/anims/cutins-extra.js` の `CUTINS_EXTRA` に実装。
 * 既存 cutins.js への統合は統合担当に依頼(ファイル冒頭コメント参照)。
 *
 * ここに追記するだけで演出が増える。ゲームロジックには一切影響しない。
 *
 * ■ 出現条件の書き方(2026-08-13 修正)
 *   hit 系はもともと `notMode: ['BONUS','AS_RUSH']` だけで絞っていたが、director は
 *   weight[mode] ?? weight.default で重みを取るため、CZ・BONUS_READY・派生ゾーン・
 *   上位AT・エンディングでも default の重みで発火していた
 *   (ボーナス確定後の入賞待ちに「GUARDDUTY ALERT!!」等が出て情報として嘘になる)。
 *   yokoku-light / yokoku-gimmick と同じく `mode: ['FREE_TIER']` +
 *   `weight: { FREE_TIER: N, default: 0 }` の形へ統一した。
 *   併せて weight を 250〜550 → 70〜160 へ下げ、弱中予告(yl_*)が
 *   強レア役でも出番を持てるようにしている。
 */

export default [
  // ── GuardDuty 警告カットイン。IDEAS.md 2-10「不審なアクセス検知」ポップアップは実は激アツ前兆 ──
  {
    id: 'yh_guardduty_hit',
    name: 'GuardDuty警告カットイン(本物・レア役)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'MELON', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 120, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 40,  layer: 'overlay', action: 'cutin',  params: { id: 'guardduty_alert' } },
      { at: 60,  layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'surprised' } },
      /*
       * 煽りの相槌(U68)。**本物版とガセ版の両方に同じ声を同じ確率で貼る**ので、
       * 「喋ったかどうか」から本物かガセかは読めない(信頼度は演出のまま変わらない)。
       * 断定しない疑問形なので、外れても嘘をついたことにならない。
       *
       * U81(2026-08-16)でこのファイルの tease を一律 0.3 → 0.5 にした。
       * **本物版とガセ版を必ず同じ値で動かすこと**(片方だけ上げた瞬間に
       * 「声が鳴ったら本物」が成立してしまう)。この6か所は3組の対になっている。
       */
      { at: 420, layer: 'voice',   action: 'play',   params: { pool: 'tease', chance: 0.5 } },
      { waitFor: 'stop2', layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
      { waitFor: 'stop3', after: 100, layer: 'sfx',  action: 'synth', params: { preset: 'cutin_whoosh' } },
      { waitFor: 'stop3', after: 200, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
    ],
  },
  {
    id: 'yh_guardduty_gase',
    name: '【ガセ】GuardDuty警告カットイン(通常ハズレ・ベルでも出る)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.02,
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 40,  layer: 'overlay', action: 'cutin',  params: { id: 'guardduty_alert' } },
      // 本物版(yh_guardduty_hit)と同じ声・同じ確率。声で当たりかどうかは分からない
      { at: 420, layer: 'voice',   action: 'play',   params: { pool: 'tease', chance: 0.5 } },
      { waitFor: 'stop2', layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
      { waitFor: 'stop3', after: 300, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  // ── WAF ブロックカットイン。IDEAS.md 2-19「敵アクセスを弾く爽快演出」は実は激アツ前兆 ──
  {
    id: 'yh_waf_block_hit',
    name: 'WAFブロックカットイン(本物・サメ揃い)',
    when: { event: 'leverOn', flag: ['SHARK'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 140, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,  layer: 'overlay', action: 'cutin',  params: { id: 'waf_shield_block' } },
      { waitFor: 'stop2', layer: 'sfx', action: 'synth', params: { preset: 'error_buzz' } },
      { waitFor: 'stop3', after: 100, layer: 'overlay', action: 'shake', params: { power: 10, ms: 300 } },
      { waitFor: 'stop3', after: 150, layer: 'sfx',      action: 'synth', params: { preset: 'cutin_whoosh' } },
    ],
  },
  {
    id: 'yh_waf_block_gase',
    name: '【ガセ】WAFブロックカットイン(通常ハズレ・リプレイでも出る)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    chance: 0.025,
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 60,  layer: 'overlay', action: 'cutin',  params: { id: 'waf_shield_block' } },
      { waitFor: 'stop3', after: 200, layer: 'sfx', action: 'synth', params: { preset: 'error_buzz' } },
    ],
  },

  // ── IAMロールカットイン(サメがAdministratorAccessバッジ装着)。IDEAS.md 2-12 ──
  {
    id: 'yh_iam_admin_badge_hit',
    name: 'IAMロールカットイン(本物・強チェリー/チャンス目)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 110, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'rare_flag' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,  layer: 'char',    action: 'hide',   params: { char: 'kiro' } },
      { at: 60,  layer: 'overlay', action: 'cutin',  params: { id: 'iam_admin_badge' } },
      // 煽り(U68)。ガセ版にも同じ声・同じ確率で貼ってある
      { at: 440, layer: 'voice',   action: 'play',   params: { pool: 'tease', chance: 0.5 } },
      { waitFor: 'stop2', layer: 'sfx', action: 'synth', params: { preset: 'contract_sign' } },
      { waitFor: 'stop3', after: 150, layer: 'sfx',  action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 200, layer: 'char', action: 'show',  params: { char: 'kiro', pose: 'happy' } },
    ],
  },
  {
    id: 'yh_iam_admin_badge_gase',
    name: '【ガセ】IAMロールカットイン(弱チェリー/スイカでも出る)',
    when: { event: 'leverOn', flag: ['WEAK_CHERRY', 'MELON'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 40, default: 0 },
    chance: 0.06,
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'rare_flag' } },
      { at: 60,  layer: 'overlay', action: 'cutin',  params: { id: 'iam_admin_badge' } },
      // 本物版(yh_iam_admin_badge_hit)と同じ声・同じ確率
      { at: 440, layer: 'voice',   action: 'play',   params: { pool: 'tease', chance: 0.5 } },
      { waitFor: 'stop3', after: 200, layer: 'sfx', action: 'synth', params: { preset: 'contract_sign' } },
    ],
  },

  // ── CloudTrailログ流れ予告。IDEAS.md 2-23「Root User Login」の文字が出たら激アツ ──
  {
    id: 'yh_cloudtrail_root_login_hit',
    name: 'CloudTrail Root User Loginカットイン(本物・最上位レア役)',
    when: { event: 'leverOn', flag: ['SHARK', 'GHOST'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 160, default: 0 },
    duration: 2300,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'announce' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,  layer: 'overlay', action: 'cutin',  params: { id: 'cloudtrail_root_login' } },
      // いちばん熱い煽り(U68)。ここも疑問形。ガセ版にも同じ声・同じ確率で貼ってある
      { at: 460, layer: 'voice',   action: 'play',   params: { pool: 'tease', chance: 0.5 } },
      { waitFor: 'stop2', layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop3', after: 100, layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { waitFor: 'stop3', after: 200, layer: 'overlay', action: 'shake', params: { power: 14, ms: 400 } },
    ],
  },
  {
    id: 'yh_cloudtrail_root_login_gase',
    name: '【ガセ】CloudTrailログ流れ予告(通常ハズレ・ベルでも出る)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 35, default: 0 },
    chance: 0.015,
    duration: 2300,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'announce' } },
      { at: 60,  layer: 'overlay', action: 'cutin',  params: { id: 'cloudtrail_root_login' } },
      // 本物版(yh_cloudtrail_root_login_hit)と同じ声・同じ確率
      { at: 460, layer: 'voice',   action: 'play',   params: { pool: 'tease', chance: 0.5 } },
      { waitFor: 'stop3', after: 200, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
    ],
  },

  /* ── Bedrockストリーミング生成予告。IDEAS.md 2-28 / docs/BACKLOG.md「P」────────
   *
   * 生成される文言で期待度を示唆する。文言は
   *   staging/anims/lcdanims-extra.js の BEDROCK_LINES
   *   (弱6 / Bedrock揃い6 / 中6 / ガセ6 / 激アツ5 = 29種)
   * に配列で置き、`bedrock_typing` アニメが tier ごとに演出用RNG(Math.random)で引く。
   * ゲーム抽選RNGは一切消費しないので、文言を足してもバランスは動かない。
   *
   * ■ 見せ方は「トークンのストリーミング出力」(2026-08-13 ユーザー要望)
   *   等速タイプライターではなく、2〜5文字のチャンクが不揃いな間合いで届き、
   *   途中に「推論の間」が入る。パネル上部のステータス行が
   *   PROMPT受信 → 推論中… → ストリーミング出力 → 推論完了 と遷移し、
   *   トークンカウンタがカタカタ増える。文言も「引き当てた」ではなく
   *   「生成しました / 出力しました / 推論の結果、〜」で統一している。
   *
   * ■ 「BONUS」を含む文言は当選ゲーム限定
   *   BONUS 入りの文言は tier:'hot' にしか存在せず、pickBedrockLine() は
   *   hot 以外で BONUS を含む文言を機械的に除外する。そのうえで hot を渡すのは
   *     yh_bedrock_typing_hit … 前兆の結果告知(zencho_end / ENTRY / BONUS・AT)
   *                             = 当選を保持した前兆の最終Gにしか流れない
   *   の **1本だけ**。when 条件だけで当選が確定しているので、
   *   **画面に BONUS と出たら 100% 当たっている**。
   *   非当選側(gase / bluff / idle)は tier を weak・mid・gase しか指定しない。
   *
   *   ※ 以前あった yh_bedrock_typing_ready(BONUS_READY のレバーONで発火)は
   *      削除した(2026-08-13 ユーザー指示)。確定後は「図柄を揃えろ」に集中する
   *      場面で、生成演出を挟むのは冗長という判断。入賞待ちの賑やかしは
   *      他シナリオ側に任せる。
   *
   * ■ 出力し終わりのテロップ
   *   盤面(パネル)は y44〜120、告知テロップ(lcd.text)は y168〜236 と場所が違うので、
   *   出力し終わりの一言だけ可読性エンジン(最低表示時間 + sticky)へ乗せている。
   */
  {
    id: 'yh_bedrock_typing_hit',
    name: 'Bedrock生成予告(当選確定・BONUS を出力し切る)',
    // 前兆が当選を保持したまま最終Gへ到達したときにしか出ないイベント = ボーナス/AT確定。
    // 直後にモード遷移(= lcdAnims.clear())が走るため、キューは at:0 を使わず 40ms から始める。
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_end'], value: ['ENTRY'], to: ['BONUS', 'AT'] },
    },
    weight: { FREE_TIER: 400, default: 0 },
    duration: 3000,
    cues: [
      { at: 40,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 40,   layer: 'lamp', action: 'pattern', params: { pattern: 'bonus' } },
      // キュー間隔 400ms に合わせて revealSpan を詰める(既定 468ms だと流し切る前に差し替わる)
      { at: 60,   layer: 'lcd',  action: 'anim',
        params: { anim: 'bedrock_typing', tier: 'hot', phase: 0, revealSpan: 0.15 } },
      { at: 500,  layer: 'lcd',  action: 'anim',
        params: { anim: 'bedrock_typing', tier: 'hot', phase: 1, revealSpan: 0.15 } },
      { at: 900,  layer: 'lcd',  action: 'anim',
        params: { anim: 'bedrock_typing', tier: 'hot', phase: 2, revealSpan: 0.15 } },
      { at: 1300, layer: 'lcd',  action: 'anim',
        params: { anim: 'bedrock_typing', tier: 'hot', phase: 3, ms: 2000, revealSpan: 0.16 } },
      { at: 1420, layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 300 } },
      { at: 1440, layer: 'overlay', action: 'shake', params: { power: 14, ms: 460 } },
      { at: 1480, layer: 'sfx',     action: 'synth', params: { preset: 'upgrade_chime' } },
      { at: 1520, layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'premium' } },
      { at: 1560, layer: 'lcd',     action: 'text',
        params: { text: 'BONUS 生成完了', sub: '推論の結果、BONUS を出力した', ms: 1800, color: '#ff8a00' } },
      { at: 1800, layer: 'overlay', action: 'particles', params: { preset: 'rainbow', x: 360, y: 400, count: 20 } },
    ],
  },
  {
    id: 'yh_bedrock_typing_gase',
    name: '【ガセ】Bedrock生成予告(中・レア役で期待させる)',
    // レア役は期待度が高いだけで当選確定ではない。tier:'mid' には BONUS を含む文言が無い
    when: {
      event: 'leverOn', mode: ['FREE_TIER'],
      flag: ['STRONG_CHERRY', 'CHANCE', 'SHARK', 'MELON'],
    },
    weight: { FREE_TIER: 100, default: 0 },
    duration: 2600,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 100, layer: 'lcd',  action: 'anim', params: { anim: 'bedrock_typing', tier: 'mid', phase: 0 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'bedrock_typing', tier: 'mid', phase: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'bedrock_typing', tier: 'mid', phase: 2 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'anim',
        params: { anim: 'bedrock_typing', tier: 'mid', phase: 3, ms: 1800 } },
      { waitFor: 'stop3', after: 200, layer: 'sfx', action: 'synth', params: { preset: 'announce' } },
      { waitFor: 'stop3', after: 240, layer: 'lcd', action: 'text',
        params: { text: 'GENERATED', sub: '推論の結果、提案が出力された', ms: 1200, color: '#ffd166' } },
    ],
  },
  {
    id: 'yh_bedrock_typing_bluff',
    name: '【ガセ】Bedrock生成予告(BON… まで出力して肩透かし)',
    // BON まで出力するが BONUS には着地しない。tier:'gase' は BONUS を含まない肩透かし文言だけ
    when: {
      event: 'leverOn', mode: ['FREE_TIER'],
      flag: ['WEAK_CHERRY', 'MELON', 'LOSE', 'BELL'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 45, default: 0 },
    chance: 0.04,
    duration: 2600,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
      { at: 100, layer: 'lcd', action: 'anim', params: { anim: 'bedrock_typing', tier: 'gase', phase: 0 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'bedrock_typing', tier: 'gase', phase: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'bedrock_typing', tier: 'gase', phase: 2 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'anim',
        params: { anim: 'bedrock_typing', tier: 'gase', phase: 3, ms: 1800 } },
      { waitFor: 'stop3', after: 240, layer: 'lcd', action: 'text',
        params: { text: 'Bedrock 生成完了', sub: '……出力はここで終わった', ms: 1300, color: '#8ad4ff' } },
    ],
  },
  /* ── Bedrock揃い(ALARM役)= LLM生成イベント ────────────────────────────
   *
   * ユーザー要望「Bedrock の絵柄が揃ったら LLM イベントが起きるようにして」。
   * ALARM役は 1/120・4枚(※U72でCZ抽選は「チャンス目=確定」に一本化され、ALARMのcz値は0になった)
   * 期待できる役なのに揃っても地味だった、という指摘への対応。
   *
   * ■ 2段構えで「そのゲームの抽選結果と連動」させる
   *   1段目 yb_bedrock_alarm_invoke  … レバーON時点。まだ当落は決まっていないので
   *        tier:'alarm'(運用小ネタ。BONUS を含まない)で「起動した」ことだけ見せる
   *   2段目 yb_bedrock_alarm_escalate … 同じゲームの払出処理で前兆が始まったとき。
   *        freetier.js が当選 or ガセ前兆の開始で zencho(step:1) を投げるので、
   *        そこを拾って tier:'mid' へ格上げし「もう一度推論を回した」形で示唆する。
   *        前兆が始まらなかったゲーム(= 素の非当選)では1段目の小ネタで終わる。
   *
   * ■ BONUS 文言限定ルールは維持
   *   ここで指定する tier は 'alarm' と 'mid' だけ。どちらも pickBedrockLine() が
   *   BONUS 入りを除外する側なので、非当選ゲームに BONUS が出ることはない。
   *   実際に当たっていた場合の「生成完了」は、前兆の最終Gで
   *   yh_bedrock_typing_hit(当選確定イベント)が hot で受け持つ。
   *
   * ■ モードを FREE_TIER に限る理由
   *   ALARM の CZ抽選は freetier.js でしか行われないので、LLMイベントが意味を持つのは
   *   通常時だけ。RUSH中は液晶の y74〜108 に DC アイコン列があり生成パネルと衝突する。
   *   通常時以外は既存の alarm_flag_blink(normal.js / weight 100)がそのまま担当する。
   */
  {
    id: 'yb_bedrock_alarm_invoke',
    name: 'Bedrock揃い = LLM起動イベント【通常時は確定発火】',
    when: { event: 'leverOn', flag: ['ALARM'], mode: ['FREE_TIER'] },
    // 通常時のALARMでは唯一の候補にしてある(normal.js の alarm_flag_blink に
    // notMode:['FREE_TIER'] を入れて棲み分け済み)。weight で押し勝つ形だと
    // 数百回に数回は取りこぼすため、候補そのものを1本に絞って確定発火にしている。
    weight: { FREE_TIER: 9000, default: 0 },
    duration: 3400,
    cues: [
      // 絵柄が光る(alarm_flag_blink の見せ場をこちらへ引き継ぐ)
      { at: 0,   layer: 'sfx',    action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 0,   layer: 'lamp',   action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,  layer: 'overlay', action: 'flash', params: { color: '#ffd166', ms: 220 } },
      { at: 80,  layer: 'reelfx', action: 'highlight', params: { ms: 640, color: '#ffd166' } },
      // AI起動 → プロンプト受信(bedrock_boot が二拍ぶん見せる。1200ms)
      { at: 140, layer: 'lcd',    action: 'anim',  params: { anim: 'bedrock_boot' } },
      { at: 180, layer: 'sfx',    action: 'synth', params: { preset: 'charge_up' } },
      { at: 220, layer: 'char',   action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      // 推論 → ストリーミング出力(リール停止に合わせて流れる)。
      // 生成パネルは起動ラベルの上へ被さるので、「受信しました」を読ませてから出す
      { waitFor: 'stop3', layer: 'lcd',    action: 'anim', params: { anim: 'bedrock_typing', tier: 'alarm', phase: 0 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'bedrock_typing', tier: 'alarm', phase: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'bedrock_typing', tier: 'alarm', phase: 2 } },
      { waitFor: 'stop3', after: 80, layer: 'lcd', action: 'anim',
        params: { anim: 'bedrock_typing', tier: 'alarm', phase: 3, ms: 1400 } },
      { waitFor: 'stop3', after: 200, layer: 'sfx', action: 'synth', params: { preset: 'announce' } },
      { waitFor: 'stop3', after: 260, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'normal' } },
    ],
  },
  {
    id: 'yb_bedrock_alarm_escalate',
    name: 'Bedrock揃い → 前兆開始で生成しなおし(期待度示唆へ格上げ)',
    // 同じゲームの払出処理で前兆(本前兆 or ガセ)が始まったときだけ拾う。
    // flag は leverOn で引いた値が払出まで残っているので、ALARM のゲームだけに絞れる。
    when: {
      event: 'paramChange', mode: ['FREE_TIER'], flag: ['ALARM'],
      match: { param: ['zencho'], step: [1] },
    },
    // 前兆パターン演出(zn_*、weight 100)より優先する。Bedrock揃いのゲームは Bedrock が主役
    weight: { FREE_TIER: 9000, default: 0 },
    duration: 3500,
    cues: [
      // 1段目の「推論完了」を読ませてから、もう一度火が入る
      { at: 600,  layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 620,  layer: 'overlay', action: 'flash', params: { color: '#ffd166', ms: 240 } },
      { at: 660,  layer: 'lcd',     action: 'anim',  params: { anim: 'bedrock_boot' } },
      { at: 700,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'panic' } },
      // リール停止と無関係に進む再生なので、revealSpan をキュー間隔(320ms)へ合わせる。
      // 既定(0.18 × 2600ms = 468ms)のままだと流し切る前に次のフェーズへ差し替わる
      { at: 1360, layer: 'lcd',     action: 'anim',
        params: { anim: 'bedrock_typing', tier: 'mid', phase: 0, revealSpan: 0.12 } },
      { at: 1680, layer: 'lcd',     action: 'anim',
        params: { anim: 'bedrock_typing', tier: 'mid', phase: 1, revealSpan: 0.12 } },
      { at: 2000, layer: 'lcd',     action: 'anim',
        params: { anim: 'bedrock_typing', tier: 'mid', phase: 2, revealSpan: 0.12 } },
      { at: 2320, layer: 'lcd',     action: 'anim',
        params: { anim: 'bedrock_typing', tier: 'mid', phase: 3, ms: 1900, revealSpan: 0.14 } },
      { at: 2480, layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      // 当選確定ではないので sticky にならない文言にしておく(「確定」「突入」を使わない)
      { at: 2660, layer: 'lcd',     action: 'text',
        params: { text: 'RE-GENERATED', sub: '再推論の結果、異常を出力した', color: '#ffd166', ms: 1500 } },
      { at: 2800, layer: 'char',    action: 'pose', params: { char: 'kiro', pose: 'surprised' } },
    ],
  },

  {
    id: 'yh_bedrock_typing_idle',
    name: '【弱】Bedrock生成予告(日常の作業ログ)',
    // 賑やかし。tier:'weak' は当たり外れと関係ない日常の作業ログだけ
    when: {
      event: 'leverOn', mode: ['FREE_TIER'],
      flag: ['REPLAY', 'BELL', 'LOSE'],
    },
    weight: { FREE_TIER: 30, default: 0 },
    chance: 0.02,
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 100, layer: 'lcd', action: 'anim', params: { anim: 'bedrock_typing', tier: 'weak', phase: 0 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'bedrock_typing', tier: 'weak', phase: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'bedrock_typing', tier: 'weak', phase: 2 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'anim',
        params: { anim: 'bedrock_typing', tier: 'weak', phase: 3, ms: 1600 } },
    ],
  },

  // ── Well-Architected 6本柱予告。IDEAS.md 2-30「柱がすべて光れば強」──
  // 実装は6本立て(count:6)なので、ID も five ではなく six で揃えてある
  /* ── Well-Architected 柱演出。IDEAS.md 2-30 ────────────────────────────
   *
   * デプロイ・Step Functions と同じ原則へ寄せた修正(2026-08-13)。
   * 旧 yh_wa_six_pillars_hit はレア役を引いただけで6本フル点灯 →「ALL GREEN」と
   * 断言していたため、非当選ゲームでも達成の画が出ていた。
   *
   * 予告(下の2本)は「何本立ったか」だけを見せて結論を出さない。
   * 結論は Personal Health 前兆(pattern:'health')の顛末として出す:
   *   ENTRY → yh_wa_result_all_green  6本目が立って ALL GREEN → 突入
   *   MISS  → yh_wa_result_short      5本止まりで是正しきれず終わる
   * 「緊急メンテナンス通知 → Well-Architected レビューで柱を立て直す」という
   * 筋が通るので、この前兆パターン専用の締めにしてある。
   */
  {
    id: 'yh_wa_six_pillars_hit',
    name: 'Well-Architected柱予告(レア役・5本まで立つ)',
    // 6本目は立てない。結論は当選確定イベント側が出す
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 90, default: 0 },
    duration: 2600,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'pillar_up' } },
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,   layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 1, count: 6 } },
      { at: 300,  layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 2, count: 6 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'pillar_raise', index: 3, count: 6 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'pillar_raise', index: 4, count: 6 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'pillar_raise', index: 5, count: 6 } },
      { waitFor: 'stop3', after: 200, layer: 'lcd', action: 'text',
        params: { text: '5 / 6 本', sub: 'Well-Architected — 残り1本の是正待ち', color: '#ffd166', ms: 1400 } },
      { waitFor: 'stop3', after: 250, layer: 'sfx', action: 'synth', params: { preset: 'pillar_up' } },
    ],
  },
  {
    id: 'yh_wa_six_pillars_gase',
    name: 'Well-Architected柱予告(弱役・3本目までで止まる)',
    when: { event: 'leverOn', flag: ['WEAK_CHERRY', 'MELON'], mode: ['FREE_TIER'], match: { 'modeState.zenchoActive': [false] } },
    weight: { FREE_TIER: 45, default: 0 },
    chance: 0.08,
    duration: 2200,
    cues: [
      { at: 0,    layer: 'sfx', action: 'synth', params: { preset: 'pillar_up' } },
      { at: 60,   layer: 'lcd', action: 'anim', params: { anim: 'pillar_raise', index: 1, count: 6 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'pillar_raise', index: 2, count: 6 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'pillar_raise', index: 3, count: 6 } },
      // 「届かなかった」は結末の断言に読めるので、立った本数だけを述べる
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'text',
        params: { text: '3 / 6 本', sub: 'Well-Architected — 3本目で止まっている', color: '#8ad4ff', ms: 1200 } },
    ],
  },

  {
    id: 'yh_wa_result_all_green',
    name: 'Well-Architected ALL GREEN → 突入【当選確定イベントのみ】',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_end'], value: ['ENTRY'], to: ['CZ'], pattern: ['health'] },
    },
    weight: { FREE_TIER: 400, default: 0 },
    duration: 3000,
    cues: [
      { at: 40,   layer: 'sfx',     action: 'synth', params: { preset: 'pillar_up' } },
      { at: 60,   layer: 'lcd',     action: 'anim', params: { anim: 'pillar_raise', index: 6, count: 6 } },
      { at: 500,  layer: 'sfx',     action: 'synth', params: { preset: 'upgrade_chime' } },
      { at: 540,  layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 300 } },
      { at: 560,  layer: 'overlay', action: 'shake', params: { power: 12, ms: 420 } },
      { at: 600,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 660,  layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 220, y: 150, count: 18 } },
      // 「突入」を含むので可読性エンジンが自動で sticky にする
      { at: 740,  layer: 'lcd',     action: 'text',
        params: { text: 'ALL GREEN — 突入', sub: 'Well-Architected — 6本の柱が全部立った', color: '#ffe066', ms: 1900 } },
      { at: 1000, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_reg' } },
    ],
  },
  {
    id: 'yh_wa_result_short',
    name: '【ガセ】Well-Architected 5本止まり【非当選確定イベントのみ】',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_end'], value: ['MISS'], pattern: ['health'] },
    },
    weight: { FREE_TIER: 400, default: 0 },
    duration: 2400,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'pillar_up' } },
      { at: 60,   layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 5, count: 6 } },
      { at: 700,  layer: 'sfx',  action: 'synth', params: { preset: 'health_check' } },
      { at: 740,  layer: 'char', action: 'show', params: { char: 'kiro', pose: 'normal' } },
      { at: 800,  layer: 'lcd',  action: 'text',
        params: { text: '5 / 6 本', sub: 'Well-Architected — 最後の1本が立たなかった', color: '#8aa0b4', ms: 1300 } },
      { at: 1100, layer: 'lamp', action: 'pattern', params: { pattern: 'idle' } },
    ],
  },

  // ── Cost Explorerグラフ跳ね上げ予告。IDEAS.md 2-11「グラフが急上昇すれば強」──
  {
    id: 'yh_cost_explorer_spike',
    name: 'Cost Explorerグラフ跳ね上げ予告(段階的に急上昇)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE', 'MELON'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 70, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'char', action: 'pose',   params: { char: 'kiro', pose: 'panic' } },
      { at: 40,  layer: 'lcd',  action: 'anim',   params: { anim: 'cw_graph_rise', step: 1 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'cw_graph_rise', step: 2 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'cw_graph_rise', step: 4 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'cw_graph_rise', step: 5 } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'COST SPIKE!', sub: '請求額が跳ね上がった', color: '#ffd166', ms: 1300 } },
      { waitFor: 'stop3', after: 200, layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
    ],
  },

  // ── Step Functionsステップアップ予告。IDEAS.md 2-17「矢印が一段ずつ光り最終ステート到達で強」──
  {
    id: 'yh_stepfunctions_stepup',
    name: 'Step Functionsステップアップ予告(3段階タメ。結論は出さない)',
    when: { event: 'leverOn', flag: ['CHANCE', 'STRONG_CHERRY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 70, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'step_up', step: 1 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 2 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 3 } },
      // sfn_task は 'SUCCEEDED' / 'FAILED' を断言するアニメなので、当落を知らない
      // ここでは使わない(結論は yg_sfn_result_success / _wait が出す)。
      // ランプ3段点灯までを見せて期待度だけを示す
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 3 } },
      { waitFor: 'stop3', after: 150, layer: 'sfx', action: 'synth', params: { preset: 'sfn_choice' } },
      { waitFor: 'stop3', after: 300, layer: 'lcd', action: 'text',
        params: { text: 'STEP 3 / 3', sub: 'エスカレーション段階が上がった', color: '#ffd166', ms: 1200 } },
    ],
  },

  /* ══ 赤文字予兆(単発予告版)/ U73 で全面再設計(2026-08-16)═══════════
   *
   * ── これまでの経緯 ─────────────────────────────
   * もともとは「前兆の赤(zencho.js の zn_hot_*)だけだと信頼度が 93% まで上がり、
   * 赤 = 確定になってしまう」ので、当選寄りだが確定ではない中位のレア役
   * (当時 MELON cz 0.50 / CHANCE cz 0.60)にも赤を混ぜて平均を下げていた。
   *
   * ところが **U72 でCZ導線が「チャンス目・サメ揃い = CZ確定 / 他のレア役は cz 0」**
   * に一本化されたため、この2本の意味が真っ二つに割れてしまった。
   *   ・CHANCE に出た赤 … 100%当たる(= 確定の先出し)
   *   ・MELON に出た赤 … CZへ繋がる道が無い(= 構造的にほぼ必ず裏切る)
   * 実測(scripts/hot-trust-probe.mjs / 3,600セッション)でも
   *   yh_hot_guardduty_alert 49.6% / yh_hot_bedrock_alert 39.4%
   * と「役に紐づいているのに半々」という読めない赤になっていた。
   *
   * ── U73 の再設計方針 ───────────────────────────
   * **赤に持たせる意味を3つに絞り、1本のシナリオには1つの意味だけを持たせる。**
   *
   *   1. 確定の先出し   … CZ確定役(チャンス目 / サメ揃い)を引いた瞬間の赤。信頼度 100%
   *                       → yh_hot_bedrock_alert が担当
   *   2. 前兆の重なり   … **前兆中に**レア役が重なった赤。信頼度 = その前兆が本物の割合
   *                       → yh_hot_guardduty_alert が担当(スイカ単独の赤は廃止)
   *   3. 裏切り枠       … 何も走っていないゲームの赤。信頼度ほぼ 0%
   *                       → yh_hot_false_alarm / yw_hot_false_evacuation が担当
   *
   * この3つに加えて前兆の赤(zn_hot_* 93% / zn_final_push 53%)が乗り、
   * 全部を混ぜた平均が **ユーザー指定の 75〜85%** に着地するよう量を配ってある。
   * 各シナリオの重み・chance を動かしたら **必ず hot-trust-probe.mjs で測り直すこと**
   * (計算だけでは出ない。前兆の赤は交通整理で落とされる量が打ち方で変わる)。
   *
   * 【この再設計で守ったこと】
   *   ・**赤 = 確定にしない**。1〜2割は必ず空振りする(従来からの思想)
   *   ・**役に紐づく赤が構造的に裏切る形は作らない**。
   *     「スイカの赤が毎回裏切る」は台への不信になるので、裏切りは
   *     "何も走っていないゲーム"(裏切り枠)と "ガセ前兆" に集約する
   *   ・ゲーム側の数値(CZ導線・レア役出現率・RUSH)には一切触っていない。
   *     動かしたのは演出抽選(重み・chance・発火条件)だけ
   */
  {
    id: 'yh_hot_bedrock_alert',
    name: '【赤・確定先出し】Bedrock が緊急提案を生成(チャンス目/サメ揃い)',
    /*
     * ── 意味1: 確定の先出し(U73)──────────────────────
     * 発火条件は **CZ確定役(チャンス目 / サメ揃い)だけ**。信頼度は実測 100%。
     *
     * 「確定なのに赤を出す意味があるのか」への答え:
     * CZ確定を伝えるテロップ(freetier.js の CZ_CONFIRM_TELOP)は
     * **払い出しまで進んでから**出るので、レバーONから第3停止までの数秒は
     * まだ何も分かっていない時間になる。そこへ赤を差し込むことで
     * 「赤が出た → やっぱりチャンス目だった」という **先出しの気持ちよさ** が生まれる。
     * 逆に言うと、この赤は当落を作っていない(既に確定しているものを早く見せるだけ)。
     *
     * 【weight の意味】チャンス目のレバーON候補プール(重み合計 約9,100)に対する取り分。
     * 1,100 ≒ 12% = **チャンス目8回に1回くらい赤で先出しされる**。
     * ここを上げると赤全体の信頼度が上がる(100%の赤が増えるため)。
     */
    when: { event: 'leverOn', mode: ['FREE_TIER'], flag: ['CHANCE', 'SHARK'] },
    weight: { FREE_TIER: 1100, default: 0 },
    /** U73 の直前値(MELON と共用で 420 だった頃) */
    previousWeightU72: 420,
    duration: 2600,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,  layer: 'overlay', action: 'flash', params: { color: '#ff3b30', ms: 200 } },
      { at: 100, layer: 'lcd',  action: 'anim', params: { anim: 'bedrock_typing', tier: 'mid', phase: 0 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'bedrock_typing', tier: 'mid', phase: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'bedrock_typing', tier: 'mid', phase: 2 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'anim',
        params: { anim: 'bedrock_typing', tier: 'mid', phase: 3, ms: 1800 } },
      { waitFor: 'stop3', after: 220, layer: 'sfx', action: 'synth', params: { preset: 'alarm_beep' } },
      // 結論(CZ確定)はモード側のテロップが言う。ここは「最優先で出力された」までに留める
      { waitFor: 'stop3', after: 260, layer: 'lcd', action: 'text',
        params: { text: '緊急提案を生成', sub: '推論の結果、最優先で出力された', tone: 'hot', color: '#ff3b30', ms: 1400 } },
    ],
  },
  {
    id: 'yh_hot_guardduty_alert',
    name: '【赤・前兆の重なり】GuardDuty 緊急検知(前兆中のレア役)',
    /*
     * ── 意味2: 前兆の重なり(U73)──────────────────────
     * 旧版は「スイカ or チャンス目」で出していたが、U72 以降スイカはCZへ繋がらないため
     * **スイカ単独の赤は構造的にほぼ必ず裏切る**(実測でも 1% 前後)。
     * 役に紐づく赤が毎回裏切るのは台への不信になるので、スイカ単独の赤は廃止した。
     *
     * 代わりに **前兆が走っているゲームでレア役が重なったとき** の赤にする。
     * この場面には実際の意味がある:
     *   ・ガセ前兆中に当選すれば **本前兆へ格上げ**(freetier.js の promoteZencho)
     *   ・擬似連中のレア役は **ボーナス確定**(data/zencho.js の rareUpgradesToBonus)
     * つまり「対応中の案件に、もう1件検知が重なった」= 事態が動きうる場面そのもの。
     *
     * 信頼度は **その前兆が本物である割合**(実測 65〜75%)になる。
     * 前兆の赤(zn_hot_* 93%)より低いのは、こちらは強度で絞っていないぶん
     * ガセ前兆にも等しく乗るため。この "少し低い赤" があることで
     * 赤全体の平均が 75〜85% に収まる。
     *
     * 【CZ確定役(チャンス目 / サメ揃い)を入れない理由】
     * それは意味1(上の yh_hot_bedrock_alert)の担当。1本のシナリオに
     * 「確定」と「確定ではない」を同居させると、また読めない赤に戻ってしまう。
     */
    when: {
      event: 'leverOn', mode: ['FREE_TIER'],
      flag: ['MELON', 'WEAK_CHERRY', 'STRONG_CHERRY'],
      match: { 'modeState.zenchoActive': [true] },
    },
    /**
     * 前兆中(全ゲームの約5%)かつレア役(1/6.2)という二重条件で母数が小さいので、
     * 取り分は大きめに取る。それでも実測で赤全体の1割前後にしかならない。
     *
     * 【上げても平均が動かない理由】この赤の信頼度(実測 83%)は
     * 赤全体の平均(79%)とほぼ同じなので、**量を増やしても平均をほとんど動かさずに
     * 見せ場だけが増える**。赤の総量を戻したいときに一番副作用が少ないノブ。
     */
    weight: { FREE_TIER: 2100, default: 0 },
    /** U73 の直前値(スイカ/チャンス目に無条件で出していた頃) */
    previousWeightU72: 420,
    duration: 2400,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 40,  layer: 'overlay', action: 'flash', params: { color: '#ff3b30', ms: 220 } },
      { at: 80,  layer: 'overlay', action: 'cutin', params: { id: 'guardduty_alert' } },
      { waitFor: 'stop2', layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
      { waitFor: 'stop3', after: 100, layer: 'reelfx', action: 'highlight', params: { ms: 520, color: '#ff3b30' } },
      // 「重なった」= 前兆中であることを言う。当落は言わない(結論は zencho_end 側)
      { waitFor: 'stop3', after: 200, layer: 'lcd', action: 'text',
        params: { text: 'CRITICAL FINDING', sub: 'Amazon GuardDuty — 対応中の案件に検知が重なった', tone: 'hot', color: '#ff3b30', ms: 1400 } },
    ],
  },

  {
    id: 'yh_hot_false_alarm',
    name: '【赤・ガセ】緊急アラートが鳴るが何も起きない',
    /*
     * 赤文字の信頼度を目標帯(75〜85%)へ収めるための「裏切り枠」。
     *
     * レア役に赤を付けるだけだと、レア役自体が内部状態の昇格を頻繁に起こすため
     * 信頼度が 90% を超えてしまい「赤 = 確定」になってしまう。
     * そこで **ほぼ何も起きないゲーム** にも赤を少量だけ混ぜる:
     *   flag         … CZ_ENTRY.table に行が無い3役(成立役契機では当たらない)
     *   zenchoActive … false = 前兆も走っていない(保持中の当選も無い)
     * 役割は「赤い予告が必ず当たるわけではない」を成立させる裏切り枠
     * (U67-1: 旧コメントの「パチンコの赤保留のガセ」という喩えは、
     *  この台に無い仕組みを持ち出していたので言い換えた)。
     *
     * 【2026-08-15 訂正】「必ず空振りする」ではない。
     * ステージの毎ゲームCZ抽選(高確・激アツ)とレバーONフリーズは
     * **成立役に一切依存せず走る** ので、上位ステージではまれに当たる。
     * この演出は画面で結論を出さない(ALERT と鳴るだけ)ので嘘にはならないが、
     * **「必ずガセ」を前提にした信頼度計算はできない**。
     * 断定する文言を足したくなったら、data/scenarios/yokoku-batch3.js の
     * WEAK_WHEN と同じ4条件(subState / 天井 / freeze / 前兆)まで絞ること。
     *
     * chance で出現量を絞ってあるので、赤全体の1割前後に収まる。
     *
     * ══ U73(2026-08-16)/ 0.020 → 0.013 ═════════════════════════
     * U72 でCZ導線が「チャンス目 = CZ確定」に一本化された結果、
     * 赤の主力である前兆の赤が **93%** まで上がった一方で、
     * ここと yw_hot_false_evacuation の裏切り枠が赤全体の **15%** を占めており、
     * 赤の総合信頼度が **64.9%**(目標 75〜85%)まで落ちていた。
     * 裏切り枠は「赤 = 確定にしない」ための構造なので消さずに残し、
     * **量を3分の2**にして平均を持ち上げる(赤全体の 15% → 10% 前後)。
     * ガセ前兆(前兆の赤の1割強 / zn_final_push の約半分)も裏切りを担うので、
     * 純粋な空振りの赤はこの量で足りる。
     */
    when: {
      event: 'leverOn', mode: ['FREE_TIER'], flag: ['LOSE', 'BELL', 'REPLAY'],
      match: { 'modeState.zenchoActive': [false] },
    },
    weight: { FREE_TIER: 400, default: 0 },
    // 実測で赤全体の信頼度が目標帯(75〜85%)に収まる量へ調整(U73 / 2026-08-16)
    chance: 0.013,
    /** U73 の直前値(赤の総合信頼度が 64.9% だった頃) */
    previousChanceU72: 0.020,
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 40,  layer: 'overlay', action: 'flash', params: { color: '#ff3b30', ms: 200 } },
      { at: 80,  layer: 'lcd',     action: 'anim',  params: { anim: 'lcd_flash', color: '#ff3b30', strength: 0.5 } },
      { at: 200, layer: 'lcd',     action: 'text',
        params: { text: 'ALERT', sub: 'CloudWatch の緊急アラートが鳴っている', tone: 'hot', color: '#ff3b30', ms: 1300 } },
      // 結論は出さない。何も起きないまま終わるのがこのシナリオの役目
      { waitFor: 'stop3', after: 300, layer: 'lamp', action: 'pattern', params: { pattern: 'idle' } },
    ],
  },
];
