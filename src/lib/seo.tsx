import type { Metadata } from "next";
import { HOTEL } from "./hotel";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://blossomsquare.online").replace(/\/$/, "");

/** Page metadata with a canonical URL and matching Open Graph fields. */
export function pageMetadata({ title, description, path, image, noindex }: { title: string; description: string; path: string; image?: string | null; noindex?: boolean }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} · ${HOTEL.fullName}`,
      description,
      url: path,
      siteName: HOTEL.fullName,
      type: "website",
      locale: "en_GB",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

type JsonLdHotel = { fullName: string; phones: readonly { href: string }[]; email: string; address: string; mapUrl: string };

/** schema.org Hotel, from the hotel's published facts only (Website content → Contact details). */
export function hotelJsonLd(opts: { image?: string | null; priceRange?: string | null; hotel?: JsonLdHotel } = {}) {
  const h = opts.hotel ?? HOTEL;
  const street = h.address.replace(/,\s*Cox'?s Bazar\s*$/i, "");
  return {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name: h.fullName,
    url: SITE_URL,
    telephone: h.phones.map((p) => p.href.replace("tel:", "")),
    email: h.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: street,
      addressLocality: "Cox's Bazar",
      postalCode: "4700",
      addressCountry: "BD",
    },
    hasMap: h.mapUrl,
    checkinTime: "13:00",
    checkoutTime: "11:00",
    petsAllowed: false,
    ...(opts.image ? { image: opts.image.startsWith("https://") ? opts.image : `${SITE_URL}${opts.image}` } : {}),
    ...(opts.priceRange ? { priceRange: opts.priceRange } : {}),
    amenityFeature: ["Swimming pool", "Free Wi-Fi", "Free parking", "Breakfast included", "24-hour room service", "Restaurant"].map((name) => ({
      "@type": "LocationFeatureSpecification",
      name,
      value: true,
    })),
  };
}

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
