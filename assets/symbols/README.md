# 絵柄PNGの置き場

ここに以下のファイル名でPNGを置くと、起動時に自動で読み込まれてリールに反映されます。
未配置の絵柄は `src/render/symbols-draw.js` のプロシージャル描画で代替されます。

| ファイル名 | 絵柄 | AWSモチーフ |
|---|---|---|
| `GHOST7.png` | 幽霊Kiro + 紫の7 | Kiro |
| `SHARKBAR.png` | サメ + BARプレート | ジョージ |
| `BELL.png` | ベル | Amazon EC2 |
| `CHERRY.png` | チェリー | AWS IAM |
| `MELON.png` | スイカ | Amazon S3 |
| `LAMBDA.png` | 金のλ | AWS Lambda |
| `REPLAY.png` | リプレイ | Amazon DynamoDB |
| `BLANK.png` | ブランク | Amazon SQS |

生成プロンプトは `docs/IMAGE_PROMPTS.md` を参照してください。
1024×1024 で生成して構いません(起動時に 120×60 のタイルへリサイズしてキャッシュします)。
