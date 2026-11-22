// Full-screen photo viewer: arrows / swipe / keyboard (← → Esc), focus returns to the photo that opened it.
import { useEffect, useRef } from 'react';
import { A } from '../lib/asset';

export default function Lightbox({ items, index, onIndex, onClose, labels }) {
  const closeRef = useRef(null);
  const backTo = useRef(null);
  const start = useRef(null);
  const n = items.length;
  const go = (d) => onIndex((index + d + n) % n);

  useEffect(() => {
    backTo.current = document.activeElement;
    closeRef.current?.focus();
    document.body.classList.add('no-scroll');
    return () => {
      document.body.classList.remove('no-scroll');
      backTo.current?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', key);
    // preload neighbours
    [1, -1].forEach((d) => { const i = new Image(); i.src = A(`photos/${items[(index + d + n) % n].k}.webp`); });
    return () => document.removeEventListener('keydown', key);
  });

  const it = items[index];
  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label={labels.title}
      onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        const s = start.current; start.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
        else if (e.target === e.currentTarget) onClose();
      }}>
      <img key={it.k} className="lb__img" src={A(`photos/${it.k}.webp`)} width={it.w} height={it.h} alt={it.alt} draggable="false" />
      <button type="button" ref={closeRef} className="lb__btn lb__close" aria-label={labels.close} onClick={onClose}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <button type="button" className="lb__btn lb__prev" aria-label={labels.prev} onClick={() => go(-1)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <button type="button" className="lb__btn lb__next" aria-label={labels.next} onClick={() => go(1)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>
      <p className="lb__count" aria-live="polite">{index + 1} / {n}</p>
    </div>
  );
}
