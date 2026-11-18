import Link from "next/link";
import Accent from "@/components/cms/Accent";
import ContactActions from "@/components/site/ContactActions";
import CtaBand from "@/components/site/CtaBand";
import FaqTabs from "@/components/site/FaqTabs";
import PageHero from "@/components/site/PageHero";
import { getHotelInfo, getSection, hasCustom } from "@/lib/cms/content";
import { seoMetadata } from "@/lib/cms/seo";
import { buildFaqs, type FaqGroup } from "@/lib/content/faq";
import { getSettings } from "@/lib/rooms";
import { JsonLd } from "@/lib/seo";

export const revalidate = 300;

export async function generateMetadata() {
  return seoMetadata("faq");
}

const slug = (s: string, i: number) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `topic-${i + 1}`;

export default async function FaqPage() {
  const settings = await getSettings();
  const [c, custom, hotel] = await Promise.all([getSection("faq", settings), hasCustom("faq"), getHotelInfo()]);
  // Until an editor publishes their own questions, the answers (with their
  // links) follow Settings automatically.
  const groups: FaqGroup[] = custom
    ? c.groups.map((g, i) => ({ id: slug(g.title, i), title: g.title, items: g.items.map((x) => ({ q: x.q, a: x.a })) }))
    : buildFaqs(settings, hotel);
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((g) => g.items).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <>
      <PageHero eyebrow={c.hero_eyebrow} title={<Accent text={c.hero_title} />} lede={c.hero_lede} crumbs={[{ label: "Questions & answers" }]} />

      <section className="section pt-[clamp(48px,6vw,88px)]" aria-label="Questions">
        <div className="wrap grid gap-16 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <FaqTabs groups={groups} />
          <aside className="h-fit border border-line bg-sand/50 p-8 lg:sticky lg:top-[calc(var(--header-h)+24px)]" aria-labelledby="ask-h">
            <h2 id="ask-h" className="h4">
              Still have a question?
            </h2>
            <p className="mt-3 text-ink-soft">Speak to the front desk, or send a message and we&apos;ll reply the same day.</p>
            <ContactActions className="mt-6 flex-col [&>*]:w-full" email={false} size="sm" message="Hello Blossom Square, I have a question:" />
            <p className="mt-5 text-sm">
              <Link href="/contact" className="text-link">
                Send a message
              </Link>{" "}
              ·{" "}
              <Link href="/booking/lookup" className="text-link">
                Find my booking
              </Link>
            </p>
          </aside>
        </div>
      </section>

      <CtaBand />
      <JsonLd data={faqLd} />
    </>
  );
}
