/**
 * オートスケーリングRUSH の突入 / 引き戻し層の演出シナリオ。
 * DESIGN.md 6.5 / IDEAS.md 2-2, 2-8, 3-8
 *
 * ── U11(2026-08-14)で退役したシナリオ ────────────────────
 * RUSH がセット継続制をやめた(4種それぞれ「伸びる軸」を1本持つ形へ分解された)ため、
 * 以下は撃つイベントそのものが無くなったので削除した:
 *   rush_scale_out(param:'dc' = 純増段階の上昇)
 *   rush_scale_in / rush_scale_out_max
 *   rush_health_check / _continue / _exit(セット末のヘルスチェック)
 * 代わりの演出は data/scenarios/rushes.js に4種ぶん置いてある。
 */

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
        params: {
          text: 'AUTO SCALING RUSH 突入!!', sub: 'EC2 の台数がそのまま残りゲーム数',
          color: '#7bf7d0', ms: 2000,
        } },
      { at: 1900, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_rush' } },
      { at: 2200, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 24 } },
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

  {
    id: 'standby_down',
    name: 'ホットスタンバイ失敗(システムダウン)',
    /*
     * U3(2026-08-14 ユーザー要望): 消化し切って失敗したときに
     * **終わったことが分かる終了メッセージ**を出す。
     *
     * これまで success:true 側にしか結果シナリオが無く、失敗は
     * テロップが1行流れるだけで通常時へ落ちていた(しかも即時遷移だったので
     * その1行すら見えなかった)。game/modes/recovery.js 側で遷移を
     * onNextSpin にしたので、この画を見せ切ってから通常時へ戻る。
     *
     * 二重表示の回避(U8): テロップは「RTO 超過… 通常運転へ戻ります」、
     * ここは「SYSTEM DOWN / 切り替えが完了しませんでした」と別の言い方にしている。
     */
    when: { event: 'setEnd', match: { layer: ['HOT_STANDBY'], success: [false] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 2600,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'error_buzz' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 320 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 12, ms: 420 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'default' } },
      { at: 100,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'panic' } },
      { at: 100,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'shake' } },
      { at: 250,  layer: 'char',    action: 'show',  params: { char: 'george', pose: 'normal' } },
      { at: 400,  layer: 'lcd',     action: 'text',
        params: { text: 'SYSTEM DOWN', sub: '切り替えが完了しませんでした', color: '#ff8a8a', ms: 1900 } },
      { at: 1500, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
      { at: 1600, layer: 'voice',   action: 'play',  params: { key: 'kiro_cz_lose' } },
    ],
  },

];
