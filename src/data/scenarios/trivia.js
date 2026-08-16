/**
 * ボーナス中の AWS豆知識カード(tv_)。2026-08-15 ユーザー指示 U59。
 *
 * ══ どういう演出か ═══════════════════════════════════════════════
 * ボーナス(シャーク / ゴースト / ゴーストSP)の消化中、**1ゲームおき**に
 * 「AWSサービス名 + 1行概要」のカードが液晶へ出る。次のゲームのレバーONで消える。
 * この台のコンセプト「遊んで覚える」を、**手が空いている時間**に置いた枠。
 *
 * ■ なぜボーナス中なのか / なぜ RUSH では出さないのか
 *   ボーナスは「ベルを引いて15枚もらう」だけの時間で、液晶の主役は数値3行しかない。
 *   ここは読ませる余白がある。一方 RUSH は上乗せ・継続ジャッジ・DCの推移など
 *   **見なければいけない情報が毎ゲーム動く**ので、読み物を重ねると邪魔になる。
 *   → when.mode を ['BONUS'] に限定して、RUSH には1枚も出さない。
 *
 * ══ 「1ゲームおき」の作り方 ═══════════════════════════════════════
 * game/modes/bonus.js は onGame(= 消化した後)で `state.playedGames` を +1 する。
 * したがってレバーON時点の playedGames は「ここまでに消化し終えたゲーム数」で、
 *   playedGames 0 → 1G目 / 1 → 2G目 / 2 → 3G目 …
 * になる。**偶数のときだけ**発火させれば 1G目・3G目・5G目… = 1ゲームおき。
 * セット継続型(ゴーストSP)は playedGames がセットをまたいで通算されるので、
 * SET 2 以降も途切れずに交互のまま続く。
 *
 * ══ 「次ゲームのレバーONで消える」の作り方 ═══════════════════════
 * 液晶アニメには sticky(次のレバーONまで残る)の仕組みが無い。そこで
 *   1. カードは長めの ms(20秒)で出す = 1ゲームの間は確実に残る
 *   2. **同じシナリオの中に waitFor:'leverOn' のキューを1本置き**、
 *      次のゲームのレバーONで `dismiss:true` の再生へ差し替える
 * とした。LcdAnims.play は **同じIDのアニメを重ねずに差し替える**ので、
 * 差し替えた瞬間に前のカードが消える。
 *   ・director は timeline.notify('leverOn') を **シナリオ抽選より先**に呼ぶので、
 *     このキューが自分自身のレバーONで即発火することはない(必ず次のゲーム)
 *   ・レバーが来ないまま放置されても、20秒でアニメが尺切れになって消える
 *   ・モードが変わったときは main.js の modeEnter が lcdAnims.clear() で消す
 *
 * ══ 演出の交通整理(U8 / staging/director.js)═════════════════════
 * priority:'ambient' を明示している。理由:
 *   カードは **告知でも煽りでもない読み物**なので、
 *   占有枠(announce / visual)を取らせない。取らせてしまうと、
 *   同じゲームに来る「RUSH 当選!!」(bonus_rush_win)や払出のコイン演出を
 *   slot-busy で蹴落としてしまう(カードは20秒生きるので1ゲーム丸ごと枠を握る)。
 * 液晶の場所取りは U8 のとおりカード側の座標で解決してある
 * (staging/anims/lcdanims-extra.js の TRIVIA_CARD。獲得枚数・残りG・SET には重ならない)。
 * カードが出している文言はアニメ側から ANIM_HEADLINES で申告済みなので、
 * 同じサービス名がテロップに二重で出ることもない。
 *
 * ══ 当落への影響 ═══════════════════════════════════════════════
 * ゼロ。発火条件は消化ゲーム数の偶奇だけで、chance も持たない(= 演出RNGも引かない)。
 * どのカードを引くかは data/quiz.js の pickTrivia(Math.random)で、
 * ゲーム抽選RNGとは完全に別系統。?seed= の再現性は1ミリも動かない。
 */

import { AWS_TRIVIA } from '../quiz.js';

/* ══ デバッグ用の内容固定 ═══════════════════════════════════════════
 *
 *   ?trivia=nitro   … サービス名に 'nitro' を含むカードだけを出す(大小文字は無視)
 *   ?trivia=aurora  … 同上
 *
 * 出す**タイミング**(ボーナス中の1ゲームおき)は変えない。
 * 「狙ったカードの文字組みが液晶に収まるか」を確かめるための口なので、
 * 発火条件を緩めると確認したい状況そのものが変わってしまうため。
 * ?mode=BONUS と併用すると起動直後から確認できる。
 */
const TRIVIA_DEBUG = {
  /** @type {string|null} 固定するサービス名(完全一致の値。未指定なら null) */
  service: (() => {
    if (typeof location === 'undefined') return null;
    const q = new URLSearchParams(location.search ?? '').get('trivia');
    if (!q || q === '1') return null;
    const needle = q.toLowerCase();
    const hit = AWS_TRIVIA.find((t) => t.service.toLowerCase().includes(needle));
    if (!hit) {
      console.warn(`[JAWSLOT] ?trivia= に一致する豆知識がありません: ${q}`);
      return null;
    }
    return hit.service;
  })(),
};

/**
 * カードを出すゲーム(= レバーON時点の modeState.playedGames)。
 *
 * 偶数だけを並べた配列。director の when.match は配列 includes で判定するので、
 * 「偶数」を式では書けず、こうして列挙する必要がある。
 * 上限は余裕を持って 400(ゴーストSPが 6G × 継続50% で 200セット続いても届かない)。
 */
const EVERY_OTHER_GAME = Array.from({ length: 200 }, (_, i) => i * 2);

export default [
  {
    id: 'tv_bonus_trivia_card',
    name: '【学習】ボーナス中のAWS豆知識カード(1ゲームおき)',
    when: {
      event: 'leverOn',
      mode: ['BONUS'],
      match: { 'modeState.playedGames': EVERY_OTHER_GAME },
    },
    weight: { BONUS: 100, default: 0 },
    // 読み物なので枠を取らない(理由はファイル冒頭)
    priority: 'ambient',
    /*
     * duration は「キューを出し終えるまで」の目安。
     * waitFor:'leverOn' のキューが残っている間は Timeline が
     * duration + 20000ms まで生かしてくれる(engine/timeline.js の maxLifetime)ので、
     * 次のゲームのレバーONまで待てる。
     */
    duration: 600,
    cues: [
      // 小さいチャイム。ベルの入賞音や払出音の邪魔をしない音量にしてある
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.3 } },
      /*
       * カードの横で解説ポーズ(U71: explain → present = グラフを指すポーズ)。
       * 読み物の主役はカードなので、ルナは指し示すだけで文字には触れない
       * (立ち位置はモード既定のまま。カードは重ならない座標に描かれている)。
       * ポーズを素へ戻すキューは置かない — カードが消えるより先に
       * render/chars/index.js が9秒で静かな立ち姿へ寝かせる。
       */
      { at: 120, layer: 'char', action: 'show', params: { char: 'kiro', pose: 'explain' } },
      /*
       * カードを読んだ相槌(2026-08-16 U81)。「へぇ〜、そうなんだ」。
       *
       * ■ ここだけ専用の1本にした理由
       *   カードは **当落と完全に無関係な読み物** なので、
       *   予兆の束(react / tease)を貼ると「何か起きるかも」の合図に読めてしまう。
       *   逆に cheer を貼ると進捗を祝う声になって、読み物の場に合わない。
       *   学習の場にだけ効く1本を key 直指定で置く。
       * ■ 半分くらいで鳴る
       *   カードは1ゲームおきに出るので、毎回喋ると読む前に声が被る。
       *   force は付けていないので、同じゲームに来る払出の告知が優先される。
       */
      { at: 900, layer: 'voice', action: 'play', params: { key: 'luna_learn_hee_01', chance: 0.5 } },
      {
        at: 0,
        layer: 'lcd',
        action: 'anim',
        params: {
          anim: 'aws_trivia_card',
          ms: 20000,
          /*
           * getter にしてあるのは、timeline.js の resolveParams が
           * Object.entries でキュー発火のたびに値を読み直すため
           * (この params オブジェクトは全再生で共有されるので、
           *  参照のたびに評価される形にしておくのが安全)。
           * 通常プレイでは常に null = アニメ側が pickTrivia で引く。
           *
           * ※ TRIVIA_DEBUG.service は**モジュール読み込み時に1度だけ**決まる値なので、
           *   ページを開いたまま ?trivia= を書き換えても切り替わらない(要リロード)。
           *   2026-08-15 椿レビュー #13 で、実装と食い違っていた説明を落とした。
           */
          get service() { return TRIVIA_DEBUG.service; },
        },
      },
      // 次のゲームのレバーONで消す(同じIDの再生で差し替える)
      { waitFor: 'leverOn', layer: 'lcd', action: 'anim', params: { anim: 'aws_trivia_card', dismiss: true, ms: 60 } },
    ],
  },
];
