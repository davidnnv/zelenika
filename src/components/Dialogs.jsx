// In-app confirm dialog and error toast for the admin panel (instead of browser alert/confirm).
import { useEffect, useRef, useState } from 'react';

let push = null;

/** Ask for confirmation. Resolves true/false. */
export function askConfirm({ title, text, confirm = 'Избриши', cancel = 'Откажи', danger = true }) {
  return new Promise((resolve) => {
    if (!push) return resolve(false);
    push({ type: 'confirm', title, text, confirm, cancel, danger, resolve });
  });
}

/** Show a short message at the bottom of the screen. */
export function notify(text, kind = 'error') {
  push?.({ type: 'toast', text, kind });
}

export default function Dialogs() {
  const [dlg, setDlg] = useState(null);
  const [toast, setToast] = useState(null);
  const okRef = useRef(null);
  const lastFocus = useRef(null);

  useEffect(() => {
    push = (item) => {
      if (item.type === 'confirm') {
        lastFocus.current = document.activeElement;
        setDlg(item);
      } else {
        setToast({ ...item, id: Date.now() });
      }
    };
    return () => {
      push = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const close = (answer) => {
    dlg?.resolve(answer);
    setDlg(null);
    lastFocus.current?.focus?.();
  };

  useEffect(() => {
    if (!dlg) return undefined;
    okRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && close(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dlg]);

  return (
    <>
      {dlg && (
        <div className="dlg-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
          <div className="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-text">
            <span className={`dlg__icon${dlg.danger ? ' is-danger' : ''}`} aria-hidden="true">
              {dlg.danger ? (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
                </svg>
              ) : (
                '?'
              )}
            </span>
            <h2 id="dlg-title">{dlg.title}</h2>
            {dlg.text && <p id="dlg-text">{dlg.text}</p>}
            <div className="dlg__actions">
              <button type="button" className="btn btn-ghost" onClick={() => close(false)}>
                {dlg.cancel}
              </button>
              <button type="button" ref={okRef} className={`btn ${dlg.danger ? 'btn-danger' : 'btn-solid'}`} onClick={() => close(true)}>
                {dlg.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div key={toast.id} className={`snack snack--${toast.kind}`} role="status">
          {toast.text}
          <button type="button" aria-label="Затвори" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </>
  );
}
