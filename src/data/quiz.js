/**
 * AWSクイズのデータ定義。docs/BACKLOG.md「P: AWSクイズルーレット演出」
 *
 * ══ いまの使われ方(2026-08-15 ユーザー指示 U64-2)═══════════════════
 * **リール3択クイズ**。液晶に「◯◯をしたい。どのサービス?」と出題し、
 * 3つの選択肢を **左 / 中 / 右のリール** に割り当てる。
 * プレイヤーが最初に止めたリール = 回答。組み立ては buildReelQuizRound()。
 *
 * ■ 正誤と当落は別物(ここが一番大事)
 *   正誤は「押したリール == 正解のリール」で **事実として** 決まる。
 *   当落(役の成立・CZ突入)は出目と抽選でレバーON時点に決まっていて、
 *   クイズの正誤とは無関係。したがって
 *     ・正解したのに役は不成立     … 普通に起きる
 *     ・不正解だったのに CZ 突入   … 普通に起きる
 *   表示側(staging/anims/lcdanims-extra.js の reel_pick_choice)が
 *   「正誤」と「当落」を別々の行に出し分けて、両方を正直に見せる。
 *   **正誤を当落に合わせて捻じ曲げないこと**(学びが嘘になる)。
 *
 * ■ 4択ルーレット【休止中・保全】
 *   出題 → 4択が回る → 止まった選択肢が正解なら CZ、という自動抽選版。
 *   盤面(lcdanims-extra.js の aws_quiz_roulette)と buildQuizRound() は
 *   消さずに残してある。こちらは呼び出し側(シナリオ)が params.correct で
 *   当落から止め先を決める作りなので、上の3択とは設計が違う。
 *
 * ■ 乱数について
 *   問題選び・選択肢シャッフル・4択版の停止位置は、いずれも演出の見た目だけを
 *   決める値なのでゲーム抽選RNG(engine/rng.js のインスタンス)を使わない。
 *   既定の rand は Math.random で、これは staging/anims/particles.js と同じ扱い。
 *   ここで何回引いてもゲームバランスと ?seed= の再現性には影響しない。
 */

/**
 * 出題リスト(46問)。
 *   q      … 問題文(液晶の横幅に収まるよう 16 文字以内を目安)
 *   answer … 正解のサービス名
 *   decoys … 誤答3つ。「機能が近い」「名前が紛らわしい」ものを混ぜて、
 *            知っていれば必ず解けるが、知らないと迷う難度にしてある
 *
 * ■ 出題を足すときの条件(U52a / 2026-08-15)
 *   1. **正解が1つに定まること**。誤答が「言われてみればそれも正解」になる問題は作らない
 *      (過去に container / mail の2問がこれで作り直しになっている。上のコメント参照)
 *   2. **公式仕様として安定している事実だけ**を問う。
 *      「いま一番安い」「最新世代は」のような時期で変わる論点、
 *      提供終了・改名の途中にあるサービス(旧 Elastic Transcoder など)は避ける
 *   3. 既存問題と **正解サービスも論点も** かぶらせない
 *      (例: Shield=DDoS があるので WAF=L7攻撃 は入れない。裏返しの問題になるため)
 *
 * ■ 条件①③に自分で違反していた2問の修正(2026-08-15 検証指摘 F10 / F11)
 *   egress … 「プライベートサブネットから外へ」は S3/DynamoDB 宛なら
 *            VPC エンドポイントが正解になり、誤答側にも理があった(条件①)。
 *            宛先をインターネットに限定して正解を1つに定めた。
 *   ml     … SageMaker と Bedrock が互いの誤答に入る鏡写しのペアだった(条件③)。
 *            SageMaker 固有の論点(統合開発環境)へずらして重なりを解いた。
 *   **新しい問題を足すときは、既存の誤答リストまで見て裏返しになっていないか確認すること。**
 *
 * ■ 削除した問題(U46a / 2026-08-15)
 *   satellite(人工衛星と通信したい → Ground Station)はユーザー指示で
 *   「アンテナ・衛星ネタをやめる」ことになったため削除した。
 *   同じ指示で data/scenarios/yokoku-infra.js の Ground Station 予告3本も外してある。
 */
export const QUIZ_QUESTIONS = [
  {
    id: 'cache',
    // 「キャッシュ」だけだと CDN のキャッシュとも読めるので「インメモリ」で用途を確定させる
    q: 'インメモリキャッシュを置きたい',
    answer: 'ElastiCache',
    decoys: ['EC2', 'S3', 'ALB'],
  },
  {
    id: 'dns',
    q: '独自ドメインの名前解決をしたい',
    answer: 'Route 53',
    decoys: ['CloudFront', 'API Gateway', 'VPC'],
  },
  {
    id: 'archive',
    q: 'めったに読まないデータを最安保管',
    answer: 'S3 Glacier',
    decoys: ['S3 標準', 'EBS', 'EFS'],
  },
  {
    id: 'nosql',
    q: 'ミリ秒応答のマネージドNoSQL',
    answer: 'DynamoDB',
    decoys: ['RDS', 'Aurora', 'Redshift'],
  },
  {
    id: 'cdn',
    q: '静的コンテンツを世界中へ高速配信',
    answer: 'CloudFront',
    decoys: ['Route 53', 'Global Accelerator', 'Direct Connect'],
  },
  {
    id: 'lb',
    // パスベースルーティングができるのは ALB だけ。
    // NLB は L4、GWLB は L3 のアプライアンス経由、Route 53 は DNS での分散。
    // 旧世代の CLB は選択肢として不適切なため GWLB へ差し替えた
    q: 'URLパスごとにHTTPを振り分ける',
    answer: 'ALB',
    decoys: ['NLB', 'GWLB', 'Route 53'],
  },
  {
    id: 'serverless',
    q: 'サーバー管理なしで関数を実行',
    answer: 'Lambda',
    decoys: ['EC2', 'ECS', 'Batch'],
  },
  {
    id: 'object',
    q: '容量無制限のオブジェクト保存',
    answer: 'S3',
    decoys: ['EBS', 'EFS', 'FSx'],
  },
  {
    id: 'container',
    // 旧: 'AWS独自のコンテナ実行基盤' … Fargate も「AWS独自のサーバーレスなコンテナ実行基盤」
    // なので誤答が正解になりうる問題だった。「オーケストレーター」に限定して一意にしてある:
    //   EKS     … Kubernetes ベースなので「K8s以外」で除外される
    //   ECR     … コンテナ**イメージ**のレジストリでオーケストレーターではない
    //   Fargate … コンテナを動かす**コンピューティングエンジン**。制御するのは ECS / EKS 側
    q: 'コンテナのオーケストレーター(K8s以外)',
    answer: 'ECS',
    decoys: ['EKS', 'ECR', 'Fargate'],
  },
  {
    id: 'mail',
    // 旧: 'アプリから大量のメールを送信' … SNS もサブスクリプションでメールを送れるため
    // 誤答が正解になりうる問題だった。SNS のメールは通知用のプレーンテキストで
    // 一斉配信・テンプレート・到達率管理は行えないので、「マーケティングメールの大量配信」
    // という用途に絞ることで SES 一択になる
    q: 'マーケティングメールを大量配信',
    answer: 'SES',
    decoys: ['SNS', 'SQS', 'Chime'],
  },
  {
    id: 'graph',
    // グラフDBは Neptune 一択。誤答は RDB / KVS / DWH で「DBつながり」の紛らわしさを作る
    q: 'グラフ構造のデータを扱いたい',
    answer: 'Neptune',
    decoys: ['DynamoDB', 'RDS', 'Redshift'],
  },
  {
    id: 'gamelift',
    q: 'ゲームのマッチメイキング基盤',
    answer: 'GameLift',
    decoys: ['AppSync', 'Amplify', 'Elastic Beanstalk'],
  },
  {
    id: 'macie',
    // GuardDuty=脅威検知 / Inspector=脆弱性 / Config=構成。S3の「機密データ」検出は Macie だけ
    q: 'S3の機密データを自動検出',
    answer: 'Macie',
    decoys: ['GuardDuty', 'Inspector', 'Config'],
  },
  {
    id: 'cognito',
    // IAM は「AWSリソースへの権限」。アプリの利用者(エンドユーザー)認証は Cognito
    q: 'アプリ利用者の認証基盤',
    answer: 'Cognito',
    decoys: ['IAM', 'Directory Service', 'Secrets Manager'],
  },
  {
    id: 'acm',
    // KMS=鍵 / Secrets Manager=機密情報 / CloudHSM=専用HSM。証明書の発行・管理は ACM
    q: 'SSL/TLS証明書を無料で発行',
    answer: 'ACM',
    decoys: ['KMS', 'Secrets Manager', 'CloudHSM'],
  },
  {
    id: 'config',
    // CloudTrail は「API呼び出しの記録」。構成の評価(コンプライアンス判定)は Config だけ
    q: 'リソース構成のコンプライアンス評価',
    answer: 'Config',
    decoys: ['CloudTrail', 'CloudWatch', 'Systems Manager'],
  },
  {
    id: 'braket',
    q: '量子コンピュータを試したい',
    answer: 'Braket',
    decoys: ['EC2', 'Batch', 'ParallelCluster'],
  },
  {
    id: 'kafka',
    // MQ は ActiveMQ / RabbitMQ 互換。Kafka 互換のマネージドは MSK
    q: 'Apache Kafka 互換のマネージド',
    answer: 'MSK',
    decoys: ['Kinesis', 'SQS', 'MQ'],
  },
  {
    id: 'iot',
    /*
     * 【差し替え済み(2026-08-15 U64-2 / 元は kendra)】
     * 旧: 「社内文書を自然言語で検索 → Kendra」。
     *   Amazon Kendra は 2026-07-30 にメンテナンスモードへ入っており、
     *   条件②「公式仕様として安定している事実だけを問う」を満たさなくなったため、
     *   **クイズ復活(U64-2)に合わせて設問ごと差し替えた**(椿レビュー #17 の宿題)。
     * 新: デバイス接続。既存45問に「機器をつなぐ」論点は無く、条件③も満たす。
     *
     * 誤答の選び方(条件①: 正解が1つに定まること):
     *   SQS / EventBridge / Kinesis はいずれも **AWS の中でメッセージを扱う**もので、
     *   機器を MQTT でつなぐ入口にはならない。
     *   ※ Amazon MQ は MQTT を話せるので誤答に入れてはいけない(正解になりうる)。
     */
    q: 'たくさんの機器をMQTTでつなぐ',
    answer: 'IoT Core',
    decoys: ['SQS', 'EventBridge', 'Kinesis'],
  },
  {
    id: 'cdk',
    // CloudFormation / SAM はテンプレート(YAML)。汎用プログラミング言語で書けるのは CDK
    q: 'IaCをプログラミング言語で書く',
    answer: 'CDK',
    decoys: ['CloudFormation', 'SAM', 'Elastic Beanstalk'],
  },
  {
    id: 'etl',
    // EMR は Hadoop クラスタ(サーバーレスではない)。サーバーレスETLは Glue
    q: 'ETL処理をサーバーレスで実行',
    answer: 'Glue',
    decoys: ['EMR', 'Data Pipeline', 'Athena'],
  },
  {
    id: 'athena',
    // 誤答はいずれも「S3へSQLを直接投げる」サービスではない
    // (QuickSight=BI / Glue=ETL / EMR=Hadoop基盤)。
    // Redshift はクラスタ前提かつ Spectrum で紛らわしいため誤答から外してある
    q: 'S3のデータにSQLを直接投げる',
    answer: 'Athena',
    decoys: ['QuickSight', 'Glue', 'EMR'],
  },
  {
    id: 'secrets',
    // Parameter Store も機密を保管できるが、自動ローテーションは Secrets Manager の機能
    q: 'DBパスワードを自動ローテーション',
    answer: 'Secrets Manager',
    decoys: ['KMS', 'Parameter Store', 'ACM'],
  },
  {
    id: 'ddos',
    // WAF は L7 のWeb攻撃対策。DDoS そのものへの防御は Shield
    q: 'DDoS攻撃から守りたい',
    answer: 'Shield',
    decoys: ['WAF', 'GuardDuty', 'Network Firewall'],
  },
  {
    id: 'transit',
    // VPC Peering は1対1。多数のVPCをハブ&スポークで束ねるのは Transit Gateway
    q: '多数のVPCを一箇所で相互接続',
    answer: 'Transit Gateway',
    decoys: ['VPC Peering', 'Direct Connect', 'PrivateLink'],
  },

  /* ══ U52a(2026-08-15)で追加した21問 ══════════════════════════════
   * 上の25問と正解サービス・論点がかぶらないものだけを選んである。
   * 各問のコメントは「なぜ誤答が正解になりえないか」の根拠。 */

  {
    id: 'dwh',
    // Redshift は列指向のデータウェアハウス。誤答はどれも分析用のDWHではない
    // (RDS=OLTP / DynamoDB=KVS / Neptune=グラフ)
    q: 'ペタバイト級のDWHが欲しい',
    answer: 'Redshift',
    decoys: ['RDS', 'DynamoDB', 'Neptune'],
  },
  {
    id: 'nfs',
    // EFS は NFS のマネージド共有ファイルシステム。
    // EBS はブロック / S3 はオブジェクト / FSx for Windows は SMB なので NFS ではない
    q: '複数のEC2から同時に使うNFS',
    answer: 'EFS',
    decoys: ['EBS', 'S3', 'FSx for Windows'],
  },
  {
    id: 'queue',
    // 「貯めて順に取り出す」= キュー。SNS はプッシュ型の pub/sub、
    // EventBridge はイベントバス、Kinesis はストリーム(取り出しても消えない)
    q: 'メッセージを貯めて順に処理',
    answer: 'SQS',
    decoys: ['SNS', 'EventBridge', 'Kinesis'],
  },
  {
    id: 'eventbus',
    // AWSサービスが出すイベントをルールでマッチさせて配る仕組みは EventBridge
    q: 'イベントをルールで振り分け',
    answer: 'EventBridge',
    decoys: ['SQS', 'SNS', 'Step Functions'],
  },
  {
    id: 'workflow',
    // ステートマシン(状態遷移)で処理をつなぐのは Step Functions。
    // Lambda は関数1つ、Batch はジョブ実行、EventBridge はイベント配送
    q: '処理の流れを状態遷移で組む',
    answer: 'Step Functions',
    decoys: ['Lambda', 'Batch', 'EventBridge'],
  },
  {
    id: 'audit',
    // 「誰がいつどのAPIを呼んだか」の証跡は CloudTrail。
    // Config は構成の記録・評価で、API呼び出しそのものの記録ではない
    q: '誰がAPIを呼んだか記録したい',
    answer: 'CloudTrail',
    decoys: ['CloudWatch', 'Config', 'X-Ray'],
  },
  {
    id: 'trace',
    // サービスをまたぐリクエストの分散トレースは X-Ray
    q: 'サービス間の遅延を追跡したい',
    answer: 'X-Ray',
    decoys: ['CloudTrail', 'CloudWatch', 'Inspector'],
  },
  {
    id: 'threat',
    // GuardDuty は継続的な脅威検知。Inspector=脆弱性 / Macie=S3の機密データ /
    // Security Hub=検出結果の集約 なので、検知そのものは GuardDuty だけ
    q: '不審な挙動を継続的に検知',
    answer: 'GuardDuty',
    decoys: ['Inspector', 'Macie', 'Security Hub'],
  },
  {
    id: 'asg',
    // 台数(希望容量)を自動で増減させるのは Auto Scaling。
    // ALB は分散するだけで台数は変えない
    q: '負荷に応じてEC2を自動増減',
    answer: 'Auto Scaling',
    decoys: ['ALB', 'Lambda', 'Batch'],
  },
  {
    id: 'multiaccount',
    // 複数アカウントを組織にまとめ、一括請求(Consolidated Billing)を行うのは Organizations。
    // Control Tower はその上でガードレールを敷く仕組みで、請求をまとめる主体ではない
    q: '複数アカウントを一括請求',
    answer: 'Organizations',
    decoys: ['IAM', 'Control Tower', 'Cost Explorer'],
  },
  {
    id: 'patch',
    // Patch Manager を含む運用一元管理は Systems Manager。
    // CodeDeploy はアプリのデプロイで OS のパッチ適用はしない
    q: 'EC2のパッチ適用を一元管理',
    answer: 'Systems Manager',
    decoys: ['Config', 'CodeDeploy', 'Inspector'],
  },
  {
    id: 'fargate',
    // ECS / EKS の「サーバー(データプレーン)を持たない」実行方式が Fargate。
    // ECR はイメージ置き場、Lambda は関数の実行環境でコンテナの起動先ではない
    q: 'ECS/EKSのサーバー管理をなくす',
    answer: 'Fargate',
    decoys: ['EC2', 'Lambda', 'ECR'],
  },
  {
    id: 'registry',
    // コンテナ**イメージ**のレジストリは ECR。
    // CodeArtifact は npm / Maven などのパッケージリポジトリ
    q: 'コンテナイメージを保管したい',
    answer: 'ECR',
    decoys: ['ECS', 'S3', 'CodeArtifact'],
  },
  {
    id: 'cicd',
    // ビルド(CodeBuild)とデプロイ(CodeDeploy)を**つなぐ**パイプラインが CodePipeline
    q: 'ビルドとデプロイをつなぐCI/CD',
    answer: 'CodePipeline',
    decoys: ['CodeBuild', 'CodeDeploy', 'CodeArtifact'],
  },
  {
    id: 'restapi',
    // API Gateway は REST/HTTP API の公開口で、認証・使用量プラン・スロットリングを持つ。
    // AppSync は GraphQL 専用なので REST の窓口にはならない
    q: 'REST APIを公開して流量制御',
    answer: 'API Gateway',
    decoys: ['ALB', 'CloudFront', 'AppSync'],
  },
  {
    id: 'vision',
    // 画像・動画の物体/顔検出は Rekognition。
    // Textract は帳票の文字と表の抽出で、物体検出はしない
    q: '画像から顔や物体を検出',
    answer: 'Rekognition',
    decoys: ['Textract', 'Comprehend', 'SageMaker'],
  },
  {
    id: 'stt',
    // 音声 → 文字は Transcribe。Polly はその逆(文字 → 音声)
    q: '音声を文字に書き起こす',
    answer: 'Transcribe',
    decoys: ['Polly', 'Translate', 'Comprehend'],
  },
  {
    id: 'ml',
    /*
     * 【2026-08-15 検証指摘 F11 で論点を差し替え】
     * 旧: 「自社データでモデルを学習・配備」→ SageMaker(誤答に Bedrock)。
     * 直後の foundation が「基盤モデルをAPIで呼びたい」→ Bedrock(誤答に SageMaker)で、
     * **鏡写しのペア**になっていた(このファイルの条件③に自分で違反していた)。
     * さらに Bedrock はカスタムモデルの学習もプロビジョンドスループットでの配備も
     * できるので、旧設問は誤答側にも理があった(条件①にも触れる)。
     * → 「学習ジョブとノートブックを1か所で管理する統合環境」という
     *   SageMaker 固有の論点へずらした。Bedrock は学習ジョブの管理コンソールを
     *   提供しないので、誤答から外しても設問として成立する。
     */
    q: '学習ジョブとノートブックを1か所で管理',
    answer: 'SageMaker',
    decoys: ['EMR', 'Batch', 'Glue'],
  },
  {
    id: 'foundation',
    // 「学習済みの基盤モデルをAPIで呼ぶ」のは Bedrock。
    // Comprehend / Rekognition は用途特化のAIサービスで、基盤モデルの提供口ではない。
    // 2026-08-15 U64-2: 誤答の Kendra(メンテナンスモード入り)を Rekognition へ差し替え
    q: '基盤モデルをAPIで呼びたい',
    answer: 'Bedrock',
    decoys: ['SageMaker', 'Comprehend', 'Rekognition'],
  },
  {
    id: 'leaseline',
    // 専用線(物理回線)での接続は Direct Connect。
    // Site-to-Site VPN はインターネット経由の暗号化トンネル
    q: 'オンプレとAWSを専用線で接続',
    answer: 'Direct Connect',
    decoys: ['Site-to-Site VPN', 'Transit Gateway', 'PrivateLink'],
  },
  {
    id: 'egress',
    /*
     * 【2026-08-15 検証指摘 F10 で設問を限定】
     * 旧: 「プライベートサブネットから外へ」。
     * S3 / DynamoDB 宛なら VPC エンドポイントが正解なので、
     * 誤答の「VPC Endpoint」が「言われてみればそれも正解」になっていた(条件①違反)。
     * → 宛先を **インターネット** に限定すれば正解は NAT Gateway 一つに定まる
     *   (VPC エンドポイントの宛先は AWS サービスだけでインターネットへは出られない)。
     * 表記も他の選択肢(Internet Gateway / ALB)に合わせて英語のサービス名へ統一した。
     * 文字数は既存の最長(21文字)に合わせてある(液晶の1行に収まる実績のある長さ)。
     */
    q: 'プライベートサブネットからインターネットへ',
    answer: 'NAT Gateway',
    decoys: ['Internet Gateway', 'ALB', 'VPC Endpoint'],
  },
];

/* ══ AWS豆知識カード(2026-08-15 ユーザー指示 U59)══════════════════════
 *
 * ボーナス(SHARK / GHOST / GHOST SP)の消化中、**1ゲームおき**に
 * 「AWSサービス名 + 1行概要」のカードを液晶へ出す。
 * この台のコンセプトである「遊んで覚える」を、**手が空いている時間**に置いた枠。
 *
 * ■ なぜクイズと同じファイルに置くのか
 *   クイズ(上の46問)は U53 で休止しているが盤面もデータも保全してある。
 *   豆知識カードは「同じ AWS 知識テキストの別の見せ方」でしかないので、
 *   置き場を分けると **同じサービスの説明が2ファイルに散る**。
 *   ここへ同居させ、クイズを復活させるときもこの表をそのまま参照できるようにする。
 *
 * ■ 書き方の約束(クイズの3条件と揃える)
 *   1. **1行で言い切る**。液晶の1行に収まる長さにする。
 *      目安は **全角26文字まで**(半角が混じるぶんはもう少し入る)。
 *      2026-08-15 椿レビュー(学習機能の検収 minor)で実態に合わせた値。
 *      カードの本文は幅 366px(TRIVIA_CARD の w400 − 左右の余白34)へ
 *      `fitFont(max:16, min:13)` で入るまで縮められる
 *      (staging/anims/lcdanims-extra.js の aws_trivia_card)。
 *      全角は概ね字面の高さ = 幅なので 366 ÷ 13 ≒ **28字** が物理的な限界で、
 *      読みやすさの余裕を1段見て26字を上限の目安にしている。
 *      **これを超えると 13px でも収まらない**。縮小は 13px で止まるので、
 *      あふれたぶんは中央揃えのままカードの縁からはみ出す
 *   2. **公式仕様として安定している事実だけ**。「いま一番安い」「最新世代は」は書かない
 *   3. **数値は出典があるものだけ**。この表で数字を名乗っているのは
 *      EC2 Mac の24時間 / Route 53 の由来(ポート53)/ Global Accelerator の固定IP2つ /
 *      Aurora の読み取り複製15台 / 分散マップの1万並列 / Shield Advanced の24時間体制 の6件で、
 *      いずれも公式ドキュメントに書かれている値。
 *      **上限値のように版によって伸びる数字は書かない**
 *      (2026-08-15 椿レビュー #2: Aurora の「上限128TiB」は旧仕様で、
 *       新しいバージョンではさらに大きい。数字を落として「自動で伸びる」だけを言う)。
 *      AWS Shield の「L3/L4」は数字が入るが、**OSI 参照モデルの層の名前**であって
 *      仕様の値ではないので、この6件には数えない
 *   4. **提供終了・メンテモード入りのサービスは載せない**
 *      (DeepRacer / RoboMaker / Ground Station / Snow Family / Kendra / Q Business /
 *       QLDB / Timestream LiveAnalytics / IoT Events / Pinpoint は除外済み。
 *       2026-08-15 椿レビュー #1 で **App Runner**(2026-04-30 に新規受付終了)も
 *       この一覧に加わり、Lambda 関数URL へ差し替えた)
 *
 * ■ tier
 *   予兆・予告での使われ方(弱 / 中 / 熱)。カードの見た目には効かないが、
 *   「今日の演出で見たサービスの説明がボーナス中に出る」を将来作るための目印として持つ。
 *   'core' は上のクイズ46問から拾った定番サービス。
 *
 * ■ cat(2026-08-15 学習強化 L2)
 *   サービスの分類。**全件必須**。id の定義と「迷ったときの寄せ方」は
 *   data/services.js の CATEGORIES が正(あちらのコメントを読んでから付けること)。
 *   カテゴリは液晶のカードのピル・クイズ盤面の足元・リザルトの苦手分析に出る。
 *   付け忘れ・未知の id は data/services.js の自己点検が起動時に警告する。
 *
 * ■ この表とクイズ46問の関係(2026-08-15 学習強化)
 *   クイズの正解サービスは **全46件がこの表に載っている**(AWS図鑑が埋まる条件)。
 *   対応表は data/services.js の QUIZ_ANSWER_TO_SERVICE。
 *   **正解サービスを増やしたら、この表とあちらの対応表の両方へ足すこと**。
 */

/**
 * 豆知識カードのネタ。
 *   service  … 液晶に大きく出すサービス名(正式表記)
 *   oneLiner … 1行の概要。**そのサービスを知らない人が読んで分かる言葉**で書く
 *   tier     … 'weak' | 'mid' | 'hot' | 'core'
 *   cat      … 分類id(data/services.js の CATEGORIES)。全件必須
 * @type {{service:string, oneLiner:string, tier:string, cat:string}[]}
 */
export const AWS_TRIVIA = [
  /* ── 弱(地味・日常系)25 ─────────────────────────────────── */
  { service: 'Amazon EC2 Mac インスタンス', oneLiner: 'Apple実機をAWSで借りる。24時間は返却不可', tier: 'weak', cat: 'compute' },
  { service: 'AWS Device Farm', oneLiner: '本物のスマホ実機でアプリを自動テストできる', tier: 'weak', cat: 'devops' },
  { service: 'Amazon Macie', oneLiner: 'S3の中身を機械が読んで個人情報を探す', tier: 'weak', cat: 'security' },
  { service: 'AWS Systems Manager Session Manager', oneLiner: '鍵も踏み台もなくEC2にログインできる仕組み', tier: 'weak', cat: 'devops' },
  { service: 'Amazon EventBridge Scheduler', oneLiner: '時刻を指定して1回だけ処理を起動できる', tier: 'weak', cat: 'devops' },
  { service: 'AWS Cost Anomaly Detection', oneLiner: 'いつもと違う請求の増え方を機械が見つける', tier: 'weak', cat: 'other' },
  { service: 'AWS Trusted Advisor', oneLiner: '設定の改善点を自動で点検してくれる相談役', tier: 'weak', cat: 'devops' },
  { service: 'AWS Compute Optimizer', oneLiner: '実測から最適なインスタンスサイズを提案する', tier: 'weak', cat: 'devops' },
  { service: 'Amazon EBS スナップショット', oneLiner: 'ディスクの差分だけを保存するバックアップ', tier: 'weak', cat: 'storage' },
  { service: 'Amazon CloudWatch Logs Insights', oneLiner: '大量ログを専用の問い合わせ文でさっと検索', tier: 'weak', cat: 'devops' },
  /*
   * 2026-08-15 椿レビュー #10 / #15。
   *   #15 … 表記は他82件と同じ「正式名だけ」に統一(括弧の略称を落とした)
   *   #10 … ACM の証明書は **AWS のサービスに付けて使う**もので、
   *         サーバーへ落として自前で使う用途は対象外。そこを1行に含めた
   */
  { service: 'AWS Certificate Manager', oneLiner: 'AWS のサービスに付ける HTTPS 証明書を無料で自動更新', tier: 'weak', cat: 'security' },
  /*
   * 2026-08-15 椿レビュー #5。
   * ポート53由来のネタは Route 53 **本体**の話なので下の core 側へ移した。
   * Resolver は「VPC の中のDNS」という機能そのものを説明する。
   */
  { service: 'Amazon Route 53 Resolver', oneLiner: 'VPC の中のDNS。オンプレとの名前解決も橋渡しする', tier: 'weak', cat: 'network' },
  { service: 'AWS Transfer Family', oneLiner: '昔ながらのSFTPのままS3へ出し入れできる', tier: 'weak', cat: 'storage' },
  { service: 'AWS DataSync', oneLiner: 'オンプレとAWS間のファイル移送を自動化する', tier: 'weak', cat: 'storage' },
  { service: 'Amazon FSx for Windows File Server', oneLiner: 'Windowsのファイルサーバを借りられる', tier: 'weak', cat: 'storage' },
  { service: 'AWS License Manager', oneLiner: '持ち込みソフトのライセンス数を数えて守る', tier: 'weak', cat: 'other' },
  { service: 'Amazon AppStream 2.0', oneLiner: 'デスクトップアプリを画面転送だけで配信する', tier: 'weak', cat: 'other' },
  { service: 'AWS Amplify Hosting', oneLiner: 'Git連携でフロント画面を自動公開できる', tier: 'weak', cat: 'devops' },
  /*
   * 2026-08-15 椿レビュー #1。
   * AWS App Runner は 2026-04-30 に新規受付を終了(メンテナンスモード)したため、
   * 条件④に従って落とした。枠は「置くだけで HTTP で公開できる」という
   * **同じ気持ちよさ**を持つ Lambda の関数URLへ引き継いでいる。
   */
  { service: 'AWS Lambda 関数URL', oneLiner: 'Lambda に HTTP の URL を1本直接生やせる', tier: 'weak', cat: 'compute' },
  { service: 'Amazon SES', oneLiner: 'AWSからメールを送るためのメール配信基盤', tier: 'weak', cat: 'other' },
  { service: 'Amazon Polly', oneLiner: '文章を人の声のように読み上げる', tier: 'weak', cat: 'ai' },
  { service: 'Amazon Translate', oneLiner: '文章を別の言語へ機械翻訳する', tier: 'weak', cat: 'ai' },
  { service: 'Amazon Textract', oneLiner: '書類の画像から文字と表の形を読み取る', tier: 'weak', cat: 'ai' },
  { service: 'Amazon Comprehend', oneLiner: '文章の話題や感情を機械が判定する', tier: 'weak', cat: 'ai' },
  { service: 'AWS Artifact', oneLiner: 'AWSの第三者監査報告書を自分で取得できる', tier: 'weak', cat: 'security' },

  /* ── 中(発見・接続系)25 ────────────────────────────────── */
  { service: 'AWS PrivateLink', oneLiner: 'サービス同士を公開せず内側だけで結ぶ', tier: 'mid', cat: 'network' },
  { service: 'Amazon VPC Lattice', oneLiner: 'VPCをまたぐサービス通信をまとめて管理する', tier: 'mid', cat: 'network' },
  { service: 'AWS Transit Gateway', oneLiner: '多数のVPCを1つのハブで束ねて相互接続する', tier: 'mid', cat: 'network' },
  // 固定IP2つは公式ドキュメントの仕様
  { service: 'AWS Global Accelerator', oneLiner: '固定IP2つで最寄りのAWS拠点へ引き込む', tier: 'mid', cat: 'network' },
  { service: 'AWS Direct Connect', oneLiner: '自社拠点とAWSを物理専用線で直結する', tier: 'mid', cat: 'network' },
  { service: 'Amazon Data Firehose', oneLiner: '流れてくるデータをS3などへ自動で流し込む', tier: 'mid', cat: 'data' },
  { service: 'Amazon OpenSearch Service', oneLiner: '大量の文書を全文検索して可視化できる', tier: 'mid', cat: 'data' },
  { service: 'Amazon Neptune', oneLiner: '人やモノの「関係」を保存して辿れるDB', tier: 'mid', cat: 'database' },
  { service: 'Amazon Keyspaces', oneLiner: 'Cassandra互換のマネージドDB', tier: 'mid', cat: 'database' },
  { service: 'Amazon DocumentDB', oneLiner: 'MongoDB互換のマネージド文書DB', tier: 'mid', cat: 'database' },
  { service: 'Amazon MemoryDB', oneLiner: '速いのに消えないインメモリDB', tier: 'mid', cat: 'database' },
  { service: 'Amazon Redshift Serverless', oneLiner: '使う時だけ起きるデータウェアハウス', tier: 'mid', cat: 'data' },
  { service: 'AWS Lake Formation', oneLiner: 'データレイクの権限を一括で管理する', tier: 'mid', cat: 'data' },
  { service: 'Amazon QuickSight', oneLiner: '集めたデータをグラフで見せるBIツール', tier: 'mid', cat: 'data' },
  { service: 'Amazon AppFlow', oneLiner: 'SaaSとAWSのデータ連携をノーコードで作る', tier: 'mid', cat: 'data' },
  { service: 'Amazon MWAA', oneLiner: 'Airflowのワークフロー基盤を借りられる', tier: 'mid', cat: 'data' },
  { service: 'AWS Clean Rooms', oneLiner: '生データを見せ合わずに共同分析する部屋', tier: 'mid', cat: 'data' },
  { service: 'AWS Entity Resolution', oneLiner: 'バラバラの顧客データを同一人物にまとめる', tier: 'mid', cat: 'data' },
  { service: 'Amazon Detective', oneLiner: 'セキュリティ警告の関連を図でたどる', tier: 'mid', cat: 'security' },
  { service: 'Amazon Inspector', oneLiner: 'EC2やコンテナの脆弱性を自動で見つける', tier: 'mid', cat: 'security' },
  { service: 'AWS Security Hub', oneLiner: '各セキュリティ機能の指摘を一箇所に集約する', tier: 'mid', cat: 'security' },
  { service: 'AWS Resource Access Manager', oneLiner: 'アカウントをまたいでリソースを共有する', tier: 'mid', cat: 'security' },
  { service: 'Amazon Bedrock Knowledge Bases', oneLiner: '自社文書を根拠にAIが答えるRAGの土台', tier: 'mid', cat: 'ai' },
  { service: 'AWS Local Zones', oneLiner: '大都市の近くに置かれたAWSの小さな拠点', tier: 'mid', cat: 'compute' },
  /*
   * 2026-08-15 椿レビュー #8。
   * Wavelength Zone が置かれているのは通信事業者のネットワークの内側であって、
   * 「基地局の中」ではない。言い切りを1段ゆるめて「回線の内側」にしてある。
   */
  { service: 'AWS Wavelength', oneLiner: '携帯回線の内側でアプリを動かせる場所', tier: 'mid', cat: 'compute' },

  /* ── 熱(大規模・確定系)10 ──────────────────────────────── */
  { service: 'AWS Fault Injection Service', oneLiner: '本番にわざと故障を起こして耐性を試す', tier: 'hot', cat: 'devops' },
  { service: 'Amazon Braket', oneLiner: '本物の量子コンピュータをクラウドで動かす', tier: 'hot', cat: 'other' },
  { service: 'AWS Data Transfer Terminal', oneLiner: 'ディスクを持ち込んで高速転送する物理施設', tier: 'hot', cat: 'storage' },
  { service: 'Amazon SageMaker HyperPod', oneLiner: '巨大AI学習のための専用クラスタ基盤', tier: 'hot', cat: 'ai' },
  { service: 'AWS Trainium', oneLiner: 'AI学習用にAWSが自社開発した専用チップ', tier: 'hot', cat: 'ai' },
  { service: 'AWS Nitro System', oneLiner: 'EC2の土台。仮想化処理を専用チップに逃がす', tier: 'hot', cat: 'compute' },
  /*
   * 2026-08-15 椿レビュー #2。
   * 「上限128TiB」は旧仕様で、新しいバージョンではもっと大きくなっている。
   * 版で変わる数字は条件③に反するので落とし、**版が変わっても正しい**
   * 「容量が自動で伸びる」だけを言う形にした。
   * 読み取り複製15台はクラスタの構成上限で、こちらは据え置きで公式値。
   */
  { service: 'Amazon Aurora', oneLiner: '容量が自動で伸び、読み取り複製15台まで増やせるDB', tier: 'hot', cat: 'database' },
  // 並列1万は公式ドキュメントのサービスクォータ
  { service: 'AWS Step Functions Distributed Map', oneLiner: '巨大データを1万並列でさばく分散処理の枝', tier: 'hot', cat: 'devops' },
  { service: 'AWS Shield Advanced', oneLiner: '大規模なDDoS攻撃を24時間体制で防ぐ上位防御', tier: 'hot', cat: 'security' },
  { service: 'Amazon Application Recovery Controller', oneLiner: '障害時のリージョン切替を安全に実行する', tier: 'hot', cat: 'devops' },

  /* ── 定番(上のクイズ46問から。台の主役級サービス)22 ────────────
   * 出題の「正解」をそのまま説明文にしたもの。クイズを復活させたときに
   * 説明とクイズが食い違わないよう、同じ論点の言い回しに揃えてある。 */
  { service: 'Amazon S3', oneLiner: '容量無制限でファイルを置けるオブジェクト保存', tier: 'core', cat: 'storage' },
  { service: 'AWS Lambda', oneLiner: 'サーバー管理なしで関数だけを実行できる', tier: 'core', cat: 'compute' },
  { service: 'Amazon DynamoDB', oneLiner: 'ミリ秒で応答するフルマネージドのNoSQL', tier: 'core', cat: 'database' },
  /*
   * 2026-08-15 椿レビュー #6。CloudFront は動的コンテンツもAPIも配信できる。
   * 「静的コンテンツ」に限定した言い方をやめて、エッジ配信という本質だけを言う。
   * (クイズ側の cdn 問題は「静的コンテンツを世界中へ高速配信」= CloudFront が
   *  正解で成立しているのでそのまま。あちらは用途を絞った出題文なので矛盾しない)
   */
  { service: 'Amazon CloudFront', oneLiner: '世界中のエッジから配信を速くするCDN', tier: 'core', cat: 'network' },
  // 名前の由来(DNSのポート番号53)は AWS 公式ブログに記載がある。
  // 2026-08-15 椿レビュー #5 で Resolver 側からこちらへ移した
  { service: 'Amazon Route 53', oneLiner: '独自ドメインの名前解決を担うDNS。由来はポート53', tier: 'core', cat: 'network' },
  // 2026-08-15 椿レビュー #16: 何が借りられるのかが分かる言い方にする
  { service: 'Amazon ElastiCache', oneLiner: 'Redis/Memcached 互換のキャッシュを借りられる', tier: 'core', cat: 'database' },
  { service: 'Amazon S3 Glacier', oneLiner: 'めったに読まないデータを最安で保管する', tier: 'core', cat: 'storage' },
  { service: 'AWS Step Functions', oneLiner: '処理の流れを状態遷移で組み立てる', tier: 'core', cat: 'devops' },
  { service: 'Amazon SQS', oneLiner: 'メッセージを貯めて順に取り出すキュー', tier: 'core', cat: 'devops' },
  { service: 'Amazon EventBridge', oneLiner: 'イベントをルールで振り分けて配る', tier: 'core', cat: 'devops' },
  { service: 'AWS CloudTrail', oneLiner: '誰がいつどのAPIを呼んだかを記録する', tier: 'core', cat: 'devops' },
  { service: 'AWS X-Ray', oneLiner: 'サービスをまたぐ処理の遅延を追跡する', tier: 'core', cat: 'devops' },
  { service: 'Amazon GuardDuty', oneLiner: '不審な挙動を継続的に検知する', tier: 'core', cat: 'security' },
  { service: 'AWS Fargate', oneLiner: 'ECS/EKSのサーバー管理をなくす実行方式', tier: 'core', cat: 'compute' },
  { service: 'Amazon ECR', oneLiner: 'コンテナイメージを保管するレジストリ', tier: 'core', cat: 'compute' },
  { service: 'AWS CodePipeline', oneLiner: 'ビルドとデプロイをつなぐCI/CD', tier: 'core', cat: 'devops' },
  { service: 'Amazon API Gateway', oneLiner: 'REST APIを公開して流量を制御する', tier: 'core', cat: 'network' },
  { service: 'Amazon Rekognition', oneLiner: '画像から顔や物体を検出する', tier: 'core', cat: 'ai' },
  { service: 'Amazon Bedrock', oneLiner: '学習済みの基盤モデルをAPIで呼べる', tier: 'core', cat: 'ai' },
  { service: 'AWS Secrets Manager', oneLiner: 'DBのパスワードを自動でローテーションする', tier: 'core', cat: 'security' },
  { service: 'AWS Glue', oneLiner: 'ETL処理をサーバーレスで実行する', tier: 'core', cat: 'data' },
  { service: 'Amazon Athena', oneLiner: 'S3のデータにSQLを直接投げられる', tier: 'core', cat: 'data' },

  /* ── 定番(2026-08-15 学習強化で追加した17件)───────────────────────
   * クイズ46問の正解のうち、この表に**まだ無かった**サービス。
   * これで「クイズの正解は必ず図鑑に載っている」が成立する
   * (対応表は data/services.js の QUIZ_ANSWER_TO_SERVICE)。
   *
   * oneLiner は **クイズの設問文の論点をそのまま言い切る**形にしてある。
   * 設問と説明が食い違わないうえ、出典を新しく作らないので事実リスクが最小になる。
   * 上のヘッダ4条件(1行で言い切る / 安定した公式仕様のみ / 数値は出典があるものだけ /
   * 提供終了・メンテモードは載せない)は全件で満たしている。
   * **版によって伸び縮みする数値は1件も名乗っていない**
   * (AWS Shield の「L3/L4」だけは数字が入るが、これは OSI 参照モデルの層の名前で、
   *  仕様の更新で値が変わる類のものではない)。
   * 長さも全件が上のヘッダ条件①の範囲に収まっている
   * (この17件で字数が多いのは AWS Shield の32字と Amazon MSK の30字だが、
   *  どちらも半角を多く含む(Shield は19字 / MSK は13字が半角)ので、
   *  実際の描画幅は全角26字ぶんに届かない。
   *  **字数ではなく描画幅で見ること**)。
   *
   * 【表記の要注意4件】
   *   Application Load Balancer … Elastic Load Balancing の**機能**(ロードバランサの種類)なので
   *                         Amazon / AWS の接頭辞を付けない。公式の表記もこの3語のまま
   *   NAT ゲートウェイ    … VPC の**機能**なので Amazon / AWS の接頭辞を付けない
   *   Amazon SageMaker AI … 上の 'Amazon SageMaker HyperPod' とは**別エントリ**。
   *                         こちらは学習ジョブとノートブックの統合環境そのもの
   *   AWS Shield          … 上の 'AWS Shield Advanced' とは**別物**(上位プランではない側)。
   *                         標準で効く防御と、大規模攻撃向けの上位防御で言い分けている
   */
  { service: 'Application Load Balancer', oneLiner: 'URLのパスごとにHTTPを振り分けるロードバランサ', tier: 'core', cat: 'network' },
  { service: 'Amazon ECS', oneLiner: 'AWS独自のコンテナオーケストレーター', tier: 'core', cat: 'compute' },
  /*
   * 2026-08-15 椿レビュー(学習機能の検収 major): 'Amazon GameLift' → 'Amazon GameLift Servers'。
   * いまの公式ブランドでは **Amazon GameLift は製品ファミリーの名前**で、
   * その下に用途別の製品が並ぶ(専用サーバのホスティング / ストリーミング 等)。
   * この行が言っている「ゲーム専用サーバーの運用とマッチメイキング」を担うのは
   * ファミリーそのものではなく **Amazon GameLift Servers** なので、
   * サービス名と oneLiner が指すものを一致させた。
   * 対応表(data/services.js の QUIZ_ANSWER_TO_SERVICE)の右辺も同時に直すこと
   * (右辺がここと1文字でも違うと自己点検 verifyServiceMap が警告する)。
   */
  { service: 'Amazon GameLift Servers', oneLiner: 'ゲーム専用サーバーの運用とマッチメイキングを行う', tier: 'core', cat: 'compute' },
  { service: 'Amazon Cognito', oneLiner: 'アプリ利用者のサインアップとログインを預かる', tier: 'core', cat: 'security' },
  { service: 'AWS Config', oneLiner: 'リソースの構成変更を記録してルール違反を判定する', tier: 'core', cat: 'devops' },
  { service: 'Amazon MSK', oneLiner: 'Apache Kafka のクラスタをマネージドで運用できる', tier: 'core', cat: 'data' },
  { service: 'AWS IoT Core', oneLiner: 'たくさんの機器をMQTTでつないでデータを受け取る', tier: 'core', cat: 'other' },
  { service: 'AWS CDK', oneLiner: 'インフラ構成を普段のプログラミング言語で書ける', tier: 'core', cat: 'devops' },
  /*
   * 2026-08-15 椿レビュー(学習機能の検収 minor): 防御の範囲と料金を言い切る形へ。
   * 旧文「ネットワーク層のDDoS攻撃を標準で自動的に防ぐ」は
   *   ・「ネットワーク層」だと L4(トランスポート層)が含まれるか読めない
   *   ・**追加費用なし**という Shield の一番の特徴が落ちている
   * の2点で足りなかった。L3/L4 と Standard という公式の言い方をそのまま使う
   * (L7 の防御と 24時間体制の対応は上の 'AWS Shield Advanced' 側の担当)。
   */
  { service: 'AWS Shield', oneLiner: 'L3/L4のDDoSを標準(Standard)で追加費用なく防ぐ', tier: 'core', cat: 'security' },
  { service: 'Amazon Redshift', oneLiner: '列指向で大規模データを集計するデータウェアハウス', tier: 'core', cat: 'data' },
  { service: 'Amazon EFS', oneLiner: '複数のEC2から同時に使えるNFSの共有ファイル置き場', tier: 'core', cat: 'storage' },
  { service: 'Amazon EC2 Auto Scaling', oneLiner: '負荷に応じてEC2の台数を自動で増減する', tier: 'core', cat: 'compute' },
  { service: 'AWS Organizations', oneLiner: '複数アカウントを組織にまとめて一括請求する', tier: 'core', cat: 'devops' },
  { service: 'AWS Systems Manager', oneLiner: 'EC2のパッチ適用や運用作業を一元管理する', tier: 'core', cat: 'devops' },
  { service: 'Amazon Transcribe', oneLiner: '話した音声を文字に書き起こす', tier: 'core', cat: 'ai' },
  { service: 'Amazon SageMaker AI', oneLiner: '学習ジョブとノートブックを1か所で管理する', tier: 'core', cat: 'ai' },
  { service: 'NAT ゲートウェイ', oneLiner: 'プライベートサブネットからインターネットへ出る出口', tier: 'core', cat: 'network' },
];

/**
 * 直近に出したカードのサービス名(繰り返し防止)。
 * 直近 TRIVIA_RECENT_MAX 件を候補から外すことで
 * **1回のボーナスの中で同じカードを2度見ない**ようにする。
 * @type {string[]}
 */
const recentTrivia = [];

/**
 * 直近に出したカードを何件覚えておくか。
 *
 * 【2026-08-15 椿レビュー #12 で 8 → 16】
 * カードは1ゲームおきに出る(data/scenarios/trivia.js)ので、
 * 1回のボーナスで出る枚数は消化G数の半分になる。data/modes.js の BONUS_SPECS では
 *   シャークボーナス   6G → 3枚
 *   ゴーストボーナス   8G → 4枚
 *   ゴーストボーナスSP 6G/セット。**playedGames はセットをまたいで通算される**ので
 *                      3セットで 18G = **9枚** … 旧値の 8 を超えていた
 * つまり「最大8枚」という前提が SP の継続で崩れていて、
 * 3セット目の途中から同じカードが二度出うる状態だった。
 * 16 にすると 32G ぶん= SP が5セット(30G / 15枚)続いても重複しない。
 * 6セット以上まで伸びるのは継続率 0.50 の4連続突破( 6.25% )の、さらに先。
 * ネタは全99件あるので、16件除外しても候補が枯れることはない
 * (2026-08-15 学習強化で 82 → 99 件へ増えた。除外しても枯れない方向の変化)。
 */
const TRIVIA_RECENT_MAX = 16;

/**
 * 豆知識カードを1枚引く。
 *
 * ■ 乱数について
 *   クイズと同じく **ゲーム抽選RNGは使わない**(既定は Math.random)。
 *   カードは出目にも当落にも一切関与しない表示物なので、
 *   ここで何回引いても ?seed= の再現性は壊れない。
 *
 * @param {object} [opts]
 * @param {() => number} [opts.rand] 演出用乱数
 * @param {string} [opts.service] サービス名を固定したいとき(デバッグ用)
 * @returns {{service:string, oneLiner:string, tier:string}}
 */
export function pickTrivia({ rand = Math.random, service = null } = {}) {
  if (service) {
    const hit = AWS_TRIVIA.find((t) => t.service === service);
    if (hit) return hit;
  }
  const pool = AWS_TRIVIA.filter((t) => !recentTrivia.includes(t.service));
  const src = pool.length > 0 ? pool : AWS_TRIVIA;
  const picked = src[Math.floor(rand() * src.length)] ?? AWS_TRIVIA[0];
  recentTrivia.push(picked.service);
  if (recentTrivia.length > TRIVIA_RECENT_MAX) recentTrivia.shift();
  return picked;
}

/** 繰り返し防止の履歴を捨てる(テスト・検証用) */
export function resetTriviaHistory() {
  recentTrivia.length = 0;
}

/** id 引き(デバッグや検証で特定の問題を指定したいとき用) */
export const QUIZ_BY_ID = Object.fromEntries(QUIZ_QUESTIONS.map((q) => [q.id, q]));

/** 選択肢の数。ルーレットは 2×2 のマス目で回る */
export const QUIZ_CHOICE_COUNT = 4;

/**
 * リール3択クイズ(U64-2)の選択肢数。左 / 中 / 右のリールに1つずつ対応する。
 * 46問は誤答を3つ持っているので、**そのうち2つだけ**を使う(buildReelQuizRound)。
 */
export const REEL_QUIZ_CHOICE_COUNT = 3;

/**
 * 直前に出した問題。2回続けて同じ問題が出ると「さっき見た」と冷めるので避ける。
 * 演出の見た目だけに効く値なので、モジュールに持たせて問題ない。
 * @type {string|null}
 */
let lastQuestionId = null;

/** Fisher-Yates。元配列は壊さない */
function shuffled(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 直前と違う問題を1問引く */
function pickQuestion(rand) {
  const pool = QUIZ_QUESTIONS.length > 1
    ? QUIZ_QUESTIONS.filter((q) => q.id !== lastQuestionId)
    : QUIZ_QUESTIONS;
  const picked = pool[Math.floor(rand() * pool.length)] ?? QUIZ_QUESTIONS[0];
  lastQuestionId = picked.id;
  return picked;
}

/**
 * 1回ぶんの出題を組み立てる。
 *
 * 選択肢は毎回シャッフルするので「正解はいつも左上」にはならない。
 * 不正解のときは誤答3つから1つを選んでそこに止める。
 *
 * @param {object} [opts]
 * @param {boolean} [opts.correct] true で正解に止める。呼び出し側(シナリオ)が当落から決める
 * @param {string}  [opts.quizId]  問題を固定したいとき(デバッグ用)
 * @param {boolean} [opts.nearMiss] true で「正解の隣のマス」に止める(悔しさの演出用)
 * @param {() => number} [opts.rand] 演出用乱数。既定は Math.random(ゲーム抽選RNGとは別系統)
 * @returns {{id:string, question:string, choices:string[], answerIndex:number, stopIndex:number, correct:boolean}}
 */
export function buildQuizRound({ correct = false, quizId = null, nearMiss = false, rand = Math.random } = {}) {
  const q = (quizId && QUIZ_BY_ID[quizId]) || pickQuestion(rand);
  const choices = shuffled([q.answer, ...q.decoys], rand);
  const answerIndex = choices.indexOf(q.answer);

  let stopIndex = answerIndex;
  if (!correct) {
    // 誤答の位置だけを候補にする(正解に止まるのは correct のときだけ)
    let wrong = choices.map((_, i) => i).filter((i) => i !== answerIndex);
    if (nearMiss) {
      // 2×2 のマス目で「正解と同じ行 or 同じ列」= 隣のマスに止める。
      // 対角のマスだけを除くので、外れても “惜しい” 見え方になる
      const near = wrong.filter((i) => (i >> 1) === (answerIndex >> 1) || (i & 1) === (answerIndex & 1));
      if (near.length > 0) wrong = near;
    }
    stopIndex = wrong[Math.floor(rand() * wrong.length)] ?? answerIndex;
  }

  return {
    id: q.id,
    question: q.q,
    choices,
    answerIndex,
    stopIndex,
    correct: Boolean(correct),
  };
}

/**
 * リールに対応させる3択クイズを1問ぶん組み立てる(2026-08-15 ユーザー指示 U64-2)。
 *
 * ══ 4択ルーレット(休止中)との違い ═══════════════════════════════
 * こちらは **プレイヤーが答える** 形式なので、当落の情報を一切持たない:
 *   ・stopIndex(どこに止めるか)は無い。止めるのは人
 *   ・correct も受け取らない。正誤は「押したリール == answerIndex」で
 *     **事実として**決まる(演出側で捻じ曲げない)
 * 当選しているかどうかは出目と抽選で既に決まっていて、この関数とは無関係。
 * 「正解したのに役が不成立」「不正解でもCZ突入」が普通に起きるのが正しい姿で、
 * 表示側(staging/anims/lcdanims-extra.js の reel_pick_choice)が
 * 正誤と当落を別々の行で出し分ける。
 *
 * ■ 乱数
 *   問題選び・誤答2つの選び方・正解の位置は **すべて演出用の rand**(既定 Math.random)。
 *   ゲーム抽選RNG(engine/rng.js)は1回も引かないので、?seed= の再現性は動かない。
 *
 * @param {object} [opts]
 * @param {string} [opts.quizId] 問題を固定したいとき(?quiz= のデバッグ用)
 * @param {() => number} [opts.rand] 演出用乱数
 * @returns {{id:string, question:string, choices:string[], answerIndex:number}}
 *   choices[i] が i 番のリール(0=左 / 1=中 / 2=右)に出る選択肢。
 *   answerIndex が正解のリール番号。
 */
export function buildReelQuizRound({ quizId = null, rand = Math.random } = {}) {
  const q = (quizId && QUIZ_BY_ID[quizId]) || pickQuestion(rand);
  // 誤答3つのうち2つだけを使う。毎回違う組み合わせになるのでマンネリしない
  const decoys = shuffled(q.decoys, rand).slice(0, REEL_QUIZ_CHOICE_COUNT - 1);
  const choices = shuffled([q.answer, ...decoys], rand);
  return {
    id: q.id,
    question: q.q,
    choices,
    answerIndex: choices.indexOf(q.answer),
  };
}

export default QUIZ_QUESTIONS;
