import { useEffect, useRef, type ReactNode } from 'react';

// Native <dialog>: focus trap, Esc to close and backdrop come from the browser.
export default function Dialog({ open, title, onClose, children, wide }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`dialog${wide ? ' dialog-wide' : ''}`} onClose={onClose} aria-labelledby="dialog-title">
      {open && (
        <>
          <div className="dialog-head">
            <h2 id="dialog-title">{title}</h2>
            <button className="icon-btn" aria-label="סגירה" onClick={onClose}>×</button>
          </div>
          {children}
        </>
      )}
    </dialog>
  );
}
