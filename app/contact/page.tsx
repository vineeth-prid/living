import type { Metadata } from "next";
import { Phone, Mail, MapPin, Clock, MessageCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ContactForm } from "@/components/contact-form";
import { Reveal } from "@/components/motion";
import { Eyebrow } from "@/components/ui";
import { JsonLd, breadcrumb } from "@/components/schema";
import { img } from "@/lib/images";
import { site, pageMeta, telLink, mailLink, waLink } from "@/lib/site";

export const metadata: Metadata = pageMeta(
  "Contact — Kakkanad, Ernakulam",
  "Talk to Living. Call 8089 00 55 00, WhatsApp us, or visit our Kakkanad head office in Ernakulam, Kerala. Property, NRI services and platform.",
  "/contact",
);

const cards = [
  { icon: Phone, label: "Call us", value: site.phone, href: telLink, mono: true },
  { icon: Mail, label: "Email", value: site.email, href: mailLink },
  { icon: MessageCircle, label: "WhatsApp", value: "Message us anytime", href: waLink(), external: true },
  { icon: Clock, label: "Hours", value: site.hours },
];

export default function ContactPage() {
  return (
    <>
      <JsonLd
        data={breadcrumb([
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact" },
        ])}
      />

      <PageHeader
        eyebrow="Contact Living — Kakkanad, Ernakulam"
        title="Let's talk about home."
        intro="Whether you're buying, selling, living, or just curious — we'd love to hear from you. No pressure, no scripts."
        image={img.office}
        imageAlt="A warm, light-filled reception space at the Living office in Kakkanad"
      />

      <section className="bg-page py-14 md:py-20">
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
          {/* Left — details */}
          <div>
            <Reveal>
              <Eyebrow as="h2">Talk to Living in Kakkanad, Ernakulam</Eyebrow>
              <p className="mt-5 font-display font-light text-ink display-lg">
                We're a call away.
              </p>
              <p className="mt-6 max-w-md text-lg leading-relaxed text-body">
                Reach us however suits you. Our team in Kakkanad replies within
                one business day — usually much sooner.
              </p>
            </Reveal>

            <Reveal delay={0.1} className="mt-10 grid gap-4 sm:grid-cols-2">
              {cards.map((c) => {
                const inner = (
                  <>
                    <c.icon className="h-6 w-6 text-pine-600" strokeWidth={1.5} />
                    <p className="eyebrow mt-4">{c.label}</p>
                    <p className={`mt-1 text-ink ${c.mono ? "mono text-lg" : ""}`}>
                      {c.value}
                    </p>
                  </>
                );
                return c.href ? (
                  <a
                    key={c.label}
                    href={c.href}
                    target={c.external ? "_blank" : undefined}
                    rel={c.external ? "noopener noreferrer" : undefined}
                    className="rounded-card border border-hairline bg-surface p-6 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
                  >
                    {inner}
                  </a>
                ) : (
                  <div key={c.label} className="rounded-card border border-hairline bg-surface p-6 shadow-soft">
                    {inner}
                  </div>
                );
              })}
            </Reveal>

            <Reveal delay={0.15} className="mt-8">
              <div className="flex items-start gap-3 rounded-card border border-hairline bg-surface p-6 shadow-soft">
                <MapPin className="mt-0.5 h-6 w-6 shrink-0 text-pine-600" strokeWidth={1.5} />
                <div>
                  <p className="eyebrow">Visit us</p>
                  <p className="mt-1 text-ink">
                    {site.address.line}
                    <br />
                    {site.address.city}, {site.address.region}
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Map */}
            <Reveal delay={0.2} className="mt-6">
              <div className="overflow-hidden rounded-media border border-hairline shadow-soft">
                <iframe
                  title="Living head office, Kakkanad, Ernakulam"
                  src="https://maps.google.com/maps?q=Kakkanad%2C%20Ernakulam%2C%20Kerala&t=&z=13&ie=UTF8&iwloc=&output=embed"
                  className="h-[320px] w-full grayscale-[0.15]"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </Reveal>
          </div>

          {/* Right — form */}
          <Reveal delay={0.1}>
            <ContactForm />
          </Reveal>
        </div>
      </section>
    </>
  );
}
