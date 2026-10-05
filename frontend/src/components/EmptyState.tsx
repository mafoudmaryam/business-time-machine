import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface EmptyAction {
  label: string;
  /** Goes to this page... */
  to?: string;
  /** ...or does this. */
  onClick?: () => void;
}

interface Props {
  title: string;
  children?: ReactNode;
  /** The ONE clear next step. */
  action?: EmptyAction;
  /** A quieter second option. */
  secondary?: EmptyAction;
  /** Smaller, for a spot inside a page rather than a whole page. */
  compact?: boolean;
}

function Action({ action, quiet }: { action: EmptyAction; quiet?: boolean }) {
  const className = quiet ? "empty-action empty-action-quiet" : "empty-action";
  if (action.to) {
    return (
      <Link className={className} to={action.to}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" className={quiet ? "secondary" : undefined} onClick={action.onClick}>
      {action.label}
    </button>
  );
}

/** A friendly "nothing here yet" box: what is missing, in plain words, and one clear thing to do next. */
export function EmptyState({ title, children, action, secondary, compact = false }: Props) {
  return (
    <section className={compact ? "empty-state empty-state-compact" : "empty-state"} aria-label={title}>
      <h2 className="empty-title">{title}</h2>
      {children && <div className="empty-text">{children}</div>}
      {(action || secondary) && (
        <div className="empty-actions">
          {action && <Action action={action} />}
          {secondary && <Action action={secondary} quiet />}
        </div>
      )}
    </section>
  );
}
