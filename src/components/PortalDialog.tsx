import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  title: string;
  titleId: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  descriptionId?: string;
  alert?: boolean;
  testId?: string;
};
const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function PortalDialog({ title, titleId, children, actions, onClose, dismissible = true, descriptionId, alert = false, testId }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const root = document.getElementById('root');
    const previousInert = root?.inert ?? false;
    document.body.style.overflow = 'hidden';
    if (root) root.inert = true;
    titleRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (root) root.inert = previousInert;
      if (previousFocus?.isConnected && !previousFocus.matches(':disabled')) previousFocus.focus();
      else document.getElementById('main-content')?.focus();
    };
  }, []);

  // A focused action can become disabled while its request is pending. Keep
  // keyboard focus in the dialog so Escape/Tab still work after an error.
  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.contains(document.activeElement)) titleRef.current?.focus();
  });

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { if (dismissible) { event.preventDefault(); closeRef.current(); } return; }
    if (event.key !== 'Tab') return;
    const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusable) ?? [])].filter(item => item.getClientRects().length > 0);
    if (!items.length) { event.preventDefault(); titleRef.current?.focus(); return; }
    const first = items[0]; const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return createPortal(<div className="ps-dialog-backdrop" onMouseDown={event => { if (dismissible && event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className="ps-dialog" role={alert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} data-testid={testId} onKeyDown={keyDown}>
      <div className="ps-dialog-body"><h2 ref={titleRef} tabIndex={-1} id={titleId}>{title}</h2>{children}</div>
      <div className="ps-dialog-actions">{actions}</div>
    </div>
  </div>, document.body);
}
