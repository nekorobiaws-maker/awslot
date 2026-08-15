/**
 * 予告 第7弾(yb5_)。2026-08-15 ユーザー指示 U58「予兆パターンを +50」の通常時予告ぶん(32本)。
 *
 * yokoku-batch3.js / batch4.js の作法をそのまま踏襲した続編:
 *   弱 … ハズレ寄りの役で出る = そのゲームの当選は 0%(= ガセ)
 *   中 … レア役でしか出ない   = 成立役の当選率がそのまま信頼度
 *   熱 … 上位レア役でしか出ない(中の一番上。専用の色は持たない)
 *
 * ══ U5(予告の総量は増やさない)をどう守っているか ═══════════════════
 *
 * director は「候補の中から weight で1本選び、その1本の chance で発火を間引く」ので、
 * **候補を増やしただけでは発火率は上がらない**(取り分が移るだけ)。
 * 上がるのは「chance を持たない候補」を chance 持ちのプールへ足したときだけ。
 *   → 弱(ハズレ寄り)は chance: CHANCE_WEAK。既存の弱予告と同じ値
 *   → 中・熱(レア役限定)は chance なし。レア役プールは元から必ず1本出るので総量は動かない
 * 既存演出の取り分はそのぶん相対的に下がる(= 重みの按分)。
 * 数字を動かしたくなったら CHANCE_WEAK だけを触ればプール全体に効く。
 * ※ chance には director の YOKOKU_CHANCE_SCALE が掛かって実効値になる。
 *   **係数の値をここに写さないこと**(staging/director.js が唯一の正)。
 *
 * ══ 既存演出とのネタかぶりをどう避けたか(2026-08-15)═══════════════
 *
 * この台は20ファイル以上に予告が散っていて、AWSの主要サービスはほぼ既出。
 * そこで「サービス名がかぶらないこと」ではなく **「同じサービスの同じ画を出さないこと」**
 * を基準にした。既出サービスを使うものは、必ず別の機能・別の側面を題材にしている:
 *
 *   | サービス           | 既存の演出(場所)                         | この回の切り口                |
 *   |-------------------|------------------------------------------|------------------------------|
 *   | Trusted Advisor   | チェックリストが全部グリーン(cz / light)   | 黄色が1つ点いただけ            |
 *   | Compute Optimizer | 推奨「現状のままで最適」(batch3)           | 1つ下のサイズを勧められた       |
 *   | Lambda 関数URL     | 関数の実行そのもの(既存多数)               | HTTP の入口が1本生えた         |
 *   | License Manager   | 使用率メーター(devtools)                   | 残数が1つ減った                |
 *   | Amplify           | push のビルド進捗%(devtools)              | ブランチのプレビュー環境        |
 *   | ACM               | 証明書の発行(secnet)                       | 自動更新が1本終わった          |
 *   | Textract          | リールの絵柄を OCR(ai)                     | 伝票から**表**を抜き出す        |
 *   | Comprehend        | 感情分析 POSITIVE 判定(ai)                 | スコアがわずかに動いただけ       |
 *   | OpenSearch        | 検索クエリのヒット件数(ai)                  | インデックスへの**投入**        |
 *   | Redshift          | ウェアハウスのウォームアップ(ai)             | Serverless(使う時だけ起きる)   |
 *   | QuickSight        | グラフの棒が跳ねる(ai)                      | SPICE への取り込み             |
 *   | MemoryDB          | 書き込み待ちのまま(datamedia)               | 消えないインメモリという性質     |
 *   | DocumentDB        | 検索のヒット件数(datamedia)                 | MongoDB 互換という性質          |
 *   | AppFlow           | 同期の成否(datamedia)                       | ノーコードで繋がるという性質     |
 *   | Lake Formation    | 権限の一括付与(datamedia)                   | 入口の関所を通る                |
 *   | Neptune           | 全ノードが1つに繋がる(datamedia)            | 関係が輪になる(1本の閉路)      |
 *   | Transit Gateway   | 複数経路が1本に集約(secnet)                 | ハブに枝が1つぶら下がる         |
 *   | Direct Connect    | 専用線が直結する(secnet / wind / polly)     | VIF の BGP が Up になる         |
 *   | Global Accelerator| 最寄りのエッジへ着地(batch3)                | 静的IP2つで入口が変わる         |
 *   | Aurora            | RUSH の純増スケールアップ(rushes)           | 通常時に容量が伸び続ける        |
 *   | Shield            | 前兆中に攻撃を自動緩和(batch3)              | Advanced が特大の攻撃を受け切る  |
 *   | EventBridge Scheduler | カウントダウンのゼロ着地(devtools)     | 1回きりの予定が登録されただけ    |
 * ※ EventBridge Scheduler は devtools に既に2本(弱=延期される / 中=ゼロ着地で実行)ある。
 *   こちらは **時計が動く前**、「予定が入っただけ」で終わる画なので切り口が重ならない
 *   (向こうは ttl_zero のカウントダウン、こちらは step_up の1灯)。
 *   2026-08-15 椿レビュー #11 で、この表に落ちていたぶんを追記した。
 * 完全新規は Artifact / EBS スナップショット / FSx for Windows / AppStream 2.0 /
 * SES / Keyspaces / Wavelength / HyperPod / Nitro /
 * Application Recovery Controller の10サービス。
 * **提供終了・メンテモード入り(DeepRacer / RoboMaker / Ground Station / Snow Family /
 * Kendra / Q Business / QLDB / Timestream LiveAnalytics / IoT Events / Pinpoint /
 * App Runner)は1つも使っていない。**
 * ※ App Runner は 2026-04-30 に新規受付終了。2026-08-15 椿レビュー #1 で
 *   この回の yb5_apprunner_weak を **Lambda 関数URL** へ差し替えた(枠・重みは据え置き)。
 *
 * ══ 弱が「0%」を名乗れる条件(batch4 と同じ)═══════════════════════
 * 通常時に当選が生まれる経路は4つ。WEAK_WHEN で全部塞いである:
 *   1. 成立役契機の抽選     … flag が LOSE/BELL/REPLAY(CZ_ENTRY に行が無い)
 *   2. ステージの毎ゲーム抽選 … subState が COLD_START(czPerGame が 0 の帯)
 *   3. 天井の強制CZ         … NOT_CEILING_GAME
 *   4. レバーONフリーズ      … freeze が false
 * さらに前兆中(数ゲーム後の当選を保持していることがある)も除外。
 *
 * ══ 文言の3条件(U25)══════════════════════════════════════════════
 *   ① 初見で意味が分かる ② AWSネタが入っている ③ 事実に反しない
 * **数値のねつ造は禁止**。この回で数字を名乗っているのは出典が取れた3つだけ:
 *   Global Accelerator … 静的IPは2つ / Aurora … 読み取り複製は15台 /
 *   Step Functions 分散マップ … 並列1万(こちらは data/zencho.js の擬似連側)。
 * さらに **版で伸びる上限値は書かない**(2026-08-15 椿レビュー #2)。
 *   Aurora の「上限128TiB」は旧仕様で、新しいバージョンではもっと大きい。
 *   数字を落として「容量は自動で伸びる」だけを言う形に直してある。
 *
 * ══ 文字は必ず座布団の上に置く(V31-08 の教訓)═══════════════════════
 * 読ませる文字は **lcd.text だけ**で出す(下敷きが必ず敷かれる)。
 * 液晶アニメは **自前で文字を描かないもの** に限定:
 *   step_up / checklist_green / pillar_raise / az_failover /
 *   recover_burst / ttl_zero / cw_graph_appear
 *
 * ══ 色(U9 / U62)═══════════════════════════════════════════════════
 * 成立役を1つに絞れる中版は **その役の色**(色が出た = その役が成立した)。
 * 役をまたぐ中版(rare:true / 複数 flag)は中立色。弱は結論行なのでハズレ色(白)。
 * 色の正は data/rolecolors.js。**ここに16進を書かない**。
 */

// 天井(Auto Recovery)のゲーム数。NOT_CEILING_GAME の算出に使う(data/modes.js が唯一の正)
import { NORMAL_SUBSTATES } from '../modes.js';
// 結論行の作法(U57)と役色(U62)は data/rolecolors.js が唯一の正
import { conclusionCue, COLOR_NEUTRAL_MID } from '../rolecolors.js';

/**
 * ハズレ寄りプールに合わせた発火率。yokoku-batch3.js / batch4.js / bedrock.js と同値。
 * ここを揃えておけば本数が増えても総量は動かない。
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

/** ハズレ寄りの発火条件。「このゲームは当たらない」を名乗れる帯だけに限定する */
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

/** 上位レア役だけ(熱枠)。役が1つに決まらないので色は中立 */
const HOT_FLAGS = ['STRONG_CHERRY', 'CHANCE', 'SHARK', 'GHOST'];

/**
 * 【弱】ガセ予告の共通形。
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
 * @param {number} [p.weight]
 */
function weakYokoku({
  id, name, text, sub,
  anim = 'step_up', animParams = { step: 1 }, sfx = 'ui_select', gain = 0.45, weight = 54,
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
 * 【中・熱】レア役限定の共通形。
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
 * @param {number} [p.weight]
 * @param {boolean} [p.burst] 第3停止で recover_burst を足す(熱枠の見せ場)
 */
function midYokoku({
  id, name, flag = null, text, sub, color = null,
  anim = 'step_up', animParams = { step: 3 }, sfx = 'charge_up', weight = 48, burst = false,
}) {
  const when = flag
    ? { event: 'leverOn', flag, mode: ['FREE_TIER'] }
    : { event: 'leverOn', rare: true, mode: ['FREE_TIER'] };
  return {
    id,
    name,
    when,
    weight: { FREE_TIER: weight, default: 0 },
    duration: burst ? 2400 : 2100,
    cues: [
      { at: 0, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: sfx } },
      { at: 40, layer: 'lcd', action: 'anim', params: { anim, ...animParams } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      ...(burst
        ? [
          { waitFor: 'stop3', after: 60, layer: 'lcd', action: 'anim', params: { anim: 'recover_burst' } },
          { waitFor: 'stop3', after: 80, layer: 'overlay', action: 'particles', params: { preset: 'spark', x: 360, y: 300, count: 16 } },
        ]
        : []),
      conclusionCue({ flag, text, sub, color, after: 120, ms: 1300 }),
    ],
  };
}

export default [
  /* ══ 弱(ガセ)14本 ═══════════════════════════════════════════════
   * どれも「1つだけ動いた / まだそのまま」で終わる。当選は構造的に 0%。 */

  weakYokoku({
    id: 'yb5_artifact_weak',
    name: '【弱】AWS Artifact予告(監査資料を1枚落としただけ)',
    text: 'DOWNLOADED 1',
    sub: 'AWS の第三者監査報告書を1枚だけ取得した',
    anim: 'checklist_green',
    animParams: { index: 1 },
    weight: 56,
  }),
  weakYokoku({
    id: 'yb5_ebs_snapshot_weak',
    name: '【弱】EBSスナップショット予告(差分だけ静かに積まれる)',
    text: 'INCREMENTAL…',
    sub: 'ディスクの差分だけが静かに保存されている',
    anim: 'pillar_raise',
    animParams: { index: 1, count: 4 },
    weight: 55,
  }),
  weakYokoku({
    id: 'yb5_fsx_weak',
    name: '【弱】FSx for Windows予告(共有ドライブが生きているだけ)',
    text: 'Z: 接続中',
    sub: 'Windows のファイルサーバがまだ繋がっている',
    weight: 54,
  }),
  weakYokoku({
    id: 'yb5_appstream_weak',
    name: '【弱】AppStream 2.0予告(画面だけが流れてくる)',
    text: 'STREAMING…',
    sub: 'デスクトップアプリの画面だけが届いている',
    anim: 'cw_graph_appear',
    sfx: 'stream_flow',
    gain: 0.4,
    weight: 54,
  }),
  weakYokoku({
    id: 'yb5_ses_weak',
    name: '【弱】SES予告(サンドボックスのまま)',
    text: 'SANDBOX',
    sub: '検証済みの宛先にしかメールが届かない',
    weight: 56,
  }),
  weakYokoku({
    id: 'yb5_scheduler_weak',
    name: '【弱】EventBridge Scheduler予告(1回きりの予定が入っただけ)',
    text: 'ONE-TIME 登録',
    sub: 'EventBridge Scheduler — 1回きりの起動が予約された',
    anim: 'ttl_zero',
    sfx: 'countdown_tick',
    gain: 0.45,
    weight: 55,
  }),
  weakYokoku({
    id: 'yb5_trusted_advisor_weak',
    name: '【弱】Trusted Advisor予告(黄色が1つ点いただけ)',
    text: 'CHECK 1件 黄色',
    sub: 'Trusted Advisor — 点検で1項目だけ注意になった',
    anim: 'checklist_green',
    animParams: { index: 1 },
    weight: 53,
  }),
  weakYokoku({
    id: 'yb5_compute_optimizer_weak',
    name: '【弱】Compute Optimizer予告(1つ下でいいと言われる)',
    text: 'DOWNSIZE 推奨',
    sub: 'Compute Optimizer — 1つ下のサイズを勧められた',
    anim: 'cw_graph_appear',
    weight: 53,
  }),
  /*
   * 2026-08-15 椿レビュー #1。
   * 旧 yb5_apprunner_weak(App Runner の「起きてゼロへ戻る」)を差し替えた。
   * AWS App Runner は 2026-04-30 に新規受付を終了しており、
   * 「いま触れるサービス」を出す前提が崩れていたため。
   * **weight / chance / 尺 / アニメはすべて据え置き**なので発火量は1も動かない。
   */
  weakYokoku({
    id: 'yb5_lambda_url_weak',
    name: '【弱】Lambda 関数URL予告(入口が1本できただけ)',
    text: 'FUNCTION URL 発行',
    sub: 'Lambda に HTTP の入口が1本できただけ',
    weight: 54,
  }),
  weakYokoku({
    id: 'yb5_license_manager_weak',
    name: '【弱】License Manager予告(残数が1つ減っただけ)',
    text: 'LICENSE −1',
    sub: '持ち込みソフトのライセンスが1つ使われた',
    weight: 52,
  }),
  weakYokoku({
    id: 'yb5_amplify_preview_weak',
    name: '【弱】Amplify Hosting予告(プレビュー環境が立っただけ)',
    text: 'PREVIEW 環境',
    sub: 'AWS Amplify — ブランチごとの確認用サイトが立ち上がった',
    anim: 'checklist_green',
    animParams: { index: 1 },
    weight: 52,
  }),
  /*
   * 2026-08-15 ユーザー指示 U64-5「ACM前兆を前向きに」。
   * 旧: 'AUTO RENEW 待ち' / '更新期限が近づいている' + ttl_zero(残り時間ゼロの画)
   *   → 失効を煽る画だった。ACM は放っておいても更新してくれるサービスなので、
   *     **更新が終わった**画へ差し替える(アニメも緑のチェックへ)。
   * data/scenarios/yokoku-secnet.js の ys_acm_cert_* と同じ話に揃えてある。
   */
  weakYokoku({
    id: 'yb5_acm_renew_weak',
    name: '【弱】ACM予告(自動更新が1本終わっただけ)',
    text: 'AUTO RENEW 完了',
    sub: 'HTTPS 証明書を ACM が自動で更新した',
    anim: 'checklist_green',
    animParams: { index: 1 },
    sfx: 'ui_select',
    gain: 0.4,
    weight: 53,
  }),
  weakYokoku({
    id: 'yb5_textract_table_weak',
    name: '【弱】Textract予告(伝票から表が1つ取れただけ)',
    text: 'TABLE 1',
    sub: '書類の画像から表の形を1つだけ読み取った',
    anim: 'checklist_green',
    animParams: { index: 1 },
    weight: 52,
  }),
  weakYokoku({
    id: 'yb5_comprehend_weak',
    name: '【弱】Comprehend予告(感情スコアがわずかに動いただけ)',
    text: 'SENTIMENT やや+',
    sub: 'Amazon Comprehend — 感情の判定がプラスへ振れた',
    anim: 'cw_graph_appear',
    weight: 52,
  }),

  /* ══ 中(レア役限定)13本 ═════════════════════════════════════════
   * 役が1つに決まるものだけ役色。決まらないもの(rare:true)は中立色。 */

  midYokoku({
    id: 'yb5_keyspaces_mid',
    name: '【中】Keyspaces予告(Cassandra の文法のまま通る)',
    text: 'Cassandra のまま通った',
    sub: 'Keyspaces — 文法を変えずにマネージドへ載せられる',
    color: COLOR_MID,
    sfx: 'dynamo_scale',
    weight: 48,
  }),
  midYokoku({
    id: 'yb5_wavelength_mid',
    /*
     * 2026-08-15 椿レビュー #8。
     * Wavelength Zone が置かれるのは通信事業者のネットワークの内側であって、
     * 「基地局の中」ではない。サブ行と同じ「回線の内側」まで言い切りを弱めた。
     */
    name: '【中】Wavelength予告(通信回線の内側で処理が始まる = チャンス目成立)',
    flag: ['CHANCE'],
    text: '回線の内側で動き出した',
    sub: 'Wavelength — 携帯回線の内側でアプリが動く',
    anim: 'az_failover',
    animParams: {},
    sfx: 'region_light',
    weight: 48,
  }),
  midYokoku({
    id: 'yb5_redshift_serverless_mid',
    name: '【中】Redshift Serverless予告(倉庫が目を覚ます = スイカ成立)',
    flag: ['MELON'],
    text: '倉庫が目を覚ました',
    sub: 'Redshift Serverless — 分析用の倉庫が使う時だけ起きる',
    anim: 'pillar_raise',
    animParams: { index: 3, count: 4 },
    sfx: 'pillar_up',
    weight: 48,
  }),
  midYokoku({
    id: 'yb5_documentdb_mid',
    name: '【中】DocumentDB予告(MongoDB のつもりで投げた問い合わせが通る)',
    text: 'MongoDB のまま通った',
    sub: 'DocumentDB — 互換の問い合わせがそのまま動く',
    color: COLOR_MID,
    sfx: 'dynamo_scale',
    weight: 46,
  }),
  midYokoku({
    id: 'yb5_opensearch_index_mid',
    name: '【中】OpenSearch予告(インデックスに文書が刺さる = スイカ成立)',
    flag: ['MELON'],
    text: '文書が1件、刺さった',
    sub: 'OpenSearch のインデックスへ新しい文書が入った',
    anim: 'pillar_raise',
    animParams: { index: 2, count: 4 },
    sfx: 'pillar_up',
    weight: 46,
  }),
  midYokoku({
    id: 'yb5_memorydb_mid',
    name: '【中】MemoryDB予告(インメモリなのに消えない)',
    text: '書き込みが消えなかった',
    sub: 'MemoryDB — 速いのに消えないインメモリDB',
    color: COLOR_MID,
    anim: 'ttl_zero',
    animParams: {},
    sfx: 'dynamo_scale',
    weight: 46,
  }),
  midYokoku({
    id: 'yb5_directconnect_bgp_mid',
    name: '【中】Direct Connect予告(VIF の BGP が Up になる)',
    text: 'BGP が Up になった',
    sub: '専用線の仮想インターフェースが1本上がった',
    color: COLOR_MID,
    anim: 'az_failover',
    animParams: {},
    sfx: 'contract_sign',
    weight: 46,
  }),
  midYokoku({
    id: 'yb5_global_accelerator_ip_mid',
    name: '【中】Global Accelerator予告(静的IP2つで入口が変わる = チャンス目成立)',
    flag: ['CHANCE'],
    // 「静的IP2つ」は公式ドキュメントに書かれた仕様
    text: '静的IP 2つが向き先を変えた',
    sub: 'Global Accelerator — DNS を変えずに最寄りの AWS 拠点へ',
    anim: 'az_failover',
    animParams: {},
    sfx: 'stream_flow',
    weight: 46,
  }),
  midYokoku({
    id: 'yb5_quicksight_spice_mid',
    name: '【中】QuickSight予告(SPICE への取り込みが終わる)',
    text: 'SPICE へ取り込み完了',
    sub: '集めたデータをグラフで見せる準備が整った',
    color: COLOR_MID,
    anim: 'cw_graph_appear',
    animParams: {},
    sfx: 'checklist_ok',
    weight: 46,
  }),
  midYokoku({
    id: 'yb5_lakeformation_gate_mid',
    name: '【中】Lake Formation予告(入口の関所が開く = IAM 成立)',
    flag: ['WEAK_CHERRY', 'STRONG_CHERRY'],
    text: '関所が開いた',
    sub: 'Lake Formation — データレイクの権限が通った',
    anim: 'checklist_green',
    animParams: { index: 2 },
    sfx: 'contract_sign',
    weight: 46,
  }),
  midYokoku({
    id: 'yb5_appflow_nocode_mid',
    name: '【中】AppFlow予告(SaaS の向こうからレコードが渡ってくる)',
    text: 'SaaS の向こうから届いた',
    sub: 'AppFlow — ノーコードで SaaS と AWS をつなぐ',
    color: COLOR_MID,
    sfx: 'stream_flow',
    weight: 45,
  }),
  midYokoku({
    id: 'yb5_transit_gateway_branch_mid',
    name: '【中】Transit Gateway予告(ハブに枝が1本ぶら下がる)',
    text: 'ハブに枝が1本増えた',
    sub: 'Transit Gateway — 多数の VPC を1つのハブで束ねる',
    color: COLOR_MID,
    anim: 'pillar_raise',
    animParams: { index: 2, count: 3 },
    sfx: 'pillar_up',
    weight: 45,
  }),
  midYokoku({
    id: 'yb5_neptune_loop_mid',
    name: '【中】Neptune予告(関係が1本つながって輪になる)',
    text: '関係が輪になった',
    sub: 'Neptune — 人やモノの「関係」を保存して辿れる',
    color: COLOR_MID,
    sfx: 'charge_up',
    weight: 45,
  }),

  /* ══ 熱(上位レア役限定)5本 ══════════════════════════════════════
   * 強チェリー / チャンス目 / サメ揃い / ゴースト揃いでしか出ない。
   * 役が1つに決まらないので色は中立(赤帯は前兆側の専用表現なので使わない)。 */

  midYokoku({
    id: 'yb5_hyperpod_hot',
    name: '【熱】SageMaker HyperPod予告(大量のGPUが1本の学習へ束ねられる)',
    flag: HOT_FLAGS,
    text: 'GPU が1本に束ねられた',
    sub: 'HyperPod — 巨大AI学習のための専用クラスタ',
    color: COLOR_MID,
    anim: 'pillar_raise',
    animParams: { index: 4, count: 4 },
    sfx: 'charge_up',
    weight: 44,
    burst: true,
  }),
  midYokoku({
    id: 'yb5_nitro_hot',
    name: '【熱】Nitro System予告(仮想化がハードへ降りる)',
    flag: HOT_FLAGS,
    text: 'ホストの中身が消えた',
    sub: 'Nitro — 仮想化処理を専用チップへ逃がす EC2 の土台',
    color: COLOR_MID,
    anim: 'az_failover',
    animParams: {},
    sfx: 'freeze_hit',
    weight: 44,
    burst: true,
  }),
  midYokoku({
    id: 'yb5_aurora_limit_hot',
    /*
     * 2026-08-15 椿レビュー #2。
     * 「上限128TiB」は旧仕様で、新しいバージョンではさらに大きい。
     * 版で伸びる数字は名乗らず、版が変わっても正しい
     * 「容量は自動で伸びる / 読み取り複製は15台まで」だけを言う形にした。
     * pillar_raise(柱が伸びる絵)は **むしろ「自動で伸びる」に合う**のでそのまま。
     */
    name: '【熱】Aurora予告(クラスタ容量が自動で伸び続ける)',
    flag: HOT_FLAGS,
    text: '容量が伸び続けている',
    // 読み取り複製15台はクラスタ構成の上限で、こちらは公式ドキュメントの値
    sub: 'Aurora — 容量は自動で伸び、読み取り複製は15台まで',
    color: COLOR_MID,
    anim: 'pillar_raise',
    animParams: { index: 4, count: 4 },
    sfx: 'pillar_up',
    weight: 44,
    burst: true,
  }),
  midYokoku({
    id: 'yb5_arc_failover_hot',
    name: '【熱】Application Recovery Controller予告(切り替えのレバーが引かれる)',
    flag: HOT_FLAGS,
    text: '切り替えのレバーが引かれた',
    sub: 'ARC — 障害時のリージョン切替を安全に実行する',
    color: COLOR_MID,
    anim: 'az_failover',
    animParams: {},
    sfx: 'region_light',
    weight: 44,
    burst: true,
  }),
  midYokoku({
    id: 'yb5_shield_advanced_hot',
    name: '【熱】Shield Advanced予告(特大の攻撃を全部エッジで受け止める)',
    flag: HOT_FLAGS,
    text: '全部エッジで受け止めた',
    sub: 'Shield Advanced — 24時間体制の上位DDoS防御',
    color: COLOR_MID,
    anim: 'checklist_green',
    animParams: { index: 3 },
    sfx: 'edge_hit',
    weight: 44,
    burst: true,
  }),
];
