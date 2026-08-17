import type { Metadata } from "next";
import {
  Building2,
  MessageSquareWarning,
  CalendarClock,
  Sparkles,
  ShoppingBag,
  BarChart3,
  FileText,
  ShieldCheck,
  Users2,
  Smartphone,
  Wallet,
  Check,
  X,
  ArrowRight,
  Zap,
} from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui";
import { JsonLd, breadcrumb, faqSchema } from "@/components/schema";
import {
  Phone,
  Float,
  ResidentScreen,
  VendorScreen,
  CommitteeScreen,
} from "@/components/platform/devices";
import { AdminDashboard } from "@/components/platform/showcase";
import { SectionNav } from "@/components/platform/section-nav";
import { Faq } from "@/components/platform/accordion";
import { Marquee } from "@/components/platform/marquee";
import { HeroTexture } from "@/components/platform/hero-bg";
import { Countdown } from "@/components/platform/countdown";
import { waLink, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "The platform — apartment, facility & community management, Kochi",
  description:
    "One elegant platform for residents, vendors and associations: facility management, complaints, preventive maintenance, home services, marketplace and analytics across Kochi and Kerala.",
  alternates: { canonical: "/platform" },
};

const shell = "mx-auto w-full max-w-[1080px] px-5";
const band = "py-[56px] md:py-[120px]";

const sections = [
  { id: "compare", label: "Why Living" },
  { id: "how", label: "How it works" },
  { id: "benefits", label: "What you get" },
  { id: "demo", label: "Demo" },
  { id: "faq", label: "FAQ" },
] as const;

const oldWay = [
  "Ten places — WhatsApp, spreadsheets, notebooks",
  "Complaints forgotten by Friday",
  "Dues and expenses nobody can see",
  "Evenings lost to reconciling",
];

const newWay = [
  "One app, one thread, one record",
  "Every complaint tracked through to closed",
  "Collections and spend on a single screen",
  "Board-ready reports in a tap",
];

// Figures already published elsewhere on the site — no invented claims.
const stats = [
  ["94.2%", "Complaints closed on time"],
  ["8", "Modules, included"],
  ["15 yrs", "Of ITR Group behind it"],
] as const;

const steps = [
  {
    n: "01",
    title: "Onboard your community",
    body: "Units, residents, committee and vendors, imported in one go. No code, no long migration — most communities are live inside a week.",
    visual: (
      <div className="flex flex-col gap-2">
        {[
          ["Units imported", "248"],
          ["Residents invited", "412"],
          ["Vendors linked", "12"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-[14px] border border-hairline bg-surface px-4 py-3"
          >
            <span className="flex items-center gap-2.5 text-[13px] text-ink">
              <Check className="h-4 w-4 text-pine-600" strokeWidth={2} />
              {label}
            </span>
            <span className="mono text-[13px] text-muted">{value}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    n: "02",
    title: "Everyone works in one place",
    body: "Residents raise and pay, vendors see their day, the committee approves — each in a view built for the job, all writing to the same record.",
    visual: (
      <div className="flex flex-col gap-2">
        {[
          ["Water leakage · 1204", "Assigned", "bg-[#e7eff3] text-[#325870]"],
          ["Lift noise · Tower A", "In progress", "bg-[#f8f0d9] text-[#9e7817]"],
          ["Garden lighting · Villa 12", "Resolved", "bg-[#e9f2ec] text-[#2f6347]"],
        ].map(([title, status, tone]) => (
          <div
            key={title}
            className="flex items-center justify-between gap-3 rounded-[14px] border border-hairline bg-surface px-4 py-3"
          >
            <span className="truncate text-[13px] text-ink">{title}</span>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${tone}`}
            >
              {status}
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    n: "03",
    title: "See exactly where it stands",
    body: "Collections, resolution times and spend update as they happen. The committee runs the community in minutes a day, and the AGM writes itself.",
    visual: (
      <div className="rounded-[14px] border border-hairline bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-ink">Complaints resolved</span>
          <span className="mono text-[11px] text-muted">6 months</span>
        </div>
        <div className="mt-4 flex h-24 items-end gap-1.5">
          {[58, 71, 66, 82, 76, 94].map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-t-[4px] ${
                i === 5 ? "bg-clay-500" : "bg-pine-400"
              }`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    ),
  },
];

const benefits = [
  {
    icon: Smartphone,
    title: "One app for the whole community",
    body: "Residents, vendors and the committee, finally in the same place.",
  },
  {
    icon: MessageSquareWarning,
    title: "Nothing slips through",
    body: "Every complaint has a status everybody can see, right through to closed.",
  },
  {
    icon: Wallet,
    title: "The money is on one screen",
    body: "Dues, expenses and budgets update as they happen — no month-end scramble.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    body: "Role-based access, encrypted data, and a full audit trail on every approval.",
  },
];

const features = [
  {
    icon: Building2,
    title: "Facility management",
    body: "Assets, staff, schedules and vendors — every moving part of the community, calmly in view.",
  },
  {
    icon: MessageSquareWarning,
    title: "Complaint management",
    body: "Raise, track and resolve in a clear thread. Nothing slips; everyone can see where things stand.",
  },
  {
    icon: CalendarClock,
    title: "Preventive maintenance",
    body: "Lifts, pumps and generators serviced on schedule — before they ever become an emergency.",
  },
  {
    icon: Sparkles,
    title: "Home services",
    body: "Cleaning, plumbing, electrical and more — booked from the app, delivered by trusted vendors.",
  },
  {
    icon: ShoppingBag,
    title: "Community marketplace",
    body: "A calm, local marketplace where neighbours buy, sell and share within a community they trust.",
  },
  {
    icon: BarChart3,
    title: "Analytics dashboard",
    body: "Collections, resolution times and spend — the health of the community, at a glance.",
  },
  {
    icon: FileText,
    title: "Reports",
    body: "Board-ready financial and operational reports, generated in a tap. No more late-night spreadsheets.",
  },
  {
    icon: Users2,
    title: "Association dashboard",
    body: "One considered command centre for the committee — decisions made with clarity, not guesswork.",
  },
];

const faqs = [
  {
    q: "Who is Living for?",
    a: "Apartment and villa communities in Kochi and Kerala — the residents who live there, the vendors who serve them, and the association committee that answers for it all.",
  },
  {
    q: "What does the Living platform do?",
    a: "Living is a community and facility management platform. It includes a resident app, vendor app, and association dashboard covering facility management, complaints, preventive maintenance, home services, a marketplace, analytics and reports.",
  },
  {
    q: "Is there a resident mobile app?",
    a: "Yes. Residents get a mobile app to pay dues, raise and track complaints, book home services, manage visitors and amenities, and access the community marketplace.",
  },
  {
    q: "What does the association get?",
    a: "The committee gets a dashboard covering collections, complaints, facilities and finance, with board-ready financial and operational reports generated in a tap, and a full audit trail on every action and approval.",
  },
  {
    q: "Is our data safe?",
    a: "Role-based access separates residents, vendors and committee members, data is encrypted in transit and at rest, every action and approval leaves an audit trail, and the community's data stays private by default.",
  },
  {
    q: "How do I see the platform?",
    a: "You can request a demo or book a consultation with the Living team. Pricing is shared privately, tailored to your community's size and needs.",
  },
];

export default function PlatformPage() {
  return (
    <>
      <JsonLd
        data={breadcrumb([
          { name: "Home", path: "/" },
          { name: "Platform", path: "/platform" },
        ])}
      />
      <JsonLd data={faqSchema(faqs)} />

      {/* ================= HERO — dark, centred, texture behind ============== */}
      <header className="relative overflow-hidden bg-pine-950 pb-[72px] pt-32 md:pb-[104px] md:pt-44">
        <HeroTexture />

        <div className={`${shell} relative text-center`}>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-stone-50/15 bg-stone-50/[0.14] px-4 py-2 text-xs font-semibold text-stone-50 backdrop-blur-[33px]">
              <Zap className="h-3.5 w-3.5 text-clay-300" strokeWidth={2} />
              Now onboarding communities across Kochi
            </span>
          </Reveal>

          <Reveal delay={0.08}>
            <h1 className="mx-auto mt-8 max-w-3xl font-display font-light text-stone-50">
              <span className="block text-[clamp(2rem,4.6vw,3.75rem)] leading-[1.06] tracking-[-0.02em]">
                Run your whole community with
              </span>
              <span className="mt-2 block text-[clamp(3.5rem,12vw,8rem)] leading-[0.8] tracking-[-0.03em]">
                <span className="text-clay-400">one</span> app
              </span>
            </h1>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="mx-auto mt-8 max-w-xl text-[15px] leading-relaxed text-stone-300">
              Living brings dues, complaints, vendors, facilities and finance
              into a single platform — so a community runs itself quietly in the
              background, and everyone just lives.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-9 flex justify-center">
              <Button
                href={waLink(
                  "Hello Living, we'd like to request a platform demo for our community.",
                )}
                variant="accent"
                external
              >
                Request a demo
              </Button>
            </div>
          </Reveal>

          {/* Social-proof row — icon cluster in place of the template's avatars */}
          <Reveal delay={0.32}>
            <div className="mt-8 flex items-center justify-center gap-3">
              <div className="flex -space-x-2.5">
                {[Smartphone, Users2, Building2].map((Icon, i) => (
                  <span
                    key={i}
                    className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-pine-950 bg-pine-800 text-clay-300"
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.6} />
                  </span>
                ))}
              </div>
              <p className="text-left text-[13px] leading-tight text-stone-400">
                <span className="mono text-stone-50">94.2%</span> of complaints
                <br className="sm:hidden" /> closed within the promised window
              </p>
            </div>
          </Reveal>
        </div>

        {/* ---- Showcase: three devices, then the wordmark marquee ---------- */}
        <div className={`${shell} relative mt-16 md:mt-24`}>
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-[15px] leading-relaxed text-stone-400">
              Living handles the everyday of a community — from a leaking tap to
              the annual audit — so the committee stops chasing and the residents
              stop wondering.
            </p>
          </Reveal>

          <div className="mt-12 flex items-end justify-center gap-4 md:mt-16 md:gap-8">
            {/* Outer two step back on desktop, as in the template's trio. */}
            <Reveal delay={0.08} className="hidden w-1/3 md:block">
              <Float>
                <div className="origin-bottom scale-[0.88] opacity-90">
                  <Phone>
                    <VendorScreen />
                  </Phone>
                </div>
              </Float>
            </Reveal>
            <Reveal className="w-full max-w-[280px] md:w-1/3">
              <Float delay={0.6}>
                <Phone>
                  <ResidentScreen />
                </Phone>
              </Float>
            </Reveal>
            <Reveal delay={0.16} className="hidden w-1/3 md:block">
              <Float delay={1.2}>
                <div className="origin-bottom scale-[0.88] opacity-90">
                  <Phone>
                    <CommitteeScreen />
                  </Phone>
                </div>
              </Float>
            </Reveal>
          </div>
        </div>

        <Marquee text="LIVING" className="mt-14 md:mt-20" />
      </header>

      {/* Rendered as a direct sibling, not inside a wrapper: a sticky element
          only travels within its parent's box, and these sections are the
          scroll region it has to follow. */}
      <SectionNav items={sections} />

      {/* ================= COMPARISON ======================================= */}
      <section id="compare" className={`bg-page ${band}`}>
        <div className={shell}>
          <Reveal className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-clay-700">
              Trusted by communities in Kochi
            </p>
            <h2 className="mx-auto mt-5 max-w-2xl font-display font-light text-ink text-[clamp(2rem,3.6vw,3.2rem)] leading-[1.08] tracking-[-0.02em]">
              The old way, and the way it should be.
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {/* The old way */}
            <Reveal>
              <div className="flex h-full flex-col rounded-[24px] border border-hairline bg-surface p-7 md:p-8">
                <span className="inline-flex w-max items-center gap-2 rounded-full bg-stone-100 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-600">
                  <X className="h-3.5 w-3.5" strokeWidth={2.4} />
                  The old way
                </span>
                <ul className="mt-7 flex flex-col gap-4">
                  {oldWay.map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <X
                        className="mt-0.5 h-4 w-4 shrink-0 text-stone-400"
                        strokeWidth={2.2}
                      />
                      <span className="text-[15px] leading-relaxed text-muted">
                        {t}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 rounded-[16px] bg-stone-100 px-5 py-4 text-center text-[13px] font-medium text-stone-600">
                  Somebody&rsquo;s second job, every single week
                </div>
              </div>
            </Reveal>

            {/* With Living */}
            <Reveal delay={0.1}>
              <div className="flex h-full flex-col rounded-[24px] border border-pine-200 bg-gradient-to-b from-pine-50 to-surface p-7 shadow-lift md:p-8">
                <span className="inline-flex w-max items-center gap-2 rounded-full bg-pine-700 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-50">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                  With Living
                </span>
                <ul className="mt-7 flex flex-col gap-4">
                  {newWay.map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-pine-600"
                        strokeWidth={2.2}
                      />
                      <span className="text-[15px] leading-relaxed text-body">
                        {t}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 rounded-[16px] bg-pine-700 px-5 py-4 text-center text-[13px] font-medium text-stone-50">
                  Minutes a day, and the AGM writes itself
                </div>
              </div>
            </Reveal>
          </div>

          {/* Stat trio */}
          <Stagger className="mt-5 grid gap-5 sm:grid-cols-3">
            {stats.map(([figure, label]) => (
              <StaggerItem key={label}>
                <div className="rounded-[24px] border border-hairline bg-surface px-6 py-8 text-center">
                  <div className="font-display text-[clamp(2.25rem,4vw,3rem)] leading-none text-pine-700">
                    {figure}
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed text-muted">
                    {label}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ================= WIDE DASHBOARD =================================== */}
      <section className="bg-page pb-[56px] md:pb-[120px]">
        <div className={shell}>
          <Reveal>
            <AdminDashboard />
          </Reveal>
        </div>
      </section>

      {/* ================= HOW IT WORKS ===================================== */}
      <section id="how" className={`bg-surface ${band}`}>
        <div className={shell}>
          <Reveal className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-clay-700">
              How it works
            </p>
            <h2 className="mx-auto mt-5 max-w-2xl font-display font-light text-ink text-[clamp(2rem,3.6vw,3.2rem)] leading-[1.08] tracking-[-0.02em]">
              Get started in 3 simple steps.
            </h2>
          </Reveal>

          <Stagger className="mt-14 grid gap-5 md:grid-cols-3">
            {steps.map((s) => (
              <StaggerItem key={s.n}>
                <div className="flex h-full flex-col rounded-[24px] border border-hairline bg-page p-6">
                  <div className="rounded-[18px] bg-stone-100/70 p-4">
                    {s.visual}
                  </div>
                  <span className="mono mt-7 text-[13px] text-clay-600">
                    {s.n}
                  </span>
                  <h3 className="mt-2 font-display text-2xl text-ink">
                    {s.title}
                  </h3>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
                    {s.body}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ================= BENEFITS (bento) ================================= */}
      <section id="benefits" className={`bg-page ${band}`}>
        <div className={shell}>
          <Reveal className="text-center">
            <h2 className="mx-auto max-w-2xl font-display font-light text-ink text-[clamp(2rem,3.6vw,3.2rem)] leading-[1.08] tracking-[-0.02em]">
              Why communities move to Living.
            </h2>
          </Reveal>

          {/* Template bento: first tile spans two columns, then three across. */}
          <Stagger className="mt-14 grid gap-5 md:grid-cols-2">
            {benefits.map((b, i) => (
              <StaggerItem key={b.title} className={i === 0 ? "md:col-span-2" : ""}>
                <div
                  className={`group relative h-full overflow-hidden rounded-[24px] border border-hairline bg-surface p-7 transition-all duration-500 ease-[var(--ease-calm)] hover:-translate-y-1 hover:border-pine-200 hover:shadow-lift ${
                    i === 0 ? "md:p-9" : ""
                  }`}
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-pine-100/50 blur-3xl transition-opacity duration-500 group-hover:opacity-70"
                  />
                  <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-pine-50 text-pine-700 transition-colors duration-500 group-hover:bg-pine-100">
                    <b.icon className="h-5 w-5" strokeWidth={1.6} />
                  </span>
                  <h3
                    className={`relative mt-6 font-display text-ink ${
                      i === 0 ? "text-3xl" : "text-2xl"
                    }`}
                  >
                    {b.title}
                  </h3>
                  <p className="relative mt-2.5 max-w-md text-[15px] leading-relaxed text-muted">
                    {b.body}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          {/* The eight modules, as the template's dense secondary grid. */}
          <Stagger className="mt-5 grid gap-px overflow-hidden rounded-[24px] border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <StaggerItem key={f.title}>
                <div className="h-full bg-surface p-6 transition-colors duration-500 hover:bg-pine-50/40">
                  <f.icon className="h-5 w-5 text-pine-700" strokeWidth={1.5} />
                  <h3 className="mt-4 font-display text-lg text-ink">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                    {f.body}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ================= COUNTDOWN CTA (dark) ============================= */}
      <section id="demo" className={`relative overflow-hidden bg-pine-950 ${band}`}>
        <HeroTexture />
        <div className={`${shell} relative`}>
          <Reveal className="flex flex-col items-center">
            <Countdown label="Onboarding for this quarter closes in" />
          </Reveal>

          <Reveal delay={0.1} className="mt-16 text-center">
            <h2 className="mx-auto max-w-2xl font-display font-light text-stone-50 text-[clamp(2rem,4vw,3.5rem)] leading-[1.06] tracking-[-0.02em]">
              Ready to see Living?
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-stone-300">
              We&rsquo;ll walk your committee through it, tailored to your
              community — no pressure, no jargon.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button
                href={waLink(
                  "Hello Living, we'd like to request a platform demo for our community.",
                )}
                variant="accent"
                external
              >
                Request a demo
              </Button>
              <Button
                href="/contact"
                variant="ghost"
                className="border-stone-50/40 text-stone-50 hover:border-stone-50 hover:text-stone-50"
              >
                Book a consultation
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= FAQ ============================================== */}
      <section id="faq" className={`bg-page ${band}`}>
        <div className="mx-auto w-full max-w-[760px] px-5">
          <Reveal className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-clay-700">
              FAQ
            </p>
            <h2 className="mt-5 font-display font-light text-ink text-[clamp(2rem,3.6vw,3.2rem)] leading-[1.08] tracking-[-0.02em]">
              Common questions.
            </h2>
          </Reveal>
          <Reveal delay={0.1} className="mt-12">
            <Faq items={faqs} />
          </Reveal>
          <Reveal delay={0.16} className="mt-8 text-center">
            <a
              href="/contact"
              className="inline-flex items-center gap-2 text-[15px] text-pine-700 underline-offset-4 hover:underline"
            >
              Still have a question? Talk to us
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </a>
          </Reveal>
        </div>
      </section>

      {/* ================= CLOSING BAND ===================================== */}
      <section className="bg-page pb-[56px] md:pb-[120px]">
        <div className={shell}>
          <Reveal>
            <div className="relative overflow-hidden rounded-[40px] bg-pine-700 px-7 py-14 text-center md:px-12 md:py-20">
              <Marquee
                text="LIVING"
                className="absolute inset-x-0 bottom-0 opacity-60"
              />
              <div className="relative">
                <h2 className="mx-auto max-w-xl font-display font-light text-stone-50 text-[clamp(1.75rem,3.4vw,3rem)] leading-[1.08] tracking-[-0.02em]">
                  Don&rsquo;t wait for the next AGM — see Living this week.
                </h2>
                <div className="mt-8 flex justify-center">
                  <Button
                    href={waLink(
                      "Hello Living, we'd like to request a platform demo for our community.",
                    )}
                    variant="accent"
                    external
                  >
                    Request a demo
                  </Button>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="sr-only">
        <h2>Community and facility management platform — {site.name}</h2>
        {faqs.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}
      </section>
    </>
  );
}
