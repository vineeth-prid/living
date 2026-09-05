"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  MapPin,
  BedDouble,
  Bath,
  Maximize,
  Check,
  ArrowRight,
  Route,
  Compass,
  Building2,
  Wind,
  CalendarDays,
} from "lucide-react";
import Image from "next/image";
import type { Property } from "@/lib/properties";
import {
  perCentRateLabel,
  priceLabel,
  propertyAttributes,
  type AttributeKey,
} from "@/lib/property-attributes";
import { Button, ContactActions } from "./ui";
import { Stagger, StaggerItem, LiftCard } from "./motion";

const EASE = [0.22, 0.61, 0.36, 1] as const;

const ATTRIBUTE_ICON: Record<AttributeKey, typeof BedDouble> = {
  landArea: Maximize,
  roadAccess: Route,
  facing: Compass,
  builtUpArea: Maximize,
  beds: BedDouble,
  baths: Bath,
  units: Building2,
  balconies: Wind,
  propertyAge: CalendarDays,
};

/**
 * Whatever this property actually has, in one row.
 *
 * Land and building listings carry different columns, so the set is derived
 * (lib/property-attributes) rather than written out as conditional JSX per
 * field — a new column becomes one new entry there and every card that renders
 * this picks it up. "limit" is how a compact card and a roomier one share the
 * component instead of forking it.
 */
export function PropertyAttributes({
  property,
  limit,
}: {
  property: Property;
  limit?: number;
}) {
  const all = propertyAttributes(property);
  const shown = limit ? all.slice(0, limit) : all;
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {shown.map(({ key, label }) => {
        const Icon = ATTRIBUTE_ICON[key];
        return (
          <span
            key={key}
            className="inline-flex items-center gap-1.5 text-sm text-body"
          >
            <Icon className="h-4 w-4 shrink-0 text-stone-500" strokeWidth={1.6} />
            {label}
          </span>
        );
      })}
    </div>
  );
}

export function PropertyCard({
  property,
  onOpen,
}: {
  property: Property;
  onOpen: () => void;
}) {
  // Land only, and only when the area converts — otherwise the line is absent
  // rather than blank.
  const rate = perCentRateLabel(property);
  return (
    <LiftCard className="h-full">
      <button
        onClick={onOpen}
        className="group flex h-full w-full flex-col overflow-hidden rounded-media border border-hairline bg-surface text-left shadow-soft transition-shadow duration-300 hover:shadow-float"
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          <Image
            src={property.gallery[0]}
            alt={`${property.name} — ${property.type} in ${property.locality}, ${property.city}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-[900ms] ease-[var(--ease-calm)] group-hover:scale-105"
          />
          <span className="absolute left-4 top-4 rounded-full bg-stone-50/90 px-3 py-1 text-xs font-medium text-pine-800 backdrop-blur">
            {property.status}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-6">
          <div className="flex items-center gap-1.5 text-sm text-muted">
            <MapPin className="h-3.5 w-3.5" strokeWidth={1.6} />
            {property.locality}, {property.city}
          </div>
          <h3 className="mt-2 font-display text-2xl text-ink">{property.name}</h3>
          <p className="mt-1 text-sm text-muted">{property.type}</p>
          <div className="mt-5">
            {/* Four is what fits on one card at 320px without a second row. */}
            <PropertyAttributes property={property} limit={4} />
          </div>
          <div className="mt-6 flex items-end justify-between gap-3 border-t border-hairline pt-5">
            <span>
              <span className="mono block text-xl text-ink">
                {priceLabel(property)}
              </span>
              {rate && (
                <span className="mono mt-0.5 block text-xs text-muted">
                  {rate}
                </span>
              )}
            </span>
            <span className="shrink-0 text-sm font-medium text-pine-700 transition-colors group-hover:text-clay-600">
              View home →
            </span>
          </div>
        </div>
      </button>
    </LiftCard>
  );
}

function Gallery({ property }: { property: Property }) {
  const [i, setI] = useState(0);
  const n = property.gallery.length;
  const go = useCallback(
    (d: number) => setI((v) => (v + d + n) % n),
    [n],
  );
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-media bg-stone-100">
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <Image
            src={property.gallery[i]}
            alt={`${property.name} — view ${i + 1}`}
            fill
            sizes="(max-width: 896px) 100vw, 896px"
            className="object-cover"
          />
        </motion.div>
      </AnimatePresence>
      <button
        onClick={() => go(-1)}
        aria-label="Previous photo"
        className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-stone-50/85 text-ink backdrop-blur transition hover:bg-stone-50"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        onClick={() => go(1)}
        aria-label="Next photo"
        className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-stone-50/85 text-ink backdrop-blur transition hover:bg-stone-50"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
        {property.gallery.map((_, idx) => (
          <span
            key={idx}
            className={`h-1.5 rounded-full transition-all ${
              idx === i ? "w-5 bg-stone-50" : "w-1.5 bg-stone-50/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function PropertyDialog({
  property,
  onClose,
}: {
  property: Property;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const rate = perCentRateLabel(property);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const enquiry = `Hello Living, I'd like to know more about ${property.name} (${property.type}) in ${property.locality}.`;

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-stone-950/50 p-4 backdrop-blur-sm md:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={property.name}
        onClick={(e) => e.stopPropagation()}
        className="relative my-auto w-full max-w-4xl rounded-hero bg-page p-5 shadow-float md:p-8"
        initial={reduce ? false : { opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-stone-50 text-ink shadow-soft transition hover:bg-stone-100"
        >
          <X className="h-5 w-5" />
        </button>

        <Gallery property={property} />

        <div className="mt-7 grid gap-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="flex items-center gap-1.5 text-sm text-muted">
              <MapPin className="h-4 w-4" strokeWidth={1.6} />
              {property.locality}, {property.city}
            </div>
            <h2 className="mt-2 font-display text-4xl text-ink">
              {property.name}
            </h2>
            <p className="mt-3 text-lg leading-relaxed text-body">
              {property.summary}
            </p>

            <h3 className="mt-8 eyebrow">Property details</h3>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
              {property.details.map((d) => (
                <div key={d.label}>
                  <dt className="text-xs text-muted">{d.label}</dt>
                  <dd className="mt-0.5 text-ui text-ink">{d.value}</dd>
                </div>
              ))}
            </dl>

            <h3 className="mt-8 eyebrow">Amenities</h3>
            <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {property.amenities.map((a) => (
                <li key={a} className="flex items-center gap-2.5 text-ui text-body">
                  <Check className="h-4 w-4 shrink-0 text-pine-500" strokeWidth={2} />
                  {a}
                </li>
              ))}
            </ul>
          </div>

          {/* Enquiry rail */}
          <div className="md:sticky md:top-4 md:self-start">
            <div className="rounded-card border border-hairline bg-surface p-6 shadow-soft">
              <p className="text-sm text-muted">Guide price</p>
              <p className="mono mt-1 text-3xl text-ink">
                {priceLabel(property)}
              </p>
              {rate && <p className="mono mt-1 text-sm text-muted">{rate}</p>}
              <p className="mt-1 text-sm text-muted">{property.area}</p>
              <div className="mt-6 flex flex-col gap-3">
                <ContactActions message={enquiry} />
                {/* The only route from the site into the full listing page,
                    whose enquiry form creates a CRM lead already attached to
                    this property. Without it the page is reachable only from
                    the sitemap. */}
                <Button href={`/homes/${property.id}`} variant="ghost">
                  View full details &amp; enquire
                  <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted">
                Speak directly with a Living property expert. No pressure — just
                a considered conversation.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function Listings({ items }: { items: Property[] }) {
  const [active, setActive] = useState<Property | null>(null);
  return (
    <>
      <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <StaggerItem key={p.id} className="h-full">
            <PropertyCard property={p} onOpen={() => setActive(p)} />
          </StaggerItem>
        ))}
      </Stagger>
      <AnimatePresence>
        {active && (
          <PropertyDialog property={active} onClose={() => setActive(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
