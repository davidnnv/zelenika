// Admin panel (Macedonian only): reservations by day with live updates, push notifications, settings.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, DEMO_LOGIN, errorCode, IS_DEMO, logError } from '../lib/api';
import { addDays, dayName, fmtDay, fmtTime, nowLocal } from '../lib/time';
import { currentSubscription, disablePush, enablePush, pushSupport } from '../lib/push';
import Dialogs, { askConfirm, notify } from '../components/Dialogs';
import InstallButton from '../components/InstallButton';
import { A } from '../lib/asset';

const ST = {
  pending: ['Чека потврда', 'Чека'], confirmed: ['Потврдена', 'Потврди'], seated: ['Седнати', 'Седнати'],
  done: ['Завршена', 'Заврши'], cancelled: ['Откажана', 'Откажи'], no_show: ['Не дојдоа', 'Не дојдоа'],
};
const AREA = { terrace: 'Тераса', covered: 'Под тенда' };
const OCC = { birthday: 'Роденден', family: 'Семеен ручек', business: 'Деловна средба', party: 'Прослава' };
const IDLE_MS = 30 * 60 * 1000;
const ERR = {
  BAD_LOGIN: 'Погрешна е-пошта или лозинка.', NOT_ADMIN: 'Оваа сметка нема пристап до админ панелот.',
  NOT_CONFIGURED: 'Апликацијата уште не е поврзана со базата (Supabase клучеви).', PUSH_NOT_CONFIGURED: 'Push уште не е поставен во Supabase (README, чекор 6).',
  GENERIC: 'Нешто не успеа. Обидете се повторно.',
};
const msg = (e) => ERR[errorCode(e)] || ERR.GENERIC;

/* ------------------------------ sound ------------------------------ */
let ctx = null;
const unlock = () => { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch { /* none */ } };
function chime() {
  if (!ctx) return;
  const n = ctx.currentTime;
  [[784, 0], [1175, 0.15]].forEach(([f, d]) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = f; g.gain.setValueAtTime(0.0001, n + d);
    g.gain.exponentialRampToValueAtTime(0.25, n + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, n + d + 0.45);
    o.connect(g).connect(ctx.destination); o.start(n + d); o.stop(n + d + 0.5);
  });
}

/* ------------------------------ login ------------------------------ */
function Login({ onIn }) {
  const [email, setEmail] = useState(IS_DEMO ? DEMO_LOGIN.email : '');
  const [pass, setPass] = useState(IS_DEMO ? DEMO_LOGIN.password : '');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fails = useRef(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => { if (!lockUntil) return undefined; const id = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(id); }, [lockUntil]);
  const locked = Date.now() < lockUntil;

  const submit = async (e) => {
    e.preventDefault();
    if (locked) return;
    setErr(''); setBusy(true);
    try {
      await api.signIn(email, pass);
      fails.current = 0;
      onIn();
    } catch (x) {
      fails.current += 1;
      if (fails.current >= 5) { setLockUntil(Date.now() + 60000); fails.current = 0; }
      setErr(msg(x));
    } finally { setBusy(false); }
  };
  return (
    <main id="main" className="adm-login">
      <form className="adm-login__card" onSubmit={submit}>
        <img src={A('brand/logo-light.png')} width="606" height="926" alt="Zelenika Beer Garden" className="adm-login__logo" />
        <h1>Админ панел</h1>
        {IS_DEMO && <p className="adm-demo">Демо: <b>{DEMO_LOGIN.email}</b> / <b>{DEMO_LOGIN.password}</b></p>}
        <div className="f">
          <label htmlFor="a-email">Е-пошта</label>
          <input id="a-email" name="email" type="email" autoComplete="username" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="f">
          <label htmlFor="a-pass">Лозинка</label>
          <div className="pass">
            <input id="a-pass" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} required />
            <button type="button" className="pass__eye" aria-label={show ? 'Скриј ја лозинката' : 'Прикажи ја лозинката'} aria-pressed={show} onClick={() => setShow((s) => !s)}>{show ? 'Скриј' : 'Прикажи'}</button>
          </div>
        </div>
        {err && <p className="err err--box" role="alert">{err}</p>}
        {locked && <p className="err" role="status">Премногу обиди. Почекајте {Math.ceil((lockUntil - Date.now()) / 1000)} секунди.</p>}
        <button type="submit" className="btn btn-solid btn-lg" disabled={busy || locked}>{busy ? 'Се најавувам…' : 'Најави се'}</button>
        <Link className="back" to="/">← Кон сајтот</Link>
      </form>
    </main>
  );
}

/* --------------------------- push panel --------------------------- */
function PushPanel() {
  const support = pushSupport();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default');
  useEffect(() => { currentSubscription().then((s) => setOn(!!s)).catch(() => {}); }, []);

  const toggle = async () => {
    unlock(); setBusy(true);
    try {
      if (on) { await disablePush(); setOn(false); notify('Известувањата се исклучени на овој уред.', 'ok'); }
      else {
        const r = await enablePush();
        setPerm(Notification.permission);
        if (r === 'on') { setOn(true); notify('Готово. Овој уред ќе добива известување за секоја нова резервација.', 'ok'); }
        else notify('Известувањата се блокирани. Дозволете ги во поставките на прелистувачот за овој сајт.');
      }
    } catch (e) { logError(e); notify(msg(e)); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try { await api.testPush(); notify('Пробното известување е испратено. Треба да стигне за неколку секунди.', 'ok'); }
    catch (e) { notify(msg(e)); } finally { setBusy(false); }
  };

  return (
    <section className="adm-card" aria-labelledby="push-h">
      <h2 id="push-h">Известувања на телефон</h2>
      {support === 'ios-install' && (<><p>На iPhone известувањата работат само од инсталираната апликација. Инсталирајте ја, отворете ја од почетниот екран, најавете се и вклучете ги тука.</p><InstallButton className="btn btn-ghost" /></>)}
      {support === 'unsupported' && <p>Овој прелистувач не поддржува push известувања. Пробајте со Chrome на Android или со инсталираната апликација на iPhone.</p>}
      {support === 'ok' && (
        <>
          <p>{on ? 'Овој уред добива известување за секоја нова резервација, и кога апликацијата е затворена.' : 'Вклучете за да добивате известување за секоја нова резервација, и кога апликацијата е затворена.'}</p>
          {perm === 'denied' && <p className="err">Известувањата се блокирани за овој сајт. Дозволете ги во поставките на прелистувачот.</p>}
          <div className="row">
            <button type="button" className={`btn ${on ? 'btn-ghost' : 'btn-solid'}`} onClick={toggle} disabled={busy}>{on ? 'Исклучи на овој уред' : 'Вклучи известувања'}</button>
            {on && <button type="button" className="btn btn-ghost" onClick={test} disabled={busy}>Испрати пробно</button>}
          </div>
        </>
      )}
      <p className="muted small">Инсталирана апликација: <InstallButton /></p>
    </section>
  );
}

/* ------------------------ reservation card ------------------------ */
function ResCard({ r, onChange }) {
  const [label, setLabel] = useState(r.table_label || '');
  useEffect(() => setLabel(r.table_label || ''), [r.table_label]);
  const digits = r.phone.replace(/[^\d+]/g, '');
  const setStatus = async (status) => {
    if (status === 'cancelled' && !(await askConfirm({ title: 'Откажи ја резервацијата?', text: `${r.name}, ${fmtTime(r.start_min)}, ${r.guests} гости.`, confirm: 'Откажи резервација', cancel: 'Назад' }))) return;
    try { await api.updateReservation(r.id, { status }); onChange(); notify(`${ST[status][0]}: ${r.name}`, 'ok'); } catch (e) { notify(msg(e)); }
  };
  const remove = async () => {
    if (!(await askConfirm({ title: 'Избриши ја резервацијата?', text: `${r.name}, ${fmtDay(r.day, 'mk')} во ${fmtTime(r.start_min)}. Бришењето не може да се врати.`, confirm: 'Избриши', cancel: 'Откажи' }))) return;
    try { await api.deleteReservation(r.id); onChange(); notify('Резервацијата е избришана.', 'ok'); } catch (e) { notify(msg(e)); }
  };
  const saveLabel = async () => {
    if (label === (r.table_label || '')) return;
    try { await api.updateReservation(r.id, { table_label: label.slice(0, 20) }); onChange(); } catch (e) { notify(msg(e)); }
  };
  const next = { pending: ['confirmed', 'cancelled'], confirmed: ['seated', 'no_show', 'cancelled'], seated: ['done'], done: [], cancelled: ['pending'], no_show: ['pending'] }[r.status];
  return (
    <article className={`res res--${r.status}`}>
      <div className="res__time"><b>{fmtTime(r.start_min)}</b><span>{r.guests} {r.guests === 1 ? 'гостин' : 'гости'}</span></div>
      <div className="res__body">
        <h3>{r.name}</h3>
        <p className="res__meta">
          <span className={`tag tag--${r.status}`}>{ST[r.status][0]}</span>
          <span className="tag">{AREA[r.area]}{r.area_pref === 'any' ? '' : ' (по желба)'}</span>
          {r.occasion && <span className="tag tag--occ">{OCC[r.occasion]}</span>}
          {r.lang === 'en' && <span className="tag">EN</span>}
        </p>
        {r.note && <p className="res__note">„{r.note}“</p>}
        <p className="res__contact">
          <a href={`tel:${digits}`}>{r.phone}</a>
          <a href={`viber://chat?number=${encodeURIComponent(digits.replace(/^0/, '+389'))}`}>Viber</a>
          {r.email && <a href={`mailto:${r.email}`}>{r.email}</a>}
        </p>
      </div>
      <div className="res__actions">
        <label className="res__table" htmlFor={`tl-${r.id}`}>Маса
          <input id={`tl-${r.id}`} name="table" value={label} maxLength={20} placeholder="на пр. 12…" autoComplete="off" onChange={(e) => setLabel(e.target.value)} onBlur={saveLabel} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        </label>
        <div className="row">
          {next.map((s) => (
            <button key={s} type="button" className={`btn btn-sm ${s === 'confirmed' || s === 'seated' ? 'btn-solid' : 'btn-ghost'}`} onClick={() => setStatus(s)}>{s === 'pending' ? 'Врати' : ST[s][1]}</button>
          ))}
          <button type="button" className="btn btn-sm btn-ghost btn-icon" aria-label={`Избриши резервација на ${r.name}`} onClick={remove}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
          </button>
        </div>
      </div>
    </article>
  );
}

/* ------------------------- reservations tab ------------------------ */
function Reservations({ day, setDay, reloadKey, onReload }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('active');
  const [upcoming, setUpcoming] = useState([]);
  const today = nowLocal().day;

  useEffect(() => {
    let on = true;
    setRows((r) => (r && r[0]?.day === day ? r : null));
    api.listReservations(day, day).then((x) => on && setRows(x || [])).catch((e) => { logError(e); notify(msg(e)); if (on) setRows([]); });
    api.listReservations(today, addDays(today, 30)).then((x) => on && setUpcoming((x || []).filter((r) => r.status === 'pending'))).catch(() => {});
    return () => { on = false; };
  }, [day, reloadKey, today]);

  const list = useMemo(() => (rows || []).filter((r) => (filter === 'all' ? true : filter === 'active' ? ['pending', 'confirmed', 'seated'].includes(r.status) : r.status === filter)), [rows, filter]);
  const active = (rows || []).filter((r) => ['pending', 'confirmed', 'seated'].includes(r.status));
  const sum = (a) => active.filter((r) => !a || r.area === a).reduce((n, r) => n + r.guests, 0);

  return (
    <div className="adm-res">
      <div className="daybar">
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Претходен ден" onClick={() => setDay(addDays(day, -1))}>‹</button>
        <h2 aria-live="polite">{day === today ? 'Денес, ' : ''}{fmtDay(day, 'mk')}</h2>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Следен ден" onClick={() => setDay(addDays(day, 1))}>›</button>
        {day !== today && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDay(today)}>Денес</button>}
        <label className="sr" htmlFor="a-day">Избери датум</label>
        <input id="a-day" type="date" name="day" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
      </div>

      <div className="kpis">
        <div><b>{active.length}</b><span>резервации</span></div>
        <div><b>{sum()}</b><span>гости вкупно</span></div>
        <div><b>{sum('terrace')}</b><span>на тераса</span></div>
        <div><b>{sum('covered')}</b><span>под тенда</span></div>
        <div className={active.some((r) => r.status === 'pending') ? 'is-warn' : ''}><b>{active.filter((r) => r.status === 'pending').length}</b><span>чекаат потврда</span></div>
      </div>

      <div className="chips scroll" role="group" aria-label="Филтер">
        {[['active', 'Активни'], ['pending', 'Чекаат'], ['confirmed', 'Потврдени'], ['seated', 'Седнати'], ['done', 'Завршени'], ['cancelled', 'Откажани'], ['no_show', 'Не дојдоа'], ['all', 'Сите']].map(([k, l]) => (
          <button key={k} type="button" className={filter === k ? 'is-on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      {rows === null && <p className="muted" role="status">Се вчитува…</p>}
      {rows && list.length === 0 && (
        <div className="empty-box"><p>Нема {filter === 'active' ? 'активни ' : ''}резервации за овој ден.</p>{upcoming.length > 0 && <p className="muted">Има {upcoming.length} што чекаат потврда во наредните денови, види подолу.</p>}</div>
      )}
      <div className="res-list">{list.map((r) => <ResCard key={r.id} r={r} onChange={onReload} />)}</div>

      {upcoming.filter((r) => r.day !== day).length > 0 && (
        <section className="adm-card" aria-labelledby="up-h">
          <h2 id="up-h">Чекаат потврда, други денови</h2>
          <ul className="uplist">
            {upcoming.filter((r) => r.day !== day).map((r) => (
              <li key={r.id}><button type="button" onClick={() => setDay(r.day)}><b>{fmtDay(r.day, 'mk')}, {fmtTime(r.start_min)}</b><span>{r.name}, {r.guests} гости</span></button></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* --------------------------- settings tab --------------------------- */
const QUARTERS = Array.from({ length: 97 }, (_, i) => i * 15);
function Settings() {
  const [s, setS] = useState(null);
  const [hours, setHours] = useState(null);
  const [blocked, setBlocked] = useState([]);
  const [nb, setNb] = useState({ day: '', note: '' });
  const [saving, setSaving] = useState(false);
  const load = () => {
    api.getSettings().then(setS).catch((e) => notify(msg(e)));
    api.getHours().then(setHours).catch((e) => notify(msg(e)));
    api.getBlocked().then((x) => setBlocked(x || [])).catch(() => {});
  };
  useEffect(load, []);
  if (!s || !hours) return <p className="muted" role="status">Се вчитува…</p>;

  const num = (k, label, min, max, unit) => (
    <div className="f">
      <label htmlFor={`s-${k}`}>{label}</label>
      <div className="unit"><input id={`s-${k}`} name={k} type="number" inputMode="numeric" min={min} max={max} value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} autoComplete="off" /><span>{unit}</span></div>
    </div>
  );
  const save = async () => {
    setSaving(true);
    try {
      const patch = {};
      ['slot_min', 'stay_min', 'cap_terrace', 'cap_covered', 'max_party', 'last_before_close', 'min_notice', 'days_ahead'].forEach((k) => { patch[k] = Math.round(Number(s[k])); });
      patch.accepting = !!s.accepting;
      const bad = hours.find((h) => h.is_open && h.close_min <= h.open_min);
      if (bad) throw new Error('HOURS');
      await api.saveSettings(patch);
      await api.saveHours(hours.map(({ weekday, is_open, open_min, close_min }) => ({ weekday, is_open, open_min, close_min })));
      notify('Поставките се зачувани.', 'ok');
    } catch (e) {
      notify(String(e.message) === 'HOURS' ? 'Затворањето мора да е по отворањето.' : 'Не успеа зачувувањето. Проверете ги бројките (на пр. термини на 15, 30 или 60 мин).');
    } finally { setSaving(false); }
  };
  const addB = async (e) => {
    e.preventDefault();
    if (!nb.day) return;
    try { await api.addBlocked(nb.day, nb.note.slice(0, 120)); setNb({ day: '', note: '' }); load(); notify('Денот е затворен за резервации.', 'ok'); } catch (x) { notify(msg(x)); }
  };
  const remB = async (d) => {
    if (!(await askConfirm({ title: 'Отвори го денот повторно?', text: fmtDay(d, 'mk'), confirm: 'Отвори', cancel: 'Откажи', danger: false }))) return;
    try { await api.removeBlocked(d); load(); } catch (x) { notify(msg(x)); }
  };

  return (
    <div className="adm-set">
      <section className="adm-card" aria-labelledby="acc-h">
        <h2 id="acc-h">Онлајн резервации</h2>
        <label className="switch" htmlFor="s-acc">
          <input id="s-acc" type="checkbox" name="accepting" checked={!!s.accepting} onChange={(e) => setS({ ...s, accepting: e.target.checked })} />
          <span>{s.accepting ? 'Примаме резервации од сајтот' : 'Резервациите од сајтот се паузирани'}</span>
        </label>
        <div className="grid3">
          {num('cap_terrace', 'Места на отворена тераса', 0, 1000, 'гости')}
          {num('cap_covered', 'Места под тендата', 0, 1000, 'гости')}
          {num('max_party', 'Најголема група онлајн', 1, 200, 'гости')}
          {num('stay_min', 'Колку седи една маса', 30, 360, 'мин')}
          {num('slot_min', 'Термини на секои', 15, 60, 'мин')}
          {num('last_before_close', 'Последен термин пред затворање', 0, 300, 'мин')}
          {num('min_notice', 'Најмалку однапред', 0, 1440, 'мин')}
          {num('days_ahead', 'Најмногу однапред', 1, 365, 'дена')}
        </div>
      </section>

      <section className="adm-card" aria-labelledby="hrs-h">
        <h2 id="hrs-h">Работно време</h2>
        <div className="hrs">
          {[1, 2, 3, 4, 5, 6, 0].map((w) => {
            const h = hours.find((x) => x.weekday === w);
            const upd = (p) => setHours(hours.map((x) => (x.weekday === w ? { ...x, ...p } : x)));
            return (
              <div key={w} className="hrs__row">
                <label className="switch" htmlFor={`h-open-${w}`}><input id={`h-open-${w}`} type="checkbox" checked={h.is_open} onChange={(e) => upd({ is_open: e.target.checked })} /><span>{dayName(w, 'mk')}</span></label>
                <label className="sr" htmlFor={`h-from-${w}`}>Од</label>
                <select id={`h-from-${w}`} value={h.open_min} disabled={!h.is_open} onChange={(e) => upd({ open_min: Number(e.target.value) })}>{QUARTERS.slice(0, 96).map((m) => <option key={m} value={m}>{fmtTime(m)}</option>)}</select>
                <span aria-hidden="true">–</span>
                <label className="sr" htmlFor={`h-to-${w}`}>До</label>
                <select id={`h-to-${w}`} value={h.close_min} disabled={!h.is_open} onChange={(e) => upd({ close_min: Number(e.target.value) })}>{QUARTERS.slice(1).map((m) => <option key={m} value={m}>{m === 1440 ? 'полноќ' : fmtTime(m)}</option>)}</select>
              </div>
            );
          })}
        </div>
        <p className="muted small">Ова работно време се прикажува и на сајтот, на таблата „Отворено сега“.</p>
      </section>
      <div className="adm-save"><button type="button" className="btn btn-solid btn-lg" onClick={save} disabled={saving}>{saving ? 'Се зачувува…' : 'Зачувај поставки'}</button></div>

      <section className="adm-card" aria-labelledby="blk-h">
        <h2 id="blk-h">Затворени денови</h2>
        <p className="muted small">Приватна прослава, празник или одмор: тие денови не може да се резервира онлајн.</p>
        <form className="blk-form" onSubmit={addB}>
          <div className="f"><label htmlFor="b-day">Датум</label><input id="b-day" type="date" name="blocked_day" min={nowLocal().day} value={nb.day} onChange={(e) => setNb({ ...nb, day: e.target.value })} required /></div>
          <div className="f"><label htmlFor="b-note">Белешка (по желба)</label><input id="b-note" name="blocked_note" maxLength={120} placeholder="на пр. Приватна прослава…" value={nb.note} autoComplete="off" onChange={(e) => setNb({ ...nb, note: e.target.value })} /></div>
          <button type="submit" className="btn btn-ghost">Затвори го денот</button>
        </form>
        {blocked.length === 0 ? <p className="muted">Нема затворени денови.</p> : (
          <ul className="blk-list">{blocked.map((b) => (<li key={b.day}><span><b>{fmtDay(b.day, 'mk')}</b>{b.note && ` · ${b.note}`}</span><button type="button" className="btn btn-sm btn-ghost" onClick={() => remB(b.day)}>Отвори</button></li>))}</ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------ shell ------------------------------ */
export default function Admin() {
  const [session, setSession] = useState(undefined);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'settings' ? 'settings' : 'res';
  const day = params.get('day') || nowLocal().day;
  const setP = (patch) => { const p = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k))); setParams(p); };
  const [reloadKey, setReloadKey] = useState(0);
  const [unseen, setUnseen] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    document.title = 'Админ · Zelenika';
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex, nofollow'; document.head.appendChild(m);
    api.getSession().then(setSession).catch(() => setSession(null));
    return () => m.remove();
  }, []);

  // Automatic sign-out after 30 minutes without activity.
  useEffect(() => {
    if (!session) return undefined;
    let id = setTimeout(out, IDLE_MS);
    function out() { api.signOut().finally(() => { setSession(null); notify('Одјавени сте поради неактивност.', 'ok'); }); }
    const bump = () => { clearTimeout(id); id = setTimeout(out, IDLE_MS); };
    ['pointerdown', 'keydown', 'scroll'].forEach((e) => window.addEventListener(e, bump, { passive: true }));
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => { clearTimeout(id); ['pointerdown', 'keydown', 'scroll'].forEach((e) => window.removeEventListener(e, bump)); };
  }, [session]);

  // Live: new reservations appear immediately, with a sound.
  useEffect(() => {
    if (!session) return undefined;
    return api.subscribe((e) => {
      reload();
      if (e?.eventType === 'INSERT' && e.new) {
        chime();
        if (document.hidden) setUnseen((n) => n + 1);
        notify(`Нова резервација: ${e.new.name}, ${fmtDay(e.new.day, 'mk')} во ${fmtTime(e.new.start_min)}, ${e.new.guests} гости`, 'ok');
      }
    });
  }, [session, reload]);
  useEffect(() => {
    const onVis = () => !document.hidden && setUnseen(0);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  useEffect(() => { document.title = `${unseen ? `(${unseen}) ` : ''}Админ · Zelenika`; }, [unseen]);

  if (session === undefined) return <div className="page-loading" role="status">…</div>;
  if (!session) return (<><Login onIn={() => api.getSession().then(setSession)} /><Dialogs /></>);

  return (
    <div className="adm">
      <header className="adm-top">
        <Link className="brand" to="/"><img src={A('brand/mark-light.png')} width="598" height="741" alt="" /><span translate="no">ZELENIKA</span></Link>
        <span className="live" title="Нови резервации се прикажуваат веднаш"><i />Во живо</span>
        <nav className="adm-tabs" aria-label="Админ">
          <button type="button" className={tab === 'res' ? 'is-on' : ''} aria-current={tab === 'res' ? 'page' : undefined} onClick={() => setP({ tab: null })}>Резервации</button>
          <button type="button" className={tab === 'settings' ? 'is-on' : ''} aria-current={tab === 'settings' ? 'page' : undefined} onClick={() => setP({ tab: 'settings' })}>Поставки</button>
        </nav>
        <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { if (await askConfirm({ title: 'Одјави се?', confirm: 'Одјави се', cancel: 'Остани', danger: false })) { await api.signOut(); setSession(null); } }}>Одјава</button>
      </header>
      {IS_DEMO && <p className="adm-demo adm-demo--bar">Демо режим: податоците се само во овој прелистувач. Направете резервација на сајтот во друго јазиче и гледајте како се појавува тука.</p>}
      <main id="main" className="adm-main">
        {tab === 'res' ? (
          <div className="adm-grid">
            <Reservations day={day} setDay={(d) => setP({ day: d === nowLocal().day ? null : d })} reloadKey={reloadKey} onReload={reload} />
            <aside><PushPanel /></aside>
          </div>
        ) : <Settings />}
      </main>
      <Dialogs />
    </div>
  );
}

