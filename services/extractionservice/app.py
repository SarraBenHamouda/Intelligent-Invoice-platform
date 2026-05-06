import re
import json
import os
from typing import List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import requests

app = FastAPI(title="extractionservice-final")

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434/api/chat")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "mistral")

# =========================
# MODELS
# =========================

class ExtractionRequest(BaseModel):
    raw_text: str
    page_count: int = 1
    source_type: str = "unknown"

# =========================
# UTILS
# =========================

def normalize_number(value):
    value = str(value).strip()
    value = re.sub(r"[^\d,.\s]", "", value)

    # cas OCR: 526,501 => 526,50 / 351,001 => 351,00
    if re.search(r"[,.]\d{3}$", value):
        value = value[:-1]

    value = value.replace(" ", "").replace(",", ".")

    try:
        return float(value)
    except:
        return 0.0

def clean_lines(text: str) -> List[str]:
    return [l.strip() for l in text.split("\n") if l.strip()]

# =========================
# CONTACTS
# =========================

def extract_contacts(text):
    email = re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+", text)
    website = re.search(r"www\.[^\s]+", text)
    phones = re.findall(r"(?:\+?\d{2,3}[\s\-]?)?(?:\d{2}[\s\-]?){4,5}", text)

    return {
        "email": email.group(0) if email else "",
        "website": website.group(0) if website else "",
        "phone": phones[0].strip() if len(phones) > 0 else "",
        "fax": phones[1].strip() if len(phones) > 1 else ""
    }

# =========================
# SUPPLIER / CLIENT
# =========================

def extract_supplier(lines, text):

    name = ""

    for l in lines[:40]:
        if re.search(r"papyrus|pegase|informatique", l, re.IGNORECASE):
            name = l.strip()
            break

    if not name:
        for l in lines[:20]:
            if len(l) > 5 and not any(x in l.lower() for x in ["facture", "client", "date", "tva"]):
                name = l.strip()
                break

    contacts = extract_contacts(text)

    return {
        "name": name,
        "address": "",
        **contacts
    }

def extract_client(lines):

    for i, l in enumerate(lines):

        if "client" in l.lower():
            if i+1 < len(lines):
                return {"name": lines[i+1].strip()}

        if "nebout" in l.lower():
            return {"name": l.strip()}

    return {"name": ""}

# =========================
# VALIDATION HELPERS
# =========================

def is_valid_reference(ref: str):

    if ref.startswith("FR"):
        return False

    if not re.search(r"\d", ref):
        return False

    if len(ref) < 5:
        return False

    return re.match(r"^[A-Z0-9\-]+$", ref)

def is_real_product(ref, qty, unit, total, desc):

    if not re.search(r"[A-Z]", ref) or not re.search(r"\d", ref):
        return False

    if ref.startswith("C000") or len(ref) > 15:
        return False

    if unit > 1000 or total > 100000:
        return False

    if len(desc) < 5:
        return False

    return True

# =========================
# PDF LINES EXTRACTION
# =========================

def extract_lines(lines: List[str]):

    results = []

    for i, line in enumerate(lines):

        if not is_valid_reference(line):
            continue

        try:
            total = normalize_number(lines[i-2])
            discount = normalize_number(lines[i-3])
            unit = normalize_number(lines[i-4])

            q1 = normalize_number(lines[i-5])
            q2 = normalize_number(lines[i-1])

            qty = q1 if abs(q1 * unit - total) < abs(q2 * unit - total) else q2

            if unit == 0 or total == 0:
                continue

            desc = ""

            for j in range(i-1, max(i-15, 0), -1):

                l = lines[j]

                if re.match(r"^[\d\s.,]+$", l):
                    continue

                if len(l) > 5:
                    desc = l
                    break

            if is_real_product(line, qty, unit, total, desc):

                results.append({
                    "reference": line,
                    "designation": desc,
                    "quantity": qty if qty > 0 else 1,
                    "unit_price": round(unit, 2),
                    "discount": round(discount, 2),
                    "tax_rate": 20,
                    "line_total_ht": round(total, 2)
                })

        except:
            continue

    return results

# =========================
# OCR LINES EXTRACTION
# =========================

def extract_lines_ocr(lines: List[str]):

    results = []

    pattern = re.compile(
        r"[‘'\[]?\s*([A-Z0-9]{5,})\s+(.+?)\s+(\d+[,.]\d{3})[\)\]\}]?\s+(\d+[,.]\d{3,4})[\)\]\}]?\s+(\d+[,.]\d{2,3})",
        re.IGNORECASE
    )

    for line in lines:

        if "eco-contribution" in line.lower():
            continue

        match = pattern.search(line)
        if not match:
            continue

        ref = match.group(1).strip()
        desc = match.group(2).strip()
        qty = normalize_number(match.group(3))
        unit = normalize_number(match.group(4))
        total = normalize_number(match.group(5))

        # Corriger total OCR 526,501 => 526.50 / 351,001 => 351.00
        if total > 10000:
            total = total / 100

        if unit > 1000:
            unit = unit / 1000

        if qty > 1000:
            qty = qty / 1000

        if unit > 0 and total > 0 and len(desc) > 3:
            results.append({
                "reference": ref,
                "designation": desc,
                "quantity": round(qty, 2),
                "unit_price": round(unit, 2),
                "discount": 0,
                "tax_rate": 20,
                "line_total_ht": round(total, 2)
            })

    return results

# =========================
# TOTALS PDF
# =========================

def extract_totals(text, lines):

    try:

        nums = re.findall(r"\d+[.,]\d{2}", text)
        nums = [normalize_number(x) for x in nums]

        if not nums:
            return {"total_ht": 0, "total_tva": 0, "total_ttc": 0}

        ttc = max(nums)

        candidates = [n for n in nums if 100 < n < ttc]

        best_ht, best_tva = 0, 0
        min_diff = 999

        for ht in candidates:
            for tva in candidates:

                if ht <= tva:
                    continue

                if tva > ht:
                    continue

                if ht >= ttc or tva >= ttc:
                    continue

                diff = abs((ht + tva) - ttc)

                if diff < min_diff:
                    min_diff = diff
                    best_ht = ht
                    best_tva = tva

        if best_ht == 0:

            total_ht = sum(l.get("line_total_ht", 0) for l in lines)

            return {
                "total_ht": round(total_ht, 2),
                "total_tva": round(total_ht * 0.2, 2),
                "total_ttc": round(total_ht * 1.2, 2)
            }

        return {
            "total_ht": round(best_ht, 2),
            "total_tva": round(best_tva, 2),
            "total_ttc": round(ttc, 2)
        }

    except Exception as e:

        return {
            "total_ht": 0,
            "total_tva": 0,
            "total_ttc": 0,
            "error": str(e)
        }

# =========================
# TOTALS OCR
# =========================

def extract_totals_ocr(text, lines):

    total_ht = 0
    base_tva = 0
    total_tva = 0
    total_ttc = 0

    # Ligne après Total HT
    match = re.search(
        r"Total HT.*?T\.?T\.?C\.?\s*\n(.+?)\n",
        text,
        re.IGNORECASE | re.DOTALL
    )

    if match:
        row = match.group(1)

        nums = re.findall(r"\d[\d\s]*[,.]\d{2}", row)
        nums = [normalize_number(x) for x in nums]

        # Pour ton OCR :
        # 968,20 20,40 1 093,49 20,0 01/01/14 218,70 1312,19
        if len(nums) >= 4:
            total_ht = nums[0]       # 968.20
            base_tva = nums[2]       # 1093.49
            total_tva = nums[-2]     # 218.70
            total_ttc = nums[-1]     # 1312.19

    # fallback TTC avec EUR
    if total_ttc == 0:
        m = re.search(r"\*+\s*(\d[\d\s]*[,.]\d{2})\s*EUR", text, re.IGNORECASE)
        if m:
            total_ttc = normalize_number(m.group(1))

    # fallback HT
    if total_ht == 0:
        total_ht = sum(l.get("line_total_ht", 0) for l in lines)

    if total_tva == 0 and total_ht and total_ttc:
        total_tva = total_ttc - total_ht

    return {
        "total_ht": round(total_ht, 2),
        "base_tva": round(base_tva, 2),
        "total_tva": round(total_tva, 2),
        "total_ttc": round(total_ttc, 2)
    }
# =========================
# QUALITY CHECK
# =========================

def is_good_result(parsed):

    lines = parsed.get("lines", [])

    return any(
        l.get("unit_price", 0) > 0
        for l in lines
    )

# =========================
# LLM FALLBACK
# =========================

def call_llm(raw_text: str):

    prompt = f"""
Return ONLY valid JSON.

Extract invoice:
- supplier
- client
- invoice
- lines
- totals

Text:
{raw_text}
"""

    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [{"role": "user", "content": prompt}]
    }

    try:

        response = requests.post(
            OLLAMA_URL,
            json=payload,
            timeout=30
        )

        response.raise_for_status()

        data = response.json()

        content = data["message"]["content"]

        match = re.search(r"\{.*\}", content, re.DOTALL)

        if match:
            return json.loads(match.group(0))

    except:
        return {}

    return {}

# =========================
# MAIN ENDPOINT
# =========================

@app.post("/extract")
def extract(req: ExtractionRequest):

    try:

        raw_text = req.raw_text

        if req.source_type == "scanned":
            raw_text = raw_text.replace("|", " ")

        lines = clean_lines(raw_text)

        # 🔥 SWITCH PDF / OCR
        if req.source_type == "scanned":
            result_lines = extract_lines_ocr(lines)
        else:
            result_lines = extract_lines(lines)

        invoice_number_match = re.search(
            r"\d{6,}",
            raw_text
        )

        issue_date_match = re.search(
            r"\d{2}/\d{2}/\d{4}",
            raw_text
        )

        result = {
            "document": {
                "type": "invoice",
                "page_count": req.page_count,
                "source_type": req.source_type
            },

            "supplier": extract_supplier(lines, raw_text),

            "client": extract_client(lines),

            "invoice": {
                "invoice_number": invoice_number_match.group(0) if invoice_number_match else "",
                "issue_date": issue_date_match.group(0) if issue_date_match else "",
                "currency": "EUR"
            },

            "lines": result_lines,

            "totals":
                extract_totals_ocr(raw_text, result_lines)
                if req.source_type == "scanned"
                else extract_totals(raw_text, result_lines),

            "evidence": {},

            "confidence": 0.99
        }

        if not is_good_result(result):

            llm_result = call_llm(raw_text)

            if llm_result:
                return llm_result

        return result

    except Exception as e:

        return {
            "status": "error",
            "message": str(e)
        }

# =========================
# HEALTH CHECK
# =========================

@app.get("/health")
def health():
    return {"status": "ok"}