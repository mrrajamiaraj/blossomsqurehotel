import "server-only";
import { photo, type Photo } from "../photos";

export type GalleryCategory = "rooms" | "suites" | "interiors" | "dining" | "pool" | "events";

export type GalleryItem = Photo & { category: GalleryCategory; caption: string };

export const GALLERY_CATEGORIES: { id: GalleryCategory; label: string }[] = [
  { id: "rooms", label: "Rooms" },
  { id: "suites", label: "Suites" },
  { id: "interiors", label: "Interiors" },
  { id: "dining", label: "Dining" },
  { id: "pool", label: "Pool" },
  { id: "events", label: "Events" },
];

/**
 * The hotel's own photographs, described from what they show. Slots for
 * spaces not yet photographed (restaurant, pool, banquet hall) are listed
 * too: they render nothing until a file named after the ref is added to
 * public/photos, so the gallery never shows stand-in imagery.
 */
const ITEMS: { ref: string; category: GalleryCategory; alt: string; caption: string }[] = [
  { ref: "DSC5566", category: "suites", alt: "Connecting King Suite in the evening, pendant lamps lit above the bed", caption: "Connecting King Suite" },
  { ref: "WA0013", category: "suites", alt: "King bed with gold cushions and throw, two swirl paintings on the wall behind", caption: "Connecting King Suite" },
  { ref: "DSC5565", category: "suites", alt: "Suite bedroom: king bed on a timber platform between two swirl paintings, floor-length curtains", caption: "Suite bedroom" },
  { ref: "WA0018", category: "suites", alt: "Back-lit oval mirror over a dressing counter, with a wall-mounted TV", caption: "Suite dressing area" },
  { ref: "DSC5575", category: "rooms", alt: "Queen bed and single bed side by side, a woven jute disc and an abstract painting above", caption: "Premium Twin" },
  { ref: "DSC5551", category: "rooms", alt: "Queen bed with towel swans, a back-lit woven jute disc above the headboard", caption: "Couple's room" },
  { ref: "DSC5552", category: "rooms", alt: "Turn-down in a Deluxe Couple room", caption: "Deluxe Couple" },
  { ref: "DSC5555", category: "rooms", alt: "Queen bed beneath a back-lit woven jute disc, door open to the corridor", caption: "Couple's room" },
  { ref: "DSC5550", category: "rooms", alt: "Queen bed with towel swans and a gold throw, desk and telephone in the foreground", caption: "Couple's room" },
  { ref: "DSC5579", category: "rooms", alt: "Standard Couple room, curtains drawn", caption: "Standard Couple" },
  { ref: "DSC5578", category: "rooms", alt: "Bright room with a queen bed, a small sofa and an abstract painting by the door", caption: "Standard Couple" },
  { ref: "DSC5562", category: "interiors", alt: "The upstairs corridor, with original artwork on the walls", caption: "Upstairs corridor" },
  { ref: "RESTAURANT", category: "dining", alt: "The restaurant and café", caption: "Restaurant & café" },
  { ref: "POOL", category: "pool", alt: "The swimming pool", caption: "Swimming pool" },
  { ref: "BANQUET", category: "events", alt: "The banquet hall", caption: "Banquet hall" },
];

/** Only photographs that exist. */
export function galleryItems(): GalleryItem[] {
  return ITEMS.map((i) => ({ ...photo(i.ref, i.alt, "forest"), category: i.category, caption: i.caption })).filter((p) => p.src);
}

/** Categories that have at least one real photo, in display order. */
export function categoriesWithPhotos(items: GalleryItem[]) {
  return GALLERY_CATEGORIES.filter((c) => items.some((i) => i.category === c.id));
}

/** Spaces still waiting for photography, for an honest note on the gallery page. */
export function missingCategories(items: GalleryItem[]) {
  return GALLERY_CATEGORIES.filter((c) => !items.some((i) => i.category === c.id));
}

export { type Photo };
