import { useLocation, useNavigate } from "react-router-dom";
import { parentPath } from "../lib/backTarget";

/** "← Back": the page you were just on, or, if there is none inside the app, the page one level up.
 *
 *  With an earlier in-app page it goes back in the browser's history (`navigate(-1)`), so it behaves exactly like the browser's
 *  own Back button. With none (opened by link, or refreshed) it goes to the parent page and REPLACES the current entry:
 *  pushing the parent would put it "after" the page you are leaving, so pressing Back twice would bounce between the two. */
export function BackButton({ canGoBack }: { canGoBack: boolean }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function goBack() {
    if (canGoBack) navigate(-1);
    else navigate(parentPath(pathname), { replace: true });
  }

  return (
    <button type="button" className="back-button" aria-label="Go back" onClick={goBack}>
      <svg className="back-arrow" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20 12H5m0 0 6-6m-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span aria-hidden="true">Back</span>
    </button>
  );
}
