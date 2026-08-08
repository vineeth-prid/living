import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Eyebrow } from "@/components/ui";
import { ecosystem } from "@/lib/services";

// Deliberately typographic rather than another card grid — this is an index of
// what Living covers, and it should read in seconds. Columns are divided by the
// same hairline used across the site.
export function Ecosystem() {
  return (
    <section className="bg-page py-14 md:py-20">
      <div className="shell">
        <Reveal className="max-w-2xl">
          <Eyebrow as="h2">One ecosystem for home</Eyebrow>
          <p className="mt-4 font-display font-light text-ink display-lg">
            Everything for living, in one place.
          </p>
          <p className="mt-5 text-lg leading-relaxed text-body">
            Living brings together the services, expertise and technology
            required across the property and living journey — from finding a
            home to running the community around it.
          </p>
        </Reveal>

        <Stagger className="mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
          {ecosystem.map((pillar) => (
            <StaggerItem key={pillar.label}>
              <Link
                href={pillar.href}
                className="group block border-t border-hairline pt-5 transition-colors hover:border-clay-400"
              >
                <span className="flex items-center justify-between">
                  <span className="font-display text-2xl text-ink">
                    {pillar.label}
                  </span>
                  <ArrowUpRight
                    className="h-4 w-4 text-pine-600 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    strokeWidth={1.75}
                  />
                </span>
                <ul className="mt-4 space-y-2">
                  {pillar.items.map((item) => (
                    <li key={item} className="text-[15px] leading-snug text-body">
                      {item}
                    </li>
                  ))}
                </ul>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
