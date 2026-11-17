// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/* Next's Link/Image need the framework runtime; plain elements are enough here. */
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch: _p, ...rest }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt, fill: _f, priority: _p, sizes: _s, ...rest }: { src: string; alt: string; fill?: boolean; priority?: boolean; sizes?: string }) => <img src={src} alt={alt} {...rest} />,
}));

import DataTable from "@/components/admin/kit/DataTable";
import { Button } from "@/components/primitives/button";
import { Field, FieldError, FieldHint, FieldLabel, Input } from "@/components/primitives/field";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/primitives/overlay";
import Gallery from "@/components/system/Gallery";
import RoomCard from "@/components/system/RoomCard";
import Toaster, { toast } from "@/components/ui/Toaster";
import type { Photo } from "@/lib/photos";

beforeAll(() => {
  // jsdom lacks these; Radix and the date field use them.
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  // Radix animations: jsdom never fires animationend, so close immediately.
  Element.prototype.getAnimations ??= () => [];
});
afterEach(cleanup);

const photos: Photo[] = [
  { ref: "A", alt: "King Suite bedroom", src: "/photos/a.jpg", tone: "sea" },
  { ref: "B", alt: "Balcony at sunset", src: "/photos/b.jpg", tone: "dusk" },
  { ref: "C", alt: "Bathroom", src: null, tone: "forest" },
];

describe("Field", () => {
  it("links label, hint and error to the control and marks it invalid", () => {
    render(
      <Field invalid required>
        <FieldLabel>Email</FieldLabel>
        <Input />
        <FieldHint>We send the confirmation here.</FieldHint>
        <FieldError>Enter a valid email.</FieldError>
      </Field>,
    );
    const input = screen.getByLabelText(/email/i);
    expect(input).toHaveProperty("required", true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby")!.split(" ");
    expect(describedBy.map((id) => document.getElementById(id)?.textContent)).toEqual(["We send the confirmation here.", "Enter a valid email."]);
    expect(screen.getByRole("alert").textContent).toContain("Enter a valid email.");
  });

  it("hides the error and drops aria-invalid when valid", () => {
    render(
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input />
        <FieldError>Required</FieldError>
      </Field>,
    );
    expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Button", () => {
  it("is disabled and busy while loading", () => {
    render(<Button loading>Save</Button>);
    const b = screen.getByRole("button", { name: "Save" });
    expect(b).toHaveProperty("disabled", true);
    expect(b.getAttribute("aria-busy")).toBe("true");
  });

  it("renders as a link with asChild", () => {
    render(
      <Button asChild>
        <a href="/booking">Reserve</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Reserve" }).getAttribute("href")).toBe("/booking");
  });
});

describe("Dialog", () => {
  it("opens from its trigger, closes on Escape and returns focus", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Hold dates?</DialogTitle>
          <DialogDescription>For 30 minutes.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Hold dates?" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("Toaster", () => {
  it("keeps the old toast(message) call and adds tones, with errors announced assertively", () => {
    render(<Toaster />);
    act(() => {
      toast("Saved");
      toast.error("Couldn't save");
    });
    expect(within(screen.getByRole("status")).getByText("Saved")).toBeTruthy();
    expect(within(screen.getByRole("alert")).getByText("Couldn't save")).toBeTruthy();
  });

  it("can be dismissed and shows at most three", async () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => ["One", "Two", "Three", "Four"].forEach((m) => toast(m)));
    expect(screen.queryByText("One")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0]);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByText("Two")).toBeNull();
    vi.useRealTimers();
  });
});

describe("RoomCard", () => {
  it("names the card by the room and keeps Book as a separate link", () => {
    render(
      <RoomCard href="/rooms/king-suite" bookHref="/booking?room=king-suite" name="King Suite" kind="Suite" photo={photos[0]} facts={["King bed", "Sleeps 2"]} priceBdt={12500} wasBdt={15000} />,
    );
    const article = screen.getByRole("article");
    expect(within(article).getByRole("heading", { name: "King Suite" })).toBeTruthy();
    expect(within(article).getByRole("link", { name: "King Suite" }).getAttribute("href")).toBe("/rooms/king-suite");
    expect(within(article).getByRole("link", { name: /book/i }).getAttribute("href")).toBe("/booking?room=king-suite");
    expect(article.textContent).toContain("৳12,500");
    expect(article.textContent).toContain("Was ৳15,000");
  });
});

describe("Gallery", () => {
  it("opens a lightbox at the chosen photo and moves with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Gallery photos={photos} title="Photos" />);
    await user.click(screen.getByRole("button", { name: /photo 2 of 3: balcony/i }));
    const dialog = screen.getByRole("dialog", { name: "Photos" });
    expect(within(dialog).getByText("Balcony at sunset", { selector: "figcaption" })).toBeTruthy();
    await user.keyboard("{ArrowRight}");
    expect(within(dialog).getByText("Bathroom", { selector: "figcaption" })).toBeTruthy();
    await user.keyboard("{ArrowRight}");
    expect(within(dialog).getByText("King Suite bedroom", { selector: "figcaption" })).toBeTruthy();
  });
});

describe("DataTable", () => {
  type Row = { ref: string; total: number };
  const rows: Row[] = [
    { ref: "B-2", total: 500 },
    { ref: "B-1", total: 900 },
  ];

  it("sorts by a column and reports it with aria-sort", async () => {
    const user = userEvent.setup();
    render(
      <DataTable<Row>
        caption="Bookings"
        rows={rows}
        rowKey={(r) => r.ref}
        columns={[
          { key: "ref", header: "Reference", cell: (r) => r.ref, primary: true },
          { key: "total", header: "Total", cell: (r) => r.total, sortValue: (r) => r.total },
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: "Bookings" });
    const firstRef = () => within(table).getAllByRole("rowheader")[0].textContent;
    expect(firstRef()).toBe("B-2");
    await user.click(within(table).getByRole("button", { name: /total/i }));
    expect(within(table).getByRole("columnheader", { name: /total/i }).getAttribute("aria-sort")).toBe("ascending");
    expect(firstRef()).toBe("B-2");
    await user.click(within(table).getByRole("button", { name: /total/i }));
    expect(within(table).getByRole("columnheader", { name: /total/i }).getAttribute("aria-sort")).toBe("descending");
    expect(firstRef()).toBe("B-1");
  });

  it("shows an empty state with no rows", () => {
    render(<DataTable caption="x" rows={[]} rowKey={() => ""} columns={[]} empty="No bookings yet" />);
    expect(screen.getByText("No bookings yet")).toBeTruthy();
  });
});
