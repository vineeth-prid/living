"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { nav } from "@/lib/site";
import { Logo, Button } from "./ui";

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  // Over the dark home hero (top, not scrolled) the bar is transparent and
  // its contents are ivory; everywhere else contents are ink.
  const isHome = pathname === "/";
  const light = isHome && !scrolled && !open;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ease-[var(--ease-calm)] ${
        scrolled || open
          ? "border-b border-stone-200/60 bg-gradient-to-b from-stone-50/90 to-stone-50/60 py-3 shadow-soft backdrop-blur-xl"
          : "border-b border-transparent bg-transparent py-5"
      }`}
    >
      <nav className="shell flex items-center justify-between">
        <Logo tone={light ? "ivory" : "color"} priority className="h-8 md:h-9" />

        <div className="hidden items-center gap-8 md:flex">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-[15px] transition-colors ${
                  light
                    ? "text-stone-100 hover:text-white"
                    : active
                      ? "text-pine-700"
                      : "text-body hover:text-pine-700"
                }`}
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

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
            className="overflow-hidden border-t border-stone-200/60 md:hidden"
          >
            <div className="shell flex flex-col gap-1 py-4">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-[12px] px-3 py-3 text-lg text-ink hover:bg-stone-100"
                >
                  {item.label}
                </Link>
              ))}
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
