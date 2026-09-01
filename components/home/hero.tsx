"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { img } from "@/lib/images";
import { Button } from "@/components/ui";

const EASE = [0.22, 0.61, 0.36, 1] as const;

/**
 * The hero film.
 *
 * Ships with licensed placeholder footage in public/videos — the same
 * arrangement as public/images, and public/videos/SOURCE.txt records where it
 * came from and on what terms. When the real Living shoot lands, put it in the
 * bucket and point NEXT_PUBLIC_HERO_VIDEO_URL at it; nothing here changes, and
 * the app server stops serving a megabyte per visit.
 *
 * The photograph underneath is poster, fallback and the entire hero for anyone
 * who asked for less motion — so a missing file, a 404, a stalled load or a
 * refused autoplay all look like the site did before there was a video.
 */
const HERO_VIDEO =
  process.env.NEXT_PUBLIC_HERO_VIDEO_URL || "/videos/hero-living.mp4";

export function Hero() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  // The still is the floor, not the placeholder: it renders first and stays
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

  const words = ["Life", "happens", "here."];
  // Reduced motion gets the photograph. A looping film is exactly the kind of
  // continuous movement the preference is asking us not to play.
  const showVideo = Boolean(HERO_VIDEO) && !reduce;

  return (
    <section
      ref={ref}
      className="scrim-t scrim-b relative flex min-h-[100svh] items-end overflow-hidden"
    >
      {/* Background — slow zoom-in on load, parallax on scroll */}
      <motion.div
        className="absolute inset-0 -z-0"
        style={reduce ? undefined : { y: imgY, scale: imgScale }}
      >
        <motion.img
          src={img.heroArch}
          alt="A calm, sunlit contemporary home in Kochi at golden hour"
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
            poster={img.heroArch}
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

      {/* Content */}
      <motion.div
        className="relative z-10 w-full pb-20 md:pb-28"
        style={reduce ? undefined : { y: contentY, opacity: contentOpacity }}
      >
        <div className="shell">
          <motion.p
            className="eyebrow text-clay-200"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 1.0 }}
          >
            Living · by ITR Group
          </motion.p>

          <h1 className="mt-5 font-display text-stone-50 display-hero">
            <span className="sr-only">Life happens here.</span>
            <span aria-hidden className="flex flex-wrap gap-x-[0.28em]">
              {words.map((w, i) => (
                <span key={w} className="overflow-hidden py-[0.02em]">
                  <motion.span
                    className="inline-block"
                    initial={reduce ? false : { y: "110%" }}
                    animate={{ y: 0 }}
                    transition={{
                      duration: 0.95,
                      ease: EASE,
                      delay: 1.15 + i * 0.16,
                    }}
                  >
                    {w === "here." ? (
                      <>
                        here<span className="text-clay-400">.</span>
                      </>
                    ) : (
                      w
                    )}
                  </motion.span>
                </span>
              ))}
            </span>
          </h1>

          <motion.p
            className="mt-7 max-w-xl text-lg leading-relaxed text-stone-200"
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 1.7 }}
          >
            Most of what we do begins after the keys change hands. Property,
            NRI care and community management across Kochi and Kerala — one
            team, fifteen years in.
          </motion.p>

          <motion.div
            className="mt-9 flex flex-wrap gap-4"
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 1.9 }}
          >
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
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll cue */}
      <motion.div
        className="absolute inset-x-0 bottom-7 z-10 flex justify-center"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 2.4 }}
      >
        <motion.div
          className="flex flex-col items-center gap-2 text-stone-300"
          animate={reduce ? undefined : { y: [0, 8, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="eyebrow text-stone-300">Scroll</span>
          <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
        </motion.div>
      </motion.div>
    </section>
  );
}
