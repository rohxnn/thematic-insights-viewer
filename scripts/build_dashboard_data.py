#!/usr/bin/env python3
"""
Compact a thematic_explorer_export CSV (with State/District/Date of Discussion
columns, e.g. produced by enrich_explorer_export.py) into a small JSON payload
for the Smart Dashboard, so the browser never has to fetch/parse the full
multi-hundred-MB CSV.

Themes, states, and districts are de-duplicated into lookup tables; each row
becomes a compact tuple indexing into those tables.

Usage:
    python3 scripts/build_dashboard_data.py <explorer_export.csv> [output.json]

Example:
    python3 scripts/build_dashboard_data.py \
        "thematic_explorer_export_threshold_60_corrected.csv" \
        public/data/dashboard_data.json
"""
import csv
import json
import math
import re
import sys
from datetime import date

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}

ISO_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
LONG_RE = re.compile(r"^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$")


def parse_date(raw):
    raw = (raw or "").strip()
    if not raw:
        return None
    m = ISO_RE.match(raw)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = LONG_RE.match(raw)
        if not m:
            return None
        d = int(m.group(1))
        mo = MONTHS.get(m.group(2).lower())
        y = int(m.group(3))
        if not mo:
            return None
    try:
        return date(y, mo, d).isoformat()
    except ValueError:
        return None


def index_of(lookup, order, value):
    if value not in lookup:
        lookup[value] = len(order)
        order.append(value)
    return lookup[value]


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    export_csv = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else "public/data/dashboard_data.json"

    theme_lookup, theme_order = {}, []
    theme_status = []
    state_lookup, state_order = {}, []
    district_lookup, district_order = {}, []

    rows = []
    unparsed_dates = 0

    with open(export_csv, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            theme_name = row["Theme Name"].strip()
            if theme_name not in theme_lookup:
                theme_lookup[theme_name] = len(theme_order)
                theme_order.append(theme_name)
                theme_status.append(row["Status"].strip())
            theme_idx = theme_lookup[theme_name]

            state_idx = index_of(state_lookup, state_order, row["State"].strip())
            district_idx = index_of(district_lookup, district_order, row["District"].strip())

            iso_date = parse_date(row["Date of Discussion"])
            if iso_date is None and row["Date of Discussion"].strip():
                unparsed_dates += 1

            sid_raw = row["Statement ID"].strip()
            statement_id = int(sid_raw) if sid_raw.isdigit() else None

            score_raw = row["Similarity Score"].strip()
            try:
                score = round(float(score_raw), 4) if score_raw else None
                if score is not None and math.isnan(score):
                    score = None
            except ValueError:
                score = None

            rows.append([theme_idx, district_idx, state_idx, iso_date, statement_id, score])

    payload = {
        "themes": theme_order,
        "themeStatus": theme_status,
        "states": state_order,
        "districts": district_order,
        "rows": rows,
        "meta": {
            "totalRows": len(rows),
            "unparsedDates": unparsed_dates,
        },
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"), allow_nan=False)

    print(f"Wrote {len(rows)} rows, {len(theme_order)} themes, {len(district_order)} districts to {output_path}")
    print(f"Unparsed dates: {unparsed_dates}")


if __name__ == "__main__":
    main()
