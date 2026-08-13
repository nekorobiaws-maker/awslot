/**
 * M08. Auto Scaling RUSH(本機の母体AT)。DESIGN.md 2.2 / 3.8 / 3.9
 *
 * DC(Desired Capacity, 1〜8)が純増と継続率の両方を決める。
 * レア役でスケールアウト(DC+1)、セット終了時のヘルスチェックに失敗すると
 * DC-1 の縮退運転、DCが尽きると引き戻し層(ホットスタンバイ)へ。
 *
 * Phase 5 で追加:
 *  - 派生ゾーン当選(3.9)。当選したゾーンは「上に積む」(モードスタック)
 *  - Serverless RUSH 昇格(サメ揃い契機 / 5セット連続継続)
 *  - 上乗せストック(stock)の消費。上乗せがある間はヘルスチェックを飛ばして継続
 */

import {
  drawScaleOut, drawDerivedZone, drawServerlessUpgrade, bellBoostOf,
} from '../lottery.js';
import { AS_RUSH_CORE, SERVERLESS_UPGRADE } from '../../data/modes.js';
import { isRare } from '../../data/flags.js';
import { residualLine } from '../../data/session.js';

const { min: DC_MIN, max: DC_MAX } = AS_RUSH_CORE.dcRange;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const asRush = {
  id: 'AS_RUSH',
  name: 'AUTO SCALING RUSH',
  type: 'AT',

  onEnter(state, params = {}) {
    state.dc = clamp(params.dc ?? 1, DC_MIN, DC_MAX);
    state.total = AS_RUSH_CORE.setGames;
    state.remaining = AS_RUSH_CORE.setGames;
    state.setCount = 1;
    state.streak = 0;
    state.gained = 0;
    /** 派生ゾーンから積まれた上乗せセット数 */
    state.stock = params.stock ?? 0;
    state.lastSetResult = null;
    /** スケールアウトで増やした台数の合計(成長カーブの可視化用) */
    state.scaleOutCount = 0;
    /** 高DC帯のベル強化で上乗せた枚数の合計 */
    state.bellBoostTotal = 0;
    /** DC上限に到達したか(到達告知を1回だけ出すため) */
    state.reachedMax = state.dc >= DC_MAX;
    state.telop = `Desired Capacity = ${state.dc}`;
  },

  onGame(state, g) {
    state.remaining--;
    let telop = null;
    const events = [];

    // ── スケールアウト抽選 ───────────────────────
    // 本機の主役。ベル・リプレイでも起きるので約5ゲームに1回は台数が動く。
    // DCが高いほど渋くなる(lottery.drawScaleOut が係数を掛ける)。
    const up = drawScaleOut(g.rng, g.flag, state.dc);
    if (up > 0) {
      if (state.dc < DC_MAX) {
        const before = state.dc;
        state.dc = clamp(state.dc + up, DC_MIN, DC_MAX);
        const delta = state.dc - before;
        state.scaleOutCount += delta;
        telop = delta >= 2
          ? `DOUBLE SCALE OUT!!! DC ${state.dc} 台`
          : `SCALE OUT!! DC ${state.dc} 台`;
        // 演出システムへの通知(DESIGN.md 4.2 の paramChange)
        events.push({ name: 'paramChange', payload: { param: 'dc', value: state.dc, delta } });
        // DC上限への到達は「狙える夢」の達成。初回だけ専用イベントを出す
        if (state.dc >= DC_MAX && !state.reachedMax) {
          state.reachedMax = true;
          telop = `DESIRED CAPACITY MAX — ${DC_MAX}台 全開!!`;
          events.push({
            name: 'paramChange',
            payload: { param: 'dc_max_reached', value: state.dc, delta: 0 },
          });
        }
      } else {
        telop = 'DC MAX — これ以上増やせません';
        events.push({ name: 'paramChange', payload: { param: 'dc_max', value: state.dc, delta: 0 } });
      }
    }

    // ── 払出(純増 + 高DC帯のベル強化)──────────────
    // 等速で流れるだけの消化にならないよう、DCが育つほどベルが跳ねる波を入れる。
    let pay = AS_RUSH_CORE.payoutPerGame[state.dc];
    if (g.flag === 'BELL') {
      const boost = bellBoostOf(state.dc);
      if (boost > 0) {
        pay += boost;
        state.bellBoostTotal += boost;
        if (!telop) telop = `BELL RUSH — +${boost}枚!!`;
        events.push({
          name: 'paramChange',
          payload: { param: 'bell_boost', value: state.dc, delta: boost },
        });
      }
    }
    state.gained += pay;

    // ── 上位AT昇格 / 派生ゾーン当選(3.9)──────────
    // 昇格は AS_RUSH 自体が差し替わるので即 return してよいが、
    // 派生ゾーンの「積み上げ」はセット末(remaining が 0 になるゲーム)だけ扱いが違う。
    // ここで即 return すると親のヘルスチェックが1G遅れ、
    // 液晶に「残り0G」と出たままもう1G回って state.remaining が -1 になる。
    // そのため、セット末に当選した場合はヘルスチェックを先に済ませてから積む。
    let pendingZone = null;
    if (isRare(g.flag)) {
      if (drawServerlessUpgrade(g.rng, g.flag)) {
        return {
          payoutPerGame: pay,
          events,
          transition: { to: 'SERVERLESS_RUSH', params: { stock: state.stock } },
          telop: 'サメ揃い — SERVERLESS RUSH 昇格!!',
        };
      }
      const zone = drawDerivedZone(g.rng, g.flag);
      if (zone === 'SERVERLESS_UP') {
        return {
          payoutPerGame: pay,
          events,
          transition: { to: 'SERVERLESS_RUSH', params: { stock: state.stock } },
          telop: 'SERVERLESS RUSH 昇格!!',
        };
      }
      if (zone && state.remaining > 0) {
        return {
          payoutPerGame: pay,
          events,
          transition: { push: zone, params: {} },
          telop: `${zone.replace('_', ' ')} 突入!!`,
        };
      }
      pendingZone = zone ?? null;
    }

    if (state.remaining > 0) {
      return { payoutPerGame: pay, telop, events };
    }

    // ── セット終了 = ヘルスチェック ──
    // セット末に当選していた派生ゾーンは、継続が確定してから親の上に積む。
    // 転落(EXIT)した場合はATごと終わっているので積まない。
    const withZone = (res) => (pendingZone
      ? {
        ...res,
        transition: { push: pendingZone, params: {} },
        telop: `${pendingZone.replace('_', ' ')} 突入!!`,
      }
      : res);

    // 上乗せストックがあるうちはヘルスチェックを行わずに継続する
    if (state.stock > 0) {
      state.stock--;
      state.setCount++;
      state.streak++;
      state.remaining = state.total;
      state.lastSetResult = 'STOCK';
      const upgraded = checkStreakUpgrade(state);
      if (upgraded) return { payoutPerGame: pay, events, ...upgraded };
      return withZone({
        payoutPerGame: pay,
        events,
        setEnd: { result: 'STOCK', continued: true, healthLabel: 'STOCK' },
        telop: `上乗せ消化 — SET ${state.setCount}(残り ${state.stock})`,
      });
    }

    const rate = AS_RUSH_CORE.continueRate[state.dc];
    if (g.rng.chance(rate)) {
      state.setCount++;
      state.streak++;
      state.remaining = state.total;
      state.lastSetResult = 'CONTINUE';
      const upgraded = checkStreakUpgrade(state);
      if (upgraded) return { payoutPerGame: pay, events, ...upgraded };
      return withZone({
        payoutPerGame: pay,
        events,
        setEnd: { result: 'CONTINUE', continued: true, healthLabel: 'HEALTHY' },
        telop: `HEALTH CHECK OK — SET ${state.setCount}`,
      });
    }

    /**
     * スケールイン(2026-08-13: 1セッション100回転化に合わせて追加)。
     *
     * 継続失敗は「DC-1 して縮退運転で継続」なので、RUSH は DC が尽きるまで終わらない。
     * 1セット5G × 継続率0.62〜0.85 だと DC5 から抜けるのに 75〜100G かかり、
     * 100回転セッションの半分近くが RUSH のままになっていた(実測 43G/セッション)。
     * そこで **台数が多いほど一気にスケールインする**(高DCでは DC-2)ようにして、
     * 「育てた台数は失うのも早い」= 山が終わる感触を作る。
     */
    const drop = state.dc >= AS_RUSH_CORE.steepScaleInFrom ? AS_RUSH_CORE.scaleInDrop : 1;
    state.dc -= drop;
    state.streak = 0;
    if (state.dc < DC_MIN) {
      state.dc = 0;
      state.lastSetResult = 'EXIT';
      return {
        payoutPerGame: pay,
        events,
        setEnd: { result: 'EXIT', continued: false, healthLabel: 'UNHEALTHY' },
        // 残ストックも引き戻し層へ預ける(現状ここへ来る時点で 0 だが、
        // 「ストックが残ったままATが終わる」仕様変更をしても消えないようにしておく)
        //
        // onNextSpin(2026-08-13): 転落は即時遷移にしない。
        // 即時に HOT_STANDBY へ入ると、同一ゲーム内で modeEnter が発火して
        // 液晶がその場で切り替わり、setEnd(UNHEALTHY)の判定演出が
        // 1フレームも見えないまま消える(main.js の modeEnter 掃除)。
        // 結果、プレイヤーには「継続のときだけ判定が出る = 毎回継続」に見えていた。
        // 継続時(CONTINUE/DEGRADED)は遷移が無く判定演出が見え切るので、
        // 転落もこのゲームは AS_RUSH の画面のまま見せ切り、
        // 次のレバーONで引き戻し層へ入る(CZ・通常時の告知と同じ流儀)。
        transition: {
          to: 'HOT_STANDBY',
          params: { resumeMode: 'AS_RUSH', resumeStock: state.stock },
          onNextSpin: true,
        },
        telop: 'インスタンスが全滅…',
      };
    }

    state.setCount++;
    state.remaining = state.total;
    state.lastSetResult = 'DEGRADED';
    return withZone({
      payoutPerGame: pay,
      events,
      setEnd: { result: 'DEGRADED', continued: true, healthLabel: 'DEGRADED' },
      telop: `縮退運転 — DC ${state.dc} 台で継続`,
    });
  },

  /**
   * 50回転終了時の残存価値(data/session.js)。
   * 現在セットの残Gと、確定済みの上乗せストックを現在のDC純増で枚数換算する。
   * まだ引いていない継続抽選は買い取らない。
   */
  residualValue(state) {
    const per = AS_RUSH_CORE.payoutPerGame[state.dc] ?? 0;
    const lines = [];
    if (state.remaining > 0) {
      lines.push(residualLine(`AUTO SCALING RUSH 残り(DC${state.dc})`, state.remaining, per));
    }
    if ((state.stock ?? 0) > 0) {
      lines.push(residualLine(
        `上乗せストック ${state.stock}セット`, state.stock * AS_RUSH_CORE.setGames, per, 'stock',
      ));
    }
    return lines;
  },
};

/** 5セット連続継続で Serverless RUSH へ昇格(3.9 onSetEnd) */
function checkStreakUpgrade(state) {
  if (state.streak < SERVERLESS_UPGRADE.streak) return null;
  return {
    setEnd: { result: 'CONTINUE', continued: true, healthLabel: 'HEALTHY', streak: state.streak },
    transition: { to: 'SERVERLESS_RUSH', params: { stock: state.stock } },
    telop: `${state.streak}セット連続継続 — SERVERLESS RUSH 昇格!!`,
  };
}
