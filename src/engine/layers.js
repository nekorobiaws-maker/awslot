/**
 * Canvasレイヤー管理・DPR対応・ビューポートフィット。DESIGN.md 5.1 / 5.3
 *
 * 論理解像度 720×1080 を基準に、
 *  - 各Canvasは論理サイズで配置し、バックバッファは devicePixelRatio 倍で確保する
 *  - 筐体全体は CSS transform: scale() で min(vw/720, vh/1080) にフィットさせる
 */

export const LOGICAL_W = 720;
export const LOGICAL_H = 1080;

/**
 * レイヤー定義(論理px)。z は style.css の z-index と対応。
 *
 * x/y/w/h は **描画に使う論理座標系**。各 View(LcdView / ReelView / HudView)と
 * 演出アニメの座標はすべてこの値が前提なので **絶対に変えない**。
 *
 * 「画面上でどこに何pxで見せるか」は別に持てる(setLayerViews)。
 * 筐体アートの窓は絵ごとに位置もサイズも違うので、
 * render/cabinet.js が採用したアートの窓に合わせて表示側だけ差し替える。
 * 差し替えても描画コードは 440×300 のまま書ける。
 */
export const LAYER_DEFS = {
  lcd:     { x: 140, y: 60,  w: 440, h: 300,  z: 2 },
  reels:   { x: 180, y: 440, w: 360, h: 180,  z: 4 },
  reelfx:  { x: 180, y: 440, w: 360, h: 180,  z: 5 },
  hud:     { x: 180, y: 630, w: 360, h: 60,   z: 6 },
  overlay: { x: 0,   y: 0,   w: 720, h: 1080, z: 8 },
};

/**
 * 表示位置の上書き。{ lcd: {x,y,w,h}, ... } 形式。
 * render/cabinet.js が筐体アートを決めた時点(=画像の読み込み後)に呼ぶため、
 * Layers.init() より後になることがある。あとから来ても反映できるように
 * モジュール側で保持しておく(uiAssets と同じ共有ストアの流儀)。
 */
let layerViews = null;
/** @type {Layers|null} 直近に init() したインスタンス */
let activeLayers = null;

/**
 * 筐体をビューポートに収めたときの余白[CSS px](fit() が更新する)。
 * 画面揺れ(render/overlay.js の _applyShake)は **この余白の中でしか動かせない**。
 * 余白より大きく揺らすと筐体が画面の外へ出てしまい、上下では冠(JAWSLOT)や
 * 台座が切り落とされて「液晶が枠からズレた」ように見える(2026-08-16 V80-4)。
 */
let fitSlack = { x: 0, y: 0 };

/**
 * 揺らしてよい振れ幅の上限[CSS px]。
 * @returns {{x:number, y:number}}
 */
export function getShakeSlack() {
  return { x: fitSlack.x, y: fitSlack.y };
}

/**
 * 筐体アートの窓に合わせて Canvas の表示位置・表示サイズだけを差し替える。
 * 内部の論理座標系は変わらない(描画コードは無改修)。
 * @param {Record<string, {x:number,y:number,w:number,h:number}>|null} views
 */
export function setLayerViews(views) {
  layerViews = views ?? null;
  activeLayers?.applyViews();
}

/**
 * いま実際に使われているレイヤーの表示矩形(論理 720×1080 座標)を返す。
 *
 * 筐体アートに合わせて setLayerViews() で差し替えられている場合はそちらを、
 * 無ければ LAYER_DEFS の既定値を返す。
 *
 * overlay レイヤー(全画面カットイン)は液晶と同じ論理座標系で描かれるので、
 * 「文字は液晶の中だけに描く」ルールの実装にこの矩形を使う。
 * @param {string} id 'lcd' | 'reels' | 'hud' | 'overlay' など
 * @returns {{x:number, y:number, w:number, h:number}}
 */
export function getLayerRect(id) {
  const v = layerViews?.[id];
  if (v && Number.isFinite(v.w) && v.w > 0 && Number.isFinite(v.h) && v.h > 0) {
    return { x: v.x, y: v.y, w: v.w, h: v.h };
  }
  const d = LAYER_DEFS[id] ?? LAYER_DEFS.lcd;
  return { x: d.x, y: d.y, w: d.w, h: d.h };
}

export class Layers {
  /**
   * @param {HTMLElement} cabinetEl 論理720×1080の筐体ルート要素
   * @param {HTMLElement} [viewportEl] スケール計算の基準になる外側要素
   */
  constructor(cabinetEl, viewportEl = null) {
    this.cabinet = cabinetEl;
    this.viewport = viewportEl ?? cabinetEl.parentElement ?? document.body;
    /** @type {Record<string, {canvas:HTMLCanvasElement, ctx:CanvasRenderingContext2D, def:object}>} */
    this.layers = {};
    this.dpr = 1;
    this.scale = 1;
    this._onResize = this._onResize.bind(this);
  }

  /** レイヤーを構築して初回フィットまで行う */
  init() {
    for (const [name, def] of Object.entries(LAYER_DEFS)) {
      const canvas = document.getElementById(name);
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error(`[layers] canvas #${name} が index.html に見つかりません`);
      }
      canvas.style.zIndex = String(def.z);
      const ctx = canvas.getContext('2d');
      this.layers[name] = { canvas, ctx, def };
    }
    activeLayers = this;
    this.applyViews();
    this.fit();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    return this;
  }

  /** そのレイヤーの表示矩形(未指定なら論理座標そのまま) */
  view(name) {
    return layerViews?.[name] ?? this.layers[name].def;
  }

  /** 表示矩形をCSSへ反映し、バックバッファを取り直す */
  applyViews() {
    for (const [name, { canvas }] of Object.entries(this.layers)) {
      const v = this.view(name);
      canvas.style.left = `${v.x}px`;
      canvas.style.top = `${v.y}px`;
      canvas.style.width = `${v.w}px`;
      canvas.style.height = `${v.h}px`;
    }
    this.applyDpr();
  }

  /**
   * DPRに合わせてバックバッファを確保し直す。
   * バックバッファは「表示サイズ×DPR」で取り、transform で論理座標を
   * 表示サイズへ写す。こうすると表示を拡げても実ピクセルが増えるので
   * 拡大ボケが出ない(絵柄がドット絵に見える原因のひとつ)。
   */
  applyDpr() {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    this.dpr = dpr;
    for (const [name, { canvas, ctx, def }] of Object.entries(this.layers)) {
      const v = this.view(name);
      canvas.width = Math.round(v.w * dpr);
      canvas.height = Math.round(v.h * dpr);
      // 以降は論理px単位で描ける(表示が論理サイズと違う場合はここで吸収する)
      ctx.setTransform((dpr * v.w) / def.w, 0, 0, (dpr * v.h) / def.h, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }
  }

  /** ビューポートに筐体をフィットさせる */
  fit() {
    const vw = this.viewport.clientWidth || window.innerWidth;
    const vh = this.viewport.clientHeight || window.innerHeight;
    const scale = Math.min(vw / LOGICAL_W, vh / LOGICAL_H);
    this.scale = scale;
    const offsetX = Math.max(0, (vw - LOGICAL_W * scale) / 2);
    const offsetY = Math.max(0, (vh - LOGICAL_H * scale) / 2);
    // 画面揺れが筐体を画面外へ追い出さないよう、余白を控えておく(V80-4)
    fitSlack = { x: offsetX, y: offsetY };
    // --shake-x / --shake-y は演出システム(overlay.shake)が書き換える画面揺れ用の変数。
    // フィット計算と揺れを1つの transform で両立させる。
    this.cabinet.style.transform =
      `translate(calc(${offsetX}px + var(--shake-x, 0px)), calc(${offsetY}px + var(--shake-y, 0px))) scale(${scale})`;
  }

  _onResize() {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    if (Math.abs(dpr - this.dpr) > 0.001) this.applyDpr();
    this.fit();
  }

  /** @returns {CanvasRenderingContext2D} */
  ctx(name) {
    const layer = this.layers[name];
    if (!layer) throw new Error(`[layers] 未定義のレイヤー: ${name}`);
    return layer.ctx;
  }

  /** レイヤーを論理サイズでクリアする */
  clear(name) {
    const { ctx, def } = this.layers[name];
    ctx.clearRect(0, 0, def.w, def.h);
  }

  size(name) {
    const { def } = this.layers[name];
    return { w: def.w, h: def.h };
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
  }
}
