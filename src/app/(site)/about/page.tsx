import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "@/components/icons";
import { Button } from "@/components/primitives/button";
import CtaBand from "@/components/site/CtaBand";
import PageHero from "@/components/site/PageHero";
import SectionHeading from "@/components/system/SectionHeading";
import TestimonialCard from "@/components/system/TestimonialCard";
import PhotoFrame from "@/components/ui/PhotoFrame";
import { getReviews, REVIEWS_URL } from "@/lib/content/reviews";
import { HOTEL } from "@/lib/hotel";
import { photo } from "@/lib/photos";
import { getRooms } from "@/lib/rooms";
import { hotelJsonLd, JsonLd, pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "About the hotel",
  description: "Blossom Square Hotel & Suites: quiet rooms and suites on Light House Road in Kolatoli, Cox's Bazar, a short walk from the sea beach.",
  path: "/about",
  image: "/photos/DSC5562.jpg",
});

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export default async function AboutPage() {
  const [rooms, reviews] = await Promise.all([getRooms(), getReviews({ limit: 3 })]);
  const hero = photo("DSC5562", "The upstairs corridor, with original artwork on the walls", "dusk");
  const a = photo("DSC5575", "A Premium Twin room: queen and single beds beneath a woven jute disc", "sand");
  const b = photo("DSC5552", "Turn-down in a Deluxe Couple room", "sea");
  const suites = rooms.filter((r) => r.tag === "SUITE").length;

  const facts: [string, string][] = [
    [String(rooms.length), "room types, from a couple's room to a family suite"],
    [String(suites), "suites with balconies, for families and friends"],
    ["24 h", "room service and front desk"],
    ["Included", "breakfast, Wi-Fi, parking and the pool"],
  ];

  return (
    <>
      <PageHero
        eyebrow="About Blossom Square"
        title={
          <>
            Quiet rooms on Light House Road, <em>the sea at the end of the street.</em>
          </>
        }
        crumbs={[{ label: "About" }]}
        photo={hero}
      />

      <section className="section" aria-labelledby="story-h">
        <div className="wrap grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-24">
          <div>
            <SectionHeading eyebrow="The hotel" title={<span id="story-h">A calm place <em>to come back to.</em></span>} />
            <div className="measure mt-8 flex flex-col gap-5 text-[1.08rem] leading-[1.75] text-ink-soft">
              <p>
                Blossom Square Hotel &amp; Suites sits in Kolatoli, Cox&apos;s Bazar&apos;s hotel quarter, a few minutes on foot from the
                world&apos;s longest sea beach. Come for the sand, stay in for the pool, the restaurant and round-the-clock room
                service.
              </p>
              <p>
                Our rooms are simply and warmly done: pale tiled floors, timber headboards, woven jute and original paintings on the walls,
                soft light in the evenings. Whether you&apos;re here for a holiday, a honeymoon or business, the idea is the same: a quiet room,
                a good breakfast, and a team that looks after the details.
              </p>
            </div>
            <Button asChild variant="outline" className="mt-10">
              <Link href="/rooms">
                See the rooms <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-[1.2fr_1fr] items-end gap-4">
            <div data-reveal="mask">
              <PhotoFrame photo={a} sizes="(min-width: 1180px) 30vw, 55vw" className="aspect-[3/4]" />
            </div>
            <div className="flex flex-col gap-4" data-reveal="mask" style={d(200)}>
              <PhotoFrame photo={b} sizes="(min-width: 1180px) 24vw, 45vw" className="aspect-square" />
              <p className="text-sm text-muted-foreground">A Premium Twin room, and turn-down in a Deluxe Couple.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="on-dark bg-pine py-[clamp(64px,8vw,112px)]" data-surface="dark" aria-label="At a glance">
        <dl className="wrap grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(([value, label], i) => (
            <div key={label} className="flex flex-col gap-3 border-t border-[var(--line-light)] pt-6" data-reveal="up" style={d(i * 90)}>
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
            <p className="h3 mt-4 max-w-[30ch]">{HOTEL.address}</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/contact#map">
              Map &amp; directions <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      <CtaBand />
      <JsonLd data={hotelJsonLd({ image: "/photos/DSC5566.jpg" })} />
    </>
  );
}
