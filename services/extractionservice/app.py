import json
import os
import re
from typing import Any, Dict

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434/api/chat")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "mistral")

app = FastAPI(title="extractionservice")


class ExtractionRequest(BaseModel):
    raw_text: str
    page_count: int = 1
    source_type: str = "unknown"


class RepairRequest(BaseModel):
    raw_text: str
    extracted_data: Dict[str, Any]
    validation_issues: list


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "extractionservice",
        "ollama_url": OLLAMA_URL,
        "model": OLLAMA_MODEL,
    }


def try_extract_json(text: str) -> Dict[str, Any]:
    text = text.strip()

    try:
        return json.loads(text)
    except Exception:
        pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return json.loads(match.group(0))

    raise ValueError("No valid JSON found in model output")


def normalize_number(value):
    if value in ("", None):
        return 0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        value = value.strip().replace(",", ".")
        try:
            return float(value)
        except Exception:
            return 0
    return 0


def fix_only_totals(raw_text: str, parsed: Dict[str, Any]) -> Dict[str, Any]:
    """
    Correct only totals/evidence.total_ttc
    without touching supplier/client/invoice/lines.
    """
    if "totals" not in parsed or not isinstance(parsed["totals"], dict):
        parsed["totals"] = {}

    if "evidence" not in parsed or not isinstance(parsed["evidence"], dict):
        parsed["evidence"] = {}

    total_ht = normalize_number(parsed["totals"].get("total_ht"))
    total_tva = normalize_number(parsed["totals"].get("total_tva"))
    total_ttc = normalize_number(parsed["totals"].get("total_ttc"))

    amounts = re.findall(r"\d+[.,]\d{2}", raw_text)
    amounts = [normalize_number(x) for x in amounts if normalize_number(x) > 0]

    # If total_ttc looks like fake product number (e.g. 1000 from RH 1000), invalidate it
    if total_ttc >= 999:
        parsed["totals"]["total_ttc"] = 0
        parsed["evidence"]["total_ttc"] = ""

    total_ttc = normalize_number(parsed["totals"].get("total_ttc"))

    # If ht + tva is incoherent with ttc, invalidate ttc
    if total_ht > 0 and total_tva >= 0 and total_ttc > 0:
        if abs((total_ht + total_tva) - total_ttc) > 0.05:
            parsed["totals"]["total_ttc"] = 0
            parsed["evidence"]["total_ttc"] = ""

    total_ttc = normalize_number(parsed["totals"].get("total_ttc"))

    # If total_ttc is empty, try a coherent candidate from text, otherwise keep 0
    if total_ttc == 0 and amounts:
        expected = total_ht + total_tva
        coherent_candidates = [
            a for a in amounts
            if expected > 0 and abs(a - expected) <= 0.05
        ]

        if coherent_candidates:
            chosen = coherent_candidates[-1]
            parsed["totals"]["total_ttc"] = chosen
            parsed["evidence"]["total_ttc"] = str(chosen)
        else:
            parsed["totals"]["total_ttc"] = 0
            parsed["evidence"]["total_ttc"] = ""

    # If total_tva is absurdly larger than total_ht, invalidate it
    total_tva = normalize_number(parsed["totals"].get("total_tva"))
    if total_ht > 0 and total_tva > total_ht:
        parsed["totals"]["total_tva"] = 0

    return parsed


def fix_vat_fields(raw_text: str, parsed: Dict[str, Any]) -> Dict[str, Any]:
    """
    Correct obviously absurd VAT fields and ensure TTC is coherent.
    """

    totals = parsed.get("totals", {})

    total_ht = normalize_number(totals.get("total_ht"))
    total_tva = normalize_number(totals.get("total_tva"))
    total_ttc = normalize_number(totals.get("total_ttc"))

    # Si TVA est trop petite ou incohérente
    if total_ht > 0 and (total_tva <= 1 or total_tva < total_ht * 0.01):
        parsed["totals"]["total_tva"] = 0
        total_tva = 0

    # Cas important : facture sans TVA
    if total_ht > 0 and total_tva == 0:
        parsed["totals"]["total_ttc"] = total_ht

    # Corriger tax_rate incohérent
    if isinstance(parsed.get("lines"), list):
        for line in parsed["lines"]:
            if not isinstance(line, dict):
                continue

            rate = normalize_number(line.get("tax_rate"))

            # TVA absurde
            if rate == 1 or rate > 25:
                line["tax_rate"] = 0

    return parsed


def clean_lines(parsed: Dict[str, Any]) -> Dict[str, Any]:
    if isinstance(parsed.get("lines"), list):
        for line in parsed["lines"]:
            if isinstance(line, dict) and "evidence" in line:
                del line["evidence"]
    return parsed

@app.post("/extract")
def extract_invoice(req: ExtractionRequest):
    prompt = f"""
You are a strict invoice extraction engine specialized in French and mixed-language invoices.

Return ONLY valid JSON.
No markdown.
No explanation.
No comments.
No text before or after JSON.

Use this schema exactly:
{{
  "document": {{
    "type": "invoice",
    "page_count": {req.page_count},
    "source_type": "{req.source_type}"
  }},
  "supplier": {{
    "name": "",
    "tax_id": "",
    "address": "",
    "email": "",
    "phone": ""
  }},
  "client": {{
    "name": "",
    "tax_id": "",
    "address": ""
  }},
  "invoice": {{
    "invoice_number": "",
    "issue_date": "",
    "due_date": "",
    "currency": ""
  }},
  "lines": [
    {{
      "description": "",
      "quantity": 0,
      "unit_price": 0,
      "discount": 0,
      "tax_rate": 0,
      "line_total_ht": 0
    }}
  ],
  "totals": {{
    "total_ht": 0,
    "total_tva": 0,
    "total_ttc": 0
  }},
  "evidence": {{
    "invoice_number": "",
    "issue_date": "",
    "supplier_tax_id": "",
    "total_ttc": ""
  }}
}}

Extraction rules:
- Use exact values from the text when possible.
- If a value is missing or uncertain, use empty string for text fields and 0 for numeric fields.
- Keep numeric values as JSON numbers, not strings, except evidence fields which remain short exact text snippets.
- Convert decimal commas to decimal points for numeric fields. Example: 596,12 -> 596.12
- Do not invent values.
- Do not guess a tax rate, quantity, or total if not clearly present.
- A product name, reference, abonnement name, code, or description is NOT a total.
- Never use a number that appears inside a product description as total_ttc.
- Prefer values located near labels such as:
  - "Facture", "Numéro pièce", "Date", "Client", "Net à payer", "T.T.C.", "Base T.V.A", "Montant T.V.A", "EUR"
- For supplier tax id, prefer explicit fiscal/company identifiers such as "Matricule Fiscal", "TVA", tax number, or a short company id near supplier info.
- For client tax id, only extract it if clearly the client's identifier. Otherwise leave empty.
- issue_date should be the invoice date.
- due_date should be extracted only if clearly different from invoice date. Otherwise leave empty.
- currency should be extracted from clear currency indicators such as EUR, TND, USD, etc.

Line item rules:
- Extract all line items you can identify.
- If there is only one clear line item, return one item in the array.
- description must be the article/service label, not totals text.
- quantity must be extracted only if clearly shown for the item.
- unit_price must be the unit price only if clearly shown.
- discount must be a discount amount or percentage only if clearly shown for that line.
- tax_rate must be a VAT/TVA percentage only if clearly associated with the line or totals.
- line_total_ht must be the line amount before tax only if clearly shown.
- If line fields are uncertain, keep them at 0 instead of inventing values.

Totals rules:
- total_ht = amount before tax.
- total_tva = VAT amount.
- total_ttc = amount including tax / net payable.
- Prefer final summary amounts at the bottom of the invoice over numbers found in article names or references.
- If multiple candidate totals exist, prefer the ones near "Net à payer", "T.T.C.", or final totals section.
- Internally verify consistency: total_ht + total_tva should approximately equal total_ttc.
- If several candidate numbers exist and one choice makes totals coherent, prefer the coherent choice.
- If no coherent total_ttc is clear, set total_ttc to 0.

Evidence rules:
- evidence.invoice_number must be a short exact snippet from the text.
- evidence.issue_date must be a short exact snippet from the text.
- evidence.supplier_tax_id must be a short exact snippet from the text.
- evidence.total_ttc must be the exact short text snippet used for the chosen total_ttc.
- Evidence fields must not be paraphrased.

Return only valid JSON.

Invoice text:
{req.raw_text}
""".strip()

    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You extract structured invoice data. "
                    "You must return only valid JSON matching the requested schema. "
                    "Do not output markdown or explanations."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=600)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ollama request failed: {str(e)}")

    try:
        content = data["message"]["content"]
        parsed = try_extract_json(content)
        parsed = clean_lines(parsed)
        parsed = fix_only_totals(req.raw_text, parsed)
        parsed = fix_vat_fields(req.raw_text, parsed)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to parse JSON from model output",
                "exception": str(e),
                "raw_response": data,
            },
        )

    return parsed


@app.post("/repair")
def repair_invoice(req: RepairRequest):
    compact_extracted = json.dumps(req.extracted_data, ensure_ascii=False)
    compact_issues = json.dumps(req.validation_issues, ensure_ascii=False)

    prompt = f"""
You are an invoice correction engine.

Correct the extracted invoice JSON using:
- the raw invoice text
- the extracted JSON
- the validation issues

Return ONLY valid JSON.
No markdown.
No explanation.

Rules:
- Do not add any fields that are not present in the schema.
- Do not add "evidence" inside line items.
- Keep correct non-total fields unchanged.
- Keep discount, quantity, unit_price, tax_rate, and line_total_ht unchanged unless they are clearly absurd.
- If total_ttc is not explicitly found near the invoice summary, set it to 0.
- Never use numbers from product names, plan names, subscription names, or references as total_ttc.
- Values like "1000", "1000BS", or numbers embedded in item descriptions must not be used as invoice totals.
- If the current total_ttc comes from an item description, replace it with 0.
- Do not infer or invent totals.

Validation issues:
{compact_issues}

Extracted JSON:
{compact_extracted}

Raw invoice text:
{req.raw_text}
""".strip()

    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {
                "role": "system",
                "content": "You correct extracted invoice JSON and return only valid JSON."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=600)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ollama request failed: {str(e)}")

    try:
        content = data["message"]["content"]
        parsed = try_extract_json(content)
        parsed = fix_only_totals(req.raw_text, parsed)
        parsed = fix_vat_fields(req.raw_text, parsed)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to parse JSON from model output",
                "exception": str(e),
                "raw_response": data,
            },
        )

    return parsed