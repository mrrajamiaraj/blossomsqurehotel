"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Label as LabelPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/* --------------------------------------------------------------------------
 * Field — wires a label, control, hint and error together for assistive tech:
 *   <Field invalid={!!err}>
 *     <FieldLabel>Email</FieldLabel>
 *     <Input type="email" />
 *     <FieldHint>We send the confirmation here.</FieldHint>
 *     <FieldError>{err}</FieldError>
 *   </Field>
 * The control gets id, aria-describedby and aria-invalid automatically.
 * ------------------------------------------------------------------------ */

type FieldCtx = { id: string; hintId: string; errorId: string; invalid: boolean; hasHint: boolean; hasError: boolean; required: boolean };
const FieldContext = React.createContext<FieldCtx | null>(null);

export function useField() {
  return React.useContext(FieldContext);
}

/** Props a control should spread to be wired into its <Field>. */
export function useFieldControlProps(props: { id?: string; "aria-describedby"?: string; "aria-invalid"?: React.AriaAttributes["aria-invalid"]; required?: boolean }) {
  const field = useField();
  if (!field) return props;
  const describedBy = [props["aria-describedby"], field.hasHint && field.hintId, field.hasError && field.errorId].filter(Boolean).join(" ");
  return {
    ...props,
    id: props.id ?? field.id,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
    required: props.required ?? (field.required || undefined),
  };
}

export function Field({
  invalid = false,
  required = false,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { invalid?: boolean; required?: boolean }) {
  const id = React.useId();
  const arr = React.Children.toArray(children);
  const has = (type: unknown) => arr.some((c) => React.isValidElement(c) && c.type === type && (c.props as { children?: unknown }).children);
  const value: FieldCtx = {
    id: `${id}-control`,
    hintId: `${id}-hint`,
    errorId: `${id}-error`,
    invalid,
    required,
    hasHint: has(FieldHint),
    hasError: invalid && has(FieldError),
  };
  return (
    <FieldContext.Provider value={value}>
      <div data-slot="field" data-invalid={invalid || undefined} className={cn("flex flex-col gap-2.5", className)} {...props}>
        {children}
      </div>
    </FieldContext.Provider>
  );
}

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "font-sans text-[0.7rem] font-semibold uppercase tracking-[var(--tracking-caps)] text-bronze select-none",
        "peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function FieldLabel({ children, className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const field = useField();
  return (
    <Label htmlFor={field?.id} className={className} {...props}>
      {children}
      {field?.required && (
        <span aria-hidden="true" className="ml-1 text-brass">
          *
        </span>
      )}
    </Label>
  );
}

export function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  const field = useField();
  return <p id={field?.hintId} data-slot="field-hint" className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />;
}

export function FieldError({ className, children, ...props }: React.ComponentProps<"p">) {
  const field = useField();
  if (!children || (field && !field.invalid)) return null;
  return (
    <p id={field?.errorId} data-slot="field-error" role="alert" className={cn("flex items-start gap-2 text-sm text-destructive", className)} {...props}>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4.8v3.6M8 11h.01" strokeLinecap="round" />
      </svg>
      {children}
    </p>
  );
}

/* ------------------------------------------------------------- Controls */

export const controlVariants = cva(
  [
    "w-full min-w-0 bg-transparent font-sans text-base text-ink outline-none transition-[border-color,box-shadow,background-color] duration-300",
    "placeholder:text-ink/40 disabled:cursor-not-allowed disabled:opacity-50",
    "aria-invalid:border-destructive",
  ],
  {
    variants: {
      variant: {
        /** Bordered box on an ivory ground: forms, filters, admin. */
        boxed:
          "min-h-12 rounded-[var(--radius-1)] border border-line-strong bg-ivory px-4 py-3 shadow-xs focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--brass)_22%,transparent)]",
        /** Hairline underline: the editorial look used in the booking flow. */
        line: "min-h-14 rounded-none border-0 border-b border-line-strong px-0 pt-3.5 pb-3 font-light focus:border-primary",
      },
    },
    defaultVariants: { variant: "boxed" },
  },
);

type InputProps = React.ComponentProps<"input"> & VariantProps<typeof controlVariants>;

export function Input({ className, variant, type = "text", ...props }: InputProps) {
  const wired = useFieldControlProps(props);
  return <input type={type} data-slot="input" className={cn(controlVariants({ variant }), className)} {...props} {...wired} />;
}

export function Textarea({ className, variant, ...props }: React.ComponentProps<"textarea"> & VariantProps<typeof controlVariants>) {
  const wired = useFieldControlProps(props);
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlVariants({ variant }), "min-h-32 resize-y leading-relaxed", className)}
      {...props}
      {...wired}
    />
  );
}
