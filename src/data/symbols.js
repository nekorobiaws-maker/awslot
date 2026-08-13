/**
 * 絵柄定義。
 * DESIGN.md 3.1 のMVP8種。
 *
 * `asset` は assets/symbols/ 配下のPNGファイル名。
 * 画像が存在しない場合は render/symbols-draw.js がここの色・ラベル情報を使って
 * プロシージャル描画のプレースホルダを生成する。
 */

export const SYMBOL_IDS = [
  'GHOST7',
  'SHARKBAR',
  'BELL',
  'CHERRY',
  'MELON',
  'LAMBDA',
  'REPLAY',
  'BLANK',
  // Phase 5 追加(DESIGN.md 3.1)
  'REPLAY2',
  'ALARM',
];

export const SYMBOLS = {
  GHOST7: {
    id: 'GHOST7',
    name: '幽霊7',
    motif: 'Kiro',
    asset: 'GHOST7.png',
    label: '7',
    sub: '',
    bg: '#3d1470',
    bg2: '#7a2fd0',
    fg: '#ffffff',
    accent: '#ffe066',
    shape: 'ghost',
  },
  SHARKBAR: {
    id: 'SHARKBAR',
    name: 'サメBAR',
    motif: 'George',
    asset: 'SHARKBAR.png',
    label: 'BAR',
    sub: '',
    bg: '#0b2540',
    bg2: '#17507f',
    fg: '#ffffff',
    accent: '#8ad4ff',
    shape: 'shark',
  },
  BELL: {
    id: 'BELL',
    name: 'ベル',
    motif: 'Amazon EC2',
    asset: 'BELL.png',
    label: 'EC2',
    sub: '',
    // 伝統的スロット絵柄の金ベル + AWS文字。明るいタイル地に図柄を描く
    bg: '#fdf1dc',
    bg2: '#fffaf0',
    fg: '#8a5a00',
    accent: '#f0a500',
    accent2: '#ffd75e',
    shape: 'bell',
  },
  CHERRY: {
    id: 'CHERRY',
    name: 'チェリー',
    motif: 'AWS IAM',
    asset: 'CHERRY.png',
    label: 'IAM',
    sub: '',
    // 伝統的スロット絵柄の赤チェリー + AWS文字
    bg: '#fdf1dc',
    bg2: '#fffaf0',
    fg: '#9b1b20',
    accent: '#d8232a',
    accent2: '#2e9e4f',
    shape: 'cherry',
  },
  MELON: {
    id: 'MELON',
    name: 'スイカ',
    motif: 'Amazon S3',
    asset: 'MELON.png',
    label: 'S3',
    sub: '',
    // 伝統的スロット絵柄のスイカ + AWS文字(CHERRY/BELL と同じ扱い)
    bg: '#fdf1dc',
    bg2: '#fffaf0',
    fg: '#0f5c28',
    accent: '#1e8e3e',
    accent2: '#0b3d1b',
    shape: 'melon',
  },
  LAMBDA: {
    id: 'LAMBDA',
    name: 'ラムダ',
    motif: 'AWS Lambda',
    asset: 'LAMBDA.png',
    label: 'λ',
    // 図柄の機能(チャンス目)が見た目で読めるようにサブラベルを出す
    sub: 'CHANCE',
    bg: '#e0a800',
    bg2: '#ffd95e',
    fg: '#2b1d00',
    accent: '#fff3c4',
    shape: 'lambda',
  },
  REPLAY: {
    id: 'REPLAY',
    name: 'リプレイ',
    motif: 'Amazon DynamoDB',
    asset: 'REPLAY.png',
    // 実機のリプレイ絵柄風に、機能名をそのまま表示する
    label: 'REPLAY',
    sub: '',
    bg: '#2557c7',
    bg2: '#5b8ef5',
    fg: '#ffffff',
    accent: '#c8dcff',
    shape: 'scale',
  },
  REPLAY2: {
    id: 'REPLAY2',
    name: 'リプレイ2',
    motif: 'Amazon Route 53',
    asset: 'REPLAY2.png',
    label: 'REPLAY',
    sub: '',
    // REPLAY(青)と一目で区別できるよう、Route 53 のコンパス色(緑〜青緑)にする。
    // プレースホルダ描画は REPLAY と同じ shape:'scale' を流用する。
    bg: '#0e6b52',
    bg2: '#25a97f',
    fg: '#ffffff',
    accent: '#bff5e2',
    shape: 'scale',
  },
  ALARM: {
    id: 'ALARM',
    name: 'Bedrock',
    motif: 'Amazon Bedrock(脳+回路)',
    asset: 'ALARM.png',
    // 旧CloudWatchアラーム役の名残(label:'CW'/警報赤/bell)を廃止し、
    // 実画像(青緑の脳=Bedrock)に合わせる(2026-08-13 しおん指摘#5)
    label: 'Bedrock',
    sub: '',
    bg: '#0d3a38',
    bg2: '#14555a',
    fg: '#d9fff8',
    accent: '#38e8c8',
    accent2: '#9ef5e4',
    shape: 'brain',
  },
  BLANK: {
    id: 'BLANK',
    name: 'ブランク(SES)',
    motif: 'Amazon SES(メール送信)',
    asset: 'BLANK.png',
    // ハズレ埋めと分かるよう、文字なし・彩度低めの地味なタイルにする
    label: '',
    sub: '',
    bg: '#3a3c42',
    bg2: '#4a4d55',
    fg: '#6f727b',
    accent: '#565961',
    shape: 'queue',
  },
};

/** 絵柄1コマの論理サイズ(px)。DESIGN.md 6.4 */
export const SYMBOL_W = 120;
export const SYMBOL_H = 60;
