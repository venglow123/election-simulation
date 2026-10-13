export function reorderCandidates(candidates, order) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  if (!Array.isArray(order) || order.length !== candidates.length
    || new Set(order).size !== order.length || order.some((id) => !byId.has(id))) {
    throw new Error("L'ordre doit contenir chaque élément exactement une fois.");
  }
  return order.map((id) => byId.get(id));
}

export function moveCandidateToSlot(order, fromIndex, slot) {
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= order.length
    || !Number.isInteger(slot) || slot < 0 || slot > order.length) {
    throw new Error("La position de déplacement est invalide.");
  }
  const updated = [...order];
  const [id] = updated.splice(fromIndex, 1);
  updated.splice(slot > fromIndex ? slot - 1 : slot, 0, id);
  return updated;
}

export function inheritCandidateOrder(simulation, hypothesis) {
  const bySourceId = new Map(simulation.candidates
    .filter((candidate) => candidate.hypothesis_candidate_id != null)
    .map((candidate) => [candidate.hypothesis_candidate_id, candidate]));
  const inherited = hypothesis.candidates
    .map((candidate) => bySourceId.get(candidate.id))
    .filter(Boolean);
  const inheritedIds = new Set(inherited.map((candidate) => candidate.id));
  simulation.candidates = [
    ...inherited,
    ...simulation.candidates.filter((candidate) => !inheritedIds.has(candidate.id)),
  ];
}
