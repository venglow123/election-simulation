import { useEffect, useState } from "react";
import { NavLink, useMatch, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useSimulations } from "../context/SimulationsContext.jsx";
import ImportScenarioModal from "./ImportScenarioModal.jsx";
import SidebarSection from "./SidebarSection.jsx";
import WorkspaceSelector from "./WorkspaceSelector.jsx";

export default function Sidebar() {
  const { simulations, refresh, selectElection } = useSimulations();
  const electionWildcardMatch = useMatch("/elections/:electionId/*");
  const electionExactMatch = useMatch("/elections/:electionId");
  const electionMatch = electionWildcardMatch || electionExactMatch;
  const simulationMatch = useMatch("/elections/:electionId/simulations/:simulationId");
  const electionId = Number(electionMatch?.params.electionId) || null;
  const simulationId = simulationMatch?.params.simulationId;
  const navigate = useNavigate();
  const [draggedId, setDraggedId] = useState(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  useEffect(() => {
    if (electionId) selectElection(electionId).catch(() => navigate("/", { replace: true }));
  }, [electionId, selectElection, navigate]);

  async function handleCreate() {
    if (!electionId) return;
    const sim = await api.createSimulation(electionId, "Nouveau scénario");
    await refresh();
    navigate(`/elections/${electionId}/simulations/${sim.id}`, { state: { focusTitle: true } });
  }

  async function handleDelete(simId, name) {
    if (!confirm(`Supprimer « ${name} » ?`)) return;
    await api.deleteSimulation(simId);
    await refresh();
    if (String(simId) === simulationId) navigate(`/elections/${electionId}`);
  }

  async function handleDrop(targetId) {
    if (draggedId == null || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const order = simulations.map((s) => s.id);
    const fromIndex = order.indexOf(draggedId);
    const toIndex = order.indexOf(targetId);
    order.splice(fromIndex, 1);
    order.splice(toIndex, 0, draggedId);
    setDraggedId(null);
    await api.reorderSimulations(electionId, order);
    await refresh();
  }

  return (
    <aside className="sidebar">
      <WorkspaceSelector selectedElectionId={electionId} />

      <SidebarSection
        title="Scénarios"
        items={simulations}
        getItemKey={(sim) => sim.id}
        emptyMessage="Aucun scénario pour l'instant."
        listClassName="sim-tabs"
        emptyClassName="sim-tabs-empty"
        actions={
          <>
            <button
              type="button"
              className="sidebar-icon-button"
              data-tooltip="Nouveau scénario"
              aria-label="Nouveau scénario"
              onClick={handleCreate}
              disabled={!electionId}
            >
              +
            </button>
            <button
              type="button"
              className="sidebar-icon-button"
              data-tooltip="Importer un scénario"
              aria-label="Importer un scénario"
              onClick={() => setIsImportOpen(true)}
              disabled={!electionId}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
              </svg>
            </button>
          </>
        }
        renderItem={(sim) => (
          <div
            className={`sim-tab ${String(sim.id) === simulationId ? "active" : ""} ${
              draggedId === sim.id ? "dragging" : ""
            }`}
            draggable
            onDragStart={() => setDraggedId(sim.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(sim.id)}
          >
            <span className="sim-tab-handle" title="Glisser pour réordonner">
              ⠿
            </span>
            <NavLink to={`/elections/${electionId}/simulations/${sim.id}`} className="sim-tab-link">
              <span className="sim-tab-name">{sim.name}</span>
              <span className="sim-tab-meta" title={`${sim.candidates_count} candidat${sim.candidates_count !== 1 ? "s" : ""}`}>
                {sim.candidates_count}
              </span>
            </NavLink>
            <div className="sim-tab-delete">
              <button type="button" onClick={() => handleDelete(sim.id, sim.name)} title="Supprimer">
                ✕
              </button>
            </div>
          </div>
        )}
      />
      {isImportOpen && (
        <ImportScenarioModal
          electionId={electionId}
          onClose={() => setIsImportOpen(false)}
          onImported={async (simulation) => {
            await refresh();
            setIsImportOpen(false);
            navigate(`/elections/${electionId}/simulations/${simulation.id}`, { state: { focusTitle: true } });
          }}
        />
      )}
    </aside>
  );
}
