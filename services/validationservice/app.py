from fastapi import FastAPI
from typing import Dict, Any, List
import re
from datetime import datetime

app = FastAPI(title="validationservice")


# ============================================================
# UTILS
# ============================================================

def normalize_number(value) -> float:
    """
    Convertit :
    - "100 EUR" -> 100.0
    - "20.0 %" -> 20.0
    - "1 234,50 EUR" -> 1234.5
    - 100 -> 100.0
    """
    if value is None:
        return 0.0

    if isinstance(value, bool):
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
    except (TypeError, ValueError):
        return 0.0


def is_empty(value) -> bool:
    if value is None:
        return True

    if isinstance(value, str):
        return value.strip() == ""

    return False


def valid_date(value: str) -> bool:
    """
    Accepte :
    - dd/mm/yyyy
    - yyyy-mm-dd
    - dd-mm-yyyy
    """
    if is_empty(value):
        return False

    value = str(value).strip()

    formats = [
        "%d/%m/%Y",
        "%Y-%m-%d",
        "%d-%m-%Y",
    ]

    for fmt in formats:
        try:
            datetime.strptime(value, fmt)
            return True
        except ValueError:
            continue

    return False


def add_error(errors: List[Dict], field: str, message: str):
    errors.append({
        "field": field,
        "message": message,
    })


def add_warning(warnings: List[Dict], field: str, message: str):
    warnings.append({
        "field": field,
        "message": message,
    })


def ensure_dict(value) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value

    return {}


def ensure_list(value) -> List[Any]:
    if isinstance(value, list):
        return value

    if isinstance(value, dict):
        return [value]

    return []


# ============================================================
# VALIDATION JSON EXTRACTION
# ============================================================

@app.post("/validate-json")
def validate_json(data: Dict[str, Any]):
    """
    Valide le JSON issu de l'extraction.

    Schéma principal recommandé :
    {
        "document": {},
        "fournisseur": {},
        "client": {},
        "lignes": [],
        "totaux": {}
    }

    Compatibilité conservée avec :
    - facture.numero
    - facture.date_facture
    - lignes_facture
    """

    errors: List[Dict] = []
    warnings: List[Dict] = []

    # n8n peut envoyer directement l'objet ou {"data": objet}
    if isinstance(data.get("data"), dict):
        data = data["data"]

    document = ensure_dict(data.get("document"))
    fournisseur = ensure_dict(data.get("fournisseur"))
    client = ensure_dict(data.get("client"))
    facture = ensure_dict(data.get("facture"))
    totaux = ensure_dict(data.get("totaux"))
    controle = ensure_dict(data.get("controle_validation"))

    # Schéma principal : lignes
    # Ancienne compatibilité : lignes_facture
    lignes_source = data.get("lignes")

    if not isinstance(lignes_source, list):
        lignes_source = data.get("lignes_facture")

    lignes = ensure_list(lignes_source)

    # Schéma principal document
    # Compatibilité avec l'ancien objet facture
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

    # ========================================================
    # DOCUMENT
    # ========================================================

    if is_empty(document.get("type_document")):
        add_error(
            errors,
            "document.type_document",
            "Type document manquant",
        )

    if is_empty(document.get("code_type_document")):
        add_error(
            errors,
            "document.code_type_document",
            "Code type document manquant",
        )

    if is_empty(document.get("devise")):
        add_error(
            errors,
            "document.devise",
            "Devise manquante",
        )

    if is_empty(numero_facture):
        add_error(
            errors,
            "document.numero",
            "Numéro facture manquant",
        )

    if is_empty(date_facture):
        add_error(
            errors,
            "document.date",
            "Date facture manquante",
        )
    elif not valid_date(date_facture):
        add_error(
            errors,
            "document.date",
            "Format date facture invalide",
        )

    if (
        not is_empty(date_echeance)
        and not valid_date(date_echeance)
    ):
        add_warning(
            warnings,
            "document.date_echeance",
            "Format date échéance invalide",
        )

    # ========================================================
    # FOURNISSEUR
    # ========================================================

    if is_empty(fournisseur.get("nom")):
        add_error(
            errors,
            "fournisseur.nom",
            "Nom fournisseur manquant",
        )

    fournisseur_identifiant = (
        fournisseur.get("identifiant")
        or fournisseur.get("matricule_fiscal_ou_tva")
        or fournisseur.get("numero_fournisseur")
        or fournisseur.get("siret")
    )

    if is_empty(fournisseur_identifiant):
        add_error(
            errors,
            "fournisseur.identifiant",
            "Identifiant fournisseur manquant",
        )

    if is_empty(fournisseur.get("type_identifiant")):
        add_error(
            errors,
            "fournisseur.type_identifiant",
            "Type identifiant fournisseur manquant",
        )

    if is_empty(fournisseur.get("pays")):
        add_warning(
            warnings,
            "fournisseur.pays",
            "Pays fournisseur manquant",
        )

    # ========================================================
    # CLIENT
    # ========================================================

    if is_empty(client.get("nom")):
        add_error(
            errors,
            "client.nom",
            "Nom client manquant",
        )

    client_identifiant = (
        client.get("identifiant")
        or client.get("code_client")
        or client.get("matricule_fiscal_ou_tva")
        or client.get("siret")
    )

    if is_empty(client_identifiant):
        add_error(
            errors,
            "client.identifiant",
            "Identifiant ou code client manquant",
        )

    if is_empty(client.get("type_identifiant")):
        add_error(
            errors,
            "client.type_identifiant",
            "Type identifiant client manquant",
        )

    if is_empty(client.get("pays")):
        add_warning(
            warnings,
            "client.pays",
            "Pays client manquant",
        )

    # ========================================================
    # LIGNES
    # ========================================================

    somme_lignes_ht = 0.0

    if not lignes:
        add_error(
            errors,
            "lignes",
            "Aucune ligne facture détectée",
        )
    else:
        for index, ligne in enumerate(lignes):
            # Utilisation d'un index JavaScript/Python classique :
            # lignes[0], lignes[1], ...
            prefix = f"lignes[{index}]"

            if not isinstance(ligne, dict):
                add_error(
                    errors,
                    prefix,
                    "La ligne doit être un objet JSON",
                )
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
                )

            quantite = normalize_number(
                ligne.get("quantite")
            )

            prix_unitaire = normalize_number(
                ligne.get(
                    "prix_unitaire_num",
                    ligne.get("prix_unitaire"),
                )
            )

            remise = normalize_number(
                ligne.get(
                    "remise_num",
                    ligne.get("remise"),
                )
            )

            montant_ht = normalize_number(
                ligne.get(
                    "montant_ht_num",
                    ligne.get("montant_ht"),
                )
            )

            taux_tva = normalize_number(
                ligne.get(
                    "taux_tva_num",
                    ligne.get("taux_tva"),
                )
            )

            if quantite <= 0:
                add_error(
                    errors,
                    f"{prefix}.quantite",
                    "Quantité invalide",
                )

            if prix_unitaire < 0:
                add_error(
                    errors,
                    f"{prefix}.prix_unitaire",
                    "Prix unitaire invalide",
                )

            if remise < 0 or remise > 100:
                add_error(
                    errors,
                    f"{prefix}.remise",
                    "La remise doit être comprise entre 0 et 100 %",
                )

            if montant_ht < 0:
                add_error(
                    errors,
                    f"{prefix}.montant_ht",
                    "Montant HT ligne invalide",
                )

            if taux_tva < 0:
                add_error(
                    errors,
                    f"{prefix}.taux_tva",
                    "Taux TVA invalide",
                )

            # Calcul avec remise
            if quantite > 0 and prix_unitaire >= 0:
                montant_attendu = round(
                    quantite
                    * prix_unitaire
                    * (1 - remise / 100),
                    3,
                )

                # Une remise de 100 % produit correctement un montant de 0
                if abs(montant_attendu - montant_ht) > 0.5:
                    add_warning(
                        warnings,
                        f"{prefix}.montant_ht",
                        (
                            "Montant ligne incohérent : "
                            f"attendu {montant_attendu}, "
                            f"trouvé {montant_ht}"
                        ),
                    )

            somme_lignes_ht += montant_ht

    # ========================================================
    # TOTAUX
    # ========================================================

    total_ht = normalize_number(
        totaux.get("total_ht")
    )

    base_tva = normalize_number(
        totaux.get("base_tva")
    )

    montant_tva = normalize_number(
        totaux.get("montant_tva")
    )

    total_ttc = normalize_number(
        totaux.get("total_ttc")
    )

    net_a_payer = normalize_number(
        totaux.get("net_a_payer")
    )

    timbre_fiscal = normalize_number(
        totaux.get("timbre_fiscal")
    )

    frais_port_non_soumis = normalize_number(
        totaux.get("frais_port_non_soumis")
    )

    frais_port_soumis = normalize_number(
        totaux.get("frais_port_soumis")
    )

    taxes_cpl = normalize_number(
        totaux.get("taxes_cpl")
    )

    if total_ht <= 0:
        add_error(
            errors,
            "totaux.total_ht",
            "Total HT manquant ou invalide",
        )

    if total_ttc <= 0:
        add_error(
            errors,
            "totaux.total_ttc",
            "Total TTC manquant ou invalide",
        )

    if montant_tva < 0:
        add_error(
            errors,
            "totaux.montant_tva",
            "Montant TVA invalide",
        )

    # Total TTC attendu :
    # HT + TVA + timbre + frais non soumis + autres taxes
    if total_ht > 0 and total_ttc > 0:
        expected_ttc = round(
            total_ht
            + montant_tva
            + timbre_fiscal
            + frais_port_non_soumis
            + frais_port_soumis
            + taxes_cpl,
            3,
        )

        if abs(expected_ttc - total_ttc) > 1.0:
            add_warning(
                warnings,
                "totaux.total_ttc",
                (
                    "Le total TTC est incohérent : "
                    f"attendu {expected_ttc}, "
                    f"trouvé {total_ttc}"
                ),
            )

    if net_a_payer > 0 and total_ttc > 0:
        if abs(net_a_payer - total_ttc) > 1.0:
            add_warning(
                warnings,
                "totaux.net_a_payer",
                (
                    "Net à payer différent du TTC : "
                    f"net {net_a_payer}, "
                    f"TTC {total_ttc}"
                ),
            )

    if lignes and total_ht > 0:
        somme_lignes_ht = round(somme_lignes_ht, 3)

        if abs(somme_lignes_ht - total_ht) > 1.0:
            add_warning(
                warnings,
                "totaux.total_ht",
                (
                    "Somme des lignes HT différente du total HT : "
                    f"lignes {somme_lignes_ht}, "
                    f"total {total_ht}"
                ),
            )

    if base_tva > 0 and total_ht > 0:
        if abs(base_tva - total_ht) > 1.0:
            add_warning(
                warnings,
                "totaux.base_tva",
                (
                    "Base TVA différente du total HT : "
                    f"base TVA {base_tva}, "
                    f"total HT {total_ht}"
                ),
            )

    # ========================================================
    # CONTROLE EXTRACTION
    # ========================================================

    if controle:
        if controle.get("peut_generer_teif") is False:
            add_error(
                errors,
                "controle_validation.peut_generer_teif",
                "Extraction indique que TEIF ne peut pas être généré",
            )

        for err in controle.get("erreurs_bloquantes", []):
            add_error(
                errors,
                "controle_validation.erreurs_bloquantes",
                str(err),
            )

        for warning in controle.get("avertissements", []):
            add_warning(
                warnings,
                "controle_validation.avertissements",
                str(warning),
            )

    valid = len(errors) == 0

    return {
        "valid": valid,
        "is_valid": valid,
        "stage": "json_extraction",
        "error_count": len(errors),
        "warning_count": len(warnings),
        "errors": errors,
        "warnings": warnings,
        "data": data,
    }


# ============================================================
# VALIDATION TEIF XML
# ============================================================

@app.post("/validate-teif")
def validate_teif(payload: Dict[str, Any]):
    errors: List[Dict] = []
    warnings: List[Dict] = []

    xml = (
        payload.get("xml")
        or payload.get("xml_content")
    )

    if is_empty(xml):
        add_error(
            errors,
            "xml",
            "XML TEIF manquant",
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

    # Compatible avec ou sans namespace
    root_name = root.tag.split("}")[-1]

    if root_name != "TEIF":
        add_error(
            errors,
            "TEIF",
            "Racine TEIF manquante",
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
            f".//*[local-name()='{element_name}']"
        )

        if not matches:
            add_error(
                errors,
                element_name,
                (
                    "Élément obligatoire manquant : "
                    f"{element_name}"
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
# VALIDATION XML SIGNE
# ============================================================

@app.post("/validate-signed-xml")
def validate_signed_xml(payload: Dict[str, Any]):
    errors: List[Dict] = []
    warnings: List[Dict] = []

    xml = (
        payload.get("xml")
        or payload.get("signed_xml")
    )

    if is_empty(xml):
        add_error(
            errors,
            "signed_xml",
            "XML signé manquant",
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
        "ds": "http://www.w3.org/2000/09/xmldsig#",
        "xades": "http://uri.etsi.org/01903/v1.3.2#",
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

    for xpath in required_xpaths:
        if not root.xpath(xpath, namespaces=ns):
            add_error(
                errors,
                xpath,
                (
                    "Élément signature obligatoire manquant : "
                    f"{xpath}"
                ),
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
                "La signature doit contenir au moins deux "
                "références : document et SignedProperties"
            ),
        )

    has_signed_properties_reference = any(
        reference.get("Type", "")
        in {
            "http://uri.etsi.org/01903#SignedProperties",
            "http://uri.etsi.org/01903/v1.3.2#SignedProperties",
        }
        for reference in references
    )

    if not has_signed_properties_reference:
        add_error(
            errors,
            "SignedProperties Reference",
            (
                "Référence SignedProperties avec Type XAdES "
                "manquante"
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
# COMPATIBILITE
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