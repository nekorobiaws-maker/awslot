/**
 * M01. Free Tier(通常時)。DESIGN.md 2.2 / 3.4 / 3.5
 *
 * Phase 5 で以下を実装:
 *  - 内部状態3段階(Cold Start / Warm Pool / Provisioned Concurrency)
 *    CZ抽選確率が ×1.0 / ×2.0 / ×4.0 に変動し、ステージ背景で示唆される
 *  - 天井999G「SLA 99.9% 保証」で CZ(Well-Architected)当選確定
 *  - CZ 3種すべてへの振り分け(3.6)
 *
 * 内部状態は「CZ抽選 → 昇格抽選 → 転落抽選」の順で処理する。
 * (同じゲームで昇格した状態が即その回の抽選に効くと、体感より当たりすぎるため)
 *
 * Phase 6 で前兆システムを追加(data/zencho.js):
 *  - 当選しても即突入せず、当選内容を保持したまま 2〜5G の本前兆を挟む
 *  - 非当選時も 1/40 で 2〜4G のガセ前兆が走り、最後に何も起きずに終わる
 *  - 前兆中も当選抽選は毎ゲーム引き続ける。ガセ前兆中の当選は本前兆へ格上げし、
 *    本前兆中の再当選は上位のもの(BONUS > AT > CZ)だけ採用する
 *    = 保持中の当選より価値が下がることはない(同格以下はランク吸収)
 *
 * 保持中の当選を消さないための扱い(2026-08-13 修正):
 *  - 天井到達 … BONUS / AT を保持していれば天井CZより上位なのでそちらへ送る。
 *               CZ 保持は「突破確定の天井CZ(Well-Architected)」が上位互換なので吸収する。
 *  - エンディング … forceMode でスタックごと畳まれると告知前の当選が無告知で消えるため、
 *               flow.js が takePendingWin() で退避し、エンディング終了後の FREE_TIER へ
 *               params.carryWin で返す。戻った側は最短の本前兆を組み直して告知する。
 *
 * 前兆の進行状態(本前兆かガセか)は state に置かない。
 * state は EventBus の payload と director のスナップショット(main.js の getContext)へ
 * そのまま渡るので、state.zenchoPending があると演出データ側から
 *   match: { 'modeState.zenchoPending.kind': ['BONUS'] }
 * の1行で本前兆が確定で読めてしまう。モジュール内の WeakMap に隔離する。
 */

import {
  drawCzEntry, drawCzType, drawDirectBonus,
  drawSubStateUpgrade, drawSubStateDowngrade,
} from '../lottery.js';
import { NORMAL_SUBSTATES } from '../../data/modes.js';
import { ZENCHO, ZENCHO_PATTERN_BY_ID, ZENCHO_WIN_RANK, DEEPRACER } from '../../data/zencho.js';
import { isRare, FLAG_BY_ID } from '../../data/flags.js';

const SUBSTATE_BY_ID = Object.fromEntries(NORMAL_SUBSTATES.states.map((s) => [s.id, s]));

/**
 * 前兆の進行状態。ファイル冒頭のとおり state には持たせない。
 *   z       … 前兆そのもの(総G/残G/経過ステップ/強度/演出パターン)
 *   pending … 保持中の当選(ガセ前兆なら null)
 * @type {WeakMap<object, {z: object|null, pending: object|null}>}
 */
const ZENCHO_STATE = new WeakMap();

/** エンディングから当選を引き継いだときに組み直す本前兆の長さ(G) */
const CARRY_ZENCHO_GAMES = 2;

/** state に対応する前兆状態を取り出す(無ければ空で作る) */
function zenchoOf(state) {
  let zs = ZENCHO_STATE.get(state);
  if (!zs) {
    zs = { z: null, pending: null };
    ZENCHO_STATE.set(state, zs);
  }
  return zs;
}

/**
 * 検証・デバッグ用の読み出し口。
 * 演出データ(data/scenarios/)は import を書けないのでここへは到達できない。
 * @returns {{zencho: object|null, pending: object|null}}
 */
export function inspectZencho(state) {
  const zs = ZENCHO_STATE.get(state);
  return { zencho: zs?.z ?? null, pending: zs?.pending ?? null };
}

export const freeTier = {
  id: 'FREE_TIER',
  name: '通常ステージ',
  type: 'NORMAL',

  onEnter(state, params = {}) {
    const sub = SUBSTATE_BY_ID[params.subState] ?? SUBSTATE_BY_ID.COLD_START;
    state.games = params.reset ? 0 : (params.games ?? 0);
    state.subState = sub.id;
    state.subStateName = sub.name;
    state.czMultiplier = sub.czMultiplier;
    state.stage = sub.stage;
    state.ceiling = NORMAL_SUBSTATES.ceiling.games;
    state.telop = params.telop ?? 'オースロット';
    // 前兆の進行状態は WeakMap 側に持つ(state に置くと演出から本前兆が読めるため)。
    // 演出へ渡してよい情報は paramChange の payload に限る。
    //
    // エンディングへ退避されていた当選を引き継いだ場合は、告知の尺として
    // 最短の本前兆を組み直してから渡す(退避した当選は必ずここで戻ってくる)。
    // 抽選は挟まないので、引き継ぎの有無でゲーム抽選RNGの消費数は変わらない。
    ZENCHO_STATE.set(state, params.carryWin
      ? {
        z: {
          total: CARRY_ZENCHO_GAMES,
          left: CARRY_ZENCHO_GAMES,
          step: 0,
          strength: 3,
          pattern: 'reinvent',
        },
        pending: params.carryWin,
      }
      : { z: null, pending: null });
    // 前兆が走っているかだけを演出へ公開する(本前兆・ガセの区別は載せない。setZenchoActive 参照)
    state.zenchoActive = Boolean(params.carryWin);
  },

  /**
   * 前兆で保持している当選を取り出し、前兆を畳む(エンディングへの退避用)。
   * 取り出した側は必ず遷移先へ引き継ぐこと。捨てると当選が無告知で消える。
   * @returns {object|null} 保持していた当選(無ければ null)
   */
  takePendingWin(state) {
    const zs = ZENCHO_STATE.get(state);
    if (!zs?.pending) return null;
    const win = zs.pending;
    clearZencho(zs, state);
    return win;
  },

  onGame(state, g) {
    state.games++;
    const zs = zenchoOf(state);

    // ── 天井(SLA 99.9% 保証)────────────────
    if (state.games >= state.ceiling) {
      const events = [{ name: 'paramChange', payload: { param: 'ceiling', value: state.games, delta: 0 } }];
      // 保持中の当選が天井CZより上位(BONUS / AT 直撃)なら、天井より当選を優先する。
      // 天井で上書きすると czId から引き直しになり、AT直撃はボーナス経由へ格下げされて
      // 当選そのものが消えることがある。天井カウンタは遷移先から戻ったときに 0 から数え直す。
      const pending = zs.pending;
      if (pending && (pending.kind === 'BONUS' || pending.kind === 'AT')) {
        events.push(zenchoEndEvent(zs, 'ENTRY', pending.kind));
        clearZencho(zs, state);
        return { ...transitionFor(pending, state), events };
      }
      // 前兆中に天井へ到達したら、前兆は「突入」で畳んでから天井CZへ送る。
      // 天井CZ(Well-Architected)は突破確定なので、保持していたCZ当選は上位互換で吸収される。
      if (zs.z) events.push(zenchoEndEvent(zs, 'ENTRY', 'CZ'));
      clearZencho(zs, state);
      state.winRoute = 'ceiling';
      return {
        transition: {
          to: 'CZ',
          params: { czId: 'WELL_ARCHITECTED', normalGames: state.games, ceiling: true, route: 'ceiling' },
          // 天井到達の告知も通常画面のまま見せ、次のスピンでCZへ入る
          onNextSpin: true,
        },
        events,
        // SLA→Auto Recovery 改名の取り残し修正(2026-08-13 ユーザー指摘)。
        // 「サービスクレジット」はSLA未達時の返金補償で、自動復旧のご褒美文言としては意味が通らなかった。
        telop: `${NORMAL_SUBSTATES.ceiling.name} 発動 — 自動復旧します`,
      };
    }

    const events = [];

    // ── CZ / ボーナス / AT直撃 ─────────────────
    // 前兆中も止めない。止めると「前兆中のゲームだけ抽選されない」ことになり、
    // 前兆を挟んだぶんだけ初当り確率が落ちてしまう。
    const res = drawCzEntry(g.rng, g.flag, state.czMultiplier);
    let win = null;
    if (res.bonus) win = { kind: 'BONUS', bonusId: drawDirectBonus(g.rng, g.flag) };
    else if (res.directAt) win = { kind: 'AT' };
    else if (res.cz) win = { kind: 'CZ', czId: drawCzType(g.rng) };
    /** 当選の入口(検証用。直接 / 高確 / 激アツ / 天井) */
    if (win) state.winRoute = state.subState === 'COLD_START' ? 'direct' : `stage:${state.subState}`;

    /**
     * ステージ滞在中の毎ゲーム抽選(2026-08-13 ユーザー指示)。
     *
     * 「高確/激アツに入ってからCZ」を主ルートにするための本体。
     * レア役契機(上の drawCzEntry)は約1/25でしか回ってこないので、
     * ステージ自体が毎ゲーム抽選を持つことで
     * 「上がったのに何も起きずに転落」を減らし、
     * 激アツは数ゲーム以内にほぼ勝負が決まるようにしている。
     */
    if (!win) {
      const stageRate = NORMAL_SUBSTATES.czPerGame?.[state.subState] ?? 0;
      if (stageRate > 0 && g.rng.chance(stageRate)) {
        const bonusShare = NORMAL_SUBSTATES.bonusShareOfStageDraw?.[state.subState] ?? 0;
        win = bonusShare > 0 && g.rng.chance(bonusShare)
          ? { kind: 'BONUS', bonusId: drawDirectBonus(g.rng, g.flag) }
          : { kind: 'CZ', czId: drawCzType(g.rng) };
        state.winRoute = `stage:${state.subState}`;
      }
    }

    // DeepRacer 擬似連の最中にレア役を引いたらボーナス確定(2026-08-13 ユーザー仕様)。
    // 「小役」ではなくレア役に限定している理由は data/zencho.js の DEEPRACER 参照。
    if (DEEPRACER.rareUpgradesToBonus && zs.z?.racer && isRare(g.flag)) {
      win = { kind: 'BONUS', bonusId: drawDirectBonus(g.rng, g.flag) };
    }

    // 格上げの理由。演出は「1ゲームに1本」しか流せないので、
    // ここでは理由だけ決めておき、前兆の消化まで進めてからイベントを1本に絞る。
    let upgradeReason = null;
    if (win) {
      if (!zs.z) {
        // 通常の当選 → 本前兆スタート
        startZencho(zs, g.rng, 'real', win, state);
      } else if (zs.z.racer) {
        // 擬似連は自分の step 数で完結するので前兆の尺は伸ばさない。当選だけ格上げする
        upgradeReason = upgradePending(zs, win) ? 'RANKUP' : 'ABSORB';
      } else if (!zs.pending) {
        // ガセ前兆中に当選 → 本前兆へ格上げ(ここで当選を捨てない)
        promoteZencho(zs, g.rng, win);
        upgradeReason = 'PROMOTE';
      } else {
        // 本前兆中の再当選 → 上位のものだけ採用(実機と同じ格上げ処理)。
        // 同格以下は保持中の当選に吸収される(= 引いた当選は破棄されるが価値は下がらない)。
        const better = ZENCHO_WIN_RANK[win.kind] > ZENCHO_WIN_RANK[zs.pending.kind];
        if (better) zs.pending = win;
        upgradeReason = better ? 'RANKUP' : 'ABSORB';
      }
    } else if (!zs.z && g.rng.chanceDenom(ZENCHO.fake.denom)) {
      // ── ガセ前兆の発生 ───────────────────────
      startZencho(zs, g.rng, 'fake', null, state);
    }

    // ── 前兆の消化(1ゲームぶん)──────────────
    let zenchoTelop = null;
    if (zs.z) {
      const z = zs.z;
      z.step++;
      z.left--;

      // DeepRacer 擬似連。step3のCZ移行・step4のボーナス確定はここで確定し、
      // 移行が決まった場合は z.left を 0 にして下の告知ブロックへ落とす。
      const racerTelop = z.racer ? advanceRacer(zs, g, events) : null;

      if (z.left > 0) {
        // 擬似連は自前の deepracer イベントで進行を語るので、汎用の前兆イベントは出さない
        // (1ゲームに2本流すと後勝ちで先のテロップが消える)。
        if (!z.racer) {
          // 格上げが起きたゲームは step 演出を出さない。
          events.push(upgradeReason ? zenchoUpgradeEvent(zs, upgradeReason) : zenchoStepEvent(zs));
        }
        zenchoTelop = racerTelop ?? ZENCHO_PATTERN_BY_ID[z.pattern]?.telop ?? null;
      } else if (zs.pending) {
        // 最終G(本前兆)= 告知して突入。格上げ演出は結果告知に譲る
        const pending = zs.pending;
        events.push(zenchoEndEvent(zs, 'ENTRY', pending.kind));
        clearZencho(zs, state);
        return { ...transitionFor(pending, state), events };
      } else {
        // 最終G(ガセ)= 何も起きずに終わる
        events.push(zenchoEndEvent(zs, 'MISS', null));
        clearZencho(zs, state);
        zenchoTelop = racerTelop ? `${racerTelop} — 惜しくも終了…` : ZENCHO.telops.miss;
      }
    }

    // ── 内部状態の昇格 / 転落(3.4)──────────────
    let telop = null;

    const up = isRare(g.flag) ? drawSubStateUpgrade(g.rng, g.flag, state.subState) : null;
    if (up) {
      applySubState(state, up);
      telop = up === 'PROVISIONED'
        ? 'Invent会場へ移動 — 激アツ!!'
        : 'サミット会場へ移動 — 高確';
      events.push({
        name: 'paramChange',
        payload: { param: 'substate', value: state.subState, delta: 1 },
      });
    } else {
      const down = drawSubStateDowngrade(g.rng, state.subState);
      if (down) {
        applySubState(state, down);
        events.push({
          name: 'paramChange',
          payload: { param: 'substate', value: state.subState, delta: -1 },
        });
      }
    }

    // 昇格テロップ > 前兆テロップ > レア役テロップ の優先順
    if (!telop) telop = zenchoTelop;
    if (!telop && isRare(g.flag)) {
      telop = `${FLAG_BY_ID[g.flag]?.name ?? g.flag} — 次に期待`;
    }
    return { telop, events };
  },
};

function applySubState(state, id) {
  const sub = SUBSTATE_BY_ID[id];
  if (!sub) return;
  state.subState = sub.id;
  state.subStateName = sub.name;
  state.czMultiplier = sub.czMultiplier;
  state.stage = sub.stage;
}

// ── 前兆 ──────────────────────────────────────

/**
 * 重み付き抽選。ゲーム抽選RNGの消費数を必ず1回に固定する。
 *
 * Rng#weighted は候補が空だと next() を消費せずに null を返すため、
 * 演出パターンの weight を将来 0 にした瞬間に以降のRNG列が丸ごとズレて、
 * 同じシードでも別の展開になる(= デバッグ再現性が壊れる)。
 * 前兆はゲーム側の抽選と同じ列を使うので、ここは消費数固定で実装する。
 * @param {Record<string, number>} table
 * @param {string} fallback 候補が空のときに返す値
 */
function drawWeightedFixed(rng, table, fallback) {
  const r = rng.next();
  const entries = Object.entries(table).filter(([, w]) => w > 0);
  if (entries.length === 0) return fallback;
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let acc = r * total;
  for (const [k, w] of entries) {
    acc -= w;
    if (acc < 0) return k;
  }
  return entries[entries.length - 1][0];
}

/** 数値キーの重み配分を引いて数値で返す */
function drawNumber(rng, dist) {
  return Number(drawWeightedFixed(rng, dist, Object.keys(dist)[0]));
}

/**
 * 演出パターンを引く。強度で候補を絞ってから本/ガセ別の重みで抽選する。
 * @param {'real'|'fake'} kind
 */
function drawPattern(rng, strength, kind) {
  const table = {};
  for (const p of ZENCHO.patterns) {
    if (p.minStrength > strength) continue;
    const w = p.weight[kind] ?? 0;
    if (w > 0) table[p.id] = w;
  }
  return drawWeightedFixed(rng, table, ZENCHO.patterns[0].id);
}

/**
 * 前兆を開始する。当選ゲームを1G目として数える。
 * @param {{z:object|null, pending:object|null}} zs 前兆状態
 * @param {'real'|'fake'} kind
 * @param {object|null} pending 保持する当選(ガセなら null)
 */
function startZencho(zs, rng, kind, pending, state = null) {
  const spec = kind === 'real' ? ZENCHO.real : ZENCHO.fake;
  const total = drawNumber(rng, spec.gamesDist);
  const strength = drawNumber(rng, spec.strengthDist);
  const pattern = drawPattern(rng, strength, kind);
  /**
   * DeepRacer は擬似連(DEEPRACER)。到達step を先に決め、
   * 前兆の長さを **その step 数** に合わせる(1つの時計で回すため)。
   * step3 のCZ移行・step4 のボーナス確定は advanceRacer が担当する。
   */
  const racer = pattern === 'deepracer'
    ? { target: drawNumber(rng, DEEPRACER.targetDist), cars: 0 }
    : null;
  // 本前兆(当選を保持している)なら最低2step。
  // 1stepだと「車が1回走って即突入」になり、前兆としての溜めが消えるうえ、
  // 天井や他の当選と重なったときの吸収処理が働く前に遷移してしまう。
  if (racer && pending) racer.target = Math.max(2, racer.target);
  zs.z = {
    total: racer ? racer.target : total,
    left: racer ? racer.target : total,
    step: 0,
    strength,
    pattern,
    racer,
  };
  zs.pending = pending ?? null;
  // 演出向けの公開フラグ(本前兆・ガセの区別は載せない。後述 setZenchoActive)
  setZenchoActive(state, true);
}

/**
 * ガセ前兆を本前兆へ格上げする。
 * 総ゲーム数は「ここまで見せたぶん + 残り」で組み直すので、
 * プレイヤーから見た経過ステップは巻き戻らない。
 */
function promoteZencho(zs, rng, win) {
  const z = zs.z;
  zs.pending = win;
  z.strength = Math.max(z.strength, drawNumber(rng, ZENCHO.real.strengthDist));
  z.pattern = drawPattern(rng, z.strength, 'real');
  z.left = Math.max(z.left, ZENCHO.upgrade.minLeft);
  z.total = z.step + z.left;
}

/**
 * DeepRacer 擬似連の1step(2026-08-13 ユーザー仕様)。
 *
 * 呼ばれるのは前兆の消化(z.step++ / z.left-- の直後)。
 * 擬似連自身が当選を生むのはここだけ:
 *   step3 … czRateAtStep3 で CZ を付与し、その場で擬似連を終える(= 移行)
 *   step4 … ボーナスを付与(到達=確定)
 * どちらも upgradePending 経由なので、既に保持している当選より下がることはない。
 *
 * @returns {string|null} テロップ
 */
function advanceRacer(zs, g, events) {
  const z = zs.z;
  const r = z.racer;
  r.cars = DEEPRACER.carsByStep[z.step] ?? r.cars;

  // step3: CZ移行抽選(外れたら終了 or step4 へ)
  if (z.step === DEEPRACER.czStep && g.rng.chance(DEEPRACER.czRateAtStep3)) {
    upgradePending(zs, { kind: 'CZ', czId: drawCzType(g.rng) });
    z.left = 0;
  }
  // step4: 大量の車 = ボーナス確定
  if (z.step >= DEEPRACER.bonusStep) {
    upgradePending(zs, { kind: 'BONUS', bonusId: drawDirectBonus(g.rng, g.flag) });
    z.left = 0;
  }

  const isFinal = z.left <= 0;
  const result = isFinal
    ? (zs.pending ? (zs.pending.kind === 'CZ' ? 'cz' : 'bonus') : 'miss')
    : null;
  // 演出契約(演出担当と共有): これだけで車走行・大量走行・結果告知を紐付けられる
  events.push({
    name: 'paramChange',
    payload: { param: 'deepracer', step: z.step, cars: r.cars, result },
  });
  return DEEPRACER.telops[z.step] ?? null;
}

/**
 * 保持中の当選を、より上位のものにだけ差し替える。
 * 擬似連が生む当選(CZ / BONUS)も必ずここを通すので、
 * 「前兆で保持していた当選が擬似連のせいで格下げされる」ことは起きない。
 * @returns {boolean} 差し替えたか
 */
function upgradePending(zs, win) {
  const cur = zs.pending;
  if (cur && ZENCHO_WIN_RANK[win.kind] <= ZENCHO_WIN_RANK[cur.kind]) return false;
  zs.pending = win;
  return true;
}

function clearZencho(zs, state = null) {
  zs.z = null;
  zs.pending = null;
  setZenchoActive(state, false);
}

/**
 * 前兆が走っているかの公開フラグ(2026-08-13 演出整合のため追加)。
 *
 * 「検出なし」「異常なし」のような**否定的な結末を持つ弱予告**が前兆中に出ると、
 * その直後の当選告知と矛盾する。シナリオ側が
 *   match: { 'modeState.zenchoActive': [false] }
 * で自分を抑制できるようにするための1ビット。
 *
 * 【重要】本前兆とガセ前兆を区別しない。区別できる情報を state に載せると
 * 「このフラグ = 本物」と読めてしまい、前兆の秘匿性(pending を WeakMap に隠している意味)が壊れる。
 * ガセ前兆中も等しく true になるので、抑制はかかっても本物はバレない。
 */
function setZenchoActive(state, active) {
  if (state) state.zenchoActive = Boolean(active);
}

/**
 * 前兆1ゲームぶんの通知。
 * left は演出ロジック用(最終G煽りの判定)であって、画面へ出してはいけない。
 * total は「本前兆最長5G / ガセ最長4G」をそのまま示す値なので payload に載せない
 * (載せると `match: { total: [5] }` の1行で本前兆が確定してしまう)。
 */
function zenchoStepEvent(zs) {
  const z = zs.z;
  return {
    name: 'paramChange',
    payload: {
      param: 'zencho',
      value: z.strength,
      delta: z.left,
      strength: z.strength,
      pattern: z.pattern,
      step: z.step,
      // 液晶のステップアップ用に 1〜3 へ丸めた段階値
      level: Math.min(3, z.step),
      left: z.left,
    },
  };
}

/**
 * 前兆中の当選(格上げ)。発生した時点で本前兆が確定する。
 * reason で演出の強さを出し分ける:
 *   PROMOTE … ガセ前兆が本前兆へ昇格(実質的な格上げ)
 *   RANKUP  … 保持中の当選より上位を引き当てた(本物の格上げ)
 *   ABSORB  … 同格以下だったので保持中の当選に吸収(格は上がっていない)
 */
function zenchoUpgradeEvent(zs, reason) {
  const z = zs.z;
  return {
    name: 'paramChange',
    payload: {
      param: 'zencho_upgrade',
      value: z.strength,
      delta: z.left,
      strength: z.strength,
      pattern: z.pattern,
      step: z.step,
      reason,
    },
  };
}

/** 前兆最終Gの結果告知 */
function zenchoEndEvent(zs, result, to) {
  const z = zs.z ?? {};
  return {
    name: 'paramChange',
    payload: {
      param: 'zencho_end',
      value: result,
      delta: 0,
      to: to ?? null,
      strength: z.strength ?? 0,
      pattern: z.pattern ?? null,
      step: z.step ?? 0,
      total: z.total ?? 0,
    },
  };
}

/**
 * 保持していた当選を実際の遷移へ変換する。
 *
 * すべて `onNextSpin: true` を付ける(2026-08-13 ユーザー指摘)。
 * 当選告知(デプロイ成功・クイズ正解・前兆の結果)は **通常ステージの画面のまま**
 * 出し切って、そのゲームはそこで終わる。CZ/ボーナスへ入るのは
 * **次にレバーを引いた瞬間**で、そのスピンが新モードの1ゲーム目になる。
 * 告知の裏で背景だけ先に切り替わる、という不自然さをここで断つ。
 */
function transitionFor(pending, state) {
  if (pending.kind === 'BONUS') {
    return {
      transition: { to: 'BONUS', params: { bonusId: pending.bonusId }, onNextSpin: true },
      telop: ZENCHO.telops.bonus,
    };
  }
  if (pending.kind === 'AT') {
    return {
      transition: { to: 'AS_RUSH', params: { dc: 2 }, onNextSpin: true },
      telop: ZENCHO.telops.at,
    };
  }
  return {
    transition: {
      to: 'CZ',
      params: { czId: pending.czId, normalGames: state.games, route: state.winRoute ?? 'direct' },
      onNextSpin: true,
    },
    telop: ZENCHO.telops.cz,
  };
}
