/**
 * 全画面カットイン(overlay レイヤー)。DESIGN.md 5.3 (z=8) / 6.5
 *
 * IDEAS.md のカットインネタを、キャラのプロシージャル描画を流用して実装する。
 * DESIGN.md 注意事項8 のとおり全画面でキャラを使う場合はオフスクリーンに
 * 1回描いてから拡大表示する。
 *
 * ══ 液晶からはみ出してよいのは「告知級」だけ(2026-08-15 ユーザー指示 U66-4)══
 *
 * この Canvas は筐体全体(720×1080)を覆っているが、**そこへ絵を出してよいのは
 * ボーナス・RUSH の当選告知だけ**(下の FULLSCREEN_CUTINS)。
 * 予告・煽りの類(WAF プロテクト等)は液晶の窓の中で完結させる:
 *   ・台の画面で起きていることは画面の中で見せる、という筐体の約束を守る
 *   ・「画面の外まで暴れた = 大当たり」という強弱の階段を作る
 * 実装は Cutins.draw() が液晶矩形でクリップして担保する(はみ出しは描かれない)。
 * **クリップに頼って画面外へ絵を置いたままにしないこと**。見えなくなるだけなので、
 * 新しいカットインは lcdSpot() / lcdCharSpot() / lcdTextSpot() で液晶内に置く。
 */

import { getLayerRect } from '../../engine/layers.js';
import { drawShark, sharkArtReady } from '../../render/chars/george.js';
import { CUTINS_EXTRA } from './cutins-extra.js';

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


/**
 * 大型キャラを液晶の中へ収めるための配置ヘルパ(2026-08-14 しおん指摘 S12)。
 *
 * ジョージ(サメ)の大型カットインが液晶からはみ出し、
 * リール窓の上半分とゾーンのルール説明まで覆っていた。
 * 文字と同じく **キャラも液晶の絵**として扱い、
 * オフスクリーンキャンバス(srcW×srcH)が液晶の指定割合に収まる倍率と中心を返す。
 *
 * @param {number} srcW キャッシュ済みキャンバスの幅
 * @param {number} srcH 同・高さ
 * @param {object} [opts]
 * @param {number} [opts.hRatio] 液晶の高さに対して使ってよい割合
 * @param {number} [opts.wRatio] 液晶の幅に対して使ってよい割合
 * @param {number} [opts.cyRatio] 液晶内の縦位置(0=上端 1=下端)
 * @returns {{x:number, y:number, scale:number, left:number, right:number}}
 */
function lcdCharSpot(srcW, srcH, { hRatio = 0.5, wRatio = 0.66, cyRatio = 0.32 } = {}) {
  const r = getLayerRect('lcd');
  const scale = Math.min(1, (r.h * hRatio) / srcH, (r.w * wRatio) / srcW);
  return {
    x: r.x + r.w / 2,
    y: r.y + r.h * cyRatio,
    scale,
    // 画面外から飛び込む演出用に、液晶の左右端も返す
    left: r.x,
    right: r.x + r.w,
  };
}

/**
 * 液晶の中へ **図形** を置くための基準点(U66-4)。
 * 文字は lcdTextSpot、キャラは lcdCharSpot、それ以外の絵はこれを使う。
 * @param {number} [cyRatio] 液晶の高さに対する縦位置(0=上端 1=下端)
 * @param {number} [cxRatio] 同・横位置
 * @returns {{x:number, y:number, w:number, h:number, top:number, bottom:number}}
 */
export function lcdSpot(cyRatio = 0.44, cxRatio = 0.5) {
  const r = getLayerRect('lcd');
  return {
    x: r.x + r.w * cxRatio,
    y: r.y + r.h * cyRatio,
    w: r.w,
    h: r.h,
    top: r.y,
    bottom: r.y + r.h,
  };
}

/**
 * 液晶の外へ出てよいカットイン = **ボーナス・RUSH の告知級**(U66-4)。
 *
 * ここに無いカットインは Cutins.draw() が液晶矩形でクリップする。
 * 足すときの基準は「当選が確定した瞬間の告知かどうか」だけ。
 * 予告・煽り・キャラのカメオは **絶対に足さない**(足すと強弱の階段が壊れる)。
 */
export const FULLSCREEN_CUTINS = new Set([
  'shark_bite_bar',      // ボーナス当選(サメがBARに噛みつく)
  'ghost_seven_don',     // ゴースト7揃い = ボーナス確定
  'big_bonus_logo',      // BIG BONUS 告知
  'rush_entry',          // RUSH 突入
  'rush_slam',           // RUSH 突入(強)
  'serverless_up',       // 上位AT(SERVERLESS RUSH)昇格
  'multi_region_entry',  // 上位AT(MULTI-REGION)昇格
  'reinvent_keynote',    // エンディング(完走)
  'spot_entry',          // RUSH 派生ゾーンの突入告知(RUSH系の当選告知として扱う)
]);

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeOutBack = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

/**
 * キャラを1回だけオフスクリーンに描いてキャッシュする。
 *
 * 2026-08-14: キャラがサメ画像になったので、**画像が届く前に描いた白紙を
 * 掴み続けない**ようキーへ読み込み状態を混ぜる(sharkArtReady)。
 * 素材が届いた瞬間に別キーへ切り替わり、絵の入ったキャンバスが作り直される。
 */
class CharCache {
  constructor() {
    this.cache = new Map();
  }

  /** @returns {HTMLCanvasElement} */
  get(rawKey, w, h, drawFn) {
    const key = `${rawKey}@${sharkArtReady() ? 1 : 0}`;
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

/** カットイン定義 */
export const CUTINS = {
  /** サメがBARプレートに噛みつく(ボーナス当選) */
  shark_bite_bar: {
    ms: 1800,
    draw(ctx, p, params, w, h) {
      const cy = h * 0.38;
      // 集中線背景
      drawSpeedLines(ctx, w, h, cy, p, '255,140,40');

      // BARプレート
      const plateP = clamp01(p / 0.3);
      const plateX = w / 2 + 90;
      ctx.save();
      ctx.globalAlpha = Math.min(1, plateP * 2);
      ctx.translate(plateX, cy);
      ctx.rotate((1 - plateP) * 0.5 + (p > 0.55 ? Math.sin(p * 40) * 0.06 : 0));
      const ps = 1 + (1 - plateP) * 0.6;
      ctx.scale(ps, ps);
      roundRect(ctx, -95, -42, 190, 84, 12);
      ctx.fillStyle = '#f4f8ff';
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#0b2540';
      ctx.stroke();
      ctx.fillStyle = '#0b2540';
      ctx.font = `900 56px ${FONT_HEAVY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BAR', 0, 2);
      ctx.restore();

      // サメが左から突っ込んで噛みつく
      const biteP = clamp01((p - 0.18) / 0.42);
      const mouth = biteP < 0.6 ? biteP / 0.6 : Math.max(0, 1 - (biteP - 0.6) / 0.4);
      const gx = -260 + easeOutCubic(biteP) * (w / 2 + 210);
      // 大口を開けて飛びかかるポーズ(スプライトの「水しぶきジャンプ」)
      const sharkCanvas = charCache.get('george_cutin', 340, 260, (cx) => {
        drawShark(cx, { x: 0, y: 0, scale: 1.5, t: 0, dir: 1, pose: 'jump', anim: 'none' });
      });
      ctx.save();
      ctx.globalAlpha = Math.min(1, biteP * 4);
      const sc = 1.15;
      // mouthOpen はキャッシュ済みなので、噛みつきは横スケールの詰めで表現する
      ctx.translate(gx, cy + 10);
      ctx.scale(sc, sc * (1 - mouth * 0.06));
      ctx.drawImage(sharkCanvas, -170, -130);
      ctx.restore();

      // 噛みついた瞬間のインパクト
      if (biteP > 0.58) {
        const ip = clamp01((biteP - 0.58) / 0.42);
        ctx.save();
        ctx.globalAlpha = (1 - ip) * 0.9;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(plateX - 60, cy, 4, plateX - 60, cy, 170 * ip + 20);
        g.addColorStop(0, 'rgba(255,240,180,0.95)');
        g.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // テキスト
      if (p > 0.5) {
        drawImpactText(ctx, 'BONUS!!', w / 2, 560, clamp01((p - 0.5) / 0.25), ['#fff3a0', '#ff7a00'], 540);
      }
    },
  },

  /**
   * サメ+7のドン(ボーナス当選・別パターン)。
   * ID はシナリオ側が参照しているので ghost_seven_don のまま。
   * 中身は 2026-08-14 に「炎の拳サメ + 7」へ差し替え済み(お化けは描かない)。
   */
  ghost_seven_don: {
    ms: 1800,
    draw(ctx, p, params, w, h) {
      const cy = h * 0.38;
      drawSpeedLines(ctx, w, h, cy, p, '190,120,255');

      // 7 がドンと出る
      const sevenP = clamp01(p / 0.32);
      ctx.save();
      ctx.translate(w / 2 + 70, cy);
      const s = easeOutBack(sevenP) * 1.0;
      ctx.scale(s, s);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 190px ${FONT_HEAVY}`;
      ctx.lineWidth = 16;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#2a0c4d';
      ctx.strokeText('7', 0, 0);
      const g = ctx.createLinearGradient(0, -95, 0, 95);
      g.addColorStop(0, '#e9b8ff');
      g.addColorStop(0.5, '#a13cff');
      g.addColorStop(1, '#5b0fa8');
      ctx.fillStyle = g;
      ctx.fillText('7', 0, 0);
      ctx.restore();

      // サメが左から飛び込む。7 に合わせて「炎の拳」= 一番レアなポーズを使う
      const kiroP = clamp01((p - 0.15) / 0.4);
      const kx = -140 + easeOutCubic(kiroP) * (w * 0.36 + 140);
      const kiroCanvas = charCache.get('kiro_cutin', 320, 320, (cx) => {
        drawShark(cx, { x: 0, y: 0, scale: 1.7, pose: 'fire', anim: 'none', t: 0, dir: 1 });
      });
      ctx.save();
      ctx.globalAlpha = Math.min(1, kiroP * 3);
      ctx.translate(kx, cy + Math.sin(p * 8) * 10);
      // 到着後にぷるぷる+明滅(激アツの余韻)
      const buzz = kiroP >= 1 ? Math.sin(p * 46) : 0;
      ctx.rotate(buzz * 0.03);
      ctx.drawImage(kiroCanvas, -160, -160);
      ctx.restore();

      if (p > 0.5) {
        drawImpactText(ctx, 'BONUS!!', w / 2, 560, clamp01((p - 0.5) / 0.25), ['#fff3a0', '#c060ff'], 540);
      }
    },
  },

  /** BIG BONUS ロゴドン(sample.png 上部の雰囲気) */
  big_bonus_logo: {
    ms: 2400,
    draw(ctx, p, params, w, h) {
      const title = params.title ?? 'BIG BONUS';
      // 放射状バースト
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cx = w / 2, cy = h * 0.36;
      const burst = easeOutCubic(clamp01(p / 0.4));
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 40 + burst * 460);
      g.addColorStop(0, `rgba(255,220,255,${0.55 * (1 - p * 0.6)})`);
      g.addColorStop(0.4, `rgba(190,80,255,${0.4 * (1 - p * 0.6)})`);
      g.addColorStop(1, 'rgba(120,20,180,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // 回転する光条
      ctx.translate(cx, cy);
      ctx.rotate(p * 1.2);
      for (let i = 0; i < 16; i++) {
        ctx.rotate((Math.PI * 2) / 16);
        ctx.fillStyle = `rgba(255,200,255,${0.10 * (1 - p)})`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(560, -26);
        ctx.lineTo(560, 26);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // ロゴ
      const logoP = clamp01((p - 0.12) / 0.3);
      if (logoP > 0) {
        // ロゴ文字は液晶の中へ(バーストや光条は全画面のまま)
        const sp = lcdTextSpot(520, 76);
        ctx.save();
        ctx.translate(sp.x, sp.y);
        const s = easeOutBack(logoP) * 1.0 * (1 + Math.sin(p * 12) * 0.015);
        ctx.scale(s, s);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 76px ${FONT_HEAVY}`;
        ctx.lineWidth = 18;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#3a0500';
        ctx.strokeText(title, 0, 0);
        const lg = ctx.createLinearGradient(0, -40, 0, 40);
        lg.addColorStop(0, '#fff7b0');
        lg.addColorStop(0.45, '#ffb400');
        lg.addColorStop(1, '#ff3d00');
        ctx.fillStyle = lg;
        ctx.fillText(title, 0, 0);
        ctx.restore();
      }

      // コインが舞う
      if (p > 0.25) {
        const coinP = (p - 0.25) / 0.75;
        ctx.save();
        for (let i = 0; i < 18; i++) {
          const seed = i * 37;
          const cx2 = ((seed * 13) % w);
          const fall = ((coinP * (0.6 + (i % 5) * 0.12)) % 1);
          const cy2 = -40 + fall * (h + 80);
          ctx.globalAlpha = 0.85 * (1 - coinP * 0.4);
          ctx.beginPath();
          ctx.ellipse(cx2, cy2, 11, 11 * Math.abs(Math.cos(fall * 10 + i)), 0, 0, Math.PI * 2);
          ctx.fillStyle = '#ffc93c';
          ctx.fill();
          ctx.strokeStyle = '#a06a00';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();
      }
    },
  },

  /** RUSH突入 */
  rush_entry: {
    ms: 2200,
    draw(ctx, p, params, w, h) {
      const cx = w / 2, cy = h * 0.36;
      // 高速で流れるライン(スケールアウトのイメージ)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const yy = (i / 26) * h;
        const speed = 0.5 + (i % 4) * 0.35;
        const xx = ((p * speed * 2.2 + i * 0.13) % 1.4 - 0.2) * w;
        ctx.fillStyle = `rgba(123,247,208,${0.20 * (1 - p * 0.5)})`;
        ctx.fillRect(xx, yy, 190, 4);
      }
      ctx.restore();

      // インスタンスアイコンが増殖
      const n = Math.min(8, Math.floor(clamp01(p / 0.55) * 8) + 1);
      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < n; i++) {
        const ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const r = 104;
        const ip = clamp01((p - i * 0.055) / 0.2);
        const x = Math.cos(ang) * r * easeOutBack(ip);
        const y = Math.sin(ang) * r * easeOutBack(ip);
        ctx.globalAlpha = ip;
        roundRect(ctx, x - 22, y - 22, 44, 44, 7);
        const g = ctx.createLinearGradient(x, y - 22, x, y + 22);
        g.addColorStop(0, '#7bf7d0');
        g.addColorStop(1, '#12a08a');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.restore();

      // テキストはリール窓の高さ(440〜620)に収める。
      // h*0.60 付近は HUD(630〜690)と停止ボタン(702〜758)にかかるため使わない。
      if (p > 0.45) {
        drawImpactText(ctx, 'AUTO SCALING', w / 2, 508, clamp01((p - 0.45) / 0.25), ['#e8fff8', '#12a08a'], 540);
        drawImpactText(ctx, 'RUSH', w / 2, 580, clamp01((p - 0.55) / 0.25), ['#fff7b0', '#ff8a00'], 540);
      }
    },
  },

  /**
   * レア役の軽いカットイン(ミニサメのちょい出し)。IDEAS.md 2-14
   * ID は互換のため mini_ghost_peek のまま(絵は「ひょっこり覗きサメ」)。
   */
  mini_ghost_peek: {
    ms: 1200,
    draw(ctx, p, params, w, h) {
      /*
       * U66-4: 以前はリール窓の脇(論理 x150/570, y520)に出していたが、
       * そこは **液晶の外**(リールと筐体の領域)。告知級ではないので液晶の中へ移す。
       * 左右どちらから覗くかはそのままに、液晶の左右端を基準点にする。
       */
      const side = params.side === 'right' ? 1 : -1;
      const spot = lcdSpot(0.78, side < 0 ? 0.16 : 0.84);
      const baseX = spot.x;
      const peek = Math.sin(clamp01(p) * Math.PI);
      const x = baseX + side * -34 * peek;
      const y = spot.y + Math.sin(p * 12) * 8;

      // 「ひょっこり覗き」ポーズ。下から顔だけ出すのでそのまま使える
      const cache = charCache.get(`kiro_mini_peek_${side}`, 140, 140, (cx) => {
        drawShark(cx, { x: 0, y: 0, scale: 0.62, pose: 'peek', anim: 'none', t: 0, dir: side < 0 ? 1 : -1 });
      });
      ctx.save();
      ctx.globalAlpha = peek * 0.95;
      // ぴょこぴょこ跳ねながら覗く
      ctx.translate(x, y - Math.abs(Math.sin(p * Math.PI * 3)) * 8);
      ctx.rotate(Math.sin(p * Math.PI * 4) * 0.07);
      ctx.drawImage(cache, -70, -70);
      ctx.restore();
    },
  },

  /** Spot ゾーン突入: サメが口を開けて突っ込んでくる。IDEAS.md 3-13 */
  spot_entry: {
    ms: 2000,
    draw(ctx, p, params, w, h) {
      const cy = h * 0.38;
      drawSpeedLines(ctx, w, h, cy, p, '224,112,28');

      // ジョージが左から慌てて飛び込んでくる(中断通知を運んでくる役)。
      // 「驚き・焦り(!!)」ポーズ + 到着後のぷるぷるで、悪い知らせだと一目で分かる
      const gp = clamp01(p / 0.5);
      const cache = charCache.get('george_spot', 360, 280, (cx) => {
        drawShark(cx, { x: 0, y: 0, scale: 1.7, t: 0, dir: 1, pose: 'panic', anim: 'none' });
      });
      // 液晶の上寄りに配置して、リール窓と下部のルール説明を塞がないようにする
      const spot = lcdCharSpot(360, 280, { hRatio: 0.52, wRatio: 0.7, cyRatio: 0.34 });
      const gx = spot.left - 180 + easeOutCubic(gp) * (spot.x - spot.left + 180);
      const shiver = gp >= 1 ? Math.sin(p * 52) * 4 : 0;
      ctx.save();
      ctx.globalAlpha = Math.min(1, gp * 4);
      ctx.translate(gx + shiver, spot.y + Math.sin(p * 41) * 2);
      const s = spot.scale * (1 + (1 - gp) * 0.3);
      ctx.scale(s, s);
      ctx.drawImage(cache, -180, -140);
      ctx.restore();

      // 「2分前通知」の警告帯
      if (p > 0.4) {
        const tp = clamp01((p - 0.4) / 0.2);
        ctx.save();
        ctx.globalAlpha = tp * (Math.sin(p * 30) > -0.4 ? 1 : 0.4);
        // 警告帯ごと液晶の中へ収める
        const lr = getLayerRect('lcd');
        const sp = lcdTextSpot(475, 22);
        ctx.fillStyle = 'rgba(200,30,20,0.85)';
        ctx.fillRect(lr.x, sp.y - 23, lr.w, 46);
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 18px ${FONT_HEAVY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('INTERRUPTION NOTICE — 2 MIN', sp.x, sp.y);
        ctx.restore();
      }
      if (p > 0.45) {
        drawImpactText(ctx, 'SPOT ZONE', w / 2, 560, clamp01((p - 0.45) / 0.25), ['#ffe0a0', '#e0701c'], 540);
      }
    },
  },

  /** 上位AT昇格: サーバーレス化ミッション成功。IDEAS.md 3-10 */
  serverless_up: {
    ms: 2400,
    draw(ctx, p, params, w, h) {
      const cx = w / 2;
      const cy = h * 0.36;
      // EC2 の四角が消えて λ になる
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 60 + easeOutCubic(p) * 420);
      g.addColorStop(0, `rgba(255,220,150,${0.5 * (1 - p * 0.5)})`);
      g.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      const fade = clamp01((p - 0.1) / 0.35);
      // 消えていくインスタンス
      ctx.save();
      ctx.globalAlpha = 1 - fade;
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(ang) * (110 + fade * 90);
        const y = cy + Math.sin(ang) * (110 + fade * 90);
        roundRect(ctx, x - 20, y - 20, 40, 40, 6);
        ctx.fillStyle = '#12a08a';
        ctx.fill();
      }
      ctx.restore();

      // λ が現れる
      if (p > 0.28) {
        const lp = clamp01((p - 0.28) / 0.3);
        ctx.save();
        ctx.translate(cx, cy);
        const s = easeOutBack(lp) * 1.0;
        ctx.scale(s, s);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 170px ${FONT_HEAVY}`;
        ctx.lineWidth = 16;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#3a1500';
        ctx.strokeText('λ', 0, 0);
        const lg = ctx.createLinearGradient(0, -85, 0, 85);
        lg.addColorStop(0, '#fff3c4');
        lg.addColorStop(1, '#ff8a00');
        ctx.fillStyle = lg;
        ctx.fillText('λ', 0, 0);
        ctx.restore();
      }

      if (p > 0.5) {
        drawImpactText(ctx, 'SERVERLESS', w / 2, 508, clamp01((p - 0.5) / 0.25), ['#fff3c4', '#ff8a00'], 540);
        drawImpactText(ctx, 'RUSH', w / 2, 580, clamp01((p - 0.6) / 0.25), ['#ffffff', '#ffb400'], 540);
      }
    },
  },

  /** 最上位AT突入: 世界地図が全点灯。IDEAS.md 4-1 */
  multi_region_entry: {
    ms: 2800,
    draw(ctx, p, params, w, h) {
      const cy = h * 0.34;
      ctx.save();
      ctx.fillStyle = `rgba(20,0,50,${0.5 * Math.min(1, p * 4)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // 地球儀の経緯線
      ctx.save();
      ctx.translate(w / 2, cy);
      ctx.strokeStyle = 'rgba(160,120,255,0.5)';
      ctx.lineWidth = 2;
      const r = 150;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 1; i < 5; i++) {
        const rr = (r / 5) * i;
        ctx.beginPath();
        ctx.ellipse(0, 0, rr, r, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.ellipse(0, i * (r / 3), r * Math.cos((i * Math.PI) / 7), r / 12, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // リージョンが順に点灯
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 10; i++) {
        const lp = clamp01((p - i * 0.045) / 0.2);
        if (lp <= 0) continue;
        const ang = (i / 10) * Math.PI * 2 + 0.4;
        const x = Math.cos(ang) * r * 0.72;
        const y = Math.sin(ang) * r * 0.62;
        const rad = 8 + lp * 26;
        const g = ctx.createRadialGradient(x, y, 1, x, y, rad);
        g.addColorStop(0, `rgba(255,180,255,${0.95 * lp})`);
        g.addColorStop(1, 'rgba(160,60,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (p > 0.5) {
        drawImpactText(ctx, 'MULTI-REGION', w / 2, 520, clamp01((p - 0.5) / 0.25), ['#ffd0ff', '#a13cff'], 560);
        drawImpactText(ctx, 'ACTIVE / ACTIVE', w / 2, 586, clamp01((p - 0.62) / 0.25), ['#fff7b0', '#ff5ad0'], 560);
      }
    },
  },

  /** エンディング: re:Invent キーノート */
  reinvent_keynote: {
    ms: 3400,
    draw(ctx, p, params, w, h) {
      // ステージの逆光
      ctx.save();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgba(40,0,70,${0.85 * Math.min(1, p * 3)})`);
      g.addColorStop(1, `rgba(120,0,90,${0.5 * Math.min(1, p * 3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // スポットライト
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const bx = w * (0.25 + i * 0.25);
        const sway = Math.sin(p * 4 + i * 2) * 60;
        const lg = ctx.createLinearGradient(bx, 0, bx + sway, h * 0.7);
        lg.addColorStop(0, 'rgba(255,220,255,0.30)');
        lg.addColorStop(1, 'rgba(255,120,220,0)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(bx - 30, 0);
        ctx.lineTo(bx + 30, 0);
        ctx.lineTo(bx + sway + 150, h * 0.72);
        ctx.lineTo(bx + sway - 150, h * 0.72);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // 壇上の2匹(お祝いポーズ + 喜びポーズ)。交互に跳ねて漫才っぽく見せる
      const cp = clamp01((p - 0.15) / 0.3);
      if (cp > 0) {
        const kiro = charCache.get('kiro_ed', 340, 340, (cx) => {
          drawShark(cx, { x: 0, y: 0, scale: 1.8, pose: 'party', anim: 'none', t: 0, dir: 1 });
        });
        const george = charCache.get('george_ed', 360, 300, (cx) => {
          drawShark(cx, { x: 0, y: 0, scale: 1.6, pose: 'cheer', anim: 'none', t: 0, dir: -1 });
        });
        ctx.save();
        ctx.globalAlpha = cp;
        const hopA = Math.abs(Math.sin(p * 7)) * 14;
        const hopB = Math.abs(Math.cos(p * 7)) * 14;
        ctx.drawImage(kiro, w * 0.3 - 170, h * 0.34 - 170 - hopA);
        ctx.drawImage(george, w * 0.68 - 180, h * 0.36 - 150 - hopB);
        ctx.restore();
      }

      if (p > 0.4) {
        drawImpactText(ctx, 're:Invent', w / 2, 512, clamp01((p - 0.4) / 0.25), ['#ffffff', '#ff2fa0'], 540);
        drawImpactText(ctx, 'KEYNOTE', w / 2, 582, clamp01((p - 0.5) / 0.25), ['#fff7b0', '#a13cff'], 540);
      }
    },
  },

  /** ガセ用: サメの尾びれチラ見せ(弱)。IDEAS.md 2-15 */
  shark_fin_tease: {
    ms: 1100,
    draw(ctx, p, params, w, h) {
      const peek = Math.sin(clamp01(p) * Math.PI);
      // U66-4: 旧実装は y = h-150(画面下端の筐体側)だった。煽りなので液晶の中で泳がせる
      const spot = lcdSpot(0.82, 0.24);
      const y = spot.y + (1 - peek) * 90;
      ctx.save();
      ctx.globalAlpha = peek;
      ctx.translate(spot.x + p * 90, y);
      ctx.beginPath();
      ctx.moveTo(-30, 46);
      ctx.quadraticCurveTo(-6, 10, 6, -52);
      ctx.quadraticCurveTo(16, 8, 36, 46);
      ctx.closePath();
      ctx.fillStyle = '#e0701c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,55,8,0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();
      // 波紋
      ctx.strokeStyle = `rgba(255,180,120,${0.5 * peek})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-70, 48);
      ctx.quadraticCurveTo(-30, 40, 0, 48);
      ctx.quadraticCurveTo(34, 56, 76, 48);
      ctx.stroke();
      ctx.restore();
    },
  },
};

// 強予告用の追加カットインをレジストリへ合流させる(cutins-extra.js)。
// 名前衝突がないことは統合時に機械照合済み。ここを外すと overlay.cutin が警告を出して無音失敗する。
Object.assign(CUTINS, CUTINS_EXTRA);

// ── 補助 ─────────────────────────────────

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

function drawSpeedLines(ctx, w, h, cy, p, rgb) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, p * 5) * (1 - p * 0.5);
  ctx.fillStyle = `rgba(${rgb},0.16)`;
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, cy);
  ctx.rotate(p * 0.6);
  for (let i = 0; i < 22; i++) {
    ctx.rotate((Math.PI * 2) / 22);
    ctx.fillStyle = `rgba(${rgb},${0.10 + (i % 2) * 0.05})`;
    ctx.beginPath();
    ctx.moveTo(60, 0);
    ctx.lineTo(700, -20);
    ctx.lineTo(700, 20);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * インパクトテキスト。
 * maxWidth に収まるまでフォントを詰める(「AUTO SCALING」のような長い文字列が
 * HUDや停止ボタンまではみ出さないようにするため)。
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

/** 実行中カットインの管理 */
export class Cutins {
  constructor() {
    /** @type {{id:string, def:object, params:object, left:number, ms:number}[]} */
    this.active = [];
  }

  play(id, params = {}) {
    const def = CUTINS[id];
    if (!def) {
      console.warn(`[cutins] 未定義のカットイン: ${id}`);
      return;
    }
    this.active = this.active.filter((a) => a.id !== id);
    const ms = params.ms ?? def.ms;
    this.active.push({ id, def, params, left: ms, ms });
  }

  update(dt) {
    for (const a of this.active) a.left -= dt;
    this.active = this.active.filter((a) => a.left > 0);
  }

  clear() { this.active = []; }

  draw(ctx, w, h) {
    for (const a of this.active) {
      const p = Math.max(0, Math.min(1, 1 - a.left / a.ms));
      ctx.save();
      /*
       * U66-4: 告知級(FULLSCREEN_CUTINS)以外は液晶の窓の中だけに描く。
       * 集中線・フラッシュ・キャラも含めて丸ごとクリップするので、
       * 予告カットインが筐体やリールの上へはみ出すことは構造的に起きない。
       * 液晶の位置は筐体アートで動く(setLayerViews)ため毎フレーム引き直す。
       */
      if (!FULLSCREEN_CUTINS.has(a.id)) {
        const r = getLayerRect('lcd');
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
      }
      try {
        a.def.draw(ctx, p, a.params, w, h);
      } catch (e) {
        console.error(`[cutins] 描画エラー: ${a.id}`, e);
      }
      ctx.restore();
    }
  }
}
