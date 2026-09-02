"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import { Button } from "@/components/ui";

const EASE = [0.22, 0.61, 0.36, 1] as const;

/**
 * The hero film, and the frame the browser paints before it plays.
 *
 * The poster is frame 0 of the video itself, so the still and the first frame
 * are the same picture and the fade between them cannot flicker. Both live in
 * public/videos; SOURCE.txt beside them records where the footage came from,
 * how it was cut, and the fact that its licence is still unresolved.
 *
 * NEXT_PUBLIC_HERO_VIDEO_URL wins when set — that is how the real Living shoot
 * arrives from the bucket later, with no code change and a megabyte a visit off
 * the app server.
 */
const HERO_VIDEO =
  process.env.NEXT_PUBLIC_HERO_VIDEO_URL || "/videos/hero-living.mp4";
const HERO_POSTER = "/videos/hero-poster.jpg";

export function Hero() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  // The still is the floor, not a placeholder: it renders first and stays
  // rendered, and the film fades over it only once it is genuinely playing.
  const [playing, setPlaying] = useState(false);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  // Slow parallax + fade of the whole hero as you scroll past it.
  const imgY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  // Reduced motion gets the still. A looping film is exactly the kind of
  // continuous movement the preference is asking us not to play.
  const showVideo = !reduce;

  return (
    // 95svh, not 100: the slice of the next section showing under the fold is
    // what tells the reader to scroll, which is why there is no arrow any more.
    // min-h keeps it sane on a short laptop in landscape.
    <section
      ref={ref}
      className="scrim-t scrim-b relative flex h-[95svh] min-h-[600px] items-end overflow-hidden"
    >
      {/* Background — slow zoom-in on load, parallax on scroll */}
      <motion.div
        className="absolute inset-0 -z-0"
        style={reduce ? undefined : { y: imgY, scale: imgScale }}
      >
        <motion.img
          src={HERO_POSTER}
          alt="A contemporary hillside home at dusk, lit from within, above a still pool"
          className="h-[112%] w-full object-cover"
          initial={reduce ? false : { scale: 1.18 }}
          animate={{ scale: 1 }}
          transition={{ duration: 2.4, ease: EASE }}
          fetchPriority="high"
        />

        {showVideo && (
          <video
            // Decorative: the still underneath carries the same alt text, and
            // the h1 below carries the meaning. Muted and loud about it —
            // autoplay is only permitted for silent video, and React does not
            // reliably emit the attribute, so the ref sets the property too.
            aria-hidden
            tabIndex={-1}
            src={HERO_VIDEO}
            poster={HERO_POSTER}
            autoPlay
            muted
            loop
            playsInline
            // The still is already painted and already the fallback, so the
            // film never needs to hold up first render.
            preload="metadata"
            ref={(el) => {
              if (el) el.muted = true;
            }}
            onPlaying={() => setPlaying(true)}
            onError={() => setPlaying(false)}
            className={`absolute inset-0 h-[112%] w-full object-cover transition-opacity duration-1000 ease-[var(--ease-calm)] ${
              playing ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
      </motion.div>

      {/* Curtain — ivory panel lifts away to reveal the scene */}
      {!reduce && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-20 bg-stone-50"
          initial={{ y: 0 }}
          animate={{ y: "-100%" }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.15 }}
        />
      )}

      {/* Content sits on the floor of the frame — a masthead, not a centred
          title card. Everything is bottom-aligned and close to the edge. */}
      <motion.div
        className="relative z-10 w-full pb-10 md:pb-12"
        style={reduce ? undefined : { y: contentY, opacity: contentOpacity }}
      >
        <div className="shell">
          {/* The wordmark is the headline. Nothing else is at this size. */}
          <h1 className="font-display text-stone-50 display-wordmark">
            <span className="inline-block overflow-hidden py-[0.02em] align-bottom">
              <motion.span
                className="inline-block"
                initial={reduce ? false : { y: "110%" }}
                animate={{ y: 0 }}
                transition={{ duration: 0.95, ease: EASE, delay: 1.0 }}
              >
                Living<span className="text-clay-400">.</span>
              </motion.span>
            </span>
          </h1>

          {/* One narrow block under the end of the wordmark, the way the
              reference hangs its paragraph off the right. The buttons live
              inside it so the bottom edge stays a single tidy column. */}
          <motion.div
            className="mt-4 flex justify-start md:mt-5 md:justify-end"
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 1.45 }}
          >
            <div className="max-w-[29rem]">
              <p className="eyebrow text-clay-200">
                Property, care and community
              </p>
              {/* Two sentences and no more. The first is a specific claim about
                  how the business actually runs; the second is category, who,
                  where and how long, in one breath. This is also where the
                  homepage says Kochi and Kerala, now that the h1 is a name. */}
              <p className="mt-3 leading-relaxed text-stone-200">
                The people who hand over the keys are the ones still answering
                the phone five years later. A property and living company for
                buyers, sellers and owners across Kochi, Ernakulam and Kerala —
                the property arm of ITR Group, fifteen years in.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button href="/services" variant="accent">
                  Our services
                </Button>
                <Button
                  href="/platform"
                  variant="ghost"
                  className="border-stone-50/40 text-stone-50 hover:border-stone-50 hover:text-stone-50"
                >
                  See the platform
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
