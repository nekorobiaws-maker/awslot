/**
 * M18/M19. 引き戻し層。DESIGN.md 2.2 / 3.12
 *
 *   ホットスタンバイ(10G / 40%) ──成功──> 直前のATへ復帰
 *        └──────────────失敗──> FREE_TIER
 *
 * 2026-08-13 ユーザー指摘「2段はくどい」で **1段に統合**(旧: HOT_STANDBY → ROUTE53_FAILOVER)。
 * 総合引き戻し率は 0.35+0.65×0.10=41.5% → 単体 0.40 で等価に保っている。
 * ROUTE53_FAILOVER のハンドラは直撃デバッグ用に残置(通常プレイからは到達しない)。
 *
 * どちらも突入時に成否を確定させ、ゲージ/TTLはその結果へ向かって動く
 * (DESIGN.md 4.2「演出は結果を先に知っている」)。
 *
 * ── AWSの実態との突き合わせ(2026-08-13 ユーザー依頼の監査)──
 * ホットスタンバイは「**待機系がすでに稼働している**」構成で、障害時にやるのは
 * 起動待ちではなく **ヘルスチェック → 昇格 → 接続の切り替え** である。
 * (起動を待つのはウォーム/コールドスタンバイ)
 * 旧実装は「待機系インスタンス起動中…」「AZ-c 起動完了」と、
 * ホットスタンバイと矛盾する起動待ちの文言だったので、
 * ゲージの意味を **切替の進捗(ヘルスチェック→昇格→接続切替)** に置き換えた。
 * モード名(ホットスタンバイ)はユーザー命名なのでそのまま活かしている。
 *
 * Route 53 側は「ヘルスチェック不合格 → セカンダリへルーティング → TTL の伝播待ち」
 * が実態。TTLカウントダウンはそのまま、ヘルスチェックの語を明示した。
 * AZレベルの切替 → 駄目ならDNS(リージョン級)という順序も実態として自然。
 */

/**
 * ホットスタンバイの切替フェーズ(液晶の表示ラベル)。
 * 「起動待ち」ではなく、稼働中の待機系へ寄せる作業の順番になっている。
 */
const STANDBY_PHASES = [
  { at: 0.00, label: 'HEALTH CHECK', text: 'AZ-a のヘルスチェックを再試行中…' },
  { at: 0.34, label: 'PROMOTE',      text: '稼働中の AZ-c を昇格中…' },
  // 1段化(2026-08-13)で退役した Route 53 の「DNS切替」テーマをここへ吸収した
  { at: 0.67, label: 'SWITCHOVER',   text: '接続と DNS の向き先を AZ-c へ切り替え中…' },
];

/** 進捗からフェーズを引く */
function standbyPhase(p) {
  let cur = STANDBY_PHASES[0];
  for (const ph of STANDBY_PHASES) if (p >= ph.at) cur = ph;
  return cur;
}

import { RECOVERY_SPEC_BY_ID } from '../../data/modes.js';
import { isRare } from '../../data/flags.js';

/**
 * 復帰先のATと、そこへ渡すパラメータを組み立てる。
 * 上乗せストックは復帰元から預かった値をそのまま返す(捨てない)。
 * 現状 stock>0 なら AT が転落しないためここへは来ないが、
 * 固定 0 のままだと仕様変更時に「上乗せが消える」事故になりやすい。
 */
function resumeTransition(state) {
  const mode = state.resumeMode ?? 'AS_RUSH';
  const stock = state.resumeStock ?? 0;
  const params = mode === 'AS_RUSH' ? { dc: state.resumeDc, stock } : { stock };
  // onNextSpin(2026-08-13): 復帰成功は即時遷移にしない。
  // 即時に復帰先ATへ入ると、同一ゲーム内の modeEnter 掃除(main.js)が
  // 切替完了/RESOLVED の結果演出を1フレームも見せずに消す
  // (asrush.js の EXIT と同型の穴)。このゲームは引き戻し層の画面のまま
  // 「切替完了」を見せ切り、次のレバーONでATへ復帰する。
  return { to: mode, params, onNextSpin: true };
}

export const hotStandby = {
  id: 'HOT_STANDBY',
  name: 'HOT STANDBY (Multi-AZ)',
  type: 'RECOVERY',

  onEnter(state, params = {}, ctx) {
    const spec = RECOVERY_SPEC_BY_ID.HOT_STANDBY;
    state.total = spec.games;
    state.remaining = spec.games;
    state.success = ctx.rng.chance(spec.successRate);
    state.resumeDc = params.resumeDc ?? spec.resumeDc;
    state.resumeMode = params.resumeMode ?? 'AS_RUSH';
    /** 復帰時に返す上乗せストック(復帰元から預かる) */
    state.resumeStock = params.resumeStock ?? 0;
    state.gauge = 0;
    /** 液晶に出す切替フェーズ(起動待ちではない。ファイル冒頭の監査コメント参照) */
    state.phase = STANDBY_PHASES[0].label;
    state.phaseText = STANDBY_PHASES[0].text;
    state.telop = 'AZ-a 障害検知 — 稼働中の AZ-c へ切り替え開始';
  },

  onGame(state, g) {
    // ゴースト揃いはどこで引いてもボーナス確定。
    // 引き戻し中に引いた場合も、待たずにボーナス当選として扱う。
    if (g.flag === 'GHOST') {
      state.success = true;
      state.gauge = 1;
      state.remaining = 0;
      return {
        transition: { to: 'BONUS', params: { bonusId: 'S3_BIG' } },
        telop: 'ゴースト揃い — ボーナス確定!!',
      };
    }

    state.remaining--;
    const progress = (state.total - state.remaining) / state.total;
    // 成功なら100%へ、失敗なら70%手前で頭打ちになるゲージ
    state.gauge = state.success ? progress : progress * 0.7;
    if (isRare(g.flag)) state.gauge = Math.min(0.98, state.gauge + 0.15);

    const phase = standbyPhase(state.gauge);
    state.phase = phase.label;
    state.phaseText = phase.text;

    if (state.remaining > 0) {
      return { telop: isRare(g.flag) ? `${phase.text}(切替が進んだ!)` : phase.text };
    }

    if (state.success) {
      state.gauge = 1;
      state.phase = 'SWITCHED';
      state.phaseText = 'DNS が AZ-c を向きました';
      return {
        setEnd: { result: 'RECOVERY_RESULT', success: true, layer: 'HOT_STANDBY' },
        transition: resumeTransition(state),
        telop: 'DNS 切替完了 — RUSH 復帰!!',
      };
    }
    // 2026-08-13 の1段化: ここで通常時へ転落する(Route 53 への連鎖は廃止)
    state.phase = 'FAILED';
    state.phaseText = '切り替えが完了しませんでした';
    return {
      setEnd: { result: 'RECOVERY_RESULT', success: false, layer: 'HOT_STANDBY' },
      transition: { to: 'FREE_TIER' },
      telop: 'RTO 超過… 通常運転へ戻ります',
    };
  },
};

/**
 * 【退役】Route 53 フェイルオーバー。
 * 2026-08-13 の引き戻し1段化で通常プレイからは到達しない。
 * `?mode=ROUTE53_FAILOVER` の直撃デバッグ用にハンドラだけ残置している。
 * DNS切替のテーマは上の hotStandby の最終フェーズへ吸収済み。
 */
export const route53Failover = {
  id: 'ROUTE53_FAILOVER',
  name: 'ROUTE 53 フェイルオーバー',
  type: 'RECOVERY',

  onEnter(state, params = {}, ctx) {
    const spec = RECOVERY_SPEC_BY_ID.ROUTE53_FAILOVER;
    state.total = spec.games;
    state.remaining = spec.games;
    state.success = ctx.rng.chance(spec.successRate);
    state.resumeMode = params.resumeMode ?? 'AS_RUSH';
    state.resumeDc = params.resumeDc ?? spec.resumeDc;
    state.resumeStock = params.resumeStock ?? 0;
    /** DNS の TTL カウントダウン(液晶の演出値。0になった瞬間に当落) */
    state.ttl = spec.games * 60;
    state.ttlStep = 60;
    state.telop = 'ヘルスチェック不合格 — セカンダリへ切り替え。TTL の伝播を待て';
  },

  onGame(state, g) {
    if (g.flag === 'GHOST') {
      state.success = true;
      state.ttl = 0;
      state.remaining = 0;
      return {
        transition: { to: 'BONUS', params: { bonusId: 'S3_BIG' } },
        telop: 'ゴースト揃い — ボーナス確定!!',
      };
    }

    state.remaining--;
    state.ttl = Math.max(0, state.ttl - state.ttlStep);

    if (state.remaining > 0) {
      return { telop: `TTL ${state.ttl} 秒 — セカンダリへの伝播待ち…` };
    }

    if (state.success) {
      return {
        setEnd: { result: 'RECOVERY_RESULT', success: true, layer: 'ROUTE53_FAILOVER' },
        transition: resumeTransition(state),
        telop: 'セカンダリへの伝播完了 — 一発逆転の復帰!!',
      };
    }
    return {
      setEnd: { result: 'RECOVERY_RESULT', success: false, layer: 'ROUTE53_FAILOVER' },
      // onNextSpin: 転落の結果演出(NO HEALTHY ENDPOINT)を見せ切ってから
      // 通常時へ落とす(resumeTransition と同じ理由)。
      transition: { to: 'FREE_TIER', onNextSpin: true },
      telop: '名前解決できず… Free Tier へ転落',
    };
  },
};
