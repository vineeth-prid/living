"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { serviceByKey } from "@/lib/services";
import { img } from "@/lib/images";
import { Eyebrow } from "@/components/ui";
import { Reveal, Stagger, StaggerItem, LiftCard } from "@/components/motion";

const EASE = [0.22, 0.61, 0.36, 1] as const;

const HEADING = "Everything a home needs, in one considered place.";

/**
 * What the homepage shows, and the picture that goes with each one.
 *
 * Four, not the full six. Property management and community & facility
 * management say the same thing to a first-time reader — we look after the
 * building after you move in — and reading it twice on the way down the page
 * made the list feel padded rather than complete. Both keep their place in the
 * nav and on /services, where there is room to draw the distinction properly,
 * so nothing is lost from the taxonomy: this is a homepage edit, not a change
 * to what Living sells.
 *
 * Imagery is a presentation concern and lives here rather than in lib/services,
 * which the nav and the services hub also read.
 */
const HOME_SERVICES = [
  {
    ...serviceByKey("buying"),
    image: img.buying,
    alt: "A contemporary villa with a pool at midday",
  },
  {
    ...serviceByKey("selling"),
    image: img.selling,
    alt: "A bright, styled interior prepared for viewings",
  },
  {
    ...serviceByKey("nri"),
    image: img.nri,
    alt: "A quiet Kerala home, looked after while its owners are abroad",
  },
  {
    ...serviceByKey("platform"),
    image: img.city,
    alt: "A shared residents' lounge in daylight",
  },
];

const index = (i: number) => String(i + 1).padStart(2, "0");

/** The picture for the service currently on stage. */
function ServiceImages({ active }: { active: number }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-media shadow-lift">
      {HOME_SERVICES.map((s, i) => (
        <motion.div
          key={s.key}
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: i === active ? 1 : 0 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <Image
            src={s.image}
            alt={s.alt}
            fill
            sizes="(max-width: 1024px) 100vw, 55vw"
            className="object-cover"
          />
        </motion.div>
      ))}
      {/* Keeps the card below legible where it laps over the photograph. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-stone-950/45 via-transparent to-transparent" />
    </div>
  );
}

/**
 * The desktop telling: the section pins, and scrolling walks through the
 * services one at a time.
 *
 * The scroll position is read as a motion value and only committed to React
 * state when the *index* changes — four renders across the whole section rather
 * than one per frame. Everything that moves continuously (the progress rail,
 * the crossfades) is transform and opacity, handed to the compositor.
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
      HOME_SERVICES.length - 1,
      Math.max(0, Math.floor(p * HOME_SERVICES.length)),
    );
    setActive((current) => (current === next ? current : next));
  });

  return (
    // Tall enough to give each service its own stretch of scroll, and no
    // taller — a pinned section that outstays its welcome reads as a fault.
    <div ref={ref} style={{ height: `${HOME_SERVICES.length * 65 + 35}vh` }}>
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden">
        <div className="shell grid w-full items-center gap-14 lg:grid-cols-[0.8fr_1.2fr]">
          {/* The index. Every service is a real link here, so the whole
              section is reachable by keyboard without scrolling through it. */}
          <div>
            <Eyebrow>Our services</Eyebrow>
            <h2 className="mt-5 font-display text-ink display-lg">{HEADING}</h2>

            {/* Where you are, as a figure. Cheap to read at a glance and it
                gives the eye something that visibly changes on scroll. */}
            <div className="mt-9 flex items-baseline gap-1.5">
              <motion.span
                key={active}
                className="mono text-5xl leading-none text-clay-600"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                {index(active)}
              </motion.span>
              <span className="mono text-lg leading-none text-stone-400">
                / {index(HOME_SERVICES.length - 1)}
              </span>
            </div>

            <div className="mt-7 flex gap-6">
              <div className="relative w-px shrink-0 bg-stone-200">
                <motion.div
                  className="absolute inset-x-0 top-0 h-full origin-top bg-clay-500"
                  style={{ scaleY: scrollYProgress }}
                />
              </div>
              <ol className="flex flex-col gap-3.5">
                {HOME_SERVICES.map((s, i) => (
                  <li key={s.key}>
                    <Link
                      href={s.href}
                      className="group flex items-center gap-3 outline-offset-4"
                    >
                      {/* A rule that grows into the active row — the smallest
                          thing that says "this one" without a box. */}
                      <motion.span
                        aria-hidden
                        className="h-px bg-clay-500"
                        initial={false}
                        animate={{ width: i === active ? 26 : 10, opacity: i === active ? 1 : 0.3 }}
                        transition={{ duration: 0.45, ease: EASE }}
                      />
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

          {/* The stage: a photograph that changes, with the words on a pane
              lapping over its lower edge. All four panes are stacked and
              absolutely placed, so swapping between them cannot shift the
              page by a pixel. */}
          <div>
            <ServiceImages active={active} />

            <div className="relative -mt-20 mx-5 min-h-[13rem] rounded-card glass shadow-float md:mx-8">
              {HOME_SERVICES.map((s, i) => (
                <motion.div
                  key={s.key}
                  // Inactive panes are inert: no focus, no screen reader, no
                  // way to end up somewhere the scroll has not reached.
                  inert={i !== active}
                  className="absolute inset-0 flex flex-col justify-center p-7 md:p-9"
                  initial={false}
                  animate={{
                    opacity: i === active ? 1 : 0,
                    y: i === active ? 0 : 18,
                  }}
                  transition={{ duration: 0.55, ease: EASE }}
                >
                  <div className="flex items-center gap-3">
                    <s.icon className="h-6 w-6 text-pine-600" strokeWidth={1.5} />
                    <span className="mono text-xs text-clay-700">
                      {index(i)}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-ink display-md">
                    {s.label}
                  </h3>
                  <p className="mt-3 max-w-md leading-relaxed text-body">
                    {s.blurb}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-ui font-medium text-pine-700">
                    Learn more
                    <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The same four services, told as a list.
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
          {HOME_SERVICES.map((s, i) => (
            <StaggerItem key={s.key}>
              <LiftCard className="h-full">
                <Link
                  href={s.href}
                  className="group flex h-full flex-col overflow-hidden rounded-card border border-hairline bg-page shadow-soft transition-shadow duration-300 hover:shadow-lift"
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <Image
                      src={s.image}
                      alt={s.alt}
                      fill
                      sizes="(max-width: 640px) 100vw, 50vw"
                      className="object-cover transition-transform duration-[900ms] ease-[var(--ease-calm)] group-hover:scale-105"
                    />
                    <span className="absolute left-4 top-4 rounded-full bg-stone-50/90 px-2.5 py-1 mono text-xs text-pine-800 backdrop-blur">
                      {index(i)}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-7">
                    <s.icon className="h-6 w-6 text-pine-600" strokeWidth={1.5} />
                    <h3 className="mt-4 font-display text-2xl text-ink">
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
                  </div>
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
