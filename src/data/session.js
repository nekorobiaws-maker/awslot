/**
 * セッション(スコアアタック)定義。docs/BACKLOG.md 「M: メカニクス改修」
 *
 * 本機は「通常時に座って延々回す」台ではなく、**100回転で1プレイが終わるスコアアタック**。
 * 通常時・CZ・ボーナス・AT・派生ゾーンを問わず、レバーONした回数を通算で数え、
 * 100回転を使い切った時点で強制終了する。
 *
 * ■ 残存価値の買い取り(buyout)
 *   100回転目がボーナスやATの途中だった場合、そのまま終わると
 *   「当たったのに1枚ももらえない」理不尽が起きる。そこで終了時に
 *   **まだ消化していない権利を枚数へ換算してクレジットへ加算**する。
 *
 *     残ゲーム数 × そのモードの現在純増/G
 *     ストックセット数 × (1セットのゲーム数 × 純増/G)
 *
 *   換算のしかたは各モードハンドラの `residualValue(state, ctx)` が返す。
 *   game/flow.js はモードスタックを下から順に舐めて合計するだけで、
 *   モード固有の知識を持たない(依存方向 game→data を維持する)。
 *
 * ■ 買い取らないもの(意図的)
 *   - セット継続抽選の期待値(まだ引いていない継続は「所有していない権利」)
 *   - CZ の突破期待値(CZ は抽選そのものなので所有価値ではない)
 *   どちらも買い取ると「終了間際にCZへ入るのが一番得」という歪みが出る。
 */

import { AMA, AMA_MODE } from './ama.js';

export const SESSION = {
  id: 'session',
  /** 1セッションの回転数(2026-08-13 ユーザー指示で 50 → 100) */
  totalGames: 100,
  /**
   * 甘スロ(U44 / ?ama=1)で遊んでいるか。
   *
   * セッション単位で固定される設定(URLクエリで起動時に決まり、途中で変わらない)なので、
   * **スコアの意味づけに関わる**。リザルトのバッジ「甘スロ設定」は
   *   ・game/modes/result.js の state.ama / state.amaLabel
   *   ・sessionEnd イベントの payload.ama
   *   ・この SESSION.ama
   * のどれを見ても同じ答えになる(表示担当は使いやすいものを選んでよい)。
   */
  get ama() { return AMA_MODE; },
  /** 甘スロのバッジ文言(表示担当用) */
  get amaLabel() { return AMA.label; },
  get amaBadge() { return AMA.badge; },
  /** 甘スロの1行説明(初見で意味が分かる文言) */
  get amaNote() { return AMA.note; },
  /** 残り回転数がこの値以下になったら液晶で煽る(演出側が参照する) */
  warnAt: 10,
  /**
   * リザルトから次のセッションを始めるときの初期クレジット。
   * スコア(差枚)は初期クレジットに依存しないので値そのものは何でもよいが、
   * 0 にすると1回転目で必ず自動投入テロップが出てスタート告知を潰すため 50 にしてある。
   */
  startCredit: 50,
  /**
   * 表示名。回転数はハードコードせず totalGames から作る
   * (2026-08-14 しおん指摘 S13: 100回転化後も「50 SPIN」と名乗っていた)。
   */
  get name() { return `${this.totalGames} SPIN SCORE ATTACK`; },
};

/**
 * 買い取り明細の1行を作るヘルパ。
 * @param {string} label 画面に出す名前
 * @param {number} games 残ゲーム数(セット換算ぶんを含む)
 * @param {number} perGame 1ゲームあたりの純増
 * @param {string} [kind] 'games' | 'stock'
 */
export function residualLine(label, games, perGame, kind = 'games') {
  const g = Math.max(0, Math.floor(games));
  const p = Math.max(0, perGame);
  return { label, kind, games: g, perGame: p, coins: Math.floor(g * p) };
}
