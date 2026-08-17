"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";

// One-open-at-a-time FAQ, each row its own 24px card as in the template.
// The answer text is also mirrored in the page's FAQ JSON-LD.
export function Faq({ items }: { items: readonly { q: string; a: string }[] }) {
  const [open, setOpen] = useState<string | null>(items[0]?.q ?? null);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const on = open === item.q;
        return (
          <div
            key={item.q}
            className={`overflow-hidden rounded-[24px] border transition-colors duration-300 ${
              on
                ? "border-pine-200 bg-surface shadow-soft"
                : "border-hairline bg-surface"
            }`}
          >
            <h3>
              <button
                type="button"
                onClick={() => setOpen(on ? null : item.q)}
                aria-expanded={on}
                className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left md:px-7"
              >
                <span className="font-display text-lg text-ink md:text-xl">
                  {item.q}
                </span>
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-300 ease-[var(--ease-calm)] ${
                    on
                      ? "rotate-45 bg-pine-700 text-stone-50"
                      : "bg-pine-50 text-pine-700"
                  }`}
                >
                  <Plus className="h-4 w-4" strokeWidth={1.8} />
                </span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {on && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="max-w-2xl px-6 pb-6 text-[15px] leading-relaxed text-muted md:px-7">
                    {item.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
