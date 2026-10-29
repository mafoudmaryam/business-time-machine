/** Existing routes, grouped by the owner's task. Tools contains the first working practical calculator. */
export const MAIN_LINKS = [
  { to: "/today", label: "Overview", paths: ["/today", "/how", "/share"] },
  { to: "/explore", label: "Try an idea", paths: ["/explore", "/try", "/timeline", "/scenarios", "/compare", "/history"] },
  { to: "/journal", label: "Track results", paths: ["/journal"] },
  { to: "/tools", label: "Tools", paths: ["/tools"] },
];

export const ADVANCED_LINKS = [
  { to: "/scenarios", label: "Detailed plan builder" },
  { to: "/compare", label: "Compare plans" },
  { to: "/history", label: "Saved plans and results" },
  { to: "/how", label: "Inputs and assumptions" },
  { to: "/share", label: "Print or save PDF" },
  { to: "/setup", label: "Detailed business setup" },
] as const;

/** Carry the already chosen business into existing specialist pages; opening a link saves nothing. */
export function businessPageLink(path: string, businessId: number | null): string {
  return businessId !== null && ["/scenarios", "/compare", "/history"].includes(path)
    ? `${path}?business=${businessId}` : path;
}

/** Specialist pages already encode their selected business in the URL. */
export function navigationBusinessId(path: string, search: string, remembered: number | null): number | null {
  if (!["/scenarios", "/compare", "/history"].includes(path)) return remembered;
  const selected = Number(new URLSearchParams(search).get("business"));
  return Number.isInteger(selected) && selected > 0 ? selected : remembered;
}
