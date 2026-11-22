// Supabase Edge Function: sends a Web Push notification to every admin device
// when a new reservation is created (called by the database trigger in schema.sql).
//
// Secrets (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com), PUSH_SECRET
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// Deploy with "Verify JWT" turned OFF — the request is checked with PUSH_SECRET instead.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MK_DAYS = ['нед', 'пон', 'вто', 'сре', 'чет', 'пет', 'саб'];
const AREA: Record<string, string> = { terrace: 'тераса', covered: 'под тенда' };
const pad = (n: number) => String(n).padStart(2, '0');
const time = (m: number) => (m >= 1440 ? '00:00' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`);

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('PUSH_SECRET') || '';
  if (!secret || !safeEqual(req.headers.get('x-push-secret') || '', secret)) return new Response('Forbidden', { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );

  let title = 'Zelenika — пробно известување';
  let text = 'Известувањата работат на овој уред.';
  let tag = 'test';
  if (body.type === 'new') {
    const d = new Date(String(body.day) + 'T12:00:00Z');
    const name = String(body.name || '').slice(0, 40);
    title = `Нова резервација · ${body.guests} ${Number(body.guests) === 1 ? 'гостин' : 'гости'}`;
    text = `${name}, ${MK_DAYS[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}. во ${time(Number(body.start_min))}, ${AREA[String(body.area)] || ''}`;
    tag = `res-${body.id}`;
  }
  const payload = JSON.stringify({ title, body: text, tag, url: '/admin' });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: subs, error } = await sb.from('push_subscriptions').select('id, endpoint, p256dh, auth');
  if (error) return new Response('DB error', { status: 500 });

  let sent = 0;
  await Promise.all(
    (subs || []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: 'high' });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id); // device unsubscribed
      }
    }),
  );
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
});
