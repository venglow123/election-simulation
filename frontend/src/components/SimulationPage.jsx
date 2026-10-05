import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useSimulations } from "../context/SimulationsContext.jsx";
import { debounceByKey } from "../utils/debounceByKey.js";
import { buildPartyIndex, computeTransferBaseline, describeTransferCondition } from "../utils/transferHypothesis.js";
import ScenarioHeader from "./ScenarioHeader.jsx";
import SettingsPanel from "./SettingsPanel.jsx";
import CandidatesTable from "./CandidatesTable.jsx";
import TransfersTable from "./TransfersTable.jsx";
import ResultsPanel from "./ResultsPanel.jsx";
import SankeyDiagram from "./SankeyDiagram.jsx";
import SankeyDetailModal from "./SankeyDetailModal.jsx";
import FirstRoundHypothesisModal from "./FirstRoundHypothesisModal.jsx";
import TransferHypothesisModal from "./TransferHypothesisModal.jsx";
import WarningsPanel from "./WarningsPanel.jsx";
import TagInput from "./TagInput.jsx";
import TagChip from "./TagChip.jsx";

const SAVE_DELAY = 400;

function loadTransferHypothesis(electionId, data) {
  return data.r2_hypothesis_id == null
    ? Promise.resolve(null)
    : api.getElectionTransferHypothesis(electionId, data.r2_hypothesis_id);
}

export default function SimulationPage() {
  const { electionId: routeElectionId, simulationId, id: legacyId } = useParams();
  const id = simulationId || legacyId;
  const electionId = Number(routeElectionId);
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh: refreshSidebar } = useSimulations();
  const [sim, setSim] = useState(null);
  const [candidateOptions, setCandidateOptions] = useState([]);
  const [tags, setTags] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [isSankeyDetailOpen, setIsSankeyDetailOpen] = useState(false);
  const [isFirstRoundHypothesisOpen, setIsFirstRoundHypothesisOpen] = useState(false);
  const [firstRoundHypothesis, setFirstRoundHypothesis] = useState(null);
  const [firstRoundError, setFirstRoundError] = useState("");
  const [isTransferHypothesisOpen, setIsTransferHypothesisOpen] = useState(false);
  const [transferHypothesis, setTransferHypothesis] = useState(null);
  const [transferError, setTransferError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSim(null);
    setFirstRoundHypothesis(null);
    setTransferHypothesis(null);
    setNotFound(false);
    Promise.all([api.getSimulation(electionId, id), api.listElectionCandidates(electionId), api.listElectionTags(electionId)])
      .then(async ([data, options, tagList]) => {
        let hypothesis = null;
        if (data.r1_hypothesis_id != null) {
          hypothesis = await api.getElectionHypothesis(electionId, data.r1_hypothesis_id);
        }
        const r2Hypothesis = await loadTransferHypothesis(electionId, data);
        if (!cancelled) setSim(data);
        if (!cancelled) setCandidateOptions(options);
        if (!cancelled) setTags(tagList);
        if (!cancelled) setFirstRoundHypothesis(hypothesis);
        if (!cancelled) setTransferHypothesis(r2Hypothesis);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [electionId, id]);

  useEffect(() => {
    async function refreshFromStorage(event) {
      if (event.key !== "election-simulation:v2") return;
      try {
        const [data, options, tagList] = await Promise.all([
          api.getSimulation(electionId, id),
          api.listElectionCandidates(electionId),
          api.listElectionTags(electionId),
        ]);
        const hypothesis = data.r1_hypothesis_id == null
          ? null
          : await api.getElectionHypothesis(electionId, data.r1_hypothesis_id);
        const r2Hypothesis = await loadTransferHypothesis(electionId, data);
        setSim(data);
        setCandidateOptions(options);
        setTags(tagList);
        setFirstRoundHypothesis(hypothesis);
        setTransferHypothesis(r2Hypothesis);
      } catch {
      }
    }
    window.addEventListener("storage", refreshFromStorage);
    return () => window.removeEventListener("storage", refreshFromStorage);
  }, [electionId, id]);

  const applyState = useCallback((data) => setSim(data), []);
  const closeFirstRoundHypothesisModal = useCallback(() => setIsFirstRoundHypothesisOpen(false), []);
  const closeTransferHypothesisModal = useCallback(() => setIsTransferHypothesisOpen(false), []);

  const transferBaseline = useMemo(() => (
    sim && transferHypothesis && sim.has_finalists
      ? computeTransferBaseline(transferHypothesis, {
        finalistA: sim.finalist_a.name,
        finalistB: sim.finalist_b.name,
        candidates: sim.candidates,
        partyByName: buildPartyIndex(candidateOptions),
      })
      : null
  ), [sim, transferHypothesis, candidateOptions]);

  const saveMetaField = useCallback(
    (field, value) => {
      setSim((prev) => (prev ? { ...prev, [field]: value } : prev));
      debounceByKey(`meta:${field}`, () => {
        api.updateSimulation(id, { [field]: value }).then((data) => {
          applyState(data);
          refreshSidebar();
        });
      }, SAVE_DELAY);
    },
    [id, applyState, refreshSidebar]
  );

  const saveSettingsField = useCallback(
    (field, value) => {
      setSim((prev) => (prev ? { ...prev, [field]: value } : prev));
      debounceByKey(`settings:${field}`, () => {
        api.updateSimulation(id, { [field]: value }).then(applyState);
      }, SAVE_DELAY);
    },
    [id, applyState]
  );

  const saveCandidateField = useCallback(
    (candidateId, field, value) => {
      setSim((prev) =>
        prev
          ? {
              ...prev,
              candidates: prev.candidates.map((c) => (c.id === candidateId ? { ...c, [field]: value } : c)),
            }
          : prev
      );
      debounceByKey(`candidate:${candidateId}:${field}`, () => {
        api.updateCandidate(id, candidateId, { [field]: value }).then(async (data) => {
          applyState(data);
          if (field === "name") setCandidateOptions(await api.listElectionCandidates(electionId));
        });
      }, SAVE_DELAY);
    },
    [id, electionId, applyState]
  );

  const saveTransferField = useCallback(
    (candidateId, field, value) => {
      setSim((prev) =>
        prev
          ? {
              ...prev,
              candidates: prev.candidates.map((c) =>
                c.id === candidateId ? { ...c, transfer: { ...c.transfer, [field]: value } } : c
              ),
            }
          : prev
      );
      debounceByKey(`transfer:${candidateId}:${field}`, () => {
        api.updateTransfer(id, candidateId, { [field]: value }).then(applyState);
      }, SAVE_DELAY);
    },
    [id, applyState]
  );

  const saveAbstentionTransferField = useCallback(
    (field, value) => {
      const simulationField = field === "pct_to_a" ? "abstention_to_a" : "abstention_to_b";
      setSim((prev) => (prev ? { ...prev, [simulationField]: value } : prev));
      debounceByKey(`abstention:${field}`, () => {
        api.updateAbstentionTransfer(id, { [field]: value }).then(applyState);
      }, SAVE_DELAY);
    },
    [id, applyState]
  );

  // Clear the one-shot navigation flag so a reload or back navigation doesn't refocus the title.
  const clearFocusTitleFlag = useCallback(() => {
    navigate(location.pathname, { replace: true, state: null });
  }, [navigate, location.pathname]);

  async function handleDuplicate() {
    const copy = await api.duplicateSimulation(id);
    await refreshSidebar();
    navigate(`/elections/${electionId}/simulations/${copy.id}`, { state: { focusTitle: true } });
  }

  async function handleCreateCandidate(payload) {
    const data = await api.addCandidate(id, payload);
    applyState(data);
    setCandidateOptions(await api.listElectionCandidates(electionId));
    refreshSidebar();
    return data;
  }

  async function handleDeleteCandidate(candidateId) {
    const data = await api.deleteCandidate(id, candidateId);
    applyState(data);
    setCandidateOptions(await api.listElectionCandidates(electionId));
    refreshSidebar();
  }

  async function handleSelectFirstRoundHypothesis(hypothesisId) {
    const updated = await api.setSimulationFirstRoundHypothesis(electionId, id, hypothesisId);
    setSim(updated);
    setFirstRoundError("");
    setFirstRoundHypothesis(hypothesisId == null
      ? null
      : await api.getElectionHypothesis(electionId, hypothesisId));
    setCandidateOptions(await api.listElectionCandidates(electionId));
    setIsFirstRoundHypothesisOpen(false);
  }

  async function handleResetFirstRoundHypothesis() {
    try {
      const updated = await api.resetSimulationFirstRoundHypothesis(electionId, id);
      setSim(updated);
      if (updated.r1_hypothesis_id != null) {
        setFirstRoundHypothesis(await api.getElectionHypothesis(electionId, updated.r1_hypothesis_id));
      }
      setFirstRoundError("");
    } catch (error) {
      setFirstRoundError(error.message);
    }
  }

  async function handleSaveCurrentAsHypothesis() {
    try {
      const { hypothesis } = await api.saveSimulationAsFirstRoundHypothesis(electionId, id, sim.candidates);
      navigate(`/elections/${electionId}/hypotheses/${hypothesis.id}`, {
        state: {
          focusTitle: true,
          returnTo: {
            label: sim.name || "Scénario",
            to: `/elections/${electionId}/simulations/${id}`,
          },
        },
      });
    } catch (error) {
      setFirstRoundError(error.message);
    }
  }

  async function handleSelectTransferHypothesis(hypothesisId) {
    const updated = await api.setSimulationTransferHypothesis(electionId, id, hypothesisId);
    setSim(updated);
    setTransferError("");
    setTransferHypothesis(await loadTransferHypothesis(electionId, updated));
    setIsTransferHypothesisOpen(false);
  }

  async function handleResetTransferHypothesis() {
    try {
      const updated = await api.resetSimulationTransferHypothesis(electionId, id);
      setSim(updated);
      setTransferHypothesis(await loadTransferHypothesis(electionId, updated));
      setTransferError("");
    } catch (error) {
      setTransferError(error.message);
    }
  }

  function openTransferHypothesisEditor(hypothesisId) {
    navigate(`/elections/${electionId}/transfer-hypotheses/${hypothesisId}`, {
      state: {
        returnTo: { label: sim.name || "Scénario", to: `/elections/${electionId}/simulations/${id}` },
      },
    });
  }

  async function handleSaveCurrentAsTransferHypothesis() {
    try {
      const { hypothesis } = await api.saveSimulationAsTransferHypothesis(electionId, id);
      navigate(`/elections/${electionId}/transfer-hypotheses/${hypothesis.id}`, {
        state: {
          focusTitle: true,
          returnTo: { label: sim.name || "Scénario", to: `/elections/${electionId}/simulations/${id}` },
        },
      });
    } catch (error) {
      setTransferError(error.message);
    }
  }

  async function saveSectionTags(round, tagIds) {
    const field = `${round}_tag_ids`;
    const setError = round === "r1" ? setFirstRoundError : setTransferError;
    try {
      const updated = await api.updateSimulation(id, { [field]: tagIds });
      setSim((current) => current ? { ...current, [field]: updated[field] } : current);
      setError("");
    } catch (error) {
      setError(error.message);
    }
  }

  async function createSectionTag(round, name) {
    try {
      const tag = await api.createElectionTag(electionId, { name });
      setTags(await api.listElectionTags(electionId));
      await saveSectionTags(round, [...sim[`${round}_tag_ids`], tag.id]);
    } catch (error) {
      (round === "r1" ? setFirstRoundError : setTransferError)(error.message);
    }
  }

  function sectionTags(round, hypothesis) {
    const selectedIds = hypothesis ? hypothesis.tag_ids : sim[`${round}_tag_ids`];
    if (hypothesis && !selectedIds.length) return null;
    return (
      <div className="scenario-section-tags" role="group" aria-label={round === "r1" ? "Tags du premier tour" : "Tags des reports de voix"}>
        {hypothesis ? (
          <div className="tag-list">
            {selectedIds.map((tagId) => tags.find((tag) => tag.id === tagId)).filter(Boolean).map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
          </div>
        ) : (
          <TagInput
            tags={tags}
            selectedIds={selectedIds}
            onAdd={(tagId) => saveSectionTags(round, [...selectedIds, tagId])}
            onCreate={(name) => createSectionTag(round, name)}
            onRemove={(tagId) => saveSectionTags(round, selectedIds.filter((selectedId) => selectedId !== tagId))}
          />
        )}
      </div>
    );
  }

  if (notFound) return <p className="empty">Scénario introuvable.</p>;
  if (!sim) return null;

  return (
    <>
      <ScenarioHeader
        simulation={sim}
        onFieldChange={saveMetaField}
        onDuplicate={handleDuplicate}
        autoFocusTitle={Boolean(location.state?.focusTitle) && String(sim.id) === String(id)}
        onTitleFocused={clearFocusTitleFlag}
      />
      <WarningsPanel warnings={sim.warnings} />
      <div className="content-grid">
        <section className="col col-left">
          <SettingsPanel simulation={sim} onFieldChange={saveSettingsField} />
          <CandidatesTable
            simulation={sim}
            candidateOptions={candidateOptions}
            baselineCandidates={firstRoundHypothesis?.candidates}
            headerTags={sectionTags("r1", firstRoundHypothesis)}
            onFieldChange={saveCandidateField}
            onCreate={handleCreateCandidate}
            onDelete={handleDeleteCandidate}
            headerActions={(
              <>
                <button type="button" className="btn-ghost" onClick={() => setIsFirstRoundHypothesisOpen(true)}>
                  {firstRoundHypothesis ? `Hypothèse : ${firstRoundHypothesis.name}` : "Hypothèse : Custom"}
                </button>
                {firstRoundHypothesis ? (
                  <button type="button" className="btn-ghost" onClick={handleResetFirstRoundHypothesis}>
                    Réinitialiser
                  </button>
                ) : (
                  <button type="button" className="btn-ghost" onClick={handleSaveCurrentAsHypothesis}>
                    Enregistrer comme hypothèse
                  </button>
                )}
              </>
            )}
          />
          {firstRoundError && <p className="form-error">{firstRoundError}</p>}
          <TransfersTable
            simulation={sim}
            onFieldChange={saveTransferField}
            onAbstentionFieldChange={saveAbstentionTransferField}
            baseline={transferBaseline}
            headerTags={sectionTags("r2", transferHypothesis)}
            onEditHypothesis={transferHypothesis ? () => openTransferHypothesisEditor(transferHypothesis.id) : undefined}
            notice={transferHypothesis && sim.has_finalists && !transferBaseline && (
              <p className="transfer-uncovered-banner" role="status">
                L'hypothèse « {transferHypothesis.name} » est définie pour le duel {describeTransferCondition(transferHypothesis)},
                qui ne correspond plus aux finalistes du scénario. Choisissez une autre hypothèse ou passez en Custom.
              </p>
            )}
            headerActions={(
              <>
                <button type="button" className="btn-ghost" onClick={() => setIsTransferHypothesisOpen(true)}>
                  {transferHypothesis ? `Hypothèse : ${transferHypothesis.name}` : "Hypothèse : Custom"}
                </button>
                {transferHypothesis ? (
                  <button type="button" className="btn-ghost" onClick={handleResetTransferHypothesis} disabled={!transferBaseline}>
                    Réinitialiser
                  </button>
                ) : (
                  <button type="button" className="btn-ghost" onClick={handleSaveCurrentAsTransferHypothesis}>
                    Enregistrer comme hypothèse
                  </button>
                )}
              </>
            )}
          />
          {transferError && <p className="form-error">{transferError}</p>}
        </section>
        <section className="col col-right">
          <div className="panel results-panel">
            <h2>Résultats du 2e tour</h2>
            <ResultsPanel simulation={sim} />
          </div>
          <div className="panel sankey-panel">
            <div className="panel-heading-row">
              <h2>Diagramme de Sankey</h2>
              {sim.sankey && (
                <button type="button" className="btn-ghost detail-trigger" onClick={() => setIsSankeyDetailOpen(true)}>
                  <span aria-hidden="true">⤢</span> Voir le détail
                </button>
              )}
            </div>
            <SankeyDiagram data={sim.sankey} />
          </div>
        </section>
      </div>
      {isSankeyDetailOpen && <SankeyDetailModal data={sim.sankey} onClose={() => setIsSankeyDetailOpen(false)} />}
      {isFirstRoundHypothesisOpen && (
        <FirstRoundHypothesisModal
          electionId={electionId}
          selectedHypothesisId={sim.r1_hypothesis_id}
          onSelect={handleSelectFirstRoundHypothesis}
          onClose={closeFirstRoundHypothesisModal}
        />
      )}
      {isTransferHypothesisOpen && (
        <TransferHypothesisModal
          electionId={electionId}
          simulation={sim}
          candidateOptions={candidateOptions}
          selectedHypothesisId={sim.r2_hypothesis_id}
          onSelect={handleSelectTransferHypothesis}
          onClose={closeTransferHypothesisModal}
        />
      )}
    </>
  );
}
