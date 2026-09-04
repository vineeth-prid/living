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
const LAST = index(HOME_SERVICES.length - 1);

/** The picture for the service currently on stage. */
function ServiceImages({ active, aspect }: { active: number; aspect: string }) {
  return (
    <div
      className={`relative ${aspect} overflow-hidden rounded-media shadow-lift`}
    >
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
      {/* Keeps the pane below legible where it laps over the photograph. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-stone-950/45 via-transparent to-transparent" />
    </div>
  );
}

/**
 * The words for the service on stage, on a pane that laps over the picture.
 *
 * All four are stacked and absolutely placed, so swapping between them cannot
 * shift the page by a pixel. Inactive panes are inert: no focus, no screen
 * reader, no way to end up somewhere the scroll has not reached.
 */
function ServicePanes({ active, className }: { active: number; className?: string }) {
  return (
    <div className={`relative rounded-card glass shadow-float ${className ?? ""}`}>
      {HOME_SERVICES.map((s, i) => (
        <motion.div
          key={s.key}
          inert={i !== active}
          className="absolute inset-0 flex flex-col justify-center p-6 md:p-9"
          initial={false}
          animate={{ opacity: i === active ? 1 : 0, y: i === active ? 0 : 18 }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          <div className="flex items-center gap-3">
            <s.icon className="h-6 w-6 text-pine-600" strokeWidth={1.5} />
            <span className="mono text-xs text-clay-700">{index(i)}</span>
          </div>
          <h3 className="mt-3 font-display text-2xl text-ink md:mt-4 md:display-md">
            {s.label}
          </h3>
          <p className="mt-2 max-w-md leading-relaxed text-body md:mt-3">
            {s.blurb}
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-ui font-medium text-pine-700 md:mt-5">
            Learn more
            <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
          </span>
        </motion.div>
      ))}
    </div>
  );
}

/** The figure that says where you are. */
function Counter({ active, size }: { active: number; size: "sm" | "lg" }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <motion.span
        key={active}
        className={`mono leading-none text-clay-600 ${
          size === "lg" ? "text-5xl" : "text-3xl"
        }`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        {index(active)}
      </motion.span>
      <span
        className={`mono leading-none text-stone-400 ${
          size === "lg" ? "text-lg" : "text-sm"
        }`}
      >
        / {LAST}
      </span>
    </div>
  );
}

/**
 * The scroll-driven telling, at every width.
 *
 * One scroll container and one active index; only the staging differs. On a
 * wide screen the index sits in a column beside the stage. On a phone that
 * column has nowhere to go, so the heading scrolls past above the pinned run
 * and the pinned panel holds only the stage — a progress bar and a row of
 * names replace the vertical rail. The alternative, forcing the desktop
 * two-column layout onto a phone, is what makes pinned sections unusable.
 *
 * The scroll position is read as a motion value and only committed to React
 * state when the *index* changes — four renders across the whole section rather
 * than one per frame. Everything continuous (the rails, the crossfades) is
 * transform and opacity, handed to the compositor.
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
    <>
      {/* Phone only: the heading scrolls past normally, so the pinned panel
          below has to carry the stage and nothing else. */}
      <div className="shell pt-14 lg:hidden">
        <Eyebrow>Our services</Eyebrow>
        <h2 className="mt-4 font-display text-ink display-md">{HEADING}</h2>
      </div>

      {/* Tall enough to give each service its own stretch of scroll, and no
          taller — a pinned section that outstays its welcome reads as a fault. */}
      <div ref={ref} style={{ height: `${HOME_SERVICES.length * 65 + 35}vh` }}>
        <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden pt-16 lg:pt-0">
          <div className="shell w-full">
            {/* ---------- wide ---------- */}
            <div className="hidden items-center gap-14 lg:grid lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <Eyebrow>Our services</Eyebrow>
                <h2 className="mt-5 font-display text-ink display-lg">
                  {HEADING}
                </h2>

                <div className="mt-9">
                  <Counter active={active} size="lg" />
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
                          {/* A rule that grows into the active row — the
                              smallest thing that says "this one". */}
                          <motion.span
                            aria-hidden
                            className="h-px bg-clay-500"
                            initial={false}
                            animate={{
                              width: i === active ? 26 : 10,
                              opacity: i === active ? 1 : 0.3,
                            }}
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

              <div>
                <ServiceImages active={active} aspect="aspect-[4/3]" />
                <ServicePanes
                  active={active}
                  className="-mt-20 mx-5 min-h-[13rem] md:mx-8"
                />
              </div>
            </div>

            {/* ---------- phone ---------- */}
            <div className="lg:hidden">
              <div className="flex items-center gap-4">
                <Counter active={active} size="sm" />
                <div className="relative h-px flex-1 bg-stone-200">
                  <motion.div
                    className="absolute inset-y-0 left-0 w-full origin-left bg-clay-500"
                    style={{ scaleX: scrollYProgress }}
                  />
                </div>
              </div>

              <div className="mt-5">
                <ServiceImages active={active} aspect="aspect-[16/10]" />
                <ServicePanes
                  active={active}
                  className="-mt-14 mx-4 min-h-[17rem]"
                />
              </div>

              {/* Every service stays one tap away, so the pinned run is not the
                  only route to the other three. */}
              <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5">
                {HOME_SERVICES.map((s, i) => (
                  <li key={s.key}>
                    <Link
                      href={s.href}
                      className={`text-sm transition-colors duration-500 ${
                        i === active ? "font-medium text-ink" : "text-muted"
                      }`}
                    >
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The same four services, told as a list.
 *
 * Where reduced motion lands. Nothing moves, nothing is pinned, and the
 * numbering carries what the scroll carried.
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
      {reduce ? <ListedServices /> : <PinnedServices />}
    </section>
  );
}
