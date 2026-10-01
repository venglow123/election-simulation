import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useSimulations } from "../context/SimulationsContext.jsx";
import { debounceByKey, flushDebouncedByPrefix } from "../utils/debounceByKey.js";
import Breadcrumbs from "./Breadcrumbs.jsx";
import ScenarioHeader from "./ScenarioHeader.jsx";
import TagInput from "./TagInput.jsx";
import TransferMatrixTable from "./TransferMatrixTable.jsx";

const SAVE_DELAY = 400;
const KIND_LIST = { candidate: "candidate_transfers", party: "party_transfers" };
const KIND_KEY = { candidate: "name", party: "party" };

export default function TransferHypothesisPage() {
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
  const savePrefix = `transfer-hypothesis:${electionId}:${hypothesisId}:`;

  useEffect(() => {
    let cancelled = false;
    setHypothesis(null);
    setNotFound(false);
    Promise.all([
      api.getElectionTransferHypothesis(electionId, hypothesisId),
      api.listElectionCandidates(electionId),
      api.listElectionTags(electionId),
    ]).then(([data, options, tagList]) => {
      if (cancelled) return;
      setHypothesis(data);
      setCandidateOptions(options);
      setTags(tagList);
    }).catch(() => {
      if (!cancelled) setNotFound(true);
    });
    return () => { cancelled = true; };
  }, [electionId, hypothesisId]);

  const partyOptions = useMemo(() => {
    const parties = new Map();
    for (const candidate of candidateOptions) {
      const party = String(candidate.party || "").trim();
      if (party && !parties.has(party)) parties.set(party, { name: party });
    }
    return [...parties.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [candidateOptions]);

  const saveMetaField = useCallback((field, value) => {
    setHypothesis((current) => current ? { ...current, [field]: value } : current);
    debounceByKey(`${savePrefix}meta:${field}`, () => (
      api.updateElectionTransferHypothesis(electionId, hypothesisId, { [field]: value })
        .then(() => setSaveError(""))
        .catch((error) => setSaveError(error.message))
    ), SAVE_DELAY);
  }, [electionId, hypothesisId, savePrefix]);

  const saveRowField = useCallback((kind, rowId, field, value) => {
    setHypothesis((current) => current ? {
      ...current,
      [KIND_LIST[kind]]: current[KIND_LIST[kind]].map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    } : current);
    const payloadField = field === KIND_KEY[kind] ? "key" : field;
    debounceByKey(`${savePrefix}${kind}:${rowId}:${field}`, () => (
      api.updateTransferHypothesisRow(electionId, hypothesisId, kind, rowId, { [payloadField]: value })
        .then(() => setSaveError(""))
        .catch((error) => setSaveError(error.message))
    ), SAVE_DELAY);
  }, [electionId, hypothesisId, savePrefix]);

  async function saveCondition(field, value) {
    try {
      await flushDebouncedByPrefix(savePrefix);
      setHypothesis(await api.updateElectionTransferHypothesis(electionId, hypothesisId, { [field]: value }));
      setSaveError("");
    } catch (error) {
      setSaveError(error.message);
    }
  }

  async function handleCreateRow(kind, payload) {
    try {
      await flushDebouncedByPrefix(savePrefix);
      setHypothesis(await api.addTransferHypothesisRow(electionId, hypothesisId, kind, payload));
      setSaveError("");
    } catch (error) {
      setSaveError(error.message);
      throw error;
    }
  }

  async function handleDeleteRow(kind, rowId) {
    await flushDebouncedByPrefix(savePrefix);
    setHypothesis(await api.deleteTransferHypothesisRow(electionId, hypothesisId, kind, rowId));
    setSaveError("");
  }

  const clearFocusTitleFlag = useCallback(() => {
    navigate(location.pathname, {
      replace: true,
      state: location.state?.returnTo ? { returnTo: location.state.returnTo } : null,
    });
  }, [navigate, location.pathname, location.state]);

  async function saveTagIds(tagIds) {
    setHypothesis((current) => current ? { ...current, tag_ids: tagIds } : current);
    try {
      const updated = await api.updateElectionTransferHypothesis(electionId, hypothesisId, { tag_ids: tagIds });
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

  async function handleDuplicate() {
    await flushDebouncedByPrefix(savePrefix);
    const copy = await api.duplicateElectionTransferHypothesis(electionId, hypothesisId);
    navigate(`/elections/${electionId}/transfer-hypotheses/${copy.id}`, { state: { focusTitle: true } });
  }

  async function handleReturnToScenario() {
    try {
      await flushDebouncedByPrefix(savePrefix);
      navigate(location.state.returnTo.to);
    } catch (error) {
      setSaveError(error.message);
    }
  }

  if (notFound) return <p className="empty">Hypothèse introuvable.</p>;
  if (!hypothesis) return null;

  const finalistOptions = [...new Set([
    ...candidateOptions.map((candidate) => candidate.name),
    hypothesis.finalist_a,
    hypothesis.finalist_b,
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const hasCondition = Boolean(hypothesis.finalist_a && hypothesis.finalist_b);

  function renderFinalistSelect(field, label) {
    const other = field === "finalist_a" ? hypothesis.finalist_b : hypothesis.finalist_a;
    return (
      <label className="transfer-condition-field">
        <span>{label}</span>
        <select value={hypothesis[field]} onChange={(event) => saveCondition(field, event.target.value)}>
          <option value="">— Choisir un candidat —</option>
          {finalistOptions.map((name) => (
            <option key={name} value={name} disabled={name === other}>{name}</option>
          ))}
        </select>
      </label>
    );
  }

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
        descriptionPlaceholder="Description de cette hypothèse de reports de voix"
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
      <section className="panel">
        <h2>Condition : candidats qualifiés au 2e tour</h2>
        <p className="hint">
          Cette hypothèse ne sera proposée que dans les scénarios dont les deux finalistes correspondent, quel que soit leur ordre.
        </p>
        <div className="transfer-condition">
          {renderFinalistSelect("finalist_a", "Finaliste A")}
          <span className="transfer-condition-versus" aria-hidden="true">vs</span>
          {renderFinalistSelect("finalist_b", "Finaliste B")}
        </div>
      </section>
      {hasCondition ? (
        <>
          <TransferMatrixTable
            title="Reports par candidat"
            hint="Prioritaires : s'appliquent en premier aux candidats du scénario portant ce nom."
            rows={hypothesis.candidate_transfers}
            keyField="name"
            keyLabel="Candidat"
            keyPlaceholder="Ajouter un candidat…"
            options={candidateOptions}
            finalistA={hypothesis.finalist_a}
            finalistB={hypothesis.finalist_b}
            abstention={{
              pct_to_a: hypothesis.abstention_to_a,
              pct_to_b: hypothesis.abstention_to_b,
              onChange: (field, value) => saveMetaField(field === "pct_to_a" ? "abstention_to_a" : "abstention_to_b", value),
            }}
            onFieldChange={(rowId, field, value) => saveRowField("candidate", rowId, field, value)}
            onCreate={(payload) => handleCreateRow("candidate", payload)}
            onDelete={(rowId) => handleDeleteRow("candidate", rowId)}
          />
          <TransferMatrixTable
            title="Reports par parti"
            hint="Appliqués aux candidats sans ligne dédiée, selon le parti renseigné dans les paramètres de l'élection. Les candidats couverts par aucune matrice sont reportés à 100 % vers l'abstention."
            rows={hypothesis.party_transfers}
            keyField="party"
            keyLabel="Parti"
            keyPlaceholder="Ajouter un parti…"
            options={partyOptions}
            finalistA={hypothesis.finalist_a}
            finalistB={hypothesis.finalist_b}
            onFieldChange={(rowId, field, value) => saveRowField("party", rowId, field, value)}
            onCreate={(payload) => handleCreateRow("party", payload)}
            onDelete={(rowId) => handleDeleteRow("party", rowId)}
          />
        </>
      ) : (
        <p className="hint">Choisissez les deux finalistes pour renseigner les matrices de reports.</p>
      )}
    </div>
  );
}
