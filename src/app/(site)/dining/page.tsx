import ContactActions from "@/components/site/ContactActions";
import CtaBand from "@/components/site/CtaBand";
import InquiryForm from "@/components/site/InquiryForm";
import PageHero from "@/components/site/PageHero";
import SectionHeading from "@/components/system/SectionHeading";
import PhotoFrame from "@/components/ui/PhotoFrame";
import { ICONS } from "@/lib/amenities";
import { hotelToday } from "@/lib/dates";
import { photo } from "@/lib/photos";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Dining",
  description: "Bangladeshi and international dishes with fish from Cox's Bazar's own catch, breakfast included with every room, and 24-hour room service.",
  path: "/dining",
});

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

const MOMENTS = [
  { icon: ICONS.breakfast, title: "Breakfast", note: "A buffet every morning, included with every room for every guest on the booking." },
  { icon: ICONS.seaView, title: "From the bay", note: "Fish from the morning's local catch at Cox's Bazar, on the restaurant menu." },
  { icon: ICONS.roomService, title: "Room service", note: "Meals and snacks brought to your room, twenty-four hours a day." },
  { icon: ICONS.minibar, title: "Evening coffee", note: "The lounge stays open for coffee and conversation after a day on the beach." },
];

export default function DiningPage() {
  const restaurant = photo("RESTAURANT", "The restaurant and café", "dusk");

  return (
    <>
      <PageHero
        eyebrow="Restaurant & café"
        title={
          <>
            Seafood from these shores, <em>breakfast on us.</em>
          </>
        }
        lede="Our restaurant and café serve Bangladeshi and international dishes, with fish from Cox's Bazar's own catch."
        crumbs={[{ label: "Dining" }]}
        photo={restaurant}
        actions={<ContactActions email={false} message="Hello, I'd like to reserve a table at Blossom Square." />}
      />

      <section className="section pt-[clamp(48px,6vw,88px)]" aria-labelledby="moments-h">
        <div className="wrap">
          <SectionHeading eyebrow="Through the day" title={<span id="moments-h">From the first coffee <em>to the last.</em></span>} />
          <ul role="list" className="mt-14 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {MOMENTS.map((m, i) => (
              <li key={m.title} className="flex flex-col gap-5 bg-ivory p-8" data-reveal="up" style={d(i * 90)}>
                <span className="grid size-12 place-items-center rounded-full border border-line text-brass">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={m.icon} />
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
      {restaurant.src && (
        <section className="wrap pb-[var(--section)]" aria-label="The restaurant">
          <PhotoFrame photo={restaurant} sizes="100vw" className="aspect-[16/7]" />
        </section>
      )}

      <section className="bg-sand/60 py-[clamp(64px,8vw,120px)]" aria-labelledby="table-h">
        <div className="wrap grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <SectionHeading eyebrow="Reservations" title={<span id="table-h">Book a table, <em>or a celebration.</em></span>} lede="Call or WhatsApp the front desk to reserve, ask for today's menu, or plan a private dinner. For larger groups, send the details and we'll suggest a menu." />
            <ContactActions className="mt-8" email={false} message="Hello, I'd like to reserve a table at Blossom Square." />
          </div>
          <InquiryForm today={hotelToday()} defaultKind="dining" kinds={["dining", "group", "event"]} title="Plan a meal with us" />
        </div>
      </section>

      <CtaBand title={<>Breakfast is <em>part of every stay.</em></>} />
    </>
  );
}
