import {
  Home,
  KeyRound,
  Globe2,
  Wrench,
  Building2,
  LayoutGrid,
} from "lucide-react";

// One source of truth for the service taxonomy. The nav dropdown, the homepage
// services grid and the /services hub all read from here, so a service can
// never appear in one place and go missing in another.
//
// Services live as anchored sections on /services rather than separate routes —
// it keeps every existing URL working and avoids five near-empty pages.
export type Service = {
  key: string;
  label: string;
  href: string;
  blurb: string;
  icon: typeof Home;
};

export const services: Service[] = [
  {
    key: "buying",
    label: "Buy a Property",
    href: "/services#buying",
    blurb:
      "Curated homes across Kochi and Ernakulam, with viewings, evaluation and documentation handled for you.",
    icon: Home,
  },
  {
    key: "selling",
    label: "Sell a Property",
    href: "/services#selling",
    blurb:
      "A managed sale end to end — valuation, photography, marketing, buyer management and closing.",
    icon: KeyRound,
  },
  {
    key: "nri",
    label: "NRI Concierge",
    href: "/services#nri",
    blurb:
      "Local support for your home, paperwork and family in Kerala while you are abroad.",
    icon: Globe2,
  },
  {
    key: "property-care",
    label: "Property Management",
    href: "/services#property-care",
    blurb:
      "Inspections, preventive maintenance, repairs, utilities and reporting, year round.",
    icon: Wrench,
  },
  {
    key: "community",
    label: "Community & Facility Management",
    href: "/services#community",
    blurb:
      "Facilities, work orders, vendors, workforce and resident services for apartment communities.",
    icon: Building2,
  },
  {
    key: "platform",
    label: "Living Platform",
    href: "/platform",
    blurb:
      "The technology connecting residents, associations, staff and vendors in one place.",
    icon: LayoutGrid,
  },
];

export const serviceByKey = (key: string) =>
  services.find((s) => s.key === key)!;

// Column grouping for the nav dropdown. Keys reference `services` above so the
// two can't drift.
export const serviceGroups = [
  { label: "Property", keys: ["buying", "selling"] },
  { label: "Property & NRI care", keys: ["nri", "property-care"] },
  { label: "Community & technology", keys: ["community", "platform"] },
] as const;

// The four pillars used by the homepage ecosystem index. Plain text, no cards —
// the point is to make the business model scannable in seconds.
export const ecosystem = [
  {
    label: "Property",
    items: ["Buy a property", "Sell a property", "Curated listings"],
    href: "/services#buying",
  },
  {
    label: "Property & NRI care",
    items: ["NRI concierge", "Property management", "Home & maintenance"],
    href: "/services#nri",
  },
  {
    label: "Community",
    items: ["Community management", "Facility management", "Resident services"],
    href: "/services#community",
  },
  {
    label: "Technology",
    items: ["Living Platform", "Resident app", "Vendor & workforce tools"],
    href: "/platform",
  },
] as const;
