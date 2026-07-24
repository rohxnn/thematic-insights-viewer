# Smart Dashboard

This document covers the data pipeline built to power the **Smart Dashboard** tab
([src/pages/SmartDashboard.jsx](src/pages/SmartDashboard.jsx)): where the data comes
from, the scripts that transform it, and how to regenerate everything from scratch.

## Data pipeline

Raw per-state discussion exports → merged state/district/date lookup → enriched
themes-explorer export → compact JSON the browser actually loads.

```
d_bihar.csv, d_karnataka.csv                  (raw per-state exports)
        │
        ▼  scripts/merge_state_csvs.py
merged_states.csv                             (id, state, district, Date of Discussion)
        │
        ▼  scripts/enrich_explorer_export.py
thematic_explorer_export_..._corrected.csv    (adds State/District/Date of Discussion
        │                                       right after Statement ID)
        ▼  scripts/build_dashboard_data.py
public/data/dashboard_data.json               (what SmartDashboard.jsx fetches)
```

### 1. `scripts/merge_state_csvs.py` — merge raw state exports

Takes two raw per-state CSVs (e.g. `d_bihar.csv`, `d_karnataka.csv` — column names and
casing differ between states) and produces one CSV with just `id, state, district,
Date of Discussion`. The state name is derived from the input filename (`d_bihar.csv`
→ `bihar`); `state` and `district` are lowercased on write.

```bash
python3 scripts/merge_state_csvs.py d_bihar.csv d_karnataka.csv merged_states.csv
```

Column matching is case-insensitive, so it tolerates the header differences between
state exports (e.g. `District` vs `district`).

### 2. `scripts/enrich_explorer_export.py` — join onto the themes explorer export

Takes the CSV exported from the Visualization Hub's "Export CSV" button (columns:
`Theme ID, Theme Name, Status, Definition, Keywords, Objective Count, Statement ID,
Statement Text, Similarity Score`) and inserts `State`, `District`, `Date of
Discussion` right after `Statement ID`, joined from `merged_states.csv` on
`id` ↔ `Statement ID`.

```bash
python3 scripts/enrich_explorer_export.py merged_states.csv \
  thematic_explorer_export_threshold_60.csv \
  thematic_explorer_export_threshold_60_corrected.csv
```

IDs are normalized by stripping thousands-separator commas before matching (some raw
state exports store ids like `"3,160"` while the Statement ID column has plain
`3160`).

### 3. `scripts/build_dashboard_data.py` — compact for the browser

The corrected export CSV is large (~90MB+ for the full dataset) — far too big to
fetch and parse client-side. This script reads it once and writes a compact JSON:
themes, states, and districts are de-duplicated into lookup arrays, and each row
becomes a short tuple indexing into them (`[themeIdx, districtIdx, stateIdx,
dateISO, statementId, similarityScore]`) instead of repeating full strings.

```bash
python3 scripts/build_dashboard_data.py \
  thematic_explorer_export_threshold_60_corrected.csv \
  public/data/dashboard_data.json
```

**Run this any time the underlying export data changes** — `dashboard_data.json` is
a build artifact, not hand-edited, and `SmartDashboard.jsx` will only ever see what's
in it.

Dates are parsed from either `YYYY-MM-DD` or `D Month YYYY` format; anything else
(or empty) is stored as `null` rather than crashing the build. Similarity scores that
are blank or the literal string `"NaN"` (present in some source rows) are also
normalized to `null` — the script writes with `allow_nan=False` so a stray Python
`NaN` can never again get serialized as an invalid JSON token that breaks
`JSON.parse` in the browser.

## Smart Dashboard UI

`src/pages/SmartDashboard.jsx`, wired in as a new sidebar tab after "Comparison
Playground" ([src/App.jsx](src/App.jsx), [src/components/Sidebar.jsx](src/components/Sidebar.jsx)).

- **Filters** (state, district, date — quarter picker or start/end range) scope
  every chart and metric below them.
- **KPI row**: Total Objectives, Distinct Discussions, Themes Represented, Districts
  Covered, Approved Share, Avg Similarity Score.
- **Theme Distribution donut**: top 6 themes by row count + an "Other" bucket,
  legend with counts/percentages, hover tooltips.
- **Approved vs Draft meter**.
- **Top Districts bar chart**: top 10 districts by objective count.
- **Monthly Discussion Volume**: bar trend from 2024-01 onward, with an expandable
  data table (see data quirks below for why the window starts there).
- **Districts × Theme table**: total objectives, distinct themes, top theme,
  approved % per district — click the "Total Objectives" header to re-sort.

Chart colors use the dataviz skill's validated categorical palette (checked for
colorblind-safety and contrast against this app's actual dark/light surfaces), wired
through the same CSS-variable dark/light pattern the rest of the app uses
(`--series-1` … `--series-6`, overridden under `[data-theme='light']`).

## Known data quirks (found while building this)

- **~1% of dates are mistyped** — values as far back as 1997 mixed in with the
  otherwise-clean 2024–2026 range (e.g. `22 April 2017` next to `2025-05-08`). The
  monthly trend chart only plots 2024-01 onward and discloses the excluded count
  rather than stretching its axis for a handful of outliers; all other metrics still
  count them.
- **413 rows have `"NaN"` as their Similarity Score** in the source export — handled
  in `build_dashboard_data.py` (see above).
- **A few district names are near-duplicates**: `bengaluru` / `bengaluru urban`,
  `ramanagar` / `ramanagar jille`. These are kept as distinct entries since that's
  what the source data has; no normalization has been applied.
- **State and district are 1:1** in this dataset (no district name is shared across
  states) — `SmartDashboard.jsx` relies on this to build a district→state lookup.

## Repo hygiene note

The raw/intermediate CSVs used to build this pipeline (`d_bihar.csv`,
`d_karnataka.csv`, `merged_states.csv`, `thematic_explorer_export_*.csv`) live at the
repo root and are large (tens to ~90MB each). They are **not** in `.gitignore` as of
this writing. Only `public/data/dashboard_data.json` (a couple MB) is actually needed
for the app to run — consider gitignoring the raw CSVs before committing.
