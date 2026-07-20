import type { ReactNode } from "react";
import { Reveal, ZoomImage } from "./motion";
import { Eyebrow } from "./ui";

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
    <header className="bg-page pt-28 md:pt-32">
      <div className="shell">
        <Reveal className="max-w-3xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-5 font-display font-light text-ink display-xl">
            {title}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-body">
            {intro}
          </p>
        </Reveal>
      </div>
      <div className="shell mt-12 md:mt-14">
        <Reveal delay={0.1}>
          {visual ?? (
            <ZoomImage
              src={image!}
              alt={imageAlt ?? ""}
              className="aspect-[16/9] w-full rounded-hero shadow-lift"
              priority
            />
          )}
        </Reveal>
      </div>
    </header>
  );
}
