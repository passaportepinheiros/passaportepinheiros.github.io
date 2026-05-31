#!/usr/bin/env python3
"""
Analyzes each experience MD file and injects `tags` and `benefitType` frontmatter fields.
Run once: python3 scripts/add_tags.py
"""
import os
import re
import glob

# ─── Benefit type classification ──────────────────────────────────────────────
def classify_benefit(description: str, fsq: str) -> str:
    d = description.lower()
    # compre 1 leve 2 / acompanhante ganha outro
    if any(p in d for p in ["acompanhante ganha", "ganhe outro", "leve outro", "ganhe outra", "ganha outro", "ganha outra"]):
        return "compre-1-leve-outro"
    # desconto percentual
    if re.search(r"\d+\s*%\s*de\s*desconto", d) or re.search(r"50%|20%|30%|40%|60%|70%", d):
        return "desconto"
    # gift / brinde
    if any(p in d for p in ["ganhe 1", "ganhe um", "ganhe uma", "ganhe 1 fatia", "ganha 1", "ganha um"]):
        return "brinde"
    # isenção
    if "isençã" in d or "isento" in d or "isenção" in d:
        return "isencao-taxa"
    # desconto fixo R$
    if re.search(r"desconto de r\$|r\$\s*\d+", d):
        return "desconto"
    return "beneficio-especial"

# ─── Tag classification from foursquare category + description ─────────────────
FSQ_TAG_MAP = {
    "Coffee Shop": ["cafe"],
    "Bakery": ["padaria", "cafe"],
    "Pastry Shop": ["confeitaria", "doces"],
    "Dessert Shop": ["doces", "sobremesa"],
    "Gelato Shop": ["gelato", "sorvete", "sobremesa"],
    "Juice Bar": ["sucos", "saudavel"],
    "Bar": ["bar", "drinks"],
    "Beer Bar": ["bar", "chopp", "cerveja"],
    "Cocktail Bar": ["bar", "drinks", "coquetel"],
    "Wine Bar": ["bar", "vinho"],
    "Dive Bar": ["bar"],
    "Burger Joint": ["hamburguer", "lanche"],
    "Mac and Cheese Joint": ["confort-food"],
    "Comfort Food Restaurant": ["confort-food"],
    "BBQ Joint": ["churrasco", "carnes"],
    "Pizzeria": ["pizza"],
    "Italian Restaurant": ["italiana", "massas"],
    "French Restaurant": ["francesa"],
    "Japanese Restaurant": ["japonesa", "asiatica"],
    "Dumpling Restaurant": ["asiatica"],
    "Middle Eastern Restaurant": ["oriente-medio", "arabe"],
    "Brazilian Restaurant": ["brasileira"],
    "Northeastern Brazilian Restaurant": ["nordestina", "brasileira"],
    "Mexican Restaurant": ["mexicana"],
    "Tex-Mex Restaurant": ["mexicana"],
    "Taco Restaurant": ["mexicana"],
    "Tapas Restaurant": ["petiscos", "drinks"],
    "Restaurant": [],
    "Language School": ["escola", "idiomas"],
    "Dance Studio": ["danca", "aulas"],
    "Arts and Entertainment": ["entretenimento"],
    "Arts and Crafts Store": ["artesanato", "loja"],
    "Grocery Store": ["mercado", "loja"],
    "Pet Supplies Store": ["pet", "loja"],
    "Children's Clothing Store": ["infantil", "roupas", "loja"],
    "Bicycle Store": ["bicicleta", "loja"],
    "Water Park": ["lazer", "familia"],
}

DESC_TAG_MAP = [
    (["pizza", "pizz"], "pizza"),
    (["hamburguer", "burger", "lanche", "sanduíche"], "hamburguer"),
    (["churrasco", "carne assada"], "churrasco"),
    (["sushi", "temaki", "japonesa"], "japonesa"),
    (["sorvete", "sorveteria"], "sorvete"),
    (["gelato"], "gelato"),
    (["café", "coffee", "espresso", "cappuccino"], "cafe"),
    (["vinho", "wine", "clericot"], "vinho"),
    (["chopp", "chope", "cerveja", "beer"], "chopp"),
    (["coquetel", "drink", "coquetél"], "drinks"),
    (["pastel"], "pastel"),
    (["taco", "mexicano", "rodízio mexicano"], "mexicana"),
    (["árabe", "libanês", "kafta", "homus", "rodízio completo"], "arabe"),
    (["pão", "padaria", "cinnamon roll", "croissant"], "padaria"),
    (["doce", "torta", "bolo", "sobremesa", "caramelo"], "doces"),
    (["petisco", "porção"], "petiscos"),
    (["tattoo", "tatuagem", "piercing"], "tattoo"),
    (["dança", "aula de dança"], "danca"),
    (["veterinária", "pet", "animal"], "pet"),
    (["bicicleta", "bike"], "bicicleta"),
]

def get_tags(fsq: str, description: str, category: str) -> list:
    tags = set()
    fsq_tags = FSQ_TAG_MAP.get(fsq, [])
    tags.update(fsq_tags)

    d = description.lower()
    for keywords, tag in DESC_TAG_MAP:
        if any(kw in d for kw in keywords):
            tags.add(tag)

    # category-level fallback tags
    if category == "servicos":
        tags.add("servico")
    if category == "produtos":
        tags.add("produto")

    return sorted(tags)

# ─── Process files ─────────────────────────────────────────────────────────────
base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pattern = os.path.join(base, "src/content/experiencias/**/*.md")

updated = 0
skipped = 0

for filepath in glob.glob(pattern, recursive=True):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Skip if already has tags
    if "\ntags:" in content or "tags: [" in content:
        skipped += 1
        continue

    # Extract frontmatter block
    fm_match = re.match(r"^---\n(.*?)^---\n", content, re.DOTALL | re.MULTILINE)
    if not fm_match:
        print(f"  SKIP (no frontmatter): {filepath}")
        continue

    fm = fm_match.group(1)

    # Extract fields
    fsq_m = re.search(r'^categoria_fsq:\s*"([^"]+)"', fm, re.MULTILINE)
    fsq = fsq_m.group(1) if fsq_m else ""

    cat_m = re.search(r'^category:\s*"?([^"\n]+)"?', fm, re.MULTILINE)
    category = cat_m.group(1).strip() if cat_m else ""

    # Extract description (multiline block scalar)
    desc_m = re.search(r'^description: \|-\n((?:[ \t]+.*\n?)+)', fm, re.MULTILINE)
    if desc_m:
        desc = re.sub(r'\s+', ' ', desc_m.group(1)).strip()
    else:
        # inline description
        desc_m2 = re.search(r'^description:\s+"?(.+)"?$', fm, re.MULTILINE)
        desc = desc_m2.group(1).strip() if desc_m2 else ""

    tags = get_tags(fsq, desc, category)
    benefit_type = classify_benefit(desc, fsq)

    # Build injection text - insert before closing ---
    tags_yaml = "tags: [" + ", ".join(f'"{t}"' for t in tags) + "]"
    benefit_yaml = f'benefitType: "{benefit_type}"'

    # Insert before the closing ---
    new_fm = fm.rstrip("\n") + f"\n{tags_yaml}\n{benefit_yaml}\n"
    new_content = content[:fm_match.start(1)] + new_fm + content[fm_match.end(1):]

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_content)

    updated += 1
    print(f"  OK  [{benefit_type:22}] {os.path.basename(filepath)}: {tags}")

print(f"\nDone: {updated} updated, {skipped} skipped.")
