/**
 * 学習ログ(2026-08-15 学習強化 L1)。docs/BACKLOG.md「学習コンテンツ強化」
 *
 * ══ 何を記録するのか ═══════════════════════════════════════════════
 * この台のコンセプトは「遊んで覚える」だが、これまで
 *   ・豆知識カードは1ゲームで消える
 *   ・クイズの正誤はその瞬間の音と文字だけ
 * で、**遊び終わったあとに何も残らなかった**。ここはその受け皿で、
 *   ① 出会ったサービス(AWS図鑑)… 説明を読んだ / 答えを見た サービスの正式名
 *   ② クイズの正誤              … 問題IDごとの ok / ng
 * の2つだけを localStorage へ積む。
 *
 * ══ 【最重要】ゲームには1ミリも触らない ═══════════════════════════
 *   ・**ゲーム抽選RNG(engine/rng.js)を引かない**。Math.random すら使わない
 *   ・game/ からは import されない(scripts/sim.mjs・compare-drivers.mjs が壊れるため)
 *   ・当落・スコア・称号(data/titles.js)には一切影響しない。
 *     学習のご褒美は getBadges() の **独立した学習バッジ**で、
 *     スコアの称号とは名前も体系も分けてある
 *     (混ぜると「画面に出ている到達率が実測と食い違う」事故になる)
 *
 * ══ 【最重要】localStorage も location も無い環境で落ちないこと ═══
 * scripts/compare-drivers.mjs の staged ドライバは createActions と
 * LcdAnims.play(→ pickTrivia)を **Node 上で実際に走らせる**。
 * ここが1行でも素で `localStorage` / `location` を参照すると、
 * 「演出はゲームに干渉しない」を証明するスクリプトごと落ちる。
 * したがって:
 *   ・参照は必ず `typeof X === 'undefined'` ガードを通す(data/scenarios/trivia.js と同じ作法)
 *   ・localStorage の例外(Safari プライベート・容量超過)は **静かに握りつぶす**。
 *     握りつぶしたあとも **メモリ上だけで最後まで動き続ける**(遊びは止めない)
 *
 * ■ 保存形式(キーは awslot.learn.v1)
 *   { v:1, services: { [正式名]: { n, firstAt } }, quiz: { [問題id]: { ok, ng } } }
 *   セッション集計(今日出会ったサービス / 今日のクイズ成績)は **メモリのみ**。永続しない。
 *
 * ■ URLクエリ(読み方は data/scenarios/trivia.js の TRIVIA_DEBUG と同じ)
 *   ?learn=off / ?learn=0 … 記録も学習表示も全部止める(押し付けない)
 *   ?learnreset=1         … 起動時に記録を消す
 */

import {
  CATEGORIES,
  DEX_NAMES,
  DEX_TOTAL,
  categoryOfService,
  docsOfService,
  resolveServiceByQuizAnswer,
} from './services.js';
import { QUIZ_BY_ID } from './quiz.js';

/** localStorage のキー。値の形が変わるときは v2 へ上げて別キーにすること */
export const LEARN_STORAGE_KEY = 'awslot.learn.v1';

/** 苦手カテゴリを名乗ってよい最小の出題数(これ未満は「まだ判定できません」) */
const WEAKEST_MIN_ASKED = 3;

/**
 * URLクエリを1つ読む。location が無い環境(Node)では必ず null。
 * @param {string} name
 * @returns {string|null}
 */
function readQuery(name) {
  try {
    if (typeof location === 'undefined' || !location?.search) return null;
    const v = new URLSearchParams(location.search).get(name);
    return v ? v.trim() : null;
  } catch {
    return null;
  }
}

/** ?learn=off / ?learn=0 … 学習の記録と表示を止める */
const LEARN_OFF = (() => {
  const v = readQuery('learn');
  return v === 'off' || v === '0';
})();

/** ?learnreset=1 … 起動時に記録を消す(?learn=off と併用しても消える) */
const LEARN_RESET = readQuery('learnreset') === '1';

/**
 * localStorage を返す。使えない環境なら null。
 * **ここ以外で localStorage を直接触らないこと**(Node で落ちる/汚す)。
 *
 * 【window も見る理由(2026-08-15 実測)】
 * Node 25 は **`localStorage` をグローバルに持っている**(Web Storage の実装)。
 * `typeof localStorage === 'undefined'` だけのガードでは素通りしてしまい、
 * getItem した瞬間に
 *   Warning: `--localstorage-file` was provided without a valid path
 * が scripts/compare-drivers.mjs の出力へ混ざる(最悪ファイルを作りに行く)。
 * ブラウザにしか無い `window` を併せて見て、**Node では最初から触らない**。
 * @returns {Storage|null}
 */
function storageOrNull() {
  try {
    if (typeof window === 'undefined') return null;
    if (typeof localStorage === 'undefined') return null;
    return localStorage ?? null;
  } catch {
    // Safari のプライベートウィンドウなどは参照そのものが例外を投げる
    return null;
  }
}

/** 空の記録 */
function emptyLog() {
  return { v: 1, services: {}, quiz: {} };
}

/** 壊れた値・別バージョンの値を掴まないよう、形を見てから受け入れる */
function loadLog() {
  const store = storageOrNull();
  if (!store) return emptyLog();
  try {
    const raw = store.getItem(LEARN_STORAGE_KEY);
    if (!raw) return emptyLog();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyLog();
    return {
      v: 1,
      services: (parsed.services && typeof parsed.services === 'object') ? parsed.services : {},
      quiz: (parsed.quiz && typeof parsed.quiz === 'object') ? parsed.quiz : {},
    };
  } catch {
    // JSON が壊れていても遊びは止めない。空から積み直す
    return emptyLog();
  }
}

/** 保存。失敗しても**何も言わずに**メモリだけで続ける */
function save() {
  const store = storageOrNull();
  if (!store) return;
  try {
    store.setItem(LEARN_STORAGE_KEY, JSON.stringify(log));
  } catch {
    // 容量超過・プライベートモード。記録は log(メモリ)に残っているので遊びは続く
  }
}

/* ?learnreset=1 は **読み込む前**に消す(消したつもりの値を読まないため) */
if (LEARN_RESET) {
  const store = storageOrNull();
  try {
    store?.removeItem(LEARN_STORAGE_KEY);
  } catch {
    /* 消せなくても続行 */
  }
}

/** 永続する記録(localStorage が使えないときはメモリだけの器になる) */
let log = loadLog();

/**
 * セッション集計。**永続しない**(「今日出会ったぶん」だけを見せるため)。
 * services は出会った順。first は「この記録で初めて図鑑に入ったか」。
 * @type {{services:{name:string, first:boolean, source:string}[], quiz:{asked:number, correct:number}}}
 */
let session = { services: [], quiz: { asked: 0, correct: 0 } };

/** 0以上の整数へ丸める(壊れた保存値を掴んでも壊れないように) */
function toCount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * 学習の記録・表示が有効か。?learn=off / ?learn=0 で false。
 * **記録側も表示側も必ずこれを見ること**(off のときは1件も増やさない)。
 * @returns {boolean}
 */
export function isLearnEnabled() {
  return !LEARN_OFF;
}

/**
 * サービスに「出会った」ことを記録する。
 *
 * 呼ぶのは以下の2か所だけ:
 *   豆知識カードを出した瞬間            … staging/anims/lcdanims-extra.js の triviaStateOf
 *   クイズの答え合わせ(正解を見せた)  … staging/actions.js の learn.quizResult
 *
 * 図鑑に載っていない名前(DEX_NAMES 外)は数えない。
 * 数えてしまうと owned が total を超えて **「100/99」** のような嘘の進捗になる。
 *
 * @param {string} name 豆知識カードの正式名(AWS_TRIVIA の service)
 * @param {'trivia'|'quiz'} [source] どちらで出会ったか(集計の内訳用)
 * @returns {{first:boolean}} first=true なら**この記録で初めて**図鑑に入った
 */
export function recordServiceSeen(name, source = 'trivia') {
  const none = { first: false };
  if (!isLearnEnabled()) return none;
  if (typeof name !== 'string' || name === '') return none;
  if (!DEX_NAMES.has(name)) return none;

  const known = log.services[name];
  const first = !known;
  log.services[name] = {
    n: toCount(known?.n) + 1,
    firstAt: known?.firstAt ?? Date.now(),
  };
  if (!session.services.some((s) => s.name === name)) {
    session.services.push({ name, first, source });
  }
  save();
  return { first };
}

/**
 * クイズの正誤を記録する(1回の出題につき1回だけ呼ぶこと)。
 * 呼び出しは staging/actions.js の learn.quizResult のみ。
 *
 * ■ 知らない問題idは1件も受け取らない(2026-08-15 椿レビュー / 学習機能の検収 minor)
 *   ここは通算成績(getQuizStats)の唯一の入口で、記録は localStorage に**永続**する。
 *   QUIZ_QUESTIONS に無い id を受け取ると
 *     ・asked だけが増えて byCategory には出ない(categoryOfQuiz が null を返すため)
 *       = 「分類の合計 ≠ 全体」という、画面の数字が食い違う状態が残る
 *     ・出題を削除・改名したときの古い id が永遠に成績へ効き続ける
 *   という形で、消す手立てのない嘘が積もる。**入口で捨てるのが唯一の防ぎ方**。
 *   図鑑側(recordServiceSeen)が DEX_NAMES 外を弾いているのと同じ考え方。
 * @param {string} quizId data/quiz.js の QUIZ_QUESTIONS の id
 * @param {boolean} correct 正解なら true
 */
export function recordQuizAnswer(quizId, correct) {
  if (!isLearnEnabled()) return;
  if (typeof quizId !== 'string' || quizId === '') return;
  if (!QUIZ_BY_ID[quizId]) return;
  const prev = log.quiz[quizId];
  const ok = toCount(prev?.ok) + (correct ? 1 : 0);
  const ng = toCount(prev?.ng) + (correct ? 0 : 1);
  log.quiz[quizId] = { ok, ng };
  session.quiz.asked += 1;
  if (correct) session.quiz.correct += 1;
  save();
}

/** 図鑑に載っている名前だけを数える(総数と食い違わせない) */
function ownedCount() {
  let n = 0;
  for (const name of Object.keys(log.services)) {
    if (DEX_NAMES.has(name)) n += 1;
  }
  return n;
}

/**
 * AWS図鑑の進捗。液晶のカウンタとリザルトが**同じ値**を使う。
 * @returns {{owned:number, total:number, gainedThisSession:number}}
 */
export function getDexProgress() {
  return {
    owned: ownedCount(),
    total: DEX_TOTAL,
    gainedThisSession: session.services.filter((s) => s.first).length,
  };
}

/**
 * このセッションで出会ったもの(リザルトの「今日出会ったサービス」)。
 * 表示側で率を計算し直さなくて済むよう、分類・色・公式リンクまで解決して返す。
 * @returns {{services:{name:string, cat:string, catLabel:string, color:string, docs:string|null, first:boolean}[], quiz:{asked:number, correct:number}}}
 */
export function getSessionDigest() {
  return {
    services: session.services.map(({ name, first }) => {
      const cat = categoryOfService(name);
      return {
        name,
        cat: cat.id,
        catLabel: cat.label,
        color: cat.color,
        docs: docsOfService(name),
        first,
      };
    }),
    quiz: { asked: session.quiz.asked, correct: session.quiz.correct },
  };
}

/** 問題id → 分類(正解サービスの分類)。対応表に無ければ null */
function categoryOfQuiz(quizId) {
  const q = QUIZ_BY_ID[quizId];
  if (!q) return null;
  const service = resolveServiceByQuizAnswer(q.answer);
  return service ? categoryOfService(service) : null;
}

/**
 * クイズの通算成績と苦手カテゴリ。
 *
 * **rate は 0〜1 の小数**(表示側で 100 倍して % にする。割合を計算し直さないこと)。
 * byCategory は CATEGORIES の並び順で、1問も答えていない分類は入れない。
 * weakest は「{@link WEAKEST_MIN_ASKED} 問以上答えた分類のうち正答率が最低のもの」。
 * 該当が無ければ null(画面は「まだ判定できません」と出す)。
 * @returns {{asked:number, correct:number, rate:number, byCategory:{id:string, label:string, color:string, asked:number, correct:number, rate:number}[], weakest:object|null}}
 */
export function getQuizStats() {
  let asked = 0;
  let correct = 0;
  /** @type {Map<string, {asked:number, correct:number}>} */
  const tally = new Map();

  for (const [quizId, e] of Object.entries(log.quiz)) {
    const ok = toCount(e?.ok);
    const ng = toCount(e?.ng);
    const a = ok + ng;
    if (a === 0) continue;
    asked += a;
    correct += ok;
    const cat = categoryOfQuiz(quizId);
    if (!cat) continue;
    const row = tally.get(cat.id) ?? { asked: 0, correct: 0 };
    row.asked += a;
    row.correct += ok;
    tally.set(cat.id, row);
  }

  const byCategory = CATEGORIES
    .filter((c) => tally.has(c.id))
    .map((c) => {
      const row = tally.get(c.id);
      return {
        id: c.id,
        label: c.label,
        color: c.color,
        asked: row.asked,
        correct: row.correct,
        rate: row.asked > 0 ? row.correct / row.asked : 0,
      };
    });

  // 苦手 = 正答率が最低。同率なら「たくさん答えたほう」を採る(そのほうが確からしい)
  let weakest = null;
  for (const row of byCategory) {
    if (row.asked < WEAKEST_MIN_ASKED) continue;
    if (weakest == null || row.rate < weakest.rate
      || (row.rate === weakest.rate && row.asked > weakest.asked)) {
      weakest = row;
    }
  }

  return {
    asked,
    correct,
    rate: asked > 0 ? correct / asked : 0,
    byCategory,
    weakest,
  };
}

/**
 * 学習バッジ(L6)。**スコアの称号(data/titles.js)とは別枠**。
 *
 * 称号の閾値はスコア分布の分位点に固定されていて scripts/sim.mjs が到達率を照合している。
 * 学習でそれを動かすと「画面に出ている到達率が実測と食い違う」ので、
 * 学習のご褒美はこちらに独立して置く。**称号7種と名前を絶対に被らせないこと**。
 * @returns {{id:string, label:string, note:string, earned:boolean}[]}
 */
export function getBadges() {
  const dex = getDexProgress();
  const quiz = getQuizStats();
  return [
    { id: 'dex10', label: '図鑑 10', note: 'サービス10件に出会った', earned: dex.owned >= 10 },
    { id: 'dex30', label: '図鑑 30', note: 'サービス30件に出会った', earned: dex.owned >= 30 },
    { id: 'dex60', label: '図鑑 60', note: 'サービス60件に出会った', earned: dex.owned >= 60 },
    { id: 'dexAll', label: '図鑑コンプリート', note: `全${dex.total}件に出会った`, earned: dex.owned >= dex.total },
    { id: 'quiz10', label: 'クイズ10問正解', note: '通算10問正解', earned: quiz.correct >= 10 },
    { id: 'quiz50', label: 'クイズ50問正解', note: '通算50問正解', earned: quiz.correct >= 50 },
    {
      id: 'quizRate',
      label: '正答率70%',
      note: '20問以上答えて正答率70%以上',
      earned: quiz.asked >= 20 && quiz.rate >= 0.7,
    },
  ];
}

/**
 * セッション集計だけを捨てる(100回転の開始時)。
 * 永続している図鑑とクイズ通算は残す。
 */
export function resetSessionDigest() {
  session = { services: [], quiz: { asked: 0, correct: 0 } };
}

/** 学習記録を全部消す(?learnreset=1 と同じ効果。コンソールからの手動リセット用) */
export function resetLearnLog() {
  log = emptyLog();
  resetSessionDigest();
  const store = storageOrNull();
  try {
    store?.removeItem(LEARN_STORAGE_KEY);
  } catch {
    /* 消せなくてもメモリ側は空になっている */
  }
}
