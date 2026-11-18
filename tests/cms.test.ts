// Website content rules: every built-in section is valid as shipped, saves are
// cleaned and checked, published values merge safely over the defaults, and
// the derived pieces (accents, contact links, room status) behave.
import { describe, expect, it } from "vitest";
import { accentParts } from "@/components/cms/Accent";
import { allFields, imageSourceOk, mergeDefaults, validate } from "@/lib/cms/fields";
import { dialable, toHotelInfo } from "@/lib/cms/hotel-info";
import { SECTIONS, sectionDef, type ContactContent } from "@/lib/cms/sections";
import { buildFaqs } from "@/lib/content/faq";
import { DEFAULT_SETTINGS } from "@/lib/data/repo";
import { roomStatus } from "@/lib/room-status";

const BASE = "https://abc.supabase.co";

describe("built-in sections", () => {
  it("every section's built-in text passes its own validation unchanged", () => {
    for (const s of SECTIONS) {
      const defaults =
        s.key === "faq"
          ? { ...s.defaults, groups: buildFaqs(DEFAULT_SETTINGS).map((g) => ({ title: g.title, items: g.items.map((i) => ({ q: i.q, a: i.a })) })) }
          : s.defaults;
      const { value, errors } = validate(allFields(s.groups), defaults, BASE);
      expect(errors, s.key).toEqual([]);
      expect(mergeDefaults(defaults, value), s.key).toEqual(defaults);
    }
  });

  it("covers every area the hotel asked to edit", () => {
    const keys = SECTIONS.map((s) => s.key);
    for (const k of ["home", "about", "dining", "events", "facilities", "faq", "offers", "contact", "policies", "footer", "seo"]) expect(keys).toContain(k);
    expect(sectionDef("nope")).toBeNull();
  });
});

describe("saving content", () => {
  const fields = allFields(sectionDef("home")!.groups);

  it("drops unknown keys, trims text and strips control characters", () => {
    const { value } = validate(fields, { hero_title: "  Hello *sea*\u0007 ", evil: "<script>" }, BASE);
    expect(value.hero_title).toBe("Hello *sea*");
    expect(value).not.toHaveProperty("evil");
  });

  it("refuses images from other websites and photos without a description", () => {
    const outside = validate(fields, { hero_photo: { src: "https://evil.example/x.jpg", alt: "A photo" } }, BASE);
    expect(outside.errors.map((e) => e.path)).toContain("hero_photo");
    const noAlt = validate(fields, { hero_photo: { src: "DSC5566", alt: "" } }, BASE);
    expect(noAlt.errors.find((e) => e.path === "hero_photo")?.message).toMatch(/describe the photo/);
    const ok = validate(fields, { hero_photo: { src: `${BASE}/storage/v1/object/public/site-media/home/a.webp`, alt: "The pool" } }, BASE);
    expect(ok.errors.filter((e) => e.path === "hero_photo")).toEqual([]);
  });

  it("checks lengths, single lines, required fields and list sizes, with the field's path", () => {
    const { errors } = validate(
      fields,
      { hero_title: "", hero_lede: "x".repeat(300), intro_title: "one\ntwo", intro_facts: Array.from({ length: 6 }, () => ({ value: "1", label: "x" })) },
      BASE,
    );
    const paths = errors.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["hero_title", "hero_lede", "intro_title", "intro_facts"]));
  });

  it("only allows safe links", () => {
    const offerFields = allFields(sectionDef("offers")!.groups);
    const { errors } = validate(offerFields, { packages: [{ title: "Honeymoon", href: "javascript:alert(1)" }] }, BASE);
    expect(errors.map((e) => e.path)).toContain("packages.0.href");
    const contact = allFields(sectionDef("contact")!.groups);
    const r = validate(contact, { social: [{ label: "Facebook", href: "http://insecure.example" }] }, BASE);
    expect(r.errors.map((e) => e.path)).toContain("social.0.href");
  });

  it("image sources: hotel photo refs, site paths and this project's public buckets only", () => {
    expect(imageSourceOk("DSC5566", BASE)).toBe(true);
    expect(imageSourceOk("/photos/DSC5566.jpg", BASE)).toBe(true);
    expect(imageSourceOk(`${BASE}/storage/v1/object/public/room-photos/x/y.jpg`, BASE)).toBe(true);
    expect(imageSourceOk(`${BASE}/storage/v1/object/public/guest-documents/bookings/x.pdf`, BASE)).toBe(false);
    expect(imageSourceOk(`${BASE}/storage/v1/object/public/site-media/../x.jpg`, BASE)).toBe(false);
    expect(imageSourceOk("https://other.supabase.co/storage/v1/object/public/site-media/a.jpg", BASE)).toBe(false);
  });
});

describe("published content over the built-in text", () => {
  const defaults = sectionDef("home")!.defaults;

  it("falls back field by field, and ignores values of the wrong shape", () => {
    const merged = mergeDefaults(defaults, { hero_title: "New *title*", hero_lede: 42, amenities: "not a list" });
    expect(merged.hero_title).toBe("New *title*");
    expect(merged.hero_lede).toBe(defaults.hero_lede);
    expect(merged.amenities).toEqual(defaults.amenities);
  });

  it("keeps a photo the editor removed removed", () => {
    expect(mergeDefaults(defaults, { bay_photo: null }).bay_photo).toBeNull();
    expect(mergeDefaults(defaults, {}).bay_photo).toEqual(defaults.bay_photo);
  });

  it("returns the defaults for missing or broken content", () => {
    expect(mergeDefaults(defaults, null)).toEqual(defaults);
    expect(mergeDefaults(defaults, [1, 2])).toEqual(defaults);
  });
});

describe("derived pieces", () => {
  it("accented headings", () => {
    expect(accentParts("Seafood from these shores, *breakfast on us.*")).toEqual([
      { text: "Seafood from these shores, ", em: false },
      { text: "breakfast on us.", em: true },
    ]);
    expect(accentParts("No accent")).toEqual([{ text: "No accent", em: false }]);
  });

  it("phone and WhatsApp links from the numbers editors type", () => {
    expect(dialable("+880 1805-006900")).toBe("+8801805006900");
    expect(dialable("01805-006900")).toBe("+8801805006900");
    const c = sectionDef("contact")!.defaults as unknown as ContactContent;
    const info = toHotelInfo(c);
    expect(info.phones[0].href).toBe("tel:+8801805006900");
    expect(info.whatsapp).toMatchObject({ href: "https://wa.me/8801805006900", qr: "/brand/whatsapp-qr.png" });
    // A new number has no matching printed QR code, so none is shown.
    expect(toHotelInfo({ ...c, whatsapp: "01711-000000" }).whatsapp).toMatchObject({ href: "https://wa.me/8801711000000", qr: null });
  });

  it("room status: out of service and occupied come first, then the housekeeping status", () => {
    expect(roomStatus({ housekeeping: "clean", out_of_service: true, occupied: true })).toBe("out_of_service");
    expect(roomStatus({ housekeeping: "dirty", out_of_service: false, occupied: true })).toBe("occupied");
    expect(roomStatus({ housekeeping: "cleaning", out_of_service: false, occupied: true })).toBe("cleaning");
    expect(roomStatus({ housekeeping: "inspected", out_of_service: false, occupied: false })).toBe("inspected");
  });
});
