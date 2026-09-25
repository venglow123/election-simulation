from app.extensions import db
from app.models import Transfer

PALETTE = [
    "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
    "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
]


def ensure_transfer(candidate):
    """Crée un report par défaut (0% vers les finalistes, donc 100% abstention) si absent."""
    if candidate.transfer is None:
        transfer = Transfer(candidate_id=candidate.id, pct_to_a=0, pct_to_b=0)
        db.session.add(transfer)
        db.session.flush()
        candidate.transfer = transfer
    return candidate.transfer


def get_finalists(simulation):
    ordered = sorted(simulation.candidates, key=lambda c: c.pct_r1, reverse=True)
    return ordered[:2]


def compute_results(simulation):
    """Calcule les résultats du 2e tour à partir des reports de voix des candidats et des abstentionnistes."""
    candidates = list(simulation.candidates)
    for candidate in candidates:
        ensure_transfer(candidate)

    result = {"has_finalists": False, "warnings": []}

    total_pct_r1 = sum(c.pct_r1 for c in candidates)
    if candidates and abs(total_pct_r1 - 100) > 0.01:
        result["warnings"].append(
            f"La somme des pourcentages du 1er tour est de {total_pct_r1:.2f}% (attendu 100%)."
        )

    for candidate in candidates:
        transfer = candidate.transfer
        total_row = transfer.pct_to_a + transfer.pct_to_b
        if total_row > 100 + 0.01:
            result["warnings"].append(
                f"Report de « {candidate.name} » : {total_row:.2f}% répartis vers les finalistes (max 100%)."
            )

    abst_total = simulation.abstention_to_a + simulation.abstention_to_b
    if abst_total > 100 + 0.01:
        result["warnings"].append(
            f"Report des abstentionnistes du 1er tour : {abst_total:.2f}% répartis vers les finalistes (max 100%)."
        )

    ordered = sorted(candidates, key=lambda c: c.pct_r1, reverse=True)
    if len(ordered) < 2:
        return result

    finalist_a, finalist_b = ordered[0], ordered[1]
    result["has_finalists"] = True
    result["finalist_a"] = finalist_a
    result["finalist_b"] = finalist_b

    votes_a = 0.0
    votes_b = 0.0
    abstention_from_transfers = 0.0
    breakdown = []

    for candidate in candidates:
        transfer = candidate.transfer
        v_r1 = candidate.votes_r1
        v_a = v_r1 * transfer.pct_to_a / 100
        v_b = v_r1 * transfer.pct_to_b / 100
        v_abs = v_r1 * transfer.pct_to_abstention / 100
        votes_a += v_a
        votes_b += v_b
        abstention_from_transfers += v_abs
        breakdown.append({
            "candidate": candidate,
            "votes_r1": v_r1,
            "to_a": round(v_a),
            "to_b": round(v_b),
            "to_abstention": round(v_abs),
        })

    # Les abstentionnistes du 1er tour peuvent eux aussi voter au 2e tour.
    abstention_r1 = simulation.abstention_r1
    abst_to_a = abstention_r1 * simulation.abstention_to_a / 100
    abst_to_b = abstention_r1 * simulation.abstention_to_b / 100
    abst_stay = abstention_r1 * (100 - simulation.abstention_to_a - simulation.abstention_to_b) / 100

    votes_a += abst_to_a
    votes_b += abst_to_b

    votes_a = round(votes_a)
    votes_b = round(votes_b)
    abstention_r2 = round(abstention_from_transfers) + round(abst_stay)
    participation_r2 = simulation.total_inscrits - abstention_r2
    total_votes_r2 = votes_a + votes_b

    pct_a = votes_a / total_votes_r2 * 100 if total_votes_r2 else 0
    pct_b = votes_b / total_votes_r2 * 100 if total_votes_r2 else 0
    winner = finalist_a if votes_a >= votes_b else finalist_b

    result.update({
        "votes_a": votes_a,
        "votes_b": votes_b,
        "pct_a": pct_a,
        "pct_b": pct_b,
        "abstention_r2": abstention_r2,
        "participation_r2": participation_r2,
        "winner": winner,
        "breakdown": breakdown,
        "abst_to_a": round(abst_to_a),
        "abst_to_b": round(abst_to_b),
        "abst_stay": round(max(abst_stay, 0)),
    })
    return result


def build_sankey_data(simulation, results):
    """Construit les nœuds/liens du diagramme de Sankey (1er tour -> 2e tour)."""
    if not results.get("has_finalists"):
        return None

    candidates = list(simulation.candidates)
    nodes_left = []
    for index, candidate in enumerate(candidates):
        nodes_left.append({
            "id": f"c{candidate.id}",
            "label": f"{candidate.name} ({candidate.pct_r1:g}%)",
            "value": candidate.votes_r1,
            "color": PALETTE[index % len(PALETTE)],
        })
    nodes_left.append({
        "id": "abst1",
        "label": "Abstention 1er tour",
        "value": simulation.abstention_r1,
        "color": "#999999",
    })

    finalist_a = results["finalist_a"]
    finalist_b = results["finalist_b"]
    nodes_right = [
        {"id": "fa", "label": f"{finalist_a.name} (2e tour)", "value": results["votes_a"], "color": "#333333"},
        {"id": "fb", "label": f"{finalist_b.name} (2e tour)", "value": results["votes_b"], "color": "#333333"},
        {"id": "abst2", "label": "Abstention 2e tour", "value": results["abstention_r2"], "color": "#999999"},
    ]

    links = []
    for item in results["breakdown"]:
        candidate = item["candidate"]
        source = f"c{candidate.id}"
        if item["to_a"] > 0:
            links.append({"source": source, "target": "fa", "value": item["to_a"]})
        if item["to_b"] > 0:
            links.append({"source": source, "target": "fb", "value": item["to_b"]})
        if item["to_abstention"] > 0:
            links.append({"source": source, "target": "abst2", "value": item["to_abstention"]})

    if results["abst_to_a"] > 0:
        links.append({"source": "abst1", "target": "fa", "value": results["abst_to_a"]})
    if results["abst_to_b"] > 0:
        links.append({"source": "abst1", "target": "fb", "value": results["abst_to_b"]})
    if results["abst_stay"] > 0:
        links.append({"source": "abst1", "target": "abst2", "value": results["abst_stay"]})

    return {"nodesLeft": nodes_left, "nodesRight": nodes_right, "links": links}


def serialize_simulation(simulation):
    """Représentation JSON complète d'une simulation, consommée par le frontend React.

    Contient à la fois les champs bruts éditables (nom, %, reports…) et les valeurs
    calculées (voix, résultats du 2e tour, Sankey), afin que le client puisse tout
    afficher/éditer à partir d'une seule réponse.
    """
    results = compute_results(simulation)
    sankey = build_sankey_data(simulation, results)

    candidates_payload = [
        {
            "id": c.id,
            "name": c.name,
            "pct_r1": c.pct_r1,
            "votes_r1": c.votes_r1,
            "transfer": {
                "pct_to_a": c.transfer.pct_to_a,
                "pct_to_b": c.transfer.pct_to_b,
                "pct_to_abstention": round(c.transfer.pct_to_abstention, 2),
            },
        }
        for c in simulation.candidates
    ]

    payload = {
        "id": simulation.id,
        "name": simulation.name,
        "description": simulation.description,
        "position": simulation.position,
        "total_inscrits": simulation.total_inscrits,
        "abstention_r1": simulation.abstention_r1,
        "votants_r1": simulation.votants_r1,
        "abstention_to_a": simulation.abstention_to_a,
        "abstention_to_b": simulation.abstention_to_b,
        "abstention_stay_pct": round(100 - simulation.abstention_to_a - simulation.abstention_to_b, 2),
        "candidates": candidates_payload,
        "warnings": results["warnings"],
        "has_finalists": results["has_finalists"],
        "finalist_a": None,
        "finalist_b": None,
        "votes_a": None,
        "votes_b": None,
        "pct_a": None,
        "pct_b": None,
        "abstention_r2": None,
        "participation_r2": None,
        "winner_id": None,
        "sankey": sankey,
    }

    if results["has_finalists"]:
        payload.update({
            "finalist_a": {"id": results["finalist_a"].id, "name": results["finalist_a"].name},
            "finalist_b": {"id": results["finalist_b"].id, "name": results["finalist_b"].name},
            "votes_a": results["votes_a"],
            "votes_b": results["votes_b"],
            "pct_a": round(results["pct_a"], 2),
            "pct_b": round(results["pct_b"], 2),
            "abstention_r2": results["abstention_r2"],
            "participation_r2": results["participation_r2"],
            "winner_id": results["winner"].id,
        })

    return payload
