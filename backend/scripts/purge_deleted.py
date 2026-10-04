r"""Remove deleted businesses, scenarios and runs for good. Deleting in the app only hides things; this is the
only thing that really erases them.

Run from the backend folder (PowerShell):

    .\.venv\Scripts\python.exe scripts\purge_deleted.py                      # dry run: only counts what would go
    .\.venv\Scripts\python.exe scripts\purge_deleted.py --older-than-days 30 --yes

Only things deleted at least --older-than-days ago (default 30) are touched. The AI logs are never deleted: they keep
their old ids as plain numbers. Back up btm.db first.
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal  # noqa: E402
from app.purge import purge  # noqa: E402

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument("--older-than-days", type=float, default=30.0)
parser.add_argument("--yes", action="store_true", help="really delete (without it, only count)")
args = parser.parse_args()

with SessionLocal() as db:
    counts = purge(db, dt.timedelta(days=args.older_than_days), dry_run=not args.yes)

print("DELETED FOR GOOD:" if args.yes else "DRY RUN (nothing deleted). Would remove:")
for name, n in counts.items():
    print(f"  {name:15} {n}")
if not args.yes:
    print("Add --yes to do it.")
