/**
 * What a listing card says about a property, derived from whatever the
 * database actually holds.
 *
 * Two rules run through all of this:
 *
 *  1. Nothing is invented. Every attribute here maps to a real column, and a
 *     column with no value produces no attribute — never "Facing: —".
 *  2. Land and building are decided from the data, not from a string match on
 *     `type`, which is free text an admin types ("3 & 4 BHK residences").
 */
import type { AreaUnit, Property } from "./properties";
import { formatIndianPropertyPrice } from "./money";

export type PropertyCategory = "LAND" | "BUILDING" | "OTHER";

/**
 * `hasBuilding` is the column the admin form already sets when a listing is
 * plot-only, and `commercialKind` says the same thing for commercial rows.
 * Either one is enough; neither being readable means we say OTHER rather than
 * guess, and the card falls back to the fields every listing has.
 */
export function getPropertyCategory(property: Property): PropertyCategory {
  if (property.commercialKind === "land") return "LAND";
  if (property.hasBuilding === false) return "LAND";
  if (property.hasBuilding === true) return "BUILDING";
  return "OTHER";
}

// How many cent one of each unit is. Kerala land is priced per cent, so cent
// is the hub every other unit converts through: one acre is a hundred of them,
// one cent is 435.6 sq ft.
const CENTS_PER: Record<AreaUnit, number> = {
  cent: 1,
  acre: 100,
  sqft: 1 / 435.6,
  sqm: 1 / 40.4685642,
};

const UNIT_LABEL: Record<AreaUnit, string> = {
  cent: "Cent",
  acre: "Acre",
  sqft: "Sq Ft",
  sqm: "Sq M",
};

/** A real, usable measurement — not null, not NaN, not zero, never negative. */
const measured = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** Text that carries meaning. Whitespace-only is as empty as null. */
const written = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

/** Indian grouping, at most two decimals, no trailing zeros: 2400 → "2,400". */
const number = (value: number) =>
  Number(value.toFixed(2)).toLocaleString("en-IN");

export const areaLabel = (
  value: number | null | undefined,
  unit: AreaUnit | null | undefined,
): string | null =>
  measured(value) && unit && UNIT_LABEL[unit]
    ? `${number(value)} ${UNIT_LABEL[unit]}`
    : null;

/** The land area expressed in cent, or null when it cannot be. */
export function landAreaInCent(property: Property): number | null {
  const { landArea, landAreaUnit } = property;
  if (!measured(landArea) || !landAreaUnit) return null;
  const cents = CENTS_PER[landAreaUnit];
  return cents ? landArea * cents : null;
}

/**
 * The rupees-per-cent rate, or null.
 *
 * Only for land, only from the public asking price (`priceValue` — the
 * internal `finalPrice` is not in the public projection at all), and only when
 * the area converts. Anything else returns null so the card omits the line
 * rather than printing "₹NaN / Cent".
 */
export function perCentRate(property: Property): number | null {
  if (getPropertyCategory(property) !== "LAND") return null;
  const cents = landAreaInCent(property);
  if (!measured(cents) || !measured(property.priceValue)) return null;
  const rate = property.priceValue / cents;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** "₹12.5 L / Cent", or null. Same formatter as the headline price. */
export function perCentRateLabel(property: Property): string | null {
  const rate = perCentRate(property);
  if (rate === null) return null;
  const label = formatIndianPropertyPrice(Math.round(rate));
  return label ? `${label} / Cent` : null;
}

/** The headline price, from the stored number. The label is only a fallback. */
export function priceLabel(property: Property): string {
  return (
    formatIndianPropertyPrice(property.priceValue) ||
    property.priceLabel?.trim() ||
    "Price on request"
  );
}

export type AttributeKey =
  | "landArea"
  | "roadAccess"
  | "facing"
  | "builtUpArea"
  | "beds"
  | "baths"
  | "units"
  | "balconies"
  | "propertyAge";

export type PropertyAttribute = { key: AttributeKey; label: string };

/**
 * The attributes a card can show, most useful first, already filtered to the
 * ones this property actually has.
 *
 * Counts use `> 0` rather than a truthiness test on purpose: a zero-bedroom
 * listing has nothing to say about bedrooms, so "0 Beds" is noise, while a
 * zero-length string and a null are both simply absent. Callers slice this to
 * whatever the layout affords — cards stay compact, detail views can take more.
 */
export function propertyAttributes(property: Property): PropertyAttribute[] {
  const out: PropertyAttribute[] = [];
  const add = (key: AttributeKey, label: string | null) => {
    if (label) out.push({ key, label });
  };
  const category = getPropertyCategory(property);

  if (category === "LAND") {
    add("landArea", areaLabel(property.landArea, property.landAreaUnit));
    if (written(property.roadAccess))
      add("roadAccess", `Road access: ${property.roadAccess.trim()}`);
    if (written(property.facing))
      add("facing", `Facing: ${property.facing.trim()}`);
    return out;
  }

  // Building, and the OTHER fallback — which shows only what every listing
  // carries, so an unclassifiable row still reads as a property.
  add(
    "builtUpArea",
    areaLabel(property.builtUpArea, property.builtUpAreaUnit) ??
      (written(property.area) ? property.area.trim() : null),
  );
  if (measured(property.beds)) add("beds", `${property.beds} Beds`);
  if (measured(property.baths)) add("baths", `${property.baths} Baths`);

  if (category === "BUILDING") {
    if (measured(property.units)) add("units", `${property.units} Units`);
    if (measured(property.balconies))
      add("balconies", `${property.balconies} Balconies`);
    if (written(property.propertyAge))
      add("propertyAge", property.propertyAge.trim());
  }
  return out;
}
