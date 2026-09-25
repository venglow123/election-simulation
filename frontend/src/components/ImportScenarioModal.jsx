import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import jsQR from "jsqr";
import { api } from "../api.js";
import { decodeScenarioPayload } from "../utils/scenarioExchange.js";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_SIDE = 2400;

async function decodeImageFile(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Sélectionnez une image contenant un QR code.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Cette image est trop volumineuse (12 Mo maximum).");

  const bitmap = await createImageBitmap(file);
  if ("BarcodeDetector" in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const detected = await detector.detect(bitmap);
      if (detected[0]?.rawValue) {
        const payload = decodeScenarioPayload(detected[0].rawValue);
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
    if (code) return decodeScenarioPayload(code.data);
  }
  throw new Error("Aucun QR code lisible n'a été trouvé dans cette image.");
}

export default function ImportScenarioModal({ onClose, onImported }) {
  const inputRef = useRef(null);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    async function handlePaste(event) {
      const imageItem = [...(event.clipboardData?.items || [])].find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;
      event.preventDefault();
      await processFile(imageItem.getAsFile());
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("paste", handlePaste);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("paste", handlePaste);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  async function processFile(file) {
    setError("");
    setPayload(null);
    try {
      setPayload(await decodeImageFile(file));
    } catch (decodeError) {
      setError(decodeError.message || "Impossible de lire cette image.");
    }
  }

  async function handleClipboardButton() {
    if (!navigator.clipboard?.read) {
      setError("La lecture directe du presse-papiers n'est pas disponible. Utilisez Ctrl+V dans cette fenêtre.");
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (imageType) {
          await processFile(await item.getType(imageType));
          return;
        }
      }
      setError("Aucune image n'est disponible dans le presse-papiers.");
    } catch {
      setError("La lecture du presse-papiers a été refusée. Utilisez Ctrl+V dans cette fenêtre.");
    }
  }

  async function handleImport() {
    if (!payload) return;
    setBusy(true);
    setError("");
    try {
      const imported = await api.importSimulation(payload);
      await onImported(imported);
    } catch (importError) {
      setError(importError.message || "L'import a été refusé par le serveur.");
      setBusy(false);
    }
  }

  return createPortal(
    <div className="detail-overlay" role="presentation" onMouseDown={onClose}>
      <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="detail-dialog-header">
          <div>
            <p className="detail-eyebrow">Importer un scénario</p>
            <h2 id="import-title">Lire un QR code partagé</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer l'import">×</button>
        </header>
        <div className="import-dialog-body">
          <div className="import-dropzone">
            <div className="import-dropzone-icon">▣</div>
            <h3>Déposez une image ou choisissez un fichier</h3>
            <p className="hint">Le QR code doit être visible et suffisamment net.</p>
            <div className="import-actions">
              <button type="button" onClick={() => inputRef.current?.click()}>↑ Choisir une image</button>
              <button type="button" className="btn-ghost" onClick={handleClipboardButton}>▣ Lire le presse-papiers</button>
            </div>
            <input ref={inputRef} type="file" accept="image/*" hidden onChange={(event) => processFile(event.target.files?.[0])} />
          </div>
          {error && <p className="import-error" role="alert">{error}</p>}
          {payload && (
            <div className="import-confirmation">
              <div>
                <p className="detail-eyebrow">QR reconnu</p>
                <strong>{payload.scenario.name}</strong>
                <p className="hint">{payload.scenario.candidates.length} candidat{payload.scenario.candidates.length !== 1 ? "s" : ""} · les données seront importées dans un nouveau scénario indépendant.</p>
              </div>
              <button type="button" onClick={handleImport} disabled={busy}>{busy ? "Import en cours…" : "Importer le scénario"}</button>
            </div>
          )}
          <p className="hint import-footnote">Les données sont vérifiées dans le navigateur puis à nouveau par l'API avant toute création.</p>
        </div>
      </section>
    </div>,
    document.body
  );
}
