/**
 * リザルトパネル(100回転終了時の全画面表示)。DESIGN.md 5.3 / docs/BACKLOG.md 「M」
 *
 * ゲーム側(game/modes/result.js)は数字を state に載せるだけなので、
 * ここはその state を DOM へ流し込んで見せるだけの表示専任クラス。
 *
 * DOM にしている理由:
 *   Canvas に組むより、スクリーンリーダで読める見出し・定義リストを
 *   そのまま使えるほうが確実だから(数字の並びが多い画面なので効く)。
 *
 * 入力の扱い:
 *   「もう一度やる」は data-action="RESTART" を持たせてあるので、
 *   engine/input.js のポインタ処理が拾ってR キーと同じ経路を通る。
 *
 * 2026-08-14〜15 の改修:
 *   U7  … 最終ゲームの直後にいきなり開かず、液晶の終了演出
 *         (data/scenarios/session.js)を見せてから開く
 *   U47 … 「なまえ」入力と「殿堂入り」(端末内ランキング)を **廃止**。
 *         入力欄・登録ボタン・一覧・localStorage 保存をまとめて撤去し、
 *         スコア + ランク(到達率)+ 内訳 + 甘スロバッジだけにした。
 *         保存していた `awslot.hof.v1` はもう読まないので、
 *         過去に記録が残っている端末でも参照されずに眠るだけになる。
 *   V31-09 … 開いている間は <body> に .is-result を付ける。
 *         筐体の **外** にある打ち方プレート(#controls-guide)と
 *         甘スロ切替ボタンが明るいまま残り、しかも押せてしまっていたので、
 *         CSS 側で暗転させ、inert でキーボード/クリックも止める。
 */

/** リザルトを開くまでの待ち(セッション終了演出の尺と合わせる) */
export const RESULT_OPEN_DELAY_MS = 2600;

/**
 * リザルト表示中に触れなくする「筐体の外」の要素(V31-09)。
 * リザルトは aria-modal のダイアログなので、背後のUIは inert にするのが素直。
 */
const OUTSIDE_UI_SELECTORS = [
  '#controls-guide',      // PC の打ち方プレート(中に甘スロボタンも入っている)
  '#mobile-title',        // スマホ縦持ちの飾りタイトル
  '#mobile-rule',         // スマホ縦持ちのルール文(こちらにも甘スロボタンがある)
  '.mode-switch-floating', // どちらも出ない窓サイズ用の逃がしボタン
];

/** 数値を +1,234 / -567 の形にする */
function signed(n) {
  const v = Math.round(n ?? 0);
  return `${v > 0 ? '+' : ''}${v.toLocaleString('en-US')}`;
}

export class ResultPanel {
  /** @param {HTMLElement} root 筐体ルート要素 */
  constructor(root) {
    this.el = root.querySelector('#result-panel');
    this.scoreEl = root.querySelector('#result-score');
    this.rankEl = root.querySelector('#result-rank');
    this.sessionEl = root.querySelector('#result-session');
    this.detailEl = root.querySelector('#result-detail');
    this.againEl = root.querySelector('.result-again');
    this._open = false;
    /** 中身を組み直したstate(セッションが変わったかの判定に使う) */
    this._filled = null;
    /**
     * リザルトを開くまでの残り時間[ms]。null = 待っていない。
     *
     * 実時間(performance.now)ではなくゲーム時間で数えるのが肝
     * (?turbo=3 では演出も3倍速で終わるので、実時間で待つと
     *  終了演出のあとに何も起きない間ができてしまう)。
     */
    this._waitLeft = null;
  }

  /**
   * 時間を進める(main.js の onStep から毎フレーム呼ぶ)。
   * 演出と同じ dt を受け取るので、turbo でも終了演出とリザルトの間が空かない。
   * @param {number} dtMs
   */
  update(dtMs) {
    if (this._waitLeft == null) return;
    this._waitLeft = Math.max(0, this._waitLeft - (dtMs ?? 0));
  }

  /**
   * 毎フレーム呼ぶ。RESULTモードのstateを渡すと(少し待ってから)開き、null で閉じる。
   *
   * 待つ理由(U7): 最終ゲームの払出が終わった瞬間にリザルトが出ると
   * 「終わったこと」を認識する前に結果が出て唐突なので、
   * 液晶側の終了演出(data/scenarios/session.js)を見せてから開く。
   * @param {object|null} state
   */
  sync(state) {
    if (!this.el) return;
    if (state) {
      if (this._open) {
        if (state !== this._filled) this._fill(state);
        return;
      }
      if (this._waitLeft == null) this._waitLeft = RESULT_OPEN_DELAY_MS;
      if (this._waitLeft > 0) return;
      if (state !== this._filled) this._fill(state);
      this._setOpen(true);
    } else if (this._open || this._waitLeft != null) {
      this._waitLeft = null;
      if (this._open) this._setOpen(false);
    }
  }

  /**
   * リザルトがもう開いているか(2026-08-15 検証指摘 F18)。
   * 開いた後も下部テロップが「成績を集計しています…」のままだったので、
   * 表示側が「集計は終わった」を判定できるようにする。
   */
  get isOpen() { return this._open; }

  _setOpen(open) {
    this._open = open;
    this.el.hidden = !open;
    this.el.classList.toggle('is-open', open);
    if (!open) this._waitLeft = null;
    this._setOutsideUiInert(open);
  }

  /**
   * 筐体の外にあるUI(打ち方プレート・甘スロボタン)を止める / 戻す(V31-09)。
   * 見た目の暗転は style.css の `body.is-result` 側が持つ。
   * @param {boolean} inert
   */
  _setOutsideUiInert(inert) {
    document.body.classList.toggle('is-result', inert);
    for (const sel of OUTSIDE_UI_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        // inert 未対応のブラウザでも、CSS の pointer-events:none で
        // クリックは止まる(キーボード操作だけ通ってしまうのは許容する)。
        if (inert) el.setAttribute('inert', '');
        else el.removeAttribute('inert');
      }
    }
  }

  _fill(state) {
    this._filled = state;
    const score = Math.round(state.score ?? 0);
    if (this.scoreEl) {
      this.scoreEl.textContent = `${signed(score)} 枚`;
      this.scoreEl.dataset.sign = score >= 0 ? 'plus' : 'minus';
    }
    if (this.rankEl) {
      const rank = state.rank ?? {};
      /*
       * 2026-08-14 しおん指摘 V1:
       * 「RANK S」とだけ出しても、それが何回に1回のものか画面から分からず
       * ランクの重みが伝わらない。到達率(game/modes/result.js の RANKS)を
       * 併記して「20回に1回の帯だ」と一目で分かるようにする。
       *
       * rank.rate は **遊んだ設定の実測値に解決済み**(通常 / 甘スロで別の値)。
       * ここで RANKS を引き直してはいけない(甘スロで通常設定の到達率を
       * 名乗ってしまう = 事実に反する表示になる。2026-08-14 検証 major)。
       * どちらの設定かは甘スロバッジ(body.is-ama)側が伝える。
       * ※ V31-05 で再確認済み: rankOf(score, ama) が amaRate を rate へ
       *   解決して返すので、甘スロのセッションでは甘スロの到達率が出る。
       */
      this.rankEl.textContent = rank.label
        ? `RANK ${rank.id} — ${rank.label}${rank.rate ? `(到達率 ${rank.rate})` : ''}`
        : '';
      this.rankEl.style.color = rank.color ?? '#ffd166';
    }
    if (this.sessionEl) {
      this.sessionEl.textContent = `${state.totalGames ?? 100} SPIN SCORE ATTACK`;
    }
    this._fillDetail(state);
  }

  /** 内訳(買い取り・戦績)を dl へ組み立てる */
  _fillDetail(state) {
    const dl = this.detailEl;
    if (!dl) return;
    dl.textContent = '';

    const rows = [
      ['最終クレジット', `${Math.round(state.finalCredit ?? 0).toLocaleString('en-US')} 枚`],
    ];
    /*
     * 買い取りが発生した回だけ内訳を出す(2026-08-15 検証指摘 F17)。
     * 買い取りが起きるのは約3割のセッションなので、無条件に並べると
     * 残り7割では「買い取り前の差枚」だけが説明なしに浮いていた
     * (何を買い取ったのか画面のどこにも書かれていない状態)。
     * 出すときは「何のことか」を1行目のラベルで補う。
     */
    if ((state.buyout ?? 0) > 0) {
      rows.push(['買い取り前の差枚', `${signed(state.baseScore)} 枚`]);
      for (const b of state.breakdown ?? []) {
        // perGame は期待値なので端数が出る。生の値を出すと
        // 「8G × 8.454325396825398枚」になるので小数1桁へ丸める(表示だけ。合計は coins が正)
        const detail = b.games != null && b.perGame != null
          ? `${b.games}G × ${Math.round(b.perGame * 10) / 10}枚`
          : '';
        rows.push([`買い取り: ${b.label}${detail ? `(${detail})` : ''}`, `+${Math.round(b.coins ?? 0)} 枚`]);
      }
      rows.push(['買い取り合計(消化しきれなかったぶんの枚数換算)', `+${Math.round(state.buyout)} 枚`]);
    }

    const battles = [
      ['BONUS', state.bonusCount],
      ['AT', state.atCount],
      ['CZ', state.czCount],
      ['ZONE', state.zoneCount],
      ['ENDING', state.endingCount],
    ].filter(([, n]) => (n ?? 0) > 0).map(([k, n]) => `${k} ${n}`);
    rows.push(['戦績', battles.length > 0 ? battles.join(' / ') : '当選なし']);
    rows.push(['総投入 / 総払出', `${state.totalIn ?? 0} / ${state.totalOut ?? 0} 枚`]);

    for (const [label, value] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.append(dt, dd);
    }
  }
}
