import json
import os
import re
from typing import Any, Dict, List

import requests
from fastapi import FastAPI
from pydantic import BaseModel

# =========================
# CONFIG
# =========================

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434/api/chat")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "mistral")

app = FastAPI(title="extractionservice-v4-fixed")


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
    if value in ("", None):
        return 0.0

    if isinstance(value, (int, float)):
        return float(value)

    value = str(value).replace(" ", "").replace(",", ".")
    try:
        return float(value)
    except:
        return 0.0


def preprocess_text(raw_text: str) -> List[str]:
    return [re.sub(r"\s+", " ", l.strip()) for l in raw_text.split("\n") if len(l.strip()) > 2]


# =========================
# METADATA
# =========================

def extract_supplier(lines):
    for l in lines:
        if "papyrus" in l.lower():
            return l.strip()
    return ""


def extract_client(lines):
    for l in lines:
        if "nebout" in l.lower() and "désignation" not in l.lower():
            return {"name": l.strip()}
    return {}


def extract_invoice_number(text):
    m = re.search(r"\d{2}/\d{2}/\d{4}\s+(\d+)", text)
    return m.group(1) if m else ""


def extract_date(text):
    m = re.search(r"\d{2}/\d{2}/\d{4}", text)
    return m.group(0) if m else ""


# =========================
# LINES (FIXED + FILTERED)
# =========================

def extract_lines(lines: List[str]):

    results = []
    i = 0

    while i < len(lines):

        line = lines[i]

        # ❌ IGNORE BRUIT
        if any(x in line.lower() for x in [
            "papyrus", "code", "tva", "total",
            "montant", "frais", "indemnité",
            "livraison", "facture", "eco"
        ]):
            i += 1
            continue

        # ✅ DETECT PRODUCT
        if len(line) > 10 and not re.search(r"\d+[.,]\d+", line):

            if i + 4 < len(lines):

                try:
                    qty = normalize_number(lines[i + 1])
                    unit = normalize_number(lines[i + 2])
                    discount = normalize_number(lines[i + 3])
                    total = normalize_number(lines[i + 4])

                    # ❌ INVALID DATA FILTER
                    if qty <= 0 or unit <= 0 or total <= 0:
                        i += 1
                        continue

                    if unit > 1000 or total > 10000:
                        i += 1
                        continue

                    # FIND REFERENCE
                    ref = ""
                    for j in range(i + 5, min(i + 8, len(lines))):
                        if re.match(r"[A-Z0-9\-]{5,}", lines[j]):
                            ref = lines[j]
                            break

                    results.append({
                        "reference": ref,
                        "designation": line,
                        "quantity": qty,
                        "unit_price": unit,
                        "discount": discount,
                        "total": total,
                        "tax_rate": 20
                    })

                    i += 6
                    continue

                except:
                    pass

        i += 1

    return results


# =========================
# TOTALS
# =========================

def extract_totals(text):

    numbers = re.findall(r"\d+[.,]\d{2}", text)
    nums = [normalize_number(n) for n in numbers if normalize_number(n) > 0]

    if len(nums) < 3:
        return {}

    ttc = max(nums)

    best = None
    best_diff = 999

    for a in nums:
        for b in nums:
            diff = abs((a + b) - ttc)
            if diff < best_diff:
                best_diff = diff
                best = (a, b)

    if best:
        return {
            "total_ht": best[0],
            "total_tva": best[1],
            "total_ttc": ttc
        }

    return {"total_ttc": ttc}


# =========================
# EVIDENCE
# =========================

def extract_evidence(text):
    return {
        "total_ttc": re.search(r"\*+(\d+[.,]\d{2})", text).group(1)
        if re.search(r"\*+(\d+[.,]\d{2})", text) else "",
        "date": extract_date(text)
    }


# =========================
# LLM FALLBACK
# =========================

def call_llm(text):

    prompt = f"""
Return ONLY JSON.

Extract:
supplier, client, invoice, lines, totals

Rules:
- DO NOT guess numbers
- DO NOT modify values

{text}
"""

    try:
        res = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "stream": False,
                "messages": [
                    {"role": "system", "content": "Return JSON only"},
                    {"role": "user", "content": prompt}
                ]
            },
            timeout=120
        )

        return json.loads(res.json()["message"]["content"])

    except:
        return {}


# =========================
# MAIN
# =========================

@app.post("/extract")
def extract_invoice(req: ExtractionRequest):

    text = req.raw_text
    lines_clean = preprocess_text(text)

    supplier = extract_supplier(lines_clean)
    client = extract_client(lines_clean)

    invoice_number = extract_invoice_number(text)
    issue_date = extract_date(text)

    lines = extract_lines(lines_clean)

    # 🔥 FINAL CLEAN
    lines = [l for l in lines if l["quantity"] > 0]

    totals = extract_totals(text)
    evidence = extract_evidence(text)

    confidence = 1.0

    if not lines or not totals:
        llm = call_llm(text)
        confidence -= 0.3
    else:
        llm = {}

    return {
        "document": {
            "type": "invoice",
            "page_count": req.page_count,
            "source_type": req.source_type
        },
        "supplier": {
            "name": supplier,
            "tax_id": re.search(r"\b\d{9}\b", text).group(0)
            if re.search(r"\b\d{9}\b", text) else ""
        },
        "client": client if client else llm.get("client", {}),
        "invoice": {
            "invoice_number": invoice_number,
            "issue_date": issue_date,
            "currency": "EUR"
        },
        "lines": lines if lines else llm.get("lines", []),
        "totals": totals if totals else llm.get("totals", {}),
        "evidence": evidence,
        "confidence": round(confidence, 2)
    }