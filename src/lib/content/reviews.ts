import type { Testimonial } from "@/components/system/TestimonialCard";
import { HOTEL } from "../hotel";

/**
 * Guest reviews.
 *
 * Content rule: only genuine reviews, each with its source, added by the hotel
 * (or, in a later phase, imported from Google/Booking.com with permission).
 * The list is empty today, so the website links to the hotel's public Google
 * listing instead of showing quotes.
 *
 * Contract for the next phase: replace `getReviews` with a source that reads
 * approved reviews from the database; pages already handle an empty list.
 */
export interface ReviewSource {
  getReviews(opts?: { limit?: number }): Promise<Testimonial[]>;
}

const VERIFIED_REVIEWS: Testimonial[] = [];

export const staticReviews: ReviewSource = {
  async getReviews({ limit } = {}) {
    return VERIFIED_REVIEWS.slice(0, limit ?? VERIFIED_REVIEWS.length);
  },
};

export const getReviews = staticReviews.getReviews;

/** Where guests can read and leave reviews today. */
export const REVIEWS_URL = HOTEL.mapUrl;
