import { useEffect, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useSimulations } from "../context/SimulationsContext.jsx";
import Breadcrumbs from "./Breadcrumbs.jsx";
import EditableTable from "./EditableTable.jsx";
import TagChip from "./TagChip.jsx";
import { pickTagColor } from "../utils/tags.js";
import { summarizeTransferHypothesis } from "../utils/transferHypothesis.js";

function summarizeFirstRoundHypothesis(hypothesis) {
  const finalists = [...hypothesis.candidates]
    .sort((a, b) => Number(b.pct_r1) - Number(a.pct_r1))
    .slice(0, 2);
  return finalists.length === 2
    ? `${finalists[0].name} ${finalists[0].pct_r1}% · ${finalists[1].name} ${finalists[1].pct_r1}%`
    : "Moins de deux candidats";
}

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
  const [transferHypotheses, setTransferHypotheses] = useState([]);
  const [transferHypothesisError, setTransferHypothesisError] = useState("");
  const [tags, setTags] = useState([]);
  const [tagDraft, setTagDraft] = useState({ name: "", color: "" });
  const [tagError, setTagError] = useState("");

  useEffect(() => setName(election?.name || ""), [election]);

  useEffect(() => {
    let cancelled = false;
    api.listElectionTags(electionId).then((data) => {
      if (!cancelled) setTags(data);
    }).catch(() => {
      if (!cancelled) setTags([]);
    });
    return () => { cancelled = true; };
  }, [electionId]);

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

  useEffect(() => {
    let cancelled = false;
    api.listElectionTransferHypotheses(electionId).then((data) => {
      if (!cancelled) setTransferHypotheses(data);
    }).catch((error) => {
      if (!cancelled) setTransferHypothesisError(error.message);
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

  const draftTagColor = tagDraft.color || pickTagColor(tags.map((tag) => tag.color));

  async function addTag() {
    const tagName = tagDraft.name.trim();
    if (!tagName) return;
    setTagError("");
    try {
      await api.createElectionTag(election.id, { name: tagName, color: draftTagColor });
      setTags(await api.listElectionTags(election.id));
      setTagDraft({ name: "", color: "" });
    } catch (error) {
      setTagError(error.message);
    }
  }

  function handleTagFieldChange(tagId, field, value) {
    setTags((previous) => previous.map((tag) => (tag.id === tagId ? { ...tag, [field]: value } : tag)));
  }

  async function saveTag(tagId, payload) {
    setTagError("");
    try {
      setTags(await api.updateElectionTag(election.id, tagId, payload));
    } catch (error) {
      setTagError(error.message);
      setTags(await api.listElectionTags(election.id));
    }
  }

  async function handleDeleteTag(tag) {
    const message = tag.usage_count
      ? `Supprimer le tag « ${tag.name} » ? Il sera retiré de ${tag.usage_count} hypothèse${tag.usage_count > 1 ? "s" : ""}.`
      : `Supprimer le tag « ${tag.name} » ?`;
    if (!confirm(message)) return;
    setTags(await api.deleteElectionTag(election.id, tag.id));
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

  async function handleCreateTransferHypothesis() {
    setTransferHypothesisError("");
    try {
      const hypothesis = await api.createElectionTransferHypothesis(election.id);
      navigate(`/elections/${election.id}/transfer-hypotheses/${hypothesis.id}`, { state: { focusTitle: true } });
    } catch (error) {
      setTransferHypothesisError(error.message);
    }
  }

  async function handleDeleteTransferHypothesis(hypothesis) {
    if (!confirm(`Supprimer l'hypothèse de report « ${hypothesis.name} » ?`)) return;
    setTransferHypothesisError("");
    try {
      await api.deleteElectionTransferHypothesis(election.id, hypothesis.id);
      setTransferHypotheses((current) => current.filter((item) => item.id !== hypothesis.id));
    } catch (error) {
      setTransferHypothesisError(error.message);
    }
  }

  function renderHypothesisList(items, pathSegment, summarize, onDelete) {
    return (
      <ul className="hypothesis-settings-list">
        {items.map((hypothesis) => {
          const summary = summarize(hypothesis);
          return (
            <li key={hypothesis.id} className="hypothesis-settings-row">
              <NavLink
                className="hypothesis-settings-link"
                to={`/elections/${election.id}/${pathSegment}/${hypothesis.id}`}
                aria-label={`Modifier l'hypothèse ${hypothesis.name}`}
              >
                <span className="hypothesis-settings-main">
                  <span className="hypothesis-settings-name">{hypothesis.name}</span>
                  {hypothesis.tag_ids.length > 0 && (
                    <span className="tag-list">
                    {hypothesis.tag_ids
                      .map((id) => tags.find((tag) => tag.id === id))
                      .filter(Boolean)
                      .map((tag) => <TagChip key={tag.id} tag={tag} />)}
                    </span>
                  )}
                </span>
                <span className="hypothesis-settings-summary" title={summary}>{summary}</span>
              </NavLink>
              <button
                type="button"
                className="danger row-delete hypothesis-delete"
                title={`Supprimer ${hypothesis.name}`}
                aria-label={`Supprimer l'hypothèse ${hypothesis.name}`}
                onClick={() => onDelete(hypothesis)}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    );
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
        <h2>Tags des hypothèses</h2>
        <p className="hint">Ces tags peuvent être associés aux hypothèses pour les retrouver et les filtrer rapidement.</p>
        <EditableTable
          columns={[
            {
              key: "color",
              label: "Couleur",
              cellClassName: "tag-color-cell",
              render: (tag) => (
                <input type="color" className="tag-color-input" value={tag.color} aria-label={`Couleur du tag ${tag.name}`}
                  onChange={(event) => saveTag(tag.id, { color: event.target.value })} />
              ),
            },
            {
              key: "name",
              label: "Nom",
              render: (tag) => (
                <input type="text" value={tag.name} aria-label={`Nom du tag ${tag.name}`}
                  className="grid-input"
                  onChange={(event) => handleTagFieldChange(tag.id, "name", event.target.value)}
                  onBlur={() => saveTag(tag.id, { name: tag.name })} />
              ),
            },
            { key: "preview", label: "Aperçu", render: (tag) => <TagChip tag={tag} /> },
            { key: "usage", label: "Usages", render: (tag) => tag.usage_count },
            {
              key: "actions",
              label: "",
              render: (tag) => (
                <button type="button" className="danger row-delete" title="Supprimer" onClick={() => handleDeleteTag(tag)}>✕</button>
              ),
            },
          ]}
          rows={tags}
          getRowKey={(tag) => tag.id}
          renderDraftCell={(column) => {
            if (column.key === "color") return (
              <input type="color" className="tag-color-input" value={draftTagColor} aria-label="Couleur du nouveau tag"
                onChange={(event) => setTagDraft((current) => ({ ...current, color: event.target.value }))} />
            );
            if (column.key === "name") return (
              <input className="grid-input" value={tagDraft.name} placeholder="Nom du tag" aria-label="Nom du nouveau tag"
                onChange={(event) => setTagDraft((current) => ({ ...current, name: event.target.value }))} />
            );
            if (column.key === "actions") return <button type="button" onClick={addTag}>Ajouter</button>;
            return null;
          }}
          onEnterLastRow={addTag}
        />
        {tagError && <p className="form-error">{tagError}</p>}
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
        ) : renderHypothesisList(hypotheses, "hypotheses", summarizeFirstRoundHypothesis, handleDeleteHypothesis)}
      </section>
      <section className="panel election-settings-panel">
        <div className="panel-heading-row">
          <h2>Hypothèses de reports de voix</h2>
          <button type="button" className="btn-ghost" onClick={handleCreateTransferHypothesis}>
            + Nouvelle hypothèse
          </button>
        </div>
        <p className="hint">
          Chaque hypothèse s'applique à un duel de second tour et préremplit les reports des scénarios correspondants.
        </p>
        {transferHypothesisError && <p className="form-error">{transferHypothesisError}</p>}
        {transferHypotheses.length === 0 ? (
          <p className="hint">Aucune hypothèse de report enregistrée pour cette élection.</p>
        ) : renderHypothesisList(transferHypotheses, "transfer-hypotheses", summarizeTransferHypothesis, handleDeleteTransferHypothesis)}
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
