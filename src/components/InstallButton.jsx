// "Install the app" button (footer and admin). Android/desktop: the real install prompt; iPhone: 3 steps.
import { useState } from 'react';
import { useInstall } from '../lib/pwa';
import { useLang } from '../lang';
import { A } from '../lib/asset';

export function IosSteps({ onClose }) {
  const { t } = useLang();
  return (
    <div className="dlg-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="ios-title">
        <img className="dlg__logo" src={A('icons/icon-192.png')} width="56" height="56" alt="" />
        <h2 id="ios-title">{t.install.iosTitle}</h2>
        <ol className="ios-steps">
          <li>{t.install.ios1} <b>{t.install.share}</b> <ShareIcon /></li>
          <li>{t.install.ios2} <b>„{t.install.addHome}“</b></li>
          <li>{t.install.ios3}</li>
        </ol>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <button type="button" className="btn btn-solid" onClick={onClose} autoFocus>{t.install.ok}</button>
      </div>
    </div>
  );
}

export default function InstallButton({ className = 'install-link' }) {
  const { t } = useLang();
  const { installed, canPrompt, prompt } = useInstall();
  const [ios, setIos] = useState(false);
  if (installed) return <span className="install-ok">✓ {t.install.installed}</span>;
  return (
    <>
      <button type="button" className={className} onClick={() => (canPrompt ? prompt() : setIos(true))}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
        {t.install.button}
      </button>
      {ios && <IosSteps onClose={() => setIos(false)} />}
    </>
  );
}

function ShareIcon() {
  return (
    <svg className="ios-share" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}
