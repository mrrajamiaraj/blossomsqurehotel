# Blossom Square — Public site

Guest-facing pages, what each one reads, and what is still to be connected.
Built on the UI system in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## Pages

| Route | Data source | Rendering |
| ----- | ----------- | --------- |
| `/` | rooms + rates (Supabase), gallery files, reviews contract, rate offers | static, 5 min revalidate |
| `/rooms` | rooms, rates, live availability (`room_availability`) | dynamic (search params) |
| `/rooms/[slug]` | room type, availability, settings | dynamic |
| `/about`, `/facilities`, `/dining`, `/meetings-events` | `lib/content/*`, `lib/hotel.ts` | static |
| `/gallery` | `public/photos` (only files that exist) | static |
| `/offers` | derived from `room_types` rates (`rateOffers`) | static, 5 min |
| `/contact` | `lib/hotel.ts`, enquiry form → `submit_inquiry` | static + server action |
| `/faq` | `lib/content/faq.ts` + Admin → Settings policies | static, 5 min |
| `/booking` | existing 4-step flow → `create_booking` | dynamic |
| `/booking/confirmation` | private receipt cookie → `lookup_booking` | dynamic, noindex |
| `/booking/lookup` | `lookup_booking` (reference + phone/email) | server action, noindex |
| `/privacy`, `/terms` | describes what the site does; policies from Settings | static |
| `/admin/inquiries` | staff view of enquiries (`admin_set_inquiry_status`) | dynamic, staff only |

Also: `sitemap.xml`, `robots.txt`, schema.org `Hotel`, `HotelRoom`, `FAQPage`
and `BreadcrumbList` data, canonical URLs and Open Graph per page.

## Honesty rules (enforced in code and tests)

- **Prices** come only from `room_types`. Offers are computed from those rates; no page holds a price.
- **Availability** comes only from `room_availability`. Without a database nothing is shown as sold out, and online booking is off in production.
- **Bookings** are *requests*: the button says "Send booking request", the confirmation says "Booking request received / Awaiting confirmation" until staff confirm. The confirmation page reads the booking back from the database.
- **Payments**: none online. Guests pay at the hotel or send an advance; the site never shows a payment as successful.
- **Reviews**: `lib/content/reviews.ts` is empty; pages link to the hotel's Google listing instead. Add only real reviews with their source.
- **Photos**: only `public/photos/*`. Restaurant, pool and banquet slots show "Photograph to come" (or nothing in the gallery) until files named `RESTAURANT`, `POOL`, `BANQUET` are added.
- **Policies** left blank in Admin → Settings produce "ask the front desk" answers, never invented ones.

## Guest-services migrations (applied to production 2026-11-18)

- `20261117194739_guest_services.sql`: `inquiries`, `booking_lookup_attempts`, `submit_inquiry()`, `lookup_booking()`, `admin_set_inquiry_status()`. Additive, RLS on.
- `20261117194819_guest_services_staff_grant.sql`: `admin_set_inquiry_status` not executable by `anon` (matches the other `admin_*` functions).

Verified as `anon` (in a rolled-back transaction): can submit an enquiry and call `lookup_booking`; cannot read
`inquiries` or `booking_lookup_attempts`; the staff function refuses. Rollback statements are at the top of each file.

The app still degrades gracefully if these are missing (e.g. on a fresh staging project): forms offer WhatsApp/email,
lookup says it isn't available, and the confirmation page shows only what was accepted.

## Next phase (typed contracts already in place)

- `ReviewSource` (`lib/content/reviews.ts`): approved reviews from the database.
- `OfferSource` (`lib/content/offers.ts`): hotel-managed packages from an `offers` table.
- Online payment (bKash/Nagad/card gateway): needs a merchant account; not started.
- Email/SMS notification to the front desk on new enquiries and bookings.
- Photography: restaurant, pool, banquet hall, exterior and sea views.
