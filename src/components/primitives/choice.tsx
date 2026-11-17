"use client";

import { Checkbox as CheckboxPrimitive, RadioGroup as RadioPrimitive, Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useFieldControlProps } from "./field";

/* Checkbox, radio and switch. Each keeps a 44px hit area (via the label row
   or padding) while drawing a small, precise control. Keyboard: Space toggles;
   arrow keys move within a radio group. */

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  const wired = useFieldControlProps(props);
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-[var(--radius-1)] border border-line-strong bg-ivory",
        "transition-colors duration-300 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
      {...wired}
    >
      <CheckboxPrimitive.Indicator className="motion-safe:animate-rise">
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/** A checkbox with its label as one large, tappable row. */
export function CheckboxRow({ label, description, className, ...props }: React.ComponentProps<typeof Checkbox> & { label: React.ReactNode; description?: React.ReactNode }) {
  const id = React.useId();
  return (
    <div className={cn("flex min-h-11 items-start gap-3.5", className)}>
      <Checkbox id={id} className="mt-0.5" aria-describedby={description ? `${id}-d` : undefined} {...props} />
      <label htmlFor={id} className="cursor-pointer text-base leading-snug text-ink">
        {label}
        {description && (
          <span id={`${id}-d`} className="mt-1 block text-sm text-muted-foreground">
            {description}
          </span>
        )}
      </label>
    </div>
  );
}

export function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioPrimitive.Root>) {
  return <RadioPrimitive.Root data-slot="radio-group" className={cn("grid gap-3", className)} {...props} />;
}

export function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof RadioPrimitive.Item>) {
  return (
    <RadioPrimitive.Item
      data-slot="radio"
      className={cn(
        "grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-full border border-line-strong bg-ivory transition-colors duration-300",
        "data-[state=checked]:border-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator className="size-2.5 rounded-full bg-primary motion-safe:animate-rise" />
    </RadioPrimitive.Item>
  );
}

/**
 * A selectable option card (radio semantics): for room types, rate plans,
 * payment methods. Wrap several in a <RadioGroup>.
 */
export function RadioCard({ value, title, description, aside, className, disabled }: { value: string; title: React.ReactNode; description?: React.ReactNode; aside?: React.ReactNode; className?: string; disabled?: boolean }) {
  return (
    <RadioPrimitive.Item
      value={value}
      disabled={disabled}
      className={cn(
        "group flex w-full cursor-pointer items-start gap-4 rounded-[var(--radius-1)] border border-line bg-ivory p-5 text-left transition-[border-color,box-shadow] duration-300",
        "hover:border-line-strong data-[state=checked]:border-primary data-[state=checked]:shadow-[inset_0_0_0_1px_var(--pine-800)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <span className="mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full border border-line-strong group-data-[state=checked]:border-primary">
        <span className="size-2.5 scale-0 rounded-full bg-primary transition-transform duration-300 group-data-[state=checked]:scale-100" />
      </span>
      <span className="flex-1">
        <span className="block font-medium text-ink">{title}</span>
        {description && <span className="mt-1 block text-sm text-muted-foreground">{description}</span>}
      </span>
      {aside && <span className="shrink-0 text-right">{aside}</span>}
    </RadioPrimitive.Item>
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  const wired = useFieldControlProps(props);
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-line-strong bg-sand transition-colors duration-300",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
      {...wired}
    >
      <SwitchPrimitive.Thumb className="block size-[18px] translate-x-[2px] rounded-full bg-ivory shadow-sm transition-transform duration-300 ease-luxe data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}
