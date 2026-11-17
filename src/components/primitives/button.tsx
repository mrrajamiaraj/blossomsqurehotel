import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Button — shadcn/ui base, restyled for the brand.
 *
 * Square-cut, tracked capitals, and a fill that rises from the bottom on hover
 * (pointer devices only). 44px minimum height everywhere for touch. Focus uses
 * the global brass ring. `asChild` renders a Link/anchor with button styling.
 */
const buttonVariants = cva(
  [
    "relative isolate inline-flex shrink-0 cursor-pointer items-center justify-center gap-3 overflow-hidden whitespace-nowrap",
    "rounded-none border font-sans font-semibold uppercase tracking-[0.12em] no-underline",
    "transition-[color,border-color,background-color] duration-500 ease-luxe",
    // Rising fill (::before). Hidden from reduced-motion users by the global rule.
    "before:absolute before:inset-0 before:-z-10 before:origin-bottom before:scale-y-0 before:transition-transform before:duration-500 before:ease-luxe",
    "[@media(hover:hover)]:hover:before:scale-y-100",
    "active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        /** Brand action: sea-pine (champagne in the night theme). */
        primary: "border-primary bg-primary text-primary-foreground before:bg-[var(--accent-deep)]",
        /** Champagne-gold, for the single most important action on a dark surface. */
        gold: "border-champagne bg-champagne text-[var(--pine-950)] before:bg-[var(--brass-light)]",
        outline:
          "border-primary bg-transparent text-primary before:bg-primary [@media(hover:hover)]:hover:text-primary-foreground",
        /** On always-dark surfaces (hero, footer, menu). */
        light: "border-cream bg-cream text-pine before:bg-[var(--brass-light)]",
        "ghost-light":
          "border-cream/45 bg-transparent text-cream before:bg-cream [@media(hover:hover)]:hover:border-cream [@media(hover:hover)]:hover:text-pine",
        ghost:
          "border-transparent bg-transparent text-ink before:bg-sand normal-case tracking-normal font-medium",
        destructive: "border-destructive bg-destructive text-cream before:bg-[color-mix(in_srgb,var(--rust)_80%,black)]",
        link: "h-auto min-h-11 border-transparent px-0 text-primary underline-offset-[6px] before:hidden hover:underline normal-case tracking-normal font-medium",
      },
      size: {
        sm: "min-h-11 px-5 text-[0.7rem]",
        md: "min-h-12 px-7 text-xs",
        lg: "min-h-14 px-8 text-xs",
        icon: "size-11 p-0 [&_svg]:size-[18px]",
      },
      block: { true: "w-full" },
    },
    compoundVariants: [
      { variant: "link", className: "px-0 text-[0.95rem]" },
      // Sentence-case variants read small at the caps sizes.
      { variant: "ghost", className: "text-[0.95rem]" },
    ],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows a spinner, disables the button and announces "busy". */
    loading?: boolean;
  };

function Button({ className, variant, size, block, asChild = false, loading = false, children, disabled, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, block, className }))}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Spinner />}
          {children}
        </>
      )}
    </Comp>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-4 animate-spin rounded-full border-[1.5px] border-current border-r-transparent", className)}
    />
  );
}

export { Button, buttonVariants, Spinner };
