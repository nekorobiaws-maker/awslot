/**
 * M02〜M04. CZ層。DESIGN.md 2.2 / 3.6
 *
 *   SQS_REDRIVE      3G / 突破率26% … DLQを空にできれば突破(★☆☆)
 *   CW_ALARM         3G / 突破率30% … 折れ線グラフが閾値を超えれば突破(★☆☆)
 *   CONFIG_RULES     4G / 突破率36% … ルールを1つずつ COMPLIANT に。全部で突破(★☆☆ / U52c)
 *   ALB_CZ           4G / 突破率42% … 全ターゲット healthy で HTTP 200(★★☆)
 *   DX_REDUNDANCY    4G / 突破率47% … 専用線4本を開通できれば突破(★★☆ / U52c)
 *   TRUSTED_ADVISOR  5G / 突破率50% … 6カテゴリを順にチェック。**全緑でボーナス確定**(★★☆)
 *   SFN_CZ           5G / 突破率55% … ステートマシンが Success State まで流れきれば確定(★★☆)
 *   CODEDEPLOY_BG    5G / 突破率62% … Green へ 100% シフトできれば突破(★★☆)
 *   SHIELD_DDOS      3G / 突破率66% … 1ゲーム2波のDDoSを6波緩和しきれば突破(★★☆ / U52c)
 *   FIS_GAMEDAY      5G / 突破率72% … 注入される障害を5つ耐え切れば突破(★★★)
 *   WELL_ARCHITECTED 10G / 突破率84% … 小役で柱を6本積み切れば突破(★★★ / U10・U27)
 *     ※ 参加型なので「突破率」は当落抽選ではなく **10Gで6本積める確率**(DPの厳密値)。
 *       29% は獲得則が18G時代のままだった頃の値で、いまは獲得則を引き直して 84.1%
 *
 * DESIGN.md 4.2 の原則どおり、突破可否は突入時に確定させ、
 * グラフ/チェックリスト/ワークフロー/ターゲット/キュー/シフトバー/バジェットは
 * その結果へ向かって動く(= 演出は結果を先に知っている)。
 *
 * ── U52c(2026-08-15)で足した3種の位置づけ ──
 * 液晶の盤面(ui)は既存のものを借りているが、**進行の型は必ずずらしてある**:
 *   CONFIG_RULES(ui:'checklist')… 1ゲームに1ルールずつ結果が確定する **打ち切り型**。
 *     最終ゲームで一斉に全緑になる TRUSTED_ADVISOR とは緊張の作り方が逆
 *   DX_REDUNDANCY(ui:'pillars') … 当落先付けの **一斉開通型**。
 *     引いた役で柱が伸びる参加型(WELL_ARCHITECTED)とは別物で、
 *     道中は failRaised(1本)止まり → 最終ゲームで4本同時に開通する
 *   SHIELD_DDOS(ui:'fis')       … 1ゲームに2波が来る **波状の耐久型**。
 *     1ゲーム1つの FIS_GAMEDAY よりテンポが速く、3Gの短期決戦になる
 *
 * ── 例外は Well-Architected(spec.participation)だけ ──
 * U10(2026-08-14 ユーザー指摘「6本の柱CZがほぼ必ずボーナスで緊張感がない」)で、
 * ここだけ **小役で積んだ柱がそのまま結果** になる参加型へ作り替えた
 * (U22〜U24 でゲーム全体がレア役契機に統一されたあとも、ここだけは小役契機のまま)。
 * 突入時に当落は引かず、6本揃った瞬間に突破が確定する(天井経由のみ保証あり)。
 *
 * ── 新CZを足すときの掟(既存4種で踏んだ地雷の再発防止)──
 *  1. 突破は必ず「完成の画」を作る(全緑 / 6本 / Success State / 全台 healthy /
 *     QUEUE EMPTY / 100% シフト / 全障害 SURVIVED)。「n-1個で確定」は禁止
 *  2. 途中経過から当落が読めてはいけない。当落どちらも道中は同じ上限までしか進めない
 *  3. 「間に合わない絵」を作らない。残りG × 1ゲームの最大進行 ≧ 残タスク数 を常に満たす
 *  4. 結果の画は当落確定イベント(setEnd / 着地の paramChange)からしか出さない
 *  5. RNGの無駄打ちを避ける(failStep / failShift は非突破時だけ引く)
 *
 * ── 結果の見せ方(2026-08-13 ユーザー指摘への対応)──
 * CZの結果は「CZの画面の上」で起きるので、結果が出た瞬間に遷移すると
 * 結果の画が1フレームも見えないまま次のモードの画面に差し替わる。
 * 各遷移に `holdMs`(CZ内の結果表示)を付けて見せ切ってから遷移する。
 * なお通常時からCZへ入る側は `onNextSpin`(次のレバーONで遷移)で、
 * 「告知は通常画面のまま → 次に回したスピンがCZの1G目」になっている(freetier.js)。
 *
 * ── 液晶へ渡す状態(render 側との受け渡し契約)──
 * ui:'sfn'(Step Functions CZ)は以下を state に載せる。描画側はこれだけ見れば描ける:
 *   state.states     … [{ name, type, status }]  status = 'pending' | 'succeeded' | 'failed'
 *   state.stateIndex … 処理が終わったステート数(= 次に処理するステートの添字)
 *   state.total      … ステート総数(= spec.games)
 *   state.failed     … Fail State へ落ちたか
 *   state.failedAt   … 落ちたステートの添字(落ちていなければ null)
 *   state.cleared    … Success State まで流れきったか(= ボーナス確定)
 *
 * ui:'alb'(ALB ターゲットグループCZ)
 *   state.targets    … [{ name, status:'unhealthy'|'checking'|'healthy', passes, need }]
 *   state.healthy / state.healthyNeeded … healthy 台数と突破に必要な台数
 *   state.rule / state.routedTo … 今ゲームのリスナールールとルーティング先
 *   state.httpStatus … 200(healthy が1台でもある)/ 503(healthy が0台)
 *   state.degraded   … 200 だが全台 healthy ではない(一部ターゲット障害)。
 *                      突破 = 全台 healthy なので、degraded:true は必ず非突破側
 *
 * ui:'dlq'(SQS デッドレター再処理CZ)
 *   state.messages / state.messagesTotal … 残っている滞留数と初期滞留数
 *   state.receiveCount / state.maxReceiveCount … 受信回数としきい値
 *   state.drained    … 空にできたか(= ボーナス確定)
 *
 * ui:'bluegreen'(CodeDeploy Blue/Green CZ)
 *   state.shiftSteps / state.stepIndex / state.shift … シフト段階と現在の%
 *   state.errorRate / state.errorThreshold … エラー率としきい値(%)
 *   state.rolledBack / state.deployed … 自動ロールバックしたか / 完了したか
 *
 * ui:'fis'(GameDay CZ / Shield・WAF DDoS 防御CZ)
 *   state.faults     … [{ name, short, status:'pending'|'survived'|'broken' }]
 *     name  … テロップで読ませる正式名(「DNS クエリ増幅」)
 *     short … カードに焼く短縮名(spec に無ければ name をそのまま使う)。
 *             Shield は6枚並ぶのでカード幅が 61px しかなく、正式名だと
 *             全部「DNS クエ…」に省略されて読めなかった(2026-08-15 検証指摘)
 *   state.survived / state.budget / state.budgetInit … 耐えた数とエラーバジェット(%)
 *   state.broken     … バジェットが尽きたか
 *   state.faultsPerGame … 1ゲームで処理する数(GameDay 1 / Shield 2)。盤面は読まない
 *
 * ui:'checklist' の CONFIG_RULES(AWS Config 準拠ルールCZ / U52c)
 *   state.items      … [{ name, level }] level 0=NON_COMPLIANT 1=評価中 2=COMPLIANT
 *   state.greenNeeded … 突破に必要な COMPLIANT 数(= ルール総数)
 *   state.statusLabels … level 0/1/2 に焼く文字。既定は Trusted Advisor の
 *                        ['NG','WARN','GREEN']。CONFIG_RULES は AWS Config の
 *                        評価結果名(NON_COMPLIANT / 評価中 / COMPLIANT)を渡す
 *   state.goalLabel  … 盤面下の1行。既定は「GREEN n / N で突破」
 *
 * ui:'pillars' の DX_REDUNDANCY(Direct Connect 冗長化CZ / U52c)
 *   state.pillars / state.raised / state.pillarNeeded … 専用線の名前と開通済み本数
 *   state.failRaised … 非突破時に開通する上限(道中の頭打ちも同じ値)
 *   ※ 参加型ではないので state.pillarGain は使わない(引いた役では開通しない)
 */

import { drawBonusType } from '../lottery.js';
import { CZ_SPEC_BY_ID, czStars } from '../../data/modes.js';
import { isRareRole } from '../../data/rareroles.js';

/** グラフの閾値ライン(液晶の描画スケールと共有する論理値) */
export const CZ_GRAPH_THRESHOLD = 100;
export const CZ_GRAPH_MAX = 140;

/**
 * CZの結果は **CZの画面の上** で起きる:
 *   全項目グリーンのチェックリスト / 6本立ち切った柱 /
 *   Success State まで点灯したワークフロー / 閾値を割ったグラフ
 *
 * 結果が出た瞬間に遷移すると、この「完成の画」が1フレームも見えないまま
 * 液晶がボーナス入賞待ちや通常画面へ差し替わる。
 * ユーザー指摘(2026-08-13)の
 *   「全緑になっていないのにボーナス確定した」
 *   「5本しか柱が立っていないのにボーナス確定した」
 * はどちらもこれが原因だった。
 *
 * 対策は2段構え:
 *   1. 突破は必ず「完成の画」を作る(全緑 / 6本 / Success State 到達)
 *   2. 遷移は `onNextSpin` で **次のレバーONまで待つ**
 *      = 完成の画を見てから、自分でレバーを引いて次のモードへ入る
 * 時間で明ける holdMs も仕組みとしては残っている(modemachine.js 参照)。
 */
export const CZ_RESULT_HOLD_MS = { success: 1600, fail: 1200 };

/** Trusted Advisor で1ゲームに進むチェック項目数の上限(見た目のペース) */
export const CHECKLIST_MAX_PER_GAME = 2;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const cz = {
  id: 'CZ',
  name: 'CHANCE ZONE',
  type: 'CZ',

  onEnter(state, params = {}, ctx) {
    const spec = CZ_SPEC_BY_ID[params.czId] ?? CZ_SPEC_BY_ID.CW_ALARM;
    state.czId = spec.id;
    state.name = spec.name;
    state.ui = spec.ui ?? 'graph';
    /**
     * 期待度(2026-08-13 ユーザー指示)。
     * CZごとに突破率の格差を付けた以上、突入した瞬間に「格」が伝わらないと
     * ただの理不尽な負けに見える。テロップと突入シナリオの両方でこれを出す。
     */
    state.expectation = spec.expectation ?? 1;
    state.stars = czStars(spec);
    /**
     * 天井(Auto Recovery)経由は突破保証ぶんなので短い消化G数を使う。
     * 抽選で引いた Well-Architected(10G の参加型)と同じ長さにすると、
     * 保証の救済のはずが「長い作業」に化けてしまう。
     */
    const games = params.ceiling && spec.ceilingGames ? spec.ceilingGames : spec.games;
    state.total = games;
    state.remaining = games;
    /**
     * 突破可否は突入時に確定(DESIGN.md 4.2)。
     * ただし **参加型CZ(spec.participation)** だけは U10 で
     * 「小役で積んだ柱が結果そのもの」になったので、ここでは引かず false から始める
     * (天井経由だけは保証で true)。
     *
     * U52c で ui:'pillars' の当落先付けCZ(DX_REDUNDANCY)が増えたため、
     * 判定を ui ではなく **spec.participation** に付け替えてある。
     * ui で判定したままだと DX が「当落を引かない = 絶対に突破しない」CZ になる。
     */
    state.success = params.ceiling
      ? true
      : (spec.participation ? false : ctx.rng.chance(spec.successRate));
    /** CZ を抜けて通常時へ戻るときに引き継ぐ天井カウンタ */
    state.normalGames = params.normalGames ?? 0;
    state.fromCeiling = Boolean(params.ceiling);
    /** どの入口から来たCZか(direct / stage:WARM_POOL / stage:PROVISIONED / ceiling) */
    state.route = params.route ?? (params.ceiling ? 'ceiling' : 'direct');

    // ── UI別の初期状態 ──
    state.threshold = CZ_GRAPH_THRESHOLD;
    state.graph = [18];
    // Trusted Advisor: 0=赤 1=黄 2=緑
    state.items = (spec.items ?? []).map((name) => ({ name, level: 0 }));
    state.greenNeeded = spec.greenNeeded ?? 3;
    /**
     * 盤面に焼く状態名(level 0/1/2)。spec が持たなければ Trusted Advisor の既定。
     * AWS Config のように別の状態名を持つ題材で盤面を借りるときに差し替える。
     */
    state.statusLabels = spec.statusLabels ?? null;
    /** 非突破時に点灯させる上限。最終ゲームまでは当落どちらもここで頭打ちにする */
    state.failGreen = Math.min(spec.failGreen ?? 2, state.items.length);
    /** NON_COMPLIANT のまま終わったルール名(CONFIG_RULES の非突破テロップ用) */
    state.failedRule = null;
    // Well-Architected: 立った柱の数(U10 で小役依存の参加型になった)
    // U52c: Direct Connect 冗長化CZ も同じ盤面を使う(あちらは当落先付けの一斉開通型)
    state.pillars = spec.pillars ?? [];
    state.pillarNeeded = Math.min(spec.pillarNeeded ?? state.pillars.length, state.pillars.length);
    /** 成立役 → 立つ柱の本数(data/modes.js の pillarGain。難易度はここで動く) */
    state.pillarGain = spec.pillarGain ?? { default: 1 };
    /** 非突破時に開通する上限(DX_REDUNDANCY 専用。道中の頭打ちも同じ値) */
    state.failRaised = Math.min(spec.failRaised ?? 1, Math.max(0, state.pillarNeeded - 1));
    /** 開通の工程名(DX_REDUNDANCY のテロップ用。抽選には効かない) */
    state.linkSteps = spec.linkSteps ?? [];
    /** 工程名をどこまで出したか。**ゲーム番号ではなくテロップの回数**で進める */
    state.linkStepIndex = 0;
    state.raised = 0;
    state.allPillarsRate = spec.allPillarsRate ?? 0;
    /** 6本目が金色 = DynamoDB BIG 確定。立ち切った瞬間にゲーム抽選RNGで引く */
    state.allPillars = false;

    // Step Functions CZ: ワークフローの各ステート
    state.states = (spec.states ?? []).map((s) => ({ ...s, status: 'pending' }));
    state.stateIndex = 0;
    state.failed = false;
    state.failedAt = null;
    state.cleared = false;

    // ALB CZ: リスナー → ターゲットグループ → 3台のターゲット
    state.targets = (spec.targets ?? []).map((t) => ({
      name: t.name, status: 'unhealthy', passes: 0, need: spec.healthCheckPasses ?? 2,
    }));
    state.rules = spec.listenerRules ?? ['/*'];
    state.healthy = 0;
    state.healthyNeeded = spec.healthyNeeded ?? state.targets.length;
    /** 非突破時に healthy になる上限(道中の頭打ちも同じ値) */
    state.failHealthy = Math.min(spec.failHealthy ?? 1, Math.max(0, state.targets.length - 1));
    // 開始時は healthy 0台 = 503。1台でも回復したら 200(degraded)へ変わる
    state.httpStatus = 503;
    state.degraded = false;
    state.rule = null;
    state.routedTo = null;

    // SQS デッドレター再処理CZ: 滞留メッセージのカウントダウン
    state.messages = spec.messages ?? 0;
    state.messagesTotal = state.messages;
    state.maxRedrivePerGame = spec.maxRedrivePerGame ?? 4;
    state.maxReceiveCount = spec.maxReceiveCount ?? 3;
    state.receiveCount = 1;
    state.overLimit = false;
    state.drained = false;
    state.failLeft = spec.failLeft ?? 2;

    // CodeDeploy Blue/Green CZ: トラフィックシフト
    state.shiftSteps = spec.shiftSteps ?? [];
    state.shift = 0;
    state.stepIndex = 0;
    state.errorRate = 0;
    state.errorThreshold = spec.errorThreshold ?? 5;
    state.rolledBack = false;
    state.deployed = false;
    state.failedStep = null;

    // GameDay CZ / Shield・WAF DDoS 防御CZ: 注入される障害(攻撃の波)とエラーバジェット
    // short はカードに焼く短縮名(spec が持たなければ name をそのまま使う)。
    // 盤面のカード幅は枚数で決まるので、枚数が多い spec だけが短縮名を持てばよい。
    state.faults = (spec.faults ?? []).map((f) => ({
      name: f.name, short: f.short ?? f.name, status: 'pending',
    }));
    state.budgetInit = spec.budgetInit ?? 100;
    state.budget = state.budgetInit;
    state.damageRange = spec.damageRange ?? { min: 12, max: 22 };
    /**
     * レア役で回復するエラーバジェット(%)。**GameDay(advanceFis)専用**。
     * Shield は「その波のダメージ加算をスキップする」= 被害ゼロで緩和、という
     * 別の表現を採っているので、この値を読まない(2026-08-15 検証指摘)。
     */
    state.recoverAmount = spec.recoverAmount ?? 8;
    /** 1ゲームで処理する数(GameDay は1つ / Shield は2波)。U52c */
    state.faultsPerGame = Math.max(1, Math.round(spec.faultsPerGame ?? 1));
    state.survived = 0;
    state.broken = false;

    /**
     * 非突破時に打ち切られるステップ番号(1始まり)。
     * SFN は Fail State、GameDay / Shield はバジェット枯渇、
     * Config は NON_COMPLIANT が確定するルール。突破時は使わないので抽選もしない
     * (RNGの無駄打ちを避ける = 演出を足しても出目が動かない)。
     *
     * U52c: 「どのUIか」ではなく **spec が failStepDist を持っているか** で引く。
     * 打ち切り型のCZを足すたびにここの条件式を伸ばさなくて済む
     * (既存の SFN_CZ / FIS_GAMEDAY は failStepDist を持つので挙動は同じ)。
     */
    state.failStep = !state.success && spec.failStepDist
      ? Number(ctx.rng.weighted(spec.failStepDist) ?? 1)
      : null;
    /** 非突破時に自動ロールバックが走るシフト段階(1始まり)。同上 */
    state.failShift = !state.success && state.ui === 'bluegreen'
      ? Number(ctx.rng.weighted(spec.failShiftDist ?? { 1: 1 }) ?? 1)
      : null;

    /**
     * 目標の明示(2026-08-13 ユーザー指摘「CloudWatchアラートCZ、どうなればいいのか分からない」)。
     *
     * 全CZ共通で「**何が起きれば勝ちか**」を先頭に置く。
     * state.goal は液晶・パネル・突入シナリオが共有する1つの文言(render 側もこれを使える)。
     *
     * U52c: 同じ ui を複数のCZが共有するようになったので、
     * **spec が goal / goalDetail を持っていればそちらを優先**する
     * (下の ui 別テーブルは「その ui を最初に作ったCZ」の文言として残す)。
     */
    state.goal = spec.goal ?? {
      graph: 'ALARM を発報させろ!',
      checklist: '全項目を GREEN にしろ!',
      sfn: 'ワークフローを流しきれ!',
      pillars: `${state.pillarNeeded}本の柱を立てきれ!`,
      alb: '全ターゲットを healthy にしろ!',
      dlq: 'DLQ を空にしろ!',
      bluegreen: 'Green へ 100% シフトしろ!',
      fis: '注入される障害をすべて耐えろ!',
    }[state.ui];
    state.goalDetail = spec.goalDetail ?? {
      graph: 'メトリクスを閾値まで押し上げれば突破',
      checklist: `${state.items.length}カテゴリすべてGREENで突破`,
      sfn: 'Success State まで到達すれば突破',
      // U10: 何をすれば柱が立つのかを最初に言い切る(引く手が変わる情報なので必須)
      // U27: 10G固定になったので「小役でも柱が立つ」ことを先に伝える(唯一のレア役以外契機)
      // 本数は data/modes.js の pillarGain から作る。ここに数字を書き写すと
      // 難易度調整のたびに文言が嘘になるため(2026-08-14 バランス調整)
      pillars: `小役で${state.pillarGain.default ?? 1}本、スイカ・弱チェリーは`
        + `${state.pillarGain.MELON ?? 2}本、強チェリーは${state.pillarGain.STRONG_CHERRY ?? 4}本`,
      alb: `${state.healthyNeeded}台すべて healthy で HTTP 200 が返れば突破`,
      dlq: '滞留メッセージを再処理し切れば突破',
      // 刻み幅は data/modes.js の shiftSteps から取る(等間隔 Linear。数値を二重に書かない)
      bluegreen: `1ゲームで${state.shiftSteps[0] ?? 20}%ずつ、戻されずに 100% まで移れば突破`,
      fis: 'エラーバジェットを残して5つ耐え切れば突破',
    }[state.ui];
    /**
     * 天井(Auto Recovery)経由は突破確定なので、抽選で引いた Well-Architected と
     * 見た目を分ける(S6)。同じ★★★でも「作業演出」ではなく「救済の保証」だと伝える。
     * 天井そのものの頻度は data/modes.js の NORMAL_SUBSTATES.ceiling.games 側で調整する。
     */
    if (state.fromCeiling && state.ui === 'pillars') {
      state.goal = 'Auto Recovery 保証 — 復旧確定';
      state.goalDetail = '自動復旧が走ったので、6本の柱は必ず立つ';
    }
    state.telop = `${state.goal} 期待度${state.stars} — ${state.goalDetail}`;
  },

  onGame(state, g) {
    // 実際に消化したゲーム数(Fail State で打ち切る SFN_CZ は remaining から逆算できない)
    state.played = (state.played ?? 0) + 1;

    // ゴースト揃いはどこで引いてもボーナス確定(通常時の cz_entry で bonus:1.00 なのと一貫させる)。
    // CZ中に引いた場合は残りゲーム数を待たずに即突破とする。
    if (g.flag === 'GHOST') {
      state.success = true;
      state.remaining = 0;
      // 「確定なのに盤面が未完成」を作らないため、**全UIの盤面を完成形で埋める**。
      // どのCZを引いていてもゴースト揃いなら完成の画が出る。
      state.graph.push(CZ_GRAPH_MAX);
      state.items.forEach((it) => { it.level = 2; });
      state.raised = state.pillarNeeded;
      state.states.forEach((s) => { s.status = 'succeeded'; });
      state.stateIndex = state.states.length;
      state.failed = false;
      state.failedAt = null;
      state.cleared = state.states.length > 0;
      // ALB: 全台 healthy → HTTP 200
      state.targets.forEach((t) => { t.status = 'healthy'; t.passes = t.need; });
      state.healthy = state.targets.length;
      state.httpStatus = state.targets.length > 0 ? 200 : state.httpStatus;
      state.degraded = false;
      // SQS: キューを空に
      state.messages = 0;
      state.drained = true;
      state.overLimit = false;
      // Blue/Green: 100% シフト完了
      state.shift = 100;
      state.stepIndex = state.shiftSteps.length;
      state.deployed = true;
      state.rolledBack = false;
      // GameDay: 全障害を耐え切った
      state.faults.forEach((f) => { f.status = 'survived'; });
      state.survived = state.faults.length;
      state.broken = false;
      return {
        setEnd: { result: 'CZ_RESULT', success: true, czId: state.czId },
        transition: {
          to: 'BONUS',
          params: { bonusId: drawBonusType(g.rng, state.czId) },
          // 一気に全部埋まった盤面を見せ切ってから、次のスピンで入賞待ちへ
          onNextSpin: true,
        },
        telop: 'ゴースト揃い — ボーナス確定!!',
      };
    }

    state.remaining--;
    const step = state.total - state.remaining; // 1..total
    const events = [];
    let telop = null;

    /*
     * 進行の分岐は **まず czId**、無ければ ui(U52c)。
     * 新CZ3種は盤面(ui)を既存CZと共有しているが、進行の型は別物なので、
     * 「同じ ui = 同じ進行」だと成立しない。czId で先に振り分けてから ui へ落とす。
     */
    switch (state.czId) {
      case 'CONFIG_RULES':  telop = advanceConfigRules(state, g, events, step); break;
      case 'DX_REDUNDANCY': telop = advanceDxLinks(state, g, events, step); break;
      case 'SHIELD_DDOS':   telop = advanceShieldWaves(state, g, events, step); break;
      default:
        switch (state.ui) {
          case 'checklist': telop = advanceChecklist(state, g, events); break;
          case 'sfn':       telop = advanceSfn(state, g, events, step); break;
          case 'pillars':   telop = advancePillars(state, g, events); break;
          case 'alb':       telop = advanceAlb(state, g, events); break;
          case 'dlq':       telop = advanceDlq(state, g, events); break;
          case 'bluegreen': telop = advanceBlueGreen(state, g, events, step); break;
          case 'fis':       telop = advanceFis(state, g, events, step); break;
          default:          telop = advanceGraph(state, g, step); break;
        }
        break;
    }

    if (state.remaining > 0) return { telop, events };

    // ── 最終ゲーム: 結果に合わせて着地させる ──
    // finalize は「全項目グリーン」のような着地の瞬間そのものを演出へ伝えるため、
    // events を受け取って追記する(このゲームぶんの events と一緒に emit される)。
    finalize(state, events);
    const setEnd = { result: 'CZ_RESULT', success: state.success, czId: state.czId };

    if (state.success) {
      // Well-Architected は「6本立った = 突破」なので、突破の画は必ず6本揃っている。
      // そのうえで6本目が金色(allPillars)ならゴーストボーナスSP確定(DESIGN.md 2.2 M04)
      const bonusId = state.ui === 'pillars' && state.allPillars
        ? 'DYNAMO_BIG'
        : drawBonusType(g.rng, state.czId);
      return {
        setEnd,
        // 完成の画(全緑 / 6本 / Success State)を見せ切り、次のスピンで入賞待ちへ
        transition: { to: 'BONUS', params: { bonusId }, onNextSpin: true },
        telop: successTelop(state, bonusId),
        events,
      };
    }
    return {
      setEnd,
      // 非突破の画(項目が埋まらないチェックリスト / 3本止まりの柱 / Fail State / 閾値割れ)も
      // 見せ切ってから、次のスピンで通常時へ戻す
      transition: {
        to: 'FREE_TIER',
        params: { games: state.normalGames },
        onNextSpin: true,
      },
      telop: failTelop(state),
      events,
    };
  },
};

// ── CW_ALARM: 折れ線グラフ ─────────────────────

function advanceGraph(state, g, step) {
  const goal = state.success ? 122 : 76;
  const base = 18 + (goal - 18) * (step / state.total);
  const boost = isRareRole(g.flag) ? 14 : 0;
  const noise = (g.rng.next() - 0.5) * 9;
  state.graph.push(clamp(base + boost + noise, 0, CZ_GRAPH_MAX));
  return isRareRole(g.flag) ? 'メトリクスが跳ねた!' : null;
}

// ── TRUSTED_ADVISOR: 6カテゴリのチェックリスト ─────

/**
 * Trusted Advisor の進行(2026-08-13 に2度作り替えた)。
 *
 * 1. ユーザー指示で「全項目グリーン = ボーナス確定」へ
 * 2. しおん/ユーザー指摘「6項目あるのに残りG数で終わらないのでは?」を受けて
 *    **進行の見せ方**を再設計
 *
 * 【設計】緑は結果そのものなので道中でばら撒けない(緑の数=当落が読めてしまう)。
 * そこで **道中は「チェックの進捗」を見せる**:
 *   - 毎ゲーム 1〜2項目が 未着手(赤) → 要確認(黄) へ進む
 *   - ペースは「残りゲーム数 × 2 ≧ 残り項目数」を必ず満たすように決めるので、
 *     どの時点でも「間に合わない」絵にならない(最終ゲーム前に全項目がチェック済みになる)
 *   - 早めのGREENは failGreen(2項目)まで。当落どちらも同じ上限なので途中経過から結果は読めない
 *   - 最終ゲーム(finalize)で、突破なら残り全部が一斉にGREEN = 全緑ドン
 * @returns {string|null} テロップ
 */
function advanceChecklist(state, g, events) {
  const items = state.items;
  const left = state.remaining;      // このゲーム消化後の残りG数
  // 最終ゲームの判定は finalize が一斉に行う(ここでは何もしない)
  if (left <= 0) return null;

  // ── 1. チェックの進捗(赤 → 黄)。残りゲームで全項目に手が届くペースを保証する ──
  const untouched = items.filter((it) => it.level === 0);
  const perGame = Math.min(CHECKLIST_MAX_PER_GAME, Math.ceil(untouched.length / left));
  const checked = untouched.slice(0, Math.max(0, perGame));
  for (const it of checked) it.level = 1;

  // ── 2. 早めのGREEN(failGreen まで)。ここは当落で差を付けない ──
  const greens = items.filter((it) => it.level === 2).length;
  const needMore = state.failGreen - greens;
  const promote = needMore > 0 && (needMore >= left || isRareRole(g.flag) || g.rng.chance(0.45));
  if (promote) {
    // 「要確認まで見た項目が OK になる」流れにする(赤からいきなり緑にしない)
    const next = items.find((it) => it.level === 1) ?? items.find((it) => it.level === 0);
    if (next) {
      next.level = 2;
      events.push({
        name: 'paramChange',
        payload: { param: 'checklist', value: greens + 1, delta: 1 },
      });
      return `${next.name} — GREEN!`;
    }
  }

  if (checked.length > 0) {
    const names = checked.map((it) => it.name).join('・');
    return `${names} をチェック中…(残り${left}G)`;
  }
  return null;
}

// ── SFN_CZ: ステートマシンのワークフロー ──────────

/**
 * 毎ゲーム1ステートずつワークフローを進める。
 *
 * 突破する回は全ステートが SUCCEEDED で流れ、最後(Succeed State)到達で確定。
 * 非突破の回は突入時に決めた failStep で Fail State へ落ち、その場で打ち切る
 * (= 残りゲームは消化しない)。したがって
 * **最終ステートに到達した時点で突破確定**という見せ方が成立する。
 *
 * @param {number} step このゲームで処理するステート番号(1始まり)
 */
function advanceSfn(state, g, events, step) {
  const st = state.states[step - 1];
  if (!st) return null;

  if (!state.success && step >= state.failStep) {
    st.status = 'failed';
    state.failed = true;
    state.failedAt = step - 1;
    // Fail State に落ちたらワークフローはそこで停止する
    state.remaining = 0;
    events.push({
      name: 'paramChange',
      payload: {
        param: 'sfn_state', source: 'SFN_CZ',
        value: step, total: state.total, delta: 0,
        ok: false, last: false, stateName: st.name,
      },
    });
    return `${st.name} でエラー — Fail State へ`;
  }

  st.status = 'succeeded';
  state.stateIndex = step;
  const last = step >= state.states.length;
  events.push({
    name: 'paramChange',
    payload: {
      param: 'sfn_state', source: 'SFN_CZ',
      value: step, total: state.total, delta: 1,
      ok: true, last, stateName: st.name,
    },
  });
  // 最終ステート到達の告知は successTelop(結果告知)側に任せる
  return last ? null : `${st.name} — SUCCEEDED(${step}/${state.total})`;
}

// ── WELL_ARCHITECTED: 6本の柱 ──────────────────

/**
 * Well-Architected の柱(2026-08-13 に2度、2026-08-14 の U10 で3度目の作り替え)。
 *
 * 1. しおん指摘: games:5 に対して柱は6本で、1G1本だと突破時に5本までしか立たなかった
 * 2. ユーザー実害報告「**5本しか柱が立っていないのにボーナス確定した**」
 * 3. 【U10】「ほぼ必ずボーナスになっていて緊張感がない」
 *
 * 【現在の設計 = 参加型】柱は **自分で引いた小役でしか立たない**:
 *   小役(払出のある成立役) … +1本
 *   スイカ(S3)・弱チェリー(IAM)・チャンス目 … +2本
 *   強チェリー・サメ揃い … +4本
 *   ハズレ … 0本
 * 6本揃った瞬間にその場で突破が確定し、揃わなければ失敗する。
 * 当落を先に引いていないので「必ず当選」は存在しない。
 *
 * 1ゲームの最大進行が4本(強チェリー)あるため、残り2Gで2本足りない、
 * のような場面でも逆転の目が残る = 「間に合わない絵」になりにくい。
 *
 * 例外は天井(Auto Recovery)経由だけ。こちらはハマりの救済なので突破保証で、
 * 足りないぶんは自動復旧が運んでくる(残りGで必ず立ち切るペース)。
 */
function advancePillars(state, g, events) {
  const need = state.pillarNeeded;
  let gain = pillarGainOf(state, g.flag);

  if (state.fromCeiling) {
    // 保証ぶん: このゲームを含む残りG数で必ず立ち切るペースを下限にする
    const rest = need - state.raised;
    const gamesLeft = Math.max(1, state.remaining + 1);
    gain = Math.max(gain, Math.ceil(rest / gamesLeft));
  }
  if (gain <= 0) return null;

  const before = state.raised;
  state.raised = Math.min(need, before + gain);
  const delta = state.raised - before;
  if (delta <= 0) return null;

  if (state.raised < need) {
    events.push({
      name: 'paramChange',
      payload: { param: 'pillar', value: state.raised, delta, total: need, flag: g.flag },
    });
    const name = state.pillars[state.raised - 1] ?? '柱';
    return delta > 1
      ? `${name} まで一気に ${delta}本(${state.raised}/${need})`
      : `${name} の柱が立った(${state.raised}/${need})`;
  }

  // ── 6本立ち切った = ここで突破確定(U10)──
  state.success = true;
  state.remaining = 0;
  // 6本目が金色 = DynamoDB BIG 確定。結果(ボーナス種別)を動かす抽選なので
  // 演出用RNGではなく **ゲーム抽選RNG(g.rng)** で引く
  state.allPillars = g.rng.chance(state.allPillarsRate ?? 0);
  events.push({
    name: 'paramChange',
    payload: {
      param: 'pillar_final',
      value: state.raised, delta, from: before,
      allPillars: Boolean(state.allPillars),
      total: need,
    },
  });
  // 告知は successTelop(結果告知)側に任せる
  return null;
}

/**
 * 成立役1回で立つ柱の本数(data/modes.js の pillarGain)。ハズレは0本。
 *
 * 【U22〜U24 のレア役統一の唯一の例外】(2026-08-14 ユーザー指示)
 * ゲーム全体では契機を isRareRole(data/rareroles.js)へ寄せたが、
 * ここだけは **小役(払出のある成立役)全部** が +1本のまま。
 * レア役に絞ると10Gで柱が1本も立たない回が大半になり、
 * 「引いた役の強さで柱が伸びる」参加型そのものが成立しなくなるため。
 */
function pillarGainOf(state, flag) {
  if (flag === 'LOSE') return 0;
  const table = state.pillarGain ?? {};
  // 表に無い役は default(小役ぶん)。強い役は必ず data/modes.js の pillarGain へ
  // 明示すること(ゴースト揃いが default 扱いで小役と同じ本数になっていた前例あり)
  return Math.max(0, Math.round(table[flag] ?? table.default ?? 1));
}

// ── ALB_CZ: リスナー → ターゲットグループ → 3台のターゲット ──

/**
 * ALB のヘルスチェックをそのままゲーム性にする。
 *
 * 毎ゲーム、リスナールール(/api/* など)に従ってリクエストが1台へルーティングされ、
 * ヘルスチェックが need 回通ると unhealthy → checking → healthy へ回復する。
 * 3台 × 2回 = 6回に対して games は4なので、Trusted Advisor と同じく
 * **最終ゲームで残りが一斉に healthy** になる形(finalize)にしてある。
 *
 * 道中は当落どちらも failHealthy(1台)で頭打ちなので、
 * 途中経過から結果は読めない。上限に当たった回は「応答待ち」で足踏みする
 * (= ALB の HealthyThresholdCount に届かない状態)。
 */
function advanceAlb(state, g, events) {
  const left = state.remaining;   // このゲーム消化後の残りG数
  const rule = state.rules[(state.played - 1) % Math.max(1, state.rules.length)] ?? '/*';
  state.rule = rule;
  if (left <= 0) return null;     // 最終ゲームは finalize が着地させる

  const target = state.targets.find((t) => t.status !== 'healthy');
  if (!target) return null;
  state.routedTo = target.name;

  const passes = Math.min(target.passes + 1, target.need);
  if (passes >= target.need && state.healthy < state.failHealthy) {
    target.passes = target.need;
    target.status = 'healthy';
    state.healthy++;
    // 1台でも healthy になった時点で応答は 200(ただし全台ではないので degraded)
    state.httpStatus = 200;
    state.degraded = state.healthy < state.targets.length;
    events.push({
      name: 'paramChange',
      payload: {
        param: 'alb_health',
        value: state.healthy, delta: 1,
        name: target.name, rule, total: state.healthyNeeded,
      },
    });
    return `${target.name} が healthy(HEALTHY ${state.healthy}/${state.healthyNeeded})`;
  }

  target.passes = Math.min(passes, Math.max(0, target.need - 1));
  target.status = 'checking';
  return `${rule} → ${target.name} をヘルスチェック中…(${target.passes}/${target.need})`;
}

// ── SQS_REDRIVE: DLQ のカウントダウン ──────────────

/**
 * DLQ に溜まったメッセージを毎ゲーム redrive して減らす。**残0通で突破**。
 *
 * 積み上げ型ばかりだったCZ群に対して、ここだけ **減っていく** 絵になる。
 * 道中は failLeft+1 通を下限にして当落どちらも同じ位置で最終ゲームを迎える
 * (途中経過から結果が読めない)。
 * 1ゲームの処理数は「残す下限までの通数 ÷ 残りの道中G数」を切り上げた値なので、
 * 最終ゲームの手前で必ず下限へ到達する = 「間に合わない絵」にならない。
 */
function advanceDlq(state, g, events) {
  const left = state.remaining;
  state.receiveCount = Math.min(state.maxReceiveCount, state.played);
  if (left <= 0) return null;     // 最終ゲームは finalize が着地させる

  /*
   * ── テロップに残数を書かない(2026-08-14 検証指摘 V21-03 / U8)──────────
   * 残数は液晶の盤面(render/lcd-cz-extra.js の drawCzDlq)が
   * 大きな数字 + 「再処理中… 残り N 通」の結論行として **常時** 出している。
   * ここでも「残り N 通」と書くと、同じ数字が画面に2か所並ぶ。
   * テロップの担当は「このゲームで何が起きたか」(= 何通さばけたか)だけにする。
   */
  const floor = state.failLeft + 1;
  const above = state.messages - floor;
  if (above <= 0) return '再処理を継続中…';

  let n = Math.min(state.maxRedrivePerGame, Math.ceil(above / left));
  // レア役は再処理が1通ぶん多く進む(当落は動かない。下限は割らない)
  if (isRareRole(g.flag)) n += 1;
  n = Math.min(n, above, state.maxRedrivePerGame);

  const from = state.messages;
  state.messages -= n;
  events.push({
    name: 'paramChange',
    payload: { param: 'dlq_redrive', value: state.messages, delta: -n, from },
  });
  return `${n}通を再処理した`;
}

// ── CODEDEPLOY_BG: Blue/Green のトラフィックシフト ──

/**
 * Blue(現行)から Green(新)へ段階的にトラフィックを寄せる。
 * **100% まで到達すれば DEPLOYMENT SUCCEEDED = 突破**。
 *
 * 刻みは data/modes.js の shiftSteps(等間隔 Linear 20% × 5段)。
 * CodeDeploy は段ごとに刻み幅を変えられないので、不等間隔にはしない(F2)。
 *
 * 非突破は突入時に決めた failShift でエラー率がしきい値を超え、
 * CloudWatch アラーム → **自動ロールバック**(バーが一気に0%へ戻る)。
 * SFN_CZ と同じ「その場で打ち切り」構造なので、
 * 最終段階(100%)に到達した時点で突破確定という見せ方が成立する。
 *
 * エラー率はRNGを使わず step から決める(演出を足しても出目が動かない)。
 */
function advanceBlueGreen(state, g, events, step) {
  const steps = state.shiftSteps;
  const total = steps.length;
  const pct = steps[Math.min(step, total) - 1] ?? 100;

  if (!state.success && state.failShift != null && step >= state.failShift) {
    state.errorRate = Math.round((state.errorThreshold + 1.8) * 10) / 10;
    state.stepIndex = step;
    state.failedStep = step;
    state.rolledBack = true;
    state.remaining = 0;      // デプロイはここで打ち切り
    state.shift = 0;
    events.push({
      name: 'paramChange',
      // fromRatio は 0〜1。液晶アニメ(deploy_progress)がそのまま食える形で渡す
      payload: { param: 'bg_rollback', value: 0, from: pct, fromRatio: pct / 100, step },
    });
    return `エラー率 ${state.errorRate}% がしきい値超過 — 自動ロールバック`;
  }

  state.shift = pct;
  state.stepIndex = step;
  state.errorRate = Math.round((0.4 + step * 0.6) * 10) / 10;
  const last = step >= total;
  const fromPct = step > 1 ? (steps[step - 2] ?? 0) : 0;
  events.push({
    name: 'paramChange',
    payload: {
      param: 'bg_shift', value: pct, step, total, ok: true, last,
      // ratio / fromRatio は 0〜1(deploy_progress にそのまま渡せる形)
      ratio: pct / 100, fromRatio: fromPct / 100,
    },
  });
  // 100% 到達の告知は successTelop(結果告知)側に任せる
  return last ? null : `Green へ ${pct}% シフト(${step}/${total})`;
}

// ── FIS_GAMEDAY: 障害注入に耐える ─────────────────

/**
 * 毎ゲーム障害が1つ注入され、エラーバジェットが削られる。
 * **5つすべて耐え切れば RESILIENT = 突破**。
 *
 * ダメージは damageRange を step で線形配分した固定値なので、
 * 耐え切る回は必ずバジェットを残して終わる(「耐えたのに尽きた」が起きない)。
 * 非突破は failStep でバジェットが尽き、その場で打ち切る(SFN と同じ構造)。
 * レア役の自動復旧は見せ場だけで、当落もダメージ計画も動かさない。
 */
function advanceFis(state, g, events, step) {
  const faults = state.faults;
  const total = faults.length;
  const f = faults[Math.min(step, total) - 1];
  if (!f) return null;

  if (!state.success && state.failStep != null && step >= state.failStep) {
    f.status = 'broken';
    state.broken = true;
    state.budget = 0;
    state.remaining = 0;
    events.push({
      name: 'paramChange',
      payload: {
        param: 'fis_fault',
        value: state.survived, total, budget: 0, ratio: 0,
        name: f.name, ok: false, recovered: false,
      },
    });
    return `${f.name} に耐えられず — エラーバジェット枯渇`;
  }

  const { min, max } = state.damageRange;
  const damage = total > 1
    ? Math.round(min + (max - min) * ((step - 1) / (total - 1)))
    : min;
  state.budget = Math.max(1, state.budget - damage);
  f.status = 'survived';
  state.survived = step;

  let recovered = false;
  if (isRareRole(g.flag) && state.budget < state.budgetInit) {
    state.budget = Math.min(state.budgetInit, state.budget + state.recoverAmount);
    recovered = true;
  }

  events.push({
    name: 'paramChange',
    payload: {
      param: 'fis_fault',
      value: state.survived, total, budget: state.budget,
      // ratio は残バジェットの割合(0〜1)。cw_meter_swing の to にそのまま渡せる
      ratio: state.budget / Math.max(1, state.budgetInit),
      name: f.name, ok: true, recovered,
    },
  });
  const lastFault = step >= total;
  if (lastFault) return null;   // 耐え切りの告知は successTelop 側
  return recovered
    ? `${f.name} を注入 — 自動復旧でバジェット回復(残 ${state.budget}%)`
    : `${f.name} を注入 — 耐えた(バジェット ${state.budget}%)`;
}

// ── CONFIG_RULES: AWS Config の準拠ルール(U52c)─────

/**
 * 毎ゲーム1ルールずつ評価し、自動修復が通れば COMPLIANT(GREEN)。
 *
 * 突破する回は全ルールが COMPLIANT で埋まり、最後のルールが緑になった瞬間が確定。
 * 非突破の回は突入時に決めた failStep のルールが NON_COMPLIANT のまま確定し、
 * **その場で打ち切る**(Step Functions CZ と同じ構造)。したがって
 * 「最後のルールまで到達した = 突破確定」という見せ方が成立する。
 *
 * 盤面(render/lcd.js の _drawCzChecklist)は Trusted Advisor と共有だが、
 * あちらが「最終ゲームで一斉に全緑」なのに対し、こちらは1つずつ確定していく。
 *
 * @param {number} step このゲームで評価するルール番号(1始まり)
 */
function advanceConfigRules(state, g, events, step) {
  const rule = state.items[step - 1];
  if (!rule) return null;
  const total = state.items.length;

  if (!state.success && state.failStep != null && step >= state.failStep) {
    // NON_COMPLIANT のまま確定。修復が通らなかったのでここで打ち切り
    rule.level = 0;
    state.failedRule = rule.name;
    state.remaining = 0;
    events.push({
      name: 'paramChange',
      payload: {
        param: 'config_rule', source: 'CONFIG_RULES',
        value: state.items.filter((it) => it.level === 2).length,
        total, delta: 0, ok: false, last: false, name: rule.name,
      },
    });
    return `${rule.name} が NON_COMPLIANT — 修復できません`;
  }

  rule.level = 2;
  // 次のルールは「評価中(WARN)」として先に点ける。当落の情報は含まない
  const next = state.items[step];
  if (next && next.level === 0) next.level = 1;

  const greens = state.items.filter((it) => it.level === 2).length;
  const last = step >= total;
  events.push({
    name: 'paramChange',
    payload: {
      param: 'config_rule', source: 'CONFIG_RULES',
      value: greens, total, delta: 1, ok: true, last, name: rule.name,
    },
  });
  // 全ルール COMPLIANT の告知は successTelop(結果告知)側に任せる
  return last ? null : `${rule.name} — COMPLIANT(${greens}/${total})`;
}

// ── DX_REDUNDANCY: Direct Connect の専用線(U52c)────

/**
 * 専用線の開通作業を毎ゲーム1工程ずつ進める。**4本すべて開通で突破**。
 *
 * 当落は突入時に確定済みで、道中は当落どちらも failRaised(1本)で頭打ち。
 * 最終ゲームの着地(finalize)で、突破なら残りが **一斉に開通** する。
 * = 途中経過から結果は読めず、完成の画がそのまま結果告知になる。
 *
 * 参加型の Well-Architected と盤面は同じだが、こちらは引いた役で本数が動かない
 * (レア役は「作業が早く進んだ」というテロップだけで、当落も本数も動かさない)。
 */
function advanceDxLinks(state, g, events, step) {
  const left = state.remaining;          // このゲーム消化後の残りG数
  const need = state.pillarNeeded;
  if (left <= 0) return null;            // 最終ゲームは finalize が着地させる

  /*
   * 工程名は **テロップを出した回数** で進める(2026-08-15 検証指摘)。
   * 旧実装は step-1 で引いていたため、
   *   1G目 … raised < failRaised で開通テロップに化けて工程[0]を捨てる
   *   最終G … left<=0 で早期 return するので工程[最後]が出ない
   * となり、4本のうち2本が一度も画面に出ない死にデータになっていた。
   * linkSteps は「道中に出る回数」と同数(= games-1 本)に揃えてあるので、
   * ここで順に消費すれば上から全部出る。
   */
  const steps = state.linkSteps;
  const idx = Math.min(state.linkStepIndex ?? 0, Math.max(0, steps.length - 1));
  const work = steps[idx] ?? '開通作業';
  state.linkStepIndex = idx + 1;

  if (state.raised < state.failRaised) {
    const name = state.pillars[state.raised] ?? '専用線';
    state.raised++;
    events.push({
      name: 'paramChange',
      payload: {
        param: 'dx_link', source: 'DX_REDUNDANCY',
        value: state.raised, delta: 1, total: need, name,
      },
    });
    // 開通のゲームでも工程名を落とさない(工程 → 開通、の順で1行に収める)
    return `${work} 完了 — ${name} が開通(${state.raised}/${need}本)`;
  }

  return isRareRole(g.flag)
    ? `${work} — 手配が前倒しで進んだ(残り${left}G)`
    : `${work} …(残り${left}G)`;
}

// ── SHIELD_DDOS: 波状のDDoSを緩和する(U52c)─────────

/**
 * 1ゲームに faultsPerGame 波(既定2波)の攻撃が来る。**全波を緩和しきれば突破**。
 *
 * ダメージは damageRange を波番号で線形配分した固定値(RNGを使わない)なので、
 * 耐え切る回は必ずバジェットを残して終わる。
 * 非突破は failStep の波でバジェットが尽き、その場で打ち切る(GameDay と同じ構造)。
 * レア役は「レートベースルールが効いてその波を被害ゼロで弾く」見せ場で、当落は動かさない。
 *
 * @param {number} step このゲームの番号(1始まり)。波番号は (step-1)*perGame + i
 */
function advanceShieldWaves(state, g, events, step) {
  const waves = state.faults;
  const total = waves.length;
  const per = state.faultsPerGame;
  const { min, max } = state.damageRange;
  let telop = null;

  for (let i = 0; i < per; i++) {
    const w = (step - 1) * per + i + 1;      // 波番号(1始まり)
    const f = waves[w - 1];
    if (!f) break;

    if (!state.success && state.failStep != null && w >= state.failStep) {
      f.status = 'broken';
      state.broken = true;
      state.budget = 0;
      state.remaining = 0;
      events.push({
        name: 'paramChange',
        payload: {
          param: 'shield_wave', source: 'SHIELD_DDOS',
          value: state.survived, total, budget: 0, ratio: 0,
          name: f.name, ok: false, mitigated: false,
        },
      });
      return `${f.name} を捌ききれず — エラーバジェット枯渇`;
    }

    // レア役はそのゲームの最初の波だけ被害ゼロ(レートベースルールで遮断)
    const mitigated = isRareRole(g.flag) && i === 0;
    const damage = total > 1
      ? Math.round(min + (max - min) * ((w - 1) / (total - 1)))
      : min;
    if (!mitigated) state.budget = Math.max(1, state.budget - damage);
    f.status = 'survived';
    state.survived = w;

    events.push({
      name: 'paramChange',
      payload: {
        param: 'shield_wave', source: 'SHIELD_DDOS',
        value: state.survived, total, budget: state.budget,
        // ratio は残バジェットの割合(0〜1)。cw_meter_swing の to にそのまま渡せる
        ratio: state.budget / Math.max(1, state.budgetInit),
        name: f.name, ok: true, mitigated,
      },
    });

    // 全波を緩和しきった告知は successTelop 側に任せる
    telop = w >= total
      ? null
      : mitigated
        ? `${f.name} をレートベースルールで遮断 — 被害なし`
        : `${f.name} を緩和(バジェット ${state.budget}%)`;
  }
  return telop;
}

// ── 着地処理 ──────────────────────────────────

/**
 * 最終ゲームの着地。
 * @param {object[]} [events] 着地の瞬間を演出へ伝えるイベントの追記先
 */
function finalize(state, events = []) {
  // U52c の3種は盤面(ui)を共有しているので、先に czId で振り分ける
  if (state.czId === 'CONFIG_RULES') return finalizeConfigRules(state, events);
  if (state.czId === 'DX_REDUNDANCY') return finalizeDxLinks(state, events);
  if (state.czId === 'SHIELD_DDOS') return finalizeShield(state, events);
  if (state.ui === 'graph') {
    state.graph[state.graph.length - 1] = state.success ? 128 : 68;
    return;
  }
  if (state.ui === 'checklist') {
    const greens = () => state.items.filter((x) => x.level === 2).length;
    if (state.success) {
      // 突破 = 残り全部が一斉にグリーンへ。**全緑の瞬間がボーナス確定告知**
      const before = greens();
      state.items.forEach((it) => { it.level = 2; });
      events.push({
        name: 'paramChange',
        payload: {
          param: 'checklist_all_green',
          value: state.items.length, from: before,
          delta: state.items.length - before,
        },
      });
      return;
    }
    // 非突破は failGreen(3項目未満)止まりで終了
    for (const it of state.items) {
      if (greens() >= state.failGreen) break;
      it.level = 2;
    }
    return;
  }
  if (state.ui === 'sfn') {
    if (state.success) {
      state.states.forEach((s) => { s.status = 'succeeded'; });
      state.stateIndex = state.states.length;
      state.cleared = true;
      return;
    }
    // 保険: 非突破なのに Fail State を通っていない場合は現在地で落とす
    if (!state.failed && state.states.length > 0) {
      const idx = clamp(state.stateIndex, 0, state.states.length - 1);
      state.states[idx].status = 'failed';
      state.failed = true;
      state.failedAt = idx;
    }
    return;
  }
  if (state.ui === 'pillars') {
    // 通常は advancePillars が6本目を立てた時点で突破が確定しているので、
    // ここへ success:true で来るのは天井保証の取りこぼしだけ(保険)。
    if (!state.success) return;
    const need = state.pillarNeeded;
    const before = state.raised;
    state.raised = Math.max(before, need);
    if (state.raised > before) {
      events.push({
        name: 'paramChange',
        payload: {
          param: 'pillar_final',
          value: state.raised, delta: state.raised - before, from: before,
          /** 6本目が金色に光る = ゴーストボーナスSP 確定 */
          allPillars: Boolean(state.allPillars),
          total: need,
        },
      });
    }
    return;
  }
  if (state.ui === 'alb') {
    const before = state.healthy;
    if (state.success) {
      // 突破 = 残りが一斉に healthy へ。**全台 healthy の瞬間がボーナス確定告知**
      state.targets.forEach((t) => { t.status = 'healthy'; t.passes = t.need; });
      state.healthy = state.targets.length;
      state.httpStatus = 200;
      state.degraded = false;
      events.push({
        name: 'paramChange',
        payload: {
          param: 'alb_all_healthy',
          value: state.healthy, from: before,
          delta: state.healthy - before, total: state.healthyNeeded,
        },
      });
      return;
    }
    // 非突破は failHealthy 台止まり。残りは unhealthy のまま
    for (const t of state.targets) {
      if (state.healthy >= state.failHealthy) break;
      if (t.status === 'healthy') continue;
      t.status = 'healthy';
      t.passes = t.need;
      state.healthy++;
    }
    state.targets.forEach((t) => { if (t.status !== 'healthy') t.status = 'unhealthy'; });
    /**
     * 【2026-08-14 しおん指摘 minor-e / AWSの事実に合わせる】
     * ALB が 503(Service Temporarily Unavailable)を返すのは
     * **ターゲットグループに healthy が1台も無い**ときだけ。
     * 1台でも healthy が残っていれば ALB はそこへルーティングするので
     * 応答は 200 で、状態としては「一部ターゲット障害 = degraded」。
     * 旧実装は unhealthy が1台でも残ると 503 にしていて、
     * 非突破の既定値(3台中1台 healthy)でも 503 と表示していた = 事実に反する。
     */
    state.degraded = state.healthy > 0;
    state.httpStatus = state.degraded ? 200 : 503;
    return;
  }
  if (state.ui === 'dlq') {
    const from = state.messages;
    if (state.success) {
      // 突破 = 残りを捌き切って QUEUE EMPTY(この瞬間が確定告知)
      state.messages = 0;
      state.drained = true;
      state.overLimit = false;
      events.push({
        name: 'paramChange',
        payload: { param: 'dlq_drained', value: 0, from },
      });
      return;
    }
    // 非突破は maxReceiveCount 超過で failLeft 通が DLQ へ戻される
    state.messages = Math.max(state.failLeft, from - 1);
    state.receiveCount = state.maxReceiveCount;
    state.overLimit = true;
    return;
  }
  if (state.ui === 'bluegreen') {
    if (state.success) {
      state.shift = 100;
      state.stepIndex = state.shiftSteps.length;
      state.deployed = true;
      state.rolledBack = false;
      return;
    }
    // 保険: 非突破なのにロールバックを通っていない場合はここで戻す
    if (!state.rolledBack) {
      const from = state.shift;
      state.shift = 0;
      state.rolledBack = true;
      state.failedStep = state.stepIndex;
      state.errorRate = Math.round((state.errorThreshold + 1.8) * 10) / 10;
      events.push({
        name: 'paramChange',
        payload: { param: 'bg_rollback', value: 0, from, step: state.stepIndex },
      });
    }
    return;
  }
  if (state.ui === 'fis') {
    if (state.success) {
      state.faults.forEach((f) => { if (f.status === 'pending') f.status = 'survived'; });
      state.survived = state.faults.length;
      events.push({
        name: 'paramChange',
        payload: {
          param: 'fis_resilient',
          value: state.survived, budget: state.budget, total: state.faults.length,
          ratio: state.budget / Math.max(1, state.budgetInit),
        },
      });
      return;
    }
    // 保険: 非突破なのに折れていない場合は現在地で尽きさせる
    if (!state.broken && state.faults.length > 0) {
      const idx = clamp(state.survived, 0, state.faults.length - 1);
      state.faults[idx].status = 'broken';
      state.broken = true;
      state.budget = 0;
    }
  }
}

/**
 * AWS Config 準拠ルールCZ の着地(U52c)。
 * 打ち切り型なので、非突破側は advanceConfigRules が既に着地させている
 * (落ちたルールが NON_COMPLIANT のまま remaining=0)。ここは保険と突破の告知だけ。
 */
function finalizeConfigRules(state, events) {
  if (!state.success) {
    // 保険: 非突破なのに落ちたルールが無い場合は、まだ緑でないルールを1つ赤で確定させる
    if (!state.failedRule) {
      const rest = state.items.find((it) => it.level !== 2);
      if (rest) {
        rest.level = 0;
        state.failedRule = rest.name;
      }
    }
    // 評価が始まっていない(WARN)ルールは NON_COMPLIANT のまま残す
    for (const it of state.items) if (it.level === 1) it.level = 0;
    return;
  }
  const before = state.items.filter((it) => it.level === 2).length;
  state.items.forEach((it) => { it.level = 2; });
  events.push({
    name: 'paramChange',
    payload: {
      param: 'config_all_compliant', source: 'CONFIG_RULES',
      value: state.items.length, from: before, delta: state.items.length - before,
    },
  });
}

/**
 * Direct Connect 冗長化CZ の着地(U52c)。
 * 突破 = 残りの専用線が **一斉に開通**(この瞬間が確定告知)。
 * 非突破は failRaised 本止まりで、冗長構成は完成しない。
 */
function finalizeDxLinks(state, events) {
  const need = state.pillarNeeded;
  const before = state.raised;
  if (state.success) {
    state.raised = need;
    events.push({
      name: 'paramChange',
      payload: {
        param: 'dx_all_links', source: 'DX_REDUNDANCY',
        value: state.raised, from: before, delta: state.raised - before, total: need,
      },
    });
    return;
  }
  state.raised = Math.min(before, state.failRaised);
}

/**
 * Shield / WAF DDoS 防御CZ の着地(U52c)。
 * 突破 = 全波を緩和しきった(RESILIENT)。非突破は advanceShieldWaves が着地済み。
 */
function finalizeShield(state, events) {
  if (state.success) {
    state.faults.forEach((f) => { if (f.status === 'pending') f.status = 'survived'; });
    state.survived = state.faults.length;
    events.push({
      name: 'paramChange',
      payload: {
        param: 'shield_mitigated', source: 'SHIELD_DDOS',
        value: state.survived, budget: state.budget, total: state.faults.length,
        ratio: state.budget / Math.max(1, state.budgetInit),
      },
    });
    return;
  }
  // 保険: 非突破なのに折れていない場合は現在地で尽きさせる
  if (!state.broken && state.faults.length > 0) {
    const idx = clamp(state.survived, 0, state.faults.length - 1);
    state.faults[idx].status = 'broken';
    state.broken = true;
    state.budget = 0;
  }
}

function successTelop(state, bonusId) {
  // U52c の3種は盤面(ui)を共有しているので czId で先に見る
  if (state.czId === 'CONFIG_RULES') return '全ルール COMPLIANT — ボーナス確定!!';
  if (state.czId === 'DX_REDUNDANCY') {
    return `専用線 ${state.pillarNeeded}本すべて開通 — ボーナス確定!!`;
  }
  if (state.czId === 'SHIELD_DDOS') return '全波を緩和しきった — ボーナス確定!!';
  if (state.ui === 'checklist') return '全項目GREEN — ボーナス確定!!';
  if (state.ui === 'sfn') return 'Success State 到達 — ボーナス確定!!';
  if (state.ui === 'alb') return '全ターゲット healthy — HTTP 200 / ボーナス確定!!';
  if (state.ui === 'dlq') return 'DLQ を空にした — ボーナス確定!!';
  if (state.ui === 'bluegreen') return 'Green へ 100% シフト完了 — ボーナス確定!!';
  if (state.ui === 'fis') return '全障害を耐え切った RESILIENT — ボーナス確定!!';
  if (state.ui === 'pillars') {
    return bonusId === 'DYNAMO_BIG'
      ? `${state.pillarNeeded}本の柱すべて — ゴーストボーナスSP 確定!!`
      : `${state.pillarNeeded}本の柱すべて — ボーナス確定!!`;
  }
  return 'ALARM 状態へ遷移 — 突破!!';
}

function failTelop(state) {
  // U52c の3種は盤面(ui)を共有しているので czId で先に見る
  if (state.czId === 'CONFIG_RULES') {
    return `${state.failedRule ?? 'ルール'} が NON_COMPLIANT のまま… 修復に失敗`;
  }
  if (state.czId === 'DX_REDUNDANCY') {
    return `開通は ${state.raised} / ${state.pillarNeeded}本止まり… 冗長構成は未完成`;
  }
  if (state.czId === 'SHIELD_DDOS') {
    return `${state.survived} / ${state.faults.length}波でエラーバジェットが尽きた…`;
  }
  if (state.ui === 'checklist') return '推奨事項が残っています…';
  if (state.ui === 'sfn') {
    const name = state.states[state.failedAt ?? 0]?.name ?? 'Task';
    return `${name} が失敗 — 実行は Fail State で終了…`;
  }
  /**
   * ALB の非突破(2026-08-14 しおん指摘 minor-e)。
   * healthy が1台でも残っていれば ALB は 200 を返す(= 503 と書くのは事実に反する)。
   * 全滅したときだけ 503 Service Temporarily Unavailable。
   */
  if (state.ui === 'alb') {
    const dead = Math.max(0, state.targets.length - state.healthy);
    return state.healthy > 0
      ? `unhealthy が ${dead}台残った… 一部ターゲット障害(200 / degraded)`
      : '全ターゲットが unhealthy… 503 Service Temporarily Unavailable';
  }
  if (state.ui === 'dlq') return 'maxReceiveCount 超過 — DLQ へ戻されました…';
  if (state.ui === 'bluegreen') return 'エラー率が閾値超過 — 自動ロールバック…';
  if (state.ui === 'fis') return 'エラーバジェットが尽きた… SLO 違反';
  /**
   * CW_ALARM の非突破(2026-08-13 ユーザー指摘「OK が2回出る」)。
   *
   * 「OK」は液晶のテキスト帯(cz_result_step_lose の 'BACK TO OK')が1回だけ出す。
   * ここは同じ語を繰り返さない文言にして、画面上の「OK」を1回に保つ。
   * ※ 旧: '…OK に戻っちゃいました' + ステップアップ演出(OK→INSUFFICIENT_DATA→OK)で
   *    画面に OK が3回出ていた。
   */
  // U10: 何本届かなかったのかを出す(次に引きたい役が分かる負け方にする)
  if (state.ui === 'pillars') return `柱は ${state.raised} / ${state.pillarNeeded} 本止まり…`;
  return 'アラームが戻った — 通常へ復帰';
}
