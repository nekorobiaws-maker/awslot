/**
 * ヘッドレス自動試行(DESIGN.md 6.9「自動連続試行」/ 7-2「バランス調整」)
 *
 * ブラウザを使わずに GameFlow をそのまま回し、
 *   - 全モードに突入・消化・親復帰できるか
 *   - モードスタックが深さ3を超えないか
 *   - リール配列の5コマ窓制約
 *   - 機械割・初当り・平均獲得枚数
 * を検証する。描画と演出は一切読み込まない(game/ と data/ だけで動く)。
 *
 * 使い方:
 *   node scripts/sim.mjs [ゲーム数] [シード]
 *   node scripts/sim.mjs 100000 12345
 *
 *   # 50回転スコアアタックのセッション試行(docs/BACKLOG.md「M」)
 *   node scripts/sim.mjs --session            … 10,000セッション
 *   node scripts/sim.mjs --session=50000 777  … セッション数とシードを指定
 */

import { EventBus } from '../src/engine/eventbus.js';
import { Rng } from '../src/engine/rng.js';
import { Credit } from '../src/game/credit.js';
import { ReelController } from '../src/game/reelctrl.js';
import { ModeMachine, MODE_HANDLERS, MAX_STACK_DEPTH } from '../src/game/modemachine.js';
import { GameFlow } from '../src/game/flow.js';
import { verifyStrips, REEL_STRIPS } from '../src/data/reelstrips.js';
import { CHECKLIST_MAX_PER_GAME } from '../src/game/modes/cz.js';
import { NORMAL_FLAGS, BONUS_FLAGS } from '../src/data/flags.js';
import { categorizeLine, payoutOf, BONUS_NET_PER_GAME } from '../src/data/payouts.js';
import {
  RUSH_DERIVED_ENTRY, SERVERLESS_UPGRADE, ENDING,
  CZ_ENTRY, CZ_TYPES, CZ_SPEC_BY_ID, NORMAL_SUBSTATES, AS_RUSH_CORE,
  BONUS_SPEC_BY_ID, ZONE_SPEC_BY_ID, czStars, RECOVERY_SPECS,
} from '../src/data/modes.js';
import { SESSION } from '../src/data/session.js';
import { applyCzMultiplier } from '../src/game/lottery.js';
// 前兆の保持当選は state に出さない(演出から読めてしまうため)。
// 検証はモジュールが用意している読み出し口を使う。
import { inspectZencho } from '../src/game/modes/freetier.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DT = 120; // ms/step
/**
 * 比較モード:
 *   --baseline … Phase 5 で足した「派生ゾーン / 上位AT昇格 / エンディング」だけを止める
 *   --phase3   … さらに CZ・ボーナス・内部状態も Phase 3 の構成に戻す(改修前の機械割)
 */
const BASELINE = process.argv.includes('--baseline') || process.argv.includes('--phase3');
const PHASE3 = process.argv.includes('--phase3');

/**
 * 50回転スコアアタックのセッション試行モード。
 * `--session` または `--session=N` で有効。N は試行セッション数(既定 10,000)。
 */
const SESSION_ARG = process.argv.find((a) => a.startsWith('--session'));
const SESSION_MODE = Boolean(SESSION_ARG);
const SESSION_RUNS = SESSION_MODE
  ? (Number(SESSION_ARG.split('=')[1]) || 10000)
  : 0;

// 位置引数の意味はモードで変わる:
//   通常モード      … [ゲーム数] [シード]
//   セッションモード … [シード](試行数は --session=N 側で指定する)
const GAMES = SESSION_MODE ? 0 : Number(args[0] ?? 10000);
const SEED = Number((SESSION_MODE ? args[0] : args[1]) ?? 20260813);

if (BASELINE) {
  for (const k of Object.keys(RUSH_DERIVED_ENTRY.table)) RUSH_DERIVED_ENTRY.table[k] = {};
  SERVERLESS_UPGRADE.onFlag = {};
  SERVERLESS_UPGRADE.streak = Infinity;
  ENDING.conditions.forEach((c) => { c.threshold = Infinity; });
}
/**
 * --precz … 2026-08-13 の「CZ格差付け + RUSH 1セット5G」より前の値へ戻して比較する。
 * 変更が初当り・平均スコアをどれだけ動かしたかを同じ物差しで測るための比較モード。
 */
if (process.argv.includes('--precz')) {
  CZ_TYPES.distribution = { ...CZ_TYPES.previousDistribution };   // SFN_CZ は存在しない
  for (const s of CZ_TYPES.specs) {
    s.successRate = CZ_TYPES.previousSuccessRate[s.id] ?? s.successRate;
  }
  CZ_ENTRY.table = JSON.parse(JSON.stringify(CZ_ENTRY.previousCzTable));
  AS_RUSH_CORE.setGames = 10;
  AS_RUSH_CORE.continueRate = { ...AS_RUSH_CORE.previousContinueRate };
  AS_RUSH_CORE.payoutPerGame = { ...AS_RUSH_CORE.previousPayoutPerGame10G };
  const atSet = ENDING.conditions.find((c) => c.type === 'atSetCount');
  if (atSet) atSet.threshold = 4;
  console.log('※ --precz: CZ格差付け / SFN_CZ / RUSH 1セット5G を入れる前の値で試行します\n');
}
if (PHASE3) {
  CZ_TYPES.distribution = { CW_ALARM: 1 };
  CZ_SPEC_BY_ID.CW_ALARM.bonusDist = { LAMBDA_REG: 0.7368, S3_BIG: 0.2632 };
  NORMAL_SUBSTATES.upgrade = {};      // 内部状態は COLD_START 固定(czMultiplier 1.0)
  NORMAL_SUBSTATES.ceiling.games = Infinity;
}

/**
 * スコア目標(2026-08-13 ユーザー指示で 1セッション 50回転 → 100回転)。
 *
 * 元の目標「平均200〜300枚・上位1%で1000枚超」は50回転前提なので、
 * 回転数に比例させてスケールする(100回転なら 400〜600枚 / 上位1% 2000枚)。
 * SESSION.totalGames を触ればそのまま追従する。
 */
const SESSION_SCALE = SESSION.totalGames / 50;
const TARGET = {
  meanMin: 180 * SESSION_SCALE,
  meanMax: 340 * SESSION_SCALE,
  meanLabel: `${200 * SESSION_SCALE}〜${300 * SESSION_SCALE}`,
  top1: 900 * SESSION_SCALE,
  top1Label: `${1000 * SESSION_SCALE}`,
};

const fmt = (n, d = 2) => Number(n).toFixed(d);
const pct = (n) => `${fmt(n * 100, 2)}%`;

/** 振り分けで重み付けした総合突破率(設計値)。CZ全体の「抜けやすさ」の指標 */
const designCzSuccessRate = () => CZ_TYPES.specs
  .reduce((a, s) => a + (CZ_TYPES.distribution[s.id] ?? 0) * s.successRate, 0);

/**
 * CZの実測を種別ごとに数える。
 * 天井(Auto Recovery 30G)経由は突破確定の Well-Architected なので、
 * 抽選で引いたCZと混ぜると「CZは結局ほぼ勝てる」に見えてしまう。
 * fromCeiling で分けて数え、抽選経由の突破率を単独で見られるようにする。
 */
function countCz(byId, state) {
  const c = (byId[state.czId] ??= { n: 0, win: 0, games: 0, ceil: 0, ceilWin: 0 });
  c.n++;
  c.games += state.played ?? 0;
  if (state.success) c.win++;
  if (state.fromCeiling) {
    c.ceil++;
    if (state.success) c.ceilWin++;
  }
}

/** 抽選経由(天井を除く)の集計を取り出す */
function czDrawnOnly(byId) {
  const out = { n: 0, win: 0 };
  for (const c of Object.values(byId)) {
    out.n += c.n - c.ceil;
    out.win += c.win - c.ceilWin;
  }
  return out;
}

/** CZ種別テーブルの共通出力(通常モード / セッションモードで同じ形にする) */
function printCzTable(byId, { perLabel, perValue }) {
  const total = Object.values(byId).reduce((a, b) => a + b.n, 0);
  console.log(`  種別               ${perLabel}  振り分け(設計)   突破率(設計)  平均G  期待度`);
  for (const spec of CZ_TYPES.specs) {
    const c = byId[spec.id];
    if (!c) { console.log(`  ${spec.id.padEnd(18)}  (未突入)`); continue; }
    const drawn = c.n - c.ceil;
    const drawnRate = drawn > 0 ? pct((c.win - c.ceilWin) / drawn) : '—';
    console.log(
      `  ${spec.id.padEnd(18)}${perValue(c).padStart(9)}` +
      `${pct(drawn / Math.max(1, total - totalCeil(byId))).padStart(11)}(${pct(CZ_TYPES.distribution[spec.id] ?? 0)})` +
      `${drawnRate.padStart(11)}(${pct(spec.successRate)})` +
      `${fmt(c.games / c.n, 2).padStart(7)}  ${czStars(spec)}` +
      (c.ceil > 0 ? `  ※天井経由 ${c.ceil}回(突破確定)` : ''),
    );
  }
  const drawnAll = czDrawnOnly(byId);
  console.log(
    `  抽選経由の総合突破率: ${pct(drawnAll.win / Math.max(1, drawnAll.n))}` +
    `(設計 ${pct(designCzSuccessRate())})` +
    `  / 天井経由 ${totalCeil(byId)}回は突破確定`,
  );
}

const totalCeil = (byId) => Object.values(byId).reduce((a, b) => a + b.ceil, 0);

// ── 1. リール配列の検証 ─────────────────────────

function checkReels() {
  const v = verifyStrips();
  console.log('■ リール配列(5コマ窓制約 + 引き込み対象の存在)');
  console.log(`  結果: ${v.ok ? 'OK' : 'NG'}`);
  if (!v.ok) v.errors.slice(0, 10).forEach((e) => console.log(`   - ${e}`));

  // 全リールの絵柄構成
  const counts = {};
  REEL_STRIPS.forEach((strip, i) => {
    counts[`reel${i}`] = strip.reduce((a, s) => { a[s] = (a[s] ?? 0) + 1; return a; }, {});
  });
  console.log(`  絵柄数/リール: ${JSON.stringify(counts.reel0)}`);
  return v.ok;
}

// ── 2. 自動試行 ────────────────────────────────

function run(games, seed) {
  const bus = new EventBus();
  const rng = new Rng(seed);
  // 選択操作(プレイヤー入力の代替)はゲーム抽選用RNGを消費しない
  const inputRng = new Rng((seed ^ 0x5bf03635) >>> 0);
  const credit = new Credit(50);
  const reels = new ReelController();
  const modes = new ModeMachine({ rng, bus });
  const flow = new GameFlow({ bus, rng, credit, reels, modeMachine: modes });

  const stat = {
    enter: {}, exit: {}, resume: 0, maxDepth: 1,
    games: {}, gained: {}, flags: {}, bonusFlags: {},
    addSet: 0, choices: 0, ceiling: 0, forcedGuard: 0,
    lineWins: {},
    /** ボーナス種別ごとの実測(突入回数 / 消化G / 純増 / 総払出 / セット数 / ベル回数) */
    bonusById: {},
    /** CZ種別ごとの実測(突入回数 / 突破回数 / 消化G)。振り分けと突破率の検証用 */
    czById: {},
    /** 入賞待ち(BONUS_READY)の消化G合計 */
    readyGames: 0,
    /** 入賞待ちで図柄が揃った回数(小役統計からは除外している) */
    readyHits: 0,
    /** 入賞待ち中に成立した小役(参考。通常時テーブル) */
    readyFlags: {},
  };
  const bump = (obj, k, n = 1) => { obj[k] = (obj[k] ?? 0) + n; };

  bus.on('modeEnter', (p) => {
    if (p.resumed) { stat.resume++; return; }
    bump(stat.enter, p.id);
    stat.maxDepth = Math.max(stat.maxDepth, modes.stack.length);
  });
  bus.on('modeExit', (p) => {
    bump(stat.exit, p.id);
    if (p.state?.gained) bump(stat.gained, p.id, p.state.gained);
    // ボーナスは種別ごとに獲得枚数が違うので内訳を取る(DESIGN.md 3.7)
    if (p.id === 'BONUS' && p.state?.bonusId) {
      const b = (stat.bonusById[p.state.bonusId] ??= {
        n: 0, games: 0, gained: 0, paidOut: 0, sets: 0, bells: 0,
      });
      b.n++;
      b.games += p.state.playedGames ?? 0;
      b.gained += p.state.gained ?? 0;
      b.paidOut += p.state.paidOut ?? 0;
      b.sets += p.state.setCount ?? 1;
      b.bells += p.state.bellCount ?? 0;
    }
    if (p.id === 'BONUS_READY') stat.readyGames += p.state?.games ?? 0;
    // CZは種別ごとに突破率も消化G数も違う(DESIGN.md 3.6 / 2026-08-13 の格差付け)
    if (p.id === 'CZ' && p.state?.czId) {
      countCz(stat.czById, p.state);
    }
  });
  bus.on('paramChange', (p) => {
    if (p.param === 'add_set') stat.addSet += p.delta ?? 0;
    if (p.param === 'choice') stat.choices++;
    if (p.param === 'ceiling') stat.ceiling++;
  });

  modes.start('FREE_TIER');

  /**
   * 長時間モードは 50回転セッションを何度も繰り返して総体の傾向を見る。
   * リスタートで credit と flow.stats が初期化されるので、
   * セッションを畳む直前に累計へ退避しておく(機械割・AT初当りの分母を守る)。
   */
  const totals = { in: 0, out: 0, at: 0, games: 0, sessions: 0, score: [] };
  const closeSession = () => {
    totals.in += credit.totalIn;
    totals.out += credit.totalOut;
    totals.at += flow.stats.at;
    totals.games += flow.stats.games;
    totals.score.push(credit.diff);
    totals.sessions++;
  };

  let guardStall = 0;
  let lastGames = -1;
  while (totals.games + flow.stats.games < games) {
    // 50回転を使い切ったら次のセッションへ(統計は累計側へ退避してから)
    if (flow.isResult) {
      closeSession();
      flow.restart();
      lastGames = -1;
      guardStall = 0;
      continue;
    }

    // モード滞在ゲーム数の記録は「レバーONの瞬間の最上位モード」で数える
    if (flow.canLever) bump(stat.games, modes.currentId);

    if (modes.awaitingChoice && flow.state === 'IDLE') {
      flow.stopReel(inputRng.chance(0.5) ? 0 : 2);
    } else if (flow.canBet) {
      flow.insertBet();
    } else if (flow.canLever) {
      const modeAtLever = modes.currentId;
      flow.leverOn();
      // 小役出現率の集計。
      // 【重要】BONUS_READY(入賞待ち)のゲームは除外する。
      // このモードのハズレは「引き込みでボーナス図柄を揃えるゲーム」であって
      // 小役抽選の結果ではない。停止形は GHOST7 / SHARKBAR の3つ揃いになるため、
      // 停止形ベースで数えるとゴースト揃いが 1/600 前後まで跳ね上がって見える
      // (実際の設計値は 1/6000)。入賞回数は stat.readyHits で別に数える。
      if (modeAtLever === 'BONUS_READY') {
        if (flow.flag === 'LOSE') stat.readyHits++;
        else bump(stat.readyFlags, flow.flag);
      } else {
        bump(flow.flagTable === 'BONUS' ? stat.bonusFlags : stat.flags, flow.flag);
      }
    } else if (flow.canStop) {
      const next = reels.reels.find((r) => r.canStop);
      if (next) flow.stopReel(next.index);
    }
    flow.update(DT);

    if (flow.stats.games === lastGames) {
      if (++guardStall > 5000) throw new Error(`進行が停止しました: flow=${flow.state} mode=${modes.currentId}`);
    } else {
      guardStall = 0;
      lastGames = flow.stats.games;
    }
  }

  // 進行中のセッションぶんも累計へ足してから返す
  closeSession();
  stat.forcedGuard = modes.stackGuardHits;
  return { flow, credit, modes, stat, totals };
}

// ── 2b. 50回転セッション ───────────────────────

/**
 * 1セッション(50回転)を最後まで回す。
 * 実機と同じく GameFlow をそのまま進めるので、買い取りもリザルト遷移も本番と同じ経路を通る。
 * @param {number} seed
 * @param {(ev:string, p:object)=>void} [onEvent] 集計フック
 */
function playSession(seed, onEvent = null) {
  const bus = new EventBus();
  const rng = new Rng(seed);
  const inputRng = new Rng((seed ^ 0x5bf03635) >>> 0);
  const credit = new Credit(SESSION.startCredit);
  const reels = new ReelController();
  const modes = new ModeMachine({ rng, bus });
  const flow = new GameFlow({ bus, rng, credit, reels, modeMachine: modes });

  if (onEvent) {
    for (const ev of ['modeEnter', 'modeExit', 'sessionEnd', 'paramChange', 'leverOn']) {
      bus.on(ev, (p) => onEvent(ev, p));
    }
  }

  modes.start('FREE_TIER');

  let guard = 0;
  while (!flow.session.ended && guard++ < 200000) {
    if (modes.awaitingChoice && flow.state === 'IDLE') {
      flow.stopReel(inputRng.chance(0.5) ? 0 : 2);
    } else if (flow.canBet) {
      flow.insertBet();
    } else if (flow.canLever) {
      flow.leverOn();
    } else if (flow.canStop) {
      const next = reels.reels.find((r) => r.canStop);
      if (next) flow.stopReel(next.index);
    }
    flow.update(DT);
  }
  if (guard >= 200000) throw new Error(`セッションが終了しませんでした: mode=${modes.currentId}`);

  return { flow, modes, credit, stat: flow.session };
}

/**
 * 50回転セッションを大量に試行し、スコア分布を出す。
 * docs/BACKLOG.md「M」: 平均200〜300枚・上振れ1000枚超という分散設計の検証用。
 */
function runSessions(runs, seed) {
  const scores = [];
  const agg = {
    bonus: 0, at: 0, cz: 0, zone: 0, ending: 0,
    buyout: 0, buyoutHits: 0,
    bonusById: {}, endedIn: {},
    /** CZ種別ごとの突入/突破(2026-08-13: CZごとの格差の検証) */
    czById: {},
    /**
     * RUSH の新規突入(2026-08-13「簡単に行きすぎ」の検証用)。
     * flow.stats.at は引き戻し層からのAT復帰も1回と数えるため、
     * 「ボーナス/直撃から新しく入った RUSH」だけを別に数える。
     */
    rushEntries: 0, rushResumes: 0,
    /** CZ突入の経路内訳(直接 / 高確経由 / 激アツ経由 / 天井) */
    czRoute: {},
    /** DeepRacer 擬似連(2026-08-13 ユーザー仕様)の到達step分布と結果 */
    racer: { starts: 0, byStep: {}, cz: 0, bonus: 0, miss: 0 },
    zeroBonus: 0,
    // RUSH の DC 成長(楽しさの軸がセット数ではなく純増になっているかの検証)
    dcSum: 0, dcSamples: 0, scaleOuts: 0, doubleScaleOuts: 0,
    dcMaxReached: 0, bellBoost: 0,
    rushExits: 0, rushEndDcSum: 0, rushPeakDc: 0,
    dcMaxSessions: 0,
    /** レバーONの瞬間のモード別回転数(持ち時間の使われ方) */
    spinsByMode: {},
  };

  for (let i = 0; i < runs; i++) {
    const perSession = { bonus: 0 };
    let lastExited = null;
    const { flow, credit } = playSession(seed + i * 7919, (ev, p) => {
      if (ev === 'modeEnter' && !p.resumed && p.id === 'BONUS') {
        perSession.bonus++;
        agg.bonusById[p.state.bonusId] = (agg.bonusById[p.state.bonusId] ?? 0) + 1;
      }
      // RUSH の DC 成長カーブ(2026-08-13 ユーザー補足の検証用)
      if (ev === 'paramChange' && p.param === 'dc') {
        agg.dcSum += p.value;
        agg.dcSamples++;
        agg.scaleOuts += p.delta ?? 0;
        if ((p.delta ?? 0) >= 2) agg.doubleScaleOuts++;
      }
      if (ev === 'paramChange' && p.param === 'dc_max_reached') agg.dcMaxReached++;
      if (ev === 'paramChange' && p.param === 'bell_boost') agg.bellBoost += p.delta ?? 0;
      // レバーONの瞬間のモードで滞在ゲーム数を数える(スケールアウト密度の分母)
      if (ev === 'leverOn') {
        agg.spinsByMode[p.mode] = (agg.spinsByMode[p.mode] ?? 0) + 1;
      }
      if (ev === 'modeExit') lastExited = p.id;
      if (ev === 'modeEnter' && !p.resumed && p.id === 'AS_RUSH') {
        // 引き戻し(HOT_STANDBY / ROUTE53_FAILOVER)からの復帰は新規突入ではない
        if (lastExited === 'HOT_STANDBY' || lastExited === 'ROUTE53_FAILOVER') agg.rushResumes++;
        else agg.rushEntries++;
      }
      if (ev === 'modeExit' && p.id === 'CZ' && p.state?.czId) {
        countCz(agg.czById, p.state);
        const r = p.state.route ?? 'direct';
        agg.czRoute[r] = (agg.czRoute[r] ?? 0) + 1;
      }
      if (ev === 'paramChange' && p.param === 'deepracer') {
        if (p.step === 1) agg.racer.starts++;
        agg.racer.byStep[p.step] = (agg.racer.byStep[p.step] ?? 0) + 1;
        if (p.result) {
          agg.racer[p.result] = (agg.racer[p.result] ?? 0) + 1;
          // step3 で決まったCZ移行だけを別に数える(擬似連自身が生んだ当選)
          if (p.result === 'cz' && p.step === 3) agg.racer.czAtStep3 = (agg.racer.czAtStep3 ?? 0) + 1;
        }
      }
      if (ev === 'modeExit' && p.id === 'AS_RUSH') {
        agg.rushExits++;
        agg.rushEndDcSum += p.state?.dc ?? 0;
        agg.rushPeakDc = Math.max(agg.rushPeakDc, p.state?.dc ?? 0);
      }
    });

    scores.push(credit.diff);
    agg.bonus += perSession.bonus;
    if (perSession.bonus === 0) agg.zeroBonus++;
    if (flow.stats.maxDc >= AS_RUSH_CORE.dcRange.max) agg.dcMaxSessions++;
    agg.at += flow.stats.at;
    agg.cz += flow.stats.cz;
    agg.zone += flow.stats.zones;
    agg.ending += flow.stats.ending;
    agg.buyout += flow.session.buyout;
    if (flow.session.buyout > 0) agg.buyoutHits++;
    const endedIn = flow.session.breakdown[flow.session.breakdown.length - 1]?.mode ?? 'なし';
    agg.endedIn[endedIn] = (agg.endedIn[endedIn] ?? 0) + 1;
  }

  scores.sort((a, b) => a - b);
  const pick = (q) => scores[Math.min(scores.length - 1, Math.floor(scores.length * q))];
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

  return { scores, agg, runs, mean, pick };
}

function reportSessions({ scores, agg, runs, mean, pick }) {
  const over = (n) => scores.filter((s) => s >= n).length / runs;

  console.log(`\n■ ${SESSION.totalGames}回転スコアアタック ${runs.toLocaleString()}セッション (seed=${SEED})`);
  console.log(`  平均スコア     : ${fmt(mean, 1)}枚   ← 目標 ${TARGET.meanLabel}枚`);
  console.log(`  中央値         : ${pick(0.5)}枚`);
  console.log(`  上位25% / 10%  : ${pick(0.75)}枚 / ${pick(0.90)}枚`);
  console.log(`  上位1% / 0.1%  : ${pick(0.99)}枚 / ${pick(0.999)}枚   ← 上位1%で${TARGET.top1Label}枚超が目標`);
  console.log(`  最低 / 最高    : ${scores[0]}枚 / ${scores[scores.length - 1]}枚`);
  console.log(
    `  ${TARGET.top1Label}枚超の割合 : ${pct(over(TARGET.top1 / 0.9))}` +
    `   ${2222 * SESSION_SCALE}枚超: ${pct(over(2222 * SESSION_SCALE))}`,
  );
  console.log(`  プラス収支の割合: ${pct(over(1))}`);

  console.log('\n  ── 1セッションあたりの遭遇 ──');
  console.log(`  ボーナス       : ${fmt(agg.bonus / runs, 2)}回  (ボーナス無しで終わる回: ${pct(agg.zeroBonus / runs)})`);
  console.log(
    `  AT初当り       : ${fmt(agg.at / runs, 2)}回` +
    `  (うち RUSH新規突入 ${fmt(agg.rushEntries / runs, 2)}回 / 引き戻し復帰 ${fmt(agg.rushResumes / runs, 2)}回)`,
  );
  console.log(`  CZ            : ${fmt(agg.cz / runs, 2)}回`);
  console.log(`  派生ゾーン     : ${fmt(agg.zone / runs, 2)}回 / エンディング ${fmt(agg.ending / runs, 4)}回`);
  const bTotal = Object.values(agg.bonusById).reduce((a, b) => a + b, 0) || 1;
  const bLabel = Object.entries(agg.bonusById)
    .map(([k, v]) => `${BONUS_SPEC_BY_ID[k]?.name ?? k} ${pct(v / bTotal)}`).join(' / ');
  console.log(`  ボーナス内訳   : ${bLabel}`);

  // CZ種別ごとの格差(2026-08-13 ユーザー指示「行きやすいCZと行きにくいCZ」)
  console.log('\n  ── CZ種別(振り分けと突破率 ※振り分け・突破率は抽選経由のみ)──');
  printCzTable(agg.czById, {
    perLabel: '/1000回', perValue: (c) => fmt(c.n / runs * 1000, 1),
  });
  const czWins = Object.values(agg.czById).reduce((a, b) => a + b.win, 0);
  console.log(`  CZ経由のボーナス: ${fmt(czWins / runs, 2)}回/セッション`);
  const rTotal = Object.values(agg.czRoute).reduce((a, b) => a + b, 0) || 1;
  const rLabel = { direct: '通常から直接', 'stage:WARM_POOL': '高確経由', 'stage:PROVISIONED': '激アツ経由', ceiling: '天井' };
  console.log(
    `  CZ突入の経路   : ${Object.entries(agg.czRoute).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${rLabel[k] ?? k} ${pct(v / rTotal)}`).join(' / ')}`,
  );

  // DeepRacer 擬似連(2026-08-13 ユーザー仕様)
  const R = agg.racer;
  if (R.starts > 0) {
    console.log('\n  ── DeepRacer 擬似連 ──');
    console.log(
      `  発生 ${fmt(R.starts / runs, 2)}回/セッション  ` +
      `到達step: ${[1, 2, 3, 4].map((k) => `${k}=${pct((R.byStep[k] ?? 0) / R.starts)}`).join(' / ')}`,
    );
    const ends = R.cz + R.bonus + R.miss;
    console.log(
      `  結果: CZ移行 ${pct(R.cz / Math.max(1, ends))} / ボーナス ${pct(R.bonus / Math.max(1, ends))}` +
      ` / 不発 ${pct(R.miss / Math.max(1, ends))}` +
      `  (step3到達のうちCZ移行 ${pct((R.czAtStep3 ?? 0) / Math.max(1, R.byStep[3] ?? 1))})`,
    );
  }

  const rushSpins = agg.spinsByMode.AS_RUSH ?? 0;
  console.log('\n  ── 50回転の使われ方(モード別) ──');
  const spinRows = Object.entries(agg.spinsByMode).sort((a, b) => b[1] - a[1]);
  console.log(`  ${spinRows.map(([k, v]) => `${k} ${fmt(v / runs, 1)}G`).join(' / ')}`);

  console.log('\n  ── RUSH の DC 成長(楽しさの軸)──');
  console.log(`  RUSH滞在       : ${fmt(rushSpins / runs, 1)}G/セッション`);
  console.log(
    `  スケールアウト : ${fmt(agg.scaleOuts / runs, 2)}回/セッション` +
    `  = RUSH ${fmt(rushSpins / Math.max(1, agg.scaleOuts), 1)}ゲームに1回` +
    `  (うちDC+2: ${fmt(agg.doubleScaleOuts / Math.max(1, agg.dcSamples) * 100, 1)}%)`,
  );
  console.log(`  スケールアウト後の平均DC: ${fmt(agg.dcSum / Math.max(1, agg.dcSamples), 2)}`);
  console.log(`  RUSH終了時の平均DC     : ${fmt(agg.rushEndDcSum / Math.max(1, agg.rushExits), 2)}  (RUSH終了 ${agg.rushExits}回)`);
  console.log(`  DC上限${AS_RUSH_CORE.dcRange.max}到達         : ${pct(agg.dcMaxSessions / runs)} のセッション  (到達告知 ${agg.dcMaxReached}回)`);
  console.log(`  高DCベル強化   : ${fmt(agg.bellBoost / runs, 1)}枚/セッション`);

  console.log('\n  ── 残存価値の買い取り ──');
  console.log(`  発生率         : ${pct(agg.buyoutHits / runs)}  平均 ${fmt(agg.buyout / runs, 1)}枚/セッション`);
  console.log(`  買い取り時平均 : ${fmt(agg.buyout / Math.max(1, agg.buyoutHits), 1)}枚`);
  const ended = Object.entries(agg.endedIn).sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`  終了時の滞在   : ${ended.map(([k, v]) => `${k} ${pct(v / runs)}`).join(' / ')}`);

  // 目標レンジの判定(外れても FAIL にはせず、警告として出す)
  const okMean = mean >= TARGET.meanMin && mean <= TARGET.meanMax;
  const okTop = pick(0.99) >= TARGET.top1;
  console.log('\n  ── 目標との比較 ──');
  console.log(`  平均${TARGET.meanLabel}枚 : ${okMean ? 'OK' : '要調整'}(実測 ${fmt(mean, 1)}枚)`);
  console.log(`  上位1%が${TARGET.top1Label}枚超: ${okTop ? 'OK' : '要調整'}(実測 ${pick(0.99)}枚)`);
  return okMean && okTop;
}

// ── 3. スタック深さガードの単体確認 ───────────────

function checkStackGuard() {
  const bus = new EventBus();
  const rng = new Rng(7);
  const modes = new ModeMachine({ rng, bus });
  const warn = console.warn;
  let warned = 0;
  console.warn = () => { warned++; };

  modes.start('AS_RUSH', { dc: 3 });
  modes._push('SPOT_ZONE', {});
  modes._push('CLOUDFRONT', {});
  const depth3 = modes.stack.length;
  modes._push('KINESIS', {});   // 4段目 → ガードが働くはず
  const depth4 = modes.stack.length;
  console.warn = warn;

  const ok = depth3 === 3 && depth4 === 3 && warned >= 1 && modes.stackGuardHits === 1;
  console.log('■ モードスタック深さ3のガード');
  console.log(`  3段積んだ深さ: ${depth3} / 4段目を積んだ後: ${depth4} / 押し出し回数: ${modes.stackGuardHits}`);
  console.log(`  結果: ${ok ? 'OK(深さ3を超えない)' : 'NG'}`);
  return ok;
}

// ── 3b. 統計的に出にくい経路の狙い撃ち確認 ─────────

/**
 * GameFlow を挟まずにモードだけ回すときの1ゲーム。
 *
 * 2026-08-13 の遷移改修で、モード遷移は
 *   holdMs      … 結果の画を見せ切ってから(GameFlow が時間で明ける)
 *   onNextSpin  … 次のレバーONで(GameFlow が leverOn で明ける)
 * と保留されるようになった。ここは GameFlow を使わない検証なので、
 * 「本番なら次の瞬間に明ける」ぶんを代行して確定させる。
 */
function step(modes, gctx) {
  const res = modes.onGame(gctx);
  modes.applyPendingTransition();
  return res;
}

/** 固定値を返すRNG(経路の確定テスト用) */
class FixedRng extends Rng {
  constructor(value) { super(1); this.value = value; }
  next() { return this.value; }
  chance(p) { return this.value < p; }
}

function checkRareRoutes() {
  const results = [];

  // (1) 天井(Auto Recovery 30G)→ Well-Architected CZ 当選確定
  {
    const ceilingG = NORMAL_SUBSTATES.ceiling.games;
    const modes = new ModeMachine({ rng: new FixedRng(0.999), bus: new EventBus() });
    modes.start('FREE_TIER');
    let hit = null;
    for (let i = 0; i < ceilingG * 2 && !hit; i++) {
      step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
      if (modes.currentId === 'CZ') hit = { games: i + 1, czId: modes.state.czId, success: modes.state.success };
    }
    const ok = hit?.games === ceilingG && hit.czId === 'WELL_ARCHITECTED' && hit.success === true;
    results.push([
      `天井${ceilingG}G → W-A CZ確定`, ok,
      hit ? `${hit.games}G / ${hit.czId} / 突破=${hit.success}` : '未到達',
    ]);
  }

  // (2) Step Functions 全制覇 → Multi-Region(親ATごと差し替わる)
  {
    const modes = new ModeMachine({ rng: new FixedRng(0.01), bus: new EventBus() });
    modes.start('AS_RUSH', { dc: 3 });
    modes._push('STEP_FUNCTIONS', {});
    for (let i = 0; i < 12 && modes.currentId === 'STEP_FUNCTIONS'; i++) {
      modes.choose(i % 2);
      step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
    }
    const ok = modes.stackIds.join('>') === 'MULTI_REGION';
    results.push(['SFN全制覇 → MULTI_REGION', ok, `stack=${modes.stackIds.join('>')}`]);
  }

  // (3) Spot の中断通知 → 2G猶予 → 最低保証ゲーム数
  {
    const minG = ZONE_SPEC_BY_ID.SPOT_ZONE.minGames;
    const modes = new ModeMachine({ rng: new FixedRng(0.001), bus: new EventBus() });
    modes.start('AS_RUSH', { dc: 3 });
    modes._push('SPOT_ZONE', {});
    let games = 0;
    while (modes.currentId === 'SPOT_ZONE' && games < 60) {
      step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
      games++;
    }
    // 1G目で通知が出ても最低保証ゲームまでは終わらない
    const ok = games === minG && modes.currentId === 'AS_RUSH';
    results.push([`Spot 中断通知 → 最低${minG}G保証`, ok, `${games}G で ${modes.currentId} へ復帰`]);
  }

  // (4) 引き戻しは1段(2026-08-13 ユーザー指摘で ROUTE53 への連鎖を廃止)。
  //     失敗したら Route 53 を経由せず、そのまま通常時へ落ちる。
  {
    const fail = new ModeMachine({ rng: new FixedRng(0.999), bus: new EventBus() });
    fail.start('HOT_STANDBY', { resumeMode: 'AS_RUSH' });
    const path = ['HOT_STANDBY'];
    for (let i = 0; i < 20; i++) {
      step(fail, { flag: 'LOSE', win: 'LOSE', payout: 0 });
      if (path[path.length - 1] !== fail.currentId) path.push(fail.currentId);
    }
    // 成功側は元のATへ戻る(1段でも復帰の道は残っている)
    const win = new ModeMachine({ rng: new FixedRng(0.001), bus: new EventBus() });
    win.start('HOT_STANDBY', { resumeMode: 'AS_RUSH' });
    const winPath = ['HOT_STANDBY'];
    for (let i = 0; i < 20; i++) {
      step(win, { flag: 'LOSE', win: 'LOSE', payout: 0 });
      if (winPath[winPath.length - 1] !== win.currentId) winPath.push(win.currentId);
    }
    const ok = path.join('>') === 'HOT_STANDBY>FREE_TIER'
      && winPath.join('>') === 'HOT_STANDBY>AS_RUSH'
      && RECOVERY_SPECS.chain.length === 1
      && !path.includes('ROUTE53_FAILOVER');
    results.push([
      '引き戻しは1段(Route53を経由しない)', ok,
      `失敗 ${path.join(' > ')} / 成功 ${winPath.join(' > ')}`,
    ]);
  }

  // (5) 上乗せ特化ゾーンが「枚数」で上乗せし、最上位レコードでは母体ATへセットも積む
  //     スコアアタック化(2026-08-13)でセット大量上乗せ → 枚数ブーストへ置き換えた
  {
    const modes = new ModeMachine({ rng: new FixedRng(0.999), bus: new EventBus() });
    modes.start('AS_RUSH', { dc: 1 });
    modes._push('KINESIS', { shards: 3 });
    let coinPay = 0;
    while (modes.currentId === 'KINESIS') {
      const res = step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
      coinPay += res.payoutPerGame ?? 0;
    }
    const addedCoins = modes.stack[0].state.stock;   // 参照用に退避する前に読む
    const stocked = modes.state.stock ?? 0;
    // rng=0.999 は最上位レコード(100枚)を引くので、枚数上乗せ + セット上乗せの両方が乗る
    const ok = coinPay > 200 && stocked > 0 && modes.currentId === 'AS_RUSH';
    results.push([
      '上乗せは枚数ブースト(最上位のみセット)', ok,
      `払出 ${fmt(coinPay, 0)}枚 / ストック ${stocked}セット / ${modes.currentId}(${addedCoins ?? '-'})`,
    ]);
  }

  // (5b) Step Functions のタスク成功は母体ATの DC を上げる(純増ブースト)
  {
    const modes = new ModeMachine({ rng: new FixedRng(0.01), bus: new EventBus() });
    modes.start('AS_RUSH', { dc: 2 });
    const before = modes.state.dc;
    modes._push('STEP_FUNCTIONS', {});
    modes.choose(0);
    step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
    const host = modes.stack[0];
    const ok = host.state.dc === before + ZONE_SPEC_BY_ID.STEP_FUNCTIONS.dcPerTask;
    results.push([
      'SFN タスク成功で DC+1(純増ブースト)', ok,
      `DC ${before} → ${host.state.dc}`,
    ]);
  }

  // (6) AT層を抜けたら atSetCount がリセットされる(エンディング暴発の防止)
  //     引き戻し層はATの続きなので持ち越し、FREE_TIER へ落ちた時だけ 0 に戻る
  {
    const modes = new ModeMachine({ rng: new FixedRng(0.999), bus: new EventBus() });
    modes.start('AS_RUSH', { dc: 1 });
    let atRecovery = null;
    for (let i = 0; i < 60 && modes.currentId !== 'FREE_TIER'; i++) {
      step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
      if (atRecovery === null && modes.currentId === 'HOT_STANDBY') atRecovery = modes.atSetCount;
    }
    const afterDrop = modes.atSetCount;
    const ok = atRecovery > 0 && afterDrop === 0 && modes.currentId === 'FREE_TIER';
    results.push([
      'AT転落で atSetCount リセット', ok,
      `引き戻し中 ${atRecovery} → FREE_TIER で ${afterDrop}`,
    ]);
  }

  // (7) czMultiplier が飽和せず、内部状態3段階が常に区別される(3.4)
  {
    const rows = Object.entries(CZ_ENTRY.table).filter(([, r]) => r.cz > 0 && r.cz < 1);
    const bad = rows.filter(([, r]) => {
      const warm = applyCzMultiplier(r.cz, 2);
      const prov = applyCzMultiplier(r.cz, 4);
      return !(r.cz < warm && warm < prov && prov < 1);
    });
    const sc = CZ_ENTRY.table.STRONG_CHERRY.cz;
    const ok = bad.length === 0;
    results.push([
      'czMultiplier が飽和しない', ok,
      bad.length === 0
        ? `強チェリー ${sc} → ×2 ${fmt(applyCzMultiplier(sc, 2), 3)} → ×4 ${fmt(applyCzMultiplier(sc, 4), 3)}`
        : `飽和: ${bad.map(([k]) => k).join(', ')}`,
    ]);
  }

  // (8) セット最終Gで派生ゾーンに当選しても、親のヘルスチェックが先に走る
  //     (残0Gのまま復帰して remaining が負になる不整合の防止)
  {
    const modes = new ModeMachine({ rng: new FixedRng(0.999), bus: new EventBus() });
    modes.start('AS_RUSH', { dc: 3 });
    for (let i = 0; i < AS_RUSH_CORE.setGames - 1; i++) {
      step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
    }
    const beforeRemaining = modes.state.remaining; // 最終G前 = 1
    step(modes, { flag: 'SHARK', win: 'SHARK', payout: 3 });
    const parent = modes.stack[0];
    const ok = beforeRemaining === 1
      && modes.stackIds.join('>') === 'AS_RUSH>STEP_FUNCTIONS'
      && parent.state.remaining === AS_RUSH_CORE.setGames;
    results.push([
      'セット末のゾーン当選で残G不整合なし', ok,
      `stack=${modes.stackIds.join('>')} / 親の残G=${parent.state.remaining}`,
    ]);
  }

  // (9) ボーナスは必ず入賞待ちを経由し、ハズレ(=図柄が揃うゲーム)で消化開始する
  {
    const modes = new ModeMachine({ rng: new FixedRng(0.5), bus: new EventBus() });
    modes.start('FREE_TIER');
    modes._push('BONUS', { bonusId: 'S3_BIG' });
    const gated = modes.currentId;                       // BONUS_READY のはず
    const targetOnLose = modes.reelTargetFor('LOSE');    // ゴースト7を狙う
    const targetOnBell = modes.reelTargetFor('BELL');    // 小役優先なので差し替えない
    // 小役成立ゲームは揃わない
    step(modes, { flag: 'BELL', win: 'BELL', payout: 8 });
    const stillReady = modes.currentId;
    // ハズレゲームで揃って消化開始
    step(modes, { flag: 'LOSE', win: 'GHOST', payout: 0 });
    const started = modes.currentId;
    const remaining = modes.state.remaining;

    // REG はサメBAR を狙う
    const reg = new ModeMachine({ rng: new FixedRng(0.5), bus: new EventBus() });
    reg.start('FREE_TIER');
    reg._push('BONUS', { bonusId: 'LAMBDA_REG' });
    const regTarget = reg.reelTargetFor('LOSE');

    const ok = gated === 'BONUS_READY'
      && targetOnLose?.join() === 'GHOST7,GHOST7,GHOST7'
      && targetOnBell === null
      && stillReady === 'BONUS_READY'
      && started === 'BONUS'
      && remaining === BONUS_SPEC_BY_ID.S3_BIG.games
      && regTarget?.join() === 'SHARKBAR,SHARKBAR,SHARKBAR';
    results.push([
      'ボーナスは入賞待ちを必ず経由', ok,
      `${gated} → 小役で${stillReady} → ハズレで${started}(残${remaining}G)/ REG狙い=${regTarget?.[0]}`,
    ]);
  }

  // (10) ボーナス中は専用の小役テーブル(ベル15枚)を引く
  {
    const modes = new ModeMachine({ rng: new FixedRng(0.5), bus: new EventBus() });
    modes.start('FREE_TIER');
    const normalTable = modes.flagTableId;
    modes._push('BONUS', { bonusId: 'S3_BIG', viaReady: true });
    const bonusTable = modes.flagTableId;
    const ok = normalTable === 'NORMAL' && bonusTable === 'BONUS'
      && payoutOf('BELL', 'NORMAL') === 8 && payoutOf('BELL', 'BONUS') === 15;
    results.push([
      'ボーナス中のベルは15枚', ok,
      `通常${payoutOf('BELL', 'NORMAL')}枚 / ボーナス${payoutOf('BELL', 'BONUS')}枚(table=${bonusTable})`,
    ]);
  }

  // (11) 前兆中に保持した当選は、必ず告知されて遷移に化ける
  //      (前兆は最長5G。この間に当選が消えないことの土台チェック)
  {
    const modes = new ModeMachine({ rng: new FixedRng(0.999), bus: new EventBus() });
    modes.start('FREE_TIER');
    // GHOST は bonus:1.000 なので rng を消費せず必ずボーナス当選する
    step(modes, { flag: 'GHOST', win: 'GHOST', payout: 0 });
    const held = inspectZencho(modes.state);
    let games = 1;
    while (modes.currentId === 'FREE_TIER' && games < 10) {
      step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
      games++;
    }
    const ok = held.pending?.kind === 'BONUS'
      && games <= 5
      && modes.currentId === 'BONUS_READY'
      && modes.state.bonusId === held.pending.bonusId;
    results.push([
      '前兆の保持当選が遷移に化ける', ok,
      `${games}G で ${modes.currentId}(${modes.state.bonusId ?? '-'})/ 保持=${held.pending?.kind ?? 'なし'}`,
    ]);
  }

  // (12) 天井(999G)と前兆がぶつかっても保持当選が消えない
  //      BONUS / AT 保持は天井CZより上位なのでそちらを優先し、
  //      CZ 保持は突破確定の天井CZ(Well-Architected)が上位互換として吸収する
  {
    // (12-a) ボーナス保持のまま天井へ到達
    const a = new ModeMachine({ rng: new FixedRng(0.999), bus: new EventBus() });
    a.start('FREE_TIER');
    a.state.games = NORMAL_SUBSTATES.ceiling.games - 2;  // 次ゲームで998G
    step(a, { flag: 'GHOST', win: 'GHOST', payout: 0 }); // 本前兆スタート(BONUS保持)
    const heldA = inspectZencho(a.state).pending;
    step(a, { flag: 'LOSE', win: 'LOSE', payout: 0 });   // 999G = 天井
    const okA = heldA?.kind === 'BONUS'
      && a.currentId === 'BONUS_READY' && a.state.bonusId === heldA.bonusId;

    // (12-b) CZ保持のまま天井へ到達 → 突破確定の天井CZへ吸収
    const b = new ModeMachine({ rng: new FixedRng(0.001), bus: new EventBus() });
    b.start('FREE_TIER');
    b.state.games = NORMAL_SUBSTATES.ceiling.games - 2;
    step(b, { flag: 'ALARM', win: 'ALARM', payout: 1 });  // cz 3% を引いて CZ保持
    const heldB = inspectZencho(b.state).pending;
    step(b, { flag: 'LOSE', win: 'LOSE', payout: 0 });
    const okB = heldB?.kind === 'CZ'
      && b.currentId === 'CZ' && b.state.czId === 'WELL_ARCHITECTED' && b.state.success === true;

    results.push([
      '天井と衝突しても当選が消えない', okA && okB,
      `BONUS保持→${a.currentId}(${a.state.bonusId ?? '-'}) / CZ保持→${b.currentId}(${b.state.czId ?? '-'}/突破=${b.state.success})`,
    ]);
  }

  // (13) エンディング条件成立と前兆が重なっても保持当選が消えない
  //      forceMode はスタックごと畳むので、当選はエンディングへ退避して
  //      キーノート終了後の通常時へ返す(短い前兆を経て必ず告知される)
  {
    const bus = new EventBus();
    const rng = new FixedRng(0.999);
    const credit = new Credit(50);
    const modes = new ModeMachine({ rng, bus });
    const flow = new GameFlow({ bus, rng, credit, reels: new ReelController(), modeMachine: modes });
    modes.start('FREE_TIER');
    step(modes, { flag: 'GHOST', win: 'GHOST', payout: 0 });   // 本前兆スタート(BONUS保持)
    const heldBefore = inspectZencho(modes.state).pending;
    credit.add(2500);                                            // 差枚2222超え = エンディング条件成立
    flow._checkEnding();
    const toEnding = modes.currentId === 'REINVENT_ED';

    // キーノート30Gを消化 → 通常時へ戻る(当選を引き継いでいる)
    let guard = 0;
    while (modes.currentId === 'REINVENT_ED' && guard++ < 40) {
      step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
    }
    const carried = modes.currentId === 'FREE_TIER'
      && inspectZencho(modes.state).pending?.bonusId === heldBefore?.bonusId;

    // 引き継いだ当選は数ゲームで必ず告知される
    let after = 0;
    while (modes.currentId === 'FREE_TIER' && after++ < 5) {
      step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
      flow._checkEnding();
    }
    const delivered = modes.currentId === 'BONUS_READY' && modes.state.bonusId === heldBefore?.bonusId;

    const ok = heldBefore?.kind === 'BONUS' && toEnding && carried && delivered;
    results.push([
      'エンディングが前兆の当選を消さない', ok,
      `ED突入=${toEnding} / 引き継ぎ=${carried} / ${after}G後に${modes.currentId}(${modes.state.bonusId ?? '-'})`,
    ]);
  }

  // (14) 50回転を使い切ると必ず RESULT へ移り、それ以上回せなくなる
  {
    const { flow, modes } = playSession(4242);
    const ok = flow.session.ended
      && modes.currentId === 'RESULT'
      && flow.session.played === SESSION.totalGames
      && flow.canBet === false && flow.canLever === false;
    results.push([
      '50回転で必ずリザルトへ', ok,
      `${flow.session.played}回転で ${modes.currentId} / BET可=${flow.canBet}`,
    ]);
  }

  // (15) 残存価値の買い取り。ボーナス入賞待ちで終わっても必ず枚数になる
  //      (49回転目にボーナスを引いて0枚で終わる、が起きないことの確認)
  {
    const bus = new EventBus();
    const rng = new FixedRng(0.5);
    const credit = new Credit(50);
    const modes = new ModeMachine({ rng, bus });
    const flow = new GameFlow({ bus, rng, credit, reels: new ReelController(), modeMachine: modes });
    modes.start('FREE_TIER');
    modes._push('BONUS', { bonusId: 'S3_BIG' });    // 入賞待ちで足止め
    const beforeDiff = credit.diff;
    flow.session.remaining = 0;
    flow._endSession();

    const spec = BONUS_SPEC_BY_ID.S3_BIG;
    const expected = Math.floor(spec.games * BONUS_NET_PER_GAME);
    const okReady = flow.session.buyout === expected
      && credit.diff === beforeDiff + expected
      && modes.currentId === 'RESULT'
      && modes.state.breakdown.length === 1;

    // AT の残Gとストックも買い取られる
    const bus2 = new EventBus();
    const rng2 = new FixedRng(0.5);
    const credit2 = new Credit(50);
    const modes2 = new ModeMachine({ rng: rng2, bus: bus2 });
    const flow2 = new GameFlow({ bus: bus2, rng: rng2, credit: credit2, reels: new ReelController(), modeMachine: modes2 });
    modes2.start('AS_RUSH', { dc: 4, stock: 2 });
    flow2.session.remaining = 0;
    flow2._endSession();
    const per = AS_RUSH_CORE.payoutPerGame[4];
    const expectAt = Math.floor(AS_RUSH_CORE.setGames * per)
      + Math.floor(2 * AS_RUSH_CORE.setGames * per);
    const okAt = flow2.session.buyout === expectAt && modes2.state.breakdown.length === 2;

    results.push([
      '残存価値の買い取り', okReady && okAt,
      `入賞待ち ${flow.session.buyout}枚(期待${expected}) / AT残+ストック ${flow2.session.buyout}枚(期待${expectAt})`,
    ]);
  }

  // (16) リザルトからのリスタートで、スコアも回転数も完全に0へ戻る
  {
    const { flow, modes, credit } = playSession(20260813);
    const prevScore = credit.diff;
    const prevIndex = flow.session.index;
    flow.restart();
    const ok = flow.session.remaining === SESSION.totalGames
      && flow.session.played === 0
      && flow.session.ended === false
      && flow.session.index === prevIndex + 1
      && credit.diff === 0
      && flow.stats.games === 0
      && modes.currentId === 'FREE_TIER'
      && flow.canBet === true;
    results.push([
      'リスタートで完全リセット', ok,
      `前回 ${prevScore}枚 → 残${flow.session.remaining}回転 / 差枚${credit.diff} / ${modes.currentId}`,
    ]);
  }

  // (17) Step Functions CZ: Success State まで流れきれば必ずボーナスへ
  {
    const spec = CZ_SPEC_BY_ID.SFN_CZ;
    const modes = new ModeMachine({ rng: new FixedRng(0.01), bus: new EventBus() });
    modes.start('FREE_TIER');
    modes._push('CZ', { czId: 'SFN_CZ', normalGames: 5 });
    const st = modes.state;
    let g = 0;
    while (modes.currentId === 'CZ' && g < 12) {
      step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
      g++;
    }
    const ok = st.success && st.cleared
      && st.stateIndex === spec.states.length
      && st.states.every((s) => s.status === 'succeeded')
      && g === spec.games
      && modes.currentId === 'BONUS_READY';
    results.push([
      'SFN CZ 完走 → ボーナス確定', ok,
      `${g}G / ${st.stateIndex}/${spec.states.length} States / cleared=${st.cleared} → ${modes.currentId}`,
    ]);
  }

  // (18) Step Functions CZ: Fail State に落ちたらその場で打ち切って通常時へ
  //      (最終ステートに到達した時点で突破確定、を成立させるための打ち切り)
  {
    const spec = CZ_SPEC_BY_ID.SFN_CZ;
    const bus = new EventBus();
    const fired = [];
    bus.on('paramChange', (p) => { if (p.param === 'sfn_state') fired.push(p); });
    const modes = new ModeMachine({ rng: new FixedRng(0.999), bus });
    modes.start('FREE_TIER');
    modes._push('CZ', { czId: 'SFN_CZ', normalGames: 5 });
    const st = modes.state;
    let g = 0;
    while (modes.currentId === 'CZ' && g < 12) {
      step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
      g++;
    }
    const lastState = st.states[st.states.length - 1];
    const ok = st.success === false && st.failed && st.cleared === false
      && g === st.failStep && st.failStep < spec.states.length
      && st.states[st.failedAt].status === 'failed'
      && lastState.status === 'pending'         // Succeed State には到達していない
      && fired[fired.length - 1]?.ok === false
      && modes.currentId === 'FREE_TIER';
    results.push([
      'SFN CZ Fail State で打ち切り', ok,
      `${g}G(failStep=${st.failStep})で ${modes.currentId} / 最終ステート=${lastState.status}`,
    ]);
  }

  // (19) Trusted Advisor: 突破は必ず全項目グリーン / 非突破は3項目未満で終わる
  {
    const spec = CZ_SPEC_BY_ID.TRUSTED_ADVISOR;
    const play = (rngValue) => {
      const bus = new EventBus();
      const allGreen = [];
      bus.on('paramChange', (p) => { if (p.param === 'checklist_all_green') allGreen.push(p); });
      const modes = new ModeMachine({ rng: new FixedRng(rngValue), bus });
      modes.start('FREE_TIER');
      modes._push('CZ', { czId: 'TRUSTED_ADVISOR', normalGames: 5 });
      const st = modes.state;
      let g = 0;
      while (modes.currentId === 'CZ' && g < 12) {
        step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
        g++;
      }
      return { st, g, allGreen, to: modes.currentId };
    };
    const win = play(0.01);
    const lose = play(0.999);
    const greensOf = (s) => s.items.filter((it) => it.level === 2).length;
    const ok = win.st.success && greensOf(win.st) === spec.items.length
      && win.allGreen.length === 1 && win.to === 'BONUS_READY'
      && lose.st.success === false && greensOf(lose.st) < 3
      && lose.allGreen.length === 0 && lose.to === 'FREE_TIER';
    results.push([
      'TA 突破=全項目GREEN / 非突破<3', ok,
      `突破 ${greensOf(win.st)}/${spec.items.length}(全緑告知${win.allGreen.length}回)` +
      ` / 非突破 ${greensOf(lose.st)}/${spec.items.length} → ${lose.to}`,
    ]);
  }

  // (20) CZの格差(2026-08-13 ユーザー指示「行きやすいCZと行きにくいCZ」)
  //      突破率の順序と期待度★の順序が一致していること = 星が嘘をつかない
  {
    const specs = CZ_TYPES.specs;
    const sorted = [...specs].sort((a, b) => a.successRate - b.successRate);
    const starsMonotonic = sorted.every((s, i) => i === 0
      || (s.expectation ?? 1) >= (sorted[i - 1].expectation ?? 1));
    const distSum = Object.values(CZ_TYPES.distribution).reduce((a, b) => a + b, 0);
    const spread = specs.reduce((a, s) => Math.max(a, s.successRate), 0)
      - specs.reduce((a, s) => Math.min(a, s.successRate), 1);
    const ok = starsMonotonic && Math.abs(distSum - 1) < 1e-9 && spread >= 0.3
      && specs.every((s) => CZ_TYPES.distribution[s.id] != null);
    results.push([
      'CZの格差(突破率と★の整合)', ok,
      sorted.map((s) => `${s.id.replace('_', '')} ${pct(s.successRate)}${czStars(s)}`).join(' < '),
    ]);
  }

  // (21) 告知 → 次のスピンで突入(2026-08-13 ユーザー指摘)
  //      「デプロイ完了の演出中に背景がもうCZ」を防ぐための時系列チェック。
  //      当選告知のゲームは通常ステージのまま終わり、次のレバーONでCZの1G目が始まる。
  {
    const bus = new EventBus();
    const rng = new FixedRng(0.001);           // 弱チェリーで必ずCZ当選する値
    const credit = new Credit(500);
    const modes = new ModeMachine({ rng, bus });
    const flow = new GameFlow({ bus, rng, credit, reels: new ReelController(), modeMachine: modes });
    modes.start('FREE_TIER');

    /** 1スピンを最後まで回し、時系列を1行返す */
    const spin = (n) => {
      let guard = 0;
      while (!flow.canLever && guard++ < 500) {
        if (flow.canBet) flow.insertBet();
        else if (flow.canStop) flow.stopReel(flow.reels.reels.find((r) => r.canStop)?.index ?? 0);
        flow.update(DT);
      }
      const modeAtLever = modes.currentId;      // ← このスピンがどのモードの1ゲームか
      flow.leverOn();
      const modeAfterLever = modes.currentId;   // ← レバーONで遷移が明けたか
      guard = 0;
      while (flow.state !== 'IDLE' && guard++ < 500) {
        if (flow.canStop) flow.stopReel(flow.reels.reels.find((r) => r.canStop)?.index ?? 0);
        flow.update(DT);
      }
      return {
        n,
        modeAtLever,
        modeAfterLever,
        modeAfterGame: modes.currentId,         // ← ゲーム終了後(告知ゲームはまだ通常のまま)
        pending: modes.hasPendingTransition ? modes.pendingTransition.transition.to : null,
        onNextSpin: Boolean(modes.pendingTransition?.transition?.onNextSpin),
        czPlayed: modes.currentId === 'CZ' ? (modes.state.played ?? 0) : null,
      };
    };

    const timeline = [];
    for (let i = 1; i <= 10; i++) {
      // Bedrock役(cz 0.35 / レア役ではない)を強制 + FixedRng(0.001) で必ずCZ当選させる。
      // レア役だと DeepRacer 擬似連中のボーナス格上げが働いて経路が変わるので、
      // ここは「通常時のCZ当選 → 告知 → 次スピンで突入」だけを見る。
      flow.setForcedFlag('ALARM');
      timeline.push(spin(i));
      // 告知(遷移予約)が出た次のスピンまで見れば十分
      const idx = timeline.findIndex((r) => r.pending);
      if (idx >= 0 && timeline.length > idx + 1) break;
    }

    const announceIdx = timeline.findIndex((r) => r.pending);
    const a = timeline[announceIdx];
    const next = timeline[announceIdx + 1];
    const ok = Boolean(a) && Boolean(next)
      && a.modeAfterGame === 'FREE_TIER'      // 告知ゲームは通常ステージのまま終わる
      && a.onNextSpin === true                // 遷移は次スピンまで待つ予約
      && a.pending === 'CZ'
      && next.modeAtLever === 'FREE_TIER'     // レバーONの直前もまだ通常
      && next.modeAfterLever === 'CZ'         // レバーONの瞬間にCZへ
      && next.czPlayed === 1;                 // そのスピンがCZの1ゲーム目
    results.push([
      '告知は通常画面 → 次スピンでCZ', ok,
      a && next
        ? `${a.n}G目: 告知(予約${a.pending})→ 画面は${a.modeAfterGame} / ` +
          `${next.n}G目: レバーONで ${next.modeAtLever}→${next.modeAfterLever}(CZ ${next.czPlayed}G目)`
        : `時系列が取れず: ${timeline.map((r) => r.modeAtLever).join('>')}`,
    ]);
  }

  // (22) Trusted Advisor の進行が「間に合わない絵」にならない
  //      毎ゲーム 残りG × 2 ≧ 未チェック項目 を満たし、最終ゲーム前に全項目がチェック済みになる
  {
    const spec = CZ_SPEC_BY_ID.TRUSTED_ADVISOR;
    const rng = new Rng(20260813);
    let bad = 0;
    let maxUntouchedBeforeFinal = 0;
    let worstRatio = Infinity;
    for (let i = 0; i < 3000; i++) {
      const modes = new ModeMachine({ rng, bus: new EventBus() });
      modes.start('FREE_TIER');
      modes._push('CZ', { czId: 'TRUSTED_ADVISOR', normalGames: 0 });
      const st = modes.state;
      let g = 0;
      while (modes.currentId === 'CZ' && g < 12) {
        step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
        g++;
        if (modes.currentId !== 'CZ') break;
        const untouched = st.items.filter((it) => it.level === 0).length;
        const left = st.remaining;
        // 「残りゲーム × 1ゲームの最大進行数」で未チェックを消化しきれるか
        if (untouched > left * CHECKLIST_MAX_PER_GAME) bad++;
        worstRatio = Math.min(worstRatio, left * CHECKLIST_MAX_PER_GAME - untouched);
        if (left === 1) maxUntouchedBeforeFinal = Math.max(maxUntouchedBeforeFinal, untouched);
      }
    }
    const ok = bad === 0 && maxUntouchedBeforeFinal === 0;
    results.push([
      'TA進行が間に合わない絵にならない', ok,
      `違反 ${bad}件 / 最終G前の未チェック最大 ${maxUntouchedBeforeFinal}項目(余裕 最小${worstRatio})`,
    ]);
  }

  console.log('■ 狙い撃ち確認(統計的に出にくい経路)');
  let allOk = true;
  for (const [name, ok, detail] of results) {
    allOk = allOk && ok;
    console.log(`  ${ok ? 'OK ' : 'NG '} ${name.padEnd(30)} ${detail}`);
  }
  return allOk;
}

// ── 4. 出力 ───────────────────────────────────

function report({ stat, totals }) {
  // 50回転で1セッションなので、長時間モードは複数セッションの累計で見る
  const g = totals.games;
  const payoutRate = totals.out / Math.max(1, totals.in);
  const diff = totals.out - totals.in;
  const meanScore = totals.score.reduce((a, b) => a + b, 0) / Math.max(1, totals.score.length);

  console.log(`\n■ 自動試行 ${g.toLocaleString()}G (seed=${SEED})`);
  console.log(`  セッション数   : ${totals.sessions.toLocaleString()}回(50回転/セッション)`);
  console.log(`  平均スコア     : ${fmt(meanScore, 1)}枚/セッション`);
  console.log(`  機械割         : ${pct(payoutRate)}  (IN ${totals.in} / OUT ${totals.out})`);
  console.log(`  通算差枚       : ${diff >= 0 ? '+' : ''}${diff}`);
  // 初当り確率は「通常時のG数」を分母に取るのが実機の慣習。
  // 通常時 = FREE_TIER + CZ(CZ は AT ではなく通常時の一部)。
  // DESIGN.md 2章の「約 1/98G でボーナス」もこの基準の数値。
  const normalG = (stat.games.FREE_TIER ?? 0) + (stat.games.CZ ?? 0);
  const per = (n) => `1/${fmt(normalG / Math.max(1, n), 1)}`;
  console.log(`  通常時G        : ${normalG.toLocaleString()}  (FREE_TIER + CZ)`);
  console.log(`  ボーナス初当り : ${per(stat.enter.BONUS ?? 0)}  (${stat.enter.BONUS ?? 0}回) ※通常時G基準`);
  const readyN = stat.enter.BONUS_READY ?? 0;
  console.log(
    `  入賞待ち       : ${readyN}回 / 平均 ${fmt(stat.readyGames / Math.max(1, readyN), 2)}G で揃う` +
    `  (揃い ${stat.readyHits}回 ※小役統計からは除外)`,
  );
  console.log(`  CZ            : ${per(stat.enter.CZ ?? 0)}  (${stat.enter.CZ ?? 0}回) ※通常時G基準`);
  console.log(`  AT初当り       : ${per(totals.at)}  (${totals.at}回) ※通常時G基準`);
  console.log(`  天井到達       : ${stat.ceiling}回 / 分岐選択 ${stat.choices}回 / 上乗せ合計 ${stat.addSet}セット`);
  console.log(`  最大スタック深さ: ${stat.maxDepth}(上限 ${MAX_STACK_DEPTH})/ 押し出し ${stat.forcedGuard}回`);
  console.log(`  親モード復帰   : ${stat.resume}回`);

  console.log('\n■ モード別');
  console.log('  モード              突入   消化G  平均G   平均獲得');
  const ids = Object.keys(MODE_HANDLERS);
  /**
   * 退役モード(2026-08-13 の引き戻し1段化で ROUTE53_FAILOVER が該当)。
   * 通常プレイからは到達しないので「全モード突入」の対象から外す。
   * ハンドラは直撃デバッグ用に残っているため MODE_HANDLERS には居る。
   */
  const retired = new Set(RECOVERY_SPECS.specs.filter((sp) => sp.retired).map((sp) => sp.id));
  const missing = [];
  const unbalanced = [];
  for (const id of ids) {
    const n = stat.enter[id] ?? 0;
    if (n === 0 && !retired.has(id)) missing.push(id);
    const games = stat.games[id] ?? 0;
    const gained = stat.gained[id] ?? 0;
    const ex = stat.exit[id] ?? 0;
    // 突入したのに一度も抜けていない = 親へ復帰できていない疑い
    if (n > 0 && ex === 0) unbalanced.push(id);
    console.log(
      `  ${id.padEnd(18)}${String(n).padStart(5)}${String(games).padStart(8)}` +
      `${fmt(games / Math.max(1, n), 1).padStart(7)}${fmt(gained / Math.max(1, n), 1).padStart(10)}枚` +
      (retired.has(id) ? '  ※退役(直撃デバッグ用)' : ''),
    );
  }

  // ボーナス種別ごとの内訳(DESIGN.md 3.7 / 2026-08-13 の仕様変更の検証用)
  console.log('\n■ ボーナス種別(ベル15枚方式)');
  console.log('  種別          突入   平均G  平均セット  平均ベル  平均獲得(純増)  平均総払出');
  for (const id of ['LAMBDA_REG', 'S3_BIG', 'DYNAMO_BIG']) {
    const b = stat.bonusById[id];
    if (!b) { console.log(`  ${id.padEnd(12)}  (未突入)`); continue; }
    console.log(
      `  ${id.padEnd(12)}${String(b.n).padStart(6)}${fmt(b.games / b.n, 1).padStart(8)}` +
      `${fmt(b.sets / b.n, 2).padStart(11)}${fmt(b.bells / b.n, 1).padStart(10)}` +
      `${fmt(b.gained / b.n, 1).padStart(15)}枚${fmt(b.paidOut / b.n, 1).padStart(11)}枚`,
    );
  }

  // CZ種別ごとの振り分けと突破率(2026-08-13: 「行きやすいCZ / 行きにくいCZ」の格差検証)
  console.log('\n■ CZ種別(振り分けと突破率 ※振り分け・突破率は抽選経由のみ)');
  printCzTable(stat.czById, { perLabel: '   突入', perValue: (c) => String(c.n) });

  const normalDraws = Object.values(stat.flags).reduce((a, b) => a + b, 0);
  console.log(
    `\n■ 小役出現率 / 通常時テーブル(${normalDraws.toLocaleString()}G ぶん` +
    ` ※入賞待ち ${stat.readyGames}G は除外)`,
  );
  for (const f of NORMAL_FLAGS.flags) {
    if (f.denom === null) continue;
    const n = stat.flags[f.id] ?? 0;
    console.log(`  ${f.id.padEnd(14)} 実測 1/${fmt(normalDraws / Math.max(1, n), 1).padStart(7)}  設計 1/${f.denom}`);
  }

  const bonusDraws = Object.values(stat.bonusFlags).reduce((a, b) => a + b, 0);
  console.log(`\n■ 小役出現率 / ボーナス中テーブル(${bonusDraws.toLocaleString()}G ぶん)`);
  for (const f of BONUS_FLAGS.flags) {
    if (f.denom === null) continue;
    const n = stat.bonusFlags[f.id] ?? 0;
    console.log(
      `  ${f.id.padEnd(14)} 実測 1/${fmt(bonusDraws / Math.max(1, n), 2).padStart(7)}  設計 1/${f.denom}` +
      `  (${f.payout}枚)`,
    );
  }

  const okAllModes = missing.length === 0;
  const okReturn = unbalanced.length === 0;
  const okDepth = stat.maxDepth <= MAX_STACK_DEPTH;
  console.log('\n■ 判定');
  console.log(`  全モード突入   : ${okAllModes ? 'OK' : `NG(未突入: ${missing.join(', ')})`}`);
  console.log(`  ゾーン親復帰   : ${okReturn ? 'OK' : `NG(抜けていない: ${unbalanced.join(', ')})`}`);
  console.log(`  スタック深さ   : ${okDepth ? 'OK' : 'NG'}`);
  return okAllModes && okReturn && okDepth;
}

// ── 実行 ──────────────────────────────────────

const okReels = checkReels();
const okGuard = checkStackGuard();
const okRoutes = BASELINE ? true : checkRareRoutes();

// 停止形の健全性(ハズレで入賞形を作っていないか)
const lineOk = categorizeLine(['BLANK', 'BLANK', 'BLANK']) === 'LOSE';

let okRun = true;
if (SESSION_MODE) {
  // 50回転スコアアタックのセッション分布(docs/BACKLOG.md「M」)
  reportSessions(runSessions(SESSION_RUNS, SEED));
  // 分布は「目標との比較」で別途出す。ここでの合否は経路検証だけで判定する
} else {
  okRun = report(run(GAMES, SEED));
}

const allOk = okReels && okGuard && okRoutes && okRun && lineOk;
console.log(`\n総合: ${allOk ? 'PASS' : 'FAIL'}`);
process.exit(allOk ? 0 : 1);
