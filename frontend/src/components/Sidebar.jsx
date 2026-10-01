import { useEffect, useState } from "react";
import { NavLink, useMatch, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useSimulations } from "../context/SimulationsContext.jsx";
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
      <footer className="sidebar-version" aria-label={`Version ${__APP_VERSION__}`}>
        v{__APP_VERSION__.replace(/^v/, "")}
      </footer>
    </aside>
  );
}
