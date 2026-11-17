"use client";

import * as React from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "../icons";

export type { DateRange };

/**
 * Calendar — react-day-picker with the brand applied. Day cells are 44px
 * (touch-safe); the selected range reads as a pine pill over a sand band.
 * Keyboard: arrows move by day/week, PageUp/PageDown by month, Home/End by
 * week, Enter/Space selects (provided by react-day-picker).
 */
export function Calendar({ className, classNames, showOutsideDays = false, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={1 /* Monday — matches the booking flow's existing calendar */}
      className={cn("relative text-ink", className)}
      classNames={{
        months: "flex flex-col gap-8 md:flex-row md:gap-10",
        month: "flex flex-col gap-4",
        month_caption: "flex h-11 items-center justify-center",
        caption_label: "font-serif text-[1.35rem] leading-none",
        nav: "absolute inset-x-0 top-0 flex h-11 items-center justify-between",
        button_previous:
          "grid size-11 cursor-pointer place-items-center rounded-full text-ink-soft transition-colors hover:bg-sand hover:text-ink disabled:pointer-events-none disabled:opacity-30",
        button_next:
          "grid size-11 cursor-pointer place-items-center rounded-full text-ink-soft transition-colors hover:bg-sand hover:text-ink disabled:pointer-events-none disabled:opacity-30",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-11 pb-2 text-center text-[0.66rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase",
        week: "mt-0.5 flex",
        day: "relative size-11 p-0 text-center text-[0.95rem]",
        day_button:
          "relative z-10 grid size-11 cursor-pointer place-items-center rounded-full transition-colors duration-200 hover:bg-sand disabled:cursor-not-allowed",
        today: "font-semibold text-bronze",
        selected: "",
        range_start:
          "rounded-l-full bg-sand [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
        range_end:
          "rounded-r-full bg-sand [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
        range_middle: "bg-sand [&>button]:rounded-none [&>button]:hover:bg-sand-deep",
        outside: "text-ink/30",
        disabled: "text-ink/25 line-through decoration-ink/20",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => (orientation === "left" ? <ChevronLeft size={18} /> : <ChevronRight size={18} />),
      }}
      {...props}
    />
  );
}
