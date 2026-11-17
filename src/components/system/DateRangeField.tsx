"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Calendar, type DateRange } from "@/components/primitives/calendar";
import { Popover, PopoverContent, PopoverTrigger, Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/primitives/overlay";
import { Button } from "@/components/primitives/button";
import { formatShort, hotelToday, nightsBetween } from "@/lib/dates";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Calendar as CalendarIcon } from "../icons";

/* Dates travel through the app as ISO "yyyy-mm-dd" (see lib/dates). The
   picker works in local Dates, so convert at the edge — never via
   toISOString(), which can shift a day across timezones. */
const fromISO = (iso?: string) => {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toISO = (d?: Date) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : undefined;

function useMonths() {
  const [months, setMonths] = useState(1);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 53.75rem)");
    const set = () => setMonths(mq.matches ? 2 : 1);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  return months;
}

export type StayDates = { checkIn?: string; checkOut?: string };

/**
 * Check-in / check-out field: a trigger that reads like a sentence
 * ("Fri 21 Nov → Sun 23 Nov · 2 nights") opening a two-month calendar
 * (one month on phones). Past dates are disabled; check-out must follow
 * check-in.
 */
export default function DateRangeField({
  value,
  onChange,
  label = "Dates",
  className,
  minNights = 1,
}: {
  value: StayDates;
  onChange: (v: StayDates) => void;
  label?: string;
  className?: string;
  minNights?: number;
}) {
  const [open, setOpen] = useState(false);
  const uid = useId();
  const months = useMonths();
  const today = useMemo(() => fromISO(hotelToday())!, []);
  const range: DateRange | undefined = value.checkIn ? { from: fromISO(value.checkIn), to: fromISO(value.checkOut) } : undefined;
  const nights = value.checkIn && value.checkOut ? nightsBetween(value.checkIn, value.checkOut) : 0;

  const summary =
    value.checkIn && value.checkOut
      ? `${formatShort(value.checkIn)} → ${formatShort(value.checkOut)}`
      : value.checkIn
        ? `${formatShort(value.checkIn)} → choose check-out`
        : "Choose your dates";

  const triggerClass =
    "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-1)] border border-line-strong bg-ivory px-4 text-left shadow-xs transition-colors hover:border-ink/40 data-[state=open]:border-primary";
  const triggerInner = (
    <>
      <CalendarIcon size={18} className="shrink-0 text-brass" />
      <span id={`${uid}-value`} className={cn("flex-1 truncate", !value.checkIn && "text-ink/45")}>
        {summary}
      </span>
      {nights > 0 && <span className="shrink-0 text-sm text-muted-foreground">{plural(nights, "night")}</span>}
    </>
  );
  const labelEl = (
    <span className="text-[0.7rem] font-semibold tracking-[var(--tracking-caps)] text-bronze uppercase" id={`${uid}-label`}>
      {label}
    </span>
  );
  const picker = (
    <>
      <Calendar
        mode="range"
        numberOfMonths={months}
        defaultMonth={range?.from ?? today}
        selected={range}
        min={minNights}
        disabled={{ before: today }}
        startMonth={today}
        className={months === 1 ? "mx-auto w-fit" : undefined}
        onSelect={(r) => onChange({ checkIn: toISO(r?.from), checkOut: toISO(r?.to && r.from && r.to > r.from ? r.to : undefined) })}
      />
      <div className="mt-5 flex items-center justify-between gap-4 border-t border-line pt-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {nights > 0 ? `${plural(nights, "night")} selected` : value.checkIn ? "Now choose check-out" : "Choose check-in"}
        </p>
        <div className="flex gap-2">
          {value.checkIn && (
            <Button variant="ghost" size="sm" onClick={() => onChange({})}>
              Clear
            </Button>
          )}
          <Button size="sm" disabled={!nights} onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </div>
    </>
  );

  // Phones: a bottom sheet (always fits, thumb-reachable). Desktop: a popover.
  if (months === 1) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <div className={cn("flex flex-col gap-2.5", className)}>
          {labelEl}
          <SheetTrigger aria-labelledby={`${uid}-label ${uid}-value`} className={triggerClass}>
            {triggerInner}
          </SheetTrigger>
        </div>
        <SheetContent side="bottom">
          <SheetTitle className="mb-4 text-[1.6rem]">{label}</SheetTitle>
          <SheetDescription className="sr-only">Choose your check-in date, then your check-out date.</SheetDescription>
          {picker}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("flex flex-col gap-2.5", className)}>
        {labelEl}
        <PopoverTrigger aria-labelledby={`${uid}-label ${uid}-value`} className={triggerClass}>
          {triggerInner}
        </PopoverTrigger>
      </div>
      <PopoverContent className="max-h-[var(--radix-popover-content-available-height)] w-auto overflow-auto p-5 sm:p-6">{picker}</PopoverContent>
    </Popover>
  );
}