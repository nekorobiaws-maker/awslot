/**
 * Amazon Polly マイクテスト予告(prefix `yp_`)。2026-08-15 ユーザー指示 U61。
 *
 * ※ 用語(2026-08-15 椿レビュー #14): この台で
 *     「予兆」= 当選を数ゲーム保持している **状態**(data/zencho.js の仕組み)
 *     「予告」= 1ゲームで完結する **演出**(このファイル)
 *   を指す。ここは leverOn で始まり第3停止で終わる1ゲーム完結なので「予告」。
 *
 * ══ 何をする演出か ═══════════════════════════════════════════════
 *
 *   レバーON        … 「マイクテスト中…」(サブ: Amazon Polly)が出る。
 *                     **成立側もハズレ側も完全に同じ入り**なので、
 *                     始まった時点では当落が一切読めない。
 *   第3停止(stop3) … 読み上げられた1文が出る。**その1文がそのゲームの結果**:
 *
 *     | 読み上げられた文        | 意味                | 色 |
 *     |------------------------|--------------------|----|
 *     | 「本日は晴天なり」       | ハズレ(何も成立せず) | 白 |
 *     | 「本日はスイカなり」     | スイカ(S3)成立     | 緑 |
 *     | 「本日はチェリーなり」   | チェリー(IAM)成立  | 赤 |
 *     | 「本日はLambdaなり」    | チャンス目成立       | 黄 |
 *     | 「本日はサメなり」       | サメ揃い成立         | 水 |
 *
 * 元ネタは音声機器のマイクテストの定番句「本日は晴天なり」。
 * **正常に読み上げが終わった = 何も起きなかった** という言い換えで、
 * 読み上げ内容が絵柄名に化けたときだけ、その役が成立している。
 *
 * ══ 嘘をつかない作り ═══════════════════════════════════════════════
 *
 * ■ 成立系は **その役が成立したゲームでしか出ない**(when.flag で縛る)
 *   運ばれてくる文と成立役が1対1に対応する。取りこぼし無し仕様なので
 *   「成立している = 必ず揃う」が成り立ち、読み上げと停止形は食い違わない
 *   (yokoku-wind.js の「風が絵柄を運ぶ」と同じ担保のしかた)。
 *
 * ■ ハズレ系(「本日は晴天なり」)は LOSE_WHEN でしか出さない
 *   ここで言い切る「ハズレ」は **何も成立していない** ことだけを指す。
 *   当選(CZ / ボーナス)の有無には一切触れないが、
 *   それでも「何も起きなかった」と読まれるので、
 *   yokoku-bedrock.js / yokoku-batch3.js と同じ4条件で
 *   **当選が生まれる経路を全部塞いだゲーム**に限定してある(下の LOSE_WHEN)。
 *
 * ■ 片側だけのネタは作らない
 *   ハズレ版と成立版で入りが同じなので、片方しか無いと
 *   「この入りが出た = 結果が読める」になってしまう。5本セットで1つの演出。
 *
 * ══ 色と結論のライフサイクル(U57 / U62)═══════════════════════════
 *   色   … data/rolecolors.js(ハズレ=白 / スイカ=緑 / チェリー=赤 /
 *          チャンス目=黄 / サメ=水色)。**ここに16進を書かない**
 *   出す … 第3停止(当落確定)
 *   消す … 次のゲームのレバーON(sticky)
 * conclusionCue() を通すだけで3つとも満たせる。
 *
 * ══ 発火量(U5: 予告の総量を増やさない)═══════════════════════════
 *
 * この演出を足すにあたり、**同じ Polly ネタだった `ya_polly_readout_weak`
 * (yokoku-ai.js / weight 55・chance 0.35)を退役させている**。
 *   ・同じサービスの演出が2種類あると「Polly が出た」の意味が薄まる
 *   ・あちらは「Polly: SPEAKING…」→「本日は晴天なり」を **レバーONの1秒間で
 *     出し切る**作りで、U57 の「結論は第3停止」に合わない
 * つまり **入れ替え** であって純増ではない。
 *
 * weight の考え方は yokoku-wind.js の Direct Connect 2択と同じ:
 *   ハズレ側 … LOSE プールの他の弱予告と同じ chance(0.26)を持たせる。
 *              chance 付きの候補が1本増えるだけなので、プール全体の
 *              発火量は動かない(取り分の按分)。
 *   成立側   … レア役プールは元から chance 無し(必ず1本出る)なので付けない。
 *              重みの取り合いになるだけで総量は不変。
 * 実測(director の _matches をそのまま使った机上計算 / 通常時1ゲームあたりの
 * 予告発火率): **追加前 0.4671 → 追加後 0.4671**(据え置き)。
 *
 * ══ 文言(U25 の3条件)═════════════════════════════════════════════
 *   ① 初見で意味が分かる … マイクテストの定番句をもじるだけ
 *   ② AWSネタが入る     … サブ行に Amazon Polly(実在の音声合成サービス)
 *   ③ 事実に反しない     … 読み上げの成否も速度も数値を名乗らない。
 *                          「音声合成が文章を読み上げる」は Polly の実機能そのもの。
 *
 * ══ デバッグ ═══════════════════════════════════════════════════════
 *   `?polly=1` … このシリーズを最優先で出す(他の予告を押しのける)
 *   `?polly=melon` のようにキー(lose / melon / cherry / lambda / shark)指定も可。
 *   強制中は weight を跳ね上げ、chance を外す。**when は緩めない**ので、
 *   成立側を見たいときは強制成立キー(1〜4 / 7)と併用すること。
 */

// 天井(Auto Recovery)のゲーム数。data/modes.js が唯一の正
import { NORMAL_SUBSTATES } from '../modes.js';
import { colorForFlag, conclusionCue } from '../rolecolors.js';

/** 導入(マイクテスト中…)の色。中立 = まだ何も言い切っていない */
const COLOR_INTRO = '#cfe0ff';

/** ハズレ寄りプールに合わせた発火率(yokoku-wind.js の DC ハズレ側と同値) */
const CHANCE_LOSE = 0.26;

/**
 * 天井(Auto Recovery)に当たらないゲームの `modeState.games` 一覧。
 * 数え方は yokoku-bedrock.js / yokoku-batch3.js と同じ。
 */
const NOT_CEILING_GAME = Array.from(
  { length: Math.max(1, NORMAL_SUBSTATES.ceiling.games - 1) },
  (_, i) => i,
);

/**
 * 「このゲームは構造的に当たらない」条件。
 * 「本日は晴天なり」= 何も起きなかった、を名乗ってよいのはこの条件のときだけ。
 * 通常時に当選が生まれる経路4つを全部塞いである(詳しい根拠は
 * yokoku-bedrock.js の LOSE_WHEN のコメントが本家):
 *   1. 成立役契機の抽選     … flag: ['LOSE']
 *   2. ステージの毎ゲーム抽選 … subState: ['COLD_START']
 *   3. 天井の強制CZ          … games: NOT_CEILING_GAME
 *   4. レバーONフリーズ      … freeze: [false]
 * さらに前兆中も除外する(数ゲーム後の当選を保持していることがある)。
 */
const LOSE_WHEN = {
  event: 'leverOn',
  flag: ['LOSE'],
  mode: ['FREE_TIER'],
  match: {
    'modeState.zenchoActive': [false],
    'modeState.games': NOT_CEILING_GAME,
    'modeState.subState': ['COLD_START'],
    freeze: [false],
  },
};

/* ══ デバッグ強制発火 ═══════════════════════════════════════════ */

const FORCE_POLLY = (() => {
  try {
    if (typeof location === 'undefined' || !location?.search) return null;
    const v = new URLSearchParams(location.search).get('polly');
    return v ? v.trim() : null;
  } catch {
    return null;
  }
})();

/** そのキーが強制指定されているか */
const isForced = (key) => FORCE_POLLY != null
  && (FORCE_POLLY === '1' || FORCE_POLLY === 'on' || FORCE_POLLY === 'all' || FORCE_POLLY === key);

/** 強制中の weight(他の候補を確実に押し切る大きさ。他ファイルと同じ作法) */
const FORCE_WEIGHT = 200000;

/**
 * レバーONの入り(ハズレ版・成立版で **完全に共通**)。
 * ここに電飾やフラッシュを足すと入りの時点で当落が読めてしまうので、
 * **絶対に足さないこと**(yokoku-aruaru.js の introCues と同じ約束)。
 */
function introCues() {
  return [
    { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.45 } },
    { at: 0, layer: 'lcd', action: 'text',
      params: {
        text: 'マイクテスト中…', sub: 'Amazon Polly',
        color: COLOR_INTRO, ms: 1000, sticky: false,
      } },
  ];
}

/**
 * 成立側の定義。読み上げ文と成立役が1対1で対応する。
 *
 * key    … デバッグ強制(?polly=<key>)とシナリオIDに使う
 * flags  … この演出を出してよい成立役(= その役が成立したときだけ出る)
 * role   … data/rolecolors.js のキー。flags と必ず対応させること
 * line   … 読み上げられる1文
 * sub    … 何が起きたかの補足(AWS要素をここに置く)
 * weight … その役の leverOn プールから取る取り分
 */
const HITS = [
  {
    key: 'melon',
    flags: ['MELON'],
    role: 'MELON',
    line: '「本日はスイカなり」',
    sub: 'S3 成立 — 読み上げが置き換わった',
    /** スイカ(1/50)のレア役プールから約5%。yokoku-wind.js の DC 成立側と同水準 */
    weight: 320,
  },
  {
    key: 'cherry',
    flags: ['WEAK_CHERRY', 'STRONG_CHERRY'],
    role: 'WEAK_CHERRY',
    line: '「本日はチェリーなり」',
    sub: 'IAM 成立 — 読み上げが置き換わった',
    weight: 320,
  },
  {
    key: 'lambda',
    flags: ['CHANCE'],
    role: 'CHANCE',
    /* ユーザーの例示にあった「本日はLambdaなり」。チャンス目 = Lambda 絵柄 */
    line: '「本日はLambdaなり」',
    sub: 'チャンス目成立 — 読み上げが置き換わった',
    weight: 320,
  },
  {
    key: 'shark',
    flags: ['SHARK'],
    role: 'SHARK',
    line: '「本日はサメなり」',
    sub: 'サメ揃い成立 — 読み上げが置き換わった',
    /** サメは 1/600 の隠し玉。プールが薄いぶん取り分を厚めにしても総量は動かない */
    weight: 420,
  },
];

/** ハズレ版(正常に読み上げが終わる = 何も成立しなかった) */
function loseScenario() {
  const forced = isForced('lose');
  return {
    id: 'yp_polly_lose',
    name: '【弱】Polly マイクテスト(本日は晴天なり = ハズレ)',
    when: LOSE_WHEN,
    weight: { FREE_TIER: forced ? FORCE_WEIGHT : 150, default: 0 },
    ...(forced ? {} : { chance: CHANCE_LOSE }),
    /**
     * 【必須】結果告知(result)に化けさせないための明示。
     * 文言から推定させると、うっかり sticky キーワードを踏んだ側だけが
     * announce 枠を取って扱いが変わる(yokoku-wind.js の BLUE/GREEN の前科)。
     */
    priority: 'gimmick',
    duration: 2000,
    cues: [
      ...introCues(),
      { waitFor: 'stop3', after: 100, layer: 'sfx', action: 'synth', params: { preset: 'announce', gain: 0.5 } },
      // 読み上げ文なので成立側と同じ鉤括弧つきで揃える(見た目が同じ形式であることが芯)
      conclusionCue({
        flag: 'LOSE', text: '「本日は晴天なり」', sub: 'Amazon Polly — 読み上げは正常に終了した', ms: 1300,
      }),
    ],
  };
}

/** 成立版(読み上げが絵柄名に化ける)。色はその役の色 */
function hitScenario(h) {
  const forced = isForced(h.key);
  return {
    id: `yp_polly_hit_${h.key}`,
    name: `【中】Polly マイクテスト(${h.line} = ${h.flags.join('/')}成立)`,
    when: { event: 'leverOn', flag: h.flags, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: forced ? FORCE_WEIGHT : h.weight, default: 0 },
    // レア役の leverOn プールは元から chance なし(必ず1本出る)なので付けない = 総量不変
    priority: 'gimmick',
    duration: 2200,
    cues: [
      ...introCues(),
      { waitFor: 'stop3', after: 80, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { waitFor: 'stop3', after: 100, layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 120, layer: 'overlay', action: 'flash',
        params: { color: colorForFlag(h.role), ms: 200 } },
      conclusionCue({ flag: h.role, text: h.line, sub: h.sub, after: 140, ms: 1400 }),
    ],
  };
}

export default [loseScenario(), ...HITS.map(hitScenario)];
