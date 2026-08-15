/**
 * 前兆(ぜんちょう)システムのデータ定義。DESIGN.md 3.4 / 3.5 / IDEAS.md 2章・3章
 *
 * 「当たった瞬間に画面が変わる」と、レバーを叩いた本人しか嬉しくない。
 * そこで通常時の当選を数ゲームだけ手元に保持し、その間に不穏な予告を挟んでから
 * CZ / ボーナスへ送り出す。これが本前兆(ほんぜんちょう)。
 * さらに「当選していないのに同じ予告が始まる」ガセ前兆を混ぜることで、
 * 予告が出た瞬間の "当たってるかもしれない" を毎回作る。
 *
 * ■ 期待度設計(王道)
 *   1. 前兆が長く続くほど本前兆(ガセは最長4G・本前兆は最長5G = 5G目到達で確定)
 *   2. 強度(strength)が高いほど本前兆(強度3の到達率は本前兆のほうが高い)
 *   3. 強度が高いゲームでしか出ない演出パターンがある(CloudTrail / re:Invent 背景)
 *
 * ■ 秘匿のルール(重要)
 *   本前兆かガセかを示す値は EventBus へ流さない。演出側へ渡すのは
 *   「強度」「演出パターン」「経過ステップ」だけで、この3つは本/ガセ両方から出る。
 *   残りゲーム数(left)は演出ロジック用に渡すが、画面へ表示してはいけない
 *   (表示すると前兆の総ゲーム数が割れて「5G目到達=確定」の楽しみが消える)。
 *
 * ■ 当選は絶対に消さない
 *   前兆中も当選抽選は毎ゲーム引き続ける。ガセ前兆中に当選したら本前兆へ格上げし、
 *   本前兆中にさらに当選したら上位のものへ差し替える(格上げ)。
 *   詳しい処理は game/modes/freetier.js 側。
 */

/** 当選の格上げ順(数値が大きいほど上位) */
export const ZENCHO_WIN_RANK = { CZ: 1, AT: 2, BONUS: 3 };

/* ══ 予兆テキストの色ルール(2026-08-14 ユーザー指摘 U9)═════════════
 *
 * ユーザー要望は「スイカ(S3)対応を示唆する予兆は緑、チェリー(IAM)対応は赤」。
 * ところが AWSLOT には既に **赤文字予兆 = 信頼度85%** という別の意味の赤がある。
 * 同じ「赤」に2つの意味を持たせると、どちらの赤なのか読めなくなるので、
 * **意味ごとに見せ方のレイヤーを分ける** ことで両立させる。
 *
 *  ┌ 信頼度示唆 …… テキスト帯の tone
 *  │   tone:'hot' を付けたものだけが「赤文字予兆(信頼度85%)」。
 *  │   帯の下敷きごと赤くなり、文字が一段大きく脈打つ(lcdanims.js の TEXT_TONES.hot)。
 *  │   = 「帯ごと赤い」が信頼度のサイン。強度2以上 かつ 2G目以降でしか出さない。
 *  │
 *  └ 対応役示唆 …… 文字色(color)だけ
 *      tone を付けない通常テキストの color で「その予兆がどの子役の話か」を示す。
 *      = 「文字だけ色が付いている」が対応役のサイン。帯は黒のままなので混ざらない。
 *
 * 【厳守】役対応色(下記 SYMBOL)は tone:'hot' と併用しない。
 *         逆に tone:'hot' のテキストの color は必ず TRUST.hot に統一する。
 *         こうしておけば「脈打つ赤帯=信頼度」「文字だけ赤=IAM(チェリー)対応」で必ず読み分けられる。
 */
export const ZENCHO_TEXT_COLORS = {
  /** 信頼度示唆(tone:'hot' と必ずセットで使う色) */
  TRUST: {
    /** 赤文字予兆。前兆が伸びた合図で、実測の信頼度は 75〜85% 帯 */
    hot: '#ff3b30',
  },
  /** 対応役示唆(tone は付けない。文字色だけで示す) */
  SYMBOL: {
    /** スイカ(S3)対応 */
    MELON: '#4ce0a0',
    /** チェリー(IAM)対応 */
    CHERRY: '#ff4d4d',
    /** 対応役なし・汎用(弱) */
    NEUTRAL: '#8ad4ff',
    /** 対応役なし・汎用(中) */
    NEUTRAL_MID: '#ffd166',
  },
};

export const ZENCHO = {
  id: 'zencho',

  /** 本前兆(当選を保持して遅延させる) */
  real: {
    /**
     * 継続ゲーム数の振り分け(当選ゲームを1G目として数える)。
     * 長いほうへ寄せてあるので「伸びるほど熱い」が成立する。
     */
    gamesDist: { 2: 15, 3: 25, 4: 30, 5: 30 },
    /** 演出強度の振り分け(1=弱 / 2=中 / 3=強)。強へ寄る */
    strengthDist: { 1: 20, 2: 35, 3: 45 },
  },

  /** ガセ前兆(当選していないのに始まる) */
  fake: {
    /**
     * 非当選ゲームでの発生率(1/denom)。前兆中はさらに抽選しない。
     *
     * 2026-08-14 ユーザー指摘U5。ガセ前兆が体感で毎ゲーム出ていたため半分以下へ。
     * 前兆は「出た瞬間に当たっているかもしれない」から価値があるので、
     * 出現量そのものを絞るのが唯一の効く手当てになる(演出を強くしても薄まるだけ)。
     * 演出パターンを増やしても前兆の発生回数は増えない(下の patterns はあくまで
     * 「前兆が出たときにどの絵になるか」の振り分けなので、総量とは独立)。
     */
    denom: 90,
    /** U5対応前の値(before-after を測るときの基準として残す) */
    previousFakeDenom: 40,
    /** ガセは最長4G。5G目まで伸びたら本前兆確定になる */
    gamesDist: { 2: 50, 3: 34, 4: 16 },
    /** 弱へ寄せる。ただし強度3も 12% 出るので強度だけでは断定できない */
    strengthDist: { 1: 55, 2: 33, 3: 12 },
  },

  /** ガセ前兆中に当選したときの本前兆への格上げ */
  upgrade: {
    /** 格上げ後に最低これだけは前兆を残す(告知までの尺を確保する) */
    minLeft: 2,
  },

  /* ══ U79(2026-08-16 ユーザー指摘)/ 予兆の絵が偏る問題 ═══════════════
   *
   * 指摘は「前兆で同じ演出ばかり出る」。実測(150セッション / 377回の前兆)でも
   *   ・上位5パターンだけで **40%** を占める
   *   ・下位11本は **1%未満**(2.5回/セッションなので、40セッション回して1回見るか)
   *   ・直前と同じパターンが続く割合 4.9%
   * となっていて、32本用意した絵の半分以上が事実上プレイヤーに届いていなかった。
   *
   * 原因は重みの配り方そのもの。U58 で18本足したとき
   * 「グループ合計を据え置く」ために新規は既存の隙間(real 5〜6 / fake 3〜8)へ入れたので、
   * 既存の主力(cloudtrail real 52 など)との差が10倍前後ついたまま残っていた。
   *
   * 【対策】抽選の重みそのものは1つも書き換えず、抽選の直前に2つの倍率を掛ける
   * (実装は game/modes/freetier.js の buildVarietyTable)。
   *   1. 露出の平準化(flatten) … 重みが大きいパターンほど倍率を下げる(重み合計の -flatten 乗)
   *   2. 直近履歴(recentPenalty) … 直近に出したものほど選ばれにくくする
   *
   * 【この2つで期待度を壊さない理由】── ここが肝なので必ず読むこと
   *   倍率は **本前兆(real)とガセ(fake)へまったく同じ値を掛ける**。さらに掛けたあと
   *   「クラス(擬似連 / 赤文字持ち / それ以外)ごとの重み合計」を元の値へ戻す。
   *   したがって
   *     ・パターンごとの信頼度 = real:fake 比 …… **完全に不変**
   *       (両方に同じ倍率が乗り、正規化の分母もクラス合計固定で変わらないため)
   *     ・擬似連が選ばれる確率 …… **完全に不変**(擬似連は倍率の対象外。初当りが動かない)
   *     ・赤文字予兆が出る割合 …… **完全に不変**(hot 持ちクラスの合計を据え置くため)
   *   変わるのは「どの絵が何%で回ってくるか」だけ。
   *
   * 【実測(30万回の抽選シミュレーション)】
   *              上位5占有   最頻      最少     直前と同じ
   *   対策なし     35.9%   8.3%     0.81%      4.8%
   *   対策あり     28.2%   8.3%     1.42%      1.2%
   *   信頼度(本/ガセ比)は cloudtrail 15倍前後 / chatops 2.9 / coldstart 0.16 のまま変化なし。
   */
  variety: {
    /**
     * 露出の平準化の強さ(0=何もしない / 1=クラス内でほぼ均等)。
     * 0.7 は「主力パターンの顔は残しつつ、下位を1.4〜2%まで引き上げる」着地点。
     * 上げすぎると canary や cloudtrail の "見慣れた絵" まで薄まって台の顔が消える。
     */
    flatten: 0.7,
    /**
     * 直近に出したパターンへ掛ける倍率(先頭 = 直前に出したもの)。
     * 長さがそのまま「何回ぶん覚えておくか」になる。
     * 先頭を 0 にしないのは、候補が少ない強度帯(強度3の熱パターンなど)で
     * 完全に締め出すと **出せる絵が無い状況** を作りかねないため。
     * 0.05 でも実質は出ない(直前と同じが 4.8% → 1.2%)。
     */
    recentPenalty: [0.05, 0.14, 0.28, 0.45, 0.65, 0.85],
  },

  /**
   * 演出パターン。
   *  minStrength … この強度以上のときだけ抽選対象になる
   *  weight.real / weight.fake … 本前兆とガセで配分を変える(見分けがつきそうでつかない値)
   *  telop … 前兆中に液晶下へ出る一言
   *
   * IDEAS.md 2-6 / 2-10 / 2-23 / 2-27 / 2-29 / 2-34 / 2-35 / 3-3 から採用。
   *
   * ■ パターンを増やしても前兆は増えない(2026-08-14 U5)
   *   ここは「前兆が始まったときにどの絵を見せるか」の振り分けでしかない。
   *   前兆そのものの発生量は real=当選時 / fake=ZENCHO.fake.denom で決まる。
   *   したがってパターン追加は "被りにくくする" 効果しかなく、総量には影響しない。
   *
   * ■ symbolHint(U9 の色ルール)
   *   その予兆がどの子役の話をしているか。ZENCHO_TEXT_COLORS.SYMBOL の色に対応する。
   *   演出データ(data/scenarios/zencho.js)は import を書けないので、
   *   ここは「どの色を使うべきか」の台帳として持ち、色そのものはシナリオに直書きする。
   */
  /* ══ U58(2026-08-15)/ 予兆パターンを +18 したときの重みの配り方 ═══════
   *
   * 【守ったこと】
   *   1. **擬似連(deepracer / codepipeline)の重みは1も動かさない**。
   *      擬似連だけは「擬似連自身が当選を生む」(step3 の CZ移行 / step4 のボーナス確定)
   *      ので、選ばれる確率が動くと初当りがそのまま動く。
   *   2. **minStrength のグループごとに合計を据え置く**。
   *      drawPattern は `minStrength <= strength` で候補を絞ってから重み抽選するため、
   *      強度1/2/3のどの帯で見ても「擬似連が選ばれる確率」が変わらないようにするには、
   *      グループ合計そのものを固定するのが唯一確実な方法になる。
   *        グループA(minStrength 1・擬似連以外) real 112 / fake 172
   *        グループB(minStrength 2)            real 156 / fake  96
   *        グループC(minStrength 3)            real 124 / fake  24
   *      新規18本はこの枠の**内側**へ入れ、既存を同じ量だけ削ってある。
   *   3. **赤文字予兆(zn_hot_*)の出現割合も据え置く**。
   *      赤は「strength 2以上 かつ step 2以降」で、hot 版を持つパターンを引いたときだけ出る。
   *      グループB/Cの hot 保有分の重み比を変えないよう、
   *      新規の中(7本)と熱(3本)は **全部 hot 版つき** にしたうえで、
   *      hot を持つ既存(xray / health / guardduty / region_evacuation / cloudtrail)から
   *      その分をきっちり差し引いた(hot を持たない chatops_incident は据え置き)。
   *
   * 【変わること】前兆が始まったときに見える「絵の種類」が 14 → 32 になる。
   *   前兆そのものの発生量(ZENCHO.fake.denom と当選契機)は**1回も増えない**。
   */
  patterns: [
    {
      id: 'deepracer',
      /*
       * 【2026-08-15 U58 / 廃止サービスの差し替え】
       * AWS DeepRacer は 2025-12-15 にサービス終了したため、**画と文言を
       * AWS Step Functions の分散マップ(Distributed Map)へ差し替えた**。
       * 「1本 → 2本 → 4本 → 大量の子の実行が同時に走り出す」という絵は
       * 擬似連の骨格(1台 → 2台 → 4台 → 大量走行)にそのまま乗る。
       *
       * 【id / chainParam は 'deepracer' のまま残す(意図的)】
       *   ・game/modes/freetier.js は CHAIN_SPEC_BY_PATTERN[pattern] を引くだけなので
       *     改名しても動くが、**scripts/sim.mjs が paramChange の param 名
       *     'deepracer' で擬似連の統計を集計している**(scripts/ は変更禁止)。
       *     改名した瞬間、統計が黙って0件になりバランス確認の目が1つ潰れる。
       *   ・プレイヤーが目にするのは name / telop / 演出テキストだけなので、
       *     内部の契約キーは旧名のまま「内部ID」として扱う。
       */
      name: 'Distributed Map 分散実行',
      minStrength: 1,
      /**
       * 擬似連の総量は据え置き(2026-08-14)。
       * CodePipeline 擬似連を足すにあたって新規の重みを追加すると
       * 「擬似連自身が生む当選」が増えて初当りが動くため、
       * 旧 { real: 10, fake: 42 } を 分散マップ と CodePipeline で分け合う形にした。
       *   deepracer    { real: 6, fake: 25 }
       *   codepipeline { real: 4, fake: 17 }
       *   合計          { real:10, fake: 42 }  ← 変更前と同じ
       * **U58 の +18 でもここは1も動かしていない**(上のグループ合計固定の理由)。
       *
       * ══ U72(2026-08-15 ユーザー指摘「擬似連が発生しなくなってる」)═══════
       *
       * ■ 実測した原因(scripts/balance-probe.mjs の「擬似連/セッション」)
       * 擬似連は **前兆の演出パターンの1つ**なので、
       *   擬似連の発生量 = 前兆の本数 × 擬似連が選ばれる確率
       * U63 時点の実測は **0.185回/セッション(5.4セッションに1回)**、
       * うち2step以上まで伸びたのは 0.129回(7.8セッションに1回)。
       * = 仕様は壊れていない(chain の実装も重みも生きている)が、**元から薄い**。
       * 内訳を見ると、本前兆で擬似連が選ばれる確率は
       *   強度1 8.2% / 強度2 3.6% / 強度3 2.5%(加重 約4.0%)
       * しかなく、しかもU48/U63の初当り引き締めで **本前兆そのものが 1.2回/セッション**
       * まで減っていた。ガセ前兆(1/90)側の 16.8% が事実上の唯一の供給源で、
       * 「数セッション打っても1回も見ない」状態になっていた。
       *
       * ■ U72 での対応(重みだけを動かす)
       * U72 で「チャンス目 = CZ突入確定 → **短い移行前兆を経てCZ**」になり、
       * 本前兆が 1.2 → **約2.0回/セッション**へ増えた。この増えた本前兆を
       * 擬似連の受け皿にするため、**real 側の重みだけ** を 10 → **36** へ引き上げる
       * (deepracer 6→22 / codepipeline 4→14。6:4 の比は維持)。
       *   本前兆で擬似連が選ばれる確率 約4.0% → **約12%**
       *   擬似連の発生 0.185 → 0.35回/セッション前後(**約3セッションに1回**)
       * fake 側(42)は据え置き。ガセの絵は元から擬似連が濃く、ここを増やすと
       * 「擬似連 = ガセの合図」になってしまうため。
       *
       * ■ 初当りへの影響
       * 上の「1. 擬似連の重みは1も動かさない」は、
       * **擬似連自身が当選を生む**(step3 のCZ移行 / step4 のボーナス確定)ため
       * 選ばれる確率が動くと初当りが動く、という理由だった。
       * U72 では確定役の移行前兆(= すでに当選が確定している前兆)が主な受け皿なので、
       * step3 のCZ移行は **すでに確定しているCZに吸収**されて何も増えない。
       * 増えるのは step4 到達(約8%)のボーナス格上げだけで、
       * 実測でも +0.02回/セッション(初当りの2%未満)に収まっている
       * (それでも初当りは目標帯 1/95〜110 の内側。下の balance-probe の実測を参照)。
       */
      weight: { real: 22, fake: 25 },
      /** U72(擬似連の復活)の直前値。初当りを厳密に戻すならここへ */
      previousWeightU63: { real: 6, fake: 25 },
      symbolHint: null,
      telop: '分散マップの並列処理が走り出している',
    },
    {
      id: 'codepipeline',
      name: 'CodePipeline デプロイ進行',
      minStrength: 1,
      // 分散マップ側から分けた重み(上のコメント参照)。U72 で real だけ 4 → 14
      weight: { real: 14, fake: 17 },
      /** U72(擬似連の復活)の直前値 */
      previousWeightU63: { real: 4, fake: 17 },
      symbolHint: null,
      telop: 'パイプラインが動き出した',
    },
    {
      id: 'sqs_backlog',
      // U67-1: 「保留」はパチンコ語なので「未処理」へ。telop は元から実態表現
      name: 'SQS 未処理メッセージ滞留',
      minStrength: 1,
      // U58: グループA(real 112 / fake 172)を新規8本と分け合った。旧 { real:26, fake:34 }
      weight: { real: 17, fake: 22 },
      telop: 'SQS のキューが捌けていない',
    },
    {
      id: 'canary',
      name: 'カナリアリリース',
      minStrength: 1,
      // U58 再配分。旧 { real:32, fake:26 }
      weight: { real: 21, fake: 17 },
      telop: 'カナリアへトラフィックを流し始めた',
    },
    {
      id: 'xray',
      name: 'X-Ray 赤トレース',
      minStrength: 2,
      // reinvent を外したぶんの再配分(real +8 / fake +1)
      // U58: 新規の中7本(全部 hot 版つき)へ分けたぶんを差し引いた。旧 { real:42, fake:25 }
      weight: { real: 27, fake: 16 },
      telop: 'X-Ray に赤いトレースが混ざり始めた',
    },
    {
      id: 'health',
      name: 'AWS Health Dashboard 緊急メンテナンス',
      minStrength: 2,
      // 再配分(real +4 / fake +6)。fake を厚めにしたのは、この前兆の顛末を受け持つ
      // Well-Architected の失敗側(yh_wa_result_short)が出る機会を確保するため
      // U58 再配分。旧 { real:38, fake:26 }
      weight: { real: 24, fake: 17 },
      telop: 'AWS Health Dashboard に通知',
    },
    {
      id: 'guardduty',
      name: 'GuardDuty 不審アクセス検知',
      minStrength: 2,
      // 再配分(real +6 / fake +1)
      // U58 再配分。旧 { real:36, fake:23 }
      weight: { real: 23, fake: 15 },
      telop: 'GuardDuty が不審なアクセスを検知',
    },
    /* ── 2026-08-14 追加(U5 と同時。総量は fake.denom で下げ、絵の種類だけ増やす)── */
    {
      id: 'bill_shock',
      name: '請求アラート急上昇',
      minStrength: 1,
      // U58 再配分。旧 { real:22, fake:38 }
      weight: { real: 14, fake: 25 },
      symbolHint: null,
      telop: '今月の請求額が跳ね上がっている',
    },
    {
      id: 'glacier_restore',
      name: 'Glacier 復元待ち',
      minStrength: 1,
      // U58 再配分。旧 { real:24, fake:30 }
      weight: { real: 15, fake: 19 },
      // S3 系(スイカ)の話なので U9 の緑
      symbolHint: 'MELON',
      telop: 'Glacier からの復元が進んでいる…あと数時間',
    },
    {
      id: 'lambda_coldstart',
      name: 'コールドスタート',
      minStrength: 1,
      // ガセ専用に近い枠。引っ張るだけで何も起きない役回り
      // U58 再配分。旧 { real:8, fake:44 }
      weight: { real: 5, fake: 29 },
      symbolHint: null,
      telop: 'コールドスタートで少し待たされている',
    },
    {
      /*
       * 内部IDは 'chatops_incident' のまま(data/scenarios/zencho.js の when.match と
       * 結ばれた契約キー)。U78 で **見せ方だけ** Slack → AWS Systems Manager
       * Incident Manager へ寄せた(AWS に関係ない題材だったため)。
       */
      id: 'chatops_incident',
      name: 'Incident Manager 対応メンバー招集',
      minStrength: 2,
      // U58: **据え置き**。hot 版を持たない唯一の中パターンなので、ここを削ると
      // 「赤文字予兆が出る割合」が動いてしまう(削るのは hot 持ちの3本だけ)
      weight: { real: 40, fake: 22 },
      symbolHint: null,
      telop: 'Incident Manager が対応メンバーを呼び出した',
    },
    {
      id: 'region_evacuation',
      name: '別リージョンへの退避開始',
      minStrength: 3,
      // U58: グループC(real 124 / fake 24)を新規の熱3本と分け合った。旧 { real:56, fake:10 }
      weight: { real: 42, fake: 8 },
      symbolHint: null,
      telop: '別リージョンへの退避が始まった',
    },
    {
      id: 'cloudtrail',
      name: 'CloudTrail Root User Login',
      minStrength: 3,
      // Root ユーザー = IAM(チェリー)の話なので U9 の赤。tone:'hot' とは併用しない
      symbolHint: 'CHERRY',
      // 再配分(real +22)。強度3で選ばれる唯一の専用パターンになったので厚くする
      // U58 再配分。旧 { real:68, fake:14 }
      weight: { real: 52, fake: 10 },
      telop: 'CloudTrail にログが流れ続けている',
    },

    /* ══ 2026-08-15 U58 追加(+18本)══════════════════════════════════
     *
     * 前兆の「絵の引き出し」を 14 → 32 へ増やす。上のグループ合計固定のとおり
     * **前兆の発生回数も擬似連の発生回数も1回も増えていない**。
     * 題材はすべて現役サービス(提供終了・メンテモード入りは全部除外済み)。
     *
     * 内訳: 弱(minStrength 1)8本 / 中(2)7本 / 熱(3)3本。
     * 中と熱には data/scenarios/zencho.js に zn_hot_* を必ず1本ずつ用意してある
     * (赤文字予兆の出現割合を据え置くため。理由は patterns 冒頭のコメント)。
     */

    /* ── 弱(minStrength 1)8本 / 合計 real 40・fake 60 ─────────────── */
    {
      id: 'ec2_mac',
      name: 'EC2 Mac インスタンス 占有中',
      minStrength: 1,
      weight: { real: 5, fake: 8 },
      symbolHint: null,
      /*
       * 実在の制約: 専有ホスト(Mac の実機)は割り当てから最低24時間は解放できない。
       *
       * 2026-08-15 ユーザー指摘 U64-1「文言が意味不明」対応。
       * 旧: 「Mac ホストが24時間の最低確保に入った」
       *   → 「最低確保」は社内語で、何が起きたのかも良い事なのかも伝わらなかった。
       * 新: 借りた(確保した)という **出来事** を先に言い、制約は補足として添える。
       * 専門用語を使わず、24時間の縛りが「返せない」ことだと分かる書き方にしてある。
       */
      telop: 'Mac の実機を借りた — 返却できるのは24時間後',
    },
    {
      id: 'device_farm',
      name: 'Device Farm 実機ラック点灯',
      minStrength: 1,
      weight: { real: 5, fake: 8 },
      symbolHint: null,
      telop: '実機ラックのスマホが一斉に画面点灯した',
    },
    {
      id: 'session_manager',
      name: 'Session Manager セッション開始',
      minStrength: 1,
      weight: { real: 5, fake: 8 },
      // 鍵も踏み台も無しで入れる = 権限(IAM)の話なので U9 の赤
      symbolHint: 'CHERRY',
      telop: '踏み台なしでシェルが1本開いた',
    },
    {
      id: 'logs_insights',
      name: 'CloudWatch Logs Insights 検索',
      minStrength: 1,
      weight: { real: 5, fake: 8 },
      symbolHint: null,
      telop: 'ログを大量になめて、3件だけ返ってきた',
    },
    {
      id: 'datasync_night',
      name: 'DataSync 夜間転送',
      minStrength: 1,
      weight: { real: 5, fake: 7 },
      // オンプレ → S3 へ「ためる」話なので U9 の緑
      symbolHint: 'MELON',
      telop: 'オンプレのファイルが夜間に少しずつ渡っている',
    },
    {
      id: 'transfer_sftp',
      name: 'Transfer Family SFTP 接続',
      minStrength: 1,
      weight: { real: 5, fake: 7 },
      // SFTP の向こう側は S3。スイカ対応
      symbolHint: 'MELON',
      telop: 'まだ SFTP で1本つながっている',
    },
    {
      id: 'route53_resolver',
      name: 'Route 53 Resolver 名前解決',
      minStrength: 1,
      weight: { real: 5, fake: 7 },
      symbolHint: null,
      telop: 'VPC の中で名前解決が1回だけ外を向いた',
    },
    {
      id: 'cost_anomaly',
      name: 'Cost Anomaly Detection 違和感検知',
      minStrength: 1,
      weight: { real: 5, fake: 7 },
      symbolHint: null,
      telop: '機械学習が普段の請求パターンとのズレを見つけた',
    },

    /* ── 中(minStrength 2)7本 / 合計 real 42・fake 26 ───────────────
     * **全部 zn_hot_* を持つ**(xray / health / guardduty から重みを分けた見返り) */
    {
      id: 'vpc_lattice',
      name: 'VPC Lattice サービス結線',
      minStrength: 2,
      weight: { real: 6, fake: 4 },
      symbolHint: null,
      telop: 'サービス同士が名前だけで結線された',
    },
    {
      id: 'clean_rooms',
      name: 'Clean Rooms 重なり検出',
      minStrength: 2,
      weight: { real: 6, fake: 4 },
      symbolHint: null,
      telop: '相手の生データを見ずに、重なりだけが分かった',
    },
    {
      id: 'entity_resolution',
      name: 'Entity Resolution 名寄せ一致',
      minStrength: 2,
      weight: { real: 6, fake: 4 },
      symbolHint: null,
      telop: '別々の顧客レコードが同一人物と判定された',
    },
    {
      id: 'ram_share',
      name: 'Resource Access Manager 共有',
      minStrength: 2,
      weight: { real: 6, fake: 4 },
      // アカウントをまたぐ権限の話なので U9 の赤
      symbolHint: 'CHERRY',
      telop: '隣のアカウントへサブネットが1つ共有された',
    },
    {
      id: 'kb_citation',
      name: 'Bedrock Knowledge Bases 根拠引用',
      minStrength: 2,
      weight: { real: 6, fake: 4 },
      symbolHint: null,
      telop: '社内文書から根拠が1件、引かれてきた',
    },
    {
      id: 'mwaa_dag',
      name: 'MWAA DAG 起動',
      minStrength: 2,
      weight: { real: 6, fake: 3 },
      symbolHint: null,
      telop: 'DAG の依存が解けて、タスクが走り出した',
    },
    {
      id: 'local_zones',
      name: 'Local Zones 出島へ寄せる',
      minStrength: 2,
      weight: { real: 6, fake: 3 },
      symbolHint: null,
      telop: '大都市の出島側へ、処理が寄っていった',
    },

    /* ── 熱(minStrength 3)3本 / 合計 real 30・fake 6 ───────────────
     * region_evacuation / cloudtrail と同じく **全部 zn_hot_* つき** */
    {
      id: 'fis_az_down',
      name: 'Fault Injection Service AZ 全電源断',
      minStrength: 3,
      weight: { real: 10, fake: 2 },
      symbolHint: null,
      // FIS の AZ 可用性シナリオは実在(障害30分 + 復旧30分の構成)
      telop: 'AZ 全電源断のシナリオが投入された',
    },
    {
      id: 'trainium_cluster',
      name: 'Trainium 学習クラスタ点火',
      minStrength: 3,
      weight: { real: 10, fake: 2 },
      symbolHint: null,
      telop: '学習専用チップのクラスタに一斉に火が入った',
    },
    {
      id: 'dtt_ingest',
      name: 'Data Transfer Terminal 吸い上げ',
      minStrength: 3,
      weight: { real: 10, fake: 2 },
      symbolHint: null,
      telop: '持ち込んだディスクが一気に吸い上げられている',
    },
    {
      id: 'reinvent',
      name: 're:Invent 会場への背景変化(前兆プールからは除外)',
      minStrength: 3,
      /**
       * weight 0 = 通常の前兆抽選では選ばれない(2026-08-13 ユーザー指摘)。
       *
       * 「遠くから会場のライトが光り始めた」は前兆の1コマではなく、
       * **内部状態が Invent会場(PROVISIONED)へ昇格したときのステージチェンジ合図**
       * として使うほうが自然、という指摘への対応。演出は
       * data/scenarios/normal.js の stage_up_provisioned へ移した。
       *
       * エントリ自体を消さないのは、game/modes/freetier.js の carryWin 経路
       * (エンディングから当選を持ち帰ったとき)が pattern:'reinvent' を直接指定しており、
       * ZENCHO_PATTERN_BY_ID の参照が外れると telop が取れなくなるため。
       * drawPattern は weight>0 のものだけを候補にするので、抽選には現れない。
       * また drawWeightedFixed は候補数によらず必ず rng を1回消費するので、
       * ここを 0 にしてもゲーム抽選の乱数列はズレない。
       */
      weight: { real: 0, fake: 0 },
      telop: '会場の熱気がまだ残っている',
    },
  ],

  /** 結果告知のテロップ */
  telops: {
    miss: '誤検知 — 通常運転に戻ります',
    cz: 'CHANCE ZONE 突入!',
    bonus: 'BONUS 直撃!!',
    at: 'AT 直撃!! スケールアウト開始',
  },
};

/**
 * 分散マップ擬似連(2026-08-13 ユーザー仕様 / 2026-08-15 U58 で題材を差し替え)
 *
 * ■ 題材の差し替え(U58)
 *   もとは AWS DeepRacer の試走だったが、**DeepRacer は 2025-12-15 に提供終了**した。
 *   骨格(1 → 2 → 4 → 大量)をそのまま活かせる現役ネタとして
 *   **AWS Step Functions の分散マップ(Distributed Map)** へ差し替えている。
 *   分散マップは1つの Map ステートから子の実行を最大1万並列で走らせる機能で、
 *   「走る本数が増えるほど熱い」がそのまま成立する。
 *   **内部ID(deepracer / chainParam)は旧名のまま**(上の patterns のコメント参照)。
 *
 * 擬似連は「賑やかしの1コマ」から **擬似連イベント** へ昇格した枠。
 * 突入時に到達step(1〜4)を抽選し、毎ゲーム1stepずつ子の実行が走る。
 *   step1・2 … 実行が走るだけ。ここでは何も起きない
 *   step3    … 到達したら **確率でCZ移行**(外れたらそこで終了、または step4 へ)
 *   step4    … 大量の子の実行が同時に走る激アツ = **ボーナス確定**
 * さらに **擬似連中にレア役を引いたらボーナス確定**(格上げ)。
 *
 * 実装は前兆(zencho)の特別パターンとして乗せている。当選の保持・格上げ・
 * 「告知 → 次スピンで突入」の流儀をそのまま流用できるため。
 * ただし既存の前兆と違って **擬似連自身が当選を生む**(step3/step4)ので、
 * 抽選はゲームRNGで行い、初当りへの影響をシミュで確認して突入率を決めている。
 */
export const DEEPRACER = {
  id: 'deepracer_chain',
  /** この擬似連を起動する演出パターンID(ZENCHO.patterns の id。旧名を内部IDとして維持) */
  patternId: 'deepracer',
  /**
   * 演出契約の param 名。シナリオ側は match:{ param:['deepracer'] } で拾う。
   * **改名しないこと**: scripts/sim.mjs がこの文字列で擬似連の統計を集計している
   * (scripts/ は変更禁止なので、改名すると統計が黙って0件になる)。
   */
  chainParam: 'deepracer',
  /** step ごとに演出へ渡す追加値のキーと値(分散マップは同時に走る子の実行の本数) */
  stepField: 'cars',
  /**
   * 到達step の振り分け。step3以上(何かが起きる可能性のある帯)は約3割。
   * ここを厚くすると擬似連自身が生む当選が増えて初当りが動くので、
   * 変更したら必ず sim.mjs で初当りを測り直すこと。
   */
  targetDist: { 1: 42, 2: 30, 3: 19, 4: 9 },
  /** CZ移行抽選を行う step */
  czStep: 3,
  /** step3 到達時のCZ移行率 */
  czRateAtStep3: 0.50,
  /** この step まで伸びたらボーナス確定 */
  bonusStep: 4,
  /** 各stepで同時に走る子の実行の本数(演出契約の cars。キー名は内部IDのまま) */
  carsByStep: { 1: 1, 2: 2, 3: 4, 4: 12 },
  /** stepField の実体(汎用の advanceChain から参照する。carsByStep と同じ表) */
  get stepValues() { return this.carsByStep; },
  /**
   * 擬似連中のレア役はボーナス確定。
   * ユーザーの言葉は「小役」だが、ベル(1/5)やリプレイまで含めると
   * 擬似連が始まった時点でほぼボーナス確定になり成立しないため **レア役** と解釈した
   * (WEAK_CHERRY / STRONG_CHERRY / MELON / CHANCE / SHARK / GHOST = data/flags.js の rare:true)。
   */
  rareUpgradesToBonus: true,
  /** 各stepのテロップ */
  telops: {
    1: '分散マップの並列処理が1本、走り出した',
    2: '分散マップの並列処理が2本に増えた',
    3: '分散マップの並列処理が4本に増えた!',
    4: '分散マップの並列処理が一斉に立ち上がった!!',
  },
};

/**
 * CodePipeline 擬似連(2026-08-14 追加)
 *
 * 分散マップ擬似連(DEEPRACER)と同じ「擬似連」の骨格を、開発現場のデプロイパイプラインに置き換えたもの。
 *   step1 Source … リポジトリからソースを取得しただけ
 *   step2 Build  … ビルドが走り出す
 *   step3 Test   … テスト通過。ここで **確率でCZ移行**
 *   step4 Deploy … 本番反映まで到達 = **ボーナス確定**
 *
 * 分散マップと同居させる意味は「同じ絵ばかり見ない」ことで、
 * **擬似連そのものの発生量は増やしていない**(ZENCHO.patterns の weight を
 * 分散マップ側から分け合っている)。擬似連は当選を生むイベントなので、
 * 総量を増やすと初当りがそのまま動いてしまうため。
 *
 * czRateAtStep3 を分散マップ(0.50)より少し渋い 0.45 にしてあるのは、
 * step4 の絵(本番反映)を分散マップの大量並列より格上に見せたいから。
 * 到達分布も step4 を薄くしてある。
 */
export const CODEPIPELINE = {
  id: 'codepipeline_chain',
  patternId: 'codepipeline',
  chainParam: 'codepipeline',
  /** step ごとに演出へ渡す追加値のキー(CodePipeline はステージ名) */
  stepField: 'stage',
  targetDist: { 1: 44, 2: 30, 3: 18, 4: 8 },
  czStep: 3,
  czRateAtStep3: 0.45,
  bonusStep: 4,
  stagesByStep: { 1: 'Source', 2: 'Build', 3: 'Test', 4: 'Deploy' },
  get stepValues() { return this.stagesByStep; },
  rareUpgradesToBonus: true,
  telops: {
    1: 'パイプラインが Source を取得した',
    2: 'Build ステージが走り出した',
    3: 'Test ステージ通過 — Deploy が見えてきた!',
    4: 'Deploy ステージへ到達!! 本番反映!!',
  },
};

/**
 * 擬似連の索引。演出パターンID → 擬似連スペック。
 * game/modes/freetier.js の startZencho / advanceChain はこの表だけを見るので、
 * 擬似連を増やすときは「スペックを定義してここへ1行足す」だけで済む。
 */
export const CHAIN_SPEC_BY_PATTERN = {
  [DEEPRACER.patternId]: DEEPRACER,
  [CODEPIPELINE.patternId]: CODEPIPELINE,
};

/** id 引きの索引 */
export const ZENCHO_PATTERN_BY_ID = Object.fromEntries(
  ZENCHO.patterns.map((p) => [p.id, p]),
);

/**
 * 赤文字予兆(zn_hot_*)を持つパターンの台帳(U79 / 2026-08-16)。
 *
 * ■ なぜ台帳が要るのか
 *   赤文字予兆は「強度2以上 かつ 2G目以降」で、**hot 版のシナリオを持つパターンを
 *   引いたときだけ**出る(data/scenarios/zencho.js の zenchoHot)。
 *   つまり「前兆が赤くなる割合」= このリストに載っているパターンが選ばれる確率、
 *   と言い換えられる。ZENCHO.variety の倍率はこのリスト単位で合計を据え置くので、
 *   赤の出現割合が1ミリも動かない(理由は ZENCHO.variety のコメント)。
 *
 * ■ 【厳守】data/scenarios/zencho.js と必ず一致させること
 *   あちらへ zn_hot_* を1本足したら、こちらにも1行足す。
 *   ずれても即座に壊れはしないが、**赤の割合が静かに動く**(検出しにくい事故になる)。
 *   突き合わせ用のワンライナー:
 *     node -e "import('./src/data/scenarios/zencho.js').then(m=>console.log([...new Set(
 *       m.default.filter(s=>String(s.when?.match?.strength)==='2,3')
 *        .flatMap(s=>s.when.match.pattern))].join(' ')))"
 *
 *   ※ 色の台帳(ZENCHO_TEXT_COLORS)と同じ考え方。演出データ側は import を書けないので、
 *     「どちらが正か」をこちら(data/)に置いて、あちらは値を直書きする。
 * @type {Set<string>}
 */
export const ZENCHO_HOT_PATTERNS = new Set([
  // 既存5本(U58 より前からあるもの)
  'xray', 'health', 'guardduty', 'region_evacuation', 'cloudtrail',
  // U58 で足した中7本(全部 hot 版つき)
  'vpc_lattice', 'clean_rooms', 'entity_resolution', 'ram_share', 'kb_citation',
  'mwaa_dag', 'local_zones',
  // U58 で足した熱3本(同上)
  'fis_az_down', 'trainium_cluster', 'dtt_ingest',
]);
