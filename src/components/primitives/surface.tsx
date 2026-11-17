import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Badge · Card · Separator · Skeleton · EmptyState
   Server-safe (no client JS).
   ========================================================================== */

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[0.68rem] font-semibold tracking-[0.12em] uppercase",
  {
    variants: {
      tone: {
        neutral: "border-line bg-sand text-ink-soft",
        gold: "border-transparent bg-[color-mix(in_srgb,var(--champagne)_24%,var(--ivory))] text-bronze",
        pine: "border-transparent bg-primary text-primary-foreground",
        outline: "border-line-strong bg-transparent text-ink-soft",
        success: "border-transparent bg-[color-mix(in_srgb,var(--success)_14%,var(--ivory))] text-[var(--success)]",
        danger: "border-transparent bg-[color-mix(in_srgb,var(--rust)_12%,var(--ivory))] text-destructive",
        /** Over photography. */
        glass: "border-white/25 bg-black/30 text-cream backdrop-blur-md",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function Card({ className, interactive = false, ...props }: React.ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn("relative flex flex-col border border-line bg-ivory text-ink shadow-xs", interactive && "lift", className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-1 flex-col gap-3 p-6 sm:p-7", className)} {...props} />;
}

export function CardTitle({ className, as: Tag = "h3", ...props }: React.ComponentProps<"h3"> & { as?: "h2" | "h3" | "h4" }) {
  return <Tag className={cn("font-serif text-[1.65rem] leading-[1.1] font-normal", className)} {...props} />;
}

export function Separator({ className, ornament = false, ...props }: React.ComponentProps<"div"> & { ornament?: boolean }) {
  if (!ornament) return <div role="separator" className={cn("h-px w-full bg-line", className)} {...props} />;
  return (
    <div role="separator" className={cn("flex items-center gap-4 text-brass", className)} {...props}>
      <span className="h-px flex-1 bg-line" />
      <svg aria-hidden="true" viewBox="0 0 12 12" className="size-2.5" fill="currentColor">
        <path d="M6 0l1.6 4.4L12 6 7.6 7.6 6 12 4.4 7.6 0 6l4.4-1.6z" />
      </svg>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Placeholder block. Shimmer is off for reduced-motion users. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn(
        "rounded-[var(--radius-1)] bg-[linear-gradient(100deg,var(--sand)_30%,color-mix(in_srgb,var(--sand)_45%,var(--ivory))_50%,var(--sand)_70%)] bg-[length:220%_100%] motion-safe:animate-shimmer",
        className,
      )}
      {...props}
    />
  );
}

/** Wraps skeletons so screen readers hear one "Loading" instead of nothing. */
export function LoadingRegion({ label = "Loading", className, children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4 border border-dashed border-line-strong px-6 py-14 text-center", className)}>
      {icon && <span className="grid size-14 place-items-center rounded-full border border-line text-brass [&_svg]:size-6">{icon}</span>}
      <p className="font-serif text-[1.75rem] leading-tight">{title}</p>
      {description && <p className="max-w-[46ch] text-base leading-relaxed text-ink-soft">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
