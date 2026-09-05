import Link from "next/link";
import Image from "next/image";
import { Phone, MessageCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { telLink, waLink, site } from "@/lib/site";
import { pageHref, pageWindow } from "@/lib/pagination";
import type { ReactNode } from "react";

/**
 * Page links for a long list.
 *
 * Plain anchors, rendered on the server: paging a property list should survive
 * a crawler, a middle-click and a JavaScript failure, none of which a click
 * handler would. Renders nothing at all when there is only one page.
 */
export function Pagination({
  page,
  pages,
  basePath,
  anchor = "",
  label = "Listings",
}: {
  page: number;
  pages: number;
  basePath: string;
  anchor?: string;
  label?: string;
}) {
  if (pages <= 1) return null;
  const step =
    "inline-flex h-10 min-w-10 items-center justify-center rounded-[10px] px-3 text-ui transition-colors";

  return (
    <nav
      aria-label={`${label} pagination`}
      className="mt-12 flex flex-wrap items-center justify-center gap-2"
    >
      {page > 1 ? (
        <Link
          href={pageHref(basePath, page - 1, anchor)}
          rel="prev"
          aria-label="Previous page"
          className={`${step} border border-stone-300 text-ink hover:border-pine-400 hover:text-pine-700`}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
        </Link>
      ) : (
        <span
          aria-hidden
          className={`${step} border border-hairline text-stone-300`}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
        </span>
      )}

      {pageWindow(page, pages).map((entry, i) =>
        entry === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-muted">
            &hellip;
          </span>
        ) : entry === page ? (
          <span
            key={entry}
            aria-current="page"
            className={`${step} mono bg-pine-700 font-medium text-stone-50`}
          >
            {entry}
          </span>
        ) : (
          <Link
            key={entry}
            href={pageHref(basePath, entry, anchor)}
            className={`${step} mono border border-stone-300 text-ink hover:border-pine-400 hover:text-pine-700`}
          >
            {entry}
          </Link>
        ),
      )}

      {page < pages ? (
        <Link
          href={pageHref(basePath, page + 1, anchor)}
          rel="next"
          aria-label="Next page"
          className={`${step} border border-stone-300 text-ink hover:border-pine-400 hover:text-pine-700`}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
        </Link>
      ) : (
        <span
          aria-hidden
          className={`${step} border border-hairline text-stone-300`}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
        </span>
      )}
    </nav>
  );
}

/**
 * The Living wordmark. `tone="ivory"` uses the reversed logo for dark surfaces.
 *
 * Two files, one intrinsic size. The artwork is the ITR house-and-tree mark
 * beside the wordmark; the supplied master is a stacked lockup with the
 * tagline under it, which is a large-format logo — at the 32-36px a header bar
 * gives it, the wordmark inside a square lockup is about nine pixels tall and
 * unreadable. So the header and footer carry the horizontal lockup composed
 * from the same artwork, and the tagline stays with the full-size original.
 */
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
      alt="Living — by ITR"
      width={1473}
      height={380}
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
  variant?: "primary" | "accent" | "ghost" | "onMedia" | "quiet";
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
    // The ghost button, for use over photography or video.
    //
    // This has to be a variant rather than a className passed to `ghost`.
    // `text-ink` is a custom utility declared in globals.css's @layer
    // utilities, which Tailwind emits *after* its generated colour utilities,
    // so it outranks any text-* a caller hands in — callers were passing
    // text-stone-50 and silently getting dark teal on a dark image. The only
    // fix is a variant that never sets text-ink in the first place. The pane
    // behind it is not decoration either: a bare outline disappears over the
    // bright half of a photograph.
    onMedia:
      "border border-stone-50/60 bg-stone-950/45 text-stone-50 backdrop-blur-sm hover:border-stone-50 hover:bg-stone-950/65",
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
