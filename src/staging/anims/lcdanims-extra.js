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
 *   - y 266〜300 … テロップ帯 …………………………… 使わない
 *   - lcd.text は (220, 194) にメイン、(220, 220) にサブが出る(lcdanims.js の _drawText)。
 *     y 178〜230 の中央帯はテキストと取り合いになるので、文字を置くなら避ける。
 *   - AS_RUSH は y 74〜108 に DC アイコン列、中央 y 136 に「DC n」、y 159〜173 に
 *     「純増◯枚/G 継続◯%」、右端 x 340〜430 に SET/枚/STOCK がある。
 *     RUSH 中に出すアニメは左下(x 70〜200 / y 176〜232)か最下段の帯に置く。
 */

import { buildQuizRound } from '../../data/quiz.js';
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

/* ══ AWSクイズルーレット ═══════════════════════════════
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

/** 絵柄タイルのオフスクリーンキャッシュ(絵柄IDごとに1枚) */
const SYMBOL_TILE_CACHE = new Map();
const SYMBOL_TILE_W = 120;
const SYMBOL_TILE_H = 60;

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
    tile = downscaleStepwise(img, SYMBOL_TILE_W, SYMBOL_TILE_H);
  } catch (e) {
    tile = null;
  }
  if (tile) SYMBOL_TILE_CACHE.set(symbolId, tile);
  return tile;
}

/**
 * DeepRacer の車体を1台描く(原点が車の中心)。
 * 既存の deep_racer_run と擬似連 deepracer_race で同じ絵を使うための共通化。
 * @param {number} spin 車輪と LiDAR の回転量(0→1 で1周ぶん程度)
 */
function drawRacerCar(ctx, { body = '#8ad4ff', spin = 0 } = {}) {
  const g = ctx.createLinearGradient(0, -9, 0, 6);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, body);
  g.addColorStop(1, '#1b4f7a');
  roundRect(ctx, -20, -8, 40, 14, 5);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,30,60,0.85)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // フロントのカメラ
  ctx.fillStyle = '#14263f';
  roundRect(ctx, 10, -6, 9, 7, 2);
  ctx.fill();
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.arc(16, -2.5, 1.6, 0, Math.PI * 2);
  ctx.fill();

  // 上面の LiDAR(くるくる回る)
  ctx.save();
  ctx.translate(-4, -12);
  ctx.fillStyle = '#e8f1ff';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(spin * 26);
  ctx.fillStyle = '#25a97f';
  ctx.fillRect(0, -1.2, 4.5, 2.4);
  ctx.restore();

  // タイヤ
  for (const wx of [-11, 11]) {
    ctx.save();
    ctx.translate(wx, 6);
    ctx.fillStyle = '#121a2a';
    ctx.beginPath();
    ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(spin * 34);
    ctx.strokeStyle = 'rgba(230,240,255,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-3.4, 0);
    ctx.lineTo(3.4, 0);
    ctx.stroke();
    ctx.restore();
  }
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
      const bx = params.x ?? 118;
      const by = params.y ?? 238;
      const bw = params.w ?? (w - (params.x ?? 118) - 16);
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
      strokedText(ctx, label, bx + bw / 2, by + bh / 2, {
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
        strokedText(ctx, String(params.sub), cx, cy + 15, {
          size: 10, color: 'rgba(255,255,255,0.8)', edge: 'rgba(0,10,30,0.9)', heavy: false,
        });
      }

      // 振り切れた瞬間の警告(メーターの右隣。RUSHのキャラ定位置とは重ならない)
      if (shown > 1) {
        const blink = 0.5 + 0.5 * Math.sin(p * Math.PI * 16);
        ctx.globalAlpha = alpha * (0.55 + 0.45 * blink);
        strokedText(ctx, 'THRESHOLD!!', cx + r + 12, cy - 22, {
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
   * ミニ DeepRacer が液晶の下段を走り抜ける賑やかし。IDEAS.md 2-35
   * params: { y=244, dir=1(1:左→右 / -1:右→左), color='#8ad4ff' }
   *
   * 砂ぼこりが y+8 を中心に最大半径 7.8 まで広がるので、既定値は
   * テロップ帯(y 266〜)に掛からない 244 にしてある(以前は 256 で 272 まで届いていた)。
   */
  deep_racer_run: {
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
      drawRacerCar(ctx, { body, spin: p });
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
   *   ただし **y168〜236 は lcd.text の告知プレート専用に空けておく**。
   *   LcdAnims は ui レイヤーのアニメを描いてから最後にテキスト帯を描くので、
   *   ここに要素を置くと告知テロップに確実に隠れる。読ませたい問題文と選択肢は
   *   y0〜166 に、進行ラベルはテキストプレートの下 y240〜262 に置く。
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

      // ── レイアウト ──
      const padX = 12;
      const gap = 8;
      const cellW = (w - padX * 2 - gap) / 2;
      const cellH = 50;
      const gridTop = 58;
      const rowGap = 6;
      const cellXY = (i) => [
        padX + (i % 2) * (cellW + gap),
        gridTop + Math.floor(i / 2) * (cellH + rowGap),
      ];
      const cellCenter = (i) => {
        const [x, y] = cellXY(i);
        return [x + cellW / 2, y + cellH / 2];
      };

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

      // ── 見出し ──
      strokedText(ctx, 'AWS QUIZ', 14, 14, {
        size: 12, color: '#7cf3ff', edge: 'rgba(0,10,30,0.9)', align: 'left',
      });
      strokedText(ctx, 'どのサービス?', w - 14, 14, {
        size: 11, color: 'rgba(190,225,255,0.8)', edge: 'rgba(0,10,30,0.9)', align: 'right', heavy: false,
      });

      // ── 問題文(上部に大きく)──
      ctx.save();
      const qIn = clamp01(elapsed / 260);
      ctx.globalAlpha = alpha * (phase === 'start' ? qIn : 1);
      const qTop = 24 + (phase === 'start' ? (1 - easeOutCubic(qIn)) * -8 : 0);
      roundRect(ctx, 10, qTop, w - 20, 28, 7);
      ctx.fillStyle = 'rgba(124,243,255,0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(124,243,255,0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      const qSize = fitFont(ctx, round.question, w - 36, { max: 19, min: 12 });
      strokedText(ctx, round.question, w / 2, qTop + 14, {
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

      // ── 進行インジケータ(装飾。y168〜236 はテロップ優先なので隠れてよい)──
      {
        const barY = 178;
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

      // ── 進行ラベル(テキストプレート y168〜236 の下に置く)──
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
        strokedText(ctx, label, w / 2, 250, {
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
        ctx.drawImage(tile, -60, -30, 120, 60);
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
   * DeepRacer 擬似連。ゲーム側の paramChange { param:'deepracer', step, cars, result } を受ける。
   *
   * **毎 step で必ず車が走る**。step が上がるほど台数・速度・熱量が上がり、
   * step4 は画面いっぱいに車が押し寄せる激アツの画になる。
   * params: { step=1(1〜4), cars=step(1〜12), label=null('×2' 等の擬似連カウント) }
   *
   * ここは「走る画」だけを担当し、突入・確定は**一切断言しない**。
   * 結果告知は result 付きイベントに紐づくシナリオ(dr_pseudo_result_*)の担当。
   *
   * 配置: 走行レーンは y 100〜158。lcd.text のプレート(y168〜236)には掛からない。
   * 擬似連カウントは上部 y62 に出す。
   */
  deepracer_race: {
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
      const laneTop = 104;
      const laneH = step >= 4 ? 14 : 20;
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

      // ── 車 ──
      for (let i = 0; i < cars; i++) {
        const lane = i % lanes;
        const y = laneTop + lane * laneH + (step >= 4 ? 0 : 6);
        // 台ごとに出発をずらして隊列に見せる
        const delay = (i / cars) * 0.32;
        const t = clamp01((p - delay) / (1 - delay * 0.6));
        if (t <= 0) continue;
        const x = -46 + t * (w + 92) * 1.0;
        const bob = Math.sin(p * Math.PI * 14 + i) * 1.6;

        // 砂ぼこり
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
        drawRacerCar(ctx, { body: i === 0 ? COLOR : '#8ad4ff', spin: p * SPEED });
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

      // ── 結果表示 ──
      if (verdictP > 0) {
        const label = ok ? '継続!!' : 'UNHEALTHY';
        const s2 = easeOutBack(clamp01(verdictP / 0.32));
        const pulse = ok ? 1 + Math.sin(p * Math.PI * 14) * 0.03 : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(w / 2, 148);
        ctx.scale(s2 * pulse, s2 * pulse);
        // 液晶の幅に収まる大きさまで詰める
        const size = ok ? 54 : 34;
        strokedText(ctx, label, 0, 0, {
          size: Math.min(size, Math.floor((w - 40) / Math.max(1, label.length) * 1.7)),
          color: ok ? '#7bffc4' : '#ff8a8a',
          edge: 'rgba(0,20,10,0.95)',
        });
        ctx.restore();

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

      // パネル
      roundRect(ctx, px, py, pw, ph, 8);
      ctx.fillStyle = 'rgba(8,12,26,0.9)';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = done && tier === 'hot' ? 2.4 : 1.4;
      if (tier === 'hot') {
        ctx.shadowColor = color;
        ctx.shadowBlur = 10 + Math.sin(p * Math.PI * 10) * 6;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // ── ヘッダ: サービス名 / 呼び出しているAPI / トークンカウンタ ──
      strokedText(ctx, 'Amazon Bedrock', px + 10, py + 13, {
        size: 9, color: 'rgba(190,225,255,0.85)', edge: 'rgba(0,10,30,0.9)', align: 'left', heavy: false,
      });
      monoText(ctx, 'InvokeModelWithResponseStream', px + 96, py + 13, {
        size: 8, color: 'rgba(150,190,230,0.7)',
      });
      monoText(ctx, `tokens: ${st.tokens}`, px + pw - 10, py + 13, {
        size: 10, color: done ? color : 'rgba(225,242,255,0.92)', align: 'right',
      });

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

      // ── 締め(推論が終わったことの小さな証跡)──
      if (done) {
        monoText(ctx, 'stop_reason: end_turn', px + 14, py + ph - 9, {
          size: 8, color: 'rgba(180,210,240,0.55)',
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
};

export default LCD_ANIMS_EXTRA;
