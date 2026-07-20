import Link from "next/link";
import { Phone, Mail, MapPin, MessageCircle } from "lucide-react";
import { site, nav, telLink, mailLink, waLink } from "@/lib/site";
import { Logo } from "./ui";

export function SiteFooter() {
  return (
    <footer className="bg-pine-900 text-stone-300">
      <div className="shell py-20">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo tone="ivory" className="h-11" />
            <p className="mt-6 max-w-sm font-display text-2xl leading-snug text-stone-100">
              Life happens here.
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-stone-400">
              A premium property and living ecosystem by {site.parent}, built
              across Ernakulam, Kochi and Kerala.
            </p>
          </div>

          <div>
            <p className="eyebrow text-clay-400">Explore</p>
            <ul className="mt-5 space-y-3">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-stone-300 transition-colors hover:text-stone-50"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="eyebrow text-clay-400">Talk to us</p>
            <ul className="mt-5 space-y-4 text-sm">
              <li>
                <a href={telLink} className="flex items-start gap-3 hover:text-stone-50">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-pine-300" strokeWidth={1.6} />
                  <span className="mono">{site.phone}</span>
                </a>
              </li>
              <li>
                <a href={mailLink} className="flex items-start gap-3 hover:text-stone-50">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-pine-300" strokeWidth={1.6} />
                  {site.email}
                </a>
              </li>
              <li>
                <a href={waLink()} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 hover:text-stone-50">
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-pine-300" strokeWidth={1.6} />
                  WhatsApp us
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pine-300" strokeWidth={1.6} />
                <span>
                  {site.address.line}
                  <br />
                  {site.address.city}, {site.address.region}
                </span>
              </li>
              <li className="pt-1 text-stone-400">{site.hours}</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-pine-700 pt-8 text-xs text-stone-400 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {site.legalName}. A subsidiary of{" "}
            {site.parent}.
          </p>
          <p>Property sales · NRI concierge · Community platform · Kerala</p>
        </div>
      </div>
    </footer>
  );
}
