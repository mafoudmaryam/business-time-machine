import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: ReactNode;
  /** A photo behind the heading, e.g. from lib/images.ts#heroImage. */
  image?: string;
}

/** The same heading block at the top of every page: a big title and one line saying
 * what the page is for, optionally over a softened photo. */
export function PageHeading({ title, subtitle, image }: Props) {
  return (
    <div
      className={image ? "page-heading has-image" : "page-heading"}
      style={image ? { backgroundImage: `url(${image})` } : undefined}
    >
      <h1>{title}</h1>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
  );
}
