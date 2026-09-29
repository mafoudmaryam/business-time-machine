/** The selected business lives in the page address as "?business=3". These two
 * helpers read it and carry it along, so switching pages never loses it. */

export function readBusinessId(params: URLSearchParams): number | null {
  const raw = params.get("business");
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function withBusiness(path: string, businessId: number | null): string {
  return businessId ? `${path}?business=${businessId}` : path;
}
