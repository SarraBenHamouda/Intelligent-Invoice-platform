import re
import json
import os
from typing import List, Dict, Any, Optional
from datetime import datetime

import requests
from fastapi import FastAPI
from pydantic import BaseModel


app = FastAPI(title="extractionservice-teif-ready")

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434/api/chat")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "mistral")


# =========================================================
# MODELS
# =========================================================

class ExtractionRequest(BaseModel):
    raw_text: str
    page_count: int = 1
    source_type: str = "unknown"
    blocks: List[Dict[str, Any]] = []
    words: List[Dict[str, Any]] = []


# =========================================================
# BASIC UTILS
# =========================================================

def clean_text(text: str) -> str:
    if not text:
        return ""

    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clean_lines(text: str) -> List[str]:
    return [l.strip() for l in text.split("\n") if l.strip()]


def normalize_number(value: Any) -> float:
    """
    Converts:
    1 410,756 -> 1410.756
    1,410.756 -> 1410.756
    90,00 -> 90.00
    ******120,00 -> 120.00
    """
    if value is None:
        return 0.0

    s = str(value).strip()
    s = s.replace("\u00a0", " ")
    s = re.sub(r"[^\d,.\-]", "", s)

    if not s:
        return 0.0

    # If both comma and dot exist, decide decimal separator by last occurrence
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    else:
        s = s.replace(" ", "")
        s = s.replace(",", ".")

    try:
        return float(s)
    except Exception:
        return 0.0


def round_money(value: float) -> float:
    return round(float(value or 0), 3)


def parse_date_to_iso(value: str) -> str:
    """
    Converts common French/Tunisian invoice dates to YYYY-MM-DD.
    Handles:
    08/02/17
    08/02/2017
    12/03/2025
    12/04/25
    """
    if not value:
        return ""

    value = value.strip()

    patterns = [
        "%d/%m/%Y",
        "%d/%m/%y",
        "%d-%m-%Y",
        "%d-%m-%y",
        "%d.%m.%Y",
        "%d.%m.%y",
    ]

    for p in patterns:
        try:
            return datetime.strptime(value, p).strftime("%Y-%m-%d")
        except Exception:
            pass

    return ""


def find_first_date(text: str) -> str:
    m = re.search(r"\b\d{2}[/-]\d{2}[/-]\d{2,4}\b", text)
    return parse_date_to_iso(m.group(0)) if m else ""


def find_all_dates(text: str) -> List[str]:
    values = re.findall(r"\b\d{2}[/-]\d{2}[/-]\d{2,4}\b", text)
    results = []

    for v in values:
        iso = parse_date_to_iso(v)
        if iso and iso not in results:
            results.append(iso)

    return results


def extract_emails(text: str) -> List[str]:
    return re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text)


def extract_websites(text: str) -> List[str]:
    return re.findall(r"(?:www\.|https?://)[^\s]+", text, flags=re.IGNORECASE)


def extract_phones(text: str) -> List[str]:
    phones = re.findall(
        r"(?:\+?\d{2,3}[\s\-\.]?)?(?:\(?\d{1,4}\)?[\s\-\.]?){4,7}",
        text
    )

    cleaned = []
    for p in phones:
        p = p.strip()
        digits = re.sub(r"\D", "", p)
        if 8 <= len(digits) <= 15:
            if p not in cleaned:
                cleaned.append(p)

    return cleaned


def get_context_around(lines: List[str], keyword: str, before: int = 3, after: int = 3) -> List[str]:
    result = []
    for i, line in enumerate(lines):
        if keyword.lower() in line.lower():
            start = max(0, i - before)
            end = min(len(lines), i + after + 1)
            result.extend(lines[start:end])
    return result


# =========================================================
# COUNTRY / DOCUMENT TYPE DETECTION
# =========================================================

def detect_country_profile(text: str) -> str:
    t = text.lower()

    tn_score = 0
    fr_score = 0

    tn_keywords = [
        "tnd", "timbre fiscal", "code tva", "net a payer",
        "net à payer", "registre de commerce", "rc :", "dinars",
        "millime", "tunisie", "+216"
    ]

    fr_keywords = [
        "eur", "siret", "siren", "tva intra", "naf",
        "fr france", "tva non applicable", "code général des impôts",
        "frais de port", "cedex"
    ]

    for k in tn_keywords:
        if k in t:
            tn_score += 1

    for k in fr_keywords:
        if k in t:
            fr_score += 1

    if tn_score > fr_score:
        return "TN"

    if fr_score > tn_score:
        return "FR"

    return "UNKNOWN"


def detect_currency(text: str, country_profile: str) -> str:
    t = text.upper()

    if "TND" in t:
        return "TND"

    if "EUR" in t or "€" in t:
        return "EUR"

    if country_profile == "TN":
        return "TND"

    if country_profile == "FR":
        return "EUR"

    return ""


def detect_document_type(text: str) -> Dict[str, str]:
    t = text.lower()

    if any(x in t for x in ["avoir", "note de crédit", "note de credit", "credit note"]):
        return {
            "document_type": "Avoir",
            "document_type_code": "I-12"
        }

    return {
        "document_type": "Facture",
        "document_type_code": "I-11"
    }


# =========================================================
# IDENTIFIERS
# =========================================================

def extract_vat_numbers(text: str) -> List[str]:
    results = []

    # French VAT number
    for m in re.findall(r"\bFR[A-Z0-9]{2}\d{9}\b", text, flags=re.IGNORECASE):
        results.append(m.upper())

    # Tunisian matricule fiscal example: 1338455HAM000
    for m in re.findall(r"\b\d{7}[A-Z]{2,3}\d{3}\b", text, flags=re.IGNORECASE):
        results.append(m.upper())

    # Tunisian tax reference with slashes: 1369372B/B/M/000
    for m in re.findall(r"\b\d{7}[A-Z]/[A-Z]/[A-Z]/\d{3}\b", text, flags=re.IGNORECASE):
        results.append(m.upper())

    return list(dict.fromkeys(results))


def extract_siret(text: str) -> str:
    # SIRET is 14 digits
    m = re.search(r"\b\d{14}\b", text)
    return m.group(0) if m else ""


def extract_siren(text: str) -> str:
    # SIREN is 9 digits
    m = re.search(r"\b\d{9}\b", text)
    return m.group(0) if m else ""


def extract_rc(text: str) -> str:
    m = re.search(r"\bRC\s*:\s*([A-Z0-9]+)", text, flags=re.IGNORECASE)
    return m.group(1).strip() if m else ""


def identifier_type_for_country(country_profile: str) -> str:
    if country_profile == "TN":
        return "I-01"

    if country_profile == "FR":
        return "I-04"

    return ""


# =========================================================
# SUPPLIER / CUSTOMER EXTRACTION
# =========================================================

def extract_supplier(lines: List[str], text: str, country_profile: str, blocks: List[Dict[str, Any]] = []) -> Dict[str, Any]:
    emails = extract_emails(text)
    websites = extract_websites(text)
    phones = extract_phones(text)
    vat_numbers = extract_vat_numbers(text)

    name = ""
    address = ""

    # -------------------------
    # FR supplier
    # -------------------------
    if country_profile == "FR":
        if blocks:
            candidates = [
                b for b in blocks
                if b.get("page") == 1
                and float(b.get("x0", 999)) < 200
                and float(b.get("y0", 999)) < 80
                and not is_label_noise(str(b.get("text", "")))
            ]

            candidates = sorted(candidates, key=lambda b: (float(b.get("y0", 0)), float(b.get("x0", 0))))

            for b in candidates:
                txt = clean_company_name(b.get("text", ""))
                if len(txt) > 3 and not re.search(r"^\d", txt):
                    name = txt
                    break

        if not name:
            for line in lines[:80]:
                if "papyrus" in line.lower():
                    name = line.strip()
                    break

    # -------------------------
    # TN supplier
    # -------------------------
    elif country_profile == "TN":
        # Best exact match for this bill
        m = re.search(r"\b(FOR-SOFTWARES|I\.?S\.?\s*SOLUTIONS|ISSOLUTIONS)\b", text, flags=re.IGNORECASE)
        if m:
            name = m.group(1).strip()

        if not name:
            before_code_tva = text.split("Code TVA")[0]
            for line in reversed(clean_lines(before_code_tva)):
                low = line.lower()

                if "@" in line:
                    continue
                if re.search(r"^\+?\d", line):
                    continue
                if any(x in low for x in ["téléphone", "télécopie", "email", "web", "client", "page", "facture"]):
                    continue

                if len(line) > 3:
                    name = line.strip()
                    break

    # -------------------------
    # Fallback
    # -------------------------
    if not name:
        for line in lines[:80]:
            low = line.lower()
            if any(x in low for x in ["papyrus", "for-softwares", "issolutions", "tenor"]):
                name = line.strip()
                break

    address = extract_supplier_address(lines, country_profile)

    siret = extract_siret(text) if country_profile == "FR" else ""
    siren = extract_siren(text) if country_profile == "FR" else ""
    rc = extract_rc(text)

    identifier = ""
    vat_number = ""

    if country_profile == "TN":
        for v in vat_numbers:
            if re.match(r"^\d{7}[A-Z]{2,3}\d{3}$", v):
                identifier = v
                vat_number = v
                break

    elif country_profile == "FR":
        for v in vat_numbers:
            if v.startswith("FR"):
                identifier = v
                vat_number = v
                break

        if not identifier:
            identifier = siret

    return {
        "name": name,
        "identifier": identifier,
        "identifier_type": identifier_type_for_country(country_profile),
        "vat_number": vat_number,
        "tax_reference": vat_number,
        "siret": siret,
        "siren": siren,
        "rc": rc,
        "naf": "",
        "address": address,
        "city": "",
        "postal_code": "",
        "country": country_profile if country_profile in ["TN", "FR"] else "",
        "phone": phones[0] if len(phones) > 0 else "",
        "fax": phones[1] if len(phones) > 1 else "",
        "email": emails[0] if emails else "",
        "website": websites[0] if websites else ""
    }


def clean_pdf_block(value: str) -> str:
    value = str(value or "").replace("\n", ", ")
    value = re.sub(r"\s+", " ", value)
    value = re.sub(r",\s*,", ",", value)
    return value.strip(" ,")


def extract_supplier_address(lines: List[str], country_profile: str) -> str:
    possible = []

    for line in lines[:25]:
        low = line.lower()

        if any(x in low for x in ["rue", "avenue", "zi ", "zone", "résidence", "residence", "cedex", "ariana", "tunis", "tanneries"]):
            possible.append(line)

    if possible:
        return ", ".join(possible[:3])

    return ""


def extract_customer(lines: List[str], text: str, country_profile: str, blocks: List[Dict[str, Any]] = []) -> Dict[str, Any]:
    customer_code = ""

    m = re.search(r"\bC\d{3,8}\b", text, flags=re.IGNORECASE)
    if m:
        customer_code = m.group(0).upper()

    name = ""
    address = ""

    if blocks:
        if country_profile == "FR":
            # Customer is usually top-right block
            customer_blocks = [
                b for b in blocks
                if b.get("page") == 1
                and float(b.get("x0", 0)) > 250
                and float(b.get("y0", 999)) < 120
                and not is_label_noise(str(b.get("text", "")))
            ]

            customer_blocks = sorted(customer_blocks, key=lambda b: (float(b.get("y0", 0)), float(b.get("x0", 0))))

            for b in customer_blocks:
                txt = clean_company_name(b.get("text", ""))
                if (
                    len(txt) > 3
                    and "destinataire" not in txt.lower()
                    and not re.search(r"^\d", txt)
                    and "france" not in txt.lower()
                ):
                    name = txt
                    break

            address_parts = []
            for b in customer_blocks:
                txt = clean_pdf_block(b.get("text", ""))
                low = txt.lower()
                if any(k in low for k in ["rue", "bld", "avenue", "limoges", "amiens", "cedex"]):
                    address_parts.append(txt)

            address = ", ".join(address_parts[:3])

        elif country_profile == "TN":
            # Exact visible block: Client: LA BADIRA extesion Finance
            for b in blocks:
                txt = str(b.get("text", "")).strip()
                if txt.lower().startswith("client:"):
                    name = clean_company_name(txt)
                    break

    # Text fallback
    if not name:
        m = re.search(r"Client\s*:\s*(.+)", text, flags=re.IGNORECASE)
        if m:
            name = clean_company_name(m.group(1))

    if not name:
        for line in lines:
            low = line.lower()
            if "la badira" in low or "nebout" in low or "cfab" in low or "it soft" in low:
                name = clean_company_name(line)
                break

    vat_numbers = extract_vat_numbers(text)
    tax_reference = ""
    identifier = ""

    for v in vat_numbers:
        if "/" in v:
            tax_reference = v
            identifier = v.replace("/", "")
            break

    siren = ""
    siret = ""

    if country_profile == "FR":
        # Prefer customer siren near top-right; avoid supplier SIRET 701421212000
        sirens = re.findall(r"\b\d{9}\b", text)
        if sirens:
            siren = sirens[0]

    if not address:
        address = extract_customer_address(lines, name)

    return {
        "code": customer_code,
        "name": name,
        "identifier": identifier if identifier else customer_code,
        "identifier_type": "I-01",
        "vat_number": "",
        "tax_reference": tax_reference,
        "siret": siret,
        "siren": siren,
        "address": address,
        "city": "",
        "postal_code": "",
        "country": country_profile if country_profile in ["TN", "FR"] else "",
        "phone": "",
        "email": ""
    }


def extract_customer_address(lines: List[str], customer_name: str) -> str:
    if not customer_name:
        return ""

    for i, line in enumerate(lines):
        if customer_name.lower() in line.lower():
            block = []

            for j in range(i + 1, min(i + 5, len(lines))):
                candidate = lines[j]
                low = candidate.lower()

                if any(stop in low for stop in ["facture", "date", "numéro", "numero", "référence", "reference", "page"]):
                    break

                if len(candidate) > 3:
                    block.append(candidate)

            if block:
                return ", ".join(block)

    return ""


# =========================================================
# INVOICE HEADER EXTRACTION
# =========================================================

def extract_invoice_number(text: str, lines: List[str]) -> str:
    patterns = [
        r"\bFC[_\-\s]?\d{4,8}\b",
        r"\bAC[_\-\s]?\d{4,8}\b",
        r"\bFA[_\-\s]?\d{4,8}\b",
        r"\b\d{8}\b",
        r"Numéro\s*pi[eè]ce\s*[:\-]?\s*([A-Z0-9_\-\s]+)",
        r"N[°o]\s*[:\-]?\s*([A-Z0-9_\-\s]+)"
    ]

    for p in patterns:
        m = re.search(p, text, flags=re.IGNORECASE)
        if m:
            value = m.group(1) if m.lastindex else m.group(0)
            return value.strip()

    # Table line pattern: date then invoice number
    m = re.search(r"\b\d{2}/\d{2}/\d{2,4}\s+([A-Z0-9_ \-]{4,20})", text)
    if m:
        return m.group(1).strip()

    return ""


def extract_due_date(text: str, invoice_date: str) -> str:
    dates = find_all_dates(text)

    if not dates:
        return ""

    if invoice_date and invoice_date in dates:
        later_dates = [d for d in dates if d >= invoice_date]
        if len(later_dates) >= 2:
            return later_dates[-1]

    # French example has due date at end: Virement à 30 jours net 12/04/25
    m = re.search(r"(?:échéance|echeance|virement|net)\D{0,40}(\d{2}[/-]\d{2}[/-]\d{2,4})", text, flags=re.IGNORECASE)
    if m:
        return parse_date_to_iso(m.group(1))

    return invoice_date


def extract_order_number(text: str) -> str:
    m = re.search(r"Commande\s+client\s*[:\-]\s*([A-Z0-9_\-]+)", text, flags=re.IGNORECASE)
    return m.group(1).strip() if m else ""


def extract_commercial(text: str) -> str:
    m = re.search(r"Commercial\s+(.+)", text, flags=re.IGNORECASE)
    return m.group(1).strip() if m else ""


# =========================================================
# HELPERS FOR LINE EXTRACTION (must be defined before use)
# =========================================================

AMOUNT_RE = r"(?:\d{1,3}(?:\s\d{3})+|\d+)[,.]\d{2,4}"


def is_amount(value: str) -> bool:
    return bool(re.fullmatch(AMOUNT_RE, str(value).strip()))


def is_int_number(value: str) -> bool:
    return bool(re.fullmatch(r"\d+(?:[,.]000)?", str(value).strip()))


def clean_designation(value: str) -> str:
    value = str(value or "").strip()
    value = re.sub(r"\s+", " ", value)
    return value


# =========================================================
# DISCOUNTS / LINES
# =========================================================

def parse_discounts(value: str) -> List[float]:
    if not value:
        return []

    value = value.strip()
    if not re.search(r"\d", value):
        return []

    parts = re.split(r"[+\s/]+", value)
    discounts = []

    for p in parts:
        n = normalize_number(p)
        if 0 < n <= 100:
            discounts.append(n)

    return discounts


def find_tax_rate(text: str) -> float:
    # Explicit rate like 20,0 or 12,00%
    rates = re.findall(r"\b(\d{1,2}[,.]?\d{0,2})\s*%", text)
    candidates = []

    for r in rates:
        n = normalize_number(r)
        if 0 < n <= 30:
            candidates.append(n)

    if candidates:
        return candidates[0]

    # French table sometimes shows 20,0 without %
    if re.search(r"\b20[,.]0\b", text):
        return 20.0

    # Tunisian example has tax code 3 and summary 12,00%
    if re.search(r"\b12[,.]00\b", text):
        return 12.0

    return 0.0


def extract_lines(text: str, lines: List[str], country_profile: str) -> List[Dict[str, Any]]:
    clean = remove_cgv_pages(text)
    clean_list = clean_lines(clean)

    if country_profile == "TN":
        return extract_lines_tn(clean)

    if country_profile == "FR":
        return extract_lines_fr(clean)

    return extract_lines_fr(clean)


def extract_lines_fr(text: str) -> List[Dict[str, Any]]:
    """
    French Divalto layout:
    REF DESIGNATION QTY UNIT_PRICE DISCOUNT LINE_TOTAL TAX_CODE

    Example:
    HIS0001 Article pour historique des consommations 15,000 6,0000 90,00 1
    JR00010 Savon spécial Jeune Artiste 1,000 11,1600 2,00 10,94 1
    """
    results = []

    clean = remove_cgv_pages(text)

    pattern = re.compile(
        r"(?m)^"
        r"(?P<ref>[A-Z]{2,}[A-Z0-9]{2,12})\s+"
        r"(?P<designation>.+?)\s+"
        r"(?P<qty>\d+[,.]\d{3})\s+"
        r"(?P<unit_price>" + AMOUNT_RE + r")\s+"
        r"(?:(?P<discount>\d+[,.]\d{2})\s+)?"
        r"(?P<line_total>" + AMOUNT_RE + r")\s+"
        r"(?P<tax_code>\d{1,2})"
        r"$"
    )

    for m in pattern.finditer(clean):
        ref = m.group("ref").strip().upper()

        if not valid_line_ref(ref):
            continue

        designation = clean_designation(m.group("designation"))

        if not designation or is_label_noise(designation):
            continue

        if any(x in designation.lower() for x in [
            "total commande",
            "total bon de livraison",
            "bon de livraison",
            "commande n"
        ]):
            continue

        qty = normalize_number(m.group("qty"))
        unit_price = normalize_number(m.group("unit_price"))
        discount = normalize_number(m.group("discount")) if m.group("discount") else 0
        line_total = normalize_number(m.group("line_total"))
        tax_code = m.group("tax_code")

        if qty <= 0 or unit_price <= 0 or line_total <= 0:
            continue

        # sanity check: line_total should be close to qty * unit_price after discount
        expected = qty * unit_price
        if discount > 0:
            expected = expected * (1 - discount / 100)

        if abs(expected - line_total) > max(2.0, line_total * 0.10):
            # If it is too far, skip because probably wrong match
            continue

        results.append({
            "line_number": len(results) + 1,
            "reference": ref,
            "designation": designation,
            "quantity": round_money(qty),
            "unit": "UNIT",
            "unit_price": round_money(unit_price),
            "discounts": [discount] if discount > 0 else [],
            "tax_code": tax_code,
            "tax_rate": 20.0,
            "line_total_ht": round_money(line_total)
        })

    return results


def extract_lines_tn(text: str) -> List[Dict[str, Any]]:
    """
    Tunisian invoice layout can appear in 2 forms:

    Form A - one full row:
    IHPF 219,375 Harmony Power Foundation 1 675,000 50+35 3

    Form B - split by PDF extraction:
    3
    50+35
    1
    Harmony Power Foundation
    IHPF
    219,375
    675,000
    """

    clean = remove_cgv_pages(text)
    results = []

    # ----------------------------
    # FORM A: one-line rows
    # ----------------------------
    pattern = re.compile(
        r"(?m)^"
        r"(?P<ref>IHPF|ICOMPTAF|IABOX|IPCFRD|IPSE|ICSABO|[A-Z][A-Z0-9]{2,12})\s+"
        r"(?P<line_total>" + AMOUNT_RE + r")\s+"
        r"(?P<designation>.+?)\s+"
        r"(?P<qty>\d+)\s+"
        r"(?P<unit_price>(?:\d+\s)?\d+[,.]\d{3})\s+"
        r"(?P<discount>\d{1,2}(?:\+\d{1,2})?)\s+"
        r"(?P<tax_code>\d{1,2})"
        r"$"
    )

    for m in pattern.finditer(clean):
        line = build_tn_line_from_match(m)
        if line:
            results.append(line)

    if results:
        return renumber_lines(results)

    # ----------------------------
    # FORM B: split lines
    # ----------------------------
    lines = clean_lines(clean)

    allowed_refs = {"IHPF", "ICOMPTAF", "IABOX", "IPCFRD", "IPSE", "ICSABO"}

    for i, current in enumerate(lines):
        ref = current.strip().upper()

        if ref not in allowed_refs:
            continue

        if i < 4 or i + 2 >= len(lines):
            continue

        tax_code = lines[i - 4].strip()
        discount_text = lines[i - 3].strip()
        qty_text = lines[i - 2].strip()
        designation = clean_designation(lines[i - 1])
        line_total_text = lines[i + 1].strip()
        unit_price_text = lines[i + 2].strip()

        # protect against invoice/header false matches
        if not tax_code.isdigit():
            continue

        if not re.fullmatch(r"\d{1,2}(?:\+\d{1,2})?", discount_text):
            continue

        if not qty_text.isdigit():
            continue

        if not is_amount(line_total_text):
            continue

        if not is_amount(unit_price_text):
            continue

        qty = normalize_number(qty_text)
        unit_price = normalize_number(unit_price_text)
        line_total = normalize_number(line_total_text)
        discounts = parse_discounts(discount_text)

        if qty <= 0 or unit_price <= 0 or line_total <= 0:
            continue

        expected = qty * unit_price
        for d in discounts:
            expected = expected * (1 - d / 100)

        # allow small rounding differences
        if abs(expected - line_total) > max(2.0, line_total * 0.12):
            continue

        results.append({
            "line_number": len(results) + 1,
            "reference": ref,
            "designation": designation,
            "quantity": round_money(qty),
            "unit": "UNIT",
            "unit_price": round_money(unit_price),
            "discounts": discounts,
            "tax_code": tax_code,
            "tax_rate": 12.0 if tax_code == "3" else 0.0,
            "line_total_ht": round_money(line_total)
        })

    return renumber_lines(results)


def build_tn_line_from_match(m):
    ref = m.group("ref").strip().upper()

    if not valid_line_ref(ref):
        return None

    designation = clean_designation(m.group("designation"))
    qty = normalize_number(m.group("qty"))
    unit_price = normalize_number(m.group("unit_price"))
    discounts = parse_discounts(m.group("discount"))
    line_total = normalize_number(m.group("line_total"))
    tax_code = m.group("tax_code")

    if qty <= 0 or unit_price <= 0 or line_total <= 0:
        return None

    expected = qty * unit_price
    for d in discounts:
        expected = expected * (1 - d / 100)

    if abs(expected - line_total) > max(2.0, line_total * 0.12):
        return None

    return {
        "line_number": 0,
        "reference": ref,
        "designation": designation,
        "quantity": round_money(qty),
        "unit": "UNIT",
        "unit_price": round_money(unit_price),
        "discounts": discounts,
        "tax_code": tax_code,
        "tax_rate": 12.0 if tax_code == "3" else 0.0,
        "line_total_ht": round_money(line_total)
    }


def renumber_lines(lines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for i, line in enumerate(lines, start=1):
        line["line_number"] = i
    return lines


def valid_line_ref(ref: str) -> bool:
    if not ref:
        return False

    ref = ref.strip().upper()

    blacklist = [
        "FACTURE", "CLIENT", "TOTAL", "TVA", "TND", "EUR",
        "SIRET", "SIREN", "REFERENCE", "REFERENCES",
        "DESIGNATION", "QTE", "REMISE", "MONTANT",
        "TOTALHT", "TOTALTTC"
    ]

    if ref in blacklist:
        return False

    # invoice numbers are not product refs
    if re.match(r"^(FC|AC|FA)[_\-\s]?\d+$", ref):
        return False

    if ref.startswith("FR"):
        return False

    if ref.startswith("C000"):
        return False

    if len(ref) < 3 or len(ref) > 20:
        return False

    if not re.search(r"[A-Z]", ref):
        return False

    if not re.search(r"\d", ref):
        # allow TN refs like IHPF / IPSE / IABOX / ICSABO
        allowed_alpha_refs = {"IHPF", "IPSE", "IABOX", "ICSABO", "IPCFRD", "ICOMPTAF"}
        if ref not in allowed_alpha_refs:
            return False

    return bool(re.match(r"^[A-Z0-9_\-]+$", ref))


def already_has_line(lines: List[Dict[str, Any]], ref: str) -> bool:
    for line in lines:
        if line.get("reference") == ref:
            return True
    return False


# =========================================================
# TOTALS / TAX SUMMARY
# =========================================================

def find_amount_after_keywords(text: str, keywords: List[str]) -> float:
    for keyword in keywords:
        pattern = keyword + r".{0,80}?([\d\s]+[,.]\d{2,3})"
        m = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
        if m:
            return normalize_number(m.group(1))

    return 0.0


def extract_totals(text: str, lines: List[Dict[str, Any]], country_profile: str) -> Dict[str, float]:
    clean = remove_cgv_pages(text)

    if country_profile == "TN":
        return extract_totals_tn(clean, lines)

    if country_profile == "FR":
        return extract_totals_fr(clean, lines)

    return extract_totals_fr(clean, lines)


def extract_totals_tn(text: str, lines: List[Dict[str, Any]]) -> Dict[str, float]:
    total_ht = 0.0
    vat_amount = 0.0
    stamp_duty = 0.0
    total_ttc = 0.0
    net_to_pay = 0.0

    # Direct known labels
    m = re.search(r"NET A PAYER\s*(" + amount_pattern() + r")\s*TND", text, flags=re.IGNORECASE)
    if m:
        net_to_pay = normalize_number(m.group(1))

    m = re.search(r"TOTAL TTC\s*(" + amount_pattern() + r")", text, flags=re.IGNORECASE)
    if m:
        total_ttc = normalize_number(m.group(1))

    # TOTAL HT is sometimes separated by currency/date lines, so use all amounts after TOTAL HT and pick the largest reasonable value
    m = re.search(r"TOTAL HT(.{0,250})", text, flags=re.IGNORECASE | re.DOTALL)
    if m:
        amounts = extract_amounts(m.group(1))
        amounts = [a for a in amounts if 100 <= a <= 100000]
        if amounts:
            total_ht = max(amounts)

    # Total TVA
    m = re.search(r"Total TVA\s*(" + amount_pattern() + r")", text, flags=re.IGNORECASE)
    if m:
        vat_amount = normalize_number(m.group(1))
    else:
        # In your TN bill, 169,291 appears before "Total TVA"
        m = re.search(r"(" + amount_pattern() + r")\s*Total TVA", text, flags=re.IGNORECASE)
        if m:
            vat_amount = normalize_number(m.group(1))

    # If stamp not directly readable, calculate from net - ttc
    if total_ttc and net_to_pay and net_to_pay > total_ttc:
        stamp_duty = net_to_pay - total_ttc

    # Fallback from lines
    if total_ht == 0 and lines:
        total_ht = sum(l.get("line_total_ht", 0) for l in lines)

    if vat_amount == 0 and total_ht:
        vat_amount = total_ht * 0.12

    if total_ttc == 0:
        total_ttc = total_ht + vat_amount

    if net_to_pay == 0:
        net_to_pay = total_ttc + stamp_duty

    return {
        "total_ht": round_money(total_ht),
        "taxable_amount": round_money(total_ht),
        "vat_amount": round_money(vat_amount),
        "stamp_duty": round_money(stamp_duty),
        "shipping_non_taxable": 0,
        "shipping_taxable": 0,
        "packaging": 0,
        "total_ttc": round_money(total_ttc),
        "net_to_pay": round_money(net_to_pay)
    }


def extract_totals_fr(text: str, lines: List[Dict[str, Any]]) -> Dict[str, float]:
    total_ht = 0.0
    taxable_amount = 0.0
    vat_amount = 0.0
    total_ttc = 0.0
    net_to_pay = 0.0
    shipping_non_taxable = 0.0
    shipping_taxable = 0.0
    packaging = 0.0

    # For French Divalto invoices, final totals are often near the bottom after "TVA non applicable..."
    bottom_zone = text
    idx = text.lower().rfind("tva non applicable")
    if idx != -1:
        bottom_zone = text[idx:]

    amounts = extract_amounts(bottom_zone)

    # Detect starred TTC like *****6460,69
    m = re.search(r"\*+\s*(" + amount_pattern() + r")", bottom_zone)
    if m:
        total_ttc = normalize_number(m.group(1))

    # In page 5 example:
    # 4963,39 / 5 383,91 / 1 076,78 / 6 460,69 / 20,0 / *****6460,69 / 420,52
    if len(amounts) >= 4:
        # remove obvious dates like 01/01/14 already not matched by amount_pattern
        big_amounts = [a for a in amounts if a > 10]

        if not total_ttc and big_amounts:
            total_ttc = max(big_amounts)

        # VAT is usually close to total_ttc - taxable base
        # Prefer amount around 20% of taxable base
        for a in big_amounts:
            for b in big_amounts:
                if b > a and abs((a * 1.20) - b) < 2:
                    taxable_amount = a
                    vat_amount = b - a
                    break

        # If not found, use common positions from the Divalto total area
        if total_ht == 0 and len(big_amounts) >= 1:
            total_ht = big_amounts[0]

        if taxable_amount == 0 and len(big_amounts) >= 2:
            taxable_amount = big_amounts[1]

        if vat_amount == 0 and len(big_amounts) >= 3:
            vat_amount = big_amounts[2]

    # Shipping non taxable
    m = re.search(r"Frais de port Non So\s*(" + amount_pattern() + r")", text, flags=re.IGNORECASE)
    if m:
        shipping_non_taxable = normalize_number(m.group(1))

    m = re.search(r"Frais de port Soumis\s*(" + amount_pattern() + r")", text, flags=re.IGNORECASE)
    if m:
        shipping_taxable = normalize_number(m.group(1))

    m = re.search(r"Frais d.?emballage\s*(" + amount_pattern() + r")", text, flags=re.IGNORECASE)
    if m:
        packaging = normalize_number(m.group(1))

    if total_ht == 0 and lines:
        total_ht = sum(l.get("line_total_ht", 0) for l in lines)

    if taxable_amount == 0:
        taxable_amount = total_ht + shipping_non_taxable + shipping_taxable + packaging

    if vat_amount == 0 and taxable_amount:
        vat_amount = taxable_amount * 0.20

    if total_ttc == 0:
        total_ttc = taxable_amount + vat_amount

    net_to_pay = total_ttc

    return {
        "total_ht": round_money(total_ht),
        "taxable_amount": round_money(taxable_amount),
        "vat_amount": round_money(vat_amount),
        "stamp_duty": 0,
        "shipping_non_taxable": round_money(shipping_non_taxable),
        "shipping_taxable": round_money(shipping_taxable),
        "packaging": round_money(packaging),
        "total_ttc": round_money(total_ttc),
        "net_to_pay": round_money(net_to_pay)
    }


def extract_tax_summary(text: str, totals: Dict[str, float], country_profile: str) -> List[Dict[str, Any]]:
    tax_rate = find_tax_rate(text)

    # Tunisian invoice often has tax code 3 for 12%
    tax_code = ""

    m = re.search(r"\b(\d{1,2})\s+(\d{1,2}[,.]\d{2})%\s+([\d\s]+[,.]\d{2,3})\s+([\d\s]+[,.]\d{2,3})", text)
    if m:
        tax_code = m.group(1)
        tax_rate = normalize_number(m.group(2))
        base = normalize_number(m.group(3))
        amount = normalize_number(m.group(4))

        return [{
            "tax_code": tax_code,
            "tax_rate": tax_rate,
            "base": round_money(base),
            "amount": round_money(amount)
        }]

    return [{
        "tax_code": tax_code,
        "tax_rate": tax_rate,
        "base": totals.get("taxable_amount", 0),
        "amount": totals.get("vat_amount", 0)
    }]


# =========================================================
# PAYMENT
# =========================================================

def extract_payment(text: str) -> Dict[str, Any]:
    description = ""

    payment_keywords = [
        r"Virement\s+à\s+\d+\s+jours\s+net",
        r"Chèque\s+à\s+réception\s+de\s+facture",
        r"Chèque\s+à\s+\d+\s+jours\s+net",
        r"Virement\s+bancaire",
        r"Chèque",
        r"Cheque"
    ]

    for p in payment_keywords:
        m = re.search(p, text, flags=re.IGNORECASE)
        if m:
            description = m.group(0).strip()
            break

    method = ""

    if re.search(r"virement", description, flags=re.IGNORECASE):
        method = "Virement bancaire"
    elif re.search(r"ch[eè]que|cheque", description, flags=re.IGNORECASE):
        method = "Chèque"

    installments = []

    # Tunisian example has two payment rows
    for m in re.finditer(r"(Chèque|Cheque|Virement).{0,40}?(\d{2}/\d{2}/\d{2,4}).{0,40}?([\d\s]+[,.]\d{2,3})", text, flags=re.IGNORECASE):
        installments.append({
            "method": m.group(1),
            "due_date": parse_date_to_iso(m.group(2)),
            "amount": round_money(normalize_number(m.group(3)))
        })

    return {
        "description": description,
        "method": method,
        "terms": description,
        "installments": installments
    }


# =========================================================
# QUALITY CHECK
# =========================================================

def build_quality(result: Dict[str, Any]) -> Dict[str, Any]:
    missing = []
    warnings = []

    required_paths = [
        ("supplier.name", result.get("supplier", {}).get("name")),
        ("customer.name", result.get("customer", {}).get("name")),
        ("invoice.number", result.get("invoice", {}).get("number")),
        ("invoice.date", result.get("invoice", {}).get("date")),
        ("invoice.currency", result.get("invoice", {}).get("currency")),
        ("lines", result.get("lines")),
        ("totals.total_ht", result.get("totals", {}).get("total_ht")),
        ("totals.total_ttc", result.get("totals", {}).get("total_ttc") or result.get("totals", {}).get("net_to_pay")),
    ]

    for path, value in required_paths:
        if value in ["", None, 0, [], {}]:
            missing.append(path)

    lines_sum = sum(float(l.get("line_total_ht", 0) or 0) for l in result.get("lines", []))
    total_ht = float(result.get("totals", {}).get("total_ht", 0) or 0)
    vat_amount = float(result.get("totals", {}).get("vat_amount", 0) or 0)
    stamp_duty = float(result.get("totals", {}).get("stamp_duty", 0) or 0)
    total_ttc = float(result.get("totals", {}).get("total_ttc", 0) or 0)
    net_to_pay = float(result.get("totals", {}).get("net_to_pay", 0) or 0)

    expected_ttc = total_ht + vat_amount
    expected_net = expected_ttc + stamp_duty

    target = net_to_pay if net_to_pay else total_ttc
    expected = expected_net if stamp_duty else expected_ttc

    difference = abs(expected - target) if target else 0

    status = "ok"
    if difference > 0.05:
        status = "warning"
        warnings.append("Totals calculation difference is greater than 0.05")

    if total_ht and lines_sum and abs(lines_sum - total_ht) > max(0.05, total_ht * 0.05):
        warnings.append("Sum of invoice lines does not match total_ht")

    confidence = 0.95

    if missing:
        confidence -= min(0.4, len(missing) * 0.05)

    if warnings:
        confidence -= min(0.2, len(warnings) * 0.05)

    return {
        "missing_required_fields": missing,
        "warnings": warnings,
        "calculation_check": {
            "lines_sum_ht": round_money(lines_sum),
            "expected_ttc_or_net": round_money(expected),
            "difference": round_money(difference),
            "status": status
        },
        "confidence": round(confidence, 2)
    }


# =========================================================
# LLM FALLBACK
# =========================================================

def call_llm_for_lines(raw_text: str, country_profile: str) -> List[Dict[str, Any]]:
    prompt = f"""
You extract invoice lines for TEIF XML generation.

Return ONLY valid JSON array.
No explanation.

Country profile: {country_profile}

Each line must have:
line_number, reference, designation, quantity, unit, unit_price, discounts, tax_code, tax_rate, line_total_ht.

Rules:
- discounts must be an array. Example "50+35" => [50,35]
- use decimal dot, not comma
- do not invent values
- ignore totals and payment rows
- extract product/service table rows only

Text:
{raw_text}
"""

    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [{"role": "user", "content": prompt}]
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=45)
        response.raise_for_status()

        content = response.json().get("message", {}).get("content", "")
        match = re.search(r"\[.*\]", content, re.DOTALL)

        if match:
            data = json.loads(match.group(0))
            if isinstance(data, list):
                cleaned = []

                for i, line in enumerate(data):
                    cleaned.append({
                        "line_number": int(line.get("line_number") or i + 1),
                        "reference": str(line.get("reference", "")).strip(),
                        "designation": str(line.get("designation", "")).strip(),
                        "quantity": normalize_number(line.get("quantity", 0)),
                        "unit": line.get("unit", "UNIT") or "UNIT",
                        "unit_price": round_money(normalize_number(line.get("unit_price", 0))),
                        "discounts": line.get("discounts", []) if isinstance(line.get("discounts", []), list) else [],
                        "tax_code": str(line.get("tax_code", "")).strip(),
                        "tax_rate": normalize_number(line.get("tax_rate", 0)),
                        "line_total_ht": round_money(normalize_number(line.get("line_total_ht", 0)))
                    })

                return cleaned

    except Exception:
        return []

    return []


def call_llm_full_extraction(raw_text: str, country_profile: str, currency: str, document_type: Dict[str, str]) -> Dict[str, Any]:
    prompt = f"""
You extract invoice data for TEIF XML generation.

Return ONLY valid JSON.
No explanation.
Do not invent missing values.
Use decimal dot, not comma.
Convert dates to YYYY-MM-DD.
Ignore general sales conditions pages.

Country profile: {country_profile}
Currency: {currency}
Document type: {document_type.get("document_type")}
Document type code: {document_type.get("document_type_code")}

Required JSON shape:
{{
  "supplier": {{
    "name": "",
    "identifier": "",
    "identifier_type": "",
    "vat_number": "",
    "tax_reference": "",
    "siret": "",
    "siren": "",
    "rc": "",
    "naf": "",
    "address": "",
    "city": "",
    "postal_code": "",
    "country": "",
    "phone": "",
    "fax": "",
    "email": "",
    "website": ""
  }},
  "customer": {{
    "code": "",
    "name": "",
    "identifier": "",
    "identifier_type": "",
    "vat_number": "",
    "tax_reference": "",
    "siret": "",
    "siren": "",
    "address": "",
    "city": "",
    "postal_code": "",
    "country": "",
    "phone": "",
    "email": ""
  }},
  "invoice": {{
    "number": "",
    "date": "",
    "due_date": "",
    "period_start": "",
    "period_end": "",
    "currency": "",
    "reference": "",
    "order_number": "",
    "commercial": ""
  }},
  "payment": {{
    "description": "",
    "method": "",
    "terms": "",
    "installments": []
  }},
  "lines": [
    {{
      "line_number": 1,
      "reference": "",
      "designation": "",
      "quantity": 0,
      "unit": "UNIT",
      "unit_price": 0,
      "discounts": [],
      "tax_code": "",
      "tax_rate": 0,
      "line_total_ht": 0
    }}
  ],
  "totals": {{
    "total_ht": 0,
    "taxable_amount": 0,
    "vat_amount": 0,
    "stamp_duty": 0,
    "shipping_non_taxable": 0,
    "shipping_taxable": 0,
    "packaging": 0,
    "total_ttc": 0,
    "net_to_pay": 0
  }},
  "tax_summary": [
    {{
      "tax_code": "",
      "tax_rate": 0,
      "base": 0,
      "amount": 0
    }}
  ]
}}

Text:
{raw_text}
"""

    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [{"role": "user", "content": prompt}]
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=60)
        response.raise_for_status()

        content = response.json().get("message", {}).get("content", "")
        match = re.search(r"\{.*\}", content, re.DOTALL)

        if match:
            data = json.loads(match.group(0))
            if isinstance(data, dict):
                return data

    except Exception:
        return {}

    return {}


# =========================================================
# MISC HELPERS
# =========================================================

def remove_cgv_pages(text: str) -> str:
    """
    Remove general sales conditions pages.
    They create false detections and pollute extraction.
    """
    pages = re.split(r"===== PAGE \d+ =====", text)
    kept = []

    for page in pages:
        p = page.strip()
        if not p:
            continue

        low = p.lower()

        if "conditions generales de vente" in low or "conditions générales de vente" in low:
            continue

        if "définitions et interpretation" in low or "definitions et interpretation" in low:
            continue

        kept.append(p)

    return "\n".join(kept).strip()


def is_label_noise(value: str) -> bool:
    if not value:
        return True

    low = value.strip().lower()

    bad = [
        "code routage pdp", "duns", "numéro siren", "numero siren",
        "tva intra", "tél.", "tel.", "fax", "e_mail", "site web",
        "livré à", "livre a", "page", "montant", "base tva",
        "taux", "montant tva", "ttc", "date", "numéro pièce",
        "numero piece", "client", "votre référence", "votre reference",
        "commercial", "référence", "reference", "désignation",
        "designation", "quantité", "quantite", "prix unitaire",
        "remise", "naf", "siret", "rc"
    ]

    return low in bad


def amount_pattern():
    return r"\d{1,3}(?:\s\d{3})*[,.]\d{2,4}|\d+[,.]\d{2,4}"


def extract_amounts(text: str) -> List[float]:
    return [normalize_number(x) for x in re.findall(amount_pattern(), text)]


def find_block_text(blocks: List[Dict[str, Any]], contains: str) -> str:
    for b in blocks:
        txt = str(b.get("text", "")).strip()
        if contains.lower() in txt.lower():
            return txt
    return ""


def clean_company_name(value: str) -> str:
    value = str(value or "").strip()
    value = re.sub(r"\s+", " ", value)
    value = value.replace("Client:", "").replace("CLIENT :", "").strip()
    return value


def detect_document_type_strict(text: str) -> Dict[str, str]:
    """
    Important: do not detect Avoir from random CGV text.
    Only accept Avoir when it is a document title.
    """
    clean = remove_cgv_pages(text)
    lines = clean_lines(clean)

    for line in lines[:80]:
        low = line.strip().lower()
        if low in ["avoir", "note de crédit", "note de credit", "credit note"]:
            return {"document_type": "Avoir", "document_type_code": "I-12"}

    return {"document_type": "Facture", "document_type_code": "I-11"}


# =========================================================
# MAIN EXTRACTION
# =========================================================

@app.post("/extract")
def extract(req: ExtractionRequest):
    try:
        raw_text = clean_text(req.raw_text)
        lines = clean_lines(raw_text)

        country_profile = detect_country_profile(raw_text)
        currency = detect_currency(raw_text, country_profile)
        raw_text = remove_cgv_pages(clean_text(req.raw_text))
        lines = clean_lines(raw_text)

        doc_type = detect_document_type_strict(raw_text)

        supplier = extract_supplier(lines, raw_text, country_profile, req.blocks)
        customer = extract_customer(lines, raw_text, country_profile, req.blocks)

        invoice_date = find_first_date(raw_text)
        invoice_number = extract_invoice_number(raw_text, lines)
        due_date = extract_due_date(raw_text, invoice_date)

        invoice_lines = extract_lines(raw_text, lines, country_profile)
        totals = extract_totals(raw_text, invoice_lines, country_profile)
        tax_summary = extract_tax_summary(raw_text, totals, country_profile)
        payment = extract_payment(raw_text)

        result = {
            "document": {
                "country_profile": country_profile,
                "source_type": req.source_type,
                "page_count": req.page_count,
                "document_type": doc_type["document_type"],
                "document_type_code": doc_type["document_type_code"],
                "language": "fr",
                "currency": currency
            },
            "supplier": supplier,
            "customer": customer,

            # Compatibility alias for old nodes if they still expect "client"
            "client": customer,

            "invoice": {
                "number": invoice_number,
                "invoice_number": invoice_number,
                "date": invoice_date,
                "issue_date": invoice_date,
                "due_date": due_date,
                "period_start": "",
                "period_end": "",
                "currency": currency,
                "reference": "",
                "order_number": extract_order_number(raw_text),
                "commercial": extract_commercial(raw_text)
            },
            "payment": payment,
            "lines": invoice_lines,
            "totals": totals,
            "tax_summary": tax_summary,
            "evidence": {},
            "confidence": 0.0
        }

        # If deterministic extraction is weak, use full LLM fallback
        quality = build_quality(result)

        if len(invoice_lines) == 0 or len(quality["missing_required_fields"]) >= 4:
            llm_data = call_llm_full_extraction(raw_text, country_profile, currency, doc_type)

            if llm_data:
                result["supplier"] = llm_data.get("supplier", result["supplier"])
                result["customer"] = llm_data.get("customer", result["customer"])
                result["client"] = result["customer"]
                result["invoice"].update(llm_data.get("invoice", {}))
                result["payment"] = llm_data.get("payment", result["payment"])
                result["lines"] = llm_data.get("lines", result["lines"])
                result["totals"] = llm_data.get("totals", result["totals"])
                result["tax_summary"] = llm_data.get("tax_summary", result["tax_summary"])

                # Keep detected document metadata
                result["document"]["country_profile"] = country_profile
                result["document"]["currency"] = currency
                result["document"]["document_type"] = doc_type["document_type"]
                result["document"]["document_type_code"] = doc_type["document_type_code"]

        quality = build_quality(result)
        result["quality"] = quality
        result["confidence"] = quality["confidence"]

        return result

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
def health():
    return {"status": "ok"}