import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { Badge } from "@/components/primitives/surface";
import CtaBand from "@/components/site/CtaBand";
import PageHero from "@/components/site/PageHero";
import SectionHeading from "@/components/system/SectionHeading";
import { FACILITIES, IN_EVERY_ROOM, TERMS_LABEL } from "@/lib/content/facilities";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Hotel facilities",
  description: "Swimming pool, restaurant and café, 24-hour room service, free Wi-Fi and parking, a conference room and banquet hall at Blossom Square, Cox's Bazar.",
  path: "/facilities",
});

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export default function FacilitiesPage() {
  return (
    <>
      <PageHero
        eyebrow="Facilities"
        title={
          <>
            Everything close at hand, <em>nothing to add at checkout.</em>
          </>
        }
        lede="Breakfast, Wi-Fi, parking and the pool are part of every room rate. Room service, the restaurant and airport transfers are there when you want them."
        crumbs={[{ label: "Facilities" }]}
      />

      <section className="section pt-[clamp(48px,6vw,88px)]" aria-labelledby="fac-h">
        <div className="wrap">
          <h2 id="fac-h" className="sr-only">
            Facilities
          </h2>
          <ul role="list" className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {FACILITIES.map((f, i) => (
              <li key={f.id} id={f.id} className="flex scroll-mt-[calc(var(--header-h)+24px)] flex-col gap-5 bg-ivory p-7 sm:p-9" data-reveal="up" style={d((i % 3) * 90)}>
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-14 place-items-center rounded-full border border-line text-brass">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
                      <path d={f.icon} />
                    </svg>
                  </span>
                  <Badge tone={f.terms === "included" ? "pine" : "outline"}>{TERMS_LABEL[f.terms]}</Badge>
                </div>
                <div>
                  <h3 className="h4">{f.name}</h3>
                  <p className="mt-1 text-sm font-medium text-bronze">{f.summary}</p>
                </div>
                <p className="text-ink-soft">{f.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-sand/60 py-[clamp(64px,8vw,120px)]" aria-labelledby="room-h">
        <div className="wrap grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-center">
          <SectionHeading eyebrow="In every room" title={<span id="room-h">The essentials, <em>as standard.</em></span>} lede="Each of our seven room types has these, from the Standard Couple to the Executive Family Suite." />
          <ul role="list" className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
            {IN_EVERY_ROOM.map((a, i) => (
              <li key={a.name} className="flex items-center gap-4" data-reveal="up" style={d(i * 60)}>
                <span className="grid size-11 shrink-0 place-items-center rounded-full border border-line-strong text-primary">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d={a.icon} />
                  </svg>
                </span>
                <span className="text-ink">{a.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-label="More to explore">
        <div className="wrap grid gap-px border border-line bg-line md:grid-cols-3">
          {[
            { href: "/dining", eyebrow: "Dining", title: "Restaurant, café and breakfast", cta: "Dining at Blossom Square" },
            { href: "/meetings-events", eyebrow: "Meetings & events", title: "Conference room and banquet hall", cta: "Plan an event" },
            { href: "/rooms", eyebrow: "Stay", title: "Seven room types, couples to families", cta: "Compare rooms" },
          ].map((c) => (
            <Link key={c.href} href={c.href} className="group flex flex-col gap-4 bg-ivory p-8 transition-colors duration-500 hover:bg-paper sm:p-10">
              <span className="caps text-bronze">{c.eyebrow}</span>
              <span className="h4">{c.title}</span>
              <span className="mt-auto inline-flex items-center gap-3 pt-6 text-[0.72rem] font-semibold tracking-[0.14em] text-primary uppercase">
                {c.cta}
                <ArrowRight />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <CtaBand />
    </>
  );
}
