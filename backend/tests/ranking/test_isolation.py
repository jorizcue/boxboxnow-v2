"""Contract: the ranking package may only touch app/apex via the two
read-only entrypoints (replay.parse_log_file, parser.ApexMessageParser/
EventType/time_to_ms). It must never import engine/state/live/replay
write paths, and must not modify app/apex."""
import ast
from pathlib import Path

RANKING = Path(__file__).resolve().parents[2] / "app" / "services" / "ranking"
ALLOWED_APEX = {"app.apex.replay", "app.apex.parser"}


def test_ranking_only_imports_allowed_apex_modules():
    bad = []
    for py in RANKING.glob("*.py"):
        tree = ast.parse(py.read_text())
        for node in ast.walk(tree):
            mod = None
            if isinstance(node, ast.ImportFrom) and node.module:
                mod = node.module
            elif isinstance(node, ast.Import):
                for a in node.names:
                    if a.name.startswith("app.apex"):
                        mod = a.name
            if mod and mod.startswith("app.apex") and mod not in ALLOWED_APEX:
                bad.append((py.name, mod))
    assert not bad, f"Disallowed app.apex imports in ranking: {bad}"
