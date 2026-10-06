import { useState } from "react";
import Candidate from "./Candidate.jsx";
import CandidateAutocomplete from "./CandidateAutocomplete.jsx";
import EditableTable from "./EditableTable.jsx";
import { normalizeCandidateName } from "../utils/candidateNames.js";

export default function CandidatesTable({
  simulation,
  candidateOptions = [],
  onFieldChange,
  onCreate,
  onDelete,
  title = "Résultats du 1er tour",
  showVotes = true,
  headerActions,
  headerTags,
  baselineCandidates,
}) {
  const [draft, setDraft] = useState({ name: "", pct_r1: "" });
  const [duplicateName, setDuplicateName] = useState(false);
  const [duplicateAttempt, setDuplicateAttempt] = useState(0);
  const [draftError, setDraftError] = useState("");

  function showDuplicateFeedback() {
    setDuplicateName(true);
    setDuplicateAttempt((attempt) => attempt + 1);
  }

  async function submitDraft(candidateName = draft.name) {
    const name = String(candidateName).trim();
    if (!name) return;
    const normalizedName = normalizeCandidateName(name);
    if (simulation.candidates.some((candidate) => normalizeCandidateName(candidate.name) === normalizedName)) {
      showDuplicateFeedback();
      return;
    }
    try {
      await onCreate({ name, pct_r1: draft.pct_r1 || 0 });
      setDraft({ name: "", pct_r1: "" });
      setDuplicateName(false);
      setDraftError("");
    } catch (error) {
      const duplicate = /existe déjà|déjà présent/i.test(error.message);
      if (duplicate) showDuplicateFeedback();
      else setDraftError(error.message);
    }
  }

  const totalPct = simulation.candidates.reduce(
    (sum, c) => sum + (parseFloat(String(c.pct_r1).replace(",", ".")) || 0),
    0
  );
  const baselineById = new Map((baselineCandidates || []).map((candidate) => [candidate.id, candidate]));

  function getBaseline(candidate) {
    if (simulation.r1_hypothesis_id == null || !Array.isArray(baselineCandidates)) return null;
    return candidate.hypothesis_candidate_id == null
      ? null
      : baselineById.get(candidate.hypothesis_candidate_id) || null;
  }

  function isDifferent(candidate, field) {
    if (simulation.r1_hypothesis_id == null || !Array.isArray(baselineCandidates)) return false;
    const baseline = getBaseline(candidate);
    return !baseline || candidate[field] !== baseline[field];
  }

  const columns = [
    {
      key: "candidate",
      label: "Candidat",
      render: (candidate) => (
        <Candidate name={candidate.name}>
          <CandidateAutocomplete
            value={candidate.name}
            options={candidateOptions}
            excludeNames={simulation.candidates
              .filter((item) => item.id !== candidate.id)
              .map((item) => item.name)}
            ariaLabel="Nom du candidat"
            className={isDifferent(candidate, "name") ? "assumption-diff" : ""}
            title={isDifferent(candidate, "name") ? `Valeur de l'hypothèse : ${getBaseline(candidate)?.name || "candidat personnalisé"}` : undefined}
            onChange={(name) => onFieldChange(candidate.id, "name", name)}
          />
        </Candidate>
      ),
    },
    {
      key: "pct_r1",
      label: "% 1er tour",
      render: (candidate) => (
        <input
          type="text"
          inputMode="decimal"
          className={`grid-input ${isDifferent(candidate, "pct_r1") ? "assumption-diff" : ""}`}
          title={isDifferent(candidate, "pct_r1") ? `Valeur de l'hypothèse : ${getBaseline(candidate)?.pct_r1 ?? "candidat personnalisé"}%` : undefined}
          value={candidate.pct_r1}
          onChange={(event) => onFieldChange(candidate.id, "pct_r1", event.target.value)}
        />
      ),
    },
    ...(showVotes ? [{ key: "votes", label: "Voix", cellClassName: "votes-cell", render: (candidate) => candidate.votes_r1 }] : []),
    {
      key: "actions",
      label: "",
      render: (candidate) => (
        <button
          type="button"
          className="danger row-delete"
          title="Supprimer"
          onClick={() => {
            if (confirm(`Supprimer « ${candidate.name} » ?`)) onDelete(candidate.id);
          }}
        >
          ✕
        </button>
      ),
    },
  ];

  return (
    <div className="panel">
      <div className="panel-heading-row">
        <h2>{title}</h2>
        {headerActions && <div className="candidate-table-actions">{headerActions}</div>}
      </div>
      {headerTags}
      <EditableTable
        columns={columns}
        rows={simulation.candidates}
        getRowKey={(candidate) => candidate.id}
        renderDraftCell={(column) => {
          if (column.key === "candidate") return (
            <Candidate name={draft.name} editable={false}>
              <CandidateAutocomplete
                value={draft.name}
                options={candidateOptions}
                excludeNames={simulation.candidates.map((candidate) => candidate.name)}
                ariaLabel="Ajouter un candidat"
                placeholder="Ajouter un candidat…"
                invalid={duplicateName}
                invalidAttempt={duplicateAttempt}
                invalidMessage={duplicateName ? "Déjà dans le tableau" : undefined}
                onInvalidAnimationEnd={() => setDuplicateName(false)}
                onChange={(name) => {
                  setDraft((current) => ({ ...current, name }));
                  setDuplicateName(false);
                  setDuplicateAttempt(0);
                  setDraftError("");
                }}
                onEnterCommit={(name) => submitDraft(name)}
              />
            </Candidate>
          );
          if (column.key === "pct_r1") return (
              <input
                type="text"
                inputMode="decimal"
                className="grid-input"
                placeholder="0"
                value={draft.pct_r1}
                onChange={(event) => setDraft((current) => ({ ...current, pct_r1: event.target.value }))}
              />
          );
          return column.key === "votes" ? "—" : null;
        }}
        onEnterLastRow={() => submitDraft()}
        footer={(
          <tr>
            <td>Total</td>
            <td className={`total-cell ${Math.abs(totalPct - 100) <= 0.01 ? "total-ok" : "total-warn"}`}>
              {totalPct.toFixed(2)}%
            </td>
            <td colSpan={showVotes ? 2 : 1}></td>
          </tr>
        )}
      />
      {draftError && <p className="form-error" role="alert">{draftError}</p>}
      <p className="hint">
        Cliquez dans une cellule vide en bas du tableau pour ajouter un candidat. Naviguez avec les flèches
        ↑↓←→ ou <kbd>Tab</kbd>, validez une ligne avec <kbd>Entrée</kbd>. Tout est enregistré automatiquement.
      </p>
    </div>
  );
}
