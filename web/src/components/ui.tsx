export function SectionCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`pixel-panel p-4 ${className}`}>
      {title && (
        <div className="mb-3 flex items-baseline justify-between gap-2 border-b-2 border-[color:var(--panel-light)] pb-2">
          <h2 className="text-lg font-bold uppercase tracking-wide text-[color:var(--cyan)]">
            {title}
          </h2>
          {subtitle && (
            <span className="font-mono text-xs text-slate-500">{subtitle}</span>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="pixel-panel p-4">
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="font-pixel mt-2 text-base leading-relaxed text-[color:var(--gold)]">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function VerdictBadge({ verdict }: { verdict: boolean }) {
  return verdict ? (
    <span className="font-pixel inline-flex items-center border-2 border-[color:var(--ink)] bg-[color:var(--green)] px-2 py-1 text-[10px] text-[#0f2016] shadow-[2px_2px_0_0_var(--ink)]">
      RELEASED
    </span>
  ) : (
    <span className="font-pixel inline-flex items-center border-2 border-[color:var(--ink)] bg-[color:var(--magenta)] px-2 py-1 text-[10px] text-[#2a0a18] shadow-[2px_2px_0_0_var(--ink)]">
      DENIED
    </span>
  );
}

export function Button({
  children,
  disabled,
  loading,
  variant = "primary",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: "primary" | "secondary";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 border-2 border-[color:var(--ink)] px-4 py-2 text-lg uppercase tracking-wide transition-transform disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[3px_3px_0_0_var(--ink)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none";
  const styles =
    variant === "primary"
      ? "bg-[color:var(--gold)] text-[color:var(--ink)] shadow-[3px_3px_0_0_var(--ink)] hover:brightness-110"
      : "bg-transparent text-[color:var(--cyan)] shadow-[3px_3px_0_0_var(--ink)] hover:bg-white/5";
  return (
    <button className={`${base} ${styles}`} disabled={disabled || loading} {...rest}>
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
