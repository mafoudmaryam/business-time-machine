import type { ReactNode } from "react";
import { loadErrorWords } from "../lib/friendlyLoad";

interface Props {
  /** The raw message from the loader. It is only used to tell "cannot reach" from "went wrong", and is never shown. */
  message: string | null | undefined;
  /** A short phrase: "your scenarios". */
  what: string;
  onRetry: () => void;
  /** Another thing to offer next to "Try again". */
  extra?: ReactNode;
}

/** What to show when something failed to load: a calm message in plain words and a "Try again" button. */
export function LoadError({ message, what, onRetry, extra }: Props) {
  const words = loadErrorWords(message, what);
  return (
    <div className="load-error" role="alert">
      <h2 className="empty-title">{words.title}</h2>
      <p className="empty-text">{words.text}</p>
      <div className="empty-actions">
        <button type="button" onClick={onRetry}>
          Try again
        </button>
        {extra}
      </div>
    </div>
  );
}
