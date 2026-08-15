/**
 * 見た目確認用スクリーンショット撮影(luna / V80 対応の before-after 用)。
 *
 * 使い方:
 *   node scripts/shot.mjs <outDir> <preset> [preset...]
 *
 * プリセットは PRESETS のキー。液晶(#lcd)のクロップと全景の両方を出す。
 * ブラウザは必ず browser.close() で閉じる(pkill 禁止)。
 */
import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';

const BASE = 'http://127.0.0.1:8123/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 各プリセット: { url, steps:[{key?, wait, shot}] } */
const PRESETS = {
  bonus: {
    url: `${BASE}?debug=1&mode=BONUS&seed=11&turbo=3`,
    frames: 22,
    stepMs: 900,
    play: true,
  },
  bonus_sp: {
    url: `${BASE}?debug=1&mode=BONUS&seed=4242&turbo=3`,
    frames: 22,
    stepMs: 900,
    play: true,
  },
  bonus_ready: {
    url: `${BASE}?debug=1&mode=BONUS_READY&seed=77&turbo=2`,
    frames: 8,
    stepMs: 800,
    play: true,
  },
  freeze: {
    url: `${BASE}?debug=1&freeze=1&seed=31&turbo=1`,
    frames: 26,
    stepMs: 900,
    play: true,
    playOnce: true,
  },
  hero: {
    url: `${BASE}?debug=1&mode=HERO_RUSH&seed=9&turbo=1`,
    frames: 14,
    stepMs: 420,
    play: true,
  },
  as_rush: { url: `${BASE}?debug=1&mode=AS_RUSH&seed=5&turbo=1`, frames: 6, stepMs: 800, play: true },
  cf_rush: { url: `${BASE}?debug=1&mode=CF_RUSH&seed=5&turbo=1`, frames: 6, stepMs: 800, play: true },
  aurora_rush: { url: `${BASE}?debug=1&mode=AURORA_RUSH&seed=5&turbo=1`, frames: 6, stepMs: 800, play: true },
  result: { url: `${BASE}?debug=1&turbo=10&seed=3`, frames: 40, stepMs: 400, play: true },
  ama: { url: `${BASE}?debug=1&ama=1&mode=BONUS&seed=8&turbo=1`, frames: 14, stepMs: 800, play: true },
  ama_cz: { url: `${BASE}?debug=1&ama=1&mode=CZ&seed=8&turbo=1`, frames: 8, stepMs: 800, play: true },
  quiz: { url: `${BASE}?debug=1&rp=1&seed=77&turbo=1`, frames: 30, stepMs: 800, play: true },
  textract: { url: `${BASE}?debug=1&yw=textract&seed=21&turbo=1`, frames: 20, stepMs: 700, play: true },
};

for (const id of ['CW_ALARM', 'SQS_REDRIVE', 'CONFIG_RULES', 'ALB_CZ', 'DX_REDUNDANCY',
  'TRUSTED_ADVISOR', 'SFN_CZ', 'CODEDEPLOY_BG', 'SHIELD_DDOS', 'FIS_GAMEDAY', 'WELL_ARCHITECTED']) {
  PRESETS[`cz_${id}`] = {
    url: `${BASE}?debug=1&mode=CZ&czId=${id}&seed=5&turbo=1`,
    frames: 4,
    stepMs: 900,
    play: true,
  };
}

async function shoot(page, dir, name) {
  const lcd = await page.$('#lcd');
  if (lcd) await lcd.screenshot({ path: `${dir}/${name}.png` }).catch(() => {});
}

async function run() {
  const [outDir, ...names] = process.argv.slice(2);
  if (!outDir || names.length === 0) {
    console.error('usage: node scripts/shot.mjs <outDir> <preset...>');
    process.exit(1);
  }
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const name of names) {
      const p = PRESETS[name];
      if (!p) { console.warn(`unknown preset: ${name}`); continue; }
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
      const page = await ctx.newPage();
      await page.goto(p.url, { waitUntil: 'load' });
      await page.waitForTimeout(1400);
      // 音を出さないまま進めるために click でユーザー操作扱いにしておく
      await page.mouse.click(20, 20).catch(() => {});
      for (let i = 0; i < p.frames; i++) {
        if (p.play && (!p.playOnce || i === 0)) {
          // ↑ ×2 で BET → レバーON、その後に ← ↓ → で3リールを止める(自動停止は無い)
          for (const key of ['ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) {
            await page.keyboard.press(key).catch(() => {});
            await page.waitForTimeout(110);
          }
        }
        await page.waitForTimeout(p.stepMs);
        await shoot(page, outDir, `${name}-${String(i).padStart(2, '0')}`);
      }
      await page.screenshot({ path: `${outDir}/${name}-full.png` });
      await ctx.close();
      console.log(`done: ${name}`);
    }
  } finally {
    await browser.close();
  }
}

run().then(() => sleep(0));
