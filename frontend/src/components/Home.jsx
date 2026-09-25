import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSimulations } from "../context/SimulationsContext.jsx";

export default function Home() {
  const { simulations, loaded } = useSimulations();
  const navigate = useNavigate();

  useEffect(() => {
    if (loaded && simulations.length > 0) {
      navigate(`/simulations/${simulations[0].id}`, { replace: true });
    }
  }, [loaded, simulations, navigate]);

  if (!loaded || simulations.length > 0) return null;

  return (
    <div className="empty-state">
      <div className="empty-state-icon">🗳️</div>
      <h1>Bienvenue</h1>
      <p>
        Créez votre premier scénario de simulation depuis le panneau de gauche pour commencer à paramétrer un
        1er tour et explorer les reports de voix.
      </p>
    </div>
  );
}
