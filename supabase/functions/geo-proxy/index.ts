// Edge Function: geo-proxy — بروكسي آمن لـ Geoapify (إخفاء GEOAPIFY_KEY عن المتصفح).
// للمستخدمين المسجلين فقط (verify_jwt = true) + CORS مقيد على دومينات تساهيل.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set([
  'https://system-erp-v3.vercel.app',
  'https://system-erp-v3-git-courier-tickets-v1-mahmoud-978b.vercel.app',
]);
function corsFor(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const isPreview = /^https:\/\/system-erp-v3-[a-z0-9-]+\.vercel\.app$/i.test(origin);
  const allow = (ALLOWED_ORIGINS.has(origin) || isPreview) ? origin : 'https://system-erp-v3.vercel.app';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
const json = (req: Request, o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...corsFor(req), 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsFor(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth) return json(req, { error: 'unauthorized' }, 401);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes, error: userErr } = await sb.auth.getUser();
    if (userErr || !userRes?.user) return json(req, { error: 'unauthorized' }, 401);

    const key = Deno.env.get('GEOAPIFY_KEY');
    if (!key) return json(req, { error: 'geo_key_missing' }, 500);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'reverse') {
      const lat = Number(body.lat);
      const lon = Number(body.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return json(req, { error: 'invalid_coords' }, 400);
      }
      const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&lang=ar&apiKey=${encodeURIComponent(key)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) return json(req, { error: 'upstream_error', status: r.status }, 502);
      const data = await r.json();
      return json(req, data, 200);
    }

    if (action === 'route') {
      const wpStr = String(body.waypoints || '').trim();
      if (!wpStr || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?(\|-?\d+(\.\d+)?,-?\d+(\.\d+)?){1,14}$/.test(wpStr)) {
        return json(req, { error: 'invalid_waypoints' }, 400);
      }
      const url = `https://api.geoapify.com/v1/routing?waypoints=${encodeURIComponent(wpStr)}&mode=drive&apiKey=${encodeURIComponent(key)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (!r.ok) return json(req, { error: 'upstream_error', status: r.status }, 502);
      const data = await r.json();
      return json(req, data, 200);
    }

    return json(req, { error: 'invalid_action' }, 400);
  } catch (e) {
    if ((e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError') {
      return json(req, { error: 'timeout' }, 504);
    }
    return json(req, { error: 'internal_error' }, 500);
  }
});
