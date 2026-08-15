/**
 * 筐体・電飾の制御(DOM操作 + 筐体アートのCanvas描画)。DESIGN.md 5.3 (z=0,1,3,7)
 *
 * 状態に応じた class の付け替えに加えて、assets/ui/cabinet2.png などの
 * 筐体アートを #cabinet-art キャンバスへ合成する。
 * 使う絵は CABINET_ARTS の先頭から「読めたもの」を採用する
 * (cabinet2.png → cabinet.png → どちらも無ければ style.css の
 * グラデーション筐体。絵柄PNGと同じフォールバックの流儀)。
 */

import { uiAssets, loadUiAssets } from '../engine/assets.js';
import { setLayerViews } from '../engine/layers.js';
import { isRushMode } from '../data/rushes.js';

/** 角丸矩形パス(ctx.roundRect が無い環境でも動くように自前で持つ) */
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

/** 電飾パターン。style.css の .lamps[data-pattern] と対応 */
export const LAMP_PATTERNS = {
  IDLE: 'idle',
  SPIN: 'spin',
  RARE: 'rare',
  BONUS: 'bonus',
  RUSH: 'rush',
};

/** 論理解像度(engine/layers.js の LOGICAL_W / LOGICAL_H と一致させること) */
const LOGICAL_W = 720;
const LOGICAL_H = 1080;

/**
 * cabinet.png(1024×1536)を論理720×1080へ載せるための縦方向バンド表。
 * [srcY0, srcY1, dstY0, dstY1]
 *
 * 横方向は 720/1024 の等倍。縦だけ帯ごとに伸縮させているのは、
 * 元絵の「窓」の位置と engine/layers.js の LAYER_DEFS(液晶/リール/HUDの
 * Canvas位置)がそのままでは一致しないため。
 *
 * 窓の中身は真っ黒で Canvas に隠れるので、窓の帯を伸ばしても見た目には出ない。
 * 逆に「絵として見える部分」(冠・操作パネル・下部くぼみ)は
 *   - 操作パネル(920..1045): 等倍 0.704 を厳守。ボタンや球が歪むと一発で分かるため
 *   - 冠(30..129): わずかに詰める。上端30pxはビューポート外へ逃がす
 *   - 下部くぼみ(1045..1390): 平坦なので詰めても分からない。BIG BONUSパネルで隠れる
 * という優先順位で配分してある。
 */
const CABINET_BANDS = [
  [30, 129, 0, 58],        // 冠(上部の宝石・スピーカー)
  [129, 463, 58, 368],     // 液晶窓        → Canvas #lcd  (140,60,440,300)
  [463, 569, 368, 433],    // 液晶〜リール間(ロゴ帯を置く)
  [569, 779, 433, 621],    // リール窓      → Canvas #reels(180,440,360,180)
  [779, 803, 621, 627],    // リール窓とHUD窓の仕切り
  [803, 863, 627, 693],    // HUD窓         → Canvas #hud  (180,630,360,60)
  [863, 920, 693, 723],    // HUD下の紫面
  [920, 1045, 723, 811],   // 操作パネル(等倍。レバー/停止ボタン/MAXBETの絵がある)
  [1045, 1390, 811, 1010], // 下部くぼみ(BIG BONUSパネル)
  [1390, 1536, 1010, 1080],// 台座
];

/**
 * cabinet2.png(1086×1448)用のバンド表。
 *
 * 新しい絵は
 *   - 上部にJAWSLOTのネオンタイトルが描き込み済み(logo_band は使わない)
 *   - 下部の回路パネルも描き込み済み(bottom_panel も使わない)
 *   - リール窓が独立3窓、レバーは右側
 * という構成。横は 0.76倍の等倍(src x=541 が論理x=360)で載せている。
 * 0.76 は「リール窓の開口(src 307..775)が論理360pxに合う」ことと
 * 「レバー球の右端(src x=1012)が論理720に収まる」ことの両立点。
 *
 * 縦のバンドは **絵の窓の縦横比を Canvas の論理比に合わせる** ために使う。
 * Canvas 側は setLayerViews() で窓へぴったり載せるので、窓の比が
 * 論理比(液晶 440:300 / リール 360:180)と一致していれば表示は無歪みになる。
 * 逆算すると
 *   液晶窓: 幅500.1 → 高さ341 が要る → 縦0.808(元絵の液晶は横長なので縦に詰める)
 *   リール窓: 幅355.7 → 高さ177.8 が要る → 縦0.823
 * 伸縮する帯はどちらも「Canvasで隠れる窓の中」と「側面のLED帯・ベゼル」なので、
 * サメ・レバー球・MAX BET・赤ボタン・下部パネルは全部 0.76 の等倍のまま。
 *
 * 2026-08-13 修正: 以前は冠の上端が論理y=-26.4から始まっており、
 * 上端26.4px分がCanvas(0〜1080)の外に出て頭が切れて見えていた
 * (ユーザー指摘「PC版、上がちょっと欠けている」)。「縮小」ではなく
 * **帯配分の再調整**で直している。冠(等倍0.76・タイトルが歪むため不可)と
 * 操作デッキ(等倍0.76・レバーやボタンが歪むため不可)はスケールも開始位置も
 * 変えられないので、冠を論理y=0から丸ごと表示させ、それ以降の帯(液晶窓/
 * 金属帯/リール窓/操作デッキ)は**スケールそのまま+26.4pxだけ下へ平行移動**。
 * 移動でできた末尾のズレは、平坦で装飾がなく「詰めても分からない」台座帯
 * (縦倍率 0.660→0.493)だけに吸収させている。窓の比や操作系の幾何(横方向の
 * 座標・各帯の高さ)は一切変わらないので、Canvasの表示比(液晶/リールとも
 * 誤差0.00%を維持)やボタン・レバーの見た目は従来と同一、位置だけ全体が
 * 26.4px下にずれる。連動して動く座標は
 *   - Canvas窓(setLayerViews): _dstY() がこの表を参照するので自動追従
 *   - DOMヒットエリア(style.css の #cabinet.art-cabinet2 各 top 値): 手動で
 *     +26.4pxしてある(台座帯には操作系が無いので対象外)
 * 詳細は assets/ui/README.md の座組み表を参照。
 *
 * 2026-08-14 再キャリブレーション(SUMMIT / INVENT METER 入りの正アートへ差し替え):
 * 絵をピクセル走査で測り直したところ、**リールと操作デッキは元絵の座標が
 * 1px も動いていなかった**。
 *   リール開口 x307.5..774.5 / y659.5..869.5(3窓の内訳は
 *              R1 307.5..443.5 / R2 473.5..609.5 / R3 639..774.5)
 *   デッキの黒い凹み y888..965
 *   停止ボタン中心 src(437.5, 1025.5) (539.5, 1025.5) (640.5, 1025.5)
 *   MAX BET のキャップ x295..380 / y905..950、右レバー球 中心≒(985, 875)、
 *   左の黒球ノブ 中心≒(230, 1022)、下部の波パネル x150..930 / y1070..1290
 * つまりリール帯以降の帯と style.css の DOM ヒットエリアは変更不要。
 *
 * 変わったのは液晶の開口だけで、**x216..872 / y176..580**(前アートは
 * y169..592 まで絵が続いていた)。下端が12px上がり上端が7px下がっている。
 * 液晶帯だけを開口に合わせて引き直し、リール帯の始まり dst=506.64 は据え置いた。
 * 新しい配分は
 *   - 冠帯を [30,170]→[30,174] へ伸ばす(縦倍率は 0.76 の等倍のまま。
 *     JAWSLOTタイトルの歪みも上端の見切れも起きない)
 *   - 液晶帯を **液晶窓とまったく同じ src[174,582] で切る**。こうすると
 *     窓の表示矩形 = 帯の表示矩形になり、比の計算が一段で済む
 *     (幅 660×0.76=501.6 に対し高さ342.0 → 501.6:342.0 = 440:300 で誤差0)
 *   - はみ出した分は金属帯(液晶下のベゼルと水平の梁だけ)が吸収する。
 *     縦倍率 0.746 は等倍0.76とほぼ同じなので、むしろ前より素直になった
 * 結果、下流(リール窓・操作デッキ・台座)の dst は据え置きのまま、
 * 液晶だけが正しい開口へ収まる。side LED帯(style.css の .lamp top:110.4px)も
 * 逆算すると src y≒175 で従来と同じ位置を指すので追従不要。
 */
const CABINET2_BANDS = [
  [30, 174, 0, 109.44],          // 冠 + JAWSLOTタイトル(等倍0.76。全体を表示)
  [174, 582, 109.44, 451.44],    // 液晶窓 → Canvas #lcd(縦0.8382。帯=窓)
  [582, 656, 451.44, 506.64],    // 液晶とリールの間の金属帯(縦0.746)
  [656, 872, 506.64, 684.48],    // リール窓 → Canvas #reels(縦0.823)
  [872, 1290, 684.48, 1002.16],  // 操作デッキ + 下部の波パネル(等倍0.76)
  [1290, 1448, 1002.16, 1080],   // 台座(平坦なので詰める。縦倍率0.493まで圧縮)
];

/**
 * cabinet2.png の窓(元絵の実測px)。ここへ Canvas を載せる。
 * reelfx は reels と同じ矩形。
 *
 * HUD は操作デッキの「黒い凹み(データ表示窓)」に載せる。
 * 液晶とリールの間の金属帯にも同じ比で入るが、そこへ置くと液晶の黒と
 * つながって1枚の大きな黒面に見え、リール窓の上枠が消えてしまう。
 * デッキの凹みなら実機のクレジット表示と同じ位置関係になる。
 * 高さは 360:60 の比になるよう凹みの上下へわずかにはみ出させている。
 *
 * 2026-08-14 再キャリブレーションの実測値(SUMMIT / INVENT METER 入りの正アート):
 *   液晶  開口 x216..872 / y176..580 → 窓は x214..874 / y174..582
 *         (開口の2px外側。そこは元絵でも黒縁なので、はみ出しても黒が黒になるだけ。
 *          逆に開口より内側に取ると端数の丸めでサメの絵が1px覗く)
 *   リール開口 x307.5..774.5 / y659.5..869.5 → 窓は x307..775 / y656..872
 *         (前アートから 0px 変わっていないので据え置き)
 *   HUD   デッキの黒い凹み y888..965 の内側(こちらも位置は据え置き)
 *
 * リール窓の左右にある **SUMMITパネル(x150..295)と INVENT METER(x810..900)** は
 * 窓 x307..775 の外なので Canvas に隠れない。HUD窓(x405..775 / y900.5..962.2)も
 * 両パネルの下端 y≒890 より下なので干渉しない。
 */
const CABINET2_WINDOWS = {
  lcd:   { x0: 214, y0: 174,   x1: 874, y1: 582 },
  reels: { x0: 307, y0: 656,   x1: 775, y1: 872 },
  hud:   { x0: 405, y0: 900.5, x1: 775, y1: 962.2 },
};

/**
 * cabinet2.png のグリーンバック(緑一色の背景)を抜くためのしきい値。
 *
 * 2026-08-14 に差し替わった新アートは筐体の周りが緑一色になっている。
 * そのまま論理720×1080へ載せると、筐体の左右(論理x 0..35 と 718..720)と
 * 足元・レバーの隙間に緑が出てしまうので、読み込み後に一度だけ走査して
 * 緑を透明化する(下に敷いてある body の暗い背景がそのまま見える)。
 *
 * 判定は「緑度 = G - max(R, B)」。紫・オレンジ・クロムでできた筐体には
 * 緑度が正の画素がほとんど無いので、単純なしきい値で狙い撃ちできる。
 *   hard 以上         → 完全に透明
 *   soft 〜 hard      → 緑の混ざり具合に応じて半透明(輪郭のアンチエイリアス)
 *   minG 未満(暗い)  → 触らない(黒い影は筐体側なので残す)
 * 半透明にした画素は G を max(R,B)+spill で頭打ちにして、緑かぶり(スピル)で
 * 輪郭が緑くにじむのを防ぐ。
 *
 * keep は「元絵の緑を残す矩形」の配列。走査そのものを飛ばすので、
 * レバーと筐体の隙間のような「背景とつながっていない緑」まで抜ける代わりに、
 * 絵として描かれた緑は明示的に守る必要がある。守っているのは2か所:
 *   1. 液晶(サメの周りの緑のAWSアイコン)。矩形は液晶窓そのものを使う
 *   2. INVENT METER の緑セグメント(実測 x838..879 / y857..879。
 *      アンチエイリアスまで含めると x838..880 / y841..881)。
 *      2026-08-14 のアート差し替えで新しく増えた緑で、守らないと
 *      メーターの下3目盛りが四角く抜け落ちる
 * 逆に keep 矩形の中に「抜きたい背景の緑」が入らないことも確認済み
 * (どちらの矩形も筐体の内側で、背景の緑とは接していない)。
 */
const CABINET2_CHROMA = {
  hard: 40,
  soft: 6,
  minG: 12,
  spill: 6,
  keep: [
    CABINET2_WINDOWS.lcd,
    { x0: 832, y0: 836, x1: 886, y1: 886 },
  ],
};

/**
 * グリーンバックの緑を透明にする(ImageData を直接書き換える)。
 * @param {ImageData} image
 * @param {typeof CABINET2_CHROMA} opt
 * @returns {number} 完全に透明化した画素数(緑背景でなければ 0 近くになる)
 */
function keyOutGreen(image, opt) {
  const { width: w, height: h, data: px } = image;
  // keep は矩形1つでも配列でも受ける(将来また守る場所が増えたとき用)
  const keeps = !opt.keep ? [] : Array.isArray(opt.keep) ? opt.keep : [opt.keep];
  const span = Math.max(1, opt.hard - opt.soft);
  /** この行に掛かる keep 矩形だけを入れておく作業用配列(毎行使い回す) */
  const rowKeeps = [];
  let cleared = 0;
  for (let y = 0; y < h; y++) {
    rowKeeps.length = 0;
    for (const k of keeps) if (y >= k.y0 && y < k.y1) rowKeeps.push(k);
    for (let x = 0; x < w; x++) {
      let keep = false;
      for (const k of rowKeeps) {
        if (x >= k.x0 && x < k.x1) { keep = true; break; }
      }
      if (keep) continue;
      const o = (y * w + x) << 2;
      const g = px[o + 1];
      if (g < opt.minG) continue;
      const r = px[o];
      const b = px[o + 2];
      const max = r > b ? r : b;
      const green = g - max;
      if (green <= opt.soft) continue;
      if (green >= opt.hard) {
        px[o] = 0;
        px[o + 1] = 0;
        px[o + 2] = 0;
        px[o + 3] = 0;
        cleared++;
        continue;
      }
      const a = Math.round((255 * (opt.hard - green)) / span);
      if (a < px[o + 3]) px[o + 3] = a;
      const cap = max + opt.spill;
      if (g > cap) px[o + 1] = cap;
    }
  }
  return cleared;
}

/**
 * 筐体アートごとの座組み。
 * 優先順は cabinet2 → cabinet → CSSフォールバック(style.css のグラデーション筐体)。
 */
const CABINET_ARTS = [
  {
    id: 'cabinet2',
    className: 'art-cabinet2',
    srcW: 1086,
    scaleX: 0.76,
    anchorSrcX: 541,
    anchorDstX: 360,
    bands: CABINET2_BANDS,
    /** Canvas を載せる窓(元絵px)。setLayerViews() で表示矩形へ変換して渡す */
    windows: CABINET2_WINDOWS,
    /** 元絵に描かれた液晶(サメのアート)を黒で潰す。窓と同じ矩形 */
    screenSrc: CABINET2_WINDOWS.lcd,
    /** 背景がグリーンバックなので読み込み時に緑を抜く */
    chroma: CABINET2_CHROMA,
    overlays: [],
  },
  {
    id: 'cabinet',
    className: 'art-cabinet1',
    srcW: 1024,
    scaleX: 720 / 1024,
    anchorSrcX: 512,
    anchorDstX: 360,
    bands: CABINET_BANDS,
    // 旧筐体は engine/layers.js の既定位置に窓が合わせてあるので上書きしない
    windows: null,
    screenSrc: null,
    // 旧筐体は背景が暗紫の1枚絵なので抜かない
    chroma: null,
    // ロゴ帯(液晶とリールの間)と下部パネル(BIG BONUS)は別画像で重ねる
    overlays: [
      {
        id: 'logo_band',
        cls: 'art-logo',
        src: { x: 20, y: 56, w: 2125, h: 586 },
        rect: { x: 200, y: 356, w: 320, h: 88 },
      },
      {
        id: 'bottom_panel',
        cls: 'art-panel',
        src: { x: 0, y: 141, w: 1672, h: 614 },
        rect: { x: 100, y: 818, w: 520, h: 191 },
      },
    ],
  },
];

export class CabinetView {
  /** @param {HTMLElement} root 筐体ルート要素 */
  constructor(root) {
    this.root = root;
    this.lamps = root.querySelectorAll('.lamp');
    this.btnBet = root.querySelector('[data-action="BET"]');
    this.btnLever = root.querySelector('[data-action="LEVER"]');
    // 実機の流儀に合わせて左にもレバーを置く(絵の左側にある黒球のノブ)。
    // 右は絵にレバーが描かれているので押せるまま残す。
    this.btnLeverLeft = this._createLeftLever();
    /** レバーとして扱う要素(左が正、右は絵に合わせた補助) */
    this.leverEls = [this.btnLeverLeft, this.btnLever].filter(Boolean);
    this.btnStops = [0, 1, 2].map((i) => root.querySelector(`[data-action="STOP${i}"]`));
    this.telopEl = root.querySelector('#panel-telop');
    this._pattern = null;

    // デバッグ凡例は ?debug=1 のときだけ出す(既定は style.css で display:none)。
    // main.js を経由せずここで完結させておくと、起動直後の1フレームから正しく隠れる。
    this._applyDebugVisibility();

    /** @type {HTMLCanvasElement|null} */
    this.artCanvas = root.querySelector('#cabinet-art');
    this.artCtx = this.artCanvas?.getContext('2d') ?? null;
    this.artDpr = 0;
    /** @type {object|null} 使用中の筐体アート定義 */
    this.art = null;
    /** @type {CanvasImageSource|null} 実際に描く絵(グリーンバックを抜いた後のもの) */
    this.artImage = null;
    this._onResize = this._onResize.bind(this);

    this._initArt();
  }

  /**
   * 左側のスタートレバーを作る。
   *
   * index.html にあるレバーは cabinet2.png の絵に合わせて右側に置いてあるが、
   * 実機のレバーは左なので、操作デッキ左の黒球ノブへヒットエリアを追加する。
   * 位置は style.css(#cabinet.art-cabinet2 .lever-left)側で決める。
   *
   * 読み上げ・キーボード操作はこの左レバーを正とし、右は
   * aria-hidden + tabindex=-1 にして「絵に描かれているから押せる」だけの
   * 補助ヒットエリアに下げる(同じ操作が2つ読み上げられるのを防ぐ)。
   * @returns {HTMLElement|null}
   */
  _createLeftLever() {
    if (!this.btnLever) return null;
    const existing = this.root.querySelector('.lever-left');
    if (existing) return existing;

    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'lever lever-left';
    // data-action があれば engine/input.js のポインタ委譲がそのまま拾う
    el.dataset.action = 'LEVER';
    el.setAttribute(
      'aria-label',
      'スタートレバー。リールが回り出します。キーボードのスペースキーでも操作できます',
    );
    const span = document.createElement('span');
    span.className = 'lever-ball';
    el.append(span);
    (this.btnLever.parentElement ?? this.root).append(el);

    // 右側は補助へ降格(操作は同じ。説明とフォーカスは左に一本化する)
    this.btnLever.setAttribute('aria-hidden', 'true');
    this.btnLever.setAttribute('tabindex', '-1');
    return el;
  }

  /**
   * ?debug=1 のときだけデバッグ凡例を出す。
   * 実際の表示制御は style.css(.debug-bar / body.debug .debug-bar)側にあり、
   * ここは body へ目印のクラスを付けるだけ。
   */
  _applyDebugVisibility() {
    try {
      const debug = new URLSearchParams(location.search).get('debug') === '1';
      document.body.classList.toggle('debug', debug);
      // 初期表示を inline style にも書いておく。
      // Hキーの表示切替(main.js)は inline の display を読んで反転するので、
      // ここで実態と揃えておかないと1回目の押下が空振りする。
      const bar = document.getElementById('debug-bar');
      if (bar) bar.style.display = debug ? 'flex' : 'none';
    } catch {
      // location / document が無い環境(テスト等)では何もしない
    }
  }

  // ── 筐体アート ──────────────────────────────

  /**
   * UI画像を読み込んで筐体アートを描く。
   * 読み込み完了までは何もしない = style.css の現行筐体がそのまま見える。
   */
  _initArt() {
    if (!this.artCtx) return;
    loadUiAssets().then(() => {
      // 新しい筐体(cabinet2)があればそれを優先し、無ければ従来の cabinet を使う
      const art = CABINET_ARTS.find((a) => uiAssets.has(a.id));
      if (!art) return;
      this.art = art;
      this.artImage = this._prepareArtImage(art);
      this.root.classList.add('art-cabinet', art.className);
      for (const ov of art.overlays) {
        if (uiAssets.has(ov.id)) this.root.classList.add(ov.cls);
      }
      this._applyWindows();
      this.drawArt();
      window.addEventListener('resize', this._onResize);
      window.addEventListener('orientationchange', this._onResize);
    });
  }

  _onResize() {
    // DPRが変わったとき(別解像度のディスプレイへ移動など)だけ描き直す
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    if (Math.abs(dpr - this.artDpr) > 0.001) this.drawArt();
  }

  /**
   * 筐体アートを「そのまま描ける絵」にして返す。
   *
   * cabinet2.png はグリーンバックなので、緑を抜いたオフスクリーンCanvasを
   * ここで一度だけ作る(drawArt はDPR変更のたびに走るため、毎回走査すると重い)。
   * getImageData が使えない環境や、緑がほとんど無い画像(将来の差し替えで
   * 透過PNGになった場合など)では元の画像をそのまま返す。
   * @param {object} art CABINET_ARTS の要素
   * @returns {CanvasImageSource|null}
   */
  _prepareArtImage(art) {
    const img = uiAssets.get(art.id);
    if (!img || !art.chroma) return img;
    const w = img.naturalWidth ?? img.width;
    const h = img.naturalHeight ?? img.height;
    if (!w || !h) return img;
    try {
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d', { willReadFrequently: true });
      if (!ctx) return img;
      ctx.drawImage(img, 0, 0);
      const image = ctx.getImageData(0, 0, w, h);
      // 面積の2%も抜けないなら「グリーンバックではない」とみなして元絵を使う
      if (keyOutGreen(image, art.chroma) < w * h * 0.02) return img;
      ctx.putImageData(image, 0, 0);
      return off;
    } catch (e) {
      console.warn('[cabinet] 筐体アートの背景を抜けなかったので元画像で描画します', e);
      return img;
    }
  }

  /** 元絵のx座標 → 論理x */
  _dstX(srcX) {
    const a = this.art;
    return (srcX - a.anchorSrcX) * a.scaleX + a.anchorDstX;
  }

  /** 元絵のy座標 → 論理y(バンド表を線形補間する) */
  _dstY(srcY) {
    const bands = this.art.bands;
    for (const [s0, s1, d0, d1] of bands) {
      if (srcY >= s0 && srcY <= s1) return d0 + ((srcY - s0) * (d1 - d0)) / (s1 - s0);
    }
    return srcY < bands[0][0] ? bands[0][2] : bands[bands.length - 1][3];
  }

  /**
   * 絵に描かれた窓へ Canvas(液晶・リール・HUD)を載せ替える。
   * Canvas の内部の論理座標系は変わらないので、各Viewの描画コードは無改修。
   */
  _applyWindows() {
    const win = this.art.windows;
    if (!win) return;
    const rect = (w) => ({
      x: this._dstX(w.x0),
      y: this._dstY(w.y0),
      w: this._dstX(w.x1) - this._dstX(w.x0),
      h: this._dstY(w.y1) - this._dstY(w.y0),
    });
    const views = {};
    for (const [name, w] of Object.entries(win)) views[name] = rect(w);
    // 入賞ライン発光のレイヤーはリールと完全に重ねる
    if (views.reels) views.reelfx = { ...views.reels };
    setLayerViews(views);
  }

  /** 筐体アートを論理720×1080で描き直す(DPR対応) */
  drawArt() {
    const ctx = this.artCtx;
    const art = this.art;
    const cab = art ? (this.artImage ?? uiAssets.get(art.id)) : null;
    if (!ctx || !cab) return;

    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    this.artDpr = dpr;
    this.artCanvas.width = Math.round(LOGICAL_W * dpr);
    this.artCanvas.height = Math.round(LOGICAL_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    // 筐体本体(横は等倍、縦だけ帯ごとに伸縮)
    const x0 = this._dstX(0);
    const w = art.srcW * art.scaleX;
    for (const [s0, s1, d0, d1] of art.bands) {
      ctx.drawImage(cab, 0, s0, art.srcW, s1 - s0, x0, d0, w, d1 - d0);
    }

    this._fillScreen(ctx);

    // 別画像で重ねるパーツ(cabinet.png のロゴ帯・下部パネル)。
    // cabinet2.png は両方とも絵に描き込み済みなので overlays が空になっている。
    for (const ov of art.overlays) {
      const img = uiAssets.get(ov.id);
      if (!img) continue;
      ctx.drawImage(img, ov.src.x, ov.src.y, ov.src.w, ov.src.h,
        ov.rect.x, ov.rect.y, ov.rect.w, ov.rect.h);
    }
  }

  /**
   * 元絵に描かれた液晶(cabinet2 はサメのアート)を黒で潰す。
   * #lcd はこの窓へぴったり載せてあるので普段は見えないが、
   * 端数の丸めで1pxはみ出したときに元絵の絵柄が覗かないようにする保険。
   * グリーンバックを抜いた画像では液晶内の緑アイコンを残してあるので、
   * この黒塗りが「窓の中は必ず黒」を保証する役目も兼ねる。
   */
  _fillScreen(ctx) {
    const s = this.art.screenSrc;
    if (!s) return;
    const x = this._dstX(s.x0);
    const y = this._dstY(s.y0);
    const w = this._dstX(s.x1) - x;
    const h = this._dstY(s.y1) - y;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#05030b');
    g.addColorStop(1, '#0b0618');
    ctx.save();
    roundRect(ctx, x, y, w, h, 10);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  // ── 電飾・ボタン ────────────────────────────

  setLampPattern(pattern) {
    if (this._pattern === pattern) return;
    this._pattern = pattern;
    for (const el of this.lamps) el.dataset.pattern = pattern;
    // 下部パネルの発光を電飾パターンに連動させる(style.css の #cabinet[data-lamp])
    this.root.dataset.lamp = pattern;
  }

  /** モードに応じた電飾パターンを選ぶ */
  syncLampToMode(modeId, spinning) {
    if (modeId === 'BONUS' || modeId === 'BONUS_READY') {
      return this.setLampPattern(LAMP_PATTERNS.BONUS);
    }
    // U11: RUSH 4種はすべて RUSH の電飾(ヒーローはボーナス電飾でさらに派手に)
    if (modeId === 'HERO_RUSH') return this.setLampPattern(LAMP_PATTERNS.BONUS);
    if (isRushMode(modeId)) return this.setLampPattern(LAMP_PATTERNS.RUSH);
    if (modeId === 'CZ') return this.setLampPattern(LAMP_PATTERNS.RARE);
    return this.setLampPattern(spinning ? LAMP_PATTERNS.SPIN : LAMP_PATTERNS.IDLE);
  }

  /** レバーを引いた見た目にする(左右どちらの当たり判定を押しても両方動かす) */
  pullLever() {
    for (const el of this.leverEls) {
      el.classList.remove('is-pulled');
      // リフローを挟んでアニメを再生し直す
      void el.offsetWidth;
      el.classList.add('is-pulled');
    }
    setTimeout(() => {
      for (const el of this.leverEls) el.classList.remove('is-pulled');
    }, 260);
  }

  /**
   * ボタンの活性状態を反映する。
   * @param {{canBet:boolean, canLever:boolean, reelActive:boolean[]}} s
   */
  setButtonStates(s) {
    this._setEnabled(this.btnBet, s.canBet);
    for (const el of this.leverEls) this._setEnabled(el, s.canLever);
    this.btnStops.forEach((el, i) => this._setEnabled(el, s.reelActive[i]));
  }

  _setEnabled(el, enabled) {
    if (!el) return;
    el.classList.toggle('is-active', Boolean(enabled));
    el.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }

  /**
   * 下部パネルの1行(#panel-telop)。
   *
   * ── 2026-08-15 ユーザー指示 U66-5 で用途を限定した ────────────────
   * ここは **システム通知と操作案内の専用枠**。ゲームの表示チャネルは
   *   盤面(液晶の常設表示) + ポップアップ(lcd.text)
   * の2系統だけと決めたので、モードの状態・そのゲームの出来事をここへ書かない
   * (書くと同じ文言が画面に2〜3か所並ぶ。U8 の二重表示がまさにこれだった)。
   * 出してよいのは「デバッグキーの結果」「ミュート切替」「リザルト中の操作案内」。
   * role="status" aria-live="polite" が付いているので、読み上げにも乗る。
   */
  setTelop(text) {
    if (this.telopEl && this.telopEl.textContent !== text) {
      this.telopEl.textContent = text ?? '';
    }
  }
}
