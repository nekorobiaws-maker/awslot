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
 * ■ キャラの配役(2026-08-13 修正)
 *   ボーナス改名にキャラが追従しておらず「ゴーストボーナスなのにサメが出る」状態だった。
 *   bonusId で主役を固定する:
 *     S3_BIG / DYNAMO_BIG(ゴーストボーナス / 同SP)… 主役は幽霊 Kiro。サメは出さない
 *     LAMBDA_REG(シャークボーナス)                … 主役はサメ George。幽霊は引っ込める
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
      // ゴースト7を揃えるので主役は幽霊。通常時から居座っているサメは引っ込める
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
      // サメBARを揃えるので主役はサメ。幽霊は引っ込める
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
    name: 'ボーナス当選カットイン(幽霊+7のドン)',
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
      { at: 1200, layer: 'lcd',     action: 'text',
        params: { text: 'GHOST BONUS', sub: `${GHOST_B.games}G / ベル揃いで15枚`, color: '#ffd166', ms: 1800 } },
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
      // 主役はサメ。以前は幽霊を出していたので名前と絵が食い違っていた
      { at: 200, layer: 'char',    action: 'hide',  params: { char: 'kiro' } },
      { at: 800, layer: 'char',    action: 'show',  params: { char: 'george', pose: 'bite' } },
      { at: 800, layer: 'char',    action: 'motion', params: { char: 'george', motion: 'swimIn' } },
      { at: 1000, layer: 'voice',  action: 'play',  params: { key: 'george_bonus_01' } },
      { at: 1100, layer: 'lcd',    action: 'text',
        params: { text: 'SHARK BONUS', sub: `${SHARK_B.games}G / ベル揃いで15枚`, color: '#ffd95e', ms: 1600 } },
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
      // ゴーストボーナスSP なので主役は幽霊のみ。サメは出さない
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
    name: 'ゴーストボーナスSP セット継続(オンデマンド切替)',
    when: { event: 'setEnd', mode: ['BONUS'], match: { result: ['CONTINUE'] } },
    weight: { BONUS: 100, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'dynamo_scale' } },
      { at: 0,    layer: 'lcd',  action: 'anim',  params: { anim: 'health_check', ok: true, label: '$healthLabel' } },
      { at: 800,  layer: 'lamp', action: 'pattern', params: { pattern: 'bonus' } },
      { at: 900,  layer: 'lcd',  action: 'particles', params: { preset: 'coin', x: 220, y: 200, count: 18 } },
      { at: 1000, layer: 'lcd',  action: 'text',
        params: { text: 'CONTINUE', sub: 'オンデマンドで受けきった — スループット上限なし', color: '#7bf7d0', ms: 900 } },
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
