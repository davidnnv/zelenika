import { useEffect } from 'react';

/**
 * 3D effects driven by the mouse (desktop only, off for reduced motion):
 *  - [data-tilt]   : element tilts toward the pointer, with a moving glare (--mx, --my)
 *  - [data-depth]  : hero layers move at different depths (--px, --py on the container)
 */
export default function use3D() {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || calm) return undefined;

    let active = null;
    let raf = 0;
    let last = null;

    const apply = () => {
      raf = 0;
      if (!last) return;
      const { e } = last;
      const el = e.target.closest?.('[data-tilt]');
      if (active && active !== el) reset(active);
      if (el) {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        const max = Number(el.dataset.tilt) || 8;
        el.style.setProperty('--ry', `${(x - 0.5) * 2 * max}deg`);
        el.style.setProperty('--rx', `${(0.5 - y) * 2 * max}deg`);
        el.style.setProperty('--mx', `${x * 100}%`);
        el.style.setProperty('--my', `${y * 100}%`);
        el.classList.add('is-tilting');
        active = el;
      }
      document.querySelectorAll('[data-depth-stage]').forEach((stage) => {
        const r = stage.getBoundingClientRect();
        if (e.clientY > r.top - 200 && e.clientY < r.bottom + 200) {
          stage.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
          stage.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
        }
      });
    };
    const reset = (el) => {
      el.classList.remove('is-tilting');
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      if (active === el) active = null;
    };
    const onMove = (e) => {
      last = { e };
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => active && reset(active);

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, []);
}
