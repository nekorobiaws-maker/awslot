/**
 * 全画面演出Canvas。DESIGN.md 5.3 (z=8) / 5.5
 *
 * 液晶(z=2)とリール(z=4)は物理的に別領域にあるため、
 * 筐体全体を覆う演出はこのレイヤーだけが担当する。
 *
 * 自前で持つのはフラッシュ・画面揺れ・役ラベルの3つ。
 * カットインとパーティクルは staging 側の実装を描画するだけに留める。
 */

import { getLayerRect } from '../engine/layers.js';

const FONT = '"Helvetica Neue", "Hiragino Sans", "Noto Sans JP", sans-serif';

/**
 * 暗転を維持できる上限[ms](2026-08-14 検証指摘の保険)。
 *
 * 暗転は「時間で必ず明ける」ことだけが画面復帰の保証になっている。
 * シナリオが極端な holdMs を渡した場合や、解除キュー(release)に届かない経路で
 * 終わった場合でも、**画面が真っ暗のまま残らない** ようにここで頭打ちにする。
 *
 * いま最長の使い手は data/scenarios/freeze.js(U49 で溜めを伸ばして 10.5秒)。
 * **フリーズの暗転より短くしてはいけない**(短いと溜めの途中で勝手に明転して
 * 「ドーン」の前に画面が戻ってしまう)。data/freeze.js の durationMs を伸ばしたら
 * ここも必ず見直すこと。
 */
export const BLACKOUT_MAX_HOLD_MS = 12000;

/**
 * 生きている OverlayView の一覧(暗転の一括解除用)。
 *
 * 暗転は update(dt) の自然経過でしか消えないため、
 * 「セッションを引き直した」「演出システムを外した」のような **画面ごとの仕切り直し** で
 * 明示的に落とす口が要る。main.js を触らずに配線できるよう、
 * lcdanims.js の TEXT_HOSTS と同じ作法でモジュール側に持つ。
 * @type {Set<OverlayView>}
 */
const OVERLAY_HOSTS = new Set();

/** 生きているオーバーレイの暗転をすべて落とす(staging/director.js が呼ぶ) */
export function clearAllBlackouts() {
  for (const v of OVERLAY_HOSTS) v.clearBlackout();
}

/* ══ ページ全体の暗転(2026-08-14 検証指摘 V21-06)═══════════════════
 *
 * 【問題】フリーズの暗転が筐体の中だけだった
 *   このCanvasは #cabinet の中(720×1080)にしか無いので、
 *   暗転しても **ホールのボケ背景・HOW TO PLAY プレート・スマホ用の見出し** は
 *   明るいままで、「画面が落ちた」緊張感が出ていなかった。
 *
 * 【方針】筐体の外側だけを黒く塗る
 *   単純に全画面へ黒い div をかぶせると、**暗転の上に出すカットインや
 *   「神の声」まで暗くなる**(この Canvas は div より下の階層にあるため)。
 *   そこで「筐体の矩形と同じ大きさ・背景なしの div に、外向きの巨大な box-shadow」
 *   を敷いて、筐体の外周だけを黒く塗る。筐体の中は今までどおり Canvas の暗転が
 *   担当するので、濃さが同じなら継ぎ目は見えない。
 *
 * DOM は index.html を触らずにここで作る(生成タイミングは初回の暗転時)。
 * スタイルの本体は style.css の #page-blackout。
 */
const PAGE_BLACKOUT_ID = 'page-blackout';

/** ページ暗転レイヤーを取り出す(無ければ作る)。ブラウザ以外では null */
function pageBlackoutEl() {
  if (typeof document === 'undefined' || !document.body) return null;
  let el = document.getElementById(PAGE_BLACKOUT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = PAGE_BLACKOUT_ID;
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  return el;
}

export class OverlayView {
  /**
   * @param {object} opts
   * @param {CanvasRenderingContext2D} opts.ctx
   * @param {import('../staging/anims/cutins.js').Cutins} [opts.cutins]
   * @param {import('../staging/anims/particles.js').Particles} [opts.particles]
   * @param {HTMLElement} [opts.shakeTarget] 画面揺れを適用するDOM(筐体ルート)
   */
  constructor({ ctx, w = 720, h = 1080, cutins = null, particles = null, shakeTarget = null }) {
    this.ctx = ctx;
    this.w = w;
    this.h = h;
    this.cutins = cutins;
    this.particles = particles;
    this.shakeTarget = shakeTarget;

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

    /** ページ暗転レイヤー(初回の暗転で作る。V21-06) @type {HTMLElement|null} */
    this._pageBlackoutEl = null;
    /** ページ暗転が出ているか(消すときだけ触るためのフラグ) */
    this._pageBlackoutOn = false;

    // 暗転の一括解除(clearAllBlackouts)から見えるように自分を登録する。
    // 生成側(main.js)に配線を足さなくてよいよう、ここで自己登録する。
    OVERLAY_HOSTS.add(this);
  }

  /** 一括解除の対象から外す(テストで大量生成する場合の後始末用) */
  dispose() {
    OVERLAY_HOSTS.delete(this);
    // ページ暗転は body 直下に居るので、自分が消えるときに必ず戻す
    this._syncPageBlackout(0);
  }

  flash(color = '#ffffff', ms = 220) {
    this.flashColor = color;
    this.flashDur = Math.max(1, ms);
    this.flashLeft = this.flashDur;
  }

  /**
   * 画面全体を暗転させる(U21: 秘宝伝「神の声」風のレバーONフリーズ用)。
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
    // 次の draw() を待たずにページ側も戻す(仕切り直しの経路から呼ばれるため)
    this._syncPageBlackout(0);
  }

  /**
   * 暗転の上に出す1行(U21 の「神の声」)。
   *
   * 液晶(z=2)は暗転(z=8)の下なので、暗転中の文言を lcd.text で出すと
   * **黒に沈んで一文字も読めない**。暗転と同じレイヤーで描く必要があるため、
   * オーバーレイ自身がテキストを持つ。
   *
   * 文字は液晶の表示矩形に収める(cutins.js 冒頭の「文字は液晶の中だけに描く」)。
   * @param {{text:string, sub?:string, color?:string, size?:number, ms?:number}} p
   */
  showLine({ text, sub = '', color = '#ffffff', size = 30, ms = 1200 } = {}) {
    if (!text) return;
    const dur = Math.max(1, ms);
    this.lineEntry = { text: String(text), sub: String(sub ?? ''), color, size, ms: dur, left: dur };
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
    const mainY = e.sub ? cy - 12 : cy;
    ctx.lineWidth = Math.max(4, size * 0.2);
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText(e.text, cx, mainY, maxW);
    ctx.fillStyle = e.color;
    ctx.fillText(e.text, cx, mainY, maxW);

    if (e.sub) {
      ctx.font = `700 14px ${FONT}`;
      ctx.lineWidth = 3;
      ctx.strokeText(e.sub, cx, cy + 22, maxW);
      ctx.fillStyle = 'rgba(235,240,255,0.85)';
      ctx.fillText(e.sub, cx, cy + 22, maxW);
    }
    ctx.restore();
  }

  _applyShake() {
    if (!this.shakeTarget) return;
    const p = this.shakeLeft / this.shakeDur;
    const amp = this.shakePower * p;
    const dx = (Math.random() * 2 - 1) * amp;
    const dy = (Math.random() * 2 - 1) * amp;
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

  /**
   * 筐体の外側(ページ)を筐体内と同じ濃さで暗くする(V21-06)。
   * 筐体の位置はウィンドウサイズで動くので、暗転中は毎フレーム測り直す
   * (測るのは暗転が出ている数秒だけ。常時のレイアウト読み取りにはならない)。
   * @param {number} alpha 0〜1
   */
  _syncPageBlackout(alpha) {
    // 一度も暗転していないのに DOM を作らない(起動直後の要素を増やさない)
    if (alpha <= 0 && !this._pageBlackoutEl) return;
    const el = this._pageBlackoutEl ?? (this._pageBlackoutEl = pageBlackoutEl());
    if (!el) return;
    if (alpha <= 0) {
      if (this._pageBlackoutOn) {
        el.style.opacity = '0';
        el.style.display = 'none';
        this._pageBlackoutOn = false;
      }
      return;
    }
    const rect = this.shakeTarget?.getBoundingClientRect?.();
    if (rect) {
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
    }
    el.style.display = 'block';
    el.style.opacity = String(alpha);
    this._pageBlackoutOn = true;
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    /**
     * 暗転はいちばん奥。カットイン・パーティクル・フラッシュは暗転の上に出す
     * (U21 のフリーズは「暗転で溜める → 暗転のままカットインで爆発」の順で組むため)。
     */
    const bo = this.blackoutAlpha();
    // 筐体の外(ページ背景・操作ガイド・スマホ用の見出し)も同じ濃さで落とす
    this._syncPageBlackout(bo);
    if (bo > 0) {
      ctx.save();
      ctx.globalAlpha = bo;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, this.w, this.h);
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
