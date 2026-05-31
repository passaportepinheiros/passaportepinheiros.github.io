#!/usr/bin/env python3
"""
Enrich experience addresses using Nominatim reverse geocoding.
Adds bairro, cidade (and cep when reliable) to each `enderecos` entry.

Uses existing lat/lng coordinates — run geocode_experiencias.py first.

Usage:
  python enrich_enderecos.py           # update files
  python enrich_enderecos.py --dry-run # preview only
  python enrich_enderecos.py --cep     # also add CEP (may be partial)
"""

import re
import sys
import time
import json
import urllib.request
import urllib.parse
from pathlib import Path

DRY_RUN = "--dry-run" in sys.argv
INCLUDE_CEP = "--cep" in sys.argv
CONTENT_DIR = Path(__file__).parent / "src/content/experiencias"
UA = "PassaportePinheiros/1.0 enrich-script (contact@passaportepinheiros.com.br)"
DELAY = 1.1  # seconds between requests (Nominatim policy: max 1 req/s)


def nominatim_reverse(lat: float, lon: float) -> dict | None:
    """Reverse geocode lat/lon and return the full Nominatim result dict."""
    params = urllib.parse.urlencode({
        "format": "json",
        "lat": lat,
        "lon": lon,
        "addressdetails": 1,
        "zoom": 18,
        "accept-language": "pt",
    })
    url = f"https://nominatim.openstreetmap.org/reverse?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            if "address" in data:
                return data
    except Exception as exc:
        print(f"  ⚠  Nominatim error for ({lat}, {lon}): {exc}")
    return None


def extract_fields(result: dict) -> dict:
    """
    Extract bairro, cidade, and optionally cep from a Nominatim result.

    Nominatim address keys for Brazil (roughly ordered by priority):
      bairro:  suburb > neighbourhood > city_district > quarter
      cidade:  city > town > municipality > county
      cep:     postcode (often only first 5 digits in OSM data)
    """
    addr = result.get("address", {})

    bairro = (
        addr.get("suburb")
        or addr.get("neighbourhood")
        or addr.get("city_district")
        or addr.get("quarter")
        or ""
    )

    cidade = (
        addr.get("city")
        or addr.get("town")
        or addr.get("municipality")
        or addr.get("county")
        or ""
    )

    cep_raw = addr.get("postcode", "")
    # Brazilian CEP: XXXXX-XXX (8 digits). OSM often only has the 5-digit prefix.
    cep_digits = re.sub(r"\D", "", cep_raw)
    if len(cep_digits) == 8:
        cep = f"{cep_digits[:5]}-{cep_digits[5:]}"
    elif len(cep_digits) == 5:
        # 5-digit prefix only — include as-is but note it is incomplete
        cep = cep_digits  # e.g. "01419"
    else:
        cep = ""

    return {"bairro": bairro, "cidade": cidade, "cep": cep}


def inject_fields(fm: str, logradouro: str, numero: str, fields: dict) -> str:
    """
    Insert bairro/cidade/cep after the `lng:` line of the matching address block.
    Skips injection if bairro already present.
    """
    # Find the address block for this logradouro/numero pair
    search = f'logradouro: "{logradouro}"'
    start = fm.find(search)
    if start == -1:
        return fm

    # Find the lng: line within this block
    # Scope: from `start` to next `- logradouro:` or end of string
    next_block = fm.find("  - logradouro:", start + 1)
    block_end = next_block if next_block != -1 else len(fm)
    block = fm[start:block_end]

    if "bairro:" in block:
        return fm  # already enriched

    lng_match = re.search(r"( {4}lng: [^\n]+\n)", block)
    if not lng_match:
        # No lng — try inserting after lat instead
        lat_match = re.search(r"( {4}lat: [^\n]+\n)", block)
        if not lat_match:
            return fm
        insert_after = lat_match.end()
    else:
        insert_after = lng_match.end()

    # Build insertion lines
    lines = []
    if fields.get("bairro"):
        lines.append(f'    bairro: "{fields["bairro"]}"\n')
    if fields.get("cidade"):
        lines.append(f'    cidade: "{fields["cidade"]}"\n')
    if INCLUDE_CEP and fields.get("cep"):
        lines.append(f'    cep: "{fields["cep"]}"\n')

    if not lines:
        return fm

    insertion = "".join(lines)
    abs_insert = start + insert_after
    return fm[:abs_insert] + insertion + fm[abs_insert:]


def process_file(md_path: Path) -> bool:
    text = md_path.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)---\n(.*)", text, re.DOTALL)
    if not match:
        return False

    fm = match.group(1)
    body = match.group(2)

    # Find all address blocks with lat/lng but without bairro
    addr_pattern = re.compile(
        r'  - logradouro: "([^"]+)"\n'
        r'    numero: "([^"]+)"',
    )

    to_enrich = []
    for m in addr_pattern.finditer(fm):
        logradouro, numero = m.group(1), m.group(2)
        start = m.start()
        next_block = fm.find("  - logradouro:", start + 1)
        block = fm[start:next_block] if next_block != -1 else fm[start:]

        if "bairro:" in block:
            print(f"  already enriched: {logradouro} {numero} — skipping")
            continue
        if "lat:" not in block:
            print(f"  no lat/lng yet: {logradouro} {numero} — skipping (run geocode_experiencias.py first)")
            continue

        lat_m = re.search(r"lat: ([\d\.\-]+)", block)
        lng_m = re.search(r"lng: ([\d\.\-]+)", block)
        if not lat_m or not lng_m:
            continue

        lat = float(lat_m.group(1))
        lon = float(lng_m.group(1))
        to_enrich.append((logradouro, numero, lat, lon))

    if not to_enrich:
        return False

    new_fm = fm
    for logradouro, numero, lat, lon in to_enrich:
        print(f"  reverse geocoding: {logradouro}, {numero} ({lat}, {lon})")
        if DRY_RUN:
            fields = {"bairro": "Pinheiros", "cidade": "São Paulo", "cep": "05416-000"}
        else:
            result = nominatim_reverse(lat, lon)
            time.sleep(DELAY)
            if result is None:
                print(f"    ⚠  no result")
                continue
            fields = extract_fields(result)

        print(f"    → bairro={fields['bairro']!r}  cidade={fields['cidade']!r}  cep={fields['cep']!r}")
        new_fm = inject_fields(new_fm, logradouro, numero, fields)

    if new_fm == fm:
        return False

    new_text = f"---\n{new_fm}---\n{body}"
    if DRY_RUN:
        print(f"  [DRY-RUN] would write {md_path.name}")
    else:
        md_path.write_text(new_text, encoding="utf-8")
        print(f"  ✓ wrote {md_path.name}")

    return True


def main():
    md_files = sorted(CONTENT_DIR.rglob("*.md"))
    print(f"Found {len(md_files)} experience files")
    if DRY_RUN:
        print("DRY-RUN mode — no files will be written")
    if INCLUDE_CEP:
        print("CEP mode — will include postcode (may be partial/5-digit)")
    print()

    updated = 0
    for md_path in md_files:
        print(f"\n{md_path.relative_to(CONTENT_DIR)}")
        if process_file(md_path):
            updated += 1

    print(f"\n✓ Done — {updated} files updated")


if __name__ == "__main__":
    main()
