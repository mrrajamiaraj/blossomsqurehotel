import CtaBand from "@/components/site/CtaBand";
import ContactActions from "@/components/site/ContactActions";
import InquiryForm from "@/components/site/InquiryForm";
import PageHero from "@/components/site/PageHero";
import SectionHeading from "@/components/system/SectionHeading";
import { ICONS } from "@/lib/amenities";
import { hotelToday } from "@/lib/dates";
import { photo } from "@/lib/photos";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Meetings & events",
  description: "A conference room with high-speed Wi-Fi and a banquet hall with full catering in Kolatoli, Cox's Bazar. Our events team arranges setup, décor and menus.",
  path: "/meetings-events",
});

const SPACES = [
  {
    id: "conference",
    eyebrow: "Conference room",
    title: "For meetings that need to get done",
    body: "A private room for board meetings, trainings and presentations, with high-speed Wi-Fi. Tell us your format and we'll set it up before you arrive.",
    points: ["High-speed Wi-Fi", "Set up to your format", "Rooms for attendees in the same building"],
    icon: ICONS.desk,
  },
  {
    id: "banquet",
    eyebrow: "Banquet hall",
    title: "For the celebrations that matter",
    body: "Wedding receptions, family gatherings, company dinners. Our events team looks after the setup, décor and menus, and the kitchen caters the whole occasion.",
    points: ["Full catering from our kitchen", "Setup, décor and menus arranged", "Guest rooms for family and friends"],
    icon: ICONS.roomService,
  },
];

const STEPS = [
  ["Tell us the occasion", "Date, number of guests and what you have in mind."],
  ["We come back with options", "Space, layout, menus and rooms, with a clear quote."],
  ["We set it all up", "On the day, our team handles the room, service and timings."],
];

export default function EventsPage() {
  const banquet = photo("BANQUET", "The banquet hall", "forest");
  return (
    <>
      <PageHero
        eyebrow="Meetings & events"
        title={
          <>
            From board meetings <em>to wedding receptions.</em>
          </>
        }
        lede="A conference room and a banquet hall in Kolatoli, with rooms upstairs for your guests and a team that arranges the setup, décor and menus."
        crumbs={[{ label: "Meetings & events" }]}
        photo={banquet}
        actions={<ContactActions email={false} message="Hello, I'd like to plan an event at Blossom Square." />}
      />

      <section className="section pt-[clamp(48px,6vw,88px)]" aria-label="Spaces">
        <div className="wrap grid gap-px border border-line bg-line lg:grid-cols-2">
          {SPACES.map((s) => (
            <article key={s.id} id={s.id} className="flex flex-col gap-6 bg-ivory p-8 sm:p-12" data-reveal="up" aria-labelledby={`${s.id}-h`}>
              <span className="grid size-14 place-items-center rounded-full border border-line text-brass">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
                  <path d={s.icon} />
                </svg>
              </span>
              <p className="caps text-bronze">{s.eyebrow}</p>
              <h2 id={`${s.id}-h`} className="h3 max-w-[18ch]">
                {s.title}
              </h2>
              <p className="max-w-[52ch] text-ink-soft">{s.body}</p>
              <ul role="list" className="mt-auto flex flex-col divide-y divide-line border-t border-line">
                {s.points.map((p) => (
                  <li key={p} className="flex items-center gap-3 py-3.5 text-ink">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-brass" />
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className="wrap mt-6 text-sm text-muted-foreground">Capacities and layouts depend on the occasion. Ask us and we&apos;ll confirm what fits.</p>
      </section>

      <section className="bg-sand/60 py-[clamp(64px,8vw,120px)]" aria-labelledby="plan-h">
        <div className="wrap grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <SectionHeading eyebrow="How it works" title={<span id="plan-h">Three steps <em>to the day itself.</em></span>} />
            <ol className="mt-10 flex flex-col gap-8">
              {STEPS.map(([title, note], i) => (
                <li key={title} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-4">
                  <span className="font-serif text-[2.2rem] leading-none text-brass" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span className="h4 block">{title}</span>
                    <span className="mt-1 block text-ink-soft">{note}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <InquiryForm today={hotelToday()} defaultKind="event" kinds={["event", "group", "dining", "general"]} title="Tell us about your event" />
        </div>
      </section>

      <CtaBand eyebrow="Staying over?" title={<>Rooms for every guest, <em>upstairs.</em></>} body="Book rooms for your guests online, or ask the events team to hold a block of rooms with your event." bookHref="/rooms" bookLabel="See rooms" />
    </>
  );
}
