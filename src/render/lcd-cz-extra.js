/**
 * 新CZ4種(2026-08-14)の液晶描画。lcd.js の _drawCz から呼ばれる。
 *
 *   drawCzAlb       … ALB ターゲットグループCZ(ui:'alb')
 *   drawCzDlq       … SQS デッドレター再処理CZ(ui:'dlq')
 *   drawCzBlueGreen … CodeDeploy Blue/Green CZ(ui:'bluegreen')
 *   drawCzFis       … GameDay CZ(FIS 障害注入)(ui:'fis')
 *
 * ── 契約(既存 _drawCzSfn と同じ)──
 *  1. **state だけ見れば描ける**。ゲーム側の実装を知らなくてよい
 *  2. state が未実装/欠けていても落ちない(すべて ?? でフォールバックする)
 *  3. textActive(演出テキスト帯が出ている)の間は行間を詰めて常設ラベルを伏せる
 *     (しおん指摘 S10。帯と常設文字が重なって両方読めなくなるのを防ぐ)
 *
 * ── 液晶の座席割り(440 x 300)──
 *   y   0〜 34 … タイトルバー(モード名 / 残りG)
 *   y  34〜176 … 盤面。ここに主役を置く
 *   y 178〜230 … lcd.text(演出テキスト帯)と取り合いになるので **文字を置かない**
 *   y 232〜262 … 結論の1行(HTTP 200 / QUEUE EMPTY など)
 *   y 266〜300 … **CZ 共通の目標行**(lcd.js の _drawCz が「目標 + 期待度 + 補足」を出す)。
 *                2026-08-15 U66-5 で説明テロップ帯を廃止した跡地。各CZ盤面はここに書かない
 *
 * @typedef {import('./lcd.js').LcdView} LcdView
 */

const FONT = '"Helvetica Neue", "Hiragino Sans", "Noto Sans JP", sans-serif';
const FONT_HEAVY = '"Arial Black", "Helvetica Neue", "Hiragino Sans", sans-serif';

/** 結論の1行を置く高さ(テキスト帯とテロップ帯のあいだ) */
const SUMMARY_Y = 246;

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * 障害カードの短縮名(2026-08-16 検証指摘 V80-21③)。
 *
 * GameDay CZ(FIS)の障害名は 5枚並ぶとカード幅が 58px しかなく、
 * 「レイテンシ…」「インスタン…」「API スロッ…」「DB フェイル…」と
 * **4枚が省略記号だけ** になっていた(何の障害か読めない)。
 * Shield の波は data 側に short があるので、無いものだけここで補う。
 * 意味を変えない範囲で「正式名 → 現場で通じる短い呼び方」へ寄せてある:
 *   インスタンス終了     … FIS が終了させるのは EC2 インスタンス
 *   API スロットリング   … スロットリング = 呼び出し制限
 *   DB フェイルオーバー  … フェイルオーバー = 切替
 */
const FAULT_SHORT = {
  'AZ-a 停止': 'AZ-a停止',
  'レイテンシ注入': 'レイテンシ',
  'インスタンス終了': 'EC2終了',
  'API スロットリング': 'API制限',
  'DB フェイルオーバー': 'DB切替',
};

/** 幅に収まるまで末尾を詰める */
function fitText(ctx, text, maxW) {
  let s = String(text ?? '');
  while (s.length > 2 && ctx.measureText(s).width > maxW) s = `${s.slice(0, -2)}…`;
  return s;
}

/**
 * 結論の1行(演出テキスト帯が出ている間は黙る)。
 *
 * 2026-08-14 検証指摘 V21-03(U8): この行は **常設の状態表示** なので、
 * 出したことを申告して同じ文言がテロップにも出ないようにする。
 * 申告は「実際に描いたときだけ」の約束なので、textActive の早期 return より後に置く。
 * カテゴリ判定は使わない(結論行は長い文なので、たまたま同カテゴリの語を含んだだけで
 * 別の告知まで巻き添えで消えてしまうため)。
 */
function drawSummary(ctx, view, textActive, text, color) {
  if (textActive) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 17px ${FONT_HEAVY}`;
  ctx.fillStyle = color;
  /*
   * 2026-08-16 検証指摘 V80-18: 結論行は横に長く(「HTTP 200 DEGRADED —
   * HEALTHY 1/3」等)、中央寄せだと右端の常設キャラまで文字が伸びていた。
   * CZ 盤面と同じ「キャラのレーンを空ける」約束に合わせて、
   * 中心も最大幅もレーンの手前で閉じる。
   */
  const cx = view?.czBoardCx ?? view.w / 2;
  const maxW = (view?.czBoardW ?? view.w) - 16;
  ctx.fillText(text, cx, SUMMARY_Y, maxW);
  view?._ambient?.(text, { matchCategory: false });
}

// ── ALB ターゲットグループCZ ────────────────────────

/**
 * リスナー → ターゲットグループ → 3台のターゲット。
 * 全台 healthy で HTTP 200、unhealthy が残れば 503。
 */
export function drawCzAlb(ctx, state, textActive, view) {
  const targets = Array.isArray(state?.targets) ? state.targets : [];
  const needed = state?.healthyNeeded ?? Math.max(1, targets.length);
  const healthy = state?.healthy ?? targets.filter((t) => t?.status === 'healthy').length;
  const status = state?.httpStatus ?? 503;
  const rule = state?.rule ?? state?.rules?.[0] ?? '/*';
  const ok = healthy >= needed;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // ── リスナー(適用中のルール)──
  const lw = 210;
  const lx = view.czBoardCx - lw / 2;
  const ly = textActive ? 38 : 44;
  roundRect(ctx, lx, ly, lw, 24, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(138,212,255,0.8)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = '#8ad4ff';
  ctx.fillText(`LISTENER  ${rule}`, view.czBoardCx, ly + 12);

  // ── ターゲットグループの3台 ──
  const top = ly + 34;
  const cardH = textActive ? 78 : 86;
  const gap = 12;
  const cardW = Math.min(112, (view.czBoardW - 24 - gap * 2) / Math.max(1, targets.length));
  const totalW = targets.length * cardW + (targets.length - 1) * gap;
  const startX = view.czBoardCx - totalW / 2;

  targets.forEach((t, i) => {
    const x = startX + i * (cardW + gap);
    const st = t?.status ?? 'unhealthy';
    const col = st === 'healthy' ? '#4ce0a0' : st === 'checking' ? '#ffd166' : '#ff5a5a';

    // ルーティングの矢印(リスナーから今回の宛先へ)
    if (state?.routedTo === t?.name && !ok) {
      ctx.strokeStyle = 'rgba(138,212,255,0.55)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(view.czBoardCx, ly + 24);
      ctx.lineTo(x + cardW / 2, top);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    roundRect(ctx, x, top, cardW, cardH, 8);
    ctx.fillStyle = st === 'healthy' ? 'rgba(60,200,140,0.16)' : 'rgba(0,0,0,0.36)';
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // 状態ランプ
    ctx.beginPath();
    ctx.arc(x + cardW / 2, top + 20, 8, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = st === 'healthy' ? 14 : st === 'checking' ? 8 : 0;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = `700 10px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText(fitText(ctx, t?.name ?? `target ${i + 1}`, cardW - 8), x + cardW / 2, top + 40);

    ctx.font = `700 10px ${FONT}`;
    ctx.fillStyle = col;
    ctx.fillText(st.toUpperCase(), x + cardW / 2, top + 56);

    // ヘルスチェックの連続成功数
    const need = Math.max(1, t?.need ?? 2);
    const passes = Math.min(need, t?.passes ?? 0);
    view._drawGauge(ctx, x + 12, top + cardH - 16, cardW - 24, 6, passes / need,
      st === 'healthy' ? ['#1c5a7a', '#4ce0a0'] : ['#5a4a1c', '#ffd166']);
  });

  /* ── 結論の1行 ──
   * 2026-08-14: healthy が1台でも残っていれば ALB は 200 を返し、
   * ただし全台ではないので **一部ターゲット障害(degraded)** になる
   * (0台のときだけ 503)。state.degraded はゲーム側(game/modes/cz.js)が立てる。
   * 「200 なのに赤字で失敗」に見えないよう、degraded は黄色で書く。 */
  const degraded = Boolean(state?.degraded) && healthy > 0;
  drawSummary(
    ctx, view, textActive,
    ok ? `HTTP ${status} OK — HEALTHY ${healthy}/${needed}`
      : degraded
        ? `HTTP ${status} DEGRADED — HEALTHY ${healthy}/${needed}`
        : `HTTP ${status} — HEALTHY ${healthy}/${needed}`,
    ok ? '#4ce0a0' : degraded ? '#ffd166' : '#ff8a8a',
  );
}

// ── SQS デッドレター再処理CZ ────────────────────────

/**
 * DLQ の滞留メッセージを減らしていくカウントダウン。
 * 残0通(QUEUE EMPTY)で突破。
 */
export function drawCzDlq(ctx, state, textActive, view) {
  const total = Math.max(1, Math.round(state?.messagesTotal ?? 8));
  const left = Math.max(0, Math.round(state?.messages ?? total));
  const drained = Boolean(state?.drained) || left === 0;
  const maxReceive = Math.max(1, Math.round(state?.maxReceiveCount ?? 3));
  const receive = Math.min(maxReceive, Math.round(state?.receiveCount ?? 1));
  const over = Boolean(state?.overLimit);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // ── 左: キューに積まれたメッセージ ──
  const cols = 2;
  const chipW = 74;
  const chipH = 18;
  const gapX = 10;
  const gapY = 8;
  const rows = Math.ceil(total / cols);
  const qx = 34;
  const qy = textActive ? 44 : 52;
  const boxW = cols * chipW + (cols - 1) * gapX + 20;
  const boxH = rows * chipH + (rows - 1) * gapY + 20;

  roundRect(ctx, qx - 10, qy - 10, boxW, boxH, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  for (let i = 0; i < total; i++) {
    const cx = qx + (i % cols) * (chipW + gapX);
    const cy = qy + Math.floor(i / cols) * (chipH + gapY);
    const alive = i < left;
    roundRect(ctx, cx, cy, chipW, chipH, 4);
    if (alive) {
      const g = ctx.createLinearGradient(cx, cy, cx + chipW, cy);
      g.addColorStop(0, '#ff8a5a');
      g.addColorStop(1, '#ff5a5a');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,240,190,0.35)';
    }
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.font = `700 9px ${FONT}`;
    ctx.fillStyle = alive ? 'rgba(40,10,0,0.9)' : 'rgba(255,255,255,0.28)';
    ctx.fillText(`msg-${String(i + 1).padStart(2, '0')}`, cx + chipW / 2, cy + chipH / 2);
  }

  // ── 右: 残数の大きな数字 ──
  const rx = qx + boxW + 46;
  const ry = qy + 44;
  ctx.font = `900 54px ${FONT_HEAVY}`;
  ctx.fillStyle = drained ? '#4ce0a0' : '#ffd166';
  ctx.fillText(String(left), rx, ry);
  if (!textActive) {
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('通 残っている', rx, ry + 34);
    ctx.font = `600 10px ${FONT}`;
    ctx.fillStyle = over ? '#ff8a8a' : 'rgba(255,255,255,0.5)';
    ctx.fillText(`ReceiveCount ${receive} / ${maxReceive}`, rx, ry + 52);
  }

  drawSummary(
    ctx, view, textActive,
    drained ? 'QUEUE EMPTY' : over ? 'BACK TO DLQ' : `再処理中… 残り ${left} 通`,
    drained ? '#4ce0a0' : over ? '#ff8a8a' : '#ffffff',
  );
}

// ── CodeDeploy Blue/Green CZ ───────────────────────

/**
 * Blue から Green へトラフィックを段階的にシフトする。
 * 100% 到達で DEPLOYMENT SUCCEEDED、失敗は自動ロールバックで 0% へ戻る。
 */
export function drawCzBlueGreen(ctx, state, textActive, view) {
  // 既定は Linear 20%(等間隔)。CodeDeploy は段ごとに刻み幅を変えられないので
  // 不等間隔の目盛りは作らない(2026-08-14 F2。正は data/modes.js の shiftSteps)
  const steps = Array.isArray(state?.shiftSteps) && state.shiftSteps.length > 0
    ? state.shiftSteps : [20, 40, 60, 80, 100];
  const shift = Math.max(0, Math.min(100, Math.round(state?.shift ?? 0)));
  const rolledBack = Boolean(state?.rolledBack);
  const deployed = Boolean(state?.deployed) || shift >= 100;
  const errorRate = Number(state?.errorRate ?? 0);
  const threshold = Number(state?.errorThreshold ?? 5);
  const overThreshold = errorRate > threshold;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // ── Blue / Green の2枚 ──
  const boxW = 150;
  const boxH = textActive ? 56 : 64;
  const y = textActive ? 40 : 48;
  const boxes = [
    { label: 'BLUE(現行)', pct: 100 - shift, col: '#5aa8ff', x: view.czBoardCx - boxW - 8 },
    { label: 'GREEN(新)', pct: shift, col: '#4ce0a0', x: view.czBoardCx + 8 },
  ];
  for (const b of boxes) {
    roundRect(ctx, b.x, y, boxW, boxH, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.fill();
    ctx.strokeStyle = b.col;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.font = `700 11px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(b.label, b.x + boxW / 2, y + 16);
    ctx.font = `900 22px ${FONT_HEAVY}`;
    ctx.fillStyle = b.col;
    ctx.fillText(`${b.pct}%`, b.x + boxW / 2, y + boxH - 22);
  }

  /* ── シフトバー(U16: 液晶の中央に置き、真下に「CodeDeploy」と明示する)──
   *
   * 2026-08-14 ユーザー指摘 U16「デプロイのメーターが中央にない」。
   * 盤面のバー自体は元から左右対称だったが、
   *   1. 同じ意味のメーターを演出側(lcdanims-extra.js の deploy_progress)も
   *      x118〜424 という左寄りの位置に重ねて描いていた(そちらが中央から外れて見えていた)
   *   2. このバーが「何のメーターか」を画面が名乗っていなかった
   * の2点が原因。1 は data/scenarios/cz.js から deploy_progress を外して盤面へ一本化し
   * (U17 の二重表示解消も兼ねる)、2 はここでラベルを出す。
   *
   * 縦位置は「盤面 y34〜176」に収める:
   *   バー 124〜138 / 目盛り数字と CodeDeploy 150 / エラー率 168
   *
   * 2026-08-14 検証指摘 V21-08:
   *   「CodeDeploy」を目盛りの1段下・中央寄せで置いていたため、
   *   中央の目盛り(60 = x254)と 14px しか離れておらず重なって見えていた。
   *   メーターの名前は **左端の列へ寄せ、目盛りと同じ行に置く**。
   *   目盛りの数字は x110〜400 にしか出ないので列が競合せず、
   *   空いた1行ぶんエラー率を上げられて盤面(〜176)にも収まる。
   */
  const bx = 40;
  const bw = view.czBoardW - 80;
  const by = y + boxH + 12;
  view._drawGauge(ctx, bx, by, bw, 14, shift / 100,
    rolledBack ? ['#7a1c1c', '#ff5a5a'] : ['#1c5a7a', '#4ce0a0']);

  // 段階の目盛り(U39: 9px → 10px。数字2桁なので隣の目盛り(68px間隔)とは干渉しない)
  ctx.font = `700 10px ${FONT}`;
  steps.forEach((s, i) => {
    const x = bx + bw * (s / 100);
    const passed = shift >= s && !rolledBack;
    ctx.strokeStyle = passed ? 'rgba(124,247,208,0.9)' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, by - 4);
    ctx.lineTo(x, by + 18);
    ctx.stroke();
    ctx.fillStyle = passed ? 'rgba(124,247,208,0.9)' : 'rgba(255,255,255,0.4)';
    ctx.fillText(`${s}`, x, by + 26);
    if (state?.failedStep === i + 1 && rolledBack) {
      ctx.fillStyle = '#ff5a5a';
      ctx.fillText('▲', x, by - 12);
    }
  });

  // ── メーターの名前(これが何のメーターかを画面が名乗る)──
  // 目盛りの数字(x110〜400)と列が重ならないよう、左端へ寄せて同じ行に置く(V21-08)
  ctx.textAlign = 'left';
  ctx.font = `900 12px ${FONT_HEAVY}`;
  ctx.fillStyle = 'rgba(138,212,255,0.92)';
  ctx.fillText('CodeDeploy', 12, by + 26);
  ctx.textAlign = 'center';

  // ── エラー率 ──
  if (!textActive) {
    ctx.font = `700 11px ${FONT}`;
    ctx.fillStyle = overThreshold ? '#ff8a8a' : 'rgba(255,255,255,0.68)';
    ctx.fillText(
      `ERROR RATE ${errorRate.toFixed(1)}%  /  ALARM しきい値 ${threshold}%`,
      view.czBoardCx, by + 44, view.czBoardW - 16,
    );
  }

  drawSummary(
    ctx, view, textActive,
    deployed ? 'DEPLOYMENT SUCCEEDED' : rolledBack ? 'ROLLED BACK' : `SHIFTING ${shift}%`,
    deployed ? '#4ce0a0' : rolledBack ? '#ff8a8a' : '#ffffff',
  );
}

// ── GameDay CZ(FIS 障害注入)──────────────────────

/**
 * 注入される障害に耐えるあいだ、エラーバジェットが削られていく。
 * 全部耐え切れば RESILIENT、尽きたら SLO 違反。
 */
export function drawCzFis(ctx, state, textActive, view) {
  const faults = Array.isArray(state?.faults) ? state.faults : [];
  const total = Math.max(1, faults.length);
  const survived = Math.max(0, Math.min(total, Math.round(state?.survived ?? 0)));
  const budgetInit = Math.max(1, Number(state?.budgetInit ?? 100));
  const budget = Math.max(0, Math.min(budgetInit, Number(state?.budget ?? budgetInit)));
  const broken = Boolean(state?.broken) || budget <= 0;
  const cleared = survived >= total && !broken;
  const p = budget / budgetInit;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // ── エラーバジェット ──
  const bx = 40;
  const bw = view.czBoardW - 80;
  const by = textActive ? 42 : 50;
  view._drawGauge(ctx, bx, by, bw, 16, p,
    broken ? ['#7a1c1c', '#ff5a5a'] : p < 0.35 ? ['#7a4a1c', '#ffd166'] : ['#1c5a7a', '#4ce0a0']);
  ctx.font = `900 14px ${FONT_HEAVY}`;
  ctx.fillStyle = broken ? '#ff5a5a' : p < 0.35 ? '#ffd166' : '#7bf7d0';
  ctx.fillText(`ERROR BUDGET ${Math.round(budget)}%`, view.czBoardCx, by + 32);

  // ── 注入される障害 ──
  const top = by + 50;
  const gap = 8;
  const cardW = Math.min(78, (view.czBoardW - 24 - gap * (total - 1)) / total);
  const cardH = textActive ? 56 : 64;
  const startX = view.czBoardCx - (total * cardW + (total - 1) * gap) / 2;

  faults.forEach((f, i) => {
    const x = startX + i * (cardW + gap);
    const st = f?.status ?? 'pending';
    const col = st === 'survived' ? '#4ce0a0' : st === 'broken' ? '#ff5a5a' : 'rgba(255,255,255,0.28)';
    const current = i === survived && !cleared && !broken;

    roundRect(ctx, x, top, cardW, cardH, 6);
    ctx.fillStyle = st === 'survived' ? 'rgba(60,200,140,0.14)'
      : st === 'broken' ? 'rgba(220,60,60,0.18)' : 'rgba(0,0,0,0.34)';
    ctx.fill();
    ctx.strokeStyle = current
      ? `rgba(255,224,102,${0.5 + 0.5 * Math.sin(view.t * 8)})`
      : col;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 障害アイコン(耐えた=盾 / 折れた=×)
    ctx.font = `900 15px ${FONT_HEAVY}`;
    ctx.fillStyle = col;
    ctx.fillText(st === 'survived' ? '◆' : st === 'broken' ? '✕' : '⚡', x + cardW / 2, top + 18);

    /*
     * 障害名(2行に折らず詰める)。U39: 9px → 10px(fitText がカード幅まで詰める)
     *
     * 2026-08-15 検証指摘: Shield は波が6枚並ぶのでカード幅が 61px しかなく、
     * 正式名だと「SYN フラ…」「DNS クエ…」と全部省略されて読めなかった。
     * **カードに入りきるなら正式名、入らないなら short(短縮名)** の順で選ぶ。
     * short を持たない spec(GameDay など)は今までどおり name のまま。
     */
    ctx.fillStyle = st === 'pending' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.88)';
    const full = String(f?.name ?? `fault ${i + 1}`);
    /*
     * game/modes/cz.js は short を持たない spec に `short = name` を入れて渡してくる
     * ので、「short があるか」では短縮名の有無を判定できない(V80-21③)。
     * 名前と違うときだけ data 側の短縮名、そうでなければ表示側の表を引く。
     */
    const dataShort = f?.short && f.short !== full ? String(f.short) : null;
    const short = String(dataShort ?? FAULT_SHORT[full] ?? full);
    /*
     * 収まり方の優先順は「正式名 > 短縮名 > 1段小さい文字」(V80-21③)。
     * Shield は波が6枚並んでカード幅が 47px しかないので、10px 固定だと
     * 短縮名(UDP増幅 / Slowloris)まで「…」で切れてしまう。
     * 画面の下限 8px までは落として、切るより読ませることを優先する。
     */
    let nameSize = 10;
    let label = full;
    ctx.font = `700 ${nameSize}px ${FONT}`;
    if (ctx.measureText(full).width > cardW - 6) {
      label = short;
      while (nameSize > 8 && ctx.measureText(label).width > cardW - 6) {
        nameSize -= 1;
        ctx.font = `700 ${nameSize}px ${FONT}`;
      }
    }
    ctx.fillText(fitText(ctx, label, cardW - 6), x + cardW / 2, top + 38);

    if (!textActive) {
      // U39: 8px → 10px。最長の 'SURVIVED' でもカード幅(最大78px)に収まる
      ctx.font = `700 10px ${FONT}`;
      ctx.fillStyle = col;
      ctx.fillText(
        st === 'survived' ? 'SURVIVED' : st === 'broken' ? 'SLO NG' : 'PENDING',
        x + cardW / 2, top + cardH - 10,
      );
    }
  });

  drawSummary(
    ctx, view, textActive,
    cleared ? 'RESILIENT' : broken ? 'SLO VIOLATION' : `SURVIVED ${survived} / ${total}`,
    cleared ? '#4ce0a0' : broken ? '#ff8a8a' : '#ffffff',
  );
}
