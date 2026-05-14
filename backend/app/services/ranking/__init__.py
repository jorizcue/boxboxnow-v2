"""Driver ranking subsystem.

Computes a Glicko-2 skill rating per pilot across all recorded Apex
sessions. Pilots are identified by NAME ONLY because Apex doesn't emit
unique IDs — see `normalizer.py` for the canonicalisation strategy and
`schemas.Driver` / `schemas.DriverAlias` for the storage model.

Public entry points:
  - `processor.process_log_file(path, db)`     — turn one Apex log
    into SessionResult rows + apply Glicko-2 updates.
  - `processor.process_pending(db)`            — scan
    `data/recordings/` for logs not in `processed_logs` and process them
    all. Used both for the initial backfill and the daily incremental.
  - `processor.lookup_ratings_by_names(names, db)` — bulk resolve a
    list of raw driver names to (canonical_name, rating, rd) tuples.
    Used by the pre-race team panel.
"""
