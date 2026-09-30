import { getTagTextColor } from "../utils/tags.js";

export default function TagChip({ tag, onRemove, onClick, title }) {
  const style = { backgroundColor: tag.color, color: getTagTextColor(tag.color) };

  if (onClick) {
    return (
      <button
        type="button"
        className="tag-chip tag-chip-button"
        style={{ borderColor: tag.color }}
        onClick={onClick}
        title={title}
      >
        <span className="tag-swatch" style={{ backgroundColor: tag.color }} />
        {tag.name}
      </button>
    );
  }

  return (
    <span className="tag-chip" style={style} title={title}>
      <span>{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          className="tag-chip-remove"
          aria-label={`Retirer le tag ${tag.name}`}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </span>
  );
}
