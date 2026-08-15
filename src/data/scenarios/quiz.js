/**
 * リール3択クイズのシナリオ(U64-2 / 2026-08-15 ユーザー指示)。
 *
 * ── この枠の歴史 ────────────────────────────────────────────────
 *   1. 元は「AWSクイズルーレット」(出題 → 4択が回る → 正解ならCZ)。
 *   2. U53 でクイズをやめ、同じ発生枠を「どのリールから止める?」の3択に置き換えた。
 *   3. **U64-2 でクイズへ戻した**。出題は休止していた46問(src/data/quiz.js)を使い、
 *      3つの選択肢を **左 / 中 / 右のリール** に割り当てて第1停止で答える形にした。
 *      発生枠(いつ・どれくらい出るか)は U53 のままなので、演出の総量は変わらない。
 *   4択ルーレットの盤面(lcdanims-extra.js の aws_quiz_roulette)と
 *   buildQuizRound() は休止のまま保全してある(再生しているシナリオは1本も無い)。
 *
 * ── いまの演出 ───────────────────────────────────────────────
 *   ① 出題   「◯◯をしたい。どのサービス?」+ 3択を 左 / 中 / 右 に表示
 *   ② 回答    **新しい選択UIは作らない**。既存の停止操作がそのまま入力で、
 *             プレイヤーが第1停止したリール = 選んだ選択肢
 *   ③ 発表    第1停止でその場で判定。正誤は **押したリールと正解の位置の一致** で決まる
 *   ④ 接続    当選ゲームならそのまま従来のCZ突入告知へ繋ぐ
 *
 * ══ 【厳守】出題と回答は同じ1ゲームに収める(2026-08-15 ユーザー指示 U69)══
 *
 *   レバーON  … 出題(盤面が出る)
 *   第1停止   … 回答 + 発表
 *   次のレバーON … 盤面が消える
 *
 * ■ 出題は「レバーONの瞬間」に出す
 *   3本とも発火イベントが違うので、出題の出し方だけを揃えてある:
 *     entry_cz   modeEnter(CZ) … flow.js の _settleSpinTransition により
 *                                **レバーONの直後**に届く → at:0 のまま
 *     miss_idle  leverOn       … そのままレバーON → at:0 のまま
 *     miss       paramChange   … 払出中に届く = まだレバー前。
 *                                **waitFor:'leverOn' で次の回転まで待ってから出す**
 *   (旧実装は miss だけ払出中に出題して次のゲームの第1停止で発表していた。
 *    出題がレバー操作と噛み合わず、待ちが長いぶん尺切れでも消えていた)
 *
 * ■ 出題は答えるまで消えない
 *   リールに自動停止は無い = プレイヤーは何分でも考えられる。
 *   盤面(PICK_WAIT_MS = 5分)とシナリオ(waitGraceMs = 6分)の両方を伸ばして、
 *   「読んでいる途中で盤面が消える / 押したのに発表が出ない」を塞いである。
 *   どちらも尺が尽きれば自然に消える = 画面が固まったままにはならない。
 *
 * ■ 盤面は常にフルサイズ
 *   当選版だけ 0.74 倍(compact)にしていたのをやめた。理由は askCues のコメント。
 *
 * ══ 【最重要】正誤と当落は別物 ═══════════════════════════════════
 *
 * ■ 正誤は事実に忠実(演出RNGでシャッフルされた正解の位置と、押したリールの一致)
 *   当落を見て正解の位置を後から動かしたりしない。
 *   → 「正解したのに役は不成立」「不正解でもCZ突入」が普通に起きる。それが正しい。
 *
 * ■ 当落は出目と抽選が決める(この演出は1枚も変えない)
 *   出目・当落は **レバーON時点で確定済み**。演出側からゲーム状態は触らない
 *   (DESIGN.md 4.2)。盤面へ渡す `win` は「このシナリオが当選確定の枠かどうか」で、
 *   正誤の判定には一切使わない(表示の言い回しを分けるためだけの値)。
 *
 * ■ 4通りの見え方(盤面 + 告知プレートで出し分ける)
 *   | シナリオ           | 回答   | 盤面                        | 告知プレート | 音(正誤/当落) |
 *   |--------------------|--------|-----------------------------|--------------|------------------|
 *   | 当選(entry_cz)   | 正解   | 正解!!                      | CZ突入       | チャイム / 祝福  |
 *   | 当選(entry_cz)   | 不正解 | 不正解… / 正解は◯「◯◯」   | CZ突入       | ブザー / 祝福    |
 *   | 非当選(miss系)   | 正解   | 正解!! / 役は不成立…        | (出さない)  | チャイム / 下降音 |
 *   | 非当選(miss系)   | 不正解 | 不正解… / 正解は◯ — 役は不成立… | (出さない) | ブザー / 下降音  |
 *   当選版だけ告知プレートを持つので、盤面側は win:true のとき当落に触れない(U8)。
 *
 * ■ 音は「正誤」と「当落」で別系統(2026-08-15 ユーザー指示 U66-7)
 *   正誤 … sfx.quizVerdict(staging/actions.js)。押したリールと正解の位置の一致で
 *          チャイム(checklist_ok)/ クイズのブザー(buzzer_wrong)を鳴らし分ける。
 *          **シナリオ側に preset を直書きしないこと**(旧実装はこれで
 *          「正解表示なのにブッブー」が鳴っていた)。
 *   当落 … CZ突入のファンファーレ / 非当選の静かな下降音(cz_lose)。正誤では変えない。
 *
 * ■ 学習記録(2026-08-15 学習強化 L1/L4)
 *   3本とも `layer:'learn' / action:'quizResult'` のキューを1本ずつ持ち、
 *   正誤(問題id + 正誤)と正解サービスを data/learnlog.js へ積む。
 *   **画も音も出さない**ので演出の総量は変わらず、当落・出目・スコアにも影響しない。
 *   実装は staging/actions.js の 'learn.quizResult'。
 *
 * ■ 「当選が確定した枠でしか当選を名乗らない」担保(クイズ時代と同じ構造)
 *   演出は抽選結果を先に知ってからシナリオを選ぶ(DESIGN.md 4.2)。
 *   その性質を使い、当選版と非当選版を「結果が確定した別々のイベント」に貼り分ける。
 *
 *   当選版   qz_reelpick_entry_cz … `modeEnter` / enterMode: CZ
 *       CZ のモードスタックへ積まれた後にしか流れないイベント。
 *       つまり **このシナリオが動く時点で CZ 突入は確定している**。
 *   非当選版 qz_reelpick_miss     … `paramChange` / param: zencho_end, value: MISS
 *       前兆が「何も起きずに終わった」ことを告げるイベント。
 *       freetier.js は当選を保持していない前兆でしか MISS を出さないので、
 *       **このシナリオが動く時点で非当選が確定している**。
 *   非当選版 qz_reelpick_miss_idle … `leverOn` / 構造的に当たらない役 + 前兆なし + 非天井
 *       下の NEVER_WINS / NOT_CEILING_GAME のコメント参照。
 *
 *   どれも when 条件だけで当落が決まっており、weight や chance を触っても
 *   「非当選なのに突入と出る」ことは起こらない(逆向きも同じ)。
 *
 * ■ 選んだリールの受け取り方(新しい入力は作らない)
 *   { waitFor: 'stop1', params: { pick: '$stop1.index' } } と書くと、
 *   engine/timeline.js が控えた stop1 の payload から
 *   **実際に最初に止めたリール**(0=左 / 1=中 / 2=右)が演出へ届く。
 *   受け取るだけで、ゲーム側へは何も書き戻さない。
 *
 * ■ 他の告知との棲み分け(クイズ時代から不変)
 *   director は1イベントにつき1シナリオしか再生しない(重み付き抽選)。
 *   - 当選版は CZ の突入演出(cz.js の cz_*_entry、weight 100)と同じ枠を奪い合う。
 *     weight 70 なので CZ 突入のおよそ 40% がクイズ経由になる。
 *   - 非当選版は前兆のガセ終了(zencho.js の zn_result_miss、weight 100)と同じ枠。
 *   weight / chance はクイズ時代の実測値をそのまま引き継いでいる
 *   (発生枠を置き換えただけで、演出の総量は変えないため)。
 *
 * ■ 盤面の座席割り(正は staging/anims/lcdanims-extra.js の PICK_* 定数)
 *     y   3〜  5 … 外枠
 *     y   6〜 38 … 問題文プレート
 *     y  44〜146 … 3択のマス(左 / 中 / 右 + 選択肢)
 *     y 152〜236 … **lcd.text の告知プレート専用**。盤面は文字を置かない
 *     y 248      … 判定(正解!! / 不正解…)
 *     y 274      … 内訳(正解は◯ / 役は不成立…)
 *     y 292      … 足元の見出し
 *   3本ともこのフルサイズの座席割りで出す。告知プレートの帯を最初から空けてあるので、
 *   当選版の『CZ突入』(lcd.text)ともそのまま同居できる。
 *   ※ 縮小(compact)の機構は lcdanims-extra.js に残っているが、いま渡すシナリオは無い。
 *
 * ■ 二重表示の回避(U8)
 *   判定(正解!! / 不正解…)を出しているのは **盤面だけ**。
 *   lcdanims.js の ANIM_HEADLINES に reel_pick_choice を登録してあるので、
 *   同じ文言はテロップ側で自動的に伏せられる。
 *   当選版だけが lcd.text を1本使うが、内容は正誤ではなく当落(「CZ突入」)。
 *
 * ■ 背景の当落バレを止める(U42。クイズでも維持)
 *   当選版は **CZ の modeEnter** で始まるので、出題した瞬間には既にモードが CZ。
 *   何もしないと液晶の背景・ステージ名が先に CZ へ変わり、答える前にバレる。
 *   対策は render 側にあり、シナリオは出題キューに hold:true を渡すだけでよい:
 *     lcdanims.js の STAGE_HOLD_ANIMS に reel_pick_choice を登録してあり、
 *     phase が 'answer' になるまで render/lcd.js が **1つ前の背景・ステージ名**を出す。
 *   つまり「発表」と「背景がCZへ変わる」が同じ瞬間に起きる。
 *   **非当選版には hold を付けない**(モードが変わらないので隠すものが無く、
 *   付けると保留中の入力ガードで投入・レバーが塞がって進行が止まる)。
 *
 * ■ デバッグ強制発火
 *   ?rp=1        … 3本すべてを最優先で発火させる
 *   ?rp=entry_cz … 当選版だけを狙う(?rp=miss / ?rp=miss_idle も同様)
 *   ?quiz=acm    … 出題を固定する(data/quiz.js の id。文字組みの確認用)
 *   強制中は weight を跳ね上げて chance を外すが、**when は緩めない**ので
 *   「当選版でしか突入を名乗らない」担保はそのまま
 *   (非当選版を出したいときは役強制キーと併用する)。
 */

import { SESSION } from '../session.js';
import { NORMAL_SUBSTATES } from '../modes.js';

/* ══ デバッグ強制発火(検証担当向け)═══════════════════════════════════
 * 作法は yokoku-wind.js の ?yw= と同じ。ブラウザ以外(scripts/sim.mjs 等)には
 * location が無いので常に無効。 */
function readQuery(name) {
  try {
    if (typeof location === 'undefined' || !location?.search) return null;
    const v = new URLSearchParams(location.search).get(name);
    return v ? v.trim() : null;
  } catch {
    return null;
  }
}

const FORCE_RP = readQuery('rp');
/**
 * ?quiz=acm … 出題を固定する(data/quiz.js の id)。
 * 出題の**タイミング**は変えない(?rp= と併用すること)。
 * 未知のIDを渡した場合は data/quiz.js 側が通常どおり1問引く。
 * @type {string|null}
 */
const FORCE_QUIZ_ID = readQuery('quiz');
/** 強制中の weight(他の候補を確実に押し切る大きさ) */
const FORCE_WEIGHT = 200000;

/** 元の weight の「出てよいモード」だけを残したまま最大化する */
function forcedWeight(weight = {}) {
  const out = {};
  for (const [mode, w] of Object.entries(weight)) out[mode] = w > 0 ? FORCE_WEIGHT : 0;
  return out;
}

/** ?rp= で指定されたシナリオの weight を跳ね上げ、chance を外す */
function applyForce(list) {
  if (!FORCE_RP) return list;
  // ?rp=1 / ?rp=on は「全部」の意味(空文字はどのIDにも含まれる)
  const needle = FORCE_RP === '1' || FORCE_RP === 'on' ? '' : FORCE_RP;
  return list.map((s) => {
    if (!s.id.includes(needle)) return s;
    const { chance, ...rest } = s;
    return { ...rest, weight: forcedWeight(s.weight) };
  });
}

/**
 * 天井(Auto Recovery)に当たらないゲームの `modeState.games` 一覧。
 *
 * freetier.js は onGame の先頭で games を +1 してから `games >= ceiling` を見るので、
 * レバーON時点の modeState.games が ceiling-1 のゲームが「天井でCZへ飛ぶゲーム」。
 * 非当選版はそこを避ける(避けないと「役は不成立と出したのに天井でCZ」になる)。
 */
const NOT_CEILING_GAME = Array.from(
  { length: Math.max(1, NORMAL_SUBSTATES.ceiling.games - 1) },
  (_, i) => i,
);

/**
 * 単独では絶対に当たらない成立役。
 *
 * data/modes.js の CZ_ENTRY.table に行が無い役は drawCzEntry が必ず none を返す
 * (`const row = CZ_ENTRY.table[flag]; if (!row) return none;`)。
 * つまりこの4役のゲームは **CZ・ボーナス・AT のどれにも当選しない**ことが構造的に確定する。
 */
const NEVER_WINS = ['LOSE', 'BELL', 'REPLAY', 'REPLAY2'];

/**
 * 出題を許可する「残り回転数」の一覧(= セッションの最終回転では出題しない)。
 *
 * **qz_reelpick_miss だけに必要**なガード。あれは zencho_end(払出処理)で発火するため、
 * 出題も判定も「次のゲーム」(レバーON → 第1停止)になる。最終回転で発火すると
 * 次の回転が無く、出題そのものが出ないまま(または告知だけが)残ってしまう。
 *
 * 当選版は不要(flow.js の _settleSpinTransition により CZ の modeEnter は
 * 「そのスピンのレバーON」で起きるため、第1停止は同じゲームの操作になる)。
 *
 * 【重要】長さは data/session.js の totalGames から必ず導出すること。
 * 固定リストにするとセッション長を伸ばしたときに静かに発火しなくなる(2026-08-13 の事故)。
 */
const SPINS_LEFT_HAS_NEXT = Array.from({ length: SESSION.totalGames }, (_, i) => i + 1);

/**
 * 出題(第1停止を待つ)。
 * **見た目は当選版・非当選版で完全に共通**にすること(入りで当落が読めてはいけない)。
 * 問題そのものも当落と無関係に引く(data/quiz.js の buildReelQuizRound)。
 *
 * ■ 出題は必ず「レバーONの瞬間」に出す(2026-08-15 ユーザー指示 U69)
 *   レバーONで発火するシナリオ(entry_cz / miss_idle)は at:0 のまま。
 *   払出中に発火するシナリオ(miss)は `waitFor:'leverOn'` を渡して、
 *   **次のゲームのレバーONまで待ってから**盤面を出す。
 *   こうすると 3本とも「レバーON = 出題 / 第1停止 = 回答」が同じゲームで揃う。
 *
 * ■ 盤面は常にフルサイズ(U69)
 *   以前は当選版だけ 0.74 倍(compact)で出していたが、出題中は hold で背景が
 *   通常ステージのままなので縮めても得るものが無く、**文字が小さいだけ**だった。
 *   縮小は渡さない。詳しくは lcdanims-extra.js の reel_pick_choice のコメント。
 *
 * @param {object} opt
 * @param {'leverOn'|null} [opt.waitFor]
 *   出題を待たせるイベント。払出中に発火するシナリオ(miss)だけが 'leverOn' を渡す。
 * @param {boolean} [opt.hold]
 *   背景の切替を判定まで保留する(U42)。**モードが変わる当選版だけ** true。
 *   保留中は投入・レバーが塞がる(main.js の入力ガード)ので、
 *   同じゲームの第1停止で開けられる出題にしか付けてはいけない。
 *   詳しくは lcdanims.js の STAGE_HOLD_ANIMS のコメント。
 *   **画には出ない**ので、共通であるべき見た目は変わらない。
 */
function askCues({ waitFor = null, hold = false } = {}) {
  /* waitFor 版は「そのイベントからの相対時間」で同じ間合いを再現する */
  const at = (ms) => (waitFor ? { waitFor, ...(ms ? { after: ms } : {}) } : { at: ms });
  return [
    { ...at(0),   layer: 'sfx',  action: 'synth', params: { preset: 'announce' } },
    { ...at(0),   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
    /*
     * 出題は起点と同時(at:0 / after 無し)に出す。停止操作が極端に速いと
     * waitFor stop1 のキューが先に発火して 'answer' → 'ask' の順に逆転しうるため、
     * 遅らせない(modeEnter 起点でも main.js の lcdAnims.clear() より後に走る)。
     */
    { ...at(0),   layer: 'lcd',  action: 'anim',
      params: {
        anim: 'reel_pick_choice', phase: 'ask', hold, quizId: FORCE_QUIZ_ID,
      } },
    { ...at(60),  layer: 'char', action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
    { ...at(300), layer: 'sfx',  action: 'synth', params: { preset: 'ui_select' } },
  ];
}

/**
 * 出題してから回答(第1停止)までシナリオを畳まない猶予[ms](U69)。
 *
 * engine/timeline.js の既定は 20秒だが、**リールに自動停止は無い**ので
 * プレイヤーは何分でも考えていられる。既定のままだと考えている最中に
 * シナリオごと消え、押しても発表が出ない(= 出題が勝手に消える)。
 *
 * 盤面側の尺(lcdanims-extra.js の PICK_WAIT_MS = 5分)より長くすること。
 * 逆転するとシナリオだけ先に畳まれ、発表の来ない盤面が残る。
 */
const QUIZ_WAIT_GRACE_MS = 360000;

export default applyForce([
  {
    id: 'qz_reelpick_entry_cz',
    name: 'リール3択クイズ(当選ゲーム → CZ突入)',
    /*
     * CZ へ入った後にしか来ないイベント = 当選確定。ここでしか win:true を渡さない。
     *
     * resumed:[false] は「新しく積まれた CZ」だけに絞るガード(U69)。
     * modemachine の _pop() は上に積まれたモードから戻るときにも modeEnter を出すが、
     * それは **レバーONの瞬間ではない**(払出中の遷移)ので出題の起点にできず、
     * 「突入」を名乗るのも正しくない。新規突入(_push)は必ず resumed:false で、
     * flow.js の _settleSpinTransition により **レバーONの直後**に届く。
     */
    when: { event: 'modeEnter', enterMode: ['CZ'], match: { resumed: [false] } },
    weight: { default: 70 },
    // 液晶を丸ごと使うので、走っている間は他の液晶演出とテキスト帯を止める(director が調停する)
    exclusive: true,
    duration: 4200,
    // 回答(第1停止)を何分でも待つ。理由は QUIZ_WAIT_GRACE_MS のコメント
    waitGraceMs: QUIZ_WAIT_GRACE_MS,
    cues: [
      // hold:true = 判定まで背景を通常ステージのまま留める(U42)。当選版だけ
      ...askCues({ hold: true }),
      { at: 0, layer: 'overlay', action: 'flash', params: { color: '#7cf3ff', ms: 220 } },

      /*
       * 第1停止 = 回答の確定。pick には実際に最初に止めたリールが入る。
       * win:true は **当落**の申告(このイベントは CZ 突入確定の枠)。
       * 正誤は盤面が pick と正解の位置から自分で決めるので、ここでは渡さない。
       */
      { waitFor: 'stop1', layer: 'lcd', action: 'anim',
        params: {
          anim: 'reel_pick_choice', phase: 'answer', win: true,
          pick: '$stop1.index', ms: 3200,
        } },
      { waitFor: 'stop1', after: 40,  layer: 'sfx',     action: 'synth', params: { preset: 'reel_stop' } },
      /*
       * 正誤の音(U66-7)。**当落ではなく正誤**で鳴り分ける専用アクション。
       * 突入の祝福(下)より先に、控えめの音量で1つだけ鳴らす =
       * 「答えは合っていた/外していた」→「それはそれとして突入」の順で耳に入る。
       */
      { waitFor: 'stop1', after: 150, layer: 'sfx',     action: 'quizVerdict',
        params: { pick: '$stop1.index', gain: 0.7 } },
      /*
       * 学習記録(2026-08-15 学習強化 L1/L4)。**画も音も出さないキュー**。
       *   ・正誤を data/learnlog.js へ積む(苦手カテゴリの材料になる)
       *   ・正解サービスを AWS図鑑へ入れる(不正解でも入れる = 正解を画面で見せているため)
       * layer:'learn' は視覚キューでもテキストキューでもないので、
       * director.js の DROP_TEXT / DROP_VISUAL でも落ちず、classifyScenario の
       * 判定も動かさない(3本とも exclusive のまま)。
       * ゲーム抽選RNGは1回も引かないので当落・出目・スコアには一切影響しない。
       */
      { waitFor: 'stop1', after: 160, layer: 'learn',   action: 'quizResult',
        params: { pick: '$stop1.index' } },
      /*
       * ここから下は **CZ突入の祝福**(正誤ではなく当落に対する反応)。
       * 不正解でも突入は突入なので、鳴り物は正誤で変えない。
       * 正誤の反応は盤面の ○/✕ と判定文字、そして上の quizVerdict が担当する。
       */
      { waitFor: 'stop1', after: 240, layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 320 } },
      { waitFor: 'stop1', after: 250, layer: 'overlay', action: 'shake', params: { power: 12, ms: 420 } },
      { waitFor: 'stop1', after: 260, layer: 'sfx',     action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop1', after: 300, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { waitFor: 'stop1', after: 320, layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      { waitFor: 'stop1', after: 380, layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 220, y: 96, count: 20 } },
      { waitFor: 'stop1', after: 460, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_reg' } },
      /*
       * 告知テロップは可読性エンジンへ。「突入」を含むので次のレバーONまで残る。
       * 判定(正解!! / 不正解…)は盤面が言っているので、ここでは当落だけを書く(U8)。
       * サブ行は **正解でも不正解でも成り立つ言い方**にすること
       * (クイズの正誤と当落が別物だ、をここでもう一度伝える役目も持たせてある)。
       */
      { waitFor: 'stop1', after: 700, layer: 'lcd',     action: 'text',
        params: { text: 'CZ突入', sub: 'クイズの正誤とは別に、出目でCZ確定', color: '#ffe066', ms: 1800 } },
      { waitFor: 'stop1', after: 900, layer: 'voice',   action: 'play',  params: { key: 'luna_kita_01', force: true } },
    ],
  },

  {
    id: 'qz_reelpick_miss',
    name: '【ガセ】リール3択クイズ(前兆が何も起きずに終わる)',
    // 前兆が当選を保持していないときにしか出ないイベント = 非当選確定
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_end'], value: ['MISS'], spinsLeft: SPINS_LEFT_HAS_NEXT },
    },
    weight: { FREE_TIER: 120, default: 0 },
    exclusive: true,
    duration: 4000,
    // 出題(次のレバーON)から回答(第1停止)まで畳まない。QUIZ_WAIT_GRACE_MS を参照
    waitGraceMs: QUIZ_WAIT_GRACE_MS,
    cues: [
      /*
       * ── 出題は「次のゲームのレバーON」で出す(2026-08-15 U69)────────────
       * このシナリオは zencho_end(払出処理)で発火する = **まだレバーを引く前**。
       * 【旧】at:0 で出していたため、払出中に盤面が出て → 次のゲームのレバーONを
       *   またいで → その第1停止でやっと発表、という2ゲームまたぎになっていた。
       *   出題がレバー操作と噛み合わず、待ち時間が長いぶん尺切れでも消えていた。
       * 【新】waitFor:'leverOn' で次の回転の頭まで待つ。これで
       *   「レバーON = 出題 / 第1停止 = 回答」が同じゲームに収まり、他の2本と揃う。
       * ※ 当落の担保は when 条件(zencho_end MISS)が持っているので、
       *   出題を遅らせても「非当選が確定した枠」であることは変わらない。
       */
      ...askCues({ waitFor: 'leverOn' }),

      // win:false = このゲームは役が成立しない(盤面が「役は不成立…」を添える)
      { waitFor: 'stop1', layer: 'lcd', action: 'anim',
        params: {
          anim: 'reel_pick_choice', phase: 'answer', win: false,
          pick: '$stop1.index', ms: 3000,
        } },
      { waitFor: 'stop1', after: 40,  layer: 'sfx',   action: 'synth', params: { preset: 'reel_stop' } },
      /*
       * ── 音の系統を分ける(2026-08-15 ユーザー指示 U66-7)────────────────
       * 【旧】ここは error_buzz(障害の警報)を当落の音として鳴らしていたため、
       *   **クイズに正解していてもブッブーが鳴る** = 盤面の「正解!!」と真逆の音になっていた。
       * 【新】正誤の音と当落の音を分ける:
       *   正誤 … quizVerdict(正解=チャイム / 不正解=クイズのブザー)
       *   当落 … 少し遅らせた静かな下降音(cz_lose)。役が成立しなかったことを伝える
       */
      { waitFor: 'stop1', after: 300, layer: 'sfx',   action: 'quizVerdict',
        params: { pick: '$stop1.index', gain: 0.8 } },
      // 学習記録(画も音も出さない。詳しくは qz_reelpick_entry_cz のコメント)
      { waitFor: 'stop1', after: 160, layer: 'learn', action: 'quizResult',
        params: { pick: '$stop1.index' } },
      { waitFor: 'stop1', after: 380, layer: 'char',  action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
      { waitFor: 'stop1', after: 1000, layer: 'sfx',  action: 'synth', params: { preset: 'cz_lose', gain: 0.4 } },
      { waitFor: 'stop1', after: 560, layer: 'lamp',  action: 'pattern', params: { pattern: 'idle' } },
      { waitFor: 'stop1', after: 700, layer: 'voice', action: 'play',   params: { key: 'luna_hmm_01', force: true } },
    ],
  },

  {
    id: 'qz_reelpick_miss_idle',
    name: '【ガセ】リール3択クイズ(通常ゲームで出て役は不成立)',
    /*
     * 「クイズが出たら毎回当たる」を避けるための非当選枠(クイズ時代の指摘を引き継ぐ)。
     *
     * 構造的に非当選が確定する条件だけで発火させる:
     *   flag            … CZ_ENTRY.table に行が無い4役(単独では絶対に当たらない)
     *   zenchoActive    … false = 前兆が走っていない = 当選を保持してもいない
     *   modeState.games … 天井(Auto Recovery)でCZへ飛ぶゲームを除外
     * この3点で「このゲームは何も起きない」が確定するので、
     * 「役は不成立」と出しても嘘にならない(クイズの正誤は別に事実で判定される)。
     */
    when: {
      event: 'leverOn', mode: ['FREE_TIER'], flag: NEVER_WINS,
      match: { 'modeState.zenchoActive': [false], 'modeState.games': NOT_CEILING_GAME },
    },
    weight: { FREE_TIER: 500, default: 0 },
    // クイズ時代の実測値をそのまま引き継ぐ(非当選 35〜45% / 当選 55〜65%)
    chance: 0.046,
    exclusive: true,
    duration: 4000,
    // 回答(第1停止)を何分でも待つ。理由は QUIZ_WAIT_GRACE_MS のコメント
    waitGraceMs: QUIZ_WAIT_GRACE_MS,
    cues: [
      // leverOn 起点なので at:0 = レバーONの瞬間に出題が出る
      ...askCues(),

      { waitFor: 'stop1', layer: 'lcd', action: 'anim',
        params: {
          anim: 'reel_pick_choice', phase: 'answer', win: false,
          pick: '$stop1.index', ms: 3000,
        } },
      { waitFor: 'stop1', after: 40,  layer: 'sfx',  action: 'synth', params: { preset: 'reel_stop' } },
      // 正誤の音(U66-7)。当落の音は下の cz_lose が別系統で担当する
      { waitFor: 'stop1', after: 300, layer: 'sfx',  action: 'quizVerdict',
        params: { pick: '$stop1.index', gain: 0.8 } },
      // 学習記録(画も音も出さない。詳しくは qz_reelpick_entry_cz のコメント)
      { waitFor: 'stop1', after: 160, layer: 'learn', action: 'quizResult',
        params: { pick: '$stop1.index' } },
      { waitFor: 'stop1', after: 380, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
      { waitFor: 'stop1', after: 1000, layer: 'sfx', action: 'synth', params: { preset: 'cz_lose', gain: 0.4 } },
      { waitFor: 'stop1', after: 560, layer: 'lamp', action: 'pattern', params: { pattern: 'idle' } },
    ],
  },
]);
