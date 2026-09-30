import { electionApi } from "./api/elections.js";
import { hypothesisApi } from "./api/hypotheses.js";
import { simulationApi } from "./api/simulations.js";

export const api = { ...electionApi, ...hypothesisApi, ...simulationApi };
