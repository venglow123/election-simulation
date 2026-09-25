import math
from datetime import datetime

from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import Candidate, Simulation, Transfer
from app.services import ensure_transfer, serialize_simulation
from app.utils import to_float, to_int

bp = Blueprint("api", __name__, url_prefix="/api")


def _json_body():
    return request.get_json(silent=True) or {}


def _validate_import_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError("Le payload doit être un objet JSON.")
    if payload.get("format") != "report-voix-elections/scenario":
        raise ValueError("Le format du scénario est inconnu.")
    if payload.get("version") != 1:
        raise ValueError("La version du scénario n'est pas prise en charge.")

    scenario = payload.get("scenario")
    if not isinstance(scenario, dict):
        raise ValueError("Les données du scénario sont absentes.")

    name = scenario.get("name")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 200:
        raise ValueError("Le nom du scénario est invalide.")
    description = scenario.get("description", "")
    if not isinstance(description, str) or len(description) > 5000:
        raise ValueError("La description du scénario est invalide.")

    def finite_number(value, label, maximum=100):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"{label} doit être un nombre fini.")
        if value < 0 or value > maximum:
            raise ValueError(f"{label} doit être compris entre 0 et {maximum}.")
        return float(value)

    total_inscrits = scenario.get("total_inscrits")
    abstention_r1 = scenario.get("abstention_r1")
    if isinstance(total_inscrits, bool) or not isinstance(total_inscrits, int) or total_inscrits < 0 or total_inscrits > 2_000_000_000:
        raise ValueError("Le nombre d'inscrits est invalide.")
    if isinstance(abstention_r1, bool) or not isinstance(abstention_r1, int) or abstention_r1 < 0 or abstention_r1 > total_inscrits:
        raise ValueError("L'abstention du 1er tour est invalide.")

    abstention_to_a = finite_number(scenario.get("abstention_to_a"), "Le report des abstentionnistes vers A")
    abstention_to_b = finite_number(scenario.get("abstention_to_b"), "Le report des abstentionnistes vers B")
    if abstention_to_a + abstention_to_b > 100.000001:
        raise ValueError("Les reports des abstentionnistes dépassent 100%.")

    candidates = scenario.get("candidates")
    if not isinstance(candidates, list) or len(candidates) > 100:
        raise ValueError("La liste des candidats est invalide.")
    clean_candidates = []
    for index, candidate in enumerate(candidates, start=1):
        if not isinstance(candidate, dict):
            raise ValueError(f"Le candidat {index} est invalide.")
        candidate_name = candidate.get("name")
        if not isinstance(candidate_name, str) or not candidate_name.strip() or len(candidate_name.strip()) > 200:
            raise ValueError(f"Le nom du candidat {index} est invalide.")
        pct_r1 = finite_number(candidate.get("pct_r1"), f"Le pourcentage T1 du candidat {index}")
        pct_to_a = finite_number(candidate.get("pct_to_a"), f"Le report vers A du candidat {index}")
        pct_to_b = finite_number(candidate.get("pct_to_b"), f"Le report vers B du candidat {index}")
        if pct_to_a + pct_to_b > 100.000001:
            raise ValueError(f"Les reports du candidat {index} dépassent 100%.")
        clean_candidates.append({
            "name": candidate_name.strip(),
            "pct_r1": pct_r1,
            "pct_to_a": pct_to_a,
            "pct_to_b": pct_to_b,
        })

    return {
        "name": name.strip(),
        "description": description,
        "total_inscrits": total_inscrits,
        "abstention_r1": abstention_r1,
        "abstention_to_a": abstention_to_a,
        "abstention_to_b": abstention_to_b,
        "candidates": clean_candidates,
    }


@bp.get("/simulations")
def list_simulations():
    sims = Simulation.query.order_by(Simulation.position, Simulation.id).all()
    return jsonify([
        {
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "position": s.position,
            "candidates_count": len(s.candidates),
        }
        for s in sims
    ])


@bp.post("/simulations")
def create_simulation():
    data = _json_body()
    name = (data.get("name") or "").strip() or "Nouvelle simulation"
    max_position = db.session.query(db.func.max(Simulation.position)).scalar() or 0
    simulation = Simulation(name=name, total_inscrits=1000, abstention_r1=0, position=max_position + 1)
    db.session.add(simulation)
    db.session.commit()
    return jsonify(serialize_simulation(simulation)), 201


@bp.post("/simulations/import")
def import_simulation():
    payload = _json_body().get("payload")
    try:
        scenario = _validate_import_payload(payload)
        date_suffix = f" ({datetime.now().strftime('%y%m%d')})"
        imported_name = f"{scenario['name'][:200 - len(date_suffix)]}{date_suffix}"
        max_position = db.session.query(db.func.max(Simulation.position)).scalar() or 0
        simulation = Simulation(
            name=imported_name,
            description=scenario["description"],
            total_inscrits=scenario["total_inscrits"],
            abstention_r1=scenario["abstention_r1"],
            abstention_to_a=scenario["abstention_to_a"],
            abstention_to_b=scenario["abstention_to_b"],
            position=max_position + 1,
        )
        db.session.add(simulation)
        db.session.flush()
        for item in scenario["candidates"]:
            candidate = Candidate(
                simulation_id=simulation.id,
                name=item["name"],
                pct_r1=item["pct_r1"],
            )
            db.session.add(candidate)
            db.session.flush()
            db.session.add(Transfer(
                candidate_id=candidate.id,
                pct_to_a=item["pct_to_a"],
                pct_to_b=item["pct_to_b"],
            ))
        db.session.commit()
    except ValueError as error:
        db.session.rollback()
        return jsonify({"error": "invalid_payload", "message": str(error)}), 400
    except Exception:
        db.session.rollback()
        raise

    return jsonify(serialize_simulation(simulation)), 201


@bp.post("/simulations/reorder")
def reorder_simulations():
    data = _json_body()
    for index, sim_id in enumerate(data.get("order", [])):
        Simulation.query.filter_by(id=sim_id).update({"position": index})
    db.session.commit()
    return jsonify({"status": "ok"})


@bp.get("/simulations/<int:simulation_id>")
def get_simulation(simulation_id):
    simulation = Simulation.query.get_or_404(simulation_id)
    return jsonify(serialize_simulation(simulation))


@bp.patch("/simulations/<int:simulation_id>")
def update_simulation(simulation_id):
    simulation = Simulation.query.get_or_404(simulation_id)
    data = _json_body()

    if "name" in data:
        name = (data.get("name") or "").strip()
        if name:
            simulation.name = name
    if "description" in data:
        simulation.description = (data.get("description") or "").strip()
    if "total_inscrits" in data:
        simulation.total_inscrits = max(to_int(data.get("total_inscrits"), simulation.total_inscrits), 0)
    if "abstention_r1" in data:
        simulation.abstention_r1 = min(
            max(to_int(data.get("abstention_r1"), simulation.abstention_r1), 0), simulation.total_inscrits
        )

    db.session.commit()
    return jsonify(serialize_simulation(simulation))


@bp.post("/simulations/<int:simulation_id>/duplicate")
def duplicate_simulation(simulation_id):
    original = Simulation.query.get_or_404(simulation_id)
    max_position = db.session.query(db.func.max(Simulation.position)).scalar() or 0
    copy = Simulation(
        name=f"{original.name} (copie)",
        description=original.description,
        total_inscrits=original.total_inscrits,
        abstention_r1=original.abstention_r1,
        abstention_to_a=original.abstention_to_a,
        abstention_to_b=original.abstention_to_b,
        position=max_position + 1,
    )
    db.session.add(copy)
    db.session.flush()

    for candidate in original.candidates:
        new_candidate = Candidate(simulation_id=copy.id, name=candidate.name, pct_r1=candidate.pct_r1)
        db.session.add(new_candidate)
        db.session.flush()
        if candidate.transfer is not None:
            db.session.add(Transfer(
                candidate_id=new_candidate.id,
                pct_to_a=candidate.transfer.pct_to_a,
                pct_to_b=candidate.transfer.pct_to_b,
            ))

    db.session.commit()
    return jsonify(serialize_simulation(copy)), 201


@bp.delete("/simulations/<int:simulation_id>")
def delete_simulation(simulation_id):
    simulation = Simulation.query.get_or_404(simulation_id)
    db.session.delete(simulation)
    db.session.commit()
    return jsonify({"status": "ok"})


@bp.post("/simulations/<int:simulation_id>/candidates")
def add_candidate(simulation_id):
    simulation = Simulation.query.get_or_404(simulation_id)
    data = _json_body()
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name_required"}), 400

    candidate = Candidate(simulation_id=simulation.id, name=name, pct_r1=to_float(data.get("pct_r1"), 0.0))
    db.session.add(candidate)
    db.session.flush()
    ensure_transfer(candidate)
    db.session.commit()

    state = serialize_simulation(simulation)
    state["new_candidate_id"] = candidate.id
    return jsonify(state), 201


@bp.patch("/simulations/<int:simulation_id>/candidates/<int:candidate_id>")
def update_candidate(simulation_id, candidate_id):
    candidate = Candidate.query.filter_by(id=candidate_id, simulation_id=simulation_id).first_or_404()
    data = _json_body()

    if "name" in data:
        name = (data.get("name") or "").strip()
        if name:
            candidate.name = name
    if "pct_r1" in data:
        candidate.pct_r1 = max(to_float(data.get("pct_r1"), candidate.pct_r1), 0.0)

    db.session.commit()
    return jsonify(serialize_simulation(candidate.simulation))


@bp.delete("/simulations/<int:simulation_id>/candidates/<int:candidate_id>")
def delete_candidate(simulation_id, candidate_id):
    candidate = Candidate.query.filter_by(id=candidate_id, simulation_id=simulation_id).first_or_404()
    simulation = candidate.simulation
    db.session.delete(candidate)
    db.session.commit()
    return jsonify(serialize_simulation(simulation))


@bp.patch("/simulations/<int:simulation_id>/transfers/<int:candidate_id>")
def update_transfer(simulation_id, candidate_id):
    candidate = Candidate.query.filter_by(id=candidate_id, simulation_id=simulation_id).first_or_404()
    transfer = ensure_transfer(candidate)
    data = _json_body()

    if "pct_to_a" in data:
        transfer.pct_to_a = max(to_float(data.get("pct_to_a"), transfer.pct_to_a), 0.0)
    if "pct_to_b" in data:
        transfer.pct_to_b = max(to_float(data.get("pct_to_b"), transfer.pct_to_b), 0.0)

    db.session.commit()
    return jsonify(serialize_simulation(candidate.simulation))


@bp.patch("/simulations/<int:simulation_id>/abstention-transfer")
def update_abstention_transfer(simulation_id):
    simulation = Simulation.query.get_or_404(simulation_id)
    data = _json_body()

    if "pct_to_a" in data:
        simulation.abstention_to_a = max(to_float(data.get("pct_to_a"), simulation.abstention_to_a), 0.0)
    if "pct_to_b" in data:
        simulation.abstention_to_b = max(to_float(data.get("pct_to_b"), simulation.abstention_to_b), 0.0)

    db.session.commit()
    return jsonify(serialize_simulation(simulation))
