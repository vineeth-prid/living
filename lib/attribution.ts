/**
 * Marketing attribution (§20), read from the browser at submit time.
 *
 * Deliberately not React state: these values only exist client-side, never
 * change while the form is open, and are only needed once — at submit. Reading
 * them in an effect meant a setState on mount (and a second render) purely to
 * populate hidden inputs nobody looks at.
 */
export function attachAttribution(formData: FormData): FormData {
  if (typeof window === "undefined") return formData;

  const params = new URLSearchParams(window.location.search);
  formData.set("landingPage", window.location.pathname);
  formData.set("referrerUrl", document.referrer.slice(0, 500));
  formData.set("utmSource", params.get("utm_source") ?? "");
  formData.set("utmMedium", params.get("utm_medium") ?? "");
  formData.set("utmCampaign", params.get("utm_campaign") ?? "");
  return formData;
}
