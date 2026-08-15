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

// 3択クイズの正誤(事実)を引くための読み出し口。判定の実装は盤面側が持つ。
// inspectReelPickState は「盤面が出題中か」を**出題を生成せずに**覗くための口
// (learn.quizResult の砦。下の実装のコメントを参照)
import { inspectReelPickState, reelPickVerdictOf } from './anims/lcdanims-extra.js';
// 学習記録(2026-08-15 学習強化)。**ゲーム側からは絶対に import しないこと**
import { recordQuizAnswer, recordServiceSeen } from '../data/learnlog.js';
import { resolveServiceByQuizAnswer } from '../data/services.js';

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
    /**
     * 始動のピク止め(2026-08-15 ユーザー指示 U64-6)。
     *
     * レバーON直後のリールを **見た目だけ** 一瞬動かして止め、一拍おいてから
     * 回り出したように見せる。reelfx.lock と違ってゲーム側は一切動かない:
     *   - flow にも reelctrl にも触らない(位置・速度・停止制御・成立役は不変)
     *   - 描画位置を差し替えるだけなので RNG も消費しない
     * 実装は render/reelview.js の stall()。描画層を持たないドライバ
     * (scripts/compare-drivers.mjs のスタブ)では呼ばれても何も起きない。
     */
    'reelfx.stall': (params) => reelView?.stall?.(params ?? {}),

    // ── 音(Phase 4: 効果音/BGM、Phase 6: キャラ音声) ──
    // params をそのまま opts として渡すので、シナリオ側で
    // { preset:'payout_tick', step:5, gain:0.8, rate:1.2, pan:-0.3 } のような
    // 動的パラメータが書ける(audio.playPreset のスキーマに準拠)。
    'sfx.synth': (params) => { audio?.playPreset(params.preset, params); },
    /**
     * 3択クイズの **正誤** に応じた効果音(2026-08-15 ユーザー指示 U66-7)。
     *
     * ■ なぜ専用アクションが要るのか
     *   正誤は「押したリールと正解の位置の一致」という **事実** で決まり、
     *   その正解の位置は盤面(lcdanims-extra.js の reel_pick_choice)が
     *   演出RNGで毎回シャッフルしている。シナリオ側は正誤を知らないので、
     *   sfx.synth で preset を直書きすると **正解でもブッブーが鳴る**
     *   (実際そうなっていた。qz_reelpick_miss / miss_idle の error_buzz)。
     *   盤面と同じ判定関数(reelPickVerdictOf)をここで引いて鳴らし分ける。
     *
     * ■ 音の3系統(混ぜないこと)
     *   正誤の音  … このアクション。正解=チャイム / 不正解=クイズのブザー
     *   当落の音  … CZ突入のファンファーレや、ハズレの静かな下降音(sfx.synth)
     *   操作の音  … リール停止音など(main.js の直接配線)
     *
     *   params: { pick, correct='checklist_ok', wrong='buzzer_wrong', gain, ... }
     *   pick は '$stop1.index'(実際に最初に止めたリール)を渡す。
     *   まだ答えていない/届いていないときは何も鳴らさない。
     */
    'sfx.quizVerdict': (params = {}) => {
      const verdict = reelPickVerdictOf({ phase: 'answer', pick: params.pick });
      if (!verdict) return;
      const preset = verdict.correct
        ? (params.correct ?? 'checklist_ok')
        : (params.wrong ?? 'buzzer_wrong');
      audio?.playPreset(preset, params);
    },

    // ── 学習(2026-08-15 学習強化 L1/L4) ────────
    /**
     * クイズの結果を学習記録へ残す。**画面には何も出さない**。
     *
     * ■ なぜ音(sfx.quizVerdict)と同じ引き方をするのか
     *   正誤は「押したリールと正解の位置の一致」という事実で、その正解の位置は
     *   盤面(lcdanims-extra.js)が演出RNGでシャッフルしている。
     *   シナリオ側は正誤を知らないので、**盤面と同じ判定関数**を引く必要がある。
     *   まだ答えていない / pick が届いていないときは null なので何も記録しない。
     *
     * ■ 不正解でもサービスを図鑑へ入れる理由
     *   盤面が「正解は◯「◯◯」」と**正解を画面に見せている**ので、
     *   「そのサービスに出会った」は事実。ここで外すほうが記録として嘘になる。
     *
     * ■ 【最重要】記録してよいのは「盤面が実際に出した出題」だけ(2026-08-15 椿レビュー major)
     *   reelPickVerdictOf は内部で reelPickStateOf を通り、**進行中の出題が無ければ
     *   その場で新しい出題を組み立てて返す**(高速停止で 'ask' の描画が1フレームも
     *   走らなかったときの保険。staging/anims/lcdanims-extra.js 参照)。
     *   つまり、盤面が一度も出ていない状態でこのアクションだけが走ると
     *     ・**誰も見ていない問題**が生まれ、
     *     ・正解の位置は引いたばかりの乱数なので、押したリールとの一致は**ただの偶然**
     *   になり、その偶然が「正誤の事実」として永久保存される。
     *   記録の入口としてこれは致命的なので、**出題を生成しない読み出し口**
     *   inspectReelPickState() で先に覗き、null(= 盤面が出題していない)なら
     *   ここで打ち切って reelPickVerdictOf を1度も呼ばない。
     *   ※ 音(sfx.quizVerdict)は鳴って消えるだけなので、この砦は記録側にだけ置く。
     *
     * ■ 二重計上について
     *   このアクションは waitFor:'stop1' のキュー1本からしか呼ばれず、
     *   waitFor のキューは1再生につき1回だけ発火する(engine/timeline.js)。
     *   ただしそれは**演出データが今そうなっている**というだけの保証で、
     *   キューを2本貼る・別シナリオが重なるといった書き換えで簡単に崩れる
     *   (崩れても画は何も変わらないので、誰も気づけないまま成績だけが倍になる)。
     *   出題そのものに記録済みの印を付けて、**同じ出題は何回呼ばれても1回しか数えない**。
     *   印は出題オブジェクトに付くので、次の出題('ask' で作り直される)には持ち越さない。
     *
     *   params: { pick } … '$stop1.index'(実際に最初に止めたリール)
     */
    'learn.quizResult': (params = {}) => {
      // ① 盤面が出題中か。ここが null のときに reelPickVerdictOf を呼ぶと出題が生まれてしまう
      if (!inspectReelPickState()) return;
      const verdict = reelPickVerdictOf({ phase: 'answer', pick: params.pick });
      if (!verdict) return;
      // ② 同じ出題を二度数えない
      if (verdict.round.__recorded === true) return;
      verdict.round.__recorded = true;

      recordQuizAnswer(verdict.round.id, verdict.correct);
      // 正解の選択肢(短縮名)→ 豆知識の正式名。対応表に無ければ図鑑には入れない
      const service = resolveServiceByQuizAnswer(verdict.round.choices[verdict.round.answerIndex]);
      if (service) recordServiceSeen(service, 'quiz');
    },
    // 未生成の音声キーは voice 側が静かに無視するので、ここでの分岐は不要。
    'voice.play': (params) => { voice?.play(params.key); },
    // 同じ曲を指定した場合 changeBgm は no-op になるため、
    // モード遷移による自動切替(main.js)と重なっても鳴り直さない。
    'bgm.change': (params) => { audio?.changeBgm(params.bgm, { fadeMs: params.fadeMs ?? 800 }); },
  };
}
