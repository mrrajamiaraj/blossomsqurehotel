import Image from "next/image";
import type { Photo } from "@/lib/photos";

type Props = {
  photo: Photo;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Scale up gently when an ancestor .hover-zoom is hovered. */
  zoom?: boolean;
  /** Hide the reference caption (e.g. on very small thumbnails). */
  bare?: boolean;
  style?: React.CSSProperties;
};

export default function PhotoFrame({ photo, className = "", sizes = "100vw", priority, zoom, bare, style }: Props) {
  return (
    <div className={`photo ${zoom ? "photo--zoom" : ""} ${className}`} style={style}>
      {photo.src ? (
        <Image src={photo.src} alt={photo.alt} fill sizes={sizes} preload={priority} loading={priority ? "eager" : undefined} />
      ) : (
        <>
          {/* data-ref tells the hotel which file to add: public/photos/<ref>.jpg */}
          <div className="photo-plate" data-tone={photo.tone} data-ref={photo.ref} role="img" aria-label={`${photo.alt} (photograph to come)`} />
          {!bare && <span className="photo-ref">Photograph to come</span>}
        </>
      )}
    </div>
  );
}
