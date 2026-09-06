import type { ReactNode } from 'react';

export function Card({ title, subtitle, right, children, className = '', bodyClass = '' }: {
  title?: ReactNode; subtitle?: ReactNode; right?: ReactNode;
  children: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={`flex min-h-0 flex-col rounded-xl border border-border bg-surface ${className}`}>
      {title && (
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.09em] text-fg-muted">{title}</h2>
            {subtitle && <p className="truncate text-[11px] text-fg-subtle">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function Badge({ children, tone = 'neutral', title }: {
  children: ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'muted'; title?: string;
}) {
  const tones = {
    neutral: 'bg-surface-raised text-fg-muted border-border',
    accent: 'bg-accent/15 text-accent border-accent/40',
    success: 'bg-success/15 text-success border-success/40',
    warning: 'bg-warning/15 text-warning border-warning/40',
    danger: 'bg-danger/15 text-danger border-danger/40',
    muted: 'bg-surface-raised text-fg-subtle border-border',
  };
  return (
    <span title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-[1px] font-mono text-[10px] leading-4 ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Button({ children, onClick, variant = 'ghost', size = 'md', disabled, title, className = '' }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; title?: string; className?: string;
  variant?: 'primary' | 'ghost' | 'subtle'; size?: 'sm' | 'md';
}) {
  const variants = {
    primary: 'bg-accent text-[#04121f] border-accent hover:bg-accent-strong font-semibold',
    ghost: 'bg-surface-raised text-fg border-border hover:bg-surface-hover',
    subtle: 'bg-transparent text-fg-muted border-transparent hover:bg-surface-hover hover:text-fg',
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={`inline-flex items-center gap-1.5 rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40
        ${size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-4 text-center text-[11px] italic text-fg-subtle">{children}</p>;
}

export function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 ${className}`} fill="currentColor" aria-hidden>
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3.25-3.25a.75.75 0 1 1 1.06-1.06L6.75 10.19l5.97-5.97a.75.75 0 0 1 1.06 0Z" />
    </svg>
  );
}

export function BranchIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-4 w-4 ${className}`} fill="currentColor" aria-hidden>
      <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
    </svg>
  );
}
