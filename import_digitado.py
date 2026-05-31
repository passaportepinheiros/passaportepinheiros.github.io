#!/usr/bin/env python3
"""
Create draft experience markdown files from digitado.txt.

The script only creates missing experiences. Existing files are left untouched,
including entries whose names in digitado.txt are shorter or slightly different
from the canonical content slug.

Usage:
  python3 import_digitado.py
  python3 import_digitado.py --dry-run
"""

from __future__ import annotations

import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path


ROOT = Path(__file__).parent
INPUT_PATH = ROOT / "digitado.txt"
CONTENT_DIR = ROOT / "src/content/experiencias"
DRY_RUN = "--dry-run" in sys.argv


ALIASES_TO_EXISTING = {
    "almazen": "al-mazen",
    "albero": "albero-dei-gelati",
    "bakebun": "bakebun-bakery",
    "beer4yu": "beer4u",
    "blanche": "blanche-brasil",
    "bráz-trattoria": "braz-trattoria",
    "braz-trattoria": "braz-trattoria",
    "c-do-padre": "c-do-padre",
    "coffee-walk": "coffe-walk",
    "guaco": "gua-co",
    "hm-food-cafe": "hm-food-cafe",
    "miya-winer-bar-e-restaurante": "miya-wine-bar",
    "nos-otros": "nos-outros",
    "ogres-tatto-e-piercing": "ogres-tatoo",
    "sake-umi": "sakeumi-restaurante",
    "taba-pasteis-e-salgados": "taba-pasteis-e-salgados",
    "the-taco-shop": "the-taco-shop",
    "trinca-bar-e-vermuteria": "trinca-bar",
    "vino": "vino",
}


CANONICAL_TITLES = {
    "braz-elletrica": "Bráz Elettrica",
    "glow-coffe-protein": "Glow Coffee Protein",
    "kaji-coffe-e-curio-market": "Kaji Coffee & Curio Market",
    "na-garagem": "Na Garagem",
}


SLUG_OVERRIDES = {
    "braz-elletrica": "braz-elettrica",
    "glow-coffe-protein": "glow-coffee-protein",
    "kaji-coffe-e-curio-market": "kaji-coffee-e-curio-market",
}


CATEGORY_OVERRIDES = {
    "beauty-glow": "servicos",
    "casa-bugbee": "produtos",
    "casa-ocre-autoral": "produtos",
    "cristal-casamia": "produtos",
    "cvc": "servicos",
    "dance-glow": "servicos",
    "quiropraxia-pinheiros": "servicos",
}


SMALL_ADDRESS_WORDS = {"da", "das", "de", "do", "dos", "e"}


@dataclass
class Phone:
    tipo: str
    numero: str
    formatado: str


@dataclass
class Address:
    logradouro: str
    numero: str
    complemento: str = ""
    telefones: list[Phone] = field(default_factory=list)


@dataclass
class RawEntry:
    title: str
    lines: list[str] = field(default_factory=list)


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_value = ascii_value.lower().replace("&", " e ")
    return re.sub(r"[^a-z0-9]+", "-", ascii_value).strip("-")


def yaml_str(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def title_address(value: str) -> str:
    value = re.sub(r"^av\.\s+", "Avenida ", value, flags=re.IGNORECASE)
    value = re.sub(r"^r\.\s+", "Rua ", value, flags=re.IGNORECASE)
    words = []
    for index, word in enumerate(value.split()):
        lower = word.lower()
        if index > 0 and lower in SMALL_ADDRESS_WORDS:
            words.append(lower)
        elif word.isupper() and len(word) <= 3:
            words.append(word)
        else:
            words.append(word[:1].upper() + word[1:].lower())
    return " ".join(words)


def format_phone(digits: str, fallback: str) -> str:
    if len(digits) == 10:
        return f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
    if len(digits) == 11:
        return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
    return fallback.strip()


def clean_phone_label(value: str) -> str:
    value = re.sub(r"^\((?:tel|telefone|whatsapp)\)\s*", "", value, flags=re.IGNORECASE)
    return value.strip()


def is_phone_line(value: str) -> bool:
    lower = value.lower()
    if lower == "whatsapp":
        return True
    if any(token in lower for token in ("rua ", "av.", "avenida ", "mercado ")):
        return False
    return len(re.sub(r"\D", "", value)) >= 8


def parse_phone(value: str) -> Phone:
    clean = clean_phone_label(value)
    digits = re.sub(r"\D", "", clean)
    tipo = "whatsapp" if "whatsapp" in value.lower() else "telefone"
    return Phone(tipo=tipo, numero=digits, formatado=format_phone(digits, clean))


def append_complement(address: Address, value: str) -> None:
    value = value.strip().rstrip(".")
    if not value:
        return
    address.complemento = f"{address.complemento} - {value}" if address.complemento else value


def parse_address(value: str) -> Address | None:
    matches = list(re.finditer(r"\b\d+[A-Za-z]?\b", value))
    if not matches:
        return None

    match = matches[0]
    logradouro = title_address(value[: match.start()].strip(" ,"))
    numero = match.group(0)
    complemento = value[match.end() :].strip(" ,")
    complemento = complemento[:1].upper() + complemento[1:] if complemento else ""

    if not logradouro:
        return None

    return Address(logradouro=logradouro, numero=numero, complemento=complemento)


def parse_entries(text: str) -> list[RawEntry]:
    entries: list[RawEntry] = []
    current: RawEntry | None = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if re.match(r"^Endereco\s+\d+:", line, flags=re.IGNORECASE):
            if current:
                current.lines.append(line)
            continue

        if line.startswith("-"):
            if current:
                current.lines.append(line[1:].strip())
            continue

        current = RawEntry(title=line)
        entries.append(current)

    return entries


def parse_addresses(entry: RawEntry) -> list[Address]:
    addresses: list[Address] = []
    current_address: Address | None = None
    last_phone: Phone | None = None

    for line in entry.lines:
        if re.match(r"^Endereco\s+\d+:", line, flags=re.IGNORECASE):
            current_address = None
            last_phone = None
            continue

        if is_phone_line(line):
            if line.lower() == "whatsapp":
                if last_phone:
                    last_phone.tipo = "whatsapp"
                continue

            phone = parse_phone(line)
            if current_address is None and addresses:
                current_address = addresses[-1]
            if current_address is not None:
                current_address.telefones.append(phone)
                last_phone = phone
            continue

        parsed_address = parse_address(line)
        if parsed_address:
            addresses.append(parsed_address)
            current_address = parsed_address
            last_phone = None
        elif current_address:
            append_complement(current_address, line)

    return addresses


def render_markdown(title: str, slug: str, category: str, addresses: list[Address]) -> str:
    lines = [
        "---",
        f"title: {yaml_str(title)}",
        f"slug: {yaml_str(slug)}",
        f"category: {yaml_str(category)}",
        "enderecos:",
    ]

    for address in addresses:
        lines.extend(
            [
                f"  - logradouro: {yaml_str(address.logradouro)}",
                f"    numero: {yaml_str(address.numero)}",
            ]
        )
        if address.complemento:
            lines.append(f"    complemento: {yaml_str(address.complemento)}")
        if address.telefones:
            lines.append("    telefones:")
            for phone in address.telefones:
                lines.extend(
                    [
                        f"      - tipo: {yaml_str(phone.tipo)}",
                        f"        numero: {yaml_str(phone.numero)}",
                        f"        formatado: {yaml_str(phone.formatado)}",
                    ]
                )

    lines.extend(
        [
            "source:",
            '  path: "digitado.txt"',
            '  filename: "digitado.txt"',
            "---",
            "",
            f"# {title}",
            "",
            "Informações da experiência em atualização.",
            "",
        ]
    )
    return "\n".join(lines)


def existing_slugs() -> set[str]:
    return {path.stem for path in CONTENT_DIR.rglob("*.md")}


def main() -> int:
    if not INPUT_PATH.exists():
        print(f"Arquivo não encontrado: {INPUT_PATH}")
        return 1

    entries = parse_entries(INPUT_PATH.read_text(encoding="utf-8"))
    existing = existing_slugs()
    created = 0
    skipped = 0

    for entry in entries:
        raw_slug = slugify(entry.title)
        existing_alias = ALIASES_TO_EXISTING.get(raw_slug, raw_slug)
        if existing_alias in existing:
            skipped += 1
            continue

        title = CANONICAL_TITLES.get(raw_slug, entry.title.strip())
        slug = SLUG_OVERRIDES.get(raw_slug, slugify(title))
        if slug in existing:
            skipped += 1
            continue

        category = CATEGORY_OVERRIDES.get(slug, "restaurantes")
        addresses = parse_addresses(entry)
        if not addresses:
            print(f"sem endereço, pulando: {entry.title}")
            skipped += 1
            continue

        target = CONTENT_DIR / category / f"{slug}.md"
        print(f"{'criaria' if DRY_RUN else 'criando'} {target.relative_to(ROOT)}")
        if not DRY_RUN:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(render_markdown(title, slug, category, addresses), encoding="utf-8")
        created += 1

    print()
    print(f"{'Criaria' if DRY_RUN else 'Criados'}: {created}")
    print(f"Pulados: {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
