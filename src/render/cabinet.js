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
 *   - 上部にAWSLOTのネオンタイトルが描き込み済み(logo_band は使わない)
 *   - 下部の幽霊パネルも描き込み済み(bottom_panel も使わない)
 *   - リール窓が独立3窓、レバーは右側
 * という構成。横は 0.76倍の等倍(src x=541 が論理x=360)で載せている。
 * 0.76 は「リール窓の開口(src 307..775)が論理360pxに合う」ことと
 * 「レバー球の右端(src x=1012)が論理720に収まる」ことの両立点。
 *
 * 縦のバンドは **絵の窓の縦横比を Canvas の論理比に合わせる** ために使う。
 * Canvas 側は setLayerViews() で窓へぴったり載せるので、窓の比が
 * 論理比(液晶 440:300 / リール 360:180)と一致していれば表示は無歪みになる。
 * 逆算すると
 *   液晶窓: 幅500.1 → 高さ341 が要る → 縦0.836(元絵の液晶は横長なので縦に伸ばす)
 *   リール窓: 幅355.7 → 高さ177.8 が要る → 縦0.823
 * 伸ばす帯はどちらも「Canvasで隠れる窓の中」と「側面のLED帯・ベゼル」なので、
 * 幽霊・サメ・レバー球・MAX BET・赤ボタン・下部パネルは全部 0.76 の等倍のまま。
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
 */
const CABINET2_BANDS = [
  [30, 170, 0, 106.4],           // 冠 + AWSLOTタイトル(等倍0.76。全体を表示)
  [170, 578, 106.4, 447.36],     // 液晶窓 → Canvas #lcd(縦0.836)
  [578, 656, 447.36, 506.64],    // 液晶とリールの間の金属帯(等倍0.76)
  [656, 872, 506.64, 684.48],    // リール窓 → Canvas #reels(縦0.823)
  [872, 1290, 684.48, 1002.16],  // 操作デッキ + 下部の幽霊パネル(等倍0.76)
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
 */
const CABINET2_WINDOWS = {
  lcd:   { x0: 214, y0: 170,   x1: 872, y1: 578 },
  reels: { x0: 307, y0: 656,   x1: 775, y1: 872 },
  hud:   { x0: 405, y0: 900.5, x1: 775, y1: 962.2 },
};

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
    /** 元絵に描かれた液晶(BIG BONUS)を黒で潰す。窓と同じ矩形 */
    screenSrc: CABINET2_WINDOWS.lcd,
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
    const cab = art ? uiAssets.get(art.id) : null;
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
   * 元絵に描かれた液晶(BIG BONUS)を黒で潰す。
   * #lcd はこの窓へぴったり載せてあるので普段は見えないが、
   * 端数の丸めで1pxはみ出したときに元絵の絵柄が覗かないようにする保険。
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
    if (modeId === 'AS_RUSH') return this.setLampPattern(LAMP_PATTERNS.RUSH);
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

  /** 下部パネルのテロップ */
  setTelop(text) {
    if (this.telopEl && this.telopEl.textContent !== text) {
      this.telopEl.textContent = text ?? '';
    }
  }
}
