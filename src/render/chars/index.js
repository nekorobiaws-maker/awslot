/**
 * キャラクターレイヤー(LCD内の char サブレイヤー)。DESIGN.md 5.4 / 6.8
 *
 * 演出システムの char.show / char.hide / char.motion から叩かれ、
 * ポーズと位置をパラメータとして保持する。描画は LcdView から呼ばれる。
 *
 * DESIGN.md 注意事項8 のとおり、パス描画は液晶Canvas(440×300)内に限定する。
 */

import {
  drawLuna, LUNA_MOTIONS, LUNA_HOMES, LUNA_GROUND_HALF,
} from './lunachan.js';
import { drawHero, HERO_MOTIONS, HERO_HOMES } from './herochan.js';

/*
 * ══ 2026-08-15 U68: 常駐キャラはルナ(assets/chars/luna.png)═══════════
 *
 * 【指示】サメを前面に出すのは控える(大人の事情)。メインキャラクターはルナにする。
 *
 * ■ ID はそのまま、中身だけ差し替える
 *   シナリオ側(src/data/scenarios/**)には旧サメ2体の呼び名で書かれた
 *   char キューが 300箇所以上ある。ここを機械置換すると差分が巨大になるので、
 *   **ID を残して中身を差し替える**(2026-08-14 に幽霊 → サメへ替えたときと同じ手)。
 *     'kiro'   … 常駐の主役 = ルナ本体。うろうろ・待機・リアクションを担う
 *     'george' … 'kiro' への **別名**。旧「2体目」の指定はすべてルナ1人に集約する
 *   ポーズ名(happy / grin / panic …)の読み替えは
 *   render/chars/lunachan.js の LUNA_SITUATIONS が引き受ける。
 *
 * ■ なぜ 'george' は「別名」で、'hide' だけ無視するのか
 *   旧データは「サメAを引っ込めてサメBを出す」書き方(hide george → show kiro)を
 *   多用している。素直に別名化すると **出した直後に自分を消す** 並びが生まれるので、
 *   別名側の hide だけは no-op にしてある(下の hide() のコメント参照)。
 *
 * ■ サメの残し方(低プロファイル)
 *   render/chars/george.js と assets/chars/shark.png は **消さない**(データ保全)。
 *   このファイルからの参照を外しただけなので、必要になれば1行で戻せる。
 *   リール絵柄の BAR(SHARKBAR.png)は今までどおり不変。
 *
 * ■ プレミア枠(PREMIUM_CHARS)
 *   'luna'  … 数百ゲームに1回のカメオ枠(後光つき・大きめ)。常駐と同じ絵なので、
 *             出ているあいだは常駐を描かない(下の draw を参照)。
 *   'hero'  … ヒーローRUSH の主役(render/chars/herochan.js / U30)。
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

/** 常駐キャラの実体ID(中身はルナ) */
const RESIDENT = 'kiro';

/**
 * 旧・2体目('george')を常駐へ寄せる別名表(U68)。
 * ここに載っているIDは show / pose / motion / home がすべて常駐へ転送される。
 */
const CHAR_ALIAS = { george: RESIDENT };

/** 別名を実体IDへ解決する */
const realId = (id) => CHAR_ALIAS[id] ?? id;

/**
 * 演出テキスト帯による減光の効き(V21-09)。
 * lcd.js から届く dim(0.45)にこれを掛ける = 実効 0.70 → キャラは 30% まで沈む。
 * 「文字が主役、キャラは背景」を徹底するための係数で、帯が消えれば元に戻る。
 */
const DIM_GAIN = 1.55;

/** プレミア枠が出ているあいだ、常設キャラを下げる濃さ */
const PREMIUM_DUCK = 0.4;

/*
 * ══ 立ち位置と大きさ(2026-08-15 U71 で全面見直し)════════════════════
 *
 * 【指摘】「チャンスゾーンでルナが小さくなる」→ そのとおりだった。
 *   CZ の常駐は scale 0.30(= 高さ 50px)で、通常時 0.78(129px)の **4割** しかない。
 *   この値はサメ時代(箱 186×150 / 横長)の「盤面の端にちょこんと置く」設計の
 *   生き残りで、主役が人間になった今は「急に遠くへ行ってしまった」ようにしか見えない。
 *
 * 【新しい約束】
 *   1. 大きさは3段階だけ(SIZE)。**通常時を基準**に、盤面の混み具合で選ぶ。
 *      いちばん小さい side でも通常時の 8割 あるので「小さくなった」とは見えない。
 *   2. 位置は「足元の高さ」で書く(stand())。中心Yを直接書くと scale を触るたびに
 *      足元がズレて、接地(U68b)の意味が消えるため。
 *   3. 立ち位置は **液晶の右端** に統一する(ヒーローRUSH だけは主役を立てて左)。
 *      どのモードでも同じ場所に居る = 目が迷わない。通常時(x352)とも揃う。
 *   4. 足元は結論行(y232〜262)より下、遊び方の常設行(y266〜300)の中まで下ろす。
 *      **キャラは常設UIより先に描かれる**(render/lcd.js の draw 順)ので、
 *      足元に文字帯が重なっても文字は必ず読める。逆に頭を盤面(y34〜176)へ
 *      突っ込ませると、盤面のカードの裏に隠れて画が濁る。
 *      → 「頭は盤面に入れない、足元は文字帯に埋める」で高さを稼ぐ。
 *
 * ■ 液晶の座席割り(全モード共通の約束 / render/lcd-cz-extra.js と同じ)
 *     y   0〜 34 … タイトルバー
 *     y  34〜176 … 盤面
 *     y 178〜230 … 演出テキスト帯(lcd.text)
 *     y 232〜262 … 結論・合計の1行
 *     y 266〜300 … 遊び方 / 目標の常設行
 *   テキスト帯と重なるぶんは、帯が出ている間の減光(draw の dim)でキャラが沈む。
 *
 * ■ wander(省略可)
 *   待機中に歩いて移動する最大量(px)。U71 で「基本は立ち止まる」に変えたので、
 *   これは **たまに場所を変えるときの振れ幅**(頻度は WANDER が握る)。
 *
 * ■ george の行について(U68 以降)
 *   実際に描かれるのは kiro(= ルナ本体)の1行だけ。george の行は
 *   **別名として kiro へ転送される**ので使われないが、
 *   「サメを戻したくなったら1行で戻せる」保全としてそのまま残してある。
 */

/**
 * 常駐ルナの大きさ(高さ = 165 × scale)。
 *   full … 通常時。液晶で主役を張る大きさ    129px
 *   main … 盤面のあるモード(CZ / ボーナス / RUSH …)116px = 通常時の 90%
 *   side … 別の主役が居るモード(ヒーローRUSH)102px = 通常時の 80%
 */
const SIZE = { full: 0.78, main: 0.70, side: 0.62 };

/**
 * 定位置を「足元の高さ」で書くための小道具(U71)。
 * @param {number} x 立ち位置(体の中心X)
 * @param {number} feet 足元の高さ(px)。ここから中心Yを逆算する
 * @param {number} scale SIZE のどれか
 * @param {number} [wander] たまに歩く振れ幅(px)
 */
const stand = (x, feet, scale, wander) => ({
  x,
  y: Math.round(feet - (LUNA_GROUND_HALF * scale)),
  scale,
  ...(wander == null ? {} : { wander }),
});

/** キャラの定位置(LCD 440×300 内の論理座標) */
const MODE_HOMES = {
  // 通常時。盤面に常設UIが無いので、足元をテロップ帯の手前(y260)に置いて一番大きく
  FREE_TIER:   { kiro: stand(352, 260, SIZE.full, 44), george: { x: 80, y: 240, scale: 0.50, wander: 52 } },
  // CZ: 11種すべて盤面が y34〜176 を full幅で使う。頭を入れずに高さを稼ぐため、
  // 足元を目標行(y266〜)の中まで下ろして右端へ立たせる(旧: x402 / scale 0.30)
  CZ:          { kiro: stand(388, 282, SIZE.main, 12), george: { x: 40, y: 206, scale: 0.28, wander: 16 } },
  // ボーナス: 中央にロゴと払い出し。右端で通常時と同じ背丈に揃える
  BONUS:       { kiro: stand(384, 282, SIZE.main), george: { x: 62, y: 236, scale: 0.48 } },
  // 入賞待ち: 中央に「サメBAR を揃えろ!」の指示。指示は必ずキャラの上に描かれる
  BONUS_READY: { kiro: stand(384, 282, SIZE.main), george: { x: 60, y: 238, scale: 0.46 } },
  /*
   * ── RUSH 4種 ──
   * 結論行の座布団は左(進捗)と右(+n枚)の2枚で、どちらも y230〜258。
   * 座布団はキャラより後に描かれるので、足元が隠れても数字は読める。
   * ただし **座布団が体のどこを横切るか** は選べるので、足元を少しだけ上げて
   * 「胸を横切る」ではなく「すねを横切る」高さにしてある(実機確認 U71)。
   */
  AS_RUSH:     { kiro: stand(384, 274, SIZE.main, 12), george: { x: 62, y: 204, scale: 0.34, wander: 24 } },
  CF_RUSH:     { kiro: stand(386, 274, SIZE.main, 10), george: { x: 52, y: 204, scale: 0.32, wander: 18 } },
  AURORA_RUSH: { kiro: stand(386, 274, SIZE.main, 10), george: { x: 52, y: 204, scale: 0.32, wander: 18 } },
  // ヒーロー: 主役は hero(右 x309〜395)。ルナは左で拍手役にまわる = ここだけ side
  HERO_RUSH:   { kiro: stand(58, 272, SIZE.side, 10), george: { x: 44, y: 208, scale: 0.28, wander: 12 } },
  HOT_STANDBY: { kiro: stand(384, 284, SIZE.main), george: { x: 50, y: 246, scale: 0.38 } },

  // ── Phase 5 ──
  ROUTE53_FAILOVER: { kiro: stand(384, 284, SIZE.main), george: { x: 48, y: 244, scale: 0.36 } },
  SPOT_ZONE:        { kiro: stand(382, 284, SIZE.main), george: { x: 86, y: 232, scale: 0.60 } },
  EC2_BURST:        { kiro: stand(384, 284, SIZE.main), george: { x: 46, y: 244, scale: 0.36 } },
  GRAVITON:         { kiro: stand(384, 284, SIZE.main), george: { x: 52, y: 248, scale: 0.34 } },
  RESERVED:         { kiro: stand(384, 284, SIZE.main), george: { x: 372, y: 240, scale: 0.42 } },
  CLOUDFRONT:       { kiro: stand(386, 284, SIZE.main), george: { x: 44, y: 250, scale: 0.32 } },
  KINESIS:          { kiro: stand(386, 284, SIZE.main), george: { x: 44, y: 250, scale: 0.32 } },
  // Step Functions: 選択肢ボックス(y116〜176)が下まで来るので、ほんの少し低く
  STEP_FUNCTIONS:   { kiro: stand(386, 286, SIZE.main), george: { x: 42, y: 254, scale: 0.30 } },
  SERVERLESS_RUSH:  { kiro: stand(384, 284, SIZE.main), george: { x: 58, y: 242, scale: 0.42 } },
  MULTI_REGION:     { kiro: stand(388, 286, SIZE.main), george: { x: 40, y: 252, scale: 0.30 } },
  // エンディング: 壇上。中央の大きな文字を避けて左に立つ
  REINVENT_ED:      { kiro: stand(96, 284, SIZE.main), george: { x: 320, y: 248, scale: 0.46 } },
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

/**
 * 現在の定位置(applyMode で切り替わる)。
 * U68 以降 'george' は別名なので、ここに実体は要らない(残すと二重管理になる)。
 */
const HOME = {
  kiro: { ...DEFAULT_HOME.kiro },
  luna: { ...DEFAULT_HOME.luna },
  hero: { ...DEFAULT_HOME.hero },
};

/**
 * モーション定義: 一定時間パラメータを上書きする。
 *
 * 2026-08-14: キャラが画像になったので、芝居は「変形」でつける。
 * squash & stretch(潰れ/伸び)を足して、ぬいぐるみが跳ねるような
 * コミカルな手触りにしてある。ポーズ既定のアニメ(U68 以降は lunachan.js の ANIMS)へ
 * さらに上乗せされる。
 */
/*
 * ══ 接地の原則(2026-08-15 ユーザー指摘 U68b)══════════════════════
 *
 * ここのモーションは元々サメ(魚)用で、泳ぐ・漂う・尾びれを振るが基本だった。
 * 主役が人間(ルナ)になったので **全部「床に足がついている」動きへ作り直した**。
 *   ・offsetY を使ってよいのはジャンプの滞空中だけ(必ず 0 = 着地へ戻す)
 *   ・沈み込み(squashY < 1)は _withBody が足元を固定するので、
 *     「膝を曲げる」表現として安心して使える
 *   ・入退場は泳ぎではなく歩き / 小走り(歩幅ぶんの上下 + 接地の沈み)
 * **キー名は変えない**。シナリオ側(data/scenarios/**)が
 * motion:'swimIn' のように参照していて、名前を変えると全置換が要るため。
 * 名前は歴史、中身が正。
 */
const MOTIONS = {
  /** ぴょんと跳ねる(跳ぶ → 着地 → 沈んで戻る) */
  bounce:  { ms: 700,  apply: (c, p) => {
    const ph = (p * 2) % 1;
    const AIR = 0.6;
    if (ph <= AIR) {
      const up = Math.sin((ph / AIR) * Math.PI);
      c.offsetY = -up * 24;
      c.squashX = 1 - up * 0.05;
      c.squashY = 1 + up * 0.07;
    } else {
      const land = 1 - (ph - AIR) / (1 - AIR);
      c.offsetY = 0;
      c.squashX = 1 + land * 0.06;
      c.squashY = 1 - land * 0.07;
    }
  } },
  /** ぷるぷる(横揺れ。足は床) */
  shake:   { ms: 600,  apply: (c, p) => { c.offsetX = Math.sin(p * Math.PI * 12) * 9; c.tilt = Math.sin(p * Math.PI * 12) * 0.04; } },
  /** ぐいっと迫る(カメラが寄る表現。上下には動かない) */
  zoom:    { ms: 900,  apply: (c, p) => { c.scaleMul = 1 + Math.sin(p * Math.PI) * 0.45; } },
  /**
   * 踏み込む(旧「噛みつき」)。溜めて一歩下がってから、前へぐっと出る。
   * mouthOpen はサメ時代の名残で、ルナの描画では使われない(害はない)。
   */
  bite:    { ms: 800,  apply: (c, p) => {
    c.offsetX = p < 0.45 ? -p * 40 : -18 + (p - 0.45) * 90;
    // 溜めでしゃがみ、踏み込みで伸び上がる(足は床のまま)
    c.squashY = p < 0.45 ? 1 - 0.06 : 1 + 0.04;
    c.squashX = p < 0.45 ? 1 + 0.05 : 1 - 0.03;
    c.tilt = p < 0.45 ? -0.03 : 0.05;
  } },
  /** 画面外から **歩いて** 入場(旧: 泳いで入場) */
  swimIn:  { ms: 900,  apply: (c, p) => {
    c.offsetX = -260 * (1 - easeOutCubic(p));
    const step = Math.abs(Math.sin(p * Math.PI * 4)) * (1 - p * 0.4);
    c.offsetY = -step * 3.5;
    c.squashY = 1 - (1 - step) * 0.025;
    c.tilt = (1 - p) * -0.04;
  } },
  /** 小走りで退場(旧: 泳いで退場) */
  swimOut: { ms: 800,  apply: (c, p) => {
    c.offsetX = -320 * easeInCubic(p);
    const step = Math.abs(Math.sin(p * Math.PI * 4));
    c.offsetY = -step * 4;
    c.squashY = 1 - (1 - step) * 0.025;
    c.alphaMul = 1 - p * 0.6;
    c.tilt = p * -0.05;
  } },
  /** 体をひねる(旧「尾びれをバタつかせる」。ルナには尾が無いので上体のひねりへ) */
  tailWhip:{ ms: 700,  apply: (c, p) => {
    c.tilt = Math.sin(p * Math.PI * 3) * 0.09 * (1 - p * 0.3);
    c.offsetX = Math.sin(p * Math.PI * 3) * 5;
  } },

  // ── 2026-08-14 追加(画像キャラ向けのコミカル芝居)──
  /** しゃがんだ姿勢から立ち上がって登場(旧: ぽんっと飛び出す) */
  popIn:   { ms: 520,  apply: (c, p) => {
    const e = easeOutBack(p);
    c.scaleMul = 0.62 + 0.38 * e;
    // 立ち上がる = 縦に伸びる。足元は _withBody が固定するので浮かない
    c.squashY = 0.78 + 0.22 * e;
    c.squashX = 1.10 - 0.10 * e;
  } },
  /** ぷるぷる震える(強制終了・ペナルティ。横揺れだけ) */
  tremble: { ms: 900,  apply: (c, p) => {
    const k = 1 - p * 0.4;
    c.offsetX = Math.sin(p * Math.PI * 30) * 6 * k;
    c.tilt = Math.sin(p * Math.PI * 30) * 0.035 * k;
    c.squashY = 1 - 0.02 * k;
  } },
  /** 首を振って否定(ハズレ) */
  wiggle:  { ms: 800,  apply: (c, p) => { c.tilt = Math.sin(p * Math.PI * 6) * 0.15 * (1 - p); } },
  /**
   * 画面を横切って走り抜ける。
   * **pose:'run'(走りポーズ)と組で使うこと**。立ちポーズのまま横滑りすると
   * 氷の上を滑っているように見える(接地原則の趣旨に反する)。
   */
  dashBy:  { ms: 900,  apply: (c, p) => {
    c.offsetX = -300 + easeOutCubic(p) * 600;
    const step = Math.abs(Math.sin(p * Math.PI * 6));
    c.offsetY = -step * 5;
    c.squashY = 1 - (1 - step) * 0.03;
    c.tilt = -0.08;
    c.alphaMul = p < 0.12 ? p / 0.12 : p > 0.86 ? (1 - p) / 0.14 : 1;
  } },
  /** 喜びの連続ジャンプ(跳ぶ → 着地 → 跳ぶ) */
  hooray:  { ms: 1200, apply: (c, p) => {
    const ph = (p * 3) % 1;
    const AIR = 0.6;
    if (ph <= AIR) {
      const up = Math.sin((ph / AIR) * Math.PI);
      c.offsetY = -up * 28;
      c.squashX = 1 - up * 0.04;
      c.squashY = 1 + up * 0.06;
    } else {
      const land = 1 - (ph - AIR) / (1 - AIR);
      c.offsetY = 0;
      c.squashX = 1 + land * 0.07;
      c.squashY = 1 - land * 0.08;
    }
    c.tilt = Math.sin(p * Math.PI * 6) * 0.07;
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
 * 待機中の立ち居振る舞い(= たまに歩いて場所を変える)。
 *
 * ══ 2026-08-15 U71「まだ左右にゆらゆら浮いて見える」════════════════
 *
 * 【指摘】U68b で縦のぷかぷかは消えたが、**横の揺れが残っていて浮遊感がある**。
 * 【原因】うろうろが「常に歩いている」実装だった。
 *   片道 2.4〜4.2秒 → 立ち止まり **0.26〜0.9秒** → また逆へ、の繰り返しで、
 *   ほぼ全時間が移動中。おまけに歩けば進行方向へ体が傾く(wanderTilt)ので、
 *   ゆっくり左右に流れながら傾く = 水中を漂っているように見えていた。
 * 【対処】立ち止まりを **6〜14秒** に伸ばして主従を逆にした。
 *   ・立っている間は移動も傾きも跳ねも **完全に 0**(下の _updateWander)
 *   ・歩いている間だけ歩幅ぶんの跳ねと進行方向の傾きが出る(これは自然な動き)
 *   ・退屈しのぎは「揺らす」ではなく **たまに仕草を挟む**(GESTURE)で作る
 *
 * ■ U68b(接地): 常時の上下ゆらぎ(bobY)は廃止
 *   人間なので **止まっているときは上下に動かない**(呼吸だけ。呼吸は
 *   render/chars/lunachan.js の ANIMS.idle が sy で表現する)。
 */
const WANDER = {
  /** 定位置からの最大移動量(px) */
  range: 80,
  /** 液晶の端に体がめり込まないための余白(px) */
  margin: 48,
  /** 片道にかける時間(ms)。距離に応じてこの範囲で決まる */
  minMs: 2400,
  maxMs: 4200,
  /**
   * 次に歩き出すまで **立ち止まっている** 時間(U71)。
   * ここが移動時間より十分に長いことが「立っている」画の要。
   * 実測(scripts の30秒観察)で、止まっている時間が全体の 8割 を超える値にしてある。
   */
  holdMinMs: 10000,
  holdMaxMs: 22000,
  /** 歩幅ぶんの跳ね(px)。歩いている間だけ。0 で完全に接地 */
  walkBob: 2.6,
  /** 1秒あたりの歩数(2 = 左右で1歩ずつ) */
  stepsPerSec: 2.6,
  /**
   * 進行方向への最大の傾き(rad)。
   * 泳ぐ魚は大きく傾いてよかったが、歩く人はほとんど傾かない(旧 0.17 → 0.05)。
   */
  tilt: 0.05,
  /** 傾きが最大になる速さ(px/ms) */
  tiltSpeed: 0.075,
  /** これ以下の速さは「立ち止まっている」とみなして揺れを完全に切る(px/ms) */
  stillSpeed: 0.002,
};

/**
 * 待機中の仕草(U71)。**ポーズだけ**を数秒差し替える。
 *
 * ■ なぜ「揺らす」のではなく「ポーズを替える」のか
 *   置物に見せないための動きが欲しいだけなら体を揺らすのが簡単だが、
 *   それは今回まさに「浮いて見える」と言われた当のもの。
 *   人間は立っているとき体幹を揺らさず、**表情と仕草**で間を持たせる。
 *   ポーズの切り替えは一瞬で終わり、移行中に体が流れないので浮遊感が出ない。
 *
 * ■ 選ぶポーズの条件(render/chars/lunachan.js の LUNA_POSES)
 *   ・追加エフェクト(fx)を持たないこと。きらめきやハートが待機で出ると
 *     「何か起きた」の誤報になる(演出の信頼度に嘘を混ぜない)
 *   ・大きく移動しないこと(peek は ±34px 動くので待機では使わない)
 * ■ sleep(居眠り)だけは長い待機のごほうび
 *   「通常時が長く続いたときのアイドル変化」。ずっと出ると寝てばかりの子になるので、
 *   同じ場所で idleSec を積んだときにだけ候補へ入る。
 */
const GESTURE = {
  /** 通常の仕草(fxなし・その場から動かないポーズ) */
  poses: ['think', 'question', 'wave', 'coding'],
  /** 長く待たされたときだけ足す仕草 */
  longPoses: ['sleep'],
  /** これだけ待機が続いたら longPoses も候補に入れる(秒) */
  longIdleSec: 60,
  /** 次の仕草までの間隔(ms)。数十秒に1回 = 常時ではない */
  waitMinMs: 14000,
  waitMaxMs: 30000,
  /** 1回の仕草の長さ(ms) */
  minMs: 2200,
  maxMs: 3600,
};

/** 仕草として差し替えてよい「素の立ち姿」のポーズ名(演出中の指定は上書きしない) */
const NEUTRAL_POSES = new Set(['normal', 'idle', 'smile']);

/**
 * 演出が指定したポーズを、何もされないまま何秒保持したら素へ戻すか(U71)。
 *
 * ■ なぜ要るのか
 *   演出データには「決めポーズで終わって素へ戻さない」シナリオがある
 *   (例: data/scenarios/normal.js の stage_up_provisioned は happy で終わる)。
 *   ポーズ既定のアニメは **鳴らしっぱなしで走り続ける** ので、
 *   happy(cheerJump)なら次の演出が来るまで延々と跳ね続けることになる。
 *   これがユーザーの言う「浮いてる感じ」の一因でもあった。
 *   決めポーズは見せ場の数秒ぶんあれば足りるので、しばらく放置されたら
 *   静かな立ち姿へ戻す。**演出が続いている間(モーション中)は戻さない**。
 */
const POSE_HOLD_SEC = 9;

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
    /*
     * 既定の向き。ルナの素材は左右反転を許していない(Tシャツの文字が鏡文字になる)ので、
     * 常駐でも 1 のまま持つだけ。反転してよいポーズ(走り)だけが dir を見る
     * (render/chars/lunachan.js の mirror)。
     */
    this.dir = 1;
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
    // U71: 出てきた直後は歩き出さず、まず立つ
    this.wanderHold = 1500 + Math.random() * 4000;
    this.wanderPhase = Math.random() * Math.PI * 2;
    /*
     * 待機の仕草(U71)。**描画に使うポーズだけ**を一時的に差し替える。
     * c.pose には触らないので、うろうろのアイドル判定も演出側の指定も乱さない。
     */
    this.gesture = null;
    this.gestureLeft = 0;
    this.gestureT0 = 0;
    this.gestureWait = GESTURE.waitMinMs + Math.random() * (GESTURE.waitMaxMs - GESTURE.waitMinMs);
    /** 素の立ち姿のまま待っている時間(秒)。長い待機のごほうび(sleep)の条件 */
    this.idleSec = 0;
    /** 今のポーズが指定された時刻(秒)。決めポーズの寝かせ(U71)に使う */
    this.poseAt = 0;
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
      // 常駐の主役(中身はルナ)。旧2体目 'george' はこの1人へ集約される
      kiro: new CharState(RESIDENT),
      // カメオ専用。既定では出てこない(演出データが show したときだけ現れる)
      luna: new CharState('luna'),
      // ヒーローRUSH の主役。こちらも演出データが show したときだけ現れる
      hero: new CharState('hero'),
    };
    this.t = 0;
    /**
     * キャラ大写しのカットインが走っているか(U68)。
     * true の間は常駐を描かない = 同じ子が画面に2人並ぶのを防ぐ。
     * 値は毎フレーム src/main.js が Cutins.hasCharCutin() から渡す
     * (render 層から staging 層は見られないので、外から教えてもらう形にしてある)。
     */
    this.charCutinActive = false;
  }

  /** @param {boolean} on キャラ大写しカットインの実行状態 */
  setCharCutinActive(on) {
    this.charCutinActive = Boolean(on);
  }

  /**
   * @param {string} id 'kiro'(=常駐ルナ)/ 'george'(別名)/ 'luna' / 'hero'
   * @param {string} [pose]
   * @param {object} [opts] { x, y, scale, dir }
   */
  show(id, pose = 'normal', opts = {}) {
    const c = this.chars[realId(id)];
    if (!c) return;
    c.visible = true;
    c.pose = pose;
    c.poseAt = this.t;      // 決めポーズの寝かせ(U71)の基準時刻
    c.gesture = null;       // 演出が来たら待機の仕草は畳む
    c.targetAlpha = 1;
    if (opts.x != null) c.x = opts.x;
    if (opts.y != null) c.y = opts.y;
    if (opts.scale != null) c.scale = opts.scale;
    if (opts.dir != null) c.dir = opts.dir;
  }

  /**
   * 引っ込める。
   *
   * ■ 別名('george')の hide は **何もしない**(U68)
   *   旧データは「2体目を引っ込めてから1体目を出す」書き方
   *   (hide george → show kiro)を多用している。ルナ1人に集約した今、
   *   これを素直に実行すると **出した直後に自分を消す** 並びが生まれ、
   *   同じ at のキュー順しだいで常駐がふっと消える。
   *   別名側は「席を空ける」意図しか持っていないので、無視するのが正しい。
   *   本当に引っ込めたい場面は必ず実体ID('kiro')で書かれている。
   */
  hide(id) {
    if (CHAR_ALIAS[id]) return;
    const c = this.chars[id];
    if (!c) return;
    c.targetAlpha = 0;
  }

  /** ポーズだけ変える */
  pose(id, pose) {
    const c = this.chars[realId(id)];
    if (!c) return;
    c.pose = pose;
    c.poseAt = this.t;      // 決めポーズの寝かせ(U71)の基準時刻
    c.gesture = null;       // 演出が来たら待機の仕草は畳む
  }

  /** モーションを再生する */
  motion(id, motion) {
    const c = this.chars[realId(id)];
    const def = MOTIONS[motion];
    if (!c || !def) return;
    c.motion = motion;
    c.motionLeft = def.ms;
    c.gesture = null;       // 芝居が入るあいだは待機の仕草を止める
  }

  /** 定位置に戻す */
  home(id) {
    const key = realId(id);
    const c = this.chars[key];
    if (!c || !HOME[key]) return;
    c.x = HOME[key].x;
    c.y = HOME[key].y;
    c.scale = HOME[key].scale;
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

    // アイドル時のうろうろ。U68 で常駐が1人になったので、動かす対象もルナだけ
    // (置物に見えないようにするのが目的。演出中は _updateWander 側で止まる)
    this._updateWander(this.chars[RESIDENT], dt);
    // 待機の仕草(U71)。揺らす代わりに、たまに表情と姿勢を変える
    this._updateGesture(this.chars[RESIDENT], dt);
  }

  /**
   * 待機中の仕草(U71)。
   *   ・素の立ち姿で待っている間だけ、数十秒に1回 数秒だけポーズを差し替える
   *   ・演出が始まったら(ポーズ指定・モーション)即座に取り下げる
   * ポーズの差し替えは描画専用の c.gesture で行い、c.pose には触らない。
   */
  _updateGesture(c, dt) {
    if (!c) return;
    /*
     * 決めポーズの寝かせ(U71)。演出が素へ戻し忘れたまま放置されたら、
     * 静かな立ち姿へ戻す(理由は POSE_HOLD_SEC のコメント)。
     */
    if (!NEUTRAL_POSES.has(c.pose) && !c.motion && this.t - c.poseAt > POSE_HOLD_SEC) {
      c.pose = 'normal';
    }
    const neutral = c.visible && c.targetAlpha > 0 && !c.motion && NEUTRAL_POSES.has(c.pose);
    if (!neutral) {
      // 演出が主役。仕草はその場で畳んで、次の間隔を取り直す
      c.gesture = null;
      c.gestureLeft = 0;
      c.idleSec = 0;
      c.gestureWait = GESTURE.waitMinMs + Math.random() * (GESTURE.waitMaxMs - GESTURE.waitMinMs);
      return;
    }

    c.idleSec += dt / 1000;

    if (c.gesture) {
      c.gestureLeft -= dt;
      if (c.gestureLeft <= 0) {
        c.gesture = null;
        c.gestureWait = GESTURE.waitMinMs + Math.random() * (GESTURE.waitMaxMs - GESTURE.waitMinMs);
      }
      return;
    }

    c.gestureWait -= dt;
    if (c.gestureWait > 0) return;
    // 長く待たされているときだけ居眠りを候補に足す
    const pool = c.idleSec >= GESTURE.longIdleSec
      ? [...GESTURE.poses, ...GESTURE.longPoses]
      : GESTURE.poses;
    // 演出RNGは使わない(engine/voice.js 冒頭と同じ理由。見た目だけの乱数)
    this.gestureFor(c.id, pool[Math.floor(Math.random() * pool.length)],
      GESTURE.minMs + Math.random() * (GESTURE.maxMs - GESTURE.minMs));
  }

  /**
   * 一時的にポーズだけ差し替える(U71)。**素の立ち姿のときだけ効く**。
   *
   * 演出(char.pose / char.motion)が指定したポーズは上書きしない。
   * ボイスの相槌に表情を合わせる用途で staging/actions.js からも呼ばれる
   * (「あれ?」で首をかしげる、など)。
   *
   * @param {string} id
   * @param {string} pose LUNA_POSES / LUNA_SITUATIONS のどちらの名前でも通る
   * @param {number} [ms]
   */
  gestureFor(id, pose, ms = 2400) {
    const c = this.chars[realId(id)];
    if (!c || !pose) return;
    if (!NEUTRAL_POSES.has(c.pose) || c.motion) return;
    c.gesture = pose;
    c.gestureLeft = ms;
    c.gestureT0 = this.t;
    c.idleSec = 0;
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

    /*
     * ここから下は「歩いている間だけの味付け」(U71)。
     * 立ち止まっている間は v がゼロなので、傾きも跳ねも **必ず 0 に収束する**。
     * 収束の途中で微小な値が残り続けると、それが「ゆらゆら」の正体になるので、
     * 止まっていると判定できる速さ(stillSpeed)ではその場で 0 に落とし切る。
     */
    const v = dt > 0 ? (c.wanderX - prevX) / dt : 0;
    const walking = Math.abs(v) > WANDER.stillSpeed;

    // 進行方向へ体を傾ける(速度に比例)
    const target = walking
      ? Math.max(-1, Math.min(1, v / WANDER.tiltSpeed)) * WANDER.tilt
      : 0;
    c.wanderTilt += (target - c.wanderTilt) * Math.min(1, dt / 180);
    if (!walking && Math.abs(c.wanderTilt) < 0.0005) c.wanderTilt = 0;

    /*
     * 歩幅ぶんの跳ね(U68b)。**歩いている間だけ**上下する。
     * speed(0〜1)は今の移動の速さで、立ち止まっていれば 0 = 完全に接地。
     * |sin| なので、1歩ごとに必ず 0(足が着いた瞬間)へ戻る。
     */
    const speed = walking ? Math.min(1, Math.abs(v) / WANDER.tiltSpeed) : 0;
    const bob = speed > 0.02
      ? Math.abs(Math.sin(this.t * Math.PI * WANDER.stepsPerSec + c.wanderPhase)) * WANDER.walkBob * speed
      : 0;
    c.wanderY += (-bob - c.wanderY) * Math.min(1, dt / 60);
    if (!walking && Math.abs(c.wanderY) < 0.02) c.wanderY = 0;
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
     * ヒーロー(RUSHの主役)と常駐が同じ濃さで並ぶと、どちらが主役か分からなくなる。
     *
     * ■ カメオのルナだけは「下がる」ではなく **完全に描かない**(U68)
     *   常駐もカメオも同じルナなので、両方出すと画面にルナが2人並んでしまう。
     *   カメオは後光つき・大きめの特別枠なので、そちらに主役を明け渡す。
     */
    const lunaCameoOut = this.chars.luna?.visible && this.chars.luna.alpha > 0;
    const premiumOut = PREMIUM_CHARS_ARR.some((id) => {
      const c = this.chars[id];
      return c && c.visible && c.alpha > 0;
    });
    const sideMul = dimMul * (premiumOut ? PREMIUM_DUCK : 1);

    const resident = this.chars[RESIDENT];
    // カメオ中・キャラ大写しカットイン中は、常駐を描かない(ルナが2人にならないように)
    const residentOut = !lunaCameoOut && !this.charCutinActive;
    if (resident.visible && resident.alpha > 0 && sideMul > 0 && residentOut) {
      const rx = resident.x + resident.offsetX + resident.wanderX;
      const ry = resident.y + resident.offsetY + resident.wanderY;
      this._withBody(ctx, resident, rx, ry, () => {
        drawLuna(ctx, {
          x: rx,
          y: ry,
          scale: resident.scale * resident.scaleMul,
          dir: resident.dir,
          /*
           * 待機の仕草(U71)は **その仕草が始まった瞬間を 0 秒** として渡す。
           * ポーズ既定のアニメには「はじめに首をかしげて、そのまま保つ」のように
           * 立ち上がりを持つものがあり、途中の位相から始めると
           * いきなり傾いた姿勢で現れて不自然になる。
           */
          t: resident.gesture ? this.t - resident.gestureT0 : this.t,
          alpha: resident.alpha * resident.alphaMul * sideMul,
          // ポーズ名でもシチュエーション名でも通る(旧サメのポーズ名も
          // render/chars/lunachan.js の LUNA_SITUATIONS が読み替える)
          pose: resident.gesture ?? resident.pose,
          // 常駐は後光なし・減光ありの「素の」ルナ(カメオとの格の差を保つ)
          premium: false,
        });
      // 接地補正(U68b)。伸び縮みしても足元の高さが変わらないようにする
      }, LUNA_GROUND_HALF * resident.scale * resident.scaleMul);
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
      // カメオも人間なので接地補正を掛ける(U68b)
      }, LUNA_GROUND_HALF * luna.scale * luna.scaleMul);
    }
  }

  /**
   * うろうろの傾き・モーションの傾き・squash & stretch を
   * 「キャラの立ち位置を軸」に掛けてから中身を描く。
   * 画像キャラは頂点を動かせないので、伸び縮みはここで面倒を見る。
   *
   * @param {number} [groundHalf]
   *   接地補正(U68b)。キャラの箱の **半分の高さ(画面px)**。
   *   基準点は箱の中心なので、squashY で縮めると足元まで上がって宙に浮く。
   *   縮んだぶんの半分だけ下へずらすと、足元の高さが変わらない:
   *       足元 = y + half*sqy + half*(1-sqy) = y + half
   *   これで「膝を曲げて沈む」「背伸びする」が正しく地面の上で起きる。
   *   0 を渡すと従来どおり中心を軸にした伸縮になる(人間でないキャラ用)。
   */
  _withBody(ctx, c, x, y, drawFn, groundHalf = 0) {
    const tilt = (c.wanderTilt ?? 0) + (c.tilt ?? 0);
    const sqx = c.squashX ?? 1;
    const sqy = c.squashY ?? 1;
    const plain = !tilt && sqx === 1 && sqy === 1;
    if (plain) {
      drawFn();
      return;
    }
    ctx.save();
    ctx.translate(x, y + groundHalf * (1 - sqy));
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
