import base64
import hashlib
import uuid
from datetime import datetime, timezone

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from lxml import etree


app = FastAPI(title="signature-api-xades")

NEXU_URL = "http://127.0.0.1:9795"

DS_NS = "http://www.w3.org/2000/09/xmldsig#"
XADES_NS = "http://uri.etsi.org/01903/v1.3.2#"

NSMAP_DS = {
    "ds": DS_NS,
    "xades": XADES_NS,
}

C14N_ALGO = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
ENVELOPED_ALGO = "http://www.w3.org/2000/09/xmldsig#enveloped-signature"
RSA_SHA256_ALGO = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"
SHA256_ALGO = "http://www.w3.org/2001/04/xmlenc#sha256"
SIGNED_PROPERTIES_TYPE = "http://uri.etsi.org/01903#SignedProperties"


class SignBytesRequest(BaseModel):
    bytes_base64: str


class SignXmlRequest(BaseModel):
    xml: str


def b64_sha256(data: bytes) -> str:
    return base64.b64encode(hashlib.sha256(data).digest()).decode("ascii")


def canonicalize(element) -> bytes:
    return etree.tostring(
        element,
        method="c14n",
        exclusive=False,
        with_comments=False
    )


def ds(tag):
    return f"{{{DS_NS}}}{tag}"


def xades(tag):
    return f"{{{XADES_NS}}}{tag}"


def get_certificate():
    try:
        r = requests.get(f"{NEXU_URL}/rest/certificates", timeout=20)
        data = r.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Impossible d'appeler NexU: {e}")

    if not data.get("success"):
        raise HTTPException(status_code=500, detail=data)

    response = data["response"]

    return {
        "tokenId": response["tokenId"],
        "keyId": response["keyId"],
        "certificate": response["certificate"],
        "certificateChain": response.get("certificateChain", []),
        "encryptionAlgorithm": response.get("encryptionAlgorithm", "RSA"),
    }


def sign_with_nexu(bytes_base64: str):
    cert_info = get_certificate()

    payload = {
        "tokenId": cert_info["tokenId"],
        "keyId": cert_info["keyId"],
        "toBeSigned": {
            "bytes": bytes_base64
        },
        "digestAlgorithm": "SHA256",
        "encryptionAlgorithm": "RSA"
    }

    try:
        r = requests.post(
            f"{NEXU_URL}/rest/sign",
            json=payload,
            timeout=60
        )
        data = r.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur pendant signature NexU: {e}")

    if not data.get("success"):
        raise HTTPException(status_code=500, detail=data)

    return {
        "signatureValue": data["response"]["signatureValue"],
        "signatureAlgorithm": data["response"].get("signatureAlgorithm"),
        "certificate": data["response"].get("certificate"),
        "certificateChain": data["response"].get("certificateChain", []),
    }


def add_digest_method(parent):
    el = etree.SubElement(parent, ds("DigestMethod"))
    el.set("Algorithm", SHA256_ALGO)
    return el


def add_digest_value(parent, value):
    el = etree.SubElement(parent, ds("DigestValue"))
    el.text = value
    return el


def build_reference(uri: str, digest_value: str, transforms=None, ref_type=None, ref_id=None):
    ref = etree.Element(ds("Reference"))

    if ref_id:
        ref.set("Id", ref_id)

    ref.set("URI", uri)

    if ref_type:
        ref.set("Type", ref_type)

    if transforms:
        transforms_el = etree.SubElement(ref, ds("Transforms"))
        for algo in transforms:
            tr = etree.SubElement(transforms_el, ds("Transform"))
            tr.set("Algorithm", algo)

    add_digest_method(ref)
    add_digest_value(ref, digest_value)

    return ref


def create_xades_signed_xml(xml_string: str):
    cert_info = get_certificate()
    cert_b64 = cert_info["certificate"]
    cert_der = base64.b64decode(cert_b64)
    cert_digest = b64_sha256(cert_der)

    parser = etree.XMLParser(remove_blank_text=False)

    try:
        root = etree.fromstring(xml_string.encode("utf-8"), parser=parser)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"XML invalide: {e}")

    signature_id = "SIG-" + uuid.uuid4().hex
    key_info_id = "KeyInfo-" + signature_id
    signed_properties_id = "SignedProperties-" + signature_id
    document_reference_id = "REF-DOC-" + signature_id

    # Digest du document TEIF avant ajout de Signature
    document_digest = b64_sha256(canonicalize(root))

    # Signature root
    signature_el = etree.Element(ds("Signature"), nsmap=NSMAP_DS)
    signature_el.set("Id", signature_id)

    signed_info_el = etree.SubElement(signature_el, ds("SignedInfo"))

    canon_method = etree.SubElement(signed_info_el, ds("CanonicalizationMethod"))
    canon_method.set("Algorithm", C14N_ALGO)

    sig_method = etree.SubElement(signed_info_el, ds("SignatureMethod"))
    sig_method.set("Algorithm", RSA_SHA256_ALGO)

    # KeyInfo avec certificat
    key_info_el = etree.SubElement(signature_el, ds("KeyInfo"))
    key_info_el.set("Id", key_info_id)

    x509_data = etree.SubElement(key_info_el, ds("X509Data"))
    x509_cert = etree.SubElement(x509_data, ds("X509Certificate"))
    x509_cert.text = cert_b64

    # Object XAdES
    object_el = etree.SubElement(signature_el, ds("Object"))

    qualifying_props = etree.SubElement(object_el, xades("QualifyingProperties"))
    qualifying_props.set("Target", "#" + signature_id)

    signed_props = etree.SubElement(qualifying_props, xades("SignedProperties"))
    signed_props.set("Id", signed_properties_id)

    signed_sig_props = etree.SubElement(signed_props, xades("SignedSignatureProperties"))

    signing_time = etree.SubElement(signed_sig_props, xades("SigningTime"))
    signing_time.text = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    signing_cert_v2 = etree.SubElement(signed_sig_props, xades("SigningCertificateV2"))
    cert_el = etree.SubElement(signing_cert_v2, xades("Cert"))

    cert_digest_el = etree.SubElement(cert_el, xades("CertDigest"))

    digest_method = etree.SubElement(cert_digest_el, ds("DigestMethod"))
    digest_method.set("Algorithm", SHA256_ALGO)

    digest_value = etree.SubElement(cert_digest_el, ds("DigestValue"))
    digest_value.text = cert_digest

    # SignedDataObjectProperties : pointe seulement vers le document TEIF
    signed_data_object_props = etree.SubElement(
        signed_props,
        xades("SignedDataObjectProperties")
    )

    data_object_format_doc = etree.SubElement(
        signed_data_object_props,
        xades("DataObjectFormat")
    )
    data_object_format_doc.set("ObjectReference", "#" + document_reference_id)

    mime_type_doc = etree.SubElement(data_object_format_doc, xades("MimeType"))
    mime_type_doc.text = "text/xml"

    # Reference 1 : SignedProperties
    signed_props_digest = b64_sha256(canonicalize(signed_props))

    signed_props_ref = build_reference(
        uri="#" + signed_properties_id,
        digest_value=signed_props_digest,
        transforms=[C14N_ALGO],
        ref_type=SIGNED_PROPERTIES_TYPE
    )
    signed_info_el.append(signed_props_ref)

    # Reference 2 : document TEIF
    doc_ref = build_reference(
        uri="",
        digest_value=document_digest,
        transforms=[ENVELOPED_ALGO, C14N_ALGO],
        ref_id=document_reference_id
    )
    signed_info_el.append(doc_ref)

    # Signer SignedInfo via NexU/TunSign
    signed_info_c14n = canonicalize(signed_info_el)
    signed_info_b64 = base64.b64encode(signed_info_c14n).decode("ascii")

    nexu_signature = sign_with_nexu(signed_info_b64)
    signature_value_b64 = nexu_signature["signatureValue"]

    signature_value_el = etree.Element(ds("SignatureValue"))
    signature_value_el.text = signature_value_b64
    signed_info_el.addnext(signature_value_el)

    root.append(signature_el)

    signed_xml = etree.tostring(
        root,
        encoding="UTF-8",
        xml_declaration=True,
        pretty_print=False
    ).decode("utf-8")

    return signed_xml


@app.get("/health")
def health():
    return {
        "service": "signature-api-xades",
        "status": "ok",
        "nexu_url": NEXU_URL
    }


@app.get("/certificate")
def certificate():
    return get_certificate()


@app.post("/sign-bytes")
def sign_bytes(req: SignBytesRequest):
    return sign_with_nexu(req.bytes_base64)


@app.post("/sign-xml-debug")
def sign_xml_debug(req: SignXmlRequest):
    xml_bytes = req.xml.encode("utf-8")
    xml_base64 = base64.b64encode(xml_bytes).decode("utf-8")

    result = sign_with_nexu(xml_base64)

    return {
        "message": "Signature cryptographique OK. Ce n'est pas encore un XML XAdES complet.",
        "signatureValue": result["signatureValue"],
        "signatureAlgorithm": result["signatureAlgorithm"],
        "certificate": result["certificate"]
    }


@app.post("/sign")
def sign_xml(req: SignXmlRequest):
    signed_xml = create_xades_signed_xml(req.xml)

    return {
        "message": "XML signé XAdES généré.",
        "signed_xml": signed_xml
    }