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
    if value is None:
        return 0.0
    s = str(value).strip()
    s = s.replace("\u00a0", " ")
    s = re.sub(r"[^\d,.\-]", "", s)
    if not s:
        return 0.0
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
    if not value:
        return ""
    value = value.strip()
    patterns = [
        "%d/%m/%Y", "%d/%m/%y",
        "%d-%m-%Y", "%d-%m-%y",
        "%d.%m.%Y", "%d.%m.%y",
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
        return {"document_type": "Avoir", "document_type_code": "I-12"}
    return {"document_type": "Facture", "document_type_code": "I-11"}


# =========================================================
# IDENTIFIERS
# =========================================================

def extract_vat_numbers(text: str) -> List[str]:
    results = []
    # French VAT — FR + 2 alphanum + 9-10 digits
    for m in re.findall(r"\bFR[A-Z0-9]{2}\d{9,10}\b", text, flags=re.IGNORECASE):
        results.append(m.upper())
    # Tunisian matricule fiscal: 1338455HAM000
    for m in re.findall(r"\b\d{7}[A-Z]{2,3}\d{3}\b", text, flags=re.IGNORECASE):
        results.append(m.upper())
    # Tunisian short fiscal id: 1338455H
    for m in re.findall(r"\b\d{7}[A-Z]\b", text, flags=re.IGNORECASE):
        results.append(m.upper())
    # Tunisian tax reference with slashes: 1369372B/B/M/000
    for m in re.findall(r"\b\d{7}[A-Z]/[A-Z]/[A-Z]/\d{3}\b", text, flags=re.IGNORECASE):
        results.append(m.upper())
    return list(dict.fromkeys(results))


def extract_siret(text: str) -> str:
    # Look for "Siret" label followed by a 12-digit number (preferred)
    m = re.search(r"Siret\s+(\d{12,14})", text, flags=re.IGNORECASE)
    if m:
        return m.group(1)
    m = re.search(r"\b\d{14}\b", text)
    return m.group(0) if m else ""


def extract_siren(text: str) -> str:
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
        if "tenorafrique.com" in text.lower() or re.search(r"\b1338455H\b", text):
            name = "Tenor Afrique"

        if not name:
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
        if not identifier:
            m = re.search(r"\b\d{7}[A-Z]\b", text, flags=re.IGNORECASE)
            if m:
                identifier = m.group(0).upper()
                vat_number = identifier

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


def fix_fr_supplier_identifiers(supplier: Dict[str, Any], text: str, country_profile: str) -> Dict[str, Any]:
    if country_profile != "FR":
        return supplier

    fixed = dict(supplier)

    # TVA fournisseur
    vat = re.search(r"\bFR[A-Z0-9]{2}\d{9,10}\b", text, flags=re.IGNORECASE)
    if vat:
        vat_value = vat.group(0).upper()
        fixed["vat_number"] = vat_value
        fixed["identifier"] = vat_value
        fixed["tax_reference"] = vat_value

    # SIRET fournisseur dans les factures Papyrus :
    # 1 000 000 EUR FR552124568552 701421212000
    siret = ""

    m = re.search(
        r"\bFR[A-Z0-9]{2}\d{9,10}\s+(\d{12,14})\b",
        text,
        flags=re.IGNORECASE
    )
    if m:
        siret = m.group(1)

    if not siret:
        m = re.search(
            r"\b(\d{12,14})\s+FR[A-Z0-9]{2}\d{9,10}\b",
            text,
            flags=re.IGNORECASE
        )
        if m:
            siret = m.group(1)

    if siret:
        fixed["siret"] = siret

    # Important : le SIREN 148532789 appartient au client NEBOUT, pas au fournisseur.
    # Donc on vide supplier.siren pour éviter une fausse information.
    fixed["siren"] = ""

    phone_digits = re.sub(r"\D", "", str(fixed.get("phone", "")))
    if len(phone_digits) == 9:
        fixed["phone"] = ""

    if fixed.get("fax") and re.search(r"\d{4}\s+\d{8}", str(fixed["fax"])):
        fixed["fax"] = ""

    return fixed



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
    tax_reference = ""
    identifier = ""

    # =========================
    # TN CUSTOMER
    # =========================
    if country_profile == "TN":
        for m in re.finditer(r"(?im)^\s*Client\s*:[ \t]*([^\n\r]+)\s*$", text):
            candidate = clean_company_name(m.group(1))
            low = candidate.lower()
            if not candidate:
                continue
            if is_label_noise(candidate):
                continue
            if any(x in low for x in ["téléphone", "telephone", "télécopie", "telecopie", "email", "web"]):
                continue
            name = candidate
            break

        code_tva_matches = re.findall(
            r"Code\s+TVA\s*:\s*([0-9]{7}[A-Z]{1,3}(?:/[A-Z]){0,2}/?\d{3}|[0-9]{7}[A-Z]{2,3}\d{3})",
            text,
            flags=re.IGNORECASE
        )
        code_tva_matches = [x.strip().upper() for x in code_tva_matches if x.strip()]

        if len(code_tva_matches) >= 2:
            tax_reference = code_tva_matches[1]
            identifier = tax_reference.replace("/", "")
        elif len(code_tva_matches) == 1:
            if not re.match(r"^\d{7}[A-Z]{2,3}\d{3}$", code_tva_matches[0]):
                tax_reference = code_tva_matches[0]
                identifier = tax_reference.replace("/", "")

        if tax_reference:
            before_customer_tax = text.split(tax_reference)[0]
            supplier_tax_matches = re.findall(r"\b\d{7}[A-Z]{2,3}\d{3}\b", before_customer_tax, flags=re.IGNORECASE)
            if supplier_tax_matches:
                supplier_tax = supplier_tax_matches[-1]
                zone = before_customer_tax.split(supplier_tax, 1)[-1]
            else:
                zone = before_customer_tax

            addr_lines = []
            for l in clean_lines(zone):
                low = l.lower()
                if any(x in low for x in [
                    "code tva", "facture", "client", "commande", "rc",
                    "references", "qte", "p.u.", "remise", "montant",
                    "téléphone", "telephone", "télécopie", "telecopie",
                    "email", "web", "page"
                ]):
                    continue
                if "@" in l:
                    continue
                if re.search(r"^\+?\d", l):
                    continue
                if any(k in low for k in ["résidence", "residence", "borj", "bloc", "bur", "ariana", "avenue", "rue", "route"]):
                    addr_lines.append(l.strip())

            address = ", ".join(addr_lines[:5])

    # =========================
    # FR CUSTOMER
    # =========================
    elif country_profile == "FR" and blocks:
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

    if not name:
        # Fallback: scan text for known customer patterns
        # For FR invoices without blocks: look for capitalized company name near billing address
        if country_profile == "FR":
            m = re.search(
                r"((?:[A-ZÉÀÈÙÂÊÎÔÛÄËÏÖÜ][A-ZÉÀÈÙÂÊÎÔÛÄËÏÖÜa-z0-9éàèùâêîôûäëïöü\s&\-\.]{2,40}(?:SA|SAS|SARL|EURL|SNC|GIE|SCM|SCEV|EARL|GAEC|GFA)?)\s*\n)",
                text
            )

        for line in lines:
            low = line.lower()
            if any(x in low for x in ["la badira", "vega cables", "nebout", "cfab", "it soft"]):
                name = clean_company_name(line)
                break

    siren = ""
    siret = ""

    if country_profile == "FR":
        # Look for "Numéro Siren" labelled value
        m_siren = re.search(r"Num[eé]ro\s+Siren\s+(\d{9})", text, flags=re.IGNORECASE)
        if m_siren:
            siren = m_siren.group(1)
        else:
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
    # Divalto/Tenor line: 12/02/2025 AC_ 250001 C0000013 ITSOFT-NGM-RENEW 2025
    m = re.search(
        r"\b\d{2}/\d{2}/\d{2,4}\s+((?:AC|FC|FA|AV|FV)[_\-\s]*\d{4,8}|\d{5,10})\s+C\d{3,8}\b",
        text,
        flags=re.IGNORECASE
    )
    if m:
        value = m.group(1).strip()
        value = re.sub(r"\s+", "", value)
        return value.upper()

    patterns = [
        r"\bAC[_\-\s]*\d{4,8}\b",
        r"\bFC[_\-\s]*\d{4,8}\b",
        r"\bFA[_\-\s]*\d{4,8}\b",
        r"\bAV[_\-\s]*\d{4,8}\b",
        r"\bFV[_\-\s]*\d{4,8}\b",
        r"\b\d{8}\b",
    ]
    for p in patterns:
        m = re.search(p, text, flags=re.IGNORECASE)
        if m:
            value = m.group(0)
            value = re.sub(r"\s+", "", value)
            return value.upper()

    return ""


def extract_due_date(text: str, invoice_date: str) -> str:
    dates = find_all_dates(text)
    if not dates:
        return ""
    if invoice_date and invoice_date in dates:
        later_dates = [d for d in dates if d >= invoice_date]
        if len(later_dates) >= 2:
            return later_dates[-1]
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
# HELPERS FOR LINE EXTRACTION
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


def amount_pattern():
    return r"\d{1,3}(?:\s\d{3})*[,.]\d{2,4}|\d+[,.]\d{2,4}"


def extract_amounts(text: str) -> List[float]:
    return [normalize_number(x) for x in re.findall(amount_pattern(), text)]


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
    rates = re.findall(r"\b(\d{1,2}[,.]?\d{0,2})\s*%", text)
    candidates = []
    for r in rates:
        n = normalize_number(r)
        if 0 < n <= 30:
            candidates.append(n)
    if candidates:
        return candidates[0]
    if re.search(r"\b20[,.]0\b", text):
        return 20.0
    if re.search(r"\b12[,.]00\b", text):
        return 12.0
    return 0.0


def detect_tn_layout_profile(text: str) -> str:
    t = text.lower()
    if "tenor" in t or "tenorafrique" in t or "base t.v.a" in t:
        return "TN_TENOR"
    if "for-softwares" in t or "issolutions" in t or "conditions de reglement" in t:
        return "TN_ISSOLUTIONS"
    return "TN_GENERIC"


def extract_lines_regex_fallback(clean: str, country_profile: str) -> List[Dict[str, Any]]:
    """
    Anciennes routes par regex, gardées uniquement comme filet de
    sécurité si le LLM échoue (Ollama indisponible, timeout, JSON
    invalide, etc.). Ne sont plus le chemin principal.
    """
    if country_profile == "FR":
        return extract_lines_fr(clean)
    if country_profile == "TN":
        profile = detect_tn_layout_profile(clean)
        if profile == "TN_TENOR":
            return extract_lines_tn_tenor(clean)
        return extract_lines_tn(clean)
    return extract_lines_fr(clean)


def lines_look_plausible(lines: List[Dict[str, Any]]) -> bool:
    """
    Vérification légère anti-hallucination : chaque ligne doit avoir
    une référence et une désignation non vides, des montants positifs,
    et qty * unit_price doit être cohérent avec line_total_ht (avec
    tolérance pour gérer les remises/arrondis).
    """
    if not lines:
        return False

    valid_count = 0
    for l in lines:
        try:
            qty = float(l.get("quantity", 0) or 0)
            unit_price = float(l.get("unit_price", 0) or 0)
            line_total = float(l.get("line_total_ht", 0) or 0)
            designation = str(l.get("designation", "")).strip()
        except Exception:
            continue

        if qty <= 0 or unit_price <= 0 or line_total <= 0:
            continue
        if len(designation) < 2:
            continue

        expected = qty * unit_price
        discounts = l.get("discounts", []) or []
        for d in discounts:
            try:
                expected = expected * (1 - float(d) / 100)
            except Exception:
                pass

        # Tolérance large : remises non détectées, arrondis PDF, taxes incluses/exclues
        if abs(expected - line_total) <= max(1.0, line_total * 0.30):
            valid_count += 1

    # On exige qu'au moins la moitié des lignes renvoyées par le LLM
    # soient numériquement plausibles pour faire confiance au résultat.
    return valid_count >= max(1, len(lines) // 2)


def extract_lines(text: str, lines: List[str], country_profile: str) -> List[Dict[str, Any]]:
    """
    Extraction des lignes de facture.

    Strategy:
    1. Use the new structured extractor.
    2. If it fails, use the old extractor that worked well for article lines.
    3. If it still fails, use the generic vertical fallback.
    4. LLM only last.
    """

    clean = remove_cgv_pages(text)
    clean_line_list = clean_lines(clean)

    tax_rate = 20.0
    if country_profile == "TN":
        tax_rate = 19.0
    elif country_profile == "FR":
        tax_rate = 20.0

    # =========================
    # FR
    # =========================
    if country_profile == "FR":
        regex_lines = extract_lines_fr(clean)

        print("DEBUG FR NEW LINES:", len(regex_lines), flush=True)

        if regex_lines:
            return renumber_lines(regex_lines)

        old_lines = extract_lines_old_style_fallback(clean_line_list, tax_rate=20.0)

        print("DEBUG FR OLD STYLE LINES:", len(old_lines), flush=True)

        if old_lines:
            return renumber_lines(old_lines)

        vertical_lines = extract_lines_vertical_fallback(clean_line_list, tax_rate=20.0)

        print("DEBUG FR VERTICAL FALLBACK LINES:", len(vertical_lines), flush=True)

        if vertical_lines:
            return renumber_lines(vertical_lines)

        llm_lines = call_llm_for_lines(clean, country_profile)

        print("DEBUG FR LLM LINES:", len(llm_lines), flush=True)

        if lines_look_plausible(llm_lines):
            return renumber_lines(llm_lines)

        return []

    # =========================
    # TN
    # =========================
    if country_profile == "TN":
        profile = detect_tn_layout_profile(clean)

        if profile == "TN_TENOR":
            regex_lines = extract_lines_tn_tenor(clean)
        else:
            regex_lines = extract_lines_tn(clean)

        print("DEBUG TN NEW LINES:", len(regex_lines), flush=True)

        if regex_lines:
            return renumber_lines(regex_lines)

        old_lines = extract_lines_old_style_fallback(clean_line_list, tax_rate=19.0)

        print("DEBUG TN OLD STYLE LINES:", len(old_lines), flush=True)

        if old_lines:
            return renumber_lines(old_lines)

        vertical_lines = extract_lines_vertical_fallback(clean_line_list, tax_rate=19.0)

        print("DEBUG TN VERTICAL FALLBACK LINES:", len(vertical_lines), flush=True)

        if vertical_lines:
            return renumber_lines(vertical_lines)

        llm_lines = call_llm_for_lines(clean, country_profile)

        print("DEBUG TN LLM LINES:", len(llm_lines), flush=True)

        if lines_look_plausible(llm_lines):
            return renumber_lines(llm_lines)

        return []

    # =========================
    # UNKNOWN
    # =========================
    regex_lines = extract_lines_regex_fallback(clean, country_profile)

    print("DEBUG UNKNOWN NEW LINES:", len(regex_lines), flush=True)

    if regex_lines:
        return renumber_lines(regex_lines)

    old_lines = extract_lines_old_style_fallback(clean_line_list, tax_rate=20.0)

    print("DEBUG UNKNOWN OLD STYLE LINES:", len(old_lines), flush=True)

    if old_lines:
        return renumber_lines(old_lines)

    vertical_lines = extract_lines_vertical_fallback(clean_line_list, tax_rate=20.0)

    print("DEBUG UNKNOWN VERTICAL FALLBACK LINES:", len(vertical_lines), flush=True)

    if vertical_lines:
        return renumber_lines(vertical_lines)

    llm_lines = call_llm_for_lines(clean, country_profile)

    print("DEBUG UNKNOWN LLM LINES:", len(llm_lines), flush=True)

    if lines_look_plausible(llm_lines):
        return renumber_lines(llm_lines)

    return []




def already_has_line(lines: List[Dict[str, Any]], ref: str) -> bool:
    for line in lines:
        if str(line.get("reference", "")).strip().upper() == str(ref).strip().upper():
            return True
    return False


def extract_lines_old_style_fallback(lines: List[str], tax_rate: float = 20.0) -> List[Dict[str, Any]]:
    """
    Old working extractor adapted to the new TEIF-ready output.

    It detects product lines from vertical PDF extraction like:

        designation
        tax_code
        unit_price
        discount
        line_total
        quantity
        reference

    or similar nearby layouts.

    This function does NOT touch totals.
    """

    results = []
    seen = set()

    for i, line in enumerate(lines):
        ref = str(line or "").strip().upper()

        if not is_valid_reference_old_style(ref):
            continue

        try:
            if i < 5:
                continue

            total = normalize_number(lines[i - 2])
            discount = normalize_number(lines[i - 3])
            unit = normalize_number(lines[i - 4])

            q1 = normalize_number(lines[i - 5])
            q2 = normalize_number(lines[i - 1])

            qty = q1 if abs(q1 * unit - total) < abs(q2 * unit - total) else q2

            if qty <= 0:
                qty = 1.0

            if unit <= 0 or total <= 0:
                continue

            desc = ""

            for j in range(i - 1, max(i - 15, 0), -1):
                candidate = str(lines[j] or "").strip()

                if not candidate:
                    continue

                if re.match(r"^[\d\s.,]+$", candidate):
                    continue

                if is_valid_reference_old_style(candidate):
                    continue

                if is_label_noise(candidate):
                    continue

                low = candidate.lower()

                if any(x in low for x in [
                    "total",
                    "tva",
                    "montant",
                    "net à payer",
                    "net a payer",
                    "base tva",
                    "base t.v.a",
                    "frais de port",
                    "siret",
                    "siren",
                    "naf",
                    "date",
                    "client",
                    "commercial",
                    "référence",
                    "reference",
                    "désignation",
                    "designation",
                    "quantité",
                    "quantite",
                    "prix unitaire",
                    "remise"
                ]):
                    continue

                if len(candidate) > 5:
                    desc = clean_designation(candidate)
                    break

            if not is_real_product_old_style(ref, qty, unit, total, desc):
                continue

            expected = qty * unit

            if discount and 0 < discount <= 100:
                expected = expected * (1 - discount / 100)

            # Old extractor needs a wider tolerance because PDF vertical order is messy.
            if abs(expected - total) > max(3.0, total * 0.25):
                continue

            key = (
                ref,
                desc,
                round_money(qty),
                round_money(unit),
                round_money(total)
            )

            if key in seen:
                continue

            seen.add(key)

            results.append({
                "line_number": len(results) + 1,
                "reference": ref,
                "designation": desc,
                "quantity": round_money(qty),
                "unit": "UNIT",
                "unit_price": round_money(unit),
                "discounts": [round_money(discount)] if discount and 0 < discount <= 100 else [],
                "tax_code": str(int(tax_rate)) if tax_rate else "",
                "tax_rate": round_money(tax_rate),
                "line_total_ht": round_money(total)
            })

        except Exception:
            continue

    return renumber_lines(results)





# =========================================================
# FR LINE EXTRACTION  (rewritten for Papyrus/Divalto layout)
# =========================================================

def is_valid_reference_old_style(ref: str) -> bool:
    ref = str(ref or "").strip().upper()

    if not ref:
        return False

    blacklist = {
        "FRANCE", "FACTURE", "AVOIR", "CLIENT", "TOTAL", "SOUS-TOTAL",
        "TVA", "TND", "EUR", "SIRET", "SIREN", "REFERENCE", "REFERENCES",
        "DESIGNATION", "QTE", "QUANTITE", "REMISE", "MONTANT",
        "TOTALHT", "TOTALTTC", "BASE", "TAUX", "PAGE", "EMAIL", "WEB",
        "TEL", "FAX", "COMMERCIAL", "NAF", "DUNS", "TUNIS", "MILLIMES",
        "GRO-OUES", "ADM-NORD"
    }

    if ref in blacklist:
        return False

    if ref.startswith("FR"):
        return False

    if re.match(r"^C\d{3,8}$", ref):
        return False

    if re.match(r"^(FC|AC|FA|AV|FV)[_\-\s]?\d+$", ref):
        return False

    # Une vraie référence article contient au moins une lettre et un chiffre
    if not re.search(r"[A-Z]", ref):
        return False

    if not re.search(r"\d", ref):
        return False

    if len(ref) < 5 or len(ref) > 20:
        return False

    return bool(re.match(r"^[A-Z0-9_\-]+$", ref))


def is_real_product_old_style(ref, qty, unit, total, desc):
    ref = str(ref or "").strip().upper()
    desc = str(desc or "").strip()

    if not is_valid_reference_old_style(ref):
        return False

    if ref.startswith("C000"):
        return False

    if unit <= 0 or total <= 0:
        return False

    # Protection contre les faux articles énormes
    if unit > 10000 or total > 100000:
        return False

    if qty <= 0 or qty > 10000:
        return False

    if len(desc) < 5:
        return False

    bad_desc = desc.lower()
    if any(x in bad_desc for x in [
        "total", "tva", "montant", "net à payer", "net a payer",
        "base t.v.a", "frais de port", "siret", "siren", "naf"
    ]):
        return False

    return True


# =========================================================
# NOUVEAU : reconstruction des lignes d'articles FR
# éclatées verticalement par l'extracteur PDF
# =========================================================
#
# Beaucoup d'extracteurs PDF (PyMuPDF en mode "text", pdftotext, etc.)
# rendent un tableau en colonnes comme une ligne PAR CELLULE plutôt
# qu'une ligne par enregistrement. Exemple réel (facture Papyrus) :
#
#     HIS0001
#     Article pour historique des consommations
#     15,000
#     6,0000
#     90,00
#     1
#
# alors qu'extract_lines_fr() attend tout sur une seule ligne :
#
#     HIS0001 Article pour historique des consommations 15,000 6,0000 90,00 1
#
# Cette fonction détecte le motif (référence article valide suivie
# de texte de désignation, puis qté, prix unitaire, remise optionnelle,
# montant et code TVA, chacun sur sa propre ligne) et reconstruit la
# ligne unique attendue, sans toucher aux lignes qui sont déjà correctes.

_AMOUNT_TOKEN_RE = re.compile(r"^\d{1,3}(?:[ \u00a0]\d{3})*[,.]\d{2,4}$")
_QTY_TOKEN_RE = re.compile(r"^\d+[,.]\d{3}$")
_TAXCODE_TOKEN_RE = re.compile(r"^\d{1,2}$")


def reconstruct_vertical_fr_lines(lines: List[str]) -> List[str]:
    """
    Rebuild French invoice lines when PyMuPDF splits the table vertically.

    Handles both cases:

    Case A - normal vertical:
        HIS0001
        Article ...
        15,000
        6,0000
        90,00
        1

    Case B - Papyrus reversed vertical:
        Article ...
        1
        6,0000
        90,00
        15,000
        HIS0001

    Output:
        HIS0001 Article ... 15,000 6,0000 90,00 1
    """

    rebuilt: List[str] = []
    consumed = set()
    start_to_rebuilt = {}

    n = len(lines)

    def is_qty_token(v: str) -> bool:
        v = v.strip()
        return bool(re.fullmatch(r"\d+[,.]\d{3}", v) or re.fullmatch(r"\d+", v))

    def is_amount_token(v: str) -> bool:
        v = v.strip()
        return bool(re.fullmatch(r"\d{1,3}(?:[ \u00a0]\d{3})*[,.]\d{2,4}|\d+[,.]\d{2,4}", v))

    def is_tax_code_token(v: str) -> bool:
        return bool(re.fullmatch(r"\d{1,2}", v.strip()))

    def is_bad_designation(v: str) -> bool:
        low = v.lower().strip()
        if not v.strip():
            return True
        if is_label_noise(v):
            return True
        if is_amount_token(v) or is_qty_token(v) or is_tax_code_token(v):
            return True
        if is_valid_reference_old_style(v):
            return True
        if any(x in low for x in [
            "total", "tva", "montant", "net à payer", "net a payer",
            "frais de port", "frais d'emballage", "base t.v.a",
            "date", "numéro pièce", "numero piece", "client",
            "commercial", "référence", "reference", "désignation",
            "designation", "quantité", "quantite", "prix unitaire"
        ]):
            return True
        return False

    # =========================================================
    # CASE B: reversed vertical layout
    # designation / tax_code / unit_price / line_total / qty / REF
    # =========================================================
    for i, line in enumerate(lines):
        ref = line.strip().upper()

        if not is_valid_reference_old_style(ref):
            continue

        if i < 5:
            continue

        qty_line = lines[i - 1].strip()
        total_line = lines[i - 2].strip()
        unit_price_line = lines[i - 3].strip()
        tax_code_line = lines[i - 4].strip()

        if not is_qty_token(qty_line):
            continue
        if not is_amount_token(unit_price_line):
            continue
        if not is_amount_token(total_line):
            continue
        if not is_tax_code_token(tax_code_line):
            continue

        qty = normalize_number(qty_line)
        unit_price = normalize_number(unit_price_line)
        line_total = normalize_number(total_line)

        if qty <= 0 or unit_price <= 0 or line_total <= 0:
            continue

        expected = qty * unit_price
        if abs(expected - line_total) > max(0.30, line_total * 0.08):
            continue

        # Collect designation lines before the tax code
        desc_indices = []
        j = i - 5

        while j >= 0 and len(desc_indices) < 6:
            candidate = lines[j].strip()

            if is_bad_designation(candidate):
                break

            desc_indices.append(j)
            j -= 1

        if not desc_indices:
            continue

        desc_indices = list(reversed(desc_indices))
        designation = clean_designation(" ".join(lines[k].strip() for k in desc_indices))

        if not designation:
            continue

        reconstructed = f"{ref} {designation} {qty_line} {unit_price_line} {total_line} {tax_code_line}"

        used_indices = desc_indices + [i - 4, i - 3, i - 2, i - 1, i]
        start_index = min(used_indices)

        for idx in used_indices:
            consumed.add(idx)

        start_to_rebuilt[start_index] = reconstructed

    # =========================================================
    # CASE A: normal vertical layout
    # REF / designation / qty / unit_price / optional discount / total / tax_code
    # =========================================================
    i = 0
    while i < n:
        if i in consumed:
            i += 1
            continue

        candidate_ref = lines[i].strip().upper()

        if not is_valid_reference_old_style(candidate_ref):
            i += 1
            continue

        j = i + 1
        designation_parts = []

        while j < n:
            token = lines[j].strip()

            if is_qty_token(token) or is_amount_token(token):
                break

            if is_bad_designation(token):
                break

            designation_parts.append(token)
            j += 1

            if j - i > 6:
                break

        if not designation_parts or j >= n:
            i += 1
            continue

        qty_line = lines[j].strip()

        if not is_qty_token(qty_line):
            i += 1
            continue

        k = j + 1

        if k >= n or not is_amount_token(lines[k].strip()):
            i += 1
            continue

        unit_price_line = lines[k].strip()
        k += 1

        discount_line = ""

        if (
            k + 1 < n
            and is_amount_token(lines[k].strip())
            and is_amount_token(lines[k + 1].strip())
        ):
            discount_line = lines[k].strip()
            k += 1

        if k >= n or not is_amount_token(lines[k].strip()):
            i += 1
            continue

        line_total_line = lines[k].strip()
        k += 1

        if k >= n or not is_tax_code_token(lines[k].strip()):
            i += 1
            continue

        tax_code_line = lines[k].strip()
        k += 1

        pieces = [candidate_ref] + designation_parts + [qty_line, unit_price_line]

        if discount_line:
            pieces.append(discount_line)

        pieces += [line_total_line, tax_code_line]

        reconstructed = " ".join(pieces)

        used_indices = list(range(i, k))
        for idx in used_indices:
            consumed.add(idx)

        start_to_rebuilt[i] = reconstructed
        i = k

    # =========================================================
    # Final output
    # =========================================================
    output = []

    for i, line in enumerate(lines):
        if i in start_to_rebuilt:
            output.append(start_to_rebuilt[i])

        if i in consumed:
            continue

        output.append(line)

    return output


def extract_lines_fr(text: str) -> List[Dict[str, Any]]:
    """
    Extraction FR Papyrus/Divalto.

    Handles lines like:
    JR00010 Savon spécial Jeune Artiste 1,000 11,1600 2,00 10,94 1
    JR00014 Pastels Secs * 150 pièces spécial Enfants 13,000 108,9700 2,00 1 388,28 1
    HIS0001 Article pour historique des consommations 15,000 6,0000 90,00 1   (no discount column)

    Columns:
    REF DESIGNATION QTY UNIT_PRICE [DISCOUNT] LINE_TOTAL TAX_CODE

    NOTE (fix): the discount column is NOT always present on every invoice
    (e.g. single-line invoices with no remise). The discount group below is
    therefore OPTIONAL — previously it was mandatory, which caused entire
    invoices with a no-discount line item to silently extract zero lines.
    """

    results = []
    clean = remove_cgv_pages(text)
    raw_lines = clean_lines(clean)

    # Keep your previous vertical reconstruction too
    raw_lines = reconstruct_vertical_fr_lines(raw_lines)

    line_pattern = re.compile(
        r"^\s*"
        r"(?P<ref>[A-Z]{2,5}\d{3,8})\s+"
        r"(?P<designation>.+?)\s+"
        r"(?P<qty>\d+[,.]\d{3})\s+"
        r"(?P<unit_price>\d{1,3}(?:[ \u00a0]\d{3})*[,.]\d{4})\s+"
        r"(?:(?P<discount>\d{1,3}[,.]\d{2})\s+)?"
        r"(?P<line_total>\d{1,3}(?:[ \u00a0]\d{3})*[,.]\d{2})\s+"
        r"(?P<tax_code>\d{1,2})"
        r"\s*$",
        flags=re.IGNORECASE
    )

    for raw_line in raw_lines:
        line = raw_line.strip()

        low = line.lower()

        # Ignore non-product rows
        if any(x in low for x in [
            "total commande",
            "total bon de livraison",
            "bon de livraison",
            "commande n°",
            "commande n",
            "sous-total",
            "frais de port",
            "tva non applicable",
            "net à payer",
            "net a payer",
            "date numéro pièce",
            "date numero piece",
            "référence désignation",
            "reference designation",
            "conditions generales",
            "conditions générales"
        ]):
            continue

        m = line_pattern.match(line)
        if not m:
            continue

        ref = m.group("ref").strip().upper()
        designation = clean_designation(m.group("designation"))
        qty = normalize_number(m.group("qty"))
        unit_price = normalize_number(m.group("unit_price"))
        discount = normalize_number(m.group("discount")) if m.group("discount") else 0.0
        line_total = normalize_number(m.group("line_total"))
        tax_code = m.group("tax_code").strip()

        if not is_valid_reference_old_style(ref):
            continue

        if not is_real_product_old_style(ref, qty, unit_price, line_total, designation):
            continue

        expected = qty * unit_price

        if discount:
            expected = expected * (1 - discount / 100)

        # Example: 1 * 11.1600 - 2% = 10.9368 => 10.94
        if abs(expected - line_total) > max(0.10, line_total * 0.02):
            continue

        results.append({
            "line_number": len(results) + 1,
            "reference": ref,
            "designation": designation,
            "quantity": round_money(qty),
            "unit": "UNIT",
            "unit_price": round_money(unit_price),
            "discounts": [round_money(discount)] if discount else [],
            "tax_code": tax_code,
            "tax_rate": 20.0,
            "line_total_ht": round_money(line_total)
        })

    return renumber_lines(results)




# =========================================================
# TN TENOR LINE EXTRACTION  (rewritten for layout-based PDF)
# =========================================================

def extract_lines_tn_tenor(text: str) -> List[Dict[str, Any]]:
    """
    Extraction générique Tenor TN.

    Format réel extrait :
    2265,000 883,350
    35,00 Contrat Bronze Pack Duo Compta Gestion Ed. Entreprise
    AL0ENTPCK01 1,000 40,00
    """
    results = []
    clean = remove_cgv_pages(text)
    lines = clean_lines(clean)

    amount_pair_pattern = re.compile(
        r"^\s*(" + amount_pattern() + r")\s+(" + amount_pattern() + r")\s*$",
        flags=re.IGNORECASE
    )

    ref_line_pattern = re.compile(
        r"^\s*(?P<ref>[A-Z][A-Z0-9_\-]{3,30})\s+"
        r"(?P<qty>\d+[,.]\d{3})\s+"
        r"(?P<discount1>\d+[,.]\d{2})\s*$",
        flags=re.IGNORECASE
    )

    for i in range(0, len(lines) - 2):
        amount_line = lines[i].strip()
        designation_line = lines[i + 1].strip()
        ref_line = lines[i + 2].strip()

        amount_match = amount_pair_pattern.match(amount_line)
        ref_match = ref_line_pattern.match(ref_line)

        if not amount_match or not ref_match:
            continue

        ref = ref_match.group("ref").strip().upper()

        if not is_probable_product_ref(ref):
            continue

        unit_price = normalize_number(amount_match.group(1))
        line_total = normalize_number(amount_match.group(2))
        qty = normalize_number(ref_match.group("qty"))
        discount1 = normalize_number(ref_match.group("discount1"))

        discount2 = 0.0
        designation = designation_line

        desc_discount_match = re.match(
            r"^\s*(\d+[,.]\d{2})\s+(.+)$",
            designation_line
        )

        if desc_discount_match:
            discount2 = normalize_number(desc_discount_match.group(1))
            designation = clean_designation(desc_discount_match.group(2))
        else:
            designation = clean_designation(designation_line)

        if qty <= 0 or unit_price <= 0 or line_total <= 0:
            continue

        if not designation or is_label_noise(designation):
            continue

        discounts = []

        if 0 < discount1 <= 100:
            discounts.append(round_money(discount1))

        if 0 < discount2 <= 100:
            discounts.append(round_money(discount2))

        expected = qty * unit_price

        for d in discounts:
            expected = expected * (1 - d / 100)

        if abs(expected - line_total) > max(0.10, line_total * 0.03):
            continue

        results.append({
            "line_number": len(results) + 1,
            "reference": ref,
            "designation": designation,
            "quantity": round_money(qty),
            "unit": "UNIT",
            "unit_price": round_money(unit_price),
            "discounts": discounts,
            "tax_code": "19",
            "tax_rate": 19.0,
            "line_total_ht": round_money(line_total)
        })

    return results


# =========================================================
# TN GENERIC LINE EXTRACTION
# =========================================================

def extract_lines_tn(text: str) -> List[Dict[str, Any]]:
    clean = remove_cgv_pages(text)
    results = []

    pattern = re.compile(
        r"(?m)^"
        r"(?P<ref>IHPF|ICOMPTAF|ICOMPTAM|IPAIE|IABOX|IPCFRD|IPSE|IPDB|ICSABO|[A-Z][A-Z0-9]{2,12})\s+"
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

    lines = clean_lines(clean)
    allowed_refs = {
        "IHPF", "ICOMPTAF", "ICOMPTAM", "IPAIE",
        "IABOX", "IPCFRD", "IPSE", "IPDB", "ICSABO"
    }

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
        "FACTURE", "AVOIR", "CLIENT", "TOTAL", "TVA", "TND", "EUR",
        "SIRET", "SIREN", "REFERENCE", "REFERENCES",
        "DESIGNATION", "QTE", "QUANTITE", "REMISE", "MONTANT",
        "TOTALHT", "TOTALTTC", "BASE", "TAUX", "PAGE",
        "EMAIL", "WEB", "TEL", "FAX", "COMMERCIAL",
        "MATFISCAL", "MATRICULE", "FISCAL"
    ]
    if ref in blacklist:
        return False
    if re.match(r"^(FC|AC|FA|AV|FV)[_\-\s]?\d+$", ref):
        return False
    if re.match(r"^C\d{3,8}$", ref):
        return False
    if ref.startswith("FR"):
        return False
    if len(ref) < 3 or len(ref) > 40:
        return False
    if not re.search(r"[A-Z]", ref):
        return False
    if not re.match(r"^[A-Z0-9_\-]+$", ref):
        return False
    return True


def is_probable_product_ref(ref: str) -> bool:
    if not ref:
        return False
    ref = ref.strip().upper()
    blacklist = {
        "NAF", "DUNS", "TUNIS", "MILLIMES", "TOTAL", "SOUS-TOTAL",
        "GRO-OUES", "ADM-NORD", "FACTURE", "AVOIR", "CLIENT",
        "REFERENCE", "REFERENCES", "DESIGNATION", "QTE", "QUANTITE",
        "REMISE", "MONTANT", "TVA", "TND", "EUR", "PAGE"
    }
    if ref in blacklist:
        return False
    if re.match(r"^C\d{3,8}$", ref):
        return False
    if re.match(r"^\d{7}[A-Z]", ref):
        return False
    if ref.startswith("FR"):
        return False
    if len(ref) < 4 or len(ref) > 30:
        return False
    if not re.search(r"[A-Z]", ref):
        return False
    if not re.search(r"\d", ref):
        return False
    if not re.match(r"^[A-Z0-9_\-]+$", ref):
        return False
    return True


def extract_lines_vertical_fallback(lines: List[str], tax_rate: float = 20.0) -> List[Dict[str, Any]]:
    results = []
    for i, line in enumerate(lines):
        ref = line.strip().upper()
        if not valid_line_ref(ref):
            continue
        if i < 2:
            continue

        numeric_before = []
        numeric_after = []

        for j in range(max(0, i - 8), i):
            value = normalize_number(lines[j])
            if value > 0:
                numeric_before.append((j, value, lines[j]))

        for j in range(i + 1, min(len(lines), i + 6)):
            value = normalize_number(lines[j])
            if value > 0:
                numeric_after.append((j, value, lines[j]))

        all_nums = numeric_before + numeric_after
        if len(all_nums) < 2:
            continue

        qty = 0.0
        unit_price = 0.0
        discount = 0.0
        line_total = 0.0

        candidates = [n[1] for n in all_nums]
        best = None
        best_diff = 999999.0

        for q in candidates:
            for u in candidates:
                for total in candidates:
                    if q <= 0 or u <= 0 or total <= 0:
                        continue
                    if q > 10000 or u > 100000 or total > 1000000:
                        continue
                    expected = q * u
                    diff = abs(expected - total)
                    if diff < best_diff:
                        best_diff = diff
                        best = (q, u, total)

        if best:
            qty, unit_price, line_total = best

        if qty <= 0 or unit_price <= 0 or line_total <= 0:
            continue

        designation = ""
        for j in range(i - 1, max(-1, i - 12), -1):
            candidate = lines[j].strip()
            if not candidate:
                continue
            if re.match(r"^[\d\s.,]+$", candidate):
                continue
            if valid_line_ref(candidate):
                continue
            if is_label_noise(candidate):
                continue
            low = candidate.lower()
            if any(x in low for x in [
                "total", "tva", "montant", "prix", "quantité", "quantite",
                "remise", "base", "net à payer", "net a payer"
            ]):
                continue
            if len(candidate) > 4:
                designation = clean_designation(candidate)
                break

        if not designation:
            designation = ref

        expected = qty * unit_price
        if discount > 0:
            expected = expected * (1 - discount / 100)

        if abs(expected - line_total) > max(3.0, line_total * 0.25):
            continue

        results.append({
            "line_number": len(results) + 1,
            "reference": ref,
            "designation": designation,
            "quantity": round_money(qty),
            "unit": "UNIT",
            "unit_price": round_money(unit_price),
            "discounts": [round_money(discount)] if discount else [],
            "tax_code": str(int(tax_rate)) if tax_rate else "",
            "tax_rate": round_money(tax_rate),
            "line_total_ht": round_money(line_total)
        })

    return results


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


def guess_totals_from_largest_amount(text: str) -> Dict[str, float]:
    """
    Fallback générique inspiré de l'ancienne logique "extractionservice-final" :
    quand aucune regex spécifique (TND/EUR, libellés FR/TN) n'a réussi à
    identifier les totaux, on tente une heuristique purement numérique :

      1. Le plus grand montant trouvé dans le texte est probablement le TTC.
      2. On cherche, parmi les montants plus petits, le couple (HT, TVA) dont
         la somme s'approche le plus du TTC supposé.

    Cette heuristique est volontairement un DERNIER RECOURS : elle n'est
    fiable que si le texte ne contient pas trop de "bruit" numérique
    (références, codes, dates...). Elle ne doit jamais remplacer les
    méthodes ciblées déjà en place ; elle ne sert qu'à éviter de renvoyer
    des totaux à zéro quand tout le reste a échoué.
    """
    amounts = extract_amounts(text)
    if not amounts:
        return {}

    ttc = max(amounts)
    if ttc <= 0:
        return {}

    # On ignore le bruit (petits nombres, codes, taux) et on ne considère
    # que les montants significatifs et strictement inférieurs au TTC.
    candidates = [a for a in amounts if 1 < a < ttc]

    best_ht, best_tva = 0.0, 0.0
    min_diff = float("inf")

    for ht in candidates:
        for tva in candidates:
            if ht <= tva:
                continue
            if ht >= ttc or tva >= ttc:
                continue
            diff = abs((ht + tva) - ttc)
            if diff < min_diff:
                min_diff = diff
                best_ht = ht
                best_tva = tva

    if best_ht == 0:
        return {}

    # On exige que le couple trouvé reconstitue le TTC de façon crédible
    # (tolérance de 1% ou 1 unité monétaire, ce qui est plus large)
    if min_diff > max(1.0, ttc * 0.01):
        return {}

    return {
        "total_ht": round_money(best_ht),
        "taxable_amount": round_money(best_ht),
        "vat_amount": round_money(best_tva),
        "total_ttc": round_money(ttc),
        "net_to_pay": round_money(ttc)
    }


def extract_totals(text: str, lines: List[Dict[str, Any]], country_profile: str) -> Dict[str, float]:
    clean = remove_cgv_pages(text)
    if country_profile == "TN":
        return extract_totals_tn(clean, lines)
    if country_profile == "FR":
        return extract_totals_fr(clean, lines)
    return extract_totals_fr(clean, lines)


def extract_totals_tn(text: str, lines: List[Dict[str, Any]]) -> Dict[str, float]:
    if detect_tn_layout_profile(text) == "TN_TENOR":
        return extract_totals_tn_tenor(text, lines)

    total_ht = 0.0
    vat_amount = 0.0
    stamp_duty = 0.0
    total_ttc = 0.0
    net_to_pay = 0.0

    m = re.search(r"NET A PAYER\s*(" + amount_pattern() + r")\s*TND", text, flags=re.IGNORECASE)
    if m:
        net_to_pay = normalize_number(m.group(1))

    m = re.search(r"TOTAL TTC\s*(" + amount_pattern() + r")", text, flags=re.IGNORECASE)
    if m:
        total_ttc = normalize_number(m.group(1))

    m = re.search(r"TOTAL HT(.{0,250})", text, flags=re.IGNORECASE | re.DOTALL)
    if m:
        amounts = extract_amounts(m.group(1))
        amounts = [a for a in amounts if 100 <= a <= 100000]
        if amounts:
            total_ht = max(amounts)

    m = re.search(r"Total TVA\s*(" + amount_pattern() + r")", text, flags=re.IGNORECASE)
    if m:
        vat_amount = normalize_number(m.group(1))
    else:
        m = re.search(r"(" + amount_pattern() + r")\s*Total TVA", text, flags=re.IGNORECASE)
        if m:
            vat_amount = normalize_number(m.group(1))

    if total_ttc and net_to_pay and net_to_pay > total_ttc:
        stamp_duty = net_to_pay - total_ttc

    if total_ht == 0 and lines:
        total_ht = sum(l.get("line_total_ht", 0) for l in lines)

    # Fallback supplémentaire : si malgré les regex ciblées et la somme
    # des lignes, on n'a toujours ni total_ht ni total_ttc, on tente
    # l'heuristique générique "plus grand montant = TTC".
    if total_ht == 0 and total_ttc == 0:
        guessed = guess_totals_from_largest_amount(text)
        if guessed:
            total_ht = guessed.get("total_ht", 0) or total_ht
            vat_amount = guessed.get("vat_amount", 0) or vat_amount
            total_ttc = guessed.get("total_ttc", 0) or total_ttc

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


def extract_totals_tn_tenor(text: str, lines: List[Dict[str, Any]]) -> Dict[str, float]:
    total_ht = 0.0
    vat_amount = 0.0
    stamp_duty = 0.0
    net_to_pay = 0.0
    total_ttc = 0.0

    if lines:
        total_ht = sum(float(l.get("line_total_ht", 0) or 0) for l in lines)

    m = re.search(
        r"Timbre\s+Fiscale?\s+(" + amount_pattern() + r")",
        text,
        flags=re.IGNORECASE
    )
    if m:
        stamp_duty = normalize_number(m.group(1))

    m = re.search(
        r"19[,.]00\s+(" + amount_pattern() + r")",
        text,
        flags=re.IGNORECASE
    )
    if m:
        vat_amount = normalize_number(m.group(1))

    m = re.search(r"\*+\s*(" + amount_pattern() + r")", text)
    if m:
        net_to_pay = normalize_number(m.group(1))

    if stamp_duty == 0 and re.search(r"Timbre\s+Fiscale?", text, flags=re.IGNORECASE):
        stamp_duty = 1.0

    if total_ht == 0 and net_to_pay and vat_amount:
        total_ht = net_to_pay - stamp_duty - vat_amount

    if vat_amount == 0 and total_ht:
        vat_amount = total_ht * 0.19

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

    bottom_zone = text
    idx = text.lower().rfind("tva non applicable")
    if idx != -1:
        bottom_zone = text[idx:]

    amounts = extract_amounts(bottom_zone)

    m = re.search(r"\*+\s*(" + amount_pattern() + r")", bottom_zone)
    if m:
        total_ttc = normalize_number(m.group(1))

    if len(amounts) >= 4:
        big_amounts = [a for a in amounts if a > 10]

        if not total_ttc and big_amounts:
            total_ttc = max(big_amounts)

        for a in big_amounts:
            for b in big_amounts:
                if b > a and abs((a * 1.20) - b) < 2:
                    taxable_amount = a
                    vat_amount = b - a
                    break

        if total_ht == 0 and len(big_amounts) >= 1:
            total_ht = big_amounts[0]

        if taxable_amount == 0 and len(big_amounts) >= 2:
            taxable_amount = big_amounts[1]

        if vat_amount == 0 and len(big_amounts) >= 3:
            vat_amount = big_amounts[2]

    # Shipping non taxable — primary match
    m = re.search(
        r"Frais de port Non So(?:umis)?\s*(" + amount_pattern() + r")",
        text,
        flags=re.IGNORECASE
    )
    if m:
        shipping_non_taxable = normalize_number(m.group(1))

    # Shipping non taxable — fallback for split label
    if shipping_non_taxable == 0:
        m = re.search(
            r"Frais de port\s+Non.{0,20}?(" + amount_pattern() + r")",
            text,
            flags=re.IGNORECASE | re.DOTALL
        )
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

    # Fallback supplémentaire : si rien n'a permis de déterminer ni le
    # total_ht ni le total_ttc (regex spécifiques FR + somme des lignes
    # ont toutes échoué), on tente l'heuristique générique "plus grand
    # montant du texte = TTC, meilleur couple HT/TVA en dessous".
    if total_ht == 0 and total_ttc == 0:
        guessed = guess_totals_from_largest_amount(text)
        if guessed:
            total_ht = guessed.get("total_ht", 0) or total_ht
            taxable_amount = guessed.get("taxable_amount", 0) or taxable_amount
            vat_amount = guessed.get("vat_amount", 0) or vat_amount
            total_ttc = guessed.get("total_ttc", 0) or total_ttc

    if taxable_amount == 0:
        taxable_amount = total_ht + shipping_non_taxable + shipping_taxable + packaging

    if vat_amount == 0 and taxable_amount:
        vat_amount = taxable_amount * 0.20

    if total_ttc == 0:
        total_ttc = taxable_amount + vat_amount

    net_to_pay = total_ttc
    if shipping_non_taxable == 0 and taxable_amount > total_ht:
        shipping_non_taxable = taxable_amount - total_ht

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
    shipping_non_taxable = float(result.get("totals", {}).get("shipping_non_taxable", 0) or 0)
    shipping_taxable = float(result.get("totals", {}).get("shipping_taxable", 0) or 0)
    packaging = float(result.get("totals", {}).get("packaging", 0) or 0)

    expected_ttc = total_ht + shipping_non_taxable + shipping_taxable + packaging + vat_amount
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
    prompt = f"""You are an expert invoice-parsing assistant. You read the raw text of an
invoice (extracted from a PDF, so spacing/line breaks may be irregular or
columns may appear out of order) and extract ONLY the product/service line
items table — never the header, totals, or payment terms.

Country profile: {country_profile}

Return ONLY a valid JSON array. No explanation, no markdown, no code fences.

Each element of the array must be an object with EXACTLY these fields:
- line_number: integer, starting at 1
- reference: string, the article/product/service code (e.g. "HIS0001"). If there is truly no reference code, use an empty string "".
- designation: string, the human-readable description of the product/service
- quantity: number (decimal point, not comma)
- unit: string, e.g. "UNIT", "KG", "H" — default to "UNIT" if unclear
- unit_price: number, price per unit before tax (decimal point, not comma)
- discounts: array of numbers (percentages). Example: a cell showing "50+35" means [50, 35]. If no discount, use [].
- tax_code: string, the tax/VAT code shown on that line if present (e.g. "1", "19"), else ""
- tax_rate: number, the VAT/tax rate percentage for that line if known, else 0
- line_total_ht: number, the line amount BEFORE tax (decimal point, not comma)

CRITICAL RULES:
1. Only extract rows that represent an actual product or service sold (a real article line). Never extract: totals, subtotals, VAT summary rows, shipping/packaging fee rows, payment terms, addresses, company identifiers (SIRET/SIREN/VAT numbers), or boilerplate/legal text.
2. Do NOT invent or guess any value. If a field is genuinely not present for a line, use 0 for numbers or "" for strings — never fabricate a plausible-looking number.
3. quantity * unit_price should approximately equal line_total_ht (accounting for any discounts). Use this to sanity-check which numbers belong together when the layout is ambiguous.
4. Numbers may appear in the text using a comma as decimal separator (e.g. "15,000" = 15.0, "6,0000" = 6.0, "90,00" = 90.0) or as a thousands separator with a space (e.g. "1 234,56" = 1234.56). Convert everything to standard decimal-point numbers in your JSON output.
5. If the invoice text is in French, Arabic, or English, still follow these same rules — the table structure matters more than the language.
6. If you cannot find ANY genuine product/service line in the text, return an empty array [].

EXAMPLE INPUT (fragment of invoice text):
HIS0001 Article pour historique des consommations 15,000 6,0000 90,00 1

EXAMPLE OUTPUT for that fragment:
[{{"line_number": 1, "reference": "HIS0001", "designation": "Article pour historique des consommations", "quantity": 15.0, "unit": "UNIT", "unit_price": 6.0, "discounts": [], "tax_code": "1", "tax_rate": 0, "line_total_ht": 90.0}}]

Now extract the line items from this invoice text:

{raw_text}
"""
    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [{"role": "user", "content": prompt}],
        "options": {"temperature": 0.0}
    }
    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=90)
        response.raise_for_status()
        content = response.json().get("message", {}).get("content", "")
        match = re.search(r"\[.*\]", content, re.DOTALL)
        if match:
            data = json.loads(match.group(0))
            if isinstance(data, list):
                cleaned = []
                for i, line in enumerate(data):
                    if not isinstance(line, dict):
                        continue
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
    clean = remove_cgv_pages(text)
    lines = clean_lines(clean)
    for line in lines[:80]:
        low = line.strip().lower()
        if low in ["avoir", "note de crédit", "note de credit", "credit note"]:
            return {"document_type": "Avoir", "document_type_code": "I-12"}
    return {"document_type": "Facture", "document_type_code": "I-11"}


def fix_tn_customer_from_text(customer: Dict[str, Any], text: str, country_profile: str) -> Dict[str, Any]:
    if country_profile != "TN":
        return customer

    fixed = dict(customer)

    for m in re.finditer(r"(?im)^\s*Client\s*:[ \t]*([^\n\r]+)\s*$", text):
        candidate = clean_company_name(m.group(1)).strip()
        low = candidate.lower()
        if not candidate:
            continue
        if is_label_noise(candidate):
            continue
        if any(x in low for x in ["téléphone", "telephone", "télécopie", "telecopie", "email", "web"]):
            continue
        fixed["name"] = candidate
        break

    code_tva_pattern = re.compile(
        r"Code\s+TVA\s*:\s*("
        r"[0-9]{7}[A-Z]{2,3}[0-9]{3}"
        r"|[0-9]{7}[A-Z]/[A-Z]/[A-Z][0-9]{3}"
        r"|[0-9]{7}[A-Z]/[A-Z]/[A-Z]/[0-9]{3}"
        r")",
        flags=re.IGNORECASE
    )
    matches = list(code_tva_pattern.finditer(text))

    if not fixed.get("tax_reference"):
        all_tn_refs = re.findall(
            r"\b\d{7}[A-Z]/[A-Z]/[A-Z]/\d{3}\b",
            text,
            flags=re.IGNORECASE
        )
        if all_tn_refs:
            customer_tax = all_tn_refs[-1].upper()
            fixed["tax_reference"] = customer_tax
            fixed["identifier"] = customer_tax.replace("/", "")

    if len(matches) >= 2:
        customer_tax = matches[1].group(1).strip().upper()
        fixed["tax_reference"] = customer_tax
        fixed["identifier"] = customer_tax.replace("/", "")

        zone = text[matches[0].end():matches[1].start()]
        addr_lines = []
        for line in clean_lines(zone):
            low = line.lower().strip()
            if not line.strip():
                continue
            if any(x in low for x in [
                "code tva", "facture", "client", "commande", "rc",
                "references", "références", "qte", "p.u", "remise",
                "montant", "tva", "tnd", "page", "email", "web",
                "téléphone", "telephone", "télécopie", "telecopie"
            ]):
                continue
            if "@" in line:
                continue
            if re.match(r"^\+?\d{6,}", line.strip()):
                continue
            if (
                any(k in low for k in ["résidence", "residence", "borj", "bloc", "bur", "bureau", "ariana", "tunis", "rue", "avenue", "route"])
                or re.match(r"^\d{4}\s+[A-ZÀ-ÿ]", line.strip())
            ):
                addr_lines.append(line.strip())

        if addr_lines:
            fixed["address"] = ", ".join(addr_lines[:5])

    bad_addr = str(fixed.get("address", "")).lower()
    if any(x in bad_addr for x in ["system", "administration", "erp", "40+35", "50+35", "connecteur"]):
        fixed["address"] = ""

    return fixed


def validate_for_teif(result: Dict[str, Any]) -> Dict[str, Any]:
    errors = []
    warnings = []

    supplier = result.get("supplier", {})
    customer = result.get("customer", {})
    invoice = result.get("invoice", {})
    totals = result.get("totals", {})
    lines = result.get("lines", [])

    if not supplier.get("name"):
        errors.append("supplier.name missing")
    if supplier.get("name", "").lower() in ["timbre fiscale", "timbre fiscal"]:
        errors.append("supplier.name is invalid")
    if not (
        supplier.get("identifier")
        or supplier.get("vat_number")
        or supplier.get("tax_reference")
        or supplier.get("siret")
    ):
        errors.append("supplier identifier missing")

    if not customer.get("name"):
        errors.append("customer.name missing")
    if customer.get("name", "").lower() in [
        "téléphone :", "telephone :", "email :", "web :", "client :"
    ]:
        errors.append("customer.name is invalid")
    if not (
        customer.get("code")
        or customer.get("identifier")
        or customer.get("tax_reference")
        or customer.get("siren")
        or customer.get("siret")
    ):
        errors.append("customer identifier missing")

    number = str(invoice.get("number", "")).strip()
    if not number:
        errors.append("invoice.number missing")
    if "\n" in number:
        errors.append("invoice.number invalid")
    if not re.search(r"(FC|FA|AC|FV|AV|FACT|INV|^\d{5,})", number, flags=re.IGNORECASE):
        errors.append("invoice.number format suspicious")
    if not invoice.get("date"):
        errors.append("invoice.date missing")
    if not lines:
        errors.append("invoice lines missing")

    total_ht = float(totals.get("total_ht", 0) or 0)
    vat_amount = float(totals.get("vat_amount", 0) or 0)
    total_ttc = float(totals.get("total_ttc", 0) or 0)
    net_to_pay = float(totals.get("net_to_pay", 0) or 0)
    stamp_duty = float(totals.get("stamp_duty", 0) or 0)
    lines_sum = sum(float(l.get("line_total_ht", 0) or 0) for l in lines)

    if total_ht <= 0:
        errors.append("totals.total_ht missing")
    if total_ttc <= 0 and net_to_pay <= 0:
        errors.append("total_ttc/net_to_pay missing")
    if lines_sum and total_ht and abs(lines_sum - total_ht) > max(0.05, total_ht * 0.02):
        errors.append("sum(lines) does not match total_ht")

    shipping_non_taxable = float(totals.get("shipping_non_taxable", 0) or 0)
    shipping_taxable = float(totals.get("shipping_taxable", 0) or 0)
    packaging = float(totals.get("packaging", 0) or 0)

    expected_ttc = total_ht + shipping_non_taxable + shipping_taxable + packaging + vat_amount
    if total_ttc and abs(expected_ttc - total_ttc) > max(0.05, total_ttc * 0.02):
        errors.append("total_ht + charges + vat_amount does not match total_ttc")
    if stamp_duty and net_to_pay and abs((total_ttc + stamp_duty) - net_to_pay) > 0.05:
        errors.append("total_ttc + stamp_duty does not match net_to_pay")

    can_generate_teif = len(errors) == 0
    return {
        "can_generate_teif": can_generate_teif,
        "status": "validated" if can_generate_teif else "needs_review",
        "blocking_errors": errors,
        "warnings": warnings
    }


# =========================================================
# OUTPUT FORMATTING
# =========================================================

def format_date_fr(value: str) -> str:
    if not value:
        return ""
    try:
        return datetime.strptime(value, "%Y-%m-%d").strftime("%d/%m/%Y")
    except Exception:
        return value


def format_montant_fr(value: Any, currency: str = "") -> str:
    try:
        n = float(value or 0)
        txt = f"{n:,.3f}".replace(",", " ").replace(".", ",")
        if txt.endswith(",000"):
            txt = txt[:-4]
        return f"{txt} {currency}".strip()
    except Exception:
        return str(value or "")


def build_sortie_fr(result: Dict[str, Any]) -> Dict[str, Any]:
    document = result.get("document", {})
    supplier = result.get("supplier", {})
    customer = result.get("customer", {})
    invoice = result.get("invoice", {})
    payment = result.get("payment", {})
    totals = result.get("totals", {})
    validation = result.get("validation", {})
    quality = result.get("quality", {})
    currency = document.get("currency", "")

    lignes_fr = []
    for line in result.get("lines", []):
        lignes_fr.append({
            "numero_ligne": line.get("line_number"),
            "reference": line.get("reference", ""),
            "designation": line.get("designation", ""),
            "quantite": line.get("quantity", 0),
            "unite": line.get("unit", "UNIT"),
            "prix_unitaire": format_montant_fr(line.get("unit_price", 0), currency),
            "remises": line.get("discounts", []),
            "taux_tva": f"{line.get('tax_rate', 0)} %",
            "montant_ht": format_montant_fr(line.get("line_total_ht", 0), currency)
        })

    erreurs_fr = {
        "supplier.name missing": "Nom du fournisseur manquant",
        "supplier.name is invalid": "Nom du fournisseur invalide",
        "supplier identifier missing": "Identifiant fiscal du fournisseur manquant",
        "customer.name missing": "Nom du client manquant",
        "customer.name is invalid": "Nom du client invalide",
        "customer identifier missing": "Identifiant du client manquant",
        "invoice.number missing": "Numéro de facture manquant",
        "invoice.number invalid": "Numéro de facture invalide",
        "invoice.number format suspicious": "Format du numéro de facture suspect",
        "invoice.date missing": "Date de facture manquante",
        "invoice lines missing": "Lignes de facture manquantes",
        "totals.total_ht missing": "Total hors taxe manquant",
        "total_ttc/net_to_pay missing": "Total TTC ou net à payer manquant",
        "sum(lines) does not match total_ht": "La somme des lignes ne correspond pas au total HT",
        "total_ht + charges + vat_amount does not match total_ttc": "Total HT + charges + TVA ne correspond pas au total TTC",
        "total_ttc + stamp_duty does not match net_to_pay": "Total TTC + timbre fiscal ne correspond pas au net à payer"
    }

    blocking_errors = validation.get("blocking_errors", [])

    return {
        "document": {
            "type_document": document.get("document_type", ""),
            "code_type_document": document.get("document_type_code", ""),
            "profil_pays": "Tunisie" if document.get("country_profile") == "TN" else "France",
            "devise": currency,
            "source": document.get("source_type", ""),
            "nombre_pages": document.get("page_count", 0)
        },
        "fournisseur": {
        "nom": supplier.get("name", ""),
        "numero_fournisseur": supplier.get("identifier", ""),
        "identifiant": supplier.get("identifier", ""),
        "type_identifiant": supplier.get("identifier_type", ""),
        "matricule_fiscal_ou_tva": supplier.get("tax_reference") or supplier.get("vat_number", ""),
        "siret": supplier.get("siret", ""),
        "adresse": supplier.get("address", ""),
        "pays": supplier.get("country", ""),
        "telephone": supplier.get("phone", ""),
        "email": supplier.get("email", ""),
        "site_web": supplier.get("website", "")
        },
        "client": {
            "code_client": customer.get("code", ""),
            "nom": customer.get("name", ""),
            "identifiant": customer.get("identifier", ""),
            "type_identifiant": customer.get("identifier_type", ""),
            "matricule_fiscal_ou_tva": customer.get("tax_reference") or customer.get("vat_number", ""),
            "siren": customer.get("siren", ""),
            "adresse": customer.get("address", ""),
            "pays": customer.get("country", "")
        },
        "facture": {
            "numero": invoice.get("number", ""),
            "date_facture": format_date_fr(invoice.get("date", "")),
            "date_echeance": format_date_fr(invoice.get("due_date", "")),
            "reference": invoice.get("reference", ""),
            "commercial": invoice.get("commercial", ""),
            "mode_paiement": payment.get("method", ""),
            "conditions_paiement": payment.get("terms", "")
        },
        "lignes_facture": lignes_fr,
        "totaux": {
            "total_ht": format_montant_fr(totals.get("total_ht", 0), currency),
            "base_tva": format_montant_fr(totals.get("taxable_amount", 0), currency),
            "montant_tva": format_montant_fr(totals.get("vat_amount", 0), currency),
            "timbre_fiscal": format_montant_fr(totals.get("stamp_duty", 0), currency),
            "frais_port_non_soumis": format_montant_fr(totals.get("shipping_non_taxable", 0), currency),
            "frais_port_soumis": format_montant_fr(totals.get("shipping_taxable", 0), currency),
            "frais_emballage": format_montant_fr(totals.get("packaging", 0), currency),
            "total_ttc": format_montant_fr(totals.get("total_ttc", 0), currency),
            "net_a_payer": format_montant_fr(totals.get("net_to_pay", 0), currency)
        },
        "controle_validation": {
            "statut": "Validé" if validation.get("can_generate_teif") else "À vérifier",
            "peut_generer_teif": validation.get("can_generate_teif", False),
            "nombre_lignes_detectees": len(result.get("lines", [])),
            "somme_lignes_ht": format_montant_fr(
                quality.get("calculation_check", {}).get("lines_sum_ht", 0),
                currency
            ),
            "montant_attendu": format_montant_fr(
                quality.get("calculation_check", {}).get("expected_ttc_or_net", 0),
                currency
            ),
            "difference": format_montant_fr(
                quality.get("calculation_check", {}).get("difference", 0),
                currency
            ),
            "erreurs_bloquantes": [
                erreurs_fr.get(e, e) for e in blocking_errors
            ]
        }
    }


def build_resume_validation_fr(result: Dict[str, Any]) -> Dict[str, Any]:
    validation = result.get("validation", {})
    quality = result.get("quality", {})
    totals = result.get("totals", {})
    lines = result.get("lines", [])

    erreurs_fr = {
        "supplier.name missing": "Nom du fournisseur manquant",
        "supplier.name is invalid": "Nom du fournisseur invalide",
        "supplier identifier missing": "Identifiant fiscal du fournisseur manquant",
        "customer.name missing": "Nom du client manquant",
        "customer.name is invalid": "Nom du client invalide",
        "customer identifier missing": "Identifiant du client manquant",
        "invoice.number missing": "Numéro de facture manquant",
        "invoice.number invalid": "Numéro de facture invalide",
        "invoice.number format suspicious": "Format du numéro de facture suspect",
        "invoice.date missing": "Date de facture manquante",
        "invoice lines missing": "Lignes de facture manquantes",
        "totals.total_ht missing": "Total hors taxe manquant",
        "total_ttc/net_to_pay missing": "Total TTC ou net à payer manquant",
        "sum(lines) does not match total_ht": "La somme des lignes ne correspond pas au total HT",
        "total_ht + charges + vat_amount does not match total_ttc": "Total HT + charges + TVA ne correspond pas au total TTC",
        "total_ttc + stamp_duty does not match net_to_pay": "Total TTC + timbre fiscal ne correspond pas au net à payer"
    }

    blocking_errors = validation.get("blocking_errors", [])

    return {
        "statut": "Validé" if validation.get("can_generate_teif") else "À vérifier",
        "peut_generer_teif": validation.get("can_generate_teif", False),
        "nombre_lignes_detectees": len(lines),
        "total_ht": totals.get("total_ht", 0),
        "base_tva": totals.get("taxable_amount", 0),
        "montant_tva": totals.get("vat_amount", 0),
        "timbre_fiscal": totals.get("stamp_duty", 0),
        "frais_port_non_soumis": totals.get("shipping_non_taxable", 0),
        "total_ttc": totals.get("total_ttc", 0),
        "net_a_payer": totals.get("net_to_pay", 0),
        "erreurs_bloquantes": [
            erreurs_fr.get(e, e) for e in blocking_errors
        ],
        "controle_calcul": {
            "somme_lignes_ht": quality.get("calculation_check", {}).get("lines_sum_ht", 0),
            "montant_attendu": quality.get("calculation_check", {}).get("expected_ttc_or_net", 0),
            "difference": quality.get("calculation_check", {}).get("difference", 0),
            "statut": quality.get("calculation_check", {}).get("status", "")
        }
    }


# =========================================================
# MAIN EXTRACTION
# =========================================================

@app.post("/extract")
def extract(req: ExtractionRequest):
    try:
        raw_text = clean_text(req.raw_text)

        country_profile = detect_country_profile(raw_text)
        currency = detect_currency(raw_text, country_profile)

        raw_text = remove_cgv_pages(clean_text(req.raw_text))
        lines = clean_lines(raw_text)

        doc_type = detect_document_type_strict(raw_text)

        supplier = extract_supplier(lines, raw_text, country_profile, req.blocks)
        supplier = fix_fr_supplier_identifiers(supplier, raw_text, country_profile)

        customer = extract_customer(lines, raw_text, country_profile, req.blocks)
        customer = fix_tn_customer_from_text(customer, raw_text, country_profile)

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

        quality = build_quality(result)

        needs_llm = False
        if quality["confidence"] < 0.85:
            needs_llm = True
        if not result.get("lines"):
            needs_llm = True
        if not result.get("invoice", {}).get("number"):
            needs_llm = True
        if not result.get("totals", {}).get("total_ht"):
            needs_llm = True

        if result.get("document", {}).get("country_profile") == "TN":
            customer_check = result.get("customer", {})
            if customer_check.get("name") in ["", "Téléphone :", "Télécopie :", "Email :", "Web :"]:
                needs_llm = True
            bad_address_words = ["system", "erp", "40+35", "50+35", "connecteur", "administration"]
            address = str(customer_check.get("address", "")).lower()
            if address and any(x in address for x in bad_address_words):
                needs_llm = True

        llm_data = {}
        if needs_llm:
            llm_data = call_llm_full_extraction(raw_text, country_profile, currency, doc_type)

        if llm_data.get("supplier"):
            result["supplier"].update({
                k: v for k, v in llm_data.get("supplier", {}).items()
                if v not in ["", None, [], {}]
            })

        if llm_data.get("customer"):
            result["customer"].update({
                k: v for k, v in llm_data.get("customer", {}).items()
                if v not in ["", None, [], {}]
            })

        if llm_data.get("invoice"):
            result["invoice"].update({
                k: v for k, v in llm_data.get("invoice", {}).items()
                if v not in ["", None, [], {}]
            })

        if llm_data.get("payment"):
            result["payment"].update({
                k: v for k, v in llm_data.get("payment", {}).items()
                if v not in ["", None, [], {}]
            })

        # VERY IMPORTANT:
        # Do not replace valid regex lines with empty LLM lines
        llm_lines = llm_data.get("lines", [])
        if llm_lines and lines_look_plausible(llm_lines):
            result["lines"] = renumber_lines(llm_lines)

        # Same for totals: only replace if LLM totals are not empty
        llm_totals = llm_data.get("totals", {})
        if llm_totals and any(float(llm_totals.get(k, 0) or 0) > 0 for k in ["total_ht", "total_ttc", "net_to_pay"]):
            result["totals"].update({
                k: v for k, v in llm_totals.items()
                if v not in ["", None, [], {}]
            })

        llm_tax_summary = llm_data.get("tax_summary", [])
        if llm_tax_summary:
            result["tax_summary"] = llm_tax_summary

        result["document"]["country_profile"] = country_profile
        result["document"]["currency"] = currency
        result["document"]["document_type"] = doc_type["document_type"]
        result["document"]["document_type_code"] = doc_type["document_type_code"]
        quality = build_quality(result)
        result["quality"] = quality
        result["confidence"] = quality["confidence"]

        validation = validate_for_teif(result)
        result["validation"] = validation
        result["sortie_fr"] = build_sortie_fr(result)

        if not validation["can_generate_teif"]:
            result["confidence"] = min(result["confidence"], 0.5)
            result["quality"]["confidence"] = result["confidence"]
            result["resume_validation_fr"] = build_resume_validation_fr(result)

        return result["sortie_fr"]

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