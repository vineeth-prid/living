import Link from "next/link";
import { Phone, MessageCircle } from "lucide-react";
import { telLink, waLink, site } from "@/lib/site";
import type { ReactNode } from "react";

// "The Threshold" — an open doorway arch framing a single Clay full-stop.
// No buildings, no roofs. Reverses to ivory on dark/photo surfaces via `tone`.
export function Mark({
  className,
  tone = "pine",
}: {
  className?: string;
  tone?: "pine" | "ivory";
}) {
  const arch = tone === "ivory" ? "#FAF8F4" : "#234B39";
  return (
    <svg viewBox="0 0 32 40" className={className} aria-hidden="true" fill="none">
      <path
        d="M4 39V17C4 10.373 9.373 5 16 5s12 5.373 12 12v22"
        stroke={arch}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="30" r="3.1" fill="#B96A43" />
    </svg>
  );
}

export function Wordmark({
  tone = "pine",
  className,
}: {
  tone?: "pine" | "ivory";
  className?: string;
}) {
  const text = tone === "ivory" ? "text-stone-50" : "text-ink";
  return (
    <Link
      href="/"
      aria-label="Living — home"
      className={`inline-flex items-center gap-2 ${className ?? ""}`}
    >
      <Mark className="h-8 w-auto" tone={tone} />
      <span className={`font-display text-2xl leading-none ${text}`}>
        Living<span className="text-clay-500">.</span>
      </span>
    </Link>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

type BtnProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "accent" | "ghost" | "quiet";
  className?: string;
  external?: boolean;
};

export function Button({
  href,
  children,
  variant = "primary",
  className,
  external,
}: BtnProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[12px] px-6 py-3 text-[15px] font-medium transition-all duration-200 ease-[var(--ease-calm)] min-h-[44px] active:scale-[0.98]";
  const styles = {
    primary:
      "bg-pine-600 text-stone-50 hover:bg-pine-700 hover:-translate-y-0.5 shadow-soft hover:shadow-lift",
    accent:
      "bg-clay-500 text-pine-950 hover:bg-clay-400 hover:-translate-y-0.5 shadow-soft hover:shadow-lift",
    ghost:
      "border border-stone-300 text-ink hover:border-pine-400 hover:text-pine-700",
    quiet: "text-pine-700 hover:text-pine-800 underline-offset-4 hover:underline px-0",
  }[variant];
  const cls = `${base} ${styles} ${className ?? ""}`;
  const isInternal = href.startsWith("/") && !external;
  if (isInternal) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={cls} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
      {children}
    </a>
  );
}

// The recurring Call + WhatsApp pair used across listings and CTAs.
export function ContactActions({
  message,
  compact,
}: {
  message?: string;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button href={telLink} variant="primary" external>
        <Phone className="h-4 w-4" strokeWidth={1.75} />
        {compact ? "Call" : site.phone}
      </Button>
      <Button href={waLink(message)} variant="ghost" external>
        <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
        WhatsApp
      </Button>
    </div>
  );
}

// Section wrapper with generous vertical rhythm (96px).
export function Section({
  children,
  className,
  id,
  tone,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: "page" | "surface" | "pine" | "ink";
}) {
  const bg = {
    page: "bg-page",
    surface: "bg-surface",
    pine: "bg-pine-700 text-stone-50",
    ink: "bg-stone-950 text-stone-100",
  }[tone ?? "page"];
  return (
    <section id={id} className={`py-16 md:py-24 ${bg} ${className ?? ""}`}>
      <div className="shell">{children}</div>
    </section>
  );
}
