import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import jsQR from "jsqr";
import { api } from "../api.js";
import { decodeElectionPayload, validateElectionPayload } from "../utils/electionExchange.js";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_SIDE = 2400;

async function decodeImageFile(file) {
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Cette image est trop volumineuse (12 Mo maximum).");

  const bitmap = await createImageBitmap(file);
  if ("BarcodeDetector" in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const detected = await detector.detect(bitmap);
      if (detected[0]?.rawValue) {
        const payload = decodeElectionPayload(detected[0].rawValue);
        bitmap.close();
        return payload;
      }
    } catch {
    }
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const source = document.createElement("canvas");
  source.width = Math.max(1, Math.round(bitmap.width * scale));
  source.height = Math.max(1, Math.round(bitmap.height * scale));
  source.getContext("2d").drawImage(bitmap, 0, 0, source.width, source.height);
  bitmap.close();

  const regions = [
    [0, 0, source.width, source.height],
    [0, source.height * 0.4, source.width, source.height * 0.6],
    [source.width * 0.35, source.height * 0.35, source.width * 0.65, source.height * 0.65],
    [0, source.height * 0.5, source.width * 0.55, source.height * 0.5],
    [source.width * 0.45, source.height * 0.5, source.width * 0.55, source.height * 0.5],
  ];
  for (const [x, y, width, height] of regions) {
    const factor = Math.min(2.5, MAX_IMAGE_SIDE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * factor));
    canvas.height = Math.max(1, Math.round(height * factor));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = false;
    context.drawImage(source, x, y, width, height, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    let code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
    if (!code) {
      for (let index = 0; index < imageData.data.length; index += 4) {
        const gray = (imageData.data[index] + imageData.data[index + 1] + imageData.data[index + 2]) / 3;
        const value = gray < 160 ? 0 : 255;
        imageData.data[index] = value;
        imageData.data[index + 1] = value;
        imageData.data[index + 2] = value;
      }
      code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
    }
    if (code) return decodeElectionPayload(code.data);
  }
  throw new Error("Aucun QR code lisible n'a été trouvé dans cette image.");
}

async function decodeJsonFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error("Ce fichier est trop volumineux (4 Mo maximum).");
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("Ce fichier n'est pas un export d'élection valide.");
  }
  return validateElectionPayload(parsed);
}

async function decodeFile(file) {
  if (!file) throw new Error("Sélectionnez un fichier d'élection ou une image contenant un QR code.");
  if (file.type === "application/json" || file.name.toLowerCase().endsWith(".json")) return decodeJsonFile(file);
  if (file.type.startsWith("image/")) return decodeImageFile(file);
  throw new Error("Sélectionnez un fichier .json exporté ou une image contenant un QR code.");
}

export default function ImportElectionModal({ onClose, onImported }) {
  const inputRef = useRef(null);
  const [payload, setPayload] = useState(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  async function processFile(file) {
    setError("");
    setPayload(null);
    try {
      setPayload(await decodeFile(file));
    } catch (decodeError) {
      setError(decodeError.message || "Impossible de lire ce fichier.");
    }
  }

  function processLink(value) {
    setLink(value);
    setError("");
    setPayload(null);
    if (!value.trim()) return;
    try {
      setPayload(decodeElectionPayload(value));
    } catch (decodeError) {
      setError(decodeError.message || "Ce lien est illisible.");
    }
  }

  async function handleImport() {
    if (!payload) return;
    setBusy(true);
    setError("");
    try {
      await onImported(await api.importElection(payload));
    } catch (importError) {
      setError(importError.message || "L'import a échoué.");
      setBusy(false);
    }
  }

  const summary = payload?.election;

  return createPortal(
    <div className="detail-overlay" role="presentation" onMouseDown={onClose}>
      <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="detail-dialog-header">
          <div>
            <p className="detail-eyebrow">Importer une élection</p>
            <h2 id="import-title">Coller un lien, ou lire un fichier partagé</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer l'import">×</button>
        </header>
        <div className="import-dialog-body">
          <label className="import-link-field">
            <span>Lien de partage</span>
            <textarea
              rows={3}
              value={link}
              placeholder="https://…/#/import?content=…"
              onChange={(event) => processLink(event.target.value)}
            />
          </label>
          <div className="import-dropzone">
            <div className="import-dropzone-icon">▣</div>
            <h3>Ou déposez un fichier d'élection (.json) ou un QR code</h3>
            <p className="hint">Le QR code doit être visible et suffisamment net.</p>
            <div className="import-actions">
              <button type="button" onClick={() => inputRef.current?.click()}>↑ Choisir un fichier</button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json,image/*"
              hidden
              onChange={(event) => processFile(event.target.files?.[0])}
            />
          </div>
          {error && <p className="import-error" role="alert">{error}</p>}
          {summary && (
            <div className="import-confirmation">
              <div>
                <p className="detail-eyebrow">Élection reconnue</p>
                <strong>{summary.name}</strong>
                <p className="hint">
                  {summary.candidates.length} candidat{summary.candidates.length !== 1 ? "s" : ""} ·{" "}
                  {summary.hypotheses.length + summary.transfer_hypotheses.length} hypothèse
                  {summary.hypotheses.length + summary.transfer_hypotheses.length !== 1 ? "s" : ""} ·{" "}
                  {summary.scenarios.length} scénario{summary.scenarios.length !== 1 ? "s" : ""} · une nouvelle élection
                  indépendante sera créée.
                </p>
              </div>
              <button type="button" onClick={handleImport} disabled={busy}>{busy ? "Import en cours…" : "Importer l'élection"}</button>
            </div>
          )}
          <p className="hint import-footnote">Les données sont vérifiées puis enregistrées uniquement dans ce navigateur.</p>
        </div>
      </section>
    </div>,
    document.body
  );
}
