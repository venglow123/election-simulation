export default function SettingsPanel({ simulation, onFieldChange }) {
  return (
    <div className="panel">
      <h2>Paramètres</h2>
      <form className="settings-form" onSubmit={(e) => e.preventDefault()}>
        <label>
          Inscrits (total)
          <input
            type="text"
            inputMode="numeric"
            value={simulation.total_inscrits}
            onChange={(e) => onFieldChange("total_inscrits", e.target.value)}
          />
        </label>
        <label>
          Abstention (1er tour)
          <input
            type="text"
            inputMode="numeric"
            value={simulation.abstention_r1}
            onChange={(e) => onFieldChange("abstention_r1", e.target.value)}
          />
        </label>
        <span className="hint">
          Votants 1er tour : <strong>{simulation.votants_r1}</strong>
        </span>
      </form>
    </div>
  );
}
