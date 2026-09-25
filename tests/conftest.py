import pytest

from app import create_app
from app.extensions import db
from app.models import Candidate, Simulation, Transfer


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    application = create_app()
    application.config.update(TESTING=True)
    yield application
    with application.app_context():
        db.session.remove()


def create_simulation(total_inscrits, abstention_r1, candidates, abstention_transfers=(0, 0)):
    simulation = Simulation(
        name="Test",
        total_inscrits=total_inscrits,
        abstention_r1=abstention_r1,
        abstention_to_a=abstention_transfers[0],
        abstention_to_b=abstention_transfers[1],
    )
    db.session.add(simulation)
    db.session.flush()
    for name, pct_r1, pct_to_a, pct_to_b in candidates:
        candidate = Candidate(simulation_id=simulation.id, name=name, pct_r1=pct_r1)
        db.session.add(candidate)
        db.session.flush()
        db.session.add(Transfer(candidate_id=candidate.id, pct_to_a=pct_to_a, pct_to_b=pct_to_b))
    db.session.commit()
    return simulation


@pytest.fixture
def simulation_factory(app):
    with app.app_context():
        yield create_simulation
        db.session.rollback()
