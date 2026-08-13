/**
 * M11〜M17. 派生ゾーン / 上乗せ特化ゾーン。DESIGN.md 2.2 / 3.9 / 3.10
 *
 * これらはすべて「親モード(AT)の上に積まれる」モードで、
 * 終了時は transition:{pop:true} で親へ自動復帰する(DESIGN.md 6.3 モードスタック)。
 *
 * 2種類ある:
 *   滞在型  (SPOT_ZONE / EC2_BURST / GRAVITON / RESERVED)
 *       … そのゾーン自身の純増で出玉が増える
 *   上乗せ型(CLOUDFRONT / KINESIS / STEP_FUNCTIONS)
 *       … 母体ATのセット数を積む。純増は母体AT準拠(3.10 の RESERVED と同じ考え方)
 *
 * 上乗せは親の state.stock に積み、親のセット末に1セットずつ消費される。
 */

import {
  ZONE_SPEC_BY_ID, AS_RUSH_CORE, UPPER_AT_SPEC_BY_ID,
} from '../../data/modes.js';
import { isRare } from '../../data/flags.js';
import { residualLine } from '../../data/session.js';
import {
  drawNestedZone, drawScaleOut, drawReservedContract,
  drawKinesisShards, drawKinesisAddCoin, drawCloudFrontAddCoin,
} from '../lottery.js';

/**
 * 母体ATの1ゲームあたり純増。
 * 「純増は母体のRUSHに準じる」(DESIGN.md 3.10 RESERVED)をゾーン共通の規則として使う。
 */
export function hostPayout(host) {
  if (!host) return 1.0;
  if (host.id === 'AS_RUSH') return AS_RUSH_CORE.payoutPerGame[host.state.dc] ?? 1.0;
  return UPPER_AT_SPEC_BY_ID[host.id]?.payoutPerGame ?? 1.0;
}

/** 母体ATへセット数を上乗せする。@returns 実際に積んだセット数 */
export function addSetToHost(host, n) {
  if (!host || !(n > 0)) return 0;
  host.state.stock = (host.state.stock ?? 0) + n;
  return n;
}

/**
 * 母体ATの DC(純増ブースト)を1段上げる。
 * スコアアタック化(2026-08-13)で Step Functions の報酬をセット上乗せから
 * 純増ブーストへ変えたときに追加した。
 * @returns {number} 実際に上がった段数(上限に張り付いていれば0)
 */
export function boostHostDc(host, n = 1) {
  if (!host || host.id !== 'AS_RUSH') return 0;
  const max = AS_RUSH_CORE.dcRange.max;
  const before = host.state.dc ?? 1;
  host.state.dc = Math.min(max, before + n);
  return host.state.dc - before;
}

/**
 * 母体ATの1セットぶんの価値(枚)。買い取り(data/session.js)で使う。
 */
function hostSetValue(host) {
  if (!host) return 0;
  const per = hostPayout(host);
  const games = host.id === 'AS_RUSH'
    ? AS_RUSH_CORE.setGames
    : (UPPER_AT_SPEC_BY_ID[host.id]?.setGames ?? AS_RUSH_CORE.setGames);
  return games * per;
}

/** 滞在型ゾーン中の上乗せ特化ゾーン当選(DESIGN.md 6.3 の3段スタック) */
function nestedZone(state, g) {
  if (!isRare(g.flag)) return null;
  const zone = drawNestedZone(g.rng, g.flag);
  if (!zone) return null;
  return { push: zone, params: {} };
}

// ── M11. Spot インスタンスゾーン ─────────────────

export const spotZone = {
  id: 'SPOT_ZONE',
  name: 'SPOT インスタンスゾーン',
  type: 'ZONE',

  onEnter(state) {
    const spec = ZONE_SPEC_BY_ID.SPOT_ZONE;
    state.spec = spec.id;
    state.short = spec.short;
    state.payoutPerGame = spec.payoutPerGame;
    state.games = 0;
    state.gained = 0;
    state.notice = false;      // 中断通知(interruption notice)が出たか
    state.endAt = null;        // 強制終了するゲーム数
    state.minGames = spec.minGames;
    state.telop = 'SPOT 起動 — 純増8枚。ただし、いつ止まるか分からない';
  },

  onGame(state, g) {
    const spec = ZONE_SPEC_BY_ID.SPOT_ZONE;
    state.games++;
    const pay = state.payoutPerGame;
    state.gained += pay;
    const events = [];
    let telop = null;

    // 中断通知は1回だけ。最低15G保証があるので、早く出ても15Gまでは終わらない
    if (!state.notice && g.rng.chanceDenom(spec.interruptDenom)) {
      state.notice = true;
      state.endAt = Math.max(spec.minGames, state.games + spec.graceGames);
      telop = '⚠ 中断通知 — ジョージが来た';
      events.push({
        name: 'paramChange',
        payload: { param: 'spot_notice', value: state.endAt - state.games, delta: 0 },
      });
    }

    if (state.notice && state.games >= state.endAt) {
      return {
        payoutPerGame: pay,
        events,
        setEnd: { result: 'ZONE_END', zone: 'SPOT_ZONE', continued: false, gained: state.gained },
        transition: { pop: true },
        telop: `インスタンス回収 — ${state.games}G で ${Math.floor(state.gained)}枚`,
      };
    }

    const nest = nestedZone(state, g);
    if (nest) {
      return { payoutPerGame: pay, events, transition: nest, telop: '上乗せ特化ゾーン当選!' };
    }
    return { payoutPerGame: pay, events, telop };
  },

  /**
   * 買い取りは「保証されている残ゲーム数」だけ。
   * 中断通知が出ていれば猶予ゲームまで、出ていなければ最低保証ゲームまで。
   * 通知が出るまで無限に続く可能性は所有価値ではないので買わない。
   */
  residualValue(state) {
    const left = state.notice
      ? Math.max(0, state.endAt - state.games)
      : Math.max(0, state.minGames - state.games);
    if (!(left > 0)) return [];
    return [residualLine('SPOT 保証残り', left, state.payoutPerGame)];
  },
};

// ── M12. EC2 バーストモード ───────────────────────

export const ec2Burst = {
  id: 'EC2_BURST',
  name: 'EC2 バーストモード',
  type: 'ZONE',

  onEnter(state) {
    const spec = ZONE_SPEC_BY_ID.EC2_BURST;
    state.short = spec.short;
    state.payoutPerGame = spec.payoutPerGame;
    state.credit = spec.creditInit;
    state.creditMax = spec.creditMax;
    state.games = 0;
    state.gained = 0;
    state.telop = 'CPU クレジット 100 — 使い切るまで純増5枚';
  },

  onGame(state, g) {
    const spec = ZONE_SPEC_BY_ID.EC2_BURST;
    state.games++;
    const pay = state.payoutPerGame;
    state.gained += pay;
    const events = [];
    let telop = null;

    state.credit += spec.creditPerGame;

    const recover = spec.creditRecover[g.flag];
    if (recover) {
      state.credit = Math.min(state.creditMax, state.credit + recover);
      telop = `クレジット +${recover} 回復!`;
      events.push({
        name: 'paramChange',
        payload: { param: 'burst_credit', value: state.credit, delta: recover },
      });
    }

    if (state.credit <= 0) {
      state.credit = 0;
      return {
        payoutPerGame: pay,
        events,
        setEnd: { result: 'ZONE_END', zone: 'EC2_BURST', continued: false, gained: state.gained },
        transition: { pop: true },
        telop: `クレジット枯渇 — ${state.games}G で ${Math.floor(state.gained)}枚`,
      };
    }

    const nest = nestedZone(state, g);
    if (nest) {
      return { payoutPerGame: pay, events, transition: nest, telop: '上乗せ特化ゾーン当選!' };
    }
    return { payoutPerGame: pay, events, telop };
  },

  /** 残クレジットで回せるゲーム数ぶんを買い取る(レア役での回復ぶんは買わない) */
  residualValue(state) {
    const spec = ZONE_SPEC_BY_ID.EC2_BURST;
    const perGameCost = Math.abs(spec.creditPerGame) || 1;
    const left = Math.floor(Math.max(0, state.credit) / perGameCost);
    if (!(left > 0)) return [];
    return [residualLine('EC2 BURST 残クレジット', left, state.payoutPerGame)];
  },
};

// ── M13. Graviton モード ─────────────────────────

export const graviton = {
  id: 'GRAVITON',
  name: 'GRAVITON モード',
  type: 'ZONE',

  onEnter(state) {
    const spec = ZONE_SPEC_BY_ID.GRAVITON;
    state.short = spec.short;
    state.payoutPerGame = spec.payoutPerGame;
    state.total = spec.setGames;
    state.remaining = spec.setGames;
    state.setCount = 1;
    state.gained = 0;
    state.telop = 'ARM は静かに強い — 継続率90%';
  },

  onGame(state, g) {
    const spec = ZONE_SPEC_BY_ID.GRAVITON;
    state.remaining--;
    const pay = state.payoutPerGame;
    state.gained += pay;

    if (state.remaining > 0) {
      const nest = nestedZone(state, g);
      if (nest) return { payoutPerGame: pay, transition: nest, telop: '上乗せ特化ゾーン当選!' };
      return { payoutPerGame: pay };
    }

    if (g.rng.chance(spec.continueRate)) {
      state.setCount++;
      state.remaining = state.total;
      return {
        payoutPerGame: pay,
        setEnd: { result: 'CONTINUE', zone: 'GRAVITON', continued: true, healthLabel: 'EFFICIENT' },
        telop: `省電力継続 — SET ${state.setCount}`,
      };
    }
    return {
      payoutPerGame: pay,
      setEnd: { result: 'ZONE_END', zone: 'GRAVITON', continued: false, gained: state.gained },
      transition: { pop: true },
      telop: `Graviton 終了 — ${Math.floor(state.gained)}枚`,
    };
  },

  residualValue(state) {
    if (!(state.remaining > 0)) return [];
    return [residualLine('GRAVITON 残り', state.remaining, state.payoutPerGame)];
  },
};

// ── M14. Reserved Instance ゾーン ─────────────────

export const reserved = {
  id: 'RESERVED',
  name: 'RESERVED INSTANCE',
  type: 'ZONE',

  onEnter(state, params = {}, ctx) {
    const spec = ZONE_SPEC_BY_ID.RESERVED;
    const contract = params.contract ?? drawReservedContract(ctx.rng);
    state.short = spec.short;
    state.contract = contract;
    state.contractLabel = contract === '3year' ? '3年契約' : '1年契約';
    state.total = spec.guaranteeGames[contract];
    state.remaining = state.total;
    state.gained = 0;
    state.telop = `${state.contractLabel} — ${state.total}G はヘルスチェック免除`;
  },

  onGame(state, g) {
    state.remaining--;
    const host = g.atHost;
    const events = [];
    let telop = null;

    // 契約中もスケールアウトは有効(母体がAS_RUSHのときだけDCが増える)
    if (host?.id === 'AS_RUSH') {
      const up = drawScaleOut(g.rng, g.flag, host.state.dc);
      const max = AS_RUSH_CORE.dcRange.max;
      if (up > 0 && host.state.dc < max) {
        const before = host.state.dc;
        host.state.dc = Math.min(max, before + up);
        const delta = host.state.dc - before;
        telop = delta >= 2
          ? `DOUBLE SCALE OUT!!! DC ${host.state.dc} 台`
          : `SCALE OUT!! DC ${host.state.dc} 台`;
        events.push({ name: 'paramChange', payload: { param: 'dc', value: host.state.dc, delta } });
      }
    }

    const pay = hostPayout(host);
    state.gained += pay;
    state.hostPayout = pay;

    if (state.remaining > 0) return { payoutPerGame: pay, events, telop };

    return {
      payoutPerGame: pay,
      events,
      setEnd: { result: 'ZONE_END', zone: 'RESERVED', continued: false, gained: state.gained },
      transition: { pop: true },
      telop: '契約期間満了 — RUSH へ復帰',
    };
  },

  /** 契約期間は「ヘルスチェック免除で必ず回る」ので全額買い取り対象 */
  residualValue(state, ctx) {
    if (!(state.remaining > 0)) return [];
    return [residualLine(
      `RESERVED ${state.contractLabel} 残り`, state.remaining, hostPayout(ctx?.host),
    )];
  },
};

// ── M15. CloudFront エッジ上乗せ ──────────────────

export const cloudFront = {
  id: 'CLOUDFRONT',
  name: 'CLOUDFRONT エッジ上乗せ',
  type: 'ZONE',

  onEnter(state) {
    const spec = ZONE_SPEC_BY_ID.CLOUDFRONT;
    state.short = spec.short;
    state.total = spec.games;
    state.remaining = spec.games;
    /** 上乗せた枚数の合計(スコアアタック化でセット → 枚数へ変更) */
    state.addedCoins = 0;
    state.gained = 0;
    state.lastEdge = null;
    state.lastAdd = 0;
    state.telop = '世界中のエッジからコインが飛んでくる';
  },

  onGame(state, g) {
    const spec = ZONE_SPEC_BY_ID.CLOUDFRONT;
    state.remaining--;
    const host = g.atHost;
    const events = [];

    const coins = drawCloudFrontAddCoin(g.rng);
    state.lastAdd = coins;
    state.lastEdge = spec.edges[(spec.games - state.remaining - 1) % spec.edges.length];
    let telop = `${state.lastEdge} — Cache MISS`;
    if (coins > 0) {
      state.addedCoins += coins;
      telop = `${state.lastEdge} Cache HIT — +${coins}枚!!`;
      events.push({
        name: 'paramChange',
        payload: {
          param: 'add_coin', value: state.addedCoins, delta: coins,
          source: 'CLOUDFRONT', edge: state.lastEdge,
        },
      });
    }

    // 母体ATの純増ぶんに、そのゲームで当たった上乗せ枚数を上乗せして払い出す
    const pay = hostPayout(host);
    state.gained += pay + coins;

    if (state.remaining > 0) return { payoutPerGame: pay + coins, events, telop };

    return {
      payoutPerGame: pay + coins,
      events,
      setEnd: { result: 'ZONE_END', zone: 'CLOUDFRONT', continued: false, addedCoins: state.addedCoins },
      transition: { pop: true },
      telop: `配信完了 — 合計 +${state.addedCoins}枚`,
    };
  },

  residualValue(state, ctx) {
    const per = hostPayout(ctx?.host);
    if (!(state.remaining > 0)) return [];
    return [residualLine('CLOUDFRONT 残り', state.remaining, per)];
  },
};

// ── M16. Kinesis 上乗せストリーム ─────────────────

export const kinesis = {
  id: 'KINESIS',
  name: 'KINESIS 上乗せストリーム',
  type: 'ZONE',

  onEnter(state, params = {}, ctx) {
    state.short = ZONE_SPEC_BY_ID.KINESIS.short;
    state.shards = params.shards ?? drawKinesisShards(ctx.rng);
    state.total = state.shards;
    state.remaining = state.shards;
    /** 上乗せた枚数の合計(スコアアタック化でセット → 枚数へ変更) */
    state.addedCoins = 0;
    /** 最上位レコードで付いた母体ATへのセット上乗せ */
    state.addedSets = 0;
    state.gained = 0;
    /** 流れたレコード(液晶で下から積み上げる) */
    state.records = [];
    state.telop = `シャード数 ${state.shards} — レコードが流れてくる`;
  },

  onGame(state, g) {
    const spec = ZONE_SPEC_BY_ID.KINESIS;
    state.remaining--;
    const host = g.atHost;
    const events = [];

    const coins = drawKinesisAddCoin(g.rng);
    state.addedCoins += coins;
    state.records.push(coins);
    const shardNo = state.total - state.remaining;
    events.push({
      name: 'paramChange',
      payload: {
        param: 'add_coin', value: state.addedCoins, delta: coins,
        source: 'KINESIS', shard: shardNo,
      },
    });

    // 最上位レコードだけは母体ATへ +1セットも付く(ストック機構を生かす激アツ枠)
    let telop = `SHARD ${shardNo} — +${coins}枚`;
    if (coins >= spec.stockAtCoin) {
      const added = addSetToHost(host, 1);
      state.addedSets += added;
      if (added > 0) {
        telop = `SHARD ${shardNo} — +${coins}枚 & +1 SET!!`;
        events.push({
          name: 'paramChange',
          payload: { param: 'add_set', value: state.addedSets, delta: added, source: 'KINESIS', shard: shardNo },
        });
      }
    }

    const pay = hostPayout(host);
    state.gained += pay + coins;

    if (state.remaining > 0) return { payoutPerGame: pay + coins, events, telop };

    return {
      payoutPerGame: pay + coins,
      events,
      setEnd: {
        result: 'ZONE_END', zone: 'KINESIS', continued: false,
        addedCoins: state.addedCoins, addedSets: state.addedSets,
      },
      transition: { pop: true },
      telop: `ストリーム終了 — 合計 +${state.addedCoins}枚`,
    };
  },

  residualValue(state, ctx) {
    const per = hostPayout(ctx?.host);
    if (!(state.remaining > 0)) return [];
    return [residualLine('KINESIS 残りシャード', state.remaining, per)];
  },
};

// ── M17. Step Functions チャレンジ ────────────────

export const stepFunctions = {
  id: 'STEP_FUNCTIONS',
  name: 'STEP FUNCTIONS チャレンジ',
  type: 'ZONE',

  onEnter(state) {
    const spec = ZONE_SPEC_BY_ID.STEP_FUNCTIONS;
    state.short = spec.short;
    state.total = spec.maxStates;
    state.stateIndex = 0;
    /** タスク成功で母体ATへ入れた DC の合計(純増ブースト) */
    state.dcGained = 0;
    /** 母体がDCを持たない場合に代替で付いた枚数 */
    state.addedCoins = 0;
    state.gained = 0;
    state.failed = false;
    state.lastChoice = null;
    state.lastResult = null;
    /** プレイヤーの分岐選択待ち(左=A / 右=D)。flow.js が受け付ける */
    state.awaitChoice = true;
    state.choicePair = spec.choices[0];
    state.pendingChoice = null;
    state.telop = 'A / D で次のステートを選べ';
  },

  /**
   * プレイヤーの分岐選択。GameFlow から呼ばれる。
   * @param {number} index 0=左(A) / 1=右(D)
   */
  onChoice(state, index) {
    if (!state.awaitChoice) return false;
    state.pendingChoice = index === 1 ? 1 : 0;
    state.awaitChoice = false;
    state.lastChoice = state.choicePair[state.pendingChoice];
    state.telop = `${state.lastChoice} State を選択 — レバーON`;
    return true;
  },

  onGame(state, g) {
    const spec = ZONE_SPEC_BY_ID.STEP_FUNCTIONS;
    const host = g.atHost;
    const events = [];

    // 未選択のままレバーONされた場合は左(A)を既定として進める
    const pick = state.pendingChoice ?? 0;
    state.lastChoice = state.choicePair[pick];
    state.pendingChoice = null;
    state.awaitChoice = false;

    const pay = hostPayout(host);
    state.gained += pay;

    if (g.rng.chance(spec.taskSuccessRate)) {
      state.stateIndex++;
      state.lastResult = 'SUCCEEDED';

      // 報酬は「純増ブースト(DC+1)」。母体がDCを持たない上位ATなら枚数で代替する
      const dcUp = boostHostDc(host, spec.dcPerTask);
      let bonusCoins = 0;
      let rewardLabel;
      if (dcUp > 0) {
        state.dcGained += dcUp;
        rewardLabel = `DC +${dcUp}(${host.state.dc}台)`;
        events.push({
          name: 'paramChange',
          payload: { param: 'dc', value: host.state.dc, delta: dcUp, source: 'STEP_FUNCTIONS' },
        });
      } else {
        bonusCoins = spec.coinPerTaskWhenNoDc;
        state.addedCoins += bonusCoins;
        rewardLabel = `+${bonusCoins}枚`;
        events.push({
          name: 'paramChange',
          payload: { param: 'add_coin', value: state.addedCoins, delta: bonusCoins, source: 'STEP_FUNCTIONS' },
        });
      }
      state.gained += bonusCoins;

      if (state.stateIndex >= spec.maxStates) {
        // Success State 到達 = 全制覇 → 最上位ATへ
        return {
          payoutPerGame: pay + bonusCoins,
          events,
          setEnd: {
            result: 'SFN_CLEAR', zone: 'STEP_FUNCTIONS', continued: true,
            dcGained: state.dcGained, addedCoins: state.addedCoins,
          },
          transition: {
            popThenTo: spec.onAllClear,
            params: { stock: (host?.state?.stock ?? 0), from: 'STEP_FUNCTIONS' },
          },
          telop: 'Success State 到達 — MULTI-REGION 突入!!',
        };
      }

      // 次の Choice State を提示する
      state.awaitChoice = true;
      state.choicePair = spec.choices[state.stateIndex % spec.choices.length];
      return {
        payoutPerGame: pay + bonusCoins,
        events,
        telop: `${state.lastChoice} Task 成功 — ${rewardLabel}(${state.stateIndex}/${spec.maxStates})`,
      };
    }

    state.failed = true;
    state.lastResult = 'FAILED';
    return {
      payoutPerGame: pay,
      events,
      setEnd: {
        result: 'ZONE_END', zone: 'STEP_FUNCTIONS', continued: false,
        dcGained: state.dcGained, addedCoins: state.addedCoins,
      },
      transition: { pop: true },
      telop: `Fail State に落ちた — DC +${state.dcGained} 獲得`,
    };
  },

  // 分岐チャレンジ自体に残存価値はない(報酬はDC=母体ATの純増へ既に反映済み)
  residualValue() { return []; },
};
