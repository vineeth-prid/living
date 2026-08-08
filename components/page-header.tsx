import type { ReactNode } from "react";
import { Reveal, ZoomImage } from "./motion";

// Bright, calm header for interior pages. Pass `image` for a framed photo,
// or `visual` for a custom node (e.g. a diagram) in its place.
export function PageHeader({
  eyebrow,
  title,
  intro,
  image,
  imageAlt,
  visual,
}: {
  eyebrow: string;
  title: React.ReactNode;
  intro: string;
  image?: string;
  imageAlt?: string;
  visual?: ReactNode;
}) {
  return (
    <header className="bg-page pt-24 md:pt-28">
      <div className="shell">
        <Reveal className="max-w-3xl">
          {/* `display: contents` dissolves the h1 box, so the eyebrow and the
              display line lay out exactly as the sibling <p> + <h1> did. */}
          <h1 className="contents">
            <span className="eyebrow block">{eyebrow}</span>
            <span className="mt-5 block font-display font-light text-ink display-xl">
              {title}
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-body">
            {intro}
          </p>
        </Reveal>
      </div>
      <div className="shell mt-10 md:mt-12">
        <Reveal delay={0.1}>
          {visual ?? (
            <ZoomImage
              src={image!}
              alt={imageAlt ?? ""}
              className="aspect-[16/9] w-full rounded-hero shadow-lift"
              sizes="(max-width: 1248px) 100vw, 1248px"
              preload
            />
          )}
        </Reveal>
      </div>
    </header>
  );
}
