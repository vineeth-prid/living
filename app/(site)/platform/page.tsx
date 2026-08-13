import type { Metadata } from "next";
import {
  Building2,
  MessageSquareWarning,
  CalendarClock,
  Sparkles,
  ShoppingBag,
  BarChart3,
  FileText,
  Bot,
  ShieldCheck,
  Users2,
  Wallet,
  AlertTriangle,
  Layers,
  Gauge,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { CtaBand } from "@/components/cta";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Eyebrow, Button } from "@/components/ui";
import { JsonLd, breadcrumb, faqSchema } from "@/components/schema";
import {
  Phone,
  Float,
  ResidentScreen,
  VendorScreen,
} from "@/components/platform/devices";
import { CustomerJourney, AdminDashboard } from "@/components/platform/showcase";
import { waLink, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "The platform — apartment, facility & community management, Kochi",
  description:
    "One elegant platform for residents, vendors and associations: facility management, complaints, preventive maintenance, home services, marketplace and analytics across Kochi and Kerala.",
  alternates: { canonical: "/platform" },
};

const challenges = [
  {
    icon: Layers,
    title: "Everything lives in ten places.",
    body: "WhatsApp groups, spreadsheets, notebooks and phone calls. Nothing is in one place, and nothing is ever quite settled.",
  },
  {
    icon: AlertTriangle,
    title: "Complaints disappear.",
    body: "A leak reported on Monday is forgotten by Friday. Residents chase; managers guess; trust quietly erodes.",
  },
  {
    icon: Wallet,
    title: "Money is a mystery.",
    body: "Dues, expenses and budgets are opaque. Associations spend evenings reconciling instead of living.",
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

const security = [
  "Role-based access for residents, vendors and committees",
  "Encrypted data, in transit and at rest",
  "Full audit trail on every action and approval",
  "Private by default — your community's data is yours",
];

const faqs = [
  {
    q: "What does the Living platform do?",
    a: "Living is a community and facility management platform for apartments and villa communities in Kochi and Kerala. It includes a resident app, vendor app, and association dashboard covering facility management, complaints, preventive maintenance, home services, a marketplace, analytics and reports.",
  },
  {
    q: "Is there a resident mobile app?",
    a: "Yes. Residents get a mobile app to pay dues, raise and track complaints, book home services, manage visitors and amenities, and access the community marketplace.",
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

      <PageHeader
        eyebrow="The platform"
        title="A calm home to manage."
        intro="One refined platform for residents, vendors and associations — so a community runs itself quietly in the background, and everyone just lives."
        visual={<CustomerJourney />}
      />

      {/* CHALLENGES */}
      <section className="bg-page py-16 md:py-24">
        <div className="shell">
          <Reveal className="max-w-2xl">
            <Eyebrow>The challenge</Eyebrow>
            <h2 className="mt-5 font-display font-light text-ink display-lg">
              Managing a community shouldn't feel like a second job.
            </h2>
          </Reveal>
          <Stagger className="mt-14 grid gap-6 md:grid-cols-3">
            {challenges.map((c) => (
              <StaggerItem key={c.title}>
                <div className="h-full rounded-card border border-hairline bg-surface p-8 shadow-soft">
                  <c.icon className="h-7 w-7 text-clay-500" strokeWidth={1.5} />
                  <h3 className="mt-5 font-display text-2xl text-ink">
                    {c.title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-muted">{c.body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* HOW LIVING SOLVES IT — Resident app */}
      <section className="overflow-hidden bg-surface py-16 md:py-24">
        <div className="shell grid items-center gap-12 md:grid-cols-2">
          <Reveal>
            <Eyebrow>How Living solves it · Resident app</Eyebrow>
            <h2 className="mt-5 font-display font-light text-ink display-lg">
              Everything in its place, in your pocket.
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-body">
              Dues, complaints, visitors, amenities and home services — one
              elegant app residents actually want to open. Calm, quick, and
              unmistakably premium.
            </p>
            <ul className="mt-7 space-y-2.5 text-body">
              {["Pay maintenance in seconds", "Track every complaint to resolution", "Book trusted home services", "Manage visitors and amenities"].map(
                (li) => (
                  <li key={li} className="flex items-center gap-2.5">
                    <Gauge className="h-4 w-4 text-pine-500" strokeWidth={1.75} />
                    {li}
                  </li>
                ),
              )}
            </ul>
          </Reveal>
          <Reveal delay={0.1}>
            <Float>
              <Phone>
                <ResidentScreen />
              </Phone>
            </Float>
          </Reveal>
        </div>
      </section>

      {/* Vendor app */}
      <section className="overflow-hidden bg-page py-16 md:py-24">
        <div className="shell grid items-center gap-12 md:grid-cols-2">
          <Reveal delay={0.1} className="md:order-2">
            <Eyebrow>Vendor app</Eyebrow>
            <h2 className="mt-5 font-display font-light text-ink display-lg">
              Work that flows, not fights.
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-body">
              Vendors see their day at a glance — jobs, routes, and preventive
              schedules — and residents see honest, real-time updates. Good work,
              clearly done.
            </p>
          </Reveal>
          <Reveal className="md:order-1">
            <Float delay={1}>
              <Phone>
                <VendorScreen />
              </Phone>
            </Float>
          </Reveal>
        </div>
      </section>

      {/* ASSOCIATION / ADMIN DASHBOARD */}
      <section className="bg-surface py-16 md:py-24">
        <div className="shell">
          <Reveal className="max-w-2xl">
            <Eyebrow>Association dashboard</Eyebrow>
            <h2 className="mt-5 font-display font-light text-ink display-lg">
              The whole community, on one screen.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-body">
              Collections, complaints, facilities and finance — the committee's
              command centre, clear enough to run the community in minutes a day.
            </p>
          </Reveal>
          <Reveal delay={0.1} className="mt-12">
            <AdminDashboard />
          </Reveal>
        </div>
      </section>

      {/* CAPABILITIES GRID */}
      <section className="bg-page py-16 md:py-24">
        <div className="shell">
          <Reveal className="max-w-2xl">
            <Eyebrow>One platform, everything covered</Eyebrow>
            <h2 className="mt-5 font-display font-light text-ink display-lg">
              The whole community, considered.
            </h2>
          </Reveal>
          <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <StaggerItem key={f.title}>
                <div className="flex h-full flex-col rounded-card border border-hairline bg-surface p-7 shadow-soft transition-shadow duration-300 hover:shadow-lift">
                  <f.icon className="h-6 w-6 text-pine-600" strokeWidth={1.5} />
                  <h3 className="mt-5 font-display text-xl text-ink">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {f.body}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* FUTURE AI ASSISTANT */}
      <section className="bg-pine-50 py-16 md:py-24">
        <div className="shell grid items-center gap-12 md:grid-cols-[1fr_1.1fr]">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-pine-200 bg-surface px-4 py-1.5 text-xs font-medium text-clay-700">
              <Bot className="h-4 w-4" strokeWidth={1.6} /> Coming to Living
            </span>
            <h2 className="mt-6 font-display font-light text-ink display-lg">
              An assistant that knows your community.
            </h2>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-body">
              Ask a question, raise a request, or understand a bill — in plain
              language. The Living AI assistant will handle the everyday, so the
              committee and residents can simply live.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="rounded-hero border border-hairline bg-surface p-6 shadow-float">
              {[
                ["You", "When is the next lift service?"],
                ["Living AI", "The lift in Tower B is scheduled for preventive service on Friday, 10:00 am. I've added a reminder for you."],
                ["You", "Pay my dues"],
                ["Living AI", "₹4,200 is due in 3 days. Shall I pay it now from your saved method?"],
              ].map(([who, msg], i) => (
                <div
                  key={i}
                  className={`mb-3 max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    who === "You"
                      ? "ml-auto bg-pine-600 text-stone-50"
                      : "bg-stone-100 text-body"
                  }`}
                >
                  <span className="mb-1 block text-[10px] uppercase tracking-wider opacity-60">
                    {who}
                  </span>
                  {msg}
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* SECURITY */}
      <section className="bg-page py-16 md:py-24">
        <div className="shell grid gap-12 md:grid-cols-2 md:gap-12">
          <Reveal>
            <Eyebrow>Security & trust</Eyebrow>
            <h2 className="mt-5 font-display font-light text-ink display-lg">
              Built to be trusted with home.
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-body">
              A community's data is deeply personal. Living treats it that way —
              private by default, secure by design.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <ul className="space-y-4">
              {security.map((s) => (
                <li
                  key={s}
                  className="flex items-start gap-3 rounded-card border border-hairline bg-surface p-5 shadow-soft"
                >
                  <ShieldCheck
                    className="mt-0.5 h-5 w-5 shrink-0 text-pine-600"
                    strokeWidth={1.6}
                  />
                  <span className="text-body">{s}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* REQUEST DEMO / BOOK CONSULTATION */}
      <section className="bg-pine-700">
        <div className="shell py-24 text-center md:py-32">
          <Reveal className="mx-auto max-w-2xl">
            <Eyebrow>
              <span className="text-clay-300">See it for yourself</span>
            </Eyebrow>
            <h2 className="mt-5 font-display font-light text-stone-50 display-xl">
              A quiet demo, whenever suits you.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-stone-200">
              We'll walk your committee through Living, tailored to your
              community — no pressure, no jargon.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-4">
              <Button
                href={waLink("Hello Living, we'd like to request a platform demo for our community.")}
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
