"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Menu, X } from "lucide-react";
import { nav } from "@/lib/site";
import { Logo, Button } from "./ui";

const EASE = [0.22, 0.61, 0.36, 1] as const;

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  /** Which desktop menu is showing, by href. Only ever one. */
  const [menu, setMenu] = useState<string | null>(null);
  /** Which mobile section is expanded. */
  const [expanded, setExpanded] = useState<string | null>(null);
  const pathname = usePathname();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setMenu(null);
    setExpanded(null);
  }, [pathname]);

  // Escape closes the menu wherever focus happens to be.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A small grace period on leaving: the pointer has to cross a gap between
  // the trigger and the panel, and closing instantly makes that feel broken.
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMenu(null), 140);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  // Over a dark hero (top, not scrolled) the bar is transparent and its
  // contents are ivory; everywhere else contents are ink. Once scrolled — or
  // once a dropdown opens — the bar carries its own light background, so ink
  // is legible over whatever is behind it.
  const darkHero = pathname === "/" || pathname === "/platform";
  const light = darkHero && !scrolled && !open && !menu;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ease-[var(--ease-calm)] ${
        scrolled || open || menu
          ? "border-b border-stone-200/60 bg-gradient-to-b from-stone-50/90 to-stone-50/60 py-3 shadow-soft backdrop-blur-xl"
          : "border-b border-transparent bg-transparent py-5"
      }`}
    >
      <nav className="shell flex items-center justify-between">
        <Logo tone={light ? "ivory" : "color"} priority className="h-8 md:h-9" />

        <div className="hidden items-center gap-8 md:flex">
          {nav.map((item) => {
            const children = "children" in item ? item.children : undefined;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href.split("#")[0]);

            const linkTone = light
              ? "text-stone-100 hover:text-white"
              : active
                ? "text-pine-700"
                : "text-body hover:text-pine-700";

            if (!children) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-ui transition-colors ${linkTone}`}
                >
                  {item.label}
                  {active && !light && (
                    <motion.span
                      layoutId="nav-underline"
                      className="mx-auto mt-1 block h-px bg-clay-500"
                    />
                  )}
                </Link>
              );
            }

            const showing = menu === item.href;

            return (
              <div
                key={item.href}
                className="relative"
                onMouseEnter={() => {
                  cancelClose();
                  setMenu(item.href);
                }}
                onMouseLeave={scheduleClose}
              >
                {/* Still a link: the parent page is real, and a menu you can
                    only hover strands touch and keyboard users. */}
                <Link
                  href={item.href}
                  aria-expanded={showing}
                  aria-haspopup="true"
                  onFocus={() => setMenu(item.href)}
                  onClick={() => setMenu(null)}
                  className={`flex items-center gap-1 text-ui transition-colors ${linkTone}`}
                >
                  {item.label}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      showing ? "rotate-180" : ""
                    }`}
                    strokeWidth={2}
                  />
                </Link>
                {active && !light && (
                  <motion.span
                    layoutId="nav-underline"
                    className="mx-auto mt-1 block h-px bg-clay-500"
                  />
                )}

                <AnimatePresence>
                  {showing && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.18, ease: EASE }}
                      onMouseEnter={cancelClose}
                      onMouseLeave={scheduleClose}
                      // Sits directly under the trigger with no gap, so the
                      // pointer never crosses dead space to reach it.
                      className="absolute left-1/2 top-full w-[19rem] -translate-x-1/2 pt-4"
                    >
                      <div className="overflow-hidden rounded-card border border-hairline bg-surface p-2 shadow-lift">
                        {children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setMenu(null)}
                            className="block rounded-[10px] px-3 py-3 transition-colors hover:bg-stone-100"
                          >
                            <span className="block text-ui font-medium text-ink">
                              {child.label}
                            </span>
                            <span className="mt-0.5 block text-sm leading-snug text-muted">
                              {child.blurb}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        <div className="hidden md:block">
          <Button
            href="/contact"
            variant={light ? "ghost" : "primary"}
            className={
              light
                ? "border-stone-50/50 text-stone-50 hover:border-stone-50 hover:text-stone-50"
                : ""
            }
          >
            Talk to us
          </Button>
        </div>

        <button
          className={`flex h-11 w-11 items-center justify-center md:hidden ${
            light ? "text-stone-50" : "text-ink"
          }`}
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden border-t border-stone-200/60 md:hidden"
          >
            <div className="shell flex flex-col gap-1 py-4">
              {nav.map((item) => {
                const children = "children" in item ? item.children : undefined;

                if (!children) {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-[12px] px-3 py-3 text-lg text-ink hover:bg-stone-100"
                    >
                      {item.label}
                    </Link>
                  );
                }

                const isExpanded = expanded === item.href;
                return (
                  <div key={item.href}>
                    <div className="flex items-center">
                      <Link
                        href={item.href}
                        className="flex-1 rounded-[12px] px-3 py-3 text-lg text-ink hover:bg-stone-100"
                      >
                        {item.label}
                      </Link>
                      {/* A separate control, so tapping the label still opens
                          the page rather than only unfolding a list. */}
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded(isExpanded ? null : item.href)
                        }
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Hide" : "Show"} ${item.label}`}
                        className="flex h-11 w-11 items-center justify-center rounded-[12px] text-ink hover:bg-stone-100"
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform duration-200 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          strokeWidth={2}
                        />
                      </button>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.24, ease: EASE }}
                          className="overflow-hidden"
                        >
                          <div className="ml-3 flex flex-col border-l border-hairline pl-3">
                            {children.map((child) => (
                              <Link
                                key={child.href}
                                href={child.href}
                                className="rounded-[12px] px-3 py-2.5 text-body hover:bg-stone-100"
                              >
                                {child.label}
                              </Link>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              <div className="mt-2 px-1">
                <Button href="/contact" variant="primary" className="w-full">
                  Talk to us
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
