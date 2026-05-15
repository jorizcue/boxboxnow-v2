from app.services.ranking.processor import effective_scores, RatedDriver, _ordered_candidates


def _rd(name, team_key, corrected_ms, team_pos):
    return RatedDriver(name=name, team_key=team_key,
                       corrected_avg_ms=corrected_ms, team_position=team_pos)


def test_effective_blends_team_and_pace_w07():
    field = [
        _rd("A", "t1", 60000.0, 3),  # slowest team result, fastest pace
        _rd("B", "t2", 62000.0, 1),  # best team result, slowest pace
        _rd("C", "t3", 61000.0, 2),
    ]
    scores = effective_scores(field, w=0.7)
    assert scores["B"] < scores["C"] < scores["A"]
    assert 0.0 <= min(scores.values()) and max(scores.values()) <= 1.0


def test_single_team_degrades_to_pace_order():
    field = [_rd("A", "t1", 61000.0, 1), _rd("B", "t1", 60000.0, 1)]
    scores = effective_scores(field, w=0.7)
    assert scores["B"] < scores["A"]  # pure pace when n_teams == 1


def test_all_none_team_position_degrades_to_pace():
    f = [RatedDriver("A", "t1", 61000.0, None),
         RatedDriver("B", "t2", 60000.0, None)]
    s = effective_scores(f, w=0.7)
    assert s["B"] < s["A"]  # pure pace when no positions


def test_empty_field_returns_empty_dict():
    assert effective_scores([], w=0.7) == {}


def test_conflicting_team_position_raises():
    import pytest
    f = [RatedDriver("A", "t1", 60000.0, 2),
         RatedDriver("B", "t1", 61000.0, 1)]
    with pytest.raises(ValueError):
        effective_scores(f, w=0.7)


def test_candidates_sorted_globally_by_date_then_circuit():
    cand = [("RKC_Paris", "2026-05-09"), ("Ariza", "2026-03-28"),
            ("Gensk", "2026-05-02"), ("Ariza", "2026-03-28")]
    assert _ordered_candidates(cand) == [
        ("Ariza", "2026-03-28"), ("Gensk", "2026-05-02"), ("RKC_Paris", "2026-05-09")]
