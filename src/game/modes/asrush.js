/**
 * M08. オートスケーリングRUSH(ゲーム数上乗せ特化)。DESIGN.md 2.2 / 3.8 / 3.9
 *
 * ── U11(2026-08-14 ユーザー指示)で全面的に作り替え ──────────────
 *
 * 旧実装は DC(Desired Capacity)が「純増」と「セット継続率」を兼ねる母体ATで、
 * 1セット5Gごとにヘルスチェック、失敗でスケールイン、DCが尽きたら転落…という
 * 単独で完結した大きな仕組みだった。
 *
 * U11 で RUSH は4種類になり、それぞれ **伸びる軸を1本だけ持つ** 形へ分解された。
 * このモードの軸は **ゲーム数**:
 *
 *   ・**EC2の台数 = 残りゲーム数**(1台 = 1ゲーム)
 *   ・**レア役**が成立するたびにオートスケール = 台数(= 残りゲーム数)が増える
 *     (U24 / 2026-08-14: 旧は子役全部が契機だった。レア役の定義は data/rareroles.js)
 *   ・増える台数は成立役で変わる(data/rushes.js の addUnitsByFlag が正。
 *     数値をここに書き写すと調整のたびに嘘になるので書かない)
 *   ・純増は固定(payoutPerGame)。ここが動かないことが「ゲーム数特化」の証明
 *   ・台数が 0 になったら終了 → 引き戻し層(ホットスタンバイ)へ
 *
 * セット継続・ヘルスチェック・スケールインは **このモードからは無くなった**
 * (継続の駆け引きは「レア役を引けるか」に一本化された)。
 *
 * 派生ゾーン(3.9)と Serverless RUSH 昇格は、AWSのスケーリングという題材が
 * 一番近いこのモードにだけ残してある(他3種は短い特化ゾーンなので寄り道させない)。
 *
 * ── 【不変条件】state.units === state.remaining(2026-08-14 修正)──────────
 *
 * このモードの中核メタファーは「**EC2の台数がそのまま残りゲーム数**」。
 * したがって台数は残りゲーム数と **常に同じ値** でなければならない。
 *
 * 以前の実装は消化時に remaining だけを減らし、units は上乗せ時にしか動かなかったため
 * units が事実上 total(通算ゲーム数)と同じ意味になっていた。
 * 結果、5台で3G消化すると「EC2 5台 / 残り2G」となり、
 *   ・テロップ「SCALE OUT!! EC2 6 台(残り 2 G)」が自己矛盾する
 *   ・液晶が「EC2 INSTANCES = 残りゲーム数」と書いた真下で残Gと違う数を大きく描く
 *   ・買い取り明細の「EC2 n台」も残Gと食い違う
 *   ・flow.stats.maxDc / peakUnits が「同時最大台数」ではなく通算Gを指す
 * という破綻が同時に起きていた。
 *
 * 「どこまで伸ばしたか」は units ではなく
 *   state.peakUnits  … 同時に何台まで並んだか(= 残Gの最大到達)
 *   state.addedUnits … オートスケールで足した台数の合計(= 上乗せG数の合計)
 *   state.total      … 通算ゲーム数(初期台数 + 上乗せ合計)
 * が担当する。**units に「伸ばした量」の意味を持たせないこと**。
 */

import {
  drawDerivedZone, drawServerlessUpgrade, drawRushInitUnits,
} from '../lottery.js';
import { RUSH_SPEC_BY_ID } from '../../data/rushes.js';
import { isRareRole } from '../../data/rareroles.js';
import { residualLine } from '../../data/session.js';
import { rushEndResult } from './rushes.js';

const SPEC = RUSH_SPEC_BY_ID.AS_RUSH;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const asRush = {
  id: 'AS_RUSH',
  name: SPEC.name,
  type: 'AT',

  onEnter(state, params = {}, ctx) {
    /**
     * 初期台数。
     *   params.units … 引き戻しからの復帰・デバッグ起動(?dc=5 は台数として解釈)
     *   未指定       … data/rushes.js の initUnitsDist から抽選
     * ctx.rng はゲーム抽選RNG(ModeMachine が渡す)。
     */
    const units = params.units ?? params.dc ?? (ctx?.rng ? drawRushInitUnits(ctx.rng) : 3);
    state.rushId = SPEC.id;
    state.short = SPEC.short;
    /* 液晶ヘッダの名前は英字ショート名へ一本化する(2026-08-16 検証指摘 V80-7 / V80-8) */
    state.headerName = SPEC.short;
    state.axis = SPEC.axis;
    /** いま稼働している台数。**常に state.remaining と同じ値**(ファイル冒頭の不変条件) */
    state.units = clamp(Math.round(units), 1, SPEC.maxUnits);
    /** 残りゲーム数(液晶・買い取りが読む共通の項目) */
    state.remaining = state.units;
    /** 通算ゲーム数 = 初期台数 + 上乗せ合計。「どこまで回したか」はこちらが持つ */
    state.total = state.units;
    /** 純増は固定。派生ゾーンと買い取りはこの値を読む(RUSH共通の契約) */
    state.netPerGame = SPEC.payoutPerGame;
    state.gained = 0;
    state.playedGames = 0;
    /** 上乗せで増やした台数の合計(成長カーブの可視化用) */
    state.addedUnits = 0;
    state.scaleOutCount = 0;
    /** 到達した最大**同時**台数(= 残Gの最大到達。液晶の「最大 n 台」表示と検証用) */
    state.peakUnits = state.units;
    /** 直近のゲームで増えた台数(液晶が新しいアイコンだけ光らせるのに読む) */
    state.lastScaleOut = 0;
    state.telop = `EC2 ${state.units} 台で起動 — レア役でオートスケール!!`;
  },

  onGame(state, g) {
    const events = [];
    let telop = null;

    state.remaining--;
    // 1ゲーム消化 = インスタンスが1台終了する。台数は残Gと同期し続ける(不変条件)
    state.units = state.remaining;
    state.playedGames++;

    // ── オートスケール(このモードの主役)────────────────
    // **レア役**が成立していれば台数が増える = そのぶん残りゲーム数が伸びる(U24)。
    // 抽選ではなく **成立役で決まる固定値** なので、引けた瞬間に結果が見える。
    // ベル・リプレイでは伸びない = 「レア役が来た瞬間だけが上乗せ」に統一した。
    const add = isRareRole(g.flag) ? (SPEC.addUnitsByFlag[g.flag] ?? 0) : 0;
    // 直近のオートスケール量(液晶が「増えた瞬間」だけ光らせるのに使う)。毎ゲーム0に戻す
    state.lastScaleOut = 0;
    /**
     * 通算ゲーム数の上限(U50 / SPEC.maxTotalGames)。
     * 残り台数(maxUnits)だけを見ていると「消化しては上乗せ」で無限に伸びるので、
     * **通算(state.total)側にも上限を持たせる**。上限に達した後のレア役は
     * オートスケールせず、代わりに派生ゾーン抽選(このあとの処理)へ素通りする。
     * 派生ゾーン経由の上乗せ(rushes.js の addRushGames)も同じ上限を見ている。
     */
    const room = Math.max(0, SPEC.maxTotalGames - state.total);
    if (add > 0 && room > 0 && state.units < SPEC.maxUnits) {
      const before = state.units;
      state.units = clamp(state.units + Math.min(add, room), 1, SPEC.maxUnits);
      const delta = state.units - before;
      state.remaining = state.units;   // 同期を保つ(台数 = 残りゲーム数)
      state.total += delta;
      state.addedUnits += delta;
      state.lastScaleOut = delta;
      state.scaleOutCount++;
      state.peakUnits = Math.max(state.peakUnits, state.units);
      // 台数と残Gは同じ数字。ここで両方書くのは「1台 = 1ゲーム」を毎回言い直すため
      telop = `SCALE OUT!! EC2 +${delta} 台 → ${state.units} 台稼働(= 残り ${state.units} G)`;
      events.push({
        name: 'paramChange',
        payload: {
          param: 'scale_out', value: state.units, delta, flag: g.flag, remaining: state.remaining,
          peak: state.peakUnits, added: state.addedUnits,
        },
      });
    }

    // ── 払出(固定純増)────────────────────────
    const pay = state.netPerGame;
    state.gained += pay;

    // ── 上位AT昇格 / 派生ゾーン当選(3.9)──────────
    // 「積む」系の遷移は残ゲームがある時だけ。0G目に積むと
    // 復帰したときに残り0Gのまま1G回ってしまう(旧実装からの不変条件)。
    if (isRareRole(g.flag)) {
      if (drawServerlessUpgrade(g.rng, g.flag)) {
        return {
          payoutPerGame: pay,
          events,
          transition: { to: 'SERVERLESS_RUSH', params: { stock: 0 } },
          telop: 'サメ揃い — SERVERLESS RUSH 昇格!!',
        };
      }
      const zone = drawDerivedZone(g.rng, g.flag);
      if (zone === 'SERVERLESS_UP') {
        return {
          payoutPerGame: pay,
          events,
          transition: { to: 'SERVERLESS_RUSH', params: { stock: 0 } },
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
    }

    if (state.remaining > 0) {
      return { payoutPerGame: pay, telop, events };
    }

    // ── 台数がゼロ = RUSH 終了 ────────────────────
    // 復帰パラメータは rushEndResult が data/rushes.js の recoveryParamsFor から作る
    // (4種で復帰の価値が食い違わないように統一。2026-08-14 minor-a)
    return {
      payoutPerGame: pay,
      events,
      ...rushEndResult(state, { telop: '全インスタンスが停止… ホットスタンバイへ' }),
    };
  },

  /**
   * 100回転終了時の残存価値(data/session.js)。
   * 残りゲーム数 × 固定純増。まだ引いていない上乗せは買い取らない。
   * ラベルの台数は残Gと同じ値(不変条件)なので明細と本数が食い違わない。
   */
  residualValue(state) {
    if (!(state.remaining > 0)) return [];
    return [residualLine(
      `${SPEC.short} 残り(EC2 ${state.remaining}台)`, state.remaining, state.netPerGame,
    )];
  },
};
