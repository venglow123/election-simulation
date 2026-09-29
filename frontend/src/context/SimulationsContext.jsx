import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api.js";

const SimulationsContext = createContext(null);

export function SimulationsProvider({ children }) {
  const [elections, setElections] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [activeElectionId, setActiveElectionId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [electionsLoaded, setElectionsLoaded] = useState(false);

  const refreshElections = useCallback(async () => {
    const data = await api.listElections();
    setElections(data);
    setElectionsLoaded(true);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    if (activeElectionId == null) {
      setSimulations([]);
      setLoaded(true);
      return [];
    }
    const data = await api.listSimulations(activeElectionId);
    setSimulations(data);
    setElections((current) => current.map((election) => (
      election.id === activeElectionId ? { ...election, scenarios_count: data.length } : election
    )));
    setLoaded(true);
    return data;
  }, [activeElectionId]);

  const selectElection = useCallback(async (electionId) => {
    const id = Number(electionId);
    setActiveElectionId(id);
    setLoaded(false);
    try {
      const data = await api.listSimulations(id);
      setSimulations(data);
      setElections((current) => current.map((election) => (
        election.id === id ? { ...election, scenarios_count: data.length } : election
      )));
      return data;
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refreshElections();
  }, [refreshElections]);

  return (
    <SimulationsContext.Provider
      value={{ elections, simulations, activeElectionId, refresh, refreshElections, selectElection, loaded, electionsLoaded }}
    >
      {children}
    </SimulationsContext.Provider>
  );
}

export function useSimulations() {
  const ctx = useContext(SimulationsContext);
  if (!ctx) throw new Error("useSimulations doit être utilisé dans un SimulationsProvider");
  return ctx;
}
