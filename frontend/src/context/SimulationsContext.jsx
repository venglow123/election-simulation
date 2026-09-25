import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api.js";

const SimulationsContext = createContext(null);

export function SimulationsProvider({ children }) {
  const [simulations, setSimulations] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const data = await api.listSimulations();
    setSimulations(data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SimulationsContext.Provider value={{ simulations, refresh, loaded }}>{children}</SimulationsContext.Provider>
  );
}

export function useSimulations() {
  const ctx = useContext(SimulationsContext);
  if (!ctx) throw new Error("useSimulations doit être utilisé dans un SimulationsProvider");
  return ctx;
}
