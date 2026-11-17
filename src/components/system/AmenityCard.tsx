import { cn } from "@/lib/utils";

/**
 * Amenity — a thin-line icon, a name and one short note.
 * `icon` is an SVG path from lib/amenities (ICONS.*), drawn at 24px.
 */
export default function AmenityCard({ icon, name, note, className, variant = "plain" }: { icon: string; name: string; note?: string; className?: string; variant?: "plain" | "card" }) {
  return (
    <div
      className={cn(
        "group flex flex-col gap-4",
        variant === "card" && "border border-line bg-ivory p-6 transition-colors duration-500 hover:border-brass/50",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full border border-line text-brass transition-colors duration-500 group-hover:border-brass/60">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d={icon} />
        </svg>
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-serif text-[1.45rem] leading-tight">{name}</p>
        {note && <p className="text-sm leading-relaxed text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}

/** Responsive grid: 2 columns on phones, 3 on tablets, 4 on desktop. */
export function AmenityGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-4", className)}>{children}</div>;
}
