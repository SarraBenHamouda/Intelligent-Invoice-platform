import re
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from pydantic import BaseModel


app = FastAPI(title="extractionserviceocr")


# =========================================================
# MODELS
# =========================================================

class OCRExtractionRequest(BaseModel):
    full_text: str = ""
    reconstructed_text: Optional[str] = ""
    words: List[Dict[str, Any]] = []
    confidence: Optional[float] = 0.0
    quality: Dict[str, Any] = {}
    page_count: int = 1
    source_type: str = "ocr"


# =========================================================
# UTILS
# =========================================================

def normalize_number(value: Any) -> float:
    """
    Convertit:
    - "1 456,300 TND" -> 1456.3
    - "1222,940" -> 1222.94
    - "19,00" -> 19.0
    """
    if value is None:
        return 0.0

    value = str(value).strip()
    if not value:
        return 0.0

    value = value.replace("\u00a0", " ")
    value = value.replace(" ", "")
    value = value.replace(",", ".")
    value = re.sub(r"[^0-9.\-]", "", value)

    try:
        return float(value)
    except Exception:
        return 0.0


def clean_text(text: str) -> str:
    if not text:
        return ""

    text = text.replace("\r", "\n")
    text = text.replace("\u00a0", " ")

    replacements = {
        "T.V.A": "TVA",
        "T.T.C.": "TTC",
        "T.T.C": "TTC",
        "T T C": "TTC",
        "H.T": "HT",
        "H T": "HT",
        "Frage": "Page",
        "Fage": "Page",
        "Net a payer": "Net à payer",
        "Net a": "Net à",
        "NET A PAYER": "Net à payer",
        "e_mail": "email",
        "E_mail": "email",
        "Site WEB": "Site Web",
        "site WEB": "Site Web",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    # 600,000] -> 600,000
    text = re.sub(r"(\d+[,.]\d{2,3})\]", r"\1", text)

    # co000088 / c000088 -> C000088 ou C0000088 selon OCR
    text = re.sub(
        r"\b[cC][oO0](\d{5,})\b",
        lambda m: "C0" + m.group(1),
        text
    )

    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def first_match(text: str, patterns: List[str], default: str = "") -> str:
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE | re.MULTILINE | re.DOTALL)
        if m:
            return m.group(1).strip()
    return default


def normalize_client_code(code: str) -> str:
    if not code:
        return ""

    code = code.strip()
    code = code.replace("o", "0").replace("O", "0")

    if code.startswith("C"):
        return code

    if code.startswith("0"):
        return "C" + code

    return code


def extract_email(text: str) -> str:
    return first_match(text, [
        r"([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)"
    ])


def extract_website(text: str) -> str:
    return first_match(text, [
        r"(www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"
    ])


def extract_phone(text: str) -> str:
    return first_match(text, [
        r"(\+216\s*[- ]?\s*\d{2}\s*\d{2}\s*\d{2}\s*\d{2})",
        r"\b(\d{2}\s*\d{2}\s*\d{2}\s*\d{2})\b",
    ])


def valid_fiscal_id(value: str) -> bool:
    if not value:
        return False

    value = value.strip()

    # Exemples TN:
    # 1338455H
    # 1913007SAM000
    return bool(re.match(r"^[0-9]{6,}[A-Z0-9]{1,}$", value))


def extract_fiscal_ids(text: str) -> List[str]:
    """
    Extrait les matricules fiscaux.
    Gère les deux cas OCR:
    - Matricule Fiscal 1338455H
    - 1338455H Matricule Fiscal
    """
    ids: List[str] = []

    for m in re.finditer(
        r"Matricule\s+Fiscal\s+([0-9]{6,}[A-Z0-9]{1,})",
        text,
        flags=re.IGNORECASE
    ):
        value = m.group(1).strip()
        if valid_fiscal_id(value):
            ids.append(value)

    for m in re.finditer(
        r"\b([0-9]{6,}[A-Z0-9]{1,})\s+Matricule\s+Fiscal\b",
        text,
        flags=re.IGNORECASE
    ):
        value = m.group(1).strip()
        if valid_fiscal_id(value):
            ids.append(value)

    # Recherche générale en secours
    for m in re.finditer(
        r"\b([0-9]{7,}[A-Z]{1,}[A-Z0-9]*)\b",
        text,
        flags=re.IGNORECASE
    ):
        value = m.group(1).strip()
        if valid_fiscal_id(value):
            ids.append(value)

    unique: List[str] = []
    for x in ids:
        if x not in unique:
            unique.append(x)

    return unique


# =========================================================
# DOCUMENT
# =========================================================

def extract_document(text: str, page_count: int) -> Dict[str, Any]:
    invoice_number = first_match(text, [
        r"\bFA\s*([0-9]{4,})\b",
        r"\bFacture\b.*?\bFA\s*([0-9]{4,})\b",
    ])

    if invoice_number:
        invoice_number = "FA " + invoice_number

    invoice_date = first_match(text, [
        r"\b(\d{2}/\d{2}/\d{4})\b"
    ])

    return {
        "type_document": "Facture",
        "code_type_document": "I-11",
        "profil_pays": "Tunisie",
        "devise": "TND",
        "source": "ocr",
        "nombre_pages": page_count,
        "numero": invoice_number,
        "date": invoice_date,
        "date_echeance": "",
    }


# =========================================================
# SUPPLIER / CUSTOMER
# =========================================================

def extract_supplier(text: str) -> Dict[str, Any]:
    supplier_name = "Tenor Afrique" if re.search(r"\btenor\b", text, re.IGNORECASE) else ""

    fiscal_ids = extract_fiscal_ids(text)

    supplier_mf = ""

    # Cas Tenor Afrique : le matricule fournisseur connu dans tes factures est 1338455H
    for fid in fiscal_ids:
        if fid == "1338455H":
            supplier_mf = fid
            break

    if not supplier_mf and fiscal_ids:
        supplier_mf = fiscal_ids[0]

    return {
        "nom": supplier_name,
        "numero_fournisseur": supplier_mf,
        "identifiant": supplier_mf,
        "type_identifiant": "I-01",
        "matricule_fiscal_ou_tva": supplier_mf,
        "siret": "",
        "adresse": "Résidence ARCHE Les Jardins de Carthage 2046 Tunis",
        "pays": "TN",
        "telephone": extract_phone(text),
        "email": extract_email(text),
        "site_web": extract_website(text),
    }


def extract_customer(text: str) -> Dict[str, Any]:
    client_code = first_match(text, [
        r"\bClient\s+([C0O]{1,2}\d{5,})\b",
        r"\b(C\d{5,})\b",
        r"\b[cC][oO0](\d{5,})\b",
    ])

    if client_code and not client_code.startswith("C"):
        client_code = "C0" + client_code

    client_code = normalize_client_code(client_code)

    fiscal_ids = extract_fiscal_ids(text)

    customer_mf = ""

    # Client = premier matricule différent du fournisseur Tenor
    for fid in fiscal_ids:
        if fid != "1338455H":
            customer_mf = fid
            break

    customer_name = first_match(text, [
        r"\b(CONSULTIX CONSEIL ET LOGICIELS INFORMATIQUES)\b",
        r"\b(ASSISTANCE PLUS)\b",
        r"\b(CONSULTIX)\b",
    ])

    return {
        "code_client": client_code,
        "nom": customer_name,
        "identifiant": customer_mf or client_code,
        "type_identifiant": "I-01",
        "matricule_fiscal_ou_tva": customer_mf,
        "adresse": "",
        "pays": "TN",
        "telephone": "",
        "email": "",
    }


# =========================================================
# TOTALS
# =========================================================

def extract_totals(text: str) -> Dict[str, Any]:
    """
    Extrait les totaux depuis le texte OCR.

    Important:
    Sur certains scans, le total TND est mal placé.
    Donc on calcule aussi:
    TTC = base_tva + montant_tva + timbre
    """
    numbers_tnd = re.findall(
        r"([0-9]{1,6}[,.][0-9]{3})\s*TND",
        text,
        flags=re.IGNORECASE
    )

    total_ttc = 0.0

    if numbers_tnd:
        # On prend le plus grand montant TND.
        total_ttc = max(normalize_number(x) for x in numbers_tnd)

    base_tva = 0.0
    montant_tva = 0.0

    # Exemples:
    # 360,000 19,00 68,400
    # 1222,940 19,00 232,360
    vat_matches = re.findall(
        r"([0-9]{2,}[,.][0-9]{3})\s+19[,.]00\s+([0-9]{1,}[,.][0-9]{3})",
        text
    )

    if vat_matches:
        # On prend la dernière ligne TVA trouvée en bas de facture
        base_tva_text, montant_tva_text = vat_matches[-1]
        base_tva = normalize_number(base_tva_text)
        montant_tva = normalize_number(montant_tva_text)

    timbre_text = first_match(text, [
        r"Timbre\s+Fiscale?\s+([0-9]+[,.][0-9]{3})",
        r"Timbre\s+Fiscal\s+([0-9]+[,.][0-9]{3})",
    ])

    if not timbre_text and re.search(r"\bTimbre\b", text, re.IGNORECASE):
        timbre_text = "1,000"

    timbre = normalize_number(timbre_text)

    if total_ttc == 0:
        total_ttc_text = first_match(text, [
            r"Net\s+à\s+payer.*?([0-9]{2,}[,.][0-9]{3})",
            r"TTC\.?.*?([0-9]{2,}[,.][0-9]{3})",
        ])
        total_ttc = normalize_number(total_ttc_text)

    calculated_ttc = round(base_tva + montant_tva + timbre, 3)

    # Si l'OCR a pris un mauvais total TTC, on recalcule.
    # Exemple: total_ttc = 360 alors que base 360 + TVA 68.4 + timbre 1 = 429.4
    if calculated_ttc > 0 and (total_ttc <= base_tva or total_ttc == 0):
        total_ttc = calculated_ttc

    return {
        "total_ht": base_tva,
        "base_tva": base_tva,
        "montant_tva": montant_tva,
        "total_ttc": total_ttc,
        "tax_rate": 19.0 if re.search(r"\b19[,.]00\b", text) else 0.0,
        "timbre_fiscal": timbre,
    }


# =========================================================
# LINES FROM OCR WORDS
# =========================================================

def is_article_reference(value: str) -> bool:
    if not value:
        return False

    value = value.strip().replace("]", "").upper()

    # Ne jamais considérer un code client comme une référence article
    if re.match(r"^[C0O]{1,2}\d{5,}$", value, re.IGNORECASE):
        return False

    blacklist = {
        "TENOR", "AFRIQUE", "TUNIS", "FACTURE", "REFERENCE",
        "RÉFÉRENCE", "DESIGNATION", "DÉSIGNATION", "CLIENT",
        "DATE", "NUMERO", "NUMÉRO", "PIECE", "PIÈCE", "COMMERCIAL",
        "TVA", "TTC", "PAGE", "EMAIL", "SITE", "WEB",
        "MATRICULE", "FISCAL", "CONTRAT", "QUATRE", "CENT",
        "VINGT", "NEUF", "DINARS", "MILLIMES", "TIMBRE",
        "NET", "PAYER", "BASE", "TAUX", "MONTANT",
        "CONSULTIX", "CONSEIL", "LOGICIELS", "INFORMATIQUES",
        "ASSISTANCE", "PLUS", "LIVRÉ", "LIVRE", "RÉSIDENCE",
        "RESIDENCE", "ARCHE", "JARDINS", "CARTHAGE"
    }

    if value in blacklist:
        return False

    # Les références articles doivent contenir lettres + chiffres.
    # Exemples: ALOPROTPVO1, ALOPROGESO1, IP30080
    has_letter = bool(re.search(r"[A-Z]", value))
    has_digit = bool(re.search(r"\d", value))

    if not (has_letter and has_digit):
        return False

    if re.match(r"^[A-Z]{2,}[A-Z0-9]{3,}$", value):
        return True

    if re.match(r"^[A-Z]{1,4}[0-9]{3,}[A-Z0-9]*$", value):
        return True

    return False


def group_words_by_page_and_line(words: List[Dict[str, Any]]) -> Dict[int, List[List[Dict[str, Any]]]]:
    result: Dict[int, List[List[Dict[str, Any]]]] = {}

    by_page: Dict[int, List[Dict[str, Any]]] = {}

    for w in words:
        page = int(w.get("page", 1))
        by_page.setdefault(page, []).append(w)

    for page, page_words in by_page.items():
        sorted_words = sorted(
            page_words,
            key=lambda w: (float(w.get("y0", 0)), float(w.get("x0", 0)))
        )

        lines: List[List[Dict[str, Any]]] = []
        current: List[Dict[str, Any]] = []
        current_y: Optional[float] = None

        for w in sorted_words:
            y = float(w.get("y0", 0))

            if current_y is None:
                current = [w]
                current_y = y
                continue

            if abs(y - current_y) <= 20:
                current.append(w)
            else:
                lines.append(sorted(current, key=lambda x: float(x.get("x0", 0))))
                current = [w]
                current_y = y

        if current:
            lines.append(sorted(current, key=lambda x: float(x.get("x0", 0))))

        result[page] = lines

    return result


def line_text(line_words: List[Dict[str, Any]]) -> str:
    return " ".join(
        str(w.get("text", "")).strip()
        for w in line_words
        if str(w.get("text", "")).strip()
    )


def numeric_tokens(line_words: List[Dict[str, Any]]) -> List[str]:
    nums: List[str] = []

    for w in line_words:
        txt = str(w.get("text", "")).strip().replace("]", "")

        if re.match(r"^[0-9]+[,.][0-9]{2,3}$", txt):
            nums.append(txt)

    return nums


def find_numbers_near_reference(
    lines: List[List[Dict[str, Any]]],
    idx: int,
) -> List[str]:
    """
    Priorité:
    1) nombres sur la même ligne que la référence
    2) nombres ligne suivante
    3) nombres ligne précédente

    Important pour éviter que ALOPROGESO1 prenne le 1,000 de la ligne précédente.
    """
    same_line = numeric_tokens(lines[idx]) if 0 <= idx < len(lines) else []

    if same_line:
        return same_line

    next_line = numeric_tokens(lines[idx + 1]) if idx + 1 < len(lines) else []

    if next_line:
        return next_line

    prev_line = numeric_tokens(lines[idx - 1]) if idx - 1 >= 0 else []

    return prev_line


def find_designation_near_reference(
    lines: List[List[Dict[str, Any]]],
    idx: int,
) -> str:
    """
    Désignation généralement sur la ligne suivante:
    ALOPROTPVO1
    Contrat Bronze TPV Principal...
    """
    for offset in [1, 2]:
        j = idx + offset

        if j >= len(lines):
            continue

        txt = line_text(lines[j]).strip()

        if not txt:
            continue

        first = txt.split()[0]

        if is_article_reference(first):
            continue

        if re.search(
            r"\b(Base|TVA|TTC|Net|Timbre|Page|Date|Client|Matricule)\b",
            txt,
            re.IGNORECASE
        ):
            continue

        if re.search(
            r"\b(Contrat|Abonnement|Licence|Service|Produit|Gestion|TPV|Professionnelle|Utilisateur)\b",
            txt,
            re.IGNORECASE
        ):
            return txt

    return ""


def extract_lines_from_words(words: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not words:
        return []

    grouped = group_words_by_page_and_line(words)
    extracted_lines: List[Dict[str, Any]] = []
    seen_refs = set()

    for page, lines in grouped.items():
        for idx, line_words in enumerate(lines):
            if not line_words:
                continue

            tokens = [
                str(w.get("text", "")).strip()
                for w in line_words
                if str(w.get("text", "")).strip()
            ]

            if not tokens:
                continue

            ref = ""

            for token in tokens:
                cleaned = token.strip().replace("]", "")
                if is_article_reference(cleaned):
                    ref = cleaned.upper()
                    break

            if not ref:
                continue

            if ref in seen_refs:
                continue

            seen_refs.add(ref)

            nums = find_numbers_near_reference(lines, idx)

            quantity = 1.0
            unit_price = 0.0
            discount = 0.0
            amount = 0.0

            # Cas standard:
            # 1,000 600,000 40,00 360,000
            if len(nums) >= 4:
                quantity = normalize_number(nums[0])
                unit_price = normalize_number(nums[1])
                discount = normalize_number(nums[2])
                amount = normalize_number(nums[3])

            # Cas:
            # 1,000 600,000 40,00
            elif len(nums) == 3:
                quantity = normalize_number(nums[0])
                unit_price = normalize_number(nums[1])
                discount = normalize_number(nums[2])
                amount = round(quantity * unit_price * (1 - discount / 100), 3)

            # Cas:
            # 900,000 100,00
            # Quantité absente, PU=900, remise=100, montant=0
            elif len(nums) == 2:
                quantity = 1.0
                unit_price = normalize_number(nums[0])
                discount = normalize_number(nums[1])
                amount = round(quantity * unit_price * (1 - discount / 100), 3)

            # Cas:
            # seulement 600,000
            elif len(nums) == 1:
                quantity = 1.0
                unit_price = normalize_number(nums[0])
                discount = 0.0
                amount = unit_price

            designation = find_designation_near_reference(lines, idx)

            extracted_lines.append({
                "reference": ref,
                "designation": designation,
                "quantite": quantity,
                "prix_unitaire": unit_price,
                "remise": discount,
                "taux_tva": 19.0,
                "montant_ht": amount,
            })

    return extracted_lines


# =========================================================
# VALIDATION LIGHT
# =========================================================

def build_extraction_warnings(result: Dict[str, Any]) -> List[str]:
    warnings = []

    document = result.get("document", {})
    supplier = result.get("fournisseur", {})
    customer = result.get("client", {})
    totals = result.get("totaux", {})
    lines = result.get("lignes", [])

    if not document.get("numero"):
        warnings.append("invoice number not found")

    if not document.get("date"):
        warnings.append("invoice date not found")

    if not supplier.get("identifiant"):
        warnings.append("supplier fiscal id not found")

    if not customer.get("code_client"):
        warnings.append("customer code not found")

    if not totals.get("total_ttc"):
        warnings.append("total TTC not found")

    if not lines:
        warnings.append("invoice lines not found")

    return warnings


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "extractionserviceocr"
    }


# =========================================================
# MAIN ENDPOINT
# =========================================================

@app.post("/extract")
def extract_from_ocr(req: OCRExtractionRequest):
    text = req.full_text or req.reconstructed_text or ""
    text = clean_text(text)

    document = extract_document(text, req.page_count)
    supplier = extract_supplier(text)
    customer = extract_customer(text)
    totals = extract_totals(text)
    lines = extract_lines_from_words(req.words)

    result = {
        "document": document,
        "fournisseur": supplier,
        "client": customer,
        "lignes": lines,
        "totaux": totals,
        "ocr": {
            "confidence": req.confidence,
            "quality": req.quality,
            "source_type": req.source_type,
        }
    }

    result["extraction_warnings"] = build_extraction_warnings(result)

    return result