import { useEffect, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useSimulations } from "../context/SimulationsContext.jsx";
import Breadcrumbs from "./Breadcrumbs.jsx";
import EditableTable from "./EditableTable.jsx";

export default function ElectionSettingsPage() {
  const { electionId } = useParams();
  const navigate = useNavigate();
  const { elections, refreshElections } = useSimulations();
  const election = elections.find((item) => item.id === Number(electionId));
  const [name, setName] = useState("");
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [hypotheses, setHypotheses] = useState([]);
  const [draft, setDraft] = useState({ name: "", party: "" });
  const [candidateError, setCandidateError] = useState("");
  const [hypothesisError, setHypothesisError] = useState("");

  useEffect(() => setName(election?.name || ""), [election]);

  useEffect(() => {
    let cancelled = false;
    api.listElectionCandidates(electionId).then((data) => {
      if (!cancelled) setCandidates(data);
    }).catch(() => {
      if (!cancelled) setCandidates([]);
    });
    return () => { cancelled = true; };
  }, [electionId]);

  useEffect(() => {
    let cancelled = false;
    api.listElectionHypotheses(electionId).then((data) => {
      if (!cancelled) setHypotheses(data);
    }).catch((error) => {
      if (!cancelled) setHypothesisError(error.message);
    });
    return () => { cancelled = true; };
  }, [electionId]);

  if (!election) return null;

  async function handleRename(event) {
    event.preventDefault();
    try {
      const updated = await api.updateElection(election.id, { name });
      setName(updated.name);
      await refreshElections();
    } catch (error) {
      setCandidateError(error.message);
    }
  }

  async function addCandidate() {
    const candidateName = draft.name.trim();
    if (!candidateName) return;
    setCandidateError("");
    try {
      setCandidates(await api.createElectionCandidate(election.id, { name: candidateName, party: draft.party.trim() }));
      setDraft({ name: "", party: "" });
    } catch {
      setCandidateError(`« ${candidateName} » existe déjà dans cette élection.`);
    }
  }

  function handleCandidateFieldChange(candidateId, field, value) {
    setCandidates((previous) => previous.map((candidate) => (
      candidate.id === candidateId ? { ...candidate, [field]: value } : candidate
    )));
  }

  async function handleCandidateBlur(candidate, field) {
    const value = String(candidate[field] || "").trim();
    if (field === "name" && !value) {
      setCandidates(await api.listElectionCandidates(election.id));
      return;
    }
    setCandidateError("");
    try {
      setCandidates(await api.updateElectionCandidate(election.id, candidate.id, { [field]: value }));
    } catch {
      setCandidateError("Ce nom est déjà utilisé par un autre candidat de l'élection.");
      setCandidates(await api.listElectionCandidates(election.id));
    }
  }

  async function handleDeleteCandidate(candidate) {
    const message = candidate.usage_count
      ? `Retirer « ${candidate.name} » du référentiel ? Il est utilisé dans ${candidate.usage_count} scénario${candidate.usage_count > 1 ? "s" : ""} ou hypothèse, dont les données seront conservées.`
      : `Supprimer « ${candidate.name} » ?`;
    if (!confirm(message)) return;
    setCandidates(await api.deleteElectionCandidate(election.id, candidate.id));
  }

  async function handleCreateHypothesis() {
    setHypothesisError("");
    try {
      const hypothesis = await api.createElectionHypothesis(election.id);
      navigate(`/elections/${election.id}/hypotheses/${hypothesis.id}`, { state: { focusTitle: true } });
    } catch (error) {
      setHypothesisError(error.message);
    }
  }

  async function handleDeleteHypothesis(hypothesis) {
    if (!confirm(`Supprimer l'hypothèse « ${hypothesis.name} » ?`)) return;
    setHypothesisError("");
    try {
      await api.deleteElectionHypothesis(election.id, hypothesis.id);
      setHypotheses((current) => current.filter((item) => item.id !== hypothesis.id));
    } catch (error) {
      setHypothesisError(error.message);
    }
  }

  async function handleDelete() {
    await api.deleteElection(election.id);
    const remaining = await refreshElections();
    navigate(remaining[0] ? `/elections/${remaining[0].id}` : "/", { replace: true });
  }

  return (
    <div className="election-settings-page">
      <header className="election-settings-header">
        <Breadcrumbs
          items={[
            { label: election.name, to: `/elections/${election.id}` },
            { label: "Paramètres" },
          ]}
        />
        <h1>Paramètres de l'élection</h1>
      </header>
      <section className="panel election-settings-panel">
        <h2>Nom de l'élection</h2>
        <form className="election-name-form" onSubmit={handleRename}>
          <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Nom de l'élection" />
          <button type="submit">Enregistrer</button>
        </form>
      </section>
      <section className="panel election-settings-panel">
        <h2>Candidats de l'élection</h2>
        <p className="hint">Ces candidats sont proposés en autocomplétion dans tous les scénarios de l'élection.</p>
        <EditableTable
          columns={[
            {
              key: "name",
              label: "Nom",
              render: (candidate) => (
                  <input type="text" value={candidate.name} aria-label={`Nom de ${candidate.name}`}
                    className="grid-input"
                    onChange={(event) => handleCandidateFieldChange(candidate.id, "name", event.target.value)}
                    onBlur={() => handleCandidateBlur(candidate, "name")} />
              ),
            },
            {
              key: "party",
              label: "Parti",
              render: (candidate) => (
                  <input type="text" value={candidate.party} placeholder="—" aria-label={`Parti de ${candidate.name}`}
                    className="grid-input"
                    onChange={(event) => handleCandidateFieldChange(candidate.id, "party", event.target.value)}
                    onBlur={() => handleCandidateBlur(candidate, "party")} />
              ),
            },
            { key: "usage", label: "Usages", render: (candidate) => candidate.usage_count },
            {
              key: "actions",
              label: "",
              render: (candidate) => (
                <button type="button" className="danger row-delete" title="Supprimer" onClick={() => handleDeleteCandidate(candidate)}>✕</button>
              ),
            },
          ]}
          rows={candidates}
          getRowKey={(candidate) => candidate.id}
          renderDraftCell={(column) => {
            if (column.key === "name") return (
              <input className="grid-input" value={draft.name} placeholder="Nom du candidat" aria-label="Nom du nouveau candidat"
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            );
            if (column.key === "party") return (
              <input className="grid-input" value={draft.party} placeholder="Parti" aria-label="Parti du nouveau candidat"
                onChange={(event) => setDraft((current) => ({ ...current, party: event.target.value }))} />
            );
            if (column.key === "actions") return <button type="button" onClick={addCandidate}>Ajouter</button>;
            return null;
          }}
          onEnterLastRow={addCandidate}
        />
        {candidateError && <p className="form-error">{candidateError}</p>}
      </section>
      <section className="panel election-settings-panel">
        <div className="panel-heading-row">
          <h2>Hypothèses premier tour</h2>
          <button type="button" className="btn-ghost" onClick={handleCreateHypothesis}>
            + Nouvelle hypothèse
          </button>
        </div>
        {hypothesisError && <p className="form-error">{hypothesisError}</p>}
        {hypotheses.length === 0 ? (
          <p className="hint">Aucune hypothèse enregistrée pour cette élection.</p>
        ) : (
          <ul className="hypothesis-list">
            {hypotheses.map((hypothesis) => {
              const finalists = [...hypothesis.candidates]
                .sort((a, b) => Number(b.pct_r1) - Number(a.pct_r1))
                .slice(0, 2);
              return (
                <li key={hypothesis.id} className="hypothesis-list-item">
                  <div className="hypothesis-list-content">
                    <NavLink
                      className="hypothesis-list-link"
                      to={`/elections/${election.id}/hypotheses/${hypothesis.id}`}
                    >
                      {hypothesis.name}
                    </NavLink>
                    <p className="hypothesis-finalists">
                      {finalists.length === 2
                        ? `En tête : ${finalists[0].name} (${finalists[0].pct_r1}%) · ${finalists[1].name} (${finalists[1].pct_r1}%)`
                        : "Ajoutez au moins deux candidats pour voir les deux premiers."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="danger row-delete hypothesis-delete"
                    title={`Supprimer ${hypothesis.name}`}
                    aria-label={`Supprimer l'hypothèse ${hypothesis.name}`}
                    onClick={() => handleDeleteHypothesis(hypothesis)}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="panel election-danger-zone">
        <div>
          <h2>Zone de suppression</h2>
          <p>Cette action supprimera définitivement l'élection et ses {election.scenarios_count} scénario{election.scenarios_count !== 1 ? "s" : ""}.</p>
        </div>
        <button type="button" className="danger" onClick={() => setConfirmingDeletion(true)}>Supprimer cette élection</button>
      </section>
      {confirmingDeletion && (
        <div className="detail-overlay" role="presentation" onMouseDown={() => setConfirmingDeletion(false)}>
          <section className="election-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-election-title" onMouseDown={(event) => event.stopPropagation()}>
            <p className="detail-eyebrow">Action irréversible</p>
            <h2 id="delete-election-title">Supprimer « {election.name} » ?</h2>
            <p>Les {election.scenarios_count} scénario{election.scenarios_count !== 1 ? "s" : ""} et toutes leurs données seront définitivement supprimés.</p>
            <div className="election-delete-actions">
              <button type="button" className="btn-ghost" onClick={() => setConfirmingDeletion(false)}>Annuler</button>
              <button type="button" className="danger-fill" onClick={handleDelete}>Supprimer définitivement</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
