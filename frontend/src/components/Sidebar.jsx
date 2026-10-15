import { useEffect, useState } from "react";
import { NavLink, useLocation, useMatch, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useSimulations } from "../context/SimulationsContext.jsx";
import SidebarSection from "./SidebarSection.jsx";
import WorkspaceSelector from "./WorkspaceSelector.jsx";

export default function Sidebar() {
  const { simulations, refresh, selectElection } = useSimulations();
  const electionWildcardMatch = useMatch("/elections/:electionId/*");
  const electionExactMatch = useMatch("/elections/:electionId");
  const electionMatch = electionWildcardMatch || electionExactMatch;
  const simulationMatch = useMatch("/elections/:electionId/simulations/:simulationId");
  const electionId = Number(electionMatch?.params.electionId) || null;
  const simulationId = simulationMatch?.params.simulationId;
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => setIsOpen(false), [location.pathname]);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 900px)");
    function scrollPosition() {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      return Math.max(0, Math.min(window.scrollY, maxScroll));
    }
    let previousY = scrollPosition();
    setIsHidden(false);

    function handleScroll() {
      const nextY = scrollPosition();
      if (!mobile.matches || isOpen || nextY === 0) {
        setIsHidden(false);
      } else if (nextY !== previousY) {
        setIsHidden(nextY > previousY);
      }
      previousY = nextY;
    }

    function handleResize() {
      previousY = scrollPosition();
      setIsHidden(false);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen, location.pathname]);

  useEffect(() => {
    if (electionId) selectElection(electionId).catch(() => navigate("/", { replace: true }));
  }, [electionId, selectElection, navigate]);

  async function handleCreate() {
    if (!electionId) return;
    const sim = await api.createSimulation(electionId, "Nouveau scénario");
    await refresh();
    navigate(`/elections/${electionId}/simulations/${sim.id}`, { state: { focusTitle: true } });
  }

  async function handleDelete(simId, name) {
    if (!confirm(`Supprimer « ${name} » ?`)) return;
    await api.deleteSimulation(simId);
    await refresh();
    if (String(simId) === simulationId) navigate(`/elections/${electionId}`);
  }

  async function handleReorder(order) {
    await api.reorderSimulations(electionId, order);
    await refresh();
  }

  return (
    <aside
      className={`sidebar${isHidden && !isOpen ? " is-scroll-hidden" : ""}`}
      onFocusCapture={() => setIsHidden(false)}
    >
      <button
        type="button"
        className="mobile-navigation-toggle"
        aria-expanded={isOpen}
        aria-controls="sidebar-navigation"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>Élections & scénarios</span>
        <span>{isOpen ? "Fermer −" : "Menu +"}</span>
      </button>
      <div
        id="sidebar-navigation"
        className={`sidebar-content${isOpen ? " is-open" : ""}`}
        onClick={(event) => {
          if (event.target.closest("a")) setIsOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            setIsOpen(false);
            event.currentTarget.previousElementSibling.focus();
          }
        }}
      >
      <WorkspaceSelector selectedElectionId={electionId} />

      <SidebarSection
        title="Scénarios"
        items={simulations}
        getItemKey={(sim) => sim.id}
        getItemLabel={(sim) => sim.name}
        itemClassName={(sim) => `sim-tab ${String(sim.id) === simulationId ? "active" : ""}`}
        handleClassName="sim-tab-handle"
        scopeKey={electionId}
        onReorder={handleReorder}
        emptyMessage="Aucun scénario pour l'instant."
        listClassName="sim-tabs"
        emptyClassName="sim-tabs-empty"
        actions={
          <button
            type="button"
            className="sidebar-icon-button"
            data-tooltip="Nouveau scénario"
            aria-label="Nouveau scénario"
            onClick={handleCreate}
            disabled={!electionId}
          >
            +
          </button>
        }
        renderItem={(sim) => (
          <>
            <NavLink to={`/elections/${electionId}/simulations/${sim.id}`} className="sim-tab-link" draggable={false}>
              <span className="sim-tab-name">{sim.name}</span>
              <span className="sim-tab-meta" title={`${sim.candidates_count} candidat${sim.candidates_count !== 1 ? "s" : ""}`}>
                {sim.candidates_count}
              </span>
            </NavLink>
            <div className="sim-tab-delete">
              <button type="button" onClick={() => handleDelete(sim.id, sim.name)} title="Supprimer">
                ✕
              </button>
            </div>
          </>
        )}
      />
      <footer className="sidebar-version" aria-label={`Version ${__APP_VERSION__}`}>
        v{__APP_VERSION__.replace(/^v/, "")}
      </footer>
      </div>
    </aside>
  );
}
