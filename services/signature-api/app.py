from flask import Flask, request, jsonify
from lxml import etree

import os
import base64
import hashlib
import subprocess
from datetime import datetime, timezone, timedelta
from copy import deepcopy

from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding

app = Flask(__name__)
PORT = int(os.environ.get("PORT", 5001))

SIGN_CERT_THUMBPRINT = os.environ.get("SIGN_CERT_THUMBPRINT", "").replace(" ", "").upper()
DEFAULT_SIGN_MODE = os.environ.get("SIGN_MODE", "auto").lower()
SHARED_DIR = os.environ.get("SHARED_DIR", "/shared")
DEMO_DIR = os.path.join(SHARED_DIR, "demo-cert")
DEMO_KEY_PATH = os.path.join(DEMO_DIR, "demo_private_key.pem")
DEMO_CERT_PATH = os.path.join(DEMO_DIR, "demo_certificate.pem")

SIG_ID = "SigFrs"
SIG_VALUE_ID = "value-SigFrs"
KEY_INFO_ID = "keyinfo-SigFrs"
DOC_REF_ID = "r-id-frs"
SIGNED_PROPS_ID = "xades-SigFrs"

DS_NS = "http://www.w3.org/2000/09/xmldsig#"
XADES_NS = "http://uri.etsi.org/01903/v1.3.2#"
TTN_META_NS = "http://www.ttn.tn/teif/metadata"

DS = f"{{{DS_NS}}}"
XADES = f"{{{XADES_NS}}}"
TTN = f"{{{TTN_META_NS}}}"

C14N_ALGO = "http://www.w3.org/2001/10/xml-exc-c14n#"
ENVELOPED_SIGNATURE_ALGO = "http://www.w3.org/2000/09/xmldsig#enveloped-signature"
XPATH_ALGO = "http://www.w3.org/TR/1999/REC-xpath-19991116"
RSA_SHA256_ALGO = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"
SHA256_ALGO = "http://www.w3.org/2001/04/xmlenc#sha256"
SIGNED_PROPERTIES_TYPE = "http://uri.etsi.org/01903#SignedProperties"


def now_utc_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def sha256_b64(data: bytes) -> str:
    return b64(hashlib.sha256(data).digest())


def sub(parent, tag, text=None, attrib=None, nsmap=None):
    element = etree.SubElement(parent, tag, attrib=attrib or {}, nsmap=nsmap)
    if text is not None:
        element.text = str(text)
    return element


def exclusive_c14n(element) -> bytes:
    return etree.tostring(element, method="c14n", exclusive=True, with_comments=False)


def parse_xml(xml_content: str):
    parser = etree.XMLParser(remove_blank_text=True, resolve_entities=False, no_network=True)
    return etree.fromstring(xml_content.encode("utf-8"), parser=parser)


def remove_existing_signature(root):
    for signature in root.xpath(".//ds:Signature", namespaces={"ds": DS_NS}):
        parent = signature.getparent()
        if parent is not None:
            parent.remove(signature)


def remove_ref_ttn_val(root):
    for node in root.xpath(".//*[local-name()='RefTtnVal']"):
        parent = node.getparent()
        if parent is not None:
            parent.remove(node)


def get_first_text(root, xpath_expression):
    nodes = root.xpath(xpath_expression)
    if not nodes:
        return ""
    node = nodes[0]
    if isinstance(node, etree._Element):
        return (node.text or "").strip()
    return str(node).strip()


def get_invoice_number(root):
    return get_first_text(root, ".//*[local-name()='DocumentIdentifier']")


def get_supplier_name(root):
    return get_first_text(root, ".//*[local-name()='PartnerDetails' and @functionCode='I-63']//*[local-name()='PartnerName']")


def get_teif_version(root):
    return root.get("version", "3.0")


def ensure_demo_certificate():
    os.makedirs(DEMO_DIR, exist_ok=True)
    if os.path.exists(DEMO_KEY_PATH) and os.path.exists(DEMO_CERT_PATH):
        with open(DEMO_KEY_PATH, "rb") as file:
            key = serialization.load_pem_private_key(file.read(), password=None)
        with open(DEMO_CERT_PATH, "rb") as file:
            cert = x509.load_pem_x509_certificate(file.read())
        return key, cert

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "TN"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "PFE DEMO SIGNATURE"),
        x509.NameAttribute(NameOID.COMMON_NAME, "DEMO CERTIFICATE - NOT LEGAL"),
    ])
    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=365))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=True,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=None,
                decipher_only=None,
            ),
            critical=True,
        )
        .sign(key, hashes.SHA256())
    )

    with open(DEMO_KEY_PATH, "wb") as file:
        file.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    with open(DEMO_CERT_PATH, "wb") as file:
        file.write(cert.public_bytes(serialization.Encoding.PEM))
    return key, cert


def demo_sign_data(data: bytes) -> bytes:
    key, _ = ensure_demo_certificate()
    return key.sign(data, padding.PKCS1v15(), hashes.SHA256())


def get_demo_cert_der() -> bytes:
    _, cert = ensure_demo_certificate()
    return cert.public_bytes(serialization.Encoding.DER)


def powershell_available():
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.returncode == 0
    except Exception:
        return False


def get_windows_cert_der_by_thumbprint(thumbprint: str):
    if not thumbprint:
        return None
    script = f'''\
$thumb = "{thumbprint}"
$cert = Get-ChildItem -Path Cert:\\CurrentUser\\My | Where-Object {{
    ($_.Thumbprint -replace ' ', '').ToUpper() -eq $thumb
}} | Select-Object -First 1
if ($null -eq $cert) {{ exit 2 }}
if (-not $cert.HasPrivateKey) {{ exit 3 }}
[Convert]::ToBase64String($cert.RawData)
'''
    result = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return None
    try:
        return base64.b64decode(result.stdout.strip())
    except Exception:
        return None


def windows_token_status():
    if not SIGN_CERT_THUMBPRINT:
        return {"available": False, "reason": "SIGN_CERT_THUMBPRINT_NOT_CONFIGURED"}
    if not powershell_available():
        return {"available": False, "reason": "POWERSHELL_NOT_AVAILABLE"}
    cert_der = get_windows_cert_der_by_thumbprint(SIGN_CERT_THUMBPRINT)
    if not cert_der:
        return {"available": False, "reason": "CERTIFICATE_NOT_FOUND_OR_NO_PRIVATE_KEY"}
    try:
        cert = x509.load_der_x509_certificate(cert_der)
        return {
            "available": True,
            "reason": "OK",
            "thumbprint": SIGN_CERT_THUMBPRINT,
            "subject": cert.subject.rfc4514_string(),
            "issuer": cert.issuer.rfc4514_string(),
            "serial_number": str(cert.serial_number),
        }
    except Exception as exc:
        return {"available": False, "reason": f"CERT_PARSE_ERROR: {exc}"}


def windows_sign_data_with_thumbprint(data: bytes, thumbprint: str) -> bytes:
    data_b64 = b64(data)
    script = f'''\
$thumb = "{thumbprint}"
$dataB64 = "{data_b64}"
$cert = Get-ChildItem -Path Cert:\\CurrentUser\\My | Where-Object {{
    ($_.Thumbprint -replace ' ', '').ToUpper() -eq $thumb
}} | Select-Object -First 1
if ($null -eq $cert) {{ Write-Error "CERT_NOT_FOUND"; exit 2 }}
if (-not $cert.HasPrivateKey) {{ Write-Error "NO_PRIVATE_KEY"; exit 3 }}
$data = [Convert]::FromBase64String($dataB64)
$rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
if ($null -eq $rsa) {{ Write-Error "RSA_PRIVATE_KEY_NOT_AVAILABLE"; exit 4 }}
$hashAlg = [System.Security.Cryptography.HashAlgorithmName]::SHA256
$padding = [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
$sig = $rsa.SignData($data, $hashAlg, $padding)
[Convert]::ToBase64String($sig)
'''
    result = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        details = result.stderr.strip() or result.stdout.strip() or "Unknown error"
        raise RuntimeError(f"WINDOWS_SIGN_ERROR: {details}")
    return base64.b64decode(result.stdout.strip())


def compute_document_digest(root) -> str:
    clone = deepcopy(root)
    remove_existing_signature(clone)
    remove_ref_ttn_val(clone)
    return sha256_b64(exclusive_c14n(clone))


def compute_signed_properties_digest(signed_properties_el) -> str:
    return sha256_b64(exclusive_c14n(signed_properties_el))


def build_signature_template(root, cert_der: bytes, signing_time: str, signature_mode: str):
    cert = x509.load_der_x509_certificate(cert_der)
    cert_b64 = b64(cert_der)
    cert_digest = sha256_b64(cert_der)
    invoice_number = get_invoice_number(root)
    supplier_name = get_supplier_name(root)
    teif_version = get_teif_version(root)

    remove_existing_signature(root)
    signature = sub(root, DS + "Signature", attrib={"Id": SIG_ID}, nsmap={"ds": DS_NS, "xades": XADES_NS})
    signed_info = sub(signature, DS + "SignedInfo")
    sub(signed_info, DS + "CanonicalizationMethod", attrib={"Algorithm": C14N_ALGO})
    sub(signed_info, DS + "SignatureMethod", attrib={"Algorithm": RSA_SHA256_ALGO})

    ref_doc = sub(signed_info, DS + "Reference", attrib={"Id": DOC_REF_ID, "URI": ""})
    transforms = sub(ref_doc, DS + "Transforms")
    sub(transforms, DS + "Transform", attrib={"Algorithm": ENVELOPED_SIGNATURE_ALGO})
    xpath_transform = sub(transforms, DS + "Transform", attrib={"Algorithm": XPATH_ALGO})
    sub(xpath_transform, DS + "XPath", "not(ancestor-or-self::*[local-name()='RefTtnVal'])")
    sub(transforms, DS + "Transform", attrib={"Algorithm": C14N_ALGO})
    sub(ref_doc, DS + "DigestMethod", attrib={"Algorithm": SHA256_ALGO})
    digest_doc_el = sub(ref_doc, DS + "DigestValue", "")

    ref_props = sub(signed_info, DS + "Reference", attrib={"Type": SIGNED_PROPERTIES_TYPE, "URI": f"#{SIGNED_PROPS_ID}"})
    transforms_props = sub(ref_props, DS + "Transforms")
    sub(transforms_props, DS + "Transform", attrib={"Algorithm": C14N_ALGO})
    sub(ref_props, DS + "DigestMethod", attrib={"Algorithm": SHA256_ALGO})
    digest_props_el = sub(ref_props, DS + "DigestValue", "")

    signature_value_el = sub(signature, DS + "SignatureValue", "", attrib={"Id": SIG_VALUE_ID})

    key_info = sub(signature, DS + "KeyInfo", attrib={"Id": KEY_INFO_ID})
    x509_data = sub(key_info, DS + "X509Data")
    issuer_serial = sub(x509_data, DS + "X509IssuerSerial")
    sub(issuer_serial, DS + "X509IssuerName", cert.issuer.rfc4514_string())
    sub(issuer_serial, DS + "X509SerialNumber", str(cert.serial_number))
    sub(x509_data, DS + "X509SubjectName", cert.subject.rfc4514_string())
    sub(x509_data, DS + "X509Certificate", cert_b64)

    obj = sub(signature, DS + "Object")
    qualifying_props = sub(obj, XADES + "QualifyingProperties", attrib={"Target": f"#{SIG_ID}"})
    signed_props = sub(qualifying_props, XADES + "SignedProperties", attrib={"Id": SIGNED_PROPS_ID})
    signed_sig_props = sub(signed_props, XADES + "SignedSignatureProperties")
    sub(signed_sig_props, XADES + "SigningTime", signing_time)

    signing_cert_v2 = sub(signed_sig_props, XADES + "SigningCertificateV2")
    cert_element = sub(signing_cert_v2, XADES + "Cert")
    cert_digest_element = sub(cert_element, XADES + "CertDigest")
    sub(cert_digest_element, DS + "DigestMethod", attrib={"Algorithm": SHA256_ALGO})
    sub(cert_digest_element, DS + "DigestValue", cert_digest)
    # IssuerSerialV2 est volontairement omis : une chaîne issuer|serial en Base64 est invalide.

    policy_identifier = sub(signed_sig_props, XADES + "SignaturePolicyIdentifier")
    policy_id = sub(policy_identifier, XADES + "SignaturePolicyId")
    sig_policy_id = sub(policy_id, XADES + "SigPolicyId")
    sub(sig_policy_id, XADES + "Identifier", "urn:2.16.788.1.2.1.3", attrib={"Qualifier": "OIDAsURN"})
    sub(sig_policy_id, XADES + "Description", "Politique de Signature Electronique de Tunisie TradeNet")
    policy_hash = sub(policy_id, XADES + "SigPolicyHash")
    sub(policy_hash, DS + "DigestMethod", attrib={"Algorithm": SHA256_ALGO})
    sub(policy_hash, DS + "DigestValue", "ZKLu5TojntPu+bUfZyjaEDvkYsAh7eyyV+Hf8nUSQEE=")
    qualifiers = sub(policy_id, XADES + "SigPolicyQualifiers")
    qualifier = sub(qualifiers, XADES + "SigPolicyQualifier")
    sub(qualifier, XADES + "SPURI", "https://www.tradenet.com.tn/Politique_Signature_Electronique_Tunisie_TradeNet.pdf")

    signer_role_v2 = sub(signed_sig_props, XADES + "SignerRoleV2")
    claimed_roles = sub(signer_role_v2, XADES + "ClaimedRoles")
    sub(claimed_roles, XADES + "ClaimedRole", "Fournisseur")

    signed_data_object_props = sub(signed_props, XADES + "SignedDataObjectProperties")
    data_obj_format = sub(signed_data_object_props, XADES + "DataObjectFormat", attrib={"ObjectReference": f"#{DOC_REF_ID}"})
    sub(data_obj_format, XADES + "MimeType", "application/xml")

    obj_meta = sub(signature, DS + "Object")
    ttn_meta = sub(obj_meta, TTN + "TTNMetadata", nsmap={None: TTN_META_NS})
    ref_suffix = hashlib.sha256(f"{invoice_number}-{signing_time}".encode("utf-8")).hexdigest()[:8].upper()
    sub(ttn_meta, TTN + "TTNReference", f"TTN-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{ref_suffix}")
    sub(ttn_meta, TTN + "TTNTimestamp", signing_time)
    sub(ttn_meta, TTN + "TTNFournisseur", supplier_name)
    sub(ttn_meta, TTN + "TTNNumFacture", invoice_number)
    sub(ttn_meta, TTN + "TTNVersion", f"TEIF-v{teif_version}")
    sub(ttn_meta, TTN + "TTNMode", "PRODUCTION-TUNSIGN" if signature_mode == "production" else "DEMO-MOCK-SIGNATURE-NOT-LEGAL")

    return {
        "signed_info": signed_info,
        "signed_props": signed_props,
        "digest_doc_el": digest_doc_el,
        "digest_props_el": digest_props_el,
        "signature_value_el": signature_value_el,
        "cert": cert,
    }


def verify_generated_signature(root, cert):
    signatures = root.xpath(".//ds:Signature[@Id=$sid]", namespaces={"ds": DS_NS}, sid=SIG_ID)
    if not signatures:
        raise RuntimeError("LOCAL_VERIFY_SIGNATURE_NOT_FOUND")
    signature = signatures[0]
    signed_info = signature.find(DS + "SignedInfo")
    references = signed_info.findall(DS + "Reference")
    if len(references) < 2:
        raise RuntimeError("LOCAL_VERIFY_REFERENCES_MISSING")

    expected_doc = references[0].findtext(DS + "DigestValue", default="")
    expected_props = references[1].findtext(DS + "DigestValue", default="")
    props_nodes = signature.xpath(".//xades:SignedProperties[@Id=$pid]", namespaces={"xades": XADES_NS}, pid=SIGNED_PROPS_ID)
    if not props_nodes:
        raise RuntimeError("LOCAL_VERIFY_SIGNED_PROPERTIES_NOT_FOUND")

    computed_doc = compute_document_digest(root)
    computed_props = compute_signed_properties_digest(props_nodes[0])
    if expected_doc != computed_doc:
        raise RuntimeError(f"LOCAL_VERIFY_DOCUMENT_DIGEST_MISMATCH: present={expected_doc} computed={computed_doc}")
    if expected_props != computed_props:
        raise RuntimeError(f"LOCAL_VERIFY_SIGNED_PROPERTIES_DIGEST_MISMATCH: present={expected_props} computed={computed_props}")

    signature_value_text = signature.findtext(DS + "SignatureValue", default="").strip()
    signature_value = base64.b64decode(signature_value_text, validate=True)
    cert.public_key().verify(signature_value, exclusive_c14n(signed_info), padding.PKCS1v15(), hashes.SHA256())
    return {
        "document_digest_valid": True,
        "signed_properties_digest_valid": True,
        "signature_value_valid": True,
    }


def sign_xml_xades(xml_content: str, mode: str):
    xml_content = str(xml_content or "").strip()
    if not xml_content:
        raise ValueError("xml_content manquant")

    root = parse_xml(xml_content)
    signing_time = now_utc_iso()
    used_mode = mode

    if mode == "production":
        status = windows_token_status()
        if not status.get("available"):
            raise RuntimeError(f"TUNTRUST_NOT_AVAILABLE: {status.get('reason')}")
        cert_der = get_windows_cert_der_by_thumbprint(SIGN_CERT_THUMBPRINT)
        signer = "windows"
    elif mode == "demo":
        cert_der = get_demo_cert_der()
        signer = "demo"
    elif mode == "auto":
        status = windows_token_status()
        if status.get("available"):
            cert_der = get_windows_cert_der_by_thumbprint(SIGN_CERT_THUMBPRINT)
            signer = "windows"
            used_mode = "production"
        else:
            cert_der = get_demo_cert_der()
            signer = "demo"
            used_mode = "demo"
    else:
        raise ValueError("mode invalide. Utilise auto, production ou demo")

    if not cert_der:
        raise RuntimeError("CERTIFICATE_DER_NOT_AVAILABLE")

    ctx = build_signature_template(root, cert_der, signing_time, used_mode)
    doc_digest = compute_document_digest(root)
    ctx["digest_doc_el"].text = doc_digest
    props_digest = compute_signed_properties_digest(ctx["signed_props"])
    ctx["digest_props_el"].text = props_digest

    signed_info_c14n = exclusive_c14n(ctx["signed_info"])
    signature_value = (
        windows_sign_data_with_thumbprint(signed_info_c14n, SIGN_CERT_THUMBPRINT)
        if signer == "windows"
        else demo_sign_data(signed_info_c14n)
    )
    ctx["signature_value_el"].text = b64(signature_value)

    local_verification = verify_generated_signature(root, ctx["cert"])

    # Ne jamais utiliser pretty_print=True après le calcul des digests.
    xml_bytes = etree.tostring(root, xml_declaration=True, encoding="UTF-8", pretty_print=False)

    reparsed_root = parse_xml(xml_bytes.decode("utf-8"))
    post_serialization_verification = verify_generated_signature(reparsed_root, ctx["cert"])

    cert = ctx["cert"]
    return {
        "xml_signed": xml_bytes.decode("utf-8"),
        "used_mode": used_mode,
        "signer": signer,
        "signing_time": signing_time,
        "certificate_subject": cert.subject.rfc4514_string(),
        "certificate_issuer": cert.issuer.rfc4514_string(),
        "certificate_serial": str(cert.serial_number),
        "document_digest": doc_digest,
        "signed_properties_digest": props_digest,
        "local_verification": local_verification,
        "post_serialization_verification": post_serialization_verification,
    }


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "signature-api",
        "status": "running",
        "routes": ["GET /health", "GET /token/status", "POST /sign"],
        "default_mode": DEFAULT_SIGN_MODE,
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "signature-api-xades",
        "port": PORT,
        "default_mode": DEFAULT_SIGN_MODE,
        "thumbprint_configured": bool(SIGN_CERT_THUMBPRINT),
    })


@app.route("/token/status", methods=["GET"])
def token_status():
    status = windows_token_status()
    return jsonify({
        "available": status.get("available", False),
        "reason": status.get("reason"),
        "thumbprint_configured": bool(SIGN_CERT_THUMBPRINT),
        "thumbprint": status.get("thumbprint"),
        "subject": status.get("subject"),
        "issuer": status.get("issuer"),
        "serial_number": status.get("serial_number"),
    })


@app.route("/sign", methods=["POST"])
def sign_route():
    try:
        body = request.get_json(silent=True) or {}
        xml_content = body.get("xml_content") or body.get("xml") or ""
        invoice_number = body.get("invoice_number", "")
        mode = str(body.get("mode", DEFAULT_SIGN_MODE)).lower()
        result = sign_xml_xades(xml_content, mode)

        warning = None
        legal_validity = "LEGAL_PRODUCTION_SIGNATURE"
        if result["used_mode"] == "demo":
            warning = (
                "Signature DEMO générée avec un certificat logiciel. "
                "Elle est cryptographiquement vérifiable, mais non juridiquement valable et non destinée à TTN."
            )
            legal_validity = "DEMO_SIGNATURE_NOT_LEGAL"

        return jsonify({
            "success": True,
            "signed": True,
            "mode_requested": mode,
            "mode_used": result["used_mode"],
            "legal_validity": legal_validity,
            "warning": warning,
            "invoice_number": invoice_number,
            "xml_signed": result["xml_signed"],
            "signature_type": "XAdES-EPES",
            "signing_time": result["signing_time"],
            "certificate_subject": result["certificate_subject"],
            "certificate_issuer": result["certificate_issuer"],
            "certificate_serial": result["certificate_serial"],
            "document_digest": result["document_digest"],
            "signed_properties_digest": result["signed_properties_digest"],
            "local_verification": result["local_verification"],
            "post_serialization_verification": result["post_serialization_verification"],
        })
    except Exception as exc:
        return jsonify({"success": False, "signed": False, "error": str(exc)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=False)