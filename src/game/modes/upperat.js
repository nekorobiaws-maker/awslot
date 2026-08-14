/**
 * M09/M10. 上位AT層。DESIGN.md 2.2 / 3.11
 *
 * Serverless RUSH: DC管理から解放され、純増4枚・継続率80%が固定。
 *                  ゴースト揃いで Multi-Region へ昇格。
 * Multi-Region   : 純増6枚・継続率85%。全レア役で1セット上乗せ確定。
 *
 * どちらも上乗せ(stock)を持ち、セット末に1セットずつ消費して継続する。
 *
 * ── U32(2026-08-14 ユーザー指示)/ 転落後の引き戻しは「ボーナス」へ戻る ──
 * セットが切れたら引き戻し層(ホットスタンバイ)へ落ちるのは今までどおりだが、
 * 成功したときの復帰先は **元の上位ATではなくボーナス**(data/rushes.js の
 * RECOVERY_BONUS)になった。RUSH 4種と同じ扱いに揃えることで、
 * 「引き戻しに成功したら何が起きるか」を台全体で1通りにしている。
 */

import { UPPER_AT_SPEC_BY_ID } from '../../data/modes.js';
import { recoveryEntryParams } from '../../data/rushes.js';
import { isRareRole } from '../../data/rareroles.js';
import { residualLine } from '../../data/session.js';

/**
 * 上位AT共通の残存価値(data/session.js)。
 * 純増が固定なので、残Gとストックをそのまま枚数へ換算できる。
 */
function upperResidual(state, specId, label) {
  const spec = UPPER_AT_SPEC_BY_ID[specId];
  const per = state.payoutPerGame ?? spec.payoutPerGame;
  const lines = [];
  if (state.remaining > 0) lines.push(residualLine(`${label} 残り`, state.remaining, per));
  if ((state.stock ?? 0) > 0) {
    lines.push(residualLine(
      `上乗せストック ${state.stock}セット`, state.stock * spec.setGames, per, 'stock',
    ));
  }
  return lines;
}

/**
 * セット末の共通処理。
 * 上乗せストックがあれば無条件継続、無ければ継続率抽選。
 * @returns {{result:string, continued:boolean}}
 */
function resolveSetEnd(state, spec, rng) {
  if ((state.stock ?? 0) > 0) {
    state.stock--;
    state.setCount++;
    state.remaining = state.total;
    return { result: 'STOCK', continued: true };
  }
  if (rng.chance(spec.continueRate)) {
    state.setCount++;
    state.remaining = state.total;
    return { result: 'CONTINUE', continued: true };
  }
  return { result: 'EXIT', continued: false };
}

// ── M09. Serverless RUSH ─────────────────────────

export const serverlessRush = {
  id: 'SERVERLESS_RUSH',
  name: 'SERVERLESS RUSH',
  type: 'AT',

  onEnter(state, params = {}) {
    const spec = UPPER_AT_SPEC_BY_ID.SERVERLESS_RUSH;
    state.short = spec.short;
    state.total = spec.setGames;
    state.remaining = spec.setGames;
    state.setCount = 1;
    state.gained = 0;
    state.stock = params.stock ?? 0;
    state.payoutPerGame = spec.payoutPerGame;
    state.continueRate = spec.continueRate;
    state.invocations = 0;
    state.telop = `サーバー管理から解放 — 純増${spec.payoutPerGame}枚 / レア役で +${spec.addGamePerWin}G`;
  },

  onGame(state, g) {
    const spec = UPPER_AT_SPEC_BY_ID.SERVERLESS_RUSH;
    state.remaining--;
    const pay = state.payoutPerGame;
    state.gained += pay;
    const events = [];

    /**
     * 「関数が呼ばれた +1G」(2026-08-13 ユーザー仕様)。
     *
     * Serverless RUSH 中は **レア役が成立するたびに残りゲームが1つ増える**。
     * Lambda が呼ばれるたびに実行が伸びる、という見立て。
     *
     * ── 2026-08-14 しおん指摘 minor / レア役統一の取りこぼしを修正 ──────────
     * U22〜U24 でゲーム全体の契機が **レア役のみ** に統一されたのに、
     * ここだけ「ハズレ以外すべて」(約1/2.8)のまま取り残されていた。
     * 旧: ほぼ毎ゲーム +1G = 5Gセットが実効7〜8Gに伸びる(延長が日常)
     * 新: レア役契機(通常時 1/24.7)= 平均 +0.2G。**引けた時だけ粘れる**
     * 判定は data/rareroles.js の isRareRole が唯一の正(直書き条件を作らない)。
     */
    if (spec.addGamePerWin && isRareRole(g.flag)) {
      state.remaining += spec.addGamePerWin;
      state.invocations = (state.invocations ?? 0) + 1;
      events.push({
        name: 'paramChange',
        payload: {
          param: 'add_game', value: state.remaining, delta: spec.addGamePerWin,
          source: 'SERVERLESS_RUSH', reason: 'invocation',
        },
      });
    }

    // レア役で最上位へ昇格(3.11 upgradeFlags)。
    // ゴースト以外にもサメ・強チェリーへ枠を広げてある(1セット10Gと短いため)。
    const upRate = spec.upgradeFlags?.[g.flag]
      ?? (g.flag === spec.upgradeFlag ? spec.upgradeRate : 0);
    if (upRate > 0 && g.rng.chance(upRate)) {
      return {
        payoutPerGame: pay,
        transition: { to: spec.upgradeTo, params: { stock: state.stock, from: 'SERVERLESS_RUSH' } },
        telop: 'ゴースト揃い — MULTI-REGION 昇格!!',
      };
    }

    if (state.remaining > 0) {
      const added = events.some((e) => e.payload?.param === 'add_game');
      return {
        payoutPerGame: pay,
        events,
        telop: added ? `関数が呼ばれた +${spec.addGamePerWin}G(残り ${state.remaining}G)` : null,
      };
    }

    const res = resolveSetEnd(state, spec, g.rng);
    if (res.continued) {
      // セット継続に成功したら最上位への昇格を抽選する。
      // 1セット10Gと短くレア役契機だけでは最上位が一生見られないため、
      // 「スケールし続けた結果マルチリージョン化する」導線をここに置く。
      if (spec.setEndUpgradeRate && g.rng.chance(spec.setEndUpgradeRate)) {
        return {
          payoutPerGame: pay,
          setEnd: { ...res, healthLabel: 'SCALED OUT' },
          transition: { to: spec.upgradeTo, params: { stock: state.stock, from: 'SERVERLESS_RUSH' } },
          telop: '全リージョンへ展開 — MULTI-REGION 昇格!!',
        };
      }
      return {
        payoutPerGame: pay,
        setEnd: { ...res, healthLabel: res.result === 'STOCK' ? 'STOCK' : 'HEALTHY' },
        telop: res.result === 'STOCK'
          ? `上乗せ消化 — SET ${state.setCount}`
          : `INVOCATION OK — SET ${state.setCount}`,
      };
    }
    return {
      payoutPerGame: pay,
      setEnd: { ...res, healthLabel: 'THROTTLED' },
      transition: {
        to: 'HOT_STANDBY',
        params: recoveryEntryParams('SERVERLESS_RUSH', state.stock ?? 0),
      },
      telop: 'スロットリング発生… 引き戻しへ',
    };
  },

  residualValue(state) {
    return upperResidual(state, 'SERVERLESS_RUSH', 'SERVERLESS RUSH');
  },
};

// ── M10. Multi-Region アクティブ・アクティブ ───────

export const multiRegion = {
  id: 'MULTI_REGION',
  name: 'MULTI-REGION ACTIVE/ACTIVE',
  type: 'AT',

  onEnter(state, params = {}) {
    const spec = UPPER_AT_SPEC_BY_ID.MULTI_REGION;
    state.short = spec.short;
    state.total = spec.setGames;
    state.remaining = spec.setGames;
    state.setCount = 1;
    state.gained = 0;
    state.stock = params.stock ?? 0;
    state.payoutPerGame = spec.payoutPerGame;
    state.continueRate = spec.continueRate;
    state.regions = spec.regions;
    /** 点灯済みリージョン数(全点灯でエンディングが見える) */
    state.lit = 1;
    state.telop = '全リージョン稼働 — 全レア役で上乗せ確定';
  },

  onGame(state, g) {
    const spec = UPPER_AT_SPEC_BY_ID.MULTI_REGION;
    state.remaining--;
    const pay = state.payoutPerGame;
    state.gained += pay;
    const events = [];
    let telop = null;

    // 全レア役で上乗せ確定(3.11 allRareAddSet)
    if (spec.allRareAddSet && isRareRole(g.flag)) {
      state.stock = (state.stock ?? 0) + spec.addSetPerRare;
      state.lit = Math.min(state.regions.length, state.lit + 1);
      telop = `${state.regions[state.lit - 1]} 点灯 — +${spec.addSetPerRare} SET`;
      events.push({
        name: 'paramChange',
        payload: { param: 'region_light', value: state.lit, delta: 1, source: 'MULTI_REGION' },
      });
    }

    if (state.remaining > 0) return { payoutPerGame: pay, events, telop };

    const res = resolveSetEnd(state, spec, g.rng);
    if (res.continued) {
      return {
        payoutPerGame: pay,
        events,
        setEnd: { ...res, healthLabel: res.result === 'STOCK' ? 'STOCK' : 'ALL GREEN' },
        telop: `全リージョン正常 — SET ${state.setCount}`,
      };
    }
    return {
      payoutPerGame: pay,
      events,
      setEnd: { ...res, healthLabel: 'REGION DOWN' },
      transition: {
        to: 'HOT_STANDBY',
        params: recoveryEntryParams('MULTI_REGION', state.stock ?? 0),
      },
      telop: 'リージョン障害… 引き戻しへ',
    };
  },

  residualValue(state) {
    return upperResidual(state, 'MULTI_REGION', 'MULTI-REGION');
  },
};
