import { useEffect, useRef } from "react";

export default function ScenarioHeader({ simulation, onFieldChange, onDuplicate, onShare, autoFocusTitle, onTitleFocused }) {
  const titleRef = useRef(null);

  useEffect(() => {
    if (!autoFocusTitle || !titleRef.current) return;
    titleRef.current.focus();
    titleRef.current.select();
    onTitleFocused?.();
  }, [autoFocusTitle, onTitleFocused]);

  return (
    <header className="scenario-header">
      <div className="scenario-title-row">
        <div className="scenario-meta-form">
          <input
            ref={titleRef}
            type="text"
            className="scenario-title-input"
            placeholder="Nom du scénario"
            value={simulation.name}
            onChange={(e) => onFieldChange("name", e.target.value)}
          />
          <textarea
            className="scenario-description-input"
            rows={2}
            placeholder="Ajoutez une description à ce scénario (hypothèses, contexte…)"
            value={simulation.description}
            onChange={(e) => onFieldChange("description", e.target.value)}
          />
        </div>
        <div className="scenario-duplicate-form">
          <button type="button" className="btn-ghost" onClick={onShare}>
            ↗ Partager
          </button>
          <button type="button" className="btn-ghost" onClick={onDuplicate}>
            ⧉ Dupliquer
          </button>
        </div>
      </div>
    </header>
  );
}
