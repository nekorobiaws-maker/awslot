/**
 * AWSクイズルーレット演出のシナリオ。docs/BACKLOG.md「P: AWSクイズルーレット演出」
 *
 * 出題 → 4択がルーレットで回る → 止まった選択肢が正解なら CZ 突入、不正解ならガセ終了。
 * 盤面は staging/anims/lcdanims-extra.js の `aws_quiz_roulette`、
 * 出題データは src/data/quiz.js。
 *
 * ■ 「正解に止まったら当選」の担保(ここが一番大事)
 *   演出は抽選結果を先に知ってからシナリオを選ぶ(DESIGN.md 4.2)。
 *   その性質を使い、正解版と不正解版を「結果が確定した別々のイベント」に貼り分けてある。
 *
 *   正解版   qz_quiz_entry_cz … `modeEnter` / enterMode: CZ
 *       CZ のモードスタックへ積まれた後にしか流れないイベント。
 *       つまり **このシナリオが動く時点で CZ 突入は確定している**。
 *   不正解版 qz_quiz_miss     … `paramChange` / param: zencho_end, value: MISS
 *       前兆が「何も起きずに終わった」ことを告げるイベント。
 *       freetier.js は当選を保持していない前兆でしか MISS を出さないので、
 *       **このシナリオが動く時点で非当選が確定している**。
 *
 *   どちらも when 条件だけで当落が決まっており、weight や chance を触っても
 *   「非当選なのに正解へ止まる」ことは起こらない。
 *   (逆向き、つまり「当選しているのに不正解で終わる」も起こらない)
 *
 * ■ 他の告知との棲み分け
 *   director は1イベントにつき1シナリオしか再生しない(重み付き抽選)。
 *   - 正解版は CZ の突入演出(cz.js の cz_*_entry、weight 100)と同じ枠を奪い合う。
 *     weight 70 なので CZ 突入のおよそ 40%(2〜3回に1回)がクイズ経由になる。
 *   - 不正解版は前兆のガセ終了(zencho.js の zn_result_miss、weight 100)と同じ枠。
 *     weight 45 で約 30%。「ガセは控えめ」の指示に合わせて正解版より薄くしてある。
 *
 *   前兆の結果告知 zn_result_entry_cz は `zencho_end` 側の別イベントなので、
 *   正解版と同時に走る。ただし読ませたい文字の場所が違ううえ、あちらは
 *   140ms から 800ms の短い一言なので、クイズが結果を出す 2.7 秒時点にはもう消えている。
 *
 *   盤面の座席割り(正は staging/anims/lcdanims-extra.js の QUIZ_* 定数):
 *     y   3〜  8 … 外枠
 *     y   8〜 26 … 問題文(QUIZ_Q_TOP / QUIZ_Q_H)
 *     y  36〜166 … 4択のマス(QUIZ_GRID_TOP + QUIZ_CELL_H×2 + QUIZ_ROW_GAP)
 *     y 182      … 進行バー(QUIZ_BAR_Y)。**告知プレートの裏に回ってよい装飾**
 *     y 250      … 判定ラベル CORRECT!! / MISS(QUIZ_LABEL_Y)
 *     y 278      … 足元の見出し「AWS QUIZ / どのサービス?」(QUIZ_HEAD_Y)
 *   lcd.text の帯は y152〜236 に出るので、**読ませる文字**(問題文・選択肢・判定)は
 *   すべて帯の外に置いてある。帯と重なるのは 182 の装飾バーだけ。
 *   compact:true(正解版)ではこの座標系が 0.74 倍へ縮み、下側がさらに空く。
 *   ※ 選択肢の座標は U15(縦に広げた改修)で y36〜162 → y36〜166 になっている。
 *
 * ■ CZ盤面を潰さない(2026-08-14 検証指摘 V3)
 *   CZ突入版は CZ の1ゲーム目に重なるため、全面を覆うと
 *   「CZがどこまで進んだか」が見えなくなる。正解版のキューには compact:true を渡し、
 *   盤面を 0.74 倍へ縮めて液晶の下側(結論の1行とテロップ帯)を空けてある。
 *   前兆中に出る不正解版(qz_quiz_miss / qz_quiz_miss_idle)は通常ステージの上なので
 *   隠して困る情報が無く、迫力を優先して全面のまま。
 *
 * ■ 進行はリール停止と完全同期(ユーザー要望「ボタンを止めるたびに進行する」)
 *   時間で勝手に進めず、waitFor キューで aws_quiz_roulette の phase を進める:
 *     at:0          → 'start'  出題(4択は出るがルーレットは回らない)
 *     waitFor stop1 → 'spin'   回転開始。次を押すまで何秒でも回り続ける
 *     waitFor stop2 → 'lock'   約1.1秒かけて減速 → 確定。**当落はまだ伏せる**
 *     waitFor stop3 → 'reveal' ○ / ✕ の発表と告知テロップ
 *
 *   どちらのシナリオも「そのゲームの払出処理」で発火するため、
 *   phase を進める stop1〜stop3 は **次のゲーム** の停止操作になる。
 *   つまり「結果が出たゲームで出題 → 次の1回転を自分のペースで消化しながら開ける」
 *   という流れで、当落の保証(上記)は一切変わらない。
 *
 * ■ 背景の当落バレを止める(2026-08-14 ユーザー指摘 U42)
 *   正解版は **CZ の modeEnter** で始まるので、出題した瞬間には既にモードが CZ。
 *   何もしないと液晶の背景・ステージ名・盤面が先に CZ へ変わり、
 *   回答する前に「これは正解する」が分かってしまう。
 *   対策は render 側にあり、シナリオは今までどおりでよい:
 *     staging/anims/lcdanims.js の STAGE_HOLD_ANIMS に aws_quiz_roulette を登録してあり、
 *     phase が 'reveal' になるまで render/lcd.js が **1つ前の背景・ステージ名**を出し続ける
 *     (盤面と液晶テロップもその間は伏せる)。
 *   つまり「正解の発表」と「背景がCZへ変わる」が同じ瞬間に起きる。
 *   不正解版はモードが変わらないので、この仕組みは何もしない(通常背景のまま)。
 *
 * ■ modeEnter とキュー開始時刻
 *   main.js は modeEnter で lcdAnims.clear() を呼んでから director を動かす
 *   (登録順が保証されている)。したがって modeEnter 起点のこのシナリオは
 *   at:0 から液晶アニメを出してよい。逆に zencho_end 起点の不正解版は
 *   モード遷移を伴わないので、こちらも at:0 で問題ない。
 */

import { SESSION } from '../session.js';
import { NORMAL_SUBSTATES } from '../modes.js';
// U46b(2026-08-15): 出題の頭に出す「Bedrock が生成した1行」。
// 文言は data/scenarios/yokoku-bedrock.js が持つ(生成演出の文言を1か所にまとめるため)。
// ここで使うぶんには **必ずクイズが始まる場所** なので「クイズの時間です」が嘘にならない。
import { BEDROCK_QUIZ_INTRO } from './yokoku-bedrock.js';

/**
 * 天井(Auto Recovery)に当たらないゲームの `modeState.games` 一覧。
 *
 * freetier.js は onGame の先頭で games を +1 してから `games >= ceiling` を見るので、
 * レバーON時点の modeState.games が ceiling-1 のゲームが「天井でCZへ飛ぶゲーム」。
 * 不正解クイズはそこを避ける(避けないと「不正解と出たのに天井でCZ」になる)。
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
 * **不正解版だけに必要**なガード。不正解版は zencho_end(払出処理)で発火するため、
 * 進行を担う stop1〜stop3 は「次のゲーム」の停止操作になる。最終回転で出題すると
 * 開ける前にセッションが終わり、告知だけが次のセッションへ残ってしまう。
 *
 * 正解版は不要になった(下の qz_quiz_entry_cz のコメント参照)。
 *
 * 【重要】長さは data/session.js の totalGames から必ず導出すること。
 * 以前は 64 個の固定リストだったため、セッション長が 50 → 100 に伸びた際に
 * spinsLeft が 65 以上のケースが軒並み条件から外れ、クイズの発火率が
 * 41.8% → 5.9% まで落ちる事故を起こした(2026-08-13)。
 */
const SPINS_LEFT_HAS_NEXT = Array.from({ length: SESSION.totalGames }, (_, i) => i + 1);

export default [
  {
    id: 'qz_quiz_entry_cz',
    name: 'AWSクイズルーレット(正解 → CZ突入)',
    // CZ へ入った後にしか来ないイベント = 当選確定。ここでしか correct:true を渡さない
    // 残り回転数のガードは付けない。
    // flow.js の _settleSpinTransition により CZ の modeEnter は「そのスピンのレバーON」で
    // 起きるようになったため、進行を担う stop1〜stop3 は**同じゲームの停止操作**になる。
    // セッションをまたいで告知だけが残る経路が消えたのでガードは不要
    // (残しておくと spinsLeft の上限変更で静かに発火しなくなる副作用のほうが大きい)。
    when: { event: 'modeEnter', enterMode: ['CZ'] },
    weight: { default: 70 },
    // 液晶を丸ごと使うので、走っている間は他の液晶演出とテキスト帯を止める(director が調停する)
    exclusive: true,
    duration: 9000,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'announce' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#7cf3ff', ms: 220 } },
      // ① 出題(ルーレットはまだ回らない)
      // at:0 で出す。以前は 40ms にしていたが、停止操作が極端に速いと
      // waitFor stop1 のキュー(releasedAt=経過時間)が先に発火してしまい、
      // spin → lock → start の順に逆転して出題が引き直される事故があった。
      // modeEnter 起点のこのシナリオは main.js の lcdAnims.clear() より後に走るので
      // at:0 から液晶アニメを出して問題ない(登録順が保証されている)。
      { at: 0,    layer: 'lcd',     action: 'anim',
        params: { anim: 'aws_quiz_roulette', correct: true, phase: 'start', compact: true } },
      // U46b: 出題の合図は「Bedrock が生成した1行」として出す(座布団つきの lcd.text)
      { at: 40,   layer: 'lcd',     action: 'text', params: { ...BEDROCK_QUIZ_INTRO, ms: 1100 } },
      { at: 60,   layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 300,  layer: 'sfx',     action: 'synth', params: { preset: 'ui_select' } },

      // ② 第1停止 → 回転開始(次を押すまで回り続ける)
      { waitFor: 'stop1', layer: 'lcd', action: 'anim',
        params: { anim: 'aws_quiz_roulette', correct: true, phase: 'spin', compact: true } },
      { waitFor: 'stop1', layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
      // 刻み音はアニメの回転速度(170ms/コマ)に合わせる。長回しされた場合は
      // 音は途切れるが、盤面のマーカーが回り続けるので進行は目で分かる
      { waitFor: 'stop1', after: 0, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 170, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 340, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 510, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 680, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 850, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 1020, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 1190, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },

      // ③ 第2停止 → 減速して確定。正解/不正解はまだ伏せたまま点滅で待つ
      { waitFor: 'stop2', layer: 'lcd', action: 'anim',
        params: { anim: 'aws_quiz_roulette', correct: true, phase: 'lock', compact: true } },
      { waitFor: 'stop2', after: 55, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop2', after: 117, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop2', after: 186, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop2', after: 271, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop2', after: 376, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop2', after: 525, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop2', after: 1100, layer: 'sfx',     action: 'synth', params: { preset: 'reel_stop' } },
      { waitFor: 'stop2', after: 1120, layer: 'overlay', action: 'shake', params: { power: 6, ms: 200 } },

      // ④ 第3停止 → 正解発表(アニメは +260ms で判定を出す)
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'anim',
        params: { anim: 'aws_quiz_roulette', correct: true, phase: 'reveal', ms: 2800, compact: true } },
      { waitFor: 'stop3', after: 380, layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 340 } },
      { waitFor: 'stop3', after: 390, layer: 'overlay', action: 'shake', params: { power: 14, ms: 460 } },
      { waitFor: 'stop3', after: 400, layer: 'sfx',     action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 440, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'happy' } },
      { waitFor: 'stop3', after: 460, layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      { waitFor: 'stop3', after: 520, layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 220, y: 110, count: 20 } },
      { waitFor: 'stop3', after: 580, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_reg' } },
      // 告知テロップは可読性エンジンへ。「突入」を含むので次のレバーONまで残る
      { waitFor: 'stop3', after: 640, layer: 'lcd',     action: 'text',
        params: { text: 'CZ突入', sub: 'ベストプラクティス通り', color: '#ffe066', ms: 2000 } },
      { waitFor: 'stop3', after: 900, layer: 'voice',   action: 'play',  params: { key: 'kiro_cz_start_01' } },
    ],
  },

  {
    id: 'qz_quiz_miss',
    name: '【ガセ】AWSクイズルーレット(不正解 → 何も起きずに終わる)',
    // 前兆が当選を保持していないときにしか出ないイベント = 非当選確定
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['zencho_end'], value: ['MISS'], spinsLeft: SPINS_LEFT_HAS_NEXT },
    },
    weight: { FREE_TIER: 120, default: 0 },
    // 正解版と同じく液晶を丸ごと使う
    exclusive: true,
    duration: 9000,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'announce' } },
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      // ① 出題(理由は正解版のコメント参照。停止操作に追い越されないよう at:0)
      { at: 0,    layer: 'lcd',  action: 'anim',
        params: { anim: 'aws_quiz_roulette', correct: false, phase: 'start' } },
      // U46b: 正解版と同じ導入。ここで出し分けると導入だけで当落がバレるため文言は共通
      { at: 40,   layer: 'lcd',  action: 'text', params: { ...BEDROCK_QUIZ_INTRO, ms: 1100 } },
      { at: 60,   layer: 'char', action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 300,  layer: 'sfx',  action: 'synth', params: { preset: 'ui_select' } },

      // ② 第1停止 → 回転開始
      { waitFor: 'stop1', layer: 'lcd', action: 'anim',
        params: { anim: 'aws_quiz_roulette', correct: false, phase: 'spin' } },
      { waitFor: 'stop1', layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
      { waitFor: 'stop1', after: 0, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 170, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 340, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 510, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 680, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 850, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 1020, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 1190, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },

      // ③ 第2停止 → 減速して確定(当落は伏せたまま)
      { waitFor: 'stop2', layer: 'lcd', action: 'anim',
        params: { anim: 'aws_quiz_roulette', correct: false, phase: 'lock' } },
      { waitFor: 'stop2', after: 55, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop2', after: 117, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop2', after: 186, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop2', after: 271, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop2', after: 376, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop2', after: 525, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop2', after: 1100, layer: 'sfx',     action: 'synth', params: { preset: 'reel_stop' } },
      { waitFor: 'stop2', after: 1120, layer: 'overlay', action: 'shake', params: { power: 6, ms: 200 } },

      // ④ 第3停止 → 不正解発表
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'anim',
        params: { anim: 'aws_quiz_roulette', correct: false, phase: 'reveal', ms: 2800 } },
      { waitFor: 'stop3', after: 380, layer: 'sfx',   action: 'synth', params: { preset: 'error_buzz' } },
      { waitFor: 'stop3', after: 440, layer: 'char',  action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
      { waitFor: 'stop3', after: 640, layer: 'lcd',   action: 'text',
        params: { text: '不正解…', sub: 'ドキュメントを読み直そう', color: '#8aa0b4', ms: 1400 } },
      { waitFor: 'stop3', after: 860, layer: 'lamp',  action: 'pattern', params: { pattern: 'idle' } },
      { waitFor: 'stop3', after: 960, layer: 'voice', action: 'play',   params: { key: 'kiro_lose_02' } },
    ],
  },

  {
    id: 'qz_quiz_miss_idle',
    name: '【ガセ】AWSクイズルーレット(通常ゲームで出て不正解に終わる)',
    /*
     * ユーザー指摘「クイズは毎回絶対に正解する。外れるパターンも作って」への対応。
     *
     * 構造的に非当選が確定する条件だけで発火させる:
     *   flag            … CZ_ENTRY.table に行が無い4役(単独では絶対に当たらない)
     *   zenchoActive    … false = 前兆が走っていない = 当選を保持してもいない
     *   modeState.games … 天井(Auto Recovery)でCZへ飛ぶゲームを除外
     * この3点で「このゲームは何も起きない」が確定するので、不正解に止めても嘘にならない
     * (正解 ⇒ 当選 の原則も当然維持される)。
     *
     * nearMiss:true で正解の隣のマスに止まるので、外れても悔しさが残る。
     */
    when: {
      event: 'leverOn', mode: ['FREE_TIER'], flag: NEVER_WINS,
      match: { 'modeState.zenchoActive': [false], 'modeState.games': NOT_CEILING_GAME },
    },
    weight: { FREE_TIER: 500, default: 0 },
    // 実測で「クイズ総数のうち不正解 35〜45% / 正解 55〜65%」に収まる値へ調整(2026-08-13)
    chance: 0.046,
    exclusive: true,
    duration: 9000,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'announce' } },
      { at: 0,    layer: 'lcd',  action: 'anim',
        params: { anim: 'aws_quiz_roulette', correct: false, nearMiss: true, phase: 'start' } },
      // U46b: 正解版と同じ導入(上2本と共通の文言)
      { at: 40,   layer: 'lcd',  action: 'text', params: { ...BEDROCK_QUIZ_INTRO, ms: 1100 } },
      { at: 60,   layer: 'char', action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 300,  layer: 'sfx',  action: 'synth', params: { preset: 'ui_select' } },

      { waitFor: 'stop1', layer: 'lcd', action: 'anim',
        params: { anim: 'aws_quiz_roulette', correct: false, nearMiss: true, phase: 'spin' } },
      { waitFor: 'stop1', layer: 'sfx', action: 'synth', params: { preset: 'charge_up' } },
      { waitFor: 'stop1', after: 0,    layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 340,  layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 680,  layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop1', after: 1020, layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },

      { waitFor: 'stop2', layer: 'lcd', action: 'anim',
        params: { anim: 'aws_quiz_roulette', correct: false, nearMiss: true, phase: 'lock' } },
      { waitFor: 'stop2', after: 186,  layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop2', after: 376,  layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick' } },
      { waitFor: 'stop2', after: 1100, layer: 'sfx', action: 'synth', params: { preset: 'reel_stop' } },

      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'anim',
        params: { anim: 'aws_quiz_roulette', correct: false, nearMiss: true, phase: 'reveal', ms: 2800 } },
      { waitFor: 'stop3', after: 380, layer: 'sfx',  action: 'synth', params: { preset: 'error_buzz' } },
      { waitFor: 'stop3', after: 440, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
      { waitFor: 'stop3', after: 640, layer: 'lcd',  action: 'text',
        params: { text: '不正解…', sub: '惜しい、隣だった', color: '#8aa0b4', ms: 1400 } },
    ],
  },
];
