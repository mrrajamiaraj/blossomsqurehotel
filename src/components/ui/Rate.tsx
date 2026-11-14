import { formatTaka } from "@/lib/format";
import type { RoomRates } from "@/lib/pricing";

/** The published rate, crossed out, when it's higher than what the guest pays. */
export function WasPrice({ rates }: { rates: RoomRates }) {
  if (!rates.rack_price_bdt || rates.rack_price_bdt <= rates.price_bdt) return null;
  return (
    <s className="price-was">
      <span className="sr-only">Published rate </span>
      {formatTaka(rates.rack_price_bdt)}
    </s>
  );
}

/** "৳3,500 Thu & Fri nights", when weekends cost more. */
export function WeekendNote({ rates, className }: { rates: RoomRates; className?: string }) {
  if (!rates.weekend_price_bdt || rates.weekend_price_bdt === rates.price_bdt) return null;
  return <span className={`price-weekend ${className ?? ""}`}>{formatTaka(rates.weekend_price_bdt)} Thu &amp; Fri nights</span>;
}
