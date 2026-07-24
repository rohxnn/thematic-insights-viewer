#!/usr/bin/env python3
"""
Merge two per-state raw CSVs into one CSV with: id, state, district, Date of Discussion.
The state name is derived from each input file's name (e.g. d_bihar.csv -> Bihar).

Usage:
    python3 scripts/merge_state_csvs.py <csv1> <csv2> [output.csv]

Example:
    python3 scripts/merge_state_csvs.py d_bihar.csv d_karnataka.csv merged_states.csv
"""
import csv
import sys
from pathlib import Path

REQUIRED_COLUMNS = ["id", "District", "Date of Discussion"]


def derive_state(csv_path):
    name = Path(csv_path).stem
    if name.lower().startswith("d_"):
        name = name[2:]
    return name.replace("_", " ").replace("-", " ").title()


def find_column(fieldnames, target):
    target_lower = target.lower()
    for name in fieldnames:
        if name.strip().lower() == target_lower:
            return name
    return None


def load_rows(csv_path):
    state = derive_state(csv_path)
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        column_map = {}
        for col in REQUIRED_COLUMNS:
            found = find_column(reader.fieldnames or [], col)
            if not found:
                raise ValueError(f"Column '{col}' not found in {csv_path} (headers: {reader.fieldnames})")
            column_map[col] = found

        rows = []
        for row in reader:
            rows.append({
                "id": row[column_map["id"]],
                "state": state.lower(),
                "district": (row[column_map["District"]] or "").lower(),
                "Date of Discussion": row[column_map["Date of Discussion"]],
            })
        return rows


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    csv1, csv2 = sys.argv[1], sys.argv[2]
    output_path = sys.argv[3] if len(sys.argv) > 3 else "merged_states.csv"

    rows = load_rows(csv1) + load_rows(csv2)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "state", "district", "Date of Discussion"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {output_path}")


if __name__ == "__main__":
    main()
