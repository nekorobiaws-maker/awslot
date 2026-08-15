/**
 * Bedrock 生成予告(ybr_)。2026-08-15 ユーザー指示 U46b
 * 「Bedrock の生成演出に、結果と対応したパターンを増やして」。
 *
 * ══ 何をする演出か ═══════════════════════════════════════════════
 * レバーONで Bedrock が推論を始め(`bedrock_boot`)、**第3停止 = 当落が確定した後**に
 * 「生成された1行」が液晶へ出る。出た文章がそのままそのゲームの結果を表す:
 *
 *   | 生成された文章                       | 対応する結果        | 色 |
 *   |-------------------------------------|--------------------|----|
 *   | IAM が設定されます                    | チェリー(IAM)成立  | 赤 |
 *   | スイカの美味しい季節ですね              | スイカ(S3)成立     | 緑 |
 *   | チャンスかもしれません                 | チャンス目成立(CZ抽選中) | 黄 |
 *   | サメの群れが近づいています              | サメ揃い成立        | 水 |
 *   | クイズの時間です                      | クイズが始まる      | 青 |
 *   | gらlkrj晴lかjgらlk４エフェ４亜kれ        | ハズレ(出力が壊れた) | 灰 |
 *   | 今回は何も生成できませんでした           | ハズレ(空の出力)   | 灰 |
 *
 * ■ 嘘をつかない作り(ここが一番大事)
 *   成立系の文章は **その役が成立したゲームでしか出ない**(when.flag で縛る)。
 *   ハズレ系(文字化け / 空出力)は LOSE_WHEN でしか出さない。
 *   LOSE_WHEN は「このゲームで当選が起こる経路を全部塞いだ」条件になっている(下記)。
 *   当選を断言する語(確定・突入)はどのパターンでも使わない。
 *   「チャンスかもしれません」はチャンス目成立 = CZ抽選を受けているという事実の範囲。
 *
 * ══ なぜタイピング盤面(bedrock_typing)を使わないか ════════════════
 * `bedrock_typing` が流す文言は staging/anims/lcdanims-extra.js の `BEDROCK_LINES`
 * (tier ごとの配列)からアニメ側が抽選する作りで、**シナリオから文章を渡せない**。
 * data → staging の import は禁止(依存は staging → data の一方向)なので、
 * 「結果と1対1で対応した文章」はシナリオ側の lcd.text で出している。
 *   ・生成している画   … `bedrock_boot`(Amazon Bedrock のチップが起動する)
 *   ・生成された文章   … `lcd.text`(下敷きつきで必ず読める。V31-08 の教訓)
 * タイピング盤面の中で出したくなったら、演出担当が BEDROCK_LINES に
 * 結果対応の tier(例 'cherry' / 'melon' / 'broken')を追加し、
 * このファイルの when 条件をそのまま tier の出し分けに使えばよい。
 *
 * ══ 結論のライフサイクルと色(U57 / U62)══════════════════════════
 * 「生成された1行」は **そのゲームの結論** なので、
 *   出す = 第3停止(元からここ)/ 消える = 次のゲームのレバーON /
 *   色  = data/rolecolors.js の役色(ハズレ系は白)
 * を conclusionCue() で1本にまとめて満たしている。
 *
 * ══ 発火量(U5)═══════════════════════════════════════════════════
 * ハズレ系は chance: CHANCE_WEAK。ハズレ寄りプールの他の弱予告と同じ値を使っている。
 * 成立系は他のレア役予告と同じく chance なし(レア役プールは元から必ず1本出る)。
 * どちらも「候補が1本増える = 取り分の按分」でしかないので総量は動かない。
 * ※ chance には director の YOKOKU_CHANCE_SCALE が掛かって実効値になる。
 *   係数の値は staging/director.js が唯一の正。**ここに写さないこと**
 *   (0.6 前提の記述が U51 の 1.6 化で丸ごと嘘になった前科がある)。
 */

// 天井(Auto Recovery)のゲーム数。data/modes.js が唯一の正
import { NORMAL_SUBSTATES } from '../modes.js';
/*
 * 役色と結論行の作法は data/rolecolors.js が唯一の正(U57 / U62)。
 * 以前はこのファイルが COLOR_CHERRY … と写しを持っていたが、
 * 同じ値が4ファイルに散って「チャンス目が黄の場所と金の場所に分かれる」
 * といったズレが出たので集約した。**ここに16進を書かないこと**。
 */
import { ROLE_COLORS, colorForFlag, conclusionCue } from '../rolecolors.js';

/** ハズレ寄りプールに合わせた発火率(yokoku-batch3.js / batch4.js と同値) */
const CHANCE_WEAK = 0.245;

/**
 * Bedrock 役の色。クイズ導入(休止中)で使う。
 * ※ 以前ここは #8ad4ff(= サメ揃いの色)だった。同じファイルの中で
 *   「水色 = サメ揃い成立」と「水色 = Bedrock のクイズ導入」が同居しており、
 *   U9(色が出た = その役が成立した)に反していたので Bedrock 色へ直した
 *   (2026-08-15 検証指摘)。値は ROLE_COLORS.ALARM を参照する。
 */
const COLOR_BEDROCK = ROLE_COLORS.ALARM;

/**
 * 天井(Auto Recovery)に当たらないゲームの `modeState.games` 一覧。
 * 数え方は data/scenarios/quiz.js の NOT_CEILING_GAME と同じ。
 */
const NOT_CEILING_GAME = Array.from(
  { length: Math.max(1, NORMAL_SUBSTATES.ceiling.games - 1) },
  (_, i) => i,
);

/**
 * 「このゲームは構造的に当たらない」条件。
 * 壊れた出力(= ハズレ断定)を名乗ってよいのはこの条件のときだけ。
 *
 * 通常時に当選が生まれる経路は4つしかない。全部塞いでいる:
 *   1. 成立役契機のCZ/直撃抽選 … flag: ['LOSE'](CZ_ENTRY.table に行が無い役)
 *   2. ステージの毎ゲーム抽選  … subState: ['COLD_START']
 *      (NORMAL_SUBSTATES.czPerGame が 0 なのは通常ステージだけ。
 *       高確 0.030/G・激アツ 0.119/G は **成立役に一切依存せず** 走るので、
 *       ここを縛らないと「文字化けを出したゲームで当選していた」が起きる。
 *       2026-08-15 の実測で 全体2.58% / 高確4.03% / 激アツ12.43% 発生していた)
 *   3. 天井(Auto Recovery)の強制CZ … games: NOT_CEILING_GAME
 *   4. レバーONフリーズ … freeze: [false]
 *      (data/freeze.js の rateByFlag は LOSE でも 0 ではない。
 *       flow.js の leverOn payload が freeze を渡してくれるので、
 *       抽選済みの結果をそのまま見て除外できる)
 * さらに前兆中(数ゲーム後の当選を保持していることがある)も除外。
 *
 * ── ここを触るときの注意 ──
 * 上の4経路のどれかが増えたら、この条件にも1行足すこと。
 * 足せない経路が生まれたら、文言から「ハズレ」の断定を外す
 * (「出力が壊れた」までにして結果を名乗らせない)。
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

/**
 * クイズ盤面の導入で使う「生成された1行」。【休止中・文言は保全】
 *
 * data/scenarios/quiz.js が出題シナリオの頭で使っていたが、
 * U53(2026-08-15)でクイズの発生を止めたため **いまは誰も参照していない**。
 * 後継のリール3択は問いかけを盤面(reel_pick_choice)自身が出すので、
 * 導入のテキスト帯を使わない(告知プレートを「CZ突入」のために空けておくため)。
 * クイズを戻すときはこの定数もそのまま使える。
 */
export const BEDROCK_QUIZ_INTRO = {
  text: 'クイズの時間です',
  sub: 'Bedrock が問題を生成しました',
  color: COLOR_BEDROCK,
};

/** レバーONで Bedrock が起動する共通の入り(生成している画) */
const BOOT_CUES = [
  { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
  { at: 40,  layer: 'lcd', action: 'anim',  params: { anim: 'bedrock_boot' } },
];

export default [
  /* ══ 成立系(その役が成立したゲームでしか出ない)══════════════════ */

  {
    id: 'ybr_gen_cherry_iam',
    name: '【中】Bedrock生成(IAM が設定されます = チェリー成立)',
    when: { event: 'leverOn', flag: ['WEAK_CHERRY', 'STRONG_CHERRY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 52, default: 0 },
    duration: 2200,
    cues: [
      ...BOOT_CUES,
      { at: 0, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 80, layer: 'overlay', action: 'flash',
        params: { color: colorForFlag('WEAK_CHERRY'), ms: 200 } },
      conclusionCue({
        flag: 'WEAK_CHERRY', text: 'IAM が設定されます', sub: '推論の結果、権限が用意された',
      }),
    ],
  },

  {
    id: 'ybr_gen_melon_season',
    name: '【中】Bedrock生成(スイカの美味しい季節ですね = スイカ成立)',
    when: { event: 'leverOn', flag: ['MELON'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 52, default: 0 },
    duration: 2200,
    cues: [
      ...BOOT_CUES,
      { at: 0, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 80, layer: 'overlay', action: 'flash',
        params: { color: colorForFlag('MELON'), ms: 200 } },
      // 生成AIが世間話を返してくる、というネタ。スイカ(S3)が成立したときだけ出る
      conclusionCue({
        flag: 'MELON', text: 'スイカの美味しい季節ですね', sub: '推論の結果、世間話が出力された',
      }),
    ],
  },

  {
    id: 'ybr_gen_chance_cz',
    name: '【中】Bedrock生成(チャンスかもしれません = チャンス目成立)',
    // チャンス目は CZ抽選を受ける役なので「かもしれません」は事実の範囲。
    // 断定はしない(当選率そのものは data/modes.js の CZ_ENTRY.table を見ること。
    // 数字をここに写すと調整のたびに嘘になる)
    when: { event: 'leverOn', flag: ['CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2200,
    cues: [
      ...BOOT_CUES,
      { at: 0, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
      /*
       * 2026-08-15 ユーザー指示 U64-3: サブ行「チャンスゾーンの抽選を受けている」を削除。
       * 内部の抽選過程は画面に出す情報ではない(見えているのは成立役だけ)ため、
       * 生成された1行だけを残す。**サブ行を書き戻さないこと**。
       */
      conclusionCue({ flag: 'CHANCE', text: 'チャンスかもしれません', sub: 'Amazon Bedrock の生成結果' }),
    ],
  },

  {
    id: 'ybr_gen_shark_school',
    name: '【中】Bedrock生成(サメの群れが近づいています = サメ揃い成立)',
    when: { event: 'leverOn', flag: ['SHARK'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 40, default: 0 },
    duration: 2400,
    cues: [
      ...BOOT_CUES,
      { at: 0, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'shark_swim' } },
      { waitFor: 'stop3', after: 80, layer: 'overlay', action: 'flash',
        params: { color: colorForFlag('SHARK'), ms: 220 } },
      conclusionCue({
        flag: 'SHARK', text: 'サメの群れが近づいています', sub: '推論の結果、周囲の警戒レベルが上がった',
        after: 160, ms: 1500,
      }),
    ],
  },

  /* ══ ハズレ系(構造的に当たらないゲームでしか出ない)═══════════════ */

  {
    id: 'ybr_gen_lose_garbled',
    name: '【弱】Bedrock生成(文字化け = 出力が壊れた・ハズレ)',
    /*
     * ユーザー指定の「LLMが壊れて文字化けする」パターン。
     * 文字化けは **ハズレ専用**。LOSE_WHEN(当選しないことが構造的に確定する条件)で
     * しか出さないので、「壊れた出力が出た = このゲームは何も起きない」が保証される。
     */
    when: LOSE_WHEN,
    weight: { FREE_TIER: 58, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1800,
    cues: [
      ...BOOT_CUES,
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'error_buzz', gain: 0.4 } },
      // ユーザー指定の文字列をそのまま(半角と全角、かなと漢字が混ざった壊れ方)。
      // ハズレ断定なので色は白(U62)
      conclusionCue({
        flag: 'LOSE',
        text: 'gらlkrj晴lかjgらlk４エフェ４亜kれ',
        sub: '出力が壊れた — 推論をやり直します',
        after: 120, ms: 1300,
      }),
    ],
  },

  {
    id: 'ybr_gen_lose_empty',
    name: '【弱】Bedrock生成(空の出力・ハズレ)',
    // 文字化けと同じくハズレ専用。壊れ方の種類違いで単調さを避ける
    when: LOSE_WHEN,
    weight: { FREE_TIER: 54, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1800,
    cues: [
      ...BOOT_CUES,
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'error_buzz', gain: 0.32 } },
      conclusionCue({
        flag: 'LOSE',
        text: '今回は何も生成できませんでした',
        sub: '出力は空。次のプロンプトへ',
        after: 120, ms: 1200,
      }),
    ],
  },
];
