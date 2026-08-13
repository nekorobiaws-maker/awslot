/**
 * キャラ描画: ジョージ・ジョーズ・ユージー(サメ)。DESIGN.md 6.8
 *
 * ■ 2026-08-13 v3 全面再設計(ユーザー要望「サメは画像じゃなくコードで作り込む」)
 *
 * 参照した絵(この2枚に造形・配色・線の太さを寄せている):
 *   assets/symbols/SHARKBAR.png   … BARプレートを抱えたサメのステッカー絵
 *   assets/ui/bottom_panel.png    … BIG BONUS 帯の右で腕を上げているサメ
 *
 * 参照から読み取った特徴(v2 の実装に足りなかったもの):
 *   1. 頭が極端に大きいマスコット体型。「細長い魚」ではなく頭+尾に近い2頭身
 *   2. 顔は 3/4 向き = **目が2つ**見える。横向き1つ目だと途端に「魚」になる
 *   3. クリーム色は腹だけでなく「口の上のマズル〜あご〜のど〜腹」が
 *      **一枚に繋がった大きな面**。これがサメらしい愛嬌の正体
 *   4. 歯は少数の大きな三角。細かい歯列は液晶実寸(scale 0.36〜0.6)で潰れる
 *   5. 線はほぼ黒に近い焦げ茶で非常に太い。塗りより先に「線で形が読める」
 *   6. 背中側に一段濃いオレンジの陰影バンド(セル塗り2段)
 *
 * ■ 実装方針
 *   パーツの輪郭は SVG パス文字列として PATH_SRC に**データとして**持ち、
 *   初回描画時に Path2D へコンパイルして使い回す(arc/quadraticの継ぎ足しをやめた)。
 *   これで「ペンツールで引いた閉じたベジェ」をそのまま座標調整でき、
 *   毎フレームのパス構築コストも消える。
 *
 *   可変なのは口(開閉)・目(視線とまぶた)・ヒレの角度だけで、
 *   それ以外は ctx の変形で動かす(頂点は動かさない = 破綻しない)。
 *
 *   描画順は「奥のヒレ → 体 → 体内クリップの陰影/腹 → 輪郭 → 顔 → 手前のヒレ」。
 *   最後に体シルエットを太線でもう一度なぞり、全パーツを束ねる統一ラインにしている。
 *
 * API は v2 と互換: { x, y, scale, mouthOpen, tailAngle, brow, t, dir, alpha }。
 * pose 名を渡した場合は GEORGE_POSES の値で未指定パラメータを補完する。
 */

export const GEORGE_COLORS = {
  /** 背中側(濃い) */
  bodyDark: '#d9611a',
  /** 基本のオレンジ */
  body: '#f5822a',
  /** 腹寄り(明るい) */
  bodyLight: '#ffa347',
  /** 背中の陰影バンド */
  shade: '#c9500f',
  fin: '#ee7620',
  finDark: '#c2540f',
  /** マズル〜のど〜腹の一枚面 */
  belly: '#fdf2de',
  bellyShade: '#f3ddba',
  /** セル塗り調の太い輪郭(参照絵はほぼ黒に近い焦げ茶) */
  outline: '#2e1206',
  eyeWhite: '#ffffff',
  pupil: '#1a0c04',
  tooth: '#fffdf7',
  mouth: '#8c1f24',
  mouthDeep: '#671017',
  tongue: '#d95a63',
};

/**
 * ポーズ定義。造形は共通で、表情パラメータの差し替えだけで表現する。
 *   mouthOpen : 0=ほぼ閉じ 1=大口
 *   tailAngle : 尾びれの角度(rad)
 *   brow      : 目つき。負=怒り(まぶたが被さる) 正=たれ目(のんき)
 *   gaze      : 黒目の前後オフセット(正で前を見る)
 */
export const GEORGE_POSES = {
  normal: { mouthOpen: 0.14, tailAngle: 0.0, brow: 0.0, gaze: 0.0 },
  grin: { mouthOpen: 0.40, tailAngle: 0.15, brow: -0.16, gaze: 0.6 },
  bite: { mouthOpen: 1.0, tailAngle: 0.35, brow: -0.34, gaze: 1.0 },
  angry: { mouthOpen: 0.55, tailAngle: 0.25, brow: -0.5, gaze: 0.8 },
  chill: { mouthOpen: 0.06, tailAngle: -0.1, brow: 0.14, gaze: -0.4 },
};

/* ────────────────────────────────────────────────────────────
 * パス定義(右向き基準・原点はキャラの重心)
 *
 * 収まり: x -82〜86 / y -70〜58。液晶の定位置(chars/index.js)は
 * この寸法を前提にしているので、大きく変える場合は定位置も見直すこと。
 * ──────────────────────────────────────────────────────────── */

const PATH_SRC = {
  /**
   * 体シルエット。頭は大きく丸いが、尾に向かって一気に絞る。
   * ここが太いままだと「フグ」になり、サメらしさが消える。
   */
  body:
    'M -54 -8 ' +
    'C -46 -32, -16 -50, 12 -51 ' +   // 背中 → 頭頂
    'C 46 -52, 71 -36, 79 -14 ' +     // 前頭部
    'C 84 -4, 82 7, 74 13 ' +         // 吻先の丸み
    'C 72 23, 58 33, 38 38 ' +        // あご下 → のど
    'C 6 46, -30 35, -48 15 ' +       // 腹 → 尾へ絞り込む
    'C -54 9, -58 1, -54 -8 Z',

  /** 背びれ。後ろへ大きく反った三角(前縁を膨らませて厚みを出す) */
  dorsal:
    'M -18 -33 ' +
    'C -16 -54, 2 -76, 38 -74 ' +
    'C 32 -60, 26 -47, 23 -35 Z',

  /** 尾びれ(付け根を原点に描き、tailAngle で回す)。参照と同じ三日月二又 */
  tail:
    'M 8 -6 ' +
    'C -4 -20, -20 -33, -39 -51 ' +   // 上葉の外縁(長い)
    'C -34 -27, -28 -10, -22 -2 ' +   // くびれ
    'C -29 9, -35 23, -39 40 ' +      // 下葉の外縁(短い)
    'C -19 24, -4 10, 8 5 Z',

  /** 奥側の胸びれ(体の陰から覗く) */
  finBack:
    'M 2 -8 C 0 6, -10 21, -27 27 C -29 12, -19 -2, -6 -8 Z',

  /** 手前の胸びれ(参照絵の「腕」に相当。体の上に重ねる) */
  finFront:
    'M 9 -12 C 14 7, 4 26, -18 35 C -27 19, -19 -2, -6 -11 Z',

  /**
   * クリーム面(マズル〜あご〜のど〜腹前半の一枚)。体でクリップして塗る。
   * 前方で口の上まで持ち上がってマズルになるのがこのキャラの肝。
   * 後方(尾側)へ広げすぎると腹が白い餅に見えるので、腹の中ほどで細く消す。
   */
  belly:
    'M -34 20 ' +
    'C -12 38, 18 42, 38 30 ' +       // 腹 → のど
    'C 47 24, 44 6, 49 -2 ' +         // 口角の後ろで立ち上がる
    'C 56 -13, 71 -16, 80 -7 ' +      // マズルの上
    'C 88 -1, 86 10, 80 17 ' +        // 吻先を回り込む
    'C 72 38, 40 52, 2 50 ' +         // ここから下は体の外(クリップで消える)
    'C -22 48, -40 34, -34 20 Z',

  /** クリーム面の境界線(上側だけをなぞる) */
  bellyEdge:
    'M -34 20 C -12 38, 18 42, 38 30 C 47 24, 44 6, 49 -2 ' +
    'C 56 -13, 71 -16, 80 -7',

  /** 背中側の陰影バンド(体でクリップ)。セル塗りらしく2段に見せるための面 */
  shade:
    'M -62 -6 C -30 -34, 2 -46, 32 -42 C 58 -38, 76 -26, 90 -8 ' +
    'L 96 -84 L -62 -84 Z',
};

/** @type {Record<string, Path2D>|null} 初回描画時にコンパイルする */
let PATHS = null;

/**
 * SVGパス文字列 → Path2D。Path2D が無い環境(Node の構文チェック等)では
 * import 時に落ちないよう、描画が始まるまで生成を遅らせている。
 */
function paths() {
  if (!PATHS) {
    PATHS = {};
    for (const key of Object.keys(PATH_SRC)) PATHS[key] = new Path2D(PATH_SRC[key]);
  }
  return PATHS;
}

/** 塗って太線で縁取る(セル塗りの基本操作) */
function ink(ctx, path, fill, width = 5, color = GEORGE_COLORS.outline) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill(path);
  }
  if (width > 0) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke(path);
  }
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {number} state.x
 * @param {number} state.y
 * @param {number} [state.scale=1]
 * @param {string} [state.pose] 指定すると未指定パラメータを GEORGE_POSES で補完する
 * @param {number} [state.mouthOpen=0] 0=閉じ 1=全開
 * @param {number} [state.tailAngle=0] 尾びれの角度(rad)
 * @param {number} [state.brow=0] 目つき(負で怒り顔)
 * @param {number} [state.gaze] 黒目の前後オフセット。省略時は brow から決める
 * @param {number} [state.t=0] 経過秒(遊泳アニメ用)
 * @param {number} [state.dir=1] 1=右向き -1=左向き
 * @param {number} [state.alpha=1]
 */
export function drawGeorge(ctx, state) {
  const preset = GEORGE_POSES[state.pose] ?? null;
  const {
    x, y, scale = 1, t = 0, dir = 1, alpha = 1,
    mouthOpen = preset?.mouthOpen ?? 0,
    tailAngle = preset?.tailAngle ?? 0,
    brow = preset?.brow ?? 0,
  } = state;
  if (alpha <= 0) return;

  const C = GEORGE_COLORS;
  const P = paths();
  const open = clamp01(mouthOpen);
  // 視線: 明示指定 > ポーズ既定 > 目つきから推定(怒っているほど前を睨む)
  const gaze = state.gaze ?? preset?.gaze ?? clamp01(-brow * 2) * 0.8;

  const swim = Math.sin(t * 2.2) * 4;          // 上下の遊泳(画面px)
  const bodyWave = Math.sin(t * 3.4) * 0.055;  // 体のうねり

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y + swim);
  ctx.scale(scale * dir, scale);
  ctx.rotate(bodyWave);
  // 大口を開けるほど前へ伸び上がる(噛みつきの溜め)
  const lunge = open * 0.05;
  ctx.scale(1 + lunge, 1 - lunge * 0.7);

  drawTail(ctx, C, P, tailAngle + Math.sin(t * 3.4) * 0.12);
  drawDorsal(ctx, C, P);
  drawFinBack(ctx, C, P, t);
  drawBodyFill(ctx, C, P);
  drawGills(ctx, C);
  // 統一アウトライン: ヒレとの継ぎ目の上から体の輪郭を引き直して束ねる。
  // 口(下あご)は体の輪郭を割って下がるので、必ずこの線より後に描く
  ink(ctx, P.body, null, 6);
  drawMouth(ctx, C, open);
  drawNostril(ctx, C);
  drawEyes(ctx, C, brow, gaze, t);
  drawFinFront(ctx, C, P, t, open);

  ctx.restore();
}

/** 体の塗り + 背中の陰影 + クリーム面(すべて体の内側にクリップ) */
function drawBodyFill(ctx, C, P) {
  const g = ctx.createLinearGradient(0, -52, 0, 46);
  g.addColorStop(0, C.bodyDark);
  g.addColorStop(0.4, C.body);
  g.addColorStop(1, C.bodyLight);
  ink(ctx, P.body, g, 6);

  ctx.save();
  ctx.clip(P.body);

  // 背中側の一段濃いバンド(セル塗り2段)
  ctx.fillStyle = C.shade;
  ctx.globalAlpha *= 0.72;
  ctx.fill(P.shade);
  ctx.globalAlpha /= 0.72;

  // マズル〜のど〜腹のクリーム面
  const bg = ctx.createLinearGradient(0, -18, 0, 44);
  bg.addColorStop(0, C.belly);
  bg.addColorStop(1, C.bellyShade);
  ctx.fillStyle = bg;
  ctx.fill(P.belly);

  // クリーム面の縁(太すぎない仕切り線)
  ctx.strokeStyle = 'rgba(46,18,6,0.4)';
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(P.bellyEdge);

  // 背中の照り。一枚絵らしい丸みはこの1本のハイライトで決まる
  ctx.save();
  ctx.translate(16, -38);
  ctx.rotate(-0.22);
  ctx.beginPath();
  ctx.ellipse(0, 0, 32, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/** 背びれ */
function drawDorsal(ctx, C, P) {
  ink(ctx, P.dorsal, C.fin, 5.5);
}

/** 尾びれ(付け根を軸に振る) */
function drawTail(ctx, C, P, angle) {
  ctx.save();
  ctx.translate(-52, 4);
  ctx.rotate(angle);
  ink(ctx, P.tail, C.fin, 5.5);
  ctx.restore();
}

/** 奥側の胸びれ */
function drawFinBack(ctx, C, P, t) {
  ctx.save();
  ctx.translate(-4, 20);
  ctx.rotate(Math.sin(t * 3) * 0.1 + 0.42);
  ink(ctx, P.finBack, C.finDark, 4.5);
  ctx.restore();
}

/** 手前の胸びれ(口を開けるほど大きく振り上げる) */
function drawFinFront(ctx, C, P, t, open) {
  ctx.save();
  ctx.translate(4, 27);
  ctx.rotate(Math.sin(t * 3) * 0.16 + 0.62 - open * 0.3);
  ink(ctx, P.finFront, C.fin, 5.5);
  ctx.restore();
}

/**
 * エラ(頭の後ろに3本)。
 * 体の中央まで伸ばすと「魚の縞模様」に見えてしまうので、
 * 頭の直後に短く、後ろへ行くほど小さくする。
 */
function drawGills(ctx, C) {
  ctx.save();
  ctx.strokeStyle = 'rgba(46,18,6,0.32)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const gx = -2 - i * 9;
    const half = 10 - i * 2;
    ctx.lineWidth = 3 - i * 0.5;
    ctx.beginPath();
    ctx.moveTo(gx, -half - 12);
    ctx.quadraticCurveTo(gx - 4, -10, gx, half - 10);
    ctx.stroke();
  }
  ctx.restore();
}

/** 鼻孔 */
function drawNostril(ctx, C) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(74, -16, 2.6, 1.9, -0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(46,18,6,0.6)';
  ctx.fill();
  ctx.restore();
}

/* ── 口 ───────────────────────────────────────────── */

/** 三次ベジエ上の点 */
function cPoint(p, s) {
  const u = 1 - s;
  return {
    x: u * u * u * p[0] + 3 * u * u * s * p[2] + 3 * u * s * s * p[4] + s * s * s * p[6],
    y: u * u * u * p[1] + 3 * u * u * s * p[3] + 3 * u * s * s * p[5] + s * s * s * p[7],
  };
}

/** 三次ベジエの接線角 */
function cAngle(p, s) {
  const u = 1 - s;
  const dx = 3 * u * u * (p[2] - p[0]) + 6 * u * s * (p[4] - p[2]) + 3 * s * s * (p[6] - p[4]);
  const dy = 3 * u * u * (p[3] - p[1]) + 6 * u * s * (p[5] - p[3]) + 3 * s * s * (p[7] - p[5]);
  return Math.atan2(dy, dx);
}

/**
 * 口。上あご(歯の付け根)のラインは固定で、下あごだけ open で下がる。
 *
 * 参照絵と同じく「閉じていても上の歯が覗く」ようにしてある。
 * 大きく開けた下あごは体のシルエットを割って下へ出る。そのままだと
 * 顎の肉が無くて口だけ浮くので、下あごのラインに沿って
 * 「縁取り付きのクリーム色の帯(=下あご)」を先に敷いてから口内を重ねている。
 */
function drawMouth(ctx, C, open) {
  // 閉じ切っても口内に隙間を残す。参照絵のサメは常に歯が覗いていて、
  // 「口を一文字に閉じたサメ」は途端に生気が無くなる
  const jaw = 5 + 25 * open;

  // 上あご: 口角(後ろ) → 吻先の下。笑って下に膨らむ弧
  const upper = [10, -5, 32, 9, 55, 15, 76, 3];
  // 下あご: 吻先の下 → 口角。open で下へ開く
  const lower = [76, 3, 64, 11 + jaw * 0.8, 38, 21 + jaw, 10, -5];

  const jawLine = new Path2D();
  jawLine.moveTo(lower[0], lower[1]);
  jawLine.bezierCurveTo(lower[2], lower[3], lower[4], lower[5], lower[6], lower[7]);

  const cavity = new Path2D();
  cavity.moveTo(upper[0], upper[1]);
  cavity.bezierCurveTo(upper[2], upper[3], upper[4], upper[5], upper[6], upper[7]);
  cavity.bezierCurveTo(lower[2], lower[3], lower[4], lower[5], lower[6], lower[7]);
  cavity.closePath();

  // 下あご(縁取り付きのクリーム帯)。口内を重ねると外側半分だけが残る。
  // 閉じているときに太いと「白いバナナ」になるので、開くほど厚くする
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const jw = 6 + 7 * open;
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = jw + 5.5;
  ctx.stroke(jawLine);
  ctx.strokeStyle = C.belly;
  ctx.lineWidth = jw;
  ctx.stroke(jawLine);
  ctx.restore();

  // 口内(奥ほど暗い)
  const mg = ctx.createLinearGradient(0, -4, 0, 26 + jaw);
  mg.addColorStop(0, C.mouthDeep);
  mg.addColorStop(1, C.mouth);
  ink(ctx, cavity, mg, 5);

  // 舌(大きく開けたときだけ)
  if (open > 0.3) {
    ctx.save();
    ctx.clip(cavity);
    ctx.beginPath();
    ctx.ellipse(40, 17 + jaw * 0.68, 19, 8 + jaw * 0.2, 0.06, 0, Math.PI * 2);
    ctx.fillStyle = C.tongue;
    ctx.fill();
    ctx.restore();
  }

  // 歯: 少数の大きな三角(液晶実寸で潰れないサイズ)
  ctx.save();
  ctx.fillStyle = C.tooth;
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.clip(cavity);   // 歯は口の中だけに出す = 輪郭からはみ出さない
  tooth(ctx, upper, 4, 1, 0.08, 0.94, 6.8, 11.5);
  tooth(ctx, lower, 3, 1, 0.14, 0.88, 6, 10);
  ctx.restore();

  // 口角のくぼみ(ニカッと笑った口の端)
  ctx.save();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(10, -5);
  ctx.quadraticCurveTo(7, -9, 6, -14);
  ctx.stroke();
  ctx.restore();
}

/**
 * ベジエ曲線に沿って三角の歯を生やす。
 * 進行方向に対して法線側(sign)へ倒すので、上下どちらのあごでも同じ関数で描ける。
 */
function tooth(ctx, p, count, sign, from, to, halfW, height) {
  for (let i = 0; i < count; i++) {
    const s = from + ((to - from) * (i + 0.5)) / count;
    const pt = cPoint(p, s);
    const a = cAngle(p, s);
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-halfW, 0);
    ctx.lineTo(halfW, 0);
    ctx.lineTo(0, height * sign);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/* ── 目 ───────────────────────────────────────────── */

/** 目の配置(3/4向き)。手前=前寄りで大きく、奥=後ろ上で小さく */
const EYES = [
  { x: 28, y: -32, r: 10, back: true },
  { x: 54, y: -28, r: 13.5, back: false },
];

/**
 * 目。白目 → 黒目 → ハイライト2点 → まぶた の順。
 * まぶたは白目の円でクリップして被せるので、どんな角度でも輪郭を割らない。
 */
function drawEyes(ctx, C, brow, gaze, t) {
  // まばたき(たまに閉じる)。0=開 1=閉
  const blink = blinkAmount(t);

  for (const e of EYES) {
    const eye = new Path2D();
    eye.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ink(ctx, eye, C.eyeWhite, e.back ? 4 : 4.6);

    const pr = e.r * 0.5;
    const px = e.x + e.r * 0.26 * (0.3 + gaze);
    const py = e.y + e.r * 0.06;

    ctx.save();
    ctx.clip(eye);

    // 黒目
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = C.pupil;
    ctx.fill();
    // ハイライト(大きい方を上前に、小さい方を下後ろに)
    ctx.beginPath();
    ctx.arc(px - pr * 0.42, py - pr * 0.52, pr * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px + pr * 0.5, py + pr * 0.55, pr * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();

    // まぶた/眉。brow が負ほど深く被さって鋭い目つきになる。
    // 常にわずかに被せておくと真ん丸のカエル目にならず、顔が締まる
    const lid = Math.max(blink, 0.12 + clamp01(-brow * 1.3) * 0.5);
    if (lid > 0.001 || brow > 0) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(brow * 0.55);
      const drop = -e.r + (e.r * 2.05) * lid;
      ctx.beginPath();
      ctx.moveTo(-e.r * 1.6, -e.r * 1.8);
      ctx.lineTo(e.r * 1.6, -e.r * 1.8);
      ctx.lineTo(e.r * 1.6, drop);
      ctx.quadraticCurveTo(0, drop - e.r * 0.34, -e.r * 1.6, drop - e.r * 0.1);
      ctx.closePath();
      ctx.fillStyle = C.bodyDark;
      ctx.fill();
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // まぶたを被せたあと、目の輪郭を引き直して線を締める
    ink(ctx, eye, null, e.back ? 4 : 4.6);
  }
}

/**
 * まばたき: 約4.2秒周期で 0.12 秒だけ閉じる。
 * 生きている感じを出すためだけの味付けなので、他のパラメータには影響しない。
 */
function blinkAmount(t) {
  const period = 4.2;
  const phase = ((t % period) + period) % period;
  if (phase > 0.16) return 0;
  return Math.sin((phase / 0.16) * Math.PI);
}

/* ── 予告演出用 ───────────────────────────────────── */

/** 尾びれチラ見せ予告用(画面下からヒレだけ)。IDEAS.md 2-15 */
export function drawGeorgeFin(ctx, { x, y, scale = 1, t = 0, alpha = 1 }) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + Math.sin(t * 1.6) * 14, y);
  ctx.scale(scale, scale);
  ctx.rotate(Math.sin(t * 3) * 0.1);
  // 体の背びれと同じ「前縁が膨らんで後ろへ反る」形
  const fin = new Path2D(
    'M -30 36 C -16 14, -4 -14, 4 -46 C 18 -12, 28 12, 36 36 C 12 27, -8 27, -30 36 Z',
  );
  ink(ctx, fin, GEORGE_COLORS.fin, 5.5);
  ctx.restore();
}
