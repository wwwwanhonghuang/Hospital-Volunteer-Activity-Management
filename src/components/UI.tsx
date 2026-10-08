// SPDX-License-Identifier: AGPL-3.0-only
import { Children, cloneElement, isValidElement, useEffect, useId, useRef, type ReactElement, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Inbox, X } from 'lucide-react';

export function handleTabKeys(event: ReactKeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0 || !tabs.length) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus(); tabs[next].click();
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const titleId = useId(); const ref = useRef<HTMLDivElement>(null); const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement; const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])].filter(el => el.offsetParent !== null);
    const timer = setTimeout(() => (focusable()[0] || ref.current)?.focus(), 20);
    const handle = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') { const els = focusable(); const first = els[0]; const last = els[els.length - 1]; if (!els.length) {e.preventDefault(); return;}
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handle); return () => { clearTimeout(timer); document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', handle); previous?.focus(); };
  }, []);
  return createPortal(<div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><header className="modal-header"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></header><div className="modal-content">{children}</div></div></div>, document.body);
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId(); const elements = Children.toArray(children); const child = elements.length === 1 && isValidElement(elements[0]) ? elements[0] as ReactElement<{id?: string; 'aria-describedby'?: string}> : null;
  return <div className="field"><label htmlFor={child?.props.id || id}>{label}</label>{child ? cloneElement(child, { id: child.props.id || id, ...(hint ? { 'aria-describedby': `${id}-hint` } : {}) }) : children}{hint && <small id={`${id}-hint`} className="muted">{hint}</small>}</div>;
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'green' | 'amber' | 'red' | 'blue' | 'neutral' }) {return <span className={`badge badge-${tone}`}>{children}</span>;}
export function EmptyState({ title, description, action }: {title: string; description?: string; action?: ReactNode}) {return <div className="empty-state"><span className="empty-icon"><Inbox size={25}/></span><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;}
export function PageHeader({ eyebrow, title, description, actions }: {eyebrow?: string; title: string; description?: string; actions?: ReactNode}) {return <div className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;}
export function Progress({value, tone = 'green', label = 'Completion progress'}: {value: number; tone?: string; label?: string}) {return <div className={`progress-track progress-${tone}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><span style={{width: `${Math.max(0, Math.min(100, value))}%`}}/></div>;}
export function Avatar({name, index = 0, size = ''}: {name: string; index?: number; size?: string}) { return <span className={`avatar avatar-${index % 5} ${size}`} title={name}>{name.split(' ').map(x => x[0]).slice(0,2).join('')}</span>; }
export const statusLabel = (status: string) => status.replaceAll('_', ' ').replace(/^./, x => x.toUpperCase());
export const formatDate = (date: string, opts?: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00+09:00`).toLocaleDateString('en-GB', opts || {day:'numeric',month:'short'});
export function ConfirmDialog({title, description, onConfirm, onClose}: {title:string;description:string;onConfirm:()=>void;onClose:()=>void}) { return <Modal title={title} onClose={onClose}><p>{description}</p><div className="form-actions"><button className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" onClick={onConfirm}>Confirm</button></div></Modal>; }
