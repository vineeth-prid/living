import { ImageResponse } from "next/og";

// Shared 1200×630 social card, built from the brand tokens in globals.css.
// ponytail: system font fallback — load Cormorant here if the serif matters.
export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

const INK = "#0d2b2c"; // --ink / pine-900
const IVORY = "#faf8f4"; // stone-50
const CLAY = "#c8a04c"; // clay-500
const MUTED = "rgba(250, 248, 244, 0.62)";

export function ogImage(headline: string, footer: string) {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          color: IVORY,
          padding: 72,
        }}
      >
        <div
          style={{
            fontSize: 26,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          Living · by ITR Group
        </div>
        {/* Single text child per div — Satori requires explicit flex on any
            element with more than one child. */}
        <div style={{ fontSize: 82, lineHeight: 1.05, maxWidth: 920 }}>
          {`${headline}.`}
        </div>
        <div
          style={{
            fontSize: 27,
            color: MUTED,
            borderTop: `2px solid ${CLAY}`,
            paddingTop: 24,
          }}
        >
          {footer}
        </div>
      </div>
    ),
    ogSize,
  );
}
