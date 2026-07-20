import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Hero } from "@/components/home/hero";
import { BrandStory } from "@/components/home/story";
import { Offerings } from "@/components/home/offerings";
import { Listings } from "@/components/property";
import { CtaBand } from "@/components/cta";
import { Reveal } from "@/components/motion";
import { Eyebrow } from "@/components/ui";
import { JsonLd, faqSchema } from "@/components/schema";
import { properties } from "@/lib/properties";
import { site } from "@/lib/site";

const homeFaqs = [
  {
    q: "What is Living?",
    a: "Living is a premium property and living brand by ITR Group, based in Kakkanad, Ernakulam. It brings together property sales, NRI concierge services, and a complete community and facility management platform across Kochi and Kerala.",
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

export default function HomePage() {
  return (
    <>
      <JsonLd data={faqSchema(homeFaqs)} />
      <Hero />
      <BrandStory />
      <Offerings />

      {/* Featured homes */}
      <section id="homes" className="bg-page py-16 md:py-24">
        <div className="shell">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl">
              <Eyebrow>Featured homes · Kochi & Ernakulam</Eyebrow>
              <h2 className="mt-5 font-display font-light text-ink display-lg">
                A few homes worth coming home to.
              </h2>
            </div>
            <Link
              href="/services#buying"
              className="inline-flex items-center gap-1.5 text-[15px] font-medium text-pine-700 hover:text-pine-800"
            >
              View all homes
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </Reveal>

          <div className="mt-14">
            <Listings items={properties} />
          </div>
        </div>
      </section>

      {/* Platform teaser */}
      <section className="bg-surface py-16 md:py-24">
        <div className="shell grid items-center gap-12 md:grid-cols-2 md:gap-14">
          <Reveal>
            <Eyebrow>The platform</Eyebrow>
            <h2 className="mt-5 font-display font-light text-ink display-lg">
              A calm home to manage.
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-body">
              Beyond the sale, Living runs the everyday — one refined platform
              for residents, vendors and associations. Facility management,
              complaints, home services and community, all in their place.
            </p>
            <Link
              href="/platform"
              className="mt-8 inline-flex items-center gap-1.5 text-[15px] font-medium text-pine-700 hover:text-pine-800"
            >
              Explore the platform
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="grid grid-cols-2 gap-4">
              {[
                ["94.2%", "Complaints resolved on time"],
                ["15 yrs", "Of ITR Group trust"],
                ["24/7", "Concierge for residents"],
                ["1 app", "For the whole community"],
              ].map(([k, v]) => (
                <div
                  key={v}
                  className="rounded-card border border-hairline bg-page p-6 shadow-soft"
                >
                  <p className="mono text-3xl text-pine-700">{k}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{v}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <CtaBand />

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
