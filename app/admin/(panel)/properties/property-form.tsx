"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Check } from "lucide-react";
import {
  Button,
  Card,
  ErrorText,
  Field,
  cx,
  inputClass,
} from "@/components/admin/ui";
import type { ActionResult } from "@/lib/auth/dal";

export type PropertyFormValues = Record<string, string | boolean | string[] | null>;

const STEPS = [
  "Basics",
  "Location",
  "Land & building",
  "Financial",
  "SEO",
] as const;

const AREA_UNIT_OPTIONS = [
  { value: "cent", label: "Cent" },
  { value: "acre", label: "Acre" },
  { value: "sqft", label: "Sq ft" },
  { value: "sqm", label: "Sq m" },
];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function PropertyForm({
  action,
  initial,
  submitLabel,
  canSetFinalPrice,
}: {
  action: (
    prev: ActionResult<{ id: string }> | null,
    formData: FormData,
  ) => Promise<ActionResult<{ id: string }>>;
  initial?: Record<string, unknown>;
  submitLabel: string;
  canSetFinalPrice: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<string>(String(initial?.kind ?? "residential"));
  const [hasBuilding, setHasBuilding] = useState<boolean>(
    initial?.hasBuilding === undefined ? true : Boolean(initial.hasBuilding),
  );

  const errors = state && !state.ok ? state.fieldErrors : undefined;
  const val = (key: string) => {
    const v = initial?.[key];
    return v === null || v === undefined ? "" : String(v);
  };

  // Every step stays mounted and is hidden with CSS rather than unmounted: the
  // form posts once, and unmounting a step would drop its inputs from FormData.
  const stepPane = (index: number) =>
    cx("flex flex-col gap-5", step === index ? "block" : "hidden");

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state && !state.ok && (
        <ErrorText>
          {state.error}
          {errors && (
            <span className="mt-1 block text-xs">
              {Object.entries(errors)
                .map(([field, messages]) => `${field}: ${messages?.[0]}`)
                .join(" · ")}
            </span>
          )}
        </ErrorText>
      )}

      <nav className="flex flex-wrap gap-1 rounded-[12px] border border-stone-200 bg-white p-1.5">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={cx(
              "flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-xs font-medium transition",
              step === i
                ? "bg-pine-600 text-white"
                : "text-stone-600 hover:bg-stone-100",
            )}
          >
            <span
              className={cx(
                "flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
                step === i ? "bg-white/20" : "bg-stone-200 text-stone-600",
              )}
            >
              {i + 1}
            </span>
            {label}
          </button>
        ))}
      </nav>

      {/* 1 — Basics */}
      <div className={stepPane(0)}>
        <Card title="Basic information">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Property title"
              required
              error={errors?.name?.[0]}
              className="sm:col-span-2"
            >
              <input name="name" required defaultValue={val("name")} className={inputClass} placeholder="The Arbour" />
            </Field>

            <Field label="Property type" required>
              <select
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className={inputClass}
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
            </Field>

            <Field label="Listing type" required>
              <select name="listingType" defaultValue={val("listingType") || "sale"} className={inputClass}>
                <option value="sale">Sale</option>
                <option value="rental">Rental</option>
                <option value="both">Both</option>
              </select>
            </Field>

            <Field label="Configuration" required error={errors?.type?.[0]} hint="Shown on the public card.">
              <input name="type" required defaultValue={val("type")} className={inputClass} placeholder="3 & 4 BHK residences" />
            </Field>

            <Field label="Possession" required hint="The label the website badge shows.">
              <select name="status" defaultValue={val("status") || "Ready to move"} className={inputClass}>
                <option>Ready to move</option>
                <option>Under construction</option>
                <option>New launch</option>
              </select>
            </Field>

            <Field label="Summary" required error={errors?.summary?.[0]} className="sm:col-span-2" hint="One or two lines — this is the card copy.">
              <textarea name="summary" required rows={2} defaultValue={val("summary")} className={cx(inputClass, "resize-y")} />
            </Field>

            <Field label="Full description" className="sm:col-span-2">
              <textarea name="description" rows={5} defaultValue={val("description")} className={cx(inputClass, "resize-y")} />
            </Field>
          </div>
        </Card>
      </div>

      {/* 2 — Location */}
      <div className={stepPane(1)}>
        <Card title="Location">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Area / locality" required error={errors?.locality?.[0]}>
              <input name="locality" required defaultValue={val("locality")} className={inputClass} placeholder="Kakkanad" />
            </Field>
            <Field label="City" required error={errors?.city?.[0]}>
              <input name="city" required defaultValue={val("city")} className={inputClass} placeholder="Ernakulam" />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <input name="addressLine" defaultValue={val("addressLine")} className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  name="addressIsPublic"
                  defaultChecked={Boolean(initial?.addressIsPublic)}
                  className="mt-0.5 h-4 w-4 accent-[var(--color-pine-600)]"
                />
                <span>
                  <span className="block text-sm text-stone-800">Show the street address publicly</span>
                  <span className="block text-xs text-stone-500">
                    Off by default. The locality and city always show; the exact address does not.
                  </span>
                </span>
              </label>
            </div>
            <Field label="District"><input name="district" defaultValue={val("district")} className={inputClass} /></Field>
            <Field label="State"><input name="state" defaultValue={val("state") || "Kerala"} className={inputClass} /></Field>
            <Field label="PIN code" error={errors?.pincode?.[0]}>
              <input name="pincode" inputMode="numeric" defaultValue={val("pincode")} className={inputClass} placeholder="682030" />
            </Field>
            <Field label="Country"><input name="country" defaultValue={val("country") || "India"} className={inputClass} /></Field>
            <Field label="Latitude" error={errors?.latitude?.[0]}>
              <input name="latitude" defaultValue={val("latitude")} className={inputClass} placeholder="9.9816" />
            </Field>
            <Field label="Longitude" error={errors?.longitude?.[0]}>
              <input name="longitude" defaultValue={val("longitude")} className={inputClass} placeholder="76.2999" />
            </Field>
          </div>
        </Card>
      </div>

      {/* 3 — Land & building */}
      <div className={stepPane(2)}>
        <Card title="Land">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Land area" error={errors?.landArea?.[0]}>
              <input name="landArea" defaultValue={val("landArea")} className={inputClass} placeholder="5.2" />
            </Field>
            <Field label="Unit" error={errors?.landAreaUnit?.[0]}>
              <select name="landAreaUnit" defaultValue={val("landAreaUnit")} className={inputClass}>
                <option value="">—</option>
                {AREA_UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Plot / survey number"><input name="surveyNumber" defaultValue={val("surveyNumber")} className={inputClass} /></Field>
            <Field label="Road access"><input name="roadAccess" defaultValue={val("roadAccess")} className={inputClass} placeholder="30 ft tarred" /></Field>
            <Field label="Facing"><input name="facing" defaultValue={val("facing")} className={inputClass} placeholder="East / North-east" /></Field>
            <Field label="Boundary details"><input name="boundaryNotes" defaultValue={val("boundaryNotes")} className={inputClass} /></Field>
          </div>
        </Card>

        <Card title="Building">
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              name="hasBuilding"
              checked={hasBuilding}
              onChange={(e) => setHasBuilding(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-pine-600)]"
            />
            <span className="text-sm text-stone-800">There is a building on this property</span>
          </label>

          {/* §43: the building fields simply aren't rendered for bare land. */}
          {hasBuilding && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Built-up area" error={errors?.builtUpArea?.[0]}>
                <input name="builtUpArea" defaultValue={val("builtUpArea")} className={inputClass} placeholder="1840" />
              </Field>
              <Field label="Unit" error={errors?.builtUpAreaUnit?.[0]}>
                <select name="builtUpAreaUnit" defaultValue={val("builtUpAreaUnit") || "sqft"} className={inputClass}>
                  {AREA_UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Area label" hint="Free text shown on the card, e.g. “1,840 sqft”.">
                <input name="area" defaultValue={val("area")} className={inputClass} />
              </Field>
              <Field label="Floors"><input name="floors" defaultValue={val("floors")} className={inputClass} /></Field>
              <Field label="Units"><input name="units" defaultValue={val("units")} className={inputClass} /></Field>
              <Field label="Parking"><input name="parking" defaultValue={val("parking")} className={inputClass} placeholder="2 covered" /></Field>
              <Field label="Property age"><input name="propertyAge" defaultValue={val("propertyAge")} className={inputClass} placeholder="New / 5 years" /></Field>
              <Field label="Furnished status">
                <select name="furnishedStatus" defaultValue={val("furnishedStatus")} className={inputClass}>
                  <option value="">—</option>
                  <option>Unfurnished</option>
                  <option>Semi-furnished</option>
                  <option>Fully furnished</option>
                </select>
              </Field>

              {/* §7 — residential only */}
              {kind === "residential" && (
                <>
                  <Field label="Bedrooms"><input name="beds" defaultValue={val("beds")} className={inputClass} /></Field>
                  <Field label="Bathrooms"><input name="baths" defaultValue={val("baths")} className={inputClass} /></Field>
                  <Field label="Balconies"><input name="balconies" defaultValue={val("balconies")} className={inputClass} /></Field>
                </>
              )}
            </div>
          )}

          {/* §8 — commercial only */}
          {kind === "commercial" && (
            <div className="mt-5 grid gap-4 border-t border-stone-200 pt-5 sm:grid-cols-2">
              <Field label="Commercial type" required error={errors?.commercialKind?.[0]}>
                <select name="commercialKind" defaultValue={val("commercialKind")} className={inputClass}>
                  <option value="">Choose one</option>
                  <option value="office">Office</option>
                  <option value="retail">Retail</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="land">Land</option>
                  <option value="building">Building</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Floor"><input name="floorNumber" defaultValue={val("floorNumber")} className={inputClass} /></Field>
              <Field label="Current occupancy"><input name="occupancy" defaultValue={val("occupancy")} className={inputClass} placeholder="Vacant / tenanted" /></Field>
              <Field label="Suitable for"><input name="suitableFor" defaultValue={val("suitableFor")} className={inputClass} /></Field>
              <Field label="Lease / rental potential" className="sm:col-span-2">
                <input name="leasePotential" defaultValue={val("leasePotential")} className={inputClass} />
              </Field>
            </div>
          )}

          <Field
            label="Amenities"
            className="mt-5"
            hint="One per line."
          >
            <textarea
              name="amenities"
              rows={5}
              defaultValue={
                Array.isArray(initial?.amenities)
                  ? (initial.amenities as string[]).join("\n")
                  : ""
              }
              className={cx(inputClass, "resize-y")}
              placeholder={"Sky lounge\nInfinity edge pool\nEV charging"}
            />
          </Field>
        </Card>
      </div>

      {/* 4 — Financial */}
      <div className={stepPane(3)}>
        <Card title="Financial">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Asking price (₹)" error={errors?.askingPrice?.[0]} hint="Full rupees, e.g. 18500000.">
              <input name="askingPrice" defaultValue={val("askingPrice") || val("priceValue")} className={inputClass} />
            </Field>
            <Field label="Price label" hint="Leave blank to generate from the asking price.">
              <input name="priceLabel" defaultValue={val("priceLabel")} className={inputClass} placeholder="₹1.85 Cr" />
            </Field>
            <Field label="Rental income (₹)"><input name="rentalIncome" defaultValue={val("rentalIncome")} className={inputClass} /></Field>
            <Field label="Rental frequency">
              <select name="rentalFrequency" defaultValue={val("rentalFrequency")} className={inputClass}>
                <option value="">—</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </Field>
            <Field label="Expected rental yield (%)"><input name="rentalYield" defaultValue={val("rentalYield")} className={inputClass} /></Field>
          </div>
        </Card>

        {/* §9 — rendered only for holders of the permission. The server also
            refuses to write it for anyone else, so hiding it is convenience. */}
        {canSetFinalPrice && (
          <Card title="Internal — never shown publicly">
            <p className="mb-4 rounded-[10px] bg-clay-50 px-3 py-2 text-xs text-clay-800">
              These fields are excluded from the website, its metadata, OG images
              and structured data. They are visible to administrators and
              permitted employees only.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Final price (₹)"><input name="finalPrice" defaultValue={val("finalPrice")} className={inputClass} /></Field>
              <Field label="Seller name"><input name="sellerName" defaultValue={val("sellerName")} className={inputClass} /></Field>
              <Field label="Seller contact"><input name="sellerContact" defaultValue={val("sellerContact")} className={inputClass} /></Field>
              <Field label="Internal notes" className="sm:col-span-2">
                <textarea name="internalNotes" rows={4} defaultValue={val("internalNotes")} className={cx(inputClass, "resize-y")} />
              </Field>
            </div>
          </Card>
        )}
      </div>

      {/* 5 — SEO */}
      <div className={stepPane(4)}>
        <Card title="SEO">
          <div className="grid gap-4">
            <Field label="SEO title" hint="Falls back to the property title.">
              <input name="seoTitle" defaultValue={val("seoTitle")} className={inputClass} />
            </Field>
            <Field label="Meta description" hint="Falls back to the summary. Around 155 characters.">
              <textarea name="seoDescription" rows={3} defaultValue={val("seoDescription")} className={cx(inputClass, "resize-y")} />
            </Field>
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs text-stone-500">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pine-600" />
            Photos and publishing are handled on the property page after saving —
            media needs a property to attach to.
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Submit label={submitLabel} />
        {step > 0 && (
          <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 && (
          <Button type="button" variant="secondary" onClick={() => setStep(step + 1)}>
            Next
          </Button>
        )}
        <Link href="/admin/properties" className="text-sm text-stone-500 hover:text-stone-800">
          Cancel
        </Link>
      </div>
    </form>
  );
}
