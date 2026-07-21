from datetime import datetime
import re
from typing import Any, Dict, List, Optional

from fastapi import FastAPI


app = FastAPI(title="validationservice")

AMOUNT_TOLERANCE = 0.05
TOTAL_TOLERANCE = 0.10

ECO_KEYWORDS = (
    "ECO-CONTRIBUT",
    "ECO CONTRIBUT",
    "ECONTRIBUT",
    "ECOCONTRIBUT",
    "TAXE ECO",
)


# ============================================================
# OUTILS
# ============================================================

def normalize_number(value: Any) -> float:
    if value is None or isinstance(value, bool):
        return 0.0

    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()

    if not text:
        return 0.0

    text = text.replace("\u00a0", " ")
    text = text.replace(" ", "")

    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "")
            text = text.replace(",", ".")
        else:
            text = text.replace(",", "")
    else:
        text = text.replace(",", ".")

    text = re.sub(r"[^0-9.\-]", "", text)

    if text.count(".") > 1:
        parts = text.split(".")
        text = "".join(parts[:-1]) + "." + parts[-1]

    try:
        return float(text)
    except (TypeError, ValueError):
        return 0.0


def round_amount(value: Any, digits: int = 2) -> float:
    return round(
        normalize_number(value) + 1e-12,
        digits,
    )


def amount_is_close(
    actual: Any,
    expected: Any,
    tolerance: float = AMOUNT_TOLERANCE,
) -> bool:
    return abs(
        normalize_number(actual)
        - normalize_number(expected)
    ) <= tolerance


def is_empty(value: Any) -> bool:
    if value is None:
        return True

    if isinstance(value, str):
        return value.strip() == ""

    return False


def valid_date(value: Any) -> bool:
    if is_empty(value):
        return False

    value = str(value).strip()

    for fmt in (
        "%d/%m/%Y",
        "%Y-%m-%d",
        "%d-%m-%Y",
    ):
        try:
            datetime.strptime(value, fmt)
            return True
        except ValueError:
            continue

    return False


def ensure_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def ensure_list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return value

    if isinstance(value, dict):
        return [value]

    return []


def human_label(field: str) -> str:
    labels = {
        "document.type_document": "Type de document",
        "document.code_type_document": "Code du type de document",
        "document.numero": "Numéro de facture",
        "document.date": "Date de facture",
        "document.date_echeance": "Date d’échéance",
        "document.devise": "Devise",
        "fournisseur.nom": "Nom du fournisseur",
        "fournisseur.identifiant": "Identifiant du fournisseur",
        "fournisseur.type_identifiant":
            "Type d’identifiant du fournisseur",
        "fournisseur.pays": "Pays du fournisseur",
        "client.nom": "Nom du client",
        "client.identifiant": "Identifiant du client",
        "client.type_identifiant":
            "Type d’identifiant du client",
        "client.pays": "Pays du client",
        "totaux.total_ht": "Total HT",
        "totaux.base_tva": "Base TVA",
        "totaux.montant_tva": "Montant TVA",
        "totaux.total_ttc": "Total TTC",
        "totaux.net_a_payer": "Net à payer",
        "totaux.timbre_fiscal": "Timbre fiscal",
        "totaux.frais_port_non_soumis":
            "Frais de port non soumis",
        "totaux.frais_port_soumis":
            "Frais de port soumis",
        "totaux.taxes_cpl": "Taxes complémentaires",
        "totaux.tax_rate": "Taux de TVA",
    }

    if field in labels:
        return labels[field]

    match = re.match(
        r"^lignes\[(\d+)\]\.(.+)$",
        str(field),
    )

    if match:
        line_number = int(match.group(1)) + 1
        property_name = match.group(2)

        line_labels = {
            "reference": "Référence",
            "designation": "Désignation",
            "quantite": "Quantité",
            "prix_unitaire": "Prix unitaire",
            "remise": "Remise",
            "taux_tva": "Taux de TVA",
            "montant_ht": "Montant HT",
        }

        return (
            f"{line_labels.get(property_name, property_name)} "
            f"de l’article {line_number}"
        )

    return field


def add_error(
    errors: List[Dict[str, Any]],
    field: str,
    message: str,
    *,
    actual: Any = None,
    expected: Any = None,
    code: str = "VALIDATION_ERROR",
    value_type: str = "text",
    line_index: Optional[int] = None,
) -> None:
    errors.append({
        "severity": "ERROR",
        "code": code,
        "field": field,
        "label": human_label(field),
        "message": message,
        "actual": actual,
        "expected": expected,
        "suggested_value": expected,
        "value_type": value_type,
        "line_index": line_index,
        "required": True,
    })


def add_warning(
    warnings: List[Dict[str, Any]],
    field: str,
    message: str,
    *,
    actual: Any = None,
    expected: Any = None,
    code: str = "VALIDATION_WARNING",
    value_type: str = "text",
    line_index: Optional[int] = None,
    requires_review: bool = True,
) -> None:
    warnings.append({
        "severity": "WARNING",
        "code": code,
        "field": field,
        "label": human_label(field),
        "message": message,
        "actual": actual,
        "expected": expected,
        "suggested_value": expected,
        "value_type": value_type,
        "line_index": line_index,
        "required": False,
        "requires_review": requires_review,
    })


def text_contains_eco_keyword(value: Any) -> bool:
    text = str(value or "").upper()
    text = text.replace("É", "E")

    return any(
        keyword in text
        for keyword in ECO_KEYWORDS
    )


def is_eco_contribution_line(
    line: Dict[str, Any],
) -> bool:
    designation = (
        line.get("designation")
        or line.get("description")
        or line.get("libelle")
    )

    return (
        text_contains_eco_keyword(line.get("reference"))
        or text_contains_eco_keyword(designation)
    )


def get_line_values(
    line: Dict[str, Any],
) -> Dict[str, float]:
    return {
        "quantite": normalize_number(
            line.get("quantite")
        ),
        "prix_unitaire": normalize_number(
            line.get(
                "prix_unitaire_num",
                line.get("prix_unitaire"),
            )
        ),
        "remise": normalize_number(
            line.get(
                "remise_num",
                line.get("remise"),
            )
        ),
        "montant_ht": normalize_number(
            line.get(
                "montant_ht_num",
                line.get("montant_ht"),
            )
        ),
        "taux_tva": normalize_number(
            line.get(
                "taux_tva_num",
                line.get("taux_tva"),
            )
        ),
    }


def determine_main_tax_rate(
    lignes: List[Dict[str, Any]],
    declared_tax_rate: float,
) -> float:
    if declared_tax_rate > 0:
        return declared_tax_rate

    rates: List[float] = []

    for line in lignes:
        if not isinstance(line, dict):
            continue

        if is_eco_contribution_line(line):
            continue

        rate = normalize_number(
            line.get(
                "taux_tva_num",
                line.get("taux_tva"),
            )
        )

        if rate > 0:
            rates.append(rate)

    if not rates:
        return 0.0

    return max(set(rates), key=rates.count)


def calculate_totals(
    lignes: List[Dict[str, Any]],
    totaux: Dict[str, Any],
) -> Dict[str, Any]:
    normal_lines_extracted_total_ht = 0.0
    normal_lines_calculated_total_ht = 0.0
    calculated_lines_vat = 0.0
    eco_total_from_lines = 0.0

    line_calculations: List[Dict[str, Any]] = []

    for index, line in enumerate(lignes):
        if not isinstance(line, dict):
            continue

        values = get_line_values(line)

        quantity = values["quantite"]
        unit_price = values["prix_unitaire"]
        discount = values["remise"]
        amount_ht = values["montant_ht"]
        tax_rate = values["taux_tva"]

        if is_eco_contribution_line(line):
            eco_amount = amount_ht

            if eco_amount <= 0:
                eco_amount = round_amount(
                    quantity * unit_price,
                    3,
                )

            eco_total_from_lines += eco_amount

            line_calculations.append({
                "index": index,
                "type": "ECO_CONTRIBUTION",
                "reference": line.get("reference", ""),
                "designation": line.get("designation", ""),
                "extracted_amount_ht": round_amount(
                    amount_ht,
                    3,
                ),
                "calculated_amount_ht": round_amount(
                    eco_amount,
                    3,
                ),
            })

            continue

        gross_amount = quantity * unit_price
        discount_amount = gross_amount * discount / 100

        calculated_amount_ht = round_amount(
            gross_amount - discount_amount,
            3,
        )

        calculated_vat = round_amount(
            calculated_amount_ht
            * tax_rate
            / 100,
            3,
        )

        normal_lines_extracted_total_ht += amount_ht
        normal_lines_calculated_total_ht += (
            calculated_amount_ht
        )
        calculated_lines_vat += calculated_vat

        line_calculations.append({
            "index": index,
            "type": "ARTICLE",
            "reference": line.get("reference", ""),
            "designation": line.get("designation", ""),
            "quantity": quantity,
            "unit_price": unit_price,
            "discount_rate": discount,
            "tax_rate": tax_rate,
            "extracted_amount_ht": round_amount(
                amount_ht,
                3,
            ),
            "calculated_amount_ht":
                calculated_amount_ht,
            "calculated_vat":
                calculated_vat,
        })

    normal_lines_extracted_total_ht = round_amount(
        normal_lines_extracted_total_ht,
        3,
    )

    normal_lines_calculated_total_ht = round_amount(
        normal_lines_calculated_total_ht,
        3,
    )

    calculated_lines_vat = round_amount(
        calculated_lines_vat,
        3,
    )

    eco_total_from_lines = round_amount(
        eco_total_from_lines,
        3,
    )

    extracted_total_ht = normalize_number(
        totaux.get("total_ht")
    )

    extracted_base_tva = normalize_number(
        totaux.get("base_tva")
    )

    extracted_vat = normalize_number(
        totaux.get("montant_tva")
    )

    extracted_total_ttc = normalize_number(
        totaux.get("total_ttc")
    )

    extracted_net_to_pay = normalize_number(
        totaux.get("net_a_payer")
    )

    stamp_duty = normalize_number(
        totaux.get("timbre_fiscal")
    )

    shipping_non_taxable = normalize_number(
        totaux.get("frais_port_non_soumis")
    )

    shipping_taxable_raw = normalize_number(
        totaux.get("frais_port_soumis")
    )

    shipping_taxable = shipping_taxable_raw

    # Protection :
    # si frais_port_soumis est égal au TTC, il s'agit
    # presque certainement d'une mauvaise affectation OCR.
    shipping_taxable_misassigned = False

    if (
        extracted_total_ttc > 0
        and shipping_taxable > 0
        and amount_is_close(
            shipping_taxable,
            extracted_total_ttc,
            tolerance=0.01,
        )
    ):
        shipping_taxable = 0.0
        shipping_taxable_misassigned = True

    declared_additional_taxes = normalize_number(
        totaux.get("taxes_cpl")
    )

    declared_tax_rate = normalize_number(
        totaux.get("tax_rate")
    )

    main_tax_rate = determine_main_tax_rate(
        lignes,
        declared_tax_rate,
    )

    effective_additional_taxes = (
        declared_additional_taxes
    )

    if (
        effective_additional_taxes <= 0
        and eco_total_from_lines > 0
    ):
        effective_additional_taxes = (
            eco_total_from_lines
        )

    # Déduire l'éco-contribution depuis la base ou le TTC.
    inferred_additional_taxes = 0.0

    if effective_additional_taxes <= 0:
        if extracted_base_tva > 0:
            inferred_additional_taxes = round_amount(
                extracted_base_tva
                - extracted_total_ht
                - shipping_non_taxable
                - shipping_taxable,
                2,
            )

        elif (
            extracted_total_ttc > 0
            and main_tax_rate > 0
        ):
            inferred_taxable_base = round_amount(
                extracted_total_ttc
                / (1 + main_tax_rate / 100),
                2,
            )

            inferred_additional_taxes = round_amount(
                inferred_taxable_base
                - extracted_total_ht
                - shipping_non_taxable
                - shipping_taxable,
                2,
            )

        if 0 < inferred_additional_taxes <= 100:
            effective_additional_taxes = (
                inferred_additional_taxes
            )

    # Utiliser en priorité les montants HT imprimés.
    expected_total_ht = round_amount(
        normal_lines_extracted_total_ht,
        2,
    )

    if expected_total_ht <= 0:
        expected_total_ht = round_amount(
            normal_lines_calculated_total_ht,
            2,
        )

    expected_base_tva = round_amount(
        expected_total_ht
        + effective_additional_taxes
        + shipping_non_taxable
        + shipping_taxable,
        2,
    )

    expected_vat = round_amount(
        expected_base_tva
        * main_tax_rate
        / 100,
        2,
    )

    expected_total_ttc = round_amount(
        expected_base_tva
        + expected_vat
        + stamp_duty,
        2,
    )

    return {
        "line_calculations":
            line_calculations,

        "normal_lines_extracted_total_ht":
            normal_lines_extracted_total_ht,

        "normal_lines_calculated_total_ht":
            normal_lines_calculated_total_ht,

        "calculated_lines_vat":
            calculated_lines_vat,

        "eco_total_from_lines":
            eco_total_from_lines,

        "declared_additional_taxes":
            round_amount(
                declared_additional_taxes,
                3,
            ),

        "inferred_additional_taxes":
            round_amount(
                inferred_additional_taxes,
                3,
            ),

        "effective_additional_taxes":
            round_amount(
                effective_additional_taxes,
                3,
            ),

        "main_tax_rate":
            main_tax_rate,

        "shipping_non_taxable":
            round_amount(
                shipping_non_taxable,
                3,
            ),

        "shipping_taxable_raw":
            round_amount(
                shipping_taxable_raw,
                3,
            ),

        "shipping_taxable":
            round_amount(
                shipping_taxable,
                3,
            ),

        "shipping_taxable_misassigned":
            shipping_taxable_misassigned,

        "stamp_duty":
            round_amount(
                stamp_duty,
                3,
            ),

        "extracted_total_ht":
            round_amount(
                extracted_total_ht,
                3,
            ),

        "extracted_base_tva":
            round_amount(
                extracted_base_tva,
                3,
            ),

        "extracted_vat":
            round_amount(
                extracted_vat,
                3,
            ),

        "extracted_total_ttc":
            round_amount(
                extracted_total_ttc,
                3,
            ),

        "extracted_net_to_pay":
            round_amount(
                extracted_net_to_pay,
                3,
            ),

        "expected_total_ht":
            expected_total_ht,

        "expected_base_tva":
            expected_base_tva,

        "expected_vat":
            expected_vat,

        "expected_total_ttc":
            expected_total_ttc,
    }


# ============================================================
# VALIDATION JSON
# ============================================================

@app.post("/validate-json")
def validate_json(payload: Dict[str, Any]):
    errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []

    data = payload

    if isinstance(payload.get("working_data"), dict):
        data = payload["working_data"]
    elif isinstance(payload.get("data"), dict):
        data = payload["data"]
    elif isinstance(payload.get("original_data"), dict):
        data = payload["original_data"]

    document = ensure_dict(data.get("document"))
    fournisseur = ensure_dict(data.get("fournisseur"))
    client = ensure_dict(data.get("client"))
    facture = ensure_dict(data.get("facture"))
    totaux = ensure_dict(data.get("totaux"))
    controle = ensure_dict(
        data.get("controle_validation")
    )

    lignes_source = data.get("lignes")

    if not isinstance(lignes_source, list):
        lignes_source = data.get("lignes_facture")

    lignes = ensure_list(lignes_source)

    numero_facture = (
        document.get("numero")
        or facture.get("numero")
        or ""
    )

    date_facture = (
        document.get("date")
        or facture.get("date_facture")
        or ""
    )

    date_echeance = (
        document.get("date_echeance")
        or facture.get("date_echeance")
        or ""
    )

    # DOCUMENT
    if is_empty(document.get("type_document")):
        add_error(
            errors,
            "document.type_document",
            "Type document manquant",
            actual=document.get("type_document"),
            code="DOCUMENT_TYPE_MISSING",
        )

    if is_empty(document.get("code_type_document")):
        add_error(
            errors,
            "document.code_type_document",
            "Code type document manquant",
            actual=document.get("code_type_document"),
            code="DOCUMENT_CODE_MISSING",
        )

    if is_empty(document.get("devise")):
        add_error(
            errors,
            "document.devise",
            "Devise manquante",
            actual=document.get("devise"),
            code="CURRENCY_MISSING",
        )

    if is_empty(numero_facture):
        add_error(
            errors,
            "document.numero",
            "Numéro facture manquant",
            actual=numero_facture,
            code="INVOICE_NUMBER_MISSING",
        )

    if is_empty(date_facture):
        add_error(
            errors,
            "document.date",
            "Date facture manquante",
            actual=date_facture,
            code="INVOICE_DATE_MISSING",
            value_type="date",
        )

    elif not valid_date(date_facture):
        add_error(
            errors,
            "document.date",
            "Format date facture invalide",
            actual=date_facture,
            code="INVOICE_DATE_INVALID",
            value_type="date",
        )

    if (
        not is_empty(date_echeance)
        and not valid_date(date_echeance)
    ):
        add_warning(
            warnings,
            "document.date_echeance",
            "Format date échéance invalide",
            actual=date_echeance,
            code="DUE_DATE_INVALID",
            value_type="date",
        )

    # FOURNISSEUR
    if is_empty(fournisseur.get("nom")):
        add_error(
            errors,
            "fournisseur.nom",
            "Nom fournisseur manquant",
            actual=fournisseur.get("nom"),
            code="SUPPLIER_NAME_MISSING",
        )

    fournisseur_identifiant = (
        fournisseur.get("identifiant")
        or fournisseur.get(
            "matricule_fiscal_ou_tva"
        )
        or fournisseur.get("numero_fournisseur")
        or fournisseur.get("siret")
    )

    if is_empty(fournisseur_identifiant):
        add_error(
            errors,
            "fournisseur.identifiant",
            "Identifiant fournisseur manquant",
            actual=fournisseur_identifiant,
            code="SUPPLIER_IDENTIFIER_MISSING",
        )

    if is_empty(fournisseur.get("type_identifiant")):
        add_error(
            errors,
            "fournisseur.type_identifiant",
            "Type identifiant fournisseur manquant",
            actual=fournisseur.get("type_identifiant"),
            code="SUPPLIER_IDENTIFIER_TYPE_MISSING",
        )

    if is_empty(fournisseur.get("pays")):
        add_warning(
            warnings,
            "fournisseur.pays",
            "Pays fournisseur manquant",
            actual=fournisseur.get("pays"),
            code="SUPPLIER_COUNTRY_MISSING",
        )

    # CLIENT
    if is_empty(client.get("nom")):
        add_error(
            errors,
            "client.nom",
            "Nom client manquant",
            actual=client.get("nom"),
            code="CUSTOMER_NAME_MISSING",
        )

    client_identifiant = (
        client.get("identifiant")
        or client.get("code_client")
        or client.get(
            "matricule_fiscal_ou_tva"
        )
        or client.get("siret")
    )

    if is_empty(client_identifiant):
        add_error(
            errors,
            "client.identifiant",
            "Identifiant ou code client manquant",
            actual=client_identifiant,
            code="CUSTOMER_IDENTIFIER_MISSING",
        )

    if is_empty(client.get("type_identifiant")):
        add_error(
            errors,
            "client.type_identifiant",
            "Type identifiant client manquant",
            actual=client.get("type_identifiant"),
            code="CUSTOMER_IDENTIFIER_TYPE_MISSING",
        )

    if is_empty(client.get("pays")):
        add_warning(
            warnings,
            "client.pays",
            "Pays client manquant",
            actual=client.get("pays"),
            code="CUSTOMER_COUNTRY_MISSING",
        )

    # LIGNES
    if not lignes:
        add_error(
            errors,
            "lignes",
            "Aucune ligne facture détectée",
            actual=[],
            code="NO_INVOICE_LINES",
        )
    else:
        for index, ligne in enumerate(lignes):
            prefix = f"lignes[{index}]"

            if not isinstance(ligne, dict):
                add_error(
                    errors,
                    prefix,
                    "La ligne doit être un objet JSON",
                    actual=ligne,
                    code="INVALID_LINE_OBJECT",
                    line_index=index,
                )
                continue

            if is_eco_contribution_line(ligne):
                continue

            designation = (
                ligne.get("designation")
                or ligne.get("description")
                or ligne.get("libelle")
            )

            if is_empty(designation):
                add_error(
                    errors,
                    f"{prefix}.designation",
                    "Désignation manquante",
                    actual=designation,
                    code="LINE_DESIGNATION_MISSING",
                    line_index=index,
                )

            values = get_line_values(ligne)

            quantite = values["quantite"]
            prix_unitaire = values["prix_unitaire"]
            remise = values["remise"]
            montant_ht = values["montant_ht"]
            taux_tva = values["taux_tva"]

            if quantite <= 0:
                add_error(
                    errors,
                    f"{prefix}.quantite",
                    "Quantité invalide",
                    actual=quantite,
                    expected=1,
                    code="INVALID_LINE_QUANTITY",
                    value_type="number",
                    line_index=index,
                )

            if prix_unitaire < 0:
                add_error(
                    errors,
                    f"{prefix}.prix_unitaire",
                    "Prix unitaire invalide",
                    actual=prix_unitaire,
                    expected=0,
                    code="INVALID_UNIT_PRICE",
                    value_type="number",
                    line_index=index,
                )

            if remise < 0 or remise > 100:
                add_error(
                    errors,
                    f"{prefix}.remise",
                    (
                        "La remise doit être comprise "
                        "entre 0 et 100 %"
                    ),
                    actual=remise,
                    expected=0,
                    code="INVALID_DISCOUNT_RATE",
                    value_type="number",
                    line_index=index,
                )

            if montant_ht < 0:
                add_error(
                    errors,
                    f"{prefix}.montant_ht",
                    "Montant HT ligne invalide",
                    actual=montant_ht,
                    expected=0,
                    code="INVALID_LINE_AMOUNT",
                    value_type="number",
                    line_index=index,
                )

            if taux_tva < 0 or taux_tva > 100:
                add_error(
                    errors,
                    f"{prefix}.taux_tva",
                    "Taux TVA invalide",
                    actual=taux_tva,
                    expected=0,
                    code="INVALID_TAX_RATE",
                    value_type="number",
                    line_index=index,
                )

            if (
                quantite > 0
                and prix_unitaire >= 0
                and 0 <= remise <= 100
            ):
                montant_attendu = round_amount(
                    quantite
                    * prix_unitaire
                    * (1 - remise / 100),
                    2,
                )

                if not amount_is_close(
                    montant_ht,
                    montant_attendu,
                    tolerance=0.05,
                ):
                    # Le montant imprimé peut être correct alors que la quantité
                    # OCR est erronée. On diagnostique d'abord la quantité au lieu
                    # de proposer automatiquement de remplacer le montant HT.
                    denominator = prix_unitaire * (1 - remise / 100)
                    inferred_quantity = (
                        montant_ht / denominator
                        if denominator > 0 and montant_ht > 0
                        else 0.0
                    )
                    inferred_quantity = round_amount(inferred_quantity, 3)
                    inferred_is_plausible = (
                        inferred_quantity > 0
                        and abs(inferred_quantity - round(inferred_quantity)) <= 0.01
                        and not amount_is_close(
                            inferred_quantity,
                            quantite,
                            tolerance=0.01,
                        )
                    )

                    if inferred_is_plausible:
                        add_warning(
                            warnings,
                            f"{prefix}.quantite",
                            (
                                "La quantité extraite semble incorrecte : "
                                f"le montant HT imprimé {montant_ht:.2f} "
                                f"correspond à une quantité de "
                                f"{inferred_quantity:g}, et non {quantite:g}."
                            ),
                            actual=quantite,
                            expected=inferred_quantity,
                            code="LINE_QUANTITY_OCR_MISMATCH",
                            value_type="number",
                            line_index=index,
                        )
                    else:
                        add_warning(
                            warnings,
                            f"{prefix}.montant_ht",
                            (
                                "Montant ligne incohérent : "
                                f"attendu {montant_attendu:.2f}, "
                                f"trouvé {montant_ht:.2f}"
                            ),
                            actual=montant_ht,
                            expected=montant_attendu,
                            code="LINE_AMOUNT_MISMATCH",
                            value_type="number",
                            line_index=index,
                        )

    calculations = calculate_totals(
        lignes,
        totaux,
    )

    extracted_total_ht = calculations[
        "extracted_total_ht"
    ]

    extracted_base_tva = calculations[
        "extracted_base_tva"
    ]

    extracted_vat = calculations[
        "extracted_vat"
    ]

    extracted_total_ttc = calculations[
        "extracted_total_ttc"
    ]

    extracted_net_to_pay = calculations[
        "extracted_net_to_pay"
    ]

    expected_total_ht = calculations[
        "expected_total_ht"
    ]

    expected_base_tva = calculations[
        "expected_base_tva"
    ]

    expected_vat = calculations[
        "expected_vat"
    ]

    expected_total_ttc = calculations[
        "expected_total_ttc"
    ]

    effective_additional_taxes = calculations[
        "effective_additional_taxes"
    ]

    main_tax_rate = calculations[
        "main_tax_rate"
    ]

    # TOTAL HT
    if extracted_total_ht <= 0:
        add_error(
            errors,
            "totaux.total_ht",
            "Total HT manquant ou invalide",
            actual=extracted_total_ht,
            expected=expected_total_ht,
            code="TOTAL_HT_MISSING",
            value_type="number",
        )

    elif not amount_is_close(
        extracted_total_ht,
        expected_total_ht,
        tolerance=TOTAL_TOLERANCE,
    ):
        add_warning(
            warnings,
            "totaux.total_ht",
            (
                "Le total HT est incohérent : "
                f"attendu {expected_total_ht:.2f}, "
                f"trouvé {extracted_total_ht:.2f}"
            ),
            actual=extracted_total_ht,
            expected=expected_total_ht,
            code="TOTAL_HT_MISMATCH",
            value_type="number",
        )

    # TTC
    if extracted_total_ttc <= 0:
        add_error(
            errors,
            "totaux.total_ttc",
            "Total TTC manquant ou invalide",
            actual=extracted_total_ttc,
            expected=expected_total_ttc,
            code="TOTAL_TTC_MISSING",
            value_type="number",
        )

    # BASE TVA
    if (
        expected_base_tva > 0
        and not amount_is_close(
            extracted_base_tva,
            expected_base_tva,
            tolerance=TOTAL_TOLERANCE,
        )
    ):
        add_warning(
            warnings,
            "totaux.base_tva",
            (
                "La base TVA est incohérente : "
                f"attendu {expected_base_tva:.2f}, "
                f"trouvé {extracted_base_tva:.2f}"
            ),
            actual=extracted_base_tva,
            expected=expected_base_tva,
            code="TAXABLE_BASE_MISMATCH",
            value_type="number",
        )

    # TVA
    if (
        main_tax_rate > 0
        and not amount_is_close(
            extracted_vat,
            expected_vat,
            tolerance=TOTAL_TOLERANCE,
        )
    ):
        add_warning(
            warnings,
            "totaux.montant_tva",
            (
                "Le montant TVA est incohérent : "
                f"attendu {expected_vat:.2f}, "
                f"trouvé {extracted_vat:.2f}"
            ),
            actual=extracted_vat,
            expected=expected_vat,
            code="TOTAL_VAT_MISMATCH",
            value_type="number",
        )

    # TOTAL TTC
    if (
        extracted_total_ttc > 0
        and not amount_is_close(
            extracted_total_ttc,
            expected_total_ttc,
            tolerance=TOTAL_TOLERANCE,
        )
    ):
        add_warning(
            warnings,
            "totaux.total_ttc",
            (
                "Le total TTC est incohérent : "
                f"attendu {expected_total_ttc:.2f}, "
                f"trouvé {extracted_total_ttc:.2f}"
            ),
            actual=extracted_total_ttc,
            expected=expected_total_ttc,
            code="TOTAL_TTC_MISMATCH",
            value_type="number",
        )

    # NET À PAYER
    if (
        extracted_net_to_pay > 0
        and extracted_total_ttc > 0
        and not amount_is_close(
            extracted_net_to_pay,
            extracted_total_ttc,
            tolerance=TOTAL_TOLERANCE,
        )
    ):
        add_warning(
            warnings,
            "totaux.net_a_payer",
            (
                "Le net à payer est différent du TTC : "
                f"TTC {extracted_total_ttc:.2f}, "
                f"net à payer {extracted_net_to_pay:.2f}"
            ),
            actual=extracted_net_to_pay,
            expected=extracted_total_ttc,
            code="NET_TO_PAY_MISMATCH",
            value_type="number",
        )

    # TAXES CPL
    declared_taxes_cpl = normalize_number(
        totaux.get("taxes_cpl")
    )

    if (
        effective_additional_taxes > 0
        and not amount_is_close(
            declared_taxes_cpl,
            effective_additional_taxes,
            tolerance=0.01,
        )
    ):
        add_warning(
            warnings,
            "totaux.taxes_cpl",
            (
                "La taxe complémentaire est absente "
                "ou incorrecte : "
                f"attendu {effective_additional_taxes:.2f}, "
                f"trouvé {declared_taxes_cpl:.2f}"
            ),
            actual=declared_taxes_cpl,
            expected=effective_additional_taxes,
            code="ADDITIONAL_TAX_MISMATCH",
            value_type="number",
        )

    # TAX RATE
    declared_tax_rate = normalize_number(
        totaux.get("tax_rate")
    )

    if (
        main_tax_rate > 0
        and not amount_is_close(
            declared_tax_rate,
            main_tax_rate,
            tolerance=0.001,
        )
    ):
        add_warning(
            warnings,
            "totaux.tax_rate",
            (
                "Le taux global de TVA est absent "
                "ou incorrect : "
                f"attendu {main_tax_rate:.2f}, "
                f"trouvé {declared_tax_rate:.2f}"
            ),
            actual=declared_tax_rate,
            expected=main_tax_rate,
            code="GLOBAL_TAX_RATE_MISMATCH",
            value_type="number",
        )

    # FRAIS PORT SOUMIS MAL AFFECTÉS
    if calculations[
        "shipping_taxable_misassigned"
    ]:
        add_warning(
            warnings,
            "totaux.frais_port_soumis",
            (
                "Le montant des frais de port soumis "
                "semble provenir du total TTC. "
                "La valeur attendue est 0.00."
            ),
            actual=calculations[
                "shipping_taxable_raw"
            ],
            expected=0.0,
            code="SHIPPING_TAXABLE_MISASSIGNED",
            value_type="number",
        )

    # CONTRÔLE EXTRACTION
    if controle:
        if controle.get(
            "peut_generer_teif"
        ) is False:
            add_error(
                errors,
                (
                    "controle_validation."
                    "peut_generer_teif"
                ),
                (
                    "Extraction indique que TEIF "
                    "ne peut pas être généré"
                ),
                actual=False,
                expected=True,
                code="TEIF_GENERATION_BLOCKED",
                value_type="boolean",
            )

        for err in ensure_list(
            controle.get(
                "erreurs_bloquantes"
            )
        ):
            add_error(
                errors,
                (
                    "controle_validation."
                    "erreurs_bloquantes"
                ),
                str(err),
                code="EXTRACTION_BLOCKING_ERROR",
            )

        for warning in ensure_list(
            controle.get(
                "avertissements"
            )
        ):
            add_warning(
                warnings,
                (
                    "controle_validation."
                    "avertissements"
                ),
                str(warning),
                code="EXTRACTION_WARNING",
            )

    valid = len(errors) == 0

    needs_human_review = (
        len(errors) > 0
        or any(
            warning.get(
                "requires_review",
                True,
            )
            for warning in warnings
        )
    )

    review_status = (
        "PENDING_REVIEW"
        if needs_human_review
        else "VALID"
    )

    return {
        "valid": valid,
        "is_valid": valid,
        "fully_valid":
            valid and len(warnings) == 0,
        "needs_human_review":
            needs_human_review,
        "review_status":
            review_status,
        "stage":
            "json_extraction",
        "error_count":
            len(errors),
        "warning_count":
            len(warnings),
        "errors":
            errors,
        "warnings":
            warnings,
        "calculations":
            calculations,
        "data":
            data,
    }


# ============================================================
# VALIDATION TEIF XML
# ============================================================

@app.post("/validate-teif")
def validate_teif(payload: Dict[str, Any]):
    errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []

    xml = (
        payload.get("xml")
        or payload.get("xml_content")
    )

    if is_empty(xml):
        add_error(
            errors,
            "xml",
            "XML TEIF manquant",
            code="TEIF_XML_MISSING",
        )

        return {
            "valid": False,
            "is_valid": False,
            "stage": "teif_xml",
            "error_count": len(errors),
            "warning_count": len(warnings),
            "errors": errors,
            "warnings": warnings,
        }

    try:
        root = etree_from_string(xml)

    except Exception as exc:
        add_error(
            errors,
            "xml",
            f"XML invalide : {exc}",
            code="TEIF_XML_INVALID",
        )

        return {
            "valid": False,
            "is_valid": False,
            "stage": "teif_xml",
            "error_count": len(errors),
            "warning_count": len(warnings),
            "errors": errors,
            "warnings": warnings,
        }

    root_name = root.tag.split("}")[-1]

    if root_name != "TEIF":
        add_error(
            errors,
            "TEIF",
            "Racine TEIF manquante",
            actual=root_name,
            expected="TEIF",
            code="TEIF_ROOT_INVALID",
        )

    required_elements = [
        "InvoiceHeader",
        "MessageSenderIdentifier",
        "MessageRecieverIdentifier",
        "InvoiceBody",
        "Bgm",
        "DocumentIdentifier",
        "DocumentType",
    ]

    for element_name in required_elements:
        matches = root.xpath(
            (
                ".//*[local-name()="
                f"'{element_name}']"
            )
        )

        if not matches:
            add_error(
                errors,
                element_name,
                (
                    "Élément obligatoire manquant : "
                    f"{element_name}"
                ),
                code=(
                    "TEIF_REQUIRED_"
                    "ELEMENT_MISSING"
                ),
            )

    valid = len(errors) == 0

    return {
        "valid": valid,
        "is_valid": valid,
        "stage": "teif_xml",
        "error_count": len(errors),
        "warning_count": len(warnings),
        "errors": errors,
        "warnings": warnings,
        "xml": xml,
    }


# ============================================================
# VALIDATION XML SIGNÉ
# ============================================================

@app.post("/validate-signed-xml")
def validate_signed_xml(
    payload: Dict[str, Any],
):
    errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []

    xml = (
        payload.get("xml")
        or payload.get("signed_xml")
    )

    if is_empty(xml):
        add_error(
            errors,
            "signed_xml",
            "XML signé manquant",
            code="SIGNED_XML_MISSING",
        )

        return {
            "valid": False,
            "is_valid": False,
            "stage": "signed_xml",
            "error_count": len(errors),
            "warning_count": len(warnings),
            "errors": errors,
            "warnings": warnings,
        }

    try:
        root = etree_from_string(xml)

    except Exception as exc:
        add_error(
            errors,
            "signed_xml",
            f"XML signé invalide : {exc}",
            code="SIGNED_XML_INVALID",
        )

        return {
            "valid": False,
            "is_valid": False,
            "stage": "signed_xml",
            "error_count": len(errors),
            "warning_count": len(warnings),
            "errors": errors,
            "warnings": warnings,
        }

    ns = {
        "ds":
            "http://www.w3.org/2000/09/xmldsig#",
        "xades":
            "http://uri.etsi.org/01903/v1.3.2#",
    }

    required_xpaths = [
        ".//ds:Signature",
        ".//ds:SignedInfo",
        ".//ds:SignatureValue",
        ".//ds:KeyInfo",
        ".//ds:X509Certificate",
        ".//xades:QualifyingProperties",
        ".//xades:SignedProperties",
        (
            ".//xades:"
            "SignedSignatureProperties"
        ),
        ".//xades:SigningTime",
        ".//xades:SigningCertificateV2",
        (
            ".//xades:"
            "SignedDataObjectProperties"
        ),
        ".//xades:DataObjectFormat",
    ]

    for xpath in required_xpaths:
        if not root.xpath(
            xpath,
            namespaces=ns,
        ):
            add_error(
                errors,
                xpath,
                (
                    "Élément signature "
                    "obligatoire manquant : "
                    f"{xpath}"
                ),
                code="SIGNATURE_ELEMENT_MISSING",
            )

    references = root.xpath(
        ".//ds:SignedInfo/ds:Reference",
        namespaces=ns,
    )

    if len(references) < 2:
        add_error(
            errors,
            "ds:Reference",
            (
                "La signature doit contenir au "
                "moins deux références : "
                "document et SignedProperties"
            ),
            actual=len(references),
            expected=2,
            code="SIGNATURE_REFERENCES_MISSING",
            value_type="number",
        )

    has_signed_properties_reference = any(
        reference.get("Type", "")
        in {
            (
                "http://uri.etsi.org/"
                "01903#SignedProperties"
            ),
            (
                "http://uri.etsi.org/"
                "01903/v1.3.2#SignedProperties"
            ),
        }
        for reference in references
    )

    if not has_signed_properties_reference:
        add_error(
            errors,
            "SignedProperties Reference",
            (
                "Référence SignedProperties "
                "avec Type XAdES manquante"
            ),
            code=(
                "SIGNED_PROPERTIES_"
                "REFERENCE_MISSING"
            ),
        )

    valid = len(errors) == 0

    return {
        "valid": valid,
        "is_valid": valid,
        "stage": "signed_xml",
        "error_count": len(errors),
        "warning_count": len(warnings),
        "errors": errors,
        "warnings": warnings,
        "xml": xml,
    }


# ============================================================
# COMPATIBILITÉ
# ============================================================

@app.post("/validate")
def validate(data: Dict[str, Any]):
    return validate_json(data)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "validationservice",
    }


def etree_from_string(xml: str):
    from lxml import etree

    parser = etree.XMLParser(
        remove_blank_text=False,
        resolve_entities=False,
        no_network=True,
    )

    return etree.fromstring(
        str(xml).encode("utf-8"),
        parser=parser,
    )