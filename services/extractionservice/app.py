import json
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import requests
from fastapi import FastAPI
from pydantic import BaseModel, Field

APP_VERSION = "2026-07-15-tn-fr-v4"

app = FastAPI(title="extractionservice-intelligent-hybrid")

OLLAMA_URL = os.environ.get(
    "OLLAMA_URL",
    "http://ollama:11434/api/chat",
)

OLLAMA_MODEL = os.environ.get(
    "OLLAMA_MODEL",
    "mistral",
)

OLLAMA_TIMEOUT = int(
    os.environ.get("OLLAMA_TIMEOUT", "90")
)

OLLAMA_NUM_CTX = int(
    os.environ.get("OLLAMA_NUM_CTX", "4096")
)

OLLAMA_NUM_PREDICT = int(
    os.environ.get("OLLAMA_NUM_PREDICT", "300")
)

OLLAMA_CHUNK_MAX_CHARS = int(
    os.environ.get("OLLAMA_CHUNK_MAX_CHARS", "4500")
)


# =========================================================
# MODELS
# =========================================================

class ExtractionRequest(BaseModel):
    raw_text: str
    page_count: int = 1
    source_type: str = "unknown"
    blocks: List[Dict[str, Any]] = Field(default_factory=list)
    words: List[Dict[str, Any]] = Field(default_factory=list)


# =========================================================
# BASIC UTILS
# =========================================================

def clean_text(text: str) -> str:
    text = text or ""
    text = text.replace("\r", "\n").replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clean_lines(text: str) -> List[str]:
    return [
        line.strip()
        for line in (text or "").splitlines()
        if line.strip()
    ]


def normalize_number(value: Any) -> float:
    if value is None:
        return 0.0

    if isinstance(value, (int, float)):
        return float(value)

    s = str(value).strip().replace("\u00a0", " ")
    s = re.sub(r"[^0-9,\.\-\s]", "", s).strip()

    if not s or s in {"-", ".", ","}:
        return 0.0

    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    else:
        s = s.replace(" ", "").replace(",", ".")

    try:
        return float(s)
    except Exception:
        return 0.0


def r3(value: Any) -> float:
    return round(float(value or 0), 3)


def r2(value: Any) -> float:
    return round(float(value or 0), 2)


def money_str(
    value: Any,
    currency: str,
    decimals: Optional[int] = None,
) -> str:
    n = float(value or 0)

    if decimals is None:
        decimals = 3 if abs(n - round(n, 2)) > 0.0001 else 2

    formatted = f"{n:,.{decimals}f}"
    formatted = (
        formatted
        .replace(",", "X")
        .replace(".", ",")
        .replace("X", " ")
    )

    if (
        decimals > 0
        and re.fullmatch(r"-?\d+(?: \d{3})*,0+", formatted)
    ):
        formatted = formatted.split(",")[0]

    return f"{formatted} {currency}".strip()


def parse_date(value: Any) -> str:
    raw = str(value or "").strip()

    for fmt in (
        "%d/%m/%Y",
        "%d/%m/%y",
        "%d-%m-%Y",
        "%d-%m-%y",
        "%Y-%m-%d",
        "%d.%m.%Y",
    ):
        try:
            return datetime.strptime(raw, fmt).strftime("%d/%m/%Y")
        except Exception:
            pass

    return raw


def compact_invoice_number(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "")).upper()


def first_non_empty(*values: Any) -> Any:
    for value in values:
        if value not in (None, "", [], {}):
            return value
    return ""


def safe_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def safe_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


# =========================================================
# GENERIC DETECTION
# =========================================================

def detect_country(text: str) -> str:
    low = (text or "").lower()

    tn_score = sum(
        marker in low
        for marker in (
            "tnd",
            "timbre fiscal",
            "matricule fiscal",
            "dinars",
            "millimes",
            "+216",
            "tunisie",
        )
    )

    fr_score = sum(
        marker in low
        for marker in (
            "eur",
            "€",
            "siret",
            "siren",
            "tva intra",
            "france",
            "cedex",
        )
    )

    if tn_score > fr_score:
        return "TN"

    if fr_score > tn_score:
        return "FR"

    return "UNKNOWN"


def detect_currency(text: str, country: str) -> str:
    up = (text or "").upper()

    if "TND" in up:
        return "TND"

    if "EUR" in up or "€" in text:
        return "EUR"

    if "USD" in up or "$" in text:
        return "USD"

    if country == "TN":
        return "TND"

    if country == "FR":
        return "EUR"

    return ""


def detect_document_type(text: str) -> Dict[str, str]:
    lines = clean_lines(text)

    for line in lines[:60]:
        normalized = line.lower().strip()

        if re.fullmatch(
            r"(avoir|note de crédit|credit note)(?:\s+\d+)?",
            normalized,
        ):
            return {
                "name": "Avoir",
                "code": "I-12",
            }

        if re.fullmatch(
            r"(facture|invoice)(?:\s+\d+)?",
            normalized,
        ):
            return {
                "name": "Facture",
                "code": "I-11",
            }

    if re.search(
        r"\b(note de crédit|credit note)\b",
        text or "",
        re.I,
    ):
        return {
            "name": "Avoir",
            "code": "I-12",
        }

    return {
        "name": "Facture",
        "code": "I-11",
    }


# =========================================================
# GENERIC FALLBACKS
# =========================================================

def extract_emails(text: str) -> List[str]:
    return list(
        dict.fromkeys(
            re.findall(
                r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}",
                text or "",
            )
        )
    )


def extract_websites(text: str) -> List[str]:
    return list(
        dict.fromkeys(
            re.findall(
                r"(?:https?://|www\.)[^\s]+",
                text or "",
                re.I,
            )
        )
    )


def extract_phone_candidates(text: str) -> List[str]:
    candidates = re.findall(
        r"(?:\+?\d{1,3}[\s\-.]?)?"
        r"(?:\(?\d{1,4}\)?[\s\-.]?){3,7}",
        text or "",
    )

    result = []

    for candidate in candidates:
        cleaned = re.sub(
            r"\s+",
            " ",
            candidate,
        ).strip(" -.")

        digits = re.sub(r"\D", "", cleaned)

        if 8 <= len(digits) <= 15 and cleaned not in result:
            result.append(cleaned)

    return result


def extract_tax_ids(text: str) -> List[str]:
    patterns = [
        r"\bFR[A-Z0-9]{2}\d{9,10}\b",
        r"\b\d{7}[A-Z]/[A-Z]/[A-Z]/\d{3}\b",
        r"\b\d{7}[A-Z]{2,3}\d{3}\b",
        r"\b\d{7}[A-Z]\b",
        r"\b\d{14}\b",
    ]

    result: List[str] = []

    for pattern in patterns:
        for match in re.findall(
            pattern,
            text or "",
            re.I,
        ):
            normalized = match.upper()

            if normalized not in result:
                result.append(normalized)

    return result


def extract_invoice_number_fallback(text: str) -> str:
    patterns = [
        (
            r"(?:facture|invoice|avoir|n[°o])"
            r"\s*[:#\-]?\s*"
            r"([A-Z]{0,4}[\s_\-]?\d{4,12})"
        ),
        r"\b((?:FA|FC|FV|AV|AC)[\s_\-]?\d{4,12})\b",
        (
            r"\b\d{2}/\d{2}/\d{2,4}\s+"
            r"([A-Z]{0,4}[\s_\-]?\d{4,12})\b"
        ),
    ]

    for pattern in patterns:
        match = re.search(
            pattern,
            text or "",
            re.I,
        )

        if match:
            return compact_invoice_number(match.group(1))

    return ""


def extract_dates_fallback(text: str) -> List[str]:
    result = []

    for raw in re.findall(
        r"\b(?:"
        r"\d{2}[\/\-.]\d{2}[\/\-.]\d{2,4}"
        r"|"
        r"\d{4}-\d{2}-\d{2}"
        r")\b",
        text or "",
    ):
        parsed = parse_date(raw)

        if parsed and parsed not in result:
            result.append(parsed)

    return result


def extract_client_code_fallback(text: str) -> str:
    match = re.search(
        r"\bC\d{3,10}\b",
        text or "",
        re.I,
    )

    if match:
        return match.group(0).upper()

    match = re.search(
        r"\bcode\s+client\s*[:#\-]\s*"
        r"([A-Z0-9_\-]{3,20})\b",
        text or "",
        re.I,
    )

    if not match:
        return ""

    value = match.group(1).upper()

    forbidden_values = {
        "VOTRE",
        "REFERENCE",
        "VOTREREFERENCE",
        "COMMERCIAL",
        "FACTURE",
        "CLIENT",
        "DATE",
        "NUMERO",
        "TOTAL",
        "DESIGNATION",
        "QUANTITE",
        "PRIX",
    }

    if value in forbidden_values:
        return ""

    return value


def extract_due_date_fallback(
    text: str,
    invoice_date: str,
) -> str:
    patterns = [
        (
            r"(?:date\s+d['’]échéance|"
            r"date\s+echeance|"
            r"échéance|echeance)"
            r".{0,70}?"
            r"(\d{2}[\/\-.]\d{2}[\/\-.]\d{2,4})"
        ),
        (
            r"(?:à\s+payer\s+avant|"
            r"a\s+payer\s+avant)"
            r".{0,70}?"
            r"(\d{2}[\/\-.]\d{2}[\/\-.]\d{2,4})"
        ),
    ]

    for pattern in patterns:
        match = re.search(
            pattern,
            text or "",
            re.I | re.S,
        )

        if not match:
            continue

        candidate = parse_date(match.group(1))

        try:
            invoice_dt = datetime.strptime(
                invoice_date,
                "%d/%m/%Y",
            )

            due_dt = datetime.strptime(
                candidate,
                "%d/%m/%Y",
            )

            difference_days = (
                due_dt - invoice_dt
            ).days

            if 0 <= difference_days <= 730:
                return candidate

        except Exception:
            continue

    return ""


def extract_amount_after_label(
    text: str,
    label_regex: str,
    max_lookahead: int = 6,
) -> float:
    lines = clean_lines(text)

    amount_pattern = (
        r"-?(?:"
        r"\d{1,3}(?:[ \u00a0]\d{3})+"
        r"|"
        r"\d+"
        r")[,.]\d{1,4}"
    )

    for index, line in enumerate(lines):
        if not re.search(
            label_regex,
            line,
            re.I,
        ):
            continue

        same_line = [
            normalize_number(value)
            for value in re.findall(
                amount_pattern,
                line,
            )
        ]

        same_line = [
            value
            for value in same_line
            if value != 0
        ]

        if same_line:
            return r3(same_line[-1])

        for cursor in range(
            index + 1,
            min(
                len(lines),
                index + 1 + max_lookahead,
            ),
        ):
            values = [
                normalize_number(value)
                for value in re.findall(
                    amount_pattern,
                    lines[cursor],
                )
            ]

            values = [
                value
                for value in values
                if value != 0
            ]

            if values:
                return r3(values[0])

    return 0.0


def extract_timbre_fallback(text: str) -> float:
    value = extract_amount_after_label(
        text,
        r"timbre\s+fiscal(?:e)?|stamp\s+duty",
        max_lookahead=4,
    )

    if 0 < value <= 10:
        return value

    return 0.0


def extract_totals_fallback(
    text: str,
    country: str,
) -> Dict[str, float]:
    total_ht = extract_amount_after_label(
        text,
        r"\btotal\s+ht\b|"
        r"\bmontant\s+ht\b|"
        r"\bsubtotal\b",
    )

    total_tva = extract_amount_after_label(
        text,
        r"\bmontant\s+t\.?v\.?a\.?\b|"
        r"\btotal\s+tva\b|"
        r"\bvat\s+amount\b",
    )

    total_ttc = extract_amount_after_label(
        text,
        r"\btotal\s+ttc\b|"
        r"\btotal\s+tax\s+included\b|"
        r"\bgrand\s+total\b",
    )

    net = extract_amount_after_label(
        text,
        r"\bnet\s+[àa]\s+payer\b|"
        r"\bamount\s+due\b",
    )

    timbre = extract_timbre_fallback(text)

    if not net:
        net = total_ttc

    if not total_ttc and total_ht:
        total_ttc = r3(total_ht + total_tva)

    return {
        "total_ht": r3(total_ht),
        "base_tva": r3(total_ht),
        "montant_tva": r3(total_tva),
        "timbre_fiscal": r3(timbre),
        "total_ttc": r3(total_ttc),
        "net_a_payer": r3(net),
        "remise_globale": 0.0,
    }


# =========================================================
# OLLAMA PROMPT
# =========================================================

def build_llm_prompt(
    raw_text: str,
    country: str,
    currency: str,
) -> str:
    schema = {
        "fournisseur": {
            "nom": "",
            "identifiant": "",
            "matricule_fiscal_ou_tva": "",
            "siret": "",
            "adresse": "",
            "pays": country,
            "telephone": "",
            "email": "",
            "site_web": "",
        },
        "client": {
            "code_client": "",
            "nom": "",
            "identifiant": "",
            "matricule_fiscal_ou_tva": "",
            "siren": "",
            "adresse": "",
            "pays": country,
        },
        "facture": {
            "numero": "",
            "date_facture": "",
            "date_echeance": "",
            "reference": "",
            "commercial": "",
            "mode_paiement": "",
            "conditions_paiement": "",
        },
        "lignes_facture": [],
        "totaux": {
            "total_ht_num": 0,
            "base_tva_num": 0,
            "montant_tva_num": 0,
            "timbre_fiscal_num": 0,
            "remise_globale_num": 0,
            "total_ttc_num": 0,
            "net_a_payer_num": 0,
        },
    }

    return f"""
Tu es un moteur local d'extraction intelligente de factures.

Retourne uniquement un objet JSON valide.
N'ajoute aucune explication, aucun commentaire et aucun bloc Markdown.

Contraintes obligatoires :
- N'invente aucune valeur.
- Ne copie jamais une valeur d'une facture précédente.
- Travaille uniquement à partir du texte reçu.
- Distingue clairement le fournisseur du client.
- Ne cherche pas les lignes détaillées de la facture.
- Concentre-toi sur le fournisseur, le client, l'en-tête et les totaux.
- Une référence article peut être vide si elle n'existe pas.
- Les désignations doivent rester fidèles au document.
- Les nombres doivent être des nombres JSON.
- Les dates doivent être au format JJ/MM/AAAA.
- Les remises doivent être une liste de nombres.
- Une information absente doit rester vide ou à zéro.
- Ne remplace jamais un montant imprimé par une estimation.
- Devise détectée : {currency}
- Pays détecté : {country}

Structure JSON exacte :
{json.dumps(schema, ensure_ascii=False, indent=2)}

Texte de la facture :
--- DEBUT ---
{raw_text}
--- FIN ---
""".strip()


# =========================================================
# OLLAMA CHUNKING
# =========================================================

def split_text_for_llm(
    text: str,
    max_chars: int = OLLAMA_CHUNK_MAX_CHARS,
) -> List[str]:
    lines = clean_lines(text)

    if not lines:
        return []

    chunks: List[str] = []
    current_lines: List[str] = []
    current_size = 0

    for line in lines:
        line_size = len(line) + 1

        if (
            current_lines
            and current_size + line_size > max_chars
        ):
            chunks.append("\n".join(current_lines))
            current_lines = []
            current_size = 0

        current_lines.append(line)
        current_size += line_size

    if current_lines:
        chunks.append("\n".join(current_lines))

    return chunks


def merge_llm_chunks(
    extracted_chunks: List[Dict[str, Any]],
) -> Dict[str, Any]:
    merged: Dict[str, Any] = {
        "fournisseur": {},
        "client": {},
        "facture": {},
        "lignes_facture": [],
        "totaux": {},
    }

    seen_lines = set()

    for chunk in extracted_chunks:
        if not isinstance(chunk, dict):
            continue

        for section_name in (
            "fournisseur",
            "client",
            "facture",
            "totaux",
        ):
            section = chunk.get(section_name, {})

            if not isinstance(section, dict):
                continue

            for key, value in section.items():
                existing = merged[section_name].get(key)

                existing_empty = existing in (
                    None,
                    "",
                    0,
                    0.0,
                    [],
                    {},
                )

                new_not_empty = value not in (
                    None,
                    "",
                    0,
                    0.0,
                    [],
                    {},
                )

                if existing_empty and new_not_empty:
                    merged[section_name][key] = value

        lines = chunk.get("lignes_facture", [])

        if not isinstance(lines, list):
            continue

        for item in lines:
            if not isinstance(item, dict):
                continue

            designation = str(
                item.get("designation", "") or ""
            ).strip()

            if not designation:
                continue

            key = (
                str(
                    item.get("reference", "") or ""
                ).strip().upper(),
                designation.lower(),
                r3(
                    normalize_number(
                        item.get("quantite", 0)
                    )
                ),
                r3(
                    normalize_number(
                        item.get("prix_unitaire_num", 0)
                    )
                ),
                r3(
                    normalize_number(
                        item.get("montant_ht_num", 0)
                    )
                ),
            )

            if key in seen_lines:
                continue

            seen_lines.add(key)
            merged["lignes_facture"].append(item)

    return merged


def call_llm_single_chunk(
    raw_text: str,
    country: str,
    currency: str,
    chunk_number: int,
    total_chunks: int,
) -> Tuple[Dict[str, Any], str]:
    prompt = build_llm_prompt(
        raw_text=raw_text,
        country=country,
        currency=currency,
    )

    try:
        print(
            f"OLLAMA CHUNK {chunk_number}/{total_chunks} "
            f"- caractères={len(raw_text)}",
            flush=True,
        )

        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "stream": False,
                "format": "json",
                "keep_alive": "30m",
                "options": {
                    "temperature": 0,
                    "num_ctx": OLLAMA_NUM_CTX,
                    "num_predict": OLLAMA_NUM_PREDICT,
                },
                "messages": [
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
            },
            timeout=OLLAMA_TIMEOUT,
        )

        response.raise_for_status()

        response_data = response.json()

        content = (
            response_data
            .get("message", {})
            .get("content", "")
            .strip()
        )

        if not content:
            return {}, "empty_response"

        parsed = json.loads(content)

        if not isinstance(parsed, dict):
            return {}, "invalid_structure"

        return parsed, "ok"

    except requests.Timeout as exc:
        print(
            f"OLLAMA TIMEOUT CHUNK {chunk_number}: {exc}",
            flush=True,
        )
        return {}, "timeout"

    except requests.RequestException as exc:
        response_text = ""

        if getattr(exc, "response", None) is not None:
            response_text = exc.response.text[:1000]

        print(
            "OLLAMA HTTP ERROR: "
            f"chunk={chunk_number}, "
            f"url={OLLAMA_URL}, "
            f"model={OLLAMA_MODEL}, "
            f"error={exc}, "
            f"response={response_text}",
            flush=True,
        )

        return {}, "http_error"

    except json.JSONDecodeError as exc:
        print(
            f"OLLAMA JSON ERROR CHUNK {chunk_number}: {exc}",
            flush=True,
        )
        return {}, "invalid_json"

    except Exception as exc:
        print(
            f"OLLAMA ERROR CHUNK {chunk_number}: {exc}",
            flush=True,
        )
        return {}, "error"

def prepare_text_for_llm(text: str, max_chars: int = 6000) -> str:
    lines = clean_lines(text)

    if not lines:
        return ""

    selected = []

    # Début : fournisseur, client, numéro et dates
    selected.extend(lines[:100])

    important_patterns = [
        r"fournisseur",
        r"client",
        r"facture",
        r"adresse",
        r"siret",
        r"siren",
        r"tva",
        r"matricule",
        r"email",
        r"t[eé]l",
        r"[ée]ch[ée]ance",
        r"paiement",
        r"total",
        r"net\s+[àa]\s+payer",
        r"ht",
        r"ttc",
    ]

    for line in lines:
        if any(
            re.search(pattern, line, re.I)
            for pattern in important_patterns
        ):
            if line not in selected:
                selected.append(line)

    # Fin : totaux et conditions de paiement
    for line in lines[-100:]:
        if line not in selected:
            selected.append(line)

    return "\n".join(selected)[:max_chars]


def call_llm(
    raw_text: str,
    country: str,
    currency: str,
) -> Tuple[Dict[str, Any], str]:

    compact_text = prepare_text_for_llm(
        raw_text,
        max_chars=OLLAMA_CHUNK_MAX_CHARS,
    )

    if not compact_text:
        return {}, "empty_input"

    prompt = build_llm_prompt(
        raw_text=compact_text,
        country=country,
        currency=currency,
    )

    try:
        print(
            f"OLLAMA SINGLE REQUEST - caractères={len(compact_text)}",
            flush=True,
        )

        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "stream": False,
                "format": "json",
                "keep_alive": "30m",
                "options": {
                    "temperature": 0,
                    "num_ctx": OLLAMA_NUM_CTX,
                    "num_predict": OLLAMA_NUM_PREDICT,
                },
                "messages": [
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
            },
            timeout=OLLAMA_TIMEOUT,
        )

        response.raise_for_status()

        content = (
            response.json()
            .get("message", {})
            .get("content", "")
            .strip()
        )

        if not content:
            return {}, "empty_response"

        parsed = json.loads(content)

        if not isinstance(parsed, dict):
            return {}, "invalid_structure"

        return parsed, "ok"

    except requests.Timeout:
        print("OLLAMA TIMEOUT", flush=True)
        return {}, "timeout"

    except requests.RequestException as exc:
        print(f"OLLAMA HTTP ERROR: {exc}", flush=True)
        return {}, "http_error"

    except json.JSONDecodeError as exc:
        print(f"OLLAMA JSON ERROR: {exc}", flush=True)
        return {}, "invalid_json"

    except Exception as exc:
        print(f"OLLAMA ERROR: {exc}", flush=True)
        return {}, "error"



# =========================================================
# PYTHON ARTICLE EXTRACTION
# =========================================================

def amount_token_pattern() -> str:
    return r"-?(?:\d{1,3}(?:[ \u00a0]\d{3})+|\d+)[,.]\d{1,4}"


def is_generic_article_reference(value: str) -> bool:
    ref = str(value or "").strip().upper()

    if not re.fullmatch(r"[A-Z][A-Z0-9_\-]{2,24}", ref):
        return False

    forbidden = {
        "CLIENT", "FACTURE", "AVOIR", "REFERENCE", "REFERENCES",
        "DESIGNATION", "QUANTITE", "PRIX", "MONTANT", "TOTAL",
        "TVA", "TTC", "HT", "EUR", "TND", "DATE", "PAGE",
        "COMMERCIAL", "SIRET", "SIREN", "EMAIL", "TELEPHONE",
        "ADRESSE", "CODE", "ARTICLE", "ARTICLES", "UNIT",
    }

    return ref not in forbidden


def bad_designation(value: str) -> bool:
    designation = re.sub(r"\s+", " ", str(value or "")).strip()
    low = designation.lower()

    if len(designation) < 2:
        return True

    forbidden_exact = {
        "total", "total ht", "total ttc", "net à payer", "net a payer",
        "montant tva", "base tva", "sous-total", "référence", "reference",
        "désignation", "designation", "quantité", "quantite",
        "prix unitaire", "montant", "date", "client", "commercial",
    }

    return low in forbidden_exact


def clean_designation(value: str) -> str:
    text = re.sub(
        r"\bTva\s*:\s*\d+[,.]?\d*\s*%?",
        "",
        str(value or ""),
        flags=re.I,
    )
    return re.sub(r"\s+", " ", text).strip(" :-")


def build_article(
    reference: str,
    designation: str,
    quantity: Any,
    unit_price: Any,
    discounts: Any,
    tax_rate: Any,
    line_total: Any,
    currency: str,
    country: str,
) -> Optional[Dict[str, Any]]:
    designation = clean_designation(designation)
    reference = str(reference or "").strip().upper()

    quantity_num = r3(normalize_number(quantity))
    unit_price_num = r3(normalize_number(unit_price))
    line_total_num = r3(normalize_number(line_total))
    raw_tax_value = r2(normalize_number(tax_rate))
    legal_rates = {0.0, 5.5, 7.0, 10.0, 12.0, 13.0, 18.0, 19.0, 20.0}

    # Some invoices print an internal VAT code (for example 1 or 3),
    # not the actual percentage. In that case use the country default.
    if raw_tax_value in legal_rates and raw_tax_value > 0:
        tax_rate_num = raw_tax_value
    else:
        tax_rate_num = 19.0 if country == "TN" else 20.0 if country == "FR" else 0.0

    discount_values = normalize_discount_list(discounts)

    if bad_designation(designation):
        return None

    if quantity_num <= 0:
        return None

    if unit_price_num <= 0 and line_total_num <= 0:
        return None

    if line_total_num <= 0 and unit_price_num > 0:
        line_total_num = quantity_num * unit_price_num
        for discount in discount_values:
            line_total_num *= 1 - discount / 100.0
        line_total_num = r3(line_total_num)

    if tax_rate_num <= 0:
        tax_rate_num = 19.0 if country == "TN" else 20.0 if country == "FR" else 0.0

    return {
        "reference": reference,
        "designation": designation,
        "quantite": quantity_num,
        "unite": "UNIT",
        "prix_unitaire_num": unit_price_num,
        "remises": discount_values,
        "taux_tva_num": tax_rate_num,
        "montant_ht_num": line_total_num,
    }


def extract_same_line_articles_generic(
    text: str,
    country: str,
    currency: str,
) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    number = amount_token_pattern()

    patterns = [
        re.compile(
            rf"^([A-Z][A-Z0-9_\-]{{2,24}})\s+(.+?)\s+"
            rf"({number})\s+({number})\s+"
            rf"(?:(\d{{1,2}}(?:[,.]\d+)?(?:\+\d{{1,2}}(?:[,.]\d+)?)?)\s+)?"
            rf"({number})\s+(\d{{1,2}}(?:[,.]\d+)?)%?$",
            re.I,
        ),
        re.compile(
            rf"^([A-Z][A-Z0-9_\-]{{2,24}})\s+(.+?)\s+"
            rf"({number})\s+({number})\s+({number})$",
            re.I,
        ),
    ]

    for raw_line in clean_lines(text):
        line = re.sub(r"\s+", " ", raw_line).strip()

        match = patterns[0].match(line)
        if match:
            ref, desc, qty, unit, discount, total, tax = match.groups()

            if not is_generic_article_reference(ref):
                continue

            article = build_article(
                reference=ref,
                designation=desc,
                quantity=qty,
                unit_price=unit,
                discounts=discount or [],
                tax_rate=tax,
                line_total=total,
                currency=currency,
                country=country,
            )

            if article:
                result.append(article)
            continue

        match = patterns[1].match(line)
        if match:
            ref, desc, qty, unit, total = match.groups()

            if not is_generic_article_reference(ref):
                continue

            article = build_article(
                reference=ref,
                designation=desc,
                quantity=qty,
                unit_price=unit,
                discounts=[],
                tax_rate=0,
                line_total=total,
                currency=currency,
                country=country,
            )

            if article:
                result.append(article)

    return result


def extract_vertical_articles_generic(
    text: str,
    country: str,
    currency: str,
) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    lines = clean_lines(text)

    for index, raw_ref in enumerate(lines):
        ref = raw_ref.strip().upper()

        if not is_generic_article_reference(ref):
            continue

        # Format vertical fréquent :
        # designation / code TVA / prix unitaire / remise / montant / quantité / référence
        if index >= 6:
            desc = clean_designation(lines[index - 6])
            tax_code = lines[index - 5].strip()
            unit_price = normalize_number(lines[index - 4])
            discount = normalize_number(lines[index - 3])
            line_total = normalize_number(lines[index - 2])
            quantity = normalize_number(lines[index - 1])

            if (
                not bad_designation(desc)
                and re.fullmatch(r"\d{1,2}(?:[,.]\d+)?%?", tax_code)
                and quantity > 0
                and unit_price > 0
                and line_total != 0
                and 0 <= discount <= 100
            ):
                expected = quantity * unit_price * (1 - discount / 100.0)

                if abs(abs(expected) - abs(line_total)) <= max(
                    1.0,
                    abs(line_total) * 0.08,
                ):
                    article = build_article(
                        reference=ref,
                        designation=desc,
                        quantity=quantity,
                        unit_price=unit_price,
                        discounts=[discount] if discount else [],
                        tax_rate=tax_code,
                        line_total=line_total,
                        currency=currency,
                        country=country,
                    )

                    if article:
                        result.append(article)
                        continue

        # Même format sans remise :
        # designation / code TVA / prix unitaire / montant / quantité / référence
        if index >= 5:
            desc = clean_designation(lines[index - 5])
            tax_code = lines[index - 4].strip()
            unit_price = normalize_number(lines[index - 3])
            line_total = normalize_number(lines[index - 2])
            quantity = normalize_number(lines[index - 1])

            if (
                not bad_designation(desc)
                and re.fullmatch(r"\d{1,2}(?:[,.]\d+)?%?", tax_code)
                and quantity > 0
                and unit_price > 0
                and line_total != 0
            ):
                expected = quantity * unit_price

                if abs(abs(expected) - abs(line_total)) <= max(
                    1.0,
                    abs(line_total) * 0.08,
                ):
                    article = build_article(
                        reference=ref,
                        designation=desc,
                        quantity=quantity,
                        unit_price=unit_price,
                        discounts=[],
                        tax_rate=tax_code,
                        line_total=line_total,
                        currency=currency,
                        country=country,
                    )

                    if article:
                        result.append(article)

    return result


def format_extracted_articles(
    raw_articles: List[Dict[str, Any]],
    currency: str,
) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    seen = set()

    for item in raw_articles:
        key = (
            str(item.get("reference", "")).strip().upper(),
            str(item.get("designation", "")).strip().lower(),
            r3(item.get("quantite", 0)),
            r3(item.get("prix_unitaire_num", 0)),
            r3(item.get("montant_ht_num", 0)),
        )

        if key in seen:
            continue

        seen.add(key)

        result.append({
            "numero_ligne": len(result) + 1,
            "reference": str(item.get("reference", "")).strip().upper(),
            "designation": str(item.get("designation", "")).strip(),
            "quantite": r3(item.get("quantite", 0)),
            "unite": str(item.get("unite", "UNIT") or "UNIT").upper(),
            "prix_unitaire": money_str(
                item.get("prix_unitaire_num", 0),
                currency,
            ),
            "prix_unitaire_num": r3(
                item.get("prix_unitaire_num", 0)
            ),
            "remises": item.get("remises", []),
            "taux_tva": f"{r2(item.get('taux_tva_num', 0))} %",
            "taux_tva_num": r2(item.get("taux_tva_num", 0)),
            "montant_ht": money_str(
                item.get("montant_ht_num", 0),
                currency,
            ),
            "montant_ht_num": r3(
                item.get("montant_ht_num", 0)
            ),
        })

    return result


def extract_articles(
    text: str,
    country: str,
    currency: str,
) -> List[Dict[str, Any]]:
    raw_articles = extract_same_line_articles_generic(
        text=text,
        country=country,
        currency=currency,
    )

    if not raw_articles and country == "TN":
        raw_articles = extract_tunisian_vertical_articles(
            text=text,
            currency=currency,
        )

    if not raw_articles:
        raw_articles = extract_vertical_articles_generic(
            text=text,
            country=country,
            currency=currency,
        )

    return format_extracted_articles(
        raw_articles=raw_articles,
        currency=currency,
    )



# =========================================================
# ROBUST PYTHON FALLBACKS FOR PARTIES AND TUNISIAN TABLES
# =========================================================

def is_noise_company_line(line: str) -> bool:
    value = re.sub(r"\s+", " ", str(line or "")).strip()
    low = value.lower()

    if len(value) < 3 or len(value) > 100:
        return True

    forbidden = (
        "facture", "avoir", "invoice", "date", "page", "client",
        "référence", "reference", "désignation", "designation",
        "quantité", "quantite", "prix", "montant", "total",
        "tva", "ttc", "ht", "siret", "siren", "matricule",
        "email", "site web", "téléphone", "telephone", "fax",
        "commercial", "échéance", "echeance", "paiement",
    )

    if any(word in low for word in forbidden):
        return True

    if re.fullmatch(r"[\d\s,./+\-]+", value):
        return True

    if "@" in value or value.lower().startswith(("www.", "http://", "https://")):
        return True

    return False


def company_name_from_email(email: str) -> str:
    email = str(email or "").strip().lower()
    if "@" not in email:
        return ""

    domain = email.split("@", 1)[1].split(".", 1)[0]
    generic = {"gmail", "yahoo", "hotmail", "outlook", "live", "protonmail"}

    if not domain or domain in generic:
        return ""

    # tenorafrique -> Tenor Afrique, papyrus -> Papyrus
    domain = re.sub(r"[_\-]+", " ", domain)
    domain = re.sub(r"(?<=[a-z])(?=afrique|solutions|service|services|group|consulting)", " ", domain)
    return " ".join(part.capitalize() for part in domain.split())


def extract_address_near(lines: List[str], start: int, radius: int = 15) -> str:
    address_words = (
        "rue", "avenue", "av.", "boulevard", "bld", "résidence",
        "residence", "route", "zone", "zi ", "cedex", "tunis",
        "ariana", "carthage", "boumhell", "france", "tunisie",
    )

    result: List[str] = []
    begin = max(0, start - radius)
    end = min(len(lines), start + radius + 1)

    for line in lines[begin:end]:
        low = line.lower()
        if any(word in low for word in address_words):
            if line not in result:
                result.append(line)

    return ", ".join(result[:4])



def clean_company_name_value(value: str) -> str:
    name = re.sub(r"\s+", " ", str(value or "")).strip(" :-")
    # Remove software/version suffixes accidentally extracted from headers.
    name = re.sub(
        r"\s*\((?:v(?:ersion)?\s*)?[A-Za-z0-9._-]+\)\s*$",
        "",
        name,
        flags=re.I,
    )
    return name.strip()


def extract_address_forward(
    lines: List[str],
    start: int,
    max_lines: int = 14,
) -> str:
    address_markers = (
        "rue", "avenue", "av.", "boulevard", "bld", "résidence",
        "residence", "route", "zone", "zi ", "cedex", "tunis",
        "ariana", "carthage", "boumhell", "france", "tunisie",
        "amiens", "limoges", "aubenas", "muzols", "millau",
    )

    stop_markers = (
        "facture", "avoir", "référence", "reference", "désignation",
        "designation", "quantité", "quantite", "prix unitaire",
        "total ht", "total ttc", "net à payer", "net a payer",
        "client :", "code client", "commercial",
    )

    result: List[str] = []
    end = min(len(lines), start + max_lines + 1)

    for line in lines[start + 1:end]:
        low = line.lower()

        if any(marker in low for marker in stop_markers):
            if result:
                break
            continue

        if any(marker in low for marker in address_markers):
            if line not in result:
                result.append(line)

    return ", ".join(result[:4])


def extract_labeled_identifier(text: str, labels: List[str]) -> str:
    label_pattern = "|".join(labels)
    patterns = [
        rf"(?:{label_pattern})\s*[:#-]?\s*([A-Z0-9/]+)",
        rf"([A-Z0-9/]+)\s*(?:{label_pattern})",
    ]

    for pattern in patterns:
        match = re.search(pattern, text or "", re.I)
        if match:
            value = match.group(1).upper().strip()
            if len(value) >= 7:
                return value

    return ""


def extract_parties_python(
    text: str,
    country: str,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    lines = clean_lines(text)
    emails = extract_emails(text)
    websites = extract_websites(text)
    phones = extract_phone_candidates(text)
    tax_ids = extract_tax_ids(text)

    supplier: Dict[str, Any] = {
        "nom": "",
        "identifiant": "",
        "matricule_fiscal_ou_tva": "",
        "siret": "",
        "adresse": "",
        "pays": country,
        "telephone": phones[0] if phones else "",
        "email": emails[0] if emails else "",
        "site_web": websites[0] if websites else "",
    }

    client: Dict[str, Any] = {
        "code_client": extract_client_code_fallback(text),
        "nom": "",
        "identifiant": "",
        "matricule_fiscal_ou_tva": "",
        "siren": "",
        "adresse": "",
        "pays": country,
    }

    # Supplier name: prefer a textual line matching the website/email domain.
    domain_hint = ""
    if emails:
        domain_hint = emails[0].split("@", 1)[-1].split(".", 1)[0].lower()
    elif websites:
        domain_hint = re.sub(r"^www\.", "", websites[0].lower()).split(".", 1)[0]

    supplier_index = -1

    if domain_hint:
        compact_hint = re.sub(r"[^a-z0-9]", "", domain_hint)

        for index, line in enumerate(lines[:100]):
            compact_line = re.sub(r"[^a-z0-9]", "", line.lower())
            if compact_hint and compact_hint in compact_line and not is_noise_company_line(line):
                supplier["nom"] = clean_company_name_value(line)
                supplier_index = index
                break

    if not supplier["nom"] and emails:
        supplier["nom"] = clean_company_name_value(company_name_from_email(emails[0]))

    if not supplier["nom"]:
        for index, line in enumerate(lines[:35]):
            if not is_noise_company_line(line):
                supplier["nom"] = clean_company_name_value(line)
                supplier_index = index
                break

    if supplier_index >= 0:
        supplier["adresse"] = extract_address_forward(lines, supplier_index)

    # Tax identifiers.
    supplier_labeled_tax = extract_labeled_identifier(
        text,
        [
            r"TVA\s*intra(?:communautaire)?",
            r"matricule\s+fiscal",
            r"code\s+TVA",
        ],
    )

    client_labeled_tax = extract_labeled_identifier(
        text,
        [
            r"matricule\s+fiscal\s+client",
            r"TVA\s+client",
            r"identifiant\s+fiscal\s+client",
        ],
    )

    if supplier_labeled_tax:
        supplier["identifiant"] = supplier_labeled_tax.replace("/", "")
        supplier["matricule_fiscal_ou_tva"] = supplier_labeled_tax

    if client_labeled_tax:
        client["identifiant"] = client_labeled_tax.replace("/", "")
        client["matricule_fiscal_ou_tva"] = client_labeled_tax

    if country == "FR":
        if not supplier.get("matricule_fiscal_ou_tva"):
            for value in tax_ids:
                if value.startswith("FR"):
                    supplier["identifiant"] = value
                    supplier["matricule_fiscal_ou_tva"] = value
                    break

        siret_match = re.search(r"\bSIRET\s*[:\-]?\s*(\d{14})\b", text or "", re.I)
        if siret_match:
            supplier["siret"] = siret_match.group(1)

    elif country == "TN":
        if not supplier.get("matricule_fiscal_ou_tva"):
            for value in tax_ids:
                if re.fullmatch(r"\d{7}[A-Z](?:[A-Z]{1,2}\d{3})?", value) or "/" in value:
                    supplier["identifiant"] = value.replace("/", "")
                    supplier["matricule_fiscal_ou_tva"] = value
                    break

    # Client name: search around the structured client code first.
    code = client["code_client"]
    client_index = -1

    if code:
        for index, line in enumerate(lines):
            if code.lower() in line.lower():
                client_index = index
                break

    candidate_ranges: List[range] = []
    if client_index >= 0:
        candidate_ranges.append(range(max(0, client_index - 12), min(len(lines), client_index + 12)))

    # A common layout places the customer block after the supplier website.
    website_index = -1
    for index, line in enumerate(lines):
        if "www." in line.lower() or "http" in line.lower():
            website_index = index
            break

    if website_index >= 0:
        candidate_ranges.append(range(website_index + 1, min(len(lines), website_index + 35)))

    # Explicit "Client: NAME".
    explicit = re.search(r"\bclient\s*:\s*([^\n]+)", text or "", re.I)
    if explicit:
        value = explicit.group(1).strip()
        if not is_noise_company_line(value):
            client["nom"] = clean_company_name_value(value)

    if not client["nom"]:
        for candidate_range in candidate_ranges:
            for index in candidate_range:
                line = lines[index]
                if is_noise_company_line(line):
                    continue
                if supplier["nom"] and supplier["nom"].lower() in line.lower():
                    continue
                if re.search(r"\b(?:rue|avenue|boulevard|cedex|france|tunisie)\b", line, re.I):
                    continue

                client["nom"] = clean_company_name_value(line)
                client_index = index
                break

            if client["nom"]:
                break

    if client_index >= 0:
        client["adresse"] = extract_address_forward(lines, client_index)

    # Client fiscal ID: when two or more IDs are present, use one different from supplier.
    supplier_tax = supplier.get("matricule_fiscal_ou_tva", "")
    if not client.get("matricule_fiscal_ou_tva"):
        for value in tax_ids:
            if value != supplier_tax:
                if country == "TN" and ("/" in value or re.fullmatch(r"\d{7}[A-Z]{1,3}\d{0,3}", value)):
                    client["matricule_fiscal_ou_tva"] = value
                    client["identifiant"] = value.replace("/", "")
                    break

    if not client["identifiant"]:
        client["identifiant"] = client["code_client"]

    return supplier, client


def merge_missing_values(
    primary: Dict[str, Any],
    fallback: Dict[str, Any],
) -> Dict[str, Any]:
    result = dict(primary or {})

    for key, value in (fallback or {}).items():
        if result.get(key) in (None, "", [], {}, 0, 0.0) and value not in (None, "", [], {}, 0, 0.0):
            result[key] = value

    return result


def extract_tunisian_vertical_articles(
    text: str,
    currency: str,
) -> List[Dict[str, Any]]:
    """
    Handles common Tunisian native PDF order:
      amount / unit price / discount1 / designation / discount2 / quantity / reference
    or:
      amount / unit price / designation / discount / quantity / reference
    """
    result: List[Dict[str, Any]] = []
    lines = clean_lines(text)

    for index, raw_ref in enumerate(lines):
        reference = raw_ref.strip().upper()

        if not is_generic_article_reference(reference):
            continue

        if index >= 6:
            total = normalize_number(lines[index - 6])
            unit = normalize_number(lines[index - 5])
            discount1 = normalize_number(lines[index - 4])
            designation = clean_designation(lines[index - 3])
            discount2 = normalize_number(lines[index - 2])
            quantity = normalize_number(lines[index - 1])

            if (
                total > 0
                and unit > 0
                and quantity > 0
                and not bad_designation(designation)
                and 0 <= discount1 <= 100
                and 0 <= discount2 <= 100
            ):
                article = build_article(
                    reference=reference,
                    designation=designation,
                    quantity=quantity,
                    unit_price=unit,
                    discounts=[discount1, discount2],
                    tax_rate=19,
                    line_total=total,
                    currency=currency,
                    country="TN",
                )
                if article:
                    result.append(article)
                    continue

        if index >= 5:
            total = normalize_number(lines[index - 5])
            unit = normalize_number(lines[index - 4])
            designation = clean_designation(lines[index - 3])
            discount = normalize_number(lines[index - 2])
            quantity = normalize_number(lines[index - 1])

            if (
                total > 0
                and unit > 0
                and quantity > 0
                and not bad_designation(designation)
                and 0 <= discount <= 100
            ):
                article = build_article(
                    reference=reference,
                    designation=designation,
                    quantity=quantity,
                    unit_price=unit,
                    discounts=[discount] if discount else [],
                    tax_rate=19,
                    line_total=total,
                    currency=currency,
                    country="TN",
                )
                if article:
                    result.append(article)

    return result

# =========================================================
# NORMALIZATION
# =========================================================

def normalize_party(
    data: Dict[str, Any],
    country: str,
    is_supplier: bool,
) -> Dict[str, Any]:
    # A customer code such as C0000003 is an identifier, not a VAT number.
    tax_id = str(
        data.get("matricule_fiscal_ou_tva", "") or ""
    ).strip()

    identifier = str(
        first_non_empty(
            data.get("identifiant"),
            tax_id.replace("/", ""),
            data.get("code_client"),
        )
        or ""
    ).strip()

    base = {
        "nom": str(
            data.get("nom", "") or ""
        ).strip(),
        "identifiant": identifier,
        "type_identifiant": (
            "I-01"
            if country == "TN"
            else "I-04"
            if country == "FR"
            else ""
        ),
        "matricule_fiscal_ou_tva": tax_id,
        "adresse": str(
            data.get("adresse", "") or ""
        ).strip(),
        "pays": (
            str(
                data.get("pays", "") or country
            ).strip()
            or country
        ),
    }

    if is_supplier:
        base.update({
            "numero_fournisseur": identifier,
            "siret": str(
                data.get("siret", "") or ""
            ).strip(),
            "telephone": str(
                data.get("telephone", "") or ""
            ).strip(),
            "email": str(
                data.get("email", "") or ""
            ).strip(),
            "site_web": str(
                data.get("site_web", "") or ""
            ).strip(),
        })

    else:
        base.update({
            "code_client": str(
                data.get("code_client", "") or ""
            ).strip(),
            "siren": str(
                data.get("siren", "") or ""
            ).strip(),
        })

    return base


def normalize_invoice(
    data: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "numero": compact_invoice_number(
            data.get("numero", "")
        ),
        "date_facture": parse_date(
            data.get("date_facture", "")
        ),
        "date_echeance": parse_date(
            data.get("date_echeance", "")
        ),
        "reference": str(
            data.get("reference", "") or ""
        ).strip(),
        "commercial": str(
            data.get("commercial", "") or ""
        ).strip(),
        "mode_paiement": str(
            data.get("mode_paiement", "") or ""
        ).strip(),
        "conditions_paiement": str(
            data.get("conditions_paiement", "") or ""
        ).strip(),
    }


def normalize_discount_list(
    value: Any,
) -> List[float]:
    if isinstance(value, list):
        candidates = value
    elif value in (None, ""):
        candidates = []
    else:
        candidates = re.split(
            r"[+;/]",
            str(value),
        )

    result = []

    for candidate in candidates:
        number = r2(
            normalize_number(candidate)
        )

        if number > 0:
            result.append(number)

    return result


def normalize_articles(
    raw_articles: List[Any],
    currency: str,
    country: str,
) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []

    for raw in raw_articles:
        if not isinstance(raw, dict):
            continue

        designation = str(
            raw.get("designation", "") or ""
        ).strip()

        reference = str(
            raw.get("reference", "") or ""
        ).strip().upper()

        quantity = r3(
            normalize_number(
                raw.get("quantite", 0)
            )
        )

        unit_price = r3(
            normalize_number(
                raw.get("prix_unitaire_num", 0)
            )
        )

        line_total = r3(
            normalize_number(
                raw.get("montant_ht_num", 0)
            )
        )

        tax_rate = r2(
            normalize_number(
                raw.get("taux_tva_num", 0)
            )
        )

        discounts = normalize_discount_list(
            raw.get("remises", [])
        )

        if not designation:
            continue

        if quantity <= 0:
            quantity = 1.0

        if line_total <= 0 and unit_price > 0:
            line_total = quantity * unit_price

            for discount in discounts:
                line_total *= 1 - discount / 100

            line_total = r3(line_total)

        if tax_rate <= 0:
            if country == "TN":
                tax_rate = 19.0
            elif country == "FR":
                tax_rate = 20.0
            else:
                tax_rate = 0.0

        result.append({
            "numero_ligne": len(result) + 1,
            "reference": reference,
            "designation": designation,
            "quantite": quantity,
            "unite": str(
                raw.get("unite", "") or "UNIT"
            ).strip().upper(),
            "prix_unitaire": money_str(
                unit_price,
                currency,
            ),
            "prix_unitaire_num": unit_price,
            "remises": discounts,
            "taux_tva": f"{tax_rate} %",
            "taux_tva_num": tax_rate,
            "montant_ht": money_str(
                line_total,
                currency,
            ),
            "montant_ht_num": line_total,
        })

    return result


def normalize_totals(
    raw_totals: Dict[str, Any],
    fallback_totals: Dict[str, float],
    articles: List[Dict[str, Any]],
    country: str,
    currency: str,
) -> Dict[str, Any]:
    total_ht = r3(
        first_non_empty(
            normalize_number(
                raw_totals.get("total_ht_num")
            ),
            fallback_totals.get("total_ht"),
        )
    )

    base_tva = r3(
        first_non_empty(
            normalize_number(
                raw_totals.get("base_tva_num")
            ),
            fallback_totals.get("base_tva"),
            total_ht,
        )
    )

    tva = r3(
        first_non_empty(
            normalize_number(
                raw_totals.get("montant_tva_num")
            ),
            fallback_totals.get("montant_tva"),
        )
    )

    timbre = r3(
        first_non_empty(
            normalize_number(
                raw_totals.get("timbre_fiscal_num")
            ),
            fallback_totals.get("timbre_fiscal"),
        )
    )

    remise = r3(
        first_non_empty(
            normalize_number(
                raw_totals.get("remise_globale_num")
            ),
            fallback_totals.get("remise_globale"),
        )
    )

    total_ttc = r3(
        first_non_empty(
            normalize_number(
                raw_totals.get("total_ttc_num")
            ),
            fallback_totals.get("total_ttc"),
        )
    )

    net = r3(
        first_non_empty(
            normalize_number(
                raw_totals.get("net_a_payer_num")
            ),
            fallback_totals.get("net_a_payer"),
        )
    )

    sum_lines = r3(
        sum(
            float(
                item.get("montant_ht_num", 0)
            )
            for item in articles
        )
    )

    if not total_ht and sum_lines:
        total_ht = r3(sum_lines - remise)
        base_tva = total_ht

    # Prefer the exact line sum when the parsed HT is clearly inconsistent.
    if total_ht and sum_lines and abs(total_ht - (sum_lines - remise)) > max(0.05, abs(total_ht) * 0.05):
        total_ht = r3(sum_lines - remise)
        base_tva = total_ht

    if not tva and total_ht:
        rates = [
            float(
                item.get("taux_tva_num", 0)
            )
            for item in articles
            if float(
                item.get("taux_tva_num", 0)
            ) > 0
        ]

        if rates and len(set(rates)) == 1:
            tva = r3(
                total_ht * rates[0] / 100
            )

    if not total_ttc and total_ht:
        total_ttc = r3(
            total_ht + tva
        )

    if not net:
        if country == "TN":
            expected_with_stamp = r3(
                total_ht + tva + timbre
            )

            if (
                total_ttc
                and abs(
                    total_ttc - expected_with_stamp
                ) <= 0.05
            ):
                net = total_ttc
            else:
                net = r3(
                    total_ttc + timbre
                )
        else:
            net = total_ttc

    if (
        country == "TN"
        and timbre > 0
        and total_ttc > 0
        and abs(
            net - total_ttc - timbre
        ) <= 0.05
        and abs(
            total_ttc
            - (
                total_ht
                + tva
                + timbre
            )
        ) <= 0.05
    ):
        net = total_ttc

    return {
        "total_ht_num": total_ht,
        "base_tva_num": base_tva,
        "montant_tva_num": tva,
        "timbre_fiscal_num": timbre,
        "remise_globale_num": remise,
        "total_ttc_num": total_ttc,
        "net_a_payer_num": net,
        "somme_lignes_ht_num": sum_lines,
        "total_ht": money_str(
            total_ht,
            currency,
        ),
        "base_tva": money_str(
            base_tva,
            currency,
        ),
        "montant_tva": money_str(
            tva,
            currency,
        ),
        "timbre_fiscal": money_str(
            timbre,
            currency,
        ),
        "remise_globale": money_str(
            remise,
            currency,
        ),
        "frais_port_non_soumis": money_str(
            0,
            currency,
        ),
        "frais_port_soumis": money_str(
            0,
            currency,
        ),
        "frais_emballage": money_str(
            0,
            currency,
        ),
        "total_ttc": money_str(
            total_ttc,
            currency,
        ),
        "net_a_payer": money_str(
            net,
            currency,
        ),
    }


# =========================================================
# MERGE WITH FALLBACK
# =========================================================

def merge_with_fallback(
    llm_data: Dict[str, Any],
    text: str,
    country: str,
) -> Dict[str, Any]:
    supplier = safe_dict(
        llm_data.get("fournisseur")
    )

    client = safe_dict(
        llm_data.get("client")
    )

    invoice = safe_dict(
        llm_data.get("facture")
    )

    emails = extract_emails(text)
    websites = extract_websites(text)
    phones = extract_phone_candidates(text)
    tax_ids = extract_tax_ids(text)
    dates = extract_dates_fallback(text)

    if not supplier.get("email") and emails:
        supplier["email"] = emails[0]

    if (
        not supplier.get("site_web")
        and websites
    ):
        supplier["site_web"] = websites[0]

    if (
        not supplier.get("telephone")
        and phones
    ):
        supplier["telephone"] = phones[0]

    if not invoice.get("numero"):
        invoice["numero"] = (
            extract_invoice_number_fallback(text)
        )

    if (
        not invoice.get("date_facture")
        and dates
    ):
        invoice["date_facture"] = dates[0]

    if not invoice.get("date_echeance"):
        invoice["date_echeance"] = (
            extract_due_date_fallback(
                text=text,
                invoice_date=str(
                    invoice.get(
                        "date_facture",
                        "",
                    )
                    or ""
                ),
            )
        )

    if not client.get("code_client"):
        client["code_client"] = (
            extract_client_code_fallback(text)
        )

    if len(tax_ids) == 1:
        tax_id = tax_ids[0]

        if (
            not supplier.get(
                "matricule_fiscal_ou_tva"
            )
            and not client.get(
                "matricule_fiscal_ou_tva"
            )
        ):
            supplier[
                "matricule_fiscal_ou_tva"
            ] = tax_id

    llm_data["fournisseur"] = supplier
    llm_data["client"] = client
    llm_data["facture"] = invoice

    return llm_data


# =========================================================
# VALIDATION
# =========================================================

def validate_extraction(
    articles: List[Dict[str, Any]],
    totals: Dict[str, Any],
    supplier: Dict[str, Any],
    client: Dict[str, Any],
    invoice: Dict[str, Any],
    country: str,
    currency: str,
) -> Dict[str, Any]:
    errors: List[str] = []
    warnings: List[str] = []

    if not supplier.get("nom"):
        errors.append(
            "Nom du fournisseur manquant"
        )

    if not client.get("nom"):
        errors.append(
            "Nom du client manquant"
        )

    if not invoice.get("numero"):
        errors.append(
            "Numéro de facture manquant"
        )

    if not articles:
        errors.append(
            "Aucune ligne de facture détectée"
        )

    sum_lines = float(
        totals.get(
            "somme_lignes_ht_num",
            0,
        )
    )

    total_ht = float(
        totals.get(
            "total_ht_num",
            0,
        )
    )

    remise = float(
        totals.get(
            "remise_globale_num",
            0,
        )
    )

    tva = float(
        totals.get(
            "montant_tva_num",
            0,
        )
    )

    timbre = float(
        totals.get(
            "timbre_fiscal_num",
            0,
        )
    )

    net = float(
        totals.get(
            "net_a_payer_num",
            0,
        )
    )

    expected_ht = r3(
        sum_lines - remise
    )

    if (
        total_ht
        and sum_lines
        and abs(
            expected_ht - total_ht
        ) > max(
            0.05,
            abs(total_ht) * 0.01,
        )
    ):
        warnings.append(
            "La somme des lignes ne correspond pas exactement au total HT"
        )

    port_non_soumis = float(
        totals.get("frais_port_non_soumis_num", 0)
    )
    port_soumis = float(
        totals.get("frais_port_soumis_num", 0)
    )
    emballage = float(
        totals.get("frais_emballage_num", 0)
    )

    expected_net = r3(
        total_ht
        + port_non_soumis
        + port_soumis
        + emballage
        + tva
        + (
            timbre
            if country == "TN"
            else 0
        )
    )

    difference = r3(
        net - expected_net
    )

    if net and abs(difference) > 0.05:
        errors.append(
            "Total HT + TVA + timbre fiscal ne correspond pas au net à payer"
        )

    return {
        "statut": (
            "OK"
            if not errors
            else "À vérifier"
        ),
        "peut_generer_teif": (
            len(errors) == 0
        ),
        "nombre_lignes_detectees": len(
            articles
        ),
        "somme_lignes_ht": money_str(
            sum_lines,
            currency,
        ),
        "remise_globale": money_str(
            remise,
            currency,
        ),
        "montant_attendu": money_str(
            expected_net,
            currency,
        ),
        "difference": money_str(
            difference,
            currency,
        ),
        "erreurs_bloquantes": errors,
        "avertissements": warnings,
    }



# =========================================================
# DOCUMENT-AWARE CORRECTIONS FOR PARTIES, TOTALS AND HEADER
# =========================================================

def find_line_index(lines: List[str], pattern: str, start: int = 0) -> int:
    for index in range(start, len(lines)):
        if re.search(pattern, lines[index], re.I):
            return index
    return -1


def unique_join(values: List[str]) -> str:
    result: List[str] = []
    for value in values:
        cleaned = re.sub(r"\s+", " ", str(value or "")).strip(" ,")
        if cleaned and cleaned not in result:
            result.append(cleaned)
    return ", ".join(result)


def extract_tn_parties_precise(text: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    lines = clean_lines(text)
    emails = extract_emails(text)
    websites = extract_websites(text)

    client_tax_match = re.search(
        r"\b(\d{7}[A-Z]/[A-Z]/[A-Z]/\d{3})\b",
        text or "",
        re.I,
    )
    client_tax = client_tax_match.group(1).upper() if client_tax_match else ""

    text_without_client_tax = (
        (text or "").replace(client_tax, " ")
        if client_tax
        else (text or "")
    )

    supplier_tax_match = re.search(
        r"\b(\d{7}[A-Z])\b",
        text_without_client_tax,
        re.I,
    )
    supplier_tax = (
        supplier_tax_match.group(1).upper()
        if supplier_tax_match
        else ""
    )

    supplier_name = ""
    if emails:
        supplier_name = clean_company_name_value(
            company_name_from_email(emails[0])
        )

    # Supplier address: in native PDFs it is commonly printed after the
    # telephone and before the invoice date/header.
    supplier_address_parts: List[str] = []

    phone_index = -1
    for index, line in enumerate(lines):
        if re.search(r"\+?216", line):
            phone_index = index
            break

    if phone_index >= 0:
        for line in lines[phone_index + 1:phone_index + 8]:
            low = line.lower()

            if re.search(
                r"\b(?:facture|date|numéro|numero|client)\b",
                low,
            ) or re.search(r"\d{2}/\d{2}/\d{2,4}", line):
                break

            if (
                "résidence" in low
                or "residence" in low
                or "jardins" in low
                or "carthage" in low
                or line.strip().upper() == "TUNIS"
                or re.fullmatch(r"20\d{2}", line)
            ):
                supplier_address_parts.append(line)

    # Fallback from all lines if the PDF order differs.
    if not supplier_address_parts:
        for line in lines:
            low = line.lower()
            if (
                "résidence arche" in low
                or "residence arche" in low
                or "jardins de carthage" in low
                or line.strip().upper() == "TUNIS"
                or re.fullmatch(r"2046", line)
            ):
                supplier_address_parts.append(line)

    forbidden_names = {
        "REMISE", "QUANTITÉ", "QUANTITE", "RÉFÉRENCE",
        "REFERENCE", "DÉSIGNATION", "DESIGNATION", "MONTANT",
        "CLIENT", "COMMERCIAL", "FACTURE", "TND", "TUNISIE",
    }

    frequencies: Dict[str, int] = {}
    for line in lines[:70]:
        candidate = clean_company_name_value(line)
        upper = candidate.upper()

        if (
            not candidate
            or upper in forbidden_names
            or is_noise_company_line(candidate)
            or re.search(r"\d{7}", candidate)
            or re.search(
                r"\b(?:AVENUE|RUE|ROUTE|BOUMHELL|TUNIS|CARTHAGE)\b",
                upper,
            )
        ):
            continue

        if upper == candidate and re.search(r"[A-Z]", candidate):
            frequencies[candidate] = frequencies.get(candidate, 0) + 1

    repeated = [
        name
        for name, count in frequencies.items()
        if count >= 2 and name.lower() != supplier_name.lower()
    ]
    client_name = repeated[0] if repeated else ""

    client_address_parts: List[str] = []
    if client_name:
        occurrences = [
            index
            for index, line in enumerate(lines)
            if clean_company_name_value(line).upper() == client_name.upper()
        ]
        client_index = occurrences[-1] if occurrences else -1

        if client_index >= 0:
            for line in lines[client_index + 1:client_index + 8]:
                low = line.lower()

                if re.search(
                    r"\b(?:matricule|facture|date|numéro|numero)\b",
                    low,
                ):
                    break

                if (
                    "avenue" in low
                    or "boumhell" in low
                    or line.strip().upper() == "TN TUNISIE"
                    or re.fullmatch(r"\d{5}\s+.+", line)
                ):
                    client_address_parts.append(line)

    phone = ""
    phone_match = re.search(
        r"(?:\+216[\s\-]*)"
        r"(\d{2}(?:[\s\-]+\d{2}){3})",
        text or "",
        re.I,
    )
    if phone_match:
        phone = re.sub(r"[\-]+", " ", phone_match.group(1))
        phone = re.sub(r"\s+", " ", phone).strip()

    supplier = {
        "nom": supplier_name,
        "identifiant": supplier_tax,
        "matricule_fiscal_ou_tva": supplier_tax,
        "siret": "",
        "adresse": unique_join(supplier_address_parts),
        "pays": "TN",
        "telephone": phone,
        "email": emails[0] if emails else "",
        "site_web": websites[0] if websites else "",
    }

    client = {
        "code_client": extract_client_code_fallback(text),
        "nom": client_name,
        "identifiant": (
            client_tax.replace("/", "")
            if client_tax
            else extract_client_code_fallback(text)
        ),
        "matricule_fiscal_ou_tva": client_tax,
        "siren": "",
        "adresse": unique_join(client_address_parts),
        "pays": "TN",
    }

    return supplier, client

def extract_fr_parties_precise(text: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    lines = clean_lines(text)
    emails = extract_emails(text)
    websites = extract_websites(text)
    tax_ids = extract_tax_ids(text)

    supplier_name = ""
    supplier_index = -1

    for index, line in enumerate(lines[:80]):
        if emails:
            domain = emails[0].split("@", 1)[1].split(".", 1)[0].lower()
            if domain in re.sub(r"[^a-z0-9]", "", line.lower()):
                supplier_name = clean_company_name_value(line)
                supplier_index = index
                break

    if not supplier_name and emails:
        supplier_name = clean_company_name_value(
            company_name_from_email(emails[0])
        )

    supplier_address_parts: List[str] = []
    if supplier_index >= 0:
        for line in lines[supplier_index + 1:supplier_index + 8]:
            low = line.lower()
            if re.search(r"\b(?:fax|e_mail|email|site web)\b", low):
                break
            if (
                "rue" in low
                or "cedex" in low
                or "avenue" in low
                or "boulevard" in low
                or re.fullmatch(r"\d{4,5}", line)
            ):
                supplier_address_parts.append(line)

    # Supplier phone is the first French phone after supplier name/address.
    phone = ""
    if supplier_index >= 0:
        for line in lines[supplier_index + 1:supplier_index + 12]:
            if re.fullmatch(r"0\d(?:[\s.\-]?\d{2}){4}", line):
                phone = line
                break

    client_name = ""
    client_index = -1
    website_index = find_line_index(lines, r"www\.|https?://")
    search_start = website_index + 1 if website_index >= 0 else 0

    for index in range(search_start, min(len(lines), search_start + 35)):
        line = lines[index]
        if is_noise_company_line(line):
            continue
        if supplier_name and supplier_name.lower() in line.lower():
            continue
        if re.search(r"\b(?:rue|cedex|france|avenue|boulevard)\b", line, re.I):
            continue
        if re.fullmatch(r"\d+", line):
            continue
        client_name = clean_company_name_value(line)
        client_index = index
        break

    client_address_parts: List[str] = []
    if client_index >= 0:
        for line in lines[client_index + 1:client_index + 10]:
            low = line.lower()
            if re.search(r"\b(?:facture|date|numéro|numero|client|commercial)\b", low):
                break
            if (
                any(key in low for key in (
                    "rue", "cedex", "france", "avenue", "boulevard",
                    "amiens", "limoges", "aubenas", "millau",
                ))
                or re.fullmatch(r"\d{4,5}\s+.+", line)
            ):
                client_address_parts.append(line)

    supplier_vat = ""
    for value in tax_ids:
        if value.startswith("FR"):
            supplier_vat = value
            break

    supplier_siret = ""
    # In these PDFs a 14-digit SIRET is printed near TVA Intra.
    fourteen_digit_values = re.findall(r"\b\d{14}\b", text or "")
    if fourteen_digit_values:
        supplier_siret = fourteen_digit_values[0]

    client_siren = ""
    # Customer SIREN is the isolated 9-digit value immediately before "Facture".
    facture_index = find_line_index(lines, r"^Facture(?:\s+\d+)?$")
    if facture_index > 0:
        for line in reversed(lines[max(0, facture_index - 8):facture_index]):
            if re.fullmatch(r"\d{9}", line):
                client_siren = line
                break

    supplier = {
        "nom": supplier_name,
        "identifiant": supplier_vat,
        "matricule_fiscal_ou_tva": supplier_vat,
        "siret": supplier_siret,
        "adresse": unique_join(supplier_address_parts),
        "pays": "FR",
        "telephone": phone,
        "email": emails[0] if emails else "",
        "site_web": websites[0] if websites else "",
    }

    client = {
        "code_client": extract_client_code_fallback(text),
        "nom": client_name,
        "identifiant": extract_client_code_fallback(text),
        "matricule_fiscal_ou_tva": "",
        "siren": client_siren,
        "adresse": unique_join(client_address_parts),
        "pays": "FR",
    }

    return supplier, client

def extract_invoice_header_precise(
    text: str,
    country: str,
    current_invoice: Dict[str, Any],
) -> Dict[str, Any]:
    result = dict(current_invoice or {})
    lines = clean_lines(text)

    if country == "FR":
        # Commercial code and name.
        for index, line in enumerate(lines):
            if re.fullmatch(r"[A-Z]{2,5}-[A-Z0-9_-]+", line):
                if index + 1 < len(lines):
                    result["commercial"] = clean_company_name_value(
                        lines[index + 1]
                    )
                break

        # Real payment terms are in the footer, not in the legal sentence
        # mentioning cheque/card acceptance.
        payment_patterns = (
            r"^Virement\b",
            r"^LCR\b",
            r"^Ch[eè]que\s+[àa]\s+\d+",
            r"^Pr[ée]l[eè]vement\b",
        )

        for index, line in enumerate(lines):
            if any(re.search(pattern, line, re.I) for pattern in payment_patterns):
                result["conditions_paiement"] = line.strip()

                if re.match(r"Virement", line, re.I):
                    result["mode_paiement"] = "Virement"
                elif re.match(r"LCR", line, re.I):
                    result["mode_paiement"] = "LCR"
                elif re.match(r"Ch[eè]que", line, re.I):
                    result["mode_paiement"] = "Chèque"
                elif re.match(r"Pr[ée]l[eè]vement", line, re.I):
                    result["mode_paiement"] = "Prélèvement"

                # Due date is usually the next line.
                for candidate in lines[index:index + 4]:
                    date_match = re.search(
                        r"\b(\d{2}/\d{2}/\d{2,4})\b",
                        candidate,
                    )
                    if date_match:
                        result["date_echeance"] = parse_date(
                            date_match.group(1)
                        )
                        break
                break

    return result

def extract_totals_precise(
    text: str,
    country: str,
    articles: List[Dict[str, Any]],
) -> Dict[str, float]:
    lines = clean_lines(text)
    sum_lines = r3(
        sum(float(item.get("montant_ht_num", 0)) for item in articles)
    )

    def previous_amount(label_pattern: str, maximum_distance: int = 4) -> float:
        for index, line in enumerate(lines):
            if not re.search(label_pattern, line, re.I):
                continue

            for cursor in range(index - 1, max(-1, index - maximum_distance - 1), -1):
                if re.fullmatch(amount_token_pattern(), lines[cursor]):
                    return r3(normalize_number(lines[cursor]))

        return 0.0

    if country == "TN":
        net = 0.0
        for line in lines:
            match = re.search(
                rf"\*+\s*({amount_token_pattern()})",
                line,
            )
            if match:
                net = r3(normalize_number(match.group(1)))
                break

        timbre = previous_amount(
            r"^Timbre\s+Fiscal(?:e)?$",
            maximum_distance=3,
        )

        tva = 0.0
        for index, line in enumerate(lines):
            if re.fullmatch(r"19[,.]00", line):
                for candidate in lines[index + 1:index + 4]:
                    if re.fullmatch(amount_token_pattern(), candidate):
                        value = normalize_number(candidate)
                        if value > 20:
                            tva = r3(value)
                            break

        total_ht = sum_lines
        if not tva and total_ht:
            tva = r3(total_ht * 0.19)

        total_ttc = (
            r3(net - timbre)
            if net
            else r3(total_ht + tva)
        )
        if not net:
            net = r3(total_ttc + timbre)

        return {
            "total_ht": total_ht,
            "base_tva": total_ht,
            "montant_tva": tva,
            "timbre_fiscal": timbre,
            "remise_globale": 0.0,
            "frais_port_non_soumis": 0.0,
            "frais_port_soumis": 0.0,
            "frais_emballage": 0.0,
            "total_ttc": total_ttc,
            "net_a_payer": net,
        }

    if country == "FR":
        port_non_soumis = previous_amount(
            r"^Frais\s+de\s+port\s+Non\s+So(?:umis)?$",
            maximum_distance=3,
        )

        net = 0.0
        for line in lines:
            match = re.search(
                rf"\*+\s*({amount_token_pattern()})",
                line,
            )
            if match:
                net = r3(normalize_number(match.group(1)))

        # Footer sequence before the starred TTC:
        # total HT, base TVA, VAT amount, tax code/currency, TTC, rate, starred TTC.
        base_tva = 0.0
        vat = 0.0

        star_index = -1
        for index, line in enumerate(lines):
            if re.search(r"\*+\s*\d", line):
                star_index = index
                break

        if star_index >= 0:
            numeric_before: List[float] = []
            for line in lines[max(0, star_index - 12):star_index]:
                if re.fullmatch(amount_token_pattern(), line):
                    numeric_before.append(normalize_number(line))

            # For the reference layout: [90, 100, 20, 120, 20].
            # The two values immediately after total HT are base and VAT.
            if sum_lines:
                for index, value in enumerate(numeric_before):
                    if abs(value - sum_lines) <= 0.05:
                        if index + 2 < len(numeric_before):
                            base_candidate = numeric_before[index + 1]
                            vat_candidate = numeric_before[index + 2]

                            if base_candidate >= sum_lines and vat_candidate > 0:
                                base_tva = r3(base_candidate)
                                vat = r3(vat_candidate)
                                break

        if not base_tva:
            base_tva = r3(sum_lines + port_non_soumis)

        if not vat and net:
            vat = r3(net - base_tva)

        if not vat and base_tva:
            vat = r3(base_tva * 0.20)

        total_ttc = net if net else r3(base_tva + vat)
        net = net if net else total_ttc

        return {
            "total_ht": sum_lines,
            "base_tva": base_tva,
            "montant_tva": vat,
            "timbre_fiscal": 0.0,
            "remise_globale": 0.0,
            "frais_port_non_soumis": port_non_soumis,
            "frais_port_soumis": 0.0,
            "frais_emballage": 0.0,
            "total_ttc": total_ttc,
            "net_a_payer": net,
        }

    return {}

def format_precise_totals(
    values: Dict[str, float],
    articles: List[Dict[str, Any]],
    currency: str,
) -> Dict[str, Any]:
    sum_lines = r3(sum(float(x.get("montant_ht_num", 0)) for x in articles))

    return {
        "total_ht_num": r3(values.get("total_ht", 0)),
        "base_tva_num": r3(values.get("base_tva", 0)),
        "montant_tva_num": r3(values.get("montant_tva", 0)),
        "timbre_fiscal_num": r3(values.get("timbre_fiscal", 0)),
        "remise_globale_num": r3(values.get("remise_globale", 0)),
        "total_ttc_num": r3(values.get("total_ttc", 0)),
        "net_a_payer_num": r3(values.get("net_a_payer", 0)),
        "somme_lignes_ht_num": sum_lines,
        "frais_port_non_soumis_num": r3(values.get("frais_port_non_soumis", 0)),
        "frais_port_soumis_num": r3(values.get("frais_port_soumis", 0)),
        "frais_emballage_num": r3(values.get("frais_emballage", 0)),
        "total_ht": money_str(values.get("total_ht", 0), currency),
        "base_tva": money_str(values.get("base_tva", 0), currency),
        "montant_tva": money_str(values.get("montant_tva", 0), currency),
        "timbre_fiscal": money_str(values.get("timbre_fiscal", 0), currency),
        "remise_globale": money_str(values.get("remise_globale", 0), currency),
        "frais_port_non_soumis": money_str(values.get("frais_port_non_soumis", 0), currency),
        "frais_port_soumis": money_str(values.get("frais_port_soumis", 0), currency),
        "frais_emballage": money_str(values.get("frais_emballage", 0), currency),
        "total_ttc": money_str(values.get("total_ttc", 0), currency),
        "net_a_payer": money_str(values.get("net_a_payer", 0), currency),
    }

# =========================================================
# MAIN ENDPOINT
# =========================================================

@app.post("/extract")
def extract(req: ExtractionRequest):
    try:
        text = clean_text(req.raw_text)

        if not text:
            return [{
                "status": "error",
                "message": (
                    "Le texte de la facture est vide"
                ),
            }]

        country = detect_country(text)

        currency = detect_currency(
            text,
            country,
        )

        document_type = (
            detect_document_type(text)
        )

        llm_data, llm_status = call_llm(
            raw_text=text,
            country=country,
            currency=currency,
        )

        if not llm_data:
            llm_data = {
                "fournisseur": {},
                "client": {},
                "facture": {},
                "lignes_facture": [],
                "totaux": {},
            }

        llm_data = merge_with_fallback(
            llm_data=llm_data,
            text=text,
            country=country,
        )

        if country == "TN":
            python_supplier, python_client = extract_tn_parties_precise(text)
        elif country == "FR":
            python_supplier, python_client = extract_fr_parties_precise(text)
        else:
            python_supplier, python_client = extract_parties_python(
                text=text,
                country=country,
            )

        # Deterministic extraction has priority. Ollama fills only fields
        # that are still empty and cannot overwrite fiscal IDs or names.
        llm_supplier = safe_dict(llm_data.get("fournisseur"))
        llm_client = safe_dict(llm_data.get("client"))

        llm_data["fournisseur"] = merge_missing_values(
            python_supplier,
            llm_supplier,
        )

        llm_data["client"] = merge_missing_values(
            python_client,
            llm_client,
        )

        supplier = normalize_party(
            safe_dict(
                llm_data.get(
                    "fournisseur"
                )
            ),
            country=country,
            is_supplier=True,
        )

        client = normalize_party(
            safe_dict(
                llm_data.get(
                    "client"
                )
            ),
            country=country,
            is_supplier=False,
        )

        invoice = normalize_invoice(
            safe_dict(
                llm_data.get(
                    "facture"
                )
            )
        )

        invoice = extract_invoice_header_precise(
            text=text,
            country=country,
            current_invoice=invoice,
        )

        articles = extract_articles(
            text=text,
            country=country,
            currency=currency,
        )

        # Seulement si Python ne détecte aucune ligne, on accepte
        # d'éventuelles lignes retournées par Ollama.
        if not articles:
            articles = normalize_articles(
                raw_articles=safe_list(
                    llm_data.get(
                        "lignes_facture"
                    )
                ),
                currency=currency,
                country=country,
            )

        precise_values = extract_totals_precise(
            text=text,
            country=country,
            articles=articles,
        )

        if precise_values:
            totals = format_precise_totals(
                values=precise_values,
                articles=articles,
                currency=currency,
            )
        else:
            fallback_totals = extract_totals_fallback(
                text=text,
                country=country,
            )

            totals = normalize_totals(
                raw_totals=safe_dict(
                    llm_data.get(
                        "totaux"
                    )
                ),
                fallback_totals=fallback_totals,
                articles=articles,
                country=country,
                currency=currency,
            )

        control = validate_extraction(
            articles=articles,
            totals=totals,
            supplier=supplier,
            client=client,
            invoice=invoice,
            country=country,
            currency=currency,
        )

        if llm_status == "ok":
            mode_extraction = (
                "ollama_local_avec_validation_python"
            )
            model_used = OLLAMA_MODEL

        elif llm_status == "partial_success":
            mode_extraction = (
                "ollama_partiel_avec_validation_python"
            )
            model_used = OLLAMA_MODEL

        else:
            mode_extraction = (
                "fallback_python_sans_ollama"
            )
            model_used = ""

        result = {
            "document": {
                "type_document": (
                    document_type["name"]
                ),
                "code_type_document": (
                    document_type["code"]
                ),
                "profil_pays": {
                    "TN": "Tunisie",
                    "FR": "France",
                }.get(
                    country,
                    country,
                ),
                "devise": currency,
                "source": req.source_type,
                "nombre_pages": req.page_count,
                "version_extraction": APP_VERSION,
                "mode_extraction": (
                    mode_extraction
                ),
                "modele_ia": model_used,
                "statut_ollama": (
                    llm_status
                ),
            },
            "fournisseur": supplier,
            "client": client,
            "facture": invoice,
            "lignes_facture": articles,
            "totaux": {
                key: value
                for key, value in totals.items()
                if not key.endswith("_num")
                and key != "somme_lignes_ht"
            },
            "controle_validation": control,
        }

        return [result]

    except Exception as exc:
        print(
            f"EXTRACTION ERROR: {exc}",
            flush=True,
        )

        return [{
            "status": "error",
            "message": str(exc),
        }]


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": (
            "extractionservice-intelligent-hybrid"
        ),
        "version_extraction": APP_VERSION,
        "ollama_url": OLLAMA_URL,
        "ollama_model": OLLAMA_MODEL,
        "ollama_timeout": OLLAMA_TIMEOUT,
        "ollama_num_ctx": OLLAMA_NUM_CTX,
        "ollama_num_predict": (
            OLLAMA_NUM_PREDICT
        ),
        "ollama_chunk_max_chars": (
            OLLAMA_CHUNK_MAX_CHARS
        ),
    }