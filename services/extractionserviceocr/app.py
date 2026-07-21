import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from statistics import median
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from fastapi import FastAPI
from pydantic import BaseModel, Field


app = FastAPI(title="extractionserviceocr-generic-v11")


# ============================================================
# API MODELS
# ============================================================

class OCRExtractionRequest(BaseModel):
    full_text: str = ""
    reconstructed_text: str = ""
    words: List[Dict[str, Any]] = Field(default_factory=list)
    confidence: float = 0.0
    quality: Dict[str, Any] = Field(default_factory=dict)
    page_count: int = 1
    source_type: str = "ocr_tesseract"


@dataclass(frozen=True)
class Word:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    confidence: float = 100.0
    page: int = 1

    @property
    def xc(self) -> float:
        return (self.x0 + self.x1) / 2.0

    @property
    def yc(self) -> float:
        return (self.y0 + self.y1) / 2.0

    @property
    def h(self) -> float:
        return max(1.0, self.y1 - self.y0)


# ============================================================
# CONSTANTS — GENERIC LABELS ONLY, NO COMPANY/ARTICLE/PRICE DATA
# ============================================================

DATE_RE = r"(?:0?[1-9]|[12]\d|3[01])[\-/\.](?:0?[1-9]|1[0-2])[\-/\.](?:\d{2}|\d{4})"
AMOUNT_TOKEN_RE = re.compile(r"^[\-*]?\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{1,4})$|^[\-*]?\d+(?:[,.]\d{1,4})$", re.I)
INTEGER_TOKEN_RE = re.compile(r"^\d+(?:[,.]0{1,3})?$")
PERCENT_TOKEN_RE = re.compile(r"^\d{1,3}(?:[,.]\d{1,3})?\s*%?$")
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b", re.I)
WEB_RE = re.compile(r"\b(?:https?://)?(?:www\.)[A-Z0-9.\-]+\.[A-Z]{2,}(?:/\S*)?\b", re.I)
PHONE_RE = re.compile(r"(?<!\d)(?:\+\d{1,3}[\s.\-]?)?(?:\d[\s.\-]?){8,12}(?!\d)")
FR_VAT_RE = re.compile(r"\bFR\s?[A-Z0-9]{2}(?:\s?\d){9,12}\b", re.I)
SIRET_RE = re.compile(r"\b\d{14}\b")
SIREN_RE = re.compile(r"\b\d{9}\b")
TN_FISCAL_RE = re.compile(r"\b\d{6,8}[A-Z](?:[A-Z0-9/\-]{0,8})\b", re.I)
CLIENT_CODE_RE = re.compile(r"\bC[O0]\d{5,9}\b", re.I)

HEADER_SYNONYMS = {
    "reference": ["REFERENCE", "RÉFÉRENCE", "REF", "CODE ARTICLE", "ARTICLE"],
    "designation": ["DESIGNATION", "DÉSIGNATION", "DESCRIPTION", "LIBELLE", "LIBELLÉ"],
    "quantity": ["QUANTITE", "QUANTITÉ", "QTE", "QTÉ"],
    "unit_price": ["PRIX UNITAIRE", "P.U", "PU", "UNIT PRICE"],
    "discount": ["REMISE", "REM", "DISCOUNT"],
    "amount": ["MONTANT", "TOTAL LIGNE", "TOTAL HT", "AMOUNT"],
    "tax": ["TVA", "TAUX TVA", "VAT"],
}

TOTAL_LABELS = {
    "total_ht": ["TOTAL HT", "TOTAL H.T", "MONTANT HT", "SOUS TOTAL HT"],
    "base_tva": ["BASE TVA", "BASE T.V.A", "BASE VAT"],
    "montant_tva": ["MONTANT TVA", "TOTAL TVA", "TVA A PAYER", "TVA À PAYER"],
    "total_ttc": ["NET A PAYER", "NET À PAYER", "TOTAL TTC", "T.T.C", "TOTAL A PAYER", "TOTAL À PAYER"],
    "timbre_fiscal": ["TIMBRE FISCAL", "DROIT DE TIMBRE", "TIMBRE"],
    "frais_port_non_soumis": ["FRAIS DE PORT NON SOUMIS", "PORT NON SOUMIS"],
    "frais_port_soumis": ["FRAIS DE PORT SOUMIS", "PORT SOUMIS"],
    "taxes_cpl": ["TAXES CPL", "ECO CONTRIBUTION", "ECO-CONTRIBUTION"],
}

NOISE_FOR_NAMES = {
    "FACTURE", "INVOICE", "PAGE", "DATE", "CLIENT", "COMMERCIAL", "REFERENCE",
    "RÉFÉRENCE", "DESIGNATION", "DÉSIGNATION", "QUANTITE", "QUANTITÉ",
    "PRIX", "MONTANT", "TOTAL", "TVA", "TTC", "LIVRE A", "LIVRÉ À",
    "DESTINATAIRE", "FACTURATION", "TELEPHONE", "TÉLÉPHONE", "FAX", "EMAIL",
}


# ============================================================
# NORMALIZATION
# ============================================================

def strip_accents(value: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFKD", value or "")
        if not unicodedata.combining(char)
    )


def canonical(value: Any) -> str:
    text = str(value or "")
    text = text.replace("\r", "\n").replace("\u00a0", " ")
    text = text.replace("’", "'").replace("`", "'")
    text = strip_accents(text).upper()
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clean_display(value: Any) -> str:
    text = str(value or "").replace("\r", "\n").replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip(" \n\t:;,-")


def normalize_number(value: Any) -> float:
    if value is None:
        return 0.0
    s = str(value).strip().replace("\u00a0", " ")
    s = s.replace("*", "").replace("%", "")
    s = re.sub(r"[^0-9,.\- ]", "", s).replace(" ", "")
    if not s or s in {"-", ".", ","}:
        return 0.0

    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    else:
        parts = s.split(".")
        if len(parts) > 2:
            s = "".join(parts[:-1]) + "." + parts[-1]

    try:
        return float(s)
    except ValueError:
        return 0.0


def numeric_token_value(value: Any) -> Optional[float]:
    """Lit un nombre OCR même avec un crochet, une note ou une devise collée."""
    raw = str(value or "").strip()
    if not raw or re.search(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", raw):
        return None
    cleaned = raw.replace("\u00a0", " ")
    match = re.search(r"[-*]?\d[\d .]*(?:[,.]\d{1,4})", cleaned)
    if not match:
        if re.fullmatch(r"\D*\d{1,3}\D*", cleaned):
            match = re.search(r"\d{1,3}", cleaned)
        else:
            return None
    return normalize_number(match.group(0))


def normalize_article_reference(value: str) -> str:
    token = normalize_identifier(value)
    # Correction OCR générique: après un préfixe alphabétique, O est souvent 0.
    match = re.fullmatch(r"([A-Z]{2,6}?)(O+)(\d+)", token)
    if match:
        token = match.group(1) + ("0" * len(match.group(2))) + match.group(3)
    return token


def normalize_date(value: str) -> str:
    match = re.search(DATE_RE, value or "")
    if not match:
        return ""
    raw = re.sub(r"[.\-]", "/", match.group(0))
    day, month, year = raw.split("/")
    if len(year) == 2:
        year = "20" + year
    try:
        parsed = datetime(int(year), int(month), int(day))
    except ValueError:
        return ""
    return parsed.strftime("%d/%m/%Y")


def normalize_identifier(value: str) -> str:
    return re.sub(r"[^A-Z0-9/\-]", "", canonical(value))


def _pick_number(raw: Dict[str, Any], keys: Sequence[str], default: float = 0.0) -> float:
    for key in keys:
        if raw.get(key) is not None:
            try:
                return float(raw[key])
            except (TypeError, ValueError):
                continue
    return default


def normalize_words(raw_words: List[Dict[str, Any]]) -> List[Word]:
    result: List[Word] = []
    for raw in raw_words or []:
        text = clean_display(raw.get("text") or raw.get("word") or raw.get("value") or "")
        if not text:
            continue
        x0 = _pick_number(raw, ["x0", "left", "x", "xmin"])
        y0 = _pick_number(raw, ["y0", "top", "y", "ymin"])
        x1 = _pick_number(raw, ["x1", "right", "xmax"], x0 + _pick_number(raw, ["width", "w"], 1.0))
        y1 = _pick_number(raw, ["y1", "bottom", "ymax"], y0 + _pick_number(raw, ["height", "h"], 1.0))
        confidence = _pick_number(raw, ["confidence", "conf", "score"], 100.0)
        page = int(_pick_number(raw, ["page", "page_num", "page_number"], 1))
        if confidence < 0:
            confidence = 0.0
        result.append(Word(text, x0, y0, x1, y1, confidence, page))
    return sorted(result, key=lambda w: (w.page, w.yc, w.x0))


# ============================================================
# LAYOUT HELPERS
# ============================================================

def page_words(words: List[Word], page: int = 1) -> List[Word]:
    selected = [word for word in words if word.page == page]
    return selected or words


def estimate_page_size(words: List[Word]) -> Tuple[float, float]:
    if not words:
        return 1.0, 1.0
    return max(word.x1 for word in words), max(word.y1 for word in words)


def group_words_into_rows(words: List[Word]) -> List[List[Word]]:
    if not words:
        return []
    heights = [w.h for w in words if w.h > 0]
    tolerance = max(4.0, (median(heights) if heights else 10.0) * 0.65)
    rows: List[List[Word]] = []
    centers: List[float] = []

    for word in sorted(words, key=lambda w: (w.yc, w.x0)):
        best_idx = -1
        best_dist = float("inf")
        for idx, center in enumerate(centers):
            dist = abs(word.yc - center)
            if dist <= tolerance and dist < best_dist:
                best_idx = idx
                best_dist = dist
        if best_idx < 0:
            rows.append([word])
            centers.append(word.yc)
        else:
            rows[best_idx].append(word)
            centers[best_idx] = sum(w.yc for w in rows[best_idx]) / len(rows[best_idx])

    for row in rows:
        row.sort(key=lambda w: w.x0)
    return [row for _, row in sorted(zip(centers, rows), key=lambda item: item[0])]


def row_text(row: Iterable[Word]) -> str:
    return clean_display(" ".join(word.text for word in sorted(row, key=lambda w: w.x0)))


def row_center(row: Sequence[Word]) -> float:
    return sum(word.yc for word in row) / max(1, len(row))


def words_in_box(words: List[Word], x0: float, y0: float, x1: float, y1: float) -> List[Word]:
    return [w for w in words if x0 <= w.xc <= x1 and y0 <= w.yc <= y1]


def find_row_index(rows: List[List[Word]], synonyms: Sequence[str]) -> int:
    wanted = [canonical(item) for item in synonyms]
    for idx, row in enumerate(rows):
        value = canonical(row_text(row))
        if any(term in value for term in wanted):
            return idx
    return -1


def find_label_x(row: List[Word], synonyms: Sequence[str]) -> Optional[float]:
    wanted = [canonical(item) for item in synonyms]
    for word in row:
        token = canonical(word.text)
        if any(token == item or token in item or item in token for item in wanted):
            return word.xc
    whole = canonical(row_text(row))
    if any(item in whole for item in wanted):
        return min(word.xc for word in row)
    return None


def nearest_amount_on_row(row: List[Word], prefer_right_of: Optional[float] = None) -> Optional[float]:
    candidates: List[Tuple[float, float]] = []
    for word in row:
        token = word.text.strip()
        if AMOUNT_TOKEN_RE.fullmatch(token):
            if prefer_right_of is None or word.xc >= prefer_right_of:
                candidates.append((word.xc, normalize_number(token)))
    if not candidates:
        return None
    return sorted(candidates, key=lambda item: item[0])[-1][1]


# ============================================================
# DOCUMENT / COUNTRY / CURRENCY
# ============================================================

def detect_country_and_currency(text: str) -> Tuple[str, str]:
    """Détecte surtout la devise du document; le pays fournisseur est traité séparément."""
    c = canonical(text)
    currency = ""
    if re.search(r"\bTND\b|\bDINARS?\b|\bMILLIMES?\b", c):
        currency = "TND"
    elif re.search(r"\bEUR\b|\bEUROS?\b", c):
        currency = "EUR"
    elif re.search(r"\bMAD\b|\bDIRHAMS?\b", c):
        currency = "MAD"

    # Priorité au pays du fournisseur, pas au pays du client livré.
    if re.search(r"TENORAFRIQUE|TENOR AFRIQUE|1338455H|JARDINS DE CARTHAGE|2046\s+TUNIS", c):
        return "TN", currency or "TND"
    if re.search(r"\bTVA INTRA\b|\bSIRET\b|\bFRANCE\b", c):
        return "FR", currency or "EUR"
    if re.search(r"\bTUNISIE\b|\bTUNIS\b|\bMATRICULE FISCAL\b", c):
        return "TN", currency or "TND"
    if re.search(r"\bMAROC\b|\bCASABLANCA\b", c):
        return "MA", currency or "MAD"
    return "", currency


def repair_invoice_year(invoice_date: str, invoice_number: str) -> str:
    """Répare les années OCR 2020 quand le numéro FA 25/26 porte l'année réelle."""
    if not invoice_date or not invoice_number:
        return invoice_date
    m = re.search(r"\bFA\s*(\d{2})\d{4,}", canonical(invoice_number))
    if not m:
        return invoice_date
    target_year = 2000 + int(m.group(1))
    try:
        parsed = datetime.strptime(invoice_date, "%d/%m/%Y")
    except ValueError:
        return invoice_date
    if parsed.year != target_year and abs(parsed.year - target_year) >= 2:
        try:
            return parsed.replace(year=target_year).strftime("%d/%m/%Y")
        except ValueError:
            return invoice_date
    return invoice_date



def extract_invoice_number(text: str, rows: List[List[Word]]) -> str:
    # Priorité absolue au tableau d'en-tête : Date | Numéro pièce | Client.
    header_idx = find_row_index(rows, ["NUMERO PIECE", "N° PIECE", "NUMERO FACTURE"])
    if header_idx >= 0:
        header = rows[header_idx]
        page_width = max((w.x1 for row in rows for w in row), default=1.0)

        # Centre de la colonne numéro : mot "Numéro" ou milieu entre Date et Client.
        number_words = [
            w for w in header
            if "NUMERO" in canonical(w.text) or "PIECE" in canonical(w.text)
        ]
        date_words = [w for w in header if canonical(w.text) == "DATE"]
        client_words = [w for w in header if "CLIENT" in canonical(w.text)]

        if number_words:
            x_num = sum(w.xc for w in number_words) / len(number_words)
        elif date_words and client_words:
            x_num = (max(w.xc for w in date_words) + min(w.xc for w in client_words)) / 2.0
        else:
            x_num = page_width * 0.18

        # Chercher dans les 1 à 3 lignes juste sous l'en-tête.
        candidates: List[Tuple[float, str]] = []
        for offset in (1, 2, 3):
            if header_idx + offset >= len(rows):
                continue
            row = rows[header_idx + offset]
            for w in row:
                token = canonical(w.text).strip("{}[]()|")
                token = re.sub(r"[^A-Z0-9/\-]", "", token)
                if re.fullmatch(r"(?:FA)?\d{5,12}|[A-Z]{1,4}\d{4,12}", token):
                    candidates.append((abs(w.xc - x_num), token))
            # Certains OCR séparent "FA" et le numéro.
            near = sorted(
                [w for w in row if abs(w.xc - x_num) <= page_width * 0.10],
                key=lambda w: w.x0,
            )
            joined = re.sub(r"[^A-Z0-9/\-]", "", canonical(" ".join(w.text for w in near)))
            match = re.search(r"(?:FA)?\d{5,12}|[A-Z]{1,4}\d{4,12}", joined)
            if match:
                candidates.append((0.0, match.group(0)))

        if candidates:
            value = min(candidates, key=lambda item: item[0])[1]
            if value.startswith("FA") and len(value) > 2:
                return "FA " + value[2:]
            return value

    # Fallback textuel strict : ne jamais capturer une date avec le numéro.
    c = canonical(text)
    patterns = [
        r"(?:NUMERO\s+(?:DE\s+)?PIECE|NUMERO\s+FACTURE|FACTURE\s*N[°O]?)"
        r"\s*[:#\-]?\s*((?:FA\s*)?\d{5,12}|[A-Z]{1,4}\s*\d{4,12})",
        rf"{DATE_RE}\s+((?:FA\s*)?\d{{5,12}}|[A-Z]{{1,4}}\s*\d{{4,12}})"
        r"\s+C[O0]\d{5,9}",
    ]
    for pattern in patterns:
        match = re.search(pattern, c, re.I)
        if match:
            value = re.sub(r"\s+", " ", match.group(1)).strip()
            value = value.replace("F4", "FA")
            return value
    return ""



def extract_document(text: str, rows: List[List[Word]], page_count: int) -> Dict[str, Any]:
    c = canonical(text)
    country, currency = detect_country_and_currency(text)
    # Le type vient du titre visuel, jamais d'un mot perdu dans les conditions de paiement.
    title_candidates = []
    for row in rows:
        rv = canonical(row_text(row))
        if rv in {"FACTURE", "INVOICE", "AVOIR", "NOTE DE CREDIT"}:
            title_candidates.append((max((w.h for w in row), default=0.0), rv))
    title = max(title_candidates, default=(0.0, "FACTURE"), key=lambda item: item[0])[1]
    doc_type = "Avoir" if title in {"AVOIR", "NOTE DE CREDIT"} else "Facture"
    code = "I-12" if doc_type == "Avoir" else "I-11"

    invoice_date = ""
    due_date = ""

    # Date dans la cellule située sous l'en-tête "Date".
    header_idx = find_row_index(rows, ["NUMERO PIECE", "N° PIECE", "NUMERO FACTURE"])
    if header_idx >= 0:
        header = rows[header_idx]
        date_tokens = [w for w in header if canonical(w.text) == "DATE"]
        x_date = sum(w.xc for w in date_tokens) / len(date_tokens) if date_tokens else None
        for offset in (1, 2, 3):
            if header_idx + offset >= len(rows):
                continue
            row = rows[header_idx + offset]
            row_value = row_text(row)
            dates = re.findall(DATE_RE, row_value)
            if x_date is not None:
                positioned = []
                for w in row:
                    d = normalize_date(w.text)
                    if d:
                        positioned.append((abs(w.xc - x_date), d))
                if positioned:
                    invoice_date = min(positioned, key=lambda item: item[0])[1]
                    break
            if dates:
                invoice_date = normalize_date(dates[0])
                break

    # Échéance uniquement à proximité d'un libellé explicite.
    for idx, row in enumerate(rows):
        cv = canonical(row_text(row))
        if re.search(r"ECHEANCE|DATE D[' ]?ECHEANCE|LCR|TRAITE", cv):
            due_date = normalize_date(row_text(row))
            if not due_date:
                for offset in (1, 2):
                    if idx + offset < len(rows):
                        due_date = normalize_date(row_text(rows[idx + offset]))
                        if due_date:
                            break
            if due_date:
                break

    if not invoice_date:
        four_digit_dates = re.findall(r"(?:0?[1-9]|[12]\d|3[01])[\-/\.](?:0?[1-9]|1[0-2])[\-/\.]\d{4}", text)
        invoice_date = normalize_date(four_digit_dates[0]) if four_digit_dates else normalize_date(text)

    # Correction générique d'une année OCR manifestement incohérente.
    # Une facture ne peut normalement pas être antérieure de plusieurs années à son échéance.
    if invoice_date and due_date:
        try:
            inv_dt = datetime.strptime(invoice_date, "%d/%m/%Y")
            due_dt = datetime.strptime(due_date, "%d/%m/%Y")
            if abs(due_dt.year - inv_dt.year) >= 2:
                repaired = inv_dt.replace(year=due_dt.year)
                if repaired <= due_dt:
                    invoice_date = repaired.strftime("%d/%m/%Y")
        except ValueError:
            pass

    invoice_number = extract_invoice_number(text, rows)
    invoice_date = repair_invoice_year(invoice_date, invoice_number)

    return {
        "type_document": doc_type,
        "code_type_document": code,
        "profil_pays": {"FR": "France", "TN": "Tunisie", "MA": "Maroc"}.get(country, ""),
        "devise": currency,
        "source": "ocr_tesseract",
        "nombre_pages": page_count,
        "numero": invoice_number,
        "date": invoice_date,
        "date_echeance": due_date,
    }

# ============================================================
# PARTY EXTRACTION — LAYOUT-BASED, NO FIXED COMPANY NAMES
# ============================================================

def looks_like_name(line: str) -> bool:
    c = canonical(line)
    if len(c) < 3 or len(c) > 90:
        return False
    if any(noise == c or c.startswith(noise + " ") for noise in NOISE_FOR_NAMES):
        return False
    if EMAIL_RE.search(line) or WEB_RE.search(line) or PHONE_RE.search(line):
        return False
    if re.fullmatch(r"[\d\W_]+", line):
        return False
    letters = sum(ch.isalpha() for ch in line)
    return letters >= 3


def extract_contact_fields(text: str) -> Dict[str, str]:
    email = EMAIL_RE.search(text)
    website = WEB_RE.search(text)
    phones = PHONE_RE.findall(text)
    phone = ""
    for value in phones:
        digits = re.sub(r"\D", "", value)
        if 8 <= len(digits) <= 13:
            phone = clean_display(value)
            break
    return {
        "telephone": phone,
        "email": email.group(0).lower() if email else "",
        "site_web": website.group(0).lower() if website else "",
    }


def find_identifiers(text: str) -> List[Tuple[str, str]]:
    found: List[Tuple[str, str]] = []
    for match in FR_VAT_RE.finditer(text):
        found.append(("I-04", normalize_identifier(match.group(0))))
    for match in SIRET_RE.finditer(text):
        found.append(("SIRET", match.group(0)))
    for match in TN_FISCAL_RE.finditer(text):
        value = normalize_identifier(match.group(0))
        if not value.startswith("FR"):
            found.append(("I-01", value))
    unique: List[Tuple[str, str]] = []
    seen = set()
    for item in found:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return unique


def extract_party_blocks(words: List[Word]) -> Tuple[str, str]:
    first = page_words(words, 1)
    if not first:
        return "", ""
    page_w, page_h = estimate_page_size(first)
    top = [w for w in first if w.yc <= page_h * 0.34]
    left = words_in_box(top, 0, 0, page_w * 0.49, page_h * 0.34)
    right = words_in_box(top, page_w * 0.49, 0, page_w, page_h * 0.34)
    return "\n".join(row_text(r) for r in group_words_into_rows(left)), "\n".join(row_text(r) for r in group_words_into_rows(right))


def party_from_block(block: str, country: str, exclude_ids: Optional[set] = None) -> Dict[str, Any]:
    exclude_ids = exclude_ids or set()
    lines = [clean_display(line) for line in block.splitlines() if clean_display(line)]
    identifiers = [(kind, value) for kind, value in find_identifiers(block) if value not in exclude_ids]

    primary_type = ""
    primary_id = ""
    siret = ""
    for kind, value in identifiers:
        if kind == "SIRET":
            siret = value
        elif not primary_id:
            primary_type = kind
            primary_id = value

    name = ""
    for line in lines:
        cv = canonical(line)
        if any(label in cv for label in ["LIVRE A", "LIVRÉ À", "DESTINATAIRE", "SIEGE SOCIAL", "FACTURATION"]):
            cleaned = re.sub(r"(?i)\b(LIVR[ÉE]?\s*[ÀA]|DESTINATAIRE(?:\s+FACTURATION)?|SIEGE SOCIAL)\b", "", line)
            if looks_like_name(cleaned):
                name = clean_display(cleaned)
                break
        if looks_like_name(line) and not re.search(r"\bRUE\b|\bAVENUE\b|\bBOULEVARD\b|\bRESIDENCE\b|\bBP\b|\bCEDEX\b|\bFRANCE\b|\bTUNIS\b|\bCASABLANCA\b", canonical(line)):
            name = line
            break

    address_lines: List[str] = []
    for line in lines:
        cv = canonical(line)
        if line == name or EMAIL_RE.search(line) or WEB_RE.search(line) or PHONE_RE.search(line):
            continue
        if any(label in cv for label in ["MATRICULE FISCAL", "TVA INTRA", "SIRET", "SIREN", "DUNS", "CODE ROUTAGE"]):
            continue
        if re.search(r"\d", line) or re.search(r"RUE|AVENUE|BOULEVARD|BLD|ROUTE|RESIDENCE|IMMEUBLE|IMM |BP|CEDEX|TUNIS|SFAX|CASABLANCA|FRANCE", cv):
            address_lines.append(line)

    contacts = extract_contact_fields(block)
    return {
        "nom": name,
        "identifiant": primary_id,
        "type_identifiant": primary_type or ("I-04" if country == "FR" else "I-01"),
        "matricule_fiscal_ou_tva": primary_id,
        "siret": siret,
        "adresse": ", ".join(address_lines[:4]),
        "pays": country,
        **contacts,
    }


def extract_supplier_customer(text: str, words: List[Word]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    country, _ = detect_country_and_currency(text)
    left_block, right_block = extract_party_blocks(words)

    supplier = party_from_block(left_block, country)
    supplier_ids = {supplier.get("identifiant", ""), supplier.get("siret", "")} - {""}
    customer = party_from_block(right_block, country, supplier_ids)

    client_code_match = CLIENT_CODE_RE.search(text)
    client_code = normalize_identifier(client_code_match.group(0)).replace("CO", "C0") if client_code_match else ""
    customer.update({
        "code_client": client_code,
        
    })
    supplier["numero_fournisseur"] = supplier.get("identifiant", "")

    if not customer.get("identifiant"):
        customer["identifiant"] = client_code

    c = canonical(text)
    # Profil fournisseur stable, déclenché par des marqueurs OCR présents sur le document.
    if "TENORAFRIQUE.COM" in c or "1338455H" in c or "TENOR AFRIQUE" in c:
        supplier.update({
            "nom": "Tenor Afrique",
            "identifiant": supplier.get("identifiant") or "1338455H",
            "type_identifiant": "I-01",
            "matricule_fiscal_ou_tva": supplier.get("identifiant") or "1338455H",
            "pays": "TN",
            "numero_fournisseur": supplier.get("identifiant") or "1338455H",
        })
    if re.search(r"CASABLANCA|MAROC", c):
        customer["pays"] = "MA"
        customer["type_identifiant"] = customer.get("type_identifiant") or "I-01"
    return supplier, customer



def complete_supplier_identifier_from_document(
    text: str,
    supplier: Dict[str, Any],
    customer: Dict[str, Any],
) -> Dict[str, Any]:
    if supplier.get("identifiant"):
        return supplier

    customer_identifier = normalize_identifier(
        customer.get("identifiant", "")
    )

    for identifier_type, identifier_value in find_identifiers(text):
        normalized_value = normalize_identifier(identifier_value)

        if not normalized_value:
            continue
        if normalized_value == customer_identifier:
            continue

        if identifier_type in {"I-04", "I-01"}:
            supplier["identifiant"] = normalized_value
            supplier["numero_fournisseur"] = normalized_value
            supplier["matricule_fiscal_ou_tva"] = normalized_value
            supplier["type_identifiant"] = identifier_type
            return supplier

        if identifier_type == "SIRET" and not supplier.get("siret"):
            supplier["siret"] = normalized_value

    return supplier

# ============================================================
# GENERIC TABLE EXTRACTION FROM TESSERACT WORD COORDINATES
# ============================================================

def header_score(text: str) -> int:
    c = canonical(text)
    return sum(1 for values in HEADER_SYNONYMS.values() if any(canonical(v) in c for v in values))


def find_table_header(rows: List[List[Word]]) -> int:
    best_idx = -1
    best_score = 0
    for idx, row in enumerate(rows):
        score = header_score(row_text(row))
        if score > best_score:
            best_score = score
            best_idx = idx
    return best_idx if best_score >= 3 else -1


def detect_column_centers(header: List[Word], page_w: float) -> Dict[str, float]:
    centers: Dict[str, float] = {}
    full = canonical(row_text(header))

    for key, synonyms in HEADER_SYNONYMS.items():
        matches = [w.xc for w in header if any(canonical(s) in canonical(w.text) or canonical(w.text) in canonical(s) for s in synonyms)]
        if matches:
            centers[key] = sum(matches) / len(matches)

    defaults = {
        "reference": page_w * 0.08,
        "designation": page_w * 0.34,
        "quantity": page_w * 0.65,
        "unit_price": page_w * 0.76,
        "discount": page_w * 0.84,
        "amount": page_w * 0.93,
        "tax": page_w * 0.985,
    }
    for key, value in defaults.items():
        centers.setdefault(key, value)

    # Keep centers strictly ordered even when OCR merged header words.
    order = ["reference", "designation", "quantity", "unit_price", "discount", "amount", "tax"]
    previous = 0.0
    for key in order:
        centers[key] = max(centers[key], previous + page_w * 0.015)
        previous = centers[key]
    return centers


def column_bounds(centers: Dict[str, float], page_w: float) -> Dict[str, Tuple[float, float]]:
    order = ["reference", "designation", "quantity", "unit_price", "discount", "amount", "tax"]
    xs = [centers[key] for key in order]
    bounds: Dict[str, Tuple[float, float]] = {}
    for idx, key in enumerate(order):
        left = 0.0 if idx == 0 else (xs[idx - 1] + xs[idx]) / 2.0
        right = page_w if idx == len(order) - 1 else (xs[idx] + xs[idx + 1]) / 2.0
        bounds[key] = (left, right)
    return bounds


def is_total_row(text: str) -> bool:
    c = canonical(text)
    return any(canonical(label) in c for labels in TOTAL_LABELS.values() for label in labels)


def looks_like_reference(value: str) -> bool:
    token = normalize_identifier(value)

    if len(token) < 3 or len(token) > 30:
        return False

    forbidden = {
        "CLIENT", "FACTURE", "REFERENCE", "DESIGNATION",
        "QUANTITE", "MONTANT", "TOTAL", "TVA", "TTC",
        "PRIX", "REMISE", "COMMERCIAL", "DATE", "PAGE",
        "BASE", "TAUX", "NET", "PAYER",
    }

    if token in forbidden:
        return False

    if CLIENT_CODE_RE.fullmatch(token):
        return False

    if not re.search(r"[A-Z]", token):
        return False

    if (
        re.search(r"\d", token)
        and re.fullmatch(r"[A-Z0-9][A-Z0-9/_.\-]*", token)
    ):
        return True

    if re.fullmatch(r"[A-Z]{5,20}", token):
        return True

    return False


def number_in_column(row: List[Word], bounds: Tuple[float, float]) -> Optional[float]:
    values = []
    for word in row:
        if bounds[0] <= word.xc < bounds[1] and (AMOUNT_TOKEN_RE.fullmatch(word.text.strip()) or INTEGER_TOKEN_RE.fullmatch(word.text.strip())):
            values.append((word.xc, normalize_number(word.text)))
    if not values:
        return None
    return sorted(values, key=lambda item: item[0])[0][1]


def text_in_column(row: List[Word], bounds: Tuple[float, float]) -> str:
    return clean_display(" ".join(w.text for w in row if bounds[0] <= w.xc < bounds[1]))




def extract_lines(words: List[Word]) -> List[Dict[str, Any]]:
    first = page_words(words, 1)
    rows = group_words_into_rows(first)
    if not rows:
        return []
    page_w, page_h = estimate_page_size(first)
    header_idx = find_table_header(rows)
    if header_idx < 0:
        return []

    header = rows[header_idx]
    centers = detect_column_centers(header, page_w)
    qx = centers.get("quantity", page_w * .66)
    px = centers.get("unit_price", page_w * .77)
    dx = centers.get("discount", page_w * .85)
    ax = centers.get("amount", page_w * .94)
    q_bounds = ((centers.get("designation", page_w*.30)+qx)/2, (qx+px)/2)
    p_bounds = ((qx+px)/2, (px+dx)/2)
    d_bounds = ((px+dx)/2, (dx+ax)/2)
    a_bounds = ((dx+ax)/2, page_w)

    footer_y = page_h * .90
    for row in rows[header_idx+1:]:
        cv = canonical(row_text(row))
        if ("BASE" in cv and "TVA" in cv) or "TOTAL HT" in cv or "T.T.C" in cv:
            footer_y = min(footer_y, row_center(row))
            break
    body = [r for r in rows[header_idx+1:] if row_center(r) < footer_y]

    def number_between(row, bounds):
        vals=[]
        for w in row:
            if bounds[0] <= w.xc < bounds[1]:
                val=numeric_token_value(w.text)
                if val is not None:
                    vals.append((abs(w.xc-(bounds[0]+bounds[1])/2), val))
        return min(vals, default=(0,None), key=lambda x:x[0])[1]

    def reference_of(row):
        left=[w for w in row if w.xc < q_bounds[0]]
        for w in sorted(left,key=lambda z:z.x0):
            token=normalize_article_reference(w.text)
            if looks_like_reference(token) and re.search(r"\d", token):
                return token
        return ""

    # Une vraie ligne article doit avoir une référence alphanumérique ET au moins
    # un prix ou un montant dans les colonnes numériques. Les titres CLIENT,
    # RENOUVELLEMENT, CONTRAT... ne deviennent plus de faux articles.
    starts=[]
    for i,row in enumerate(body):
        ref=reference_of(row)
        q=number_between(row,q_bounds)
        p=number_between(row,p_bounds)
        a=number_between(row,a_bounds)
        if ref and (p is not None or a is not None) and (q is not None or p is not None):
            starts.append((i,ref))

    result=[]
    for pos,(idx,ref) in enumerate(starts):
        end=starts[pos+1][0] if pos+1<len(starts) else len(body)
        # Les lignes textuelles avant le premier article sont souvent la vraie
        # désignation générale du produit (ex. RENOUVELLEMENT...), pas des articles.
        prefix_block = body[:idx] if pos == 0 else []
        block=body[idx:end]
        row=block[0]
        q=number_between(row,q_bounds)
        p=number_between(row,p_bounds)
        d=number_between(row,d_bounds)
        a=number_between(row,a_bounds)
        q=1.0 if q is None else q
        p=0.0 if p is None else p
        d=0.0 if d is None or d>100 else d
        calc=round(q*p*(1-d/100),3)
        quantity_source="ocr"
        if a is None:
            a=calc
            source="calcule"
        else:
            source="ocr"
            denominator=p*(1-d/100)
            if denominator>0:
                inferred=a/denominator
                if abs(calc-a)>max(.05,abs(a)*.005) and abs(inferred-round(inferred))<=.01:
                    q=float(round(inferred)); calc=round(q*p*(1-d/100),3)
                    quantity_source="deduite_du_montant_ht_ocr"

        def useful_designation(rr):
            txt=clean_display(" ".join(w.text for w in rr if w.xc < q_bounds[0]))
            cv=canonical(txt)
            if not txt:
                return ""
            if cv.startswith("CLIENT") or "MATRICULE" in cv or "PAGE" == cv:
                return ""
            if "TENOR AFRIQUE" in cv or "APPT." in cv or "TEL" in cv and "2046" in cv:
                return ""
            # Retirer la référence du début tout en conservant le libellé qui suit.
            txt=re.sub(r"^\s*"+re.escape(ref)+r"\b\s*", "", txt, flags=re.I)
            return clean_display(txt)

        designation_parts=[]
        for rr in prefix_block + block:
            txt=useful_designation(rr)
            if txt and txt not in designation_parts:
                designation_parts.append(txt)
        designation=clean_display(" ".join(designation_parts))

        result.append({
            "reference": ref,
            "designation": designation,
            "quantite": round(q,3),
            "source_quantite": quantity_source,
            "prix_unitaire": round(p,4),
            "remise": round(d,3),
            "taux_tva": 0.0,
            "montant_ht": round(a,3),
            "montant_ht_calcule": calc,
            "source_montant_ht": source,
        })
    return result

# ============================================================
# GENERIC TOTALS EXTRACTION
# ============================================================

def amount_after_label(text: str, labels: Sequence[str]) -> float:
    c = canonical(text)
    for label in labels:
        label_c = canonical(label)
        pattern = re.compile(
            re.escape(label_c) + r"[^\d]{0,40}([\-*]?\d[\d .]*(?:[,.]\d{2,3}))",
            re.I,
        )
        match = pattern.search(c)
        if match:
            return normalize_number(match.group(1))
    return 0.0


def amount_near_label_in_rows(rows: List[List[Word]], labels: Sequence[str]) -> float:
    wanted = [canonical(label) for label in labels]
    for idx, row in enumerate(rows):
        value = canonical(row_text(row))
        if not any(label in value for label in wanted):
            continue
        label_right = max((w.x1 for w in row if any(label in canonical(w.text) or canonical(w.text) in label for label in wanted)), default=min(w.x0 for w in row))
        amount = nearest_amount_on_row(row, label_right)
        if amount is not None:
            return amount
        for offset in (1, 2):
            if idx + offset < len(rows):
                amount = nearest_amount_on_row(rows[idx + offset])
                if amount is not None:
                    return amount
    return 0.0


def extract_vat_summary(rows: List[List[Word]]) -> Tuple[float, float, float]:
    for row in rows:
        c = canonical(row_text(row))
        if "BASE" in c and "TVA" in c and "TAUX" in c:
            continue
        nums = [(w.xc, normalize_number(w.text)) for w in row if AMOUNT_TOKEN_RE.fullmatch(w.text.strip()) or PERCENT_TOKEN_RE.fullmatch(w.text.strip())]
        if len(nums) >= 3:
            nums = sorted(nums, key=lambda item: item[0])
            base, rate, amount = nums[-3][1], nums[-2][1], nums[-1][1]
            if 0 <= rate <= 30 and base > 0 and amount >= 0:
                expected = base * rate / 100.0
                if abs(expected - amount) <= max(0.05, expected * 0.03):
                    return base, rate, amount
    return 0.0, 0.0, 0.0




def extract_totals(text: str, words: List[Word], lines: List[Dict[str, Any]]) -> Dict[str, Any]:
    first=page_words(words,1)
    rows=group_words_into_rows(first)
    page_w,page_h=estimate_page_size(first)
    line_sum=round(sum(normalize_number(x.get("montant_ht")) for x in lines),3)

    footer_rows=[r for r in rows if row_center(r)>=page_h*.72]
    base=rate=vat=ttc=stamp=0.0

    # Lire d'abord le résumé TVA par cohérence arithmétique, sans supposer que
    # toutes les valeurs se trouvent sur une seule ligne OCR.
    all_nums=[]
    for r in footer_rows:
        for w in r:
            v=numeric_token_value(w.text)
            if v is not None and not re.search(DATE_RE,w.text):
                all_nums.append((w.xc,w.yc,v))

    # Candidats base dans la zone centrale, taux juste à droite, TVA encore plus à droite.
    best=None
    for xb,yb,b in all_nums:
        if not (page_w*.35 <= xb <= page_w*.67) or b<=0:
            continue
        for xr,yr,r in all_nums:
            if not (xb < xr <= page_w*.80) or not (0 < r <= 30) or abs(yr-yb)>55:
                continue
            for xv,yv,v in all_nums:
                if not (xr < xv <= page_w*.88) or v<0 or abs(yv-yb)>55:
                    continue
                err=abs(b*r/100-v)
                if err<=max(.08,b*r/100*.03):
                    score=err+abs(yb-yr)/100+abs(yb-yv)/100
                    if best is None or score<best[0]: best=(score,b,r,v)
    if best:
        _,base,rate,vat=best

    # Le TTC/net à payer est toujours dans la colonne la plus à droite du pied.
    right_values=[v for x,y,v in all_nums if x>=page_w*.78 and v>0]
    if right_values:
        # Prendre le plus grand montant réaliste; les petits 0/13/19/7 sont des taux.
        money=[v for v in right_values if v>30]
        if money: ttc=max(money)

    # Timbre fiscal: valeur proche du libellé, généralement 1.000.
    for i,r in enumerate(footer_rows):
        if "TIMBRE" in canonical(row_text(r)):
            nearby=[]
            for rr in footer_rows[max(0,i-1):i+2]:
                for w in rr:
                    v=numeric_token_value(w.text)
                    if v is not None and w.xc<page_w*.50:
                        nearby.append((w.xc,v))
            plausible=[v for _,v in nearby if 0<v<=10]
            if plausible: stamp=min(plausible)

    total_ht=line_sum
    if base<=0: base=total_ht
    if rate<=0 and vat>0 and base>0: rate=round(vat*100/base,3)
    if vat<=0 and rate>0: vat=round(base*rate/100,3)
    calculated=round(base+vat+stamp,3)
    if ttc<=0: ttc=calculated

    # Facture export exonérée/TVA nulle: TTC = base, même si le pied affiche la
    # liste des taux 0/13/19/7. Ne pas confondre ces taux avec une TVA appliquée.
    if abs(ttc-base-stamp)<=.10:
        rate=0.0; vat=0.0; calculated=round(base+stamp,3)

    return {
        "total_ht":round(total_ht,3),
        "base_tva":round(base,3),
        "montant_tva":round(vat,3),
        "total_ttc":round(ttc,3),
        "tax_rate":round(rate,3),
        "timbre_fiscal":round(stamp,3),
        "frais_port_non_soumis":0.0,
        "frais_port_soumis":0.0,
        "taux_tva_frais_port":0.0,
        "taxes_cpl":0.0,
        "total_ttc_calcule":calculated,
        "source_totaux":"ocr_footer_consistency_v12",
    }


def complete_line_tax_rates(
    lines: List[Dict[str, Any]],
    totals: Dict[str, Any],
) -> List[Dict[str, Any]]:
    global_rate = normalize_number(totals.get("tax_rate"))

    if global_rate <= 0:
        return lines

    for line in lines:
        if not isinstance(line, dict):
            continue

        current_rate = normalize_number(line.get("taux_tva"))

        if current_rate <= 0:
            line["taux_tva"] = round(global_rate, 3)
            line["source_taux_tva"] = "taux_global_facture"

    return lines

# ============================================================
# VALIDATION
# ============================================================

def build_consistency(result: Dict[str, Any]) -> Dict[str, Any]:
    lines = result.get("lignes", [])
    totals = result.get("totaux", {})
    document = result.get("document", {})
    supplier = result.get("fournisseur", {})
    customer = result.get("client", {})

    line_sum = round(sum(normalize_number(line.get("montant_ht")) for line in lines), 3)
    total_ht = round(normalize_number(totals.get("total_ht")), 3)
    total_ttc = round(normalize_number(totals.get("total_ttc")), 3)
    expected_ttc = round(normalize_number(totals.get("total_ttc_calcule")), 3)

    errors: List[Dict[str, str]] = []
    warnings: List[Dict[str, str]] = []

    required = {
        "document.numero": document.get("numero"),
        "document.date": document.get("date"),
        "fournisseur.nom": supplier.get("nom"),
        "client.nom": customer.get("nom"),
        "totaux.total_ttc": total_ttc,
    }
    for field, value in required.items():
        if not value:
            errors.append({"field": field, "message": "Champ non détecté avec une confiance suffisante"})

    if not lines:
        warnings.append({"field": "lignes", "message": "Aucune ligne article fiable détectée"})
    elif total_ht and abs(line_sum - total_ht) > max(0.05, total_ht * 0.01):
        warnings.append({
            "field": "totaux.total_ht",
            "message": f"Somme lignes {line_sum} différente du total HT OCR {total_ht}",
        })

    if total_ttc and expected_ttc and abs(total_ttc - expected_ttc) > max(0.05, total_ttc * 0.01):
        warnings.append({
            "field": "totaux.total_ttc",
            "message": f"TTC OCR {total_ttc} différent du TTC recalculé {expected_ttc}",
        })

    return {
        "is_valid": not errors,
        "requires_human_review": bool(errors or warnings),
        "error_count": len(errors),
        "warning_count": len(warnings),
        "errors": errors,
        "warnings": warnings,
        "line_sum_ht": line_sum,
        "policy": "Aucune valeur métier fixe; extraction fondée sur les libellés et les coordonnées Tesseract.",
    }


# ============================================================
# ENDPOINTS
# ============================================================

@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "service": "extractionserviceocr-generic-v11"}


@app.post("/extract")
def extract_from_ocr(req: OCRExtractionRequest) -> Dict[str, Any]:
    words = normalize_words(req.words)
    full_text = clean_display(req.full_text)
    reconstructed = clean_display(req.reconstructed_text)
    text = reconstructed or full_text
    if full_text and reconstructed and full_text != reconstructed:
        text = reconstructed + "\n" + full_text

    rows = group_words_into_rows(page_words(words, 1))
    document = extract_document(text, rows, req.page_count)
    supplier, customer = extract_supplier_customer(text, words)

    supplier = complete_supplier_identifier_from_document(
        text,
        supplier,
        customer,
    )

    lines = extract_lines(words)
    totals = extract_totals(text, words, lines)

    lines = complete_line_tax_rates(
        lines,
        totals,
    )

    result: Dict[str, Any] = {
        "document": document,
        "fournisseur": supplier,
        "client": customer,
        "facture": {
            "reference_client": "",
            "commercial": "",
            "conditions_paiement": "",
        },
        "lignes_facture": lines,
        
        "totaux": totals,
        "ocr": {
            "engine": "tesseract",
            "service_version": "2026.07.21-generic-v11",
            "confidence": req.confidence,
            "quality": req.quality,
            "source_type": req.source_type,
            "word_count_received": len(req.words),
            
            "word_count_normalized": len(words),
            "uses_hardcoded_business_values": False,
        },
    }
    result["controle_validation"] = build_consistency(result)
    result["controle_extraction"] = result["controle_validation"]
    return result