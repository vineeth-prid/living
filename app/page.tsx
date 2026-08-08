import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Hero } from "@/components/home/hero";
import { Ecosystem } from "@/components/home/ecosystem";
import { BrandStory } from "@/components/home/story";
import { Offerings } from "@/components/home/offerings";
import { Listings } from "@/components/property";
import { CtaBand } from "@/components/cta";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Eyebrow } from "@/components/ui";
import { Float, Phone, ResidentScreen } from "@/components/platform/devices";
import { JsonLd, faqSchema } from "@/components/schema";
import { getProperties } from "@/lib/properties";
import { site } from "@/lib/site";

const HOME_TITLE = "Premium Property & NRI Services in Kochi | Living by ITR";
const HOME_DESC =
  "Buy, sell or manage a home in Kochi with Living by ITR — property sales, NRI concierge and a community platform across Ernakulam and Kerala.";

export const metadata: Metadata = {
  // `absolute` skips the `%s · Living` template — the brand is already in it.
  title: { absolute: HOME_TITLE },
  description: HOME_DESC,
  alternates: { canonical: "/" },
  openGraph: { title: HOME_TITLE, description: HOME_DESC, url: "/" },
};

// Named capabilities, not adjectives — a visitor should be able to tell what
// the platform actually does without opening the Platform page.
const platformCapabilities = [
  "Resident app",
  "Community management",
  "Complaint & ticket management",
  "Service requests",
  "Facility management",
  "Preventive maintenance",
  "Vendor management",
  "Workforce operations",
  "Visitor & delivery management",
  "Notifications",
  "Analytics & reports",
  "AI-powered assistance",
];

const stats = [
  ["94.2%", "Complaints resolved on time"],
  ["15 yrs", "Of ITR Group trust"],
  ["24/7", "Concierge for residents"],
  ["1 app", "For the whole community"],
];

const homeFaqs = [
  {
    q: "What is Living?",
    a: "Living is a property and living ecosystem by ITR Group, based in Kakkanad, Ernakulam. It covers property buying and selling, NRI concierge, property management, community and facility management, and a technology platform for residents, associations, staff and vendors across Kochi and Kerala.",
  },
  {
    q: "What services does Living offer?",
    a: "Living offers five services: property buying, property selling, NRI concierge, property management, and community and facility management — supported by the Living Platform.",
  },
  {
    q: "Where does Living operate?",
    a: "Living serves Ernakulam, Kochi, Kakkanad and the wider Kerala region — with luxury apartments, villas, and property management tailored to each community.",
  },
  {
    q: "Does Living help NRIs manage property in Kerala?",
    a: "Yes. Living offers a dedicated NRI concierge covering property management, legal and documentation support, maintenance, and daily assistance while you are abroad.",
  },
];

export default async function HomePage() {
  const properties = await getProperties();

  return (
    <>
      <JsonLd data={faqSchema(homeFaqs)} />

      <Hero />
      <Ecosystem />
      <Offerings />

      {/* THE LIVING PLATFORM — promoted above the listings so the technology
          reads as a core part of the ecosystem, not an afterthought. */}
      <section className="overflow-hidden bg-pine-50 py-14 md:py-20">
        <div className="shell">
          <div className="grid items-center gap-10 md:grid-cols-[1.15fr_1fr] md:gap-14">
            <Reveal>
              <Eyebrow as="h2">Community & Facility Management Platform</Eyebrow>
              <p className="mt-4 font-display font-light text-ink display-lg">
                One platform. The whole community.
              </p>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-body">
                A technology platform that brings residents, associations,
                staff, vendors and community operations together in one
                connected experience.
              </p>

              <ul className="mt-7 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {platformCapabilities.map((c) => (
                  <li
                    key={c}
                    className="flex items-start gap-2.5 text-[15px] leading-snug text-body"
                  >
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-pine-600"
                      strokeWidth={2}
                    />
                    {c}
                  </li>
                ))}
              </ul>

              <Link
                href="/platform"
                className="mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium text-pine-700 hover:text-pine-800"
              >
                Explore the platform
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Link>
            </Reveal>

            <Reveal delay={0.1}>
              <Float>
                <Phone>
                  <ResidentScreen />
                </Phone>
              </Float>
            </Reveal>
          </div>

          <Stagger className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map(([k, v]) => (
              <StaggerItem key={v}>
                <div className="h-full rounded-card border border-hairline bg-surface p-6 shadow-soft">
                  <p className="mono text-3xl text-pine-700">{k}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{v}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* FEATURED HOMES — still here, no longer the page's narrative. */}
      <section id="homes" className="bg-page py-14 md:py-20">
        <div className="shell">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl">
              <Eyebrow as="h2">Featured homes · Kochi & Ernakulam</Eyebrow>
              <p className="mt-4 font-display font-light text-ink display-lg">
                A few homes worth coming home to.
              </p>
            </div>
            <Link
              href="/services#buying"
              className="inline-flex items-center gap-1.5 text-[15px] font-medium text-pine-700 hover:text-pine-800"
            >
              View all homes
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </Reveal>

          <div className="mt-10">
            <Listings items={properties} />
          </div>
        </div>
      </section>

      <BrandStory />

      <CtaBand
        eyebrow="Talk to us"
        title="Let's make living simpler."
        body="Whether you're buying, selling, managing a property, supporting a community or exploring the Living Platform — we're here to help."
        secondaryHref="/services"
        secondaryLabel="Explore our services"
      />

      {/* Quietly-rendered GEO/answer content for AI + search engines */}
      <section className="sr-only">
        <h2>About {site.name}</h2>
        {homeFaqs.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}
      </section>
    </>
  );
}
