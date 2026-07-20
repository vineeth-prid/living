import Link from "next/link";
import { ArrowUpRight, Home, KeyRound, Globe2, LayoutGrid } from "lucide-react";
import { Reveal, Stagger, StaggerItem, LiftCard } from "@/components/motion";
import { Eyebrow } from "@/components/ui";

const offerings = [
  {
    icon: Home,
    eyebrow: "Property buying",
    title: "Find a home you'll love coming back to.",
    body: "A curated collection of elevated homes across Kochi and Ernakulam — with galleries, amenities and a direct line to us.",
    href: "/services#buying",
  },
  {
    icon: KeyRound,
    eyebrow: "Sell your property",
    title: "Sell quietly, and well.",
    body: "Professional photography, honest valuation, and a discreet, managed sale — handled end to end by our experts.",
    href: "/services#selling",
  },
  {
    icon: Globe2,
    eyebrow: "NRI services",
    title: "Your home in Kerala, cared for.",
    body: "A luxury concierge for NRIs — property management, legal, maintenance and daily assistance while you're away.",
    href: "/services#nri",
  },
  {
    icon: LayoutGrid,
    eyebrow: "The platform",
    title: "A calm home to manage.",
    body: "One elegant platform for residents, vendors and associations — facility management, community and home services.",
    href: "/platform",
  },
];

export function Offerings() {
  return (
    <section className="bg-surface py-16 md:py-24">
      <div className="shell">
        <Reveal className="max-w-2xl">
          <Eyebrow>What we do</Eyebrow>
          <h2 className="mt-5 font-display font-light text-ink display-lg">
            Everything a home needs, in one considered place.
          </h2>
        </Reveal>

        <Stagger className="mt-12 grid gap-6 md:grid-cols-2">
          {offerings.map((o) => (
            <StaggerItem key={o.href}>
              <LiftCard className="h-full">
                <Link
                  href={o.href}
                  className="group flex h-full flex-col rounded-card border border-hairline bg-page p-8 shadow-soft transition-shadow duration-300 hover:shadow-lift md:p-10"
                >
                  <o.icon
                    className="h-7 w-7 text-pine-600"
                    strokeWidth={1.5}
                  />
                  <p className="eyebrow mt-6">{o.eyebrow}</p>
                  <h3 className="mt-3 font-display text-2xl text-ink md:text-3xl">
                    {o.title}
                  </h3>
                  <p className="mt-4 flex-1 leading-relaxed text-body">
                    {o.body}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-medium text-pine-700">
                    Learn more
                    <ArrowUpRight
                      className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      strokeWidth={1.75}
                    />
                  </span>
                </Link>
              </LiftCard>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
