import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useSimulations } from "../context/SimulationsContext.jsx";
import { decodeElectionContent } from "../utils/electionExchange.js";

export default function ImportFromLink() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshElections, selectElection } = useSimulations();
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState("");

  const { payload, error } = useMemo(() => {
    try {
      return { payload: decodeElectionContent(searchParams.get("content")), error: "" };
    } catch (decodeError) {
      return { payload: null, error: decodeError.message };
    }
  }, [searchParams]);

  // Import explicite : un simple rechargement de la page ne doit pas créer de doublon.
  async function handleImport() {
    setBusy(true);
    setImportError("");
    try {
      const imported = await api.importElection(payload);
      await refreshElections();
      await selectElection(imported.id);
      navigate(`/elections/${imported.id}`, { replace: true });
    } catch (failure) {
      setImportError(failure.message || "L'import a échoué.");
      setBusy(false);
    }
  }

  const summary = payload?.election;

  return (
    <div className="import-link-page">
      <p className="detail-eyebrow">Importer une élection partagée</p>
      {error && <p className="import-error" role="alert">{error}</p>}
      {summary && (
        <div className="import-confirmation">
          <div>
            <p className="detail-eyebrow">Élection reçue</p>
            <strong>{summary.name}</strong>
            <p className="hint">
              {summary.candidates.length} candidat{summary.candidates.length !== 1 ? "s" : ""} ·{" "}
              {summary.hypotheses.length + summary.transfer_hypotheses.length} hypothèse
              {summary.hypotheses.length + summary.transfer_hypotheses.length !== 1 ? "s" : ""} ·{" "}
              {summary.scenarios.length} scénario{summary.scenarios.length !== 1 ? "s" : ""} · sera ajoutée comme nouvelle
              élection dans ce navigateur.
            </p>
          </div>
          <div className="import-actions">
            <button type="button" className="btn-ghost" onClick={() => navigate("/", { replace: true })} disabled={busy}>Annuler</button>
            <button type="button" onClick={handleImport} disabled={busy}>{busy ? "Import en cours…" : "Importer l'élection"}</button>
          </div>
        </div>
      )}
      {importError && <p className="import-error" role="alert">{importError}</p>}
    </div>
  );
}
