/** A rule the database (or preview store) refused, identified by code. */
export class RepoError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "RepoError";
  }
}

const MESSAGES: Record<string, string> = {
  SOLD_OUT: "That room is fully booked for these dates. Choose another room or change the dates.",
  PAST_DATE: "The check-in date has passed. Please choose new dates.",
  BAD_DATES: "Please choose a stay of between 1 and 30 nights.",
  NO_ROOM: "That room type isn't available. Please choose another.",
  TOO_MANY_GUESTS: "That's more guests than the rooms chosen can sleep. Add a room, or adjust guests.",
  BAD_EMAIL: "Please enter a valid email address.",
  RATE_LIMITED: "We've received several requests from these details in the last hour. Please call us to complete your booking.",
  NOT_STAFF: "Your account doesn't have front-desk access.",
  NOT_MANAGER: "Only a manager can make this change.",
  NOT_FOUND: "That booking no longer exists.",
  BAD_TRANSITION: "That change isn't possible from the booking's current status.",
  ASSIGN_ROOM: "Assign a room before checking the guest in.",
  ROOM_TAKEN: "That room is already given to another guest for some of these nights.",
  WRONG_ROOM_TYPE: "That room is a different room type from the booking.",
  ROOM_OUT_OF_SERVICE: "That room is out of service.",
  TOO_EARLY: "This can only be done on or after the arrival date.",
  BAD_AMOUNT: "Enter a payment amount greater than zero and choose a method.",
  LOCKED: "This booking can no longer be changed.",
  OFFLINE: "Online booking is unavailable right now. Please call us and we'll reserve your room.",
  BAD_ROOM_NUMBER: "Use 1–10 letters, numbers or dashes for the room number, e.g. 101 or A-12.",
  ROOM_EXISTS: "There's already a room with that number.",
  ROOM_IN_USE: "That room has bookings. Take it out of service instead, or move its bookings first.",
  ROOM_NEEDED: "Existing bookings need every room of this type. Move or cancel some of them first.",
  BAD_PHOTO: "Upload a JPEG, PNG or WebP photo under 5 MB.",
  PHOTO_LIMIT: "A room can have up to 12 photos. Remove one first.",
};

export function errorMessage(code: string): string {
  return MESSAGES[code] ?? "Something went wrong. Please try again.";
}

/** Maps a thrown value (RepoError or database error text) to a known code. */
export function errorCode(err: unknown): string {
  if (err instanceof RepoError) return err.code;
  const text = err instanceof Error ? err.message : String(err);
  return Object.keys(MESSAGES).find((code) => text.includes(code)) ?? "UNKNOWN";
}
