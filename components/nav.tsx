"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, ChevronDown } from "lucide-react";
import { nav } from "@/lib/site";
import { serviceGroups, serviceByKey } from "@/lib/services";
import { Logo, Button } from "./ui";

const EASE = [0.22, 0.61, 0.36, 1] as const;

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [mobileServicesOpen, setMobileServicesOpen] = useState(false);
  const pathname = usePathname();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close both menus on navigation. Reading pathname during render instead of
  // in an effect avoids a cascading re-render.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
    setServicesOpen(false);
    setMobileServicesOpen(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setServicesOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Small grace period so the pointer can cross the gap to the panel.
  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setServicesOpen(true);
  };
  const closeSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setServicesOpen(false), 140);
  };

  // Over the dark home hero (top, not scrolled) the bar is transparent and
  // its contents are ivory; everywhere else contents are ink.
  const isHome = pathname === "/";
  const light = isHome && !scrolled && !open && !servicesOpen;

  const linkTone = (active: boolean) =>
    light
      ? "text-stone-100 hover:text-white"
      : active
        ? "text-pine-700"
        : "text-body hover:text-pine-700";

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ease-[var(--ease-calm)] ${
        scrolled || open || servicesOpen
          ? "border-b border-stone-200/60 bg-gradient-to-b from-stone-50/90 to-stone-50/60 py-3 shadow-soft backdrop-blur-xl"
          : "border-b border-transparent bg-transparent py-5"
      }`}
    >
      <nav className="shell flex items-center justify-between">
        <Logo tone={light ? "ivory" : "color"} preload className="h-8 md:h-9" />

        <div className="hidden items-center gap-8 md:flex">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            if (item.href === "/services") {
              return (
                <div
                  key={item.href}
                  className="relative"
                  onMouseEnter={openNow}
                  onMouseLeave={closeSoon}
                >
                  <Link
                    href="/services"
                    className={`flex items-center gap-1 text-[15px] transition-colors ${linkTone(active)}`}
                    aria-expanded={servicesOpen}
                    aria-haspopup="true"
                    onFocus={openNow}
                  >
                    {item.label}
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-300 ${
                        servicesOpen ? "rotate-180" : ""
                      }`}
                      strokeWidth={1.75}
                    />
                  </Link>
                  {active && !light && (
                    <motion.span
                      layoutId="nav-underline"
                      className="mx-auto mt-1 block h-px bg-clay-500"
                    />
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-[15px] transition-colors ${linkTone(active)}`}
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

      {/* Desktop services dropdown — same hairline/surface/shadow language as
          the cards elsewhere on the site. */}
      <AnimatePresence>
        {servicesOpen && (
          <motion.div
            className="absolute inset-x-0 top-full hidden md:block"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: EASE }}
            onMouseEnter={openNow}
            onMouseLeave={closeSoon}
          >
            <div className="shell pt-3">
              <div className="rounded-card border border-hairline bg-surface p-8 shadow-lift">
                <div className="grid gap-8 md:grid-cols-3">
                  {serviceGroups.map((group) => (
                    <div key={group.label}>
                      <p className="eyebrow">{group.label}</p>
                      <ul className="mt-4 space-y-4">
                        {group.keys.map((key) => {
                          const s = serviceByKey(key);
                          return (
                            <li key={s.key}>
                              <Link
                                href={s.href}
                                className="group block"
                                onClick={() => setServicesOpen(false)}
                              >
                                <span className="flex items-center gap-2 font-medium text-ink transition-colors group-hover:text-pine-700">
                                  <s.icon
                                    className="h-4 w-4 text-pine-600"
                                    strokeWidth={1.6}
                                  />
                                  {s.label}
                                </span>
                                <span className="mt-1 block text-sm leading-relaxed text-muted">
                                  {s.blurb}
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="mt-7 border-t border-hairline pt-5">
                  <Link
                    href="/services"
                    className="text-[15px] font-medium text-pine-700 hover:text-pine-800"
                    onClick={() => setServicesOpen(false)}
                  >
                    View all services →
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="max-h-[calc(100svh-5rem)] overflow-y-auto border-t border-stone-200/60 md:hidden"
          >
            <div className="shell flex flex-col gap-1 py-4">
              {nav.map((item) =>
                item.href === "/services" ? (
                  <div key={item.href}>
                    <button
                      className="flex w-full items-center justify-between rounded-[12px] px-3 py-3 text-left text-lg text-ink hover:bg-stone-100"
                      onClick={() => setMobileServicesOpen((v) => !v)}
                      aria-expanded={mobileServicesOpen}
                    >
                      {item.label}
                      <ChevronDown
                        className={`h-5 w-5 transition-transform duration-300 ${
                          mobileServicesOpen ? "rotate-180" : ""
                        }`}
                        strokeWidth={1.6}
                      />
                    </button>
                    <AnimatePresence>
                      {mobileServicesOpen && (
                        <motion.ul
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.26, ease: EASE }}
                          className="overflow-hidden"
                        >
                          {serviceGroups.flatMap((g) => g.keys).map((key) => {
                            const s = serviceByKey(key);
                            return (
                              <li key={s.key}>
                                <Link
                                  href={s.href}
                                  className="flex items-center gap-2.5 rounded-[12px] py-2.5 pl-6 pr-3 text-body hover:bg-stone-100"
                                >
                                  <s.icon
                                    className="h-4 w-4 shrink-0 text-pine-600"
                                    strokeWidth={1.6}
                                  />
                                  {s.label}
                                </Link>
                              </li>
                            );
                          })}
                          <li>
                            <Link
                              href="/services"
                              className="block rounded-[12px] py-2.5 pl-6 pr-3 font-medium text-pine-700 hover:bg-stone-100"
                            >
                              View all services →
                            </Link>
                          </li>
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-[12px] px-3 py-3 text-lg text-ink hover:bg-stone-100"
                  >
                    {item.label}
                  </Link>
                ),
              )}
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
