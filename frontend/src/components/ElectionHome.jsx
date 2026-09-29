import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSimulations } from "../context/SimulationsContext.jsx";

export default function ElectionHome() {
  const { electionId } = useParams();
  const navigate = useNavigate();
  const { elections, simulations, activeElectionId, loaded } = useSimulations();
  const election = elections.find((item) => item.id === Number(electionId));

  useEffect(() => {
    if (activeElectionId === Number(electionId) && loaded && simulations.length > 0) {
      navigate(`/elections/${electionId}/simulations/${simulations[0].id}`, { replace: true });
    }
  }, [electionId, loaded, navigate, simulations]);

  if (!election || activeElectionId !== Number(electionId)) return null;
  if (!loaded || simulations.length > 0) return null;

  return (
    <div className="empty-state">
      <div className="empty-state-icon">🗳️</div>
      <h1>{election.name}</h1>
      <p>Aucun scénario dans cette élection. Créez-en un depuis le panneau de gauche.</p>
    </div>
  );
}