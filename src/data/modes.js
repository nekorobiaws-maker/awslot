/**
 * モード定義データ。DESIGN.md 3.4〜3.13 の値をそのまま保持する。
 *
 * Phase 5 で全モードのハンドラが接続済み:
 *   FREE_TIER(内部状態3段階+天井999G) / CZ 3種 / BONUS 3種 / AS_RUSH
 *   派生ゾーン(SPOT_ZONE, EC2_BURST, GRAVITON, RESERVED)
 *   上乗せ特化(CLOUDFRONT, KINESIS, STEP_FUNCTIONS)
 *   上位AT(SERVERLESS_RUSH, MULTI_REGION)
 *   引き戻し(HOT_STANDBY, ROUTE53_FAILOVER) / エンディング(REINVENT_ED)
 */

/**
 * 通常時の内部状態(DESIGN.md 3.4)
 *
 * 表示名の変更(2026-08-13 スコアアタック化):
 * 「Free Tier / Cold Start / SLA」といった料金・契約まわりの言葉は、
 * 見た瞬間に強さが分からずステージ示唆として機能していなかった。
 * 通常 / 高確 / 激アツ が一目で伝わる運用現場の言葉へ寄せる。
 *   平常リージョン → トラフィック急増 → War Room
 * 内部IDは各所から参照されるため変更しない(表示名だけ差し替える)。
 */
export const NORMAL_SUBSTATES = {
  id: 'normal_substates',
  states: [
    // 表示名は実際のステージ背景(assets/ui/stage_*.png)の場所と一致させること(2026-08-13 ユーザー指示)
    { id: 'COLD_START',  name: '通常ステージ',   short: '通常',   czMultiplier: 1.0, stage: 'stage_cold' },
    { id: 'WARM_POOL',   name: 'サミット会場',   short: '高確',   czMultiplier: 2.0, stage: 'stage_warm' },
    { id: 'PROVISIONED', name: 'Invent会場',     short: '激アツ', czMultiplier: 4.0, stage: 'stage_prov' },
  ],
  /**
   * ステージ昇格(2026-08-13 ユーザー指示で主ルート化)。
   *
   * 「通常ステージから簡単にCZに入りすぎ。高確/激アツに入ってからCZ、が王道」
   * を受けて、**レア役の価値を「CZ抽選」から「ステージ昇格抽選」へ移した**。
   * 通常 → サミット会場(高確) → Invent会場(激アツ) と上がるほど
   * CZが目前に迫る、という導線をゲームの背骨にする。
   * Bedrock役(ALARM)も昇格だけには絡ませて「払出だけの役」にしない。
   */
  upgrade: {
    ALARM:         { WARM_POOL: 0.18, PROVISIONED: 0.05 },
    WEAK_CHERRY:   { WARM_POOL: 0.45, PROVISIONED: 0.18 },
    MELON:         { WARM_POOL: 0.65, PROVISIONED: 0.30 },
    CHANCE:        { WARM_POOL: 0.78, PROVISIONED: 0.42 },
    STRONG_CHERRY: { WARM_POOL: 0.90, PROVISIONED: 0.65 },
    SHARK:         { WARM_POOL: 1.00, PROVISIONED: 0.90 },
  },
  previousUpgrade: {
    WEAK_CHERRY:   { WARM_POOL: 0.20, PROVISIONED: 0.02 },
    MELON:         { WARM_POOL: 0.35, PROVISIONED: 0.05 },
    CHANCE:        { WARM_POOL: 0.50, PROVISIONED: 0.10 },
    STRONG_CHERRY: { WARM_POOL: 0.60, PROVISIONED: 0.25 },
  },
  /**
   * ステージ滞在中の「毎ゲームCZ抽選」(2026-08-13 新設)。
   *
   * レア役は約1/25でしか引けないので、レア役契機のCZ抽選だけでは
   * 「激アツに上がったのに何も起きないまま転落」が頻発する。
   * ステージ自体に毎ゲームの当選チャンスを持たせて、
   *   高確   … 1/50G 程度で勝負がかかる
   *   激アツ … **数ゲーム以内にほぼ勝負が決まる**(CZ or ボーナス直結級)
   * というリズムを作る。通常ステージは 0(= 直接CZはレア役契機のみの狭き門)。
   */
  czPerGame: { COLD_START: 0, WARM_POOL: 0.19, PROVISIONED: 0.58 },
  /** 激アツの毎ゲーム抽選のうち、CZではなくボーナス直撃になる割合 */
  bonusShareOfStageDraw: { COLD_START: 0, WARM_POOL: 0.10, PROVISIONED: 0.30 },
  /**
   * 転落率(2026-08-13 引き上げ)。
   * 「ステージが上がる → 数G以内に勝負が起きる」リズムにするため、
   * 上位ステージは長居させない。激アツは平均約9G、高確は平均約17Gで落ちる。
   */
  downgradePerGame: { PROVISIONED: 0.08, WARM_POOL: 0.03 },
  previousDowngradePerGame: { PROVISIONED: 0.03, WARM_POOL: 0.02 },
  /**
   * 天井(2026-08-13 スコアアタック化で 999G → 30G)。
   * 1プレイが50回転しかないので、999G天井は永久に到達しない死に仕様だった。
   * 「30回転回して当たらなければ自動復旧が走る」= CZ確定に読み替える。
   * SLA / サービスクレジットの名義は廃止。
   */
  ceiling: { games: 30, name: 'Auto Recovery', action: 'FORCE_CZ' },
  /** 旧値(999G / SLA 99.9% 保証)。変更前の基準として保持 */
  originalCeiling: { games: 999, name: 'SLA 99.9% 保証' },
};

/**
 * CZ当選抽選(DESIGN.md 3.5)
 *
 * バランス調整(2026-08-13 その1): 設計書の初期値では総合初当りが 1/628G と渋すぎたため、
 * CZ当選率と直撃率を 1/100G 狙いまで引き上げた。
 *
 * 再調整(2026-08-13 その2 / レビュー指摘): その1の値は上げすぎで、以下2つを壊していた。
 *  1) czMultiplier(×2/×4)を掛けると 0.52/0.65/0.85/0.80 の行が 1.0 に飽和し、
 *     Warm Pool と Provisioned が実質同じ = 内部状態3段階(3.4 / M01)が死ぬ
 *  2) 通常時のCZが 1/55G まで上がり、天井999G(3.4)の到達確率が 1e-8 になって
 *     天井演出 sla_credit / ボイス kiro_ceiling_01 / 液晶の天井ゲージが全部死にコンテンツ化
 * そこで「設計書の初期値の約1.5〜1.7倍」まで戻した。実測(200,000G × 3シード):
 *     CZ 1/157G / ボーナス初当り 1/235〜255G / AT初当り 1/169〜186G
 *     天井到達率 0.6〜1.0%(=100回に1回弱は999Gまでハマる)/ 機械割 115〜120%
 * AT初当りは DESIGN.md 3.5 が掲げる「約1/180G」にほぼ一致する。
 * 一方でボーナス初当りの「約1/98G」は、同じ 3.5 のテーブルからは元々導けない
 * (設計書の初期値で計算しても 1/480G)ため、AT初当り側を基準に合わせている。
 * なお 1/98G を採ると 999G 天井の到達確率は 0.004% となり、天井と両立しない。
 *
 * ※ 飽和対策そのものは game/lottery.js の applyCzMultiplier(非当選率側への乗算)で行う。
 */
export const CZ_ENTRY = {
  id: 'cz_entry',
  note: '確率は czMultiplier を適用(飽和しないよう 1-(1-p)^mult で合成)',
  /**
   * スコアアタック化に伴う再調整(2026-08-13 その3):
   * 1プレイ50回転なので「1回も当たらずに終わる回」を減らすのが最優先。
   * 天井が30Gへ短縮されたぶん通常時の滞在が短くなり、
   * レア役1回あたりの価値を上げないと抽選機会そのものが足りなくなる。
   * 目安はボーナス初当り 1/40〜50(通常時G基準)。
   *
   * 突破率の格差付けに伴う再調整(2026-08-13 その4 / ユーザー指示)
   *
   * CZの平均突破率を 68% → 44% へ落としたので、そのままだとボーナス初当りが痩せる。
   * 「CZにはよく入るが、抜けられるかはCZの格次第」というメリハリにするため、
   * **CZ当選率をおよそ1.6倍**へ引き上げて総合の初当りを据え置いた。
   * 上げ幅は低確率帯(Bedrock役・弱チェリー・スイカ)に厚く配分している。
   * 強い役は元々0.8前後で、これ以上上げると czMultiplier(高確×2 / 激アツ×4)が
   * 飽和して内部状態3段階が意味を失うため(3.4)。
   */
  table: {
    // ALARM(Bedrock役。絵柄は脳+回路)は DESIGN.md 3.1 の「特殊役」。
    // レア役ではないので内部状態の昇格には絡まないが、CZ抽選にだけ参加させて
    // 「払出だけの役」にならないようにしている。
    /**
     * 2026-08-13 ユーザー指示「通常ステージから簡単にCZに入りすぎ」。
     * ここは **通常ステージ(COLD_START)基準の値** で、czMultiplier が掛かる前の素の確率。
     * 通常からの直接CZは「まれに起きる嬉しい事故」の水準まで落とし、
     * レア役の主な仕事は NORMAL_SUBSTATES.upgrade(ステージ昇格)へ移した。
     */
    ALARM:         { cz: 0.04, bonus: 0.000, direct_at: 0.00 },
    WEAK_CHERRY:   { cz: 0.09, bonus: 0.000, direct_at: 0.00 },
    MELON:         { cz: 0.15, bonus: 0.045, direct_at: 0.00 },
    CHANCE:        { cz: 0.20, bonus: 0.090, direct_at: 0.00 },
    STRONG_CHERRY: { cz: 0.30, bonus: 0.220, direct_at: 0.02 },
    SHARK:         { cz: 0.60, bonus: 0.000, direct_at: 0.10 },
    GHOST:         { cz: 0.00, bonus: 1.000, direct_at: 0.00 },
  },
  /** ステージ経由ルートへ作り替える前の値(通常からでも1発でCZに入れた時代) */
  previousStageTable: {
    ALARM:         { cz: 0.35, bonus: 0.000, direct_at: 0.00 },
    WEAK_CHERRY:   { cz: 0.62, bonus: 0.000, direct_at: 0.00 },
    MELON:         { cz: 0.70, bonus: 0.030, direct_at: 0.00 },
    CHANCE:        { cz: 0.78, bonus: 0.070, direct_at: 0.00 },
    STRONG_CHERRY: { cz: 0.85, bonus: 0.180, direct_at: 0.02 },
    SHARK:         { cz: 0.85, bonus: 0.000, direct_at: 0.10 },
    GHOST:         { cz: 0.00, bonus: 1.000, direct_at: 0.00 },
  },
  /**
   * RUSH直撃の縮小(2026-08-13 ユーザー指摘「Auto Scaling RUSHに簡単に行きすぎ」)。
   * 直撃は「ボーナスを経由せずいきなりRUSH」なので、絞ってもボーナス初当りには影響しない。
   *   強チェリー 0.04 → 0.02 / サメ揃い 0.20 → 0.10
   */
  previousDirectAt: { STRONG_CHERRY: 0.04, SHARK: 0.20 },
  /** 突破率の格差付け前(CZ平均突破率68%時代)のCZ当選率 */
  previousCzTable: {
    ALARM:         { cz: 0.14, bonus: 0.000, direct_at: 0.00 },
    WEAK_CHERRY:   { cz: 0.30, bonus: 0.000, direct_at: 0.00 },
    MELON:         { cz: 0.50, bonus: 0.030, direct_at: 0.00 },
    CHANCE:        { cz: 0.60, bonus: 0.070, direct_at: 0.00 },
    STRONG_CHERRY: { cz: 0.78, bonus: 0.180, direct_at: 0.04 },
    SHARK:         { cz: 0.80, bonus: 0.000, direct_at: 0.20 },
    GHOST:         { cz: 0.00, bonus: 1.000, direct_at: 0.00 },
  },
  /** スコアアタック化の直前値(Phase 7-2 の再調整結果) */
  previousTable: {
    ALARM:         { cz: 0.03, bonus: 0.000, direct_at: 0.00 },
    WEAK_CHERRY:   { cz: 0.05, bonus: 0.000, direct_at: 0.00 },
    MELON:         { cz: 0.12, bonus: 0.005, direct_at: 0.00 },
    CHANCE:        { cz: 0.20, bonus: 0.020, direct_at: 0.00 },
    STRONG_CHERRY: { cz: 0.35, bonus: 0.080, direct_at: 0.00 },
    SHARK:         { cz: 0.80, bonus: 0.000, direct_at: 0.20 },
    GHOST:         { cz: 0.00, bonus: 1.000, direct_at: 0.00 },
  },
  /** DESIGN.md 3.5 の初期値(Phase 7-2 の再調整時の基準として保持) */
  originalTable: {
    WEAK_CHERRY:   { cz: 0.03, bonus: 0.00, direct_at: 0.00 },
    MELON:         { cz: 0.08, bonus: 0.00, direct_at: 0.00 },
    CHANCE:        { cz: 0.15, bonus: 0.01, direct_at: 0.00 },
    STRONG_CHERRY: { cz: 0.30, bonus: 0.05, direct_at: 0.00 },
    SHARK:         { cz: 0.80, bonus: 0.00, direct_at: 0.20 },
    GHOST:         { cz: 0.00, bonus: 1.00, direct_at: 0.00 },
  },
};

/**
 * CZ振り分けと突破率(DESIGN.md 3.6)
 *
 * 2026-08-13 ユーザー指示で4種目「Step Functions CZ」を追加し、振り分けを再配分した。
 *
 * 同日 追加指示(突破率の格差付け):
 *   「CZでボーナスが確定しまくる。ボーナスに行きやすいCZと行きにくいCZがあるべき」
 * それまでは全CZが 55〜85% = 入ればほぼ勝ちで、CZ種別を見分ける意味がなかった。
 *   CW_ALARM         30% … 頻出の入門CZ。抜けたら嬉しい(★☆☆)
 *   TRUSTED_ADVISOR  50% … 中位。全緑=確定の見せ方(★★☆)
 *   SFN_CZ           55% … 中位やや上。流れきる爽快感(★★☆)
 *   WELL_ARCHITECTED 85% … レアなご褒美CZ。天井30G経由の受け皿でもある(★★★)
 * 突破率を下げたぶんは CZ_ENTRY(CZ当選率)の引き上げで補償し、
 * 「CZにはよく入るが、抜けられるかはCZの格次第」というメリハリにしている。
 * 旧値は previousDistribution / previousSuccessRate に保持する。
 */
export const CZ_TYPES = {
  id: 'cz_types',
  distribution: {
    CW_ALARM: 0.50, TRUSTED_ADVISOR: 0.25, SFN_CZ: 0.15, WELL_ARCHITECTED: 0.10,
  },
  /** Step Functions CZ 追加前の振り分け(戻す時の基準として保持) */
  previousDistribution: { CW_ALARM: 0.60, TRUSTED_ADVISOR: 0.30, WELL_ARCHITECTED: 0.10 },
  /** 格差付け前の突破率(2026-08-13 午前の値) */
  previousSuccessRate: {
    CW_ALARM: 0.68, TRUSTED_ADVISOR: 0.72, SFN_CZ: 0.55, WELL_ARCHITECTED: 0.85,
  },
  specs: [
    {
      // スコアアタック化(2026-08-13): 5G → 4G / 突破率 0.48 → 0.58。
      // 50回転しかないので、CZ滞在そのものが持ち時間を食う。短く・当たりやすく。
      // 格差付け(同日): 一番よく入るCZなので、ここを絞って全体の初当りを制御する。
      id: 'CW_ALARM', name: 'CloudWatch アラートCZ', games: 3, successRate: 0.30,
      expectation: 1,
      // RUSHの門を狭める(2026-08-13): シャークボーナス(REG / atRate 低)寄りへ再配分。
      // ボーナスの当たりやすさは変えず、「ボーナス → RUSH」の接続だけを絞る。
      bonusDist: { LAMBDA_REG: 0.86, S3_BIG: 0.12, DYNAMO_BIG: 0.02 },
      previousBonusDist: { LAMBDA_REG: 0.70, S3_BIG: 0.25, DYNAMO_BIG: 0.05 },
      ui: 'graph',
    },
    {
      /**
       * DESIGN.md 2.2 M03: 5項目のチェックリスト。
       *
       * 仕様変更(2026-08-13 ユーザー指示): 「3項目以上グリーンで突破」から
       * **「5項目すべてグリーン = ボーナス確定」** へ。
       * 突破率(successRate)そのものは据え置きで、見せ方だけを
       * 「全緑になった瞬間が確定告知」に変えている。
       *   突破 … 最終ゲームで残り全部が一斉に緑へ点灯し、全緑 = ボーナス確定
       *   非突破 … failGreen(2項目)止まりで終了(= 3項目未満)
       * 最終ゲームまでは当落どちらも failGreen 個までしか緑にしないので、
       * 途中経過から結果は読めない(全緑の瞬間まで引っ張る)。
       */
      id: 'TRUSTED_ADVISOR', name: 'Trusted Advisor CZ', games: 5, successRate: 0.50,
      expectation: 2,
      bonusDist: { LAMBDA_REG: 0.62, S3_BIG: 0.30, DYNAMO_BIG: 0.08 },
      previousBonusDist: { LAMBDA_REG: 0.40, S3_BIG: 0.45, DYNAMO_BIG: 0.15 },
      ui: 'checklist',
      /**
       * 現行AWSの Trusted Advisor は「運用上の優秀性」を含む**6カテゴリ**
       * (2026-08-13 しおんのAWS正確性点検で指摘)。5項目のままだと実物と食い違うため追加した。
       * 突破率・振り分け・消化G数は据え置き。全緑は最終ゲームの一斉点灯なので、
       * 項目が1つ増えてもカスケードの本数が増えるだけで、ペースには影響しない。
       */
      items: [
        'コスト最適化', 'パフォーマンス', 'セキュリティ',
        '耐障害性', 'サービス制限', '運用上の優秀性',
      ],
      /** 変更前の5項目(サービス制限までの旧構成) */
      previousItems: ['コスト最適化', 'パフォーマンス', 'セキュリティ', '耐障害性', 'サービス制限'],
      /** 突破に必要なグリーン数 = 全項目。液晶の「GREEN n / 6」表示もこれを見る */
      greenNeeded: 6,
      /** 非突破時に点灯する上限(3項目未満で終わらせるための値) */
      failGreen: 2,
      /** 変更前の値(3項目以上グリーンで突破) */
      previousGreenNeeded: 3,
    },
    {
      /**
       * Step Functions CZ(2026-08-13 ユーザー指示で新設)
       *
       * 液晶にステートマシンのワークフローを描き、毎ゲーム1ステートずつ処理が進む。
       * **Success State まで流れきったらボーナス確定**、途中で Fail State に落ちたら終了。
       *
       * RUSH中の派生ゾーン STEP_FUNCTIONS(プレイヤー選択ありの上乗せチャレンジ)とは別物。
       * こちらは通常時のCZで**選択なし・自動進行**の見せ物に徹する。
       *
       * states の最後(Succeed)は「到達したら勝ち」の終端ステートなので、
       * Fail State へ落ちるのは 1〜4 番目のいずれか(failStepDist)。
       * = 最終ステートに到達した時点で突破確定になる。
       */
      id: 'SFN_CZ', name: 'Step Functions CZ', games: 5, successRate: 0.55,
      expectation: 2,
      bonusDist: { LAMBDA_REG: 0.58, S3_BIG: 0.32, DYNAMO_BIG: 0.10 },
      previousBonusDist: { LAMBDA_REG: 0.40, S3_BIG: 0.45, DYNAMO_BIG: 0.15 },
      ui: 'sfn',
      states: [
        { name: 'ValidateInput', type: 'Task' },
        { name: 'ProcessOrder',  type: 'Task' },
        { name: 'CheckStock',    type: 'Choice' },
        { name: 'NotifyUser',    type: 'Task' },
        { name: 'Succeed',       type: 'Succeed' },
      ],
      /**
       * 非突破時に Fail State へ落ちるステート番号(1始まり)の振り分け。
       * 後半ほど重くして「あと1つで Success State だったのに」を作る。
       * 平均 2.77ステート目 = 非突破時の平均消化は約2.8G。
       */
      failStepDist: { 1: 0.15, 2: 0.25, 3: 0.28, 4: 0.32 },
    },
    {
      // DESIGN.md 2.2 M04: W-A 6本の柱をジョージが運ぶ。6本すべてで DYNAMO_BIG 確定
      // 格差付け(2026-08-13)でも 0.85 を維持。ここは「引けたら勝ち」のご褒美CZで、
      // 天井(Auto Recovery 30G)の受け皿でもあるため下げない。
      // 2026-08-13 ユーザー指示: 柱6本に合わせて 5G → 6G(1G1本のペースで自然に)
      id: 'WELL_ARCHITECTED', name: 'Well-Architected CZ', games: 6, successRate: 0.85,
      expectation: 3,
      // ご褒美CZ / 天井の受け皿なので、REG寄せは控えめ(引けたら勝ちを維持)
      bonusDist: { LAMBDA_REG: 0.30, S3_BIG: 0.45, DYNAMO_BIG: 0.25 },
      previousBonusDist: { LAMBDA_REG: 0.05, S3_BIG: 0.55, DYNAMO_BIG: 0.40 },
      ui: 'pillars',
      pillars: ['運用', 'セキュリティ', '信頼性', '性能', 'コスト', '持続可能性'],
      /** 突破時に6本目まで立つ確率。全立で DYNAMO_BIG 確定(DC初期値+2) */
      allPillarsRate: 0.35,
    },
  ],
};

/**
 * ボーナス直撃時の振り分け。
 * DESIGN.md 3.5 は「bonus に当選するか」までしか定めていないため、
 * 種別の振り分けだけをここで定義する(当選率そのものは変えない)。
 */
export const DIRECT_BONUS_DIST = {
  id: 'direct_bonus_dist',
  byFlag: {
    GHOST:         { S3_BIG: 0.40, DYNAMO_BIG: 0.60 },
    STRONG_CHERRY: { LAMBDA_REG: 0.45, S3_BIG: 0.45, DYNAMO_BIG: 0.10 },
    default:       { LAMBDA_REG: 0.60, S3_BIG: 0.35, DYNAMO_BIG: 0.05 },
  },
};

export const CZ_SPEC_BY_ID = Object.fromEntries(CZ_TYPES.specs.map((s) => [s.id, s]));

/**
 * CZの期待度を★表記にする(2026-08-13 ユーザー指示)。
 *
 * 突破率に格差を付けた以上、突入した瞬間に「これは行きにくいCZ / ご褒美CZ」が
 * 伝わらないと理不尽な負けに見えてしまう。テロップと突入シナリオの両方で使う。
 * @param {object|string} specOrId
 * @returns {string} '★☆☆' 〜 '★★★'
 */
export function czStars(specOrId) {
  const spec = typeof specOrId === 'string' ? CZ_SPEC_BY_ID[specOrId] : specOrId;
  const n = Math.max(1, Math.min(3, Math.round(spec?.expectation ?? 1)));
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}

/**
 * ボーナス仕様(DESIGN.md 3.7)
 *
 * 仕様変更(2026-08-13 ユーザー決定):
 *  1. BIG BONUS(S3 BIG)  50G → **15G**
 *  2. REG BONUS(Lambda REG) 30G → **6G**
 *  3. 「固定純増n枚/G」方式を撤去し、ボーナス中は data/flags.js の BONUS_FLAGS を引いて
 *     **ベルが約1/1.2で揃い、揃うたびに15枚**払い出す実機方式へ変更
 * DynamoDB BIG はセット継続型のまま 1セット30G → **15G**(継続率0.70は不変)。
 *
 * 純増は約 9.76枚/G(BONUS_FLAGS の検算参照)。獲得量は旧仕様とほぼ同じで、
 * 消化ゲーム数だけが 1/3〜1/5 に短縮される = 「一気に増える」体感に寄せた変更。
 * ※ payoutPerGame は撤去済み。ボーナス中の払出は小役払出そのものを使う。
 *
 * 追加仕様(2026-08-13 ユーザー決定 その2): ボーナスは当選した瞬間には始まらない。
 * まず入賞待ち(BONUS_READY)へ入り、`entrySymbol` を揃えて初めて消化が始まる。
 *   BIG系(S3 / DynamoDB) … GHOST7(ゴースト7)を揃える
 *   REG (Lambda)         … SHARKBAR(サメBAR)を揃える
 */
export const BONUS_SPECS = {
  id: 'bonus_specs',
  specs: [
    {
      id: 'LAMBDA_REG', name: 'シャークボーナス', shortName: 'SHARK BONUS', type: 'games',
      // 2026-08-13 ユーザー決定: 6G → 3G(テンポ優先。平均獲得は約29枚)
      // atRate 0.50 → 0.20(2026-08-13「RUSHに簡単に行きすぎ」)。
      // シャークボーナスは「枚数はもらえるがRUSHには繋がりにくい」役回りにする。
      games: 3, previousGames: 6, atRate: 0.20, previousAtRate: 0.50, dcBonus: 0,
      entrySymbol: 'SHARKBAR', entryLabel: 'サメBAR',
      onAtFail: { nextSubState: 'WARM_POOL' },
    },
    {
      id: 'S3_BIG', name: 'ゴーストボーナス', shortName: 'GHOST BONUS', type: 'games',
      // 2026-08-13 ユーザー決定: 10G → 5G(平均獲得は約49枚)
      games: 5, previousGames: 10, atRate: 1.00, dcBonus: 0,
      entrySymbol: 'GHOST7', entryLabel: 'ゴースト7',
      // 「短い爆発」設計(2026-08-13): DC1〜2 スタートを基本にする
      dcInitDist: { 1: 0.80, 2: 0.15, 3: 0.05 },
      previousDcInitDist: { 2: 0.30, 3: 0.40, 4: 0.22, 5: 0.08 },
    },
    {
      id: 'DYNAMO_BIG', name: 'ゴーストボーナスSP', shortName: 'GHOST BONUS SP', type: 'set',
      // ゴースト系で揃える(ユーザー未指定だが S3_BIG と同じ流儀で 1セット 10G → 5G)
      setGames: 5, previousSetGames: 10, continueRate: 0.50, atRate: 1.00, dcBonus: 2,
      entrySymbol: 'GHOST7', entryLabel: 'ゴースト7',
      // SPは「最初から少し育った状態」で始まる(それでも上限は控えめ)
      dcInitDist: { 1: 0.30, 2: 0.40, 3: 0.20, 4: 0.10 },
      previousDcInitDist: { 4: 0.45, 5: 0.35, 6: 0.20 },
    },
  ],
  /** 旧仕様(固定純増方式)。変更前の基準として保持 */
  originalSpecs: {
    LAMBDA_REG: { games: 30, payoutPerGame: 2 },
    S3_BIG:     { games: 50, payoutPerGame: 3 },
    DYNAMO_BIG: { setGames: 30, payoutPerGame: 3 },
  },
};

export const BONUS_SPEC_BY_ID = Object.fromEntries(BONUS_SPECS.specs.map((s) => [s.id, s]));

/**
 * Auto Scaling RUSH のコア数値(DESIGN.md 3.8)
 *
 * バランス調整(2026-08-13): 設計書の継続率だと機械割が 187% まで伸びたため引き下げた。
 *
 * 原因: セット非継続は「DC-1して縮退運転で継続」なので、DCが尽きるまで終わらない。
 * 一方スケールアウトは1セット20Gあたり約0.20回発生するため、
 * 継続率が 0.80 を超える帯では「上がる速度 > 下がる速度」となりDCが上限8に張り付く。
 * (実測: 平均DC 6.42 / AT滞在83%)
 * そこで高DC帯の継続率を 0.78 以下に抑え、DCが 3〜4 で均衡するようにした。
 * 設計書の初期値は originalContinueRate に保持。
 */
export const AS_RUSH_CORE = {
  id: 'as_rush_core',
  /**
   * スコアアタック化(2026-08-13): 1セット 20G → 10G → **5G**(同日 ユーザー決定)。
   * 50回転しかない中で長いセットは「セット末に一度も辿り着かない」ことがあり、
   * 継続演出もスケールアウトの手応えも体験できずに終わっていた。
   * 5Gにすることで、1回のRUSHで何度もヘルスチェックのドキドキが来るテンポにする。
   */
  setGames: 5,
  /** 1セットの長さの変更履歴(戻す時の基準) */
  previousSetGames: [20, 10],
  dcRange: { min: 1, max: 8 },
  /**
   * 純増テーブルも同時に引き上げ(旧 1.0〜3.8 枚)。
   * 50回転のスコアアタックでは「持ち時間あたりに何枚出せるか」が全てなので、
   * DCを上げる=露骨に速くなる、が一目で分かる刻みにする。
   */
  /**
   * 1セット 10G → 5G(2026-08-13)に合わせて約1.25倍へ引き上げ。
   *
   * セットが短くなると「50回転を使い切った時点の残Gの買い取り」も半減するので、
   * セット短縮だけを入れると平均スコアが 223枚 → 190枚 まで落ちた。
   * 買い取りは(残G × 純増)なので、**純増を上げると消化中と買い取りの両方が戻る**。
   * DCが育つほど露骨に速くなる、という設計思想にも沿う補償方法。
   */
  /**
   * 純増(2026-08-13「波」の再設計)。
   * RUSH が「短い爆発」になったぶん、1回あたり60〜120枚が出るよう引き上げた。
   * DCが育った時の伸びしろ(DC8で70枚/G)が、まれな長期継続の快感を作る。
   */
  payoutPerGame: { 1: 13, 2: 17, 3: 21, 4: 27, 5: 35, 6: 45, 7: 58, 8: 74 },
  previousPayoutPerGameFlat: { 1: 2.2, 2: 3.0, 3: 4.0, 4: 5.5, 5: 7.5, 6: 10.0, 7: 14.0, 8: 19.0 },
  /** 1セッション50回転時代の純増(100回転化の直前値) */
  previousPayoutPerGame50: { 1: 4.5, 2: 6.0, 3: 8.0, 4: 11.0, 5: 15.0, 6: 21.0, 7: 28.0, 8: 38.0 },
  /** 1セット10G時代の純増(セット短縮前の基準) */
  previousPayoutPerGame10G: { 1: 3.0, 2: 4.5, 3: 6.0, 4: 8.0, 5: 11.0, 6: 15.0, 7: 20.0, 8: 28.0 },
  /**
   * セット継続率(1セット5G。2026-08-13 のセット短縮に合わせて引き上げ)
   *
   * セットが 10G → 5G になるとヘルスチェックの回数が2倍になり、
   * 「継続失敗 = DC-1 の縮退運転」も2倍のペースで走る。
   * 旧テーブルのままだと DC が育つ前に削られてRUSHが即死するので、
   * **非継続率を半分にする**(p' = 1 - (1-p)/2)変換で1ゲームあたりの
   * DC減少ペースを据え置いた。結果として 0.72〜0.90 の帯になる。
   *   → 「テンポよくヘルスチェックが来るが、DCが育つほど落ちにくい」
   */
  /**
   * セット継続率(2026-08-13「波」の再設計)。
   *
   * ユーザーの狙いは「**転落したり、またボーナスしたり**が面白い。まれに続くと快適」。
   * そこで **低DCでは即転落・高DCでは粘る** カーブにした。
   *   DC1〜2 … 1〜2セットで落ちる(短い爆発が基本形)
   *   DC5以上 … 0.75超で粘り始める(スケールアウトで育てば止まらない)
   * これで「短命が基本、伸びたら鳥肌」の分散になる。
   */
  continueRate: { 1: 0.22, 2: 0.32, 3: 0.46, 4: 0.62, 5: 0.75, 6: 0.84, 7: 0.90, 8: 0.94 },
  previousContinueRateFlat: { 1: 0.62, 2: 0.66, 3: 0.70, 4: 0.74, 5: 0.78, 6: 0.81, 7: 0.83, 8: 0.85 },
  /** 100回転化の直前値(高すぎるとユーザー指摘を受けた 0.75〜0.92) */
  previousContinueRate100: { 1: 0.75, 2: 0.79, 3: 0.82, 4: 0.85, 5: 0.87, 6: 0.89, 7: 0.91, 8: 0.92 },
  /** 1セット10G時代の継続率(セット短縮前の基準) */
  previousContinueRate: { 1: 0.45, 2: 0.53, 3: 0.60, 4: 0.66, 5: 0.71, 6: 0.75, 7: 0.78, 8: 0.80 },
  /** DESIGN.md 3.8 の初期値(Phase 7-2 の再調整時の基準として保持) */
  originalContinueRate: { 1: 0.50, 2: 0.60, 3: 0.70, 4: 0.78, 5: 0.84, 6: 0.88, 7: 0.91, 8: 0.93 },
  /** スコアアタック化の直前値(1セット20G時代の純増) */
  previousPayoutPerGame: { 1: 1.0, 2: 1.4, 3: 1.8, 4: 2.2, 5: 2.6, 6: 3.0, 7: 3.4, 8: 3.8 },
  /**
   * スケールアウト率(2026-08-13 ユーザー補足で全面的に引き上げ)。
   *
   * 【設計思想】このゲームは出玉が現金にならないので、
   * 「長く続く」こと自体には面白さがない。RUSH の楽しさは
   * **セット継続数ではなく DC(純増/G)がどこまで育つか**に置く。
   * そのため、スケールアウトはレア役限定の特別な出来事ではなく
   * **ベル・リプレイでも起きる日常的な見せ場**にした。
   * 合計すると約 0.19回/G = **5ゲームに1回**は台数が増える体感になる。
   */
  /**
   * スケールアウト率(2026-08-13「波」の再設計で全面的に引き下げ)。
   *
   * 旧値は「5ゲームに1回は台数が増える」= 毎ゲームDCが上がる勢いで、
   * ヘルスチェックの失敗によるDC低下を常に上回っていた。
   * その結果 **RUSHが構造的に終わらず**(実測 滞在32G/回)、
   * 「一度入ったらセッションが終わるまで続く」原因になっていた。
   * ベル・リプレイでの日常的なスケールアウトをやめ、
   * **レア役を引けた時だけ台数が増える = まれな好循環の種** に戻した。
   */
  scaleOut: {
    BELL:          0.06,
    REPLAY:        0.03,
    // Bedrock役は「推論リクエストが増えてスケールする」契機というモチーフ
    ALARM:         0.20,
    WEAK_CHERRY:   0.24,
    MELON:         0.36,
    CHANCE:        0.44,
    STRONG_CHERRY: 0.64,
    SHARK:         1.00,
    GHOST:         1.00,
  },
  /** 「毎ゲーム増える」時代の値(RUSHが終わらなくなった原因) */
  previousScaleOut: {
    BELL: 0.72, REPLAY: 0.38, ALARM: 0.50, WEAK_CHERRY: 0.60, MELON: 0.80,
    CHANCE: 0.90, STRONG_CHERRY: 1.00, SHARK: 1.00, GHOST: 1.00,
  },
  /**
   * DC が高いほどスケールアウトしにくくする係数(実機の「上ほど渋い」表現)。
   * 序盤の見せ場は頻繁に、上限8への到達は「狙える夢」として残すための調整。
   * これが無いと 50回転のうちに誰でも DC8 に届いてしまい、成長の物語が消える。
   */
  /**
   * 1セッション100回転化(2026-08-13)に合わせて再計算。
   * この係数の目的はコメントのとおり「誰でもDC8に届いてしまう」のを防ぐことだが、
   * 持ち時間が倍になったぶん旧値では平均最大DCが 7.2 まで上がり、
   * どのセッションも同じように上限へ張り付いて成長の物語が消えていた。
   * 実測の平均最大DCが 5.5(DC8到達は一部のセッションだけ)になる値へ引き締めた。
   */
  scaleOutDcFactor: { 1: 1.00, 2: 0.90, 3: 0.75, 4: 0.60, 5: 0.45, 6: 0.30, 7: 0.18, 8: 0 },
  /** 50回転時代の係数 */
  previousScaleOutDcFactor: { 1: 1.00, 2: 1.00, 3: 0.90, 4: 0.75, 5: 0.60, 6: 0.42, 7: 0.28, 8: 0 },
  /**
   * スケールイン(継続失敗時のDC低下)。100回転化(2026-08-13)で追加。
   * この台数以上では一気に2台減らす = 「育てた台数は失うのも早い」。
   * これが無いと DC が尽きず、100回転の半分近くが RUSH のままになる。
   */
  steepScaleInFrom: 2,
  scaleInDrop: 2,
  /** 強いレア役はまれに一気に2台増える(DC+2 のダブルスケールアウト) */
  doubleScaleOut: { STRONG_CHERRY: 0.35, SHARK: 0.60, GHOST: 1.00, CHANCE: 0.10 },
  /**
   * 高DC帯のベル強化(純増の「小さな波」)。
   * 単調な等速消化にならないよう、DCが育つほどベルが跳ねるようにする。
   * 値はそのゲームの払出に上乗せする枚数。
   */
  bellBoost: { 3: 5, 4: 10, 5: 16, 6: 24, 7: 35, 8: 50 },
  note: '純増と継続率を単一パラメータ DC が兼ねる。楽しさの軸はセット数ではなく DC の成長。',
};

/**
 * RUSH中の派生ゾーン当選抽選(DESIGN.md 3.9)
 *
 * 各行は「上から順に累積で引く」テーブルとして扱う(合計が1未満なら残りは非当選)。
 * SHARK / GHOST は合計 1.00 なので必ずどれかに当選する。
 */
export const RUSH_DERIVED_ENTRY = {
  id: 'rush_derived_entry',
  trigger: 'on_rare_flag',
  // スコアアタック化(2026-08-13): RUSH滞在が数ゲームしかないため、
  // レア役1回あたりのゾーン当選率を大幅に引き上げた。
  // 「引いたら何か起きる」密度を上げないと、上振れルートが一生見られない。
  table: {
    MELON:         { CLOUDFRONT: 0.30, KINESIS: 0.20 },
    CHANCE:        { CLOUDFRONT: 0.38, KINESIS: 0.26, GRAVITON: 0.12 },
    STRONG_CHERRY: { CLOUDFRONT: 0.38, KINESIS: 0.28, EC2_BURST: 0.18, RESERVED: 0.10, STEP_FUNCTIONS: 0.06 },
    SHARK:         { SPOT_ZONE: 0.30, EC2_BURST: 0.25, KINESIS: 0.20, STEP_FUNCTIONS: 0.25 },
    GHOST:         { STEP_FUNCTIONS: 0.50, SPOT_ZONE: 0.30, SERVERLESS_UP: 0.20 },
  },
  onSetEnd: {
    note: 'セット継続成功時、5セット連続成功で SERVERLESS_RUSH へ昇格',
    /**
     * 1セット 5G 化(2026-08-13)で 3セット連続 = 15G と短くなり、
     * ほぼ毎回の RUSH が上位ATへ昇格していた(滞在24G/セッション)。
     * 旧10Gセット時代の 3セット=30G 相当になる 6セットへ。
     */
    SERVERLESS_UP_AT_STREAK: 6,
    previousStreak: 3,
  },
};

/**
 * Serverless RUSH への昇格契機(DESIGN.md 2.2 M09)
 *
 * 3.9 のテーブルには SHARK 経由の昇格が無いため、
 * 「RUSH中のサメ揃い」ぶんだけを独立した抽選として持つ。
 * 派生ゾーン抽選(3.9)よりも先に判定する。
 */
export const SERVERLESS_UPGRADE = {
  id: 'serverless_upgrade',
  onFlag: { SHARK: 0.30 },
  streak: RUSH_DERIVED_ENTRY.onSetEnd.SERVERLESS_UP_AT_STREAK,
};

/**
 * 派生ゾーン中の上乗せ特化ゾーン当選(入れ子)。
 * DESIGN.md 6.3「RUSH → ゾーン → 上乗せ特化」の3段スタックを成立させるための抽選。
 * 滞在型ゾーン(SPOT/BURST/GRAVITON/RESERVED)でのみ判定する。
 */
export const ZONE_NESTED_ENTRY = {
  id: 'zone_nested_entry',
  table: {
    STRONG_CHERRY: { CLOUDFRONT: 0.06 },
    SHARK:         { CLOUDFRONT: 0.25, KINESIS: 0.15 },
    GHOST:         { KINESIS: 0.50, CLOUDFRONT: 0.30 },
  },
};

/**
 * 派生ゾーン各仕様(DESIGN.md 3.10)
 *
 * スコアアタック化(2026-08-13)での再設計方針:
 *  1. 全ゾーンを 50回転に収まる長さへ短縮(Graviton 1セット50G などは持ち時間を食い潰す)
 *  2. **G数上乗せは +10G 程度まで**に抑える。50回転しかないので
 *     「+100G 上乗せ」は消化しきれず、そのまま買い取りへ流れて数字遊びになる
 *  3. 代わりに **純増ブースト**(DC+1 / 純増倍率)と **枚数の直接上乗せ**を主役にする。
 *     CloudFront / Kinesis の「セット大量上乗せ」は枚数ブーストへ置き換えた
 */
export const DERIVED_ZONE_SPECS = {
  id: 'derived_zone_specs',
  specs: [
    {
      id: 'SPOT_ZONE', name: 'Spot インスタンスゾーン', short: 'SPOT',
      payoutPerGame: 16, minGames: 6,
      interruptDenom: 12, graceGames: 2,
      note: '毎G 1/12 で中断通知 → 2G後に強制終了。最低6G保証。平均約12G',
    },
    {
      id: 'EC2_BURST', name: 'EC2 バーストモード', short: 'BURST',
      payoutPerGame: 11, creditInit: 60, creditPerGame: -5,
      // GHOST(最強レア役)は DESIGN.md 3.10 のテーブルに無く、回復0=弱チェリー未満になっていたので補完。
      // ALARM は Bedrock役 = スケール契機として少しだけ回復させる。
      creditRecover: {
        ALARM: 6, WEAK_CHERRY: 8, MELON: 15, CHANCE: 20,
        STRONG_CHERRY: 30, SHARK: 60, GHOST: 60,
      },
      creditMax: 90,
      note: 'クレジット0で終了。平均約12G、レア役次第で青天井',
    },
    {
      id: 'GRAVITON', name: 'Graviton モード', short: 'GRAVITON',
      payoutPerGame: 6.0, setGames: 8, continueRate: 0.72,
      note: '安定型。1セット8G / 継続72%。Spot の対極',
    },
    {
      id: 'RESERVED', name: 'Reserved Instance ゾーン', short: 'RESERVED',
      contractDist: { '1year': 0.80, '3year': 0.20 },
      /** G数上乗せは控えめ(+5G / +10G)。契約中はヘルスチェック免除 */
      guaranteeGames: { '1year': 5, '3year': 10 },
      note: '契約期間中はヘルスチェックによる終了が発生しない。純増は母体のRUSHに準じる',
    },
    {
      id: 'CLOUDFRONT', name: 'CloudFront エッジ上乗せ', short: 'CLOUDFRONT',
      games: 8,
      /**
       * 枚数の直接上乗せ(旧: セット上乗せ)。
       * 「エッジでキャッシュヒットした瞬間にコインが飛んでくる」表現。
       * 期待値 ≒ 7.4枚/G × 8G ≒ 59枚。
       */
      addCoinPerGameDist: { 0: 0.34, 5: 0.30, 10: 0.22, 20: 0.10, 60: 0.03, 200: 0.01 },
      edges: ['NRT', 'IAD', 'LHR', 'CDG', 'SIN', 'SYD', 'GRU', 'FRA', 'LAX', 'HKG'],
      note: '平均+59枚、最大+800枚。G数ではなく枚数で伸びる',
    },
    {
      id: 'KINESIS', name: 'Kinesis 上乗せストリーム', short: 'KINESIS',
      shardDist: { 1: 0.30, 2: 0.25, 3: 0.18, 4: 0.12, 5: 0.08, 6: 0.04, 8: 0.02, 10: 0.01 },
      /**
       * シャード1本ごとの枚数上乗せ(旧: セット上乗せ)。期待値 ≒ 17.6枚/シャード。
       * 最上位(100枚)だけは母体ATへ +1セットも同時に付ける = ストック機構は生かす。
       */
      addCoinPerShardDist: { 5: 0.34, 10: 0.30, 20: 0.22, 50: 0.10, 150: 0.04 },
      stockAtCoin: 150,
      note: 'シャード数ぶんの上乗せレコードが順に流れる。100枚を引くと+1セットも付く',
    },
    {
      id: 'STEP_FUNCTIONS', name: 'Step Functions チャレンジ', short: 'STEP FUNCTIONS',
      maxStates: 5, playerChoice: true,
      taskSuccessRate: 0.70,
      /**
       * タスク成功の報酬をセット上乗せ → **DC+1(純増ブースト)** へ変更。
       * 母体が上位AT(DCを持たない)の場合は代替として枚数を付ける。
       */
      dcPerTask: 1, coinPerTaskWhenNoDc: 40,
      onAllClear: 'MULTI_REGION',
      /** Choice State の選択肢。左(A)= choices[0] / 右(D)= choices[1] */
      choices: [
        ['Retry', 'Parallel'],
        ['Map', 'Wait'],
        ['Pass', 'Task'],
        ['Catch', 'Choice'],
      ],
      note: '唯一のプレイヤー選択モード。1タスクごとにDC+1、全制覇で最上位へ',
    },
  ],
};

export const ZONE_SPEC_BY_ID = Object.fromEntries(
  DERIVED_ZONE_SPECS.specs.map((s) => [s.id, s]),
);

/** 上位AT仕様(DESIGN.md 3.11) */
export const UPPER_AT_SPECS = {
  id: 'upper_at_specs',
  specs: [
    {
      // スコアアタック化(2026-08-13): 1セット 20G → 10G、純増も引き上げ
      // 100回転化(2026-08-13): 純増 20→16 / 継続 0.78→0.72。
      // 1セット5G化で昇格(3セット連続 = 15G)が容易になり、滞在が24G/セッションまで伸びていた
      id: 'SERVERLESS_RUSH', name: 'Serverless RUSH', short: 'SERVERLESS RUSH',
      /**
       * 1セット 10G → 5G(2026-08-13 ユーザー指示。AS_RUSH と同じテンポに揃える)。
       * 継続率は AS_RUSH と同じ等価変換 p' = 1-(1-p)/2 で 0.72 → 0.86 とし、
       * 1回の Serverless RUSH の平均滞在(約36G)を変えずにヘルスチェックだけ倍の頻度にする。
       */
      setGames: 5, payoutPerGame: 16.0, continueRate: 0.86,
      /**
       * 「関数が呼ばれた +1G」(2026-08-13 ユーザー仕様)。
       * 小役成立(ハズレ以外)のたびに残りゲーム+1。小役合計が約1/2.8なので
       * 5Gセットが実効 7〜8G に伸びる = 「セットは短いが小役で粘る」個性になる。
       */
      addGamePerWin: 1,
      previousSetGames: 10, previousPayoutPerGame: 20.0, previousContinueRate: 0.78,
      upgradeTo: 'MULTI_REGION',
      // 1セット10G と短いので、ゴースト限定だと昇格が一生見られない。
      // サメ揃いにも昇格枠を持たせて「最上位が狙える」状態にする。
      upgradeFlags: { GHOST: 1.00, SHARK: 0.80, STRONG_CHERRY: 0.35, CHANCE: 0.20, MELON: 0.15 },
      /** セット継続に成功したときの昇格抽選。「スケールし続けた結果」の表現 */
      setEndUpgradeRate: 0.25,
      upgradeFlag: 'GHOST', upgradeRate: 1.00,
    },
    {
      id: 'MULTI_REGION', name: 'Multi-Region アクティブ・アクティブ', short: 'MULTI-REGION',
      // 2026-08-13: 他AT(AS/Serverless)の5Gセット化に合わせて短縮。
      // 継続率は非継続率を半分にする等価変換(10G/0.76 ≒ 5G/0.88)
      setGames: 5, payoutPerGame: 24.0, continueRate: 0.88,
      previousSetGames: 10, previousPayoutPerGame: 32.0, previousContinueRate: 0.76,
      allRareAddSet: true, addSetPerRare: 1,
      regions: ['ap-northeast-1', 'us-east-1', 'eu-west-1', 'ap-southeast-1',
        'sa-east-1', 'us-west-2', 'eu-central-1', 'ap-south-1'],
    },
  ],
};

export const UPPER_AT_SPEC_BY_ID = Object.fromEntries(
  UPPER_AT_SPECS.specs.map((s) => [s.id, s]),
);

/**
 * 引き戻し層(DESIGN.md 3.12)
 *
 * 2026-08-13 ユーザー指摘「転落してホットスタンバイから、さらに転落して
 * ROUTE53モードになるのはなぜ? どっちかで良い」を受けて **1段に統合**した。
 *
 * 総合の引き戻し率は等価を保っている:
 *   旧 … 0.35 + 0.65 × 0.10 = 41.5%(2段)
 *   新 … **0.40**(1段) ← 体感を変えずに手順だけ簡素化
 * 失敗したらそのまま通常時へ転落する。
 */
export const RECOVERY_SPECS = {
  id: 'recovery_specs',
  chain: ['HOT_STANDBY'],
  /** 2段だった頃の連鎖(戻す時の基準) */
  previousChain: ['HOT_STANDBY', 'ROUTE53_FAILOVER'],
  specs: [
    {
      id: 'HOT_STANDBY', name: 'ホットスタンバイ (Multi-AZ)',
      games: 10, successRate: 0.40, previousSuccessRate: 0.35,
      onSuccess: 'RESUME_PREVIOUS_AT',
      resumeDc: 2, onFail: 'FREE_TIER',
    },
    {
      /**
       * 【退役】2026-08-13 の1段化で通常プレイからは到達しない。
       * モードハンドラとデータは ?mode=ROUTE53_FAILOVER の直撃デバッグ用に残してある。
       * DNS切替のテーマはホットスタンバイの最終フェーズへ吸収済み。
       */
      id: 'ROUTE53_FAILOVER', name: 'Route 53 フェイルオーバー', retired: true,
      games: 3, successRate: 0.10, onSuccess: 'RESUME_PREVIOUS_AT',
      resumeDc: 1, onFail: 'FREE_TIER',
    },
  ],
};

export const RECOVERY_SPEC_BY_ID = Object.fromEntries(
  RECOVERY_SPECS.specs.map((s) => [s.id, s]),
);

/**
 * エンディング条件(DESIGN.md 3.13)
 *
 * スコアアタック化(2026-08-13)での再定義:
 * 1プレイ50回転になったので、エンディングは「長時間打った人へのご褒美」ではなく
 * **50回転の中で超上振れした回にだけ出る一撃演出**という位置づけに変わる。
 *  - 差枚 +2222 は据え置き(平均スコア200〜300枚に対して約10倍 = 十分な激レア枠)
 *  - ATセット数は 15セット → 4セット。1セット10Gなので15セット=150回転となり
 *    50回転フォーマットでは絶対に到達しない死に条件だった
 *  - キーノート自体も 30G → 5G。持ち時間を食い潰さない短い祝祭にする
 *    (そのぶん純増を 3枚 → 20枚 に上げ、合計100枚のご褒美として維持)
 */
export const ENDING = {
  id: 'ending',
  conditions: [
    { type: 'diffCoins', threshold: 2222 },
    /**
     * 1セット 10G → 5G(2026-08-13)に合わせて 4セット → 6セットへ。
     *  - 4セットのままだと 20G で条件を満たし、実測 5% のセッションでエンディングが出た
     *    (「50回転で超上振れした回だけの一撃演出」のはずが日常になっていた)
     *  - 消化G数で等価の8セットまで上げると 200,000G 試行で1度も出ず、逆に死にコンテンツ化
     * 実測で「1000セッションに1〜数回」に収まる 7セット(35G相当)を採る。
     */
    /**
     * 100回転化(2026-08-13)で AT 滞在が 40G を超えるようになり、
     * 7セット(35G)では実測 0.88回/セッション = ほぼ毎回出る状態になったため 14セットへ。
     */
    { type: 'atSetCount', threshold: 14 },
  ],
  mode: 'REINVENT_ED',
  name: 're:Invent キーノート',
  games: 5,
  payoutPerGame: 20,
  afterEnding: 'FREE_TIER_RESET',
  /** スコアアタック化の直前値 */
  previous: { games: 30, payoutPerGame: 3, atSetCount: 15 },
  /** 液晶で「発表された新サービス」として並べる文言 */
  services: [
    'Amazon Q Slot', 'AWS Ghost Runtime', 'Elastic Shark Service',
    'S3 Infinite Tier', 'Lambda Zero Cold', 'DynamoDB Warp',
    'CloudFront Hyper Edge', 'Graviton X', 'Spot Guarantee',
    'Multi-Region Anywhere',
  ],
};
