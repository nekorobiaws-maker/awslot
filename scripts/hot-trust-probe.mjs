/**
 * hot-trust-probe.mjs — 赤文字(tone:'hot' = 赤帯)の信頼度を実測するプローブ
 * (2026-08-16 / U73「赤文字予兆の信頼度再設計」)
 *
 * ── なぜ要るか ─────────────────────────────────
 * この台の設計目標は **「赤帯が出たら 75〜85% で当たる」**。
 * ところが赤帯は1か所で出しているわけではなく、
 *   1. 前兆の赤(data/scenarios/zencho.js の zn_hot_*)…… 前兆の途中で赤くなる
 *   2. レア役の単発予告の赤(yokoku-heavy.js の yh_hot_*)…… レバーONで赤くなる
 *   3. 裏切り枠の赤(yh_hot_false_alarm / yw_hot_false_evacuation)…… ほぼ空振り
 * と3系統あり、しかもそれぞれが「前兆の本/ガセ比」「レア役のCZ当選率」
 * 「chance の間引き」という **別々のノブ** の上に乗っている。
 * したがって赤の信頼度は机上では出せず、**演出システムごと回して数えるしかない**。
 *
 * ── 何をするか ─────────────────────────────────
 * compare-drivers.mjs の `staged` ドライバと同じ配線(StagingDirector + Timeline +
 * createActions を実物で組み、描画だけしない)でセッションを回し、
 * **液晶テキスト帯に tone:'hot' が出た瞬間**を1回の「赤」として数える。
 * そのうえで、その赤が約束したものが実現したかを下のルールで判定する。
 *
 * ── 的中の判定ルール(赤1回ごとに必ずどれかへ落ちる)──────────────
 *   A. 赤が出たあと **その赤に紐づく前兆が zencho_end を出した**
 *        → ENTRY なら的中 / MISS なら裏切り
 *   B. 赤が出たゲームで **フリーズ当選 / 天井** が発生した → 的中
 *      (この2つは前兆を挟まず即告知なので zencho_end が出ないことがある)
 *   C. 次のゲームが始まった時点で前兆も走っていない(modeState.zenchoActive=false)
 *        → 裏切り(そのゲームは何も保持していなかった)
 *   D. セッション終了で決着がつかなかったぶんは「未決着」として集計から外す
 *
 * 「赤が出た数ゲーム後に別のレア役で当たった」を的中に数えないのがポイント。
 * それを混ぜると裏切り枠の信頼度が 3% → 15% に化けて、赤の設計が測れなくなる。
 *
 * ── 【重要】--human を付けて測ること ────────────────────────────
 * 既定(即押し)だと第3停止がレバーONの数百msあとに来るので、
 * レバーON契機の予告シナリオが液晶の告知枠を握ったまま前兆の赤が来て、
 * **交通整理で赤のテキストが落とされる**(director の DROP_TEXT)。
 * 人が打つ実機は停止まで2〜4秒かかるので、この取りこぼしは起きない。
 * 実測で 前兆の赤 が3倍以上変わるので、**信頼度の判定は --human を正とする**。
 *
 * 使い方:
 *   node scripts/hot-trust-probe.mjs [セッション数] [シード...] --human
 *   node scripts/hot-trust-probe.mjs 1200 777 555 20260814 --human
 *   node scripts/hot-trust-probe.mjs 1200 777 --ama     … 甘スロ(?ama=1 相当)
 */

import { EventBus } from '../src/engine/eventbus.js';
import { Rng } from '../src/engine/rng.js';
import { Credit } from '../src/game/credit.js';
import { ReelController } from '../src/game/reelctrl.js';
import { ModeMachine } from '../src/game/modemachine.js';
import { GameFlow } from '../src/game/flow.js';
import { SESSION } from '../src/data/session.js';
import { Timeline } from '../src/engine/timeline.js';
import { StagingDirector } from '../src/staging/director.js';
import { createActions } from '../src/staging/actions.js';
import { SCENARIOS } from '../src/data/scenarios/index.js';
import { LcdAnims } from '../src/staging/anims/lcdanims.js';
import { Cutins } from '../src/staging/anims/cutins.js';
import { Particles } from '../src/staging/anims/particles.js';
import { CharacterLayer } from '../src/render/chars/index.js';
import { OverlayView } from '../src/render/overlay.js';
// 甘スロ(?ama=1 / --ama)。AMA_MODE は import した時点で process.argv を見て決まる
import { AMA_MODE } from '../src/data/ama.js';

const args = process.argv.slice(2);
const AMA = AMA_MODE;
/** 人が打つ間合い(BET・レバー・停止のあいだに待ちを入れる)。compare-drivers の human と同じ */
const HUMAN = args.includes('--human');
const nums = args.map(Number).filter(Number.isFinite);
const RUNS = nums[0] ?? 1500;
const SEEDS = nums.length > 1 ? nums.slice(1) : [777, 555, 20260814];
const DT = 1000 / 60;

const fmt = (n, d = 2) => Number(n).toFixed(d);
const pct = (n, d = 1) => `${fmt(n * 100, d)}%`;

/* ══ 赤帯を出しうるシナリオの棚卸し ═══════════════════════════════
 * cues の中に tone:'hot' の text キューを持つものが「赤帯」。
 * sub 行はシナリオごとに固有なので、showText の引数から発火元を逆引きできる
 * (text 行は ${step} が入るので鍵に使えない)。 */
const HOT_BY_SUB = new Map();
const HOT_IDS = [];
for (const s of SCENARIOS) {
  const hot = (s.cues ?? []).filter(
    (c) => c.action === 'text' && c.params?.tone === 'hot',
  );
  if (hot.length === 0) continue;
  HOT_IDS.push(s.id);
  for (const c of hot) {
    const key = String(c.params.sub ?? c.params.text ?? '');
    if (HOT_BY_SUB.has(key) && HOT_BY_SUB.get(key) !== s.id) {
      console.warn(`! sub行が重複: "${key}" (${HOT_BY_SUB.get(key)} / ${s.id})`);
    }
    HOT_BY_SUB.set(key, s.id);
  }
}

/** 赤の系統わけ(集計の見出し用) */
function familyOf(id) {
  // zn_* は前兆の中で出る赤(zn_hot_* と、伸びきった前兆の zn_final_push)
  if (id.startsWith('zn_')) return '前兆の赤';
  if (id === 'yh_hot_false_alarm' || id === 'yw_hot_false_evacuation') return '裏切り枠';
  return 'レア役の赤';
}

/**
 * 演出システムをブラウザ(src/main.js)と同じ配線で組む。
 * 描画層(cabinet / reelView / ctx)だけスタブにし、判断するところは全部実物。
 * @param {(sub:string)=>void} onHotText 赤帯が液晶に出た瞬間に呼ばれる
 */
function createStaging({ bus, flow, modes, credit, seed, onHotText }) {
  const lcdAnims = new LcdAnims();
  const cutins = new Cutins();
  const lcdParticles = new Particles();
  const overlayParticles = new Particles();
  const chars = new CharacterLayer();
  const overlay = new OverlayView({
    ctx: null, w: 720, h: 1080, cutins, particles: overlayParticles,
  });

  // 赤帯の検出。showText まで来たものだけを数える
  // (交通整理で text キューが落とされた回は画面に赤が出ないので数えない)
  const showText = lcdAnims.showText.bind(lcdAnims);
  lcdAnims.showText = (params) => {
    if (params?.tone === 'hot') onHotText(String(params.sub ?? params.text ?? ''));
    return showText(params);
  };

  const actions = createActions({
    lcdAnims, cutins, lcdParticles, overlayParticles,
    chars, overlay,
    cabinet: { setLampPattern() {} },
    reelView: { highlight() {} },
    audio: null, voice: null, flow,
  });
  const timeline = new Timeline({ actions });

  bus.on('modeEnter', (p) => {
    lcdAnims.clear();
    lcdParticles.clear();
    chars.applyMode(p.id);
  });

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

/** 集計箱 */
function newTally() {
  return { shown: 0, hit: 0, decided: 0, open: 0 };
}
const total = newTally();
/** シナリオID別 */
const byId = new Map();
/** 系統別 */
const byFamily = new Map();
/** 前兆の赤について、何ステップ目で出たか */
const byStep = new Map();
let sessions = 0;
let totalGames = 0;

const tallyOf = (map, key) => {
  if (!map.has(key)) map.set(key, newTally());
  return map.get(key);
};

for (const seed0 of SEEDS) {
  for (let i = 0; i < RUNS; i++) {
    const seed = seed0 + i * 7919;
    const bus = new EventBus();
    const rng = new Rng(seed);
    const inputRng = new Rng((seed ^ 0x5bf03635) >>> 0);
    const credit = new Credit(SESSION.startCredit);
    const reels = new ReelController();
    const modes = new ModeMachine({ rng, bus });
    const flow = new GameFlow({ bus, rng, credit, reels, modeMachine: modes });

    /** 決着待ちの赤。{ id, game, step } */
    let openReds = [];
    let game = 0;
    /** 直近の前兆ステップ(赤が何G目で出たかを記録するため) */
    let lastStep = 0;

    const record = (red, isHit) => {
      for (const box of [total, tallyOf(byId, red.id), tallyOf(byFamily, familyOf(red.id))]) {
        box.decided++;
        if (isHit) box.hit++;
      }
      if (red.id.startsWith('zn_hot_')) {
        const box = tallyOf(byStep, `${red.step}G目`);
        box.decided++;
        box.shown++;
        if (isHit) box.hit++;
      }
    };
    const resolveAll = (isHit) => {
      for (const red of openReds) record(red, isHit);
      openReds = [];
    };

    const onHotText = (sub) => {
      const id = HOT_BY_SUB.get(sub) ?? `?${sub}`;
      total.shown++;
      tallyOf(byId, id).shown++;
      tallyOf(byFamily, familyOf(id)).shown++;
      openReds.push({ id, game, step: lastStep });
    };

    bus.on('leverOn', () => { game++; });
    bus.on('bet', () => {
      // 前のゲームが完全に終わった時点での掃除。
      // まだ前兆が走っているなら結論は先送り(zencho_end を待つ)。
      if (openReds.length === 0) return;
      if (modes.state?.zenchoActive) return;
      // 前兆が走っていない = そのゲームは何も保持していなかった
      resolveAll(false);
    });
    bus.on('paramChange', (p) => {
      if (p.param === 'zencho') lastStep = Number(p.step ?? 0);
      if (p.param === 'zencho_end') resolveAll(p.value !== 'MISS');
      // 前兆を挟まない即告知の2経路(赤と同じゲームで起きたぶんだけ的中に数える)
      if (p.param === 'freeze_win' || p.param === 'ceiling') {
        const same = openReds.filter((r) => r.game === game);
        for (const red of same) record(red, true);
        openReds = openReds.filter((r) => r.game !== game);
      }
    });

    const fx = createStaging({ bus, flow, modes, credit, seed, onHotText });
    modes.start('FREE_TIER');

    /** 人の手を模した「押すまでの待ち」(ms)。押す瞬間はリール位置を変えるだけで抽選は動かない */
    let wait = 0;
    const humanWait = () => 240 + inputRng.int(420);

    let guard = 0;
    while (!flow.session.ended && guard++ < 4000000) {
      if (HUMAN && wait > 0) {
        wait -= DT;
      } else if (modes.awaitingChoice && flow.state === 'IDLE') {
        flow.stopReel(inputRng.chance(0.5) ? 0 : 2);
      } else if (flow.canBet) {
        flow.insertBet();
        if (HUMAN) wait = humanWait();
      } else if (flow.canLever) {
        flow.leverOn();
        if (HUMAN) wait = humanWait();
      } else if (flow.canStop) {
        const next = reels.reels.find((r) => r.canStop);
        if (next) flow.stopReel(next.index);
        if (HUMAN) wait = humanWait();
      }
      flow.update(DT);
      fx.update(DT);
    }
    if (guard >= 4000000) throw new Error(`セッションが終わりません: mode=${modes.currentId}`);

    // 決着がつかなかったぶん(セッション切れ)は分母から外す
    for (const red of openReds) {
      total.open++;
      tallyOf(byId, red.id).open++;
      tallyOf(byFamily, familyOf(red.id)).open++;
    }
    sessions++;
    totalGames += flow.session.played;
  }
}

const trust = (b) => (b.decided > 0 ? b.hit / b.decided : 0);
const line = (label, b, width = 26) => {
  const share = total.shown > 0 ? b.shown / total.shown : 0;
  return `  ${label.padEnd(width)}${String(b.shown).padStart(7)}回`
    + `${pct(share).padStart(8)}   ${pct(trust(b)).padStart(7)}`
    + `  (的中 ${b.hit}/${b.decided}${b.open > 0 ? ` 未決着${b.open}` : ''})`;
};

console.log(`■ 赤文字(tone:'hot')信頼度プローブ${AMA ? ' [甘スロ]' : ''}`
  + `  打ち方=${HUMAN ? '人の間合い(--human / 実機相当)' : '即押し ※赤の取りこぼしあり。--human 推奨'}`);
console.log(`  ${sessions.toLocaleString()}セッション / ${totalGames.toLocaleString()}G`
  + `  seeds=${SEEDS.join(',')} × ${RUNS}`);
console.log(`  赤帯を持つシナリオ: ${HOT_IDS.length}本`);

console.log('\n[1] 赤の総量');
console.log(`  表示回数        : ${(total.shown / sessions).toFixed(3)} 回/セッション  (合計 ${total.shown.toLocaleString()}回)`);
console.log(`  出現間隔        : 1/${fmt(totalGames / Math.max(1, total.shown), 1)}G`);

console.log('\n[2] 総合信頼度  ── 目標 75〜85%(標準設定)');
const t = trust(total);
console.log(`  ${pct(t, 2)}  (的中 ${total.hit.toLocaleString()} / 決着 ${total.decided.toLocaleString()} / 未決着 ${total.open.toLocaleString()})`);
if (AMA) {
  /*
   * 甘スロはレア役が2倍なので、CZ確定役(チャンス目・サメ揃い)の遭遇も2倍になり、
   * **前兆そのものに占める本前兆の割合**が上がる。赤の信頼度は前兆の本/ガセ比に
   * 引きずられるので、標準設定を 75〜85% に置く限り甘スロは構造的に高く出る
   * (実測 88% 前後)。救済モードなので「甘スロは赤がほぼ当たる」で問題ない。
   */
  console.log(`  判定: 参考値(甘スロはレア役2倍で本前兆の比率が上がるため、標準設定より高く出るのが正常)`);
} else {
  console.log(`  判定: ${t >= 0.75 && t <= 0.85 ? 'PASS(目標帯の内側)' : `FAIL(${t < 0.75 ? '低すぎ' : '高すぎ'})`}`);
}

console.log('\n[3] 系統別                     表示    占有率   信頼度');
for (const [k, b] of [...byFamily.entries()].sort((a, b2) => b2[1].shown - a[1].shown)) {
  console.log(line(k, b));
}

console.log('\n[4] シナリオ別                 表示    占有率   信頼度');
for (const [k, b] of [...byId.entries()].sort((a, b2) => b2[1].shown - a[1].shown)) {
  console.log(line(k, b));
}

console.log('\n[5] 前兆の赤が出たステップ     表示    占有率   信頼度');
for (const [k, b] of [...byStep.entries()].sort((a, b2) => String(a[0]).localeCompare(String(b2[0])))) {
  console.log(line(k, b));
}
