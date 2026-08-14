/**
 * キャラ描画: プレミアカメオの「ルナ」。DESIGN.md 6.8
 *
 * ■ 2026-08-14 追加(ユーザー支給素材)
 *   assets/chars/luna.png(1254×1254 / 5列×4行=20ポーズのスプライトシート)から
 *   ポーズを切り出して描く、**超低確率でしか出てこない特別枠**のキャラ。
 *   ジョージ(render/chars/george.js)と同じ作りなので、
 *   演出データからは char.show / char.pose / char.motion で同じように扱える。
 *
 * ■ 素材の違い = グリーンバック
 *   サメ素材は背景が透過済みだったが、この素材は **緑背景のまま** 届いている。
 *   そこでセル切り出しパイプラインの先頭に緑抜き(クロマキー)を足した。
 *   判定は render/cabinet.js の keyOutGreen() と同じ「緑度 = G - max(R,B)」方式。
 *   実測(assets/chars/luna.png):
 *     背景  … RGB(25,180,19) → 緑度 155
 *     髪    … RGB(250,205,125) 前後 → 緑度 -125 前後
 *     黒服  … 緑度 ≒ 0
 *   なので hard=90 は背景と絵のあいだに十分な余裕がある(誤爆しない)。
 *
 * ■ セル切り出しの流れ(初回だけ実行してキャッシュ)
 *   1. inset ぶん内側を切る … セル境界の黒い罫線(実測で幅3〜5px)を避ける
 *   2. 緑抜き              … hard 以上は完全透過 / soft〜hard は半透明 + 緑かぶり抑制
 *   3. 低アルファ落とし     … 抜き残りの点を消す
 *   4. 薄い罫線消し         … 行/列まるごと薄い画素なら素材の線とみなす
 *   5. 外接矩形でトリム     … 描画コストを下げる(位置はセル内オフセットとして覚えておく)
 *   2026-08-14: 2〜5 は3人目(ヒーロー)と同じ処理なので render/chars/sheetcut.js へ
 *   共通化した。ここは「どのセルを切るか」を決めて渡すだけになっている。
 *
 * ■ 大きさの揃え方(george.js との違い)
 *   george は「ポーズの外接矩形を箱いっぱいに広げる」方式だが、この素材は
 *   全ポーズが同じ体格で描かれているので、それをやると寝ポーズだけ巨大に見える。
 *   ここでは **セルそのものを箱に合わせて縮小** し、絵はセル内の位置関係を保ったまま置く。
 *   結果、どのポーズでも身長が揃い、頭上のエフェクト(!マークやハート)も
 *   素材が意図した位置に出る。
 *
 * ■ 左右反転はしない(既定)
 *   Tシャツに「東京リージョン民 / インフラエンジニア(自称) Lv.99」と
 *   **読める文字**が入っているので、反転すると鏡文字になって台無しになる。
 *   反転してよいポーズだけ mirror:true を明示する(いまは走りポーズのみ)。
 */

import { charAssets, loadCharAssets } from '../../engine/assets.js';
import { cutSheetCell, GREENBACK_CHROMA } from './sheetcut.js';

/** フォールバック描画とエフェクトで使う配色(素材から拾った値) */
export const LUNA_COLORS = {
  hair: '#f5cd7d',
  hairLight: '#ffe6ab',
  hairDark: '#d9a94e',
  shirt: '#1d1d21',
  shirtLight: '#33333a',
  skin: '#ffe3cf',
  eye: '#3ea8e5',
  glass: '#cfe9ff',
  outline: '#2a1c0c',
  accent: '#ffd54a',
};

/* ────────────────────────────────────────────────────────────
 * スプライトシート
 * ──────────────────────────────────────────────────────────── */

export const LUNA_SHEET = {
  id: 'luna',
  file: 'assets/chars/luna.png',
  imgW: 1254,
  imgH: 1254,
  cols: 5,
  rows: 4,
  /**
   * セル境界の黒い罫線を避けるための内側マージン(px)。
   * 実測の罫線位置は x=251〜253 / y=313〜317 など幅3〜5px なので、
   * 5 あれば罫線を跨がず、かつ絵の端も削りすぎない。
   */
  inset: 5,
};

/**
 * 緑抜きのしきい値(実体は sheetcut.js の共通値)。
 * 緑度 = G - max(R,B) で判定する。素材ごとに変えたくなったらここだけ差し替える。
 */
export const LUNA_CHROMA = GREENBACK_CHROMA;

const CELL_W = LUNA_SHEET.imgW / LUNA_SHEET.cols;  // 250.8
const CELL_H = LUNA_SHEET.imgH / LUNA_SHEET.rows;  // 313.5

/**
 * 20ポーズのレジストリ。
 *   col/row  … スプライトシート上の位置(左上が 0,0)
 *   anim     … 既定の芝居(ANIMS のキー)
 *   fx       … 追加エフェクト(FX のキー)
 *   fxColor  … エフェクトの色(役の色と合わせるために使う)
 *   mirror   … true のポーズだけ dir で左右反転してよい(既定は反転しない)
 *   facing   … 素材が向いている方向(mirror:true のポーズでのみ意味を持つ)
 *   use      … どのシチュエーションで使うか(人間向けメモ)
 */
export const LUNA_POSES = {
  // ── 1行目 ──
  smile:    { col: 0, row: 0, anim: 'idle',       use: '通常登場・待機' },
  joy:      { col: 1, row: 0, anim: 'cheerJump',  fx: 'sparkle', fxColor: '#ffe27a', use: 'キラキラ喜び・当選' },
  surprise: { col: 2, row: 0, anim: 'jitter',     use: '驚き(!)・急変' },
  point:    { col: 3, row: 0, anim: 'swagger',    fx: 'sparkle', fxColor: '#ff8f7a', use: 'ニヤリ指差し・弱チェリー' },
  dizzy:    { col: 4, row: 0, anim: 'spin',       use: '目回りグルグル・お手上げ' },
  // ── 2行目 ──
  cry:      { col: 0, row: 1, anim: 'sob',        use: '泣き・ハズレ' },
  think:    { col: 1, row: 1, anim: 'ponder',     use: 'ドヤ思案・考え中' },
  coding:   { col: 2, row: 1, anim: 'typing',     use: 'ノートPCでコーディング・処理中' },
  wave:     { col: 3, row: 1, anim: 'waveArm',    use: '手を振って笑う・挨拶/退場' },
  sulk:     { col: 4, row: 1, anim: 'puff',       use: 'むすっ・不満' },
  // ── 3行目 ──
  penlight: { col: 0, row: 2, anim: 'swingLight', fx: 'notes', fxColor: '#8ad4ff', use: 'ヘッドホン+ペンライト・チャンス目' },
  run:      { col: 1, row: 2, anim: 'dash',       fx: 'speed', mirror: true, facing: -1, use: '走る・横切り' },
  heart:    { col: 2, row: 2, anim: 'throb',      fx: 'hearts', fxColor: '#ff7fb0', use: 'ハート・大好き' },
  fire:     { col: 3, row: 2, anim: 'flare',      fx: 'flame', use: '炎オーラで拳・激アツ/強チェリー' },
  present:  { col: 4, row: 2, anim: 'presenting', use: 'グラフでプレゼン・解説' },
  // ── 4行目 ──
  sign:     { col: 0, row: 3, anim: 'lift',       fx: 'sparkle', fxColor: '#5ce6a8', use: '「神アプデ!」看板・スイカ' },
  question: { col: 1, row: 3, anim: 'tilt',       use: 'はてな・不明' },
  peek:     { col: 2, row: 3, anim: 'peekSide',   use: 'ひょっこり覗き(画面の左端から)' },
  sleep:    { col: 3, row: 3, anim: 'breathe',    use: '白いぬいぐるみと居眠り・待機' },
  party:    { col: 4, row: 3, anim: 'hop',        fx: 'confetti', use: 'クラッカーでお祝い・確定役' },
};

/**
 * シチュエーション → ポーズの対応表。
 * 演出側は「何の場面か」でも引ける(ポーズ名の直接指定も可)。
 *
 * ■ 成立役との対応(色の約束 U9: スイカ=緑 / チェリー=赤)
 *   スイカ       → sign     (「神アプデ!」看板 / 緑のきらめき)
 *   弱チェリー   → point    (ニヤリ指差し / 赤寄りのきらめき)
 *   強チェリー   → fire     (炎オーラで拳)
 *   チャンス目   → penlight (ペンライト / 水色の音符)
 *   確定役(サメ揃い・ゴースト揃い) → party (クラッカー)
 */
export const LUNA_SITUATIONS = {
  normal: 'smile',
  idle: 'smile',
  appear: 'peek',
  tease: 'peek',
  melon: 'sign',
  weakCherry: 'point',
  strongCherry: 'fire',
  chance: 'penlight',
  premium: 'party',
  hot: 'fire',
  win: 'joy',
  bigWin: 'party',
  ending: 'party',
  loveWin: 'heart',
  quiz: 'question',
  lose: 'cry',
  interrupt: 'surprise',
  penalty: 'sulk',
  cheer: 'wave',
  cool: 'point',
  work: 'coding',
  explain: 'present',
  dash: 'run',
  sleep: 'sleep',
};

/**
 * ポーズ名を解決する。ポーズ名でもシチュエーション名でも通る。
 * @param {string} [name]
 * @returns {string} LUNA_POSES のキー
 */
export function resolveLunaPose(name) {
  if (!name) return 'smile';
  if (LUNA_POSES[name]) return name;
  if (LUNA_SITUATIONS[name]) return LUNA_SITUATIONS[name];
  return 'smile';
}

/* ────────────────────────────────────────────────────────────
 * ポーズの切り出し(初回だけ実行してキャッシュ)
 * ──────────────────────────────────────────────────────────── */

/**
 * @type {Map<string, {canvas:HTMLCanvasElement, w:number, h:number,
 *   ox:number, oy:number, cellW:number, cellH:number}|null>}
 */
const artCache = new Map();

// 画像は使う側が何もしなくても揃うように、読み込みだけ先に始めておく。
// (ブラウザ以外の環境=構文チェックやシミュレータでは何もしない)
if (typeof window !== 'undefined' && typeof fetch === 'function') {
  loadCharAssets();
}

/** スプライトシート本体。未ロードなら null */
function sheet() {
  return charAssets.get(LUNA_SHEET.id);
}

/** シートが使える状態か */
export function lunaArtReady() {
  return !!sheet();
}

/**
 * ポーズ1枚ぶんの絵を用意する。
 * @param {string} poseName
 * @returns {{canvas:HTMLCanvasElement, w:number, h:number, ox:number, oy:number,
 *   cellW:number, cellH:number}|null} 未ロード時は null
 */
export function lunaPoseArt(poseName) {
  const name = resolveLunaPose(poseName);
  if (artCache.has(name)) return artCache.get(name);
  const img = sheet();
  if (!img || typeof document === 'undefined') return null;

  let art = null;
  try {
    art = cutCell(img, LUNA_POSES[name]);
  } catch (e) {
    console.warn('[luna] ポーズの切り出しに失敗しました:', name, e);
    art = null;
  }
  // 失敗は毎フレーム再試行しないようキャッシュへ(null を入れて打ち止め)
  artCache.set(name, art);
  return art;
}

/**
 * セルを切り出して「緑を抜いた不透明部だけ」のキャンバスにする。
 * 画素の処理そのものは render/chars/sheetcut.js の共通実装に任せ、
 * ここでは **どの矩形を切るか**(罫線を避けた内側)だけを決める。
 * 返り値の ox/oy は **セル内での位置**(トリムで捨てた余白のぶん)。
 * これがあるので、トリムしても素材の構図(頭上のマークの位置など)を再現できる。
 */
function cutCell(img, pose) {
  const inset = LUNA_SHEET.inset;
  return cutSheetCell(img, {
    sx: pose.col * CELL_W + inset,
    sy: pose.row * CELL_H + inset,
    sw: CELL_W - inset * 2,
    sh: CELL_H - inset * 2,
  }, { chroma: LUNA_CHROMA });
}

/* ────────────────────────────────────────────────────────────
 * アニメーション(絵は替えず、変形だけで芝居をつける)
 *
 * 返り値: { dx, dy, rot, sx, sy } … 位置オフセット/回転/スケール
 * すべて「scale=1 のときの画面px」基準。
 * ──────────────────────────────────────────────────────────── */

const TAU = Math.PI * 2;

const ANIMS = {
  /** ふわふわ待機 */
  idle: (t) => ({ dy: Math.sin(t * 1.9) * 3, rot: Math.sin(t * 1.05) * 0.035 }),

  /** ご機嫌に体を揺らす */
  sway: (t) => ({ dy: Math.sin(t * 2.6) * 3, rot: Math.sin(t * 1.7) * 0.09 }),

  /** ぴょこぴょこ跳ねる(着地で潰れる) */
  hop: (t) => {
    const ph = (t * 1.6) % 1;
    const jump = Math.sin(ph * Math.PI);
    const land = Math.max(0, 1 - jump * 6);
    return {
      dy: -13 * jump,
      sx: 1 + 0.10 * land - 0.045 * jump,
      sy: 1 - 0.10 * land + 0.06 * jump,
      rot: Math.sin(t * 3.2) * 0.045,
    };
  },

  /** 喜びの連続ジャンプ(高め・回転多め) */
  cheerJump: (t) => {
    const ph = (t * 2.1) % 1;
    const jump = Math.sin(ph * Math.PI);
    const land = Math.max(0, 1 - jump * 7);
    return {
      dy: -20 * jump,
      dx: Math.sin(t * 4.2) * 2.5,
      sx: 1 + 0.12 * land - 0.05 * jump,
      sy: 1 - 0.12 * land + 0.08 * jump,
      rot: Math.sin(t * 6.3) * 0.06,
    };
  },

  /** ビクッと驚く(小刻み+ときどき大きく) */
  jitter: (t) => ({
    dx: Math.sin(t * 24) * 3.4,
    dy: Math.sin(t * 7.5) * 4 - 3,
    rot: Math.sin(t * 12) * 0.08,
    sy: 1 + Math.max(0, Math.sin(t * 3.1)) * 0.05,
  }),

  /** 目が回っている(ゆっくり傾いて漂う) */
  spin: (t) => ({
    dx: Math.sin(t * 1.6) * 6,
    dy: Math.sin(t * 2.3) * 4,
    rot: Math.sin(t * 1.15) * 0.16,
  }),

  /** しゃくりあげる(泣き) */
  sob: (t) => {
    const hic = Math.max(0, Math.sin(t * 3.4)) ** 3;
    return { dy: -5 * hic + 2, sy: 1 + hic * 0.04, sx: 1 - hic * 0.03, rot: Math.sin(t * 1.3) * 0.03 };
  },

  /** 考え中(ゆっくり首をかしげる) */
  ponder: (t) => ({ rot: Math.sin(t * 1.1) * 0.1 + 0.03, dy: Math.sin(t * 1.6) * 2.5 }),

  /** タイピング(前傾で小刻み) */
  typing: (t) => ({ dy: Math.sin(t * 13) * 1.4, rot: 0.02 + Math.sin(t * 6.5) * 0.012 }),

  /** 手を振る(体ごと左右へ) */
  waveArm: (t) => ({ rot: Math.sin(t * 3.4) * 0.13, dx: Math.sin(t * 3.4) * 4, dy: Math.sin(t * 6.8) * 2 }),

  /** ぷくっと膨れて震える(むすっ) */
  puff: (t) => {
    const p = (Math.sin(t * 1.5) + 1) / 2;
    return { sx: 1 + p * 0.05, sy: 1 - p * 0.02, dx: Math.sin(t * 26) * 1.4, rot: Math.sin(t * 1.9) * 0.02 };
  },

  /** ペンライトを振るリズム */
  swingLight: (t) => ({
    rot: Math.sin(t * 4.4) * 0.11,
    dy: Math.abs(Math.sin(t * 4.4)) * -5,
    dx: Math.sin(t * 2.2) * 3,
  }),

  /** 走る(前傾 + 前後にシュッ) */
  dash: (t) => ({
    dx: Math.sin(t * 6.2) * 6,
    dy: Math.abs(Math.sin(t * 6.2)) * -5,
    rot: Math.sin(t * 6.2) * 0.035,
    sx: 1 + Math.sin(t * 6.2) * 0.025,
  }),

  /** ときめき(心拍) */
  throb: (t) => {
    const beat = Math.max(0, Math.sin(t * 4.2)) ** 2;
    return { dy: -5 * beat, sx: 1 + beat * 0.07, sy: 1 + beat * 0.05, rot: Math.sin(t * 2.1) * 0.04 };
  },

  /** 炎をまとって明滅(激アツ) */
  flare: (t) => {
    const k = 1 + Math.sin(t * 8.5) * 0.05;
    return { dy: Math.sin(t * 3.8) * 3, sx: k, sy: k, rot: Math.sin(t * 15) * 0.016 };
  },

  /** 指し棒でとんとん(プレゼン) */
  presenting: (t) => {
    const tap = Math.max(0, Math.sin(t * 3.6)) ** 2;
    return { dx: tap * 3, dy: Math.sin(t * 1.7) * 2.5, rot: -0.02 - tap * 0.02 };
  },

  /** 看板を掲げる(上下に大きめ) */
  lift: (t) => {
    const up = (Math.sin(t * 2.4) + 1) / 2;
    return { dy: -8 * up, rot: Math.sin(t * 2.4) * 0.05, sy: 1 + up * 0.03 };
  },

  /** 首をかしげる(はてな) */
  tilt: (t) => ({ rot: Math.sin(t * 1.8) * 0.15, dy: Math.sin(t * 3.6) * 2.5 }),

  /** 横からひょっこり(出たり引っ込んだり) */
  peekSide: (t) => {
    const ph = (t * 0.8) % 1;
    const out = ph < 0.18 ? ph / 0.18 : ph < 0.7 ? 1 : Math.max(0, 1 - (ph - 0.7) / 0.3);
    return { dx: (1 - out) * -34, dy: Math.sin(t * 3.2) * 2, rot: (1 - out) * -0.06 };
  },

  /** すやすや(呼吸だけ) */
  breathe: (t) => ({
    dy: Math.sin(t * 1.05) * 2.5,
    sx: 1 + Math.sin(t * 1.05) * 0.02,
    sy: 1 - Math.sin(t * 1.05) * 0.016,
    rot: Math.sin(t * 0.5) * 0.015,
  }),

  /** キメ(ゆっくり構える) */
  swagger: (t) => ({
    dy: Math.sin(t * 1.7) * 3.5,
    rot: Math.sin(t * 0.85) * 0.05 - 0.02,
    sx: 1 + Math.sin(t * 1.7) * 0.015,
  }),
};

/* ── 追加エフェクト(キャラの後ろに重ねる) ─────────────
 *
 * エフェクトの濃さは **呼び出し時点の globalAlpha に掛け算** すること
 * (代入で上書きすると、退場フェード中にキャラだけ薄くなって
 *  ハートや紙吹雪だけ濃いまま取り残される)。
 */

const FX = {
  /** 炎の後光(激アツ)。色は素材の炎に合わせて固定 */
  flame(ctx, t, box) {
    const k = 0.72 + Math.sin(t * 7.5) * 0.28;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = box.h * (0.5 + Math.sin(t * 5) * 0.035);
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    g.addColorStop(0, `rgba(255,214,130,${0.4 * k})`);
    g.addColorStop(0.55, `rgba(255,124,26,${0.28 * k})`);
    g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  },

  /** きらめき(喜び・看板・指差し。色は fxColor で役に合わせる) */
  sparkle(ctx, t, box, color) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const ph = ((t * 0.85 + i * 0.2) % 1);
      const ang = i * 1.7 + t * 0.5;
      const rx = Math.cos(ang) * box.w * 0.46;
      const ry = Math.sin(ang * 1.25) * box.h * 0.36 - box.h * 0.06;
      const s = (5 + (i % 2) * 4) * Math.sin(ph * Math.PI);
      if (s <= 0.2) continue;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(ph * 1.4);
      ctx.fillStyle = i % 2 ? color : 'rgba(255,255,255,0.9)';
      star4(ctx, s);
      ctx.restore();
    }
    ctx.restore();
  },

  /** ハートがふわふわ昇る */
  hearts(ctx, t, box, color) {
    ctx.save();
    const base = ctx.globalAlpha;
    for (let i = 0; i < 4; i++) {
      const ph = ((t * 0.5 + i * 0.25) % 1);
      const x = (i % 2 ? 1 : -1) * box.w * (0.22 + (i % 3) * 0.08) + Math.sin(ph * 5 + i) * 5;
      const y = box.h * 0.22 - ph * box.h * 0.62;
      ctx.save();
      ctx.globalAlpha = base * Math.sin(ph * Math.PI) * 0.85;
      ctx.translate(x, y);
      ctx.scale(1 + ph * 0.3, 1 + ph * 0.3);
      ctx.fillStyle = color;
      heart(ctx, 6);
      ctx.restore();
    }
    ctx.restore();
  },

  /** 音符(ヘッドホン・ペンライト) */
  notes(ctx, t, box, color) {
    ctx.save();
    const base = ctx.globalAlpha;
    for (let i = 0; i < 4; i++) {
      const ph = ((t * 0.55 + i * 0.27) % 1);
      const x = (i % 2 ? 1 : -1) * box.w * (0.26 + (i % 2) * 0.1);
      const y = box.h * 0.18 - ph * box.h * 0.58;
      ctx.save();
      ctx.globalAlpha = base * Math.sin(ph * Math.PI) * 0.9;
      ctx.translate(x + Math.sin(ph * 6 + i) * 4, y);
      ctx.rotate(Math.sin(ph * 4 + i) * 0.3);
      ctx.fillStyle = color;
      note(ctx, 7);
      ctx.restore();
    }
    ctx.restore();
  },

  /**
   * 進行方向と反対へ流れるスピードライン。
   * dirSign は「画面上でキャラが向いている方向」(1=右 / -1=左)なので、
   * 線は必ず背中側に出る(素材を反転した場合も正しい側になる)。
   */
  speed(ctx, t, box, color, dirSign = 1) {
    const back = dirSign >= 0 ? -1 : 1;
    ctx.save();
    const base = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const ph = ((t * 1.8 + i * 0.2) % 1);
      const len = box.w * (0.3 + (i % 3) * 0.16);
      const y = -box.h * 0.25 + (i / 4) * box.h * 0.5;
      const x = back * (box.w * 0.3 + ph * box.w * 0.45);
      ctx.globalAlpha = base * 0.45 * Math.sin(ph * Math.PI);
      ctx.strokeStyle = 'rgba(210,240,255,0.9)';
      ctx.lineWidth = 3 - (i % 3) * 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + back * len, y);
      ctx.stroke();
    }
    ctx.restore();
  },

  /** 紙吹雪(お祝い) */
  confetti(ctx, t, box) {
    ctx.save();
    const base = ctx.globalAlpha;
    const COLORS = ['#ffd54a', '#ff6b9a', '#6be7ff', '#8cf07a', '#c78bff'];
    for (let i = 0; i < 12; i++) {
      const ph = ((t * 0.6 + i * 0.083) % 1);
      const x = ((i * 37) % 100) / 100 * box.w - box.w / 2;
      const y = -box.h * 0.55 + ph * box.h * 1.2;
      ctx.save();
      ctx.globalAlpha = base * Math.sin(ph * Math.PI) * 0.9;
      ctx.translate(x + Math.sin(ph * 8 + i) * 6, y);
      ctx.rotate(ph * 7 + i);
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fillRect(-2.5, -4, 5, 8);
      ctx.restore();
    }
    ctx.restore();
  },
};

/** 4方向のきらめき */
function star4(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.18, -s * 0.18, s, 0);
  ctx.quadraticCurveTo(s * 0.18, s * 0.18, 0, s);
  ctx.quadraticCurveTo(-s * 0.18, s * 0.18, -s, 0);
  ctx.quadraticCurveTo(-s * 0.18, -s * 0.18, 0, -s);
  ctx.closePath();
  ctx.fill();
}

/** ハート */
function heart(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.9);
  ctx.bezierCurveTo(-s * 1.5, -s * 0.2, -s * 0.6, -s * 1.3, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.6, -s * 1.3, s * 1.5, -s * 0.2, 0, s * 0.9);
  ctx.closePath();
  ctx.fill();
}

/** 八分音符 */
function note(ctx, s) {
  ctx.beginPath();
  ctx.ellipse(-s * 0.35, s * 0.5, s * 0.42, s * 0.32, -0.4, 0, TAU);
  ctx.fill();
  ctx.fillRect(-s * 0.02, -s * 0.9, s * 0.2, s * 1.5);
  ctx.beginPath();
  ctx.moveTo(s * 0.18, -s * 0.9);
  ctx.quadraticCurveTo(s * 0.9, -s * 0.6, s * 0.5, s * 0.05);
  ctx.quadraticCurveTo(s * 0.7, -s * 0.5, s * 0.18, -s * 0.45);
  ctx.closePath();
  ctx.fill();
}

/* ────────────────────────────────────────────────────────────
 * 描画
 * ──────────────────────────────────────────────────────────── */

/**
 * scale=1 のときにキャラ(=セル1枚)を収める箱。
 * 素材のセルが 250.8×313.5(縦長)なので、箱も同じ比率にして歪ませない。
 * 高さはジョージ(150)と揃えてあるので、chars/index.js の scale 感覚が共通で使える。
 */
const BOX = { w: 132, h: 165 };

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* ────────────────────────────────────────────────────────────
 * 「出ている間は透けない」ための不透明化(2026-08-14 バグ修正)
 *
 * ■ 症状
 *   カメオが出ると **ルナだけ幽霊のように透けて見える**。
 *
 * ■ 原因(実測)
 *   drawLuna に届く alpha を計測したところ、決めポーズ保持中もずっと
 *   **0.55 で固定** されていた。0.55 = 1 - 0.45 で、これは
 *   render/lcd.js の CHAR_DIM_WHILE_TEXT(=0.45)そのもの。
 *   lcd.js は「演出テキスト帯が出ている間はキャラを沈める」ために
 *   chars/index.js の draw へ dim を渡し、index.js はそれを
 *   **全キャラ一律**(kiro / george / luna)に掛けている。
 *   ルナが出るのはレア役成立時=テキスト帯がまさに出ている瞬間なので、
 *   カメオは事実上 **毎回** 55% まで沈められていた。
 *
 * ■ ここでの対処
 *   ルナは「数百ゲームに1回のプレミア」で、しかも定位置は左下(y238)。
 *   テキスト帯(中心 y194)の下をくぐる位置関係なので、文字を邪魔しない。
 *   よって **沈める対象から外す** のが正しい。
 *   ただし減光は呼び出し側(index.js)で alpha に畳み込まれて届くため、
 *   ここでは「見えていると判断できる濃さなら不透明として描く」に寄せる。
 *   入場/退場のフェードは 0〜LUNA_SOLID_AT の区間に圧縮されて残るので、
 *   ふっと出てすっと消える手触りはそのまま。
 *
 * ■ しきい値を 0.5 にした理由
 *   減光が入っても入らなくても不透明にしたいので、想定しうる減光後の値
 *   (0.55)より下に置く。lcd.js 側の減光量が多少変わっても効き続ける。
 * ──────────────────────────────────────────────────────────── */
const LUNA_SOLID_AT = 0.5;

/** 呼び出し側の alpha を「見えている=不透明」に寄せる */
const solidify = (a) => clamp01(a / LUNA_SOLID_AT);

/**
 * ルナを1体描く。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {number} state.x
 * @param {number} state.y
 * @param {number} [state.scale=1]
 * @param {string} [state.pose] ポーズ名 / シチュエーション名
 * @param {string} [state.anim] 既定アニメの上書き(ANIMS のキー / 'none' で静止)
 * @param {number} [state.t=0] 経過秒
 * @param {number} [state.dir=1] 1=右向き -1=左向き(mirror:true のポーズだけ効く)
 * @param {number} [state.alpha=1]
 *   0〜1。**プレミアカメオなので減光は受け付けない**(上の LUNA_SOLID_AT 参照)。
 *   入場/退場のフェードだけが残るように solidify() を通してから使う。
 * @param {boolean} [state.fx=true] 追加エフェクトを描くか
 * @param {boolean} [state.aura=true]
 *   プレミアの後光(V21-10)。「小さくて存在感がない」への対処で、
 *   キャラの後ろに虹色の光条とスポットを敷いて **特別枠であること** を出す。
 */
export function drawLuna(ctx, state) {
  const {
    x, y, scale = 1, t = 0, dir = 1, alpha = 1, fx = true, aura = true,
  } = state;
  const solid = solidify(alpha);
  if (solid <= 0 || scale <= 0) return;

  const name = resolveLunaPose(state.pose);
  const pose = LUNA_POSES[name];
  const art = lunaPoseArt(name);

  // 芝居(ポーズ既定 → state.anim で上書き)
  const animName = state.anim ?? pose.anim ?? 'idle';
  const anim = ANIMS[animName] ?? ANIMS.idle;
  const m = animName === 'none' ? {} : anim(t, state);
  const dx = m.dx ?? 0;
  const dy = m.dy ?? 0;
  const rot = m.rot ?? 0;
  const sx = m.sx ?? 1;
  const sy = m.sy ?? 1;

  // 画面上でキャラが向く方向。反転を許したポーズだけ dir に従い、
  // それ以外は素材のまま(Tシャツの文字を鏡文字にしないため)
  const screenDir = pose.mirror ? (dir >= 0 ? 1 : -1) : (pose.facing ?? 1);
  const flip = pose.mirror && screenDir * (pose.facing ?? 1) < 0 ? -1 : 1;

  ctx.save();
  ctx.globalAlpha = solid;

  // 後光は芝居のオフセットを掛けない(光の位置がぶれると安っぽく見える)
  if (aura) drawPremiumAura(ctx, x, y, scale, t);

  ctx.translate(x + dx * scale, y + dy * scale);
  ctx.scale(scale, scale);

  if (fx && pose.fx && FX[pose.fx]) {
    // エフェクト自体は反転させない(向きが要るものは screenDir を見る)
    FX[pose.fx](ctx, t, BOX, pose.fxColor ?? LUNA_COLORS.accent, screenDir);
  }

  ctx.rotate(rot);
  ctx.scale(sx * flip, sy);

  if (art) {
    // セル全体を箱に合わせて縮小し、絵はセル内の位置関係を保ったまま置く
    const k = Math.min(BOX.w / art.cellW, BOX.h / art.cellH);
    const dw = art.w * k;
    const dh = art.h * k;
    const cx = (art.ox + art.w / 2 - art.cellW / 2) * k;
    const cy = (art.oy + art.h / 2 - art.cellH / 2) * k;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(art.canvas, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    drawLoadingLuna(ctx);
  }
  ctx.restore();
}

/**
 * プレミアの後光(V21-10「ルナが小さく存在感がない」への対処)。
 *
 * ゆっくり回る光条 + 足元のスポットで「特別な子が立っている」画を作る。
 * 光は加算合成なので、下の盤面を消さずに明るさだけ足せる。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} scale キャラの表示倍率(光の大きさもこれに追従させる)
 * @param {number} t 経過秒
 */
function drawPremiumAura(ctx, x, y, scale, t) {
  const r = BOX.h * 0.62 * scale;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(x, y - BOX.h * 0.06 * scale);

  // 回る光条(12本)。細く長く、明滅させて「後光」に見せる
  ctx.save();
  ctx.rotate(t * 0.35);
  for (let i = 0; i < 12; i++) {
    const k = 0.35 + 0.35 * Math.sin(t * 2.4 + i * 0.9);
    ctx.rotate((Math.PI * 2) / 12);
    ctx.fillStyle = `rgba(255,226,146,${0.09 * k})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r * 1.25, -r * 0.09);
    ctx.lineTo(r * 1.25, r * 0.09);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 中心のやわらかい光
  const g = ctx.createRadialGradient(0, 0, r * 0.12, 0, 0, r);
  g.addColorStop(0, 'rgba(255,240,200,0.26)');
  g.addColorStop(0.55, 'rgba(255,180,220,0.13)');
  g.addColorStop(1, 'rgba(180,140,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * 画像が来るまでのつなぎ。
 * 一瞬しか出ないので「金髪の子が居る」ことだけ伝わればよい。
 */
function drawLoadingLuna(ctx) {
  ctx.save();
  ctx.globalAlpha *= 0.9;
  // 髪
  ctx.fillStyle = LUNA_COLORS.hair;
  ctx.strokeStyle = LUNA_COLORS.outline;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.ellipse(0, -34, 34, 36, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // 体(黒Tシャツ)
  ctx.fillStyle = LUNA_COLORS.shirt;
  ctx.beginPath();
  ctx.roundRect?.(-24, -6, 48, 54, 10);
  if (!ctx.roundRect) ctx.rect(-24, -6, 48, 54);
  ctx.fill();
  ctx.stroke();
  // 眼鏡のハイライトだけ入れて「あの子」だと分かるようにする
  ctx.fillStyle = LUNA_COLORS.glass;
  ctx.globalAlpha *= 0.85;
  ctx.beginPath();
  ctx.ellipse(-11, -32, 9, 7, 0, 0, TAU);
  ctx.ellipse(11, -32, 9, 7, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ────────────────────────────────────────────────────────────
 * chars/index.js へ登録するデータ
 * ──────────────────────────────────────────────────────────── */

const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeInCubic = (x) => x * x * x;
const easeOutBack = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

/**
 * ルナ専用のモーション。chars/index.js の MOTIONS へマージされる。
 * (カメオ演出の「入場 → ポーズ決め → 退場」の3拍がここで完結する)
 */
export const LUNA_MOTIONS = {
  /** 画面の左端からひょっこり出てくる */
  lunaPeekIn: { ms: 620, apply: (c, p) => {
    const e = easeOutBack(p);
    c.offsetX = -150 * (1 - e);
    c.offsetY = (1 - easeOutCubic(p)) * 8;
    c.alphaMul = Math.min(1, p / 0.18);
    c.tilt = (1 - p) * 0.12;
  } },
  /** ポーズを決める(ぽんっと弾んで止まる) */
  lunaPop: { ms: 560, apply: (c, p) => {
    const e = easeOutBack(Math.min(1, p / 0.55));
    c.scaleMul = 0.82 + 0.18 * e;
    const up = Math.sin(Math.min(1, p / 0.55) * Math.PI);
    c.offsetY = -up * 14;
    c.squashX = 1 + (1 - up) * 0.05 - up * 0.03;
    c.squashY = 1 - (1 - up) * 0.05 + up * 0.05;
  } },
  /**
   * すっと左へ引っ込む。
   *
   * 動き自体は従来どおり 620ms で終わるが、モーションの尺は 1000ms 取ってある。
   * 理由: モーションが切れた瞬間 alphaMul が 1 へ戻るので、
   *   退場フェード(ここ)より先にモーションが終わると、
   *   まだ消えきっていないルナが **一瞬また濃く出てしまう**。
   * 演出データ(data/scenarios/yokoku-luna.js)は退場 1900ms / hide 2500ms で、
   * hide 後のフェード(chars/index.js の 220ms)が終わるのは 2720ms。
   * そこまで尺を伸ばして「消えたあとにモーションが切れる」順序を保証する。
   */
  lunaSlipOut: { ms: 1000, apply: (c, p) => {
    const move = clamp01(p / 0.62);                 // 移動と傾きは 620ms で完了
    c.offsetX = -170 * easeInCubic(move);
    c.alphaMul = 1 - clamp01((p - 0.2) / 0.42);     // 2100ms から 2520ms かけて 0 へ
    c.tilt = move * 0.1;
  } },
  /** 万歳しながら2回跳ねる(お祝い) */
  lunaHooray: { ms: 1100, apply: (c, p) => {
    const ph = (p * 2) % 1;
    const up = Math.sin(ph * Math.PI);
    c.offsetY = -up * 26;
    c.squashX = 1 + (1 - up) * 0.07 - up * 0.04;
    c.squashY = 1 - (1 - up) * 0.07 + up * 0.06;
    c.tilt = Math.sin(p * Math.PI * 5) * 0.09;
  } },
  /** 目を丸くしてビクッ(驚き) */
  lunaStartle: { ms: 520, apply: (c, p) => {
    const k = 1 - p;
    c.offsetX = Math.sin(p * Math.PI * 16) * 5 * k;
    c.offsetY = -Math.sin(Math.min(1, p / 0.3) * Math.PI) * 10;
    c.scaleMul = 1 + Math.sin(Math.min(1, p / 0.3) * Math.PI) * 0.08;
  } },
};

/**
 * モード別の定位置(LCD 440×300 の論理座標)。
 *
 * ルナは「左下からひょっこり出る」カメオ専用なので、
 * 常設キャラ(右のキロ・左のジョージ)と真正面からぶつからない位置にしてある。
 * ここに無いモードは default が使われる。
 *
 * ■ 2026-08-14 V21-10「ルナが小さく存在感がない」
 *   0.68(高さ ≒ 112px)では液晶 300px の中で埋もれていた。
 *   数百ゲームに1回しか出ない枠なので、出たときは **液晶の半分を使う** 大きさへ。
 *     FREE_TIER … 165 × 0.92 ≒ 152px(上端 y112 / 足元 y264 = テロップ帯の手前)
 *   位置も左端から少し内側へ出して、後光(drawPremiumAura)ごと収まるようにした。
 *   ジョージ(左下)とぶつかるが、カメオが出ているあいだは
 *   render/chars/index.js が常設キャラを沈めるので画は混ざらない。
 */
export const LUNA_HOMES = {
  default:   { x: 108, y: 196, scale: 0.80 },
  FREE_TIER: { x: 112, y: 188, scale: 0.92 },
  // CZ はグラフ(y58〜208)があるので控えめ。それでも旧値より一回り大きい
  CZ:        { x: 96, y: 214, scale: 0.66 },
};
