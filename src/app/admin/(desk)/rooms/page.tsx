import type { Metadata } from "next";
import Link from "next/link";
import { AddRoomForm, RoomPhotos, RoomTile, RoomTypeEditor } from "@/components/admin/RoomsEditors";
import { MaintenanceBlocks, NewRoomType } from "@/components/admin/RoomTypeSetup";
import { OperationsRepo, type RoomBlock } from "@/lib/data/operations";
import { getSessionClient } from "@/lib/supabase";
import { can } from "@/lib/access";
import { requireAdmin } from "@/lib/admin/session";
import { addDays, hotelToday } from "@/lib/dates";
import { photo } from "@/lib/photos";
import { WEEKEND_LABEL } from "@/lib/pricing";

export const metadata: Metadata = { title: "Rooms & rates" };

export default async function RoomsPage() {
  const { repo, access, mode } = await requireAdmin();
  const today = hotelToday();
  const canBlock = can(access, "maintenance.manage") && mode === "live";
  const [types, rooms, tonight, blocks] = await Promise.all([
    repo.listRoomTypes({ includeUnpublished: true }),
    repo.listRooms(),
    repo.bookingsBetween(today, addDays(today, 1)),
    canBlock ? new OperationsRepo(await getSessionClient()).blocks().catch((): RoomBlock[] => []) : Promise.resolve([] as RoomBlock[]),
  ]);
  const canRates = can(access, "rates.manage");
  const manager = can(access, "rooms.manage");
  const occupant = new Map(
    tonight.filter((b) => b.room_id && (b.status === "checked_in" || b.status === "confirmed")).map((b) => [b.room_id!, b.guest_name]),
  );
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const typeOptions = types.map((t) => ({ id: t.id, name: t.name }));
  const dirty = rooms.filter((r) => r.housekeeping === "dirty" && !r.out_of_service).length;
  const oos = rooms.filter((r) => r.out_of_service).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <p className="a-eyebrow">Inventory</p>
          <h1 className="a-title">Rooms &amp; rates</h1>
        </div>
        {!manager && <p className="a-hint">Rates and room setup are managed by a manager. You can update housekeeping.</p>}
        {manager && mode === "live" && <NewRoomType />}
      </header>

      <section aria-labelledby="types-h" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <h2 id="types-h" className="a-h2">
            Room types &amp; nightly rates
          </h2>
          <p className="a-hint">
            Changes appear on the website straight away. Weekend rates apply to {WEEKEND_LABEL.toLowerCase()}. Existing bookings keep
            the rate they were made at.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 16 }}>
          {types.map((t) => (
            <RoomTypeEditor
              key={t.id}
              id={t.id}
              name={t.name}
              units={rooms.filter((r) => r.room_type_id === t.id && !r.out_of_service).length}
              price={t.price_bdt}
              weekendPrice={t.weekend_price_bdt}
              rackPrice={t.rack_price_bdt}
              published={t.is_published}
              size={t.size_sqft}
              blurb={t.blurb}
              canEdit={canRates}
            >
              <RoomPhotos
                typeId={t.id}
                name={t.name}
                photos={t.gallery.map((ref) => ({ ref, src: photo(ref, "").src }))}
                canEdit={manager}
              />
              <div className="a-panel-body" style={{ borderTop: "1px solid var(--a-line)", paddingTop: 12, paddingBottom: 12 }}>
                <Link href={`/admin/rooms/${t.id}`} className="text-link" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                  Details, amenities &amp; seasonal rates →
                </Link>
              </div>
            </RoomTypeEditor>
          ))}
        </div>
      </section>

      <section aria-labelledby="rooms-h" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <h2 id="rooms-h" className="a-h2">
            Rooms<span className="a-count">{rooms.length}</span>
          </h2>
          <p className="a-hint">
            {dirty} to clean · {oos} out of service. Rooms out of service aren&apos;t sold on the website.
            {manager && " Each room you add here is sold online straight away."}
          </p>
        </div>
        {manager && <AddRoomForm types={typeOptions} />}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))", gap: 12 }}>
          {rooms.map((r) => (
            <RoomTile
              key={r.id}
              id={r.id}
              number={r.number}
              type={typeName.get(r.room_type_id) ?? ""}
              typeId={r.room_type_id}
              floor={r.floor}
              types={typeOptions}
              housekeeping={r.housekeeping}
              outOfService={r.out_of_service}
              note={r.service_note}
              occupant={occupant.get(r.id) ?? null}
              canManage={manager}
            >
              {canBlock && <MaintenanceBlocks roomId={r.id} number={r.number} blocks={blocks.filter((b) => b.room_id === r.id)} today={today} />}
            </RoomTile>
          ))}
        </div>
      </section>
    </div>
  );
}
