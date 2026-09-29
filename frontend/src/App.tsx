import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AdvisorPage } from "./advisor/AdvisorPage";
import { PastDecisionsPage } from "./advisor/PastDecisionsPage";
import { Header } from "./components/Header";

export function App() {
  const location = useLocation();
  // "New conversation" and "Past decisions → open" pass a new `fresh` value, which gives the
  // advisor a new key, so React starts a brand-new conversation.
  const fresh = (location.state as { fresh?: number } | null)?.fresh ?? 0;

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Routes>
          <Route path="/" element={<AdvisorPage key={fresh} />} />
          <Route path="/history" element={<PastDecisionsPage />} />
          {/* Old addresses from before the advisor still work. */}
          <Route path="*" element={<Navigate to={`/${location.search}`} replace />} />
        </Routes>
      </main>
    </>
  );
}
