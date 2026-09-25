import pytest

from app.services import build_sankey_data, compute_results, get_finalists


def test_r1_votes_and_finalists_are_calculated_from_voters(simulation_factory):
    simulation = simulation_factory(
        1000,
        100,
        [
            ("Alice", 55, 0, 0),
            ("Bob", 30, 0, 0),
            ("Carla", 15, 0, 0),
        ],
    )

    finalists = get_finalists(simulation)

    assert [candidate.name for candidate in finalists] == ["Alice", "Bob"]
    assert [candidate.votes_r1 for candidate in simulation.candidates] == [495, 270, 135]


def test_compute_results_includes_candidate_reports_and_abstention_remobilization(simulation_factory):
    simulation = simulation_factory(
        1000,
        100,
        [
            ("Alice", 60, 80, 10),
            ("Bob", 30, 20, 70),
            ("Carla", 10, 0, 50),
        ],
        abstention_transfers=(10, 20),
    )

    result = compute_results(simulation)

    assert result["votes_a"] == 496
    assert result["votes_b"] == 308
    assert result["abstention_r2"] == 196
    assert result["participation_r2"] == 804
    assert result["winner"].name == "Alice"
    assert result["pct_a"] == pytest.approx(100 * 496 / 804)
    assert result["pct_b"] == pytest.approx(100 * 308 / 804)
    assert result["abst_to_a"] == 10
    assert result["abst_to_b"] == 20
    assert result["abst_stay"] == 70


def test_compute_results_keeps_unmobilized_abstention_as_abstention(simulation_factory):
    simulation = simulation_factory(
        1000,
        100,
        [
            ("Alice", 50, 0, 0),
            ("Bob", 50, 0, 0),
        ],
        abstention_transfers=(25, 35),
    )

    result = compute_results(simulation)

    assert result["votes_a"] == 25
    assert result["votes_b"] == 35
    assert result["abstention_r2"] == 940
    assert result["participation_r2"] == 60


def test_compute_results_reports_invalid_percentage_sums(simulation_factory):
    simulation = simulation_factory(
        1000,
        100,
        [
            ("Alice", 60, 80, 30),
            ("Bob", 30, 0, 0),
        ],
        abstention_transfers=(70, 40),
    )

    result = compute_results(simulation)

    assert len(result["warnings"]) == 3
    assert any("1er tour" in warning for warning in result["warnings"])
    assert any("Alice" in warning for warning in result["warnings"])
    assert any("abstentionnistes" in warning for warning in result["warnings"])


def test_compute_results_has_no_second_round_with_one_candidate(simulation_factory):
    simulation = simulation_factory(1000, 100, [("Alice", 100, 0, 0)])

    result = compute_results(simulation)

    assert result["has_finalists"] is False
    assert "votes_a" not in result
    assert simulation.candidates[0].transfer is not None


def test_sankey_links_reconcile_with_second_round_nodes(simulation_factory):
    simulation = simulation_factory(
        1000,
        100,
        [
            ("Alice", 60, 80, 10),
            ("Bob", 30, 20, 70),
            ("Carla", 10, 0, 50),
        ],
        abstention_transfers=(10, 20),
    )
    result = compute_results(simulation)
    sankey = build_sankey_data(simulation, result)

    links_by_target = {}
    for link in sankey["links"]:
        links_by_target[link["target"]] = links_by_target.get(link["target"], 0) + link["value"]

    assert len(sankey["nodesLeft"]) == 4
    assert [node["id"] for node in sankey["nodesRight"]] == ["fa", "fb", "abst2"]
    assert links_by_target["fa"] == result["votes_a"]
    assert links_by_target["fb"] == result["votes_b"]
    assert links_by_target["abst2"] == result["abstention_r2"]
