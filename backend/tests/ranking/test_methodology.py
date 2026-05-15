from app.services.ranking.processor import effective_scores, RatedDriver


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
