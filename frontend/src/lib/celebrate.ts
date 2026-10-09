/** A small burst of confetti, for the moment the owner SAVES something (a plan, a journal month).
 *  Never call it for a forecast, a result or a good number: it celebrates the owner's own action, not the outcome.
 *
 *  It is plain DOM, not React, so it keeps playing while the page changes underneath it (saving a plan opens the
 *  results page at once). It does nothing for people who asked for less motion, and it never takes a click or a tap. */

const COLORS = ["#2e7d50", "#f2a33a", "#e3f0e4", "#226b41", "#ffd9a0"];
const PIECES = 36;
const LIFETIME_MS = 2200;

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function celebrate(): void {
  if (typeof document === "undefined" || prefersReducedMotion()) return;
  try {
    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    layer.setAttribute("aria-hidden", "true");
    for (let i = 0; i < PIECES; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.setProperty("--x", `${Math.round(Math.random() * 100)}vw`);
      piece.style.setProperty("--drift", `${Math.round(Math.random() * 160 - 80)}px`);
      piece.style.setProperty("--spin", `${Math.round(Math.random() * 720 - 360)}deg`);
      piece.style.setProperty("--delay", `${Math.round(Math.random() * 300)}ms`);
      piece.style.setProperty("--color", COLORS[i % COLORS.length]);
      layer.appendChild(piece);
    }
    document.body.appendChild(layer);
    window.setTimeout(() => layer.remove(), LIFETIME_MS + 400);
  } catch {
    // A celebration is never worth an error.
  }
}
