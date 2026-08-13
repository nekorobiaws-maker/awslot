# AWSLOT ゲームフロー図

> **このドキュメントは実装コード(`src/data/transitions.js` / `src/data/modes.js` / `src/game/flow.js` / `src/game/modemachine.js` / `src/game/modes/*.js`)を正として作成している。**
> `docs/DESIGN.md` の数値と食い違う箇所があれば、こちらが実装済みの実際の挙動。
>
> ボーナス層の数値は 2026-08-13 の仕様変更(実装反映中)を反映した**新値**で記載している。
> 具体的には Lambda REG BONUS = 6G、S3 BIG BONUS = 15G、DynamoDB BIG BONUS = 1セット15G(継続率70%は変更なし)。
> 払出方式も「固定純増/G」から「ボーナス中はベルが高確率で揃い、1回成立につき+15枚」の方式に変更されている。

---

## 1. 全体モード遷移図

全20モードを層ごとに整理した幹図。派生ゾーン・上乗せ特化ゾーンの内部(どのレア役でどのゾーンに飛ぶか)は 1a では1つのノードにまとめており、詳細は「1b. 派生・上乗せゾーン拡大図」を参照。

### 1a. 幹図(通常時 → CZ → ボーナス → AT → 引き戻し → エンディング)

```mermaid
flowchart TD
  subgraph NORMAL["■ 通常時"]
    FREE_TIER["Free Tier(通常時)<br/>内部状態3段階(Cold Start/Warm Pool/Provisioned)<br/>天井999G"]
  end

  subgraph CZLAYER["■ CZ層(チャンスゾーン)"]
    CZ_ALARM["CloudWatch アラートCZ<br/>5G・突破率48%・振分60%"]
    CZ_ADVISOR["Trusted Advisor CZ<br/>7G・突破率50%・振分30%"]
    CZ_WA["Well-Architected CZ<br/>10G・突破率75%・振分10%"]
  end

  subgraph BONUSLAYER["■ ボーナス層(初当り)"]
    BONUS_LAMBDA["Lambda REG BONUS<br/>6G・ベル高確率で+15枚<br/>AT当選率30%"]
    BONUS_S3["S3 BIG BONUS<br/>15G・ベル高確率で+15枚<br/>AT確定100%"]
    BONUS_DYNAMO["DynamoDB BIG BONUS<br/>1セット15G・継続率70%<br/>ベル高確率で+15枚・AT確定"]
  end

  subgraph ATLAYER["■ 母体AT"]
    AS_RUSH["Auto Scaling RUSH<br/>1セット20G・DC 1〜8<br/>純増/継続率をDCが兼ねる"]
  end

  subgraph ZONELAYER["■ 派生・上乗せゾーン(詳細は図1b)"]
    DERIVED_ZONES["派生ゾーン4種 + 上乗せ特化3種<br/>(AS_RUSH の上に積まれる)"]
  end

  subgraph UPPERATLAYER["■ 上位AT"]
    SERVERLESS_RUSH["Serverless RUSH<br/>1セット20G・純増4枚・継続率80%固定"]
    MULTI_REGION["Multi-Region アクティブ・アクティブ<br/>1セット20G・純増6枚・継続率85%<br/>全レア役で+1セット確定"]
  end

  subgraph RECOVERYLAYER["■ 引き戻し層"]
    HOT_STANDBY["ホットスタンバイ(Multi-AZ)<br/>10G・成功率35%"]
    ROUTE53["Route 53 フェイルオーバー<br/>3G・成功率10%"]
  end

  subgraph ENDINGLAYER["■ エンディング"]
    REINVENT_ED["re:Invent キーノート<br/>30G・純増3枚"]
  end

  FREE_TIER -->|"レア役→CZ当選(振分60/30/10%)"| CZ_ALARM
  FREE_TIER -->|"レア役→CZ当選"| CZ_ADVISOR
  FREE_TIER -->|"レア役→CZ当選"| CZ_WA
  FREE_TIER -->|"999G天井到達(SLA保証)"| CZ_WA
  FREE_TIER -->|"ボーナス直撃(GHOST/SHARK/STRONG_CHERRY等)"| BONUSLAYER
  FREE_TIER -->|"SHARK 20% AT直撃"| AS_RUSH

  CZ_ALARM -->|"突破48%(振分70/25/5%)"| BONUSLAYER
  CZ_ALARM -->|"失敗52%"| FREE_TIER
  CZ_ADVISOR -->|"突破50%(振分40/45/15%)"| BONUSLAYER
  CZ_ADVISOR -->|"失敗50%"| FREE_TIER
  CZ_WA -->|"突破75%(振分5/55/40%・全柱立ちでDYNAMO確定)"| BONUSLAYER
  CZ_WA -->|"失敗25%"| FREE_TIER

  BONUS_LAMBDA -->|"AT当選30%"| AS_RUSH
  BONUS_LAMBDA -->|"非当選70%(Warm Poolから再開)"| FREE_TIER
  BONUS_S3 -->|"AT確定100%"| AS_RUSH
  BONUS_DYNAMO -->|"セット継続70%"| BONUS_DYNAMO
  BONUS_DYNAMO -->|"消化終了・AT確定"| AS_RUSH

  AS_RUSH -->|"派生ゾーン当選(レア役ごとに抽選)"| DERIVED_ZONES
  DERIVED_ZONES -->|"ゾーン終了(pop)"| AS_RUSH
  DERIVED_ZONES -->|"Step Functions全制覇(popThenTo)"| MULTI_REGION
  AS_RUSH -->|"サメ揃い30% / 5セット連続継続"| SERVERLESS_RUSH
  AS_RUSH -->|"DC枯渇(ヘルスチェック失敗)"| HOT_STANDBY

  SERVERLESS_RUSH -->|"ゴースト揃い100%"| MULTI_REGION
  SERVERLESS_RUSH -->|"セット非継続"| HOT_STANDBY
  MULTI_REGION -->|"セット非継続"| HOT_STANDBY

  HOT_STANDBY -->|"成功35%・元のATへ復帰(DC+2)"| ATLAYER
  HOT_STANDBY -->|"成功35%・元のATへ復帰"| UPPERATLAYER
  HOT_STANDBY -->|"失敗65%"| ROUTE53
  ROUTE53 -->|"成功10%・元のATへ復帰(DC+1)"| ATLAYER
  ROUTE53 -->|"成功10%・元のATへ復帰"| UPPERATLAYER
  ROUTE53 -->|"失敗90%"| FREE_TIER

  ATLAYER -.->|"差枚+2222 or ATセット計15到達(強制)"| REINVENT_ED
  UPPERATLAYER -.->|"差枚+2222 or ATセット計15到達(強制)"| REINVENT_ED
  REINVENT_ED -->|"30G消化・全状態リセット"| FREE_TIER
```

**読み方の補足**:
- `BONUSLAYER` への矢印は「3種のうちどれかに振り分け抽選される」ことを表す(振分率は矢印ラベルと2章「モード早見表」参照)。
- エンディング条件は `src/game/flow.js` の `_checkEnding()` がどのモードにいても毎ゲーム判定しており、条件を満たすと `modeMachine.forceMode('REINVENT_ED')` でスタックごと畳んで強制遷移する(図中の破線矢印)。
- ホットスタンバイ/Route 53 の「元のATへ復帰」は、転落前にいた AT(`AS_RUSH` / `SERVERLESS_RUSH` / `MULTI_REGION` のいずれか)を `resumeMode` パラメータで覚えておいて戻す実装(`src/game/modes/recovery.js` の `resumeTransition()`)。

### 1b. 派生・上乗せゾーン拡大図(AS_RUSH の上に積まれるモード群)

```mermaid
flowchart TD
  AS_RUSH["Auto Scaling RUSH(母体AT)"]
  SERVERLESS_RUSH["Serverless RUSH"]
  MULTI_REGION["Multi-Region アクティブ・アクティブ"]

  subgraph STAY["滞在型ゾーン(自身の純増で消化)"]
    SPOT_ZONE["Spot インスタンスゾーン<br/>純増8・最低15G保証<br/>1/30で中断通知→2G後強制終了"]
    EC2_BURST["EC2 バーストモード<br/>純増5・クレジット100初期<br/>毎G-4、レア役で回復(上限150)"]
    GRAVITON["Graviton モード<br/>純増1.6・1セット50G・継続率90%"]
    RESERVED["Reserved Instance ゾーン<br/>1年+50G保証(80%)/3年+150G保証(20%)<br/>ヘルスチェック免除・純増は母体準拠"]
  end

  subgraph BOOST["上乗せ特化ゾーン(母体のセット数へ上乗せ)"]
    CLOUDFRONT["CloudFront エッジ上乗せ<br/>10G固定・平均+2セット最大+10セット"]
    KINESIS["Kinesis 上乗せストリーム<br/>シャード数1〜10ぶんの上乗せレコード"]
    STEP_FUNCTIONS["Step Functions チャレンジ<br/>最大8ステート・プレイヤー選択(左/右)<br/>Task成功率70%で+1セット"]
  end

  AS_RUSH -->|"スイカ5%/8% チャンス目5%/8% 強チェリー10%/15%(役ごとに抽選)"| BOOST
  AS_RUSH -->|"チャンス目3%"| GRAVITON
  AS_RUSH -->|"強チェリー5%"| RESERVED
  AS_RUSH -->|"サメ揃い40% / ゴースト揃い30%"| SPOT_ZONE
  AS_RUSH -->|"強チェリー8% / サメ揃い30%"| EC2_BURST
  AS_RUSH -->|"サメ揃い30%(昇格抽選、ゾーンより先に判定)"| SERVERLESS_RUSH
  AS_RUSH -->|"ゴースト揃い20%(ゾーンを介さず直接昇格)"| SERVERLESS_RUSH

  STAY -->|"ゾーン終了(pop→AS_RUSHへ復帰)"| AS_RUSH
  BOOST -->|"上乗せ消化終了(pop→AS_RUSHへ復帰)"| AS_RUSH

  STAY -->|"滞在中に強チェリー6%/サメ25%/ゴースト30〜50%でネスト当選(push、3段目)"| BOOST

  STEP_FUNCTIONS -->|"8ステート全制覇(popThenTo: 母体ATごとMULTI_REGIONへ差替)"| MULTI_REGION
```

**読み方の補足**:
- `RESERVED` はネスト対象外(`src/game/modes/zones.js` の `reserved.onGame` に `nestedZone()` 呼び出しがない)。上乗せ特化ゾーンへ二重当選するのは `SPOT_ZONE` / `EC2_BURST` / `GRAVITON` の3つだけ。
- 派生ゾーンへの突入は `AS_RUSH` 中のみ実装されている(`SERVERLESS_RUSH` / `MULTI_REGION` 中はゾーン抽選そのものが存在しない)。
- `STEP_FUNCTIONS` の全制覇だけが唯一 `popThenTo` を使う特殊な遷移(自分を畳んでから、親の `AS_RUSH` ごと `MULTI_REGION` に差し替える)。

---

## 2. 1ゲームの流れ

`GameFlow`(第1層ステートマシン)の `IDLE → BET → READY → SPINNING → JUDGE → PAYOUT → TRANSITION → IDLE` を1本のレーンで表し、演出システム(`EventBus` 購読側)がどのタイミングでイベントを拾うかを1ノードにまとめている。

```mermaid
flowchart LR
  BET["MAX BET<br/>クレジット-3<br/>(不足時は自動投入)"] --> LEVER["レバーON<br/>ここで全抽選が確定<br/>(小役/CZ/ボーナス/AT直撃/ゾーン/DC変動)"]
  LEVER --> SPIN["3リール回転<br/>(SPINNING)"]
  SPIN --> STOP1["第1停止"] --> STOP2["第2停止"] --> STOP3["第3停止<br/>(最大4コマ滑り)"]
  STOP3 --> JUDGE["入賞判定<br/>(中段横一直線)"]
  JUDGE --> PAYOUT["払出アニメ<br/>1枚ずつ加算"]
  PAYOUT --> MODE["モード更新<br/>modeMachine.onGame()<br/>G数消化/セット末判定/モード遷移/エンディング判定"]
  MODE --> IDLE["IDLE<br/>次ゲーム入力待ち"]

  EVENTS["演出システム(EventBus購読・一方向依存)<br/>bet / leverOn / stop1〜3 / judge<br/>payoutStart・payoutEnd / modeEnter・modeExit<br/>setEnd / paramChange"]
  BET -.->|"emit: bet"| EVENTS
  LEVER -.->|"emit: leverOn(結果確定後)"| EVENTS
  STOP1 -.->|"emit: stop1/2/3"| EVENTS
  JUDGE -.->|"emit: judge"| EVENTS
  PAYOUT -.->|"emit: payoutStart/payoutEnd"| EVENTS
  MODE -.->|"emit: modeEnter/modeExit/setEnd/paramChange"| EVENTS
```

**読み方の補足**:
- 抽選(小役・CZ当選・ボーナス種別・AT直撃・スケールアウト等)はすべて「レバーON」の時点で確定する(`GameFlow.leverOn()` → `drawFlag()`)。以降のリール停止・演出はすべて「もう決まった結果」を表現するだけ。
- 演出側からゲーム状態を書き換えることは一切ない(`game/` は `render/` と `staging/` を import しない一方向依存)。
- 停止ボタンは `SPINNING` 中は通常の停止操作だが、`Step Functions チャレンジ` の分岐選択待ち(`modeMachine.awaitingChoice`)中は左/右ボタンがそのまま選択肢(A/D)として扱われる兼用ボタンになる。

---

## 3. モードスタックの入れ子図

派生ゾーン(滞在型・上乗せ型)は「親モードの上に積む」構造になっており、`ModeMachine` は単一モードではなく**スタック(深さ上限3)**を持つ。

```mermaid
flowchart TD
  L1["深さ1: AS_RUSH(母体AT)"] -->|"push: 派生ゾーン当選"| L2["深さ2: SPOT_ZONE等(滞在型)<br/>または CLOUDFRONT等(上乗せ型)"]
  L2 -->|"push: 滞在型ゾーン中のネスト上乗せ当選<br/>(SPOT/EC2_BURST/GRAVITONのみ)"| L3["深さ3: CLOUDFRONT / KINESIS<br/>(上限3・4段目は最上段を畳んで置換)"]
  L3 -->|"pop: 上乗せ消化終了 → 親へ復帰"| L2
  L2 -->|"pop: ゾーン終了 → 親(AS_RUSH)へ復帰"| L1
  L2 -->|"popThenTo: Step Functions 全制覇<br/>(自分を畳んでから親ごと差し替え)"| L1B["深さ1: MULTI_REGION に差替済み"]
```

**読み方の補足**:
- 通常の `pop` は「自分を畳んで、1つ下の親に制御を戻すだけ」(`ModeMachine._pop()`)。親のモードそのものは変わらない。
- `popThenTo` は `Step Functions チャレンジ`(深さ2)全制覇だけが使う特殊遷移で、「自分を畳んだ上で、さらに1つ下の親モードごと `MULTI_REGION` に差し替える」(`ModeMachine._popThenReplace()`)。結果としてスタックの深さは1に戻り、そこに `MULTI_REGION` が乗る。
- スタック上限は `MAX_STACK_DEPTH = 3`(`src/game/modemachine.js`)。上限に達した状態でさらに `push` しようとすると、最上段を畳んでから置換する安全弁が働く(`stackGuardHits` でデバッグ計測)。

---

## 4. モード早見表

`docs/DESIGN.md` の20モードすべてに対応。数値は `src/data/modes.js` の実装値(ボーナス層は2026-08-13付の新仕様値)。

| # | モード名 | 層 | 役割 | 主要スペック | 突入契機 |
|---|---|---|---|---|---|
| M01 | Free Tier(通常時) | 通常時 | メイン待機画面。内部状態でCZ確率が変動 | 内部状態3段階(Cold Start ×1.0 / Warm Pool ×2.0 / Provisioned ×4.0)、天井999G「SLA 99.9% 保証」 | ゲーム開始/各所からの転落先 |
| M02 | CloudWatch アラートCZ | CZ層 | 軽量CZ。折れ線グラフが閾値を超えれば突破 | 5G・突破率48%・CZ内振分60% | 通常時レア役でCZ当選→振分抽選 |
| M03 | Trusted Advisor CZ | CZ層 | 中位CZ。5項目チェックリスト、3項目以上グリーンで突破 | 7G・突破率50%・CZ内振分30% | 同上 |
| M04 | Well-Architected CZ | CZ層 | 最上位CZ。6本の柱、全立ちで最上位ボーナス確定 | 10G・突破率75%・CZ内振分10%(全柱立ち確率35%) | 同上 / 通常時999G天井到達で確定 |
| M05 | Lambda REG BONUS | ボーナス層 | 軽量ボーナス | **6G**・ベルが高確率で揃い1回成立につき+15枚・AT当選率30% | CZ突破時の振分(70/40/5%) / ボーナス直撃時の振分 |
| M06 | S3 BIG BONUS | ボーナス層 | 王道BIG。AT確定の安心感 | **15G**・ベルが高確率で揃い1回成立につき+15枚・AT確定100% | CZ突破時の振分(25/45/55%) / ボーナス直撃時の振分 |
| M07 | DynamoDB BIG BONUS | ボーナス層 | セット継続型の重量級。継続するほど伸びる | **1セット15G**・継続率70%・ベルが高確率で揃い1回成立につき+15枚・AT確定+DC初期値+2 | CZ突破時の振分(5/15/40%) / 直撃 / Well-Architected全柱立ちで確定 |
| M08 | Auto Scaling RUSH | 母体AT | 本機の出玉源。DC(1〜8)が純増と継続率を兼ねる | 1セット20G・DC別純増1.0〜3.8枚・DC別継続率45%〜80% | ボーナス終了(AT当選) / 通常時SHARK直撃20% / 引き戻し成功 |
| M09 | Spot インスタンスゾーン | 派生ゾーン | 爆発型。中断リスクと表裏一体 | 純増8枚・最低15G保証・1/30で中断通知→2G後強制終了(平均約30G) | AS_RUSH中 サメ揃い40% / ゴースト揃い30% |
| M10 | EC2 バーストモード | 派生ゾーン | クレジット消費型の爆発モード | 純増5枚・クレジット100初期・毎G-4、レア役で回復(上限150、平均約25G) | AS_RUSH中 強チェリー8% / サメ揃い30% |
| M11 | Graviton モード | 派生ゾーン | 安定型。低純増・高継続の長時間消化 | 純増1.6枚・1セット50G・継続率90% | AS_RUSH中 チャンス目3% |
| M12 | Reserved Instance ゾーン | 派生ゾーン | ゲーム数保証。ヘルスチェック免除 | 1年契約=+50G保証(80%) / 3年契約=+150G保証(20%)・純増は母体RUSH準拠 | AS_RUSH中 強チェリー5% |
| M13 | CloudFront エッジ上乗せ | 上乗せ特化 | 短時間・高純度の上乗せ | 10G固定・平均+2セット、最大+10セット | AS_RUSH中 スイカ5%/チャンス目8%/強チェリー15% / 滞在型ゾーン中のネスト当選(強チェリー6%/サメ25%/ゴースト30%) |
| M14 | Kinesis 上乗せストリーム | 上乗せ特化 | シャード数ぶんの上乗せが順に流れる | シャード数1〜10・シャードごとに上乗せレコード | AS_RUSH中 スイカ3%/チャンス目5%/強チェリー10%/サメ20% / 滞在型ゾーン中のネスト当選(サメ15%/ゴースト50%) |
| M15 | Step Functions チャレンジ | 上乗せ特化 | 唯一のプレイヤー選択モード | 最大8ステート・Task成功率70%で+1セット・全制覇でMULTI_REGION直行 | AS_RUSH中 サメ揃い10% / ゴースト揃い50% |
| M16 | Serverless RUSH | 上位AT | DC管理から解放される安定上位 | 1セット20G・純増4枚・継続率80%固定 | AS_RUSH中 サメ揃い30%(昇格抽選) / 5セット連続継続 / ゴースト揃い20%(ゾーンを介さず直接) |
| M17 | Multi-Region アクティブ・アクティブ | 上位AT | 最上位AT。全レア役で上乗せ確定 | 1セット20G・純増6枚・継続率85%・全レア役で+1セット確定 | Serverless RUSH中 ゴースト揃い100% / Step Functions全制覇(popThenTo) |
| M18 | ホットスタンバイ(Multi-AZ) | 引き戻し層 | RUSH終了時の第一防衛 | 10G・成功率35%・成功で元のATへ復帰(DC+2) | AS_RUSH/Serverless RUSH/Multi-Regionのセット非継続(DC枯渇・スロットリング・リージョン障害) |
| M19 | Route 53 フェイルオーバー | 引き戻し層 | 最後の砦 | 3G・成功率10%・成功で元のATへ復帰(DC+1) | ホットスタンバイ失敗時 |
| M20 | re:Invent キーノート | エンディング | 完走エンディング。全状態リセット | 30G・純増3枚・3Gごとに新サービス発表(最大10個) | 差枚+2222到達 または ATセット累計15到達(どのモードからでも強制遷移、条件達成後はカウンタをリセットして再度計測) |

**表の注記**:
- 「AT累計15セット」は AT層(`AS_RUSH` / `SERVERLESS_RUSH` / `MULTI_REGION`)のセット消化数の合計(`modeMachine.atSetCount`)。通常時(`FREE_TIER`)へ完全に落ちた時点で 0 にリセットされる(`ModeMachine._push()` 内、AT当選をまたいで累積しないようにするため)。
- ボーナス中の「ベルが高確率で揃い1回成立につき+15枚」は、旧仕様(固定純増N枚/G)からの変更点。`src/data/modes.js` のボーナス仕様(`BONUS_SPECS`)反映は別担当が並行実装中のため、値が未反映のままの場合は本表の新値を正として扱うこと。
