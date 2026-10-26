import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useInAppDepth } from "../hooks/useInAppDepth";
import { isStartScreen } from "../lib/backTarget";
import { AppNav } from "./AppNav";
import { BackButton } from "./BackButton";
import { ErrorBoundary } from "./ErrorBoundary";

/** The frame around every page: skip link, top bar, a "← Back" button (on every page except the start screen), then the page.
 *  Pages do not add their own Back button; they just render inside this. */
export function AppLayout({ children }: { children: ReactNode }) {
  const { pathname, hash } = useLocation();
  const depth = useInAppDepth(); // mounted here, so it keeps counting on the start screen too

  useEffect(() => {
    // A new page starts at its introduction, including for keyboard users.
    // Deep links such as /today#assumed keep their own target and disclosure.
    if (hash) return;
    document.getElementById("main")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash]);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to the page
      </a>
      <AppNav />
      <main id="main" tabIndex={-1}>
        {!isStartScreen(pathname) && <BackButton canGoBack={depth > 0} />}
        <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
      </main>
    </>
  );
}
