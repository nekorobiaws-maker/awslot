/**
 * ギミック予告用の追加LCDアニメーション(担当D)。
 *
 * 既存の lcdanims.js の LCD_ANIMS と完全に同じシグネチャで定義する:
 *   { layer: 'bg'|'fg'|'ui', ms: number, draw(ctx, p, params, w, h) }
 *   p は 0→1 の進行度。
 *
 * このファイルはトップレベルで window/document を触らない。
 * import は data/(演出データ)への一方向だけに限る。data/quiz.js のように
 * 「文言や出題を差し替えるだけ」のものはデータ側へ置き、描き方だけをここに書く。
 * 統合担当が lcdanims.js 側で
 *   import { LCD_ANIMS_EXTRA } from './lcdanims-extra.js';
 *   Object.assign(LCD_ANIMS, LCD_ANIMS_EXTRA);
 * のようにマージすると lcd.anim から呼べるようになる。
 *
 * 座標の前提(液晶は 440 x 300):
 *   - y 0〜34   … タイトルバー(モード名 / 残りG)…… 使わない
 *   - y 266〜300 … 盤面のルール行(旧テロップ帯の跡地)… 使わない
 *   - lcd.text は (220, 194) にメイン、(220, 220) にサブが出る(lcdanims.js の _drawText)。
 *     y 178〜230 の中央帯はテキストと取り合いになるので、文字を置くなら避ける。
 *   - AS_RUSH は y 74〜108 に DC アイコン列、中央 y 136 に「DC n」、y 159〜173 に
 *     「純増◯枚/G 継続◯%」、右端 x 340〜430 に SET/枚/STOCK がある。
 *     RUSH 中に出すアニメは左下(x 70〜200 / y 176〜232)か最下段の帯に置く。
 */

import { buildQuizRound, buildReelQuizRound, pickTrivia } from '../../data/quiz.js';
import { categoryOfService, resolveServiceByQuizAnswer } from '../../data/services.js';
import { getDexProgress, isLearnEnabled, recordServiceSeen } from '../../data/learnlog.js';
import { SYMBOLS } from '../../data/symbols.js';
import { symbolAssets } from '../../engine/assets.js';

const FONT = '"Helvetica Neue", "Hiragino Sans", "Noto Sans JP", sans-serif';
const FONT_HEAVY = '"Arial Black", "Helvetica Neue", "Hiragino Sans", sans-serif';
const FONT_MONO = '"SFMono-Regular", Consolas, "Courier New", monospace';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const easeOutBack = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
const easeOutCubic = (x) => 1 - (1 - x) ** 3;
/** 減速の効きが強いイージング。ルーレットが「じわっ」と止まるのに使う */
const easeOutQuart = (x) => 1 - (1 - x) ** 4;

/** 出だしでふわっと出して、終わり際に薄く消す共通の見せ方 */
const fadeInOut = (p, inP = 0.12, outP = 0.84) =>
  Math.min(1, p / inP) * (p > outP ? Math.max(0, 1 - (p - outP) / (1 - outP)) : 1);

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

/** 縁取り付きの中央寄せテキスト(小物ラベル用) */
function strokedText(ctx, text, x, y, { size = 14, color = '#ffffff', edge = 'rgba(0,0,0,0.8)', align = 'center', heavy = true } = {}) {
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = `${heavy ? 900 : 700} ${size}px ${heavy ? FONT_HEAVY : FONT}`;
  ctx.lineWidth = Math.max(3, size * 0.32);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = edge;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/**
 * 文字の下へ黒い座布団を敷く(2026-08-15 検証 V31-08)。
 *
 * ステージ背景が明るい絵(assets/ui/stage_*.png)に差し替わってから、
 * 縁取りだけの小さな文字が絵に溶けて読めない場面が出てきた
 * (例: CloudFormation 予告の「DEPLOYING 9%」)。
 * 文字を大きくすると画が煩くなるので、**下地を敷いて明度差を作る**。
 *
 * strokedText の直前に同じ座標・同じサイズで呼ぶこと。
 * 幅は textWidth() で測るので、日本語混じりでもだいたい合う。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text 敷きたい文字(幅の計算にだけ使う)
 * @param {number} x strokedText へ渡すのと同じX
 * @param {number} y strokedText へ渡すのと同じY(中央基準)
 * @param {object} opt
 * @param {number} [opt.size] フォントサイズ(strokedText と揃える)
 * @param {'center'|'left'|'right'} [opt.align]
 * @param {boolean} [opt.heavy] strokedText と揃える
 * @param {number} [opt.padX] 左右の余白
 * @param {string} [opt.fill] 座布団の色
 */
/**
 * この描画パスで既に敷いた座布団の矩形(2026-08-15 検証指摘 F19)。
 *
 * 同じフレームに2つの演出が走ると座布団どうしが重なり、
 * 下側が半分隠れて中途半端に見えることがあった
 * (「未観測 / まだ確定していない」の下に「DEPLOYING 45%」が潜り込む等)。
 * 敷いた場所を覚えておき、重なるときは後から来たほうを縦にずらす。
 * @type {{x0:number,y0:number,x1:number,y1:number}[]}
 */
const PLATE_RECTS = [];

/** 1回の描画パスの始まり(LcdAnims.draw が層ごとに呼ぶ)。座布団の記録を捨てる */
export function beginPlateFrame() {
  PLATE_RECTS.length = 0;
}

/** 2つの矩形が重なるか(辺が触れるだけは重なりとみなさない) */
function rectsOverlap(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function textPlate(ctx, text, x, y, {
  size = 13, align = 'center', heavy = true, padX = 7, fill = 'rgba(0,8,20,0.72)',
} = {}) {
  if (!text) return y;
  ctx.save();
  ctx.font = `${heavy ? 900 : 700} ${size}px ${heavy ? FONT_HEAVY : FONT}`;
  const tw = textWidth(ctx, String(text), size);
  const pw = tw + padX * 2;
  const ph = size + 8;
  const px = align === 'left' ? x - padX : align === 'right' ? x - pw + padX : x - pw / 2;

  /*
   * 重なりを避けて置き直す。ずらすのは **後から来たほう**(先に置いた演出の
   * 読みやすさを壊さない)。何度もずらすと元の意味の場所から離れてしまうので、
   * 下へ1回・上へ1回だけ試し、それでも空かなければ諦めて元の位置に敷く
   * (重なるより、消えて読めないほうが悪い)。
   */
  let py = y;
  for (const dy of [0, ph + 2, -(ph + 2)]) {
    const cand = { x0: px, y0: y + dy - ph / 2, x1: px + pw, y1: y + dy + ph / 2 };
    if (!PLATE_RECTS.some((r) => rectsOverlap(cand, r))) { py = y + dy; break; }
  }
  PLATE_RECTS.push({ x0: px, y0: py - ph / 2, x1: px + pw, y1: py + ph / 2 });

  roundRect(ctx, px, py - ph / 2, pw, ph, Math.min(7, ph / 2));
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  // 呼び出し側は **この戻り値のYへ文字を描く**(座布団と文字がズレないように)
  return py;
}

/**
 * 大文字の告知を「奥から叩きつける」(U31 / U41 の共通言語)。
 *
 * 全画面カットインの drawSlamText(staging/anims/cutins-extra.js)の液晶版。
 * 液晶は 440×300 しかないので、**必ず maxWidth に収まるまでフォントを詰めてから**
 * 倍率を掛ける(はみ出した文字は読めない = 演出として失敗)。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} t 0→1 の進行度。0.42 付近で着弾する
 * @param {object} opt
 * @param {number} opt.maxWidth
 * @param {number} [opt.size] 着弾後のフォントサイズ
 * @param {[string,string]} [opt.colors] グラデーション [外, 中]
 * @param {string} [opt.edge] 縁取りの色
 */
function slamHeadline(ctx, text, x, y, t, {
  maxWidth = 380, size = 40, colors = ['#ffffff', '#ffe066'], edge = 'rgba(8,10,20,0.95)',
} = {}) {
  if (t <= 0) return;
  const e = 1 - (1 - clamp01(t)) ** 5;              // easeOutQuint(減速がきつい)
  const land = clamp01((t - 0.42) / 0.18);
  const squash = t < 0.42 ? 1 : 1 + Math.sin(land * Math.PI) * 0.16;

  ctx.save();
  ctx.globalAlpha *= Math.min(1, t * 5);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 収まるまで詰める(measureText の無い環境では既定サイズのまま)
  let fs = size;
  ctx.font = `900 ${fs}px ${FONT_HEAVY}`;
  while (fs > 16 && textWidth(ctx, text, fs) > maxWidth) {
    fs -= 2;
    ctx.font = `900 ${fs}px ${FONT_HEAVY}`;
  }

  ctx.translate(x, y);
  // 上限は「詰めたサイズで maxWidth に収まる倍率」。そこから等倍へ落ちてくる
  const tw = Math.max(1, textWidth(ctx, text, fs));
  const maxScale = Math.max(1, maxWidth / tw);
  const scale = Math.min(1 + (1 - e) * 1.8, maxScale);
  ctx.scale(scale * squash, scale / squash);

  if (t > 0.42) {
    ctx.shadowColor = colors[1];
    ctx.shadowBlur = 18 + Math.sin(t * 26) * 10;
  }
  ctx.lineWidth = Math.max(6, fs * 0.24);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = edge;
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

/**
 * いま設定されているフォントでの文字幅。
 * measureText を持たない描画コンテキスト(検証ハーネスのスタブ)では
 * 半角0.6文字ぶん / 全角1文字ぶんで概算する(レイアウトが壊れないだけでよい)。
 */
function textWidth(ctx, text, size) {
  if (typeof ctx.measureText === 'function') {
    const m = ctx.measureText(text);
    if (m && Number.isFinite(m.width)) return m.width;
  }
  let units = 0;
  for (const ch of String(text)) units += ch.charCodeAt(0) < 0x100 ? 0.6 : 1;
  return units * size;
}

/**
 * 等幅フォントの小さな1行(コンソール風の情報表示に使う)。
 * strokedText と違い左寄せ既定・太字なしで、ログらしい見た目にする。
 */
function monoText(ctx, text, x, y, { size = 9, color = '#ffffff', align = 'left', alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= clamp01(alpha);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size}px ${FONT_MONO}`;
  ctx.lineWidth = Math.max(2.4, size * 0.3);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,10,30,0.9)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  // 幅は restore の前(= 等幅フォントが載っている状態)で測る
  const width = textWidth(ctx, text, size);
  ctx.restore();
  return width;
}

/**
 * 幅 maxW に収まる最大のフォントサイズを返し、ctx.font もそこへ合わせる。
 * 液晶は 440px しかないので、日本語の問題文やサービス名がはみ出すと一気に読めなくなる。
 * 縮めても min を下回らせない(読めない大きさにするくらいなら多少はみ出させる)。
 */
function fitFont(ctx, text, maxW, { max = 15, min = 10, heavy = true } = {}) {
  const family = heavy ? FONT_HEAVY : FONT;
  const weight = heavy ? 900 : 700;
  let size = max;
  ctx.font = `${weight} ${size}px ${family}`;
  // measureText を持たない描画コンテキスト(テスト用スタブ)では縮小せずそのまま返す
  if (typeof ctx.measureText !== 'function') return size;
  while (size > min && ctx.measureText(text).width > maxW) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

/** 期待度レベル(0=弱 / 1=中 / 2=強)の共通配色 */
const LEVEL_COLORS = ['#e8f1ff', '#ffe066', '#ff5a5a'];

/* ══ AWSクイズルーレット【休止中・データは保全】═══════════════
 *
 * ── 2026-08-15 U53(ユーザー指示)────────────────────────────
 *   クイズの出題は取りやめ、同じ発生枠を「最初に止めるリール」3択
 *   (下の reel_pick_choice)へ置き換えた。
 *   **盤面の描画(aws_quiz_roulette)と 46問のデータ(src/data/quiz.js)は
 *     消さずに残してある**(改修を大きくしない方針 / 復帰できるように)。
 *   いま aws_quiz_roulette を再生するシナリオは1本も無い。戻すときは
 *   data/scenarios/quiz.js に旧シナリオを書き戻すだけでよい(この下は無改造)。
 *
 * 出題データは src/data/quiz.js。ここは「どう見せるか」だけを持つ。
 * 正解に止めるか誤答に止めるかは params.correct で外(シナリオ)から渡ってくる。
 *
 * ■ 進行はリール停止と完全同期(フェーズ駆動)
 *   ユーザー要望「ボタンを止めるたびに進行するようにしたい」への対応。
 *   時間で勝手に進むのをやめ、シナリオの waitFor キューが params.phase を
 *   進めることでだけ状態が変わる:
 *     'start'  出題。4択は出るがルーレットは止まったまま(第1停止を待つ)
 *     'spin'   等速で回り続ける。プレイヤーが次を押すまで何秒でも回ってよい
 *     'lock'   約1.1秒かけて減速 → 停止。**正解/不正解はまだ伏せる**。
 *              止まったマスが点滅し続けて第3停止を待つ
 *     'reveal' ○ / ✕ の判定発表
 *
 * ■ フェーズをまたいで状態を持ち回る
 *   phase ごとに lcd.anim が再生し直されるため、出題内容と回転位置は
 *   モジュール側(quizActive)に置いて読み継ぐ。'start' で作り直す。
 *   回転量は「経過ミリ秒」から出す。ms を長く取って待ち時間に耐えつつ、
 *   回転速度と点滅周期が ms の長さに引きずられないようにするため。
 */

/** 2×2 のマス目をルーレットが回る順(時計回り: 左上→右上→右下→左下) */
const QUIZ_SPIN_ORDER = [0, 1, 3, 2];

/** 回転中の1マスあたりの滞在時間[ms]。大きいほどゆっくり回る */
const QUIZ_SPIN_STEP_MS = 170;

/** 第2停止を受けてから止まりきるまでの時間[ms] */
const QUIZ_LOCK_MS = 1100;

/** 減速中に最低これだけはマスを進む(その場で急停止させないため) */
const QUIZ_LOCK_MIN_STEPS = 6;

/** 停止操作を待つフェーズの既定尺[ms]。プレイヤーが長考しても消えない長さ */
const QUIZ_WAIT_MS = 20000;

/* ── 盤面の縦レイアウト ───────────────────────────────
 * 2026-08-14 ユーザー指摘 U15「選択肢の幅をもうちょっと縦に広くしてほしい」。
 *
 * 液晶 440×300 の縦の取り合いはこうなっている:
 *   y   3〜  5  盤面の枠線
 *   y   8〜 34  問題文プレート
 *   y  36〜166  選択肢 2×2(ここを広げたい)
 *   y 152〜236  lcd.text の告知プレート ★ここは文字を置かない
 *   y 250       進行ラベル(CORRECT!! など。プレートの下)
 *   y 260〜294  盤面の足元(見出しを置く)
 *
 * ★の帯は LcdAnims が盤面より後に描くので、文字を置くと必ず隠れる。
 * プレートの上端は _drawText の「中央 h/2+44 − 本文の高さ/2 − 12」で決まり、
 * クイズが自分で出す告知(CZ突入 / 不正解… = メイン1行 + サブ1行)だと y152。
 *
 * そこで縦を稼ぐために、
 *   - 見出し(AWS QUIZ / どのサービス?)を上から足元 y278 へ逃がす(上を約22px 解放)
 *   - 問題文プレートを y24→y8 へ上げ、高さも 28→26 へ詰める
 * ことで、マスの高さを 50 → 62(1.24倍)、グリッド全体を 106 → 130px にした。
 * **下段マスの中心は y135**。22px のサービス名(縁取り込みで ±14px)を置いても
 * 下端 y149 で収まり、告知プレート y152 に潜らない。
 * マスの下辺 y166 は帯の手前まで伸びるが、そこは枠線だけなので隠れてよい。
 * 動かすときは「下段マスの中心 + 15 ≦ 152」を必ず守ること。
 */
/** 左右の余白 */
const QUIZ_PAD_X = 12;
/** 左右のマスの間隔 */
const QUIZ_COL_GAP = 8;
/** 問題文プレートの上端と高さ(U15 で y24/h28 → y8/h26) */
const QUIZ_Q_TOP = 8;
const QUIZ_Q_H = 26;
/** 選択肢グリッドの上端(U15 で 58 → 36) */
const QUIZ_GRID_TOP = 36;
/** 選択肢1マスの高さ(U15 で 50 → 62) */
const QUIZ_CELL_H = 62;
/** 選択肢の行間 */
const QUIZ_ROW_GAP = 6;
/** 進行バーの位置(告知プレートの裏に回ってよい装飾) */
const QUIZ_BAR_Y = 182;
/** 進行ラベル(CORRECT!! など)の位置 */
const QUIZ_LABEL_Y = 250;
/** 見出しを置く足元の位置 */
const QUIZ_HEAD_Y = 278;

/* ── 縮小表示(V3: CZ盤面の上に出すとき)────────────────────
 * 盤面 440×300 を 0.74 倍(326×222)にして上へ寄せる。
 * 液晶の下側 y226〜300 が空くので、CZ の結論の1行(y246)とテロップ帯(y266〜)が
 * クイズの裏で読める。文字が小さくなりすぎない下限として 0.74 を選んだ
 * (問題文 19px → 14px / 選択肢 22px → 16px)。 */
const QUIZ_COMPACT_SCALE = 0.74;
/** 縮小盤面の上端 */
const QUIZ_COMPACT_TOP = 2;

/**
 * 進行中のクイズ。'start' で作り直し、以降のフェーズが読み継ぐ。
 * @type {{round:object, traveled:number, lockFrom:number|null, lockTo:number|null, revealFrom:number|null}|null}
 */
let quizActive = null;

/**
 * この再生で使うクイズ状態を返す。
 * draw() は毎フレーム呼ばれるので、params 側にも覚えさせて引き直しを防ぐ。
 * timeline.js の resolveParams はキュー発火ごとに新しいオブジェクトを作るため、
 * params のキャッシュが別の再生へ漏れることはない。
 */
function quizStateOf(params) {
  if (params.__q) return params.__q;
  const phase = params.phase ?? 'start';
  if (phase === 'start' || quizActive == null) {
    quizActive = {
      round: buildQuizRound({
        correct: Boolean(params.correct),
        quizId: params.quizId ?? null,
      }),
      traveled: 0,
      lockFrom: null,
      lockTo: null,
      revealFrom: null,
    };
  }
  params.__q = quizActive;
  return quizActive;
}

/**
 * 着地点(何マス目で止まるか)を決める。
 *
 * いま回っている位置から最低 QUIZ_LOCK_MIN_STEPS 進んだ先で、
 * 目的のマスに一致する最初の位置を選ぶ。第2停止を押した瞬間の位置に
 * 依存せず、必ず「少し回ってから止まる」動きになる。
 *
 * 高速連打で lock フェーズが描画されないまま reveal が来ても破綻しないよう、
 * reveal 側からも同じ関数で着地点を確定できるようにしてある。
 */
/* ══ AWS豆知識カード(2026-08-15 ユーザー指示 U59)════════════════════
 *
 * ボーナス中の**1ゲームおき**に「サービス名 + 1行概要」を1枚のカードで出す。
 * 盤面は休止中の aws_quiz_roulette を **1枚のカードへ簡略化して流用**したもの
 * (枠 → 見出し → 大きい文字 → 小さい文字、という縦の組み立てをそのまま使っている)。
 *
 * ■ 置き場所(U8: ボーナスの数値と絶対に重ねない)
 *   render/lcd.js の _drawBonus は、テキスト帯が出ていないとき
 *     y 79〜125 大ロゴ / y162 獲得枚数 / y190 残りG / y214 ベル説明 / y238 SET
 *   を描く。**カードは y38〜146 に収めて、y150 より下へ1pxも出さない**。
 *   = 獲得枚数・残りG・SET は必ず読める。
 *
 *   ── 大ロゴとの重なり(2026-08-15 ユーザー指示 U64-8 で解消)──────────
 *   以前は大ロゴ(y79〜125)がカードの真下に潜って重なっていた。
 *   いまは render/lcd.js の _drawBonus が **カード再生中だけ**(anims.isPlaying)
 *   ロゴを 16px へ縮めてヘッダ帯(y17)へ逃がすので、ロゴもカードも両方読める。
 *   **座標を動かすときは「カードの下端 ≦ 148」を必ず守ること**
 *   (_drawBonus 側のコメントとセットで見ること)。
 *
 * ■ 座布団(V31-08)
 *   カードの地そのものが不透明の下敷きなので、文字はその上に置けば必ず読める。
 *   textPlate() は使わない(重なり回避で文字がカードの外へ逃げてしまうため)。
 *
 * ■ どのカードを出すか
 *   data/quiz.js の pickTrivia()。**ゲーム抽選RNGは使わない**(Math.random)。
 *   再生1回につき1枚だけ引き、params へ控えて毎フレーム引き直さない。
 */

/** カードの矩形(x, y, w, h)。下端 = 38 + 108 = 146 ≦ 148 */
const TRIVIA_CARD = { x: 20, y: 38, w: 400, h: 108 };

/**
 * 小さな丸ピル(カテゴリ / NEW)。2026-08-15 学習強化 L3。
 *
 * カードの地(不透明)の上にしか置かないので座布団(textPlate)は使わない。
 * 文字はピルの中央に置き、**戻り値の幅**で次のピルの置き場所を決められるようにする。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x align='left' なら左端 / 'right' なら右端のX
 * @param {number} y 中心Y
 * @param {string} text
 * @param {object} [opt]
 * @param {number} [opt.size] 文字サイズ(11 前後。これ以上小さくすると読めない)
 * @param {string} [opt.color] 枠と文字の色
 * @param {'left'|'right'} [opt.align]
 * @returns {number} ピルの幅
 */
function drawPill(ctx, x, y, text, { size = 11, color = '#7cf3ff', align = 'left' } = {}) {
  ctx.save();
  ctx.font = `700 ${size}px ${FONT}`;
  const pw = textWidth(ctx, text, size) + 12;
  const ph = size + 6;
  const px = align === 'right' ? x - pw : x;
  roundRect(ctx, px, y - ph / 2, pw, ph, ph / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  strokedText(ctx, text, px + pw / 2, y, {
    size, color, edge: 'rgba(0,10,30,0.9)', heavy: false,
  });
  ctx.restore();
  return pw;
}

/**
 * この再生で見せる豆知識を1枚決める。
 * quizStateOf と同じ作法で params にキャッシュする
 * (timeline.js の resolveParams はキュー発火ごとに新しいオブジェクトを作るので、
 *  別の再生へ漏れることはない)。
 *
 * ══ AWS図鑑への記録を「ここ」に置く理由(2026-08-15 学習強化 L1)══════
 * ■ なぜ pickTrivia ではないのか
 *   pickTrivia は「1枚引く」だけの純粋なデータ関数で、テストからも呼ばれる。
 *   **引いた = 画面に出した** という意味付けを持つのは演出側なので、
 *   副作用(記録)はこちらの層に置くのが正しい。
 * ■ なぜ1再生につき1回で済むのか
 *   triviaStateOf は ANIM_HEADLINES(play時に1回)と draw(毎フレーム)の
 *   両方から呼ばれるが、**params.__t のキャッシュにより pickTrivia も記録も
 *   1再生につき1回しか走らない**。
 *   dismiss:true の再生は triviaHeadlineOf が早期 return し、draw も先頭で
 *   return するのでここへ来ない = 二重計上しない。
 * ■ なぜ別キューから記録できないのか
 *   engine/timeline.js の resolveParams はキューごとに別オブジェクトを作るため、
 *   **どのカードが引かれたかを他のキューは知り得ない**。
 *
 * 戻り値には図鑑の初出フラグ(first)と進捗(dex)を足して params へ控える。
 * NEW バッジもカウンタも draw で毎フレーム引き直さないため。
 *
 * ■ 図鑑の進捗をここで確定させる理由(2026-08-15 椿レビュー minor)
 *   getDexProgress() は保存済みの全サービスを毎回数え直す(learnlog の ownedCount)。
 *   draw から呼ぶと **60fps × カード表示20秒 = 1枚あたり最大1200回**の数え直しになる。
 *   数字が要るのは「このカードを出した瞬間の進捗」だけで、
 *   直前の recordServiceSeen を織り込んだ値がここで確定している
 *   (カード表示中に他所で図鑑が増えることはない = 豆知識カードは
 *    ボーナス中に1枚ずつしか出ず、クイズの記録は道中でしか走らない)。
 *   よって1再生1回で足りる。
 */
function triviaStateOf(params) {
  if (params.__t) return params.__t;
  const picked = pickTrivia({ service: params.service ?? null });
  const { first } = recordServiceSeen(picked.service, 'trivia');
  // 元データ(AWS_TRIVIA の要素)は書き換えず、この再生ぶんの控えを作る
  const state = { ...picked, first, dex: getDexProgress() };
  // eslint-disable-next-line no-param-reassign
  params.__t = state;
  return state;
}

/**
 * このカードが液晶に大きく出している文言(U8 の二重表示防止の申告)。
 *
 * staging/anims/lcdanims.js の ANIM_HEADLINES から呼ばれる。
 * ANIM_HEADLINES は **play() の時点** で評価されるので、ここで初めて
 * カードの中身が決まる(draw は params.__t を読み継ぐだけになる)。
 * @param {object} params
 * @returns {string}
 */
export function triviaHeadlineOf(params) {
  if (!params || params.dismiss === true) return '';
  return triviaStateOf(params).service;
}

/**
 * 検証・デバッグ用の読み出し口(進行中のクイズ状態)。
 * game/modes/freetier.js の inspectZencho と同じ趣旨で、
 * 演出データからは触れない内部状態をテストから確かめられるようにしてある。
 * @returns {{round:object, traveled:number, lockTo:number|null}|null}
 */
export function inspectQuizState() {
  return quizActive;
}

function ensureQuizLockTarget(q) {
  if (q.lockTo != null) return;
  const from = q.traveled ?? 0;
  let target = Math.floor(from) + QUIZ_LOCK_MIN_STEPS;
  while (QUIZ_SPIN_ORDER[target % QUIZ_SPIN_ORDER.length] !== q.round.stopIndex) target++;
  q.lockFrom = from;
  q.lockTo = target;
}

/* ══ リール3択クイズ(U64-2 / 2026-08-15 ユーザー指示)════════════════════
 *
 * ── 経緯 ────────────────────────────────────────────────────
 *   U53 で「どのリールから止める?」の押し順当てにしていた枠を、
 *   U64-2 で **AWSクイズ** に戻した(休止していた46問のデータを活用)。
 *   出題の枠(発生条件・頻度)は U53 のまま。中身だけがクイズになっている。
 *
 * ■ 遊び方
 *   出題   「◯◯をしたい。どのサービス?」+ 3つの選択肢を **左 / 中 / 右** に表示
 *   回答    **既存の停止操作がそのまま入力**。第1停止したリール = 選んだ選択肢
 *   発表    正誤(事実)と 当落(出目) を **別々に** 出す
 *
 * ■ 【最重要】正誤と当落は別物 ─ 事実に忠実であること
 *   正誤 … 「押したリール == 正解のリール」で決まる **事実**。
 *          正解の位置は演出RNGのシャッフルで毎回変わる(当落は一切見ない)。
 *   当落 … 出目と抽選で **レバーON時点に確定済み**。クイズは1枚も動かさない。
 *   したがって次の4通りが全部起きる。盤面はそれを正直に出し分ける:
 *     当選ゲーム + 正解   → 「正解!!」               + プレート「CZ突入」
 *     当選ゲーム + 不正解 → 「不正解… 正解は◯」     + プレート「CZ突入」(それでも突入)
 *     ハズレ版   + 正解   → 「正解!!」+「役は不成立…」
 *     ハズレ版   + 不正解 → 「不正解… 正解は◯」+「役は不成立…」
 *   **正誤を当落に合わせて捻じ曲げないこと**(学びが嘘になる)。
 *   どのシナリオが当選確定 / 非当選確定かは data/scenarios/quiz.js の when 条件が正。
 *   ここへ渡ってくる params.win がその区別(当落)で、正誤とは無関係。
 *
 * ■ 選んだリールの受け取り方
 *   シナリオが { waitFor:'stop1', params:{ pick:'$stop1.index' } } と書くと、
 *   engine/timeline.js が控えた stop1 の payload(reelctrl の requestStop の戻り)から
 *   実際に最初に止めたリールの index(0=左 / 1=中 / 2=右)が届く。
 *   届かなかった場合(payload 無し等)は名指しを避けて当落だけを出す。
 */

/** 3択の並び。index はリール番号そのもの(0=左 / 1=中 / 2=右) */
const PICK_LABELS = ['左', '中', '右'];
/** キー割当の再掲(engine/input.js の KEY_MAP と同じ。押す手が迷わないように) */
const PICK_KEYS = ['←', '↓', '→'];

/**
 * 出題(第1停止を待つ)フェーズの尺[ms]。
 *
 * ── 事実上の「回答されるまで保持」(2026-08-15 U69)────────────────
 * 【旧】20秒。**リールに自動停止は無い**(game/reelctrl.js)ので、
 *   問題文を読んでから押すまでに20秒かかると
 *   **回っている最中に出題が勝手に消える**(尺切れ + 末尾フェード)。
 *   実際に「出た瞬間に消える / 途中で消える」として報告された不具合の本体。
 * 【新】5分。第1停止が来た瞬間に phase:'answer' の再生が同じ animId を
 *   差し替えるので、通常プレイでここまで到達することはない。
 *   到達したら消える = **固まらないための自己修復**として残してある。
 *
 * 【厳守】data/scenarios/quiz.js の `waitGraceMs` より必ず短くすること。
 * 逆転するとシナリオだけ先に畳まれ、発表の来ない盤面が画面に残る。
 */
const PICK_WAIT_MS = 300000;
/** 発表フェーズの既定尺[ms]。正解の場所まで読ませるので押し順当て時代より長い */
const PICK_REVEAL_MS = 3200;
/** 判定が出るまでの溜め[ms]。第1停止から一拍おいて発表する */
const PICK_VERDICT_DELAY_MS = 220;
/** 判定が出きるまで[ms] */
const PICK_VERDICT_MS = 360;

/* ── 盤面の縦レイアウト ───────────────────────────────────
 *   y   3〜  5  枠線
 *   y   6〜 38  問題文プレート
 *   y  44〜146  3択のマス(ミニリール / 左中右 / 選択肢)
 *   y 152〜236  lcd.text の告知プレート ★ここには文字を置かない
 *   y 248       判定(正解!! / 不正解…)
 *   y 274       内訳(正解は◯ / 役は不成立…)
 *   y 292       足元の見出し
 * ★の帯は LcdAnims が盤面より後に描くので、置いた文字は必ず隠れる。
 *
 * compact:true(CZ盤面の上に出す当選版)では **盤面ぜんぶが 0.74 倍** になるため、
 * 上の y をそのまま使うと判定が告知プレートの裏へ回る(局所 y201 以降が帯に潜る)。
 * そのため判定まわりだけ compact 用の座標を別に持つ(PICK_VERDICT_LAYOUT)。 */
const PICK_PAD_X = 12;
const PICK_COL_GAP = 8;
const PICK_Q_TOP = 6;
const PICK_Q_H = 32;
const PICK_GRID_TOP = 44;
const PICK_CELL_H = 102;
/* マス内の縦の取り合い(マス上端からの相対)。重ならないよう必ずこの順に並べる:
 *   y   8〜 52 … ミニリール(高さ44 / 中心30)
 *   y  58〜 74 … 左 / 中 / 右 + キー(16px)
 *   y  80〜 98 … 選択肢のサービス名(最大17px。幅に合わせて詰める) */
const PICK_REEL_CY = 30;
const PICK_NAME_Y = 66;
const PICK_CHOICE_Y = 88;

/**
 * 判定まわりの座標。compact は「告知プレート(screen y151〜237)の上」に収める。
 *   compact の局所 y → 画面 y は  2 + y * 0.74  なので、
 *   局所 y 190 = 画面 143(帯の直前)が実質の下限。ここを超えないこと。
 */
const PICK_VERDICT_LAYOUT = {
  full: { verdictY: 248, verdictSize: 26, detailY: 274, detailSize: 14, headY: 292 },
  /*
   * compact は盤面ごと 0.74 倍になるので、**指定サイズ × 0.74 が実際の見た目**。
   * U39(演出の文字が小さい)を踏まえ、実効 11px を切らないよう大きめに取ってある
   *   verdict 26 → 実効 19.2px / detail 16 → 実効 11.8px
   */
  compact: { verdictY: 162, verdictSize: 26, detailY: 190, detailSize: 16, headY: null },
};
/** 進行バー(装飾。告知プレートの裏に回ってよい) */
const PICK_BAR_Y = 182;
/** CZ盤面の上に出すときの縮小率(クイズの V3 対応と同じ考え方) */
const PICK_COMPACT_SCALE = 0.74;
const PICK_COMPACT_TOP = 2;

/**
 * 画面上での文字の下限[px]。lcdanims.js の LCD_ANIM_MIN_FONT_PX と同じ値。
 * (このファイルは lcdanims.js から import される側なので、逆輸入せず定数を置く)
 */
const PICK_MIN_FONT_PX = 11;

/**
 * 縮小表示でも「画面で 11px を切らない」ようにした fitFont の下限。
 *
 * compact は盤面ごと 0.74 倍されるので、fitFont へ 11 を渡すと
 * **画面では 8.1px** になり、U39 で決めた下限を大きく割る
 * (2026-08-15 U69「3択が小さく表示される」の実体のひとつ)。
 * 縮小率のぶんだけ指定を持ち上げて、実効サイズで下限を守る。
 *
 * 入り切らない文言は fitFont の方針どおり「多少はみ出させる」。
 * 読めない大きさで収めるより、はみ出しても読める方を採る。
 * @param {number} minPx 画面上で確保したい最小サイズ
 * @param {boolean} compact
 * @returns {number} fitFont / strokedText へ渡すサイズ
 */
const pickMinFont = (minPx, compact) => (
  compact ? Math.ceil(minPx / PICK_COMPACT_SCALE) : minPx
);

/**
 * 進行中の出題。'ask' で引き直し、'answer' が読み継ぐ。
 * **当落の情報は一切持たない**(持たせると正誤が当落に引きずられる)。
 *
 * `__recorded` は staging/actions.js の learn.quizResult が付ける
 * 「この出題は学習記録へ数え終わった」印(2026-08-15 椿レビュー major)。
 * 描画は一切見ない。'ask' で新しい出題に差し替わると自然に消える。
 * @type {{id:string, question:string, choices:string[], answerIndex:number, __recorded?:boolean}|null}
 */
let reelPickActive = null;

/**
 * この再生で使う出題を返す。
 * draw() は毎フレーム呼ばれるので params 側にも覚えさせる(triviaStateOf と同じ作法)。
 * @param {object} params  { phase, quizId }
 * @param {() => number} [rand] 演出用乱数。既定は Math.random(ゲーム抽選RNGとは別系統)
 * @returns {{id:string, question:string, choices:string[], answerIndex:number}}
 */
function reelPickStateOf(params, rand = Math.random) {
  if (params.__rp) return params.__rp;
  const phase = params.phase ?? 'ask';
  // 'answer' が先に来る(高速停止で ask の描画が1フレームも走らない)場合の保険として、
  // reelPickActive が空なら引き直す。正解の位置は毎回シャッフルされる
  if (phase === 'ask' || reelPickActive == null) {
    reelPickActive = buildReelQuizRound({ quizId: params.quizId ?? null, rand });
  }
  params.__rp = reelPickActive;
  return reelPickActive;
}

/**
 * 押したリール番号を 0〜2 に正規化する(届いていなければ -1)。
 * @param {unknown} raw
 * @returns {number}
 */
function normalizePick(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 2 ? n : -1;
}

/**
 * この再生の正誤(事実)。まだ答えていない / 届いていないときは null。
 * @param {object} params
 * @returns {{pick:number, answerIndex:number, correct:boolean, round:object}|null}
 */
export function reelPickVerdictOf(params) {
  if (!params || params.phase !== 'answer') return null;
  const round = reelPickStateOf(params);
  const pick = normalizePick(params.pick);
  if (pick < 0) return null;
  return { pick, answerIndex: round.answerIndex, correct: pick === round.answerIndex, round };
}

/**
 * この盤面が大きく出している判定文言(U8 の二重表示防止の申告)。
 * staging/anims/lcdanims.js の ANIM_HEADLINES から呼ばれる。
 *
 * **当落(params.win)ではなく正誤で決まる**。当落の告知は lcd.text 側の担当。
 * @param {object} params
 * @returns {string}
 */
export function reelPickHeadlineOf(params) {
  const v = reelPickVerdictOf(params);
  if (!v) return '';
  return v.correct ? '正解!!' : '不正解…';
}

/**
 * 進行中の出題を **生成せずに** 覗く読み出し口。
 *
 * 検証・デバッグ用であると同時に、staging/actions.js の learn.quizResult が
 * 記録してよいかを判断する砦でもある(2026-08-15 椿レビュー major)。
 * reelPickStateOf は出題が無ければ**その場で新しく組み立ててしまう**ので、
 * 「盤面が出題しているか」を知りたいだけの側は必ずこちらを使うこと。
 * @returns {{id:string, question:string, choices:string[], answerIndex:number, __recorded?:boolean}|null}
 *   出題していなければ null
 */
export function inspectReelPickState() {
  return reelPickActive;
}

/**
 * ミニリールを1本描く(原点はマスの左上)。
 * 回転中は帯が流れ、止まると1コマに収まる。絵柄そのものは出さない
 * (ここで特定の絵柄を見せると「その絵柄が揃う」という別の意味になってしまうため)。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx マスの中心X
 * @param {number} cy マスの中心Y
 * @param {object} opt
 */
function drawMiniReel(ctx, cx, cy, { spin = 0, color = '#7cf3ff', running = true, alpha = 1 }) {
  const rw = 46;
  const rh = 44;
  const x = cx - rw / 2;
  const y = cy - rh / 2;
  ctx.save();
  ctx.globalAlpha *= alpha;
  roundRect(ctx, x, y, rw, rh, 6);
  ctx.fillStyle = 'rgba(4,10,22,0.9)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // 帯(3コマぶん)。running のときだけ縦に流す
  ctx.save();
  roundRect(ctx, x + 2, y + 2, rw - 4, rh - 4, 4);
  ctx.clip();
  const pitch = (rh - 4) / 3;
  const offset = running ? (spin * pitch * 6) % pitch : 0;
  for (let i = -1; i < 4; i++) {
    const by = y + 2 + i * pitch + offset;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.30)' : 'rgba(124,243,255,0.20)';
    ctx.fillRect(x + 2, by, rw - 4, pitch - 2);
  }
  ctx.restore();

  // 中段ライン(止まったときの「ここに来る」の目印)
  ctx.strokeStyle = running ? 'rgba(255,255,255,0.25)' : color;
  ctx.lineWidth = running ? 1 : 1.8;
  ctx.beginPath();
  ctx.moveTo(x + 3, cy);
  ctx.lineTo(x + rw - 3, cy);
  ctx.stroke();
  ctx.restore();
}

/* ══ Bedrock ストリーミング生成予告の文言 ══════════════
 *
 * docs/BACKLOG.md「P: Bedrockタイピング予告」。
 * 期待度別に出し分ける。tier の意味は次のとおり:
 *   weak  … 弱。当たっていてもいなくても出る日常の作業ログ
 *   alarm … Bedrock揃い(ALARM役)の起動イベント専用。運用まわりの小ネタ。
 *           「揃った」こと自体の御祝儀で、当落は示唆しない
 *   mid   … 中。「何か起きている」ことは分かるが当選確定ではない
 *   gase  … ガセ。BONUS を出力し始めたように見えて別の単語に着地する肩透かし
 *   hot   … 激アツ。**当選が確定したシナリオからしか使わない**
 *
 * ■ 文言はすべて「生成AI調」で書く(2026-08-13 ユーザー要望)
 *   Bedrock は抽選結果を **引き当てる** のではなく **生成する** 装置として見せる。
 *   「引き当てた / 当てた / 引いた」は使わず、
 *   「〜を生成しました」「〜を出力しました」「推論の結果、〜」で統一すること。
 *
 * ■ 「BONUS」を含む文言は当選ゲーム限定(= 画面に BONUS と出たら100%当たり)
 *   1. 文言の置き場を tier で分け、BONUS を含む文言は hot にしか置かない
 *   2. pickBedrockLine() が hot 以外では BONUS を含む文言を機械的に除外する
 *   3. hot を指定できるシナリオを「当選が確定したイベント」に限定する
 *      (src/data/scenarios/yokoku-heavy.js の yh_bedrock_typing_hit の1本だけ)
 *   データを足すときに 1 を破っても 2 が効くので、事故で BONUS が漏れることはない。
 */
export const BEDROCK_LINES = {
  weak: [
    's3 sync の要約を生成しました',
    'Lambda の修正パッチを出力しました',
    'ログ 3 件の要約を生成しました',
    'タグ付けルールを再生成しました',
    'コスト最適化の草案を出力しました',
    'README の改訂版を生成しました',
  ],
  alarm: [
    '推論の結果、閾値案を生成しました',
    '4枚の払出をログへ出力しました',
    'メトリクスの要約を生成しました',
    '異常検知の観点を 3 件出力しました',
    'ノイズ抑制ルールを生成しました',
    'ランブックの草案を生成しました',
  ],
  mid: [
    '推論の結果、急増を出力しました',
    'スケールアウト案を生成しました',
    '推論の結果、異常と出力しました',
    '上位プランへの移行案を生成しました',
    '緊急の構成変更案を出力しました',
    '推論の結果、逼迫と判断しました',
  ],
  gase: [
    'BON… Bonjour と出力しました',
    'BOO… BOOST 案を生成しました',
    'BON… BONSAI を生成しました',
    'BO… BOTO3 のコードを出力しました',
    'BONE… 骨組みだけ生成しました',
    'B…B… 出力が途中で止まりました',
  ],
  hot: [
    'BIG BONUS を生成しました',
    'BONUS シナリオを出力しました',
    'GHOST BONUS を生成しました',
    '推論の結果、BONUS を出力しました',
    'BONUS ルートを生成しました',
  ],
};

/** 「BONUS」を含むかどうか(大文字小文字は区別しない) */
const BONUS_WORD_RE = /BONUS/i;

/**
 * 期待度別に文言を1つ引く。
 *
 * hot 以外では BONUS を含む文言を必ず取り除く。これがあるおかげで、
 * BEDROCK_LINES へうっかり「BONUS」入りの文言を弱・中・ガセへ書いてしまっても、
 * 非当選ゲームの画面に BONUS が出ることはない。
 *
 * @param {'weak'|'mid'|'gase'|'hot'} tier
 * @param {() => number} [rand] 演出用乱数。既定は Math.random(ゲーム抽選RNGとは別系統)
 * @returns {string}
 */
export function pickBedrockLine(tier, rand = Math.random) {
  const pool = BEDROCK_LINES[tier] ?? BEDROCK_LINES.weak;
  const safe = tier === 'hot' ? pool : pool.filter((t) => !BONUS_WORD_RE.test(t));
  const list = safe.length > 0 ? safe : BEDROCK_LINES.weak;
  return list[Math.floor(rand() * list.length)] ?? list[0];
}

/* ── トークンストリーミングの組み立て ────────────────────
 *
 * ユーザー要望「Bedrock の演出に『LLM で生成している感』を出して」。
 * 等速のタイプライターだと単なる文字送りに見えるので、実際の
 * InvokeModelWithResponseStream のように **チャンク単位で吐き出す**:
 *   ・1チャンク 2〜5文字(= トークンっぽい塊)。1文字ずつは出さない
 *   ・チャンクごとに間隔が揺らぐ(等間隔にしない)
 *   ・ときどき「推論の間」が挟まって出力が止まる
 *   ・最初のチャンクまでは TTFT(time to first token)ぶん長めに待つ
 *
 * ■ 進行はミリ秒ではなく「正規化した進行度」で持つ
 *   タイピングはリール停止に合わせて phase 0→3 と分割再生されるため、
 *   実時間はプレイヤーの押し方次第で伸び縮みする。そこでスケジュールは
 *   0→1 の進行度 (from/to) で持ち、各フェーズがその 1/4 区間だけ進める。
 *   文言を引いたときに1回だけ組み立て、以降のフェーズが読み継ぐ。
 */

/** 1チャンクの文字数(この範囲でランダムに切る) */
const BEDROCK_CHUNK_MIN = 2;
const BEDROCK_CHUNK_MAX = 5;

/** チャンクの間に「推論の間」が入る確率 */
const BEDROCK_THINK_CHANCE = 0.3;

/**
 * 最初のチャンクが届く位置(TTFT: time to first token)。
 *
 * ここを他のチャンクと同じ重みで抽選に混ぜると、進行度を全チャンクで
 * 正規化する都合上、文言が短い(= チャンクが少ない)ときに最初の1個が
 * phase:0 の担当区間(0→0.25)を飛び越してしまい、第1停止まで
 * 1文字も出ない絵になる。TTFT だけは固定枠として先に切り出しておく。
 */
const BEDROCK_TTFT_AT = 0.15;

/**
 * 文言をトークンストリームへ切り分ける。
 *
 * cost は「そのチャンクが出るまでの間」の重み。合計で割って
 * BEDROCK_TTFT_AT→1 の区間へ正規化するので、ms を何に設定しても間合いの比率は保たれる。
 *
 * @param {string} text
 * @param {() => number} [rand] 演出用乱数(ゲーム抽選RNGとは別系統)
 * @returns {{chunks:object[], tokens:number, latency:string, firstAt:number}}
 */
export function buildBedrockStream(text, rand = Math.random) {
  const src = String(text ?? '');
  const cuts = [];
  for (let i = 0; i < src.length;) {
    let n = BEDROCK_CHUNK_MIN + Math.floor(rand() * (BEDROCK_CHUNK_MAX - BEDROCK_CHUNK_MIN + 1));
    // 末尾に1文字だけ余らせない(最後の1文字がポツンと出ると不自然)
    if (src.length - (i + n) === 1) n += 1;
    n = Math.min(n, src.length - i);
    // 1チャンク = だいたい3〜6トークン(日本語は1文字1〜2トークンになりやすい)
    cuts.push({ end: i + n, weight: 3 + Math.floor(rand() * 4) });
    i += n;
  }
  if (cuts.length === 0) cuts.push({ end: 0, weight: 1 });

  // 2個目以降の間合い。1個目は TTFT の固定枠を使う
  const costs = cuts.slice(1).map(() => {
    const jitter = 0.7 + rand() * 0.7;                                        // 間隔の揺らぎ
    const think = rand() < BEDROCK_THINK_CHANCE ? 1.2 + rand() * 1.2 : 0;     // 推論の間
    return { total: jitter + think, think: think > 0 };
  });
  const sum = costs.reduce((a, c) => a + c.total, 0) || 1;
  const span = 1 - BEDROCK_TTFT_AT;

  let at = BEDROCK_TTFT_AT;
  let tok = 0;
  const chunks = cuts.map((c, i) => {
    const from = i === 0 ? 0 : at;
    if (i > 0) at += (costs[i - 1].total / sum) * span;
    const tokenFrom = tok;
    tok += c.weight;
    return {
      end: c.end,
      from,
      to: i === 0 ? BEDROCK_TTFT_AT : Math.min(1, at),
      tokenFrom,
      tokenTo: tok,
      // 1個目は必ず「推論中…」から始まる
      think: i === 0 ? true : costs[i - 1].think,
    };
  });
  // 丸め誤差で最後が 1 に届かないと最後のチャンクが出ないままになる
  chunks[chunks.length - 1].to = 1;

  return {
    chunks,
    tokens: tok,
    // 所要時間の遊び。トークン数と相関させておくと嘘っぽくならない
    latency: (0.45 + tok * 0.016 + rand() * 0.25).toFixed(2),
    firstAt: Math.min(BEDROCK_TTFT_AT, chunks[0].to),
  };
}

/**
 * 進行度 ratio(0→1)の時点でのストリームの状態。
 * @param {{chunks:object[]}} stream
 * @param {number} ratio
 * @returns {{chars:number, tokens:number, thinking:boolean, lastFrom:number}}
 */
export function bedrockStreamAt(stream, ratio) {
  let chars = 0;
  let lastFrom = 0;
  let tokens = 0;
  let thinking = false;
  for (const c of stream.chunks) {
    if (ratio >= c.to) {
      lastFrom = chars;
      chars = c.end;
      tokens = c.tokenTo;
      continue;
    }
    const span = Math.max(1e-6, c.to - c.from);
    const local = clamp01((ratio - c.from) / span);
    // 間のあいだはカウンタも止まり、吐き出す瞬間に一気に増える(カタカタ感)
    tokens = c.tokenFrom + (c.tokenTo - c.tokenFrom) * local * local;
    thinking = c.think && local < 0.7;
    break;
  }
  return { chars, tokens: Math.round(tokens), thinking, lastFrom };
}

/**
 * いま生成中の文言。
 * タイピングはリール停止に合わせて phase 0→3 と複数回に分けて再生されるので、
 * phase:0(打ち始め)で引いた文言とトークン割りを以降のフェーズが読み継ぐ必要がある。
 * @type {{tier:string, text:string, stream:object, ratio:number}|null}
 */
let bedrockActive = null;

/** この再生で出力する文言を決める(phase:0 で引き直し、それ以外は継続) */
function bedrockLineOf(params) {
  if (params.__line) return params.__line;
  const tier = params.tier ?? 'weak';
  const phase = Math.round(clamp(params.phase ?? 0, 0, 3));
  if (phase <= 0 || bedrockActive == null || bedrockActive.tier !== tier) {
    const text = pickBedrockLine(tier);
    bedrockActive = { tier, text, stream: buildBedrockStream(text), ratio: 0 };
  }
  params.__line = bedrockActive;
  return bedrockActive;
}

/**
 * ステータス行の3段階。「引き当てた」ではなく「生成している」を見せるための表示で、
 * 当落は一切示唆しない(どの tier でも同じ順に遷移する)。
 */
const BEDROCK_STAGES = ['PROMPT 受信', '推論中…', 'ストリーミング出力'];

/** tier ごとの配色(文字・枠・グロー) */
const BEDROCK_COLORS = {
  weak: '#8ad4ff',
  alarm: '#ffd166',
  mid: '#ffd166',
  gase: '#8aa0b4',
  hot: '#ff8a00',
};

/* ══ 絵柄飛来予告 ═════════════════════════════════════
 *
 * 液晶の中を風が吹き、そのゲームで成立している絵柄が1枚舞い込む先読み予告。
 * 「飛んできた絵柄は必ず揃う」を成立させるため、シナリオ側は when.flag で
 * 成立フラグを固定し、その絵柄IDだけを渡す(取りこぼし無し仕様なので成立=必ず揃う)。
 *
 * ■ 絵柄の絵について
 *   assets/symbols/*.png の実画像を使う。engine/assets.js の共有ストア symbolAssets
 *   (main.js が起動時に読み込む)から取り出し、120×60 のタイルへ段階的に縮小して
 *   1回だけキャッシュする。DESIGN.md 注意事項11 のリールと同じ手順なので、
 *   リール上の絵柄と見た目が一致する。
 *   依存方向は staging → engine / data のみ(render/ には依存しない)。
 *   画像が未ロードのあいだは null が返るので、色と表示名だけのプレースホルダへ落とす。
 */

/**
 * 絵柄タイルのオフスクリーンキャッシュ(絵柄IDごとに1枚)。
 *
 * ■ 2026-08-14 V21(U36)修正: **縦横比を保つ**
 *   以前は 120×60 の横長タイルへ焼いていたが、原画(assets/symbols/*.png)は
 *   **418×418 の正方形**。つまり全部の絵柄が縦に半分へ潰れて焼かれており、
 *   Blue/Green 2択(bluegreen_choice)のように大きく見せる演出で
 *   「絵柄が縦に潰れている」と分かる形で出てしまっていた。
 *   焼くときは長辺を SYMBOL_TILE_MAX に合わせ、短辺は原画の比率のまま残す。
 *   描くときは drawSymbolTile() が箱に収める(contain)ので、
 *   呼び出し側は「どれくらいの大きさで見せたいか」だけ考えればよい。
 */
const SYMBOL_TILE_CACHE = new Map();
/** 焼き付ける長辺の長さ(液晶が440pxなので120あれば拡大しても粗くならない) */
const SYMBOL_TILE_MAX = 120;

/** オフスクリーンを1枚作る。document が無い環境(検証ハーネス等)では null */
function makeOffscreen(w, h) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const c = document.createElement('canvas');
  if (!c) return null;
  c.width = w;
  c.height = h;
  return c;
}

/**
 * 418px の原画を一気に 60px まで落とすとジャギるので、1/2 ずつ段階的に縮める。
 * render/symbols-draw.js の downscaleInSteps と同じ考え方だが、
 * staging → render の依存は張れないためこちらに独立実装を持つ。
 */
function downscaleStepwise(img, targetW, targetH) {
  let iw = img.width || targetW;
  let ih = img.height || targetH;
  let src = img;
  // 目標の2倍を下回るまで半分ずつ
  while (iw > targetW * 2 && ih > targetH * 2) {
    const nw = Math.max(targetW, Math.round(iw / 2));
    const nh = Math.max(targetH, Math.round(ih / 2));
    const step = makeOffscreen(nw, nh);
    if (!step) return null;
    const sx = step.getContext('2d');
    if (!sx) return null;
    sx.imageSmoothingEnabled = true;
    sx.imageSmoothingQuality = 'high';
    sx.drawImage(src, 0, 0, nw, nh);
    src = step;
    iw = nw;
    ih = nh;
  }
  const out = makeOffscreen(targetW, targetH);
  if (!out) return null;
  const ox = out.getContext('2d');
  if (!ox) return null;
  ox.imageSmoothingEnabled = true;
  ox.imageSmoothingQuality = 'high';
  ox.drawImage(src, 0, 0, targetW, targetH);
  return out;
}

/**
 * 舞う絵柄1枚(assets/symbols/*.png)を用意する。
 *
 * 画像は非同期ロードなので、**まだ来ていないときは null を返すだけでキャッシュしない**。
 * (null をキャッシュすると、後から画像が届いても永久にプレースホルダのままになる)
 * 呼び出し側は null ならプレースホルダ描画へフォールバックする。
 */
function symbolTile(symbolId) {
  const cached = SYMBOL_TILE_CACHE.get(symbolId);
  if (cached) return cached;
  const img = symbolAssets.get(symbolId);
  if (!img) return null;
  let tile = null;
  try {
    // 原画の縦横比のまま長辺を SYMBOL_TILE_MAX に合わせる(正方形の原画は正方形のまま)
    const iw = img.width || SYMBOL_TILE_MAX;
    const ih = img.height || SYMBOL_TILE_MAX;
    const k = SYMBOL_TILE_MAX / Math.max(iw, ih);
    tile = downscaleStepwise(img, Math.max(1, Math.round(iw * k)), Math.max(1, Math.round(ih * k)));
  } catch (e) {
    tile = null;
  }
  if (tile) SYMBOL_TILE_CACHE.set(symbolId, tile);
  return tile;
}

/**
 * 絵柄タイルを「原点中心・箱に収める(contain)」で描く。
 *
 * タイルは原画の比率で焼いてあるので、箱(boxW×boxH)へ **潰さずに** 収める。
 * 箱より小さくなるぶんには構わない(縦横比が正しいことのほうが大事)。
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} tile
 * @param {number} boxW
 * @param {number} boxH
 * @returns {{w:number, h:number}} 実際に描いた大きさ
 */
function drawSymbolTile(ctx, tile, boxW, boxH) {
  const tw = tile.width || boxW;
  const th = tile.height || boxH;
  const k = Math.min(boxW / tw, boxH / th);
  const w = tw * k;
  const h = th * k;
  ctx.drawImage(tile, -w / 2, -h / 2, w, h);
  return { w, h };
}

/**
 * 分散マップの「子の実行」を1本描く(原点がトークンの中心)。
 *
 * ══ 2026-08-15 U58 / 廃止サービスの差し替え ═══════════════════════
 * ここは元 DeepRacer の車体だったが、**DeepRacer は 2025-12-15 に提供終了**。
 * 演出の骨格(1 → 2 → 4 → 大量が横に走る)はそのまま活かせるので、
 * 題材を **AWS Step Functions の分散マップ(Distributed Map)** へ移し、
 * 絵を「並列に走る子の実行」= 実行トークンへ描き替えた。
 *   ・車輪と LiDAR を外し、Step Functions のステートらしい角丸の箱にする
 *   ・進行方向の先端に山形(chevron)を付けて「走っている向き」を残す
 *   ・箱の中の走査線が spin で流れて「処理中」を示す(車輪の回転の代役)
 * 呼び出し側(distmap_run / distmap_race)は引数も座標も変えていない。
 *
 * @param {number} spin 走査線の流れる量(0→1 で1周ぶん程度)
 */
function drawRunToken(ctx, { body = '#8ad4ff', spin = 0 } = {}) {
  const g = ctx.createLinearGradient(0, -9, 0, 7);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, body);
  g.addColorStop(1, '#1b4f7a');

  // 実行の箱(Step Functions のステートに見立てた角丸)
  roundRect(ctx, -20, -7, 34, 14, 4);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,30,60,0.85)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // 中を流れる走査線(処理中であることを示す)
  ctx.save();
  roundRect(ctx, -20, -7, 34, 14, 4);
  ctx.clip();
  ctx.globalAlpha *= 0.55;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const lx = -20 + (((spin * 46) + i * 12) % 40);
    ctx.beginPath();
    ctx.moveTo(lx, -7);
    ctx.lineTo(lx - 5, 7);
    ctx.stroke();
  }
  ctx.restore();

  // 進行方向の山形(どちらへ走っているかを残す)
  ctx.beginPath();
  ctx.moveTo(15, -7);
  ctx.lineTo(22, 0);
  ctx.lineTo(15, 7);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,30,60,0.85)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 後ろへ伸びる軌跡(並列に走っている感じを出す)
  ctx.save();
  ctx.globalAlpha *= 0.45;
  ctx.strokeStyle = body;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.lineTo(-32 - Math.sin(spin * Math.PI * 2) * 3, 0);
  ctx.stroke();
  ctx.restore();
}

export const LCD_ANIMS_EXTRA = {
  /**
   * SQS 保留変化予告。IDEAS.md 2-6
   * 液晶の左端にメッセージが「保留」として積み上がる。数と色で期待度を示す。
   * params: { count=1(1〜5), level=0(0白/1金/2赤), x=12, baseY=202 }
   */
  sqs_queue_hold: {
    layer: 'ui', ms: 1300,
    draw(ctx, p, params, w, h) {
      const count = Math.round(clamp(params.count ?? 1, 1, 5));
      const level = Math.round(clamp(params.level ?? 0, 0, 2));
      const x = params.x ?? 12;
      const baseY = params.baseY ?? 202;
      const cardW = 66;
      const cardH = 18;
      const pitch = 22;
      const color = LEVEL_COLORS[level];
      const alpha = fadeInOut(p);
      if (alpha <= 0) return;

      ctx.save();
      ctx.globalAlpha = alpha;

      // キューの土台
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      roundRect(ctx, x - 6, baseY - (count - 1) * pitch - 8, cardW + 12, (count - 1) * pitch + cardH + 30, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 積み上がったメッセージ
      for (let i = 0; i < count; i++) {
        const cy = baseY - i * pitch;
        const isNew = i === count - 1;
        const pop = isNew ? easeOutBack(clamp01(p / 0.3)) : 1;
        const glow = level === 2 ? 0.55 + 0.45 * Math.sin(p * Math.PI * 10 + i) : 1;

        ctx.save();
        ctx.translate(x + cardW / 2, cy + cardH / 2);
        ctx.scale(pop, pop);
        ctx.translate(-cardW / 2, -cardH / 2);

        roundRect(ctx, 0, 0, cardW, cardH, 4);
        ctx.fillStyle = 'rgba(10,20,40,0.85)';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha * (isNew ? glow : 0.85);
        ctx.lineWidth = 1.8;
        if (level === 2) { ctx.shadowColor = color; ctx.shadowBlur = 12 * glow; }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 封筒アイコン
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fillRect(7, 5, 14, 9);
        ctx.strokeStyle = 'rgba(10,20,40,0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(7, 5);
        ctx.lineTo(14, 11);
        ctx.lineTo(21, 5);
        ctx.stroke();

        strokedText(ctx, 'MSG', 44, cardH / 2, { size: 10, color, edge: 'rgba(0,10,30,0.9)' });
        ctx.restore();
      }

      // 保留数バッジ
      const badgeY = baseY - (count - 1) * pitch - 18;
      strokedText(ctx, `× ${count}`, x + cardW / 2, badgeY, { size: 15, color, edge: 'rgba(0,10,30,0.9)' });
      strokedText(ctx, 'SQS QUEUE', x + cardW / 2, baseY + cardH + 10, {
        size: 9, color: 'rgba(255,255,255,0.8)', edge: 'rgba(0,10,30,0.9)', heavy: false,
      });
      ctx.restore();
    },
  },

  /**
   * Step Functions ステップアップ予告。IDEAS.md 2-17
   * ワークフローの矢印が1段ずつ点灯し、最終ステート到達で強。
   * params: { step=1, total=5, ok=true, y=62 }
   */
  sfn_arrow_step: {
    layer: 'fg', ms: 1200,
    draw(ctx, p, params, w, h) {
      const total = Math.round(clamp(params.total ?? 5, 2, 8));
      const step = Math.round(clamp(params.step ?? 1, 0, total));
      const ok = params.ok !== false;
      const y = params.y ?? 62;
      const x0 = 46;
      const x1 = w - 46;
      const gap = (x1 - x0) / (total - 1);
      const alpha = fadeInOut(p);
      if (alpha <= 0) return;
      const reached = step >= total;
      const litColor = reached && ok ? '#ffe066' : '#7bf7d0';

      ctx.save();
      ctx.globalAlpha = alpha;

      // 矢印(ステート間の遷移)
      for (let i = 1; i < total; i++) {
        const ax = x0 + (i - 1) * gap + 12;
        const bx = x0 + i * gap - 12;
        const done = i < step;
        const active = i === step - 1; // 直近に点灯した矢印だけ光を走らせる
        ctx.strokeStyle = done ? litColor : 'rgba(255,255,255,0.18)';
        ctx.lineWidth = done ? 2.6 : 1.6;
        ctx.beginPath();
        ctx.moveTo(ax, y);
        ctx.lineTo(bx, y);
        ctx.stroke();
        if (done) {
          // 矢じり
          ctx.beginPath();
          ctx.moveTo(bx, y);
          ctx.lineTo(bx - 6, y - 4);
          ctx.lineTo(bx - 6, y + 4);
          ctx.closePath();
          ctx.fillStyle = litColor;
          ctx.fill();
        }
        // 最後に点灯した矢印だけ光が走る
        if (active && done && p < 0.6) {
          const t = clamp01(p / 0.6);
          const lx = ax + (bx - ax) * t;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(lx, y, 1, lx, y, 12);
          g.addColorStop(0, 'rgba(255,255,255,0.95)');
          g.addColorStop(1, 'rgba(123,247,208,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(lx, y, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // ステート(丸)
      for (let i = 0; i < total; i++) {
        const x = x0 + i * gap;
        const on = i < step;
        const isHead = i === step - 1;
        const pulse = isHead ? 0.6 + 0.4 * Math.sin(p * Math.PI * 8) : 1;
        ctx.beginPath();
        ctx.arc(x, y, on ? 9.5 : 7, 0, Math.PI * 2);
        ctx.fillStyle = on ? litColor : 'rgba(255,255,255,0.12)';
        if (on) { ctx.shadowColor = litColor; ctx.shadowBlur = 14 * pulse; }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = on ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      // 到達表示
      if (reached && p > 0.25) {
        const tp = clamp01((p - 0.25) / 0.3);
        ctx.save();
        ctx.translate(w / 2, y + 26);
        const s = easeOutBack(tp);
        ctx.scale(s, s);
        strokedText(ctx, ok ? 'SUCCESS STATE' : 'WAIT…', 0, 0, {
          size: 15, color: ok ? '#ffe066' : 'rgba(255,255,255,0.75)', edge: 'rgba(0,10,30,0.9)',
        });
        ctx.restore();
      } else if (!reached && p > 0.45) {
        strokedText(ctx, `${step} / ${total} States`, w / 2, y + 26, {
          size: 12, color: 'rgba(255,255,255,0.7)', edge: 'rgba(0,10,30,0.9)', heavy: false,
        });
      }
      ctx.restore();
    },
  },

  /**
   * CodeDeploy プログレスバー予告。IDEAS.md 2-4
   *
   * ■ 結果は必ず外(シナリオ)から渡す(2026-08-13 修正)
   *   もとは「バーが 1.0 に届いたら DEPLOY SUCCEEDED」「rollback:true なら巻き戻す」と
   *   アニメ側が勝手に結論を出していた。そのためレバーON時点(まだ当落が決まっていない)の
   *   予告シナリオが成功/失敗を断言してしまい、
   *     ・ロールバックと出たのに数ゲーム後にCZへ入る
   *     ・非当選ゲームで DEPLOY SUCCEEDED と出る
   *   という嘘が発生していた。結論は params.result でしか出せないようにしてある。
   *
   * params: { from=0, to=1, result='run', stage, x=118, y=238, w=306 }
   *   result … 'run'      進行中。**何も断言しない**(100% まで伸びても DEPLOYING 表記)
   *            'success'  デプロイ成功。当選が確定したシナリオからしか渡さない
   *            'rollback' 巻き戻し。非当選が確定したシナリオからしか渡さない
   *   stage  … 1〜3。前兆の段階から from/to を自動で決めたいとき用(結果は 'run' のまま)
   *   rollback:true は後方互換のため result:'rollback' として扱う
   */
  deploy_progress: {
    layer: 'ui', ms: 1500,
    draw(ctx, p, params, w, h) {
      // 結果はシナリオが明示したときだけ。既定は「進行中(断言しない)」
      const result = params.rollback ? 'rollback' : (params.result ?? 'run');
      // 前兆の段階から進捗を出す簡易指定(1→34% / 2→62% / 3→86%)
      const STAGE_TO = [0, 0.34, 0.62, 0.86];
      const stage = params.stage != null
        ? Math.round(clamp(params.stage, 1, 3))
        : null;
      const from = clamp01(params.from ?? (stage ? STAGE_TO[stage - 1] : 0));
      let to = clamp01(params.to ?? (stage ? STAGE_TO[stage] : 1));
      // 進行中は 100% に見せない。満タンの画は「成功」と読めてしまうため
      if (result === 'run') to = Math.min(to, 0.97);
      /*
       * U16(2026-08-14 ユーザー指摘「デプロイのメーターが中央にない」):
       * 既定位置が x118〜424(左余白118 / 右余白16)で、見るからに右へ寄っていた。
       * 幅はそのまま(306)で **左右の余白を均等** にして中央へ置き直す。
       * x / w を明示したシナリオの見た目は変わらない。
       */
      const bw = params.w ?? 306;
      const bx = params.x ?? Math.round((w - bw) / 2);
      const by = params.y ?? 238;
      const bh = 20;
      const alpha = fadeInOut(p, 0.1, 0.88);
      if (alpha <= 0) return;

      let v = from + (to - from) * easeOutCubic(clamp01(p / 0.62));
      let phase = 'run';
      if (result === 'rollback' && p > 0.68) {
        const rp = clamp01((p - 0.68) / 0.32);
        v = to * (1 - rp * 0.92);
        phase = 'rollback';
      } else if (result === 'success' && v >= 0.999) {
        phase = 'done';
      }

      const cols = {
        run: ['#3a72d0', '#8ad4ff'],
        done: ['#ffb400', '#fff3a0'],
        rollback: ['#a01818', '#ff6b6b'],
      }[phase];

      ctx.save();
      ctx.globalAlpha = alpha;

      // 台座
      roundRect(ctx, bx, by, bw, bh, bh / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fill();

      // 進捗
      if (v > 0.001) {
        ctx.save();
        roundRect(ctx, bx, by, bw, bh, bh / 2);
        ctx.clip();
        const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        g.addColorStop(0, cols[0]);
        g.addColorStop(1, cols[1]);
        ctx.fillStyle = g;
        ctx.fillRect(bx, by, bw * v, bh);
        // 走査光
        if (phase === 'run') {
          const sx = bx + ((p * 2.2) % 1) * bw * v;
          const sg = ctx.createLinearGradient(sx - 26, 0, sx + 26, 0);
          sg.addColorStop(0, 'rgba(255,255,255,0)');
          sg.addColorStop(0.5, 'rgba(255,255,255,0.35)');
          sg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = sg;
          ctx.fillRect(sx - 26, by, 52, bh);
        }
        ctx.restore();
      }

      // 枠(完了時は光る)
      ctx.strokeStyle = phase === 'done' ? '#ffe066' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = phase === 'done' ? 2.4 : 1.4;
      if (phase === 'done') {
        ctx.shadowColor = '#ffb400';
        ctx.shadowBlur = 16 * (0.55 + 0.45 * Math.sin(p * Math.PI * 12));
      }
      roundRect(ctx, bx, by, bw, bh, bh / 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      const label = phase === 'done'
        ? 'DEPLOY SUCCEEDED'
        : phase === 'rollback'
          ? `ROLLBACK  ${Math.round(v * 100)}%`
          : `DEPLOYING  ${Math.round(v * 100)}%`;
      /*
       * V31-08: バーの下地(alpha 0.6)だけでは、明るいステージ絵の上で
       * 「DEPLOYING 9%」が読めなかった。文字の下にだけ濃い座布団を敷いて、
       * 進捗が何%でも(= 文字がバーの明るい部分に乗っても)コントラストを確保する。
       */
      // 座布団が重なりを避けてずれることがあるので、文字も戻り値のYへ置く
      const labelY = textPlate(ctx, label, bx + bw / 2, by + bh / 2, { size: 13 });
      strokedText(ctx, label, bx + bw / 2, labelY, {
        size: 13,
        color: phase === 'done' ? '#fffbe0' : '#ffffff',
        edge: 'rgba(0,10,30,0.9)',
      });
      ctx.restore();
    },
  },

  /**
   * Auto Scaling 増殖予告(通常時版)。IDEAS.md 2-2
   * インスタンスが 1 → 2 → 4 → 8 と倍々に増える。増えた数だけ期待度が上がる。
   * params: { n=2(1〜8), prev=自動, y=50 }
   */
  asg_multiply: {
    layer: 'fg', ms: 1100,
    draw(ctx, p, params, w, h) {
      const n = Math.round(clamp(params.n ?? 2, 1, 8));
      const prev = Math.round(clamp(params.prev ?? Math.max(0, Math.floor(n / 2)), 0, n));
      const y = params.y ?? 50;
      const iconW = 24;
      const iconH = 26;
      const gap = 6;
      const totalW = n * iconW + (n - 1) * gap;
      const startX = (w - totalW) / 2;
      const alpha = fadeInOut(p);
      if (alpha <= 0) return;

      ctx.save();
      ctx.globalAlpha = alpha;
      for (let i = 0; i < n; i++) {
        const x = startX + i * (iconW + gap);
        const isNew = i >= prev;
        let lp = 1;
        if (isNew) {
          const d = ((i - prev) / Math.max(1, n - prev)) * 0.34;
          lp = clamp01((p - d) / 0.36);
          if (lp <= 0) continue;
        }
        const s = isNew ? easeOutBack(lp) : 1;

        ctx.save();
        ctx.translate(x + iconW / 2, y + iconH / 2);
        ctx.scale(s, s);
        ctx.translate(-iconW / 2, -iconH / 2);

        roundRect(ctx, 0, 0, iconW, iconH, 4);
        const g = ctx.createLinearGradient(0, 0, 0, iconH);
        g.addColorStop(0, '#7bf7d0');
        g.addColorStop(1, '#12a08a');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        // ラック風スリット
        ctx.fillStyle = 'rgba(0,40,35,0.75)';
        ctx.fillRect(5, 8, iconW - 10, 2.5);
        ctx.fillRect(5, 14, iconW - 10, 2.5);
        ctx.restore();

        // 増えたインスタンスは光の輪をまとう
        if (isNew && lp < 1) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const cx = x + iconW / 2;
          const cy = y + iconH / 2;
          const r = 8 + easeOutCubic(lp) * 26;
          const rg = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
          rg.addColorStop(0, `rgba(123,247,208,${0.8 * (1 - lp)})`);
          rg.addColorStop(1, 'rgba(123,247,208,0)');
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // 倍率バッジは列の右隣に置く(中央の常設テキストと重ねない)
      const bx = Math.min(w - 34, startX + totalW + 22);
      strokedText(ctx, `×${n}`, bx, y + iconH / 2, {
        size: 18, color: n >= 8 ? '#ffe066' : '#7bf7d0', edge: 'rgba(0,30,25,0.9)',
      });
      strokedText(ctx, 'AUTO SCALING', w / 2, y - 10, {
        size: 9, color: 'rgba(255,255,255,0.7)', edge: 'rgba(0,30,25,0.9)', heavy: false,
      });
      ctx.restore();
    },
  },

  /**
   * 【U31】オートスケーリングRUSH の上乗せ告知「スケールアウト!!」。
   *
   * ■ 何を見せるか(ユーザー指示「レア役上乗せの瞬間を派手に」)
   *   1. 帯を暗く落として舞台を作る(下の常設パネルの数字と混ざらないため)
   *   2. EC2 が **増えたぶんだけ** 光をまとって湧く(前からある台は静かに並ぶ)
   *   3. 大文字「スケールアウト!!」が奥から叩きつけられる
   *   4. 台数が prev → n へ **ガコンとカウントアップ**(1台ごとに揺れる)
   *   5. 右上に「+delta G」のバッジ(台数 = 残りゲーム数だから、伸びたG数でもある)
   *
   * ■ 嘘をつかない
   *   撃たれるのは game/modes/asrush.js が **実際に台数を増やした瞬間**
   *   (paramChange 'scale_out')だけ。煽りの余地はない。
   *
   * params: { n=現在の台数($value), delta=増えた台数($delta) }
   */
  scale_out_slam: {
    layer: 'ui', ms: 1900,
    draw(ctx, p, params, w, h) {
      const n = Math.max(1, Math.round(params.n ?? 1));
      const delta = Math.max(0, Math.round(params.delta ?? 0));
      const prev = Math.max(0, n - delta);
      const alpha = fadeInOut(p, 0.06, 0.88);
      if (alpha <= 0) return;

      const top = 44;
      const bottom = 208;
      const cx = w / 2;

      ctx.save();
      ctx.globalAlpha = alpha;

      // ── 1. 舞台(帯を落として、上下に光の線)──
      ctx.fillStyle = 'rgba(2,14,12,0.9)';
      ctx.fillRect(0, top, w, bottom - top);
      ctx.strokeStyle = `rgba(123,247,208,${0.5 + 0.5 * Math.sin(p * Math.PI * 8)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, top + 1);
      ctx.lineTo(w, top + 1);
      ctx.moveTo(0, bottom - 1);
      ctx.lineTo(w, bottom - 1);
      ctx.stroke();

      // 中心から広がる光の輪(スケールアウトの「ぶわっ」)
      if (p < 0.5) {
        const rp = clamp01(p / 0.5);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const r = 20 + easeOutCubic(rp) * 260;
        const g = ctx.createRadialGradient(cx, 118, 8, cx, 118, r);
        g.addColorStop(0, `rgba(200,255,238,${0.42 * (1 - rp)})`);
        g.addColorStop(1, 'rgba(18,160,138,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, top, w, bottom - top);
        ctx.restore();
      }

      // ── 2. EC2 が湧く(表示は最大10台。それ以上は「…」で畳む)──
      const SHOW_MAX = 10;
      const shown = Math.min(n, SHOW_MAX);
      const shownPrev = Math.min(prev, shown);
      const iconW = 30;
      const iconH = 22;
      const gap = 6;
      const rowW = shown * iconW + (shown - 1) * gap;
      const sx = cx - rowW / 2;
      const iy = 62;
      for (let i = 0; i < shown; i++) {
        const x = sx + i * (iconW + gap);
        const fresh = i >= shownPrev;
        // 増えた台は少しずつ遅れて湧く(左から順に「ガコッ、ガコッ」)
        let lp = 1;
        if (fresh) {
          const d = 0.12 + ((i - shownPrev) / Math.max(1, shown - shownPrev)) * 0.3;
          lp = clamp01((p - d) / 0.26);
          if (lp <= 0) continue;
        }
        const s = fresh ? easeOutBack(lp) : 1;
        ctx.save();
        ctx.translate(x + iconW / 2, iy + iconH / 2);
        ctx.scale(s, s);
        roundRect(ctx, -iconW / 2, -iconH / 2, iconW, iconH, 4);
        const g = ctx.createLinearGradient(0, -iconH / 2, 0, iconH / 2);
        g.addColorStop(0, fresh ? '#e6fff6' : '#7bf7d0');
        g.addColorStop(1, fresh ? '#25d3ac' : '#12a08a');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,40,35,0.75)';
        ctx.fillRect(-iconW / 2 + 6, -4, iconW - 12, 2.4);
        ctx.fillRect(-iconW / 2 + 6, 2, iconW - 12, 2.4);
        // 湧いた瞬間の光
        if (fresh && lp < 1) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const r = 6 + easeOutCubic(lp) * 30;
          const rg = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
          rg.addColorStop(0, `rgba(180,255,230,${0.85 * (1 - lp)})`);
          rg.addColorStop(1, 'rgba(123,247,208,0)');
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }
      if (n > SHOW_MAX) {
        strokedText(ctx, `…他 ${n - SHOW_MAX} 台`, cx, iy + iconH + 12, {
          size: 10, color: 'rgba(155,255,216,0.85)', edge: 'rgba(0,30,25,0.9)', heavy: false,
        });
      }

      // ── 3. 大文字の告知(奥から叩きつける)──
      slamHeadline(ctx, 'スケールアウト!!', cx, 124, clamp01((p - 0.1) / 0.5), {
        maxWidth: w - 36, size: 40, colors: ['#ffffff', '#7bf7d0'], edge: 'rgba(0,32,26,0.95)',
      });

      /* ── 4. 台数のカウントアップ(1台ごとにガコンと揺れる)──
       * y162: 演出テキスト帯のプレート(中心 y194)より上に置いて、
       * 帯が出ていても数字が隠れないようにする。 */
      const cu = clamp01((p - 0.3) / 0.42);
      const count = Math.round(prev + (n - prev) * easeOutQuart(cu));
      const step = delta > 0 ? Math.abs(Math.sin(cu * Math.PI * Math.max(1, delta))) : 0;
      ctx.save();
      ctx.translate(cx, 162 + (cu < 1 ? step * 3 : 0));
      const cs = 1 + (cu < 1 ? step * 0.08 : Math.max(0, 1 - (p - 0.72) / 0.2) * 0.05);
      ctx.scale(cs, cs);
      strokedText(ctx, `${count} 台`, 0, 0, {
        size: 34, color: '#ffe066', edge: 'rgba(0,32,26,0.95)',
      });
      ctx.restore();

      // ── 5. 「台数 = 残りゲーム数」なので、伸びたG数をバッジで添える ──
      if (delta > 0 && p > 0.34) {
        const bp = clamp01((p - 0.34) / 0.26);
        ctx.save();
        ctx.globalAlpha = alpha * bp;
        ctx.translate(cx + 104, 162 - easeOutCubic(bp) * 10);
        const bs = easeOutBack(bp);
        ctx.scale(bs, bs);
        roundRect(ctx, -40, -15, 80, 30, 9);
        ctx.fillStyle = 'rgba(18,160,138,0.9)';
        ctx.fill();
        ctx.strokeStyle = '#c9ffe9';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        strokedText(ctx, `+${delta}G`, 0, 1, {
          size: 19, color: '#ffffff', edge: 'rgba(0,40,32,0.9)',
        });
        ctx.restore();
      }

      ctx.restore();
    },
  },

  /**
   * 【U41】Aurora RUSH の上乗せ告知「スケールアップ!!」。
   *
   * ■ AS(U31)との描き分け(演出言語は揃えて、意味は分ける)
   *   AS     … **台数が並ぶ**(横に増える = スケールアウト)
   *   Aurora … **器が育つ**(1つの円筒が大きくなる = スケールアップ)
   *   舞台の作り方・大文字の叩きつけ方・カウントアップの間は共通にしてあるので、
   *   「同じ種類の良いこと」だと一目で分かる。
   *
   * ■ 見せる情報
   *   1. データベース(円筒)が prev サイズから **ぐいっと拡大**、ACUの目盛りも伸びる
   *   2. 大文字「スケールアップ!!」
   *   3. ACU(= 1ゲームの純増枚数)が prev → acu へカウントアップ
   *   4. 「+1G」バッジ … レア役はゲーム数も伸ばす(game/modes/rushes.js の addGamePerWin)
   *
   * params: { acu=新しいACU($value), delta=上げ幅($delta), addGames=1 }
   */
  scale_up_slam: {
    layer: 'ui', ms: 1900,
    draw(ctx, p, params, w, h) {
      const acu = Math.max(1, Math.round(params.acu ?? 1));
      const delta = Math.max(0, Math.round(params.delta ?? 0));
      const prev = Math.max(1, acu - delta);
      const addGames = Math.max(0, Math.round(params.addGames ?? 0));
      const alpha = fadeInOut(p, 0.06, 0.88);
      if (alpha <= 0) return;

      const top = 44;
      const bottom = 208;
      const cx = w / 2;
      // 器の育ち(0.55 → 1.0)。カウントアップと同じ間で動かして因果を見せる
      const grow = 0.55 + easeOutBack(clamp01((p - 0.12) / 0.4)) * 0.45;

      ctx.save();
      ctx.globalAlpha = alpha;

      // ── 舞台 ──
      ctx.fillStyle = 'rgba(10,4,24,0.9)';
      ctx.fillRect(0, top, w, bottom - top);
      ctx.strokeStyle = `rgba(180,139,255,${0.5 + 0.5 * Math.sin(p * Math.PI * 8)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, top + 1);
      ctx.lineTo(w, top + 1);
      ctx.moveTo(0, bottom - 1);
      ctx.lineTo(w, bottom - 1);
      ctx.stroke();

      // ── 1. 育つ円筒(データベース)──
      {
        const baseW = 92;
        const baseH = 74;
        const cw2 = (baseW * grow) / 2;
        const ch2 = (baseH * grow) / 2;
        const dy = 88;
        const ell = cw2 * 0.34;

        ctx.save();
        ctx.translate(cx, dy);

        // 拡大の残像(前の大きさの輪郭が置いていかれる)
        if (p < 0.62) {
          const gp = clamp01((p - 0.12) / 0.5);
          ctx.save();
          ctx.globalAlpha = alpha * (1 - gp) * 0.5;
          ctx.strokeStyle = '#c9a8ff';
          ctx.lineWidth = 1.6;
          const pw = (baseW * 0.55) / 2;
          const ph = (baseH * 0.55) / 2;
          ctx.strokeRect(-pw, -ph, pw * 2, ph * 2);
          ctx.restore();
        }

        // 胴
        const body = ctx.createLinearGradient(-cw2, 0, cw2, 0);
        body.addColorStop(0, '#4a2a9a');
        body.addColorStop(0.5, '#a06bff');
        body.addColorStop(1, '#4a2a9a');
        ctx.fillStyle = body;
        ctx.fillRect(-cw2, -ch2, cw2 * 2, ch2 * 2);
        // 上面 / 底面
        ctx.beginPath();
        ctx.ellipse(0, -ch2, cw2, ell, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#c9a8ff';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, ch2, cw2, ell, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#7b3fd6';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(0, -ch2, cw2, ell, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-cw2, -ch2);
        ctx.lineTo(-cw2, ch2);
        ctx.moveTo(cw2, -ch2);
        ctx.lineTo(cw2, ch2);
        ctx.stroke();

        // 中を流れるデータの層(2本)
        ctx.save();
        ctx.globalAlpha = alpha * 0.75;
        ctx.strokeStyle = '#7be3ff';
        ctx.lineWidth = 1.4;
        for (let i = 1; i <= 2; i++) {
          const ly = -ch2 + (ch2 * 2 * i) / 3;
          ctx.beginPath();
          ctx.ellipse(0, ly, cw2 * 0.98, ell * 0.9, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();

        // 育った瞬間の光
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gr = cw2 * (1.4 + Math.sin(p * Math.PI * 6) * 0.1);
        const rg = ctx.createRadialGradient(0, 0, 6, 0, 0, gr);
        rg.addColorStop(0, `rgba(201,168,255,${0.32 * (1 - p * 0.5)})`);
        rg.addColorStop(1, 'rgba(123,227,255,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(0, 0, gr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.restore();
      }

      // ── 2. 大文字の告知 ──
      slamHeadline(ctx, 'スケールアップ!!', cx, 140, clamp01((p - 0.1) / 0.5), {
        maxWidth: w - 36, size: 38, colors: ['#ffffff', '#b48bff'], edge: 'rgba(20,4,40,0.95)',
      });

      /* ── 3. ACU(= 純増)のカウントアップ ──
       * AS 版と同じく、演出テキスト帯のプレートより上(y172)に置く */
      const cu = clamp01((p - 0.3) / 0.42);
      const val = Math.round(prev + (acu - prev) * easeOutQuart(cu));
      ctx.save();
      ctx.translate(cx, 172);
      const cs = 1 + (cu < 1 ? Math.abs(Math.sin(cu * Math.PI * 3)) * 0.06 : 0);
      ctx.scale(cs, cs);
      strokedText(ctx, `ACU ${val} = 純増 ${val} 枚/G`, 0, 0, {
        size: 19, color: '#7be3ff', edge: 'rgba(20,4,40,0.95)',
      });
      ctx.restore();

      // ── 4. ゲーム数も伸びる ──
      if (addGames > 0 && p > 0.34) {
        const bp = clamp01((p - 0.34) / 0.26);
        ctx.save();
        ctx.globalAlpha = alpha * bp;
        ctx.translate(cx + 132, 88 - easeOutCubic(bp) * 10);
        const bs = easeOutBack(bp);
        ctx.scale(bs, bs);
        roundRect(ctx, -34, -15, 68, 30, 9);
        ctx.fillStyle = 'rgba(90,32,176,0.92)';
        ctx.fill();
        ctx.strokeStyle = '#e0ccff';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        strokedText(ctx, `+${addGames}G`, 0, 1, {
          size: 19, color: '#ffffff', edge: 'rgba(20,4,40,0.9)',
        });
        ctx.restore();
      }

      ctx.restore();
    },
  },

  /**
   * CloudWatch メーター振り切れ予告(RUSH中の上乗せ期待)。
   * 針が上がりきると SCALE OUT 濃厚。over:false なら手前で止まるガセ。
   * params: { to=0.7, over=false, label='CPU UTIL', sub='', cx=118, cy=224, r=40 }
   *
   * 既定値は AS_RUSH の左下の空きに収まるよう決めてある(上端 cy-r-8 / 下端 cy+6)。
   * 以前の cy=214 / r=46 だと上端が 160 まで伸び、「純増◯枚/G 継続◯%」(y 159〜173)に
   * 重なっていたため、上端が 176 に収まる値へ下げた。
   */
  cw_meter_swing: {
    layer: 'fg', ms: 1700,
    draw(ctx, p, params, w, h) {
      const cx = params.cx ?? 118;
      const cy = params.cy ?? 224;
      const r = params.r ?? 40;
      const to = clamp(params.to ?? 0.7, 0, 1);
      const over = Boolean(params.over);
      const alpha = fadeInOut(p, 0.1, 0.88);
      if (alpha <= 0) return;

      // 針の値: 一気に立ち上がって、揺れて、over なら振り切れる
      let v;
      if (p < 0.55) {
        v = to * easeOutCubic(p / 0.55);
      } else {
        const q = (p - 0.55) / 0.45;
        v = to + Math.sin(q * Math.PI * 5) * 0.055 * (1 - q);
        if (over) v += easeOutCubic(clamp01((q - 0.12) / 0.42)) * Math.max(0, 1.06 - to);
      }
      const shown = clamp(v, 0, 1.12);

      ctx.save();
      ctx.globalAlpha = alpha;

      // 台座
      ctx.beginPath();
      ctx.arc(cx, cy, r + 8, Math.PI, 0);
      ctx.lineTo(cx + r + 8, cy + 6);
      ctx.lineTo(cx - r - 8, cy + 6);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 目盛りゾーン(緑 → 黄 → 赤)
      const ZONES = [[0, 0.6, '#4ce0a0'], [0.6, 0.85, '#ffd166'], [0.85, 1, '#ff4d4d']];
      ctx.lineWidth = 7;
      ctx.lineCap = 'butt';
      for (const [z0, z1, col] of ZONES) {
        ctx.beginPath();
        ctx.arc(cx, cy, r - 6, Math.PI + Math.PI * z0, Math.PI + Math.PI * z1);
        ctx.strokeStyle = col;
        ctx.globalAlpha = alpha * (shown >= z0 ? 0.95 : 0.28);
        ctx.stroke();
      }
      ctx.globalAlpha = alpha;

      // 目盛り線
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI + Math.PI * (i / 10);
        const inner = r - 13;
        const outer = i % 5 === 0 ? r - 1 : r - 5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        ctx.stroke();
      }

      // 針
      const ang = Math.PI + Math.PI * shown;
      const needleCol = shown > 1 ? '#ffffff' : shown >= 0.85 ? '#ff5a5a' : shown >= 0.6 ? '#ffd166' : '#7bf7d0';
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-4, -3);
      ctx.lineTo(r - 10, 0);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      ctx.fillStyle = needleCol;
      ctx.shadowColor = needleCol;
      ctx.shadowBlur = shown > 1 ? 18 : 8;
      ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;

      // 軸
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f2f6ff';
      ctx.fill();

      // 数値とラベル
      strokedText(ctx, `${Math.round(shown * 100)}%`, cx, cy - 27, {
        size: 18, color: needleCol, edge: 'rgba(0,10,30,0.9)',
      });
      strokedText(ctx, params.label ?? 'CPU UTIL', cx, cy - 10, {
        size: 9, color: 'rgba(255,255,255,0.75)', edge: 'rgba(0,10,30,0.9)', heavy: false,
      });
      if (params.sub) {
        // V31-08: サブ行はメーターの台座(cy+6 まで)より下に出るので、
        // 明るいステージ絵の上だと縁取りだけでは読めない。座布団を敷く。
        const subY = textPlate(ctx, String(params.sub), cx, cy + 15, { size: 10, heavy: false, padX: 6 });
        strokedText(ctx, String(params.sub), cx, subY, {
          size: 10, color: 'rgba(255,255,255,0.8)', edge: 'rgba(0,10,30,0.9)', heavy: false,
        });
      }

      // 振り切れた瞬間の警告(メーターの右隣。RUSHのキャラ定位置とは重ならない)
      if (shown > 1) {
        const blink = 0.5 + 0.5 * Math.sin(p * Math.PI * 16);
        ctx.globalAlpha = alpha * (0.55 + 0.45 * blink);
        // こちらも台座の外。赤文字は明るい背景に一番負けるので下地を濃いめに
        const thY = textPlate(ctx, 'THRESHOLD!!', cx + r + 12, cy - 22, {
          size: 13, align: 'left', fill: 'rgba(24,0,4,0.78)',
        });
        strokedText(ctx, 'THRESHOLD!!', cx + r + 12, thY, {
          size: 13, color: '#ff5a5a', edge: 'rgba(30,0,0,0.9)', align: 'left',
        });
      }
      ctx.restore();
    },
  },

  /**
   * Kinesis データ粒の川。IDEAS.md 2-20
   * 流れる粒の色が 青(弱) → 金(中) → 虹(強) と変化する。
   * params: { level=0, y=238, x0=96, x1=w-12, count=16, caption=true }
   *
   * caption:false で内蔵キャプション(GOLD RECORD / RAINBOW STREAM)を消す。
   * lcd.text のサブ行が y 213〜229 に出るため、同じ内容を lcd.text 側で見せる
   * シナリオではこちらを消して文字の重なりを避ける。
   */
  kinesis_color_stream: {
    layer: 'fg', ms: 1500,
    draw(ctx, p, params, w, h) {
      const level = Math.round(clamp(params.level ?? 0, 0, 2));
      const y = params.y ?? 238;
      const x0 = params.x0 ?? 96;
      const x1 = params.x1 ?? (w - 12);
      const count = Math.round(clamp(params.count ?? 16, 4, 40));
      const span = Math.max(20, x1 - x0);
      const alpha = fadeInOut(p);
      if (alpha <= 0) return;

      ctx.save();
      ctx.globalAlpha = alpha;

      // 川床
      roundRect(ctx, x0 - 6, y - 9, span + 12, 18, 9);
      ctx.fillStyle = 'rgba(0,20,30,0.35)';
      ctx.fill();
      ctx.strokeStyle = level === 0 ? 'rgba(140,230,255,0.25)' : 'rgba(255,224,102,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // レコードの粒
      ctx.globalCompositeOperation = level > 0 ? 'lighter' : 'source-over';
      for (let i = 0; i < count; i++) {
        const seed = ((i * 37) % 100) / 100;
        const t = ((p * 1.5) + seed) % 1;
        const len = 10 + (i % 3) * 4;
        // 粒は長さぶん手前で折り返す。span * t のままだと右端が x1 を len ぶん超える
        const px = x0 + Math.max(20, span - len) * t;
        const py = y + Math.sin((t * 4 + i * 0.7) * Math.PI) * 4;
        const col = level === 2
          ? `hsl(${(i * 41 + p * 420) % 360}, 95%, 68%)`
          : level === 1 ? '#ffe066' : '#8ad4ff';
        ctx.globalAlpha = alpha * (0.55 + 0.45 * Math.sin((t + seed) * Math.PI));
        ctx.fillStyle = col;
        ctx.fillRect(px, py - 1.8, len, 3.6);
        if (level > 0) {
          const g = ctx.createRadialGradient(px + len / 2, py, 1, px + len / 2, py, 12);
          g.addColorStop(0, level === 2 ? 'rgba(255,255,255,0.5)' : 'rgba(255,224,102,0.45)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px + len / 2, py, 12, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;

      if (level > 0 && params.caption !== false && p > 0.2) {
        const tp = clamp01((p - 0.2) / 0.25);
        ctx.save();
        ctx.translate((x0 + x1) / 2, y - 20);
        const s = easeOutBack(tp);
        ctx.scale(s, s);
        strokedText(ctx, level === 2 ? 'RAINBOW STREAM' : 'GOLD RECORD', 0, 0, {
          size: 13, color: level === 2 ? '#ffb0f0' : '#ffe066', edge: 'rgba(0,20,40,0.9)',
        });
        ctx.restore();
      }
      ctx.restore();
    },
  },

  /**
   * 分散マップの子の実行が液晶の下段を走り抜ける賑やかし。IDEAS.md 2-35
   * (2026-08-15 U58 で DeepRacer から題材を差し替え。旧ID: deep_racer_run)
   * params: { y=244, dir=1(1:左→右 / -1:右→左), color='#8ad4ff' }
   *
   * 尾を引く光が y+8 を中心に最大半径 7.8 まで広がるので、既定値は
   * テロップ帯(y 266〜)に掛からない 244 にしてある(以前は 256 で 272 まで届いていた)。
   */
  distmap_run: {
    layer: 'fg', ms: 1700,
    draw(ctx, p, params, w, h) {
      const y = params.y ?? 244;
      const dir = (params.dir ?? 1) >= 0 ? 1 : -1;
      const body = params.color ?? '#8ad4ff';
      const t = clamp01(p);
      const x = dir > 0 ? -46 + (w + 92) * t : w + 46 - (w + 92) * t;
      const bob = Math.sin(p * Math.PI * 14) * 1.6;

      ctx.save();

      // 砂ぼこり(進行方向の後ろ)
      for (let i = 0; i < 4; i++) {
        const d = (i + 1) * 13;
        const px = x - dir * d;
        const a = Math.max(0, 0.34 - i * 0.07) * (1 - Math.abs(0.5 - t) * 0.6);
        ctx.fillStyle = `rgba(220,235,255,${a})`;
        ctx.beginPath();
        ctx.arc(px, y + 8 + Math.sin(p * 20 + i) * 1.5, 3 + i * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.translate(x, y + bob);
      ctx.scale(dir, 1);
      drawRunToken(ctx, { body, spin: p });
      ctx.restore();
    },
  },

  /**
   * AWSクイズルーレット。docs/BACKLOG.md「P: AWSクイズルーレット演出」
   *
   * **リール停止と完全同期のフェーズ駆動**。時間で勝手に進まないので、
   * プレイヤーが止めたぶんだけ進む(速すぎて何に決まったか分からない、への対応)。
   * params: { correct=false, quizId=null, phase='start', ms }
   *   phase … 'start' 出題 / 'spin' 回転 / 'lock' 減速して確定 / 'reveal' 判定発表
   *   correct … true で正解に止まる。**当選が確定したシナリオしか true を渡さない**
   *
   * シナリオ側は
   *   at:0            → phase:'start'
   *   waitFor stop1   → phase:'spin'
   *   waitFor stop2   → phase:'lock'
   *   waitFor stop3   → phase:'reveal'
   * と並べるだけでよい(既存のステップアップ予告と同じ流儀)。
   *
   * ■ レイアウト(液晶 440×300 を全面占有)
   *   常設UI(モード名バー・テロップ帯)は不透明の背景で伏せる。
   *   ただし **y152〜236 は lcd.text の告知プレート専用に空けておく**。
   *   LcdAnims は ui レイヤーのアニメを描いてから最後にテキスト帯を描くので、
   *   ここに文字を置くと告知テロップに確実に隠れる。読ませたい問題文と選択肢は
   *   y8〜150 に、進行ラベルはプレートの下 y250、見出しは足元 y278 に置く。
   *   実際の座標はファイル上部の QUIZ_* 定数(「盤面の縦レイアウト」)にまとめてある。
   */
  aws_quiz_roulette: {
    layer: 'ui', ms: QUIZ_WAIT_MS,
    draw(ctx, p, params, w, h) {
      const q = quizStateOf(params);
      const round = q.round;
      const phase = params.phase ?? 'start';
      const isReveal = phase === 'reveal';
      // 回転速度と点滅周期を ms の長さから切り離すため、経過ミリ秒で組み立てる
      const ms = params.ms ?? (isReveal ? 2800 : QUIZ_WAIT_MS);
      const elapsed = p * ms;

      // ── フェーズごとの進行 ──
      let stopped = false;      // 停止位置が確定したか(ハイライト固定)
      let verdictP = 0;         // 判定の進行(0 なら結果は伏せたまま)
      if (phase === 'spin') {
        q.traveled = elapsed / QUIZ_SPIN_STEP_MS;
      } else if (phase === 'lock') {
        ensureQuizLockTarget(q);
        const decel = clamp01(elapsed / QUIZ_LOCK_MS);
        q.traveled = q.lockFrom + (q.lockTo - q.lockFrom) * easeOutCubic(decel);
        stopped = decel >= 1;
      } else if (isReveal) {
        // 高速連打で減速しきる前に第3停止が来ても、ここで短く追いつかせてから発表する
        ensureQuizLockTarget(q);
        if (q.revealFrom == null) q.revealFrom = q.traveled ?? 0;
        const settle = clamp01(elapsed / 240);
        q.traveled = q.revealFrom + (q.lockTo - q.revealFrom) * easeOutCubic(settle);
        stopped = true;
        verdictP = clamp01((elapsed - 260) / 480);
      }
      const verdict = verdictP > 0;
      const spinning = phase === 'spin' || (phase === 'lock' && !stopped);

      // 出だしだけ短くフェードイン。末尾は次のフェーズが差し替えるので落とさない
      let alpha = Math.min(1, elapsed / 180);
      if (isReveal && p > 0.88) alpha *= Math.max(0, 1 - (p - 0.88) / 0.12);
      else if (!isReveal && p > 0.96) alpha *= Math.max(0, 1 - (p - 0.96) / 0.04);
      if (alpha <= 0) return;

      // ── ルーレットの位置 ──
      const traveled = q.traveled ?? 0;
      const litPos = Math.round(traveled);
      const cursor = phase === 'start'
        ? -1                                  // 出題中はどこも狙っていない
        : stopped
          ? round.stopIndex
          : QUIZ_SPIN_ORDER[litPos % QUIZ_SPIN_ORDER.length];
      const basePos = Math.floor(traveled);
      const frac = clamp01(traveled - basePos);
      // 1.5Hz の点滅。ms に引きずられないよう経過ミリ秒から出す
      const blink = 0.55 + 0.45 * Math.sin((elapsed / 1000) * Math.PI * 3);

      // ── レイアウト(縦の取り合いはファイル上部の「盤面の縦レイアウト」を参照)──
      const padX = QUIZ_PAD_X;
      const gap = QUIZ_COL_GAP;
      const cellW = (w - padX * 2 - gap) / 2;
      const cellH = QUIZ_CELL_H;
      const gridTop = QUIZ_GRID_TOP;
      const rowGap = QUIZ_ROW_GAP;
      const cellXY = (i) => [
        padX + (i % 2) * (cellW + gap),
        gridTop + Math.floor(i / 2) * (cellH + rowGap),
      ];
      const cellCenter = (i) => {
        const [x, y] = cellXY(i);
        return [x + cellW / 2, y + cellH / 2];
      };

      /* ── 縮小表示(2026-08-14 検証指摘 V3)────────────────────────
       * CZ の盤面の上でクイズを出すと、盤面を丸ごと覆って
       * 「いまCZがどこまで進んでいるか」が見えなくなる。
       * compact:true のときは盤面全体を QUIZ_COMPACT_SCALE 倍へ縮め、
       * 液晶の下側(結論の1行 y246 とテロップ帯 y266〜)を空ける。
       * これで CZ の状態(HTTP 200 / 残りメッセージ数など)を読みながらクイズを回せる。
       * 縮小は座標変換だけなので、以下のレイアウト計算は一切変えなくてよい。 */
      const compact = params.compact === true;
      if (compact) {
        ctx.save();
        ctx.translate((w - w * QUIZ_COMPACT_SCALE) / 2, QUIZ_COMPACT_TOP);
        ctx.scale(QUIZ_COMPACT_SCALE, QUIZ_COMPACT_SCALE);
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      // ── 全面背景(モード名バーやステージ絵を伏せる)──
      ctx.fillStyle = 'rgba(5,9,20,0.94)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(124,243,255,0.04)';
      for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2);
      ctx.strokeStyle = verdict
        ? (round.correct ? 'rgba(255,224,102,0.95)' : 'rgba(255,90,90,0.8)')
        : stopped ? `rgba(255,255,255,${0.25 + 0.35 * blink})` : 'rgba(124,243,255,0.5)';
      ctx.lineWidth = 2.4;
      ctx.strokeRect(3, 3, w - 6, h - 6);

      // ── 見出し(盤面の足元。上は選択肢の高さに使う)──
      strokedText(ctx, 'AWS QUIZ', 14, QUIZ_HEAD_Y, {
        size: 12, color: '#7cf3ff', edge: 'rgba(0,10,30,0.9)', align: 'left',
      });
      strokedText(ctx, 'どのサービス?', w - 14, QUIZ_HEAD_Y, {
        size: 11, color: 'rgba(190,225,255,0.8)', edge: 'rgba(0,10,30,0.9)', align: 'right', heavy: false,
      });

      // ── 問題文(上部に大きく)──
      ctx.save();
      const qIn = clamp01(elapsed / 260);
      ctx.globalAlpha = alpha * (phase === 'start' ? qIn : 1);
      // 出だしは少し上から降りてくる。上げ幅は枠線(y3〜5)に潜らない 6px まで
      const qTop = QUIZ_Q_TOP + (phase === 'start' ? (1 - easeOutCubic(qIn)) * -6 : 0);
      roundRect(ctx, 10, qTop, w - 20, QUIZ_Q_H, 7);
      ctx.fillStyle = 'rgba(124,243,255,0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(124,243,255,0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      const qSize = fitFont(ctx, round.question, w - 36, { max: 19, min: 12 });
      strokedText(ctx, round.question, w / 2, qTop + QUIZ_Q_H / 2, {
        size: qSize, color: '#ffffff', edge: 'rgba(0,10,30,0.95)',
      });
      ctx.restore();

      // ── 選択肢(2×2・大きめ)──
      for (let i = 0; i < round.choices.length; i++) {
        const [cx, cy] = cellXY(i);
        const pop = phase === 'start' ? clamp01((elapsed - 120 - i * 60) / 220) : 1;
        if (pop <= 0) continue;

        const isCursor = i === cursor;
        const isStop = stopped && i === round.stopIndex;
        // 不正解のときは判定のあと少し遅れて正解を教える(覚えて帰ってもらう)
        const revealAnswer = verdict && !round.correct && i === round.answerIndex && verdictP > 0.3;

        // 停止したら「決まったマス以外」を沈めて、どれに確定したかを一目で分かるようにする
        let dim = 1;
        if (stopped && !isStop && !revealAnswer) dim = 0.28;
        else if (spinning && !isCursor) dim = 0.62;

        let border = 'rgba(255,255,255,0.24)';
        let label = 'rgba(255,255,255,0.85)';
        let fill = 'rgba(12,20,38,0.9)';
        let glow = 0;
        if (isStop) {
          // 第3停止までは白のまま点滅させ、正解/不正解は伏せておく
          const c = verdict ? (round.correct ? '#ffe066' : '#ff5a5a') : '#ffffff';
          border = c;
          label = verdict ? (round.correct ? '#fff6c0' : '#ffd6d6') : '#ffffff';
          fill = verdict
            ? (round.correct ? 'rgba(96,70,10,0.95)' : 'rgba(74,16,16,0.95)')
            : 'rgba(30,58,86,0.95)';
          glow = (verdict ? 22 : 16) * blink;
        } else if (revealAnswer) {
          border = '#4ce0a0';
          label = '#c8ffe4';
          fill = 'rgba(10,52,38,0.92)';
          glow = 12;
        } else if (isCursor && spinning) {
          border = '#7cf3ff';
          label = '#ffffff';
          fill = 'rgba(16,52,72,0.95)';
          glow = 14;
        }

        ctx.save();
        ctx.globalAlpha = alpha * pop * dim;
        ctx.translate(cx + cellW / 2, cy + cellH / 2);
        let s = phase === 'start' ? easeOutBack(pop) : 1;
        if (isStop) s = 1.07 + (blink - 0.55) * 0.03;
        else if (isCursor && spinning) s = 1.03;
        ctx.scale(s, s);
        ctx.translate(-cellW / 2, -cellH / 2);

        roundRect(ctx, 0, 0, cellW, cellH, 9);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = border;
        ctx.lineWidth = isStop ? 3 : (isCursor && spinning ? 2.4 : 1.3);
        if (glow > 0) { ctx.shadowColor = border; ctx.shadowBlur = glow; }
        ctx.stroke();
        ctx.shadowBlur = 0;

        strokedText(ctx, String.fromCharCode(65 + i), 18, cellH / 2, {
          size: 16, color: border, edge: 'rgba(0,10,30,0.9)',
        });
        // 番号の右側 x 32〜cellW-12 にサービス名を収める
        const cSize = fitFont(ctx, round.choices[i], cellW - 46, { max: 22, min: 12 });
        strokedText(ctx, round.choices[i], (cellW + 20) / 2, cellH / 2, {
          size: cSize, color: label, edge: 'rgba(0,10,30,0.95)',
        });
        ctx.restore();

        if (revealAnswer) {
          ctx.save();
          ctx.globalAlpha = alpha * clamp01((verdictP - 0.3) / 0.25);
          strokedText(ctx, '正解', cx + cellW - 20, cy + 6, {
            size: 11, color: '#4ce0a0', edge: 'rgba(0,20,10,0.95)',
          });
          ctx.restore();
        }
      }

      // ── 走るマーカー(コマ間も動いて見せる = 減速が目で分かる)──
      if (spinning) {
        const a = QUIZ_SPIN_ORDER[basePos % QUIZ_SPIN_ORDER.length];
        const b = QUIZ_SPIN_ORDER[(basePos + 1) % QUIZ_SPIN_ORDER.length];
        const [ax, ay] = cellCenter(a);
        const [bx, by] = cellCenter(b);
        const mx = ax + (bx - ax) * frac;
        const my = ay + (by - ay) * frac;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(mx, my, 2, mx, my, 34);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(124,243,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(mx, my, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ── 進行インジケータ(装飾。告知プレートの帯は優先なので隠れてよい)──
      {
        const barY = QUIZ_BAR_Y;
        let v = 0;
        if (phase === 'spin') v = 1;
        else if (phase === 'lock') v = 1 - clamp01(elapsed / QUIZ_LOCK_MS);
        ctx.save();
        ctx.globalAlpha = alpha * 0.75;
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        roundRect(ctx, 60, barY, w - 120, 5, 2.5);
        ctx.fill();
        ctx.fillStyle = stopped ? 'rgba(255,224,102,0.9)' : 'rgba(124,243,255,0.9)';
        roundRect(ctx, 60, barY, Math.max(3, (w - 120) * v), 5, 2.5);
        ctx.fill();
        ctx.restore();
      }

      // ── 進行ラベル(告知プレートの下に置く)──
      {
        let label = 'リールを止めて回せ';
        let col = 'rgba(190,225,255,0.9)';
        let size = 13;
        if (phase === 'spin') { label = '回転中… 次の停止で決定'; col = '#7cf3ff'; }
        else if (stopped && !verdict) { label = '第3停止で判定'; col = '#ffffff'; }
        else if (verdict) {
          label = round.correct ? 'CORRECT!!' : 'INCORRECT';
          col = round.correct ? '#ffe066' : '#ff5a5a';
          size = 18;
        }
        ctx.save();
        ctx.globalAlpha = alpha * (stopped && !verdict ? blink : 1);
        strokedText(ctx, label, w / 2, QUIZ_LABEL_Y, {
          size, color: col, edge: 'rgba(0,10,30,0.95)', heavy: size > 14,
        });
        ctx.restore();
      }

      // ── 判定スタンプ(○ / ✕)──
      // サービス名の上には被せない。番号(A〜D)の位置へ重ねる。
      if (verdict) {
        const [sx, sy] = cellXY(round.stopIndex);
        const cx = sx + cellW / 2;
        const cy = sy + cellH / 2;
        const st = easeOutBack(clamp01(verdictP / 0.3));
        const stampColor = round.correct ? '#ffe066' : '#ff5a5a';
        ctx.save();
        ctx.globalAlpha = alpha * Math.min(1, verdictP * 6);
        ctx.translate(sx + 18, cy);
        ctx.scale(st, st);
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.strokeStyle = stampColor;
        ctx.shadowColor = stampColor;
        ctx.shadowBlur = 16;
        if (round.correct) {
          ctx.beginPath();
          ctx.arc(0, 0, 15, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(-11, -11); ctx.lineTo(11, 11);
          ctx.moveTo(11, -11); ctx.lineTo(-11, 11);
          ctx.stroke();
        }
        ctx.restore();

        if (round.correct) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const r = 16 + easeOutCubic(verdictP) * 200;
          const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
          g.addColorStop(0, `rgba(255,224,102,${0.6 * (1 - verdictP)})`);
          g.addColorStop(1, 'rgba(255,140,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      ctx.restore();
      if (compact) ctx.restore();
    },
  },

  /**
   * リール3択クイズ(2026-08-15 ユーザー指示 U64-2)。
   *
   * 休止していた46問(data/quiz.js)を「**左 / 中 / 右のリールで答える**」形で復活させた枠。
   * 出題 → 第1停止で回答 → 正誤と当落をそれぞれ発表、までを1枚で描く。
   *
   * params: { phase='ask', win=false, pick=null, quizId=null, compact=false, hold=false, ms }
   *   phase  … 'ask' 出題(第1停止を待つ) / 'answer' 発表
   *   win    … **当落**(このゲームで当選しているか)。正誤とは無関係の値で、
   *            当選が構造的に確定したシナリオだけが true を渡す。
   *            true のときは当落を告知プレート(lcd.text『CZ突入』)が言うので、
   *            盤面は当落に触れない。false のときだけ盤面が「役は不成立…」を出す。
   *   pick   … 実際に最初に止めたリール(0=左 / 1=中 / 2=右)。届かなければ名指ししない
   *   quizId … 出題を固定したいとき(?quiz= のデバッグ用)
   *   compact… CZ盤面の上に出すときの縮小(判定の座標も compact 用へ切り替わる)。
   *             **発表(phase:'answer')でしか効かない**(U69。出題は常にフルサイズ)。
   *             いま渡しているシナリオは1本も無い。理由は data/scenarios/quiz.js を参照
   *   hold   … 判定まで背景の切替を保留する(U42)。描画には使わず、
   *             lcdanims.js の STAGE_HOLD_ANIMS だけが見る。**モードが変わる出題だけ** true
   *
   * シナリオ側は
   *   レバーON時    → phase:'ask'(at:0 か waitFor:'leverOn')
   *   waitFor stop1 → phase:'answer'(pick:'$stop1.index')
   * と2行並べるだけでよい。**出題はレバーONの瞬間に出すこと**(U69)。
   *
   * **正誤は params では決まらない**(押したリールと正解の位置の一致だけで決まる)。
   * レイアウトの取り決めはファイル上部の PICK_* 定数のコメントを参照。
   * y152〜236(lcd.text の告知プレート)には**読ませたい文字を置かない**。
   */
  reel_pick_choice: {
    layer: 'ui', ms: PICK_WAIT_MS,
    draw(ctx, p, params, w, h) {
      const round = reelPickStateOf(params);
      const phase = params.phase ?? 'ask';
      const answering = phase === 'answer';
      const ms = params.ms ?? (answering ? PICK_REVEAL_MS : PICK_WAIT_MS);
      const elapsed = p * ms;

      // 押したリール(-1 = 届いていない)。正誤は「押した == 正解の位置」の事実だけで決まる
      const pick = answering ? normalizePick(params.pick) : -1;
      const judged = pick >= 0;
      const answerIndex = round.answerIndex;
      const correct = judged && pick === answerIndex;
      /** 当落(役が成立するか)。**正誤とは別物**。false のときだけ盤面が不成立を言う */
      const win = params.win === true;

      // 判定の進行(0 のあいだは結果を伏せたまま)
      const verdictP = answering
        ? clamp01((elapsed - PICK_VERDICT_DELAY_MS) / PICK_VERDICT_MS)
        : 0;
      const verdict = verdictP > 0;

      // 出だしだけ短くフェードイン。末尾は次のフェーズが差し替えるので落とさない
      let alpha = Math.min(1, elapsed / 160);
      if (answering && p > 0.9) alpha *= Math.max(0, 1 - (p - 0.9) / 0.1);
      else if (!answering && p > 0.96) alpha *= Math.max(0, 1 - (p - 0.96) / 0.04);
      if (alpha <= 0) return;

      const blink = 0.55 + 0.45 * Math.sin((elapsed / 1000) * Math.PI * 3);

      // ── レイアウト ──
      const cellW = (w - PICK_PAD_X * 2 - PICK_COL_GAP * 2) / 3;
      const cellX = (i) => PICK_PAD_X + i * (cellW + PICK_COL_GAP);

      /* ── 縮小は「発表」だけ(2026-08-15 U69)────────────────────────────
       * 【旧】compact:true を渡した再生は出題も発表も 0.74 倍で描いていた。
       *   ところが出題中は hold:true で **背景が1つ前(通常ステージ)のまま**なので、
       *   縮めて空けた下側から覗けるのは CZ盤面ではなく通常ステージの絵。
       *   つまり出題を縮める理由が無く、**問題文と選択肢が小さいだけ**だった
       *   (「3択クイズが小さく表示されることがある」= CZ突入経由の出題)。
       * 【新】出題は必ずフルサイズ。縮小は発表(phase:'answer')に限る。
       *   発表の瞬間に hold が解けて背景が CZ へ切り替わるので、
       *   そこで初めて「下から CZ盤面が覗ける」という当初の狙い(V3)が成立する。
       * シナリオが出題へ compact を渡しても効かない = 二度と小さくならない。 */
      const compact = params.compact === true && answering;
      const LY = compact ? PICK_VERDICT_LAYOUT.compact : PICK_VERDICT_LAYOUT.full;
      if (compact) {
        ctx.save();
        ctx.translate((w - w * PICK_COMPACT_SCALE) / 2, PICK_COMPACT_TOP);
        ctx.scale(PICK_COMPACT_SCALE, PICK_COMPACT_SCALE);
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      // ── 全面背景(モード名バーやステージ絵を伏せる = 当落バレ防止にも効く)──
      ctx.fillStyle = 'rgba(5,9,20,0.94)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(124,243,255,0.04)';
      for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2);
      ctx.strokeStyle = verdict
        ? (correct ? 'rgba(76,224,160,0.95)' : 'rgba(255,90,90,0.8)')
        : `rgba(124,243,255,${0.35 + 0.3 * blink})`;
      ctx.lineWidth = 2.4;
      ctx.strokeRect(3, 3, w - 6, h - 6);

      /* ── 見出し(足元)。compact は帯に潜るので出さない ──
       *
       * 右側の1行は、判定が出るまでは操作案内(第1停止が答え)、
       * **判定が出たら正解サービスの分類**へ差し替える(2026-08-15 学習強化 L4)。
       *   ・設問にも選択肢にも無い情報を1つだけ足す = 答え合わせに学びが増える
       *   ・行は増やさない(既にある行の中身を入れ替えるだけ)ので座席割りは不変
       *
       * ■ compact に足さない理由
       *   compact は LY.headY が null で、detailY:190(画面y143)が
       *   告知プレート直前の実質下限。**行を増やす余地が物理的に無い**。
       *   ※ U69 で3本ともフルサイズになったため、いまは当選版でもこの行が出る。 */
      if (LY.headY != null) {
        strokedText(ctx, 'AWS QUIZ', 14, LY.headY, {
          size: 12, color: '#7cf3ff', edge: 'rgba(0,10,30,0.9)', align: 'left',
        });
        let footText = '第1停止が答え';
        let footColor = 'rgba(190,225,255,0.8)';
        if (verdict && isLearnEnabled()) {
          const service = resolveServiceByQuizAnswer(round.choices[answerIndex]);
          const cat = service ? categoryOfService(service) : null;
          if (cat) {
            footText = `カテゴリ: ${cat.label}`;
            footColor = cat.color;
          }
        }
        strokedText(ctx, footText, w - 14, LY.headY, {
          size: 11, color: footColor, edge: 'rgba(0,10,30,0.9)', align: 'right', heavy: false,
        });
      }

      // ── 問題文(上部プレート)。発表中も出したままにして問と答えをつなぐ ──
      {
        ctx.save();
        const qIn = clamp01(elapsed / 240);
        ctx.globalAlpha = alpha * (answering ? 1 : qIn);
        const qTop = PICK_Q_TOP + (answering ? 0 : (1 - easeOutCubic(qIn)) * -6);
        roundRect(ctx, 10, qTop, w - 20, PICK_Q_H, 7);
        ctx.fillStyle = 'rgba(124,243,255,0.10)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(124,243,255,0.35)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        /*
         * min は **画面で 13px** を確保する(compact なら ×0.74 されるぶん持ち上げる)。
         * 下限フック(lcdanims.js の LCD_ANIM_MIN_FONT_PX = 11)より上に置くこと。
         */
        const qSize = fitFont(ctx, round.question, w - 40, {
          max: 19, min: pickMinFont(13, compact),
        });
        strokedText(ctx, round.question, w / 2, qTop + PICK_Q_H / 2, {
          size: qSize, color: '#ffffff', edge: 'rgba(0,10,30,0.95)',
        });
        ctx.restore();
      }

      // ── 3択のマス(左 / 中 / 右 = リール番号そのもの)──
      for (let i = 0; i < 3; i++) {
        const x = cellX(i);
        const y = PICK_GRID_TOP;
        const pop = answering ? 1 : clamp01((elapsed - 100 - i * 70) / 220);
        if (pop <= 0) continue;

        const isPick = verdict && judged && i === pick;
        const isAnswer = verdict && i === answerIndex && verdictP > 0.35;
        // 決まったマス以外は沈める(どれを選んだか / どれが正解かを一目で分かるようにする)
        let dim = 1;
        if (verdict && !isPick && !isAnswer) dim = 0.28;

        let border = 'rgba(255,255,255,0.28)';
        let label = 'rgba(255,255,255,0.92)';
        let fill = 'rgba(12,20,38,0.9)';
        let glow = 0;
        if (isPick && correct) {
          // 押したマスが正解(緑 = 正解の色。当落の色ではない)
          border = '#4ce0a0';
          label = '#c8ffe4';
          fill = 'rgba(10,52,38,0.95)';
          glow = 22 * blink;
        } else if (isPick) {
          border = '#ff5a5a';
          label = '#ffd6d6';
          fill = 'rgba(74,16,16,0.95)';
          glow = 18 * blink;
        } else if (isAnswer) {
          border = '#4ce0a0';
          label = '#c8ffe4';
          fill = 'rgba(10,52,38,0.92)';
          glow = 12;
        } else if (!answering) {
          // 待っている間は3つとも等しく光らせる(どれかが熱い、を匂わせない)
          border = `rgba(124,243,255,${0.45 + 0.35 * blink})`;
          fill = 'rgba(16,40,60,0.9)';
        }

        ctx.save();
        ctx.globalAlpha = alpha * pop * dim;
        ctx.translate(x + cellW / 2, y + PICK_CELL_H / 2);
        let s = answering ? 1 : easeOutBack(pop);
        if (isPick) s = 1.05 + (blink - 0.55) * 0.03;
        ctx.scale(s, s);
        ctx.translate(-cellW / 2, -PICK_CELL_H / 2);

        roundRect(ctx, 0, 0, cellW, PICK_CELL_H, 10);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = border;
        ctx.lineWidth = isPick ? 3 : 1.6;
        if (glow > 0) { ctx.shadowColor = border; ctx.shadowBlur = glow; }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // ミニリール(待機中は回り、判定が出たら止まる)
        drawMiniReel(ctx, cellW / 2, PICK_REEL_CY, {
          spin: elapsed / 1000 + i * 0.33,
          color: border,
          running: !verdict,
          alpha: 0.95,
        });

        // どのリールか(左 / 中 / 右 + キー)
        strokedText(ctx, `${PICK_LABELS[i]}  ${PICK_KEYS[i]}`, cellW / 2, PICK_NAME_Y, {
          size: 15, color: 'rgba(200,230,255,0.9)', edge: 'rgba(0,10,30,0.95)', heavy: false,
        });
        /*
         * 選択肢(このマスの主役)。長いサービス名は幅に合わせて詰める。
         * min は **LCD_ANIM_MIN_FONT_PX(11)以上**にすること。
         * それ未満を返すと lcdanims.js の下限フックが描画時だけ 11px へ持ち上げ、
         * 測った幅より広く描かれてマスからはみ出す(2026-08-15 実測)。
         */
        const choice = round.choices[i] ?? '';
        const cSize = fitFont(ctx, choice, cellW - 16, {
          max: 17, min: pickMinFont(PICK_MIN_FONT_PX, compact),
        });
        strokedText(ctx, choice, cellW / 2, PICK_CHOICE_Y, {
          size: cSize, color: label, edge: 'rgba(0,10,30,0.95)',
        });

        // 正解のマスに小さな印(発表後だけ)
        if (isAnswer) {
          ctx.globalAlpha = alpha * dim * clamp01((verdictP - 0.35) / 0.25);
          strokedText(ctx, '正解', cellW - 20, 14, {
            size: pickMinFont(PICK_MIN_FONT_PX, compact), color: '#4ce0a0', edge: 'rgba(0,20,10,0.95)',
          });
        }
        ctx.restore();
      }

      // ── 進行バー(装飾。告知プレートの裏に回ってよい)──
      // 待っている間だけ左右に流れて「まだ止めていない」を伝える
      if (!verdict) {
        const bx = 60;
        const bw = w - 120;
        const t = (elapsed / 1400) % 1;
        ctx.save();
        ctx.globalAlpha = alpha * 0.7;
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        roundRect(ctx, bx, PICK_BAR_Y, bw, 5, 2.5);
        ctx.fill();
        ctx.fillStyle = 'rgba(124,243,255,0.9)';
        roundRect(ctx, bx + (bw - 90) * t, PICK_BAR_Y, 90, 5, 2.5);
        ctx.fill();
        ctx.restore();
      }

      // ── 判定(正誤。**事実だけ**を言う)──
      {
        let text = '第1停止で回答';
        let col = '#ffffff';
        let size = 15;
        if (verdict && judged) {
          text = correct ? '正解!!' : '不正解…';
          col = correct ? '#7bffc4' : '#ff5a5a';
          size = LY.verdictSize;
        } else if (verdict) {
          // 押したリールが届かなかった(payload 欠落)。嘘をつかず判定は伏せる
          text = '';
        }
        if (text) {
          ctx.save();
          ctx.globalAlpha = alpha * (verdict ? 1 : blink);
          strokedText(ctx, text, w / 2, LY.verdictY, {
            size, color: col, edge: 'rgba(0,10,30,0.95)', heavy: true,
          });
          ctx.restore();
        }
      }

      /* ── 内訳(正解の場所 / 当落)────────────────────────────────
       * ここが「正誤と当落は別物」を伝える行。
       *   不正解 … どのリールが正解だったかを必ず教える(学びを残す)
       *   非当選 … 「役は不成立…」を添える(正解でも成立しないことがある、が伝わる)
       * 当選版は告知プレートが『CZ突入』を出すので、当落はそちらに任せて書かない。 */
      if (verdict && verdictP > 0.3) {
        const parts = [];
        if (!judged || !correct) {
          parts.push(`正解は ${PICK_LABELS[answerIndex]}「${round.choices[answerIndex] ?? ''}」`);
        }
        if (!win) parts.push('役は不成立…');
        /*
         * ── 2026-08-16 検証指摘 V80-14 ───────────────────────────────
         * 「正解は 中「DynamoDB」— 役は不成立…」を1本の中央寄せで描いていたが、
         * fitFont は下限(実効11px)より小さくしない約束なので、長い問題では
         * **縮めきれずに右端が切れて**いた(「…」まで読めない)。
         * 2つの情報は独立した文なので、**左右に振り分けて1行に収める**:
         *   左 … 正解の場所(学び)      / 右 … 役の当落
         * 1つしか無いときは今までどおり中央に置く。
         */
        const alphaD = alpha * clamp01((verdictP - 0.3) / 0.3);
        const style = { color: 'rgba(230,240,255,0.95)', edge: 'rgba(0,10,30,0.95)', heavy: false };
        const minSize = pickMinFont(PICK_MIN_FONT_PX, compact);
        if (parts.length >= 2) {
          const half = (w - 44) / 2;
          ctx.save();
          ctx.globalAlpha = alphaD;
          const s0 = fitFont(ctx, parts[0], half, { max: LY.detailSize, min: minSize, heavy: false });
          strokedText(ctx, parts[0], 16, LY.detailY, { ...style, size: s0, align: 'left' });
          const s1 = fitFont(ctx, parts[1], half, { max: LY.detailSize, min: minSize, heavy: false });
          strokedText(ctx, parts[1], w - 16, LY.detailY, { ...style, size: s1, align: 'right' });
          ctx.restore();
        } else if (parts.length === 1) {
          ctx.save();
          ctx.globalAlpha = alphaD;
          const dSize = fitFont(ctx, parts[0], w - 36, {
            max: LY.detailSize, min: minSize, heavy: false,
          });
          strokedText(ctx, parts[0], w / 2, LY.detailY, { ...style, size: dSize });
          ctx.restore();
        }
      }

      /* ── 判定スタンプ(○ / ✕)──
       * 押すのは **ミニリールの上**(マスの中心だと選択肢の文字を潰す)。 */
      if (verdict && judged) {
        const cx = cellX(pick) + cellW / 2;
        const cy = PICK_GRID_TOP + PICK_REEL_CY;
        const st2 = easeOutBack(clamp01(verdictP / 0.3));
        const stampColor = correct ? '#7bffc4' : '#ff5a5a';
        ctx.save();
        ctx.globalAlpha = alpha * Math.min(1, verdictP * 6);
        ctx.translate(cx, cy);
        ctx.scale(st2, st2);
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = stampColor;
        ctx.shadowColor = stampColor;
        ctx.shadowBlur = 18;
        if (correct) {
          ctx.beginPath();
          ctx.arc(0, 0, 25, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(-18, -18); ctx.lineTo(18, 18);
          ctx.moveTo(18, -18); ctx.lineTo(-18, 18);
          ctx.stroke();
        }
        ctx.restore();

        if (correct) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const r = 20 + easeOutCubic(verdictP) * 200;
          const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
          g.addColorStop(0, `rgba(76,224,160,${0.55 * (1 - verdictP)})`);
          g.addColorStop(1, 'rgba(76,224,160,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      ctx.restore();
      if (compact) ctx.restore();
    },
  },

  /**
   * 絵柄飛来予告。液晶の中を風が吹き、絵柄が1枚舞い込む。
   *
   * **飛んできた絵柄はそのゲームで必ず揃う**(先読み)。
   * 成立フラグと絵柄の対応はシナリオ側の when.flag で固定してあるので、
   * ここは渡された symbol をそのまま舞わせるだけ。嘘は構造的に起きない。
   *
   * params: { symbol='BELL', dir=1(1:左→右 / -1:右→左), scale=1, y=150, tile=null }
   *   tile … 外から絵柄タイル(canvas/Image)を渡したいとき用。既定は自前のオフスクリーン
   *
   * 配置: 中央帯を斜めに横切る。lcd.text のプレート(y168〜236)へ落ちないよう、
   *       舞う高さは y 60〜160 の範囲に収めている。
   */
  symbol_fly_in: {
    layer: 'fg', ms: 1400,
    draw(ctx, p, params, w, h) {
      const symbolId = params.symbol ?? 'BELL';
      const tile = params.tile ?? symbolTile(symbolId);
      const dir = (params.dir ?? 1) >= 0 ? 1 : -1;
      const baseY = params.y ?? 150;
      const scale = params.scale ?? 1;
      const alpha = fadeInOut(p, 0.08, 0.86);
      if (alpha <= 0) return;

      // ── 風(流れる筋)。絵柄より先に走らせて「吹いてきた」感を出す ──
      ctx.save();
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = 'rgba(214,236,255,0.75)';
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const seed = (i * 37) % 100 / 100;
        const t = ((p * 1.7) + seed) % 1;
        const ly = 52 + ((i * 17) % 110);
        const len = 40 + (i % 3) * 26;
        const lx = dir > 0 ? -len + t * (w + len) : w - t * (w + len);
        ctx.globalAlpha = alpha * 0.5 * Math.sin(t * Math.PI);
        ctx.lineWidth = 1 + (i % 3) * 0.7;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.quadraticCurveTo(lx + dir * len * 0.5, ly - 5, lx + dir * len, ly);
        ctx.stroke();
      }
      ctx.restore();

      // ── 舞う絵柄。横断しながらサインカーブで上下し、くるくる回る ──
      const e = easeOutCubic(clamp01(p));
      const travel = w + 180;
      const x = dir > 0 ? -90 + e * travel : w + 90 - e * travel;
      // 手前に来るほど大きく見えるよう、中央で少し膨らませる
      const near = 0.86 + Math.sin(clamp01(p) * Math.PI) * 0.34;
      const y = baseY + Math.sin(p * Math.PI * 2.6) * 26 - Math.sin(clamp01(p) * Math.PI) * 14;
      const rot = (dir > 0 ? 1 : -1) * (Math.sin(p * Math.PI * 3.2) * 0.42 + p * 0.5);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(rot);
      const s = scale * near;
      ctx.scale(s, s);
      if (tile) {
        // 縦横比はタイル側が持っている(U36)。ここは収める箱の大きさだけ指定する
        drawSymbolTile(ctx, tile, 96, 96);
      } else {
        // 画像が未ロード / 生成できない環境でも「何かが舞った」ことは伝える
        const def = SYMBOLS[symbolId];
        roundRect(ctx, -60, -30, 120, 60, 8);
        ctx.fillStyle = def?.bg ?? '#26324e';
        ctx.fill();
        ctx.strokeStyle = def?.accent ?? '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        strokedText(ctx, def?.label ?? symbolId, 0, 0, {
          size: 20, color: def?.fg ?? '#ffffff', edge: 'rgba(0,10,30,0.9)',
        });
      }
      ctx.restore();

      // ── 通ったあとの光の尾 ──
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 3; i++) {
        const tx = x - dir * i * 26;
        const ty = y + Math.sin((p - i * 0.03) * Math.PI * 2.6) * 26;
        const g = ctx.createRadialGradient(tx, ty, 2, tx, ty, 24 - i * 4);
        g.addColorStop(0, `rgba(214,236,255,${alpha * 0.22 / i})`);
        g.addColorStop(1, 'rgba(214,236,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(tx, ty, 24 - i * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  },

  /**
   * 分散マップ擬似連。ゲーム側の paramChange { param:'deepracer', step, cars, result } を受ける。
   * (2026-08-15 U58 で DeepRacer から題材を差し替え。旧ID: deepracer_race。
   *  param 名 'deepracer' は scripts/sim.mjs が読む内部の契約キーなので据え置き)
   *
   * **毎 step で必ず子の実行が走る**。step が上がるほど本数・速度・熱量が上がり、
   * step4 は画面いっぱいに実行が押し寄せる激アツの画になる。
   * params: { step=1(1〜4), cars=step(1〜12 / 同時に走る本数), label=null('×2' 等の擬似連カウント) }
   *
   * ここは「走る画」だけを担当し、突入・確定は**一切断言しない**。
   * 結果告知は result 付きイベントに紐づくシナリオ(dr_pseudo_result_*)の担当。
   *
   * 配置(2026-08-14 検証指摘: コメントと実装がズレていたので実測に合わせて直した):
   *   実行レーン  laneTop y94 から laneH(通常18 / step4は14)刻みで最大4レーン
   *               → トークンの中心は最大 y148、尾の光(y+8・半径最大7.6)まで含めて y164 まで。
   *               lcd.text のプレート(y168〜236)には掛からない。
   *   擬似連カウント 上部 y62(冒頭だけ大きく出て走り出しと同時に消える)。
   *   ※ 以前は「y100〜158」と書いてあったが、実装は laneTop 104 + 20×3 + 6 = y170 まで
   *      伸びていてプレートに掛かっていた。数値を触るときはこのコメントも直すこと。
   */
  distmap_race: {
    layer: 'fg', ms: 2200,
    draw(ctx, p, params, w, h) {
      const step = Math.round(clamp(params.step ?? 1, 1, 4));
      const cars = Math.round(clamp(params.cars ?? step, 1, 12));
      const label = params.label ?? null;
      const alpha = fadeInOut(p, 0.06, 0.9);
      if (alpha <= 0) return;

      // step ごとの熱量。速度・車体色・砂ぼこりの量が変わる
      const SPEED = [0.8, 1.0, 1.35, 1.9][step - 1];
      const COLOR = ['#8ad4ff', '#7bf7d0', '#ffd166', '#ff8a00'][step - 1];
      const laneTop = 94;
      const laneH = step >= 4 ? 14 : 18;
      const lanes = Math.min(4, Math.max(1, Math.ceil(cars / (step >= 4 ? 3 : 2))));

      ctx.save();
      ctx.globalAlpha = alpha;

      // ── コース(流れる路面ライン)──
      ctx.save();
      ctx.globalAlpha = alpha * 0.35;
      ctx.strokeStyle = COLOR;
      ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const t = ((p * SPEED * 1.6) + i / 10) % 1;
        const lx = w - t * (w + 60);
        ctx.beginPath();
        ctx.moveTo(lx, laneTop - 8);
        ctx.lineTo(lx - 26, laneTop - 8);
        ctx.stroke();
      }
      ctx.restore();

      // step4 は背景に熱を敷く
      if (step >= 4) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, laneTop - 20, 0, laneTop + 70);
        g.addColorStop(0, 'rgba(255,138,0,0)');
        g.addColorStop(0.5, `rgba(255,180,60,${0.18 + 0.1 * Math.sin(p * Math.PI * 8)})`);
        g.addColorStop(1, 'rgba(255,138,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, laneTop - 20, w, 90);
        ctx.restore();
      }

      // ── 子の実行(並列に走るトークン)──
      for (let i = 0; i < cars; i++) {
        const lane = i % lanes;
        const y = laneTop + lane * laneH + (step >= 4 ? 0 : 6);
        // 1本ごとに出発をずらして隊列に見せる
        const delay = (i / cars) * 0.32;
        const t = clamp01((p - delay) / (1 - delay * 0.6));
        if (t <= 0) continue;
        const x = -46 + t * (w + 92) * 1.0;
        const bob = Math.sin(p * Math.PI * 14 + i) * 1.6;

        // 後ろに散る光(旧: 砂ぼこり)
        ctx.save();
        ctx.globalAlpha = alpha * (step >= 3 ? 0.5 : 0.34);
        for (let k = 0; k < (step >= 3 ? 4 : 3); k++) {
          const d = (k + 1) * 12;
          ctx.fillStyle = `rgba(220,235,255,${Math.max(0, 0.3 - k * 0.07)})`;
          ctx.beginPath();
          ctx.arc(x - d, y + 8 + Math.sin(p * 20 + k + i) * 1.5, 3 + k * 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        ctx.save();
        ctx.translate(x, y + bob);
        const sc = step >= 4 ? 0.82 : 1;
        ctx.scale(sc, sc);
        drawRunToken(ctx, { body: i === 0 ? COLOR : '#8ad4ff', spin: p * SPEED });
        ctx.restore();
      }

      // ── 擬似連カウント(×2 / ×3 / ×4)──
      // 冒頭だけ大きく出して、走り出しと同時に消える
      if (label && p < 0.42) {
        const lp = clamp01(p / 0.16);
        const out = p > 0.32 ? 1 - (p - 0.32) / 0.1 : 1;
        ctx.save();
        ctx.globalAlpha = alpha * clamp01(out);
        ctx.translate(w / 2, 62);
        const sc = easeOutBack(lp) * (step >= 4 ? 1.5 : 1.15);
        ctx.scale(sc, sc);
        strokedText(ctx, label, 0, 0, {
          size: 30, color: COLOR, edge: 'rgba(10,4,0,0.95)',
        });
        ctx.restore();
      }
      ctx.restore();
    },
  },

  /**
   * SQS キューの結末。sqs_queue_hold(溜まる画)の続きとして「捌けた / DLQ行き」を描く。
   *
   * ユーザー仕様(2026-08-13):
   *   成功 … すべてのメッセージを処理できた(キューが空になる + 処理完了カウント)
   *   失敗 … エラーが発生してデッドレターキューへ流れた
   *
   * **result はシナリオからしか渡らない**。当落が確定したイベント
   * (zencho_end の ENTRY / MISS)に紐づくシナリオ専用。
   * params: { result='drained'|'dlq', count=4(処理前の件数), x=12, baseY=202 }
   */
  sqs_queue_result: {
    layer: 'ui', ms: 2000,
    draw(ctx, p, params, w, h) {
      const dlq = params.result === 'dlq';
      const count = Math.round(clamp(params.count ?? 4, 1, 5));
      const x = params.x ?? 12;
      const baseY = params.baseY ?? 202;
      const cardW = 66;
      const cardH = 18;
      const pitch = 22;
      const color = dlq ? '#ff5a5a' : '#4ce0a0';
      const alpha = fadeInOut(p, 0.08, 0.88);
      if (alpha <= 0) return;

      ctx.save();
      ctx.globalAlpha = alpha;

      // キューの土台
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      roundRect(ctx, x - 6, baseY - (count - 1) * pitch - 8, cardW + 12, (count - 1) * pitch + cardH + 30, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // メッセージが1枚ずつ捌けていく(成功=右へ流れて消える / 失敗=下のDLQへ落ちる)
      let processed = 0;
      for (let i = 0; i < count; i++) {
        // 上から順に処理される
        const order = count - 1 - i;
        const lp = clamp01((p - 0.1 - order * 0.13) / 0.22);
        if (lp >= 1) { processed++; continue; }
        const cy = baseY - i * pitch;
        ctx.save();
        ctx.globalAlpha = alpha * (1 - lp * 0.85);
        const dx = dlq ? lp * 10 : lp * 120;
        const dy = dlq ? lp * 70 : 0;
        ctx.translate(x + dx, cy + dy);
        ctx.rotate(dlq ? lp * 0.5 : 0);
        roundRect(ctx, 0, 0, cardW, cardH, 4);
        ctx.fillStyle = 'rgba(10,20,40,0.85)';
        ctx.fill();
        ctx.strokeStyle = dlq ? '#ff8a8a' : '#8ad4ff';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.fillStyle = dlq ? '#ff8a8a' : '#8ad4ff';
        ctx.fillRect(7, 5, 14, 9);
        strokedText(ctx, 'MSG', 44, cardH / 2, { size: 10, color: dlq ? '#ff8a8a' : '#8ad4ff', edge: 'rgba(0,10,30,0.9)' });
        ctx.restore();
      }

      // 処理完了カウント / DLQ の受け皿
      strokedText(ctx, dlq ? `DLQ ${processed}` : `${processed} / ${count} DONE`, x + cardW / 2, baseY + cardH + 12, {
        size: 11, color, edge: 'rgba(0,10,30,0.95)',
      });

      if (dlq) {
        // デッドレターキューの箱
        ctx.save();
        ctx.globalAlpha = alpha * clamp01((p - 0.25) / 0.2);
        roundRect(ctx, x - 4, baseY + 34, cardW + 8, 22, 5);
        ctx.fillStyle = 'rgba(60,10,10,0.9)';
        ctx.fill();
        ctx.strokeStyle = '#ff5a5a';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        strokedText(ctx, 'DEAD LETTER', x + cardW / 2, baseY + 45, {
          size: 9, color: '#ff8a8a', edge: 'rgba(30,0,0,0.9)', heavy: false,
        });
        ctx.restore();
      } else if (processed >= count) {
        // 空になったキューが光る
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const cx = x + cardW / 2;
        const cy = baseY - (count - 1) * pitch / 2;
        const r = 20 + easeOutCubic(clamp01((p - 0.6) / 0.4)) * 90;
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
        g.addColorStop(0, `rgba(76,224,160,${0.5 * (1 - clamp01((p - 0.6) / 0.4))})`);
        g.addColorStop(1, 'rgba(76,224,160,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        strokedText(ctx, 'QUEUE EMPTY', x + cardW / 2, baseY - (count - 1) * pitch - 18, {
          size: 12, color: '#4ce0a0', edge: 'rgba(0,20,10,0.95)',
        });
      }
      ctx.restore();
    },
  },

  /**
   * 【U34】ボーナス終了時の2段ジャッジ「ヘルスチェック → キャパシティチェック」。
   *
   * ■ 何のための画か(ユーザー指示「転落演出と同格の強度へ」)
   *   セット継続型ボーナス(ゴーストボーナスSP)の終わりに走る判定を、
   *   1枚絵の合否表示ではなく **2段階の物語** にする:
   *     p 0.00〜0.34  HEALTH CHECK   … プローブが走る(結果は伏せる)
   *     p 0.34〜0.44  1段目の判定     … HEALTHY なら緑のスタンプ
   *     p 0.44〜0.70  CAPACITY CHECK … キャパシティのゲージが伸びる
   *                                     しきい値の線を **越えれば継続**
   *     p 0.70〜1.00  結論           … 継続なら大きくドン + 光。
   *                                     不足なら音も光も足さず、静かに沈める(緩急)
   *
   * ■ 嘘をつかない
   *   ok は **setEnd(当落が確定したイベント)からしか渡さない**。
   *   ゲージの伸び方も ok で決まる(伸びてから落ちる、はやらない)。
   *
   * params: { ok=false, label='CAPACITY', addGames=0 }
   *   label … 1行の見出し(ゲーム側の healthLabel。既定は 'CAPACITY')
   */
  capacity_judge: {
    layer: 'ui', ms: 2600,
    draw(ctx, p, params, w, h) {
      const ok = Boolean(params.ok);
      const addGames = Math.max(0, Math.round(params.addGames ?? 0));
      const label = String(params.label ?? 'CAPACITY');
      const alpha = fadeInOut(p, 0.05, 0.94);
      if (alpha <= 0) return;

      const probeP = clamp01(p / 0.34);
      const stampP = clamp01((p - 0.34) / 0.1);
      const capP = clamp01((p - 0.44) / 0.26);
      const verdictP = clamp01((p - 0.7) / 0.3);
      // 1段目(ヘルスチェック)は継続・終了のどちらでも通す。
      // 「生きてはいるが器が足りない」= キャパシティ側で落とす筋書きにして、
      // 失敗をいきなり突きつけない(緩急)
      const health = true;

      ctx.save();
      ctx.globalAlpha = alpha;

      // ── 下地(緊張を作るために一度暗く落とす)──
      ctx.fillStyle = `rgba(4,8,18,${0.55 + (verdictP > 0 && ok ? 0.16 : 0.1)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = verdictP > 0
        ? (ok ? 'rgba(123,247,208,0.95)' : 'rgba(255,120,120,0.7)')
        : `rgba(138,212,255,${0.3 + 0.3 * Math.sin(p * Math.PI * 12)})`;
      ctx.lineWidth = 2.2;
      ctx.strokeRect(3, 3, w - 6, h - 6);

      /* ── 1段目: ヘルスチェック ──
       * 2026-08-16 検証指摘 V80-21⑦「前の画面の HEALTH CHECK が残って見える」:
       * 結論(継続 / 終了)が出たあともこの見出しだけ最後まで濃いまま残るので、
       * アニメの消えぎわに **次のセットの盤面の上へ文字だけが浮いて** 見えていた。
       * 2段目(CAPACITY CHECK)と同じく、結論が出たら役目を終えて沈む。 */
      ctx.save();
      ctx.globalAlpha = alpha * (1 - verdictP);
      strokedText(ctx, 'HEALTH CHECK', w / 2, 26, {
        size: 12, color: 'rgba(190,225,255,0.9)', edge: 'rgba(0,10,30,0.9)', heavy: false,
      });
      ctx.restore();
      {
        const baseY = 58;
        const x0 = 26;
        const x1 = w - 26;
        const span = x1 - x0;
        ctx.save();
        // 見出しと同じく、結論が出たら1段目は役目を終えて沈む(V80-21⑦)
        ctx.globalAlpha = alpha * (1 - verdictP);
        ctx.strokeStyle = stampP > 0 ? '#4ce0a0' : '#8ad4ff';
        ctx.lineWidth = 2.2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i <= 100; i++) {
          const t = i / 100;
          if (t > probeP) break;
          const x = x0 + span * t;
          const beat = (t * 4) % 1;
          const y = beat > 0.42 && beat < 0.58
            ? baseY - Math.sin(((beat - 0.42) / 0.16) * Math.PI) * 22
            : baseY + Math.sin(t * 40) * 1.4;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }
      if (stampP > 0) {
        ctx.save();
        ctx.globalAlpha = alpha * (1 - verdictP);
        const ss = easeOutBack(stampP);
        ctx.translate(w - 74, 58);
        ctx.rotate(-0.12);
        ctx.scale(ss, ss);
        roundRect(ctx, -46, -14, 92, 28, 8);
        ctx.fillStyle = 'rgba(12,74,52,0.9)';
        ctx.fill();
        ctx.strokeStyle = '#4ce0a0';
        ctx.lineWidth = 2;
        ctx.stroke();
        strokedText(ctx, health ? 'HEALTHY' : 'DOWN', 0, 1, {
          size: 15, color: '#7bffc4', edge: 'rgba(0,20,10,0.95)',
        });
        ctx.restore();
      }

      // ── 2段目: キャパシティチェック ──
      // 結論が出たらゲージは役目を終えるので、判定の文字と場所を譲る(薄く沈める)
      /* ── 2段目: キャパシティチェック ──
       * V80-16「上下が窮屈」: 結論の大文字(y118)がゲージ(y122〜142)と
       * 継続ライン(y158)の上に重なって出ていたため、3つが団子になっていた。
       * ゲージは結論が出れば役目を終えるので **完全に沈めて場所を明け渡す**
       * (以前は 20% 残していたので、その残りが大文字の裏に透けていた)。
       * ゲージ本体も 18px 上げて、結論の大文字がのびのび置ける高さを作る。 */
      if (capP > 0) {
        ctx.save();
        ctx.globalAlpha = alpha * (1 - verdictP);
        strokedText(ctx, `CAPACITY CHECK — ${label}`, w / 2, 90, {
          size: 12, color: 'rgba(255,224,102,0.9)', edge: 'rgba(20,14,0,0.9)', heavy: false,
        });

        // ゲージ。ok なら threshold を越え、不足ならその手前で止まる
        const gx = 44;
        const gw = w - 88;
        const gy = 106;
        const gh = 20;
        const threshold = 0.72;
        const target = ok ? 0.96 : 0.54;
        const fill = target * easeOutCubic(capP);
        roundRect(ctx, gx, gy, gw, gh, gh / 2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();
        ctx.save();
        roundRect(ctx, gx, gy, gw, gh, gh / 2);
        ctx.clip();
        const g = ctx.createLinearGradient(gx, 0, gx + gw, 0);
        g.addColorStop(0, '#8ad4ff');
        g.addColorStop(1, fill >= threshold ? '#7bf7d0' : '#ffd166');
        ctx.fillStyle = g;
        ctx.fillRect(gx, gy, gw * fill, gh);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, gx, gy, gw, gh, gh / 2);
        ctx.stroke();
        // しきい値の線(ここを越えたら継続)
        const tx = gx + gw * threshold;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx, gy - 6);
        ctx.lineTo(tx, gy + gh + 6);
        ctx.stroke();
        strokedText(ctx, '継続ライン', tx, gy + gh + 16, {
          size: 10, color: 'rgba(255,255,255,0.8)', edge: 'rgba(0,10,30,0.9)', heavy: false,
        });
        ctx.restore();
      }

      /* ── 結論 ──
       * 文字はすべて **演出テキスト帯(中心 y194 / プレート y168〜220)より上** に置く。
       * ボーナス最終ゲームは「RUSH 当選!!」の sticky 帯が残っていることがあり、
       * 下に置くと結論がプレートに隠れてしまうため(2026-08-14 U34)。 */
      if (verdictP > 0) {
        if (ok) {
          // 継続: 大きくドン + 光が弾ける(そのまま次セットの告知へ繋ぐ)
          slamHeadline(ctx, 'キャパシティ確保 — 継続!!', w / 2, 106, verdictP, {
            maxWidth: w - 40, size: 30, colors: ['#ffffff', '#7bf7d0'], edge: 'rgba(0,26,18,0.95)',
          });
          if (addGames > 0) {
            strokedText(ctx, `+${addGames}G`, w / 2, 140, {
              size: 22, color: '#ffe066', edge: 'rgba(30,20,0,0.95)',
            });
          }
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const r = 24 + easeOutCubic(verdictP) * 240;
          const g2 = ctx.createRadialGradient(w / 2, 106, 4, w / 2, 106, r);
          g2.addColorStop(0, `rgba(123,247,208,${0.45 * (1 - verdictP)})`);
          g2.addColorStop(1, 'rgba(123,247,208,0)');
          ctx.fillStyle = g2;
          ctx.beginPath();
          ctx.arc(w / 2, 106, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          // 終了: 光らせない・跳ねさせない。静かに沈めて終わる
          ctx.save();
          ctx.globalAlpha = alpha * verdictP;
          strokedText(ctx, 'キャパシティ不足 — ここまで', w / 2, 106, {
            size: 20, color: '#ffb3b3', edge: 'rgba(24,4,4,0.95)',
          });
          ctx.fillStyle = `rgba(2,4,10,${0.35 * verdictP})`;
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }
      }

      ctx.restore();
    },
  },

  /**
   * RUSH セット末のヘルスチェック(見せ場版)。
   * ユーザー要望「残りGが0になった時のヘルスチェックをもっと目立つように。
   * HEALTHYなら『継続!!』と大きく出して、また5G付与される感じに」。
   *
   * 液晶を全面で使い、前半は判定を伏せたまま緊張を作る:
   *   p 0.00〜0.52  プローブが左から右へ走り、心電図の波が脈打つ(結果は伏せる)
   *   p 0.52〜0.66  判定フラッシュ
   *   p 0.66〜1.00  HEALTHY → 「継続!!」が大きくドン + 付与G数 / UNHEALTHY → 赤の失敗表示
   *
   * params: { ok=false, addGames=0, label }
   *   ok       … true で継続。**当落が確定した setEnd 由来のシナリオからしか渡さない**
   *   addGames … 継続時に戻るゲーム数(AS_RUSH_CORE.setGames)。0 なら表示しない
   *
   * 文字はすべて液晶キャンバス(440×300)の中に描く。
   * lcd.text のプレート(y168〜236)とは重ならないよう、判定は y60〜150 に置く。
   */
  health_check_impact: {
    layer: 'ui', ms: 2600,
    draw(ctx, p, params, w, h) {
      const ok = Boolean(params.ok);
      const addGames = Math.max(0, Math.round(params.addGames ?? 0));
      const probeP = clamp01(p / 0.52);
      const revealed = p >= 0.52;
      const flashP = clamp01((p - 0.52) / 0.14);
      const verdictP = clamp01((p - 0.66) / 0.34);
      const alpha = fadeInOut(p, 0.05, 0.94);
      if (alpha <= 0) return;

      const col = !revealed ? '#8ad4ff' : (ok ? '#4ce0a0' : '#ff4d4d');

      ctx.save();
      ctx.globalAlpha = alpha;

      // ── 全面の下地(緊張を作るため一度暗くする)──
      ctx.fillStyle = `rgba(4,8,18,${0.55 + (revealed ? 0.18 : 0)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = revealed
        ? (ok ? 'rgba(76,224,160,0.95)' : 'rgba(255,77,77,0.9)')
        : `rgba(138,212,255,${0.35 + 0.35 * Math.sin(p * Math.PI * 12)})`;
      ctx.lineWidth = 2.4;
      ctx.strokeRect(3, 3, w - 6, h - 6);

      strokedText(ctx, 'ALB HEALTH CHECK', w / 2, 22, {
        size: 11, color: 'rgba(190,225,255,0.85)', edge: 'rgba(0,10,30,0.9)', heavy: false,
      });

      // ── 心電図(プローブ)。判定が出るまで走り続ける ──
      {
        const baseY = 104;
        const x0 = 18;
        const x1 = w - 18;
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const span = x1 - x0;
        const head = revealed ? 1 : probeP;
        for (let i = 0; i <= 120; i++) {
          const t = i / 120;
          if (t > head) break;
          const x = x0 + span * t;
          // 一定間隔で心拍のスパイクを入れる
          const beat = (t * 5) % 1;
          let y = baseY;
          if (beat > 0.42 && beat < 0.58) {
            const b = (beat - 0.42) / 0.16;
            y = baseY - Math.sin(b * Math.PI) * (revealed && ok ? 42 : 26);
          } else {
            y = baseY + Math.sin(t * 40) * 1.6;
          }
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // 走査ヘッドの光
        if (!revealed) {
          const hx = x0 + span * probeP;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(hx, baseY, 2, hx, baseY, 26);
          g.addColorStop(0, 'rgba(255,255,255,0.7)');
          g.addColorStop(1, 'rgba(138,212,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(hx, baseY, 26, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }

      // ── 判定前のラベル(点滅で焦らす)──
      if (!revealed) {
        ctx.save();
        ctx.globalAlpha = alpha * (0.55 + 0.45 * Math.sin(p * Math.PI * 18));
        strokedText(ctx, 'CHECKING…', w / 2, 150, {
          size: 20, color: '#8ad4ff', edge: 'rgba(0,10,30,0.95)',
        });
        ctx.restore();
      }

      // ── 判定の瞬間のフラッシュ ──
      if (revealed && flashP < 1) {
        ctx.save();
        ctx.globalAlpha = alpha * (1 - flashP) * 0.75;
        ctx.fillStyle = ok ? '#d8ffe8' : '#ffd0d0';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      /* ── 結果表示 ────────────────────────────────────────────────
       *
       * ── 「同時に出す告知は1枚」(2026-08-15 ユーザー指示 U64-7)────────────
       * 失敗側(RUSH 終了)は以前ここに 'UNHEALTHY' を y148 で描いており、
       * ちょうどその上へ **ポップアップ「RUSH 終了 / 引き戻しに期待」が重なって
       * 2枚**出ていた(y151〜236 は lcd.text の告知プレートの席)。
       *
       * どちらも同じ出来事なので、**文字はポップアップ側1枚に寄せた**:
       *   ・盤面(ここ)は失敗のとき **文字を1つも描かない**。
       *     赤い枠・止まった心電図・赤いフラッシュだけで「落ちた」を見せる
       *   ・言葉は data/scenarios/rushes.js の rush_end_all が出す
       *     lcd.text『RUSH 終了 / 引き戻しに期待』1枚だけ
       * 盤面に文字を戻すと、そのポップアップと必ず重なる(位置を変えても、
       * プレートは文言の行数で上端が y124 まで伸びる)。**戻さないこと。**
       * 継続側(ok:true)は upper.js / cz.js がテキストを出さない約束なので従来どおり。 */
      if (verdictP > 0 && ok) {
        const label = '継続!!';
        const s2 = easeOutBack(clamp01(verdictP / 0.32));
        const pulse = 1 + Math.sin(p * Math.PI * 14) * 0.03;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(w / 2, 148);
        ctx.scale(s2 * pulse, s2 * pulse);
        // 液晶の幅に収まる大きさまで詰める
        strokedText(ctx, label, 0, 0, {
          size: Math.min(54, Math.floor((w - 40) / Math.max(1, label.length) * 1.7)),
          color: '#7bffc4',
          edge: 'rgba(0,20,10,0.95)',
        });
        ctx.restore();
      }
      if (verdictP > 0) {
        // 継続時は付与G数を添える
        if (ok && addGames > 0 && verdictP > 0.28) {
          const ap = clamp01((verdictP - 0.28) / 0.3);
          ctx.save();
          ctx.globalAlpha = alpha * ap;
          ctx.translate(w / 2, 62 - easeOutCubic(ap) * 6);
          const as = easeOutBack(ap);
          ctx.scale(as, as);
          strokedText(ctx, `+${addGames}G`, 0, 0, {
            size: 30, color: '#ffe066', edge: 'rgba(30,20,0,0.95)',
          });
          ctx.restore();
        }

        // 継続時は緑の光が弾ける
        if (ok) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const r = 24 + easeOutCubic(verdictP) * 220;
          const g = ctx.createRadialGradient(w / 2, 130, 4, w / 2, 130, r);
          g.addColorStop(0, `rgba(76,224,160,${0.5 * (1 - verdictP)})`);
          g.addColorStop(1, 'rgba(76,224,160,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(w / 2, 130, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    },
  },

  /**
   * Bedrock 起動(Bedrock揃い = ALARM役 の導入)。
   * ユーザー要望「Bedrock が揃ったら LLM イベントが起きるようにして」。
   *
   * 絵柄が光る → AIチップに火が入る → 同心円のパルスが走る → MODEL INVOKED
   * → **プロンプトを受信しました** までの導入(1200ms)。
   * この直後に bedrock_typing が推論〜ストリーミング出力を担当するので、
   * 「起動 → 受信 → 推論 → 出力」で一続きの物語になる(2026-08-13 追加)。
   * params: { color='#ffd166' }
   *
   * 配置: bedrock_typing のパネル(y44〜120)と同じ帯に重ねる。
   * こちらが先に消えるので、生成パネルとぶつからない。
   */
  bedrock_boot: {
    layer: 'ui', ms: 1200,
    draw(ctx, p, params, w, h) {
      const color = params.color ?? '#ffd166';
      const cx = w / 2;
      const cy = 74;
      const alpha = fadeInOut(p, 0.1, 0.72);
      if (alpha <= 0) return;
      // プロンプト受信の一拍へ切り替わる位置。
      // このあと bedrock_typing のパネルが同じ帯へ被さるので、早めに出して読ませる
      const RECEIVE_AT = 0.36;

      ctx.save();
      ctx.globalAlpha = alpha;

      // 拡がるパルス(3重)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const rp = clamp01((p - i * 0.14) / 0.6);
        if (rp <= 0) continue;
        ctx.globalAlpha = alpha * (1 - rp) * 0.75;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3 - i * 0.6;
        ctx.beginPath();
        ctx.arc(cx, cy, 18 + easeOutCubic(rp) * 150, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // AIチップ(六角形)がせり上がって点灯する
      const chipP = clamp01(p / 0.3);
      const s = easeOutBack(chipP);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const x = Math.cos(a) * 26;
        const y = Math.sin(a) * 26;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -26, 0, 26);
      g.addColorStop(0, '#fff3c4');
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18 + Math.sin(p * Math.PI * 12) * 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(60,36,0,0.9)';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // 回路パターン(チップから外へ伸びる線)
      ctx.strokeStyle = 'rgba(60,36,0,0.55)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8);
        ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20);
        ctx.stroke();
      }
      ctx.restore();

      // サービス名(上)は最後まで出しっぱなし
      if (p > 0.24) {
        ctx.save();
        ctx.globalAlpha = alpha * clamp01((p - 0.24) / 0.2);
        strokedText(ctx, 'Amazon Bedrock', cx, cy - 44, {
          size: 10, color: 'rgba(255,240,200,0.9)', edge: 'rgba(0,10,30,0.9)', heavy: false,
        });
        ctx.restore();
      }

      // 起動ラベル(下)は MODEL INVOKED → プロンプトを受信しました の二拍。
      // 同じ位置で差し替えるので、下の帯(RUSH中の「DC n」など)へはみ出さない
      if (p > 0.24 && p < RECEIVE_AT + 0.05) {
        const lp = clamp01((p - 0.24) / 0.2);
        const out = clamp01((p - RECEIVE_AT) / 0.05);
        ctx.save();
        ctx.globalAlpha = alpha * lp * (1 - out);
        strokedText(ctx, 'MODEL INVOKED', cx, cy + 44, {
          size: 14, color, edge: 'rgba(0,10,30,0.95)',
        });
        ctx.restore();
      }
      if (p >= RECEIVE_AT) {
        const rp = clamp01((p - RECEIVE_AT) / 0.14);
        ctx.save();
        ctx.globalAlpha = alpha;
        // ちいさく跳ねて入れ替わる
        ctx.translate(cx, cy + 44);
        const rs = 0.86 + easeOutBack(rp) * 0.14;
        ctx.scale(rs, rs);
        strokedText(ctx, 'プロンプトを受信しました', 0, 0, {
          size: 13, color: '#ffffff', edge: 'rgba(0,10,30,0.95)',
        });
        ctx.restore();

        // 受信したことを絵でも見せる(チップへ吸い込まれる3つの粒)
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const t = clamp01((p - RECEIVE_AT - i * 0.05) / 0.22);
          if (t <= 0 || t >= 1) continue;
          const dx = -120 * (1 - easeOutCubic(t));
          ctx.globalAlpha = alpha * (1 - t) * 0.9;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx + dx - 5, cy - 1.5, 10, 3);
        }
        ctx.restore();
      }
      ctx.restore();
    },
  },

  /**
   * Bedrock ストリーミング生成予告。docs/BACKLOG.md「P: Bedrockタイピング予告」
   *
   * Bedrock のコンソール風パネルへ、推論結果が **トークンのチャンク単位** で
   * 流れ込む。リール停止に合わせて phase を 0 → 1 → 2 → 3 と上げると、
   * 出力し切るのが第3停止に重なる(= 何が生成されるかを最後まで引っ張れる)。
   *
   * ■「LLM が生成している感」の作り(2026-08-13 ユーザー要望)
   *   1. 等速タイプライターをやめ、2〜5文字のチャンクが不揃いな間合いで出る
   *      (割り付けは buildBedrockStream。文言を引いたときに1回だけ決める)
   *   2. 出力末尾に点滅カーソル ▍
   *   3. 上部のステータス行が PROMPT 受信 → 推論中… → ストリーミング出力 と遷移し、
   *      右肩の tokens カウンタがカタカタ増える(推論の間では止まる)
   *   4. 出力し切ると「推論完了 / 所要時間 / トークン数 / stop_reason」で締める
   *
   * params: { tier='weak', phase=0, revealSpan=0.18, ms }
   *   tier  … 'weak' | 'alarm' | 'mid' | 'gase' | 'hot'。文言の期待度。
   *           **'hot'(BONUS を含む)は当選が確定したシナリオからしか渡さない**
   *   phase … 0〜3。ストリームが (phase+1)/4 まで進む。0 で文言を引き直す
   *   revealSpan … そのフェーズぶんを流し切るのに使う尺(ms に対する割合)
   *
   * 配置: y 44〜120。lcd.text(y 168〜236)と取り合わないので、
   *       生成し終わりの告知テロップは lcd.text 側へ任せられる。
   */
  bedrock_typing: {
    layer: 'ui', ms: 2600,
    draw(ctx, p, params, w, h) {
      const line = bedrockLineOf(params);
      const tier = line.tier;
      const color = BEDROCK_COLORS[tier] ?? BEDROCK_COLORS.weak;
      const phase = Math.round(clamp(params.phase ?? 0, 0, 3));
      const ms = params.ms ?? 2600;
      const elapsed = p * ms;
      const alpha = fadeInOut(p, 0.05, 0.9);
      if (alpha <= 0) return;

      // このフェーズで流す区間。phase:3 で 100% 出力し切る
      const from = phase / 4;
      const to = (phase + 1) / 4;
      // ここは意図的に線形。イージングを掛けるとチャンクの間合いが潰れて
      // 「推論の間」が間に見えなくなる(等速タイプライターに逆戻りする)
      const k = clamp01(p / (params.revealSpan ?? 0.18));
      // 逆戻り防止。連打でフェーズが前後しても出力済みの文字は引っ込めない
      const ratio = Math.max(clamp01(from + (to - from) * k), line.ratio ?? 0);
      line.ratio = ratio;

      const st = bedrockStreamAt(line.stream, ratio);
      const done = ratio >= 0.999;
      const shown = line.text.slice(0, st.chars);
      // 0:PROMPT受信 / 1:推論中 / 2:ストリーミング出力 / 3:完了
      const stage = done
        ? 3
        : st.chars > 0
          ? (st.thinking ? 1 : 2)
          : (ratio < line.stream.firstAt * 0.55 ? 0 : 1);

      const px = 14;
      const py = 44;
      const pw = w - px * 2;
      const ph = 76;

      ctx.save();
      ctx.globalAlpha = alpha;

      // パネル(2026-08-14 検証 V31-01: 0.9 では背景の柄が透けて小さな行が沈むので 0.96 へ)
      roundRect(ctx, px, py, pw, ph, 8);
      ctx.fillStyle = 'rgba(8,12,26,0.96)';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = done && tier === 'hot' ? 2.4 : 1.4;
      if (tier === 'hot') {
        ctx.shadowColor = color;
        ctx.shadowBlur = 10 + Math.sin(p * Math.PI * 10) * 6;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      /* ── ヘッダ: サービス名 / 呼び出しているAPI / トークンカウンタ ──
       *
       * 2026-08-14 検証 V31-01:
       * API 名を固定座標(px+96)に置いていたため、U39 の最低フォント機構で
       * 『Amazon Bedrock』の幅が伸びた途端に食い込み、
       * 「Amazon BedrocInvokeModelWithResponseStream」と読める状態になっていた。
       * **実測した幅から座席を決める**ことで、フォント下限
       * (lcdanims.js の LCD_ANIM_MIN_FONT_PX)を動かしても重ならないようにする。
       * それでも入らない狭さのときは API 名を出さない
       * (サービス名とトークン数のほうが情報として重要。切り詰めた API 名は嘘になる)。
       */
      const headY = py + 13;
      strokedText(ctx, 'Amazon Bedrock', px + 10, headY, {
        size: 9, color: 'rgba(190,225,255,0.85)', edge: 'rgba(0,10,30,0.9)', align: 'left', heavy: false,
      });
      // strokedText は font を張ったまま抜けるので、その場で実寸を測れる
      const svcW = textWidth(ctx, 'Amazon Bedrock', 9);
      const tokenW = monoText(ctx, `tokens: ${st.tokens}`, px + pw - 10, headY, {
        size: 10, color: done ? color : 'rgba(225,242,255,0.92)', align: 'right',
      });
      const apiX = px + 10 + svcW + 10;
      const apiRoom = (px + pw - 10 - tokenW - 10) - apiX;
      const apiName = 'InvokeModelWithResponseStream';
      ctx.font = `700 8px ${FONT_MONO}`;
      if (textWidth(ctx, apiName, 8) <= apiRoom) {
        monoText(ctx, apiName, apiX, headY, { size: 8, color: 'rgba(150,190,230,0.7)' });
      }

      // ── ステータス行: 3段階の遷移(いまどこかを色で示す)──
      const sy = py + 30;
      if (done) {
        monoText(ctx, '✓ 推論完了', px + 10, sy, { size: 10, color });
        monoText(ctx, `latency ${line.stream.latency}s`, px + pw - 10, sy, {
          size: 9, color: 'rgba(200,225,255,0.75)', align: 'right',
        });
      } else {
        let sx = px + 10;
        for (let i = 0; i < BEDROCK_STAGES.length; i++) {
          const on = i === stage;
          // 「推論中…」で待たされているあいだは息づかせる
          const blink = on && i === 1 ? 0.55 + 0.45 * Math.sin(elapsed / 110) : 1;
          sx += monoText(ctx, BEDROCK_STAGES[i], sx, sy, {
            size: 9,
            color: on ? color : i < stage ? 'rgba(200,225,255,0.5)' : 'rgba(160,185,210,0.28)',
            alpha: blink,
          }) + 5;
          if (i < BEDROCK_STAGES.length - 1) {
            sx += monoText(ctx, '›', sx, sy, { size: 9, color: 'rgba(160,185,210,0.4)' }) + 5;
          }
        }
      }

      // ── 進捗バー ──
      const barY = py + 39;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(px + 10, barY, pw - 20, 2);
      ctx.fillStyle = color;
      ctx.fillRect(px + 10, barY, (pw - 20) * ratio, 2);
      if (!done && ratio > 0) {
        // 流れている先端に光の粒
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * (st.thinking ? 0.3 : 0.9);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + 10 + (pw - 20) * ratio - 6, barY - 1, 8, 4);
        ctx.restore();
      }

      // ── 本文(等幅フォント。文字サイズは全文に合わせて先に決める)──
      // 表示中の文字列に合わせて縮めると、流れるたびに字の大きさが揺れてしまう
      const textY = py + 54;
      const maxW = pw - 42;
      let size = 15;
      ctx.font = `700 ${size}px ${FONT_MONO}`;
      while (size > 10 && textWidth(ctx, line.text, size) > maxW) {
        size -= 1;
        ctx.font = `700 ${size}px ${FONT_MONO}`;
      }
      // 直近に届いたチャンクだけ色を変えて「いま届いた」ことを見せる
      const head = shown.slice(0, st.lastFrom);
      const tail = shown.slice(st.lastFrom);
      const tx = px + 14;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4.5;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,10,30,0.95)';
      ctx.strokeText(shown, tx, textY);
      ctx.fillStyle = done ? color : '#ffffff';
      ctx.fillText(head, tx, textY);
      if (tail) {
        const headW = textWidth(ctx, head, size);
        ctx.save();
        ctx.fillStyle = done ? color : '#fff8d8';
        if (!done) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
        }
        ctx.fillText(tail, tx + headW, textY);
        ctx.restore();
      }

      // ── カーソル(出力が止まっているあいだ点滅する)──
      if (!done) {
        const blinkOn = Math.floor(elapsed / 230) % 2 === 0;
        const idle = st.thinking || st.chars === 0;
        monoText(ctx, '▍', tx + textWidth(ctx, shown, size) + 1, textY, {
          size, color, alpha: idle ? (blinkOn ? 1 : 0.12) : 1,
        });
      }

      /* ── 締め(推論が終わったことの小さな証跡)──
       * 2026-08-14 検証 V31-01: 不透明度 0.55 の細字がパネルの下地と本文の光に
       * 埋もれて読めなかったので、座布団を敷いて文字も明るくした。 */
      if (done) {
        const srText = 'stop_reason: end_turn';
        const srY = py + ph - 9;
        ctx.font = `700 8px ${FONT_MONO}`;
        const srW = textWidth(ctx, srText, 8);
        ctx.save();
        roundRect(ctx, px + 10, srY - 8, srW + 9, 16, 5);
        ctx.fillStyle = 'rgba(3,7,18,0.85)';
        ctx.fill();
        ctx.restore();
        monoText(ctx, srText, px + 14, srY, {
          size: 8, color: 'rgba(206,228,250,0.92)',
        });
      }

      // 出力し切ったときの縁飾り
      if (done && tier === 'hot') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(px, py, px + pw, py + ph);
        g.addColorStop(0, 'rgba(255,138,0,0)');
        g.addColorStop(0.5, `rgba(255,224,102,${0.22 + 0.18 * Math.sin(p * Math.PI * 8)})`);
        g.addColorStop(1, 'rgba(255,138,0,0)');
        ctx.fillStyle = g;
        roundRect(ctx, px, py, pw, ph, 8);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    },
  },

  /* ══ 2026-08-14 追加: 新タイプの予告用アニメ ═══════════════════════════ */

  /**
   * レバーONフリーズ「全リージョン同時停止」。data/scenarios/freeze.js 専用。
   *
   * ゲーム側(game/flow.js の FLOW.FREEZE)がリールを止めている間に流す全面演出。
   * 演出がゲームを止めているわけではない点に注意(止めているのはゲーム側)。
   *
   * 流れ:
   *   0.00〜0.30 … 世界中のリージョンの灯が1つずつ落ちていく(無音の溜め)
   *   0.30〜0.50 … 完全な暗転。中央で1点だけ脈打つ
   *   0.50〜1.00 … 虹の衝撃波が広がり、FREEZE の文字が浮かび上がる
   *
   * params: { ms=2600 }
   */
  freeze_all_stop: {
    layer: 'fg', ms: 2600,
    draw(ctx, p, params, w, h) {
      const cx = w / 2;
      const cy = 148;

      // ── 暗転(全消灯)──
      ctx.save();
      ctx.fillStyle = `rgba(2,4,10,${clamp01(p / 0.18) * 0.94})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // ── リージョンの灯。等間隔に並んだ点が順に落ちる ──
      const cols = 8;
      const rows = 4;
      ctx.save();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          // 落ちる順番はバラけさせる(一斉ではなく "次々と落ちる" 不穏さ)
          const order = ((i * 37) % (cols * rows)) / (cols * rows);
          const off = clamp01((p - order * 0.28) / 0.06);
          const lit = 1 - off;
          if (lit <= 0.02) continue;
          const x = 44 + c * ((w - 88) / (cols - 1));
          const y = 62 + r * 34;
          ctx.globalAlpha = lit * 0.9;
          ctx.fillStyle = lit > 0.5 ? '#7bf7d0' : '#ff8a5a';
          ctx.beginPath();
          ctx.arc(x, y, 3 + lit * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = lit * 0.28;
          ctx.beginPath();
          ctx.arc(x, y, 9 + lit * 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // ── 暗転中の脈 ──
      if (p >= 0.28 && p < 0.54) {
        const q = (p - 0.28) / 0.26;
        const pulse = Math.sin(q * Math.PI * 3) ** 2;
        ctx.save();
        ctx.globalAlpha = 0.55 * pulse;
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 60);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, 60, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 0.8;
        strokedText(ctx, 'ALL REGIONS HALTED', cx, cy + 76, {
          size: 11, color: 'rgba(200,220,255,0.85)', edge: 'rgba(0,0,0,0.9)', heavy: false,
        });
        ctx.restore();
      }

      // ── 虹の衝撃波 + FREEZE ──
      if (p >= 0.5) {
        const q = clamp01((p - 0.5) / 0.5);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const rq = clamp01(q * 1.4 - i * 0.13);
          if (rq <= 0 || rq >= 1) continue;
          const rad = 24 + easeOutQuart(rq) * 300;
          ctx.globalAlpha = (1 - rq) * 0.5;
          ctx.strokeStyle = `hsl(${(q * 720 + i * 60) % 360}, 95%, 65%)`;
          ctx.lineWidth = 5 - i;
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();

        const pop = easeOutBack(clamp01(q / 0.4));
        ctx.save();
        ctx.globalAlpha = clamp01(q / 0.2);
        ctx.translate(cx, cy);
        ctx.scale(pop, pop);
        strokedText(ctx, 'FREEZE', 0, 0, {
          size: 46, color: `hsl(${(q * 620) % 360}, 95%, 70%)`, edge: 'rgba(0,0,0,0.95)',
        });
        ctx.restore();
      }
    },
  },

  /**
   * 【必須要望】風がレア役を運んでくる。
   *
   * CloudFront のエッジから吹く風(= Kinesis の流れ)が液晶を右→左に吹き抜け、
   * 絵柄が 1〜3 枚流れてきて中央に着地する。着地した絵柄がそのゲームの成立役。
   * 運ぶのは U24(2026-08-14)以降 **レア役だけ**(呼び出し側の縛り。
   * data/scenarios/yokoku-wind.js を参照)。アニメ自体は絵柄IDを選ばない。
   *
   * ■ 嘘をつかないための約束(演出契約)
   *   運ぶ絵柄は **必ず成立役に一致させる**(シナリオ側が when.flag で縛る)。
   *   ハズレのゲームで使うガセ版は count:0 を渡して **何も運ばれない** 画にする。
   *   「風は吹いたが何も乗ってこなかった」= 結論を出していないので整合が崩れない。
   *
   * params:
   *   symbol   … 運ぶ絵柄ID(data/symbols.js の id。既定 'BELL')
   *   count    … 運ぶ枚数 0〜3。**0 = 何も運ばれない(ガセ版)**
   *   strength … 0:青(弱) / 1:金(レア) / 2:虹(プレミア)
   *   dir      … -1 で右→左(既定) / 1 で左→右
   *
   * 配置: 着地点は y=132 の帯。lcd.text のプレート(y168〜236)には掛からない。
   */
  edge_wind_carry: {
    layer: 'fg', ms: 1800,
    draw(ctx, p, params, w, h) {
      const symbolId = params.symbol ?? 'BELL';
      const count = Math.round(clamp(params.count ?? 1, 0, 3));
      const strength = Math.round(clamp(params.strength ?? 0, 0, 2));
      const dir = (params.dir ?? -1) >= 0 ? 1 : -1;
      const landY = params.y ?? 132;
      const alpha = fadeInOut(p, 0.08, 0.86);
      if (alpha <= 0) return;

      // 虹(strength 2)は時間で色相が回る。金・青は固定色
      const hue = (p * 620) % 360;
      const accent = strength === 2 ? `hsl(${hue}, 92%, 66%)` : LEVEL_COLORS[strength];
      // 風そのものの色。強いほど濃く、長く尾を引く
      const windAlpha = [0.42, 0.58, 0.74][strength];
      const streaks = [9, 13, 18][strength];

      // ── 1. 吹き抜ける風の筋 ──────────────────────────
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < streaks; i++) {
        const seed = ((i * 53) % 100) / 100;
        const t = ((p * 1.9) + seed) % 1;
        const ly = 46 + ((i * 23) % 128);
        const len = 44 + (i % 4) * 30 + strength * 12;
        const lx = dir > 0 ? -len + t * (w + len) : w - t * (w + len);
        ctx.globalAlpha = alpha * windAlpha * Math.sin(t * Math.PI);
        ctx.strokeStyle = strength === 0 ? 'rgba(214,236,255,0.85)' : accent;
        ctx.lineWidth = 1 + (i % 3) * 0.8;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.quadraticCurveTo(lx + dir * len * 0.5, ly - 6 - (i % 3) * 2, lx + dir * len, ly);
        ctx.stroke();
      }
      ctx.restore();

      // ── 2. エッジロケーション(風の吹き出し口)──────────
      {
        const ex = dir > 0 ? 16 : w - 16;
        const puff = 0.5 + 0.5 * Math.sin(p * Math.PI * 5);
        ctx.save();
        ctx.globalAlpha = alpha * 0.5 * puff;
        const g = ctx.createRadialGradient(ex, landY - 6, 3, ex, landY - 6, 46);
        g.addColorStop(0, accent);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ex, landY - 6, 46, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ── 3. 運ばれてくる絵柄 ─────────────────────────
      if (count <= 0) {
        /*
         * ガセ版。何も運ばれない代わりに、砂粒(= 流れていくログの断片)だけが
         * 通り過ぎる。ここで絵柄を出すと「ベルが来た」と読めてしまうので絶対に出さない。
         */
        ctx.save();
        ctx.globalAlpha = alpha * 0.55;
        ctx.fillStyle = 'rgba(200,222,246,0.9)';
        for (let i = 0; i < 16; i++) {
          const seed = ((i * 71) % 100) / 100;
          const t = ((p * 2.3) + seed) % 1;
          const px = dir > 0 ? t * w : w - t * w;
          const py = landY - 34 + ((i * 19) % 70) + Math.sin((t + seed) * Math.PI * 3) * 7;
          const s = 1.2 + (i % 3) * 0.7;
          ctx.globalAlpha = alpha * 0.5 * Math.sin(t * Math.PI);
          ctx.fillRect(px, py, s * 2.4, s);
        }
        ctx.restore();
        return;
      }

      const tileW = 92;
      const tileH = 46;
      const pitch = tileW + 10;
      const startX = (w - (count - 1) * pitch) / 2;
      for (let i = 0; i < count; i++) {
        // 1枚ずつ順に飛んでくる。最後の1枚が着地したところで演出が締まる
        const delay = i * 0.12;
        const local = clamp01((p - delay) / (0.62 - delay * 0.4));
        if (local <= 0) continue;
        const e = easeOutCubic(local);
        const targetX = startX + i * pitch;
        const fromX = dir > 0 ? -tileW : w + tileW;
        const x = fromX + (targetX - fromX) * e;
        // 風に乗って上下に揺れながら来て、着地でぴたりと止まる
        const sway = (1 - e) * Math.sin((p * 6) + i) * 20;
        const y = landY + sway;
        const rot = (1 - e) * dir * (0.5 + Math.sin(p * 7 + i) * 0.3);
        const scale = 0.72 + e * 0.28;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(scale, scale);

        // 着地後の縁取り(強度の色)
        if (e >= 0.98) {
          const glow = 0.55 + 0.45 * Math.sin(p * Math.PI * 9 + i);
          ctx.save();
          ctx.shadowColor = accent;
          ctx.shadowBlur = (6 + strength * 8) * glow;
          roundRect(ctx, -tileW / 2 - 3, -tileH / 2 - 3, tileW + 6, tileH + 6, 9);
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2 + strength;
          ctx.stroke();
          ctx.restore();
        }

        const tile = symbolTile(symbolId);
        if (tile) {
          // 潰さずに枠へ収める(U36)。枠(tileW×tileH)は着地の当たり判定として残す
          drawSymbolTile(ctx, tile, tileW, tileH * 1.6);
        } else {
          // 画像が未ロードでも「何が運ばれてきたか」は必ず読めるようにする
          const def = SYMBOLS[symbolId];
          roundRect(ctx, -tileW / 2, -tileH / 2, tileW, tileH, 8);
          ctx.fillStyle = def?.bg ?? '#26324e';
          ctx.fill();
          ctx.strokeStyle = def?.accent ?? '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
          strokedText(ctx, def?.label ?? symbolId, 0, 0, {
            size: 18, color: def?.fg ?? '#ffffff', edge: 'rgba(0,10,30,0.9)',
          });
        }
        ctx.restore();
      }

      // ── 4. 着地したときの一言(サービス名。結論は言わない)──
      if (p > 0.55) {
        ctx.save();
        ctx.globalAlpha = alpha * clamp01((p - 0.55) / 0.15);
        strokedText(ctx, 'EDGE WIND', w / 2, landY - 44, {
          size: 11, color: accent, edge: 'rgba(0,10,30,0.9)', heavy: false,
        });
        ctx.restore();
      }
    },
  },

  /**
   * AZ 切替シャッター。液晶にシャッターが降り、上がると絵/文言が変わっている。
   *
   * 閉じている時間の長さ(hold)で期待度を出す = 「長く閉まっているほど熱い」。
   * シャッターの裏で何が起きたかは after の文言で伝えるが、
   * **当落は断言しない**(結論を出すのは当落確定イベントに紐づくシナリオの担当)。
   *
   * params:
   *   hold  … 閉じている時間の割合 0.1〜0.6(既定 0.3)。長いほど熱い
   *   label … シャッターに書く文字(既定 'AZ 切替')
   *   after … 開いたあとに出る文字(既定 'ap-northeast-1c ACTIVE')
   *            AZ の呼び方は実在の名前に統一する(2026-08-14 F5。'AZ-1c' は存在しない表記)
   *   color … 強調色(既定 '#7cf3ff')
   */
  /**
   * BLUE/GREEN デプロイ 2択(U18 / 2026-08-14 ユーザー指示)。
   *
   * ■ 何を見せる演出か
   *   液晶が青(Blue = 現行)と緑(Green = 新)の2色に割れ、
   *   それぞれの側に **実際の絵柄画像** が乗る:
   *     青 … REPLAY(リプレイ / DynamoDB) = 現行のまま「もう1回」
   *     緑 … MELON (スイカ / S3)         = 新しいほうへ「切り替え」
   *   トラフィックの寄り(バー)で引っ張ってから、第3停止でどちらかが確定する。
   *   絵柄は絵柄飛来予告(symbol_fly_in / edge_wind_carry)と同じ symbolTile 経由なので、
   *   リール上の絵柄と絵が一致する(画像未ロード時だけ色とラベルのプレースホルダ)。
   *
   * ■ 嘘をつかない作り
   *   このアニメは **勝敗を自分で決めない**。params.win をシナリオが渡し、
   *   シナリオは when.flag で成立役を縛っている(青=リプレイ / 緑=スイカ)。
   *   したがって画面に出る勝ち側は必ずそのゲームの成立役と一致する。
   *   演出RNGが関わるのは「どちらへ寄せて煽るか(lean)」だけで、
   *   これはシナリオの重み付き抽選(director)で選ばれる。
   *
   * params:
   *   win   … 'blue' | 'green'(確定側。phase:'decide' で初めて見せる)
   *   lean  … 'even' | 'blue' | 'green'  煽りの寄せ方(バーがどちらに寄って揺れるか)
   *   phase … 'shift'(切替中・当落は伏せる)/ 'decide'(確定)
   *   ms    … 尺
   *
   * レイアウト: y40〜166 に収める(y168〜236 は lcd.text のプレート、y266〜 はテロップ帯)。
   */
  bluegreen_choice: {
    layer: 'ui', ms: 1600,
    draw(ctx, p, params, w, h) {
      const phase = params.phase === 'decide' ? 'decide' : 'shift';
      const win = params.win === 'green' ? 'green' : params.win === 'blue' ? 'blue' : null;
      const lean = params.lean === 'blue' || params.lean === 'green' ? params.lean : 'even';
      const decided = phase === 'decide' && win != null;

      const alpha = Math.min(1, p / 0.12) * (p > 0.9 ? Math.max(0, 1 - (p - 0.9) / 0.1) : 1);
      if (alpha <= 0) return;

      const top = 40;
      const bottom = 166;
      const midX = w / 2;

      /* ── トラフィックの寄り(0 = 全部 Blue / 1 = 全部 Green)──
       * 切替中は寄せ方(lean)に応じて揺らして煽る。確定後は勝ち側へ振り切る。 */
      let shift;
      if (decided) {
        const k = easeOutCubic(clamp01(p / 0.35));
        const from = lean === 'green' ? 0.72 : lean === 'blue' ? 0.28 : 0.5;
        shift = from + ((win === 'green' ? 1 : 0) - from) * k;
      } else {
        const center = lean === 'green' ? 0.66 : lean === 'blue' ? 0.34 : 0.5;
        shift = clamp(center + Math.sin(p * Math.PI * 3.2) * 0.16, 0.06, 0.94);
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      /* ── パネルの下地(2026-08-14 V21-09)──
       * この帯はキャラ(液晶の char サブレイヤー)より **後** に描かれる。
       * 以前は半透明の地しか敷いていなかったので、後ろのサメが透けて
       * 「TRAFFIC SHIFTED」等の文字と混ざって読めなかった。
       * 2択の絵は主役なので、帯のあいだは下を隠し切る。 */
      ctx.fillStyle = 'rgba(6,10,22,0.94)';
      ctx.fillRect(0, top, w, bottom - top);

      // ── 2色の地(勝敗が出たら負け側を沈める)──
      const sides = [
        {
          id: 'blue', x: 0, wpx: midX, symbol: 'REPLAY', label: 'BLUE(現行)',
          col: '#5aa8ff', fill: 'rgba(20,48,110,0.92)',
        },
        {
          id: 'green', x: midX, wpx: w - midX, symbol: 'MELON', label: 'GREEN(新)',
          col: '#4ce0a0', fill: 'rgba(12,74,52,0.92)',
        },
      ];
      for (const s of sides) {
        const lose = decided && s.id !== win;
        ctx.save();
        ctx.globalAlpha = alpha * (lose ? 0.3 : 1);
        ctx.fillStyle = s.fill;
        ctx.fillRect(s.x, top, s.wpx, bottom - top);
        // 縁(確定側は光る)
        const hot = decided && s.id === win;
        ctx.strokeStyle = hot ? '#ffffff' : s.col;
        ctx.lineWidth = hot ? 3 : 1.6;
        if (hot) {
          ctx.shadowColor = s.col;
          ctx.shadowBlur = 18 * (0.6 + 0.4 * Math.sin(p * Math.PI * 10));
        }
        ctx.strokeRect(s.x + 1.5, top + 1.5, s.wpx - 3, bottom - top - 3);
        ctx.shadowBlur = 0;

        // 側の名前
        strokedText(ctx, s.label, s.x + s.wpx / 2, top + 16, {
          size: 12, color: hot ? '#ffffff' : 'rgba(255,255,255,0.85)', edge: 'rgba(0,10,30,0.9)',
        });

        /* ── 実際の絵柄画像(絵柄飛来予告と同じ経路)──
         * 2026-08-14 V21(U36): ここは「どちらの絵柄を狙うか」を見せる主役なので、
         * **縦横比を保ったまま** できるだけ大きく出す(潰れると別の絵柄に見える)。
         * 箱は 112×80。原画が正方形なので実寸は 80×80 になり、
         * 下のトラフィックバー(y134〜146)にも見出しにも掛からない。 */
        const tileW = 112;
        const tileH = 80;
        const cx = s.x + s.wpx / 2;
        const cy = top + 54;
        const pop = hot ? 1 + easeOutBack(clamp01(p / 0.4)) * 0.12 : 1;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(pop, pop);
        const tile = symbolTile(s.symbol);
        if (tile) {
          drawSymbolTile(ctx, tile, tileW, tileH);
        } else {
          const def = SYMBOLS[s.symbol];
          roundRect(ctx, -tileW / 2, -tileH / 2, tileW, tileH, 8);
          ctx.fillStyle = def?.bg ?? '#26324e';
          ctx.fill();
          ctx.strokeStyle = def?.accent ?? '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
          strokedText(ctx, def?.label ?? s.symbol, 0, 0, {
            size: 16, color: def?.fg ?? '#ffffff', edge: 'rgba(0,10,30,0.9)',
          });
        }
        ctx.restore();
        ctx.restore();
      }

      // ── 中央の切替ライン(トラフィックの境目)──
      const lineX = shift * w;
      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(lineX, top);
      ctx.lineTo(lineX, bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // ── トラフィック配分バー ──
      const bx = 26;
      const bw = w - 52;
      const by = bottom - 32;
      roundRect(ctx, bx, by, bw, 12, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fill();
      ctx.save();
      roundRect(ctx, bx, by, bw, 12, 6);
      ctx.clip();
      ctx.fillStyle = '#5aa8ff';
      ctx.fillRect(bx, by, bw * (1 - shift), 12);
      ctx.fillStyle = '#4ce0a0';
      ctx.fillRect(bx + bw * (1 - shift), by, bw * shift, 12);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.2;
      roundRect(ctx, bx, by, bw, 12, 6);
      ctx.stroke();

      // ── 見出し(何のメーターかを名乗る。U16 と同じ考え方)──
      // 結論の1行なので、帯の中でも黒い座布団を敷いて確実に読ませる(V21-09)
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      roundRect(ctx, w / 2 - 92, bottom - 19, 184, 20, 8);
      ctx.fillStyle = 'rgba(2,6,16,0.9)';
      ctx.fill();
      ctx.restore();
      strokedText(ctx, decided ? 'TRAFFIC SHIFTED' : 'TRAFFIC SHIFTING…', w / 2, bottom - 8, {
        size: 11, color: decided ? '#ffe066' : 'rgba(210,230,255,0.9)',
        edge: 'rgba(0,10,30,0.9)', heavy: false,
      });

      ctx.restore();
    },
  },

  az_shutter: {
    layer: 'fg', ms: 1900,
    draw(ctx, p, params, w, h) {
      const hold = clamp(params.hold ?? 0.3, 0.1, 0.6);
      const label = params.label ?? 'AZ 切替';
      const after = params.after ?? 'ap-northeast-1c ACTIVE';
      const color = params.color ?? '#7cf3ff';
      // 上下から降りてくる幕が覆う範囲(タイトルバーとテロップ帯は避ける)
      const top = 40;
      const bottom = 262;
      const mid = (top + bottom) / 2;
      const half = (bottom - top) / 2;

      const closeEnd = (1 - hold) * 0.45;
      const openStart = closeEnd + hold;
      let cover;                        // 0=全開 / 1=全閉
      if (p < closeEnd) cover = easeOutCubic(clamp01(p / closeEnd));
      else if (p < openStart) cover = 1;
      else cover = 1 - easeOutCubic(clamp01((p - openStart) / Math.max(0.05, 1 - openStart)));

      ctx.save();

      // ── 上下のシャッター板(ルーバーの横筋つき)──
      const drawPanel = (y0, y1) => {
        if (y1 - y0 <= 0) return;
        const g = ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, '#1a2740');
        g.addColorStop(0.5, '#2b3c5c');
        g.addColorStop(1, '#14203a');
        ctx.fillStyle = g;
        ctx.fillRect(0, y0, w, y1 - y0);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        for (let y = y0 + 6; y < y1; y += 9) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      };
      drawPanel(top, top + half * cover);
      drawPanel(bottom - half * cover, bottom);

      // ── 合わせ目の光の線 ──
      if (cover > 0.02 && cover < 0.999) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gy = ctx.createLinearGradient(0, mid - 14, 0, mid + 14);
        gy.addColorStop(0, 'rgba(124,243,255,0)');
        gy.addColorStop(0.5, color);
        gy.addColorStop(1, 'rgba(124,243,255,0)');
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = gy;
        ctx.fillRect(0, mid - 14, w, 28);
        ctx.restore();
      }

      // ── 閉じている間の表示(何が起きているかだけ伝える)──
      if (cover >= 0.995) {
        const blink = 0.6 + 0.4 * Math.sin(p * Math.PI * 12);
        ctx.globalAlpha = blink;
        strokedText(ctx, label, w / 2, mid - 10, { size: 20, color, edge: 'rgba(0,10,30,0.9)' });
        ctx.globalAlpha = 1;
        strokedText(ctx, 'SWITCHING…', w / 2, mid + 16, {
          size: 11, color: 'rgba(232,241,255,0.85)', edge: 'rgba(0,10,30,0.9)', heavy: false,
        });
      }

      // ── 開いたあとの文言(シャッターの裏で切り替わっていた)──
      if (p > openStart && cover < 0.6) {
        ctx.globalAlpha = clamp01((0.6 - cover) / 0.6);
        strokedText(ctx, after, w / 2, mid - 46, { size: 17, color, edge: 'rgba(0,10,30,0.9)' });
      }

      ctx.restore();
    },
  },

  /**
   * AWS豆知識カード(U59)。ボーナス中の1ゲームおきに1枚だけ出す。
   * params: { service=null(固定したいとき), dismiss=false, ms }
   *
   * ■ 寿命
   *   ms は長め(既定20秒)にしてあり、**次のゲームのレバーONで
   *   dismiss:true の再生に差し替えられて消える**
   *   (data/scenarios/trivia.js の waitFor:'leverOn' キュー)。
   *   LcdAnims.play は同じIDのアニメを重ねずに差し替えるので、
   *   差し替えた瞬間に前のカードは消える。
   *   レバーが来ないまま尺切れになっても自然に消えるので固まらない。
   *
   * ■ レイアウト(TRIVIA_CARD を参照。下端は必ず 148 以下)
   *   y  50  見出し「AWS 豆知識」+ アクセントバー / NEW ピル / 右端にカテゴリピル
   *   y  82  サービス名(幅に合わせて 21px → 14px まで詰める)
   *   y 116  1行概要(16px → 13px まで詰める)
   *   y 136  AWS図鑑カウンタ(右寄せ・小さく薄く。カード下端 146 の内側)
   *
   * ■ 学習の付加情報(2026-08-15 学習強化 L3)
   *   カテゴリピル / NEW / 図鑑カウンタの3つは **?learn=off で全部消える**
   *   (消すと U59 当時の見た目に戻る)。どれも乱数を引かず、
   *   数字は data/learnlog.js が解決済みの値をそのまま出す。
   */
  aws_trivia_card: {
    layer: 'ui', ms: 20000,
    draw(ctx, p, params, w, h) {
      if (params.dismiss === true) return;
      const card = triviaStateOf(params);
      const ms = params.ms ?? 20000;
      const elapsed = p * ms;

      // 出だしだけふわっと。末尾は差し替え or 尺切れで消えるので落とさない
      const inP = clamp01(elapsed / 260);
      let alpha = inP;
      if (p > 0.94) alpha *= Math.max(0, 1 - (p - 0.94) / 0.06);
      if (alpha <= 0) return;

      const { x, y: cardY, w: cw, h: ch } = TRIVIA_CARD;
      // 出だしは少し上から降りてくる(枠線に潜らない 6px まで)
      const y = cardY + (1 - easeOutCubic(inP)) * -6;

      ctx.save();
      ctx.globalAlpha = alpha;

      // ── カードの地(これがそのまま文字の下敷きになる)──
      roundRect(ctx, x, y, cw, ch, 10);
      ctx.fillStyle = 'rgba(4,10,22,0.94)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(124,243,255,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // 走査線(クイズ盤面と同じ質感)
      ctx.save();
      roundRect(ctx, x, y, cw, ch, 10);
      ctx.clip();
      ctx.fillStyle = 'rgba(124,243,255,0.04)';
      for (let ly = y; ly < y + ch; ly += 6) ctx.fillRect(x, ly, cw, 2);
      ctx.restore();

      // ── 見出し ──
      ctx.fillStyle = 'rgba(124,243,255,0.85)';
      ctx.fillRect(x + 14, y + 8, 3, 14);
      const HEAD = 'AWS 豆知識';
      strokedText(ctx, HEAD, x + 24, y + 15, {
        size: 12, color: '#7cf3ff', edge: 'rgba(0,10,30,0.9)', align: 'left',
      });

      /* ── 学習の付加情報(L3)。?learn=off のときは3つとも描かない ──
       * カテゴリ … 「どの分野のサービスか」という、カード本文には無い情報を1つだけ足す
       * NEW      … 図鑑に**初めて入った**ときだけ(2回目以降は出ない)
       * カウンタ … 集めている感。数字は learnlog の解決済みの値をそのまま出す */
      if (isLearnEnabled()) {
        // カテゴリピルは見出し行の右端(サービス名の行には降ろさない)
        const cat = categoryOfService(card.service);
        drawPill(ctx, x + cw - 14, y + 15, cat.label, { size: 11, color: cat.color, align: 'right' });

        // NEW は見出しの直後。見出しの実幅を測ってから置く(重ならないように)
        if (card.first === true) {
          ctx.save();
          ctx.font = `900 12px ${FONT_HEAVY}`;
          const headW = textWidth(ctx, HEAD, 12);
          ctx.restore();
          drawPill(ctx, x + 24 + headW + 8, y + 15, 'NEW', { size: 10, color: '#ffe066' });
        }

        // 図鑑カウンタ(カード下端 y+108 の内側。画面yでは 136)。
        // 数え直しは triviaStateOf が1再生に1回だけ済ませている(毎フレーム引かない)
        const dex = card.dex;
        ctx.save();
        ctx.globalAlpha = alpha * 0.6;
        strokedText(ctx, `AWS図鑑 ${dex.owned}/${dex.total}`, x + cw - 16, y + 98, {
          size: 10, color: '#9fd8ff', edge: 'rgba(0,10,30,0.9)', align: 'right', heavy: false,
        });
        ctx.restore();
      }

      // ── サービス名(主役。幅に合わせて詰める)──
      const nameSize = fitFont(ctx, card.service, cw - 34, { max: 21, min: 14 });
      strokedText(ctx, card.service, x + cw / 2, y + 46, {
        size: nameSize, color: '#ffffff', edge: 'rgba(0,10,30,0.95)',
      });

      // 区切り線
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 22, y + 64);
      ctx.lineTo(x + cw - 22, y + 64);
      ctx.stroke();

      // ── 1行概要(読ませたい本文)──
      const lineSize = fitFont(ctx, card.oneLiner, cw - 34, { max: 16, min: 13, heavy: false });
      strokedText(ctx, card.oneLiner, x + cw / 2, y + 82, {
        size: lineSize, color: '#cfe6ff', edge: 'rgba(0,10,30,0.95)', heavy: false,
      });

      ctx.restore();
    },
  },
};

export default LCD_ANIMS_EXTRA;
