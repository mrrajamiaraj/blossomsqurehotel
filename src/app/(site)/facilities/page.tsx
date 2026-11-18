import Link from "next/link";
import Accent from "@/components/cms/Accent";
import { ArrowRight } from "@/components/icons";
import { Badge } from "@/components/primitives/surface";
import CtaBand from "@/components/site/CtaBand";
import PageHero from "@/components/site/PageHero";
import SectionHeading from "@/components/system/SectionHeading";
import { getSection } from "@/lib/cms/content";
import { iconPath } from "@/lib/cms/sections";
import { seoMetadata } from "@/lib/cms/seo";
import { TERMS_LABEL } from "@/lib/content/facilities";
import { getRooms } from "@/lib/rooms";

export const revalidate = 300;

export async function generateMetadata() {
  return seoMetadata("facilities");
}

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;
const anchor = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Keeps the links other pages already use (#pool, #restaurant, #room-service, #airport…).
const LEGACY: Record<string, string> = {
  "restaurant-cafe": "restaurant", "airport-transfers": "airport", "swimming-pool": "pool", "conference-room": "conference", "banquet-hall": "banquet", "wi-fi": "wifi",
};

export default async function FacilitiesPage() {
  const [c, rooms] = await Promise.all([getSection("facilities"), getRooms()]);
  return (
    <>
      <PageHero eyebrow={c.hero_eyebrow} title={<Accent text={c.hero_title} />} lede={c.hero_lede} crumbs={[{ label: "Facilities" }]} />

      <section className="section pt-[clamp(48px,6vw,88px)]" aria-labelledby="fac-h">
        <div className="wrap">
          <h2 id="fac-h" className="sr-only">
            Facilities
          </h2>
          <ul role="list" className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {c.items.map((f, i) => {
              const id = LEGACY[anchor(f.name)] ?? anchor(f.name);
              return (
                <li key={`${f.name}-${i}`} id={id} className="flex scroll-mt-[calc(var(--header-h)+24px)] flex-col gap-5 bg-ivory p-7 sm:p-9" data-reveal="up" style={d((i % 3) * 90)}>
                  <div className="flex items-start justify-between gap-4">
                    <span className="grid size-14 place-items-center rounded-full border border-line text-brass">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
                        <path d={iconPath(f.icon)} />
                      </svg>
                    </span>
                    <Badge tone={f.terms === "included" ? "pine" : "outline"}>{TERMS_LABEL[f.terms] ?? TERMS_LABEL.included}</Badge>
                  </div>
                  <div>
                    <h3 className="h4">{f.name}</h3>
                    {f.summary && <p className="mt-1 text-sm font-medium text-bronze">{f.summary}</p>}
                  </div>
                  {f.detail && <p className="text-ink-soft">{f.detail}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="bg-sand/60 py-[clamp(64px,8vw,120px)]" aria-labelledby="room-h">
        <div className="wrap grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-center">
          <SectionHeading eyebrow={c.room_eyebrow} title={<span id="room-h"><Accent text={c.room_title} /></span>} lede={c.room_lede} />
          <ul role="list" className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
            {c.room_items.map((a, i) => (
              <li key={`${a.name}-${i}`} className="flex items-center gap-4" data-reveal="up" style={d(i * 60)}>
                <span className="grid size-11 shrink-0 place-items-center rounded-full border border-line-strong text-primary">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d={iconPath(a.icon)} />
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
            { href: "/rooms", eyebrow: "Stay", title: `${rooms.length} room types, couples to families`, cta: "Compare rooms" },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="group flex flex-col gap-4 bg-ivory p-8 transition-colors duration-500 hover:bg-paper sm:p-10">
              <span className="caps text-bronze">{l.eyebrow}</span>
              <span className="h4">{l.title}</span>
              <span className="mt-auto inline-flex items-center gap-3 pt-6 text-[0.72rem] font-semibold tracking-[0.14em] text-primary uppercase">
                {l.cta}
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
