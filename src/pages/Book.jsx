import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLang } from '../lang';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import { api, errorCode, logError } from '../lib/api';
import { BUSINESS, DEFAULT_SETTINGS, OCCASIONS } from '../lib/config';
import { addDays, fmtDay, fmtTime, nowLocal, parseYmd, weekday } from '../lib/time';
import { useHours } from '../lib/useOpenStatus';
import { A } from '../lib/asset';

const MK_WD = ['нед', 'пон', 'вто', 'сре', 'чет', 'пет', 'саб'];

export default function Book() {
  const { t, lang } = useLang();
  const b = t.book;
  const [params, setParams] = useSearchParams();
  const today = nowLocal().day;
  const hours = useHours();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [blocked, setBlocked] = useState([]);

  // State that lives in the URL (shareable, survives refresh)
  const day = params.get('day') || today;
  const guests = Math.min(settings.max_party, Math.max(1, Number(params.get('g')) || 2));
  const area = ['terrace', 'covered'].includes(params.get('area')) ? params.get('area') : 'any';
  const time = params.get('time') ? Number(params.get('time')) : null;
  const step = Number(params.get('step')) || 1;
  const set = (patch) => {
    const p = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === null || v === undefined || v === '' ? p.delete(k) : p.set(k, String(v))));
    setParams(p, { replace: !('step' in patch) });
  };

  const [slots, setSlots] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', occasion: '', note: '', website: '' });
  const [errs, setErrs] = useState({});
  const [sending, setSending] = useState(false);
  const [serverErr, setServerErr] = useState('');
  const [done, setDone] = useState(false);
  const refs = { name: useRef(null), phone: useRef(null), email: useRef(null) };
  const headRef = useRef(null);
  const stepsRef = useRef(null);
  const errRef = useRef(null);
  const firstRender = useRef(true);

  useEffect(() => {
    api.getSettings().then((s) => s && setSettings(s)).catch(logError);
    api.getBlocked().then((x) => setBlocked(x || [])).catch(logError);
  }, []);

  useEffect(() => {
    let on = true;
    setSlots(null);
    api.getAvailability(day).then((s) => on && setSlots(s || [])).catch((e) => { logError(e); if (on) setSlots([]); });
    return () => { on = false; };
  }, [day, done]);

  // Move focus to the step heading when the step changes (keyboard and screen-reader users).
  // and bring the new step into view: the step list and the card's top sit just under the fixed header.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = done ? null : stepsRef.current;
    const header = document.querySelector('.hdr')?.offsetHeight || 0;
    const top = target ? Math.max(0, target.getBoundingClientRect().top + window.scrollY - header - 16) : 0;
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    headRef.current?.focus({ preventScroll: true });
  }, [step, done]);
  useEffect(() => { if (serverErr) errRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [serverErr]);

  const dirty = !done && (form.name || form.phone || form.note);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = b.unsaved; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, b.unsaved]);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today]);
  const isOpenDay = (d) => {
    const h = hours.find((x) => x.weekday === weekday(d));
    return h?.is_open && !blocked.some((x) => x.day === d);
  };
  const seatsFor = (s) => (area === 'terrace' ? s.terrace_left : area === 'covered' ? s.covered_left : Math.max(s.terrace_left, s.covered_left));
  const groups = useMemo(() => {
    if (!slots) return [];
    const g = [[b.lunch, []], [b.afternoon, []], [b.evening, []]];
    slots.forEach((s) => g[s.start_min < 900 ? 0 : s.start_min < 1080 ? 1 : 2][1].push(s));
    return g.filter(([, l]) => l.length);
  }, [slots, b]);
  const anyFree = slots?.some((s) => seatsFor(s) >= guests);

  const validate = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = b.errName;
    if (form.phone.replace(/\D/g, '').length < 8) e.phone = b.errPhone;
    if (form.email.trim() && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(form.email.trim())) e.email = b.errEmail;
    setErrs(e);
    const first = ['name', 'phone', 'email'].find((k) => e[k]);
    if (first) refs[first].current?.focus();
    return !first;
  };

  const submit = async (e) => {
    e.preventDefault();
    setServerErr('');
    if (form.website) return; // bot
    if (time === null) { set({ step: 2 }); return; }
    if (!validate()) return;
    setSending(true);
    try {
      await api.createReservation({ day, startMin: time, guests, area, name: form.name, phone: form.phone, email: form.email, note: form.note, occasion: form.occasion, lang });
      setDone(true);
    } catch (err) {
      logError(err);
      const code = errorCode(err);
      setServerErr(b.errors[code] || b.errors.GENERIC);
      if (['FULL', 'OUTSIDE_HOURS', 'TOO_SOON'].includes(code)) set({ time: null });
    } finally {
      setSending(false);
    }
  };

  const field = (k) => ({
    id: `f-${k}`, name: k, value: form[k], ref: refs[k],
    onChange: (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); if (errs[k]) setErrs((x) => ({ ...x, [k]: undefined })); },
    'aria-invalid': errs[k] ? 'true' : undefined,
    'aria-describedby': errs[k] ? `e-${k}` : undefined,
  });

  const dateLabel = (d) => {
    const x = parseYmd(d);
    return { wd: lang === 'en' ? x.toLocaleDateString('en-GB', { weekday: 'short' }) : MK_WD[x.getDay()], n: x.getDate() };
  };

  const summary = (
    <aside className="sum" aria-label={b.summary}>
      <h2>{b.summary}</h2>
      <dl>
        <div><dt>{b.day}</dt><dd>{fmtDay(day, lang)}</dd></div>
        <div><dt>{b.guests}</dt><dd>{b.guestsN(guests)}</dd></div>
        <div><dt>{b.time}</dt><dd>{time === null ? '—' : fmtTime(time)}</dd></div>
        <div><dt>{b.area}</dt><dd>{b.areas[area]}</dd></div>
      </dl>
      <p className="sum__call">{b.bigGroup(settings.max_party)} <a href={`tel:${BUSINESS.phone}`}>{BUSINESS.phoneIntl}</a></p>
    </aside>
  );

  if (done) {
    return (
      <>
        <SiteHeader />
        <main id="main" className="book book--done">
          <div className="done" role="status">
            <img src={A('brand/mark-light.png')} width="598" height="741" alt="" className="done__mark" />
            <h1 ref={headRef} tabIndex={-1}>{b.doneTitle}</h1>
            <p className="done__when">{fmtDay(day, lang)}, {fmtTime(time)} · {b.guestsN(guests)}</p>
            <p>{b.doneText}</p>
            <div className="row">
              <button type="button" className="btn btn-solid" onClick={() => { setDone(false); setForm({ name: '', phone: '', email: '', occasion: '', note: '', website: '' }); set({ step: 1, time: null }); }}>{b.doneAgain}</button>
              <Link className="btn btn-ghost" to="/">{b.doneHome}</Link>
            </div>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="book">
        <div className="book__head">
          <Link className="back" to="/">← {b.back}</Link>
          <h1>{b.title}</h1>
          <p>{b.lead}</p>
          <ol className="steps" aria-label={b.title} ref={stepsRef}>
            {b.steps.map((s, i) => (
              <li key={s} className={step === i + 1 ? 'is-on' : step > i + 1 ? 'is-done' : ''} aria-current={step === i + 1 ? 'step' : undefined}>
                <span>{i + 1}</span>{s}
              </li>
            ))}
          </ol>
        </div>

        <div className="book__grid">
          <form className="book__card" onSubmit={submit} noValidate>
            {step === 1 && (
              <fieldset>
                <legend ref={headRef} tabIndex={-1}>{b.steps[0]}</legend>
                <h3 className="lbl" id="day-l">{b.day}</h3>
                <div className="days scroll" role="group" aria-labelledby="day-l">
                  {days.map((d) => {
                    const { wd, n } = dateLabel(d);
                    const open = isOpenDay(d);
                    return (
                      <button key={d} type="button" className={`day${d === day ? ' is-on' : ''}`} aria-pressed={d === day} disabled={!open} onClick={() => set({ day: d, time: null })}>
                        <span>{d === today ? t.status.today : wd}</span><b>{n}</b>
                      </button>
                    );
                  })}
                </div>
                <label className="other-date" htmlFor="f-date">{b.otherDay}
                  <input id="f-date" type="date" name="date" min={today} max={addDays(today, settings.days_ahead)} value={day} onChange={(e) => e.target.value && set({ day: e.target.value, time: null })} />
                </label>

                <h3 className="lbl" id="g-l">{b.guests}</h3>
                <div className="stepper" role="group" aria-labelledby="g-l">
                  <button type="button" aria-label={b.fewer} disabled={guests <= 1} onClick={() => set({ g: guests - 1, time: null })}>−</button>
                  <output aria-live="polite">{guests}</output>
                  <button type="button" aria-label={b.more} disabled={guests >= settings.max_party} onClick={() => set({ g: guests + 1, time: null })}>+</button>
                </div>
                {guests >= settings.max_party && <p className="hint">{b.bigGroup(settings.max_party)} <a href={`tel:${BUSINESS.phone}`}>{BUSINESS.phoneIntl}</a></p>}

                <h3 className="lbl" id="a-l">{b.area}</h3>
                <div className="seg" role="radiogroup" aria-labelledby="a-l">
                  {['any', 'terrace', 'covered'].map((a) => (
                    <label key={a} className={area === a ? 'is-on' : ''}>
                      <input type="radio" name="area" value={a} checked={area === a} onChange={() => set({ area: a === 'any' ? null : a, time: null })} />
                      {b.areas[a]}
                    </label>
                  ))}
                </div>
                <div className="book__nav">
                  <button type="button" className="btn btn-solid btn-lg" onClick={() => set({ step: 2 })} disabled={!isOpenDay(day)}>{b.next}</button>
                  {!isOpenDay(day) && <p className="hint" role="status">{b.closed}</p>}
                </div>
              </fieldset>
            )}

            {step === 2 && (
              <fieldset>
                <legend ref={headRef} tabIndex={-1}>{b.time} · {fmtDay(day, lang)}</legend>
                {!slots && <p className="hint" role="status">{b.loading}</p>}
                {slots && !anyFree && <p className="empty" role="status">{b.none} <a href={`tel:${BUSINESS.phone}`}>{BUSINESS.phoneIntl}</a></p>}
                {groups.map(([label, list]) => (
                  <div key={label} className="slotgroup">
                    <h3 className="lbl">{label}</h3>
                    <div className="slots">
                      {list.map((s) => {
                        const left = seatsFor(s);
                        const ok = left >= guests;
                        return (
                          <button key={s.start_min} type="button" className={`slot${time === s.start_min ? ' is-on' : ''}`} aria-pressed={time === s.start_min} disabled={!ok}
                            onClick={() => set({ time: s.start_min, step: 3 })}>
                            <b>{fmtTime(s.start_min)}</b><span>{ok ? (left <= 10 ? b.left(left) : '') : b.full}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="book__nav">
                  <button type="button" className="btn btn-ghost" onClick={() => set({ step: 1 })}>← {b.prev}</button>
                </div>
              </fieldset>
            )}

            {step === 3 && (
              <fieldset>
                <legend ref={headRef} tabIndex={-1}>{b.steps[2]}</legend>
                <div className="grid2">
                  <div className="f">
                    <label htmlFor="f-name">{b.name}</label>
                    <input {...field('name')} autoComplete="name" placeholder={b.namePh} maxLength={80} />
                    {errs.name && <p className="err" id="e-name">{errs.name}</p>}
                  </div>
                  <div className="f">
                    <label htmlFor="f-phone">{b.phone}</label>
                    <input {...field('phone')} type="tel" inputMode="tel" autoComplete="tel" spellCheck={false} placeholder={b.phonePh} maxLength={30} />
                    {errs.phone && <p className="err" id="e-phone">{errs.phone}</p>}
                  </div>
                  <div className="f">
                    <label htmlFor="f-email">{b.email}</label>
                    <input {...field('email')} type="email" inputMode="email" autoComplete="email" spellCheck={false} placeholder={b.emailPh} maxLength={120} />
                    {errs.email && <p className="err" id="e-email">{errs.email}</p>}
                  </div>
                  <div className="f">
                    <label htmlFor="f-occasion">{b.occasion}</label>
                    <select id="f-occasion" name="occasion" value={form.occasion} autoComplete="off" onChange={(e) => setForm((f) => ({ ...f, occasion: e.target.value }))}>
                      {OCCASIONS.map((o) => <option key={o} value={o}>{b.occasions[o]}</option>)}
                    </select>
                  </div>
                  <div className="f full">
                    <label htmlFor="f-note">{b.note}</label>
                    <textarea id="f-note" name="note" value={form.note} maxLength={500} autoComplete="off" placeholder={b.notePh} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
                  </div>
                  <div className="hp" aria-hidden="true">
                    <label htmlFor="f-website">{b.honeypot}</label>
                    <input id="f-website" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
                  </div>
                </div>
                {serverErr && <p className="err err--box" role="alert" ref={errRef}>{serverErr}</p>}
                <div className="book__nav">
                  <button type="button" className="btn btn-ghost" onClick={() => set({ step: 2 })}>← {b.prev}</button>
                  <button type="submit" className="btn btn-solid btn-lg" disabled={sending}>{sending ? b.sending : b.submit}</button>
                </div>
              </fieldset>
            )}
          </form>
          {summary}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
