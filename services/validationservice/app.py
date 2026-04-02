from fastapi import FastAPI
from typing import Dict

app = FastAPI(title="validationservice")

def normalize_val(v) -> float:
    try:
        return float(v or 0)
    except:
        return 0.0


@app.post("/validate")
def validate(data: Dict):
    issues = []

    invoice = data.get("invoice", {})
    supplier = data.get("supplier", {})
    client = data.get("client", {})
    lines = data.get("lines", [])
    totals = data.get("totals", {})

    # ── REQUIRED FIELDS ─────────────────────────
    if not invoice.get("invoice_number"):
        issues.append({"type": "missing", "field": "invoice_number"})

    if not invoice.get("issue_date"):
        issues.append({"type": "missing", "field": "issue_date"})

    if not supplier.get("name"):
        issues.append({"type": "missing", "field": "supplier.name"})

    if not client.get("name"):
        issues.append({"type": "missing", "field": "client.name"})

    if not lines:
        issues.append({"type": "missing", "field": "lines"})

    # ── LINE VALIDATION (FIXED) ─────────────────
    for i, line in enumerate(lines):
        q = normalize_val(line.get("quantity"))
        u = normalize_val(line.get("unit_price"))
        d = normalize_val(line.get("discount", 0))   # ✅ FIX
        t = normalize_val(line.get("line_total_ht")) # ✅ FIX

        if q <= 0 or u <= 0:
            continue

        # ✅ FIX: apply discount
        computed = round(q * u * (1 - d / 100), 2)

        if abs(computed - t) > 0.1:
            issues.append({
                "type": "line_error",
                "line_index": i,
                "reference": line.get("reference"),
                "message": f"expected {computed} vs {t}"
            })

    # ── FIX TOTALS IF MISSING ───────────────────
    if lines:
        sum_lines = round(sum(normalize_val(l.get("line_total_ht")) for l in lines), 2)

        if totals.get("total_ht", 0) == 0:
            totals["total_ht"] = sum_lines
            totals["total_tva"] = round(sum_lines * 0.2, 2)
            totals["total_ttc"] = round(sum_lines * 1.2, 2)

    # ── TOTAL VALIDATION ────────────────────────
    ht = normalize_val(totals.get("total_ht"))
    tva = normalize_val(totals.get("total_tva"))
    ttc = normalize_val(totals.get("total_ttc"))

    if ht > 0 and tva > 0 and ttc > 0:
        if abs((ht + tva) - ttc) > 1:
            issues.append({
                "type": "total_error",
                "message": "HT + TVA != TTC"
            })

    return {
        "is_valid": len(issues) == 0,
        "issue_count": len(issues),
        "issues": issues,
        "data": data,
    }


@app.get("/health")
def health():
    return {"status": "ok"}