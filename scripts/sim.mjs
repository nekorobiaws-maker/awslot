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
 *   # 100回転スコアアタックのセッション試行(docs/BACKLOG.md「M」)
 *   node scripts/sim.mjs --session            … 10,000セッション
 *   node scripts/sim.mjs --session=50000 777  … セッション数とシードを指定
 *
 *   # 甘スロ(U44 / ブラウザの ?ama=1 と同じ設定)で回す
 *   node scripts/sim.mjs --session=3000 777 --ama
 *   ※ 通常モードと甘スロの実測は必ず両方を見ること(片方だけ直すと歪む)
 *
 * 姉妹スクリプト(2026-08-14 追加):
 *   scripts/balance-probe.mjs    … 目標レンジに載っているかだけを複数シードで一覧する
 *   scripts/compare-drivers.mjs  … 「simとブラウザ実プレイで結果が違う」の切り分け。
 *                                  同じシードを sim の回し方 / ブラウザの回し方 /
 *                                  人の打ち方 の3通りで回し、スコアが一致することを見る
 */

import { EventBus } from '../src/engine/eventbus.js';
import { Rng } from '../src/engine/rng.js';
import { Credit } from '../src/game/credit.js';
import { ReelController } from '../src/game/reelctrl.js';
import { ModeMachine, MODE_HANDLERS, MAX_STACK_DEPTH } from '../src/game/modemachine.js';
import { GameFlow } from '../src/game/flow.js';
import { verifyStrips, REEL_STRIPS } from '../src/data/reelstrips.js';
import { CHECKLIST_MAX_PER_GAME } from '../src/game/modes/cz.js';
// リザルトのランク刻み(到達率の実測をここで突き合わせる)
import { RANKS, rankOf } from '../src/game/modes/result.js';
import {
  NORMAL_FLAGS, BONUS_FLAGS, rareFlagMismatches, NORMAL_BASE_DENOMS, AMA_APPLIED,
} from '../src/data/flags.js';
// U44: 甘スロ(?ama=1 / --ama)。レア役の出現率だけが2倍になる救済モード
import { AMA, AMA_MODE } from '../src/data/ama.js';
// U22〜U24: レア役セットの共通定義(契機がレア役のみになっているかの検証に使う)
import { RARE_ROLE_IDS, CONFIRMED_ROLE_IDS, rareRateOf } from '../src/data/rareroles.js';
import { categorizeLine, payoutOf, BONUS_NET_PER_GAME } from '../src/data/payouts.js';
import {
  RUSH_DERIVED_ENTRY, SERVERLESS_UPGRADE, ENDING, ZONE_NESTED_ENTRY,
  CZ_ENTRY, CZ_TYPES, CZ_SPEC_BY_ID, NORMAL_SUBSTATES, AS_RUSH_CORE,
  BONUS_SPEC_BY_ID, ZONE_SPEC_BY_ID, czStars, RECOVERY_SPECS,
} from '../src/data/modes.js';
// U11: RUSH 4種(オートスケーリング / CloudFront / Aurora / ヒーロー)
import {
  RUSH_TYPES, RUSH_SPECS, RUSH_SPEC_BY_ID, RUSH_IDS, RUSH_ENTRY, recoveryParamsFor,
  recoveryEntryParams, RECOVERY_BONUS, RUSH_EXPECTED_GAIN,
} from '../src/data/rushes.js';
import { SESSION } from '../src/data/session.js';
import { applyCzMultiplier, bonusRushWinRate, drawFlag } from '../src/game/lottery.js';
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
 * 100回転スコアアタックのセッション試行モード。
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
 * スコア目標。
 *
 * ── 経緯 ──────────────────────────────────────────
 * 1セッションが 50回転 → 100回転になったとき、元の目標
 * 「平均200〜300枚・上位1%で1000枚超」を回転数に比例させて
 * 400〜600枚 / 上位1% 2000枚 へスケールしていた。
 *
 * 【2026-08-14 バランス調整で見直し / しおん指摘 S5「全体的に甘すぎる」】
 * 比例スケールは「回転数が倍なら出玉も倍」という前提だが、
 * 実際には初当りを 100回転に1回程度(ユーザー要望)まで絞ったので、
 * **1セッションで当たりを引けるのは1回前後** = 出玉は倍にならない。
 * 400〜600枚を満たそうとすると初当りかRUSH突入率のどちらかを緩めるしかなく、
 * 「当たりが日常になる」= 甘すぎるへ逆戻りしてしまう。
 * そこで目標は **平均220〜340枚 / 上位1% 1,600枚超**(rin の再設定)に置き直す。
 * 100回転を「50回転が2回ぶん」ではなく「1回の勝負」として見る目標値。
 *
 * ── 【U50(2026-08-15)/ 上位1% を 1,600 → 1,250 へ引き下げた理由】────────
 *
 * U50 で「RUSH 1回の獲得は p99 800枚以下」という上限を入れた。
 * この上限と 100回転という持ち時間から、**上位1%のスコアには算術的な天井**がある:
 *
 *   1セッション = 100回転。RUSH 1回の滞在は約 8〜9G で、その前後に
 *   ボーナス(6〜8G)と引き戻し(5G)が必ず挟まる = **1連鎖あたり約20G**。
 *   つまり100回転に入る RUSH は **どんなに引いても4〜5回が限界**。
 *   RUSH 1回の平均が 300枚前後(目標 250〜400 の中央)なので、
 *   上位1%のセッション = 4回前後の連鎖 ≒ **1,300枚**。
 *   1,600枚に届かせるには RUSH 1回を平均400枚超にするしかなく、
 *   そうすると平均スコアが 300枚を超えて **機械割が 200% に乗る**
 *   (機械割 = (300 + 平均スコア) ÷ 300 なので、190%上限 ⇔ 平均270枚が上限)。
 *
 * 実測(3,000セッション × 3シード)は 上位1% 1,285〜1,332枚 / 上位0.1% 1,822〜2,011枚。
 * ユーザー指示の「上位0.1%も2,600以内」は満たしており、
 * **上振れを1回の大当たりではなく連鎖の回数で作る**という U50 の方針どおりの形になっている。
 * 1,600枚へ戻したい場合の選択肢は2つだけ:
 *   ・RUSH 1回の p99 上限を 800 → 1,100枚まで緩める
 *   ・機械割の上限を 190% → 200% まで緩める
 * どちらもユーザー判断が要るので、勝手に戻さないこと。
 */
const TARGET = {
  meanMin: 220,
  meanMax: 340,
  meanLabel: '220〜340',
  top1: 1250,
  top1Label: '1250',
};
/** U50(RUSH 1回の p99 を 800枚に制限)の直前値。上の解説を読んでから戻すこと */
const PREVIOUS_TARGET_U49 = { meanMin: 220, meanMax: 340, meanLabel: '220〜340', top1: 1600 };
/** 比例スケール時代(50回転の目標を2倍していた頃)の値。戻す時の基準として保持 */
const PREVIOUS_TARGET = { meanMin: 360, meanMax: 680, meanLabel: '400〜600', top1: 1800 };

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

/**
 * いまどの設定で回しているかを最初に1行で出す(U44 / 2026-08-14)。
 *
 * 甘スロは **小役テーブルの読み込み時に確定** するので、
 * 「--ama を付けたつもりで付いていなかった」に気づけるようにしておく。
 * 通常モードの実測と甘スロの実測は必ず並べて見ること。
 */
function printSettingBanner() {
  const rare = rareRateOf(NORMAL_FLAGS);
  const base = NORMAL_FLAGS.flags
    .filter((f) => f.denom && RARE_ROLE_IDS.includes(f.id))
    .reduce((a, f) => a + 1 / (NORMAL_BASE_DENOMS[f.id] ?? f.denom), 0);
  if (!AMA_MODE) {
    console.log(`■ 設定: 通常  通常時のレア役 1/${fmt(1 / rare, 1)}\n`);
    return;
  }
  console.log(
    `■ 設定: **${AMA.label}**(?${AMA.query}=1 / --ama)${AMA_APPLIED ? '' : ' ※適用に失敗'}\n` +
    `  通常時のレア役 1/${fmt(1 / base, 1)} → **1/${fmt(1 / rare, 1)}**` +
    `(×${AMA.rareMultiplier})  ボーナス中テーブルは据え置き\n`,
  );
}

/** 甘スロで壊れていないかの下限(これより軽い初当りは「甘い」ではなく事故) */
const AMA_MIN_HIT_DENOM = 40;

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
    /**
     * U32: 引き戻し成功で入ったボーナス(state.fromRecovery)。
     * 通常時Gを1回も使わずに増えるので **初当りの分子からは外す**。
     * --session 側(agg.recoveryBonus)と定義を必ず揃えること。
     * 混ぜると初当りが 1/81 まで軽く見え、天井と同じ種類の嘘になる。
     */
    recoveryBonus: 0,
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
    // U32: 引き戻し成功からのボーナス。--session の集計と同じ数え方(定義を1つに保つ)
    if (p.id === 'BONUS' && p.state?.fromRecovery) stat.recoveryBonus++;
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
   * 長時間モードは 100回転セッションを何度も繰り返して総体の傾向を見る。
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
    // 100回転を使い切ったら次のセッションへ(統計は累計側へ退避してから)
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

// ── 2b. 100回転セッション ───────────────────────

/**
 * 1セッション(100回転)を最後まで回す。
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
    for (const ev of ['modeEnter', 'modeExit', 'sessionEnd', 'paramChange', 'leverOn', 'setEnd']) {
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
 * 100回転セッションを大量に試行し、スコア分布を出す。
 * docs/BACKLOG.md「M」: 平均200〜300枚・上振れ1000枚超という分散設計の検証用。
 */
function runSessions(runs, seed) {
  const scores = [];
  const agg = {
    bonus: 0, at: 0, cz: 0, zone: 0, ending: 0,
    buyout: 0, buyoutHits: 0,
    /** 機械割(IN/OUT の累計)。甘スロと通常を同じ物差しで比べるために出す(U44) */
    in: 0, out: 0,
    /**
     * U32: 引き戻し成功で入ったボーナス。
     * 通常時Gを1回も使わずに増えるので、**初当りの分子からは外す**
     * (混ぜると初当りが 1/87 まで軽く見え、天井と同じ種類の嘘になる)。
     */
    recoveryBonus: 0,
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
    /**
     * U11: RUSH 4種の実測。
     *   byId       … 種別ごとの突入回数 / 消化G / 獲得枚数
     *   scaleOuts  … オートスケーリングRUSH の上乗せ回数と合計G
     *   winFlags   … ボーナス中にRUSHを引き当てた役の内訳(子役契機の効き方)
     *   peakUnits  … EC2台数の最大到達(伸びの上振れ)
     */
    rushById: {},
    scaleOuts: 0, scaleOutGames: 0,
    rushWinFlags: {},
    peakUnits: 0, bigRushSessions: 0,
    rushExits: 0,
    /** レバーONの瞬間のモード別回転数(持ち時間の使われ方) */
    spinsByMode: {},
    /**
     * U22/U28: ボーナス種別ごとのRUSH当選率の実測。
     * 完走したボーナス(remaining 0)だけを分母にする
     * (100回転切れで途中終了したぶんを混ぜると当選率が下振れする)。
     */
    bonusRush: {},
    /** U23: ホットスタンバイの延長(レア役で +1G)の実測 */
    standby: { n: 0, extended: 0, games: 0, success: 0 },
    /**
     * エンディング条件 atSetCount の到達分布(minor-c)。
     * ModeMachine と同じ数え方(AT型モードの setEnd を数え、通常時へ落ちたら0)を
     * イベントから復元する。閾値を決めるための実測。
     */
    atSetMax: [],
  };

  for (let i = 0; i < runs; i++) {
    const perSession = { bonus: 0, atSets: 0, atSetMax: 0 };
    let lastExited = null;
    const { flow, credit } = playSession(seed + i * 7919, (ev, p) => {
      if (ev === 'modeEnter' && !p.resumed && p.id === 'BONUS') {
        perSession.bonus++;
        agg.bonusById[p.state.bonusId] = (agg.bonusById[p.state.bonusId] ?? 0) + 1;
        // U32: 引き戻し成功からのボーナスは通常時の抽選由来ではない(初当りの分子から外す)
        if (p.state.fromRecovery) agg.recoveryBonus++;
      }
      /* ── エンディング条件 atSetCount の復元(ModeMachine と同じ数え方)── */
      if (ev === 'modeEnter' && (p.id === 'FREE_TIER' || p.id === 'REINVENT_ED')) {
        perSession.atSets = 0;
      }
      if (ev === 'setEnd' && MODE_HANDLERS[p.id]?.type === 'AT') {
        perSession.atSets++;
        perSession.atSetMax = Math.max(perSession.atSetMax, perSession.atSets);
      }
      /*
       * ── U22/U28: 完走ボーナスのRUSH当選率 ──
       * レバーONフリーズの恩恵で **突入時から確定** していたぶん(rushWinFlag='FREEZE')は
       * レア役契機の抽選ではないので分母からも外す(混ぜると当選率が数ポイント上振れする)。
       */
      if (ev === 'modeExit' && p.id === 'BONUS' && p.state?.remaining === 0) {
        const b = (agg.bonusRush[p.state.bonusId] ??= { done: 0, win: 0, freeze: 0 });
        if (p.state.rushWinFlag === 'FREEZE') { b.freeze++; return; }
        b.done++;
        if (p.state.rushWin) b.win++;
      }
      /* ── U23: ホットスタンバイの延長 ── */
      if (ev === 'modeExit' && p.id === 'HOT_STANDBY') {
        agg.standby.n++;
        agg.standby.extended += p.state?.extended ?? 0;
        agg.standby.games += p.state?.total ?? 0;
        if (p.state?.success) agg.standby.success++;
      }
      // U11: オートスケール(上乗せ)の density。RUSHの伸びしろの実測
      if (ev === 'paramChange' && p.param === 'scale_out') {
        agg.scaleOuts++;
        agg.scaleOutGames += p.delta ?? 0;
        agg.peakUnits = Math.max(agg.peakUnits, p.value ?? 0);
      }
      // ボーナス中にRUSHを引き当てた役(子役契機がどの役で効いているか)
      if (ev === 'paramChange' && p.param === 'rush_win') {
        agg.rushWinFlags[p.value] = (agg.rushWinFlags[p.value] ?? 0) + 1;
      }
      // レバーONの瞬間のモードで滞在ゲーム数を数える(スケールアウト密度の分母)
      if (ev === 'leverOn') {
        agg.spinsByMode[p.mode] = (agg.spinsByMode[p.mode] ?? 0) + 1;
      }
      if (ev === 'modeExit') lastExited = p.id;
      if (ev === 'modeEnter' && !p.resumed && RUSH_IDS.includes(p.id)) {
        // 引き戻し(HOT_STANDBY / ROUTE53_FAILOVER)からの復帰は新規突入ではない
        if (lastExited === 'HOT_STANDBY' || lastExited === 'ROUTE53_FAILOVER') agg.rushResumes++;
        else agg.rushEntries++;
        const r = (agg.rushById[p.id] ??= {
          n: 0, games: 0, gained: 0, done: 0, doneGames: 0, doneGained: 0,
        });
        r.n++;
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
      if (ev === 'modeExit' && RUSH_IDS.includes(p.id)) {
        agg.rushExits++;
        const r = (agg.rushById[p.id] ??= {
          n: 0, games: 0, gained: 0, done: 0, doneGames: 0, doneGained: 0,
        });
        r.games += p.state?.playedGames ?? 0;
        r.gained += p.state?.gained ?? 0;
        /*
         * 「1回のRUSHでいくら取れたか」の正しい測り方(2026-08-14 バランス調整)。
         *
         * state.gained だけを見ると **100回転が尽きて途中で終わったぶん** が過小評価される。
         * 残ゲームは買い取り(data/session.js)で枚数へ換算されてスコアには乗っているのに、
         * gained には乗らないため。逆に「完走したRUSHだけ」で数えると、
         * 上乗せで長く伸びたRUSHほど打ち切られやすい AS_RUSH が過小評価される
         * (長い = 良いRUSH ほど分母から消える選択バイアス)。
         *
         * どちらの偏りも受けないよう、**gained + 残ゲームの買い取り額** で数える。
         * これが「プレイヤーがそのRUSH1回で受け取った枚数」そのもの。
         * 目標「RUSH1回 250〜400枚」はこの列(価値)で判定する。
         */
        const residual = MODE_HANDLERS[p.id]?.residualValue?.(p.state, {}) ?? [];
        r.value = (r.value ?? 0) + (p.state?.gained ?? 0)
          + residual.reduce((a, line) => a + (line.coins ?? 0), 0);
        if ((p.state?.remaining ?? 0) <= 0) {
          r.done++;
          r.doneGames += p.state?.playedGames ?? 0;
          r.doneGained += p.state?.gained ?? 0;
        }
        agg.peakUnits = Math.max(agg.peakUnits, p.state?.peakUnits ?? 0);
      }
    });

    scores.push(credit.diff);
    agg.in += credit.totalIn;
    agg.out += credit.totalOut;
    agg.atSetMax.push(perSession.atSetMax);
    agg.bonus += perSession.bonus;
    if (perSession.bonus === 0) agg.zeroBonus++;
    // U11: 「EC2を10台まで伸ばした」= オートスケーリングRUSHの上振れ体験の頻度
    if (flow.stats.maxDc >= 10) agg.bigRushSessions++;
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
  /*
   * 2000枚 = RANK S(1000枚)の倍 / エンディング条件 = RANK re:INVENT。
   * 2026-08-15(U50): 閾値を 2222 と直書きしていたため、U50 で 1500 へ下げた後も
   * 「2222枚超」を出し続けて実測と噛み合わなくなっていた。data/modes.js から引く。
   */
  const edCoins = ENDING.conditions.find((c) => c.type === 'diffCoins')?.threshold ?? 2222;
  console.log(
    `  2000枚超の割合 : ${pct(over(2000))}` +
    `   ${edCoins}枚超(re:INVENT): ${pct(over(edCoins))}`,
  );
  console.log(`  プラス収支の割合: ${pct(over(1))}`);

  /*
   * ランク別の到達率(2026-08-14 しおん指摘 V1)。
   *
   * 「RANK S は実質いつでも出るのでは」という体感が正しいかを、
   * 数字で毎回確認できるようにした。リザルト画面はここで測った到達率を
   * game/modes/result.js の RANKS(通常= rate / 甘スロ= amaRate)に持たせて表示している。
   * **閾値を動かしたら必ずこの表を見て、通常と --ama の両方を更新すること**。
   * (甘スロは初当りが 1/62 と別物で、S の到達率も 4% ↔ 7% とはっきり違う)
   */
  console.log(
    `\n  ── スコアランクの到達率(result.js の rankOf と同じ刻み${AMA_MODE ? ` / 表示は ${AMA.label}側` : ''})──`,
  );
  const rankCount = {};
  for (const s of scores) {
    const id = rankOf(s, AMA_MODE).id;
    rankCount[id] = (rankCount[id] ?? 0) + 1;
  }
  console.log('  ' + RANKS.map((r) => {
    const hit = (rankCount[r.id] ?? 0) / runs;
    return `${r.id} ${pct(hit)}(表示 ${AMA_MODE ? r.amaRate : r.rate})`;
  }).join(' / '));

  /*
   * 初当りと機械割(U44 で追加)。
   * 甘スロ(--ama)と通常モードを **同じ物差し** で並べて見るために、
   * セッションモードでも通常モードの report() と同じ定義で出す:
   *   分母 … 通常時のG数(FREE_TIER + CZ の滞在ゲーム数。実機の慣習)
   *   分子 … ボーナス突入から「天井の救済」と「引き戻し復帰(U32)」を除いたもの
   */
  const normalSpins = (agg.spinsByMode.FREE_TIER ?? 0) + (agg.spinsByMode.CZ ?? 0);
  const ceilingCz = agg.czRoute.ceiling ?? 0;
  const drawnBonus = Math.max(0, agg.bonus - ceilingCz - agg.recoveryBonus);
  const hitDenom = normalSpins / Math.max(1, drawnBonus);
  console.log('\n  ── 初当りと機械割 ──');
  console.log(
    `  抽選由来の初当り: 1/${fmt(hitDenom, 1)}` +
    `${AMA_MODE ? `  ← ${AMA.label}は 1/${AMA_MIN_HIT_DENOM} より軽くしないこと` : '  ← 目標 1/95〜110'}` +
    `  (通常時 ${fmt(normalSpins / runs, 1)}G/セッション)`,
  );
  console.log(
    `  天井 ${fmt(ceilingCz / runs, 2)}回 / 引き戻し復帰(U32)${fmt(agg.recoveryBonus / runs, 2)}回` +
    `  ※どちらも通常時Gを使わないので初当りの分子から除く`,
  );
  console.log(`  機械割         : ${pct(agg.out / Math.max(1, agg.in))}  (IN ${agg.in} / OUT ${agg.out})`);
  if (AMA_MODE && hitDenom < AMA_MIN_HIT_DENOM) {
    console.log(`  ※ 要調整: ${AMA.label}でも初当り 1/${AMA_MIN_HIT_DENOM} より軽いのは壊れている`);
  }

  console.log('\n  ── 1セッションあたりの遭遇 ──');
  console.log(`  ボーナス       : ${fmt(agg.bonus / runs, 2)}回  (ボーナス無しで終わる回: ${pct(agg.zeroBonus / runs)})`);
  console.log(
    `  AT初当り       : ${fmt(agg.at / runs, 2)}回` +
    `  (うち RUSH新規突入 ${fmt(agg.rushEntries / runs, 2)}回 /` +
    ` 引き戻しから直接復帰 ${fmt(agg.rushResumes / runs, 2)}回 ※U32 以降は 0 が正常)`,
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

  const rushSpins = RUSH_IDS.reduce((a, id) => a + (agg.spinsByMode[id] ?? 0), 0);
  console.log(`\n  ── ${SESSION.totalGames}回転の使われ方(モード別) ──`);
  const spinRows = Object.entries(agg.spinsByMode).sort((a, b) => b[1] - a[1]);
  console.log(`  ${spinRows.map(([k, v]) => `${k} ${fmt(v / runs, 1)}G`).join(' / ')}`);

  /*
   * U11: RUSH 4種の実測。バランス調整はここを見て行う。
   *
   * 狙い(2026-08-14 バランス調整):
   *   「完走」の平均獲得が **250〜400枚** に4種とも収まっていること。
   *   ヒーローはプレミア枠なので上振れ側で最上位でよい(平均は横並びで問題ない)。
   *   ヒーロー振り分けの実測が設計 2% を上回るのは正常(下の注記を参照)。
   *
   * 「平均獲得」と「完走のみ」の2列がある理由:
   *   100回転が尽きて途中で終わったRUSHは残ゲームが買い取られてスコアには乗るが、
   *   state.gained には乗らない。混ぜて平均すると2〜3割低く見えるので、
   *   **1回の価値は完走のみ**、**持ち時間の食い方は全体**、と見る列を分けている。
   */
  console.log('\n  ── RUSH 4種(U11 / 伸びる軸ごとの実測)──');
  console.log(`  RUSH滞在       : ${fmt(rushSpins / runs, 1)}G/セッション  (突入 ${fmt(agg.rushEntries / runs, 2)}回)`);
  const rushTotal = Object.values(agg.rushById).reduce((a, b) => a + b.n, 0) || 1;
  /*
   * ヒーローRUSH の実測が設計 2% を上回るのは正常。
   * プレミア契機(レバーONフリーズ / ボーナス中のゴースト揃い)は
   * premiumDistribution(ヒーロー 1/4)を引くため、その頻度ぶんだけ上に出る。
   * ※2026-08-14 修正前は入賞待ちで恩恵が消えていたので、ここが 2% に張り付いていた。
   */
  console.log('  種別                振り分け(設計)   突入/1000回   平均G   平均獲得   1回の価値(設計)');
  console.log(`  ※ヒーローは通常振り分け ${pct(RUSH_TYPES.distribution.HERO_RUSH)}` +
    ` + プレミア契機の振り分け ${pct(RUSH_TYPES.premiumDistribution.HERO_RUSH)} の合算`);
  for (const spec of RUSH_SPECS.specs) {
    const r = agg.rushById[spec.id];
    if (!r) { console.log(`  ${spec.id.padEnd(18)}  (未突入)`); continue; }
    // 「1回の価値」= 消化して得た枚数 + 打ち切り時に買い取られた残ゲーム分
    const value = r.n > 0 ? `${fmt((r.value ?? 0) / r.n, 1)}枚` : '—';
    console.log(
      `  ${spec.id.padEnd(18)}${pct(r.n / rushTotal).padStart(9)}` +
      `(${pct(RUSH_TYPES.distribution[spec.id] ?? 0)})` +
      `${fmt(r.n / runs * 1000, 1).padStart(13)}` +
      `${fmt(r.games / Math.max(1, r.n), 1).padStart(8)}` +
      `${fmt(r.gained / Math.max(1, r.n), 1).padStart(10)}枚` +
      `${value.padStart(11)}(${RUSH_EXPECTED_GAIN[spec.id] ?? 0}枚)`,
    );
  }
  console.log(
    `  オートスケール : ${fmt(agg.scaleOuts / runs, 2)}回/セッション` +
    `  平均 +${fmt(agg.scaleOutGames / Math.max(1, agg.scaleOuts), 2)}G/回` +
    `  (合計 +${fmt(agg.scaleOutGames / runs, 1)}G)`,
  );
  console.log(
    `  EC2最大台数    : ${agg.peakUnits} 台(全試行)` +
    `  / 10台以上まで伸ばしたセッション ${pct(agg.bigRushSessions / runs)}`,
  );
  const winFlagTotal = Object.values(agg.rushWinFlags).reduce((a, b) => a + b, 0) || 1;
  console.log(
    `  RUSH当選の契機 : ${Object.entries(agg.rushWinFlags).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${pct(v / winFlagTotal)}`).join(' / ') || '(なし)'}`,
  );

  /*
   * U22 / U28: ボーナス種別ごとのRUSH当選率(レア役契機の実測)。
   * 目標は RUSH_ENTRY.targetByBonus(12 / 45 / 85%)で、許容は ±3ポイント。
   * ここがズレたら data/rushes.js の bonusMult を引き直すこと。
   */
  console.log('\n  ── ボーナス→RUSH当選率(レア役契機 / U22・U28)──');
  console.log(`  ボーナス中のレア役出現率: ${pct(rareRateOf(BONUS_FLAGS))}/G`);
  for (const id of ['LAMBDA_REG', 'S3_BIG', 'DYNAMO_BIG']) {
    const b = agg.bonusRush[id];
    const target = RUSH_ENTRY.targetByBonus[id] ?? 0;
    if (!b || b.done === 0) { console.log(`  ${id.padEnd(12)} (完走なし)`); continue; }
    const rate = b.win / b.done;
    const gap = (rate - target) * 100;
    console.log(
      `  ${id.padEnd(12)} 完走 ${String(b.done).padStart(6)}回 → RUSH ${pct(rate).padStart(8)}` +
      `(目標 ${pct(target)} / 差 ${gap >= 0 ? '+' : ''}${fmt(gap, 1)}pt` +
      `${Math.abs(gap) <= 3 ? ' OK' : ' 要調整'})` +
      (b.freeze > 0 ? `  ※フリーズ確定 ${b.freeze}回は別枠(分母外)` : ''),
    );
  }

  /*
   * U23: ホットスタンバイの延長(レア役で +1G)。
   * 5G固定 + レア役1/24.7 なので、平均延長は 0.2G 前後が設計どおり。
   */
  const sb = agg.standby;
  console.log(
    `\n  ── ホットスタンバイ(U23: レア役で +1G)──\n` +
    `  突入 ${fmt(sb.n / runs, 2)}回/セッション  平均延長 ${fmt(sb.extended / Math.max(1, sb.n), 2)}G` +
    `  平均滞在 ${fmt(sb.games / Math.max(1, sb.n), 2)}G  引き戻し成功 ${pct(sb.success / Math.max(1, sb.n))}`,
  );

  /*
   * エンディング条件 atSetCount の到達分布(minor-c)。
   * 「RUSHを何度も完走したうえに上位ATまで粘った」超上振れの目安として、
   * 到達率 0.1〜1% に収まる閾値を選ぶ。
   */
  const atSets = [...agg.atSetMax].sort((a, b) => a - b);
  const reach = (n) => atSets.filter((v) => v >= n).length / runs;
  const edThreshold = ENDING.conditions.find((c) => c.type === 'atSetCount')?.threshold ?? 0;
  console.log(
    '\n  ── エンディング条件 atSetCount の到達分布 ──\n' +
    `  最大 ${atSets[atSets.length - 1] ?? 0}セット / p99 ${atSets[Math.floor(runs * 0.99)] ?? 0}` +
    ` / p99.9 ${atSets[Math.floor(runs * 0.999)] ?? 0}\n` +
    `  到達率: ${[2, 3, 4, 5, 6, 8].map((n) => `${n}セット ${pct(reach(n))}`).join(' / ')}\n` +
    `  現在の閾値 ${edThreshold}セット → 到達 ${pct(reach(edThreshold))}(目安 0.1〜1%)\n` +
    `  ※ エンディングには差枚条件(+${ENDING.conditions.find((c) => c.type === 'diffCoins')?.threshold ?? 0}枚)もある。両方あわせた実際の発生は` +
    ` ${pct(agg.ending / runs)}/セッションで、ここが 0.3〜0.5% に収まっていれば良い\n` +
    '    (エンディングは進行中のATを畳んでキーノートに差し替えるので、増やしすぎない)',
  );

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

/**
 * データ上「どこかから入れる」モードの一覧(2026-08-14 しおん指摘 S8)。
 *
 * SPOT_ZONE / EC2_BURST / RESERVED は「RUSH滞在中の特定レア役 × 数十%」でしか
 * 入れないため、10,000G の統計試行では踏まないことがある。
 * これを「未実装・到達不能」と同じ NG 扱いにすると総合判定が常に FAIL になり、
 * 本当の異常(経路が存在しないモード)が埋もれてしまう。
 * そこで判定は **データ上の経路の有無**で行い、
 * 実際に入れるかどうかは下の狙い撃ち確認(全派生ゾーン突入)で担保する。
 */
const ROUTED_MODES = new Set([
  ...Object.values(RUSH_DERIVED_ENTRY.table).flatMap((row) => Object.keys(row)),
  ...Object.values(ZONE_NESTED_ENTRY.table).flatMap((row) => Object.keys(row)),
  /*
   * テーブルではなく「条件を満たしたら入る」経路しか持たないモード。
   * データから機械的に拾えないので明示する。いずれも
   * 上の狙い撃ち確認(checkRareRoutes)で毎回到達を検証しているため、
   * 統計試行で踏まなかっただけなら OK 扱いにしてよい。
   *   SERVERLESS_RUSH … RUSHのセット連続成功(AS_RUSH_CORE.onSetEnd)
   *   MULTI_REGION    … STEP_FUNCTIONS 全制覇(onAllClear)
   *   REINVENT_ED     … エンディング条件(ENDING.conditions)の成立
   * 逆に、ここにも無く経路も無いモードが未突入なら本物の異常として NG にする。
   */
  'SERVERLESS_RUSH', 'MULTI_REGION', 'REINVENT_ED',
  /*
   * U11 の RUSH 4種。ボーナス中の子役契機 → 振り分け で入るため、
   * ヒーローRUSH(振り分け 2%)は短い試行だと踏まないことがある。
   * 実際に入れることは狙い撃ち確認(RUSH 4種へ突入できる)で毎回検証している。
   */
  ...RUSH_IDS,
]);

/**
 * 指定した派生ゾーンへ確実に入る (成立役, RNG値) を RUSH_DERIVED_ENTRY から逆算する。
 * 累積テーブルの帯の中央を狙う。サメ揃いの昇格抽選(値 < onFlag で先に発動)に
 * 食われる帯は避ける。
 * @returns {{flag:string, value:number}|null}
 */
function derivedZoneEntryFor(zoneId) {
  for (const [flag, row] of Object.entries(RUSH_DERIVED_ENTRY.table)) {
    let acc = 0;
    for (const [id, p] of Object.entries(row)) {
      const lo = acc;
      acc += p;
      if (id !== zoneId) continue;
      const mid = (lo + acc) / 2;
      if (mid < (SERVERLESS_UPGRADE.onFlag[flag] ?? 0)) continue;
      return { flag, value: mid };
    }
  }
  return null;
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

  /*
   * (4) 引き戻しは1段(2026-08-13 ユーザー指摘で ROUTE53 への連鎖を廃止)。
   *     失敗したら Route 53 を経由せず、そのまま通常時へ落ちる。
   *
   * U32(2026-08-14)で成功側の復帰先が **ボーナス** に変わった。
   * ボーナスは入口ゲート(modemachine.js の ENTRY_GATE)で必ず入賞待ちを経由するので、
   * 成功の経路は HOT_STANDBY > BONUS_READY になる。
   */
  {
    const entry = recoveryEntryParams('AS_RUSH');
    const fail = new ModeMachine({ rng: new FixedRng(0.999), bus: new EventBus() });
    fail.start('HOT_STANDBY', entry);
    const path = ['HOT_STANDBY'];
    for (let i = 0; i < 20; i++) {
      step(fail, { flag: 'LOSE', win: 'LOSE', payout: 0 });
      if (path[path.length - 1] !== fail.currentId) path.push(fail.currentId);
    }
    // 成功側はボーナス(入賞待ち)へ。同じRUSHへは直接戻らない(U32)
    const win = new ModeMachine({ rng: new FixedRng(0.001), bus: new EventBus() });
    win.start('HOT_STANDBY', entry);
    const winPath = ['HOT_STANDBY'];
    for (let i = 0; i < 20; i++) {
      step(win, { flag: 'LOSE', win: 'LOSE', payout: 0 });
      if (winPath[winPath.length - 1] !== win.currentId) winPath.push(win.currentId);
      // 復帰した時点で見たいことは終わり(そのまま回すと入賞→ボーナス消化が続く)
      if (win.currentId !== 'HOT_STANDBY') break;
    }
    const ok = path.join('>') === 'HOT_STANDBY>FREE_TIER'
      && winPath.join('>') === 'HOT_STANDBY>BONUS_READY'
      && win.state.bonusId === RECOVERY_BONUS.bonusId
      && RECOVERY_SPECS.chain.length === 1
      && !path.includes('ROUTE53_FAILOVER');
    results.push([
      '引き戻しは1段(Route53を経由しない)', ok,
      `失敗 ${path.join(' > ')} / 成功 ${winPath.join(' > ')}(${win.state.bonusId ?? '-'})`,
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
    /*
     * U11: 母体RUSHにはセットが無いので、最上位レコードの「+1セット」は
     * **ゲーム数の上乗せ**(1セット = AS_RUSH_CORE.setGames)へ読み替えられる。
     * 突入時の台数(dc:1 = 1台 = 1G)から増えていれば読み替えが効いている。
     */
    const units = modes.state.units ?? 0;
    const ok = coinPay > 200 && units > 1 && modes.currentId === 'AS_RUSH';
    results.push([
      '上乗せは枚数ブースト(最上位は母体へG上乗せ)', ok,
      `払出 ${fmt(coinPay, 0)}枚 / 母体 EC2 ${units}台 / ${modes.currentId}`,
    ]);
  }

  // (5b) Step Functions のタスク成功は母体RUSHのゲーム数を上乗せする(U11 で DC+1 から読み替え)
  {
    const modes = new ModeMachine({ rng: new FixedRng(0.01), bus: new EventBus() });
    modes.start('AS_RUSH', { dc: 2 });
    const before = modes.state.units;
    const beforeRemaining = modes.state.remaining;
    modes._push('STEP_FUNCTIONS', {});
    modes.choose(0);
    step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
    const host = modes.stack[0];
    const add = ZONE_SPEC_BY_ID.STEP_FUNCTIONS.dcPerTask;
    const ok = host.state.units === before + add
      && host.state.remaining === beforeRemaining + add;
    results.push([
      'SFN タスク成功で母体に +1G 上乗せ', ok,
      `EC2 ${before} → ${host.state.units}台 / 残G ${beforeRemaining} → ${host.state.remaining}`,
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

  /*
   * (8) 残り1Gで派生ゾーンに当選しても、母体RUSHの残Gが不整合にならない。
   *
   * U11 でセット継続が無くなったので、確認する不変条件はこう変わった:
   *   レア役は **必ず先にオートスケール(上乗せ)してから** ゾーン抽選へ進む
   *   → ゾーンを積む時点で母体の残Gは必ず 1 以上(復帰先が残0Gになることはない)
   */
  {
    const modes = new ModeMachine({ rng: new FixedRng(0.999), bus: new EventBus() });
    modes.start('AS_RUSH', { dc: 1 });          // 残り1G の状態から
    const beforeRemaining = modes.state.remaining;
    step(modes, { flag: 'SHARK', win: 'SHARK', payout: 3 });
    const parent = modes.stack[0];
    const addUnits = RUSH_SPEC_BY_ID.AS_RUSH.addUnitsByFlag.SHARK;
    // 2026-08-14: AS_RUSH は「台数 = 残りゲーム数」が不変条件になったので、
    // 1G消化(1台終了)→ サメで +N台 の結果、台数も残Gもちょうど N になる
    const ok = beforeRemaining === 1
      && modes.stackIds.join('>') === 'AS_RUSH>STEP_FUNCTIONS'
      && parent.state.remaining === addUnits            // 1G消化 + サメで +N台
      && parent.state.units === parent.state.remaining  // 台数 = 残りG(不変条件)
      && parent.state.total === 1 + addUnits;           // 通算Gは total が持つ
    results.push([
      '残り1Gのゾーン当選で残G不整合なし', ok,
      `stack=${modes.stackIds.join('>')} / 母体 EC2 ${parent.state.units}台 = 残${parent.state.remaining}G / 通算${parent.state.total}G`,
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
    // 差枚のエンディング条件(data/modes.js の ENDING)を必ず超える額を入れる。
    // 直書き(2500)だと閾値を上げた瞬間にこの検証が黙って無効化される
    credit.add((ENDING.conditions.find((c) => c.type === 'diffCoins')?.threshold ?? 2222) + 300);
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

  // (14) 100回転を使い切ると必ず RESULT へ移り、それ以上回せなくなる
  {
    const { flow, modes } = playSession(4242);
    const ok = flow.session.ended
      && modes.currentId === 'RESULT'
      && flow.session.played === SESSION.totalGames
      && flow.canBet === false && flow.canLever === false;
    results.push([
      `${SESSION.totalGames}回転で必ずリザルトへ`, ok,
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
    // U11: RUSH の残Gは「残り台数 × 固定純増」で買い取られる
    modes2.start('AS_RUSH', { units: 6 });
    flow2.session.remaining = 0;
    flow2._endSession();
    const per = RUSH_SPEC_BY_ID.AS_RUSH.payoutPerGame;
    const expectAt = Math.floor(6 * per);
    const okAt = flow2.session.buyout === expectAt && modes2.state.breakdown.length === 1;

    results.push([
      '残存価値の買い取り', okReady && okAt,
      `入賞待ち ${flow.session.buyout}枚(期待${expected}) / RUSH残 ${flow2.session.buyout}枚(期待${expectAt})`,
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

  /*
   * (20) CZの格差(2026-08-13 ユーザー指示「行きやすいCZと行きにくいCZ」)
   *      突破率の順序と期待度★の順序が一致していること = 星が嘘をつかない
   *
   * ── 参加型CZ(spec.participation)は別扱い(U27 / 2026-08-14)────────────
   * Well-Architected の successRate は当落抽選の確率ではなく
   * 「10Gで柱を6本積める確率」(DPで求めた公称値)なので、
   * 難易度を動かす場所が pillarGain 側にある = 単純な単調性の検査に混ぜられない。
   * そのぶん参加型には ★★★ を名乗る条件として次の2つを課す:
   *   ・恩恵が8種で最大(bonusDist の DYNAMO_BIG が最大)
   *   ・突破率が格差ラダーの最上位(抽選型CZのどれよりも高い)
   * 10G固定にした直後は獲得則が18G時代のままで突破率 28.5% = 下から2番目に落ちており、
   * 「★★★なのに一番抜けにくい」という星の嘘になっていた(2026-08-14 に獲得則を引き直し)。
   */
  {
    const specs = CZ_TYPES.specs;
    const lottery = specs.filter((s) => !s.participation);
    const sorted = [...lottery].sort((a, b) => a.successRate - b.successRate);
    const starsMonotonic = sorted.every((s, i) => i === 0
      || (s.expectation ?? 1) >= (sorted[i - 1].expectation ?? 1));
    const distSum = Object.values(CZ_TYPES.distribution).reduce((a, b) => a + b, 0);
    const spread = lottery.reduce((a, s) => Math.max(a, s.successRate), 0)
      - lottery.reduce((a, s) => Math.min(a, s.successRate), 1);
    // 参加型は「恩恵が8種で最大」かつ「突破率がラダー最上位」であることを見る
    const topBonusOf = (s) => s.bonusDist?.DYNAMO_BIG ?? 0;
    const ladderTop = lottery.reduce((a, s) => Math.max(a, s.successRate), 0);
    const partOk = specs.filter((s) => s.participation).every(
      (s) => specs.every((o) => o === s || topBonusOf(s) >= topBonusOf(o))
        && s.successRate >= ladderTop,
    );
    const ok = starsMonotonic && partOk && Math.abs(distSum - 1) < 1e-9 && spread >= 0.3
      && specs.every((s) => CZ_TYPES.distribution[s.id] != null);
    results.push([
      'CZの格差(突破率と★の整合)', ok,
      `${sorted.map((s) => `${s.id.replace('_', '')} ${pct(s.successRate)}${czStars(s)}`).join(' < ')}` +
      ` ※参加型 ${specs.filter((s) => s.participation).map((s) => `${s.id.replace('_', '')} ${pct(s.successRate)}(恩恵SP ${pct(topBonusOf(s))})`).join('/') || 'なし'}`,
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

  /*
   * (22b) U52c で足したCZ3種が「掟」を守っているか(2026-08-15)。
   *
   * 掟(game/modes/cz.js のファイル冒頭):
   *   1. 突破は必ず「完成の画」を作る(全ルール COMPLIANT / 4本開通 / 全波 survived)
   *   2. 途中経過から当落が読めない(当落どちらも道中は同じ上限まで)
   *      ※ 打ち切り型(Config / Shield)は「落ちた瞬間 = 結果確定イベント」なので対象外
   *   3. 「間に合わない絵」を作らない(残りG × 1ゲームの進行 ≧ 残タスク)
   *
   * 盤面(ui)を既存CZと共有しているぶん、**進行の型が別物であること**も一緒に見る:
   *   Config … 非突破は最終ゲームを待たずに打ち切る(TA は必ず最終ゲームまで行く)
   *   DX     … 道中は failRaised 本で頭打ち、最終ゲームで一斉開通(W-A は引いた役で伸びる)
   *   Shield … 1ゲームに faultsPerGame 波ずつ処理する(GameDay は1ゲーム1つ)
   */
  {
    /** 1回のCZを最後まで消化して結果を返す(rngValue で当落を固定する) */
    const playCz = (czId, rngValue) => {
      const bus = new EventBus();
      const params = [];
      bus.on('paramChange', (p) => params.push(p));
      const modes = new ModeMachine({ rng: new FixedRng(rngValue), bus });
      modes.start('FREE_TIER');
      modes._push('CZ', { czId, normalGames: 5 });
      const st = modes.state;
      let g = 0;
      while (modes.currentId === 'CZ' && g < 20) {
        step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
        g++;
      }
      return { st, g, params, to: modes.currentId };
    };

    // ── Config: 突破は全ルール COMPLIANT / 非突破は NON_COMPLIANT で打ち切り ──
    const cfgSpec = CZ_SPEC_BY_ID.CONFIG_RULES;
    const cfgWin = playCz('CONFIG_RULES', 0.001);
    const cfgLose = playCz('CONFIG_RULES', 0.999);
    const greens = (s) => s.items.filter((it) => it.level === 2).length;
    const cfgOk = cfgWin.st.success
      && greens(cfgWin.st) === cfgSpec.items.length
      && cfgWin.params.filter((p) => p.param === 'config_all_compliant').length === 1
      && cfgWin.g === cfgSpec.games && cfgWin.to === 'BONUS_READY'
      && cfgLose.st.success === false
      && greens(cfgLose.st) < cfgSpec.items.length
      && cfgLose.g === cfgLose.st.failStep          // 落ちたルールで打ち切っている
      && cfgLose.to === 'FREE_TIER';
    results.push([
      'Config CZ 全ルール準拠 / 途中打ち切り', cfgOk,
      `突破 ${greens(cfgWin.st)}/${cfgSpec.items.length}(${cfgWin.g}G)` +
      ` / 非突破 ${greens(cfgLose.st)}本止まり ${cfgLose.g}G(failStep=${cfgLose.st.failStep}) → ${cfgLose.to}`,
    ]);

    // ── DX: 突破は4本一斉開通 / 非突破は failRaised 本止まり ──
    const dxSpec = CZ_SPEC_BY_ID.DX_REDUNDANCY;
    const dxWin = playCz('DX_REDUNDANCY', 0.001);
    const dxLose = playCz('DX_REDUNDANCY', 0.999);
    const dxOk = dxWin.st.success && dxWin.st.raised === dxSpec.pillarNeeded
      && dxWin.params.filter((p) => p.param === 'dx_all_links').length === 1
      && dxWin.g === dxSpec.games && dxWin.to === 'BONUS_READY'
      && dxLose.st.success === false
      && dxLose.st.raised === dxSpec.failRaised
      && dxLose.g === dxSpec.games && dxLose.to === 'FREE_TIER'
      // 道中(最終ゲームの前)は当落どちらも同じ本数で頭打ち = 途中で結果が読めない
      && dxWin.params.filter((p) => p.param === 'dx_link').length === dxSpec.failRaised;
    results.push([
      'DX CZ 一斉開通 / 道中は同じ本数で頭打ち', dxOk,
      `突破 ${dxWin.st.raised}/${dxSpec.pillarNeeded}本(道中 ${dxSpec.failRaised}本)` +
      ` / 非突破 ${dxLose.st.raised}本止まり → ${dxLose.to}`,
    ]);

    // ── Shield: 1ゲーム2波 / 突破はバジェットを残して全波 survived ──
    const shSpec = CZ_SPEC_BY_ID.SHIELD_DDOS;
    const shWin = playCz('SHIELD_DDOS', 0.001);
    const shLose = playCz('SHIELD_DDOS', 0.999);
    const waves = shWin.params.filter((p) => p.param === 'shield_wave').length;
    const shOk = shWin.st.success
      && shWin.st.survived === shSpec.faults.length
      && shWin.st.faults.every((f) => f.status === 'survived')
      && shWin.st.budget > 0                            // 耐え切る回は必ずバジェットが残る
      && waves === shSpec.faults.length
      && waves === shWin.g * shSpec.faultsPerGame       // 1ゲームに faultsPerGame 波
      && shWin.params.filter((p) => p.param === 'shield_mitigated').length === 1
      && shWin.to === 'BONUS_READY'
      && shLose.st.success === false && shLose.st.broken && shLose.st.budget === 0
      && shLose.st.survived < shSpec.faults.length && shLose.to === 'FREE_TIER';
    results.push([
      'DDoS CZ 波状(1G2波)/ 全波緩和で突破', shOk,
      `突破 ${shWin.st.survived}/${shSpec.faults.length}波を ${shWin.g}G(残バジェット ${shWin.st.budget}%)` +
      ` / 非突破 ${shLose.st.survived}波で枯渇(failStep=${shLose.st.failStep}) → ${shLose.to}`,
    ]);
  }

  /* ── U11: RUSH 体系(data/rushes.js)の検証 ───────────────────── */

  /*
   * (23) ボーナス中に **レア役** を引くと RUSH 抽選が走り、当選したら
   *      **ボーナス消化後に** 4種のいずれかへ突入する(U22 の主経路の担保)。
   *      ベルだけで消化した場合は抽選そのものが走らず、通常時(高確)へ戻る。
   */
  {
    const spec = BONUS_SPEC_BY_ID.S3_BIG;
    // レア役(スイカ)を引き続ける = 抽選が走る。FixedRng(0.001) は必ず当選側
    const winBus = new EventBus();
    const winEvents = [];
    winBus.on('paramChange', (p) => { if (p.param === 'rush_win') winEvents.push(p); });
    const win = new ModeMachine({ rng: new FixedRng(0.001), bus: winBus });
    win.start('FREE_TIER');
    win._push('BONUS', { bonusId: 'S3_BIG', viaReady: true });
    const winState = win.state;
    for (let i = 0; i < spec.games; i++) {
      step(win, { flag: 'MELON', win: 'MELON', payout: 5 });
    }
    const winTo = win.currentId;

    // ベルだけ = レア役が成立しない → 抽選そのものが走らない(U22)
    const bell = new ModeMachine({ rng: new FixedRng(0.001), bus: new EventBus() });
    bell.start('FREE_TIER');
    bell._push('BONUS', { bonusId: 'S3_BIG', viaReady: true });
    const bellState = bell.state;
    for (let i = 0; i < spec.games; i++) {
      step(bell, { flag: 'BELL', win: 'BELL', payout: 15 });
    }

    // シャークボーナスも同じロジック(U28)。サメ揃いは格にかかわらず確定
    const shark = new ModeMachine({ rng: new FixedRng(0.999), bus: new EventBus() });
    shark.start('FREE_TIER');
    shark._push('BONUS', { bonusId: 'LAMBDA_REG', viaReady: true });
    const sharkState = shark.state;
    step(shark, { flag: 'SHARK', win: 'SHARK', payout: 3 });

    const ok = winState.rushWin === true
      && winEvents.length === 1                       // 当選告知は1回だけ
      && winEvents[0].value === 'MELON'
      && RUSH_IDS.includes(winTo)                     // 消化後にRUSHへ
      && bellState.rushWin === false
      && bell.currentId === 'FREE_TIER'
      && sharkState.rushWin === true;                 // U28: シャークボーナスでも抽選が走る
    results.push([
      'ボーナス中のレア役でRUSH抽選', ok,
      `スイカ消化 → ${winTo}(告知${winEvents.length}回) / ベル消化 → ${bell.currentId}` +
      ` / シャークボーナス+サメ揃い → 当選=${sharkState.rushWin}`,
    ]);
  }

  /*
   * (23b) ボーナス→RUSH当選率の実測(2026-08-14 バランス調整で追加)。
   *
   * ── なぜ別に測るのか ──────────────────────────────────
   * セッション試行側の実測は **100回転の打ち切り** を受ける。
   * 途中で切れたボーナスは「まだ当たっていない状態」で分母から外れるが、
   * 打ち切られるのは長いボーナス(= 当選機会が多いぶん当選率が高い)に偏るため、
   * 完走のみで数えると当選率が数ポイント下振れする(特にセット継続型の SP)。
   * ここでは GameFlow を通さずボーナスだけを最後まで回し、**打ち切りの無い真の当選率**
   * を測る。設計の当落そのものを見たいときは常にこちらを正とすること。
   *
   * 検証25(解析式)と同じ値になるはずで、両方が一致していれば
   * 「式も実装も正しい」と言える(片方だけズレたらそちらにバグがある)。
   */
  {
    const trials = 15000;
    const rows = [];
    let bad = 0;
    for (const [id, target] of Object.entries(RUSH_ENTRY.targetByBonus)) {
      // シードは種別ごとに固定(実行のたびに結果が変わると検証にならない)
      const rng = new Rng(0x5A17_0000 + id.length * 7919);
      let win = 0;
      for (let i = 0; i < trials; i++) {
        const modes = new ModeMachine({ rng, bus: new EventBus() });
        modes.start('FREE_TIER');
        modes._push('BONUS', { bonusId: id, viaReady: true });
        const st = modes.state;
        let guard = 0;
        while (modes.currentId === 'BONUS' && guard++ < 400) {
          const flag = drawFlag(rng, null, 'BONUS');
          step(modes, { flag, win: flag, payout: payoutOf(flag, 'BONUS') });
        }
        if (st.rushWin) win++;
      }
      const rate = win / trials;
      const gap = (rate - target) * 100;
      if (Math.abs(gap) > 3) bad++;
      rows.push(`${id.replace('_', '')} ${pct(rate)}(目標 ${pct(target)})`);
    }
    results.push([
      'ボーナス→RUSH当選率(打ち切り無しの実測)', bad === 0,
      `${rows.join(' / ')}  ※各${trials.toLocaleString()}回`,
    ]);
  }

  /*
   * (24) RUSH 4種すべてに突入でき、消化し切ると引き戻し層へ落ちる。
   *      ヒーローRUSH(振り分け 2%)は統計試行では踏まないことがあるのでここで担保する。
   */
  {
    const bad = [];
    const detail = [];
    for (const id of RUSH_IDS) {
      const modes = new ModeMachine({ rng: new FixedRng(0.999), bus: new EventBus() });
      modes.start(id, {});
      let games = 0;
      while (modes.currentId === id && games < 80) {
        step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
        games++;
      }
      if (modes.currentId !== 'HOT_STANDBY') bad.push(`${id} → ${modes.currentId}`);
      detail.push(`${id.replace('_RUSH', '')} ${games}G`);
    }
    results.push([
      'RUSH 4種へ突入 → 消化で引き戻しへ', bad.length === 0,
      bad.length === 0 ? detail.join(' / ') : bad.join(' / '),
    ]);
  }

  /*
   * (24b) 引き戻しの復帰先が「普通のボーナス」で4種とも同じ(U32 / 2026-08-14 ユーザー指示)。
   *
   * 旧仕様は転落した RUSH へそのまま復帰していた(AS だけ3台 / 他は満額、という
   * 不整合を 2026-08-14 minor-a で「短い再開」に統一した経緯もここ)。
   * U32 で **復帰先はボーナス**(data/rushes.js の RECOVERY_BONUS)へ変わったので、
   * 4種とも次の3点を確認する:
   *   ・転落時に recoveryEntryParams が作った params(復帰先=BONUS / bonusId)を預けている
   *   ・**どのRUSHへも直接は戻らない**(resumeMode に RUSH のIDが入っていない)
   *   ・引き戻し中に100回転が尽きた場合の買い取りも同じ params から作られている
   *     (= 復帰したときに貰えるボーナス1回ぶんと食い違わない)
   */
  {
    const bad = [];
    const detail = [];
    const bonusSpec = BONUS_SPEC_BY_ID[RECOVERY_BONUS.bonusId] ?? {};
    const bonusGames = bonusSpec.type === 'set' ? bonusSpec.setGames : bonusSpec.games;
    for (const id of RUSH_IDS) {
      // 復帰まで見たいので必ず成功する引き戻しにする(FixedRng(0.001) = 成功側)
      const modes = new ModeMachine({ rng: new FixedRng(0.001), bus: new EventBus() });
      modes.start(id, {});
      let g = 0;
      while (modes.currentId === id && g++ < 80) {
        step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
      }
      if (modes.currentId !== 'HOT_STANDBY') { bad.push(`${id}: ${modes.currentId} へ落ちた`); continue; }
      const st = modes.state;
      const expectParams = recoveryParamsFor({ rushId: id, acu: RUSH_SPEC_BY_ID[id]?.acuInit });
      const same = JSON.stringify(st.resumeParams) === JSON.stringify(expectParams);
      if (!same) bad.push(`${id}: params ${JSON.stringify(st.resumeParams)}`);
      if (st.resumeMode !== RECOVERY_BONUS.mode) bad.push(`${id}: 復帰先 ${st.resumeMode}`);
      if (RUSH_IDS.includes(st.resumeMode)) bad.push(`${id}: RUSHへ直接復帰している`);
      // 買い取り(復帰確定ぶん)= 復帰ボーナス1回ぶん
      const lines = modes.current.handler.residualValue?.(st) ?? [];
      const coins = lines.reduce((a, l) => a + (l.coins ?? 0), 0);
      const expectCoins = Math.floor(bonusGames * BONUS_NET_PER_GAME);
      if (coins !== expectCoins) bad.push(`${id}: 買い取り ${coins}枚(期待 ${expectCoins})`);
      detail.push(`${id.replace('_RUSH', '')}→${st.resumeParams.bonusId}/${coins}枚`);
    }
    results.push([
      '引き戻しの復帰先はボーナスで4種統一(U32)', bad.length === 0,
      bad.length === 0
        ? `${detail.join(' / ')}(${bonusGames}G × ${fmt(BONUS_NET_PER_GAME, 2)}枚/G)`
        : bad.join(' / '),
    ]);
  }

  /*
   * (24b) 上位ATは **上乗せストックを持ったまま引き戻しへ落ちない**(2026-08-15)。
   *
   * 引き戻しの復帰先(U32 以降はボーナス)はセットストックを受け取れないので、
   * ストックを持ったまま転落すると「買い取りでは価値になるのに復帰すると消える」
   * 非対称が生まれる。game/modes/upperat.js の resolveSetEnd は
   * **セット末にストックを先に消化して継続する** ので構造的に 0 のはずで、
   * その不変条件をここで機械的に見張る(仕様を変えたら即座に落ちる)。
   */
  {
    // FixedRng(0.999): 継続率抽選も昇格抽選も必ず外れる = ストックだけが継続の頼り
    const modes = new ModeMachine({ rng: new FixedRng(0.999), bus: new EventBus() });
    modes.start('FREE_TIER');
    modes._push('SERVERLESS_RUSH', { stock: 2 });
    const at = modes.state;
    const setGames = at.total;
    let g = 0;
    let stockAtFall = null;
    while (modes.currentId === 'SERVERLESS_RUSH' && g < 60) {
      step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });
      g++;
    }
    if (modes.currentId === 'HOT_STANDBY') stockAtFall = modes.state.resumeStock ?? 0;
    // 引き戻し層の買い取り明細に 'stock' 行が無いこと(復帰と買い取りの扱いが一致)
    modes.state.success = true;
    const lines = MODE_HANDLERS.HOT_STANDBY?.residualValue?.(modes.state, {}) ?? [];
    const ok = modes.currentId === 'HOT_STANDBY'
      && stockAtFall === 0
      && g === setGames * 3               // 初期1セット + ストック2セットを消化してから転落
      && lines.every((l) => l.kind !== 'stock');
    results.push([
      '上位ATはストックを残して転落しない', ok,
      `ストック2セットぶん ${g}G(1セット${setGames}G)消化 → ${modes.currentId}` +
      ` / 預かりストック ${stockAtFall} / 買い取り明細 ${lines.length}行(stock行なし)`,
    ]);
  }

  /*
   * (25) RUSH の設計値の健全性(振り分けの合計 / ヒーローの希少性 /
   *      **レア役契機**の総合当選率が atRate の目標へ着地しているか)。
   *
   * U22(2026-08-14)で契機がレア役のみになったので、計算も作り替えた:
   *   1ゲームあたり p = Σ(ボーナス中テーブルの **レア役** 出現率 × 当選率)
   *     当選率は game/lottery.js の bonusRushWinRate と同じ関数を呼ぶ
   *     (率の式を sim 側に書き写すと、片方だけ直したときに検証が嘘になる)
   *   ゲーム数型   … 総合 = 1 − (1 − p)^games
   *   セット継続型 … 総合 = 1 − (1−c)·x^s / (1 − c·x^s)   x=1−p, s=setGames, c=continueRate
   *
   * 【重要】セット継続型を「平均G(setGames/(1−c))」で計算してはいけない。
   * 半分は1セットで終わるので、平均Gを使うと当選率を6ポイントほど過大評価する
   * (U22 の calibration で判明。旧実装のこの検証はその過大評価版だった)。
   */
  {
    const rareDenoms = BONUS_FLAGS.flags
      .filter((f) => f.denom && RARE_ROLE_IDS.includes(f.id));
    const rows = ['LAMBDA_REG', 'S3_BIG', 'DYNAMO_BIG'].map((id) => {
      const spec = BONUS_SPEC_BY_ID[id];
      // レア役1回あたりの当選率は抽選本体と同じ関数から引く
      const p = rareDenoms.reduce(
        (a, f) => a + bonusRushWinRate(f.id, id) / f.denom, 0,
      );
      const x = 1 - Math.min(1, p);
      const total = spec.type === 'set'
        ? 1 - ((1 - spec.continueRate) * x ** spec.setGames)
          / (1 - spec.continueRate * x ** spec.setGames)
        : 1 - x ** spec.games;
      return { id, total, target: RUSH_ENTRY.targetByBonus[id] ?? spec.atRate };
    });
    const distSum = Object.values(RUSH_TYPES.distribution).reduce((a, b) => a + b, 0);
    const premiumSum = Object.values(RUSH_TYPES.premiumDistribution).reduce((a, b) => a + b, 0);
    const heroRare = RUSH_TYPES.distribution.HERO_RUSH <= 0.05
      && RUSH_TYPES.premiumDistribution.HERO_RUSH > RUSH_TYPES.distribution.HERO_RUSH;
    // U22 の要求水準は「目標 ±3ポイント」。旧 0.06 から締めた
    const closeEnough = rows.every((r) => Math.abs(r.total - r.target) <= 0.03);
    const ok = Math.abs(distSum - 1) < 1e-9 && Math.abs(premiumSum - 1) < 1e-9
      && heroRare && closeEnough
      && RUSH_SPECS.specs.every((s) => RUSH_TYPES.distribution[s.id] != null);
    results.push([
      'RUSH振り分けと当選率の設計整合', ok,
      `${rows.map((r) => `${r.id.split('_')[0]} ${pct(r.total)}(目標${pct(r.target)})`).join(' / ')}` +
      ` / ヒーロー ${pct(RUSH_TYPES.distribution.HERO_RUSH)}`,
    ]);
  }

  /*
   * (25b) U22 / U23 / U24: 契機が **レア役のみ** になっていること。
   *
   * 「レア役セットの定義」と「実際の挙動」の両方を機械的に押さえる:
   *   1. data/flags.js の rare: フィールドと data/rareroles.js の定義が一致している
   *   2. ボーナス中にベル・リプレイを引いてもRUSH抽選が走らない(当選率0)
   *   3. RUSH 4種の上乗せテーブルにレア役以外の行が残っていない
   *   4. ホットスタンバイの +1G / AS_RUSH の上乗せがベルでは起きない
   */
  {
    const problems = [];

    // 1. テーブルと共通定義のズレ
    const mismatches = rareFlagMismatches();
    if (mismatches.length > 0) problems.push(`rare定義ズレ: ${mismatches.join(', ')}`);

    // 2. 非レア役はボーナス中に抽選が走らない(率0 = drawBonusRushWin も乱数を消費しない)
    for (const flag of ['BELL', 'REPLAY', 'REPLAY2', 'ALARM', 'LOSE']) {
      for (const bonusId of ['LAMBDA_REG', 'S3_BIG', 'DYNAMO_BIG']) {
        if (bonusRushWinRate(flag, bonusId) !== 0) problems.push(`${bonusId}/${flag} が当選率>0`);
      }
    }

    // 3. 上乗せテーブルにレア役以外が残っていないか
    const tables = [
      ['AS_RUSH.addUnitsByFlag', RUSH_SPEC_BY_ID.AS_RUSH.addUnitsByFlag],
      ['CF_RUSH.coinByFlag', RUSH_SPEC_BY_ID.CF_RUSH.coinByFlag],
      ['AURORA_RUSH.acuUpByFlag', RUSH_SPEC_BY_ID.AURORA_RUSH.acuUpByFlag],
      ['HERO_RUSH.coinByFlag', RUSH_SPEC_BY_ID.HERO_RUSH.coinByFlag],
      ['RUSH_ENTRY.rateByFlag', RUSH_ENTRY.rateByFlag],
    ];
    for (const [label, table] of tables) {
      const extra = Object.keys(table).filter((f) => !RARE_ROLE_IDS.includes(f));
      if (extra.length > 0) problems.push(`${label} に非レア役 ${extra.join('/')}`);
    }

    // 4-a. ホットスタンバイ: ベルでは延長しない / レア役では延長する
    const standby = (flag) => {
      const modes = new ModeMachine({ rng: new FixedRng(0.001), bus: new EventBus() });
      modes.start('HOT_STANDBY', { resumeMode: 'AS_RUSH' });
      const before = modes.state.total;
      step(modes, { flag, win: flag, payout: 0 });
      return modes.state.total - before;
    };
    const bellExt = standby('BELL');
    const melonExt = standby('MELON');
    if (bellExt !== 0) problems.push(`ホットスタンバイがベルで +${bellExt}G`);
    if (melonExt !== 1) problems.push(`ホットスタンバイがスイカで +${melonExt}G`);

    // 4-b. AS_RUSH: ベルでは上乗せしない / レア役では上乗せする
    const scaleOut = (flag) => {
      const modes = new ModeMachine({ rng: new FixedRng(0.999), bus: new EventBus() });
      modes.start('AS_RUSH', { units: 5 });
      const before = modes.state.total;
      step(modes, { flag, win: flag, payout: 0 });
      return modes.state.total - before;
    };
    const bellAdd = scaleOut('BELL');
    const cherryAdd = scaleOut('WEAK_CHERRY');
    if (bellAdd !== 0) problems.push(`AS_RUSH がベルで +${bellAdd}G`);
    if (cherryAdd !== RUSH_SPEC_BY_ID.AS_RUSH.addUnitsByFlag.WEAK_CHERRY) {
      problems.push(`AS_RUSH が弱チェで +${cherryAdd}G`);
    }

    results.push([
      '契機はレア役のみ(U22/U23/U24)', problems.length === 0,
      problems.length === 0
        ? `レア役 ${RARE_ROLE_IDS.length}種 / ベル契機なし(標準スタンバイ +${bellExt}G / AS +${bellAdd}G)`
        : problems.join(' / '),
    ]);
  }

  /*
   * (26) オートスケーリングRUSH の上乗せ期待値が 1.0 未満(= 必ず終わる)。
   *      1ゲームあたりの期待上乗せ台数が 1 を超えると理論上RUSHが終わらなくなる。
   *
   * 【甘スロ(U44)の扱い】レア役が2倍になるので上乗せ期待値も2倍(0.25 → 0.50)。
   * 1.0 は超えない = 必ず終わるが、平均滞在は伸びる。
   * これは救済モードとして意図した甘さなので、**滞在Gの上限だけ甘スロ用に広げる**
   * (発散するかどうかを見る expect < 0.85 は両モード共通で締めたまま)。
   *
   * 【U50(2026-08-15)】AS_RUSH に通算上限(maxTotalGames)が付いたので、
   * 発散するかどうかに加えて **上限が一撃 800枚の壁を守っているか** も見る
   * (maxTotalGames × payoutPerGame ≦ 800枚。data/rushes.js 冒頭のルール②)。
   */
  {
    const spec = RUSH_SPEC_BY_ID.AS_RUSH;
    const add = spec.addUnitsByFlag;
    const expect = NORMAL_FLAGS.flags.reduce((a, f) => (
      f.denom && add[f.id] ? a + add[f.id] / f.denom : a
    ), 0);
    const initAvg = Object.entries(spec.initUnitsDist)
      .reduce((a, [g, w]) => a + Number(g) * w, 0);
    // 上限が無ければ initAvg/(1-expect) が平均滞在。上限があればそこで頭打ち
    const meanGames = Math.min(spec.maxTotalGames ?? Infinity, initAvg / Math.max(0.01, 1 - expect));
    const gamesLimit = AMA_MODE ? 45 : 30;
    /** 一撃の構造上の上限(通算上限 × 固定純増)。目標は 800枚以下 */
    const hardMax = (spec.maxTotalGames ?? Infinity) * spec.payoutPerGame;
    const ok = expect < 0.85 && meanGames < gamesLimit && hardMax <= 800;
    results.push([
      'AS RUSH の上乗せ期待値 < 1(必ず終わる)', ok,
      `期待 +${fmt(expect, 3)}G/G / 初期 ${fmt(initAvg, 2)}台 → 平均 ${fmt(meanGames, 1)}G` +
      `(約${fmt(meanGames * spec.payoutPerGame, 0)}枚 / 通算上限 ${spec.maxTotalGames}G` +
      ` = 一撃 ${hardMax}枚 / 滞在上限 ${gamesLimit}G` +
      `${AMA_MODE ? ` ※${AMA.label}` : ''})`,
    ]);
  }

  /*
   * (26-b) **1ゲーム100枚の壁**(U50 / 2026-08-15 ユーザー指示)。
   *
   * 「Auroraラッシュとか純増多すぎてやばすぎ」への構造的な回答。
   * 1ゲームの純増が100枚を超えてよいのは **フリーズ恩恵** と
   * **確定役(サメ揃い / ゴースト揃い)を引いたゲーム** だけ、というルールを
   * データの組み合わせだけで守れているかを検算する
   * (実測での確認は scripts/channel-probe.mjs の [2])。
   *
   * 各RUSHの「非確定役で出せる1ゲームの最大枚数」:
   *   AS     … 固定純増そのもの(上乗せは枚数を増やさない)
   *   CF     … 毎ゲームのヒット最大 + 非確定レア役の確定クレジット最大
   *   Aurora … acuMax(ACUがそのまま純増)
   *   ヒーロー … 毎ゲーム当選の枚数 + 非確定レア役の +α 最大
   * ここが100枚を超える組み合わせを入れた瞬間に落ちる。
   */
  {
    const nonConfirmed = RARE_ROLE_IDS.filter((f) => !CONFIRMED_ROLE_IDS.includes(f));
    const maxOf = (table) => Math.max(0, ...nonConfirmed.map((f) => table?.[f] ?? 0));
    const AS = RUSH_SPEC_BY_ID.AS_RUSH;
    const CF = RUSH_SPEC_BY_ID.CF_RUSH;
    const AU = RUSH_SPEC_BY_ID.AURORA_RUSH;
    const HE = RUSH_SPEC_BY_ID.HERO_RUSH;
    const rows = [
      ['AS', AS.payoutPerGame],
      ['CF', Math.max(0, ...Object.keys(CF.hitCoinDist).map(Number)) + maxOf(CF.coinByFlag)],
      ['Aurora', AU.acuMax],
      ['ヒーロー', HE.hitCoin + maxOf(HE.coinByFlag)],
    ];
    const over = rows.filter(([, v]) => v > 100);
    results.push([
      '1ゲーム100枚の壁(確定役・フリーズを除く)', over.length === 0,
      over.length === 0
        ? rows.map(([k, v]) => `${k} ${v}枚`).join(' / ')
        : `超過: ${over.map(([k, v]) => `${k} ${v}枚`).join(' / ')}`,
    ]);
  }

  /*
   * (27) 入賞待ちが恩恵を落とさない(2026-08-14 しおん指摘 critical)。
   *
   * ボーナスは ENTRY_GATE により必ず BONUS_READY を経由する。
   * 以前は入賞待ちが `{bonusId, viaReady}` だけを作り直して BONUS へ渡していたため、
   * レバーONフリーズの恩恵(rushGuaranteed / premium)が入口で消え、
   * 「FREEZE!! + RUSH確定!!」と告知したのに rushWin=false で始まっていた。
   * data/freeze.js の「フリーズは裏切ってはいけない」を機械的に守るための検証。
   */
  {
    const modes = new ModeMachine({ rng: new FixedRng(0.999), bus: new EventBus() });
    modes.start('FREE_TIER');
    // freetier.js の transitionFor(フリーズ当選時)と同じ params で入る
    modes._push('BONUS', { bonusId: 'DYNAMO_BIG', rushGuaranteed: true, premium: true });
    const gated = modes.currentId;                 // BONUS_READY のはず
    const readyKept = modes.state.rushGuaranteed === true && modes.state.premium === true;
    // 入賞待ちのまま100回転が尽きても RUSH確定ぶんが買い取られる
    const readyBuyout = (modes.current.handler.residualValue?.(modes.state) ?? [])
      .some((l) => l.kind === 'stock' && l.coins > 0);
    step(modes, { flag: 'LOSE', win: 'LOSE', payout: 0 });   // ハズレ = 図柄が揃う
    const ok = gated === 'BONUS_READY' && readyKept && readyBuyout
      && modes.currentId === 'BONUS'
      && modes.state.rushWin === true && modes.state.rushPremium === true;
    results.push([
      'フリーズ恩恵が入賞待ちで消えない', ok,
      `${gated}(確定保持=${readyKept} / 買い取り=${readyBuyout}) → ${modes.currentId}` +
      `(rushWin=${modes.state.rushWin} / premium=${modes.state.rushPremium})`,
    ]);
  }

  /*
   * (28) AS_RUSH の「EC2の台数 = 残りゲーム数」が常に成り立つ(しおん指摘 major)。
   *
   * units が残Gと乖離すると、液晶の見出し「EC2 INSTANCES = 残りゲーム数」も
   * テロップの「n 台(残り m G)」も買い取り明細も全部が嘘になる。
   * 通算ゲーム数は state.total、伸びの記録は peakUnits / addedUnits が持つ。
   */
  {
    const rng = new Rng(20260814);
    const flags = ['LOSE', 'BELL', 'REPLAY', 'WEAK_CHERRY', 'MELON', 'CHANCE', 'STRONG_CHERRY'];
    let bad = 0;
    let checks = 0;
    let peakSeen = 0;
    let totalMismatch = 0;
    for (let i = 0; i < 3000; i++) {
      const modes = new ModeMachine({ rng, bus: new EventBus() });
      modes.start('AS_RUSH', { units: 3 });
      const st = modes.state;
      let g = 0;
      while (modes.currentId === 'AS_RUSH' && g++ < 200) {
        const flag = flags[Math.floor(rng.next() * flags.length)];
        step(modes, { flag, win: flag, payout: 0, rng });
        if (modes.currentId !== 'AS_RUSH') break;
        checks++;
        if (st.units !== st.remaining) bad++;
        if (st.total !== st.playedGames + st.remaining) totalMismatch++;
        peakSeen = Math.max(peakSeen, st.peakUnits ?? 0);
      }
    }
    const ok = bad === 0 && totalMismatch === 0 && checks > 0;
    results.push([
      'AS RUSH の台数 = 残りゲーム数', ok,
      `${checks}G 検査 / 不一致 ${bad}件 / 通算G不整合 ${totalMismatch}件 / 最大同時 ${peakSeen}台`,
    ]);
  }

  /*
   * (29) 確定役(サメ揃い / ゴースト揃い)が一元管理されている(2026-08-14 検証指摘)。
   *
   * data/rareroles.js の CONFIRMED_ROLE_IDS が唯一の正で、
   * data/rushes.js の alwaysWinFlags はそこから作る。
   * 写しを持っていた頃は「確定役を1つ足す → alwaysWinFlags に入れ忘れ →
   * rateByFlag にも無いので当選率0% = 確定役なのに一度も当たらない」が起こりえた。
   * 検証25(3.)は rateByFlag などのテーブルしか見ていないのでこの穴を通り抜ける。
   *
   * 見るのは3点:
   *   1. alwaysWinFlags と CONFIRMED_ROLE_IDS が集合として一致
   *   2. 確定役はどのボーナスでも当選率 1.0(格に依らず確定)
   *   3. premiumFlags ⊆ CONFIRMED_ROLE_IDS(プレミアは確定役の部分集合)
   */
  {
    const problems = [];
    const always = [...RUSH_ENTRY.alwaysWinFlags].sort();
    const confirmed = [...CONFIRMED_ROLE_IDS].sort();
    if (always.join(',') !== confirmed.join(',')) {
      problems.push(`alwaysWinFlags[${always}] ≠ CONFIRMED_ROLE_IDS[${confirmed}]`);
    }
    for (const flag of CONFIRMED_ROLE_IDS) {
      for (const bonusId of Object.keys(RUSH_ENTRY.targetByBonus)) {
        const rate = bonusRushWinRate(flag, bonusId);
        if (rate !== 1) problems.push(`${bonusId}/${flag} の当選率が ${fmt(rate, 3)}(確定でない)`);
      }
      if (!RARE_ROLE_IDS.includes(flag)) problems.push(`${flag} がレア役セットに無い`);
    }
    const notConfirmed = RUSH_ENTRY.premiumFlags.filter((f) => !CONFIRMED_ROLE_IDS.includes(f));
    if (notConfirmed.length > 0) problems.push(`premiumFlags に非確定役 ${notConfirmed.join('/')}`);
    results.push([
      '確定役は rareroles.js 一元管理', problems.length === 0,
      problems.length === 0
        ? `${confirmed.join(' / ')} が3ボーナスとも当選率 1.000(プレミア: ${RUSH_ENTRY.premiumFlags.join(',')})`
        : problems.join(' / '),
    ]);
  }

  /*
   * (12) 全派生ゾーンへ実際に突入できる(2026-08-14 しおん指摘 S8)。
   *
   * SPOT / EC2 BURST / RESERVED は統計試行では踏まないことがあるので、
   * 「RUSH中に該当のレア役を引き、テーブルの帯を撃つ」を1件ずつ再現して確かめる。
   * 突入経路そのものが消えた場合はここで必ず落ちる。
   */
  {
    const zoneIds = Object.keys(ZONE_SPEC_BY_ID);
    const bad = [];
    for (const id of zoneIds) {
      const entry = derivedZoneEntryFor(id);
      if (!entry) { bad.push(`${id}: 突入経路なし`); continue; }
      const modes = new ModeMachine({ rng: new FixedRng(entry.value), bus: new EventBus() });
      modes.start('AS_RUSH', { dc: 3 });
      step(modes, { flag: entry.flag, win: entry.flag, payout: 0 });
      if (modes.currentId !== id) {
        bad.push(`${id}: ${entry.flag}(r=${fmt(entry.value, 2)}) → ${modes.currentId}`);
      }
    }
    results.push([
      '全派生ゾーンへ突入できる', bad.length === 0,
      bad.length === 0 ? `${zoneIds.length}種すべて到達` : bad.join(' / '),
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
  // 100回転で1セッションなので、長時間モードは複数セッションの累計で見る
  const g = totals.games;
  const payoutRate = totals.out / Math.max(1, totals.in);
  const diff = totals.out - totals.in;
  const meanScore = totals.score.reduce((a, b) => a + b, 0) / Math.max(1, totals.score.length);

  console.log(`\n■ 自動試行 ${g.toLocaleString()}G (seed=${SEED})`);
  // 回転数は data/session.js を正とする(2026-08-14 しおん指摘 S8: 100回転化後も50と表示していた)
  console.log(
    `  セッション数   : ${totals.sessions.toLocaleString()}回(${SESSION.totalGames}回転/セッション)`,
  );
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
  /*
   * バランスの目標値(1/95〜110)は **抽選で引いた初当りだけ** で見る。
   * 除くのは通常時Gを使わずに増える2種類(--session / balance-probe と同じ定義):
   *   ・天井(Auto Recovery)… ハマりの救済で必ず当たるぶん。
   *     Well-Architected CZ が突破確定なので到達回数 = 初当り回数。
   *   ・引き戻し復帰(U32)… RUSH 転落後のホットスタンバイ成功で入るボーナス。
   * どちらかでも混ぜると 1/81〜87 まで軽く見え、目標を20%外したように読めてしまう。
   */
  const ceilingN = stat.ceiling;
  const recoveryN = stat.recoveryBonus;
  const drawnBonus = Math.max(0, (stat.enter.BONUS ?? 0) - ceilingN - recoveryN);
  console.log(`   └ 抽選由来   : ${per(drawnBonus)}  (${drawnBonus}回) ← 目標 1/95〜110`);
  console.log(
    `      天井 ${ceilingN}回 / 引き戻し復帰(U32)${recoveryN}回` +
    `  ※どちらも通常時Gを使わないので初当りの分子から除く`,
  );
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
    /*
     * 突入したのに抜けていない = 親へ復帰できていない疑い。
     *
     * ただし試行は「指定ゲーム数に達した瞬間」に止まるので、
     * **その瞬間に滞在していたモードは必ず1回ぶん exit が出ない**。
     * 1件だけの差は打ち切りの誤検知(実際 CLOUDFRONT のような薄い経路で
     * 1回しか踏まなかった回に NG が出ていた)なので、2件以上の差で判定する。
     */
    if (n - ex > 1) unbalanced.push(`${id}(突入${n}/退出${ex})`);
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

  /**
   * 未突入モードの扱い(2026-08-14 しおん指摘 S8)。
   *
   * 「レア役 × 数十%」でしか入れない派生ゾーンは試行数によっては踏まない。
   * データ上の突入経路がある(ROUTED_MODES)なら統計の揺らぎなので OK とし、
   * 経路そのものが無いモードだけを NG にする。
   * 実際に入れることは checkRareRoutes の「全派生ゾーンへ突入できる」で毎回確認している。
   */
  const thinMissing = missing.filter((id) => ROUTED_MODES.has(id));
  const unreachable = missing.filter((id) => !ROUTED_MODES.has(id));
  const okAllModes = unreachable.length === 0;
  const okReturn = unbalanced.length === 0;
  const okDepth = stat.maxDepth <= MAX_STACK_DEPTH;
  console.log('\n■ 判定');
  console.log(
    `  全モード突入   : ${okAllModes
      ? `OK${thinMissing.length > 0 ? `(今回未突入: ${thinMissing.join(', ')} ※薄い経路。狙い撃ち確認で到達を検証済み)` : ''}`
      : `NG(突入経路なし: ${unreachable.join(', ')})`}`,
  );
  console.log(`  ゾーン親復帰   : ${okReturn ? 'OK' : `NG(抜けていない: ${unbalanced.join(', ')})`}`);
  console.log(`  スタック深さ   : ${okDepth ? 'OK' : 'NG'}`);
  return okAllModes && okReturn && okDepth;
}

// ── 実行 ──────────────────────────────────────

printSettingBanner();

const okReels = checkReels();
const okGuard = checkStackGuard();
const okRoutes = BASELINE ? true : checkRareRoutes();

// 停止形の健全性(ハズレで入賞形を作っていないか)
const lineOk = categorizeLine(['BLANK', 'BLANK', 'BLANK']) === 'LOSE';

let okRun = true;
if (SESSION_MODE) {
  // 100回転スコアアタックのセッション分布(docs/BACKLOG.md「M」)
  reportSessions(runSessions(SESSION_RUNS, SEED));
  // 分布は「目標との比較」で別途出す。ここでの合否は経路検証だけで判定する
} else {
  okRun = report(run(GAMES, SEED));
}

const allOk = okReels && okGuard && okRoutes && okRun && lineOk;
console.log(`\n総合: ${allOk ? 'PASS' : 'FAIL'}`);
process.exit(allOk ? 0 : 1);
