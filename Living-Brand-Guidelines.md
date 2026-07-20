# Living — Brand Guidelines

> **Life Happens Here.**
> Use this file as the single source of truth when prompting any LLM to generate copy, UI, or designs for the **Living** brand. Follow it literally — colors, fonts, voice, and rules below are binding.

---

## 1. Brand at a glance

- **Name:** Living
- **Tagline:** *Life Happens Here.*
- **Category:** Premium PropTech ecosystem — connecting home buyers, sellers, apartment communities, residents, facility managers, vendors, and property owners across Property Sales, Rentals, Management, Community, Home Services, Facility Management, Marketplace, and Analytics.
- **Positioning:** A premium lifestyle brand that happens to run on technology. It should make someone think: *"I trust this company. This feels effortless. I would trust them with my home."*
- **Reference feel:** Closer to Apple, Airbnb, and Aman than to any ERP or SaaS dashboard.
- **Personality:** Luxury · modern · minimal · warm · human · refined · calm · confident · trustworthy · innovative. **Never** corporate, loud, or templated.

### The four principles
**Calm · Warm · Refined · Effortless.**
Luxury is simplicity. Luxury is confidence. Luxury is whitespace. Luxury never shouts. Every screen should feel effortless; every interaction intentional; every detail a signal of quality.

---

## 2. Color palette

A warm-cool luxury triad: deep **Pine** (primary), warm **Stone** neutrals (the canvas, ivory → ink), and a single **Clay** terracotta accent (used sparingly). **Generic corporate blue is banned.** Every grey is warm-tinted, never blue-grey. Semantic hues are muted and earthy, never neon.

### Pine — primary (trust, growth, home, calm)
| Token | Hex |
|---|---|
| pine-50 | `#EDF3F0` |
| pine-100 | `#D5E3DC` |
| pine-200 | `#AAC7BA` |
| pine-300 | `#7CA695` |
| pine-400 | `#4E8069` |
| pine-500 | `#2E5F49` |
| **pine-600 (primary action)** | **`#234B39`** |
| pine-700 | `#1B3B2D` |
| pine-800 | `#152E24` |
| pine-900 | `#0F211A` |
| pine-950 | `#0A1611` |

### Stone — neutral (warm-tinted greys, ivory → ink)
| Token | Hex |
|---|---|
| **stone-50 (page ivory)** | **`#FAF8F4`** |
| stone-100 | `#F3EFE8` |
| stone-200 | `#E7E1D5` |
| stone-300 | `#D5CCBC` |
| stone-400 | `#B4A995` |
| stone-500 | `#8B8171` |
| stone-600 | `#6A6255` |
| stone-700 | `#4D473F` |
| stone-800 | `#322E29` |
| stone-900 | `#1E1B18` |
| **stone-950 (ink)** | **`#14110F`** |

### Clay — accent (warmth, life, human touch)
| Token | Hex |
|---|---|
| clay-50 | `#FAF0E9` |
| clay-100 | `#F3DDCD` |
| clay-200 | `#E7BC9E` |
| clay-300 | `#D9976D` |
| clay-400 | `#C9784A` |
| **clay-500 (accent)** | **`#B96A43`** |
| clay-600 | `#9C5636` |
| clay-700 | `#7C442C` |
| clay-800 | `#5E3423` |
| clay-900 | `#40241A` |

### Semantic hues (muted, earthy — never neon)
| Meaning | Foreground | Solid | Background |
|---|---|---|---|
| Success | `#2F6347` | `#3E7C5A` | `#E9F2EC` |
| Warning | `#9E7817` | `#C2941F` | `#F8F0D9` |
| Danger | `#963A30` | `#B4483C` | `#F7E5E2` |
| Info | `#325870` | `#3F6E8C` | `#E7EFF3` |

### Key semantic roles (light theme)
- **Page background:** `#FAF8F4` (ivory). Cards float as pure **white `#FFFFFF`** on top.
- **Primary text:** `#14110F` (strong) / `#322E29` (body) / `#6A6255` (muted).
- **Brand text / links:** Pine-600 `#234B39`, hover Pine-700 `#1B3B2D`.
- **Accent text:** Clay-600 `#9C5636`.
- **Borders:** subtle `#E7E1D5`, default `#D5CCBC` — always hairline and warm.
- **Focus ring:** soft 3px Pine ring, never a hard outline.

### Usage rules
- Backgrounds are predominantly flat ivory or white. **No busy gradients.**
- The only permitted gradients: (a) a subtle Pine gradient as a *placeholder* when a property photo is missing, (b) a **protection scrim** (`rgba(20,17,15,0.34) → transparent`, top-down) over images so overlaid text stays legible.
- Use Clay for **one** CTA or highlight per view — no more.
- No repeating patterns or textures.

### Dark mode
Warm ink surfaces (`#100E0C` → `#1C1915`), luminous Pine accents (Pine-400/300), inverted Stone text. Keep the same triad — do not introduce new colors for dark mode.

---

## 3. Typography

The **serif / grotesque contrast is the core typographic signature.**

| Role | Family | Fallback | Use |
|---|---|---|---|
| **Display** | **Cormorant** | Georgia, serif | Hero lines, headlines, KPI values, dialog titles. Always ≥ 32px, weight 300–500, tracking −0.015em. |
| **UI / Body** | **Schibsted Grotesk** | -apple-system, sans-serif | All interface text and body copy. Semibold for headings/labels, regular for body at 1.66 line-height. |
| **Data / Money** | **IBM Plex Mono** | ui-monospace, monospace | Prices, figures, codes — tabular figures so columns align. |

### Weights
Light 300 · Regular 400 · Medium 500 · Semibold 600 · Bold 700.

### Type scale
- Display: hero `clamp(3.5rem → 6.5rem)`, xl `clamp(2.75rem → 4.75rem)`, lg `clamp(2.25rem → 3.5rem)`.
- Headings: h1 40px · h2 32px · h3 24px · h4 20px.
- Body: lg 18px · base 16px · sm 14px · xs 12px · 2xs 11px (labels/meta only).
- Line heights: tight 1.12 (display) · snug 1.28 · normal 1.5 · relaxed 1.66 (body).
- Tracking: tighter −0.03em · tight −0.015em (display/headings) · wider 0.08em (eyebrows / all-caps).

### Eyebrow label
Schibsted Grotesk semibold, ~12px, tracking 0.08em, ALL-CAPS. The only place ALL-CAPS is allowed. Example: `COMMUNITY · SINCE 2024`.

---

## 4. Logo & iconography

- **Logo — "The Threshold":** an open doorway drawn as a calm architectural arch (Pine), framing an opening in which a single **Clay full-stop** stands — echoing "Life Happens Here." The full-stop is the one permitted brand device.
- **Wordmark:** the mark paired with *Living* in Cormorant Medium + a Clay full-stop — *Living·*
- **Rules:** never recolor the arch outside Pine · Stone · Clay; never rotate it; never wrap it in a container ring. Reverse to ivory on Pine, Clay, or photographic surfaces. **Never** draw buildings, roofs, skylines, or house clip-art anywhere.
- **Icons:** [Lucide](https://lucide.dev) — outline/stroked by default (1.5px stroke, rounded caps, 24px box; 20px in dense UI). Filled glyphs only for a single active/selected state (e.g. a favourited heart). Icons are quiet (muted at rest, strong/brand when active), never multicolor, never mixed families.
- **No emoji anywhere** — in product, marketing, or icons.

---

## 5. Voice & copywriting

The voice is **warm, confident, and quiet** — a considerate concierge, not a salesperson or a software manual.

- **Address:** speak to the reader as **"you"**; the company is **"we,"** used sparingly. Never "the user," never "click here."
- **Tone:** reassuring and effortless. Short declaratives beat superlatives — *"An elevated home in Whitefield,"* not *"The most luxurious home you'll ever see!!!"*
- **Casing:** **sentence case everywhere** — buttons, headings, labels, menu items ("Book a tour," "Saved homes"). ALL-CAPS only for the tracked eyebrow. Never Title Case UI.
- **Headlines:** editorial, human, often a fragment or quiet promise — *"Life Happens Here." / "A calm home to manage." / "Everything in its place."* Set in Cormorant. Full stops in headlines are welcome; they feel deliberate.
- **Punctuation:** em dashes for asides. **No exclamation marks** in product UI.
- **Numbers & money:** Indian formatting — `₹1.85 Cr`, `₹85,000/month`, `1,840 sqft`, `94.2%`. Set in IBM Plex Mono, tabular figures.
- **Microcopy:** encouraging, never a dead end. Empty state: *"No saved homes yet — tap the heart on any listing to keep it here."* Errors are calm and specific: *"At least 8 characters."*
- **Words we like:** home, community, calm, effortless, considered, refined, welcome, belong.
- **Words we avoid:** units, assets, leverage, synergy, disrupt, ERP, portal (customer-facing).
- **Emoji:** never. Warmth comes from typography, imagery, and space.

---

## 6. Layout, shape & motion

**Spacing** — strict **8-point system** (base 8px, 4px half-steps allowed). Whitespace is a feature, not a gap to fill. Generous section padding (96px vertical). Editorial, asymmetric layouts over dense grids. One idea per region.

**Corners** — one unified, soft (not bubbly) radius system:
- Controls `12px` · Cards `16px` · Media/panels `22px` · Hero surfaces `32px` · Pills (999px) for chips/avatars/badges.

**Cards** — white surface + 1px warm hairline border + a soft, warm, low-opacity **layered shadow**. Shadows are warm-tinted ink at 4–14% opacity, never harsh black. Glass (subtle 18px blur) is reserved for panels floating over photography.

**Motion** — calm and intentional. Entrances fade + rise (ease-out); interactive feedback uses a *gentle* settle curve, never a springy bounce. Durations 140–360ms. Hover: primary/accent buttons darken one step + lift 2px + deepen shadow; cards lift 3–4px with a slow image zoom. Press: scale to 0.98 (never a color flash). Always respect `prefers-reduced-motion`.

---

## 7. Imagery

**Photography is the primary visual voice** — warm, natural, softly lit (golden-hour and daylight), real materials (wood, stone, linen, greenery), real people living unposed. Architecture shot wide and calm; lifestyle shot intimate. **Avoid** cold blue-grey stock, heavy HDR, aggressive grain, and clip-art.

**Illustration** — used sparingly, only for empty states, onboarding, and error moments: fine single-weight line work in Pine/Clay on ivory, generous negative space. Never flat corporate "blob" people, never 3D gradients. Prefer photography over illustration on most surfaces.

---

## 8. Quick prompt block (paste into any LLM)

> Brand: **Living** — premium PropTech ecosystem. Tagline "Life Happens Here." Feel: calm, warm, refined, effortless luxury (Apple/Airbnb/Aman, never ERP or corporate).
> **Colors:** primary Pine `#234B39`, page ivory `#FAF8F4`, cards white `#FFFFFF`, ink text `#14110F`, single Clay accent `#B96A43` (one CTA per view). No corporate blue, no bright gradients.
> **Fonts:** Cormorant (display serif, headlines ≥32px), Schibsted Grotesk (UI/body), IBM Plex Mono (numbers/money, Indian formatting like ₹1.85 Cr).
> **Voice:** warm concierge, sentence case everywhere, "you" not "the user," no exclamation marks, no emoji. Short declaratives, editorial headlines.
> **Layout:** 8px spacing, generous whitespace, soft radii (controls 12 / cards 16), warm low-opacity shadows, calm motion. Photography-led, warm natural light — no clip-art, no house/building icons.

---

## Accessibility
Body text ≥ 4.5:1 contrast, large display ≥ 3:1. Never signal state by color alone (pair with a label/dot/message). Visible Pine focus ring everywhere; hit targets ≥ 44px. Honour reduced-motion.
