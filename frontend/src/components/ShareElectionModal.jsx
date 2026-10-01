import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { api } from "../api.js";
import { buildShareUrl, encodeElectionContent, MAX_QR_CONTENT_LENGTH } from "../utils/electionExchange.js";

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
    element.onerror = () => reject(new Error("Impossible de générer le QR code."));
    element.src = dataUrl;
  });

  canvas.width = MATRIX_SIZE;
  canvas.height = MATRIX_SIZE;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, MATRIX_SIZE, MATRIX_SIZE);
  context.drawImage(image, 0, 0, MATRIX_SIZE, MATRIX_SIZE);
}

function slugify(value) {
  return (value || "election").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "election";
}

export default function ShareElectionModal({ electionId, onClose }) {
  const canvasRef = useRef(null);
  const [payload, setPayload] = useState(null);
  const [shareUrl, setShareUrl] = useState("");
  const [error, setError] = useState("");
  const [qrReady, setQrReady] = useState(false);
  const [qrNotice, setQrNotice] = useState("");
  const [copied, setCopied] = useState("");

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
    setQrReady(false);
    setQrNotice("");
    setError("");
    setShareUrl("");
    setPayload(null);

    async function render() {
      try {
        const exported = await api.exportElection(electionId);
        const content = encodeElectionContent(exported);
        if (cancelled) return;
        setPayload(exported);
        setShareUrl(buildShareUrl(exported));
        if (content.length > MAX_QR_CONTENT_LENGTH) {
          setQrNotice("Cette élection est trop riche pour tenir dans un QR code : utilisez le lien ou le fichier.");
          return;
        }
        await drawMatrix(canvasRef.current, buildShareUrl(exported));
        if (!cancelled) setQrReady(true);
      } catch (renderError) {
        if (!cancelled) setError(renderError.message || "Impossible de préparer le partage.");
      }
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [electionId]);

  function handleDownloadQr() {
    if (!canvasRef.current || !qrReady) return;
    const link = document.createElement("a");
    link.download = `${slugify(payload?.election.name)}-partage.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  }

  function handleDownloadFile() {
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${slugify(payload.election.name)}.election.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
  }

  const counts = payload?.election;

  return createPortal(
    <div className="detail-overlay share-overlay" role="presentation" onMouseDown={onClose}>
      <section className="matrix-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="detail-dialog-header">
          <div>
            <p className="detail-eyebrow">Partager l'élection</p>
            <h2 id="share-title">{payload ? payload.election.name : "Préparation du partage…"}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer le partage">×</button>
        </header>
        <div className="matrix-dialog-body">
          {error && <p className="import-error" role="alert">{error}</p>}
          {counts && (
            <p className="hint">
              {counts.candidates.length} candidat{counts.candidates.length !== 1 ? "s" : ""} ·{" "}
              {counts.hypotheses.length} hypothèse{counts.hypotheses.length !== 1 ? "s" : ""} de 1er tour ·{" "}
              {counts.transfer_hypotheses.length} hypothèse{counts.transfer_hypotheses.length !== 1 ? "s" : ""} de report ·{" "}
              {counts.scenarios.length} scénario{counts.scenarios.length !== 1 ? "s" : ""}
            </p>
          )}
          {qrNotice ? (
            <p className="hint" role="status">{qrNotice}</p>
          ) : (
            !error && <canvas ref={canvasRef} className="matrix-preview" aria-label="Code carré de partage" />
          )}
          {qrReady && (
            <button type="button" className="matrix-download" onClick={handleDownloadQr}>↓ Télécharger le QR code</button>
          )}
          {shareUrl && (
            <>
              <div className="share-link-row">
                <input type="text" readOnly value={shareUrl} aria-label="Lien de partage" onFocus={(event) => event.target.select()} />
                <button type="button" className="btn-ghost" onClick={handleCopyLink}>{copied === "ok" ? "✓ Copié" : "⧉ Copier le lien"}</button>
              </div>
              <button type="button" className="matrix-download btn-ghost" onClick={handleDownloadFile}>↓ Télécharger le fichier</button>
            </>
          )}
          {copied === "error" && <p className="hint">Copie impossible : sélectionnez le lien puis copiez-le manuellement.</p>}
        </div>
      </section>
    </div>,
    document.body
  );
}
