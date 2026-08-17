"use client";

import { useEffect, useState } from "react";

// The template's floating glass pill rail: centred, blurred, translucent, and
// it marks the section currently in view.
export function SectionNav({
  items,
}: {
  items: readonly { id: string; label: string }[];
}) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const targets = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (!targets.length) return;

    // A band across the upper-middle of the viewport: whichever section is
    // inside it wins, so the rail changes at a natural reading point rather
    // than the instant a section's top edge clears the header.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0 },
    );
    for (const t of targets) observer.observe(t);
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav
      aria-label="On this page"
      className="sticky top-[68px] z-40 mx-auto -mt-7 w-max max-w-[calc(100vw-2rem)] md:top-[80px]"
    >
      <div className="flex gap-1 overflow-x-auto rounded-full border border-stone-50/15 bg-stone-950/40 p-1.5 backdrop-blur-[33px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const on = active === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={on ? "true" : undefined}
              className={`shrink-0 rounded-full px-4 py-2 text-sm transition-colors duration-300 ${
                on
                  ? "bg-stone-50 text-pine-950"
                  : "text-stone-300 hover:text-stone-50"
              }`}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
