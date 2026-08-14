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
import { drawLuna, LUNA_MOTIONS, LUNA_HOMES } from './lunachan.js';
import { drawHero, HERO_MOTIONS, HERO_HOMES } from './herochan.js';

/*
 * 2026-08-14: キャラは2体ともサメ(assets/chars/shark.png)になった。
 * 'kiro' は旧・幽霊枠の呼び名がシナリオ側に大量に残っているため ID として維持し、
 * 中身は「小物付きポーズの相棒サメ」を描く(render/chars/kiro.js)。
 *
 * さらに 2026-08-14 に3体目 'luna' を追加した。こちらは常設ではなく
 * **超低確率のカメオ専用**(data/scenarios/yokoku-luna.js からしか呼ばれない)。
 * 定位置・モーションの定義は本体側(render/chars/lunachan.js)にあり、
 * ここでは登録だけ行う。
 *
 * 同じ日に4体目 'hero'(render/chars/herochan.js / U30)を追加。
 * こちらは **ヒーローRUSH のあいだ画面に常駐する主役**で、
 * 毎ゲームの当落にリアクションを返す(data/scenarios/rushes.js が指揮する)。
 * ルナとヒーローの2人は「プレミア枠」としてまとめて扱う(PREMIUM_CHARS)。
 */

/**
 * プレミア枠のキャラ。演出テキスト帯による減光(dim)を受けない。
 *
 * 2026-08-14 V2 の対策で入れた減光は「常設キャラが文字に被って読めない」ための
 * ものだが、**滅多に出てこない主役まで沈める**のは逆効果だった
 * (ルナは出るたびに毎回 55% まで沈んでいた / render/chars/lunachan.js の注記)。
 * この2人は出る場面そのものが見せ場なので、濃さは常に自前で決める。
 */
const PREMIUM_CHARS = new Set(['luna', 'hero']);

/** 走査を毎フレーム回すので配列にもしておく(Set の反復より安い) */
const PREMIUM_CHARS_ARR = [...PREMIUM_CHARS];

/**
 * 演出テキスト帯による減光の効き(V21-09)。
 * lcd.js から届く dim(0.45)にこれを掛ける = 実効 0.70 → キャラは 30% まで沈む。
 * 「文字が主役、キャラは背景」を徹底するための係数で、帯が消えれば元に戻る。
 */
const DIM_GAIN = 1.55;

/** プレミア枠が出ているあいだ、常設キャラを下げる濃さ */
const PREMIUM_DUCK = 0.4;

/**
 * キャラの定位置(LCD 440×300 内の論理座標)。
 *
 * 液晶が狭いので、モードごとに「そのモードのUIと重ならない位置」を持たせる。
 * (RUSHのDCアイコン列・CZのグラフ・ボーナスのロゴを避ける)
 *
 * ■ 液晶の座席割り(全モード共通の約束 / render/lcd-cz-extra.js と同じ)
 *     y   0〜 34 … タイトルバー
 *     y  34〜176 … 盤面
 *     y 178〜230 … 演出テキスト帯(lcd.text)
 *     y 232〜262 … 結論・合計の1行 ←★ここに常設の文字が出るモードがある
 *     y 266〜300 … テロップ帯
 *   2026-08-14 検証指摘 V21-09「サメが結論行テキストに被る」への対処として、
 *   結論行を持つモード(CZ 4種 / RUSH 4種)のキャラは **結論行に体をかけない**
 *   高さへ移した。テキスト帯と重なるぶんは、帯が出ている間の減光(draw の dim)で
 *   キャラが沈むので文字が勝つ。
 *
 * ■ wander(省略可)
 *   アイドル中のうろうろの最大移動量(px)。中央へ寄ってくると
 *   中央寄せの常設テキストに被るので、結論行のあるモードでは小さくしてある。
 */
const MODE_HOMES = {
  FREE_TIER:   { kiro: { x: 356, y: 196, scale: 0.72, wander: 42 }, george: { x: 80, y: 240, scale: 0.50, wander: 52 } },
  // CZ: 盤面(y34〜176)と結論行(y232〜262)に挟まれた帯へ、左右の端に小さく置く。
  // 旧値(y246〜250)は結論行そのものに座っていて「HTTP 200 OK…」の末尾に被っていた
  CZ:          { kiro: { x: 402, y: 202, scale: 0.30, wander: 16 }, george: { x: 40, y: 206, scale: 0.28, wander: 16 } },
  // ボーナスの主役は bonusId で変わる(どちらもサメ。ポーズと定位置が違うだけ)。
  // ただし applyMode は main.js から modeEnter の id しか渡されないため、
  // ここで bonusId 別の定位置を持たせても選べない。
  // 「どちらを出すか」は data/scenarios/bonus.js の char.show / char.hide が決めており、
  // 出ている1体がここの定位置に収まる。左右どちらでも液晶UIと重ならない値にしてある。
  BONUS:       { kiro: { x: 384, y: 214, scale: 0.58 }, george: { x: 62, y: 236, scale: 0.48 } },
  // 入賞待ち: 中央に「ゴースト7 / サメBAR を揃えろ!」の指示が出るので左右の下端へ。
  // 未定義だと FREE_TIER の定位置(幽霊 y196 / scale 0.72)に落ちて指示テロップへ被っていた
  BONUS_READY: { kiro: { x: 386, y: 220, scale: 0.54 }, george: { x: 60, y: 238, scale: 0.46 } },
  /*
   * ── RUSH 4種の立ち位置(結論行の座布団は y230〜258)──
   *   体の下端が 230 を越えないように、中心Yと scale を組にして決めてある
   *   (サメの箱は 186×150 なので 高さ = 150×scale)。
   *   中央下(x130〜300)は座布団が無いので、そこだけ少し下まで使える。
   */
  // AS_RUSH: EC2アイコン列(y70〜150)と結論行(左「上乗せ +nG」/ 右「+n枚」)を避ける
  AS_RUSH:     { kiro: { x: 250, y: 214, scale: 0.40, wander: 30 }, george: { x: 62, y: 204, scale: 0.34, wander: 24 } },
  // U11 の RUSH 3種。どれも中央上〜中段に主役の絵があるので、左右の端の「帯の高さ」へ逃がす
  // CF: エッジの並び(y66〜116)と中央の払い出し数字(y150)を避ける
  CF_RUSH:     { kiro: { x: 400, y: 202, scale: 0.34, wander: 18 }, george: { x: 52, y: 204, scale: 0.32, wander: 18 } },
  // Aurora: ゲージ(y66)とACUの大きい数字(y128)を避ける
  AURORA_RUSH: { kiro: { x: 400, y: 202, scale: 0.34, wander: 18 }, george: { x: 52, y: 204, scale: 0.32, wander: 18 } },
  // ヒーロー: 主役は hero(右 x309〜395)。サメ2体は左に小さく並べて拍手役にまわる
  HERO_RUSH:   { kiro: { x: 106, y: 206, scale: 0.26, wander: 12 }, george: { x: 44, y: 208, scale: 0.28, wander: 12 } },
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

/*
 * ルナ(カメオ)とヒーロー(RUSH主役)の定位置を全モードへ配る。
 * モード別の指定が無ければ default が入るので、どのモードで呼ばれても
 * 前のモードの座標が残り続ける(=画面外に置き去りになる)ことがない。
 */
for (const [modeId, preset] of Object.entries(MODE_HOMES)) {
  preset.luna = { ...(LUNA_HOMES[modeId] ?? LUNA_HOMES.default) };
  preset.hero = { ...(HERO_HOMES[modeId] ?? HERO_HOMES.default) };
}

const DEFAULT_HOME = MODE_HOMES.FREE_TIER;

/** 現在の定位置(applyMode で切り替わる) */
const HOME = {
  kiro: { ...DEFAULT_HOME.kiro },
  george: { ...DEFAULT_HOME.george },
  luna: { ...DEFAULT_HOME.luna },
  hero: { ...DEFAULT_HOME.hero },
};

/**
 * モーション定義: 一定時間パラメータを上書きする。
 *
 * 2026-08-14: キャラが画像になったので、芝居は「変形」でつける。
 * squash & stretch(潰れ/伸び)を足して、ぬいぐるみが跳ねるような
 * コミカルな手触りにしてある。ポーズ既定のアニメ(george.js の ANIMS)へ
 * さらに上乗せされる。
 */
const MOTIONS = {
  /** ぴょんと跳ねる(着地で潰れる) */
  bounce:  { ms: 700,  apply: (c, p) => {
    const up = Math.abs(Math.sin(p * Math.PI * 2));
    c.offsetY = -up * 26;
    c.squashX = 1 - up * 0.06 + (1 - up) * 0.05;
    c.squashY = 1 + up * 0.08 - (1 - up) * 0.05;
  } },
  /** ぷるぷる(横揺れ) */
  shake:   { ms: 600,  apply: (c, p) => { c.offsetX = Math.sin(p * Math.PI * 12) * 9; c.tilt = Math.sin(p * Math.PI * 12) * 0.05; } },
  /** ぐいっと迫る */
  zoom:    { ms: 900,  apply: (c, p) => { c.scaleMul = 1 + Math.sin(p * Math.PI) * 0.45; } },
  /** 噛みつき(溜めてから突っ込む) */
  bite:    { ms: 800,  apply: (c, p) => {
    c.mouthOpen = p < 0.45 ? p / 0.45 : Math.max(0, 1 - (p - 0.45) / 0.25);
    c.offsetX = p < 0.45 ? -p * 40 : -18 + (p - 0.45) * 90;
    c.squashX = 1 + (p > 0.45 ? 0.1 : -0.05);
    c.squashY = 1 - (p > 0.45 ? 0.08 : -0.04);
  } },
  /** 画面外から泳いで入場 */
  swimIn:  { ms: 900,  apply: (c, p) => { c.offsetX = -260 * (1 - easeOutCubic(p)); c.tilt = (1 - p) * -0.12; } },
  /** 泳いで退場 */
  swimOut: { ms: 800,  apply: (c, p) => { c.offsetX = -320 * easeInCubic(p); c.alphaMul = 1 - p * 0.6; c.tilt = p * -0.1; } },
  /** 尾びれをバタつかせる(体をひねる) */
  tailWhip:{ ms: 700,  apply: (c, p) => { c.tailAngle = Math.sin(p * Math.PI * 3) * 0.7; } },

  // ── 2026-08-14 追加(画像キャラ向けのコミカル芝居)──
  /** ぽんっと飛び出す(登場) */
  popIn:   { ms: 520,  apply: (c, p) => {
    const e = easeOutBack(p);
    c.scaleMul = 0.3 + 0.7 * e;
    c.offsetY = (1 - e) * 24;
  } },
  /** ぷるぷる震える(強制終了・ペナルティ) */
  tremble: { ms: 900,  apply: (c, p) => {
    const k = 1 - p * 0.4;
    c.offsetX = Math.sin(p * Math.PI * 30) * 6 * k;
    c.offsetY = Math.cos(p * Math.PI * 26) * 3 * k;
    c.tilt = Math.sin(p * Math.PI * 30) * 0.04 * k;
  } },
  /** 首を振って否定(ハズレ) */
  wiggle:  { ms: 800,  apply: (c, p) => { c.tilt = Math.sin(p * Math.PI * 6) * 0.18 * (1 - p); } },
  /** 画面を横切って走り抜ける */
  dashBy:  { ms: 900,  apply: (c, p) => {
    c.offsetX = -300 + easeOutCubic(p) * 600;
    c.tilt = -0.14;
    c.alphaMul = p < 0.12 ? p / 0.12 : p > 0.86 ? (1 - p) / 0.14 : 1;
  } },
  /** 喜びの連続ジャンプ */
  hooray:  { ms: 1200, apply: (c, p) => {
    const ph = (p * 3) % 1;
    const up = Math.sin(ph * Math.PI);
    c.offsetY = -up * 30;
    c.squashX = 1 + (1 - up) * 0.08 - up * 0.04;
    c.squashY = 1 - (1 - up) * 0.08 + up * 0.06;
    c.tilt = Math.sin(p * Math.PI * 6) * 0.1;
  } },
};

/**
 * ルナ専用のモーション(入場 → ポーズ決め → 退場)と
 * ヒーロー専用のモーション(デビュー → 当たり/外し → 完走)を共通レジストリへ足す。
 * 定義そのものは各キャラのファイル(lunachan.js / herochan.js)にあるので、ここは登録だけ。
 */
Object.assign(MOTIONS, LUNA_MOTIONS, HERO_MOTIONS);

const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeInCubic = (x) => x * x * x;
const easeInOutSine = (x) => 0.5 - Math.cos(Math.PI * x) / 2;
const easeOutBack = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

/** 液晶の論理サイズ(engine/layers.js の lcd レイヤーと一致させること) */
const LCD_W = 440;

/**
 * アイドル時のうろうろ(2026-08-14 から2体とも)。
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
    // 定位置はジョージが左・相棒が右なので、既定の向きは内側(=お互いの方)にする
    this.dir = id === 'kiro' ? -1 : 1;
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
    // 画像キャラの芝居用(モーションが一時的に上書きする)
    this.squashX = 1;
    this.squashY = 1;
    this.tilt = 0;
  }
}

export class CharacterLayer {
  constructor() {
    this.chars = {
      kiro: new CharState('kiro'),
      george: new CharState('george'),
      // カメオ専用。既定では出てこない(演出データが show したときだけ現れる)
      luna: new CharState('luna'),
      // ヒーローRUSH の主役。こちらも演出データが show したときだけ現れる
      hero: new CharState('hero'),
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
    /*
     * プレミア枠はモード専属なので、モードが変わったら必ず引っ込める。
     *   ルナ   … 1ゲームで完結するカメオ(出した演出が hide まで面倒を見る)
     *   ヒーロー … ヒーローRUSH の主役
     * 演出データ側の hide が何かの理由で走らなかったとき
     * (100回転で打ち切られた・強制遷移した等)に、
     * 次のモードの画面へ置き去りになるのを防ぐ最後の砦。
     * ヒーローRUSH へ入る場合だけは、突入シナリオが出すまで触らない。
     */
    if (modeId !== 'HERO_RUSH') this.hide('hero');
    this.hide('luna');

    const preset = MODE_HOMES[modeId] ?? DEFAULT_HOME;
    for (const id of Object.keys(HOME)) {
      const p = preset[id];
      if (!p) continue;
      HOME[id].x = p.x;
      HOME[id].y = p.y;
      HOME[id].scale = p.scale;
      // うろうろの幅もモードごと(結論行のあるモードでは中央へ寄せない)
      HOME[id].wander = p.wander ?? WANDER.range;
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

    // アイドル時のうろうろ。2026-08-14 に2体ともサメになったので両方動かす
    // (置物に見えないようにするのが目的。演出中は _updateWander 側で止まる)
    this._updateWander(this.chars.kiro, dt);
    this._updateWander(this.chars.george, dt);
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

    // ゆらゆら(左右移動とは別の周期にして機械的な往復に見えないようにする)。
    // 位相はキャラごとにずらして、2体が同じ動きで揃わないようにする
    c.wanderY = Math.sin(this.t * 0.9 + c.wanderPhase) * WANDER.bobY;

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
    // モード別に決めた移動幅(結論行のあるモードは中央へ寄らせない / V21-09)
    const range = HOME[c.id]?.wander ?? WANDER.range;
    // 液晶からはみ出さない範囲に丸める
    const min = Math.max(-range, WANDER.margin - homeX);
    const max = Math.min(range, LCD_W - WANDER.margin - homeX);
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

  /**
   * LcdView の char サブレイヤーから呼ばれる。
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} [opts]
   * @param {number} [opts.dim]
   *   0〜1。**演出テキスト帯が出ている間だけ** キャラを沈めるための減光。
   *   2026-08-14 検証指摘 V2「あるある分岐予兆でサメ画像が液晶テキストに重なって読めない」。
   *   キャラの定位置(FREE_TIER は y196)とテキスト帯の中心(y194)はほぼ同じ高さで、
   *   位置をずらすと今度は盤面のUIとぶつかる。そこで
   *     ・テキストの下敷きを濃くする(staging/anims/lcdanims.js の TEXT_TONES)
   *     ・帯が出ている間だけキャラを沈める(ここ)
   *   の2段で「文字が主役、キャラは背景」に切り替える。帯が消えれば元の濃さへ戻る。
   *
   *   2026-08-14 V21-09 で減光の効きを DIM_GAIN 倍に強めた。0.45 のままだと
   *   「1:1 DIRECT CONNECT」のような結論の文字の上にサメが 55% で残っていて、
   *   下敷きを濃くしても字が読みにくかった。プレミア枠(luna / hero)は対象外。
   */
  draw(ctx, { dim = 0 } = {}) {
    // 常設キャラ用の減光。プレミア枠(luna / hero)には掛けない
    const dimMul = 1 - Math.max(0, Math.min(1, dim * DIM_GAIN));
    /*
     * プレミア枠が出ているあいだ、常設キャラは一歩下がる。
     * ルナ(V21-10 で液晶の半分を使う大きさになった)やヒーローと
     * サメが同じ濃さで並ぶと、どちらが主役か分からない画になるため。
     */
    const premiumOut = PREMIUM_CHARS_ARR.some((id) => {
      const c = this.chars[id];
      return c && c.visible && c.alpha > 0;
    });
    const sideMul = dimMul * (premiumOut ? PREMIUM_DUCK : 1);
    if (sideMul <= 0 && !premiumOut) return;
    const kiro = this.chars.kiro;
    if (kiro.visible && kiro.alpha > 0 && sideMul > 0) {
      const kx = kiro.x + kiro.offsetX + kiro.wanderX;
      const ky = kiro.y + kiro.offsetY + kiro.wanderY;
      this._withBody(ctx, kiro, kx, ky, () => {
        drawKiro(ctx, {
          x: kx,
          y: ky,
          scale: kiro.scale * kiro.scaleMul,
          pose: KIRO_POSES[kiro.pose] ? kiro.pose : 'normal',
          t: this.t,
          alpha: kiro.alpha * kiro.alphaMul * sideMul,
          dir: kiro.dir,
        });
      });
    }

    const g = this.chars.george;
    if (g.visible && g.alpha > 0 && sideMul > 0) {
      const poseName = GEORGE_POSES[g.pose] ? g.pose : 'normal';
      const base = GEORGE_POSES[poseName];
      const gx = g.x + g.offsetX + g.wanderX;
      const gy = g.y + g.offsetY + g.wanderY;
      this._withBody(ctx, g, gx, gy, () => {
        drawGeorge(ctx, {
          x: gx,
          y: gy,
          scale: g.scale * g.scaleMul,
          dir: g.dir,
          t: this.t,
          alpha: g.alpha * g.alphaMul * sideMul,
          // pose を渡すとポーズ固有の芝居(浮遊/震え/明滅…)が付く。
          // mouthOpen / tailAngle はモーションによる上書きを優先する
          pose: poseName,
          mouthOpen: g.mouthOpen ?? base.mouthOpen,
          tailAngle: g.tailAngle ?? base.tailAngle,
          brow: base.brow,
        });
      });
    }

    // ── プレミア枠は最後(=一番手前)に描く ──
    // 減光(dim)は掛けない。滅多に出てこない主役なので、出たときは常に濃く立たせる。

    // ヒーロー(ヒーローRUSH の主役)
    const hero = this.chars.hero;
    if (hero.visible && hero.alpha > 0) {
      const hx = hero.x + hero.offsetX + hero.wanderX;
      const hy = hero.y + hero.offsetY + hero.wanderY;
      this._withBody(ctx, hero, hx, hy, () => {
        drawHero(ctx, {
          x: hx,
          y: hy,
          scale: hero.scale * hero.scaleMul,
          dir: hero.dir,
          t: this.t,
          alpha: hero.alpha * hero.alphaMul,
          // ポーズ名でもシチュエーション名でも通る(未知の名前は smile へ落ちる)
          pose: hero.pose,
        });
      });
    }

    // ルナ(超低確率のカメオ)。いちばん前に立たせる
    const luna = this.chars.luna;
    if (luna.visible && luna.alpha > 0) {
      const lx = luna.x + luna.offsetX + luna.wanderX;
      const ly = luna.y + luna.offsetY + luna.wanderY;
      this._withBody(ctx, luna, lx, ly, () => {
        drawLuna(ctx, {
          x: lx,
          y: ly,
          scale: luna.scale * luna.scaleMul,
          dir: luna.dir,
          t: this.t,
          alpha: luna.alpha * luna.alphaMul,
          // ポーズ名でもシチュエーション名でも通る(未知の名前は smile へ落ちる)
          pose: luna.pose,
        });
      });
    }
  }

  /**
   * うろうろの傾き・モーションの傾き・squash & stretch を
   * 「キャラの立ち位置を軸」に掛けてから中身を描く。
   * 画像キャラは頂点を動かせないので、伸び縮みはここで面倒を見る。
   */
  _withBody(ctx, c, x, y, drawFn) {
    const tilt = (c.wanderTilt ?? 0) + (c.tilt ?? 0);
    const sqx = c.squashX ?? 1;
    const sqy = c.squashY ?? 1;
    const plain = !tilt && sqx === 1 && sqy === 1;
    if (plain) {
      drawFn();
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    if (tilt) ctx.rotate(tilt);
    if (sqx !== 1 || sqy !== 1) ctx.scale(sqx, sqy);
    ctx.translate(-x, -y);
    drawFn();
    ctx.restore();
  }

  /** モード切替時などに全部隠す */
  hideAll() {
    for (const id of Object.keys(this.chars)) this.hide(id);
  }
}
