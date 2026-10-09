/** The four photos of the start page. The files are made by `scripts/make-redesign-images.py` from the originals in
 *  public/images/redesign/. Sizes are fixed (the script crops to them), so the page never jumps when a photo loads. */
export interface LandingPhoto {
  /** Path without extension or size, e.g. "/images/redesign/hero". */
  base: string;
  /** Widths the script makes, smallest first. The first is the 1x size. A second, 2x width is only listed when the file exists. */
  widths: number[];
  /** Height divided by width, as the script crops it. */
  ratio: number;
  alt: string;
}

export const LANDING_PHOTOS = {
  hero: {
    base: "/images/redesign/hero",
    widths: [720],
    ratio: 1.25,
    alt: "A café owner in a green apron, chin resting on their hand, reading a page of figures beside a notebook and a coffee cup",
  },
  impact: {
    base: "/images/redesign/desk",
    widths: [632],
    ratio: 0.75,
    alt: "A wooden table seen from above with a notepad, printed food-cost sheets, a calculator, a tablet and a cup of coffee",
  },
  explain: {
    base: "/images/redesign/tablet",
    widths: [632],
    ratio: 0.75,
    alt: "A smiling café worker in an apron looking at a tablet behind the counter",
  },
  journal: {
    base: "/images/redesign/notes",
    widths: [632],
    ratio: 0.75,
    alt: "A shop owner in an apron writing in a notebook at a wooden table, a takeaway coffee in their other hand",
  },
} satisfies Record<string, LandingPhoto>;

export function photoSrcSet(photo: LandingPhoto): string | undefined {
  if (photo.widths.length < 2) return undefined;
  return photo.widths.map((w) => `${photo.base}-${w}.webp ${w}w`).join(", ");
}

export function photoSrc(photo: LandingPhoto): string {
  return `${photo.base}-${photo.widths[0]}.webp`;
}

export function photoHeight(photo: LandingPhoto): number {
  return Math.round(photo.widths[0] * photo.ratio);
}
