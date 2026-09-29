import { Link } from "react-router-dom";
import type { BusinessOut } from "../api";
import { ErrorBanner } from "./ErrorBanner";
import { Spinner } from "./Spinner";

interface Props {
  businesses: { data: BusinessOut[] | null; loading: boolean; error: string | null };
  businessId: number | null;
  onSelect: (id: number) => void;
}

/** The "which business?" dropdown. It used to be copy-pasted into three pages;
 * now all three use this one component, so a fix here fixes it everywhere. */
export function BusinessPicker({ businesses, businessId, onSelect }: Props) {
  if (businesses.loading) return <Spinner label="Loading businesses…" />;
  if (businesses.error) return <ErrorBanner message={businesses.error} />;
  const list = businesses.data ?? [];

  if (list.length === 0) {
    return (
      <div className="empty-state">
        <p>You haven't set up a business yet.</p>
        <Link to="/setup" className="button">
          Set up your business
        </Link>
      </div>
    );
  }

  return (
    <div className="field business-picker">
      <label htmlFor="business-select">Business</label>
      <select id="business-select" value={businessId ?? ""} onChange={(e) => onSelect(Number(e.target.value))}>
        <option value="" disabled>
          Choose a business…
        </option>
        {list.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}
