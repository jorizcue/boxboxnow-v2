from app.engine.state import RaceStateManager, KartState


def _mk(row, num, *, pit="racing", best=(0, 0, 0), cur=(0, 0, 0)):
    k = KartState(row_id=row, kart_number=num)
    k.pit_status = pit
    k.best_s1_ms, k.best_s2_ms, k.best_s3_ms = best
    k.current_s1_ms, k.current_s2_ms, k.current_s3_ms = cur
    return k


def _state(karts):
    s = RaceStateManager()
    for k in karts:
        s.karts[k.row_id] = k
    return s


def test_best_variant_unchanged_default_arg():
    s = _state([
        _mk("r1", 7, best=(30000, 0, 0), cur=(31000, 0, 0)),
        _mk("r2", 9, best=(29500, 0, 0), cur=(40000, 0, 0)),
    ])
    meta = s._compute_sector_meta()
    assert meta["s1"]["bestMs"] == 29500
    assert meta["s1"]["kartNumber"] == 9
    assert meta["s1"]["secondBestMs"] == 30000


def test_current_variant_ranks_by_current_ms():
    s = _state([
        _mk("r1", 7, best=(30000, 0, 0), cur=(31000, 0, 0)),
        _mk("r2", 9, best=(29500, 0, 0), cur=(40000, 0, 0)),
    ])
    meta = s._compute_sector_meta(source="current")
    assert meta["s1"]["bestMs"] == 31000
    assert meta["s1"]["kartNumber"] == 7
    assert meta["s1"]["secondBestMs"] == 40000


def test_current_variant_excludes_in_pit_kart():
    s = _state([
        _mk("r1", 7, cur=(31000, 0, 0)),
        _mk("r2", 9, pit="in_pit", cur=(22000, 0, 0)),
    ])
    meta = s._compute_sector_meta(source="current")
    assert meta["s1"]["bestMs"] == 31000
    assert meta["s1"]["kartNumber"] == 7
    assert meta["s1"]["secondBestMs"] is None


def test_current_variant_none_when_no_on_track_sector():
    s = _state([_mk("r2", 9, pit="in_pit", cur=(22000, 0, 0))])
    meta = s._compute_sector_meta(source="current")
    assert meta["s1"] is None
