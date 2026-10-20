import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between scroll-mt-24">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-['Space_Grotesk']">{title}</h1>
        {subtitle ? <p className="mt-1 text-xs sm:text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 relative z-10">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.04)]", className)}>
      {children}
    </div>
  );
}

export function Button({
  variant = "primary",
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary:
      "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold shadow-sm shadow-amber-500/25 hover:shadow-md hover:shadow-amber-500/35 hover:-translate-y-0.5 active:translate-y-0 active:shadow-none",
    secondary:
      "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 shadow-sm hover:shadow active:bg-slate-100",
    ghost: "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 active:bg-slate-200/80",
    danger:
      "bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-semibold shadow-sm shadow-rose-600/25 hover:shadow-md hover:shadow-rose-600/35 hover:-translate-y-0.5 active:translate-y-0",
  };
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 select-none",
        styles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-all duration-150 focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10 disabled:bg-slate-50 disabled:text-slate-400",
        props.className,
      )}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-all duration-150 focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10 disabled:bg-slate-50 disabled:text-slate-400",
        props.className,
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-sm transition-all duration-150 focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10 disabled:bg-slate-50 disabled:text-slate-400 cursor-pointer",
        props.className,
      )}
    />
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">{label}</span>
      {children}
      {error ? <span className="text-xs font-medium text-rose-600 block">{error}</span> : null}
    </label>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "rose" | "teal" }) {
  const map = {
    slate: "bg-slate-100 text-slate-700 border border-slate-200/80",
    green: "bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-semibold",
    amber: "bg-amber-50 text-amber-800 border border-amber-200/80 font-semibold",
    rose: "bg-rose-50 text-rose-700 border border-rose-200/80 font-semibold",
    teal: "bg-teal-50 text-teal-800 border border-teal-200/80 font-semibold",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", map[tone])}>
      {children}
    </span>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/60 px-6 py-12 text-center">
      <p className="font-semibold text-slate-800 text-base">{title}</p>
      {hint ? <p className="mt-1.5 text-xs sm:text-sm text-slate-500 max-w-md mx-auto">{hint}</p> : null}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-rose-800 shadow-sm">
      {message}
    </div>
  );
}

export function Spinner() {
  return <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-amber-500" />;
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-150" role="dialog" aria-modal>
      <div className="fixed inset-0" aria-label="Close backdrop" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold text-slate-900 font-['Space_Grotesk']">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            aria-label="Close"
          >
            <span className="text-xl leading-none">&times;</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Confirm({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="mb-5 text-sm text-slate-600 leading-relaxed">{body}</p>
      <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
