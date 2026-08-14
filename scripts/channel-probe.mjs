/**
 * チャネル別 払い出し寄与度プローブ(2026-08-15 / U50 バランス総点検)
 *
 * ── なぜ必要か ────────────────────────────────────
 * これまでのバランス調整(balance-probe.mjs)は **平均・中央値・上位1%** という
 * セッション単位の指標だけを見ていた。この見方だと
 *   ・平均は目標どおりなのに、1ゲームで150枚出る瞬間がある
 *   ・特定のチャネル(Aurora の ACU など)だけが突出している
 * という **体感の暴れ** が数字に出ない(平均は他が痩せれば釣り合ってしまう)。
 *
 * このプローブは払い出しを **発生源(チャネル)ごとに分解** して、
 *   1. セッション平均への寄与度(枚/セッション と 全体比)
 *   2. **1ゲームの純増** の分布(p99 / 最大 / 100枚超の発生率)
 *   3. RUSH 1回(モード滞在1回)あたりの獲得の分布(中央値 / 平均 / p99)
 *   4. セッションスコアの分布(中央値 / 上位1% / 上位0.1%)
 *      ※ 上位1%の目標は U50 で 1,600 → **1,250枚**。RUSH 1回を p99 800枚で頭打ちにすると、
 *        100回転に入る RUSH の回数(連鎖しても4〜5回)から上位1%に算術的な天井ができるため
 *        (詳しい説明は scripts/sim.mjs の TARGET のコメント)。
 * を出す。「1チャネルが突出していないか」「尻尾が長すぎないか」を見る道具。
 *
 * ── チャネルの定義 ──────────────────────────────────
 * 払い出しの経路は実装上ちょうど3つしかない(game/flow.js の _enterPayout):
 *   A. モードハンドラが返す payoutPerGame … AT/ボーナス中の純増(モードIDで分類)
 *   B. 小役の払出(payoutPerGame が null のゲーム)… 通常時・CZ の子役(BET を引いた純増)
 *   C. 残存価値の買い取り(residualValue)   … 100回転切れの精算(モードIDで分類)
 * A は MODE_HANDLERS の onGame を包んで実測する(ゲーム本体には手を入れない)。
 *
 * 使い方:
 *   node scripts/channel-probe.mjs [セッション数] [シード...]
 *   node scripts/channel-probe.mjs 3000 777 555 20260814
 *   node scripts/channel-probe.mjs 3000 777 --ama    # 甘スロ(?ama=1 相当)
 */

import { EventBus } from '../src/engine/eventbus.js';
import { Rng } from '../src/engine/rng.js';
import { Credit } from '../src/game/credit.js';
import { ReelController } from '../src/game/reelctrl.js';
import { ModeMachine, MODE_HANDLERS } from '../src/game/modemachine.js';
import { GameFlow } from '../src/game/flow.js';
import { SESSION } from '../src/data/session.js';
import { RUSH_IDS } from '../src/data/rushes.js';
import { BET_PER_GAME } from '../src/data/payouts.js';

const nums = process.argv.slice(2).map(Number).filter(Number.isFinite);
const RUNS = nums[0] ?? 3000;
const SEEDS = nums.length > 1 ? nums.slice(1) : [777, 555, 20260814];
const DT = 120;

const fmt = (n, d = 1) => Number(n).toFixed(d);
const pct = (n, d = 2) => `${fmt(n * 100, d)}%`;

/**
 * MODE_HANDLERS の onGame を包んで payoutPerGame を実測する。
 * ゲーム側のロジックには一切触らない(戻り値をそのまま通す)。
 * @param {(rec:{mode:string, pay:number, flag:string}) => void} sink
 */
function instrument(sink) {
  const originals = new Map();
  for (const [id, handler] of Object.entries(MODE_HANDLERS)) {
    if (typeof handler.onGame !== 'function') continue;
    originals.set(id, handler.onGame);
    const orig = handler.onGame;
    handler.onGame = function wrapped(state, g) {
      const res = orig.call(this, state, g);
      if (res && res.payoutPerGame != null) {
        sink({ mode: id, pay: res.payoutPerGame, flag: g.flag });
      }
      return res;
    };
  }
  return () => {
    for (const [id, fn] of originals) MODE_HANDLERS[id].onGame = fn;
  };
}

/** 分位点(昇順ソート済み配列から) */
const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

function runSeed(seed) {
  /** チャネルID → { coins, events } */
  const channels = new Map();
  const add = (key, coins) => {
    const c = channels.get(key) ?? { coins: 0, events: 0 };
    c.coins += coins;
    c.events++;
    channels.set(key, c);
  };

  /** 1ゲームの純増(AT/ボーナスの payoutPerGame ぶん) */
  const perGame = [];
  /** 100枚を超えた1ゲームの記録 */
  const bigGames = [];
  /** RUSH種別 → そのモード滞在1回あたりの獲得(買い取り込み) */
  const rushGains = Object.fromEntries(RUSH_IDS.map((id) => [id, []]));
  const scores = [];

  const restore = instrument(({ mode, pay, flag }) => {
    add(`pay:${mode}`, pay);
    perGame.push(pay);
    if (pay > 100) bigGames.push({ mode, pay, flag });
  });

  try {
    for (let i = 0; i < RUNS; i++) {
      const s = seed + i * 7919;
      const bus = new EventBus();
      const rng = new Rng(s);
      const inputRng = new Rng((s ^ 0x5bf03635) >>> 0);
      const credit = new Credit(SESSION.startCredit);
      const reels = new ReelController();
      const modes = new ModeMachine({ rng, bus });
      const flow = new GameFlow({ bus, rng, credit, reels, modeMachine: modes });

      bus.on('modeExit', (p) => {
        if (!RUSH_IDS.includes(p.id)) return;
        const residual = MODE_HANDLERS[p.id]?.residualValue?.(p.state, {}) ?? [];
        const buy = residual.reduce((a, l) => a + (l.coins ?? 0), 0);
        rushGains[p.id].push((p.state?.gained ?? 0) + buy);
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

      // 買い取り(残存価値)は明細にモードIDが入っている
      for (const l of flow.session.breakdown ?? []) add(`buy:${l.mode}`, l.coins ?? 0);
      scores.push(credit.diff);
    }
  } finally {
    restore();
  }

  scores.sort((a, b) => a - b);
  perGame.sort((a, b) => a - b);
  return { seed, channels, perGame, bigGames, rushGains, scores };
}

console.log(`■ チャネル別 寄与度プローブ  ${RUNS.toLocaleString()}セッション × シード ${SEEDS.join(', ')}\n`);

const results = SEEDS.map(runSeed);

// ── 1. チャネル別の寄与度 ────────────────────────────
console.log('[1] チャネル別 セッション平均への寄与(枚/セッション)');
const allKeys = new Set();
for (const r of results) for (const k of r.channels.keys()) allKeys.add(k);
const keys = [...allKeys].sort((a, b) => {
  const sum = (k) => results.reduce((acc, r) => acc + (r.channels.get(k)?.coins ?? 0), 0);
  return sum(b) - sum(a);
});
console.log(`  ${'チャネル'.padEnd(30)}${results.map((r) => `seed=${r.seed}`.padStart(16)).join('')}`);
for (const k of keys) {
  const cells = results.map((r) => {
    const c = r.channels.get(k) ?? { coins: 0 };
    const total = [...r.channels.values()].reduce((a, x) => a + x.coins, 0);
    return `${fmt(c.coins / RUNS)}(${pct(c.coins / Math.max(1, total), 1)})`.padStart(16);
  });
  console.log(`  ${k.padEnd(28)}${cells.join('')}`);
}

// ── 2. 1ゲームの純増 ────────────────────────────────
console.log('\n[2] 1ゲームの純増(AT/ボーナスの payoutPerGame。目標: 100枚超を作らない)');
const line = (label, fn) => {
  console.log(`  ${label.padEnd(30)}${results.map((r) => String(fn(r)).padStart(16)).join('')}`);
};
line('平均', (r) => `${fmt(r.perGame.reduce((a, b) => a + b, 0) / Math.max(1, r.perGame.length))}枚`);
line('中央値', (r) => `${q(r.perGame, 0.5)}枚`);
line('p99', (r) => `${q(r.perGame, 0.99)}枚`);
line('p99.9', (r) => `${q(r.perGame, 0.999)}枚`);
line('最大', (r) => `${r.perGame[r.perGame.length - 1] ?? 0}枚`);
line('100枚超の発生率', (r) => pct(r.bigGames.length / Math.max(1, r.perGame.length), 3));
line('100枚超/セッション', (r) => fmt(r.bigGames.length / RUNS, 3));

console.log('\n  ── 100枚超の内訳(モード:役 → 件数 / 最大枚数)──');
for (const r of results) {
  const by = new Map();
  for (const b of r.bigGames) {
    const k = `${b.mode}:${b.flag}`;
    const e = by.get(k) ?? { n: 0, max: 0 };
    e.n++; e.max = Math.max(e.max, b.pay);
    by.set(k, e);
  }
  const top = [...by.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  console.log(`   seed=${r.seed}: ${top.map(([k, e]) => `${k} ×${e.n}(最大${e.max})`).join(' / ') || 'なし'}`);
}

// ── 3. RUSH 1回あたりの獲得分布 ───────────────────────
console.log('\n[3] RUSH 1回(モード滞在1回)の獲得 中央値/平均/p99(目標 150〜300 / 250〜400 / p99<800)');
for (const id of RUSH_IDS) {
  line(`  ${id}`, (r) => {
    const arr = [...r.rushGains[id]].sort((a, b) => a - b);
    if (arr.length === 0) return '-';
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return `${q(arr, 0.5)}/${fmt(mean, 0)}/${q(arr, 0.99)}`;
  });
}

// ── 4. セッションスコア分布 ──────────────────────────
console.log('\n[4] セッションスコア分布');
line('平均(目標220〜340)', (r) => `${fmt(r.scores.reduce((a, b) => a + b, 0) / r.scores.length)}枚`);
line('中央値(目標90〜180)', (r) => `${q(r.scores, 0.5)}枚`);
line('上位5%', (r) => `${q(r.scores, 0.95)}枚`);
line('上位1%(目標1250〜2200)', (r) => `${q(r.scores, 0.99)}枚`);
line('上位0.1%(目標〜2600)', (r) => `${q(r.scores, 0.999)}枚`);
line('最大', (r) => `${r.scores[r.scores.length - 1]}枚`);

console.log(`\n  ※ 1セッションの投入は ${SESSION.totalGames}回転 × ${BET_PER_GAME}枚 = ${SESSION.totalGames * BET_PER_GAME}枚`);
