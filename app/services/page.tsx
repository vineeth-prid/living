import type { Metadata } from "next";
import {
  Camera,
  LineChart,
  Users,
  Handshake,
  ClipboardCheck,
  Home,
  Plane,
  Car,
  FileText,
  Scale,
  Stamp,
  Search,
  Wrench,
  Receipt,
  Sparkles,
  HeartPulse,
  CalendarDays,
  Sofa,
  UserCheck,
  ShieldAlert,
  KeyRound,
  Briefcase,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Listings } from "@/components/property";
import { CtaBand } from "@/components/cta";
import { Reveal, Stagger, StaggerItem, ZoomImage } from "@/components/motion";
import { Eyebrow, Button } from "@/components/ui";
import { JsonLd, breadcrumb, faqSchema } from "@/components/schema";
import { services as allServices } from "@/lib/services";
import { getProperties } from "@/lib/properties";
import { img } from "@/lib/images";
import { site, pageMeta, waLink } from "@/lib/site";

export const metadata: Metadata = pageMeta(
  "Buy, Sell & NRI Property Services in Kochi",
  "Property buying and selling, NRI concierge, property management, and community and facility management across Kochi, Ernakulam and Kerala.",
  "/services",
);

const sellingSteps = [
  {
    icon: LineChart,
    title: "Property valuation",
    body: "An honest, market-grounded valuation — so you price with confidence, not guesswork.",
  },
  {
    icon: Camera,
    title: "Professional photography",
    body: "Editorial, warm photography that shows your home the way it deserves to be seen.",
  },
  {
    icon: Sparkles,
    title: "Marketing",
    body: "Considered, targeted marketing to the right buyers — never a billboard, always a match.",
  },
  {
    icon: Users,
    title: "Buyer management",
    body: "We qualify, schedule and host viewings, and handle every conversation on your behalf.",
  },
  {
    icon: Handshake,
    title: "Closing support",
    body: "Negotiation, paperwork and hand-over — managed end to end until the keys change hands.",
  },
];

const nriServices = [
  { icon: Home, title: "Property management" },
  { icon: Plane, title: "Travel assistance" },
  { icon: Car, title: "Airport pickup" },
  { icon: Car, title: "Transportation" },
  { icon: FileText, title: "Documentation" },
  { icon: Scale, title: "Legal assistance" },
  { icon: Stamp, title: "Power of attorney support" },
  { icon: Search, title: "Property inspection" },
  { icon: Wrench, title: "Property maintenance" },
  { icon: Receipt, title: "Utility bill payments" },
  { icon: KeyRound, title: "Home preparation" },
  { icon: UserCheck, title: "Daily assistance" },
  { icon: Briefcase, title: "Personal concierge" },
  { icon: HeartPulse, title: "Healthcare coordination" },
  { icon: CalendarDays, title: "Event management" },
  { icon: Sofa, title: "Interior refresh" },
  { icon: ClipboardCheck, title: "Local representation" },
  { icon: ShieldAlert, title: "Emergency support" },
];

const buyingSupport = [
  { icon: Search, title: "Property discovery" },
  { icon: Home, title: "Curated listings" },
  { icon: LineChart, title: "Property evaluation" },
  { icon: CalendarDays, title: "Viewing assistance" },
  { icon: FileText, title: "Documentation guidance" },
  { icon: Handshake, title: "Closing support" },
];

const propertyCare = [
  { icon: Search, title: "Routine inspections" },
  { icon: CalendarDays, title: "Preventive maintenance" },
  { icon: Wrench, title: "Repairs" },
  { icon: Handshake, title: "Vendor coordination" },
  { icon: Receipt, title: "Utility management" },
  { icon: KeyRound, title: "Property readiness" },
  { icon: ShieldAlert, title: "Emergency support" },
  { icon: LineChart, title: "Reporting" },
];

const communityOps = [
  { icon: Home, title: "Facility management" },
  { icon: Wrench, title: "Maintenance" },
  { icon: ClipboardCheck, title: "Complaints" },
  { icon: FileText, title: "Work orders" },
  { icon: Handshake, title: "Vendor management" },
  { icon: CalendarDays, title: "Preventive maintenance" },
  { icon: Users, title: "Staff & workforce" },
  { icon: UserCheck, title: "Resident services" },
  { icon: LineChart, title: "Reporting" },
  { icon: Sparkles, title: "Community operations" },
];

const faqs = [
  {
    q: "Can I buy a property directly through Living?",
    a: "Yes. You can browse Living's curated homes across Kochi and Ernakulam, view galleries, amenities and details, and enquire directly by call or WhatsApp with a Living property expert.",
  },
  {
    q: "How does selling my property with Living work?",
    a: "Living manages your sale end to end — valuation, professional photography, targeted marketing, buyer management and closing support. Owners cannot self-list; a Living expert handles the sale for you.",
  },
  {
    q: "What do Living's NRI services include?",
    a: "Living's NRI concierge in Kerala covers property management, legal and documentation support, power of attorney, inspection and maintenance, utility payments, home preparation, daily assistance and emergency support.",
  },
  {
    q: "What does Living's property management service cover?",
    a: "Routine inspections, preventive maintenance, repairs, vendor coordination, utility management, property readiness, emergency support and reporting — on a set schedule, with photographic reporting after every visit.",
  },
  {
    q: "Does Living manage apartment communities and facilities?",
    a: "Yes. Living runs facility management, maintenance, complaints, work orders, vendor management, preventive maintenance, staff and workforce management, resident services and reporting for apartment and villa communities in Kochi and Kerala, supported by the Living Platform.",
  },
];

export default async function ServicesPage() {
  const properties = await getProperties();

  return (
    <>
      <JsonLd
        data={breadcrumb([
          { name: "Home", path: "/" },
          { name: "Our services", path: "/services" },
        ])}
      />
      <JsonLd data={faqSchema(faqs)} />

      <PageHeader
        eyebrow="Buy, Sell & NRI Property Services in Kochi"
        title="Everything your property and living experience needs."
        intro="Five services covering the whole of property and community life — buying, selling, NRI concierge, property management, and community and facility management."
        image={img.buying}
        imageAlt="Elevated apartment interior with warm natural light in Kochi"
      />

      {/* SERVICE HUB INDEX — jump straight to a service instead of scrolling. */}
      <section className="bg-page pt-14 md:pt-20">
        <div className="shell">
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allServices.map((s) => (
              <StaggerItem key={s.key}>
                <Link
                  href={s.href}
                  className="group flex h-full flex-col rounded-card border border-hairline bg-surface p-6 shadow-soft transition-shadow duration-300 hover:shadow-lift"
                >
                  <span className="flex items-center gap-2.5">
                    <s.icon className="h-5 w-5 text-pine-600" strokeWidth={1.6} />
                    <span className="font-display text-xl text-ink">
                      {s.label}
                    </span>
                  </span>
                  <span className="mt-2 flex-1 text-sm leading-relaxed text-muted">
                    {s.blurb}
                  </span>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-pine-700">
                    Explore service
                    <ArrowUpRight
                      className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      strokeWidth={1.75}
                    />
                  </span>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* PROPERTY BUYING */}
      <section id="buying" className="scroll-mt-12 bg-page py-14 md:py-20">
        <div className="shell">
          <Reveal className="max-w-2xl">
            <Eyebrow as="h2">Luxury Apartments & Villas in Kochi & Ernakulam</Eyebrow>
            <p className="mt-5 font-display font-light text-ink display-lg">
              Homes worth coming back to.
            </p>
            <p className="mt-6 text-lg leading-relaxed text-body">
              A curated collection of luxury apartments and villas across Kochi
              and Ernakulam. Every listing carries a full gallery, amenities and
              details — and a direct line to us, whenever you're ready.
            </p>
          </Reveal>

          <Stagger className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {buyingSupport.map((s) => (
              <StaggerItem key={s.title}>
                <div className="flex h-full flex-col gap-3 rounded-card border border-hairline bg-surface p-5 shadow-soft">
                  <s.icon className="h-6 w-6 text-pine-600" strokeWidth={1.5} />
                  <span className="text-sm leading-snug text-body">
                    {s.title}
                  </span>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <div className="mt-10">
            <Listings items={properties} />
          </div>
        </div>
      </section>

      {/* SELL YOUR PROPERTY */}
      <section id="selling" className="scroll-mt-12 bg-surface py-14 md:py-20">
        <div className="shell">
          <div className="grid gap-12 md:grid-cols-2 md:gap-12">
            <Reveal>
              <Eyebrow as="h2">Sell Your Property in Kochi</Eyebrow>
              <p className="mt-5 font-display font-light text-ink display-lg">
                A sale handled with care, start to finish.
              </p>
              <p className="mt-6 text-lg leading-relaxed text-body">
                You don't post a listing and hope. You hand it to people who do
                this well — and get on with life. From valuation to keys, one
                team looks after everything.
              </p>
              <div className="mt-8">
                <Button
                  href={waLink(
                    "Hello Living, I'd like to talk to a property expert about selling my property.",
                  )}
                  variant="accent"
                  external
                >
                  Talk to our property expert
                </Button>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <ZoomImage
                src={img.selling}
                alt="A calm handover — keys and paperwork on a wooden table"
                className="aspect-[4/3] w-full rounded-media shadow-lift"
              />
            </Reveal>
          </div>

          <Stagger className="mt-12 grid gap-5 md:grid-cols-3 lg:grid-cols-5">
            {sellingSteps.map((s, i) => (
              <StaggerItem key={s.title}>
                <div className="flex h-full flex-col rounded-card border border-hairline bg-page p-6 shadow-soft">
                  <div className="flex items-center gap-3">
                    <s.icon className="h-6 w-6 text-pine-600" strokeWidth={1.5} />
                    <span className="mono text-sm text-stone-400">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-xl text-ink">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {s.body}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* NRI SERVICES */}
      <section id="nri" className="scroll-mt-12 bg-pine-50 py-14 md:py-20">
        <div className="shell">
          <div className="grid gap-12 md:grid-cols-2 md:items-center md:gap-12">
            <Reveal>
              <Eyebrow as="h2">NRI Property Management in Kerala</Eyebrow>
              <p className="mt-5 font-display font-light text-ink display-lg">
                Your home in Kerala, in trusted hands.
              </p>
              <p className="mt-6 text-lg leading-relaxed text-body">
                A luxury concierge for NRIs — the quiet reassurance that your
                home, your paperwork and your family are looked after while
                you're away. One point of contact for everything.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <ZoomImage
                src={img.nri}
                alt="A concierge tending to a warm, well-kept Kerala home"
                className="aspect-[4/3] w-full rounded-media shadow-float"
              />
            </Reveal>
          </div>

          <Stagger className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {nriServices.map((s) => (
              <StaggerItem key={s.title}>
                <div className="flex h-full flex-col gap-3 rounded-card border border-hairline bg-surface p-5 shadow-soft transition-colors duration-300 hover:border-clay-400">
                  <s.icon className="h-6 w-6 text-pine-600" strokeWidth={1.5} />
                  <span className="text-sm leading-snug text-body">
                    {s.title}
                  </span>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <Reveal className="mt-10">
            <Button
              href={waLink(
                "Hello Living, I'm an NRI and would like help managing my property in Kerala.",
              )}
              variant="accent"
              external
            >
              Speak to our NRI concierge
            </Button>
          </Reveal>
        </div>
      </section>

      {/* PROPERTY MANAGEMENT */}
      <section id="property-care" className="scroll-mt-12 bg-page py-14 md:py-20">
        <div className="shell">
          <div className="grid gap-10 md:grid-cols-2 md:gap-12">
            <Reveal>
              <Eyebrow as="h2">Property Management in Kochi & Kerala</Eyebrow>
              <p className="mt-4 font-display font-light text-ink display-lg">
                A home looked after, all year.
              </p>
              <p className="mt-5 text-lg leading-relaxed text-body">
                Routine inspections, preventive maintenance, repairs, vendor
                coordination and utilities — handled on a schedule, with
                photographic reporting after every visit. Whether you live in
                the home, rent it out, or visit twice a year.
              </p>
              <div className="mt-7">
                <Button
                  href={waLink(
                    "Hello Living, I'd like to know more about property management for my home.",
                  )}
                  variant="accent"
                  external
                >
                  Talk to property management
                </Button>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <ZoomImage
                src={img.selling}
                alt="A well-kept Kerala home being checked over during a routine inspection"
                className="aspect-[4/3] w-full rounded-media shadow-lift"
              />
            </Reveal>
          </div>

          <Stagger className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {propertyCare.map((s) => (
              <StaggerItem key={s.title}>
                <div className="flex h-full flex-col gap-3 rounded-card border border-hairline bg-surface p-5 shadow-soft">
                  <s.icon className="h-6 w-6 text-pine-600" strokeWidth={1.5} />
                  <span className="text-sm leading-snug text-body">
                    {s.title}
                  </span>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* COMMUNITY & FACILITY MANAGEMENT */}
      <section id="community" className="scroll-mt-12 bg-surface py-14 md:py-20">
        <div className="shell">
          <Reveal className="max-w-2xl">
            <Eyebrow as="h2">
              Community & Facility Management for Apartments
            </Eyebrow>
            <p className="mt-4 font-display font-light text-ink display-lg">
              Communities, run properly.
            </p>
            <p className="mt-5 text-lg leading-relaxed text-body">
              Living manages the day-to-day operation of apartment and villa
              communities — facilities, work orders, vendors, staff and resident
              services — with the Living Platform underneath it, so committees
              can see exactly where everything stands.
            </p>
          </Reveal>

          <Stagger className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {communityOps.map((s) => (
              <StaggerItem key={s.title}>
                <div className="flex h-full flex-col gap-3 rounded-card border border-hairline bg-page p-5 shadow-soft">
                  <s.icon className="h-6 w-6 text-pine-600" strokeWidth={1.5} />
                  <span className="text-sm leading-snug text-body">
                    {s.title}
                  </span>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <Reveal className="mt-10 flex flex-wrap gap-4">
            <Button href="/platform" variant="primary">
              Explore the Living Platform
            </Button>
            <Button
              href={waLink(
                "Hello Living, we'd like to talk about community and facility management for our community.",
              )}
              variant="ghost"
              external
            >
              Talk to our team
            </Button>
          </Reveal>
        </div>
      </section>

      <CtaBand
        title="Not sure where to start?"
        body="Tell us what you need — buying, selling, or care for a home from afar — and we'll take it from there."
      />

      <section className="sr-only">
        <h2>Property services in Ernakulam and Kochi — {site.name}</h2>
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
