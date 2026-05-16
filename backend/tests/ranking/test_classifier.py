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


def test_spanish_clasificacion_is_pace_even_with_duration_in_title():
    c = classify_session("12H LOS SANTOS", "Clasificación", duration_s=1195, had_driver_swap=False)
    assert c.session_type == "pace"

def test_accentless_and_italian_quali_is_pace():
    assert classify_session("GP", "CLASIFICACION", duration_s=1200, had_driver_swap=False).session_type == "pace"
    assert classify_session("Gara", "Classifica", duration_s=1200, had_driver_swap=False).session_type == "pace"
    assert classify_session("X", "Qualifying", duration_s=1200, had_driver_swap=False).session_type == "pace"

def test_real_race_still_race():
    assert classify_session("12H LOS SANTOS", "CARRERA", duration_s=38803, had_driver_swap=True).session_type == "race"
    assert classify_session("Club", "FINAL", duration_s=900, had_driver_swap=False).session_type == "race"

def test_existing_nonrace_unchanged():
    assert classify_session("X", "ESSAIS LIBRES", duration_s=900, had_driver_swap=False).session_type == "pace"
    assert classify_session("X", "Q1", duration_s=900, had_driver_swap=False).session_type == "pace"
