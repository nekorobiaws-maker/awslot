/**
 * GameFlow ステートマシン(第1層)。DESIGN.md 4.1 / 6.3
 *
 * 1ゲームの進行手順はどのモードでも同一:
 *   IDLE → BET → READY → SPINNING → JUDGE → PAYOUT → TRANSITION → IDLE
 *
 * このファイルは描画・演出を一切知らない。状態変化は EventBus に流すだけ。
 */

import { drawFlag } from './lottery.js';
import { judge } from './payout.js';
import { BET_PER_GAME } from '../data/payouts.js';
import { FLAG_BY_ID, isRare, DEFAULT_FLAG_TABLE } from '../data/flags.js';
import { AUTO_INSERT } from './credit.js';
import { ENDING } from '../data/modes.js';
import { SESSION } from '../data/session.js';

export const FLOW = {
  IDLE: 'IDLE',
  BET: 'BET',
  READY: 'READY',
  SPINNING: 'SPINNING',
  JUDGE: 'JUDGE',
  PAYOUT: 'PAYOUT',
  TRANSITION: 'TRANSITION',
};

/** 各フェーズの所要時間(ms)。turbo は Loop.timeScale 側で効かせる */
export const TIMING = {
  BET_MS: 90,
  JUDGE_MS: 240,
  PAYOUT_TICK_MS: 55,
  PAYOUT_MIN_MS: 120,
  TRANSITION_MS: 140,
  TRANSITION_MODE_MS: 900,
  /**
   * プレイヤーの分岐選択(Step Functions)を待つ上限。
   * 押さないまま放置されても進行が止まらないよう、時間切れで既定の選択に進む。
   */
  CHOICE_TIMEOUT_MS: 8000,
};

export class GameFlow {
  constructor({ bus, rng, credit, reels, modeMachine }) {
    this.bus = bus;
    this.rng = rng;
    this.credit = credit;
    this.reels = reels;         // ReelController
    this.modes = modeMachine;

    this.state = FLOW.IDLE;
    this.timer = 0;

    /** 今ゲームの成立フラグ */
    this.flag = null;
    /**
     * 今ゲームで引いた小役テーブルID('NORMAL' / 'BONUS')。
     * レバーON時のモードで確定させ、判定・払出まで同じテーブルを使う。
     */
    this.flagTable = DEFAULT_FLAG_TABLE;
    /** デバッグ用の強制成立フラグ */
    this.forcedFlag = null;
    /** 直近の判定結果 */
    this.lastResult = null;
    /** 画面に出す最新テロップ */
    this.telop = '';

    this.payoutTotal = 0;
    this.payoutShown = 0;
    this._payoutTick = 0;
    this._transitioned = false;
    /** payoutEnd を1ゲームに1回だけ出すためのフラグ */
    this._payoutEnded = false;
    /**
     * 遷移ホールドの残り時間(ms)。
     * モードが `transition.holdMs` を指定したとき、その時間だけ
     * **元のモードの画面を出したまま**待ってから遷移を確定させる。
     * CZの結果(全項目グリーン / Success State 到達 / アラーム復帰)は
     * CZの画面の上で起きるので、ここで待たないと結果の画が1フレームも見えないまま
     * 次のモードの画面へ差し替わってしまう(= 全緑を見ていないのに確定と言われる)。
     */
    this._holdMs = 0;

    /** エンディング判定の基準差枚(前回エンディング終了時点にリセットされる) */
    this.endingBaseDiff = 0;
    /** 分岐選択待ちの経過時間(ms) */
    this._choiceWait = 0;

    /** 統計(デバッグ表示用) */
    this.stats = this._freshStats();

    /**
     * 50回転スコアアタックのセッション状態(data/session.js)。
     * 通常時・CZ・ボーナス・AT・ゾーンを問わず、レバーONを通算で数える。
     */
    this.session = {
      total: SESSION.totalGames,
      remaining: SESSION.totalGames,
      /** 消化した回転数 */
      played: 0,
      ended: false,
      /** 買い取り合計と明細(終了時に確定) */
      buyout: 0,
      breakdown: [],
      /** セッション通し番号(リスタートで増える) */
      index: 1,
    };
  }

  _freshStats() {
    return {
      games: 0,
      bonus: 0,
      at: 0,
      cz: 0,
      rare: 0,
      maxDc: 0,
      zones: 0,
      ending: 0,
    };
  }

  get isIdle() { return this.state === FLOW.IDLE; }
  /**
   * 分岐選択待ちの間はBETを受け付けない(選ばせてから回す)。
   * セッションを使い切ったあと(リザルト表示中)も受け付けない。
   */
  get canBet() {
    return this.state === FLOW.IDLE && !this.modes.awaitingChoice && !this.session.ended;
  }
  get canLever() { return this.state === FLOW.READY && !this.session.ended; }
  get canStop() { return this.state === FLOW.SPINNING; }
  /** リザルト表示中(次のセッションを待っている状態)か */
  get isResult() { return this.session.ended; }
  /** 残り回転数(液晶・HUDが常時参照する) */
  get spinsLeft() { return Math.max(0, this.session.remaining); }

  _setState(next) {
    const prev = this.state;
    this.state = next;
    this.bus.emit('flowState', { prev, next });
  }

  // ── 入力 ───────────────────────────────────

  /** MAX BET。クレジット不足時はデバッグ用に自動投入する */
  insertBet() {
    if (!this.canBet) return false;
    if (!this.credit.canBet(BET_PER_GAME)) {
      const n = this.credit.insert(AUTO_INSERT);
      this.telop = `CREDIT ${n} 枚を自動投入しました`;
      this.bus.emit('creditInsert', { amount: n });
    }
    this.credit.bet(BET_PER_GAME);
    this.timer = TIMING.BET_MS;
    this._setState(FLOW.BET);
    this.bus.emit('bet', { bet: BET_PER_GAME, credit: this.credit.credit });
    return true;
  }

  /** レバーON。ここで全抽選が完了する(DESIGN.md 4.1) */
  leverOn() {
    if (!this.canLever) return false;

    /**
     * スピン境界での遷移(2026-08-13 ユーザー指摘)。
     *
     * 「デプロイ完了の演出が出ているのに背景はもうCZ」問題の本丸。
     * 当選告知(前兆の結果・クイズ正解・天井到達)は **通常ステージの画面のまま**
     * そのゲームを終え、**次にレバーを引いた瞬間**にCZ/ボーナスへ入る。
     * そのスピンが新しいモードの1ゲーム目になる。
     *
     * ここで遷移させることで、
     *   - 小役テーブル(flagTableId)   … 新モードのものが使われる
     *   - リールの引き込み目標         … 新モードのものが使われる(入賞待ちのボーナス図柄)
     *   - leverOn イベントの mode      … 新モード
     * が全部そろう。告知ゲーム自体は通常時の1回転として消費される(回転数の数え方は不変)。
     */
    this._settleSpinTransition();

    // 小役テーブルはレバーONの時点のモードで決まる(ボーナス中だけベル15枚のテーブル)
    this.flagTable = this.modes.flagTableId;
    this.flag = drawFlag(this.rng, this.forcedFlag, this.flagTable);
    const forced = Boolean(this.forcedFlag);
    this.forcedFlag = null;
    // 前のゲームのテロップ(「チャンス目 — 次に期待」等)はここで寿命が切れる。
    // 次のゲームが回った時点で古い情報は消し、必要な告知はこの後の
    // 抽選・モード処理が改めて設定する(2026-08-13 ユーザー指示)。
    this.telop = '';

    this.stats.games++;
    if (isRare(this.flag)) this.stats.rare++;

    // 50回転スコアアタック: どのモードにいても1回転として数える
    this.session.played++;
    this.session.remaining--;
    this.bus.emit('sessionTick', {
      remaining: this.spinsLeft,
      played: this.session.played,
      total: this.session.total,
      last: this.session.remaining <= 0,
      warn: this.session.remaining <= SESSION.warnAt,
    });

    // モードが引き込み目標を差し替える場合がある(ボーナス入賞待ちのハズレゲーム)
    this.reels.startAll(this.flag, this.modes.reelTargetFor(this.flag));
    this._setState(FLOW.SPINNING);
    this.bus.emit('leverOn', {
      flag: this.flag,
      flagName: this.modes.flagLabelFor(this.flag) ?? FLAG_BY_ID[this.flag]?.name ?? this.flag,
      rare: isRare(this.flag),
      flagTable: this.flagTable,
      forced,
      mode: this.modes.currentId,
    });
    return true;
  }

  /**
   * 停止ボタン。index: 0=左 1=中 2=右
   *
   * リールが回っていない場面(= 停止ボタンが遊んでいる場面)では、
   * 左(A)/右(D)を Step Functions の分岐選択として使う。
   * 新しいキー割当を増やさずにプレイヤー選択を実現するための兼用。
   */
  stopReel(index) {
    if (!this.canStop) return this._tryChoice(index);
    const res = this.reels.requestStop(index);
    if (!res) return false;
    const order = this.reels.stopOrder.length; // 1..3
    this.bus.emit(`stop${order}`, { ...res, order });
    return true;
  }

  /**
   * 分岐選択(左=0 / 右=2 のボタンのみ有効)。
   * @returns {boolean} 選択として消費したか
   */
  _tryChoice(index) {
    if (!this.modes.awaitingChoice) return false;
    if (index !== 0 && index !== 2) return false;
    const ok = this.modes.choose(index === 0 ? 0 : 1);
    if (ok) {
      this._choiceWait = 0;
      this.telop = this.modes.state.telop ?? this.telop;
    }
    return ok;
  }

  /** デバッグ: 次ゲームの成立役を強制する */
  setForcedFlag(flag) {
    this.forcedFlag = flag;
    this.telop = `[DEBUG] 次ゲーム強制: ${FLAG_BY_ID[flag]?.name ?? flag}`;
    this.bus.emit('debugForceFlag', { flag });
  }

  // ── 更新 ───────────────────────────────────

  update(dt) {
    switch (this.state) {
      case FLOW.BET:
        this.timer -= dt;
        if (this.timer <= 0) {
          this._setState(FLOW.READY);
          this.bus.emit('betComplete', {});
        }
        break;

      case FLOW.SPINNING: {
        this.reels.update(dt);
        if (this.reels.allStopped) this._enterJudge();
        break;
      }

      case FLOW.JUDGE:
        this.timer -= dt;
        if (this.timer <= 0) this._enterPayout();
        break;

      case FLOW.PAYOUT:
        this.timer -= dt;
        this._payoutTick -= dt;
        while (this._payoutTick <= 0 && this.payoutShown < this.payoutTotal) {
          this.credit.add(1);
          this.payoutShown++;
          this._payoutTick += TIMING.PAYOUT_TICK_MS;
          this.bus.emit('payoutTick', { shown: this.payoutShown, total: this.payoutTotal });
        }
        if (this.payoutShown >= this.payoutTotal && this.timer <= 0) {
          if (!this._payoutEnded) {
            this._payoutEnded = true;
            this.bus.emit('payoutEnd', { total: this.payoutTotal });
          }
          // 遷移ホールド中は「今のモードの画面のまま」待つ。
          // ここで待つことで、結果の画(全項目グリーン等)が見えてから画面が切り替わる。
          if (this._holdMs > 0) {
            this._holdMs -= dt;
            break;
          }
          // onNextSpin の予約はここでは明けない。
          // 明けてしまうと当選告知の裏で画面だけ次のモードへ切り替わってしまう
          // (= ユーザー指摘「デプロイ完了の演出中に背景がもうCZ」)。
          // 次のレバーONまで今の画面のまま待つ。
          if (!this.modes.pendingTransition?.transition?.onNextSpin) {
            this._settlePendingTransition();
          }
          this._enterTransition();
        }
        break;

      case FLOW.TRANSITION:
        this.timer -= dt;
        if (this.timer <= 0) {
          this._setState(FLOW.IDLE);
          this.bus.emit('transitionEnd', { mode: this.modes.currentId });
        }
        break;

      default:
        // IDLE / READY は入力待ち
        break;
    }

    // 分岐選択の放置対策(時間切れで既定の選択に進める)
    if (this.modes.awaitingChoice) {
      this._choiceWait += dt;
      if (this._choiceWait >= TIMING.CHOICE_TIMEOUT_MS) {
        this._choiceWait = 0;
        this.modes.choose(0);
        this.telop = 'タイムアウト — 左の分岐で進みます';
      }
    } else {
      this._choiceWait = 0;
    }
  }

  // ── 内部遷移 ────────────────────────────────

  _enterJudge() {
    const line = this.reels.centerLineFixed();
    const result = judge(line, this.flag, this.flagTable);
    this.lastResult = { ...result, flag: this.flag, line };

    this._setState(FLOW.JUDGE);
    this.timer = TIMING.JUDGE_MS;
    this.bus.emit('judge', { ...this.lastResult });
  }

  _enterPayout() {
    // モード処理(G数消化・セット末判定・モード遷移)
    const prevMode = this.modes.currentId;
    const prevDepth = this.modes.stack.length;
    const modeRes = this.modes.onGame({
      flag: this.flag,
      win: this.lastResult.win,
      payout: this.lastResult.payout,
    });
    this._transitioned = modeRes.transitioned;
    if (modeRes.telops.length > 0) this.telop = modeRes.telops[modeRes.telops.length - 1];

    /**
     * 遷移ホールド(演出を見せ切ってから遷移する)。
     * ただし「セッション終了」と「エンディング成立」は
     * モードスタックの状態そのものが結果に効く(残存価値の買い取り / forceMode)ため、
     * 見せ方より状態の正しさを優先して即座に確定させる。
     */
    this._holdMs = 0;
    if (this.modes.hasPendingTransition) {
      const mustSettleNow = this.session.remaining <= 0 || this._endingConditionMet();
      if (mustSettleNow) this._settlePendingTransition(prevMode, prevDepth);
      // onNextSpin(スピン境界での遷移)は時間では明けない。次のレバーONまで待つ
      else if (!this.modes.pendingTransition.transition.onNextSpin) {
        this._holdMs = this.modes.pendingHoldMs;
      }
    }

    // AT中は純増固定、それ以外(通常時・ボーナス中・入賞待ち)は小役払出。
    // ボーナスは 2026-08-13 の仕様変更で純増固定をやめ、ベル15枚の小役払出になった。
    if (modeRes.payoutPerGame != null) {
      this.payoutTotal = this.credit.takeFraction(BET_PER_GAME + modeRes.payoutPerGame);
    } else {
      this.payoutTotal = this.lastResult.payout;
    }
    this.payoutShown = 0;
    this._payoutTick = 0;
    this._payoutEnded = false;

    if (modeRes.transitioned) this._countTransition(prevMode, this.modes.currentId, prevDepth);
    if (this.modes.currentId === 'AS_RUSH') {
      this.stats.maxDc = Math.max(this.stats.maxDc, this.modes.state.dc ?? 0);
    }

    this._checkEnding();
    // エンディング判定より後に置く。50回転を使い切ったらリザルトが最優先で、
    // 直前に成立したエンディングも「残存価値」として買い取り対象に入る。
    if (this.session.remaining <= 0 && !this.session.ended) this._endSession();

    this._setState(FLOW.PAYOUT);
    this.timer = TIMING.PAYOUT_MIN_MS;
    this.bus.emit('payoutStart', { total: this.payoutTotal, win: this.lastResult.win });
  }

  /**
   * 保留していたモード遷移を確定させる(遷移ホールドの明け)。
   * 統計・テロップは「実際に遷移した瞬間」に更新する必要があるのでここでまとめる。
   * @param {string} [from] 遷移元(省略時は保留情報から取る)
   * @param {number} [prevDepth] 遷移前のスタック深さ
   */
  _settlePendingTransition(from = null, prevDepth = this.modes.stack.length) {
    if (!this.modes.hasPendingTransition) return false;
    const src = from ?? this.modes.pendingTransition.from;
    const depth = prevDepth;
    const { applied } = this.modes.applyPendingTransition();
    if (!applied) return false;

    this._holdMs = 0;
    this._transitioned = true;
    this._countTransition(src, this.modes.currentId, depth);
    if (this.modes.currentId === 'AS_RUSH') {
      this.stats.maxDc = Math.max(this.stats.maxDc, this.modes.state.dc ?? 0);
    }
    // 遷移先のテロップ(「ゴースト7を揃えろ」など)はここで初めて出す
    this.telop = this.modes.state.telop ?? this.telop;
    return true;
  }

  /**
   * 「次のスピンで入る」と予約された遷移を、レバーONの直前に確定させる。
   * @returns {boolean} 遷移したか
   */
  _settleSpinTransition() {
    if (!this.modes.pendingTransition?.transition?.onNextSpin) return false;
    const from = this.modes.currentId;
    const prevDepth = this.modes.stack.length;
    return this._settlePendingTransition(from, prevDepth);
  }

  /** エンディング条件(3.13)が成立しているか。遷移ホールドの可否判定にも使う */
  _endingConditionMet() {
    if (this.modes.currentId === 'REINVENT_ED') return false;
    const gainedSince = this.credit.diff - this.endingBaseDiff;
    const byDiff = gainedSince >= (ENDING.conditions.find((c) => c.type === 'diffCoins')?.threshold ?? Infinity);
    const bySets = this.modes.atSetCount >= (ENDING.conditions.find((c) => c.type === 'atSetCount')?.threshold ?? Infinity);
    return byDiff || bySets;
  }

  _countTransition(from, to, prevDepth = this.modes.stack.length) {
    const AT_MODES = ['AS_RUSH', 'SERVERLESS_RUSH', 'MULTI_REGION'];
    if (to === 'CZ') this.stats.cz++;
    if (to === 'BONUS') this.stats.bonus++;
    if (AT_MODES.includes(to) && !AT_MODES.includes(from)) this.stats.at++;
    // ゾーン突入 = モードスタックが1段深くなった遷移(= transition.push)。
    // 「スタック2段以上での AT/CZ/BONUS 以外への遷移」で数えると、
    // ゾーン滞在中に起きた別の遷移まで拾ってしまい突入回数にならない。
    if (this.modes.stack.length > prevDepth) this.stats.zones++;
  }

  /**
   * エンディング条件(DESIGN.md 3.13)の判定。
   * 差枚は「前回エンディング終了時点からの増分」で見る。
   * こうすることで、統計用の通算差枚(credit.diff)を壊さずに毎回リセットできる。
   */
  _checkEnding() {
    const cur = this.modes.currentId;
    if (cur === 'REINVENT_ED') return;
    if (!this._endingConditionMet()) return;

    const gainedSince = this.credit.diff - this.endingBaseDiff;
    const byDiff = gainedSince >= (ENDING.conditions.find((c) => c.type === 'diffCoins')?.threshold ?? Infinity);
    // エンディングはスタックを丸ごと畳むので、保留中の遷移は先に確定させておく
    // (畳んでから実行すると、当選済みのボーナスが宙に浮く)
    this._settlePendingTransition();

    // 通常時の前兆が当選を手元に持っていたら、畳む前に退避してエンディングへ預ける。
    // forceMode はモードスタックを丸ごと捨てるので、ここで拾わないと
    // 告知前の当選(ボーナス/AT/CZ)が無告知のまま消える。
    // 預けた当選はキーノート終了時に FREE_TIER へ返り、短い前兆を経て必ず告知される。
    const carryWin = this.modes.current?.handler?.takePendingWin?.(this.modes.state) ?? null;

    this.modes.forceMode('REINVENT_ED', {
      reason: byDiff ? 'diffCoins' : 'atSetCount',
      diff: gainedSince,
      atSetCount: this.modes.atSetCount,
      carryWin,
    });
    // 次のエンディングは「ここからさらに +2222 / 15セット」で判定する
    this.endingBaseDiff = this.credit.diff;
    this.modes.atSetCount = 0;
    this.stats.ending++;
    this._transitioned = true;
    this.telop = this.modes.state.telop ?? this.telop;
  }

  // ── 50回転スコアアタック ────────────────────────

  /**
   * セッション終了。docs/BACKLOG.md「M: メカニクス改修」
   *
   *  1. モードスタックに残っている権利(ボーナス残G / AT残G / ストック等)を
   *     枚数へ換算してクレジットへ加算する(残存価値の買い取り)
   *  2. 全モードを畳んで RESULT へ移す
   *
   * 買い取りぶんは credit.add() で払い出すので、そのまま totalOut と差枚に乗る。
   * = 最終スコアは credit.diff ひとつで表せる(開始クレジットに依存しない)。
   */
  _endSession() {
    // 残存価値はモードスタックの中身そのものなので、
    // 保留中の遷移(見せ方のためのホールド)は先に確定させてから数える。
    this._settlePendingTransition();
    const endedIn = this.modes.currentId;
    const baseScore = this.credit.diff;
    const { lines, total } = this.modes.collectResidualValue();

    if (total > 0) this.credit.add(total);

    this.session.ended = true;
    this.session.buyout = total;
    this.session.breakdown = lines;

    const payload = {
      score: this.credit.diff,
      baseScore,
      buyout: total,
      breakdown: lines,
      finalCredit: this.credit.credit,
      totalIn: this.credit.totalIn,
      totalOut: this.credit.totalOut,
      totalGames: this.session.played,
      bonusCount: this.stats.bonus,
      atCount: this.stats.at,
      czCount: this.stats.cz,
      zoneCount: this.stats.zones,
      endingCount: this.stats.ending,
      endedIn,
    };

    this.modes.forceMode('RESULT', payload);
    this._transitioned = true;
    this.telop = this.modes.state.telop ?? this.telop;
    this.bus.emit('sessionEnd', { ...payload, sessionIndex: this.session.index });
  }

  /**
   * 新しい50回転セッションを開始する(リザルトからのリスタート)。
   * クレジット・統計・モードスタックをすべて初期状態へ戻す。
   * @returns {boolean} 実際にリスタートしたか
   */
  restart() {
    this.credit.reset(SESSION.startCredit);
    this.stats = this._freshStats();
    this.endingBaseDiff = 0;
    this.flag = null;
    this.lastResult = null;
    this.payoutTotal = 0;
    this.payoutShown = 0;
    this._payoutTick = 0;
    this._transitioned = false;
    this._payoutEnded = false;
    this._holdMs = 0;
    this._choiceWait = 0;
    this.timer = 0;

    this.session = {
      total: SESSION.totalGames,
      remaining: SESSION.totalGames,
      played: 0,
      ended: false,
      buyout: 0,
      breakdown: [],
      index: this.session.index + 1,
    };

    this.modes.atSetCount = 0;
    this.modes.start('FREE_TIER', { reset: true });
    this.telop = `${SESSION.name} — ${SESSION.totalGames}回転スタート!`;
    this._setState(FLOW.IDLE);
    this.bus.emit('sessionStart', {
      total: this.session.total,
      sessionIndex: this.session.index,
    });
    return true;
  }

  /**
   * 状態に応じた「メイン操作」1つに集約したエントリポイント。
   * ↑キー(ArrowUp)や、筐体のワンボタン操作から呼ぶ想定。
   *   リザルト中 … リスタート
   *   BET可能   … MAX BET
   *   レバー可能 … レバーON
   * @returns {'RESTART'|'BET'|'LEVER'|null} 実行したアクション
   */
  play() {
    if (this.session.ended) return this.restart() ? 'RESTART' : null;
    if (this.canBet) return this.insertBet() ? 'BET' : null;
    if (this.canLever) return this.leverOn() ? 'LEVER' : null;
    return null;
  }

  _enterTransition() {
    this._setState(FLOW.TRANSITION);
    this.timer = this._transitioned ? TIMING.TRANSITION_MODE_MS : TIMING.TRANSITION_MS;
    this._transitioned = false;
  }
}
