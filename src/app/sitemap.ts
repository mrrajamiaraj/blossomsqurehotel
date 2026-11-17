import type { MetadataRoute } from "next";
import { getRooms } from "@/lib/rooms";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 3600;

const PAGES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/rooms", priority: 0.9 },
  { path: "/offers", priority: 0.7 },
  { path: "/dining", priority: 0.6 },
  { path: "/facilities", priority: 0.6 },
  { path: "/meetings-events", priority: 0.6 },
  { path: "/gallery", priority: 0.5 },
  { path: "/about", priority: 0.5 },
  { path: "/contact", priority: 0.6 },
  { path: "/faq", priority: 0.5 },
  { path: "/privacy", priority: 0.2 },
  { path: "/terms", priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rooms = await getRooms();
  return [
    ...PAGES.map((p) => ({ url: `${SITE_URL}${p.path}`, priority: p.priority, changeFrequency: "weekly" as const })),
    ...rooms.map((r) => ({ url: `${SITE_URL}/rooms/${r.slug}`, priority: 0.8, changeFrequency: "weekly" as const })),
  ];
}
