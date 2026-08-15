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
 *   U56 … RANK 行とは **別の行** で称号(Certified 〜 Heroes)を出す。
 *         あわせてカード末尾に非公式ファン作品である旨の一文を添える。
 *         どちらの要素も index.html には無く、**ここで1度だけ作って挿す**
 *         (index.html を触らずに済ませるため。render/overlay.js が
 *          ページ暗転の div を自前で作っていたのと同じ作法)。
 *   L5  … 「学習サマリー」(<details>)を内訳の下へ足す。道中は
 *         テンポを壊せないので、**手が空く唯一の時間であるリザルト**に
 *         その日の学びを1か所へ集める。読み飛ばせるようにネイティブの
 *         折りたたみを使う(このパネルは aria-modal のダイアログなので、
 *         独自実装の開閉は避ける = キーボード/読み上げが標準で効く)。
 *         数字は data/learnlog.js が解決済みのものをそのまま出す。
 */

import {
  isLearnEnabled,
  getDexProgress,
  getSessionDigest,
  getQuizStats,
  getBadges,
} from '../data/learnlog.js';

/** リザルトを開くまでの待ち(セッション終了演出の尺と合わせる) */
export const RESULT_OPEN_DELAY_MS = 2600;

/**
 * 「今日出会ったサービス」のチップを並べる上限(L5)。
 * 超えた分は「ほか n件」の1枚にまとめる。
 * 数を絞る理由: 本文の高さが伸びると「もう一度やる」が画面外へ押し出される
 * (.result-card は overflow:auto なので破綻はしないが、押しにくくなる)。
 *
 * 8 → 6 (2026-08-15 しおん検定 G1): 8件だと3〜4行に折り返してチップ枠の
 * 入れ子スクロールが必要になり、「見切れているのに気づけない」二重スクロールが
 * 発生していた。6件なら実測2行に収まるので、チップ側のスクロールを廃止して
 * 本文(外側)1本にできる。溢れたぶんは従来どおり「ほか n件」が受ける。
 */
const LEARN_CHIP_MAX = 6;

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

/**
 * 権利表記(2026-08-15 ユーザー指示 U56)。
 *
 * 本作は AWS のサービス名・機能名をモチーフにしたファン作品なので、
 * 公式と誤解されないよう1文だけ添える。**小さく静かに**出す
 * (リザルトの主役はスコアと称号なので、ここが目立ってはいけない)。
 * 文言を変えるときは「非公式」と「関係のない」を必ず残すこと。
 */
export const DISCLAIMER_TEXT = '本作は Amazon Web Services, Inc. とは関係のない非公式ファン作品です。';

/**
 * 正答率の表示テキストを作る(L5)。
 *
 * **ここで率を計算し直さない**。data/learnlog.js が解決済みの値を
 * そのまま出すのがこのファイルの決まり事
 * (RANK の到達率を表示側で引き直して、甘スロなのに通常設定の数字を
 *  名乗った前例がある。_fill() の rank のコメント参照)。
 * この関数がするのは「数値で来たときに % を付ける」整形だけで、
 * 割合そのものには一切触らない。
 * @param {number|string|null|undefined} rate
 * @returns {string} 表示できない値なら空文字
 */
function learnRateText(rate) {
  if (rate == null || rate === '') return '';
  if (typeof rate === 'string') return rate;
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return '';
  /*
   * data/learnlog.js の getQuizStats() は rate を **0〜1 の小数** で返す
   * (あちらの JSDoc に明記あり)。100 倍して % にするのはこの1か所だけ。
   * 1 を超える値が来たら既に % 表記の数値とみなす(将来の仕様変更の保険)。
   */
  return rate <= 1 ? `${Math.round(rate * 100)}%` : `${Math.round(rate)}%`;
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
    /** 称号の行(U56)。index.html には無いのでここで作って RANK 行の直後へ挿す */
    this.honorEl = this._ensureHonorEl();
    /** 学習サマリーの折りたたみ(L5)。内訳(#result-detail)の直後へ挿す */
    this.learnEl = this._ensureLearnEl();
    /** 権利表記(U56)。カードのいちばん下に小さく置く */
    this.disclaimerEl = this._ensureDisclaimerEl();
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
   * 称号の行を用意する(U56)。既にあればそれを使う。
   *
   * RANK 行(#result-rank)の **すぐ下** に置く。
   * 「RANK = スコア帯の格付け / 称号 = 呼び名」で役割が違うので、
   * 同じ行に混ぜず1行空けて並べる(混ぜるとどちらも読み流される)。
   * 派手な演出は付けない(U56 の指示)。
   * @returns {HTMLElement|null}
   */
  _ensureHonorEl() {
    const existing = this.el?.querySelector('#result-honor');
    if (existing) return existing;
    if (!this.rankEl?.parentNode) return null;
    const p = document.createElement('p');
    p.id = 'result-honor';
    p.className = 'result-honor';
    this.rankEl.after(p);
    return p;
  }

  /**
   * 権利表記の行を用意する(U56)。カードの末尾(「R キー…」の下)へ置く。
   * @returns {HTMLElement|null}
   */
  _ensureDisclaimerEl() {
    const existing = this.el?.querySelector('#result-disclaimer');
    if (existing) return existing;
    const card = this.el?.querySelector('.result-card');
    if (!card) return null;
    const p = document.createElement('p');
    p.id = 'result-disclaimer';
    p.className = 'result-disclaimer';
    p.textContent = DISCLAIMER_TEXT;
    card.append(p);
    return p;
  }

  /**
   * 学習サマリーの入れ物を用意する(L5)。既にあればそれを使う。
   *
   * 置き場所は内訳(#result-detail)の **直後** で、「もう一度やる」の **前**。
   * スコア→ランク→称号→内訳という「成績の並び」を割らずに、
   * 学びの話をひとかたまりで最後に足すため。
   *
   * `<details open>` を既定にする理由:
   *   閉じていると存在に気づかれず、初回の人が一度も開かないまま終わる。
   *   開いていても本文は 160px までしか伸びない(style.css)ので、
   *   「もう一度やる」を画面外へ押し出さない。
   *   読み飛ばしたい人は summary をクリック/Enter で閉じられる。
   * @returns {HTMLDetailsElement|null}
   */
  _ensureLearnEl() {
    const existing = this.el?.querySelector('#result-learn');
    if (existing) {
      this.learnSummaryEl = existing.querySelector('#result-learn-summary');
      this.learnBodyEl = existing.querySelector('.result-learn-body');
      return existing;
    }
    if (!this.detailEl?.parentNode) return null;
    const details = document.createElement('details');
    details.id = 'result-learn';
    details.className = 'result-learn';
    details.open = true;
    // 中身を組むまでは出さない(学習オフ・記録が空なら組まずにこのまま隠れ続ける)
    details.hidden = true;
    const summary = document.createElement('summary');
    summary.id = 'result-learn-summary';
    summary.className = 'result-learn-summary';
    // 閉じたままでも要約だけは伝わるよう、1行ダイジェストを summary に入れる
    summary.textContent = '学習サマリー';
    /*
     * Enter / Space をゲーム操作へ渡さない(2026-08-15 L5 の実測)。
     *
     * engine/input.js は window の keydown で Enter を BET に割り当てて
     * preventDefault するので、そのままだと <summary> の **既定動作である
     * 開閉ごと潰されて、キーボードで開け閉めできない**
     * (input.js の isFormFocused() は button / a / role="button" しか見ておらず、
     *  summary は素通りする。フォーカスが summary にある時点でゲーム操作ではない)。
     *
     * ここは stopPropagation だけに留めるのが肝で、preventDefault はしない。
     * window のハンドラへ届かなくなるだけで、開閉はブラウザ標準の動作が担う
     * (role や aria-expanded を自前で足すより、ネイティブの意味づけを壊さない)。
     * R キーなど他のキーはそのまま window まで届くので、
     * summary にフォーカスしたままでも「もう一度やる」は効く。
     */
    summary.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'Space') e.stopPropagation();
    });
    const body = document.createElement('div');
    body.className = 'result-learn-body';
    details.append(summary, body);
    this.learnSummaryEl = summary;
    this.learnBodyEl = body;
    this.detailEl.after(details);
    return details;
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
    if (this.honorEl) {
      /*
       * 称号(U56)。data/titles.js が解決済みのものを出すだけで、
       * ここで閾値を引き直したり名前を組み立てたりしない
       * (RANK の rate で「甘スロなのに通常設定の数字を名乗る」事故が起きた前例がある)。
       * note は「その称号がどういう回か」の1行。無ければ称号名だけ出す。
       */
      const honor = state.honor ?? {};
      this.honorEl.textContent = '';
      this.honorEl.hidden = !honor.label;
      if (honor.label) {
        // 「称号: Heroes」の見出しと、その意味の1行。
        // note は span に分けて小さく出す(読み上げでは続けて読まれる)
        this.honorEl.append(document.createTextNode(`称号: ${honor.label}`));
        if (honor.note) {
          const note = document.createElement('span');
          note.className = 'result-honor-note';
          note.textContent = honor.note;
          this.honorEl.append(note);
        }
        this.honorEl.style.color = honor.color ?? '#c8d2e8';
      }
    }
    if (this.sessionEl) {
      this.sessionEl.textContent = `${state.totalGames ?? 100} SPIN SCORE ATTACK`;
    }
    this._fillDetail(state);
    this._fillLearn();
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
        /*
         * 2026-08-16 検証指摘 V80-21⑩「二重カッコ」:
         * ラベル側が既に括弧を持つ明細(「AS RUSH 残り(EC2 5台)」
         * 「AURORA RUSH 残り(ACU 30)」)に、ここでもう1組の括弧を足していたので
         * 「… 残り(EC2 5台)(5G × 15枚)」と括弧が2つ並んでいた。
         * 内訳はダッシュでつないで、括弧はラベルの持ち物だけにする。
         */
        rows.push([`買い取り: ${b.label}${detail ? ` — ${detail}` : ''}`, `+${Math.round(b.coins ?? 0)} 枚`]);
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

  /**
   * 学習サマリーを組み立てる(L5)。
   *
   * 出さない条件は2つだけ:
   *   1. `?learn=off`(isLearnEnabled() === false)… 学習表示は押し付けない
   *   2. 記録がまったく無い … 空の枠が残ると「壊れている」ように見える
   * 数字はすべて data/learnlog.js が解決済みのものをそのまま出す
   * (率も件数もここでは計算し直さない)。
   */
  _fillLearn() {
    const details = this.learnEl;
    if (!details) return;

    /*
     * learnlog は「localStorage が無くても投げない」約束だが、
     * 万一投げてもリザルト全体(スコア・ランク・称号)を道連れにしない。
     * 学習は付加情報なので、読めなければ黙って畳むのが正しい振る舞い。
     */
    let data = null;
    try {
      if (isLearnEnabled()) {
        data = {
          digest: getSessionDigest(),
          stats: getQuizStats(),
          dex: getDexProgress(),
          badges: getBadges(),
        };
      }
    } catch {
      data = null;
    }
    if (!data) {
      details.hidden = true;
      return;
    }

    const services = Array.isArray(data.digest?.services) ? data.digest.services : [];
    const sessionQuiz = data.digest?.quiz ?? {};
    const stats = data.stats ?? {};
    const dex = data.dex ?? {};
    const isEmpty = services.length === 0
      && (sessionQuiz.asked ?? 0) === 0
      && (stats.asked ?? 0) === 0
      && (dex.owned ?? 0) === 0;
    if (isEmpty) {
      details.hidden = true;
      return;
    }
    details.hidden = false;
    this._fillLearnSummary(services.length, sessionQuiz, dex);
    this._fillLearnBody(services, sessionQuiz, stats, dex, data.badges);
  }

  /** summary の1行ダイジェスト(閉じていてもこれだけは読める) */
  _fillLearnSummary(seenCount, sessionQuiz, dex) {
    const el = this.learnSummaryEl;
    if (!el) return;
    const parts = [`今日 ${seenCount}件`];
    parts.push((sessionQuiz.asked ?? 0) > 0
      ? `クイズ ${sessionQuiz.correct ?? 0}問正解`
      : 'クイズ 未挑戦');
    if ((dex.total ?? 0) > 0) parts.push(`図鑑 ${dex.owned ?? 0}/${dex.total}`);
    el.textContent = `学習サマリー — ${parts.join(' / ')}`;
  }

  /** 本文(今日出会ったサービスのチップ + 成績の dl) */
  _fillLearnBody(services, sessionQuiz, stats, dex, badges) {
    const body = this.learnBodyEl;
    if (!body) return;
    body.textContent = '';

    // ── ① 今日出会ったサービス ────────────────────────────
    const head = document.createElement('p');
    head.className = 'result-learn-head';
    head.textContent = '今日出会ったサービス';
    body.append(head);

    if (services.length === 0) {
      const none = document.createElement('p');
      none.className = 'result-learn-none';
      none.textContent = '今回はまだありません(ボーナス中の豆知識カードとクイズで増えます)';
      body.append(none);
    } else {
      const ul = document.createElement('ul');
      ul.className = 'result-learn-chips';
      for (const s of services.slice(0, LEARN_CHIP_MAX)) ul.append(this._learnChip(s));
      const rest = services.length - LEARN_CHIP_MAX;
      if (rest > 0) {
        const li = document.createElement('li');
        li.className = 'result-learn-chip is-more';
        li.textContent = `ほか${rest}件`;
        ul.append(li);
      }
      body.append(ul);
    }

    // ── ② 成績・図鑑・バッジ ──────────────────────────────
    const dl = document.createElement('dl');
    dl.className = 'result-learn-dl';
    /** @type {Array<[string, string|Node, string?]>} label / 値 / 値の色 */
    const rows = [];
    rows.push(['クイズ(このセッション)', (sessionQuiz.asked ?? 0) > 0
      ? `${sessionQuiz.correct ?? 0} / ${sessionQuiz.asked} 問正解`
      : '未挑戦']);

    const totalRate = learnRateText(stats.rate);
    rows.push(['クイズ(通算)', (stats.asked ?? 0) > 0
      ? `${stats.correct ?? 0} / ${stats.asked} 問正解${totalRate ? `(正答率 ${totalRate})` : ''}`
      : '未挑戦']);

    /*
     * 苦手カテゴリは learnlog が「3問以上答えたカテゴリのうち正答率最低」を
     * 解決して返す。該当なしは null で来るので、ここでは代わりの文を出すだけ
     * (表示側で別のカテゴリを勝手に選び直さない)。
     */
    const weakest = stats.weakest;
    if (weakest?.label) {
      const rate = learnRateText(weakest.rate);
      rows.push([
        '苦手カテゴリ',
        `${weakest.label}(${weakest.correct ?? 0} / ${weakest.asked ?? 0} 問正解${rate ? ` ${rate}` : ''})`,
        weakest.color,
      ]);
    } else {
      rows.push(['苦手カテゴリ', 'まだ判定できません(同じ分野で3問以上答えると出ます)']);
    }

    const gained = dex.gainedThisSession ?? 0;
    rows.push(['AWS図鑑', `${dex.owned ?? 0} / ${dex.total ?? 0} 種${gained > 0 ? `(今回 +${gained})` : ''}`]);
    rows.push(['学習バッジ', this._learnBadgeNode(badges)]);

    for (const [label, value, color] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      if (value instanceof Node) dd.append(value);
      else dd.textContent = value;
      if (color) dd.style.color = color;
      dl.append(dt, dd);
    }
    body.append(dl);
  }

  /**
   * サービス1件のチップ。枠色はカテゴリ色(data/services.js の CATEGORIES)。
   * 色は learnlog が digest に載せて渡してくるものをそのまま当てる
   * (称号の honorEl.style.color と同じ流儀)。
   * @param {{name?:string,cat?:string,catLabel?:string,color?:string,docs?:string|null,first?:boolean}} s
   */
  _learnChip(s) {
    const li = document.createElement('li');
    li.className = 'result-learn-chip';
    if (s.cat) li.dataset.cat = s.cat;
    if (s.color) li.style.borderColor = s.color;

    /*
     * 公式ページの URL を持つものだけリンクにする。無いものはただの span。
     * 読み上げ文言を「公式ページ」にしているのは、data/services.js の
     * SERVICE_DOCS が持つのが aws.amazon.com の **製品ページ** で、
     * docs.aws.amazon.com のドキュメントではないから
     * (このリポジトリは「事実と違う表示をしない」を最優先にしている)。
     */
    const name = document.createElement(s.docs ? 'a' : 'span');
    name.className = 'result-learn-chip-name';
    name.textContent = s.name ?? '';
    if (s.docs) {
      name.href = s.docs;
      name.target = '_blank';
      name.rel = 'noopener noreferrer';
      name.setAttribute('aria-label', `${s.name} の AWS 公式ページを新しいタブで開く`);
    }
    li.append(name);

    if (s.catLabel) {
      const cat = document.createElement('span');
      cat.className = 'result-learn-chip-cat';
      cat.textContent = s.catLabel;
      if (s.color) cat.style.color = s.color;
      li.append(cat);
    }
    if (s.first) {
      // 初めて出会ったサービスだけ NEW(液晶の豆知識カードと同じ意味づけ)
      const badge = document.createElement('span');
      badge.className = 'result-learn-chip-new';
      badge.textContent = 'NEW';
      li.append(badge);
    }
    return li;
  }

  /**
   * 学習バッジの行(P2)。learnlog の getBadges() が返すものを並べるだけで、
   * ここで到達条件を判定し直さない。
   *
   * 学習バッジは data/titles.js の称号7種(Certified / Jr. Champions /
   * Community Builders / All Certifications Engineers / Top Engineers /
   * Ambassadors / Heroes)とは **別枠** で、名前も被らせない約束。
   * 混ざるとスコアの称号と学習の段位が見分けられなくなるため。
   * @param {Array<{id?:string,label?:string,note?:string,earned?:boolean}>} badges
   * @returns {Node}
   */
  _learnBadgeNode(badges) {
    const earned = Array.isArray(badges) ? badges.filter((b) => b?.earned && b?.label) : [];
    if (earned.length === 0) {
      const none = document.createElement('span');
      none.className = 'result-learn-badge-none';
      none.textContent = 'まだありません';
      return none;
    }
    const wrap = document.createElement('span');
    wrap.className = 'result-learn-badges';
    /*
     * 見た目はピルの横並びだが、読み上げでは「図鑑ブロンズ図鑑シルバー」と
     * 続けて読まれてしまうので、リストとして読ませる(dd の中なので ul は使わない)。
     */
    wrap.setAttribute('role', 'list');
    for (const b of earned) {
      const pill = document.createElement('span');
      pill.className = 'result-learn-badge';
      pill.setAttribute('role', 'listitem');
      pill.textContent = b.label;
      if (b.note) {
        // note は到達条件の1行。狭いので本文には出さず、読み上げと
        // ホバーの補助テキストとして持たせる
        pill.title = b.note;
        pill.setAttribute('aria-label', `${b.label}: ${b.note}`);
      }
      wrap.append(pill);
    }
    return wrap;
  }
}
