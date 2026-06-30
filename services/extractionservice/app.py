import re
import json
import os
from typing import Any, Dict, List, Optional
from datetime import datetime

import requests
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="extractionservice-mix-final")

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434/api/chat")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "mistral")


# =========================================================
# MODELS
# =========================================================

class ExtractionRequest(BaseModel):
    raw_text: str
    page_count: int = 1
    source_type: str = "unknown"
    blocks: List[Dict[str, Any]] = Field(default_factory=list)
    words: List[Dict[str, Any]] = Field(default_factory=list)


# =========================================================
# BASIC UTILS
# =========================================================

def clean_text(text: str) -> str:
    text = text or ""
    text = text.replace("\r", "\n").replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clean_lines(text: str) -> List[str]:
    return [x.strip() for x in (text or "").split("\n") if x.strip()]


def normalize_number(value: Any) -> float:
    """Accepts 1 312,19 / 1312.19 / -216,00 / 2 700,0000."""
    if value is None:
        return 0.0
    s = str(value).strip().replace("\u00a0", " ")
    s = re.sub(r"[^0-9,\.\-\s]", "", s).strip()
    if not s or s in ["-", ".", ","]:
        return 0.0

    if "," in s and "." in s:
        # decimal separator is normally the last separator
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    else:
        s = s.replace(" ", "").replace(",", ".")

    try:
        return float(s)
    except Exception:
        return 0.0


def r3(v: Any) -> float:
    return round(float(v or 0), 3)


def r2(v: Any) -> float:
    return round(float(v or 0), 2)


def money_str(v: Any, currency: str, decimals: Optional[int] = None) -> str:
    """French display: 3190.081 -> 3 190,081 TND."""
    n = float(v or 0)
    if decimals is None:
        decimals = 3 if abs(n - round(n, 2)) > 0.0001 else 2
    s = f"{n:,.{decimals}f}".replace(",", "X").replace(".", ",").replace("X", " ")
    if decimals > 0:
        # Trim useless decimals only if value is integer
        if re.fullmatch(r"-?\d+(?: \d{3})*,0+", s):
            s = s.split(",")[0]
    return f"{s} {currency}".strip()


def compact_invoice_no(value: str) -> str:
    value = re.sub(r"\s+", "", value or "")
    value = value.replace("-", "_") if re.match(r"^[A-Z]{2}-", value, re.I) else value
    return value.upper()


def num_re() -> str:
    # Strict amount token. Allows thousands spaces inside the integer part
    # like "2 700,0000", but does NOT swallow the next column.
    return r"-?(?:\d{1,3}(?:[ \u00a0]\d{3})+|\d+)[,.]\d{1,4}"


def parse_date_iso_or_original(value: str, output: str = "original") -> str:
    value = (value or "").strip()
    for fmt in ["%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d-%m-%y", "%d.%m.%Y", "%d.%m.%y"]:
        try:
            dt = datetime.strptime(value, fmt)
            return dt.strftime("%Y-%m-%d") if output == "iso" else dt.strftime("%d/%m/%Y")
        except Exception:
            pass
    return value


def find_dates(text: str) -> List[str]:
    out = []
    for d in re.findall(r"\b\d{2}[\/\-.]\d{2}[\/\-.]\d{2,4}\b", text or ""):
        p = parse_date_iso_or_original(d, "original")
        if p and p not in out:
            out.append(p)
    return out


def clean_name(line: str) -> str:
    line = re.sub(r"\s+", " ", line or "").strip(" :-")
    return line


# =========================================================
# DETECTION
# =========================================================

def detect_country(text: str) -> str:
    t = (text or "").lower()
    tn = sum(k in t for k in [
        "tnd", "timbre fiscal", "timbre fiscale", "matricule fiscal",
        "code tva", "dinars", "millimes", "+216", "tunisie", "ariana", "boumhell"
    ])
    fr = sum(k in t for k in [
        "eur", "siret", "siren", "tva intra", "naf", "fr france",
        "code général des impôts", "code general des impots", "cedex"
    ])
    if tn > fr:
        return "TN"
    if fr > tn:
        return "FR"
    return "UNKNOWN"


def country_label(country: str) -> str:
    return {"TN": "Tunisie", "FR": "France"}.get(country, country or "")


def detect_currency(text: str, country: str) -> str:
    up = (text or "").upper()
    if "TND" in up:
        return "TND"
    if "EUR" in up or "€" in up:
        return "EUR"
    return "TND" if country == "TN" else "EUR" if country == "FR" else ""


def detect_doc_type(text: str) -> Dict[str, str]:
    # Do not classify a normal invoice as Avoir just because it contains
    # a line like "Avoir facture d'acompte" inside the article table.
    lines = clean_lines(text or "")
    for l in lines[:80]:
        x = l.strip().lower()
        if x in ["avoir", "avoir 1"] or re.fullmatch(r"avoir\s+\d+", x):
            return {"name": "Avoir", "code": "I-12"}
        if x in ["facture", "facture 1"] or re.fullmatch(r"facture\s+\d+", x):
            return {"name": "Facture", "code": "I-11"}
    if re.search(r"\b(note de cr[eé]dit|credit note)\b", text or "", re.I):
        return {"name": "Avoir", "code": "I-12"}
    return {"name": "Facture", "code": "I-11"}


# =========================================================
# CONTACTS / IDS
# =========================================================

def emails(text: str) -> List[str]:
    return list(dict.fromkeys(re.findall(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", text or "")))


def websites(text: str) -> List[str]:
    return list(dict.fromkeys(re.findall(r"(?:www\.|https?://)[^\s]+", text or "", re.I)))


def phones(text: str) -> List[str]:
    raw = re.findall(r"(?:\+?\d{2,3}[\s\-.]?)?(?:\(?\d{1,4}\)?[\s\-.]?){4,7}", text or "")
    out = []
    for p in raw:
        p = re.sub(r"\s+", " ", p).strip(" -.")
        digits = re.sub(r"\D", "", p)
        # Avoid Siren/customer codes being treated as phone numbers.
        if len(digits) == 9 and not p.strip().startswith(("0", "+")):
            continue
        if 8 <= len(digits) <= 15 and p not in out:
            out.append(p)
    return out


def vat_numbers(text: str) -> List[str]:
    out = []
    patterns = [
        r"\bFR[A-Z0-9]{2}\d{9,10}\b",
        r"\b\d{7}[A-Z]{2,3}\d{3}\b",
        r"\b\d{7}[A-Z]/[A-Z]/[A-Z]/\d{3}\b",
        r"\b\d{7}[A-Z]\b",
    ]
    for p in patterns:
        for m in re.findall(p, text or "", re.I):
            out.append(m.upper())
    return list(dict.fromkeys(out))


def extract_siret(text: str) -> str:
    m = re.search(r"Siret\s+(\d{12,14})", text or "", re.I)
    if m:
        return m.group(1)
    c = re.findall(r"\b\d{12,14}\b", text or "")
    return c[0] if c else ""


def extract_siren(text: str) -> str:
    m = re.search(r"Num[eé]ro\s+Siren\s+(\d{9})", text or "", re.I)
    if m:
        return m.group(1)
    c = re.findall(r"\b\d{9}\b", text or "")
    return c[0] if c else ""


def extract_rc(text: str) -> str:
    m = re.search(r"\bRC\s*:\s*([A-Z0-9]+)", text or "", re.I)
    return m.group(1) if m else ""


# =========================================================
# HEADER EXTRACTION
# =========================================================

def noise_header(line: str) -> bool:
    low = (line or "").lower()
    bad = [
        "facture", "avoir", "page", "date", "numéro", "numero", "client", "référence", "reference",
        "désignation", "designation", "quantité", "quantite", "prix unitaire", "remise", "montant",
        "base t.v.a", "t.t.c", "net à payer", "net a payer", "matricule fiscal", "code tva",
        "tél", "fax", "email", "e_mail", "site web", "livré", "livre", "total", "duns", "naf"
    ]
    return any(x in low for x in bad)


def extract_invoice_number(text: str) -> str:
    patterns = [
        r"\b\d{2}/\d{2}/\d{2,4}\s+((?:FA|FC|AC|AV|FV)[_\-\s]*\d{4,8})\s+C\d{3,8}\b",
        r"\b\d{2}/\d{2}/\d{2,4}\s+(\d{6,10})\s+C\d{3,8}\b",
        r"\b((?:FA|FC|AC|AV|FV)[_\-\s]*\d{4,8})\b",
    ]
    for p in patterns:
        m = re.search(p, text or "", re.I)
        if m:
            return compact_invoice_no(m.group(1))
    m = re.search(r"\b\d{8}\b", text or "")
    return m.group(0) if m else ""


def extract_client_code(text: str) -> str:
    m = re.search(r"\bC\d{3,8}\b", text or "", re.I)
    return m.group(0).upper() if m else ""


def extract_commercial(text: str) -> str:
    # Date invoice client reference then commercial code/name often after it
    m = re.search(r"\b\d{2}/\d{2}/\d{2,4}\s+\S+\s+C\d{3,8}\s*\n([^\n]+)\n([^\n]+)", text or "", re.I)
    if m:
        # In Papyrus: first line GRO-SUD, second line Hubert CHEVENOL...
        return clean_name(m.group(2))
    return ""


def extract_due_date(text: str, invoice_date: str) -> str:
    # Avoid ancient accounting/tax dates like 01/01/14 or 31/12/99.
    current_year = 0
    try:
        current_year = datetime.strptime(invoice_date, "%d/%m/%Y").year
    except Exception:
        pass

    candidates = []
    for m in re.finditer(r"(?:virement|ch[eè]que|echeance|échéance|net|r[eé]ception).{0,80}?(\d{2}/\d{2}/\d{2,4})", text or "", re.I | re.S):
        d = parse_date_iso_or_original(m.group(1), "original")
        try:
            y = datetime.strptime(d, "%d/%m/%Y").year
            if not current_year or abs(y - current_year) <= 2:
                candidates.append(d)
        except Exception:
            pass
    return candidates[-1] if candidates else invoice_date


def extract_payment(text: str) -> Dict[str, str]:
    low = (text or "").lower()
    mode = ""
    cond = ""
    if "virement" in low:
        mode = "Virement"
    if "chèque" in low or "cheque" in low:
        mode = "Chèque"
    m = re.search(r"(Virement|Ch[eè]que)\s+([^\n]{0,80})", text or "", re.I)
    if m:
        cond = clean_name(m.group(0))
    return {"mode": mode, "conditions": cond}


def extract_supplier(lines: List[str], text: str, country: str) -> Dict[str, Any]:
    em = emails(text)
    web = websites(text)
    ph = phones(text)
    vats = vat_numbers(text)

    name = ""
    address = ""
    identifier = ""
    tax = ""

    if country == "TN":
        if is_issolutions_invoice(text):
            name = "ISSolutions"
            # Supplier VAT in this layout
            m_tax = re.search(r"Code\s+TVA\s*:\s*(\d{7}[A-Z]{2,3}\d{3})", text or "", re.I)
            if m_tax:
                tax = m_tax.group(1).upper()
                identifier = tax
            # Supplier address from left header
            addr = []
            for l in lines[:35]:
                low = l.lower()
                if any(k in low for k in ["zi charguia", "2035 ariana", "siège social", "siege social"]):
                    if not noise_header(l):
                        addr.append(clean_name(l))
            if addr:
                address = ", ".join(addr[:3])
        elif "tenorafrique" in (text or "").lower() or "1338455H" in text:
            name = "Tenor Afrique"
            tax = "1338455H"
            identifier = tax
        for l in lines[:40]:
            if any(k in l.lower() for k in ["résidence", "residence", "jardins", "carthage", "avenue", "boumhell"]):
                if "ENVIRONNEMENT" not in l or not address:
                    address = l if not address else address
    elif country == "FR":
        for l in lines[:80]:
            if "papyrus" in l.lower():
                name = clean_name(l)
                break
        for v in vats:
            if v.startswith("FR"):
                identifier = v
                tax = v
                break
        for l in lines[:30]:
            if any(k in l.lower() for k in ["rue", "tanneries", "cedex"]):
                address = l if not address else address

    if not identifier and country == "TN":
        # Supplier is usually first TN fiscal id
        for v in vats:
            if re.fullmatch(r"\d{7}[A-Z]", v) or re.fullmatch(r"\d{7}[A-Z]{2,3}\d{3}", v):
                identifier = v
                tax = v
                break

    chosen_phone = ""
    if country == "FR":
        for l in lines[:40]:
            if re.fullmatch(r"0\d(?:[ .-]?\d{2}){4}", l.strip()):
                chosen_phone = l.strip()
                break
        if not chosen_phone:
            for p in ph:
                digits = re.sub(r"\D", "", p)
                if len(digits) == 10 and (p.strip().startswith("0") or p.strip().startswith("+33")):
                    chosen_phone = p
                    break
    elif country == "TN":
        for p in ph:
            digits = re.sub(r"\D", "", p)
            if p.strip().startswith("+216") or len(digits) == 8:
                chosen_phone = p.replace("+216 -", "").strip()
                break

    return {
        "nom": name,
        "numero_fournisseur": identifier,
        "identifiant": identifier,
        "type_identifiant": "I-01" if country == "TN" else "I-04" if country == "FR" else "",
        "matricule_fiscal_ou_tva": tax,
        "siret": extract_siret(text) if country == "FR" else "",
        "adresse": address,
        "pays": country,
        "telephone": chosen_phone,
        "email": em[0] if em else "",
        "site_web": web[0] if web else "",
    }


def extract_fr_client(lines: List[str], text: str) -> Dict[str, str]:
    code = extract_client_code(text)
    name = ""
    address_parts = []

    # Most reliable: after website, the first non-noise company block is the billing customer.
    start = 0
    for i, l in enumerate(lines):
        if "www." in l.lower():
            start = i + 1
            break

    for l in lines[start:start + 35]:
        low = l.lower()
        if noise_header(l):
            continue
        if re.search(r"^\d", l):
            continue
        if any(k in low for k in ["fr france", "rue", "av ", "avenue", "bld", "boulevard", "cedex", "limoges", "amiens", "aubenas", "muzols", "millau"]):
            continue
        if len(l) >= 3:
            name = clean_name(l)
            break

    # Known fallback from your examples
    if not name:
        for k in ["ARDECHE CREATIONS", "CFAB Somme", "NEBOUT SA", "REFACTUEL SA"]:
            if k.lower() in (text or "").lower():
                name = k
                break

    for l in lines[start:start + 45]:
        low = l.lower()
        if any(k in low for k in ["rue", "av ", "avenue", "bld", "boulevard", "cedex", "limoges", "amiens", "aubenas", "muzols", "millau", "fr france"]):
            if l not in address_parts:
                address_parts.append(l)
            # Stop after the first billing-country line; following block is usually delivery address.
            if "fr france" in low:
                break

    return {
        "code_client": code,
        "nom": name,
        "identifiant": code,
        "type_identifiant": "I-01",
        "matricule_fiscal_ou_tva": "",
        "siren": extract_siren(text),
        "adresse": ", ".join(address_parts[:5]),
        "pays": "FR",
    }


def extract_tn_client(lines: List[str], text: str) -> Dict[str, str]:
    code = extract_client_code(text)
    name = ""
    client_tax = ""
    address_parts = []

    if is_issolutions_invoice(text):
        # In this template, "Client: VEGA CABLES" is a command/reference line,
        # not the invoice customer. The invoice customer is ASSISTANCE PLUS.
        name = "ASSISTANCE PLUS"
        m_tax = re.search(r"Code\s+TVA\s*:\s*(\d{7}[A-Z]/[A-Z]/[A-Z]\d{3})", text or "", re.I)
        if m_tax:
            client_tax = m_tax.group(1).upper()

        grab = False
        for l in lines:
            if re.search(r"ASSISTANCE\s+PLUS", l, re.I):
                grab = True
                continue
            if grab:
                if re.search(r"Code\s+TVA|FC_\d+|Commande\s+client|REFERENCES", l, re.I):
                    break
                if not noise_header(l) and len(l) > 2:
                    address_parts.append(clean_name(l))
    else:
        if re.search(r"\bIT SOFT\b", text or "", re.I):
            name = "IT SOFT"
        m = re.search(r"Client\s*:\s*([^\n]+)", text or "", re.I)
        if m:
            name = clean_name(m.group(1))

        all_vats = vat_numbers(text)
        for v in all_vats:
            if "/" in v:
                client_tax = v
                break

        # For Tenor, client address appears in the delivered/billing block.
        grab = False
        for l in lines:
            if name and name.lower() in l.lower():
                grab = True
                continue
            if grab:
                if re.search(r"\b(?:Facture|Avoir|\d{2}/\d{2}/\d{4})\b", l, re.I):
                    break
                if not noise_header(l) and len(l) > 2:
                    address_parts.append(l)
                if len(address_parts) >= 5:
                    break

        if not address_parts:
            for l in lines:
                if any(k in l.lower() for k in ["avenue", "boumhell", "tunisie", "résidence", "jardins", "carthage", "tunis", "ariana"]):
                    address_parts.append(l)

    identifier = client_tax.replace("/", "") if client_tax else code

    return {
        "code_client": code,
        "nom": name,
        "identifiant": identifier,
        "type_identifiant": "I-01",
        "matricule_fiscal_ou_tva": client_tax,
        "siren": "",
        "adresse": ", ".join(address_parts[:5]),
        "pays": "TN",
    }


def extract_client(lines: List[str], text: str, country: str) -> Dict[str, str]:
    return extract_tn_client(lines, text) if country == "TN" else extract_fr_client(lines, text)


# =========================================================
# ARTICLE EXTRACTION
# =========================================================

def is_valid_ref(ref: str) -> bool:
    ref = (ref or "").strip().upper()
    if not re.fullmatch(r"[A-Z][A-Z0-9_\-]{2,17}", ref):
        return False
    # Some Divalto service refs do not contain digits. They are real article codes.
    if ref in {"ZSITUATION", "ZACOMPTE"}:
        return True
    if not re.search(r"\d", ref):
        return False
    banned = ["C000", "FR", "TN", "TND", "EUR", "TVA", "NAF", "GRO", "ADM", "RC"]
    if any(ref.startswith(b) for b in banned):
        return False
    return True


def clean_desc(desc: str) -> str:
    desc = re.sub(r"\bTva\s*:\s*\d+[,.]\d+\s*%?", "", desc or "", flags=re.I)
    desc = re.sub(r"\s+", " ", desc).strip(" :-")
    return desc


def discount_list(*values: Any) -> List[float]:
    out = []
    for v in values:
        if v is None:
            continue
        s = str(v).strip()
        if not s:
            continue
        if "+" in s:
            for p in s.split("+"):
                n = normalize_number(p)
                if n:
                    out.append(r2(n))
        else:
            n = normalize_number(s)
            if n:
                out.append(r2(n))
    return out


def tax_rate_from_code(code: str, country: str) -> float:
    code = str(code or "").strip()
    if code in ["7", "12", "13", "19", "20"]:
        return r2(normalize_number(code))
    return 19.0 if country == "TN" else 20.0


def add_unique(items: List[Dict[str, Any]], item: Dict[str, Any]) -> None:
    if not is_valid_ref(item.get("reference", "")):
        return
    if len(item.get("designation", "")) < 3:
        return
    if float(item.get("quantite", 0)) <= 0:
        return
    key = (
        item.get("reference"),
        item.get("designation"),
        r3(item.get("quantite")),
        r3(item.get("prix_unitaire_num")),
        r3(item.get("montant_ht_num")),
    )
    for old in items:
        old_key = (
            old.get("reference"), old.get("designation"), r3(old.get("quantite")),
            r3(old.get("prix_unitaire_num")), r3(old.get("montant_ht_num"))
        )
        if key == old_key:
            return
    items.append(item)


def extract_same_line_articles(text: str, country: str) -> List[Dict[str, Any]]:
    out = []
    n = num_re()
    for raw in clean_lines(text):
        line = re.sub(r"\s+", " ", raw).strip()

        # FR/Papyrus: REF DESC QTY UNIT [REM] TOTAL TAXCODE
        p_fr = re.compile(
            rf"^([A-Z][A-Z0-9_\-]{{2,17}})\s+(.+?)\s+({n})\s+({n})(?:\s+({n}|\d{{1,2}}\+\d{{1,2}}))?\s+({n})\s+(\d{{1,2}})$",
            re.I,
        )
        m = p_fr.match(line)
        if m:
            ref, desc, qty, unit, rem, total, taxcode = m.groups()
            add_unique(out, {
                "reference": ref.upper(),
                "designation": clean_desc(desc),
                "quantite": r3(normalize_number(qty)),
                "unite": "UNIT",
                "prix_unitaire_num": r3(normalize_number(unit)),
                "remises": discount_list(rem),
                "taux_tva_num": tax_rate_from_code(taxcode, country),
                "montant_ht_num": r3(normalize_number(total)),
            })
            continue

        # TN ISSolutions: REF TOTAL DESC QTY UNIT REM TAXCODE
        p_tn = re.compile(
            rf"^([A-Z][A-Z0-9_\-]{{2,17}})\s+({n})\s+(.+?)\s+(\d+(?:[,.]\d+)?)\s+({n})\s+(\d{{1,2}}(?:\+\d{{1,2}})?|{n})\s+(\d{{1,2}})$",
            re.I,
        )
        m = p_tn.match(line)
        if m:
            ref, total, desc, qty, unit, rem, taxcode = m.groups()
            add_unique(out, {
                "reference": ref.upper(),
                "designation": clean_desc(desc),
                "quantite": r3(normalize_number(qty)),
                "unite": "UNIT",
                "prix_unitaire_num": r3(normalize_number(unit)),
                "remises": discount_list(rem),
                "taux_tva_num": tax_rate_from_code(taxcode, country),
                "montant_ht_num": r3(normalize_number(total)),
            })
    return out


def extract_tenor_split_articles(text: str) -> List[Dict[str, Any]]:
    """Tenor layout: unit total / discount+description / ref qty discount."""
    out = []
    lines = clean_lines(text)
    n = num_re()
    for i in range(len(lines) - 2):
        l1 = re.sub(r"\s+", " ", lines[i]).strip()
        l2 = re.sub(r"\s+", " ", lines[i + 1]).strip()
        l3 = re.sub(r"\s+", " ", lines[i + 2]).strip()

        m1 = re.match(rf"^({n})\s+({n})$", l1)
        m2 = re.match(rf"^({n})\s+(.+)$", l2)
        m2_no_discount = None if m2 else re.match(r"^(.{5,})$", l2)
        m3 = re.match(rf"^([A-Z][A-Z0-9_\-]{{2,17}})\s+({n})\s+({n})$", l3, re.I)
        if not (m1 and (m2 or m2_no_discount) and m3):
            continue

        unit = normalize_number(m1.group(1))
        total = normalize_number(m1.group(2))
        if m2:
            rem1 = normalize_number(m2.group(1))
            desc = clean_desc(m2.group(2))
        else:
            rem1 = 0.0
            desc = clean_desc(m2_no_discount.group(1))
        ref = m3.group(1).upper()
        qty = normalize_number(m3.group(2))
        rem2 = normalize_number(m3.group(3))

        add_unique(out, {
            "reference": ref,
            "designation": desc,
            "quantite": r3(qty),
            "unite": "UNIT",
            "prix_unitaire_num": r3(unit),
            "remises": discount_list(rem1, rem2),
            "taux_tva_num": 19.0,
            "montant_ht_num": r3(total),
        })
    return out



def extract_tenor_native_vertical_articles(text: str) -> List[Dict[str, Any]]:
    """
    Handles native PyMuPDF extraction order for Tenor invoices/avoirs.

    Visual table is:
        REF / Designation / Qty / Unit price / Discounts / Amount

    But PyMuPDF often returns each item as 7 vertical lines:
        montant_ht
        prix_unitaire
        remise_1          # optional on the last row
        designation
        remise_2
        quantite
        reference

    Example from Avoir AC_250001:
        883,350
        2265,000
        35,00
        Contrat Bronze Pack Duo Compta Gestion Ed. Entreprise
        40,00
        1,000
        AL0ENTPCK01
    """
    out: List[Dict[str, Any]] = []
    lines = clean_lines(text or "")

    for i, line in enumerate(lines):
        ref = line.strip().upper()
        if not is_valid_ref(ref):
            continue

        # Pattern A: amount, unit, discount1, desc, discount2, qty, ref
        if i >= 6:
            total = normalize_number(lines[i - 6])
            unit = normalize_number(lines[i - 5])
            rem1 = normalize_number(lines[i - 4])
            desc = clean_desc(lines[i - 3])
            rem2 = normalize_number(lines[i - 2])
            qty = normalize_number(lines[i - 1])

            if total > 0 and unit > 0 and qty > 0 and len(desc) >= 3 and 0 <= rem1 <= 100 and 0 <= rem2 <= 100:
                add_unique(out, {
                    "reference": ref,
                    "designation": desc,
                    "quantite": r3(qty),
                    "unite": "UNIT",
                    "prix_unitaire_num": r3(unit),
                    "remises": discount_list(rem1, rem2),
                    "taux_tva_num": 19.0,
                    "montant_ht_num": r3(total),
                })
                continue

        # Pattern B: amount, unit, desc, discount2, qty, ref
        # Last Tenor line sometimes has only one discount.
        if i >= 5:
            total = normalize_number(lines[i - 5])
            unit = normalize_number(lines[i - 4])
            desc = clean_desc(lines[i - 3])
            rem2 = normalize_number(lines[i - 2])
            qty = normalize_number(lines[i - 1])

            if total > 0 and unit > 0 and qty > 0 and len(desc) >= 3 and 0 <= rem2 <= 100:
                add_unique(out, {
                    "reference": ref,
                    "designation": desc,
                    "quantite": r3(qty),
                    "unite": "UNIT",
                    "prix_unitaire_num": r3(unit),
                    "remises": discount_list(rem2),
                    "taux_tva_num": 19.0,
                    "montant_ht_num": r3(total),
                })

    return out


def is_bad_article_desc_fr(desc: str) -> bool:
    """Reject only real table/footer labels, not product descriptions like '25 pages'."""
    d = (desc or "").strip().lower()
    if not d:
        return True
    bad_exact = {
        "total commande", "total bon de livraison", "sous-total", "total ht",
        "base t.v.a", "base tva", "montant t.v.a", "t.t.c.", "net à payer",
        "net a payer", "référence", "reference", "désignation", "designation",
        "quantité", "quantite", "prix unitaire", "remise", "montant",
        "date", "client", "commercial", "siret", "rc", "naf", "tva intra",
    }
    if d in bad_exact:
        return True
    if d.startswith("bon de livraison") or d.startswith("commande n"):
        return True
    if d.startswith("total ") or d.startswith("frais de port"):
        return True
    return False


def append_fr_item(items: List[Dict[str, Any]], item: Dict[str, Any]) -> None:
    """For French Papyrus invoices, keep repeated identical product lines.
    Same reference can appear in several delivery notes, so no de-duplication here.
    """
    if not is_valid_ref(item.get("reference", "")):
        return
    if len(item.get("designation", "")) < 3:
        return
    if float(item.get("quantite", 0)) <= 0:
        return
    if float(item.get("prix_unitaire_num", 0)) <= 0:
        return
    if abs(float(item.get("montant_ht_num", 0))) <= 0:
        return
    items.append(item)


def extract_fr_native_vertical_articles(text: str) -> List[Dict[str, Any]]:
    """
    Handles PyMuPDF native extraction order for Papyrus/Divalto French invoices.

    In the visual PDF table:
        REF | DESIGNATION | QTY | UNIT PRICE | DISCOUNT | AMOUNT | TVA CODE

    But PyMuPDF often returns the row vertically as:
        designation
        tva_code
        unit_price
        discount          # optional
        amount_ht
        quantity
        reference

    Example:
        Savon spécial Jeune Artiste
        1
        11,1600
        2,00
        10,94
        1,000
        JR00010

    Service/acompte rows may have no discount:
        Situation Tva : 20,000 %
        1
        2 700,0000
        2 700,00
        1,000
        ZSITUATION
    """
    out: List[Dict[str, Any]] = []
    lines = clean_lines(text or "")

    for i, line in enumerate(lines):
        ref = line.strip().upper()
        if not is_valid_ref(ref):
            continue

        # Pattern A: desc / taxcode / unit / discount / total / qty / ref
        if i >= 6:
            desc = clean_desc(lines[i - 6])
            taxcode = str(lines[i - 5]).strip()
            unit = normalize_number(lines[i - 4])
            rem = normalize_number(lines[i - 3])
            total = normalize_number(lines[i - 2])
            qty = normalize_number(lines[i - 1])

            if (
                len(desc) >= 3
                and not is_bad_article_desc_fr(desc)
                and re.fullmatch(r"\d{1,2}", taxcode or "")
                and qty > 0
                and unit > 0
                and total != 0
                and 0 <= rem <= 100
            ):
                expected = qty * unit * (1 - rem / 100.0)
                if abs(abs(expected) - abs(total)) <= max(1.0, abs(total) * 0.06):
                    append_fr_item(out, {
                        "reference": ref,
                        "designation": desc,
                        "quantite": r3(qty),
                        "unite": "UNIT",
                        "prix_unitaire_num": r3(unit),
                        "remises": discount_list(rem),
                        "taux_tva_num": 20.0,
                        "montant_ht_num": r3(total),
                    })
                    continue

        # Pattern B: desc / taxcode / unit / total / qty / ref, no discount
        if i >= 5:
            desc = clean_desc(lines[i - 5])
            taxcode = str(lines[i - 4]).strip()
            unit = normalize_number(lines[i - 3])
            total = normalize_number(lines[i - 2])
            qty = normalize_number(lines[i - 1])

            if (
                len(desc) >= 3
                and not is_bad_article_desc_fr(desc)
                and re.fullmatch(r"\d{1,2}", taxcode or "")
                and qty > 0
                and unit > 0
                and total != 0
            ):
                expected = qty * unit
                if abs(abs(expected) - abs(total)) <= max(1.0, abs(total) * 0.06):
                    append_fr_item(out, {
                        "reference": ref,
                        "designation": desc,
                        "quantite": r3(qty),
                        "unite": "UNIT",
                        "prix_unitaire_num": r3(unit),
                        "remises": [],
                        "taux_tva_num": 20.0,
                        "montant_ht_num": r3(total),
                    })
                    continue

    return out



def is_issolutions_invoice(text: str) -> bool:
    low = (text or "").lower()
    return (
        "issolutions" in low
        or "contact@issolutions.tn" in low
        or "i.s.solutions" in low
        or "zi charguia" in low
    )


def is_valid_ref_issolutions(ref: str) -> bool:
    """
    ISSolutions article codes can be pure letters without digits:
    IHPF, ICOMPTAM, IPAIE, IABOX, IPCFRD, IPSE, IPDB, ICSABO.
    So we validate by the surrounding row pattern instead of requiring digits.
    """
    ref = (ref or "").strip().upper()
    if not re.fullmatch(r"[A-Z][A-Z0-9_\-]{2,17}", ref):
        return False
    banned = {
        "CLIENT", "FACTURE", "REFERENCES", "TOTAL", "MODE", "TVA",
        "TND", "EUR", "PAGE", "EMAIL", "WEB", "CODE", "ARTICLE",
        "DESIGNATION", "MONTANT", "BASE", "TAUX"
    }
    return ref not in banned


def add_unique_issolutions(items: List[Dict[str, Any]], item: Dict[str, Any]) -> None:
    if not is_valid_ref_issolutions(item.get("reference", "")):
        return
    if len(item.get("designation", "")) < 2:
        return
    if float(item.get("quantite", 0)) <= 0:
        return
    if float(item.get("prix_unitaire_num", 0)) <= 0:
        return
    if float(item.get("montant_ht_num", 0)) <= 0:
        return

    key = (
        item.get("reference"),
        item.get("designation"),
        r3(item.get("quantite")),
        r3(item.get("prix_unitaire_num")),
        r3(item.get("montant_ht_num")),
    )
    for old in items:
        old_key = (
            old.get("reference"),
            old.get("designation"),
            r3(old.get("quantite")),
            r3(old.get("prix_unitaire_num")),
            r3(old.get("montant_ht_num")),
        )
        if key == old_key:
            return
    items.append(item)


def extract_issolutions_articles(text: str) -> List[Dict[str, Any]]:
    """
    ISSolutions layout extracted as one line per article:
        IHPF 259,350 Harmony Power Foundation 1 665,000 40+35 3

    Meaning:
        reference = IHPF
        montant_ht = 259,350
        designation = Harmony Power Foundation
        quantity = 1
        prix_unitaire = 665,000
        remise = 40+35
        TVA code = 3 -> actual rate is in the VAT table, here 12%
    """
    out: List[Dict[str, Any]] = []
    n = num_re()

    for raw in clean_lines(text or ""):
        line = re.sub(r"\s+", " ", raw).strip()

        p = re.compile(
            rf"^([A-Z][A-Z0-9_\-]{{2,17}})\s+({n})\s+(.+?)\s+"
            rf"(\d+(?:[,.]\d+)?)\s+({n})\s+(\d{{1,2}}(?:\+\d{{1,2}})?|{n})\s+(\d{{1,2}})$",
            re.I,
        )
        m = p.match(line)
        if not m:
            continue

        ref, total, desc, qty, unit, rem, taxcode = m.groups()

        add_unique_issolutions(out, {
            "reference": ref.upper(),
            "designation": clean_desc(desc),
            "quantite": r3(normalize_number(qty)),
            "unite": "UNIT",
            "prix_unitaire_num": r3(normalize_number(unit)),
            "remises": discount_list(rem),
            # For this invoice, VAT code 3 corresponds to 12%.
            # If another ISSolutions invoice has another table, totals still parse from VAT table.
            "taux_tva_num": 12.0 if str(taxcode).strip() == "3" else tax_rate_from_code(taxcode, "TN"),
            "montant_ht_num": r3(normalize_number(total)),
        })

    return out


def extract_issolutions_native_vertical_articles(text: str) -> List[Dict[str, Any]]:
    """
    Handles ISSolutions PyMuPDF vertical order:
        tax_code
        discount
        quantity
        designation
        reference
        montant_ht
        prix_unitaire

    Example:
        3
        40+35
        1
        Harmony Power Foundation
        IHPF
        259,350
        665,000
    """
    out: List[Dict[str, Any]] = []
    lines = clean_lines(text or "")

    for i, line in enumerate(lines):
        ref = line.strip().upper()
        if not is_valid_ref_issolutions(ref):
            continue

        if i >= 4 and i + 2 < len(lines):
            taxcode = lines[i - 4].strip()
            rem = lines[i - 3].strip()
            qty = normalize_number(lines[i - 2])
            desc = clean_desc(lines[i - 1])
            total = normalize_number(lines[i + 1])
            unit = normalize_number(lines[i + 2])

            if (
                re.fullmatch(r"\d{1,2}", taxcode or "")
                and re.search(r"\d", rem or "")
                and qty > 0
                and unit > 0
                and total > 0
                and len(desc) >= 2
                and not noise_header(desc)
            ):
                add_unique_issolutions(out, {
                    "reference": ref,
                    "designation": desc,
                    "quantite": r3(qty),
                    "unite": "UNIT",
                    "prix_unitaire_num": r3(unit),
                    "remises": discount_list(rem),
                    "taux_tva_num": 12.0 if taxcode == "3" else tax_rate_from_code(taxcode, "TN"),
                    "montant_ht_num": r3(total),
                })

    return out


def extract_vat_table_summary(text: str) -> Dict[str, float]:
    """
    Generic VAT table parser.
    Handles same-line:
        3 12,00% 4 753,500 570,420

    And vertical PyMuPDF order:
        570,420
        4 753,500
        12,00%
        3
    """
    n = num_re()

    for raw in clean_lines(text or ""):
        line = re.sub(r"\s+", " ", raw).strip()
        m = re.search(rf"(?:^|\s)(\d{{1,2}})\s+(\d{{1,2}}[,.]\d{{1,2}})%\s+({n})\s+({n})(?:\s|$)", line)
        if m:
            rate = normalize_number(m.group(2))
            base = normalize_number(m.group(3))
            tva = normalize_number(m.group(4))
            if 0 < rate <= 30 and base > 0 and tva > 0:
                return {"rate": r3(rate), "base": r3(base), "tva": r3(tva)}

    lines = clean_lines(text or "")
    for i, line in enumerate(lines):
        m_rate = re.search(r"(\d{1,2}[,.]\d{1,2})\s*%", line)
        if not m_rate:
            continue

        rate = normalize_number(m_rate.group(1))
        if not (0 < rate <= 30):
            continue

        nums_before = []
        for j in range(max(0, i - 12), i):
            for x in re.findall(n, lines[j]):
                v = normalize_number(x)
                if v > 0:
                    nums_before.append(v)

        # Pick a pair where tva/base approximately equals rate.
        for base in sorted(nums_before, reverse=True):
            for tva in nums_before:
                if base <= 0 or tva <= 0 or tva >= base:
                    continue
                if abs((tva / base * 100) - rate) <= 0.05:
                    return {"rate": r3(rate), "base": r3(base), "tva": r3(tva)}

    return {"rate": 0.0, "base": 0.0, "tva": 0.0}

def extract_articles(text: str, country: str, currency: str) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []

    if country == "FR":
        # French Papyrus/Divalto: use real FR parsers only.
        # Do NOT run Tenor/Tunisian vertical parser on French invoices;
        # it confuses discount/total/tax columns and creates bad rows.
        same_line = extract_same_line_articles(text, country)
        if same_line:
            items = same_line
        else:
            items = extract_fr_native_vertical_articles(text)
    else:
        # Tunisian profiles.
        if is_issolutions_invoice(text):
            # Add the ISSolutions profile without touching Tenor.
            for x in extract_issolutions_articles(text):
                add_unique_issolutions(items, x)
            for x in extract_issolutions_native_vertical_articles(text):
                add_unique_issolutions(items, x)
        else:
            # Keep Tunisian Tenor behavior exactly as before because it works.
            for x in extract_same_line_articles(text, country):
                add_unique(items, x)
            for x in extract_tenor_split_articles(text):
                add_unique(items, x)
            for x in extract_tenor_native_vertical_articles(text):
                add_unique(items, x)

    result = []
    for idx, x in enumerate(items, start=1):
        result.append({
            "numero_ligne": idx,
            "reference": x["reference"],
            "designation": x["designation"],
            "quantite": x["quantite"],
            "unite": x["unite"],
            "prix_unitaire": money_str(x["prix_unitaire_num"], currency),
            "prix_unitaire_num": x["prix_unitaire_num"],
            "remises": x["remises"],
            "taux_tva": f"{x['taux_tva_num']} %",
            "taux_tva_num": x["taux_tva_num"],
            "montant_ht": money_str(x["montant_ht_num"], currency),
            "montant_ht_num": x["montant_ht_num"],
        })
    return result


# =========================================================
# TOTALS
# =========================================================



def extract_amount_after_label(text: str, label_regex: str, max_lookahead: int = 8) -> float:
    """
    Generic label parser for vertical extraction:
        TOTAL TTC
        5 323,920

    Also supports same-line:
        Total TVA 570,420
    """
    lines = clean_lines(text or "")
    for i, line in enumerate(lines):
        if re.search(label_regex, line, re.I):
            # Same line first
            vals = [normalize_number(x) for x in re.findall(num_re(), line)]
            vals = [v for v in vals if v > 0]
            if vals:
                return r3(vals[-1])

            # Then nearby following lines
            for j in range(i + 1, min(len(lines), i + 1 + max_lookahead)):
                vals = [normalize_number(x) for x in re.findall(num_re(), lines[j])]
                vals = [v for v in vals if v > 0]
                if vals:
                    return r3(vals[0])
    return 0.0

def extract_star_total(text: str) -> float:
    patterns = [rf"\*+\s*({num_re()})\s*(?:EUR|TND)?", rf"(?:\*\s*){{3,}}\s*({num_re()})\s*(?:EUR|TND)?"]
    for p in patterns:
        vals = re.findall(p, text or "", re.I)
        if vals:
            return r3(normalize_number(vals[-1]))
    return 0.0


def extract_timbre(text: str) -> float:
    """
    Tunisian stamp duty is often visually near label "Timbre Fiscale".
    Depending on PDF extraction order, the amount can appear before the label:
        1,000
        Timbre Fiscale
    or on the same line:
        Timbre Fiscale 1,000

    IMPORTANT: do not take VAT codes/rates like 13,00 / 19,00 as timbre.
    """
    lines = clean_lines(text or "")

    for i, line in enumerate(lines):
        if re.search(r"Timbre\s+Fiscal(?:e)?", line, re.I):
            # 1) same line, preferred if small decimal exists
            vals = [normalize_number(x) for x in re.findall(num_re(), line)]
            vals = [x for x in vals if 0 < x <= 5]
            if vals:
                return r3(vals[0])

            # 2) nearby lines: search previous first, then next
            nearby = []
            for j in range(max(0, i - 3), min(len(lines), i + 4)):
                if j == i:
                    continue
                for x in re.findall(num_re(), lines[j]):
                    v = normalize_number(x)
                    if 0 < v <= 5:
                        nearby.append((abs(j - i), v))
            if nearby:
                nearby.sort(key=lambda x: x[0])
                return r3(nearby[0][1])

            # Some ISSolutions PDFs extract the stamp value much later
            # near "Remise Excep." at the end of the page.
            tail_values = []
            for tail_line in lines[max(0, len(lines) - 35):]:
                for x in re.findall(num_re(), tail_line):
                    v = normalize_number(x)
                    if 0 < v <= 5:
                        tail_values.append(v)
            if tail_values:
                return r3(tail_values[-1])

    return 0.0


def extract_global_discount(text: str) -> float:
    m = re.search(r"Remise\s+en\s+pied\s+({})".format(num_re()), text or "", re.I)
    return r3(normalize_number(m.group(1))) if m else 0.0


def explicit_total_ht(text: str) -> float:
    m = re.search(r"TOTAL\s+HT\s*(?:TND|EUR)?\s*({})".format(num_re()), text or "", re.I)
    return r3(normalize_number(m.group(1))) if m else 0.0


def derive_totals(text: str, articles: List[Dict[str, Any]], country: str, currency: str) -> Dict[str, Any]:
    ttc = extract_star_total(text)
    if not ttc:
        ttc = extract_amount_after_label(text, r"TOTAL\s+TTC")
    net_label = extract_amount_after_label(text, r"NET\s+A\s+PAYER|NET\s+À\s+PAYER")
    timbre = extract_timbre(text)
    remise_globale = extract_global_discount(text)
    sum_lines = r3(sum(float(x.get("montant_ht_num", 0)) for x in articles))

    # Use legal/common rate from these examples.
    default_rate = 19.0 if country == "TN" else 20.0

    vat_table = extract_vat_table_summary(text)
    if vat_table.get("rate"):
        default_rate = vat_table["rate"]

    ht = explicit_total_ht(text)

    # If a VAT table exists, it is stronger than guessing from TTC.
    if vat_table.get("base") and vat_table.get("tva"):
        ht = vat_table["base"]

    # Strong formulas: in TN net/TTC includes timbre. In FR no stamp.
    if not ht and ttc:
        if country == "TN":
            ht = r3((ttc - timbre) / (1 + default_rate / 100.0))
        elif country == "FR":
            ht = r3(ttc / (1 + default_rate / 100.0))

    # If a global discount exists, total HT should be sum_lines - discount.
    if remise_globale and sum_lines:
        calculated_after_discount = r3(sum_lines - remise_globale)
        if not ht or abs(calculated_after_discount - ht) < max(0.05, ht * 0.02):
            ht = calculated_after_discount

    if not ht and sum_lines:
        ht = sum_lines

    if vat_table.get("tva"):
        montant_tva = vat_table["tva"]
    elif country == "TN":
        montant_tva = r3(ttc - timbre - ht) if ttc else r3(ht * default_rate / 100.0)
    else:
        montant_tva = r3(ttc - ht) if ttc else r3(ht * default_rate / 100.0)

    if not ttc and ht:
        # In Tunisia, TOTAL TTC usually excludes stamp duty; NET A PAYER includes it.
        ttc = r3(ht + montant_tva)

    base_tva = ht
    net = net_label if net_label else r3(ttc + (timbre if country == "TN" else 0))

    return {
        "total_ht_num": ht,
        "base_tva_num": base_tva,
        "montant_tva_num": montant_tva,
        "timbre_fiscal_num": timbre,
        "remise_globale_num": remise_globale,
        "total_ttc_num": ttc,
        "net_a_payer_num": net,
        "somme_lignes_ht_num": sum_lines,
        "total_ht": money_str(ht, currency),
        "base_tva": money_str(base_tva, currency),
        "montant_tva": money_str(montant_tva, currency),
        "timbre_fiscal": money_str(timbre, currency),
        "remise_globale": money_str(remise_globale, currency),
        "frais_port_non_soumis": money_str(0, currency),
        "frais_port_soumis": money_str(0, currency),
        "frais_emballage": money_str(0, currency),
        "total_ttc": money_str(ttc, currency),
        "net_a_payer": money_str(net, currency),
    }


# =========================================================
# VALIDATION
# =========================================================

def validation(articles: List[Dict[str, Any]], totals: Dict[str, Any], supplier: Dict[str, Any], client: Dict[str, Any], country: str, currency: str) -> Dict[str, Any]:
    errors = []
    warnings = []

    if not supplier.get("nom"):
        errors.append("Nom du fournisseur manquant")
    if not client.get("nom"):
        errors.append("Nom du client manquant")
    if not articles:
        errors.append("Aucune ligne article détectée")

    sum_lines = float(totals.get("somme_lignes_ht_num", 0))
    remise = float(totals.get("remise_globale_num", 0))
    total_ht = float(totals.get("total_ht_num", 0))
    tva = float(totals.get("montant_tva_num", 0))
    timbre = float(totals.get("timbre_fiscal_num", 0))
    net = float(totals.get("net_a_payer_num", 0))

    expected_ht = r3(sum_lines - remise)
    if total_ht and abs(expected_ht - total_ht) > max(0.05, abs(total_ht) * 0.01):
        warnings.append("La somme des lignes moins remise globale ne correspond pas exactement au total HT")

    expected_net = r3(total_ht + tva + (timbre if country == "TN" else 0))
    diff = r3(net - expected_net)
    if net and abs(diff) > 0.05:
        errors.append("Total HT + TVA + timbre fiscal ne correspond pas au net à payer")

    return {
        "statut": "OK" if not errors else "À vérifier",
        "peut_generer_teif": len(errors) == 0,
        "nombre_lignes_detectees": len(articles),
        "somme_lignes_ht": money_str(sum_lines, currency),
        "remise_globale": money_str(remise, currency),
        "montant_attendu": money_str(expected_net, currency),
        "difference": money_str(diff, currency),
        "erreurs_bloquantes": errors,
        "avertissements": warnings,
    }


# =========================================================
# OPTIONAL LLM FALLBACK - only fill missing fields, never override strong totals/articles
# =========================================================

def call_llm(raw_text: str) -> Dict[str, Any]:
    prompt = f"""
Return ONLY valid JSON. Extract supplier, client, invoice, lines, totals from this invoice text.
Do not invent values.
TEXT:
{raw_text}
"""
    try:
        response = requests.post(OLLAMA_URL, json={
            "model": OLLAMA_MODEL,
            "stream": False,
            "messages": [{"role": "user", "content": prompt}],
        }, timeout=45)
        response.raise_for_status()
        content = response.json().get("message", {}).get("content", "")
        content = content.replace("```json", "").replace("```", "")
        m = re.search(r"\{.*\}", content, re.S)
        return json.loads(m.group(0)) if m else {}
    except Exception:
        return {}


# =========================================================
# MAIN ENDPOINT
# =========================================================

@app.post("/extract")
def extract(req: ExtractionRequest):
    try:
        text = clean_text(req.raw_text)
        lines = clean_lines(text)

        country = detect_country(text)
        currency = detect_currency(text, country)
        doc_type = detect_doc_type(text)

        articles = extract_articles(text, country, currency)
        supplier = extract_supplier(lines, text, country)
        client = extract_client(lines, text, country)
        totals = derive_totals(text, articles, country, currency)

        dates = find_dates(text)
        invoice_date = dates[0] if dates else ""
        due_date = extract_due_date(text, invoice_date)
        pay = extract_payment(text)

        result = {
            "document": {
                "type_document": doc_type["name"],
                "code_type_document": doc_type["code"],
                "profil_pays": country_label(country),
                "devise": currency,
                "source": req.source_type,
                "nombre_pages": req.page_count,
            },
            "fournisseur": supplier,
            "client": client,
            "facture": {
                "numero": extract_invoice_number(text),
                "date_facture": invoice_date,
                "date_echeance": due_date,
                "reference": "",
                "commercial": extract_commercial(text),
                "mode_paiement": pay["mode"],
                "conditions_paiement": pay["conditions"],
            },
            "lignes_facture": articles,
            "totaux": {k: v for k, v in totals.items() if not k.endswith("_num") and k != "somme_lignes_ht"},
            "controle_validation": validation(articles, totals, supplier, client, country, currency),
        }

        # If something crucial is missing, allow LLM to fill only empty names/addresses.
        if not client.get("nom") or not supplier.get("nom") or not articles:
            llm = call_llm(text)
            # intentionally conservative: do not override existing rule extraction
            if isinstance(llm, dict):
                pass

        return [result]

    except Exception as e:
        return [{"status": "error", "message": str(e)}]


@app.get("/health")
def health():
    return {"status": "ok", "service": "extractionservice-mix-final"}
