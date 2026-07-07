from fastapi import FastAPI
from typing import Dict, Any, List
import re
from datetime import datetime

app = FastAPI(title="validationservice")


# =========================
# UTILS
# =========================

def normalize_number(value) -> float:
    """
    Convertit:
    - "100 EUR" -> 100.0
    - "20.0 %" -> 20.0
    - "1 234,50 EUR" -> 1234.5
    - 100 -> 100.0
    """
    if value is None:
        return 0.0

    if isinstance(value, (int, float)):
        return float(value)

    value = str(value).strip()
    value = value.replace("\u00a0", " ")
    value = value.replace(" ", "")
    value = value.replace(",", ".")

    value = re.sub(r"[^0-9.\-]", "", value)

    try:
        return float(value)
    except:
        return 0.0


def is_empty(value) -> bool:
    return value is None or str(value).strip() == ""


def valid_date(value: str) -> bool:
    """
    Accepte dd/mm/yyyy ou yyyy-mm-dd.
    """
    if is_empty(value):
        return False

    value = str(value).strip()

    formats = ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"]

    for fmt in formats:
        try:
            datetime.strptime(value, fmt)
            return True
        except:
            pass

    return False


def add_error(errors: List[Dict], field: str, message: str):
    errors.append({
        "field": field,
        "message": message
    })


def add_warning(warnings: List[Dict], field: str, message: str):
    warnings.append({
        "field": field,
        "message": message
    })


# =========================
# VALIDATION JSON EXTRACTION
# =========================

@app.post("/validate-json")
def validate_json(data: Dict[str, Any]):
    """
    Valide le JSON issu du node Extraction.
    Compatible avec:
    fournisseur, client, facture, lignes_facture, totaux
    """

    errors = []
    warnings = []

    # n8n peut envoyer directement l'objet ou { "data": objet }
    if "data" in data and isinstance(data["data"], dict):
        data = data["data"]

    document = data.get("document", {})
    fournisseur = data.get("fournisseur", {})
    client = data.get("client", {})
    facture = data.get("facture", {})
    lignes = data.get("lignes_facture", [])
    totaux = data.get("totaux", {})
    controle = data.get("controle_validation", {})

    # =========================
    # DOCUMENT
    # =========================

    if is_empty(document.get("type_document")):
        add_error(errors, "document.type_document", "Type document manquant")

    if is_empty(document.get("code_type_document")):
        add_error(errors, "document.code_type_document", "Code type document manquant")

    if is_empty(document.get("devise")):
        add_error(errors, "document.devise", "Devise manquante")

    # =========================
    # FOURNISSEUR
    # =========================

    if is_empty(fournisseur.get("nom")):
        add_error(errors, "fournisseur.nom", "Nom fournisseur manquant")

    if is_empty(fournisseur.get("identifiant")):
        add_error(errors, "fournisseur.identifiant", "Identifiant fournisseur manquant")

    if is_empty(fournisseur.get("type_identifiant")):
        add_error(errors, "fournisseur.type_identifiant", "Type identifiant fournisseur manquant")

    if is_empty(fournisseur.get("pays")):
        add_warning(warnings, "fournisseur.pays", "Pays fournisseur manquant")

    # =========================
    # CLIENT
    # =========================

    if is_empty(client.get("nom")):
        add_error(errors, "client.nom", "Nom client manquant")

    if is_empty(client.get("identifiant")) and is_empty(client.get("code_client")):
        add_error(errors, "client.identifiant", "Identifiant ou code client manquant")

    if is_empty(client.get("type_identifiant")):
        add_error(errors, "client.type_identifiant", "Type identifiant client manquant")

    if is_empty(client.get("pays")):
        add_warning(warnings, "client.pays", "Pays client manquant")

    # =========================
    # FACTURE
    # =========================

    if is_empty(facture.get("numero")):
        add_error(errors, "facture.numero", "Numéro facture manquant")

    if is_empty(facture.get("date_facture")):
        add_error(errors, "facture.date_facture", "Date facture manquante")
    elif not valid_date(facture.get("date_facture")):
        add_error(errors, "facture.date_facture", "Format date facture invalide")

    if not is_empty(facture.get("date_echeance")) and not valid_date(facture.get("date_echeance")):
        add_warning(warnings, "facture.date_echeance", "Format date échéance invalide")

    # =========================
    # LIGNES
    # =========================

    if not lignes:
        add_error(errors, "lignes_facture", "Aucune ligne facture détectée")
    else:
        somme_lignes_ht = 0.0

        for i, ligne in enumerate(lignes, start=1):
            prefix = f"lignes_facture[{i}]"

            if is_empty(ligne.get("designation")):
                add_error(errors, f"{prefix}.designation", "Désignation manquante")

            quantite = normalize_number(ligne.get("quantite"))
            prix_unitaire = normalize_number(
                ligne.get("prix_unitaire_num", ligne.get("prix_unitaire"))
            )
            montant_ht = normalize_number(
                ligne.get("montant_ht_num", ligne.get("montant_ht"))
            )
            taux_tva = normalize_number(
                ligne.get("taux_tva_num", ligne.get("taux_tva"))
            )

            if quantite <= 0:
                add_error(errors, f"{prefix}.quantite", "Quantité invalide")

            if prix_unitaire <= 0:
                add_error(errors, f"{prefix}.prix_unitaire", "Prix unitaire invalide")

            if montant_ht <= 0:
                add_error(errors, f"{prefix}.montant_ht", "Montant HT ligne invalide")

            if taux_tva < 0:
                add_error(errors, f"{prefix}.taux_tva", "Taux TVA invalide")

            # Calcul ligne simple : quantité x prix
            # On tolère les cas avec remise car les remises peuvent être complexes.
            computed = round(quantite * prix_unitaire, 2)

            remises = ligne.get("remises", [])
            has_remise = bool(remises)

            if not has_remise and quantite > 0 and prix_unitaire > 0 and montant_ht > 0:
                if abs(computed - montant_ht) > 0.5:
                    add_warning(
                        warnings,
                        f"{prefix}.montant_ht",
                        f"Montant ligne suspect: attendu {computed}, trouvé {montant_ht}"
                    )

            somme_lignes_ht += montant_ht

    # =========================
    # TOTAUX
    # =========================

    total_ht = normalize_number(totaux.get("total_ht"))
    base_tva = normalize_number(totaux.get("base_tva"))
    montant_tva = normalize_number(totaux.get("montant_tva"))
    total_ttc = normalize_number(totaux.get("total_ttc"))
    net_a_payer = normalize_number(totaux.get("net_a_payer"))

    if total_ht <= 0:
        add_error(errors, "totaux.total_ht", "Total HT manquant ou invalide")

    if total_ttc <= 0:
        add_error(errors, "totaux.total_ttc", "Total TTC manquant ou invalide")

    if montant_tva < 0:
        add_error(errors, "totaux.montant_tva", "Montant TVA invalide")

    if total_ht > 0 and montant_tva >= 0 and total_ttc > 0:
        expected_ttc = round(total_ht + montant_tva, 2)

        if abs(expected_ttc - total_ttc) > 1.0:
            add_warning(
                warnings,
                "totaux.total_ttc",
                f"HT + TVA ne correspond pas au TTC: attendu {expected_ttc}, trouvé {total_ttc}"
            )

    if net_a_payer > 0 and total_ttc > 0:
        if abs(net_a_payer - total_ttc) > 1.0:
            add_warning(
                warnings,
                "totaux.net_a_payer",
                f"Net à payer différent du TTC: net {net_a_payer}, TTC {total_ttc}"
            )

    if lignes:
        somme_lignes_ht = round(sum(
            normalize_number(l.get("montant_ht_num", l.get("montant_ht")))
            for l in lignes
        ), 2)

        if total_ht > 0 and abs(somme_lignes_ht - total_ht) > 1.0:
            add_warning(
                warnings,
                "totaux.total_ht",
                f"Somme lignes HT différente du total HT: lignes {somme_lignes_ht}, total {total_ht}"
            )

    # =========================
    # CONTROLE EXTRACTION
    # =========================

    if controle:
        if controle.get("peut_generer_teif") is False:
            add_error(errors, "controle_validation.peut_generer_teif", "Extraction indique que TEIF ne peut pas être généré")

        for err in controle.get("erreurs_bloquantes", []):
            add_error(errors, "controle_validation.erreurs_bloquantes", str(err))

        for warn in controle.get("avertissements", []):
            add_warning(warnings, "controle_validation.avertissements", str(warn))

    valid = len(errors) == 0

    return {
        "valid": valid,
        "is_valid": valid,
        "stage": "json_extraction",
        "error_count": len(errors),
        "warning_count": len(warnings),
        "errors": errors,
        "warnings": warnings,
        "data": data
    }


# =========================
# VALIDATION TEIF XML
# =========================

@app.post("/validate-teif")
def validate_teif(payload: Dict[str, Any]):
    errors = []
    warnings = []

    xml = payload.get("xml") or payload.get("xml_content")

    if is_empty(xml):
        add_error(errors, "xml", "XML TEIF manquant")
        return {
            "valid": False,
            "stage": "teif_xml",
            "errors": errors,
            "warnings": warnings
        }

    try:
        root = etree_from_string(xml)
    except Exception as e:
        add_error(errors, "xml", f"XML invalide: {e}")
        return {
            "valid": False,
            "stage": "teif_xml",
            "errors": errors,
            "warnings": warnings
        }

    if root.tag != "TEIF":
        add_error(errors, "TEIF", "Racine TEIF manquante")

    required_paths = [
        ".//InvoiceHeader",
        ".//MessageSenderIdentifier",
        ".//MessageRecieverIdentifier",
        ".//InvoiceBody",
        ".//Bgm",
        ".//DocumentIdentifier",
        ".//DocumentType",
    ]

    for path in required_paths:
        if root.find(path) is None:
            add_error(errors, path, f"Élément obligatoire manquant: {path}")

    return {
        "valid": len(errors) == 0,
        "stage": "teif_xml",
        "error_count": len(errors),
        "warning_count": len(warnings),
        "errors": errors,
        "warnings": warnings,
        "xml": xml
    }


# =========================
# VALIDATION SIGNED XML
# =========================

@app.post("/validate-signed-xml")
def validate_signed_xml(payload: Dict[str, Any]):
    errors = []
    warnings = []

    xml = payload.get("xml") or payload.get("signed_xml")

    if is_empty(xml):
        add_error(errors, "signed_xml", "XML signé manquant")
        return {
            "valid": False,
            "stage": "signed_xml",
            "errors": errors,
            "warnings": warnings
        }

    try:
        root = etree_from_string(xml)
    except Exception as e:
        add_error(errors, "signed_xml", f"XML signé invalide: {e}")
        return {
            "valid": False,
            "stage": "signed_xml",
            "errors": errors,
            "warnings": warnings
        }

    ns = {
        "ds": "http://www.w3.org/2000/09/xmldsig#",
        "xades": "http://uri.etsi.org/01903/v1.3.2#"
    }

    required_xpaths = [
        ".//ds:Signature",
        ".//ds:SignedInfo",
        ".//ds:SignatureValue",
        ".//ds:KeyInfo",
        ".//ds:X509Certificate",
        ".//xades:QualifyingProperties",
        ".//xades:SignedProperties",
        ".//xades:SignedSignatureProperties",
        ".//xades:SigningTime",
        ".//xades:SigningCertificateV2",
        ".//xades:SignedDataObjectProperties",
        ".//xades:DataObjectFormat",
    ]

    for xp in required_xpaths:
        if root.xpath(xp, namespaces=ns) == []:
            add_error(errors, xp, f"Élément signature obligatoire manquant: {xp}")

    references = root.xpath(".//ds:SignedInfo/ds:Reference", namespaces=ns)

    if len(references) < 2:
        add_error(errors, "ds:Reference", "La signature doit contenir au moins 2 références: SignedProperties et document")

    has_signed_props_ref = False
    for ref in references:
        ref_type = ref.get("Type", "")
        if ref_type == "http://uri.etsi.org/01903#SignedProperties":
            has_signed_props_ref = True

    if not has_signed_props_ref:
        add_error(errors, "SignedProperties Reference", "Référence SignedProperties avec Type XAdES manquante")

    return {
        "valid": len(errors) == 0,
        "stage": "signed_xml",
        "error_count": len(errors),
        "warning_count": len(warnings),
        "errors": errors,
        "warnings": warnings,
        "xml": xml
    }


# =========================
# BACKWARD COMPATIBILITY
# =========================

@app.post("/validate")
def validate(data: Dict[str, Any]):
    """
    Ancienne route gardée pour compatibilité.
    Elle appelle validate-json.
    """
    return validate_json(data)


@app.get("/health")
def health():
    return {"status": "ok", "service": "validationservice"}


def etree_from_string(xml: str):
    from lxml import etree
    parser = etree.XMLParser(remove_blank_text=False)
    return etree.fromstring(xml.encode("utf-8"), parser=parser)