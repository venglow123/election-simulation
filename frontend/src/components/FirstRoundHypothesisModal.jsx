import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { filterHypothesesByTags, getRefinementTags } from "../utils/tags.js";
import Breadcrumbs from "./Breadcrumbs.jsx";
import TagChip from "./TagChip.jsx";

function getLeaders(hypothesis) {
  return [...hypothesis.candidates]
    .sort((a, b) => Number(b.pct_r1) - Number(a.pct_r1))
    .slice(0, 2);
}

export default function FirstRoundHypothesisModal({ electionId, selectedHypothesisId, onSelect, onClose }) {
  const [hypotheses, setHypotheses] = useState([]);
  const [tags, setTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [activeHypothesis, setActiveHypothesis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.listElectionHypotheses(electionId),
      api.listElectionTags(electionId),
    ]).then(([data, tagList]) => {
      if (!cancelled) setHypotheses(data);
      if (!cancelled) setTags(tagList);
    }).catch((loadError) => {
      if (!cancelled) setError(loadError.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelled = true;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [electionId, onClose]);

  async function chooseHypothesis(hypothesisId) {
    setBusy(true);
    setError("");
    try {
      await onSelect(hypothesisId);
    } catch (selectError) {
      setError(selectError.message || "Impossible d'appliquer cette hypothèse.");
      setBusy(false);
    }
  }

  async function viewHypothesis(hypothesisId) {
    setError("");
    try {
      setActiveHypothesis(await api.getElectionHypothesis(electionId, hypothesisId));
    } catch (loadError) {
      setError(loadError.message || "Impossible de charger cette hypothèse.");
    }
  }

  const leaders = activeHypothesis ? getLeaders(activeHypothesis) : [];
  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const filteredHypotheses = useMemo(
    () => filterHypothesesByTags(hypotheses, selectedTagIds),
    [hypotheses, selectedTagIds]
  );
  const refinementTags = useMemo(
    () => getRefinementTags(tags, filteredHypotheses, selectedTagIds),
    [tags, filteredHypotheses, selectedTagIds]
  );
  const selectedTags = selectedTagIds.map((id) => tagsById.get(id)).filter(Boolean);

  function renderHypothesisTags(hypothesis) {
    const hypothesisTags = hypothesis.tag_ids.map((id) => tagsById.get(id)).filter(Boolean);
    if (!hypothesisTags.length) return null;
    return (
      <div className="tag-list">
        {hypothesisTags.map((tag) => <TagChip key={tag.id} tag={tag} />)}
      </div>
    );
  }

  return createPortal(
    <div className="detail-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="detail-dialog hypothesis-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hypothesis-picker-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="detail-dialog-header">
          <div>
            {activeHypothesis ? (
              <Breadcrumbs
                label="Navigation des hypothèses"
                items={[
                  { label: "Hypothèses premier tour", onClick: () => setActiveHypothesis(null) },
                  { label: activeHypothesis.name },
                ]}
              />
            ) : (
              <p className="detail-eyebrow">Premier tour</p>
            )}
            <h2 id="hypothesis-picker-title">
              {activeHypothesis ? activeHypothesis.name : "Choisir une hypothèse"}
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer la sélection d'hypothèse">
            ×
          </button>
        </header>
        <div className="detail-dialog-body hypothesis-picker-body">
          {error && <p className="form-error" role="alert">{error}</p>}
          {loading ? (
            <p className="hint">Chargement des hypothèses…</p>
          ) : activeHypothesis ? (
            <>
              {activeHypothesis.description && <p className="hypothesis-picker-description">{activeHypothesis.description}</p>}
              {renderHypothesisTags(activeHypothesis)}
              {leaders.length === 2 && (
                <p className="hypothesis-picker-leaders">
                  En tête : <strong>{leaders[0].name}</strong> ({leaders[0].pct_r1}%) · <strong>{leaders[1].name}</strong> ({leaders[1].pct_r1}%)
                </p>
              )}
              {activeHypothesis.candidates.length ? (
                <table className="data-table hypothesis-readonly-table">
                  <thead><tr><th>Candidat</th><th>% 1er tour</th></tr></thead>
                  <tbody>
                    {activeHypothesis.candidates.map((candidate) => (
                      <tr key={candidate.id}>
                        <td>{candidate.name}</td>
                        <td>{candidate.pct_r1}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="hint">Cette hypothèse ne contient aucun candidat.</p>
              )}
              <div className="hypothesis-picker-actions">
                <button type="button" onClick={() => chooseHypothesis(activeHypothesis.id)} disabled={busy}>
                  {busy ? "Application…" : selectedHypothesisId === activeHypothesis.id ? "Utiliser cette hypothèse" : "Sélectionner cette hypothèse"}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`hypothesis-picker-custom ${selectedHypothesisId == null ? "is-selected" : ""}`}
                onClick={() => chooseHypothesis(null)}
                disabled={busy}
              >
                <span>
                  <strong>Custom</strong>
                  <small>Conserver et modifier les valeurs actuelles du scénario.</small>
                </span>
                {selectedHypothesisId == null && <span className="hypothesis-picker-current">Sélectionnée</span>}
              </button>
              {hypotheses.length === 0 ? (
                <p className="hint">Aucune hypothèse enregistrée. Vous pouvez continuer avec Custom.</p>
              ) : (
                <>
                {(selectedTags.length > 0 || refinementTags.length > 0) && (
                  <div className="hypothesis-tag-filter" aria-label="Filtrer par tags">
                    {selectedTags.map((tag) => (
                      <TagChip
                        key={tag.id}
                        tag={tag}
                        onRemove={() => setSelectedTagIds((current) => current.filter((id) => id !== tag.id))}
                      />
                    ))}
                    {refinementTags.length > 0 && (
                      <span className="hypothesis-tag-filter-label">
                        {selectedTags.length ? "Affiner :" : "Filtrer :"}
                      </span>
                    )}
                    {refinementTags.map((tag) => (
                      <TagChip
                        key={tag.id}
                        tag={tag}
                        title={`Filtrer sur ${tag.name}`}
                        onClick={() => setSelectedTagIds((current) => [...current, tag.id])}
                      />
                    ))}
                  </div>
                )}
                <ul className="hypothesis-picker-list">
                  {filteredHypotheses.map((hypothesis) => {
                    const topCandidates = getLeaders(hypothesis);
                    return (
                      <li key={hypothesis.id}>
                        <div className="hypothesis-picker-item-info">
                          <strong>{hypothesis.name}</strong>
                          <span>
                            {topCandidates.length === 2
                              ? `${topCandidates[0].name} (${topCandidates[0].pct_r1}%) · ${topCandidates[1].name} (${topCandidates[1].pct_r1}%)`
                              : "Moins de deux candidats"}
                          </span>
                          {renderHypothesisTags(hypothesis)}
                        </div>
                        <div className="hypothesis-picker-item-actions">
                          {selectedHypothesisId === hypothesis.id && <span className="hypothesis-picker-current">Sélectionnée</span>}
                          <button type="button" className="btn-ghost" onClick={() => viewHypothesis(hypothesis.id)}>
                            Consulter
                          </button>
                          <button type="button" onClick={() => chooseHypothesis(hypothesis.id)} disabled={busy}>
                            Sélectionner
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}
