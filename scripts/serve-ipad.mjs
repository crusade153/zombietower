import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const classic = path.join(project, 'dist');
const port = Number(process.env.FROST_TOWER_PORT || 5173);
const gzip = promisify(zlib.gzip);
const compressed = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    const url = new URL(req.url, 'http://localhost');
    const root = classic;
    const relative = decodeURIComponent(url.pathname.slice(1)) || 'index.html';
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const stat = await fs.stat(target);
    if (!stat.isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Accept-Encoding');
    const useGzip = /gzip/.test(req.headers['accept-encoding'] || '') && /\.(wasm|pck|html|js|css|json)$/.test(target);
    if (useGzip) {
      const key = `${target}:${stat.mtimeMs}`;
      if (!compressed.has(key)) compressed.set(key, gzip(await fs.readFile(target)));
      const body = await compressed.get(key);
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', body.length);
      res.end(req.method === 'HEAD' ? undefined : body);
    } else {
      const body = await fs.readFile(target);
      res.setHeader('Content-Length', body.length);
      res.end(req.method === 'HEAD' ? undefined : body);
    }
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' ? 404 : 500).end('파일을 불러올 수 없습니다.');
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '0.0.0.0', () => {
  console.log('아이패드와 이 PC를 같은 Wi-Fi에 연결한 뒤 Safari에서 아래 주소를 여세요.');
  for (const entries of Object.values(os.networkInterfaces())) for (const entry of entries || []) {
    if (entry.family === 'IPv4' && !entry.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)) {
      console.log(`아이패드 접속: http://${entry.address}:${port}/`);
    }
  }
  console.log(`PC 확인: http://localhost:${port}/`);
  console.log('PC가 켜져 있고 이 서버가 실행 중인 동안 접속할 수 있습니다.');
});
