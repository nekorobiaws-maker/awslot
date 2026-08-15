# キャラ音声(事前生成MP3)の置き場

DESIGN.md 6.7 の音声パイプラインの出力先です。ここに入るファイルは
`scripts/generate-voices.mjs` が Aivis Cloud API で **一括生成**します。手で置く必要はありません。

```
assets/voices/
├── README.md          このファイル(手書き)
├── manifest.json      ★生成スクリプトが自動出力。手で編集しない
│                        (未生成時は voices が空のプレースホルダが置いてある)
├── luna/              ルナ(現在の主役)luna_01.mp3 … luna_20.mp3
├── kiro/              旧・相棒枠(未生成。定義だけ保全)
└── george/            旧・サメ ジョージ(同上)
```

## いま鳴っているのはルナだけ(2026-08-15 U68)

主役交代でキャラがルナ1人になったため、**生成してあるのは `luna/` の20本だけ**です。
`kiro_*` / `george_*` の定義は歴史として `scripts/generate-voices.mjs` に残していますが、
シナリオ側の参照は全部ルナのキーへ張り替え済みなので、鳴ることはありません。

ルナのセリフは **セリフではなく短いリアクション**(1〜3秒)で統一してあります。

| 分類 | キー | テキスト |
|---|---|---|
| 予兆の入り | `luna_react_oh_01` / `luna_react_nani_01` | おっ? / なになに? |
| 煽り(疑問形) | `luna_tease_kore_01` / `luna_tease_moshika_01` / `luna_hot_01` | これは… / もしかして? / 激アツ? |
| CZ示唆 | `luna_cz_chance_01` | チャンスかも? |
| ステージへの期待 | `luna_stage_summit_01` / `luna_stage_invent_01` | サミット行きたいな〜 / インベント行きたいな〜 |
| 確定告知 | `luna_bonus_kakutei_01` / `luna_rush_01` / `luna_comeback_01` / `luna_result_01` | ボーナス確定っ! / ラッシュだ〜! / おかえり! / おつかれさま! |
| 喜び・驚き | `luna_kita_01` / `luna_win_01` / `luna_sugoi_01` / `luna_freeze_01` | きたきたっ! / やったー! / すごいすごい! / フリーズ!? |
| 落胆・間 | `luna_hmm_01` / `luna_lose_01` / `luna_miss_01` | んー… / ざんねん… / あちゃー |
| 継続の後押し | `luna_madamada_01` | まだまだ〜 |

**喋りすぎない仕組み**は `src/engine/voice.js` にあります(chance / 1ゲーム1本 / cooldown、
確定告知だけ `force: true` で素通し)。シナリオ側の書き方は下の「ブラウザ側の使い方」を参照。

未生成でもゲームは普通に動きます(`src/engine/voice.js` は manifest に載っていないセリフを
黙って読み飛ばします)。未生成時用に「voices が空の manifest.json」を置いてあるので、
ブラウザのコンソールに 404 エラーは出ません。生成スクリプトを走らせるとこのファイルは
実データで上書きされます。

## 生成手順

```bash
# 1. 設定ファイルを用意(初回のみ)
cp awslot/.env.example awslot/.env

# 2. .env に APIキーとモデルUUIDを書く
#    AIVIS_CLOUD_API_KEY / LUNA_MODEL_UUID(主役)/ KIRO_MODEL_UUID / GEORGE_MODEL_UUID

# 3. まず定義だけ確認(APIは呼ばれない)
node scripts/generate-voices.mjs --dry-run --char=luna

# 4. 生成(ルナ20本・3秒間引きなので1分ほどかかります)
node scripts/generate-voices.mjs --char=luna
```

- 生成済みのMP3は**スキップ**されるので、途中で失敗しても同じコマンドを再実行すればOK
- 作り直したいときは `--force`、一部だけなら `--only=kiro_cz_win,george_rush_01`
- キャラを絞るなら `--char=kiro`
- APIキーが無い状態で実行すると、何が足りないかを表示して終了します

## セキュリティ

| 項目 | 決まり |
|---|---|
| APIキーの置き場 | `awslot/.env` のみ。スクリプトにベタ書きしない |
| `.env` のコミット | **禁止**。リポジトリルートの `.gitignore` の `.env` で除外済み |
| コミットする物 | 生成済みMP3 と `manifest.json` |
| ブラウザからのAPI利用 | **しない**(キーが露出するため。DESIGN.md 6.7 で却下済み) |

## ファイル命名規約

**フレーズごとにファイル名は固定**です。`scripts/generate-voices.mjs` の `PHRASES` は
必ず `file` を持ち、配列の順番からファイル名を決めません。
順番から決めると、セリフを1本足しただけで後続の番号がズレ、
**既存MP3が別テキストとして再利用される事故**が起きるためです(DESIGN.md 6.7 の教訓)。

| 項目 | 規約 | 例 |
|---|---|---|
| `key` | ブラウザから参照する永続ID。`{char}_{用途}_{連番}` | `kiro_cz_start_01` |
| `file` | `{char}_{2桁連番}.mp3`。一度決めたら**絶対に変えない** | `kiro_07.mp3` |
| 保存先 | `assets/voices/{char}/{file}` | `assets/voices/kiro/kiro_07.mp3` |
| `modes` | プリロード用のモードID配列 | `['FREE_TIER', 'CZ']` |

セリフを追加するときは、既存の `file` はそのままに、**未使用の番号だけ**を新しく割り当てます。
セリフを消すときは、その番号を欠番のままにしておく(詰め直さない)のが安全です。

TTS の読み間違いを避けるため、`text` の英字・数字はカタカナで書きます
(`404` → `よんまるよん`、`CPU` → `シーピーユー`、`AZ` → `エーゼット`)。

## manifest.json の形

生成スクリプトが出力するので**手書き不要**ですが、中身の形はこうなります。

```json
{
  "note": "scripts/generate-voices.mjs が自動生成します。手で編集しないこと。",
  "generatedAt": "2026-08-13T00:00:00.000Z",
  "basePath": "assets/voices/",
  "pathRule": "{basePath}{char}/{file}",
  "groups": {
    "FREE_TIER": ["kiro_win_01", "george_alarm_01"],
    "CZ": ["kiro_cz_start_01", "kiro_cz_win", "kiro_cz_lose"]
  },
  "voices": {
    "kiro_cz_start_01": { "file": "kiro_07.mp3", "char": "kiro", "text": "カナリアリリース、始まっちゃった…!" },
    "kiro_cz_win":      { "file": "kiro_08.mp3", "char": "kiro", "text": "やった…!メトリクス、ぜんぶグリーンだよ!" }
  }
}
```

- `voices` … `key → { file, char, text }`。**実際にMP3が存在するぶんだけ**載ります
- `groups` … モードID → key配列。`voice.preloadMode('CZ')` の遅延プリロードに使われます

## ブラウザ側の使い方

```js
import { initVoice } from './engine/voice.js';

// AudioContext と masterGain は効果音エンジンと共有する(音量の一元管理)
const voice = initVoice({ audioContext: audio.ctx, masterGain: audio.master });

voice.attachBus(bus);           // modeEnter でプリロード / leverOn で1ゲーム1本を解禁
voice.play('luna_kita_01');     // 同時発話は1つ。新しい台詞が来たら差し替え

// 間引きの指定(シナリオの voice.play キューの params がそのまま届く)
voice.play('luna_hot_01', { chance: 0.3 });          // 予兆・煽り: 3割だけ喋る
voice.play('luna_rush_01', { force: true });         // 確定告知: 必ず喋る
```

シナリオ(`src/data/scenarios/**`)からはこう書きます。

```js
{ at: 620, layer: 'voice', action: 'play', params: { key: 'luna_hot_01', chance: 0.5 } },
{ at: 900, layer: 'voice', action: 'play', params: { key: 'luna_bonus_kakutei_01', force: true } },
```

- `chance` を省くと「1ゲーム1本 + cooldown」の枠が空いていれば必ず喋る
- `force: true` は**確定告知だけ**に付ける(情報なので間引いてはいけない)
- ガセ演出に声を貼るときは、**本物版と同じキー・同じ chance** にすること
  (声の有無で当たりが読めてしまうと、演出の信頼度設計が壊れる)

`voice.play()` は音声が無くても例外を投げず、静かに `false` を返します。
開発中にセリフ内容だけ確認したい場合は `initVoice({ useSpeechFallback: true })` で
ブラウザ標準TTS(Web Speech API)の代読が有効になります(キャラ声にはなりません)。
