/**
 * AWSクイズルーレット演出のデータ定義。docs/BACKLOG.md「P: AWSクイズルーレット演出」
 *
 * 液晶に「◯◯をしたい。どのサービス?」と出題し、4択がルーレットで回って止まる。
 * 止まった選択肢が正解なら CZ 突入、不正解ならガセ終了。
 *
 * ■ 当落とのつながり(重要)
 *   ここには「正解かどうか」を決める仕組みは無い。
 *   正解 / 不正解は呼び出し側(= シナリオが渡す params.correct)が決める。
 *   そのシナリオは
 *     正解版   … CZ の modeEnter          (= CZ突入が確定した後にしか起きない)
 *     不正解版 … 前兆の zencho_end / MISS  (= 当選していないことが確定している)
 *   という「結果が確定したイベント」でしか発火しないので、
 *   「正解に止まった = 当選している」が構造的に保証される。
 *   詳細は src/data/scenarios/quiz.js を参照。
 *
 * ■ 乱数について
 *   問題選び・選択肢シャッフル・不正解時の停止位置は、いずれも演出の見た目だけを
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
    id: 'kendra',
    // OpenSearch はキーワード/ベクタ検索基盤。「自然言語で聞く」社内文書検索は Kendra
    q: '社内文書を自然言語で検索',
    answer: 'Kendra',
    decoys: ['OpenSearch', 'CloudSearch', 'Comprehend'],
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
    // Comprehend / Kendra は用途特化のAIサービスで、基盤モデルの提供口ではない
    q: '基盤モデルをAPIで呼びたい',
    answer: 'Bedrock',
    decoys: ['SageMaker', 'Comprehend', 'Kendra'],
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

/** id 引き(デバッグや検証で特定の問題を指定したいとき用) */
export const QUIZ_BY_ID = Object.fromEntries(QUIZ_QUESTIONS.map((q) => [q.id, q]));

/** 選択肢の数。ルーレットは 2×2 のマス目で回る */
export const QUIZ_CHOICE_COUNT = 4;

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

export default QUIZ_QUESTIONS;
