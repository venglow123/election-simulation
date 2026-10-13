export default function ReorderFeedback({ instructionsId, announcement, error }) {
  return (
    <>
      <span id={instructionsId} className="table-sr-only">
        Glissez la poignée pour déplacer la ligne. Au clavier : Espace ou Entrée pour saisir,
        flèches haut et bas pour déplacer, Espace ou Entrée pour déposer, Échap pour annuler.
      </span>
      <span className="table-sr-only" role="status" aria-live="polite">{announcement}</span>
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  );
}
