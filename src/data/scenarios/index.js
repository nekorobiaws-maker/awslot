/**
 * 全シナリオの集約。DESIGN.md 6.5 / 6.2
 *
 * IDEAS.md の演出ネタは、このディレクトリへデータを追記するだけで組み込める。
 * ゲームロジックには一切影響しない(一方向依存)。
 */

import normal from './normal.js';
import cz from './cz.js';
import bonus from './bonus.js';
import rush from './rush.js';
import zones from './zones.js';
import upper from './upper.js';
import zencho from './zencho.js';
import yokokuLight from './yokoku-light.js';
import yokokuHeavy from './yokoku-heavy.js';
import yokokuGimmick from './yokoku-gimmick.js';
import quiz from './quiz.js';
import yokokuAi from './yokoku-ai.js';
import yokokuSecnet from './yokoku-secnet.js';
import yokokuInfra from './yokoku-infra.js';
import yokokuDevtools from './yokoku-devtools.js';
import yokokuDatamedia from './yokoku-datamedia.js';

/** @type {object[]} */
export const SCENARIOS = [
  ...normal,
  ...cz,
  ...bonus,
  ...rush,
  // Phase 5: 派生ゾーン / 上乗せ特化 / 上位AT / 引き戻し / エンディング
  ...zones,
  ...upper,
  // Phase 7: 前兆(game/modes/freetier.js の paramChange を拾う)
  ...zencho,
  // Phase 7: 予告3カテゴリ。弱中(yl_) / 強・カットイン(yh_) / ギミック(yg_)
  // これらが参照する追加カットインとLCDアニメは
  //   staging/anims/cutins.js ← cutins-extra.js
  //   staging/anims/lcdanims.js ← lcdanims-extra.js
  // でレジストリへマージ済み。
  ...yokokuLight,
  ...yokokuHeavy,
  ...yokokuGimmick,
  // P: AWSクイズルーレット。正解版は CZ の modeEnter(= 突入確定)、
  // 不正解版は前兆のガセ終了(= 非当選確定)にしか貼っていないので、
  // 「正解に止まった = 当選」が when 条件だけで保証される。
  ...quiz,
  // 予告 第2弾(未登場サービス3カテゴリ): AI分析(ya_) / セキュリティNW(ys_) / インフラ・ロマン(yi_)
  ...yokokuAi,
  ...yokokuSecnet,
  ...yokokuInfra,
  // 予告 第3弾: 開発ツール(yd_) / データ・メディア(ym_)
  ...yokokuDevtools,
  ...yokokuDatamedia,
];

/** 定義の妥当性チェック(重複IDやcues欠落の検出。起動時に一度だけ呼ぶ) */
export function validateScenarios(scenarios = SCENARIOS) {
  const errors = [];
  const seen = new Set();
  for (const s of scenarios) {
    if (!s.id) { errors.push('idのないシナリオがあります'); continue; }
    if (seen.has(s.id)) errors.push(`ID重複: ${s.id}`);
    seen.add(s.id);
    if (!s.when?.event) errors.push(`${s.id}: when.event がありません`);
    if (!Array.isArray(s.cues) || s.cues.length === 0) errors.push(`${s.id}: cues が空です`);
    for (const c of s.cues ?? []) {
      if (!c.layer || !c.action) errors.push(`${s.id}: layer/action のないキューがあります`);
      if (c.at == null && !c.waitFor) errors.push(`${s.id}: at も waitFor もないキューがあります`);
    }
  }
  return { ok: errors.length === 0, errors };
}
