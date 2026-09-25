import { Navigate, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { BusinessSetupPage } from "./pages/BusinessSetup/BusinessSetupPage";
import { ComparisonDashboardPage } from "./pages/Comparison/ComparisonDashboardPage";
import { RunHistoryPage } from "./pages/RunHistory/RunHistoryPage";
import { ScenarioBuilderPage } from "./pages/ScenarioBuilder/ScenarioBuilderPage";

export function App() {
  return (
    <>
      <NavBar />
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/setup" replace />} />
          <Route path="/setup" element={<BusinessSetupPage />} />
          <Route path="/scenarios" element={<ScenarioBuilderPage />} />
          <Route path="/compare" element={<ComparisonDashboardPage />} />
          <Route path="/history" element={<RunHistoryPage />} />
        </Routes>
      </main>
    </>
  );
}
