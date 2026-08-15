/**
 * プレミアカメオ「ルナ」の演出(prefix `lc_` = luna cameo)。DESIGN.md 6.5
 *
 * ■ どういう演出か
 *   ごく稀に、液晶の左端からルナ(assets/chars/luna.png)がひょっこり現れ、
 *   その回の成立役に合わせたポーズを決めて、すっと引っ込む。
 *   数百ゲームに1回しか出ない「出たら嬉しい」だけの枠で、
 *   出目にもゲーム進行にも一切影響しない。
 *
 * ■ 嘘をつかないための約束(最重要)
 *   ルナは **スイカ / チェリー / チャンス目 / 確定役が成立したゲームにしか出ない**。
 *   ベル・リプレイ・ハズレでは絶対に出ないので、
 *     「ルナが出た = レア役以上が確定」
 *   が条件だけで保証される(ガセ版は作らない)。
 *   さらに発火は **stop3(第3停止 = 当落が確定した瞬間)** なので、
 *   「結果の画は当落確定イベントのみ」の原則にも合っている。
 *
 * ■ ポーズと役の対応(色の約束 U9: スイカ=緑 / チェリー=赤)
 *   スイカ(S3)          → sign     「神アプデ!」看板 + 緑のきらめき
 *   弱チェリー(IAM)     → point     ニヤリ指差し + 赤寄りのきらめき
 *   強チェリー(IAM金)   → fire      炎オーラで拳(激アツ)
 *   チャンス目(Lambda)  → penlight  ヘッドホン+ペンライト + 水色の音符
 *   確定役(BAR / 幽霊7) → party     クラッカーでお祝い + 紙吹雪
 *   どの回も入りは peek(ひょっこり覗き)で統一していて、
 *   「何かいる → 誰? → ルナだ!」の3拍で読ませる。
 *
 * ■ 演出の交通整理(staging/director.js)との関係
 *   キューは char / sfx だけで、液晶(lcd)・全画面(overlay)・リール(reelfx)を
 *   一切使わない。したがって classifyScenario は 'ambient' と判定し、
 *     - 演出枠(1ゲーム2本)を消費しない
 *     - テロップを1文字も出さない(U8 の二重表示は原理的に起きない)
 *     - 予告シナリオを蹴落とさない
 *   = **予兆の合計頻度に影響しない**。
 *   加えて発火イベントが stop3 で、ここに他のシナリオは1本も居ないため、
 *   重み付き抽選で他の演出の枠を奪うこともない。
 *
 * ■ 頻度(2026-08-15 U58 でバランス担当の指示により **一律 1/4** へ)
 *   役の出現率 × ここの chance = カメオの発生率。
 *
 *   ── なぜ下げたか ────────────────────────────────────────
 *   設計当初の狙いは「数百ゲームに1回だけ」= 実測 **1/540ゲーム** だった。
 *   ところが U63 でレア役の出現率そのものを倍増させたため、
 *   chance を1つも触っていないのに カメオが **1/136ゲーム** まで軽くなり、
 *   「たまに出るから嬉しい」枠が「よく見る枠」になっていた。
 *   役の出現率は台のバランスそのものなので触れない → **こちら側を 1/4 にする**。
 *
 *   ── 机上計算(data/flags.js の FREE_TIER 側 denom で算出)──────
 *     旧 chance … 1/136ゲーム(軽すぎる)
 *     新 chance … **1/545ゲーム**(狙いの 1/400〜600 帯 / 設計当初は 1/540)
 *   内訳(役の出現率 × chance):
 *     スイカ       1/25    × 0.010  = 1/2500
 *     弱チェリー   1/12.5  × 0.0075 = 1/1667
 *     強チェリー   1/62.5  × 0.015  = 1/4167
 *     チャンス目   1/45    × 0.011  = 1/4091
 *     サメ揃い     1/300   × 0.088  = 1/3409
 *     ゴースト揃い 1/1500  × 0.088  = 1/17045
 *
 *   ── 内訳(chance は旧値 × 0.25。役の出現率は U63 後の実測ではなく設計値)──
 *     スイカ       0.040 → 0.010
 *     弱チェリー   0.030 → 0.0075
 *     強チェリー   0.060 → 0.015
 *     チャンス目   0.045 → 0.011
 *     確定役       0.350 → 0.088
 *   **6本の chance をまとめて 1/4 にしているので、役どうしの相対的な出やすさ
 *   (確定役の日にはルナも出やすい)は変えていない。**
 *
 * ■ scaleChance:false の理由
 *   director の YOKOKU_CHANCE_SCALE は予告の総量ノブ(値は staging/director.js が正)。
 *   このカメオは賑やかしではなく設計値そのものがレア度なので、対象外にしている。
 *   係数を掛けてしまうと、総量ノブを動かすたびにカメオの頻度まで釣られて動く
 *   (係数が 0.6 だった頃は 1/540 → 1/900 = 存在に気づけない領域まで落ちていた)。
 */

/* ══ デバッグ用の強制発火 ════════════════════════════════════
 *
 *   1. URL に ?luna=1 を付けて起動する
 *   2. または実行中に L キーを押す(押すたび ON / OFF が切り替わる)
 *
 * どちらも「レア役が成立したゲームでのみ必ず出す」という意味で、
 * 発火条件(when.flag)は緩めない。ルナ = レア役確定 の保証はデバッグ中も崩さない。
 * ?debug=1 と併用し、数字キー(3=スイカ / 1=弱チェリー / 2=強チェリー /
 * 4=チャンス目 / 7=サメ揃い / 8=ゴースト揃い)で役を強制すると狙って確認できる。
 */
export const LUNA_CAMEO_DEBUG = {
  force: typeof location !== 'undefined'
    && new URLSearchParams(location.search ?? '').get('luna') === '1',
};

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    if (String(e.key ?? '').toUpperCase() !== 'L') return;
    LUNA_CAMEO_DEBUG.force = !LUNA_CAMEO_DEBUG.force;
    console.info(
      `[luna] カメオ強制発火 ${LUNA_CAMEO_DEBUG.force ? 'ON' : 'OFF'}` +
      '(レア役が成立したゲームでのみ発動します)',
    );
  });
}

/** 強制発火中は必ず出す。それ以外は設計どおりの確率 */
const rate = (p) => (LUNA_CAMEO_DEBUG.force ? 1 : p);

/**
 * カメオの共通キュー。ポーズと効果音だけ差し替えて使う。
 *
 * 3拍の構成:
 *   0ms    ひょっこり(peek)で左端から出てくる
 *   640ms  役に合わせたポーズを決める(ぽんっと弾む)
 *   1900ms すっと左へ引っ込む → 2500ms で消す
 *
 * @param {object} opt
 * @param {string} opt.pose 決めポーズ(render/chars/lunachan.js の LUNA_POSES)
 * @param {string} opt.chime 決めた瞬間に鳴らす効果音プリセット
 * @param {number} [opt.chimeGain]
 * @param {string} [opt.motion] 決めポーズに乗せるモーション
 * @param {string} [opt.extraSfx] さらに重ねる効果音(確定役のみ使用)
 */
function cameoCues({ pose, chime, chimeGain = 0.55, motion = 'lunaPop', extraSfx = null }) {
  return [
    // 気配。小さい音なので他の停止音・入賞音の邪魔をしない
    { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'cutin_whoosh', gain: 0.3, rate: 1.3 } },
    { at: 0, layer: 'char', action: 'show', params: { char: 'luna', pose: 'peek' } },
    { at: 20, layer: 'char', action: 'motion', params: { char: 'luna', motion: 'lunaPeekIn' } },
    // 決めポーズ
    { at: 640, layer: 'char', action: 'pose', params: { char: 'luna', pose } },
    { at: 640, layer: 'char', action: 'motion', params: { char: 'luna', motion } },
    { at: 660, layer: 'sfx', action: 'synth', params: { preset: chime, gain: chimeGain } },
    ...(extraSfx
      ? [{ at: 780, layer: 'sfx', action: 'synth', params: { preset: extraSfx, gain: 0.45 } }]
      : []),
    // 退場
    { at: 1900, layer: 'char', action: 'motion', params: { char: 'luna', motion: 'lunaSlipOut' } },
    { at: 2500, layer: 'char', action: 'hide', params: { char: 'luna' } },
  ];
}

/** カメオが出る舞台。通常時に限定する(液晶が空いていて、いちばん綺麗に見せられる) */
const STAGE = ['FREE_TIER'];

export default [
  {
    id: 'lc_luna_melon',
    name: '【プレミア】ルナがひょっこり(スイカ / 神アプデ看板)',
    when: { event: 'stop3', flag: ['MELON'], mode: STAGE },
    weight: { FREE_TIER: 100, default: 0 },
    // U58: 0.040 → 0.010(一律 1/4)
    get chance() { return rate(0.010); },
    scaleChance: false,
    duration: 2600,
    cues: cameoCues({ pose: 'sign', chime: 'upgrade_chime', chimeGain: 0.5 }),
  },

  {
    id: 'lc_luna_weak_cherry',
    name: '【プレミア】ルナがひょっこり(弱チェリー / ニヤリ指差し)',
    when: { event: 'stop3', flag: ['WEAK_CHERRY'], mode: STAGE },
    weight: { FREE_TIER: 100, default: 0 },
    // U58: 0.030 → 0.0075(一律 1/4)
    get chance() { return rate(0.0075); },
    scaleChance: false,
    duration: 2600,
    cues: cameoCues({ pose: 'point', chime: 'ui_select', chimeGain: 0.6 }),
  },

  {
    id: 'lc_luna_strong_cherry',
    name: '【プレミア】ルナがひょっこり(強チェリー / 炎オーラ)',
    when: { event: 'stop3', flag: ['STRONG_CHERRY'], mode: STAGE },
    weight: { FREE_TIER: 100, default: 0 },
    // U58: 0.060 → 0.015(一律 1/4)
    get chance() { return rate(0.015); },
    scaleChance: false,
    duration: 2600,
    cues: cameoCues({ pose: 'fire', chime: 'charge_up', chimeGain: 0.5 }),
  },

  {
    id: 'lc_luna_chance',
    name: '【プレミア】ルナがひょっこり(チャンス目 / ペンライト)',
    when: { event: 'stop3', flag: ['CHANCE'], mode: STAGE },
    weight: { FREE_TIER: 100, default: 0 },
    // U58: 0.045 → 0.011(一律 1/4)
    get chance() { return rate(0.011); },
    scaleChance: false,
    duration: 2600,
    cues: cameoCues({ pose: 'penlight', chime: 'upgrade_chime', chimeGain: 0.45 }),
  },

  {
    /*
     * 確定役(サメ揃い / ゴースト揃い)。
     * 役そのものが激レアなので、ここだけ厚くしても
     * カメオ全体の頻度はほとんど動かない(誤差)。
     * U58 で他と同じく 1/4 にして相対関係を保っている。
     */
    id: 'lc_luna_premium',
    name: '【プレミア】ルナがひょっこり(確定役 / クラッカーでお祝い)',
    when: { event: 'stop3', flag: ['SHARK', 'GHOST'], mode: STAGE },
    weight: { FREE_TIER: 100, default: 0 },
    // U58: 0.350 → 0.088(一律 1/4)
    get chance() { return rate(0.088); },
    scaleChance: false,
    duration: 2800,
    cues: cameoCues({
      pose: 'party',
      motion: 'lunaHooray',
      chime: 'upgrade_chime',
      chimeGain: 0.65,
      extraSfx: 'edge_hit',
    }),
  },
];
