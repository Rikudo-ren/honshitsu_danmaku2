/* =============================================================================
 * server.js — 開発／配信用の静的サーバ
 *
 *  使い方:  node server.js  [--port 8080] [--host 0.0.0.0]
 *  ※ ビルド不要。素の ES5+ 相当のスクリプトをそのまま配る。
 *     ゲームは file:// でも動くが、フォントと画像の読み込みを考えると
 *     HTTP 経由のほうが確実。
 * ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : dflt;
};
const PORT = Number(process.env.PORT || getArg('--port', 8080));
const HOST = process.env.HOST || getArg('--host', '0.0.0.0');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.map': 'application/json; charset=utf-8',
};

function safeJoin(root, reqPath) {
  // パストラバーサル防止: 正規化して root の外に出ないことを確認する
  const decoded = decodeURIComponent(reqPath.split('?')[0]);
  const p = path.normalize(path.join(root, decoded));
  if (!p.startsWith(root)) return null;
  return p;
}

const server = http.createServer((req, res) => {
  let p = safeJoin(ROOT, url.parse(req.url).pathname);
  if (!p) { res.writeHead(403).end('403'); return; }
  fs.stat(p, (err, st) => {
    if (!err && st.isDirectory()) p = path.join(p, 'index.html');
    fs.readFile(p, (err2, buf) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found: ' + path.relative(ROOT, p));
        return;
      }
      const ext = path.extname(p).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=60',
        // 埋め込みプレビューでも動くように制限をかけない
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(buf);
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`✝本質✝ dev server: http://localhost:${PORT}/  (bind ${HOST}:${PORT})`);
  console.log(`  ルート: ${ROOT}`);
});
