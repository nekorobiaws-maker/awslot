/**
 * LCD内アニメーション。DESIGN.md 5.4 / 6.5
 *
 * 演出システムの lcd.anim / lcd.text から起動され、
 * LcdView の bgObject / fgEffect / ui サブレイヤーから描画される。
 *
 * 各アニメは { id, layer, ms, draw(ctx, p, params, w, h) } の形で登録する。
 * p は 0→1 の進行度。
 *
 * テキスト帯(lcd.text)だけは他のアニメと寿命の考え方が違う。
 * 「読ませる」ことが仕事なので、シナリオの尺よりも可読性を優先する:
 *   - 最低表示時間を必ず満たす(文字数が多ければ自動で延びる)
 *   - 消えるときは瞬時ではなくフェードアウトする
 *   - 短時間に複数来たら上書きせずキューイングして順送りする
 *   - 結果告知・予兆の結論(sticky)は **次のレバーONまで** 残る。
 *     ただし sticky は「上限寿命」であって占有権ではない: 新しい告知が来たら
 *     最低表示時間を満たし次第ゆずる(showText 内のコメント / U57)。
 * 詳細は下の「演出テキスト帯」ブロックを参照。
 */

/*
 * ANIM_HEADLINES(アニメが自分で描いている大文字の申告)から呼ぶ口:
 *   triviaHeadlineOf   … U59 の豆知識カードが出しているサービス名
 *   reelPickHeadlineOf … U64-2 のリール3択クイズの判定(正解!! / 不正解…)
 */
import {
  LCD_ANIMS_EXTRA, beginPlateFrame, triviaHeadlineOf, reelPickHeadlineOf,
} from './lcdanims-extra.js';

const FONT = '"Helvetica Neue", "Hiragino Sans", "Noto Sans JP", sans-serif';
const FONT_HEAVY = '"Arial Black", "Helvetica Neue", "Hiragino Sans", sans-serif';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeOutBack = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
const easeOutCubic = (x) => 1 - (1 - x) ** 3;

/** アニメーション定義 */
export const LCD_ANIMS = {
  /** CloudWatch グラフ出現(CZ突入時) */
  cw_graph_appear: {
    layer: 'fg', ms: 700,
    draw(ctx, p, params, w, h) {
      const a = 1 - p;
      ctx.save();
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = '#7cf3ff';
      ctx.lineWidth = 3;
      const r = 20 + p * 260;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },
  },

  /** メトリクスが跳ねる(レア役でグラフが上がる) */
  cw_graph_rise: {
    layer: 'fg', ms: 620,
    draw(ctx, p, params, w, h) {
      const step = params.step ?? 1;
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.85;
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 4;
      ctx.beginPath();
      const x = 40 + (w - 80) * (step / 5);
      ctx.moveTo(x, h - 40);
      ctx.lineTo(x, 60 + 40 * (1 - easeOutCubic(p)));
      ctx.stroke();
      ctx.fillStyle = '#ffe066';
      ctx.font = `900 20px ${FONT_HEAVY}`;
      ctx.textAlign = 'center';
      ctx.fillText('▲', x, 56);
      ctx.restore();
    },
  },

  /** CZ結果: OK → INSUFFICIENT_DATA → ALARM のステップアップ */
  cw_alarm_result: {
    layer: 'ui', ms: 2000,
    draw(ctx, p, params, w, h) {
      const win = Boolean(params.result);
      const steps = win
        ? ['OK', 'INSUFFICIENT_DATA', 'ALARM']
        : ['OK', 'INSUFFICIENT_DATA', 'OK'];
      const colors = win ? ['#8ad4ff', '#ffd166', '#ff3b30'] : ['#8ad4ff', '#ffd166', '#8ad4ff'];
      const idx = Math.min(steps.length - 1, Math.floor(p * steps.length * 1.15));
      const local = clamp01((p * steps.length * 1.15) - idx);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const scale = 1 + (1 - easeOutCubic(local)) * 0.5;
      ctx.translate(w / 2, h / 2 - 6);
      ctx.scale(scale, scale);
      ctx.font = `900 ${idx === 2 && win ? 42 : 28}px ${FONT_HEAVY}`;
      ctx.lineWidth = 7;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(steps[idx], 0, 0);
      ctx.fillStyle = colors[idx];
      ctx.fillText(steps[idx], 0, 0);
      ctx.restore();
    },
  },

  /** スケールアウト: インスタンスが増える瞬間 */
  scale_out_burst: {
    layer: 'fg', ms: 900,
    draw(ctx, p, params, w, h) {
      const dc = params.dc ?? 1;
      const iconW = 34, gap = 8, max = 8;
      const totalW = max * iconW + (max - 1) * gap;
      const x = (w - totalW) / 2 + (dc - 1) * (iconW + gap);
      const y = 74;
      ctx.save();
      // 光の輪
      ctx.globalCompositeOperation = 'lighter';
      const r = 10 + easeOutCubic(p) * 46;
      const g = ctx.createRadialGradient(x + iconW / 2, y + 17, 2, x + iconW / 2, y + 17, r);
      g.addColorStop(0, `rgba(123,247,208,${0.85 * (1 - p)})`);
      g.addColorStop(1, 'rgba(123,247,208,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + iconW / 2, y + 17, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // SCALE OUT テキスト
      if (p < 0.75) {
        ctx.save();
        ctx.globalAlpha = 1 - p / 0.75;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 26px ${FONT_HEAVY}`;
        ctx.lineWidth = 6;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0,40,35,0.85)';
        const ty = 140 - easeOutCubic(p) * 22;
        ctx.strokeText('SCALE OUT!', w / 2, ty);
        ctx.fillStyle = '#7bf7d0';
        ctx.fillText('SCALE OUT!', w / 2, ty);
        ctx.restore();
      }
    },
  },

  /*
   * NOTE(2026-08-14 検証 minor): ここにあった `scale_in_drop`(DCが減る画)は削除した。
   * U11 で AS_RUSH が「EC2の台数 = 残りゲーム数」へ作り替わり、
   * **台数が減る = ゲーム消化** になったため「縮退のお知らせ」を出す契機が消え、
   * どのシナリオからも呼ばれない死にアニメになっていた。
   * 減少を見せたくなったときは asrush の paramChange を受けて作り直すこと
   * (旧実装は git 履歴の 1bf2238 以前を参照)。
   */

  /** ヘルスチェック(セット末): 継続=緑 / 敗北=赤 */
  health_check: {
    layer: 'ui', ms: 1600,
    draw(ctx, p, params, w, h) {
      const ok = Boolean(params.ok);
      const label = params.label ?? (ok ? 'HEALTHY' : 'UNHEALTHY');
      const blink = p < 0.55 ? (Math.sin(p * Math.PI * 14) > 0 ? 1 : 0.25) : 1;
      const color = p < 0.55 ? '#ffd166' : (ok ? '#4ce0a0' : '#ff4d4d');

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = Math.min(1, (1 - p) * 3) * blink;

      // 判定ランプ
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 - 24, 22, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 24;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.font = `900 24px ${FONT_HEAVY}`;
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      const text = p < 0.55 ? 'HEALTH CHECK...' : label;
      ctx.strokeText(text, w / 2, h / 2 + 22);
      ctx.fillStyle = p < 0.55 ? '#ffffff' : color;
      ctx.fillText(text, w / 2, h / 2 + 22);
      ctx.restore();
    },
  },

  /** ホットスタンバイ: AZ切替ゲージ */
  az_failover: {
    layer: 'fg', ms: 1400,
    draw(ctx, p, params, w, h) {
      ctx.save();
      // AZ-a から AZ-c へ流れる光
      const y = 118;
      const x0 = w / 2 - 80;
      const x1 = w / 2 + 80;
      const x = x0 + (x1 - x0) * easeOutCubic(p);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 2, x, y, 26);
      g.addColorStop(0, `rgba(255,220,120,${0.9 * (1 - p * 0.5)})`);
      g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  },

  /** 復帰成功の爆発 */
  recover_burst: {
    layer: 'fg', ms: 1200,
    draw(ctx, p, params, w, h) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cx = w / 2, cy = h / 2;
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2;
        const d = easeOutCubic(p) * 180;
        const x = cx + Math.cos(ang) * d;
        const y = cy + Math.sin(ang) * d;
        ctx.fillStyle = `rgba(123,247,208,${(1 - p) * 0.9})`;
        ctx.beginPath();
        ctx.arc(x, y, 6 * (1 - p) + 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  },

  /** プレミア: 全リージョン同時点灯(世界地図簡易版)。IDEAS.md 4-1 */
  all_regions_light: {
    layer: 'fg', ms: 2600,
    draw(ctx, p, params, w, h) {
      // 簡易世界地図(点の集合)
      const REGIONS = [
        [0.12, 0.34], [0.18, 0.46], [0.22, 0.62], [0.30, 0.30], [0.34, 0.52],
        [0.44, 0.28], [0.48, 0.40], [0.46, 0.58], [0.54, 0.34], [0.58, 0.50],
        [0.64, 0.26], [0.68, 0.42], [0.72, 0.58], [0.78, 0.32], [0.82, 0.48],
        [0.86, 0.64], [0.26, 0.72], [0.60, 0.70], [0.90, 0.38], [0.38, 0.66],
      ];
      ctx.save();
      // 地図の下地
      ctx.globalAlpha = Math.min(1, p * 4) * 0.5;
      ctx.strokeStyle = 'rgba(140,200,255,0.35)';
      ctx.lineWidth = 1;
      for (const [rx, ry] of REGIONS) {
        ctx.beginPath();
        ctx.arc(rx * w, ry * h, 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      REGIONS.forEach(([rx, ry], i) => {
        // 順に点灯 → 最後に全点灯
        const start = (i / REGIONS.length) * 0.55;
        const lp = clamp01((p - start) / 0.2);
        if (lp <= 0) return;
        const x = rx * w, y = ry * h;
        const pulse = p > 0.6 ? 1 + Math.sin((p - 0.6) * 30 + i) * 0.35 : 1;
        const rad = (4 + lp * 12) * pulse;
        const g = ctx.createRadialGradient(x, y, 1, x, y, rad);
        const hue = (i * 18 + p * 240) % 360;
        g.addColorStop(0, `hsla(${hue}, 100%, 75%, ${0.95 * lp})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      if (p > 0.55) {
        const tp = clamp01((p - 0.55) / 0.3);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.translate(w / 2, h / 2);
        ctx.scale(easeOutBack(tp), easeOutBack(tp));
        ctx.font = `900 30px ${FONT_HEAVY}`;
        ctx.lineWidth = 8;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(20,0,50,0.9)';
        ctx.strokeText('ALL REGIONS', 0, 0);
        const g = ctx.createLinearGradient(0, -18, 0, 18);
        g.addColorStop(0, '#fff6a0');
        g.addColorStop(1, '#ff5ad0');
        ctx.fillStyle = g;
        ctx.fillText('ALL REGIONS', 0, 0);
        ctx.restore();
      }
    },
  },

  /** ステップアップ予告(SNS通知ベル風)。IDEAS.md 2-24 */
  step_up: {
    layer: 'ui', ms: 1500,
    draw(ctx, p, params, w, h) {
      const max = params.step ?? 1;
      const shown = Math.min(max, Math.floor(p * (max + 1)) + 1);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = Math.min(1, (1 - p) * 4);
      for (let i = 0; i < 3; i++) {
        const x = w / 2 - 46 + i * 46;
        const on = i < shown;
        ctx.beginPath();
        ctx.arc(x, 56, 13, 0, Math.PI * 2);
        ctx.fillStyle = on ? ['#8ad4ff', '#ffd166', '#ff4d4d'][i] : 'rgba(255,255,255,0.14)';
        if (on) { ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14; }
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    },
  },

  // ── Phase 5 ────────────────────────────────

  /** Spot: ジョージが中断通知(封筒)を運んでくる。IDEAS.md 3-13 */
  spot_notice: {
    layer: 'fg', ms: 1800,
    draw(ctx, p, params, w, h) {
      const left = params.left ?? 2;
      // 水面を横切るヒレ
      const x = -60 + easeOutCubic(clamp01(p / 0.55)) * (w * 0.62 + 60);
      const y = h * 0.62;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p * 5) * (p > 0.85 ? (1 - p) / 0.15 : 1);
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(-22, 30);
      ctx.quadraticCurveTo(-4, 8, 4, -34);
      ctx.quadraticCurveTo(12, 6, 26, 30);
      ctx.closePath();
      ctx.fillStyle = '#e0701c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,55,8,0.8)';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      // くわえている通知書
      ctx.fillStyle = '#fff4e0';
      ctx.fillRect(18, -6, 40, 26);
      ctx.strokeStyle = '#b03a10';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(18, -6, 40, 26);
      ctx.fillStyle = '#b03a10';
      ctx.font = `900 10px ${FONT_HEAVY}`;
      ctx.textAlign = 'center';
      ctx.fillText('NOTICE', 38, 8);
      ctx.restore();

      // 通知テキスト
      if (p > 0.45) {
        const tp = clamp01((p - 0.45) / 0.25);
        ctx.save();
        ctx.globalAlpha = Math.min(1, tp * 3);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.translate(w / 2, h * 0.3);
        ctx.scale(easeOutBack(tp), easeOutBack(tp));
        ctx.font = `900 22px ${FONT_HEAVY}`;
        ctx.lineWidth = 7;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(50,0,0,0.85)';
        ctx.strokeText('INTERRUPTION', 0, -12);
        ctx.fillStyle = '#ff5a5a';
        ctx.fillText('INTERRUPTION', 0, -12);
        ctx.font = `900 16px ${FONT_HEAVY}`;
        ctx.strokeText(`あと ${left} ゲーム`, 0, 14);
        ctx.fillStyle = '#ffd166';
        ctx.fillText(`あと ${left} ゲーム`, 0, 14);
        ctx.restore();
      }
    },
  },

  /** EC2 バースト: クレジット回復 */
  burst_recover: {
    layer: 'fg', ms: 1000,
    draw(ctx, p, params, w, h) {
      const amount = params.amount ?? 0;
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.95;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 30px ${FONT_HEAVY}`;
      ctx.lineWidth = 7;
      ctx.lineJoin = 'round';
      const y = 108 - easeOutCubic(p) * 34;
      ctx.strokeStyle = 'rgba(40,20,0,0.85)';
      ctx.strokeText(`+${amount}`, w / 2, y);
      ctx.fillStyle = '#7bf7d0';
      ctx.fillText(`+${amount}`, w / 2, y);
      ctx.restore();

      // ゲージが伸びる光
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - p) * 0.6;
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(60, 156, (w - 120) * easeOutCubic(p), 16);
      ctx.restore();
    },
  },

  /** CloudFront: エッジからセット数が飛んでくる */
  cf_edge_fly: {
    layer: 'fg', ms: 900,
    draw(ctx, p, params, w, h) {
      const n = params.add ?? 1;
      const edge = params.edge ?? 'NRT';
      const cx = w / 2;
      const cy = 124;
      const ang = ((params.index ?? 0) / 10) * Math.PI * 2;
      const sx = cx + Math.cos(ang) * 96;
      const sy = cy + Math.sin(ang) * 52;
      const e = easeOutCubic(p);
      const x = sx + (cx - sx) * e;
      const y = sy + (cy - sy) * e;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 1, x, y, 22);
      g.addColorStop(0, `rgba(190,220,255,${0.9 * (1 - p * 0.4)})`);
      g.addColorStop(1, 'rgba(80,140,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 1 - p * 0.5;
      ctx.font = `900 16px ${FONT_HEAVY}`;
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(10,20,60,0.85)';
      ctx.strokeText(`${edge} +${n}`, x, y - 22);
      ctx.fillStyle = '#ffe066';
      ctx.fillText(`${edge} +${n}`, x, y - 22);
      ctx.restore();
    },
  },

  /** Kinesis: レコードが流れて上乗せになる */
  kinesis_record: {
    layer: 'fg', ms: 900,
    draw(ctx, p, params, w, h) {
      const n = params.add ?? 1;
      const lane = params.shard ?? 1;
      const y = 74 + (lane - 1) * 23 + 9;
      const x = 46 + (w - 92) * easeOutCubic(p);
      ctx.save();
      ctx.globalAlpha = 1 - p * 0.3;
      ctx.fillStyle = '#8ef0ff';
      ctx.fillRect(x - 26, y - 5, 26, 10);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 13px ${FONT_HEAVY}`;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,30,40,0.9)';
      ctx.strokeText(`+${n}`, x + 14, y);
      ctx.fillStyle = '#ffe066';
      ctx.fillText(`+${n}`, x + 14, y);
      ctx.restore();
    },
  },

  /** Multi-Region: リージョンが1つ点灯する */
  region_light: {
    layer: 'fg', ms: 1100,
    draw(ctx, p, params, w, h) {
      const lit = params.lit ?? 1;
      const POS = [
        [0.78, 0.42], [0.24, 0.38], [0.48, 0.32], [0.74, 0.62],
        [0.30, 0.72], [0.14, 0.42], [0.51, 0.28], [0.68, 0.52],
      ];
      const [rx, ry] = POS[(lit - 1) % POS.length];
      const x = rx * w;
      const y = 40 + ry * 190;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const r = 8 + easeOutCubic(p) * 60;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, `rgba(255,180,255,${0.9 * (1 - p)})`);
      g.addColorStop(1, 'rgba(160,60,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (p < 0.8) {
        ctx.save();
        ctx.globalAlpha = 1 - p / 0.8;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 15px ${FONT_HEAVY}`;
        ctx.lineWidth = 5;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(20,0,40,0.85)';
        ctx.strokeText('+1 SET', x, y - 26 - p * 10);
        ctx.fillStyle = '#ffe066';
        ctx.fillText('+1 SET', x, y - 26 - p * 10);
        ctx.restore();
      }
    },
  },

  /**
   * Step Functions: タスクの成否。
   *
   * ■ 結論は明示されたときだけ出す(2026-08-13 修正)
   *   旧実装は `const ok = Boolean(params.ok)` だったため、**params を何も渡さないと
   *   黙って FAILED を断言する**という穴があった。結果として、当落を知らない
   *   レバーON時点の予告シナリオからも SUCCEEDED / FAILED を出せてしまい、
   *   「失敗と出たのに数ゲーム後にCZへ入る」類の嘘が生まれていた。
   *
   *   いまは結論を出すには明示の指定が要る:
   *     params.result … 'success' | 'fail' | 'running'(推奨。結論はこれで渡す)
   *     params.ok     … true / false(後方互換。**明示的に真偽値を渡したときだけ**有効)
   *   どちらも無い場合は結論を出さず「RUNNING…」の実行中表示になる。
   *
   *   結論(success / fail)を渡してよいのは、当落が確定したイベントで発火する
   *   シナリオだけ(setEnd の結果・zencho_end の ENTRY / MISS など)。
   *   期待度を煽るだけの予告は result を渡さない(= 実行中のまま終わる)。
   */
  sfn_task: {
    layer: 'ui', ms: 1100,
    draw(ctx, p, params, w, h) {
      // 後方互換: ok を明示的に渡している呼び出し(zones.js の結果告知など)は従来どおり
      const hasLegacyOk = params.ok === true || params.ok === false;
      const result = params.result ?? (hasLegacyOk ? (params.ok ? 'success' : 'fail') : 'running');

      const label = result === 'success' ? 'SUCCEEDED' : result === 'fail' ? 'FAILED' : 'RUNNING…';
      const color = result === 'success' ? '#7bf7d0' : result === 'fail' ? '#ff5a5a' : '#8ad4ff';

      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - p) * 3);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.translate(w / 2, 62);
      // 結論のときだけ弾むように出す。実行中は落ち着いた等倍表示
      const s = result === 'running' ? 1 : easeOutBack(clamp01(p * 3));
      ctx.scale(s, s);
      ctx.font = `900 20px ${FONT_HEAVY}`;
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,20,0.85)';
      ctx.strokeText(label, 0, 0);
      ctx.fillStyle = color;
      ctx.fillText(label, 0, 0);

      // 実行中はぐるぐる回るスピナーを添えて「まだ終わっていない」ことを示す
      if (result === 'running') {
        ctx.rotate(p * Math.PI * 4);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 1.35);
        ctx.stroke();
      }
      ctx.restore();
    },
  },

  /** Reserved: 契約書にサインが走る */
  reserved_sign: {
    layer: 'fg', ms: 1400,
    draw(ctx, p, params, w, h) {
      const e = easeOutCubic(clamp01(p / 0.7));
      ctx.save();
      ctx.strokeStyle = '#1a1040';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const x0 = 160;
      const steps = 40;
      for (let i = 0; i <= steps * e; i++) {
        const t = i / steps;
        const x = x0 + t * 120;
        const y = 156 - Math.sin(t * Math.PI * 2.4) * 12;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      if (p > 0.7) {
        const tp = clamp01((p - 0.7) / 0.3);
        ctx.save();
        ctx.globalAlpha = 1 - tp * 0.2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.translate(w / 2, 108);
        ctx.rotate(-0.18);
        ctx.scale(easeOutBack(tp), easeOutBack(tp));
        ctx.font = `900 26px ${FONT_HEAVY}`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#c02090';
        ctx.strokeText(params.label ?? 'RESERVED', 0, 0);
        ctx.fillStyle = 'rgba(192,32,144,0.25)';
        ctx.fillText(params.label ?? 'RESERVED', 0, 0);
        ctx.restore();
      }
    },
  },

  /** Well-Architected: 柱が1本立つ */
  pillar_raise: {
    layer: 'fg', ms: 800,
    draw(ctx, p, params, w, h) {
      const idx = (params.index ?? 1) - 1;
      const count = params.count ?? 6;
      const pw = 46;
      const gap = 10;
      const totalW = count * pw + (count - 1) * gap;
      const x = (w - totalW) / 2 + idx * (pw + gap);
      const baseY = 196;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - p;
      const g = ctx.createLinearGradient(0, baseY - 120, 0, baseY);
      g.addColorStop(0, 'rgba(255,240,180,0.9)');
      g.addColorStop(1, 'rgba(255,180,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 4, baseY - 120 * easeOutCubic(p), pw + 8, 120);
      ctx.restore();
    },
  },

  /** Trusted Advisor: 項目がグリーンになる */
  checklist_green: {
    layer: 'fg', ms: 700,
    draw(ctx, p, params, w, h) {
      const idx = (params.index ?? 1) - 1;
      const y = 54 + idx * 30;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - p) * 0.85;
      const g = ctx.createLinearGradient(46, 0, w - 46, 0);
      g.addColorStop(0, 'rgba(76,224,160,0)');
      g.addColorStop(easeOutCubic(p), 'rgba(76,224,160,0.9)');
      g.addColorStop(1, 'rgba(76,224,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(46, y, w - 92, 24);
      ctx.restore();
    },
  },

  /**
   * 天井到達: Auto Recovery 発動テロップ。
   *
   * 旧称 sla_credit(「SLA 99.9% 保証 / サービスクレジットを付与します」)。
   * サービスクレジットは SLA を下回ったときの返金補償であって、
   * 引き当てたプレイヤーへのご褒美ではない。AWS 的に意味が逆なので、
   * 「異常を検知したら自動で復旧させる」= EC2 Auto Recovery の表記へ統一した。
   */
  auto_recovery: {
    layer: 'ui', ms: 2400,
    draw(ctx, p, params, w, h) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p * 6) * (p > 0.8 ? (1 - p) / 0.2 : 1);
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, h / 2 - 46, w, 92);
      ctx.strokeStyle = '#7cf3ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, h / 2 - 46);
      ctx.lineTo(w, h / 2 - 46);
      ctx.moveTo(0, h / 2 + 46);
      ctx.lineTo(w, h / 2 + 46);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 24px ${FONT_HEAVY}`;
      ctx.fillStyle = '#7cf3ff';
      ctx.fillText('AUTO RECOVERY 発動', w / 2, h / 2 - 14);
      ctx.font = `700 14px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText('異常を検知しました — 自動復旧します', w / 2, h / 2 + 16);
      ctx.restore();
    },
  },

  /** Route 53: TTL が 0 になる瞬間 */
  ttl_zero: {
    layer: 'fg', ms: 1200,
    draw(ctx, p, params, w, h) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const r = 20 + easeOutCubic(p) * 200;
      const g = ctx.createRadialGradient(w / 2, 130, 4, w / 2, 130, r);
      g.addColorStop(0, `rgba(255,220,140,${0.8 * (1 - p)})`);
      g.addColorStop(1, 'rgba(255,90,90,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w / 2, 130, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  },

  /** エンディング: 紙吹雪 */
  ed_confetti: {
    layer: 'fg', ms: 3000,
    draw(ctx, p, params, w, h) {
      ctx.save();
      for (let i = 0; i < 40; i++) {
        const seed = i * 61;
        const x = (seed * 7) % w;
        const fall = ((p * (0.5 + (i % 6) * 0.14)) % 1);
        const y = -20 + fall * (h + 40);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p * 10 + i);
        ctx.fillStyle = `hsl(${(i * 37) % 360}, 95%, 68%)`;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(-4, -6, 8, 12);
        ctx.restore();
      }
      ctx.restore();
    },
  },

  /** 汎用: 液晶のズームフラッシュ */
  lcd_flash: {
    layer: 'fg', ms: 420,
    draw(ctx, p, params, w, h) {
      ctx.save();
      ctx.globalAlpha = (1 - p) * (params.strength ?? 0.65);
      ctx.fillStyle = params.color ?? '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },
  },
};

// ギミック予告用の追加アニメをレジストリへ合流させる(lcdanims-extra.js)。
// 名前衝突がないことは統合時に機械照合済み。ここを外すと lcd.anim が警告を出して無音失敗する。
Object.assign(LCD_ANIMS, LCD_ANIMS_EXTRA);

/* ══ 演出テキスト帯(lcd.text)の表示ルール ══════════════════
 *
 * シナリオが書いた ms は「最低これだけは出す」の下限として扱う。
 * ここで決めた最低表示時間より短くなることは絶対にない。
 * 尺の調整をシナリオ側でやらずに済むよう、判定はすべてこのファイルに閉じてある。
 */

/**
 * 実効文字数 → 最低表示時間[ms]。
 * 上から順に maxLen 以下の段が採用される。読みづらければここだけ触ればよい。
 */
export const TEXT_HOLD_TIERS = [
  { maxLen: 12, ms: 1600 },
  { maxLen: 22, ms: 2200 },
  { maxLen: Infinity, ms: 2800 },
];

/** 消えるときのフェードアウト時間[ms]。瞬時に消さないための下限でもある */
export const TEXT_FADE_MS = 300;

/** 出現にかける時間[ms] */
export const TEXT_APPEAR_MS = 170;

/** 順送りキューの上限。これを超えたら古い弱テキストから捨てる */
export const TEXT_QUEUE_MAX = 3;

/**
 * モードが変わったときに、前のモードの告知をあと何ms出してよいか(V31-03)。
 *
 * 0 にすると画面が切り替わった瞬間に文字が消えて「見間違いかな」となるので、
 * 消えていく途中だと分かるだけの余韻を残す。長くすると新しい盤面の数字に
 * 前の告知が重なる時間が伸びるので、TEXT_FADE_MS と同じくらいが上限。
 */
export const MODE_CHANGE_GRACE_MS = 260;

/**
 * レバーONで畳むときに残す余韻[ms](2026-08-15 検証指摘 F1)。
 *
 * 【問題】ステージ到着の告知(「サミット会場に到着」等)が
 *   **次のゲームを回し始めてから 2.4〜5秒** 画面に残っていた。
 *   犯人は releaseSticky が _requestFade を使っていたこと:
 *   _requestFade は最低表示時間(長文で 2.8秒)を必ず守るので、
 *   告知が出た直後にレバーONされると、その差ぶんだけ次のゲームへはみ出す。
 *   到着告知は director のキューが数百ms遅れて出るため、まともに直撃していた。
 *
 * 【方針】次の回転が始まったら、前のゲームの話は読ませない
 *   レバーONは「画面が次の話へ進んだ」合図なので、最低表示時間より優先する。
 *   ただし0にすると瞬間移動で消えて見間違いになるため、消えていく途中だと
 *   分かるだけの余韻を残す(モード遷移の MODE_CHANGE_GRACE_MS と同じ考え方)。
 *
 * 【F3 との関係】このゲームの結論が読まれずに飛ぶのを防ぐのは
 *   下の TEXT_HANDOFF_MS(結論が来たら前の表示を早く畳む)側の役目。
 *   両方そろって「結論は必ずそのゲームの中で出て、次の回転までに消える」になる。
 */
export const LEVER_RELEASE_GRACE_MS = 180;

/**
 * 新しい結論告知へ譲るときに、前の表示を見せる上限[ms](2026-08-15 検証指摘 F3)。
 *
 * 【問題】250ms間隔の高速目押しだと、第3停止で積んだ結論が
 *   前の表示の最低表示時間(1.6〜2.8秒)待ちのままレバーONを迎え、
 *   **次のゲームへずれ込んで**出ていた(前ゲームの結論が次の画面に出る)。
 *
 * 【方針】結論(sticky)が来たら、前の表示は「読み始められた」ところまでで譲る。
 *   0 にすると前の告知が一瞬で消えて何も読めないので、
 *   出現アニメ(TEXT_APPEAR_MS)+ 一拍ぶんは必ず見せる。
 *
 * 実測(ブラウザ / 前の表示が出た直後に結論を積んだ最悪ケース):
 *   700 … 結論が出るまで 897ms
 *   520 … 結論が出るまで 約700ms(= 譲り 520 + フェード 300 の重なり)  ← 現行
 * ここから下げると前の告知が読めなくなるので、520 を下限とみなすこと。
 */
export const TEXT_HANDOFF_MS = 520;

/**
 * 自動 sticky 判定に使う語。
 * 「見逃すと今の状況が分からなくなる告知」だけを入れること。
 * 語を足したくなったらこの配列(と下の STICKY_PATTERNS)だけを直す。
 */
export const STICKY_KEYWORDS = [
  '確定',
  '突入',
  'BONUS',
  'RUSH',
  '昇格',
  '継続',
  // 既存シナリオではセット継続の告知が英語で書かれているので、同じ意味の語を並べておく
  'CONTINUE',
];

/** 「+120枚」「+2セット」「+3 SET」のような獲得告知 */
export const STICKY_PATTERNS = [
  /\+\s*\d+\s*枚/,
  /\+\s*\d+\s*(?:セット|SET)/i,
];

/**
 * テキスト内容から「レバーONまで残すべき告知か」を判定する。
 * シナリオを1件も書き換えずに重要告知を残せるようにするためのヒューリスティック。
 * params.sticky を明示した場合はそちらが優先される(showText 側で分岐)。
 * @param {string} text
 * @returns {boolean}
 */
export function isStickyText(text) {
  if (!text) return false;
  const s = String(text);
  const upper = s.toUpperCase();
  if (STICKY_KEYWORDS.some((k) => upper.includes(k.toUpperCase()))) return true;
  return STICKY_PATTERNS.some((re) => re.test(s));
}

/**
 * そのテキストを読み切るのに必要な最低表示時間[ms]。
 * サブ行は補足なので半分の重みで数える。
 * @param {string} text
 * @param {string} [sub]
 */
export function textHoldMs(text, sub = '') {
  const len = String(text ?? '').length + Math.ceil(String(sub ?? '').length * 0.5);
  const tier = TEXT_HOLD_TIERS.find((t) => len <= t.maxLen) ?? TEXT_HOLD_TIERS[TEXT_HOLD_TIERS.length - 1];
  return tier.ms;
}

/* ── 重複排除 ────────────────────────────────────────────
 * 「ボーナス確定」と「ゴーストボーナス確定!」のように、
 * 前兆の結果告知・突入演出・入賞ファンファーレが似た文言を別々に投げてくる。
 * シナリオ側は直さず(文言の出所は各シナリオの責任のまま)、
 * 受け側のここで束ねて "液晶に出るのは常に1つ" を保証する。 */

/**
 * 厳密比較用の正規化。空白・記号・！などを落として大文字に揃える。
 * 「BONUS 確定」と「BONUS確定!!」を同一視するためのもの。
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^0-9A-Z぀-ヿ一-鿿]+/gu, '');
}

/** カテゴリ判定用のゆるい正規化(語の切れ目は空白として残す) */
function looseForm(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^0-9A-Z぀-ヿ一-鿿]+/gu, ' ')
    .trim();
}

/** ゆるい正規化済みの文字列に語が含まれるか(英数字の語は語単位で見る) */
function hasWord(loose, word) {
  if (word instanceof RegExp) return word.test(loose);
  const w = String(word).normalize('NFKC').toUpperCase();
  if (!w) return false;
  // 日本語は部分一致でよいが、英数字は語単位で見ないと REG が REGION に当たってしまう
  if (!/^[0-9A-Z]+$/.test(w)) return loose.includes(w);
  return new RegExp(`(?:^|[^0-9A-Z])${w}(?:[^0-9A-Z]|$)`).test(loose);
}

/**
 * 同じ話題として束ねるテキストのカテゴリ表。上から順に判定し、最初に当たったものを採用する。
 *
 * groups は「AND の OR」:
 *   groups: [['確定'], ['ボーナス', 'BONUS']]  … 『確定』を含み、かつ『ボーナス』か『BONUS』を含む
 *   groups: [['ボーナス', 'BONUS']]            … いずれかを含む
 * 文字列のほか正規表現も置ける。カテゴリを足したいときはこの配列に1件足すだけでよい。
 */
export const TEXT_CATEGORIES = [
  {
    /**
     * セット継続。**ボーナス告知より先に置く**(2026-08-14 検証で判明)。
     * 「ボーナス継続!! — SET 3 へ」は『ボーナス』も『継続』も含むので、
     * bonus を先に置くと継続告知まで『ボーナス告知』に吸われ、
     * 継続の二重表示(液晶のジャッジ演出 + 下部テロップ)が素通りしていた。
     * 後ろの語(継続)のほうが出来事を細かく指すので、細かい方を先に判定する。
     */
    id: 'set_continue',
    label: 'セット継続',
    groups: [['継続', 'CONTINUE']],
  },
  {
    id: 'bonus',
    label: 'ボーナス告知',
    // 「BONUS 確定」「BONUS 生成完了」「GHOST BONUS」を1つに束ねる。
    // 『確定』側でさらに絞りたくなったら groups に ['確定'] を足す。
    groups: [['ボーナス', 'BONUS', 'BIG', 'REG', 'ゴースト7', 'GHOST7']],
  },
  {
    id: 'rush_entry',
    label: 'RUSH突入',
    groups: [['RUSH', 'ラッシュ']],
  },
  {
    /**
     * スケールアウト(台数が増える)/ スケールイン(2026-08-14 検証 major)。
     * U31 で上乗せ告知を lcd.text から液晶アニメ(scale_out_slam)へ移したため、
     * 液晶は日本語の「スケールアウト!!」、モード側テロップは
     * 「SCALE OUT!! EC2 +3 台 → 8 台稼働(= 残り 8 G)」と **一字も重ならない**。
     * 正規化でも前方一致でも当たらないので、カテゴリで束ねて二重表示を止める。
     */
    id: 'scale_out',
    label: 'スケールアウト(台数)',
    groups: [['スケールアウト', 'SCALE OUT', 'スケールイン', 'SCALE IN']],
  },
  {
    /** スケールアップ(器が育つ)。上と同じ理由(液晶=日本語 / テロップ=英語)*/
    id: 'scale_up',
    label: 'スケールアップ(ACU)',
    groups: [['スケールアップ', 'SCALE UP']],
  },
  {
    /**
     * RUSH終了 → 引き戻し層(2026-08-14 U17)。
     * ポップアップ「RUSH 終了 — 引き戻しへ」と、モード側のテロップ
     * (「ディストリビューション終了… ホットスタンバイへ」など4種で文言が違う)は
     * 同じ出来事を指しているのに一字も重ならないので、正規化では一致しない。
     * カテゴリで束ねて、ポップアップが出ている間はテロップを黙らせる。
     */
    id: 'standby',
    label: '引き戻し層へ',
    groups: [['ホットスタンバイ', 'HOT STANDBY', '引き戻し']],
  },
];

/**
 * テキストのカテゴリID(該当なしなら null)。
 * @param {string} text
 * @returns {string|null}
 */
export function categoryOf(text) {
  const loose = looseForm(text);
  if (!loose) return null;
  const hit = TEXT_CATEGORIES.find(
    (cat) => cat.groups.every((group) => group.some((word) => hasWord(loose, word))),
  );
  return hit?.id ?? null;
}

/**
 * 2つの文言を「同じことを言っている」とみなすか。
 * 正規化して一致するか、同じカテゴリに属していれば重複とみなす。
 * 筐体下部のテロップとの重複排除にも使えるよう公開している。
 * @param {string} a
 * @param {string} b
 */
export function isDuplicateText(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ca = categoryOf(a);
  return ca != null && ca === categoryOf(b);
}

/**
 * 告知としての情報量。同カテゴリで競合したとき、大きい方だけを残す。
 * 「ボーナス確定」より「ゴーストボーナス確定!」の方が具体的、という素朴な指標。
 */
function infoScore(entry) {
  return entry.normalized.length + (entry.sub ? 1 : 0);
}

/* ── 常設文言(ambient)との相互 dedup ──────────────────────
 * 液晶のモード画面は「BONUS 確定!!」のような文言を常設で出している。
 * そこへテキスト帯が同じことを書くと、同じ告知が画面に2つ並ぶ。
 * 描画側(render/lcd.js)が毎フレーム「今この文言を出している」と申告し、
 * テキスト帯はそれと同カテゴリの文言を出さない(常設が正)。 */

/** 申告が途切れてから常設文言を忘れるまでの時間[ms]。毎フレーム申告される前提の保険 */
export const AMBIENT_TTL_MS = 300;

/**
 * テキストが出た直後に常設と被っていると分かった場合、
 * 「まだ誰も読んでいない」とみなして即座に取り下げてよい猶予[ms]。
 * 常設文言の申告は描画のたびに届くので、数フレームの遅れが必ず出るため。
 */
export const AMBIENT_RACE_MS = 200;

/** @type {Map<string, {text:string, category:string|null, at:number}>} */
const AMBIENT_TEXTS = new Map();

/**
 * 「いま液晶に常設で出している文言」を申告する。描画のたびに呼んでよい。
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {boolean} [opts.matchCategory]
 *   true(既定): 同じカテゴリの文言も重複とみなす。モード画面の見出し向け。
 *   false: 完全一致だけを重複とみなす。モードのルール文(telop)のように
 *          長い説明文で、たまたまカテゴリ語を含むだけの場合に使う。
 *          (「純増4枚 継続80%」というルール文で継続告知まで消えてしまうのを防ぐ)
 */
export function registerAmbientText(text, { matchCategory = true } = {}) {
  const normalized = normalizeText(text);
  if (!normalized) return;
  const known = AMBIENT_TEXTS.get(normalized);
  if (known) {
    known.at = Date.now();
    return;
  }
  AMBIENT_TEXTS.set(normalized, {
    text: String(text),
    category: matchCategory ? categoryOf(text) : null,
    at: Date.now(),
  });
}

/**
 * 申告が生きている常設文言の一覧。
 *
 * U66-5 で下部パネルへのテロップ流し込みを廃止したので **本番の描画からは呼ばれない**
 * (いまの唯一の消費者は showText 内の coveredByAmbient)。
 * 「盤面がいま何を言っているか」を外から覗く口として、検証・デバッグ用に残してある。
 */
export function getAmbientTexts() {
  const now = Date.now();
  const out = [];
  for (const [key, v] of AMBIENT_TEXTS) {
    if (now - v.at > AMBIENT_TTL_MS) AMBIENT_TEXTS.delete(key);
    else out.push(v.text);
  }
  return out;
}

/** 常設文言の申告をすべて忘れる(テスト・リセット用) */
export function clearAmbientTexts() {
  AMBIENT_TEXTS.clear();
}

/** 常設で同じことを言っている文言があるか */
function coveredByAmbient(entry) {
  const now = Date.now();
  for (const [key, v] of AMBIENT_TEXTS) {
    if (now - v.at > AMBIENT_TTL_MS) {
      AMBIENT_TEXTS.delete(key);
      continue;
    }
    if (key === entry.normalized) return true;
    if (v.category != null && v.category === entry.category) return true;
  }
  return false;
}

/**
 * テキスト1件ぶんの状態。
 * phase: 'hold'(表示中) → 'fade'(フェードアウト中) → 破棄
 */
function createTextEntry({
  text, sub = '', ms = null, color = '#ffffff', sticky = null, tone = 'normal',
} = {}) {
  const minHoldMs = textHoldMs(text, sub);
  const wantedMs = Number.isFinite(ms) ? Number(ms) : 0;
  // sticky は明示指定 > 内容によるヒューリスティック の順で決まる
  const isSticky = sticky == null ? isStickyText(text) : Boolean(sticky);
  // トーンを指定した場合はその色が主役(赤で煽ると決めた文言なので cue の color より優先)
  const toneName = TEXT_TONES[tone] ? tone : 'normal';
  return {
    text: String(text),
    sub: sub ? String(sub) : '',
    tone: toneName,
    color: TEXT_TONES[toneName].color ?? color,
    sticky: isSticky,
    /** 重複判定用のキャッシュ(毎フレーム作り直さないよう作成時に持たせる) */
    normalized: normalizeText(text),
    category: categoryOf(text),
    minHoldMs,
    wantedMs,
    /** sticky は解除されるまで消えない(= 保持時間は無限) */
    holdMs: isSticky ? Infinity : Math.max(wantedMs, minHoldMs),
    elapsed: 0,
    phase: 'hold',
    fadeElapsed: 0,
  };
}

/* ── ステージイベントの受け口 ────────────────────────────
 * テキスト帯はシナリオより長生きするので、シナリオの外側から
 * 「レバーONが来た」を伝える口が要る。main.js を触らずに配線できるよう、
 * 生きている LcdAnims をモジュール側で覚えておき、staging/director.js が
 * notifyStageEvent() で叩く。(依存方向は staging → staging のまま) */

/** @type {Set<LcdAnims>} */
const TEXT_HOSTS = new Set();

/** LcdAnims を受け口として登録する。戻り値を呼ぶと解除できる */
export function registerTextHost(host) {
  TEXT_HOSTS.add(host);
  return () => TEXT_HOSTS.delete(host);
}

/* ══ 大文字告知の「言い切り」記録(2026-08-15 検証 V31-04)══════════════
 *
 * 【問題】アニメが消えた後にテロップが同じことを言い直す
 *   上乗せ告知はアニメ(scale_out_slam / scale_up_slam)が大文字で
 *   「スケールアウト!!」を描き、下部テロップには
 *   「SCALE OUT!! EC2 +3 台 → 8 台稼働(= 残り 8 G)」が出る。
 *   ANIM_HEADLINES + TEXT_CATEGORIES の判定はアニメが **再生中の間だけ** 効くので、
 *   アニメの尺(1.9秒)が切れた瞬間からテロップが出てきて、
 *   「同じ出来事を、別の数え方で、2回」言うことになっていた
 *   (大文字は台数、テロップは台数と残Gの両方 = 数字が食い違って見える)。
 *
 * 【方針】言い切ったことは、そのゲームのうちは繰り返さない
 *   アニメが大文字を出したら **次のレバーONまで** その文言を覚えておき、
 *   同じことを言うテロップは伏せ続ける。テロップは持続情報なので、
 *   ゲームが変われば(= 状況が新しくなれば)また出てよい。
 *   覚えるのは文言だけで、当落の情報は一切持たない。
 * @type {Set<string>}
 */
const SPOKEN_HEADLINES = new Set();

/**
 * アニメが大文字で言い切った文言を記録する(LcdAnims.play から呼ぶ)。
 * @param {string} text
 */
export function noteSpokenHeadline(text) {
  if (text) SPOKEN_HEADLINES.add(String(text));
}

/** 記録した文言を忘れる(次のゲームが始まったときとテスト用) */
export function clearSpokenHeadlines() {
  SPOKEN_HEADLINES.clear();
}

/**
 * 生きているテキスト帯へゲーム進行イベントを伝える。
 * 現状 'leverOn' だけが意味を持ち、sticky 告知の解除と
 * 大文字告知の記録(V31-04)の破棄に使う。
 * @param {string} eventName
 */
export function notifyStageEvent(eventName) {
  if (eventName === 'leverOn') clearSpokenHeadlines();
  for (const host of TEXT_HOSTS) host.onStageEvent(eventName);
}

/**
 * 液晶に出ている文言の一覧(表示中 + 待機中の sticky 告知)。
 * LcdAnims の参照を持っていない側からも引けるようにモジュール関数でも公開する。
 * 盤面の常設行など、別の場所に同じ文言を出さないための判定に使う:
 *   if (getVisibleTexts().some((t) => isDuplicateText(t, line))) その行は出さない
 * @returns {string[]}
 */
export function getVisibleTexts() {
  const out = [];
  for (const host of TEXT_HOSTS) out.push(...host.getVisibleTexts());
  return [...new Set(out)];
}

/**
 * 液晶に出ている文言を **メイン行とサブ行の組** で返す。
 *
 * 2026-08-14 ユーザー指摘 U17(「SQSが捌けていない」等の二重表示):
 * これまでの重複判定はポップアップの **メイン行しか見ていなかった** ため、
 *   ポップアップ: text『BACKLOG: 2』 sub『SQS のキューが捌けていない』
 *   盤面の常設行: 『SQS のキューが捌けていない』
 * のように **サブ行と盤面の行が完全に同じ** ケースを取りこぼしていた。
 * サブ行は「持続情報の要約」を書きがちなので、盤面の行とぶつかりやすい。
 * @returns {{text:string, sub:string}[]}
 */
export function getVisibleTextLines() {
  const out = [];
  for (const host of TEXT_HOSTS) out.push(...(host.getVisibleTextLines?.() ?? []));
  return out;
}

/**
 * 「いま出ているポップアップが、この文言と同じことを言っているか」。
 * 2026-08-14 ユーザー指摘 U8(同じことを2か所へ書かない)。
 *
 * 役割分担は **瞬間の告知=ポップアップ / 持続する情報=盤面**(2026-08-15 U66-5 で
 * 説明テロップ帯を廃止し、この2系統だけになった)。
 * 同じことを同時に2か所へ書かないよう、盤面側(render/lcd.js の _drawRuleLine ほか)が
 * 描く直前にここへ問い合わせ、被っている間は盤面の行を引っ込める。
 * ポップアップは尺が来れば必ず消えるので、そのあと盤面が状態表示として残る。
 *
 * 判定は3段:
 *   1. 正規化して完全一致          「BONUS 確定」=「BONUS確定!!」
 *   2. 一方がもう一方の先頭に一致  「SCALE IN」⊂「SCALE IN — DC 4 → 2 台で縮退運転」
 *   3. 同じカテゴリ(TEXT_CATEGORIES) 「キャパシティ確保 — 継続!!」と「ボーナス継続!! — SET 3 へ」
 * 2 は「短い見出し + テロップで詳細」という当機の書き方に効く。
 *
 * 見る文言は lcd.text に積まれたものだけではなく、
 * **アニメが canvas に直接描く大文字(ANIM_HEADLINES)も含む**。
 * U31/U41 で告知を lcd.text からアニメへ移したときに、ここが抜けて
 * 二重表示が復活したことがある(2026-08-14 検証 major)。
 *
 * ■ 前方一致の条件を厳しくした(2026-08-14 検証指摘)
 *   旧: 4文字以上が前方一致すれば重複とみなす
 *   → 「RUSH 終了」の頭4文字だけで「RUSH 中の別情報」まで巻き添えにできてしまい、
 *      **関係ない状態情報が黙る**(伏せてはいけないテロップが消える)事故が起こりうる。
 *   新: 短い側が TELOP_PREFIX_MIN(6文字)以上 **かつ** 長い側の
 *      TELOP_PREFIX_RATIO(40%)以上を占めていることを要求する。
 *      「見出し + 詳細」は普通この条件を満たす(例: SCALEIN ⊂ SCALEINDC42台… は
 *       7/16 = 44% なので、この条件で伏せられる)。
 *      ※ ここの数値は下の TELOP_PREFIX_RATIO と必ず一致させること。
 *        以前このコメントだけ 50% のまま取り残されていた(2026-08-14 検証 minor)。
 *
 * ■ サブ行も見る(U17)
 *   ポップアップのサブ行とテロップが同じ文のケースを取りこぼしていたため、
 *   サブ行は **完全一致と同カテゴリ** だけを重複とみなす(前方一致は使わない。
 *   サブ行は説明文なので前方一致まで許すと巻き込みが大きい)。
 *
 * @param {string} text
 * @returns {boolean}
 */
export const TELOP_PREFIX_MIN = 6;
/**
 * 前方一致で重複とみなすのに必要な「短い側 / 長い側」の比率。
 *
 * 0.4 は「見出し + 詳細」という当機の書き方から決めた値(以下は形の例):
 *   伏せる  「SCALE IN」⊂「SCALE IN — DC 4 → 2 台で縮退運転」  … 7/16 = 0.44
 *           (見出しが丸ごと繰り返されるので、ポップアップが出ている間は
 *            テロップを引っ込める。ポップアップが消えれば詳細つきのテロップが残る)
 *   伏せない「CZ突入」⊂「CZ突入まで残り 3G の別情報」            … 4文字は前方一致の対象外
 * 4文字止まりの見出しで巻き添えにしていたのが旧実装の問題(誤伏せ)だった。
 *
 * ※ 2026-08-14 検証: 上の2例は **いま実在する文言ではない**(比率の感覚をつかむための
 *   形の例として残している)。「SCALE IN …」は AS RUSH の単純化で廃止、
 *   「SCALE UP!! …」は U41 で lcd.text から液晶アニメへ移した。
 *   **アニメが描く大文字は前方一致では拾えない**ので、そちらは
 *   ANIM_HEADLINES + TEXT_CATEGORIES(scale_out / scale_up)で束ねている。
 */
export const TELOP_PREFIX_RATIO = 0.4;

/** 前方一致による重複判定(上のコメントの条件) */
function prefixCovers(a, b) {
  if (!a || !b) return false;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (short.length < TELOP_PREFIX_MIN) return false;
  if (short.length / long.length < TELOP_PREFIX_RATIO) return false;
  return long.startsWith(short);
}

export function stageTextCovers(text) {
  const nt = normalizeText(text);
  if (!nt) return false;
  /*
   * V31-04: このゲームでアニメが大文字で言い切ったことは、
   * アニメが消えたあとでもテロップに書かない(次のレバーONで忘れる)。
   */
  for (const spoken of SPOKEN_HEADLINES) {
    if (normalizeText(spoken) === nt) return true;
    if (isDuplicateText(spoken, text)) return true;
  }
  for (const { text: main, sub } of getVisibleTextLines()) {
    const nv = normalizeText(main);
    if (nv) {
      if (nv === nt) return true;
      if (prefixCovers(nv, nt)) return true;
      if (isDuplicateText(main, text)) return true;
    }
    const ns = normalizeText(sub);
    if (ns) {
      if (ns === nt) return true;
      if (isDuplicateText(sub, text)) return true;
    }
  }
  return false;
}

/**
 * 実行中の液晶アニメを畳みにかかる。
 * 上位の演出が割り込んだときに、下位の賑やかしを早送りで終わらせるために使う。
 * @param {number} [maxLeftMs]
 */
export function windDownStageAnims(maxLeftMs = 220) {
  for (const host of TEXT_HOSTS) host.windDown(maxLeftMs);
}

/**
 * 全面占有演出(クイズ等)の裏へテキスト帯を回す/戻す。
 * @param {boolean} on
 */
export function setStageBandDeferred(on) {
  for (const host of TEXT_HOSTS) host.setDeferred(on);
}

/* ══ ステージ背景の切替を遅らせるアニメ(2026-08-14 ユーザー指摘 U42)═══
 *
 * 【問題】クイズ演出の当落バレ
 *   正解版のクイズ(data/scenarios/quiz.js の qz_quiz_entry_cz)は
 *   **CZ の modeEnter** で始まる = 出題した瞬間にはもうモードが CZ になっている。
 *   render/lcd.js は modeId でステージ背景を選ぶので、
 *   ルーレットが回り出す前に背景が CZ の赤紫へ変わってしまい、
 *   「この出題は正解する」が回答前に分かってしまっていた。
 *
 * 【方針】ゲーム側は一切触らない
 *   モード遷移そのものは正しい(当選しているのだから CZ に居るのが正)。
 *   直すのは **見せる順番** だけ。ここに登録したアニメが「まだ結果を出していない」
 *   間は、render/lcd.js が **1つ前のステージ背景を描き続ける**。
 *   結果を出した瞬間(クイズなら phase:'reveal')に本来の背景へ切り替わる。
 *   不正解版はモードが変わらないので、そもそも通常背景のまま何も起きない。
 *
 * 値は「そのパラメータで再生中はまだ伏せている」を返す述語。
 * アニメが尺切れで消えれば hold は自然に解けるので、固まったままにはならない。
 */
export const STAGE_HOLD_ANIMS = {
  // 【休止中】クイズルーレット(U53 で発生を止めた。盤面は残してある)
  aws_quiz_roulette: (params) => params?.phase !== 'reveal',
  /**
   * U64-2 リール3択クイズ(旧 U53「最初に止めるリール」)。クイズと同じ理由でここに要る:
   * 正解版は CZ の modeEnter で始まる = 出題の瞬間にはもうモードが CZ なので、
   * 何もしないと背景・ステージ名が先に CZ へ変わって「これは正解する」がバレる。
   * phase:'answer'(判定発表)になった瞬間に本来の背景へ切り替わる。
   *
   * 【hold:true を書いた再生だけが対象】
   *   保留が効いている間は render/lcd.js の stageMasked が立ち、
   *   main.js が **投入とレバーを受け付けなくなる**(V31-07 の入力ガード)。
   *   正解版は同じゲームの第1停止で開けるので問題ないが、
   *   不正解版(qz_reelpick_miss)は払出中に出題して **次のゲームの第1停止**で開ける。
   *   ここで投入・レバーが塞がると誰も進められなくなるため、
   *   **モードが変わる正解版にだけ hold:true を渡す**(不正解版はモードが変わらず
   *   隠すものが無いので、保留しなくても当落は一切バレない)。
   *   モードが変わる出題を足すときは、その ask キューに hold:true を書くこと。
   */
  reel_pick_choice: (params) => params?.hold === true && params?.phase !== 'answer',
};

/* ══ アニメが自分で描く大文字の申告(2026-08-14 検証 major)═══════════
 *
 * 【問題】U31/U41 で上乗せ告知を lcd.text から液晶アニメへ移したところ、
 *   U8(同じ情報をポップアップとテロップに二重表示しない)の抑止が外れた。
 *   二重表示の判定(stageTextCovers)は **lcd.text に積まれた文言しか見ない** ので、
 *   アニメが canvas に直接描いた「スケールアウト!!」は存在しないことになり、
 *   下部パネルのテロップ「SCALE OUT!! EC2 +3 台 → 8 台稼働(= 残り 8 G)」が
 *   そのまま出て、液晶と同じことを2か所で言っていた。
 *
 * 【方針】描画側から毎フレーム申告させない
 *   registerAmbientText を draw から呼ぶ手もあるが、
 *   ・アニメが見えない位置(alpha 0)でも申告してしまう
 *   ・描画とdedupの順序で数フレームのレースが出る
 *   ので、**「このアニメが再生中なら、この大文字を出している」を宣言で持つ**。
 *   再生中かどうかは LcdAnims が知っているので取りこぼしもレースも起きない。
 *
 * 値は params から見出し文字列を返す関数(出していないときは空文字)。
 * 日英が混じって正規化では一致しないため、束ねるのは TEXT_CATEGORIES の
 * scale_out / scale_up / set_continue カテゴリが担当する。
 * **新しく大文字スラムを描くアニメを足したら、ここにも1行足すこと。**
 */
export const ANIM_HEADLINES = {
  /** U31: AS RUSH の上乗せ(テロップは「SCALE OUT!! EC2 +n 台 → …」) */
  scale_out_slam: () => 'スケールアウト!!',
  /** U41: Aurora RUSH の上乗せ(テロップは「SCALE UP!! ACU 4 → 5 …」) */
  scale_up_slam: () => 'スケールアップ!!',
  /** U34: ボーナスのセット継続ジャッジ(テロップは「ボーナス継続!! — SET n へ」) */
  capacity_judge: (params) => (params?.ok ? 'キャパシティ確保 — 継続!!' : ''),
  /*
   * U64-7 の申し送り: health_check_impact はここに登録しない。
   * 失敗側(RUSH 終了)は盤面から文字を落として **ポップアップ1枚**へ寄せたので、
   * 盤面が言い切っている文言は存在しない(継続側の『継続!!』は
   * upper.js / cz.js がテロップ側で言わない約束で担保している)。
   * 盤面へ大文字を戻すときは、ここへの登録も忘れずに。
   */
  /**
   * U64-2: リール3択クイズの判定。判定を出しているのは **盤面だけ** なので、
   * 同じ「正解!! / 不正解…」をテロップにも書かせない(U8)。
   *
   * 中身は **押したリールと正解の位置の一致**(事実)で決まる。当落は見ない
   * (実装は lcdanims-extra.js の reelPickHeadlineOf)。
   * 出題中(phase:'ask')や回答が届いていないときは空文字。
   */
  reel_pick_choice: (params) => reelPickHeadlineOf(params),
  /**
   * U59: ボーナス中の AWS豆知識カード。
   * カードが液晶に大きく出しているサービス名を申告して、
   * 同じ名前をテロップにも書かせない(U8)。
   *
   * 中身(どのサービスを出すか)は **この関数が呼ばれた時点** で決まる。
   * ANIM_HEADLINES は LcdAnims.play の中で1回だけ評価されるので、
   * 引いた1枚は params へ控えられ、draw はそれを読み継ぐ
   * (実装は lcdanims-extra.js の triviaHeadlineOf / triviaStateOf)。
   * dismiss:true の再生(次のレバーONでカードを消す差し替え)は空文字を返す。
   */
  aws_trivia_card: (params) => triviaHeadlineOf(params),
};

/**
 * いまステージ背景の切替を保留すべきか(どれかの受け口が保留中なら true)。
 * @returns {boolean}
 */
export function isStageHeld() {
  for (const host of TEXT_HOSTS) if (host.holdsStage?.()) return true;
  return false;
}

/* ══ テキストの自動レイアウト ═══════════════════════════════
 *
 * 予告の文言は長さがまちまちで、液晶(440px)から溢れるものがある。
 * シナリオ側で改行位置を書かせると文言を直すたびに調整が必要になるので、
 * 描画時に「折り返す → それでも入らなければ縮める → 最後は省略」を自動でやる。
 *
 * lcdanims-extra.js の固定キャプションからも使えるように export してある。
 */

/**
 * これ以上は小さくしない下限[px]。
 *
 * 2026-08-14 ユーザー指摘 U39「演出の文字が小さい」対応で 12 → 14。
 * 液晶は 440px の論理幅を実画面では 0.9 倍前後で表示するので、
 * 12px は実測 11px 相当まで沈んで**読ませる気のない大きさ**になっていた。
 * 下限を上げたぶん長い文言は2行へ折れるが、wrapText が自動で折るので
 * シナリオ側の文言を書き換える必要はない。
 */
export const TEXT_MIN_FONT_PX = 14;

/** テキスト帯の左右の余白[px](下敷きプレートの内側) */
export const TEXT_SIDE_PAD = 28;

/**
 * メイン行/サブ行の基準サイズ[px]。
 * サブ行は U39 で 14 → 16(説明文なのに一番小さい、が読みにくさの主因だった)。
 */
export const TEXT_MAIN_FONT_PX = 28;
export const TEXT_SUB_FONT_PX = 16;

/**
 * 液晶アニメ(LCD_ANIMS / LCD_ANIMS_EXTRA)が描く文字の下限[px](U39)。
 *
 * ■ なぜアニメ側に一括の下限が要るか
 *   個々のアニメは「情報量の多いパネル」を作るために 8〜10px の極小フォントを
 *   直書きしている(Bedrock生成パネルのヘッダ・ステータス行・stop_reason など)。
 *   実画面では 7〜9px 相当で、**読めないのに場所だけ取る**状態だった。
 *   アニメは 30 本以上・2ファイルに散っているので、1本ずつ直すと必ず取りこぼす。
 *
 * ■ 効かせ方
 *   draw() の間だけ ctx.font のセッターを差し替えて、指定サイズをこの値で
 *   下から丸める(installMinFontSize)。**幅の計算は measureText 経由**なので、
 *   「文字を並べて幅ぶん進める」書き方のアニメ(monoText の戻り値を足していく等)は
 *   自動で新しい幅に追従する。
 *
 * ■ 上げすぎないこと / この値の決め方
 *   14 まで上げると密なパネル(クイズの選択肢・DeepRacer のラップ表示)で
 *   固定座標のラベル同士がぶつかる。
 *   12 で試したところ、**Bedrock生成パネルのヘッダが実際に接触した**
 *   (左の『Amazon Bedrock』と右寄せの『InvokeModelWithResponseStream』が
 *    重なって「Amazon BedrocInvokeModel…」と読めた。2026-08-14 検証 V31-01)。
 *   申し送りどおり **11** へ下げてある。実画面で約10px、小さいが読める下限。
 *   ここを動かすときは必ず「左右に固定座標のラベルが並ぶパネル」
 *   (Bedrock / FIS / CodeDeploy)を目視で確認すること。
 */
export const LCD_ANIM_MIN_FONT_PX = 11;

/** CSSフォント指定から px サイズを取り出す(font 短縮記法の唯一の長さ) */
const FONT_SIZE_RE = /(\d+(?:\.\d+)?)px/;

/** フォント指定のサイズを下限で丸める。'700 9px mono' → '700 12px mono' */
export function bumpFontSize(spec, minPx = LCD_ANIM_MIN_FONT_PX) {
  const s = String(spec ?? '');
  return s.replace(FONT_SIZE_RE, (whole, num) => {
    const size = Number(num);
    return Number.isFinite(size) && size < minPx ? `${minPx}px` : whole;
  });
}

/** プロトタイプ鎖から font のアクセサ定義を探す(テスト用スタブ ctx でも落ちないように) */
function findFontAccessor(obj) {
  for (let o = obj; o; o = Object.getPrototypeOf(o)) {
    const d = Object.getOwnPropertyDescriptor(o, 'font');
    if (d) return d;
  }
  return null;
}

/** font フックを張り終えた ctx(2度定義しないための印) */
const FONT_HOOKED = new WeakSet();

/**
 * 丸めを効かせる下限[px]。0 のあいだフックは素通しで、指定はそのまま通る。
 * フック自体を毎フレーム付け外しすると ctx のプロパティ構造が揺れて
 * (V8 の dictionary 化)描画全体が遅くなるため、**張るのは1回だけ**にして
 * 効き目のオン/オフはこの値で切り替える。
 */
let fontMinActive = 0;

/**
 * ctx.font の指定サイズを下限で丸めるようにする。戻り値を呼ぶと丸めを止める。
 * 単純なデータプロパティの ctx(テストのスタブ)には何もしない。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} minPx
 * @returns {() => void} 解除関数
 */
export function installMinFontSize(ctx, minPx = LCD_ANIM_MIN_FONT_PX) {
  const noop = () => {};
  if (!ctx || !(minPx > 0)) return noop;
  if (!FONT_HOOKED.has(ctx)) {
    const desc = findFontAccessor(ctx);
    if (typeof desc?.set !== 'function' || typeof desc?.get !== 'function') return noop;
    Object.defineProperty(ctx, 'font', {
      configurable: true,
      enumerable: false,
      get() { return desc.get.call(this); },
      set(v) { desc.set.call(this, fontMinActive > 0 ? bumpFontSize(v, fontMinActive) : v); },
    });
    FONT_HOOKED.add(ctx);
  }
  fontMinActive = minPx;
  return () => { fontMinActive = 0; };
}

/**
 * 折り返してよい位置。ここで切ると読点や中黒の後ろで自然に折れる。
 * 該当が無い文言(「めったに読まないデータを最安保管」等)は文字単位で折る。
 */
export const TEXT_BREAK_CHARS = '、。，．・…！？!?：:；;／/ 　';

/** 読点・スペース・中黒などで区切る(区切り文字は前の塊に含める) */
function splitPhrases(text) {
  const out = [];
  let buf = '';
  for (const ch of String(text)) {
    buf += ch;
    if (TEXT_BREAK_CHARS.includes(ch)) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** 1行に収まらない塊は文字単位へばらす */
function toUnits(text, measure, maxWidth) {
  const units = [];
  for (const phrase of splitPhrases(text)) {
    if (measure(phrase.trimEnd()) <= maxWidth) units.push(phrase);
    else for (const ch of phrase) units.push(ch);
  }
  return units;
}

/** 貪欲法で行に詰める */
function packLines(measure, text, maxWidth) {
  const units = toUnits(text, measure, maxWidth);
  const lines = [];
  let cur = '';
  for (const u of units) {
    const next = cur + u;
    if (cur && measure(next.trimEnd()) > maxWidth) {
      lines.push(cur.trimEnd());
      cur = u.replace(/^[\s　]+/, '');
    } else {
      cur = next;
    }
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines.length > 0 ? lines : [text];
}

/* ══ 禁則処理(2026-08-15 検証指摘 F2)═══════════════════════════════
 *
 * 【問題】「パブリックアクセスをブロッ / ク」のように、
 *   最後の1〜2文字だけが2行目へこぼれる行が多発していた(いわゆる泣き別れ)。
 *   貪欲法は「入るだけ詰める」ので、あと1文字で溢れる長さの文言で必ず起きる。
 *
 * 【方針】行を増やさずに、**折る位置を1〜2文字ぶん手前へ送る**
 *   前の行の末尾を最終行へ送り出すので、幅を超えることは絶対にない
 *   (前の行は短くなるだけ)。フォントを縮める手もあるが、
 *   U39 で「演出の文字が小さい」と指摘されているので大きさは触らない。
 *   行頭に来てはいけない記号(句読点・閉じ括弧・長音など)へ送ってしまった場合は
 *   もう1文字ぶん送って、記号が行頭に立たないようにする。
 */

/** これ以下の文字数しか残らない最終行を「泣き別れ」とみなす */
export const ORPHAN_MAX_CHARS = 2;

/**
 * 行頭に置いてはいけない文字(送り出した先が読点や小書き仮名で始まる、を防ぐ)。
 * 句読点・閉じ括弧・長音・小書き仮名を並べてある。
 */
export const NO_LINE_START_CHARS = '、。，．・…!?！?)）]】』」〕>》%ー〜:;：;/／'
  + 'ァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎ';

/** 最終行が1〜2文字だけになっていないか */
function hasOrphanLine(lines) {
  if (lines.length < 2) return false;
  return [...String(lines[lines.length - 1])].length <= ORPHAN_MAX_CHARS;
}

/**
 * 泣き別れを解く。前の行の末尾を最終行へ送って、最終行を3文字以上にする。
 * 送れない(前の行が短すぎる)場合は元のまま返す。
 * @param {string[]} lines
 * @param {(s:string)=>number} measure
 * @param {number} maxWidth
 * @returns {string[]}
 */
function fixOrphan(lines, measure, maxWidth) {
  if (!hasOrphanLine(lines)) return lines;
  const out = [...lines];
  const i = out.length - 1;
  let prev = [...out[i - 1]];
  let last = [...out[i]];
  // 最終行が ORPHAN_MAX_CHARS + 1 文字になるまで送る。前の行は必ず2文字以上残す
  let guard = 0;
  while (last.length <= ORPHAN_MAX_CHARS && prev.length > 2 && guard++ < 8) {
    last.unshift(prev.pop());
    // 送った先頭が行頭禁則の文字ならもう1文字送る
    while (NO_LINE_START_CHARS.includes(last[0]) && prev.length > 2 && guard++ < 8) {
      last.unshift(prev.pop());
    }
  }
  const nextPrev = prev.join('').trimEnd();
  const nextLast = last.join('');
  // 送った結果どちらかが溢れるなら諦めて元のまま(幅を破るくらいなら泣き別れを許す)
  if (!nextPrev || measure(nextPrev) > maxWidth || measure(nextLast) > maxWidth) return lines;
  out[i - 1] = nextPrev;
  out[i] = nextLast;
  return out;
}

/** 末尾を削って「…」を付ける */
function ellipsize(measure, text, maxWidth) {
  let s = String(text);
  if (measure(s) <= maxWidth) return s;
  while (s.length > 1 && measure(`${s}…`) > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}

/**
 * 文字列を指定幅に収める。
 *   1. そのまま入るならそのまま
 *   2. 入らなければ読点・スペース・中黒(無ければ文字単位)で maxLines 行に折る
 *      → 折った直後に禁則処理(fixOrphan)。最終行が1〜2文字だけになる
 *        「泣き別れ」を、折る位置を手前へ送って解消する(F2)
 *   3. それでも入らなければフォントを段階的に縮める(minFontSize まで)
 *   4. 最小サイズでも溢れたら末尾を「…」で省略する
 *
 * 呼び出し後、ctx.font は決定したサイズのままにしてあるのでそのまま描画してよい。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.maxWidth] 収めたい幅[px]
 * @param {number} [opts.fontSize] 希望サイズ[px]
 * @param {number} [opts.minFontSize] 縮小の下限[px]
 * @param {number} [opts.maxLines] 最大行数
 * @param {(size:number)=>string} [opts.fontOf] サイズからCSSフォント文字列を作る
 * @param {number} [opts.step] 縮小の刻み[px]
 * @returns {{lines:string[], fontSize:number, truncated:boolean}}
 */
export function wrapText(ctx, text, {
  maxWidth = 384,
  fontSize = TEXT_MAIN_FONT_PX,
  minFontSize = TEXT_MIN_FONT_PX,
  maxLines = 2,
  fontOf = (size) => `900 ${size}px ${FONT_HEAVY}`,
  step = 2,
} = {}) {
  const src = String(text ?? '');
  if (!src) return { lines: [], fontSize, truncated: false };
  // 計測できない環境(テスト用のスタブ等)では素通し
  if (typeof ctx?.measureText !== 'function') {
    return { lines: [src], fontSize, truncated: false };
  }

  const sizes = [];
  for (let s = fontSize; s > minFontSize; s -= step) sizes.push(s);
  sizes.push(minFontSize);

  let lastLines = [src];
  for (const size of sizes) {
    ctx.font = fontOf(size);
    const measure = (s) => ctx.measureText(s).width;
    if (measure(src) <= maxWidth) return { lines: [src], fontSize: size, truncated: false };
    // 折った直後に禁則処理をかける(行数は増えないので判定順は変わらない)
    lastLines = fixOrphan(packLines(measure, src, maxWidth), measure, maxWidth);
    if (lastLines.length <= maxLines) return { lines: lastLines, fontSize: size, truncated: false };
  }

  // 最小サイズでも入らない。入る行数だけ残して末尾を省略する
  const size = sizes[sizes.length - 1];
  ctx.font = fontOf(size);
  const measure = (s) => ctx.measureText(s).width;
  const kept = lastLines.slice(0, maxLines);
  const rest = lastLines.slice(maxLines).join('');
  kept[kept.length - 1] = ellipsize(measure, kept[kept.length - 1] + rest, maxWidth);
  return { lines: kept, fontSize: size, truncated: true };
}

/* ── トーン(色の意味付け) ────────────────────────────────
 * 「熱い予告は赤文字」の見せ方。どの文言を hot にするかはシナリオ側の判断で、
 * ここは表示の仕組みだけを持つ。cue に params.tone:'hot' を書くと切り替わる。 */

/**
 * テキスト帯のトーン定義。extra 側の固定キャプションからも使えるよう export する。
 * sizeStep はメイン行の加算px(「+1段階」= 1段階ぶん大きく見せる)。
 */
export const TEXT_TONES = {
  normal: {
    color: null, // null = cue の color をそのまま使う(従来どおり)
    subColor: 'rgba(255,255,255,0.9)',
    /**
     * 下敷きの濃さ(2026-08-14 検証指摘 V2 で 0.46 → 0.64)。
     * キャラのサメ画像は液晶の中央(FREE_TIER は y196)に立つので、
     * テキスト帯(中心 y194)とほぼ同じ高さで重なる。46% では絵が透けて
     * 文字が読めなかったため、下敷きを濃くして輪郭も一段はっきりさせた。
     * (キャラ側も帯が出ている間だけ沈める。render/lcd.js の chars.draw({dim}))
     */
    plate: 'rgba(0,0,0,0.64)',
    plateEdge: 'rgba(255,255,255,0.14)',
    stroke: 'rgba(0,0,0,0.8)',
    sizeStep: 0,
    subSizeStep: 0,
    pulse: 0,
  },
  hot: {
    color: '#ff4444',
    subColor: '#ffd2d2',
    plate: 'rgba(46,0,0,0.62)',
    plateEdge: 'rgba(255,80,80,0.75)',
    stroke: 'rgba(40,0,0,0.85)',
    sizeStep: 6,
    subSizeStep: 2,
    pulse: 0.035,
  },
};

/** トーン名から定義を引く(未知の名前は normal 扱い) */
export function toneOf(name) {
  return TEXT_TONES[name] ?? TEXT_TONES.normal;
}

/** 角丸矩形(テキストの下敷き用) */
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 実行中アニメの管理 */
export class LcdAnims {
  constructor() {
    /** @type {{id:string, def:object, params:object, left:number, ms:number}[]} */
    this.active = [];
    /**
     * 表示中のテキスト。render/lcd.js が「出ているか」だけを見るので null 埋めは維持する。
     * @type {ReturnType<typeof createTextEntry>|null}
     */
    this.text = null;
    /** 順番待ちのテキスト(後勝ちで即消しせず順送りする) */
    this.textQueue = [];
    /** 全面占有演出(クイズ等)の裏に回っている間は帯の繰り上げを止める */
    this._deferred = false;
    this.maxConcurrent = 6;
    this._unregister = registerTextHost(this);
  }

  /** 受け口の登録を外す(テストや作り直しのとき用) */
  dispose() {
    this._unregister?.();
    this._unregister = null;
  }

  play(animId, params = {}) {
    const def = LCD_ANIMS[animId];
    if (!def) {
      console.warn(`[lcdanims] 未定義のアニメ: ${animId}`);
      return;
    }
    // 同じアニメは重ねずに差し替える
    this.active = this.active.filter((a) => a.id !== animId);
    /*
     * 大文字スラムは画面に1枚まで(2026-08-14 検証 V31-03)。
     * RUSH 1G目に上乗せが来ると「スケールアウト!!」と直前の告知が
     * 同じ場所へ2枚重なって、どちらも読めなくなっていた。
     * 先に出ていた方を早送りで畳んで、必ず1枚だけが残るようにする。
     */
    if (ANIM_HEADLINES[animId]) {
      for (const a of this.active) {
        if (ANIM_HEADLINES[a.id]) a.left = Math.min(a.left, 180);
      }
      // V31-04: 言い切った文言を覚えて、同じことをテロップに書かせない
      // (寿命は次のレバーONまで。notifyStageEvent が捨てる)
      noteSpokenHeadline(ANIM_HEADLINES[animId](params));
    }
    if (this.active.length >= this.maxConcurrent) this.active.shift();
    const ms = params.ms ?? def.ms;
    this.active.push({ id: animId, def, params, left: ms, ms });
  }

  /**
   * テキスト帯へ1件流し込む(lcd.text)。
   *
   * ms は「最低これだけは出す」の下限として扱う。文字数から求めた最低表示時間を
   * 下回ることはなく、表示中に別のテキストが来ても上書きせず順番待ちにする。
   *
   * @param {object} p
   * @param {string} p.text メイン行
   * @param {string} [p.sub] サブ行
   * @param {number} [p.ms] シナリオが希望する表示時間(下限として使う)
   * @param {string} [p.color]
   * @param {boolean} [p.sticky] true で次のレバーONまで表示。未指定なら内容から自動判定
   * @returns {object|null} 積まれたテキスト状態(重複で捨てた場合は null)
   */
  showText(params = {}) {
    if (!params?.text) return null;
    const entry = createTextEntry(params);

    // モード画面が常設で同じことを言っているなら、帯には出さない(常設が正)
    if (coveredByAmbient(entry)) return null;

    // 同じことを言っているテキストが表示中/待機中にあれば、液晶には1つしか出さない。
    // 前兆の結果告知・突入演出・入賞ファンファーレが似た文言を別々に投げてくるため。
    const dup = this._findDuplicate(entry);
    if (dup) {
      const sameWording = dup.normalized === entry.normalized;
      const upgrade = infoScore(entry) > infoScore(dup);
      // 情報量が上(「ボーナス確定」→「ゴーストボーナス確定!」)なら差し替える。
      // 同じ文言の再送、または相手が消えかけなら出し直す。それ以外は捨てる。
      if (sameWording || upgrade || dup.phase === 'fade') {
        this._replaceText(dup, entry);
        return entry;
      }
      return null;
    }

    if (!this.text) {
      this.text = entry;
      return entry;
    }
    /*
     * ── sticky は「上限寿命」であって「占有権」ではない(2026-08-15 U57)──────
     *
     * sticky の holdMs は Infinity なので、後から来たテキストは
     * **次のレバーONまで一度も表示されない**(順番待ちのまま置き去りになる)。
     * U55/U57 で「ステージ突入の告知」「予兆の結論」を軒並み sticky にしたところ、
     *   レバーON: 「Invent会場に到着」(sticky)
     *   第3停止 : 予兆の結論(sticky)  ← 順番待ちのまま出ない
     * という取りこぼしが構造的に起こるようになった。
     *
     * sticky の意味は「**誰も次を言わなければ**次のレバーONまで残る」なので、
     * 新しい告知が来たら最低表示時間(minHoldMs)を満たし次第ゆずる。
     * _requestFade は最低表示時間を削らないので、
     * 直前に出たばかりの告知が読まれずに飛ぶことはない。
     *
     * ── 結論告知には早く譲る(2026-08-15 検証指摘 F3)────────────────────
     * 高速目押し(250ms間隔)だと、第3停止で積んだ結論が前の表示の
     * 最低表示時間(最大2.8秒)を待つあいだにレバーONが来て、
     * **そのゲームの結論が次のゲームへずれ込んで**いた。
     * 新しく来たのが結論(sticky = 見逃せない告知)なら、前の表示は
     * TEXT_HANDOFF_MS まで見せたら畳んで順番を空ける。
     * 前の表示も出現アニメ+一拍ぶんは必ず見えるので、読み飛ばしにはならない。
     */
    if (entry.sticky) this._requestFadeSoon(this.text, Math.max(0, TEXT_HANDOFF_MS - this.text.elapsed));
    else if (this.text.sticky) this._requestFade(this.text);
    this._enqueueText(entry);
    return entry;
  }

  /**
   * 液晶に出ている(これから必ず出る)文言の一覧。
   * 表示中のもの + 待機中の sticky 告知を返す。
   * 筐体下部のテロップなど、別の場所に同じ文言を出さないための判定に使う。
   * @returns {string[]}
   */
  getVisibleTexts() {
    const out = [];
    if (this.text) out.push(this.text.text);
    for (const e of this.textQueue) if (e.sticky) out.push(e.text);
    out.push(...this._animHeadlines());
    return [...new Set(out)];
  }

  /**
   * 再生中のアニメが自前で描いている大文字(ANIM_HEADLINES)。
   * lcd.text を経由しない告知も二重表示の判定に乗せるために使う。
   * @returns {string[]}
   */
  _animHeadlines() {
    const out = [];
    for (const a of this.active) {
      const head = ANIM_HEADLINES[a.id]?.(a.params);
      if (head) out.push(head);
    }
    return out;
  }

  /**
   * 出ている文言をメイン行 + サブ行の組で返す(U17 の二重表示判定用)。
   * getVisibleTexts() と同じ範囲(表示中 + 待機中の sticky 告知)を見る。
   * @returns {{text:string, sub:string}[]}
   */
  getVisibleTextLines() {
    const out = [];
    if (this.text) out.push({ text: this.text.text, sub: this.text.sub ?? '' });
    for (const e of this.textQueue) if (e.sticky) out.push({ text: e.text, sub: e.sub ?? '' });
    // アニメが canvas に直接描いている大文字も「出ている文言」として数える(U8)
    for (const head of this._animHeadlines()) out.push({ text: head, sub: '' });
    return out;
  }

  /**
   * ゲーム進行イベントの受け取り。director から notifyStageEvent() 経由で届く。
   * @param {string} eventName
   */
  onStageEvent(eventName) {
    // 重要告知(sticky)は「次のレバーONまで」が寿命。
    // 解除しても最低表示時間は守られるので、直前に出たばかりの告知が飛ぶことはない。
    if (eventName === 'leverOn') this.releaseSticky();
  }

  /**
   * 「いま液晶に常設で出している文言」を申告する。描画側から毎フレーム呼んでよい。
   * ここに申告された文言と同じことを言うテキストは、帯には出さない(常設が正)。
   * @param {string} text
   * @param {object} [opts] registerAmbientText と同じ
   */
  registerAmbient(text, opts) {
    registerAmbientText(text, opts);
  }

  /**
   * 「この文言を大きく言い切った」を申告する(2026-08-15 U60)。
   *
   * ANIM_HEADLINES(液晶アニメが canvas に直接描く大文字)と同じ扱いで、
   * **lcd.text を通らない告知** をテロップ側の二重表示判定に乗せるための口。
   * いまの使い手は render/overlay.js の showLine(フリーズの「神の声」と結末)。
   * 寿命は次のレバーONまで(notifyStageEvent が clearSpokenHeadlines する)。
   * @param {string} text
   */
  noteHeadline(text) {
    noteSpokenHeadline(text);
  }

  /**
   * そのアニメがいま再生中か(2026-08-15 U64-8)。
   *
   * 盤面(render/lcd.js)が「液晶のどこが埋まっているか」を知るための読み出し口。
   * いまの使い手はボーナス盤面で、AWS豆知識カードが出ている間だけ
   * 大ロゴを縮めてヘッダへ寄せる(カードとロゴの重なりを避ける)。
   * **表示の場所取りにだけ使うこと**(当落の情報は一切含まない)。
   * @param {string} animId
   * @returns {boolean}
   */
  isPlaying(animId) {
    return this.active.some((a) => a.id === animId && a.params?.dismiss !== true);
  }

  /**
   * ステージ背景の切替を保留すべきか(U42)。
   * STAGE_HOLD_ANIMS に登録されたアニメが「結果を出す前」の状態で走っている間だけ true。
   * @returns {boolean}
   */
  holdsStage() {
    return this.active.some((a) => STAGE_HOLD_ANIMS[a.id]?.(a.params) === true);
  }

  /**
   * いま出ているポップアップがこの文言と同じことを言っているか(U8)。
   * テロップ側が「自分を出すかどうか」を決めるために呼ぶ。
   * 判定の中身は module 関数 stageTextCovers を参照。
   * @param {string} text
   * @returns {boolean}
   */
  covers(text) {
    return stageTextCovers(text);
  }

  /**
   * 実行中のアニメを畳みにかかる(上位の演出に割り込まれたときの早送り終了)。
   * 残り時間を上限で切るだけなので、終わりかけのものは伸びない。
   * @param {number} [maxLeftMs]
   */
  windDown(maxLeftMs = 220) {
    for (const a of this.active) a.left = Math.min(a.left, maxLeftMs);
  }

  /**
   * 全面占有演出(クイズ等)の裏に回す/戻す。
   *
   * on にすると、表示中のテキストは寿命を消費させずに順番待ちの先頭へ戻し、
   * 待機列からの繰り上げも止める。全面演出が終わったら off で再開する。
   * 全面演出「自身」が出すテキストは帯が空いていればそのまま出る
   * (盤面は y168〜236 を告知プレート用に空けてある)。
   * @param {boolean} on
   */
  setDeferred(on) {
    const next = Boolean(on);
    if (next === this._deferred) return;
    this._deferred = next;
    if (!next) {
      this._popText();
      return;
    }
    // 全面演出はゲームをまたいで数秒〜数十秒続く。その裏で待たせた通常テキストは
    // 明ける頃には状況が変わっていて的外れなので捨てる。
    // 見逃せない結果告知(sticky)だけを待避して、明けてから見せる。
    const t = this.text;
    this.text = null;
    this.textQueue = this.textQueue.filter((e) => e.sticky);
    if (!t?.sticky) return;
    // まだ読まれていない扱いに戻す(寿命は作り直す)
    t.elapsed = 0;
    t.phase = 'hold';
    t.fadeElapsed = 0;
    this.textQueue.unshift(t);
    while (this.textQueue.length > TEXT_QUEUE_MAX) this.textQueue.pop();
  }

  /**
   * レバーONでの仕切り直し(2026-08-15 検証指摘 F1)。
   *
   * 次の回転が始まった時点で、前のゲームの告知は用済み。
   * **最低表示時間を待たずに**余韻(LEVER_RELEASE_GRACE_MS)だけ残して畳む。
   * 以前は _requestFade(最低表示時間を守る)だったため、
   * 出たばかりの到着告知が次のゲームへ 2.4〜5秒はみ出していた。
   *
   * 待機中の sticky も捨てる。**前のゲームの話を次の画面で始めない**ため
   * (そのゲームの結論は showText 側の TEXT_HANDOFF_MS で必ず当該ゲーム内に出るので、
   *  ここまで残っているものは新しい告知に押し出された古い話になる)。
   */
  releaseSticky() {
    if (this.text?.sticky) this._requestFadeSoon(this.text, LEVER_RELEASE_GRACE_MS);
    this.textQueue = this.textQueue.filter((e) => !e.sticky);
  }

  update(dt) {
    for (const a of this.active) a.left -= dt;
    this.active = this.active.filter((a) => a.left > 0);
    this._updateText(dt);
  }

  /**
   * 液晶の掃除。モード遷移(modeEnter)から呼ばれる。
   * アニメは全部落とすが、テキストは「読み終わる権利」を尊重して
   * **最低表示時間まで縮めてフェードアウト**させる(瞬時には消さない)。
   *
   * ── sticky も畳むようにした(2026-08-14 検証 V31-03)────────────
   * 以前は sticky(突入告知など)だけ「次のレバーONまで」残していたため、
   * 「AUTO SCALING RUSH 突入!!」が SPOT ZONE 昇格後の画面にまで居座り、
   * 新しい盤面の「0 G / +0 枚」「純増16枚/G」に重なって両方読めなくなっていた。
   * **モードが変わった時点で、その告知が指していた画面はもう無い**ので、
   * 余韻(MODE_CHANGE_GRACE_MS)だけ残して畳む。
   * 待機中の sticky も同じ理由で捨てる(前の画面の話をこれから始めても遅い)。
   * 新しいモードの告知は director がこの後に積むので、消し合いにはならない
   * (main.js は modeEnter の後片付けを director.attach() より先に登録している)。
   *
   * @param {object} [opt]
   * @param {boolean} [opt.dropSticky] false にすると従来どおり sticky を残す
   */
  clear({ dropSticky = true } = {}) {
    this.active = [];
    this.textQueue = dropSticky ? [] : this.textQueue.filter((e) => e.sticky);
    if (!this.text) return;
    if (this.text.sticky && dropSticky) this._requestFadeSoon(this.text);
    else if (!this.text.sticky) this._requestFade(this.text);
  }

  /** テキストごと全部消す(デバッグ・リセット用) */
  clearAll() {
    this.active = [];
    this.text = null;
    this.textQueue = [];
  }

  // ── テキスト帯の内部処理 ─────────────────────

  /**
   * 表示中/待機中から「同じことを言っている」テキストを探す。
   * 正規化して一致するか、同じカテゴリなら重複とみなす。
   */
  _findDuplicate(entry) {
    const isDup = (e) => e.normalized === entry.normalized
      || (e.category != null && e.category === entry.category);
    if (this.text && isDup(this.text)) return this.text;
    return this.textQueue.find(isDup) ?? null;
  }

  /**
   * 古い告知を下げて新しい告知に差し替える。
   * テキスト帯は1件しか映せないので、2個並べずにその場で入れ替える
   * (新しい方は出現アニメから始まるので、格上げされたことが分かる)。
   */
  _replaceText(oldEntry, entry) {
    // 「次のレバーONまで残す」性質は引き継ぐ。格上げで寿命が縮むと本末転倒なので
    if (oldEntry.sticky && !entry.sticky) {
      entry.sticky = true;
      entry.holdMs = Infinity;
    }
    if (oldEntry === this.text) {
      this.text = entry;
      return;
    }
    const i = this.textQueue.indexOf(oldEntry);
    if (i >= 0) this.textQueue[i] = entry;
    else this._enqueueText(entry);
  }

  /** 順番待ちへ積む。溜まりすぎたら古い弱テキストから捨てる */
  _enqueueText(entry) {
    this.textQueue.push(entry);
    while (this.textQueue.length > TEXT_QUEUE_MAX) {
      // 弱テキスト(sticky でないもの)を古い順に捨てる。全部 sticky なら最古を捨てる
      const weak = this.textQueue.findIndex((e) => !e.sticky);
      this.textQueue.splice(weak >= 0 ? weak : 0, 1);
    }
  }

  /**
   * 「もう消していい」と伝える。ただし最低表示時間は削らない。
   * まだ読めていないタイミングなら、その時間が経ってからフェードアウトする。
   */
  _requestFade(entry) {
    if (!entry || entry.phase === 'fade') return;
    entry.holdMs = Math.min(entry.holdMs, entry.minHoldMs);
    if (entry.elapsed >= entry.holdMs) {
      entry.phase = 'fade';
      entry.fadeElapsed = 0;
    }
  }

  /**
   * 「あと graceMs だけ出したら畳む」。最低表示時間より短くしてよい場合に使う。
   *
   * モードが変わったとき用(2026-08-14 検証 V31-03)。
   * _requestFade は最低表示時間(長文だと 2.8秒)を必ず守るので、
   * 突入告知が出た直後にモードが変わると、新しい盤面の上に最大2.8秒も
   * 前のモードの告知が居座ってしまう。**もう別の画面なので読ませる意味がない**。
   * 消える途中だと分かる程度の余韻(graceMs)だけ残して畳む。
   */
  _requestFadeSoon(entry, graceMs = MODE_CHANGE_GRACE_MS) {
    if (!entry || entry.phase === 'fade') return;
    entry.holdMs = Math.min(entry.holdMs, entry.elapsed + Math.max(0, graceMs));
    if (entry.elapsed >= entry.holdMs) {
      entry.phase = 'fade';
      entry.fadeElapsed = 0;
    }
  }

  _updateText(dt) {
    const t = this.text;
    if (!t) {
      this._popText();
      return;
    }
    t.elapsed += dt;

    // 常設文言の申告は描画のたびに届くので、テキストが先に出てしまう1〜2フレームの
    // 取りこぼしがある。出た直後に常設と被っていると分かった場合は取り下げる
    // (同じ内容が常設側に出ているので、読めなくなるわけではない)。
    // ずっと出ていたテキストが後から被った場合は最低表示時間を守って畳む。
    if (t.phase === 'hold' && coveredByAmbient(t)) {
      if (t.elapsed <= AMBIENT_RACE_MS) {
        this.text = null;
        this._popText();
        return;
      }
      this._requestFade(t);
    }

    if (t.phase === 'hold' && t.elapsed >= t.holdMs) {
      t.phase = 'fade';
      // 保持を超えた分はフェードへ繰り越す(dt が粗くても寿命が伸び縮みしない)
      t.fadeElapsed = Math.min(dt, t.elapsed - t.holdMs);
    }

    if (t.phase === 'fade') {
      t.fadeElapsed += dt;
      if (t.fadeElapsed >= TEXT_FADE_MS) {
        this.text = null;
        this._popText();
      }
    }
  }

  /** 次のテキストへ進む(全面演出の裏に回っている間は繰り上げない) */
  _popText() {
    if (this._deferred || this.text || this.textQueue.length === 0) return;
    this.text = this.textQueue.shift();
  }

  /** 現在の表示濃度(0→1)。出現とフェードアウトの両方を含む */
  _textAlpha(t) {
    const appear = clamp01(t.elapsed / TEXT_APPEAR_MS);
    const fade = t.phase === 'fade' ? 1 - clamp01(t.fadeElapsed / TEXT_FADE_MS) : 1;
    return clamp01(appear * fade);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {'bg'|'fg'|'ui'} layer
   */
  draw(ctx, layer, w, h) {
    // U39: このブロックの間だけ、極小フォントの指定を下限で丸める
    const releaseFont = installMinFontSize(ctx, LCD_ANIM_MIN_FONT_PX);
    /*
     * 座布団(textPlate)の重なり避けは「同じ描画パスで敷いた矩形」を見るので、
     * パスの頭で記録を捨てる(2026-08-15 検証指摘 F19)。
     * 層(bg/fg/ui)ごとに呼ばれるが、重なって困るのは同じ層の中なので
     * これで足りる。
     */
    beginPlateFrame();
    try {
      for (const a of this.active) {
        if ((a.def.layer ?? 'fg') !== layer) continue;
        const p = 1 - a.left / a.ms;
        ctx.save();
        try {
          a.def.draw(ctx, Math.max(0, Math.min(1, p)), a.params, w, h);
        } catch (e) {
          console.error(`[lcdanims] 描画エラー: ${a.id}`, e);
        }
        ctx.restore();
      }

      if (layer === 'ui' && this.text) this._drawText(ctx, w, h);
    } finally {
      releaseFont();
    }
  }

  /**
   * 折り返し済みのレイアウトを作る(液晶幅が変わらない限り使い回す)。
   * 毎フレーム測り直すと無駄なので entry にキャッシュする。
   */
  _layoutOf(ctx, t, w) {
    if (t._layout && t._layout.w === w) return t._layout;
    const tone = toneOf(t.tone);
    const maxWidth = w - TEXT_SIDE_PAD * 2;
    const mainSize = TEXT_MAIN_FONT_PX + tone.sizeStep;
    const subSize = TEXT_SUB_FONT_PX + tone.subSizeStep;

    const main = wrapText(ctx, t.text, {
      maxWidth,
      fontSize: mainSize,
      fontOf: (size) => `900 ${size}px ${FONT_HEAVY}`,
    });
    const sub = t.sub
      ? wrapText(ctx, t.sub, {
        maxWidth,
        fontSize: subSize,
        fontOf: (size) => `700 ${size}px ${FONT}`,
      })
      : { lines: [], fontSize: subSize, truncated: false };

    const mainLineH = main.fontSize * 1.14;
    const subLineH = sub.fontSize * 1.4;
    const gap = sub.lines.length > 0 ? 8 : 0;
    const height = main.lines.length * mainLineH + gap + sub.lines.length * subLineH;

    // 下敷きは一番長い行に合わせる
    let widest = 0;
    ctx.font = `900 ${main.fontSize}px ${FONT_HEAVY}`;
    for (const line of main.lines) widest = Math.max(widest, ctx.measureText?.(line)?.width ?? 0);
    ctx.font = `700 ${sub.fontSize}px ${FONT}`;
    for (const line of sub.lines) widest = Math.max(widest, ctx.measureText?.(line)?.width ?? 0);

    t._layout = {
      w, main, sub, mainLineH, subLineH, gap, height,
      plateW: Math.min(w - 10, widest + 44),
    };
    return t._layout;
  }

  _drawText(ctx, w, h) {
    const t = this.text;
    const alpha = this._textAlpha(t);
    if (alpha <= 0) return;
    const appear = clamp01(t.elapsed / TEXT_APPEAR_MS);
    const tone = toneOf(t.tone);
    const L = this._layoutOf(ctx, t, w);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(w / 2, h / 2 + 44);
    // 出現のポップに加えて、hot は静かに脈打たせる
    const pulse = tone.pulse > 0 ? 1 + Math.sin(t.elapsed / 130) * tone.pulse : 1;
    const s = easeOutBack(appear) * pulse;
    ctx.scale(s, s);

    // 下敷き。ステージ画像や折れ線の上でも文字が沈まないようにする
    const plateH = L.height + 24;
    const plateTop = -L.height / 2 - 12;
    ctx.fillStyle = tone.plate;
    roundRectPath(ctx, -L.plateW / 2, plateTop, L.plateW, plateH, 12);
    ctx.fill();
    if (tone.plateEdge) {
      ctx.strokeStyle = tone.plateEdge;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 行を上から順に置く(ブロック全体が帯の中心に来るように)
    let y = -L.height / 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = tone.stroke;
    ctx.font = `900 ${L.main.fontSize}px ${FONT_HEAVY}`;
    ctx.lineWidth = Math.max(4, L.main.fontSize * 0.25);
    for (const line of L.main.lines) {
      const cy = y + L.mainLineH / 2;
      ctx.strokeText(line, 0, cy);
      ctx.fillStyle = t.color;
      ctx.fillText(line, 0, cy);
      y += L.mainLineH;
    }
    if (L.sub.lines.length > 0) {
      y += L.gap;
      ctx.font = `700 ${L.sub.fontSize}px ${FONT}`;
      ctx.lineWidth = Math.max(3, L.sub.fontSize * 0.25);
      for (const line of L.sub.lines) {
        const cy = y + L.subLineH / 2;
        ctx.strokeText(line, 0, cy);
        ctx.fillStyle = tone.subColor;
        ctx.fillText(line, 0, cy);
        y += L.subLineH;
      }
    }
    ctx.restore();
  }
}
