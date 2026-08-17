"use client";

import { motion, useReducedMotion } from "framer-motion";

// Stand-in for the template's "Texture Background" layer: slow drifting blooms
// behind the hero. Decorative only, and it holds still for reduced motion.
export function HeroTexture() {
  const reduce = useReducedMotion();

  const blooms = [
    {
      className: "left-[8%] top-[-10%] h-[560px] w-[560px] bg-pine-500/25",
      to: { x: [0, 40, 0], y: [0, 30, 0] },
      duration: 22,
    },
    {
      className: "right-[4%] top-[12%] h-[460px] w-[460px] bg-clay-500/20",
      to: { x: [0, -34, 0], y: [0, 44, 0] },
      duration: 27,
    },
    {
      className: "bottom-[-18%] left-[34%] h-[520px] w-[520px] bg-pine-400/20",
      to: { x: [0, 26, 0], y: [0, -28, 0] },
      duration: 31,
    },
  ];

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {blooms.map((b, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full blur-[110px] ${b.className}`}
          animate={reduce ? undefined : b.to}
          transition={{
            duration: b.duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
      {/* Fine grain, so the blooms don't band on wide screens. */}
      <div
        className="absolute inset-0 opacity-[0.15] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
