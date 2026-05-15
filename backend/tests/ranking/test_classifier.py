from app.services.ranking.classifier import classify_session, SessionClass


def test_race_keyword_french():
    c = classify_session("24 HEURES ESSEC", "24H ESSEC", duration_s=3600, had_driver_swap=True)
    assert c.session_type == "race"
    assert c.team_mode == "endurance"


def test_quali_keyword_is_pace_even_if_long():
    c = classify_session("24 HEURES ESSEC", "ESSAIS CHRONOS Q1", duration_s=1800, had_driver_swap=False)
    assert c.session_type == "pace"


def test_non_race_keyword_wins_over_race_keyword():
    c = classify_session("", "RACE CHRONOS", duration_s=1800, had_driver_swap=False)
    assert c.session_type == "pace"


def test_ambiguous_short_is_pace():
    c = classify_session("", "Session 7", duration_s=600, had_driver_swap=False)
    assert c.session_type == "pace"


def test_ambiguous_long_is_race_individual():
    c = classify_session("", "14. RACING - 11:20", duration_s=900, had_driver_swap=False)
    assert c.session_type == "race"
    assert c.team_mode == "individual"


def test_endurance_by_duration():
    c = classify_session("", "CARRERA", duration_s=3000, had_driver_swap=False)
    assert c.session_type == "race"
    assert c.team_mode == "endurance"  # >= 40 min


def test_spanish_practice():
    c = classify_session("FP3", "", duration_s=700, had_driver_swap=False)
    assert c.session_type == "pace"
