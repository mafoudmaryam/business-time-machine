import type { MouseEvent } from "react";
import { prefersReducedMotion } from "./celebrate";

/** Scrolls to a section of the same page and moves keyboard focus there, WITHOUT changing the address.
 *  (A plain "#section" link adds a history entry, which the router would treat as a new page and reset the start form.) */
export function jumpTo(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  return true;
}

/** onClick for an <a href="#id">: keeps the link for screen readers and "open in new tab", but scrolls in place. */
export function jumpLink(id: string) {
  return (event: MouseEvent) => {
    if (jumpTo(id)) event.preventDefault();
  };
}
