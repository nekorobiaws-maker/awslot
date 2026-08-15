/**
 * RESULT. 100回転スコアアタックのリザルト。docs/BACKLOG.md 「M: メカニクス改修」
 *
 * 100回転を使い切った時点で GameFlow が全モードを畳んでここへ移す。
 * このモードはゲームが進まない終端状態で、次の入力(R / レバー / ↑)で
 * 新しいセッションが始まる。
 *
 * ■ このファイルは「数字を保持するだけ」
 *   リザルト画面の描画は後続タスク(P2)の担当。ここでは描画に必要な値を
 *   すべて state に載せておくことに徹する。
 *   `state.stage` には既存のステージID(stage_prov)を入れてある。
 *   render/lcd.js は未知の modeId を default 分岐で通常時として描くため、
 *   専用描画が入るまでの間も背景が欠けたり例外になったりしない。
 */

import { SESSION } from '../../data/session.js';
// 称号(U56)。刻みと名前は data/titles.js が唯一の正で、ここは引くだけ
import { titleOf } from '../../data/titles.js';

export const result = {
  id: 'RESULT',
  name: 'RESULT',
  type: 'RESULT',

  onEnter(state, params = {}) {
    state.short = 'RESULT';
    /** 既存ステージIDを入れておく(専用描画が入るまでのフォールバック) */
    state.stage = 'stage_prov';

    /** セッションのスコア = 差枚(買い取りを含む) */
    state.score = Math.round(params.score ?? 0);
    /** 買い取り前の差枚 */
    state.baseScore = Math.round(params.baseScore ?? 0);
    /** 買い取り合計枚数 */
    state.buyout = Math.round(params.buyout ?? 0);
    /** 買い取り明細 [{label, kind, games, perGame, coins}] */
    state.breakdown = params.breakdown ?? [];
    /** 終了時点のクレジット */
    state.finalCredit = params.finalCredit ?? 0;
    /** 総投入 / 総払出(検証用) */
    state.totalIn = params.totalIn ?? 0;
    state.totalOut = params.totalOut ?? 0;
    /** 消化した回転数(= SESSION.totalGames) */
    state.totalGames = params.totalGames ?? SESSION.totalGames;
    /**
     * 甘スロ(U44 / ?ama=1)で遊んだセッションか。
     *
     * 通常設定とはレア役の出現率(= 初当りの重さ)が違うので、
     * **同じスコアでも意味が違う**。表示担当はここを見てリザルトに
     * 「甘スロ設定」のバッジを出す(ランクの刻み自体は共通のまま)。
     */
    state.ama = params.ama ?? SESSION.ama;
    state.amaLabel = SESSION.amaLabel;
    state.amaBadge = SESSION.amaBadge;
    state.amaNote = SESSION.amaNote;
    /** セッション中の戦績 */
    state.bonusCount = params.bonusCount ?? 0;
    state.atCount = params.atCount ?? 0;
    state.czCount = params.czCount ?? 0;
    state.zoneCount = params.zoneCount ?? 0;
    state.endingCount = params.endingCount ?? 0;
    /** 終了時に滞在していたモード(「途中で終わった」表示に使う) */
    state.endedIn = params.endedIn ?? null;
    /**
     * スコアの評価ランク。
     * 到達率は設定ごとに違う(通常 S 3% / 甘スロ S 6%)ので、
     * **遊んだ設定を渡して解決済みの rate をもらう**(2026-08-14 検証 major)。
     */
    state.rank = rankOf(state.score, state.ama);

    /**
     * 称号(2026-08-15 ユーザー指示 U56)。
     *
     * RANK が「スコア帯の格付け」なのに対して、称号は「その回の打ち手の呼び名」。
     * AWS コミュニティの肩書を低→高に7段(Certified 〜 Heroes)並べてある。
     * **刻みも名前も data/titles.js が唯一の正**で、ここは引くだけ。
     * 甘スロは amaMin(別の刻み)で解決される。
     * 表示は render/resultpanel.js が RANK 行とは別の行で静かに出す。
     */
    state.honor = titleOf(state.score, state.ama);

    /**
     * リザルト直前のテロップ(2026-08-14 ユーザー指摘 U7)。
     *
     * 以前はここでスコアを先に言ってしまっていたため、
     * 「終わった」と気づく前に結果だけが目に入る唐突な終わり方だった。
     * 枚数はリザルトパネル(render/resultpanel.js)が数秒後に見せるので、
     * ここは「集計している最中」であることだけを伝える幕にする。
     *
     * U8(二重表示の排除):
     * 「n ゲーム終了」はポップアップ(data/scenarios/session.js の
     * "n GAMES FINISH")の担当なので、テロップでは繰り返さない。
     * テロップは持続的な状態 = いま集計中、を出す。
     */
    state.telop = '成績を集計しています…';
  },

  /** 終端状態なのでゲームは進まない(flow 側で BET も止めている) */
  onGame() {
    return null;
  },

  residualValue() {
    return [];
  },
};

/**
 * スコアのランク定義。平均220〜340枚・上位1% 1,250枚超という
 * 分散設計(BACKLOG「M」/ U50 で上限つきへ)に合わせた刻み。**上から順に判定する**。
 *
 * ── rate(到達率)について(2026-08-14 しおん指摘 V1)────────────────
 *
 * 検証で「seed=1234 も seed=7 も RANK S だった。S が実質必ず出るのでは」
 * という指摘が挙がった。実測すると **S 以上はセッションの約4%** で、
 * 2連続で引いたのは偶然(その2シードがたまたま上位帯だった)だった。
 * ヘッドレスとブラウザは同じ GameFlow・同じシードなので出目は完全に一致し、
 * `node scripts/sim.mjs --session` の分布がそのまま実プレイの分布になる。
 * これは `node scripts/compare-drivers.mjs` が機械的に証明している
 * (同じシードで sim の回し方 / ブラウザの回し方 / 人の打ち方 の3通りを回して
 *  スコアが1枚も違わないことを確認する。2026-08-14 追加)。
 *
 * ただし「RANK S と言われても、それがどれくらい凄いのか画面から分からない」
 * という体感の問題は本物なので、**各ランクに到達率を併記する**ことにした。
 * これで「S = 33回に1回」「re:INVENT = 200回に1回」が一目で伝わる。
 *
 * rate は `node scripts/sim.mjs --session=20000` の
 * 「スコアランクの到達率」表を丸めた値。**閾値やバランスを動かしたら必ず更新すること**
 * (sim は毎回この表を出すので、ズレていればすぐ気づける)。
 */
/*
 * rate / amaRate の実測(2026-08-15 / **U63(レア役さらに2倍)の着地後**)。
 * `node scripts/sim.mjs --session=20000 777` と `--session=20000 555` の平均を丸めた値。
 *
 *   通常設定  REINVENT 0.44% / S 2.57% / A 8.28% / B 24.3% / C 18.0% / D 25.8% / E 20.6%
 *   甘スロ    REINVENT 1.99% / S 7.29% / A 13.4% / B 24.4% / C 16.7% / D 33.4% / E  2.9%
 *             (同じコマンドに `--ama` を付けて測る)
 *
 * 【U63 で甘スロの下位ランクが大きく動いた】
 * 甘スロはレア役が **通常設定の2倍 = 従来比8倍**(1/3.1)になり、
 * 初当り 1/62・プラス収支率 97% なので **マイナスで終わる回がほぼ消えた**。
 * THROTTLED(E)は 9.3% → **2.9%**、COLD START(D)が 29.3% → **33.4%** へ。
 *
 * 【U50 後の値(U63 の直前値)】
 *   通常設定  REINVENT 0.46% / S 2.82% / A 8.71% / B 24.9% / C 17.3% / D 25.2% / E 20.8%
 *   甘スロ    REINVENT 2.00% / S 6.48% / A 13.4% / B 23.6% / C 15.9% / D 29.3% / E  9.3%
 *
 * 【U50 前の値(更新し忘れの実例として残す)】
 *   通常設定  REINVENT 0.30% / S 3.80% / A 7.05% / B 22.6% / C 19.3% / D 26.2% / E 20.8%
 *   甘スロ    REINVENT 2.16% / S 8.66% / A 10.8% / B 22.1% / C 17.6% / D 29.6% / E  9.0%
 *
 * 【U48前の値(更新し忘れの実例として残す)】
 *   通常設定  REINVENT 0.33% / S 3.70% / A 6.66% / B 21.1% / C 21.9% / D 22.4% / E 23.9%
 *   甘スロ    REINVENT 2.18% / S 7.25% / A 9.63% / B 20.6% / C 18.8% / D 25.3% / E 16.2%
 *   U48 でレア役を2倍にした後もここを直しておらず、
 *   甘スロの E が「表示16% / 実測9.3%」= 画面が実測の約1.7倍を名乗っていた
 *   (2026-08-15 検証指摘)。sim は毎回この表を出すので、必ず突き合わせること。
 *
 * ── 2つ持っている理由(2026-08-14 検証 major)────────────────────
 * 甘スロ(?ama=1)はレア役の出現率が2倍で **初当りが 1/96 → 1/60** と別物なので、
 * 同じ「RANK S」でも到達率がまるで違う(3% ↔ 6%)。
 * 甘スロで遊んだ人に通常設定の 3% を見せると、画面が事実と異なる数字を名乗ることになる。
 * そこで rankOf(score, ama) が **その設定の実測値** を `rate` に解決して返し、
 * 表示側(render/resultpanel.js)は解決済みの rank.rate をそのまま出すだけにしてある。
 * **閾値やバランスを動かしたら、通常と --ama の両方を測って2列とも更新すること。**
 */
/*
 * 【U50(2026-08-15)/ 分布の圧縮に合わせて刻みと到達率を引き直した】
 *
 * U50 で「RUSH 1回の獲得は p99 800枚以下」という上限を入れたため、
 * セッションスコアの上が縮んだ(最高 3,398 → 2,277枚 / 上位0.1% 2,393 → 1,826枚)。
 * その結果、re:INVENT の 2,222枚は **20,000セッションで 0.01%** = 実質到達不能になった。
 * 刻みを新しい分布へ合わせ直してある:
 *   re:INVENT 2222 → **1500**(エンディングの差枚条件 data/modes.js の ENDING と同じ値)
 *   S 1000 / A 600 / B 300 / C 100 は据え置き(実測がそれぞれ 3% / 8% / 25% / 17% で妥当)
 * **re:INVENT の閾値は ENDING.conditions の diffCoins と必ず同じにすること。**
 * ここだけ動かすと「RANK re:INVENT なのにキーノートを見ていない」が起きる。
 */
export const RANKS = [
  { id: 'REINVENT', min: 1500, label: 're:INVENT KEYNOTE', color: '#ff2fa0', rate: '0.4%', amaRate: '2%' },
  { id: 'S',        min: 1000, label: 'MULTI-REGION',      color: '#ffd166', rate: '3%',   amaRate: '7%' },
  { id: 'A',        min: 600,  label: 'AUTO SCALING',      color: '#7bf7d0', rate: '8%',   amaRate: '13%' },
  { id: 'B',        min: 300,  label: 'STEADY STATE',      color: '#8ab4ff', rate: '24%',  amaRate: '24%' },
  { id: 'C',        min: 100,  label: 'WARM POOL',         color: '#c8d2e8', rate: '18%',  amaRate: '17%' },
  { id: 'D',        min: 1,    label: 'COLD START',        color: '#9aa6bf', rate: '26%',  amaRate: '33%' },
  { id: 'E',        min: -Infinity, label: 'THROTTLED',    color: '#7a8399', rate: '21%',  amaRate: '3%' },
];
/** U63(レア役さらに2倍)の直前の到達率。刻み(min)は据え置きで表示だけが変わった */
export const PREVIOUS_RANK_RATES_U50 = [
  { id: 'REINVENT', rate: '0.5%', amaRate: '2%' },
  { id: 'S', rate: '3%', amaRate: '6%' },
  { id: 'A', rate: '9%', amaRate: '13%' },
  { id: 'B', rate: '25%', amaRate: '24%' },
  { id: 'C', rate: '17%', amaRate: '16%' },
  { id: 'D', rate: '25%', amaRate: '29%' },
  { id: 'E', rate: '21%', amaRate: '9%' },
];
/** U50(分布の圧縮)の直前の刻み。戻すときの基準として保持 */
export const PREVIOUS_RANKS_U49 = [
  { id: 'REINVENT', min: 2222, rate: '0.3%', amaRate: '2%' },
  { id: 'S', min: 1000, rate: '4%', amaRate: '9%' },
  { id: 'A', min: 600, rate: '7%', amaRate: '11%' },
  { id: 'B', min: 300, rate: '23%', amaRate: '22%' },
  { id: 'C', min: 100, rate: '19%', amaRate: '18%' },
  { id: 'D', min: 1, rate: '26%', amaRate: '30%' },
  { id: 'E', min: -Infinity, rate: '21%', amaRate: '9%' },
];

/**
 * スコアからランクを引く。
 *
 * 返す `rate` は **遊んだ設定の到達率**(甘スロなら amaRate)に解決済み。
 * 表示側は設定を気にせず rank.rate を出せばよい。
 *
 * @param {number} score セッションの差枚
 * @param {boolean} [ama] 甘スロ(U44)のセッションか
 * @returns {{id:string,label:string,color:string,rate:string,ama:boolean}}
 */
export function rankOf(score, ama = false) {
  const r = RANKS.find((x) => score >= x.min) ?? RANKS[RANKS.length - 1];
  return { ...r, rate: ama ? r.amaRate : r.rate, ama: !!ama };
}
