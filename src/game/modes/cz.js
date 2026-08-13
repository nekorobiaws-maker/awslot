/**
 * M02〜M04. CZ層。DESIGN.md 2.2 / 3.6
 *
 *   CW_ALARM         3G / 突破率30% … 折れ線グラフが閾値を超えれば突破(★☆☆)
 *   TRUSTED_ADVISOR  5G / 突破率50% … 6カテゴリを順にチェック。**全緑でボーナス確定**(★★☆)
 *   SFN_CZ           5G / 突破率55% … ステートマシンが Success State まで流れきれば確定(★★☆)
 *   WELL_ARCHITECTED 5G / 突破率85% … 6本の柱をジョージが運ぶ。全立で DynamoDB BIG 確定(★★★)
 *
 * DESIGN.md 4.2 の原則どおり、突破可否は突入時に確定させ、
 * グラフ/チェックリスト/ワークフロー/柱はその結果へ向かって動く
 * (= 演出は結果を先に知っている)。
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
 */

import { drawBonusType } from '../lottery.js';
import { CZ_SPEC_BY_ID, czStars } from '../../data/modes.js';
import { isRare } from '../../data/flags.js';

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
    state.total = spec.games;
    state.remaining = spec.games;
    state.success = params.ceiling ? true : ctx.rng.chance(spec.successRate);
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
    /** 非突破時に点灯させる上限。最終ゲームまでは当落どちらもここで頭打ちにする */
    state.failGreen = Math.min(spec.failGreen ?? 2, state.items.length);
    // Well-Architected: 立った柱の数
    state.pillars = spec.pillars ?? [];
    state.raised = 0;
    state.allPillars = state.ui === 'pillars'
      ? state.success && ctx.rng.chance(spec.allPillarsRate ?? 0)
      : false;

    // Step Functions CZ: ワークフローの各ステート
    state.states = (spec.states ?? []).map((s) => ({ ...s, status: 'pending' }));
    state.stateIndex = 0;
    state.failed = false;
    state.failedAt = null;
    state.cleared = false;
    /**
     * 非突破時に Fail State へ落ちるステート番号(1始まり)。
     * 突破時は使わないので抽選もしない(RNGの無駄打ちを避ける)。
     */
    state.failStep = state.ui === 'sfn' && !state.success
      ? Number(ctx.rng.weighted(spec.failStepDist ?? { 1: 1 }) ?? 1)
      : null;

    /**
     * 目標の明示(2026-08-13 ユーザー指摘「CloudWatchアラートCZ、どうなればいいのか分からない」)。
     *
     * 全CZ共通で「**何が起きれば勝ちか**」を先頭に置く。
     * state.goal は液晶・パネル・突入シナリオが共有する1つの文言(render 側もこれを使える)。
     */
    state.goal = {
      graph: 'ALARM を発報させろ!',
      checklist: '全項目を GREEN にしろ!',
      sfn: 'ワークフローを流しきれ!',
      pillars: `${state.pillars.length}本の柱を立てきれ!`,
    }[state.ui];
    state.goalDetail = {
      graph: 'メトリクスを閾値まで押し上げれば突破',
      checklist: `${state.items.length}カテゴリすべてGREENで突破`,
      sfn: 'Success State まで到達すれば突破',
      pillars: '柱がすべて立てば突破',
    }[state.ui];
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
      state.graph.push(CZ_GRAPH_MAX);
      state.items.forEach((it) => { it.level = 2; });
      state.raised = state.pillars.length;
      state.states.forEach((s) => { s.status = 'succeeded'; });
      state.stateIndex = state.states.length;
      state.failed = false;
      state.failedAt = null;
      state.cleared = state.states.length > 0;
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

    switch (state.ui) {
      case 'checklist': telop = advanceChecklist(state, g, events); break;
      case 'sfn':       telop = advanceSfn(state, g, events, step); break;
      case 'pillars':   telop = advancePillars(state, g, events); break;
      default:          telop = advanceGraph(state, g, step); break;
    }

    if (state.remaining > 0) return { telop, events };

    // ── 最終ゲーム: 結果に合わせて着地させる ──
    // finalize は「全項目グリーン」のような着地の瞬間そのものを演出へ伝えるため、
    // events を受け取って追記する(このゲームぶんの events と一緒に emit される)。
    finalize(state, events);
    const setEnd = { result: 'CZ_RESULT', success: state.success, czId: state.czId };

    if (state.success) {
      // Well-Architected は突破すれば必ず6本立つ。
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
  const boost = isRare(g.flag) ? 14 : 0;
  const noise = (g.rng.next() - 0.5) * 9;
  state.graph.push(clamp(base + boost + noise, 0, CZ_GRAPH_MAX));
  return isRare(g.flag) ? 'メトリクスが跳ねた!' : null;
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
  const promote = needMore > 0 && (needMore >= left || isRare(g.flag) || g.rng.chance(0.45));
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
 * Well-Architected の柱(2026-08-13 に2度作り替えた)。
 *
 * 1. しおん指摘: games:5 に対して柱は6本で、1G1本だと突破時に5本までしか立たず
 *    最後は数合わせで6本目が生えていた
 * 2. ユーザー実害報告「**5本しか柱が立っていないのにボーナス確定した**」
 *
 * 【設計】**突破 = 6本すべて立つ**に統一した(Trusted Advisor の全緑と同じ保証)。
 *   道中(1〜4G目) … 突破は4本まで / 非突破は3本まで(6本には絶対に届かない)
 *   最終ゲーム     … 突破ならジョージが残り2本を担いできて 6/6 で立ち切る
 * 「残りゲーム × 1ゲームの最大進行(2本)≧ 残り本数」が常に成り立つので、
 * 途中で「間に合わない」絵にならない。
 * DynamoDB BIG 確定(旧: 全立特典)は allPillars で6本目が金色に光る形へ移した。
 * games / 突破率 / 振り分けは据え置き。
 */
function advancePillars(state, g, events) {
  const total = state.pillars.length;
  // 最終ゲームの一斉立ちぶんを残す(突破は total-2 本 = 4本まで、非突破は3本まで)
  const cap = state.success ? total - 2 : Math.min(3, total - 3);
  if (state.raised >= cap) return null;

  const left = state.remaining;
  const needMore = cap - state.raised;
  if (needMore < left && !isRare(g.flag) && !g.rng.chance(0.55)) return null;

  state.raised++;
  events.push({
    name: 'paramChange',
    payload: { param: 'pillar', value: state.raised, delta: 1 },
  });
  return `${state.pillars[state.raised - 1]} の柱が立った(${state.raised}/${total})`;
}

// ── 着地処理 ──────────────────────────────────

/**
 * 最終ゲームの着地。
 * @param {object[]} [events] 着地の瞬間を演出へ伝えるイベントの追記先
 */
function finalize(state, events = []) {
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
  if (state.ui === 'pillars' && state.success) {
    // 突破は必ず6本立ち切る(5本のまま確定、を根絶)。
    // allPillars は「6本目が金色 = DynamoDB BIG 確定」の意味に変わった。
    const total = state.pillars.length;
    const before = state.raised;
    state.raised = Math.max(before, total);
    if (state.raised > before) {
      events.push({
        name: 'paramChange',
        payload: {
          param: 'pillar_final',
          value: state.raised, delta: state.raised - before, from: before,
          /** 6本目が金色に光る = ゴーストボーナスSP 確定 */
          allPillars: Boolean(state.allPillars),
          total,
        },
      });
    }
  }
}

function successTelop(state, bonusId) {
  if (state.ui === 'checklist') return '全項目GREEN — ボーナス確定!!';
  if (state.ui === 'sfn') return 'Success State 到達 — ボーナス確定!!';
  if (state.ui === 'pillars') {
    return bonusId === 'DYNAMO_BIG'
      ? `${state.pillars.length}本の柱すべて — ゴーストボーナスSP 確定!!`
      : `${state.pillars.length}本の柱すべて — ボーナス確定!!`;
  }
  return 'ALARM 状態へ遷移 — 突破!!';
}

function failTelop(state) {
  if (state.ui === 'checklist') return '推奨事項が残っています…';
  if (state.ui === 'sfn') {
    const name = state.states[state.failedAt ?? 0]?.name ?? 'Task';
    return `${name} が失敗 — 実行は Fail State で終了…`;
  }
  /**
   * CW_ALARM の非突破(2026-08-13 ユーザー指摘「OK が2回出る」)。
   *
   * 「OK」は液晶のテキスト帯(cz_result_step_lose の 'BACK TO OK')が1回だけ出す。
   * ここは同じ語を繰り返さない文言にして、画面上の「OK」を1回に保つ。
   * ※ 旧: '…OK に戻っちゃいました' + ステップアップ演出(OK→INSUFFICIENT_DATA→OK)で
   *    画面に OK が3回出ていた。
   */
  if (state.ui === 'pillars') return '柱が足りませんでした…';
  return 'アラームが戻った — 通常へ復帰';
}
