import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

interface State {
  failed: boolean;
}

/** The last safety net: if a page breaks while it is drawn, the person sees a calm message with two ways out,
 *  never a blank screen. The layout gives it a new `key` for each page, so moving to another page clears it. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("A page failed to draw", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="load-error" role="alert">
        <h2 className="empty-title">Something went wrong on this page</h2>
        <p className="empty-text">It's not your fault, and nothing you saved is lost. Reloading usually fixes it.</p>
        <div className="empty-actions">
          <button type="button" onClick={() => window.location.reload()}>
            Reload the page
          </button>
          <Link className="empty-action empty-action-quiet" to="/">
            Go to the start screen
          </Link>
        </div>
      </div>
    );
  }
}
