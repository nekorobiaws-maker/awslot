/**
 * 液晶Canvas描画。DESIGN.md 5.3 / 5.4
 *
 * サブレイヤーの並び(stage → bgObject → char → fgEffect → ui)を関数分割で表現する。
 * プロトタイプでは char / fgEffect は未実装(Phase 3 でキャラ描画と演出が入る)。
 *
 * 表示内容は「モード名 + 残G + 状態の数字 + ひとことテロップ」に絞る。
 */

import { CZ_GRAPH_MAX, CZ_GRAPH_THRESHOLD } from '../game/modes/cz.js';
import { AS_RUSH_CORE } from '../data/modes.js';
import { uiAssets } from '../engine/assets.js';
import { downscaleInSteps } from './symbols-draw.js';

const FONT = '"Helvetica Neue", "Hiragino Sans", "Noto Sans JP", sans-serif';
const FONT_HEAVY = '"Arial Black", "Helvetica Neue", "Hiragino Sans", sans-serif';

/** モードごとのステージ配色 */
const STAGE_COLORS = {
  FREE_TIER:        ['#11172e', '#1d2a4d', '#3a4d80'],
  CZ:               ['#2a1030', '#4a1830', '#8a2440'],
  BONUS_READY:      ['#3a2000', '#7a3a00', '#ffb000'],
  BONUS:            ['#3a1060', '#6a1a90', '#c02090'],
  AS_RUSH:          ['#06212a', '#0b3d4a', '#12a08a'],
  HOT_STANDBY:      ['#241a06', '#4a3410', '#a07a18'],
  // Phase 5
  ROUTE53_FAILOVER: ['#2a0a0a', '#5a1414', '#b03030'],
  SPOT_ZONE:        ['#2b1200', '#6b2c00', '#e07018'],
  EC2_BURST:        ['#2a1a00', '#5c3a00', '#ffa400'],
  GRAVITON:         ['#0b1a22', '#123240', '#2f7f8f'],
  RESERVED:         ['#171029', '#2c1f52', '#6a52c8'],
  CLOUDFRONT:       ['#101a3a', '#1c3080', '#4f7bf0'],
  KINESIS:          ['#04202a', '#0a4050', '#18b0c8'],
  STEP_FUNCTIONS:   ['#141428', '#28285a', '#5a5ad0'],
  SERVERLESS_RUSH:  ['#2a1000', '#5a2600', '#ff8a00'],
  MULTI_REGION:     ['#0a0a2e', '#221060', '#8a30d0'],
  REINVENT_ED:      ['#1a0030', '#4a0060', '#ff2fa0'],
};

/** 通常時の内部状態(3.4)はステージ背景で示唆する */
const FREE_TIER_STAGES = {
  stage_cold: ['#11172e', '#1d2a4d', '#3a4d80'],
  stage_warm: ['#2a1a12', '#4a3018', '#a06a2a'],
  stage_prov: ['#2a1030', '#521a5a', '#b040c0'],
};

/* ── ステージ背景画像(assets/ui/stage_*.png) ──────────────
 * 画像が無いモードは STAGE_COLORS のグラデーションのまま。
 * 用意した6枚を「雰囲気が近いモード」へ割り当て、
 * 専用絵の無い派生ゾーンは RUSH の絵に既存の配色を薄く重ねて描き分ける。 */

/** 通常時の内部状態 → ステージ画像 */
const FREE_TIER_STAGE_ART = {
  stage_cold: 'stage_freetier',
  stage_warm: 'stage_warm',   // 高確: サミット会場
  stage_prov: 'stage_prov',   // 激アツ: re:Invent風の紫ネオン会場(専用絵)
};

/** モードID → ステージ画像。tint=true は既存の配色を上から重ねる */
const MODE_STAGE_ART = {
  FREE_TIER:        { id: 'stage_freetier' },
  CZ:               { id: 'stage_cz' },
  BONUS_READY:      { id: 'stage_cz' },
  BONUS:            { id: 'stage_rush' },
  AS_RUSH:          { id: 'stage_rush' },
  SERVERLESS_RUSH:  { id: 'stage_rush' },
  MULTI_REGION:     { id: 'stage_rush', tint: true },
  HOT_STANDBY:      { id: 'stage_standby' },
  ROUTE53_FAILOVER: { id: 'stage_standby', tint: true },
  REINVENT_ED:      { id: 'stage_ending' },
  // 派生ゾーンは RUSH の絵をベースに、モード固有の色を薄く重ねる
  SPOT_ZONE:        { id: 'stage_rush', tint: true },
  EC2_BURST:        { id: 'stage_rush', tint: true },
  GRAVITON:         { id: 'stage_rush', tint: true },
  RESERVED:         { id: 'stage_rush', tint: true },
  CLOUDFRONT:       { id: 'stage_rush', tint: true },
  KINESIS:          { id: 'stage_rush', tint: true },
  STEP_FUNCTIONS:   { id: 'stage_rush', tint: true },
};

/** 派生ゾーンで重ねる色調の濃さ */
const STAGE_TINT_ALPHA = 0.42;

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

export class LcdView {
  /**
   * @param {object} opts
   * @param {CanvasRenderingContext2D} opts.ctx
   * @param {import('../staging/anims/lcdanims.js').LcdAnims} [opts.anims]
   * @param {import('../render/chars/index.js').CharacterLayer} [opts.chars]
   * @param {import('../staging/anims/particles.js').Particles} [opts.particles]
   */
  constructor({ ctx, w = 440, h = 300, anims = null, chars = null, particles = null }) {
    this.ctx = ctx;
    this.w = w;
    this.h = h;
    this.t = 0;
    /** 直近のフレームでステージを画像で描いたか(文字の下敷きの濃さに使う) */
    this._stageIsArt = false;
    /** ステージ画像を液晶サイズへ焼いたもの(id@dpr → canvas) */
    this._stageTiles = new Map();
    // 演出サブレイヤー(DESIGN.md 5.4)
    this.anims = anims;
    this.chars = chars;
    this.particles = particles;
  }

  update(dt) {
    this.t += dt / 1000;
  }

  /**
   * サブレイヤー順に描画する(DESIGN.md 5.4):
   *   1 stage → 2 bgObject → 3 char → 4 fgEffect → 5 ui
   * @param {{modeId:string, state:object, telop:string, stackIds:string[]}} view
   */
  draw(view) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    this._drawStage(ctx, view);

    this._drawBgObject(ctx, view);
    this.anims?.draw(ctx, 'bg', this.w, this.h);

    this.chars?.draw(ctx);

    this.anims?.draw(ctx, 'fg', this.w, this.h);
    this.particles?.draw(ctx);

    this._drawUi(ctx, view);
    this.anims?.draw(ctx, 'ui', this.w, this.h);
  }

  // ── 1. stage ────────────────────────────────
  _drawStage(ctx, view) {
    const colors = (view.modeId === 'FREE_TIER'
      ? FREE_TIER_STAGES[view.state?.stage]
      : STAGE_COLORS[view.modeId]) ?? STAGE_COLORS.FREE_TIER;

    const art = this._stageArt(view);
    this._stageIsArt = Boolean(art);

    if (art) {
      // 画像は液晶いっぱいに敷く(縦横比の差は許容してフィットさせる)
      ctx.drawImage(this._stageTile(art), 0, 0, this.w, this.h);
      if (!art.tint) return;
      // 専用絵の無いモードは既存の配色を薄く重ねて描き分ける
      ctx.save();
      ctx.globalAlpha = STAGE_TINT_ALPHA;
      ctx.fillStyle = this._stageGradient(ctx, colors);
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
      return;
    }

    ctx.fillStyle = this._stageGradient(ctx, colors);
    ctx.fillRect(0, 0, this.w, this.h);
  }

  /**
   * 表示中のモードに対応するステージ画像を返す。
   * 画像が未配置・読込前なら null(呼び出し側はグラデーションへフォールバック)。
   * @returns {{id:string, image:CanvasImageSource, tint:boolean}|null}
   */
  _stageArt(view) {
    const entry = view.modeId === 'FREE_TIER'
      ? { id: FREE_TIER_STAGE_ART[view.state?.stage] ?? 'stage_freetier' }
      : MODE_STAGE_ART[view.modeId];
    if (!entry?.id) return null;
    const image = uiAssets.get(entry.id);
    if (!image) return null;
    return { id: entry.id, image, tint: Boolean(entry.tint) };
  }

  /**
   * ステージ画像を液晶の実ピクセルへ焼いて使い回す。
   *
   * 1536×1024 の原画を毎フレーム 440×300 へ落とすと、
   *   - 3.5倍の縮小を既定の補間品質でやるためジャギる(ドット絵のように見える)
   *   - 大きな縮小を60fpsで回すので単純に重い
   * ので、初回だけ段階縮小して焼き、以降は等倍で貼る。
   * @param {{id:string, image:CanvasImageSource}} art
   */
  _stageTile(art) {
    const dpr = Math.max(1, this.ctx.getTransform?.().a || 1);
    const key = `${art.id}@${dpr.toFixed(2)}`;
    const hit = this._stageTiles.get(key);
    if (hit) return hit;

    const pw = Math.max(1, Math.round(this.w * dpr));
    const ph = Math.max(1, Math.round(this.h * dpr));
    const iw = art.image.width || pw;
    const ih = art.image.height || ph;
    // 原画が液晶より小さいなら焼く意味がない(拡大はそのままの方がきれい)
    if (iw <= pw * 1.2 && ih <= ph * 1.2) return art.image;

    const c = document.createElement('canvas');
    c.width = pw;
    c.height = ph;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(downscaleInSteps(art.image, iw, ih, pw, ph), 0, 0, pw, ph);
    this._stageTiles.set(key, c);
    return c;
  }

  _stageGradient(ctx, colors) {
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, colors[0]);
    g.addColorStop(0.55, colors[1]);
    g.addColorStop(1, colors[2]);
    return g;
  }

  // ── 2. bgObject ─────────────────────────────
  _drawBgObject(ctx, view) {
    // 奥に流れるグリッド(データセンター感)。
    // ステージが画像のときは絵が十分に情報量を持っているのでごく薄くする。
    ctx.save();
    ctx.strokeStyle = this._stageIsArt ? 'rgba(255,255,255,0.022)' : 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1;
    const scroll = (this.t * 14) % 30;
    for (let y = -30 + scroll; y < this.h; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.w, y);
      ctx.stroke();
    }
    for (let x = 0; x < this.w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.h);
      ctx.stroke();
    }
    // 浮遊する光点
    for (let i = 0; i < 8; i++) {
      const px = ((i * 97 + this.t * (12 + i * 3)) % (this.w + 40)) - 20;
      const py = 40 + ((i * 53) % 200) + Math.sin(this.t * 0.8 + i) * 8;
      ctx.fillStyle = `rgba(255,255,255,${0.05 + (i % 3) * 0.03})`;
      ctx.beginPath();
      ctx.arc(px, py, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── 5. ui ───────────────────────────────────
  _drawUi(ctx, view) {
    this._drawTitleBar(ctx, view);

    // 演出のテキスト(lcd.text)が出ている間は、同じ帯に置いた常設キャプションを伏せる。
    // 突入演出のロゴと常設タイトルが重なって、どちらも読めなくなるのを防ぐ。
    const textActive = Boolean(this.anims?.text);

    switch (view.modeId) {
      case 'CZ': this._drawCz(ctx, view.state, textActive); break;
      case 'BONUS_READY': this._drawBonusReady(ctx, view.state, textActive); break;
      case 'BONUS': this._drawBonus(ctx, view.state, textActive); break;
      case 'AS_RUSH': this._drawRush(ctx, view.state, textActive); break;
      case 'HOT_STANDBY': this._drawStandby(ctx, view.state, textActive); break;
      // ── Phase 5 ──
      case 'ROUTE53_FAILOVER': this._drawRoute53(ctx, view.state, textActive); break;
      case 'SPOT_ZONE': this._drawSpot(ctx, view.state, textActive); break;
      case 'EC2_BURST': this._drawBurst(ctx, view.state, textActive); break;
      case 'GRAVITON': this._drawGraviton(ctx, view.state, textActive); break;
      case 'RESERVED': this._drawReserved(ctx, view.state, textActive); break;
      case 'CLOUDFRONT': this._drawCloudFront(ctx, view.state, textActive); break;
      case 'KINESIS': this._drawKinesis(ctx, view.state, textActive); break;
      case 'STEP_FUNCTIONS': this._drawStepFunctions(ctx, view.state, textActive); break;
      case 'SERVERLESS_RUSH': this._drawServerless(ctx, view.state, textActive); break;
      case 'MULTI_REGION': this._drawMultiRegion(ctx, view.state, textActive); break;
      case 'REINVENT_ED': this._drawEnding(ctx, view.state, textActive); break;
      default: this._drawFreeTier(ctx, view.state, textActive); break;
    }

    this._drawTelop(ctx, view.telop);
  }

  /**
   * 「いまこの画面が常設で出している文言」を演出テキスト帯へ申告する。
   * テキスト帯は同じことを言う文言を出さなくなる(常設が正)。
   * 実際に描いた場所でだけ呼ぶこと。呼ばなくなれば申告は自然に切れる。
   * @param {string} text
   * @param {object} [opts] { matchCategory:false } で完全一致だけを重複とみなす
   */
  _ambient(text, opts) {
    this.anims?.registerAmbient?.(text, opts);
  }

  _drawTitleBar(ctx, view) {
    // 通常時は内部状態の表示名(通常ステージ / サミット会場 / Invent会場)を出す。
    // ステージ背景(assets/ui/stage_*.png)は内部状態で切り替わるので、
    // モード名(FREE_TIER の '通常ステージ')を出すと背景と食い違ってしまう。
    // state.subStateName は内部状態が変わった瞬間に game/modes/freetier.js が
    // 書き換えるため、ラベルも同じフレームで切り替わる。
    const title = (view.modeId === 'FREE_TIER'
      ? view.state?.subStateName ?? view.state?.name
      : view.state?.name) ?? view.modeId;
    // 画像ステージの上では文字が沈むので下敷きを濃くする
    ctx.fillStyle = this._stageIsArt ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, this.w, 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const label = String(title).toUpperCase();
    ctx.fillText(label, 14, 17);

    // NOTE: ここには以前「↩ AS RUSH」のようなモードスタックの名前ラベルを
    // タイトルの右へ添えていたが、画面をすっきりさせる指示で撤去した。
    // 今どのモードに居るかは左上のステージ名で分かり、親ATへ戻ったことは
    // 背景とBGMの切り替わりで伝わるので、常設の名前ラベルは持たない。

    // 残ゲーム数(あるモードのみ)。名前ではなく進行の数字なので残す
    if (view.state?.remaining != null && view.state?.total != null) {
      ctx.textAlign = 'right';
      ctx.font = `700 13px ${FONT}`;
      ctx.fillStyle = '#ffe066';
      ctx.fillText(`残り ${view.state.remaining} G`, this.w - 14, 17);
    }
  }

  /** 共通: 上乗せストック(親ATに積まれたセット数) */
  _drawStock(ctx, state, x, y) {
    const stock = state?.stock ?? 0;
    if (stock <= 0) return;
    ctx.textAlign = 'right';
    ctx.font = `900 15px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ff9ad5';
    ctx.fillText(`STOCK +${stock}`, x, y);
    ctx.textAlign = 'center';
  }

  /** 共通: 横ゲージ */
  _drawGauge(ctx, x, y, w, h, p, colors) {
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    const v = Math.max(0, Math.min(1, p));
    if (v > 0) {
      ctx.save();
      roundRect(ctx, x, y, w, h, h / 2);
      ctx.clip();
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, colors[0]);
      g.addColorStop(1, colors[1]);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w * v, h);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.stroke();
  }

  _drawTelop(ctx, telop) {
    if (!telop) return;
    // モードのルール文は液晶側を正とする。同じ文言を下部パネルにも出さないよう申告する。
    // カテゴリ判定は使わない: ルール文は長い説明なので、たまたま「継続」などを
    // 含んだだけで演出側の告知まで巻き添えで消えてしまう。
    this._ambient(telop, { matchCategory: false });
    const y = this.h - 34;
    ctx.fillStyle = this._stageIsArt ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, y, this.w, 34);
    ctx.fillStyle = '#eaf2ff';
    ctx.font = `600 14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let text = String(telop);
    while (ctx.measureText(text).width > this.w - 24 && text.length > 4) {
      text = `${text.slice(0, -2)}…`;
    }
    ctx.fillText(text, this.w / 2, y + 17);
  }

  // ── モード別 ────────────────────────────────

  /**
   * 通常時の液晶は「左上のステージ名 + キャラ + 演出」だけにする。
   *
   * 以前はここに中央タイトル(FREE TIER)・内部状態・ゲーム数・天井ゲージを
   * 常設で描いていたが、
   *   - ステージ名は _drawTitleBar が内部状態に追従して左上に出す
   *   - ゲーム数は HUD の7セグ(COUNT)にある
   *   - 天井(Auto Recovery)は発動時に前兆・演出側が告知する
   * と役割が重複していたので、画面を空けてキャラと演出を主役にした。
   */
  _drawFreeTier() {
    /* 常設表示なし */
  }

  _drawCz(ctx, state, textActive = false) {
    if (state?.ui === 'checklist') return this._drawCzChecklist(ctx, state, textActive);
    if (state?.ui === 'pillars') return this._drawCzPillars(ctx, state, textActive);
    if (state?.ui === 'sfn') return this._drawCzSfn(ctx, state, textActive);
    return this._drawCzGraph(ctx, state, textActive);
  }

  /**
   * Step Functions CZ: ワークフローが最後まで流れきれば突破。
   *
   * RUSH中の STEP_FUNCTIONS ゾーン(_drawStepFunctions)と同じ
   * 「丸 + 矢印」の絵で揃える。あちらは分岐を選ばせるUI付きだが、
   * こちらは自動進行の表示だけなので選択ボックスを持たない。
   *
   * state の読み方はゲーム側の実装に幅を持たせて受ける(未実装でも落ちない):
   *   ノード名  state.states[] (無ければ STATE 1.. の連番)
   *   総数      state.stateTotal / states.length / total
   *   現在位置  state.stateIndex / step
   *   失敗      state.failed / fail / lastResult === 'FAILED'
   */
  _drawCzSfn(ctx, state, textActive = false) {
    const names = Array.isArray(state?.states) && state.states.length > 0 ? state.states : null;
    const total = Math.max(2, Math.round(names?.length ?? state?.stateTotal ?? state?.total ?? 5));
    const rawIdx = state?.stateIndex ?? state?.step ?? 0;
    const idx = Math.max(0, Math.min(total, Math.round(rawIdx)));
    const failed = Boolean(state?.failed ?? state?.fail ?? state?.lastResult === 'FAILED');
    const cleared = idx >= total && !failed;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ── ステートマシン図 ──
    const startX = 40;
    const endX = this.w - 40;
    const y = 96;
    const step = (endX - startX) / (total - 1);
    const r = Math.min(12, Math.max(7, step / 5));

    for (let i = 0; i < total; i++) {
      const x = startX + i * step;
      const passed = i < idx;
      const current = i === idx && !cleared;

      // 矢印(通過済みは緑)
      if (i > 0) {
        const lit = i <= idx;
        ctx.strokeStyle = lit ? '#4ce0a0' : 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - step + r + 2, y);
        ctx.lineTo(x - r - 5, y);
        ctx.stroke();
        ctx.fillStyle = lit ? '#4ce0a0' : 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.moveTo(x - r - 1, y);
        ctx.lineTo(x - r - 7, y - 4);
        ctx.lineTo(x - r - 7, y + 4);
        ctx.closePath();
        ctx.fill();
      }

      // ノード
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (current && failed) {
        ctx.fillStyle = '#ff5a5a';
      } else if (passed) {
        ctx.fillStyle = '#4ce0a0';
      } else if (current) {
        ctx.fillStyle = `rgba(255,224,102,${0.5 + 0.5 * Math.sin(this.t * 8)})`;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // 失敗したノードには×を描く
      if (current && failed) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.5, y - r * 0.5);
        ctx.lineTo(x + r * 0.5, y + r * 0.5);
        ctx.moveTo(x + r * 0.5, y - r * 0.5);
        ctx.lineTo(x - r * 0.5, y + r * 0.5);
        ctx.stroke();
      }

      // ノード名(狭いので短く詰める)
      // states[] の要素は文字列でも {name, type, status} オブジェクトでもよい
      const rawName = names?.[i];
      const label = (rawName && typeof rawName === 'object' ? rawName.name : rawName) ?? `S${i + 1}`;
      ctx.font = `700 9px ${FONT}`;
      ctx.fillStyle = passed ? 'rgba(124,247,208,0.85)'
        : current ? '#ffe066' : 'rgba(255,255,255,0.4)';
      let text = String(label);
      const maxW = step - 4;
      while (text.length > 2 && ctx.measureText(text).width > maxW) text = `${text.slice(0, -2)}…`;
      ctx.fillText(text, x, y + r + 12);
    }

    // ── 進捗ゲージ ──
    this._drawGauge(ctx, 60, 140, this.w - 120, 8, idx / total,
      failed ? ['#7a1c1c', '#ff5a5a'] : ['#1c5a7a', '#4ce0a0']);
    ctx.font = `700 11px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`${idx} / ${total} States`, this.w / 2, 160);

    // ── 現在の状態 ──
    if (failed) {
      ctx.font = `900 26px ${FONT_HEAVY}`;
      ctx.fillStyle = '#ff5a5a';
      ctx.fillText('FAILED', this.w / 2, 196);
    } else if (cleared) {
      ctx.font = `900 26px ${FONT_HEAVY}`;
      ctx.fillStyle = '#7bf7d0';
      ctx.fillText('SUCCEEDED', this.w / 2, 196);
    } else if (!textActive) {
      ctx.font = `700 14px ${FONT}`;
      ctx.fillStyle = '#ffe066';
      const cur = names?.[idx];
      const curName = (cur && typeof cur === 'object' ? cur.name : cur) ?? 'Task State';
      ctx.fillText(String(curName), this.w / 2, 196);
    }

    if (!textActive) {
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('Success State 到達でボーナス', this.w / 2, 218);
    }
  }

  /** M03. Trusted Advisor: 5項目のチェックリスト */
  _drawCzChecklist(ctx, state, textActive = false) {
    const items = state?.items ?? [];
    const greens = items.filter((it) => it.level === 2).length;
    const x = 46;
    const w = this.w - 92;
    ctx.textBaseline = 'middle';

    // 行の高さとピッチを詰めて全体を上へ寄せてある。
    // lcd.text(突入時の「TRUSTED ADVISOR」ロゴ)は y≒180〜208 の帯に出るため、
    // 30px ピッチだと5行目(サービス制限)がロゴの下に隠れてしまう。
    const rowH = 22;
    const pitch = 26;
    items.forEach((it, i) => {
      const y = 46 + i * pitch;
      const col = ['#ff5a5a', '#ffd166', '#4ce0a0'][it.level];
      roundRect(ctx, x, y, w, rowH, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // 状態ランプ
      ctx.beginPath();
      ctx.arc(x + 16, y + rowH / 2, 6, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = it.level === 2 ? 12 : 0;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.textAlign = 'left';
      ctx.font = `600 13px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(it.name, x + 30, y + rowH / 2);
      ctx.textAlign = 'right';
      ctx.font = `700 11px ${FONT}`;
      ctx.fillStyle = col;
      ctx.fillText(['NG', 'WARN', 'GREEN'][it.level], x + w - 10, y + rowH / 2);
    });

    ctx.textAlign = 'center';
    if (!textActive) {
      ctx.font = `900 15px ${FONT_HEAVY}`;
      ctx.fillStyle = greens >= (state?.greenNeeded ?? 3) ? '#4ce0a0' : '#ffffff';
      ctx.fillText(`GREEN ${greens} / ${state?.greenNeeded ?? 3} で突破`, this.w / 2, 222);
    }
  }

  /** M04. Well-Architected: 6本の柱 */
  _drawCzPillars(ctx, state, textActive = false) {
    const pillars = state?.pillars ?? [];
    const raised = state?.raised ?? 0;
    const baseY = 196;
    const w = 46;
    const gap = 10;
    const totalW = pillars.length * w + (pillars.length - 1) * gap;
    const startX = (this.w - totalW) / 2;

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    pillars.forEach((name, i) => {
      const x = startX + i * (w + gap);
      const up = i < raised;
      const h = up ? 112 : 16;
      const y = baseY - h;
      roundRect(ctx, x, y, w, h, 4);
      if (up) {
        const g = ctx.createLinearGradient(0, y, 0, baseY);
        g.addColorStop(0, '#fff3c4');
        g.addColorStop(1, '#e0a800');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
      }
      ctx.fill();
      ctx.strokeStyle = up ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.save();
      ctx.font = `700 9px ${FONT}`;
      ctx.fillStyle = up ? 'rgba(60,30,0,0.9)' : 'rgba(255,255,255,0.45)';
      ctx.translate(x + w / 2, up ? y + 56 : baseY - 30);
      ctx.fillText(name, 0, 0);
      ctx.restore();
    });
    // 土台
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(startX - 10, baseY, totalW + 20, 6);

    if (!textActive) {
      ctx.font = `900 16px ${FONT_HEAVY}`;
      ctx.fillStyle = raised >= pillars.length ? '#ffe066' : '#ffffff';
      ctx.fillText(`${raised} / ${pillars.length} 本`, this.w / 2, 224);
    }
  }

  _drawCzGraph(ctx, state, textActive = false) {
    const gx = 40;
    const gy = 58;
    const gw = this.w - 80;
    const gh = 150;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, gx, gy, gw, gh, 6);
    ctx.fill();

    // 閾値ライン
    const yOf = (v) => gy + gh - (v / CZ_GRAPH_MAX) * gh;
    ctx.strokeStyle = 'rgba(255,80,80,0.85)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx, yOf(CZ_GRAPH_THRESHOLD));
    ctx.lineTo(gx + gw, yOf(CZ_GRAPH_THRESHOLD));
    ctx.stroke();
    ctx.setLineDash([]);
    // 2026-08-13 ユーザー指摘「どうなればいいのか分からない」への対応。
    // 「あの線を超えればいい」が一目で分かるよう、閾値ラインに日本語ラベルを添える。
    ctx.fillStyle = 'rgba(255,120,120,0.95)';
    ctx.font = `700 10px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('ALARM 閾値 — ここを超えれば突破', gx + 6, yOf(CZ_GRAPH_THRESHOLD) - 3);
    ctx.textAlign = 'right';
    ctx.fillText('THRESHOLD', gx + gw - 6, yOf(CZ_GRAPH_THRESHOLD) - 3);

    // 折れ線
    const graph = state?.graph ?? [0];
    const total = state?.total ?? 5;
    const stepX = gw / total;
    ctx.strokeStyle = '#7cf3ff';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    graph.forEach((v, i) => {
      const x = gx + i * stepX;
      const y = yOf(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    graph.forEach((v, i) => {
      ctx.fillStyle = v >= CZ_GRAPH_THRESHOLD ? '#ff5a5a' : '#7cf3ff';
      ctx.beginPath();
      ctx.arc(gx + i * stepX, yOf(v), 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // 常設タイトル。突入演出のロゴ(lcd.text)と同じ帯なので、出ている間は伏せる
    if (!textActive) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 20px ${FONT_HEAVY}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText('CloudWatch ALARM', this.w / 2, gy + gh + 24);
      // 目標(state.goal)は全CZ共通でゲーム側が持っている
      const goal = state?.goal ?? 'ALARM を発報させろ!';
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = '#ffd166';
      ctx.fillText(goal, this.w / 2, gy + gh + 42);
      this._ambient('CloudWatch ALARM');
    }
  }

  /**
   * ボーナス入賞待ち(BONUS_READY)。DESIGN.md 3.7
   * 「ボーナス確定!」の告知と、揃えるべき絵柄の指示を大きく出す。
   */
  _drawBonusReady(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 「BONUS 確定!!」の点滅告知
    const blink = 0.65 + Math.sin(this.t * 9) * 0.35;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.font = `900 34px ${FONT_HEAVY}`;
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3a1a00';
    ctx.strokeText('BONUS 確定!!', this.w / 2, 96);
    const grad = ctx.createLinearGradient(0, 76, 0, 116);
    grad.addColorStop(0, '#fffbd0');
    grad.addColorStop(0.5, '#ffd24a');
    grad.addColorStop(1, '#ff8a00');
    ctx.fillStyle = grad;
    ctx.fillText('BONUS 確定!!', this.w / 2, 96);
    ctx.restore();
    // この画面が常設で「確定」を出しているので、テキスト帯には同じ告知を出させない
    this._ambient('BONUS 確定!!');

    // 揃える絵柄のプレート(3コマぶん並べて「中段に揃える」を絵で示す)
    const label = state?.targetSymbol === 'SHARKBAR' ? 'BAR' : '7';
    const plateColor = state?.targetSymbol === 'SHARKBAR' ? '#ffd166' : '#c88bff';
    const pw = 54;
    const ph = 50;
    const gap = 10;
    const totalW = pw * 3 + gap * 2;
    const px = (this.w - totalW) / 2;
    const py = 132;
    for (let i = 0; i < 3; i++) {
      const x = px + i * (pw + gap);
      const bob = Math.sin(this.t * 5 - i * 0.6) * 3;
      roundRect(ctx, x, py + bob, pw, ph, 7);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = plateColor;
      ctx.stroke();
      ctx.font = `900 26px ${FONT_HEAVY}`;
      ctx.fillStyle = plateColor;
      ctx.fillText(label, x + pw / 2, py + bob + ph / 2 + 1);
    }

    // 指示テキスト
    if (!textActive) {
      ctx.font = `900 22px ${FONT_HEAVY}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(state?.instruction ?? 'ボーナス図柄を揃えろ!', this.w / 2, 208);
    }
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(
      `${state?.shortName ?? 'BONUS'} — 停止ボタンを押すだけで揃います  (${state?.games ?? 0}G)`,
      this.w / 2, 234,
    );
  }

  _drawBonus(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const title = state?.title ?? 'BONUS';
    const pulse = 1 + Math.sin(this.t * 6) * 0.03;

    ctx.save();
    ctx.translate(this.w / 2, 102);
    ctx.scale(pulse, pulse);
    ctx.font = `900 46px ${FONT_HEAVY}`;
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3a0a00';
    ctx.strokeText(title, 0, 0);
    const grad = ctx.createLinearGradient(0, -26, 0, 26);
    grad.addColorStop(0, '#fff3a0');
    grad.addColorStop(0.5, '#ffb400');
    grad.addColorStop(1, '#ff5a00');
    ctx.fillStyle = grad;
    ctx.fillText(title, 0, 0);
    ctx.restore();
    // ボーナス名は常設で大きく出ているので、テキスト帯に同じ告知を出させない
    this._ambient(title);

    if (!textActive) {
      ctx.font = `700 15px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(state?.name ?? '', this.w / 2, 142);
    }
    // 獲得枚数(純増ベース)。ベルが揃うたびに一気に伸びる
    ctx.font = `900 24px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`+${Math.floor(state?.gained ?? 0)} 枚`, this.w / 2, 174);

    // 残ゲーム数(15G / 6G と短いので、消化中はここが主役になる)
    const remaining = state?.remaining ?? 0;
    const total = state?.total ?? 0;
    ctx.font = `900 20px ${FONT_HEAVY}`;
    ctx.fillStyle = remaining <= 3 ? '#ff8a8a' : '#ffffff';
    ctx.fillText(`残り ${remaining} / ${total} G`, this.w / 2, 200);

    // ベルで増えるという遊び方の説明(2026-08-13 の仕様変更ぶん)
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('ベル揃いで +15 枚', this.w / 2, 220);

    // DynamoDB BIG(セット継続型)はセット数とオンデマンド示唆を出す
    if (state?.isSet) {
      ctx.font = `900 17px ${FONT_HEAVY}`;
      ctx.fillStyle = state?.onDemand ? '#7bf7d0' : 'rgba(255,255,255,0.8)';
      ctx.fillText(
        state?.onDemand ? `SET ${state.setCount} — ON-DEMAND` : `SET ${state?.setCount ?? 1}`,
        this.w / 2, 242,
      );
    }
  }

  _drawRush(ctx, state, textActive = false) {
    const dc = state?.dc ?? 0;
    const max = AS_RUSH_CORE.dcRange.max;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('DESIRED CAPACITY', this.w / 2, 56);

    // インスタンスアイコン列
    const iconW = 34;
    const iconH = 34;
    const gap = 8;
    const totalW = max * iconW + (max - 1) * gap;
    const startX = (this.w - totalW) / 2;
    const y = 74;
    for (let i = 0; i < max; i++) {
      const x = startX + i * (iconW + gap);
      const active = i < dc;
      roundRect(ctx, x, y, iconW, iconH, 5);
      if (active) {
        const g = ctx.createLinearGradient(x, y, x, y + iconH);
        g.addColorStop(0, '#7bf7d0');
        g.addColorStop(1, '#12a08a');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      }
      ctx.lineWidth = 2;
      ctx.stroke();
      if (active) {
        ctx.fillStyle = 'rgba(0,40,35,0.8)';
        ctx.fillRect(x + 8, y + 12, iconW - 16, 3);
        ctx.fillRect(x + 8, y + 19, iconW - 16, 3);
      }
    }

    ctx.font = `900 30px ${FONT_HEAVY}`;
    ctx.fillStyle = '#7bf7d0';
    ctx.fillText(`DC ${dc}`, this.w / 2, 136);

    if (!textActive) {
      // 白文字は背景画像に沈むため、金文字+暗縁で視認性を確保(2026-08-13 ユーザー指示)
      ctx.font = `700 14px ${FONT}`;
      const pay = AS_RUSH_CORE.payoutPerGame[dc] ?? 0;
      const cont = Math.round((AS_RUSH_CORE.continueRate[dc] ?? 0) * 100);
      const label = `純増 ${pay.toFixed(1)}枚/G   継続 ${cont}%`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(10,8,20,0.9)';
      ctx.strokeText(label, this.w / 2, 166);
      ctx.fillStyle = '#ffd75e';
      ctx.fillText(label, this.w / 2, 166);
    }

    // セット数と獲得枚数は右寄せ。中央だと左下のジョージ(サメ)と重なるため
    ctx.textAlign = 'right';
    ctx.font = `900 19px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`SET ${state?.setCount ?? 1}`, this.w - 18, 176);
    ctx.fillText(`+${Math.floor(state?.gained ?? 0)} 枚`, this.w - 18, 202);
    ctx.textAlign = 'center';
    this._drawStock(ctx, state, this.w - 18, 226);
  }

  _drawStandby(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 24px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('HOT STANDBY', this.w / 2, 62);
    this._ambient('HOT STANDBY');

    // AZ-a(停止) / AZ-c(起動中)
    const boxW = 150;
    const boxH = 70;
    const y = 84;
    const azs = [
      { label: 'AZ-a', ok: false, x: this.w / 2 - boxW - 12 },
      { label: 'AZ-c', ok: true, x: this.w / 2 + 12 },
    ];
    for (const az of azs) {
      roundRect(ctx, az.x, y, boxW, boxH, 8);
      ctx.fillStyle = az.ok ? 'rgba(60,200,140,0.18)' : 'rgba(220,60,60,0.18)';
      ctx.fill();
      ctx.strokeStyle = az.ok ? 'rgba(90,240,170,0.9)' : 'rgba(255,90,90,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 15px ${FONT}`;
      ctx.fillText(az.label, az.x + boxW / 2, y + 24);
      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = az.ok ? '#9cf5cd' : '#ff9a9a';
      ctx.fillText(az.ok ? 'STANDBY' : 'DOWN', az.x + boxW / 2, y + 48);
    }

    // 復旧ゲージ
    const gx = 50;
    const gw = this.w - 100;
    const gy = 182;
    roundRect(ctx, gx, gy, gw, 18, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fill();
    const p = Math.max(0, Math.min(1, state?.gauge ?? 0));
    if (p > 0) {
      ctx.save();
      roundRect(ctx, gx, gy, gw, 18, 9);
      ctx.clip();
      const g = ctx.createLinearGradient(gx, 0, gx + gw, 0);
      g.addColorStop(0, '#ffd166');
      g.addColorStop(1, '#4ce0a0');
      ctx.fillStyle = g;
      ctx.fillRect(gx, gy, gw * p, 18);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, gx, gy, gw, 18, 9);
    ctx.stroke();

    if (!textActive) {
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      // ホットスタンバイは「待機系が既に稼働中」の構成なので、
      // 出すのは起動待ちではなく切替の進捗(ヘルスチェック→昇格→接続切替)。
      // フェーズ名はゲーム側(game/modes/recovery.js)が state.phase / phaseText で渡す。
      const phase = state?.phase ? `${state.phase} — ` : '';
      ctx.fillText(`${phase}切替進捗 ${Math.round(p * 100)}%`, this.w / 2, gy + 34);
      if (state?.phaseText) {
        ctx.font = `600 11px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(state.phaseText, this.w / 2, gy + 52);
      }
    }
  }

  // ── Phase 5: 引き戻し最終防衛 ─────────────────

  /** M19. Route 53 フェイルオーバー: TTLカウントダウン */
  _drawRoute53(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 20px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ff9a9a';
    ctx.fillText('DNS FAILOVER', this.w / 2, 58);
    this._ambient('DNS FAILOVER');

    // TTL の残り秒(ドン、と大きく)
    const ttl = state?.ttl ?? 0;
    const pulse = 1 + Math.sin(this.t * 8) * 0.05;
    ctx.save();
    ctx.translate(this.w / 2, 130);
    ctx.scale(pulse, pulse);
    ctx.font = `900 60px ${FONT_HEAVY}`;
    ctx.lineWidth = 9;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(40,0,0,0.85)';
    ctx.strokeText(`TTL ${ttl}`, 0, 0);
    ctx.fillStyle = ttl <= 0 ? '#ffe066' : '#ff6b6b';
    ctx.fillText(`TTL ${ttl}`, 0, 0);
    ctx.restore();

    // 切替先レコード
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('primary … UNHEALTHY  →  secondary へ切替中', this.w / 2, 178);
    this._drawGauge(ctx, 60, 194, this.w - 120, 12,
      1 - (state?.remaining ?? 0) / (state?.total ?? 3), ['#ff6b6b', '#ffe066']);

    if (!textActive) {
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('伝播しきれば RUSH 復帰', this.w / 2, 224);
    }
  }

  // ── Phase 5: 派生ゾーン ──────────────────────

  /** M11. Spot インスタンスゾーン */
  _drawSpot(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `900 30px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffb46a';
    ctx.fillText('SPOT ZONE', this.w / 2, 62);
    this._ambient('SPOT ZONE');
    ctx.font = `900 22px ${FONT_HEAVY}`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(10,8,20,0.9)';
    ctx.strokeText(`純増 ${state?.payoutPerGame ?? 8} 枚/G`, this.w / 2, 96);
    ctx.fillStyle = '#ffd75e';
    ctx.fillText(`純増 ${state?.payoutPerGame ?? 8} 枚/G`, this.w / 2, 96);

    ctx.font = `900 26px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`${state?.games ?? 0} G  /  +${Math.floor(state?.gained ?? 0)} 枚`, this.w / 2, 132);

    // 中断通知(2分前通知のメタファー)
    if (state?.notice) {
      const left = Math.max(0, (state.endAt ?? 0) - (state.games ?? 0));
      const blink = Math.sin(this.t * 12) > 0 ? 1 : 0.35;
      ctx.save();
      ctx.globalAlpha = blink;
      roundRect(ctx, 60, 156, this.w - 120, 44, 8);
      ctx.fillStyle = 'rgba(180,20,20,0.55)';
      ctx.fill();
      ctx.strokeStyle = '#ff5a5a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 15px ${FONT_HEAVY}`;
      ctx.fillText(`INTERRUPTION NOTICE  T-${left}`, this.w / 2, 178);
      ctx.restore();
    } else if (!textActive) {
      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(`最低 ${state?.minGames ?? 15}G 保証 — サメが来たら終わり`, this.w / 2, 176);
    }
  }

  /** M12. EC2 バーストモード: CPUクレジット残高を常時表示 */
  _drawBurst(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 26px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffc04a';
    ctx.fillText('EC2 BURST', this.w / 2, 58);
    this._ambient('EC2 BURST');

    const credit = Math.max(0, state?.credit ?? 0);
    const max = state?.creditMax ?? 150;
    const low = credit <= 20;

    ctx.font = `900 48px ${FONT_HEAVY}`;
    ctx.fillStyle = low ? '#ff6b6b' : '#ffe066';
    if (low) { ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 18 * (0.5 + 0.5 * Math.sin(this.t * 10)); }
    ctx.fillText(String(Math.ceil(credit)), this.w / 2, 108);
    ctx.shadowBlur = 0;
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('CPU CREDIT', this.w / 2, 138);

    this._drawGauge(ctx, 60, 156, this.w - 120, 16, credit / max,
      low ? ['#ff3b30', '#ff8a00'] : ['#ffa400', '#ffe066']);

    ctx.font = `900 17px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${state?.games ?? 0} G  /  +${Math.floor(state?.gained ?? 0)} 枚`, this.w / 2, 196);
    if (!textActive) {
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('毎G -4 / レア役で回復。0でベースライン性能へ', this.w / 2, 218);
    }
  }

  /** M13. Graviton モード */
  _drawGraviton(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 26px ${FONT_HEAVY}`;
    ctx.fillStyle = '#8fe6f5';
    ctx.fillText('GRAVITON', this.w / 2, 60);
    this._ambient('GRAVITON');

    // ARMコアのイメージ(静かに脈打つ格子)
    const cx = this.w / 2;
    const cy = 128;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = cx - 54 + j * 30;
        const y = cy - 30 + i * 20;
        const a = 0.25 + 0.25 * Math.sin(this.t * 2 + i + j);
        ctx.fillStyle = `rgba(143,230,245,${a})`;
        roundRect(ctx, x, y, 22, 12, 3);
        ctx.fill();
      }
    }

    ctx.font = `700 13px ${FONT}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(10,8,20,0.9)';
    ctx.strokeText(`純増 ${state?.payoutPerGame ?? 1.6} 枚/G   継続 90%`, this.w / 2, 178);
    ctx.fillStyle = '#ffd75e';
    ctx.fillText(`純増 ${state?.payoutPerGame ?? 1.6} 枚/G   継続 90%`, this.w / 2, 178);
    ctx.font = `900 18px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`SET ${state?.setCount ?? 1}   +${Math.floor(state?.gained ?? 0)} 枚`, this.w / 2, 204);
    if (!textActive) {
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('ARM は静かに強い', this.w / 2, 226);
    }
  }

  /** M14. Reserved Instance ゾーン */
  _drawReserved(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 契約書
    roundRect(ctx, 120, 52, this.w - 240, 118, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.strokeStyle = '#6a52c8';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#2a1f52';
    ctx.font = `900 18px ${FONT_HEAVY}`;
    ctx.fillText('RESERVED INSTANCE', this.w / 2, 76);
    this._ambient('RESERVED INSTANCE');
    ctx.font = `900 26px ${FONT_HEAVY}`;
    ctx.fillStyle = state?.contract === '3year' ? '#c02090' : '#2a1f52';
    ctx.fillText(state?.contractLabel ?? '1年契約', this.w / 2, 108);
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = 'rgba(40,30,80,0.75)';
    ctx.fillText(`ヘルスチェック免除 ${state?.total ?? 50} G`, this.w / 2, 138);
    // サイン
    ctx.strokeStyle = 'rgba(40,30,80,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(160, 156);
    ctx.bezierCurveTo(200, 142, 230, 168, 280, 150);
    ctx.stroke();

    ctx.font = `900 18px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`残り ${state?.remaining ?? 0} G   +${Math.floor(state?.gained ?? 0)} 枚`, this.w / 2, 196);
    if (!textActive) {
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('前払いすれば安くなるし、止まらない', this.w / 2, 220);
    }
  }

  // ── Phase 5: 上乗せ特化 ──────────────────────

  /** M15. CloudFront エッジ上乗せ */
  _drawCloudFront(ctx, state, textActive = false) {
    const cx = this.w / 2;
    const cy = 124;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // エッジロケーションのリング → 中央のオリジンへ飛んでくる
    ctx.save();
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + this.t * 0.3;
      const x = cx + Math.cos(ang) * 96;
      const y = cy + Math.sin(ang) * 52;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(140,190,255,0.85)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,190,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(cx, cy);
      ctx.stroke();
    }
    ctx.restore();

    // オリジン
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(79,123,240,0.9)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 12px ${FONT_HEAVY}`;
    ctx.fillText('ORIGIN', cx, cy);

    ctx.font = `700 13px ${FONT}`;
    ctx.fillStyle = '#bcd4ff';
    ctx.fillText(state?.lastEdge ? `${state.lastEdge} ▸ Cache HIT` : 'エッジ配信中…', cx, 186);
    ctx.font = `900 24px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`+${state?.added ?? 0} SET`, cx, 214);
    if (!textActive && state?.lastAdd > 0) {
      ctx.font = `900 15px ${FONT_HEAVY}`;
      ctx.fillStyle = '#7bf7d0';
      ctx.fillText(`今回 +${state.lastAdd}`, cx, 236);
    }
  }

  /** M16. Kinesis 上乗せストリーム */
  _drawKinesis(ctx, state, textActive = false) {
    const shards = state?.shards ?? 1;
    const records = state?.records ?? [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `900 20px ${FONT_HEAVY}`;
    ctx.fillStyle = '#6ee0f5';
    ctx.fillText(`SHARDS × ${shards}`, this.w / 2, 54);

    // シャードのレーン。処理済みのレーンには上乗せレコードが乗る
    const laneH = Math.min(20, 130 / Math.max(1, shards));
    const top = 74;
    for (let i = 0; i < shards; i++) {
      const y = top + i * (laneH + 3);
      roundRect(ctx, 46, y, this.w - 92, laneH, laneH / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
      const done = i < records.length;
      if (done) {
        const p = Math.min(1, (records.length - i) / 1.2);
        ctx.save();
        roundRect(ctx, 46, y, (this.w - 92) * p, laneH, laneH / 2);
        ctx.fillStyle = 'rgba(24,176,200,0.75)';
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${Math.max(9, laneH - 8)}px ${FONT_HEAVY}`;
        ctx.fillText(`+${records[i]} SET`, this.w / 2, y + laneH / 2);
      } else {
        // 未処理レーンを流れるデータ粒
        const x = 50 + ((this.t * 120 + i * 40) % (this.w - 100));
        ctx.fillStyle = 'rgba(140,230,255,0.8)';
        ctx.fillRect(x, y + laneH / 2 - 1.5, 14, 3);
      }
    }

    ctx.font = `900 22px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`合計 +${state?.added ?? 0} SET`, this.w / 2, 224);
  }

  /** M17. Step Functions チャレンジ(プレイヤー分岐選択) */
  _drawStepFunctions(ctx, state, textActive = false) {
    const total = state?.total ?? 8;
    const idx = state?.stateIndex ?? 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ステートマシンの進捗(丸と矢印)
    const startX = 42;
    const endX = this.w - 42;
    const y = 62;
    const step = (endX - startX) / (total - 1);
    for (let i = 0; i < total; i++) {
      const x = startX + i * step;
      if (i > 0) {
        ctx.strokeStyle = i <= idx ? '#7bf7d0' : 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - step + 11, y);
        ctx.lineTo(x - 11, y);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      if (i < idx) { ctx.fillStyle = '#7bf7d0'; }
      else if (i === idx) { ctx.fillStyle = `rgba(255,224,102,${0.55 + 0.45 * Math.sin(this.t * 8)})`; }
      else { ctx.fillStyle = 'rgba(255,255,255,0.14)'; }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.font = `700 11px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`${idx} / ${total} States   (+${state?.added ?? 0} SET)`, this.w / 2, 88);

    // Choice State の選択肢(左=A / 右=D)
    const pair = state?.choicePair ?? ['A', 'B'];
    const boxW = 150;
    const boxH = 60;
    const by = 116;
    [0, 1].forEach((i) => {
      const x = i === 0 ? this.w / 2 - boxW - 12 : this.w / 2 + 12;
      const active = Boolean(state?.awaitChoice);
      roundRect(ctx, x, by, boxW, boxH, 10);
      ctx.fillStyle = active ? 'rgba(90,90,208,0.45)' : 'rgba(255,255,255,0.07)';
      ctx.fill();
      ctx.strokeStyle = active
        ? `rgba(255,224,102,${0.55 + 0.45 * Math.sin(this.t * 6 + i * 1.6)})`
        : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.fillStyle = active ? '#ffffff' : 'rgba(255,255,255,0.45)';
      ctx.font = `900 18px ${FONT_HEAVY}`;
      ctx.fillText(pair[i], x + boxW / 2, by + 24);
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = active ? '#ffe066' : 'rgba(255,255,255,0.35)';
      ctx.fillText(i === 0 ? '左ボタン (A)' : '右ボタン (D)', x + boxW / 2, by + 45);
    });

    ctx.font = `700 13px ${FONT}`;
    if (state?.awaitChoice) {
      ctx.fillStyle = '#ffe066';
      ctx.fillText('分岐を選べ', this.w / 2, 196);
    } else if (state?.lastResult) {
      ctx.fillStyle = state.lastResult === 'SUCCEEDED' ? '#7bf7d0' : '#ff6b6b';
      ctx.fillText(`${state.lastChoice ?? ''} : ${state.lastResult}`, this.w / 2, 196);
    }
    if (!textActive) {
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('Success State 到達で MULTI-REGION', this.w / 2, 218);
    }
  }

  // ── Phase 5: 上位AT ─────────────────────────

  /** M09. Serverless RUSH */
  _drawServerless(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // λ を大きく
    ctx.save();
    ctx.font = `900 92px ${FONT_HEAVY}`;
    ctx.globalAlpha = 0.16 + 0.06 * Math.sin(this.t * 3);
    ctx.fillStyle = '#ffb46a';
    ctx.fillText('λ', this.w / 2, 120);
    ctx.restore();

    ctx.font = `900 26px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffb46a';
    ctx.fillText('SERVERLESS RUSH', this.w / 2, 62);
    this._ambient('SERVERLESS RUSH');

    ctx.font = `900 30px ${FONT_HEAVY}`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(10,8,20,0.9)';
    ctx.strokeText(`純増 ${state?.payoutPerGame ?? 4} 枚/G`, this.w / 2, 118);
    ctx.fillStyle = '#ffd75e';
    ctx.fillText(`純増 ${state?.payoutPerGame ?? 4} 枚/G`, this.w / 2, 118);
    if (!textActive) {
      ctx.font = `700 14px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(`継続 ${Math.round((state?.continueRate ?? 0.8) * 100)}% 固定 — DC管理から解放`, this.w / 2, 150);
    }

    ctx.textAlign = 'right';
    ctx.font = `900 19px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`SET ${state?.setCount ?? 1}`, this.w - 18, 178);
    ctx.fillText(`+${Math.floor(state?.gained ?? 0)} 枚`, this.w - 18, 204);
    ctx.textAlign = 'center';
    this._drawStock(ctx, state, this.w - 18, 228);
  }

  /** M10. Multi-Region アクティブ・アクティブ(世界地図のリージョン点灯) */
  _drawMultiRegion(ctx, state, textActive = false) {
    const regions = state?.regions ?? [];
    const lit = state?.lit ?? 1;
    // 液晶内の相対座標に置いた簡易世界地図
    const POS = [
      [0.78, 0.42], [0.24, 0.38], [0.48, 0.32], [0.74, 0.62],
      [0.30, 0.72], [0.14, 0.42], [0.51, 0.28], [0.68, 0.52],
    ];

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 経緯線
    ctx.save();
    ctx.strokeStyle = 'rgba(150,190,255,0.14)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 40 + i * 32);
      ctx.lineTo(this.w, 40 + i * 32);
      ctx.stroke();
    }
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * (this.w / 8), 40);
      ctx.lineTo(i * (this.w / 8), 232);
      ctx.stroke();
    }
    ctx.restore();

    POS.forEach(([rx, ry], i) => {
      const x = rx * this.w;
      const y = 40 + ry * 190;
      const on = i < lit;
      if (on) {
        const pulse = 1 + Math.sin(this.t * 4 + i) * 0.25;
        const g = ctx.createRadialGradient(x, y, 1, x, y, 18 * pulse);
        g.addColorStop(0, 'rgba(255,180,255,0.95)');
        g.addColorStop(1, 'rgba(160,60,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 18 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#ffffff' : 'rgba(255,255,255,0.22)';
      ctx.fill();
      if (on && regions[i]) {
        ctx.font = `700 8px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(regions[i], x, y + 14);
      }
    });

    ctx.font = `900 20px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ff9ad5';
    ctx.fillText(`ACTIVE / ACTIVE   ${lit} REGIONS`, this.w / 2, 52);
    this._ambient('ACTIVE / ACTIVE');

    ctx.textAlign = 'right';
    ctx.font = `900 18px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`SET ${state?.setCount ?? 1}  +${Math.floor(state?.gained ?? 0)} 枚`, this.w - 16, 240);
    ctx.textAlign = 'center';
    this._drawStock(ctx, state, this.w - 16, 220);
  }

  // ── Phase 5: エンディング ────────────────────

  /** M20. re:Invent キーノート */
  _drawEnding(ctx, state, textActive = false) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // キーノートのステージ(スポットライト)
    ctx.save();
    const g = ctx.createRadialGradient(this.w / 2, 40, 10, this.w / 2, 40, 240);
    g.addColorStop(0, 'rgba(255,120,220,0.35)');
    g.addColorStop(1, 'rgba(255,120,220,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();

    ctx.font = `900 24px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('re:Invent KEYNOTE', this.w / 2, 56);
    this._ambient('re:Invent KEYNOTE');

    // 発表された新サービス(獲得枚数の言い換え)
    const list = state?.announced ?? [];
    ctx.font = `700 12px ${FONT}`;
    list.slice(-5).forEach((name, i) => {
      ctx.fillStyle = `rgba(255,255,255,${0.45 + i * 0.12})`;
      ctx.fillText(`Introducing… ${name}`, this.w / 2, 86 + i * 20);
    });

    ctx.font = `900 34px ${FONT_HEAVY}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`${list.length} NEW SERVICES`, this.w / 2, 196);
    if (!textActive) {
      ctx.font = `700 13px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(`完走 +${Math.floor(state?.gained ?? 0)} 枚 / 残り ${state?.remaining ?? 0} G`, this.w / 2, 224);
    }
  }
}
