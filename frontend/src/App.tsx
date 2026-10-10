import { Route, Routes, useLocation } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { GuidePage } from "./pages/Guide/GuidePage";
import { PlanPage } from "./pages/Guide/PlanPage";
import { HowPage } from "./pages/How/HowPage";
import { JournalPage } from "./pages/Journal/JournalPage";
import { BusinessSetupPage } from "./pages/BusinessSetup/BusinessSetupPage";
import { ComparisonDashboardPage } from "./pages/Comparison/ComparisonDashboardPage";
import { RunHistoryPage } from "./pages/RunHistory/RunHistoryPage";
import { ScenarioBuilderPage } from "./pages/ScenarioBuilder/ScenarioBuilderPage";
import { SharePage } from "./pages/Share/SharePage";
import { StartPage } from "./pages/Start/StartPage";
import { TimelinePage } from "./pages/Timeline/TimelinePage";
import { TodayPage } from "./pages/Today/TodayPage";
import { TryPage } from "./pages/Try/TryPage";

/** The front page. Every visit to it (the header title, "New business", a typed address) is a new location, so the
 * form starts over; without the key, being on the page already would leave a half-filled form in place. */
function FrontPage() {
  return <StartPage key={useLocation().key} />;
}

/** Every page renders inside AppLayout, which adds the top bar and the "← Back" button. A new page only needs a Route here. */
export function App() {
  return (
    <AppLayout>
      <Routes>
        {/* The front page is always the start screen. Opening it changes nothing. */}
        <Route path="/" element={<FrontPage />} />
        <Route path="/start" element={<FrontPage />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/try" element={<TryPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/how" element={<HowPage />} />
        <Route path="/journal" element={<JournalPage />} />
        <Route path="/share" element={<SharePage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/guide/plan/:id" element={<PlanPage />} />
        {/* The earlier pages keep their addresses; they now live under "Advanced". */}
        <Route path="/setup" element={<BusinessSetupPage />} />
        <Route path="/scenarios" element={<ScenarioBuilderPage />} />
        <Route path="/compare" element={<ComparisonDashboardPage />} />
        <Route path="/history" element={<RunHistoryPage />} />
      </Routes>
    </AppLayout>
  );
}
