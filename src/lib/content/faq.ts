import type { HotelSettings } from "../data/types";
import { HOTEL, PAYMENT_METHODS, WHATSAPP } from "../hotel";
import { taxNote, WEEKEND_LABEL } from "../pricing";

export type Faq = { q: string; a: string; link?: { label: string; href: string } };
export type FaqGroup = { id: string; title: string; items: Faq[] };

const methods = PAYMENT_METHODS.map((m) => ({ bkash: "bKash", nagad: "Nagad", bank: "bank transfer" })[m.id]).join(", ");

/**
 * Answers come from the hotel's published facts (lib/hotel.ts) and the
 * policies managers keep in Admin → Settings. A policy left blank in Settings
 * gets a "please ask us" answer rather than an invented one.
 */
export function buildFaqs(settings: HotelSettings): FaqGroup[] {
  const call = `call ${HOTEL.phones[0].display} or WhatsApp ${WHATSAPP.display}`;
  return [
    {
      id: "booking",
      title: "Booking & payment",
      items: [
        {
          q: "How does booking on the website work?",
          a: `Choose your dates and room, add your details and send the request. The room is held for you straight away, and our front desk calls you ${
            settings.confirm_call_within ? `within ${settings.confirm_call_within}` : "shortly"
          } to confirm. No payment is taken online.`,
          link: { label: "Start a booking", href: "/booking" },
        },
        {
          q: "Do I need to pay online?",
          a: `No. You can pay at the hotel when you arrive, or send an advance by ${methods} to confirm faster. Online card payment isn't available yet.`,
        },
        {
          q: "Which payment methods do you accept?",
          a: `${methods.charAt(0).toUpperCase() + methods.slice(1)}, and cash at the hotel. The account numbers are shown after you book and on your booking page.`,
        },
        {
          q: "Why are some nights more expensive?",
          a: `Weekday rates apply to Sunday to Wednesday nights. ${WEEKEND_LABEL} are charged at the weekend rate. Your total shows the breakdown night by night before you send the request.`,
        },
        {
          q: "Are taxes included in the price?",
          a: taxNote(settings) || "Room rates are shown before VAT and service charge, which are added at check-in.",
        },
        {
          q: "What is the cancellation policy?",
          a: settings.cancellation_policy || `Our front desk explains the cancellation terms when they confirm your booking. For anything specific, please ${call}.`,
        },
        {
          q: "How can I check or change my booking?",
          a: `Look it up with your booking reference and the phone number or email you booked with. To change dates or rooms, please ${call}.`,
          link: { label: "Find my booking", href: "/booking/lookup" },
        },
      ],
    },
    {
      id: "stay",
      title: "Your stay",
      items: [
        {
          q: "What are check-in and check-out times?",
          a: `Check-in is from ${HOTEL.checkIn} and check-out is until ${HOTEL.checkOut}. Early check-in and late check-out are on request, subject to availability.`,
        },
        { q: "Is breakfast included?", a: "Yes. A breakfast buffet is included with every room, for every guest on the booking." },
        {
          q: "Can children stay, and do you have extra beds?",
          a: settings.children_policy || `Children are welcome. Each room sleeps the number of guests shown on it, and we'll advise on extra beds when you ${call}.`,
        },
        { q: "Is there Wi-Fi?", a: "Yes, free high-speed Wi-Fi in every room and throughout the hotel." },
        { q: "Is there a swimming pool?", a: "Yes. The pool is open daily and free for hotel guests." },
        { q: "Do you have room service?", a: "Yes, twenty-four hours a day." },
        { q: "Can I bring my pet?", a: "We're sorry, we're unable to accommodate pets." },
      ],
    },
    {
      id: "getting-here",
      title: "Getting here",
      items: [
        { q: "Where is the hotel?", a: `${HOTEL.address}. The beach is a few minutes on foot.`, link: { label: "Map & directions", href: "/contact#map" } },
        { q: "Do you offer airport transfers?", a: "Yes. Airport pickup and drop-off can be arranged on request, at an extra charge. Tick the option when you book, or ask us." },
        { q: "Is there parking?", a: "Yes, free on-site parking for guests." },
      ],
    },
  ];
}
