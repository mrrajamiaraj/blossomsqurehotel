"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_HOTEL_INFO, type HotelInfo } from "@/lib/cms/hotel-info";

const Ctx = createContext<HotelInfo>(DEFAULT_HOTEL_INFO);

/** Gives client components the hotel's current contact details (from Website content → Contact details). */
export function HotelInfoProvider({ value, children }: { value: HotelInfo; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHotelInfo(): HotelInfo {
  return useContext(Ctx);
}
