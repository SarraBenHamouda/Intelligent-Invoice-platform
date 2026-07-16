import base64
import json
import logging
import os
import threading
import uuid

from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Optional

import qrcode

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException
from lxml import etree
from pydantic import BaseModel, Field


# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

logger = logging.getLogger("ttn-orchestrator")


# ============================================================
# APPLICATION
# ============================================================

app = FastAPI(
    title="ttn-orchestrator-api",
    version="4.0.0",
    description=(
        "Orchestration des factures TEIF signées XAdES : "
        "acceptation, rejet, indisponibilité temporaire et erreur."
    ),
)


# ============================================================
# CONFIGURATION
# ============================================================

MAX_RETRIES = int(
    os.environ.get("MAX_RETRIES", "3")
)

RETRY_DELAY_SECONDS = int(
    os.environ.get("RETRY_DELAY_SECONDS", "300")
)

SCHEDULER_POLL_SECONDS = int(
    os.environ.get("SCHEDULER_POLL_SECONDS", "30")
)

STORAGE_DIR = Path(
    os.environ.get("STORAGE_DIR", "/app/storage")
)


# ============================================================
# DOSSIERS DE STOCKAGE
# ============================================================

ACCEPTED_DIR = STORAGE_DIR / "accepted"
REJECTED_DIR = STORAGE_DIR / "rejected"
PENDING_RETRY_DIR = STORAGE_DIR / "pending_retry"
ERROR_DIR = STORAGE_DIR / "errors"
QRCODE_DIR = STORAGE_DIR / "qrcodes"

for directory in [
    ACCEPTED_DIR,
    REJECTED_DIR,
    PENDING_RETRY_DIR,
    ERROR_DIR,
    QRCODE_DIR,
]:
    directory.mkdir(
        parents=True,
        exist_ok=True,
    )


# ============================================================
# VERROU ET SCHEDULER
# ============================================================

processing_lock = threading.Lock()

scheduler: Optional[BackgroundScheduler] = None


# ============================================================
# NAMESPACES XMLDSIG / XADES
# ============================================================

DS_NS = "http://www.w3.org/2000/09/xmldsig#"
XADES_NS = "http://uri.etsi.org/01903/v1.3.2#"


# ============================================================
# MODELS
# ============================================================

class TtnScenarioConfig(BaseModel):
    """
    Scénarios disponibles :

    - auto
    - accepted
    - rejected
    - downtime
    - error

    Types de rejet possibles :

    - SIGNATURE_INVALID
    - XML_VALIDATION_ERROR
    - PARTNER_IDENTIFIER_ERROR
    - AMOUNT_ERROR
    - DUPLICATE_INVOICE
    - UNKNOWN_REJECTION
    """

    scenario: str = "auto"
    error_type: Optional[str] = None


class SubmitSignedXmlRequest(BaseModel):
    invoice_number: str
    signed_xml: str

    source: str = "signature-api-xades"

    metadata: Dict[str, Any] = Field(
        default_factory=dict
    )

    ttn_scenario: TtnScenarioConfig = Field(
        default_factory=TtnScenarioConfig
    )


class RetryRequest(BaseModel):
    transaction_id: str


# ============================================================
# OUTILS GÉNÉRAUX
# ============================================================

def now_iso() -> str:
    return datetime.now(
        timezone.utc
    ).isoformat()


def generate_transaction_id() -> str:
    date_part = datetime.now(
        timezone.utc
    ).strftime("%Y%m%d")

    unique_part = uuid.uuid4().hex[:10].upper()

    return f"TTN-{date_part}-{unique_part}"


def generate_ttn_reference() -> str:
    date_part = datetime.now(
        timezone.utc
    ).strftime("%Y%m%d")

    unique_part = uuid.uuid4().hex[:8].upper()

    return f"TTN-{date_part}-{unique_part}"


def save_json(
    directory: Path,
    filename: str,
    content: Dict[str, Any],
) -> str:
    path = directory / filename

    path.write_text(
        json.dumps(
            content,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    return str(path)


def load_json(
    path: Path,
) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None

    try:
        return json.loads(
            path.read_text(
                encoding="utf-8"
            )
        )

    except json.JSONDecodeError:
        logger.error(
            "Fichier JSON invalide : %s",
            path,
        )
        return None


def save_text(
    directory: Path,
    filename: str,
    content: str,
) -> str:
    path = directory / filename

    path.write_text(
        content,
        encoding="utf-8",
    )

    return str(path)


# ============================================================
# QR CODE
# ============================================================

def generate_qr_code_base64(
    result: Dict[str, Any],
) -> str:
    qr_payload = {
        "invoice_number": result.get(
            "invoice_number"
        ),
        "status": result.get(
            "status"
        ),
        "ttn_reference": result.get(
            "ttn_reference"
        ),
        "transaction_id": result.get(
            "transaction_id"
        ),
        "date": result.get(
            "date"
        ),
        "signature_status": result.get(
            "signature_status"
        ),
    }

    qr_text = json.dumps(
        qr_payload,
        ensure_ascii=False,
    )

    image = qrcode.make(qr_text)

    buffer = BytesIO()

    image.save(
        buffer,
        format="PNG",
    )

    return base64.b64encode(
        buffer.getvalue()
    ).decode("utf-8")


# ============================================================
# VÉRIFICATION STRUCTURELLE DU XML SIGNÉ
# ============================================================

def inspect_signed_xml(
    signed_xml: str,
) -> Dict[str, Any]:
    """
    Vérification structurelle minimale.

    Cette fonction vérifie la présence des éléments XAdES/XMLDSig.
    La signature cryptographique réelle est produite auparavant
    par la clé USB via NexU.
    """

    try:
        parser = etree.XMLParser(
            resolve_entities=False,
            no_network=True,
            remove_blank_text=False,
        )

        root = etree.fromstring(
            signed_xml.encode("utf-8"),
            parser=parser,
        )

    except Exception as error:
        return {
            "valid": False,
            "error_type": "XML_VALIDATION_ERROR",
            "message": f"XML invalide : {error}",
        }

    signature = root.find(
        f".//{{{DS_NS}}}Signature"
    )

    signature_value = root.find(
        f".//{{{DS_NS}}}SignatureValue"
    )

    certificate = root.find(
        f".//{{{DS_NS}}}X509Certificate"
    )

    signed_properties = root.find(
        f".//{{{XADES_NS}}}SignedProperties"
    )

    missing_elements = []

    if signature is None:
        missing_elements.append(
            "ds:Signature"
        )

    if (
        signature_value is None
        or not (
            signature_value.text
            or ""
        ).strip()
    ):
        missing_elements.append(
            "ds:SignatureValue"
        )

    if (
        certificate is None
        or not (
            certificate.text
            or ""
        ).strip()
    ):
        missing_elements.append(
            "ds:X509Certificate"
        )

    if signed_properties is None:
        missing_elements.append(
            "xades:SignedProperties"
        )

    if missing_elements:
        return {
            "valid": False,
            "error_type": "SIGNATURE_INVALID",
            "message": (
                "Signature XAdES incomplète. "
                "Éléments absents : "
                + ", ".join(missing_elements)
            ),
        }

    return {
        "valid": True,
        "message": "Structure XAdES détectée",
    }


# ============================================================
# TABLE DES REJETS
# ============================================================

REJECTION_MAP = {
    "SIGNATURE_INVALID": {
        "http_status": 400,
        "message": (
            "Signature invalide : la signature XAdES "
            "ne correspond pas aux exigences attendues"
        ),
        "suggested_action": (
            "Refaire la signature à partir du XML TEIF non signé"
        ),
    },

    "XML_VALIDATION_ERROR": {
        "http_status": 422,
        "message": (
            "XML TEIF invalide ou élément obligatoire manquant"
        ),
        "suggested_action": (
            "Corriger le XML TEIF, le régénérer "
            "puis le signer à nouveau"
        ),
    },

    "PARTNER_IDENTIFIER_ERROR": {
        "http_status": 422,
        "message": (
            "Identifiant fiscal fournisseur ou client invalide"
        ),
        "suggested_action": (
            "Corriger les données du partenaire "
            "puis régénérer le XML"
        ),
    },

    "AMOUNT_ERROR": {
        "http_status": 422,
        "message": (
            "Le total TTC ne correspond pas "
            "au total HT et à la TVA"
        ),
        "suggested_action": (
            "Corriger les montants puis régénérer "
            "et signer le XML"
        ),
    },

    "DUPLICATE_INVOICE": {
        "http_status": 409,
        "message": "Facture déjà reçue",
        "suggested_action": (
            "Vérifier le statut de la facture déjà envoyée"
        ),
    },

    "UNKNOWN_REJECTION": {
        "http_status": 400,
        "message": "Facture rejetée : motif non identifié",
        "suggested_action": (
            "Analyser manuellement la facture"
        ),
    },
}


# ============================================================
# RÉSOLUTION DU SCÉNARIO
# ============================================================

def resolve_scenario(
    invoice_number: str,
    signed_xml: str,
    scenario_config: Dict[str, Any],
) -> Dict[str, str]:
    requested_scenario = str(
        scenario_config.get(
            "scenario",
            "auto",
        )
    ).strip().lower()

    requested_error_type = str(
        scenario_config.get(
            "error_type"
        )
        or "UNKNOWN_REJECTION"
    ).strip().upper()

    allowed_scenarios = {
        "auto",
        "accepted",
        "rejected",
        "downtime",
        "error",
    }

    if requested_scenario not in allowed_scenarios:
        return {
            "scenario": "error",
            "error_type": "INVALID_SCENARIO",
        }

    if requested_scenario != "auto":
        return {
            "scenario": requested_scenario,
            "error_type": requested_error_type,
        }

    searchable_content = (
        f"{invoice_number} {signed_xml}"
    ).upper()

    if "REJECT_SIGNATURE" in searchable_content:
        return {
            "scenario": "rejected",
            "error_type": "SIGNATURE_INVALID",
        }

    if "REJECT_XML" in searchable_content:
        return {
            "scenario": "rejected",
            "error_type": "XML_VALIDATION_ERROR",
        }

    if "REJECT_PARTNER" in searchable_content:
        return {
            "scenario": "rejected",
            "error_type": "PARTNER_IDENTIFIER_ERROR",
        }

    if "REJECT_AMOUNT" in searchable_content:
        return {
            "scenario": "rejected",
            "error_type": "AMOUNT_ERROR",
        }

    if "DUPLICATE_TEST" in searchable_content:
        return {
            "scenario": "rejected",
            "error_type": "DUPLICATE_INVOICE",
        }

    if "DOWN_TEST" in searchable_content:
        return {
            "scenario": "downtime",
            "error_type": "TTN_UNAVAILABLE",
        }

    if "ERROR_TEST" in searchable_content:
        return {
            "scenario": "error",
            "error_type": "INTERNAL_SERVER_ERROR",
        }

    return {
        "scenario": "accepted",
        "error_type": "",
    }


# ============================================================
# NETTOYAGE DU RETRY
# ============================================================

def cleanup_pending(
    transaction_id: str,
    invoice_number: str,
):
    json_path = (
        PENDING_RETRY_DIR
        / f"{transaction_id}.json"
    )

    xml_path = (
        PENDING_RETRY_DIR
        / f"{transaction_id}_{invoice_number}.xml"
    )

    if json_path.exists():
        json_path.unlink()

    if xml_path.exists():
        xml_path.unlink()


# ============================================================
# RÉSULTAT ACCEPTÉ
# ============================================================

def mark_accepted(
    transaction_id: str,
    invoice_number: str,
    signed_xml: str,
    attempt: int,
    message: str,
) -> Dict[str, Any]:
    result = {
        "transaction_id": transaction_id,
        "invoice_number": invoice_number,
        "status": "ACCEPTED",
        "message": message,
        "ttn_reference": generate_ttn_reference(),
        "date": now_iso(),
        "attempt": attempt,
        "signature_status": (
            "SIGNED_XML_ACCEPTED_BY_TTN"
        ),
    }

    qr_code_base64 = generate_qr_code_base64(
        result
    )

    result["qr_code_base64"] = qr_code_base64

    save_json(
        ACCEPTED_DIR,
        f"{transaction_id}.json",
        result,
    )

    save_text(
        ACCEPTED_DIR,
        f"{transaction_id}_{invoice_number}.xml",
        signed_xml,
    )

    save_text(
        QRCODE_DIR,
        f"{transaction_id}.txt",
        qr_code_base64,
    )

    cleanup_pending(
        transaction_id,
        invoice_number,
    )

    return result


# ============================================================
# RÉSULTAT REJETÉ
# ============================================================

def mark_rejected(
    transaction_id: str,
    invoice_number: str,
    signed_xml: str,
    attempt: int,
    error_type: str,
    custom_message: Optional[str] = None,
) -> Dict[str, Any]:
    rejection = REJECTION_MAP.get(
        error_type,
        REJECTION_MAP["UNKNOWN_REJECTION"],
    )

    result = {
        "transaction_id": transaction_id,
        "invoice_number": invoice_number,
        "status": "REJECTED",
        "message": custom_message or rejection["message"],
        "http_status": rejection["http_status"],
        "error_type": error_type,
        "ttn_reason": custom_message or rejection["message"],
        "suggested_action": rejection["suggested_action"],
        "attempt": attempt,
        "date": now_iso(),
    }

    save_json(
        REJECTED_DIR,
        f"{transaction_id}.json",
        result,
    )

    save_text(
        REJECTED_DIR,
        f"{transaction_id}_{invoice_number}.xml",
        signed_xml,
    )

    cleanup_pending(
        transaction_id,
        invoice_number,
    )

    return result


# ============================================================
# RÉSULTAT ERROR
# ============================================================

def mark_error(
    transaction_id: str,
    invoice_number: str,
    attempt: int,
    error_type: str,
    message: str,
    details: Optional[str] = None,
) -> Dict[str, Any]:
    result = {
        "transaction_id": transaction_id,
        "invoice_number": invoice_number,
        "status": "ERROR",
        "message": message,
        "error_type": error_type,
        "attempt": attempt,
        "date": now_iso(),
    }

    if details:
        result["details"] = details

    save_json(
        ERROR_DIR,
        f"{transaction_id}.json",
        result,
    )

    cleanup_pending(
        transaction_id,
        invoice_number,
    )

    return result


# ============================================================
# PROGRAMMATION DU RETRY
# ============================================================

def schedule_retry(
    transaction_id: str,
    invoice_number: str,
    signed_xml: str,
    attempt: int,
    ttn_scenario: Dict[str, Any],
    metadata: Dict[str, Any],
) -> Dict[str, Any]:
    if attempt >= MAX_RETRIES:
        return mark_error(
            transaction_id=transaction_id,
            invoice_number=invoice_number,
            attempt=attempt,
            error_type="MAX_RETRIES_EXCEEDED",
            message=(
                f"Nombre maximum de tentatives atteint "
                f"({MAX_RETRIES})"
            ),
        )

    next_attempt = attempt + 1

    next_retry_at = (
        datetime.now(timezone.utc)
        + timedelta(
            seconds=RETRY_DELAY_SECONDS
        )
    ).isoformat()

    result = {
        "transaction_id": transaction_id,
        "invoice_number": invoice_number,
        "status": "PENDING_RETRY",
        "message": (
            "Service TTN temporairement indisponible. "
            "Une nouvelle tentative est programmée."
        ),
        "error_type": "TTN_UNAVAILABLE",
        "retry_after_seconds": RETRY_DELAY_SECONDS,
        "next_retry_at": next_retry_at,
        "attempt": attempt,
        "next_attempt": next_attempt,
        "max_retries": MAX_RETRIES,
        "date": now_iso(),

        # Données internes nécessaires au retry.
        "ttn_scenario": ttn_scenario,
        "metadata": metadata,
    }

    save_json(
        PENDING_RETRY_DIR,
        f"{transaction_id}.json",
        result,
    )

    save_text(
        PENDING_RETRY_DIR,
        f"{transaction_id}_{invoice_number}.xml",
        signed_xml,
    )

    # Réponse publique sans les informations internes.
    return {
        "transaction_id": transaction_id,
        "invoice_number": invoice_number,
        "status": "PENDING_RETRY",
        "message": result["message"],
        "error_type": "TTN_UNAVAILABLE",
        "retry_after_seconds": RETRY_DELAY_SECONDS,
        "next_retry_at": next_retry_at,
        "attempt": attempt,
        "next_attempt": next_attempt,
        "max_retries": MAX_RETRIES,
        "date": result["date"],
    }


# ============================================================
# LOGIQUE CENTRALE
# ============================================================

def process_submission(
    transaction_id: str,
    invoice_number: str,
    signed_xml: str,
    attempt: int,
    ttn_scenario: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    scenario_config = ttn_scenario or {
        "scenario": "auto",
        "error_type": None,
    }

    request_metadata = metadata or {}

    try:
        signature_inspection = inspect_signed_xml(
            signed_xml
        )

        if not signature_inspection["valid"]:
            return mark_rejected(
                transaction_id=transaction_id,
                invoice_number=invoice_number,
                signed_xml=signed_xml,
                attempt=attempt,
                error_type=signature_inspection[
                    "error_type"
                ],
                custom_message=signature_inspection[
                    "message"
                ],
            )

        resolved = resolve_scenario(
            invoice_number=invoice_number,
            signed_xml=signed_xml,
            scenario_config=scenario_config,
        )

        scenario = resolved["scenario"]
        error_type = resolved["error_type"]

        # ====================================================
        # CAS 1 : ACCEPTED
        # ====================================================
        if scenario == "accepted":
            message = "Facture acceptée par TTN"

            if attempt > 1:
                message = (
                    "Facture acceptée après rétablissement "
                    "du service TTN"
                )

            return mark_accepted(
                transaction_id=transaction_id,
                invoice_number=invoice_number,
                signed_xml=signed_xml,
                attempt=attempt,
                message=message,
            )

        # ====================================================
        # CAS 2 : REJECTED
        # ====================================================
        if scenario == "rejected":
            return mark_rejected(
                transaction_id=transaction_id,
                invoice_number=invoice_number,
                signed_xml=signed_xml,
                attempt=attempt,
                error_type=error_type,
            )

        # ====================================================
        # CAS 3 : TTN DOWN
        #
        # Tentative 1 : PENDING_RETRY
        # Tentative 2 : PENDING_RETRY
        # Tentative 3 : ACCEPTED
        # ====================================================
        if scenario == "downtime":
            if attempt < MAX_RETRIES:
                return schedule_retry(
                    transaction_id=transaction_id,
                    invoice_number=invoice_number,
                    signed_xml=signed_xml,
                    attempt=attempt,
                    ttn_scenario=scenario_config,
                    metadata=request_metadata,
                )

            return mark_accepted(
                transaction_id=transaction_id,
                invoice_number=invoice_number,
                signed_xml=signed_xml,
                attempt=attempt,
                message=(
                    "Facture acceptée après rétablissement "
                    "du service TTN"
                ),
            )

        # ====================================================
        # CAS 4 : ERROR
        # ====================================================
        if scenario == "error":
            return mark_error(
                transaction_id=transaction_id,
                invoice_number=invoice_number,
                attempt=attempt,
                error_type="INTERNAL_SERVER_ERROR",
                message=(
                    "Erreur interne pendant le traitement TTN"
                ),
            )

        return mark_error(
            transaction_id=transaction_id,
            invoice_number=invoice_number,
            attempt=attempt,
            error_type="INVALID_SCENARIO",
            message="Scénario TTN non reconnu",
        )

    except Exception as error:
        logger.exception(
            "Erreur pendant le traitement de %s",
            transaction_id,
        )

        return mark_error(
            transaction_id=transaction_id,
            invoice_number=invoice_number,
            attempt=attempt,
            error_type="INTERNAL_SERVER_ERROR",
            message=(
                "Erreur interne pendant le traitement TTN"
            ),
            details=str(error),
        )


# ============================================================
# RETRY
# ============================================================

def do_retry(
    transaction_id: str,
) -> Dict[str, Any]:
    tracking_path = (
        PENDING_RETRY_DIR
        / f"{transaction_id}.json"
    )

    tracking = load_json(
        tracking_path
    )

    if not tracking:
        raise HTTPException(
            status_code=404,
            detail={
                "status": "ERROR",
                "transaction_id": transaction_id,
                "message": (
                    "Aucune transaction en attente "
                    "de retry trouvée"
                ),
            },
        )

    invoice_number = tracking[
        "invoice_number"
    ]

    xml_path = (
        PENDING_RETRY_DIR
        / f"{transaction_id}_{invoice_number}.xml"
    )

    if not xml_path.exists():
        raise HTTPException(
            status_code=404,
            detail={
                "status": "ERROR",
                "transaction_id": transaction_id,
                "message": (
                    "XML signé introuvable "
                    "pour cette transaction"
                ),
            },
        )

    signed_xml = xml_path.read_text(
        encoding="utf-8"
    )

    next_attempt = tracking.get(
        "next_attempt",
        tracking.get(
            "attempt",
            1,
        ) + 1,
    )

    ttn_scenario = tracking.get(
        "ttn_scenario",
        {
            "scenario": "auto",
            "error_type": None,
        },
    )

    metadata = tracking.get(
        "metadata",
        {},
    )

    return process_submission(
        transaction_id=transaction_id,
        invoice_number=invoice_number,
        signed_xml=signed_xml,
        attempt=next_attempt,
        ttn_scenario=ttn_scenario,
        metadata=metadata,
    )


# ============================================================
# ROUTES
# ============================================================

@app.get("/health")
def health():
    return {
        "service": "ttn-orchestrator-api",
        "status": "ok",
        "version": "4.0.0",
        "max_retries": MAX_RETRIES,
        "retry_delay_seconds": RETRY_DELAY_SECONDS,
        "scheduler_poll_seconds": SCHEDULER_POLL_SECONDS,
        "scheduler_running": (
            scheduler.running
            if scheduler
            else False
        ),
    }


@app.post("/submit-signed-xml")
def submit_signed_xml(
    payload: SubmitSignedXmlRequest,
):
    transaction_id = generate_transaction_id()

    invoice_number = payload.invoice_number.strip()

    if not invoice_number:
        error_result = {
            "transaction_id": transaction_id,
            "status": "ERROR",
            "error_type": "MISSING_INVOICE_NUMBER",
            "message": (
                "Le numéro de facture est obligatoire"
            ),
            "date": now_iso(),
        }

        save_json(
            ERROR_DIR,
            f"{transaction_id}.json",
            error_result,
        )

        raise HTTPException(
            status_code=400,
            detail=error_result,
        )

    if (
        not payload.signed_xml
        or len(
            payload.signed_xml.strip()
        ) < 100
    ):
        error_result = {
            "transaction_id": transaction_id,
            "invoice_number": invoice_number,
            "status": "ERROR",
            "error_type": "EMPTY_SIGNED_XML",
            "message": (
                "Le XML signé est vide, "
                "trop court ou invalide"
            ),
            "date": now_iso(),
        }

        save_json(
            ERROR_DIR,
            f"{transaction_id}.json",
            error_result,
        )

        raise HTTPException(
            status_code=400,
            detail=error_result,
        )

    with processing_lock:
        return process_submission(
            transaction_id=transaction_id,
            invoice_number=invoice_number,
            signed_xml=payload.signed_xml,
            attempt=1,
            ttn_scenario=(
                payload.ttn_scenario.model_dump()
            ),
            metadata=payload.metadata,
        )


@app.post("/retry")
def retry_transaction(
    payload: RetryRequest,
):
    with processing_lock:
        return do_retry(
            payload.transaction_id
        )


@app.get("/pending-retries")
def list_pending_retries():
    public_items = []

    for json_file in (
        PENDING_RETRY_DIR.glob("*.json")
    ):
        data = load_json(json_file)

        if not data:
            continue

        public_items.append({
            key: value
            for key, value in data.items()
            if key not in {
                "ttn_scenario",
                "metadata",
            }
        })

    return {
        "count": len(public_items),
        "items": public_items,
    }


@app.get("/transaction/{transaction_id}")
def get_transaction(
    transaction_id: str,
):
    possible_paths = [
        ACCEPTED_DIR
        / f"{transaction_id}.json",

        REJECTED_DIR
        / f"{transaction_id}.json",

        PENDING_RETRY_DIR
        / f"{transaction_id}.json",

        ERROR_DIR
        / f"{transaction_id}.json",
    ]

    for path in possible_paths:
        data = load_json(path)

        if not data:
            continue

        return {
            key: value
            for key, value in data.items()
            if key not in {
                "ttn_scenario",
                "metadata",
            }
        }

    raise HTTPException(
        status_code=404,
        detail={
            "status": "ERROR",
            "transaction_id": transaction_id,
            "message": "Transaction introuvable",
        },
    )


# ============================================================
# SCHEDULER DE RETRY AUTOMATIQUE
# ============================================================

def run_due_retries():
    current_time = datetime.now(
        timezone.utc
    )

    for json_file in (
        PENDING_RETRY_DIR.glob("*.json")
    ):
        tracking = load_json(json_file)

        if not tracking:
            continue

        next_retry_at_text = tracking.get(
            "next_retry_at"
        )

        if not next_retry_at_text:
            continue

        try:
            next_retry_at = datetime.fromisoformat(
                next_retry_at_text
            )

            if next_retry_at.tzinfo is None:
                next_retry_at = next_retry_at.replace(
                    tzinfo=timezone.utc
                )

        except ValueError:
            logger.error(
                "Date de retry invalide : %s",
                next_retry_at_text,
            )
            continue

        if current_time < next_retry_at:
            continue

        transaction_id = tracking[
            "transaction_id"
        ]

        logger.info(
            "Retry automatique déclenché pour %s",
            transaction_id,
        )

        try:
            with processing_lock:
                do_retry(transaction_id)

        except HTTPException as error:
            logger.error(
                "Erreur HTTP pendant le retry de %s : %s",
                transaction_id,
                error.detail,
            )

        except Exception:
            logger.exception(
                "Erreur pendant le retry automatique de %s",
                transaction_id,
            )


@app.on_event("startup")
def start_scheduler():
    global scheduler

    scheduler = BackgroundScheduler()

    scheduler.add_job(
        run_due_retries,
        trigger="interval",
        seconds=SCHEDULER_POLL_SECONDS,
        id="retry_job",
        replace_existing=True,
        max_instances=1,
    )

    scheduler.start()

    logger.info(
        "Scheduler démarré : vérification toutes les %s secondes",
        SCHEDULER_POLL_SECONDS,
    )


@app.on_event("shutdown")
def stop_scheduler():
    if scheduler:
        scheduler.shutdown(
            wait=False
        )