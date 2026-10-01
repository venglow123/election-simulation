import { electionApi } from "./api/elections.js";
import { hypothesisApi } from "./api/hypotheses.js";
import { simulationApi } from "./api/simulations.js";
import { transferHypothesisApi } from "./api/transferHypotheses.js";

export const api = { ...electionApi, ...hypothesisApi, ...transferHypothesisApi, ...simulationApi };
