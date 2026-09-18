import {useEffect, useRef, type ReactNode} from 'react';
import {X} from 'lucide-react';

export function Modal({title, onClose, children}: {title: string; onClose: () => void; children: ReactNode}) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    ) ?? []).filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
    if (!dialog.current?.contains(document.activeElement)) (focusable()[0] ?? dialog.current)?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) {
          event.preventDefault();
          dialog.current?.focus();
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return <div className="modal-wrap" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="modal" ref={dialog} tabIndex={-1}>
      <header><h2>{title}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X/></button></header>
      {children}
    </section>
  </div>;
}
