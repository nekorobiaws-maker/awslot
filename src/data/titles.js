/**
 * リザルトの称号(2026-08-15 ユーザー指示 U56)。
 *
 * ══ RANK と何が違うか ═════════════════════════════════════════════
 *
 *   RANK(game/modes/result.js の RANKS)… スコア帯の**格付け**。
 *       ラベルは AWS の機能名(MULTI-REGION / AUTO SCALING …)で、到達率を併記する。
 *   称号(このファイル)                … その回の打ち手に贈る**呼び名**。
 *       AWS コミュニティの肩書を低→高に並べたもの。派手な演出は付けず、
 *       リザルトに RANK 行とは **別の1行** で静かに出す。
 *
 * 2つを別に持っているのは、RANK が「どのくらい出たか」の物差しなのに対して
 * 称号は「どう呼ばれるか」というご褒美で、役割が違うから。
 * どちらも同じスコアから引くが、刻みは独立していてよい。
 *
 * ══ 【重要】閾値はここが唯一の正 ═════════════════════════════════
 *
 * バランス担当がスコア分布(初当り・RUSH の上限・買い取り等)を触ると
 * 到達率がそのまま動くので、**分布を動かしたらこの表も必ず引き直す**。
 * 表示側(render/resultpanel.js)は titleOf() を呼ぶだけで、
 * 閾値も名前もこのファイルの外には一切書かない(写しを作らないこと)。
 *
 * 測り方(`sim.mjs` は毎回「称号の到達率」を **累積** で出す。ズレたらすぐ気づける):
 *   node scripts/sim.mjs --session=20000 777          … 通常設定
 *   node scripts/sim.mjs --session=20000 777 --ama    … 甘スロ
 *
 * ══ 刻みの決め方 = スコア分布の分位点 ══════════════════════════════
 *
 * 「上ほど狭くなる7段」を感覚で置くとバランス改修のたびにズレるので、
 * **下から順に 常時 / 25% / 50% / 75% / 90% / 97% / 99.5% パーセンタイル**
 * に固定した(= 到達率 100 / 75 / 50 / 25 / 10 / 3 / 0.5%)。
 * 分布を動かしたら `node scripts/balance-probe.mjs 20000 777 555` の
 * 分位点の行(下位25% / 中央値 / 上位25% / 10% / 3% / 0.5%)を読んで置き直すだけでよい。
 *
 * ── 根拠(2026-08-15 / **U63 の着地後**・20,000セッション × 2シード)──────
 *   通常設定  p25 **10** / p50 **158** / p75 **384** / p90 **650** / p97 **1,010** / p99.5 **1,450**
 *   甘スロ    p25 **62** / p50 **255** / p75 **550** / p90 **965** / p97 **1,380** / p99.5 **1,670**
 * 実測の到達率(累積 / 20,000セッション × seed 777・555):
 *   通常設定  100% / 74.9〜75.1% / 49.9% / 24.1〜24.3% / 9.5〜9.9% / 2.9% / 0.5〜0.6%
 *   甘スロ    100% / 75.1〜75.3% / 50.0〜50.2% / 24.9〜25.1% / 10.0% / 3.0% / 0.5%
 *
 * ── 甘スロに別の閾値(amaMin)がある理由 ────────────────────────────
 * 甘スロ(?ama=1)はレア役の出現率が2倍で初当りが別物なので、
 * 同じスコアでも意味が違う(RANKS が rate / amaRate を2列持っているのと同じ事情)。
 * 同じ閾値を使うと甘スロだけ称号がインフレするため、設定ごとに刻みを分けている。
 */

/**
 * 称号の定義。**上から順に判定する**(高い称号を先に置く)。
 *
 * @property {string} id     内部ID(表示には使わない)
 * @property {string} label  画面に出す英語表記
 * @property {number} min    通常設定の下限スコア(差枚)
 * @property {number} amaMin 甘スロの下限スコア
 * @property {string} color  リザルトでの文字色
 * @property {string} note   その称号が何を意味するかの1行(読み手向けの補足)
 */
export const TITLES = [
  {
    id: 'HEROES',
    label: 'Heroes',
    min: 1450,
    amaMin: 1670,
    color: '#ff2fa0',
    note: '桁違いの一撃。ここまで出したら語り継がれる',
  },
  {
    id: 'AMBASSADORS',
    label: 'Ambassadors',
    min: 1010,
    amaMin: 1380,
    color: '#ffd166',
    note: '大量出玉。人に勧めたくなる回',
  },
  {
    id: 'TOP_ENGINEERS',
    label: 'Top Engineers',
    min: 650,
    amaMin: 965,
    color: '#7bf7d0',
    note: 'RUSH をしっかり伸ばした回',
  },
  {
    id: 'ALL_CERTS',
    label: 'All Certifications Engineers',
    min: 384,
    amaMin: 550,
    color: '#8ab4ff',
    note: '一通り引き切った、そつのない回',
  },
  {
    id: 'COMMUNITY_BUILDERS',
    label: 'Community Builders',
    min: 158,
    amaMin: 255,
    color: '#c8d2e8',
    note: 'プラス収支。積み上げはできた',
  },
  {
    /*
     * 通常設定の p25 は +10枚(= プラス収支の下端あたり)。
     * ここを 0 にすると到達率が 80% になって「25%刻み」から外れるので、
     * **分位点どおり 10枚** にしてある(甘スロは p25 が +62枚)。
     */
    id: 'JR_CHAMPIONS',
    label: 'Jr. Champions',
    min: 10,
    amaMin: 62,
    color: '#9aa6bf',
    note: 'ほぼ等価。ここからが本番',
  },
  {
    id: 'CERTIFIED',
    label: 'Certified',
    min: -Infinity,
    amaMin: -Infinity,
    color: '#7a8399',
    note: '100回転を打ち切った全員に。まずは資格から',
  },
];
/** U63(分位点そろえ)の直前の仮置き。戻すときの基準として保持 */
export const PREVIOUS_TITLE_MINS_U56 = {
  HEROES: { min: 1300, amaMin: 1750 },
  AMBASSADORS: { min: 1000, amaMin: 1400 },
  TOP_ENGINEERS: { min: 700, amaMin: 1000 },
  ALL_CERTS: { min: 400, amaMin: 550 },
  COMMUNITY_BUILDERS: { min: 150, amaMin: 200 },
  JR_CHAMPIONS: { min: 0, amaMin: 0 },
};

/** 低い順(表示や一覧が要るとき用。判定には TITLES を使うこと) */
export const TITLES_ASC = [...TITLES].reverse();

/**
 * スコアから称号を引く。
 *
 * @param {number} score セッションの差枚
 * @param {boolean} [ama] 甘スロ(U44)のセッションか
 * @returns {{id:string,label:string,color:string,note:string,min:number,ama:boolean}}
 */
export function titleOf(score, ama = false) {
  const s = Number.isFinite(score) ? score : 0;
  const min = (t) => (ama ? t.amaMin : t.min);
  const hit = TITLES.find((t) => s >= min(t)) ?? TITLES[TITLES.length - 1];
  return {
    id: hit.id,
    label: hit.label,
    color: hit.color,
    note: hit.note,
    min: min(hit),
    ama: Boolean(ama),
  };
}

export default TITLES;
