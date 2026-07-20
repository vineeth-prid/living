import { Reveal, ZoomImage, Parallax } from "@/components/motion";
import { Eyebrow } from "@/components/ui";
import { img } from "@/lib/images";

const chapters = [
  {
    eyebrow: "Who we are",
    title: "A home, and everything that makes it one.",
    body: "Living is a premium property and living brand from ITR Group — bringing fifteen years of building trust in Kerala into one calm, considered experience.",
    image: img.storyLiving,
    alt: "Warm, softly-lit contemporary living room with natural materials",
  },
  {
    eyebrow: "Why Living exists",
    title: "Because a home should feel effortless.",
    body: "Finding, owning and running a home has always been fragmented and anxious. We bring it together — sales, concierge, and community — so it simply feels like home.",
    image: img.storyDetail,
    alt: "Close detail of natural wood and linen textures in a calm interior",
  },
  {
    eyebrow: "What Living represents",
    title: "Calm. Warm. Refined. Effortless.",
    body: "Luxury here is not loud. It is whitespace, natural light, and the quiet confidence that everything is handled — so you can just live.",
    image: img.storyMorning,
    alt: "Soft morning light across a serene bedroom",
  },
];

export function BrandStory() {
  return (
    <section className="bg-page py-16 md:py-24">
      <div className="shell">
        <Reveal className="mx-auto max-w-3xl text-center">
          <Eyebrow>Our story</Eyebrow>
          <h2 className="mt-5 font-display font-light text-ink display-lg">
            We build the feeling of home — then look after it.
          </h2>
        </Reveal>

        <div className="mt-12 flex flex-col gap-14 md:mt-12 md:gap-14">
          {chapters.map((c, i) => (
            <div
              key={c.eyebrow}
              className="grid items-center gap-10 md:grid-cols-2 md:gap-12"
            >
              <div className={i % 2 === 1 ? "md:order-2" : ""}>
                <Reveal>
                  <Eyebrow>{c.eyebrow}</Eyebrow>
                  <h3 className="mt-4 font-display font-light text-ink display-lg">
                    {c.title}
                  </h3>
                  <p className="mt-6 max-w-md text-lg leading-relaxed text-body">
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
