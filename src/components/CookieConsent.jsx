// Cookie notice on the first visit. The site only uses necessary storage (language, admin sign-in);
// the choice is saved so optional tools (e.g. analytics, if ever added) can check hasConsent() first.
import { useEffect, useState } from 'react';
import { useLang } from '../lang';

const KEY = 'zl-consent';
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const hasConsent = () => read() === 'all';
export const openCookieSettings = () => window.dispatchEvent(new Event('zl-cookies'));

export default function CookieConsent() {
  const { t } = useLang();
  const c = t.cookies;
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    let id;
    if (!read()) id = setTimeout(() => setOpen(true), 700);
    const reopen = () => setOpen(true);
    window.addEventListener('zl-cookies', reopen);
    return () => { clearTimeout(id); window.removeEventListener('zl-cookies', reopen); };
  }, []);

  if (!open) return null;
  const choose = (v) => { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } setOpen(false); };

  return (
    <section className="cookie" role="region" aria-labelledby="cookie-h">
      <h2 id="cookie-h">{c.title}</h2>
      <p>{c.text}</p>
      <button type="button" className="cookie__more" aria-expanded={more} aria-controls="cookie-list" onClick={() => setMore((m) => !m)}>{c.more}</button>
      <ul id="cookie-list" hidden={!more}>{c.details.map((d) => <li key={d}>{d}</li>)}</ul>
      <div className="cookie__btns">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => choose('necessary')}>{c.necessary}</button>
        <button type="button" className="btn btn-solid btn-sm" onClick={() => choose('all')}>{c.accept}</button>
      </div>
    </section>
  );
}
