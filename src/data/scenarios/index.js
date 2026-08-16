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
import rushes from './rushes.js';
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
import yokokuWind from './yokoku-wind.js';
import yokokuAruaru from './yokoku-aruaru.js';
import lunaCameo from './yokoku-luna.js';
import yokokuBatch3 from './yokoku-batch3.js';
import yokokuBatch4 from './yokoku-batch4.js';
import yokokuBatch5 from './yokoku-batch5.js';
import yokokuBedrock from './yokoku-bedrock.js';
import yokokuMajor from './yokoku-major.js';
import yokokuPolly from './yokoku-polly.js';
import trivia from './trivia.js';
import paramFx from './paramfx.js';
import session from './session.js';
import freeze from './freeze.js';

/** @type {object[]} */
export const SCENARIOS = [
  ...normal,
  ...cz,
  ...bonus,
  ...rush,
  // U11(2026-08-14): RUSH 4種(オートスケーリング / CloudFront / Aurora / ヒーロー)
  ...rushes,
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
  // U53(2026-08-15): 「最初に止めるリール」3択(qz_reelpick_*)。
  // クイズルーレットの発生枠をそのまま置き換えたもの。正解版は CZ の modeEnter
  // (= 突入確定)、不正解版は非当選が構造的に確定するイベントにしか貼っていないので、
  // 「正解 = 当選」が when 条件だけで保証される(当落は後決め / 出目は不変)。
  // ※ クイズの46問データと盤面描画は休止中のまま保全してある(quiz.js 冒頭を参照)。
  ...quiz,
  // 予告 第2弾(未登場サービス3カテゴリ): AI分析(ya_) / セキュリティNW(ys_) / インフラ・ロマン(yi_)
  ...yokokuAi,
  ...yokokuSecnet,
  ...yokokuInfra,
  // 予告 第3弾: 開発ツール(yd_) / データ・メディア(ym_)
  ...yokokuDevtools,
  ...yokokuDatamedia,
  // 予告 第4弾(2026-08-14): 新タイプ演出(yw_)。
  //   風が子役を運んでくる / リールロック・無音 / ランプ先光り /
  //   キャラの横切り / AZ切替シャッター / 0コマ停止の煽り / 赤文字の裏切り枠
  ...yokokuWind,
  // U13(2026-08-14): AWSあるある分岐予兆(ya2_)。
  //   レバーONで導入セリフ → リール停止(当落確定)で
  //     ハズレ   = アンチパターン + ブッブー(sfx-presets.js の buzzer_wrong)
  //     子役成立 = ベストプラクティスを成立役の色で
  //   に分岐する。導入セリフはハズレ版と成立版で共通なので、
  //   文言を直すときは yokoku-aruaru.js の TOPICS だけを直せばよい。
  ...yokokuAruaru,
  // プレミアカメオ(lc_)。数百ゲームに1回だけ、レア役が成立したゲームの
  // 第3停止でルナが液晶の端からひょっこり出てポーズを決める。
  // char / sfx しか使わない ambient なので、予告の枠も頻度も奪わない。
  ...lunaCameo,
  // U35(2026-08-14): 予告 第5弾(yb3_)。未登場サービス10ネタ。
  //   KMS / Savings Plans / Compute Optimizer / AWS Backup / Global Accelerator /
  //   CloudFormation / Shield(前兆中限定) / CloudWatch異常検知 /
  //   Route 53ヘルスチェック / re:Post
  // 弱はハズレ寄りプールと同じ chance を持たせてあるので、
  // 本数が増えても予告の総発火量は変わらない(理由はファイル冒頭のコメント)。
  ...yokokuBatch3,
  // U52b(2026-08-15): 予告 第6弾(yb4_)。さらに未登場だった10サービス。
  //   Fargate / ECR / EFS / Service Quotas / Data Firehose /
  //   DAX / WorkSpaces / Audit Manager / NLB / Organizations
  // 弱はハズレ寄りプールと同じ chance を持たせてあるので総発火量は変わらない。
  // 文字はすべて lcd.text(座布団つき)で出す = V31-08 の再発防止。
  ...yokokuBatch4,
  // U58(2026-08-15): 予告 第7弾(yb5_)。予兆+50個のうち通常時予告ぶん32本。
  //   弱14(ガセ) / 中13(レア役限定) / 熱5(上位レア役限定)
  // 既出サービスを使うものは必ず別の機能・別の側面を題材にしてある
  //   (かぶり回避の対応表は yokoku-batch5.js の冒頭)。
  // 弱はハズレ寄りプールと同じ chance を持たせてあるので総発火量は変わらない。
  ...yokokuBatch5,
  // U82(2026-08-16): 予告 第8弾(ymg_)。ユーザー指摘「GameLift とか知らんし」への対処。
  //   EC2 / S3 / Lambda / IAM / VPC / SNS の6サービス × 弱・中の対 = 12本。
  // 足したぶんと **同じ重み** をマイナーサービスの予告から差し引いてあるので、
  // 予兆の合計発生率は動かない(帳簿と証明は yokoku-major.js の冒頭)。
  ...yokokuMajor,
  // U46b(2026-08-15): Bedrock 生成予告(ybr_)。生成された1行がそのまま結果を表す。
  //   IAM が設定されます=チェリー / スイカの美味しい季節ですね=スイカ /
  //   チャンスかもしれません=チャンス目 / サメの群れが…=サメ揃い /
  //   文字化け・空出力=ハズレ(構造的に当たらないゲーム限定)
  // 「クイズの時間です」だけは出題シナリオ(quiz.js)側の導入として出している。
  ...yokokuBedrock,
  // U61(2026-08-15): Polly マイクテスト予兆(yp_)。
  //   レバーONの入りは全部同じ「マイクテスト中…」で、第3停止で読み上げ文が割れる:
  //     「本日は晴天なり」= ハズレ(白)/「本日はスイカなり」= スイカ成立(緑)/
  //     「本日はチェリーなり」= チェリー成立(赤)/「本日はLambdaなり」= チャンス目(黄)/
  //     「本日はサメなり」= サメ揃い(水色)
  //   同じ Polly ネタだった ya_polly_readout_weak(yokoku-ai.js)を退役させた
  //   **入れ替え**なので、予告の総発火量は変わらない。
  ...yokokuPolly,
  // U59(2026-08-15): ボーナス中の AWS豆知識カード(tv_)。
  //   1ゲームおきに「サービス名 + 1行概要」を1枚出し、次のレバーONで消える。
  //   RUSH中は出さない(見なければいけない情報が毎ゲーム動くため)。
  //   priority:'ambient' なので演出枠を1つも奪わない。
  ...trivia,
  // 受け手のいなかった paramChange(aurora_addgame / standby_extend)を拾う演出
  ...paramFx,
  // U7: 100ゲーム終了 → リザルトの間に挟むワンクッション
  ...session,
  // 2026-08-14: レバーONフリーズ(game/flow.js の 'freeze' イベント。exclusive)
  ...freeze,
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
