/**
 * 甘スロモード(U44 / 2026-08-14 ユーザー指示)
 *
 * ■ 何をするモードか
 * **通常時のレア役の出現率だけを2倍**にした救済用の設定。
 * レア役はこのゲームの全システム(ステージ昇格 / CZ抽選 / RUSH中の上乗せ /
 * ホットスタンバイの延長)の共通契機なので、出現率を上げるだけで
 * 「当たらないまま100回転が終わる」回がまるごと減る。
 * ボーナス中のテーブル(data/flags.js の BONUS_FLAGS)は **据え置き** で、
 * ボーナス→RUSHの当選率(12 / 45 / 85%)は通常モードと完全に同じままにする。
 * = 甘くなるのは「当たるまで」であって「当たったあとの格」ではない。
 *
 * ■ 切り替えは URLクエリ `?ama=1` のみ(ユーザー決定)
 * ランタイム切替(プレイ中にボタンで甘スロON)は **作らない**。
 * 小役テーブルは data/flags.js の読み込み時に1回だけ書き換える設計で、
 * 途中で戻すと「同じセッションの前半と後半で確率が違う」= スコアの意味が壊れる。
 * 表示担当が用意するのは「?ama=1 を付けて**再読み込み**するボタン」で、
 * ページを開き直した時点から甘スロとして始まる(= セッション単位で確定する)。
 *   通常へ戻す … ?ama=0(またはクエリを外して再読み込み)
 *
 * ■ node(scripts/)からの指定
 * ブラウザの location が無い環境では `--ama` 引数か `AWSLOT_AMA=1` を見る。
 *   node scripts/sim.mjs --session=3000 --ama
 *   node scripts/balance-probe.mjs 3000 777 --ama
 * どちらも **モジュール読み込み時**に決まるので、実行中に切り替わることはない。
 *
 * ■ このファイルは何も import しない
 * data/flags.js から参照されるため、依存を持たせると循環しやすい
 * (data/rareroles.js と同じ扱い)。
 */

/** 甘スロの設定値 */
export const AMA = {
  id: 'ama_slot',
  /** URLクエリのキー(?ama=1) */
  query: 'ama',
  /**
   * 通常時テーブルのレア役に掛ける倍率。
   * 「1/N の N を割る」形で適用するので、2 なら 弱チェ 1/50 → 1/25。
   * ここを 3 以上にすると AS_RUSH の上乗せ期待値が 1.0 に近づいて
   * RUSH が理論上終わらなくなる(scripts/sim.mjs の検証26)。**2 が上限の目安**。
   */
  rareMultiplier: 2,
  /** 画面に出す名前(表示担当がバッジ・リザルトで使う) */
  label: '甘スロ',
  badge: 'AMA SLOT',
  /** 何が甘くなるのかの1行説明(初見で意味が分かる文言) */
  note: '通常時のレア役が2倍で出る救済モード(ボーナス中の抽選は通常と同じ)',
};

/**
 * 甘スロが有効か(モジュール読み込み時に1回だけ決まる)。
 * ブラウザは ?ama=1 / node は --ama か AWSLOT_AMA=1。
 * @returns {boolean}
 */
function readAmaFlag() {
  // ブラウザ: ?ama=1
  try {
    if (typeof location !== 'undefined' && typeof location.search === 'string') {
      if (new URLSearchParams(location.search).get(AMA.query) === '1') return true;
    }
  } catch { /* location が読めない環境は無視して node 側の判定へ */ }
  // node(scripts/): --ama / AWSLOT_AMA=1
  if (typeof process !== 'undefined') {
    if (Array.isArray(process.argv) && process.argv.includes('--ama')) return true;
    if (process.env?.AWSLOT_AMA === '1') return true;
  }
  return false;
}

/**
 * 甘スロで遊んでいるか。**この値が唯一の正**。
 * ゲーム側(data/flags.js)も表示側(リザルトのバッジ)もここを見る。
 */
export const AMA_MODE = readAmaFlag();

/**
 * 甘スロを切り替えるためのURL(表示担当のボタン用)。
 * `location.href = amaUrl(true)` で再読み込みすれば甘スロで始まる。
 * 他のデバッグクエリ(?seed= / ?turbo= など)は保ったまま ama だけ差し替える。
 * @param {boolean} on true なら甘スロON
 * @returns {string} 遷移先URL(ブラウザ以外では '?ama=1' 相当を返す)
 */
export function amaUrl(on = !AMA_MODE) {
  if (typeof location === 'undefined') return on ? `?${AMA.query}=1` : '?';
  const url = new URL(location.href);
  if (on) url.searchParams.set(AMA.query, '1');
  else url.searchParams.delete(AMA.query);
  return url.toString();
}
