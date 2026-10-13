export default function ReorderHandle({ label, instructionsId, handleProps, className = "" }) {
  return (
    <button
      type="button"
      className={`row-drag-handle ${className}`}
      aria-label={`Déplacer ${label}`}
      aria-describedby={instructionsId}
      title="Glisser pour réordonner"
      {...handleProps}
    >
      <svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true">
        {[4, 9, 14].map((y) => (
          <g key={y}><circle cx="3" cy={y} r="1.5" /><circle cx="9" cy={y} r="1.5" /></g>
        ))}
      </svg>
    </button>
  );
}
