import { Link, NavLink, useLocation } from "react-router-dom";
import { isStartScreen } from "../lib/backTarget";
import { jumpLink } from "../lib/jumpTo";
import { getRememberedBusinessId, rememberBusiness } from "../lib/session";
import { ADVANCED_LINKS, MAIN_LINKS, businessPageLink, navigationBusinessId } from "../lib/navLinks";
import { BusinessSwitcher } from "./BusinessSwitcher";
import { Logo } from "./Logo";

const ADVANCED_PATHS = ADVANCED_LINKS.map(link => String(link.to));

export function AppNav() {
  const location = useLocation();
  const businessId = navigationBusinessId(location.pathname, location.search, getRememberedBusinessId());
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
              <Link to="/today">Overview</Link>
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
        {MAIN_LINKS.map(link => {
          const current = link.paths.includes(location.pathname);
          return <li key={link.to}>
            <Link to={businessPageLink(link.to, businessId)} onClick={() => { if (businessId !== null) rememberBusiness(businessId); }} className={current ? "active" : ""} aria-current={current ? (location.pathname === link.to ? "page" : "location") : undefined}>
              {link.label}
            </Link>
          </li>;
        })}
        <li>
          {/* keyed by address so the menu closes after you pick something */}
          <details className={inAdvanced ? "appnav-more active" : "appnav-more"} key={location.key} onKeyDown={event => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
              event.stopPropagation();
            }
          }}>
            <summary>Advanced</summary>
            <ul>
              {ADVANCED_LINKS.map((link) => (
                <li key={link.to}>
                  <NavLink to={businessPageLink(link.to, businessId)} onClick={() => { if (businessId !== null) rememberBusiness(businessId); }} className={({ isActive }) => (isActive ? "active" : "")}>
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

