"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/primitives/button";
import { CheckboxRow } from "@/components/primitives/choice";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/menu";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/primitives/overlay";
import { EmptyState } from "@/components/primitives/surface";
import RoomCard from "@/components/system/RoomCard";
import { formatTaka, plural, roomKind } from "@/lib/format";
import type { Photo } from "@/lib/photos";
import { stayCost, WEEKEND_LABEL, type RoomRates } from "@/lib/pricing";
import { DEFAULT_FILTERS, filterParams, filterRooms, fitsParty, type RoomFilters, type RoomSort, type RoomType } from "@/lib/room-filters";
import { guestsLabel, stayQuery, type Stay } from "@/lib/stay";
import { cn } from "@/lib/utils";
import { Filter } from "../icons";

export type ExplorerRoom = {
  slug: string;
  name: string;
  tag: string;
  bed: string;
  sleeps: number;
  size: string;
  blurb: string;
  features: string[];
  rates: RoomRates;
  cover: Photo;
  photoCount: number;
  available: number;
};

const TYPES: { id: RoomType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "room", label: "Rooms" },
  { id: "suite", label: "Suites" },
];

const SORTS: { id: RoomSort; label: string }[] = [
  { id: "recommended", label: "Recommended" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "space", label: "Most space" },
];

type Props = { rooms: ExplorerRoom[]; stay: Stay; nights: number; live: boolean; rangeLabel: string; initial: RoomFilters };

/**
 * Rooms & Suites results: type tabs, party / balcony / availability filters
 * and sorting, kept in the URL so a filtered list can be shared. On phones
 * the secondary filters open in a bottom sheet. Prices and availability are
 * the server's (Supabase); nothing here invents either.
 */
export default function RoomsExplorer({ rooms, stay, nights, live, rangeLabel, initial }: Props) {
  const [f, setF] = useState<RoomFilters>(initial);
  const shown = useMemo(() => filterRooms(rooms, f, stay, live), [rooms, f, stay, live]);
  const update = (patch: Partial<RoomFilters>) => setF((x) => ({ ...x, ...patch }));
  const changed = JSON.stringify(f) !== JSON.stringify(DEFAULT_FILTERS);
  const extraCount = [!f.fitsParty, f.balcony, f.availableOnly].filter(Boolean).length;

  // Keep the URL in step (no navigation, no server round trip).
  useEffect(() => {
    const url = `${window.location.pathname}?${stayQuery(stay, filterParams(f))}`;
    window.history.replaceState(window.history.state, "", url);
  }, [f, stay]);

  const toggles = (
    <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-7">
      <CheckboxRow checked={f.fitsParty} onCheckedChange={(v) => update({ fitsParty: v === true })} label={`Fits ${guestsLabel(stay)}`} className="items-center" />
      <CheckboxRow checked={f.balcony} onCheckedChange={(v) => update({ balcony: v === true })} label="With a balcony" className="items-center" />
      {live && <CheckboxRow checked={f.availableOnly} onCheckedChange={(v) => update({ availableOnly: v === true })} label="Available for my dates" className="items-center" />}
    </div>
  );

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-line pb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div role="group" aria-label="Room type" className="inline-flex border border-line-strong p-1">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={f.type === t.id}
                onClick={() => update({ type: t.id })}
                className={cn(
                  "min-h-10 min-w-[4.75rem] cursor-pointer px-4 text-[0.72rem] font-semibold tracking-[0.12em] uppercase transition-colors duration-300",
                  f.type === t.id ? "bg-primary text-primary-foreground" : "text-ink-soft hover:text-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="md:hidden">
                  <Filter size={16} /> Filters{extraCount ? ` (${extraCount})` : ""}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom">
                <SheetTitle className="font-serif text-2xl">Filter rooms</SheetTitle>
                <SheetDescription className="sr-only">Narrow the list of rooms. Changes apply straight away.</SheetDescription>
                <div className="mt-6">{toggles}</div>
              </SheetContent>
            </Sheet>
            <Select value={f.sort} onValueChange={(v) => update({ sort: v as RoomSort })}>
              <SelectTrigger aria-label="Sort rooms" className="min-h-11 w-[13.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {SORTS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="hidden md:block">{toggles}</div>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-3 py-6">
        <p className="text-ink-soft" aria-live="polite">
          <strong className="font-semibold text-ink">{plural(shown.length, "room type")}</strong>
          {live ? " for " : " · prices for "}
          <span className="text-ink">{rangeLabel}</span>
        </p>
        {changed && (
          <button type="button" className="text-link min-h-11 text-sm" onClick={() => setF(DEFAULT_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      {shown.length ? (
        <ul role="list" className="flex flex-col gap-8">
          {shown.map((r, i) => {
            const soldOut = live && r.available < stay.rooms;
            const fewLeft = live && !soldOut && r.available <= 1;
            const total = stayCost(r.rates, stay.checkIn, stay.checkOut, stay.rooms).total;
            const facts = [roomKind(r.tag), r.bed, `Sleeps ${r.sleeps}`, r.size].filter(Boolean);
            const weekend = r.rates.weekend_price_bdt && r.rates.weekend_price_bdt !== r.rates.price_bdt ? ` · ${formatTaka(r.rates.weekend_price_bdt)} ${WEEKEND_LABEL.replace(" nights", "")}` : "";
            return (
              <li key={r.slug} data-reveal="up">
                <RoomCard
                  layout="wide"
                  headingLevel="h2"
                  href={`/rooms/${r.slug}?${stayQuery(stay)}`}
                  name={r.name}
                  kind={r.features.some((x) => x.toLowerCase().includes("balcony")) ? `${roomKind(r.tag)} · Balcony` : roomKind(r.tag)}
                  photo={r.cover}
                  priority={i === 0}
                  facts={facts.slice(1)}
                  blurb={r.blurb}
                  priceBdt={r.rates.price_bdt}
                  wasBdt={r.rates.rack_price_bdt}
                  priceNote={`${formatTaka(total)} for ${plural(nights, "night")}${stay.rooms > 1 ? `, ${stay.rooms} rooms` : ""}${weekend}`}
                  badge={soldOut ? "Fully booked for these dates" : fewLeft ? "Only one left for these dates" : !fitsParty(r, stay) ? "Too small for your party" : r.photoCount > 1 ? `${r.photoCount} photos` : undefined}
                  bookHref={soldOut ? undefined : `/booking?${stayQuery(stay, { room: r.slug })}`}
                  className={cn(soldOut && "opacity-75")}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title="No rooms match those filters"
          description={f.fitsParty ? `None of the rooms you've filtered can take ${guestsLabel(stay)}. Try adding a room, or clear the filters.` : "Try clearing a filter."}
          action={
            <Button variant="outline" onClick={() => setF(DEFAULT_FILTERS)}>
              Clear filters
            </Button>
          }
        />
      )}
    </div>
  );
}
