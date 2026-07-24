#!/usr/bin/env python3
"""
Enrich a thematic_explorer_export CSV by inserting State, District, and
Date of Discussion right after the Statement ID column, joined from
merged_states.csv on id <-> Statement ID.

Usage:
    python3 scripts/enrich_explorer_export.py <merged_states.csv> <explorer_export.csv> [output.csv]

Example:
    python3 scripts/enrich_explorer_export.py merged_states.csv \
        "thematic_explorer_export_threshold_0.60 (1).csv" \
        "thematic_explorer_export_threshold_0.60_enriched.csv"
"""
import csv
import sys


def normalize_id(value):
    # ids in the raw state CSVs can carry thousands-separator commas
    # (e.g. "3,160"), while Statement ID in the export is plain ("3160").
    return (value or "").replace(",", "").strip()


def load_lookup(merged_states_csv):
    lookup = {}
    with open(merged_states_csv, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = normalize_id(row["id"])
            lookup[key] = {
                "State": row["state"],
                "District": row["district"],
                "Date of Discussion": row["Date of Discussion"],
            }
    return lookup


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    merged_states_csv = sys.argv[1]
    export_csv = sys.argv[2]
    output_path = sys.argv[3] if len(sys.argv) > 3 else "explorer_export_enriched.csv"

    lookup = load_lookup(merged_states_csv)

    with open(export_csv, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        original_fields = reader.fieldnames
        insert_at = original_fields.index("Statement ID") + 1
        new_columns = ["State", "District", "Date of Discussion"]
        fieldnames = original_fields[:insert_at] + new_columns + original_fields[insert_at:]
        rows = list(reader)

    matched = 0
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            key = normalize_id(row.get("Statement ID", ""))
            match = lookup.get(key)
            if match:
                matched += 1
                row.update(match)
            else:
                row["State"] = ""
                row["District"] = ""
                row["Date of Discussion"] = ""
            writer.writerow(row)

    print(f"Wrote {len(rows)} rows to {output_path} ({matched} matched, {len(rows) - matched} unmatched)")


if __name__ == "__main__":
    main()
