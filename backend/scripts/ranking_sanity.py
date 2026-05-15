#!/usr/bin/env python3
"""Post-reprocess sanity metrics. Run inside the backend container:
  python scripts/ranking_sanity.py
Fails (exit 1) if coverage is still pathological."""
import sqlite3
import sys


def main():
    c = sqlite3.connect("/app/data/boxboxnow.db")
    q = lambda s: c.execute(s).fetchone()[0]

    processed = q("SELECT COUNT(*) FROM processed_logs")
    results = q("SELECT COUNT(*) FROM session_results")
    circuits = q("SELECT COUNT(DISTINCT circuit_name) FROM session_results")
    sessions = q("SELECT COUNT(*) FROM (SELECT DISTINCT circuit_name,log_date,session_seq FROM session_results)")
    circ_ratings = q("SELECT COUNT(*) FROM driver_circuit_ratings")
    max_sessions = q("SELECT COALESCE(MAX(sessions_count), 0) FROM driver_ratings")
    eupen = q("SELECT COUNT(*) FROM session_results WHERE circuit_name='EUPEN'")

    print(f"processed_logs={processed} session_results={results} "
          f"circuits={circuits} distinct_sessions={sessions} "
          f"circuit_ratings={circ_ratings} max_sessions_per_driver={max_sessions} "
          f"eupen_rows={eupen}")

    problems = []
    if circuits < 12: problems.append(f"only {circuits} circuits (<12)")
    if circ_ratings == 0: problems.append("driver_circuit_ratings still empty")
    if eupen == 0: problems.append("EUPEN still produces 0 rows")
    if max_sessions <= 5: problems.append(f"max_sessions still {max_sessions} (<=5)")
    if problems:
        print("SANITY FAIL:", "; ".join(problems)); sys.exit(1)
    print("SANITY OK")


if __name__ == "__main__":
    main()
