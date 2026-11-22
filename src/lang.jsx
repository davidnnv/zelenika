import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { T } from './i18n';

const Ctx = createContext(null);

// Saved choice first, then the browser languages (Macedonian and neighbouring languages → MK, the rest → EN).
function initial() {
  try {
    const s = localStorage.getItem('zl-lang');
    if (s === 'mk' || s === 'en') return s;
  } catch { /* ignore */ }
  const langs = (navigator.languages || [navigator.language || 'mk']).map((x) => String(x).toLowerCase());
  return langs.some((x) => /^(mk|sr|bg|hr|bs|sq)/.test(x)) ? 'mk' : 'en';
}

export function LangProvider({ children }) {
  const [lang, setLang] = useState(initial);
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem('zl-lang', lang); } catch { /* ignore */ }
  }, [lang]);
  const value = useMemo(() => ({ lang, t: T[lang], toggle: () => setLang((l) => (l === 'mk' ? 'en' : 'mk')) }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
