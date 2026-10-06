import { createContext, useCallback, useContext, useMemo } from "react";
import { api } from "../api.js";
import { debounceByKey } from "../utils/debounceByKey.js";
import { buildCandidateColorIndex, DEFAULT_ABSTENTION_COLOR } from "../utils/candidateColors.js";

const SAVE_DELAY = 150;

const CandidateColorsContext = createContext({
  colorOf: () => null,
  setColor: null,
  abstentionColor: DEFAULT_ABSTENTION_COLOR,
  setAbstentionColor: null,
});

export function CandidateColorsProvider({
  electionId,
  candidates,
  onCandidatesChange,
  abstentionColor = DEFAULT_ABSTENTION_COLOR,
  onAbstentionColorChange,
  onError,
  children,
}) {
  const colorByName = useMemo(() => buildCandidateColorIndex(candidates), [candidates]);

  const setColor = useCallback((name, color) => {
    const candidateName = String(name || "").trim();
    if (!candidateName) return;
    onCandidatesChange((current) => (
      current.some((candidate) => candidate.name === candidateName)
        ? current.map((candidate) => (candidate.name === candidateName ? { ...candidate, color } : candidate))
        : [...current, { id: `pending:${candidateName}`, name: candidateName, party: "", color, usage_count: 0 }]
    ));
    debounceByKey(`candidate-color:${electionId}:${candidateName}`, () => (
      api.setElectionCandidateColor(electionId, candidateName, color)
        .then((list) => onCandidatesChange(() => list))
        .catch((error) => onError?.(error))
    ), SAVE_DELAY);
  }, [electionId, onCandidatesChange, onError]);

  const setAbstentionColor = useMemo(() => (onAbstentionColorChange ? (color) => {
    onAbstentionColorChange(color);
    debounceByKey(`abstention-color:${electionId}`, () => (
      api.setElectionAbstentionColor(electionId, color).catch((error) => onError?.(error))
    ), SAVE_DELAY);
  } : null), [electionId, onAbstentionColorChange, onError]);

  const value = useMemo(() => ({
    colorOf: (name) => colorByName.get(String(name || "").trim()) || null,
    setColor,
    abstentionColor,
    setAbstentionColor,
  }), [colorByName, setColor, abstentionColor, setAbstentionColor]);

  return <CandidateColorsContext.Provider value={value}>{children}</CandidateColorsContext.Provider>;
}

export function useCandidateColors() {
  return useContext(CandidateColorsContext);
}
