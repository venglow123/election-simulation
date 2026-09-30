import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeTagName } from "../utils/tags.js";
import TagChip from "./TagChip.jsx";

export default function TagInput({ tags, selectedIds, onAdd, onCreate, onRemove }) {
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);

  const selectedTags = selectedIds.map((id) => tags.find((tag) => tag.id === id)).filter(Boolean);

  const suggestions = useMemo(() => {
    const normalized = normalizeTagName(query);
    const matches = tags
      .filter((tag) => !selectedIds.includes(tag.id) && (!normalized || normalizeTagName(tag.name).includes(normalized)))
      .slice(0, 8)
      .map((tag) => ({ type: "existing", tag }));
    if (normalized && !tags.some((tag) => normalizeTagName(tag.name) === normalized)) {
      matches.push({ type: "create", name: query.trim() });
    }
    return matches;
  }, [tags, selectedIds, query]);

  useEffect(() => setHighlight(0), [query]);

  const open = isOpen && suggestions.length > 0;

  async function apply(item) {
    if (!item || busy) return;
    setQuery("");
    if (item.type === "create") {
      setBusy(true);
      try {
        await onCreate(item.name);
      } finally {
        setBusy(false);
      }
    } else {
      onAdd(item.tag.id);
    }
    inputRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (event.key === "Backspace" && !query && selectedTags.length) {
      onRemove(selectedTags[selectedTags.length - 1].id);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (open) apply(suggestions[highlight] || suggestions[0]);
      return;
    }
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((index) => (index + delta + suggestions.length) % suggestions.length);
    }
  }

  return (
    <div className="tag-input" onClick={() => inputRef.current?.focus()}>
      {selectedTags.map((tag) => (
        <TagChip key={tag.id} tag={tag} onRemove={() => onRemove(tag.id)} />
      ))}
      <div className="autocomplete tag-input-field">
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          aria-label="Ajouter un tag"
          aria-expanded={open}
          placeholder={selectedTags.length ? "" : "Ajouter un tag…"}
          value={query}
          disabled={busy}
          onChange={(event) => {
            setIsOpen(true);
            setQuery(event.target.value);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => setIsOpen(false)}
        />
        {open && (
          <ul className="autocomplete-list" role="listbox">
            {suggestions.map((item, index) => (
              <li key={item.type === "create" ? "create" : item.tag.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlight}
                  className={`autocomplete-option ${index === highlight ? "is-active" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => apply(item)}
                >
                  {item.type === "create" ? (
                    <span className="autocomplete-create">+ Créer « {item.name} »</span>
                  ) : (
                    <span className="tag-option">
                      <span className="tag-swatch" style={{ backgroundColor: item.tag.color }} />
                      {item.tag.name}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
