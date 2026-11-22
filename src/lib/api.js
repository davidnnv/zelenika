// Data layer. Uses Supabase when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set.
// Without keys (local development, or a preview built with VITE_DEMO=1) it uses a DEMO store
// in localStorage with the same API and the same rules as supabase/schema.sql.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE } from '../supabase.config';
import { DEFAULT_HOURS, DEFAULT_SETTINGS } from './config';
import { addDays, nowLocal, weekday } from './time';

const URL = SUPABASE.url;
const KEY = SUPABASE.anonKey;
export const IS_DEMO = import.meta.env.VITE_DEMO === '1' || (import.meta.env.DEV && !(URL && KEY));
export const MISCONFIGURED = !IS_DEMO && !(URL && KEY);
function atobSafe(s) { try { return atob(s || ''); } catch { return ''; } }
if (KEY && /service_role/.test(atobSafe(KEY.split('.')[1]))) throw new Error('Never use the service_role key in the browser.');

export const logError = (e) => { if (import.meta.env.DEV) console.error(e); };

const sb = IS_DEMO || MISCONFIGURED ? null : createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });

const KNOWN = ['FULL', 'DAY_CLOSED', 'OUTSIDE_HOURS', 'TOO_SOON', 'DAY_OUT_OF_RANGE', 'PARTY_SIZE', 'MISSING_FIELDS', 'NOT_ACCEPTING', 'BAD_LOGIN', 'RATE_LIMIT', 'NOT_ADMIN', 'PUSH_NOT_CONFIGURED', 'NOT_CONFIGURED'];
export const errorCode = (err) => KNOWN.find((k) => String(err?.message || err || '').includes(k)) || 'GENERIC';

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/* ------------------------------ Supabase ------------------------------ */
let channelSeq = 0;
const live = {
  getSettings: async () => must(await sb.from('settings').select('*').eq('id', 1).single()),
  getHours: async () => must(await sb.from('opening_hours').select('*').order('weekday')),
  getBlocked: async () => must(await sb.from('blocked_days').select('*').order('day')),
  getAvailability: async (day) => must(await sb.rpc('get_availability', { p_day: day })),
  createReservation: async (r) =>
    must(await sb.rpc('create_reservation', {
      p_day: r.day, p_start_min: r.startMin, p_guests: r.guests, p_area: r.area,
      p_name: r.name, p_phone: r.phone, p_email: r.email, p_note: r.note, p_occasion: r.occasion, p_lang: r.lang,
    })),

  // admin — a session counts only if the database confirms the user is an admin
  getSession: async () => {
    const session = (await sb.auth.getSession()).data.session;
    if (!session) return null;
    const { data, error } = await sb.rpc('is_admin');
    if (error || !data) { await sb.auth.signOut(); return null; }
    return session;
  },
  signIn: async (email, password) => {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error('BAD_LOGIN');
    if (!must(await sb.rpc('is_admin'))) { await sb.auth.signOut(); throw new Error('NOT_ADMIN'); }
  },
  signOut: async () => sb.auth.signOut(),
  listReservations: async (from, to) =>
    must(await sb.from('reservations').select('*').gte('day', from).lte('day', to).order('day').order('start_min')),
  updateReservation: async (id, patch) => must(await sb.from('reservations').update(patch).eq('id', id)),
  deleteReservation: async (id) => must(await sb.from('reservations').delete().eq('id', id)),
  saveSettings: async (patch) => must(await sb.from('settings').update(patch).eq('id', 1)),
  saveHours: async (rows) => must(await sb.from('opening_hours').upsert(rows)),
  addBlocked: async (day, note) => must(await sb.from('blocked_days').upsert({ day, note })),
  removeBlocked: async (day) => must(await sb.from('blocked_days').delete().eq('day', day)),
  savePush: async (sub, device) => {
    const j = sub.toJSON();
    return must(await sb.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_device: device }));
  },
  removePush: async (endpoint) => must(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)),
  countPush: async () => (must(await sb.from('push_subscriptions').select('id')) || []).length,
  testPush: async () => must(await sb.rpc('test_push')),
  subscribe: (cb) => {
    const ch = sb.channel(`res-live-${++channelSeq}`).on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, cb).subscribe();
    return () => sb.removeChannel(ch);
  },
};

/* -------------------------------- Demo -------------------------------- */
const DEMO_KEY = 'zelenika-demo-v1';
export const DEMO_LOGIN = { email: 'demo@zelenika.mk', password: 'demo' };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

function seed() {
  const today = nowLocal().day;
  const r = (d, start, guests, area, name, phone, status, occasion = '', note = '') => ({
    id: uid(), day: addDays(today, d), start_min: start, guests, area, area_pref: area, name, phone, email: '',
    note, occasion, status, table_label: '', lang: 'mk', created_at: new Date(Date.now() - (5 - d) * 36e5).toISOString(),
  });
  return {
    settings: { ...DEFAULT_SETTINGS },
    hours: DEFAULT_HOURS.map((h) => ({ ...h })),
    blocked: [],
    reservations: [
      r(0, 1140, 4, 'terrace', 'Марија Стојанова', '070 111 222', 'confirmed', 'birthday', 'Торта ќе донесеме ние'),
      r(0, 1200, 2, 'covered', 'Петар Николов', '071 333 444', 'pending'),
      r(0, 780, 6, 'terrace', 'Семејство Илиевски', '072 555 666', 'seated', 'family', 'Детско столче'),
      r(1, 1110, 8, 'terrace', 'Ана Трајковска', '075 777 888', 'pending', 'party'),
      r(2, 1230, 3, 'covered', 'John Miller', '+44 7700 900123', 'confirmed'),
    ],
  };
}
const load = () => {
  try { const raw = localStorage.getItem(DEMO_KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  const s = seed(); save(s); return s;
};
function save(s) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
const listeners = new Set();
const emit = (e) => listeners.forEach((cb) => cb(e || {}));
const delay = (v) => new Promise((res) => setTimeout(() => res(v), 140));
const ACTIVE = ['pending', 'confirmed', 'seated'];
const loadAt = (s, day, start, end, area) =>
  s.reservations.filter((r) => r.day === day && r.area === area && ACTIVE.includes(r.status) && r.start_min < end && r.start_min + s.settings.stay_min > start)
    .reduce((n, r) => n + r.guests, 0);

function availability(s, day) {
  const st = s.settings; const now = nowLocal();
  if (!st.accepting || day < now.day || day > addDays(now.day, st.days_ahead)) return [];
  if (s.blocked.some((b) => b.day === day)) return [];
  const h = s.hours.find((x) => x.weekday === weekday(day));
  if (!h || !h.is_open) return [];
  const out = [];
  for (let t = h.open_min + ((st.slot_min - (h.open_min % st.slot_min)) % st.slot_min); t <= h.close_min - st.last_before_close; t += st.slot_min) {
    if (day === now.day && t < now.min + st.min_notice) continue;
    out.push({ start_min: t, terrace_left: Math.max(0, st.cap_terrace - loadAt(s, day, t, t + st.stay_min, 'terrace')), covered_left: Math.max(0, st.cap_covered - loadAt(s, day, t, t + st.stay_min, 'covered')) });
  }
  return out;
}

const demo = {
  getSettings: async () => delay(load().settings),
  getHours: async () => delay(load().hours),
  getBlocked: async () => delay(load().blocked),
  getAvailability: async (day) => delay(availability(load(), day)),
  createReservation: async (r) => {
    const s = load(); const st = s.settings;
    if (!st.accepting) throw new Error('NOT_ACCEPTING');
    if (r.guests < 1 || r.guests > st.max_party) throw new Error('PARTY_SIZE');
    const slot = availability(s, r.day).find((x) => x.start_min === r.startMin);
    if (!slot) throw new Error('OUTSIDE_HOURS');
    if (!r.name?.trim() || String(r.phone).replace(/\D/g, '').length < 8) throw new Error('MISSING_FIELDS');
    let area = null;
    if (r.area !== 'covered' && slot.terrace_left >= r.guests) area = 'terrace';
    else if (r.area !== 'terrace' && slot.covered_left >= r.guests) area = 'covered';
    if (!area) throw new Error('FULL');
    const row = {
      id: uid(), day: r.day, start_min: r.startMin, guests: r.guests, area, area_pref: r.area || 'any',
      name: r.name.trim().slice(0, 80), phone: r.phone.trim().slice(0, 30), email: (r.email || '').trim().slice(0, 120),
      note: (r.note || '').trim().slice(0, 500), occasion: r.occasion || '', status: 'pending', table_label: '', lang: r.lang, created_at: new Date().toISOString(),
    };
    s.reservations.push(row); save(s); emit({ eventType: 'INSERT', new: row });
    return delay(row.id);
  },
  getSession: async () => { try { return sessionStorage.getItem('zl-demo-session') ? { user: { email: DEMO_LOGIN.email } } : null; } catch { return null; } },
  signIn: async (email, password) => {
    if (email.trim().toLowerCase() !== DEMO_LOGIN.email || password !== DEMO_LOGIN.password) throw new Error('BAD_LOGIN');
    try { sessionStorage.setItem('zl-demo-session', '1'); } catch { /* ignore */ }
  },
  signOut: async () => { try { sessionStorage.removeItem('zl-demo-session'); } catch { /* ignore */ } },
  listReservations: async (from, to) => delay(load().reservations.filter((r) => r.day >= from && r.day <= to).sort((a, b) => a.day.localeCompare(b.day) || a.start_min - b.start_min)),
  updateReservation: async (id, patch) => { const s = load(); const r = s.reservations.find((x) => x.id === id); if (r) Object.assign(r, patch); save(s); emit({ eventType: 'UPDATE', new: r }); },
  deleteReservation: async (id) => { const s = load(); s.reservations = s.reservations.filter((x) => x.id !== id); save(s); emit({ eventType: 'DELETE' }); },
  saveSettings: async (patch) => { const s = load(); s.settings = { ...s.settings, ...patch }; save(s); },
  saveHours: async (rows) => { const s = load(); s.hours = rows; save(s); },
  addBlocked: async (day, note) => { const s = load(); s.blocked = [...s.blocked.filter((x) => x.day !== day), { day, note }].sort((a, b) => a.day.localeCompare(b.day)); save(s); },
  removeBlocked: async (day) => { const s = load(); s.blocked = s.blocked.filter((x) => x.day !== day); save(s); },
  savePush: async () => delay(true),
  removePush: async () => delay(true),
  countPush: async () => delay(0),
  testPush: async () => { throw new Error('PUSH_NOT_CONFIGURED'); },
  subscribe: (cb) => {
    listeners.add(cb);
    const onStorage = (e) => {
      if (e.key !== DEMO_KEY) return;
      try {
        const before = new Set((JSON.parse(e.oldValue || '{}').reservations || []).map((b) => b.id));
        const added = (JSON.parse(e.newValue || '{}').reservations || []).filter((b) => !before.has(b.id));
        if (added.length) added.forEach((b) => cb({ eventType: 'INSERT', new: b })); else cb({});
      } catch { cb({}); }
    };
    window.addEventListener('storage', onStorage);
    return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
  },
};

const broken = new Proxy({}, { get: (_t, k) => (k === 'subscribe' ? () => () => {} : async () => { throw new Error('NOT_CONFIGURED'); }) });
export const api = IS_DEMO ? demo : MISCONFIGURED ? broken : live;
