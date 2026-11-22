// Supabase Edge Function: sends a Web Push notification to every admin device
// when a new reservation is created (called by the database trigger in schema.sql).
//
// No secrets to copy by hand: the database generates the shared secret (private.config → push_secret)
// and this function creates the VAPID keys on its first call and stores them in the database.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// Optional secret VAPID_SUBJECT (default mailto:shale.bastion@gmail.com).
// Deploy with "Verify JWT" turned OFF — every request is checked against the database secret instead.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MK_DAYS = ['нед', 'пон', 'вто', 'сре', 'чет', 'пет', 'саб'];
const AREA: Record<string, string> = { terrace: 'тераса', covered: 'под тенда' };
const pad = (n: number) => String(n).padStart(2, '0');
const time = (m: number) => (m >= 1440 ? '00:00' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const given = req.headers.get('x-push-secret') || '';
  const { data: ok } = given.length === 64 ? await sb.rpc('check_push_secret', { p: given }) : { data: false };
  if (!ok) return new Response('Forbidden', { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // VAPID keys: created once, kept in the database.
  let { data: keys } = await sb.rpc('get_vapid_keys');
  let k = Array.isArray(keys) ? keys[0] : keys;
  if (!k?.pub || !k?.priv) {
    const g = webpush.generateVAPIDKeys();
    await sb.rpc('save_vapid_keys', { p_pub: g.publicKey, p_priv: g.privateKey });
    ({ data: keys } = await sb.rpc('get_vapid_keys'));
    k = Array.isArray(keys) ? keys[0] : keys;
  }
  if (body.type === 'init') return new Response(JSON.stringify({ ready: !!k?.pub }), { headers: { 'Content-Type': 'application/json' } });
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:shale.bastion@gmail.com', k.pub, k.priv);

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
