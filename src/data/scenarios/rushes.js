/**
 * RUSH 4種(U11 / 2026-08-14)の演出シナリオ。
 *
 *   ボーナス中のRUSH当選告知 … bonus_rush_win
 *   オートスケーリングRUSH    … as_rush_scale_out(突入は rush.js の rush_entry)
 *   CloudFront RUSH          … cf_rush_entry / cf_rush_hit / cf_rush_jackpot
 *   Aurora RUSH              … aurora_rush_entry / aurora_scale_up
 *   ヒーローRUSH             … hero_rush_entry / hero_rush_hit
 *   共通の終了               … rush_end_*
 *
 * ■ 「結果の画は当落確定イベントのみ」(全系統共通の原則)
 *   ここで出す画はすべて **もう確定した事実** にしか紐付いていない:
 *     rush_win   … ゲーム側が RUSH 当選を確定させた瞬間(game/modes/bonus.js)
 *     scale_out  … 台数が実際に増えた瞬間(game/modes/asrush.js)
 *     cf_hit     … 払い出しが確定した瞬間(game/modes/rushes.js)
 *     acu_up     … 純増が実際に上がった瞬間
 *     hero_game  … 1ゲームの当落が出た瞬間
 *   煽り(これから当たるかも)を作る余地はどこにも無い = 裏切りが構造的に起きない。
 *
 * ■ 表示原則 U8(二重表示の禁止)
 *   液晶の常設パネル(render/lcd-rush.js)が「いまの状態」を出しているので、
 *   ここでは **瞬間の出来事** だけを短く出す。数字を繰り返さない。
 *
 * ■ 否定文言は、そのイベントが起きる回には構造的に出さない(2026-08-15 U67-2)
 *   ここの結果告知は「起きた瞬間」にしか出ないので単体では安全だが、
 *   **同じゲームに別ファイルの予告が「まだ起きません」と被せてくる**と
 *   画面が自己矛盾する。実際 Aurora RUSH でスイカを引くと
 *     aurora_scale_up(SCALE UP!! ACU が上がった)
 *     + yokoku-gimmick.js の CloudWatch 予告(まだスケールしません)
 *   が同時に出ていた(ユーザー指摘)。
 *
 *   RUSH 4種の上乗せ契機は **すべてレア役**(data/rareroles.js の isRareRole)で
 *   統一されている:
 *     AS_RUSH     addUnitsByFlag … 台数(= 残りG)が増える
 *     AURORA_RUSH acuUpByFlag    … ACU(純増)が上がる + 残りG +1
 *     CF_RUSH     coinByFlag     … 確定クレジットが乗る
 *     HERO_RUSH   coinByFlag     … +α が乗る
 *   したがって **レア役のゲームに否定・待機系の文言を出したら必ず嘘になる**。
 *   否定側を書くときは when からレア役を丸ごと外す(`rare: false`)か、
 *   payload で外す(下の hero_rush_miss の `bonus:[0]` が手本)。
 *   ルールの全文と点検結果は data/scenarios/yokoku-gimmick.js の
 *   「RUSH中の上乗せ期待予告」セクション冒頭。
 */

/*
 * heroHitLabel(「毎ゲーム n% で m枚」)は U76-1 でここから消えた。
 * 当選率と枚数を出すのは **盤面(render/lcd-rush.js)だけ** という整理で、
 * ここへ戻すと突入ポップアップと盤面 y52 が二重になる(下の hero_rush_entry を参照)。
 */
import { RUSH_SPEC_BY_ID } from '../rushes.js';

const CF = RUSH_SPEC_BY_ID.CF_RUSH;
const HERO = RUSH_SPEC_BY_ID.HERO_RUSH;

/**
 * CloudFront の「跳ねた」枚数(hitCoinDist の上位2段)。
 * data から導出しているので、バランス調整で枚数を変えても演出の条件が勝手に追従する
 * (ここを直書きすると、テーブルを触った瞬間に大量ヒットの演出が死ぬ)。
 */
const CF_JACKPOT_COINS = Object.keys(CF.hitCoinDist)
  .map(Number)
  .sort((a, b) => b - a)
  .slice(0, 2);

/**
 * ヒーローRUSH の「レア役 +α」で乗りうる枚数(HERO.coinByFlag の値)。
 *
 * paramChange 'hero_game' の payload は bonus に +α の枚数を積んでくるので、
 * この一覧に一致するかどうかで「レア役が絡んだゲーム」を判定できる。
 * data から導出しているので、バランス調整で枚数を変えても演出が勝手に追従する
 * (直書きするとテーブルを触った瞬間に +α の演出が死ぬ)。
 */
const HERO_BONUS_COINS = [...new Set(Object.values(HERO.coinByFlag ?? {}))];

export default [
  /* ── ボーナス中のRUSH当選(U11 の主経路)──────────────────
   *
   * 「レア役を引けたら RUSH 抽選」(U22)の当たり側。ここが出た瞬間に RUSH は確定する。
   * ただし **どのRUSHかはまだ出さない**(種別はボーナス終了時に確定するため)。
   * 「何かに入る」の期待だけを膨らませて、突入カットインで種類が割れる作り。
   */
  {
    id: 'bonus_rush_win',
    name: 'ボーナス中のRUSH当選(レア役契機)',
    when: { event: 'paramChange', mode: ['BONUS'], match: { param: ['rush_win'] } },
    weight: { BONUS: 200, default: 0 },
    priority: 'result',
    duration: 2600,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit' } },
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 260 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 20, ms: 460 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rush' } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 200,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      { at: 260,  layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 300,  layer: 'lcd',     action: 'text',
        params: {
          text: 'RUSH 当選!!', sub: 'ボーナス消化後に突入 — 種類はまだ分からない',
          color: '#ffe066', ms: 2000, sticky: true,
        } },
      { at: 400,  layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 360, count: 26 } },
    ],
  },

  /* ── ① オートスケーリングRUSH:オートスケール(上乗せ)────────── */
  {
    id: 'as_rush_scale_out',
    name: 'オートスケール(EC2が増えて残りGが伸びる)',
    /*
     * game/modes/asrush.js の paramChange { param:'scale_out', value:台数, delta:増えた台数 }。
     * 旧実装の param:'dc'(純増段階)とは意味が違うので名前を変えてある
     * (古い rush_scale_out はこの改修で退役した)。
     *
     * ■ U31(2026-08-14): ここは AS_RUSH 唯一の見せ場なので、
     *   小さなアイコン増殖(asg_multiply)から **専用の大告知**へ格上げした。
     *   大文字「スケールアウト!!」+ EC2 が湧く + 台数のカウントアップ + 光と音。
     *   撃たれるのは「実際に台数が増えた瞬間」だけなので、煽りにはならない。
     */
    when: { event: 'paramChange', match: { param: ['scale_out'] } },
    weight: { default: 100 },
    // 上乗せは結果告知。調停で落とされると「増えたのに何も起きない」になる
    priority: 'result',
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'scale_out' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#7bf7d0', ms: 240 } },
      { at: 0,   layer: 'overlay', action: 'shake', params: { power: 14, ms: 380 } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rush' } },
      // n = 増えたあとの台数 / delta = 増えた台数(= 伸びたゲーム数)
      { at: 0,   layer: 'lcd',     action: 'anim',
        params: { anim: 'scale_out_slam', n: '$value', delta: '$delta' } },
      { at: 60,  layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit', gain: 0.5 } },
      { at: 60,  layer: 'lcd',     action: 'particles', params: { preset: 'scale', x: 220, y: 110, count: 22 } },
      { at: 60,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 60,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      // カウントアップが止まるあたりで、もう一度だけ音で押す
      { at: 560, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_reg', gain: 0.6 } },
      /*
       * 上乗せの一言(U68 → U81 でプール化 + 増量)。
       * 「まだまだ〜」1本だと RUSH 中ずっと同じ声になるので、
       * cheer(「よしっ」「つぎつぎ!」「まだまだ〜」…)から1本引く。
       * 台数が増えたことは液晶が大きく出している **確定した事実**なので、
       * 追認する言い方でよい(当落や残りゲーム数は語らない = data/voicepools.js)。
       * 上乗せは何度も起きるので、chance と 1ゲーム1本で間引くのは今までどおり。
       */
      { at: 200, layer: 'voice',   action: 'play',  params: { pool: 'cheer', chance: 0.45 } },
      { at: 1400, layer: 'char',   action: 'pose',  params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  /* ── ② CloudFront RUSH ───────────────────────────── */
  {
    id: 'cf_rush_entry',
    name: 'CloudFront RUSH 突入',
    when: { event: 'modeEnter', enterMode: ['CF_RUSH'], match: { resumed: [false] } },
    weight: { default: 100 },
    duration: 3400,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth',  params: { preset: 'charge_up' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rush' } },
      { at: 0,    layer: 'overlay', action: 'flash',  params: { color: '#ffffff', ms: 240 } },
      { at: 0,    layer: 'overlay', action: 'cutin',  params: { id: 'rush_slam', variant: 'CF_RUSH' } },
      { at: 220,  layer: 'sfx',     action: 'synth',  params: { preset: 'freeze_hit' } },
      { at: 220,  layer: 'overlay', action: 'shake',  params: { power: 24, ms: 500 } },
      { at: 640,  layer: 'sfx',     action: 'synth',  params: { preset: 'edge_hit' } },
      { at: 900,  layer: 'sfx',     action: 'synth',  params: { preset: 'fanfare_big' } },
      { at: 1400, layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'happy' } },
      // RUSH突入の告知(U68)。間引かない
      { at: 1600, layer: 'voice',   action: 'play',   params: { key: 'luna_rush_01', force: true } },
      { at: 1700, layer: 'lcd',     action: 'text',
        params: {
          text: 'CLOUDFRONT RUSH 突入!!', sub: 'エッジのキャッシュヒットが即・払い出し',
          color: '#8fb4ff', ms: 2000,
        } },
      { at: 1900, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_bonus' } },
      { at: 2100, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 380, count: 24 } },
    ],
  },
  {
    id: 'cf_rush_hit',
    name: 'CloudFront キャッシュヒット(払い出し)',
    when: { event: 'paramChange', mode: ['CF_RUSH'], match: { param: ['cf_hit'] } },
    weight: { CF_RUSH: 100, default: 0 },
    duration: 1300,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'edge_hit' } },
      { at: 0,   layer: 'lcd', action: 'anim',
        params: { anim: 'cf_edge_fly', add: '$delta', edge: '$edge' } },
      { at: 60,  layer: 'lcd', action: 'particles', params: { preset: 'coin', x: 220, y: 150, count: 14 } },
      /*
       * 払い出しへの相槌(U81)。CloudFront RUSH は毎ゲーム必ずここを通るので、
       * AS の上乗せ(chance 0.45)より低めにして喋りすぎを防ぐ。
       * 払い出された枚数は液晶が出している事実なので cheer で追認してよい。
       */
      { at: 220, layer: 'voice', action: 'play', params: { pool: 'cheer', chance: 0.3 } },
    ],
  },
  {
    id: 'cf_rush_jackpot',
    name: 'CloudFront 大量ヒット(上位レコード)',
    /*
     * hitCoinDist の上位2段だけを撃つ(CF_JACKPOT_COINS で data から導出)。
     * 枚数そのものは液晶が大きく出しているので、ここは「跳ねた」瞬間の音と光だけ。
     */
    when: {
      event: 'paramChange',
      mode: ['CF_RUSH'],
      match: { param: ['cf_hit'], value: CF_JACKPOT_COINS },
    },
    weight: { CF_RUSH: 400, default: 0 },
    priority: 'result',
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#cfe0ff', ms: 300 } },
      { at: 0,   layer: 'overlay', action: 'shake', params: { power: 18, ms: 460 } },
      { at: 120, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_reg' } },
      { at: 160, layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 300, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 360, count: 30 } },
      // F1(2026-08-14 ファクトチェック): 旧「ORIGIN SHIELD 突破!!」は意味が逆だった。
      // Origin Shield は突破されるものではなく、**ここで全部ヒットして
      // オリジンまで行かせない** のが良い状態。大量払い出しの画に合うのはヒット側。
      { at: 400, layer: 'lcd',     action: 'text',
        params: { text: 'ORIGIN SHIELD 全ヒット!!', sub: 'オリジンまで行かず一気に払い出し', color: '#8fb4ff', ms: 1400 } },
    ],
  },

  /* ── ③ Aurora RUSH ──────────────────────────────── */
  {
    id: 'aurora_rush_entry',
    name: 'Aurora RUSH 突入',
    when: { event: 'modeEnter', enterMode: ['AURORA_RUSH'], match: { resumed: [false] } },
    weight: { default: 100 },
    duration: 3400,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth',  params: { preset: 'charge_up' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rush' } },
      { at: 0,    layer: 'overlay', action: 'flash',  params: { color: '#ffffff', ms: 240 } },
      { at: 0,    layer: 'overlay', action: 'cutin',  params: { id: 'rush_slam', variant: 'AURORA_RUSH' } },
      { at: 220,  layer: 'sfx',     action: 'synth',  params: { preset: 'freeze_hit' } },
      { at: 220,  layer: 'overlay', action: 'shake',  params: { power: 24, ms: 500 } },
      { at: 640,  layer: 'sfx',     action: 'synth',  params: { preset: 'dynamo_scale' } },
      { at: 900,  layer: 'sfx',     action: 'synth',  params: { preset: 'fanfare_big' } },
      { at: 1400, layer: 'char',    action: 'show',   params: { char: 'george', pose: 'grin' } },
      { at: 1400, layer: 'char',    action: 'motion', params: { char: 'george', motion: 'swimIn' } },
      // RUSH突入の告知(U68)。間引かない
      { at: 1600, layer: 'voice',   action: 'play',   params: { key: 'luna_rush_01', force: true } },
      { at: 1700, layer: 'lcd',     action: 'text',
        params: {
          // 初見でも意味が取れるように「何が増えるのか」を先に言う(AWS 用語は名前側に任せる)
          text: 'AURORA RUSH 突入!!', sub: 'レア役で純増(1ゲームの増え方)がアップ',
          color: '#b48bff', ms: 2000,
        } },
      { at: 1900, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_rush' } },
    ],
  },
  {
    id: 'aurora_scale_up',
    name: 'Aurora スケールアップ(純増UP)',
    /*
     * ■ U41(2026-08-14): AS のスケールアウト(U31)と同格の大告知へ。
     *   演出言語は揃えつつ、意味の違いが一目で分かるようにしてある:
     *     AS     … EC2 が **横に増える**(台数が並ぶ)
     *     Aurora … データベースの円筒が **大きく育つ**(器が増える)
     *   ACU の上がり幅と「+1G」も同じ画の中で見せるので、
     *   何が得したのかを1回で読める(テロップとは別の切り口 = U8 に抵触しない)。
     */
    when: { event: 'paramChange', mode: ['AURORA_RUSH'], match: { param: ['acu_up'] } },
    weight: { AURORA_RUSH: 200, default: 0 },
    priority: 'result',
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'dynamo_scale' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#b48bff', ms: 240 } },
      { at: 0,   layer: 'overlay', action: 'shake', params: { power: 12, ms: 360 } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rush' } },
      // acu = 上がったあとのACU / delta = 上げ幅 / addGames はレア役で必ず +1G(U24)
      { at: 0,   layer: 'lcd',     action: 'anim',
        params: { anim: 'scale_up_slam', acu: '$value', delta: '$delta', addGames: 1 } },
      { at: 60,  layer: 'lcd',     action: 'particles', params: { preset: 'scale', x: 220, y: 96, count: 22 } },
      { at: 80,  layer: 'char',    action: 'show',  params: { char: 'george', pose: 'grin' } },
      { at: 80,  layer: 'char',    action: 'motion', params: { char: 'george', motion: 'bounce' } },
      // 純増アップの一言(U81)。AS のスケールアウトと同格の見せ場なので同じ扱いにする
      { at: 220, layer: 'voice',   action: 'play',  params: { pool: 'cheer', chance: 0.45 } },
      { at: 560, layer: 'sfx',     action: 'synth', params: { preset: 'upgrade_chime' } },
    ],
  },

  /* ── ④ ヒーローRUSH(プレミア)───────────────────── */
  {
    id: 'hero_rush_entry',
    name: 'ヒーローRUSH 突入(プレミア)',
    when: { event: 'modeEnter', enterMode: ['HERO_RUSH'], match: { resumed: [false] } },
    weight: { default: 100 },
    // プレミアなので画面を独占する(走っている間ほかの画面系演出は止まる)
    exclusive: true,
    priority: 'result',
    duration: 4200,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth',  params: { preset: 'charge_up' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'overlay', action: 'flash',  params: { color: '#ffffff', ms: 320 } },
      { at: 0,    layer: 'overlay', action: 'cutin',  params: { id: 'rush_slam', variant: 'HERO_RUSH' } },
      { at: 240,  layer: 'sfx',     action: 'synth',  params: { preset: 'freeze_hit' } },
      { at: 240,  layer: 'overlay', action: 'shake',  params: { power: 30, ms: 620 } },
      { at: 700,  layer: 'sfx',     action: 'synth',  params: { preset: 'fanfare_ending' } },
      { at: 1000, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 360, count: 40 } },
      // ── 主役の登場(U30)──
      // カットイン(cutins-extra.js の rush_slam / variant:HERO_RUSH)で大写しになった
      // ヒーローが、そのまま液晶へ降りてきて両拳バンザイで立つ。
      { at: 1200, layer: 'char',    action: 'show',   params: { char: 'hero', pose: 'banzai' } },
      { at: 1200, layer: 'char',    action: 'motion', params: { char: 'hero', motion: 'heroDebut' } },
      { at: 1200, layer: 'sfx',     action: 'synth',  params: { preset: 'upgrade_chime' } },
      { at: 1500, layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'happy' } },
      { at: 1500, layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      // プレミアRUSHの突入告知(U68)。間引かない
      { at: 1650, layer: 'voice',   action: 'play',   params: { key: 'luna_rush_01', force: true } },
      /*
       * ── 名前と仕様は言わない(2026-08-15 ユーザー指摘 U76-1)────────────
       *
       * 旧:  text 'HERO RUSH 突入!!' / sub '5G限定 — 毎ゲーム 80% で 70枚'
       * これは盤面(render/lcd-rush.js の drawHeroRush)と **二重** だった:
       *   'HERO RUSH'          … 盤面の大ロゴ(y152)と同じ文字が、
       *                          同じ y152〜236 の帯に重なって出ていた
       *   '5G限定 — 毎ゲーム…' … 盤面の y52 が常設で出している同じ一文
       * 表示原則 U8「同じことは1か所」+ Q2(GHOST BONUS SP)の流儀に合わせ、
       * **常設側(盤面)を残してこちらを落とす**。
       *
       * 残すのは「いま何が起きたか」= AWS Hero に選ばれた瞬間だけ。
       * 文言は game/modes/rushes.js の突入テロップと同じ語彙にそろえてある。
       * sub を持たせないのは、書けることが全部盤面にあるため
       * (5G限定・当選率と枚数は y52、レア役の +α は常設のルール行)。
       */
      /*
       * ── 2026-08-16 検証指摘 V80-10 ───────────────────────────────────
       * sticky:true は「次のレバーONまで残る」なので、突入直後にレバーを引かない
       * (= 演出を見ている)プレイヤーの画面では **5.6秒出っぱなし** になり、
       * 5つの枠と当落の数字を覆い続けていた。
       * ここは「AWS Hero に選ばれた」という **瞬間の告知** なので、
       * sticky を外して 2秒で引く(盤面の情報が主役に戻る)。
       */
      { at: 1800, layer: 'lcd',     action: 'text',
        params: {
          text: 'AWS Hero に選出!!',
          color: '#ffd166', ms: 2000, sticky: false,
        } },
      { at: 2000, layer: 'bgm',     action: 'change', params: { bgm: 'bgm_ending' } },
      // 決めポーズのあとは待機の顔へ戻す(以降は毎ゲームの当落でリアクションする)
      { at: 3200, layer: 'char',    action: 'pose',   params: { char: 'hero', pose: 'glasses' } },
    ],
  },
  {
    id: 'hero_rush_hit',
    // 枚数は data/rushes.js の HERO.hitCoin が正(表示文言は heroHitLabel())。
    // 名前に数字を書き写すと調整のたびに嘘になるので、値はここに持たせない
    name: 'ヒーローRUSH 毎ゲーム抽選に当選',
    /*
     * bonus:[0] を足したのは、レア役の +α が乗ったゲーム(hero_rush_bonus_*)と
     * 抽選で取り合いにならないようにするため。
     * ゲーム側(game/modes/rushes.js)は +α が無いとき必ず bonus:0 を送ってくる。
     */
    when: {
      event: 'paramChange', mode: ['HERO_RUSH'],
      match: { param: ['hero_game'], hit: [true], bonus: [0] },
    },
    weight: { HERO_RUSH: 200, default: 0 },
    priority: 'result',
    duration: 1800,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_reg' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ffe9a8', ms: 260 } },
      { at: 0,   layer: 'overlay', action: 'shake', params: { power: 14, ms: 360 } },
      // 引けた! ヒーローが金貨を掲げてぴょんぴょん跳ねる
      { at: 0,   layer: 'char',    action: 'show',  params: { char: 'hero', pose: 'coin' } },
      { at: 0,   layer: 'char',    action: 'motion', params: { char: 'hero', motion: 'heroHop' } },
      { at: 60,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 120, layer: 'lcd',     action: 'particles', params: { preset: 'coin', x: 220, y: 120, count: 22 } },
      /*
       * 毎ゲーム抽選に当たった瞬間の一言(U81)。
       * ヒーローRUSH は 5G のあいだ毎ゲーム当落がその場で出きるので、
       * ここは **もう決まったこと** への反応 = cheer で追認してよい。
       * 外した側(hero_rush_miss)には relief を同じ確率で貼ってあるので、
       * 「声が鳴った = 当たった」にはならない(どちらでも喋る)。
       */
      { at: 260, layer: 'voice',   action: 'play',  params: { pool: 'cheer', chance: 0.45 } },
      { at: 900, layer: 'sfx',     action: 'synth', params: { preset: 'coin_in', gain: 0.5 } },
      { at: 1400, layer: 'char',   action: 'pose',  params: { char: 'hero', pose: 'guts' } },
    ],
  },
  {
    id: 'hero_rush_miss',
    name: 'ヒーローRUSH 非当選(次のゲームへ)',
    /*
     * U67-2 の「否定文言は構造的に交わらせない」の手本。
     *   bonus:[0] … レア役の +α が乗ったゲーム(hero_rush_bonus / _bonus_hit)を
     *               payload の時点で除外している。
     *   さらにこの画は **文字を出さない**(ヒーローの表情と音だけ)ので、
     *   仮に条件が緩んでも「起きなかった」と言い切ってしまうことがない。
     */
    when: {
      event: 'paramChange', mode: ['HERO_RUSH'],
      match: { param: ['hero_game'], hit: [false], bonus: [0] },
    },
    weight: { HERO_RUSH: 100, default: 0 },
    duration: 1200,
    cues: [
      { at: 0, layer: 'sfx',  action: 'synth', params: { preset: 'countdown_tick' } },
      // 外した… ヒーローは汗をかいて縮こまる(次で取り返す顔へ戻る)
      { at: 0, layer: 'char', action: 'show',  params: { char: 'hero', pose: 'sweat' } },
      { at: 0, layer: 'char', action: 'motion', params: { char: 'hero', motion: 'heroShrink' } },
      { at: 0, layer: 'char', action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      /*
       * 外した側の一息(U81)。当選側(hero_rush_hit)と **同じ chance** で貼ってある。
       * 束は relief(「くぅ〜!」「ふぅ…」)= 決着したあとの声で、
       * この画は文字を1つも出さない方針(U67-2)なので声も結果を言い切らない。
       */
      { at: 260, layer: 'voice', action: 'play', params: { pool: 'relief', chance: 0.45 } },
      { at: 600, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'normal' } },
      { at: 900, layer: 'char', action: 'pose', params: { char: 'hero', pose: 'doya' } },
    ],
  },
  {
    id: 'hero_rush_bonus_hit',
    name: 'ヒーローRUSH レア役+α(当選と同時)',
    /*
     * レア役の +α(HERO.coinByFlag)が乗ったゲーム。value / delta は合計払出なので、
     * 「+α が乗ったか」は bonus の値そのもので判定する
     * (data から導出しているので、テーブルを触っても演出の条件が自動で追従する)。
     */
    when: {
      event: 'paramChange', mode: ['HERO_RUSH'],
      match: { param: ['hero_game'], hit: [true], bonus: HERO_BONUS_COINS },
    },
    weight: { HERO_RUSH: 300, default: 0 },
    priority: 'result',
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'freeze_hit' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#fff3c0', ms: 300 } },
      { at: 0,   layer: 'overlay', action: 'shake', params: { power: 20, ms: 460 } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,   layer: 'char',    action: 'show',  params: { char: 'hero', pose: 'coin' } },
      { at: 0,   layer: 'char',    action: 'motion', params: { char: 'hero', motion: 'heroCoinUp' } },
      { at: 200, layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_big' } },
      { at: 300, layer: 'lcd',     action: 'particles', params: { preset: 'coin', x: 220, y: 120, count: 30 } },
      { at: 700, layer: 'char',    action: 'pose',  params: { char: 'hero', pose: 'party' } },
      { at: 700, layer: 'char',    action: 'motion', params: { char: 'hero', motion: 'heroHop' } },
      { at: 1700, layer: 'char',   action: 'pose',  params: { char: 'hero', pose: 'guts' } },
    ],
  },
  {
    id: 'hero_rush_bonus',
    name: 'ヒーローRUSH レア役+α(当選は外したが上乗せ)',
    when: {
      event: 'paramChange', mode: ['HERO_RUSH'],
      match: { param: ['hero_game'], hit: [false], bonus: HERO_BONUS_COINS },
    },
    weight: { HERO_RUSH: 300, default: 0 },
    priority: 'result',
    duration: 1800,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'rare_flag' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ffe9a8', ms: 220 } },
      // 抽選は外したが、レア役ぶんはちゃんと払い出される = 星ウインクで指差し
      { at: 0,   layer: 'char',    action: 'show',  params: { char: 'hero', pose: 'wink' } },
      { at: 0,   layer: 'char',    action: 'motion', params: { char: 'hero', motion: 'heroCoinUp' } },
      { at: 120, layer: 'sfx',     action: 'synth', params: { preset: 'coin_in' } },
      { at: 200, layer: 'lcd',     action: 'particles', params: { preset: 'coin', x: 220, y: 130, count: 18 } },
      { at: 1300, layer: 'char',   action: 'pose',  params: { char: 'hero', pose: 'doya' } },
    ],
  },

  /* ── 共通: RUSH 終了(引き戻し層へ)───────────────────
   *
   * 4種とも game/modes/rushes.js の rushEndResult が
   *   setEnd { result:'RUSH_END', rushId, gained }
   * を出してから onNextSpin で HOT_STANDBY へ落ちる。
   * この画は「終わった」ことを見せ切るためのもので、遷移より先に必ず見える。
   */
  {
    id: 'rush_end_all',
    name: 'RUSH 終了(全種共通)',
    when: { event: 'setEnd', match: { result: ['RUSH_END'] } },
    weight: { default: 100 },
    priority: 'result',
    duration: 2600,
    cues: [
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'health_check' } },
      { at: 0,    layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'panic' } },
      { at: 0,    layer: 'lcd',     action: 'anim',
        params: { anim: 'health_check_impact', ok: false, ms: 2400 } },
      { at: 300,  layer: 'sfx',     action: 'synth', params: { preset: 'countdown_tick' } },
      { at: 800,  layer: 'sfx',     action: 'synth', params: { preset: 'charge_up' } },
      { at: 1350, layer: 'overlay', action: 'flash', params: { color: '#ff4d4d', ms: 280 } },
      { at: 1360, layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 1380, layer: 'sfx',     action: 'synth', params: { preset: 'error_buzz' } },
      /*
       * ── この1枚だけが「終わった」を言葉にする(2026-08-15 ユーザー指示 U64-7)──
       *
       * 以前は同じ瞬間に health_check_impact が 'UNHEALTHY' を y148 へ描いており、
       * このポップアップ(プレートは y151〜236)と **2枚重なって**いた。
       * 「同時に出す告知は1枚」に合わせ、**盤面側の文字を全部落とした**
       * (向こうは赤い枠・止まった心電図・赤フラッシュだけで落ちたことを見せる)。
       * したがって RUSH 終了の言葉はこの1本が唯一。**盤面へ文字を戻さないこと。**
       *
       * U17(2026-08-14): 行き先は TEXT_CATEGORIES の 'standby' で束ねてあるので、
       * このポップアップが出ている間はモード側のテロップ
       * (ディストリビューション終了… / クラスターが縮退… など)が自動で黙る。
       */
      // U78: 旧サブ「引き戻しに期待」はパチスロの機能語だけで、AWS のことを
      //      1文字も言っていなかった。直前の画(ヘルスチェック失敗)と
      //      行き先(ホットスタンバイ)を言葉でも出す
      { at: 1700, layer: 'lcd',     action: 'text',
        params: { text: 'RUSH 終了', sub: 'ヘルスチェック失敗 — ホットスタンバイで引き戻しへ', color: '#ff8a8a', ms: 1500 } },
    ],
  },
  {
    id: 'rush_end_hero',
    name: 'ヒーローRUSH 終了(獲得のまとめ)',
    /*
     * プレミアだけは終わり方も別格にする。
     * 「転落した」ではなく「5ゲーム走り切った」の締めにするため、
     * 上の rush_end_all より強い weight で必ずこちらが選ばれる。
     */
    when: { event: 'setEnd', match: { result: ['RUSH_END'], rushId: ['HERO_RUSH'] } },
    weight: { default: 400 },
    priority: 'result',
    duration: 2800,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'fanfare_ending' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ffd166', ms: 300 } },
      // 紙吹雪でお祝いしてから、手を振って退場する(U30)
      { at: 0,   layer: 'char',    action: 'show',  params: { char: 'hero', pose: 'party' } },
      { at: 0,   layer: 'char',    action: 'motion', params: { char: 'hero', motion: 'heroFinale' } },
      { at: 100, layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'happy' } },
      { at: 300, layer: 'overlay', action: 'particles', params: { preset: 'coin', x: 360, y: 360, count: 32 } },
      { at: 400, layer: 'lcd',     action: 'text',
        params: { text: 'HERO RUSH 完走', sub: 'ホットスタンバイで引き戻しへ', color: '#ffd166', ms: 1600 } },
      { at: 1600, layer: 'char',   action: 'pose',  params: { char: 'hero', pose: 'wave' } },
      { at: 2200, layer: 'char',   action: 'hide',  params: { char: 'hero' } },
    ],
  },
  {
    id: 'rush_end_hero_zero',
    name: 'ヒーローRUSH 終了(5G すべて外した)',
    /*
     * U30: 「へたり込み」を使うのはここだけ。
     *   state.hits = 0(毎ゲーム抽選を1回も引けていない)かつ gained = 0
     *   (レア役の +α も無かった)= **本当に何も取れなかった** ときだけ。
     * どちらか片方でも取れていれば上の完走版が出る = 嘘にならない。
     * 上の rush_end_hero より強い weight で必ずこちらが選ばれる。
     */
    when: {
      event: 'setEnd',
      match: { result: ['RUSH_END'], rushId: ['HERO_RUSH'], 'state.hits': [0], gained: [0] },
    },
    weight: { default: 900 },
    priority: 'result',
    duration: 2800,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'error_buzz', gain: 0.5 } },
      { at: 0,   layer: 'char',    action: 'show',  params: { char: 'hero', pose: 'dizzy' } },
      { at: 0,   layer: 'char',    action: 'motion', params: { char: 'hero', motion: 'heroFlop' } },
      { at: 200, layer: 'char',    action: 'pose',  params: { char: 'kiro', pose: 'panic' } },
      { at: 500, layer: 'lcd',     action: 'text',
        params: { text: 'HERO RUSH 終了', sub: '5ゲームとも通らなかった… 引き戻しへ', color: '#ffb3b3', ms: 1700 } },
      { at: 2200, layer: 'char',   action: 'hide',  params: { char: 'hero' } },
    ],
  },
  {
    id: 'cf_rush_win_coin',
    name: 'CloudFront レア役の確定クレジット',
    when: { event: 'paramChange', mode: ['CF_RUSH'], match: { param: ['cf_win_coin'] } },
    weight: { CF_RUSH: 120, default: 0 },
    duration: 1200,
    cues: [
      { at: 0,  layer: 'sfx', action: 'synth', params: { preset: 'coin_in' } },
      { at: 0,  layer: 'lcd', action: 'anim',
        params: { anim: 'cf_edge_fly', add: '$delta', edge: CF.edges[0], index: 4 } },
      { at: 40, layer: 'lcd', action: 'particles', params: { preset: 'coin', x: 220, y: 150, count: 10 } },
    ],
  },
];
