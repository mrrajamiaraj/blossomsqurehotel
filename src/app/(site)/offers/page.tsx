import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { Button } from "@/components/primitives/button";
import { Badge } from "@/components/primitives/surface";
import CtaBand from "@/components/site/CtaBand";
import PageHero from "@/components/site/PageHero";
import { Money } from "@/components/system/RoomCard";
import SectionHeading from "@/components/system/SectionHeading";
import { noPackagesYet, rateOffers } from "@/lib/content/offers";
import { roomKind } from "@/lib/format";
import { WEEKEND_LABEL } from "@/lib/pricing";
import { getRooms } from "@/lib/rooms";
import { pageMetadata } from "@/lib/seo";

// Rates come from Supabase; refresh with them.
export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Offers & packages",
  description: "Book direct for our lowest rates and stay midweek for less at Blossom Square Hotel & Suites, Cox's Bazar.",
  path: "/offers",
});

export default async function OffersPage() {
  const [rooms, packages] = await Promise.all([getRooms(), noPackagesYet.getPackages()]);
  const offers = [...rateOffers(rooms), ...packages];

  return (
    <>
      <PageHero
        eyebrow="Offers & packages"
        title={
          <>
            The best rate <em>is the direct one.</em>
          </>
        }
        lede="Every price on this page comes straight from today's room rates. No codes, no small print beyond what's written here."
        crumbs={[{ label: "Offers" }]}
      />

      <section className="section pt-[clamp(48px,6vw,88px)]" aria-label="Current offers">
        <div className="wrap grid gap-6 lg:grid-cols-2">
          {offers.map((o, i) => (
            <article key={o.id} className="flex flex-col gap-6 border border-line bg-ivory p-8 sm:p-12" data-reveal="up" style={{ "--d": `${i * 120}ms` } as React.CSSProperties} aria-labelledby={`${o.id}-h`}>
              <Badge tone="gold" className="w-fit">
                {o.id === "direct" ? "Every day" : o.id === "midweek" ? "Sunday – Wednesday nights" : "Package"}
              </Badge>
              <h2 id={`${o.id}-h`} className="h2 max-w-[16ch] [&_em]:text-bronze">
                {o.title} {o.accent && <em>{o.accent}</em>}
              </h2>
              <p className="max-w-[52ch] text-ink-soft">{o.summary}</p>
              {o.highlights.length > 0 && (
                <ul role="list" className="flex flex-col divide-y divide-line border-y border-line">
                  {o.highlights.map((h) => (
                    <li key={h} className="py-3.5 text-[0.95rem] text-ink">
                      {h}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto flex flex-col gap-4 pt-2">
                <Button asChild className="w-fit">
                  <Link href={o.href}>
                    {o.cta} <ArrowRight />
                  </Link>
                </Button>
                {o.terms && <p className="text-xs leading-relaxed text-muted-foreground">{o.terms}</p>}
              </div>
            </article>
          ))}
        </div>
        {offers.length === 0 && (
          <p className="wrap text-ink-soft">There are no special offers right now. Our direct rates are always on the rooms page.</p>
        )}
      </section>

      <section className="bg-sand/60 py-[clamp(64px,8vw,120px)]" aria-labelledby="rates-h">
        <div className="wrap">
          <SectionHeading eyebrow="Rates at a glance" title={<span id="rates-h">Every room, <em>every rate.</em></span>} lede={`Weekday rates apply Sunday to Wednesday nights; ${WEEKEND_LABEL.toLowerCase()} are charged at the weekend rate. VAT and service charge are added at check-in.`} />
          <div className="mt-12 overflow-x-auto border border-line bg-ivory">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <caption className="sr-only">Nightly rates by room type, in taka</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="caps px-6 py-4 text-bronze">
                    Room
                  </th>
                  <th scope="col" className="caps px-6 py-4 text-right text-bronze">
                    Weekday
                  </th>
                  <th scope="col" className="caps px-6 py-4 text-right text-bronze">
                    Weekend
                  </th>
                  <th scope="col" className="caps px-6 py-4 text-right text-bronze">
                    Published rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.slug} className="border-b border-line last:border-0">
                    <th scope="row" className="px-6 py-5 font-normal">
                      <Link href={`/rooms/${r.slug}`} className="font-serif text-[1.3rem] text-ink hover:underline">
                        {r.name}
                      </Link>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {roomKind(r.tag)} · sleeps {r.sleeps}
                      </span>
                    </th>
                    <td className="px-6 py-5 text-right font-serif text-[1.4rem]">
                      <Money amount={r.price_bdt} />
                    </td>
                    <td className="px-6 py-5 text-right font-serif text-[1.4rem] text-ink-soft">
                      <Money amount={r.weekend_price_bdt ?? r.price_bdt} />
                    </td>
                    <td className="px-6 py-5 text-right text-sm text-muted-foreground">
                      {r.rack_price_bdt ? (
                        <s>
                          <span className="sr-only">Published rate </span>
                          <Money amount={r.rack_price_bdt} />
                        </s>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <CtaBand
        eyebrow="Groups & companies"
        title={<>Travelling as a group? <em>Ask us.</em></>}
        body="For family groups, company trips and event guests, send your dates and numbers and we'll come back with a quote for the whole party."
        bookHref="/contact"
        bookLabel="Ask about a group stay"
        message="Hello, I'd like to ask about a group stay at Blossom Square."
      />
    </>
  );
}
