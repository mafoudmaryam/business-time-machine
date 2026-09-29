import { Link, NavLink, useSearchParams } from "react-router-dom";
import { listBusinesses } from "../api";
import { useAsync } from "../hooks/useAsync";
import { readBusinessId, withBusiness } from "../lib/businessParam";

/** Numbered in the order an owner actually uses the app. */
const links = [
  { to: "/setup", label: "My business", step: 1 },
  { to: "/scenarios", label: "What-ifs", step: 2 },
  { to: "/compare", label: "Compare", step: 3 },
  { to: "/history", label: "Past results", step: 4 },
];

/** The top bar on every page. Every link keeps the "?business=" part of the address,
 * so picking a business once is enough -- it follows you from page to page. */
export function NavBar() {
  const [params] = useSearchParams();
  const businessId = readBusinessId(params);
  // Re-fetch whenever the business changes, so a brand-new business shows up by name.
  const businesses = useAsync(() => (businessId ? listBusinesses() : Promise.resolve([])), [businessId]);
  const business = businesses.data?.find((b) => b.id === businessId) ?? null;

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to={withBusiness("/scenarios", businessId)} className="wordmark" aria-label="Business Time Machine, home">
          <span className="wordmark-main">Time Machine</span>
          <span className="wordmark-sub">for your business</span>
        </Link>

        <nav aria-label="Main">
          <ol className="nav-steps">
            {links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to === "/setup" ? link.to : withBusiness(link.to, businessId)}
                  className={({ isActive }) => (isActive ? "nav-step active" : "nav-step")}
                >
                  <span className="nav-step-number" aria-hidden="true">
                    {link.step}
                  </span>
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ol>
        </nav>

        {business && (
          <p className="current-business" title="The business you are working on">
            <span className="visually-hidden">Working on: </span>
            {business.name}
          </p>
        )}
      </div>
    </header>
  );
}
