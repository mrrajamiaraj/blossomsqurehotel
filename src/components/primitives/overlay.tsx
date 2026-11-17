"use client";

import { Dialog as DialogPrimitive, Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Close } from "../icons";

/* ==========================================================================
   Dialog · Sheet · Popover · Tooltip
   Radix handles focus trapping, focus return, Escape, scroll locking and
   aria-modal; these wrappers add the brand surface and motion (globals.css
   → "Component motion").
   ========================================================================== */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function CloseButton({ className, label = "Close" }: { className?: string; label?: string }) {
  return (
    <DialogPrimitive.Close
      aria-label={label}
      className={cn(
        "grid size-11 cursor-pointer place-items-center rounded-full text-ink-soft transition-colors duration-300 hover:bg-sand hover:text-ink",
        className,
      )}
    >
      <Close size={18} />
    </DialogPrimitive.Close>
  );
}

export function DialogContent({
  className,
  children,
  size = "md",
  hideClose = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { size?: "sm" | "md" | "lg" | "full"; hideClose?: boolean }) {
  const width = { sm: "max-w-[420px]", md: "max-w-[560px]", lg: "max-w-[800px]", full: "max-w-[min(1200px,96vw)]" }[size];
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ui-overlay" />
      <DialogPrimitive.Content
        data-slot="dialog"
        className={cn(
          "ui-dialog flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] flex-col overflow-hidden border border-line bg-ivory text-ink shadow-lg",
          width,
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && <CloseButton className="absolute top-3 right-3" />}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 px-7 pt-7 pr-16 pb-2 sm:px-9 sm:pt-9", className)} {...props} />;
}

export function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("overflow-y-auto px-7 py-4 sm:px-9", className)} data-lenis-prevent {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-2 flex flex-col-reverse gap-3 border-t border-line bg-paper px-7 py-5 sm:flex-row sm:justify-end sm:px-9", className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("font-serif text-[1.9rem] leading-tight font-normal", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-base leading-relaxed text-ink-soft", className)} {...props} />;
}

/* ------------------------------------------------------------------ Sheet */

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogTitle;
export const SheetDescription = DialogDescription;

/**
 * Side panel. On phones use side="bottom" for a thumb-reachable sheet; the
 * grab handle is decorative (Escape, the scrim and the close button close it).
 */
export function SheetContent({
  side = "right",
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: "left" | "right" | "bottom" }) {
  const pos = {
    right: "inset-y-0 right-0 h-dvh w-[min(440px,92vw)] border-l",
    left: "inset-y-0 left-0 h-dvh w-[min(440px,92vw)] border-r",
    bottom: "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[14px] border-t pb-[env(safe-area-inset-bottom)]",
  }[side];
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ui-overlay" />
      <DialogPrimitive.Content
        data-side={side}
        className={cn("ui-sheet fixed z-[190] flex flex-col border-line bg-ivory text-ink shadow-lg", pos, className)}
        {...props}
      >
        {side === "bottom" && <span aria-hidden="true" className="mx-auto mt-3 h-1 w-10 rounded-full bg-line-strong" />}
        <CloseButton className="absolute top-3 right-3" />
        <div className="flex-1 overflow-y-auto px-6 pt-6 pb-8 sm:px-8" data-lenis-prevent>
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* ---------------------------------------------------------------- Popover */

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({ className, align = "start", sideOffset = 8, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn("ui-pop z-[195] rounded-[var(--radius-1)] border border-line bg-ivory p-4 text-ink shadow-md outline-none", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/* ---------------------------------------------------------------- Tooltip */

export function TooltipProvider(props: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={250} {...props} />;
}

/** Short supplementary label. Never put essential information only in a tooltip. */
export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="ui-pop z-[200] max-w-64 rounded-[var(--radius-1)] bg-[var(--pine-950)] px-3 py-2 text-xs leading-snug text-cream shadow-md"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[var(--pine-950)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
