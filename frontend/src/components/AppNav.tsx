import { Link, NavLink, useLocation } from "react-router-dom";
import { ADVANCED_LINKS } from "../lib/navLinks";
import { BusinessSwitcher } from "./BusinessSwitcher";

const ADVANCED_PATHS = ["/scenarios", "/compare", "/history", "/setup"];

export function AppNav() {
  const location = useLocation();
  const inAdvanced = ADVANCED_PATHS.includes(location.pathname);

  return (
    <nav className="appnav" aria-label="Main">
      {/* The name always takes you to the start screen. Opening it never changes or deletes anything. */}
      <Link to="/" className="appnav-title">
        Business Time Machine
      </Link>
      <ul className="appnav-links">
        <li>
          <NavLink to="/today" className={({ isActive }) => (isActive ? "active" : "")}>
            Today
          </NavLink>
        </li>
        <li>
          <NavLink to="/try" className={() => (location.pathname === "/try" || location.pathname === "/timeline" ? "active" : "")}>
            Try a change
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
