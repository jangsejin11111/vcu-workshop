"""Consistent online SQLite backup. Restore only while the server is stopped."""

import argparse, sqlite3, os
from pathlib import Path
from datetime import datetime

p = argparse.ArgumentParser()
p.add_argument("destination", nargs="?")
a = p.parse_args()
source = Path(os.environ.get("VCU_DATA", "data")) / "workshop.sqlite3"
if not source.exists():
    raise SystemExit("No database exists yet")
target = Path(
    a.destination or f"backups/workshop-{datetime.now():%Y%m%d-%H%M%S}.sqlite3"
)
target.parent.mkdir(parents=True, exist_ok=True)
if target.exists():
    raise SystemExit("Destination already exists; choose a new backup filename")
with sqlite3.connect(source) as src, sqlite3.connect(target) as dst:
    src.backup(dst)
print(target.resolve())
