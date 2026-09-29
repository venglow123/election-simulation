import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useSimulations } from "../context/SimulationsContext.jsx";

export default function WorkspaceSelector({ selectedElectionId }) {
  const navigate = useNavigate();
  const { elections, refreshElections } = useSimulations();
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");

  async function handleCreate(event) {
    event.preventDefault();
    const election = await api.createElection(name.trim());
    await refreshElections();
    setName("");
    setIsCreating(false);
    navigate(`/elections/${election.id}`);
  }

  return (
    <div className="workspace-selector">
      <div className="workspace-selector-label">Élection active</div>
      <div className="workspace-selector-controls">
        <select
          aria-label="Élection active"
          value={selectedElectionId || ""}
          onChange={(event) => navigate(`/elections/${event.target.value}`)}
        >
          <option value="" disabled>Choisir une élection</option>
          {elections.map((election) => <option key={election.id} value={election.id}>{election.name}</option>)}
        </select>
        <button type="button" className="workspace-icon-button" title="Créer une élection" onClick={() => setIsCreating(true)}>+</button>
        <button
          type="button"
          className="workspace-icon-button"
          title="Configurer l'élection"
          disabled={!selectedElectionId}
          onClick={() => navigate(`/elections/${selectedElectionId}/settings`)}
        >
          ⚙
        </button>
      </div>
      {isCreating && (
        <form className="workspace-create-form" onSubmit={handleCreate}>
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom de l'élection" />
          <button type="submit">Créer</button>
          <button type="button" className="btn-ghost" onClick={() => setIsCreating(false)}>Annuler</button>
        </form>
      )}
    </div>
  );
}