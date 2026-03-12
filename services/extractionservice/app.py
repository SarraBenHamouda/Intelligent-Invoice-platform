import json
import os
import re
from typing import Any, Dict, Optional

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434/api/chat")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "mistral:latest")

app = FastAPI(title="extractionservice")


class ExtractionRequest(BaseModel):
    raw_text: str
    page_count: int = 1
    source_type: str = "unknown"


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


@app.post("/extract")
def extract_invoice(req: ExtractionRequest):
    prompt = f"""
You are an invoice extraction engine.

Return ONLY valid JSON. No markdown. No explanation.

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

Rules:
- Use exact values from the text when possible.
- If a value is missing, use empty string or 0.
- Keep decimals numeric.
- Return only valid JSON.

Invoice text:
{req.raw_text}
""".strip()

    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {
                "role": "system",
                "content": "You extract invoice data and return only valid JSON."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=180)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ollama request failed: {str(e)}")

    try:
        content = data["message"]["content"]
        parsed = try_extract_json(content)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to parse JSON from model output",
                "exception": str(e),
                "raw_response": data
            }
        )

    return parsed