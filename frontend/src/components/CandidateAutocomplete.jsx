import { useEffect, useId, useMemo, useRef, useState } from "react";
import { moveGridFocus } from "../hooks/useGridNavigation.js";
import { normalizeCandidateName } from "../utils/candidateNames.js";

export default function CandidateAutocomplete({
  value,
  options,
  excludeNames = [],
  onChange,
  onEnterCommit,
  placeholder,
  ariaLabel,
  className = "",
  title,
  invalid = false,
  invalidAttempt = 0,
  invalidMessage,
  onInvalidAnimationEnd,
}) {
  const inputRef = useRef(null);
  const errorId = `candidate-error-${useId()}`;
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const suggestions = useMemo(() => {
    const query = normalizeCandidateName(value);
    const matches = options
      .filter((option) => !query || normalizeCandidateName(option.name).includes(query))
      .filter((option) => !excludeNames.some((name) => normalizeCandidateName(name) === normalizeCandidateName(option.name)))
      .slice(0, 8)
      .map((option) => ({ type: "existing", name: option.name, party: option.party }));
    if (
      query
      && !options.some((option) => normalizeCandidateName(option.name) === query)
      && !excludeNames.some((name) => normalizeCandidateName(name) === query)
    ) {
      matches.unshift({ type: "create", name: String(value).trim() });
    }
    return matches;
  }, [excludeNames, options, value]);

  useEffect(() => setHighlight(0), [value]);

  const open = isOpen && suggestions.length > 0;

  function apply(item) {
    setIsOpen(false);
    onChange(item.name);
    return item.name;
  }

  function handleKeyDown(event) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((index) => (index + delta + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const name = apply(suggestions[highlight] || suggestions[0]);
      const moved = moveGridFocus(event.target, 1, 0);
      if (!moved && onEnterCommit) onEnterCommit(name);
    } else if (event.key === "Tab" && !event.shiftKey) {
      event.stopPropagation();
      apply(suggestions[highlight] || suggestions[0]);
    }
  }

  return (
    <div className={`autocomplete ${className}`} title={title}>
      <input
        ref={inputRef}
        type="text"
        className={`grid-input ${invalidAttempt ? `candidate-invalid-${invalidAttempt % 2 ? "a" : "b"}` : ""}`}
        autoComplete="off"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={invalidMessage ? errorId : undefined}
        aria-expanded={open}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          setIsOpen(true);
          onChange(event.target.value);
        }}
        onKeyDownCapture={handleKeyDown}
        onAnimationEnd={(event) => {
          if (event.animationName.startsWith("candidate-invalid-fade-")) onInvalidAnimationEnd?.();
        }}
        onBlur={() => setIsOpen(false)}
      />
      {invalidMessage && <span id={errorId} className="candidate-input-error" role="tooltip">{invalidMessage}</span>}
      {open && (
        <ul className="autocomplete-list" role="listbox">
          {suggestions.map((item, index) => (
            <li key={`${item.type}-${item.name}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                className={`autocomplete-option ${index === highlight ? "is-active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => {
                  apply(item);
                  inputRef.current?.focus();
                }}
              >
                {item.type === "create" ? (
                  <span className="autocomplete-create">+ {item.name}</span>
                ) : (
                  <>
                    <span>{item.name}</span>
                    {item.party && <span className="autocomplete-party">{item.party}</span>}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}