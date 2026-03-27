from fastapi import FastAPI
from typing import Dict, List

app = FastAPI()


@app.post("/validate")
def validate(data: Dict):

    issues = []

    invoice = data.get("invoice", {})
    supplier = data.get("supplier", {})
    lines = data.get("lines", [])

    if not invoice.get("invoice_number"):
        issues.append({"type": "missing", "field": "invoice_number"})

    if not invoice.get("issue_date"):
        issues.append({"type": "missing", "field": "issue_date"})

    if not supplier.get("name"):
        issues.append({"type": "missing", "field": "supplier.name"})

    if not lines:
        issues.append({"type": "missing", "field": "lines"})

    for i, l in enumerate(lines):
        q = l.get("quantity", 0)
        u = l.get("unit_price", 0)
        d = l.get("discount", 0)
        t = l.get("total", 0)

        if abs((q * u - d) - t) > 0.5:
            issues.append({
                "type": "line_error",
                "line_index": i,
                "message": "calculation mismatch"
            })

    return {
        "is_valid": len(issues) == 0,
        "issues": issues,
        "data": data
    }