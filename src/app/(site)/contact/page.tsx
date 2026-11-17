import Image from "next/image";
import Link from "next/link";
import MapEmbed from "@/components/home/MapEmbed";
import { ArrowUpRight } from "@/components/icons";
import ContactActions from "@/components/site/ContactActions";
import InquiryForm from "@/components/site/InquiryForm";
import PageHero from "@/components/site/PageHero";
import CopyButton from "@/components/ui/CopyButton";
import { NEARBY } from "@/lib/content/location";
import { hotelToday } from "@/lib/dates";
import { HOTEL, WHATSAPP, directionsUrl } from "@/lib/hotel";
import { hotelJsonLd, JsonLd, pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Contact & location",
  description: `Call, WhatsApp or email Blossom Square Hotel & Suites. ${HOTEL.address}.`,
  path: "/contact",
});

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-line py-6 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
      <dt className="caps text-bronze">{label}</dt>
      <dd className="text-[1.02rem] leading-relaxed text-ink-soft">{children}</dd>
    </div>
  );
}

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact & location"
        title={
          <>
            Speak to us, <em>or come and see.</em>
          </>
        }
        lede="Our front desk answers calls and WhatsApp messages around the clock. For events and group stays, send a message and we'll come back with options."
        crumbs={[{ label: "Contact" }]}
        actions={<ContactActions message="Hello Blossom Square," />}
      />

      <section className="section pt-[clamp(48px,6vw,88px)]" aria-label="How to reach us">
        <div className="wrap grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-20">
          <div>
            <h2 className="h3">The front desk</h2>
            <dl className="mt-8">
              <Row label="Address">
                <span className="block">{HOTEL.address}</span>
                <span className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
                  <CopyButton text={HOTEL.address} label="Address" />
                  <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="text-link inline-flex min-h-11 items-center gap-1.5">
                    Directions in Google Maps <ArrowUpRight size={14} />
                  </a>
                </span>
              </Row>
              <Row label="Call">
                <span className="flex flex-col">
                  {HOTEL.phones.map((p) => (
                    <a key={p.href} href={p.href} className="text-link inline-flex min-h-11 w-fit items-center">
                      {p.display}
                    </a>
                  ))}
                </span>
              </Row>
              <Row label="WhatsApp">
                <span className="flex flex-wrap items-center gap-6">
                  <a href={WHATSAPP.href} target="_blank" rel="noopener noreferrer" className="text-link inline-flex min-h-11 items-center">
                    {WHATSAPP.display}
                  </a>
                  <Image src={WHATSAPP.qr} alt="QR code: scan to chat with Blossom Square on WhatsApp" width={104} height={104} className="border border-line bg-white p-1.5" />
                </span>
              </Row>
              <Row label="Email">
                <a href={`mailto:${HOTEL.email}`} className="text-link inline-flex min-h-11 items-center break-all">
                  {HOTEL.email}
                </a>
              </Row>
              <Row label="Check-in / out">
                From {HOTEL.checkIn} · until {HOTEL.checkOut}
              </Row>
              <Row label="Arriving">
                Airport pickup and drop-off on request, at an extra charge.{" "}
                <Link href="/faq" className="text-link">
                  More questions
                </Link>
              </Row>
            </dl>
          </div>

          <InquiryForm today={hotelToday()} />
        </div>
      </section>

      <section id="map" className="scroll-mt-[var(--header-h)] bg-sand/60 py-[clamp(64px,8vw,120px)]" aria-labelledby="map-h">
        <div className="wrap grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-center">
          <div>
            <p className="caps eyebrow">Find us</p>
            <h2 id="map-h" className="h2 mt-5">
              In the heart <em>of Kolatoli.</em>
            </h2>
            <p className="lede mt-5">Cox&apos;s Bazar&apos;s hotel quarter, a few minutes on foot from the beach.</p>
            <ul role="list" className="mt-8 divide-y divide-line border-y border-line">
              {NEARBY.map(([place, note]) => (
                <li key={place} className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-4">
                  <span className="text-ink">{place}</span>
                  <span className="text-sm text-muted-foreground">{note}</span>
                </li>
              ))}
            </ul>
          </div>
          <MapEmbed />
        </div>
      </section>

      <JsonLd data={hotelJsonLd()} />
    </>
  );
}
