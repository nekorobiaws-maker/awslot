/**
 * 画像アセットローダ(PNG読込 + フォールバック管理)。DESIGN.md 6.2 / 6.4
 *
 * assets/symbols/*.png が存在すればそれを使い、無ければ null を返す。
 * null の絵柄は render/symbols-draw.js がプロシージャル描画で埋める。
 *
 * 読み込み対象は manifest(assets/symbols/manifest.json)で管理する。
 * 「未配置のPNGを試しに fetch して404かどうかで判定する」方式だと、
 * Chromium が 404 レスポンス自体をコンソールへ出力してしまい開発中のログが汚れる。
 * manifest はリポジトリに同梱されているので、この方式なら 404 が一切発生しない。
 *
 * PNGを追加したときは manifest.json の files にファイル名を追記すること。
 */

export class AssetStore {
  /** @param {string} basePath 例: './assets/' */
  constructor(basePath = './assets/') {
    this.basePath = basePath;
    /** @type {Map<string, ImageBitmap|HTMLImageElement|HTMLCanvasElement>} */
    this.images = new Map();
    /** 読み込めなかったID(フォールバック対象) */
    this.missing = [];
    this.loaded = false;
    /** manifest が読めたか(読めない場合は全てフォールバック) */
    this.manifestFound = false;
  }

  /*
   * NOTE(2026-08-14 デッドコード削除):
   * ここには「合成アセット」(PNGを持たず、コードで1枚の絵を作るID)を登録する
   * registerSynth() と、それを load() の最後に実行する _runSynths() があった。
   * 7 / BAR を絵柄PNG(GHOST7.png / SHARKBAR.png)へ戻した時点で登録する側が
   * 1か所も無くなり、**呼ばれないコードだけが残っていた**ので削除した。
   * 同じ仕組みが再び要るときは git 履歴から戻せる(load() の末尾で
   * 生成 → this.images へ差し込み → missing から取り除く、という流れ)。
   */

  /**
   * @param {{id:string, path:string}[]} entries id と basePath からの相対パス
   * @param {object} [opts]
   * @param {string|null} [opts.manifestPath] basePath からの manifest 相対パス。
   *   null を渡すと manifest を使わず全エントリを直接読みにいく(404が出る可能性あり)。
   * @param {boolean} [opts.quiet] 未配置があってもログを出さない
   * @returns {Promise<AssetStore>}
   */
  async load(entries, { manifestPath = 'symbols/manifest.json', quiet = false } = {}) {
    let allow = null;
    if (manifestPath) {
      const manifest = await this._fetchJson(this.basePath + manifestPath);
      this.manifestFound = manifest !== null;
      // manifest が無い/壊れている場合は「配置済みPNGなし」とみなす
      allow = new Set(Array.isArray(manifest?.files) ? manifest.files : []);
    }

    await Promise.all(entries.map(async ({ id, path }) => {
      const fileName = path.split('/').pop();
      if (allow && !allow.has(fileName) && !allow.has(path)) {
        this.missing.push(id);
        return;
      }
      const img = await this._tryLoad(this.basePath + path);
      if (img) this.images.set(id, img);
      else this.missing.push(id);
    }));

    this.loaded = true;
    if (this.missing.length > 0 && !quiet) {
      console.info(
        `[assets] ${this.missing.length}件の画像が未配置のためプレースホルダ描画を使用します: ${this.missing.join(', ')}`,
      );
    }
    return this;
  }

  async _fetchJson(url) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async _tryLoad(url) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return null;
      const type = res.headers.get('content-type') ?? '';
      if (type && !type.startsWith('image/')) return null;
      const blob = await res.blob();
      if (blob.size === 0) return null;
      if (typeof createImageBitmap === 'function') {
        return await createImageBitmap(blob);
      }
      return await this._decodeViaImage(blob);
    } catch {
      return null;
    }
  }

  _decodeViaImage(blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  /** @returns {ImageBitmap|HTMLImageElement|null} */
  get(id) {
    return this.images.get(id) ?? null;
  }

  has(id) {
    return this.images.has(id);
  }
}

/* ────────────────────────────────────────────────────────────
 * 筐体UI画像(assets/ui/*.png)
 *
 * 絵柄と同じ「無ければプレースホルダ描画」の流儀に揃える。
 * 絵柄側は manifest.json で 404 を避けているが、UI画像は点数が少なく
 * 固定なので「存在リスト」をこのファイルに直接持つ。ここに書かれた
 * ファイルだけを読みにいくので、未配置のファイルへ fetch が飛ばない
 * = コンソールに 404 が出ない。
 *
 * 画像を増やすときは UI_ASSETS に id とファイル名を追記すること。
 * ──────────────────────────────────────────────────────────── */

/** @type {{id:string, file:string}[]} 配置済みのUI画像(存在リスト) */
export const UI_ASSETS = [
  // cabinet2 があれば render/cabinet.js はそちらを優先して使う
  { id: 'cabinet2', file: 'cabinet2.png' },
  { id: 'cabinet', file: 'cabinet.png' },
  { id: 'logo_band', file: 'logo_band.png' },
  { id: 'bottom_panel', file: 'bottom_panel.png' },
  { id: 'reel_frame', file: 'reel_frame.png' },
  { id: 'reel_band', file: 'reel_band.png' },
  // reel_separator / payline は 2026-08-13 ユーザー指示で使用廃止
  // (中段ライン画像と紫の縦ライン画像は表示しない。入賞発光はreelfx側で継続)
  { id: 'stage_freetier', file: 'stage_freetier.png' },
  { id: 'stage_warm', file: 'stage_warm.png' },
  { id: 'stage_prov', file: 'stage_prov.png' },
  { id: 'stage_cz', file: 'stage_cz.png' },
  { id: 'stage_rush', file: 'stage_rush.png' },
  { id: 'stage_standby', file: 'stage_standby.png' },
  { id: 'stage_ending', file: 'stage_ending.png' },
];

/**
 * UI画像の共有ストア。
 * 読み込みが終わるまで get() は null を返すので、
 * 各 View は「null ならプロシージャル描画」でそのまま動く(ちらつき防止)。
 */
/**
 * 絵柄画像(assets/symbols/*.png)の共有ストア。
 *
 * 以前は main.js のローカル変数だったため、演出側(staging/)から参照できず
 * 「絵柄が飛んでくる」系の演出がプレースホルダ描画しか使えなかった。
 * uiAssets と同じく共有インスタンスとして公開し、読み込みは従来どおり main.js が
 * 起動時に一度だけ走らせる。読み手は get(id) するだけでよく、
 * 未ロードのあいだは null が返るので各自フォールバックすればよい。
 *
 * 依存方向: staging/ → engine/ は許可されている(staging/ → render/ は不可)。
 */
export const symbolAssets = new AssetStore('./assets/');

export const uiAssets = new AssetStore('./assets/');

/* ────────────────────────────────────────────────────────────
 * キャラ画像(assets/chars/*.png)
 *
 * 2026-08-14: ユーザー支給のサメ素材 shark.png(5列×4行=20ポーズの
 * スプライトシート)を読み込む。キャラ描画(render/chars/george.js)は
 * このシートから必要なポーズだけを切り出して使う。
 *
 * UI画像と同じ「存在リスト方式」。ここに書かれたファイルだけ読みにいくので
 * 未配置ファイルへの fetch(=コンソールの404)が発生しない。
 * ──────────────────────────────────────────────────────────── */

/** @type {{id:string, file:string}[]} 配置済みのキャラ画像(存在リスト) */
export const CHAR_ASSETS = [
  { id: 'shark', file: 'shark.png' },
  // 2026-08-14: プレミアカメオの「ルナ」(1254×1254 / 5列×4行=20ポーズ)。
  // こちらはグリーンバックのままの素材なので、切り出し側(render/chars/lunachan.js)で
  // クロマキーしてから使う。
  { id: 'luna', file: 'luna.png' },
  // 2026-08-14 U30: ヒーローRUSH の主役「ヒーロー」(1536×1024 / 5列×3行=15ポーズ)。
  // ルナと同じグリーンバック素材。セル境界が等間隔でないので、
  // 切り出し側(render/chars/herochan.js)が実測の境界表を持っている。
  { id: 'hero', file: 'hero.png' },
];

export const charAssets = new AssetStore('./assets/');

/** @type {Promise<AssetStore>|null} */
let charLoadPromise = null;

/**
 * キャラ画像の読み込みを一度だけ開始する。何度呼んでも同じ Promise を返す。
 * 未ロードのあいだ get('shark') は null を返すので、呼び手は
 * 「まだ来ていないフレームは簡易描画」でそのまま動かせる。
 * @returns {Promise<AssetStore>}
 */
export function loadCharAssets() {
  if (!charLoadPromise) {
    charLoadPromise = charAssets
      .load(
        CHAR_ASSETS.map(({ id, file }) => ({ id, path: `chars/${file}` })),
        { manifestPath: null, quiet: true },
      )
      .then((store) => {
        if (store.missing.length > 0) {
          console.info(
            `[assets] キャラ画像 ${store.missing.length}件が読めなかったので簡易描画にフォールバックします: ` +
            store.missing.join(', '),
          );
        }
        return store;
      })
      .catch((err) => {
        console.warn('[assets] キャラ画像の読み込みに失敗しました(簡易描画を継続します)', err);
        return charAssets;
      });
  }
  return charLoadPromise;
}

/** @type {Promise<AssetStore>|null} */
let uiLoadPromise = null;

/**
 * UI画像の読み込みを一度だけ開始する。何度呼んでも同じ Promise を返す。
 * @returns {Promise<AssetStore>}
 */
export function loadUiAssets() {
  if (!uiLoadPromise) {
    uiLoadPromise = uiAssets
      .load(
        UI_ASSETS.map(({ id, file }) => ({ id, path: `ui/${file}` })),
        // 存在リストで管理しているので manifest は使わない
        { manifestPath: null, quiet: true },
      )
      .then((store) => {
        if (store.missing.length > 0) {
          console.info(
            `[assets] UI画像 ${store.missing.length}件が読めなかったのでCSS/プロシージャル描画にフォールバックします: ` +
            store.missing.join(', '),
          );
        }
        return store;
      })
      .catch((err) => {
        // 読み込みに失敗しても現行描画で動き続ける
        console.warn('[assets] UI画像の読み込みに失敗しました(現行描画を継続します)', err);
        return uiAssets;
      });
  }
  return uiLoadPromise;
}
