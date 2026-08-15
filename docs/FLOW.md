# JAWSLOT -ジョースロット- ゲームフロー図

> **表示名は「JAWSLOT -ジョースロット-」**(U45 / 2026-08-15)。
> コード上の識別子(`window.AWSLOT`)・ディレクトリ名・内部名は **AWSLOT のまま**。
> 改名するのはプレイヤーに見える文言だけ。

> **このドキュメントは実装コード(`src/data/session.js` / `src/data/modes.js` / `src/data/transitions.js` /
> `src/game/flow.js` / `src/game/modemachine.js` / `src/game/modes/*.js`)を正として作成している。**
> `docs/DESIGN.md` の数値・構成と食い違う箇所があれば、こちらが 2026-08-13 時点の実装済みの実際の挙動。
> 数値は `src/data/modes.js` 等の**現在値をそのまま転記**しており、今後の調整で変わりうる。
> 見た瞬間に古くなる資料なので、**数値の最終的な正はコード**であることを前提に読むこと。

2026-08-13 の1日で本機は次の3点が大きく変わった。旧版(初期実装ベース)の本ドキュメントはこれらを反映していなかったため全面更新している。

1. **100回転スコアアタック化**(`src/data/session.js`) — 「延々回す」台から「100回転で決着する」台になった。通常時・CZ・ボーナス・AT・派生ゾーンを問わず、レバーONを通算で数え、使い切ると残存価値を買い取ってリザルトへ。
2. **BONUS_READY(入賞待ち)の新設** — ボーナスは当選した瞬間には始まらず、まず入賞待ちへ入って GHOST7 / サメBAR を揃えてから消化が始まる(全ボーナス経路の入口ゲート)。
3. **引き戻しの1段化** — ホットスタンバイ → Route 53 の2段構成をホットスタンバイ1段に統合。Route 53 はハンドラのみ残る退役モード。

このほか、通常時のCZ導線が「レア役で直接CZ」から「ステージ(高確/激アツ)を経由してCZ」へ主役交代したこと、前兆システム・DeepRacer擬似連・「最初に止めるリール」3択演出(U53。旧AWSクイズルーレットの後継)が追加されたことも本ドキュメントに反映している。

---

## 1. 全体モード遷移図

到達可能なモードハンドラは `src/game/modemachine.js` の `MODE_HANDLERS` に18種類登録されている。うち `CZ` は `czId` で**8種**、`BONUS` は `bonusId` で3種、RUSH は4種に分かれるため、実質的な「モード」の数はDESIGN.mdの言う20種から増えて**27種(到達可能26 + 退役1)**になっている。退役モード(`ROUTE53_FAILOVER`)は点線で載せ、通常プレイでは通らないことを明記する。

### 1a. 幹図(通常時 → CZ → 入賞待ち → ボーナス → AT → 引き戻し → エンディング)

```mermaid
flowchart TD
  subgraph NORMAL["■ 通常時(FREE_TIER)"]
    FREE_TIER["通常ステージ / サミット会場 / Invent会場<br/>内部状態3段階(CZ倍率 x1.0 / x2.0 / x4.0)<br/>天井75G Auto Recovery"]
  end

  subgraph CZLAYER["■ CZ層(8種の格差ラダー、振分29/20/16/11/8/7/5/4パーセント)"]
    CZ_CW["CloudWatch アラートCZ<br/>3G・突破30パーセント・星1"]
    CZ_SQS["SQS デッドレター再処理CZ<br/>3G・突破26パーセント・星1<br/>DLQを空にできれば突破"]
    CZ_ALB["ALB ターゲットグループCZ<br/>4G・突破42パーセント・星2<br/>全台healthyでHTTP200"]
    CZ_TA["Trusted Advisor CZ<br/>5G・突破50パーセント・星2<br/>6項目全緑で突破"]
    CZ_SFN["Step Functions CZ<br/>5G・突破55パーセント・星2<br/>Success State到達で突破"]
    CZ_CD["CodeDeploy Blue Green CZ<br/>5G・突破62パーセント・星2<br/>100パーセントシフト完了で突破"]
    CZ_FIS["GameDay CZ FIS障害注入<br/>5G・突破72パーセント・星3<br/>障害5つを耐え切れば突破"]
    CZ_WA["Well-Architected CZ<br/>18G・突破85パーセント・星3<br/>子役で柱を6本積む参加型・全柱でSP確定35パーセント"]
  end

  subgraph READYLAYER["■ 入賞待ち(全経路の入口ゲート)"]
    BONUS_READY["BONUS 入賞待ち<br/>GHOST7 または サメBARを揃える<br/>平均1.6G ハズレ時のみ引き込み"]
  end

  subgraph BONUSLAYER["■ ボーナス層(3種)"]
    BONUS_LAMBDA["シャークボーナス<br/>6G・RUSH当選率12パーセント"]
    BONUS_S3["ゴーストボーナス<br/>8G・RUSH当選率45パーセント"]
    BONUS_DYNAMO["ゴーストボーナスSP<br/>1セット6G・継続率50パーセント<br/>RUSH当選率85パーセント"]
  end

  subgraph ATLAYER["■ RUSH 4種(U11。伸びる軸が1本ずつ違う)"]
    AS_RUSH["オートスケーリングRUSH<br/>EC2の台数イコール残りゲーム数・純増35枚固定<br/>レア役でオートスケール(弱チェ2台からゴースト22台)<br/>通算22Gで頭打ち(一撃770枚)"]
    CF_RUSH["CloudFront RUSH<br/>18G固定・毎ゲーム95パーセントで直接払い出し<br/>1回5から50枚・レア役で確定クレジット"]
    AURORA_RUSH["Aurora RUSH<br/>初期8G・ACU30から70<br/>レア役でACU(純増)アップかつ残りプラス1G<br/>通算15Gで頭打ち"]
    HERO_RUSH["ヒーローRUSH(振分2パーセントのプレミア)<br/>5G固定・毎ゲーム2分の1で50枚<br/>レア役でプラスアルファ(確定役なら300から500枚)"]
  end

  subgraph ZONELAYER["■ 派生・上乗せゾーン(詳細は図1b)"]
    DERIVED_ZONES["滞在型4種 プラス 上乗せ特化3種<br/>AS_RUSHの上に積まれる"]
  end

  subgraph UPPERATLAYER["■ 上位AT"]
    SERVERLESS_RUSH["Serverless RUSH<br/>1セット5G・純増16枚固定・継続率86パーセント<br/>小役成立で残りプラス1G"]
    MULTI_REGION["Multi-Region アクティブ アクティブ<br/>1セット5G・純増24枚固定・継続率88パーセント<br/>全レア役で上乗せ確定"]
  end

  subgraph RECOVERYLAYER["■ 引き戻し層(1段のみ)"]
    HOT_STANDBY["ホットスタンバイ Multi-AZ<br/>5G(レア役でプラス1G 上限15G)・成功率55パーセント<br/>成功で復旧のゴーストボーナスSPへ"]
    ROUTE53["【退役】Route 53 フェイルオーバー<br/>通常プレイでは到達しない"]
  end

  subgraph ENDINGLAYER["■ エンディング"]
    REINVENT_ED["re:Invent キーノート<br/>5G・純増20枚固定"]
  end

  FREE_TIER -->|"チャンス目とサメ揃いでCZ確定 U72 その他はステージ毎G抽選のおまけ 振分22パーセント"| CZ_CW
  FREE_TIER -->|"振分20パーセント"| CZ_SQS
  FREE_TIER -->|"振分16パーセント"| CZ_ALB
  FREE_TIER -->|"振分11パーセント"| CZ_TA
  FREE_TIER -->|"振分8パーセント"| CZ_SFN
  FREE_TIER -->|"振分7パーセント"| CZ_CD
  FREE_TIER -->|"振分5パーセント"| CZ_FIS
  FREE_TIER -->|"振分4パーセント"| CZ_WA
  FREE_TIER -->|"78G消化 Auto Recovery 突破確定で送り込み 5G保証版"| CZ_WA
  FREE_TIER -->|"ボーナス直撃 U72 MELON0.35 STRONG_CHERRY2.0 GHOST100パーセント チャンス目の直撃は廃止"| BONUS_READY
  FREE_TIER -->|"RUSH直撃 STRONG_CHERRY0.175 SHARK0.85パーセント レバーONフリーズも直結 種別は振り分け"| ATLAYER

  CZ_CW -->|"突破30パーセント 振分86 12 2パーセント"| BONUS_READY
  CZ_CW -->|"失敗70パーセント"| FREE_TIER
  CZ_SQS -->|"突破26パーセント 振分90 9 1パーセント"| BONUS_READY
  CZ_SQS -->|"失敗74パーセント"| FREE_TIER
  CZ_ALB -->|"突破42パーセント 振分80 18 2パーセント"| BONUS_READY
  CZ_ALB -->|"失敗58パーセント"| FREE_TIER
  CZ_TA -->|"突破50パーセント 振分62 30 8パーセント"| BONUS_READY
  CZ_TA -->|"失敗50パーセント"| FREE_TIER
  CZ_SFN -->|"突破55パーセント 振分58 32 10パーセント"| BONUS_READY
  CZ_SFN -->|"失敗45パーセント"| FREE_TIER
  CZ_CD -->|"突破62パーセント 振分58 33 9パーセント"| BONUS_READY
  CZ_CD -->|"失敗38パーセント 自動ロールバック"| FREE_TIER
  CZ_FIS -->|"突破72パーセント 振分42 40 18パーセント"| BONUS_READY
  CZ_FIS -->|"失敗28パーセント SLO違反"| FREE_TIER
  CZ_WA -->|"突破85パーセント 振分30 45 25パーセント 全柱金でSP確定"| BONUS_READY
  CZ_WA -->|"失敗15パーセント"| FREE_TIER

  BONUS_READY -->|"図柄が揃った瞬間(種別はCZ内訳/直撃振分で決定済み)"| BONUSLAYER

  BONUS_LAMBDA -->|"ボーナス中の子役契機で当選 総合12パーセント"| ATLAYER
  BONUS_LAMBDA -->|"非当選 高確から再開"| FREE_TIER
  BONUS_S3 -->|"ボーナス中の子役契機で当選 総合45パーセント"| ATLAYER
  BONUS_DYNAMO -->|"セット継続50パーセント"| BONUS_DYNAMO
  BONUS_DYNAMO -->|"ボーナス中の子役契機で当選 総合85パーセント"| ATLAYER

  AS_RUSH -->|"派生ゾーン当選(レア役ごとに抽選)"| DERIVED_ZONES
  DERIVED_ZONES -->|"ゾーン終了 pop"| AS_RUSH
  DERIVED_ZONES -->|"Step Functions全制覇 popThenTo"| MULTI_REGION
  AS_RUSH -->|"サメ揃い30パーセント直接昇格"| SERVERLESS_RUSH
  ATLAYER -->|"残りゲーム数が尽きた"| HOT_STANDBY

  SERVERLESS_RUSH -->|"レア役契機(GHOST100 SHARK80 STRONG_CHERRY35パーセント等)プラス継続時25パーセント抽選"| MULTI_REGION
  SERVERLESS_RUSH -->|"セット非継続 継続率86パーセント"| HOT_STANDBY
  MULTI_REGION -->|"セット非継続 継続率88パーセント"| HOT_STANDBY

  HOT_STANDBY -->|"成功82パーセント 復旧のゴーストボーナスへ そこでレア役を引けば45パーセントでRUSH"| ATLAYER
  HOT_STANDBY -->|"成功82パーセント 復旧のゴーストボーナスへ"| UPPERATLAYER
  HOT_STANDBY -->|"失敗18パーセント"| FREE_TIER
  HOT_STANDBY -.->|"【退役】直撃デバッグ専用。通常到達しない"| ROUTE53

  ATLAYER -.->|"差枚プラス1500 またはATセット計4到達(強制)"| REINVENT_ED
  UPPERATLAYER -.->|"差枚プラス1500 またはATセット計4到達(強制)"| REINVENT_ED
  REINVENT_ED -->|"5G消化・全状態リセット"| FREE_TIER
```

**読み方の補足**:
- `BONUS_READY` は `src/game/modemachine.js` の `ENTRY_GATE = { BONUS: 'BONUS_READY' }` で強制される「必ずここを経由する入口」。CZ突破・直撃・前兆やDeepRacer擬似連の当選など、ボーナスへ向かう経路がどれだけ増えても、`_push('BONUS', ...)` は自動的に `BONUS_READY` へ差し替わるので個別に直す必要がない。
- CZ・ボーナスとも「種別振り分け」はモードに入った時点(`onEnter`)で確定しており、`BONUS_READY` はどの絵柄を揃えさせるかを `state.targetSymbol` で持つだけ。図中では矢印の煩雑化を避けるため、CZ8種→`BONUS_READY` への矢印は各CZから1本ずつにとどめている(内訳は各CZのラベルに記載)。
- **前兆システム**(`src/data/zencho.js` / `src/game/modes/freetier.js`): 当選(CZ/AT/BONUS)は即座に画面が変わらず、本前兆(2〜5G、当選を保持)を挟んでから告知する。非当選中も 1/40 の確率でガセ前兆(2〜4G)が発生し、前兆中に当選するとガセ→本前兆へ格上げされる(当選を持ったまま格が下がることはない)。**DeepRacer擬似連**は前兆パターンの1つで、step3到達(到達率約29%)で50%の確率でCZへ移行、step4到達(約9%)でボーナス確定、さらに擬似連中にレア役を引くと即ボーナス確定へ格上げされる。
- **「告知→次スピンで移行」の原則**(`onNextSpin`): 当選告知・CZ結果・天井到達・DC全滅・引き戻し成否は、すべて**告知が起きたモードの画面のまま**そのゲームを終え、**次にレバーを引いた瞬間**に新モードへ入る(3章で詳述)。図の矢印はすべてこの原則に従う。
- エンディング条件(`ending_cond`)はどのモードにいても毎ゲーム `GameFlow._checkEnding()` が判定しており、成立すると `modeMachine.forceMode('REINVENT_ED')` でスタックごと畳んで強制遷移する(図中の破線矢印)。図では代表して `ATLAYER` / `UPPERATLAYER` からの矢印にしているが、実際は通常時・CZ・ボーナス中でも判定は走る(到達しうるのは主に差枚が伸びやすいAT系)。
- ホットスタンバイの「元のATへ復帰」は、転落前にいたAT(`AS_RUSH` / `SERVERLESS_RUSH` / `MULTI_REGION`)を `resumeMode` パラメータで覚えておいて戻す実装(`src/game/modes/recovery.js` の `resumeTransition()`)。復帰・転落のどちらも `onNextSpin` で、結果演出(切替完了 / RTO超過)を見せ切ってから次のレバーONで遷移する。

### 1b. 派生・上乗せゾーン拡大図(AS_RUSH の上に積まれるモード群)

```mermaid
flowchart TD
  AS_RUSH["Auto Scaling RUSH(母体AT)"]
  SERVERLESS_RUSH["Serverless RUSH"]
  MULTI_REGION["Multi-Region アクティブ アクティブ"]

  subgraph STAY["滞在型ゾーン(自身の純増で消化)"]
    SPOT_ZONE["Spot インスタンスゾーン<br/>純増16・最低6G保証<br/>1/12で中断通知プラス2G後強制終了 平均12G"]
    EC2_BURST["EC2 バーストモード<br/>純増11・クレジット60初期<br/>毎Gマイナス5、レア役で回復 上限90 平均12G"]
    GRAVITON["Graviton モード<br/>純増6・1セット8G・継続率72パーセント"]
    RESERVED["Reserved Instance ゾーン<br/>1年プラス5G保証80パーセント / 3年プラス10G保証20パーセント<br/>ヘルスチェック免除・純増は母体準拠"]
  end

  subgraph BOOST["上乗せ特化ゾーン(枚数の直接上乗せが中心)"]
    CLOUDFRONT["CloudFront エッジ上乗せ<br/>8G固定・毎Gコイン抽選 0から60枚 平均プラス60枚"]
    KINESIS["Kinesis 上乗せストリーム<br/>シャード数1から10ぶんのコイン上乗せ 5から60枚<br/>60枚レコードで母体プラス1セットも付く"]
    STEP_FUNCTIONS["Step Functions チャレンジ<br/>最大5ステート・プレイヤー選択 左 右<br/>Task成功率70パーセントでDCプラス1"]
  end

  AS_RUSH -->|"MELON30 CHANCE38 STRONG_CHERRY38パーセント"| CLOUDFRONT
  AS_RUSH -->|"MELON20 CHANCE26 STRONG_CHERRY28 SHARK20パーセント"| KINESIS
  AS_RUSH -->|"CHANCE12パーセント"| GRAVITON
  AS_RUSH -->|"STRONG_CHERRY10パーセント"| RESERVED
  AS_RUSH -->|"STRONG_CHERRY6 SHARK25 GHOST50パーセント"| STEP_FUNCTIONS
  AS_RUSH -->|"SHARK30 GHOST30パーセント"| SPOT_ZONE
  AS_RUSH -->|"STRONG_CHERRY18 SHARK25パーセント"| EC2_BURST
  AS_RUSH -->|"SHARK30パーセント 昇格抽選、ゾーンより先に判定"| SERVERLESS_RUSH
  AS_RUSH -->|"GHOST20パーセント ゾーンを介さずSERVERLESS_UP"| SERVERLESS_RUSH

  STAY -->|"ゾーン終了 pop、AS_RUSHへ復帰"| AS_RUSH
  BOOST -->|"上乗せ消化終了 pop、AS_RUSHへ復帰"| AS_RUSH

  STAY -->|"滞在中にネスト当選 push、3段目 STRONG_CHERRY6 SHARK系25/15 GHOST系50/30パーセント"| BOOST

  STEP_FUNCTIONS -->|"5ステート全制覇 popThenTo、母体ATごとMULTI_REGIONへ差替"| MULTI_REGION
```

**読み方の補足**:
- `RESERVED` はネスト対象外(`src/game/modes/zones.js` の `reserved.onGame` に `nestedZone()` 呼び出しがない)。上乗せ特化ゾーンへ二重当選するのは `SPOT_ZONE` / `EC2_BURST` の2つだけ(`GRAVITON` はテーブル未定義のため実質ネストしない)。
- 派生ゾーンへの突入は `AS_RUSH` 中のみ実装されている(`SERVERLESS_RUSH` / `MULTI_REGION` 中はゾーン抽選そのものが存在しない。両モードとも「レア役=昇格 or 上乗せ確定」で完結する)。
- `STEP_FUNCTIONS` の全制覇だけが唯一 `popThenTo` を使う特殊な遷移(自分を畳んでから、親の `AS_RUSH` ごと `MULTI_REGION` に差し替える)。派生ゾーンで積んだ上乗せストック(`stock`)は差し替え後の `MULTI_REGION` へそのまま引き継がれる。
- 上乗せ特化ゾーン(`CLOUDFRONT` / `KINESIS` / `STEP_FUNCTIONS`)は旧仕様の「母体セット数への上乗せ」から、100回転スコアアタック化(2026-08-13)で**枚数の直接上乗せ + 純増ブースト(DC)中心**へ作り替えられている。50〜100回転しか持ち時間がないため、G数上乗せは消化しきれず数字遊びになるという判断による。

---

## 2. 100回転スコアアタックのライフサイクル

本機は「延々回す」台ではなく、**通算100回転で1プレイが終わるスコアアタック**(`src/data/session.js`)。通常時・CZ・ボーナス・AT・派生ゾーンのどこにいても、レバーONのたびに `GameFlow.session.remaining` が減っていく(モードごとの知識を持たないカウンタ)。

```mermaid
flowchart TD
  START(["restart 呼び出し<br/>クレジット50枚にリセット・統計初期化<br/>modes.start FREE_TIER"]) --> LOOP

  LOOP["1ゲームずつ進行<br/>通常時 CZ ボーナス AT 派生ゾーン 引き戻し エンディングを回遊<br/>(詳細は図1a 1b)"]
  LOOP -->|"レバーONのたびに session.remaining をマイナス1<br/>(どのモードにいても通算で数える)"| CHECK{"remaining が0以下か"}
  CHECK -->|"No、続行"| LOOP
  CHECK -->|"Yes、PAYOUT処理内で判定"| SETTLE["保留中の遷移を先に確定<br/>_settlePendingTransition"]

  SETTLE --> BUYOUT["残存価値の買い取り<br/>collectResidualValue でスタックを下から合算<br/>入賞待ち残 ボーナス残G AT残Gとストック<br/>ゾーン残り 契約保証残り 等"]
  BUYOUT --> FORCE["forceMode RESULT<br/>モードスタックを丸ごと畳む"]
  FORCE --> RESULT(["RESULT 画面<br/>最終スコア 買い取り内訳 戦績を表示<br/>終端状態、ゲームは進行しない"])

  RESULT -->|"R キー / 上キー / もう一度ボタン"| START
```

**読み方の補足**:
- **買い取る/買い取らない基準**(`src/data/session.js` 冒頭コメント): 残ゲーム数×現在純増や確定済みストックのように「**既に所有している権利**」は買い取る。一方、セット継続抽選の期待値や CZ の突破期待値のように「**まだ引いていない権利**」は買い取らない(買うと「終了間際にCZへ入るのが一番得」という歪みが出るため)。
- `collectResidualValue()`(`src/game/modemachine.js`)はモードスタックを下から順に舐め、各ハンドラの `residualValue(state, ctx)` を合算するだけで、モード固有の知識を持たない(`game/` → `data/` の依存方向を保つ設計)。派生ゾーン・上乗せ特化ゾーンは母体ATの純増(`ctx.host`)を必要とするため、買い取り計算にもホストを渡す。
- エンディング(`REINVENT_ED`)はセッション内で複数回起こりうる**別イベント**。差枚+1500やATセット計4に達するたびに発火し、5G消化して `FREE_TIER` へ戻る。エンディング中に100回転を使い切った場合も、残りG(`residualValue`)がそのまま買い取り対象になる。
- リザルト表示中(`session.ended = true`)は `GameFlow.canBet` が `false` を返すため新しいBETは受け付けない。`GameFlow.play()` が `session.ended` を見て自動的に `restart()` を呼ぶため、R/↑キー/筐体のワンボタン操作のどれでも次のセッションへ進める。
- `restart()` のたびに `session.index` がインクリメントされ、クレジットは常に `SESSION.startCredit = 50` から再スタートする(スコアは差枚 `credit.diff` で見るため初期クレジットの値そのものに意味はない)。

---

## 3. 1ゲームの流れ

`GameFlow`(第1層ステートマシン)の `IDLE → BET → READY → SPINNING → JUDGE → PAYOUT → TRANSITION → IDLE` を1本のレーンで表し、演出システム(`EventBus` 購読側)がどのタイミングでイベントを拾うかを1ノードにまとめている。

```mermaid
flowchart LR
  BET["MAX BET<br/>クレジットマイナス3<br/>不足時は自動投入"] --> LEVER["レバーON<br/>ここで全抽選が確定<br/>小役 CZ ボーナス AT直撃 ゾーン DC変動<br/>+ 保留していたスピン境界の遷移をここで確定"]
  LEVER --> SPIN["3リール回転<br/>SPINNING"]
  SPIN --> STOP1["第1停止"] --> STOP2["第2停止"] --> STOP3["第3停止<br/>最大4コマ滑り"]
  STOP3 --> JUDGE["入賞判定<br/>中段横一直線"]
  JUDGE --> PAYOUT["払出アニメ<br/>1枚ずつ加算"]
  PAYOUT --> MODE["モード更新<br/>modeMachine.onGame<br/>G数消化 セット末判定 モード遷移<br/>エンディング判定 セッション終了判定"]
  MODE --> IDLE["IDLE<br/>次ゲーム入力待ち"]

  EVENTS["演出システム EventBus購読 一方向依存<br/>bet leverOn stop1から3 judge<br/>payoutStart payoutEnd modeEnter modeExit<br/>setEnd paramChange"]
  BET -.->|"emit bet"| EVENTS
  LEVER -.->|"emit leverOn 結果確定後"| EVENTS
  STOP1 -.->|"emit stop1 stop2 stop3"| EVENTS
  JUDGE -.->|"emit judge"| EVENTS
  PAYOUT -.->|"emit payoutStart payoutEnd"| EVENTS
  MODE -.->|"emit modeEnter modeExit setEnd paramChange"| EVENTS
```

**読み方の補足**:
- 抽選(小役・CZ当選・ボーナス種別・AT直撃・スケールアウト等)はすべて「レバーON」の時点で確定する(`GameFlow.leverOn()` → `drawFlag()`)。以降のリール停止・演出はすべて「もう決まった結果」を表現するだけ(DESIGN.md 4.2「演出は結果を先に知っている」)。
- **告知は次スピンで移行の原則**: `leverOn()` の冒頭で `_settleSpinTransition()` が呼ばれ、`onNextSpin` 指定の保留中の遷移(CZ結果・天井到達・前兆の結果告知・ボーナス非当選・DC全滅・引き戻し成否など)をここで確定させる。つまり「告知ゲームは元の画面のまま終わり、告知を見てから自分でレバーを引いた瞬間が新モードの1ゲーム目になる」。演出側からの遷移操作は一切なく、`GameFlow` が機械的に処理しているだけの点に注意。
- 演出側からゲーム状態を書き換えることは一切ない(`game/` は `render/` と `staging/` を import しない一方向依存)。
- 停止ボタンは `SPINNING` 中は通常の停止操作だが、`Step Functions チャレンジ` の分岐選択待ち(`modeMachine.awaitingChoice`)中は左/右ボタンがそのまま選択肢(A/D)として扱われる兼用ボタンになる(8秒間押されなければ既定で左を自動選択)。
- **「最初に止めるリール」3択演出**(`src/data/scenarios/quiz.js` / U53・2026-08-15)はゲームロジックそのものには影響しない後付けの見せ方だが、進行は**リール停止と同期**している: 告知が起きたゲームで「どのリールから止める?」の3択を出し、**プレイヤーが実際に最初に止めたリール**(新しい選択UIは作らず、既存の停止操作をそのまま入力に使う)を受けて**第1停止で正解/不正解を発表**する。どのリールが正解だったかは結果に合わせた**後決め**(実機の押し順当てと同じ)で、当落そのものは `modeEnter: CZ`(正解=当選確定)や `zencho_end: MISS`(不正解=非当選確定)といった「結果が既に確定しているイベント」にしか演出を貼っていないため、抽選結果と矛盾する見た目にはならない。
  - この枠は元々 **AWSクイズルーレット**(出題→4択が回る→正解ならCZ)だった。U53 で発生を止めたが、**46問のデータ(`src/data/quiz.js`)と盤面描画(`aws_quiz_roulette`)は休止中のまま保全**してある(シナリオを書き戻せば復帰できる)。

---

## 4. モードスタックの入れ子図

派生ゾーン(滞在型・上乗せ型)は「親モードの上に積む」構造になっており、`ModeMachine` は単一モードではなく**スタック(深さ上限3)**を持つ。

```mermaid
flowchart TD
  L1["深さ1 AS_RUSH 母体AT"] -->|"push 派生ゾーン当選"| L2["深さ2 SPOT_ZONE等 滞在型<br/>または CLOUDFRONT等 上乗せ型"]
  L2 -->|"push 滞在型ゾーン中のネスト上乗せ当選<br/>SPOT_ZONE EC2_BURSTのみ"| L3["深さ3 CLOUDFRONT KINESIS<br/>上限3、4段目は最上段を畳んで置換"]
  L3 -->|"pop 上乗せ消化終了、親へ復帰"| L2
  L2 -->|"pop ゾーン終了、親 AS_RUSH へ復帰"| L1
  L2 -->|"popThenTo Step Functions 全制覇<br/>自分を畳んでから親ごと差し替え"| L1B["深さ1 MULTI_REGION に差替済み"]
```

**読み方の補足**:
- 通常の `pop` は「自分を畳んで、1つ下の親に制御を戻すだけ」(`ModeMachine._pop()`)。親のモードそのものは変わらない。
- `popThenTo` は `Step Functions チャレンジ`(深さ2)全制覇だけが使う特殊遷移で、「自分を畳んだ上で、さらに1つ下の親モードごと `MULTI_REGION` に差し替える」(`ModeMachine._popThenReplace()`)。結果としてスタックの深さは1に戻り、そこに `MULTI_REGION` が乗る。
- スタック上限は `MAX_STACK_DEPTH = 3`(`src/game/modemachine.js`)。上限に達した状態でさらに `push` しようとすると、最上段を畳んでから置換する安全弁が働く(`stackGuardHits` でデバッグ計測)。
- セッション終了時の残存価値買い取り(2章)は、このスタックを下から順に舐めて各段の `residualValue()` を合算する。深さ2・3のゾーンに乗ったまま100回転を使い切っても、積んだ分はすべて買い取り対象になる。

---

## 5. モード早見表

`src/game/modemachine.js` の `MODE_HANDLERS` に登録済みの21ハンドラ(U11 で RUSH が4種に分かれた)(CZが8種・BONUSが3種に枝分かれするため実質26到達可能 + 退役1)。数値は `src/data/modes.js` 等の現在値(2026-08-14 バランス調整後)。**実装が正**であり、この表はスナップショットに過ぎない。

| # | モード / ID(内訳) | 層 | 役割 | 主要スペック(現在値) | 突入契機 |
|---|---|---|---|---|---|
| M01 | 通常ステージ等 / `FREE_TIER` | 通常時 | メイン待機画面。内部状態3段階でCZ確率が変動 | COLD_START(通常)×1.0 / WARM_POOL(高確)×2.0 / PROVISIONED(激アツ)×4.0、高確/激アツ滞在中は毎G抽選(5%/20%)、転落率3%/8%(激アツ平均9G・高確平均17G)、天井**75G**「Auto Recovery」で最上位CZ確定 | ゲーム開始 / 各所からの転落先 |
| M02 | CloudWatch アラートCZ / `CZ`(czId=CW_ALARM) | CZ層 | 入門CZ。折れ線グラフが閾値を超えれば突破 | 3G・突破率30%・CZ内振分29%・期待度★☆☆・突破時ボーナス振分86/12/2% | 通常時レア役 or ステージ毎G抽選でCZ当選→振分抽選 |
| M02b | SQS デッドレター再処理CZ / `CZ`(czId=SQS_REDRIVE) | CZ層 | 最弱・最頻枠。**カウントダウン型**。DLQを空にできれば突破 | 3G・突破率26%・CZ内振分20%・期待度★☆☆・突破時ボーナス振分90/9/1% | 同上 |
| M02c | ALB ターゲットグループCZ / `CZ`(czId=ALB_CZ) | CZ層 | 3台のターゲットを全部 healthy にして HTTP 200 | 4G・突破率42%・CZ内振分16%・期待度★★☆・突破時ボーナス振分80/18/2% | 同上 |
| M03 | Trusted Advisor CZ / `CZ`(czId=TRUSTED_ADVISOR) | CZ層 | 6カテゴリのチェックリスト。**全緑でボーナス確定** | 5G・突破率50%・CZ内振分11%・期待度★★☆・突破時ボーナス振分62/30/8% | 同上 |
| M04 | Step Functions CZ / `CZ`(czId=SFN_CZ) | CZ層 | ワークフローが自動進行。Success Stateまで流れきれば突破 | 5G・突破率55%・CZ内振分8%・期待度★★☆・突破時ボーナス振分58/32/10% | 同上 |
| M04b | CodeDeploy Blue/Green CZ / `CZ`(czId=CODEDEPLOY_BG) | CZ層 | Greenへ100%シフトで突破。失敗は自動ロールバック | 5G・突破率62%・CZ内振分7%・期待度★★☆・突破時ボーナス振分58/33/9% | 同上 |
| M04c | GameDay CZ(FIS 障害注入)/ `CZ`(czId=FIS_GAMEDAY) | CZ層 | 唯一の**防御型**。障害5つを耐え切れば突破 | 5G・突破率72%・CZ内振分5%・期待度★★★・突破時ボーナス振分42/40/18% | 同上 |
| M05 | Well-Architected CZ / `CZ`(czId=WELL_ARCHITECTED) | CZ層 | 最上位CZ。**子役で柱を積む参加型**(U10)。全立ちでSP確定率35% | 18G・突破率85%(理論84.98% / 実測75%※)・CZ内振分4%・期待度★★★・突破時ボーナス振分30/45/25% | 同上 / 通常時**75G**天井到達で確定(この場合だけ5G・突破保証) |
| M06 | BONUS 入賞待ち / `BONUS_READY` | 入口ゲート | ボーナス種別ごとの絵柄を揃えるまでの区間。全ボーナス経路が必ず通過する | GHOST7(BIG系)またはサメBAR(REG)を揃える。小役成立時は揃わずハズレ時のみ引き込み、平均1.6G | CZ突破 / 直撃 / 前兆・DeepRacer当選のすべて(`ENTRY_GATE` で自動的に経由) |
| M07 | シャークボーナス / `BONUS`(bonusId=LAMBDA_REG) | ボーナス層 | 軽量・テンポ優先の枠 | **6G**・ベル高確率で揃い1回成立につき約9.7枚純増(平均+57枚)・RUSH当選率12% | BONUS_READYで図柄が揃う |
| M08 | ゴーストボーナス / `BONUS`(bonusId=S3_BIG) | ボーナス層 | 王道。RUSHへの本線 | **8G**(平均+76枚)・RUSH当選率45%・非当選時は高確スタート | 同上 |
| M09 | ゴーストボーナスSP / `BONUS`(bonusId=DYNAMO_BIG) | ボーナス層 | セット継続型の重量級 | **1セット6G**・継続率50%(平均1.8セット・+101枚)・RUSH当選率85% | 同上 |
| M10 | オートスケーリングRUSH / `AS_RUSH` | RUSH(ゲーム数特化) | **EC2の台数がそのまま残りゲーム数**。**レア役**でオートスケールして伸びる | 初期8〜44台(平均18.59 / U72)・純増**15枚**固定(U72)・上乗せは弱チェ+1、スイカ/チャンス目+2、強チェ+3、サメ+6、ゴースト+11(期待+0.280G/G)・**通算52Gで頭打ち** ⇒ 平均22.8G・**中央値270枚 / 平均335枚 / p99 780枚** | ボーナス中の**レア役**契機でRUSH当選 → 振分50% / 通常時直撃 / 引き戻し成功 |
| M10b | CloudFront RUSH / `CF_RUSH` | RUSH(直接払い出し) | 毎ゲーム抽選でクレジットが飛んでくる。ゲーム数は固定 | **18G固定**・毎ゲーム**95%**でヒット(**5/10/15/20/30/50枚**の重み抽選 = 90%が5〜20枚)・**レア役**成立で確定クレジット(弱チェ10 / スイカ・チャンス目15 / 強チェ30 / サメ・ゴースト50枚)⇒ 約15.7枚/G・**中央値279枚 / 平均281枚 / p99 405枚**。U67 で **1回の払い出しは必ず5〜50枚** | 同上 → 振分25% |
| M10c | Aurora RUSH / `AURORA_RUSH` | RUSH(純増特化) | **レア役**でACU(純増)がスケールアップし、ゲーム数も+1 | 初期8G・ACU**30**スタート(**上限70**)・レア役でACU+17〜+40かつ残り+1G(**通算15Gで頭打ち**)⇒ 平均8.7G・**中央値240枚 / 平均331枚 / p99 724枚** | 同上 → 振分23% |
| M10d | ヒーローRUSH / `HERO_RUSH` | RUSH(プレミア) | 5G固定の一発勝負。毎ゲーム 50% で50枚(U76) | 5G固定・毎ゲーム**50%**で**50枚**・**レア役**成立で+10〜30枚(確定役は+300/+500枚)⇒ 約28.7枚/G・**中央値130枚 / 平均140枚 / p99 710枚** | 同上 → 振分2%(フリーズ/ボーナス中ゴースト揃いのプレミア振分では25%) |
| M11 | Spot インスタンスゾーン / `SPOT_ZONE` | 派生ゾーン(滞在型) | 爆発型。中断リスクと表裏一体 | 純増16枚・最低6G保証・1/12で中断通知→2G後強制終了(平均約12G) | AS_RUSH中 SHARK 30% / GHOST 30% |
| M12 | EC2 バーストモード / `EC2_BURST` | 派生ゾーン(滞在型) | クレジット消費型の爆発モード | 純増11枚・クレジット60初期・毎G-5、レア役で回復(上限90、平均約12G) | AS_RUSH中 STRONG_CHERRY 18% / SHARK 25% |
| M13 | Graviton モード / `GRAVITON` | 派生ゾーン(滞在型) | 安定型。低純増・高継続 | 純増6枚・1セット8G・継続率72% | AS_RUSH中 CHANCE 12% |
| M14 | Reserved Instance ゾーン / `RESERVED` | 派生ゾーン(滞在型) | ゲーム数保証。ヘルスチェック免除 | 1年契約=+5G保証(80%) / 3年契約=+10G保証(20%)・純増は母体RUSH準拠 | AS_RUSH中 STRONG_CHERRY 10% |
| M15 | CloudFront エッジ上乗せ / `CLOUDFRONT` | 上乗せ特化 | 毎ゲーム抽選で枚数を直接上乗せ | 8G固定・平均+59枚(0/5/10/20/60/200枚の重み抽選) | AS_RUSH中 MELON 30% / CHANCE 38% / STRONG_CHERRY 38% / 滞在型ゾーン中のネスト当選(STRONG_CHERRY 6% / SHARK 25% / GHOST 30%) |
| M16 | Kinesis 上乗せストリーム / `KINESIS` | 上乗せ特化 | シャード数ぶんの上乗せレコードが流れる | シャード数1〜10・シャードごとに枚数上乗せ、150枚レコードで母体+1セットも付く | AS_RUSH中 MELON 20% / CHANCE 26% / STRONG_CHERRY 28% / SHARK 20% / 滞在型ゾーン中のネスト当選(SHARK 15% / GHOST 50%) |
| M17 | Step Functions チャレンジ / `STEP_FUNCTIONS` | 上乗せ特化 | 唯一のプレイヤー選択モード | 最大5ステート・Task成功率70%でDC+1(純増ブースト)・全制覇でMULTI_REGION直行 | AS_RUSH中 STRONG_CHERRY 6% / SHARK 25% / GHOST 50% |
| M18 | Serverless RUSH / `SERVERLESS_RUSH` | 上位AT | セット継続型。小役で粘るのが個性 | 1セット5G・純増16枚固定・継続率86%・小役成立ごとに残り+1G | AS_RUSH中 サメ揃い30%(昇格抽選、ゾーン抽選より先に判定) / GHOST契機のゾーン抽選(SERVERLESS_UP 20%)。※U11 でセット継続が無くなったため「6セット連続継続」の昇格は退役 |
| M19 | Multi-Region アクティブ・アクティブ / `MULTI_REGION` | 上位AT | 最上位AT。全レア役で上乗せ確定 | 1セット5G・純増24枚固定・継続率88%・全レア役で+1セット確定&リージョン点灯 | Serverless RUSH中 レア役契機(GHOST 100% / SHARK 80% / STRONG_CHERRY 35% / CHANCE 20% / MELON 15%)+セット継続時25%抽選 / Step Functions全制覇(popThenTo) |
| M20 | ホットスタンバイ(Multi-AZ) / `HOT_STANDBY` | 引き戻し層(1段) | RUSH終了時唯一の防衛線。旧2段構成を統合。**U50 以降はここが上振れの主役**(1回のRUSHを800枚で頭打ちにしたぶん、連チャンで伸ばす) | 5G(**レア役**成立で+1G、上限15G)・成功率**55%**(U67 で 82% から引き下げ)・成功で**復旧のゴーストボーナスSP**へ(U32 / U67。`RECOVERY_BONUS`。そのボーナス中にレア役を引けば85%でRUSHへ ⇒ **RUSHが繋がる確率 約47%**)。**復活しにくい代わりに1回が重い** | RUSH 4種の消化終了 / 上位ATのセット非継続 |
| M21 | 【退役】Route 53 フェイルオーバー / `ROUTE53_FAILOVER` | 引き戻し層(廃止) | 旧2段目。1段化で通常プレイからは到達しない | 3G・成功率10%(ハンドラのみ残置。`?mode=ROUTE53_FAILOVER` の直撃デバッグ専用) | 通常プレイでは到達不可 |
| M22 | re:Invent キーノート / `REINVENT_ED` | エンディング | 完走エンディング。全状態リセット | 5G・純増20枚固定・全状態リセット | 差枚+1500到達 または ATセット累計4到達(閾値は `src/data/modes.js` の `ENDING` が正。U50 で差枚 2222→1500、U32 で ATセット 5→4)(どのモードからでも強制遷移。成立後はカウンタをリセットして再度計測、セッション中に複数回起こりうる) |
| M23 | RESULT(新設) / `RESULT` | セッション終端 | 100回転を使い切った後のリザルト。ゲームは進行しない | 残存価値の買い取り済み最終スコア・買い取り内訳・戦績(ボーナス/AT/CZ/ゾーン/エンディング回数)を表示 | 100回転消化(`session.remaining <= 0`)時に `forceMode('RESULT')` |

**表の注記**:
- 「AT累計4セット」は AT層(`AS_RUSH` などの RUSH 4種 / `SERVERLESS_RUSH` / `MULTI_REGION`)のセット消化数の合計(`modeMachine.atSetCount`)。通常時(`FREE_TIER`)へ完全に落ちた時点で 0 にリセットされる(`ModeMachine._push()` 内)。引き戻し層(`HOT_STANDBY`)はATの続きなので数えたまま持ち越す。
- ボーナス中の払出は「小役払出そのもの」(固定純増ではない)。専用の小役テーブル `BONUS`(`src/data/flags.js`)を引き、ベルが高確率で揃って1回成立につき15枚。期待純増は `BONUS_NET_PER_GAME`(`src/data/payouts.js`、約9.7枚/G)で、残存価値の買い取りにもこの値を使う。
- CZ突破率には意図的な格差が付いている(★1=26% 〜 ★3=85%の8段ラダー)。「CZにはよく入るが、抜けられるかはCZの格次第」という設計思想(`src/data/modes.js` CZ_TYPES のコメント参照)。加重平均の突破率は 41.9%。
- ※ Well-Architected CZ だけ実測(75%)が公称(85%)に届かないのは、**18G のCZが終盤に来ると100回転を使い切って打ち切られる**ため。理論値は 18G で 84.98% = 公称どおりで、仕様バグではない(柱の期待本数 0.452本/G。16G なら 75.5% / 14G なら 62.3% に下がる)。

### 実測値(参考。2026-08-15 U67 バランス調整後 / `node scripts/sim.mjs --session=50000 20260814`)

100回転 × 50,000セッションのヘッドレス試行結果。数値は乱数依存でわずかに変動する参考値であり、正式な数値仕様ではない(seed 777 / 555 でも同レンジを確認済み)。

| 指標 | 実測 | 目標レンジ |
|---|---|---|
| 平均スコア | 239.1枚 | 220〜340枚 |
| 中央値 | 132枚 | 90〜180枚 |
| 上位25% / 10% | 366枚 / 664枚 | — |
| 上位1% / 0.1% | 1,314枚 / 1,659枚 | 上位1%で1,250枚超 |
| プラス収支の割合 | 79.1% | — |
| 機械割 | 179.7% | 150〜190% |
| ボーナス遭遇 | 1.36回/セッション(未遭遇 0.19%) | 0.9〜1.6回 |
| ├ 抽選由来 | 0.79回(通常時G基準 **1/100.3**) | 1/95〜1/110 |
| └ 天井由来 | 0.41回 | 到達 40〜60% |
| AT初当り | 0.56回/セッション(引き戻し復帰 0.16回) | 0.35〜0.7回 |
| CZ遭遇 | 1.49回/セッション(天井経由 27.6%) | 天井経由 30%以下 |
| 派生ゾーン遭遇 | 0.03回/セッション | — |
| エンディング遭遇 | 0.0029回/セッション | — |
| RUSH滞在 | 4.7G/セッション(1回あたり AS 6.9G / **CF 13.0G** / Aurora 7.2G / HERO 4.8G) | — |
| RUSH 1回の獲得(買い取り込み) | AS 307枚 / CF 281枚 / Aurora 308枚 / HERO 295枚 | 250〜400枚 |
| レバーONフリーズ | 9.1〜10.1%のセッション | 8〜12% |
| 残存価値の買い取り | 発生率38.5% / 平均69.1枚(買い取り時平均179.2枚) | — |

> CF の「1回あたり 13.0G」が固定18Gより短いのは、**100回転を使い切って打ち切られる回**が
> 混ざるため(打ち切りぶんは残存価値の買い取りでスコアへ戻る)。

---

## 6. 未実装・実装中の項目(補足)

図・表に含めなかった、`docs/BACKLOG.md` 上まだ完了扱いになっていない項目:

- **リザルト画面の描画**: `src/game/modes/result.js` は数値を保持するだけで、専用の描画(スコア/名前入力欄/殿堂入りボタン等)は未着手(`render/lcd.js` はフォールバックで通常時風の背景を出すだけ)。
- **テロップ可読性の最低表示時間**: 重要告知を次レバーONまで残す仕組みは一部実装済みだが、エンジンレベル(timeline/lcdanims)での最低表示時間保証は `docs/BACKLOG.md` 上まだ未完了。
- **ステージ再設計(見た目)**: 内部状態3段階の名称変更(通常ステージ/サミット会場/Invent会場)とステージIDの割当は完了しているが、「見た瞬間に分かる」演出面の作り込みは進行中。
