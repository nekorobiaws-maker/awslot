/**
 * 受け手のいなかった paramChange を拾う演出(2026-08-14 ロジック担当からの申し送り)。
 *
 * ゲーム側は「起きたこと」をイベントで放送するだけで、拾うかどうかは演出側の自由
 * (DESIGN.md 4.2 の一方向依存)。とはいえ **レア役でしか起きない見せ場** が
 * 無音のまま通り過ぎるのはもったいないので、ここで受ける。
 *
 *   aurora_addgame  … game/modes/rushes.js。Aurora RUSH でレア役を引くと
 *                     残りゲーム数が +1(リードレプリカが1台増えるメタファー)。
 *   standby_extend  … game/modes/recovery.js。ホットスタンバイ中にレア役を引くと
 *                     切替猶予が +1G(AZ-c が持ちこたえる)。
 *
 * どちらも **契機がレア役限定**(data/rareroles.js)なので、
 * 出た時点で「いまレア役を引いた」ことが確定している = 嘘にならない。
 * 当落そのものを断言する語(確定・突入)は使わない。延長は延命であって救済ではない。
 *
 * ■ U8(同じ情報をポップアップとテロップに二重表示しない)
 *   ゲーム側は同じ瞬間にテロップも返す:
 *     Aurora  『レプリカ追加 — 残り n G』(残り G数 = 持続する状態情報)
 *     Standby (盤面の切替進捗ゲージが状態を持つ)
 *   なのでポップアップ側は **数を繰り返さず「いま増えた」瞬間だけ**を言う。
 *   役割分担は「瞬間の演出 = ポップアップ / 持続的な状態情報 = テロップ・盤面」。
 *
 * ■ 否定文言は、そのイベントが起きる回には構造的に出さない(2026-08-15 U67-2)
 *   ここの2本は **イベントが飛んできた瞬間にだけ** 出る肯定側なので、
 *   単体では矛盾しない。問題は「起きなかったこと」を言う相方のほうで、
 *   Aurora RUSH では
 *     aurora_scale_up(スケールアップした)+「まだスケールしません」(予告)
 *   が同じゲームに同時に出ていた(ユーザー指摘)。
 *   **否定・待機系を書くときは、そのイベントが起きうる成立役を
 *   when から丸ごと外すこと**(レア役契機なら `rare: false`)。
 *   ルールの全文と4RUSHの点検結果は data/scenarios/yokoku-gimmick.js の
 *   「RUSH中の上乗せ期待予告」セクション冒頭にある。
 *
 *   なお pf_standby_extend の相方(rush.js の standby_progress)は
 *   ゲージの絵だけで文字を出さないので、この穴は開いていない。
 *
 * ■ 受けていない paramChange について(判断の記録)
 *   add_coin / add_set / add_game(上乗せゾーンと上位AT)は、
 *   **盤面が毎フレーム合計を描いている**(render/lcd.js の _drawCloudFront /
 *   _drawKinesis / lcd-rush.js)ので、ポップアップを足すと U8 の二重表示になる。
 *   よって受け手は作らない。イベント自体は盤面以外の受け手(将来の音・ランプ)や
 *   デバッグの観測点として意味があるので、削除も提案しない(game/ は演出担当の管轄外)。
 *   freeze_win も同様で、フリーズ本体の演出(data/scenarios/freeze.js)が
 *   同じ瞬間を丸ごと受け持っている。
 */

export default [
  {
    id: 'pf_aurora_addgame',
    name: 'Aurora RUSH: リードレプリカ追加(レア役で残りG +1)',
    when: {
      event: 'paramChange', mode: ['AURORA_RUSH'],
      match: { param: ['aurora_addgame'] },
    },
    weight: { AURORA_RUSH: 100, default: 0 },
    // 上乗せの告知ではなく「1台増えた」瞬間の絵。announce 枠は取らせない
    priority: 'gimmick',
    duration: 1600,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'dynamo_scale' } },
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      // 柱が1本立つ絵をレプリカの増設に見立てる(専用アニメは足さない)
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 1, count: 3 } },
      { at: 140, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 2, count: 3 } },
      { at: 240, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 3, count: 3 } },
      { at: 200, layer: 'overlay', action: 'particles', params: { preset: 'scale', x: 360, y: 360, count: 12 } },
      { at: 260, layer: 'lcd',  action: 'text',
        params: {
          text: 'リードレプリカ 増設', sub: 'クラスターに1台足された',
          color: '#c8b0ff', ms: 1100, sticky: false,
        } },
    ],
  },

  {
    id: 'pf_standby_extend',
    name: 'ホットスタンバイ: 切替猶予 +1G(レア役で持ちこたえる)',
    when: {
      event: 'paramChange', mode: ['HOT_STANDBY'],
      match: { param: ['standby_extend'] },
    },
    weight: { HOT_STANDBY: 100, default: 0 },
    priority: 'gimmick',
    duration: 1500,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'health_check' } },
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'health_check', ok: true, label: 'AZ-c HOLDING' } },
      { at: 220, layer: 'overlay', action: 'flash', params: { color: '#ffd166', ms: 180 } },
      { at: 260, layer: 'lcd',  action: 'text',
        params: {
          text: '切替猶予 +1G', sub: 'AZ-c が持ちこたえた',
          color: '#ffd166', ms: 1100, sticky: false,
        } },
    ],
  },
];
