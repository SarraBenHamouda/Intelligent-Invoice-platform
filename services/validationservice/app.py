from typing import Any, Dict, List

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="validationservice")


class ValidationRequest(BaseModel):
    data: Dict[str, Any]


@app.get("/health")
def health():
    return {"status": "ok", "service": "validationservice"}


@app.post("/validate")
def validate_invoice(req: ValidationRequest):
    data = req.data
    issues: List[Dict[str, Any]] = []

    supplier = data.get("supplier", {})
    invoice = data.get("invoice", {})
    totals = data.get("totals", {})
    lines = data.get("lines", [])

    if not invoice.get("invoice_number"):
        issues.append({"type": "missing", "field": "invoice.invoice_number"})

    if not invoice.get("issue_date"):
        issues.append({"type": "missing", "field": "invoice.issue_date"})

    if not supplier.get("name"):
        issues.append({"type": "missing", "field": "supplier.name"})

    if not supplier.get("tax_id"):
        issues.append({"type": "missing", "field": "supplier.tax_id"})

    if not lines:
        issues.append({"type": "missing", "field": "lines"})

    total_ht = float(totals.get("total_ht", 0) or 0)
    total_tva = float(totals.get("total_tva", 0) or 0)
    total_ttc = float(totals.get("total_ttc", 0) or 0)

    # Validate totals ONLY if TTC is detected
    if total_ttc > 0:
        if abs((total_ht + total_tva) - total_ttc) > 0.05:
            issues.append({
                "type": "coherence",
                "field": "totals",
                "message": "total_ht + total_tva does not match total_ttc"
            })

    return {
        "is_valid": len(issues) == 0,
        "issue_count": len(issues),
        "issues": issues,
        "data": data
    }