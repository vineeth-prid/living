"use client";

import { motion, useReducedMotion } from "framer-motion";

// The template's oversized scrolling wordmark. Two identical tracks sit side by
// side and the pair slides exactly one track-width, so the seam never shows.
export function Marquee({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <div
      aria-hidden
      className={`pointer-events-none select-none overflow-hidden ${className}`}
    >
      <motion.div
        className="flex w-max"
        animate={reduce ? undefined : { x: ["0%", "-50%"] }}
        transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
      >
        {[0, 1].map((track) => (
          <div key={track} className="flex shrink-0">
            {Array.from({ length: 4 }, (_, i) => (
              <span
                key={i}
                className="px-6 font-display text-[18vw] leading-[0.85] tracking-[-0.03em] text-stone-50/[0.07] md:text-[13vw]"
              >
                {text}
              </span>
            ))}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
