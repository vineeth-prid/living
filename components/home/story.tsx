import { Reveal, ZoomImage, Parallax } from "@/components/motion";
import { Eyebrow } from "@/components/ui";
import { img } from "@/lib/images";

const chapters = [
  {
    eyebrow: "Who we are",
    title: "A home, and everything that makes it one.",
    body: "Living is the property arm of ITR Group, who have been building in Kerala for fifteen years. The same people who hand over the keys are the ones you call afterwards.",
    image: img.storyLiving,
    alt: "Warm, softly-lit contemporary living room with natural materials",
  },
  {
    eyebrow: "Why Living exists",
    title: "One number, not eleven.",
    body: "Buying a home in Kerala usually means a broker, a lawyer, a valuer, a contractor and a caretaker who have never spoken to each other. We do all of it, so nobody has to be chased.",
    image: img.storyDetail,
    alt: "Close detail of natural wood and linen textures in a calm interior",
  },
  {
    eyebrow: "How we work",
    title: "Answered the same day.",
    body: "A named person who knows your property, replies while it still matters, and tells you plainly when something is not worth buying. That is the whole promise.",
    image: img.storyMorning,
    alt: "Soft morning light across a serene bedroom",
  },
];

export function BrandStory() {
  return (
    <section className="bg-page section">
      <div className="shell">
        <Reveal className="mx-auto max-w-3xl text-center">
          <Eyebrow>Our story</Eyebrow>
          <h2 className="mt-5 font-display text-ink display-lg">
            We sell the home, then look after it.
          </h2>
        </Reveal>

        <div className="mt-10 flex flex-col gap-12 md:mt-12 md:gap-16">
          {chapters.map((c, i) => (
            <div
              key={c.eyebrow}
              className="grid items-center gap-8 md:grid-cols-2 md:gap-12"
            >
              <div className={i % 2 === 1 ? "md:order-2" : ""}>
                <Reveal>
                  <Eyebrow>{c.eyebrow}</Eyebrow>
                  <h3 className="mt-4 font-display text-ink display-md">
                    {c.title}
                  </h3>
                  <p className="mt-5 max-w-md text-lg leading-relaxed text-body">
                    {c.body}
                  </p>
                </Reveal>
              </div>
              <div className={i % 2 === 1 ? "md:order-1" : ""}>
                <Parallax
                  distance={40}
                  className="aspect-[4/5] rounded-media shadow-lift"
                >
                  <ZoomImage
                    src={c.image}
                    alt={c.alt}
                    className="h-full w-full"
                  />
                </Parallax>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
