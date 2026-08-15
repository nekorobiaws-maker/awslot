/**
 * 通常時の演出シナリオ。DESIGN.md 6.5 / IDEAS.md 2章
 *
 * ここに追記するだけで演出が増える。ゲームロジックには一切影響しない。
 *
 * ── モードの除外は必ず NOT_NORMAL_MODES を使うこと(2026-08-14 修正)──
 * 以前はモードIDを直書きしていた(ボーナスとオートスケーリングRUSHの2つだけ)ため、U11 で RUSH が
 * 4種に増えたときに CF/Aurora/ヒーロー RUSH 滞在中へ通常時演出が漏れていた。
 * data/rushes.js の RUSH_IDS を単一の正とし、RUSH が増えても自動で追従させる。
 */

import { NOT_NORMAL_MODES } from '../rushes.js';
// 結論行(U57)/ 役色(U62)の唯一の正。ハズレを言い切る行はこれを通す
import { conclusionCue } from '../rolecolors.js';

export default [
  {
    id: 'normal_rare_flash',
    name: 'レア役成立フラッシュ + ミニサメのちょい出し',
    /*
     * IDEAS.md 2-14「ミニキャラちょい出し予告」。
     * 2026-08-14: キャラはお化けから **サメ** になっている(render/chars/ 参照)。
     * カットインID `mini_ghost_peek` は互換のため名前だけ残っているが、
     * 描いているのは「ひょっこり覗きサメ」(staging/anims/cutins.js)。
     */
    when: { event: 'leverOn', rare: true, notMode: NOT_NORMAL_MODES },
    weight: { default: 100 },
    duration: 1400,
    cues: [
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 200 } },
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'rare_flag' } },
      { at: 60,  layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 80,  layer: 'overlay', action: 'cutin', params: { id: 'mini_ghost_peek', side: 'left' } },
      { at: 100, layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { at: 120, layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 352, y: 176 } },
      { waitFor: 'stop3', after: 300, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'normal_rare_strong',
    name: 'レア役(強)ステップアップ予告',
    // IDEAS.md 2-24「SNS通知ベル予告(ステップアップ)」
    when: { event: 'leverOn', flag: ['STRONG_CHERRY', 'CHANCE'], notMode: NOT_NORMAL_MODES },
    weight: { default: 60 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'char',    action: 'show', params: { char: 'kiro', pose: 'panic' } },
      { at: 40,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'shake' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 2 } },
      { waitFor: 'stop3', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 3 } },
      { waitFor: 'stop3', after: 200, layer: 'overlay', action: 'flash', params: { color: '#ff6b6b', ms: 240 } },
    ],
  },

  {
    id: 'normal_fin_tease_gase',
    name: '【ガセ】サメの尾びれチラ見せ(ハズレ・ベルでも出る)',
    // IDEAS.md 2-15。低期待度シナリオをあえて非レア役に混ぜて「らしさ」を出す
    when: { event: 'leverOn', flag: ['LOSE', 'BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 100, default: 0 },
    // 通常時のハズレは頻発するので、発火自体を 2.5% に間引く
    chance: 0.25,  // 統合調律(2026-08-13): 非レア時の演出発火率30%に合わせて 0.025 → 0.25
    duration: 1300,
    cues: [
      { at: 0,   layer: 'overlay', action: 'cutin', params: { id: 'shark_fin_tease' } },
      { at: 100, layer: 'sfx',     action: 'synth', params: { preset: 'shark_swim' } },
    ],
  },

  {
    id: 'normal_alarm_tease_gase',
    name: '【ガセ】CloudWatchアラーム予告(ALARMまで到達しない)',
    // IDEAS.md 2-1。弱レア役で強予告の入り口だけ見せる = 期待させて外すガセ
    when: { event: 'leverOn', flag: ['WEAK_CHERRY', 'MELON'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 70, default: 0 },
    chance: 0.45,
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx',   action: 'synth', params: { preset: 'alarm_beep' } },
      { at: 0,   layer: 'lamp',  action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'char',  action: 'show', params: { char: 'kiro', pose: 'surprised' } },
      { waitFor: 'stop1', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 1 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'anim', params: { anim: 'step_up', step: 2 } },
      // 第3停止では上がりきらず INSUFFICIENT_DATA 止まり
      { waitFor: 'stop3', after: 150, layer: 'lcd', action: 'text',
        params: { text: 'INSUFFICIENT_DATA', sub: 'データが足りません…', color: '#ffd166', ms: 1200 } },
      { waitFor: 'stop3', after: 200, layer: 'char', action: 'pose', params: { char: 'kiro', pose: 'normal' } },
    ],
  },

  {
    id: 'normal_ghost_idle',
    // ID は互換のため据え置き。中身は相棒サメの待機
    name: '通常時の相棒サメ待機',
    when: { event: 'modeEnter', enterMode: ['FREE_TIER'] },
    weight: { default: 100 },
    duration: 600,
    cues: [
      { at: 0, layer: 'char', action: 'show', params: { char: 'kiro', pose: 'normal' } },
      { at: 0, layer: 'char', action: 'hide', params: { char: 'george' } },
      { at: 0, layer: 'lamp', action: 'pattern', params: { pattern: 'idle' } },
      { at: 0, layer: 'bgm',  action: 'change', params: { bgm: 'bgm_normal' } },
    ],
  },

  {
    id: 'alarm_flag_blink',
    name: 'Bedrock役成立(通常時以外の簡易版)',
    // 絵柄 ALARM は Bedrock(生成AI)へ改称済み(data/flags.js / symbols.js)。
    // 旧称のまま CloudWatch アラームの演出(アラーム音+黄点滅)が残っていたため、
    // Bedrock の起動演出へ統一した(椿レビュー: AWSの事実誤り)。
    //
    // 通常時(FREE_TIER)は Bedrock揃いのLLM起動イベント
    // (yokoku-heavy.js の yb_bedrock_alarm_invoke)が上位互換として担当するので除外する。
    // weight を下げるだけでは director の重み付き抽選で数百回に数回こちらが勝ってしまい、
    // 「Bedrock が揃ったら必ずLLMイベント」という約束が守れないため、候補から外している。
    // 通常時以外(CZ / ボーナス / RUSH 等)では今までどおりこのシナリオが担当する。
    when: { event: 'leverOn', flag: ['ALARM'], notMode: ['FREE_TIER'] },
    weight: { default: 100 },
    duration: 1600,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'charge_up' } },
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { waitFor: 'stop3', after: 60,  layer: 'overlay', action: 'flash', params: { color: '#ffd166', ms: 200 } },
      // 通常時は yb_bedrock_alarm_invoke がフル版を担当する。ここは短い起動だけ
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'anim', params: { anim: 'bedrock_boot' } },
      { waitFor: 'stop3', after: 160, layer: 'reelfx', action: 'highlight', params: { ms: 500, color: '#ffd166' } },
    ],
  },

  {
    id: 'replay2_route53_roulette',
    name: 'Route 53 リプレイ(名前解決でもう一回転)',
    // IDEAS.md 1章「Route53ルーレット: グルグル回って止まった先でもう一回転」
    when: { event: 'leverOn', flag: ['REPLAY2'] },
    weight: { default: 100 },
    duration: 1400,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'route53_spin' } },
      { waitFor: 'stop3', after: 80,  layer: 'lcd', action: 'particles',
        params: { preset: 'stream', x: 220, y: 170, count: 12 } },
      { waitFor: 'stop3', after: 120, layer: 'lcd', action: 'text',
        params: { text: 'RESOLVED', sub: '名前解決 — もう一回転', color: '#25a97f', ms: 900 } },
    ],
  },

  {
    id: 'normal_kinesis_tease_gase',
    name: '【ガセ】Kinesisストリーム流れ予告(金にならない)',
    // IDEAS.md 2-20「データ粒の色が青→金に変われば期待度アップ」= 青のまま終わるガセ
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 60, default: 0 },
    chance: 0.30,  // 統合調律(2026-08-13): 非レア時の演出発火率30%に合わせて 0.03 → 0.30
    duration: 1600,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'stream_flow' } },
      { at: 0,   layer: 'lcd', action: 'particles', params: { preset: 'stream', x: 60, y: 200, count: 20 } },
      { waitFor: 'stop2', layer: 'lcd', action: 'particles', params: { preset: 'stream', x: 220, y: 210, count: 14 } },
      /*
       * 2026-08-15 ユーザー指示 U66-3: 結果が分かる文言へ。
       * 旧「blue…」/「データは青いまま流れていった」は **見た目の説明** で、
       * このゲームがどうなったのかを一言も言っていなかった
       * (粒が金にならない = 何も乗らなかった、が伝わらない)。
       * 結論行(conclusionCue)へ寄せて「何も起きなかった」を言い切る。
       * ハズレなので役色は白 = 何も成立していない(U62)。
       */
      conclusionCue({
        flag: 'LOSE',
        text: '金の粒は流れてこなかった…',
        sub: 'Kinesis — データは青いまま流れていった',
        after: 200,
        ms: 900,
      }),
    ],
  },

  {
    id: 'premium_all_regions',
    name: '【プレミア】全リージョン同時点灯',
    // IDEAS.md 4-1。ゴースト揃いでのみ発生する最上位演出
    when: { event: 'leverOn', flag: ['GHOST'] },
    weight: { default: 1000 },
    duration: 4200,
    cues: [
      { at: 0,    layer: 'overlay', action: 'flash', params: { color: '#ffffff', ms: 420 } },
      { at: 0,    layer: 'overlay', action: 'shake', params: { power: 16, ms: 700 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 120,  layer: 'lcd',     action: 'anim',  params: { anim: 'all_regions_light' } },
      { at: 200,  layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'premium' } },
      { at: 200,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'zoom' } },
      { at: 600,  layer: 'voice',   action: 'play',  params: { key: 'george_premium_01' } },
      { at: 1200, layer: 'overlay', action: 'particles', params: { preset: 'rainbow', x: 360, y: 400, count: 40 } },
      { waitFor: 'stop3', after: 300, layer: 'lcd', action: 'text',
        params: { text: 'ALL GREEN', sub: '全リージョン正常稼働', color: '#7bf7d0', ms: 2000 } },
    ],
  },

  /* ── 内部状態の昇格 = ステージチェンジ ─────────────────────────────
   *
   * ユーザー指摘(2026-08-13):「『遠くから会場のライトが光り始めた』が4回続いた後に
   * CZへ移行した。この演出はステージチェンジで Invent会場へ移るほうがいい」。
   *
   * もともと re:Invent 会場の絵は**前兆パターンの1コマ**だったため、同じ絵が
   * 前兆の続く4ゲームぶん繰り返され、しかも会場へは行かずCZへ飛んでいた。
   * 会場のライトは「ステージが Invent会場(PROVISIONED)へ変わる合図」に転用し、
   * 前兆プールからは外した(data/zencho.js の reinvent は weight 0)。
   *
   * freetier.js が昇格時に出す paramChange { param:'substate', value, delta:+1 } を拾う。
   * 背景(state.stage)は同じタイミングで stage_prov / stage_warm へ切り替わるので、
   * ここは「切り替わる瞬間」を光らせる役に徹する。
   *
   * weight は upper.js の汎用 substate_up(weight 100)を押しのけるため高くしてある。
   *
   * ══ U55(2026-08-15): 突入ポップアップは **1ゲームに1回だけ** ═══════════
   *
   * 【指摘】Invent会場へ入ったあとポップアップが2回出る。
   * 【原因】このシナリオが lcd.text を2本持っていた:
   *           at:200  「re:Invent — 遠くの会場のライトが光り始めた」
   *           at:1000 「Invent会場に到着 — 照明が入った」
   *         テキスト帯は1件ずつ順送りするので、2本積むと
   *         **同じ出来事の告知が続けて2回出る**(前半は後半の前置きでしかない)。
   *         別シナリオとの競合ではないので、director の調停では止められない。
   * 【対処】前置きの1本を削除し、告知は到着の1本だけにした。
   *         「遠くのライトが光り始めた」は文字ではなく
   *         直前の lcd_flash + spark(照明が入る画)で表現する。
   * 【寿命】到着の告知は sticky:true = **次のゲームのレバーONで消える**
   *         (U57 の共通ルール。lcdanims.js の onStageEvent が解除する)。
   *         ステージ名そのものは液晶左上のタイトル帯が常設で出しているので、
   *         告知が消えても「いまどのステージか」は分からなくならない。
   *
   * サミット会場(下の stage_up_warm)と汎用版(upper.js の substate_up)も
   * 同じルールに揃えてある。ステージ突入系を足すときは
   * **告知は1本 + sticky:true** を守ること。
   */
  {
    id: 'stage_up_provisioned',
    name: 'ステージチェンジ: Invent会場へ(激アツ)',
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['substate'], value: ['PROVISIONED'], delta: [1] },
    },
    weight: { FREE_TIER: 5000, default: 0 },
    duration: 3000,
    cues: [
      // 遠くの会場が光り始める
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'stage_change' } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'lcd',     action: 'anim',  params: { anim: 'lcd_flash', color: '#7b5cff', strength: 0.35 } },
      { at: 120,  layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 360, y: 250, count: 14 } },
      // U55: ここにあった前置きの告知(「re:Invent — 遠くの会場のライトが光り始めた」)は
      // 削除した。同じ出来事の告知が2回出る原因だったため(上のブロックを参照)。
      // 照明が入る → ステージ切替
      { at: 700,  layer: 'overlay', action: 'flash', params: { color: '#7b5cff', ms: 320 } },
      { at: 720,  layer: 'overlay', action: 'shake', params: { power: 10, ms: 380 } },
      { at: 760,  layer: 'sfx',     action: 'synth', params: { preset: 'upgrade_chime' } },
      { at: 800,  layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'premium' } },
      { at: 840,  layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'zoom' } },
      { at: 900,  layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 200, y: 150, count: 20 } },
      // U6 と同じ理由で「到着した」に揃える(移動は既に完了している)。
      // U55: このシナリオで唯一の告知。sticky = 次のゲームのレバーONで消える
      { at: 1000, layer: 'lcd',     action: 'text',
        params: {
          text: 'Invent会場に到着', sub: '照明が入った — 激アツステージ',
          color: '#e0b3ff', ms: 1800, sticky: true,
        } },
      { at: 1400, layer: 'overlay', action: 'particles', params: { preset: 'rainbow', x: 360, y: 380, count: 18 } },
      { at: 2400, layer: 'char',    action: 'pose',   params: { char: 'kiro', pose: 'happy' } },
    ],
  },

  {
    id: 'stage_up_warm',
    name: 'ステージチェンジ: サミット会場へ(高確)',
    // Invent会場の軽い版。こちらは「会場入り口のざわめき」程度に留める
    when: {
      event: 'paramChange', mode: ['FREE_TIER'],
      match: { param: ['substate'], value: ['WARM_POOL'], delta: [1] },
    },
    weight: { FREE_TIER: 5000, default: 0 },
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'stage_change' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ffb04a', ms: 240 } },
      { at: 60,  layer: 'lcd',     action: 'anim',  params: { anim: 'lcd_flash', color: '#ffb04a', strength: 0.4 } },
      { at: 200, layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 300, y: 210, count: 12 } },
      { at: 240, layer: 'char',    action: 'show',   params: { char: 'kiro', pose: 'happy' } },
      { at: 240, layer: 'char',    action: 'motion', params: { char: 'kiro', motion: 'bounce' } },
      // 2026-08-14 ユーザー指摘 U6:
      // 実際には「もう移動した(高確に居る)」ので、近づいてきた表現は嘘だった。
      // U55: 告知は1本だけ / sticky = 次のゲームのレバーONで消える
      { at: 400, layer: 'lcd',     action: 'text',
        params: {
          text: 'サミット会場に到着', sub: 'ここから高確 — チャンスが近い',
          color: '#ffb04a', ms: 1400, sticky: true,
        } },
    ],
  },

  /* ── 絵柄飛来予告(先読み)──────────────────────────────────────────
   *
   * 液晶の中に風が吹き、リール絵柄が1枚舞い込む。
   * **飛んできた絵柄はそのゲームで必ず揃う**。
   *
   * 整合の担保: when.flag で成立役を固定し、その役の TARGET_SYMBOL(data/flags.js)と
   * 同じ絵柄IDだけを params.symbol に渡している。取りこぼし無し仕様なので
   * 「成立している = 必ず揃う」が成り立ち、飛んだ絵柄と停止形が食い違うことはない。
   * (CHERRY / LAMBDA は左リール中段の単独役なので3つ揃いではないが、
   *  その絵柄が停止形に絡むことは同じく確定している)
   *
   * 期待度は「どの絵柄が飛んでくるか」で示す:
   *   ベル / リプレイ … 賑やかし(低weight + chance で間引く)
   *   チェリー / スイカ … 少し熱め
   *   λ(チャンス目)   … 激アツ寄り
   */
  {
    id: 'sym_fly_bell',
    name: '絵柄飛来(EC2ベル)— 賑やかし',
    when: { event: 'leverOn', flag: ['BELL'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 40, default: 0 },
    chance: 0.05,
    duration: 1600,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'stream_flow', gain: 0.5 } },
      { at: 120, layer: 'lcd', action: 'anim',
        params: { anim: 'symbol_fly_in', symbol: 'BELL', dir: 1, y: 148 } },
    ],
  },
  {
    id: 'sym_fly_replay',
    name: '絵柄飛来(DynamoDBリプレイ)— 賑やかし',
    when: { event: 'leverOn', flag: ['REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 40, default: 0 },
    chance: 0.05,
    duration: 1600,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'stream_flow', gain: 0.5 } },
      { at: 120, layer: 'lcd', action: 'anim',
        params: { anim: 'symbol_fly_in', symbol: 'REPLAY', dir: -1, y: 142 } },
    ],
  },
  {
    id: 'sym_fly_cherry',
    name: '絵柄飛来(IAMチェリー)— 少し熱め',
    // 弱/強どちらのチェリーでも停止形は左リール中段の CHERRY で共通
    when: { event: 'leverOn', flag: ['WEAK_CHERRY', 'STRONG_CHERRY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 70, default: 0 },
    duration: 1800,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'stream_flow' } },
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 120, layer: 'lcd',  action: 'anim',
        params: { anim: 'symbol_fly_in', symbol: 'CHERRY', dir: 1, y: 138, scale: 1.05 } },
      { at: 900, layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 300, y: 140, count: 8 } },
    ],
  },
  {
    id: 'sym_fly_melon',
    name: '絵柄飛来(S3スイカ)— 少し熱め',
    when: { event: 'leverOn', flag: ['MELON'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 70, default: 0 },
    duration: 1800,
    cues: [
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'stream_flow' } },
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 120, layer: 'lcd',  action: 'anim',
        params: { anim: 'symbol_fly_in', symbol: 'MELON', dir: -1, y: 138, scale: 1.05 } },
      { at: 900, layer: 'lcd',  action: 'particles', params: { preset: 'spark', x: 160, y: 140, count: 8 } },
    ],
  },
  {
    id: 'sym_fly_lambda',
    name: '絵柄飛来(Lambda λ)— 激アツ寄り',
    when: { event: 'leverOn', flag: ['CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 130, default: 0 },
    duration: 2200,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'cutin_whoosh' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'overlay', action: 'flash', params: { color: '#ffb46a', ms: 180 } },
      { at: 100, layer: 'lcd',     action: 'anim',
        params: { anim: 'symbol_fly_in', symbol: 'LAMBDA', dir: 1, y: 132, scale: 1.18 } },
      { waitFor: 'stop1', layer: 'char',    action: 'show',  params: { char: 'kiro', pose: 'surprised' } },
      { waitFor: 'stop1', after: 200, layer: 'lcd',     action: 'particles', params: { preset: 'spark', x: 260, y: 132, count: 14 } },
      { waitFor: 'stop3', layer: 'lcd',    action: 'text',
        params: { text: 'λ が舞い込んだ', sub: 'AWS Lambda — 風に乗って絵柄が飛んできた', color: '#ffb46a', ms: 1200 } },
    ],
  },
];
