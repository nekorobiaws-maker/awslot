/**
 * sim-probe.mjs — バランス実測プローブ(読み取り専用の追加計測)
 *
 * sim.mjs が出さない指標を測る:
 *   1. ボーナス→RUSH突入率(種別ごとの実測)
 *   2. RUSH 1回(AT滞在エピソード)あたりの継続G数・獲得枚数の分布
 *      - エピソード = RUSH 4種のいずれかへ新規突入 〜 通常時(FREE_TIER)転落 or セッション終了
 *      - 引き戻し(HOT_STANDBY)成功による復帰は同一エピソードとして継続扱い
 *      - 「終わらないRUSH」が無いか = 最大継続G / セッション打ち切り率で確認
 *
 * ── 2026-08-14 しおん指摘 minor-d / 新セマンティクスへ追従 ─────────────
 * U11 で RUSH が4種になり、ボーナス側の当選フラグは
 *   旧: state.atWin(ボーナス突入時に1回引く方式の名残)
 *   新: **state.rushWin**(ボーナス中のレア役契機で当選したか)
 * になっていたのに、このプローブは古い p.state.atWin を見ていたため
 * 「ボーナス→RUSH突入率が全種 0%」という嘘の数字を出していた。
 * AT層の定義も AS_RUSH しか知らない旧構成だったので RUSH 4種へ更新している。
 *
 * 使い方: node scripts/sim-probe.mjs [セッション数] [シード]
 */

import { EventBus } from '../src/engine/eventbus.js';
import { Rng } from '../src/engine/rng.js';
import { Credit } from '../src/game/credit.js';
import { ReelController } from '../src/game/reelctrl.js';
import { ModeMachine } from '../src/game/modemachine.js';
import { GameFlow } from '../src/game/flow.js';
import { SESSION } from '../src/data/session.js';
import { BONUS_SPEC_BY_ID } from '../src/data/modes.js';
import { RUSH_IDS, RUSH_ENTRY } from '../src/data/rushes.js';

const RUNS = Number(process.argv[2] ?? 50000);
const SEED = Number(process.argv[3] ?? 20260814);
const DT = 120;

const fmt = (n, d = 2) => Number(n).toFixed(d);
const pct = (n) => `${fmt(n * 100, 2)}%`;

/** AT層とみなすモード(この間はエピソード継続)。U11 の RUSH 4種を含む */
const AT_LAYER = new Set([
  ...RUSH_IDS, 'SERVERLESS_RUSH', 'MULTI_REGION',
  'SPOT_ZONE', 'EC2_BURST', 'GRAVITON', 'RESERVED',
  'CLOUDFRONT', 'KINESIS', 'STEP_FUNCTIONS',
]);
/** エピソードを終わらせないが AT消化Gには数えないモード(引き戻し・AT中ボーナス等) */
const EPISODE_ALIVE = new Set(['HOT_STANDBY', 'BONUS', 'BONUS_READY', 'REINVENT_ED']);

// ── 集計 ──────────────────────────────────────
const bonus = {};        // bonusId → { done, atWin }
const episodes = [];     // { games, totalGames, gained, truncated }
let sessionsWithRush = 0;

for (let i = 0; i < RUNS; i++) {
  const seed = SEED + i * 7919;
  const bus = new EventBus();
  const rng = new Rng(seed);
  const inputRng = new Rng((seed ^ 0x5bf03635) >>> 0);
  const credit = new Credit(SESSION.startCredit);
  const reels = new ReelController();
  const modes = new ModeMachine({ rng, bus });
  const flow = new GameFlow({ bus, rng, credit, reels, modeMachine: modes });

  let ep = null;          // 進行中のエピソード
  let hadRush = false;

  const closeEp = (truncated) => {
    if (!ep) return;
    ep.gained = credit.diff - ep.startDiff;
    ep.truncated = truncated;
    episodes.push(ep);
    ep = null;
  };

  // ボーナス完走時に rushWin(→RUSH)を数える。セッション切れの中断は分母から外す
  bus.on('modeExit', (p) => {
    if (p.id === 'BONUS' && p.state && p.state.remaining === 0) {
      const b = (bonus[p.state.bonusId] ??= { done: 0, rushWin: 0, byFlag: {} });
      b.done++;
      if (p.state.rushWin) {
        b.rushWin++;
        // どのレア役で当てたか(U22 の契機の効き方)
        const f = p.state.rushWinFlag ?? '(不明)';
        b.byFlag[f] = (b.byFlag[f] ?? 0) + 1;
      }
    }
  });

  bus.on('leverOn', (p) => {
    const m = p.mode;
    if (ep) {
      if (AT_LAYER.has(m)) { ep.games++; ep.totalGames++; }
      else if (EPISODE_ALIVE.has(m)) ep.totalGames++;
      else closeEp(false);                       // FREE_TIER / CZ へ転落 = 終了
    } else if (RUSH_IDS.includes(m)) {
      // U11: RUSH 4種のどれから始まってもエピソード開始(旧実装は AS_RUSH のみ)
      hadRush = true;
      ep = {
        games: 1, totalGames: 1, gained: 0, startDiff: credit.diff, truncated: false, rushId: m,
      };
    }
  });

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
  closeEp(true);                                 // 100回転切れによる打ち切り(買い取り込み)
  if (hadRush) sessionsWithRush++;
}

// ── 出力 ──────────────────────────────────────
console.log(`■ sim-probe: ${RUNS.toLocaleString()}セッション (seed=${SEED} / ${SESSION.totalGames}回転)`);

console.log('\n[1] ボーナス→RUSH突入率(完走ボーナスの rushWin 実測 / レア役契機)');
let doneAll = 0; let winAll = 0;
for (const id of ['LAMBDA_REG', 'S3_BIG', 'DYNAMO_BIG']) {
  const b = bonus[id] ?? { done: 0, rushWin: 0, byFlag: {} };
  doneAll += b.done; winAll += b.rushWin;
  const target = RUSH_ENTRY.targetByBonus[id];
  console.log(
    `  ${(BONUS_SPEC_BY_ID[id]?.name ?? id).padEnd(14)} 完走 ${String(b.done).padStart(6)}回` +
    ` → RUSH ${pct(b.rushWin / Math.max(1, b.done))}` +
    (target != null ? `(目標 ${pct(target)})` : ''),
  );
  const flags = Object.entries(b.byFlag).sort((a, c) => c[1] - a[1]);
  if (flags.length > 0) {
    console.log(
      `    当選契機: ${flags.map(([f, n]) => `${f} ${pct(n / Math.max(1, b.rushWin))}`).join(' / ')}`,
    );
  }
}
console.log(`  合成             完走 ${doneAll}回 → RUSH ${pct(winAll / Math.max(1, doneAll))}`);

const done = episodes.filter((e) => !e.truncated);
const cut = episodes.filter((e) => e.truncated);
const sorted = (arr, key) => [...arr].sort((a, b) => a[key] - b[key]);
const q = (arr, key, p) => sorted(arr, key)[Math.min(arr.length - 1, Math.floor(arr.length * p))]?.[key];
const mean = (arr, key) => arr.reduce((a, b) => a + b[key], 0) / Math.max(1, arr.length);
const max = (arr, key) => arr.reduce((a, b) => Math.max(a, b[key]), 0);

console.log('\n[2] RUSHエピソード(RUSH 4種の新規突入→通常転落/セッション終了)');
console.log(`  エピソード総数    : ${episodes.length}  (RUSH経験セッション ${pct(sessionsWithRush / RUNS)})`);
console.log(`  うち完走(転落まで): ${done.length}  / 100回転切れで打ち切り: ${cut.length} (${pct(cut.length / Math.max(1, episodes.length))})`);

const dist = (arr, label) => {
  console.log(`  ── ${label}(n=${arr.length}) ──`);
  console.log(
    `  AT消化G   平均 ${fmt(mean(arr, 'games'), 1)} / 中央値 ${q(arr, 'games', 0.5)}` +
    ` / p90 ${q(arr, 'games', 0.9)} / p99 ${q(arr, 'games', 0.99)} / 最大 ${max(arr, 'games')}`,
  );
  console.log(
    `  滞在G(引き戻し等込) 平均 ${fmt(mean(arr, 'totalGames'), 1)} / 最大 ${max(arr, 'totalGames')}`,
  );
  console.log(
    `  獲得枚数  平均 ${fmt(mean(arr, 'gained'), 1)} / 中央値 ${q(arr, 'gained', 0.5)}` +
    ` / p90 ${q(arr, 'gained', 0.9)} / p99 ${q(arr, 'gained', 0.99)} / 最大 ${max(arr, 'gained')}`,
  );
  const buckets = [[0, '〜0枚'], [100, '1〜100'], [200, '101〜200'], [400, '201〜400'], [800, '401〜800'], [1600, '801〜1600'], [Infinity, '1601〜']];
  let prev = -Infinity;
  const rows = buckets.map(([hi, label2]) => {
    const n = arr.filter((e) => e.gained > prev && e.gained <= hi).length;
    prev = hi;
    return `${label2} ${pct(n / Math.max(1, arr.length))}`;
  });
  console.log(`  獲得分布  ${rows.join(' / ')}`);
};
dist(done, '完走エピソードのみ');
dist(episodes, '打ち切り込み全体');
