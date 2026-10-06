import { useCandidateColors } from "../context/CandidateColorsContext.jsx";
import { FALLBACK_CANDIDATE_COLOR } from "../utils/candidateColors.js";

export function CandidateColorDot({ name, editable = true }) {
  const { colorOf, setColor } = useCandidateColors();
  const candidateName = String(name || "").trim();
  const knownColor = colorOf(candidateName);
  const color = knownColor || FALLBACK_CANDIDATE_COLOR;

  if (!candidateName || !setColor || !editable) {
    const shown = editable ? candidateName : knownColor;
    return (
      <span
        className={`candidate-dot ${shown ? "" : "is-empty"}`}
        style={shown ? { backgroundColor: color } : undefined}
        aria-hidden="true"
      />
    );
  }

  return (
    <label className="candidate-dot is-editable" style={{ backgroundColor: color }} title={`Changer la couleur de ${candidateName}`}>
      <input
        type="color"
        className="candidate-dot-input"
        value={color}
        aria-label={`Couleur de ${candidateName}`}
        onChange={(event) => setColor(candidateName, event.target.value)}
      />
    </label>
  );
}

export function AbstentionColorDot() {
  const { abstentionColor, setAbstentionColor } = useCandidateColors();
  if (!setAbstentionColor) {
    return <span className="candidate-dot" style={{ backgroundColor: abstentionColor }} aria-hidden="true" />;
  }
  return (
    <label className="candidate-dot is-editable" style={{ backgroundColor: abstentionColor }} title="Changer la couleur des abstentionnistes">
      <input
        type="color"
        className="candidate-dot-input"
        value={abstentionColor}
        aria-label="Couleur des abstentionnistes"
        onChange={(event) => setAbstentionColor(event.target.value)}
      />
    </label>
  );
}

export function Abstention({ children, className = "" }) {
  return (
    <span className={`candidate ${className}`}>
      <AbstentionColorDot />
      {children}
    </span>
  );
}

/** Affichage standard d'un candidat dans les tableaux : pastille de couleur (cliquable) + nom ou champ d'édition. */
export default function Candidate({ name, editable = true, children, className = "" }) {
  return (
    <span className={`candidate ${className}`}>
      <CandidateColorDot name={name} editable={editable} />
      {children ?? <span className="candidate-name">{name}</span>}
    </span>
  );
}
