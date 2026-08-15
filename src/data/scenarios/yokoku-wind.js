/**
 * 新タイプの予告シナリオ集(prefix `yw_`)。DESIGN.md 6.5
 *
 * 「パチスロの定番演出 × AWS」で、既存の yokoku-*.js には無い **形** を足す。
 *   1. 風がレア役を運んでくる(ユーザー必須要望 / U24 でレア役限定へ)
 *   2. コールドスタートの無音の間(Lambda / U29 でレア役限定へ)
 *   3. ランプ先光り(先告知 / 先ペカ)
 *   4. キャラが画面を横切る(ジョージ)
 *   5. 扉 / シャッター演出(AZ 切替)
 *   6. Direct Connect 開通2択(U37。成立=開通 / ハズレ=開通せず に分岐する)
 *   7. BLUE / GREEN デプロイ2択(U18。青=リプレイ / 緑=スイカ の絵柄で2択告知)
 *
 * ■ すべて演出RNGだけで動く
 *   ここに書けるのは「見た目の抽選」だけで、出目は1つも変わらない。
 *
 * ■ 嘘をつかないための約束(最重要)
 *   「絵柄を運んでくる」画は **その絵柄が成立していること** を意味する。
 *   したがって運ぶ絵柄は when.flag で縛り、必ず成立役と一致させる。
 *   ハズレのゲームで使うガセ版は count:0 = **何も運ばれない** で作る。
 *   (結果の画は当落確定イベントのみ、の原則)
 *
 * ■ weight は必ず { FREE_TIER: N, default: 0 } の形で書く
 *   director の _weightedPick は weight 未指定だとフォールバックの 10 を使うため、
 *   default: 0 を明示しないと他モードでも候補に入ってしまう。
 *
 * ■ 成立役 → 絵柄IDの対応(data/flags.js の TARGET_SYMBOL より)
 *   BELL → BELL / WEAK_CHERRY・STRONG_CHERRY → CHERRY / MELON → MELON
 *   CHANCE → LAMBDA / SHARK → SHARKBAR / GHOST → GHOST7
 *   ID が違うので `$flag` をそのまま symbol へ渡してはいけない。役ごとにシナリオを分けている。
 *
 * ■ 結論行(U57 / U62)
 *   「何が運ばれてきたか」「開通したか」を言い切る行は conclusionCue() で作る:
 *     出す = 第3停止(当落確定)/ 消える = 次のゲームのレバーON /
 *     色  = data/rolecolors.js の役色(直書き禁止)
 *   以前は運搬側の結論が金文字(#ffe066)で、チェリー成立でも赤にならず
 *   「色 = 成立役」の対応が崩れていた(U62 で是正)。
 */

import { colorForFlag, conclusionCue } from '../rolecolors.js';

/* ══ デバッグ強制発火(検証担当向け)═══════════════════════════════════
 *
 *   ?yw=<idの一部>  … このファイルのシナリオを狙って出す。
 *                     例) ?yw=directconnect  Direct Connect 開通2択(U37)
 *                         ※ハズレ側を見たいときはキー5〜6等で役を固定せず、
 *                           成立側は 1〜4 / 7(役強制)と併用する
 *                         ?yw=coldstart      コールドスタートの無音(U29)
 *                         ?yw=bluegreen      BLUE/GREEN 2択(U18)
 *   ?bluegreen=1    … 2択だけを狙う短縮形(?yw=bluegreen と同じ)
 *
 * 強制中は weight を跳ね上げ、chance を外して必ず発火させる。
 * **発火条件(when)は緩めない** ので、「レア役のときだけ」「slip:0 のときだけ」等の
 * 嘘をつかないための縛りはそのまま。狙って見たい役は強制成立キー(1〜9)と併用する。
 * ブラウザ以外(scripts/sim.mjs 等)には location が無いので常に無効。
 */
function readQuery(name) {
  try {
    if (typeof location === 'undefined' || !location?.search) return null;
    const v = new URLSearchParams(location.search).get(name);
    return v ? v.trim() : null;
  } catch {
    return null;
  }
}

const FORCE_YW = readQuery('yw');
/** 強制中の weight(他の候補を確実に押し切る大きさ。yokoku-aruaru.js と同じ作法) */
const FORCE_WEIGHT = 200000;

/** ?yw= で指定されたシナリオだけ weight を跳ね上げ、chance を外す */
function applyForce(list) {
  if (!FORCE_YW) return list;
  return list.map((s) => {
    if (!s.id.includes(FORCE_YW)) return s;
    const { chance, ...rest } = s;
    return { ...rest, weight: { FREE_TIER: FORCE_WEIGHT, default: 0 } };
  });
}

/* ══ BLUE / GREEN デプロイ2択の組み立て(U18)══════════════════════════
 *
 * 「勝ち側 × 煽りの寄せ方」の4本を同じ型から作る。文言と尺を1か所で持つため、
 * 直書きではなく組み立て関数にしてある(直したいときはここだけ触ればよい)。
 */

/** ?bluegreen=1 でこの2択を最優先発火(?yw=bluegreen と同じ) */
const FORCE_BLUEGREEN = (() => {
  const v = readQuery('bluegreen');
  return v === '1' || v === 'on';
})();

/* ══ 【重要】この2択は「結果告知(result)」ではない ═══════════════════
 *
 * 2026-08-14 検証で見つかった事故:
 *   青の文言が『BLUE 継続』だったため、lcdanims.js の STICKY_KEYWORDS に
 *   含まれる「継続」に引っかかり、director.classifyScenario() が
 *   **青側だけ** を 'result'(結果告知)と誤判定していた。影響は3つ:
 *     1. result は YOKOKU_CHANCE_SCALE の間引き対象外なので、
 *        青の実効発火率が意図どおり間引かれず、素の 34% のままだった
 *     2. 『BLUE 継続』が次のレバーONまで残る sticky 告知になり、
 *        熱い側(GREEN = スイカ成立)より軽いはずの側が重く扱われていた
 *     3. announce 枠(rank 3)を duration ぶん握るため、その間に来た
 *        本物の結果告知が格下げ・破棄されていた
 *
 * 対策は「内容からの推定に頼らない」こと:
 *   - シナリオに priority:'gimmick' を明示する(bluegreenScenario)
 *   - テキスト cue に sticky:false を明示する(showText 側で明示指定が優先される)
 * どちらか片方でも効くが、**両方書く**。文言をあとで直した人が
 * うっかり別のキーワードを踏んでも、もう一方が効く。
 */

/** 勝ち側ごとの定義。flag は「その役が成立した = その側が勝つ」の対応そのもの */
const BG_SIDES = {
  blue: {
    flags: ['REPLAY'],
    /** 結論行の色は役色マップから引く(U62)。リプレイ = DynamoDB の青 */
    role: 'REPLAY',
    /**
     * リプレイは 1/7.3 と高頻度なので強めに間引く
     * (実効 = chance × YOKOKU_CHANCE_SCALE。係数は staging/director.js が正)。
     * 0.34 だった頃は上記の誤判定で間引きが効かず、実効 34% = 青ばかり出ていた。
     */
    weight: 300,
    chance: 0.20,
    /** 「継続」の語は使わない(sticky 判定の語。意味も『もう1回転』の方が正確) */
    text: 'BLUE のまま',
    sub: 'リプレイ成立 — 現行のままもう1回転',
    flash: '#5aa8ff',
  },
  green: {
    flags: ['MELON'],
    /** スイカ = S3 の緑(U62) */
    role: 'MELON',
    /**
     * スイカは 1/100。しかも成立時は「レア役限定の予告」が全部候補に入る激戦区
     * (候補 70本・総weight 6600超)なので、weight を厚くしないと選ばれない。
     * 1200 → 2400 で、青:緑 ≒ 5:5 に近づける(青だけが出る2択にしないため)。
     */
    weight: 2400,
    chance: null,
    text: 'GREEN へ切替',
    sub: 'スイカ成立 — 新バージョンへ切り替わった',
    flash: '#4ce0a0',
  },
};

/* ══ Direct Connect 開通2択(U37 / 2026-08-14 ユーザー指示)══════════════
 *
 * ユーザー指定の最終形:
 *   煽り(停止中)      「オンプレ接続中…」— Direct Connect
 *   第3停止で分岐 成立 「オンプレと接続完了」(成立役の色)
 *               ハズレ「接続できなかった…」
 *
 * ■ U13(あるある分岐)と同じ構造にしてある
 *   導入は成立側・ハズレ側で **完全に共通**(下の dcIntroCues)。
 *   入りの時点で電飾もフラッシュも足さないので、始まった瞬間に当落は読めない。
 *   当落確定(stop3)で初めて結論を出す = 「結果の画は当落確定イベントのみ」。
 *
 * ■ ガセ(接続失敗)があるのがこの演出の役どころ
 *   専用線は「引き込めれば速いが、開通しないこともある」。
 *   接続できなかった画が **ハズレ告知として機能する** ので、
 *   このシリーズはハズレ側にも見せ場がある(U13 のアンチパターンと同じ立ち位置)。
 *
 * ■ 旧実装(yw_directconnect_pinpoint = 0コマ停止の煽り)からの置き換え
 *   旧は stop2 の「スベリ0コマ」煽りで、結論を出さないぶん印象に残らなかった。
 *   0コマ判定(match.slip)に縛られる都合で出現も不安定だったため、
 *   分岐型へ作り替えて **結論まで見せる**形にした。
 *   ?yw=directconnect のデバッグ強制はIDに文字列を残してあるので今までどおり効く。
 *
 * ■ 事実確認(U25 の3条件)
 *   Direct Connect は「オンプレミスとAWSを専用線で結ぶ」サービス。
 *   ここで言っているのは接続の可否だけで、速度・遅延の数値は一切名乗らない。
 */

/** 導入(ハズレ側・成立側で共通。ここに熱い演出を足さないこと) */
function dcIntroCues() {
  return [
    { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'stream_flow', gain: 0.4 } },
    { at: 0, layer: 'lcd', action: 'text',
      params: { text: 'オンプレ接続中…', sub: 'Direct Connect', color: '#cfe0ff', ms: 1000, sticky: false } },
  ];
}

/**
 * 成立側(役ごとに1本)。
 * color は「その色が出た = その役が成立した」の対応(U9)。yokoku-aruaru.js と同じ値。
 */
const DC_HITS = [
  {
    key: 'cherry',
    flags: ['WEAK_CHERRY', 'STRONG_CHERRY'],
    /** 色は data/rolecolors.js が唯一の正(U62)。ここには16進を書かない */
    role: 'WEAK_CHERRY',
    sub: '専用線が開通 — IAM の権限が通った',
    /** チェリー(1/24.2 + 1/86.4)の leverOn プールから約5%を取る */
    weight: 320,
  },
  {
    key: 'melon',
    flags: ['MELON'],
    role: 'MELON',
    sub: '専用線が開通 — S3 へ直接届いた',
    weight: 320,
  },
  {
    key: 'chance',
    flags: ['CHANCE'],
    role: 'CHANCE',
    sub: '専用線が開通 — Lambda が呼ばれた',
    weight: 320,
  },
  {
    key: 'shark',
    flags: ['SHARK'],
    role: 'SHARK',
    sub: '専用線が開通 — 太い回線が繋がった',
    weight: 420,
  },
];

/** ハズレ側(接続失敗)。前兆中は前兆の告知とぶつかるので出さない */
function dcMissScenario() {
  return {
    id: 'yw_directconnect_miss',
    name: '【ガセ】Direct Connect 開通ならず(ハズレ告知)',
    when: {
      event: 'leverOn', flag: ['LOSE'], mode: ['FREE_TIER'],
      match: { 'modeState.zenchoActive': [false] },
    },
    weight: { FREE_TIER: 150, default: 0 },
    /**
     * LOSE プールの他の弱予告と同じ chance。
     * 取り分が動くだけで **プール全体の発火量は変わらない**(U5)。
     * 実効値には director の YOKOKU_CHANCE_SCALE が掛かる(値は director.js が正)。
     */
    chance: 0.26,
    priority: 'gimmick',
    duration: 2000,
    cues: [
      ...dcIntroCues(),
      { waitFor: 'stop3', after: 120, layer: 'sfx', action: 'synth', params: { preset: 'error_buzz', gain: 0.7 } },
      // U57/U62: 結論は stop3 + sticky、ハズレなので色は白(役色が付かない = 何も成立していない)
      conclusionCue({
        flag: 'LOSE', text: '接続できなかった…', sub: 'リンクが上がらないまま終わった', ms: 1300,
      }),
    ],
  };
}

/** 成立側。役の色で「何が成立したか」を伝える(結論は stop3 まで出さない) */
function dcHitScenario(h) {
  return {
    id: `yw_directconnect_hit_${h.key}`,
    name: `【中】Direct Connect 開通(${h.flags.join('/')}成立)`,
    when: { event: 'leverOn', flag: h.flags, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: h.weight, default: 0 },
    // レア役の leverOn プールは元から chance なし(必ず1本出る)なので付けない = 総量不変
    priority: 'gimmick',
    duration: 2200,
    cues: [
      ...dcIntroCues(),
      { waitFor: 'stop3', after: 100, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { waitFor: 'stop3', after: 120, layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 140, layer: 'overlay', action: 'flash',
        params: { color: colorForFlag(h.role), ms: 200 } },
      conclusionCue({ flag: h.role, text: 'オンプレと接続完了', sub: h.sub, after: 160, ms: 1400 }),
    ],
  };
}

/** 分岐2択(ハズレ1本 + 成立4本) */
function directConnectScenarios() {
  return [dcMissScenario(), ...DC_HITS.map(dcHitScenario)];
}

/**
 * @param {'blue'|'green'} win 勝つ側(= 成立役)
 * @param {'even'|'blue'|'green'} lean 煽りの寄せ方(演出RNG = director の重み抽選が選ぶ)
 */
function bluegreenScenario(win, lean) {
  const S = BG_SIDES[win];
  return {
    id: `yw_bluegreen_${win}_${lean}`,
    name: `【中】BLUE/GREEN デプロイ2択(${win === 'blue' ? '青' : '緑'}が勝つ / 寄せ:${lean})`,
    when: { event: 'leverOn', mode: ['FREE_TIER'], flag: S.flags },
    weight: { FREE_TIER: FORCE_BLUEGREEN ? FORCE_WEIGHT : S.weight, default: 0 },
    ...(S.chance != null && !FORCE_BLUEGREEN ? { chance: S.chance } : {}),
    /**
     * 【必須】結果告知(result)に化けさせないための明示。
     * これが無いと文言の中身から推定され、「継続」「確定」などの語を1つ踏んだ側だけが
     * announce 枠を取る = 2択の片側だけ扱いが変わる(上のブロックの事故)。
     */
    priority: 'gimmick',
    /**
     * 尺は「stop3 の最終 cue の直後で終わる」長さにする。
     * 6000ms だった頃は1ゲーム周期(約3秒)より長く枠を握り続け、
     * その間に来た本物の結果告知を巻き添えで落としていた。
     * waitFor の cue は解放されるまで発火しないので、
     * 遅く押された場合は duration ではなく cue の発火完了まで生きる(Timeline の done 条件)。
     */
    duration: 2600,
    cues: [
      { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'contract_sign', gain: 0.6 } },
      // 切替中。当落は伏せたまま、寄せ方(lean)で煽る
      { at: 0, layer: 'lcd', action: 'anim',
        params: { anim: 'bluegreen_choice', phase: 'shift', lean, ms: 12000 } },
      { at: 60, layer: 'lcd', action: 'text',
        params: { text: 'トラフィック切替', sub: 'Blue と Green、どちらへ寄る?', color: '#cfe0ff', ms: 900 } },
      // 停止のたびに刻む(進行が目と耳で分かる)
      { waitFor: 'stop1', layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.5 } },
      { waitFor: 'stop2', layer: 'sfx', action: 'synth', params: { preset: 'countdown_tick', gain: 0.6 } },
      // 第3停止 = 当落確定。ここで初めて勝ち側を出す
      { waitFor: 'stop3', after: 100, layer: 'lcd', action: 'anim',
        params: { anim: 'bluegreen_choice', phase: 'decide', win, lean, ms: 1800 } },
      { waitFor: 'stop3', after: 120, layer: 'sfx', action: 'synth', params: { preset: 'upgrade_chime' } },
      { waitFor: 'stop3', after: 140, layer: 'overlay', action: 'flash', params: { color: S.flash, ms: 220 } },
      /*
       * 2択の決着 = 結論行。U57 で他の予兆と同じライフサイクルへ揃えた:
       *   stop3 で出す(ここは元から)+ **次のレバーONで消える**(sticky)。
       * 以前は sticky:false を明示していたが、その理由だった
       * 「残すと本物の告知の居場所を奪う」は U57 の
       * 『sticky は上限寿命であって占有権ではない』(lcdanims.js の showText)で
       * 構造的に解消した。新しい告知が来れば最低表示時間で必ずゆずる。
       * result 誤判定の防止は priority:'gimmick'(上)と文言側で担保している
       * ── classifyScenario は sticky パラメータではなく **文言** を見るため、
       *    ここを sticky:true にしても分類は動かない。
       */
      conclusionCue({ flag: S.role, text: S.text, sub: S.sub, after: 420, ms: 1300 }),
    ],
  };
}

/** 勝ち側2種 × 寄せ方2種。寄せ方の選択が「煽りだけの演出RNG」にあたる */
function bluegreenChoiceScenarios() {
  return ['blue', 'green'].flatMap(
    (win) => ['even', win === 'blue' ? 'green' : 'blue'].map((lean) => bluegreenScenario(win, lean)),
  );
}

export default applyForce([
  /* ══ 1. 風がレア役を運んでくる ═══════════════════════════════════════
   *
   * CloudFront のエッジから吹く風(Kinesis の流れ)が液晶を右→左に吹き抜け、
   * 絵柄が流れてきて中央に着地する。着地した絵柄がそのゲームの成立役になる。
   * 強度は 0:青(弱) / 1:金(レア) / 2:虹(最上位)。
   *
   * ── U24(2026-08-14 ユーザー指示)/ 風が運ぶのは **レア役だけ** ──────
   *   ベル版(旧 yw_wind_bell)は廃止した。ゲーム側の契機がレア役へ一本化された
   *   (data/rareroles.js)いま、ベルまで運んでしまうと
   *   「風が吹いた = 何か起きるかも」の意味が薄まるため。
   *   運ぶ = レア役成立、が1対1で対応する形にしてある
   *   (何も運ばない yw_wind_gase だけが例外。あれは「運ばれてこない」画なので
   *    レア役の意味とはぶつからない)。
   */
  {
    id: 'yw_wind_rare_cherry',
    name: '【中】金の風が IAM(チェリー)を運んでくる',
    when: { event: 'leverOn', flag: ['WEAK_CHERRY', 'STRONG_CHERRY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'wind_gust' } },
      { at: 40,  layer: 'lcd',  action: 'anim',
        params: { anim: 'edge_wind_carry', symbol: 'CHERRY', count: 1, strength: 1, dir: -1, ms: 1900 } },
      { at: 900, layer: 'sfx',  action: 'synth', params: { preset: 'edge_hit' } },
      // U62: 運ばれた絵柄 = 成立役なので、結論行はチェリー(IAM)の赤。
      // 以前は金文字で「色 = 成立役」の対応が崩れていた
      conclusionCue({
        flag: 'WEAK_CHERRY', text: 'IAM 到着', sub: '金の風がアクセスキーを運んできた',
        after: 80, ms: 1000,
      }),
    ],
  },

  {
    id: 'yw_wind_rare_melon',
    name: '【中】金の風が S3(スイカ)を運んでくる',
    when: { event: 'leverOn', flag: ['MELON'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'wind_gust' } },
      { at: 40,  layer: 'lcd',  action: 'anim',
        params: { anim: 'edge_wind_carry', symbol: 'MELON', count: 1, strength: 1, dir: -1, ms: 1900 } },
      { at: 900, layer: 'sfx',  action: 'synth', params: { preset: 'edge_hit' } },
      // U9: S3(スイカ)対応の示唆なので緑。tone は付けない(信頼度の赤帯とは別レイヤー)
      conclusionCue({
        flag: 'MELON', text: 'S3 到着', sub: '風がオブジェクトを運んできた', after: 80, ms: 1000,
      }),
    ],
  },

  {
    id: 'yw_wind_rare_chance',
    name: '【中】金の風が Lambda(チャンス目)を運んでくる',
    when: { event: 'leverOn', flag: ['CHANCE'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 55, default: 0 },
    duration: 2100,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,   layer: 'sfx',  action: 'synth', params: { preset: 'wind_gust' } },
      { at: 40,  layer: 'lcd',  action: 'anim',
        params: { anim: 'edge_wind_carry', symbol: 'LAMBDA', count: 1, strength: 1, dir: -1, ms: 1900 } },
      { at: 900, layer: 'sfx',  action: 'synth', params: { preset: 'edge_hit' } },
      // U62: チャンス目(Lambda)は黄。金(#ffe066)とは別の色にして役と1対1にする
      conclusionCue({
        flag: 'CHANCE', text: 'Lambda 到着', sub: '関数が運ばれてきた', after: 80, ms: 1000,
      }),
    ],
  },

  {
    id: 'yw_wind_rare_shark',
    name: '【強】虹の風がジョージ(BAR)を運んでくる',
    when: { event: 'leverOn', flag: ['SHARK'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 70, default: 0 },
    duration: 2400,
    cues: [
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'bonus' } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'wind_gust' } },
      { at: 40,   layer: 'lcd',     action: 'anim',
        params: { anim: 'edge_wind_carry', symbol: 'SHARKBAR', count: 1, strength: 2, dir: -1, ms: 2200 } },
      { at: 1000, layer: 'overlay', action: 'flash', params: { color: '#ffe066', ms: 220 } },
      { at: 1040, layer: 'sfx',     action: 'synth', params: { preset: 'shark_swim' } },
      // 「何が運ばれてきたか」までで止める。当落は判定側の演出が語る。色はサメの水色(U62)
      conclusionCue({
        flag: 'SHARK', text: 'BAR 到着', sub: '虹の風がエッジから運んできた', after: 80, ms: 1200,
      }),
    ],
  },

  {
    id: 'yw_wind_gase',
    name: '【ガセ】風は吹いたが何も運ばれてこない',
    /*
     * ハズレ専用。ここで絵柄を出すと「ベルが来た」と読めてしまうので、
     * edge_wind_carry には count:0 を渡して **何も運ばれない** 画にする。
     * 前兆中は出さない(前兆の当選告知と「何も来なかった」がぶつかるため)。
     */
    when: {
      event: 'leverOn', flag: ['LOSE'], mode: ['FREE_TIER'],
      match: { 'modeState.zenchoActive': [false] },
    },
    weight: { FREE_TIER: 50, default: 0 },
    chance: 0.18,
    duration: 1600,
    cues: [
      { at: 0,  layer: 'sfx', action: 'synth', params: { preset: 'wind_gust', gain: 0.45 } },
      { at: 40, layer: 'lcd', action: 'anim',
        params: { anim: 'edge_wind_carry', count: 0, strength: 0, dir: -1, ms: 1400 } },
      /*
       * 「何も運ばれてこなかった」= このゲームの結論(U57)。
       * 当落が確定する stop3 まで待ってから出し、色はハズレの白(U62)。
       * 以前は at:950 = **第3停止より前** に出ることがあり、
       * 「結果の画は当落確定イベントのみ」を踏み越えていた。
       */
      conclusionCue({
        flag: 'LOSE', text: '風だけが通り過ぎた', sub: 'キャッシュには何も残らなかった', ms: 900,
      }),
    ],
  },

  /* ══ 2. コールドスタートの「無音の間」 ═══════════════════════════════
   *
   * Lambda のコールドスタート = 呼ばれてから実行環境が立ち上がるまでの間、というネタ。
   * 何も音を出さない時間を作り、間が明けてから「発生した」ことだけを伝える。
   *
   * ══ U29(2026-08-14 ユーザー指示)で作り替えた3点 ══════════════════
   *
   * ① 間を長くした(500 / 900ms → **750 / 1400ms**)。長いほうが熱いのは維持。
   * ② 文言を「COLD START 解消」→「**コールドスタート発生**」に。
   *    起きているのは初期化であって、解消したという結論ではない(事実に寄せる)。
   * ③ 発火を **レア役が成立したゲームだけ** に限定した(ガセを作らない)。
   *    弱 = レア役全部 / 長 = 強レア役(強チェリー・チャンス目・確定役)だけ。
   *    → 「間が長いほど熱い」が **構造として本当** になる。
   *    レア役の定義は data/rareroles.js が正(ここは when.rare / when.flag で表現する)。
   *
   * ══ リールのショートロックを外した理由(重要な申し送り)══════════════
   *
   * 旧実装は `reelfx.lock`(game/flow.js の lockReels)で **リールの始動そのもの** を
   * 遅らせていた。ロックは BET の時点で予約する必要があるが、
   * **成立役が決まるのは次のレバーON**(flow.js の drawFlag)なので、
   * BET の時点では「このゲームがレア役か」を知りようがない。
   * つまり旧実装の構造では ③(レア役限定)を満たせず、必ずガセが混ざる。
   *   → 演出側の判断で、リールを止めるのはやめて「音を出さない間」だけを残した。
   *
   * ロックを復活させたい場合は **ゲーム側に1つ口が要る**(演出側では作れない):
   *   game/flow.js の leverOn で `bus.emit('leverOn')` を
   *   リール始動(reels.startAll)より前に出すか、
   *   成立役決定後に呼べる flow.lockCurrentSpin(ms) を用意する。
   *   どちらもゲーム進行の順序に触るので、ロジック担当の判断が要る。
   *   受け口(actions.js の 'reelfx.lock')と FREEZE.maxLockMs はそのまま残してある。
   *
   * ══ 「ピク止め」で間を取り戻した(2026-08-15 ユーザー指示 U64-6)══════
   *
   * ユーザー指示は「コールドスタートのときは、レバーONでリールが一瞬だけ動いて
   * すぐ止まり、1秒ほど静止してから回り出してほしい」。
   * 上のとおりゲーム側のロックはこの枠では使えないので、
   * **描画だけを止める** `reelfx.stall`(render/reelview.js の stall())で実現した。
   *   ・リールの位置・速度・停止制御・成立役は1ミリも変わらない(描く場所だけ差し替え)
   *   ・レバーONの後(= 成立役が決まった後)に呼ぶので ③(レア役限定)を壊さない
   *   ・演出RNGもゲーム抽選RNGも消費しない
   * 「無音の間」と長さを揃えてあるので、静止が明けるのと同時に文字が出る。
   *
   * ■ 「無音」について
   *   このシナリオは SE を1つも鳴らさない。ただしレバーON音と
   *   レア役の効果音(main.js の FLAG_SFX)はシナリオの外で鳴るので、完全な無音ではない。
   *
   * ■ デバッグ強制発火
   *   キー 1〜4 / 7 / 8 でレア役を強制成立させてレバーONすれば出る
   *   (弱=どのレア役でも / 長=強チェリー・チャンス目・サメ・ゴーストのみ)。
   */
  {
    id: 'yw_coldstart_lock',
    name: '【弱】Lambda コールドスタート(レア役成立ゲームの無音の間)',
    when: { event: 'leverOn', mode: ['FREE_TIER'], rare: true },
    weight: { FREE_TIER: 35, default: 0 },
    /*
     * 液晶に出すのは短いテキスト1本だけなので、演出枠(visual スロット)は握らない。
     * 握ると同じレバーONで走るはずの予告が「slot-busy」で落ちてしまう。
     */
    priority: 'ambient',
    duration: 1800,
    cues: [
      /*
       * ピク止め(見た目だけ)。レバーONで一瞬動いて止まり、無音が明けると回り出す。
       * ms は下の無音(750ms)と揃えてある。出目・停止制御は一切変わらない。
       */
      { at: 0, layer: 'reelfx', action: 'stall', params: { ms: 750 } },
      // 750ms は完全な無音。ここに音や画を足すと "間" が消える
      { at: 750, layer: 'lcd', action: 'text',
        params: { text: 'コールドスタート発生', sub: '関数の実行環境を初期化中', color: '#8ad4ff', ms: 900 } },
    ],
  },
  {
    id: 'yw_coldstart_lock_long',
    name: '【中】Lambda コールドスタート・ロング(強レア役限定の長い無音)',
    /*
     * 長い間は **強レア役でしか出ない**。
     * 「長いほど熱い」を演出の重みではなく発火条件そのもので保証している。
     */
    when: {
      event: 'leverOn', mode: ['FREE_TIER'],
      flag: ['STRONG_CHERRY', 'CHANCE', 'SHARK', 'GHOST'],
    },
    weight: { FREE_TIER: 45, default: 0 },
    priority: 'ambient',
    duration: 2600,
    cues: [
      // ロングはピク止めも長い(= 静止が長いほど熱い、が画でも分かる)
      { at: 0,    layer: 'reelfx', action: 'stall', params: { ms: 1400 } },
      { at: 1400, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 1400, layer: 'lcd',  action: 'text',
        params: {
          text: 'コールドスタート発生', sub: '初期化が長い — 大きな実行環境が立ち上がっている',
          color: '#ffd166', ms: 1100,
        } },
    ],
  },

  /* ══ 3. ランプ先光り(先告知 / 先ペカ)══════════════════════════════
   *
   * 液晶には何も出さない = ambient クラスなので演出枠(1ゲーム2本)を消費しない。
   * 「見逃してもいいが、気づくと嬉しい」層の演出。
   *
   * 【発火タイミング(2026-08-14 ファクトチェック F3)】
   *   実機の先告知(先ペカ)は **レバーONの瞬間** に光る。BET では光らない。
   *   ここも leverOn に合わせた。
   *
   * 【weight / chance の考え方】
   *   leverOn は候補が数十本ある激戦区(合計 weight ≒ 4000)で、director は
   *   1イベントにつき1本しか選ばない。ここで chance を持たせると
   *   「選ばれたのに何も起きないゲーム」= 演出の空白が増えるだけなので、
   *   chance は置かず weight だけで頻度を作る(weight 50 ≒ 1/100G)。
   *   移設前(bet・weight 30・chance 0.05)の実効 1.0%/G とほぼ同じ。
   */
  {
    id: 'yw_lamp_preflash',
    name: '【先告知】CloudWatch のアラーム灯がレバーONで一瞬光る',
    when: { event: 'leverOn', mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 50, default: 0 },
    duration: 900,
    cues: [
      { at: 0,   layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 40,  layer: 'sfx',  action: 'synth', params: { preset: 'countdown_tick', gain: 0.35 } },
      { at: 620, layer: 'lamp', action: 'pattern', params: { pattern: 'idle' } },
    ],
  },

  /* ══ 4. キャラが画面を横切る ═══════════════════════════════════════ */
  {
    id: 'yw_george_swimby',
    name: '【弱】ジョージが液晶を横切っていく',
    when: { event: 'leverOn', flag: ['LOSE', 'BELL', 'REPLAY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    chance: 0.12,
    duration: 2000,
    cues: [
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'shark_swim', gain: 0.5 } },
      { at: 0,    layer: 'char', action: 'show',   params: { char: 'george', pose: 'chill' } },
      { at: 20,   layer: 'char', action: 'motion', params: { char: 'george', motion: 'swimIn' } },
      { at: 1100, layer: 'char', action: 'motion', params: { char: 'george', motion: 'swimOut' } },
      { at: 1900, layer: 'char', action: 'hide',   params: { char: 'george' } },
    ],
  },
  {
    id: 'yw_george_swimby_carry',
    name: '【強】ジョージが IAM(チェリー)をくわえて横切る',
    // 強チェリー成立時だけ。くわえている絵柄は必ず成立役と一致させる
    when: { event: 'leverOn', flag: ['STRONG_CHERRY'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 40, default: 0 },
    duration: 2300,
    cues: [
      { at: 0,    layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'sfx',  action: 'synth', params: { preset: 'shark_swim' } },
      { at: 0,    layer: 'char', action: 'show',   params: { char: 'george', pose: 'grin' } },
      { at: 20,   layer: 'char', action: 'motion', params: { char: 'george', motion: 'swimIn' } },
      // 風の弱パラメータを重ねて「くわえてきた絵柄」を見せる
      { at: 200,  layer: 'lcd',  action: 'anim',
        params: { anim: 'edge_wind_carry', symbol: 'CHERRY', count: 1, strength: 1, dir: -1, ms: 1600 } },
      { at: 1400, layer: 'char', action: 'motion', params: { char: 'george', motion: 'swimOut' } },
      { at: 2200, layer: 'char', action: 'hide',   params: { char: 'george' } },
    ],
  },

  /* ══ 5. 扉 / シャッター演出 ═══════════════════════════════════════
   *
   * 液晶にシャッターが降り、上がると絵/文言が変わっている。
   * **閉じている時間の長さ(hold)で期待度を出す** のが定番の作法。
   */
  {
    id: 'yw_shutter_az',
    name: '【弱】AZ 切替シャッター(短く閉じる)',
    when: { event: 'leverOn', flag: ['LOSE', 'REPLAY', 'REPLAY2'], mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 45, default: 0 },
    chance: 0.14,
    duration: 1900,
    cues: [
      { at: 0,   layer: 'sfx', action: 'synth', params: { preset: 'ttl_tick', gain: 0.7 } },
      { at: 20,  layer: 'lcd', action: 'anim',
        // F5: AZ の呼び方は実在の名前(ap-northeast-1c)に統一する
        params: { anim: 'az_shutter', hold: 0.18, label: 'AZ 切替', after: 'ap-northeast-1c ACTIVE', ms: 1800 } },
      { at: 900, layer: 'sfx', action: 'synth', params: { preset: 'ttl_zero', gain: 0.6 } },
    ],
  },
  {
    id: 'yw_shutter_az_long',
    name: '【中】AZ 切替シャッター(長く閉じる = 熱い)',
    when: { event: 'leverOn', rare: true, mode: ['FREE_TIER'] },
    weight: { FREE_TIER: 38, default: 0 },
    duration: 2400,
    cues: [
      { at: 0,    layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 0,    layer: 'sfx',     action: 'synth', params: { preset: 'pillar_up' } },
      { at: 20,   layer: 'lcd',     action: 'anim',
        params: { anim: 'az_shutter', hold: 0.5, label: 'AZ 切替', after: 'MULTI-AZ 復旧', color: '#ffd166', ms: 2300 } },
      { at: 1500, layer: 'overlay', action: 'flash', params: { color: '#ffd166', ms: 200 } },
      { at: 1540, layer: 'sfx',     action: 'synth', params: { preset: 'upgrade_chime' } },
    ],
  },

  /* ══ 赤文字の裏切り枠(2026-08-14)═══════════════════════════════════
   *
   * 「赤 = 確定」にしないための、**構造的に必ず空振りする赤**。
   * 既存の裏切り枠 yh_hot_false_alarm(yokoku-heavy.js)と同じ役割で、
   * 今回の変更で赤の信頼度が上がりすぎるのを相殺するために足した:
   *
   *   1. ZENCHO.fake.denom を 1/40 → 1/90 にしたので、前兆に占めるガセの割合が
   *      36% → 22% へ下がった = 前兆から出る赤の信頼度がそのぶん上がった
   *   2. 当時 director の YOKOKU_CHANCE_SCALE(= 0.6)が既存の裏切り枠にも掛かって
   *      裏切りの量が 0.020 → 0.012 相当へ減っていた
   *      (係数は U51 で引き上げ済み。現行値は staging/director.js を見ること)
   *   3. 赤文字予兆を1本(zn_hot_region_evacuation)増やした
   *
   * このシナリオは条件でほぼ空振りに寄せてある:
   *   flag         … CZ_ENTRY.table に行が無い3役(成立役契機では当たらない)
   *   zenchoActive … false = 前兆も走っていない(保持中の当選も無い)
   * 【2026-08-15 訂正】「保証」ではない。ステージの毎ゲームCZ抽選と
   * レバーONフリーズは成立役に依存せず走るので、上位ステージではまれに当たる。
   * 画面で結論を出さない作りなので嘘にはならないが、断定する文言は足さないこと
   * (足すなら yokoku-batch3.js の WEAK_WHEN と同じ4条件まで絞る)。
   *
   * scaleChance:false … 裏切り枠まで間引くと目的が逆転するので、間引き係数の対象外にする。
   * 最終的な赤の信頼度(目標 75〜85%)は実測して調整すること。
   */
  {
    id: 'yw_hot_false_evacuation',
    name: '【赤・ガセ】退避準備の号令が出るが何も起きない',
    when: {
      event: 'leverOn', mode: ['FREE_TIER'], flag: ['LOSE', 'BELL', 'REPLAY'],
      match: { 'modeState.zenchoActive': [false] },
    },
    weight: { FREE_TIER: 400, default: 0 },
    chance: 0.020,
    scaleChance: false,
    duration: 2000,
    cues: [
      { at: 0,   layer: 'sfx',     action: 'synth', params: { preset: 'region_light' } },
      { at: 0,   layer: 'lamp',    action: 'pattern', params: { pattern: 'rare' } },
      { at: 40,  layer: 'overlay', action: 'flash', params: { color: '#ff3b30', ms: 200 } },
      { at: 80,  layer: 'lcd',     action: 'anim',  params: { anim: 'lcd_flash', color: '#ff3b30', strength: 0.5 } },
      { at: 200, layer: 'lcd',     action: 'text',
        // U25: サブ行に AWS 要素(リージョン退避)を残す。断定はしない
        params: { text: 'EVACUATE?', sub: 'リージョン退避の号令が出ている', tone: 'hot', color: '#ff3b30', ms: 1300 } },
      // 結論は出さない。何も起きないまま終わるのがこのシナリオの役目
      { waitFor: 'stop3', after: 300, layer: 'lamp', action: 'pattern', params: { pattern: 'idle' } },
    ],
  },

  /* ══ 6. Direct Connect 開通2択(U37。旧「0コマ停止の煽り」の置き換え)═══
   *
   * 組み立ては上の directConnectScenarios() / DC_HITS を参照。
   * 煽り(共通)→ 第3停止で「オンプレと接続完了」か「接続できなかった…」に割れる。
   *
   * 【旧実装の履歴(文言の変遷 U12 → U25 → U37)】
   *   1. 「レイテンシ 1ms — ビタ」… 1ms は AWS が公表している値ではなく
   *      (専用線の売りは値の小ささではなくブレの小ささ)、「ビタ」も打ち手の用語なので撤去。
   *   2. 「スベリ 0コマ — 狙い撃ち!?」… 事実には反しないが AWS 要素がメイン行から消えた(U25)。
   *   3. 「専用線、直結 — ズレなく届く…!?」… AWS 要素は戻ったが **結論を出さない煽り** どまりで、
   *      さらに match.slip:[0](実際に滑らなかった第2停止)に縛られるので出現も不安定だった。
   *   4. いまの分岐型(U37)。開通する / しない まで見せるので、出たときの記憶に残る。
   */
  ...directConnectScenarios(),

  /* ══ 7. BLUE / GREEN デプロイ2択(U18 / 2026-08-14 ユーザー指示)═══════
   *
   * 液晶が青と緑に割れ、**実際の絵柄画像** が両側に乗る:
   *   青 BLUE (現行) … REPLAY(リプレイ / DynamoDB)
   *   緑 GREEN(新)  … MELON (スイカ / S3)
   * トラフィックの寄りで引っ張り、**第3停止で確定**する2択告知。
   *
   * ■ どちらかが必ず成立する
   *   発火条件が when.flag(REPLAY か MELON)なので、この演出が出た時点で
   *   「青か緑のどちらかは必ず成立している」= 2択の体裁が嘘にならない。
   *   勝ち側(params.win)は成立役そのもの。**演出RNGが決めるのは
   *   煽りの寄せ方(lean)だけ** で、勝敗には一切関与しない。
   *
   * ■ AWS ネタとしての整合(U25 の3条件)
   *   Blue/Green デプロイは「現行(Blue)と新(Green)を並べ、トラフィックを
   *   切り替える」デプロイ方式。ここでは
   *     青が勝つ = 現行のまま → リプレイ(もう1回転)
   *     緑が勝つ = 新へ切替  → スイカ(新しいオブジェクトが載る)
   *   と対応させてあるので、絵柄の意味とデプロイの意味が食い違わない。
   *
   * ■ 出現頻度の考え方(2026-08-14 検証で実測ベースへ引き直し)
   *   リプレイは 1/7.3 と高頻度なので chance で強く間引き、
   *   スイカは 1/100 と希少なので weight を大きくして「引けたら見られる」側に寄せる。
   *   実効発火率は「成立率 × その役での weight 占有率 × 実効chance」で決まる。
   *   計測当時(YOKOKU_CHANCE_SCALE = 0.6)の内訳:
   *     青 0.137/G × 600/2085 × (0.20×係数) ≒ 0.47回/100G
   *     緑 0.010/G × 4800/9053 × 1.00       ≒ 0.53回/100G
   *   → 青:緑 ≒ 5:5 に揃えるのが狙い。**この比率が設計値**で、
   *     絶対量は係数(U51 で引き上げ済み。director.js が正)に比例して動く。
   *   (旧: 青の class 誤判定で間引きが効かず 1.34 対 0.22 = 86:14 だった)
   *
   * ■ デバッグ強制発火
   *   `?bluegreen=1` … この2択を最優先で出す(chance も外す)。
   *   キー 6(リプレイ)/ 3(スイカ)で成立役を固定してレバーONすれば狙って見られる。
   */
  ...bluegreenChoiceScenarios(),
]);
