/**
 * Auto Scaling RUSH / 引き戻し層の演出シナリオ。
 * DESIGN.md 6.5 / IDEAS.md 2-2, 2-8, 3-8
 */

import { AS_RUSH_CORE } from '../modes.js';

/*
 * 付与G数は data/modes.js の実装値から取る(椿レビューの数値乖離対策と同じ方針)。
 * asrush.js は継続時に state.remaining = state.total(= setGames)へ戻すので、
 * 画面に出す「+◯G」はこの値と必ず一致する。
 */
const RUSH_SET_GAMES = AS_RUSH_CORE.setGames;

export default [
  {
    id: 'rush_entry',
    name: 'AUTO SCALING RUSH 突入(全画面スラムカットイン)',
    // 派生ゾーンから戻ってきたとき(resumed:true)は zones.js の zone_return が担当する
    //
    // ユーザー要望により、ゴースト7揃い → BIG BONUS ロゴドンと同格の見せ場へ格上げ。
    // 演出の主役は cutins-extra.js の rush_slam(全画面 1600ms)。
    // 溜め(charge_up)→ 着弾(freeze_hit + 強シェイク)→ ロゴドン(fanfare_big)の3拍子で組む。
    when: { event: 'modeEnter', enterMode: ['AS_RUSH'], match: { resumed: [false] } },
    weight: { default: 100 },
    duration: 3800,
    cues: [
      // ── 溜め ──
      { at: 0,    layer: 'sfx',     action: 'synth',  params: { preset: 'charge_up' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rush' } },
      { at: 0,    layer: 'overlay', action: 'flash',  params: { color: '#ffffff', ms: 260 } },
      { at: 0,    layer: 'overlay', action: 'cutin',  params: { id: 'rush_slam', variant: 'AS_RUSH' } },
      // ── 着弾(カットインのロゴが叩きつけられる瞬間に合わせる)──
      { at: 220,  layer: 'sfx',     action: 'synth',  params: { preset: 'freeze_hit' } },
      { at: 220,  layer: 'overlay', action: 'shake',  params: { power: 26, ms: 520 } },
      { at: 420,  layer: 'sfx',     action: 'synth',  params: { preset: 'scale_out' } },
      { at: 640,  layer: 'sfx',     action: 'synth',  params: { preset: 'cutin_whoosh' } },
      { at: 660,  layer: 'overlay', action: 'shake',  params: { power: 18, ms: 460 } },
      { at: 680,  layer: 'overlay', action: 'flash',  params: { color: '#7bf7d0', ms: 300 } },
      // ── ロゴドン後の余韻 ──
      { at: 900,  layer: 'sfx',     action: 'synth',  params: { preset: 'fanfare_big' } },
      { at: 1000, layer: 'overlay', action: 'particles', params: { preset: 'scale', x: 360, y: 360, count: 34 } },
      { at: 1500, layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'happy' } },
      { at: 1500, layer: 'char',    action: 'show',   params: { char: 'george', pose: 'grin' } },
      { at: 1500, layer: 'char',    action: 'motion', params: { char: 'george', motion: 'swimIn' } },
      { at: 1700, layer: 'voice',   action: 'play',   params: { key: 'george_rush_01' } },
      // 「突入」と「RUSH」を含むので可読性エンジンが自動で sticky 扱いにする
      // (= 次のレバーONまで残る。テロップを見逃してもRUSHに入ったことが分かる)
      { at: 1800, layer: 'lcd',     action: 'text',
        params: { text: 'AUTO SCALING RUSH 突入!!', sub: 'インスタンスを増やせ', color: '#7bf7d0', ms: 2000 } },
      { at: 1900, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_rush' } },
      { at: 2200, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 24 } },
    ],
  },

  {
    id: 'rush_scale_out',
    name: 'スケールアウト(インスタンス増殖)',
    // IDEAS.md 2-2「Auto Scaling予告: インスタンスが倍々増殖」
    when: { event: 'paramChange', match: { param: ['dc'] } },
    weight: { default: 100 },
    duration: 1600,
    cues: [
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#7bf7d0', ms: 200 } },
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'scale_out' } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'scale_out_burst', dc: '$value' } },
      { at: 40,  layer: 'lcd',     action: 'particles', params: { preset: 'scale', x: 220, y: 92, count: 20 } },
      // 入場演出を見逃していてもキャラが出るように show を前置しておく(保険)
      { at: 60,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 60,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      { at: 200, layer: 'voice',   action: 'play',  params: { key: 'kiro_scaleout_01' } },
      { at: 900, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'rush_scale_out_max',
    name: 'スケールアウト上限(DC MAX)',
    when: { event: 'paramChange', match: { param: ['dc_max'] } },
    weight: { default: 100 },
    duration: 1400,
    cues: [
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 240 } },
      { at: 0,   layer: 'char',    action: 'pose',  params: { char: 'george', pose: 'angry' } },
      { at: 0,   layer: 'lcd',     action: 'text',
        params: { text: 'DC MAX', sub: 'これ以上スケールできません', color: '#ffe066', ms: 1300 } },
    ],
  },

  {
    id: 'rush_health_check',
    name: 'ヘルスチェック(上乗せ消化・縮退の簡易告知)',
    // IDEAS.md 2-8「ALBヘルスチェック予告」
    //
    // セット末の本判定(CONTINUE / EXIT)は見せ場として別シナリオへ切り出した
    // (rush_health_check_continue / _exit)。ここは残りの結果を短く伝えるだけ。
    // mode 必須: STOCK は上位AT(SERVERLESS_RUSH / MULTI_REGION)からも飛んでくるため、
    // モードを絞らないと別モードのセット末にRUSHの告知が出てしまう(ゆいの実機トレース指摘)
    when: { event: 'setEnd', mode: ['AS_RUSH'], match: { 'result': ['STOCK', 'DEGRADED'] } },
    weight: { AS_RUSH: 100, default: 0 },
    duration: 2400,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'health_check' } },
      // 入場演出を見逃していてもキャラが出るように show を前置しておく(保険)
      { at: 0,    layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'panic' } },
      { at: 0,    layer: 'lcd',     action: 'anim',
        params: { anim: 'health_check', ok: '$continued', label: '$healthLabel' } },
      { at: 900,  layer: 'overlay', action: 'flash',
        params: { color: "$continued ? '#4ce0a0' : '#ff4d4d'", ms: 300 } },
      { at: 900,  layer: 'lamp',    action: 'pattern', params: { pattern: "$continued ? 'rush' : 'rare'" } },
      { at: 950,  layer: 'char',    action: 'pose',
        params: { char: 'kiro', pose: "$continued ? 'happy' : 'panic'" } },
      { at: 1000, layer: 'lcd',     action: 'particles',
        params: { preset: "$continued ? 'scale' : 'spark'", x: 220, y: 150, count: 16 } },
    ],
  },

  {
    id: 'standby_entry',
    name: 'ホットスタンバイ突入(AZ切替)',
    // IDEAS.md 3-8「マルチAZフェイルオーバーCZ」
    when: { event: 'modeEnter', enterMode: ['HOT_STANDBY'] },
    weight: { default: 100 },
    duration: 3000,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 300 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 14, ms: 500 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 100,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'panic' } },
      { at: 100,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'shake' } },
      { at: 300,  layer: 'lcd',     action: 'text',
        params: { text: 'AZ-a DOWN', sub: 'フェイルオーバーを待て', color: '#ff8a8a', ms: 1900 } },
      { at: 600,  layer: 'voice',   action: 'play', params: { key: 'kiro_standby_01' } },
      { at: 1200, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_standby' } },
    ],
  },

  {
    id: 'standby_progress',
    name: 'ホットスタンバイ中のAZ切替ゲージ',
    when: { event: 'leverOn', mode: ['HOT_STANDBY'] },
    weight: { HOT_STANDBY: 100, default: 0 },
    duration: 1600,
    cues: [
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'anim', params: { anim: 'az_failover' } },
    ],
  },

  {
    id: 'standby_recover',
    name: 'ホットスタンバイ復帰成功(爆発)',
    /*
     * setEnd 起点(2026-08-13 ゆいの引き戻し層修正の申し送り)。
     *
     * もとは modeExit 起点だったが、遷移がレバーONで確定するようになった結果
     * modeExit → modeEnter が連続で発火し、modeEnter の後片付け(lcdAnims.clear())で
     * recover_burst や FAILOVER OK のテキストが即座に消えていた。
     *
     * game/modes/recovery.js の setEnd は **保留ゲーム中**に飛ぶので、
     * ここで出した液晶演出は遷移をまたいで生き残る。
     * upper.js の route53_recover(ROUTE53_FAILOVER 側)と同じ流儀に揃えてある。
     * payload は { result:'RECOVERY_RESULT', success, layer:'HOT_STANDBY' }。
     */
    when: { event: 'setEnd', match: { layer: ['HOT_STANDBY'], success: true } },
    weight: { default: 100 },
    // 復帰成功は見せ場なので調停に落とされないよう結果告知枠を取る
    priority: 'result',
    duration: 2200,
    cues: [
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#7bf7d0', ms: 360 } },
      { at: 0,   layer: 'overlay', action: 'shake', params: { power: 18, ms: 600 } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'recover_burst' } },
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 100, layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 100, layer: 'char',    action: 'motion', params: { char: 'george', motion: 'tailWhip' } },
      { at: 200, layer: 'lcd',     action: 'text',
        params: { text: 'FAILOVER OK', sub: 'AZ-c で復旧しました', color: '#7bf7d0', ms: 1800 } },
      { at: 300, layer: 'overlay', action: 'particles', params: { preset: 'scale', x: 360, y: 360, count: 28 } },
    ],
  },

  /* ── セット末ヘルスチェック(見せ場)────────────────────────────────
   *
   * ユーザー要望:「RUSHの残りGが0になった時のヘルスチェックをもっと目立つように。
   * HEALTHYなら『継続!!』と大きく出して、また5G付与される感じに」。
   *
   * ■ 当落との紐付け
   *   game/modes/asrush.js が投げる setEnd の result で結果は確定している:
   *     CONTINUE(continued:true / healthLabel:'HEALTHY') … セット継続
   *     EXIT    (continued:false / healthLabel:'UNHEALTHY') … 転落
   *   したがって「継続!!」を出すシナリオは構造的に継続時しか動かない。
   *   ゲーム側の契約は読むだけで、こちらからは何も要求しない。
   *
   * ■ 見せ方
   *   前半 1.35 秒はプローブが走るだけで**結果を伏せる**(health_check_impact の
   *   p<0.52 が CHECKING… の区間)。判定はそのあとにドンと出る。
   */
  {
    id: 'rush_health_check_continue',
    name: 'ヘルスチェック HEALTHY → 継続!!(セット継続)',
    /*
     * mode 必須(2026-08-13 ゆいの実機トレース指摘)。
     * result:'CONTINUE' は AS_RUSH 以外からも飛んでくる:
     *   game/modes/bonus.js:81   ゴーストボーナスSP のセット継続
     *   game/modes/zones.js:248  GRAVITON ゾーンの継続
     *   game/modes/upperat.js    Serverless RUSH / Multi-Region のセット継続
     * モードを絞らないとこれら全部で「HEALTHY — 継続!! +5G」が出てしまい、
     * とくに SP は1セットの長さが別物なので付与G数の表示まで嘘になる。
     * それぞれの継続は各モード専用のシナリオが受け持つ:
     *   BONUS           → bonus_dynamo_ondemand
     *   GRAVITON        → graviton_continue
     *   上位AT          → serverless_continue / multi_region_continue(upper.js)
     */
    when: { event: 'setEnd', mode: ['AS_RUSH'], match: { result: ['CONTINUE'] } },
    weight: { AS_RUSH: 100, default: 0 },
    // 見せ場そのものなので調停で落とされないよう結果告知枠を取る
    priority: 'result',
    duration: 3400,
    cues: [
      // ── タメ(結果は伏せたまま)──
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'health_check' } },
      { at: 0,    layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'panic' } },
      { at: 0,    layer: 'lcd',     action: 'anim',
        params: { anim: 'health_check_impact', ok: true, addGames: RUSH_SET_GAMES, ms: 2600 } },
      { at: 260,  layer: 'sfx',     action: 'synth', params: { preset: 'countdown_tick' } },
      { at: 700,  layer: 'sfx',     action: 'synth', params: { preset: 'countdown_tick' } },
      { at: 1050, layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      // ── 判定(アニメの p=0.52 = 約1350ms に合わせる)──
      { at: 1350, layer: 'overlay', action: 'flash', params: { color: '#4ce0a0', ms: 320 } },
      { at: 1360, layer: 'overlay', action: 'shake', params: { power: 14, ms: 460 } },
      { at: 1370, layer: 'lamp',    action: 'pattern', params: { pattern: 'rush' } },
      { at: 1380, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_reg' } },
      { at: 1420, layer: 'char',    action: 'pose',   params: { char: 'kiro', pose: 'happy' } },
      { at: 1440, layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      { at: 1520, layer: 'lcd',     action: 'particles', params: { preset: 'scale', x: 220, y: 130, count: 22 } },
      { at: 1700, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      // 「継続」は sticky キーワードなので次のレバーONまで残る
      /*
        * 「同じ意味の文字は画面に1個」(2026-08-13 ユーザー指摘)。
        * health_check_impact が「継続!!」と「+◯G」を大きく描くので、
        * テキスト帯では同じ語を繰り返さず「次に何が起きるか」だけを伝える。
        * 帯の文言から sticky キーワード(継続)が消えるため sticky:true を明示する。
        */
      { at: 1760, layer: 'lcd',     action: 'text',
        params: { text: '次のセットへ', sub: 'インスタンスは全て正常', color: '#7bffc4', ms: 2000, sticky: true } },
      { at: 2000, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 360, count: 20 } },
    ],
  },

  {
    id: 'rush_health_check_exit',
    name: 'ヘルスチェック UNHEALTHY(転落)',
    // EXIT は現状 AS_RUSH からしか飛ばないが、他モードが同じ result を使い始めても
    // 巻き込まれないようモードを明示しておく
    when: { event: 'setEnd', mode: ['AS_RUSH'], match: { result: ['EXIT'] } },
    weight: { AS_RUSH: 100, default: 0 },
    priority: 'result',
    duration: 3000,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'health_check' } },
      { at: 0,    layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'panic' } },
      { at: 0,    layer: 'lcd',     action: 'anim',
        params: { anim: 'health_check_impact', ok: false, ms: 2600 } },
      { at: 260,  layer: 'sfx',     action: 'synth', params: { preset: 'countdown_tick' } },
      { at: 700,  layer: 'sfx',     action: 'synth', params: { preset: 'countdown_tick' } },
      { at: 1050, layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 1350, layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 300 } },
      { at: 1360, layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 1380, layer: 'sfx',     action: 'synth', params: { preset: 'error_buzz' } },
      // UNHEALTHY の文字は health_check_impact 側の判定表示1箇所だけにする。
      // 帯は「このあとどうなるか」を担当(EXIT の遷移先は HOT_STANDBY)
      { at: 1760, layer: 'lcd',     action: 'text',
        params: { text: '転落 — ホットスタンバイへ', sub: 'インスタンスが全滅した…', color: '#ff8a8a', ms: 1600 } },
    ],
  },
];
