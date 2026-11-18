import Link from "next/link";
import Accent from "@/components/cms/Accent";
import { ArrowRight, ArrowUpRight } from "@/components/icons";
import { Button } from "@/components/primitives/button";
import CtaBand from "@/components/site/CtaBand";
import PageHero from "@/components/site/PageHero";
import SectionHeading from "@/components/system/SectionHeading";
import TestimonialCard from "@/components/system/TestimonialCard";
import PhotoFrame from "@/components/ui/PhotoFrame";
import { getHotelInfo, getSection } from "@/lib/cms/content";
import { seoMetadata } from "@/lib/cms/seo";
import { getReviews, REVIEWS_URL } from "@/lib/content/reviews";
import { photo } from "@/lib/photos";
import { getRooms } from "@/lib/rooms";
import { hotelJsonLd, JsonLd } from "@/lib/seo";

export const revalidate = 300;

export async function generateMetadata() {
  return seoMetadata("about", "/photos/DSC5562.jpg");
}

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export default async function AboutPage() {
  const [rooms, reviews, c, hotel] = await Promise.all([getRooms(), getReviews({ limit: 3 }), getSection("about"), getHotelInfo()]);
  const hero = c.hero_photo ? photo(c.hero_photo.src, c.hero_photo.alt, "dusk") : null;
  const a = c.photo_a ? photo(c.photo_a.src, c.photo_a.alt, "sand") : null;
  const b = c.photo_b ? photo(c.photo_b.src, c.photo_b.alt, "sea") : null;
  const suites = rooms.filter((r) => r.tag === "SUITE").length;

  const facts: [string, string][] = [
    [String(rooms.length), "room types, from a couple's room to a family suite"],
    [String(suites), "suites with balconies, for families and friends"],
    ...c.facts.map((f): [string, string] => [f.value, f.label]),
  ];

  return (
    <>
      <PageHero eyebrow={c.hero_eyebrow} title={<Accent text={c.hero_title} />} crumbs={[{ label: "About" }]} photo={hero} />

      <section className="section" aria-labelledby="story-h">
        <div className="wrap grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-24">
          <div>
            <SectionHeading eyebrow={c.story_eyebrow} title={<span id="story-h"><Accent text={c.story_title} /></span>} />
            <div className="measure mt-8 flex flex-col gap-5 text-[1.08rem] leading-[1.75] text-ink-soft">
              {c.story.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <Button asChild variant="outline" className="mt-10">
              <Link href="/rooms">
                See the rooms <ArrowRight />
              </Link>
            </Button>
          </div>
          {(a || b) && (
            <div className="grid grid-cols-[1.2fr_1fr] items-end gap-4">
              {a && (
                <div data-reveal="mask">
                  <PhotoFrame photo={a} sizes="(min-width: 1180px) 30vw, 55vw" className="aspect-[3/4]" />
                </div>
              )}
              <div className="flex flex-col gap-4" data-reveal="mask" style={d(200)}>
                {b && <PhotoFrame photo={b} sizes="(min-width: 1180px) 24vw, 45vw" className="aspect-square" />}
                {c.photo_caption && <p className="text-sm text-muted-foreground">{c.photo_caption}</p>}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="on-dark bg-pine py-[clamp(64px,8vw,112px)]" data-surface="dark" aria-label="At a glance">
        <dl className="wrap grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(([value, label], i) => (
            <div key={`${label}-${i}`} className="flex flex-col gap-3 border-t border-[var(--line-light)] pt-6" data-reveal="up" style={d(i * 90)}>
              <dd className="font-serif text-[clamp(2.6rem,2rem+2vw,3.8rem)] leading-none text-champagne">{value}</dd>
              <dt className="max-w-[24ch] text-[var(--mist)]">{label}</dt>
            </div>
          ))}
        </dl>
      </section>

      <section className="section" aria-labelledby="reviews-h">
        <div className="wrap">
          <SectionHeading
            eyebrow="Guest reviews"
            title={<span id="reviews-h">In our guests&apos; <em>own words.</em></span>}
            action={
              <Button asChild variant="link">
                <a href={REVIEWS_URL} target="_blank" rel="noopener noreferrer">
                  Read reviews on Google <ArrowUpRight />
                </a>
              </Button>
            }
          />
          {reviews.length ? (
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {reviews.map((t) => (
                <TestimonialCard key={t.author + t.quote.slice(0, 20)} t={t} />
              ))}
            </div>
          ) : (
            <p className="measure mt-8 text-ink-soft">
              We only show reviews guests have published themselves. Read what guests say, or leave a review after your stay, on our{" "}
              <a href={REVIEWS_URL} target="_blank" rel="noopener noreferrer" className="text-link">
                Google listing
              </a>
              .
            </p>
          )}
        </div>
      </section>

      <section className="border-t border-line py-[clamp(56px,7vw,96px)]" aria-label="Where to find us">
        <div className="wrap flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="caps eyebrow">Find us</p>
            <p className="h3 mt-4 max-w-[30ch]">{hotel.address}</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/contact#map">
              Map &amp; directions <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      <CtaBand />
      <JsonLd data={hotelJsonLd({ image: "/photos/DSC5566.jpg", hotel })} />
    </>
  );
}
