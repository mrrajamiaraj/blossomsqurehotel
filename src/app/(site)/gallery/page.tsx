import CtaBand from "@/components/site/CtaBand";
import PageHero from "@/components/site/PageHero";
import PhotoGallery from "@/components/system/PhotoGallery";
import { categoriesWithPhotos, galleryItems, missingCategories } from "@/lib/content/gallery";
import { photo } from "@/lib/photos";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Photo gallery",
  description: "Photographs of the rooms, suites and interiors at Blossom Square Hotel & Suites, Kolatoli, Cox's Bazar.",
  path: "/gallery",
  image: "/photos/DSC5566.jpg",
});

export default function GalleryPage() {
  const items = galleryItems();
  const missing = missingCategories(items);
  const hero = photo("DSC5566", "The Connecting King Suite in the evening, lamps lit above the bed", "dusk");

  return (
    <>
      <PageHero
        eyebrow="Gallery"
        title={
          <>
            The hotel, <em>as it is.</em>
          </>
        }
        lede="Every photograph here was taken at Blossom Square. Tap any image to see it full screen."
        crumbs={[{ label: "Gallery" }]}
        photo={hero}
      />

      <section className="section pt-[clamp(48px,6vw,88px)]" aria-label="Photographs">
        <div className="wrap">
          <PhotoGallery photos={items} categories={categoriesWithPhotos(items)} />
          {missing.length > 0 && (
            <p className="mt-12 max-w-[60ch] border-l-2 border-brass pl-5 text-sm leading-relaxed text-muted-foreground">
              Photographs of the {missing.map((m) => m.label.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1")} are on their way. We&apos;d
              rather show you nothing than a picture of somewhere else.
            </p>
          )}
        </div>
      </section>

      <CtaBand />
    </>
  );
}
