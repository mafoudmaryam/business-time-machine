import { Route, Routes, useLocation } from "react-router-dom";
import { AppNav } from "./components/AppNav";
import { BusinessSetupPage } from "./pages/BusinessSetup/BusinessSetupPage";
import { ComparisonDashboardPage } from "./pages/Comparison/ComparisonDashboardPage";
import { RunHistoryPage } from "./pages/RunHistory/RunHistoryPage";
import { ScenarioBuilderPage } from "./pages/ScenarioBuilder/ScenarioBuilderPage";
import { StartPage } from "./pages/Start/StartPage";
import { TodayPage } from "./pages/Today/TodayPage";

/** The front page. Every visit to it (the header title, "New business", a typed address) is a new location, so the
 * form starts over; without the key, being on the page already would leave a half-filled form in place. */
function FrontPage() {
  return <StartPage key={useLocation().key} />;
}

export function App() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to the page
      </a>
      <AppNav />
      <main id="main" tabIndex={-1}>
        <Routes>
          {/* The front page is always the start screen. Opening it changes nothing. */}
          <Route path="/" element={<FrontPage />} />
          <Route path="/start" element={<FrontPage />} />
          <Route path="/today" element={<TodayPage />} />
          {/* The earlier pages keep their addresses; they now live under "Advanced" (and "Try a change"). */}
          <Route path="/setup" element={<BusinessSetupPage />} />
          <Route path="/scenarios" element={<ScenarioBuilderPage />} />
          <Route path="/compare" element={<ComparisonDashboardPage />} />
          <Route path="/history" element={<RunHistoryPage />} />
        </Routes>
      </main>
    </>
  );
}
