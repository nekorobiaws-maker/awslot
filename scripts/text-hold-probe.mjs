/**
 * 「その文字は何秒読めるのか」を実測するプローブ(2026-08-15 U74)。
 *
 * ── なぜ要るか ─────────────────────────────────
 * 表示時間はシナリオの `ms` を読むだけでは分からない。実際に画面へ出ている時間は
 *   ・overlay.text(render/overlay.js の lineEntry)… **1行しか持てない**ので、
 *     次の showLine が来た瞬間に前の行が消える(= ms より短くなることがある)
 *   ・lcd.text(staging/anims/lcdanims.js)… 最低表示時間・順番待ち・sticky があり、
 *     指定した ms より長くなることも短くなることもある
 * という理由で、キューの値と一致しない。U74 の「問答がすぐ消えて読めない」も
 * まさに前者(否定の行が次の問いを食っていた)だった。
 *
 * そこで **本物の Timeline / OverlayView / LcdAnims を描画なしで動かし**、
 * 1フレーム(1/60秒)ずつ「いま何の文字が出ているか」を記録して、
 * 文字ごとの表示時間を秒で出す。ブラウザを開かずに回帰が取れる。
 *
 * 使い方:
 *   node scripts/text-hold-probe.mjs            … フリーズ + ボーナス継続ジャッジ
 *   node scripts/text-hold-probe.mjs freeze     … フリーズだけ
 *   node scripts/text-hold-probe.mjs bonus      … ボーナス継続ジャッジだけ
 *
 * 判定(このスクリプトが PASS/FAIL を出す条件):
 *   フリーズの問答      … 問いの3行が 2.5秒以上 / 「否!!!」が 1.5秒以上
 *   ボーナス継続ジャッジ … 結果の1行が sticky で、次のレバーONまで消えない
 */

import { Timeline } from '../src/engine/timeline.js';
import { createActions } from '../src/staging/actions.js';
import { LcdAnims, notifyStageEvent } from '../src/staging/anims/lcdanims.js';
import { Cutins } from '../src/staging/anims/cutins.js';
import { Particles } from '../src/staging/anims/particles.js';
import { CharacterLayer } from '../src/render/chars/index.js';
import { OverlayView, BLACKOUT_MAX_HOLD_MS } from '../src/render/overlay.js';
import { SCENARIOS } from '../src/data/scenarios/index.js';
import { FREEZE } from '../src/data/freeze.js';

const DT = 1000 / 60;

/** 描画しない演出システム一式(compare-drivers.mjs の createStaging と同じ作法) */
function createStage() {
  const lcdAnims = new LcdAnims();
  const cutins = new Cutins();
  const lcdParticles = new Particles();
  const overlayParticles = new Particles();
  const chars = new CharacterLayer();
  const overlay = new OverlayView({
    ctx: null, w: 720, h: 1080, cutins, particles: overlayParticles, anims: lcdAnims,
  });
  const actions = createActions({
    lcdAnims, cutins, lcdParticles, overlayParticles, chars, overlay,
    cabinet: { setLampPattern() {} },
    reelView: { highlight() {} },
    audio: null, voice: null, flow: null,
  });
  const timeline = new Timeline({ actions });
  return {
    lcdAnims,
    overlay,
    timeline,
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
 * シナリオを1本流し、フレームごとに「出ている文字」を記録する。
 * @param {string} id シナリオID
 * @param {object} ctx `$` 参照に使うコンテキスト
 * @param {number} totalMs 流す長さ
 * @param {(stage:object, t:number)=>void} [onFrame] 途中でレバーON等を挟みたいとき
 */
function run(id, ctx, totalMs, onFrame) {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`シナリオが見つかりません: ${id}`);
  const stage = createStage();
  stage.timeline.play(scenario, ctx);

  /** @type {{layer:string, text:string, sub:string, from:number, to:number}[]} */
  const segments = [];
  const push = (layer, text, sub, t) => {
    const last = segments[segments.length - 1];
    if (last && last.layer === layer && last.text === text && last.to === t) {
      last.to = t + DT;
      return;
    }
    segments.push({ layer, text, sub: sub ?? '', from: t, to: t + DT });
  };

  /** 暗転が生きていた最後の時刻 / 明けた時刻(フリーズの検証用) */
  let blackoutSeen = false;
  let blackoutEnd = null;
  for (let t = 0; t < totalMs; t += DT) {
    onFrame?.(stage, t);
    const line = stage.overlay.lineEntry;
    if (line) push('overlay', line.text, line.sub, t);
    const band = stage.lcdAnims.text;
    // フェード中(phase:'fade')はもう読ませる時間ではないので数えない
    if (band && band.phase === 'hold') push('lcd', band.text, band.sub, t);
    if (stage.overlay.blackoutState) blackoutSeen = true;
    else if (blackoutSeen && blackoutEnd == null) blackoutEnd = t;
    stage.update(DT);
  }
  return { scenario, segments, stage, blackoutEnd };
}

/** 秒の整形 */
const sec = (ms) => `${(ms / 1000).toFixed(2)}s`;

function reportFreeze() {
  console.log('══ フリーズ(fz_lever_freeze)══════════════════════════════');
  const { scenario, segments, blackoutEnd } = run(
    'fz_lever_freeze',
    { event: 'freeze', mode: 'FREE_TIER' },
    scenarioLength(SCENARIOS.find((s) => s.id === 'fz_lever_freeze')) + 5000,
  );

  let ok = true;
  for (const s of segments) {
    const held = s.to - s.from;
    const isQuestion = s.text.includes('なのか');
    const isDeny = s.text.startsWith('否');
    const need = isQuestion ? 2500 : (isDeny ? 1500 : 0);
    const verdict = held + 1 >= need ? 'OK' : 'NG';
    if (held + 1 < need) ok = false;
    console.log(
      `  ${String(Math.round(s.from)).padStart(6)}ms  ${sec(held).padStart(6)}  `
      + `${verdict === 'OK' ? '  ' : '!!'} ${s.text}${s.sub ? ` / ${s.sub}` : ''}`
      + (need ? `  (要 ${sec(need)} : ${verdict})` : ''),
    );
  }

  // 溜め(暗転解除まで)と爆発(結末の文字が消えるまで)の配分
  const release = scenario.cues.find(
    (c) => c.layer === 'overlay' && c.action === 'blackout' && c.params?.release,
  )?.at ?? 0;
  const last = segments[segments.length - 1];
  const total = last.to;
  console.log(`  ── 溜め ${sec(release)} / 全体 ${sec(total)}`
    + ` = 溜め ${Math.round((release / total) * 100)}% : 爆発 ${Math.round((1 - release / total) * 100)}%`);
  console.log(`  ── ゲーム側 durationMs = ${FREEZE.durationMs}ms`
    + `(明転 ${release}ms との差 ${FREEZE.durationMs - release}ms / ${FREEZE.durationMs >= release ? 'OK' : 'NG: 問答中にリールが回る'})`);
  if (FREEZE.durationMs < release) ok = false;

  // 暗転の hold が解除キューまで届いているか(頭打ちに引っかかると途中で明転する)
  const black = scenario.cues.find(
    (c) => c.layer === 'overlay' && c.action === 'blackout' && !c.params?.release,
  );
  const holdEnd = (black?.params?.fadeInMs ?? 0) + (black?.params?.holdMs ?? 0);
  console.log(`  ── 暗転の保険 ${holdEnd}ms(解除キュー ${release}ms / `
    + `${holdEnd >= release ? 'OK' : 'NG: 溜めの途中で明転する'})`);
  if (holdEnd < release) ok = false;

  // 頭打ち(render/overlay.js)に引っかかると、シナリオの holdMs より早く明転する
  const clamped = Math.min(BLACKOUT_MAX_HOLD_MS, black?.params?.holdMs ?? 0);
  const capOk = clamped >= (black?.params?.holdMs ?? 0);
  console.log(`  ── 暗転の頭打ち BLACKOUT_MAX_HOLD_MS=${BLACKOUT_MAX_HOLD_MS}ms`
    + `(holdMs ${black?.params?.holdMs}ms / ${capOk ? 'OK' : 'NG: 頭打ちで問答中に明転する'})`);
  if (!capOk) ok = false;

  // 実際に暗転が明けた時刻(解除キュー + fadeOut のぶん後ろ)
  const releaseOk = blackoutEnd != null && blackoutEnd >= release && blackoutEnd <= release + 400;
  console.log(`  ── 暗転が明けた実測 ${blackoutEnd == null ? '(明けていない)' : sec(blackoutEnd)}`
    + `(${releaseOk ? 'OK' : 'NG'})`);
  if (!releaseOk) ok = false;
  return ok;
}

function scenarioLength(scenario) {
  const lastCue = Math.max(...scenario.cues.map((c) => (c.at ?? 0) + (c.params?.ms ?? 0)));
  return Math.max(scenario.duration ?? 0, lastCue);
}

function reportBonusContinue() {
  console.log('══ ボーナス継続ジャッジ(bonus_dynamo_ondemand)══════════════');
  // 8秒流したあと「次のレバーON」を入れて、そこで消えることまで見る
  const LEVER_AT = 8000;
  const { segments } = run(
    'bonus_dynamo_ondemand',
    {
      event: 'setEnd', mode: 'BONUS', result: 'CONTINUE',
      healthLabel: 'CAPACITY OK', state: { setCount: 3 },
    },
    12000,
    (stage, t) => {
      // 次のゲームが始まった = sticky の寿命(staging/director.js と同じ口)
      if (Math.abs(t - LEVER_AT) < DT / 2) notifyStageEvent('leverOn');
    },
  );

  let ok = true;
  for (const s of segments) {
    const held = s.to - s.from;
    const kept = s.from <= 2500 && s.to >= LEVER_AT;
    if (!kept) ok = false;
    console.log(
      `  ${String(Math.round(s.from)).padStart(6)}ms  ${sec(held).padStart(6)}  `
      + `${s.layer}: ${s.text}${s.sub ? ` / ${s.sub}` : ''}`
      + `  (レバーONまで保持: ${kept ? 'OK' : 'NG'})`,
    );
  }
  if (segments.length === 0) {
    console.log('  !! 文字が1つも出ていない');
    ok = false;
  }
  return ok;
}

const which = process.argv[2] ?? 'all';
let pass = true;
if (which === 'all' || which === 'freeze') pass = reportFreeze() && pass;
if (which === 'all' || which === 'bonus') pass = reportBonusContinue() && pass;
console.log(pass ? '\n結果: PASS' : '\n結果: FAIL');
process.exit(pass ? 0 : 1);
