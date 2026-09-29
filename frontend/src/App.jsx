import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { SimulationsProvider } from "./context/SimulationsContext.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Home from "./components/Home.jsx";
import SimulationPage from "./components/SimulationPage.jsx";
import ImportFromLink from "./components/ImportFromLink.jsx";

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
              <Route path="/simulations/:id" element={<SimulationPage />} />
              <Route path="/import" element={<ImportFromLink />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </HashRouter>
    </SimulationsProvider>
  );
}
