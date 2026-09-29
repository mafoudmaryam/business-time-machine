import { NavLink, useNavigate, useSearchParams } from "react-router-dom";

/** A quiet top bar: the name, and two ways out of the current conversation. */
export function Header() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const business = params.get("business");
  const withBusiness = (path: string) => (business ? `${path}?business=${business}` : path);

  // A new `fresh` value tells the app to start a brand-new conversation (see App.tsx).
  function newConversation(e: React.MouseEvent) {
    e.preventDefault();
    navigate(withBusiness("/"), { state: { fresh: Date.now() } });
  }

  return (
    <header className="topbar">
      <a href={withBusiness("/")} onClick={newConversation} className="wordmark">
        Time Machine
      </a>
      <nav aria-label="Main" className="topbar-links">
        <NavLink to={withBusiness("/history")}>Past decisions</NavLink>
        <a href={withBusiness("/")} onClick={newConversation}>
          New conversation
        </a>
      </nav>
    </header>
  );
}
