/**
 * AWSLOT エントリポイント。初期化とゲームループ起動。
 *
 * 依存方向(DESIGN.md 6.2):
 *   game/ は render/ も staging/ も一切importしない。
 *   ゲーム → 演出への流れは EventBus の一方向のみで、
 *   演出側からゲーム状態を書き換えることはない(DESIGN.md 4.2)。
 */

import { Layers } from './engine/layers.js';
import { Loop } from './engine/loop.js';
import { Input } from './engine/input.js';
import { Rng } from './engine/rng.js';
import { EventBus } from './engine/eventbus.js';
import { symbolAssets } from './engine/assets.js';
import { Timeline } from './engine/timeline.js';
import { audio } from './engine/audio.js';
import { initVoice } from './engine/voice.js';

import { Credit } from './game/credit.js';
import { ReelController } from './game/reelctrl.js';
import { ModeMachine, MODE_HANDLERS } from './game/modemachine.js';
import { GameFlow, FLOW } from './game/flow.js';

import { SymbolCache } from './render/symbols-draw.js';
import { ReelView } from './render/reelview.js';
import { LcdView } from './render/lcd.js';
import { HudView } from './render/hud.js';
import { OverlayView } from './render/overlay.js';
import { CabinetView } from './render/cabinet.js';
import { ResultPanel } from './render/resultpanel.js';
import { CharacterLayer } from './render/chars/index.js';

import { StagingDirector } from './staging/director.js';
import { createActions } from './staging/actions.js';
import { LcdAnims, getAmbientTexts } from './staging/anims/lcdanims.js';
import { Cutins } from './staging/anims/cutins.js';
import { Particles } from './staging/anims/particles.js';

import { SYMBOL_IDS, SYMBOLS } from './data/symbols.js';
import { DEBUG_FLAG_KEYS, FLAG_BY_ID, isRare } from './data/flags.js';
import { verifyStrips } from './data/reelstrips.js';
import { SCENARIOS, validateScenarios } from './data/scenarios/index.js';
import { MODE_BGM, FLAG_SFX } from './data/sfx-presets.js';

/**
 * 起動時に有効なモードID(?mode= 用)。
 * モードを増やしたときに書き足し忘れないよう、ハンドラ登録表から導出する。
 */
const STARTABLE_MODES = Object.keys(MODE_HANDLERS);

/** URLパラメータの読み取り(DESIGN.md 6.9) */
function readParams() {
  const q = new URLSearchParams(location.search);
  const num = (key, fallback = null) => {
    const v = q.get(key);
    if (v === null || v === '') return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const turboRaw = num('turbo', 0);
  return {
    seed: num('seed', null),
    // ?turbo=1 で3倍速。数値を渡せばその倍率(上限10倍)
    turbo: turboRaw > 0 ? Math.min(10, turboRaw === 1 ? 3 : turboRaw) : 1,
    mode: q.get('mode'),
    dc: num('dc', null),
    /** ?czId=TRUSTED_ADVISOR のように書くと CZ の種類を指定して直接起動できる(4種の単体検証用) */
    czId: q.get('czId'),
    debug: q.get('debug') === '1',
    /** ?nofx=1 で演出システムを止める(素のゲーム進行の確認用) */
    noFx: q.get('nofx') === '1',
  };
}

/** デバッグ凡例をDOM APIで組み立てる(innerHTMLは使わない) */
function buildDebugLegend(container) {
  container.textContent = '';
  const line1 = document.createElement('div');
  const basics = [
    ['↑', 'BET→レバー(自動判別)'], ['← ↓ →', '左/中/右 停止'],
    ['Enter', 'BET'], ['Space', 'レバー'], ['A S D', '停止/分岐選択'],
    ['R', 'リザルトからもう一度'],
    ['0', 'CREDIT+50'], ['M', 'ミュート'], ['H', '凡例表示切替'],
  ];
  basics.forEach(([key, label], i) => {
    if (i > 0) line1.append(' / ');
    const b = document.createElement('b');
    b.textContent = key;
    line1.append(b, label);
  });

  const line2 = document.createElement('div');
  DEBUG_FLAG_KEYS.forEach((d, i) => {
    if (i > 0) line2.append(' ');
    const b = document.createElement('b');
    b.textContent = d.key;
    line2.append(b, d.short);
  });

  container.append(line1, line2);
}

/** 比較用にテキストを正規化する(空白・記号を落として大文字化) */
function normalizeText(s) {
  return String(s ?? '')
    .replace(/[\s!！?？…・、。,.\-—―~〜"'”’「」『』[\]【】()（）:：/／+＋]/g, '')
    .toUpperCase();
}

/**
 * 液晶に出ている演出テキストと同じ意味のテロップは下部パネルに出さない。
 *
 * 完全一致だけでなく「ボーナス確定!!」と「ボーナス確定」のような
 * 包含関係も重複とみなす。ただし短い語(3文字以下)の包含で消すと
 * 「CZ」を含むだけの別文言まで消えてしまうので、4文字以上に限る。
 *
 * @param {string} telop 下部パネルに出す予定のテロップ
 * @param {string[]} lcdTexts いま液晶に出ている演出テキスト
 */
function dedupeTelop(telop, lcdTexts) {
  const t = normalizeText(telop);
  if (!t) return telop;
  for (const raw of lcdTexts) {
    const n = normalizeText(raw);
    if (!n) continue;
    if (n === t) return '';
    const short = n.length < t.length ? n : t;
    const long = n.length < t.length ? t : n;
    if (short.length >= 4 && long.includes(short)) return '';
  }
  return telop;
}

async function boot() {
  const params = readParams();

  // データ定義の自己チェック(DESIGN.md 注意事項3)
  const verify = verifyStrips();
  if (!verify.ok) {
    console.warn('[reelstrips] 5コマ窓制約に違反があります:', verify.errors.slice(0, 5));
  }
  const scenarioCheck = validateScenarios();
  if (!scenarioCheck.ok) {
    console.warn('[scenarios] 定義に問題があります:', scenarioCheck.errors);
  }

  // ── レイヤー ───────────────────────────────
  const cabinetEl = document.getElementById('cabinet');
  const layers = new Layers(cabinetEl, document.getElementById('viewport')).init();

  // ── アセット(未配置ならプレースホルダ描画) ─────
  // 絵柄ストアは engine 側の共有インスタンスを使う。
  // これで staging/(演出)からも同じ画像を参照でき、二重ロードにならない。
  const assets = symbolAssets;
  await assets.load(SYMBOL_IDS.map((id) => ({ id, path: `symbols/${SYMBOLS[id].asset}` })));
  const symbols = new SymbolCache({ assets, dpr: layers.dpr }).build();

  // ── ゲーム(描画も演出も知らない層) ───────────
  const bus = new EventBus({ debug: params.debug });
  const rng = new Rng(params.seed);
  const credit = new Credit(50);
  const reels = new ReelController();
  const modes = new ModeMachine({ rng, bus });
  const flow = new GameFlow({ bus, rng, credit, reels, modeMachine: modes });

  const startMode = STARTABLE_MODES.includes(params.mode) ? params.mode : 'FREE_TIER';
  // NOTE: modes.start() はここでは呼ばない。
  // start() は modeEnter を emit するため、演出システムが購読を開始する前に呼ぶと
  // 起動モードの入場シナリオ(char.show を含む)が誰にも拾われず、キャラが出ないままになる。
  // 実際の開始は director.attach() の後(このファイル末尾寄り)で行う。

  // ── 演出アニメーション ────────────────────
  const lcdAnims = new LcdAnims();
  const cutins = new Cutins();
  const lcdParticles = new Particles();
  const overlayParticles = new Particles();
  const chars = new CharacterLayer();

  // ── 描画 ──────────────────────────────────
  const cabinet = new CabinetView(cabinetEl);
  const reelView = new ReelView({
    ctx: layers.ctx('reels'),
    fxCtx: layers.ctx('reelfx'),
    symbols,
    reels,
  });
  const lcdView = new LcdView({
    ctx: layers.ctx('lcd'),
    ...layers.size('lcd'),
    anims: lcdAnims,
    chars,
    particles: lcdParticles,
  });
  const hudView = new HudView({ ctx: layers.ctx('hud'), ...layers.size('hud') });
  // 50回転終了時のリザルト(名前入力があるのでDOM。演出オーバーレイより上に出る)
  const resultPanel = new ResultPanel(cabinetEl);
  const overlayView = new OverlayView({
    ctx: layers.ctx('overlay'),
    ...layers.size('overlay'),
    cutins,
    particles: overlayParticles,
    shakeTarget: cabinetEl,
  });

  // ── 音(Phase 4: 効果音/BGM、Phase 6: キャラ音声) ──
  // ブラウザの自動再生制限があるので AudioContext は初回操作まで作らない。
  // unlockOnFirstGesture() が click/keydown/touch を待って resume してくれる。
  audio.unlockOnFirstGesture();
  // voice は audio と AudioContext / master を共有する(音量とミュートを一元化するため)。
  // ここではまだ ctx が無いので null 注入になるが、初回操作後に改めて init し直す。
  const voice = initVoice({ audioContext: audio.ctx, masterGain: audio.master, debug: params.debug });
  const linkVoiceToAudio = () => {
    if (audio.ctx) voice.init({ audioContext: audio.ctx, masterGain: audio.master });
  };

  // ── 演出システム(Phase 3) ──────────────────
  const actions = createActions({
    lcdAnims, cutins, lcdParticles, overlayParticles,
    chars, overlay: overlayView, cabinet, reelView,
    audio, voice,
  });
  const timeline = new Timeline({ actions });

  // モード遷移時の後片付け。
  // NOTE: これは必ず director.attach() より前に登録する。EventBus はハンドラを登録順に呼ぶため、
  //       後に登録すると「入場シナリオが出した液晶演出を直後に消してしまう」順序になる。
  bus.on('modeEnter', (p) => {
    lcdAnims.clear();
    lcdParticles.clear();
    chars.applyMode(p.id);

    // モード既定のBGMへ。MODE_BGM に無いモード(短命な上乗せゾーン等)は
    // 親モードの曲を鳴らしたままにする。
    // シナリオ側の bgm.change と同じ曲に解決されるよう BGM_ALIASES を揃えてあるので、
    // 両方が走っても changeBgm が no-op になり曲は鳴り直さない。
    const bgm = MODE_BGM[p.id];
    if (bgm) audio.changeBgm(bgm, { fadeMs: p.resumed ? 400 : 900 });
    // そのモードで使うセリフを先読み。未生成でも静かに諦めるので失敗しない。
    voice.preloadMode(p.id);
  });

  // 演出用の乱数はゲーム用と分ける。
  // 同じ Rng を共有すると「シナリオを1つ増やしただけで乱数消費がズレて抽選結果が変わる」ため、
  // DESIGN.md 6.5 の「演出を差し替えてもゲームバランスが壊れない」保証が崩れてしまう。
  const stagingRng = new Rng((rng.seed ^ 0x9e3779b9) >>> 0);

  const director = new StagingDirector({
    bus,
    timeline,
    scenarios: SCENARIOS,
    rng: stagingRng,
    debug: params.debug,
    // ゲーム状態のスナップショット(読み取り専用)
    getContext: () => ({
      mode: modes.currentId,
      modeState: modes.state,
      modeStack: modes.stackIds,
      flowState: flow.state,
      flag: flow.flag,
      credit: credit.credit,
      diff: credit.diff,
      // 50回転スコアアタックの残り回転数(演出の煽り条件に使える)
      spinsLeft: flow.spinsLeft,
      sessionEnded: flow.session.ended,
    }),
  });
  if (!params.noFx) director.attach();

  // ── 描画側の直接フィードバック(演出シナリオとは別) ──
  bus.on('leverOn', (p) => {
    cabinet.pullLever();
    reelView.onLever();
    // 成立役名(出目)の右側表示は通常プレイでは出さない(2026-08-13 ユーザー指示)。
    // 役の確認手段としてデバッグ時のみ残す。
    if (params.debug) {
      overlayView.showFlag(p.flagName + (p.forced ? ' [強制]' : ''), p.rare);
    }
  });
  for (const ev of ['stop1', 'stop2', 'stop3']) {
    bus.on(ev, (p) => reelView.onReelStop(p.index));
  }
  bus.on('judge', (p) => reelView.onJudge(p));

  // ── 効果音の直接配線(シナリオを持たない基本操作音) ──
  // 演出シナリオの sfx.synth とは別系統。シナリオが1本も当たらない
  // 通常のゲームでも、打鍵に対する手応えは必ず返るようにしておく。
  bus.on('bet', () => {
    audio.playPreset('coin_in');
    // AudioContext を作るのは unlockOnFirstGesture(capture フェーズ)の側。
    // BETまで来ていれば必ずユーザー操作が1回起きているので、ここで voice に配線し直せる。
    // init は同じ ctx なら何もしないので毎ゲーム呼んでも無害。
    linkVoiceToAudio();
  });
  bus.on('leverOn', (p) => {
    audio.playPreset('lever_on');
    linkVoiceToAudio();
    // レア役はレバーONの時点で少し遅らせて重ねる(告知感を出す)
    if (p.rare && FLAG_SFX[p.flag]) audio.playPreset(FLAG_SFX[p.flag], { delay: 0.12 });
  });
  for (const ev of ['stop1', 'stop2', 'stop3']) {
    bus.on(ev, () => audio.playPreset('reel_stop'));
  }
  bus.on('judge', (p) => {
    // NOTE: judge の p.win は真偽値ではなく「実際に揃った役のID」(ハズレなら 'LOSE')。
    //       FLAG_SFX.LOSE は null なので、この参照だけでハズレは自然に無音になる。
    const sfx = FLAG_SFX[p.win];
    // レア役はレバーONで既に鳴らしているので、ここでは二度鳴らさない
    if (!sfx || isRare(p.win)) return;
    audio.playPreset(sfx);
  });

  // 払出は1枚ごとに音程を上げていく(枚数が伸びるほど気持ちよくなるやつ)
  let payoutStep = 0;
  bus.on('payoutStart', () => { payoutStep = 0; });
  bus.on('payoutTick', () => audio.playPreset('payout_tick', { step: payoutStep++ }));
  bus.on('payoutEnd', (p) => { if (p.total > 0) audio.playPreset('payout_end'); });

  // ── ゲーム開始 ────────────────────────────
  // ここまでで演出システムの購読が完了しているので、
  // 起動モードの入場シナリオ(キャラ表示を含む)も正しく再生される。
  //
  // ?dc= / ?czId= は起動モードへそのまま渡す。
  // ?czId は CZ 4種(CW_ALARM / TRUSTED_ADVISOR / WELL_ARCHITECTED / SFN_CZ)を
  // 単体で確認するための入口。未指定・不正値なら cz.js 側が CW_ALARM へ丸める。
  const startParams = {};
  if (params.dc != null) startParams.dc = params.dc;
  if (params.czId) startParams.czId = params.czId;
  modes.start(startMode, startParams);

  // ── 入力 ──────────────────────────────────
  const input = new Input(cabinetEl).attach();
  input.on('BET', () => flow.insertBet());
  input.on('LEVER', () => flow.leverOn());
  input.on('STOP0', () => flow.stopReel(0));
  input.on('STOP1', () => flow.stopReel(1));
  input.on('STOP2', () => flow.stopReel(2));
  // ↑キー / ワンボタン操作: 今の状態に合わせて BET → レバーON → リスタートを振り分ける
  input.on('PLAY', () => flow.play());
  // R キー: リザルト表示中に新しい50回転を始める
  input.on('RESTART', () => {
    if (flow.isResult) flow.restart();
    else flow.telop = `[SCORE ATTACK] 残り ${flow.spinsLeft} 回転`;
  });
  input.on('DEBUG_CREDIT', () => {
    const n = credit.insert(50);
    flow.telop = `[DEBUG] CREDIT +${n}`;
  });
  DEBUG_FLAG_KEYS.forEach((d, i) => {
    input.on(`DEBUG_FLAG_${i + 1}`, () => flow.setForcedFlag(d.flag));
  });

  input.on('TOGGLE_MUTE', () => {
    // Mキー自体もユーザー操作なので、ここで AudioContext を起こしてしまう
    audio.resume().then(linkVoiceToAudio);
    const muted = audio.toggleMute();
    voice.setMuted(muted);
    flow.telop = muted ? '[SOUND] ミュート' : '[SOUND] ミュート解除';
  });

  const debugBar = document.getElementById('debug-bar');
  input.on('TOGGLE_HELP', () => {
    debugBar.style.display = debugBar.style.display === 'none' ? 'flex' : 'none';
  });
  buildDebugLegend(document.getElementById('debug-keys'));

  // ── ループ ────────────────────────────────
  const debugStateEl = document.getElementById('debug-state');
  let frame = 0;

  const loop = new Loop({
    onStep: (dt) => {
      flow.update(dt);
      // 演出の時間進行
      timeline.update(dt);
      lcdAnims.update(dt);
      cutins.update(dt);
      lcdParticles.update(dt);
      overlayParticles.update(dt);
      chars.update(dt);
      // 描画の時間進行
      reelView.update(dt);
      lcdView.update(dt);
      overlayView.update(dt);
    },
    onRender: () => {
      reelView.draw();
      lcdView.draw({
        modeId: modes.currentId,
        state: modes.state,
        telop: flow.telop,
        stackIds: modes.stackIds,
        // 50回転スコアアタックの進行(リザルト描画を担当する後続タスク用)
        session: flow.session,
        spinsLeft: flow.spinsLeft,
      });
      hudView.draw({
        credit: credit.credit,
        // COUNT は「残り回転数」のカウントダウン(100 → 1 → 0 で終了)
        count: flow.spinsLeft,
        payout: flow.payoutShown,
        spinsLeft: flow.spinsLeft,
        session: flow.session,
      });
      overlayView.draw();
      // リザルトは RESULT モードに居る間だけ開く(閉じるときは null を渡す)
      resultPanel.sync(modes.currentId === 'RESULT' ? modes.state : null);

      cabinet.setButtonStates({
        canBet: flow.canBet,
        canLever: flow.canLever,
        // 分岐選択中(Step Functions等)は停止ボタンを選択ボタンとして兼用するので、
        // 左(A)と右(D)だけ光らせて押せることを示す。中(S)は使わない。
        reelActive: reels.reels.map(
          (r, i) => (flow.canStop && r.canStop) || (modes.awaitingChoice && i !== 1),
        ),
      });
      // 同じ文言が液晶にも出ているときは下部パネルのテロップを伏せる
      // (「ボーナス確定」などが画面に2〜3個並ぶのを防ぐ。読ませたいのは液晶側)
      //
      // 見るのは2種類:
      //   getVisibleTexts() … 演出のテキスト帯(lcd.text)
      //   getAmbientTexts() … 液晶が常設で出している文言。
      //                       モードのルール文(state.telop)は液晶の下部にも出ており、
      //                       これを見ないと同じ文が液晶とパネルに二重で出てしまう。
      cabinet.setTelop(dedupeTelop(flow.telop, [
        ...(lcdAnims.getVisibleTexts?.() ?? []),
        ...getAmbientTexts(),
      ]));
      // 演出が電飾を握っていない間だけモード既定のパターンに戻す
      if (!timeline.isPlaying) {
        cabinet.syncLampToMode(modes.currentId, flow.state === FLOW.SPINNING);
      }

      // デバッグ表示は毎フレーム更新すると重いので間引く
      if (++frame % 12 === 0) {
        const s = modes.state;
        const extra = s.remaining != null ? ` ${s.remaining}G` : '';
        const dc = s.dc != null ? ` DC${s.dc}` : '';
        debugStateEl.textContent = [
          `残${flow.spinsLeft}回転`,
          `${modes.currentId}${extra}${dc}`,
          `${flow.state}`,
          `G:${flow.stats.games} 差枚:${credit.diff >= 0 ? '+' : ''}${credit.diff}`,
          `fx:${timeline.activeIds.length}`,
          `seed:${rng.seed}`,
          `${loop.fps}fps`,
        ].join('  ');
      }
    },
  });
  loop.timeScale = params.turbo;
  loop.start();

  console.info(
    `[AWSLOT] 起動しました  seed=${rng.seed}  turbo=x${params.turbo}  mode=${startMode}` +
    `  シナリオ:${SCENARIOS.length}件${params.noFx ? ' (演出OFF)' : ''}` +
    (symbols.usedPlaceholder.length > 0
      ? `\n  プレースホルダ絵柄: ${symbols.usedPlaceholder.join(', ')}`
      : ''),
  );

  // デバッグ用にグローバル公開(コンソールから触れるように)
  window.AWSLOT = {
    flow, modes, credit, reels, rng, bus, loop, layers, symbols,
    director, timeline, chars, lcdAnims, cutins, SCENARIOS, FLAG_BY_ID,
    audio, voice,
  };
}

boot().catch((err) => {
  console.error('[AWSLOT] 起動に失敗しました', err);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:0;z-index:99;color:#ff8080;background:#100;padding:24px;font-size:14px;white-space:pre-wrap;';
  el.textContent = `AWSLOT の起動に失敗しました\n\n${err?.stack ?? err}`;
  document.body.appendChild(el);
});
