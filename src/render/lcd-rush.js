/**
 * RUSH 4種(U11 / 2026-08-14)の液晶描画。lcd.js の _drawUi から呼ばれる。
 *
 *   drawAsRush     … オートスケーリングRUSH(EC2の台数 = 残りゲーム数)
 *   drawCfRush     … CloudFront RUSH(エッジで直接払い出し)
 *   drawAuroraRush … Aurora RUSH(ACU = 純増が伸びる)
 *   drawHeroRush   … ヒーローRUSH(5G固定・毎ゲームの抽選で当選)
 *                    ※ 当選率と枚数の説明文は data/rushes.js の heroHitLabel() が正
 *                      (U40 で 100 → 50 / U50 で 1/2 → 80% × 70枚。数字を書き写さないこと)
 *
 * ── 描き分けの方針(ユーザー指示「何のゾーンで何が起きたか一目で」)──
 *   4種とも **画面の主役を「伸びる軸」そのもの** にする:
 *     AS      … EC2アイコンの列(1台 = 1ゲーム)が主役。増えた瞬間が分かる
 *     CF      … 飛んできた枚数の大きい数字と、光ったエッジロケーション
 *     Aurora  … ACU(純増)の大きい数字とゲージ
 *     HERO    … 5つの枠が1つずつ確定していく(当たれば金、外れれば暗い)
 *
 * ── 契約(lcd-cz-extra.js と同じ)──
 *  1. **state だけ見れば描ける**(ゲーム側の実装を知らない)
 *  2. state が欠けていても落ちない(すべて ?? でフォールバック)
 *  3. textActive(演出テキスト帯が出ている)の間は常設ラベルを伏せる
 *  4. 表示原則 U8: ここは「持続する状態」担当。瞬間の告知はポップアップ側に任せ、
 *     同じ文言を二重に出さない
 *
 * ── 液晶の座席割り(440 x 300)──
 *   y   0〜 34 … タイトルバー(モード名 / 残りG)
 *   y  34〜176 … 盤面
 *   y 178〜230 … lcd.text(演出テキスト帯)と取り合いになるので文字を置かない
 *   y 232〜262 … 結論・合計の1行
 *   y 266〜300 … **遊び方の常設行**(view._drawRuleLine)。
 *                2026-08-15 U66-5 で説明テロップ帯を廃止した跡地。
 *                4種とも「このRUSHで何が起きると伸びるか」をここに1行だけ置く
 *                (旧実装は y176 に置いていたので、ポップアップが出るたびに消えていた)
 */

import { RUSH_SPEC_BY_ID, heroHitLabel } from '../data/rushes.js';

const FONT = '"Helvetica Neue", "Hiragino Sans", "Noto Sans JP", sans-serif';
const FONT_HEAVY = '"Arial Black", "Helvetica Neue", "Hiragino Sans", sans-serif';

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

/** 縁取り付きの大文字(背景画像の上でも沈まないようにする) */
function heavyText(ctx, text, x, y, size, fill, stroke = 'rgba(8,10,20,0.92)') {
  ctx.font = `900 ${size}px ${FONT_HEAVY}`;
  ctx.lineWidth = Math.max(4, size * 0.18);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/**
 * 結論行の下敷き(2026-08-14 検証指摘 V21-09)。
 *
 * この行(y232〜262)は **キャラより後**に描かれるが、キャラの絵の上に
 * 直接文字を置くと輪郭と噛み合って読めなくなっていた。
 * キャラの定位置は render/chars/index.js 側で結論行から退かしたうえで、
 * ここでも座布団を敷いて二重に守る(モーションで一時的に被っても読める)。
 * @param {number} x 左端X / @param {number} w 幅
 */
function footerPlate(ctx, x, w) {
  roundRect(ctx, x, 230, w, 28, 8);
  ctx.fillStyle = 'rgba(4,8,18,0.72)';
  ctx.fill();
}

/** 左下の1行(RUSHごとの進捗)。座布団つきで必ず読ませる */
function drawFooterLeft(ctx, text, color) {
  ctx.font = `900 15px ${FONT_HEAVY}`;
  const w = Math.max(96, (ctx.measureText?.(text)?.width ?? 96) + 20);
  footerPlate(ctx, 10, w);
  ctx.textAlign = 'left';
  ctx.font = `900 15px ${FONT_HEAVY}`;
  ctx.fillStyle = color;
  ctx.fillText(text, 20, 244);
  ctx.textAlign = 'center';
}

/** 右下の合計獲得枚数(4種で位置と書式をそろえる = 見る場所が変わらない) */
function drawGained(ctx, state, view) {
  const text = `+${Math.floor(state?.gained ?? 0)} 枚`;
  ctx.font = `900 20px ${FONT_HEAVY}`;
  const w = Math.max(90, (ctx.measureText?.(text)?.width ?? 90) + 22);
  footerPlate(ctx, view.w - 10 - w, w);
  ctx.textAlign = 'right';
  ctx.font = `900 20px ${FONT_HEAVY}`;
  ctx.fillStyle = '#ffe066';
  ctx.fillText(text, view.w - 20, 244);
  ctx.textAlign = 'center';
}

// ── ① オートスケーリングRUSH ────────────────────

const AS = RUSH_SPEC_BY_ID.AS_RUSH;

/**
 * EC2の台数がそのまま残りゲーム数。
 * アイコンは iconMax 台まで並べ、それを超えたら「× n」で数字表示に切り替える
 * (上乗せが伸びるほどアイコンが潰れて読めなくなるのを防ぐ)。
 *
 * 2026-08-14 修正: アイコン列が描くのは **残りゲーム数(= 現在の台数)**。
 * ゲーム側で units === remaining を保証している(game/modes/asrush.js の不変条件)が、
 * ここでも remaining を優先して読み、万一ズレても「見出しと数字が食い違う」ことがないようにする。
 * 「どこまで伸ばしたか」は peakUnits(最大同時台数)と addedUnits(上乗せ合計)で脇に出す。
 */
export function drawAsRush(ctx, state, textActive, view) {
  const units = Math.max(0, Math.round(state?.remaining ?? state?.units ?? 0));
  const added = state?.addedUnits ?? 0;
  const lastScaleOut = Math.max(0, Math.round(state?.lastScaleOut ?? 0));
  const peak = Math.max(units, Math.round(state?.peakUnits ?? 0));
  const iconMax = AS.iconMax ?? 12;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText('EC2 INSTANCES  =  残りゲーム数', view.w / 2, 52);

  // ── インスタンスのアイコン列(6台で折り返す)──
  const shown = Math.min(units, iconMax);
  const rows = Math.max(1, Math.ceil(shown / 6));
  /*
   * 2026-08-15 検証指摘 B4: 7台目で2行に折り返した瞬間、アイコン列が下へ伸びて
   * 大きい台数表示(y150)が押し下げられ、純増ラベル(y176)と重なっていた。
   * 2行のときはアイコンを少し詰めて **大きい数字の位置を動かさない**
   * (座席割りの「盤面 y34〜176」に収める)。
   */
  const twoRows = rows >= 2;
  const iconW = 44;
  const iconH = twoRows ? 24 : 30;
  const gap = twoRows ? 6 : 8;
  const startY = twoRows ? 64 : 70;
  for (let i = 0; i < shown; i++) {
    const row = Math.floor(i / 6);
    const inRow = Math.min(6, shown - row * 6);
    const rowW = inRow * iconW + (inRow - 1) * gap;
    const x = (view.w - rowW) / 2 + (i % 6) * (iconW + gap);
    const y = startY + row * (iconH + gap);
    // 直近のオートスケールで増えたぶん(右側)を明るく光らせる = 「増えた瞬間」が分かる
    // (累計 addedUnits で光らせると常に全台が光ってしまい意味を失う)
    const fresh = lastScaleOut > 0 && i >= shown - Math.min(lastScaleOut, shown);
    /*
     * U31(2026-08-14): 増えたばかりの台は **脈打たせて** ひときわ目立たせる。
     * 告知そのもの(大文字「スケールアウト!!」)は staging 側の scale_out_slam が担当し、
     * こちらは告知が消えたあとも「このゲームで増えた台」を指し示し続ける役。
     */
    if (fresh) {
      const k = 0.55 + 0.45 * Math.sin(view.t * 9 + i);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cx = x + iconW / 2;
      const cy = y + iconH / 2;
      const r = iconW * 0.9;
      const rg = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
      rg.addColorStop(0, `rgba(180,255,230,${0.5 * k})`);
      rg.addColorStop(1, 'rgba(123,247,208,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    roundRect(ctx, x, y, iconW, iconH, 5);
    const g = ctx.createLinearGradient(x, y, x, y + iconH);
    g.addColorStop(0, fresh ? '#e6fff6' : '#7bf7d0');
    g.addColorStop(1, fresh ? '#25d3ac' : '#12a08a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = fresh ? '#ffffff' : 'rgba(255,255,255,0.8)';
    ctx.lineWidth = fresh ? 2.6 : 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,40,35,0.75)';
    ctx.fillRect(x + 9, y + 10, iconW - 18, 3);
    ctx.fillRect(x + 9, y + 17, iconW - 18, 3);
  }

  const listBottom = startY + rows * (iconH + gap);
  if (units > iconMax) {
    // アイコンの上限を超えたぶんの注記。真下の大きい数字に食い込まない高さに置く
    ctx.font = `900 13px ${FONT_HEAVY}`;
    ctx.fillStyle = '#7bf7d0';
    ctx.fillText(`× ${units} 台`, view.w / 2, listBottom + 2);
  }

  // ── 台数(= 残りゲーム数)の大きい数字 ──
  const bigY = Math.max(listBottom + 22, 150);
  const bigText = `${units} 台`;
  /*
   * 2026-08-15 検証指摘 B4: 脇の「最大 n 台」を固定オフセット(+46px)で置いていたため、
   * 台数が2桁になると中央の大きい数字に重なっていた。
   * **大きい数字の実測幅**を見て退避先を決める(桁が増えても被らない)。
   */
  ctx.font = `900 30px ${FONT_HEAVY}`;
  const bigW = ctx.measureText?.(bigText)?.width ?? 76;
  heavyText(ctx, bigText, view.w / 2, bigY, 30, '#7bf7d0');
  // 「どこまで伸ばしたか」は最大同時台数で見せる(主役の数字を汚さないよう脇に小さく)
  if (peak > units) {
    const peakText = `最大 ${peak} 台`;
    ctx.font = `700 11px ${FONT}`;
    const peakW = ctx.measureText?.(peakText)?.width ?? 56;
    const pad = 10;
    const right = view.w / 2 + bigW / 2 + pad;      // 大きい数字の右隣
    const left = view.w / 2 - bigW / 2 - pad - peakW; // 入らなければ左隣
    ctx.fillStyle = 'rgba(155,255,216,0.75)';
    if (right + peakW <= view.w - 10) {
      ctx.textAlign = 'left';
      ctx.fillText(peakText, right, bigY + 2);
      ctx.textAlign = 'center';
    } else if (left >= 10) {
      ctx.textAlign = 'left';
      ctx.fillText(peakText, left, bigY + 2);
      ctx.textAlign = 'center';
    } else {
      // 左右どちらにも置けない桁数のときだけ真下の行へ逃がす
      ctx.fillText(peakText, view.w / 2, bigY + 22);
    }
  }

  // 上乗せ合計は「このRUSHでどれだけ伸ばせたか」= 持続する状態情報
  drawFooterLeft(ctx, `上乗せ +${added} G`, added > 0 ? '#9affd8' : 'rgba(255,255,255,0.55)');
  drawGained(ctx, state, view);
  // 遊び方(持続情報)は旧テロップ帯の跡地へ。帯が出ても消えない(U66-5)
  view._drawRuleLine(
    ctx,
    `純増 ${state?.netPerGame ?? AS.payoutPerGame} 枚/G 固定 — レア役でオートスケール(EC2 が増える)`,
    { color: '#ffd75e' },
  );
}

// ── ② CloudFront RUSH ────────────────────────

const CF = RUSH_SPEC_BY_ID.CF_RUSH;

/** エッジロケーションが順に光り、ヒットした枚数がドンと出る */
export function drawCfRush(ctx, state, textActive, view) {
  const edges = CF.edges;
  const current = state?.edge ?? edges[0];
  const last = state?.lastCoin ?? 0;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText('EDGE LOCATIONS', view.w / 2, 50);

  // ── エッジの並び(現在地が光る)──
  const cols = 6;
  const cw = 58;
  const chH = 22;
  const gap = 6;
  for (let i = 0; i < edges.length; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const rowW = cols * cw + (cols - 1) * gap;
    const x = (view.w - rowW) / 2 + col * (cw + gap);
    const y = 66 + row * (chH + gap);
    const on = edges[i] === current;
    roundRect(ctx, x, y, cw, chH, 6);
    ctx.fillStyle = on ? 'rgba(79,123,240,0.9)' : 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = on ? '#cfe0ff' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = on ? 2 : 1;
    ctx.stroke();
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = on ? '#ffffff' : 'rgba(255,255,255,0.45)';
    ctx.fillText(edges[i], x + cw / 2, y + chH / 2 + 1);
  }

  // ── 直近の払い出し(このゾーンの主役)──
  if (last > 0) {
    const pulse = 1 + Math.sin(view.t * 9) * 0.04;
    ctx.save();
    ctx.translate(view.w / 2, 150);
    ctx.scale(pulse, pulse);
    heavyText(ctx, `+${last}`, 0, 0, 44, '#ffe066');
    ctx.restore();
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = '#cfe0ff';
    ctx.fillText('CACHE HIT', view.w / 2, 176);
  } else {
    heavyText(ctx, 'MISS', view.w / 2, 150, 30, 'rgba(255,255,255,0.5)');
    if (!textActive) {
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('オリジンへ問い合わせ中…', view.w / 2, 176);
    }
  }

  drawFooterLeft(ctx, `HIT ${state?.hits ?? 0} / ${state?.playedGames ?? 0} G`, '#8fb4ff');
  drawGained(ctx, state, view);
  /*
   * 遊び方の常設行(U66-5 の移行先)。
   * 旧実装ではモード入場時のテロップ
   *   「エッジでキャッシュヒットするたびにコインが飛んでくる」
   * が説明テロップ帯にしか出ておらず、帯を畳むと **このRUSHの遊び方がどこにも無い**
   * 状態になっていた(盤面はエッジ名と枚数しか出していない)。ここで引き取る。
   */
  view._drawRuleLine(ctx, 'エッジでキャッシュヒットするたびに枚数が飛んでくる', { color: '#bcd4ff' });
}

// ── ③ Aurora RUSH ────────────────────────────

const AURORA = RUSH_SPEC_BY_ID.AURORA_RUSH;

/** ACU(= 純増)のゲージと数字が主役。レア役でスケールアップする(U24) */
export function drawAuroraRush(ctx, state, textActive, view) {
  const acu = state?.acu ?? AURORA.acuInit;
  const max = AURORA.acuMax;
  const ratio = Math.max(0, Math.min(1, acu / max));

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText('AURORA CAPACITY UNIT  =  純増', view.w / 2, 50);

  // ── ACUゲージ ──
  const gx = 56;
  const gw = view.w - 112;
  const gy = 66;
  const gh = 20;
  roundRect(ctx, gx, gy, gw, gh, gh / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  if (ratio > 0) {
    ctx.save();
    roundRect(ctx, gx, gy, gw, gh, gh / 2);
    ctx.clip();
    const g = ctx.createLinearGradient(gx, 0, gx + gw, 0);
    g.addColorStop(0, '#7be3ff');
    g.addColorStop(1, '#a06bff');
    ctx.fillStyle = g;
    ctx.fillRect(gx, gy, gw * ratio, gh);
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, gx, gy, gw, gh, gh / 2);
  ctx.stroke();

  // ── ACU(純増)の大きい数字 ──
  heavyText(ctx, `${acu} 枚/G`, view.w / 2, 128, 40, '#b48bff');

  drawFooterLeft(ctx, `延長 +${state?.extended ?? 0} G`, '#7be3ff');
  drawGained(ctx, state, view);
  view._drawRuleLine(ctx, 'レア役でスケールアップ — 純増UP + 残り +1G', { color: '#7be3ff' });
}

// ── ④ ヒーローRUSH ───────────────────────────

const HERO = RUSH_SPEC_BY_ID.HERO_RUSH;

/**
 * 5つの枠が1ゲームずつ確定していく。
 * 当たり(HERO.hitCoin 枚)は金、外れは暗く沈める。残りの枠が「あと何回チャンスがあるか」。
 *
 * ■ 2026-08-14 U30: 右側は「ヒーロー」の立ち位置
 *   このモードだけキャラ(render/chars/herochan.js)が右下に常駐して
 *   毎ゲームの当落にリアクションする。x300〜410 / y150〜255 は彼の場所なので、
 *   盤面の文字はそこへ置かない(ロゴと補足行を少し左へ寄せてある)。
 */
export function drawHeroRush(ctx, state, textActive, view) {
  const total = state?.total ?? HERO.games;
  const played = state?.playedGames ?? 0;
  const hits = state?.hits ?? 0;
  /** ヒーローが立つぶん、盤面の中心は少し左へ寄せる */
  const midX = view.w / 2 - 26;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = '#ffd166';
  ctx.fillText(`${heroHitLabel()} — ${total}G 限定`, view.w / 2, 52);

  // ── 枠(1ゲーム1枠)──
  const bw = 58;
  const bh = 52;
  const gap = 9;
  const totalW = total * bw + (total - 1) * gap;
  const bx = (view.w - totalW) / 2;
  const by = 72;
  // 当たった枠を左から詰めて表示する(どの回で当たったかは告知側の担当)
  for (let i = 0; i < total; i++) {
    const x = bx + i * (bw + gap);
    const done = i < played;
    const win = i < hits;
    roundRect(ctx, x, by, bw, bh, 8);
    if (win) {
      const g = ctx.createLinearGradient(x, by, x, by + bh);
      g.addColorStop(0, '#fff3a0');
      g.addColorStop(1, '#ffa400');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = done ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.10)';
    }
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = win ? '#fff7c0' : 'rgba(255,255,255,0.28)';
    ctx.stroke();
    ctx.font = `900 16px ${FONT_HEAVY}`;
    ctx.fillStyle = win ? '#4a2400' : 'rgba(255,255,255,0.5)';
    ctx.fillText(win ? `${HERO.hitCoin}` : (done ? '—' : '?'), x + bw / 2, by + bh / 2 + 1);
  }

  // ロゴと補足はヒーローの立ち位置(x300〜)を避けて左寄せの中心へ
  heavyText(ctx, 'HERO RUSH', midX, 152, 27, '#ffd166');

  drawFooterLeft(ctx, `HIT ${hits} / ${played} G`, '#ffd166');
  drawGained(ctx, state, view);
  view._drawRuleLine(ctx, 'レア役成立でさらに上乗せ', { color: 'rgba(255,255,255,0.8)' });
}
