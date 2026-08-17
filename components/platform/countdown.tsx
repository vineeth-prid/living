"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { quarterEnd, quarterOf } from "@/lib/quarter";

// The template's flip digits: each glyph swaps on change, rising 6px in and
// leaving 6px up, 180ms ease-out.
function Digit({ char }: { char: string }) {
  return (
    <span className="relative inline-block h-[1em] w-[0.62em] overflow-hidden align-baseline">
      <AnimatePresence initial={false}>
        <motion.span
          key={char}
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -6, opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Unit({ value, label }: { value: number; label: string }) {
  const text = String(Math.max(0, value)).padStart(2, "0");
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="mono flex text-4xl text-stone-50 md:text-5xl">
        {text.split("").map((c, i) => (
          <Digit key={i} char={c} />
        ))}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">
        {label}
      </span>
    </div>
  );
}

const Colon = () => (
  <span className="mono self-start pt-1 text-3xl text-stone-500 md:text-4xl">:</span>
);

// Recomputed from the clock on every tick, so when one quarter runs out the
// next one is picked up automatically — nobody has to edit a date.
function readClock() {
  const now = new Date();
  const end = quarterEnd(now);
  const ms = Math.max(0, end.getTime() - now.getTime());
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor(ms / 3_600_000) % 24,
    minutes: Math.floor(ms / 60_000) % 60,
    seconds: Math.floor(ms / 1000) % 60,
    quarter: `Q${quarterOf(now)}`,
    endsOn: end.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  };
}

const ZERO = {
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  quarter: "",
  endsOn: "",
};

export function Countdown({ label }: { label: string }) {
  // Server and first client paint must agree, so start at zero and let the
  // effect fill in the real figure — otherwise the two render different
  // clocks and React reports a hydration mismatch.
  const [time, setTime] = useState(ZERO);

  useEffect(() => {
    setTime(readClock());
    const id = setInterval(() => setTime(readClock()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-clay-300">
        {label}
      </p>
      <div className="flex items-start gap-3 md:gap-5">
        <Unit value={time.days} label="Days" />
        <Colon />
        <Unit value={time.hours} label="Hrs" />
        <Colon />
        <Unit value={time.minutes} label="Min" />
        <Colon />
        <Unit value={time.seconds} label="Sec" />
      </div>
      {/* Empty until hydration, so it never contradicts the digits above. */}
      <p className="h-5 text-[13px] text-stone-400">
        {time.endsOn && `${time.quarter} ends ${time.endsOn}`}
      </p>
    </div>
  );
}
