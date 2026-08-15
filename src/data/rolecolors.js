/**
 * 役色マップ(2026-08-15 ユーザー指示 U62)。**液晶に出す「結論行」の色は必ずここを参照する。**
 *
 * ══ なぜ1か所に集約するのか ═══════════════════════════════════════
 *
 * 「文字色が出た = その役が成立した」というルール(U9)は、
 * 色が台の中で1対1に保たれて初めて情報になる。ところが実際には
 *   yokoku-aruaru.js  FLAG_COLOR
 *   yokoku-bedrock.js COLOR_CHERRY / COLOR_MELON / …
 *   yokoku-batch3.js  COLOR_CHERRY / COLOR_MELON / COLOR_LAMBDA
 *   yokoku-wind.js    DC_HITS[].color(直書き)
 * と **同じ値の写しが4か所以上**にあり、
 *   ・チャンス目が黄(#ffd95e)の場所と金(#ffe066)の場所に分かれる
 *   ・チェリー成立なのに「IAM 到着」が金文字(= 役色ではない)
 * という取りこぼしが出ていた。写しを増やさないよう、色はこのファイルだけが持つ。
 *
 * ── 使い方 ──────────────────────────────────────────────────
 *   import { ROLE_COLORS, colorForFlag, conclusionCue } from '../rolecolors.js';
 *
 *   // 成立役が1つに決まる結論行
 *   conclusionCue({ flag: 'MELON', text: 'S3 到着', sub: '風がオブジェクトを運んできた' })
 *   // ハズレ(何も成立していない)を言い切る結論行
 *   conclusionCue({ flag: 'LOSE', text: '接続できなかった…', sub: 'リンクが上がらないまま終わった' })
 *
 * ── 色の決め方 ──────────────────────────────────────────────
 * 起点は data/zencho.js の ZENCHO_TEXT_COLORS.SYMBOL(スイカ=緑 / チェリー=赤)と
 * data/symbols.js の絵柄色。暗い液晶の上で読める明度へ寄せてある。
 * **ユーザー指定(U62)**:
 *   スイカ=緑 / 弱チェ・強チェ=赤 / チャンス目=黄 / サメ=水色 / ゴースト=紫 /
 *   ベル・リプレイ=絵柄準拠 / **ハズレ=白**
 * 煽り(まだ結論を出していない行)の装飾色はこの表に縛られない。
 */

/**
 * 成立役 → 結論行の文字色。キーは data/flags.js の成立役ID。
 *
 * 【色を足す/変えるときの約束】
 *   1. ここだけを直す(シナリオ側に16進を書かない)
 *   2. 1色が2つの役を指さないこと(色が情報でなくなる)
 *   3. 液晶(暗い地)で読める明度にすること
 */
export const ROLE_COLORS = {
  /** ハズレ = 何も成立していない。U62 で灰(#96a3b3)から **白** へ統一 */
  LOSE: '#ffffff',
  /** 弱チェリー(IAM)= 赤。ZENCHO_TEXT_COLORS.SYMBOL.CHERRY と同値 */
  WEAK_CHERRY: '#ff4d4d',
  /** 強チェリー(IAM金)も同じ赤。「チェリー系 = 赤」を崩さない */
  STRONG_CHERRY: '#ff4d4d',
  /** スイカ(S3)= 緑。ZENCHO_TEXT_COLORS.SYMBOL.MELON と同値 */
  MELON: '#4ce0a0',
  /** チャンス目(Lambda)= 黄。絵柄タイルの地色 #ffd95e と同色 */
  CHANCE: '#ffd95e',
  /** サメ揃い(BAR)= 水色。絵柄の accent #8ad4ff と同色 */
  SHARK: '#8ad4ff',
  /** ゴースト揃い(幽霊7)= 紫。絵柄の bg2 #7a2fd0 を液晶で読める明度へ */
  GHOST: '#c49bff',
  /** ベル(EC2)= 絵柄準拠。金 #f0a500 を一段明るく */
  BELL: '#ffab2e',
  /** リプレイ(DynamoDB)= 絵柄準拠。青 #5b8ef5 を一段明るく */
  REPLAY: '#7aa8ff',
  /** リプレイ2(Route 53)= 絵柄準拠。コンパスの緑青 #25a97f を明るく */
  REPLAY2: '#4ad6a6',
  /** Bedrock(生成AI)= 絵柄の accent #38e8c8 と同色 */
  ALARM: '#38e8c8',
};

/**
 * シナリオの中で役ではなく「テーマ」で呼びたい場合の別名。
 * 例: Direct Connect の成立側は「チェリーの色」ではなく「IAM の色」と書けたほうが読める。
 * 値は必ず ROLE_COLORS を参照する(写しを作らない)。
 */
export const ROLE_COLOR_ALIASES = {
  /** IAM(チェリー) */
  CHERRY: ROLE_COLORS.WEAK_CHERRY,
  /** S3(スイカ) */
  S3: ROLE_COLORS.MELON,
  /** Lambda(チャンス目) */
  LAMBDA: ROLE_COLORS.CHANCE,
  /** BAR(サメ揃い) */
  BAR: ROLE_COLORS.SHARK,
  /** 幽霊7(ゴースト揃い) */
  GHOST7: ROLE_COLORS.GHOST,
  /** Bedrock 役 */
  BEDROCK: ROLE_COLORS.ALARM,
  /** 何も成立していない */
  MISS: ROLE_COLORS.LOSE,
};

/**
 * 成立役(または別名)から結論行の色を引く。
 *
 * 配列を渡すと「その全部が同じ色であること」を要求し、
 * 食い違っていたら **ハズレ色ではなく最初の色** を返す
 * (弱チェ/強チェのように同色でまとめる書き方を素直に通すため)。
 * 未知のキーは白(= 役を名乗らない)。
 *
 * @param {string|string[]} flag 成立役ID / 別名 / それらの配列
 * @returns {string} 16進カラー
 */
export function colorForFlag(flag) {
  const one = (f) => ROLE_COLORS[f] ?? ROLE_COLOR_ALIASES[f] ?? ROLE_COLORS.LOSE;
  if (Array.isArray(flag)) return flag.length > 0 ? one(flag[0]) : ROLE_COLORS.LOSE;
  return one(flag);
}

/**
 * 結論行の既定表示時間[ms]。
 *
 * sticky なので実際の寿命は「次のレバーONまで」だが、
 * lcdanims.js は ms を **最低表示時間の下限**としても使う(短い文言でも読める尺を保つ)。
 */
export const CONCLUSION_MS = 1400;

/**
 * 予兆/分岐演出の「結論行」を1本作る(2026-08-15 ユーザー指示 U57)。
 *
 * ══ 全予兆共通のライフサイクル ═══════════════════════════════════
 *
 *   出す  … **第3リール停止(stop3)**。ここが当落の確定点なので、
 *           結論をこれより早く出すと「結果の画は当落確定イベントのみ」に反する。
 *   消す  … **次のゲームのレバーON**(sticky: true)。
 *           lcdanims.js の onStageEvent('leverOn') が解除するので、
 *           結論は1ゲームだけ画面に残り、次の回転が始まると必ず消える。
 *
 * 「結論行」= そのゲームで何が起きたか(成立役 / ハズレ)を言い切る行のこと。
 * 途中経過や煽り(まだ何も言い切っていない行)はこの関数を使わず、
 * 今までどおり `at:` で出してよい。**言い切る行だけ**をここに通す。
 *
 * @param {object} p
 * @param {string|string[]} p.flag 成立役ID / 別名。色はこれだけで決まる(U62)
 * @param {string} p.text メイン行
 * @param {string} [p.sub] サブ行
 * @param {number} [p.after] stop3 から何ms後に出すか(既定 140 = 停止音とずらす)
 * @param {number} [p.ms] 最低表示時間(既定 CONCLUSION_MS)
 * @param {string} [p.color]
 *   **役を1つに絞れない結論行だけ**の逃がし弁(例: 強チェリーとチャンス目の
 *   どちらでも出る中版)。役色を使うと「その色 = その役」が嘘になるので、
 *   そういう場合に限り中立色を明示する。**役が1つに決まるなら絶対に使わないこと**
 *   (使った瞬間に色の一元管理が崩れる)。
 * @returns {object} cues へそのまま置けるキュー
 */
export function conclusionCue({
  flag, text, sub = '', after = 140, ms = CONCLUSION_MS, color = null,
} = {}) {
  return {
    waitFor: 'stop3',
    after,
    layer: 'lcd',
    action: 'text',
    params: {
      text,
      sub,
      color: color ?? colorForFlag(flag),
      ms,
      /** U57: 結論は次のゲームのレバーONで消える(それまでは残す) */
      sticky: true,
    },
  };
}

/**
 * 役を1つに絞れない中版の結論行で使う中立色(既存の中色 #ffe066)。
 * **役色ではない**ので「この色 = この役」とは読ませない。
 */
export const COLOR_NEUTRAL_MID = '#ffe066';

export default ROLE_COLORS;
