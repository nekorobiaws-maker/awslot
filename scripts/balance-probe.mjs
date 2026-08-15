/**
 * バランス調整の反復用プローブ(2026-08-14)。
 *
 * scripts/sim.mjs は「仕様が壊れていないか」の検証が主目的で出力が長い。
 * こちらは **目標レンジに載っているかどうかだけ**を複数シードでまとめて出す。
 *
 *   ・平均 / 中央値 / 上位1% スコア、機械割
 *     ※ U50(2026-08-15)で上位1%の目標は 1,600 → **1,250枚** に変わった。
 *       RUSH 1回を p99 800枚で頭打ちにしたので、100回転に入る RUSH の回数(4〜5回)から
 *       上位1%には算術的な天井がある(理由は scripts/sim.mjs の TARGET のコメント)。
 *   ・抽選由来の初当り(天井経由と引き戻し復帰を除いたボーナス初当り / 通常時G基準)
 *     ※ 定義は sim.mjs の既定モード・--session と同じ。3つのどれで見ても同じ数字になる
 *   ・ボーナス種別ごとの RUSH当選率(打ち切りの影響を除いた推定つき)
 *   ・RUSH 4種の1回あたり獲得
 *   ・6本柱CZ(WELL_ARCHITECTED)の抽選経由突破率
 *   ・レバーONフリーズの遭遇率
 *
 * 使い方:
 *   node scripts/balance-probe.mjs [セッション数] [シード...]
 *   node scripts/balance-probe.mjs 4000 777 555 20260814
 *
 *   # 甘スロ(U44 / ブラウザの ?ama=1 と同じ設定)で回す
 *   node scripts/balance-probe.mjs 4000 777 555 --ama
 *   ※ 甘スロは救済モードなので目標レンジ(平均220〜340 / 機械割150〜190%)からは外れる。
 *     見るのは「壊れていないか」= 初当りが 1/40 より軽くなっていないか。
 */

import { EventBus } from '../src/engine/eventbus.js';
import { Rng } from '../src/engine/rng.js';
import { Credit } from '../src/game/credit.js';
import { ReelController } from '../src/game/reelctrl.js';
import { ModeMachine, MODE_HANDLERS } from '../src/game/modemachine.js';
import { GameFlow } from '../src/game/flow.js';
import { SESSION } from '../src/data/session.js';
import { RUSH_IDS, RUSH_SPEC_BY_ID } from '../src/data/rushes.js';
import { BET_PER_GAME } from '../src/data/payouts.js';
import { CZ_ENTRY, CZ_TYPES, CZ_SPEC_BY_ID, NORMAL_SUBSTATES } from '../src/data/modes.js';
import { CHAIN_SPEC_BY_PATTERN, ZENCHO } from '../src/data/zencho.js';
import { BONUS_FLAGS } from '../src/data/flags.js';

const args = process.argv.slice(2).map(Number).filter(Number.isFinite);
const RUNS = args[0] ?? 3000;
const SEEDS = args.length > 1 ? args.slice(1) : [777, 555, 20260814];
const DT = 120;

/**
 * `--preu72` … U72(チャンス目=CZ突入確定)を入れる前の値で回す(2026-08-15)。
 *
 * before/after を **同じ物差し** で並べるための比較モード。
 * data/modes.js が保持している previous* から旧値を復元するだけなので、
 * 「表を書き写した before」ではなく実測の before が出る。
 * game/modes/freetier.js の確定役判定は CZ_ENTRY.table の cz が 1.000 かどうかを
 * 見ているだけなので、テーブルを戻せば **告知と移行前兆の挙動も自動で旧仕様に戻る**。
 */
if (process.argv.includes('--preu72')) {
  // ① CZ導線(チャンス目=確定 / ステージのおまけ化 / 突破率ラダー)
  CZ_ENTRY.table = JSON.parse(JSON.stringify(CZ_ENTRY.previousTableU63));
  NORMAL_SUBSTATES.czPerGame = { ...NORMAL_SUBSTATES.previousCzPerGameU63 };
  NORMAL_SUBSTATES.bonusShareOfStageDraw = { ...NORMAL_SUBSTATES.previousBonusShareU63 };
  for (const [id, rate] of Object.entries(CZ_TYPES.previousSuccessRateU63)) {
    if (CZ_SPEC_BY_ID[id]) CZ_SPEC_BY_ID[id].successRate = rate;
  }
  // ② 擬似連の重み(U72 で本前兆側を 10 → 36 にした)
  for (const p of ZENCHO.patterns) {
    if (p.previousWeightU63) p.weight = { ...p.previousWeightU63 };
  }
  // ③ オートスケーリングRUSH(純増35枚 × 初期6.96台 × 通算22G)
  const AS = RUSH_SPEC_BY_ID.AS_RUSH;
  AS.payoutPerGame = AS.previousPayoutPerGame35;
  AS.initUnitsDist = { ...AS.previousInitUnitsDistU50 };
  AS.maxUnits = AS.previousMaxUnits22;
  AS.maxTotalGames = AS.previousMaxTotalGames22;
  // ④ ボーナス中のベル(U72 で 15 → 18枚)
  const bonusBell = BONUS_FLAGS.flags.find((f) => f.id === 'BELL');
  if (bonusBell) bonusBell.payout = BONUS_FLAGS.previousBellPayout15;
  console.log(
    '※ --preu72: 「チャンス目=CZ突入確定」を入れる前(U63)の値で試行します\n'
    + '  (CZ導線 / 擬似連の重み / AS RUSH の純増と台数 / ボーナス中のベルを一括で戻します。\n'
    + '   ただし data/payouts.js の BONUS_NET_PER_GAME は読み込み時に確定する定数なので、\n'
    + '   買い取りの見積もりだけ U72 の値(10.60枚/G)のまま残ります。\n'
    + '   **初当り・CZ突入・擬似連・ボーナス回数は正確に U63 を再現**しますが、\n'
    + '   平均・中央値・機械割はこの買い取りぶんだけ高めに出ます)\n',
  );
}

/** 擬似連の演出パターンID(data/zencho.js の CHAIN_SPEC_BY_PATTERN が正) */
const CHAIN_PARAMS = Object.values(CHAIN_SPEC_BY_PATTERN).map((s) => s.chainParam);

const fmt = (n, d = 1) => Number(n).toFixed(d);
const pct = (n, d = 2) => `${fmt(n * 100, d)}%`;

/** 1セッションを最後まで回して集計を返す */
function playSession(seed, agg) {
  const bus = new EventBus();
  const rng = new Rng(seed);
  const inputRng = new Rng((seed ^ 0x5bf03635) >>> 0);
  const credit = new Credit(SESSION.startCredit);
  const reels = new ReelController();
  const modes = new ModeMachine({ rng, bus });
  const flow = new GameFlow({ bus, rng, credit, reels, modeMachine: modes });

  let freeze = false;
  bus.on('leverOn', (p) => {
    /*
     * 初当り確率の分母は「通常時のG数」= FREE_TIER + CZ(実機の慣習。sim.mjs と同じ)。
     * CZ は突入回数ではなく **滞在ゲーム数** を数えること
     * (回数で数えると分母が 1セッションあたり4G以上小さくなり、初当りが甘く見える)。
     */
    if (p.mode === 'FREE_TIER' || p.mode === 'CZ') agg.normalSpins++;
    /*
     * ステージ滞在の内訳(U63 で追加)。
     * レア役の出現率を上げると昇格が増えるので、**気づかないうちに高確が日常になる**
     * (= ステージ示唆が意味を失う)。CZ供給の蛇口(czPerGame)は
     * 「滞在率 × 毎ゲーム抽選」なので、初当りを合わせる前にここを見ること。
     * leverOn のペイロードには内部状態が乗っていないため ModeMachine から直接読む。
     */
    if (p.mode === 'FREE_TIER') {
      agg.stage[modes.state?.subState ?? 'COLD_START'] =
        (agg.stage[modes.state?.subState ?? 'COLD_START'] ?? 0) + 1;
    }
    if (p.freeze) freeze = true;
  });
  /*
   * 前兆と擬似連の発生量(U72 で追加 / 2026-08-15 ユーザー指摘「擬似連が出ない」)。
   *
   * 擬似連(分散マップ / CodePipeline)は **前兆の演出パターンの1つ**なので、
   * 前兆そのものが走らなくなると連動して消える = 前兆の本数と一緒に見ないと原因が読めない。
   *   zencho    … 前兆の1step通知(擬似連以外のパターン。step=1 が前兆の開始)
   *   chain     … 擬似連の1step通知(step=1 が開始 / step が伸びるほど連チャン)
   *   chain2plus… 2step以上まで伸びた擬似連 = 「擬似連らしく見えた」回数
   */
  bus.on('paramChange', (p) => {
    if (p.param === 'zencho' && p.step === 1) agg.zenchoStarts++;
    if (!CHAIN_PARAMS.includes(p.param)) return;
    if (p.step === 1) { agg.zenchoStarts++; agg.chains++; }
    if (p.step === 2) agg.chains2plus++;
    agg.chainSteps++;
  });
  bus.on('modeExit', (p) => {
    if (p.id === 'CZ' && p.state?.czId) {
      /*
       * CZ突入の回数と入口の内訳(U72 で追加)。
       *
       * 「チャンス目を引いたらCZ」を主線に据えた以上、**1セッションに何回CZへ入るか**と
       * **そのうち何割がチャンス目由来か**がバランスの一次指標になる
       * (初当りだけ見ていると、CZが増えて突破率が下がっただけの状態に気づけない)。
       * route は game/modes/freetier.js が付ける入口ラベル:
       *   chance … チャンス目成立(主線)/ stage:WARM_POOL・stage:PROVISIONED … ステージの毎G抽選
       *   direct … その他のレア役契機 / ceiling … 天井(Auto Recovery)
       */
      agg.czEntries++;
      const route = (p.state.route ?? 'direct').split(':')[0];
      agg.czRoute[route] = (agg.czRoute[route] ?? 0) + 1;
      const c = (agg.cz[p.state.czId] ??= { drawn: 0, win: 0, ceil: 0 });
      if (p.state.fromCeiling) { c.ceil++; return; }
      c.drawn++;
      if (p.state.success) c.win++;
    }
    if (p.id === 'BONUS') {
      const b = (agg.bonus[p.state.bonusId] ??= { done: 0, win: 0, cut: 0, cutWin: 0, freeze: 0 });
      if (p.state.rushWinFlag === 'FREEZE') { b.freeze++; return; }
      if (p.state.remaining === 0) {
        b.done++;
        if (p.state.rushWin) b.win++;
      } else {
        b.cut++;
        if (p.state.rushWin) b.cutWin++;
      }
    }
    if (RUSH_IDS.includes(p.id)) {
      const r = (agg.rush[p.id] ??= { n: 0, games: 0, gained: 0, value: 0 });
      r.n++;
      r.games += p.state?.playedGames ?? 0;
      r.gained += p.state?.gained ?? 0;
      /*
       * 「1回の価値」= 消化して得た枚数 + 100回転切れで買い取られた残ゲーム分。
       * gained だけだと打ち切られたRUSHが過小に、完走のみだと
       * 長く伸びたRUSHほど分母から消えるので、どちらの偏りも受けないこの値で見る。
       */
      const residual = MODE_HANDLERS[p.id]?.residualValue?.(p.state, {}) ?? [];
      r.value += (p.state?.gained ?? 0) + residual.reduce((a, l) => a + (l.coins ?? 0), 0);
    }
  });
  bus.on('modeEnter', (p) => {
    if (p.resumed) return;
    if (p.id === 'BONUS') {
      agg.bonusEntries++;
      /*
       * U32: 引き戻し(ホットスタンバイ)成功の復帰先がボーナスになったので、
       * 通常時の抽選で引いた初当りと **同じ数え方をすると初当りが甘く見える**
       * (復帰ボーナスは通常時G を1回も消費していないのに分子だけ増える)。
       * 初当りの分子からは外し、別枠で数える。
       */
      if (p.state?.fromRecovery) agg.recoveryBonus++;
    }
    if (p.id === 'CZ' && p.state?.fromCeiling) agg.ceilingBonus++;
  });

  modes.start('FREE_TIER');
  let guard = 0;
  while (!flow.session.ended && guard++ < 200000) {
    if (modes.awaitingChoice && flow.state === 'IDLE') flow.stopReel(inputRng.chance(0.5) ? 0 : 2);
    else if (flow.canBet) flow.insertBet();
    else if (flow.canLever) flow.leverOn();
    else if (flow.canStop) {
      const next = reels.reels.find((r) => r.canStop);
      if (next) flow.stopReel(next.index);
    }
    flow.update(DT);
  }

  agg.freezeSessions += freeze ? 1 : 0;
  agg.at += flow.stats.at;
  agg.in += credit.totalIn;
  agg.out += credit.totalOut;
  return credit.diff;
}

function runSeed(seed) {
  const agg = {
    normalSpins: 0, bonusEntries: 0, ceilingBonus: 0, recoveryBonus: 0,
    freezeSessions: 0, at: 0, in: 0, out: 0, czEntries: 0,
    zenchoStarts: 0, chains: 0, chains2plus: 0, chainSteps: 0,
    cz: {}, bonus: {}, rush: {}, stage: {}, czRoute: {},
  };
  const scores = [];
  for (let i = 0; i < RUNS; i++) scores.push(playSession(seed + i * 7919, agg));
  scores.sort((a, b) => a - b);
  const pick = (q) => scores[Math.min(scores.length - 1, Math.floor(scores.length * q))];
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { seed, scores, agg, mean, pick };
}

console.log(`■ バランスプローブ  ${RUNS.toLocaleString()}セッション × シード ${SEEDS.join(', ')}\n`);

const results = SEEDS.map(runSeed);

const line = (label, fn) => {
  console.log(`  ${label.padEnd(30)}${results.map((r) => String(fn(r)).padStart(14)).join('')}`);
};

console.log(`  ${'項目'.padEnd(28)}${results.map((r) => `seed=${r.seed}`.padStart(14)).join('')}`);
line('平均スコア(目標220〜340)', (r) => `${fmt(r.mean)}枚`);
/*
 * 分位点(U63 で追加)。平均と中央値だけだと「どこが厚くなったのか」が分からず、
 * バランスを動かしたときに **中央だけが浮く / 尻尾だけが伸びる** の区別が付かない。
 * 称号(data/titles.js)の閾値もこの並びをそのまま使う。
 */
line('  下位10% / 25%', (r) => `${r.pick(0.10)} / ${r.pick(0.25)}枚`);
line('中央値(目標90〜180)', (r) => `${r.pick(0.5)}枚`);
line('  上位25% / 10%', (r) => `${r.pick(0.75)} / ${r.pick(0.90)}枚`);
line('  上位3% / 0.5%', (r) => `${r.pick(0.97)} / ${r.pick(0.995)}枚`);
line('上位1%(目標1250〜2200)', (r) => `${r.pick(0.99)}枚`);
line('上位0.1%(目標2600以内)', (r) => `${r.pick(0.999)}枚`);
line('機械割(目標150〜190%)', (r) => pct(r.agg.out / r.agg.in));
line('プラス収支率', (r) => pct(r.scores.filter((s) => s > 0).length / r.scores.length));
line('抽選由来の初当り(1/95〜110)', (r) => {
  // 天井の救済ぶんと、引き戻し復帰ぶん(U32)は「通常時の抽選で引いた初当り」ではない
  const drawn = r.agg.bonusEntries - r.agg.ceilingBonus - r.agg.recoveryBonus;
  return `1/${fmt(r.agg.normalSpins / Math.max(1, drawn))}`;
});
line('CZ突入/セッション(U72)', (r) => fmt(r.agg.czEntries / RUNS, 2));
line('  内訳 チャンス目/サメ/ステージ/天井/他', (r) => {
  const q = r.agg.czRoute;
  const total = Math.max(1, r.agg.czEntries);
  return ['chance', 'shark', 'stage', 'ceiling', 'direct']
    .map((k) => fmt(((q[k] ?? 0) / total) * 100, 0)).join('/');
});
line('前兆/セッション(ガセ込み)', (r) => fmt(r.agg.zenchoStarts / RUNS, 2));
line('擬似連/セッション(2step以上)', (r) => `${fmt(r.agg.chains / RUNS, 3)}(${fmt(r.agg.chains2plus / RUNS, 3)})`);
line('  何セッションに1回', (r) => `1/${fmt(RUNS / Math.max(1, r.agg.chains), 1)}`);
line('ボーナス回数/セッション', (r) => fmt(r.agg.bonusEntries / RUNS, 2));
line('  うち引き戻し復帰(U32)', (r) => fmt(r.agg.recoveryBonus / RUNS, 2));
line('RUSH突入/セッション', (r) => fmt(r.agg.at / RUNS, 2));
line('フリーズ遭遇率(8〜12%)', (r) => pct(r.agg.freezeSessions / RUNS));
line('通常時のステージ滞在(通常/高確/激熱)', (r) => {
  const s = r.agg.stage;
  const total = Object.values(s).reduce((a, b) => a + b, 0) || 1;
  return ['COLD_START', 'WARM_POOL', 'PROVISIONED']
    .map((id) => fmt(((s[id] ?? 0) / total) * 100, 0)).join('/');
});

console.log('\n  ── ボーナス→RUSH当選率(目標 12 / 45 / 85%)──');
for (const id of ['LAMBDA_REG', 'S3_BIG', 'DYNAMO_BIG']) {
  line(`  ${id} 完走のみ`, (r) => {
    const b = r.agg.bonus[id] ?? { done: 0, win: 0 };
    return pct(b.win / Math.max(1, b.done));
  });
  /*
   * 100回転で途中打ち切りになったボーナスは「まだ当たっていない状態」で切れているだけで
   * 非当選が確定したわけではない(打ち切りは長いボーナスに偏るので、
   * 完走のみで数えると当選率が下振れする)。打ち切りぶんを分母から外し、
   * **打ち切り時点で既に当選していたぶんだけを分子に足す** 下限側の推定も併記する。
   */
  line('    打ち切り込み(下限)', (r) => {
    const b = r.agg.bonus[id] ?? { done: 0, win: 0, cut: 0, cutWin: 0 };
    return pct((b.win + b.cutWin) / Math.max(1, b.done + b.cut));
  });
}

console.log('\n  ── RUSH 1回の価値(買い取り込み / 目標 平均250〜400枚・4種そろえる)──');
console.log('     ※ 中央値と p99(目標 150〜300 / 800枚以下)は scripts/channel-probe.mjs の [3] を見る');
for (const id of RUSH_IDS) {
  line(`  ${RUSH_SPEC_BY_ID[id].short}`, (r) => {
    const x = r.agg.rush[id] ?? { n: 0, value: 0, games: 0 };
    return `${fmt(x.value / Math.max(1, x.n))}枚/${fmt(x.games / Math.max(1, x.n), 1)}G`;
  });
}

console.log('\n  ── CZ 抽選経由の突破率 ──');
line('  WELL_ARCHITECTED(6本柱)', (r) => {
  const c = r.agg.cz.WELL_ARCHITECTED ?? { drawn: 0, win: 0 };
  return pct(c.win / Math.max(1, c.drawn));
});
line('  CZ全体', (r) => {
  let d = 0; let w = 0;
  for (const c of Object.values(r.agg.cz)) { d += c.drawn; w += c.win; }
  return pct(w / Math.max(1, d));
});

console.log(`\n  ※ 1セッションの投入は ${SESSION.totalGames}回転 × ${BET_PER_GAME}枚 = ${SESSION.totalGames * BET_PER_GAME}枚`);
