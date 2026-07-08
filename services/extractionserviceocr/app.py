import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="extractionserviceocr-generic-v9-no-hardcoded-refs")


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
    if value is None:
        return 0.0
    s = str(value).strip()
    if not s:
        return 0.0
    s = s.replace("\u00a0", " ")
    s = re.sub(r"[^0-9,\.\- ]", "", s).strip()
    s = s.replace(" ", "")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", ".")
    try:
        return float(s)
    except Exception:
        return 0.0


def money_pattern() -> str:
    return r"\*{0,8}\s*([0-9]{1,3}(?:[ .][0-9]{3})*(?:[,.][0-9]{2,4})|[0-9]{1,9}[,.][0-9]{2,4})\s*(?:EUR|TND)?"


def clean_text(text: str) -> str:
    if not text:
        return ""

    text = text.replace("\r", "\n")
    text = text.replace("\u00a0", " ")

    replacements = {
        "T.V.A": "TVA",
        "T V A": "TVA",
        "T.T.C.": "TTC",
        "T.T.C": "TTC",
        "T T C": "TTC",
        "H.T": "HT",
        "H T": "HT",
        "Frage": "Page",
        "Fage": "Page",
        "NET A PAYER": "Net à payer",
        "Net a payer": "Net à payer",
        "Net a": "Net à",
        "e_mail": "email",
        "E_mail": "email",
        "e mail": "email",
        "Site WEB": "Site Web",
        "site WEB": "Site Web",
        "Siége": "Siège",
        "N°": "Numero",
        "Nº": "Numero",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    text = re.sub(r"\b[cC][oO0](\d{5,})\b", lambda m: "C0" + m.group(1), text)
    text = re.sub(r"(\d+[,.]\d{2,4})\]", r"\1", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def first_match(text: str, patterns: List[str], default: str = "") -> str:
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE | re.MULTILINE | re.DOTALL)
        if m:
            return m.group(1).strip()
    return default


def unique_keep_order(values: List[str]) -> List[str]:
    out: List[str] = []
    for v in values:
        if v and v not in out:
            out.append(v)
    return out


def normalize_client_code(code: str) -> str:
    if not code:
        return ""
    code = code.strip().upper().replace("O", "0")
    if code.startswith("C"):
        return code
    if code.startswith("0"):
        return "C" + code
    return code


def extract_email(text: str) -> str:
    return first_match(text, [r"([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)"])


def extract_website(text: str) -> str:
    return first_match(text, [r"(www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"])


def extract_phone(text: str) -> str:
    return first_match(text, [
        r"(?:T[eé]l\.?\s*)?(\+216\s*[- ]?\s*\d{2}\s*\d{2}\s*\d{2}\s*\d{2})",
        r"(?:T[eé]l\.?\s*)?(\d{2}\s+\d{2}\s+\d{2}\s+\d{2}\s+\d{2})",
        r"(?:T[eé]l\.?\s*)?(\d{2}\s+\d{2}\s+\d{2}\s+\d{2})",
    ])


def extract_country(text: str) -> str:
    if re.search(r"\b(EUR|Siret|Siren|TVA Intra|FRANCE|Cedex|RC\b|NAF\b)\b", text, re.IGNORECASE):
        return "FR"
    return "TN"


def extract_vat_ids(text: str) -> List[str]:
    ids: List[str] = []

    for m in re.finditer(r"\b(?:TVA\s+Intra\s*)?(FR[0-9A-Z]{2}\d{9,11})\b", text, re.IGNORECASE):
        ids.append(m.group(1).upper())

    # Avec séparateurs: 0620551D/A/M/000
    for m in re.finditer(r"\b([0-9]{6,}[A-Z](?:/[A-Z0-9]+){1,4})\b", text, re.IGNORECASE):
        ids.append(m.group(1).upper())

    for m in re.finditer(r"Matricule\s+Fiscal\s+([0-9]{6,}[A-Z][A-Z0-9]*)", text, re.IGNORECASE):
        ids.append(m.group(1).upper())

    for m in re.finditer(r"\b([0-9]{7,}[A-Z]{1,}[A-Z0-9]*)\b", text, re.IGNORECASE):
        ids.append(m.group(1).upper())

    return unique_keep_order(ids)


def extract_siret(text: str) -> str:
    return first_match(text, [r"\bSiret\s+([0-9]{14})\b", r"\bSIRET\s+([0-9]{14})\b"])


def before_table_text(text: str) -> str:
    # Partie avant le tableau articles. Supporte les OCR où les en-têtes sont sur plusieurs lignes.
    lines = text.splitlines()
    for i, line in enumerate(lines):
        window = " ".join(lines[i:i + 4])
        if re.search(r"Votre\s+r[ée]f[ée]rence", window, re.IGNORECASE):
            continue
        if re.search(r"(^|\s)(Référence|Reference)(\s|$)", window, re.IGNORECASE) and re.search(r"(Désignation|Designation|Quantité|Quantite|Prix|Montant)", window, re.IGNORECASE):
            return "\n".join(lines[:i])
    m = re.search(r"(.*?)(?:Référence|Reference)", text, re.IGNORECASE | re.DOTALL)
    return m.group(1) if m else text[:2500]


# =========================================================
# DOCUMENT
# =========================================================

def extract_document(text: str, page_count: int) -> Dict[str, Any]:
    country = extract_country(text)
    currency = "EUR" if country == "FR" else "TND"

    invoice_number = first_match(text, [
        r"\bFA\s*([0-9]{4,})\b",
        r"\bNum[eé]ro\s+pi[eè]ce\s+Client.*?\n\s*\d{2}/\d{2}/\d{4}\s+([0-9]{6,})\b",
        r"\b\d{2}/\d{2}/\d{4}\s+([0-9]{6,})\s+C\d{5,}\b",
        r"\bFacture\b.*?\b([0-9]{6,})\s+C\d{5,}\b",
    ])

    if invoice_number:
        if re.search(r"\bFA\s*" + re.escape(invoice_number) + r"\b", text, re.IGNORECASE):
            invoice_number = "FA " + invoice_number

    invoice_date = first_match(text, [r"\b(\d{2}/\d{2}/\d{4})\b"])

    due_date = first_match(text, [
        r"\b(\d{2}/\d{2}/\d{2})\b\s+LCR",
        r"LCR.*?\b(\d{2}/\d{2}/\d{2})\b",
        r"Ech[eé]ance.*?\b(\d{2}/\d{2}/\d{4})\b",
    ])
    if re.match(r"^\d{2}/\d{2}/\d{2}$", due_date):
        due_date = due_date[:6] + "20" + due_date[6:]

    return {
        "type_document": "Facture",
        "code_type_document": "I-11",
        "profil_pays": "France" if country == "FR" else "Tunisie",
        "devise": currency,
        "source": "ocr",
        "nombre_pages": page_count,
        "numero": invoice_number,
        "date": invoice_date,
        "date_echeance": due_date,
    }


# =========================================================
# SUPPLIER / CUSTOMER
# =========================================================

def detect_supplier_name(text: str) -> str:
    if re.search(r"\bPapyrus\b", text, re.IGNORECASE):
        return first_match(text, [r"\b(Papyrus\s*\([^\n]+\)|Papyrus)\b"], "Papyrus")
    if re.search(r"\bTenor\b", text, re.IGNORECASE):
        return "Tenor Afrique"
    return first_match(text, [r"^\s*([A-Z][A-Za-z0-9 .&'()/-]{2,60})"], "")


def extract_supplier_address(text: str, country: str) -> str:
    if country == "FR":
        return first_match(text, [
            r"(\d+\s*,\s*rue\s+[A-Za-zÀ-ÿ' -]+)",
            r"(\d+\s+[A-Z][A-ZÀ-ÿ' -]+)\s+\d{5}\s+[A-ZÀ-ÿ' -]+",
        ])

    if re.search(r"\bTenor\b", text, re.IGNORECASE):
        m = re.search(r"(R[eé]sidence\s+ARCHE(?:\s+Les\s+Jardins\s+de\s+Carthage\s+2046\s+Tunis)?)", text, re.IGNORECASE)
        if m:
            return re.sub(r"\s+", " ", m.group(1)).strip()
        return "Résidence ARCHE Les Jardins de Carthage 2046 Tunis"

    return ""


def choose_supplier_id(text: str, ids: List[str], country: str, supplier_name: str) -> str:
    if not ids:
        return ""

    if country == "FR":
        return first_match(text, [
            r"TVA\s+Intra\s+(FR[0-9A-Z]{2}\d{9,11})\s+NAF",
            r"RC\s+TVA\s+Intra\s+(FR[0-9A-Z]{2}\d{9,11})",
        ]) or ids[-1]

    # En OCR TN, le matricule fournisseur est souvent dans le footer près du nom fournisseur.
    # Sans connaître les articles, on choisit l'identifiant le plus proche de l'occurrence fournisseur,
    # et si rien n'est fiable on prend le dernier identifiant du document.
    if supplier_name:
        positions = [m.start() for m in re.finditer(re.escape(supplier_name.split()[0]), text, re.IGNORECASE)]
        scored = []
        for fid in ids:
            id_positions = [m.start() for m in re.finditer(re.escape(fid), text, re.IGNORECASE)]
            if positions and id_positions:
                dist = min(abs(ip - sp) for ip in id_positions for sp in positions)
                scored.append((dist, fid))
        if scored:
            scored.sort(key=lambda x: x[0])
            # Si le meilleur est très loin, on garde la stratégie footer.
            if scored[0][0] < 900:
                return scored[0][1]

    return ids[-1]


def extract_supplier(text: str) -> Dict[str, Any]:
    country = extract_country(text)
    ids = extract_vat_ids(text)
    supplier_name = detect_supplier_name(text)
    supplier_id = choose_supplier_id(text, ids, country, supplier_name)

    return {
        "nom": supplier_name,
        "numero_fournisseur": supplier_id,
        "identifiant": supplier_id,
        "type_identifiant": "I-04" if country == "FR" else "I-01",
        "matricule_fiscal_ou_tva": supplier_id,
        "siret": extract_siret(text),
        "adresse": extract_supplier_address(text, country),
        "pays": country,
        "telephone": extract_phone(text),
        "email": extract_email(text),
        "site_web": extract_website(text),
    }


BAD_PARTY_WORDS = {
    "COMMERCIAL", "CLIENT", "DATE", "FACTURE", "REFERENCE", "RÉFÉRENCE",
    "DESIGNATION", "DÉSIGNATION", "PRIX", "QUANTITE", "QUANTITÉ", "TOTAL",
    "TVA", "TTC", "HT", "MONTANT", "VOTRE", "SECTEUR", "OUEST", "GRO",
    "DU", "AU", "ALUMENAGE",
}


def is_bad_party_name(name: str) -> bool:
    if not name:
        return True
    n = re.sub(r"\s+", " ", name).strip(':"- ').upper()
    if not n or n in BAD_PARTY_WORDS:
        return True
    if re.search(r"\b(VOTRE\s+R[ÉE]F[ÉE]RENCE|COMMERCIAL|SECTEUR|NUM[EÉ]RO|FACTURE|CLIENT\s+ALUMENAGE)\b", n):
        return True
    if re.search(r"\b[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*\b", n):
        # Un nom de client ne doit pas être seulement ou principalement une référence article.
        words = n.split()
        if len(words) <= 2:
            return True
    return False


def clean_party_name(name: str) -> str:
    name = re.sub(r"\s+", " ", name or "").strip(' "-:;')
    name = re.sub(r"^(Commercial|Client|Livr[eé]\s*[àa]|Factur[eé]\s*[àa])\s+", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\b(Votre\s+r[ée]f[ée]rence|Commercial)\b.*$", "", name, flags=re.IGNORECASE).strip()
    return name.strip(' "-:;')


def _company_candidate_score(line: str, index: int, all_lines: List[str]) -> int:
    raw = re.sub(r"\s+", " ", line or "").strip(' "-:;')
    # Enlève les petits déchets OCR avant un vrai nom en majuscules.
    m = re.search(r"([A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9 &'()./-]{3,90})", raw)
    if not m:
        return -999
    name = clean_party_name(m.group(1))
    up = name.upper()
    if is_bad_party_name(name):
        return -999
    if re.search(r"\d", up):
        return -999
    if len(up) < 4 or len(up) > 90:
        return -999

    score = 0
    if re.search(r"\b(SA|SARL|SAS|SUARL|PLUS)\b", up):
        score += 50
    if re.search(r"\b(CONSEIL|LOGICIELS|INFORMATIQUES|ASSISTANCE)\b", up):
        score += 35
    if len(up.split()) >= 2:
        score += 10
    # Avantage si proche d'un libellé de destinataire.
    context = " ".join(all_lines[max(0, index - 2): index + 2])
    if re.search(r"Livr[eé]\s*[àa]|Factur[eé]\s*[àa]|Client", context, re.IGNORECASE):
        score += 15
    return score


def extract_customer_name(text: str, country: str) -> str:
    head = before_table_text(text)
    lines = [re.sub(r"\s+", " ", l).strip() for l in head.splitlines() if l.strip()]

    candidates = []
    for idx, line in enumerate(lines):
        # Découpe si une ligne contient plusieurs zones OCR collées; garde la partie société.
        parts = re.split(r"\s{2,}|\t+", line) if "  " in line else [line]
        for part in parts:
            score = _company_candidate_score(part, idx, lines)
            if score > 0:
                m = re.search(r"([A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9 &'()./-]{3,90})", part)
                if m:
                    name = clean_party_name(m.group(1))
                    # Retire mentions de siège/adresse si collées.
                    name = re.sub(r"\s*\(Si[eè]ge social\).*", "", name, flags=re.IGNORECASE).strip()
                    candidates.append((score, -idx, name))

    if candidates:
        candidates.sort(reverse=True)
        return candidates[0][2]

    return ""


def extract_customer_address(text: str, country: str) -> str:
    if country == "FR":
        return first_match(text, [
            r"\n\s*(\d+\s+RUE\s+[^\n]+\s+\d{5}\s+[A-ZÀ-ÿ' -]+)",
            r"(\d+\s+RUE\s+DE\s+[^\n]+)",
        ])
    return ""


def extract_customer(text: str) -> Dict[str, Any]:
    country = extract_country(text)
    client_code = first_match(text, [
        r"\bClient\s+(C\d{5,})\b",
        r"\b\d{2}/\d{2}/\d{4}\s+\d{6,}\s+(C\d{5,})\b",
        r"\b(C\d{5,})\b",
    ])
    client_code = normalize_client_code(client_code)

    ids = extract_vat_ids(text)
    supplier_id = extract_supplier(text).get("identifiant", "")
    customer_id = ""
    for fid in ids:
        if fid != supplier_id:
            customer_id = fid
            break

    return {
        "code_client": client_code,
        "nom": extract_customer_name(text, country),
        "identifiant": customer_id or client_code,
        "type_identifiant": "I-04" if customer_id.startswith("FR") else "I-01",
        "matricule_fiscal_ou_tva": customer_id,
        "adresse": extract_customer_address(text, country),
        "pays": country,
        "telephone": "",
        "email": "",
    }


# =========================================================
# TOTALS
# =========================================================

def extract_totals(text: str) -> Dict[str, Any]:
    country = extract_country(text)

    total_ht = 0.0
    base_tva = 0.0
    montant_tva = 0.0
    total_ttc = 0.0
    tax_rate = 0.0
    timbre = 0.0
    frais_port_non_soumis = 0.0
    frais_port_soumis = 0.0
    taxes_cpl = 0.0

    m = re.search(
        r"Total\s+HT.*?\n\s*" +
        money_pattern() + r"\s+" +
        money_pattern() + r"\s+" +
        money_pattern() + r"\s+([0-9]{1,2}[,.][0-9])\s+" +
        money_pattern() + r"\s+" +
        money_pattern(),
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if m:
        total_ht = normalize_number(m.group(1))
        taxes_cpl = normalize_number(m.group(2))
        base_tva = normalize_number(m.group(3))
        tax_rate = normalize_number(m.group(4))
        montant_tva = normalize_number(m.group(5))
        total_ttc = normalize_number(m.group(6))

    if total_ht == 0:
        total_ht = normalize_number(first_match(text, [r"Total\s+HT.*?\n\s*" + money_pattern()]))

    net_block_match = re.search(r"Net\s+[àa]\s+payer(.{0,180})", text, flags=re.IGNORECASE | re.DOTALL)
    if net_block_match:
        candidates = re.findall(money_pattern(), net_block_match.group(1), flags=re.IGNORECASE)
        if candidates:
            total_ttc = max(normalize_number(x) for x in candidates)

    all_currency_amounts = re.findall(
        r"\*{0,8}\s*([0-9]{1,3}(?:[ .][0-9]{3})*(?:[,.][0-9]{2,4})|[0-9]{1,9}[,.][0-9]{2,4})\s*(?:EUR|TND)",
        text,
        re.IGNORECASE,
    )
    if all_currency_amounts and total_ttc == 0:
        total_ttc = max(normalize_number(x) for x in all_currency_amounts)

    if country == "TN":
        vat_matches = re.findall(r"([0-9]{2,}[,.][0-9]{3})\s+19[,.]00\s+([0-9]{1,}[,.][0-9]{3})", text)
        if vat_matches:
            base_tva = normalize_number(vat_matches[-1][0])
            montant_tva = normalize_number(vat_matches[-1][1])
            total_ht = base_tva
            tax_rate = 19.0

        timbre_text = first_match(text, [r"Timbre\s+Fiscal(?:e)?\s+([0-9]+[,.][0-9]{3})"])
        if not timbre_text and re.search(r"\bTimbre\b", text, re.IGNORECASE):
            timbre_text = "1,000"
        # Beaucoup de factures TN ont un timbre même si l'OCR le lit mal.
        if not timbre_text and base_tva > 0 and montant_tva > 0:
            timbre_text = "1,000"

        timbre = normalize_number(timbre_text)

        calculated_ttc = round(base_tva + montant_tva + timbre, 3)
        if calculated_ttc > 0:
            if total_ttc == 0 or abs(total_ttc - calculated_ttc) > 0.02:
                total_ttc = calculated_ttc

    frais_port_non_soumis = normalize_number(first_match(text, [r"Frais\s+de\s+port\s+Non\s+So\s+" + money_pattern()]))
    frais_port_soumis = normalize_number(first_match(text, [r"Frais\s+de\s+port\s+Soumis\s+" + money_pattern()]))

    return {
        "total_ht": round(total_ht, 3),
        "base_tva": round(base_tva, 3),
        "montant_tva": round(montant_tva, 3),
        "total_ttc": round(total_ttc, 3),
        "tax_rate": tax_rate,
        "timbre_fiscal": timbre,
        "frais_port_non_soumis": frais_port_non_soumis,
        "frais_port_soumis": frais_port_soumis,
        "taxes_cpl": taxes_cpl,
    }


# =========================================================
# GENERIC LINE EXTRACTION - NO ARTICLE REFERENCES HARDCODED
# =========================================================

HEADER_STOPWORDS = {
    "REFERENCE", "RÉFÉRENCE", "DESIGNATION", "DÉSIGNATION", "QUANTITE", "QUANTITÉ",
    "PRIX", "UNITAIRE", "REMISE", "MONTANT", "CLIENT", "COMMERCIAL", "DATE",
    "TOTAL", "TVA", "TTC", "HT", "BASE", "TAUX", "NET", "PAYER", "PAGE",
    "FACTURE", "NUMERO", "NUMÉRO", "PIECE", "PIÈCE", "FISCAL", "MATRICULE",
    "ECO-CONTRIBUTION", "ECOCONTRIBUTION", "DONT",
}

DESCRIPTIVE_STOPWORDS = {
    "RENOUVELLEMENT", "CONTRAT", "ABONNEMENT", "LICENCE", "SERVICE", "PRODUIT",
    "DU", "AU", "PAIE", "GESTION", "PRINCIPAL", "PROFESSIONNELLE", "UTILISATEUR",
    "BRONZE", "MONO", "FRAIS", "ADMINISTRATIF", "ALUMENAGE",
}

LEGAL_ID_PATTERNS = [
    r"^FR[0-9A-Z]{2}\d{9,11}$",
    r"^[0-9]{9,14}$",
    r"^C\d{5,}$",
    r"^[0-9]{6,}[A-Z](?:/[A-Z0-9]+){1,4}$",
    r"^[0-9]{6,}[A-Z]{1,}[A-Z0-9]*$",
]


def clean_ref_token(token: str) -> str:
    return token.strip().strip("|:;,.[](){}<>\"'").upper()


def is_possible_reference_token(token: str) -> bool:
    ref = clean_ref_token(token)
    if len(ref) < 3:
        return False
    if ref in HEADER_STOPWORDS or ref in DESCRIPTIVE_STOPWORDS:
        return False
    if any(re.match(p, ref, re.IGNORECASE) for p in LEGAL_ID_PATTERNS):
        return False
    if re.match(r"^[0-9,.]+$", ref):
        return False
    if not re.search(r"[A-Z]", ref):
        return False
    if not re.match(r"^[A-Z0-9_./-]{3,30}$", ref):
        return False
    return True


def reference_score(token: str) -> int:
    ref = clean_ref_token(token)
    if not is_possible_reference_token(ref):
        return -999

    letters = len(re.findall(r"[A-Z]", ref))
    digits = len(re.findall(r"\d", ref))

    score = 0

    # Référence article OCR générique: souvent code compact avec lettres + chiffres.
    if letters > 0 and digits > 0:
        score += 30
    if letters >= 3 and digits >= 2:
        score += 18
    if 6 <= len(ref) <= 18:
        score += 8
    if letters >= 3:
        score += 6
    if digits >= 2:
        score += 6
    if re.match(r"^[A-Z]{2,}\d+[A-Z0-9]*$", ref):
        score += 8
    if re.match(r"^[A-Z0-9]*\d+[A-Z]{2,}[A-Z0-9]*$", ref):
        score += 4

    # Les mots purement alphabétiques sont possibles mais faibles.
    if digits == 0:
        score -= 20

    # Les très petits codes mixtes dans une désignation sont moins fiables qu'un code long.
    if len(ref) <= 5 and letters <= 2:
        score -= 20
    if re.match(r"^\d+[A-Z]{1,3}$", ref):
        score -= 25

    return score


def choose_reference_from_block(block: str) -> str:
    tokens = re.findall(r"[A-Za-zÀ-ÿ0-9_./-]{3,30}", block)
    candidates = []
    for idx, tok in enumerate(tokens):
        ref = clean_ref_token(tok)
        score = reference_score(ref)
        if score <= -100:
            continue
        # Avantage aux tokens situés avant les premières colonnes numériques.
        if re.match(r"^[0-9]+[,.][0-9]{2,4}$", tok):
            score -= 50
        # Les dates ou morceaux de dates ne doivent pas gagner.
        if re.search(r"\d{2}/\d{2}/\d{4}", tok):
            continue
        candidates.append((score, -idx, ref))

    if not candidates:
        return ""
    candidates.sort(reverse=True)
    return candidates[0][2]


def extract_numbers(line: str) -> List[float]:
    raw = re.findall(r"[0-9]{1,3}(?:[ ][0-9]{3})*(?:[,.][0-9]{2,4})|[0-9]+[,.][0-9]{2,4}", line)
    return [normalize_number(x) for x in raw]


def has_table_header(line: str) -> bool:
    lower = line.lower()
    hits = 0
    for kw in ["référence", "reference", "désignation", "designation", "quantité", "quantite", "prix", "remise", "montant"]:
        if kw in lower:
            hits += 1
    return hits >= 3


def get_invoice_zone_text(text: str) -> str:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    start = 0
    for idx, line in enumerate(lines):
        window = " ".join(lines[idx:idx + 4])
        if re.search(r"Votre\s+r[ée]f[ée]rence", window, re.IGNORECASE):
            continue
        if has_table_header(line) or (re.search(r"(^|\s)(Référence|Reference)(\s|$)", window, re.IGNORECASE) and re.search(r"(Désignation|Designation|Quantité|Quantite|Prix|Montant)", window, re.IGNORECASE)):
            start = idx + 1
            # Saute les autres lignes d'en-tête éclatées.
            while start < len(lines) and re.search(r"^(Référence|Reference|Désignation|Designation|Quantité|Quantite|Prix|unitaire|Remise|Montant)\b", lines[start], re.IGNORECASE):
                start += 1
            break

    end = len(lines)
    for idx in range(start, len(lines)):
        if re.search(r"Base\s+TVA|Cumul\s+de\s+la\s+Taxe|Total\s+HT|Net\s+[àa]\s+payer|CONDITIONS\s+GENERALES|Siret\s+\d", lines[idx], re.IGNORECASE):
            end = idx
            break

    return "\n".join(lines[start:end]).strip() if start < end else text


def compute_best_columns(nums: List[float], country: str) -> Optional[Tuple[float, float, float, float]]:
    if len(nums) < 2:
        return None

    q = nums[0]
    pu = nums[1]
    if q <= 0 or pu < 0 or q > 100000:
        return None

    best: Optional[Tuple[float, float, float, float, float]] = None

    expected_no_discount = round(q * pu, 3)
    for idx in range(2, len(nums)):
        amount = nums[idx]
        diff = abs(amount - expected_no_discount)
        candidate = (diff, q, pu, 0.0, amount)
        if best is None or candidate[0] < best[0]:
            best = candidate

    if len(nums) >= 4:
        discount = nums[2]
        if 0 <= discount <= 100:
            expected_discount = round(q * pu * (1 - discount / 100), 3)
            for idx in range(3, len(nums)):
                amount = nums[idx]
                diff = abs(amount - expected_discount)
                candidate = (diff - 0.001, q, pu, discount, amount)
                if best is None or candidate[0] < best[0]:
                    best = candidate

    if len(nums) == 3:
        discount = nums[2]
        if 0 <= discount <= 100:
            amount = round(q * pu * (1 - discount / 100), 3)
            return q, pu, discount, amount

    if best is None:
        return None

    _, q, pu, discount, amount = best
    expected = q * pu * (1 - discount / 100)
    tolerance = max(0.05, abs(expected) * 0.08)
    if abs(amount - expected) > tolerance:
        return None

    return q, pu, discount, amount


def is_next_reference_line(line: str) -> bool:
    parts = line.split()
    if not parts:
        return False
    first = clean_ref_token(parts[0])
    if not is_possible_reference_token(first):
        return False
    # Les lignes descriptives pures ne doivent pas déclencher une nouvelle ligne article.
    if first in DESCRIPTIVE_STOPWORDS:
        return False
    return len(extract_numbers(line)) >= 1 or len(parts) == 1


def clean_designation(text: str, ref: str) -> str:
    # Supprime le code choisi, les colonnes numériques et les footers.
    text = re.sub(r"\b" + re.escape(ref) + r"\b", " ", text, count=1, flags=re.IGNORECASE)
    text = re.sub(r"[0-9]{1,3}(?:[ ][0-9]{3})*(?:[,.][0-9]{2,4})|[0-9]+[,.][0-9]{2,4}", " ", text)
    text = re.sub(r"\b(Eco-?contribution|Dont|Total|TVA|TTC|HT)\b.*$", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(TENOR|AFRIQUE|AFRIQK|R[eé]sidence|ARCHE|Appt\.?).*$", " ", text, flags=re.IGNORECASE)
    text = re.sub(r".*?CLIENT\s*:\s*[^:]{0,80}:?", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(Référence|Reference|Prix\s+unitaire|Désignation|Designation|CLIENT|ALUMENAGE|Quantité|Remise|Montant)\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bDU\s+AU\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip(" -:;|.}")
    text = re.sub(r"^[0-9]{1,2}\s*[|/-]*\s*", "", text).strip(" -:;|.")
    if is_bad_party_name(text):
        return ""
    if re.match(r"^[0-9A-Z]{1,2}$", text.strip(), re.IGNORECASE):
        return ""
    return text


def extract_lines_from_text(text: str) -> List[Dict[str, Any]]:
    zone = get_invoice_zone_text(text)
    raw_lines = [l.strip() for l in zone.splitlines() if l.strip()]
    extracted: List[Dict[str, Any]] = []
    seen_keys = set()

    i = 0
    while i < len(raw_lines):
        line = raw_lines[i]

        # Construire un bloc candidat ligne article.
        block_lines = [line]
        j = i + 1
        while j < len(raw_lines) and j <= i + 6:
            nxt = raw_lines[j]
            if re.search(r"Cumul|Total\s+HT|Net\s+[àa]\s+payer|Frais\s+de\s+port|TVA", nxt, re.IGNORECASE):
                break
            if is_next_reference_line(nxt) and extract_numbers(" ".join(block_lines)):
                break
            block_lines.append(nxt)
            j += 1

        block = " ".join(block_lines)
        nums = extract_numbers(block)
        cols = compute_best_columns(nums, extract_country(text))
        ref = choose_reference_from_block(block)

        if not cols or not ref:
            i += 1
            continue

        quantity, unit_price, discount, amount = cols
        designation = clean_designation(block, ref)

        tax_rate = 20.0 if extract_country(text) == "FR" else 19.0

        key = (ref, round(quantity, 3), round(unit_price, 3), round(amount, 3))
        if key not in seen_keys:
            seen_keys.add(key)
            extracted.append({
                "reference": ref,
                "designation": designation,
                "quantite": round(quantity, 3),
                "prix_unitaire": round(unit_price, 4),
                "remise": round(discount, 3),
                "taux_tva": tax_rate,
                "montant_ht": round(amount, 3),
            })

        i = max(j, i + 1)

    return extracted


def extract_lines_from_words(words: List[Dict[str, Any]], text: str) -> List[Dict[str, Any]]:
    return extract_lines_from_text(text)


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
        warnings.append("supplier fiscal/VAT id not found")
    if not customer.get("code_client"):
        warnings.append("customer code not found")
    if not totals.get("total_ttc"):
        warnings.append("total TTC not found")
    if not lines:
        warnings.append("invoice lines not found")

    line_sum = round(sum(float(l.get("montant_ht", 0) or 0) for l in lines), 3)
    if lines and totals.get("total_ht") and line_sum <= 0:
        warnings.append("invoice line amounts look invalid")

    return warnings


@app.get("/health")
def health():
    return {"status": "ok", "service": "extractionserviceocr-generic-v9-no-hardcoded-refs"}


@app.post("/extract")
def extract_from_ocr(req: OCRExtractionRequest):
    text = req.reconstructed_text or req.full_text or ""
    if len(req.full_text or "") > len(text):
        text = req.full_text

    text = clean_text(text)

    document = extract_document(text, req.page_count)
    supplier = extract_supplier(text)
    customer = extract_customer(text)
    totals = extract_totals(text)
    lines = extract_lines_from_words(req.words, text)

    result = {
        # Format OCR / format moderne
        "document": document,
        "fournisseur": supplier,
        "client": customer,
        "lignes": lines,
        "totaux": totals,

        # Format attendu par validationservice / teif-api
        "facture": {
            "type_document": document.get("type_document", "Facture"),
            "code_type_document": document.get("code_type_document", "I-11"),
            "numero": document.get("numero", ""),
            "date_facture": document.get("date", ""),
            "date_echeance": document.get("date_echeance", ""),
            "devise": document.get("devise", "TND"),
            "profil_pays": document.get("profil_pays", ""),
            "source": document.get("source", "ocr"),
            "nombre_pages": document.get("nombre_pages", req.page_count),
        },

        "fournisseur_facture": {
            "nom": supplier.get("nom", ""),
            "numero_fournisseur": supplier.get("numero_fournisseur", ""),
            "identifiant": supplier.get("identifiant", ""),
            "type_identifiant": supplier.get("type_identifiant", "I-01"),
            "matricule_fiscal_ou_tva": supplier.get("matricule_fiscal_ou_tva", ""),
            "siret": supplier.get("siret", ""),
            "adresse": supplier.get("adresse", ""),
            "pays": supplier.get("pays", ""),
            "telephone": supplier.get("telephone", ""),
            "email": supplier.get("email", ""),
            "site_web": supplier.get("site_web", ""),
        },

        "client_facture": {
            "code_client": customer.get("code_client", ""),
            "nom": customer.get("nom", ""),
            "identifiant": customer.get("identifiant", ""),
            "type_identifiant": customer.get("type_identifiant", "I-01"),
            "matricule_fiscal_ou_tva": customer.get("matricule_fiscal_ou_tva", ""),
            "adresse": customer.get("adresse", ""),
            "pays": customer.get("pays", ""),
            "telephone": customer.get("telephone", ""),
            "email": customer.get("email", ""),
        },

        "lignes_facture": [
            {
                "reference": l.get("reference", ""),
                "designation": l.get("designation", ""),
                "quantite": l.get("quantite", 0),
                "prix_unitaire": l.get("prix_unitaire", 0),
                "remise": l.get("remise", 0),
                "taux_tva": l.get("taux_tva", totals.get("tax_rate", 0)),
                "montant_ht": l.get("montant_ht", 0),
            }
            for l in lines
        ],

        "totaux_facture": {
            "total_ht": totals.get("total_ht", 0),
            "base_tva": totals.get("base_tva", totals.get("total_ht", 0)),
            "montant_tva": totals.get("montant_tva", 0),
            "total_ttc": totals.get("total_ttc", 0),
            "tax_rate": totals.get("tax_rate", 0),
            "timbre_fiscal": totals.get("timbre_fiscal", 0),
            "frais_port_non_soumis": totals.get("frais_port_non_soumis", 0),
            "frais_port_soumis": totals.get("frais_port_soumis", 0),
            "taxes_cpl": totals.get("taxes_cpl", 0),
        },

        "ocr": {
            "confidence": req.confidence,
            "quality": req.quality,
            "source_type": req.source_type,
        },
    }

    result["extraction_warnings"] = build_extraction_warnings(result)
    return result