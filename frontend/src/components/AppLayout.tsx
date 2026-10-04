import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useInAppDepth } from "../hooks/useInAppDepth";
import { isStartScreen } from "../lib/backTarget";
import { AppNav } from "./AppNav";
import { BackButton } from "./BackButton";

/** The frame around every page: skip link, top bar, a "← Back" button (on every page except the start screen), then the page.
 *  Pages do not add their own Back button; they just render inside this. */
export function AppLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const depth = useInAppDepth(); // mounted here, so it keeps counting on the start screen too

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to the page
      </a>
      <AppNav />
      <main id="main" tabIndex={-1}>
        {!isStartScreen(pathname) && <BackButton canGoBack={depth > 0} />}
        {children}
      </main>
    </>
  );
}
