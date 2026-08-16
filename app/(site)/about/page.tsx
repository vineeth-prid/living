import type { Metadata } from "next";
import { Compass, Eye, Heart, Sparkles, Leaf, HandHeart, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { CtaBand } from "@/components/cta";
import { Reveal, Stagger, StaggerItem, ZoomImage } from "@/components/motion";
import { Eyebrow } from "@/components/ui";
import { JsonLd, breadcrumb } from "@/components/schema";
import { img } from "@/lib/images";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About Living — a premium property brand by ITR Group, Kerala",
  description:
    "Living is a premium property and living brand by ITR Group, built on fifteen years of trust in Kerala. Our mission, values, legacy and vision for modern living in Kochi.",
  alternates: { canonical: "/about" },
};

const timeline = [
  {
    year: "2009",
    title: "ITR Group is founded",
    body: "A small Kerala team with a simple belief — do good work, keep your word, and treat every home as if it were your own.",
  },
  {
    year: "2009 – 2024",
    title: "Fifteen years of trust",
    body: "Across property, construction and services, ITR Group grows by reputation — one satisfied family, one community, at a time.",
  },
  {
    year: "2024",
    title: "Living is born",
    body: "Everything ITR Group learned about homes, gathered into one premium brand — calm, warm, and effortless.",
  },
  {
    year: "Today",
    title: "One ecosystem for home",
    body: "Property sales, NRI concierge, and a complete community platform — across Ernakulam, Kochi and Kerala.",
  },
];

const values = [
  { icon: Leaf, title: "Calm", body: "We remove noise, not add it. Simplicity is our highest form of luxury." },
  { icon: Heart, title: "Warmth", body: "Every interaction is human first — considerate, patient, never transactional." },
  { icon: Sparkles, title: "Refinement", body: "Details are not decoration. They are how trust is quietly earned." },
  { icon: HandHeart, title: "Care", body: "We treat your home, your family and your time as if they were our own." },
];

const leadership = [
  { role: "Managing Director", note: "Setting the direction and holding the standard." },
  { role: "Head of Property", note: "Sales, valuation, and the homes we choose to represent." },
  { role: "Head of Platform", note: "The technology that keeps communities calm." },
  { role: "Head of NRI Concierge", note: "Care for homes and families from afar." },
];

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={breadcrumb([
          { name: "Home", path: "/" },
          { name: "About Living", path: "/about" },
        ])}
      />

      <PageHeader
        eyebrow="About Living"
        title="Fifteen years of trust, gathered into one home."
        intro="Living is a premium property and living brand by ITR Group — everything we've learned about homes in Kerala, made calm, warm and effortless."
        image={img.legacy}
        imageAlt="A warm, established Kerala home framed by greenery"
      />

      {/* MISSION / VISION */}
      <section className="bg-page section">
        <div className="shell grid gap-8 md:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-hero border border-hairline bg-surface p-10 shadow-soft md:p-12">
              <Compass className="h-8 w-8 text-pine-600" strokeWidth={1.4} />
              <p className="eyebrow mt-6">Our mission</p>
              <h2 className="mt-4 font-display text-3xl text-ink md:text-4xl">
                To make the whole of home life feel effortless.
              </h2>
              <p className="mt-5 leading-relaxed text-body">
                From finding a home to living well inside it, we bring the
                fragmented, anxious parts of property into one calm, considered
                experience — so you can simply live.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="h-full rounded-hero border border-hairline bg-surface p-10 shadow-soft md:p-12">
              <Eye className="h-8 w-8 text-pine-600" strokeWidth={1.4} />
              <p className="eyebrow mt-6">Our vision</p>
              <h2 className="mt-4 font-display text-3xl text-ink md:text-4xl">
                The most trusted name in living, in Kerala and beyond.
              </h2>
              <p className="mt-5 leading-relaxed text-body">
                A brand people hand their home to without a second thought —
                because everything we touch feels premium, honest and quietly
                well-run.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* TIMELINE / LEGACY */}
      <section className="overflow-hidden bg-surface section">
        <div className="shell">
          <Reveal className="max-w-2xl">
            <Eyebrow>The legacy</Eyebrow>
            <h2 className="mt-5 font-display text-ink display-lg">
              A story fifteen years in the making.
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-12 md:grid-cols-[1fr_1.1fr] md:items-center md:gap-14">
            <Stagger className="relative">
              <span className="absolute left-[7px] top-2 bottom-2 w-px bg-hairline md:left-[7px]" />
              {timeline.map((t) => (
                <StaggerItem key={t.title}>
                  <div className="relative flex gap-6 pb-10 last:pb-0">
                    <span className="relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-clay-500 bg-page" />
                    <div>
                      <p className="mono text-sm text-clay-600">{t.year}</p>
                      <h3 className="mt-1 font-display text-2xl text-ink">
                        {t.title}
                      </h3>
                      <p className="mt-2 max-w-md leading-relaxed text-muted">
                        {t.body}
                      </p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
            <Reveal delay={0.1}>
              <ZoomImage
                src={img.city}
                alt="The Kochi skyline and backwaters at golden hour"
                className="aspect-[4/5] w-full rounded-media shadow-lift"
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* VALUES */}
      <section className="bg-page section">
        <div className="shell">
          <Reveal className="max-w-2xl">
            <Eyebrow>Our values</Eyebrow>
            <h2 className="mt-5 font-display text-ink display-lg">
              What we hold to, on every home.
            </h2>
          </Reveal>
          <Stagger className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v) => (
              <StaggerItem key={v.title}>
                <div className="h-full rounded-card border border-hairline bg-surface p-8 shadow-soft">
                  <v.icon className="h-7 w-7 text-clay-500" strokeWidth={1.5} />
                  <h3 className="mt-5 font-display text-2xl text-ink">
                    {v.title}
                  </h3>
                  <p className="mt-2 leading-relaxed text-muted">{v.body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* LEADERSHIP */}
      <section className="bg-surface section">
        <div className="shell">
          <Reveal className="max-w-2xl">
            <Eyebrow>Leadership</Eyebrow>
            <h2 className="mt-5 font-display text-ink display-lg">
              The people behind Living.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-body">
              A close team from ITR Group, each looking after one part of your
              experience. Full profiles are available on request.
            </p>
          </Reveal>
          <Stagger className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {leadership.map((l) => (
              <StaggerItem key={l.role}>
                <div className="h-full rounded-card border border-hairline bg-page p-8 shadow-soft">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pine-50">
                    <ShieldCheck className="h-6 w-6 text-pine-600" strokeWidth={1.4} />
                  </div>
                  <h3 className="mt-5 font-display text-xl text-ink">
                    {l.role}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {l.note}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* WHY LIVING + FUTURE VISION */}
      <section className="bg-pine-50 section">
        <div className="shell grid gap-12 md:grid-cols-2">
          <Reveal>
            <Eyebrow>Why Living</Eyebrow>
            <h2 className="mt-5 font-display text-ink display-lg">
              Because home deserves better than fragments.
            </h2>
            <p className="mt-6 leading-relaxed text-body">
              You shouldn't need five apps, three brokers and a folder of
              paperwork to live well. Living brings it together with the calm and
              polish of a brand that genuinely cares — and the backing of fifteen
              years of ITR Group trust.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <Eyebrow>Future vision</Eyebrow>
            <h2 className="mt-5 font-display text-ink display-lg">
              A single, intelligent home for living.
            </h2>
            <p className="mt-6 leading-relaxed text-body">
              We're building toward a future where an assistant understands your
              home, communities run themselves quietly, and everything from a
              first viewing to a decade of living feels like one seamless,
              premium experience.
            </p>
          </Reveal>
        </div>
      </section>

      <CtaBand
        eyebrow="Come say hello"
        title="We'd love to show you what Living feels like."
      />

      <section className="sr-only">
        <h2>About {site.name} by {site.parent}</h2>
        <p>{metadata.description as string}</p>
      </section>
    </>
  );
}
