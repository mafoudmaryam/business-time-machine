import { Navigate, Route, Routes } from "react-router-dom";
import { AppNav } from "./components/AppNav";
import { getRememberedBusinessId } from "./lib/session";
import { BusinessSetupPage } from "./pages/BusinessSetup/BusinessSetupPage";
import { ComparisonDashboardPage } from "./pages/Comparison/ComparisonDashboardPage";
import { RunHistoryPage } from "./pages/RunHistory/RunHistoryPage";
import { ScenarioBuilderPage } from "./pages/ScenarioBuilder/ScenarioBuilderPage";
import { StartPage } from "./pages/Start/StartPage";
import { TodayPage } from "./pages/Today/TodayPage";

function Home() {
  return <Navigate to={getRememberedBusinessId() ? "/today" : "/start"} replace />;
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
          <Route path="/" element={<Home />} />
          <Route path="/start" element={<StartPage />} />
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
