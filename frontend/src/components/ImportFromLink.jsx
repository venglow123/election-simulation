import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useSimulations } from "../context/SimulationsContext.jsx";
import { decodeScenarioContent } from "../utils/scenarioExchange.js";

export default function ImportFromLink() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useSimulations();
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState("");

  const { payload, error } = useMemo(() => {
    try {
      return { payload: decodeScenarioContent(searchParams.get("content")), error: "" };
    } catch (decodeError) {
      return { payload: null, error: decodeError.message };
    }
  }, [searchParams]);

  // Import explicite : un simple rechargement de la page ne doit pas créer de doublon.
  async function handleImport() {
    setBusy(true);
    setImportError("");
    try {
      const imported = await api.importSimulation(payload);
      await refresh();
      navigate(`/simulations/${imported.id}`, { replace: true });
    } catch (failure) {
      setImportError(failure.message || "L'import a échoué.");
      setBusy(false);
    }
  }

  const candidatesCount = payload?.scenario.candidates.length ?? 0;

  return (
    <div className="import-link-page">
      <p className="detail-eyebrow">Importer un scénario partagé</p>
      {error && <p className="import-error" role="alert">{error}</p>}
      {payload && (
        <div className="import-confirmation">
          <div>
            <p className="detail-eyebrow">Scénario reçu</p>
            <strong>{payload.scenario.name}</strong>
            <p className="hint">
              {candidatesCount} candidat{candidatesCount !== 1 ? "s" : ""} · sera ajouté comme nouveau scénario dans ce navigateur.
            </p>
          </div>
          <div className="import-actions">
            <button type="button" className="btn-ghost" onClick={() => navigate("/", { replace: true })} disabled={busy}>Annuler</button>
            <button type="button" onClick={handleImport} disabled={busy}>{busy ? "Import en cours…" : "Importer le scénario"}</button>
          </div>
        </div>
      )}
      {importError && <p className="import-error" role="alert">{importError}</p>}
    </div>
  );
}
