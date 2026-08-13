#!/usr/bin/env node
/**
 * AWSLOT 開発用の静的サーバ(Node標準モジュールのみ)。
 *
 *   node scripts/serve.mjs           → http://localhost:8123/
 *   node scripts/serve.mjs 9000      → ポート指定
 *
 * ESモジュールは file:// では読み込めないため(DESIGN.md 注意事項1)、
 * 必ずこのサーバか同等の静的サーバ経由で開くこと。
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8123);
const HOST = process.env.HOST ?? '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** ルート外へのアクセスを防ぐ */
function resolveSafe(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const clean = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const target = resolve(join(ROOT, clean));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  return target;
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  let filePath = resolveSafe(req.url ?? '/');

  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  try {
    let info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) {
      filePath = join(filePath, 'index.html');
      info = await stat(filePath).catch(() => null);
    }
    if (!info?.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      // 絵柄PNG未配置は想定内なのでログを控えめにする
      if (!filePath.includes(`assets${sep}symbols`)) {
        console.log(`  404 ${req.url}`);
      }
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
    });
    res.end(body);
    console.log(`  200 ${req.url} (${body.length}B, ${Date.now() - started}ms)`);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Internal Server Error');
    console.error(`  500 ${req.url}`, err);
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  AWSLOT dev server');
  console.log(`  → http://${HOST}:${PORT}/`);
  console.log(`  root: ${ROOT}`);
  console.log('  Ctrl+C で停止');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ポート ${PORT} は使用中です。別のポートを指定してください:`);
    console.error(`  node scripts/serve.mjs ${PORT + 1}\n`);
    process.exit(1);
  }
  throw err;
});
