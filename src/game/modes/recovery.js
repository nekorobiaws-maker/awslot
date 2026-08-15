/**
 * M18/M19. 引き戻し層。DESIGN.md 2.2 / 3.12
 *
 *   ホットスタンバイ(5G+延長 / 成功55%) ──成功──> **ゴーストボーナス**(U32)
 *        └───────────────────失敗──> FREE_TIER
 *   ※ ゲーム数・成功率の正は data/modes.js の RECOVERY_SPECS、
 *     復帰先ボーナスの正は data/rushes.js の RECOVERY_BONUS(ここは読み手向けの写し)
 *
 * ── U32(2026-08-14 ユーザー指示)/ 復帰先は「普通のボーナス」────────────
 * 旧仕様は **転落した RUSH へそのまま復帰**(AS なら3台で再開、CF なら4G…)。
 * これだと引き戻しに当たった時点で RUSH の再開が確定してしまい、
 * 「ボーナス → レア役 → RUSH」という本編の導線を飛び越す近道になっていた。
 *
 * 新仕様は **復帰 = ゴーストボーナス**(data/rushes.js の RECOVERY_BONUS / S3_BIG)。
 *   ・入口は通常の当たりと同じ BONUS_READY(ゴースト7を揃える)
 *   ・RUSHへ戻れるかは、そのボーナス中にレア役を引けるか次第(**当選率 45%**)
 *   ・戻れなくても 8G × 10.60枚/G ≒ **85枚** は貰えるので、手ぶらでは終わらない(U72 でベル18枚化)
 *   ※ 2026-08-14 検証: ここに「シャークボーナス / 12% / 6G 58枚」という
 *     **検討したが採用しなかった案** の数字が残っていた。12%前提で調整すると
 *     平均スコアが 40枚ほどズレるので、必ず RECOVERY_BONUS を正とすること。
 * 転落元(RUSH 4種 / 上位AT)によらず同じ扱いにして、
 * 「引き戻しに成功したら何が起きるか」を台全体で1通りに固定している。
 *
 * 2026-08-14 ユーザー要望(U2/U3/U23):
 *   U2  … 10G固定は「ただ待つ時間」だったので **5G** へ短縮し、
 *         滞在中に役が成立するたび **切替猶予 +1G**(上限 15G)で粘れるようにした
 *   U23 … その +1G の契機を **レア役のみ** に絞った(ベル・リプレイでは伸びない)。
 *         レア役 = チャンスの合図、をゲーム全体で統一するため(data/rareroles.js)
 *   U3 … 消化し切って失敗したときに「システムがダウンした」と分かる終わり方にし、
 *         遷移を onNextSpin にして終了メッセージを見せ切ってから通常時へ落とす
 *
 * 2026-08-13 ユーザー指摘「2段はくどい」で **1段に統合**(旧: HOT_STANDBY → ROUTE53_FAILOVER)。
 * 総合引き戻し率は 0.35+0.65×0.10=41.5% → 単体 0.40 で等価に保ち、
 * その後 2026-08-14 のバランス調整で 0.45 →(U32 で復帰の価値が下がったぶん)**0.55** へ。
 * 率の正は data/modes.js の RECOVERY_SPECS.successRate(ここは写し)。
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

import {
  RECOVERY_SPEC_BY_ID, AS_RUSH_CORE, UPPER_AT_SPEC_BY_ID, BONUS_SPEC_BY_ID,
} from '../../data/modes.js';
import { RUSH_SPEC_BY_ID, RECOVERY_BONUS } from '../../data/rushes.js';
import { isRareRole } from '../../data/rareroles.js';
import { BONUS_NET_PER_GAME } from '../../data/payouts.js';
import { residualLine } from '../../data/session.js';

/**
 * 復帰先の「1回ぶんの価値」。
 *
 * U32(2026-08-14)で復帰先が **ボーナス** になったので、
 *   ボーナスの消化G数 × ボーナス中の期待純増(BONUS_NET_PER_GAME)
 * がそのまま復帰の価値になる。
 *
 * 【買わないもの】そのボーナス中の **RUSH抽選は買い取らない**。
 * data/session.js の方針どおり「まだ引いていない抽選は所有していない権利」なので、
 * ここで期待値を足すと「引き戻し中に終わるのが一番得」という歪みが出る。
 *
 * 渡ってくる resumeParams は data/rushes.js の recoveryParamsFor が作る。
 * ここは **その値をそのまま枚数へ換算するだけ** にして、
 * 「買い取りでは満額、復帰したら別物」のような食い違いを作らない。
 *
 * @param {string} mode 復帰先モードID(現仕様では 'BONUS')
 * @param {object} [resumeParams] 復帰先 onEnter に渡す params
 * @returns {{perGame:number, games:number}}
 */
function resumeValueOf(mode, resumeParams = {}) {
  if (mode === 'BONUS' || mode === 'BONUS_READY') {
    const spec = BONUS_SPEC_BY_ID[resumeParams.bonusId ?? RECOVERY_BONUS.bonusId]
      ?? BONUS_SPEC_BY_ID[RECOVERY_BONUS.bonusId];
    return {
      perGame: BONUS_NET_PER_GAME,
      // セット継続型なら1セットぶん(まだ引いていない継続は買わない)
      games: spec?.type === 'set' ? spec.setGames : (spec?.games ?? 0),
    };
  }
  /*
   * 【退役経路】U32 より前は RUSH / 上位AT へ直接復帰していた。
   * ?mode=HOT_STANDBY の直撃デバッグで resumeMode を手で指定した場合だけここへ来る。
   * 通常プレイからは到達しない(復帰先は必ず上の BONUS)。
   */
  const rush = RUSH_SPEC_BY_ID[mode];
  if (rush) {
    return {
      perGame: rush.payoutPerGame ?? rush.expectedPerGame ?? rush.acuInit ?? 0,
      games: resumeParams.units ?? resumeParams.games ?? rush.games ?? rush.initGames ?? 0,
    };
  }
  const upper = UPPER_AT_SPEC_BY_ID[mode];
  return {
    perGame: upper?.payoutPerGame ?? 0,
    games: upper?.setGames ?? AS_RUSH_CORE.setGames,
  };
}

/**
 * 復帰先ボーナスの表示名(テロップ・買い取り明細が使う)。
 * 種別を直書きせず data/rushes.js の RECOVERY_BONUS 由来の値から引くので、
 * 復帰ボーナスを差し替えても文言が嘘にならない。
 * @param {object} state ホットスタンバイの state
 */
function resumeBonusName(state) {
  const id = state.resumeParams?.bonusId ?? RECOVERY_BONUS.bonusId;
  return BONUS_SPEC_BY_ID[id]?.name ?? 'ボーナス';
}

/**
 * 引き戻し層に居たままセッションが終わったときの残存価値(2026-08-14 しおん指摘 S7)。
 *
 * ここに residualValue が無かったため、
 * 「RUSH から転落 → 引き戻し中に100回転を使い切る」で終わると
 * **復帰すれば RUSH が再開できる権利が丸ごと0円**になっていた。
 * AS_RUSH や ENDING は買い取られるので、終わり方だけで不公平が出る。
 *
 * 成否は onEnter の時点で既に抽選済み(state.success)なので、
 * ここで新しく引く必要はない = ゲーム抽選RNGを一切消費しない。
 * 「残り回転が尽きたら復帰抽選を即時消化して結果を反映する」を、
 * 抽選済みの結果を読むだけで実現している。
 *
 * 買い取る額は「復帰先ボーナス1回ぶん」(U32)だけ。
 * まだ引いていない継続抽選・RUSH抽選は買わない(data/session.js の方針どおり)。
 *
 * ── 上乗せストック(resumeStock)を買い取らない理由(2026-08-15 / 検証指摘)──────
 * 旧実装は `resumeStock` を「復帰ボーナス1回ぶん」に換算して買い取っていたが、
 * **実際に復帰したときは resumeTransition が渡した stock をボーナス側が使わない**
 * (ボーナスにセットストックの概念が無い)ため、
 *   ・100回転が尽きて終わった回 … ストックぶんが加算される
 *   ・生きて復帰した回           … ストックぶんは消える
 * という「終わり方で価値が変わる」非対称になっていた。
 * 復帰でも買い取りでも同じ扱いにするため、**どちらも運ばない**側へ一本化した。
 *
 * この扱いで取りこぼしが起きないことは構造でも担保されている:
 * 上位AT(SERVERLESS_RUSH / MULTI_REGION)は resolveSetEnd がセット末に
 * **ストックを先に消化して継続する**ので、ストックを持ったまま引き戻しへ落ちない
 * (= recoveryEntryParams に渡る stock は常に 0。scripts/sim.mjs の検証が毎回確認する)。
 * 仕様を変えてストックを持ったまま転落させるなら、**買い取り(ここ)と復帰
 * (resumeTransition)の両方に同時に足すこと**。片方だけ直すと非対称が復活する。
 */
function recoveryResidual(state, label) {
  if (!state.success) return [];
  const mode = state.resumeMode ?? RECOVERY_BONUS.mode;
  const { perGame, games } = resumeValueOf(mode, state.resumeParams);
  const bonusId = state.resumeParams?.bonusId;
  const name = BONUS_SPEC_BY_ID[bonusId]?.name ?? RUSH_SPEC_BY_ID[mode]?.short ?? mode;

  return [
    residualLine(`${label} 復帰確定(${name})`, games, perGame),
  ];
}

/**
 * 復帰先(U32 以降はボーナス)と、そこへ渡すパラメータを組み立てる。
 *
 * 上乗せストック(resumeStock)は **渡さない**。
 * 復帰先のボーナスにセットストックの概念が無く、渡しても黙って捨てられるだけで、
 * 「買い取りでは価値になるのに復帰すると消える」非対称の原因になっていたため
 * (2026-08-15 / recoveryResidual のコメント参照)。
 * 上位ATはストックを持ったまま引き戻しへ落ちないので、実プレイでの取りこぼしは無い。
 */
function resumeTransition(state) {
  const mode = state.resumeMode ?? RECOVERY_BONUS.mode;
  // 復帰パラメータは転落したRUSH / 上位ATが data/rushes.js の
  // recoveryEntryParams で作って預けてくる(復帰先と買い取りで同じ値を使う)。
  // 余分なキーは各 onEnter が無視する。
  const params = {
    ...(state.resumeParams ?? {}),
    // 演出・液晶が「復旧して入ったボーナス」と名乗るための目印(抽選には効かない)
    fromRecovery: true,
    recoveryFrom: state.resumeFrom ?? null,
  };
  // onNextSpin(2026-08-13): 復帰成功は即時遷移にしない。
  // 即時に復帰先へ入ると、同一ゲーム内の modeEnter 掃除(main.js)が
  // 切替完了/RESOLVED の結果演出を1フレームも見せずに消す
  // (asrush.js の EXIT と同型の穴)。このゲームは引き戻し層の画面のまま
  // 「切替完了」を見せ切り、次のレバーONでボーナス(入賞待ち)へ入る。
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
    /**
     * U2-b / U23(2026-08-14 ユーザー要望): 滞在中に **レア役** が成立したら猶予が +1G 伸びる。
     * 暴走して100回転を食い潰さないよう、延長込みの総ゲーム数に上限を持つ。
     */
    state.maxTotal = spec.maxTotalGames ?? (spec.games * 3);
    state.extended = 0;
    state.success = ctx.rng.chance(spec.successRate);
    state.resumeDc = params.resumeDc ?? spec.resumeDc;
    /**
     * 復帰先。U32 以降は転落元によらず **ボーナス**(data/rushes.js の RECOVERY_BONUS)。
     * ?mode=HOT_STANDBY の直撃デバッグで resumeMode を手渡した場合だけ別モードになる。
     */
    state.resumeMode = params.resumeMode ?? RECOVERY_BONUS.mode;
    /**
     * 復帰時に復帰先モードへ渡すパラメータ。
     * 転落元(RUSH 4種 / 上位AT)が data/rushes.js の recoveryEntryParams で作って預ける。
     */
    state.resumeParams = params.resumeParams ?? { bonusId: RECOVERY_BONUS.bonusId };
    /** どのモードから転落してきたか(液晶・演出の表示用。抽選には効かない) */
    state.resumeFrom = params.resumeFrom ?? null;
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

    /**
     * U2-b → **U23(2026-08-14 ユーザー指示)**: 切替猶予 +1G の契機を
     * 「払い出しのある成立役すべて」から **レア役のみ** へ変更した。
     * 旧: 約4割のゲームで延長 = ほぼ毎回上限(15G)まで粘れて緊張が無かった
     * 新: 通常時のレア役は 1/24.7 なので、5G中に延びるのは平均 0.2G。
     *     (U63 でレア役が 1/6.17 になり、実測は平均 **0.87G / 滞在 5.9G**。
     *      上限15Gにはまず当たらないので data/modes.js の games は 5G のまま)
     *     「レア役を引けたら粘れる」= レア役の合図をゲーム全体で統一する(U22〜U24 と同じ意図)。
     * 当落(state.success)は動かさない = 延命であって救済ではない。
     *
     * ゲージは (total - remaining) / total で出しているので、
     * total も一緒に増やさないと消化済みG数の比率が跳ねてしまう。
     * それでも分母だけ増えた瞬間に進捗がわずかに戻るため、
     * 表示上のゲージは Math.max で単調に保つ(巻き戻して見えないように)。
     *
     * ※ paramChange 'standby_extend' は現時点で受け手のシナリオが無い
     *   (2026-08-14 しおん指摘 minor-f)。レア役限定になって希少な見せ場になったので
     *   **イベントは残す**。演出担当が「AZ-c が持ちこたえた」の画を付ける想定。
     */
    const extended = isRareRole(g.flag) && state.total < state.maxTotal;
    const events = [];
    if (extended) {
      state.remaining++;
      state.total++;
      state.extended++;
      events.push({
        name: 'paramChange',
        payload: {
          param: 'standby_extend',
          value: state.remaining, delta: 1, flag: g.flag,
        },
      });
    }

    const prevGauge = state.gauge ?? 0;
    const progress = (state.total - state.remaining) / state.total;
    // 成功なら100%へ、失敗なら70%手前で頭打ちになるゲージ
    state.gauge = state.success ? progress : progress * 0.7;
    // レア役は切替が一段進む。失敗回は「あと少しで成功」に見えない位置で止める
    if (isRareRole(g.flag)) {
      state.gauge = Math.min(state.success ? 0.98 : 0.72, state.gauge + 0.15);
    }
    state.gauge = Math.max(prevGauge, state.gauge);

    const phase = standbyPhase(state.gauge);
    state.phase = phase.label;
    state.phaseText = phase.text;

    if (extended) {
      return { events, telop: 'AZ-c が持ちこたえた — 切替猶予 +1G' };
    }

    if (state.remaining > 0) {
      return { events, telop: isRareRole(g.flag) ? `${phase.text}(切替が進んだ!)` : phase.text };
    }

    if (state.success) {
      state.gauge = 1;
      state.phase = 'SWITCHED';
      state.phaseText = 'DNS が AZ-c を向きました';
      return {
        setEnd: { result: 'RECOVERY_RESULT', success: true, layer: 'HOT_STANDBY' },
        transition: resumeTransition(state),
        // U32: 復帰先はボーナス。「RUSH 復帰」と言うと嘘になるので言い切らない
        // (RUSHへ戻れるかは、このボーナス中にレア役を引けるか次第)。
        // ボーナス名は data/rushes.js の RECOVERY_BONUS から引く(直書きしない)
        telop: `切替完了 — 復旧の${resumeBonusName(state)}!!`,
        events,
      };
    }
    // 2026-08-13 の1段化: ここで通常時へ転落する(Route 53 への連鎖は廃止)
    state.phase = 'FAILED';
    /**
     * U3(2026-08-14 ユーザー要望): 消化し切って失敗したことが分かる終わり方にする。
     * 液晶の常設ラベルは「ダウンした」と言い切り、
     * 画(SYSTEM DOWN)は scenarios/rush.js の standby_down が setEnd から出す。
     */
    state.phaseText = 'システムがダウンした… 復旧できませんでした';
    return {
      setEnd: { result: 'RECOVERY_RESULT', success: false, layer: 'HOT_STANDBY' },
      // onNextSpin: 終了メッセージを見せ切ってから通常時へ落とす。
      // 即時遷移だと同一ゲーム内の modeEnter 掃除で1フレームも見えずに消える
      // (成功側の resumeTransition と同じ理由)。
      transition: { to: 'FREE_TIER', onNextSpin: true },
      telop: 'RTO 超過… 通常運転へ戻ります',
      events,
    };
  },

  /** 復帰確定なら、復帰先ATの1セットぶんを買い取る(ファイル上部 recoveryResidual 参照) */
  residualValue(state) {
    return recoveryResidual(state, 'ホットスタンバイ');
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
    state.resumeMode = params.resumeMode ?? RECOVERY_BONUS.mode;
    state.resumeDc = params.resumeDc ?? spec.resumeDc;
    state.resumeParams = params.resumeParams ?? { bonusId: RECOVERY_BONUS.bonusId };
    state.resumeFrom = params.resumeFrom ?? null;
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
        telop: 'セカンダリへの伝播完了 — 復旧のボーナス!!',
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

  /** 退役モードだが、直撃デバッグで滞在中に終わった場合も買い取りを揃えておく */
  residualValue(state) {
    return recoveryResidual(state, 'Route 53 フェイルオーバー');
  },
};
