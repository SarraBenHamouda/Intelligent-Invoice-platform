
import base64
import hashlib
import threading
import uuid
from datetime import datetime, timezone
from typing import Optional

import requests
from fastapi import FastAPI, HTTPException
from lxml import etree
from pydantic import BaseModel


# ============================================================
# APPLICATION
# ============================================================

app = FastAPI(
    title="signature-api-xades",
    version="2.0.0"
)


# ============================================================
# CONFIGURATION NEXU
# ============================================================

# Utilisez cette adresse si l'API Python fonctionne directement
# sur Windows, comme NexU.
NEXU_URL = "http://127.0.0.1:9795"

# Si l'API Python fonctionne dans Docker et NexU sur Windows,
# utilisez plutôt :
# NEXU_URL = "http://host.docker.internal:9795"


# ============================================================
# NAMESPACES XMLDSIG / XADES
# ============================================================

DS_NS = "http://www.w3.org/2000/09/xmldsig#"
XADES_NS = "http://uri.etsi.org/01903/v1.3.2#"

NSMAP_DS = {
    "ds": DS_NS,
    "xades": XADES_NS,
}

C14N_ALGO = (
    "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
)

ENVELOPED_ALGO = (
    "http://www.w3.org/2000/09/xmldsig#enveloped-signature"
)

RSA_SHA256_ALGO = (
    "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"
)

SHA256_ALGO = (
    "http://www.w3.org/2001/04/xmlenc#sha256"
)

SIGNED_PROPERTIES_TYPE = (
    "http://uri.etsi.org/01903#SignedProperties"
)


# ============================================================
# MODELES
# ============================================================

class SignBytesRequest(BaseModel):
    bytes_base64: str


class SignXmlRequest(BaseModel):
    xml: str


# ============================================================
# SESSION GLOBALE DE LA CLE USB
# ============================================================

# Ces variables mémorisent uniquement :
# - tokenId
# - keyId
# - certificat public
# - chaîne de certificats
#
# Le code PIN n'est jamais stocké dans cette API.

CERTIFICATE_SESSION = None
SIGNATURE_COUNT = 0
SESSION_CREATED_AT = None
SESSION_LAST_USED_AT = None

# Le verrou évite que deux factures essaient de signer exactement
# au même moment avec la même clé USB.
SIGNATURE_LOCK = threading.RLock()


# ============================================================
# OUTILS XML
# ============================================================

def ds(tag: str) -> str:
    return f"{{{DS_NS}}}{tag}"


def xades(tag: str) -> str:
    return f"{{{XADES_NS}}}{tag}"


def b64_sha256(data: bytes) -> str:
    digest = hashlib.sha256(data).digest()
    return base64.b64encode(digest).decode("ascii")


def canonicalize(element) -> bytes:
    return etree.tostring(
        element,
        method="c14n",
        exclusive=False,
        with_comments=False
    )


def clean_certificate_base64(value: str) -> str:
    """
    Nettoie le certificat si NexU le retourne au format PEM.
    """

    if not value:
        return ""

    return (
        value
        .replace("-----BEGIN CERTIFICATE-----", "")
        .replace("-----END CERTIFICATE-----", "")
        .replace("\r", "")
        .replace("\n", "")
        .replace(" ", "")
        .strip()
    )


def add_digest_method(parent):
    element = etree.SubElement(
        parent,
        ds("DigestMethod")
    )

    element.set(
        "Algorithm",
        SHA256_ALGO
    )

    return element


def add_digest_value(parent, value: str):
    element = etree.SubElement(
        parent,
        ds("DigestValue")
    )

    element.text = value

    return element


def build_reference(
    uri: str,
    digest_value: str,
    transforms=None,
    ref_type: Optional[str] = None,
    ref_id: Optional[str] = None
):
    reference = etree.Element(
        ds("Reference")
    )

    if ref_id:
        reference.set(
            "Id",
            ref_id
        )

    reference.set(
        "URI",
        uri
    )

    if ref_type:
        reference.set(
            "Type",
            ref_type
        )

    if transforms:
        transforms_element = etree.SubElement(
            reference,
            ds("Transforms")
        )

        for algorithm in transforms:
            transform_element = etree.SubElement(
                transforms_element,
                ds("Transform")
            )

            transform_element.set(
                "Algorithm",
                algorithm
            )

    add_digest_method(reference)
    add_digest_value(reference, digest_value)

    return reference


# ============================================================
# OUTILS HTTP NEXU
# ============================================================

def read_nexu_json(response: requests.Response):
    """
    Lit et vérifie la réponse JSON de NexU.
    """

    try:
        return response.json()

    except ValueError:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "NexU a retourné une réponse non JSON.",
                "http_status": response.status_code,
                "response": response.text[:1000]
            }
        )


def reset_certificate_session():
    """
    Supprime les coordonnées mémorisées de la clé.
    """

    global CERTIFICATE_SESSION
    global SIGNATURE_COUNT
    global SESSION_CREATED_AT
    global SESSION_LAST_USED_AT

    with SIGNATURE_LOCK:
        CERTIFICATE_SESSION = None
        SIGNATURE_COUNT = 0
        SESSION_CREATED_AT = None
        SESSION_LAST_USED_AT = None


# ============================================================
# RECUPERATION ET CACHE DU CERTIFICAT
# ============================================================

def get_certificate(force_reload: bool = False):
    """
    Première facture :
    - appelle NexU ;
    - récupère tokenId, keyId et certificat ;
    - mémorise ces informations.

    Factures suivantes :
    - réutilise les informations déjà mémorisées ;
    - n'appelle plus /rest/certificates.

    Le PIN reste géré par NexU et le pilote du token.
    """

    global CERTIFICATE_SESSION
    global SESSION_CREATED_AT
    global SESSION_LAST_USED_AT

    with SIGNATURE_LOCK:
        if (
            CERTIFICATE_SESSION is not None
            and not force_reload
        ):
            SESSION_LAST_USED_AT = datetime.now(timezone.utc)
            return CERTIFICATE_SESSION

        try:
            response_http = requests.get(
                f"{NEXU_URL}/rest/certificates",
                timeout=60
            )

        except requests.ConnectionError as exc:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"Impossible de joindre NexU sur {NEXU_URL}. "
                    f"Vérifiez que NexU est lancé. "
                    f"Détail : {exc}"
                )
            )

        except requests.Timeout:
            raise HTTPException(
                status_code=504,
                detail=(
                    "NexU ne répond pas pendant la récupération "
                    "du certificat."
                )
            )

        except requests.RequestException as exc:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Erreur de communication avec NexU : "
                    f"{exc}"
                )
            )

        data = read_nexu_json(response_http)

        if not response_http.ok:
            raise HTTPException(
                status_code=502,
                detail={
                    "message": (
                        "NexU a retourné une erreur HTTP pendant "
                        "la récupération du certificat."
                    ),
                    "http_status": response_http.status_code,
                    "nexu_response": data
                }
            )

        if not data.get("success"):
            raise HTTPException(
                status_code=500,
                detail={
                    "message": (
                        "NexU n'a pas pu récupérer le certificat."
                    ),
                    "nexu_response": data
                }
            )

        nexu_response = data.get("response", {})

        token_id = nexu_response.get("tokenId")
        key_id = nexu_response.get("keyId")

        certificate = clean_certificate_base64(
            nexu_response.get("certificate", "")
        )

        if not token_id:
            raise HTTPException(
                status_code=500,
                detail=(
                    "La réponse NexU ne contient pas de tokenId."
                )
            )

        if not key_id:
            raise HTTPException(
                status_code=500,
                detail=(
                    "La réponse NexU ne contient pas de keyId."
                )
            )

        if not certificate:
            raise HTTPException(
                status_code=500,
                detail=(
                    "La réponse NexU ne contient pas de certificat."
                )
            )

        CERTIFICATE_SESSION = {
            "tokenId": token_id,
            "keyId": key_id,
            "certificate": certificate,
            "certificateChain": nexu_response.get(
                "certificateChain",
                []
            ),
            "encryptionAlgorithm": nexu_response.get(
                "encryptionAlgorithm",
                "RSA"
            ),
        }

        current_time = datetime.now(timezone.utc)

        SESSION_CREATED_AT = current_time
        SESSION_LAST_USED_AT = current_time

        return CERTIFICATE_SESSION


# ============================================================
# SIGNATURE AVEC NEXU
# ============================================================

def sign_with_nexu(
    bytes_base64: str,
    cert_info=None
):
    """
    Signe des données avec la clé USB via NexU.

    Le même tokenId et keyId sont réutilisés pour toutes les
    factures après la première.

    Le PIN n'est pas envoyé par cette API. NexU et le pilote
    de la clé décident si la session PIN reste ouverte.
    """

    global SIGNATURE_COUNT
    global SESSION_LAST_USED_AT

    if not bytes_base64:
        raise HTTPException(
            status_code=400,
            detail="Aucune donnée Base64 à signer."
        )

    if cert_info is None:
        cert_info = get_certificate()

    payload = {
        "tokenId": cert_info["tokenId"],
        "keyId": cert_info["keyId"],
        "toBeSigned": {
            "bytes": bytes_base64
        },
        "digestAlgorithm": "SHA256",
        "encryptionAlgorithm": cert_info.get(
            "encryptionAlgorithm",
            "RSA"
        )
    }

    try:
        with SIGNATURE_LOCK:
            response_http = requests.post(
                f"{NEXU_URL}/rest/sign",
                json=payload,
                timeout=180
            )

    except requests.ConnectionError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Impossible de joindre NexU sur {NEXU_URL}. "
                f"Détail : {exc}"
            )
        )

    except requests.Timeout:
        raise HTTPException(
            status_code=504,
            detail=(
                "La signature NexU a dépassé le délai autorisé. "
                "Vérifiez si une fenêtre PIN est ouverte."
            )
        )

    except requests.RequestException as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Erreur de communication pendant la signature : "
                f"{exc}"
            )
        )

    data = read_nexu_json(response_http)

    if not response_http.ok:
        raise HTTPException(
            status_code=502,
            detail={
                "message": (
                    "NexU a retourné une erreur HTTP pendant "
                    "la signature."
                ),
                "http_status": response_http.status_code,
                "nexu_response": data
            }
        )

    if not data.get("success"):
        raise HTTPException(
            status_code=500,
            detail={
                "message": "La signature NexU a échoué.",
                "nexu_response": data
            }
        )

    nexu_response = data.get("response", {})

    signature_value = nexu_response.get(
        "signatureValue"
    )

    if not signature_value:
        raise HTTPException(
            status_code=500,
            detail=(
                "NexU n'a retourné aucune valeur de signature."
            )
        )

    with SIGNATURE_LOCK:
        SIGNATURE_COUNT += 1
        SESSION_LAST_USED_AT = datetime.now(timezone.utc)

    return {
        "signatureValue": signature_value,
        "signatureAlgorithm": nexu_response.get(
            "signatureAlgorithm",
            RSA_SHA256_ALGO
        ),
        "certificate": clean_certificate_base64(
            nexu_response.get(
                "certificate",
                cert_info.get("certificate", "")
            )
        ),
        "certificateChain": nexu_response.get(
            "certificateChain",
            cert_info.get("certificateChain", [])
        ),
    }


# ============================================================
# CREATION DU XML XADES
# ============================================================

def create_xades_signed_xml(xml_string: str):
    """
    Crée une signature enveloppée XMLDSig avec propriétés XAdES.
    """

    if not xml_string or not xml_string.strip():
        raise HTTPException(
            status_code=400,
            detail="Le document XML est vide."
        )

    # Premier appel :
    # récupération du certificat via NexU.
    #
    # Appels suivants :
    # réutilisation du certificat mémorisé.
    cert_info = get_certificate()

    cert_b64 = clean_certificate_base64(
        cert_info["certificate"]
    )

    try:
        cert_der = base64.b64decode(
            cert_b64,
            validate=True
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Le certificat retourné par NexU n'est pas "
                f"un Base64 valide : {exc}"
            )
        )

    cert_digest = b64_sha256(
        cert_der
    )

    parser = etree.XMLParser(
        remove_blank_text=False,
        resolve_entities=False,
        no_network=True
    )

    try:
        root = etree.fromstring(
            xml_string.encode("utf-8"),
            parser=parser
        )

    except etree.XMLSyntaxError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"XML invalide : {exc}"
        )

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Impossible de lire le document XML : "
                f"{exc}"
            )
        )

    signature_id = (
        "SIG-" +
        uuid.uuid4().hex
    )

    key_info_id = (
        "KeyInfo-" +
        signature_id
    )

    signed_properties_id = (
        "SignedProperties-" +
        signature_id
    )

    document_reference_id = (
        "REF-DOC-" +
        signature_id
    )

    # Digest du document TEIF avant l'ajout de Signature.
    document_digest = b64_sha256(
        canonicalize(root)
    )

    # ========================================================
    # ds:Signature
    # ========================================================

    signature_element = etree.Element(
        ds("Signature"),
        nsmap=NSMAP_DS
    )

    signature_element.set(
        "Id",
        signature_id
    )

    # ========================================================
    # ds:SignedInfo
    # ========================================================

    signed_info_element = etree.SubElement(
        signature_element,
        ds("SignedInfo")
    )

    canonicalization_method = etree.SubElement(
        signed_info_element,
        ds("CanonicalizationMethod")
    )

    canonicalization_method.set(
        "Algorithm",
        C14N_ALGO
    )

    signature_method = etree.SubElement(
        signed_info_element,
        ds("SignatureMethod")
    )

    signature_method.set(
        "Algorithm",
        RSA_SHA256_ALGO
    )

    # ========================================================
    # ds:KeyInfo
    # ========================================================

    key_info_element = etree.SubElement(
        signature_element,
        ds("KeyInfo")
    )

    key_info_element.set(
        "Id",
        key_info_id
    )

    x509_data_element = etree.SubElement(
        key_info_element,
        ds("X509Data")
    )

    x509_certificate_element = etree.SubElement(
        x509_data_element,
        ds("X509Certificate")
    )

    x509_certificate_element.text = cert_b64

    # ========================================================
    # ds:Object et propriétés XAdES
    # ========================================================

    object_element = etree.SubElement(
        signature_element,
        ds("Object")
    )

    qualifying_properties = etree.SubElement(
        object_element,
        xades("QualifyingProperties")
    )

    qualifying_properties.set(
        "Target",
        "#" + signature_id
    )

    signed_properties = etree.SubElement(
        qualifying_properties,
        xades("SignedProperties")
    )

    signed_properties.set(
        "Id",
        signed_properties_id
    )

    # ========================================================
    # xades:SignedSignatureProperties
    # ========================================================

    signed_signature_properties = etree.SubElement(
        signed_properties,
        xades("SignedSignatureProperties")
    )

    signing_time = etree.SubElement(
        signed_signature_properties,
        xades("SigningTime")
    )

    signing_time.text = (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
    )

    signing_certificate_v2 = etree.SubElement(
        signed_signature_properties,
        xades("SigningCertificateV2")
    )

    cert_element = etree.SubElement(
        signing_certificate_v2,
        xades("Cert")
    )

    cert_digest_element = etree.SubElement(
        cert_element,
        xades("CertDigest")
    )

    digest_method = etree.SubElement(
        cert_digest_element,
        ds("DigestMethod")
    )

    digest_method.set(
        "Algorithm",
        SHA256_ALGO
    )

    digest_value = etree.SubElement(
        cert_digest_element,
        ds("DigestValue")
    )

    digest_value.text = cert_digest

    # ========================================================
    # xades:SignedDataObjectProperties
    # ========================================================

    signed_data_object_properties = etree.SubElement(
        signed_properties,
        xades("SignedDataObjectProperties")
    )

    data_object_format_document = etree.SubElement(
        signed_data_object_properties,
        xades("DataObjectFormat")
    )

    data_object_format_document.set(
        "ObjectReference",
        "#" + document_reference_id
    )

    mime_type_document = etree.SubElement(
        data_object_format_document,
        xades("MimeType")
    )

    mime_type_document.text = "text/xml"

    # ========================================================
    # Référence vers SignedProperties
    # ========================================================

    signed_properties_digest = b64_sha256(
        canonicalize(signed_properties)
    )

    signed_properties_reference = build_reference(
        uri="#" + signed_properties_id,
        digest_value=signed_properties_digest,
        transforms=[
            C14N_ALGO
        ],
        ref_type=SIGNED_PROPERTIES_TYPE
    )

    signed_info_element.append(
        signed_properties_reference
    )

    # ========================================================
    # Référence vers le document TEIF
    # ========================================================

    document_reference = build_reference(
        uri="",
        digest_value=document_digest,
        transforms=[
            ENVELOPED_ALGO,
            C14N_ALGO
        ],
        ref_id=document_reference_id
    )

    signed_info_element.append(
        document_reference
    )

    # ========================================================
    # Signature cryptographique de SignedInfo
    # ========================================================

    signed_info_c14n = canonicalize(
        signed_info_element
    )

    signed_info_base64 = base64.b64encode(
        signed_info_c14n
    ).decode("ascii")

    nexu_signature = sign_with_nexu(
        signed_info_base64,
        cert_info
    )

    signature_value_element = etree.Element(
        ds("SignatureValue")
    )

    signature_value_element.text = (
        nexu_signature["signatureValue"]
    )

    # SignatureValue doit être placé juste après SignedInfo.
    signed_info_element.addnext(
        signature_value_element
    )

    # Ajout de Signature à la fin du document TEIF.
    root.append(
        signature_element
    )

    signed_xml = etree.tostring(
        root,
        encoding="UTF-8",
        xml_declaration=True,
        pretty_print=False
    ).decode("utf-8")

    return signed_xml


# ============================================================
# ROUTES GENERALES
# ============================================================

@app.get("/")
def home():
    return {
        "service": "signature-api-xades",
        "version": "2.0.0",
        "status": "running",
        "documentation": "/docs"
    }


@app.get("/health")
def health():
    return {
        "service": "signature-api-xades",
        "status": "ok",
        "nexu_url": NEXU_URL,
        "session_active": CERTIFICATE_SESSION is not None,
        "signature_count": SIGNATURE_COUNT
    }


# ============================================================
# ROUTES DE SESSION
# ============================================================

@app.get("/session/status")
def session_status():
    return {
        "session_active": CERTIFICATE_SESSION is not None,
        "certificate_cached": CERTIFICATE_SESSION is not None,
        "signature_count": SIGNATURE_COUNT,
        "created_at": (
            SESSION_CREATED_AT.isoformat()
            if SESSION_CREATED_AT
            else None
        ),
        "last_used_at": (
            SESSION_LAST_USED_AT.isoformat()
            if SESSION_LAST_USED_AT
            else None
        ),
        "pin_saved_by_api": False
    }


@app.post("/session/open")
def open_session():
    cert_info = get_certificate()

    return {
        "message": (
            "Les coordonnées de la clé USB sont mémorisées "
            "pour les prochaines factures."
        ),
        "session_active": True,
        "tokenId": cert_info["tokenId"],
        "keyId": cert_info["keyId"],
        "certificate_loaded": True,
        "pin_saved_by_api": False
    }


@app.post("/session/reset")
def reset_session():
    reset_certificate_session()

    return {
        "message": (
            "La session locale de la clé USB a été réinitialisée."
        ),
        "session_active": False
    }


# ============================================================
# ROUTE CERTIFICAT
# ============================================================

@app.get("/certificate")
def certificate():
    cert_info = get_certificate()

    return {
        "tokenId": cert_info["tokenId"],
        "keyId": cert_info["keyId"],
        "certificate": cert_info["certificate"],
        "certificateChain": cert_info.get(
            "certificateChain",
            []
        ),
        "encryptionAlgorithm": cert_info.get(
            "encryptionAlgorithm",
            "RSA"
        ),
        "session_active": True
    }


# ============================================================
# ROUTE SIGNATURE DE BYTES
# ============================================================

@app.post("/sign-bytes")
def sign_bytes(req: SignBytesRequest):
    result = sign_with_nexu(
        req.bytes_base64
    )

    return {
        "message": "Signature cryptographique générée.",
        "signatureValue": result["signatureValue"],
        "signatureAlgorithm": result.get(
            "signatureAlgorithm"
        ),
        "certificate": result.get(
            "certificate"
        ),
        "certificateChain": result.get(
            "certificateChain",
            []
        ),
        "session_active": True,
        "signature_count": SIGNATURE_COUNT
    }


# ============================================================
# ROUTE DEBUG XML
# ============================================================

@app.post("/sign-xml-debug")
def sign_xml_debug(req: SignXmlRequest):
    xml_bytes = req.xml.encode("utf-8")

    xml_base64 = base64.b64encode(
        xml_bytes
    ).decode("ascii")

    result = sign_with_nexu(
        xml_base64
    )

    return {
        "message": (
            "Signature cryptographique réussie. "
            "Ce résultat n'est pas encore un XML XAdES complet."
        ),
        "signatureValue": result["signatureValue"],
        "signatureAlgorithm": result.get(
            "signatureAlgorithm"
        ),
        "certificate": result.get(
            "certificate"
        ),
        "session_active": True,
        "signature_count": SIGNATURE_COUNT
    }


# ============================================================
# ROUTE PRINCIPALE : SIGNATURE XML XADES
# ============================================================

@app.post("/sign")
def sign_xml(req: SignXmlRequest):
    """
    Scénario :

    Facture 1 :
    - récupération du certificat ;
    - NexU peut demander le PIN ;
    - mémorisation de tokenId, keyId et certificat ;
    - signature de la facture.

    Factures suivantes :
    - réutilisation de tokenId, keyId et certificat ;
    - pas de nouvel appel à /rest/certificates ;
    - signature avec la session NexU existante.

    NexU et le pilote de la clé décident si le PIN reste
    déverrouillé après la première signature.
    """

    signed_xml = create_xades_signed_xml(
        req.xml
    )

    return {
        "message": "XML signé XAdES généré.",
        "session_active": True,
        "signature_number": SIGNATURE_COUNT,
        "certificate_cached": True,
        "pin_saved_by_api": False,
        "signed_xml": signed_xml
    }

