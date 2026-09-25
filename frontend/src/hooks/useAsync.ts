import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Runs an async loader on mount (and whenever `deps` change), exposing
 * loading/error/data state plus a `reload` function for post-action refreshes. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    loaderRef.current().then(
      (data) => setState({ data, loading: false, error: null }),
      (err) => setState({ data: null, loading: false, error: err instanceof ApiError ? err.message : String(err) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { ...state, reload: run };
}
