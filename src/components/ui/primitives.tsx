import React from 'react';

export const Panel: React.FC<{
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, actions, children, className = '' }) => (
  <section className={`rounded-lg border border-tac-border bg-tac-panel/90 shadow-lg ${className}`}>
    {(title || actions) && (
      <header className="flex items-center justify-between border-b border-tac-border px-4 py-3">
        <div>
          {title && (
            <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-400">{title}</h2>
          )}
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {actions}
      </header>
    )}
    <div className="p-4">{children}</div>
  </section>
);

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
    size?: 'sm' | 'md' | 'lg';
  }
> = ({ variant = 'secondary', size = 'md', className = '', children, ...rest }) => {
  const base =
    'inline-flex items-center justify-center gap-2 rounded font-bold uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-40';
  const sizes = {
    sm: 'px-3 py-1.5 text-[10px]',
    md: 'px-4 py-2 text-xs',
    lg: 'px-6 py-3 text-sm'
  };
  const variants = {
    primary: 'bg-cyan-600 text-white hover:bg-cyan-500 shadow-lg shadow-cyan-950/40',
    secondary: 'border border-tac-border bg-tac-panel2 text-slate-200 hover:border-cyan-600/60 hover:bg-slate-800',
    ghost: 'text-slate-300 hover:bg-slate-800/60 hover:text-white',
    danger: 'bg-red-700 text-white hover:bg-red-600',
    success: 'bg-emerald-700 text-white hover:bg-emerald-600'
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
};

export const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, hint, disabled }) => (
  <label
    className={`flex cursor-pointer items-center justify-between gap-3 rounded border border-tac-border bg-tac-panel2/60 px-3 py-2 transition hover:border-slate-600 ${
      disabled ? 'cursor-not-allowed opacity-50' : ''
    }`}
  >
    <div className="min-w-0">
      <div className="text-xs font-semibold text-slate-200">{label}</div>
      {hint && <div className="mt-0.5 text-[10px] leading-snug text-slate-500">{hint}</div>}
    </div>
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
      className={`relative h-5 w-10 shrink-0 rounded-full border transition ${
        checked ? 'border-cyan-500 bg-cyan-600/70' : 'border-slate-600 bg-slate-800'
      }`}
    >
      <span
        className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  </label>
);

export const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  hint?: string;
  format?: (v: number) => string;
}> = ({ label, value, min, max, step = 1, suffix = '', onChange, hint, format }) => (
  <div className="rounded border border-tac-border bg-tac-panel2/60 px-3 py-2">
    <div className="mb-1.5 flex items-center justify-between">
      <span className="text-xs font-semibold text-slate-200">{label}</span>
      <span className="font-mono text-xs font-bold text-cyan-400">
        {format ? format(value) : `${value}${suffix}`}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-500"
    />
    {hint && <div className="mt-1 text-[10px] leading-snug text-slate-500">{hint}</div>}
  </div>
);

export const SelectRow: React.FC<{
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  hint?: string;
}> = ({ label, value, options, onChange, hint }) => (
  <div className="rounded border border-tac-border bg-tac-panel2/60 px-3 py-2">
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold text-slate-200">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[130px] rounded border border-tac-border bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-cyan-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
    {hint && <div className="mt-1 text-[10px] leading-snug text-slate-500">{hint}</div>}
  </div>
);

export const StatChip: React.FC<{
  label: string;
  value: React.ReactNode;
  accent?: string;
  sub?: string;
}> = ({ label, value, accent = 'text-white', sub }) => (
  <div className="rounded border border-tac-border bg-tac-panel2/70 px-3 py-2.5">
    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`mt-0.5 font-mono text-lg font-black ${accent}`}>{value}</div>
    {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
  </div>
);

export const Tabs: React.FC<{
  tabs: Array<{ id: string; label: string; badge?: string | number }>;
  active: string;
  onChange: (id: string) => void;
  className?: string;
}> = ({ tabs, active, onChange, className = '' }) => (
  <div className={`flex flex-wrap gap-1 ${className}`}>
    {tabs.map((t) => (
      <button
        key={t.id}
        onClick={() => onChange(t.id)}
        className={`rounded px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
          active === t.id
            ? 'bg-cyan-600/20 text-cyan-300 ring-1 ring-cyan-600/60'
            : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
        }`}
      >
        {t.label}
        {t.badge !== undefined && (
          <span className="ml-1.5 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
            {t.badge}
          </span>
        )}
      </button>
    ))}
  </div>
);
