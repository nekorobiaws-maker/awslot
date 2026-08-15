/**
 * 液晶窓と筐体アートの黒面の左右余白を実測する(V80-2 用の使い捨て計測)。
 * node scripts/measure-bezel.mjs
 */
import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8123/?debug=1&turbo=1', { waitUntil: 'load' });
await page.waitForTimeout(2500);

const out = await page.evaluate(() => {
  const cab = document.getElementById('cabinet');
  const art = document.getElementById('cabinet-art');
  const lcd = document.getElementById('lcd');
  const cr = cab.getBoundingClientRect();
  const lr = lcd.getBoundingClientRect();
  const c = document.createElement('canvas');
  c.width = art.width; c.height = art.height;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(art, 0, 0);
  const sx = art.width / 720;
  const sy = art.height / 1080;
  const k = cr.width / 720;
  const top = (lr.top - cr.top) / k;
  const bot = (lr.bottom - cr.top) / k;
  const img = cx.getImageData(0, 0, art.width, art.height).data;
  const lum = (x, y) => {
    const i = (y * art.width + x) * 4;
    return (img[i] + img[i + 1] + img[i + 2]) / 3;
  };
  const TH = 24;                     // 黒面のしきい値
  const mid = Math.round(360 * sx);
  const lefts = []; const rights = [];
  for (let f = 0.12; f <= 0.88; f += 0.02) {
    const y = Math.round((top + (bot - top) * f) * sy);
    let l = mid; while (l > 0 && lum(l - 1, y) < TH) l--;
    let r = mid; while (r < art.width - 1 && lum(r + 1, y) < TH) r++;
    lefts.push(l / sx); rights.push(r / sx);
  }
  const med = (a) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
  return {
    lcd: { x0: +((lr.left - cr.left) / k).toFixed(3), x1: +((lr.right - cr.left) / k).toFixed(3) },
    black: { x0: +med(lefts).toFixed(3), x1: +med(rights).toFixed(3) },
    samples: lefts.length,
  };
});
const gapL = out.lcd.x0 - out.black.x0;
const gapR = out.black.x1 - out.lcd.x1;
console.log(JSON.stringify(out));
console.log(`black-opening gap left=${gapL.toFixed(3)} right=${gapR.toFixed(3)} diff=${(gapR - gapL).toFixed(3)}`);
console.log(`対称にするための論理x1 = ${(out.black.x1 - gapL).toFixed(3)}  → src = ${(((out.black.x1 - gapL) - 360) / 0.76 + 541).toFixed(2)}`);
await browser.close();
