/**
 * キャラクターレイヤー(LCD内の char サブレイヤー)。DESIGN.md 5.4 / 6.8
 *
 * 演出システムの char.show / char.hide / char.motion から叩かれ、
 * ポーズと位置をパラメータとして保持する。描画は LcdView から呼ばれる。
 *
 * DESIGN.md 注意事項8 のとおり、パス描画は液晶Canvas(440×300)内に限定する。
 */

import { drawKiro, KIRO_POSES } from './kiro.js';
import { drawGeorge, GEORGE_POSES } from './george.js';

/**
 * キャラの定位置(LCD 440×300 内の論理座標)。
 *
 * 液晶が狭いので、モードごとに「そのモードのUIと重ならない位置」を持たせる。
 * (RUSHのDCアイコン列・CZのグラフ・ボーナスのロゴを避ける)
 */
const MODE_HOMES = {
  FREE_TIER:   { kiro: { x: 356, y: 196, scale: 0.72 }, george: { x: 80, y: 240, scale: 0.50 } },
  // CZ: グラフが 40〜400 / y58〜208 を占めるので、キャラは下端に小さく
  CZ:          { kiro: { x: 396, y: 246, scale: 0.42 }, george: { x: 46, y: 250, scale: 0.36 } },
  // ボーナスの主役は bonusId で変わる(ゴースト系=幽霊 / シャーク=サメ)。
  // ただし applyMode は main.js から modeEnter の id しか渡されないため、
  // ここで bonusId 別の定位置を持たせても選べない。
  // 「どちらを出すか」は data/scenarios/bonus.js の char.show / char.hide が決めており、
  // 出ている1体がここの定位置に収まる。左右どちらでも液晶UIと重ならない値にしてある。
  BONUS:       { kiro: { x: 384, y: 214, scale: 0.58 }, george: { x: 62, y: 236, scale: 0.48 } },
  // 入賞待ち: 中央に「ゴースト7 / サメBAR を揃えろ!」の指示が出るので左右の下端へ。
  // 未定義だと FREE_TIER の定位置(幽霊 y196 / scale 0.72)に落ちて指示テロップへ被っていた
  BONUS_READY: { kiro: { x: 386, y: 220, scale: 0.54 }, george: { x: 60, y: 238, scale: 0.46 } },
  // AS_RUSH: DCアイコン列(y74〜108)・中央の数値・右寄せのSET表示を避けて中央下と左下へ
  AS_RUSH:     { kiro: { x: 238, y: 234, scale: 0.46 }, george: { x: 58, y: 240, scale: 0.42 } },
  HOT_STANDBY: { kiro: { x: 392, y: 242, scale: 0.44 }, george: { x: 50, y: 246, scale: 0.38 } },

  // ── Phase 5 ──
  // Route 53: 中央の大きなTTL表示を避けて左右の下端へ
  ROUTE53_FAILOVER: { kiro: { x: 394, y: 240, scale: 0.42 }, george: { x: 48, y: 244, scale: 0.36 } },
  // Spot: 主役はジョージ(中断通知を運ぶ)。少し大きめに右下へ
  SPOT_ZONE:        { kiro: { x: 402, y: 250, scale: 0.34 }, george: { x: 86, y: 232, scale: 0.60 } },
  // EC2 バースト: 中央にクレジットゲージがあるので両端へ
  EC2_BURST:        { kiro: { x: 396, y: 232, scale: 0.42 }, george: { x: 46, y: 244, scale: 0.36 } },
  GRAVITON:         { kiro: { x: 388, y: 226, scale: 0.48 }, george: { x: 52, y: 248, scale: 0.34 } },
  // Reserved: 契約書が中央上を占める
  RESERVED:         { kiro: { x: 76, y: 232, scale: 0.44 }, george: { x: 372, y: 240, scale: 0.42 } },
  CLOUDFRONT:       { kiro: { x: 400, y: 248, scale: 0.36 }, george: { x: 44, y: 250, scale: 0.32 } },
  KINESIS:          { kiro: { x: 402, y: 250, scale: 0.34 }, george: { x: 44, y: 250, scale: 0.32 } },
  // Step Functions: 選択肢ボックス(y116〜176)を避けて最下段へ小さく
  STEP_FUNCTIONS:   { kiro: { x: 404, y: 254, scale: 0.32 }, george: { x: 42, y: 254, scale: 0.30 } },
  SERVERLESS_RUSH:  { kiro: { x: 244, y: 236, scale: 0.46 }, george: { x: 58, y: 242, scale: 0.42 } },
  // Multi-Region: 世界地図が全面なので端に小さく
  MULTI_REGION:     { kiro: { x: 406, y: 252, scale: 0.32 }, george: { x: 40, y: 252, scale: 0.30 } },
  // エンディング: 2人が壇上に並ぶ
  REINVENT_ED:      { kiro: { x: 140, y: 244, scale: 0.50 }, george: { x: 320, y: 248, scale: 0.46 } },
};

const DEFAULT_HOME = MODE_HOMES.FREE_TIER;

/** 現在の定位置(applyMode で切り替わる) */
const HOME = {
  kiro: { ...DEFAULT_HOME.kiro },
  george: { ...DEFAULT_HOME.george },
};

/** モーション定義: 一定時間パラメータを上書きする */
const MOTIONS = {
  // Kiro
  bounce:  { ms: 700,  apply: (c, p) => { c.offsetY = -Math.abs(Math.sin(p * Math.PI * 2)) * 26; } },
  shake:   { ms: 600,  apply: (c, p) => { c.offsetX = Math.sin(p * Math.PI * 12) * 9; } },
  zoom:    { ms: 900,  apply: (c, p) => { c.scaleMul = 1 + Math.sin(p * Math.PI) * 0.45; } },
  // George
  bite:    { ms: 800,  apply: (c, p) => {
    c.mouthOpen = p < 0.45 ? p / 0.45 : Math.max(0, 1 - (p - 0.45) / 0.25);
    c.offsetX = p < 0.45 ? -p * 40 : -18 + (p - 0.45) * 90;
  } },
  swimIn:  { ms: 900,  apply: (c, p) => { c.offsetX = -260 * (1 - easeOutCubic(p)); } },
  swimOut: { ms: 800,  apply: (c, p) => { c.offsetX = -320 * easeInCubic(p); c.alphaMul = 1 - p * 0.6; } },
  tailWhip:{ ms: 700,  apply: (c, p) => { c.tailAngle = Math.sin(p * Math.PI * 3) * 0.7; } },
};

const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeInCubic = (x) => x * x * x;
const easeInOutSine = (x) => 0.5 - Math.cos(Math.PI * x) / 2;

/** 液晶の論理サイズ(engine/layers.js の lcd レイヤーと一致させること) */
const LCD_W = 440;

/**
 * アイドル時のうろうろ(Kiroだけ)。
 *
 * 定位置に浮いているだけだと置物に見えるので、待機中は液晶の中を
 * ゆっくり左右に漂わせる。演出(モーション/ポーズ指定)が入っている間は
 * そちらを優先し、アイドルへ戻ったら再開する。
 */
const WANDER = {
  /** 定位置からの最大移動量(px) */
  range: 80,
  /** 液晶の端に体がめり込まないための余白(px) */
  margin: 48,
  /** 片道にかける時間(ms)。距離に応じてこの範囲で決まる */
  minMs: 2400,
  maxMs: 4200,
  /** 折り返し前の「ふわっと止まる」時間(ms) */
  holdMinMs: 260,
  holdMaxMs: 900,
  /** 上下のゆらぎ(px) */
  bobY: 5,
  /** 進行方向への最大の傾き(rad) */
  tilt: 0.17,
  /** 傾きが最大になる速さ(px/ms) */
  tiltSpeed: 0.075,
};

class CharState {
  constructor(id) {
    this.id = id;
    this.visible = false;
    this.pose = 'normal';
    this.x = HOME[id]?.x ?? 220;
    this.y = HOME[id]?.y ?? 150;
    this.scale = HOME[id]?.scale ?? 1;
    this.alpha = 0;
    this.targetAlpha = 0;
    this.dir = id === 'george' ? 1 : 1;
    // モーションによる一時的な上書き
    this.motion = null;
    this.motionLeft = 0;
    // アイドル時のうろうろ(定位置からのオフセット)
    this.wanderX = 0;
    this.wanderY = 0;
    this.wanderTilt = 0;
    this.wanderFrom = 0;
    this.wanderTo = 0;
    this.wanderTime = 0;
    this.wanderDur = 0;
    this.wanderHold = 0;
    this.wanderPhase = Math.random() * Math.PI * 2;
    this.reset();
  }

  reset() {
    this.offsetX = 0;
    this.offsetY = 0;
    this.scaleMul = 1;
    this.alphaMul = 1;
    this.mouthOpen = null;
    this.tailAngle = null;
  }
}

export class CharacterLayer {
  constructor() {
    this.chars = {
      kiro: new CharState('kiro'),
      george: new CharState('george'),
    };
    this.t = 0;
  }

  /**
   * @param {string} id 'kiro' | 'george'
   * @param {string} [pose]
   * @param {object} [opts] { x, y, scale, dir }
   */
  show(id, pose = 'normal', opts = {}) {
    const c = this.chars[id];
    if (!c) return;
    c.visible = true;
    c.pose = pose;
    c.targetAlpha = 1;
    if (opts.x != null) c.x = opts.x;
    if (opts.y != null) c.y = opts.y;
    if (opts.scale != null) c.scale = opts.scale;
    if (opts.dir != null) c.dir = opts.dir;
  }

  hide(id) {
    const c = this.chars[id];
    if (!c) return;
    c.targetAlpha = 0;
  }

  /** ポーズだけ変える */
  pose(id, pose) {
    const c = this.chars[id];
    if (c) c.pose = pose;
  }

  /** モーションを再生する */
  motion(id, motion) {
    const c = this.chars[id];
    const def = MOTIONS[motion];
    if (!c || !def) return;
    c.motion = motion;
    c.motionLeft = def.ms;
  }

  /** 定位置に戻す */
  home(id) {
    const c = this.chars[id];
    if (!c) return;
    c.x = HOME[id].x;
    c.y = HOME[id].y;
    c.scale = HOME[id].scale;
  }

  /**
   * モードに応じた定位置へ全キャラを移す。
   * モード遷移時(modeEnter)に呼ぶことで、液晶UIとキャラが重ならないようにする。
   * @param {string} modeId
   */
  applyMode(modeId) {
    const preset = MODE_HOMES[modeId] ?? DEFAULT_HOME;
    for (const id of Object.keys(HOME)) {
      const p = preset[id];
      if (!p) continue;
      HOME[id].x = p.x;
      HOME[id].y = p.y;
      HOME[id].scale = p.scale;
      this.home(id);
    }
  }

  update(dt) {
    this.t += dt / 1000;
    for (const c of Object.values(this.chars)) {
      // フェード
      const speed = dt / 220;
      if (c.alpha < c.targetAlpha) c.alpha = Math.min(c.targetAlpha, c.alpha + speed);
      else if (c.alpha > c.targetAlpha) c.alpha = Math.max(c.targetAlpha, c.alpha - speed);
      if (c.alpha <= 0 && c.targetAlpha === 0) c.visible = false;

      // モーション
      c.reset();
      if (c.motion) {
        const def = MOTIONS[c.motion];
        c.motionLeft -= dt;
        if (c.motionLeft <= 0) {
          c.motion = null;
        } else {
          const p = 1 - c.motionLeft / def.ms;
          def.apply(c, Math.max(0, Math.min(1, p)));
        }
      }
    }

    // Kiro だけアイドル時にうろうろさせる(サメは従来どおり定位置)
    this._updateWander(this.chars.kiro, dt);
  }

  /**
   * アイドル判定 → 目標地点までゆっくり移動 → 端でふわっと折り返す。
   * 演出中(モーション実行中・ポーズ指定中・退場中)は定位置へ戻す。
   */
  _updateWander(c, dt) {
    if (!c) return;
    const idle = c.visible && c.targetAlpha > 0 && !c.motion && c.pose === 'normal';

    if (!idle) {
      // 演出を邪魔しないよう、ゆっくり定位置へ寄せてから止まる
      const k = Math.min(1, dt / 240);
      c.wanderX += (0 - c.wanderX) * k;
      c.wanderY += (0 - c.wanderY) * k;
      c.wanderTilt += (0 - c.wanderTilt) * k;
      // 復帰したら新しい目標から始める
      c.wanderFrom = c.wanderX;
      c.wanderTime = c.wanderDur;
      c.wanderHold = 0;
      return;
    }

    // ゆらゆら(左右移動とは別の周期にして機械的な往復に見えないようにする)
    this._wanderPhase = (this._wanderPhase ?? 0) + dt / 1000;
    c.wanderY = Math.sin(this._wanderPhase * 0.9 + c.wanderPhase) * WANDER.bobY;

    const prevX = c.wanderX;
    if (c.wanderHold > 0) {
      c.wanderHold -= dt;
    } else if (c.wanderTime < c.wanderDur) {
      c.wanderTime = Math.min(c.wanderDur, c.wanderTime + dt);
      const p = easeInOutSine(c.wanderTime / c.wanderDur);
      c.wanderX = c.wanderFrom + (c.wanderTo - c.wanderFrom) * p;
      if (c.wanderTime >= c.wanderDur) {
        c.wanderHold = WANDER.holdMinMs + Math.random() * (WANDER.holdMaxMs - WANDER.holdMinMs);
      }
    } else {
      this._pickWanderTarget(c);
    }

    // 進行方向へ体を傾ける(速度に比例)
    const v = dt > 0 ? (c.wanderX - prevX) / dt : 0;
    const target = Math.max(-1, Math.min(1, v / WANDER.tiltSpeed)) * WANDER.tilt;
    c.wanderTilt += (target - c.wanderTilt) * Math.min(1, dt / 180);
  }

  /** 次の目標地点(定位置からのオフセット)を決める */
  _pickWanderTarget(c) {
    const homeX = HOME[c.id]?.x ?? 220;
    // 液晶からはみ出さない範囲に丸める
    const min = Math.max(-WANDER.range, WANDER.margin - homeX);
    const max = Math.min(WANDER.range, LCD_W - WANDER.margin - homeX);
    const span = Math.max(0, max - min);
    if (span < 8) {           // 端に寄った定位置では動かさない
      c.wanderFrom = c.wanderTo = c.wanderX = 0;
      c.wanderDur = 1;
      c.wanderTime = 0;
      c.wanderHold = 1200;
      return;
    }
    // いま居る側と反対の半分を狙う = 行ったり来たりに見える
    const mid = (min + max) / 2;
    const to = c.wanderX >= mid
      ? min + Math.random() * span * 0.45
      : max - Math.random() * span * 0.45;
    const dist = Math.abs(to - c.wanderX);
    c.wanderFrom = c.wanderX;
    c.wanderTo = to;
    c.wanderTime = 0;
    c.wanderDur = WANDER.minMs + (dist / span) * (WANDER.maxMs - WANDER.minMs);
  }

  /** LcdView の char サブレイヤーから呼ばれる */
  draw(ctx) {
    const kiro = this.chars.kiro;
    if (kiro.visible && kiro.alpha > 0) {
      const kx = kiro.x + kiro.offsetX + kiro.wanderX;
      const ky = kiro.y + kiro.offsetY + kiro.wanderY;
      // うろうろの傾きはキャラの位置を軸に回す(kiro.js 側はポーズの傾きだけ持つ)
      ctx.save();
      if (kiro.wanderTilt) {
        ctx.translate(kx, ky);
        ctx.rotate(kiro.wanderTilt);
        ctx.translate(-kx, -ky);
      }
      drawKiro(ctx, {
        x: kx,
        y: ky,
        scale: kiro.scale * kiro.scaleMul,
        pose: KIRO_POSES[kiro.pose] ? kiro.pose : 'normal',
        t: this.t,
        alpha: kiro.alpha * kiro.alphaMul,
      });
      ctx.restore();
    }

    const g = this.chars.george;
    if (g.visible && g.alpha > 0) {
      const base = GEORGE_POSES[g.pose] ?? GEORGE_POSES.normal;
      drawGeorge(ctx, {
        x: g.x + g.offsetX,
        y: g.y + g.offsetY,
        scale: g.scale * g.scaleMul,
        dir: g.dir,
        t: this.t,
        alpha: g.alpha * g.alphaMul,
        mouthOpen: g.mouthOpen ?? base.mouthOpen,
        tailAngle: g.tailAngle ?? base.tailAngle,
        brow: base.brow,
      });
    }
  }

  /** モード切替時などに全部隠す */
  hideAll() {
    for (const id of Object.keys(this.chars)) this.hide(id);
  }
}
