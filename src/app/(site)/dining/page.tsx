import Accent from "@/components/cms/Accent";
import ContactActions from "@/components/site/ContactActions";
import CtaBand from "@/components/site/CtaBand";
import InquiryForm from "@/components/site/InquiryForm";
import PageHero from "@/components/site/PageHero";
import SectionHeading from "@/components/system/SectionHeading";
import PhotoFrame from "@/components/ui/PhotoFrame";
import { getSection } from "@/lib/cms/content";
import { iconPath } from "@/lib/cms/sections";
import { seoMetadata } from "@/lib/cms/seo";
import { hotelToday } from "@/lib/dates";
import { photo } from "@/lib/photos";

export const revalidate = 300;

export async function generateMetadata() {
  return seoMetadata("dining");
}

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export default async function DiningPage() {
  const c = await getSection("dining");
  const restaurant = c.hero_photo ? photo(c.hero_photo.src, c.hero_photo.alt || "The restaurant and café", "dusk") : null;

  return (
    <>
      <PageHero
        eyebrow={c.hero_eyebrow}
        title={<Accent text={c.hero_title} />}
        lede={c.hero_lede}
        crumbs={[{ label: "Dining" }]}
        photo={restaurant ?? undefined}
        actions={<ContactActions email={false} message="Hello, I'd like to reserve a table at Blossom Square." />}
      />

      <section className="section pt-[clamp(48px,6vw,88px)]" aria-labelledby="moments-h">
        <div className="wrap">
          <SectionHeading eyebrow={c.moments_eyebrow} title={<span id="moments-h"><Accent text={c.moments_title} /></span>} />
          <ul role="list" className="mt-14 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {c.moments.map((m, i) => (
              <li key={`${m.title}-${i}`} className="flex flex-col gap-5 bg-ivory p-8" data-reveal="up" style={d(i * 90)}>
                <span className="grid size-12 place-items-center rounded-full border border-line text-brass">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={iconPath(m.icon)} />
                  </svg>
                </span>
                <h3 className="h4">{m.title}</h3>
                <p className="text-ink-soft">{m.note}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* A photo panel only once the hotel's restaurant photograph exists. */}
      {restaurant?.src && (
        <section className="wrap pb-[var(--section)]" aria-label="The restaurant">
          <PhotoFrame photo={restaurant} sizes="100vw" className="aspect-[16/7]" />
        </section>
      )}

      <section className="bg-sand/60 py-[clamp(64px,8vw,120px)]" aria-labelledby="table-h">
        <div className="wrap grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <SectionHeading eyebrow={c.reserve_eyebrow} title={<span id="table-h"><Accent text={c.reserve_title} /></span>} lede={c.reserve_lede} />
            <ContactActions className="mt-8" email={false} message="Hello, I'd like to reserve a table at Blossom Square." />
          </div>
          <InquiryForm today={hotelToday()} defaultKind="dining" kinds={["dining", "group", "event"]} title="Plan a meal with us" />
        </div>
      </section>

      <CtaBand title={<Accent text={c.cta_title} />} />
    </>
  );
}
