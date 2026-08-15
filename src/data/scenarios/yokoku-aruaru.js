/**
 * 「AWSあるある分岐予兆」シリーズ(prefix `ya2_`)。DESIGN.md 6.5 / 2026-08-14 ユーザー指示 U13
 *
 * ══ 何をする演出か ═══════════════════════════════════════════════
 *
 *   レバーON        … 現場でよくある場面の **導入セリフ** が出る(例:「IAMを発行しよう」)
 *   リール停止(stop3)… 当落が確定した瞬間に分岐する
 *       ハズレ    → AWSあるあるの **アンチパターン** を言い放って「ブッブー」
 *                   (例:「とりあえずadmin権限を付与する」)
 *       レア役成立 → **ベストプラクティス** を **成立したレア役の色** で表示
 *                   (例:「最小限の権限を付与する」を IAM = チェリーの赤で)
 *
 * ── U24(2026-08-14 ユーザー指示)/ 成立側は **レア役だけ** ────────────
 *   ゲームの契機がレア役へ一本化された(data/rareroles.js)のに合わせ、
 *   **ベル・リプレイ・Bedrock役では演出そのものを出さない** ようにした。
 *   そのため成立側をレア役へ割り当てられないネタ(instance_size / no_tags /
 *   console_master / bedrock_biggest)は表ごと退役させてある(下の RETIRED_TOPICS)。
 *   「同じ入りなのにオチが違う」を守るため、**片側だけのネタは作らない**:
 *   ネタは必ずハズレ版と成立版の両方を持つ(片方しか無いと、その導入が出た時点で
 *   結果が読めてしまう)。
 *
 * 導入セリフはハズレ版と成立版で **完全に同じ文言** にしてある。これがこの演出の芯で、
 * 「同じ入りなのにオチが違う」から分岐が効く。したがって文言を直すときは必ず
 * TOPICS の1か所を直すこと(下の組み立て関数が両方へ配る)。
 *
 * ══ 守っている原則 ═══════════════════════════════════════════════
 *
 * ■ 出目は1コマも動かさない
 *   ここは演出データで、参照するのは director が渡す **確定済みの結果** だけ。
 *   chance / weight を引くのは演出専用RNG(staging/director.js)で、
 *   ゲーム抽選RNGとは別系統。シナリオを足しても引いても抽選結果は変わらない。
 *
 * ■ 結果の画は当落確定イベントだけ
 *   アンチパターン(=ハズレ)もベストプラクティス(=成立)も、必ず `waitFor:'stop3'`。
 *   レバーONの時点で出すのは、どちらに転んでも成立する導入セリフのみ。
 *   ハズレ側の文言は「小役が揃わなかった」ことしか言わない。
 *   前兆やCZ当選の有無には一切触れない(ハズレの回転でも当選は起こりうるため)。
 *
 * ■ ハズレ側は LOSE 限定
 *   「ブッブー」は "何も揃わなかった" の合図なので、リプレイやベルに被せると嘘になる。
 *   when.flag は LOSE だけ。逆に成立側は「その色を出してよい役」だけに限定する。
 *
 * ■ U8(二重表示の禁止)
 *   使うのは液晶のテキスト帯(lcd.text)だけ。筐体下部のテロップは触らない。
 *
 * ■ U5(予兆の総量を増やさない)
 *   → 下の「重みと発火率の設計」を参照。既存の予告シナリオの取り分を
 *      相対的に下げるだけで、1ゲームあたりの予告発火率は据え置きにしてある。
 *
 * ══ 色のルール(U9 → U62 で1か所に集約)═══════════════════════════
 *
 * data/zencho.js の ZENCHO_TEXT_COLORS が定めた
 *   「文字だけ色が付いている = 対応役のサイン」「脈打つ赤帯(tone:'hot') = 信頼度」
 * のレイヤー分けをそのまま踏襲する。このシリーズは tone を一切使わない
 * (= 赤帯は出さない)ので、信頼度示唆の赤と混ざることはない。
 *
 *   導入セリフ … 中立の白(#e6ecf5)。まだ何も確定していない
 *   ハズレ    … **白**(ROLE_COLORS.LOSE)。役色が付かない = 何も成立していない
 *   成立      … 成立役の色(data/rolecolors.js)
 *
 * 【U62】以前はこのファイルが FLAG_COLOR という色表を自前で持っていたが、
 * 同じ写しが4ファイルに散って値がズレ始めたので **data/rolecolors.js へ集約**した。
 * 色を変えたくなったらあちらだけを直すこと(ここに16進を書かない)。
 * ハズレの色も U62 で灰(#96a3b3)から白へ変わっている。
 *
 * ══ 結論のライフサイクル(U57)═══════════════════════════════════
 * アンチパターン(ハズレ)もベストプラクティス(成立)も conclusionCue() で作る。
 * = **第3停止で出て、次のゲームのレバーONで消える**。
 */

import { colorForFlag, conclusionCue } from '../rolecolors.js';

/** 導入セリフの色(中立。まだ何も言い切っていないので役色ではない) */
const COLOR_INTRO = '#e6ecf5';

/* ══ 重みと発火率の設計(U5)═════════════════════════════════════
 *
 * director は「候補の中から weight で1本選び、その1本の chance で発火を間引く」。
 * つまり **候補を増やすだけでは発火率は上がらない**(取り分が移るだけ)。
 * 上がってしまうのは「chance を持たない候補」を増やしたときだけなので、
 * 既存プールの実測発火率に合わせた chance を持たせれば総量は据え置きにできる。
 *
 * 2026-08-14 時点の leverOn プール実測(FREE_TIER / 前兆なし):
 *   LOSE   候補79本 総weight 4783 … 発火率 0.156
 *   BELL   候補60本 総weight 3847 … 発火率 0.153
 *   REPLAY 候補55本 総weight 3512 … 発火率 0.154
 *   レア役(チェリー/スイカ/チャンス目/サメ) … 候補は全部 chance なし = 発火率 1.00
 *   ALARM  候補2本 総weight 9050(うち9000は専用演出 yb_bedrock_alarm_invoke)… 発火率 1.00
 *
 * これに合わせて:
 *   - ハズレ側(LOSE)と、ベル/リプレイの成立側 … chance を持たせる。
 *     プール内の他の弱予告と同じ chance なので、取り分が動いても総量は変わらない。
 *     ※ 上の実測は計測当時(YOKOKU_CHANCE_SCALE = 0.6)のもの。係数は U51 で動いた。
 *       **係数の値をここに写さないこと**(staging/director.js が唯一の正)。
 *       見るべきは絶対値ではなく「この chance がプール内で浮いていないか」。
 *   - レア役の成立側 … プールが元から発火率1.00なので chance なしでよい(総量不変)。
 *
 * weight は上の総weightから取り分を逆算した値(ハズレ側=約3割 / 成立側=約2割)。
 * 既存演出の取り分がそのぶん相対的に下がる = U5 の「足したぶんだけ既存を下げる」を
 * 重みの取り合いで実現している。数字が大きいのは候補が60〜90本もいるためで、
 * 既存にも同じ作法の例がある(yb_bedrock_alarm_invoke の weight:9000)。
 *
 * 【追加後の実測】1ゲームあたりの予告発火率 0.2049 → 0.2050(据え置き)。
 * このシリーズの出現は100回転あたり約4.8回(ハズレ 約2.8 / 成立 約2.0)。
 */
const CHANCE_COMMON = 0.26;

/**
 * 成立役グループごとの weight(上のプール総weightから取り分を逆算)。
 *
 * ハズレ側は予告全体の約3割を取りにいく(このシリーズの主役は笑いどころのハズレ)。
 * 成立側は約2割に抑えてあり、100回転あたりの出現は
 *   ハズレ 約2.8回 / 成立 約2.0回(= ハズレ寄りの 6:4)になる。
 */
const WEIGHT = {
  /**
   * ハズレ側の1本あたり。U24 でネタが 12 → 8 に減ったので、
   * 合計は 2040 → 1360(LOSEプールの約3割 → 約2割)。
   * 「ハズレのほうがよく出る」の関係は保ったまま、総量は減る方向なので
   * U5(予告を増やさない)にも反しない。
   */
  LOSE: 170,
  /** チェリー 3ネタぶん(iam_admin / keys_hardcode / sg_open)の合計が約1350 */
  CHERRY: 450,
  /** スイカ 2ネタぶん(s3_public / prod_direct)の合計が約2200 */
  MELON: 1100,
  /** チャンス目 2ネタぶん(nat_forever / lambda_timeout)の合計が約1600 */
  CHANCE: 800,
  /** サメ揃い 1ネタ(サメプールの約2割。そもそも 1/1200 なのでほぼ見られない隠し玉) */
  SHARK: 1000,
  /* U24 で成立側を出さなくなった役(ベル / リプレイ / Bedrock)の枠は削除した。
     復活させるときは RETIRED_TOPICS のコメントを参照。 */
};

/* ══ デバッグ強制発火 ═══════════════════════════════════════════
 *
 * URL クエリ `?aruaru=1` … このシリーズを最優先で出す(他の予告を押しのける)
 *            `?aruaru=iam_admin` … 指定した1ネタだけを最優先で出す(TOPICS の id)
 *
 * 強制中は weight を跳ね上げ、chance を外して必ず発火させる。
 * 通常プレイ(クエリなし)では一切影響しない。
 * ブラウザ以外(scripts/sim.mjs 等)には location が無いので、その場合も常に無効。
 */
const FORCE_TOPIC = (() => {
  try {
    if (typeof location === 'undefined' || !location?.search) return null;
    const v = new URLSearchParams(location.search).get('aruaru');
    return v ? v.trim() : null;
  } catch {
    return null;
  }
})();

/** そのネタが強制指定されているか */
const isForced = (id) => FORCE_TOPIC != null
  && (FORCE_TOPIC === '1' || FORCE_TOPIC === 'on' || FORCE_TOPIC === 'all' || FORCE_TOPIC === id);

/** 強制中の weight(他の候補を確実に押し切る大きさ) */
const FORCE_WEIGHT = 200000;

/* ══ ネタ表 ═══════════════════════════════════════════════════════
 *
 * id       … デバッグ強制(?aruaru=<id>)とシナリオIDに使う
 * intro    … レバーONで出る導入(ハズレ版・成立版で共通。ここが同じであることが命)
 * bad      … ハズレ確定で出るアンチパターン(笑いどころ)
 * good     … 成立で出るベストプラクティス
 * flags    … 成立側を出してよい成立役。ここに書いた役の色で good を表示する
 * color    … data/rolecolors.js のキー(役ID または別名)。flags と必ず対応させること
 * weight   … 成立側の weight(WEIGHT のキー)
 * chance   … 成立側に間引きが要るか(ベル・リプレイのような高頻度役だけ true)
 * emphasis … 成立側で電飾とフラッシュを足すか(レア役・特殊役のネタだけ)
 *
 * 【事実確認】AWSの仕様に反するネタは書かないこと。
 *   Lambda のタイムアウト上限は15分 / NAT Gateway は時間課金+データ処理課金 /
 *   S3 のブロックパブリックアクセス / IAM ロールによる一時認証情報 /
 *   SSM セッションマネージャで踏み台レス / コスト配分タグ / Compute Optimizer の
 *   right-sizing … いずれも実在の機能・料金体系に沿った内容にしてある。
 */
const TOPICS = [
  // ── 1. IAM 権限(ユーザー必須指定のネタ)──────────────────────
  {
    id: 'iam_admin',
    intro: 'IAMを発行しよう', introSub: '権限はどう付ける?',
    bad: 'とりあえずadmin権限を付与する', badSub: '「あとで絞る」は永遠に来ない',
    good: '最小限の権限を付与する', goodSub: '必要な操作だけを許可する',
    flags: ['WEAK_CHERRY', 'STRONG_CHERRY'], color: 'CHERRY',
    weight: 'CHERRY', emphasis: true,
  },

  // ── 2. セキュリティグループ(ユーザー提示のネタ)────────────────
  // U24: ベル → 弱/強チェリー(IAM)へ付け替え。
  // 「必要な送信元だけ許可する」は最小権限の話なので IAM の色で違和感がない。
  {
    id: 'sg_open',
    intro: 'セキュリティグループを設定しよう', introSub: 'どこからの通信を通す?',
    bad: '0.0.0.0/0 で全開放!', badSub: 'これで「繋がらない」は解決だ',
    good: '必要な送信元だけ許可する', goodSub: '踏み台やセッションマネージャ経由にする',
    flags: ['WEAK_CHERRY', 'STRONG_CHERRY'], color: 'CHERRY',
    weight: 'CHERRY', emphasis: true,
  },

  // ── 3. S3 の公開設定 ────────────────────────────────────────
  {
    id: 's3_public',
    intro: 'S3バケットを作ろう', introSub: '公開設定はどうする?',
    bad: 'パブリック公開のまま放置', badSub: '翌朝ニュースになるやつ',
    good: 'パブリックアクセスをブロック', goodSub: '公開が要るならCloudFront経由で',
    flags: ['MELON'], color: 'MELON',
    weight: 'MELON', emphasis: true,
  },

  // ── 4. 認証情報の渡し方 ─────────────────────────────────────
  {
    id: 'keys_hardcode',
    intro: 'アプリからAWSを呼びたい', introSub: '認証情報はどう渡す?',
    bad: 'アクセスキーをコードに直書き', badSub: 'そのまま公開リポジトリへpush',
    good: 'IAMロールで権限を渡す', goodSub: '一時認証情報が自動で回る',
    flags: ['WEAK_CHERRY', 'STRONG_CHERRY'], color: 'CHERRY',
    weight: 'CHERRY', emphasis: true,
  },

  // ── 5. 本番作業 ─────────────────────────────────────────────
  // U24: リプレイ → スイカ(S3)へ付け替え。
  // 「スナップショットを取ってから」= 戻せる状態を先に置く話なので、
  // 保管の代表 S3(スイカ)の色で出す。
  {
    id: 'prod_direct',
    intro: 'RDS の本番データを直そう', introSub: '作業の前にやることは?',
    bad: '本番環境でいきなり作業', badSub: 'Enterを押す音だけが響く',
    good: 'スナップショットを取ってから', goodSub: '戻せる状態を先に作る',
    flags: ['MELON'], color: 'MELON',
    weight: 'MELON', emphasis: true,
  },

  // ── 6. NAT Gateway の置きっぱなし ───────────────────────────
  // 「常時起動の時間課金 vs 使ったぶんだけ」の話なので、
  // 成立側は従量課金の代表 Lambda(チャンス目)に寄せている。
  {
    id: 'nat_forever',
    intro: '検証用VPCを片付けよう', introSub: 'NAT Gatewayはどうする?',
    bad: 'NAT Gatewayは置きっぱなし', badSub: '使っていない時間も課金は進む',
    good: '使わないNATは削除する', goodSub: '時間課金は必要なときだけ',
    flags: ['CHANCE'], color: 'LAMBDA',
    weight: 'CHANCE', emphasis: true,
  },

  // ── 9. Lambda のタイムアウト ────────────────────────────────
  {
    id: 'lambda_timeout',
    intro: 'Lambdaで重い処理を回そう', introSub: '15分で終わらない…',
    bad: 'タイムアウトを上限まで伸ばす', badSub: '上限15分。それでも終わらない',
    good: 'Step Functionsで分割する', goodSub: '1関数1責務に切り直す',
    flags: ['CHANCE'], color: 'LAMBDA',
    weight: 'CHANCE', emphasis: true,
  },

  // ── 8. 監視とアラート(サメ揃い = 最上位クラスのご褒美)────────
  {
    id: 'alert_flood',
    // U66-1: どのサービスの話か名乗る(旧「監視を入れておこう」だけでは主語が無かった)
    intro: 'CloudWatch アラームを入れよう', introSub: '通知はどこまで出す?',
    bad: '全メトリクスで通知を飛ばす', badSub: '鳴りすぎて誰も見なくなる',
    good: '対応が要る閾値だけ通知', goodSub: '人を起こすアラートを絞る',
    flags: ['SHARK'], color: 'SHARK',
    weight: 'SHARK', emphasis: true,
  },
];

/**
 * U24(2026-08-14)で退役させたネタ。
 *
 * 成立側の役がレア役ではない(ベル / リプレイ / Bedrock役)ため、
 * 「レア役でしか成立側を出さない」の方針では **ハズレ版しか作れない** ネタ。
 * 片側だけ残すと「この導入が出た = ハズレ確定」と読めてしまうので表ごと外した。
 *
 * 復活させるなら、成立側をレア役(チェリー / スイカ / チャンス目 / 確定役)へ
 * 割り当て直してから TOPICS へ戻すこと。文言はそのまま使える。
 */
export const RETIRED_TOPICS = [
  {
    id: 'instance_size',
    intro: 'インスタンスタイプを選ぼう', introSub: 'サイズはどうする?',
    bad: 'とりあえず一番デカいやつ', badSub: '性能で殴れば全部解決する',
    good: 'right-sizingで最適化', goodSub: '実測メトリクスから選び直す',
    retiredBecause: 'ベル成立が受け皿だった',
  },
  {
    id: 'no_tags',
    intro: '検証用のリソースを作った', introSub: 'タグは付ける?',
    bad: 'タグ無しの野良リソース', badSub: '誰のものか分からず消せない',
    good: 'タグ戦略に沿って付ける', goodSub: 'あとからコストを追える',
    retiredBecause: 'ベル成立が受け皿だった',
  },
  {
    id: 'bedrock_biggest',
    intro: 'Bedrockでチャットを作ろう', introSub: 'モデルはどれを使う?',
    bad: '一番大きいモデルで全部やる', badSub: '精度は最高、請求も最高',
    good: '用途に合うモデルを選ぶ', goodSub: '軽い処理は軽いモデルへ',
    retiredBecause: 'Bedrock役(ALARM)はレア役ではない',
  },
  {
    id: 'console_master',
    intro: '同じ環境をもう1つ作ろう', introSub: 'どうやって再現する?',
    bad: 'コンソールをポチポチ職人', badSub: '手順は担当者の記憶の中だけ',
    good: 'IaCで再現できる形に残す', goodSub: '同じ構成をコードから起こす',
    retiredBecause: 'リプレイ成立が受け皿だった',
  },
];

/**
 * 導入セリフのキュー(ハズレ版・成立版で完全に共通)。
 * ここに電飾やカットインを足すと「入りの時点で当落が読める」ようになり、
 * 分岐の意味が消えるので絶対に足さないこと。
 * @param {object} t TOPICS の1件
 */
function introCues(t) {
  return [
    { at: 0, layer: 'sfx', action: 'synth', params: { preset: 'ui_select', gain: 0.5 } },
    {
      at: 0,
      layer: 'lcd',
      action: 'text',
      params: { text: t.intro, sub: t.introSub, color: COLOR_INTRO, ms: 1000 },
    },
  ];
}

/**
 * ハズレ側(アンチパターン + ブッブー)。当落確定の stop3 でだけ出す。
 * 結論行は conclusionCue = stop3 + sticky(次のレバーONで消える / U57)。
 */
function badScenario(t) {
  const forced = isForced(t.id);
  return {
    id: `ya2_${t.id}_miss`,
    name: `【あるある】${t.intro} → ${t.bad}(ハズレ)`,
    when: {
      event: 'leverOn',
      flag: ['LOSE'],
      mode: ['FREE_TIER'],
      // 前兆中は前兆の演出に画面を譲る(この演出は stop3 まで演出枠を握るため)
      match: { 'modeState.zenchoActive': [false] },
    },
    weight: { FREE_TIER: forced ? FORCE_WEIGHT : WEIGHT.LOSE, default: 0 },
    ...(forced ? {} : { chance: CHANCE_COMMON }),
    duration: 2000,
    cues: [
      ...introCues(t),
      { waitFor: 'stop3', after: 120, layer: 'sfx', action: 'synth', params: { preset: 'buzzer_wrong' } },
      { waitFor: 'stop3', after: 140, layer: 'overlay', action: 'shake', params: { power: 6, ms: 180 } },
      // ハズレ = 何も成立していない → 白(U62)
      conclusionCue({ flag: 'LOSE', text: t.bad, sub: t.badSub, ms: 1300 }),
      /*
       * アンチパターンへのツッコミ(U71b)。クイズの不正解と同じプールを使う
       * (「それは良くないよー」は admin権限を付けちゃう画にそのまま効く)。
       * ■ 当たりは漏れない
       *   この声が鳴るのは **ハズレ確定の stop3 のあと** で、
       *   ベストプラクティス側(下の goodScenario)にも同じ chance で正解側の声を貼ってある。
       *   どちらの声も「もう決まったこと」への反応なので、期待度は1ミリも動かない。
       * ■ 低めの chance
       *   あるあるは頻発する枠なので、毎回ツッコむとうるさい。
       *   engine/voice.js の 1ゲーム1本 + cooldown も併せて効く。
       */
      { waitFor: 'stop3', after: 420, layer: 'voice', action: 'play',
        params: { pool: 'quizNg', chance: 0.3 } },
    ],
  };
}

/** 成立側(ベストプラクティスを成立役の色で)。当落確定の stop3 でだけ出す */
function goodScenario(t) {
  const forced = isForced(t.id);
  const color = colorForFlag(t.color);
  const cues = [
    ...introCues(t),
    { waitFor: 'stop3', after: 120, layer: 'sfx', action: 'synth', params: { preset: 'checklist_ok' } },
    conclusionCue({ flag: t.color, text: t.good, sub: t.goodSub, ms: 1400 }),
    // ベストプラクティスへの相づち(U71b)。ハズレ側と同じ chance で対になっている
    // (声の有無で当落が読めないようにするための対称配置。上の badScenario を参照)
    { waitFor: 'stop3', after: 420, layer: 'voice', action: 'play',
      params: { pool: 'quizOk', chance: 0.3 } },
  ];
  if (t.emphasis) {
    // レア役・特殊役のときだけ、確定後に電飾と一瞬のフラッシュを足す。
    // どちらも stop3 より後なので「入りで当落が読める」ことはない。
    cues.push({ waitFor: 'stop3', after: 120, layer: 'lamp', action: 'pattern', params: { pattern: 'rare' } });
    cues.push({ waitFor: 'stop3', after: 130, layer: 'overlay', action: 'flash', params: { color, ms: 180 } });
  }
  return {
    id: `ya2_${t.id}_best`,
    name: `【あるある】${t.intro} → ${t.good}(${t.flags.join('/')}成立)`,
    when: {
      event: 'leverOn',
      flag: t.flags,
      mode: ['FREE_TIER'],
      match: { 'modeState.zenchoActive': [false] },
    },
    weight: { FREE_TIER: forced ? FORCE_WEIGHT : WEIGHT[t.weight], default: 0 },
    // 高頻度役(ベル・リプレイ)だけ間引く。レア役側のプールは元から間引きが無いので付けない
    ...(t.chance && !forced ? { chance: CHANCE_COMMON } : {}),
    duration: 2200,
    cues,
  };
}

export default TOPICS.flatMap((t) => [badScenario(t), goodScenario(t)]);
