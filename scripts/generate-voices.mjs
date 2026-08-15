#!/usr/bin/env node
/**
 * AWSLOT キャラ音声 一括生成スクリプト(Aivis Cloud API)。DESIGN.md 6.7
 *
 *   node scripts/generate-voices.mjs             → 未生成ぶんだけ生成
 *   node scripts/generate-voices.mjs --dry-run   → APIを叩かずに定義の検証だけ行う
 *   node scripts/generate-voices.mjs --force     → 既存MP3も作り直す
 *   node scripts/generate-voices.mjs --char=kiro → キャラを絞る
 *   node scripts/generate-voices.mjs --only=kiro_cz_win,george_rush_01
 *
 * 生成物:
 *   assets/voices/{char}/{file}     …… MP3
 *   assets/voices/manifest.json     …… key → { file, char, text } の対応表
 *
 * ★PHRASES は「フレーズごとに固定のファイル名(file)」を必ず持つこと。
 *   配列インデックスからファイル名を決める書き方だと、フレーズの追加・削除で
 *   後続の番号がズレて既存MP3が別テキストとして再利用される事故が起きる
 *   (DESIGN.md 6.7 の教訓)。フレーズを足すときは他の file はそのままに、
 *   未使用の番号だけを新規に割り当てること。key も同様に永続IDとして扱う。
 *
 * APIキーとモデルUUIDは awslot/.env に置く(.env は .gitignore 対象)。
 * 手順は assets/voices/README.md と .env.example を参照。
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const ENV_PATH = join(ROOT, '.env');
const VOICE_DIR = join(ROOT, 'assets', 'voices');
const MANIFEST_PATH = join(VOICE_DIR, 'manifest.json');

const API_URL = 'https://api.aivis-project.com/v1/tts/synthesize';

/** レートリミット対策の実績値(既存スクリプト由来。変更しないこと) */
const THROTTLE_MS = 3000;   // 1本ごとの間引き
const MAX_ATTEMPTS = 3;     // リトライ回数
const BACKOFF_MS = 15000;   // 失敗時の待ち(attempt 倍で伸ばす)

/** キャラ定義。model_uuid は .env の該当キーから読む */
const CHARS = {
  kiro: {
    label: '幽霊Kiro',
    uuidEnv: 'KIRO_MODEL_UUID',
    speakingRate: 1.05,   // ふわふわ喋るのでやや遅め
  },
  george: {
    label: 'サメ ジョージ',
    uuidEnv: 'GEORGE_MODEL_UUID',
    speakingRate: 1.15,   // 荒っぽく畳みかける
  },
  /*
   * 2026-08-15 U68: 主役交代でルナが常駐キャラになった。
   * セリフではなく **短いリアクション**(1〜3秒)だけを持たせるのが方針:
   *   一緒に打っている相棒の相槌なので、長い説明を喋らせると
   *   台のテンポを殺すし、同じ文が繰り返されると一気に飽きる。
   * speakingRate はテンション高めの子なので少し速め。
   */
  luna: {
    label: 'ルナ',
    uuidEnv: 'LUNA_MODEL_UUID',
    speakingRate: 1.12,
  },
};

/**
 * セリフ定義。原案は docs/IDEAS.md「6. キャラのセリフネタ」。
 *
 * - key   : ブラウザ側が参照する永続ID(src/data/scenarios/*.js の voice.play で使う)
 * - file  : 固定ファイル名。一度決めたら変えない
 * - modes : このセリフを使うモードID。manifest の groups になり、
 *           モード突入時の遅延プリロード(voice.preloadMode)に使われる。
 *           突入シナリオのセリフは「突入前のモード」にも入れておくこと
 *           (CZ突入ボイスは FREE_TIER 滞在中に鳴るため)
 * - text  : 合成するテキスト。英字・数字はTTSの読み間違いを避けてカタカナ表記にしてある
 */
const PHRASES = [
  // ── 幽霊Kiro ──────────────────────────────
  // 当選
  { char: 'kiro', key: 'kiro_win_01', file: 'kiro_01.mp3',
    modes: ['FREE_TIER', 'AS_RUSH'],
    text: 'ふわ〜っ、デプロイ成功だよ〜!' },
  { char: 'kiro', key: 'kiro_bonus_01', file: 'kiro_02.mp3',
    modes: ['FREE_TIER', 'CZ', 'BONUS'],
    text: '見て見て、インスタンスがどんどん増えてるよ!' },
  // ハズレ
  { char: 'kiro', key: 'kiro_lose_01', file: 'kiro_03.mp3',
    modes: ['FREE_TIER'],
    text: 'あれ、よんまるよん…見つからなかったみたい…' },
  { char: 'kiro', key: 'kiro_lose_02', file: 'kiro_04.mp3',
    modes: ['FREE_TIER'],
    text: 'ごめんね、リトライしてみる…' },
  // 激アツ
  { char: 'kiro', key: 'kiro_alarm_01', file: 'kiro_05.mp3',
    modes: ['FREE_TIER', 'CZ'],
    text: 'わわわっ、シーピーユー使用率が振り切れてる〜!' },
  { char: 'kiro', key: 'kiro_hot_01', file: 'kiro_06.mp3',
    modes: ['FREE_TIER', 'AS_RUSH'],
    text: 'うん、ふわぁぁっと行こう!' },
  // CZ
  { char: 'kiro', key: 'kiro_cz_start_01', file: 'kiro_07.mp3',
    modes: ['FREE_TIER', 'CZ'],
    text: 'カナリアリリース、始まっちゃった…!' },
  { char: 'kiro', key: 'kiro_cz_win', file: 'kiro_08.mp3',
    modes: ['CZ'],
    text: 'やった…!メトリクス、ぜんぶグリーンだよ!' },
  { char: 'kiro', key: 'kiro_cz_lose', file: 'kiro_09.mp3',
    modes: ['CZ'],
    text: '…オッケーに戻っちゃいました' },
  // RUSH
  { char: 'kiro', key: 'kiro_scaleout_01', file: 'kiro_10.mp3',
    modes: ['AS_RUSH'],
    text: 'インスタンス、まだまだ増やせるよ〜!' },
  // Spot中断
  { char: 'kiro', key: 'kiro_spot_end_01', file: 'kiro_11.mp3',
    modes: ['AS_RUSH'],
    text: 'あぁ…二分前の中断通知、来ちゃった…' },
  // 復活(ホットスタンバイ)
  { char: 'kiro', key: 'kiro_standby_01', file: 'kiro_12.mp3',
    modes: ['AS_RUSH', 'HOT_STANDBY'],
    text: 'エーゼットが落ちちゃった…フェイルオーバー、間に合って…!' },
  // プレミア
  { char: 'kiro', key: 'kiro_premium_01', file: 'kiro_13.mp3',
    modes: ['FREE_TIER', 'BONUS', 'AS_RUSH'],
    text: '請求書が…ゼロ円になってる…!?' },
  // 掛け合い
  { char: 'kiro', key: 'kiro_talk_01', file: 'kiro_14.mp3',
    modes: ['FREE_TIER', 'AS_RUSH'],
    text: 'サメくん、そのエーゼット落ちてない?' },
  { char: 'kiro', key: 'kiro_talk_02', file: 'kiro_15.mp3',
    modes: ['FREE_TIER', 'AS_RUSH'],
    text: 'ぎゃー!今すぐ閉めるー!' },

  // Phase 5 で増えた派生ゾーン / 上位AT / 積み残しの突入ボイス。
  // modes には「そのモード」だけでなく「突入元のモード」も入れておく
  // (突入ボイスは遷移した瞬間に鳴るので、親モードの滞在中にロードを終わらせたい)
  { char: 'kiro', key: 'kiro_burst_01', file: 'kiro_16.mp3',
    modes: ['AS_RUSH', 'EC2_BURST'],
    text: 'クレジットが一気に増えてる〜!バーストだよ〜!' },
  { char: 'kiro', key: 'kiro_graviton_01', file: 'kiro_17.mp3',
    modes: ['AS_RUSH', 'GRAVITON'],
    text: 'グラビトン、静かだけど…すっごく速いんだよ!' },
  { char: 'kiro', key: 'kiro_reserved_01', file: 'kiro_18.mp3',
    modes: ['AS_RUSH', 'RESERVED'],
    text: 'リザーブド契約、結んじゃう?' },
  { char: 'kiro', key: 'kiro_cloudfront_01', file: 'kiro_19.mp3',
    modes: ['AS_RUSH', 'CLOUDFRONT'],
    text: 'エッジロケーションから、なにか届いたよ〜!' },
  { char: 'kiro', key: 'kiro_kinesis_01', file: 'kiro_20.mp3',
    modes: ['AS_RUSH', 'KINESIS'],
    text: 'ストリームにレコードが流れてきた〜!' },
  { char: 'kiro', key: 'kiro_sfn_01', file: 'kiro_21.mp3',
    modes: ['AS_RUSH', 'STEP_FUNCTIONS'],
    text: 'ステートマシン…どっちに進む?' },
  { char: 'kiro', key: 'kiro_serverless_01', file: 'kiro_22.mp3',
    modes: ['AS_RUSH', 'SERVERLESS_RUSH'],
    text: 'サーバーのお世話、もういらないんだって!' },
  { char: 'kiro', key: 'kiro_route53_01', file: 'kiro_23.mp3',
    modes: ['HOT_STANDBY', 'ROUTE53_FAILOVER'],
    text: 'ルートごーさん、お願い…切り替えて…!' },
  { char: 'kiro', key: 'kiro_ceiling_01', file: 'kiro_24.mp3',
    modes: ['FREE_TIER'],
    text: 'エスエルエー きゅーきゅーきゅーパーセント、ちゃんと保証するよ!' },
  { char: 'kiro', key: 'kiro_ending_01', file: 'kiro_25.mp3',
    modes: ['AS_RUSH', 'SERVERLESS_RUSH', 'MULTI_REGION', 'REINVENT_ED'],
    text: 'キーノート、はじまっちゃう…!' },
  { char: 'kiro', key: 'kiro_cz_ta_01', file: 'kiro_26.mp3',
    modes: ['FREE_TIER', 'CZ'],
    text: 'トラステッドアドバイザーが、ちゃんと見てくれてるよ!' },

  // ── サメ ジョージ ─────────────────────────
  // 当選
  { char: 'george', key: 'george_win_01', file: 'george_01.mp3',
    modes: ['FREE_TIER', 'AS_RUSH'],
    text: 'ジョーズもガブッと大当たりだ!' },
  { char: 'george', key: 'george_bonus_01', file: 'george_02.mp3',
    modes: ['FREE_TIER', 'CZ', 'BONUS'],
    text: 'そりゃ大漁ってやつだな!' },
  // ハズレ
  { char: 'george', key: 'george_lose_01', file: 'george_03.mp3',
    modes: ['FREE_TIER'],
    text: '今のはタイムアウトだ、しゃあねえ' },
  // 激アツ
  { char: 'george', key: 'george_alarm_01', file: 'george_04.mp3',
    modes: ['FREE_TIER', 'CZ'],
    text: 'これは…アラームが鳴ってるぞ、絶対来る!' },
  { char: 'george', key: 'george_scaleout_01', file: 'george_05.mp3',
    modes: ['FREE_TIER', 'AS_RUSH'],
    text: 'オートスケーリング全開だ、行くぞ!' },
  // CZ突入
  { char: 'george', key: 'george_cz_start_01', file: 'george_06.mp3',
    modes: ['FREE_TIER', 'CZ'],
    text: '逃げんじゃねえぞ、スポットインスタンス!' },
  // RUSH
  { char: 'george', key: 'george_rush_01', file: 'george_07.mp3',
    modes: ['BONUS', 'AS_RUSH'],
    text: 'スケールアウトだァ!ここからが本番だぜ!' },
  { char: 'george', key: 'george_rush_end_01', file: 'george_08.mp3',
    modes: ['AS_RUSH'],
    text: 'ヘルスチェックが落ちたか…また増やしゃあいい' },
  // Spot中断
  { char: 'george', key: 'george_spot_end_01', file: 'george_09.mp3',
    modes: ['AS_RUSH'],
    text: '中断通知だ。悪く思うな' },
  // 復活(ホットスタンバイ)
  { char: 'george', key: 'george_standby_01', file: 'george_10.mp3',
    modes: ['AS_RUSH', 'HOT_STANDBY'],
    text: '大丈夫だ、フェイルオーバーは俺に任せろ!' },
  // プレミア
  { char: 'george', key: 'george_premium_01', file: 'george_11.mp3',
    modes: ['FREE_TIER', 'BONUS', 'AS_RUSH'],
    text: 'オレのお祝いに、全リージョン同時点灯だ!' },
  // 掛け合い
  { char: 'george', key: 'george_talk_01', file: 'george_12.mp3',
    modes: ['FREE_TIER', 'AS_RUSH'],
    text: '幽霊、お前バケットポリシー閉め忘れてんぞ' },

  // Phase 5 追加分
  { char: 'george', key: 'george_spot_start_01', file: 'george_13.mp3',
    modes: ['AS_RUSH', 'SPOT_ZONE'],
    text: 'スポットだ!安いが…長くはもたねえぞ!' },
  { char: 'george', key: 'george_reserved_3y_01', file: 'george_14.mp3',
    modes: ['AS_RUSH', 'RESERVED'],
    text: 'さんねん契約だァ!もう逃がさねえ!' },
  { char: 'george', key: 'george_sfn_clear_01', file: 'george_15.mp3',
    modes: ['STEP_FUNCTIONS'],
    text: '全ステート、コンプリートだ!' },
  { char: 'george', key: 'george_multiregion_01', file: 'george_16.mp3',
    modes: ['SERVERLESS_RUSH', 'STEP_FUNCTIONS', 'MULTI_REGION'],
    text: '全リージョン、同時展開だァ!' },
  { char: 'george', key: 'george_route53_win_01', file: 'george_17.mp3',
    modes: ['ROUTE53_FAILOVER'],
    text: 'フェイルオーバー成功だ!まだ終わっちゃいねえ!' },
  { char: 'george', key: 'george_cz_wa_01', file: 'george_18.mp3',
    modes: ['FREE_TIER', 'CZ'],
    text: 'ウェルアーキテクテッド、ろっぽんの柱で来い!' },
  { char: 'george', key: 'george_bonus_dynamo_01', file: 'george_19.mp3',
    modes: ['CZ', 'BONUS'],
    text: 'ダイナモディービー、無限にスケールだ!' },

  /* ── ルナ(2026-08-15 U68 / 主役)───────────────────────────────
   *
   * ■ セリフではなく「リアクション」
   *   台の説明はテロップ(lcd.text)の仕事なので、ここは相槌だけにする。
   *   1本1〜3秒。同じ場面で何度も聞くものほど短くしてある。
   *
   * ■ 嘘をつかせない
   *   予兆・煽りの声は **全部が疑問形**(「これは…」「もしかして?」「激アツ?」)。
   *   断定するのは、当落が確定した瞬間に鳴らすもの
   *   (ボーナス確定っ! / ラッシュだ〜! / おかえり!)だけ。
   *   ガセ演出にも同じ疑問形を貼るので、声で信頼度が漏れることはない。
   *
   * ■ 読み(TTSはテキストをそのまま読む)
   *   英字は README のとおりカタカナへ。'invent' は「インベント」。
   *   伸ばしと「っ」で勢いを作る(「ボーナス確定っ!」)。
   */
  // 予兆の入り(小さいリアクション)
  { char: 'luna', key: 'luna_react_oh_01', file: 'luna_01.mp3',
    modes: ['FREE_TIER', 'CZ'],
    text: 'おっ?' },
  { char: 'luna', key: 'luna_react_nani_01', file: 'luna_02.mp3',
    modes: ['FREE_TIER'],
    text: 'なになに?' },
  // 煽り(疑問形のまま引っぱる)
  { char: 'luna', key: 'luna_tease_kore_01', file: 'luna_03.mp3',
    modes: ['FREE_TIER', 'CZ'],
    text: 'これは…' },
  { char: 'luna', key: 'luna_tease_moshika_01', file: 'luna_04.mp3',
    modes: ['FREE_TIER', 'CZ'],
    text: 'もしかして?' },
  { char: 'luna', key: 'luna_hot_01', file: 'luna_05.mp3',
    modes: ['FREE_TIER', 'CZ'],
    text: '激アツ?' },
  { char: 'luna', key: 'luna_cz_chance_01', file: 'luna_06.mp3',
    modes: ['FREE_TIER', 'CZ'],
    text: 'チャンスかも?' },
  // ステージ昇格への期待(到着の告知ではなく「行きたいな〜」の願望)
  { char: 'luna', key: 'luna_stage_summit_01', file: 'luna_07.mp3',
    modes: ['FREE_TIER'],
    text: 'サミット行きたいな〜' },
  { char: 'luna', key: 'luna_stage_invent_01', file: 'luna_08.mp3',
    modes: ['FREE_TIER'],
    text: 'インベント行きたいな〜' },
  // 確定告知(ここだけ断定する)
  { char: 'luna', key: 'luna_bonus_kakutei_01', file: 'luna_09.mp3',
    modes: ['FREE_TIER', 'CZ', 'BONUS_READY', 'BONUS'],
    text: 'ボーナス確定っ!' },
  { char: 'luna', key: 'luna_rush_01', file: 'luna_12.mp3',
    modes: ['BONUS', 'AS_RUSH', 'CF_RUSH', 'AURORA_RUSH', 'HERO_RUSH', 'HOT_STANDBY'],
    text: 'ラッシュだ〜!' },
  { char: 'luna', key: 'luna_comeback_01', file: 'luna_19.mp3',
    modes: ['AS_RUSH', 'HOT_STANDBY', 'ROUTE53_FAILOVER'],
    text: 'おかえり!' },
  { char: 'luna', key: 'luna_result_01', file: 'luna_20.mp3',
    modes: ['FREE_TIER', 'RESULT'],
    text: 'おつかれさま!' },
  // 喜び / 驚き
  { char: 'luna', key: 'luna_kita_01', file: 'luna_10.mp3',
    modes: ['FREE_TIER', 'CZ', 'SPOT_ZONE'],
    text: 'きたきたっ!' },
  { char: 'luna', key: 'luna_win_01', file: 'luna_11.mp3',
    modes: ['FREE_TIER', 'CZ'],
    text: 'やったー!' },
  { char: 'luna', key: 'luna_sugoi_01', file: 'luna_17.mp3',
    modes: ['FREE_TIER', 'BONUS', 'AS_RUSH'],
    text: 'すごいすごい!' },
  { char: 'luna', key: 'luna_freeze_01', file: 'luna_16.mp3',
    modes: ['FREE_TIER'],
    text: 'フリーズ!?' },
  // 落胆 / 間
  { char: 'luna', key: 'luna_hmm_01', file: 'luna_13.mp3',
    modes: ['FREE_TIER'],
    text: 'んー…' },
  { char: 'luna', key: 'luna_lose_01', file: 'luna_14.mp3',
    modes: ['FREE_TIER', 'CZ', 'HOT_STANDBY'],
    text: 'ざんねん…' },
  { char: 'luna', key: 'luna_miss_01', file: 'luna_15.mp3',
    modes: ['SPOT_ZONE', 'AS_RUSH'],
    text: 'あちゃー' },
  // 継続の後押し
  { char: 'luna', key: 'luna_madamada_01', file: 'luna_18.mp3',
    modes: ['AS_RUSH', 'CF_RUSH', 'AURORA_RUSH', 'SPOT_ZONE'],
    text: 'まだまだ〜' },
];

// ─────────────────────────────────────────────
// ここから下は仕組み。セリフを足すときは触らなくてよい。
// ─────────────────────────────────────────────

/** 引数パース */
function parseArgs(argv) {
  const opts = { dryRun: false, force: false, char: null, only: null };
  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '-n') opts.dryRun = true;
    else if (arg === '--force' || arg === '-f') opts.force = true;
    else if (arg.startsWith('--char=')) opts.char = arg.slice(7).trim();
    else if (arg.startsWith('--only=')) {
      opts.only = new Set(arg.slice(7).split(',').map((s) => s.trim()).filter(Boolean));
    } else if (arg === '--help' || arg === '-h') opts.help = true;
    else console.warn(`[generate-voices] 不明な引数を無視します: ${arg}`);
  }
  return opts;
}

function printHelp() {
  console.log([
    'AWSLOT キャラ音声生成',
    '',
    '  node scripts/generate-voices.mjs [options]',
    '',
    '  --dry-run, -n     APIを叩かず、定義の検証と対象一覧の表示だけ行う',
    '  --force,   -f     既存MP3も作り直す(デフォルトはスキップ)',
    `  --char=<id>       ${Object.keys(CHARS).join(' / ')} のいずれかに絞る`,
    '  --only=<keys>     カンマ区切りの key だけ生成する',
    '  --help,    -h     このヘルプ',
  ].join('\n'));
}

/**
 * PHRASES の自己チェック。
 * key/file の重複はMP3の取り違えに直結するので、API を叩く前に必ず落とす。
 */
function validatePhrases(phrases) {
  const errors = [];
  const seenKey = new Map();
  const seenFile = new Map();
  for (const p of phrases) {
    const where = p.key ?? p.file ?? '(名前なし)';
    if (!p.char || !CHARS[p.char]) errors.push(`${where}: char が未定義または未知(${p.char})`);
    if (!p.key) errors.push(`${where}: key がありません`);
    if (!p.file) errors.push(`${where}: file がありません`);
    if (!p.text) errors.push(`${where}: text がありません`);
    if (p.file && !p.file.endsWith('.mp3')) errors.push(`${where}: file は .mp3 で終わらせること`);
    if (p.modes && !Array.isArray(p.modes)) errors.push(`${where}: modes は配列にすること`);

    if (p.key) {
      if (seenKey.has(p.key)) errors.push(`key が重複しています: ${p.key}`);
      seenKey.set(p.key, true);
    }
    if (p.file && p.char) {
      const id = `${p.char}/${p.file}`;
      if (seenFile.has(id)) errors.push(`file が重複しています: ${id}(別テキストで上書きされます)`);
      seenFile.set(id, true);
    }
  }
  return errors;
}

/** .env を読んで key=value のオブジェクトにする(ファイルが無くても落ちない) */
function loadEnvFile(envPath) {
  const env = {};
  if (!existsSync(envPath)) return env;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // KEY="value" / KEY='value' の引用符は剥がす
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/**
 * 設定の解決。.env を基本とし、シェルの環境変数があればそちらを優先する。
 * uuids は **CHARS から自動で組み立てる**(キャラを足したときの追記漏れを防ぐ)。
 */
function resolveConfig() {
  const fileEnv = loadEnvFile(ENV_PATH);
  const pick = (name) => (process.env[name] ?? fileEnv[name] ?? '').trim();
  const uuids = {};
  for (const [id, spec] of Object.entries(CHARS)) uuids[id] = pick(spec.uuidEnv);
  return {
    envFileFound: existsSync(ENV_PATH),
    apiKey: pick('AIVIS_CLOUD_API_KEY'),
    uuids,
  };
}

/** キー未設定時の案内。ここで丁寧に落とすのが本スクリプトの親切ポイント */
function reportMissingConfig(config, neededChars) {
  const missing = [];
  if (!config.apiKey) missing.push('AIVIS_CLOUD_API_KEY');
  for (const char of neededChars) {
    if (!config.uuids[char]) missing.push(CHARS[char].uuidEnv);
  }
  if (missing.length === 0) return false;

  console.error('');
  console.error('[generate-voices] 音声を生成できません。設定が足りていません。');
  console.error(`  未設定: ${missing.join(', ')}`);
  console.error(`  .env の場所: ${ENV_PATH}${config.envFileFound ? '' : ' (見つかりませんでした)'}`);
  console.error('');
  console.error('  セットアップ手順:');
  console.error('    1) cp awslot/.env.example awslot/.env');
  console.error('    2) https://hub.aivis-project.com/ でAPIキーを発行して AIVIS_CLOUD_API_KEY に貼る');
  console.error('    3) 使いたい音声モデルのページURL末尾のUUIDを');
  console.error('       LUNA_MODEL_UUID(ルナ / 現在の主役)/ KIRO_MODEL_UUID / GEORGE_MODEL_UUID に貼る');
  console.error('    4) node scripts/generate-voices.mjs');
  console.error('');
  console.error('  ※ .env はコミット禁止(リポジトリルートの .gitignore で除外済み)');
  console.error('  ※ 設定なしで定義だけ確かめたいときは --dry-run を使ってください');
  console.error('');
  return true;
}

/** Aivis Cloud に1本POSTしてMP3を書き出す */
async function synthesize({ apiKey, modelUuid, text, speakingRate, outFile }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_uuid: modelUuid,
      text,
      speaking_rate: speakingRate,
      output_format: 'mp3',
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error('empty response body');
  writeFileSync(outFile, buf);
  return buf.length;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * manifest.json を書き出す。
 * 実際にMP3が存在するフレーズだけを載せるので、
 * 途中で失敗しても「マニフェストにあるのに鳴らない」状態にはならない。
 */
function writeManifest(phrases) {
  const voices = {};
  const groups = {};
  let count = 0;

  for (const p of phrases) {
    const outFile = join(VOICE_DIR, p.char, p.file);
    if (!existsSync(outFile) || statSync(outFile).size === 0) continue;
    voices[p.key] = { file: p.file, char: p.char, text: p.text };
    count++;
    for (const mode of p.modes ?? []) {
      (groups[mode] ??= []).push(p.key);
    }
  }

  const manifest = {
    note: 'scripts/generate-voices.mjs が自動生成します。手で編集しないこと。',
    generatedAt: new Date().toISOString(),
    basePath: 'assets/voices/',
    pathRule: '{basePath}{char}/{file}',
    groups,
    voices,
  };
  mkdirSync(VOICE_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return count;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { printHelp(); return 0; }

  // 1. 定義の検証(APIを叩く前に必ず)
  const errors = validatePhrases(PHRASES);
  if (errors.length > 0) {
    console.error('[generate-voices] PHRASES の定義に問題があります:');
    for (const e of errors) console.error(`  - ${e}`);
    return 1;
  }

  // 2. 対象の絞り込み
  let targets = PHRASES;
  if (opts.char) {
    if (!CHARS[opts.char]) {
      console.error(`[generate-voices] 未知のキャラです: ${opts.char}(${Object.keys(CHARS).join(' / ')})`);
      return 1;
    }
    targets = targets.filter((p) => p.char === opts.char);
  }
  if (opts.only) {
    targets = targets.filter((p) => opts.only.has(p.key));
    const unknown = [...opts.only].filter((k) => !PHRASES.some((p) => p.key === k));
    if (unknown.length > 0) console.warn(`[generate-voices] 存在しない key を無視: ${unknown.join(', ')}`);
  }
  if (targets.length === 0) {
    console.error('[generate-voices] 対象のフレーズがありません');
    return 1;
  }

  const neededChars = [...new Set(targets.map((p) => p.char))];

  // 3. dry-run はここで終わり(APIは一切叩かない)
  if (opts.dryRun) {
    console.log(`[generate-voices] dry-run: ${targets.length}本(定義チェックOK)`);
    for (const p of targets) {
      const outFile = join(VOICE_DIR, p.char, p.file);
      const state = existsSync(outFile) ? '既存' : '未生成';
      console.log(`  [${state}] ${p.key.padEnd(22)} ${p.char}/${p.file}  「${p.text}」`);
    }
    console.log('APIは呼び出していません。実際に生成するには --dry-run を外してください。');
    return 0;
  }

  // 4. 設定の確認
  const config = resolveConfig();
  if (reportMissingConfig(config, neededChars)) return 1;

  // 5. 生成
  for (const char of neededChars) mkdirSync(join(VOICE_DIR, char), { recursive: true });

  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    const spec = CHARS[p.char];
    const outFile = join(VOICE_DIR, p.char, p.file);
    process.stdout.write(`[${i + 1}/${targets.length}] ${p.key} 「${p.text}」 → ${p.char}/${p.file} ... `);

    if (!opts.force && existsSync(outFile) && statSync(outFile).size > 0) {
      console.log(`SKIP (exists, ${statSync(outFile).size} bytes)`);
      results.push({ key: p.key, ok: true, skipped: true });
      continue;
    }

    let done = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !done; attempt++) {
      try {
        const size = await synthesize({
          apiKey: config.apiKey,
          modelUuid: config.uuids[p.char],
          text: p.text,
          speakingRate: p.speakingRate ?? spec.speakingRate,
          outFile,
        });
        console.log(`OK (${size} bytes)`);
        results.push({ key: p.key, ok: true });
        done = true;
      } catch (err) {
        if (attempt < MAX_ATTEMPTS) {
          process.stdout.write(`retry(${err.message}) ... `);
          await sleep(BACKOFF_MS * attempt);
        } else {
          console.log(`FAILED (${err.message})`);
          results.push({ key: p.key, ok: false, error: err.message });
        }
      }
    }
    // 連続リクエストの間引き(レートリミット対策)
    if (i < targets.length - 1) await sleep(THROTTLE_MS);
  }

  // 6. マニフェスト(絞り込み実行でも全フレーズを走査して整合させる)
  const listed = writeManifest(PHRASES);

  const failed = results.filter((r) => !r.ok);
  const generated = results.filter((r) => r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  console.log('');
  console.log(`done: 生成 ${generated} / スキップ ${skipped} / 失敗 ${failed.length}`);
  console.log(`manifest: ${MANIFEST_PATH}(${listed}件)`);
  if (failed.length > 0) {
    console.log(`失敗した key: ${failed.map((r) => r.key).join(', ')}`);
    console.log('もう一度同じコマンドを実行すれば、成功済みはスキップされて失敗分だけ再試行されます。');
    return 1;
  }
  return 0;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((err) => {
    console.error('[generate-voices] 予期しないエラー:', err);
    process.exitCode = 1;
  });
