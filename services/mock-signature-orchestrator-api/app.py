import base64
import io
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import qrcode
import qrcode.image.svg
import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


# ============================================================
# APPLICATION
# ============================================================

app = FastAPI(
    title="Mock Signature Orchestrator API",
    version="2.1.0",
    description=(
        "Orchestrateur des quatre scénarios de signature mock : "
        "ACCEPTED, REJECTED, PENDING et ERROR. "
        "Le scénario ACCEPTED génère un QR code d'acceptation."
    ),
)


# ============================================================
# CONFIGURATION
# ============================================================

SIGNATURE_API_URL = os.environ.get(
    "SIGNATURE_API_URL",
    "http://signature-api:5001",
).rstrip("/")

MAX_RETRIES = int(
    os.environ.get(
        "MAX_RETRIES",
        "3",
    )
)

RETRY_DELAY_SECONDS = int(
    os.environ.get(
        "RETRY_DELAY_SECONDS",
        "300",
    )
)

STORAGE_DIR = Path(
    os.environ.get(
        "STORAGE_DIR",
        "/app/storage",
    )
)

ACCEPTED_DIR = STORAGE_DIR / "accepted"
REJECTED_DIR = STORAGE_DIR / "rejected"
PENDING_DIR = STORAGE_DIR / "pending"
ERROR_DIR = STORAGE_DIR / "errors"
QRCODE_DIR = STORAGE_DIR / "qrcodes"

for folder in (
    ACCEPTED_DIR,
    REJECTED_DIR,
    PENDING_DIR,
    ERROR_DIR,
    QRCODE_DIR,
):
    folder.mkdir(
        parents=True,
        exist_ok=True,
    )


# ============================================================
# MODELS
# ============================================================

class SubmitRequest(BaseModel):
    xml_content: str = Field(
        ...,
        min_length=1,
    )

    invoice_number: str = ""

    scenario: str = Field(
        default="accepted",
        pattern="^(accepted|rejected|pending|error)$",
    )

    rejection_code: str = (
        "MOCK_SIGNATURE_REJECTED"
    )

    rejection_reason: str = (
        "La signature mock a été rejetée."
    )

    pending_seconds: int = Field(
        default=RETRY_DELAY_SECONDS,
        ge=1,
        le=86400,
    )


class RetryRequest(BaseModel):
    next_scenario: str = Field(
        default="accepted",
        pattern="^(accepted|rejected|pending|error)$",
    )


# ============================================================
# DATE ET FICHIERS
# ============================================================

def now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def safe_file_name(value: str) -> str:
    if not value:
        return "UNKNOWN"

    cleaned = "".join(
        character
        if character.isalnum()
        or character in ("-", "_")
        else "_"
        for character in value
    )

    return cleaned or "UNKNOWN"


def save_json(
    folder: Path,
    transaction_id: str,
    data: dict,
) -> str:
    file_path = (
        folder
        / f"{safe_file_name(transaction_id)}.json"
    )

    file_path.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    return str(file_path)


def folder_for_status(
    status: str,
) -> Path:
    if status == "ACCEPTED":
        return ACCEPTED_DIR

    if status == "REJECTED":
        return REJECTED_DIR

    if status == "PENDING":
        return PENDING_DIR

    return ERROR_DIR


def find_transaction(
    transaction_id: str,
):
    safe_transaction_id = safe_file_name(
        transaction_id
    )

    for folder in (
        ACCEPTED_DIR,
        REJECTED_DIR,
        PENDING_DIR,
        ERROR_DIR,
    ):
        file_path = (
            folder
            / f"{safe_transaction_id}.json"
        )

        if file_path.exists():
            try:
                content = json.loads(
                    file_path.read_text(
                        encoding="utf-8",
                    )
                )

                return file_path, content

            except Exception:
                return file_path, None

    return None, None


# ============================================================
# QR CODE D'ACCEPTATION
# ============================================================

def generate_acceptance_qr_code(
    transaction_id: str,
    invoice_number: str,
    signature_type: str,
    mode_used: str,
    legal_validity: str,
    signing_time: Optional[str],
) -> dict:
    acceptance_time = signing_time or now_iso()

    qr_content = {
        "status": "ACCEPTED",
        "accepted": True,
        "transaction_id": transaction_id,
        "invoice_number": invoice_number,
        "message": (
            "La facture a été acceptée par "
            "l'orchestrateur de signature mock."
        ),
        "signature_type": signature_type,
        "mode_used": mode_used,
        "legal_validity": legal_validity,
        "acceptance_time": acceptance_time,
    }

    qr_text = json.dumps(
        qr_content,
        ensure_ascii=False,
        separators=(",", ":"),
    )

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )

    qr.add_data(qr_text)
    qr.make(fit=True)

    image_factory = qrcode.image.svg.SvgPathImage

    qr_image = qr.make_image(
        image_factory=image_factory
    )

    memory_buffer = io.BytesIO()

    qr_image.save(memory_buffer)

    qr_bytes = memory_buffer.getvalue()

    qr_base64 = base64.b64encode(
        qr_bytes
    ).decode("utf-8")

    invoice_safe = safe_file_name(
        invoice_number
    )

    transaction_safe = safe_file_name(
        transaction_id
    )

    qr_file_name = (
        f"{invoice_safe}_"
        f"{transaction_safe}_"
        f"ACCEPTED.svg"
    )

    qr_file_path = (
        QRCODE_DIR
        / qr_file_name
    )

    qr_file_path.write_bytes(
        qr_bytes
    )

    return {
        "qr_code_format": "SVG",
        "qr_code_mime_type": "image/svg+xml",
        "qr_code_base64": qr_base64,
        "qr_code_data_uri": (
            "data:image/svg+xml;base64,"
            f"{qr_base64}"
        ),
        "qr_code_file_name": qr_file_name,
        "qr_code_file_path": str(
            qr_file_path
        ),
        "qr_code_content": qr_content,
    }

# ============================================================
# APPEL SIGNATURE API
# ============================================================

def call_signature_api(
    xml_content: str,
    invoice_number: str,
):
    payload = {
        "xml_content": xml_content,
        "invoice_number": invoice_number,
        "mode": "demo",
    }

    try:
        response = requests.post(
            f"{SIGNATURE_API_URL}/sign",
            json=payload,
            timeout=120,
        )

    except requests.Timeout as exc:
        raise RuntimeError(
            f"SIGNATURE_API_TIMEOUT: {exc}"
        ) from exc

    except requests.ConnectionError as exc:
        raise RuntimeError(
            f"SIGNATURE_API_UNAVAILABLE: {exc}"
        ) from exc

    except requests.RequestException as exc:
        raise RuntimeError(
            f"SIGNATURE_API_REQUEST_ERROR: {exc}"
        ) from exc

    try:
        body = response.json()

    except ValueError:
        body = {
            "success": False,
            "signed": False,
            "error": response.text,
        }

    return response.status_code, body


# ============================================================
# EXECUTION DES SCENARIOS
# ============================================================

def execute_scenario(
    transaction_id: str,
    payload: SubmitRequest,
    attempt: int = 1,
):
    scenario = (
        payload.scenario
        .strip()
        .lower()
    )

    # ========================================================
    # SCENARIO 1 : ACCEPTED
    # ========================================================

    if scenario == "accepted":
        try:
            (
                signature_http_status,
                signature_result,
            ) = call_signature_api(
                xml_content=payload.xml_content,
                invoice_number=(
                    payload.invoice_number
                ),
            )

            signature_success = (
                signature_http_status == 200
                and signature_result.get(
                    "success"
                ) is True
                and signature_result.get(
                    "signed"
                ) is True
            )

            if signature_success:
                invoice_number = (
                    signature_result.get(
                        "invoice_number"
                    )
                    or payload.invoice_number
                    or "UNKNOWN"
                )

                signature_type = (
                    signature_result.get(
                        "signature_type"
                    )
                    or "XAdES-EPES"
                )

                mode_used = (
                    signature_result.get(
                        "mode_used"
                    )
                    or "demo"
                )

                legal_validity = (
                    signature_result.get(
                        "legal_validity"
                    )
                    or (
                        "DEMO_SIGNATURE_"
                        "NOT_LEGAL"
                    )
                )

                signing_time = (
                    signature_result.get(
                        "signing_time"
                    )
                    or now_iso()
                )

                qr_result = (
                    generate_acceptance_qr_code(
                        transaction_id=(
                            transaction_id
                        ),
                        invoice_number=(
                            invoice_number
                        ),
                        signature_type=(
                            signature_type
                        ),
                        mode_used=mode_used,
                        legal_validity=(
                            legal_validity
                        ),
                        signing_time=(
                            signing_time
                        ),
                    )
                )

                result = {
                    "success": True,
                    "status": "ACCEPTED",
                    "accepted": True,
                    "transaction_id": (
                        transaction_id
                    ),
                    "invoice_number": (
                        invoice_number
                    ),
                    "message": (
                        "La signature mock a été "
                        "générée et acceptée. "
                        "Un QR code d'acceptation "
                        "a été créé."
                    ),
                    "signature_type": (
                        signature_type
                    ),
                    "mode_used": mode_used,
                    "legal_validity": (
                        legal_validity
                    ),
                    "xml_signed": (
                        signature_result.get(
                            "xml_signed"
                        )
                    ),
                    "signing_time": (
                        signing_time
                    ),
                    "certificate_subject": (
                        signature_result.get(
                            "certificate_subject"
                        )
                    ),
                    "document_digest": (
                        signature_result.get(
                            "document_digest"
                        )
                    ),
                    "local_verification": (
                        signature_result.get(
                            "local_verification"
                        )
                    ),
                    (
                        "post_serialization_"
                        "verification"
                    ): (
                        signature_result.get(
                            (
                                "post_serialization_"
                                "verification"
                            )
                        )
                    ),
                    "qr_code_base64": (
                        qr_result[
                            "qr_code_base64"
                        ]
                    ),
                    "qr_code_data_uri": (
                        qr_result[
                            "qr_code_data_uri"
                        ]
                    ),
                    "qr_code_file_name": (
                        qr_result[
                            "qr_code_file_name"
                        ]
                    ),
                    "qr_code_file_path": (
                        qr_result[
                            "qr_code_file_path"
                        ]
                    ),
                    "qr_code_content": (
                        qr_result[
                            "qr_code_content"
                        ]
                    ),
                    "retryable": False,
                    "attempt": attempt,
                    "max_retries": (
                        MAX_RETRIES
                    ),
                }

                return 200, result

            error_message = (
                signature_result.get("error")
                or signature_result.get(
                    "message"
                )
                or (
                    "La signature mock "
                    "a échoué."
                )
            )

            result = {
                "success": False,
                "status": "ERROR",
                "transaction_id": (
                    transaction_id
                ),
                "invoice_number": (
                    payload.invoice_number
                ),
                "error_code": (
                    "SIGNATURE_API_FAILED"
                ),
                "signature_api_status": (
                    signature_http_status
                ),
                "message": error_message,
                "retryable": True,
                "attempt": attempt,
                "max_retries": MAX_RETRIES,
            }

            return 500, result

        except RuntimeError as exc:
            result = {
                "success": False,
                "status": "ERROR",
                "transaction_id": (
                    transaction_id
                ),
                "invoice_number": (
                    payload.invoice_number
                ),
                "error_code": (
                    "SIGNATURE_API_UNAVAILABLE"
                ),
                "message": str(exc),
                "retryable": True,
                "attempt": attempt,
                "max_retries": MAX_RETRIES,
            }

            return 503, result

        except Exception as exc:
            result = {
                "success": False,
                "status": "ERROR",
                "transaction_id": (
                    transaction_id
                ),
                "invoice_number": (
                    payload.invoice_number
                ),
                "error_code": (
                    "UNEXPECTED_ACCEPTANCE_ERROR"
                ),
                "message": str(exc),
                "retryable": True,
                "attempt": attempt,
                "max_retries": MAX_RETRIES,
            }

            return 500, result

    # ========================================================
    # SCENARIO 2 : REJECTED
    # ========================================================

    if scenario == "rejected":
        result = {
            "success": False,
            "status": "REJECTED",
            "accepted": False,
            "transaction_id": (
                transaction_id
            ),
            "invoice_number": (
                payload.invoice_number
            ),
            "error_code": (
                payload.rejection_code
            ),
            "message": (
                payload.rejection_reason
            ),
            "retryable": False,
            "recommended_action": (
                "Corriger la facture ou "
                "la signature, puis envoyer "
                "une nouvelle demande."
            ),
            "attempt": attempt,
            "max_retries": MAX_RETRIES,
        }

        return 422, result

    # ========================================================
    # SCENARIO 3 : PENDING
    # ========================================================

    if scenario == "pending":
        result = {
            "success": True,
            "status": "PENDING",
            "accepted": False,
            "transaction_id": (
                transaction_id
            ),
            "invoice_number": (
                payload.invoice_number
            ),
            "message": (
                "La signature mock est "
                "en attente."
            ),
            "retryable": True,
            "retry_after_seconds": (
                payload.pending_seconds
            ),
            "attempt": attempt,
            "max_retries": MAX_RETRIES,
        }

        return 202, result

    # ========================================================
    # SCENARIO 4 : ERROR
    # ========================================================

    result = {
        "success": False,
        "status": "ERROR",
        "accepted": False,
        "transaction_id": transaction_id,
        "invoice_number": (
            payload.invoice_number
        ),
        "error_code": (
            "MOCK_INTERNAL_ERROR"
        ),
        "message": (
            "Une erreur interne mock "
            "a été simulée."
        ),
        "retryable": True,
        "attempt": attempt,
        "max_retries": MAX_RETRIES,
    }

    return 500, result


# ============================================================
# ROUTE PRINCIPALE
# ============================================================

@app.get("/")
def index():
    return {
        "service": (
            "mock-signature-orchestrator-api"
        ),
        "version": "2.1.0",
        "status": "running",
        "signature_api_url": (
            SIGNATURE_API_URL
        ),
        "storage_dir": str(
            STORAGE_DIR
        ),
        "routes": [
            "GET /",
            "GET /health",
            "POST /submit",
            "GET /status/{transaction_id}",
            "POST /retry/{transaction_id}",
        ],
        "scenarios": [
            "accepted",
            "rejected",
            "pending",
            "error",
        ],
        "accepted_qr_code": True,
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
def health():
    signature_api_available = False
    signature_api_details = None

    try:
        response = requests.get(
            f"{SIGNATURE_API_URL}/health",
            timeout=10,
        )

        signature_api_available = (
            response.ok
        )

        try:
            signature_api_details = (
                response.json()
            )

        except ValueError:
            signature_api_details = (
                response.text
            )

    except Exception as exc:
        signature_api_details = str(exc)

    return {
        "success": True,
        "status": "ok",
        "service": (
            "mock-signature-orchestrator-api"
        ),
        "version": "2.1.0",
        "signature_api_url": (
            SIGNATURE_API_URL
        ),
        "signature_api_available": (
            signature_api_available
        ),
        "signature_api_details": (
            signature_api_details
        ),
        "storage": {
            "root": str(STORAGE_DIR),
            "accepted": str(
                ACCEPTED_DIR
            ),
            "rejected": str(
                REJECTED_DIR
            ),
            "pending": str(
                PENDING_DIR
            ),
            "errors": str(
                ERROR_DIR
            ),
            "qrcodes": str(
                QRCODE_DIR
            ),
        },
    }


# ============================================================
# SOUMISSION
# ============================================================

@app.post("/submit")
def submit(
    payload: SubmitRequest,
):
    transaction_id = (
        f"MOCK-ORCH-"
        f"{uuid.uuid4().hex[:12].upper()}"
    )

    http_status, result = (
        execute_scenario(
            transaction_id=(
                transaction_id
            ),
            payload=payload,
            attempt=1,
        )
    )

    timestamp = now_iso()

    record = {
        **result,
        "created_at": timestamp,
        "updated_at": timestamp,
        "original_request": (
            payload.model_dump()
        ),
    }

    saved_record_path = save_json(
        folder=folder_for_status(
            result["status"]
        ),
        transaction_id=(
            transaction_id
        ),
        data=record,
    )

    response_result = {
        **result,
        "record_file_path": (
            saved_record_path
        ),
    }

    return JSONResponse(
        status_code=http_status,
        content=response_result,
    )


# ============================================================
# CONSULTATION DU STATUT
# ============================================================

@app.get(
    "/status/{transaction_id}"
)
def get_status(
    transaction_id: str,
):
    _, record = find_transaction(
        transaction_id
    )

    if not record:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "status": "NOT_FOUND",
                "transaction_id": (
                    transaction_id
                ),
                "message": (
                    "Transaction introuvable."
                ),
            },
        )

    return record


# ============================================================
# RETRY
# ============================================================

@app.post(
    "/retry/{transaction_id}"
)
def retry(
    transaction_id: str,
    retry_request: RetryRequest,
):
    old_path, record = (
        find_transaction(
            transaction_id
        )
    )

    if not record:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "status": "NOT_FOUND",
                "transaction_id": (
                    transaction_id
                ),
                "message": (
                    "Transaction introuvable."
                ),
            },
        )

    if record.get("status") not in {
        "PENDING",
        "ERROR",
    }:
        raise HTTPException(
            status_code=409,
            detail={
                "success": False,
                "status": (
                    "RETRY_NOT_ALLOWED"
                ),
                "transaction_id": (
                    transaction_id
                ),
                "message": (
                    "Seules les transactions "
                    "PENDING ou ERROR peuvent "
                    "être relancées."
                ),
            },
        )

    current_attempt = int(
        record.get(
            "attempt",
            1,
        )
    )

    if current_attempt >= MAX_RETRIES:
        raise HTTPException(
            status_code=409,
            detail={
                "success": False,
                "status": (
                    "MAX_RETRIES_REACHED"
                ),
                "transaction_id": (
                    transaction_id
                ),
                "message": (
                    "Nombre maximal de "
                    "tentatives atteint."
                ),
            },
        )

    original_request = dict(
        record.get(
            "original_request",
            {},
        )
    )

    original_request["scenario"] = (
        retry_request.next_scenario
    )

    try:
        payload = SubmitRequest(
            **original_request
        )

    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "success": False,
                "status": (
                    "INVALID_ORIGINAL_REQUEST"
                ),
                "transaction_id": (
                    transaction_id
                ),
                "message": str(exc),
            },
        ) from exc

    new_attempt = (
        current_attempt + 1
    )

    http_status, result = (
        execute_scenario(
            transaction_id=(
                transaction_id
            ),
            payload=payload,
            attempt=new_attempt,
        )
    )

    updated_record = {
        **result,
        "created_at": record.get(
            "created_at",
            now_iso(),
        ),
        "updated_at": now_iso(),
        "original_request": (
            original_request
        ),
    }

    if (
        old_path
        and old_path.exists()
    ):
        old_path.unlink()

    saved_record_path = save_json(
        folder=folder_for_status(
            result["status"]
        ),
        transaction_id=(
            transaction_id
        ),
        data=updated_record,
    )

    response_result = {
        **result,
        "record_file_path": (
            saved_record_path
        ),
    }

    return JSONResponse(
        status_code=http_status,
        content=response_result,
    )


# ============================================================
# LANCEMENT LOCAL
# ============================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
    )