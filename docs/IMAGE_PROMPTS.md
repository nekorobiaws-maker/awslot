# AWSLOT 画像生成プロンプト集

AWS題材パチスロ「AWSLOT」の絵柄・演出画像を **GPT Image 2** で生成するためのプロンプト集。
参考: `docs/sample.png`(紫ベースの筐体、光沢のあるスロット絵柄タッチ、白い幽霊=丸いフォルム+黒い楕円の目2つ)
図柄と格の対応は `docs/IDEAS.md` の「1. リール絵柄案」に準拠。

**方針**: 複数の絵柄・キャラを**1枚のグリッド画像に一括生成**してからトリミングして切り出す。1個ずつバラで生成するとテイスト(色味・線の太さ・塗り方)がブレるため。
**テイスト**: ラスベガス風の写実的・光沢メタリックな見た目ではなく、**日本のパチスロ実機のリール絵柄風**(アニメ・マンガ調のセル塗り、太くはっきりした輪郭線、フラットで彩度の高い原色、判子絵のようにパキッと読めるデザイン)を狙う。

- **A. リール絵柄グリッド**: 図柄10種を1枚のグリッドで生成
- **B. 演出用画像**: リールとは別プロンプト。B-1(キャラ立ち絵グリッド)、B-2(下パネルロゴ、単独1枚)

---

## 0. 使い方(グリッド生成→切り出し)

1. 下記のグリッドプロンプトをコピペしてGPT Image 2に投げる(各グリッドは1回の生成で1枚の画像になる)
2. サイズはプロンプトごとに指定の推奨サイズを選ぶ(A・B-1・B-2でサイズが異なるので注意)
3. 背景は「透過」オプションを選ぶ(プロンプト内にも `transparent background` を明記済み)
4. 生成された1枚のグリッド画像を、下記の対応表どおりに**等分割でトリミング**して個別ファイルに切り出す
   - 手動でも良いし、実装フェーズで等分割スライス用のスクリプト(例: Pillowで `crop()` を列数×行数で機械的に分割)を用意することも可能
   - 等間隔グリッドで生成するようプロンプト側で指示しているので、単純な等分割トリミングで境界がズレない想定
5. 気に入らない絵柄が一部だけある場合は、グリッド全体を再生成するか、該当セルだけ従来どおり単独プロンプトで作り直して差し替える

---

## 1. 共通スタイルガイド

全プロンプトの先頭にこのブロックを含めてある(コピペ1回で完成形になるようにしているので、この章の文章自体をコピペする必要はなし)。

```
Japanese pachislot (pachinko slot machine) reel symbol icon set, in the authentic style of real Japanese slot machine reel artwork. Bold, clean, thick black outlines like a rubber-stamp graphic, anime/manga cel-shading with flat, vivid, highly saturated colors, no photorealistic gloss, no chrome or metallic shine, no soft airbrushed gradients — flat 2D pop illustration only. Vibrant purple and gold accent color palette, simple flat drop shadow beneath each object, crisp and instantly readable silhouette, playful and comical mood. Transparent background, no watermark, no grid lines, no cell borders, no dividing lines, no extra text or captions beyond what is explicitly specified for each icon below.
```

---

## 2. キャラクター固定文(見た目ブレ防止)

幽霊とサメは複数のプロンプトに登場するため、毎回この文章をそのまま使い回して見た目を統一する。**下記の共通スタイルブロック(セクション1)・幽霊固定文・サメ固定文は、Aセクションの実績版プロンプトで実際に使われ生成成功した文言そのもの**。B-1・B-2でも同じ文言を使い回してテイストを揃えている。

### 幽霊(sample.png準拠)

```
A cute round ghost character in Japanese pachislot mascot style: soft pure-white blob-like body shaped like a rounded teardrop or fluffy cloud, cute chibi-like roundness, no visible mouth, two simple black oval eyes evenly spaced on the upper-front of the face, a gently wavy scalloped bottom edge with three small rounded points, flat light-purple cel-shaded accent on the body surface (no glossy or metallic highlight), bold clean black outline, flat 2D anime/manga mascot illustration matching a Japanese pachislot game ghost character.
```

### サメ(オリジナル設定・うち提案)

> 注: サメはIDEAS.mdに見た目の指定が無いオリジナルキャラなので、下記はうちが提案したラフ設定。**基調カラーはオレンジで確定(ユーザー決定)**。腹側のクリーム色や表情の強さなど細部は生成しながら微調整してOK。

```
A comical mascot shark character in Japanese pachislot mascot style: chibi-like cute proportions close to a two-head-tall body ratio, vivid orange body with a pale cream-colored belly and underside, a big friendly grin showing white triangular teeth, round white eyes with small black pupils, a small triangular dorsal fin on top of the head, short stubby side fins, flat cel-shaded coloring with bold clean black outline (no glossy or metallic shine), flat 2D anime/manga mascot illustration matching a Japanese pachislot game shark character.
```

---

## A. リール絵柄グリッド(1プロンプトで10種を一括生成)

- 推奨サイズ: **1536×1024(横長)**
- レイアウト: **5列×2行**のグリッド、各セル等サイズ・等間隔、罫線なし
- 文字ルール: 図柄を説明するキャプション文字は入れない。実機パチスロの流儀にならい、図柄の意味が伝わる範囲で**機能を示すスロット記号文字("7" "BAR" "REPLAY" "CHANCE")は絵柄の一部として描いてOK**(AWSのサービス名やAWS公式ロゴのグラフィック自体は引き続きNG)。ただし下記の実績版プロンプトでは、EC2・IAM・S3の3枠は**あえて文字を入れず、形状(オレンジキューブ+回路模様/鍵穴つき書類アイコン/スイカ柄バケツ)だけでAWSネタを表現**しており、この仕上がりをユーザーが気に入っているためそのまま採用している
- デザイン方針: 図柄の第一印象は**伝統的なスロット絵柄(チェリー/ベル/スイカ/7/BAR)としてパッと読めること**を優先し、AWS要素は文字や添え意匠として「よく見るとAWSネタが乗っている」程度のバランスにする

> ✅ **実績版プロンプト**: 下記のプロンプト全文は、実際にユーザーがGPT Image 2で生成し「テイストが気に入っている」と確認済みの正典版です。改変せずこのままコピペして使ってください。

### セル位置 → 切り出し後ファイル名 対応表

| 行 | 列1 | 列2 | 列3 | 列4 | 列5 |
|---|---|---|---|---|---|
| Row 1 | 幽霊Kiro<br>`assets/symbols/ghost.png` | サメ<br>`assets/symbols/shark.png` | EC2<br>`assets/symbols/ec2.png` | IAM<br>`assets/symbols/iam.png` | S3バケツ<br>`assets/symbols/s3.png` |
| Row 2 | Lambda<br>`assets/symbols/lambda.png` | DynamoDB<br>`assets/symbols/dynamodb.png` | CloudWatch<br>`assets/symbols/cloudwatch.png` | SQS<br>`assets/symbols/sqs.png` | Route53<br>`assets/symbols/route53.png` |

> 列3(EC2)・列4(IAM)・列5(S3)は実績版では**文字なし**。EC2=金のベルにオレンジキューブ+回路模様、IAM=赤いチェリーに鍵穴+チェックマーク付き書類アイコン、S3=スイカ柄バケツ、という形状表現のみでAWSネタを表現している。

### プロンプト全文(コピペ用・実績版そのまま/改変禁止)

```
Japanese pachislot (pachinko slot machine) reel symbol icon set, in the authentic style of real Japanese slot machine reel artwork. Bold, clean, thick black outlines like a rubber-stamp graphic, anime/manga cel-shading with flat, vivid, highly saturated colors, no photorealistic gloss, no chrome or metallic shine, no soft airbrushed gradients — flat 2D pop illustration only. Vibrant purple and gold accent color palette, simple flat drop shadow beneath each object, crisp and instantly readable silhouette, playful and comical mood. Transparent background, no watermark, no grid lines, no cell borders, no dividing lines, no extra text or captions beyond what is explicitly specified for each icon below.

A cute round ghost character in Japanese pachislot mascot style: soft pure-white blob-like body shaped like a rounded teardrop or fluffy cloud, cute chibi-like roundness, no visible mouth, two simple black oval eyes evenly spaced on the upper-front of the face, a gently wavy scalloped bottom edge with three small rounded points, flat light-purple cel-shaded accent on the body surface (no glossy or metallic highlight), bold clean black outline, flat 2D anime/manga mascot illustration matching a Japanese pachislot game ghost character.

A comical mascot shark character in Japanese pachislot mascot style: chibi-like cute proportions close to a two-head-tall body ratio, vivid orange body with a pale cream-colored belly and underside, a big friendly grin showing white triangular teeth, round white eyes with small black pupils, a small triangular dorsal fin on top of the head, short stubby side fins, flat cel-shaded coloring with bold clean black outline (no glossy or metallic shine), flat 2D anime/manga mascot illustration matching a Japanese pachislot game shark character.

Arrange exactly 10 distinct slot-machine reel symbol icons into an invisible, perfectly even 5-column by 2-row grid layout (5 icons per row, 2 rows total). Each icon is centered within its own equal-sized invisible cell with generous even padding around it, matching visual weight, scale, and flat cel-shading style across all 10 icons so they look like one consistent set. Do not draw any visible grid lines, cell borders, dividing lines, panel frames, or descriptive caption labels anywhere in the image — only the 10 icons themselves (each with its own specified in-icon symbol text, if any) on the transparent background.

Row 1, left to right:
1. The ghost character described above, floating happily beside a large bold flat purple numeral "7" with a clean gold outline (no metallic shine), small flat gold spark/star particles around them.
2. The shark character described above, playfully biting onto a purple rectangular plate painted with the bold flat gold text "BAR", flat cel-shaded coloring with a clean bold outline, the plate slightly bent from the bite.
3. A gold bell-shaped icon (classic slot machine bell silhouette), flat cel-shaded coloring with bold clean outline, a small orange cube painted on its front surface like a flat emblem, thin flat blue circuit-line patterns radiating from the cube, a tiny green blinking status light near the top.
4. Two round flat-colored red cherries joined on a curved green stem, each cherry painted with a small white document icon featuring a tiny keyhole and a checkmark, bold clean black outline.
5. A storage-bucket silhouette (wide pail with a curved handle arched on top) painted like a watermelon: flat green body with dark green stripes, the upper rim showing a flat red-pink cut cross-section with small black seed dots, bold clean black outline.

Row 2, left to right:
6. A bold flat golden Greek letter lambda (λ) symbol with a clean gold outline (no metallic shine), small comic-style electric spark and lightning-bolt shapes surrounding it, a flat glowing purple aura behind it, and directly below the lambda symbol the bold flat text "CHANCE" written on a small purple ribbon/plate in the same reel-symbol style.
7. A pachislot-style replay reel symbol: a rounded rectangular grid icon with flat blue-purple data rows and columns representing a database table, a short stack of flat-colored database disk cylinders peeking out behind the grid, four small outward-pointing gold arrows at the corners, and below the grid a bold flat gold ribbon/plate with the text "REPLAY" in the same reel-symbol style.
8. A flat-colored alarm bell icon with bold clean outline, a bold red pulsing warning ring around it, thin curved comic-style sound-wave lines radiating from the top, a small circular badge with a bold exclamation mark, warm orange-red flat accent color.
9. A row of three stacked rounded rectangular message-envelope icons slightly offset diagonally, connected by a thin dotted line, flat muted low-saturation grayish-purple tones, simple minimal linework, no text, deliberately plain and understated so it visually reads as a low-value blank symbol compared to the other icons.
10. A pachislot-style replay reel symbol, color/design variant of item 7: a flat-colored circular roulette-wheel-and-compass hybrid icon, a round dial divided into alternating purple and gold flat-colored segments, thin radiating route lines like a compass rose, a small gold pointer needle sticking outward from the center, bold clean black outline, and below the dial a bold flat purple ribbon/plate with the text "REPLAY" in the same reel-symbol style.
```

> 余力メモ(バリエーション案、いずれも未使用・現状は実績版のまま推奨):
> - IAMチェリーに「IAM」の文字を入れたい場合、item 4の末尾に `a single green leaf attached at the top of the stem with the bold flat text "IAM" written on the leaf in the same reel-symbol style.` を追記すれば葉にIAM文字を乗せたバリエーションを生成できる(ただし成功済みの現行版を差し替える必要はない)
> - 実機パチスロでは強チェリー(高配当役)を金色チェリーで区別することが多い。必要になったら、item 4の色指定を "flat bright-red" → "flat metallic-look gold (flat cel-shaded, not glossy)" に差し替えるだけで金チェリー版を追加生成できる。現状は弱・強共通で1絵柄のままでよい。

---

## B. 演出用画像

リール絵柄とはプロンプトを分けて生成する。

### B-1. キャラ立ち絵グリッド(演出カットイン用・1プロンプトで6種を一括生成)

- 推奨サイズ: **1024×1536(縦長)**
- レイアウト: **3列×2行**のグリッド。上段=幽霊Kiroの3表情、下段=サメの3表情。フルボディ・全身、カットイン用にポーズは大きめ

### セル位置 → 切り出し後ファイル名 対応表

| 行 | 列1(喜び) | 列2(悔しがり) | 列3(激アツ) |
|---|---|---|---|
| Row 1(幽霊Kiro) | `assets/cutin/ghost_happy.png` | `assets/cutin/ghost_frustrated.png` | `assets/cutin/ghost_excited.png` |
| Row 2(サメ) | `assets/cutin/shark_happy.png` | `assets/cutin/shark_frustrated.png` | `assets/cutin/shark_excited.png` |

### プロンプト全文(コピペ用)

```
Japanese pachislot (pachinko slot machine) character cutin illustration set, in the authentic style of real Japanese slot machine artwork. Bold, clean, thick black outlines, anime/manga cel-shading with flat, vivid, highly saturated colors, no photorealistic gloss, no chrome or metallic shine, no soft airbrushed gradients — flat 2D pop illustration only. Vibrant purple and gold accent glow effects, playful and comical dynamic mood. Transparent background, no watermark, no grid lines, no cell borders, no dividing lines, no text labels or captions anywhere in the image.

A cute round ghost character in Japanese pachislot mascot style: soft pure-white blob-like body shaped like a rounded teardrop or fluffy cloud, cute chibi-like roundness, no visible mouth, two simple black oval eyes evenly spaced on the upper-front of the face, a gently wavy scalloped bottom edge with three small rounded points, flat light-purple cel-shaded accent on the body surface (no glossy or metallic highlight), bold clean black outline, flat 2D anime/manga mascot illustration matching a Japanese pachislot game ghost character.

A comical mascot shark character in Japanese pachislot mascot style: chibi-like cute proportions close to a two-head-tall body ratio, vivid orange body with a pale cream-colored belly and underside, round white eyes with small black pupils, a small triangular dorsal fin on top of the head, short stubby side fins, flat cel-shaded coloring with bold clean black outline (no glossy or metallic shine), flat 2D anime/manga mascot illustration matching a Japanese pachislot game shark character.

Arrange exactly 6 distinct full-body character illustrations into an invisible, perfectly even 3-column by 2-row grid layout (3 illustrations per row, 2 rows total). Each character is centered within its own equal-sized invisible cell with generous even padding, full body visible from head to bottom edge, large expressive dynamic pose sized to fill most of its cell, matching visual weight, scale, and flat cel-shading style across all 6 illustrations so they look like one consistent set. Do not draw any visible grid lines, cell borders, dividing lines, panel frames, or text labels anywhere in the image — only the 6 characters themselves on the transparent background.

Row 1, left to right (the ghost character described above, in three different expressions):
1. Happy: the ghost joyfully bouncing with two small stubby arm-like wisps raised up in celebration, eyes curved into cheerful upward crescents, small comic-style sparkle and confetti particles floating around it, flat cel-shaded coloring.
2. Frustrated: the ghost slightly slumped and tilted, eyes drawn as small downward-curved shapes suggesting disappointment, a tiny sweat-drop shape beside its head, stubby arm-like wisps drooping down, subdued muted flat coloring.
3. Extremely excited (激アツ): the ghost leaning forward with intense wide-open oval eyes, surrounded by an explosive burst of bright purple and gold flat-colored light rays and comic-style spark effects, dramatic action pose.

Row 2, left to right (the shark character described above, in three different expressions):
4. Happy: the shark striking a triumphant pose with one fin raised in a thumbs-up-like gesture, a big open grin showing white triangular teeth, eyes curved into a happy squint, small comic-style sparkle and splash particles around it, flat cel-shaded coloring.
5. Frustrated: the shark with a small frustrated frown and narrowed eyes, one fin scratching the back of its head, a tiny sweat-drop shape beside its head, slightly hunched posture, subdued muted flat coloring.
6. Extremely excited (激アツ): the shark lunging forward aggressively with fins spread wide, a wide open grin showing white triangular teeth, eyes wide open, surrounded by an explosive burst of bright purple and gold flat-colored light rays and comic-style spark effects, dramatic dynamic action pose.
```

### B-2. 下パネルロゴ(単独1枚)

sample.png下部のロゴパネルをイメージ。こちらはグリッドではなく単独1枚のプロンプト。**AWSのロゴ・矢印マークは描かない**。「AWSLOT」「BIG BONUS」はゲームオリジナル名として文字表示OK。

- 推奨サイズ: **1536×1024(横長)**

```
Japanese pachislot (pachinko slot machine) signage panel illustration, in the authentic style of real Japanese slot machine artwork, wide banner composition. Bold, clean, thick black outlines, anime/manga cel-shading with flat, vivid, highly saturated colors, no photorealistic gloss, no chrome or metallic shine. Vibrant purple background with a dynamic flat-colored light-ray burst pattern radiating from the center, transparent background, no watermark.

A cute round ghost character in Japanese pachislot mascot style: soft pure-white blob-like body shaped like a rounded teardrop or fluffy cloud, cute chibi-like roundness, no visible mouth, two simple black oval eyes evenly spaced on the upper-front of the face, a gently wavy scalloped bottom edge with three small rounded points, flat light-purple cel-shaded accent on the body surface (no glossy or metallic highlight), calm and friendly expression, bold clean black outline, flat 2D anime/manga mascot illustration matching a Japanese pachislot game ghost character.

Large glowing neon-purple flat-colored pop-art text reading "AWSLOT" across the upper area, below it bold fiery orange-gold flat-colored text reading "BIG BONUS" with a comic-style sparkle burst effect and small flat gold coin shapes scattered behind it, the ghost character floating on the right side with arms raised in celebration, a small mini-sized version of the same ghost floating near the bottom-left corner for depth.
```

保存先ファイル名の目安: `assets/panel/awslot_big_bonus.png`

---

## C. 筐体・UI素材

現在CSS(`style.css`)のグラデーション/box-shadowだけで描いている筐体フレーム・ボタン・パネル・リール周りを、GPT Image 2で作った実素材に差し替えるためのプロンプト群。座標は `docs/DESIGN.md` 5.2節(論理解像度 720×1080)および実装済みCSS(`style.css`)の値に準拠。

**このセクションはA/Bセクション(絵柄・キャラ)とは独立**。生成画像を受領した後の `assets/ui/` への配置とコード側の差し替えは実装担当(コーダー)が別途行うので、ここではプロンプトの用意だけを行う。

### C-0. 共通ルール(筐体素材用)

- サイズ規約: GPT Image 2は **1024×1024 / 1536×1024(横長) / 1024×1536(縦長)** の3種類のみ対応。プロンプトごとに推奨サイズを明記する
- 背景: 各プロンプトとも `transparent background` を指定。筐体フレーム(C-1)のように「画像いっぱいに絵柄本体を描く」ものは、シルエットの外側(画像四隅の余白)だけが透過になる想定
- グリッド規約: 罫線なし・等分割・セル内キャプション文字なし(A/Bセクションと同じ)。グリッドで生成 → 等分割トリミングで切り出す運用も同じ
- **筐体パーツ用のスタイル派生**: A/Bセクションの絵柄・キャラは「glossy/metallic禁止・フラットセル塗りのみ」だったが、**筐体・ボタン・パネルなどのハード部品は実機の電飾感を出すため、控えめなLEDグロー・光の滲み・金属トリムのハイライトを許可**する派生版スタイルを使う(ただし写真的なリアル質感・3Dレンダリング・実写合成は引き続き禁止。あくまで「光っているフラットイラスト」)

共通スタイルブロック(筐体パーツ用。各プロンプトの先頭に含めてある):

```
Japanese pachislot (pachinko slot machine) cabinet hardware artwork, in the authentic style of a real Japanese arcade slot machine cabinet, rendered as flat illustrated 2D game art (not a photo, not a 3D render). Bold, clean black outlines, anime/manga cel-shading with flat, vivid, highly saturated colors as the base. Unlike character/symbol icons, cabinet hardware parts may include tasteful backlit LED glow, soft light bloom, and brushed-metal trim highlights typical of a real slot cabinet chassis — but no photorealistic camera rendering, no realistic room reflections, no 3D render look. Vibrant deep-purple body color with gold metal trim accents, magenta and cyan LED accent glow where noted, dramatic but tasteful rim lighting. Transparent background, no watermark, no grid lines, no cell borders, no dividing lines, no descriptive caption text beyond what is explicitly specified below.
```

### 切り出し後の配置先対応表(C全体まとめ)

| セクション | 素材 | ファイル名 |
|---|---|---|
| C-1 | 筐体フレーム全面(単独) | `assets/ui/cabinet_frame.png` |
| C-2 | MAX BETボタン(消灯) | `assets/ui/maxbet_off.png` |
| C-2 | 停止ボタン(消灯) | `assets/ui/stop_off.png` |
| C-2 | レバー(待機) | `assets/ui/lever_idle.png` |
| C-2 | MAX BETボタン(点灯) | `assets/ui/maxbet_on.png` |
| C-2 | 停止ボタン(点灯) | `assets/ui/stop_on.png` |
| C-2 | レバー(倒した状態) | `assets/ui/lever_pulled.png` |
| C-3 | AWSLOTロゴ帯(単独) | `assets/ui/logo_band.png` |
| C-3 | 下部パネル背景(単独) | `assets/ui/bottom_panel.png` |
| C-4 | リール窓の金フチ枠 | `assets/ui/reel_frame.png` |
| C-4 | リール帯背景(円筒面) | `assets/ui/reel_strip_bg.png` |
| C-4 | 入賞ラインマーカー | `assets/ui/payline_marker.png` |
| C-4 | リール間セパレータ | `assets/ui/reel_separator.png` |
| C-5 | ステージ背景: Free Tier(通常) | `assets/ui/stage_freetier.png` |
| C-5 | ステージ背景: Warm Pool(高確) | `assets/ui/stage_warmpool.png` |
| C-5 | ステージ背景: CZ警報 | `assets/ui/stage_alarm.png` |
| C-5 | ステージ背景: Auto Scaling RUSH | `assets/ui/stage_rush.png` |
| C-5 | ステージ背景: ホットスタンバイ非常灯 | `assets/ui/stage_hotstandby.png` |
| C-5 | ステージ背景: re:Inventキーノート会場(エンディング) | `assets/ui/stage_ending.png` |

---

### C-1. 筐体フレーム全面(単独1枚)

- 推奨サイズ: **1024×1536(縦長)** — 論理解像度720×1080とアスペクト比が完全に一致(720:1080 = 1024:1536 = 2:3)するため、生成後の引き伸ばし・トリミングが不要
- 内容: 筐体フレーム(`.cabinet-frame`)本体イラスト1枚。**LCD窓・リール窓・HUD窓の位置は「暗い無地の凹み」として空けておく**(ゲーム側はその上にCanvasを重ねて描画するので、正確な透過切り抜きは不要。位置だけ画像内の相対%で合わせればOK)
- 窓の位置(論理px `style.css` の `.bezel` 値から算出、画像内の相対%):
  - LCD窓: 横 **18%〜82%**、縦 **4.5%〜34.5%**(上部中央の大きい窓)
  - リール窓: 横 **23%〜77%**、縦 **39.5%〜58.5%**(中央よりやや下)
  - HUD窓: 横 **23%〜77%**、縦 **57.5%〜65%**(リール窓のすぐ下の細長い窓)
  - (余力があれば)左右の電飾ハウジング: 左は横 **2%〜16%**・右は横 **84%〜98%**、いずれも縦 **3.5%〜72%** の細長い縦チャンネルとして凹ませておくと、CSSの電飾(`.lamp`)を上に重ねたときに「電飾の収納溝」らしく見える
  - ロゴ帯の位置(横 **19%〜81%**・縦 **35%〜39%**)と下部パネルの位置(横 **14%〜86%**・縦 **74%〜93%**)は、それぞれ別素材(C-3)で覆うので**無地の筐体表面のまま**にしておく(凹みや装飾を描き込まない)

```
Japanese pachislot (pachinko slot machine) cabinet hardware artwork, in the authentic style of a real Japanese arcade slot machine cabinet, rendered as flat illustrated 2D game art (not a photo, not a 3D render). Bold, clean black outlines, anime/manga cel-shading with flat, vivid, highly saturated colors as the base. Unlike character/symbol icons, cabinet hardware parts may include tasteful backlit LED glow, soft light bloom, and brushed-metal trim highlights typical of a real slot cabinet chassis — but no photorealistic camera rendering, no realistic room reflections, no 3D render look. Vibrant deep-purple body color with gold metal trim accents, magenta and cyan LED accent glow where noted, dramatic but tasteful rim lighting. Transparent background, no watermark, no grid lines, no cell borders, no dividing lines, no descriptive caption text beyond what is explicitly specified below.

A tall Japanese pachislot cabinet body, portrait orientation, viewed straight-on and filling almost the entire frame edge to edge with only a thin transparent margin. Rounded-corner cabinet silhouette. Deep purple gradient body (richer purple near the edges, subtle glow near the center), bold gold metal trim edging running along the outer silhouette and around each recessed window described below. Flat cel-shaded coloring as the base, with tasteful backlit LED glow and soft light bloom accents in magenta and cyan along the trim lines. The cabinet body itself is fully painted and opaque; only the area outside the cabinet silhouette is transparent.

Leave the following rectangular areas as smooth, plain, dark near-black rounded-rectangle recessed windows (like empty screen cutouts waiting for content to be placed on top later) — do not draw any UI, screen content, text, or characters inside these recessed areas, just a subtly gradiented dark recess with a thin gold trim ring immediately around its border:
1. LCD window: a large rounded-rectangle recess positioned at approximately 18%-82% of the image width and 4.5%-34.5% of the image height (upper-center area).
2. Reel window: a wide rounded-rectangle recess positioned at approximately 23%-77% of the image width and 39.5%-58.5% of the image height (just below the midpoint).
3. HUD window: a smaller, shorter rounded-rectangle recess positioned at approximately 23%-77% of the image width and 57.5%-65% of the image height (directly below the reel window).

Also include two narrow vertical LED housing channels running down the left and right edges of the cabinet: one at approximately 2%-16% of the width, another at approximately 84%-98% of the width, both spanning approximately 3.5%-72% of the height. Style them as recessed dark channels with a thin gold metal trim edge, like empty light housings ready to hold glowing light segments layered on top later.

Leave the horizontal strip at approximately 19%-81% of the width and 35%-39% of the height (just below the LCD window) as plain unembellished cabinet surface with no extra decoration — a separate logo banner graphic will be placed there later.

Leave the lower area at approximately 14%-86% of the width and 74%-93% of the height as plain unembellished cabinet surface with no extra decoration — a separate bottom panel graphic will be placed there later.

No AWS logos or brand names anywhere on the cabinet. No characters, no readable text anywhere in the image.
```

---

### C-2. 操作系グリッド(1プロンプトで6種を一括生成)

- 推奨サイズ: **1024×1536(縦長)**
- レイアウト: **3列×2行**のグリッド。**上段=消灯/待機状態、下段=点灯/操作状態**で、列はMAX BET・停止ボタン・レバーの3種
- 文字ルール: MAX BETボタンには実機の慣習にならい "MAX BET" の刻印文字を入れてOK。停止ボタン・レバーには文字を入れない

### セル位置 → 切り出し後ファイル名 対応表

| 行 | 列1(MAX BET) | 列2(停止ボタン) | 列3(レバー) |
|---|---|---|---|
| Row 1(消灯/待機) | `assets/ui/maxbet_off.png` | `assets/ui/stop_off.png` | `assets/ui/lever_idle.png` |
| Row 2(点灯/操作) | `assets/ui/maxbet_on.png` | `assets/ui/stop_on.png` | `assets/ui/lever_pulled.png` |

### プロンプト全文(コピペ用)

```
Japanese pachislot (pachinko slot machine) cabinet hardware artwork, in the authentic style of a real Japanese arcade slot machine cabinet, rendered as flat illustrated 2D game art (not a photo, not a 3D render). Bold, clean black outlines, anime/manga cel-shading with flat, vivid, highly saturated colors as the base. Unlike character/symbol icons, cabinet hardware parts may include tasteful backlit LED glow, soft light bloom, and brushed-metal trim highlights typical of a real slot cabinet chassis — but no photorealistic camera rendering, no realistic room reflections, no 3D render look. Vibrant deep-purple body color with gold metal trim accents, magenta and cyan LED accent glow where noted, dramatic but tasteful rim lighting. Transparent background, no watermark, no grid lines, no cell borders, no dividing lines, no descriptive caption text beyond what is explicitly specified below.

Arrange exactly 6 distinct slot-machine cabinet control parts into an invisible, perfectly even 3-column by 2-row grid layout (3 parts per row, 2 rows total). Each part is centered within its own equal-sized invisible cell with generous even padding around it, viewed straight-on as if photographed for a parts catalog, matching visual weight, scale, and cel-shading style across all 6 parts so they look like one consistent hardware set. Do not draw any visible grid lines, cell borders, dividing lines, panel frames, or descriptive caption labels anywhere in the image — only the 6 parts themselves on the transparent background.

Row 1, left to right (idle / unlit state):
1. A round metallic MAX BET button, unlit state: brushed silver-gray dome button with a subtle bevel highlight, the bold flat text "MAX BET" printed on its face in dark letters, calm and understated, no glow.
2. A round red stop button, unlit/dim state: dark muted red dome button with a thin light-pink rim trim, slightly desaturated, no glow, looks "off" and waiting.
3. An idle slot-machine lever: a chrome-and-purple rod standing upright with a round red ball-shaped grip on top, subtle metallic shading, no glow, resting neutral upright position.

Row 2, left to right (lit / active state):
4. A round metallic MAX BET button, lit state: warm gold dome button glowing brightly with radiant backlight, the bold flat text "MAX BET" printed on its face in dark letters, soft golden light bloom around the rim.
5. A round red stop button, lit/active state: vivid bright red dome button glowing intensely with a pulsing red backlight and soft red light bloom around the rim, looks "on" and urgent.
6. An activated slot-machine lever: the same chrome-and-purple rod with a round red ball-shaped grip, now tilted diagonally as if just pulled/pushed, the red ball grip glowing with a soft red light bloom.
```

---

### C-3. 帯・パネル(横長素材・単独1枚ずつ)

横長素材は1枚ずつ単独プロンプトで生成する(グリッド化しない)。

#### C-3-1. AWSLOTロゴ帯

- 推奨サイズ: **1536×1024(横長)** で生成し、実際に使う帯は横440×縦45(比率約9.8:1)とかなり細長いため、**生成後にバナー部分だけを上下トリミングして切り出す**(GPT Image 2にはこの極端な横長比率を直接指定できないため)
- キャラは登場させない。文字は「AWSLOT」のみ(AWS公式ロゴ・ブランド意匠は描かせない)

```
Japanese pachislot (pachinko slot machine) cabinet hardware artwork, in the authentic style of a real Japanese arcade slot machine cabinet, rendered as flat illustrated 2D game art (not a photo, not a 3D render). Bold, clean black outlines, anime/manga cel-shading with flat, vivid, highly saturated colors as the base. Unlike character/symbol icons, cabinet hardware parts may include tasteful backlit LED glow, soft light bloom, and brushed-metal trim highlights typical of a real slot cabinet chassis — but no photorealistic camera rendering, no realistic room reflections, no 3D render look. Vibrant deep-purple body color with gold metal trim accents, magenta and cyan LED accent glow where noted, dramatic but tasteful rim lighting. Transparent background, no watermark, no grid lines, no cell borders, no dividing lines, no descriptive caption text beyond what is explicitly specified below.

A single horizontal rounded-rectangle signage plaque, wide banner shape, centered in the frame with generous transparent padding above and below so it can be tightly cropped later. Deep purple gradient background with a bold gold metal trim border all around, soft magenta glow bleeding out from behind the plaque edges. Centered inside the plaque, bold flat pop-art 3D-style text reading "AWSLOT" in glowing neon-purple and white letters with a magenta outer glow, no other text, no characters, no additional decoration.
```

#### C-3-2. 下部パネル背景(AWSLOT BIG BONUS+幽霊とサメ)

- 推奨サイズ: **1536×1024(横長)** で生成し、実際のパネルは横520×縦200(比率約2.6:1)なので、**生成後に上下をトリミングして目的の比率に近づける**
- キャラ固定文(幽霊・サメ)を使用。B-2(下パネルロゴ、幽霊のみ)とは別素材として、**幽霊とサメの両方が登場するバージョン**を作る。B-2は既存のまま残してよい(用途が異なる場合の代替案として使える)

```
Japanese pachislot (pachinko slot machine) cabinet hardware artwork, in the authentic style of a real Japanese arcade slot machine cabinet, rendered as flat illustrated 2D game art (not a photo, not a 3D render). Bold, clean black outlines, anime/manga cel-shading with flat, vivid, highly saturated colors as the base. Unlike character/symbol icons, cabinet hardware parts may include tasteful backlit LED glow, soft light bloom, and brushed-metal trim highlights typical of a real slot cabinet chassis — but no photorealistic camera rendering, no realistic room reflections, no 3D render look. Vibrant deep-purple body color with gold metal trim accents, magenta and cyan LED accent glow where noted, dramatic but tasteful rim lighting. Transparent background, no watermark, no grid lines, no cell borders, no dividing lines, no descriptive caption text beyond what is explicitly specified below.

A cute round ghost character in Japanese pachislot mascot style: soft pure-white blob-like body shaped like a rounded teardrop or fluffy cloud, cute chibi-like roundness, no visible mouth, two simple black oval eyes evenly spaced on the upper-front of the face, a gently wavy scalloped bottom edge with three small rounded points, flat light-purple cel-shaded accent on the body surface (no glossy or metallic highlight), bold clean black outline, flat 2D anime/manga mascot illustration matching a Japanese pachislot game ghost character.

A comical mascot shark character in Japanese pachislot mascot style: chibi-like cute proportions close to a two-head-tall body ratio, vivid orange body with a pale cream-colored belly and underside, a big friendly grin showing white triangular teeth, round white eyes with small black pupils, a small triangular dorsal fin on top of the head, short stubby side fins, flat cel-shaded coloring with bold clean black outline (no glossy or metallic shine), flat 2D anime/manga mascot illustration matching a Japanese pachislot game shark character.

A single wide rounded-rectangle signage panel, centered in the frame with generous transparent padding above and below so it can be cropped to a shorter wide banner later. Deep purple gradient background with a bold gold metal trim border all around, radiant light-ray burst pattern radiating from the center. Bold flat pop-art text reading "AWSLOT" near the top in glowing neon-purple letters, below it bold fiery orange-gold flat text reading "BIG BONUS" with a comic-style sparkle burst effect and small flat gold coin shapes scattered around. The ghost character floating and celebrating on the left side, the shark character striking a triumphant pose on the right side, both characters looking toward the center, small mini-sized sparkle particles scattered between them for depth.
```

---

### C-4. リールまわりグリッド(1プロンプトで4種を一括生成)

- 推奨サイズ: **1536×1024(横長)**
- レイアウト: **2列×2行**のグリッド

### セル位置 → 切り出し後ファイル名 対応表

| 行 | 列1 | 列2 |
|---|---|---|
| Row 1 | 金フチ枠<br>`assets/ui/reel_frame.png` | リール帯背景<br>`assets/ui/reel_strip_bg.png` |
| Row 2 | 入賞ラインマーカー<br>`assets/ui/payline_marker.png` | リール間セパレータ<br>`assets/ui/reel_separator.png` |

### プロンプト全文(コピペ用)

```
Japanese pachislot (pachinko slot machine) cabinet hardware artwork, in the authentic style of a real Japanese arcade slot machine cabinet, rendered as flat illustrated 2D game art (not a photo, not a 3D render). Bold, clean black outlines, anime/manga cel-shading with flat, vivid, highly saturated colors as the base. Unlike character/symbol icons, cabinet hardware parts may include tasteful backlit LED glow, soft light bloom, and brushed-metal trim highlights typical of a real slot cabinet chassis — but no photorealistic camera rendering, no realistic room reflections, no 3D render look. Vibrant deep-purple body color with gold metal trim accents, magenta and cyan LED accent glow where noted, dramatic but tasteful rim lighting. Transparent background, no watermark, no grid lines, no cell borders, no dividing lines, no descriptive caption text beyond what is explicitly specified below.

Arrange exactly 4 distinct slot-machine reel-area hardware parts into an invisible, perfectly even 2-column by 2-row grid layout (2 parts per row, 2 rows total). Each part is centered within its own equal-sized invisible cell with generous even padding around it, matching visual weight, scale, and cel-shading style across all 4 parts so they look like one consistent hardware set. Do not draw any visible grid lines, cell borders, dividing lines, panel frames, or descriptive caption labels anywhere in the image — only the 4 parts themselves on the transparent background.

Row 1, left to right:
1. A wide rounded-rectangle picture-frame-shaped border: a hollow gold metal trim frame (transparent hole in the middle, only the frame ring itself is opaque) with an ornate beveled metal edge and a soft magenta glow along the inner edge, meant to overlay on top of a reel display window.
2. A tall vertical rectangular strip texture representing a mechanical slot-reel drum surface: pale cream-white cylindrical shading with a soft dark gradient shadow along the top edge and another along the bottom edge (simulating the curve of a spinning drum), flat cel-shaded illustration, no symbols or text on it, just the plain drum-surface texture.

Row 2, left to right:
3. A pair of small triangular payline indicator markers: one gold-and-purple triangle pointing rightward (meant for the left edge of a reel window) and one pointing leftward (meant for the right edge), connected conceptually by a thin glowing horizontal purple-gold line spanning between them, marking a center payline.
4. A slim tall vertical divider bar: a narrow decorative strip with gold metal trim edges and a subtle purple LED glow running down its length, meant to be placed as a separator between reel columns.
```

---

### C-5. LCDステージ背景グリッド(1プロンプトで6種を一括生成)

- 推奨サイズ: **1536×1024(横長)**
- レイアウト: **3列×2行**のグリッド。3列×2行だと各セルは512×512の**正方形**になる。液晶(LCD)の実表示比率は440×300(約3:2)なので、**切り出し後に各セルを正方形→3:2相当(例: 512×512 → 512×349程度)へ上下トリミングする**運用を前提とする
- 内容: **AWSゆかりの場所・シーンめぐり**をテーマにした6種のステージ背景(抽象的なクラウド風景から変更)。**背景のみ**(キャラ・UI・文字は描かない。幽霊やサメなどのキャラや数値はCanvas側で別途重ねて描画するため、背景にキャラクターを描き込まない)
- AWS公式ロゴ・実在ブランド表記は描かせない。カンファレンス会場や展示ブースは「クラウド技術カンファレンス会場」のような形状・雰囲気描写に留める

### セル位置 → 切り出し後ファイル名 対応表

| 行 | 列1 | 列2 | 列3 |
|---|---|---|---|
| Row 1 | 通常: Kiroの家<br>`assets/ui/stage_freetier.png` | 高確: クラウド技術サミット会場<br>`assets/ui/stage_warmpool.png` | CZ: データセンターの通路<br>`assets/ui/stage_alarm.png` |
| Row 2 | 激アツ: War Room(障害対応オペレーションセンター)<br>`assets/ui/stage_rush.png` | 引き戻し: 深夜オフィスの非常灯廊下<br>`assets/ui/stage_hotstandby.png` | エンディング: 技術カンファレンス基調講演会場<br>`assets/ui/stage_ending.png` |

> ファイル名は現行の6つ(`stage_freetier` / `stage_warmpool` / `stage_alarm` / `stage_rush` / `stage_hotstandby` / `stage_ending`)を維持(ゲーム側の読み込み名を変えないため)。中身のシーンだけを差し替えている。

### プロンプト全文(コピペ用)

```
Japanese pachislot (pachinko slot machine) cabinet hardware artwork, in the authentic style of a real Japanese arcade slot machine cabinet, rendered as flat illustrated 2D game art (not a photo, not a 3D render). Bold, clean black outlines, anime/manga cel-shading with flat, vivid, highly saturated colors as the base. Unlike character/symbol icons, cabinet hardware parts may include tasteful backlit LED glow, soft light bloom, and brushed-metal trim highlights typical of a real slot cabinet chassis — but no photorealistic camera rendering, no realistic room reflections, no 3D render look. Vibrant deep-purple body color with gold metal trim accents, magenta and cyan LED accent glow where noted, dramatic but tasteful rim lighting. Transparent background, no watermark, no grid lines, no cell borders, no dividing lines, no descriptive caption text beyond what is explicitly specified below.

Arrange exactly 6 distinct LCD stage background illustrations into an invisible, perfectly even 3-column by 2-row grid layout (3 backgrounds per row, 2 rows total). Each background fills its own equal-sized invisible square cell edge to edge with no padding (these are full-bleed backgrounds, not centered icons). Matching visual weight, line thickness, and cel-shading style across all 6 backgrounds so they look like one consistent set of game screens depicting a tour of cloud-computing-themed locations. These are background-only scenes: do not draw any ghost or shark mascot characters, no people in sharp focus, no buttons, numbers, or UI text in any of them — just architecture, atmosphere, lighting, and simple background shapes (distant silhouettes/crowds are fine as background texture, but no distinct foreground characters). No AWS logos, no real company branding, no readable logo marks anywhere — only generic tech/cloud-conference shapes and colors. Do not draw any visible grid lines, cell borders, dividing lines, panel frames, or descriptive caption labels anywhere in the image.

Row 1, left to right:
1. "Kiro's Room" normal-mode background: a cozy, cute, softly-lit bedroom at night that looks like it belongs to a small ghost — pale lavender walls, a round window showing a starry night sky, a small desk with a glowing computer monitor casting a soft blue-white light, a fluffy cloud-shaped cushion on a bed, calm and adorable mood, simple and uncluttered.
2. "Cloud Tech Summit" high-chance background: a bright, bustling tech conference expo hall with rows of glowing exhibition booths in the distance, colorful banner shapes (no readable logos), a lively crowd of small silhouetted attendees creating a sense of buzz and energy, warm overhead lighting.
3. "Data Center Corridor" tense CZ background: a long straight corridor lined with tall server rack silhouettes on both sides, rows of small blinking LED lights in blue and green along the racks, a cool dim ambient light with a vanishing-point perspective down the hallway, faint haze in the air.

Row 2, left to right:
4. "War Room" high-expectation background: a tense incident-response operations center packed with wall-to-wall glowing monitor screens showing abstract graphs and status grids, a rotating red alert beacon light sweeping across the room, dramatic red-orange emergency lighting, urgent and intense mood.
5. "Late-Night Office Corridor" recovery-stage background: a dim, quiet office hallway at night lit mostly by sparse green emergency exit lights and a faint moody blue glow, rows of darkened cubicle silhouettes on the sides, a tense hushed atmosphere of waiting for recovery.
6. "Tech Conference Keynote Hall" ending background: a grand celebratory keynote stage hall with a massive glowing presentation screen at the front, dramatic spotlight beams crossing from above, a distant silhouette of a cheering crowd filling the seats below, gold confetti particles falling through the air.
```

---

生成画像を受領後の組み込み(`assets/ui/` への配置とコード側の差し替え)は実装担当が別途行う。
</content>
