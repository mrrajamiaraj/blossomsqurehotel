import Link from "next/link";
import LegalPage from "@/components/site/LegalPage";
import { getHotelInfo } from "@/lib/cms/content";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Privacy notice",
  description: "How Blossom Square Hotel & Suites uses the details you give us when you book, send a message or look up a booking.",
  path: "/privacy",
});

// Describes what this website actually does. Review with the hotel's adviser
// before relying on it as a legal document (see docs/PUBLIC_SITE.md).
export const revalidate = 300;

export default async function PrivacyPage() {
  const HOTEL = await getHotelInfo();
  const mail = <a href={`mailto:${HOTEL.email}`}>{HOTEL.email}</a>;
  return (
    <LegalPage
      crumb="Privacy"
      updated="18 November 2026"
      title={
        <>
          Your details, <em>kept for your stay.</em>
        </>
      }
      lede="What we collect when you book, message us or look up a booking on this website, why, where it's kept and how to ask us to change or delete it."
      sections={[
        {
          id: "who",
          title: "Who we are",
          body: (
            <p>
              {HOTEL.fullName}, {HOTEL.address}. Questions about your information: {mail}
              {HOTEL.phones[0] ? ` or ${HOTEL.phones[0].display}` : ""}.
            </p>
          ),
        },
        {
          id: "collect",
          title: "What we collect",
          body: (
            <ul>
              <li>
                <strong>Booking requests:</strong> your name, email, phone, country, expected arrival time, special requests, whether you
                need an airport transfer, and your stay (dates, room, guests).
              </li>
              <li>
                <strong>Messages:</strong> your name, phone and/or email, your message, and for events the date and number of guests.
              </li>
              <li>
                <strong>Booking lookups:</strong> the reference and phone or email you enter are checked against your booking and not
                stored. We keep the reference and time of each attempt for a short period to stop misuse.
              </li>
              <li>
                <strong>Technical information:</strong> our hosting provider records standard request logs (such as IP address and
                browser) to keep the site secure and working.
              </li>
            </ul>
          ),
        },
        {
          id: "use",
          title: "How we use it",
          body: (
            <>
              <p>
                Only to handle your booking or message: to hold and confirm your room, call or email you about your stay, prepare for
                your arrival, take payment at the hotel, and keep the records the law requires of a hotel.
              </p>
              <p>We don&apos;t sell your information, and we don&apos;t use it for advertising.</p>
            </>
          ),
        },
        {
          id: "where",
          title: "Where it's kept",
          body: (
            <ul>
              <li>Bookings and messages are stored in our database with Supabase (servers in Singapore), protected by access controls so only our staff can read them.</li>
              <li>The website is hosted by Vercel.</li>
              <li>The map on our contact page loads from Google only when you choose to open it.</li>
              <li>WhatsApp links open WhatsApp; anything you send there is handled under WhatsApp&apos;s own terms.</li>
            </ul>
          ),
        },
        {
          id: "cookies",
          title: "Cookies and storage",
          body: (
            <>
              <p>We use no advertising or tracking cookies. The site stores only what it needs to work:</p>
              <ul>
                <li>your day/night theme choice, in your browser;</li>
                <li>booking details you&apos;ve typed, in your browser for that visit, so a refresh doesn&apos;t lose them;</li>
                <li>a cookie for two hours after you book, so the confirmation page can show your booking;</li>
                <li>sign-in cookies for hotel staff using the front-desk system.</li>
              </ul>
            </>
          ),
        },
        {
          id: "keep",
          title: "How long we keep it",
          body: <p>For as long as we need it for your stay and for the hotel&apos;s accounting and legal records. Messages that don&apos;t lead to a booking are deleted when no longer needed.</p>,
        },
        {
          id: "rights",
          title: "Your choices",
          body: (
            <p>
              You can ask to see the information we hold about you, correct it, or delete it where we&apos;re not required to keep it.
              Email {mail} or ask at the front desk. You can check your booking any time on <Link href="/booking/lookup">Find my booking</Link>.
            </p>
          ),
        },
        {
          id: "changes",
          title: "Changes to this notice",
          body: <p>If we change how we use your information, we&apos;ll update this page and the date at the top.</p>,
        },
      ]}
    />
  );
}
