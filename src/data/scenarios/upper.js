/**
 * 上位AT / 引き戻し最終防衛 / エンディング / 天井 の演出シナリオ(Phase 5)。
 * DESIGN.md 6.5 / IDEAS.md 2-9, 3-10, 3-17, 4-1, 4-3
 */

import { UPPER_AT_SPEC_BY_ID } from '../modes.js';

/*
 * スペック数値は data/modes.js から取り込んでテンプレートで組み立てる(2026-08-13)。
 *
 * 以前は「純増8枚」「1セット10G」のように文言へ直接書いていたため、
 * バランス調整のたびに画面表示だけが旧値のまま取り残されていた
 * (椿のレビューで11件の乖離を検出)。ここで参照にしておけば二度とズレない。
 * data → data の import なので依存方向の問題は無く、
 * モジュール読み込み時に文字列が確定するので実行時コストも増えない。
 */

const SLS = UPPER_AT_SPEC_BY_ID.SERVERLESS_RUSH;
const MREG = UPPER_AT_SPEC_BY_ID.MULTI_REGION;

export default [
  // ── M09. Serverless RUSH ────────────────────────
  {
    id: 'serverless_entry',
    name: 'Serverless RUSH 昇格(EC2 が λ になる)',
    // IDEAS.md 3-10「サーバーレス化ミッション」
    when: { event: 'modeEnter', enterMode: ['SERVERLESS_RUSH'], match: { resumed: [false] } },
    weight: { default: 100 },
    duration: 4000,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 420 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 20, ms: 760 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'serverless_up' } },
      // EC2 が λ になる既存カットインで昇格を見せてから、RUSH突入と同じスラムでロゴドン。
      // 変種テーブル(cutins-extra.js の RUSH_VARIANTS)で色と文言だけ差し替えている。
      { at: 80,   layer: 'overlay', action: 'cutin', params: { id: 'serverless_up' } },
      { at: 900,  layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 1000, layer: 'overlay', action: 'cutin', params: { id: 'rush_slam', variant: 'SERVERLESS_RUSH' } },
      { at: 1220, layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit' } },
      { at: 1220, layer: 'overlay', action: 'shake', params: { power: 26, ms: 520 } },
      { at: 1660, layer: 'sfx',     action: 'synth', params: { preset: 'cutin_whoosh' } },
      { at: 1680, layer: 'overlay', action: 'flash', params: { color: '#ffb46a', ms: 300 } },
      { at: 1900, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 2500, layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'premium' } },
      { at: 2500, layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'zoom' } },
      { at: 2700, layer: 'voice',   action: 'play',  params: { key: 'kiro_serverless_01' } },
      // 「突入」を含むので自動 sticky。純増と継続率は sub 行で補足する
      { at: 2900, layer: 'lcd',     action: 'text',
        params: { text: 'SERVERLESS RUSH 突入!!', sub: `純増${SLS.payoutPerGame}枚 / 継続${Math.round(SLS.continueRate * 100)}% — DC管理から解放された`, color: '#ffb46a', ms: 2200 } },
      { at: 3000, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_serverless' } },
      { at: 3200, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 30 } },
    ],
  },
  {
    id: 'upper_stock_consume',
    name: '上位AT/RUSH の上乗せストック消化',
    when: { event: 'setEnd', match: { result: ['STOCK'] } },
    weight: { default: 200 },
    duration: 1600,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'stock_consume' } },
      { at: 0,   layer: 'lcd',  action: 'anim',  params: { anim: 'health_check', ok: true, label: 'STOCK' } },
      { at: 500, layer: 'lamp', action: 'pattern', params: { pattern: 'rush' } },
      { at: 600, layer: 'lcd',  action: 'particles', params: { preset: 'scale', x: 220, y: 150, count: 16 } },
    ],
  },

  // ── M10. Multi-Region ──────────────────────────
  {
    id: 'multi_region_entry',
    name: 'Multi-Region 突入(世界地図が点灯)',
    // IDEAS.md 3-17「Global Accelerator光速リーチ」/ 4-1
    when: { event: 'modeEnter', enterMode: ['MULTI_REGION'], match: { resumed: [false] } },
    weight: { default: 100 },
    duration: 4400,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 460 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 24, ms: 900 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'region_light' } },
      { at: 80,   layer: 'overlay', action: 'cutin', params: { id: 'multi_region_entry' } },
      { at: 900,  layer: 'lcd',     action: 'anim',  params: { anim: 'all_regions_light' } },
      // 世界地図が点灯しきったところへ、RUSH突入と同じスラムでロゴドン(虹色の変種)
      { at: 1400, layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 1500, layer: 'overlay', action: 'cutin', params: { id: 'rush_slam', variant: 'MULTI_REGION' } },
      { at: 1720, layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit' } },
      { at: 1720, layer: 'overlay', action: 'shake', params: { power: 30, ms: 560 } },
      { at: 2160, layer: 'sfx',     action: 'synth', params: { preset: 'cutin_whoosh' } },
      { at: 2180, layer: 'overlay', action: 'flash', params: { color: '#ff9ad5', ms: 320 } },
      { at: 2400, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 3000, layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 3000, layer: 'char',    action: 'motion', params: { char: 'george', motion: 'tailWhip' } },
      { at: 3200, layer: 'voice',   action: 'play',  params: { key: 'george_multiregion_01' } },
      // 「突入」を含むので自動 sticky
      { at: 3400, layer: 'lcd',     action: 'text',
        params: { text: 'MULTI-REGION 突入!!', sub: `純増${MREG.payoutPerGame}枚 / 継続${Math.round(MREG.continueRate * 100)}% — 全レア役で上乗せ確定`, color: '#ff9ad5', ms: 2200 } },
      { at: 3500, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_multiregion' } },
      { at: 3700, layer: 'overlay', action: 'particles', params: { preset: 'rainbow', x: 360, y: 400, count: 44 } },
    ],
  },
  {
    id: 'multi_region_light',
    name: 'Multi-Region リージョン点灯(レア役で上乗せ確定)',
    when: { event: 'paramChange', match: { param: ['region_light'] } },
    weight: { default: 100 },
    duration: 1500,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'region_light' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ff9ad5', ms: 200 } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'region_light', lit: '$value' } },
      { at: 80,  layer: 'lcd',     action: 'particles', params: { preset: 'rainbow', x: 220, y: 150, count: 16 } },
      { at: 120, layer: 'char',    action: 'pose',  params: { char: 'george', pose: 'grin' } },
    ],
  },

  /* ── M19. Route 53 フェイルオーバー【退役】───────────────
   *
   * 2026-08-13 の引き戻し1段化(ユーザー指摘「2段はくどい」)で、
   * ROUTE53_FAILOVER には通常プレイから到達しなくなった。
   * 以下4本は `?mode=ROUTE53_FAILOVER` の直撃デバッグでのみ発火する。
   *
   * weight を 0 にせず残しているのは、0 にするとデバッグ時にも一切出なくなり
   * モード単体の見た目確認ができなくなるため。when 条件が
   * ROUTE53_FAILOVER 限定なので通常プレイの演出には一切影響しない。
   * DNS切替の見せ場自体は game/modes/recovery.js のホットスタンバイ最終フェーズへ吸収済み。
   */
  {
    id: 'route53_entry',
    name: 'Route 53 フェイルオーバー突入(最後の砦)',
    // IDEAS.md 2-9「Route53フェイルオーバー予告」
    when: { event: 'modeEnter', enterMode: ['ROUTE53_FAILOVER'], match: { resumed: [false] } },
    weight: { default: 100 },
    duration: 3000,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 320 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 12, ms: 460 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'ttl_tick' } },
      { at: 100,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'panic' } },
      { at: 100,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'shake' } },
      { at: 400,  layer: 'lcd',     action: 'text',
        params: { text: 'DNS FAILOVER', sub: 'TTL の伝播を待て', color: '#ff9a9a', ms: 1900 } },
      { at: 900,  layer: 'voice',   action: 'play',  params: { key: 'kiro_route53_01' } },
      { at: 1200, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_standby' } },
    ],
  },
  {
    id: 'route53_tick',
    name: 'Route 53 TTL カウントダウン',
    when: { event: 'leverOn', mode: ['ROUTE53_FAILOVER'] },
    weight: { ROUTE53_FAILOVER: 100, default: 0 },
    duration: 1800,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'ttl_tick' } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'anim', params: { anim: 'ttl_zero' } },
      { waitFor: 'stop3', after: 160, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
    ],
  },
  {
    id: 'route53_recover',
    name: 'Route 53 復帰成功(一発逆転)',
    when: { event: 'setEnd', match: { layer: ['ROUTE53_FAILOVER'], success: true } },
    weight: { default: 1000 },
    duration: 3000,
    cues: [
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 420 } },
      { at: 0,   layer: 'overlay', action: 'shake', params: { power: 22, ms: 800 } },
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'recover_burst' } },
      { at: 100, layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 100, layer: 'char',    action: 'motion', params: { char: 'george', motion: 'swimIn' } },
      { at: 300, layer: 'lcd',     action: 'text',
        params: { text: 'RESOLVED!!', sub: 'DNS が切り替わった', color: '#7bf7d0', ms: 2000 } },
      { at: 500, layer: 'overlay', action: 'particles', params: { preset: 'rainbow', x: 360, y: 380, count: 36 } },
      { at: 800, layer: 'voice',   action: 'play',  params: { key: 'george_route53_win_01' } },
    ],
  },
  {
    id: 'route53_lose',
    name: 'Route 53 失敗(Free Tier へ転落)',
    when: { event: 'setEnd', match: { layer: ['ROUTE53_FAILOVER'], success: false } },
    weight: { default: 100 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'ttl_zero' } },
      { at: 0,   layer: 'lcd',  action: 'anim',  params: { anim: 'lcd_flash', color: '#602020', strength: 0.5 } },
      { at: 100, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 300, layer: 'lcd',  action: 'text',
        params: { text: 'NO HEALTHY ENDPOINT', sub: '正常な向き先が残っていない', color: '#ff8a8a', ms: 1400 } },
      { at: 600, layer: 'voice', action: 'play', params: { key: 'kiro_lose_01' } },
    ],
  },

  // ── M20. re:Invent エンディング ──────────────────
  {
    id: 'ending_entry',
    name: 're:Invent キーノート突入(完走)',
    // IDEAS.md 2-34「背景変化: re:Invent会場」/ 4-4
    when: { event: 'modeEnter', enterMode: ['REINVENT_ED'], match: { resumed: [false] } },
    weight: { default: 100 },
    duration: 5000,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 520 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 26, ms: 1000 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'ed_fanfare' } },
      { at: 100,  layer: 'overlay', action: 'cutin', params: { id: 'reinvent_keynote' } },
      { at: 1200, layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'premium' } },
      { at: 1200, layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 1400, layer: 'lcd',     action: 'anim',  params: { anim: 'ed_confetti' } },
      { at: 2000, layer: 'voice',   action: 'play',  params: { key: 'kiro_ending_01' } },
      { at: 2600, layer: 'lcd',     action: 'text',
        params: { text: 'COMPLETE!!', sub: '完走おめでとう', color: '#ffe066', ms: 2400 } },
      { at: 2800, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_ending' } },
      { at: 3000, layer: 'overlay', action: 'particles', params: { preset: 'rainbow', x: 360, y: 420, count: 48 } },
    ],
  },
  {
    id: 'ending_announce',
    name: 'エンディング中の新サービス発表',
    when: { event: 'leverOn', mode: ['REINVENT_ED'] },
    weight: { REINVENT_ED: 100, default: 0 },
    chance: 0.34,
    duration: 1600,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'announce' } },
      { at: 0,   layer: 'char', action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'particles',
        params: { preset: 'rainbow', x: 220, y: 150, count: 14 } },
      { waitFor: 'stop3', after: 150, layer: 'overlay', action: 'flash',
        params: { color: '#ff8ad0', ms: 160 } },
    ],
  },
  {
    id: 'ending_exit',
    name: 'エンディング終了(Free Tier へリセット)',
    when: { event: 'modeExit', match: { id: ['REINVENT_ED'] } },
    weight: { default: 100 },
    duration: 1600,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'idle' } },
      { at: 0,   layer: 'lcd',  action: 'anim',  params: { anim: 'lcd_flash', color: '#ffffff', strength: 0.6 } },
      { at: 200, layer: 'lcd',  action: 'text',
        params: { text: 'SEE YOU', sub: 'また無料枠から始めよう', color: '#8ab4ff', ms: 1200 } },
    ],
  },

  // ── 通常時の積み残し(天井 / 内部状態)───────────
  {
    id: 'ceiling_sla',
    // 表記は Auto Recovery(自動復旧)へ統一。
    // 旧「SLA 99.9% 保証 / サービスクレジット」はAWS的に意味が逆(未達時の返金補償)だった。
    name: '天井到達 — Auto Recovery 発動テロップ',
    when: { event: 'paramChange', match: { param: ['ceiling'] } },
    weight: { default: 1000 },
    duration: 3000,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'sla_credit' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#7cf3ff', ms: 340 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 100,  layer: 'lcd',     action: 'anim',  params: { anim: 'auto_recovery' } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 1400, layer: 'voice',   action: 'play',  params: { key: 'kiro_ceiling_01' } },
    ],
  },
  {
    id: 'substate_up',
    name: '通常時の内部状態が昇格(ステージチェンジ)',
    when: { event: 'paramChange', match: { param: ['substate'], delta: 1 } },
    weight: { default: 100 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'stage_change' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ffb04a', ms: 260 } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 60,  layer: 'lcd',     action: 'anim',  params: { anim: 'lcd_flash', color: '#ffb04a', strength: 0.5 } },
      { at: 100, layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 100, layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      { at: 300, layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 220, y: 150, count: 18 } },
      { at: 400, layer: 'lcd',     action: 'text',
        params: { text: 'STAGE UP', sub: 'コンテナが温まってきた', color: '#ffb04a', ms: 1400 } },
    ],
  },

  // ── CZ 追加分の特徴演出 ─────────────────────────
  {
    id: 'cz_checklist_green',
    name: 'Trusted Advisor 項目がグリーンになる',
    when: { event: 'paramChange', match: { param: ['checklist'] } },
    weight: { default: 100 },
    duration: 1100,
    cues: [
      { at: 0,  layer: 'sfx',  action: 'synth', params: { preset: 'checklist_ok' } },
      { at: 0,  layer: 'lcd',  action: 'anim',  params: { anim: 'checklist_green', index: '$value' } },
      { at: 60, layer: 'lcd',  action: 'particles', params: { preset: 'scale', x: 220, y: 120, count: 10 } },
      { at: 80, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
    ],
  },
  {
    id: 'cz_pillar_raise',
    name: 'Well-Architected の柱をジョージが立てる',
    // IDEAS.md 2-30「Well-Architected5本柱予告」
    when: { event: 'paramChange', match: { param: ['pillar'] } },
    weight: { default: 100 },
    duration: 1600,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'pillar_up' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 180 } },
      { at: 0,   layer: 'lcd',     action: 'anim',  params: { anim: 'pillar_raise', index: '$value', count: 6 } },
      { at: 60,  layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 60,  layer: 'char',    action: 'motion', params: { char: 'george', motion: 'tailWhip' } },
      { at: 900, layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 220, y: 190, count: 12 } },
    ],
  },

  /* ── 上位ATのセット継続(簡易告知)────────────────────────────────
   *
   * AS_RUSH の見せ場版ヘルスチェック(rush_health_check_continue)へ
   * mode:['AS_RUSH'] を付けたため、上位ATのセット継続がどのシナリオにも
   * 拾われなくなる。ここで各モードの語彙に合わせた簡易告知を用意する。
   * 純増・継続率・セットG数はすべて modes.js の実装値から組み立てる。
   */
  {
    id: 'serverless_continue',
    name: 'Serverless RUSH セット継続(同時実行数が保たれた)',
    when: { event: 'setEnd', mode: ['SERVERLESS_RUSH'], match: { result: ['CONTINUE'] } },
    weight: { SERVERLESS_RUSH: 100, default: 0 },
    priority: 'result',
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'serverless_up' } },
      { at: 0,   layer: 'lcd',     action: 'anim',
        params: { anim: 'health_check_impact', ok: true, addGames: SLS.setGames, ms: 1900 } },
      { at: 980, layer: 'overlay', action: 'flash', params: { color: '#ffb46a', ms: 240 } },
      { at: 1000, layer: 'lamp',   action: 'pattern', params: { pattern: 'rush' } },
      { at: 1020, layer: 'char',   action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { at: 1100, layer: 'lcd',    action: 'text',
        // 「継続!!」と「+◯G」は health_check_impact が描くので帯では繰り返さない
        params: { text: 'CONCURRENCY OK', sub: '同時実行数は確保されている', color: '#ffb46a', ms: 1600, sticky: true } },
    ],
  },
  {
    id: 'multi_region_continue',
    name: 'Multi-Region セット継続(全リージョン正常)',
    when: { event: 'setEnd', mode: ['MULTI_REGION'], match: { result: ['CONTINUE'] } },
    weight: { MULTI_REGION: 100, default: 0 },
    priority: 'result',
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'region_light' } },
      { at: 0,   layer: 'lcd',     action: 'anim',
        params: { anim: 'health_check_impact', ok: true, addGames: MREG.setGames, ms: 1900 } },
      { at: 980, layer: 'overlay', action: 'flash', params: { color: '#ff9ad5', ms: 240 } },
      { at: 1000, layer: 'lamp',   action: 'pattern', params: { pattern: 'bonus' } },
      { at: 1020, layer: 'char',   action: 'pose',  params: { char: 'george', pose: 'grin' } },
      { at: 1100, layer: 'lcd',    action: 'text',
        // 「継続!!」と「+◯G」は health_check_impact が描くので帯では繰り返さない
        params: { text: 'ALL REGIONS OK', sub: '全リージョンが正常稼働', color: '#ff9ad5', ms: 1600, sticky: true } },
    ],
  },
];
