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
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Listings } from "@/components/property";
import { CtaBand } from "@/components/cta";
import { Reveal, Stagger, StaggerItem, ZoomImage } from "@/components/motion";
import { Eyebrow, Button } from "@/components/ui";
import { JsonLd, breadcrumb, faqSchema } from "@/components/schema";
import { properties } from "@/lib/properties";
import { img } from "@/lib/images";
import { site, waLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "Our services — property sales, selling & NRI concierge in Kochi",
  description:
    "Buy an elevated home, sell yours discreetly, or hand your Kerala property to our NRI concierge. Living's property services across Ernakulam, Kochi and Kakkanad.",
  alternates: { canonical: "/services" },
};

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
];

export default function ServicesPage() {
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
        eyebrow="Our services"
        title="Buy well. Sell quietly. Live effortlessly."
        intro="One place for everything a home asks of you — from finding it, to selling it, to caring for it from afar."
        image={img.buying}
        imageAlt="Elevated apartment interior with warm natural light in Kochi"
      />

      {/* PROPERTY BUYING */}
      <section id="buying" className="scroll-mt-12 bg-page py-16 md:py-24">
        <div className="shell">
          <Reveal className="max-w-2xl">
            <Eyebrow>Property buying</Eyebrow>
            <h2 className="mt-5 font-display font-light text-ink display-lg">
              Homes worth coming back to.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-body">
              A curated collection of luxury apartments and villas across Kochi
              and Ernakulam. Every listing carries a full gallery, amenities and
              details — and a direct line to us, whenever you're ready.
            </p>
          </Reveal>
          <div className="mt-14">
            <Listings items={properties} />
          </div>
        </div>
      </section>

      {/* SELL YOUR PROPERTY */}
      <section id="selling" className="scroll-mt-12 bg-surface py-16 md:py-24">
        <div className="shell">
          <div className="grid gap-12 md:grid-cols-2 md:gap-12">
            <Reveal>
              <Eyebrow>Sell your property</Eyebrow>
              <h2 className="mt-5 font-display font-light text-ink display-lg">
                A sale handled with care, start to finish.
              </h2>
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
      <section id="nri" className="scroll-mt-12 bg-pine-50 py-16 md:py-24">
        <div className="shell">
          <div className="grid gap-12 md:grid-cols-2 md:items-center md:gap-12">
            <Reveal>
              <Eyebrow>NRI services</Eyebrow>
              <h2 className="mt-5 font-display font-light text-ink display-lg">
                Your home in Kerala, in trusted hands.
              </h2>
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

          <Reveal className="mt-14">
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
