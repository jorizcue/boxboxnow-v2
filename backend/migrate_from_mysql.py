#!/usr/bin/env python3
"""
Migration script: MySQL (BoxboxNow v1) -> SQLite (BoxboxNow v2)

Reads configuration tables from the existing MySQL database
and inserts them into the new SQLite database.

Tables migrated:
  - listado_circuitos -> circuits
  - parameters + race_parameters + box_configuration -> race_parameters + box_configuration
  - teams_level -> teams_level

Usage:
  pip install pymysql
  python migrate_from_mysql.py

  Or with custom MySQL connection:
  MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=xxx MYSQL_DB=boxboxnow python migrate_from_mysql.py
"""

import os
import sqlite3
import pymysql


def get_mysql_connection():
    return pymysql.connect(
        host=os.environ.get("MYSQL_HOST", "127.0.0.1"),
        port=int(os.environ.get("MYSQL_PORT", "3306")),
        user=os.environ.get("MYSQL_USER", "root"),
        password=os.environ.get("MYSQL_PASSWORD", ""),
        database=os.environ.get("MYSQL_DB", "boxboxnow"),
        cursorclass=pymysql.cursors.DictCursor,
    )


def get_sqlite_connection(db_path: str = "data/boxboxnow.db"):
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def create_sqlite_tables(sqlite_conn):
    """Create the v2 schema in SQLite."""
    sqlite_conn.executescript("""
        CREATE TABLE IF NOT EXISTS circuits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            length_m INTEGER NOT NULL,
            pit_time_s INTEGER DEFAULT 120,
            ws_port INTEGER NOT NULL,
            php_api_port INTEGER DEFAULT 0,
            laps_discard INTEGER DEFAULT 2,
            lap_differential REAL DEFAULT 1.15,
            php_api_url TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS race_parameters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            circuit_id INTEGER NOT NULL REFERENCES circuits(id),
            duration_min INTEGER DEFAULT 180,
            min_stint_min INTEGER DEFAULT 15,
            max_stint_min INTEGER DEFAULT 40,
            min_pits INTEGER DEFAULT 3,
            pit_time_s INTEGER DEFAULT 120,
            min_driver_time_min INTEGER DEFAULT 30,
            rain INTEGER DEFAULT 0,
            refresh_interval_s INTEGER DEFAULT 30,
            our_kart_number INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS box_configuration (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            race_params_id INTEGER NOT NULL REFERENCES race_parameters(id),
            number_karts INTEGER DEFAULT 30,
            lines INTEGER DEFAULT 2
        );

        CREATE TABLE IF NOT EXISTS teams_level (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            race_params_id INTEGER NOT NULL REFERENCES race_parameters(id),
            position INTEGER NOT NULL,
            kart INTEGER NOT NULL,
            team_name TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS race_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            race_params_id INTEGER NOT NULL REFERENCES race_parameters(id),
            timestamp TEXT NOT NULL,
            data_json TEXT NOT NULL
        );
    """)
    sqlite_conn.commit()


def migrate_circuits(mysql_conn, sqlite_conn):
    """Migrate listado_circuitos -> circuits."""
    with mysql_conn.cursor() as cur:
        cur.execute("""
            SELECT id, name, LONGITUD_CIRCUITO, Tiempo_pit, port_socket,
                   port_php_api, num_vueltas_descarte, diferencial_vueltas
            FROM listado_circuitos
            ORDER BY id
        """)
        rows = cur.fetchall()

    if not rows:
        print("  No circuits found in MySQL")
        return

    for row in rows:
        sqlite_conn.execute("""
            INSERT INTO circuits (id, name, length_m, pit_time_s, ws_port,
                                  php_api_port, laps_discard, lap_differential)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            row["id"],
            row["name"],
            row["LONGITUD_CIRCUITO"],
            row["Tiempo_pit"],
            row["port_socket"],
            row.get("port_php_api", 0),
            row.get("num_vueltas_descarte", 2),
            row.get("diferencial_vueltas", 1.15),
        ))

    sqlite_conn.commit()
    print(f"  Migrated {len(rows)} circuits")


def migrate_parameters(mysql_conn, sqlite_conn):
    """Migrate parameters + race_parameters + box_configuration."""
    with mysql_conn.cursor() as cur:
        # Get current parameters
        cur.execute("SELECT refresh, kart_number, id_circuito FROM parameters LIMIT 1")
        params = cur.fetchone()

        # Get race parameters
        cur.execute("""
            SELECT duration, min_stint, max_stint, min_pits_number,
                   tiempo_pit, tiempo_min_driver, rain
            FROM race_parameters LIMIT 1
        """)
        race_params = cur.fetchone()

        # Get box configuration
        cur.execute("SELECT lineas, number_karts FROM box_configuration LIMIT 1")
        box_config = cur.fetchone()

    if not params:
        print("  No parameters found in MySQL")
        return

    circuit_id = params.get("id_circuito", 1)
    refresh = params.get("refresh", 30)
    kart_number = params.get("kart_number", 0)

    # Insert race_parameters (combines old parameters + race_parameters)
    duration = race_params.get("duration", 180) if race_params else 180
    min_stint = race_params.get("min_stint", 15) if race_params else 15
    max_stint = race_params.get("max_stint", 40) if race_params else 40
    min_pits = race_params.get("min_pits_number", 3) if race_params else 3
    pit_time = race_params.get("tiempo_pit", 120) if race_params else 120
    min_driver_time = race_params.get("tiempo_min_driver", 30) if race_params else 30
    rain = 1 if (race_params and race_params.get("rain")) else 0

    sqlite_conn.execute("""
        INSERT INTO race_parameters (circuit_id, duration_min, min_stint_min, max_stint_min,
                                     min_pits, pit_time_s, min_driver_time_min, rain,
                                     refresh_interval_s, our_kart_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (circuit_id, duration, min_stint, max_stint, min_pits,
          pit_time, min_driver_time, rain, refresh, kart_number))

    race_params_id = sqlite_conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    # Insert box_configuration
    lines = box_config.get("lineas", 2) if box_config else 2
    number_karts = box_config.get("number_karts", 30) if box_config else 30

    sqlite_conn.execute("""
        INSERT INTO box_configuration (race_params_id, number_karts, lines)
        VALUES (?, ?, ?)
    """, (race_params_id, number_karts, lines))

    sqlite_conn.commit()
    print(f"  Migrated race params (circuit_id={circuit_id}, kart={kart_number})")
    print(f"  Migrated box config (lines={lines}, karts={number_karts})")

    return race_params_id


def migrate_teams(mysql_conn, sqlite_conn, race_params_id: int):
    """Migrate teams_level."""
    with mysql_conn.cursor() as cur:
        cur.execute("SELECT position, kart, team_name FROM teams_level ORDER BY position")
        rows = cur.fetchall()

    if not rows:
        print("  No teams found in MySQL")
        return

    for row in rows:
        sqlite_conn.execute("""
            INSERT INTO teams_level (race_params_id, position, kart, team_name)
            VALUES (?, ?, ?, ?)
        """, (race_params_id, row["position"], row["kart"], row.get("team_name", "")))

    sqlite_conn.commit()
    print(f"  Migrated {len(rows)} teams")


def main():
    print("=" * 60)
    print("BoxboxNow Migration: MySQL -> SQLite")
    print("=" * 60)

    # Check for MySQL password
    if not os.environ.get("MYSQL_PASSWORD"):
        print("\nNOTA: Set MYSQL_PASSWORD environment variable")
        print("Example:")
        print("  MYSQL_PASSWORD=mypass python migrate_from_mysql.py")
        print()
        password = input("Enter MySQL password (or press Enter to skip): ").strip()
        if password:
            os.environ["MYSQL_PASSWORD"] = password
        else:
            print("Skipped. Exiting.")
            return

    print("\nConnecting to MySQL...")
    mysql_conn = get_mysql_connection()
    print("  Connected!")

    print("\nCreating SQLite database...")
    sqlite_conn = get_sqlite_connection()
    create_sqlite_tables(sqlite_conn)
    print("  Created at data/boxboxnow.db")

    print("\nMigrating circuits...")
    migrate_circuits(mysql_conn, sqlite_conn)

    print("\nMigrating parameters & race config...")
    race_params_id = migrate_parameters(mysql_conn, sqlite_conn)

    if race_params_id:
        print("\nMigrating teams...")
        migrate_teams(mysql_conn, sqlite_conn, race_params_id)

    # Show summary
    print("\n" + "=" * 60)
    print("MIGRATION COMPLETE")
    print("=" * 60)

    # Verify
    cur = sqlite_conn.cursor()
    for table in ["circuits", "race_parameters", "box_configuration", "teams_level"]:
        count = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"  {table}: {count} rows")

    # Show circuits
    print("\nCircuits:")
    for row in cur.execute("SELECT id, name, length_m, ws_port FROM circuits"):
        print(f"  [{row[0]}] {row[1]} ({row[2]}m, port:{row[3]})")

    # Show teams
    print("\nTeams:")
    for row in cur.execute("SELECT position, kart, team_name FROM teams_level ORDER BY position"):
        print(f"  P{row[0]} - Kart {row[1]}: {row[2]}")

    mysql_conn.close()
    sqlite_conn.close()


if __name__ == "__main__":
    main()
