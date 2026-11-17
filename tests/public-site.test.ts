import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFaqs } from "@/lib/content/faq";
import { galleryItems, missingCategories } from "@/lib/content/gallery";
import { rateOffers } from "@/lib/content/offers";
import { getReviews } from "@/lib/content/reviews";
import { DEFAULT_SETTINGS } from "@/lib/data/repo";
import { PREVIEW_ROOM_TYPES } from "@/lib/data/preview-seed";
import { PreviewRepo } from "@/lib/data/preview-repo";
import { errorCode } from "@/lib/data/errors";
import { inquiryText, normaliseReference, validateInquiry, validContact, type InquiryForm } from "@/lib/guest-services";
import { DEFAULT_FILTERS, filterParams, filterRooms, fitsParty, parseFilters, type FilterRoom } from "@/lib/room-filters";
import type { Stay } from "@/lib/stay";

const stay: Stay = { checkIn: "2030-03-03", checkOut: "2030-03-06", adults: 2, children: 0, rooms: 1 };
const rooms: (FilterRoom & { name: string })[] = PREVIEW_ROOM_TYPES.map((r) => ({
  slug: r.slug,
  name: r.name,
  tag: r.tag,
  sleeps: r.sleeps,
  features: r.features,
  rates: { price_bdt: r.price_bdt, weekend_price_bdt: r.weekend_price_bdt, rack_price_bdt: r.rack_price_bdt },
  available: 2,
}));

describe("room filters", () => {
  it("mirror the database capacity rule: sleeps adults per room plus one child", () => {
    expect(fitsParty({ sleeps: 2 }, { adults: 2, children: 1, rooms: 1 })).toBe(true);
    expect(fitsParty({ sleeps: 2 }, { adults: 3, children: 0, rooms: 1 })).toBe(false);
    expect(fitsParty({ sleeps: 2 }, { adults: 2, children: 2, rooms: 1 })).toBe(false);
    expect(fitsParty({ sleeps: 2 }, { adults: 4, children: 0, rooms: 2 })).toBe(true);
  });

  it("keep all seven room types by default for two adults", () => {
    expect(filterRooms(rooms, DEFAULT_FILTERS, stay, true)).toHaveLength(7);
  });

  it("filter by type, balcony and party size", () => {
    expect(filterRooms(rooms, { ...DEFAULT_FILTERS, type: "suite" }, stay, true).every((r) => r.tag === "SUITE")).toBe(true);
    expect(filterRooms(rooms, { ...DEFAULT_FILTERS, type: "room" }, stay, true).every((r) => r.tag !== "SUITE")).toBe(true);
    expect(filterRooms(rooms, { ...DEFAULT_FILTERS, balcony: true }, stay, true).every((r) => r.features.includes("Balcony"))).toBe(true);
    const family = filterRooms(rooms, DEFAULT_FILTERS, { ...stay, adults: 5 }, true);
    expect(family.map((r) => r.slug)).toEqual(["executive-family-suite"]);
  });

  it("hide sold-out types only when asked, and only with live availability", () => {
    const some = rooms.map((r, i) => ({ ...r, available: i % 2 }));
    const f = { ...DEFAULT_FILTERS, availableOnly: true };
    expect(filterRooms(some, f, stay, true).every((r) => r.available >= 1)).toBe(true);
    expect(filterRooms(some, f, stay, false)).toHaveLength(7);
  });

  it("sort by stay total", () => {
    const asc = filterRooms(rooms, { ...DEFAULT_FILTERS, sort: "price-asc" }, stay, true).map((r) => r.rates.price_bdt);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = filterRooms(rooms, { ...DEFAULT_FILTERS, sort: "price-desc" }, stay, true).map((r) => r.rates.price_bdt);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });

  it("round-trip through the URL and ignore junk", () => {
    const f = { ...DEFAULT_FILTERS, type: "suite" as const, balcony: true, sort: "space" as const, fitsParty: false };
    expect(parseFilters(filterParams(f))).toEqual(f);
    expect(parseFilters({ type: "<script>", sort: "drop table", fits: "maybe" })).toEqual(DEFAULT_FILTERS);
    expect(filterParams(DEFAULT_FILTERS)).toEqual({});
  });
});

describe("enquiry validation", () => {
  const ok: InquiryForm = { kind: "general", name: "Ayesha", email: "", phone: "+880 1711-000000", message: "Do you have a sea-facing room?" };

  it("accepts a phone-only or email-only message", () => {
    expect(validateInquiry(ok, "2030-01-01")).toEqual({});
    expect(validateInquiry({ ...ok, phone: "", email: "a@b.co" }, "2030-01-01")).toEqual({});
  });

  it("requires a way to reply, a name and a real message", () => {
    expect(validateInquiry({ ...ok, phone: "" }, "2030-01-01").contact).toBeTruthy();
    expect(validateInquiry({ ...ok, name: "A" }, "2030-01-01").name).toBeTruthy();
    expect(validateInquiry({ ...ok, message: "hi" }, "2030-01-01").message).toBeTruthy();
    expect(validateInquiry({ ...ok, email: "not-an-email" }, "2030-01-01").email).toBeTruthy();
    expect(validateInquiry({ ...ok, kind: "admin" }, "2030-01-01").kind).toBeTruthy();
  });

  it("checks event dates and guest numbers", () => {
    expect(validateInquiry({ ...ok, kind: "event", eventDate: "2029-12-31" }, "2030-01-01").eventDate).toBeTruthy();
    expect(validateInquiry({ ...ok, kind: "event", guests: "0" }, "2030-01-01").guests).toBeTruthy();
    expect(validateInquiry({ ...ok, kind: "event", eventDate: "2030-02-01", guests: "120" }, "2030-01-01")).toEqual({});
  });

  it("builds the WhatsApp / email fallback text from the guest's own words", () => {
    const t = inquiryText({ ...ok, kind: "event", eventDate: "2030-02-01", guests: "120" });
    expect(t).toContain("Ayesha");
    expect(t).toContain("Do you have a sea-facing room?");
    expect(t).toContain("Guests: 120");
  });
});

describe("booking lookup input", () => {
  it("normalises references", () => {
    expect(normaliseReference("BSQ-01234")).toBe("BSQ-01234");
    expect(normaliseReference(" bsq 01234 ")).toBe("BSQ-01234");
    expect(normaliseReference("01234")).toBe("BSQ-01234");
    expect(normaliseReference("BSQ-1234")).toBeNull();
    expect(normaliseReference("'; drop table bookings")).toBeNull();
  });

  it("accepts a phone number or an email as contact", () => {
    expect(validContact("+880 1711-204118")).toBe(true);
    expect(validContact("guest@example.com")).toBe(true);
    expect(validContact("1234")).toBe(false);
  });

  it("finds a booking only when reference and contact both match", async () => {
    const repo = new PreviewRepo();
    const ref = await repo.createWebsiteBooking({
      room: "deluxe-couple",
      checkIn: "2030-04-01",
      checkOut: "2030-04-03",
      rooms: 1,
      adults: 2,
      children: 0,
      name: "Lookup Tester",
      email: "lookup.tester@example.com",
      phone: "+880 1999-123456",
      country: "Bangladesh",
      arrival: "",
      requests: "",
      airportPickup: false,
    });
    const byPhone = await repo.lookupBooking(ref, "01999123456");
    expect(byPhone?.reference).toBe(ref);
    expect(byPhone?.status).toBe("pending");
    expect(byPhone?.guest_name).toBe("Lookup"); // first name only
    expect(await repo.lookupBooking(ref, "LOOKUP.tester@example.com")).not.toBeNull();
    expect(await repo.lookupBooking(ref, "someone.else@example.com")).toBeNull();
    expect(await repo.lookupBooking("BSQ-00000", "01999123456")).toBeNull();
  });
});

describe("enquiries in the preview store", () => {
  it("are stored, throttled per contact, and hidden from guests", async () => {
    const repo = new PreviewRepo();
    const input = { kind: "general" as const, name: "Throttle Test", email: "throttle@example.com", phone: null, message: "A message long enough.", eventDate: null, guests: null };
    for (let i = 0; i < 3; i++) expect(await repo.submitInquiry(input)).toMatch(/^ENQ-\d{6}$/);
    await expect(repo.submitInquiry(input)).rejects.toThrow("RATE_LIMITED");
    await expect(repo.listInquiries({})).rejects.toThrow("NOT_STAFF");
    const staff = new PreviewRepo({ name: "Desk", role: "receptionist" });
    const list = await staff.listInquiries({ status: "new" });
    expect(list.some((q) => q.email === "throttle@example.com")).toBe(true);
  });

  it("map a missing database function to UNAVAILABLE, not a crash", () => {
    expect(errorCode(new Error("Could not find the function public.submit_inquiry(p_email) in the schema cache"))).toBe("UNAVAILABLE");
    expect(errorCode(new Error("SOLD_OUT"))).toBe("SOLD_OUT");
  });
});

describe("content honesty", () => {
  it("offers come from the rates, with no prices of their own", () => {
    const offers = rateOffers(PREVIEW_ROOM_TYPES);
    expect(offers.map((o) => o.id)).toEqual(["direct", "midweek"]);
    const best = PREVIEW_ROOM_TYPES.reduce((m, r) => Math.max(m, Math.round(((r.rack_price_bdt! - r.price_bdt) / r.rack_price_bdt!) * 100)), 0);
    expect(offers[0].accent).toContain(`${best}%`);
    expect(rateOffers(PREVIEW_ROOM_TYPES.map((r) => ({ ...r, rack_price_bdt: null, weekend_price_bdt: null })))).toEqual([]);
  });

  it("FAQs never invent a policy the hotel hasn't set", () => {
    const blank = buildFaqs(DEFAULT_SETTINGS).flatMap((g) => g.items);
    const cancel = blank.find((f) => f.q.includes("cancellation"))!;
    expect(cancel.a).toContain("front desk explains");
    const set = buildFaqs({ ...DEFAULT_SETTINGS, cancellation_policy: "Free until 48 hours before arrival." }).flatMap((g) => g.items);
    expect(set.find((f) => f.q.includes("cancellation"))!.a).toBe("Free until 48 hours before arrival.");
  });

  it("there are no unsourced reviews", async () => {
    for (const r of await getReviews()) expect(r.source).toBeTruthy();
  });

  it("the gallery shows only photographs that exist", () => {
    const items = galleryItems();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((p) => p.src?.startsWith("/photos/"))).toBe(true);
    // Spaces without photos are reported, not filled with stand-ins.
    expect(missingCategories(items).map((c) => c.id)).toContain("pool");
  });

  it("no page links to stock-photo hosts", () => {
    const pages = ["src/app/(site)/page.tsx", "src/app/(site)/dining/page.tsx", "src/app/(site)/about/page.tsx", "src/app/(site)/gallery/page.tsx"];
    for (const p of pages) expect(readFileSync(p, "utf8")).not.toMatch(/unsplash|pexels|shutterstock|istock|pixabay/i);
  });
});
