/**
 * AWSサービスの「分類」と、クイズ ↔ 豆知識をつなぐ対応表(2026-08-15 学習強化 L2)。
 *
 * ══ 何のためのファイルか ═══════════════════════════════════════════
 * 豆知識カード(data/quiz.js の AWS_TRIVIA)とクイズ(QUIZ_QUESTIONS)は、
 * これまで **別々のテキスト**として存在していた。学習記録(data/learnlog.js)は
 *   「どのサービスに出会ったか」「どの分野が苦手か」
 * を積み上げるため、両者を **同じサービス名**へ寄せる必要がある。
 * その名寄せと分類だけをここに置く(描き方も記録も持たない、純粋なデータ)。
 *
 * ■ 依存の向き
 *   data/quiz.js  ←  ここ  ←  data/learnlog.js / staging/anims/lcdanims-extra.js
 *   quiz.js からここを import してはいけない(循環になる)。
 *
 * ■ 乱数を1回も引かない
 *   分類も名寄せも固定表なので、ゲーム抽選RNGはもちろん Math.random も使わない。
 */

import { AWS_TRIVIA, QUIZ_QUESTIONS } from './quiz.js';

/**
 * サービスの分類9種。
 *
 * ■ 9種に決めた理由と、はみ出すものの寄せ方(**分類の正はこのコメント**)
 *   AWS 公式のサービス別カテゴリは20種類以上あるが、液晶のピル1個と
 *   リザルトの1行に収めるには多すぎる。学習の入口として意味がある粒度まで畳み、
 *   畳んだ結果はみ出すものは以下のルールで寄せた:
 *     ・アプリ統合(SQS / EventBridge / Step Functions)… `devops`
 *       「アプリを組み立てるための部品」なので **開発**側に含める
 *     ・分析基盤(Redshift / Athena / Glue / MSK / QuickSight)… `data`
 *     ・置き場所(Local Zones / Wavelength)… `compute`
 *       そこで**アプリを動かす**ためのものなので計算資源側に寄せる
 *     ・どの箱にも入らないもの(量子 / IoT / メール / ライセンス / コスト)… `other`
 *   **迷ったら other に落とす**。無理に分類すると学習の嘘になる。
 *
 * color は液晶のピルとリザルトのチップの枠色。液晶の暗い地の上で読める明度に揃えてある。
 * @type {{id:string, label:string, color:string}[]}
 */
export const CATEGORIES = [
  { id: 'compute', label: 'コンピュート', color: '#ffb04a' },
  { id: 'storage', label: 'ストレージ', color: '#7bf7d0' },
  { id: 'database', label: 'データベース', color: '#8ab4ff' },
  { id: 'network', label: 'ネットワーク・配信', color: '#7cf3ff' },
  { id: 'security', label: 'セキュリティ・ID', color: '#ff8ab4' },
  { id: 'data', label: 'データ分析', color: '#c8a0ff' },
  { id: 'ai', label: 'AI・機械学習', color: '#ff6fd8' },
  { id: 'devops', label: '開発・運用', color: '#ffe066' },
  { id: 'other', label: 'その他', color: '#c8d2e8' },
];

/** id 引き。未知の id は other へ丸める(categoryOfService 参照) */
export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/** 分類が付いていない・未知の id だったときの受け皿 */
const FALLBACK_CATEGORY = CATEGORY_BY_ID.other;

/**
 * クイズの正解名(短縮表記)→ 豆知識カードの正式名。
 *
 * ══ 【最重要】部分一致で解決しないこと ═══════════════════════════════
 * 46件すべてを **明示的に**書いている。`includes` や `startsWith` で解決すると
 *   'Lambda'         → 'AWS Lambda 関数URL'(機能)
 *   'Step Functions' → 'AWS Step Functions Distributed Map'(機能)
 *   'Shield'         → 'AWS Shield Advanced'(上位プラン)
 *   'Redshift'       → 'Amazon Redshift Serverless'(別の提供形態)
 *   'SageMaker'      → 'Amazon SageMaker HyperPod'(別サービス)
 *   'Systems Manager'→ 'AWS Systems Manager Session Manager'(機能)
 *   'EventBridge'    → 'Amazon EventBridge Scheduler'(機能)
 * のように **上位プラン・派生機能へ誤マッピング** する。
 * 図鑑が事実と食い違う最短経路なので、表を足すときも必ず1件ずつ書くこと。
 *
 * 右辺は必ず AWS_TRIVIA の service と**完全一致**させる(下の自己点検が見張る)。
 * @type {Record<string, string>}
 */
export const QUIZ_ANSWER_TO_SERVICE = {
  // ── コンピュート / コンテナ ──
  'Lambda': 'AWS Lambda',                          // ≠ AWS Lambda 関数URL
  'ECS': 'Amazon ECS',                             // ≠ AWS Fargate(実行方式)
  'Fargate': 'AWS Fargate',
  'ECR': 'Amazon ECR',
  'Auto Scaling': 'Amazon EC2 Auto Scaling',       // 台数を増減する側。ALB とは別物
  // 2026-08-15 椿レビュー(学習機能の検収 major): 'Amazon GameLift' → 'Amazon GameLift Servers'。
  // Amazon GameLift は**製品ファミリーの名前**で、専用サーバのホスティングと
  // マッチメイキングを担うのはその中の Amazon GameLift Servers。
  // クイズの正解 'GameLift' が指しているのは後者なので、行き先をそちらへ合わせた
  'GameLift': 'Amazon GameLift Servers',

  // ── ストレージ ──
  'S3': 'Amazon S3',                               // ≠ Amazon S3 Glacier
  'S3 Glacier': 'Amazon S3 Glacier',
  'EFS': 'Amazon EFS',                             // ≠ FSx for Windows File Server(SMB)

  // ── データベース ──
  'DynamoDB': 'Amazon DynamoDB',
  'ElastiCache': 'Amazon ElastiCache',             // ≠ Amazon MemoryDB
  'Neptune': 'Amazon Neptune',
  'Redshift': 'Amazon Redshift',                   // ≠ Amazon Redshift Serverless

  // ── ネットワーク・配信 ──
  'CloudFront': 'Amazon CloudFront',
  'Route 53': 'Amazon Route 53',                   // ≠ Amazon Route 53 Resolver
  'ALB': 'Application Load Balancer',
  'API Gateway': 'Amazon API Gateway',
  'Transit Gateway': 'AWS Transit Gateway',
  'Direct Connect': 'AWS Direct Connect',
  'NAT Gateway': 'NAT ゲートウェイ',                // VPC の機能なので接頭辞は付かない

  // ── セキュリティ・ID ──
  'Macie': 'Amazon Macie',
  'Cognito': 'Amazon Cognito',
  'ACM': 'AWS Certificate Manager',
  'Shield': 'AWS Shield',                          // ≠ AWS Shield Advanced(上位プラン)
  'GuardDuty': 'Amazon GuardDuty',
  'Secrets Manager': 'AWS Secrets Manager',

  // ── データ分析 ──
  'Athena': 'Amazon Athena',
  'Glue': 'AWS Glue',
  'MSK': 'Amazon MSK',

  // ── AI・機械学習 ──
  'Rekognition': 'Amazon Rekognition',
  'Transcribe': 'Amazon Transcribe',               // ≠ Amazon Polly(逆向き)
  'SageMaker': 'Amazon SageMaker AI',              // ≠ Amazon SageMaker HyperPod
  'Bedrock': 'Amazon Bedrock',                     // ≠ Amazon Bedrock Knowledge Bases

  // ── 開発・運用 ──
  'Config': 'AWS Config',
  'CDK': 'AWS CDK',
  'CloudTrail': 'AWS CloudTrail',
  'X-Ray': 'AWS X-Ray',
  'CodePipeline': 'AWS CodePipeline',
  'Organizations': 'AWS Organizations',
  'Systems Manager': 'AWS Systems Manager',        // ≠ Session Manager(機能)
  'Step Functions': 'AWS Step Functions',          // ≠ Distributed Map(機能)
  'SQS': 'Amazon SQS',
  'EventBridge': 'Amazon EventBridge',             // ≠ Amazon EventBridge Scheduler

  // ── その他 ──
  'SES': 'Amazon SES',
  'IoT Core': 'AWS IoT Core',
  'Braket': 'Amazon Braket',
};

/** 豆知識カードの正式名 → 分類id(AWS_TRIVIA が正) */
const CAT_BY_SERVICE = new Map(AWS_TRIVIA.map((t) => [t.service, t.cat]));

/** 図鑑に載っているサービス名の集合(記録の取りこぼし・持ち越しを弾くのに使う) */
export const DEX_NAMES = new Set(AWS_TRIVIA.map((t) => t.service));

/**
 * 図鑑の総数。**数値を直書きしない**(件数を増やしたときに画面だけ古い数字を名乗るため)。
 * @type {number}
 */
export const DEX_TOTAL = AWS_TRIVIA.length;

/**
 * クイズの正解名から豆知識の正式名を引く。表に無ければ null。
 * @param {string|null|undefined} answer QUIZ_QUESTIONS の answer
 * @returns {string|null}
 */
export function resolveServiceByQuizAnswer(answer) {
  if (typeof answer !== 'string') return null;
  return QUIZ_ANSWER_TO_SERVICE[answer] ?? null;
}

/**
 * サービスの正式名から分類を引く。未知なら「その他」。
 * @param {string|null|undefined} name AWS_TRIVIA の service
 * @returns {{id:string, label:string, color:string}}
 */
export function categoryOfService(name) {
  if (typeof name !== 'string') return FALLBACK_CATEGORY;
  const id = CAT_BY_SERVICE.get(name);
  return (id && CATEGORY_BY_ID[id]) || FALLBACK_CATEGORY;
}

/**
 * 公式ページへの誘導(L7)。**主要15件だけ**。
 *
 * 全99件ぶんのURLを持つと、改名・統合のたびに死んだリンクが混ざる
 * (このリポジトリが何度も潰してきた「事実と違うことを名乗る」事故と同じ形)。
 * ここに載せるのは **サービスの入口ページで、slug が長年変わっていないもの**に限る。
 * @type {Record<string, string>}
 */
export const SERVICE_DOCS = {
  'Amazon S3': 'https://aws.amazon.com/jp/s3/',
  'AWS Lambda': 'https://aws.amazon.com/jp/lambda/',
  'Amazon DynamoDB': 'https://aws.amazon.com/jp/dynamodb/',
  'Amazon CloudFront': 'https://aws.amazon.com/jp/cloudfront/',
  'Amazon Route 53': 'https://aws.amazon.com/jp/route53/',
  'Amazon Aurora': 'https://aws.amazon.com/jp/rds/aurora/',
  'Amazon ECS': 'https://aws.amazon.com/jp/ecs/',
  'AWS Fargate': 'https://aws.amazon.com/jp/fargate/',
  'Amazon SQS': 'https://aws.amazon.com/jp/sqs/',
  'Amazon EventBridge': 'https://aws.amazon.com/jp/eventbridge/',
  'AWS Step Functions': 'https://aws.amazon.com/jp/step-functions/',
  'Amazon Bedrock': 'https://aws.amazon.com/jp/bedrock/',
  'Amazon Athena': 'https://aws.amazon.com/jp/athena/',
  'Amazon Redshift': 'https://aws.amazon.com/jp/redshift/',
  'Amazon API Gateway': 'https://aws.amazon.com/jp/api-gateway/',
};

/**
 * 公式ページのURL。持っていなければ null(リンクにせず、ただの文字として出す)。
 * @param {string|null|undefined} name
 * @returns {string|null}
 */
export function docsOfService(name) {
  if (typeof name !== 'string') return null;
  return SERVICE_DOCS[name] ?? null;
}

/**
 * データの自己点検。壊れていたときだけ内容を返す(正常なら空配列)。
 *
 * ここが崩れると **図鑑の総数と実際に集められる数が食い違う**(永久に埋まらない図鑑)。
 * 気づける場所が無いので、モジュール読み込み時に1度だけ走らせて警告する。
 * @returns {string[]} 問題の説明。空なら健全
 */
export function verifyServiceMap() {
  const problems = [];

  // ① 対応表の右辺が豆知識に存在するか(誤字・改名の検出)
  for (const [answer, service] of Object.entries(QUIZ_ANSWER_TO_SERVICE)) {
    if (!DEX_NAMES.has(service)) problems.push(`対応表の行き先が豆知識に無い: ${answer} → ${service}`);
  }
  // ② クイズの正解すべてに行き先があるか(図鑑に埋まらない正解が出ないように)
  for (const q of QUIZ_QUESTIONS) {
    if (!QUIZ_ANSWER_TO_SERVICE[q.answer]) problems.push(`クイズの正解に対応表が無い: ${q.id} / ${q.answer}`);
  }
  // ③ 豆知識の全件に分類が付いているか
  for (const t of AWS_TRIVIA) {
    if (!t.cat) problems.push(`豆知識に cat が無い: ${t.service}`);
    else if (!CATEGORY_BY_ID[t.cat]) problems.push(`豆知識の cat が未知: ${t.service} / ${t.cat}`);
  }
  // ④ 公式リンクの宛先が実在するサービス名か
  for (const name of Object.keys(SERVICE_DOCS)) {
    if (!DEX_NAMES.has(name)) problems.push(`公式リンクの宛先が豆知識に無い: ${name}`);
  }
  return problems;
}

/*
 * 読み込み時の自己点検。健全なら1行も出さないので、
 * scripts/sim.mjs や compare-drivers.mjs の出力を汚さない。
 */
{
  const problems = verifyServiceMap();
  if (problems.length > 0) {
    console.warn(`[JAWSLOT] data/services.js の対応表に問題があります:\n  ${problems.join('\n  ')}`);
  }
}

export default CATEGORIES;
