import Link from "next/link";
import Image from "next/image";
import { Phone, MessageCircle } from "lucide-react";
import { telLink, waLink, site } from "@/lib/site";
import type { ReactNode } from "react";

// The Living wordmark. `tone="ivory"` uses the reversed logo for dark surfaces.
export function Logo({
  tone = "color",
  className,
  priority,
  linked = true,
}: {
  tone?: "color" | "ivory";
  className?: string;
  priority?: boolean;
  linked?: boolean;
}) {
  const img = (
    <Image
      src={tone === "ivory" ? "/logo-light.png" : "/logo.png"}
      alt="Living — by ITR Groups"
      width={1337}
      height={448}
      priority={priority}
      className={`w-auto ${className ?? "h-9"}`}
    />
  );
  if (!linked) return img;
  return (
    <Link href="/" aria-label="Living — home" className="inline-flex items-center">
      {img}
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
    "inline-flex items-center justify-center gap-2 rounded-[12px] px-6 py-3 text-ui font-medium transition-all duration-200 ease-[var(--ease-calm)] min-h-[44px] active:scale-[0.98]";
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
    <section id={id} className={`section ${bg} ${className ?? ""}`}>
      <div className="shell">{children}</div>
    </section>
  );
}
