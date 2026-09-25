import { NavLink } from "react-router-dom";

const links = [
  { to: "/setup", label: "New business" },
  { to: "/scenarios", label: "Scenario builder" },
  { to: "/compare", label: "Compare" },
  { to: "/history", label: "Run history" },
];

export function NavBar() {
  return (
    <nav className="navbar">
      <span className="navbar-title">Business Time Machine</span>
      <div className="navbar-links">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? "active" : "")}>
            {link.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
