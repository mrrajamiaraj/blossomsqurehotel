import "server-only";
import type {
  ActivityItem,
  Booking,
  BookingChange,
  BookingEvent,
  BookingFilter,
  BookingStatus,
  GuestBookingView,
  GuestDetails,
  GuestSummary,
  HotelSettings,
  Inquiry,
  InquiryInput,
  InquiryStatus,
  PaymentMethod,
  RoomPatch,
  RoomTypePatch,
  RoomTypeRecord,
  RoomUnit,
  RoomUnitInput,
  StaffBookingInput,
  StaffMember,
  WebsiteBookingInput,
} from "./types";

/** What the public site needs. */
export interface PublicRepo {
  readonly mode: "live" | "preview";
  listRoomTypes(opts?: { includeUnpublished?: boolean }): Promise<RoomTypeRecord[]>;
  /** Free units per room-type slug for [checkIn, checkOut). */
  availability(checkIn: string, checkOut: string): Promise<Record<string, number>>;
  getSettings(): Promise<HotelSettings>;
  /** Returns the booking reference. Throws RepoError on rule violations. */
  createWebsiteBooking(input: WebsiteBookingInput): Promise<string>;
  /**
   * A guest's own booking, when the reference and the phone or email on it
   * both match; otherwise null. Throws RepoError("UNAVAILABLE") until the
   * guest-services migration is applied.
   */
  lookupBooking(reference: string, contact: string): Promise<GuestBookingView | null>;
  /** Stores a website enquiry; returns its reference (ENQ-…). */
  submitInquiry(input: InquiryInput): Promise<string>;
}

/** What the front desk needs. Every method is permission-checked. */
export interface AdminRepo extends PublicRepo {
  listRooms(): Promise<RoomUnit[]>;
  listBookings(filter: BookingFilter): Promise<{ rows: Booking[]; total: number }>;
  /** Bookings whose stay touches [from, to), any status. */
  bookingsBetween(from: string, to: string): Promise<Booking[]>;
  /** Bookings received on or after `since` (ISO date), any stay dates. */
  bookingsReceivedSince(since: string): Promise<Booking[]>;
  countPending(): Promise<number>;
  getBooking(reference: string): Promise<Booking | null>;
  bookingEvents(bookingId: string): Promise<BookingEvent[]>;
  recentActivity(limit: number): Promise<ActivityItem[]>;
  guests(q: string, page: number, pageSize: number): Promise<{ rows: GuestSummary[]; total: number }>;
  bookingsForGuest(key: string): Promise<Booking[]>;

  createStaffBooking(input: StaffBookingInput): Promise<string>;
  setStatus(id: string, status: BookingStatus, reason?: string): Promise<void>;
  assignRoom(id: string, roomId: string | null): Promise<void>;
  modifyBooking(id: string, change: BookingChange): Promise<void>;
  recordPayment(id: string, amount: number, method: PaymentMethod, note: string): Promise<void>;
  updateGuestDetails(id: string, details: GuestDetails): Promise<void>;

  updateRoomType(id: string, patch: RoomTypePatch): Promise<void>;
  updateRoom(id: string, patch: RoomPatch): Promise<void>;
  /** Manager only. Returns the new room's id. */
  addRoom(input: RoomUnitInput): Promise<string>;
  /** Manager only. Renames, re-types or re-floors a room. */
  editRoom(id: string, input: RoomUnitInput): Promise<void>;
  /** Manager only. Removes a room that has never been booked. */
  deleteRoom(id: string): Promise<void>;
  updateSettings(patch: Partial<HotelSettings>): Promise<void>;
  listStaff(): Promise<StaffMember[]>;

  listInquiries(opts: { status?: InquiryStatus | "all"; limit?: number }): Promise<Inquiry[]>;
  setInquiryStatus(id: string, status: InquiryStatus): Promise<void>;
}

export const DEFAULT_SETTINGS: HotelSettings = {
  // Blank until a manager fills them in under Admin → Settings; the website
  // hides anything blank.
  cancellation_policy: "",
  children_policy: "",
  confirm_call_within: "",
  vat_percent: null,
  service_charge_percent: null,
};
