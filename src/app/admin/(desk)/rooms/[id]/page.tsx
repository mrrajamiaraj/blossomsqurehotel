import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/kit";
import { RoomPhotos } from "@/components/admin/RoomsEditors";
import { AmenitiesPicker, RoomTypeDetailsForm, SeasonsPanel } from "@/components/admin/RoomTypeSetup";
import { can } from "@/lib/access";
import { requireAdmin } from "@/lib/admin/session";
import { hotelToday } from "@/lib/dates";
import { OperationsRepo, type AmenityRow, type SeasonalRate } from "@/lib/data/operations";
import { photo } from "@/lib/photos";
import { getSessionClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Room type" };

export default async function RoomTypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { repo, access, mode } = await requireAdmin();
  const type = (await repo.listRoomTypes({ includeUnpublished: true })).find((t) => t.id === id);
  if (!type) notFound();

  let amenities: AmenityRow[] = [];
  let links: { room_type_id: string; amenity_id: string }[] = [];
  let seasons: SeasonalRate[] = [];
  if (mode === "live") {
    const ops = new OperationsRepo(await getSessionClient());
    [amenities, links, seasons] = await Promise.all([
      ops.amenities().catch(() => []),
      ops.roomTypeAmenities().catch(() => []),
      can(access, "rates.manage") || can(access, "rooms.manage") ? ops.seasonalRates().catch(() => []) : Promise.resolve([]),
    ]);
  }
  const manager = can(access, "rooms.manage");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 960 }}>
      <PageHeader
        eyebrow="Rooms & rates"
        title={type.name}
        description={type.is_published ? "Bookable online. Prices are set on the Rooms & rates page." : "Hidden from the website until you tick “Bookable online” on the Rooms & rates page."}
        actions={
          <span style={{ display: "flex", gap: 8 }}>
            <Link href="/admin/rooms" className="a-btn">
              ← Rooms &amp; rates
            </Link>
            {type.is_published && (
              <Link href={`/rooms/${type.slug}`} className="a-btn" target="_blank">
                View on website
              </Link>
            )}
          </span>
        }
      />
      {mode === "preview" && <p className="a-hint">Changes here need Supabase.</p>}
      <RoomTypeDetailsForm
        canEdit={manager && mode === "live"}
        initial={{ id: type.id, name: type.name, tag: type.tag, bed: type.bed, sleeps: type.sleeps, view: type.view, size_sqft: type.size_sqft, blurb: type.blurb, description: type.description, features: type.features }}
      />
      <section className="a-panel">
        <div className="a-panel-head">
          <h2 className="a-h2">Photo gallery</h2>
          <span className="a-hint">Up to 12 photos. Use the arrows to change the order; the first is the cover.</span>
        </div>
        <RoomPhotos typeId={type.id} name={type.name} photos={type.gallery.map((ref) => ({ ref, src: photo(ref, "").src }))} canEdit={manager} />
      </section>
      <AmenitiesPicker typeId={type.id} amenities={amenities} selected={links.filter((l) => l.room_type_id === type.id).map((l) => l.amenity_id)} canEdit={manager && mode === "live"} />
      <SeasonsPanel typeId={type.id} seasons={seasons.filter((s) => s.room_type_id === type.id)} today={hotelToday()} canEdit={can(access, "rates.manage") && mode === "live"} basePrice={type.price_bdt} />
    </div>
  );
}
