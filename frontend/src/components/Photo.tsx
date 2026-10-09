import { useState } from "react";
import { photoHeight, photoSrc, photoSrcSet, type LandingPhoto } from "../lib/landingImages";

/** A start-page photo. It always has a width, a height and a meaningful alt text, so nothing jumps when it loads.
 *  The frame has a soft sage background, so if a file is missing the page still looks tidy (a quiet empty frame). */
export function Photo({ photo, priority = false, sizes, className = "" }: {
  photo: LandingPhoto;
  /** The hero loads at once; everything else is lazy. */
  priority?: boolean;
  sizes: string;
  className?: string;
}) {
  const [missing, setMissing] = useState(false);
  const width = photo.widths[0];
  return (
    <img
      className={`photo ${missing ? "photo-missing" : ""} ${className}`.trim()}
      src={photoSrc(photo)}
      srcSet={photoSrcSet(photo)}
      sizes={photoSrcSet(photo) ? sizes : undefined}
      width={width}
      height={photoHeight(photo)}
      alt={missing ? "" : photo.alt}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : undefined}
      onError={() => setMissing(true)}
    />
  );
}
