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
 *   - 結果告知(sticky)は次のレバーONまで残る
 * 詳細は下の「演出テキスト帯」ブロックを参照。
 */

import { LCD_ANIMS_EXTRA } from './lcdanims-extra.js';

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
    id: 'set_continue',
    label: 'セット継続',
    groups: [['継続', 'CONTINUE']],
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

/** 申告が生きている常設文言の一覧 */
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

/**
 * 生きているテキスト帯へゲーム進行イベントを伝える。
 * 現状 'leverOn' だけが意味を持ち、sticky 告知の解除に使う。
 * @param {string} eventName
 */
export function notifyStageEvent(eventName) {
  for (const host of TEXT_HOSTS) host.onStageEvent(eventName);
}

/**
 * 液晶に出ている文言の一覧(表示中 + 待機中の sticky 告知)。
 * LcdAnims の参照を持っていない側からも引けるようにモジュール関数でも公開する。
 * 筐体下部のテロップなど、別の場所に同じ文言を出さないための判定に使う:
 *   if (getVisibleTexts().some((t) => isDuplicateText(t, telop))) テロップは出さない
 * @returns {string[]}
 */
export function getVisibleTexts() {
  const out = [];
  for (const host of TEXT_HOSTS) out.push(...host.getVisibleTexts());
  return [...new Set(out)];
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

/* ══ テキストの自動レイアウト ═══════════════════════════════
 *
 * 予告の文言は長さがまちまちで、液晶(440px)から溢れるものがある。
 * シナリオ側で改行位置を書かせると文言を直すたびに調整が必要になるので、
 * 描画時に「折り返す → それでも入らなければ縮める → 最後は省略」を自動でやる。
 *
 * lcdanims-extra.js の固定キャプションからも使えるように export してある。
 */

/** これ以上は小さくしない下限[px] */
export const TEXT_MIN_FONT_PX = 12;

/** テキスト帯の左右の余白[px](下敷きプレートの内側) */
export const TEXT_SIDE_PAD = 28;

/** メイン行/サブ行の基準サイズ[px] */
export const TEXT_MAIN_FONT_PX = 28;
export const TEXT_SUB_FONT_PX = 14;

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
    lastLines = packLines(measure, src, maxWidth);
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
    plate: 'rgba(0,0,0,0.46)',
    plateEdge: null,
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
    return [...new Set(out)];
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

  /** sticky テキストの保持を解除する(最低表示時間を満たし次第フェードアウト) */
  releaseSticky() {
    // キュー内の sticky はまだ一度も見せていないので消さない(表示されてから次のレバーONまで生きる)
    if (this.text?.sticky) this._requestFade(this.text);
  }

  update(dt) {
    for (const a of this.active) a.left -= dt;
    this.active = this.active.filter((a) => a.left > 0);
    this._updateText(dt);
  }

  /**
   * 液晶の掃除。モード遷移(modeEnter)から呼ばれる。
   * アニメは全部落とすが、テキストは「読み終わる権利」を尊重する:
   *   - 通常テキスト … 最低表示時間まで縮めてフェードアウト(瞬時には消さない)
   *   - sticky テキスト … 遷移直前の結果告知なので次のレバーONまで残す
   * 完全に消したい場合は clearAll() を使う。
   */
  clear() {
    this.active = [];
    this.textQueue = this.textQueue.filter((e) => e.sticky);
    if (this.text && !this.text.sticky) this._requestFade(this.text);
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
