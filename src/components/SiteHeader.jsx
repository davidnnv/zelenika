import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLang } from '../lang';
import { A } from '../lib/asset';

const LINKS = [['terasa', 'terrace'], ['kujna', 'food'], ['vecheri', 'nights'], ['poseta', 'visit']];

export default function SiteHeader() {
  const { t, lang, toggle } = useLang();
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const on = () => setSolid(window.scrollY > 40);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', esc);
    document.body.classList.add('no-scroll');
    return () => { document.removeEventListener('keydown', esc); document.body.classList.remove('no-scroll'); };
  }, [open]);

  return (
    <header className={`hdr${solid || open || pathname !== '/' ? ' is-solid' : ''}`}>
      <a className="skip" href="#main">{t.skip}</a>
      <div className="hdr__in">
        <Link className="brand" to="/" aria-label="Zelenika Beer Garden">
          <img src={A('brand/mark-light.png')} width="598" height="741" alt="" />
          <span translate="no">ZELENIKA</span>
        </Link>
        <nav className={`hdr__nav${open ? ' is-open' : ''}`} id="site-nav" aria-label={t.nav.main}>
          {LINKS.map(([id, k]) => (
            <Link key={id} to={`/#${id}`} onClick={() => setOpen(false)}>{t.nav[k]}</Link>
          ))}
          <Link className="btn btn-solid hdr__book-m" to="/rezervacija">{t.nav.book}</Link>
        </nav>
        <button type="button" className="lang" onClick={toggle} aria-label={t.langSwitch}>{lang === 'mk' ? 'EN' : 'MK'}</button>
        <Link className="btn btn-solid hdr__book" to="/rezervacija">{t.nav.book}</Link>
        <button type="button" className="burger" aria-expanded={open} aria-controls="site-nav" aria-label={open ? t.nav.close : t.nav.menu} onClick={() => setOpen((o) => !o)}>
          <span /><span />
        </button>
      </div>
    </header>
  );
}
