/**
 * 演出アクションの実装レジストリ。DESIGN.md 6.5
 *
 * シナリオの cues は { layer, action } の組で参照され、
 * ここでは "layer.action" をキーに実処理へ振り分ける。
 *
 * 新しいアクション種別が必要になったときだけ1行足す。
 * 演出データが増えてもここは変わらない、というのがこの設計の要点。
 *
 * 依存はすべてコンストラクタ注入。staging/ が具体的な描画実装を直接 import しないため、
 * テストやスタブ差し替えが容易になる。
 */

/**
 * @param {object} deps
 * @param {import('./anims/lcdanims.js').LcdAnims} deps.lcdAnims
 * @param {import('./anims/cutins.js').Cutins} deps.cutins
 * @param {import('./anims/particles.js').Particles} deps.lcdParticles
 * @param {import('./anims/particles.js').Particles} deps.overlayParticles
 * @param {import('../render/chars/index.js').CharacterLayer} deps.chars
 * @param {import('../render/overlay.js').OverlayView} deps.overlay
 * @param {import('../render/cabinet.js').CabinetView} deps.cabinet
 * @param {import('../render/reelview.js').ReelView} deps.reelView
 * @param {import('../engine/audio.js').AudioEngine} [deps.audio] 効果音/BGM(未指定なら無音)
 * @param {import('../engine/voice.js').VoicePlayer} [deps.voice] キャラ音声(未指定なら無音)
 * @returns {Record<string, (params:object, ctx:object)=>void>}
 */
export function createActions({
  lcdAnims,
  cutins,
  lcdParticles,
  overlayParticles,
  chars,
  overlay,
  cabinet,
  reelView,
  audio = null,
  voice = null,
}) {
  return {
    // ── 液晶 ────────────────────────────────
    'lcd.anim': (params) => lcdAnims.play(params.anim, params),
    'lcd.text': (params) => lcdAnims.showText(params),
    'lcd.particles': (params) => lcdParticles.emit(params.preset, params),

    // ── キャラ ──────────────────────────────
    'char.show': (params) => chars.show(params.char, params.pose, params),
    'char.hide': (params) => chars.hide(params.char),
    'char.pose': (params) => chars.pose(params.char, params.pose),
    'char.motion': (params) => chars.motion(params.char, params.motion),

    // ── オーバーレイ(全画面) ─────────────────
    'overlay.flash': (params) => overlay.flash(params.color ?? '#ffffff', params.ms ?? 220),
    'overlay.cutin': (params) => cutins.play(params.id, params),
    'overlay.particles': (params) => overlayParticles.emit(params.preset, params),
    'overlay.shake': (params) => overlay.shake(params.power ?? 12, params.ms ?? 400),
    // フリーズはゲーム進行を止める操作なので、演出側からは触らない方針。
    // (DESIGN.md 4.2「演出側からゲーム状態を変更することは一切禁止」)
    // Phase 4 以降で flow 側に freeze API を用意してから接続する。
    'overlay.freeze': () => {},

    // ── 筐体 ────────────────────────────────
    'lamp.pattern': (params) => cabinet.setLampPattern(params.pattern),

    // ── リール ──────────────────────────────
    'reelfx.highlight': (params) => reelView.highlight(params.ms ?? 600, params.color),
    // リールロックは reelctrl の停止制御に介入するため、同じ理由で今は空実装。
    'reelfx.lock': () => {},

    // ── 音(Phase 4: 効果音/BGM、Phase 6: キャラ音声) ──
    // params をそのまま opts として渡すので、シナリオ側で
    // { preset:'payout_tick', step:5, gain:0.8, rate:1.2, pan:-0.3 } のような
    // 動的パラメータが書ける(audio.playPreset のスキーマに準拠)。
    'sfx.synth': (params) => { audio?.playPreset(params.preset, params); },
    // 未生成の音声キーは voice 側が静かに無視するので、ここでの分岐は不要。
    'voice.play': (params) => { voice?.play(params.key); },
    // 同じ曲を指定した場合 changeBgm は no-op になるため、
    // モード遷移による自動切替(main.js)と重なっても鳴り直さない。
    'bgm.change': (params) => { audio?.changeBgm(params.bgm, { fadeMs: params.fadeMs ?? 800 }); },
  };
}
