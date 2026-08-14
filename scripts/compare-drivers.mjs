/**
 * sim.mjs とブラウザ実プレイの「乖離」を突き止めるための突き合わせスクリプト。
 * (2026-08-14 V1: 「sim は平均+253枚なのにブラウザ実プレイは+1,900枚」の真因調査)
 *
 * ── 何をするか ─────────────────────────────────
 * 同じ seed で GameFlow を **4通りの回し方** で回し、最終スコア(credit.diff)を並べる。
 *
 *   sim      … scripts/sim.mjs と同じ回し方(dt=120ms 固定 / 入力は即時 / 分岐は50%)
 *   browser  … src/main.js と同じ回し方(dt=1000/60ms 固定 / 入力は即時 / 分岐は50%)
 *   human    … ブラウザで人が打つ回し方(dt=1000/60ms / BET・レバー・停止に待ち時間 /
 *               分岐は放置してタイムアウト = 常に左)
 *   staged   … **演出システムを丸ごと載せた** ブラウザ相当(2026-08-14 検証指摘で追加)
 *
 * ゲーム抽選RNG(engine/rng.js)の消費順が同じなら、この4つは **必ず同じスコア** になる。
 * 違いが出たら、それが「実プレイと sim がズレる」経路そのもの。
 *
 * ── 【重要】上3本だけでは何も否定できない(2026-08-14 検証指摘)────────
 *
 * sim / browser / human の3本は **dt の粒度・入力待ち・分岐選択しか違わない**。
 * StagingDirector も Timeline も createActions も生成していないので、
 * **演出システムがゲーム抽選RNGへ漏れていても3本とも同じ値になる**。
 * 一致しても「入力の打ち方では出目が動かない」と言えるだけで、
 * 「演出込みでも動かない」の証明にはならなかった。
 *
 * そこで4本目 `staged` を足した。ブラウザ(src/main.js)と同じ配線で
 *   stagingRng = new Rng((seed ^ 0x9e3779b9) >>> 0)
 *   StagingDirector(SCENARIOS 全部)+ Timeline + createActions(flow 込み)
 * を組み、描画だけを行わない。ここが素の browser と一致して初めて
 * **「演出を挟んでも出目は1枚も動かない」** が機械的に示せる。
 * 特に演出→ゲームの唯一の口である `reelfx.lock`(flow.lockReels)は
 * この4本目でだけ実際に呼ばれる。
 *
 * 使い方:
 *   node scripts/compare-drivers.mjs                 … 既定シード群で比較
 *   node scripts/compare-drivers.mjs 1234 7 20260813 … シードを指定
 */

import { EventBus } from '../src/engine/eventbus.js';
import { Rng } from '../src/engine/rng.js';
import { Credit } from '../src/game/credit.js';
import { ReelController } from '../src/game/reelctrl.js';
import { ModeMachine } from '../src/game/modemachine.js';
import { GameFlow } from '../src/game/flow.js';
import { SESSION } from '../src/data/session.js';
// ── 演出システム(4本目のドライバ用。描画はしないが実物を動かす)──
import { Timeline } from '../src/engine/timeline.js';
import { StagingDirector, classifyScenario, cutinKeysOf } from '../src/staging/director.js';
import { createActions } from '../src/staging/actions.js';
import { SCENARIOS, validateScenarios } from '../src/data/scenarios/index.js';
import { LcdAnims } from '../src/staging/anims/lcdanims.js';
import { Cutins } from '../src/staging/anims/cutins.js';
import { Particles } from '../src/staging/anims/particles.js';
import { CharacterLayer } from '../src/render/chars/index.js';
import { OverlayView } from '../src/render/overlay.js';

const SEEDS = process.argv.slice(2).map(Number).filter(Number.isFinite);
const DEFAULT_SEEDS = [1234, 7, 20260813, 777, 555];

/**
 * 演出システムをブラウザ(src/main.js)と同じ配線で組み立てる。
 *
 * 描画(Canvas)だけは行わないが、**判断をするところは全部実物**にしてある:
 *   StagingDirector … シナリオの when 判定・weight 抽選・chance 間引き・交通整理
 *   Timeline        … キューの時間進行と waitFor
 *   createActions   … 実アクション(reelfx.lock は本物の flow.lockReels を叩く)
 *   LcdAnims 等     … テキスト帯の重複判定・アニメの寿命管理
 * 描画専用の口(cabinet / reelView)だけスタブにする。
 *
 * @param {object} deps
 * @returns {{update:(dt:number)=>void, director:StagingDirector}}
 */
function createStaging({ bus, flow, modes, credit, seed }) {
  const lcdAnims = new LcdAnims();
  const cutins = new Cutins();
  const lcdParticles = new Particles();
  const overlayParticles = new Particles();
  const chars = new CharacterLayer();
  const overlay = new OverlayView({
    ctx: null, w: 720, h: 1080, cutins, particles: overlayParticles,
  });
  // 描画しかしない層はスタブでよい(呼ばれても何も判断しない)
  const cabinet = { setLampPattern() {} };
  const reelView = { highlight() {} };

  const actions = createActions({
    lcdAnims, cutins, lcdParticles, overlayParticles,
    chars, overlay, cabinet, reelView,
    audio: null, voice: null,
    // 演出 → ゲームの唯一の口。ここを繋がないと肝心の経路を検証できない
    flow,
  });
  const timeline = new Timeline({ actions });

  // main.js と同じ順序: modeEnter の後片付けを director.attach より先に登録する
  bus.on('modeEnter', (p) => {
    lcdAnims.clear();
    lcdParticles.clear();
    chars.applyMode(p.id);
  });

  // 演出用RNG。main.js と同じ導出式(ゲーム用と混ぜない)
  const stagingRng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const director = new StagingDirector({
    bus,
    timeline,
    scenarios: SCENARIOS,
    rng: stagingRng,
    getContext: () => ({
      mode: modes.currentId,
      modeState: modes.state,
      modeStack: modes.stackIds,
      flowState: flow.state,
      flag: flow.flag,
      credit: credit.credit,
      diff: credit.diff,
      spinsLeft: flow.spinsLeft,
      sessionEnded: flow.session.ended,
    }),
  }).attach();

  return {
    director,
    update(dt) {
      timeline.update(dt);
      lcdAnims.update(dt);
      cutins.update(dt);
      lcdParticles.update(dt);
      overlayParticles.update(dt);
      chars.update(dt);
      overlay.update(dt);
    },
  };
}

/**
 * 1セッションを指定の回し方で最後まで回す。
 * @param {number} seed
 * @param {object} opt
 * @param {number} opt.dt              1ステップの ms
 * @param {'instant'|'human'} opt.press 入力の打ち方
 * @param {'random'|'timeout'} opt.choice 分岐選択の決め方
 * @param {boolean} [opt.staging]      true で演出システムを丸ごと載せる
 */
function play(seed, { dt, press, choice, staging = false }) {
  const bus = new EventBus();
  const rng = new Rng(seed);
  const inputRng = new Rng((seed ^ 0x5bf03635) >>> 0);
  const credit = new Credit(SESSION.startCredit);
  const reels = new ReelController();
  const modes = new ModeMachine({ rng, bus });
  const flow = new GameFlow({ bus, rng, credit, reels, modeMachine: modes });

  const log = [];
  bus.on('leverOn', (p) => log.push(`${log.length + 1}:${p.mode}:${p.flag}${p.freeze ? ':FREEZE' : ''}`));

  // 演出は modes.start() より前に配線する(main.js と同じ。起動モードの入場演出のため)
  const fx = staging ? createStaging({ bus, flow, modes, credit, seed }) : null;

  modes.start('FREE_TIER');

  /** 人の手を模した「押すまでの待ち」(ms)。押す瞬間はリール位置を変えるだけで抽選は動かない */
  let wait = 0;
  const humanWait = () => 90 + inputRng.int(260);

  let guard = 0;
  while (!flow.session.ended && guard++ < 4000000) {
    if (press === 'human' && wait > 0) {
      wait -= dt;
    } else if (modes.awaitingChoice && flow.state === 'IDLE') {
      // timeout: 何も押さない(flow 側が 8秒で choose(0) する)
      if (choice === 'random') flow.stopReel(inputRng.chance(0.5) ? 0 : 2);
    } else if (flow.canBet) {
      flow.insertBet();
      if (press === 'human') wait = humanWait();
    } else if (flow.canLever) {
      flow.leverOn();
      if (press === 'human') wait = humanWait();
    } else if (flow.canStop) {
      const next = reels.reels.find((r) => r.canStop);
      if (next) flow.stopReel(next.index);
      if (press === 'human') wait = humanWait();
    }
    flow.update(dt);
    // 演出の時間進行(main.js のループと同じ順序: ゲーム → 演出)
    fx?.update(dt);
  }
  if (guard >= 4000000) throw new Error(`セッションが終わりません: mode=${modes.currentId}`);

  return {
    score: credit.diff,
    buyout: flow.session.buyout,
    games: flow.session.played,
    at: flow.stats.at,
    bonus: flow.stats.bonus,
    cz: flow.stats.cz,
    endedIn: modes.stackIds.join('>'),
    log,
    fxStats: fx ? { ...fx.director.stats } : null,
  };
}

const DRIVERS = {
  sim: { dt: 120, press: 'instant', choice: 'random' },
  browser: { dt: 1000 / 60, press: 'instant', choice: 'random' },
  human: { dt: 1000 / 60, press: 'human', choice: 'timeout' },
  // 演出込み。browser と1枚でも違えば「演出がゲームへ漏れている」
  staged: { dt: 1000 / 60, press: 'instant', choice: 'random', staging: true },
};

const DRIVER_NAMES = Object.keys(DRIVERS);
const seeds = SEEDS.length > 0 ? SEEDS : DEFAULT_SEEDS;
console.log('■ 同一シードでの回し方の比較');
console.log('  sim/browser/human = 入力の打ち方だけの違い(演出は載っていない)');
console.log('  staged            = 演出システム込み。ここが一致して初めて「演出は出目に効かない」と言える\n');
console.log('  seed        sim      browser   human    staged   一致');

let allMatch = true;
const detail = [];
for (const seed of seeds) {
  const r = {};
  for (const [name, opt] of Object.entries(DRIVERS)) r[name] = play(seed, opt);
  const base = r.sim.score;
  const same = DRIVER_NAMES.every((n) => r[n].score === base);
  if (!same) allMatch = false;
  console.log(
    `  ${String(seed).padEnd(10)}` +
    `${String(r.sim.score).padStart(8)}${String(r.browser.score).padStart(10)}` +
    `${String(r.human.score).padStart(9)}${String(r.staged.score).padStart(9)}    ${same ? 'OK' : 'NG'}`,
  );
  detail.push([seed, r]);
}

console.log(`\n  判定: ${allMatch ? 'すべて一致(演出を挟んでも出目は1枚も動かない)' : '不一致あり(下に差分)'}`);

if (!allMatch) {
  for (const [seed, r] of detail) {
    const base = r.sim.score;
    if (DRIVER_NAMES.every((n) => r[n].score === base)) continue;
    console.log(`\n── seed=${seed} の差分 ─────────────`);
    for (const name of DRIVER_NAMES) {
      const x = r[name];
      console.log(`  ${name.padEnd(8)} score=${x.score} buyout=${x.buyout} G=${x.games} AT=${x.at} BONUS=${x.bonus} CZ=${x.cz} 終了時=${x.endedIn}`);
    }
    // レバーONのログを突き合わせて、最初に食い違ったゲームを出す
    const logs = DRIVER_NAMES.map((n) => r[n].log);
    const len = Math.max(...logs.map((l) => l.length));
    for (let i = 0; i < len; i++) {
      if (logs.every((l) => l[i] === logs[0][i])) continue;
      console.log(`  最初の食い違い: ${i + 1}ゲーム目`);
      for (let d = 0; d < DRIVER_NAMES.length; d++) {
        console.log(`    ${DRIVER_NAMES[d].padEnd(8)}: ${logs[d].slice(Math.max(0, i - 2), i + 3).join(' | ')}`);
      }
      break;
    }
  }
}

/* ══ 演出調停の不変条件 ══════════════════════════════════════════
 *
 * 4本目のドライバは「演出を載せても出目が動かない」ことしか見ない。
 * 演出側の事故(演出が出ないまま8秒リールが止まる、等)は出目に出ないので、
 * シナリオ定義そのものを静的に検査する。
 */
console.log('\n■ 演出定義の静的検査');
{
  const v = validateScenarios();
  console.log(`  ${v.ok ? 'OK ' : 'NG '} シナリオ定義(${SCENARIOS.length}本) ${v.ok ? '重複ID・欠落なし' : v.errors.join(' / ')}`);
}
{
  /*
   * 全面占有(exclusive)シナリオのカットインが他のシナリオと衝突していないか。
   *
   * director の「同カテゴリのカットインは1ゲームに1回まで」は
   * exclusive を免除するよう直したので **いまは落ちない** が、
   * 衝突していること自体は「同じ画が同じゲームで2回出る」設計の匂いなので報告する。
   * とくにレバーONフリーズ(fz_lever_freeze)は leverOn 予告と同じゲームに走るため、
   * ここが被ると調停の実装ミス1つで丸ごと消える位置にいる。
   */
  const exclusives = SCENARIOS.filter((s) => classifyScenario(s) === 'exclusive');
  const rows = [];
  for (const s of exclusives) {
    const keys = cutinKeysOf(s);
    for (const k of keys) {
      const others = SCENARIOS.filter((o) => o !== s && cutinKeysOf(o).includes(k));
      if (others.length > 0) rows.push(`${s.id} の ${k} が ${others.map((o) => o.id).join(',')} と重複`);
    }
  }
  console.log(
    `  ${rows.length === 0 ? 'OK ' : '警告'} 全面占有シナリオ ${exclusives.length}本のカットイン重複 ` +
    `${rows.length === 0 ? 'なし' : rows.join(' / ')}`,
  );
  console.log('       ※重複していても exclusive は cutin-dup で落とさない(director._admit)');
}
{
  // 演出込みドライバで実際に何本のシナリオが通り、何本落ちたか(調停の効き具合)
  const s = detail[0]?.[1]?.staged?.fxStats;
  if (s) {
    console.log(
      `  --  演出調停の統計(seed=${detail[0][0]}): 再生 ${s.played} / 見送り ${s.skipped}` +
      ` / 文字だけ抑制 ${s.textSuppressed} / 視覚だけ抑制 ${s.visualSuppressed}` +
      ` / 割り込み ${s.preempted} / 全面占有 ${s.exclusiveTaken}`,
    );
  }
}

// 個別セッションのスコアは分散が非常に大きい。乖離の議論に使う前に必ず分布を見る
console.log('\n■ 参考: 上の seed 群の内訳(1セッションは分散が大きいので単発比較は危険)');
for (const [seed, r] of detail) {
  const x = r.browser;
  console.log(`  seed=${String(seed).padEnd(10)} score=${String(x.score).padStart(6)}枚  買取=${String(x.buyout).padStart(5)}枚  AT=${x.at} BONUS=${x.bonus} CZ=${x.cz}`);
}
