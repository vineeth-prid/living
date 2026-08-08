"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";
import { ArrowDown } from "lucide-react";
import { img } from "@/lib/images";
import { Button } from "@/components/ui";

const EASE = [0.22, 0.61, 0.36, 1] as const;

export function Hero() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  // Slow parallax + fade of the whole hero as you scroll past it.
  const imgY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  const words = ["Everything", "your", "home", "and", "community", "need."];

  return (
    <section
      ref={ref}
      className="scrim-t scrim-b relative flex min-h-[100svh] items-end overflow-hidden"
    >
      {/* Background image — slow zoom-in on load, parallax on scroll */}
      <motion.div
        className="absolute inset-0 -z-0"
        style={reduce ? undefined : { y: imgY, scale: imgScale }}
      >
        {/* The load-zoom moved onto a wrapper so next/image owns the <img>
            and can preload it as the LCP element. Same box, same 112%. */}
        <motion.div
          className="relative h-[112%] w-full"
          initial={reduce ? false : { scale: 1.18 }}
          animate={{ scale: 1 }}
          transition={{ duration: 2.4, ease: EASE }}
        >
          <Image
            src={img.heroArch}
            alt="A calm, sunlit contemporary home in Kochi at golden hour"
            fill
            preload
            fetchPriority="high"
            sizes="100vw"
            className="object-cover"
          />
        </motion.div>
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
        className="relative z-10 w-full pb-16 md:pb-24"
        style={reduce ? undefined : { y: contentY, opacity: contentOpacity }}
      >
        <div className="shell">
          {/* `display: contents` dissolves the h1 box, so the eyebrow and the
              display line lay out exactly as the sibling <p> + <h1> did — the
              h1 now simply encloses both, giving it a searchable heading. */}
          <h1 className="contents">
            <motion.span
              className="eyebrow block text-clay-200"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE, delay: 1.0 }}
            >
              Living by ITR · Property, Care & Technology in Kochi
            </motion.span>

            <span className="mt-5 block font-display font-light text-stone-50 display-hero">
              <span className="sr-only">
                Everything your home and community need.
              </span>
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
                      {w.endsWith(".") ? (
                        <>
                          {w.slice(0, -1)}
                          <span className="text-clay-400">.</span>
                        </>
                      ) : (
                        w
                      )}
                    </motion.span>
                  </span>
                ))}
              </span>
            </span>
          </h1>

          <motion.p
            className="mt-7 max-w-xl text-lg leading-relaxed text-stone-100"
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 1.7 }}
          >
            Property buying and selling, NRI concierge, property care and
            technology-powered community management — one trusted ecosystem
            across Kochi and Kerala.
          </motion.p>

          <motion.div
            className="mt-9 flex flex-wrap gap-4"
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 1.9 }}
          >
            <Button href="/services" variant="accent">
              Explore our services
            </Button>
            <Button
              href="/platform"
              variant="ghost"
              className="border-stone-50/40 text-stone-50 hover:border-stone-50 hover:text-stone-50"
            >
              Explore the platform
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
