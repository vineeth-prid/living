"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { services } from "@/lib/services";
import { Eyebrow } from "@/components/ui";
import { Reveal, Stagger, StaggerItem, LiftCard } from "@/components/motion";

const EASE = [0.22, 0.61, 0.36, 1] as const;

const HEADING = "Everything a home needs, in one considered place.";
const index = (i: number) => String(i + 1).padStart(2, "0");

/**
 * The desktop telling: the section pins, and scrolling walks through the
 * services one at a time.
 *
 * The scroll position is read as a motion value and only committed to React
 * state when the *index* changes — six renders across the whole section rather
 * than one per frame. Everything that moves continuously (the progress rail,
 * the panel crossfade) is transform and opacity, handed to the compositor.
 */
function PinnedServices() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = Math.min(
      services.length - 1,
      Math.max(0, Math.floor(p * services.length)),
    );
    setActive((current) => (current === next ? current : next));
  });

  return (
    // Tall enough to give each service its own stretch of scroll, and no
    // taller — a pinned section that outstays its welcome reads as a fault.
    <div ref={ref} style={{ height: `${services.length * 65 + 35}vh` }}>
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden">
        <div className="shell grid w-full items-center gap-14 lg:grid-cols-[0.85fr_1.15fr]">
          {/* The index. Every service is a real link here, so the whole
              section is reachable by keyboard without scrolling through it. */}
          <div>
            <Eyebrow>Our services</Eyebrow>
            <h2 className="mt-5 font-display text-ink display-lg">{HEADING}</h2>

            <div className="mt-10 flex gap-6">
              <div className="relative w-px shrink-0 bg-stone-200">
                <motion.div
                  className="absolute inset-x-0 top-0 h-full origin-top bg-clay-500"
                  style={{ scaleY: scrollYProgress }}
                />
              </div>
              <ol className="flex flex-col gap-3.5">
                {services.map((s, i) => (
                  <li key={s.key}>
                    <Link
                      href={s.href}
                      className="group flex items-baseline gap-4 outline-offset-4"
                    >
                      <span
                        className={`mono text-xs transition-colors duration-500 ${
                          i === active ? "text-clay-600" : "text-stone-400"
                        }`}
                      >
                        {index(i)}
                      </span>
                      <span
                        className={`text-ui transition-colors duration-500 group-hover:text-pine-700 ${
                          i === active ? "font-medium text-ink" : "text-muted"
                        }`}
                      >
                        {s.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* The stage. All six panels are stacked and absolutely placed, so
              swapping between them cannot shift the page by a pixel. */}
          <div className="relative min-h-[22rem]">
            {services.map((s, i) => (
              <motion.div
                key={s.key}
                // Inactive panels are inert: no focus, no screen reader, no
                // way to end up somewhere the scroll has not reached.
                inert={i !== active}
                className="absolute inset-0 flex flex-col justify-center rounded-media border border-hairline bg-page p-8 shadow-soft md:p-12"
                initial={false}
                animate={{
                  opacity: i === active ? 1 : 0,
                  y: i === active ? 0 : 24,
                }}
                transition={{ duration: 0.55, ease: EASE }}
              >
                <s.icon className="h-8 w-8 text-pine-600" strokeWidth={1.4} />
                <p className="eyebrow mt-6">
                  {index(i)} — {services.length} services
                </p>
                <h3 className="mt-3 font-display text-ink display-md">
                  {s.label}
                </h3>
                <p className="mt-4 max-w-md text-lg leading-relaxed text-body">
                  {s.blurb}
                </p>
                <span className="mt-7 inline-flex items-center gap-1.5 text-ui font-medium text-pine-700">
                  Learn more
                  <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The same six services, told as a list.
 *
 * Mobile and reduced-motion both land here. Pinning a section on a phone means
 * taking over the one gesture the reader has, and the sequence survives fine
 * as a list — the numbering carries what the scroll carried.
 */
function ListedServices() {
  return (
    <div className="section">
      <div className="shell">
        <Reveal className="max-w-2xl">
          <Eyebrow>Our services</Eyebrow>
          <h2 className="mt-5 font-display text-ink display-lg">{HEADING}</h2>
        </Reveal>

        <Stagger className="mt-10 grid gap-5 sm:grid-cols-2">
          {services.map((s, i) => (
            <StaggerItem key={s.key}>
              <LiftCard className="h-full">
                <Link
                  href={s.href}
                  className="group flex h-full flex-col rounded-card border border-hairline bg-page p-7 shadow-soft transition-shadow duration-300 hover:shadow-lift"
                >
                  <div className="flex items-center justify-between">
                    <s.icon className="h-7 w-7 text-pine-600" strokeWidth={1.5} />
                    <span className="mono text-xs text-stone-400">
                      {index(i)}
                    </span>
                  </div>
                  <h3 className="mt-5 font-display text-2xl text-ink">
                    {s.label}
                  </h3>
                  <p className="mt-3 flex-1 leading-relaxed text-body">
                    {s.blurb}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-ui font-medium text-pine-700">
                    Learn more
                    <ArrowUpRight
                      className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      strokeWidth={1.75}
                    />
                  </span>
                </Link>
              </LiftCard>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </div>
  );
}

export function Services() {
  const reduce = useReducedMotion();
  return (
    <section id="services" className="bg-surface">
      <div className={reduce ? undefined : "lg:hidden"}>
        <ListedServices />
      </div>
      {!reduce && (
        <div className="hidden lg:block">
          <PinnedServices />
        </div>
      )}
    </section>
  );
}
