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
 * @param {import('../game/flow.js').GameFlow} [deps.flow] リールロック要求の宛先(未指定なら no-op)
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
  flow = null,
}) {
  return {
    // ── 液晶 ────────────────────────────────
    'lcd.anim': (params) => lcdAnims.play(params.anim, params),
    'lcd.text': (params) => lcdAnims.showText(params),
    'lcd.particles': (params) => lcdParticles.emit(params.preset, params),
    /**
     * 再生中の液晶アニメを畳む(U8 の二重表示対策 / 2026-08-15 検証指摘 F12)。
     *
     * 途中経過のゲージ(cw_meter_swing など ms 1700)は、結果告知が出た後も
     * **結果プレートの裏で生き続ける**。「ATTACK MITIGATED」の下に
     * 途中の残バジェットが透けて、同じ意味の数字が別の値で同居していた。
     * 結果告知シナリオの先頭でこれを呼べば、古い画だけが素早く消える。
     *   params: { ms } … 残り時間の上限(既定 160ms。0 にはしない = ぶつ切りを避ける)
     * テキスト帯には触らない(結果の1行を消してしまうため)。
     */
    'lcd.windDown': (params) => lcdAnims.windDown(Math.max(0, params?.ms ?? 160)),

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
    /**
     * 暗転(U21 / 2026-08-14)。フリーズの「溜め」用。
     *   { alpha, holdMs, fadeInMs, fadeOutMs } … 暗転を張る(hold 中は減衰しない)
     *   { release: true, fadeOutMs }           … 張ってある暗転を明転させる
     * flash では上限0.55かつ線形減衰なので真っ暗を維持できない(render/overlay.js 参照)。
     */
    'overlay.blackout': (params) => {
      if (params.release) {
        overlay.releaseBlackout(params.fadeOutMs ?? params.ms ?? 200);
        return;
      }
      overlay.blackout(
        params.alpha ?? 0.97,
        params.holdMs ?? params.ms ?? 800,
        params.fadeInMs ?? 260,
        params.fadeOutMs ?? 200,
      );
    },
    /**
     * 暗転の上に出す1行(U21 の「神の声」)。
     * 液晶(z=2)はオーバーレイ(z=8)の下なので、暗転中の文言は lcd.text では読めない。
     * **暗転中だけ**使うこと。通常の告知は今までどおり lcd.text を使う(U8 の役割分担を守るため)。
     */
    'overlay.text': (params) => overlay.showLine(params),
    // フリーズはゲーム側 game/flow.js の FLOW.FREEZE が担当するようになったので、
    // 演出側からのフリーズ要求は不要(恩恵つきのフリーズを演出が起こしてはいけない)。
    // 演出データが古い書き方で 'overlay.freeze' を呼んでも壊れないよう受け口だけ残す。
    'overlay.freeze': () => {},

    // ── 筐体 ────────────────────────────────
    'lamp.pattern': (params) => cabinet.setLampPattern(params.pattern),

    // ── リール ──────────────────────────────
    'reelfx.highlight': (params) => reelView.highlight(params.ms ?? 600, params.color),
    /**
     * リールロック(次のレバーONでリールが回り出すのを遅らせる "間")。
     *
     * これは DESIGN.md 4.2 の例外ではない。flow.lockReels() は
     * **RNGを一切消費せず、成立役も引き込み目標も変えない**(変えるのはタイミングだけ)。
     * 恩恵つきのフリーズは data/freeze.js のゲーム抽選が担当していて、
     * 演出側からは絶対に起こせない。
     */
    'reelfx.lock': (params) => flow?.lockReels(params.ms ?? 400),

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
