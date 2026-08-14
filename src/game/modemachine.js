/**
 * Mode ステートマシン(第2層)。DESIGN.md 6.3
 *
 * 1ゲームの進行(GameFlow)とは分離し、「今どのモードにいるか」と
 * 「そのモードの継続管理」だけを担当する。
 * 派生ゾーンの入れ子に備えてモードスタックを持つ(深さ上限3)。
 */

import { freeTier } from './modes/freetier.js';
import { cz } from './modes/cz.js';
import { bonus } from './modes/bonus.js';
import { bonusReady } from './modes/bonusready.js';
import { asRush } from './modes/asrush.js';
import { cfRush, auroraRush, heroRush } from './modes/rushes.js';
import { hotStandby, route53Failover } from './modes/recovery.js';
import {
  spotZone, ec2Burst, graviton, reserved,
  cloudFront, kinesis, stepFunctions,
} from './modes/zones.js';
import { serverlessRush, multiRegion } from './modes/upperat.js';
import { reinventEd } from './modes/ending.js';
import { result } from './modes/result.js';
import { DEFAULT_FLAG_TABLE } from '../data/flags.js';

/** 実装済みのモードハンドラ(DESIGN.md 2.2 の全20モード) */
export const MODE_HANDLERS = {
  FREE_TIER: freeTier,
  CZ: cz,
  BONUS_READY: bonusReady,
  BONUS: bonus,
  // RUSH 4種(U11 / data/rushes.js)。伸びる軸が1本ずつ違う
  AS_RUSH: asRush,          // ゲーム数(EC2の台数 = 残りG)
  CF_RUSH: cfRush,          // 直接払い出し
  AURORA_RUSH: auroraRush,  // 純増(ACU)
  HERO_RUSH: heroRush,      // 5G固定のプレミア
  HOT_STANDBY: hotStandby,
  ROUTE53_FAILOVER: route53Failover,
  // 派生ゾーン(親モードの上に積まれる)
  SPOT_ZONE: spotZone,
  EC2_BURST: ec2Burst,
  GRAVITON: graviton,
  RESERVED: reserved,
  // 上乗せ特化
  CLOUDFRONT: cloudFront,
  KINESIS: kinesis,
  STEP_FUNCTIONS: stepFunctions,
  // 上位AT
  SERVERLESS_RUSH: serverlessRush,
  MULTI_REGION: multiRegion,
  // エンディング
  REINVENT_ED: reinventEd,
  // 100回転スコアアタックのリザルト(終端状態)
  RESULT: result,
};

/** DESIGN.md 注意事項9: モードスタックの深さ上限 */
export const MAX_STACK_DEPTH = 3;

/**
 * 「必ずこのモードを経由してから入る」入口ゲート(DESIGN.md 3.7)。
 *
 * ボーナスは当選した瞬間に消化が始まるのではなく、実機と同じく
 * 入賞待ち(BONUS_READY)でボーナス図柄を揃えてから始まる。
 * 当選元(FREE_TIER の直撃 / CZ の突破 / 前兆明け など)を1箇所ずつ直すと
 * 経路を1つ足すたびに漏れるため、モードスタックの入口でまとめて差し込む。
 *
 * ゲートを通した先(BONUS_READY)は params.viaReady を立てて BONUS へ遷移するので、
 * ここで再びゲートに捕まることはない。
 */
export const ENTRY_GATE = { BONUS: 'BONUS_READY' };

export class ModeMachine {
  /**
   * @param {object} opts
   * @param {import('../engine/rng.js').Rng} opts.rng
   * @param {import('../engine/eventbus.js').EventBus} opts.bus
   */
  constructor({ rng, bus }) {
    this.rng = rng;
    this.bus = bus;
    /** @type {{id:string, handler:object, state:object}[]} */
    this.stack = [];
    /** ATセットの累計消化数(エンディング条件 3.13 の atSetCount) */
    this.atSetCount = 0;
    /** スタック上限で押し出されたモードの数(デバッグ・検証用) */
    this.stackGuardHits = 0;
    /**
     * 保留中のモード遷移(遷移ホールド)。
     *
     * モード遷移は液晶の画面まるごとの切り替えなので、
     * 「結果が出た瞬間に遷移」すると **結果の画が1フレームも見えないまま**
     * 次のモードの画面へ差し替わる(例: Trusted Advisor の全項目グリーンが
     * 見えないうちにボーナス入賞待ちの画面になる)。
     *
     * 保留の指定は2種類ある(どちらもゲームの結果=state は確定済みで、待つのは見せ方だけ):
     *   transition.holdMs      … 指定ms だけ今の画面のまま見せてから遷移(CZの結果表示など)
     *   transition.onNextSpin  … **次のレバーONまで**待つ。告知したゲームは今の画面のまま終わり、
     *                             次に回したスピンが新モードの1ゲーム目になる
     *                             (「デプロイ完了の演出中に背景がもうCZ」を防ぐ)
     * @type {{transition:object, holdMs:number, from:string}|null}
     */
    this.pendingTransition = null;
  }

  /** 保留中の遷移があるか */
  get hasPendingTransition() { return this.pendingTransition !== null; }
  /** 保留中の遷移をあと何ms見せてから実行するか */
  get pendingHoldMs() { return this.pendingTransition?.holdMs ?? 0; }

  get current() { return this.stack[this.stack.length - 1] ?? null; }
  get currentId() { return this.current?.id ?? null; }
  get state() { return this.current?.state ?? {}; }
  /** 液晶などが参照する現在モードの表示名 */
  get displayName() { return this.state.name ?? this.current?.handler?.name ?? ''; }

  /** モードスタックのID列(デバッグ表示用) */
  get stackIds() { return this.stack.map((m) => m.id); }

  /** 現在モードがプレイヤーの分岐選択待ちか(Step Functions) */
  get awaitingChoice() { return Boolean(this.state.awaitChoice); }

  /**
   * 現在モードで引くべき小役テーブルID(DESIGN.md 3.7)。
   * ハンドラが `flagTable` を宣言していればそれを使い、無ければ通常時。
   * ボーナス中だけ「ベル約1/1.4 / 15枚」のテーブルに差し替わる(U22 でレア役を厚くした)。
   */
  get flagTableId() { return this.current?.handler?.flagTable ?? DEFAULT_FLAG_TABLE; }

  /**
   * 現在モードが要求するリール引き込み目標(DESIGN.md 6.4)。
   * 通常は成立役から決まる(data/flags.js の TARGET_SYMBOL)が、
   * ボーナス入賞待ちのハズレゲームだけは「ボーナス図柄を揃える」に差し替わる。
   * @param {string} flag 今ゲームの成立フラグ
   * @returns {string[]|null} 差し替えが不要なら null
   */
  reelTargetFor(flag) {
    return this.current?.handler?.reelTargetFor?.(this.state, flag) ?? null;
  }

  /**
   * 成立役の表示名をモードが上書きする場合に使う。
   * 入賞待ちのハズレは実際には「ボーナス図柄を揃えるゲーム」なので、
   * 画面に「ハズレ」と出てしまわないようにするためのフック。
   * @param {string} flag
   * @returns {string|null} 上書きしないなら null
   */
  flagLabelFor(flag) {
    return this.current?.handler?.flagLabelFor?.(this.state, flag) ?? null;
  }

  /**
   * 100回転を使い切った時点で残っている「所有ぶんの権利」を枚数へ換算する。
   * docs/BACKLOG.md「M: メカニクス改修」の残存価値の買い取り。
   *
   * モードスタックを下から順に舐め、各ハンドラの residualValue() を集める。
   * ゾーンは母体AT(自分より下にある直近のATモード)の純増を必要とするため、
   * ctx.host として渡す。ここは合計するだけでモード固有の知識を持たない。
   *
   * @returns {{lines: object[], total: number}}
   */
  collectResidualValue() {
    const lines = [];
    for (let i = 0; i < this.stack.length; i++) {
      const mode = this.stack[i];
      const host = this.atHost(i - 1);
      let res;
      try {
        res = mode.handler.residualValue?.(mode.state, { host, index: i });
      } catch (e) {
        console.warn(`[modemachine] residualValue に失敗: ${mode.id}`, e);
        res = null;
      }
      for (const line of res ?? []) {
        if (line && line.coins > 0) lines.push({ ...line, mode: mode.id });
      }
    }
    const total = lines.reduce((a, l) => a + l.coins, 0);
    return { lines, total };
  }

  /**
   * スタック上で現在モードより下にある直近のATモード。
   * 上乗せ特化ゾーンが「どのATにセットを積むか」を決めるのに使う。
   * @param {number} [fromIndex] 探索を開始する位置(既定は現在モードの1つ下)
   */
  atHost(fromIndex = this.stack.length - 2) {
    for (let i = fromIndex; i >= 0; i--) {
      if (this.stack[i].handler.type === 'AT') return this.stack[i];
    }
    return null;
  }

  /**
   * スタックを畳んで指定モードから開始する。
   * セッションのリスタート(RESULT → FREE_TIER)でも使うため、
   * 畳んだぶんは modeExit を出す(出さないと RESULT だけ「入ったまま出ていない」
   * 状態に見えて、検証side の突入/退出の対応が崩れる)。
   */
  start(id, params = {}) {
    this.pendingTransition = null;   // 畳むので保留していた遷移は無効
    while (this.stack.length > 0) {
      const prev = this.stack.pop();
      this.bus?.emit('modeExit', { id: prev.id, state: prev.state, restarted: true });
    }
    this._push(id, params);
  }

  /**
   * スタックを全て捨てて指定モードから開始し直す。
   * エンディング突入のように「今の滞在を全部畳む」遷移で使う。
   */
  forceMode(id, params = {}) {
    this.pendingTransition = null;   // 畳むので保留していた遷移は無効
    while (this.stack.length > 0) {
      const prev = this.stack.pop();
      this.bus?.emit('modeExit', { id: prev.id, state: prev.state, forced: true });
    }
    return this._push(id, params);
  }

  _push(id, params) {
    // 入口ゲート(ボーナスは必ず入賞待ちを経由する)
    const gate = ENTRY_GATE[id];
    if (gate && !params?.viaReady) return this._push(gate, params ?? {});

    const handler = MODE_HANDLERS[id];
    if (!handler) throw new Error(`[modemachine] 未実装のモード: ${id}`);
    // AT層を完全に抜けた(= 通常時へ落ちた)時点で ATセット数をリセットする。
    // ここで戻さないと別々のAT当選をまたいで累積し、
    // DESIGN.md 3.13 の「RUSH 15セット」が通算15セットになってエンディングが暴発する。
    // 引き戻し層(HOT_STANDBY / ROUTE53_FAILOVER)は AT の続きなので数えたまま持ち越す。
    if (id === 'FREE_TIER') this.atSetCount = 0;
    // DESIGN.md 注意事項9: 深さ上限3のガード。
    // 上限に達している場合は最上段を畳んでから積む(= 置換)。
    if (this.stack.length >= MAX_STACK_DEPTH) {
      this.stackGuardHits++;
      console.warn(`[modemachine] スタック上限(${MAX_STACK_DEPTH})のため ${id} を置換で処理します`);
      const dropped = this.stack.pop();
      if (dropped) this.bus?.emit('modeExit', { id: dropped.id, state: dropped.state, dropped: true });
    }
    const state = { id, name: handler.name, type: handler.type };
    handler.onEnter?.(state, params, { rng: this.rng, parent: this.current, atHost: this.atHost(this.stack.length - 1) });
    this.stack.push({ id, handler, state });
    this.bus?.emit('modeEnter', { id, state, params, resumed: false });
    return state;
  }

  _replaceTop(id, params) {
    const prev = this.stack.pop();
    if (prev) this.bus?.emit('modeExit', { id: prev.id, state: prev.state });
    return this._push(id, params);
  }

  /** 自分を畳んでから、その下のモードを差し替える */
  _popThenReplace(id, params) {
    const cur = this.stack.pop();
    if (cur) this.bus?.emit('modeExit', { id: cur.id, state: cur.state });
    if (this.stack.length === 0) return this._push(id, params);
    return this._replaceTop(id, params);
  }

  _pop() {
    const prev = this.stack.pop();
    if (prev) this.bus?.emit('modeExit', { id: prev.id, state: prev.state });
    if (this.stack.length === 0) this._push('FREE_TIER', {});
    else this.bus?.emit('modeEnter', { id: this.currentId, state: this.state, resumed: true, from: prev?.id });
  }

  /**
   * プレイヤーの分岐選択を現在モードへ渡す(Step Functions)。
   * @param {number} index 0=左(A) / 1=右(D)
   * @returns {boolean} 受理されたか
   */
  choose(index) {
    const mode = this.current;
    if (!mode?.handler?.onChoice || !mode.state.awaitChoice) return false;
    const ok = mode.handler.onChoice(mode.state, index, { rng: this.rng });
    if (ok) {
      this.bus?.emit('paramChange', {
        id: mode.id,
        state: mode.state,
        param: 'choice',
        value: mode.state.lastChoice,
        delta: index,
      });
    }
    return ok;
  }

  /**
   * 1ゲームぶんのモード処理。
   * @param {{flag:string, win:string, payout:number}} gctx
   * @returns {{payoutPerGame:number|null, telops:string[], transitioned:boolean}}
   */
  /**
   * 保留していた遷移を実行する。GameFlow がホールド時間の経過後に呼ぶ。
   * @returns {{applied:boolean, from:string|null, to:string|null}}
   */
  applyPendingTransition() {
    const pending = this.pendingTransition;
    if (!pending) return { applied: false, from: null, to: null };
    this.pendingTransition = null;
    this._runTransition(pending.transition);
    return { applied: true, from: pending.from, to: this.currentId };
  }

  /** 遷移指示(push / pop / to / popThenTo)の実行 */
  _runTransition(t) {
    if (t.pop) this._pop();
    else if (t.push) this._push(t.push, t.params ?? {});
    // popThenTo: 自分を畳んでから親モードごと差し替える
    // (Step Functions 全制覇 → 母体ATを Multi-Region に置き換える)
    else if (t.popThenTo) this._popThenReplace(t.popThenTo, t.params ?? {});
    else if (t.to) this._replaceTop(t.to, t.params ?? {});
  }

  onGame(gctx) {
    // 保険: 遷移を保留したまま次ゲームが始まったら、先に確定させてから進める
    // (GameFlow は必ずレバーON前に applyPendingTransition() するので通常は起きない)
    if (this.pendingTransition) this.applyPendingTransition();

    const mode = this.current;
    if (!mode) return { payoutPerGame: null, telops: [], transitioned: false };

    // 派生ゾーンは「親の純増」「親への上乗せ」を必要とするため、
    // スタックの1つ下(parent)と直近のAT(atHost)を渡す。
    const res = mode.handler.onGame?.(mode.state, {
      ...gctx,
      rng: this.rng,
      parent: this.stack[this.stack.length - 2] ?? null,
      atHost: this.atHost(),
    }) ?? null;
    const telops = [];
    let payoutPerGame = null;
    let transitioned = false;

    if (res) {
      if (res.telop) { telops.push(res.telop); mode.state.telop = res.telop; }
      if (res.payoutPerGame != null) payoutPerGame = res.payoutPerGame;

      // モードハンドラが要求した任意イベント(スケールアウト等の paramChange)
      for (const ev of res.events ?? []) {
        this.bus?.emit(ev.name, { id: mode.id, state: mode.state, ...(ev.payload ?? {}) });
      }

      if (res.setEnd) {
        // 文字列でも { result, ... } のオブジェクトでも受け付ける
        const detail = typeof res.setEnd === 'string' ? { result: res.setEnd } : res.setEnd;
        // エンディング条件(3.13)の atSetCount はATセットの消化数で数える
        if (mode.handler.type === 'AT') this.atSetCount++;
        this.bus?.emit('setEnd', { id: mode.id, state: mode.state, ...detail });
      }

      if (res.transition) {
        const t = res.transition;
        // onNextSpin: 次のレバーONまで遷移を待つ(告知はこのゲームの画面のまま見せる)
        const holdMs = t.onNextSpin ? Infinity : Number(t.holdMs ?? 0);
        if (holdMs > 0) {
          // 結果の画を見せ切ってから遷移する(pendingTransition のコメント参照)。
          // この時点ではまだモードは切り替わっていないので transitioned は false。
          this.pendingTransition = { transition: t, holdMs, from: mode.id };
        } else {
          this._runTransition(t);
          transitioned = true;
          // 遷移先のテロップも拾う
          if (this.state.telop) telops.push(this.state.telop);
        }
      }
    }

    return { payoutPerGame, telops, transitioned, held: this.hasPendingTransition };
  }
}
