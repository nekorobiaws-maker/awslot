/**
 * 全画面演出Canvas。DESIGN.md 5.3 (z=8) / 5.5
 *
 * 液晶(z=2)とリール(z=4)は物理的に別領域にあるため、
 * 筐体全体を覆う演出はこのレイヤーだけが担当する。
 *
 * 自前で持つのはフラッシュ・画面揺れ・役ラベル・暗転・暗転の上の1行。
 * カットインとパーティクルは staging 側の実装を描画するだけに留める。
 *
 * **暗転(blackout)だけは筐体全体ではなく液晶(LCD)の矩形にしか塗らない**
 * (2026-08-15 U60)。理由は blackout() のコメントを参照。
 *
 * ══ 液晶からはみ出してよいのは「告知級」だけ(2026-08-15 ユーザー指示 U66-4)══
 *
 * このレイヤーは筐体全体(720×1080)を覆えるが、実際に液晶の外へ絵を出してよいのは
 * **ボーナス・RUSH の当選告知**だけ。予告・煽り(「WAF プロテクト」等)は
 * 液晶の窓の中で完結させる。判定と実装は staging/anims/cutins.js が持つ:
 *   FULLSCREEN_CUTINS … 外へ出てよいカットインの一覧(ここに無ければ液晶でクリップ)
 * このファイル自身が描くもののうち
 *   flash   … 画面全体の光。**色の板であって絵ではない**ので全面のままでよい
 *   shake   … 筐体を揺らす CSS 変数。描画ではない
 *   1行     … 液晶の矩形内(_drawLine)
 *   役ラベル … ?debug=1 専用のHUD。液晶とリールの間の帯に出す(下のコメント参照)
 * となっており、いずれもこの原則に反しない。
 */

import { getLayerRect, getShakeSlack } from '../engine/layers.js';

/**
 * フィットの余白が無い向きでも許す揺れ幅[CSS px](2026-08-16 V80-4)。
 * ここまでなら筐体が画面端で切れても目に留まらない。
 */
const SHAKE_MIN_PX = 8;

const FONT = '"Helvetica Neue", "Hiragino Sans", "Noto Sans JP", sans-serif';

/** 角丸の矩形パス(サブ行の座布団に使う。塗り/線は呼び出し側で) */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * 暗転を維持できる上限[ms](2026-08-14 検証指摘の保険)。
 *
 * 暗転は「時間で必ず明ける」ことだけが画面復帰の保証になっている。
 * シナリオが極端な holdMs を渡した場合や、解除キュー(release)に届かない経路で
 * 終わった場合でも、**画面が真っ暗のまま残らない** ようにここで頭打ちにする。
 *
 * いま最長の使い手は data/scenarios/freeze.js
 * (U74 で問答の表示時間を確保したため holdMs = **17.36秒**)。
 * **フリーズの暗転より短くしてはいけない**(短いと溜めの途中で勝手に明転して
 * 「ドーン」の前に画面が戻ってしまう)。data/freeze.js の durationMs を伸ばしたら
 * ここも必ず見直すこと。
 *
 * 12000 → **19000**(2026-08-15 U74)。フリーズの暗転(17.36秒)に
 * 1.6秒ほどの余裕を持たせた値。ここが暗転より短いと、頭打ちのぶんだけ
 * **問答の途中で液晶が明るくなる**(U74 以前の 12000 のままだと
 * fadeIn 260 + 12000 = 12.26秒 = 2つ目の「否!!!」の最中に明転してしまい、
 * 3つ目の問いと「ドーン」を明るい液晶の上でやることになる)。
 */
export const BLACKOUT_MAX_HOLD_MS = 19000;

/**
 * 生きている OverlayView の一覧(暗転・1行表示の一括解除用)。
 *
 * 暗転もオーバーレイの1行も update(dt) の自然経過でしか消えないため、
 * 「セッションを引き直した」「次のゲームが始まった」のような **仕切り直し** で
 * 明示的に落とす口が要る。main.js を触らずに配線できるよう、
 * lcdanims.js の TEXT_HOSTS と同じ作法でモジュール側に持つ。
 * @type {Set<OverlayView>}
 */
const OVERLAY_HOSTS = new Set();

/** 生きているオーバーレイの暗転をすべて落とす(staging/director.js が呼ぶ) */
export function clearAllBlackouts() {
  for (const v of OVERLAY_HOSTS) v.clearBlackout();
}

/**
 * 生きているオーバーレイの1行表示をすべて落とす(2026-08-15 U57 / U60)。
 *
 * オーバーレイの1行(showLine)は液晶のテキスト帯とは別実装なので、
 * lcdanims.js の sticky 解除(次のレバーONで消える)が効かない。
 * フリーズの結末「ボーナス確定!!」を余韻たっぷりに残せるようにした結果、
 * **次のゲームの画面へ食い込みうる**ようになったため、
 * テキスト帯と同じライフサイクル(次のレバーONで消える)をここで揃える。
 * 呼び出し元は staging/director.js の
 *   leverOn / modeEnter … 通常の寿命(次のゲーム / 画面の切り替わり)
 *   sessionStart / detach … 仕切り直し
 */
export function clearAllOverlayLines() {
  for (const v of OVERLAY_HOSTS) v.clearLine();
}

/* ══ ページ全体の暗転は撤去した(2026-08-15 ユーザー指示 U60)═══════════
 *
 * V21-06 で「フリーズの暗転が筐体の中だけで緊張感が出ない」という指摘に対し、
 * 筐体の外周を黒く塗る div(#page-blackout)を足していた。
 * U60 でユーザー指示により **暗転は液晶(LCD)の中だけ** に戻したため、
 *   ・筐体・リール・HOW TO PLAY プレート・ホール背景はすべて明るいまま
 *   ・暗くなるのは「台の画面が落ちた」= 液晶の窓だけ
 * になり、ページ側を触る必要が無くなった。
 * DOM 生成・毎フレームの getBoundingClientRect・style.css の #page-blackout は
 * まとめて削除してある(戻すときは V21-06 の履歴を参照)。
 */

export class OverlayView {
  /**
   * @param {object} opts
   * @param {CanvasRenderingContext2D} opts.ctx
   * @param {import('../staging/anims/cutins.js').Cutins} [opts.cutins]
   * @param {import('../staging/anims/particles.js').Particles} [opts.particles]
   * @param {HTMLElement} [opts.shakeTarget] 画面揺れを適用するDOM(筐体ルート)
   * @param {import('../staging/anims/lcdanims.js').LcdAnims} [opts.anims]
   *   二重表示(U8)の申告先。render/lcd.js と同じ**注入**で受け取る
   *   (render → staging を import しないための約束)。
   */
  constructor({
    ctx, w = 720, h = 1080, cutins = null, particles = null, shakeTarget = null, anims = null,
  }) {
    this.ctx = ctx;
    this.w = w;
    this.h = h;
    this.cutins = cutins;
    this.particles = particles;
    this.shakeTarget = shakeTarget;
    /**
     * 液晶テキスト帯(LcdAnims)。U8「同じことを2か所に書かない」の申告に使う。
     * 未注入でも描画は成立する(申告しないだけ)。
     */
    this.anims = anims;

    this.flashColor = null;
    this.flashLeft = 0;
    this.flashDur = 1;

    this.flagLabel = null;
    this.flagRare = false;
    this.flagLeft = 0;

    this.shakeLeft = 0;
    this.shakeDur = 1;
    this.shakePower = 0;
    this._shakeApplied = false;

    /**
     * 暗転(U21 / 2026-08-14)。
     * flash とは別物なので状態も別に持つ。詳しくは blackout() のコメント。
     * @type {{alpha:number, fadeIn:number, hold:number, fadeOut:number, t:number}|null}
     */
    this.blackoutState = null;

    /**
     * 暗転中に読ませる1行(U21 の「問答」)。
     * @type {{text:string, sub:string, color:string, size:number, ms:number, left:number}|null}
     */
    this.lineEntry = null;

    // 暗転・1行表示の一括解除(clearAllBlackouts / clearAllOverlayLines)から
    // 見えるように自分を登録する。生成側(main.js)に配線を足さなくてよいよう自己登録。
    OVERLAY_HOSTS.add(this);
  }

  /** 一括解除の対象から外す(テストで大量生成する場合の後始末用) */
  dispose() {
    OVERLAY_HOSTS.delete(this);
  }

  flash(color = '#ffffff', ms = 220) {
    this.flashColor = color;
    this.flashDur = Math.max(1, ms);
    this.flashLeft = this.flashDur;
  }

  /**
   * **液晶(LCD)の中だけ**を暗転させる(U21 のレバーONフリーズ用 / U60 で範囲を確定)。
   *
   * ■ どこが暗くなるか(2026-08-15 ユーザー指示 U60)
   *   このCanvas は筐体全体(720×1080)を覆っているが、塗るのは
   *   engine/layers.js の `lcd` 矩形だけ。**リール・筐体・その外側は明るいまま**。
   *   「ホールの台の中で、画面だけが落ちた」という画にするための指定で、
   *   V21-06 で足したページ全体の暗転(#page-blackout)は U60 で撤去した。
   *   暗転の上に出す「神の声」(showLine)も液晶の中に描くので、
   *   黒地と文字の関係は今までどおり成立する。
   *
   * ■ flash と何が違うか
   *   flash は `0.55 × (残り/尺)` の線形減衰で、**上限0.55・維持できない**。
   *   「真っ黒にして、そのまま数秒維持する」ができないのでフリーズの溜めが作れない。
   *   blackout は alpha を 1.0 まで指定でき、hold の間は一切減衰しない。
   *
   * ■ 経過は fadeIn → hold → fadeOut の3段
   *   同じ blackout を重ねて呼ぶと最後の指定で作り直す(溜めの延長に使える)。
   *   release(fadeOutMs) を呼べば hold の途中でも明転へ移れる。
   *
   * @param {number} alpha 最大の暗さ 0〜1(1.0 で完全な黒)
   * @param {number} holdMs 真っ暗のまま維持する時間
   * @param {number} fadeInMs 暗くなるまでの時間
   * @param {number} fadeOutMs 明るく戻るまでの時間
   */
  blackout(alpha = 0.97, holdMs = 800, fadeInMs = 260, fadeOutMs = 200) {
    this.blackoutState = {
      alpha: Math.max(0, Math.min(1, alpha)),
      fadeIn: Math.max(0, fadeInMs),
      // 上限で頭打ちにする。解除キューに届かない経路でも必ず明ける(保険)
      hold: Math.max(0, Math.min(BLACKOUT_MAX_HOLD_MS, holdMs)),
      fadeOut: Math.max(1, fadeOutMs),
      t: 0,
    };
  }

  /**
   * 暗転を今すぐ明転へ向かわせる(hold の残りを捨てる)。
   *
   * 2026-08-14 検証指摘: 旧実装は `t` を outStart へ動かすだけだったので、
   * **fadeIn の途中で呼ぶと alpha が一旦フル(0.97)へ跳ねてから薄くなる**
   * (「明るくなる前に一段暗くなる」逆再生)。
   * いまの実効の濃さを起点に置き直してから fadeOut させる。
   */
  releaseBlackout(fadeOutMs = 200) {
    const b = this.blackoutState;
    if (!b) return;
    const current = this.blackoutAlpha();
    b.alpha = current;
    b.fadeIn = 0;
    b.hold = 0;
    b.fadeOut = Math.max(1, fadeOutMs);
    b.t = 0;   // fadeIn(0) + hold(0) = fadeOut の開始位置
  }

  /**
   * 暗転を即座に無かったことにする(フェード無し)。
   *
   * 自然経過(fadeIn+hold+fadeOut)以外に画面を戻す手段が無いと、
   * 解除キューへ到達しない経路(timeline.stop / director.detach / cueFilter による欠落)で
   * **最大 hold ぶん画面が真っ暗のまま残る**。仕切り直しの経路から必ず呼ぶこと。
   */
  clearBlackout() {
    this.blackoutState = null;
  }

  /**
   * 暗転の上に出す1行(U21 の「神の声」)。
   *
   * 液晶(z=2)は暗転(z=8)の下なので、暗転中の文言を lcd.text で出すと
   * **黒に沈んで一文字も読めない**。暗転と同じレイヤーで描く必要があるため、
   * オーバーレイ自身がテキストを持つ。
   *
   * 文字は液晶の表示矩形に収める(cutins.js 冒頭の「文字は液晶の中だけに描く」)。
   *
   * ── U8(二重表示の禁止)の申告(2026-08-15 U60)──────────────────
   * この1行は lcd.text を通らないので、放っておくと
   * 「オーバーレイが大きく『ボーナス確定!!』と言い切っているのに、
   *   盤面と液晶のポップアップも同じことを書く」= 三重表示になる。
   * 液晶アニメが描く大文字(ANIM_HEADLINES → noteSpokenHeadline)と
   * まったく同じ扱いで **言い切った文言を申告** し、
   * 盤面側(render/lcd.js の _drawRuleLine → anims.covers)に黙ってもらう。
   * 申告は次のレバーONで自動的に忘れられる(lcdanims.js の clearSpokenHeadlines)。
   * 表示中はさらに毎フレーム registerAmbient する(_drawLine)ので、
   * 同じことを言う lcd.text のポップアップも積まれなくなる。
   *
   * @param {{text:string, sub?:string, color?:string, size?:number, ms?:number}} p
   */
  showLine({ text, sub = '', color = '#ffffff', size = 30, ms = 1200 } = {}) {
    if (!text) return;
    const dur = Math.max(1, ms);
    this.lineEntry = { text: String(text), sub: String(sub ?? ''), color, size, ms: dur, left: dur };
    this.anims?.noteHeadline?.(this.lineEntry.text);
  }

  /**
   * オーバーレイの1行を今すぐ消す(次のレバーONでの仕切り直し用 / U57)。
   * 液晶テキスト帯の sticky 解除と同じ意味を持たせるための口。
   */
  clearLine() {
    this.lineEntry = null;
  }

  /** 筐体を揺らす(CSS transform に上乗せせず、専用の変数で制御) */
  shake(power = 12, ms = 400) {
    this.shakePower = power;
    this.shakeDur = Math.max(1, ms);
    this.shakeLeft = this.shakeDur;
  }

  /** 成立役ラベルを一定時間表示する */
  showFlag(label, rare = false, ms = 1500) {
    this.flagLabel = label;
    this.flagRare = rare;
    this.flagLeft = ms;
  }

  update(dt) {
    if (this.flashLeft > 0) this.flashLeft = Math.max(0, this.flashLeft - dt);
    if (this.flagLeft > 0) this.flagLeft = Math.max(0, this.flagLeft - dt);

    if (this.blackoutState) {
      const b = this.blackoutState;
      b.t += dt;
      if (b.t >= b.fadeIn + b.hold + b.fadeOut) this.blackoutState = null;
    }
    if (this.lineEntry) {
      this.lineEntry.left -= dt;
      if (this.lineEntry.left <= 0) this.lineEntry = null;
    }

    if (this.shakeLeft > 0) {
      this.shakeLeft = Math.max(0, this.shakeLeft - dt);
      this._applyShake();
    } else if (this._shakeApplied) {
      this._clearShake();
    }
  }

  /**
   * 暗転の上に出す1行を描く(U21)。
   * 液晶の表示矩形の中央に置き、幅からはみ出す場合はフォントを縮める。
   */
  _drawLine(ctx) {
    const e = this.lineEntry;
    if (!e) return;
    const lcd = getLayerRect('lcd');
    // 出だしと終わりだけ短くフェード。中央の "間" は減衰させない
    const elapsed = e.ms - e.left;
    const alpha = Math.min(1, elapsed / 220) * Math.min(1, e.left / 220);
    if (alpha <= 0) return;
    /*
     * U8: 実際に描いたフレームだけ「いまこれを出している」と申告する
     * (render/lcd.js の _ambient と同じ約束。見えていない回に申告しない)。
     * これで同じことを言う lcd.text のポップアップは積まれなくなる。
     */
    this.anims?.registerAmbient?.(e.text);

    const cx = lcd.x + lcd.w / 2;
    const cy = lcd.y + lcd.h / 2;
    const maxW = lcd.w - 36;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    let size = e.size;
    ctx.font = `900 ${size}px ${FONT}`;
    while (size > 14 && ctx.measureText(e.text).width > maxW) {
      size -= 2;
      ctx.font = `900 ${size}px ${FONT}`;
    }

    /*
     * ── サブ行がキャラに被る問題(2026-08-15 検証指摘 F4)────────────────
     * フリーズの結末「ボーナス確定!! / ゴーストボーナスSP + RUSH 確定」は
     * 明転と同時にサメ(kiro premium + zoom)が液晶いっぱいに出るところへ描かれる。
     * サブ行は 14px で縁取りだけだったため、サメの体の上で完全に溶けていた。
     *
     * 直し方は2点(どちらも文言・尺には触らない):
     *   ① ブロックごと少し上へ寄せる(サメの顔は液晶の下半分に来る)
     *   ② サブ行の下に半透明の座布団を敷く(液晶テキスト帯 V31-08 と同じ手)
     * サブ行そのものも 14 → 16px にして、明るい絵の上でも輪郭が残るようにした。
     */
    const blockShift = e.sub ? -24 : 0;
    const mainY = cy + blockShift + (e.sub ? -12 : 0);
    ctx.lineWidth = Math.max(4, size * 0.2);
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText(e.text, cx, mainY, maxW);
    ctx.fillStyle = e.color;
    ctx.fillText(e.text, cx, mainY, maxW);

    if (e.sub) {
      const subY = cy + blockShift + 26;
      const subSize = 16;
      ctx.font = `700 ${subSize}px ${FONT}`;
      // 座布団(サメの絵の上でも読めるようにする)
      const subW = Math.min(maxW, (ctx.measureText?.(e.sub)?.width ?? e.sub.length * subSize) + 26);
      ctx.save();
      ctx.globalAlpha = alpha * 0.72;
      ctx.fillStyle = 'rgba(4,8,20,0.9)';
      roundRect(ctx, cx - subW / 2, subY - subSize, subW, subSize * 2, 8);
      ctx.fill();
      ctx.restore();

      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(e.sub, cx, subY, maxW);
      ctx.fillStyle = 'rgba(240,245,255,0.95)';
      ctx.fillText(e.sub, cx, subY, maxW);
    }
    ctx.restore();
  }

  /**
   * 画面揺れを CSS 変数へ書く。
   *
   * ── 2026-08-16 検証指摘 V80-4 ────────────────────────────────────
   * 「フリーズ終盤のシェイクで液晶の中身が枠からズレる」。
   * 筐体は1枚の DOM なので液晶だけがズレることはないが、**筐体そのものが
   * ビューポートからはみ出して** 冠(JAWSLOT)や台座が切り落とされ、
   * 液晶の位置だけが動いたように見えていた。
   * フリーズの大揺れは power 34 で、横長ウィンドウでは上下の余白が 0px
   * (筐体の高さがぴったり画面の高さ)なので、縦は 1px 動かしただけで切れる。
   *
   * 揺れは **フィットの余白(engine/layers.js の getShakeSlack)の内側** に収める。
   * 余白がある向きは今までどおりの迫力で揺れ、無い向きは自動的に止まるので、
   * どの画面サイズでも筐体が欠けない。
   */
  _applyShake() {
    if (!this.shakeTarget) return;
    const p = this.shakeLeft / this.shakeDur;
    const amp = this.shakePower * p;
    const slack = getShakeSlack();
    /*
     * 余白いっぱいまで振ると縁が画面端に触れて硬く見えるので9割まで。
     * 余白が 0 の向き(横長ウィンドウの縦方向は筐体の高さ = 画面の高さ)でも
     * 揺れが完全に死ぬと打感が抜けるので、SHAKE_MIN_PX までは許す
     * (この幅なら冠や台座の欠けは目に留まらない)。
     */
    const ax = Math.min(amp, Math.max(SHAKE_MIN_PX, slack.x * 0.9));
    const ay = Math.min(amp, Math.max(SHAKE_MIN_PX, slack.y * 0.9));
    const dx = (Math.random() * 2 - 1) * ax;
    const dy = (Math.random() * 2 - 1) * ay;
    this.shakeTarget.style.setProperty('--shake-x', `${dx.toFixed(2)}px`);
    this.shakeTarget.style.setProperty('--shake-y', `${dy.toFixed(2)}px`);
    this._shakeApplied = true;
  }

  _clearShake() {
    this.shakeTarget?.style.setProperty('--shake-x', '0px');
    this.shakeTarget?.style.setProperty('--shake-y', '0px');
    this._shakeApplied = false;
  }

  /** いまの暗転の濃さ(0〜1)。出ていなければ 0 */
  blackoutAlpha() {
    const b = this.blackoutState;
    if (!b) return 0;
    if (b.t < b.fadeIn) return b.alpha * (b.fadeIn > 0 ? b.t / b.fadeIn : 1);
    const outStart = b.fadeIn + b.hold;
    if (b.t < outStart) return b.alpha;              // ← hold 中は減衰しない
    return b.alpha * Math.max(0, 1 - (b.t - outStart) / b.fadeOut);
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    /**
     * 暗転はいちばん奥。カットイン・パーティクル・フラッシュは暗転の上に出す
     * (U21 のフリーズは「暗転で溜める → 暗転のままカットインで爆発」の順で組むため)。
     *
     * ── 塗るのは液晶の窓だけ(2026-08-15 ユーザー指示 U60)──────────────
     * 以前はこの Canvas 全面(720×1080)+ ページ外周(#page-blackout)を塗っていた。
     * U60 で「暗転は液晶の中だけ」に戻したので、engine/layers.js の lcd 矩形で
     * 範囲を取る(筐体アートに合わせて窓の位置が動くため毎回引き直す)。
     * リール・筐体・打ち方プレートは暗転しない。
     */
    const bo = this.blackoutAlpha();
    if (bo > 0) {
      const lcd = getLayerRect('lcd');
      ctx.save();
      ctx.globalAlpha = bo;
      ctx.fillStyle = '#000000';
      ctx.fillRect(lcd.x, lcd.y, lcd.w, lcd.h);
      ctx.restore();
    }

    // カットイン → パーティクル → フラッシュ → 役ラベル の順に重ねる
    this.cutins?.draw(ctx, this.w, this.h);
    this.particles?.draw(ctx);
    this._drawLine(ctx);

    if (this.flashLeft > 0 && this.flashColor) {
      ctx.save();
      ctx.globalAlpha = 0.55 * (this.flashLeft / this.flashDur);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }

    if (this.flagLeft > 0 && this.flagLabel) {
      /**
       * 成立役ラベル(?debug=1 のときだけ出るデバッグHUD)の位置。
       *
       * ── 2026-08-14 検証 V31-02 / 液晶の外へ退避 ────────────────
       * 液晶の右下(y246)に置いていたため、RUSH盤面の合計獲得枚数バッジ
       * (render/lcd-rush.js の drawGained も y244)と正面衝突し、
       * 「+50 枚」「+0 枚」が読めなくなっていた。
       * 液晶の中は上(タイトル帯)・中(盤面)・下(結論行/テロップ帯)とも
       * 盤面が使い切っているので、**液晶とリールの間の帯へ出す**。
       *
       * S11 の「文字は液晶の中だけに描く」は **演出** の約束で、
       * 演出が筐体へはみ出すと画面の境界が壊れることへの対策だった。
       * これはゲーム画面ではないデバッグ表示なので、
       * むしろ盤面に一切重ならない外側が正しい席になる。
       * 液晶・リールの位置は筐体アートで動く(setLayerViews)ので毎回引き直す。
       */
      const lcd = getLayerRect('lcd');
      const reels = getLayerRect('reels');
      const gapTop = lcd.y + lcd.h;
      const gapH = reels.y - gapTop;
      // 帯が取れない筐体(将来アートが変わった場合)はタイトル帯の下へ逃がす
      const y = gapH >= 34 ? gapTop + Math.min(20, gapH / 2) : lcd.y + 50;
      const alpha = Math.min(1, this.flagLeft / 400);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = `700 15px ${FONT}`;
      const text = this.flagLabel;
      const right = lcd.x + lcd.w - 8;
      const tw = Math.min(ctx.measureText(text).width, lcd.w - 24);
      const plateX = Math.max(lcd.x + 4, right - tw - 16);
      ctx.fillStyle = this.flagRare ? 'rgba(190,20,60,0.9)' : 'rgba(20,16,40,0.85)';
      ctx.fillRect(plateX, y - 13, right - plateX, 26);
      ctx.fillStyle = this.flagRare ? '#ffe066' : '#cfd6ff';
      ctx.fillText(text, right - 8, y, tw);
      ctx.restore();
    }
  }
}
