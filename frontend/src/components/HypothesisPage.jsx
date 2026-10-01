import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useSimulations } from "../context/SimulationsContext.jsx";
import { debounceByKey, flushDebouncedByPrefix } from "../utils/debounceByKey.js";
import Breadcrumbs from "./Breadcrumbs.jsx";
import CandidatesTable from "./CandidatesTable.jsx";
import ScenarioHeader from "./ScenarioHeader.jsx";
import TagInput from "./TagInput.jsx";

const SAVE_DELAY = 400;

export default function HypothesisPage() {
  const { electionId: routeElectionId, hypothesisId } = useParams();
  const electionId = Number(routeElectionId);
  const navigate = useNavigate();
  const location = useLocation();
  const { elections } = useSimulations();
  const election = elections.find((item) => item.id === electionId);
  const [hypothesis, setHypothesis] = useState(null);
  const [candidateOptions, setCandidateOptions] = useState([]);
  const [tags, setTags] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setHypothesis(null);
    setNotFound(false);
    Promise.all([
      api.getElectionHypothesis(electionId, hypothesisId),
      api.listElectionCandidates(electionId),
      api.listElectionTags(electionId),
    ]).then(([data, options, tagList]) => {
      if (!cancelled) setHypothesis(data);
      if (!cancelled) setCandidateOptions(options);
      if (!cancelled) setTags(tagList);
    }).catch(() => {
      if (!cancelled) setNotFound(true);
    });
    return () => { cancelled = true; };
  }, [electionId, hypothesisId]);

  const saveMetaField = useCallback((field, value) => {
    setHypothesis((current) => current ? { ...current, [field]: value } : current);
    debounceByKey(`hypothesis:${electionId}:${hypothesisId}:meta:${field}`, () => {
      api.updateElectionHypothesis(electionId, hypothesisId, { [field]: value })
        .then(() => setSaveError(""))
        .catch((error) => setSaveError(error.message));
    }, SAVE_DELAY);
  }, [electionId, hypothesisId]);

  const saveCandidateField = useCallback((candidateId, field, value) => {
    setHypothesis((current) => current ? {
      ...current,
      candidates: current.candidates.map((candidate) => (
        candidate.id === candidateId ? { ...candidate, [field]: value } : candidate
      )),
    } : current);
    debounceByKey(`hypothesis:${electionId}:${hypothesisId}:candidate:${candidateId}:${field}`, () => {
      api.updateHypothesisCandidate(electionId, hypothesisId, candidateId, { [field]: value })
        .then(async () => {
          setSaveError("");
          if (field === "name") setCandidateOptions(await api.listElectionCandidates(electionId));
        })
        .catch((error) => setSaveError(error.message));
    }, SAVE_DELAY);
  }, [electionId, hypothesisId]);

  const clearFocusTitleFlag = useCallback(() => {
    navigate(location.pathname, {
      replace: true,
      state: location.state?.returnTo ? { returnTo: location.state.returnTo } : null,
    });
  }, [navigate, location.pathname, location.state]);

  async function saveTagIds(tagIds) {
    setHypothesis((current) => current ? { ...current, tag_ids: tagIds } : current);
    try {
      const updated = await api.updateElectionHypothesis(electionId, hypothesisId, { tag_ids: tagIds });
      setHypothesis((current) => current ? { ...current, tag_ids: updated.tag_ids } : current);
      setSaveError("");
    } catch (error) {
      setSaveError(error.message);
    }
  }

  async function handleCreateTag(name) {
    try {
      const tag = await api.createElectionTag(electionId, { name });
      setTags(await api.listElectionTags(electionId));
      await saveTagIds([...hypothesis.tag_ids, tag.id]);
    } catch (error) {
      setSaveError(error.message);
    }
  }

  async function handleCreateCandidate(payload) {
    const updated = await api.addHypothesisCandidate(electionId, hypothesisId, payload);
    setHypothesis(updated);
    setCandidateOptions(await api.listElectionCandidates(electionId));
    setSaveError("");
    return updated;
  }

  async function handleDeleteCandidate(candidateId) {
    const updated = await api.deleteHypothesisCandidate(electionId, hypothesisId, candidateId);
    setHypothesis(updated);
    setSaveError("");
  }

  async function handleDuplicate() {
    const copy = await api.duplicateElectionHypothesis(electionId, hypothesisId);
    navigate(`/elections/${electionId}/hypotheses/${copy.id}`, { state: { focusTitle: true } });
  }

  async function handleReturnToScenario() {
    try {
      await flushDebouncedByPrefix(`hypothesis:${electionId}:${hypothesisId}:`);
      navigate(location.state.returnTo.to);
    } catch (error) {
      setSaveError(error.message);
    }
  }

  if (notFound) return <p className="empty">Hypothèse introuvable.</p>;
  if (!hypothesis) return null;

  return (
    <div className="hypothesis-editor-page">
      <Breadcrumbs
        items={location.state?.returnTo
          ? [
              { label: location.state.returnTo.label, onClick: handleReturnToScenario },
              { label: hypothesis.name },
            ]
          : [
              { label: election?.name || "Élection", to: `/elections/${electionId}` },
              { label: "Paramètres", to: `/elections/${electionId}/settings` },
              { label: hypothesis.name },
            ]}
      />
      <ScenarioHeader
        simulation={hypothesis}
        onFieldChange={saveMetaField}
        onDuplicate={handleDuplicate}
        titlePlaceholder="Nom de l'hypothèse"
        descriptionPlaceholder="Description de cette hypothèse du premier tour"
        autoFocusTitle={Boolean(location.state?.focusTitle)}
        onTitleFocused={clearFocusTitleFlag}
      />
      <TagInput
        tags={tags}
        selectedIds={hypothesis.tag_ids}
        onAdd={(tagId) => saveTagIds([...hypothesis.tag_ids, tagId])}
        onCreate={handleCreateTag}
        onRemove={(tagId) => saveTagIds(hypothesis.tag_ids.filter((id) => id !== tagId))}
      />
      {saveError && <p className="form-error">{saveError}</p>}
      <CandidatesTable
        simulation={hypothesis}
        candidateOptions={candidateOptions}
        onFieldChange={saveCandidateField}
        onCreate={handleCreateCandidate}
        onDelete={handleDeleteCandidate}
        title="Résultats du 1er tour"
        showVotes={false}
      />
    </div>
  );
}