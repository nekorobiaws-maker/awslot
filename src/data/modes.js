/**
 * モード定義データ。DESIGN.md 3.4〜3.13 の値をそのまま保持する。
 *
 * ── コメント中の「50回転」について(2026-08-14 しおん指摘 S13)──
 * 本機のセッションは **100回転** です。
 * このファイルを含むコメント中の「50回転」は、
 * すべて 2026-08-13 の 100回転化より前(= 50回転フォーマット時代)に書かれた
 * **当時の調整根拠の記録** で、現行仕様の説明ではありません。
 * 現行の根拠を書くときは必ず「100回転」と書くこと。
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
    /**
     * Bedrock役(ALARM / 1/120)の昇格率(2026-08-14 バランス調整で引き上げ)。
     *
     * 同日の初当り引き締めで CZ_ENTRY.table を全体 0.30倍にしたため、
     * ALARM の直接CZ抽選は 0.04 → 0.012 とほぼ機能しなくなった。
     * このままだと Bedrock役が「4枚もらえるだけの役」に堕ちてしまうので、
     * **昇格側に価値を移して存在意義を残す**(rin の点検項目 7-b)。
     * 1/120 で 24% の高確昇格 = 「Bedrock を引いたらステージに期待できる」水準。
     */
    /**
     * 【U48(2026-08-15)/ レア役2倍に対する相殺】
     * レア役の出現率が2倍になったので、レア役1回あたりの昇格率を **0.7倍**にした。
     * czPerGame は **約0.60倍**(下記)なので、ステージ経由のCZ供給は
     * 2 × 0.7 × 0.60 ≒ **0.83倍** = 据え置きではなく少し絞ってある
     * (据え置き狙いの 0.7 × 0.7 では実測の初当りが 1/92 と目標より軽かったため、
     *  czPerGame 側だけをもう一段しぼって 1/100 前後へ着地させた)。
     * 昇格側を 0.5倍にせず 0.7倍で止めたのは、「レア役を引いたらステージに期待できる」
     * という手応えまで半分にすると、レア役を増やした意味が消えるため。
     *   弱チェ 0.45→0.32 / スイカ 0.65→0.46 / チャンス目 0.78→0.55 / 強チェ 0.90→0.63
     * Bedrock役(ALARM)は **レア役ではない = 出現率が変わっていない** ので据え置き。
     * サメ揃い(1/600)も「引けたら必ず上がる」を守るため据え置き。
     */
    ALARM:         { WARM_POOL: 0.24, PROVISIONED: 0.07 },
    WEAK_CHERRY:   { WARM_POOL: 0.32, PROVISIONED: 0.13 },
    MELON:         { WARM_POOL: 0.46, PROVISIONED: 0.21 },
    CHANCE:        { WARM_POOL: 0.55, PROVISIONED: 0.29 },
    STRONG_CHERRY: { WARM_POOL: 0.63, PROVISIONED: 0.46 },
    SHARK:         { WARM_POOL: 1.00, PROVISIONED: 0.90 },
  },
  /** U48(レア役2倍)の直前の昇格率。戻すときの基準として保持 */
  previousUpgradeRare1x: {
    WEAK_CHERRY:   { WARM_POOL: 0.45, PROVISIONED: 0.18 },
    MELON:         { WARM_POOL: 0.65, PROVISIONED: 0.30 },
    CHANCE:        { WARM_POOL: 0.78, PROVISIONED: 0.42 },
    STRONG_CHERRY: { WARM_POOL: 0.90, PROVISIONED: 0.65 },
  },
  /** 初当り引き締め(2026-08-14)前の ALARM 昇格率 */
  previousUpgradeAlarm: { WARM_POOL: 0.18, PROVISIONED: 0.05 },
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
  /**
   * 【2026-08-14 初当り引き締め】ユーザー要望「初当りは100回転に1回程度」。
   *
   * 引き締め前は ボーナス初当り 1/31.3(= 100回転で3回強)で、
   * 「当たり続けるので当たりが嬉しくない」状態だった。
   * ステージの毎ゲーム抽選はCZ供給の最大の蛇口なので、ここを約1/4に絞る。
   *   高確   … 1/5.3G → **1/20G**(= 平均17G居るうちに約6割で勝負がかかる)
   *   激アツ … 1/1.7G → **1/5G**(= 平均9G居るうちにほぼ勝負が決まる)
   * 「上がったら数G以内に勝負」というリズム自体は維持したまま、
   * 上位ステージへ **上がる回数** ではなく **上がった後の即決度** を残す形にした。
   *
   * 【最終値の実測(2026-08-14 / 20,000セッション)】
   *   抽選由来のボーナス初当り = **1/103**(通常時81.3G に対し 0.79回/セッション)
   *   = ユーザー要望「100回転に1回程度」に一致する。
   *   これに天井(Auto Recovery 75G)の救済 0.47回が乗って、
   *   画面上の体感は 1.26回/セッション(天井込みで 1/64.5)になる。
   */
  /**
   * 【U48(2026-08-15)/ レア役2倍に対する相殺】
   * 昇格が増えたぶん上位ステージの滞在も増えるので、毎ゲーム抽選を **約0.60倍**へ。
   *   高確 0.05 → 0.030(0.600倍 / 1/20G → 1/33.3G)
   *   激アツ 0.20 → 0.119(0.595倍 / 1/5G → 1/8.4G)
   * 「上がったら数ゲーム以内に勝負が決まる」リズムは維持したまま、
   * 上位ステージの滞在時間が伸びたぶんを割り戻している。
   * 0.7倍(0.035 / 0.14)では実測の初当りが 1/92 と目標(1/95〜110)より軽かったので、
   * ここだけをもう一段(0.85倍)絞って **1/100 前後**へ着地させた
   * (昇格率・CZ当選率は「レア役を引いた手応え」に直結するので、総量の微調整はここで行う)。
   */
  czPerGame: { COLD_START: 0, WARM_POOL: 0.030, PROVISIONED: 0.119 },
  /** U48(レア役2倍)の直前値 */
  previousCzPerGameRare1x: { COLD_START: 0, WARM_POOL: 0.05, PROVISIONED: 0.20 },
  /** 初当り引き締め前(ボーナス1/31.3時代)の毎ゲーム抽選 */
  previousCzPerGame: { COLD_START: 0, WARM_POOL: 0.19, PROVISIONED: 0.58 },
  /** 引き締め1周目の値(この時点でボーナス 1.51回/セッション = まだ甘かった) */
  previousCzPerGameRound1: { COLD_START: 0, WARM_POOL: 0.07, PROVISIONED: 0.28 },
  /**
   * 激アツの毎ゲーム抽選のうち、CZではなくボーナス直撃になる割合。
   * 直撃はCZの突破率を経由しないぶん初当りに直結するので、
   * 2026-08-14 の引き締めでは czPerGame とは別に share 自体も少し下げてある。
   */
  bonusShareOfStageDraw: { COLD_START: 0, WARM_POOL: 0.06, PROVISIONED: 0.16 },
  /** 初当り引き締め前の直撃割合 */
  previousBonusShareOfStageDraw: { COLD_START: 0, WARM_POOL: 0.10, PROVISIONED: 0.30 },
  /**
   * 転落率(2026-08-13 引き上げ)。
   * 「ステージが上がる → 数G以内に勝負が起きる」リズムにするため、
   * 上位ステージは長居させない。激アツは平均約9G、高確は平均約17Gで落ちる。
   */
  downgradePerGame: { PROVISIONED: 0.08, WARM_POOL: 0.03 },
  previousDowngradePerGame: { PROVISIONED: 0.03, WARM_POOL: 0.02 },
  /**
   * 天井(2026-08-13 スコアアタック化で 999G → 30G / 2026-08-14 に 30 → 48 → 58 → **75G**)。
   * 1プレイが100回転しかないので、999G天井は永久に到達しない死に仕様だった。
   * 「n回転回して当たらなければ自動復旧が走る」= CZ確定に読み替える。
   * SLA / サービスクレジットの名義は廃止。
   *
   * 【2026-08-14 しおん指摘 S6】30G天井は 99% のセッションで到達し、
   * CZ突入の 51.7% が天井経由 = **主線が「30G回して突破確定CZ」**になっていた。
   * 天井は本来「引けなかった回の救済」であって毎回通る道ではない。
   *
   * 【なぜ 75G なのか(2026-08-14 バランス調整の実測)】
   * 天井は **1回踏むごとにボーナスが1回確定する** ので、初当りの回数を直接決める。
   * 20,000セッションでの実測はこう動いた:
   *   58G … 天井到達 61% / CZ の 35.2% が天井経由 / ボーナス 1.40回(うち0.61回が天井)
   *   75G … 天井到達 47% / CZ の 28.4% が天井経由 / ボーナス 1.26回(うち0.47回が天井)
   *   84G … 天井到達 41% / ボーナス 1.23回 / ただし平均スコア 207枚・中央値60枚まで冷える
   *   90G … 天井到達 38% / ボーナス 1.13回 / 中央値 17枚・プラス収支 57% = 渋すぎ
   * 「CZ突入の天井経由を3割以下(S6の目標)に抑えつつ、スコア分布を保てる」
   * 折り返し点が 75G だった。通常時の滞在(実測 74.5G/セッション)とほぼ同じなので、
   * **引けなかった回だけが終盤で1回踏む**= 救済として素直な形になっている。
   */
  ceiling: { games: 75, name: 'Auto Recovery', action: 'FORCE_CZ' },
  /** 100回転スコアアタック初期の天井(毎セッション到達していた頃の値) */
  previousCeilingGames: 30,
  /** 引き締め1周目に置いた値(まだ 0.68回/セッション 踏んでいて主線のままだった) */
  previousCeilingGames48: 48,
  /** 引き締め2周目の値(天井到達 61% / ボーナス1.40回のうち0.61回が天井由来だった) */
  previousCeilingGames58: 58,
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
   * スコアアタック化に伴う再調整(2026-08-13 その3 ※当時は1プレイ50回転):
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
    /**
     * 【2026-08-14 初当り引き締め / ユーザー要望「初当りは100回転に1回程度」】
     *
     * 引き締め前の実測は ボーナス初当り 1/31.3(通常時G基準)= 100回転で3回強。
     * 当たりが日常になり、CZもRUSHも「またか」になっていた。
     * レア役契機のCZ当選を **全体で約0.35倍** に絞り、
     * 「レア役 → だいたいステージ昇格。CZまで行けたら十分うれしい」へ戻す。
     *
     * 絞り方は一律ではなく、**強い役ほど残す**(実機の作法):
     *   Bedrock役 0.04→0.012(×0.30)/ 弱チェリー 0.09→0.027(×0.30)
     *   スイカ 0.15→0.044(×0.29)/ チャンス目 0.20→0.060(×0.30)
     *   強チェリー 0.30→0.090(×0.30)/ サメ揃い 0.60→0.18(×0.30)
     * サメ揃い(1/1200)は絞っても 0.21+直撃0.04 = 引けば1/4で何かが起きる。
     * ゴースト揃い(1/6000)のボーナス確定だけは **絶対に触らない**
     * (最上位のプレミア役が確定でなくなると台の背骨が折れる)。
     */
    /**
     * 【U48(2026-08-15)/ レア役2倍に対する相殺】
     * レア役の出現率が2倍になったので、**レア役1回あたりの当選率を 0.5倍**にした。
     * 「レア役 → だいたいステージ昇格。CZまで行けたら十分うれしい」の重さは据え置きで、
     * レア役に **出会う回数だけ** が2倍になる。
     *   弱チェ 0.027→0.0135 / スイカ 0.044→0.022 / チャンス目 0.060→0.030
     *   強チェ 0.090→0.045 / サメ 0.180→0.090(直撃も同じ倍率)
     * 据え置き2つ:
     *   ・Bedrock役(ALARM)… レア役ではないので出現率が変わっていない
     *   ・ゴースト揃い    … bonus 1.000(最上位のプレミア役は絶対に触らない)
     *     出現率が 1/6000 → 1/3000 になったぶんだけ初当りへの寄与は倍になるが、
     *     通常時 74G で 2.5% = 誤差の範囲。
     */
    ALARM:         { cz: 0.012,  bonus: 0.0000, direct_at: 0.0000 },
    WEAK_CHERRY:   { cz: 0.0135, bonus: 0.0000, direct_at: 0.0000 },
    MELON:         { cz: 0.022,  bonus: 0.0070, direct_at: 0.0000 },
    CHANCE:        { cz: 0.030,  bonus: 0.0125, direct_at: 0.0000 },
    STRONG_CHERRY: { cz: 0.045,  bonus: 0.0320, direct_at: 0.0035 },
    SHARK:         { cz: 0.090,  bonus: 0.0000, direct_at: 0.0170 },
    GHOST:         { cz: 0.000,  bonus: 1.0000, direct_at: 0.0000 },
  },
  /** U48(レア役2倍)の直前値。レア役の出現率を元に戻すならこちらへ戻す */
  previousTableRare1x: {
    ALARM:         { cz: 0.012, bonus: 0.000, direct_at: 0.000 },
    WEAK_CHERRY:   { cz: 0.027, bonus: 0.000, direct_at: 0.000 },
    MELON:         { cz: 0.044, bonus: 0.014, direct_at: 0.000 },
    CHANCE:        { cz: 0.060, bonus: 0.025, direct_at: 0.000 },
    STRONG_CHERRY: { cz: 0.090, bonus: 0.064, direct_at: 0.007 },
    SHARK:         { cz: 0.180, bonus: 0.000, direct_at: 0.034 },
    GHOST:         { cz: 0.000, bonus: 1.000, direct_at: 0.000 },
  },
  /**
   * 初当り引き締め(2026-08-14)の直前値。
   * ボーナス初当り 1/31.3 / CZ 1/29.8 / 平均スコア 594.5枚 / 機械割 300% だった頃の値。
   * 「もっと当たってほしい」方向へ戻す場合はここへ寄せる。
   */
  previousTableHit1of31: {
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
 *   WELL_ARCHITECTED 85% … レアなご褒美CZ(参加型)。天井経由の受け皿でもある(★★★)
 *     ※ 28.5% は 10G固定(U27)の直後に獲得則が18G時代のままだった頃の値。
 *       獲得則を引き直した後の公称は 84.1%、U48 の 9G化で **85.0%**
 *       (現行値は必ず下の specs を見ること。この節は歴史の記録)
 * 突破率を下げたぶんは CZ_ENTRY(CZ当選率)の引き上げで補償し、
 * 「CZにはよく入るが、抜けられるかはCZの格次第」というメリハリにしている。
 * 旧値は previousDistribution / previousSuccessRate に保持する。
 *
 * ── 8種への拡張(2026-08-14 ユーザー指示「CZをもっと増やしたい / ALB を題材に」)──
 *
 * 4種だと「またこのCZか」が早く来る。**格差ラダーを8段に細かく刻み**、
 * 引いたCZ名そのものが期待度の情報になる形へ広げた。
 *   SQS_REDRIVE      26% … DLQを空にするカウントダウン型。弱・頻出枠(★☆☆)
 *   CW_ALARM         30% … 折れ線グラフ。頻出の入門CZ(★☆☆)
 *   ALB_CZ           42% … 全ターゲットを healthy にして HTTP 200(★★☆)
 *   TRUSTED_ADVISOR  50% … 6カテゴリ全緑(★★☆)
 *   SFN_CZ           55% … Success State まで流しきる(★★☆)
 *   CODEDEPLOY_BG    62% … Green へ 100% シフト。失敗は自動ロールバック(★★☆)
 *   FIS_GAMEDAY      72% … 注入される障害を耐え切る防御型(★★★)
 *   WELL_ARCHITECTED 85% … 6本の柱。小役で柱を積む参加型(U10)+ ゲーム数固定(U27。
 *                          U48 で 10G → 9G)(★★★)
 *
 * 振り分けは「弱いCZほどよく出る」ピラミッド。下位ほど bonusDist を
 * シャークボーナス(LAMBDA_REG / atRate 低)へ寄せてあるので、
 * **CZに入る回数は増えても RUSH の門は広がらない**(ユーザー要望への布石)。
 *
 * ── 11種への拡張(2026-08-15 ユーザー指示 U52c「CZを3種追加」)────────────
 *
 * 8段のラダーは隣どうしの差が 5〜10pt しかない帯(42→50→55→62)が続き、
 * 逆に 30〜42 と 72〜84 が飛んでいた。**飛んでいた場所に足して**解像度を上げる:
 *   CONFIG_RULES   36% … AWS Config の準拠ルールを1つずつ評価(★☆☆)
 *   DX_REDUNDANCY  47% … Direct Connect の専用線を4本開通(★★☆)
 *   SHIELD_DDOS    66% … Shield / WAF で6波のDDoSを緩和(★★☆)
 *
 * ■ 3種それぞれの「ゲーム性」を既存とずらす(U52c の主眼)
 *   CONFIG_RULES  … **1ゲームに1ルールずつ結果が確定する打ち切り型**。
 *                   同じチェックリストの絵でも、Trusted Advisor が
 *                   「最終ゲームまで伏せて一斉に全緑」なのに対し、
 *                   こちらは緑が1つずつ積まれ、NON_COMPLIANT が出た瞬間に終わる
 *   DX_REDUNDANCY … **当落先付けの一斉開通型**。同じ柱の絵でも、
 *                   Well-Architected が「自分の引いた役で積む参加型」なのに対し、
 *                   こちらは道中 failRaised(1本)で頭打ち → 最終ゲームで4本同時に開通
 *   SHIELD_DDOS   … **1ゲームに2波が来る波状の耐久型**。GameDay(5G / 1G1波)より
 *                   短期決戦で、エラーバジェットの削れ方も倍のテンポになる
 *
 * ■ 液晶の盤面は既存の描画を借りている(2026-08-15 時点の制約)
 * 新CZ3種の `ui` は 'checklist' / 'pillars' / 'fis' で、
 * **render/** に新しい盤面を足していない**(このラウンドの担当範囲外)。
 * 借りる先は「盤面に焼かれている固定文字が題材と矛盾しないもの」だけに限定した:
 *   checklist … 状態名は spec の statusLabels で差し替える。
 *               Config は NON_COMPLIANT / 評価中 / COMPLIANT(実在する評価結果名)。
 *               既定の NG / WARN は Trusted Advisor の語で Config には存在しない
 *   pillars   … 「n / N 本」(専用線は本で数える)
 *   fis       … ERROR BUDGET / SURVIVED / SLO(SRE の用語でサービス名ではない)。
 *               カード名が長いときは spec の short(短縮名)へ自動で落ちる
 * 専用の盤面を起こすときは ui を新IDへ移し、render/lcd.js の _drawCz に足すこと。
 */
export const CZ_TYPES = {
  id: 'cz_types',
  /**
   * 振り分け(2026-08-15 / U52c で11種へ再配分)。
   *
   * 「弱いCZほどよく出る」ピラミッドはそのまま、新3種を中位以下へ厚めに差し込む。
   *   加重平均突破率 = 0.22×0.30 + 0.16×0.26 + 0.13×0.36 + 0.12×0.42 + 0.10×0.47
   *                  + 0.08×0.50 + 0.06×0.55 + 0.05×0.62 + 0.04×0.66
   *                  + 0.02×0.72 + 0.02×0.84 ≒ **0.4134**(8種時代 0.4186 とほぼ同じ)
   *   平均滞在も 4.06G → **3.91G** で、CZが持ち時間を食う量は増えていない。
   * = 「CZの種類だけが増えて、初当りの重さは変わらない」再配分になっている。
   */
  distribution: {
    CW_ALARM: 0.22,
    SQS_REDRIVE: 0.16,
    CONFIG_RULES: 0.13,
    ALB_CZ: 0.12,
    DX_REDUNDANCY: 0.10,
    TRUSTED_ADVISOR: 0.08,
    SFN_CZ: 0.06,
    CODEDEPLOY_BG: 0.05,
    SHIELD_DDOS: 0.04,
    FIS_GAMEDAY: 0.02,
    WELL_ARCHITECTED: 0.02,
  },
  /** 8種時代の配分(加重平均突破率 0.4186)。U52c の直前値 */
  previousDistribution8Final: {
    CW_ALARM: 0.29, SQS_REDRIVE: 0.20, ALB_CZ: 0.16, TRUSTED_ADVISOR: 0.11,
    SFN_CZ: 0.08, CODEDEPLOY_BG: 0.07, FIS_GAMEDAY: 0.05, WELL_ARCHITECTED: 0.04,
  },
  /** 8種化の初期配分(加重平均突破率 0.4398)。2026-08-14 バランス調整の直前値 */
  previousDistribution8: {
    CW_ALARM: 0.26, SQS_REDRIVE: 0.16, ALB_CZ: 0.16, TRUSTED_ADVISOR: 0.13,
    SFN_CZ: 0.10, CODEDEPLOY_BG: 0.09, FIS_GAMEDAY: 0.06, WELL_ARCHITECTED: 0.04,
  },
  /** 8種へ広げる前(4種時代)の振り分け。戻す時の基準として保持 */
  previousDistribution4: {
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
      // 100回転しかないので、CZ滞在そのものが持ち時間を食う。短く・当たりやすく。
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
       * SQS デッドレター再処理CZ(2026-08-14 新設 / 弱・頻出枠)
       *
       * 既存4種はすべて「積み上げ型」(緑が増える / ステートが進む / 柱が立つ)で、
       * 絵が似通っていた。ここは **カウントダウン型** にして差別化する:
       * DLQ に滞留したメッセージを毎ゲーム redrive して減らし、
       * **残0通(QUEUE EMPTY)で突破**。非突破は maxReceiveCount 超過で DLQ へ戻る。
       *
       * ペース保証(cz.js advanceDlq): 道中は failLeft+1 通までしか減らせない。
       * 当落どちらも同じ位置で最終ゲームを迎えるので、途中経過から結果は読めない。
       */
      id: 'SQS_REDRIVE', name: 'SQS デッドレター再処理CZ', games: 3, successRate: 0.26,
      expectation: 1,
      // 最弱枠なので REG 寄せを一番きつくする(入りやすいCZが RUSH の門を広げない)
      bonusDist: { LAMBDA_REG: 0.90, S3_BIG: 0.09, DYNAMO_BIG: 0.01 },
      ui: 'dlq',
      /** 突入時にDLQへ溜まっているメッセージ数 */
      messages: 8,
      /** 1ゲームで再処理できる上限(見た目のペース) */
      maxRedrivePerGame: 4,
      /** これを超えて受信されたメッセージは DLQ へ戻る(非突破の理由付け) */
      maxReceiveCount: 3,
      /** 非突破時に残る最低数。道中は failLeft+1 通が下限になる */
      failLeft: 2,
    },
    {
      /**
       * AWS Config 準拠ルールCZ(2026-08-15 新設 / U52c / 弱〜中の橋渡し)
       *
       * 非準拠(NON_COMPLIANT)のルールを毎ゲーム1つずつ評価し、
       * SSM Automation の自動修復が通れば COMPLIANT(GREEN)。
       * **登録された全ルールが COMPLIANT になれば突破**。
       * 非突破は failStepDist で決めたルールが NON_COMPLIANT のまま確定し、
       * その時点で打ち切る(Step Functions CZ と同じ構造)。
       *
       * ■ 同じチェックリスト盤面の Trusted Advisor とはゲーム性が別
       *   TA     … 道中は failGreen(2項目)止まりで伏せ、最終ゲームで一斉に全緑
       *   Config … **1ゲームに1ルールずつ結果が確定** し、落ちたらその場で終了
       * 「緑が1つずつ積まれていく緊張」と「最後に一気に点く快感」で棲み分ける。
       *
       * ■ AWSの事実
       *   items は実在の AWS Config マネージドルール名。ルールの評価結果は
       *   COMPLIANT / NON_COMPLIANT(評価前は NOT_APPLICABLE / INSUFFICIENT_DATA)で、
       *   非準拠リソースは修復アクション(SSM Automation)で直せる。
       *   【2026-08-15 検証指摘】盤面の既定表示 NG / WARN / GREEN は
       *   Trusted Advisor の語で、**AWS Config には存在しない状態名**だった
       *   (黄色が失敗なのか途中なのか画面から判断できず、文言3条件のAWS条件にも抵触)。
       *   statusLabels で実在する語へ差し替えている。
       */
      id: 'CONFIG_RULES', name: 'AWS Config 準拠ルールCZ', games: 4, successRate: 0.36,
      expectation: 1,
      // 弱枠なのでシャークボーナス寄せ(CZが増えても RUSH の門を広げない)
      bonusDist: { LAMBDA_REG: 0.84, S3_BIG: 0.14, DYNAMO_BIG: 0.02 },
      ui: 'checklist',
      /** 評価されるルール(= 消化ゲーム数。1ゲーム1ルール) */
      items: [
        'encrypted-volumes',
        's3-bucket-public-read-prohibited',
        'iam-user-mfa-enabled',
        'restricted-ssh',
      ],
      /** 突破に必要な COMPLIANT 数 = 全ルール。盤面の「n / N」もこれを見る */
      greenNeeded: 4,
      /**
       * チェックリスト盤面に焼く状態名(level 0 / 1 / 2 の順)。
       * 既定は Trusted Advisor の ['NG','WARN','GREEN']。
       * Config は評価結果の実名を出す(黄 = まだ評価中であることが読めるようにする)。
       */
      statusLabels: ['NON_COMPLIANT', '評価中', 'COMPLIANT'],
      /** 打ち切り型なので「非突破時に光らせる上限」は使わない(落ちたルールで止まる) */
      failGreen: 0,
      /**
       * 非突破時に NON_COMPLIANT が確定するルール番号(1始まり)。
       * 後半ほど重くして「最後の1つが直らなかった」を作る。平均 2.86 ルール目。
       */
      failStepDist: { 1: 0.14, 2: 0.22, 3: 0.28, 4: 0.36 },
      /** 目標の明示(全CZ共通。液晶・突入シナリオがこの2行を読む) */
      goal: '全ルールを COMPLIANT にしろ!',
      goalDetail: '1ゲームに1ルールずつ評価。NON_COMPLIANT が出たらそこで終了',
    },
    {
      /**
       * ALB ターゲットグループCZ(2026-08-14 ユーザー指示「ALB を題材にしたCZが欲しい」)
       *
       * リスナー → ターゲットグループ → 3台のターゲット、というALBの実構成をそのまま盤面にする。
       * 毎ゲーム、リスナールール(/api/* 等)に従ってリクエストが1台へルーティングされ、
       * ヘルスチェックが healthCheckPasses 回通ると unhealthy → checking → healthy。
       * **全台 healthy になって HTTP 200 が返れば突破**。
       * 非突破は unhealthy が残り 503 Service Temporarily Unavailable。
       *
       * 3台 × 2回 = 6回のヘルスチェックに対して games は4なので、
       * Trusted Advisor と同じく **最終ゲームで残りが一斉に healthy** になる形にする
       * (道中は当落どちらも failHealthy 台までしか上がらない = 途中経過から結果が読めない)。
       */
      id: 'ALB_CZ', name: 'ALB ターゲットグループCZ', games: 4, successRate: 0.42,
      expectation: 2,
      bonusDist: { LAMBDA_REG: 0.80, S3_BIG: 0.18, DYNAMO_BIG: 0.02 },
      ui: 'alb',
      /** ターゲットグループに登録されている EC2(AZ をばらしてマルチAZらしく) */
      targets: [
        { name: 'i-0a1f / AZ-a' },
        { name: 'i-0b2e / AZ-c' },
        { name: 'i-0c3d / AZ-d' },
      ],
      /** 毎ゲーム適用されるリスナールール(表示用に順番に回す) */
      listenerRules: ['/api/*', '/static/*', '/*'],
      /** 突破に必要な healthy 台数(= ターゲット数) */
      healthyNeeded: 3,
      /** 1台を healthy にするのに必要な連続成功回数(ALB の HealthyThresholdCount) */
      healthCheckPasses: 2,
      /** 非突破時に healthy になる上限。道中の頭打ちもこの値 */
      failHealthy: 1,
    },
    {
      /**
       * Direct Connect 冗長化CZ(2026-08-15 新設 / U52c / 中位)
       *
       * AWS が推奨する最大構成(Maximum Resiliency)は
       * **2つの Direct Connect ロケーション × 各2接続 = 専用線4本**。
       * 毎ゲーム1工程(クロスコネクト → VIF 作成 → BGP ピア設定 → ルート伝搬)ずつ
       * 開通作業が進み、**4本すべてが開通すれば冗長構成の完成 = 突破**。
       *
       * ■ 同じ柱の盤面の Well-Architected とはゲーム性が別
       *   W-A … 参加型。**自分が引いた役**で柱が伸び、6本立った瞬間が結果
       *   DX  … 当落先付け。道中は failRaised(1本)で頭打ちにして、
       *          最終ゲームで残り3本が **一斉に開通**(= 完成の画が結果告知)
       * 「引きで積む」CZと「開通を待つ」CZで、同じ棒グラフでも体験が別になる。
       *
       * ■ AWSの事実
       *   専用線(接続)は物理配線なので開通に工程がある:
       *   LOA-CFA の発行 → クロスコネクト → 仮想インターフェイス(VIF)作成 →
       *   BGP セッション確立 → ルート伝搬。BGP が上がらなければ本番トラフィックは流れない。
       *   本数は「2ロケーション × 2接続」= AWS のレジリエンシーモデルの最上位に合わせている。
       */
      id: 'DX_REDUNDANCY', name: 'Direct Connect 冗長化CZ', games: 4, successRate: 0.47,
      expectation: 2,
      bonusDist: { LAMBDA_REG: 0.72, S3_BIG: 0.24, DYNAMO_BIG: 0.04 },
      ui: 'pillars',
      /** 開通させる専用線(2ロケーション × 2接続)。盤面の柱1本 = 専用線1本 */
      pillars: ['東京 #1', '東京 #2', '大阪 #1', '大阪 #2'],
      /** 突破に必要な開通本数(= pillars.length) */
      pillarNeeded: 4,
      /** 非突破時に開通する上限。道中の頭打ちも同じ値(当落が途中で読めない) */
      failRaised: 1,
      /**
       * 道中のテロップに出す開通工程。**実際に出る回数と同数**にしてある。
       *
       * 4G のうち最終ゲームは finalize(一斉開通)が画を持っていくので、
       * 工程テロップが出るのは道中の 3ゲームだけ。
       * 以前はここに4本入れていたが、cz.js が step-1 で引いていたため
       * 1本目と4本目が一度も表示されない死にデータになっていた
       * (2026-08-15 検証指摘)。現在は cz.js 側が
       * 「テロップを出した回数」で進めるので、上から順に3本とも必ず出る。
       * 工程の最後(ルート伝搬の確認)は一斉開通の画そのものが担当する。
       * 数字も当落も持たない表示専用の文言なので、増減しても抽選は動かない。
       */
      linkSteps: ['クロスコネクト手配', 'VIF(仮想インターフェイス)作成', 'BGP ピア設定'],
      goal: '専用線を4本すべて開通させろ',
      goalDetail: '2ロケーション × 2接続の冗長構成が完成すれば突破',
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
      /**
       * CodeDeploy Blue/Green CZ(2026-08-14 新設 / 中上位枠)
       *
       * Blue(現行)から Green(新)へトラフィックを段階的にシフトしていく。
       * **100% シフト完了で DEPLOYMENT SUCCEEDED = 突破**。
       * 非突破は failShiftDist で決めたステップで CloudWatch アラームが鳴り、
       * **自動ロールバック**(%バーが一気に0%へ戻る)。
       *
       * 構造は SFN_CZ と同じ「途中で打ち切り」型だが、絵は
       * 「%バーが伸びて、失敗したら戻る」なのでワークフロー図とは完全に別物になる。
       * 最終ステップ(100%)に到達した時点で突破確定 = failShiftDist は 1〜4 だけ。
       */
      id: 'CODEDEPLOY_BG', name: 'CodeDeploy Blue/Green CZ', games: 5, successRate: 0.62,
      expectation: 2,
      bonusDist: { LAMBDA_REG: 0.58, S3_BIG: 0.33, DYNAMO_BIG: 0.09 },
      ui: 'bluegreen',
      /**
       * 1ゲームで1段ずつ進むトラフィックシフトの割合(%)。
       *
       * 【等間隔にしている理由(2026-08-14 ファクトチェック F2)】
       * 旧値は 10→25→50→75→100 の不等間隔だったが、CodeDeploy のトラフィック
       * シフトは Canary(2回に分けて一気に)/ Linear(等間隔で少しずつ)/ AllAtOnce の
       * どれかしか選べず、段ごとに刻み幅を変える構成は作れない。
       * ここは「1ゲーム1段=5段」に合う Linear 20% 相当
       * (CodeDeployDefault.*Linear20PercentEvery1Minutes と同じ刻み)へ寄せた。
       * 段数を変えるときは games(5G)も一緒に見ること(1ゲーム1段が前提)。
       */
      shiftSteps: [20, 40, 60, 80, 100],
      /** これを超えるエラー率でロールバックが走る(CloudWatch アラームのしきい値 %) */
      errorThreshold: 5,
      /** 非突破時にロールバックするステップ(1始まり)。後半ほど重い */
      failShiftDist: { 1: 0.12, 2: 0.22, 3: 0.30, 4: 0.36 },
    },
    {
      /**
       * Shield / WAF DDoS 防御CZ(2026-08-15 新設 / U52c / 中上位)
       *
       * 攻撃が **1ゲームに2波** 押し寄せ、そのたびにエラーバジェットが削られる。
       * **6波すべてを緩和しきれば突破**(3ゲームの短期決戦)。
       * 非突破は failStepDist で決めた波でバジェットが尽きてサービス断。
       *
       * ■ 同じ盤面の GameDay CZ とはテンポが別
       *   GameDay … 5G / 1ゲーム1つ。じわじわ削られる
       *   Shield  … 3G / 1ゲーム2波。**同じゲーム内で2回叩かれる**波状攻撃
       * レア役の恩恵も別で、GameDay は「自動復旧でバジェット回復」、
       * こちらは「レートベースルールが効いて **その波のダメージを完全に緩和**」。
       * どちらも当落は動かさない見せ場専用。
       *
       * ■ AWSの事実
       *   Shield Standard は L3/L4(SYN フラッド・UDP リフレクション等)を自動緩和し、
       *   L7(HTTP フラッド・Slowloris)は AWS WAF のレートベースルールで抑える。
       *   Shield Advanced はさらに高度な緩和と SRT のサポートが付く。
       *   ダメージ計画は固定値(RNGを使わない)なので、耐え切る回は必ず
       *   バジェットを残して終わる = 「緩和したのに落ちた」矛盾が起きない。
       */
      id: 'SHIELD_DDOS', name: 'Shield / WAF DDoS 防御CZ', games: 3, successRate: 0.66,
      expectation: 2,
      bonusDist: { LAMBDA_REG: 0.50, S3_BIG: 0.36, DYNAMO_BIG: 0.14 },
      ui: 'fis',
      /**
       * 押し寄せる攻撃の波(1ゲームに faultsPerGame 波ずつ処理する)。
       *
       * name  … テロップで読ませる正式名
       * short … 盤面のカードに焼く短縮名(2026-08-15 検証指摘)。
       *   fis 盤面は 440px に6枚並ぶとカード幅が 61px しかなく、
       *   正式名だと「SYN フラ…」「DNS クエ…」と全部省略されて読めなかった。
       *   カード側は幅に応じて自動で short へ落ちる(render/lcd-cz-extra.js)。
       */
      faults: [
        { name: 'SYN フラッド',       short: 'SYN' },
        { name: 'UDP リフレクション', short: 'UDP増幅' },
        { name: 'HTTP フラッド',      short: 'HTTP' },
        { name: 'DNS クエリ増幅',     short: 'DNS増幅' },
        { name: 'TLS ハンドシェイク', short: 'TLS' },
        // Slowloris は元から短くカードに収まるので短縮名を持たせない
        { name: 'Slowloris' },
      ],
      /** 1ゲームで来る波の数(faults.length ÷ games) */
      faultsPerGame: 2,
      /** エラーバジェットの初期値(%) */
      budgetInit: 100,
      /**
       * 1波で削られる量(波番号で min → max へ線形配分)。
       * 6波の合計は 8+10+11+13+14+16 = 72% なので、耐え切る回は必ず 28% 残る。
       */
      damageRange: { min: 8, max: 16 },
      /*
       * recoverAmount(レア役でのバジェット回復量)は **持たせない**。
       * あれは GameDay(advanceFis)専用で、Shield の緩和は
       * 「その波のダメージ加算をスキップする」= 被害ゼロ、という別表現。
       * 置いても誰も読まない死に設定値になる(2026-08-15 検証指摘)。
       */
      /** 非突破時にバジェットが尽きる波(1始まり)。6波目に到達したら突破確定 */
      failStepDist: { 1: 0.10, 2: 0.16, 3: 0.22, 4: 0.26, 5: 0.26 },
      goal: '6波の攻撃をすべて緩和しろ!',
      goalDetail: '1ゲームに2波。エラーバジェットを残して耐え切れば突破',
    },
    {
      /**
       * GameDay CZ(FIS 障害注入)(2026-08-14 新設 / 上位・耐える型)
       *
       * 既存CZはすべて「こちらから積み上げる」攻撃型だった。
       * ここは **攻撃を受けて耐える防御型**:毎ゲーム FIS が障害を1つ注入し、
       * エラーバジェットが削られる。**5つすべて耐え切れば RESILIENT = 突破**。
       * 非突破は failStepDist のステップでバジェットが尽きて SLO 違反。
       *
       * ダメージは damageRange を step で線形に配分した固定値(RNGを使わない)。
       * 突破する回は必ずバジェットを残して耐え切れるので、
       * 「耐えたのに尽きた」という矛盾した絵が出ない。
       * レア役の自動復旧(バジェット回復)は見せ場だけで当落を動かさない。
       */
      id: 'FIS_GAMEDAY', name: 'GameDay CZ(FIS 障害注入)', games: 5, successRate: 0.72,
      expectation: 3,
      bonusDist: { LAMBDA_REG: 0.42, S3_BIG: 0.40, DYNAMO_BIG: 0.18 },
      ui: 'fis',
      /** 注入される障害(1ゲーム1つ) */
      faults: [
        { name: 'AZ-a 停止' },
        { name: 'レイテンシ注入' },
        { name: 'インスタンス終了' },
        { name: 'API スロットリング' },
        { name: 'DB フェイルオーバー' },
      ],
      /** エラーバジェットの初期値(%) */
      budgetInit: 100,
      /** 1回の障害で削られる量。step に沿って min → max へ増える */
      damageRange: { min: 12, max: 22 },
      /** レア役の自動復旧で戻るバジェット(%)。当落は動かさない見せ場専用 */
      recoverAmount: 8,
      /** 非突破時にバジェットが尽きるステップ(1始まり) */
      failStepDist: { 1: 0.10, 2: 0.20, 3: 0.30, 4: 0.40 },
    },
    {
      // DESIGN.md 2.2 M04: W-A 6本の柱をジョージが運ぶ。6本すべてで DYNAMO_BIG 確定
      // 格差付け(2026-08-13)でも 0.85 を維持。ここは「引けたら勝ち」のご褒美CZで、
      // 天井(Auto Recovery 30G)の受け皿でもあるため下げない。
      // 2026-08-13 ユーザー指示: 柱6本に合わせて 5G → 6G(1G1本のペースで自然に)
      /**
       * 【U10 / 2026-08-14 ユーザー指摘】「6本の柱CZがほぼ必ずボーナスになっていて緊張感がない」
       *
       * 突入時に当落を引いて柱がその結果へ向かって自動で立つ方式をやめ、
       * **自分で引いた小役で柱を積む参加型**へ作り替えた(cz.js advancePillars):
       *   小役成立 … +1本 / スイカ(S3)・弱チェリー(IAM) … +2本 / 強チェリー … +4本
       *   期間内に6本揃えばその場で突破、揃わなければ失敗。**「必ず当選」は無い**
       *
       * この1点だけ「突破可否は突入時に確定」の原則から外れる。
       * 柱の本数が結果そのものなので、道中の進捗＝当落の進捗になるのが狙い
       * (残りG × 4本(強チェリー)で逆転できるので、最後まで可能性は残る)。
       *
       * ■ games を 18 → **10** にした理由(U27 / 2026-08-14 ユーザー指示)
       * 18G は「100回転のうち18回転を1つのCZが食う」ため、
       * 引いた瞬間に持ち時間の2割が確定で消えるのが重すぎた(ユーザー指示で10G固定へ)。
       *
       * ■ 獲得則を10G用に引き直した(2026-08-14 バランス調整)
       * 10G固定にした直後は獲得則(小役+1 / レア役+2 / 強レア+4)を据え置いたため、
       * 期待本数 0.452本/G × 10G では **6本を積める確率が 28.5%** まで落ちていた。
       * これは「★★★なのに8種で下から2番目に抜けにくいCZ」という星の嘘になり、
       * かつ格差ラダーの最上位(FIS 72%)を参加型CZが下回る倒立が起きる。
       * ラダー最上位(約85%)を維持するという目標に合わせ、**10Gで6本積める確率が
       * 85%前後になるよう獲得則をスケールし直した**(順序と役の序列は完全に維持):
       *   小役 +1 → **+2** / スイカ・弱チェ・チャンス目 +2 → **+3** / 強チェ・サメ +4 → **+6**
       * 期待本数 0.860本/G → 10Gで6本積める確率 **84.1%**(厳密計算 / DP)。
       * 平均消化も 9.5G → **6.8G** に縮み、持ち時間の食い方も軽くなる。
       * 旧値は previousPillarGain18G(18G時代の獲得則)に残してある。
       *
       * 消化G数と突破率の関係(獲得則を引き直した後 / DP):
       *    6G 39.4% / 8G 69.8% / **10G 84.1%** / 12G 92.4%
       * 獲得則を旧値(小役+1)に戻す場合の対応表:
       *    6G 4.4% / 8G 13.5% / 10G 28.5% / 18G 85.0%
       *
       * ■ ★★★ の根拠(U52c で11種になった後も同じ)
       * 突破率が全種で最上位(**85.0%** > FIS 72%)であることに加え、
       * **突破したときの恩恵も最上位**(bonusDist の DYNAMO_BIG 25% が全種で最大)。
       * さらに天井(Auto Recovery)の受け皿でもある。
       * scripts/sim.mjs の検証20 は参加型CZについて
       * 「恩恵が全種で最大」かつ「突破率がラダー最上位」の両方を検査する。
       * 難易度を動かすときは pillarGain(獲得則)か games を動かすこと。
       *
       * ■ 天井(Auto Recovery)経由だけは保証を残す
       * 天井は「ハマりの救済」なので突破確定のまま。ceilingGames(5G)で
       * 自動復旧が柱を運び切る。抽選で引いたW-Aとは goal 文言も分けてある。
       */
      /**
       * ■ games を 10 → **9** にした理由(U48 / 2026-08-15)
       * レア役の出現率が2倍になったので、獲得則(小役+2 / レア役+3 / 強レア+6)を
       * 据え置いたまま 10G だと **6本積める確率が 84.1% → 89.9%** まで上がり、
       * 「★★★のご褒美CZ」から「ほぼ確定CZ」に化けてしまう。
       * 獲得則と役の序列は一切触らず、**消化G数だけ1G短く**して 85.0% に戻した
       *   (DP: 8G 78.1% / **9G 85.0%** / 10G 89.9%)。
       * 持ち時間の食い方も 9G ぶんに軽くなる。
       */
      id: 'WELL_ARCHITECTED', name: 'Well-Architected CZ', games: 9, successRate: 0.85,
      /** U48(レア役2倍)の直前値。レア役を1倍へ戻すなら 10G / 0.84 へ戻す */
      previousGames10Rare1x: 10,
      previousSuccessRate10GRare1x: 0.84,
      /**
       * 参加型CZの目印。突破率は「当落抽選の確率」ではなく
       * **10Gで柱を6本積める確率(DPによる厳密計算値)**なので、★の整合検査を分けて扱う。
       * ここの successRate は抽選には一切使われない(cz.js は participation を見て
       * 当落を先引きしない)。表示・設計値の突き合わせ専用の公称値。
       */
      participation: true,
      /** 参加型へ作り替える前(当落先付け・1G1本ペース)のG数 */
      previousGames: 6,
      /** U27 の直前値(参加型 18G / 公称 85%) */
      previousGames18: 18,
      previousSuccessRate18G: 0.85,
      /** 10G固定の直後(獲得則を18G時代のまま据え置いていた頃)の公称突破率 */
      previousSuccessRate10GOldGain: 0.285,
      expectation: 3,
      // ご褒美CZ / 天井の受け皿なので、REG寄せは控えめ(引けたら勝ちを維持)
      bonusDist: { LAMBDA_REG: 0.30, S3_BIG: 0.45, DYNAMO_BIG: 0.25 },
      previousBonusDist: { LAMBDA_REG: 0.05, S3_BIG: 0.55, DYNAMO_BIG: 0.40 },
      ui: 'pillars',
      pillars: ['運用', 'セキュリティ', '信頼性', '性能', 'コスト', '持続可能性'],
      /** 突破に必要な柱の本数(= pillars.length) */
      pillarNeeded: 6,
      /**
       * 成立役ごとに立つ柱の本数。
       *
       * U10 の指定値(小役+1 / スイカ・弱チェ+2 / 強チェ+4)を、
       * 10G固定(U27)に合わせて **そのままの比率で2倍寄りにスケール**した値
       * (2026-08-14 バランス調整)。役の序列
       *   ハズレ 0 < 小役 < スイカ・弱チェ・チャンス目 < 強チェ・サメ
       * は一切崩していない。ここを触れば難易度がそのまま動く。
       *
       * 期待本数 = 0.860本/G(通常時テーブル)
       *   小役(ベル/リプレイ/リプレイ2/Bedrock役)36.2% × 2本
       *   + スイカ・弱チェ・チャンス目 3.56% × 3本
       *   + 強チェ・サメ 0.48% × 6本
       * → 10Gで6本(DP)= 84.1%
       *
       * ── GHOST を明示した(2026-08-14 しおん指摘 minor)────────────────
       * ゴースト揃い(1/6000)が表に無く default(2本)扱いだったため、
       * **最上位のプレミア役がベルと同じ本数**という序列の逆転が起きていた。
       * pillarNeeded と同じ 6本 = 引けたその場で立ち切り、を明示する。
       * 出現率が 1/6000 なので期待本数への影響は +0.0007本/G(突破率は動かない)。
       */
      pillarGain: {
        MELON: 3, WEAK_CHERRY: 3, CHANCE: 3,
        STRONG_CHERRY: 6, SHARK: 6, GHOST: 6,
        default: 2,
      },
      /** 18G時代の獲得則(10G固定の直後もこの値のままだった)。戻すときの基準 */
      previousPillarGain18G: {
        MELON: 2, WEAK_CHERRY: 2, CHANCE: 2,
        STRONG_CHERRY: 4, SHARK: 4,
        default: 1,
      },
      /** 天井(Auto Recovery)経由の消化G数。保証ぶんなので短くする */
      ceilingGames: 5,
      /** 6本立ち切ったときに6本目が金色になる確率。全立で DYNAMO_BIG 確定(DC初期値+2) */
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
 *     **ベルが揃うたびに15枚**払い出す実機方式へ変更
 * DynamoDB BIG はセット継続型のまま 1セット30G → **15G**(継続率0.70は不変)。
 *
 * 純増は **8.45枚/G**(ベル1/1.4。U22 でレア役を厚くする前は 1/1.2 で 9.76枚/G。
 * 正は data/payouts.js の BONUS_NET_PER_GAME)。獲得量は旧仕様とほぼ同じで、
 * 消化ゲーム数だけが 1/3〜1/5 に短縮される = 「一気に増える」体感に寄せた変更。
 * ※ payoutPerGame は撤去済み。ボーナス中の払出は小役払出そのものを使う。
 *
 * 追加仕様(2026-08-13 ユーザー決定 その2): ボーナスは当選した瞬間には始まらない。
 * まず入賞待ち(BONUS_READY)へ入り、`entrySymbol` を揃えて初めて消化が始まる。
 *   BIG系(S3 / DynamoDB) … GHOST7(ゴースト7)を揃える
 *   REG (Lambda)         … SHARKBAR(サメBAR)を揃える
 */
/**
 * 【U11 / 2026-08-14】ボーナス仕様のうち RUSH 関連の読み替え。
 *
 *   atRate      … 「突入時に1回引く当選率」から **総合当選率の設計目標** へ意味が変わった。
 *                 実際の抽選は data/rushes.js の RUSH_ENTRY(レア役契機)が行い、
 *                 bonusMult がこの値へ着地するよう調整されている。
 *                 → atRate を動かしたら bonusMult も一緒に見直すこと。
 *   dcInitDist  … 退役(DCが無くなったため読まれていない)
 *   dcBonus     … 退役(同上)
 *   onAtFail    … 現役。RUSH非当選でボーナスが終わったときの戻り先ステージ。
 */
export const BONUS_SPECS = {
  id: 'bonus_specs',
  specs: [
    {
      id: 'LAMBDA_REG', name: 'シャークボーナス', shortName: 'SHARK BONUS', type: 'games',
      // 2026-08-13 ユーザー決定: 6G → 3G(テンポ優先。平均獲得は約29枚)
      // atRate 0.50 → 0.20(2026-08-13「RUSHに簡単に行きすぎ」)。
      // シャークボーナスは「枚数はもらえるがRUSHには繋がりにくい」役回りにする。
      /**
       * 【2026-08-14 ユーザー要望「RUSHにはあまり入らないように」】
       * atRate 0.20 → **0.12**。シャークボーナスは全ボーナスの約4割を占める最頻ボーナスで、
       * ここが RUSH の門の広さを決める。「枚数はもらえるが RUSH には繋がりにくい」を徹底する。
       * 代わりに消化G数を 3G → **4G**(平均獲得 約29枚 → 約39枚)にして、
       * RUSH に行けなかった時の手応えを補う(rin の点検項目 7 / ボーナス単体の価値)。
       */
      /**
       * 【2026-08-14 バランス調整 その2 / 初当りを絞ったぶんの補償】
       * 4G(平均39枚)では「1回しか引けない100回転」で当てても収支が動かず、
       * ボーナス単体が **RUSHへ行かなかった時の消化試合** になっていた。
       * 6G(平均58枚)へ。RUSH に行けなくても「引けてよかった」と思える量にする。
       * ※ ボーナス中のレア役契機RUSH抽選(data/rushes.js)は消化G数に比例して
       *    当選率が上がるので、G数を触ったら bonusMult を必ず引き直すこと。
       */
      games: 6, previousGames: 6, previousGames3: 3, previousGames4: 4,
      atRate: 0.12, previousAtRate: 0.50, previousAtRate020: 0.20, dcBonus: 0,
      entrySymbol: 'SHARKBAR', entryLabel: 'サメBAR',
      onAtFail: { nextSubState: 'WARM_POOL' },
    },
    {
      id: 'S3_BIG', name: 'ゴーストボーナス', shortName: 'GHOST BONUS', type: 'games',
      // 2026-08-13 ユーザー決定: 10G → 5G(平均獲得は約49枚)
      /**
       * 【2026-08-14 ユーザー要望「RUSHにはあまり入らないように」】
       * atRate 1.00 → **0.45**。これが今回の RUSH 絞りの本丸。
       * 「ゴースト7を揃えた = RUSH確定」だったので、ボーナスに入った時点で
       * RUSH まで見えてしまい、ボーナス中の告知が完全に死んでいた。
       * 半々より少し辛いくらいにすると、**ボーナス最終Gの当落告知が主役に戻る**。
       * 非当選の落胆はサミット会場(高確)スタートで受け止める(onAtFail)。
       * 消化は 5G → **6G**(平均獲得 約49枚 → 約59枚)で単体価値を補償。
       */
      /** 【2026-08-14 その2】6G → 8G(平均57枚 → 78枚)。理由は LAMBDA_REG と同じ */
      games: 8, previousGames: 10, previousGames5: 5, previousGames6: 6,
      atRate: 0.45, previousAtRate: 1.00, dcBonus: 0,
      entrySymbol: 'GHOST7', entryLabel: 'ゴースト7',
      onAtFail: { nextSubState: 'WARM_POOL' },
      // 「短い爆発」設計(2026-08-13): DC1〜2 スタートを基本にする
      dcInitDist: { 1: 0.80, 2: 0.15, 3: 0.05 },
      previousDcInitDist: { 2: 0.30, 3: 0.40, 4: 0.22, 5: 0.08 },
    },
    {
      id: 'DYNAMO_BIG', name: 'ゴーストボーナスSP', shortName: 'GHOST BONUS SP', type: 'set',
      // ゴースト系で揃える(ユーザー未指定だが S3_BIG と同じ流儀で 1セット 10G → 5G)
      /**
       * 【2026-08-14】SP だけは「引けたら RUSH」を残す(atRate 1.00 → **0.85**)。
       * ここまで下げると全ボーナスが等しく怪しくなってしまうので、
       * **最上位ボーナスは裏切らない** 側に置く。それでも 15% は落ちるので、
       * SP でも最終Gの告知に意味が生まれる。落ちた時は高確スタートで受け止める。
       */
      /** 【2026-08-14 その2】1セット 5G → 6G(平均92枚 → 110枚)。継続率0.50は据え置き */
      setGames: 6, previousSetGames: 10, previousSetGames5: 5, continueRate: 0.50,
      atRate: 0.85, previousAtRate: 1.00, dcBonus: 2,
      entrySymbol: 'GHOST7', entryLabel: 'ゴースト7',
      onAtFail: { nextSubState: 'WARM_POOL' },
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
 * 【一部退役】Auto Scaling RUSH のコア数値(DESIGN.md 3.8)
 *
 * ── U11(2026-08-14 ユーザー指示)──────────────────────────
 * RUSH が4種になり、DC(純増と継続率を兼ねる単一パラメータ)は廃止された。
 * 現行の RUSH 仕様は **data/rushes.js** が正。
 *
 * このオブジェクトで **まだ現役なのは setGames だけ**:
 *   ・上乗せ特化ゾーンの「1セット上乗せ」を母体RUSHのゲーム数へ換算する係数
 *     (game/modes/zones.js の addSetToHost / hostSetValue)
 *   ・上位AT(SERVERLESS_RUSH / MULTI_REGION)のセット長のフォールバック
 * payoutPerGame / continueRate / dcRange / scaleOut / bellBoost などは
 * **どこからも読まれていない**。DC制へ戻す判断が出たときの基準として残してある。
 *
 * ── 以下、退役前の設計メモ(履歴)──
 *
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
  /**
   * 【2026-08-14 バランス調整】高DC帯だけを引き下げ(7: 0.90→0.86 / 8: 0.94→0.90)。
   *
   * RUSH突入率を 69.7% → 35% 前後まで絞ったので、入った時の価値は上げてよい。
   * ただし p99 獲得が 2,269枚まで伸びていたのは「DC7〜8に届くと事実上終わらない」
   * 帯があったため(0.94継続 = 期待16セット = 80G)。上振れの夢は残しつつ、
   * **上限に張り付いたら終わらない** 構造だけを潰す。
   * 低DC帯(0.22 / 0.32)は「短い爆発」の設計そのものなので据え置き。
   */
  continueRate: { 1: 0.22, 2: 0.32, 3: 0.46, 4: 0.62, 5: 0.75, 6: 0.84, 7: 0.86, 8: 0.90 },
  /** 高DC引き下げ前(2026-08-14 の直前値) */
  previousContinueRateHighDc: { 1: 0.22, 2: 0.32, 3: 0.46, 4: 0.62, 5: 0.75, 6: 0.84, 7: 0.90, 8: 0.94 },
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
  /**
   * 【退役 / 触っても何も起きない】(2026-08-15 U48 で明記)
   * 現行の AS_RUSH は「レア役の種類で増える台数が決まる」固定値方式で、
   * 上乗せの正は **data/rushes.js の AS_RUSH.addUnitsByFlag**。
   * この scaleOut テーブルは DC制へ戻す判断が出たときの基準として残しているだけで、
   * game/lottery.js の drawScaleOut もどこからも呼ばれていない。
   * レア役の出現率(U48 で2倍)に合わせて調整すべきなのは addUnitsByFlag の方。
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
  /**
   * 【U48(2026-08-15)/ レア役2倍に対する相殺】
   * レア役1回あたりのゾーン当選率を **0.5倍**(確定役の行は据え置き)。
   * 「引いたら何か起きる」密度は1ゲームあたりで見れば据え置きで、
   * ゾーンに入る回数そのものは変わらない。
   */
  table: {
    MELON:         { CLOUDFRONT: 0.15, KINESIS: 0.10 },
    CHANCE:        { CLOUDFRONT: 0.19, KINESIS: 0.13, GRAVITON: 0.06 },
    STRONG_CHERRY: { CLOUDFRONT: 0.19, KINESIS: 0.14, EC2_BURST: 0.09, RESERVED: 0.05, STEP_FUNCTIONS: 0.03 },
    SHARK:         { SPOT_ZONE: 0.30, EC2_BURST: 0.25, KINESIS: 0.20, STEP_FUNCTIONS: 0.25 },
    GHOST:         { STEP_FUNCTIONS: 0.50, SPOT_ZONE: 0.30, SERVERLESS_UP: 0.20 },
  },
  /** U48(レア役2倍)の直前値 */
  previousTableRare1x: {
    MELON:         { CLOUDFRONT: 0.30, KINESIS: 0.20 },
    CHANCE:        { CLOUDFRONT: 0.38, KINESIS: 0.26, GRAVITON: 0.12 },
    STRONG_CHERRY: { CLOUDFRONT: 0.38, KINESIS: 0.28, EC2_BURST: 0.18, RESERVED: 0.10, STEP_FUNCTIONS: 0.06 },
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
       *
       * ── U50(2026-08-15)/ 最上位を 200 → 60枚へ ──────────────────
       * このゾーンの払い出しは **母体RUSHの純増に上乗せして同じゲームで出る**
       * (game/modes/zones.js が `payoutPerGame: pay + coins` を返す)。
       * 旧テーブルの最上位 200枚は、母体(AS_RUSH 35枚/G)と合わせて
       * 1ゲーム235枚 = U50 の「確定役とフリーズ以外で1ゲーム100枚を超えない」
       * ルール(data/rushes.js の冒頭)を破っていた。
       * 最上位を 60枚に落として **35 + 60 = 95枚** に収めている。
       *   期待値 = 5×0.30 + 10×0.22 + 20×0.10 + 40×0.03 + 60×0.01
       *          = **7.5枚/G × 8G ≒ 60枚**(旧 9.5枚/G ≒ 76枚)
       */
      addCoinPerGameDist: { 0: 0.34, 5: 0.30, 10: 0.22, 20: 0.10, 40: 0.03, 60: 0.01 },
      /** U50(100枚の壁)の直前値。1/100 で 200枚が母体の純増に乗っていた */
      previousAddCoinPerGameDist: { 0: 0.34, 5: 0.30, 10: 0.22, 20: 0.10, 60: 0.03, 200: 0.01 },
      edges: ['NRT', 'IAD', 'LHR', 'CDG', 'SIN', 'SYD', 'GRU', 'FRA', 'LAX', 'HKG'],
      note: '平均+60枚、1ゲーム最大+60枚。G数ではなく枚数で伸びる',
    },
    {
      id: 'KINESIS', name: 'Kinesis 上乗せストリーム', short: 'KINESIS',
      shardDist: { 1: 0.30, 2: 0.25, 3: 0.18, 4: 0.12, 5: 0.08, 6: 0.04, 8: 0.02, 10: 0.01 },
      /**
       * シャード1本ごとの枚数上乗せ(旧: セット上乗せ)。
       * 最上位(stockAtCoin 枚)だけは母体ATへ +1セットも同時に付ける
       * = ストック機構は生かす。**枚数は addCoinPerShardDist / stockAtCoin が正**
       * (2026-08-15: 分布が 150枚まで伸びたのにコメントが 100枚のままだったので合わせた)。
       *
       * ── U50(2026-08-15)/ 最上位を 150 → 60枚へ ──────────────────
       * CloudFront ゾーンと同じ理由(母体RUSHの純増に上乗せして同じゲームで出る)。
       * 旧 150枚は母体35枚と合わせて1ゲーム185枚だった。
       *   期待値 = 5×0.34 + 10×0.30 + 20×0.22 + 40×0.10 + 60×0.04
       *          = **15.5枚/シャード**(旧 20.1枚/シャード)
       */
      addCoinPerShardDist: { 5: 0.34, 10: 0.30, 20: 0.22, 40: 0.10, 60: 0.04 },
      /** U50(100枚の壁)の直前値 */
      previousAddCoinPerShardDist: { 5: 0.34, 10: 0.30, 20: 0.22, 50: 0.10, 150: 0.04 },
      stockAtCoin: 60,
      previousStockAtCoin: 150,
      note: 'シャード数ぶんの上乗せレコードが順に流れる。最上位(60枚)を引くと+1セットも付く',
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
       * 「関数が呼ばれた +1G」(2026-08-13 ユーザー仕様 / 2026-08-14 にレア役契機へ)。
       *
       * **レア役**が成立するたびに残りゲーム +1。
       * 旧実装は「ハズレ以外すべて」(約1/2.8)で、5Gセットが実効7〜8Gまで伸び、
       * U22〜U24 の「契機はレア役のみ」統一から取り残されていた
       * (2026-08-14 しおん指摘 minor)。いまは通常時 1/24.7 = 平均 +0.2G/セット。
       */
      addGamePerWin: 1,
      /** レア役契機へ揃える前の契機(ハズレ以外の全小役)。戻す時の基準 */
      previousAddGameTrigger: 'all_wins',
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
 *
 * ── 2026-08-14 バランス調整で 0.40 → 0.45 → **0.55**(U32 の補填)────────
 * ここは「上振れ(上位1%のスコア)だけを持ち上げたいとき」に一番効くレバー。
 * 引き戻しが成功するのは **RUSHを引けたセッションの中だけ** で起きるので、
 * 上げても平均やプラス収支率はほとんど動かず、当たった回の伸びしろだけが増える。
 * 逆に「当たりの重さを下げたい」ときもここを先に下げること。
 *
 * 0.45 → 0.55 は U32(復帰先が「同じRUSHへ直接復帰」から **ボーナス** へ変わった)で
 * 復帰1回の価値が下がったぶんの補填。
 *   旧: 成功 0.45 × RUSH再開(約204枚 + さらに引き戻しが続く)
 *   新: 成功 0.55 × ゴーストボーナス(約78枚 + RUSH当選 45%)
 * 「成功しても RUSH に戻れるとは限らない」ぶん、成功そのものは起こりやすくしてある
 * (実測: 平均スコア 231 → 244枚 / 上位1% 1,480 → 1,610枚)。
 *
 * ── U50(2026-08-15)/ 0.55 → **0.82**。上振れを「連チャン」で作り直した ──────
 *
 * U50 で RUSH 1回の獲得に上限(p99 800枚以下)を課したので、
 * **1回のRUSHでセッションが決まる**という上振れの作り方ができなくなった。
 * 実際、RUSH側だけを直した時点で上位1%が 1,470 → 1,150枚まで落ちている。
 * 上振れの担い手をここへ移す:
 *   RUSH終了 → 引き戻し 82% → 復旧のゴーストボーナス → その中でレア役 45%
 *   = **1回のRUSHの後にもう一度RUSHへ戻れる確率 約37%**
 * これで「1回が大きい」ではなく **「何度も繋がる」** 形の上振れになる。
 * 1回あたりの獲得は常識的なまま、連チャンした回だけがスコアを伸ばす
 * (実測: 上位1% 1,150 → 1,350枚 / 上位0.1% 1,770 → 1,950枚)。
 *
 * 【なぜ復帰先(S3_BIG / 45%)は上げなかったか】
 * ここを DYNAMO_BIG(85%)にすると連チャン率は 37% → 70% まで跳ね上がるが、
 * それは U32 が意図的にやめた「引き戻し成功 = RUSH確定」に逆戻りする
 * (実測でも機械割が 196% まで伸びて目標 190% を超える)。
 * **確率を上げるのは引き戻し側だけ**、復帰してからは必ずレア役を引き直す、を守る。
 */
export const RECOVERY_SPECS = {
  id: 'recovery_specs',
  chain: ['HOT_STANDBY'],
  /** 2段だった頃の連鎖(戻す時の基準) */
  previousChain: ['HOT_STANDBY', 'ROUTE53_FAILOVER'],
  specs: [
    {
      /**
       * 【U2 / 2026-08-14 ユーザー要望】
       *  a) 10G は長すぎて「ただ待つ時間」になっていたので **5G** へ短縮
       *  b) そのぶん、滞在中に役が成立したら **切替猶予が +1G** 伸びる
       * 「引けば粘れる」参加型にして、短くしても薄くならないようにした。
       * (延長は当落を動かさない見せ場+チャンスの延命)
       *
       * 【2026-08-14 バランス調整】成功率 0.40 → 0.45 →(U32 の補填で)**0.55**。
       * 上位1%のスコアが目標(1,600枚)に届かなかったぶんをここで足している。
       * 詳しい理由はこのファイルの RECOVERY_SPECS のヘッダを参照。
       *
       * 【U32 / 2026-08-14 ユーザー指示】成功したときの復帰先が
       * **ゴーストボーナス**(data/rushes.js の RECOVERY_BONUS)に変わった。
       * 「引き戻し成功 = RUSH再開の確定」ではなくなり、
       * RUSHへ戻れるかはそのボーナス中にレア役を引けるか(45%)で決まる。
       *
       * 【U23 / 2026-08-14 ユーザー指示】+1G の契機を **レア役のみ** に変更。
       * 旧(払出のある成立役すべて)は約40%で成立するため、
       * ほぼ毎回 maxTotalGames(15G)まで伸びて「延長が日常」になっていた。
       * レア役は通常時 1/24.7 なので、**平均延長 0.19G / 平均滞在 5.2G**(実測)。
       * 延長は「レア役を引けた回だけのご褒美」になり、上限にもまず当たらない。
       */
      id: 'HOT_STANDBY', name: 'ホットスタンバイ (Multi-AZ)',
      /** 復帰先の正は data/rushes.js の RECOVERY_BONUS(U32 でボーナスへ変更) */
      games: 5,
      previousGames: 10,
      successRate: 0.82,
      /** U50(上振れを連チャンで作り直す)の直前値 */
      previousSuccessRate055: 0.55,
      previousSuccessRate045: 0.45,
      previousSuccessRate040: 0.40,
      previousSuccessRate: 0.35,
      /**
       * 延長込みの総ゲーム数の上限。
       * U23 でレア役契機になったので普段は当たらないが、
       * 「レア役を連続で引いた回」に100回転を食い潰さないための安全弁として残す。
       */
      maxTotalGames: 15,
      /** U32: 復帰先は「元のAT」から **ボーナス**(data/rushes.js の RECOVERY_BONUS)へ */
      onSuccess: 'RECOVERY_BONUS',
      previousOnSuccess: 'RESUME_PREVIOUS_AT',
      resumeDc: 2, onFail: 'FREE_TIER',
    },
    {
      /**
       * 【退役】2026-08-13 の1段化で通常プレイからは到達しない。
       * モードハンドラとデータは ?mode=ROUTE53_FAILOVER の直撃デバッグ用に残してある。
       * DNS切替のテーマはホットスタンバイの最終フェーズへ吸収済み。
       */
      id: 'ROUTE53_FAILOVER', name: 'Route 53 フェイルオーバー', retired: true,
      games: 3, successRate: 0.10, onSuccess: 'RECOVERY_BONUS',
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
 *
 * ── 【U50(2026-08-15)】差枚条件を 2222 → **1500枚** へ ────────────────
 * U50 で分布の上を圧縮した(RUSH 1回の p99 を 800枚に制限した)結果、
 * セッションの最高スコアが 3,398枚 → **2,277枚** まで縮み、
 * 2222枚は **20,000セッションで 0.01%** = 実質到達不能になっていた。
 * このファイルの atSetCount が何度も「到達不能 → 引き下げ」を繰り返してきたのと
 * まったく同じ失敗で、**分布を動かしたら閾値も動かす**のを忘れると死に条件が生まれる。
 * 1500枚(実測 0.4〜0.5%)へ下げて、差枚とATセット数の両方あわせた発生率を
 * 目安の 0.3〜0.5%/セッション に戻した(実測 0.41%)。
 * ※ リザルトの RANK re:INVENT(game/modes/result.js)も同じ閾値。片方だけ動かさないこと。
 *  - ATセット数は 15セット → 4セット。1セット10Gなので15セット=150回転となり
 *    50回転フォーマットでは絶対に到達しない死に条件だった
 *  - キーノート自体も 30G → 5G。持ち時間を食い潰さない短い祝祭にする
 *    (そのぶん純増を 3枚 → 20枚 に上げ、合計100枚のご褒美として維持)
 */
export const ENDING = {
  id: 'ending',
  conditions: [
    { type: 'diffCoins', threshold: 1500 },
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
     *
     * 【U11 / 2026-08-14】数え方が変わったので 14 → 8 へ。
     * RUSH がセット制をやめたため、いま atSetCount が数えるのは
     *   ・RUSH 1回の完走(setEnd RUSH_END)= 1
     *   ・上位AT(Serverless / Multi-Region)のセット継続 = 1セットにつき 1
     * の合計。
     *
     * 【2026-08-14 しおん指摘 minor-c】8 も **到達不能** だった(実測 0.00%)。
     * 新しい数え方だと1セッションの到達分布はこうなる(3,000セッション実測):
     *   2セット 9.17% / 3セット 3.20% / 4セット 1.43% /
     *   **5セット 0.57%** / 6セット 0.13% / 7セット以上 0.00%(最大6)
     * 「1000セッションに数回の超上振れ」に当たる **5セット** を採る。
     * = RUSHを5回完走(または上位ATで粘った)= 100回転をほぼATで使い切った回。
     *
     * ※ この分布は RUSH の期待獲得に強く依存する。U24(上乗せ契機のレア役化)で
     *   RUSH が痩せた直後の実測なので、**バランス担当がRUSHを戻したら必ず測り直すこと**
     *   (scripts/sim.mjs --session の「atSetCount の到達分布」に毎回出る)。
     *
     * 【U32 / 2026-08-14】5 → **4** へ。引き戻し成功の復帰先がボーナスになり、
     * 「RUSH → 引き戻し → RUSH → …」とATの setEnd が連続する道が細くなったため、
     * 5セットは実測 0.00〜0.01% = **また到達不能**になっていた(20,000セッション × 2シード)。
     *   2セット 4.4% / 3セット 0.6% / **4セット 0.04〜0.08%** / 5セット 0.00〜0.01%
     * 3セット(0.6%)は目安レンジ(0.1〜1%)の中だが、エンディングは
     * **進行中のATを畳んで5Gのキーノートに差し替える**ので、
     * 好調なセッションを頻繁に中断してしまう。差枚条件(0.37%)と合わせて
     * エンディング全体が約0.4%(= 1000セッションに4回)に収まる 4セットを採る。
     */
    { type: 'atSetCount', threshold: 4 },
  ],
  /** U32 の直前値(復帰先がRUSHだった頃は 0.57% で到達していた) */
  previousAtSetCountU31: 5,
  /** U11 以前の閾値(RUSHが1セット5Gで、セット継続のたびに数えていた頃) */
  previousAtSetCount: 14,
  /** U11 の閾値(新しい数え方では到達不能だった) */
  previousAtSetCountU11: 8,
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
