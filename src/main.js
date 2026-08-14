/**
 * JAWSLOT -ジョースロット- エントリポイント。初期化とゲームループ起動。
 *
 * 【名前について(2026-08-15 U45)】
 * 画面に出す台名は「JAWSLOT -ジョースロット-」へ改名した。
 * ただし **コード側の識別子は AWSLOT のまま**(window.AWSLOT / CSS の id・class /
 * localStorage キー / ログの `[AWSLOT]` 以外の内部名)。
 * 識別子まで変えると console API を叩いている手順書とスタイルが全部ズレるため、
 * 「見える文言だけを変える」と決めている。
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
import { symbolAssets, loadUiAssets } from './engine/assets.js';
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
import { LcdAnims, getAmbientTexts, stageTextCovers } from './staging/anims/lcdanims.js';
import { Cutins } from './staging/anims/cutins.js';
import { Particles } from './staging/anims/particles.js';

import { SYMBOL_IDS, SYMBOLS } from './data/symbols.js';
import { DEBUG_FLAG_KEYS, FLAG_BY_ID, isRare } from './data/flags.js';
import { ZENCHO, ZENCHO_PATTERN_BY_ID } from './data/zencho.js';
import { DEBUG_RUSH_KEYS } from './data/rushes.js';
// U44: 甘スロ。判定(AMA_MODE)も遷移先URL(amaUrl)もデータ側が持つ
import { AMA, AMA_MODE, amaUrl } from './data/ama.js';
import { setDebugPattern, getDebugPattern } from './game/modes/freetier.js';
import { verifyStrips } from './data/reelstrips.js';
import { SCENARIOS, validateScenarios } from './data/scenarios/index.js';
import { MODE_BGM, FLAG_SFX } from './data/sfx-presets.js';
import { SESSION } from './data/session.js';

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
    /** ?freeze=1 で、起動後の最初のレバーONを必ずレバーONフリーズにする */
    freeze: q.get('freeze') === '1',
    /** ?pattern=bill_shock で前兆の演出パターンを固定する(data/zencho.js の id) */
    pattern: q.get('pattern'),
    /*
     * ?ama=1(甘スロ)はここでは読まない。
     * 判定の唯一の正は data/ama.js の AMA_MODE(小役テーブルを書き換える側と
     * 同じ値を見ないと、表示だけ甘スロを名乗る事故が起きる)。
     */
  };
}

/* ══ デバッグの入口一覧(Hキーの凡例。2026-08-14 U33)══════════════════
 *
 * 「実装を grep で棚卸しして正確に」が要件なので、**書き足したら必ずここも足す**。
 * 現物の在りかは以下のとおり:
 *   キー割当      … src/engine/input.js の KEY_MAP(+ 下の DEBUG_RUSH_KEYS / DEBUG_FLAG_KEYS)
 *   L キー        … src/data/scenarios/yokoku-luna.js(KEY_MAP ではなく自前の keydown)
 *   URLクエリ     … src/main.js の readParams / render/lcd.js(countdown)/
 *                   scenarios の yokoku-luna(luna)・yokoku-aruaru(aruaru)・
 *                   yokoku-wind(yw / bluegreen)
 *   コンソールAPI … このファイル末尾の window.AWSLOT
 */

/**
 * リザルトが開いている間の下部テロップ(2026-08-15 検証指摘 F18)。
 * 集計が終わった後も「成績を集計しています…」が残って事実と食い違っていたので、
 * 「次に何を押せばよいか」へ差し替える(キーは HELP_BASIC と同じもの)。
 */
const RESULT_OPEN_TELOP = 'R キー / ↑キーでもう一度';

/** 基本操作(デバッグではないが、凡例としてまとめて出す) */
const HELP_BASIC = [
  ['↑', 'BET→レバー(自動判別)'], ['← ↓ →', '左/中/右 停止'],
  ['Enter', 'BET'], ['Space', 'レバー'], ['A S D', '停止 / 分岐選択'],
  ['R', 'もう一度'], ['M', 'ミュート'], ['H', 'この一覧'],
];

/** デバッグ用の強制発火キー(RUSH直行は data/rushes.js から足す) */
const HELP_DEBUG_KEYS = [
  ['0', 'CREDIT+50'], ['F', 'フリーズ強制'], ['W', '風の演出'],
  ['P', '前兆パターン順送り'], ['L', 'ルナ強制 ON/OFF'],
];

/** URLクエリ。値を取るものは `=` まで書く(コピペでそのまま使えるように) */
const HELP_QUERIES = [
  ['?debug=1', 'デバッグ表示 + 成立役ラベル'],
  ['?seed=', '乱数シード固定'],
  ['?turbo=', '倍速(1で3倍 / 最大10)'],
  ['?mode=', '起動モード指定'],
  ['?czId=', 'CZの種類を指定'],
  ['?dc=', 'AS RUSH の初期台数'],
  ['?freeze=1', '初回レバーONをフリーズに'],
  ['?pattern=', '前兆パターン固定'],
  ['?countdown=1', 'ラスト5カウントダウン常時表示'],
  ['?nofx=1', '演出システムOFF'],
  ['?luna=1', 'ルナのカメオ強制'],
  ['?aruaru=', 'あるある分岐を狙う(1 / ネタid)'],
  ['?yw=', '風・Direct Connect等を狙う(idの一部)'],
  ['?bluegreen=1', 'BLUE/GREEN 2択を狙う'],
  ['?ama=1', '甘スロで遊ぶ'],
];

/** コンソールから叩けるもの(window.AWSLOT) */
const HELP_CONSOLE = [
  ['AWSLOT.forceFreeze()', '次の1回転をフリーズ'],
  ['AWSLOT.setZenchoPattern(id)', '前兆パターン固定(null で解除)'],
  ['AWSLOT.zenchoPatterns', '固定できるID一覧'],
];

/**
 * デバッグ凡例をDOM APIで組み立てる(innerHTMLは使わない)。
 * 1行 = { 見出し, [キー, 説明][] }。
 *
 * 2026-08-15 V31-06: 以前は長い行だけ折り返しを許していた(is-wrap)ため、
 * 「役」「強制」の行が右端で切れて読めなかった。**全行を折り返す**方針に変えて
 * .is-wrap は廃止(折り返しの指定は style.css の .debug-keys > div が持つ)。
 */
function buildDebugLegend(container) {
  container.textContent = '';
  const lines = [
    { title: '操作', items: HELP_BASIC },
    {
      title: '強制',
      items: [
        ...HELP_DEBUG_KEYS,
        // U11: RUSH 4種への強制突入(割当は data/rushes.js の DEBUG_RUSH_KEYS)
        ...DEBUG_RUSH_KEYS.map((d) => [d.key, d.short]),
      ],
    },
    { title: '役', items: DEBUG_FLAG_KEYS.map((d) => [d.key, d.short]), sep: ' ' },
    { title: 'URL', items: HELP_QUERIES },
    { title: 'JS', items: HELP_CONSOLE },
  ];

  for (const { title, items, sep = ' / ' } of lines) {
    const row = document.createElement('div');
    const head = document.createElement('i');
    head.textContent = `${title}: `;
    row.append(head);
    items.forEach(([key, label], i) => {
      if (i > 0) row.append(sep);
      const b = document.createElement('b');
      b.textContent = key;
      row.append(b, label);
    });
    container.append(row);
  }
}

/**
 * 甘スロの入口(U44。デバッグ入口の棚卸し U33 と同じ回で足したUI)。
 * 押すと `?ama=1` を付け外しして **再読込するだけ**。
 *
 * ランタイム切替は作らない(data/ama.js の取り決め。小役テーブルは読み込み時に
 * 1回だけ書き換わるので、途中で戻すと同じセッションの前半と後半で確率が変わる)。
 * 遷移先URLの組み立ても data/ama.js の amaUrl() に任せる
 * = クエリのキー(ama)を表示側が二重に持たない。
 *
 * DOM は index.html を触らずここで作り、見た目は style.css の .mode-switch が持つ。
 * バッジの文言も data/ama.js の AMA から取る(画面に直書きしない)。
 *
 * ── 遊んでいる途中の誤爆を止める(2026-08-15 検証指摘 F9)──
 * このボタンは筐体の外に出ているのでプレイ中も押せてしまい、
 * クリックでも「フォーカス + Enter」でも即座に再読込 = 進行中の100回転が消えていた。
 * 90回転目に当てたら取り返しがつかないので、
 * **1回転でも回していて、まだ終わっていないとき** だけ confirm を挟む。
 * (0回転のとき・リザルトを見ているときは邪魔にしかならないので出さない)
 *
 * @param {import('./game/flow.js').GameFlow} [flow] 進行状況の確認用。省略時は確認なし
 */
function setupAmaUi(flow = null) {
  /** いま切り替えると消えてしまう進行があるか */
  const wouldDiscardRun = () => Boolean(flow) && flow.stats.games > 0 && !flow.session.ended;

  const make = () => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = AMA_MODE ? 'mode-switch is-back' : 'mode-switch';
    btn.textContent = AMA_MODE ? '通常スロに戻る' : `${AMA.label}で遊ぶ`;
    // 押すと再読込 = 100回転が最初からになること、何が変わるかを押す前に伝える
    btn.setAttribute(
      'aria-label',
      AMA_MODE
        ? '通常スロに戻る。ページを読み込み直して新しい100回転を始めます'
        : `${AMA.label}で遊ぶ。${AMA.note}。ページを読み込み直して新しい100回転を始めます`,
    );
    btn.title = AMA_MODE ? '通常の設定に戻します' : AMA.note;
    btn.addEventListener('click', () => {
      if (wouldDiscardRun()
        // eslint-disable-next-line no-alert -- 取り返しがつかない操作なので確認を挟む
        && !window.confirm(
          `いま遊んでいる100回転(${flow.stats.games}回転目)は最初からになります。よろしいですか?`,
        )) return;
      location.href = amaUrl(!AMA_MODE);
    });
    return btn;
  };

  // PC: HOW TO PLAY プレートの中(脚注の下)
  const plate = document.querySelector('#controls-guide .guide-plate');
  if (plate) {
    const wrap = document.createElement('div');
    wrap.className = 'mode-switch-wrap';
    wrap.append(make());
    plate.append(wrap);
  }
  // スマホ縦持ち: 余白の説明文の下(#controls-guide は幅1100px未満で非表示になるため)
  document.getElementById('mobile-rule')?.append(make());
  /*
   * どちらの置き場所も出ない窓サイズ(幅1100px未満 かつ 横長)がある。
   * そこだけ拾う逃がし場所として、画面の左下に同じボタンを置く
   * (表示条件は style.css の .mode-switch-floating のメディアクエリが持つ)。
   */
  const floating = make();
  floating.classList.add('mode-switch-floating');
  document.body.append(floating);

  if (!AMA_MODE) return;
  /*
   * リザルトの甘スロバッジ。
   * リザルトのDOMは render/resultpanel.js の担当なので、こちらは
   *   1. <body> に .is-ama を付ける
   *   2. 文言を data-* 属性で渡す(style.css が content: attr() で出す)
   * だけにして、あちらの実装には触らない(textContent しか書き換えないので属性は残る)。
   */
  document.body.classList.add('is-ama');
  document.getElementById('result-heading')?.setAttribute('data-ama-badge', AMA.badge);
  document.getElementById('result-session')?.setAttribute('data-ama-label', AMA.label);
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
  /*
   * 2026-08-14 ユーザー指摘 U8:
   * 液晶側のテロップ帯(render/lcd.js の _drawTelop)と同じ判定を使う。
   * 両者で判定がずれると「液晶では伏せたのに下部パネルには出る」= 文言が
   * 画面を飛び移ったように見えるので、必ず同じ関数で決める。
   */
  if (stageTextCovers(telop)) return '';
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

/**
 * 起動時のちらつき防止(#boot-screen)を隠して本体をフェードインする。
 *
 * 呼び出しタイミングは boot() の末尾(loop.start() の後)で
 *   Promise.race([loadUiAssets(), 4秒タイムアウト]).then(revealApp)
 * として配線する。loadUiAssets() は engine/assets.js 側でキャッシュされた
 * 同一Promiseなので、render/cabinet.js が内部で呼んでいる
 * loadUiAssets().then(...)(筐体アートPNGの適用)より必ず後に実行される
 * (同じPromiseへの .then() は登録順にマイクロタスクが走るため)。
 * これにより「フォールバック筐体 → アートPNG」の差し替えが完了してから
 * 画面が見えるようになり、起動時のちらつきが起きない。
 */
function revealApp() {
  const boot = document.getElementById('boot-screen');
  const viewport = document.getElementById('viewport');
  viewport?.classList.add('is-ready');
  if (!boot) return;
  boot.classList.add('is-hidden');
  boot.setAttribute('aria-hidden', 'true');
  const cleanup = () => boot.remove();
  boot.addEventListener('transitionend', cleanup, { once: true });
  // transitionend が発火しない環境(テスト等)向けの保険
  setTimeout(cleanup, 500);
}

async function boot() {
  const params = readParams();

  // UI画像(筐体アート)の読み込みは symbol 絵柄より先に着手しておく。
  // 直列だと「絵柄を待ってから筐体画像を待つ」になり起動が遅くなるため、
  // ここで先に走らせて2つの読み込みを並列化する。
  // (loadUiAssets() は同一Promiseをキャッシュするので、
  //  render/cabinet.js 側の呼び出しと二重フェッチにはならない)
  const uiAssetsReady = loadUiAssets();

  /*
   * 画面に出るゲーム数の差し込み(index.html)。
   * ハードコード禁止方針のため、静的HTML側の "100" は JS 無効時のフォールバックに留め、
   * 表示用の値は必ず data/session.js の SESSION.totalGames を参照する。
   * 差し込み先は3か所(2026-08-15 検証指摘 F8 で目的の1行を各所に足した):
   *   #mobile-rule-games  … スマホ縦持ちの説明文
   *   .guide-goal-games   … PC の HOW TO PLAY プレート先頭の目的
   *   .compact-hint-games … 狭い横長の窓だけに出る最小ヒント
   */
  for (const el of document.querySelectorAll(
    '#mobile-rule-games, .guide-goal-games, .compact-hint-games',
  )) {
    el.textContent = String(SESSION.totalGames);
  }

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
  /*
   * 100回転終了時のリザルト。
   * DOM で組んでいるのは **スクリーンリーダで読める見出し・定義リストにするため**
   * (canvas に描くと構造が読み取れない)。演出オーバーレイより上に出る。
   * ※ U47 でなまえ入力を廃止したので「入力欄があるから DOM」ではなくなった。
   *   理由は render/resultpanel.js のヘッダと同じ表現に揃えてある。
   */
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
    // reelfx.lock の宛先。flow.lockReels() は RNG も成立役も変えず、
    // 次のスピンが始まる時刻だけを遅らせる(DESIGN.md 4.2 は保たれている)
    flow,
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
      // 100回転スコアアタックの残り回転数(演出の煽り条件に使える)
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
  // ?mode=CF_RUSH / AURORA_RUSH / HERO_RUSH で RUSH 4種を直接起動できる(U11)。
  // ?dc=8 は オートスケーリングRUSH の初期台数(= 初期ゲーム数)として渡る。
  // ?dc= / ?czId= は起動モードへそのまま渡す。
  // ?czId は CZ 11種(U52c で 8 → 11。data/modes.js の CZ_TYPES.distribution が正)を
  // 単体で確認するための入口。未指定・不正値なら cz.js 側が CW_ALARM へ丸める。
  const startParams = {};
  if (params.dc != null) startParams.dc = params.dc;
  if (params.czId) startParams.czId = params.czId;
  modes.start(startMode, startParams);

  // ?freeze=1 … 起動後の最初のレバーONを必ずフリーズにする(演出の確認用)
  if (params.freeze) flow.forceFreeze();
  // ?pattern=bill_shock … 前兆の演出パターンを固定する。
  // 固定しても drawPattern はRNGを1回消費するので、出目は固定の有無で変わらない
  if (params.pattern) {
    const applied = setDebugPattern(params.pattern);
    if (!applied) console.warn(`[JAWSLOT] ?pattern= の値が不正です: ${params.pattern}`);
  }

  // ── 入力 ──────────────────────────────────
  /**
   * 全面占有演出が当落を伏せている間(U42 の背景保留中)は、次のゲームを始めさせない
   * (2026-08-15 V31-07)。
   *
   * 【何が起きていたか】
   * クイズ正解版は CZ の modeEnter で始まるので、答えが出る前にもうモードは CZ。
   * U42 で画面(背景・盤面・残G・テロップ)は伏せたが、**ゲームは止まっていない**ため、
   * 出題中にレバーを叩くと裏で CZ が消化され、正解が出た瞬間に
   * 「CZ 残り 6G」のように **減った状態で始まる** ことになっていた。
   *
   * 【なぜ入力側で止めるのか】
   * モード遷移を遅らせるのはゲーム側(game/modes/)の仕事で、演出の都合で
   * 触ってよい場所ではない(DESIGN.md 4.2)。逆に「演出が結果を伏せている間は
   * 手を止める」のは入力の作法の話なので、ここで受け止めるのが筋。
   * リールを回さない = RNG も成立役も一切動かないので、出目にも期待値にも影響しない。
   *
   * 止めるのは **投入とレバー(次のゲームを始める操作)だけ**。
   * 停止ボタンは止めない(回転中に保留が始まった場合、押せないとリールが
   * 自動停止するまで手が止まってしまうため)。
   * 押せないことは筐体のボタンが消灯することで伝わる(下の setButtonStates)。
   */
  const stagingHoldsResult = () => lcdView.stageMasked;

  const input = new Input(cabinetEl).attach();
  input.on('BET', () => { if (!stagingHoldsResult()) flow.insertBet(); });
  input.on('LEVER', () => { if (!stagingHoldsResult()) flow.leverOn(); });
  input.on('STOP0', () => flow.stopReel(0));
  input.on('STOP1', () => flow.stopReel(1));
  input.on('STOP2', () => flow.stopReel(2));
  // ↑キー / ワンボタン操作: 今の状態に合わせて BET → レバーON → リスタートを振り分ける
  // (リザルトのリスタートも兼ねるが、保留中はそもそもリザルトに居ない)
  input.on('PLAY', () => { if (!stagingHoldsResult()) flow.play(); });
  // R キー: リザルト表示中に新しい100回転を始める
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

  /* ── デバッグ用の強制発火(2026-08-14 追加)────────────────────────
   * 検証担当が確認できるよう、フリーズ・風・予兆パターンを手で出せるようにする。
   * どれも「見たいものを見る」ための入口で、ゲームの期待値は変えない。
   */
  // F: 次の1レバーONで必ずフリーズ。強制でも drawFreeze は同じだけ引くのでRNGはズレない
  input.on('DEBUG_FREEZE', () => flow.forceFreeze());
  // W: 「風が子役を運んでくる」演出をその場で再生(液晶アニメを直接叩く)
  input.on('DEBUG_WIND', () => {
    lcdAnims.play('edge_wind_carry', { symbol: 'BELL', count: 2, strength: 1, dir: -1 });
    flow.telop = '[DEBUG] 風の演出(EC2 ×2 / 金)';
  });
  /* Z X C V: RUSH 4種へ強制突入(U11)。
   * ヒーローRUSHは 1/50 × RUSH突入率で普通は踏めないので、検証用の入口を用意する。
   * modes.forceMode はスタックを畳んで入り直すだけなので、ゲームの期待値は変えない
   * (デバッグで入ったぶんの出玉は当然乗る)。 */
  DEBUG_RUSH_KEYS.forEach((d, i) => {
    input.on(`DEBUG_RUSH_${i + 1}`, () => {
      if (flow.isResult) return;
      modes.forceMode(d.mode, {});
      flow.telop = `[DEBUG] ${d.short} へ強制突入`;
    });
  });
  // P: 前兆の演出パターンを順送りで固定する(もう一度押すと次のパターン、一周で解除)
  input.on('DEBUG_ZENCHO', () => {
    // 抽選に出るパターンだけを順に回し、一周したら解除(null)へ戻る
    const ids = ZENCHO.patterns.filter((p) => p.weight.real > 0 || p.weight.fake > 0).map((p) => p.id);
    const cur = getDebugPattern();
    const nextIndex = cur === null ? 0 : ids.indexOf(cur) + 1;
    const next = nextIndex < ids.length ? ids[nextIndex] : null;
    setDebugPattern(next);
    flow.telop = next
      ? `[DEBUG] 前兆パターン固定: ${ZENCHO_PATTERN_BY_ID[next]?.name ?? next}`
      : '[DEBUG] 前兆パターン固定を解除';
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

  // 甘スロの入口とリザルトのバッジ(U44)。判定は data/ama.js の AMA_MODE が正。
  // flow を渡すのは「進行中の100回転を消す前に確認する」ためだけ(F9)
  setupAmaUi(flow);

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
      // リザルトを開くまでの溜め(U7)。演出と同じ時計で数える
      resultPanel.update(dt);
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
        // 100回転スコアアタックの進行(リザルト描画を担当する後続タスク用)
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
        // V31-07: 当落を伏せている間は投入・レバーを受け付けないので、
        // ボタンも消灯させて「いまは押しても始まらない」を見た目で伝える
        canBet: flow.canBet && !lcdView.stageMasked,
        canLever: flow.canLever && !lcdView.stageMasked,
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
      //
      // U42: 全面占有演出が当落を伏せている間(液晶が1つ前の背景を出している間)は、
      // 下部パネルのテロップも黙る。液晶側だけ伏せてもモードのルール文
      // (「ALARM を発報させろ!」等)がここに出ていては、結局そこで当落がバレる。
      //
      // リザルトが開いた後は「成績を集計しています…」を残さない(2026-08-15 検証指摘 F18)。
      // 集計はもう終わって結果が画面に出ているので、事実と食い違う。
      // ゲーム側の flow.telop は触らず(モードの状態表示なので render から書かない)、
      // 表示するときだけ次の操作の案内へ差し替える。
      cabinet.setTelop(
        lcdView.stageMasked ? ''
          : resultPanel.isOpen ? RESULT_OPEN_TELOP
            : dedupeTelop(flow.telop, [
              ...(lcdAnims.getVisibleTexts?.() ?? []),
              ...getAmbientTexts(),
            ]),
      );
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
          // HUD のラベル(GAME 残り)と用語を揃える(2026-08-14 しおん指摘 S9)
          `残り${flow.spinsLeft}回転`,
          `${modes.currentId}${extra}${dc}`,
          `${flow.state}`,
          `G:${flow.stats.games} 差枚:${credit.diff >= 0 ? '+' : ''}${credit.diff}`,
          `fx:${timeline.activeIds.length}`,
          /*
           * V31-07 の入力ガードが効いている瞬間の目印(2026-08-15 検証指摘 F22)。
           * 「全面占有演出が当落を伏せている = BET/レバーを受け付けない」窓は
           * 数百msしかなく、外から見て効いているかを確かめる手段が無かった。
           * mask が立っている間だけ 1文字出す(通常プレイでは何も増えない)。
           */
          ...(lcdView.stageMasked ? ['mask:ON'] : []),
          `seed:${rng.seed}`,
          `${loop.fps}fps`,
        ].join('  ');
      }
    },
  });
  loop.timeScale = params.turbo;
  loop.start();

  // ── 起動画面のフェード ──────────────────────
  // 筐体アート(loadUiAssets)の解決を待ってから #boot-screen を隠す。
  // 回線が遅い/失敗しても詰まないよう、最大4秒でタイムアウトして強制表示する
  // (その場合はCSSフォールバック筐体が見えるが、無反応で止まるよりはよい)。
  const bootTimeout = new Promise((resolve) => setTimeout(resolve, 4000));
  Promise.race([uiAssetsReady, bootTimeout]).then(revealApp, revealApp);

  console.info(
    `[JAWSLOT] 起動しました  seed=${rng.seed}  turbo=x${params.turbo}  mode=${startMode}` +
    `  シナリオ:${SCENARIOS.length}件${params.noFx ? ' (演出OFF)' : ''}` +
    (symbols.usedPlaceholder.length > 0
      ? `\n  プレースホルダ絵柄: ${symbols.usedPlaceholder.join(', ')}`
      : ''),
  );

  // デバッグ用にグローバル公開(コンソールから触れるように)
  window.AWSLOT = {
    flow, modes, credit, reels, rng, bus, loop, layers, symbols,
    director, timeline, chars, lcdAnims, cutins, SCENARIOS, FLAG_BY_ID,
    audio, voice, lcdView,
    /**
     * V31-07 の入力ガードが今かかっているか(2026-08-15 検証指摘 F22)。
     * 「全面占有演出が当落を伏せている間は BET/レバーを受け付けない」窓は
     * 数百msしかなく、外から観測する手段が無かった。
     * ポーリングでこれを見れば「効いていること」を実プレイで確かめられる。
     *   setInterval(() => AWSLOT.isInputMasked() && console.log('masked'), 16)
     */
    isInputMasked: () => Boolean(lcdView.stageMasked),
    /** 次の1レバーONを必ずフリーズにする(F キーと同じ) */
    forceFreeze: () => flow.forceFreeze(),
    /**
     * 前兆の演出パターンを固定する。null で解除。
     *   AWSLOT.setZenchoPattern('bill_shock')
     * 固定してもゲーム抽選RNGの消費数は変わらないので出目は動かない。
     */
    setZenchoPattern: (id) => setDebugPattern(id),
    /** 固定できるパターンID一覧(コンソールでの確認用) */
    zenchoPatterns: ZENCHO.patterns.map((p) => p.id),
  };
}

boot().catch((err) => {
  console.error('[JAWSLOT] 起動に失敗しました', err);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:0;z-index:99;color:#ff8080;background:#100;padding:24px;font-size:14px;white-space:pre-wrap;';
  el.textContent = `JAWSLOT の起動に失敗しました\n\n${err?.stack ?? err}`;
  document.body.appendChild(el);
});
