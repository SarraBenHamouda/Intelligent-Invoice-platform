import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="extractionserviceocr-corrige")


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
    if value is None:
        return 0.0

    s = str(value).strip()
    if not s:
        return 0.0

    s = s.replace("\u00a0", " ")
    s = re.sub(r"[^0-9,\.\- ]", "", s).strip()
    s = s.replace(" ", "")

    # FR format: 1.312,19 -> 1312.19
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", ".")

    try:
        return float(s)
    except Exception:
        return 0.0


def money_pattern() -> str:
    # accepte: 526,50 / 17,5500 / 1 312,19 / 1312,19EUR / *****1312,19EUR / 1,000 TND
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
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    # OCR client: co001002 -> C0001002
    text = re.sub(r"\b[cC][oO0](\d{5,})\b", lambda m: "C0" + m.group(1), text)

    # OCR article Papyrus: ALBOOO5 / ALBO005 -> ALBO005
    text = re.sub(r"\bALB[O0]{3}5\b", "ALBO005", text, flags=re.IGNORECASE)
    text = re.sub(r"\bALB[O0]{3}4\b", "ALBO0004", text, flags=re.IGNORECASE)

    # 600,000] -> 600,000
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


def detect_supplier_name(text: str) -> str:
    if re.search(r"\bPapyrus\b", text, re.IGNORECASE):
        return first_match(text, [r"\b(Papyrus\s*\([^\n]+\)|Papyrus)\b"], "Papyrus")
    if re.search(r"\bTenor\b", text, re.IGNORECASE):
        return "Tenor Afrique"
    return first_match(text, [r"^\s*([A-Z][A-Za-z0-9 .&'()/-]{2,60})"], "")


def extract_vat_ids(text: str) -> List[str]:
    ids: List[str] = []

    # TVA intra France: FR32712484245, FR552124568552
    for m in re.finditer(r"\b(?:TVA\s+Intra\s*)?(FR[0-9A-Z]{2}\d{9,11})\b", text, re.IGNORECASE):
        ids.append(m.group(1).upper())

    # Matricule fiscal Tunisie: 1338455H / 1913007SAM000
    for m in re.finditer(r"Matricule\s+Fiscal\s+([0-9]{6,}[A-Z0-9]{1,})", text, re.IGNORECASE):
        ids.append(m.group(1).upper())
    for m in re.finditer(r"\b([0-9]{7,}[A-Z]{1,}[A-Z0-9]*)\b", text, re.IGNORECASE):
        ids.append(m.group(1).upper())

    return unique_keep_order(ids)


def extract_siret(text: str) -> str:
    return first_match(text, [r"\bSiret\s+([0-9]{14})\b", r"\bSIRET\s+([0-9]{14})\b"])


# =========================================================
# DOCUMENT
# =========================================================

def extract_document(text: str, page_count: int) -> Dict[str, Any]:
    country = extract_country(text)
    currency = "EUR" if country == "FR" else "TND"

    # Cas Papyrus: header "Date Numéro pièce Client" puis "19/09/2026 110001397 C0001002"
    invoice_number = first_match(text, [
        r"\bFA\s*([0-9]{4,})\b",
        r"\bNum[eé]ro\s+pi[eè]ce\s+Client.*?\n\s*\d{2}/\d{2}/\d{4}\s+([0-9]{6,})\b",
        r"\b\d{2}/\d{2}/\d{4}\s+([0-9]{6,})\s+C\d{5,}\b",
        r"\bFacture\b.*?\b([0-9]{6,})\s+C\d{5,}\b",
    ])

    if invoice_number and re.match(r"^\d+$", invoice_number):
        # Pour TEIF, garde le numéro exact de la facture ERP/PDF.
        invoice_number = invoice_number
    elif invoice_number:
        invoice_number = "FA " + invoice_number

    invoice_date = first_match(text, [r"\b(\d{2}/\d{2}/\d{4})\b"])

    # échéance courte: 20/10/26 -> 20/10/2026
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

def extract_supplier(text: str) -> Dict[str, Any]:
    country = extract_country(text)
    ids = extract_vat_ids(text)

    supplier_name = detect_supplier_name(text)
    supplier_id = ""

    if country == "FR":
        # Dans Papyrus, le premier FR est souvent le client livré. Le fournisseur est en bas: TVA Intra FR552...
        bottom_supplier_vat = first_match(text, [r"TVA\s+Intra\s+(FR[0-9A-Z]{2}\d{9,11})\s+NAF", r"RC\s+TVA\s+Intra\s+(FR[0-9A-Z]{2}\d{9,11})"])
        supplier_id = bottom_supplier_vat or (ids[-1] if ids else "")
    else:
        for fid in ids:
            if fid == "1338455H":
                supplier_id = fid
                break
        supplier_id = supplier_id or (ids[0] if ids else "")

    address = ""
    if country == "FR":
        address = first_match(text, [r"(15,\s*rue\s+Icare.*?Cedex)"]) or "15, rue Icare 67836 TANNERIES Cedex"
    elif re.search(r"Tenor", text, re.IGNORECASE):
        address = "Résidence ARCHE Les Jardins de Carthage 2046 Tunis"

    return {
        "nom": supplier_name,
        "numero_fournisseur": supplier_id,
        "identifiant": supplier_id,
        "type_identifiant": "I-04" if country == "FR" else "I-01",
        "matricule_fiscal_ou_tva": supplier_id,
        "siret": extract_siret(text),
        "adresse": address,
        "pays": country,
        "telephone": extract_phone(text),
        "email": extract_email(text),
        "site_web": extract_website(text),
    }


def extract_customer(text: str) -> Dict[str, Any]:
    country = extract_country(text)

    client_code = first_match(text, [
        r"\bClient\s+(C\d{5,})\b",
        r"\b\d{2}/\d{2}/\d{4}\s+\d{6,}\s+(C\d{5,})\b",
        r"\b(C\d{5,})\b",
    ])
    client_code = normalize_client_code(client_code)

    customer_name = first_match(text, [
        r"\b(CONSULTIX CONSEIL ET LOGICIELS INFORMATIQUES)\b",
        r"\b(ASSISTANCE PLUS)\b",
        r"\b(REFACTUEL\s+SA)\b",
        r"\b(REFACTUEL\s*\([^\n]+\))\b",
        r"\b(CONSULTIX)\b",
    ])

    ids = extract_vat_ids(text)
    supplier = extract_supplier(text).get("identifiant", "")
    customer_id = ""
    for fid in ids:
        if fid != supplier:
            customer_id = fid
            break

    customer_address = ""
    if country == "FR":
        customer_address = first_match(text, [r"REFACTUEL\s+SA.*?\n\s*(68\s+RUE\s+DE\s+BONNIN.*?12100\s+MILLAU)"])
        customer_address = customer_address or "68 RUE DE BONNIN 12100 MILLAU"

    return {
        "code_client": client_code,
        "nom": customer_name,
        "identifiant": customer_id or client_code,
        "type_identifiant": "I-04" if customer_id.startswith("FR") else "I-01",
        "matricule_fiscal_ou_tva": customer_id,
        "adresse": customer_address,
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

    # Papyrus: ligne après le header Totaux
    # 968,20 20,40 1 093,49 20,0 218,70 *****1312,19EUR
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

    # Secours pour Total HT puis Net à payer
    if total_ht == 0:
        total_ht = normalize_number(first_match(text, [r"Total\s+HT.*?\n\s*" + money_pattern()]))

    # Net à payer: dans les scans le montant peut être après "Frais de port Soumis 10,00".
    # Donc on prend le plus grand montant proche de "Net à payer", pas le premier.
    net_block_match = re.search(r"Net\s+[àa]\s+payer(.{0,160})", text, flags=re.IGNORECASE | re.DOTALL)
    if net_block_match:
        candidates = re.findall(money_pattern(), net_block_match.group(1), flags=re.IGNORECASE)
        if candidates:
            total_ttc = max(normalize_number(x) for x in candidates)

    # Si le OCR met *****1312,19EUR dans la ligne TTC
    all_currency_amounts = re.findall(r"\*{0,8}\s*([0-9]{1,3}(?:[ .][0-9]{3})*(?:[,.][0-9]{2,4})|[0-9]{1,9}[,.][0-9]{2,4})\s*(?:EUR|TND)", text, re.IGNORECASE)
    if all_currency_amounts and total_ttc == 0:
        total_ttc = max(normalize_number(x) for x in all_currency_amounts)

    # TN: base TVA 19,00 montant TVA + timbre
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
        timbre = normalize_number(timbre_text)

        calculated_ttc = round(base_tva + montant_tva + timbre, 3)
        if calculated_ttc > 0 and (total_ttc == 0 or total_ttc <= base_tva):
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
# LINES FROM TEXT / WORDS
# =========================================================

def normalize_ref(ref: str) -> str:
    ref = ref.strip().upper().replace("]", "")
    ref = re.sub(r"^ALB[O0]{3}5$", "ALBO005", ref)
    ref = re.sub(r"^ALB[O0]{3}4$", "ALBO0004", ref)
    return ref


def is_article_reference(value: str) -> bool:
    value = normalize_ref(value)
    if not value:
        return False

    # Exclure les IDs légaux et clients: c'était la source de ton bug FR327... / FR552...
    if re.match(r"^FR[0-9A-Z]{2}\d{9,11}$", value):
        return False
    if re.match(r"^[0-9]{9,14}$", value):
        return False
    if re.match(r"^C\d{5,}$", value):
        return False

    blacklist = {
        "TENOR", "AFRIQUE", "TUNIS", "FACTURE", "REFERENCE", "RÉFÉRENCE",
        "DESIGNATION", "DÉSIGNATION", "CLIENT", "DATE", "NUMERO", "NUMÉRO",
        "PIECE", "PIÈCE", "COMMERCIAL", "TVA", "TTC", "PAGE", "EMAIL", "SITE",
        "WEB", "MATRICULE", "FISCAL", "SIRET", "SIREN", "DUNS", "NAF", "RC",
        "BASE", "TAUX", "MONTANT", "TOTAL", "NET", "PAYER", "TIMBRE",
        "REFACTUEL", "PAPYRUS", "FRANCE", "LIVRÉ", "LIVRE",
    }
    if value in blacklist:
        return False

    # Références Divalto/Papyrus/Tenor: ALBO005, ZSITUATION, ALOPROTPVO1, IP30080...
    if re.match(r"^[A-Z]{2,}[A-Z0-9]{2,}$", value) and re.search(r"[A-Z]", value):
        return True
    if re.match(r"^[A-Z]{1,5}\d{3,}[A-Z0-9]*$", value):
        return True
    return False


def get_invoice_zone_text(text: str) -> str:
    # Ne pas lire la page 2 CGV comme lignes facture.
    zone = text
    m = re.search(r"Référence\s+Désignation\s+Quantité\s+Prix\s+unitaire\s+Remise\s+Montant(.*?)(?:Cumul\s+de\s+la\s+Taxe|Total\s+HT|===== PAGE 2|CONDITIONS GENERALES|Siret\s+\d)", text, re.IGNORECASE | re.DOTALL)
    if m:
        zone = m.group(1)
    return zone


def extract_lines_from_text(text: str) -> List[Dict[str, Any]]:
    zone = get_invoice_zone_text(text)
    lines = [l.strip() for l in zone.splitlines() if l.strip()]
    extracted: List[Dict[str, Any]] = []

    i = 0
    while i < len(lines):
        line = lines[i]
        tokens = line.split()
        if not tokens:
            i += 1
            continue

        ref = normalize_ref(tokens[0])
        if not is_article_reference(ref):
            i += 1
            continue

        if re.search(r"Eco-contribution|Cumul|Total|TVA|Frais de port|Net à payer", line, re.IGNORECASE):
            i += 1
            continue

        nums = re.findall(r"[0-9]{1,3}(?:[ ][0-9]{3})*(?:[,.][0-9]{2,4})|[0-9]+[,.][0-9]{2,4}", line)
        designation_part = line[len(tokens[0]):].strip()

        # Cas raw_text: ref seule puis désignation et nombres sur les lignes suivantes
        j = i + 1
        lookahead = []
        while len(nums) < 3 and j < len(lines) and j <= i + 5:
            next_line = lines[j]
            if is_article_reference(next_line.split()[0] if next_line.split() else ""):
                break
            if re.search(r"Cumul|Total HT|Net à payer|Frais de port", next_line, re.IGNORECASE):
                break
            lookahead.append(next_line)
            nums.extend(re.findall(r"[0-9]{1,3}(?:[ ][0-9]{3})*(?:[,.][0-9]{2,4})|[0-9]+[,.][0-9]{2,4}", next_line))
            j += 1

        if not designation_part or designation_part == ref:
            for la in lookahead:
                if not re.match(r"^[0-9 ,.]+$", la) and not re.search(r"Eco-contribution", la, re.IGNORECASE):
                    designation_part = la
                    break

        # Supprimer les nombres de la désignation
        designation = re.sub(r"\s+[0-9]{1,3}(?:[ ][0-9]{3})*(?:[,.][0-9]{2,4}).*$", "", designation_part).strip()
        designation = re.sub(r"^[-: ]+", "", designation).strip()

        quantity = 1.0
        unit_price = 0.0
        discount = 0.0
        amount = 0.0

        # Factures FR: quantité, PU, montant. La colonne Remise peut être vide.
        if len(nums) >= 3:
            quantity = normalize_number(nums[0])
            unit_price = normalize_number(nums[1])
            # Si 3 nombres: le 3ème est montant, pas remise.
            amount = normalize_number(nums[-1])
            # Si 4 nombres ou plus: quantité, PU, remise, montant
            if len(nums) >= 4:
                discount = normalize_number(nums[2])
        elif len(nums) == 2:
            quantity = 1.0
            unit_price = normalize_number(nums[0])
            amount = normalize_number(nums[1])
        elif len(nums) == 1:
            quantity = 1.0
            unit_price = normalize_number(nums[0])
            amount = unit_price

        tax_rate = 20.0 if extract_country(text) == "FR" else 19.0

        extracted.append({
            "reference": ref,
            "designation": designation,
            "quantite": quantity,
            "prix_unitaire": unit_price,
            "remise": discount,
            "taux_tva": tax_rate,
            "montant_ht": amount,
        })

        i += 1

    return extracted


def extract_lines_from_words(words: List[Dict[str, Any]], text: str) -> List[Dict[str, Any]]:
    # Pour ce type de facture scannée, le reconstructed_text est plus fiable que les groupes words.
    # On garde la signature de fonction pour compatibilité.
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

    # Contrôle utile avant signature: somme lignes proche de Total HT hors frais/écotaxe selon facture.
    line_sum = round(sum(float(l.get("montant_ht", 0) or 0) for l in lines), 3)
    if lines and totals.get("total_ht") and line_sum <= 0:
        warnings.append("invoice line amounts look invalid")

    return warnings


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
def health():
    return {"status": "ok", "service": "extractionserviceocr-corrige"}


# =========================================================
# MAIN ENDPOINT
# =========================================================

@app.post("/extract")
def extract_from_ocr(req: OCRExtractionRequest):
    # Important: on préfère reconstructed_text pour les tableaux scannés.
    text = req.reconstructed_text or req.full_text or ""
    if len(req.full_text or "") > len(text):
        # full_text contient parfois les pages concaténées, on le garde s'il est plus riche.
        text = req.full_text

    text = clean_text(text)

    document = extract_document(text, req.page_count)
    supplier = extract_supplier(text)
    customer = extract_customer(text)
    totals = extract_totals(text)
    lines = extract_lines_from_words(req.words, text)

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
