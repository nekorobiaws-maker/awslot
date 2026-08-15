/**
 * ボイスの「相槌プール」定義(2026-08-15 U71)。DESIGN.md 6.7
 *
 * ══ なぜプールが要るのか ═══════════════════════════════════════════
 *
 * 【指示】「前兆演出で『あれ?』『なになに?』みたいなちょっとした声がほしい」
 *
 * 前兆は 1回の当たりに対して何ゲームも続くので、同じ場面に同じ key を貼ると
 * **毎回まったく同じ声**が鳴る。台の相棒としてはこれがいちばん安っぽい。
 * そこで「この場面ではこのあたりの声のどれか」という **束(プール)** を作り、
 * 鳴らすときに1本引く。シナリオ側は
 *
 *     { layer:'voice', action:'play', params:{ pool:'react', chance:0.25 } }
 *
 * と書くだけでよく、フレーズを足したり差し替えたりしてもシナリオは触らずに済む。
 *
 * ■ 嘘をつかせない(U68 からの約束)
 *   ここに入れてよいのは **すべて疑問形・非断定** のセリフだけ。
 *   プールはガセ前兆にも本前兆にも等しく貼るので、断定するセリフを1本でも
 *   混ぜると、その声が鳴った瞬間に当たりが割れてしまう。
 *   断定してよいのは当落が確定した瞬間だけで、そちらは key 直指定のまま
 *   ({ key:'luna_bonus_kakutei_01', force:true })。
 *
 * ■ pose(任意)
 *   その声に合わせて出す表情。staging/actions.js が
 *   chars.gestureFor() で **数秒だけ** ポーズを差し替える。
 *   「あれ?」で首をかしげる、「なんか来てる…?」でひょっこり覗く、のように
 *   耳と目を合わせると、同じ相槌でも表情のぶんだけ表現が増える。
 *   演出側がポーズを指定している場面では差し替えない(gestureFor 側の判断)。
 *
 * ■ 未生成の key を書いてもよい
 *   engine/voice.js は manifest に無い key を静かに読み飛ばす。
 *   プールの中に未生成が混ざっていても、その1本が選ばれたときに黙るだけ
 *   (音が無くてもゲームは完全に成立する、が Phase 6 からの前提)。
 */

/**
 * @typedef {{key:string, pose?:string}} VoicePoolEntry
 * @type {Record<string, VoicePoolEntry[]>}
 */
export const VOICE_POOLS = {
  /**
   * 予兆・前兆の **入り**。「何か始まった?」の一言。
   * 短いものほど繰り返し使うので、1〜2秒の相槌だけを入れる。
   */
  react: [
    { key: 'luna_react_oh_01',    pose: 'surprise' },  // おっ?
    { key: 'luna_react_nani_01',  pose: 'question' },  // なになに?
    { key: 'luna_react_are_01',   pose: 'question' },  // あれ?
    { key: 'luna_react_n_01',     pose: 'question' },  // ん?
    { key: 'luna_react_o_01',     pose: 'surprise' },  // お?
    { key: 'luna_react_nn_01',    pose: 'think' },     // んん?
    { key: 'luna_react_nanka_01', pose: 'peek' },      // なんか来てる…?
    { key: 'luna_react_matte_01', pose: 'surprise' },  // ちょっと待って?
  ],

  /**
   * 前兆が伸びてからの **煽り**。入りより少しだけ踏み込むが、
   * それでも全部が疑問形(「激アツ?」までで、「激アツ!」とは言わない)。
   */
  tease: [
    { key: 'luna_tease_kore_01',     pose: 'think' },     // これは…
    { key: 'luna_tease_moshika_01',  pose: 'question' },  // もしかして?
    { key: 'luna_hot_01',            pose: 'fire' },      // 激アツ?
    { key: 'luna_cz_chance_01',      pose: 'point' },     // チャンスかも?
    { key: 'luna_react_zawa_01',     pose: 'think' },     // ざわざわしてる…
    { key: 'luna_react_kuru_01',     pose: 'peek' },      // くるかも…
    { key: 'luna_react_uzu_01',      pose: 'point' },     // うずうずする…
  ],

  /**
   * 引っぱったのに何も起きなかったとき(ガセの締め)。
   * 落胆しすぎない = 次のゲームへ気持ちが続く強さに留める。
   */
  doubt: [
    { key: 'luna_react_kinosei_01', pose: 'think' },     // 気のせいかな?
    { key: 'luna_hmm_01',           pose: 'sulk' },      // んー…
    { key: 'luna_react_nn_01',      pose: 'question' },  // んん?
  ],

  /* ══ クイズの答え合わせ(U71b)══════════════════════════════════════
   *
   * この2つだけは **断定してよい**。クイズの正誤は
   * 「押したリールと正解の位置が一致したか」という、当落と無関係に確定した事実で、
   * 正解してもハズレるし不正解でもCZに入る(data/scenarios/quiz.js の表)。
   * つまり言い切っても当たりの示唆にはならない。
   */
  /** 正解 */
  quizOk: [
    { key: 'luna_quiz_ok_01', pose: 'joy' },     // いいねっ!
    { key: 'luna_quiz_ok_02', pose: 'joy' },     // せいかーい!
    { key: 'luna_quiz_ok_03', pose: 'point' },   // さすが!
    { key: 'luna_quiz_ok_04', pose: 'present' }, // よく知ってるね!
  ],
  /** 不正解。責めずに一緒に悔しがる言い方だけを入れる */
  quizNg: [
    { key: 'luna_quiz_ng_01', pose: 'sulk' },     // それは良くないよー
    { key: 'luna_quiz_ng_02', pose: 'question' }, // ちがうちがう!
    { key: 'luna_quiz_ng_03', pose: 'cry' },      // おしい!
    { key: 'luna_quiz_ng_04', pose: 'cry' },      // うーん、ざんねん!
  ],
};

/** プール名の一覧(デバッグ用) */
export const VOICE_POOL_IDS = Object.keys(VOICE_POOLS);

/**
 * プールの key だけを並べた表(engine/voice.js の抽選用)。
 * @type {Record<string, string[]>}
 */
export const VOICE_POOL_KEYS = Object.fromEntries(
  Object.entries(VOICE_POOLS).map(([id, list]) => [id, list.map((e) => e.key)]),
);

/**
 * key → 合わせる表情。プールに載っていない key は null。
 * 同じ key が複数のプールに居る場合は先に定義されたほうを採る
 * (どのプールから鳴っても表情がぶれないように1つに決める)。
 */
const POSE_BY_KEY = (() => {
  const map = new Map();
  for (const list of Object.values(VOICE_POOLS)) {
    for (const e of list) {
      if (e.pose && !map.has(e.key)) map.set(e.key, e.pose);
    }
  }
  return map;
})();

/**
 * そのセリフに合わせる表情を返す。
 * @param {string} key
 * @returns {string|null}
 */
export function poseForVoiceKey(key) {
  return POSE_BY_KEY.get(key) ?? null;
}
