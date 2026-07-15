#!/usr/bin/env python3
"""
Gera data/questions.json a partir das duas planilhas na raiz do projeto:

  - "Perguntas da fase A1 e A2.xlsx"  -> bancos A1 (A1B01-A1B10) e A2 (A201-A210)
  - "Planilha de itens Fase B.xlsx"   -> banco B (5 metaforas x 3 etapas x 4 perguntas)

Uso:
    npm run build-questions          (ou: python3 scripts/build_questions.py)

Depois de gerar, rode `node scripts/seed.mjs` para levar ao Supabase e
`npm run gen-audio:openai` para gerar os audios dos textos novos.

Le .xlsx com a biblioteca padrao (zipfile + ElementTree) para nao adicionar
dependencia. Um .xlsx e um zip com XML dentro; as strings ficam num dicionario
compartilhado (sharedStrings.xml) e as celulas apontam para ele por indice.
"""
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
XLSX_A = ROOT / "Perguntas da fase A1 e A2.xlsx"
XLSX_B = ROOT / "Planilha de itens Fase B.xlsx"
GABARITO = ROOT / "data" / "gabarito-a1-a2.json"
CORRECOES = ROOT / "data" / "correcoes.json"
OUT = ROOT / "data" / "questions.json"
IMAGES = ROOT / "public" / "images"

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
FIXED_OPTION = "Não tenho certeza da resposta correta."

errors: list[str] = []


def fail(msg: str) -> None:
    errors.append(msg)


def read_sheet(path: Path) -> list[dict[str, str]]:
    """Linhas da primeira aba como dicts {coluna: texto}, ex. {'A': 'A1B01', ...}."""
    with zipfile.ZipFile(path) as z:
        shared = [
            "".join(t.text or "" for t in si.iter(NS + "t"))
            for si in ET.fromstring(z.read("xl/sharedStrings.xml"))
        ]
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))

    rows = []
    for row in sheet.iter(NS + "row"):
        cells = {}
        for c in row.iter(NS + "c"):
            col = re.match(r"[A-Z]+", c.get("r")).group()
            v = c.find(NS + "v")
            inline = c.find(NS + "is")
            if c.get("t") == "s" and v is not None:
                text = shared[int(v.text)]
            elif inline is not None:
                text = "".join(t.text or "" for t in inline.iter(NS + "t"))
            elif v is not None:
                text = v.text or ""
            else:
                text = ""
            text = re.sub(r"\s+", " ", text).strip()
            if text:
                cells[col] = text
        if cells:
            rows.append(cells)
    return rows[1:]  # descarta o cabecalho


def slug(text: str) -> str:
    """Minusculas sem acento, so a-z0-9 e _. Usado nas chaves de `step`."""
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def image_key(code: str, where: str) -> str | None:
    """'IA1B07' -> 'faseA/07.jpg'; 'IA203' -> 'faseA2/03.jpg'; 'Nenhuma' -> None."""
    if not code or code.lower() in ("nenhuma", "nenhum", "-"):
        return None
    m = re.fullmatch(r"IA1B(\d{2})", code)
    if m:
        key = f"faseA/{m.group(1)}.jpg"
    else:
        m = re.fullmatch(r"IA2(\d{2})", code)
        if not m:
            fail(f"{where}: codigo de imagem nao reconhecido: {code!r}")
            return None
        key = f"faseA2/{m.group(1)}.jpg"
    if not (IMAGES / key).exists():
        fail(f"{where}: imagem {code!r} aponta para public/images/{key}, que nao existe")
    return key


def build_options(texts: list[str], correct_at: int, where: str) -> list[dict]:
    """texts na ordem da planilha; correct_at e o indice da correta."""
    options = []
    for i, text in enumerate(texts):
        if not text:
            fail(f"{where}: alternativa {'abcd'[i]} esta vazia")
        options.append(
            {
                "key": "abcd"[i],
                "text": text,
                "is_correct": i == correct_at,
                "is_fixed": text == FIXED_OPTION,
            }
        )

    if sum(o["is_correct"] for o in options) != 1:
        fail(f"{where}: precisa ter exatamente 1 alternativa correta")
    fixed = [o for o in options if o["is_fixed"]]
    if len(fixed) != 1:
        fail(f"{where}: precisa ter exatamente 1 alternativa {FIXED_OPTION!r}")
    elif fixed[0]["key"] != options[-1]["key"]:
        fail(f"{where}: {FIXED_OPTION!r} precisa ser a ultima alternativa da planilha")
    if any(o["is_correct"] and o["is_fixed"] for o in options):
        fail(f"{where}: a alternativa 'nao tenho certeza' foi marcada como correta")
    return options


def build_a1_a2() -> tuple[list[dict], list[dict]]:
    gabarito = {k: v for k, v in json.loads(GABARITO.read_text()).items() if not k.startswith("_")}
    banks: dict[str, list[dict]] = {"A1": [], "A2": []}

    for row in read_sheet(XLSX_A):
        code = row.get("B", "")
        where = f"A1/A2 {code}"
        bank = "A1" if row.get("A") == "A1B" else "A2"

        column = gabarito.get(code)
        if column is None:
            fail(f"{where}: sem entrada em data/gabarito-a1-a2.json")
            continue
        if column not in ("F", "G", "H"):
            fail(f"{where}: gabarito {column!r} invalido (esperado F, G ou H)")
            continue

        texts = [row.get(c, "") for c in "FGHI"]
        options = build_options(texts, "FGHI".index(column), where)
        number = int(re.sub(r"\D", "", code)[-2:])

        banks[bank].append(
            {
                "code": code,
                "bank": bank,
                "metaphor_number": number,
                "parent_metaphor_code": None,
                "etapa": None,
                "etapa_label": None,
                "step": None,
                "order_index": number,
                "metaphor": row.get("C"),
                "context": row.get("D"),
                "phrases": None,
                "image_key": image_key(row.get("J", ""), where),
                "question_text": row.get("E", ""),
                "options": options,
            }
        )

    return banks["A1"], banks["A2"]


# "Etapa 1: Causalidade (Veículo 2)" -> etapa 1, label "Causalidade", slot "Veículo 2".
ETAPA_RE = re.compile(r"Etapa\s*(\d)\s*:\s*([^(]+?)\s*\(\s*([^)]+?)\s*\)")
# Sufixo do `code`, por slot: Veículo 2 -> V2, Alvo 1 -> A1, Eq-Eq 3 -> EQ3, Metáfora 4 -> M4.
SLOT_ABBREV = {"veiculo": "V", "alvo": "A", "eqeq": "EQ", "metafora": "M"}


def build_b() -> list[dict]:
    out = []
    for i, row in enumerate(read_sheet(XLSX_B), start=1):
        parent = row.get("A", "")
        where = f"B {parent} linha {i + 1}"

        m = ETAPA_RE.fullmatch(row.get("C", ""))
        if not m:
            fail(f"{where}: coluna Etapa nao reconhecida: {row.get('C')!r}")
            continue
        etapa, label, slot = int(m.group(1)), m.group(2).strip(), m.group(3).strip()

        slot_name, slot_num = re.fullmatch(r"(.+?)\s*(\d+)", slot).groups()
        abbrev = SLOT_ABBREV.get(slug(slot_name))
        if abbrev is None:
            fail(f"{where}: slot desconhecido: {slot_name!r}")
            continue

        # A correta vem prefixada com "✔️ " na planilha; o prefixo nao vai pro app.
        texts, correct_at = [], None
        for j, col in enumerate("GHIJ"):
            text = row.get(col, "")
            if text.startswith("✔"):
                correct_at = j
                text = text.lstrip("✔️️ ").strip()
            texts.append(text)
        if correct_at is None:
            fail(f"{where}: nenhuma alternativa marcada com ✔️")
            continue

        # Coluna D: "(Apenas a pergunta)" na etapa 1; "Frase 1: X Frase 2: Y" na 2;
        # a historia completa na 3. `context` e o que vira audio; `phrases` so exibicao.
        raw = row.get("D", "")
        context = None if raw.startswith("(Apenas a pergunta)") else raw or None
        phrases = None
        if context and re.match(r"Frase\s*1\s*:", context):
            parts = [p.strip() for p in re.split(r"Frase\s*\d+\s*:", context) if p.strip()]
            phrases = parts or None

        out.append(
            {
                "code": f"{parent}-E{etapa}-{abbrev}{slot_num}",
                "bank": "B",
                "metaphor_number": int(parent[-2:]),
                "parent_metaphor_code": parent,
                "etapa": etapa,
                "etapa_label": label,
                "step": f"{slug(label)}_{slug(slot_name)}{slot_num}",
                "order_index": i,
                "metaphor": row.get("B"),
                "context": context,
                "phrases": phrases,
                "image_key": image_key(row.get("E", ""), where),
                "question_text": row.get("F", ""),
                "options": build_options(texts, correct_at, where),
            }
        )
    return out


def apply_correcoes(questions: list[dict]) -> int:
    """Aplica data/correcoes.json (erros de digitacao das planilhas) sobre os textos."""
    by_code = {q["code"]: q for q in questions}
    applied = 0

    for c in json.loads(CORRECOES.read_text())["correcoes"]:
        code, campo, where = c["code"], c["campo"], f"correcoes.json {c['code']}/{c['campo']}"
        q = by_code.get(code)
        if q is None:
            fail(f"{where}: code inexistente nas planilhas")
            continue

        if campo.startswith("option:"):
            target = next((o for o in q["options"] if o["key"] == campo.split(":")[1]), None)
            if target is None:
                fail(f"{where}: alternativa inexistente")
                continue
            key = "text"
        elif campo in ("context", "question_text"):
            target, key = q, campo
        else:
            fail(f"{where}: campo invalido")
            continue

        current = target.get(key) or ""
        n = current.count(c["de"])
        if n != 1:
            # Some quando a planilha e corrigida na origem: a correcao virou obsoleta.
            fail(
                f"{where}: o trecho {c['de']!r} aparece {n}x (esperado 1x). "
                f"Se a planilha ja foi corrigida, remova esta entrada de data/correcoes.json."
            )
            continue
        target[key] = current.replace(c["de"], c["para"])
        applied += 1

    return applied


def main() -> None:
    for path in (XLSX_A, XLSX_B, GABARITO, CORRECOES):
        if not path.exists():
            sys.exit(f"Arquivo nao encontrado: {path}")

    a1, a2, b = *build_a1_a2(), build_b()
    applied = apply_correcoes(a1 + a2 + b)

    codes = [q["code"] for q in a1 + a2 + b]
    for code in {c for c in codes if codes.count(c) > 1}:
        fail(f"code duplicado: {code} (precisa ser unico, e a chave do seed)")

    if errors:
        print(f"\n{len(errors)} erro(s) nas planilhas — questions.json NAO foi gerado:\n")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)

    OUT.write_text(
        json.dumps({"A1": a1, "A2": a2, "B": b}, ensure_ascii=False, indent=2) + "\n"
    )
    print(
        f"{OUT.relative_to(ROOT)}: A1={len(a1)}  A2={len(a2)}  B={len(b)}  "
        f"total={len(codes)}  ({applied} correcoes aplicadas)"
    )


if __name__ == "__main__":
    main()
