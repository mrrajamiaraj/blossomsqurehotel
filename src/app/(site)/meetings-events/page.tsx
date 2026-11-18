import Accent from "@/components/cms/Accent";
import CtaBand from "@/components/site/CtaBand";
import ContactActions from "@/components/site/ContactActions";
import InquiryForm from "@/components/site/InquiryForm";
import PageHero from "@/components/site/PageHero";
import SectionHeading from "@/components/system/SectionHeading";
import { getSection } from "@/lib/cms/content";
import { iconPath } from "@/lib/cms/sections";
import { seoMetadata } from "@/lib/cms/seo";
import { hotelToday } from "@/lib/dates";
import { photo } from "@/lib/photos";

export const revalidate = 300;

export async function generateMetadata() {
  return seoMetadata("events");
}

const slug = (s: string, i: number) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `space-${i + 1}`;

export default async function EventsPage() {
  const c = await getSection("events");
  const banquet = c.hero_photo ? photo(c.hero_photo.src, c.hero_photo.alt || "The banquet hall", "forest") : null;
  return (
    <>
      <PageHero
        eyebrow={c.hero_eyebrow}
        title={<Accent text={c.hero_title} />}
        lede={c.hero_lede}
        crumbs={[{ label: "Meetings & events" }]}
        photo={banquet}
        actions={<ContactActions email={false} message="Hello, I'd like to plan an event at Blossom Square." />}
      />

      <section className="section pt-[clamp(48px,6vw,88px)]" aria-label="Spaces">
        <div className="wrap grid gap-px border border-line bg-line lg:grid-cols-2">
          {c.spaces.map((s, i) => {
            const id = slug(s.eyebrow.split(" ")[0] || s.title, i);
            return (
              <article key={`${s.title}-${i}`} id={id} className="flex flex-col gap-6 bg-ivory p-8 sm:p-12" data-reveal="up" aria-labelledby={`${id}-h`}>
                <span className="grid size-14 place-items-center rounded-full border border-line text-brass">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
                    <path d={iconPath(s.icon)} />
                  </svg>
                </span>
                {s.eyebrow && <p className="caps text-bronze">{s.eyebrow}</p>}
                <h2 id={`${id}-h`} className="h3 max-w-[18ch]">
                  {s.title}
                </h2>
                <p className="max-w-[52ch] text-ink-soft">{s.body}</p>
                {s.points.length > 0 && (
                  <ul role="list" className="mt-auto flex flex-col divide-y divide-line border-t border-line">
                    {s.points.map((p) => (
                      <li key={p} className="flex items-center gap-3 py-3.5 text-ink">
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-brass" />
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
        {c.spaces_note && <p className="wrap mt-6 text-sm text-muted-foreground">{c.spaces_note}</p>}
      </section>

      <section className="bg-sand/60 py-[clamp(64px,8vw,120px)]" aria-labelledby="plan-h">
        <div className="wrap grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <SectionHeading eyebrow={c.steps_eyebrow} title={<span id="plan-h"><Accent text={c.steps_title} /></span>} />
            <ol className="mt-10 flex flex-col gap-8">
              {c.steps.map((s, i) => (
                <li key={`${s.title}-${i}`} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-4">
                  <span className="font-serif text-[2.2rem] leading-none text-brass" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span className="h4 block">{s.title}</span>
                    <span className="mt-1 block text-ink-soft">{s.note}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <InquiryForm today={hotelToday()} defaultKind="event" kinds={["event", "group", "dining", "general"]} title="Tell us about your event" />
        </div>
      </section>

      <CtaBand eyebrow={c.cta_eyebrow} title={<Accent text={c.cta_title} />} body={c.cta_body} bookHref="/rooms" bookLabel="See rooms" />
    </>
  );
}
