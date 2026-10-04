import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** The position React Router keeps in the browser's history entry (0 for the first page it showed). Not available in tests that use an in-memory router. */
function browserIndex(): number | null {
  try {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    return typeof idx === "number" ? idx : null;
  } catch {
    return null;
  }
}

/** How many pages the person has opened INSIDE the app since this page was loaded, that they could still go back to.
 *  0 means "nothing before this page in the app" (they opened the link directly, or refreshed): `history.length` cannot
 *  tell that, because it also counts pages from before the app and pages ahead of you.
 *
 *  Counted from the router's own navigation events: a push adds one, a replace adds none, and going back or forward
 *  (the browser's buttons, Backspace, Alt+Left, or our button) moves it by the distance travelled. It lives in memory
 *  only: a refresh starts again at 0. Mount it once, in the layout that is always on screen. */
export function useInAppDepth(): number {
  const location = useLocation();
  const type = useNavigationType();
  const [depth, setDepth] = useState(0);
  const lastKey = useRef(location.key);
  const lastIndex = useRef<number | null>(browserIndex());

  useEffect(() => {
    if (location.key === lastKey.current) return; // the first render, or a repeat
    lastKey.current = location.key;
    const index = browserIndex();
    const before = lastIndex.current;
    lastIndex.current = index;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a router event, which is outside React
    setDepth((d) => {
      if (type === "PUSH") return d + 1;
      if (type === "POP") return Math.max(0, d + (index !== null && before !== null ? index - before : -1));
      return d; // REPLACE
    });
  }, [location.key, type]);

  return depth;
}
