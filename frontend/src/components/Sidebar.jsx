import { useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useSimulations } from "../context/SimulationsContext.jsx";
import ImportScenarioModal from "./ImportScenarioModal.jsx";

export default function Sidebar() {
  const { simulations, refresh } = useSimulations();
  const { id } = useParams();
  const navigate = useNavigate();
  const [newName, setNewName] = useState("");
  const [draggedId, setDraggedId] = useState(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const sim = await api.createSimulation(name);
    setNewName("");
    await refresh();
    navigate(`/simulations/${sim.id}`);
  }

  async function handleDelete(simId, name) {
    if (!confirm(`Supprimer « ${name} » ?`)) return;
    await api.deleteSimulation(simId);
    await refresh();
    if (String(simId) === id) navigate("/");
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
    await api.reorderSimulations(order);
    await refresh();
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-icon">🗳️</span>
        <div>
          <div className="sidebar-brand-name">Simulateur d'élections</div>
          <div className="sidebar-brand-tag">Scrutin uninominal à 2 tours</div>
        </div>
      </div>

      <form className="sidebar-new-form" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder="Nouveau scénario…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" title="Créer un scénario">
          +
        </button>
      </form>

      <button type="button" className="sidebar-import-button" onClick={() => setIsImportOpen(true)}>
        ↓ Importer un scénario
      </button>

      <nav className="sim-tabs">
        {simulations.length === 0 && <p className="sim-tabs-empty">Aucun scénario pour l'instant.</p>}
        {simulations.map((sim) => (
          <div
            key={sim.id}
            className={`sim-tab ${String(sim.id) === id ? "active" : ""} ${
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
            <NavLink to={`/simulations/${sim.id}`} className="sim-tab-link">
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
          onClose={() => setIsImportOpen(false)}
          onImported={async (simulation) => {
            await refresh();
            setIsImportOpen(false);
            navigate(`/simulations/${simulation.id}`);
          }}
        />
      )}
    </aside>
  );
}
