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
  BAD_INQUIRY: "Please add your name, a phone number or email, and a message of at least 10 characters.",
  NOT_ALLOWED: "Your role doesn't allow this. Ask a manager if you need it.",
  MFA_REQUIRED: "Confirm it's you with your authenticator app first.",
  BAD_ROLE: "Choose one of the roles listed.",
  RANK: "You can only appoint or change people below your own role.",
  SELF_CHANGE: "You can't change your own role or access. Ask another manager or the owner.",
  LAST_OWNER: "The hotel must keep at least one active owner.",
  REFUND_TOO_LARGE: "That's more than has been paid on this booking (counting refunds in progress).",
  SAME_PERSON: "Someone else must approve a refund you requested.",
  BLOCK_OVERLAP: "That room is already blocked for some of those dates.",
  BAD_TASK: "Choose a task type and a priority.",
  BAD_REVIEW: "A review needs a rating from 1 to 5 and at least 10 characters (and a link if it's from another site).",
  NOT_ELIGIBLE: "Reviews open after check-out, with the booking's reference and contact.",
  ALREADY_REVIEWED: "This stay has already been reviewed. Thank you!",
  AUDIT_IMMUTABLE: "The audit log can't be changed.",
  UNAVAILABLE: "This isn't available online yet. Please call or WhatsApp us and we'll help straight away.",
  TOO_FAR: "We take online bookings up to a year ahead. For later dates, please call us.",
  NO_RATE_PLAN: "That rate isn't available for this room. Please choose another.",
  RATE_PLAN_NIGHTS: "That rate needs a different length of stay.",
  TOO_MANY_ROOMS: "You can book up to 5 rooms online. For more, please call us about a group booking.",
  BAD_GUEST: "Please check the guest's name, mobile number and requests.",
  PROMO_INVALID: "That promo code isn't valid. Check the spelling, or continue without it.",
  PROMO_NOT_APPLICABLE: "That promo code doesn't apply to these dates or rooms.",
  PROMO_EXHAUSTED: "That promo code has been fully used.",
  HOLD_NOT_FOUND: "We couldn't find your room selection. Please choose your rooms again.",
  HOLD_EXPIRED: "Your rooms were held for 15 minutes and that time has passed. Please choose them again; we'll check they're still free.",
  PRICE_CHANGED: "The price for these dates has just changed. Please review the new total before confirming.",
  BAD_IDEMPOTENCY_KEY: "Something went wrong. Please refresh the page and try again.",
  IDEMPOTENCY_CONFLICT: "This request was already used for another booking. Please refresh the page and try again.",
  BAD_PAYMENT_OPTION: "Please choose how you'd like to pay.",
  ACCESS_EXPIRED: "For your privacy, this page has expired. Look up your booking again with your reference and phone or email.",
  ROOM_BLOCKED: "That room is blocked for maintenance on some of these nights.",
  CAPACITY_BREACH: "Those rooms were just taken. Please choose again.",
  CONTENT_CONFLICT: "Someone else saved this section after you opened it. Reload to see their changes, then make yours again.",
  NOTHING_TO_PUBLISH: "There are no unpublished changes to publish.",
  BAD_CONTENT: "Some of this content isn't valid. Check the highlighted fields.",
  MEDIA_IN_USE: "This image is still used on the website. Replace it, or remove it from those pages first.",
  BAD_MEDIA: "Upload a JPEG, PNG, WebP or AVIF image under 10 MB.",
  BAD_ROOM_TYPE: "Give the room type a name (3–60 characters), a bed description, sleeps 1–10 and a rate between ৳500 and ৳1,000,000.",
  SEASON_OVERLAP: "Another active season already covers some of those nights for this room type. Change the dates or switch the other season off.",
  BAD_SEASON: "Give the season a name, an end date after the start (up to a year), and a rate between ৳500 and ৳1,000,000.",
  BAD_PROMO: "Check the offer: a name, a discount (percent up to 90%), and an end date after the start.",
  PROMO_CODE_TAKEN: "Another offer already uses that code. Choose a different code.",
  PROMO_IN_USE: "Guests have already booked with this offer, so it can't be deleted. Switch it off instead.",
  BAD_ROOM_DETAILS: "Check the room details: a name, a bed description, and sleeps 1–10.",
  METHOD_DISABLED: "That payment method isn't offered at the moment. Choose another, or pay at the hotel.",
  METHOD_UNAVAILABLE: "That payment method isn't available yet. Choose another, or pay at the hotel.",
  GATEWAY_UNAVAILABLE: "We couldn't reach the payment service just now. Nothing has been charged — please try again in a few minutes, or choose another way to pay.",
  BAD_REFERENCE: "Enter the transaction ID exactly as it appears in your confirmation SMS or bank receipt (6–40 letters and numbers).",
  DUPLICATE_REFERENCE: "That transaction ID has already been reported. If you think this is a mistake, please call or WhatsApp us.",
  TOO_MANY_PENDING: "You already have three payments waiting to be checked. We'll confirm them shortly — please wait before reporting another.",
  RESEND_NOT_ALLOWED: "Only messages that failed, weren't sent, or weren't set up can be resent.",
  ALREADY_RESENT: "This message has already been resent. Check the newer copy in the list.",
  NO_RECIPIENT: "There's no email address or WhatsApp number for this guest. Add one to the booking first.",
  NO_CONSENT: "The guest hasn't agreed to WhatsApp messages, so this can't be sent on WhatsApp.",
  RESEND_LIMIT: "This message has been resent three times today. Contact the guest directly instead.",
};

/** PostgREST / Postgres wording when a function or table hasn't been created yet. */
const MISSING_OBJECT = /Could not find the function|PGRST202|does not exist|schema cache/i;

export function errorMessage(code: string): string {
  return MESSAGES[code] ?? "Something went wrong. Please try again.";
}

/** Maps a thrown value (RepoError or database error text) to a known code. */
export function errorCode(err: unknown): string {
  if (err instanceof RepoError) return err.code;
  const text = err instanceof Error ? err.message : String(err);
  // Longest first: "ROOM_BLOCKED" contains "LOCKED", "HOLD_NOT_FOUND" contains "NOT_FOUND".
  const known = Object.keys(MESSAGES)
    .sort((a, b) => b.length - a.length)
    .find((code) => text.includes(code));
  if (known) return known;
  return MISSING_OBJECT.test(text) ? "UNAVAILABLE" : "UNKNOWN";
}
