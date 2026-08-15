/**
 * 液晶Canvas描画。DESIGN.md 5.3 / 5.4
 *
 * サブレイヤーの並び(stage → bgObject → char → fgEffect → ui)を関数分割で表現する。
 *
 * ══ 表示チャネルは2系統だけ(2026-08-15 ユーザー指示 U66-5)═══════════════
 *
 *   盤面(このファイル)  … **持続する情報**。いま何のモードで、何を目指していて、
 *                          どこまで進んだか。毎フレーム描き直す常設表示。
 *   ポップアップ(lcd.text)… **瞬間の告知**。いま何が起きたか。尺が来れば消える。
 *
 * 液晶の下部にあった「説明テロップ帯」(flow.telop を毎フレーム流し込む黒帯)は
 * **廃止した**。ポップアップと同じことを別の場所へ書き続けるチャネルで、
 * ユーザー指摘のとおり二重表示の温床だったため:
 *   ・そのゲームの出来事(「CACHE HIT — +18 枚」等)→ ポップアップと盤面が持つ
 *   ・モードのルール・目標(「ALARM を発報させろ!」等)→ 盤面の常設行が持つ
 * 移行先の対応は docs/DESIGN.md ではなく各盤面のコメントに書いてある。
 * **帯を復活させないこと**(復活させると U8 の二重表示が丸ごと戻る)。
 *
 * ── 液晶の座席割り(440 × 300)──────────────────────────────
 *   y   0〜 34 … タイトルバー(ステージ名 / 残りG / ラスト5)
 *   y  34〜150 … 盤面(主役の絵と数字)
 *   y 152〜236 … lcd.text の告知プレート専用。盤面は文字を置かない
 *   y 232〜262 … 結論・合計の1行(RUSH の footerPlate 等)
 *   y 266〜300 … **旧テロップ帯の跡地**。U66-5 で空いたので、
 *                盤面のルール行(_drawRuleLine)と CZ の目標行を置く
 */

import { CZ_GRAPH_MAX, CZ_GRAPH_THRESHOLD } from '../game/modes/cz.js';
// 画面に出す仕様値(純増・保証G・クレジット消費)は必ずデータ定義から取る。
// ここに数値を直書きすると data/modes.js を触った瞬間に表示だけ嘘になる
// (2026-08-14 しおん指摘 S3 / S15 と同型の事故)。
import { ZONE_SPEC_BY_ID } from '../data/modes.js';
import { uiAssets, symbolAssets } from '../engine/assets.js';
import { downscaleInSteps } from './symbols-draw.js';
// 新CZ4種(ALB / SQS DLQ / Blue-Green / GameDay)の盤面は別ファイルへ切り出す
import { drawCzAlb, drawCzDlq, drawCzBlueGreen, drawCzFis } from './lcd-cz-extra.js';
// RUSH 4種(U11)の盤面も別ファイル。伸びる軸ごとに主役の絵が違う
import { drawAsRush, drawCfRush, drawAuroraRush, drawHeroRush } from './lcd-rush.js';

const FONT = '"Helvetica Neue", "Hiragino Sans", "Noto Sans JP", sans-serif';
const FONT_HEAVY = '"Arial Black", "Helvetica Neue", "Hiragino Sans", sans-serif';

/** モードごとのステージ配色 */
const STAGE_COLORS = {
  FREE_TIER:        ['#11172e', '#1d2a4d', '#3a4d80'],
  CZ:               ['#2a1030', '#4a1830', '#8a2440'],
  BONUS_READY:      ['#3a2000', '#7a3a00', '#ffb000'],
  BONUS:            ['#3a1060', '#6a1a90', '#c02090'],
  AS_RUSH:          ['#06212a', '#0b3d4a', '#12a08a'],
  // U11 の RUSH 3種。ゾーンの性格が色で分かるようにする
  CF_RUSH:          ['#0b1030', '#182a70', '#4f7bf0'],
  AURORA_RUSH:      ['#140a30', '#2c1668', '#8a4ad0'],
  HERO_RUSH:        ['#2a1400', '#6a3500', '#ffb000'],
  HOT_STANDBY:      ['#241a06', '#4a3410', '#a07a18'],
  // Phase 5
  ROUTE53_FAILOVER: ['#2a0a0a', '#5a1414', '#b03030'],
  SPOT_ZONE:        ['#2b1200', '#6b2c00', '#e07018'],
  EC2_BURST:        ['#2a1a00', '#5c3a00', '#ffa400'],
  GRAVITON:         ['#0b1a22', '#123240', '#2f7f8f'],
  RESERVED:         ['#171029', '#2c1f52', '#6a52c8'],
  CLOUDFRONT:       ['#101a3a', '#1c3080', '#4f7bf0'],
  KINESIS:          ['#04202a', '#0a4050', '#18b0c8'],
  STEP_FUNCTIONS:   ['#141428', '#28285a', '#5a5ad0'],
  SERVERLESS_RUSH:  ['#2a1000', '#5a2600', '#ff8a00'],
  MULTI_REGION:     ['#0a0a2e', '#221060', '#8a30d0'],
  REINVENT_ED:      ['#1a0030', '#4a0060', '#ff2fa0'],
};

/** 通常時の内部状態(3.4)はステージ背景で示唆する */
const FREE_TIER_STAGES = {
  stage_cold: ['#11172e', '#1d2a4d', '#3a4d80'],
  stage_warm: ['#2a1a12', '#4a3018', '#a06a2a'],
  stage_prov: ['#2a1030', '#521a5a', '#b040c0'],
};

/* ── ステージ背景画像(assets/ui/stage_*.png) ──────────────
 * 画像が無いモードは STAGE_COLORS のグラデーションのまま。
 * 用意した6枚を「雰囲気が近いモード」へ割り当て、
 * 専用絵の無い派生ゾーンは RUSH の絵に既存の配色を薄く重ねて描き分ける。 */

/** 通常時の内部状態 → ステージ画像 */
const FREE_TIER_STAGE_ART = {
  stage_cold: 'stage_freetier',
  stage_warm: 'stage_warm',   // 高確: サミット会場
  stage_prov: 'stage_prov',   // 激アツ: re:Invent風の紫ネオン会場(専用絵)
};

/** モードID → ステージ画像。tint=true は既存の配色を上から重ねる */
const MODE_STAGE_ART = {
  FREE_TIER:        { id: 'stage_freetier' },
  CZ:               { id: 'stage_cz' },
  BONUS_READY:      { id: 'stage_cz' },
  BONUS:            { id: 'stage_rush' },
  AS_RUSH:          { id: 'stage_rush' },
  // RUSH 3種は専用絵が無いので RUSH の絵に固有色を重ねて描き分ける
  CF_RUSH:          { id: 'stage_rush', tint: true },
  AURORA_RUSH:      { id: 'stage_rush', tint: true },
  HERO_RUSH:        { id: 'stage_rush', tint: true },
  SERVERLESS_RUSH:  { id: 'stage_rush' },
  MULTI_REGION:     { id: 'stage_rush', tint: true },
  HOT_STANDBY:      { id: 'stage_standby' },
  ROUTE53_FAILOVER: { id: 'stage_standby', tint: true },
  REINVENT_ED:      { id: 'stage_ending' },
  // 派生ゾーンは RUSH の絵をベースに、モード固有の色を薄く重ねる
  SPOT_ZONE:        { id: 'stage_rush', tint: true },
  EC2_BURST:        { id: 'stage_rush', tint: true },
  GRAVITON:         { id: 'stage_rush', tint: true },
  RESERVED:         { id: 'stage_rush', tint: true },
  CLOUDFRONT:       { id: 'stage_rush', tint: true },
  KINESIS:          { id: 'stage_rush', tint: true },
  STEP_FUNCTIONS:   { id: 'stage_rush', tint: true },
};

/** 派生ゾーンで重ねる色調の濃さ */
const STAGE_TINT_ALPHA = 0.42;

/** 演出テキスト帯が出ている間、キャラをどれだけ沈めるか(V2) */
const CHAR_DIM_WHILE_TEXT = 0.45;

/**
 * 盤面の常設ルール行の基準Y(U66-5 で廃止した説明テロップ帯の跡地)。
 *
 * 旧テロップ帯は y266〜300 の黒帯だった。帯そのものは無くなったが、
 * 「そのモードのルール・目標」という **持続情報** の置き場としてこの高さは有効なので、
 * 行だけを残してある(下敷きは行の高さぶんだけ)。
 * 告知プレート(lcd.text)は y152〜236 なので重ならない。
 */
const RULE_LINE_Y = 280;

/**
 * 盤面が「残り n G」を自前で出しているモード(2026-08-14 検証指摘 V21-11)。
 *
 * 液晶ヘッダ右上の「残り 4 G」と盤面中央の「残り 4 / 8 G」が同時に出ていて、
 * **同じ情報が2か所**に並んでいた(U8 の二重表示。持続表示どうしなので、
 * どちらか一方に寄せるしかない)。主役は盤面なので **ヘッダ側を消す**。
 *
 * ここに足す条件は「盤面が『残り』の文字と一緒にゲーム数を描いていること」。
 * AS_RUSH のように単位が違う表現(『8 台』= 残りゲーム数)は、
 * 読み替えの手がかりとしてヘッダの「残り 8 G」が役に立つので **入れない**。
 */
const BOARD_SHOWS_REMAINING = new Set(['BONUS', 'RESERVED', 'REINVENT_ED']);

/**
 * ステージ背景の保留を「モード遷移の巻き戻し」として扱ってよい猶予[秒](U42)。
 *
 * 全面占有演出は modeEnter と同じフレームで始まるが、演出システムの
 * キュー処理が1フレーム遅れる経路もありうる。切り替わり直後に保留が始まったら
 * 「1つ前の背景」まで戻す、と決めておけば1フレームだけ新背景が覗く事故も防げる。
 */
const STAGE_HOLD_GRACE_S = 0.6;

/* ── ステージ名のスライドイン(2026-08-15 ユーザー指示 U50)────────────
 *
 * ステージが切り替わったことを、左上のラベルが **左からすべり込んで** 知らせる。
 * 全モード共通(通常時の内部状態の切替も含む)。
 *
 * 【いつ動くか】
 *   「画面に出しているステージ」が変わった瞬間。つまり U42 の背景保留中は
 *   ラベルも動かず、保留が明けて背景が切り替わるのと **同じフレーム** で走る。
 *   (背景は新ステージ・ラベルは前ステージ、のような食い違いを作らない)
 *
 * 【やらないこと】
 *   当落の示唆は一切足さない。動きの強さも中身も、どのステージでも同じ。
 */
const STAGE_LABEL_SLIDE_S = 0.52;
/** すべり込みの開始位置(定位置からどれだけ左か)[px] */
const STAGE_LABEL_SLIDE_PX = 46;
/** 切り替え直後だけ引く下線の長さの伸び代[px] */
const STAGE_LABEL_UNDERLINE_PAD = 10;

/* ── ラスト5回転のカウントダウン(2026-08-14 ユーザー指示 U26)────────
 *
 * 100回転スコアアタックの終盤で「あと何回転あるか」を煽る **持続表示**。
 * リールが回り出す(= flow.session.remaining が減る)たびに
 *   ラスト5 → 4 → 3 → 2 → 1 → 0
 * と切り替わる。
 *
 * ■ 置き場所
 *   タイトルバー(y0〜34)の右側。盤面(y34〜176)を一切侵さないので、
 *   CZ / RUSH のどの画面でも進行状況を隠さない。
 *   モードが残Gを出している場合は、その左隣へ並べる(重ならない)。
 *
 * ■ HUD(7セグの「GAME 残り」)との関係
 *   HUD は数字だけの常設計器で、こちらは終盤だけ出る煽り。
 *   どちらも **持続表示** どうしなので、テロップ/ポップアップ(U8 の
 *   二重表示禁止)の対象にはならない。
 *
 * ■ デバッグ強制表示
 *   `?countdown=1` を付けると、残り回転数に関係なく常に出す(見た目の確認用)。
 */
const COUNTDOWN_FROM = 5;

/** ?countdown=1 でカウントダウン表示を常に出す(ブラウザ以外では常に false) */
const FORCE_COUNTDOWN = (() => {
  try {
    if (typeof location === 'undefined' || !location?.search) return false;
    return new URLSearchParams(location.search).get('countdown') === '1';
  } catch {
    return false;
  }
})();

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

/* ══ 揃える絵柄の実画像(U54 / 2026-08-15 ユーザー指示)══════════════
 *
 * 「ゴースト7を揃えろ!」「サメBARを揃えろ!」の指示に、文字(7 / BAR)だけでなく
 * **リールに乗っている絵柄そのもの**(assets/symbols/GHOST7.png / SHARKBAR.png)を出す。
 * 経路は絵柄飛来予告(staging/anims/lcdanims-extra.js)と同じ共有ストア symbolAssets。
 *
 * 原画は 418×418 の正方形。毎フレーム 50px まで落とすとジャギる & 重いので、
 * 初回だけ段階縮小(symbols-draw.js の downscaleInSteps)して焼き、以降は貼るだけ。
 * 画像が未ロード・未配置のあいだは null が返り、**従来の文字プレートへ落ちる**
 * (キャッシュしないので、後から画像が届けば次のフレームで絵に切り替わる)。
 */

/** 焼き付ける長辺の長さ(液晶のプレートは 54px 角なので120あれば足りる) */
const SYMBOL_ART_MAX = 120;
/** @type {Map<string, HTMLCanvasElement>} 絵柄IDごとに1枚 */
const SYMBOL_ART_CACHE = new Map();

/**
 * 絵柄の実画像タイル(縦横比は原画のまま)。未ロードなら null。
 * @param {string} id 絵柄ID(GHOST7 / SHARKBAR など)
 * @returns {CanvasImageSource|null}
 */
function symbolArt(id) {
  if (!id) return null;
  const hit = SYMBOL_ART_CACHE.get(id);
  if (hit) return hit;
  const img = symbolAssets.get(id);
  if (!img) return null;
  try {
    const iw = img.width || SYMBOL_ART_MAX;
    const ih = img.height || SYMBOL_ART_MAX;
    const k = SYMBOL_ART_MAX / Math.max(iw, ih);
    const tw = Math.max(1, Math.round(iw * k));
    const th = Math.max(1, Math.round(ih * k));
    const c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    const cx = c.getContext('2d');
    if (!cx) return null;
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(downscaleInSteps(img, iw, ih, tw, th), 0, 0, tw, th);
    SYMBOL_ART_CACHE.set(id, c);
    return c;
  } catch {
    return null;
  }
}

/**
 * 絵柄タイルを箱に収めて(contain)描く。潰さないことを優先する。
 * @returns {{w:number, h:number}} 実際に描いた大きさ
 */
function drawSymbolArt(ctx, tile, cx, cy, boxW, boxH) {
  const tw = tile.width || boxW;
  const th = tile.height || boxH;
  const k = Math.min(boxW / tw, boxH / th);
  const dw = tw * k;
  const dh = th * k;
  ctx.drawImage(tile, cx - dw / 2, cy - dh / 2, dw, dh);
  return { w: dw, h: dh };
}

export class LcdView {
  /**
   * @param {object} opts
   * @param {CanvasRenderingContext2D} opts.ctx
   * @param {import('../staging/anims/lcdanims.js').LcdAnims} [opts.anims]
   * @param {import('../render/chars/index.js').CharacterLayer} [opts.chars]
   * @param {import('../staging/anims/particles.js').Particles} [opts.particles]
   */
  constructor({ ctx, w = 440, h = 300, anims = null, chars = null, particles = null }) {
    this.ctx = ctx;
    this.w = w;
    this.h = h;
    this.t = 0;
    /** 直近のフレームでステージを画像で描いたか(文字の下敷きの濃さに使う) */
    this._stageIsArt = false;
    /** ステージ画像を液晶サイズへ焼いたもの(id@dpr → canvas) */
    this._stageTiles = new Map();
    /* ── ステージ背景の保留(U42)。詳しくは _stageSource() ── */
    /** いま表示すべきステージの素(モードと内部状態から作る) */
    this._stageKey = null;
    /** 1つ前のステージの素(切り替わった瞬間に退避する) */
    this._stagePrev = null;
    /** _stageKey が切り替わった時刻[秒] */
    this._stageKeyAt = -99;
    /** 保留中に描き続けるステージ(保留が明けたら null に戻す) */
    this._stageHeld = null;
    /* ── ステージ名のスライドイン(U50)── */
    /** いま画面に出しているステージラベルの識別キー(modeId|stage) */
    this._labelKey = null;
    /** そのラベルが出た時刻[秒]。ここからの経過でスライドを描く */
    this._labelAt = -99;
    // 演出サブレイヤー(DESIGN.md 5.4)
    this.anims = anims;
    this.chars = chars;
    this.particles = particles;
  }

  update(dt) {
    this.t += dt / 1000;
  }

  /**
   * サブレイヤー順に描画する(DESIGN.md 5.4):
   *   1 stage → 2 bgObject → 3 char → 4 fgEffect → 5 ui
   * @param {{modeId:string, state:object, stackIds:string[]}} view
   *   U66-5 で `telop` は受け取らなくなった(液晶下部の説明テロップ帯を廃止)。
   */
  draw(view) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    this._drawStage(ctx, view);

    this._drawBgObject(ctx, view);
    this.anims?.draw(ctx, 'bg', this.w, this.h);

    /**
     * 演出テキスト帯が出ている間はキャラを沈める(2026-08-14 検証指摘 V2)。
     * キャラの定位置とテキスト帯の高さがほぼ同じなので、そのまま重ねると
     * サメの絵の上に文字が乗って両方読めなくなる。帯が消えれば元に戻る。
     */
    this.chars?.draw(ctx, { dim: this.anims?.text ? CHAR_DIM_WHILE_TEXT : 0 });

    this.anims?.draw(ctx, 'fg', this.w, this.h);
    this.particles?.draw(ctx);

    this._drawUi(ctx, view);
    this.anims?.draw(ctx, 'ui', this.w, this.h);
  }

  /**
   * いま描くべきステージの素を返す(U42: 演出が結果を出すまで背景を切り替えない)。
   *
   * 通常は現在のモードそのもの。ただし全面占有演出が「まだ当落を伏せている」間
   * (staging/anims/lcdanims.js の STAGE_HOLD_ANIMS)は、**切り替わる前の背景**を
   * 返し続ける。クイズの正解版は CZ の modeEnter で始まるため、これが無いと
   * 出題した瞬間に背景が CZ になって答えがバレる。
   *
   * 保留は「アニメが走っている間」だけなので、尺切れ・停止・モード離脱の
   * どの経路でも自然に解ける(戻せなくなる状態を作らない)。
   * @returns {{modeId:string, stage:string|null, title:string}}
   */
  _stageSource(view) {
    const title = (view.modeId === 'FREE_TIER'
      ? view.state?.subStateName ?? view.state?.name
      : view.state?.name) ?? view.modeId;
    const key = { modeId: view.modeId, stage: view.state?.stage ?? null, title };

    if (!this._stageKey
      || this._stageKey.modeId !== key.modeId
      || this._stageKey.stage !== key.stage) {
      this._stagePrev = this._stageKey;
      this._stageKey = key;
      this._stageKeyAt = this.t;
    } else {
      // 同じステージのままでもタイトル文字列は更新しておく(残Gなどは含まない)
      this._stageKey = key;
    }

    if (!(this.anims?.holdsStage?.() ?? false)) {
      this._stageHeld = null;
      return key;
    }
    if (!this._stageHeld) {
      // 保留が始まった瞬間に「どの背景で止めるか」を決めて固定する。
      // 切り替わった直後なら1つ前まで巻き戻す(= 演出が始まる前の絵)。
      const justSwitched = this.t - this._stageKeyAt <= STAGE_HOLD_GRACE_S;
      this._stageHeld = (justSwitched && this._stagePrev) ? this._stagePrev : key;
    }
    return this._stageHeld;
  }

  /**
   * 保留のせいで「いまのモードと違う絵」を出しているか(U42)。
   *
   * 保留していても、そのあいだにモードが変わっていなければ隠すものは何もない
   * (不正解クイズは通常時のまま進むのでこちら)。**実際に食い違っているときだけ**
   * 盤面・残G・テロップを伏せて、当落の手がかりを画面から消す。
   * @returns {boolean}
   */
  get stageMasked() {
    const held = this._stageHeld;
    if (!held || !this._stageKey) return false;
    return held.modeId !== this._stageKey.modeId || held.stage !== this._stageKey.stage;
  }

  // ── 1. stage ────────────────────────────────
  _drawStage(ctx, view) {
    const src = this._stageSource(view);
    const colors = (src.modeId === 'FREE_TIER'
      ? FREE_TIER_STAGES[src.stage]
      : STAGE_COLORS[src.modeId]) ?? STAGE_COLORS.FREE_TIER;

    const art = this._stageArt(src);
    this._stageIsArt = Boolean(art);

    if (art) {
      // 画像は液晶いっぱいに敷く(縦横比の差は許容してフィットさせる)
      ctx.drawImage(this._stageTile(art), 0, 0, this.w, this.h);
      if (!art.tint) return;
      // 専用絵の無いモードは既存の配色を薄く重ねて描き分ける
      ctx.save();
      ctx.globalAlpha = STAGE_TINT_ALPHA;
      ctx.fillStyle = this._stageGradient(ctx, colors);
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
      return;
    }

    ctx.fillStyle = this._stageGradient(ctx, colors);
    ctx.fillRect(0, 0, this.w, this.h);
  }

  /**
   * ステージの素(_stageSource の戻り値)に対応するステージ画像を返す。
   * 画像が未配置・読込前なら null(呼び出し側はグラデーションへフォールバック)。
   * @param {{modeId:string, stage:string|null}} src
   * @returns {{id:string, image:CanvasImageSource, tint:boolean}|null}
   */
  _stageArt(src) {
    const entry = src.modeId === 'FREE_TIER'
      ? { id: FREE_TIER_STAGE_ART[src.stage] ?? 'stage_freetier' }
      : MODE_STAGE_ART[src.modeId];
    if (!entry?.id) return null;
    const image = uiAssets.get(entry.id);
    if (!image) return null;
    return { id: entry.id, image, tint: Boolean(entry.tint) };
  }

  /**
   * ステージ画像を液晶の実ピクセルへ焼いて使い回す。
   *
   * 1536×1024 の原画を毎フレーム 440×300 へ落とすと、
   *   - 3.5倍の縮小を既定の補間品質でやるためジャギる(ドット絵のように見える)
   *   - 大きな縮小を60fpsで回すので単純に重い
   * ので、初回だけ段階縮小して焼き、以降は等倍で貼る。
   * @param {{id:string, image:CanvasImageSource}} art
   */
  _stageTile(art) {
    const dpr = Math.max(1, this.ctx.getTransform?.().a || 1);
    const key = `${art.id}@${dpr.toFixed(2)}`;
    const hit = this._stageTiles.get(key);
    if (hit) return hit;

    const pw = Math.max(1, Math.round(this.w * dpr));
    const ph = Math.max(1, Math.round(this.h * dpr));
    const iw = art.image.width || pw;
    const ih = art.image.height || ph;
    // 原画が液晶より小さいなら焼く意味がない(拡大はそのままの方がきれい)
    if (iw <= pw * 1.2 && ih <= ph * 1.2) return art.image;

    const c = document.createElement('canvas');
    c.width = pw;
    c.height = ph;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(downscaleInSteps(art.image, iw, ih, pw, ph), 0, 0, pw, ph);
    this._stageTiles.set(key, c);
    return c;
  }

  _stageGradient(ctx, colors) {
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, colors[0]);
    g.addColorStop(0.55, colors[1]);
    g.addColorStop(1, colors[2]);
    return g;
  }

  // ── 2. bgObject ─────────────────────────────
  _drawBgObject(ctx, view) {
    // 奥に流れるグリッド(データセンター感)。
    // ステージが画像のときは絵が十分に情報量を持っているのでごく薄くする。
    ctx.save();
    ctx.strokeStyle = this._stageIsArt ? 'rgba(255,255,255,0.022)' : 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1;
    const scroll = (this.t * 14) % 30;
    for (let y = -30 + scroll; y < this.h; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.w, y);
      ctx.stroke();
    }
    for (let x = 0; x < this.w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.h);
      ctx.stroke();
    }
    // 浮遊する光点
    for (let i = 0; i < 8; i++) {
      const px = ((i * 97 + this.t * (12 + i * 3)) % (this.w + 40)) - 20;
      const py = 40 + ((i * 53) % 200) + Math.sin(this.t * 0.8 + i) * 8;
      ctx.fillStyle = `rgba(255,255,255,${0.05 + (i % 3) * 0.03})`;
      ctx.beginPath();
      ctx.arc(px, py, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── 5. ui ───────────────────────────────────
  _drawUi(ctx, view) {
    this._drawTitleBar(ctx, view);

    // 演出のテキスト(lcd.text)が出ている間は、同じ帯に置いた常設キャプションを伏せる。
    // 突入演出のロゴと常設タイトルが重なって、どちらも読めなくなるのを防ぐ。
    const textActive = Boolean(this.anims?.text);

    /*
     * U42: 背景を保留している = 全面占有演出がまだ当落を伏せている状態。
     * このとき盤面(CZのグラフや柱)を描くと、背景だけ伏せても
     * **盤面の絵で当落がバレる**ので、盤面ごと出さない。
     * 演出が結果を出した瞬間(保留解除)に、背景と一緒に盤面が現れる。
     */
    if (this.stageMasked) return;

    switch (view.modeId) {
      case 'CZ': this._drawCz(ctx, view.state, textActive); break;
      case 'BONUS_READY': this._drawBonusReady(ctx, view.state, textActive); break;
      case 'BONUS': this._drawBonus(ctx, view.state, textActive); break;
      // U11: RUSH 4種。伸びる軸ごとに主役の絵が違う(render/lcd-rush.js)
      case 'AS_RUSH': drawAsRush(ctx, view.state, textActive, this); break;
      case 'CF_RUSH': drawCfRush(ctx, view.state, textActive, this); break;
      case 'AURORA_RUSH': drawAuroraRush(ctx, view.state, textActive, this); break;
      case 'HERO_RUSH': drawHeroRush(ctx, view.state, textActive, this); break;
      case 'HOT_STANDBY': this._drawStandby(ctx, view.state, textActive); break;
      // ── Phase 5 ──
      case 'ROUTE53_FAILOVER': this._drawRoute53(ctx, view.state, textActive); break;
      case 'SPOT_ZONE': this._drawSpot(ctx, view.state, textActive); break;
      case 'EC2_BURST': this._drawBurst(ctx, view.state, textActive); break;
      case 'GRAVITON': this._drawGraviton(ctx, view.state, textActive); break;
      case 'RESERVED': this._drawReserved(ctx, view.state, textActive); break;
      case 'CLOUDFRONT': this._drawCloudFront(ctx, view.state, textActive); break;
      case 'KINESIS': this._drawKinesis(ctx, view.state, textActive); break;
      case 'STEP_FUNCTIONS': this._drawStepFunctions(ctx, view.state, textActive); break;
      case 'SERVERLESS_RUSH': this._drawServerless(ctx, view.state, textActive); break;
      case 'MULTI_REGION': this._drawMultiRegion(ctx, view.state, textActive); break;
      case 'REINVENT_ED': this._drawEnding(ctx, view.state, textActive); break;
      default: this._drawFreeTier(ctx, view.state, textActive); break;
    }
  }

  /**
   * 「いまこの画面が常設で出している文言」を演出テキスト帯へ申告する。
   * テキスト帯は同じことを言う文言を出さなくなる(常設が正)。
   * 実際に描いた場所でだけ呼ぶこと。呼ばなくなれば申告は自然に切れる。
   * @param {string} text
   * @param {object} [opts] { matchCategory:false } で完全一致だけを重複とみなす
   */
  _ambient(text, opts) {
    this.anims?.registerAmbient?.(text, opts);
  }

  _drawTitleBar(ctx, view) {
    // 通常時は内部状態の表示名(通常ステージ / サミット会場 / Invent会場)を出す。
    // ステージ背景(assets/ui/stage_*.png)は内部状態で切り替わるので、
    // モード名(FREE_TIER の '通常ステージ')を出すと背景と食い違ってしまう。
    // state.subStateName は内部状態が変わった瞬間に game/modes/freetier.js が
    // 書き換えるため、ラベルも同じフレームで切り替わる。
    //
    // U42: 背景を保留している間は **保留中の背景と同じ名前** を出す。
    // 背景だけ据え置いてラベルが先に CZ へ変わると、結局そこで当落がバレる。
    const src = this._stageHeld ?? this._stageKey;
    const title = src?.title ?? view.modeId;
    // 画像ステージの上では文字が沈むので下敷きを濃くする
    ctx.fillStyle = this._stageIsArt ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, this.w, 34);
    ctx.font = `700 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const label = String(title).toUpperCase();
    this._drawStageLabel(ctx, label, src);

    // NOTE: ここには以前「↩ AS RUSH」のようなモードスタックの名前ラベルを
    // タイトルの右へ添えていたが、画面をすっきりさせる指示で撤去した。
    // 今どのモードに居るかは左上のステージ名で分かり、親ATへ戻ったことは
    // 背景とBGMの切り替わりで伝わるので、常設の名前ラベルは持たない。

    /*
     * 残ゲーム数(あるモードのみ)。名前ではなく進行の数字なので残す。
     *
     * ただし次の2つでは出さない:
     *   V21-11 … 盤面が「残り n / m G」を出しているモード(BOARD_SHOWS_REMAINING)。
     *            同じ情報を2か所に置かない(主役は盤面)。
     *   U42   … 背景を保留中に別モードの残Gを出すと、そこで当落がバレる。
     */
    let rightEdge = this.w - 14;
    const showRemaining = view.state?.remaining != null
      && view.state?.total != null
      && !BOARD_SHOWS_REMAINING.has(view.modeId)
      && !this.stageMasked;
    if (showRemaining) {
      ctx.textAlign = 'right';
      ctx.font = `700 13px ${FONT}`;
      ctx.fillStyle = '#ffe066';
      const label = `残り ${view.state.remaining} G`;
      ctx.fillText(label, rightEdge, 17);
      // カウントダウンはこの左隣へ回す(重ねない)
      rightEdge -= (ctx.measureText?.(label)?.width ?? 60) + 10;
    }

    this._drawSpinCountdown(ctx, view, rightEdge);
  }

  /**
   * 左上のステージ名。切り替わった瞬間だけ左からすべり込ませる(U50)。
   *
   * 引き金は「画面に出しているステージ」の変化なので、U42 の保留中は動かない
   * (保留が明けて背景が変わるのと同じフレームで走る)。
   * アニメが終われば定位置の静止表示に戻り、以降は毎フレーム同じ絵になる。
   *
   * @param {CanvasRenderingContext2D} ctx フォント/揃えは呼び出し側で設定済み
   * @param {string} label 大文字化済みのステージ名
   * @param {{modeId:string, stage:string|null}|null} src いま描いているステージの素
   */
  _drawStageLabel(ctx, label, src) {
    const key = src ? `${src.modeId}|${src.stage ?? ''}` : '';
    if (key !== this._labelKey) {
      this._labelKey = key;
      this._labelAt = this.t;
    }
    const p = Math.max(0, Math.min(1, (this.t - this._labelAt) / STAGE_LABEL_SLIDE_S));
    const ease = 1 - (1 - p) ** 3;                  // easeOutCubic
    const x = 14 - STAGE_LABEL_SLIDE_PX * (1 - ease);
    // 出だしの薄さだけ短く取る(文字が読める時間を長く残す)
    const alpha = Math.min(1, p / 0.35);

    ctx.save();
    // タイトルバーの外(盤面側)へはみ出さないよう帯で切り抜く
    ctx.beginPath();
    ctx.rect(0, 0, this.w, 34);
    ctx.clip();
    const baseAlpha = ctx.globalAlpha;
    ctx.globalAlpha = baseAlpha * alpha;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x, 17);

    // 切り替え直後だけ、文字の足元を金色の線が走る(切り替わったことの合図)
    if (p < 1) {
      const tw = ctx.measureText?.(label)?.width ?? label.length * 9;
      const lineW = (tw + STAGE_LABEL_UNDERLINE_PAD) * ease;
      ctx.globalAlpha = baseAlpha * alpha * (1 - p) * 0.9;
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(x, 27, lineW, 2);
    }
    ctx.restore();
  }

  /**
   * ラスト5回転のカウントダウン(U26)。タイトルバーの右側に小さく出す。
   * @param {number} rightEdge 使ってよい右端X(残Gラベルがあればその左)
   */
  _drawSpinCountdown(ctx, view, rightEdge) {
    const left = view.spinsLeft;
    if (!Number.isFinite(left)) return;
    // リザルト表示中(セッション終了後)は出さない
    if (view.session?.ended && !FORCE_COUNTDOWN) return;
    if (left > COUNTDOWN_FROM && !FORCE_COUNTDOWN) return;

    const n = Math.max(0, Math.min(COUNTDOWN_FROM, left));
    const text = `ラスト${n}`;
    // 残り2回転からは赤く点滅させて「もう後がない」を出す
    const urgent = n <= 2;
    const pulse = urgent ? 0.72 + 0.28 * Math.sin(this.t * 8) : 1;

    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `900 15px ${FONT_HEAVY}`;
    const tw = ctx.measureText?.(text)?.width ?? 54;
    const padX = 8;
    const plateW = tw + padX * 2;
    const x = rightEdge - plateW;
    if (x < 90) { ctx.restore(); return; }   // モード名と競るなら出さない

    ctx.globalAlpha = pulse;
    roundRect(ctx, x, 4, plateW, 26, 7);
    ctx.fillStyle = urgent ? 'rgba(150,20,20,0.85)' : 'rgba(0,0,0,0.55)';
    ctx.fill();
    ctx.strokeStyle = urgent ? '#ff8a8a' : 'rgba(255,224,102,0.7)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = urgent ? '#ffd6d6' : '#ffe066';
    ctx.fillText(text, x + plateW - padX, 18);
    ctx.restore();
  }

  /** 共通: 上乗せストック(親ATに積まれたセット数) */
  _drawStock(ctx, state, x, y) {
    const stock = state?.stock ?? 0;
    if (stock <= 0) return;
    ctx.textAlign = 'right';
    ctx.font = `900 15px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ff9ad5';
    ctx.fillText(`STOCK +${stock}`, x, y);
    ctx.textAlign = 'center';
  }

  /** 共通: 横ゲージ */
  _drawGauge(ctx, x, y, w, h, p, colors) {
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    const v = Math.max(0, Math.min(1, p));
    if (v > 0) {
      ctx.save();
      roundRect(ctx, x, y, w, h, h / 2);
      ctx.clip();
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, colors[0]);
      g.addColorStop(1, colors[1]);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w * v, h);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.stroke();
  }

  /* ══ 旧テロップ帯の跡地(y266〜300)══════════════════════════════════
   *
   * 2026-08-15 ユーザー指示 U66-5 で `_drawTelop`(flow.telop を毎フレーム
   * 黒帯に流し込む説明欄)は **削除した**。同じことをポップアップと2か所へ
   * 書き続けるチャネルだったため(U8 の二重表示の主因)。
   *
   * 空いた帯には「そのモードで **ずっと変わらない** ルール・目標」だけを置く。
   * 毎ゲーム変わる出来事は書かないこと(それはポップアップの担当)。 */

  /**
   * 盤面の常設ルール行(旧テロップ帯の跡地)。
   *
   * ここに出してよいのは **そのモードに居る限り変わらない文** だけ:
   *   ・目標(「ALARM を発報させろ!」)
   *   ・遊び方(「キャッシュヒットで枚数が飛んでくる」)
   * 毎ゲームの結果・獲得枚数・残りゲーム数は書かない(盤面の主役かポップアップの担当)。
   *
   * ポップアップ(告知プレート)は y152〜236 なので、この行(y280)とは重ならない。
   * それでも同じことを言っている場合は U8 に従って **ポップアップを優先** して黙る。
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} text
   * @param {object} [opts]
   * @param {string} [opts.color]
   * @param {number} [opts.size]
   * @param {string} [opts.sub] 2行目(さらに小さく出す補足)
   */
  _drawRuleLine(ctx, text, { color = 'rgba(255,255,255,0.78)', size = 13, sub = '' } = {}) {
    if (!text) return;
    // ポップアップが同じことを言っている間は黙る(U8。役割分担は瞬間=ポップアップ)
    if (this.anims?.covers?.(text) ?? false) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = RULE_LINE_Y - (sub ? 8 : 0);
    // 画像ステージの上でも沈まないよう、行の下にごく薄い下敷きを敷く
    ctx.fillStyle = this._stageIsArt ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.32)';
    ctx.fillRect(0, y - 15, this.w, sub ? 36 : 26);

    ctx.font = `700 ${size}px ${FONT}`;
    ctx.fillStyle = color;
    let shown = String(text);
    while (ctx.measureText(shown).width > this.w - 24 && shown.length > 4) {
      shown = `${shown.slice(0, -2)}…`;
    }
    ctx.fillText(shown, this.w / 2, y);
    // 常設で出している文言は申告する(同じことをポップアップに積ませない)。
    // カテゴリ判定は使わない: ルール文は長いので、たまたま「継続」等を含んだだけで
    // 演出側の告知まで巻き添えで消えてしまう。
    this._ambient(shown, { matchCategory: false });

    if (sub) {
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      let s = String(sub);
      while (ctx.measureText(s).width > this.w - 24 && s.length > 4) s = `${s.slice(0, -2)}…`;
      ctx.fillText(s, this.w / 2, y + 16);
      this._ambient(s, { matchCategory: false });
    }
    ctx.restore();
  }

  // ── モード別 ────────────────────────────────

  /**
   * 通常時の液晶は「左上のステージ名 + キャラ + 演出」だけにする。
   *
   * 以前はここに中央タイトル(FREE TIER)・内部状態・ゲーム数・天井ゲージを
   * 常設で描いていたが、
   *   - ステージ名は _drawTitleBar が内部状態に追従して左上に出す
   *   - ゲーム数は HUD の7セグ(COUNT)にある
   *   - 天井(Auto Recovery)は発動時に前兆・演出側が告知する
   * と役割が重複していたので、画面を空けてキャラと演出を主役にした。
   */
  _drawFreeTier() {
    /* 常設表示なし */
  }

  _drawCz(ctx, state, textActive = false) {
    /*
     * ── 目標と期待度の常設行(2026-08-15 U66-5 の移行先)───────────────
     * 旧テロップ帯にしか出ていなかった
     *   `${state.goal} 期待度${state.stars} — ${state.goalDetail}`
     * (game/modes/cz.js の onEnter)を盤面の常設行として引き取る。
     * CZ は11種あって盤面もバラバラだが、「何をすれば勝ちか」は全種共通の
     * 持続情報なので、盤面の実装ごとに散らさず **ここで1回だけ** 描く。
     * 期待度(★)は入場時に決まって最後まで変わらない = 常設情報の資格を満たす。
     */
    if (state?.goal) {
      this._drawRuleLine(ctx, `${state.goal}${state.stars ? `  期待度 ${state.stars}` : ''}`, {
        color: '#ffd166',
        sub: state?.goalDetail ?? '',
      });
    }
    if (state?.ui === 'checklist') return this._drawCzChecklist(ctx, state, textActive);
    if (state?.ui === 'pillars') return this._drawCzPillars(ctx, state, textActive);
    if (state?.ui === 'sfn') return this._drawCzSfn(ctx, state, textActive);
    if (state?.ui === 'alb') return drawCzAlb(ctx, state, textActive, this);
    if (state?.ui === 'dlq') return drawCzDlq(ctx, state, textActive, this);
    if (state?.ui === 'bluegreen') return drawCzBlueGreen(ctx, state, textActive, this);
    if (state?.ui === 'fis') return drawCzFis(ctx, state, textActive, this);
    return this._drawCzGraph(ctx, state, textActive);
  }

  /**
   * Step Functions CZ: ワークフローが最後まで流れきれば突破。
   *
   * RUSH中の STEP_FUNCTIONS ゾーン(_drawStepFunctions)と同じ
   * 「丸 + 矢印」の絵で揃える。あちらは分岐を選ばせるUI付きだが、
   * こちらは自動進行の表示だけなので選択ボックスを持たない。
   *
   * state の読み方はゲーム側の実装に幅を持たせて受ける(未実装でも落ちない):
   *   ノード名  state.states[] (無ければ STATE 1.. の連番)
   *   総数      state.stateTotal / states.length / total
   *   現在位置  state.stateIndex / step
   *   失敗      state.failed / fail / lastResult === 'FAILED'
   */
  _drawCzSfn(ctx, state, textActive = false) {
    const names = Array.isArray(state?.states) && state.states.length > 0 ? state.states : null;
    const total = Math.max(2, Math.round(names?.length ?? state?.stateTotal ?? state?.total ?? 5));
    const rawIdx = state?.stateIndex ?? state?.step ?? 0;
    const idx = Math.max(0, Math.min(total, Math.round(rawIdx)));
    const failed = Boolean(state?.failed ?? state?.fail ?? state?.lastResult === 'FAILED');
    const cleared = idx >= total && !failed;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ── ステートマシン図 ──
    const startX = 40;
    const endX = this.w - 40;
    const y = 96;
    const step = (endX - startX) / (total - 1);
    const r = Math.min(12, Math.max(7, step / 5));

    for (let i = 0; i < total; i++) {
      const x = startX + i * step;
      const passed = i < idx;
      const current = i === idx && !cleared;

      // 矢印(通過済みは緑)
      if (i > 0) {
        const lit = i <= idx;
        ctx.strokeStyle = lit ? '#4ce0a0' : 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - step + r + 2, y);
        ctx.lineTo(x - r - 5, y);
        ctx.stroke();
        ctx.fillStyle = lit ? '#4ce0a0' : 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.moveTo(x - r - 1, y);
        ctx.lineTo(x - r - 7, y - 4);
        ctx.lineTo(x - r - 7, y + 4);
        ctx.closePath();
        ctx.fill();
      }

      // ノード
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (current && failed) {
        ctx.fillStyle = '#ff5a5a';
      } else if (passed) {
        ctx.fillStyle = '#4ce0a0';
      } else if (current) {
        ctx.fillStyle = `rgba(255,224,102,${0.5 + 0.5 * Math.sin(this.t * 8)})`;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // 失敗したノードには×を描く
      if (current && failed) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.5, y - r * 0.5);
        ctx.lineTo(x + r * 0.5, y + r * 0.5);
        ctx.moveTo(x + r * 0.5, y - r * 0.5);
        ctx.lineTo(x - r * 0.5, y + r * 0.5);
        ctx.stroke();
      }

      // ノード名(狭いので短く詰める)
      // states[] の要素は文字列でも {name, type, status} オブジェクトでもよい
      const rawName = names?.[i];
      const label = (rawName && typeof rawName === 'object' ? rawName.name : rawName) ?? `S${i + 1}`;
      // U39: 9px は実画面で8px相当まで沈むので10pxへ。下の while が maxW まで詰めるので溢れない
      ctx.font = `700 10px ${FONT}`;
      ctx.fillStyle = passed ? 'rgba(124,247,208,0.85)'
        : current ? '#ffe066' : 'rgba(255,255,255,0.4)';
      let text = String(label);
      const maxW = step - 4;
      while (text.length > 2 && ctx.measureText(text).width > maxW) text = `${text.slice(0, -2)}…`;
      ctx.fillText(text, x, y + r + 12);
    }

    // ── 進捗ゲージ ──
    this._drawGauge(ctx, 60, 140, this.w - 120, 8, idx / total,
      failed ? ['#7a1c1c', '#ff5a5a'] : ['#1c5a7a', '#4ce0a0']);
    ctx.font = `700 11px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`${idx} / ${total} States`, this.w / 2, 160);

    // ── 現在の状態 ──
    if (failed) {
      ctx.font = `900 26px ${FONT_HEAVY}`;
      ctx.fillStyle = '#ff5a5a';
      ctx.fillText('FAILED', this.w / 2, 196);
    } else if (cleared) {
      ctx.font = `900 26px ${FONT_HEAVY}`;
      ctx.fillStyle = '#7bf7d0';
      ctx.fillText('SUCCEEDED', this.w / 2, 196);
    } else if (!textActive) {
      ctx.font = `700 14px ${FONT}`;
      ctx.fillStyle = '#ffe066';
      const cur = names?.[idx];
      const curName = (cur && typeof cur === 'object' ? cur.name : cur) ?? 'Task State';
      ctx.fillText(String(curName), this.w / 2, 196);
    }

    if (!textActive) {
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('Success State 到達でボーナス', this.w / 2, 218);
    }
  }

  /**
   * M03. Trusted Advisor: 5項目のチェックリスト
   * (U52c で AWS Config 準拠ルールCZ も同じ盤面を借りている)
   *
   * 状態名は **CZ が state.statusLabels で持ち込める**(2026-08-15 検証指摘)。
   * 既定は Trusted Advisor の NG / WARN / GREEN だが、
   * AWS Config の評価結果に NG も WARN も存在しない
   * (COMPLIANT / NON_COMPLIANT / NOT_APPLICABLE / INSUFFICIENT_DATA)ため、
   * CONFIG_RULES 側からは実在する語を渡してもらう。
   * 盤面下の1行も state.goalLabel で差し替えられる(「あと n 本」等)。
   */
  _drawCzChecklist(ctx, state, textActive = false) {
    const items = state?.items ?? [];
    const greens = items.filter((it) => it.level === 2).length;
    const labels = Array.isArray(state?.statusLabels) && state.statusLabels.length === 3
      ? state.statusLabels
      : ['NG', 'WARN', 'GREEN'];
    const x = 46;
    const w = this.w - 92;
    ctx.textBaseline = 'middle';

    /**
     * 行の高さとピッチを詰めて全体を上へ寄せてある。
     * lcd.text(突入時の「TRUSTED ADVISOR」ロゴ)は液晶中央下 y≒150〜230 の帯に出るため、
     * 30px ピッチだと5行目(サービス制限)がロゴの下に隠れてしまう。
     *
     * 2026-08-14 しおん指摘 S10:
     * 26px ピッチでも「DEPLOY 成功 — CZ突入」の帯が5行目に掛かっていたので、
     * **帯が出ている間だけ**さらに詰めてリスト全体を上へ退避させる。
     * 帯が消えれば元のピッチへ戻るので、通常時の読みやすさは変わらない。
     */
    const rowH = textActive ? 19 : 22;
    const pitch = textActive ? 22 : 26;
    const top = textActive ? 38 : 46;
    items.forEach((it, i) => {
      const y = top + i * pitch;
      const col = ['#ff5a5a', '#ffd166', '#4ce0a0'][it.level];
      roundRect(ctx, x, y, w, rowH, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // 状態ランプ
      ctx.beginPath();
      ctx.arc(x + 16, y + rowH / 2, 6, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = it.level === 2 ? 12 : 0;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.textAlign = 'left';
      ctx.font = `600 13px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(it.name, x + 30, y + rowH / 2);
      ctx.textAlign = 'right';
      // 状態名は最大 'NON_COMPLIANT'(13文字)まで来るので、行の余白に合わせて詰める
      ctx.font = `700 11px ${FONT}`;
      ctx.fillStyle = col;
      const label = String(labels[it.level] ?? '');
      const maxW = w - 40 - ctx.measureText('W').width;
      let shown = label;
      while (shown.length > 2 && ctx.measureText(shown).width > maxW) shown = `${shown.slice(0, -2)}…`;
      ctx.fillText(shown, x + w - 10, y + rowH / 2);
    });

    ctx.textAlign = 'center';
    if (!textActive) {
      /*
       * 盤面下の1行。
       * 旧: 「GREEN 3 / 4 で突破」… 4本必要なのに3で突破すると読めてしまい、
       *      「全ルールを COMPLIANT にしろ」という目標と食い違って見えた
       *      (2026-08-15 検証指摘)。
       * 新: 現在値と残り本数を分けて出す。突破に届いていれば達成を言い切る。
       */
      const need = state?.greenNeeded ?? 3;
      const done = greens >= need;
      // 見出しの語も statusLabels に合わせる(Config なら COMPLIANT n / N)
      const okWord = String(labels[2] ?? 'GREEN');
      ctx.font = `900 15px ${FONT_HEAVY}`;
      ctx.fillStyle = done ? '#4ce0a0' : '#ffffff';
      const goalLabel = state?.goalLabel
        ?? (done ? `${okWord} ${greens} / ${need} — 達成` : `${okWord} ${greens} / ${need} — あと${need - greens}`);
      ctx.fillText(goalLabel, this.w / 2, 222);
    }
  }

  /** M04. Well-Architected: 6本の柱 */
  _drawCzPillars(ctx, state, textActive = false) {
    const pillars = state?.pillars ?? [];
    const raised = state?.raised ?? 0;
    const baseY = 196;
    const w = 46;
    const gap = 10;
    const totalW = pillars.length * w + (pillars.length - 1) * gap;
    const startX = (this.w - totalW) / 2;

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    pillars.forEach((name, i) => {
      const x = startX + i * (w + gap);
      const up = i < raised;
      const h = up ? 112 : 16;
      const y = baseY - h;
      roundRect(ctx, x, y, w, h, 4);
      if (up) {
        const g = ctx.createLinearGradient(0, y, 0, baseY);
        g.addColorStop(0, '#fff3c4');
        g.addColorStop(1, '#e0a800');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
      }
      ctx.fill();
      ctx.strokeStyle = up ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.save();
      ctx.font = `700 9px ${FONT}`;
      ctx.fillStyle = up ? 'rgba(60,30,0,0.9)' : 'rgba(255,255,255,0.45)';
      ctx.translate(x + w / 2, up ? y + 56 : baseY - 30);
      ctx.fillText(name, 0, 0);
      ctx.restore();
    });
    // 土台
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(startX - 10, baseY, totalW + 20, 6);

    /*
     * 立った本数のカウンタ(2026-08-14 検証指摘 V21-07)。
     *
     * 旧実装は「演出テキスト帯が出ている間は消す」だったため、
     * レア役で柱が伸びた瞬間(= ポップアップ『SPIKE!』が出る瞬間)に
     * **一番見たい 3/6 本 が画面から消えていた**。
     * 消すのではなく、帯(y152〜236)に掛からない位置へ逃がす:
     *   帯なし … 柱の下(y224)。従来どおり主役の位置
     *   帯あり … 盤面の上(y48)の右肩へ小さく退避。柱の頭(y84)より上なので何も隠さない
     */
    const count = `${raised} / ${pillars.length} 本`;
    const done = raised >= pillars.length;
    if (!textActive) {
      ctx.font = `900 16px ${FONT_HEAVY}`;
      ctx.fillStyle = done ? '#ffe066' : '#ffffff';
      ctx.fillText(count, this.w / 2, 224);
      return;
    }
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = `900 15px ${FONT_HEAVY}`;
    const tw = ctx.measureText?.(count)?.width ?? 52;
    roundRect(ctx, this.w - 16 - tw - 12, 36, tw + 24, 24, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    ctx.strokeStyle = done ? 'rgba(255,224,102,0.85)' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = done ? '#ffe066' : '#ffffff';
    ctx.fillText(count, this.w - 22, 48);
    ctx.restore();
  }

  _drawCzGraph(ctx, state, textActive = false) {
    const gx = 40;
    const gy = 58;
    const gw = this.w - 80;
    const gh = 150;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, gx, gy, gw, gh, 6);
    ctx.fill();

    // 閾値ライン
    const yOf = (v) => gy + gh - (v / CZ_GRAPH_MAX) * gh;
    ctx.strokeStyle = 'rgba(255,80,80,0.85)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx, yOf(CZ_GRAPH_THRESHOLD));
    ctx.lineTo(gx + gw, yOf(CZ_GRAPH_THRESHOLD));
    ctx.stroke();
    ctx.setLineDash([]);
    // 2026-08-13 ユーザー指摘「どうなればいいのか分からない」への対応。
    // 「あの線を超えればいい」が一目で分かるよう、閾値ラインに日本語ラベルを添える。
    ctx.fillStyle = 'rgba(255,120,120,0.95)';
    ctx.font = `700 10px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('ALARM 閾値 — ここを超えれば突破', gx + 6, yOf(CZ_GRAPH_THRESHOLD) - 3);
    ctx.textAlign = 'right';
    ctx.fillText('THRESHOLD', gx + gw - 6, yOf(CZ_GRAPH_THRESHOLD) - 3);

    // 折れ線
    const graph = state?.graph ?? [0];
    const total = state?.total ?? 5;
    const stepX = gw / total;
    ctx.strokeStyle = '#7cf3ff';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    graph.forEach((v, i) => {
      const x = gx + i * stepX;
      const y = yOf(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    graph.forEach((v, i) => {
      ctx.fillStyle = v >= CZ_GRAPH_THRESHOLD ? '#ff5a5a' : '#7cf3ff';
      ctx.beginPath();
      ctx.arc(gx + i * stepX, yOf(v), 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // 常設タイトル。突入演出のロゴ(lcd.text)と同じ帯なので、出ている間は伏せる
    if (!textActive) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 20px ${FONT_HEAVY}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText('CloudWatch ALARM', this.w / 2, gy + gh + 24);
      /*
       * 目標(state.goal)はここには描かない(2026-08-15 U66-5)。
       * CZ11種で共通の持続情報なので、_drawCz の常設ルール行が
       * 「目標 + 期待度 + 補足」をまとめて1か所で出す。
       * ここに戻すと同じ文が盤面に2行並ぶ(U8 の二重表示)。
       */
      this._ambient('CloudWatch ALARM');
    }
  }

  /**
   * ボーナス入賞待ち(BONUS_READY)。DESIGN.md 3.7
   * 「ボーナス確定!」の告知と、揃えるべき絵柄の指示を大きく出す。
   *
   * ══ 2026-08-14 検証指摘 V21-02(major / U8違反)═════════════════
   * 「サメBARを揃えろ!」が **盤面(ここ)と下部テロップの2か所** に同時に出ていた。
   * 役割分担は「持続的な状態情報 = 盤面 / 瞬間の演出 = ポップアップ」なので、
   * 揃え方の指示は **盤面だけの担当** に一本化した:
   *   1. ここで出している指示文を _ambient() で申告する
   *      → 同じ文言のポップアップ(lcd.text)が積まれなくなる
   *   2. game/modes/bonusready.js は毎ゲームの指示テロップを返さなくした
   * 消化ゲーム数の (nG) も盤面側だけが持つ(テロップ側と数字がズレて見えていた)。
   *
   * V21-01 と同じ理由で、テキスト帯(y152〜236)と重なる行は
   * 帯が出ている間だけ上へ逃がす。
   */
  _drawBonusReady(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const titleY = textActive ? 60 : 96;
    const titleSize = textActive ? 26 : 34;

    // 「BONUS 確定!!」の点滅告知
    const blink = 0.65 + Math.sin(this.t * 9) * 0.35;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.font = `900 ${titleSize}px ${FONT_HEAVY}`;
    ctx.lineWidth = titleSize * 0.2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3a1a00';
    ctx.strokeText('BONUS 確定!!', this.w / 2, titleY);
    const grad = ctx.createLinearGradient(0, titleY - 20, 0, titleY + 20);
    grad.addColorStop(0, '#fffbd0');
    grad.addColorStop(0.5, '#ffd24a');
    grad.addColorStop(1, '#ff8a00');
    ctx.fillStyle = grad;
    ctx.fillText('BONUS 確定!!', this.w / 2, titleY);
    ctx.restore();
    // この画面が常設で「確定」を出しているので、テキスト帯には同じ告知を出させない
    this._ambient('BONUS 確定!!');

    /*
     * 揃える絵柄のプレート(3コマぶん並べて「中段に揃える」を絵で示す)。
     *
     * U54(2026-08-15 ユーザー指示): 文字(7 / BAR)ではなく
     * **リールに乗っている絵柄の実画像**(GHOST7.png / SHARKBAR.png)を出す。
     * 画像が来ていないときだけ従来の文字へ落ちる(symbolArt が null を返す)。
     * 位置・大きさは以前と同一なので、下の指示テキスト(y208)や
     * 告知プレート帯(y152〜236)との取り合いは変わっていない(U8)。
     */
    const symbolId = state?.targetSymbol === 'SHARKBAR' ? 'SHARKBAR' : 'GHOST7';
    const label = state?.targetSymbol === 'SHARKBAR' ? 'BAR' : '7';
    const plateColor = state?.targetSymbol === 'SHARKBAR' ? '#ffd166' : '#c88bff';
    const art = symbolArt(symbolId);
    /*
     * 帯が出ていないときだけ一回り大きくする(54×50 → 60×56)。
     * 絵柄が主役になったぶん見せ場を作るための拡大で、下端は
     *   132+50=182 → 130+56=186
     * と 4px 下がるだけ。指示テキスト(y208 / 22px = 上端 y197)とは 11px 空く。
     * 帯が出ている間(textActive)は指示が y134 まで上がってくるので、**広げない**。
     */
    const pw = textActive ? 42 : 60;
    const ph = textActive ? 38 : 56;
    const gap = 10;
    const totalW = pw * 3 + gap * 2;
    const px = (this.w - totalW) / 2;
    const py = textActive ? 84 : 130;
    for (let i = 0; i < 3; i++) {
      const x = px + i * (pw + gap);
      const bob = Math.sin(this.t * 5 - i * 0.6) * 3;
      roundRect(ctx, x, py + bob, pw, ph, 7);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = plateColor;
      // 「これが揃う」を目立たせる淡い発光(点滅は BONUS 確定!! と同じ周期)
      ctx.save();
      ctx.shadowColor = plateColor;
      ctx.shadowBlur = 8 + blink * 6;
      ctx.stroke();
      ctx.restore();

      if (art) {
        // 枠からはみ出さないよう、内側 4px を余白にして収める
        ctx.save();
        roundRect(ctx, x, py + bob, pw, ph, 7);
        ctx.clip();
        drawSymbolArt(ctx, art, x + pw / 2, py + bob + ph / 2, pw - 8, ph - 8);
        ctx.restore();
      } else {
        ctx.font = `900 ${textActive ? 20 : 26}px ${FONT_HEAVY}`;
        ctx.fillStyle = plateColor;
        ctx.fillText(label, x + pw / 2, py + bob + ph / 2 + 1);
      }
    }

    /*
     * 指示テキスト。**この画面が指示の唯一の出どころ**なので、
     * 帯で隠れる位置に置かず、隠れる場合は上へ逃がす(消さない)。
     * 申告(_ambient)は実際に描いたときだけ行う約束なので、描画と同じ枝で呼ぶ。
     */
    const instruction = state?.instruction ?? 'ボーナス図柄を揃えろ!';
    // ポップアップが同じことを言っている間だけは黙る(U8。突入演出のサブ行が
    // 「サメBARを揃えろ!」なので、その1.7秒は盤面が譲る)
    if (!(this.anims?.covers?.(instruction) ?? false)) {
      ctx.font = `900 ${textActive ? 17 : 22}px ${FONT_HEAVY}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(instruction, this.w / 2, textActive ? 134 : 208, this.w - 24);
      // 下部パネルのテロップに同じ指示を出させない(U8)。
      // カテゴリ判定は使わない(「BONUS」等をたまたま含む別の告知まで消えてしまうため)
      this._ambient(instruction, { matchCategory: false });
    }

    if (!textActive) {
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      /*
       * 待たされている理由をここだけで説明する(2026-08-14 検証指摘 V21-04)。
       * 旧文言「停止ボタンを押すだけで揃います」は、**小役が成立したゲームは揃わない**
       * (game/modes/bonusready.js の reelTargetFor は flag==='LOSE' のときだけ
       *  ボーナス図柄を狙う)という肝心のルールを伝えていなかったため、
       * 小役が続いた回で「揃えたのに入賞しない = 進行が止まった」と読まれていた。
       */
      ctx.fillText(
        `${state?.shortName ?? 'BONUS'} — 小役が成立しないゲームで自動的に揃います  (${state?.games ?? 0}G目)`,
        this.w / 2, 234,
      );
    }
  }

  /**
   * ボーナス消化中の盤面。
   *
   * ══ 2026-08-14 検証指摘 V21-01(major)══════════════════════════
   * 「大ロゴ GHOST BONUS が 獲得枚数 / 残りG / ベル揃いで+15枚 の3行と重なって
   *   数値が読めない」。犯人は盤面のタイトルではなく **演出のテキスト帯**:
   *   テキスト帯は液晶の中央 +44px(y≒194)に下敷きごと出るので、
   *   1行+サブ行の告知でも **y152〜236 を占有** する。
   *   旧レイアウトの3行(174 / 200 / 220)はその真下にあり、全部隠れていた。
   *
   * 対策は「帯が出ている間は数値を帯の外(上)へ逃がす」。
   * 数値を消してしまうと消化中の主役情報が無くなるので、**縮めて上へ寄せる**
   * (lcd-cz-extra.js の各CZ盤面が textActive で位置を詰めているのと同じ作法)。
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} state
   * @param {boolean} textActive 演出のテキスト帯が出ているか
   */
  _drawBonus(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const title = state?.title ?? 'BONUS';
    const pulse = 1 + Math.sin(this.t * 6) * 0.03;

    /*
     * ── AWS豆知識カードと同居する(2026-08-15 ユーザー指示 U64-8)────────────
     * カード(staging/anims/lcdanims-extra.js の TRIVIA_CARD)は y38〜146 を占める。
     * 大ロゴ(y79〜125)はその真下に潜って重なっていたので、
     * **カードが出ている間だけロゴをヘッダ帯(y0〜34)へ縮めて逃がす**。
     * これで ロゴ / カード / 獲得枚数(162)/ 残りG(190)/ ベル説明(214)/ SET(238)
     * の6つが1画面に全部並ぶ。カードが消えれば大ロゴへ戻る。
     */
    const cardActive = this.anims?.isPlaying?.('aws_trivia_card') === true;

    // テキスト帯が出ている間は、盤面を丸ごと帯の上(y<TEXT_BAND_TOP)へ収める
    let titleY = textActive ? 62 : 102;
    let titleSize = textActive ? 30 : 46;
    if (cardActive) {
      // ヘッダ帯の中。左のステージ名・右のカウントダウンとは重ならない中央に置く
      titleY = 17;
      titleSize = 16;
    }

    ctx.save();
    ctx.translate(this.w / 2, titleY);
    ctx.scale(pulse, pulse);
    ctx.font = `900 ${titleSize}px ${FONT_HEAVY}`;
    ctx.lineWidth = titleSize * 0.17;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3a0a00';
    ctx.strokeText(title, 0, 0, this.w - 24);
    const grad = ctx.createLinearGradient(0, -titleSize * 0.56, 0, titleSize * 0.56);
    grad.addColorStop(0, '#fff3a0');
    grad.addColorStop(0.5, '#ffb400');
    grad.addColorStop(1, '#ff5a00');
    ctx.fillStyle = grad;
    ctx.fillText(title, 0, 0, this.w - 24);
    ctx.restore();
    // ボーナス名は常設で大きく出ているので、テキスト帯に同じ告知を出させない
    this._ambient(title);

    /*
     * カードが出ている間は、帯が無ければ下3行(162 / 190 / 214 / 238)をそのまま使う。
     * カードの下端は 146 なので重ならない(座標を動かすときは
     * lcdanims-extra.js の TRIVIA_CARD と必ず突き合わせること)。
     */

    const remaining = state?.remaining ?? 0;
    const total = state?.total ?? 0;
    const gained = `+${Math.floor(state?.gained ?? 0)} 枚`;
    const left = `残り ${remaining} / ${total} G`;
    const leftColor = remaining <= 3 ? '#ff8a8a' : '#ffffff';

    if (textActive && cardActive) {
      /*
       * ── 帯 + カードが同時に出ている(U64-8)──────────────────────────
       * 上(y38〜146)はカード、中(y151〜237)は帯で埋まっているので、
       * 数値は **帯の下・テロップ帯(y266〜)の上** の空き(y240〜262)へ1行で逃がす。
       * ここでも消えるのはロゴだけ(ヘッダに縮小版が出ている)。
       */
      const y = 252;
      ctx.font = `900 18px ${FONT_HEAVY}`;
      ctx.fillStyle = '#ffe066';
      ctx.fillText(gained, 96, y);
      ctx.font = `900 15px ${FONT_HEAVY}`;
      ctx.fillStyle = leftColor;
      ctx.fillText(left, 244, y);
      if (state?.isSet) {
        ctx.font = `900 13px ${FONT_HEAVY}`;
        ctx.fillStyle = state?.onDemand ? '#7bf7d0' : 'rgba(255,255,255,0.8)';
        ctx.fillText(`SET ${state?.setCount ?? 1}`, 382, y);
      }
      return;
    }

    if (textActive) {
      /* ── 帯が出ている間: 獲得枚数と残りGを1行にまとめて上へ逃がす ── */
      const y = 104;
      ctx.font = `900 22px ${FONT_HEAVY}`;
      ctx.fillStyle = '#ffe066';
      ctx.fillText(gained, this.w / 2 - 82, y);
      ctx.font = `900 18px ${FONT_HEAVY}`;
      ctx.fillStyle = leftColor;
      ctx.fillText(left, this.w / 2 + 78, y);
      if (state?.isSet) {
        ctx.font = `900 15px ${FONT_HEAVY}`;
        ctx.fillStyle = state?.onDemand ? '#7bf7d0' : 'rgba(255,255,255,0.8)';
        ctx.fillText(`SET ${state?.setCount ?? 1}`, this.w / 2, 130);
      }
      return;
    }

    /*
     * ── ボーナス名の日本語表記は出さない(2026-08-15 検証指摘 Q2 / U8)──────
     * ここには state.name(「ゴーストボーナスSP」)を 15px で出していたが、
     * すぐ上の大ロゴが state.title(「GHOST BONUS SP」)= **同じものの英語表記** で、
     * 同じ情報が2行並んでいた(実質の二重表示)。
     * U8 の「同じことは1か所」に合わせ、**盤面の主役である大ロゴ側に寄せて**
     * こちらを落とす。日本語名が要る場面(残存価値の明細など)は
     * game/modes/bonus.js が state.name をそのまま使えるので情報は失われない。
     */

    /*
     * Q2 で日本語名の行(y142)を落としたぶん、下の3行を 12px 詰めて
     * 大ロゴとの間が空きすぎないようにする(174/200/220 → 162/190/214)。
     * 帯が出ているときは上の textActive 分岐が別レイアウトを持つので影響しない。
     */
    // 獲得枚数(純増ベース)。ベルが揃うたびに一気に伸びる
    ctx.font = `900 24px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(gained, this.w / 2, 162);

    // 残ゲーム数(15G / 6G と短いので、消化中はここが主役になる)
    ctx.font = `900 20px ${FONT_HEAVY}`;
    ctx.fillStyle = leftColor;
    ctx.fillText(left, this.w / 2, 190);

    // ベルで増えるという遊び方の説明(2026-08-13 の仕様変更ぶん)
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('ベル揃いで +15 枚', this.w / 2, 214);

    /*
     * セット継続型(DynamoDB BIG)は「いま何セット目か」だけを常設で出す。
     *
     * 2026-08-14 ユーザー指摘 U1 / U8:
     *   旧表示の「ON-DEMAND」は継続を表す社内語で意味が伝わらなかった。
     *   かといって「SET 3 継続中!!」と書くと、継続の瞬間に出るポップアップ
     *   (data/scenarios/bonus.js の「ボーナス継続!!」)とテロップと合わせて
     *   同じことが3か所に並ぶ。ここは常設=状態表示の担当なので数字だけ持つ。
     *   継続したという「瞬間」はポップアップの担当。
     */
    if (state?.isSet) {
      ctx.font = `900 17px ${FONT_HEAVY}`;
      // オンデマンド(継続確定の内部フラグ)は色の明るさだけで匂わせる
      ctx.fillStyle = state?.onDemand ? '#7bf7d0' : 'rgba(255,255,255,0.8)';
      ctx.fillText(`SET ${state?.setCount ?? 1}`, this.w / 2, 238);
    }
  }

  _drawStandby(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 24px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('HOT STANDBY', this.w / 2, 62);
    this._ambient('HOT STANDBY');

    // AZ-a(停止) / AZ-c(起動中)
    const boxW = 150;
    const boxH = 70;
    const y = 84;
    const azs = [
      { label: 'AZ-a', ok: false, x: this.w / 2 - boxW - 12 },
      { label: 'AZ-c', ok: true, x: this.w / 2 + 12 },
    ];
    for (const az of azs) {
      roundRect(ctx, az.x, y, boxW, boxH, 8);
      ctx.fillStyle = az.ok ? 'rgba(60,200,140,0.18)' : 'rgba(220,60,60,0.18)';
      ctx.fill();
      ctx.strokeStyle = az.ok ? 'rgba(90,240,170,0.9)' : 'rgba(255,90,90,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 15px ${FONT}`;
      ctx.fillText(az.label, az.x + boxW / 2, y + 24);
      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = az.ok ? '#9cf5cd' : '#ff9a9a';
      ctx.fillText(az.ok ? 'STANDBY' : 'DOWN', az.x + boxW / 2, y + 48);
    }

    // 復旧ゲージ
    const gx = 50;
    const gw = this.w - 100;
    const gy = 182;
    roundRect(ctx, gx, gy, gw, 18, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fill();
    const p = Math.max(0, Math.min(1, state?.gauge ?? 0));
    if (p > 0) {
      ctx.save();
      roundRect(ctx, gx, gy, gw, 18, 9);
      ctx.clip();
      const g = ctx.createLinearGradient(gx, 0, gx + gw, 0);
      g.addColorStop(0, '#ffd166');
      g.addColorStop(1, '#4ce0a0');
      ctx.fillStyle = g;
      ctx.fillRect(gx, gy, gw * p, 18);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, gx, gy, gw, 18, 9);
    ctx.stroke();

    if (!textActive) {
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      // ホットスタンバイは「待機系が既に稼働中」の構成なので、
      // 出すのは起動待ちではなく切替の進捗(ヘルスチェック→昇格→接続切替)。
      // フェーズ名はゲーム側(game/modes/recovery.js)が state.phase / phaseText で渡す。
      const phase = state?.phase ? `${state.phase} — ` : '';
      ctx.fillText(`${phase}切替進捗 ${Math.round(p * 100)}%`, this.w / 2, gy + 34);
      if (state?.phaseText) {
        ctx.font = `600 11px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(state.phaseText, this.w / 2, gy + 52);
      }
    }
    /*
     * 引き戻し層の目的(U66-5 の移行先)。
     * 「切り替えきれば復帰、間に合わなければ通常時へ」は入場から出るまで変わらない
     * 持続情報だが、旧実装ではゲーム側の入場テロップ(recovery.js)にしか出ておらず、
     * 帯を畳むと **何を待っている画面なのかが読めなく** なるためここで引き取る。
     */
    this._drawRuleLine(ctx, '切替が完了すれば復旧のボーナス — RTO 超過で通常運転へ', {
      color: '#ffd166',
    });
  }

  // ── Phase 5: 引き戻し最終防衛 ─────────────────

  /** M19. Route 53 フェイルオーバー: TTLカウントダウン */
  _drawRoute53(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 20px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ff9a9a';
    ctx.fillText('DNS FAILOVER', this.w / 2, 58);
    this._ambient('DNS FAILOVER');

    // TTL の残り秒(ドン、と大きく)
    const ttl = state?.ttl ?? 0;
    const pulse = 1 + Math.sin(this.t * 8) * 0.05;
    ctx.save();
    ctx.translate(this.w / 2, 130);
    ctx.scale(pulse, pulse);
    ctx.font = `900 60px ${FONT_HEAVY}`;
    ctx.lineWidth = 9;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(40,0,0,0.85)';
    ctx.strokeText(`TTL ${ttl}`, 0, 0);
    ctx.fillStyle = ttl <= 0 ? '#ffe066' : '#ff6b6b';
    ctx.fillText(`TTL ${ttl}`, 0, 0);
    ctx.restore();

    // 切替先レコード
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('primary … UNHEALTHY  →  secondary へ切替中', this.w / 2, 178);
    this._drawGauge(ctx, 60, 194, this.w - 120, 12,
      1 - (state?.remaining ?? 0) / (state?.total ?? 3), ['#ff6b6b', '#ffe066']);

    if (!textActive) {
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('伝播しきれば RUSH 復帰', this.w / 2, 224);
    }
  }

  // ── Phase 5: 派生ゾーン ──────────────────────

  /** M11. Spot インスタンスゾーン */
  _drawSpot(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `900 30px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffb46a';
    ctx.fillText('SPOT ZONE', this.w / 2, 62);
    this._ambient('SPOT ZONE');
    // payoutPerGame は「純増」(flow.js が BET + payoutPerGame を払い出す)なので表記はこのままでよい。
    // 食い違っていたのはゾーン側のテロップ(game/modes/zones.js)の直書きだった。
    const spotPay = state?.payoutPerGame ?? ZONE_SPEC_BY_ID.SPOT_ZONE.payoutPerGame;
    ctx.font = `900 22px ${FONT_HEAVY}`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(10,8,20,0.9)';
    ctx.strokeText(`純増 ${spotPay} 枚/G`, this.w / 2, 96);
    ctx.fillStyle = '#ffd75e';
    ctx.fillText(`純増 ${spotPay} 枚/G`, this.w / 2, 96);

    ctx.font = `900 26px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`${state?.games ?? 0} G  /  +${Math.floor(state?.gained ?? 0)} 枚`, this.w / 2, 132);

    /*
     * 中断通知(2分前通知のメタファー)。
     *
     * 2026-08-14 しおん指摘 S10 の退避ルール:
     * 演出テキスト帯は液晶中央下(y≒155〜235)に出るので、
     * 帯が出ている間はこの警告板を上へ逃がす。
     * 「あと何G で終わるか」は消してはいけない情報なので、薄くせず位置で避ける。
     */
    if (state?.notice) {
      const left = Math.max(0, (state.endAt ?? 0) - (state.games ?? 0));
      const blink = Math.sin(this.t * 12) > 0 ? 1 : 0.35;
      ctx.save();
      ctx.globalAlpha = blink;
      if (textActive) {
        // 帯の下に隠すくらいなら、タイトルバー右の空きへ小さく逃がす
        ctx.textAlign = 'right';
        ctx.font = `900 13px ${FONT_HEAVY}`;
        ctx.fillStyle = '#ff8a8a';
        ctx.fillText(`⚠ INTERRUPTION T-${left}`, this.w - 14, 17);
      } else {
        roundRect(ctx, 60, 156, this.w - 120, 44, 8);
        ctx.fillStyle = 'rgba(180,20,20,0.55)';
        ctx.fill();
        ctx.strokeStyle = '#ff5a5a';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 15px ${FONT_HEAVY}`;
        ctx.fillText(`INTERRUPTION NOTICE  T-${left}`, this.w / 2, 178);
      }
      ctx.restore();
    } else if (!textActive) {
      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      const minG = state?.minGames ?? ZONE_SPEC_BY_ID.SPOT_ZONE.minGames;
      ctx.fillText(`最低 ${minG}G 保証 — サメが来たら終わり`, this.w / 2, 176);
    }
  }

  /** M12. EC2 バーストモード: CPUクレジット残高を常時表示 */
  _drawBurst(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 26px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffc04a';
    ctx.fillText('EC2 BURST', this.w / 2, 58);
    this._ambient('EC2 BURST');

    const spec = ZONE_SPEC_BY_ID.EC2_BURST;
    const credit = Math.max(0, state?.credit ?? 0);
    const max = state?.creditMax ?? spec.creditMax;
    const low = credit <= 20;

    ctx.font = `900 48px ${FONT_HEAVY}`;
    ctx.fillStyle = low ? '#ff6b6b' : '#ffe066';
    if (low) { ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 18 * (0.5 + 0.5 * Math.sin(this.t * 10)); }
    ctx.fillText(String(Math.ceil(credit)), this.w / 2, 108);
    ctx.shadowBlur = 0;
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('CPU CREDIT', this.w / 2, 138);

    this._drawGauge(ctx, 60, 156, this.w - 120, 16, credit / max,
      low ? ['#ff3b30', '#ff8a00'] : ['#ffa400', '#ffe066']);

    ctx.font = `900 17px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${state?.games ?? 0} G  /  +${Math.floor(state?.gained ?? 0)} 枚`, this.w / 2, 196);
    if (!textActive) {
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      // 消費量はデータ定義から取る(直書きの -4 は spec の -5 と食い違っていた)
      const cost = Math.abs(state?.creditPerGame ?? spec.creditPerGame);
      ctx.fillText(`毎G -${cost} / レア役で回復。0で終了`, this.w / 2, 218);
    }
  }

  /** M13. Graviton モード */
  _drawGraviton(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 26px ${FONT_HEAVY}`;
    ctx.fillStyle = '#8fe6f5';
    ctx.fillText('GRAVITON', this.w / 2, 60);
    this._ambient('GRAVITON');

    // ARMコアのイメージ(静かに脈打つ格子)
    const cx = this.w / 2;
    const cy = 128;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = cx - 54 + j * 30;
        const y = cy - 30 + i * 20;
        const a = 0.25 + 0.25 * Math.sin(this.t * 2 + i + j);
        ctx.fillStyle = `rgba(143,230,245,${a})`;
        roundRect(ctx, x, y, 22, 12, 3);
        ctx.fill();
      }
    }

    // 純増・継続率はデータ定義から(直書きの「継続 90%」は spec の 72% と食い違っていた)
    const gvSpec = ZONE_SPEC_BY_ID.GRAVITON;
    const gvLabel = `純増 ${state?.payoutPerGame ?? gvSpec.payoutPerGame} 枚/G`
      + `   継続 ${Math.round(gvSpec.continueRate * 100)}%`;
    ctx.font = `700 13px ${FONT}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(10,8,20,0.9)';
    ctx.strokeText(gvLabel, this.w / 2, 178);
    ctx.fillStyle = '#ffd75e';
    ctx.fillText(gvLabel, this.w / 2, 178);
    ctx.font = `900 18px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`SET ${state?.setCount ?? 1}   +${Math.floor(state?.gained ?? 0)} 枚`, this.w / 2, 204);
    if (!textActive) {
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('ARM は静かに強い', this.w / 2, 226);
    }
  }

  /** M14. Reserved Instance ゾーン */
  _drawReserved(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 契約書
    roundRect(ctx, 120, 52, this.w - 240, 118, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.strokeStyle = '#6a52c8';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#2a1f52';
    ctx.font = `900 18px ${FONT_HEAVY}`;
    ctx.fillText('RESERVED INSTANCE', this.w / 2, 76);
    this._ambient('RESERVED INSTANCE');
    ctx.font = `900 26px ${FONT_HEAVY}`;
    ctx.fillStyle = state?.contract === '3year' ? '#c02090' : '#2a1f52';
    ctx.fillText(state?.contractLabel ?? '1年契約', this.w / 2, 108);
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = 'rgba(40,30,80,0.75)';
    ctx.fillText(
      `ヘルスチェック免除 ${state?.total ?? ZONE_SPEC_BY_ID.RESERVED.guaranteeGames['1year']} G`,
      this.w / 2, 138,
    );
    // サイン
    ctx.strokeStyle = 'rgba(40,30,80,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(160, 156);
    ctx.bezierCurveTo(200, 142, 230, 168, 280, 150);
    ctx.stroke();

    ctx.font = `900 18px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`残り ${state?.remaining ?? 0} G   +${Math.floor(state?.gained ?? 0)} 枚`, this.w / 2, 196);
    if (!textActive) {
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('前払いすれば安くなるし、止まらない', this.w / 2, 220);
    }
  }

  // ── Phase 5: 上乗せ特化 ──────────────────────

  /** M15. CloudFront エッジ上乗せ */
  _drawCloudFront(ctx, state, textActive = false) {
    const cx = this.w / 2;
    const cy = 124;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // エッジロケーションのリング → 中央のオリジンへ飛んでくる
    ctx.save();
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + this.t * 0.3;
      const x = cx + Math.cos(ang) * 96;
      const y = cy + Math.sin(ang) * 52;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(140,190,255,0.85)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,190,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(cx, cy);
      ctx.stroke();
    }
    ctx.restore();

    // オリジン
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(79,123,240,0.9)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 12px ${FONT_HEAVY}`;
    ctx.fillText('ORIGIN', cx, cy);

    ctx.font = `700 13px ${FONT}`;
    ctx.fillStyle = '#bcd4ff';
    ctx.fillText(state?.lastEdge ? `${state.lastEdge} ▸ Cache HIT` : 'エッジ配信中…', cx, 186);
    /**
     * 上乗せの単位は「枚」(2026-08-14 しおん指摘 S2)。
     * スコアアタック化でセット上乗せ → 枚数上乗せへ変わったのに、
     * ここだけ存在しない state.added を読んでいたため常に「+0 SET」だった。
     */
    ctx.font = `900 24px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`+${Math.floor(state?.addedCoins ?? 0)} 枚`, cx, 214);
    if (!textActive && state?.lastAdd > 0) {
      ctx.font = `900 15px ${FONT_HEAVY}`;
      ctx.fillStyle = '#7bf7d0';
      ctx.fillText(`今回 +${state.lastAdd} 枚`, cx, 236);
    }
  }

  /** M16. Kinesis 上乗せストリーム */
  _drawKinesis(ctx, state, textActive = false) {
    const shards = state?.shards ?? 1;
    const records = state?.records ?? [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `900 20px ${FONT_HEAVY}`;
    ctx.fillStyle = '#6ee0f5';
    ctx.fillText(`SHARDS × ${shards}`, this.w / 2, 54);

    // シャードのレーン。処理済みのレーンには上乗せレコードが乗る
    const laneH = Math.min(20, 130 / Math.max(1, shards));
    const top = 74;
    for (let i = 0; i < shards; i++) {
      const y = top + i * (laneH + 3);
      roundRect(ctx, 46, y, this.w - 92, laneH, laneH / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
      const done = i < records.length;
      if (done) {
        const p = Math.min(1, (records.length - i) / 1.2);
        ctx.save();
        roundRect(ctx, 46, y, (this.w - 92) * p, laneH, laneH / 2);
        ctx.fillStyle = 'rgba(24,176,200,0.75)';
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${Math.max(9, laneH - 8)}px ${FONT_HEAVY}`;
        // レコード1本ぶんの上乗せは枚数(セットではない)
        ctx.fillText(`+${records[i]} 枚`, this.w / 2, y + laneH / 2);
      } else {
        // 未処理レーンを流れるデータ粒
        const x = 50 + ((this.t * 120 + i * 40) % (this.w - 100));
        ctx.fillStyle = 'rgba(140,230,255,0.8)';
        ctx.fillRect(x, y + laneH / 2 - 1.5, 14, 3);
      }
    }

    /**
     * 合計は枚数。母体ATへ +1セット付いた場合(最上位レコード)だけ SET も併記する。
     * 演出テキスト帯(y≒164〜224)と重なる位置なので、帯が出ている間は伏せる
     * (2026-08-14 しおん指摘 S10「RAINBOW の黒帯が合計表示に重なる」)。
     */
    if (!textActive) {
      const sets = state?.addedSets ?? 0;
      ctx.font = `900 22px ${FONT_HEAVY}`;
      ctx.fillStyle = '#ffe066';
      ctx.fillText(
        `合計 +${Math.floor(state?.addedCoins ?? 0)} 枚${sets > 0 ? ` & +${sets} SET` : ''}`,
        this.w / 2, 224,
      );
    }
  }

  /** M17. Step Functions チャレンジ(プレイヤー分岐選択) */
  _drawStepFunctions(ctx, state, textActive = false) {
    const total = state?.total ?? 8;
    const idx = state?.stateIndex ?? 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ステートマシンの進捗(丸と矢印)
    const startX = 42;
    const endX = this.w - 42;
    const y = 62;
    const step = (endX - startX) / (total - 1);
    for (let i = 0; i < total; i++) {
      const x = startX + i * step;
      if (i > 0) {
        ctx.strokeStyle = i <= idx ? '#7bf7d0' : 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - step + 11, y);
        ctx.lineTo(x - 11, y);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      if (i < idx) { ctx.fillStyle = '#7bf7d0'; }
      else if (i === idx) { ctx.fillStyle = `rgba(255,224,102,${0.55 + 0.45 * Math.sin(this.t * 8)})`; }
      else { ctx.fillStyle = 'rgba(255,255,255,0.14)'; }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    /**
     * 報酬表示(2026-08-14 しおん指摘 S2 → 同日 U11 の読み替えへ追従)。
     *
     * このゾーンの報酬は **母体RUSHのゲーム数上乗せ**。
     * U11 で「DC(純増段階)+1」→「EC2 の台数 = 残りゲーム数 +1」へ意味が変わったので、
     * 画面も "DC +n" ではなく "母体に +nG" と書く(game/modes/zones.js の rewardLabel と同じ言い方)。
     * ゲーム数が軸でない母体(CloudFront / ヒーロー / 上位AT)では枚数で代替される。
     */
    const reward = (state?.dcGained ?? 0) > 0
      ? `母体に +${state.dcGained}G`
      : `+${Math.floor(state?.addedCoins ?? 0)} 枚`;
    ctx.font = `700 11px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`${idx} / ${total} States   (${reward})`, this.w / 2, 88);

    // Choice State の選択肢(左=A / 右=D)
    const pair = state?.choicePair ?? ['A', 'B'];
    const boxW = 150;
    const boxH = 60;
    const by = 116;
    [0, 1].forEach((i) => {
      const x = i === 0 ? this.w / 2 - boxW - 12 : this.w / 2 + 12;
      const active = Boolean(state?.awaitChoice);
      roundRect(ctx, x, by, boxW, boxH, 10);
      ctx.fillStyle = active ? 'rgba(90,90,208,0.45)' : 'rgba(255,255,255,0.07)';
      ctx.fill();
      ctx.strokeStyle = active
        ? `rgba(255,224,102,${0.55 + 0.45 * Math.sin(this.t * 6 + i * 1.6)})`
        : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.fillStyle = active ? '#ffffff' : 'rgba(255,255,255,0.45)';
      ctx.font = `900 18px ${FONT_HEAVY}`;
      ctx.fillText(pair[i], x + boxW / 2, by + 24);
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = active ? '#ffe066' : 'rgba(255,255,255,0.35)';
      ctx.fillText(i === 0 ? '左ボタン (A)' : '右ボタン (D)', x + boxW / 2, by + 45);
    });

    ctx.font = `700 13px ${FONT}`;
    if (state?.awaitChoice) {
      ctx.fillStyle = '#ffe066';
      ctx.fillText('分岐を選べ', this.w / 2, 196);
    } else if (state?.lastResult) {
      ctx.fillStyle = state.lastResult === 'SUCCEEDED' ? '#7bf7d0' : '#ff6b6b';
      ctx.fillText(`${state.lastChoice ?? ''} : ${state.lastResult}`, this.w / 2, 196);
    }
    if (!textActive) {
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('Success State 到達で MULTI-REGION', this.w / 2, 218);
    }
  }

  // ── Phase 5: 上位AT ─────────────────────────

  /** M09. Serverless RUSH */
  _drawServerless(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // λ を大きく
    ctx.save();
    ctx.font = `900 92px ${FONT_HEAVY}`;
    ctx.globalAlpha = 0.16 + 0.06 * Math.sin(this.t * 3);
    ctx.fillStyle = '#ffb46a';
    ctx.fillText('λ', this.w / 2, 120);
    ctx.restore();

    ctx.font = `900 26px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffb46a';
    ctx.fillText('SERVERLESS RUSH', this.w / 2, 62);
    this._ambient('SERVERLESS RUSH');

    ctx.font = `900 30px ${FONT_HEAVY}`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(10,8,20,0.9)';
    ctx.strokeText(`純増 ${state?.payoutPerGame ?? 4} 枚/G`, this.w / 2, 118);
    ctx.fillStyle = '#ffd75e';
    ctx.fillText(`純増 ${state?.payoutPerGame ?? 4} 枚/G`, this.w / 2, 118);
    if (!textActive) {
      ctx.font = `700 14px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(`継続 ${Math.round((state?.continueRate ?? 0.8) * 100)}% 固定 — DC管理から解放`, this.w / 2, 150);
    }

    ctx.textAlign = 'right';
    ctx.font = `900 19px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`SET ${state?.setCount ?? 1}`, this.w - 18, 178);
    ctx.fillText(`+${Math.floor(state?.gained ?? 0)} 枚`, this.w - 18, 204);
    ctx.textAlign = 'center';
    this._drawStock(ctx, state, this.w - 18, 228);
  }

  /** M10. Multi-Region アクティブ・アクティブ(世界地図のリージョン点灯) */
  _drawMultiRegion(ctx, state, textActive = false) {
    const regions = state?.regions ?? [];
    const lit = state?.lit ?? 1;
    // 液晶内の相対座標に置いた簡易世界地図
    const POS = [
      [0.78, 0.42], [0.24, 0.38], [0.48, 0.32], [0.74, 0.62],
      [0.30, 0.72], [0.14, 0.42], [0.51, 0.28], [0.68, 0.52],
    ];

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 経緯線
    ctx.save();
    ctx.strokeStyle = 'rgba(150,190,255,0.14)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 40 + i * 32);
      ctx.lineTo(this.w, 40 + i * 32);
      ctx.stroke();
    }
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * (this.w / 8), 40);
      ctx.lineTo(i * (this.w / 8), 232);
      ctx.stroke();
    }
    ctx.restore();

    POS.forEach(([rx, ry], i) => {
      const x = rx * this.w;
      const y = 40 + ry * 190;
      const on = i < lit;
      if (on) {
        const pulse = 1 + Math.sin(this.t * 4 + i) * 0.25;
        const g = ctx.createRadialGradient(x, y, 1, x, y, 18 * pulse);
        g.addColorStop(0, 'rgba(255,180,255,0.95)');
        g.addColorStop(1, 'rgba(160,60,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 18 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#ffffff' : 'rgba(255,255,255,0.22)';
      ctx.fill();
      if (on && regions[i]) {
        // U39: リージョン名が 8px で読めなかったので 10px へ(点の間隔は50px以上あるので重ならない)
        ctx.font = `700 10px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(regions[i], x, y + 14);
      }
    });

    ctx.font = `900 20px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ff9ad5';
    ctx.fillText(`ACTIVE / ACTIVE   ${lit} REGIONS`, this.w / 2, 52);
    this._ambient('ACTIVE / ACTIVE');

    ctx.textAlign = 'right';
    ctx.font = `900 18px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`SET ${state?.setCount ?? 1}  +${Math.floor(state?.gained ?? 0)} 枚`, this.w - 16, 240);
    ctx.textAlign = 'center';
    this._drawStock(ctx, state, this.w - 16, 220);
  }

  // ── Phase 5: エンディング ────────────────────

  /** M20. re:Invent キーノート */
  _drawEnding(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // キーノートのステージ(スポットライト)
    ctx.save();
    const g = ctx.createRadialGradient(this.w / 2, 40, 10, this.w / 2, 40, 240);
    g.addColorStop(0, 'rgba(255,120,220,0.35)');
    g.addColorStop(1, 'rgba(255,120,220,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();

    ctx.font = `900 24px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('re:Invent KEYNOTE', this.w / 2, 56);
    this._ambient('re:Invent KEYNOTE');

    // 発表された新サービス(獲得枚数の言い換え)
    const list = state?.announced ?? [];
    ctx.font = `700 12px ${FONT}`;
    list.slice(-5).forEach((name, i) => {
      ctx.fillStyle = `rgba(255,255,255,${0.45 + i * 0.12})`;
      ctx.fillText(`Introducing… ${name}`, this.w / 2, 86 + i * 20);
    });

    ctx.font = `900 34px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`${list.length} NEW SERVICES`, this.w / 2, 196);
    if (!textActive) {
      ctx.font = `700 13px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(`完走 +${Math.floor(state?.gained ?? 0)} 枚 / 残り ${state?.remaining ?? 0} G`, this.w / 2, 224);
    }
  }
}
