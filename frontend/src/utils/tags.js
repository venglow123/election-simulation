export const TAG_PALETTE = [
  "#2563eb",
  "#db2777",
  "#16a34a",
  "#ea580c",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
  "#dc2626",
  "#4f46e5",
  "#059669",
  "#9333ea",
  "#64748b",
];

export function normalizeTagName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isValidTagColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ""));
}

export function pickTagColor(usedColors) {
  const used = new Set(usedColors.map((color) => String(color).toLowerCase()));
  return TAG_PALETTE.find((color) => !used.has(color)) ?? TAG_PALETTE[usedColors.length % TAG_PALETTE.length];
}

export function getTagTextColor(hex) {
  if (!isValidTagColor(hex)) return "#ffffff";
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  // Luminance perçue (ITU-R BT.601) : texte sombre sur les couleurs claires.
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111827" : "#ffffff";
}

export function filterHypothesesByTags(hypotheses, selectedTagIds) {
  return hypotheses.filter((hypothesis) => selectedTagIds.every((id) => (hypothesis.tag_ids || []).includes(id)));
}

export function getRefinementTags(tags, hypotheses, selectedTagIds) {
  const present = new Set(hypotheses.flatMap((hypothesis) => hypothesis.tag_ids || []));
  return tags.filter((tag) => present.has(tag.id) && !selectedTagIds.includes(tag.id));
}
