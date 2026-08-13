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
 * 出題リスト(10問)。
 *   q      … 問題文(液晶の横幅に収まるよう 16 文字以内を目安)
 *   answer … 正解のサービス名
 *   decoys … 誤答3つ。「機能が近い」「名前が紛らわしい」ものを混ぜて、
 *            知っていれば必ず解けるが、知らないと迷う難度にしてある
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
    id: 'satellite',
    q: '人工衛星と通信したい',
    answer: 'Ground Station',
    decoys: ['Direct Connect', 'Site-to-Site VPN', 'IoT Core'],
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
