import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSimulations } from "../context/SimulationsContext.jsx";

export default function Home() {
  const { elections, electionsLoaded } = useSimulations();
  const navigate = useNavigate();

  useEffect(() => {
    if (electionsLoaded && elections.length > 0) {
      navigate(`/elections/${elections[0].id}`, { replace: true });
    }
  }, [electionsLoaded, elections, navigate]);

  if (!electionsLoaded || elections.length > 0) return null;

  return (
    <div className="empty-state">
      <div className="empty-state-icon">🗳️</div>
      <h1>Bienvenue</h1>
      <p>
        Créez votre première élection depuis le panneau de gauche pour y regrouper vos scénarios de simulation.
      </p>
    </div>
  );
}
