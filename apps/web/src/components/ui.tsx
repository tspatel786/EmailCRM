import {
  forwardRef,
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertCircle, Inbox, Search, X } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Design system primitives. Every page composes these, so visual changes here */
/* propagate consistently. Component APIs are backward-compatible.            */
/* -------------------------------------------------------------------------- */

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------- Layout ---------------------------------- */

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100 sm:flex">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-[1.65rem]">{title}</h1>
          {subtitle ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end [&>*]:shrink-0">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-card border border-ink-200/80 bg-white p-4 shadow-card sm:p-5", className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-ink-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Responsive filter/search bar: wraps on small screens, inline on desktop. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("crm-toolbar mb-4", className)}>
      {children}
    </div>
  );
}

/** Horizontal scroll container so wide tables never cause page-level overflow. */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("table-scroll", className)}>{children}</div>;
}

/* ------------------------------- Controls -------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-500 text-ink-950 font-semibold shadow-sm shadow-primary-500/20 hover:bg-primary-400 active:bg-primary-600 focus-visible:ring-primary-500/30",
  secondary:
    "border border-ink-200 bg-white text-ink-700 shadow-sm hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 active:bg-ink-100 focus-visible:ring-ink-400/20",
  ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200/70 focus-visible:ring-ink-400/20",
  danger:
    "bg-rose-600 text-white font-semibold shadow-sm shadow-rose-600/20 hover:bg-rose-500 active:bg-rose-700 focus-visible:ring-rose-500/30",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 py-1.5 text-xs",
  md: "min-h-10 px-4 py-2 text-sm",
  lg: "min-h-11 px-5 py-2.5 text-sm",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }
>(function Button({ variant = "primary", size = "md", children, className, ...props }, ref) {
  // `type` is passed through untouched: buttons without a type inside a <form> must keep
  // submitting it, exactly as before.
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

const controlBase =
  "w-full rounded-control border border-ink-200 bg-white px-3.5 text-sm text-ink-900 shadow-sm transition-[border-color,box-shadow] duration-150 placeholder:text-ink-400 hover:border-ink-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-500/15";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  const isCheck = props.type === "checkbox" || props.type === "radio";
  return (
    <input
      ref={ref}
      {...props}
      className={cn(
        isCheck
          ? "h-4 w-4 cursor-pointer rounded border-ink-300 text-primary-600 accent-primary-500 focus:ring-primary-500"
          : cn(controlBase, props.type === "file" ? "py-2 file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-ink-700 hover:file:bg-ink-200" : "min-h-10 py-2"),
        props.className,
      )}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(props, ref) {
  return <textarea ref={ref} rows={props.rows ?? 3} {...props} className={cn(controlBase, "min-h-[88px] py-2.5 leading-relaxed", props.className)} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(props, ref) {
  return (
    <select
      ref={ref}
      {...props}
      className={cn(controlBase, "select-chevron min-h-10 cursor-pointer appearance-none py-2 pr-9 text-ink-800", props.className)}
    />
  );
});

/** Text input with a leading search icon. Accepts all normal input props. */
export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function SearchInput(
  { className, ...props },
  ref,
) {
  return (
    <div className={cn("crm-search relative w-full", className)}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
      <input
        ref={ref}
        type="search"
        aria-label={props["aria-label"] ?? props.placeholder}
        {...props}
        className={cn(controlBase, "min-h-10 py-2 pl-9")}
      />
    </div>
  );
});

export function Field({
  label,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block min-w-0 space-y-1.5", className)}>
      <span className="flex items-center gap-1 text-xs font-semibold text-ink-700">
        {label}
        {required ? <span className="text-rose-500" aria-hidden>*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="flex items-start gap-1 text-xs font-medium text-rose-600" role="alert">
          <AlertCircle size={13} className="mt-px shrink-0" />
          {error}
        </span>
      ) : hint ? (
        <span className="block text-xs text-ink-500">{hint}</span>
      ) : null}
    </label>
  );
}

/* ------------------------------- Feedback -------------------------------- */

export type BadgeTone = "slate" | "green" | "amber" | "rose" | "teal" | "blue" | "violet";

const badgeTones: Record<BadgeTone, string> = {
  slate: "bg-ink-100 text-ink-700 ring-ink-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-primary-50 text-primary-800 ring-primary-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  teal: "bg-teal-50 text-teal-800 ring-teal-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

const badgeDots: Record<BadgeTone, string> = {
  slate: "bg-ink-400",
  green: "bg-emerald-500",
  amber: "bg-primary-500",
  rose: "bg-rose-500",
  teal: "bg-teal-500",
  blue: "bg-sky-500",
  violet: "bg-violet-500",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset",
        badgeTones[tone] ?? badgeTones.slate,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", badgeDots[tone] ?? badgeDots.slate)} aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

export function Empty({ title, hint, icon, action }: { title: string; hint?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-ink-300/80 bg-ink-50/60 px-6 py-12 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink-400 shadow-card ring-1 ring-ink-200">
        {icon ?? <Inbox size={20} />}
      </div>
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-md text-xs text-ink-500 sm:text-sm">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-control border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-800">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}

export function Spinner({ size = "md", label }: { size?: "sm" | "md" | "lg"; label?: string }) {
  const s = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-9 w-9" }[size];
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-500" role="status">
      <span className={cn(s, "animate-spin rounded-full border-2 border-ink-200 border-t-primary-500")} />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}

/** Placeholder rows shown while a list is loading. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

/** KPI tile used on the dashboard and reports. */
export function StatCard({
  label,
  value,
  icon,
  tone = "slate",
  hint,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: BadgeTone;
  hint?: ReactNode;
}) {
  const iconTone: Record<BadgeTone, string> = {
    slate: "bg-ink-100 text-ink-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-primary-50 text-primary-600",
    rose: "bg-rose-50 text-rose-600",
    teal: "bg-teal-50 text-teal-600",
    blue: "bg-sky-50 text-sky-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <div className="group rounded-card border border-ink-200/80 bg-white p-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        {icon ? <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconTone[tone])}>{icon}</span> : null}
      </div>
      <p className="mt-2 font-display text-2xl font-bold tracking-tight text-ink-900 tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

/* -------------------------------- Dialogs -------------------------------- */

export function Modal({
  open,
  title,
  children,
  onClose,
  size = "md",
  description,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl";
  description?: string;
}) {
  const titleId = useId();

  // Close on Escape and lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 animate-fade-in bg-ink-950/50 backdrop-blur-[2px]" aria-hidden onClick={onClose} />
      <div
        className={cn(
          "relative z-10 flex max-h-[92dvh] w-full animate-slide-up flex-col rounded-t-2xl bg-white shadow-pop sm:max-h-[88vh] sm:animate-scale-in sm:rounded-2xl",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg font-bold leading-snug text-ink-900">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink-400/20"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>
        <div className="modal-body overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
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
  loading = false,
  error = null,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <Modal open={open} title={title} onClose={onClose} size="sm">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <AlertCircle size={20} />
        </span>
        <p className="pt-1 text-sm leading-relaxed text-ink-600">{body}</p>
      </div>
      {error ? <div className="mt-4"><ErrorBox message={error} /></div> : null}
      <div className="mt-6 flex flex-col-reverse gap-2 border-t border-ink-100 pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button type="button" variant="danger" onClick={onConfirm} disabled={loading}>
          {loading ? "Processing..." : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
