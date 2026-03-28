
import re
import json
import os
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import requests

app = FastAPI(title="extractionservice-hybrid-v6")

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
    value = str(value).replace(" ", "").replace(",", ".")
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
        "phone": phones[0] if len(phones) > 0 else "",
        "fax": phones[1] if len(phones) > 1 else ""
    }

# =========================
# SUPPLIER / CLIENT
# =========================

def extract_supplier(lines, text):

    name = ""
    address_lines = []

    for i, l in enumerate(lines[:20]):
        if any(x in l.lower() for x in ["informatique", "papyrus", "pegase"]):
            name = l.strip()

            for j in range(i+1, min(i+6, len(lines))):
                if re.search(r"\d", lines[j]) or "rue" in lines[j].lower():
                    address_lines.append(lines[j])
                else:
                    break
            break

    contacts = extract_contacts(text)

    return {
        "name": name,
        "address": ", ".join(address_lines),
        **contacts
    }

def extract_client(lines):

    for i, l in enumerate(lines):
        if "client" in l.lower():
            if i+1 < len(lines):
                return {"name": lines[i+1].strip()}

        if "nebout" in l.lower() or "sotrade" in l.lower():
            return {"name": l.strip()}

    return {}

# =========================
# VALIDATION
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

    if ref.startswith("C000") or len(ref) > 12:
        return False

    if unit > 1000 or total > 100000:
        return False

    if len(desc) < 5:
        return False

    return True

# =========================
# LINES EXTRACTION
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

            # DESCRIPTION
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
# TOTALS
# =========================

def extract_totals(text):

    nums = re.findall(r"\d+[.,]\d{2}", text)
    nums = [normalize_number(x) for x in nums]

    if not nums:
        return {}

    ttc = max(nums)

    for ht in nums:
        for tva in nums:
            if abs((ht + tva) - ttc) < 0.05:
                return {
                    "total_ht": round(ht, 2),
                    "total_tva": round(tva, 2),
                    "total_ttc": round(ttc, 2)
                }

    return {
        "total_ht": 0,
        "total_tva": 0,
        "total_ttc": round(ttc, 2)
    }

# =========================
# QUALITY CHECK
# =========================

def is_good_result(parsed):

    lines = parsed.get("lines", [])

    valid_lines = [
        l for l in lines
        if l.get("unit_price", 0) > 0 and l.get("line_total_ht", 0) > 0
    ]

    return len(valid_lines) >= 1

# =========================
# LLM FALLBACK
# =========================

def call_llm(raw_text: str):

    prompt = f"""
Return ONLY valid JSON.

Extract invoice:
- supplier (name, email, phone)
- client
- invoice info
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
        response = requests.post(OLLAMA_URL, json=payload, timeout=300)
        response.raise_for_status()
        data = response.json()

        content = data["message"]["content"]

        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            return json.loads(match.group(0))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {}

# =========================
# MAIN
# =========================

@app.post("/extract")
def extract(req: ExtractionRequest):

    lines = clean_lines(req.raw_text)

    result = {
        "document": {
            "type": "invoice",
            "page_count": req.page_count,
            "source_type": req.source_type
        },
        "supplier": extract_supplier(lines, req.raw_text),
        "client": extract_client(lines),
        "invoice": {
            "invoice_number": re.search(r"\d{2}/\d{2}/\d{4}\s+\w+", req.raw_text).group(0)
            if re.search(r"\d{2}/\d{2}/\d{4}\s+\w+", req.raw_text) else "",
            "issue_date": re.search(r"\d{2}/\d{2}/\d{4}", req.raw_text).group(0)
            if re.search(r"\d{2}/\d{2}/\d{4}", req.raw_text) else "",
            "currency": "EUR"
        },
        "lines": extract_lines(lines),
        "totals": extract_totals(req.raw_text),
        "evidence": {},
        "confidence": 0.99
    }

    # fallback if bad extraction
    if not is_good_result(result):
        llm_result = call_llm(req.raw_text)
        if llm_result:
            return llm_result

    return result