import { Phone, MessageCircle } from "lucide-react";
import { Reveal } from "./motion";
import { Eyebrow } from "./ui";
import { site, telLink, waLink } from "@/lib/site";

export function CtaBand({
  eyebrow = "Talk to us",
  title = "Let's find where your life happens.",
  body = "A short, unhurried conversation with a Living property expert — no pressure, no jargon.",
  message,
}: {
  eyebrow?: string;
  title?: string;
  body?: string;
  message?: string;
}) {
  const btn =
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] px-6 py-3 text-[15px] font-medium transition-all duration-200 ease-[var(--ease-calm)] active:scale-[0.98]";
  return (
    <section className="bg-pine-700">
      <div className="shell py-16 md:py-24">
        <Reveal className="max-w-2xl">
          <Eyebrow>
            <span className="text-clay-300">{eyebrow}</span>
          </Eyebrow>
          <h2 className="mt-5 font-display font-light text-stone-50 display-xl">
            {title}
          </h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-pine-100">
            {body}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a
              href={telLink}
              className={`${btn} bg-clay-500 text-pine-950 hover:bg-clay-400 hover:-translate-y-0.5 shadow-soft`}
            >
              <Phone className="h-4 w-4" strokeWidth={1.75} />
              {site.phone}
            </a>
            <a
              href={waLink(message)}
              target="_blank"
              rel="noopener noreferrer"
              className={`${btn} border border-stone-50/40 text-stone-50 hover:border-stone-50`}
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
              WhatsApp
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
