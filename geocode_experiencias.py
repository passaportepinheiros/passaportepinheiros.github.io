#!/usr/bin/env python3
"""
Geocode experience addresses using Nominatim (OpenStreetMap).
Adds lat/lng fields to each `enderecos` entry in the frontmatter.

Usage: python geocode_experiencias.py [--dry-run]
"""

import re
import sys
import time
import json
import urllib.request
import urllib.parse
from pathlib import Path

DRY_RUN = "--dry-run" in sys.argv
CONTENT_DIR = Path(__file__).parent / "src/content/experiencias"
# Nominatim requires a descriptive User-Agent
UA = "PassaportePinheiros/1.0 geocode-script (contact@passaportepinheiros.com.br)"
DELAY = 1.1  # seconds between requests (Nominatim policy: max 1 req/s)


def nominatim_geocode(query: str) -> tuple[float, float] | None:
    params = urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "limit": 1,
        "countrycodes": "br",
    })
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as exc:
        print(f"  ⚠  Nominatim error for '{query}': {exc}")
    return None


def build_query(logradouro: str, numero: str, complemento: str = "") -> str:
    parts = [f"{logradouro}, {numero}"]
    if complemento:
        parts.append(complemento)
    parts.append("Pinheiros, São Paulo, SP, Brasil")
    return ", ".join(parts)


def parse_frontmatter(text: str) -> tuple[str, str, str]:
    """Return (before_fm, fm_content, after_fm) splitting on --- delimiters."""
    match = re.match(r"^(---\n)(.*?)(---\n)(.*)", text, re.DOTALL)
    if not match:
        raise ValueError("No frontmatter found")
    return match.group(2), match.group(4)


def inject_lat_lng(fm: str, results: list[tuple[str, tuple[float, float] | None]]) -> str:
    """
    For each (address_key, coords) pair, insert lat/lng after the matching
    enderecos block. `address_key` is 'logradouro: "..."'.
    """
    lines = fm.splitlines(keepends=True)
    out = []
    idx = 0
    result_iter = iter(results)
    current_result = next(result_iter, None)

    while idx < len(lines):
        line = lines[idx]
        out.append(line)

        if current_result is not None:
            address_key, coords = current_result
            # Detect the logradouro line of the current address block
            if address_key in line:
                # Find the end of this enderecos item (next "- logradouro" or end of enderecos block)
                # Insert lat/lng right after the numero line (or complemento/telefones block)
                # Strategy: collect the block, then append lat/lng before the next "- " item
                block_lines = [line]
                idx += 1
                while idx < len(lines):
                    next_line = lines[idx]
                    # A new list item at the same indent level signals the end
                    if re.match(r"  - logradouro:", next_line):
                        break
                    # End of enderecos section (different key or outdent)
                    if re.match(r"[a-zA-Z]", next_line):
                        break
                    block_lines.append(next_line)
                    idx += 1

                # Check if lat/lng already present
                block_text = "".join(block_lines)
                if "lat:" not in block_text and "lng:" not in block_text:
                    # Remove trailing blank lines from block
                    while block_lines and block_lines[-1].strip() == "":
                        block_lines.pop()
                    out.extend(block_lines[1:])  # first line already added
                    if coords:
                        lat, lng = coords
                        indent = "    "  # 4 spaces (inside enderecos list item)
                        out.append(f"{indent}lat: {lat}\n")
                        out.append(f"{indent}lng: {lng}\n")
                    else:
                        out.extend(block_lines[1:])  # no coords, keep as-is
                else:
                    out.extend(block_lines[1:])

                current_result = next(result_iter, None)
                continue  # already advanced idx inside the while

        idx += 1

    return "".join(out)


def process_file(md_path: Path) -> bool:
    text = md_path.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)---\n(.*)", text, re.DOTALL)
    if not match:
        print(f"  skip (no frontmatter): {md_path.name}")
        return False

    fm = match.group(1)
    body = match.group(2)

    # Extract all enderecos blocks
    # Pattern: detect pairs of logradouro + numero lines
    addr_pattern = re.compile(
        r'  - logradouro: "([^"]+)"\n    numero: "([^"]+)"(?:\n    complemento: "([^"]*)")?',
    )
    addresses = addr_pattern.findall(fm)

    if not addresses:
        print(f"  skip (no enderecos): {md_path.name}")
        return False

    results: list[tuple[str, tuple[float, float] | None]] = []
    for logradouro, numero, complemento in addresses:
        # Check if lat/lng already present for this address
        addr_block_start = fm.find(f'logradouro: "{logradouro}"')
        next_addr = fm.find("- logradouro:", addr_block_start + 1)
        block = fm[addr_block_start:next_addr] if next_addr != -1 else fm[addr_block_start:]
        if "lat:" in block and "lng:" in block:
            print(f"  already geocoded: {logradouro} {numero} — skipping")
            continue

        query = build_query(logradouro, numero, complemento)
        print(f"  geocoding: {query}")
        if not DRY_RUN:
            coords = nominatim_geocode(query)
            time.sleep(DELAY)
        else:
            coords = (-23.5605, -46.6789)  # dummy for dry-run
        print(f"    → {coords}")
        results.append((f'logradouro: "{logradouro}"', coords))

    if not results:
        return False

    new_fm = inject_lat_lng(fm, results)
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
        print("DRY-RUN mode — no files will be written\n")

    updated = 0
    for md_path in md_files:
        print(f"\n{md_path.relative_to(CONTENT_DIR)}")
        if process_file(md_path):
            updated += 1

    print(f"\n✓ Done — {updated} files updated")


if __name__ == "__main__":
    main()
