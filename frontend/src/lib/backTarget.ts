/** The start screen: the only page without a Back button. */
export function isStartScreen(pathname: string): boolean {
  return pathname === "/" || pathname === "/start";
}

/** Where "Back" goes when there is no earlier page inside the app (opened by link, or after a refresh).
 *  Today -> the start screen. Everything else (Try a change, Advanced pages, a scenario, a result, the timeline) -> Today. */
export function parentPath(pathname: string): string {
  if (isStartScreen(pathname)) return "/";
  if (pathname === "/today") return "/";
  return "/today";
}
