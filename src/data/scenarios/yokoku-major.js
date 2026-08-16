/**
 * 予告 第8弾「メジャー編」(ymg_)。2026-08-16 ユーザー指摘 U82。
 *
 * 【指摘】「GameLift とか知らんし」
 * 【正体】予告の顔ぶれが第5〜7弾(batch3 / batch4 / batch5)で一気に増えたとき、
 *         **かぶりを避けること**を優先したせいで、残っていたマイナーサービス
 *         (GameLift / Keyspaces / WorkSpaces / DAX / Audit Manager / Wavelength …)
 *         ばかりが新規枠を占めていた。この台のコンセプトは「遊んで覚える」なので、
 *         まず覚えてほしいのは EC2 / S3 / Lambda / IAM / VPC / SNS のほうで、
 *         いきなりマイナーサービスが並ぶと「知らない名前の羅列」になる。
 * 【対処】この12本(メジャー6サービス × 弱/中の対)を足し、
 *         同じ量だけマイナー勢の weight を削る(下の「発生率は据え置き」を参照)。
 *
 * ══ 既存演出との切り口かぶり対応表 ═══════════════════════════════════
 *
 * メジャーどころは既にどこかで使われているので、
 * batch5 と同じく **「同じサービスの同じ画を出さない」** を基準にした。
 *
 *   | サービス | 既存の演出(場所)                                  | この回の切り口             |
 *   |---------|--------------------------------------------------|---------------------------|
 *   | EC2     | 台数が増える(rushes の AS_RUSH)/ CPUクレジット   | **起動の状態遷移**         |
 *   |         | (zones の EC2_BURST)/ Mac インスタンス(zencho)|  pending のまま → running |
 *   | S3      | 絵柄飛来(normal)/ 風が運ぶ(wind)/               | **バージョニング**         |
 *   |         | Firehose の着地(batch4)                          |  削除マーカー → 前の版に戻す|
 *   | Lambda  | コールドスタート(wind / light)/ 同時実行数(light)| **レイヤー**               |
 *   |         | 関数URL(batch5)/ 絵柄飛来(normal)               |  1枚置いた → 全関数が使う  |
 *   | IAM     | ロールのバッジ(heavy)/ KMS の鍵(batch3)/         | **ポリシー評価と一時キー**  |
 *   |         | Lake Formation の関所(batch5)/ 証拠収集(batch4) |  明示的な Deny → AssumeRole|
 *   | VPC     | VPC Lattice の結線(zencho)                       | **通信の可否**             |
 *   |         |                                                  |  SGに許可がない → 経路追加 |
 *   | SNS     | (演出への登場なし。完全新規)                      | 購読確認 → ファンアウト     |
 *
 * ══ 予兆の合計発生率は据え置き ═══════════════════════════════════════
 *
 * director は「候補の中から weight で1本選び、その1本の chance で発火を間引く」ので、
 * 発火率は **チャンス値ごとの重みの取り分** だけで決まる:
 *
 *     P(発火) = Σ_i ( w_i / ΣW ) × min(1, chance_i × 係数)
 *
 * したがって **同じ chance クラスの中で重みを付け替えるかぎり P は1ミリも動かない**。
 * この回はそれを守って足し引きしている(帳簿は README と下のコメント):
 *
 *   弱(chance = CHANCE_WEAK / 発火条件は WEAK_WHEN で全員同一)
 *     足す : ymg_*_weak 6本 = 42+40+40+40+40+40 = **242**
 *     削る : yb4_dax_weak 55→14 / yb4_workspaces_weak 54→14 / yb5_fsx_weak 54→14 /
 *            yb5_appstream_weak 54→14 / yb5_artifact_weak 56→14 /
 *            yb5_license_manager_weak 52→13 = **−242**
 *
 *   中(chance を持たない = 選ばれたら必ず出る。発火条件は成立役ごとに違うので
 *      **役の系統ごとに** 合わせる)
 *     レア役全般(rare:true) 足す 35+35+34 = 104 /
 *                            削る yb4_dax_mid 46→12・yb5_keyspaces_mid 48→12・
 *                                 yb5_documentdb_mid 46→12 = −104
 *     スイカ(MELON)        足す 36 / 削る yb5_redshift_serverless_mid 48→12 = −36
 *     チャンス目(CHANCE)   足す 36 / 削る yb5_wavelength_mid 48→12 = −36
 *     チェリー(IAM)        足す 37 / 削る yb4_auditmanager_mid 50→13 = −37
 *
 * さらに GameLift の弱/中(yokoku-datamedia.js)は **1対1の差し替え**
 * (weight・chance・発火条件をそのままに中身だけ CloudFront のキャッシュ削除へ)なので、
 * こちらも収支ゼロ。実測でも 予告の発火は 100Gあたり 29.80回 → 29.80回 で変わっていない。
 *
 * ══ 作法(batch3〜5 と同じ)═══════════════════════════════════════════
 *   ・弱 … ハズレ寄りの役でだけ出る = そのゲームの当選は 0%(ガセ)。
 *          「0%」を名乗れる条件は WEAK_WHEN のコメントを参照
 *   ・中 … レア役でしか出ない。成立役を1つに絞れるものは **その役の色**、
 *          絞れないもの(rare:true)は中立色(U62 / data/rolecolors.js が唯一の正)
 *   ・結論行は必ず conclusionCue(U57)= stop3 で出して次のレバーONで消える
 *   ・読ませる文字は lcd.text だけ(座布団つき。V31-08)。
 *     液晶アニメは **自前で文字を描かないもの** に限定:
 *       step_up / checklist_green / pillar_raise / az_failover / cw_graph_appear
 *   ・文言の3条件(U25 → U78): ① 初見で意味が通る ② AWS の話が入っている
 *     ③ 事実に反しない。**数値のねつ造は禁止**なので、この回は数字を1つも名乗っていない
 */

// 天井(Auto Recovery)のゲーム数。NOT_CEILING_GAME の算出に使う(data/modes.js が唯一の正)
import { NORMAL_SUBSTATES } from '../modes.js';
// 結論行の作法(U57)と役色(U62)は data/rolecolors.js が唯一の正
import { conclusionCue, COLOR_NEUTRAL_MID, colorForFlag } from '../rolecolors.js';

/**
 * ハズレ寄りプールに合わせた発火率。
 * yokoku-batch3.js / batch4.js / batch5.js / bedrock.js と同値でなければならない
 * (揃っていないと、本数を増やしたときにプール全体の発火量が動く)。
 * 実効値は director の YOKOKU_CHANCE_SCALE が掛かったもの。
 * **係数の値をここに写さないこと**(staging/director.js が唯一の正)。
 */
const CHANCE_WEAK = 0.245;

/** 役を1つに絞れない中版だけで使う中立色(役色ではない) */
const COLOR_MID = COLOR_NEUTRAL_MID;

/**
 * 天井(Auto Recovery)に当たらないゲームの `modeState.games` 一覧。
 * 数え方は data/scenarios/quiz.js の NOT_CEILING_GAME と同じ(あちらが先例)。
 */
const NOT_CEILING_GAME = Array.from(
  { length: Math.max(1, NORMAL_SUBSTATES.ceiling.games - 1) },
  (_, i) => i,
);

/**
 * ハズレ寄りの発火条件。「このゲームは当たらない」を名乗れる帯だけに限定する。
 * 通常時に当選が生まれる経路は4つあり、その全部を塞いである:
 *   1. 成立役契機の抽選     … flag が LOSE/BELL/REPLAY(CZ_ENTRY に行が無い)
 *   2. ステージの毎ゲーム抽選 … subState が COLD_START(czPerGame が 0 の帯)
 *   3. 天井の強制CZ         … NOT_CEILING_GAME
 *   4. レバーONフリーズ      … freeze が false
 * 前兆中も外す(数ゲーム後の当選を保持していることがあるうえ、前兆に画面を譲る)。
 * **batch3 / batch4 / batch5 と1文字も違わないこと**(違うと候補プールが割れて、
 * 上の「弱の重みの付け替えでは P が動かない」という証明が崩れる)。
 */
const WEAK_WHEN = {
  event: 'leverOn',
  flag: ['LOSE', 'BELL', 'REPLAY'],
  mode: ['FREE_TIER'],
  match: {
    'modeState.zenchoActive': [false],
    'modeState.games': NOT_CEILING_GAME,
    'modeState.subState': ['COLD_START'],
    freeze: [false],
  },
};

/**
 * 【弱】ガセ予告の共通形。batch5 の weakYokoku と同じ骨組み。
 * 「何かが起きかけたが、それ以上は進まなかった」を第3停止で言い切る。
 *
 * @param {object} p
 * @param {string} p.id
 * @param {string} p.name
 * @param {string} p.text 結論行のメイン(そのゲームで起きたこと)
 * @param {string} p.sub  結論行のサブ(AWSの事実)
 * @param {string} [p.anim] 自前で文字を描かない液晶アニメ
 * @param {object} [p.animParams]
 * @param {string} [p.sfx]
 * @param {number} [p.gain]
 * @param {number} p.weight
 */
function weakYokoku({
  id, name, text, sub,
  anim = 'step_up', animParams = { step: 1 }, sfx = 'ui_select', gain = 0.45, weight,
}) {
  return {
    id,
    name,
    when: WEAK_WHEN,
    weight: { FREE_TIER: weight, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1200,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: sfx, gain } },
      { at: 0, layer: 'lcd', action: 'anim', params: { anim, ...animParams } },
      conclusionCue({ flag: 'LOSE', text, sub, ms: 800 }),
    ],
  };
}

/**
 * 【中】レア役限定の共通形。batch5 の midYokoku と同じ骨組み。
 * 成立役が1つに決まるものは役色、決まらないものは中立色を明示する(U62)。
 *
 * @param {object} p
 * @param {string} p.id
 * @param {string} p.name
 * @param {string[]|null} [p.flag] null なら rare:true(レア役全般)
 * @param {string} p.text
 * @param {string} p.sub
 * @param {string|null} [p.color] 役が1つに決まらないときだけ渡す
 * @param {string} [p.anim]
 * @param {object} [p.animParams]
 * @param {string} [p.sfx]
 * @param {number} p.weight
 */
function midYokoku({
  id, name, flag = null, text, sub, color = null,
  anim = 'step_up', animParams = { step: 3 }, sfx = 'charge_up', weight,
}) {
  const when = flag
    ? { event: 'leverOn', flag, mode: ['FREE_TIER'] }
    : { event: 'leverOn', rare: true, mode: ['FREE_TIER'] };
  return {
    id,
    name,
    when,
    weight: { FREE_TIER: weight, default: 0 },
    duration: 2100,
    cues: [
      { at: 0, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: sfx } },
      { at: 40, layer: 'lcd', action: 'anim', params: { anim, ...animParams } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      ...(flag && !color
        ? [{
          waitFor: 'stop3',
          after: 80,
          layer: 'overlay',
          action: 'flash',
          params: { color: colorForFlag(flag), ms: 200 },
        }]
        : []),
      conclusionCue({ flag, text, sub, color, after: 120, ms: 1300 }),
    ],
  };
}

export default [
  /* ══ 1. Amazon EC2(インスタンスの状態遷移)══════════════════════════
   * EC2 のインスタンスは pending(起動処理中)→ running(使える)と状態が変わる。
   * 「立ち上がりきるか」が当落の比喩で、弱は pending のまま終わる。
   * 台数の話(AS_RUSH)でも CPUクレジットの話(EC2_BURST)でもないので画がかぶらない。 */
  weakYokoku({
    id: 'ymg_ec2_state_weak',
    name: '【弱】EC2予告(pending のまま起動しきらない)',
    text: 'PENDING のまま',
    sub: 'EC2 — インスタンスがまだ起動しきっていない',
    weight: 42,
  }),
  midYokoku({
    id: 'ymg_ec2_state_mid',
    name: '【中】EC2予告(インスタンスが running になる)',
    text: 'RUNNING になった',
    sub: 'EC2 — インスタンスが起動して使える状態になった',
    // レア役全般で出る = 役を1つに絞れないので中立色(U62)
    color: COLOR_MID,
    sfx: 'charge_up',
    weight: 35,
  }),

  /* ══ 2. Amazon S3(バージョニング)═══════════════════════════════════
   * バージョニングを有効にした S3 は、削除しても「削除マーカー」が載るだけで
   * 前の版は残っている。上書きしても前の版を取り出せる。
   * 絵柄飛来・風・Firehose の着地とは別の側面。 */
  weakYokoku({
    id: 'ymg_s3_versioning_weak',
    name: '【弱】S3予告(削除マーカーが付いただけ)',
    text: 'DELETE MARKER',
    sub: 'S3 — 削除の印が載っただけで中身は消えていない',
    anim: 'checklist_green',
    animParams: { index: 1 },
    weight: 40,
  }),
  midYokoku({
    id: 'ymg_s3_versioning_mid',
    name: '【中】S3予告(前の版を取り戻す = スイカ成立)',
    flag: ['MELON'],
    text: '前の版を取り戻した',
    sub: 'S3 のバージョニング — 上書きする前のファイルに戻せる',
    anim: 'pillar_raise',
    animParams: { index: 3, count: 4 },
    sfx: 'pillar_up',
    weight: 36,
  }),

  /* ══ 3. AWS Lambda(レイヤー)════════════════════════════════════════
   * レイヤーは共通のライブラリを関数本体と分けて置く仕組み。
   * 置いただけでは何も起きず、関数に紐付けて初めて使われる。
   * コールドスタート(無音の間)・同時実行数・関数URL とは別の側面。 */
  weakYokoku({
    id: 'ymg_lambda_layer_weak',
    name: '【弱】Lambda予告(レイヤーを置いただけ)',
    text: 'LAYER 追加のみ',
    sub: 'Lambda — 共通ライブラリを置いたが、関数はまだ使っていない',
    weight: 40,
  }),
  midYokoku({
    id: 'ymg_lambda_layer_mid',
    name: '【中】Lambda予告(全関数が同じ部品を使う = チャンス目成立)',
    flag: ['CHANCE'],
    text: '全部の関数が同じ部品を見た',
    sub: 'Lambda レイヤー — 共通ライブラリを関数どうしで使い回せる',
    anim: 'cw_graph_appear',
    animParams: {},
    sfx: 'stream_flow',
    weight: 36,
  }),

  /* ══ 4. AWS IAM(ポリシー評価と一時的な認証情報)═══════════════════
   * IAM の判定は「明示的な拒否がいちばん強い」= 許可がいくつあっても通らない。
   * 一方、ロールを引き受ける(AssumeRole)と期限つきの鍵がもらえる。
   * ロールのバッジ(heavy)・鍵の復号(KMS)・関所(Lake Formation)とは別の側面。 */
  weakYokoku({
    id: 'ymg_iam_deny_weak',
    name: '【弱】IAM予告(明示的な拒否で通らない)',
    text: 'EXPLICIT DENY',
    sub: 'IAM — 明示的な拒否は、どの許可よりも優先される',
    anim: 'checklist_green',
    animParams: { index: 1 },
    sfx: 'ui_select',
    gain: 0.4,
    weight: 40,
  }),
  midYokoku({
    id: 'ymg_iam_assume_mid',
    name: '【中】IAM予告(一時的な鍵が発行される = IAM 成立)',
    flag: ['WEAK_CHERRY', 'STRONG_CHERRY'],
    text: '期限つきの鍵が出た',
    sub: 'IAM — ロールを引き受けると、期限つきの認証情報がもらえる',
    anim: 'checklist_green',
    animParams: { index: 3 },
    sfx: 'contract_sign',
    weight: 37,
  }),

  /* ══ 5. Amazon VPC(通信が届くかどうか)═══════════════════════════
   * セキュリティグループは「通してよい通信」だけを書く仕組みなので、
   * 書いていない通信は届かない。外に出るにはルートテーブルの経路も要る。
   * VPC Lattice の結線(zencho)とは別の側面。 */
  weakYokoku({
    id: 'ymg_vpc_sg_weak',
    name: '【弱】VPC予告(セキュリティグループに許可がなく届かない)',
    text: '許可が無くて届かない',
    sub: 'セキュリティグループ — 通してよい通信を書いていないと届かない',
    anim: 'cw_graph_appear',
    animParams: {},
    weight: 40,
  }),
  midYokoku({
    id: 'ymg_vpc_route_mid',
    name: '【中】VPC予告(外への経路が1本通る)',
    text: '外への経路が通った',
    sub: 'VPC のルートテーブル — 出口へ向かう経路が1本追加された',
    // レア役全般で出る = 役を1つに絞れないので中立色(U62)
    color: COLOR_MID,
    anim: 'az_failover',
    animParams: {},
    sfx: 'region_light',
    weight: 35,
  }),

  /* ══ 6. Amazon SNS(購読確認とファンアウト)═══════════════════════
   * SNS はメールなどの宛先を登録しただけでは届かず、**確認**が済んで初めて通知が来る。
   * 確認が済めば、1回の発行が登録された全部の宛先へ一斉に配られる(ファンアウト)。
   * SNS はこの台の演出に一度も出ていない完全新規。 */
  weakYokoku({
    id: 'ymg_sns_subscribe_weak',
    name: '【弱】SNS予告(購読の確認が済んでいない)',
    text: 'SUBSCRIBE 未確認',
    sub: 'Amazon SNS — 宛先の確認が済むまで通知は届かない',
    sfx: 'countdown_tick',
    gain: 0.45,
    weight: 40,
  }),
  midYokoku({
    id: 'ymg_sns_fanout_mid',
    name: '【中】SNS予告(1件の通知が全員に配られる)',
    text: '1件が全員に届いた',
    sub: 'Amazon SNS — 1回の発行を登録済みの宛先すべてへ一斉に配る',
    // レア役全般で出る = 役を1つに絞れないので中立色(U62)
    color: COLOR_MID,
    anim: 'pillar_raise',
    animParams: { index: 3, count: 3 },
    sfx: 'pillar_up',
    weight: 34,
  }),
];
