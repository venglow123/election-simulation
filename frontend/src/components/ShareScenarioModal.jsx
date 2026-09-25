import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { buildScenarioPayload, encodeScenarioPayload } from "../utils/scenarioExchange.js";

const MATRIX_SIZE = 512;

async function drawMatrix(canvas, encoded) {
  const dataUrl = await QRCode.toDataURL(encoded, {
    errorCorrectionLevel: "M",
    margin: 4,
    width: MATRIX_SIZE,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Impossible de générer le Data Matrix."));
    element.src = dataUrl;
  });

  canvas.width = MATRIX_SIZE;
  canvas.height = MATRIX_SIZE;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, MATRIX_SIZE, MATRIX_SIZE);
  context.drawImage(image, 0, 0, MATRIX_SIZE, MATRIX_SIZE);
}

export default function ShareScenarioModal({ simulation, onClose }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError("");
    async function render() {
      try {
        const encoded = encodeScenarioPayload(buildScenarioPayload(simulation));
        await drawMatrix(canvasRef.current, encoded);
        if (!cancelled) setReady(true);
      } catch (renderError) {
        if (!cancelled) setError(renderError.message || "Impossible de générer le Data Matrix.");
      }
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [simulation]);

  function handleDownload() {
    if (!canvasRef.current || !ready) return;
    const link = document.createElement("a");
    link.download = `${(simulation.name || "scenario").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-partage.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="detail-overlay share-overlay" role="presentation" onMouseDown={onClose}>
      <section className="matrix-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="detail-dialog-header">
          <div>
            <p className="detail-eyebrow">Partager le scénario</p>
            <h2 id="share-title">Code de partage du scénario</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer le partage">×</button>
        </header>
        <div className="matrix-dialog-body">
          {error ? <p className="import-error" role="alert">{error}</p> : <canvas ref={canvasRef} className="matrix-preview" aria-label="Code carré de partage" />}
          <button type="button" className="matrix-download" onClick={handleDownload} disabled={!ready}>↓ Télécharger le code</button>
        </div>
      </section>
    </div>
  );
}
