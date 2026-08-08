import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Reveal, Stagger, StaggerItem, LiftCard } from "@/components/motion";
import { Eyebrow } from "@/components/ui";
import { services } from "@/lib/services";

// Card treatment unchanged from the original "What we do" grid — only the
// content and count changed, and the data now comes from lib/services.
export function Offerings() {
  return (
    <section className="bg-surface py-14 md:py-20">
      <div className="shell">
        <Reveal className="max-w-2xl">
          <Eyebrow as="h2">Property Services in Kochi & Ernakulam</Eyebrow>
          <p className="mt-4 font-display font-light text-ink display-lg">
            Our services.
          </p>
          <p className="mt-5 text-lg leading-relaxed text-body">
            Five services covering the whole of property and community life —
            each handled by a dedicated Living team.
          </p>
        </Reveal>

        <Stagger className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {services
            .filter((s) => s.key !== "platform")
            .map((s) => (
              <StaggerItem key={s.key}>
                <LiftCard className="h-full">
                  <Link
                    href={s.href}
                    className="group flex h-full flex-col rounded-card border border-hairline bg-page p-8 shadow-soft transition-shadow duration-300 hover:shadow-lift"
                  >
                    <s.icon className="h-7 w-7 text-pine-600" strokeWidth={1.5} />
                    <h3 className="mt-5 font-display text-2xl text-ink">
                      {s.label}
                    </h3>
                    <p className="mt-3 flex-1 leading-relaxed text-body">
                      {s.blurb}
                    </p>
                    <span className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-medium text-pine-700">
                      Explore service
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
