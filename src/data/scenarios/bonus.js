/**
 * ボーナス層の演出シナリオ。DESIGN.md 6.5 / IDEAS.md 1章, 4章
 *
 * 「ボーナスに入った実感」を最優先にしたセット。
 * 当選カットインは2種を weight で振り分け、毎回同じ絵にならないようにする。
 *
 * 2026-08-13 の仕様変更で「当選 → 入賞待ち(揃えろ!) → 揃った瞬間に消化開始」になったため、
 * 演出の並びは次のとおり:
 *   modeEnter BONUS_READY … ボーナス確定告知 +「ゴースト7 / サメBAR を揃えろ!」
 *   judge (BONUS_READY, ハズレ) … 揃った瞬間の入賞ファンファーレ
 *   modeEnter BONUS       … 従来の突入カットイン(= 揃った直後のご褒美演出)
 *
 * ■ キャラの配役(2026-08-13 修正 → 2026-08-14 用語整理)
 *   bonusId で主役を固定する。**キャラは2体ともサメ**(render/chars/)なので、
 *   ここで言う配役は「どちらのサメを出すか」の話:
 *     S3_BIG / DYNAMO_BIG(ゴーストボーナス / 同SP)… 主役は相棒サメ(char:'kiro')
 *     LAMBDA_REG(シャークボーナス)                … 主役はジョージ(char:'george')
 *   キャラID 'kiro' と絵柄名「ゴースト7」は歴史的な名前として残しているだけで、
 *   お化けキャラは画面に一切出ない(2026-08-14 に全廃)。
 *   カットイン・常駐キャラ・ボイスの3点セットで揃えること。
 *
 * ■ ボーナス名の表記は液晶(LCD)の中だけ(2026-08-13 ユーザー指摘)
 *   「シャークボーナスの時、画面中央にも液晶の中にも『シャークボーナス』と出る」。
 *   全画面(overlay)カットインはキャラと意匠だけを担当し、**モードの名称は
 *   lcd.text 側に一本化**する。判定基準は「同じ名称文字列が同時に2箇所に見えるか」。
 *     シャーク … 全画面は shark_bite_bar(サメ+BARプレート。名称文字なし)へ差し替え
 *     ゴースト … 全画面は 'BIG BONUS'(伝統的スロットの意匠)。LCD が 'GHOST BONUS'
 *     SP      … 全画面は 'BIG BONUS SP'。LCD が 'GHOST SP'
 *   ghost_seven_don は '7' と 'BONUS!!' しか描かないので名称の重複はない。
 *   原因は bonus_cutin_shark / bonus_cutin_ghost が bonusId を見ずに
 *   weight 50 対 50 で振り分けられていたこと(= ゴーストボーナスの約1割でサメが出ていた)。
 */

import { BONUS_SPEC_BY_ID } from '../modes.js';

/*
 * スペック数値は data/modes.js から取り込んでテンプレートで組み立てる(2026-08-13)。
 *
 * 以前は「純増8枚」「1セット10G」のように文言へ直接書いていたため、
 * バランス調整のたびに画面表示だけが旧値のまま取り残されていた
 * (椿のレビューで11件の乖離を検出)。ここで参照にしておけば二度とズレない。
 * data → data の import なので依存方向の問題は無く、
 * モジュール読み込み時に文字列が確定するので実行時コストも増えない。
 */

const GHOST_B = BONUS_SPEC_BY_ID.S3_BIG;
const SHARK_B = BONUS_SPEC_BY_ID.LAMBDA_REG;
const GHOST_SP = BONUS_SPEC_BY_ID.DYNAMO_BIG;

export default [
  // ── 入賞待ち(BONUS_READY)───────────────────
  {
    id: 'bonus_ready_big',
    name: 'ボーナス確定 → ゴースト7を揃えろ!',
    when: {
      event: 'modeEnter', enterMode: ['BONUS_READY'],
      match: { 'state.bonusId': ['S3_BIG', 'DYNAMO_BIG'] },
    },
    weight: { default: 100 },
    duration: 2600,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash',  params: { color: '#ffffff', ms: 300 } },
      { at: 0,    layer: 'overlay', action: 'shake',  params: { power: 16, ms: 560 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'sfx',     action: 'synth',  params: { preset: 'freeze_hit' } },
      { at: 260,  layer: 'sfx',     action: 'synth',  params: { preset: 'announce' } },
      { at: 300,  layer: 'lcd',     action: 'text',
        params: { text: 'BONUS 確定', sub: 'ゴースト7を揃えろ!', color: '#ffd24a', ms: 1900 } },
      // ゴースト7狙いは相棒サメ(kiro枠)が主役。ジョージは引っ込める
      { at: 600,  layer: 'char',    action: 'hide',   params: { char: 'george' } },
      { at: 700,  layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'happy' } },
      { at: 700,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      { at: 900,  layer: 'sfx',     action: 'synth',  params: { preset: 'charge_up' } },
      { at: 1200, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 320, count: 14 } },
    ],
  },

  {
    id: 'bonus_ready_reg',
    name: 'ボーナス確定 → サメBARを揃えろ!',
    when: {
      event: 'modeEnter', enterMode: ['BONUS_READY'],
      match: { 'state.bonusId': ['LAMBDA_REG'] },
    },
    weight: { default: 100 },
    duration: 2400,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash',  params: { color: '#ffd95e', ms: 280 } },
      { at: 0,    layer: 'overlay', action: 'shake',  params: { power: 12, ms: 460 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'sfx',     action: 'synth',  params: { preset: 'announce' } },
      { at: 260,  layer: 'lcd',     action: 'text',
        params: { text: 'BONUS 確定', sub: 'サメBARを揃えろ!', color: '#ffd166', ms: 1700 } },
      // サメBAR狙いはジョージが主役。相棒サメ(kiro枠)は引っ込める
      { at: 500,  layer: 'char',    action: 'hide',   params: { char: 'kiro' } },
      { at: 600,  layer: 'char',    action: 'show',   params: { char: 'george', pose: 'grin' } },
      { at: 600,  layer: 'char',    action: 'motion', params: { char: 'george', motion: 'swimIn' } },
      { at: 900,  layer: 'sfx',     action: 'synth',  params: { preset: 'charge_up' } },
    ],
  },

  {
    id: 'bonus_ready_push',
    name: '入賞待ち中の煽り(まだ揃っていない)',
    // 小役が先に成立して揃わなかったゲーム。「まだ揃えろ」を短く煽る
    when: { event: 'payoutStart', mode: ['BONUS_READY'] },
    weight: { BONUS_READY: 100, default: 0 },
    chance: 0.5,
    duration: 700,
    cues: [
      { at: 0, layer: 'sfx',  action: 'synth', params: { preset: 'countdown_tick' } },
      { at: 0, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
    ],
  },

  {
    id: 'bonus_symbol_hit',
    name: 'ボーナス図柄が揃った瞬間(入賞ファンファーレ)',
    // BONUS_READY 中のハズレ = 引き込みでボーナス図柄が揃ったゲーム(game/modes/bonusready.js)
    when: { event: 'judge', mode: ['BONUS_READY'], flag: ['LOSE'] },
    weight: { BONUS_READY: 1000, default: 0 },
    duration: 1600,
    cues: [
      { at: 0,   layer: 'overlay', action: 'flash',  params: { color: '#ffffff', ms: 420 } },
      { at: 0,   layer: 'overlay', action: 'shake',  params: { power: 22, ms: 700 } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,   layer: 'sfx',     action: 'synth',  params: { preset: 'fanfare_big' } },
      { at: 120, layer: 'lcd',     action: 'anim',   params: { anim: 'lcd_flash' } },
      { at: 200, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 360, count: 28 } },
    ],
  },

  // ── 消化開始(= 揃った直後)────────────────────
  {
    id: 'bonus_cutin_shark',
    name: 'ボーナス当選カットイン(サメがBARに噛みつく)',
    // シャークボーナス専用。bonusId を見ずに weight で振っていたため、
    // ゴーストボーナスでもサメが噛みついていた
    when: { event: 'modeEnter', enterMode: ['BONUS'], match: { 'state.bonusId': ['LAMBDA_REG'] } },
    weight: { default: 50 },
    duration: 2600,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash',  params: { color: '#ffffff', ms: 260 } },
      { at: 0,    layer: 'overlay', action: 'shake',  params: { power: 14, ms: 520 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'sfx',     action: 'synth',  params: { preset: 'shark_bite' } },
      { at: 60,   layer: 'overlay', action: 'cutin',  params: { id: 'shark_bite_bar' } },
      { at: 60,   layer: 'char',    action: 'hide',   params: { char: 'kiro' } },
      { at: 900,  layer: 'char',    action: 'show',   params: { char: 'george', pose: 'bite' } },
      { at: 900,  layer: 'char',    action: 'motion', params: { char: 'george', motion: 'swimIn' } },
      { at: 1000, layer: 'voice',   action: 'play',   params: { key: 'george_bonus_01' } },
      { at: 1400, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 24 } },
    ],
  },

  {
    id: 'bonus_cutin_ghost',
    name: 'ボーナス当選カットイン(サメ+7のドン)',
    // ゴーストボーナス / 同SP 専用
    when: {
      event: 'modeEnter', enterMode: ['BONUS'],
      match: { 'state.bonusId': ['S3_BIG', 'DYNAMO_BIG'] },
    },
    weight: { default: 50 },
    duration: 2600,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash',  params: { color: '#e9b8ff', ms: 260 } },
      { at: 0,    layer: 'overlay', action: 'shake',  params: { power: 12, ms: 480 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 60,   layer: 'overlay', action: 'cutin',  params: { id: 'ghost_seven_don' } },
      { at: 60,   layer: 'char',    action: 'hide',   params: { char: 'george' } },
      { at: 700,  layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'happy' } },
      { at: 700,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      { at: 1000, layer: 'voice',   action: 'play',   params: { key: 'kiro_bonus_01' } },
      { at: 1400, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 24 } },
    ],
  },

  {
    id: 'bonus_big_logo',
    name: 'ゴーストボーナス 突入ロゴドン',
    // sample.png 上部の「BIG BONUS」の雰囲気。ゴーストボーナス(S3_BIG)のときだけ出す
    when: { event: 'modeEnter', enterMode: ['BONUS'], match: { 'state.bonusId': ['S3_BIG'] } },
    weight: { default: 400 },
    duration: 3400,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash',  params: { color: '#ffffff', ms: 320 } },
      { at: 0,    layer: 'overlay', action: 'shake',  params: { power: 18, ms: 620 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'sfx',     action: 'synth',  params: { preset: 'fanfare_big' } },
      { at: 80,   layer: 'overlay', action: 'cutin',  params: { id: 'big_bonus_logo', title: 'BIG BONUS' } },
      { at: 200,  layer: 'char',    action: 'hide',   params: { char: 'george' } },
      { at: 900,  layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'premium' } },
      { at: 1000, layer: 'voice',   action: 'play',   params: { key: 'kiro_bonus_01' } },
      /*
       * 突入ロゴは「瞬間の演出」。sticky:false を明示する(2026-08-14 V21-01)。
       * 'BONUS' の語で自動 sticky になると **次のレバーONまで帯が居座り**、
       * その間ずっと液晶の獲得枚数・残Gが帯の下に隠れる(盤面側でも避けているが、
       * そもそも突入ロゴを残す必要が無い。ボーナス名は盤面が常設で出している)。
       */
      { at: 1200, layer: 'lcd',     action: 'text',
        params: {
          text: 'GHOST BONUS', sub: `${GHOST_B.games}G / ベル揃いで15枚`,
          color: '#ffd166', ms: 1800, sticky: false,
        } },
      { at: 1400, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 300, count: 30 } },
      { at: 1600, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_bonus' } },
    ],
  },

  {
    id: 'bonus_reg_logo',
    name: 'シャークボーナス 突入',
    when: { event: 'modeEnter', enterMode: ['BONUS'], match: { 'state.bonusId': ['LAMBDA_REG'] } },
    weight: { default: 400 },
    duration: 2800,
    cues: [
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ffd95e', ms: 260 } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      // 全画面から名称文字を外す(LCD の 'SHARK BONUS' と丸被りしていた)。
      // サメが BAR に噛みつく意匠だけを見せる
      { at: 60,  layer: 'overlay', action: 'cutin', params: { id: 'shark_bite_bar' } },
      { at: 60,  layer: 'sfx',     action: 'synth', params: { preset: 'shark_bite' } },
      // 主役はジョージ。以前は相棒サメ(kiro枠)を出していて名前と絵が食い違っていた
      { at: 200, layer: 'char',    action: 'hide',  params: { char: 'kiro' } },
      { at: 800, layer: 'char',    action: 'show',  params: { char: 'george', pose: 'bite' } },
      { at: 800, layer: 'char',    action: 'motion', params: { char: 'george', motion: 'swimIn' } },
      { at: 1000, layer: 'voice',  action: 'play',  params: { key: 'george_bonus_01' } },
      // 突入ロゴは残さない(sticky:false の理由は bonus_big_logo のコメント参照)
      { at: 1100, layer: 'lcd',    action: 'text',
        params: {
          text: 'SHARK BONUS', sub: `${SHARK_B.games}G / ベル揃いで15枚`,
          color: '#ffd95e', ms: 1600, sticky: false,
        } },
      { at: 1400, layer: 'bgm',    action: 'change', params: { bgm: 'bgm_bonus' } },
    ],
  },

  {
    id: 'bonus_dynamo_logo',
    name: 'ゴーストボーナスSP 突入(無限にスケールする)',
    // セット継続型の最上位ボーナス。AT確定 + DC初期値+2
    when: { event: 'modeEnter', enterMode: ['BONUS'], match: { 'state.bonusId': ['DYNAMO_BIG'] } },
    weight: { default: 600 },
    duration: 3800,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash',  params: { color: '#ffffff', ms: 360 } },
      { at: 0,    layer: 'overlay', action: 'shake',  params: { power: 20, ms: 700 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'sfx',     action: 'synth',  params: { preset: 'dynamo_scale' } },
      { at: 80,   layer: 'overlay', action: 'cutin',  params: { id: 'big_bonus_logo', title: 'BIG BONUS SP' } },
      // ゴーストボーナスSP は相棒サメ(kiro枠)が主役。ジョージは出さない
      { at: 200,  layer: 'char',    action: 'hide',   params: { char: 'george' } },
      { at: 700,  layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'premium' } },
      { at: 700,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'zoom' } },
      { at: 1200, layer: 'lcd',     action: 'text',
        params: { text: 'GHOST SP', sub: `セット継続型 — 1セット${GHOST_SP.setGames}G / 継続${Math.round(GHOST_SP.continueRate * 100)}%`, color: '#7bf7d0', ms: 2000 } },
      { at: 1400, layer: 'voice',   action: 'play',   params: { key: 'kiro_premium_01' } },
      { at: 1600, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 340, count: 32 } },
      { at: 1800, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_bonus' } },
    ],
  },

  {
    id: 'bonus_dynamo_ondemand',
    // 表示名も「継続」で統一(id はログ・検証が参照するので据え置き。U1)
    name: 'ゴーストボーナスSP セット継続(ヘルスチェック→キャパシティチェック)',
    /*
     * ■ U34(2026-08-14): ジャッジを転落演出と同格の強度へ
     *   旧実装は小さな health_check が1枚出るだけで、「セットの継続を賭けた瞬間」
     *   なのに RUSH 転落(rush_end_all)より軽い画だった。
     *   capacity_judge(staging/anims/lcdanims-extra.js)で
     *     ヘルスチェック(プローブが走る) → HEALTHY → キャパシティチェック(ゲージ)
     *   の2段に伸ばし、**継続ラインを越えた瞬間** を見せ場にする。
     *   ok は setEnd(当落が確定したイベント)由来なので煽りにはならない。
     */
    when: { event: 'setEnd', mode: ['BONUS'], match: { result: ['CONTINUE'] } },
    weight: { BONUS: 100, default: 0 },
    priority: 'result',
    duration: 3000,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'health_check' } },
      { at: 0,    layer: 'lcd',  action: 'anim',
        params: { anim: 'capacity_judge', ok: true, label: '$healthLabel' } },
      { at: 0,    layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 500,  layer: 'sfx',  action: 'synth', params: { preset: 'countdown_tick' } },
      { at: 900,  layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      // 判定が出る瞬間(capacity_judge の p≒0.7 = 1820ms)に光と音を合わせる
      { at: 1820, layer: 'sfx',  action: 'synth', params: { preset: 'dynamo_scale' } },
      { at: 1820, layer: 'overlay', action: 'flash', params: { color: '#7bf7d0', ms: 280 } },
      { at: 1820, layer: 'overlay', action: 'shake', params: { power: 14, ms: 420 } },
      { at: 1820, layer: 'lamp', action: 'pattern', params: { pattern: 'bonus' } },
      { at: 1860, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 1860, layer: 'char', action: 'motion', params: { char: 'kiro', motion: 'hooray' } },
      { at: 1900, layer: 'lcd',  action: 'particles', params: { preset: 'coin', x: 220, y: 200, count: 20 } },
      /*
       * 2026-08-14 ユーザー指摘 U1 の文言(「継続した」と一目で分かること)は
       * ジャッジの画が **大文字の「キャパシティ確保 — 継続!!」** で受け持つ。
       * ここでテキスト帯を出すと同じことを2箇所で言う(U8)うえ、
       * 帯のプレートがジャッジの結論に重なるので出さない。
       * 「SET n へ」という続きの情報はモード側のテロップが流している。
       */
    ],
  },

  /* ── ボーナス終了時のジャッジ(U34)─────────────────────
   *
   * ■ ここが短い理由(実装上の制約。触る前に必ず読むこと)
   *   ボーナス最終ゲームの setEnd は **その場で transition が走る**
   *   (game/modes/bonus.js は holdMs も onNextSpin も指定しない)。
   *   遷移先の modeEnter で main.js が lcdAnims.clear() を呼ぶため、
   *   ここで液晶アニメを出しても **同じフレームで消える**。
   *   なので当選側は「音と光の一撃」だけを置き、
   *   見せ場そのものは直後の RUSH 突入カットイン(data/scenarios/rush.js /
   *   rushes.js の *_entry)へ渡す = 「そのまま突入告知へ繋ぐ」。
   */
  {
    id: 'bonus_end_judge_win',
    name: 'ボーナス終了ジャッジ(RUSH当選 → 突入へ)',
    when: { event: 'setEnd', mode: ['BONUS'], match: { result: ['BONUS_END'] } },
    weight: { BONUS: 100, default: 0 },
    priority: 'result',
    duration: 900,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'health_check' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rush' } },
      { at: 120, layer: 'sfx',     action: 'synth', params: { preset: 'checklist_ok' } },
      { at: 140, layer: 'overlay', action: 'flash', params: { color: '#7bf7d0', ms: 220 } },
      { at: 140, layer: 'overlay', action: 'shake', params: { power: 10, ms: 260 } },
      { at: 160, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
    ],
  },

  {
    id: 'bonus_end_quiet',
    name: 'ボーナス終了(RUSH非当選 — 静かに落とす)',
    /*
     * 非当選側は setEnd を出さずに通常時へ落ちるので、modeExit を拾う。
     * 当選側と対になる「緩急」の急のほう: 光らせない・跳ねさせない。
     * 何が起きたか(高確から再スタート)はモード側のテロップが言うので、
     * ここは文字を1文字も出さない(U8)。
     *
     * 【2026-08-15 検証指摘 / 条件漏れ】
     * modeExit は「ボーナスが自然に終わった」ときだけでなく、
     * **スタックを畳んだとき** にも飛ぶ(game/modemachine.js):
     *   forced:true    … 100回転切れ(forceMode('RESULT'))/ エンディング突入
     *   restarted:true … リザルトからのリスタート
     *   dropped:true   … スタック上限に当たって押し出された
     * このうち 100回転切れは **残りゲームもRUSH当選も買い取られる**(data/session.js)ので、
     * そこで「RUSH非当選…」のブザーとキャラの落胆を出すのは事実に反するうえ、
     * リザルトへ切り替わる瞬間に鳴って邪魔になる。
     * 3つのマーカーが付いていないとき(= 本当に自然終了したとき)だけ発火させる。
     * ※ ctx はスナップショット+payload なので、畳まれていない modeExit では
     *   これらのキーは undefined になる(スナップショット側に同名のキーは無い)。
     */
    when: {
      event: 'modeExit',
      match: {
        id: ['BONUS'],
        'state.rushWin': [false],
        forced: [undefined],
        restarted: [undefined],
        dropped: [undefined],
      },
    },
    weight: { default: 100 },
    duration: 1200,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'health_check', gain: 0.45 } },
      { at: 300, layer: 'sfx',  action: 'synth', params: { preset: 'error_buzz', gain: 0.35 } },
      { at: 300, layer: 'lamp', action: 'pattern', params: { pattern: 'default' } },
      { at: 320, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 1000, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'bonus_payout_coins',
    name: 'ボーナス中の払出でコインが舞う',
    when: { event: 'payoutStart', mode: ['BONUS'] },
    weight: { BONUS: 100, default: 0 },
    duration: 900,
    cues: [
      { at: 0, layer: 'lcd', action: 'particles', params: { preset: 'coin', x: 220, y: 250, count: 8 } },
    ],
  },
];
