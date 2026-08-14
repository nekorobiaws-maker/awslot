/**
 * レバーONフリーズの演出シナリオ。DESIGN.md 6.5 / data/freeze.js
 *
 * ゲーム側(game/flow.js)がレバーONの瞬間に
 *   bus.emit('freeze', { id:'LEVER_FREEZE', flag, ms, reward:'DYNAMO_BIG' })
 * を出す。リールが回らないのは **ゲーム側の FLOW.FREEZE** の仕事であって、
 * ここは「その8秒に何を見せるか」だけを持つ(演出はゲーム状態を変えない)。
 *
 * ══ U21(2026-08-14): 秘宝伝「神の声」風の暗転溜めへ作り替え ═══════════
 *
 * 元ネタの気持ちよさの本体は **否定されるほど期待度が上がる逆転構造** と、
 * **溜め8割・爆発2割** の配分。固有の文言はコピーせず、構造だけを移植した。
 *
 * ══ U49(2026-08-15): 「テンポが早すぎる。もっとためて、ドーン」 ═══════
 *
 * 問答が次々に流れて溜めになっていなかったので、**間を大幅に伸ばした**。
 * 効かせどころは3つ:
 *   1. 暗転してから最初の「…」までの無音(1.4s → 2.2s)
 *   2. 否定のあと、次の問いが来るまでの間(0.9s → 1.6s)
 *   3. 解放直前の **完全静止の一拍**(9.35〜10.05s)。
 *      音も動きも文字も出さない0.7秒を必ず作ってから明転する。
 *      ここに何かを足すと「ドーン」の前の空白が埋まって効きが落ちるので、
 *      **このレンジにキューを置かないこと**。
 *
 *   0.0s  音を奪う(BGMフェード)+ 画面全体を暗転(alpha 0.97)+ 筐体消灯
 *   0.3s  低音を1発
 *   1.1s  極小の地鳴り(gain 0.16)… 「固まっていない」だけを伝える合図(F15)
 *   2.2s  「…」                     ← この無音は絶対に削らない
 *   3.8s  問い1「これは、チャンスなのか…」
 *   5.5s  否定1「── まだ足りない。」
 *   7.1s  問い2「これは、規格外なのか…」(赤く・大きく)
 *   8.7s  否定2「── まだ足りない。」
 *   9.35s 最終告知(金文字)+ 低い地鳴りと微振動
 *  10.05s **完全静止の一拍**(音ゼロ・動きゼロ・文字ゼロ)
 *  10.75s 「ドーン」= 爆発音 + 白フラッシュ + 強シェイク + 明転
 *  10.85s サメ噛みつきカットイン / 11.1s「FREEZE!!」(カットインの上に出す)
 *  11.4s  シナリオ終了。ここで exclusive 枠を明け渡し、
 *         直後(最速11.68s)のボーナス入賞待ちの入場告知に道を空ける
 *
 * ■ 文字を lcd.text ではなく overlay.text で出している理由
 *   液晶(z=2)はオーバーレイ(z=8)の**下**にある。暗転はオーバーレイに敷くので、
 *   lcd.text で書いた文字は黒に沈んで一文字も読めない。
 *   そこで暗転中の問答は overlay.text(render/overlay.js の showLine)で出す。
 *   **解放後の「FREEZE!!」も同じ理由で overlay.text にした**(2026-08-14 V21-05)。
 *   爆発パートはカットイン(z=8)が画面を覆うため、液晶に書くと下敷きになる。
 *   overlay.text はカットインより後に描かれるので、爆発の上で読める。
 *
 * ■ exclusive: true
 *   フリーズは台の最上位イベントなので、走っている間は
 *   他の液晶演出もテキスト帯も一切通さない(director の全面占有枠)。
 *
 * ■ 結論を出してよい唯一の理由 / ガセフリーズは作らない
 *   フリーズは **発生した時点でボーナス確定**(data/freeze.js の reward)。
 *   「── まだ足りない。」は期待度を上げるための否定であって、
 *   **外れるための否定ではない**。当選しないフリーズを後から足してはいけない。
 *
 * ■ 文言(U25 の3条件)
 *   意味が分かる/AWS要素が入る/事実に反しない、を満たす範囲で書く。
 *   「全リージョン同時停止」は本機の世界観(data/freeze.js の設計)であって
 *   実在の障害を指していない。数値のねつ造はしない。
 *
 * ■ デバッグ強制発火
 *   F キー(main.js の DEBUG_FREEZE)または `?freeze=1` で次のレバーONが必ずフリーズ。
 */

/** 暗転中の問答の文字色 */
const VOICE_WHITE = '#e9eefc';
const VOICE_RED = '#ff5a5a';
const VOICE_GOLD = '#ffe066';

export default [
  {
    id: 'fz_lever_freeze',
    name: '【プレミア】レバーONフリーズ — 神の声(全リージョン同時停止)',
    when: { event: 'freeze' },
    // 全面占有。他の液晶演出とテキスト帯を全部止めて画面を独り占めする
    exclusive: true,
    weight: { default: 10000 },
    /**
     * 尺(U49 で 8600 → 11400)。
     *
     * exclusive は **走っている間ずっと他の画面演出を通さない**。
     * ゲーム側のフリーズ(data/freeze.js の durationMs = 10800)が明けて
     * リールが回り出すのが 10.8秒、そこから最速で **11.68秒後には BONUS_READY**
     * へ入る(ヘッドレスで停止即押しの実測)。尺がそれを越えると、入場演出
     * 「BONUS 確定 → ゴースト7を揃えろ!」が exclusive で弾かれて
     * **フリーズの結末が告知されない**。最後のキューを 11.33秒に寄せ、
     * 11.4秒で枠を明け渡す(余裕 約0.28秒)。
     * **data/freeze.js の durationMs とセットで動かすこと。**
     */
    duration: 11400,
    cues: [
      /* ══ 1. 音を奪う + 暗転(溜めの本体)═══════════════════════ */
      // BGM を止める(bgm:null = engine/audio.js の changeBgm(null) と同じ「無音へ」)。
      // 音を奪うことで「何かが起きた」を音の欠落で伝える
      { at: 0,    layer: 'bgm',     action: 'change',  params: { bgm: null, fadeMs: 900 } },
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'idle' } },
      /*
       * 画面全体(リール含む)を暗転。hold 中は減衰しないのでずっと真っ暗。
       *
       * holdMs は **解除キュー(at:10760)と同じところで切れる** 10500 にしてある
       * (fadeIn 260 + hold 10500 = 10760 から自然に明け始める)。
       * 通常は解除キューが先に効くので見た目は変わらないが、
       * 何かの理由で解除キューに届かなかった場合でも
       * **10.96秒で必ず明るくなる**(ゲーム側のフリーズは 10.8秒)。
       * 暗転は時間でしか消えないので、この保険が無いと画面が真っ暗のまま残る。
       * ※ render/overlay.js の BLACKOUT_MAX_HOLD_MS(12秒)がこれより短いと
       *   途中で勝手に明転する。あちらのコメントにも同じ申し送りがある。
       */
      { at: 0,    layer: 'overlay', action: 'blackout',
        params: { alpha: 0.97, fadeInMs: 260, holdMs: 10500, fadeOutMs: 200 } },
      // 低音を1発だけ。以降しばらく音を入れないことで「無音」を作る
      { at: 300,  layer: 'sfx',     action: 'synth',   params: { preset: 'freeze_hit', gain: 0.5 } },
      /*
       * 「生きている」だけを伝える極小の合図(2026-08-15 検証指摘 F15)。
       *
       * 暗転から最初の「…」まで 2.2秒、その間は文字も動きもない真っ黒なので、
       * 初見だと「固まった?」と読まれるリスクがある、という指摘。
       * かといってここを賑やかにすると溜めが死ぬので、
       * **ごく低い地鳴りを1回だけ、聞こえるか聞こえないかの音量で**置く。
       *   ・文字は出さない(「…」の初出は 2.2秒のまま)
       *   ・画も動かさない(暗転は保ったまま)
       * 「完全な静寂で始めたい」ならこの1行を消すだけで元に戻る。
       */
      { at: 1100, layer: 'sfx',     action: 'synth',   params: { preset: 'graviton_hum', gain: 0.16 } },

      /* ══ 2. 神の声(問答ステップアップ)═══════════════════════
       * U49: ここのテンポが速すぎて溜めになっていなかった。
       * 「…」までの2.2秒と、否定 → 次の問いまでの1.6秒は **絶対に削らない**。 */
      { at: 2200, layer: 'overlay', action: 'text',
        params: { text: '…', color: VOICE_WHITE, size: 34, ms: 1300 } },

      { at: 3800, layer: 'overlay', action: 'text',
        params: { text: 'これは、チャンスなのか…', color: VOICE_WHITE, size: 30, ms: 1500 } },
      { at: 4700, layer: 'sfx',     action: 'synth',
        params: { preset: 'countdown_tick', gain: 0.35, rate: 0.6 } },

      { at: 5500, layer: 'overlay', action: 'text',
        params: { text: '── まだ足りない。', color: VOICE_WHITE, size: 30, ms: 900 } },

      { at: 7100, layer: 'overlay', action: 'text',
        params: { text: 'これは、規格外なのか…', color: VOICE_RED, size: 36, ms: 1500 } },
      { at: 8000, layer: 'sfx',     action: 'synth',
        params: { preset: 'countdown_tick', gain: 0.55, rate: 0.9 } },
      { at: 8350, layer: 'sfx',     action: 'synth',
        params: { preset: 'countdown_tick', gain: 0.55, rate: 0.9 } },

      { at: 8700, layer: 'overlay', action: 'text',
        params: { text: '── まだ足りない。', color: VOICE_RED, size: 32, ms: 800 } },

      /* ══ 3. 最終告知 → 完全静止の一拍 → 解放 ═══════════════
       * 最終告知は 9.35〜10.05秒。地鳴り(graviton_hum)と微振動をぴったり重ねて、
       * **10.05秒で全部いっぺんに止める**。
       *
       * ── 10.05〜10.75秒は「完全静止」。ここにキューを置かないこと ──────
       * 音ゼロ・動きゼロ・文字ゼロの0.7秒を作ってから「ドーン」を落とす。
       * ここを埋めると溜めが抜けて、ただの連続演出に戻ってしまう(U49 の芯)。 */
      { at: 9350, layer: 'sfx',     action: 'synth',
        params: { preset: 'graviton_hum', gain: 0.7 } },
      { at: 9350, layer: 'overlay', action: 'shake',   params: { power: 5, ms: 700 } },
      { at: 9350, layer: 'overlay', action: 'text',
        params: {
          text: '【全リージョン同時停止】', sub: 'すべての AZ が同時に落ちた',
          color: VOICE_GOLD, size: 32, ms: 700,
        } },

      /* ══ 4. ドーン(解放)═══════════════════════════════════
       * 静止の直後に、音・光・揺れを **同じ瞬間に** 叩き込む。
       * 爆発音は freeze_hit を 1.25倍で重ね、シェイクも 24 → 34 に上げてある。 */
      { at: 10740, layer: 'sfx',     action: 'synth',   params: { preset: 'freeze_hit', gain: 1.25 } },
      { at: 10750, layer: 'overlay', action: 'flash',   params: { color: '#ffffff', ms: 420 } },
      { at: 10755, layer: 'overlay', action: 'shake',   params: { power: 34, ms: 900 } },
      // 暗転を解除(明転)。ここから爆発パート
      { at: 10760, layer: 'overlay', action: 'blackout', params: { release: true, fadeOutMs: 120 } },

      /* ══ 5. 爆発(既存資産の流用)═══════════════════════════ */
      { at: 10780, layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 10800, layer: 'sfx',     action: 'synth',   params: { preset: 'shark_bite' } },
      { at: 10850, layer: 'overlay', action: 'cutin',   params: { id: 'shark_bite_bar' } },
      { at: 10880, layer: 'char',    action: 'show',    params: { char: 'kiro', pose: 'premium' } },
      { at: 10920, layer: 'char',    action: 'motion',  params: { char: 'kiro', motion: 'zoom' } },
      { at: 11000, layer: 'overlay', action: 'particles',
        params: { preset: 'rainbow', x: 360, y: 400, count: 40 } },
      { at: 11020, layer: 'sfx',     action: 'synth',   params: { preset: 'fanfare_big' } },
      { at: 11060, layer: 'lcd',     action: 'particles',
        params: { preset: 'rainbow', x: 220, y: 150, count: 26 } },
      /*
       * ── 最大の見せ場の文字を lcd.text から overlay.text へ移した ──────────
       * 2026-08-14 検証指摘 V21-05:
       *   液晶(z=2)に出していたため、直前に始まるサメ噛みつきカットイン(z=8)と
       *   BARプレート・キャラに覆われて「ZE!!」しか読めなかった。
       *   カットインの尺は 1.8秒(staging/anims/cutins.js)あるので、
       *   タイミングをずらすなら明転から2秒近く待つことになり、間延びする。
       * render/overlay.js の draw 順は 暗転 → カットイン → パーティクル → **この行** → フラッシュ。
       * つまり overlay.text はカットインの上に出るので、爆発の真上で読める。
       * (暗転中の問答と同じ経路。使いどころは「オーバーレイに覆われる場面」だけ)
       */
      { at: 11100, layer: 'overlay', action: 'text',
        params: {
          text: 'FREEZE!!', sub: 'ゴーストボーナスSP 確定',
          color: '#ffe066', size: 44, ms: 1300,
        } },
      { at: 11200, layer: 'voice',   action: 'play',    params: { key: 'kiro_alarm_01' } },
      // ボーナスの曲へ。次のレバーONで入る BONUS 側の自動切替と同じ曲なので鳴り直さない
      { at: 11250, layer: 'bgm',     action: 'change',  params: { bgm: 'bgm_bonus', fadeMs: 400 } },
      // 最後のキューは duration(11400)より前に置く。ここが遅いと exclusive 枠が明かず、
      // 直後に来るボーナス入賞待ちの入場告知を弾いてしまう
      { at: 11330, layer: 'char',    action: 'pose',    params: { char: 'kiro', pose: 'happy' } },
    ],
  },
];
