// Edge Function: send-push — بترسل Web Push لأجهزة موظف واحد.
// بتتنادى من trigger notify_push (sql/part-j-push.sql) بـ header x-cron-secret. مفيش وصول عام.
// Secrets مطلوبة: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
// SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY موجودين تلقائياً في Supabase.
// verify_jwt لازم يكون false (التحقق بالسر)، والـ service key ما بيطلعش برا الدالة.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return J({ error: "method" }, 405);
  const secret = Deno.env.get("CRON_SECRET");
  const got = req.headers.get("x-cron-secret") || "";
  if (!secret || got.length !== secret.length || got !== secret) return J({ error: "unauthorized" }, 401);

  let p: { user_id?: string; title?: string; body?: string; kind?: string };
  try { p = await req.json(); } catch { return J({ error: "json" }, 400); }
  if (!p.user_id || !/^[0-9a-f-]{36}$/i.test(p.user_id)) return J({ error: "user_id" }, 400);

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: subs, error } = await sb.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", p.user_id).limit(10);
  if (error) return J({ error: "db" }, 500);

  const payload = JSON.stringify({ title: String(p.title || "تساهيل").slice(0, 80), body: String(p.body || "").slice(0, 160), tag: p.kind || "notif" });
  let sent = 0; const dead: string[] = [];
  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.id);
    }
  }));
  if (dead.length) await sb.from("push_subscriptions").delete().in("id", dead);
  return J({ sent, removed: dead.length });
});
