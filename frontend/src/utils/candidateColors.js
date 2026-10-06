import { isValidTagColor } from "./tags.js";

export const CANDIDATE_PALETTE = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ac",
  "#1f77b4",
  "#8c564b",
];

export const FALLBACK_CANDIDATE_COLOR = "#94a3b8";
export const DEFAULT_ABSTENTION_COLOR = "#999999";

export function getAbstentionColor(election) {
  return isValidTagColor(election?.abstention_color) ? election.abstention_color : DEFAULT_ABSTENTION_COLOR;
}

export function isValidCandidateColor(value) {
  return isValidTagColor(value);
}

export function pickCandidateColor(usedColors) {
  const used = new Set(usedColors.filter(Boolean).map((color) => String(color).toLowerCase()));
  return CANDIDATE_PALETTE.find((color) => !used.has(color))
    ?? CANDIDATE_PALETTE[usedColors.length % CANDIDATE_PALETTE.length];
}

export function buildCandidateColorIndex(candidates = []) {
  return new Map(candidates
    .filter((candidate) => isValidCandidateColor(candidate.color))
    .map((candidate) => [candidate.name, candidate.color]));
}

// Réapplique les couleurs courantes du référentiel pour refléter un changement avant même sa sauvegarde.
export function applyCandidateColorsToSankey(sankey, simulation, colorByName, abstentionColor) {
  if (!sankey) return sankey;
  const nameByNodeId = new Map(simulation.candidates.map((candidate) => [`c${candidate.id}`, candidate.name]));
  if (simulation.finalist_a) nameByNodeId.set("fa", simulation.finalist_a.name);
  if (simulation.finalist_b) nameByNodeId.set("fb", simulation.finalist_b.name);
  const recolor = (node) => {
    const color = node.id === "abst1" || node.id === "abst2"
      ? abstentionColor
      : colorByName.get(nameByNodeId.get(node.id));
    return color ? { ...node, color } : node;
  };
  return { ...sankey, nodesLeft: sankey.nodesLeft.map(recolor), nodesRight: sankey.nodesRight.map(recolor) };
}
