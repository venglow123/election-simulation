import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { SimulationsProvider } from "./context/SimulationsContext.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Home from "./components/Home.jsx";
import SimulationPage from "./components/SimulationPage.jsx";
import ImportFromLink from "./components/ImportFromLink.jsx";
import ElectionHome from "./components/ElectionHome.jsx";
import ElectionSettingsPage from "./components/ElectionSettingsPage.jsx";
import HypothesisPage from "./components/HypothesisPage.jsx";
import TransferHypothesisPage from "./components/TransferHypothesisPage.jsx";
import LegacySimulationRedirect from "./components/LegacySimulationRedirect.jsx";

export default function App() {
  return (
    <SimulationsProvider>
      {/* HashRouter : GitHub Pages ne sait pas rediriger les routes client vers index.html. */}
      <HashRouter>
        <div className="app-shell">
          <Sidebar />
          <div className="main-area">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/elections/:electionId" element={<ElectionHome />} />
              <Route path="/elections/:electionId/settings" element={<ElectionSettingsPage />} />
              <Route path="/elections/:electionId/hypotheses/:hypothesisId" element={<HypothesisPage />} />
              <Route path="/elections/:electionId/transfer-hypotheses/:hypothesisId" element={<TransferHypothesisPage />} />
              <Route path="/elections/:electionId/simulations/:simulationId" element={<SimulationPage />} />
              <Route path="/simulations/:id" element={<LegacySimulationRedirect />} />
              <Route path="/import" element={<ImportFromLink />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </HashRouter>
    </SimulationsProvider>
  );
}
