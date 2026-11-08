import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ledger, LedgerError } from '../dist/server/ledger.js';
import { openPreviewDatabase, sqlAdapter } from './local-database.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const database = openPreviewDatabase();
const owner = 'local-preview:' + database.prepare("SELECT value FROM app_meta WHERE key='preview-id'").get().value;
const ledger = new Ledger(sqlAdapter(database), owner);
const port = Number(process.env.FINANCE_PREVIEW_PORT ?? 4173);
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(value));
}
const server = createServer(async (request, response) => {
  try {
    if (!allowedHosts.has(request.headers.host)) return json(response, 403, { error: '此預覽只允許本機存取。' });
    const origin = 'http://' + request.headers.host;
    const url = new URL(request.url, origin);
    if (request.method !== 'GET' && request.headers.origin !== origin) return json(response, 403, { error: '來源驗證失敗。' });
    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'GET' && url.pathname === '/api/bootstrap') return json(response, 200, await ledger.bootstrap(url.searchParams.get('month') ?? undefined));
      if (request.method === 'GET' && url.pathname === '/api/budget') return json(response, 200, await ledger.budget(url.searchParams.get('month') ?? ''));
      if (request.method === 'GET' && url.pathname === '/api/entries') return json(response, 200, await ledger.entries(url.searchParams.get('month') ?? '', url.searchParams.get('q') ?? '', Number(url.searchParams.get('page') ?? 0)));
      if (request.method === 'GET' && url.pathname === '/api/history') return json(response, 200, await ledger.history());
      if (request.method === 'POST' && url.pathname === '/api/entries') {
        if (!request.headers['content-type']?.startsWith('application/json')) return json(response, 415, { error: '請使用 JSON 記帳。' });
        const chunks = []; let length = 0;
        for await (const chunk of request) { length += chunk.length; if (length > 8192) throw new LedgerError('記帳內容過長。', 413); chunks.push(chunk); }
        let input; try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new LedgerError('記帳格式不正確。'); }
        const result = await ledger.save(input);
        return json(response, result.replay ? 200 : 201, result);
      }
      return json(response, 404, { error: '此操作尚未提供。' });
    }
    if (request.method !== 'GET') return json(response, 405, { error: '不支援此操作。' });
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    // Explicit asset allowlist: never serve .private, the database, source files or node_modules.
    const clientFiles = new Set(['app.js', 'queue.js']);
    const publicFiles = new Set(['index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg', 'sw.js']);
    if (!clientFiles.has(file) && !publicFiles.has(file)) return json(response, 404, { error: '找不到頁面。' });
    const filename = path.join(root, clientFiles.has(file) ? 'dist/client' : 'public', file);
    statSync(filename);
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'" });
    response.end(readFileSync(filename));
  } catch (error) {
    if (error instanceof LedgerError) json(response, error.status, { error: error.message });
    else { console.error('Preview request failed:', error?.name); json(response, 500, { error: '暫時無法處理，輸入仍會保留，請稍後重試。' }); }
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Finance preview: http://127.0.0.1:${port}/ (isolated local ledger; no production writes)`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { database.close(); process.exit(0); }));
