import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useSimulations } from "../context/SimulationsContext.jsx";
import { debounceByKey } from "../utils/debounceByKey.js";
import ScenarioHeader from "./ScenarioHeader.jsx";
import SettingsPanel from "./SettingsPanel.jsx";
import CandidatesTable from "./CandidatesTable.jsx";
import TransfersTable from "./TransfersTable.jsx";
import ResultsPanel from "./ResultsPanel.jsx";
import SankeyDiagram from "./SankeyDiagram.jsx";
import SankeyDetailModal from "./SankeyDetailModal.jsx";
import ShareScenarioModal from "./ShareScenarioModal.jsx";
import WarningsPanel from "./WarningsPanel.jsx";

const SAVE_DELAY = 400;

export default function SimulationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh: refreshSidebar } = useSimulations();
  const [sim, setSim] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [isSankeyDetailOpen, setIsSankeyDetailOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSim(null);
    setNotFound(false);
    api
      .getSimulation(id)
      .then((data) => {
        if (!cancelled) setSim(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const applyState = useCallback((data) => setSim(data), []);

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
        api.updateCandidate(id, candidateId, { [field]: value }).then(applyState);
      }, SAVE_DELAY);
    },
    [id, applyState]
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
      setSim((prev) => (prev ? { ...prev, [field]: value } : prev));
      debounceByKey(`abstention:${field}`, () => {
        api.updateAbstentionTransfer(id, { [field]: value }).then(applyState);
      }, SAVE_DELAY);
    },
    [id, applyState]
  );

  async function handleDuplicate() {
    const copy = await api.duplicateSimulation(id);
    await refreshSidebar();
    navigate(`/simulations/${copy.id}`);
  }

  async function handleCreateCandidate(payload) {
    const data = await api.addCandidate(id, payload);
    applyState(data);
    refreshSidebar();
    return data;
  }

  async function handleDeleteCandidate(candidateId) {
    const data = await api.deleteCandidate(id, candidateId);
    applyState(data);
    refreshSidebar();
  }

  if (notFound) return <p className="empty">Scénario introuvable.</p>;
  if (!sim) return null;

  return (
    <>
      <ScenarioHeader
        simulation={sim}
        onFieldChange={saveMetaField}
        onDuplicate={handleDuplicate}
        onShare={() => setIsShareOpen(true)}
      />
      <WarningsPanel warnings={sim.warnings} />
      <div className="content-grid">
        <section className="col col-left">
          <SettingsPanel simulation={sim} onFieldChange={saveSettingsField} />
          <CandidatesTable
            simulation={sim}
            onFieldChange={saveCandidateField}
            onCreate={handleCreateCandidate}
            onDelete={handleDeleteCandidate}
          />
          <TransfersTable
            simulation={sim}
            onFieldChange={saveTransferField}
            onAbstentionFieldChange={saveAbstentionTransferField}
          />
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
      {isShareOpen && <ShareScenarioModal simulation={sim} onClose={() => setIsShareOpen(false)} />}
    </>
  );
}
