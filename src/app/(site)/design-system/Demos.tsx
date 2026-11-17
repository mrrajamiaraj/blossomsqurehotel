"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/admin/kit/ConfirmDialog";
import DataTable from "@/components/admin/kit/DataTable";
import { Button } from "@/components/primitives/button";
import { Checkbox, CheckboxRow, RadioCard, RadioGroup, Switch } from "@/components/primitives/choice";
import { Field, FieldError, FieldHint, FieldLabel, Input, Label, Textarea } from "@/components/primitives/field";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/primitives/menu";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
  Tooltip,
  TooltipProvider,
} from "@/components/primitives/overlay";
import DateRangeField, { type StayDates } from "@/components/system/DateRangeField";
import { Money } from "@/components/system/RoomCard";
import { toast } from "@/components/ui/Toaster";
import { formatTaka } from "@/lib/format";
import { ChevronDown, Info } from "@/components/icons";

export function FormsDemo({ rooms }: { rooms: { slug: string; name: string; price: number }[] }) {
  const [email, setEmail] = useState("guest@example");
  const [dates, setDates] = useState<StayDates>({});
  const [room, setRoom] = useState(rooms[0]?.slug ?? "");
  const invalid = email.length > 0 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  return (
    <div className="grid gap-10 md:grid-cols-2">
      <div className="flex flex-col gap-7">
        <Field required>
          <FieldLabel>Full name</FieldLabel>
          <Input autoComplete="name" placeholder="As on your ID" />
        </Field>
        <Field invalid={invalid} required>
          <FieldLabel>Email</FieldLabel>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <FieldHint>Your confirmation is sent here.</FieldHint>
          <FieldError>Enter an email like name@example.com.</FieldError>
        </Field>
        <Field>
          <FieldLabel>Arrival time</FieldLabel>
          <Select defaultValue="afternoon">
            <SelectTrigger>
              <SelectValue placeholder="Choose a window" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="morning">Morning (before 12 pm)</SelectItem>
              <SelectItem value="afternoon">Afternoon (12 – 5 pm)</SelectItem>
              <SelectItem value="evening">Evening (after 5 pm)</SelectItem>
              <SelectItem value="late">Late night</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <DateRangeField value={dates} onChange={setDates} label="Check-in — check-out" />
        <Field>
          <FieldLabel>Line style (booking flow)</FieldLabel>
          <Input variant="line" placeholder="Special requests" />
        </Field>
        <Field>
          <FieldLabel>Notes</FieldLabel>
          <Textarea placeholder="Anything we should prepare?" />
        </Field>
      </div>

      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-3">
          <Label>Room type</Label>
          <RadioGroup value={room} onValueChange={setRoom} aria-label="Room type">
            {rooms.slice(0, 3).map((r) => (
              <RadioCard key={r.slug} value={r.slug} title={r.name} description="Breakfast included" aside={<Money amount={r.price} className="font-serif text-2xl" />} />
            ))}
          </RadioGroup>
        </div>
        <CheckboxRow label="Airport pickup" description="Cox's Bazar airport, charged at the desk." />
        <CheckboxRow label="I agree to the cancellation policy and house rules" defaultChecked />
        <div className="flex items-center gap-4">
          <Switch id="sw" defaultChecked />
          <label htmlFor="sw" className="cursor-pointer">
            Email me offers
          </label>
        </div>
        <div className="flex items-center gap-4">
          <Checkbox id="cb-dis" disabled />
          <label htmlFor="cb-dis" className="text-ink/50">
            Disabled option
          </label>
        </div>
      </div>
    </div>
  );
}

export function OverlaysDemo() {
  const [cols, setCols] = useState({ guest: true, phone: true, email: false });
  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-4">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <p className="caps text-bronze">Before you go</p>
              <DialogTitle>Keep these dates on hold?</DialogTitle>
              <DialogDescription>We can hold the King Suite for 30 minutes while you arrange payment.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Field>
                <FieldLabel>Mobile number</FieldLabel>
                <Input type="tel" inputMode="tel" placeholder="01XXX-XXXXXX" />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost">Not now</Button>
              <Button>Hold dates</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">Bottom sheet</Button>
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetTitle>Guests &amp; rooms</SheetTitle>
            <SheetDescription className="mt-2">On phones, choices open from the bottom, within thumb reach.</SheetDescription>
          </SheetContent>
        </Sheet>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">Side sheet</Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetTitle>Your stay</SheetTitle>
            <SheetDescription className="mt-2">Summaries, filters and carts slide in from the side on larger screens.</SheetDescription>
          </SheetContent>
        </Sheet>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost">
              Columns <ChevronDown size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Show</DropdownMenuLabel>
            {(Object.keys(cols) as (keyof typeof cols)[]).map((k) => (
              <DropdownMenuCheckboxItem key={k} checked={cols[k]} onCheckedChange={(v) => setCols((c) => ({ ...c, [k]: Boolean(v) }))}>
                {k[0].toUpperCase() + k.slice(1)}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => toast("Exported")}>Export CSV</DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={() => toast.error("Nothing was deleted", { description: "This is a demo." })}>
              Delete view
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost">Popover</Button>
          </PopoverTrigger>
          <PopoverContent className="w-72">
            <p className="font-serif text-xl">Check-in from 1:00 PM</p>
            <p className="mt-2 text-sm text-ink-soft">Early check-in depends on availability — call ahead and we&apos;ll do our best.</p>
          </PopoverContent>
        </Popover>

        <Tooltip content="Rates include breakfast for two">
          <button type="button" aria-label="About rates" className="grid size-11 cursor-pointer place-items-center rounded-full text-ink-soft hover:bg-sand">
            <Info size={18} />
          </button>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" size="sm" onClick={() => toast("Dates saved")}>
        Neutral
      </Button>
      <Button variant="outline" size="sm" onClick={() => toast.success("Booking BSQ-2481 confirmed", { description: "The guest has been notified." })}>
        Success
      </Button>
      <Button variant="outline" size="sm" onClick={() => toast.info("Room 204 marked for inspection")}>
        Info
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => toast.error("Couldn't save the rate", { description: "Check your connection and try again.", action: { label: "Retry", onClick: () => toast.success("Saved") } })}
      >
        Error with action
      </Button>
    </div>
  );
}

export function TabsDemo() {
  return (
    <Tabs defaultValue="stay">
      <TabsList aria-label="Room details">
        <TabsTrigger value="stay">The stay</TabsTrigger>
        <TabsTrigger value="amenities">In the room</TabsTrigger>
        <TabsTrigger value="policies">Policies</TabsTrigger>
      </TabsList>
      <TabsContent value="stay">
        <p className="lede measure">Tabs move with the arrow keys; the active tab is drawn with a champagne rule.</p>
      </TabsContent>
      <TabsContent value="amenities">
        <p className="lede measure">Air conditioning, hot water, TV, Wi-Fi and a work desk in every room.</p>
      </TabsContent>
      <TabsContent value="policies">
        <p className="lede measure">Check-in from 1:00 PM, check-out until 11:00 AM. No pets.</p>
      </TabsContent>
    </Tabs>
  );
}

type SampleRow = { ref: string; guest: string; room: string; nights: number; total: number };

/** Admin kit demo. Rows are obviously-fictional specimens, not guest data. */
export function AdminDemo({ rows }: { rows: SampleRow[] }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <DataTable<SampleRow>
        caption="Specimen bookings"
        rows={rows}
        rowKey={(r) => r.ref}
        initialSort={{ key: "total", dir: "desc" }}
        columns={[
          { key: "ref", header: "Reference", cell: (r) => r.ref, primary: true, sortValue: (r) => r.ref },
          { key: "guest", header: "Guest", cell: (r) => r.guest, sortValue: (r) => r.guest },
          { key: "room", header: "Room type", cell: (r) => r.room },
          { key: "nights", header: "Nights", cell: (r) => r.nights, sortValue: (r) => r.nights, align: "end" },
          { key: "total", header: "Total", cell: (r) => formatTaka(r.total), sortValue: (r) => r.total, align: "end" },
        ]}
      />
      <div>
        <button type="button" className="a-btn a-btn--danger" onClick={() => setConfirm(true)}>
          Cancel a booking…
        </button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          toast("Demo only — nothing was cancelled");
        }}
        title="Cancel booking SPEC-001?"
        description="The guest will no longer appear on the arrivals list. This can't be undone."
        confirmLabel="Cancel booking"
        destructive
      />
    </div>
  );
}
