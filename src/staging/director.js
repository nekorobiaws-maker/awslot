/**
 * 演出ディレクター。DESIGN.md 6.5
 *
 * EventBus のイベントを受けて
 *   1. when 条件に合致するシナリオを絞り込み
 *   2. weight で重み付き抽選
 *   3. Timeline へ投入
 * する。
 *
 * 重要な原則(DESIGN.md 4.2):
 *   演出システムは「抽選結果を先に知った上で」シナリオを選ぶ。
 *   これによりガセ演出が自然に実現でき、expectation を重みに使うだけで
 *   演出の熱量と実際の期待度を一致させられる。
 *   逆に、ここからゲーム状態を書き換えることは一切しない(読み取り専用)。
 */

import {
  notifyStageEvent, windDownStageAnims, setStageBandDeferred, isStickyText, categoryOf,
} from './anims/lcdanims.js';
// 暗転(overlay.blackout)は時間経過でしか消えないため、仕切り直しの経路から明示的に落とす。
// 依存方向は staging → render で、既に staging/anims/cutins.js が render/chars を参照している。
import { clearAllBlackouts, clearAllOverlayLines } from '../render/overlay.js';

/** シナリオが購読するイベント */
export const STAGING_EVENTS = [
  'bet',
  'leverOn',
  'stop1', 'stop2', 'stop3',
  'judge',
  'payoutStart', 'payoutEnd',
  'modeEnter', 'modeExit',
  'setEnd',
  'paramChange',
  // スコアアタックの終了(リザルト直前のワンクッション。data/scenarios/session.js)
  'sessionEnd',
  // レバーONフリーズ(game/flow.js の FLOW.FREEZE。data/scenarios/freeze.js)
  'freeze',
];

/** Timeline の waitFor に転送するイベント */
const WAIT_EVENTS = ['stop1', 'stop2', 'stop3', 'judge', 'payoutStart', 'payoutEnd', 'leverOn'];

/**
 * 液晶テキスト帯へ転送するイベント。
 * テキスト帯はシナリオより長生きする(sticky 告知は次のレバーONまで残る)ので、
 * シナリオの再生とは別に「次のゲームが始まった」ことを伝える必要がある。
 */
const TEXT_BAND_EVENTS = ['leverOn'];

/**
 * オーバーレイの1行(render/overlay.js の showLine)を落とすイベント(2026-08-15 U57)。
 *
 * この1行はフリーズの「神の声」と結末に使う専用の表示物で、
 * 液晶テキスト帯とは別実装なので sticky の解除(notifyStageEvent)が届かない。
 * U60 で結末の余韻を 4.2秒まで伸ばしたぶん、放っておくと
 * **次のゲームや次の画面へ食い込む**ので、テキスト帯の sticky と同じ寿命に揃える:
 *   leverOn   … 次のゲームが始まった(sticky と同じ区切り)
 *   modeEnter … 画面ごと切り替わった(lcdAnims.clear と同じ区切り)。
 *               ここで消しておかないと、入場告知(「BONUS 確定」)が
 *               オーバーレイの申告(U8)に食われて出なくなる。
 */
const OVERLAY_LINE_CLEAR_EVENTS = ['leverOn', 'modeEnter'];

/* ══ 演出の交通整理 ═══════════════════════════════════════
 *
 * 1ゲームの中で leverOn / stop1-3 / judge / paramChange が次々に飛ぶため、
 * 条件に当たったシナリオを素直に全部再生すると、液晶アニメ・パーティクル・
 * カットインが同時多発して何が起きているか読めなくなる。
 *
 * そこでシナリオを優先度クラスに分け、
 *   - 同時にフル再生できるのは「告知1本 + 視覚演出1本」まで
 *   - 1ゲームで液晶演出を伴うシナリオは2本まで
 *   - 同カテゴリのカットインは1ゲームに1回まで
 * に絞る。データ(scenarios/)は一切変えず、ここだけで調停する。
 */

/**
 * 優先度クラス。rank が大きいほど強い。
 * slot は占有する枠で、同じ枠は同時に1本しか取れない。
 */
export const STAGE_CLASSES = {
  /**
   * 全面占有(クイズ盤面など、液晶を丸ごと使う演出)。
   * シナリオに exclusive: true を書くとこのクラスになる。
   * 走っている間は他の液晶演出・テキスト帯を出さない。
   */
  exclusive: { rank: 4, slot: 'exclusive' },
  /** 結果告知(ボーナス確定・突入・継続など、見逃すと状況が分からなくなるもの) */
  result: { rank: 3, slot: 'announce' },
  /** カットイン */
  cutin: { rank: 2, slot: 'visual' },
  /** ステップアップ予告・ギミック */
  gimmick: { rank: 1, slot: 'visual' },
  /** 賑やかし(音・ランプ・キャラだけ。画面を占有しないので枠を取らない) */
  ambient: { rank: 0, slot: null },
};

/** 1ゲーム(レバーON〜次のレバーON)で液晶演出を伴うシナリオを何本まで通すか */
export const MAX_LCD_SCENARIOS_PER_GAME = 2;

/**
 * 予告シナリオ全体の発火率を一括で調整する係数(2026-08-14 ユーザー指摘 U5)。
 *
 * もとの指摘は「予兆がほぼ毎回出て特別感がない」。
 * 予告(yokoku-*.js)は8ファイル・数十本に散らばっていて、
 * 1本ずつ chance を下げると次に足す人が必ず取りこぼす。
 * そこで **発火判定の1か所** に係数を掛けて、全体の賑やかしを一律で動かす。
 *
 * 【結果告知は絶対に間引かない】
 * 掛けるのは classifyScenario が 'result' / 'exclusive' 以外のものだけ。
 * 突入告知・確定告知・フリーズは、間引くと「今どうなったのか分からない」に直結する。
 * ここは演出の濃さの問題ではなく情報の問題なので、係数の対象外にしている。
 *
 * ── 2026-08-15 U51: 0.6 → 1.6(通常時の予兆を **約1/4ゲーム** へ)────────
 * 0.6 だと通常時のレバーONに対して予告が出るのは 14.3%(1/7.0G)しかなく、
 * 「何も起きないゲームが続く」状態だった。ユーザー指示の目標は
 * **合計で約25%(1/4ゲーム)**。
 * 発火判定の1か所を動かすだけなので、ガセ / 本物の比率は **変わらない**
 * (掛かるのは全部同じ係数。結果告知だけが対象外なのは上のとおり)。
 * chance × 係数が 1 を超えるシナリオは実質「引けば必ず出る」になるが、
 * 元の chance が小さいものほど伸び代が大きいので、
 * 数の多い弱予告に偏るのではなく全体が均等に厚くなる(下の実測の内訳で確認済み)。
 *
 * 実測(ブラウザと同じ配線でヘッドレス再生し、通常時のレバーONのうち
 *       result / exclusive 以外の演出が1本以上出たゲームの割合):
 *   0.60 … 14.29% = 1/7.00 G
 *   1.12 … 20.14% = 1/4.97 G
 *   1.60 … 25.45% = 1/3.93 G(200セッション)/ 24.18% = 1/4.14 G(別シード150)  ← 現行
 * 最頻のネタでも通常時の約1%(1/100G)で、特定の1本に偏ってはいない。
 */
export const YOKOKU_CHANCE_SCALE = 1.6;

/**
 * 特定の予告を「選ばれやすく」する重み倍率(2026-08-15 ユーザー指示 U52d)。
 *
 * ■ なぜ director 側にあるのか
 *   weight は候補が競合したときの取り合い比率で、通常時のレバーONには
 *   数十本の候補が並ぶ。個々のシナリオの weight を書き換える手もあるが、
 *   「この2ネタだけ厚めに出す」という **演出全体の交通整理の話** なので、
 *   YOKOKU_CHANCE_SCALE と同じくここに総量ノブとして置く。
 *   シナリオ定義(data/scenarios/**)には手を入れない。
 *
 * ■ 対象
 *   yw_wind_*      … 風がレア役の絵柄を運んでくる(ユーザーが気に入っている画)
 *   yw_coldstart_* … Lambda コールドスタートの「無音の間」(同上)
 *   ybr_gen_*      … Bedrock の生成結果(U46b の目玉。下記)
 *
 * ■ 効き方
 *   _weightedPick の重みに掛かるだけなので、
 *   **発火条件(when)も当落も一切変えない**。運ばれてくる絵柄が
 *   成立役と1対1で対応している構造(yokoku-wind.js の U24)もそのまま。
 *
 * 実測(レア役が成立した通常時ゲームのうち、その演出が出た割合):
 *   倍率なし … 風 1.2%  / コールドスタート 0.9%
 *   ×26     … 風 13.0% / コールドスタート 14.0%
 *   ×55     … 風 19.8% / コールドスタート 21.0%(別シードで 18.1% / 16.5%)
 *
 * ■ ×55 から ×20 へ下げた理由(2026-08-15 検証指摘 F2)
 *   ×55 の2ネタが gimmick プールの重みを独占し、**同じプールの他が全部埋もれた**。
 *   レア役プールの取り分の実測:
 *     弱チェ … yw_wind_rare_cherry 29.7% に対し ybr_gen_cherry_iam 0.51%
 *     サメ   … yw_wind_rare_shark  27.7% に対し ybr_gen_shark_school 0.29%
 *   ブラウザ実測でも 1,200ゲーム回して ybr_* は0回 = U46b の目玉が誰にも見えない。
 *   「気に入っている画をよく見せる」ノブは残しつつ、**独占はさせない**水準へ。
 *   倍率どうしの相対関係(運搬 : ガセ ≒ 1:1)は同じ比で保っている。
 * @type {[RegExp, number][]}
 */
export const SCENARIO_WEIGHT_BOOST = [
  /*
   * ガセ(風だけが通り過ぎる)は控えめに上げる。
   * 運搬と同じ倍率にすると、母数の大きいハズレゲームで
   * **1本だけが飛び抜けて出る**(×55 時代の実測で全予告の3倍・通常時の3.1%)。
   * 分布が偏ってネタの引き出しが痩せるので、運搬 : ガセ が
   * だいたい 1 : 1 で見える帯に置いた(運搬を下げたので同じ比で下げてある)。
   * **上の行より先に評価されること**(weightBoostFor は最初に当たった行を採用する)。
   */
  [/^yw_wind_gase$/, 4],
  [/^yw_wind_/, 20],
  [/^yw_coldstart_/, 20],
  /*
   * Bedrock の生成結果(U46b)。成立系4本は「引いた役がそのまま文章になる」
   * この台の看板ネタなので、レア役プールで見える取り分まで引き上げる。
   * ハズレ系(文字化け / 空出力)は母数の大きいハズレゲームで出るぶん、
   * 同じ倍率にすると1本だけが目立ちすぎるので低め(ガセと同じ考え方)。
   * **上の ybr_gen_ 行より先に評価されること**。
   */
  [/^ybr_gen_lose_/, 8],
  [/^ybr_gen_/, 25],
];

/** 倍率の解決結果キャッシュ(シナリオ定義は不変なので使い回せる) */
const BOOST_CACHE = new Map();

/**
 * そのシナリオIDに掛ける重み倍率(該当しなければ 1)。
 * @param {string} id
 * @returns {number}
 */
export function weightBoostFor(id) {
  const key = String(id ?? '');
  const hit = BOOST_CACHE.get(key);
  if (hit != null) return hit;
  let boost = 1;
  for (const [re, mul] of SCENARIO_WEIGHT_BOOST) {
    if (re.test(key)) { boost = mul; break; }
  }
  BOOST_CACHE.set(key, boost);
  return boost;
}

/** 発火率の間引き対象外(結果告知の類は必ず出す) */
const CHANCE_SCALE_EXEMPT = new Set(['result', 'exclusive']);

/** ゲームの区切り(ここで1ゲームぶんの予算を戻す)。
 *  モード遷移は画面ごと切り替わる仕切り直しなので、入場演出が予算切れで消えないよう同じ扱いにする */
const BUDGET_RESET_EVENTS = ['leverOn', 'modeEnter'];

const cueKey = (cue) => `${cue.layer}.${cue.action}`;
const isTextCue = (cue) => cueKey(cue) === 'lcd.text';
const isCutinCue = (cue) => cueKey(cue) === 'overlay.cutin';

/** 画面を占有する重い演出(これを持つシナリオが1ゲームの本数制限の対象) */
const HEAVY_VISUAL_CUES = new Set(['lcd.anim', 'lcd.particles', 'overlay.cutin', 'overlay.particles']);
const isHeavyVisualCue = (cue) => HEAVY_VISUAL_CUES.has(cueKey(cue));

/** 抑制の対象になる視覚キュー。音・ランプ・キャラ・音声は軽いので常に通す */
const VISUAL_LAYERS = new Set(['lcd', 'overlay', 'reelfx']);
const isVisualCue = (cue) => VISUAL_LAYERS.has(cue.layer) && !isTextCue(cue);

/** 画面に何かを出すキュー(テキスト帯を含む)。全面占有中はこれを持つシナリオを通さない */
const isScreenCue = (cue) => VISUAL_LAYERS.has(cue.layer);
const usesScreen = (scenario) => (scenario?.cues ?? []).some(isScreenCue);

/** 分類結果のキャッシュ(シナリオ定義は不変なので使い回せる) */
const CLASS_CACHE = new WeakMap();

/**
 * シナリオの優先度クラスを決める。
 * scenario.priority に 'result' などを書けばそれが優先。無ければ中身から推定する:
 *   sticky 文言のテキストを持つ → 結果告知
 *   overlay.cutin を持つ        → カットイン
 *   その他の視覚キューを持つ    → ギミック
 *   どれも無い(音・ランプだけ)  → 賑やかし
 * @param {object} scenario
 * @returns {keyof STAGE_CLASSES}
 */
export function classifyScenario(scenario) {
  if (!scenario) return 'ambient';
  const cached = CLASS_CACHE.get(scenario);
  if (cached) return cached;

  let cls = 'ambient';
  // exclusive は「液晶を丸ごと使う」という強い宣言なので priority より優先する
  if (scenario.exclusive === true) {
    cls = 'exclusive';
  } else if (typeof scenario.priority === 'string' && STAGE_CLASSES[scenario.priority]) {
    cls = scenario.priority;
  } else {
    const cues = scenario.cues ?? [];
    if (cues.some((c) => isTextCue(c) && isStickyText(c.params?.text))) cls = 'result';
    else if (cues.some(isCutinCue)) cls = 'cutin';
    // テキストは画面を占有しないが、帯を1本使う。賑やかし(音だけ)とは区別する
    else if (cues.some((c) => isVisualCue(c) || isTextCue(c))) cls = 'gimmick';
  }
  CLASS_CACHE.set(scenario, cls);
  return cls;
}

/**
 * そのシナリオが出すカットインのカテゴリキー。
 * 同じカテゴリのカットインを1ゲームに2回出さないための鍵として使う。
 * @param {object} scenario
 * @returns {string[]}
 */
export function cutinKeysOf(scenario) {
  const keys = new Set();
  for (const cue of scenario?.cues ?? []) {
    if (!isCutinCue(cue)) continue;
    const label = cue.params?.title ?? cue.params?.id ?? '';
    keys.add(categoryOf(label) ?? `id:${cue.params?.id ?? label}`);
  }
  return [...keys];
}

/** テキストだけ落とす(視覚は出す) */
const DROP_TEXT = (cue) => !isTextCue(cue);
/** 視覚だけ落とす(テキストと音は出す) */
const DROP_VISUAL = (cue) => !isVisualCue(cue);

export class StagingDirector {
  /**
   * @param {object} opts
   * @param {import('../engine/eventbus.js').EventBus} opts.bus
   * @param {import('../engine/timeline.js').Timeline} opts.timeline
   * @param {object[]} opts.scenarios
   * @param {import('../engine/rng.js').Rng} opts.rng
   * @param {() => object} opts.getContext ゲーム状態のスナップショットを返す(読み取り専用)
   * @param {boolean} [opts.debug]
   * @param {boolean} [opts.arbitration] false で交通整理を無効化(調停なしの挙動を測るとき用)
   */
  constructor({ bus, timeline, scenarios, rng, getContext, debug = false, arbitration = true }) {
    this.bus = bus;
    this.timeline = timeline;
    this.scenarios = scenarios ?? [];
    this.rng = rng;
    this.getContext = getContext ?? (() => ({}));
    this.debug = debug;
    this.arbitration = arbitration;
    this._unsubs = [];
    /** 直近に再生したシナリオID(デバッグ表示用) */
    this.lastPlayed = null;
    /** 直近に見送ったシナリオ(デバッグ表示用) */
    this.lastSkipped = null;
    /** 占有枠。{ playing, rank, id } を入れる */
    this._slots = { exclusive: null, announce: null, visual: null };
    /** 1ゲームで通した液晶演出の本数 */
    this._gameLcdCount = 0;
    /** 1ゲームで出したカットインのカテゴリ */
    this._gameCutinKeys = new Set();
    /** 調停の統計(検証・デバッグ用) */
    this.stats = {
      played: 0, skipped: 0, textSuppressed: 0, visualSuppressed: 0,
      preempted: 0, exclusiveTaken: 0,
    };
    // 全面占有演出が終わったらテキスト帯を戻す。
    // 終わりはイベントでは来ないので Timeline から教えてもらう。
    this._unwatchFinish = this.timeline.onFinish?.((p) => this._onScenarioFinish(p)) ?? null;
  }

  attach() {
    for (const ev of STAGING_EVENTS) {
      this._unsubs.push(this.bus.on(ev, (payload) => this.onEvent(ev, payload)));
    }
    /**
     * 画面の仕切り直し。100回転を引き直した瞬間に暗転が残っていると、
     * 新しいセッションの最初の数秒が真っ暗のまま始まってしまう。
     * (フリーズ中にセッションが終わる → リザルト → リスタート、の順で起こりうる)
     * シナリオ抽選とは無関係なので STAGING_EVENTS には足さず、ここだけで購読する。
     */
    this._unsubs.push(this.bus.on('sessionStart', () => {
      clearAllBlackouts();
      // 余韻を長く取ったオーバーレイの1行(フリーズの結末)も同じ理由で落とす
      clearAllOverlayLines();
    }));
    return this;
  }

  detach() {
    for (const un of this._unsubs) un();
    this._unsubs = [];
    this._unwatchFinish?.();
    this._unwatchFinish = null;
    // 全面占有を握ったまま外れるとテキスト帯が止まったままになる
    if (this._slots.exclusive) {
      this._slots.exclusive = null;
      setStageBandDeferred(false);
    }
    // 暗転も同じ理由で落とす。演出を外したのに画面が真っ暗、が一番たちが悪い
    clearAllBlackouts();
    // オーバーレイの1行も残さない(演出を外したのに文字だけ居座るのを防ぐ)
    clearAllOverlayLines();
  }

  /** シナリオが終わったときの後始末(全面占有の解除) */
  _onScenarioFinish(playing) {
    if (this._slots.exclusive?.playing !== playing) return;
    this._slots.exclusive = null;
    setStageBandDeferred(false);
  }

  /**
   * @param {string} eventName
   * @param {object} payload
   */
  onEvent(eventName, payload) {
    // 進行中の演出へイベントを通知(waitFor キューの解放)。
    // payload も渡す = 待っていたキューが "$stop1.index"(実際に最初に止めたリール)を読める。
    // 渡すのは読み取り専用の控えで、ここからゲーム状態を書き換えることは無い。
    if (WAIT_EVENTS.includes(eventName)) this.timeline.notify(eventName, payload);
    // 液晶テキスト帯へ通知(sticky 告知の解除)。
    // このシナリオ抽選より先に行う。ここで解除しておかないと、
    // レバーONで出した新しい告知を自分で消してしまう。
    if (TEXT_BAND_EVENTS.includes(eventName)) notifyStageEvent(eventName);
    // オーバーレイの1行も同じ寿命に揃える(U57。理由は上の定義のコメント)。
    // sticky 解除と同じくシナリオ抽選より先に行う = この後の入場告知を邪魔しない
    if (OVERLAY_LINE_CLEAR_EVENTS.includes(eventName)) clearAllOverlayLines();
    // ゲーム/モードの区切りで1ゲームぶんの演出予算を戻す
    if (BUDGET_RESET_EVENTS.includes(eventName)) this.resetGameBudget();

    const ctx = this._buildContext(eventName, payload);
    const candidates = this.scenarios.filter((s) => this._matches(s, eventName, ctx));
    if (candidates.length === 0) return;

    const picked = this._weightedPick(candidates, ctx.mode);
    if (!picked) return;

    // weight は「候補が競合したときの取り合い比率」なので、単独候補だと必ず出てしまう。
    // ガセ予告のように「たまにしか出ない」ものは chance で発火自体を間引く。
    // U5 対応: 結果告知以外には YOKOKU_CHANCE_SCALE を掛けて全体の賑やかしを薄める。
    if (picked.chance != null && !this.rng.chance(this._scaledChance(picked))) return;

    // 交通整理。同時に出しすぎないよう、ここで落とすか削るかを決める
    const decision = this._admit(picked);
    if (!decision.play) {
      this.stats.skipped++;
      this.lastSkipped = { id: picked.id, reason: decision.reason };
      if (this.debug) console.log('[director] skip', picked.id, `(${decision.reason})`);
      return;
    }

    this.lastPlayed = picked.id;
    if (this.debug) console.log('[director]', eventName, '→', picked.id, decision.reason ?? '', ctx);
    this._commit(picked, ctx, decision);
  }

  /**
   * シナリオの chance に U5 の間引き係数を適用した実効発火率。
   * 結果告知(result / exclusive)だけは素の値をそのまま使う。
   * @param {object} scenario
   * @returns {number}
   */
  _scaledChance(scenario) {
    const base = scenario.chance;
    if (CHANCE_SCALE_EXEMPT.has(classifyScenario(scenario))) return base;
    // シナリオ側が scaleChance:false を書けば個別に除外できる(乱発しないこと)
    if (scenario.scaleChance === false) return base;
    return base * YOKOKU_CHANCE_SCALE;
  }

  /** 1ゲームぶんの演出予算を戻す */
  resetGameBudget() {
    this._gameLcdCount = 0;
    this._gameCutinKeys.clear();
  }

  /** 占有枠の現在の持ち主(終わっていれば空ける) */
  _slotHolder(slot) {
    if (!slot) return null;
    const holder = this._slots[slot];
    if (!holder) return null;
    if (!this.timeline.isActive(holder.playing)) {
      this._slots[slot] = null;
      // 取りこぼし対策。onFinish が届かない経路で終わっていても帯を戻す
      if (slot === 'exclusive') setStageBandDeferred(false);
      return null;
    }
    return holder;
  }

  /**
   * このシナリオを今そのまま再生してよいかを決める。
   * @returns {{play:boolean, reason?:string, cueFilter?:Function|null, slot?:string|null, rank?:number, preempt?:object|null}}
   */
  _admit(scenario) {
    if (!this.arbitration) return { play: true, cueFilter: null, slot: null };

    const cls = classifyScenario(scenario);
    const { rank, slot } = STAGE_CLASSES[cls];

    // 全面占有演出(クイズ盤面など)が動いている間は、画面を使う演出を一切通さない。
    // 盤面の上に別のテロップが重なって選択肢が読めなくなるのを防ぐ。
    // 音・ランプ・キャラだけの軽いものは画面を汚さないので通す。
    const exclusiveHolder = this._slotHolder('exclusive');
    if (exclusiveHolder && exclusiveHolder.id !== scenario.id) {
      if (!usesScreen(scenario)) return { play: true, cueFilter: null, slot: null };
      // 全面演出どうしがぶつかったときだけ、格上げなら差し替える
      if (cls === 'exclusive' && rank > exclusiveHolder.rank) {
        return { play: true, cueFilter: null, slot, rank, preempt: exclusiveHolder };
      }
      return { play: false, reason: 'exclusive' };
    }

    // 音・ランプ・キャラだけの軽い演出は画面を占有しないので素通し
    if (cls === 'ambient') return { play: true, cueFilter: null, slot: null };

    /**
     * 同カテゴリのカットインは1ゲームに1回まで。
     *
     * ただし **全面占有(exclusive)は除外する**(2026-08-14 検証指摘)。
     * ここを免除していなかったため、レバーONフリーズ(data/scenarios/freeze.js)が
     * 丸ごと破棄されうる構造になっていた:
     *   game/flow.js の leverOn() は bus.emit('leverOn') → bus.emit('freeze') の順なので、
     *   同じゲームの leverOn 予告が先にカットイン枠を記帳する。
     *   そこへ同じカットイン(fz_lever_freeze は 'id:shark_bite_bar')を含む
     *   フリーズが来ると cutin-dup で落ち、
     *   **暗転もテキストもカットインも無いまま8秒リールが止まる** ことになる。
     * data/freeze.js の「フリーズは裏切ってはいけない」を演出調停が壊さないよう、
     * 下の予算チェック(heavy && cls !== 'exclusive')と同じ扱いに揃える。
     * ※ 現状 leverOn 契機で shark_bite_bar を出すシナリオは0本なので実害は出ていないが、
     *   1本足した瞬間に再発するため構造ごと塞ぐ(検査は scripts/sim.mjs の検証28)。
     */
    const cutins = cutinKeysOf(scenario);
    if (cls !== 'exclusive' && cutins.some((k) => this._gameCutinKeys.has(k))) {
      return { play: false, reason: 'cutin-dup' };
    }

    const heavy = (scenario.cues ?? []).some(isHeavyVisualCue);

    /**
     * 1ゲームの液晶演出が上限に達したら、以降は静かに捨てる。
     * ただし結果告知だけは文言を通す(見逃すと今の状況が分からなくなるため)。
     * 全面占有演出はゲームをまたいで進む主役なので本数制限の対象外。
     *
     * budgetExempt: true(2026-08-15 検証指摘 F14)
     *   「CZ を1回遊ぶあいだに1度しか飛ばない完成の画」だけに付ける逃がし弁。
     *   例: Shield の全波緩和。最終ゲームは道中の波が2本先に予算を使い切るので、
     *   一番の見せ場である完成の画が構造的に必ず budget で落ちていた。
     *   **1ゲームに何度も飛びうるイベントには絶対に付けないこと**
     *   (付けた瞬間に本数制限が意味を失う)。予算の消費自体はするので、
     *   これを通した後は他の演出が落ちる = 総量は増えない。
     */
    if (heavy && cls !== 'exclusive' && !scenario.budgetExempt
        && this._gameLcdCount >= MAX_LCD_SCENARIOS_PER_GAME) {
      if (cls === 'result') {
        // 文言だけなら画面は荒れないので通す。ただし告知枠は正しく取る
        // (取らないと予算切れの告知がいくつも帯に積まれてしまう)。
        const aHolder = this._slotHolder('announce');
        if (!aHolder || rank > aHolder.rank) {
          return {
            play: true, cueFilter: DROP_VISUAL, slot: 'announce', rank,
            preempt: aHolder ?? null, reason: 'budget:text-only',
          };
        }
      }
      return { play: false, reason: 'budget' };
    }

    const holder = this._slotHolder(slot);
    // 同じシナリオの再発火は自分自身の置き換えなので、枠は取り合いにならない
    if (holder && holder.id === scenario.id) {
      return { play: true, cueFilter: null, slot, rank, preempt: null };
    }
    if (holder && rank <= holder.rank) {
      // 告知枠が埋まっていて格上げでもない。
      // 告知は「文字は諦めて視覚だけ」に格下げするが、そのぶん視覚枠は正しく取る。
      // ここで枠を取らずに流すと「画面を使う演出が3本同時」になってしまう。
      if (cls === 'result') {
        const vHolder = this._slotHolder('visual');
        if (!vHolder) {
          return { play: true, cueFilter: DROP_TEXT, slot: 'visual', rank, reason: 'slot-busy:visual-only' };
        }
        if (rank > vHolder.rank) {
          return {
            play: true, cueFilter: DROP_TEXT, slot: 'visual', rank,
            preempt: vHolder, reason: 'slot-busy:visual-only',
          };
        }
      }
      return { play: false, reason: 'slot-busy' };
    }

    // 進行中の下位演出は早送りで終わらせてから割り込む
    return { play: true, cueFilter: null, slot, rank, preempt: holder };
  }

  /** 採用が決まったシナリオを実際に流す */
  _commit(scenario, ctx, decision) {
    // 全面占有演出は画面を独り占めするので、始まる前に today の表示物を片付ける。
    // (先に走っていた液晶演出やテロップが盤面の上に残ると選択肢が読めなくなる)
    if (decision.slot === 'exclusive') {
      for (const p of [...this.timeline.playing]) {
        if (p !== decision.preempt?.playing && usesScreen(p.scenario)) this.timeline.stop(p);
      }
      if (decision.preempt) this.timeline.stop(decision.preempt.playing);
      windDownStageAnims(0);
      setStageBandDeferred(true);
      this.stats.exclusiveTaken++;
    } else if (decision.preempt) {
      this.timeline.stop(decision.preempt.playing);
      // 下位の液晶アニメも畳ませる(切り替わりが被って見えないように)
      windDownStageAnims();
      this.stats.preempted++;
    } else if (decision.slot === 'announce' && decision.cueFilter == null) {
      // 結果告知が始まったら、裏で回っている賑やかしの液晶アニメは畳む。
      // シナリオ自体は止めない(告知1 + 視覚1 の同時再生は許す)ので、
      // カットインなどの主役級はそのまま最後まで出る。
      windDownStageAnims();
    }

    const playing = this.timeline.play(scenario, ctx, { cueFilter: decision.cueFilter ?? null });
    this.stats.played++;
    if (decision.cueFilter === DROP_TEXT) this.stats.textSuppressed++;
    if (decision.cueFilter === DROP_VISUAL) this.stats.visualSuppressed++;

    if (decision.slot) this._slots[decision.slot] = { playing, rank: decision.rank, id: scenario.id };

    // 予算とカットイン履歴の記帳。視覚を落としたものは画面を占有しないので数えない
    if (decision.cueFilter !== DROP_VISUAL) {
      if ((scenario.cues ?? []).some(isHeavyVisualCue)) this._gameLcdCount++;
      for (const k of cutinKeysOf(scenario)) this._gameCutinKeys.add(k);
    }
    return playing;
  }

  /** シナリオへ渡すコンテキストを作る(ゲーム状態は読み取りのみ) */
  _buildContext(eventName, payload) {
    const snapshot = this.getContext() ?? {};
    // payload はイベント固有情報なので snapshot より優先する。
    // NOTE: setEnd の result は 'CONTINUE' のような文字列で来るため、
    //       ここで result をオブジェクトとして展開してはいけない。
    return {
      event: eventName,
      ...snapshot,
      ...payload,
      payload,
    };
  }

  /** when 条件の判定 */
  _matches(scenario, eventName, ctx) {
    const w = scenario.when;
    if (!w) return false;
    if (w.event !== eventName) return false;

    if (w.mode && !w.mode.includes(ctx.mode)) return false;
    if (w.notMode && w.notMode.includes(ctx.mode)) return false;
    if (w.flag && !w.flag.includes(ctx.flag)) return false;
    if (w.rare != null && Boolean(ctx.rare) !== w.rare) return false;

    // モード遷移系: modeEnter の対象IDで絞る
    if (w.enterMode && !w.enterMode.includes(ctx.id)) return false;

    // 任意のコンテキスト値の一致条件 { 'bonusId': ['S3_BIG'] } など
    if (w.match) {
      for (const [path, allowed] of Object.entries(w.match)) {
        const v = path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), ctx);
        if (Array.isArray(allowed)) {
          if (!allowed.includes(v)) return false;
        } else if (v !== allowed) {
          return false;
        }
      }
    }

    // 抽選結果条件(ctx.result がオブジェクトのときだけ有効)
    if (w.result) {
      if (typeof ctx.result !== 'object' || ctx.result === null) return false;
      for (const [key, expected] of Object.entries(w.result)) {
        if (Boolean(ctx.result[key]) !== Boolean(expected)) return false;
      }
    }

    // 期待度レンジ
    if (w.expectationRange) {
      const e = ctx.expectation ?? 0;
      if (e < w.expectationRange[0] || e > w.expectationRange[1]) return false;
    }

    return true;
  }

  /** weight による重み付き抽選(U52d の倍率はここで掛ける) */
  _weightedPick(candidates, mode) {
    const table = {};
    candidates.forEach((s, i) => {
      const w = s.weight ?? {};
      const weight = (w[mode] ?? w.default ?? 10) * weightBoostFor(s.id);
      if (weight > 0) table[String(i)] = weight;
    });
    const key = this.rng.weighted(table);
    return key === null ? null : candidates[Number(key)];
  }
}
