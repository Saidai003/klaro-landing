/**
 * KLARO — backend de reservas.
 * Cloudflare Worker + D1 (plan gratuito: 100.000 req/día, 5 GB de base).
 *
 * Rutas:
 *   POST /signup   -> guarda la reserva (JSON)
 *   GET  /count    -> { count: n }
 *   GET  /health   -> { ok: true }
 *
 * Despliegue:
 *   npm i -g wrangler
 *   wrangler login
 *   wrangler d1 create klaro-leads     # anota el database_id que devuelve
 *   # edita wrangler.toml con ese database_id
 *   wrangler d1 execute klaro-leads --file=./schema.sql
 *   wrangler deploy
 *   # pega la URL https://klaro-signup.<tu>.workers.dev en site/assets/config.js
 */

const ALLOWED_ORIGIN = '*';

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) },
  });
}

/** Recorta y sanea cualquier valor entrante para no guardar basura ni payloads enormes. */
function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[deep]';
  const t = typeof value;
  if (t === 'string') return value.length > 4000 ? value.slice(0, 4000) + '…' : value;
  if (t === 'number') return Number.isFinite(value) ? value : null;
  if (t === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => sanitize(v, depth + 1));
  if (t === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 120)) {
      out[String(k).slice(0, 80)] = sanitize(v, depth + 1);
    }
    return out;
  }
  return null;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === '/health') {
      return json(request, { ok: true, service: 'klaro-leads' });
    }

    if (url.pathname === '/count') {
      try {
        const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads').first();
        return json(request, { count: row?.n ?? 0 });
      } catch (e) {
        return json(request, { count: 0, error: String(e) }, 500);
      }
    }

    if (url.pathname === '/signup' && request.method === 'POST') {
      let payload;
      try {
        payload = await request.json();
      } catch (e) {
        return json(request, { ok: false, error: 'invalid-json' }, 400);
      }

      const email = String(payload.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        return json(request, { ok: false, error: 'invalid-email' }, 400);
      }
      if (!payload.consent) {
        return json(request, { ok: false, error: 'no-consent' }, 400);
      }

      const clean = sanitize(payload);

      try {
        await env.DB.prepare(
          `INSERT INTO leads (
             email, name, role, use_case, locale, ref, ts,
             offer_json, source_json, signals_json, behavior_json, analysis_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            email,
            String(clean.name || ''),
            String(clean.role || ''),
            String(clean.useCase || ''),
            String(clean.locale || 'es'),
            clean.ref ? String(clean.ref) : null,
            String(clean.ts || new Date().toISOString()),
            JSON.stringify(clean.offer || {}),
            JSON.stringify(clean.source || {}),
            JSON.stringify(clean.signals || {}),
            JSON.stringify(clean.behavior || {}),
            JSON.stringify(clean.analysis || {})
          )
          .run();

        const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads').first();
        return json(request, { ok: true, email, count: row?.n ?? null });
      } catch (e) {
        return json(request, { ok: false, error: String(e) }, 500);
      }
    }

    return json(request, { ok: false, error: 'not-found' }, 404);
  },
};
