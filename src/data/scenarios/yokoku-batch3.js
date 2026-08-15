/**
 * 予告 第5弾(yb3_)。2026-08-14 ユーザー指示 U35「予兆ネタを10個追加」。
 *
 * docs/IDEAS.md の未消化ネタと、まだ台に一度も出ていない AWS サービスから10ネタ選んだ。
 * 既存の予告(yokoku-*.js)・前兆パターン(data/zencho.js)と **サービスが重複しない**
 * ことを確認済み(KMS / Savings Plans / Compute Optimizer / AWS Backup /
 * Global Accelerator / CloudFormation / Shield / CloudWatch異常検知 /
 * Route 53ヘルスチェック / re:Post)。
 *
 * ══ U5(予告の総量は増やさない)をどう守っているか ═══════════════════
 *
 * director は「候補の中から weight で1本選び、その1本の chance で発火を間引く」。
 * つまり **候補を増やしただけでは発火率は上がらない**(取り分が移るだけ)で、
 * 上がるのは「chance を持たない候補」をchance持ちのプールへ足したときだけ。
 * したがって既存の weight を機械的に削らなくても、
 * **プールの実測発火率と同じ chance を持たせれば総量は据え置き**になる
 * (この考え方と実測値は yokoku-aruaru.js のヘッダが先例。同じ数字を使う)。
 *
 *   leverOn プールの発火率(FREE_TIER / 前兆なし / この追加の直前に計測)
 *     LOSE   候補88本 … 0.148
 *     BELL   候補60本 … 0.140
 *     REPLAY 候補58本 … 0.138
 *     レア役(チェリー/スイカ/チャンス目/確定役)… ほぼ全候補が chance なし = 0.94〜1.00
 *
 *   → 弱(ハズレ寄り)は chance: CHANCE_WEAK。プール内の他の弱予告と同じ水準。
 *   → 中(レア役限定)は chance なし。プールが元から必ず1本出るので総量は動かない。
 *   ※ 上の発火率は **この追加を検討した当時(YOKOKU_CHANCE_SCALE = 0.6)の実測**。
 *     U51 で係数が動いているので絶対値は現行と違う。見るべきは
 *     「弱の chance がプール内で浮いていないか」という相対関係だけ。
 *
 * 既存演出の取り分はそのぶん相対的に下がる(= 重みの按分)。
 * weight を直接いじらないのは、既存8ファイルの数十本を書き換えると
 * 次に足す人が必ず取りこぼすため(1か所で効く仕組みの方を選ぶ)。
 *
 *   【追加前後の実測(全役を出現率で重み付けした1ゲームあたりの予告発火率)】
 *     追加前 0.1872 → 追加後 0.1875(+0.0004 = 100回転あたり +0.04回)
 *     前兆中(LOSE)  0.186 → 0.184(わずかに減)
 *   計測は director の _matches をそのまま使った机上計算。
 *   ※ これも係数 0.6 時代の実測。**総量そのものは U51 で意図的に引き上げてある**。
 *   数字を動かしたくなったら CHANCE_WEAK だけを触ればプール全体に効く。
 *
 * ══ 信頼度の設計(何%でアタリか)═══════════════════════════════════
 *
 * 「そのゲーム単独の当選率」は成立役で決まる。
 * **数値は data/modes.js の CZ_ENTRY.table が唯一の正。ここには写さない**
 * (2026-08-15 検証指摘: 写した数字が U48 の 0.5倍化を取りこぼして2倍ズレていた)。
 * 序列だけは固定で 弱チェ < スイカ < チャンス目 < 強チェ < サメ < ゴースト(100%)。
 * 通常ステージ基準の値に、高確×2 / 激アツ×4 の czMultiplier が上に乗る。
 * ハズレ・ベル・リプレイは CZ_ENTRY に行が無く、**成立役契機では絶対に当選しない**。
 * よって:
 *   【弱】= ハズレ役 + 下の4条件を満たすゲームで出る … 当選は 0%(= ガセ)
 *   【中】= レア役限定で出る … CZ_ENTRY.table の当選率がそのまま信頼度
 *   【前兆中】= 前兆が走っているゲームだけ … 本前兆(当選済み)かガセ前兆か。
 *              data/zencho.js の設計(ガセは非当選ゲームの 1/90)と
 *              CZ当選のペースからの概算で **およそ 2/3 が本物**。
 *              数字を画面で名乗らせないこと(概算なので嘘になりうる)。
 *
 * ══ 文言の3条件(U25)══════════════════════════════════════════════
 *   ① 初見で意味が分かる ② AWSネタが入っている ③ 事実に反しない
 * 数値のねつ造は禁止。ここで名乗っているのは各サービスに実在する概念だけ
 * (KMSのエンベロープ暗号化 / Savings Plansのカバレッジ / Compute Optimizerの
 *  Optimized判定 / AWS Backupの復旧ポイント / Global AcceleratorのエニーキャストIP /
 *  CloudFormationのCREATE_COMPLETE / Shieldの自動緩和 / CloudWatchの異常検知バンド /
 *  Route 53ヘルスチェックの複数チェッカー / re:Postの承認された回答)。
 *
 * ══ 色と結論のライフサイクル(U9 → U57 / U62)══════════════════════
 * 成立役を1つに絞れる中版は **その役の色** を使う(色が出た = その役が成立した)。
 * 役をまたぐ中版(rare:true / 2役)は役色を使わず中立色(COLOR_MID)にする。
 * 弱は「このゲームは当たらない」を言い切る行なので **ハズレ色 = 白**(U62。
 * 以前の #8ad4ff は「弱予告の色」であって役色ではなかった)。
 *
 * 弱の結論も中の結論も conclusionCue() で作る = **第3停止で出て、
 * 次のゲームのレバーONで消える**(U57)。以前は弱だけ at:420〜520 で
 * 第3停止より前に「当たらない」と言い切っていた。
 */

// 天井(Auto Recovery)のゲーム数。NOT_CEILING_GAME の算出に使う(data/modes.js が唯一の正)
import { NORMAL_SUBSTATES } from '../modes.js';
/*
 * 結論行の作法(U57)と役色(U62)は data/rolecolors.js が唯一の正。
 *   弱 = 「このゲームは当たらない」の言い切り → ハズレ色(白)
 *   中 = 成立役が1つに決まるものだけ役色。絞れないものは中立色(COLOR_MID)
 * どちらも **第3停止で出て、次のゲームのレバーONで消える**。
 */
import { conclusionCue, colorForFlag, COLOR_NEUTRAL_MID } from '../rolecolors.js';

/**
 * ハズレ寄りプールに合わせた発火率。yokoku-batch4.js / yokoku-bedrock.js と同値。
 * プール内の他の弱予告と同じ値なので、この演出が選ばれても選ばれなくても
 * プール全体の発火量は動かない。
 * 実効値は director の YOKOKU_CHANCE_SCALE が掛かったもの。
 * **係数の値をここに写さないこと**(staging/director.js が唯一の正。
 * U51 で 0.6 → 1.6 に動いたとき、写しの側が丸ごと嘘になった)。
 */
const CHANCE_WEAK = 0.245;

/**
 * 中の文字色(**役を1つに絞れない**中版だけで使う中立色)。
 * 役色は data/rolecolors.js が唯一の正なので、ここには16進を書かない(U62)。
 */
const COLOR_MID = COLOR_NEUTRAL_MID;

/**
 * 天井(Auto Recovery)に当たらないゲームの `modeState.games` 一覧。
 *
 * 【2026-08-15 検証指摘】弱予告は「ハズレ役 = このゲームは当たらない」を根拠に
 * “ガセ”と名乗っているが、**天井到達ゲームだけは例外**で、
 * ハズレ役でも freetier.js が強制的に CZ へ飛ばす。
 * そこを避けないと「何も起きない」と言った直後に CZ 突入となり、
 * 弱=ガセの取り決めが天井のときだけ嘘になる。
 *
 * freetier.js は onGame の先頭で games を +1 してから `games >= ceiling` を見るので、
 * レバーON時点の games が ceiling-1 のゲームが「天井で飛ぶゲーム」。
 * 数え方は data/scenarios/quiz.js の NOT_CEILING_GAME と同じ(あちらが先例)。
 */
const NOT_CEILING_GAME = Array.from(
  { length: Math.max(1, NORMAL_SUBSTATES.ceiling.games - 1) },
  (_, i) => i,
);

/**
 * ハズレ寄りの発火条件。「このゲームは当たらない」を名乗れる帯だけに限定する。
 * 通常時に当選が生まれる経路は4つあり、その全部を塞いでいる:
 *   1. 成立役契機の抽選     … flag が LOSE/BELL/REPLAY(CZ_ENTRY に行が無い)
 *   2. ステージの毎ゲーム抽選 … subState が COLD_START(czPerGame が 0 の帯)
 *      ※ 高確 0.030/G・激アツ 0.119/G は **成立役に依存せず** 走る
 *   3. 天井(Auto Recovery)の強制CZ … NOT_CEILING_GAME
 *   4. レバーONフリーズ      … freeze が false(leverOn payload に抽選結果が来る)
 * 前兆中も外す(数ゲーム後の当選を保持していることがあるうえ、前兆に画面を譲る)。
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

export default [
  /* ══ 1. KMS エンベロープ暗号化(データキーの復号)═══════════════════
   * 暗号化されたデータキーを KMS で復号できて初めて中身が読める、という手順そのもの。
   * 「復号できたか」が当落の比喩になっていて、弱は暗号文のまま終わる。 */
  {
    id: 'yb3_kms_weak',
    name: '【弱】KMS 復号予告(暗号文のまま終わる)',
    when: WEAK_WHEN,
    weight: { FREE_TIER: 60, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'step_up', step: 1 } },
      conclusionCue({ flag: 'LOSE', text: '暗号文のまま', sub: 'データキーを復号できていない', ms: 800 }),
    ],
  },
  {
    id: 'yb3_kms_mid',
    name: '【中】KMS 復号予告(データキーを復号 = IAM 成立)',
    // 鍵と権限の話なので IAM(チェリー)対応。色もチェリー(U9)
    when: { event: 'leverOn', flag: ['WEAK_CHERRY', 'STRONG_CHERRY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 52, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 40,  layer: 'lcd',  action: 'anim',  params: { anim: 'step_up', step: 3 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 80, layer: 'overlay', action: 'flash',
        params: { color: colorForFlag('WEAK_CHERRY'), ms: 200 } },
      conclusionCue({
        flag: 'WEAK_CHERRY', text: '復号できた', sub: 'KMS がデータキーを開けた', after: 120, ms: 1300,
      }),
    ],
  },

  /* ══ 2. Savings Plans(コミットで単価が下がる)══════════════════════
   * カバレッジ(適用率)は Cost Explorer に実在する指標。
   * 「割引が効いた = 得をした」なのでスイカ(S3 = ためる・節約)対応にした。 */
  {
    id: 'yb3_savingsplans_weak',
    name: '【弱】Savings Plans予告(オンデマンドのまま)',
    when: WEAK_WHEN,
    weight: { FREE_TIER: 58, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.3, over: false, label: 'COVERAGE', sub: 'まだオンデマンド' } },
      conclusionCue({ flag: 'LOSE', text: 'カバー率 低め', sub: '割引はまだ効いていない', ms: 800 }),
    ],
  },
  {
    id: 'yb3_savingsplans_mid',
    name: '【中】Savings Plans予告(カバー率が上がって単価が下がる)',
    when: { event: 'leverOn', flag: ['MELON'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 52, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'contract_sign', gain: 0.6 } },
      { at: 40,  layer: 'lcd',  action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.92, over: true, label: 'COVERAGE', sub: 'コミット適用中', ms: 1700 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      conclusionCue({
        flag: 'MELON', text: '割引が効いた', sub: 'Savings Plans でカバー率が上がった',
        after: 120, ms: 1300,
      }),
    ],
  },

  /* ══ 3. Compute Optimizer(推奨は「そのままでいい」)═════════════════
   * 弱だけのネタ。Optimized 判定は「直すところが無い」= 何も起きない、の言い換え。 */
  {
    id: 'yb3_computeoptimizer_weak',
    name: '【弱】Compute Optimizer予告(推奨: 現状のままで最適)',
    when: WEAK_WHEN,
    weight: { FREE_TIER: 55, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'checklist_ok', gain: 0.55 } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'checklist_green', index: 1 } },
      conclusionCue({ flag: 'LOSE', text: 'OPTIMIZED', sub: 'Compute Optimizer — 推奨なし。いまのままで足りている', ms: 800 }),
    ],
  },

  /* ══ 4. AWS Backup(復旧ポイントを取っておく)════════════════════════
   * 「戻せる状態を先に作る」= これから攻めるぞ、の前振り。強めのレア役限定。 */
  {
    id: 'yb3_backup_mid',
    name: '【中】AWS Backup予告(復旧ポイントを確保)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'contract_sign', gain: 0.7 } },
      { at: 100, layer: 'lcd',  action: 'anim', params: { anim: 'reserved_sign', label: 'BACKUP VAULT' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      // 強チェリーとチャンス目の両方で出る = 役を1つに絞れないので中立色(U62)
      conclusionCue({
        text: 'AWS Backup — 復旧ポイント確保', sub: 'いつでも戻せる状態にした',
        color: COLOR_MID, after: 100, ms: 1300,
      }),
    ],
  },

  /* ══ 5. Global Accelerator(最寄りのエッジから入る)═════════════════
   * 静的エニーキャストIPで最寄りのエッジに着地し、そこからAWSの網に乗る仕組み。
   * 「一気に近道する」画なのでチャンス目(Lambda = 即時発火)対応。 */
  {
    id: 'yb3_globalaccelerator_mid',
    name: '【中】Global Accelerator予告(最寄りのエッジへ着地)',
    when: { event: 'leverOn', flag: ['CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'stream_flow' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'all_regions_light' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'edge_hit' } },
      conclusionCue({
        flag: 'CHANCE', text: 'エニーキャストIPで直行', sub: 'Global Accelerator — 最寄りのエッジから AWS の網に乗った',
        after: 100, ms: 1400,
      }),
    ],
  },

  /* ══ 6. CloudFormation(スタックが立ち上がりきるか)═════════════════ */
  {
    id: 'yb3_cfn_weak',
    name: '【弱】CloudFormation予告(CREATE_IN_PROGRESS のまま)',
    when: WEAK_WHEN,
    weight: { FREE_TIER: 58, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'anim', params: { anim: 'deploy_progress', from: 0, to: 0.45 } },
      conclusionCue({ flag: 'LOSE', text: 'CREATE_IN_PROGRESS', sub: 'スタックはまだ途中', ms: 800 }),
    ],
  },
  {
    id: 'yb3_cfn_mid',
    name: '【中】CloudFormation予告(スタックが立ち上がりきる)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 48, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'deploy_progress', from: 0, to: 1, ms: 1700 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', layer: 'overlay', action: 'particles', params: { preset: 'spark', x: 360, y: 300, count: 14 } },
      // レア役全般で出る = 役を1つに絞れないので中立色(U62)
      conclusionCue({
        text: 'CREATE_COMPLETE', sub: 'CloudFormation — スタックが一式まとめて出来上がった',
        color: COLOR_MID, after: 120, ms: 1300,
      }),
    ],
  },

  /* ══ 7. Shield(前兆中だけ出る = 本前兆寄り)════════════════════════
   *
   * 【本前兆 / ガセの使い分け】
   * このネタだけ **前兆が走っているゲーム限定**(modeState.zenchoActive)。
   * 前兆そのものにガセがあるので当選確定にはならないが、
   * 「出た時点で何かが起きている」= 通常の弱予告より確実に濃い、という段が作れる。
   * 当選を断言する語(確定・突入)は入れない。
   *
   * 画面を取り合わないよう、液晶アニメは使わず **音と1行だけ**にしてある
   * (前兆の絵は zencho.js 側が出しているので、その上に被せない)。
   */
  {
    id: 'yb3_shield_zencho',
    name: '【前兆中】Shield予告(攻撃を自動で緩和している)',
    when: {
      event: 'leverOn', mode: ['FREE_TIER'],
      match: { 'modeState.zenchoActive': [true] },
    },
    /**
     * 【2026-08-15 検証指摘】70 は前兆中プールの中で飛び抜けて重く、
     * 前兆中に出る予告の取り分をこの1本が食っていた
     * (前兆中プールの実測: 候補40本 / 総重み約2,000 / 他は 60 前後、最大でも 100)。
     * 60 の一段下(45)へ落として「たまに出るから濃く見える」位置に戻す。
     * 予告全体の発火量は chance 側で決まるので、ここは取り分だけの調整。
     */
    weight: { FREE_TIER: 45, default: 0 },
    chance: CHANCE_WEAK,
    priority: 'gimmick',
    duration: 1500,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'graviton_hum', gain: 0.55 } },
      { at: 300, layer: 'lcd', action: 'text',
        params: {
          text: 'Shield が吸収している', sub: '大量のトラフィックを自動で緩和中',
          color: '#ffd166', ms: 1000, sticky: false,
        } },
    ],
  },

  /* ══ 8. CloudWatch 異常検知(予測バンドを突き抜けるか)═══════════════
   * 異常検知はメトリクスの予測バンドを機械学習で引き、そこから外れた点を異常とみなす。
   * 「バンド内 = 平常運転(弱)」「突き抜けた = 何か起きている(中)」。 */
  {
    id: 'yb3_cw_anomaly_weak',
    name: '【弱】CloudWatch異常検知予告(バンド内で平常)',
    when: WEAK_WHEN,
    weight: { FREE_TIER: 60, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1200,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.45 } },
      { at: 0,   layer: 'lcd', action: 'anim', params: { anim: 'cw_graph_rise', step: 2 } },
      conclusionCue({ flag: 'LOSE', text: 'バンド内', sub: 'CloudWatch 異常検出 — 想定の範囲で推移している', ms: 800 }),
    ],
  },
  {
    id: 'yb3_cw_anomaly_mid',
    name: '【中】CloudWatch異常検知予告(予測バンドを突き抜ける)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'cw_graph_rise', step: 4 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'cw_graph_rise', step: 5 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'alarm_beep' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.95, over: true, label: 'ANOMALY', sub: 'バンド超過', ms: 1500 } },
      conclusionCue({
        text: 'バンドを突き抜けた', sub: 'CloudWatch が異常を検知',
        color: COLOR_MID, after: 150, ms: 1300,
      }),
    ],
  },

  /* ══ 9. Route 53 ヘルスチェック(まだ切り替わらない)════════════════
   * ヘルスチェックは世界中の複数チェッカーから実行され、
   * 一定数が失敗して初めて unhealthy になる。1つ落ちただけでは何も起きない。
   * 既存の【中】Route53フェイルオーバー予告に対する「弱」の側。 */
  {
    id: 'yb3_route53_health_weak',
    name: '【弱】Route 53 ヘルスチェック予告(1台落ちただけ)',
    when: WEAK_WHEN,
    weight: { FREE_TIER: 58, default: 0 },
    chance: CHANCE_WEAK,
    duration: 1300,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'anim', params: { anim: 'health_check', ok: false, label: 'CHECKER 1/3 NG' } },
      conclusionCue({ flag: 'LOSE', text: 'まだ切り替わらない', sub: 'Route 53 ヘルスチェック — 他のチェッカーは正常のまま', ms: 800 }),
    ],
  },

  /* ══ 10. re:Post(質問に回答が付く)═════════════════════════════════
   * AWS公式のQ&Aコミュニティ。質問者が回答を「承認」する仕組みがある。
   * IDEAS.md 3-18「re:Post質問箱」から。詳しい人が現れる = 事態が動く。 */
  {
    id: 'yb3_repost_mid',
    name: '【中】re:Post予告(回答が承認される)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 46, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'checklist_ok' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'checklist_green', index: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'checklist_green', index: 2 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      conclusionCue({
        text: '回答が承認された', sub: 're:Post — 詳しい人が現れた',
        color: COLOR_MID, after: 120, ms: 1300,
      }),
    ],
  },
];
