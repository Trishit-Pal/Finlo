#!/usr/bin/env python3
"""Regenerate the Test Inventory section of TESTS.md by AST-scanning test files.

Run from repo root:
    python scripts/gen_test_manifest.py

Also called automatically by the .claude/settings.json PostToolUse hook after every
Write or Edit tool call.
"""

from __future__ import annotations

import ast
import re
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
TESTS_DIR = REPO_ROOT / "backend" / "app" / "tests"
TESTS_MD = REPO_ROOT / "TESTS.md"
MARKER_START = "<!-- TEST-INVENTORY-START -->"
MARKER_END = "<!-- TEST-INVENTORY-END -->"


def extract_tests(path: Path) -> list[tuple[str, str]]:
    """Return (func_name, first_docstring_line) for every test_ function in path."""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError as exc:
        print(f"  Warning: could not parse {path.name}: {exc}")
        return []
    results: list[tuple[str, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name.startswith("test_"):
                raw_doc = ast.get_docstring(node) or ""
                doc = raw_doc.split("\n")[0].strip() if raw_doc else ""
                results.append((node.name, doc))
    return results


def build_inventory() -> str:
    test_files = sorted(TESTS_DIR.glob("test_*.py"))
    if not test_files:
        return "_No test files found in backend/app/tests/_"

    lines: list[str] = [f"_Auto-generated {date.today().isoformat()}_\n"]
    total = 0

    for tf in test_files:
        tests = extract_tests(tf)
        total += len(tests)
        lines.append(f"\n### `{tf.name}` — {len(tests)} tests\n")
        for name, doc in tests:
            suffix = f" — {doc}" if doc else ""
            lines.append(f"- `{name}`{suffix}")

    n = len(test_files)
    lines.append(f"\n\n**Total: {total} tests across {n} files**")
    return "\n".join(lines)


def update_tests_md() -> None:
    if not TESTS_MD.exists():
        print(f"TESTS.md not found at {TESTS_MD} — skipping.")
        return

    text = TESTS_MD.read_text(encoding="utf-8")
    if MARKER_START not in text:
        print("TESTS.md has no TEST-INVENTORY-START sentinel — skipping.")
        return

    inventory = build_inventory()
    replacement = f"{MARKER_START}\n{inventory}\n{MARKER_END}"
    updated = re.sub(
        rf"{re.escape(MARKER_START)}.*?{re.escape(MARKER_END)}",
        replacement,
        text,
        flags=re.DOTALL,
    )

    if updated == text:
        print("TESTS.md inventory already up-to-date.")
        return

    TESTS_MD.write_text(updated, encoding="utf-8")
    total = sum(1 for line in inventory.splitlines() if line.startswith("- `test_"))
    n = len(list(TESTS_DIR.glob("test_*.py")))
    print(f"Updated TESTS.md — {total} tests across {n} files.")


if __name__ == "__main__":
    update_tests_md()
