"""Build js/data.js, the data file the website loads.

Inputs (both live in the repository's data/ folder):
  - data/EDGAR_2025_GHG_booklet_2025.xlsx   EDGAR emissions workbook
  - data/countries-110m.json                world map outlines (world-atlas 2.0.2)

Output:
  - js/data.js                              defines `const DATA = {...};`

Run from anywhere:  python3 scripts/build_data.py
"""

import json
from pathlib import Path

import pandas as pd
import pycountry


ROOT = Path(__file__).resolve().parent.parent

INPUT_FILE = ROOT / "data" / "EDGAR_2025_GHG_booklet_2025.xlsx"
TOPOLOGY_FILE = ROOT / "data" / "countries-110m.json"
OUTPUT_FILE = ROOT / "js" / "data.js"

YEARS = list(range(1990, 2025))

# EDGAR reports these countries jointly; split totals across map geometries.
JOINTLY_REPORTED_SHARES = {
    "SCG": {
        "Serbia": 0.8,
        "Montenegro": 0.1,
        "Kosovo": 0.1,
    },
    "SDN": {
        "Sudan": 0.75,
        "S. Sudan": 0.25,
    },
}


def read_country_data(sheet_name):
    """Read a country-level sheet and index it by EDGAR country code."""
    return (
        pd.read_excel(INPUT_FILE, sheet_name=sheet_name)
        .dropna(subset=["Country"])
        .set_index("EDGAR Country Code")
    )


def get_edgar_code(geometry):
    """Convert a world-atlas geometry ID to an ISO alpha-3 code."""
    try:
        numeric_code = f"{int(geometry['id']):03d}"
        return pycountry.countries.get(numeric=numeric_code).alpha_3
    except Exception:
        return None


totals = read_country_data("GHG_totals_by_country")
per_capita = read_country_data("GHG_per_capita_by_country")

with open(TOPOLOGY_FILE, encoding="utf-8") as file:
    topology = json.load(file)

geometries = [
    geometry
    for geometry in topology["objects"]["countries"]["geometries"]
    if geometry.get("properties", {}).get("name") != "Antarctica"
]
topology["objects"]["countries"]["geometries"] = geometries

country_data = {}

for geometry in geometries:
    name = geometry["properties"]["name"]
    edgar_code = get_edgar_code(geometry)
    share = 1

    # Apply country-code overrides and allocation shares for jointly reported groups.
    for group_code, country_shares in JOINTLY_REPORTED_SHARES.items():
        if name in country_shares:
            edgar_code = group_code
            share = country_shares[name]
            break

    if edgar_code in totals.index and edgar_code not in {"GLOBAL TOTAL", "EU27"}:
        country_data[name] = {
            "t": [
                round(float(value) * share, 1)
                for value in totals.loc[edgar_code, YEARS]
            ],
            "p": [
                round(float(value), 2)
                for value in per_capita.loc[edgar_code, YEARS]
            ],
        }

# Keep only the country name on each geometry.
for geometry in geometries:
    geometry["n"] = geometry["properties"]["name"]
    geometry.pop("properties", None)
    geometry.pop("id", None)

world_totals = [
    round(float(value), 0)
    for value in totals.loc["GLOBAL TOTAL", YEARS]
]

output = {
    "topo": topology,
    "data": country_data,
    "world": world_totals,
    "years": [YEARS[0], YEARS[-1]],
}

OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
    file.write("const DATA=")
    json.dump(output, file, separators=(",", ":"))
    file.write(";\n")

missing_countries = [
    geometry["n"]
    for geometry in geometries
    if geometry["n"] not in country_data
]

print(
    f"{len(geometries)} geometries, "
    f"{len(country_data)} countries; "
    f"missing: {missing_countries}"
)
print(f"Wrote {OUTPUT_FILE} ({OUTPUT_FILE.stat().st_size:,} bytes)")