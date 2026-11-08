/**
 * Servidor local de desarrollo: sirve el sitio y acepta POST /signup guardando en JSONL.
 * Replica el contrato del Worker para que puedas probar el flujo completo sin desplegar.
 *
 *   node server.mjs            -> http://localhost:4321
 */
import http from 'node:http';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SITE = join(__dirname, 'site');
const DATA_DIR = join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'leads.jsonl');
const PORT = Number(process.env.PORT || 4321);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw new Error('payload-too-large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS para el desarrollo con el navegador
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (url.pathname === '/signup' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return send(res, 400, JSON.stringify({ ok: false, error: 'invalid-json' }), { 'Content-Type': 'application/json' });
      }
      const email = String(payload.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
        return send(res, 400, JSON.stringify({ ok: false, error: 'invalid-email' }), { 'Content-Type': 'application/json' });
      }
      if (!payload.consent) {
        return send(res, 400, JSON.stringify({ ok: false, error: 'no-consent' }), { 'Content-Type': 'application/json' });
      }
      if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
      await appendFile(DATA_FILE, JSON.stringify({ receivedAt: new Date().toISOString(), ...payload }) + '\n', 'utf8');
      const count = (await readFile(DATA_FILE, 'utf8')).split('\n').filter(Boolean).length;
      return send(res, 200, JSON.stringify({ ok: true, email, count }), { 'Content-Type': 'application/json' });
    } catch (e) {
      return send(res, 500, JSON.stringify({ ok: false, error: String(e) }), { 'Content-Type': 'application/json' });
    }
  }

  if (url.pathname === '/count') {
    try {
      const content = existsSync(DATA_FILE) ? await readFile(DATA_FILE, 'utf8') : '';
      const count = content.split('\n').filter(Boolean).length;
      return send(res, 200, JSON.stringify({ count }), { 'Content-Type': 'application/json' });
    } catch {
      return send(res, 200, JSON.stringify({ count: 0 }), { 'Content-Type': 'application/json' });
    }
  }

  if (url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ ok: true }), { 'Content-Type': 'application/json' });
  }

  // Archivos estáticos
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const target = resolve(SITE, '.' + normalize(pathname));
  if (!target.startsWith(SITE)) return send(res, 403, 'Forbidden');

  if (existsSync(target) && statSync(target).isFile()) {
    res.writeHead(200, {
      'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    return createReadStream(target).pipe(res);
  }

  return send(res, 404, 'Not found');
});

server.listen(PORT, () => {
  console.log(`KLARO dev server -> http://localhost:${PORT}`);
  console.log(`Datos de reservas -> ${DATA_FILE}`);
});
