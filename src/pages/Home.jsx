import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../lang';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import useReveal from '../useReveal';
import use3D from '../use3D';
import { BUSINESS } from '../lib/config';
import { useOpenStatus } from '../lib/useOpenStatus';
import { dayName, fmtTime } from '../lib/time';
import { A } from '../lib/asset';

const Vodno3D = lazy(() => import('../components/Vodno3D'));
const Lightbox = lazy(() => import('../components/Lightbox'));

const MOSAIC = [
  ['hero', 1440, 810, 'big', { mk: 'Тераса на зајдисонце со поглед кон планините', en: 'Terrace at sunset looking at the mountains' }],
  ['stairs', 959, 1200, 'tall', { mk: 'Камени скали меѓу цвеќиња', en: 'Stone steps between flowers' }],
  ['evening', 1080, 810, '', { mk: 'Покриена тераса навечер, со светилки', en: 'Covered terrace in the evening, with lights' }],
  ['lavender', 974, 1145, '', { mk: 'Лаванда пред долгите маси', en: 'Lavender in front of the long tables' }],
  ['roses', 959, 1200, '', { mk: 'Рози покрај високите столчиња', en: 'Roses beside the tall stools' }],
  ['crowd', 1200, 900, 'wide', { mk: 'Гости на масите на зајдисонце', en: 'Guests at the tables at sunset' }],
  ['ivy', 960, 1200, '', { mk: 'Зелената куќа над ѕидот со бршлен', en: 'The green house above the ivy wall' }],
];

const SPOTS = [
  ['pergola', 27, 47], ['upper', 48, 30], ['house', 68, 28], ['gate', 44, 64], ['road', 22, 74],
];

// Every photo that opens full-screen, in viewing order.
const EXTRA = {
  drone: [1440, 959, { mk: 'Градината одозгора, снимено со дрон', en: 'The garden from above, drone photo' }],
  spread: [1200, 800, { mk: 'Маса полна со скара, пица и кригли пиво', en: 'Table full of grill, pizza and beer mugs' }],
  pizza: [960, 1200, { mk: 'Пица со печурки и маслинки', en: 'Pizza with mushrooms and olives' }],
  fillet: [960, 1200, { mk: 'Свинско филе со сос од печурки', en: 'Pork fillet with mushroom sauce' }],
  aperol: [944, 1181, { mk: 'Aperol Spritz со поглед кон Скопје', en: 'Aperol Spritz looking over Skopje' }],
  dj: [900, 1200, { mk: 'Диџеј пред полна тераса под црвени светла', en: 'DJ playing to a full terrace under red lights' }],
  martini: [961, 1200, { mk: 'Два коктели навечер во градината', en: 'Two cocktails in the garden at night' }],
  sign: [960, 1200, { mk: 'Табла во форма на стрелка со натпис Zelenika покрај патеката', en: 'Arrow-shaped Zelenika sign beside the trail' }],
};
const GALLERY = [...MOSAIC.map(([k, w, h, , alt]) => ({ k, w, h, alt })), ...Object.entries(EXTRA).map(([k, [w, h, alt]]) => ({ k, w, h, alt }))];

function Zoom({ k, onZoom, label, className, children, ...rest }) {
  return (
    <button type="button" className={`zoom ${className || ''}`} onClick={() => onZoom(k)} aria-label={label} {...rest}>
      {children}
      <span className="zoom__icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
      </span>
    </button>
  );
}

const FOOD_IMG = ['spread', 'pizza', 'fillet', 'cheers', 'cheers', 'aperol', 'court'];

function OpenSign({ status, small }) {
  return (
    <a className={`sign${status.open ? '' : ' is-closed'}${small ? ' sign--small' : ''}`} href="#poseta" aria-live="polite">
      <span className="sign__out"><span className="sign__in">
        <img src={A('brand/mark-dark.png')} width="598" height="741" alt="" />
        <span><b>{status.title}</b><span className="sign__sub"><i className="dot" />{status.sub}</span></span>
      </span></span>
    </a>
  );
}

function Aerial({ t, onZoom }) {
  const [active, setActive] = useState(null);
  return (
    <section className="aerial" id="odgore" aria-labelledby="aerial-h">
      <div className="aerial__head band-x">
        <h2 id="aerial-h" data-reveal>{t.aerial.title}</h2>
        <p data-reveal>{t.aerial.text}</p>
      </div>
      <div className="aerial__stage" data-reveal="zoom">
        <img src={A('photos/drone.webp')} width="1440" height="959" loading="lazy" alt={t.aerial.title} />
        <button type="button" className="aerial__full" onClick={() => onZoom('drone')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
          {t.zoom.full}
        </button>
        {SPOTS.map(([k, x, y], i) => {
          const [name, desc] = t.aerial.spots[k];
          const on = active === k;
          return (
            <div key={k} className={`spot${on ? ' is-on' : ''}${x > 60 ? ' spot--left' : ''}`} style={{ left: `${x}%`, top: `${y}%`, '--i': i }}>
              <button type="button" aria-expanded={on} aria-controls={`spot-${k}`} onClick={() => setActive(on ? null : k)}>
                <span className="sr">{name}</span>
              </button>
              <div className="spot__card" id={`spot-${k}`} role="region" aria-label={name} hidden={!on}>
                <b>{name}</b><span>{desc}</span>
              </div>
            </div>
          );
        })}
      </div>
      <ul className="aerial__list band-x">
        {SPOTS.map(([k]) => (
          <li key={k}><button type="button" className={active === k ? 'is-on' : ''} aria-pressed={active === k} onClick={() => setActive(active === k ? null : k)}>{t.aerial.spots[k][0]}</button></li>
        ))}
      </ul>
    </section>
  );
}

function FoodList({ t }) {
  const [hover, setHover] = useState(-1);
  const floatRef = useRef(null);
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!fine) return undefined;
    let raf = 0;
    const move = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (floatRef.current) floatRef.current.style.transform = `translate(${e.clientX + 24}px, ${e.clientY - 110}px) rotate(-4deg)`;
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, []);
  return (
    <>
      <ul className="menu" onPointerLeave={() => setHover(-1)}>
        {t.food.items.map(([name, desc], i) => (
          <li key={name} onPointerEnter={() => setHover(i)} data-reveal style={{ '--d': i % 4 }}>
            <h3>{name}</h3><p>{desc}</p>
          </li>
        ))}
      </ul>
      <div className={`float-img${hover >= 0 ? ' is-on' : ''}`} ref={floatRef} aria-hidden="true">
        {FOOD_IMG.map((k, i) => <img key={i} src={A(`photos/${k}.webp`)} alt="" width="240" height="300" className={hover === i ? 'is-on' : ''} loading="lazy" />)}
      </div>
    </>
  );
}

export default function Home() {
  const { t, lang } = useLang();
  const { hours, status, today } = useOpenStatus(t.status);
  useReveal([lang]);
  use3D();
  const order = [1, 2, 3, 4, 5, 6, 0];
  const [lb, setLb] = useState(-1);
  const zoom = (k) => setLb(GALLERY.findIndex((g) => g.k === k));
  const zl = (alt) => `${t.zoom.open}: ${alt}`;

  return (
    <>
      <SiteHeader />
      <main id="main">
        {/* ---------- Hero ---------- */}
        <section className="hero" aria-labelledby="hero-h">
          <Suspense fallback={<div className="vodno is-loading" />}>
            <Vodno3D labels={t.hero} />
          </Suspense>
          <div className="hero__in">
            <div className="hero__copy">
              <h1 id="hero-h">{t.hero.title}</h1>
              <p className="hero__lead">{t.hero.lead}</p>
              <div className="row">
                <Link className="btn btn-solid btn-lg" to="/rezervacija">{t.hero.book}</Link>
                <a className="btn btn-ghost btn-lg" href={BUSINESS.maps} target="_blank" rel="noopener noreferrer">{t.hero.maps}</a>
              </div>
            </div>
            <OpenSign status={status} />
          </div>
          <p className="hero__hint" aria-hidden="true">{t.hero.drag}</p>
        </section>

        {/* ---------- Marquee ---------- */}
        <div className="marquee" aria-hidden="true">
          <div className="marquee__track">
            {[0, 1].map((k) => (
              <span key={k}>
                {t.marquee.map((w) => (<span key={w}>{w}<img src={A('brand/mark-dark.png')} width="598" height="741" alt="" /></span>))}
              </span>
            ))}
          </div>
        </div>

        {/* ---------- Terrace ---------- */}
        <section className="band green" id="terasa" aria-labelledby="terrace-h">
          <div className="wrap split">
            <div className="split__text">
              <h2 id="terrace-h" data-reveal>{t.terrace.title}</h2>
              <p data-reveal>{t.terrace.text}</p>
              <dl className="facts">
                {t.terrace.facts.map(([a, b], i) => (<div key={a} data-reveal style={{ '--d': i }}><dt>{a}</dt><dd>{b}</dd></div>))}
              </dl>
            </div>
            <div className="mosaic">
              {MOSAIC.map(([k, w, h, cls, alt], i) => (
                <figure key={k} className={cls} data-reveal="tilt3d" data-tilt="6" style={{ '--d': i % 3 }}>
                  <Zoom k={k} onZoom={zoom} label={zl(alt[lang])}><img src={A(`photos/${k}.webp`)} width={w} height={h} alt="" loading="lazy" /></Zoom>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Aerial ---------- */}
        <Aerial t={t} onZoom={zoom} />

        {/* ---------- Food ---------- */}
        <section className="band" id="kujna" aria-labelledby="food-h">
          <div className="wrap kitchen">
            <div>
              <h2 id="food-h" data-reveal>{t.food.title}</h2>
              <p className="muted" data-reveal>{t.food.text}</p>
              <FoodList t={t} />
              <p className="note">{t.food.note}</p>
            </div>
            <div className="plates" data-depth-stage>
              <figure className="plates__a" data-depth="3" data-tilt="8"><Zoom k="spread" onZoom={zoom} label={zl(EXTRA.spread[2][lang])}><img src={A('photos/spread.webp')} width="1200" height="800" loading="lazy" alt="" /></Zoom></figure>
              <figure className="plates__b" data-depth="6" data-tilt="8"><Zoom k="pizza" onZoom={zoom} label={zl(EXTRA.pizza[2][lang])}><img src={A('photos/pizza.webp')} width="960" height="1200" loading="lazy" alt="" /></Zoom></figure>
              <figure className="plates__c" data-depth="9" data-tilt="8"><Zoom k="aperol" onZoom={zoom} label={zl(EXTRA.aperol[2][lang])}><img src={A('photos/aperol.webp')} width="944" height="1181" loading="lazy" alt="" /></Zoom></figure>
              <figure className="plates__d" data-depth="4" data-tilt="8"><Zoom k="fillet" onZoom={zoom} label={zl(EXTRA.fillet[2][lang])}><img src={A('photos/fillet.webp')} width="960" height="1200" loading="lazy" alt="" /></Zoom></figure>
            </div>
          </div>
        </section>

        {/* ---------- Nights ---------- */}
        <section className="nights" id="vecheri" aria-labelledby="nights-h">
          <div className="nights__media" data-depth-stage>
            <Zoom k="dj" onZoom={zoom} label={zl(EXTRA.dj[2][lang])} className="nights__a" data-depth="2"><img src={A('photos/dj.webp')} width="900" height="1200" loading="lazy" alt="" /></Zoom>
            <Zoom k="martini" onZoom={zoom} label={zl(EXTRA.martini[2][lang])} className="nights__b" data-depth="7"><img src={A('photos/martini.webp')} width="961" height="1200" loading="lazy" alt="" /></Zoom>
          </div>
          <div className="nights__txt">
            <h2 id="nights-h" data-reveal>{t.nights.title}</h2>
            <p data-reveal>{t.nights.text}</p>
            <p data-reveal>{t.nights.text2}</p>
            <div className="callbox" data-reveal>
              <span>{t.nights.cta}</span>
              <a className="btn btn-solid btn-lg" href={`tel:${BUSINESS.phone}`} aria-label={`${t.call}: ${BUSINESS.phoneIntl}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
                <span className="nowrap">{BUSINESS.phoneIntl}</span>
              </a>
            </div>
          </div>
        </section>

        {/* ---------- Visit ---------- */}
        <section className="band paper" id="poseta" aria-labelledby="hours-h">
          <div className="wrap two">
            <div>
              <h2 id="hours-h">{t.visit.hours}</h2>
              <p className={`status${status.open ? '' : ' is-closed'}`}><i />{status.title}{status.sub ? `, ${status.sub}` : ''}</p>
              <table className="hours">
                <tbody>
                  {order.map((w) => {
                    const h = hours.find((x) => x.weekday === w);
                    return (
                      <tr key={w} className={w === today ? 'is-today' : ''}>
                        <th scope="row">{dayName(w, lang)}{w === today && <span className="pill">{t.status.today}</span>}</th>
                        <td>{h?.is_open ? `${fmtTime(h.open_min)} – ${h.close_min >= 1440 ? t.status.midnight : fmtTime(h.close_min)}` : t.status.closed}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <h2>{t.visit.how}</h2>
              <div className="way">
                <figure data-tilt="6"><Zoom k="sign" onZoom={zoom} label={zl(EXTRA.sign[2][lang])}><img src={A('photos/sign.webp')} width="960" height="1200" loading="lazy" alt="" /></Zoom></figure>
                <ul>
                  {[t.visit.foot, t.visit.car, t.visit.summit].map(([a, b]) => (<li key={a}><b>{a}</b><span>{b}</span></li>))}
                </ul>
              </div>
              <p className="addr">{BUSINESS.address[lang]}</p>
              <div className="row">
                <a className="btn btn-dark" href={BUSINESS.maps} target="_blank" rel="noopener noreferrer">{t.hero.maps}</a>
                <a className="btn btn-outline-dark" href={`tel:${BUSINESS.phone}`}>{BUSINESS.phoneIntl}</a>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- CTA ---------- */}
        <section className="cta band green" aria-labelledby="cta-h">
          <div className="wrap cta__in">
            <img src={A('brand/mark-dark.png')} width="598" height="741" alt="" className="cta__mark" />
            <div>
              <h2 id="cta-h">{t.cta.title}</h2>
              <p>{t.cta.text}</p>
            </div>
            <Link className="btn btn-dark btn-lg" to="/rezervacija">{t.cta.btn}</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
      {lb >= 0 && (
        <Suspense fallback={null}>
          <Lightbox items={GALLERY.map((g) => ({ ...g, alt: g.alt[lang] }))} index={lb} onIndex={setLb} onClose={() => setLb(-1)} labels={t.zoom} />
        </Suspense>
      )}
    </>
  );
}
