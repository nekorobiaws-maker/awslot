/**
 * リザルトパネル(50回転終了時の全画面表示)。DESIGN.md 5.3 / docs/BACKLOG.md 「M」
 *
 * ゲーム側(game/modes/result.js)は数字を state に載せるだけなので、
 * ここはその state を DOM へ流し込んで見せるだけの表示専任クラス。
 *
 * DOM にしている理由:
 *   名前の入力欄が要るため。Canvas に自前のテキスト入力を作るより、
 *   IME もフォーカスもブラウザ任せにできる <input> のほうが確実で、
 *   読み上げ(スクリーンリーダ)もそのまま効く。
 *
 * 入力の扱い:
 *   「もう一度やる」は data-action="RESTART" を持たせてあるので、
 *   engine/input.js のポインタ処理が拾ってR キーと同じ経路を通る。
 *   入力欄にフォーカスがある間は engine/input.js がキーを無視するので、
 *   名前を打っている最中に矢印キーでゲームが動くことはない。
 */

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
    this.nameEl = root.querySelector('#result-name');
    this.hofEl = root.querySelector('#result-hof');
    this.noteEl = root.querySelector('#result-note');
    this.againEl = root.querySelector('.result-again');
    this._open = false;
    /** 中身を組み直したstate(セッションが変わったかの判定に使う) */
    this._filled = null;

    // 殿堂入りは見た目だけ(登録処理は未実装)
    this.hofEl?.addEventListener('click', () => {
      if (this.noteEl) {
        const name = this.nameEl?.value.trim();
        this.noteEl.textContent = name
          ? `${name} の殿堂入りは準備中です`
          : '殿堂入りは準備中です';
      }
    });
  }

  /**
   * 毎フレーム呼ぶ。RESULTモードのstateを渡すと開き、null で閉じる。
   * @param {object|null} state
   */
  sync(state) {
    if (!this.el) return;
    if (state) {
      if (state !== this._filled) this._fill(state);
      if (!this._open) this._setOpen(true);
    } else if (this._open) {
      this._setOpen(false);
    }
  }

  _setOpen(open) {
    this._open = open;
    this.el.hidden = !open;
    this.el.classList.toggle('is-open', open);
    if (!open) {
      if (this.noteEl) this.noteEl.textContent = '';
      // 閉じた瞬間に入力欄へフォーカスが残っているとキー操作を食べてしまう
      if (document.activeElement === this.nameEl) this.nameEl.blur();
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
      this.rankEl.textContent = rank.label ? `RANK ${rank.id} — ${rank.label}` : '';
      this.rankEl.style.color = rank.color ?? '#ffd166';
    }
    if (this.sessionEl) {
      this.sessionEl.textContent = `${state.totalGames ?? 50} SPIN SCORE ATTACK`;
    }
    if (this.noteEl) this.noteEl.textContent = '';
    this._fillDetail(state);
  }

  /** 内訳(買い取り・戦績)を dl へ組み立てる */
  _fillDetail(state) {
    const dl = this.detailEl;
    if (!dl) return;
    dl.textContent = '';

    const rows = [
      ['最終クレジット', `${Math.round(state.finalCredit ?? 0).toLocaleString('en-US')} 枚`],
      ['買い取り前の差枚', `${signed(state.baseScore)} 枚`],
    ];
    for (const b of state.breakdown ?? []) {
      const detail = b.games != null && b.perGame != null
        ? `${b.games}G × ${b.perGame}枚`
        : '';
      rows.push([`買い取り: ${b.label}${detail ? `(${detail})` : ''}`, `+${Math.round(b.coins ?? 0)} 枚`]);
    }
    if ((state.buyout ?? 0) > 0) rows.push(['買い取り合計', `+${Math.round(state.buyout)} 枚`]);

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
