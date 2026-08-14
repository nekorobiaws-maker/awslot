/**
 * zencho-freeze-probe.mjs — 予兆の総量とレバオンフリーズの実測プローブ
 *
 * 既存の sim.mjs / sim-probe.mjs は変更せず、こちらで追加指標だけを測る。
 *
 * 測るもの:
 *   1. 予兆(前兆)の発生回数 / セッション …… ユーザー指摘 U5 の before-after を数字で示すため
 *      - 「本前兆」「ガセ前兆」の内訳
 *      - 前兆の演出イベントが飛んだゲーム数 / セッション(体感の "毎ゲーム出てる" に一番近い指標)
 *   2. レバオンフリーズの遭遇率
 *      - セッション遭遇率(目標 8〜12%)と、通算の 1/N G
 *
 * 使い方: node scripts/zencho-freeze-probe.mjs [セッション数] [シード]
 */

import { EventBus } from '../src/engine/eventbus.js';
import { Rng } from '../src/engine/rng.js';
import { Credit } from '../src/game/credit.js';
import { ReelController } from '../src/game/reelctrl.js';
import { ModeMachine } from '../src/game/modemachine.js';
import { GameFlow } from '../src/game/flow.js';
import { SESSION } from '../src/data/session.js';

const RUNS = Number(process.argv[2] ?? 20000);
const SEED = Number(process.argv[3] ?? 20260814);
const DT = 120;

const fmt = (n, d = 2) => Number(n).toFixed(d);
const pct = (n) => `${fmt(n * 100, 2)}%`;

/** 前兆の1ゲームぶんの演出が飛んだことを示す paramChange の param 名 */
const ZENCHO_STEP_PARAMS = new Set(['zencho', 'zencho_upgrade', 'deepracer', 'codepipeline']);

let sessions = 0;
let totalGames = 0;
let zenchoEnd = 0;
let zenchoMiss = 0;
let zenchoEntry = 0;
let zenchoStepGames = 0;
let freezeCount = 0;
let sessionsWithFreeze = 0;
/** パターン別の出現回数(どの予兆がどれだけ出たか) */
const byPattern = {};

for (let i = 0; i < RUNS; i++) {
  const seed = SEED + i * 7919;
  const bus = new EventBus();
  const rng = new Rng(seed);
  const inputRng = new Rng((seed ^ 0x5bf03635) >>> 0);
  const credit = new Credit(SESSION.startCredit);
  const reels = new ReelController();
  const modes = new ModeMachine({ rng, bus });
  const flow = new GameFlow({ bus, rng, credit, reels, modeMachine: modes });

  let freezeHere = 0;

  bus.on('paramChange', (p) => {
    if (ZENCHO_STEP_PARAMS.has(p.param)) zenchoStepGames++;
    if (p.param === 'zencho_end') {
      zenchoEnd++;
      if (p.value === 'MISS') zenchoMiss++;
      else zenchoEntry++;
      if (p.pattern) byPattern[p.pattern] = (byPattern[p.pattern] ?? 0) + 1;
    }
  });
  bus.on('freeze', () => { freezeHere++; });

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
  if (guard >= 200000) throw new Error(`セッションが終了しません: mode=${modes.currentId}`);

  sessions++;
  totalGames += flow.session.played;
  freezeCount += freezeHere;
  if (freezeHere > 0) sessionsWithFreeze++;
}

console.log(`■ zencho-freeze-probe: ${sessions.toLocaleString()}セッション (seed=${SEED} / ${SESSION.totalGames}回転)`);
console.log(`  総ゲーム数: ${totalGames.toLocaleString()}G`);

console.log('\n[1] 予兆(前兆)の総量');
console.log(`  発生回数        : ${(zenchoEnd / sessions).toFixed(3)} 回/セッション  (合計 ${zenchoEnd.toLocaleString()}回)`);
console.log(`   └ ガセ(MISS)  : ${(zenchoMiss / sessions).toFixed(3)} 回/セッション  (${pct(zenchoMiss / Math.max(1, zenchoEnd))})`);
console.log(`   └ 本前兆(ENTRY): ${(zenchoEntry / sessions).toFixed(3)} 回/セッション  (${pct(zenchoEntry / Math.max(1, zenchoEnd))})`);
console.log(
  `  予兆演出が出たG : ${(zenchoStepGames / sessions).toFixed(2)} G/セッション` +
  `  (通常時Gに対して ${pct(zenchoStepGames / Math.max(1, totalGames))} ※全モード込みの分母)`,
);

const patterns = Object.entries(byPattern).sort((a, b) => b[1] - a[1]);
if (patterns.length > 0) {
  console.log('\n[2] 予兆パターンの内訳(終了時点のパターン)');
  for (const [id, n] of patterns) {
    console.log(`  ${String(id).padEnd(18)} ${String(n).padStart(8)}回  ${pct(n / zenchoEnd)}`);
  }
}

console.log('\n[3] レバオンフリーズ');
console.log(`  セッション遭遇率: ${pct(sessionsWithFreeze / sessions)}  (目標 8〜12%)`);
console.log(`  発生回数        : ${freezeCount.toLocaleString()}回  = 1/${fmt(totalGames / Math.max(1, freezeCount), 1)}G`);
