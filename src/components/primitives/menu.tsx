"use client";

import { DropdownMenu as MenuPrimitive, Select as SelectPrimitive, Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "../icons";
import { controlVariants, useFieldControlProps } from "./field";

/* ==========================================================================
   Select · DropdownMenu · Tabs
   Full keyboard support from Radix: arrows, Home/End, type-ahead, Escape.
   ========================================================================== */

const itemBase =
  "relative flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-1)] px-3 py-2 text-[0.95rem] text-ink outline-none select-none " +
  "data-[highlighted]:bg-sand data-[disabled]:pointer-events-none data-[disabled]:opacity-45";

const panel = "ui-pop z-[195] min-w-[12rem] overflow-hidden rounded-[var(--radius-1)] border border-line bg-ivory p-1.5 text-ink shadow-md";

/* ----------------------------------------------------------------- Select */

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectGroup = SelectPrimitive.Group;

export function SelectTrigger({ className, variant, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger> & { variant?: "boxed" | "line" }) {
  const wired = useFieldControlProps(props);
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(controlVariants({ variant }), "flex cursor-pointer items-center justify-between gap-3 text-left data-[placeholder]:text-ink/45", className)}
      {...props}
      {...wired}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown size={16} className="shrink-0 text-ink-soft" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({ className, children, position = "popper", ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        sideOffset={6}
        className={cn(panel, position === "popper" && "w-[var(--radix-select-trigger-width)] max-h-[var(--radix-select-content-available-height)]", className)}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item className={cn(itemBase, "pr-9", className)} {...props}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-3 text-primary">
        <Check size={16} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return <SelectPrimitive.Label className={cn("px-3 pt-2 pb-1 text-[0.68rem] font-semibold tracking-[var(--tracking-caps)] text-bronze uppercase", className)} {...props} />;
}

/* ----------------------------------------------------------- DropdownMenu */

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;

export function DropdownMenuContent({ className, sideOffset = 6, align = "end", ...props }: React.ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content sideOffset={sideOffset} align={align} collisionPadding={12} className={cn(panel, className)} {...props} />
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, destructive, ...props }: React.ComponentProps<typeof MenuPrimitive.Item> & { destructive?: boolean }) {
  return <MenuPrimitive.Item className={cn(itemBase, destructive && "text-destructive data-[highlighted]:bg-destructive/10", className)} {...props} />;
}

export function DropdownMenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
  return (
    <MenuPrimitive.CheckboxItem className={cn(itemBase, "pl-9", className)} {...props}>
      <MenuPrimitive.ItemIndicator className="absolute left-3 text-primary">
        <Check size={16} />
      </MenuPrimitive.ItemIndicator>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Label>) {
  return <MenuPrimitive.Label className={cn("px-3 pt-2 pb-1 text-[0.68rem] font-semibold tracking-[var(--tracking-caps)] text-bronze uppercase", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn("my-1.5 h-px bg-line", className)} {...props} />;
}

/* ------------------------------------------------------------------- Tabs */

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("flex gap-8 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative -mb-px min-h-12 shrink-0 cursor-pointer border-b border-transparent py-3 text-[0.72rem] font-semibold tracking-[var(--tracking-caps)] text-muted-foreground uppercase transition-colors duration-300",
        "hover:text-ink data-[state=active]:border-brass data-[state=active]:text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("pt-8 outline-none data-[state=active]:motion-safe:animate-rise", className)} {...props} />;
}
