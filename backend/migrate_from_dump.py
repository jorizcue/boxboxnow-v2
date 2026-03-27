#!/usr/bin/env python3
"""
Migration script: MySQL dump files -> SQLite (BoxboxNow v2)

Reads SQL dump files from a directory, extracts INSERT data,
and populates the new SQLite schema.

Creates a default admin user (admin/admin) with access to all circuits.

Usage:
  cd backend
  pip install bcrypt aiosqlite sqlalchemy
  python migrate_from_dump.py /path/to/Dump20260327
"""

import os
import re
import sys
import sqlite3
from datetime import datetime, timedelta

import bcrypt


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def create_tables(conn: sqlite3.Connection):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            max_devices INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS device_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_token TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            device_name TEXT DEFAULT '',
            ip_address TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS circuits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            length_m INTEGER,
            pit_time_s INTEGER,
            ws_port INTEGER NOT NULL,
            php_api_port INTEGER DEFAULT 0,
            laps_discard INTEGER DEFAULT 2,
            lap_differential INTEGER DEFAULT 3000,
            php_api_url TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS user_circuit_access (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            circuit_id INTEGER NOT NULL REFERENCES circuits(id) ON DELETE CASCADE,
            valid_from TIMESTAMP NOT NULL,
            valid_until TIMESTAMP NOT NULL
        );

        CREATE TABLE IF NOT EXISTS race_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            circuit_id INTEGER NOT NULL REFERENCES circuits(id),
            name TEXT DEFAULT '',
            duration_min INTEGER DEFAULT 180,
            min_stint_min INTEGER DEFAULT 15,
            max_stint_min INTEGER DEFAULT 40,
            min_pits INTEGER DEFAULT 3,
            pit_time_s INTEGER DEFAULT 120,
            min_driver_time_min INTEGER DEFAULT 30,
            rain INTEGER DEFAULT 0,
            box_lines INTEGER DEFAULT 2,
            box_karts INTEGER DEFAULT 30,
            our_kart_number INTEGER DEFAULT 0,
            refresh_interval_s INTEGER DEFAULT 30,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS team_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            race_session_id INTEGER NOT NULL REFERENCES race_sessions(id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            kart INTEGER NOT NULL,
            team_name TEXT DEFAULT ''
        );
    """)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.commit()


def extract_insert_values(sql_content: str) -> list[tuple]:
    """Extract VALUES from INSERT INTO statements."""
    # Find the INSERT INTO ... VALUES part
    match = re.search(r'INSERT INTO\s+`?\w+`?\s+VALUES\s*(.+);', sql_content, re.DOTALL)
    if not match:
        return []

    values_str = match.group(1)
    # Parse individual tuples
    tuples = re.findall(r'\(([^)]+)\)', values_str)

    results = []
    for t in tuples:
        # Parse each value, handling strings with quotes and NULLs
        values = []
        for v in re.split(r",(?=(?:[^']*'[^']*')*[^']*$)", t):
            v = v.strip()
            if v == 'NULL':
                values.append(None)
            elif v.startswith("'") and v.endswith("'"):
                values.append(v[1:-1])
            else:
                try:
                    if '.' in v:
                        values.append(float(v))
                    else:
                        values.append(int(v))
                except ValueError:
                    values.append(v)
        results.append(tuple(values))

    return results


def migrate_circuits(dump_dir: str, conn: sqlite3.Connection) -> list[int]:
    """Migrate listado_circuitos -> circuits."""
    filepath = os.path.join(dump_dir, "boxboxnow_listado_circuitos.sql")
    if not os.path.exists(filepath):
        print("  SKIP: boxboxnow_listado_circuitos.sql not found")
        return []

    with open(filepath, "r") as f:
        content = f.read()

    rows = extract_insert_values(content)
    circuit_ids = []

    for row in rows:
        # (id, name, PORT_SOCKET, PORT_PHP_API, NUM_VUELTAS_DESCARTE, DIFERENCIAL_VUELTAS, LONGITUD_CIRCUITO, TIEMPO_PIT)
        if len(row) < 8:
            continue

        cid, name, ws_port, php_port, laps_discard, lap_diff, length_m, pit_time = row

        conn.execute("""
            INSERT OR REPLACE INTO circuits (id, name, ws_port, php_api_port, laps_discard, lap_differential, length_m, pit_time_s)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (cid, name, ws_port, php_port or 0, laps_discard or 2, lap_diff or 3000, length_m, pit_time))
        circuit_ids.append(cid)

    conn.commit()
    print(f"  Migrated {len(rows)} circuits")
    return circuit_ids


def create_admin_user(conn: sqlite3.Connection) -> int:
    """Create default admin user. Returns user_id."""
    pwd_hash = hash_password("admin")
    conn.execute("""
        INSERT OR IGNORE INTO users (username, password_hash, is_admin)
        VALUES ('admin', ?, 1)
    """, (pwd_hash,))
    conn.commit()

    cursor = conn.execute("SELECT id FROM users WHERE username = 'admin'")
    return cursor.fetchone()[0]


def grant_all_circuits(conn: sqlite3.Connection, user_id: int, circuit_ids: list[int]):
    """Give admin access to all circuits (valid for 10 years)."""
    now = datetime.utcnow()
    until = now + timedelta(days=3650)

    for cid in circuit_ids:
        conn.execute("""
            INSERT INTO user_circuit_access (user_id, circuit_id, valid_from, valid_until)
            VALUES (?, ?, ?, ?)
        """, (user_id, cid, now.isoformat(), until.isoformat()))

    conn.commit()
    print(f"  Granted access to {len(circuit_ids)} circuits for admin user")


def main():
    if len(sys.argv) < 2:
        print("Usage: python migrate_from_dump.py /path/to/dump/directory")
        print("Example: python migrate_from_dump.py /Users/jizcue/dumps/Dump20260327")
        sys.exit(1)

    dump_dir = sys.argv[1]
    if not os.path.isdir(dump_dir):
        print(f"Error: {dump_dir} is not a directory")
        sys.exit(1)

    db_path = "data/boxboxnow.db"
    os.makedirs("data", exist_ok=True)

    # Remove old DB if exists
    if os.path.exists(db_path):
        os.remove(db_path)
        print(f"Removed existing {db_path}")

    print("=" * 60)
    print("BoxboxNow Migration: MySQL Dump -> SQLite")
    print("=" * 60)

    conn = sqlite3.connect(db_path)
    print("\nCreating tables...")
    create_tables(conn)

    print("\nMigrating circuits...")
    circuit_ids = migrate_circuits(dump_dir, conn)

    print("\nCreating admin user (admin/admin)...")
    admin_id = create_admin_user(conn)

    print("\nGranting circuit access to admin...")
    grant_all_circuits(conn, admin_id, circuit_ids)

    # Show summary
    print("\n" + "=" * 60)
    print("MIGRATION COMPLETE")
    print("=" * 60)

    print(f"\nDatabase: {db_path}")
    print(f"Admin login: admin / admin")
    print(f"\nCircuits:")
    for row in conn.execute("SELECT id, name, length_m, ws_port, pit_time_s FROM circuits ORDER BY name"):
        length = f"{row[2]}m" if row[2] else "?"
        pit = f"pit:{row[4]}s" if row[4] else "pit:?"
        print(f"  [{row[0]:2d}] {row[1]:<25s} {length:>6s}  port:{row[3]}  {pit}")

    conn.close()


if __name__ == "__main__":
    main()
