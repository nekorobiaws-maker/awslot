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
    /** 非当選ゲームでの発生率(1/denom)。前兆中はさらに抽選しない */
    denom: 40,
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

  /**
   * 演出パターン。
   *  minStrength … この強度以上のときだけ抽選対象になる
   *  weight.real / weight.fake … 本前兆とガセで配分を変える(見分けがつきそうでつかない値)
   *  telop … 前兆中に液晶下へ出る一言
   *
   * IDEAS.md 2-6 / 2-10 / 2-23 / 2-27 / 2-29 / 2-34 / 2-35 / 3-3 から採用。
   */
  patterns: [
    {
      id: 'deepracer',
      name: 'DeepRacer 試走',
      minStrength: 1,
      weight: { real: 10, fake: 42 },
      telop: 'DeepRacer がコースを試走している',
    },
    {
      id: 'sqs_backlog',
      name: 'SQS 保留メッセージ滞留',
      minStrength: 1,
      weight: { real: 26, fake: 34 },
      telop: 'SQS のキューが捌けていない',
    },
    {
      id: 'canary',
      name: 'カナリアリリース',
      minStrength: 1,
      weight: { real: 32, fake: 26 },
      telop: 'カナリアへトラフィックを流し始めた',
    },
    {
      id: 'xray',
      name: 'X-Ray 赤トレース',
      minStrength: 2,
      // reinvent を外したぶんの再配分(real +8 / fake +1)
      weight: { real: 42, fake: 25 },
      telop: 'X-Ray に赤いトレースが混ざり始めた',
    },
    {
      id: 'health',
      name: 'AWS Health Dashboard 緊急メンテナンス',
      minStrength: 2,
      // 再配分(real +4 / fake +6)。fake を厚めにしたのは、この前兆の顛末を受け持つ
      // Well-Architected の失敗側(yh_wa_result_short)が出る機会を確保するため
      weight: { real: 38, fake: 26 },
      telop: 'AWS Health Dashboard に通知',
    },
    {
      id: 'guardduty',
      name: 'GuardDuty 不審アクセス検知',
      minStrength: 2,
      // 再配分(real +6 / fake +1)
      weight: { real: 36, fake: 23 },
      telop: 'GuardDuty が不審なアクセスを検知',
    },
    {
      id: 'cloudtrail',
      name: 'CloudTrail Root User Login',
      minStrength: 3,
      // 再配分(real +22)。強度3で選ばれる唯一の専用パターンになったので厚くする
      weight: { real: 68, fake: 14 },
      telop: 'CloudTrail にログが流れ続けている',
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
 * DeepRacer 擬似連(2026-08-13 ユーザー仕様)
 *
 * DeepRacer は「賑やかしの1コマ」から **擬似連イベント** へ昇格した。
 * 突入時に到達step(1〜4)を抽選し、毎ゲーム1stepずつ車が走る。
 *   step1・2 … 車が走るだけ。ここでは何も起きない
 *   step3    … 到達したら **確率でCZ移行**(外れたらそこで終了、または step4 へ)
 *   step4    … 車が大量に走る激アツ = **ボーナス確定**
 * さらに **擬似連中にレア役を引いたらボーナス確定**(格上げ)。
 *
 * 実装は前兆(zencho)の特別パターンとして乗せている。当選の保持・格上げ・
 * 「告知 → 次スピンで突入」の流儀をそのまま流用できるため。
 * ただし既存の前兆と違って **擬似連自身が当選を生む**(step3/step4)ので、
 * 抽選はゲームRNGで行い、初当りへの影響をシミュで確認して突入率を決めている。
 */
export const DEEPRACER = {
  id: 'deepracer_chain',
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
  /** 各stepで走る車の台数(演出契約の cars) */
  carsByStep: { 1: 1, 2: 2, 3: 4, 4: 12 },
  /**
   * 擬似連中のレア役はボーナス確定。
   * ユーザーの言葉は「小役」だが、ベル(1/5)やリプレイまで含めると
   * 擬似連が始まった時点でほぼボーナス確定になり成立しないため **レア役** と解釈した
   * (WEAK_CHERRY / STRONG_CHERRY / MELON / CHANCE / SHARK / GHOST = data/flags.js の rare:true)。
   */
  rareUpgradesToBonus: true,
  /** 各stepのテロップ */
  telops: {
    1: 'DeepRacer が走り出した',
    2: '2台目が追いついてきた',
    3: '4台が並んで最終コーナーへ!',
    4: '大量の DeepRacer がコースを埋め尽くした!!',
  },
};

/** id 引きの索引 */
export const ZENCHO_PATTERN_BY_ID = Object.fromEntries(
  ZENCHO.patterns.map((p) => [p.id, p]),
);
