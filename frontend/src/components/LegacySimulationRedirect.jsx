import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";

export default function LegacySimulationRedirect() {
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    api.getSimulation(id).then((simulation) => {
      if (!cancelled) {
        navigate(`/elections/${simulation.election_id}/simulations/${simulation.id}`, { replace: true });
      }
    }).catch(() => {
      if (!cancelled) navigate("/", { replace: true });
    });
    return () => { cancelled = true; };
  }, [id, navigate]);

  return null;
}