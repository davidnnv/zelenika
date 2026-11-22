import { useEffect } from 'react';

/** Adds data-in (not a class, so React re-renders keep it) to [data-reveal] elements when they scroll into view. Re-scans when deps change. */
export default function useReveal(deps = []) {
  useEffect(() => {
    const els = [...document.querySelectorAll('[data-reveal]:not([data-in])')];
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.setAttribute('data-in', ''));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.setAttribute('data-in', '');
          io.unobserve(e.target);
        }
      }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
