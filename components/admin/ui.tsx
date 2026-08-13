import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Admin primitives. Denser and plainer than the public site's components on
// purpose (§42) — but built from the same tokens, so there is still one design
// system rather than two. Nothing here is imported by public pages.

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

export const inputClass =
  "w-full rounded-[10px] border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-pine-500 focus:ring-[3px] focus:ring-pine-500/20 disabled:bg-stone-100 disabled:text-stone-500";

/**
 * Compact variant of `inputClass` for filter bars: fixed height, no full-width
 * stretch, so a page's whole filter set sits on one line instead of a block.
 */
export const filterClass =
  "h-9 shrink-0 rounded-[8px] border border-stone-300 bg-white px-2.5 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-pine-500 focus:ring-[3px] focus:ring-pine-500/20";

/**
 * A GET form: filters live in the URL, so a filtered view is shareable and the
 * back button behaves. One line, scrolling sideways rather than wrapping into
 * a wall — the filters were taking more vertical space than the results.
 */
export function FilterBar({
  clearHref,
  children,
}: {
  clearHref: string;
  children: ReactNode;
}) {
  return (
    <form
      method="get"
      className="mb-4 flex items-center gap-2 overflow-x-auto rounded-[12px] border border-stone-200 bg-white px-3 py-2"
    >
      {children}
      <button
        type="submit"
        className="h-9 shrink-0 rounded-[8px] bg-pine-600 px-4 text-sm font-medium text-white transition hover:bg-pine-700"
      >
        Apply
      </button>
      <Link
        href={clearHref}
        className="shrink-0 px-1 text-sm text-stone-500 hover:text-stone-800"
      >
        Clear
      </Link>
    </form>
  );
}

/** Label sitting inline with its control, for date filters that need one. */
export function FilterLabel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-xs text-stone-500">
      {label}
      {children}
    </label>
  );
}

const BUTTON_VARIANTS = {
  primary:
    "bg-pine-600 text-white hover:bg-pine-700 disabled:bg-pine-600/50 shadow-soft",
  secondary:
    "bg-white text-stone-800 border border-stone-300 hover:bg-stone-50 disabled:text-stone-400",
  danger: "bg-[var(--color-danger)] text-white hover:brightness-95",
  ghost: "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
} as const;

type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: "sm" | "md";
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition disabled:cursor-not-allowed",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        BUTTON_VARIANTS[variant],
        className,
      )}
    />
  );
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: "sm" | "md";
}) {
  return (
    <Link
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        BUTTON_VARIANTS[variant],
        className,
      )}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="text-xs font-semibold tracking-wide text-stone-700">
        {label}
        {required && <span className="ml-0.5 text-[var(--color-danger)]">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && !error && (
        <span className="mt-1 block text-xs text-stone-500">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-xs text-[var(--color-danger)]">
          {error}
        </span>
      )}
    </label>
  );
}

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-[14px] border border-stone-200 bg-white shadow-soft",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-3">
          {title && (
            <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
          )}
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "bg-stone-100 text-stone-700",
  green: "bg-pine-50 text-pine-700",
  gold: "bg-clay-50 text-clay-800",
  red: "bg-[#fbeceb] text-[var(--color-danger)]",
  blue: "bg-[#eaf1f6] text-[var(--color-info)]",
} as const;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
      <p className="text-sm font-medium text-stone-800">{title}</p>
      {hint && <p className="max-w-sm text-sm text-stone-500">{hint}</p>}
      {action}
    </div>
  );
}

/** Horizontally scrolls on tablet rather than squeezing columns to nothing. */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-stone-200 bg-white shadow-soft">
      <table className="w-full min-w-[56rem] border-collapse text-sm">
        {children}
      </table>
    </div>
  );
}

export const Th = ({ className, ...props }: ComponentProps<"th">) => (
  <th
    {...props}
    className={cx(
      "whitespace-nowrap border-b border-stone-200 bg-stone-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-stone-500",
      className,
    )}
  />
);

export const Td = ({ className, ...props }: ComponentProps<"td">) => (
  <td
    {...props}
    className={cx(
      "border-b border-stone-100 px-4 py-3 align-middle text-stone-700",
      className,
    )}
  />
);

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-[10px] bg-[#fbeceb] px-3 py-2 text-sm text-[var(--color-danger)]"
    >
      {children}
    </p>
  );
}
