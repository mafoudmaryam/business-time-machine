import { Link, NavLink, useLocation } from "react-router-dom";
import { isStartScreen } from "../lib/backTarget";
import { jumpLink } from "../lib/jumpTo";
import { getRememberedBusinessId } from "../lib/session";
import { ADVANCED_LINKS } from "../lib/navLinks";
import { BusinessSwitcher } from "./BusinessSwitcher";
import { Logo } from "./Logo";

const ADVANCED_PATHS = ["/scenarios", "/compare", "/history", "/setup"];

export function AppNav() {
  const location = useLocation();
  const inAdvanced = ADVANCED_PATHS.includes(location.pathname);

  // The start screen is the front door: the top bar offers the sections of that page instead of the app's own pages.
  if (isStartScreen(location.pathname)) {
    return (
      <nav className="appnav appnav-landing" aria-label="Main">
        <Link to="/" className="appnav-title" aria-label="Business Time Machine">
          <Logo />
          <span className="brand-wordmark"><strong>Business Time Machine</strong></span>
        </Link>
        <ul className="appnav-links">
          <li>
            <a href="#how-it-works" onClick={jumpLink("how-it-works")}>How it works</a>
          </li>
          {/* The way back into an open business, so nobody is stranded on the front door. */}
          {getRememberedBusinessId() !== null && (
            <li>
              <Link to="/today">Today</Link>
            </li>
          )}
        </ul>
        {getRememberedBusinessId() !== null && <BusinessSwitcher />}
        <a href="#start-here" className="appnav-cta" onClick={jumpLink("start-here")}>
          Get started
        </a>
      </nav>
    );
  }

  return (
    <nav className="appnav" aria-label="Main">
      {/* The name always takes you to the start screen. Opening it never changes or deletes anything. */}
      <Link to="/" className="appnav-title" aria-label="Business Time Machine">
        <Logo />
        <span className="brand-wordmark"><strong>Business Time Machine</strong></span>
      </Link>
      <ul className="appnav-links">
        <li>
          <NavLink to="/today" className={({ isActive }) => (isActive ? "active" : "")}>
            Today
          </NavLink>
        </li>
        <li>
          <NavLink to="/explore" className={() => (location.pathname === "/explore" || location.pathname === "/try" || location.pathname === "/timeline" ? "active" : "")}>
            Try a change
          </NavLink>
        </li>
        <li>
          <NavLink to="/journal" className={({ isActive }) => (isActive ? "active" : "")}>
            My journal
          </NavLink>
        </li>
        <li>
          {/* keyed by address so the menu closes after you pick something */}
          <details className={inAdvanced ? "appnav-more active" : "appnav-more"} key={location.pathname}>
            <summary>Advanced</summary>
            <ul>
              {ADVANCED_LINKS.map((link) => (
                <li key={link.to}>
                  <NavLink to={link.to} className={({ isActive }) => (isActive ? "active" : "")}>
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </details>
        </li>
      </ul>
      <BusinessSwitcher />
    </nav>
  );
}

