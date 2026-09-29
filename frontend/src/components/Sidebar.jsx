import { useEffect, useState } from "react";
import { NavLink, useMatch, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useSimulations } from "../context/SimulationsContext.jsx";
import ImportScenarioModal from "./ImportScenarioModal.jsx";
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
  const [newName, setNewName] = useState("");
  const [draggedId, setDraggedId] = useState(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  useEffect(() => {
    if (electionId) selectElection(electionId).catch(() => navigate("/", { replace: true }));
  }, [electionId, selectElection, navigate]);

  async function handleCreate(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !electionId) return;
    const sim = await api.createSimulation(electionId, name);
    setNewName("");
    await refresh();
    navigate(`/elections/${electionId}/simulations/${sim.id}`);
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

      <form className="sidebar-new-form" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder="Nouveau scénario…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          disabled={!electionId}
        />
        <button type="submit" title="Créer un scénario" disabled={!electionId}>
          +
        </button>
      </form>

      <button type="button" className="sidebar-import-button" onClick={() => setIsImportOpen(true)} disabled={!electionId}>
        ↓ Importer un scénario
      </button>

      <nav className="sim-tabs">
        {simulations.length === 0 && <p className="sim-tabs-empty">Aucun scénario pour l'instant.</p>}
        {simulations.map((sim) => (
          <div
            key={sim.id}
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
              <span className="sim-tab-meta">
                {sim.candidates_count} candidat{sim.candidates_count !== 1 ? "s" : ""}
              </span>
            </NavLink>
            <div className="sim-tab-delete">
              <button type="button" onClick={() => handleDelete(sim.id, sim.name)} title="Supprimer">
                ✕
              </button>
            </div>
          </div>
        ))}
      </nav>
      {isImportOpen && (
        <ImportScenarioModal
          electionId={electionId}
          onClose={() => setIsImportOpen(false)}
          onImported={async (simulation) => {
            await refresh();
            setIsImportOpen(false);
            navigate(`/elections/${electionId}/simulations/${simulation.id}`);
          }}
        />
      )}
    </aside>
  );
}
