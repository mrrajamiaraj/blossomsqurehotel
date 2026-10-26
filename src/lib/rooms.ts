import { getSupabase } from "./supabase";

export type RoomType = {
  slug: string;
  name: string;
  tag: "SUITE" | "DELUXE";
  bed: string;
  size_sqft: number | null;
  sleeps: number;
  price_bdt: number;
  blurb: string;
  features: string[];
  photo_ref: string;
};

// Mirrors the seed rows in supabase/migrations so the site renders before
// Supabase is connected (and if it's unreachable).
const SEED_ROOMS: RoomType[] = [
  {
    slug: "king-suite",
    name: "King Suite",
    tag: "SUITE",
    bed: "Double bed",
    size_sqft: null,
    sleeps: 2,
    price_bdt: 12500,
    blurb: "Our largest room on the second floor, with a private balcony looking out to the bay.",
    features: ["Double bed", "Balcony", "Sea view"],
    photo_ref: "KING SUITE · DSC5566",
  },
  {
    slug: "business-queen-suite",
    name: "Business Queen Suite",
    tag: "SUITE",
    bed: "Queen bed",
    size_sqft: null,
    sleeps: 2,
    price_bdt: 10500,
    blurb: "A calm second-floor suite with a work desk, for trips that mix meetings and the beach.",
    features: ["Queen bed", "Work desk", "Sea view"],
    photo_ref: "QUEEN SUITE · DSC5579",
  },
  {
    slug: "deluxe-couple",
    name: "Deluxe Couple",
    tag: "DELUXE",
    bed: "Double bed",
    size_sqft: null,
    sleeps: 2,
    price_bdt: 7800,
    blurb: "Everything you need for two: sea view, balcony, mini bar and breakfast included.",
    features: ["Double bed", "Balcony", "Sea view"],
    photo_ref: "DELUXE COUPLE · DSC5550",
  },
];

export async function getRoomTypes(): Promise<RoomType[]> {
  const supabase = getSupabase();
  if (!supabase) return SEED_ROOMS;

  const { data, error } = await supabase
    .from("room_types")
    .select("slug, name, tag, bed, size_sqft, sleeps, price_bdt, blurb, features, photo_ref")
    .eq("is_published", true)
    .order("sort_order");

  if (error || !data?.length) {
    if (error) console.error("Failed to load room_types:", error.message);
    return SEED_ROOMS;
  }
  return data as RoomType[];
}

export function formatTaka(amount: number): string {
  return `৳${amount.toLocaleString("en-US")}`;
}
