"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import {
  Bell,
  CreditCard,
  Wrench,
  ShoppingBag,
  CalendarCheck,
  ChevronRight,
} from "lucide-react";

const EASE = [0.22, 0.61, 0.36, 1] as const;

// Slow floating wrapper for any mockup.
export function Float({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      animate={reduce ? undefined : { y: [0, -12, 0] }}
      transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay }}
    >
      {children}
    </motion.div>
  );
}

// A tasteful phone device frame containing an on-brand app screen.
export function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-[280px] max-w-full">
      <div className="rounded-[2.6rem] border border-stone-800/10 bg-stone-950 p-2.5 shadow-float">
        <div className="relative overflow-hidden rounded-[2.1rem] bg-page">
          <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-stone-950" />
          <div className="h-[560px] overflow-hidden">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  title,
  meta,
  accent,
}: {
  icon: typeof Bell;
  title: string;
  meta: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-hairline bg-surface p-3 shadow-soft">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${
          accent ? "bg-clay-100 text-clay-600" : "bg-pine-50 text-pine-600"
        }`}
      >
        <Icon className="h-4 w-4" strokeWidth={1.6} />
      </span>
      <span className="flex-1">
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        <span className="block text-[11px] text-muted">{meta}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-stone-300" />
    </div>
  );
}

// Resident app home screen.
export function ResidentScreen() {
  return (
    <div className="flex h-full flex-col gap-3 px-4 pb-4 pt-10">
      <div className="pt-2">
        <p className="eyebrow">Good morning</p>
        <p className="font-display text-2xl leading-tight text-ink">
          Welcome home, Anjali<span className="text-clay-500">.</span>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {([
          { label: "Pay dues", Icon: CreditCard },
          { label: "Book a service", Icon: Wrench },
          { label: "Visitors", Icon: Bell },
          { label: "Amenities", Icon: CalendarCheck },
        ] as const).map(({ label, Icon }) => (
          <div
            key={label}
            className="flex flex-col gap-2 rounded-[14px] border border-hairline bg-surface p-3"
          >
            <Icon className="h-5 w-5 text-pine-600" strokeWidth={1.6} />
            <span className="text-[12px] text-ink">{label}</span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted">
        This week
      </p>
      <div className="flex flex-col gap-2.5">
        <Row icon={CreditCard} title="Maintenance dues" meta="₹4,200 · due in 3 days" accent />
        <Row icon={Wrench} title="Plumbing visit" meta="Tomorrow · 10:30 am" />
        <Row icon={ShoppingBag} title="Marketplace" meta="2 new listings nearby" />
      </div>
    </div>
  );
}

// Vendor app job list.
export function VendorScreen() {
  return (
    <div className="flex h-full flex-col gap-3 px-4 pb-4 pt-10">
      <div className="pt-2">
        <p className="eyebrow">Today · 6 jobs</p>
        <p className="font-display text-2xl leading-tight text-ink">
          Your route<span className="text-clay-500">.</span>
        </p>
      </div>
      <div className="flex flex-col gap-2.5">
        <Row icon={Wrench} title="AC service · Tower B" meta="9:00 am · 3 units" accent />
        <Row icon={Wrench} title="Carpentry · Villa 12" meta="11:30 am" />
        <Row icon={Wrench} title="Electrical · Tower A" meta="2:00 pm" />
        <Row icon={CalendarCheck} title="Preventive check" meta="Lift · monthly" />
      </div>
      <div className="mt-auto rounded-[14px] bg-pine-600 p-3.5 text-center text-[13px] font-medium text-stone-50">
        Start next job
      </div>
    </div>
  );
}

// Committee screen — the third device in the showcase row.
export function CommitteeScreen() {
  return (
    <div className="flex h-full flex-col gap-3 px-4 pb-4 pt-10">
      <div className="pt-2">
        <p className="eyebrow">Palm Meadows</p>
        <p className="font-display text-2xl leading-tight text-ink">
          This month<span className="text-clay-500">.</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {([
          { label: "Collected", value: "94.2%", accent: true },
          { label: "Open issues", value: "7" },
          { label: "Avg close", value: "1.8d" },
          { label: "Vendors", value: "12" },
        ] as const).map((k) => (
          <div
            key={k.label}
            className="rounded-[14px] border border-hairline bg-surface p-3"
          >
            <span className="block text-[11px] text-muted">{k.label}</span>
            <span
              className={`mono mt-0.5 block text-xl ${
                "accent" in k && k.accent ? "text-pine-600" : "text-ink"
              }`}
            >
              {k.value}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted">
        Awaiting approval
      </p>
      <div className="flex flex-col gap-2.5">
        <Row icon={Wrench} title="Lift AMC renewal" meta="₹48,000 · Tower A" accent />
        <Row icon={ShoppingBag} title="Garden supplies" meta="₹6,400 · monthly" />
        <Row icon={CalendarCheck} title="Generator service" meta="Due next week" />
      </div>
    </div>
  );
}
