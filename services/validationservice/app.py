from fastapi import FastAPI
from typing import Dict, List

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

    # ── Champs obligatoires ──────────────────────────────────
    if not invoice.get("invoice_number"):
        issues.append({"type": "missing", "field": "invoice_number", "message": "Numéro de facture absent"})

    if not invoice.get("issue_date"):
        issues.append({"type": "missing", "field": "issue_date", "message": "Date d'émission absente"})

    if not supplier.get("name"):
        issues.append({"type": "missing", "field": "supplier.name", "message": "Nom fournisseur absent"})

    if not client.get("name"):
        issues.append({"type": "missing", "field": "client.name", "message": "Nom client absent"})

    if not lines:
        issues.append({"type": "missing", "field": "lines", "message": "Aucune ligne de facturation"})

    # ── Validation des lignes ────────────────────────────────
    for i, line in enumerate(lines):
        q = normalize_val(line.get("quantity"))
        u = normalize_val(line.get("unit_price"))
        d_pct = normalize_val(line.get("discount_pct", 0))
        t = normalize_val(line.get("total_ht"))

        # Valeurs aberrantes (OCR error)
        if q > 99999 or u > 99999:
            issues.append({
                "type": "suspicious",
                "line_index": i,
                "field": "quantity/unit_price",
                "message": f"Valeur aberrante détectée (probable erreur OCR): qty={q}, unit={u}"
            })
            continue

        if q <= 0:
            issues.append({
                "type": "error",
                "line_index": i,
                "field": "quantity",
                "message": "Quantité nulle ou négative"
            })
            continue

        if u <= 0:
            issues.append({
                "type": "error",
                "line_index": i,
                "field": "unit_price",
                "message": "Prix unitaire nul ou négatif"
            })
            continue

        # ✅ Calcul avec remise en POURCENTAGE
        # total_ht = qty * unit_price * (1 - discount_pct / 100)
        computed = round(q * u * (1 - d_pct / 100), 2)

        if abs(computed - t) > 0.05:
            issues.append({
                "type": "line_error",
                "line_index": i,
                "reference": line.get("reference", ""),
                "message": f"Écart calcul: attendu {computed:.2f}, reçu {t:.2f} (qty={q}, prix={u}, remise={d_pct}%)"
            })

    # ── Cohérence totaux ─────────────────────────────────────
    if lines and totals:
        sum_lines = round(sum(normalize_val(l.get("total_ht")) for l in lines), 2)
        total_ht = normalize_val(totals.get("total_ht"))
        total_tva = normalize_val(totals.get("total_tva"))
        total_ttc = normalize_val(totals.get("total_ttc"))

        # Vérification HT vs somme des lignes (tolérance: frais de port non dans les lignes)
        if total_ht > 0 and abs(sum_lines - total_ht) > 5:
            issues.append({
                "type": "total_mismatch",
                "field": "total_ht",
                "message": f"Somme des lignes ({sum_lines}) ≠ total HT ({total_ht})"
            })

        # Vérification TTC = HT + TVA
        if total_ht > 0 and total_tva > 0 and total_ttc > 0:
            computed_ttc = round(total_ht + total_tva, 2)
            if abs(computed_ttc - total_ttc) > 0.05:
                issues.append({
                    "type": "total_mismatch",
                    "field": "total_ttc",
                    "message": f"HT({total_ht}) + TVA({total_tva}) = {computed_ttc} ≠ TTC({total_ttc})"
                })

    return {
        "is_valid": len(issues) == 0,
        "issue_count": len(issues),
        "issues": issues,
        "data": data,
    }


@app.post("/repair")
def repair(data: Dict):
    """
    Tente de réparer les lignes avec des problèmes de calcul connus.
    """
    lines = data.get("lines", [])
    repaired = []

    for line in lines:
        q = float(line.get("quantity") or 0)
        u = float(line.get("unit_price") or 0)
        d_pct = float(line.get("discount_pct", 0) or 0)

        if q > 0 and u > 0 and not (q > 99999 or u > 99999):
            # Recalcule le total avec la bonne formule
            line["total_ht"] = round(q * u * (1 - d_pct / 100), 2)
            line["_repaired"] = True

        repaired.append(line)

    data["lines"] = repaired
    data["_repair_applied"] = True
    return data


@app.get("/health")
def health():
    return {"status": "ok", "service": "validationservice"}