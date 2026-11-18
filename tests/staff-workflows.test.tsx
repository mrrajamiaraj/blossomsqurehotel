// @vitest-environment jsdom
// Staff workflows as people use them: the screens call the right server action
// with the right values in a few steps, confirm success, explain failures, and
// hide controls a role mustn't use. The database rules behind each action are
// covered by tests/db/cms-operations.test.ts and tests/db/rls.test.ts.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ok = (message?: string) => Promise.resolve({ ok: true as const, message });
const fail = (message: string) => Promise.resolve({ ok: false as const, message });

const ops = vi.hoisted(() => ({
  updateTask: vi.fn(),
  assignTask: vi.fn(),
  createTask: vi.fn(),
  reportIssue: vi.fn(),
  savePromotion: vi.fn(),
  setPromotionActive: vi.fn(),
  deletePromotion: vi.fn(),
  blockRoom: vi.fn(),
  releaseBlock: vi.fn(),
  createRoomType: vi.fn(),
  setRoomTypeAmenities: vi.fn(),
  addAmenity: vi.fn(),
  setAmenityActive: vi.fn(),
  saveSeason: vi.fn(),
  deleteSeason: vi.fn(),
}));
const actions = vi.hoisted(() => ({ updateRoom: vi.fn(), inviteStaff: vi.fn(), updateStaffMember: vi.fn(), updatePassword: vi.fn(), updateSettings: vi.fn() }));
const cms = vi.hoisted(() => ({
  saveSectionDraft: vi.fn(),
  publishSection: vi.fn(),
  discardSectionDraft: vi.fn(),
  sectionVersions: vi.fn(),
  restoreSectionVersion: vi.fn(),
  uploadMedia: vi.fn(),
  listMedia: vi.fn(),
}));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/app/admin/operations", () => ops);
vi.mock("@/app/admin/actions", () => actions);
vi.mock("@/app/admin/cms", () => cms);
vi.mock("@/components/ui/Toaster", () => ({ toast: toasts, default: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import HousekeepingBoard from "@/components/admin/HousekeepingBoard";
import SectionEditor from "@/components/admin/cms/SectionEditor";
import PromotionsManager from "@/components/admin/PromotionsManager";
import { MaintenanceBlocks } from "@/components/admin/RoomTypeSetup";
import { TeamPanel } from "@/components/admin/SettingsForms";
import type { Group } from "@/lib/cms/fields";
import type { BoardRoom, HousekeepingTask, Promotion } from "@/lib/data/operations";

beforeAll(() => {
  // jsdom's <dialog> has no modal support; open/close by attribute is enough here.
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal: () => void; close: () => void };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  window.open = vi.fn() as unknown as typeof window.open;
});
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

const TODAY = "2026-11-18";
const ME = "00000000-0000-4000-8000-000000000001";
const COLLEAGUE = "00000000-0000-4000-8000-000000000002";

const room = (o: Partial<BoardRoom> & Pick<BoardRoom, "room_id" | "number">): BoardRoom => ({
  floor: "1st",
  room_type: "Deluxe King",
  housekeeping: "dirty",
  out_of_service: false,
  service_note: null,
  occupied: false,
  arriving: false,
  departing: false,
  blocked: false,
  open_tasks: 0,
  open_issues: 0,
  ...o,
});
const task = (o: Partial<HousekeepingTask> & Pick<HousekeepingTask, "id" | "room_id">): HousekeepingTask => ({
  booking_id: null,
  kind: "clean",
  status: "open",
  priority: 2,
  due_on: TODAY,
  assigned_to: null,
  notes: null,
  completed_at: null,
  ...o,
});

/* ================================================================ Housekeeping */

describe("housekeeping workflow", () => {
  const rooms = [
    room({ room_id: "r1", number: "101" }),
    room({ room_id: "r2", number: "102", housekeeping: "inspected", occupied: true }),
    room({ room_id: "r3", number: "103", out_of_service: true, service_note: "AC repair" }),
    room({ room_id: "r4", number: "104", housekeeping: "clean" }),
  ];
  const tasks = [
    task({ id: "t1", room_id: "r1", assigned_to: ME }),
    task({ id: "t2", room_id: "r4", kind: "inspect", assigned_to: COLLEAGUE }),
    task({ id: "t3", room_id: "r2", kind: "turndown" }),
  ];
  const housekeeper = { rooms, tasks, staff: [{ user_id: ME, full_name: "Rina" }, { user_id: COLLEAGUE, full_name: "Karim" }], me: ME, canAssign: false, canWrite: true, live: true, today: TODAY };

  it("shows all six statuses with counts, and filters the board by one", async () => {
    render(<HousekeepingBoard {...housekeeper} />);
    const filters = screen.getByRole("group", { name: "Filter rooms by status" });
    for (const label of ["Dirty (1)", "Cleaning (0)", "Clean (1)", "Inspected (0)", "Occupied (1)", "Out of service (1)"]) {
      expect(within(filters).getByRole("button", { name: label })).toBeTruthy();
    }
    await userEvent.click(within(filters).getByRole("button", { name: "Out of service (1)" }));
    expect(screen.getByRole("listitem", { name: "Room 103, Out of service" })).toBeTruthy();
    expect(screen.queryByRole("listitem", { name: /Room 101/ })).toBeNull();
    // Out-of-service rooms can't be marked clean by hand.
    expect(screen.queryByRole("group", { name: "Set status of room 103" })).toBeNull();
  });

  it("a housekeeper sees their own and unassigned tasks, not a colleague's", () => {
    render(<HousekeepingBoard {...housekeeper} />);
    const list = screen.getByRole("region", { name: /Tasks/ });
    expect(within(list).getByText(/Room 101 · Clean/)).toBeTruthy();
    expect(within(list).getByText(/Room 102 · Turn-down/)).toBeTruthy();
    expect(within(list).queryByText(/Room 104 · Inspect/)).toBeNull();
    // and can't reassign or cancel
    expect(within(list).queryByRole("combobox")).toBeNull();
    expect(within(list).queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("one tap starts a room's cleaning and confirms it", async () => {
    actions.updateRoom.mockReturnValue(ok());
    render(<HousekeepingBoard {...housekeeper} />);
    const card = screen.getByRole("group", { name: "Set status of room 101" });
    await userEvent.click(within(card).getByRole("button", { name: "Cleaning" }));
    expect(actions.updateRoom).toHaveBeenCalledWith("r1", { housekeeping: "cleaning" });
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Room 101: cleaning"));
  });

  it("start and finish a task in two taps", async () => {
    ops.updateTask.mockReturnValue(ok());
    render(<HousekeepingBoard {...housekeeper} />);
    const row = screen.getByText(/Room 101 · Clean/).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Start" }));
    expect(ops.updateTask).toHaveBeenLastCalledWith("t1", "in_progress");
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Started: room 101"));
    await userEvent.click(within(row).getByRole("button", { name: "Done" }));
    expect(ops.updateTask).toHaveBeenLastCalledWith("t1", "done");
  });

  it("reports a maintenance problem; the button waits for a real description", async () => {
    ops.reportIssue.mockReturnValue(ok("Reported — maintenance has been told"));
    render(<HousekeepingBoard {...housekeeper} />);
    const card = screen.getByRole("listitem", { name: "Room 101, Dirty" });
    await userEvent.click(within(card).getByRole("button", { name: "Report a problem" }));
    const dialog = screen.getByRole("dialog", { name: "Report a problem in room 101" });
    const send = within(dialog).getByRole("button", { name: "Send report" });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(within(dialog).getByLabelText("What's wrong?"), "Tap leaking");
    await userEvent.click(within(dialog).getByLabelText(/Urgent/));
    await userEvent.click(send);
    expect(ops.reportIssue).toHaveBeenCalledWith("r1", "Tap leaking", true);
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Reported — maintenance has been told"));
  });

  it("shows the server's reason when an update is refused", async () => {
    actions.updateRoom.mockReturnValue(fail("You don't have permission to do that."));
    render(<HousekeepingBoard {...housekeeper} />);
    await userEvent.click(within(screen.getByRole("group", { name: "Set status of room 104" })).getByRole("button", { name: "Inspected" }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("You don't have permission to do that."));
  });

  it("the desk assigns tasks and creates new ones", async () => {
    ops.assignTask.mockReturnValue(ok());
    ops.createTask.mockReturnValue(ok());
    render(<HousekeepingBoard {...housekeeper} canAssign />);
    await userEvent.selectOptions(screen.getByLabelText("Assign task in room 102"), COLLEAGUE);
    expect(ops.assignTask).toHaveBeenCalledWith("t3", COLLEAGUE);

    await userEvent.click(screen.getByRole("button", { name: "+ New task" }));
    const dialog = screen.getByRole("dialog", { name: "New task" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Room"), "r4");
    await userEvent.selectOptions(within(dialog).getByLabelText("Task"), "inspect");
    await userEvent.selectOptions(within(dialog).getByLabelText("Assign to"), ME);
    await userEvent.click(within(dialog).getByRole("button", { name: "Add task" }));
    expect(ops.createTask).toHaveBeenCalledWith("r4", "inspect", TODAY, ME, "", 2);
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Task added for room 104"));
  });

  it("read-only roles see the board without any controls", () => {
    render(<HousekeepingBoard {...housekeeper} canWrite={false} />);
    expect(screen.queryByRole("group", { name: /Set status/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Report a problem" })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ New task" })).toBeNull();
  });
});

/* ================================================================ Website content */

describe("website content: draft → preview → publish", () => {
  const groups: Group[] = [
    {
      title: "Hero",
      fields: [
        { type: "text", name: "hero_title", label: "Main heading", required: true, max: 120 },
        { type: "textarea", name: "hero_lede", label: "Introduction", max: 240 },
      ],
    },
  ];
  const props = {
    sectionKey: "home",
    label: "Homepage",
    description: "",
    path: "/",
    groups,
    initial: { hero_title: "Welcome", hero_lede: "By the sea." },
    base: null,
    status: "live" as const,
    publishedAt: "2026-11-10T10:00:00Z",
    draftBy: null,
    draftAt: null,
    local: [],
    live: true,
  };
  const STAMP = "2026-11-18T08:00:00Z";

  it("nothing to save until something changes; saving a draft keeps the live site as is", async () => {
    cms.saveSectionDraft.mockReturnValue(Promise.resolve({ ok: true, data: { base: STAMP } }));
    render(<SectionEditor {...props} />);
    const save = screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/Live since/)).toBeTruthy();

    const heading = screen.getByLabelText(/^Main heading/);
    await userEvent.clear(heading);
    await userEvent.type(heading, "Hello, sea");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    await userEvent.click(save);
    expect(cms.saveSectionDraft).toHaveBeenCalledWith("home", { hero_title: "Hello, sea", hero_lede: "By the sea." }, null);
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Draft saved — visitors still see the published version"));
    expect(screen.getByText(/Draft saved.*not live yet/)).toBeTruthy();
  });

  it("publishing asks first, saves pending edits, then publishes from that draft", async () => {
    cms.saveSectionDraft.mockReturnValue(Promise.resolve({ ok: true, data: { base: STAMP } }));
    cms.publishSection.mockReturnValue(ok("Published — the website shows it now"));
    render(<SectionEditor {...props} />);
    await userEvent.type(screen.getByLabelText(/^Introduction/), " Breakfast included.");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    const confirm = screen.getByRole("dialog", { name: "Publish homepage?" });
    expect(cms.publishSection).not.toHaveBeenCalled();
    await userEvent.click(within(confirm).getByRole("button", { name: "Publish now" }));
    await waitFor(() => expect(cms.publishSection).toHaveBeenCalledWith("home", STAMP));
    expect(cms.saveSectionDraft).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Published — the website shows it now"));
  });

  it("validation errors are shown on the field and nothing is published", async () => {
    cms.saveSectionDraft.mockReturnValue(Promise.resolve({ ok: false, message: "Main heading is required.", errors: [{ path: "hero_title", message: "Main heading is required." }] }));
    render(<SectionEditor {...props} />);
    await userEvent.clear(screen.getByLabelText(/^Main heading/));
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Publish homepage?" })).getByRole("button", { name: "Publish now" }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("Main heading is required."));
    expect(cms.publishSection).not.toHaveBeenCalled();
    const input = screen.getByLabelText(/^Main heading/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("Main heading is required.");
  });

  it("a colleague's newer draft is reported, not overwritten", async () => {
    cms.saveSectionDraft.mockReturnValue(fail("Someone else saved this section a moment ago. Reload to see their changes."));
    render(<SectionEditor {...props} />);
    await userEvent.type(screen.getByLabelText(/^Main heading/), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith(expect.stringMatching(/Someone else saved/)));
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("earlier versions can be brought back as a draft", async () => {
    cms.sectionVersions.mockReturnValue(Promise.resolve({ ok: true, data: [{ version: 2, title: null, published_at: "2026-11-10T10:00:00Z", published_by: "Manager" }] }));
    cms.restoreSectionVersion.mockReturnValue(ok("Version 2 is now a draft"));
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, configurable: true });
    render(<SectionEditor {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "History" }));
    const dialog = await screen.findByRole("dialog", { name: "Published versions" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Use as draft" }));
    expect(cms.restoreSectionVersion).toHaveBeenCalledWith("home", 2);
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });
});

/* ================================================================ Offers */

describe("offers workflow", () => {
  const types = [
    { id: "rt-king", name: "Deluxe King" },
    { id: "rt-family", name: "Family Suite" },
  ];
  const existing: Promotion = {
    id: "p1",
    code: "SEA10",
    name: "Sea breeze",
    description: "",
    discount_type: "percent",
    discount_value: 10,
    starts_on: "2026-12-01",
    ends_on: "2027-01-01",
    min_nights: 2,
    room_type_ids: ["rt-king"],
    is_public: true,
    is_active: true,
    stackable: false,
    auto_apply: false,
    max_redemptions: 50,
    max_discount_bdt: null,
    bookable_from: null,
    bookable_until: null,
  };
  const base = { types, today: TODAY, maxPercent: 40, live: true };

  it("creates a fixed-amount, room-specific, date-limited, combinable offer", async () => {
    ops.savePromotion.mockReturnValue(ok("Offer saved"));
    render(<PromotionsManager promotions={[]} usage={[]} {...base} />);
    expect(screen.getByText(/never take more than 40%/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "+ New offer" }));
    const d = screen.getByRole("dialog", { name: "New offer" });
    await userEvent.type(within(d).getByLabelText("Name guests see"), "Family weekend");
    await userEvent.selectOptions(within(d).getByLabelText("Discount type"), "amount");
    const amount = within(d).getByLabelText(/^Taka off/);
    await userEvent.clear(amount);
    await userEvent.type(amount, "1,500");
    await userEvent.type(within(d).getByLabelText(/^Promo code/), "fam-26");
    const first = within(d).getByLabelText("First night");
    await userEvent.clear(first);
    await userEvent.type(first, "2026-12-20");
    const last = within(d).getByLabelText(/^Last night/);
    await userEvent.clear(last);
    await userEvent.type(last, "2026-12-31");
    await userEvent.click(within(d).getByLabelText("Family Suite"));
    await userEvent.click(within(d).getByLabelText(/Combinable/));
    await userEvent.click(within(d).getByRole("button", { name: "Save offer" }));

    expect(ops.savePromotion).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        name: "Family weekend",
        discount_type: "amount",
        discount_value: 1500,
        code: "FAM26",
        starts_on: "2026-12-20",
        ends_on: "2027-01-01", // the last night is inclusive; the range end is the morning after
        room_type_ids: ["rt-family"],
        stackable: true,
      }),
    );
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Offer saved"));
  });

  it("lists an offer in plain words and keeps the dialog open when the server refuses", async () => {
    ops.savePromotion.mockReturnValue(fail("That code is already used by another offer."));
    render(<PromotionsManager promotions={[existing]} usage={[{ promotion_id: "p1", bookings: 3, discount_bdt: 2400 }]} {...base} />);
    const row = screen.getByText("Sea breeze").closest("tr")!;
    expect(within(row).getByText(/Code SEA10 · Stands alone · Deluxe King/)).toBeTruthy();
    expect(within(row).getByText(/3 of 50/)).toBeTruthy();
    // Used offers can't be deleted (only switched off).
    expect((within(row).getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(within(row).getByRole("button", { name: "Edit" }));
    const d = screen.getByRole("dialog", { name: "Edit offer" });
    expect((within(d).getByLabelText(/^Last night/) as HTMLInputElement).value).toBe("2026-12-31");
    await userEvent.click(within(d).getByRole("button", { name: "Save offer" }));
    expect(ops.savePromotion).toHaveBeenCalledWith("p1", expect.objectContaining({ ends_on: "2027-01-01" }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("That code is already used by another offer."));
    expect(screen.getByRole("dialog", { name: "Edit offer" })).toBeTruthy();
  });

  it("switches an offer off in one tap, and deletes an unused one after confirming", async () => {
    ops.setPromotionActive.mockReturnValue(ok("Offer switched off"));
    ops.deletePromotion.mockReturnValue(ok("Offer deleted"));
    render(<PromotionsManager promotions={[existing]} usage={[]} {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Switch off" }));
    expect(ops.setPromotionActive).toHaveBeenCalledWith("p1", false);
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Offer switched off"));

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(ops.deletePromotion).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole("dialog", { name: /Delete “Sea breeze”/ })).getByRole("button", { name: "Delete offer" }));
    expect(ops.deletePromotion).toHaveBeenCalledWith("p1");
  });
});

/* ================================================================ Maintenance blocks */

describe("maintenance block workflow", () => {
  it("blocks a room for chosen nights (last night inclusive) and releases it", async () => {
    ops.blockRoom.mockReturnValue(ok("Room blocked — it won't be sold for those dates"));
    ops.releaseBlock.mockReturnValue(ok("Block released — the room is on sale again"));
    render(<MaintenanceBlocks roomId="r1" number="101" today={TODAY} blocks={[{ id: "b1", room_id: "r1", starts_on: "2026-12-01", ends_on: "2026-12-03", reason: "Repainting", released_at: null }]} />);
    const block = screen.getByRole("button", { name: "Block these dates" }) as HTMLButtonElement;
    expect(block.disabled).toBe(true); // needs a reason
    const last = screen.getAllByLabelText("Last night")[0];
    await userEvent.clear(last);
    await userEvent.type(last, "2026-11-20");
    await userEvent.type(screen.getByLabelText("Reason for the block"), "AC repair");
    await userEvent.click(block);
    expect(ops.blockRoom).toHaveBeenCalledWith("r1", TODAY, "2026-11-21", "AC repair");
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Room 101: Room blocked — it won't be sold for those dates"));

    await userEvent.click(screen.getByRole("button", { name: "Release" }));
    expect(ops.releaseBlock).toHaveBeenCalledWith("b1");
  });

  it("explains a refusal when a guest already has the room", async () => {
    ops.blockRoom.mockReturnValue(fail("A guest is booked into this room on those dates. Move them first."));
    render(<MaintenanceBlocks roomId="r1" number="101" today={TODAY} blocks={[]} />);
    await userEvent.type(screen.getByLabelText("Reason for the block"), "Leak");
    await userEvent.click(screen.getByRole("button", { name: "Block these dates" }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith(expect.stringMatching(/guest is booked/)));
  });
});

/* ================================================================ Team */

describe("team workflow", () => {
  const staff = [
    { user_id: ME, full_name: "Maya Manager", role: "manager" as const, active: true, email: "maya@example.com" },
    { user_id: COLLEAGUE, full_name: "Rafi Reception", role: "receptionist" as const, active: true, email: "rafi@example.com" },
    { user_id: "00000000-0000-4000-8000-000000000003", full_name: "Olivia Owner", role: "owner" as const, active: true },
  ];

  it("a manager can't change their own role or anyone at or above them", () => {
    render(<TeamPanel staff={staff} selfId={ME} myRole="manager" live />);
    expect((screen.getByLabelText("Role for Maya Manager") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Role for Olivia Owner") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Role for Rafi Reception") as HTMLSelectElement).disabled).toBe(false);
    // No access button for themselves or the owner.
    expect(screen.getAllByRole("button", { name: "Revoke access" })).toHaveLength(1);
  });

  it("only offers roles below the manager's own when inviting", () => {
    render(<TeamPanel staff={staff} selfId={ME} myRole="manager" live />);
    const invite = screen.getAllByRole("combobox").at(-1) as HTMLSelectElement;
    const offered = [...invite.options].map((o) => o.value);
    expect(offered).not.toContain("owner");
    expect(offered).not.toContain("super_admin");
    expect(offered).not.toContain("manager");
    expect(offered).toContain("receptionist");
    expect(offered).toContain("housekeeping");
  });

  it("invites a colleague, confirms, and clears the form", async () => {
    actions.inviteStaff.mockReturnValue(ok("Invitation sent to sara@example.com"));
    render(<TeamPanel staff={staff} selfId={ME} myRole="manager" live />);
    await userEvent.type(screen.getByLabelText("Name"), "Sara");
    await userEvent.type(screen.getByLabelText("Email"), "sara@example.com");
    await userEvent.selectOptions(screen.getAllByRole("combobox").at(-1)!, "housekeeping");
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(actions.inviteStaff).toHaveBeenCalledWith("sara@example.com", "Sara", "housekeeping");
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Invitation sent to sara@example.com"));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
  });

  it("changes a role and removes access, reporting refusals", async () => {
    actions.updateStaffMember.mockReturnValueOnce(ok("Role changed")).mockReturnValueOnce(fail("You can only manage people below your own role."));
    render(<TeamPanel staff={staff} selfId={ME} myRole="manager" live />);
    await userEvent.selectOptions(screen.getByLabelText("Role for Rafi Reception"), "housekeeping");
    expect(actions.updateStaffMember).toHaveBeenCalledWith(COLLEAGUE, { role: "housekeeping" });
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Role changed"));
    await userEvent.click(screen.getByRole("button", { name: "Revoke access" }));
    expect(actions.updateStaffMember).toHaveBeenLastCalledWith(COLLEAGUE, { active: false });
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("You can only manage people below your own role."));
  });
});
