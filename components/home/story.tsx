import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal, ZoomImage, Parallax } from "@/components/motion";
import { Eyebrow } from "@/components/ui";
import { img } from "@/lib/images";

// Condensed from three chapters to one. The deeper story (mission, values,
// timeline, leadership) lives on /about — this is the homepage summary.
export function BrandStory() {
  return (
    <section className="bg-surface py-14 md:py-20">
      <div className="shell grid items-center gap-10 md:grid-cols-2 md:gap-14">
        <Reveal>
          <Eyebrow as="h2">Fifteen Years of ITR Group in Kerala</Eyebrow>
          <p className="mt-4 font-display font-light text-ink display-lg">
            More than a property brand.
          </p>
          <p className="mt-5 text-lg leading-relaxed text-body">
            Living brings together property expertise, concierge services and
            technology to make owning, managing and living in a home feel
            effortless — backed by fifteen years of ITR Group&apos;s work across
            Kerala.
          </p>
          <Link
            href="/about"
            className="mt-7 inline-flex items-center gap-1.5 text-[15px] font-medium text-pine-700 hover:text-pine-800"
          >
            Discover Living
            <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
          </Link>
        </Reveal>

        <Reveal delay={0.1}>
          <Parallax distance={40} className="aspect-[4/3] rounded-media shadow-lift">
            <ZoomImage
              src={img.storyLiving}
              alt="Warm, softly-lit contemporary living room with natural materials"
              className="h-full w-full"
            />
          </Parallax>
        </Reveal>
      </div>
    </section>
  );
}
