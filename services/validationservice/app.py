from typing import Any, Dict, List

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="validationservice-v2")


class ValidationRequest(BaseModel):
    data: Dict[str, Any]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/validate")
def validate_invoice(req: ValidationRequest):

    data = req.data
    issues: List[Dict[str, Any]] = []

    supplier = data.get("supplier", {})
    invoice = data.get("invoice", {})
    totals = data.get("totals", {})
    lines = data.get("lines", [])

    # =========================
    # REQUIRED FIELDS
    # =========================

    if not invoice.get("invoice_number"):
        issues.append({"type": "missing", "field": "invoice_number"})

    if not invoice.get("issue_date"):
        issues.append({"type": "missing", "field": "issue_date"})

    if not supplier.get("name"):
        issues.append({"type": "missing", "field": "supplier.name"})

    if not lines:
        issues.append({"type": "missing", "field": "lines"})


    # =========================
    # TOTALS VALIDATION
    # =========================

    ht = float(totals.get("total_ht", 0))
    tva = float(totals.get("total_tva", 0))
    ttc = float(totals.get("total_ttc", 0))

    if ttc > 0:

        if abs((ht + tva) - ttc) > 0.05:

            # 🔥 AUTO FIX SWAP
            if abs((tva + ht) - ttc) < 0.05:
                totals["total_ht"], totals["total_tva"] = tva, ht
            else:
                issues.append({
                    "type": "coherence",
                    "message": "HT + TVA != TTC"
                })


    # =========================
    # LINE VALIDATION
    # =========================

    for i, line in enumerate(lines):

        qty = float(line.get("quantity", 0))
        unit = float(line.get("unit_price", 0))
        total = float(line.get("total", 0))

        if qty > 0 and unit > 0:
            if abs((qty * unit) - total) > 1:
                issues.append({
                    "type": "line_error",
                    "line_index": i,
                    "message": "quantity * unit_price != total"
                })


    # =========================
    # CONFIDENCE SCORE
    # =========================

    confidence = 1.0

    if issues:
        confidence -= min(len(issues) * 0.1, 0.5)

    confidence = round(confidence, 2)


    return {
        "is_valid": len(issues) == 0,
        "confidence": confidence,
        "issue_count": len(issues),
        "issues": issues,
        "data": data
    }