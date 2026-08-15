/**
 * インフラ・エッジ・宇宙ロマン系AWSサービスの予告演出集(担当:桃山るな追加分)。
 * DESIGN.md 6.5 / IDEAS.md 2章
 *
 * まだ演出に登場していなかったAWSサービスを、既存の演出語彙
 * (lcdanims / lcdanims-extra / particles / sfx-presets / char)だけで組み立てる。
 * 新規アニメ・新規SFXプリセットの実装は一切なし。
 *
 * 対象サービス: Braket / Outposts(搬入〜接続 と 設置契約の2側面) /
 * IoT Core / Control Tower / Budgets / Batch / Elastic Beanstalk /
 * Greengrass / Fault Injection Service / Lightsail / EKS / App Runner。
 * ※ RoboMaker(2025-09-10 提供終了)は U58 で Fault Injection Service へ差し替え済み(下の J.)。
 * ※ Ground Station(人工衛星)は U46a(2026-08-15)で削除済み。下の A. のコメント参照。
 * ※ Snowファミリー(Snowball Edge は 2025-11-07 新規受付停止 → 2026-12-31 全廃)は
 *   2026-08-15 椿レビュー #3 で Outposts の搬入へ差し替え済み。下の C. のコメント参照。
 *
 * ■ 語彙の使い回し方針
 *   既存アニメは「見た目は同じだが params(label/sub/text)で意味を変える」形で
 *   使い回している。これは既存コードベース自体が health_check の label 差し替えや
 *   reserved_sign の label 差し替え、deploy_progress / cw_meter_swing の汎用ゲージ化で
 *   既にやっている流儀と同じ(1つのアニメが複数サービスの演出を兼務する)。
 *     - health_check(label可変)      … IoT Core / Greengrass のオンライン確認
 *     - reserved_sign(label可変)     … Outposts の設置契約サイン(K.)
 *     - cw_meter_swing(label/sub可変) … Braket の量子ビット確率ゲージ
 *     - deploy_progress               … Elastic Beanstalk / App Runner の自動デプロイ
 *     - step_up(3灯)                  … IoT Core のセンサー数 /
 *                                        Outposts の搬入→設置→接続の3段階(C.)
 *     - pillar_raise / checklist_green … Batch のジョブ進行 / EKS の Pod起立 /
 *                                        Control Tower のコントロール通過
 *       (index は1始まり。index:1→1本目。0始まりで渡すと1本ズレるので注意)
 *     - az_failover / ttl_zero / recover_burst … テキスト焼き込みのない純粋な光の演出
 *
 * ■ 期待度の作り方(yokoku-light.js に合わせる)
 *   - 「弱」は flag に LOSE/BELL/REPLAY 等を含め、chance(≈0.28〜0.35)で発火自体を
 *     薄く間引く(=ハズレでもたまに出るガセ寄り演出)。
 *   - 「中」は rare:true か強レア役限定の flag 配列にし、chance を持たせない
 *     (=出た時点でそれなりに期待していい)。これが「強演出はガセ薄め」に対応する
 *     ペア構成(weak=薄いガセ / mid=レア役限定の本物寄り)。
 *   - すべて mode:['FREE_TIER'] + weight:{FREE_TIER:N, default:0} を基本とし、
 *     RUSH中限定は yi_braket_rush_collapse の1本だけ
 *     (mode: RUSH_MODES + weight: rushWeight(N))。
 *     ※U46a(2026-08-15)で yi_groundstation_rush_downlink を削除したため2本→1本。
 *     ※2026-08-14 修正: U11 で RUSH が4種になったので `AS_RUSH` 直書きをやめ、
 *       data/rushes.js の RUSH_IDS から生成する形にした(RUSH追加に自動追従)。
 *     cw_meter_swing は lcdanims-extra.js のコメントにある
 *     RUSH安全座標(cx:118/cy:224/r:40)をそのまま使っている。
 *   - ゲーム抽選RNGは一切使わない(chance は director.js の演出専用RNG)。
 *   - 「BONUS」を含む文言・「確定/突入/継続」等の当選確定を匂わせる語は使わない
 *     (すべて予告であって当選保証ではないため)。
 *
 * index.js への登録はこのファイルの担当外(依頼者側で実施)。
 */

import { RUSH_IDS, rushWeight } from '../rushes.js';
// 結論行(U57)と役色(U62)は data/rolecolors.js が唯一の正。16進をここに書かない
import { conclusionCue, colorForFlag } from '../rolecolors.js';

/** RUSH 全種(when.mode 用)。data/rushes.js が正 */
const RUSH_MODES = RUSH_IDS;

export default [
  /* ── A.【削除済み】AWS Ground Station(人工衛星との交信)────────────
   *
   * 2026-08-15 ユーザー指示 U46a「アンテナ・衛星ネタはやめる」により
   *   yi_groundstation_weak / yi_groundstation_mid / yi_groundstation_rush_downlink
   * の3本を削除した(data/quiz.js の satellite 問題も同時に削除)。
   *
   * 【発火量への影響】director は候補の中から weight で1本を選ぶ(重みの取り合い)ので、
   * 候補を減らしたぶんの重みは **同じプールの残りへ自動で按分** される。
   *   弱プール    … 削除した55は残り候補へ配分。chance も同水準(0.28〜0.35)なので総量は据え置き
   *   中(rare)   … 48ぶんが他の rare 予告へ回るだけ
   *   RUSH中プール … rushWeight(90)ぶんが他のRUSH予告へ回るだけ
   * したがって「予告が出る頻度」は変わらず、**衛星ネタが出なくなる**だけになる。
   * 復活させたくなったら git 履歴(このコミットの1つ前)から戻せる。
   */

  // ── B. Amazon Braket(量子コンピュータ・観測で当否が確定する) ──
  {
    id: 'yi_braket_weak',
    name: '【弱】Braket予告(重ね合わせのまま終わる)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.30,
    duration: 1300,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.4, over: false, label: '量子ビット', sub: '0と1が重なった状態' } },
      /*
       * 【U57 で見つかった sticky 残置】
       * サブ行の「まだ確定していない」が lcdanims.js の STICKY_KEYWORDS の
       * 「確定」を踏むため、**弱予告なのに次のレバーONまで残る告知** になっていた
       * (isStickyText はメイン行だけでなくサブ行の判定にも使われる経路がある)。
       * 弱予告は結論を出さない煽りなので、sticky:false を明示して打ち消す。
       * 文言側も「確定」を避けてある(2026-08-16 しおん指摘で、量子用語の
       * 「収束」もやめ、Braket が何のサービスかを名乗る形へ差し替えた)。
       */
      { waitFor: 'stop3', layer: 'lcd', action: 'text',
        params: {
          text: '答えは出ず', sub: 'Amazon Braket — 量子コンピュータをクラウドで試せる',
          color: '#8ad4ff', ms: 700, sticky: false,
        } },
    ],
  },
  {
    id: 'yi_braket_mid',
    name: '【中】Braket予告(観測で収束)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 48, default: 0 },
    duration: 2300,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 40,  layer: 'lcd',  action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.6, over: false, label: '量子ビット', sub: '0か1かが揺れている' } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.9, over: true, label: '量子ビット', sub: 'もうすぐ1つに決まる', ms: 1600 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 100, layer: 'overlay', action: 'flash', params: { color: '#c8b0ff', ms: 220 } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: '観測完了', sub: 'Amazon Braket — 実機の量子コンピュータで計算した', color: '#ffe066', ms: 1300 } },
    ],
  },
  {
    id: 'yi_braket_rush_collapse',
    name: 'RUSH中: Braket量子ビット収束(上乗せ濃厚)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE', 'SHARK'], mode: RUSH_MODES },
    weight: rushWeight(85),
    duration: 2800,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,   layer: 'lcd', action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.55, over: false, label: '量子ビット', sub: '0と1が重なった状態' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'alarm_beep' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim',
        params: { anim: 'cw_meter_swing', to: 0.95, over: true, label: '量子ビット', sub: '観測して1つに決まる', ms: 2000 } },
      { waitFor: 'stop3', after: 700, layer: 'overlay', action: 'flash', params: { color: '#c8b0ff', ms: 240 } },
      { waitFor: 'stop3', after: 900, layer: 'lcd', action: 'text',
        params: { text: '答えが1つに!!', sub: 'Amazon Braket — 量子コンピュータが答えを出した', color: '#ffe066', ms: 1200 } },
    ],
  },

  /* ── C. AWS Outposts の搬入(ラックが届いて、リージョンと繋がるまで)──
   *
   * ══ 【差し替え】2026-08-15 椿レビュー #3 ═══════════════════════════
   * ここは元は Snowファミリー(Snowcone→Snowball→Snowmobile の3段階)だった。
   * Snowball Edge は 2025-11-07 に新規受付を停止し 2026-12-31 で全廃、
   * Snowmobile に至ってはすでに提供が無い。**もう届かない箱**を「到着した」と
   * 出すのは U25 の条件③(事実に反しない)を踏むので、丸ごと差し替えた。
   *
   * 【なぜ Outposts か】
   *   ・元の画は step_up の3灯で「**モノが届いて、だんだん大きくなる**」を見せていた。
   *     Outposts は AWS がラックを持ってきて設置し、親リージョンへ繋いで初めて使える
   *     ので、「搬入 → 設置 → 接続」の段取りがそのまま同じ絵に乗る
   *   ・「AWSのハードが自分の建物に来る」という**Snowファミリーと同じ驚き**を残せる
   *
   * 【下の K. の Outposts と画がかぶらないこと】
   *   K. yi_outposts_mid … reserved_sign(**契約書にサイン**する紙の絵)。まだ何も来ていない
   *   ここ              … step_up(**現物が来てからの段取り**)。契約の先の話
   *   同じサービスを別の側面で出すのはこのファイルの流儀(冒頭「語彙の使い回し方針」)。
   *
   * 【発火量】weight(55 / 50)・chance(0.32)・尺・アニメ・SFX はすべて据え置き。
   *   差し替えであって増減ではないので、予告の総量は1も動かない。
   */
  {
    id: 'yi_outposts_deliver_weak',
    name: '【弱】Outposts予告(ラックは届いたが設置はこれから)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.32,
    duration: 1300,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'step_up', step: 2 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',  params: { text: 'RACK 搬入', sub: 'AWS Outposts — ラックは届いたが設置はこれから', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'yi_outposts_link_mid',
    name: '【中】Outposts予告(ラックがリージョンと繋がった)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 60,  layer: 'lcd',  action: 'anim',  params: { anim: 'step_up', step: 3 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 220 } },
      { waitFor: 'stop3', after: 60, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 20 } },
      // 「サービスリンク」は Outposts が親リージョンへ張る接続の呼び名(公式用語)
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'SERVICE LINK 確立', sub: 'ラックがリージョンと繋がった', color: '#ffe066', ms: 1300 } },
    ],
  },

  // ── D. AWS IoT Core(センサーが次々オンラインになる) ──────────
  {
    id: 'yi_iotcore_weak',
    name: '【弱】IoT Core予告(1台だけオンライン)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'step_up', step: 1 } },
      // U78: サブ行が無く「DEVICE ONLINE ×1」だけでは何の話か分からなかった。
      //      サービス名 + 起きたことの日本語を足す(以下の【弱】3本も同じ理由)
      { waitFor: 'stop3', layer: 'lcd', action: 'text',
        params: { text: 'DEVICE ONLINE ×1', sub: 'AWS IoT Core — つながった機器はまだ1台だけ', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'yi_iotcore_mid',
    name: '【中】IoT Core予告(全センサー接続完了)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 60,  layer: 'lcd',  action: 'anim',  params: { anim: 'step_up', step: 3 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'health_check', ok: true, label: 'FLEET ONLINE' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 200, layer: 'lcd', action: 'text',
        params: { text: 'FLEET READY', sub: 'AWS IoT Core — 全センサーが接続完了', color: '#ffe066', ms: 1300 } },
    ],
  },

  // ── E. AWS Control Tower(コントロール全通過) ────────────────
  // 2023年に「ガードレール」は「コントロール」へ改称された
  {
    id: 'yi_controltower_weak',
    name: '【弱】Control Tower予告(コントロール1/3)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.32,
    duration: 1100,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'checklist_ok', gain: 0.6 } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'checklist_green', index: 1 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',
        params: { text: 'CONTROL 1/3', sub: 'AWS Control Tower — コントロールは1つしか通らなかった', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'yi_controltower_mid',
    name: '【中】Control Tower予告(全コントロール通過)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE', 'SHARK'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    duration: 3400,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'checklist_ok' } },
      { at: 40,  layer: 'lcd',  action: 'anim',  params: { anim: 'checklist_green', index: 1 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'checklist_green', index: 2 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'checklist_green', index: 3 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'all_regions_light' } },
      { waitFor: 'stop3', after: 1700, layer: 'lcd', action: 'text',
        params: { text: 'LANDING ZONE OK', sub: '全コントロール通過', color: '#ffe066', ms: 1300 } },
    ],
  },

  // ── F. AWS Budgets(今月の予算を超えそう) ──────────────────
  {
    id: 'yi_budgets_weak',
    name: '【弱】Budgets予告(支出がゆるやかに増加)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    chance: 0.35,
    duration: 1000,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'cw_graph_rise', step: 2 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text', params: { text: '支出 微増', sub: 'AWS Budgets — 予算の内側で収まっている', color: '#8ad4ff', ms: 600 } },
    ],
  },
  {
    id: 'yi_budgets_mid',
    name: '【中】Budgets予告(予算超過アラート)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'char', action: 'pose',   params: { char: 'kiro', pose: 'panic' } },
      { at: 40,  layer: 'lcd',  action: 'anim',   params: { anim: 'cw_graph_rise', step: 3 } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'cw_graph_rise', step: 4 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'cw_graph_rise', step: 5 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'alarm_beep' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'ttl_zero' } },
      { waitFor: 'stop3', after: 150, layer: 'overlay', action: 'flash', params: { color: '#ff8a00', ms: 220 } },
      // U78: 「今月の運勢、オーバーラン」は占いの言い回しで、AWS Budgets が
      //      何を知らせたのか分からなかった。実際の通知内容(超過予測)を書く
      { waitFor: 'stop3', after: 200, layer: 'lcd', action: 'text',
        params: { text: '予算超過見込み', sub: 'AWS Budgets — 今月の請求が予算を超えると予測された', color: '#ffd166', ms: 1300 } },
    ],
  },

  // ── G. AWS Batch(深夜バッチが静かに走る) ────────────────────
  {
    id: 'yi_batch_weak',
    name: '【弱】Batch予告(1件だけ静かに完了)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.30,
    duration: 1000,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
      { at: 0,   layer: 'lcd', action: 'anim',  params: { anim: 'pillar_raise', index: 1, count: 5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',
        params: { text: 'JOB #1 完了', sub: 'AWS Batch — バッチジョブが1件だけ静かに終わった', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'yi_batch_mid',
    name: '【中】Batch予告(深夜ジョブが一気に完了)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 48, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 1, count: 5 } },
      { at: 120, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 2, count: 5 } },
      { at: 240, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 3, count: 5 } },
      { at: 360, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 4, count: 5 } },
      { at: 480, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 5, count: 5 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'burst_recover', amount: 42 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'BATCH 完了', sub: 'AWS Batch — 42件ぶんの計算資源を自動で確保した', color: '#ffe066', ms: 1300 } },
    ],
  },

  // ── H. AWS Elastic Beanstalk(プラットフォーム自動デプロイ) ───
  {
    id: 'yi_beanstalk_weak',
    name: '【弱】Elastic Beanstalk予告(デプロイ道半ば)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.32,
    duration: 1000,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 0,   layer: 'lcd', action: 'anim', params: { anim: 'deploy_progress', from: 0, to: 0.4 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'text',
        params: { text: 'DEPLOYING…', sub: 'Elastic Beanstalk — 環境の構築は途中で止まっている', color: '#8ad4ff', ms: 800 } },
    ],
  },
  {
    id: 'yi_beanstalk_mid',
    name: '【中】Elastic Beanstalk予告(自動デプロイ完了)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 48, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'deploy_progress', from: 0, to: 1, ms: 1800 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', layer: 'overlay', action: 'particles', params: { preset: 'spark', x: 360, y: 300, count: 16 } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'BEANSTALK', sub: '環境を自動構築→公開', color: '#ffe066', ms: 1400 } },
    ],
  },

  // ── I. AWS IoT Greengrass(切断されてもエッジ推論は止まらない) ─
  {
    id: 'yi_greengrass_mid',
    name: 'Greengrass予告(クラウド切断中もエッジ推論は止まらない)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'graviton_hum', gain: 0.6 } },
      { at: 60,  layer: 'lcd',  action: 'anim', params: { anim: 'health_check', ok: true, label: 'EDGE ONLINE' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'text',
        params: { text: 'GREENGRASS', sub: 'クラウドが切れてもエッジは止まらない', color: '#8fe6f5', ms: 1300 } },
    ],
  },

  /* ── J. AWS Fault Injection Service(障害注入の実験が実行中)───────
   *
   * 【2026-08-15 U58 / 廃止サービスの差し替え】
   * ここは元 AWS RoboMaker(ロボットのシミュレーション)だったが、
   * **RoboMaker は 2025-09-10 に提供終了**したため、現役サービスへ差し替えた。
   * 「実行中の箱がひとつ動いている」という演出の骨格(sfn_task の running)は
   * そのまま使えるので、cues の構成は1行も変えていない。
   *
   * 【前兆側の FIS とのすみ分け】
   *   前兆(data/zencho.js の fis_az_down)… **AZ 全電源断のシナリオを投入した**話
   *   ここ                              … **実験(Experiment)が実行中**という話
   * 同じサービスだが見せている場面が違う(投入の瞬間 / 走っている最中)。
   */
  {
    id: 'yi_fis_experiment_mid',
    name: 'Fault Injection Service予告(障害注入の実験が実行中)',
    // 旧実装は sfn_task に ok:true を渡して「SUCCEEDED」と断言していた。
    // レバーON時点では当落が未確定なので、結論は出さず実行中表示に留める
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 48, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 60,  layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'surprised' } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'sfn_task', result: 'running' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'sfn_choice' } },
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'EXPERIMENT RUNNING', sub: 'Fault Injection Service — 本番にわざと故障を起こす実験', color: '#ffe066', ms: 1400 } },
    ],
  },

  // ── K. AWS Outposts(オンプレへの設置契約) ───────────────────
  {
    id: 'yi_outposts_mid',
    name: 'Outposts予告(設置契約書にサイン)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'contract_sign' } },
      { at: 100, layer: 'lcd',  action: 'anim', params: { anim: 'reserved_sign', label: 'OUTPOSTS' } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'text',
        params: { text: 'OUTPOSTS 設置契約', sub: 'ラックがそちらへ向かいます', color: '#c8b0ff', ms: 1400 } },
    ],
  },

  /* ── L. Amazon Lightsail(ワンクリックでお手軽に起動) ──────────
   *
   * ══ 2026-08-15 ユーザー指示 U66-6: 煽りだけで終わらせない ═══════════
   * 旧実装は「LIGHTSAIL / ワンクリックで起動」と出して**それきり**で、
   * 結局そのゲームで何が起きたのか(起動できたのか)を一度も言わなかった。
   * 起動ボタンを押す絵なのだから、**押した結果**まで見せるのが筋。
   *
   * 弱(ハズレ帯)  … 第3停止で「起動しなかった…」= ハズレ(役色は白)
   * 中(レア役帯)  … 第3停止で「起動した!」= 成立(役色。ここは色 = 成立役)
   *
   * 結論は conclusionCue(U57)で出す:
   *   出す = 第3停止(当落の確定点)/ 消える = 次のレバーON(sticky)
   * 見た目(煽りの1枚目)は弱・中で共通にしてあるので、入りでは当落は読めない。 */
  {
    id: 'yi_lightsail_weak',
    name: '【弱】Lightsail予告(起動ボタンを押したが立ち上がらない)',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    chance: 0.28,
    duration: 1400,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ui_select' } },
      { at: 0,   layer: 'lcd', action: 'particles', params: { preset: 'spark', x: 220, y: 150, count: 8 } },
      { at: 300, layer: 'lcd', action: 'text', params: { text: 'Lightsail 起動中…', sub: 'ワンクリックでインスタンスを立ち上げる', color: '#8ad4ff', ms: 600 } },
      conclusionCue({
        flag: 'LOSE',
        text: '起動しなかった…',
        sub: 'Lightsail — インスタンスは立ち上がらないまま終わった',
        ms: 900,
      }),
    ],
  },
  {
    id: 'yi_lightsail_mid',
    name: '【中】Lightsail予告(ワンクリックで本当に起動した)',
    // レア役全般で出るが、結論は「起動した = 何かが成立した」なので中立色は使わず、
    // 役が1つに決まるチャンス目(Lambda = ワンクリック起動と相性がよい)に絞る
    when: { event: 'leverOn', flag: ['CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'ui_select' } },
      { at: 0,   layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 220, y: 150, count: 8 } },
      { at: 300, layer: 'lcd',  action: 'text', params: { text: 'Lightsail 起動中…', sub: 'ワンクリックでインスタンスを立ち上げる', color: '#8ad4ff', ms: 600 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 80, layer: 'overlay', action: 'flash', params: { color: colorForFlag('CHANCE'), ms: 200 } },
      conclusionCue({
        flag: 'CHANCE',
        text: '起動した!',
        sub: 'Lightsail — 固定料金のインスタンスが立ち上がった',
        after: 120,
        ms: 1300,
      }),
    ],
  },

  // ── M. Amazon EKS(Podがオーケストラのように一斉に立ち上がる) ─
  {
    id: 'yi_eks_mid',
    name: 'EKS予告(Podが一斉に立ち上がる)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE', 'SHARK'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 1900,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'dynamo_scale' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 1, count: 6 } },
      { at: 140, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 2, count: 6 } },
      { at: 240, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 3, count: 6 } },
      { at: 340, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 4, count: 6 } },
      { at: 440, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 5, count: 6 } },
      { at: 540, layer: 'lcd',  action: 'anim', params: { anim: 'pillar_raise', index: 6, count: 6 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', layer: 'overlay', action: 'particles', params: { preset: 'scale', x: 360, y: 380, count: 18 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'text',
        params: { text: 'EKS', sub: 'Podが一斉に立ち上がった', color: '#7bf7d0', ms: 1300 } },
    ],
  },

  /* ── N. Amazon ECS(ローリングデプロイ) ────────────
   *
   * 旧: AWS App Runner(2026-04-30 新規受付終了=メンテナンスモードのため差し替え。
   * 椿レビュー #1 の波及分。2026-08-15)。deploy_progress の絵と weight 45 は
   * そのまま流用し、id とテキストだけ入れ替えた(同枠・同重み=発火量不変)。
   * ECS のローリング更新は「新タスクを起動→ヘルス確認→旧タスクを外す」を
   * 進捗バーで進める画がそのまま合う。Fargate(batch4=起動基盤)とは切り口が別。
   */
  {
    id: 'yi_ecs_rolling_mid',
    name: 'ECS予告(ローリングデプロイ進行)',
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 40,  layer: 'lcd',  action: 'anim', params: { anim: 'deploy_progress', from: 0, to: 1, ms: 1600 } },
      { waitFor: 'stop3', layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', layer: 'overlay', action: 'particles', params: { preset: 'spark', x: 360, y: 300, count: 16 } },
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'text',
        params: { text: 'ECS ROLLING DEPLOY', sub: '新しいタスクへ入れ替え完了', color: '#ffe066', ms: 1400 } },
    ],
  },
];
