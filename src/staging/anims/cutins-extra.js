/**
 * 強予告・カットイン追加パック(overlay レイヤー)。IDEAS.md 2-10 / 2-12 / 2-19 / 2-23
 *
 * `src/staging/anims/cutins.js` と同じ関数シグネチャ
 *   { ms, draw(ctx, p, params, w, h) }
 * で実装した自己完結モジュール。既存 CUTINS には手を触れず、
 * `CUTINS_EXTRA` をエクスポートするだけに留める。
 *
 * 統合担当への依頼: `src/staging/anims/cutins.js` の `CUTINS` オブジェクトへ
 *   import { CUTINS_EXTRA } from './cutins-extra.js';
 *   export const CUTINS = { ...(元のCUTINS定義), ...CUTINS_EXTRA };
 * の形でマージしてください(または `Object.assign(CUTINS, CUTINS_EXTRA)`)。
 */

import { drawGeorge } from '../../render/chars/george.js';
import { getLayerRect } from '../../engine/layers.js';
import { drawKiro } from '../../render/chars/kiro.js';

const FONT_HEAVY = '"Arial Black", "Helvetica Neue", "Hiragino Sans", sans-serif';

/* ══ 文字は液晶の中だけに描く(2026-08-13 ユーザー指示)═══════════════
 *
 * 「画面(ディスプレイ)の外で文字は表示しないで」。
 * 全画面カットインの集中線・パーティクル・シェイク・キャラは 720×1080 のまま
 * 描いてよいが、**読ませる文字は液晶の表示矩形の中へ収める**。
 *
 * 呼び出し側は従来どおり論理座標の y を渡してよい。ここで
 * 「リール窓帯(430〜660)へ置くつもりで書かれた y」を液晶の下半分へ写像するので、
 * 2行組み(上段ロゴ/下段ロゴ)の上下関係は保たれたまま液晶内へ畳み込まれる。
 * 液晶の位置は筐体アートに合わせて動く(setLayerViews)ため、毎回 getLayerRect で取る。
 */
const TEXT_SRC_TOP = 430;
const TEXT_SRC_BOTTOM = 660;

/**
 * 文字を置いてよい液晶内の座標へ変換する。
 * @param {number} y 呼び出し側が意図した論理座標の y
 * @param {number} size 文字の想定サイズ(はみ出し防止のマージンに使う)
 * @returns {{x:number, y:number, maxWidth:number}}
 */
function lcdTextSpot(y, size = 40) {
  const r = getLayerRect('lcd');
  const t = Math.max(0, Math.min(1, (y - TEXT_SRC_TOP) / (TEXT_SRC_BOTTOM - TEXT_SRC_TOP)));
  const half = Math.max(10, size * 0.62);
  const top = r.y + r.h * 0.34 + half;
  const bottom = r.y + r.h - 10 - half;
  const cy = bottom > top ? top + (bottom - top) * t : (r.y + r.h / 2);
  return { x: r.x + r.w / 2, y: cy, maxWidth: Math.max(60, r.w - 24) };
}


const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeOutBack = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
const easeOutQuint = (x) => 1 - (1 - x) ** 5;

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
 * インパクトテキスト。maxWidth に収まるまでフォントを詰める。
 * cutins.js の同名関数と同じ挙動(座標系: 論理 720×1080、テキストは y=440〜620 のリール窓帯に収める)。
 * 初期サイズ62 / 下限22 は cutins.js と同じ値。既存カットインと字面を揃えるため、
 * ここを単独で変えないこと(統合時に共通ユーティリティへ切り出す想定)。
 */
function drawImpactText(ctx, text, x, y, p, colors, maxWidth = 600) {
  if (p <= 0) return;
  // 文字は液晶の中だけ(呼び出し側の座標は「意図した並び順」として使う)
  const spot = lcdTextSpot(y, 62);
  maxWidth = Math.min(maxWidth, spot.maxWidth);
  ctx.save();
  ctx.translate(spot.x, spot.y);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 先にフォントを決めてから倍率を掛ける。
  // 出現の跳ね(easeOutBack は 1 を超える)で液晶からはみ出さないよう、
  // 実測幅から「これ以上大きくできない倍率」を求めて頭打ちにする。
  let size = 62;
  ctx.font = `900 ${size}px ${FONT_HEAVY}`;
  while (ctx.measureText(text).width > maxWidth && size > 22) {
    size -= 2;
    ctx.font = `900 ${size}px ${FONT_HEAVY}`;
  }
  const lcdH = getLayerRect('lcd').h;
  const tw = Math.max(1, ctx.measureText(text).width);
  const maxScale = Math.min(maxWidth / tw, (lcdH * 0.34) / size);
  const s = Math.min(easeOutBack(clamp01(p)), maxScale);
  ctx.scale(s, s);
  ctx.lineWidth = Math.max(6, size * 0.24);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20,0,20,0.9)';
  ctx.strokeText(text, 0, 0);
  const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** キャラを1回だけオフスクリーンに描いてキャッシュする(cutins.js の CharCache と同じ実装) */
class CharCache {
  constructor() {
    this.cache = new Map();
  }

  /** @returns {HTMLCanvasElement} */
  get(key, w, h, drawFn) {
    if (this.cache.has(key)) return this.cache.get(key);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cx = c.getContext('2d');
    cx.save();
    cx.translate(w / 2, h / 2);
    drawFn(cx);
    cx.restore();
    this.cache.set(key, c);
    return c;
  }
}

const charCache = new CharCache();

/* ══ RUSH突入スラム(全画面カットイン)══════════════════
 *
 * docs/BACKLOG.md「P」/ ユーザー要望「RUSH突入はカットインで大きく表示してほしい」。
 * ゴースト7揃い → BIG BONUS ロゴドン、と同格の見せ場にするための全画面演出。
 *
 * ■ 座標の前提(論理 720×1080)
 *   既存の常設表示は リール窓 y440〜620 / HUD y630〜690 / 停止ボタン y702〜758。
 *   常設のLCD表示がここへ被るのはNGだが、**カットインは transient(1.6秒で消える)**
 *   ので、迫力を優先して画面全体を使ってよい。ロゴは意図的に HUD 帯まで踏み込ませる。
 *
 * ■ 1本のカットインを変種テーブルで使い回す
 *   AS_RUSH / SERVERLESS_RUSH / MULTI_REGION は「同じ型の色違い・文言違い」なので、
 *   描き方は共通にして RUSH_VARIANTS のデータだけを差し替える。
 *   シナリオ側は { id: 'rush_slam', variant: 'AS_RUSH' } と書くだけでよい。
 */

/**
 * 変種テーブル。
 *   title1 / title2 … 2段組みの巨大ロゴ(下段のほうが大きくスラムインする)
 *   rgb              … 集中線と背景バーストの基調色(カンマ区切りのRGB)
 *   grad1 / grad2    … ロゴのグラデーション [上, 下]
 *   icon             … 放射状に飛ぶアイコン 'instance'(EC2の箱) / 'lambda'(λ) / 'region'(◆)
 *   char             … ドンと出るキャラ 'george'(サメ) / 'kiro'(幽霊)
 */
const RUSH_VARIANTS = {
  AS_RUSH: {
    title1: 'AUTO SCALING',
    title2: 'RUSH',
    rgb: '123,247,208',
    grad1: ['#e8fff8', '#12a08a'],
    grad2: ['#fff7b0', '#ff8a00'],
    icon: 'instance',
    iconColors: ['#7bf7d0', '#12a08a'],
    char: 'george',
  },
  SERVERLESS_RUSH: {
    title1: 'SERVERLESS',
    title2: 'RUSH',
    rgb: '255,180,106',
    grad1: ['#fff3c4', '#ff8a00'],
    grad2: ['#ffffff', '#ff5a00'],
    icon: 'lambda',
    iconColors: ['#ffd9a0', '#ff8a00'],
    char: 'kiro',
  },
  MULTI_REGION: {
    title1: 'MULTI-REGION',
    title2: 'RUSH',
    rgb: '255,154,213',
    grad1: ['#ffe0f4', '#c026a8'],
    grad2: ['#ffffff', '#ff3da6'],
    icon: 'region',
    iconColors: ['#ffb0f0', '#a020c0'],
    char: 'george',
  },
};

/** 中心から放射状に伸びる集中線(cutins.js の drawSpeedLines より本数と伸びを強めた版) */
function drawRadialBurstLines(ctx, w, h, cx, cy, p, rgb) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, p * 6) * (1 - p * 0.55);
  ctx.translate(cx, cy);
  ctx.rotate(p * 0.9);
  const reach = 300 + easeOutCubic(p) * 900;
  for (let i = 0; i < 30; i++) {
    ctx.rotate((Math.PI * 2) / 30);
    ctx.fillStyle = `rgba(${rgb},${0.13 + (i % 3) * 0.05})`;
    ctx.beginPath();
    ctx.moveTo(70, 0);
    ctx.lineTo(reach, -22);
    ctx.lineTo(reach, 22);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 放射状に飛ぶアイコン1個を描く(原点が中心) */
function drawRushIcon(ctx, kind, size, colors) {
  if (kind === 'lambda') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${size * 2}px ${FONT_HEAVY}`;
    ctx.lineWidth = size * 0.34;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(60,20,0,0.85)';
    ctx.strokeText('λ', 0, 0);
    ctx.fillStyle = colors[0];
    ctx.fillText('λ', 0, 0);
    return;
  }
  if (kind === 'region') {
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size, 0);
    ctx.closePath();
  } else {
    roundRect(ctx, -size, -size, size * 2, size * 2, size * 0.3);
  }
  const g = ctx.createLinearGradient(0, -size, 0, size);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = size * 0.16;
  ctx.stroke();
}

/**
 * 巨大ロゴのスラムイン(「ドン!」)。
 *
 * drawImpactText(最大62px)より一回り大きい 112px 級で、
 * 画面奥から手前へ叩きつけるように入る。これが「ロゴドン」の正体:
 *   1. 3.4倍の大きさから一気に等倍まで詰める(easeOutQuint = 減速がきつい)
 *   2. 着弾の瞬間だけ横に潰れる(スカッシュ)
 *   3. 着弾後は微振動しながら金の縁が明滅する
 *
 * @param {number} t 0→1 の進行度(このロゴ自身の)
 * @param {number} shake 着弾後の揺れ量
 */
function drawSlamText(ctx, text, x, y, t, colors, { maxWidth = 660, size = 112, shake = 0 } = {}) {
  if (t <= 0) return;
  // 文字は液晶の中だけ。スラムの迫力は脈動・シェイク・エフェクト側で担保する
  const spot = lcdTextSpot(y, size);
  x = spot.x;
  y = spot.y;
  maxWidth = Math.min(maxWidth, spot.maxWidth);
  size = Math.min(size, Math.round(getLayerRect('lcd').h * 0.30));
  const e = easeOutQuint(clamp01(t));
  // 着弾(t≈0.42)の直後だけ横に潰れて弾む
  const land = clamp01((t - 0.42) / 0.18);
  const squash = t < 0.42 ? 1 : 1 + Math.sin(land * Math.PI) * 0.16;

  ctx.save();
  ctx.globalAlpha = Math.min(1, t * 5);
  ctx.translate(x + (shake ? Math.sin(t * 90) * shake : 0), y);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 先にフォントを決めてから倍率を掛ける
  let fs = size;
  ctx.font = `900 ${fs}px ${FONT_HEAVY}`;
  while (ctx.measureText(text).width > maxWidth && fs > 28) {
    fs -= 3;
    ctx.font = `900 ${fs}px ${FONT_HEAVY}`;
  }
  // 液晶からはみ出さない最大倍率。スラムは「この上限から等倍へ落ちてくる」動きになる
  // (奥から叩きつける迫力は squash・shake・脈動と背景エフェクトで担保する)
  const lcdH2 = getLayerRect('lcd').h;
  const tw2 = Math.max(1, ctx.measureText(text).width);
  const maxScale = Math.min(maxWidth / tw2, (lcdH2 * 0.34) / fs);
  const scale = Math.min(1 + (1 - e) * 2.4, maxScale);
  ctx.scale(scale * squash, scale / squash);

  // 着弾後に金の縁が明滅する
  if (t > 0.42) {
    ctx.shadowColor = colors[1];
    ctx.shadowBlur = 26 + Math.sin(t * 26) * 14;
  }
  ctx.lineWidth = Math.max(10, fs * 0.26);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(18,4,24,0.95)';
  ctx.strokeText(text, 0, 0);
  ctx.shadowBlur = 0;

  const g = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2);
  g.addColorStop(0, colors[0]);
  g.addColorStop(0.55, colors[1]);
  g.addColorStop(1, colors[0]);
  ctx.fillStyle = g;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** 追加カットイン定義。CUTINS と同じ形式で、既存 cutins.js とはキーが重複しない */
export const CUTINS_EXTRA = {
  /**
   * RUSH突入スラム(全画面・1600ms)。
   * params: { variant='AS_RUSH' } … RUSH_VARIANTS のキー
   *
   * 時間割:
   *   0.00〜0.14 溜め(暗転 → 白フラッシュ → 収縮リング)
   *   0.08〜0.55 集中線 + アイコンが円形に展開してから外へ飛ぶ
   *   0.18〜     キャラがドンと迫り出す
   *   0.26〜     上段ロゴがスラムイン
   *   0.40〜     下段ロゴ(RUSH)がさらに大きくスラムイン
   *   0.55〜     金の粒が舞い、全体が明滅
   */
  rush_slam: {
    ms: 1600,
    draw(ctx, p, params, w, h) {
      const V = RUSH_VARIANTS[params.variant] ?? RUSH_VARIANTS.AS_RUSH;
      const cx = w / 2;
      const cy = h * 0.40;

      // ── 溜め: 一瞬の暗転 → 白フラッシュ ──
      const charge = clamp01(p / 0.14);
      ctx.save();
      ctx.globalAlpha = (1 - charge) * 0.72;
      ctx.fillStyle = '#04060c';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      if (p < 0.2) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p / 0.2) * 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // 収縮するリング(エネルギーが中心へ集まる)
      if (p < 0.22) {
        const rp = clamp01(p / 0.22);
        ctx.save();
        ctx.globalAlpha = 1 - rp;
        ctx.strokeStyle = `rgba(${V.rgb},0.9)`;
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(cx, cy, 620 * (1 - easeOutCubic(rp)) + 40, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // ── 集中線 ──
      if (p > 0.06) drawRadialBurstLines(ctx, w, h, cx, cy, clamp01((p - 0.06) / 0.5), V.rgb);

      // ── 背景バースト ──
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const burst = easeOutCubic(clamp01((p - 0.05) / 0.4));
      const bg = ctx.createRadialGradient(cx, cy, 10, cx, cy, 60 + burst * 620);
      bg.addColorStop(0, `rgba(255,255,255,${0.5 * (1 - p * 0.6)})`);
      bg.addColorStop(0.35, `rgba(${V.rgb},${0.42 * (1 - p * 0.5)})`);
      bg.addColorStop(1, `rgba(${V.rgb},0)`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // ── アイコンが円形に展開 → 外へ飛び散る ──
      const ICONS = 12;
      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < ICONS; i++) {
        const ip = clamp01((p - 0.08 - (i % 4) * 0.03) / 0.24);
        if (ip <= 0) continue;
        const ang = (i / ICONS) * Math.PI * 2 - Math.PI / 2 + p * 0.5;
        // 0.42 までは円周へ整列、その後は外へ加速して飛び去る
        const fly = clamp01((p - 0.42) / 0.5);
        const r = 150 * easeOutBack(ip) + fly * 780;
        const a = ip * (1 - fly);
        if (a <= 0) continue;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(Math.cos(ang) * r, Math.sin(ang) * r);
        ctx.rotate(p * 2.4 + i);
        drawRushIcon(ctx, V.icon, 26 * (1 - fly * 0.4), V.iconColors);
        ctx.restore();
      }
      ctx.restore();

      // ── キャラがドンと迫り出す(オフスクリーンに1回描いてから拡大: DESIGN.md 注意事項8)──
      const chP = clamp01((p - 0.18) / 0.3);
      if (chP > 0) {
        const key = `rush_slam_${V.char}`;
        const cache = V.char === 'kiro'
          ? charCache.get(key, 360, 360, (c) => {
            drawKiro(c, { x: 0, y: 0, scale: 1.5, pose: 'premium', t: 0 });
          })
          : charCache.get(key, 420, 340, (c) => {
            drawGeorge(c, { x: 0, y: 0, scale: 1.9, t: 0, dir: 1, mouthOpen: 1, tailAngle: -0.4, brow: -0.5 });
          });
        ctx.save();
        // 手前へ迫ってきて、そのまま少しだけ通り過ぎる
        ctx.globalAlpha = Math.min(1, chP * 3) * (p > 0.78 ? Math.max(0, 1 - (p - 0.78) / 0.22) : 1);
        ctx.translate(cx - 40 + easeOutCubic(chP) * 60, cy - 20);
        const s = 1.9 - easeOutCubic(chP) * 0.65;
        ctx.scale(s, s);
        ctx.drawImage(cache, -(cache.width / 2), -(cache.height / 2));
        ctx.restore();
      }

      // ── 巨大ロゴ(2段のスラムイン)──
      // 上段は控えめ、下段 RUSH を一番大きく叩きつける
      drawSlamText(ctx, V.title1, cx, h * 0.44, clamp01((p - 0.26) / 0.34), V.grad1, {
        maxWidth: 640, size: 84, shake: p > 0.5 ? 1.6 : 0,
      });
      drawSlamText(ctx, V.title2, cx, h * 0.585, clamp01((p - 0.40) / 0.34), V.grad2, {
        maxWidth: 660, size: 148, shake: p > 0.62 ? 2.6 : 0,
      });

      // ── 金の粒が舞う ──
      if (p > 0.5) {
        const sp = (p - 0.5) / 0.5;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 26; i++) {
          const seed = i * 53;
          const x = (seed * 11) % w;
          const fall = ((sp * (0.5 + (i % 5) * 0.16)) % 1);
          const y = -30 + fall * (h + 60);
          ctx.globalAlpha = 0.75 * (1 - sp * 0.5);
          ctx.fillStyle = i % 3 === 0 ? '#ffffff' : `rgba(${V.rgb},0.95)`;
          ctx.beginPath();
          ctx.arc(x, y, 4 + (i % 3) * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ── 終わり際の締めフラッシュ ──
      if (p > 0.88) {
        ctx.save();
        ctx.globalAlpha = (1 - clamp01((p - 0.88) / 0.12)) * 0.4;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    },
  },

  /** GuardDuty警告カットイン(不審検知→実は激アツ)。IDEAS.md 2-10 */
  guardduty_alert: {
    ms: 2000,
    draw(ctx, p, params, w, h) {
      const cx = w / 2;
      const cy = h * 0.36;

      // 緊迫の赤い明滅背景
      ctx.save();
      ctx.globalAlpha = Math.min(1, p * 6) * (Math.sin(p * 32) > 0 ? 0.16 : 0.06);
      ctx.fillStyle = '#ff2d2d';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // 警告三角アイコン
      const triP = clamp01(p / 0.3);
      if (triP > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, triP * 3);
        ctx.translate(cx, cy);
        const s = easeOutBack(triP);
        ctx.scale(s, s);
        ctx.beginPath();
        ctx.moveTo(0, -80);
        ctx.lineTo(70, 60);
        ctx.lineTo(-70, 60);
        ctx.closePath();
        ctx.fillStyle = '#ffcc33';
        ctx.fill();
        ctx.strokeStyle = '#7a2400';
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.fillStyle = '#7a2400';
        ctx.font = `900 72px ${FONT_HEAVY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', 0, 18);
        ctx.restore();
      }

      // タイプライターで警告文が出る
      if (p > 0.15 && p < 0.6) {
        const full = 'SUSPICIOUS ACTIVITY DETECTED';
        const tp = clamp01((p - 0.15) / 0.35);
        const shown = full.slice(0, Math.ceil(full.length * tp));
        ctx.save();
        ctx.globalAlpha = Math.min(1, tp * 4);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const sp = lcdTextSpot(500, 22);
        ctx.font = `900 22px ${FONT_HEAVY}`;
        ctx.lineWidth = 5;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(30,0,0,0.85)';
        ctx.strokeText(shown, sp.x, sp.y);
        ctx.fillStyle = '#ff5a5a';
        ctx.fillText(shown, sp.x, sp.y);
        ctx.restore();
      }

      // 実は激アツ判明: 金色に破裂
      if (p > 0.55) {
        const bp = clamp01((p - 0.55) / 0.2);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 40 + bp * 420);
        g.addColorStop(0, `rgba(255,230,140,${0.7 * (1 - bp * 0.5)})`);
        g.addColorStop(1, 'rgba(255,150,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      if (p > 0.62) {
        drawImpactText(ctx, 'GUARDDUTY ALERT!!', cx, 574, clamp01((p - 0.62) / 0.28), ['#fff3a0', '#ff8a00'], 620);
      }
    },
  },

  /** WAFブロックカットイン(敵アクセスを弾く爽快演出→実は激アツ)。IDEAS.md 2-19 */
  waf_shield_block: {
    ms: 1800,
    draw(ctx, p, params, w, h) {
      const cx = w / 2;
      const cy = h * 0.36;

      // 攻撃線(左から複数飛んでくる)
      ctx.save();
      for (let i = 0; i < 5; i++) {
        const off = i * 0.05;
        const bp = clamp01((clamp01(p / 0.4) - off) / 0.5);
        if (bp <= 0 || bp >= 1) continue;
        const bx = -60 + bp * (cx + 60);
        const by = cy - 60 + i * 30;
        ctx.globalAlpha = 1 - bp * 0.3;
        ctx.fillStyle = '#ff4d4d';
        ctx.beginPath();
        ctx.moveTo(bx - 30, by - 4);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx - 30, by + 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // 盾
      const shieldP = clamp01(p / 0.25);
      if (shieldP > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, shieldP * 4);
        ctx.translate(cx, cy);
        const s = easeOutBack(shieldP);
        ctx.scale(s, s);
        ctx.beginPath();
        ctx.moveTo(0, -78);
        ctx.quadraticCurveTo(66, -60, 66, 0);
        ctx.quadraticCurveTo(66, 62, 0, 90);
        ctx.quadraticCurveTo(-66, 62, -66, 0);
        ctx.quadraticCurveTo(-66, -60, 0, -78);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, -78, 0, 90);
        g.addColorStop(0, '#9fe8ff');
        g.addColorStop(1, '#1f6fbf');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = '#0b2540';
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 38px ${FONT_HEAVY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('WAF', 0, 4);
        ctx.restore();
      }

      // 弾かれた瞬間の閃光
      if (p > 0.35 && p < 0.6) {
        const fp = clamp01((p - 0.35) / 0.25);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - fp;
        const g2 = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30 + fp * 140);
        g2.addColorStop(0, 'rgba(255,255,220,0.9)');
        g2.addColorStop(1, 'rgba(140,200,255,0)');
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      if (p > 0.42 && p < 0.62) {
        ctx.save();
        ctx.globalAlpha = clamp01((p - 0.42) / 0.1);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 28px ${FONT_HEAVY}`;
        ctx.lineWidth = 6;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0,10,30,0.85)';
        const sp = lcdTextSpot(512, 28);
        ctx.strokeText('BLOCKED', sp.x, sp.y);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('BLOCKED', sp.x, sp.y);
        ctx.restore();
      }

      if (p > 0.6) {
        drawImpactText(ctx, 'WAF PROTECTED!!', cx, 578, clamp01((p - 0.6) / 0.3), ['#c8f3ff', '#1f9bd6'], 620);
      }
    },
  },

  /** IAMロールカットイン(サメがAdministratorAccessバッジ装着)。IAMポリシー=チェリー格の延長ネタ。IDEAS.md 2-12 */
  iam_admin_badge: {
    ms: 2000,
    draw(ctx, p, params, w, h) {
      const cx = w / 2;
      const cy = h * 0.38;

      // George がせり上がって登場
      const showP = clamp01(p / 0.35);
      const cache = charCache.get('george_iam_badge', 360, 300, (c) => {
        drawGeorge(c, { x: 0, y: 0, scale: 1.7, t: 0, dir: 1, mouthOpen: 0.25, tailAngle: 0.1, brow: -0.1 });
      });
      ctx.save();
      ctx.globalAlpha = Math.min(1, showP * 3);
      ctx.translate(cx, cy + (1 - easeOutCubic(showP)) * 80);
      ctx.drawImage(cache, -180, -150);
      ctx.restore();

      // 胸元にバッジが装着される
      const badgeP = clamp01((p - 0.3) / 0.3);
      if (badgeP > 0) {
        ctx.save();
        ctx.translate(cx + 30, cy + 26);
        const s = easeOutBack(badgeP);
        ctx.scale(s, s);
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a1 = (Math.PI * 2 * i) / 5 - Math.PI / 2;
          const a2 = a1 + Math.PI / 5;
          ctx.lineTo(Math.cos(a1) * 34, Math.sin(a1) * 34);
          ctx.lineTo(Math.cos(a2) * 15, Math.sin(a2) * 15);
        }
        ctx.closePath();
        const g = ctx.createLinearGradient(0, -34, 0, 34);
        g.addColorStop(0, '#fff3b0');
        g.addColorStop(1, '#ffa400');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = '#7a4a00';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }

      // ラベル
      if (p > 0.5 && p < 0.78) {
        const lp = clamp01((p - 0.5) / 0.15);
        ctx.save();
        ctx.globalAlpha = lp;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 22px ${FONT_HEAVY}`;
        ctx.lineWidth = 6;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(30,10,0,0.85)';
        const sp = lcdTextSpot(536, 22);
        ctx.strokeText('AdministratorAccess', sp.x, sp.y);
        ctx.fillStyle = '#ffe066';
        ctx.fillText('AdministratorAccess', sp.x, sp.y);
        ctx.restore();
      }

      if (p > 0.68) {
        drawImpactText(ctx, 'GRANTED!!', cx, 594, clamp01((p - 0.68) / 0.32), ['#fff3a0', '#ff8a00'], 560);
      }
    },
  },

  /** CloudTrailログ流れ予告(「Root User Login」の文字が出たら激アツ)。IDEAS.md 2-23 */
  cloudtrail_root_login: {
    ms: 2000,
    draw(ctx, p, params, w, h) {
      const cx = w / 2;
      const cy = h * 0.36;
      // ログパネルは読ませる文字の塊なので、まるごと液晶の矩形内へ収める
      // (集中線や背景の閃光は全画面のままでよい、というルールの例外側)
      const lr = getLayerRect('lcd');
      const panelW = Math.min(520, lr.w - 20);
      const panelH = Math.min(260, lr.h - 24);
      const panelX = lr.x + (lr.w - panelW) / 2;
      const panelY = lr.y + (lr.h - panelH) / 2;

      // ログパネル背景
      ctx.save();
      ctx.globalAlpha = Math.min(1, p * 6) * 0.85;
      roundRect(ctx, panelX, panelY, panelW, panelH, 14);
      ctx.fillStyle = 'rgba(6,10,18,0.9)';
      ctx.fill();
      ctx.restore();

      // ログ行が下から上へスクロールする(clip して panel 内だけ描く)
      const LOG_LINES = [
        'AssumeRole  iam-user-01',
        'DescribeInstances  ec2',
        'GetObject  s3://prod-bucket',
        'PutMetricData  cloudwatch',
        'Root User Login',
        'ListBuckets  s3',
        'InvokeFunction  lambda',
      ];
      const rootIdx = 4;
      const scrollP = clamp01(p / 0.55);
      ctx.save();
      roundRect(ctx, panelX, panelY, panelW, panelH, 14);
      ctx.clip();
      ctx.font = '700 15px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      LOG_LINES.forEach((line, i) => {
        const y = panelY + panelH - 20 - scrollP * (panelH + 40) - i * 30;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = i === rootIdx ? '#ff5a5a' : '#8ad4ff';
        ctx.fillText(`[${String(i + 1).padStart(2, '0')}] ${line}`, panelX + 20, y);
      });
      ctx.restore();

      // Root User Login 行にフォーカス
      if (p > 0.55) {
        const fp = clamp01((p - 0.55) / 0.2);
        ctx.save();
        ctx.globalAlpha = fp * 0.5;
        ctx.fillStyle = '#ff3b30';
        ctx.fillRect(panelX, panelY + panelH / 2 - 22, panelW, 44);
        ctx.restore();
      }

      if (p > 0.68) {
        drawImpactText(ctx, 'ROOT LOGIN', cx, 512, clamp01((p - 0.68) / 0.16), ['#ffe0a0', '#ff2d2d'], 560);
        drawImpactText(ctx, 'DETECTED!!', cx, 582, clamp01((p - 0.78) / 0.22), ['#ffffff', '#ff2d2d'], 560);
      }
    },
  },
};
