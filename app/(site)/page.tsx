import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Hero } from "@/components/home/hero";
import { Services } from "@/components/home/services";
import { Listings } from "@/components/property";
import { CtaBand } from "@/components/cta";
import { Reveal } from "@/components/motion";
import { Eyebrow } from "@/components/ui";
import { JsonLd, faqSchema } from "@/components/schema";
import { getProperties } from "@/lib/properties";
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

export default async function HomePage() {
  const properties = await getProperties();
  return (
    <>
      <JsonLd data={faqSchema(homeFaqs)} />
      <Hero />
      <Services />

      {/* Featured homes */}
      <section id="homes" className="bg-page section">
        <div className="shell">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl">
              <Eyebrow>Featured homes · Kochi & Ernakulam</Eyebrow>
              <h2 className="mt-5 font-display text-ink display-lg">
                Homes we would live in ourselves.
              </h2>
            </div>
            <Link
              href="/services#buying"
              className="inline-flex items-center gap-1.5 text-ui font-medium text-pine-700 hover:text-pine-800"
            >
              View all homes
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </Reveal>

          <div className="mt-10 md:mt-12">
            <Listings items={properties} />
          </div>
        </div>
      </section>

      {/* Platform teaser */}
      <section className="bg-surface section">
        <div className="shell grid items-center gap-12 md:grid-cols-2 md:gap-14">
          <Reveal>
            <Eyebrow>The platform</Eyebrow>
            <h2 className="mt-5 font-display text-ink display-lg">
              The part that starts after you move in.
            </h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-body">
              Raise a complaint, book a plumber, pay maintenance, see where the
              money went. One app for residents, vendors and the association —
              so running a building stops being somebody&rsquo;s evening job.
            </p>
            <Link
              href="/platform"
              className="mt-8 inline-flex items-center gap-1.5 text-ui font-medium text-pine-700 hover:text-pine-800"
            >
              Explore the platform
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="grid grid-cols-2 gap-4">
              {[
                ["94.2%", "Complaints closed within the promised window"],
                ["15 yrs", "Building and handing over in Kerala"],
                ["18", "NRI services, from documentation to a leaking tap"],
                ["1", "App for residents, vendors and the association"],
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
