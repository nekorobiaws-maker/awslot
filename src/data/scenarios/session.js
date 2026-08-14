/**
 * セッション(スコアアタック)の演出シナリオ。
 *
 * 2026-08-14 ユーザー指摘 U7:
 * 「100ゲーム終了時にリザルトがいきなり出て唐突」。
 * 最後の1回転が終わった瞬間に全画面のリザルトが出ていたため、
 * プレイヤーは「え、終わったの?」となっていた。
 *
 * ここでワンクッションを挟む:
 *   最終ゲームの払出 → 幕(FINISH の告知) → 少し溜め → リザルト
 *
 * リザルト側(render/resultpanel.js)は RESULT_OPEN_DELAY_MS だけ開くのを待つので、
 * この演出の尺(duration)とそちらの待ち時間は必ずセットで見ること。
 *
 * ゲーム数はハードコードしない(data/session.js の SESSION.totalGames を差し込む)。
 */

import { SESSION } from '../session.js';

export default [
  {
    id: 'session_finish',
    name: 'セッション終了(リザルト前のワンクッション)',
    /*
     * game/flow.js の _endSession() が最後に emit する 'sessionEnd' で起動する。
     * この時点でモードは既に RESULT へ畳まれているので、
     * 液晶は真っさらな状態(main.js の modeEnter 掃除の直後)から演出を積める。
     */
    when: { event: 'sessionEnd' },
    weight: { default: 100 },
    // 結果告知としてテキスト帯の枠を確実に取る(賑やかしに割り込まれないように)
    priority: 'result',
    duration: 2600,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 320 } },
      { at: 120,  layer: 'overlay', action: 'shake', params: { power: 14, ms: 420 } },
      { at: 200,  layer: 'lcd',     action: 'text',
        params: {
          text: `${SESSION.totalGames} GAMES FINISH`,
          sub: `${SESSION.totalGames}ゲーム終了しました`,
          color: '#ffe066', ms: 1200, sticky: false,
        } },
      { at: 900,  layer: 'sfx',     action: 'synth', params: { preset: 'countdown_tick' } },
      { at: 1400, layer: 'sfx',     action: 'synth', params: { preset: 'announce' } },
      { at: 1400, layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 1400, layer: 'lcd',     action: 'text',
        params: {
          text: 'あなたの成績は…?',
          sub: 'いま集計しています',
          color: '#ffffff', ms: 1100, sticky: false,
        } },
      { at: 2000, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 300, count: 18 } },
    ],
  },
];
