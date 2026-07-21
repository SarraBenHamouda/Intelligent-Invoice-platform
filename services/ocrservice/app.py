import os
import re
from typing import Any, Dict, List, Tuple

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image, ImageOps, ImageFilter
import pytesseract
from pytesseract import Output


# =========================================================
# CONFIGURATION
# =========================================================

SHARED_DIR = os.environ.get("SHARED_DIR", "/shared")
MIN_OCR_WIDTH = int(os.environ.get("MIN_OCR_WIDTH", "2200"))
LOW_CONFIDENCE_THRESHOLD = int(
    os.environ.get("LOW_CONFIDENCE_THRESHOLD", "70")
)

app = FastAPI(
    title="ocrservice-teif-ready",
    version="2026.07",
)


# =========================================================
# MODELS
# =========================================================

class OCRRequest(BaseModel):
    image_paths: List[str]
    lang: str = "fra+eng"
    psm: int = 6


class OCRResponse(BaseModel):
    pages: int
    per_page: List[Dict[str, Any]]
    full_text: str
    reconstructed_text: str
    words: List[Dict[str, Any]]
    confidence: float
    avg_confidence: float
    low_confidence_words: List[Dict[str, Any]]
    source_type: str
    quality: Dict[str, Any]


# =========================================================
# IMAGE PREPROCESSING
# =========================================================

def resize_if_needed(img: Image.Image) -> Image.Image:
    if img.width >= MIN_OCR_WIDTH:
        return img

    scale = MIN_OCR_WIDTH / img.width

    return img.resize(
        (
            int(img.width * scale),
            int(img.height * scale),
        ),
        Image.Resampling.LANCZOS,
    )


def preprocess_soft(img: Image.Image) -> Image.Image:
    img = resize_if_needed(img)
    img = img.convert("L")
    img = ImageOps.autocontrast(img)
    img = img.filter(ImageFilter.SHARPEN)
    return img


def preprocess_binary(img: Image.Image) -> Image.Image:
    img = resize_if_needed(img)
    img = img.convert("L")
    img = ImageOps.autocontrast(img)
    img = img.filter(ImageFilter.SHARPEN)
    return img.point(lambda pixel: 255 if pixel > 180 else 0)


def preprocess_high_contrast(img: Image.Image) -> Image.Image:
    img = resize_if_needed(img)
    img = img.convert("L")
    img = ImageOps.autocontrast(img, cutoff=1)
    img = img.filter(
        ImageFilter.UnsharpMask(
            radius=1,
            percent=160,
            threshold=2,
        )
    )
    return img


def try_orientation_fix(img: Image.Image) -> Image.Image:
    try:
        osd = pytesseract.image_to_osd(img)
        match = re.search(r"Rotate:\s+(\d+)", osd)

        if not match:
            return img

        angle = int(match.group(1))

        if angle == 90:
            return img.rotate(270, expand=True)

        if angle == 180:
            return img.rotate(180, expand=True)

        if angle == 270:
            return img.rotate(90, expand=True)

    except Exception:
        pass

    return img


# =========================================================
# OCR UTILS
# =========================================================

def parse_confidence(value: Any) -> int:
    try:
        parsed = int(float(value))
        return max(0, min(100, parsed))
    except Exception:
        return 0


def clean_ocr_text(text: str) -> str:
    if not text:
        return ""

    text = str(text)
    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")
    text = text.replace("\u00a0", " ")

    replacements = {
        "T.V.A.": "TVA",
        "T.V.A": "TVA",
        "T V A": "TVA",
        "T.T.C.": "TTC",
        "T.T.C": "TTC",
        "T T C": "TTC",
        "H.T.": "HT",
        "H.T": "HT",
        "H T": "HT",
        "NET À PAYER": "NET A PAYER",
        "NET A PAYER": "NET A PAYER",
        "N°": "Numero",
        "Nº": "Numero",
    }

    for old_value, new_value in replacements.items():
        text = text.replace(old_value, new_value)

    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def normalize_eco_contribution_text(text: str) -> str:
    if not text:
        return ""

    text = re.sub(
        (
            r"\b[EÉ]CO[\s\-_]*"
            r"CONTRIB(?:UTION|UTON|ULION|UTI0N)?\b"
        ),
        "ECO-CONTRIBUTION",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        (
            r"\bCUMUL\s+DE\s+LA\s+TAXE\s+"
            r"[EÉ]CO[\s\-_]*CONTRIB(?:UTION|UTON)?\b"
        ),
        "CUMUL TAXE ECO-CONTRIBUTION",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\bTAXE\s+[EÉ]CO\b",
        "TAXE ECO",
        text,
        flags=re.IGNORECASE,
    )

    return text


def postprocess_invoice_ocr(text: str) -> str:
    if not text:
        return ""

    fixes = {
        "Frage": "Page",
        "Fage": "Page",
        "T.V.A.": "TVA",
        "T.V.A": "TVA",
        "T T C": "TTC",
        "T.T.C.": "TTC",
        "T.T.C": "TTC",
        "Net a": "Net à",
        "Net A": "Net à",
        "NET A PAYER": "NET A PAYER",
        "e_mail": "email",
        "E_mail": "email",
        "Site WEB": "Site Web",
        "site WEB": "Site Web",
    }

    for old_value, new_value in fixes.items():
        text = text.replace(old_value, new_value)

    text = normalize_eco_contribution_text(text)

    text = re.sub(r"(\d+[,.]\d{2,3})\]", r"\1", text)
    text = re.sub(
        r"(\d+[,.]\d{2,3})\]\s*([A-Z]{3})",
        r"\1 \2",
        text,
    )

    text = re.sub(
        r"\b[cC][oO0](\d{5,})\b",
        lambda match: "C0" + match.group(1),
        text,
    )

    text = re.sub(
        r"\bF[A4]\s+(\d{4,})\b",
        r"FA \1",
        text,
    )

    text = re.sub(
        r"\bT[EÉ]NOR\b",
        "TENOR",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\bNET\s+[AÀ]\s+PAYER\b",
        "NET A PAYER",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\bBASE\s+T[\.\s]*V[\.\s]*A\b",
        "BASE TVA",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\bTOTAL\s+H[\.\s]*T\b",
        "TOTAL HT",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\bTOTAL\s+T[\.\s]*T[\.\s]*C\b",
        "TOTAL TTC",
        text,
        flags=re.IGNORECASE,
    )

    useful_keywords = [
        "facture",
        "avoir",
        "date",
        "client",
        "total",
        "tva",
        "ttc",
        "ht",
        "base",
        "référence",
        "reference",
        "désignation",
        "designation",
        "matricule",
        "fiscal",
        "net",
        "payer",
        "tenor",
        "montant",
        "prix",
        "quantité",
        "quantite",
        "remise",
        "livré",
        "livre",
        "assistance",
        "consultix",
        "tunis",
        "timbre",
        "page",
        "email",
        "site",
        "web",
        "siret",
        "siren",
        "numero",
        "numéro",
        "pièce",
        "piece",
        "port",
        "soumis",
        "eco-contribution",
        "éco-contribution",
        "eco contribution",
        "éco contribution",
        "taxe eco",
        "taxe éco",
        "cumul",
        "taxes cpl",
        "taxe complémentaire",
        "taxe complementaire",
    ]

    clean_lines: List[str] = []

    for original_line in text.splitlines():
        line = original_line.strip()

        if not line:
            continue

        lower_line = line.lower()
        has_digit = bool(re.search(r"\d", line))
        has_keyword = any(
            keyword in lower_line
            for keyword in useful_keywords
        )
        has_currency = bool(
            re.search(
                r"\b(?:EUR|TND|USD|DZD|CAD)\b",
                line,
                flags=re.IGNORECASE,
            )
        )
        has_product_code = bool(
            re.search(
                r"\b[A-Z]{2,}[A-Z0-9_-]*\d+[A-Z0-9_-]*\b",
                line,
                flags=re.IGNORECASE,
            )
        )

        if (
            len(line) <= 10
            and not has_digit
            and not has_keyword
            and not has_currency
            and not has_product_code
        ):
            continue

        clean_lines.append(line)

    text = "\n".join(clean_lines)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def build_tesseract_config(psm: int) -> str:
    return (
        "--oem 3 "
        f"--psm {psm} "
        "-c preserve_interword_spaces=1 "
        "-c user_defined_dpi=300 "
        "-c tessedit_char_blacklist=|"
    )


def run_tesseract(
    img: Image.Image,
    lang: str,
    psm: int,
) -> Tuple[str, Dict[str, Any]]:
    config = build_tesseract_config(psm)

    text = pytesseract.image_to_string(
        img,
        lang=lang,
        config=config,
    )

    data = pytesseract.image_to_data(
        img,
        lang=lang,
        config=config,
        output_type=Output.DICT,
    )

    return clean_ocr_text(text), data


def words_from_tesseract_data(
    data: Dict[str, Any],
    page_index: int,
) -> List[Dict[str, Any]]:
    page_words: List[Dict[str, Any]] = []
    texts = data.get("text", [])
    count = len(texts)

    for index in range(count):
        word_text = str(texts[index]).strip()

        if not word_text:
            continue

        left_values = data.get("left", [0] * count)
        top_values = data.get("top", [0] * count)
        width_values = data.get("width", [0] * count)
        height_values = data.get("height", [0] * count)
        confidence_values = data.get("conf", [0] * count)
        block_values = data.get("block_num", [0] * count)
        paragraph_values = data.get("par_num", [0] * count)
        line_values = data.get("line_num", [0] * count)
        word_values = data.get("word_num", [0] * count)

        x = int(left_values[index])
        y = int(top_values[index])
        width = int(width_values[index])
        height = int(height_values[index])

        page_words.append({
            "text": word_text,
            "x0": round(float(x), 2),
            "y0": round(float(y), 2),
            "x1": round(float(x + width), 2),
            "y1": round(float(y + height), 2),
            "width": width,
            "height": height,
            "conf": parse_confidence(confidence_values[index]),
            "page": page_index,
            "block_no": int(block_values[index]),
            "paragraph_no": int(paragraph_values[index]),
            "line_no": int(line_values[index]),
            "word_no": int(word_values[index]),
        })

    return page_words


def confidence_from_words(
    words: List[Dict[str, Any]],
) -> float:
    if not words:
        return 0.0

    valid_confidences = [
        word["conf"]
        for word in words
        if word.get("conf", 0) > 0
    ]

    if not valid_confidences:
        return 0.0

    return round(
        sum(valid_confidences)
        / len(valid_confidences),
        2,
    )


def reconstruct_text_from_words(
    words: List[Dict[str, Any]],
) -> str:
    if not words:
        return ""

    sorted_words = sorted(
        words,
        key=lambda word: (
            word.get("page", 0),
            word.get("block_no", 0),
            word.get("paragraph_no", 0),
            word.get("line_no", 0),
            word.get("x0", 0),
        ),
    )

    reconstructed_lines: List[str] = []
    current_key = None
    current_words: List[Dict[str, Any]] = []
    current_page = None

    for word in sorted_words:
        page = word.get("page", 0)

        line_key = (
            page,
            word.get("block_no", 0),
            word.get("paragraph_no", 0),
            word.get("line_no", 0),
        )

        if current_page is None:
            current_page = page

        if page != current_page:
            if current_words:
                reconstructed_lines.append(
                    " ".join(item["text"] for item in current_words)
                )

            reconstructed_lines.append(
                f"\n===== PAGE {page} ====="
            )

            current_words = []
            current_key = None
            current_page = page

        if current_key is None:
            current_key = line_key

        if line_key != current_key:
            if current_words:
                reconstructed_lines.append(
                    " ".join(item["text"] for item in current_words)
                )

            current_words = [word]
            current_key = line_key
        else:
            current_words.append(word)

    if current_words:
        reconstructed_lines.append(
            " ".join(item["text"] for item in current_words)
        )

    return clean_ocr_text("\n".join(reconstructed_lines))


def score_ocr_result(
    text: str,
    words: List[Dict[str, Any]],
) -> float:
    if not text:
        return -1000.0

    score = confidence_from_words(words)

    keywords = [
        "facture",
        "avoir",
        "total",
        "tva",
        "ttc",
        "ht",
        "base tva",
        "client",
        "date",
        "reference",
        "référence",
        "designation",
        "désignation",
        "quantité",
        "quantite",
        "prix",
        "montant",
        "net a payer",
        "net à payer",
        "timbre",
        "siret",
        "siren",
        "matricule",
        "fiscal",
        "eco-contribution",
        "éco-contribution",
        "taxe eco",
        "cumul",
        "frais de port",
    ]

    lower_text = text.lower()

    for keyword in keywords:
        if keyword in lower_text:
            score += 3

    monetary_numbers = re.findall(
        r"\d+[,.]\d{2,4}",
        text,
    )

    score += min(len(monetary_numbers), 30)

    if re.search(r"\bFA\s*\d{4,}\b", text, re.IGNORECASE):
        score += 5

    if re.search(r"\b\d{7,10}\b", text):
        score += 3

    if re.search(r"\b\d{2}/\d{2}/\d{4}\b", text):
        score += 5

    if re.search(
        r"\b(?:EUR|TND|USD|CAD|DZD)\b",
        text,
        re.IGNORECASE,
    ):
        score += 4

    score += min(len(words) / 25, 10)

    if len(text) < 100:
        score -= 30

    if len(words) < 20:
        score -= 20

    return round(score, 2)


def choose_best_ocr(
    img: Image.Image,
    lang: str,
    requested_psm: int,
    page_index: int,
) -> Dict[str, Any]:
    variants: List[Dict[str, Any]] = []

    image_variants = [
        ("soft", try_orientation_fix(preprocess_soft(img))),
        ("binary", try_orientation_fix(preprocess_binary(img))),
        (
            "high_contrast",
            try_orientation_fix(preprocess_high_contrast(img)),
        ),
    ]

    psm_candidates: List[int] = []

    for psm in [
        requested_psm,
        6,
        4,
        3,
        11,
        12,
    ]:
        if psm not in psm_candidates:
            psm_candidates.append(psm)

    for variant_name, image_variant in image_variants:
        for psm in psm_candidates:
            try:
                text, data = run_tesseract(
                    image_variant,
                    lang,
                    psm,
                )

                words = words_from_tesseract_data(
                    data,
                    page_index,
                )

                variants.append({
                    "variant": variant_name,
                    "psm": psm,
                    "text": text,
                    "words": words,
                    "confidence": confidence_from_words(words),
                    "score": score_ocr_result(text, words),
                })

            except Exception as exception:
                variants.append({
                    "variant": variant_name,
                    "psm": psm,
                    "text": "",
                    "words": [],
                    "confidence": 0.0,
                    "score": -1000.0,
                    "error": str(exception),
                })

    successful_variants = [
        variant
        for variant in variants
        if variant.get("text")
    ]

    if not successful_variants:
        return {
            "variant": "failed",
            "psm": requested_psm,
            "text": "",
            "words": [],
            "confidence": 0.0,
            "score": 0.0,
            "tested_variants": variants,
        }

    successful_variants.sort(
        key=lambda variant: variant["score"],
        reverse=True,
    )

    best = successful_variants[0]
    best["tested_variants"] = [
        {
            "variant": variant.get("variant"),
            "psm": variant.get("psm"),
            "confidence": variant.get("confidence", 0),
            "score": variant.get("score", 0),
        }
        for variant in successful_variants[:10]
    ]

    return best


def build_quality(
    confidence: float,
    all_words: List[Dict[str, Any]],
    per_page: List[Dict[str, Any]],
) -> Dict[str, Any]:
    warnings: List[str] = []

    full_text = "\n".join(
        page.get("text", "")
        for page in per_page
    )

    if confidence < LOW_CONFIDENCE_THRESHOLD:
        warnings.append(
            (
                "OCR confidence is under "
                f"{LOW_CONFIDENCE_THRESHOLD}%. "
                "Manual validation is recommended."
            )
        )

    if not all_words:
        warnings.append("No OCR words detected.")

    required_patterns = {
        "invoice_or_facture": (
            r"\bFA\s*\d{4,}\b"
            r"|\bFacture\b"
            r"|\bNumero\s+(?:piece|facture)\b"
        ),
        "date": r"\b\d{2}/\d{2}/\d{4}\b",
        "client": r"\bC\d{5,}\b|\bClient\b",
        "total_ttc": (
            r"\bTTC\b"
            r"|\bNET\s+A\s+PAYER\b"
            r"|\b\d+[,.]\d{2,3}\s*(?:EUR|TND|USD)\b"
        ),
        "tax": r"\bTVA\b|\b\d{1,2}[,.]\d{0,2}\s*%",
    }

    missing_fields: List[str] = []

    for field_name, pattern in required_patterns.items():
        if not re.search(pattern, full_text, re.IGNORECASE):
            missing_fields.append(field_name)

    if missing_fields:
        warnings.append(
            "Missing important invoice fields after OCR: "
            + ", ".join(missing_fields)
        )

    suspicious_words = [
        word
        for word in all_words
        if (
            word.get("conf", 100) < 40
            and len(str(word.get("text", ""))) > 3
        )
    ]

    if len(suspicious_words) >= 5:
        warnings.append(
            "Several low-confidence suspicious OCR words detected."
        )

    for page in per_page:
        page_number = page.get("page")
        page_confidence = page.get("confidence", 0)
        page_text = page.get("text", "")

        if page_confidence < LOW_CONFIDENCE_THRESHOLD:
            warnings.append(
                f"Page {page_number} has weak OCR confidence."
            )

        if len(page_text) < 100:
            warnings.append(
                f"Page {page_number} has very little OCR text."
            )

    eco_contribution_detected = bool(
        re.search(
            (
                r"ECO-CONTRIBUTION"
                r"|TAXE\s+ECO"
                r"|ECO\s+CONTRIBUTION"
            ),
            full_text,
            re.IGNORECASE,
        )
    )

    totals_detected = {
        "total_ht": bool(
            re.search(
                r"\bTOTAL\s+HT\b",
                full_text,
                re.IGNORECASE,
            )
        ),
        "base_tva": bool(
            re.search(
                r"\bBASE\s+TVA\b",
                full_text,
                re.IGNORECASE,
            )
        ),
        "montant_tva": bool(
            re.search(
                r"\bMONTANT\s+TVA\b|\bTVA\b",
                full_text,
                re.IGNORECASE,
            )
        ),
        "total_ttc": bool(
            re.search(
                r"\bTOTAL\s+TTC\b|\bTTC\b",
                full_text,
                re.IGNORECASE,
            )
        ),
        "frais_port": bool(
            re.search(
                r"\bFRAIS\s+DE\s+PORT\b",
                full_text,
                re.IGNORECASE,
            )
        ),
        "taxes_complementaires": bool(
            re.search(
                (
                    r"TAXES?\s+CPL"
                    r"|TAXE\s+COMPL"
                    r"|ECO-CONTRIBUTION"
                ),
                full_text,
                re.IGNORECASE,
            )
        ),
    }

    return {
        "status": (
            "ok"
            if not warnings
            else "needs_manual_validation"
        ),
        "warnings": warnings,
        "low_confidence_threshold": LOW_CONFIDENCE_THRESHOLD,
        "word_count": len(all_words),
        "missing_fields": missing_fields,
        "eco_contribution_detected": eco_contribution_detected,
        "totals_detected": totals_detected,
        "suspicious_word_count": len(suspicious_words),
    }


# =========================================================
# SECURITY / PATH UTILS
# =========================================================

def validate_shared_path(path: str) -> str:
    if not path:
        raise HTTPException(
            status_code=400,
            detail="empty image path",
        )

    shared_real_path = os.path.realpath(SHARED_DIR)
    image_real_path = os.path.realpath(path)

    try:
        common_path = os.path.commonpath([
            shared_real_path,
            image_real_path,
        ])
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"invalid image path: {path}",
        )

    if common_path != shared_real_path:
        raise HTTPException(
            status_code=400,
            detail=f"path outside shared dir: {path}",
        )

    if not os.path.exists(image_real_path):
        raise HTTPException(
            status_code=404,
            detail=f"file not found: {path}",
        )

    if not os.path.isfile(image_real_path):
        raise HTTPException(
            status_code=400,
            detail=f"path is not a file: {path}",
        )

    return image_real_path


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
def health():
    try:
        tesseract_version = str(
            pytesseract.get_tesseract_version()
        )
    except Exception:
        tesseract_version = "unavailable"

    return {
        "status": "ok",
        "service": "ocrservice",
        "shared_dir": SHARED_DIR,
        "min_ocr_width": MIN_OCR_WIDTH,
        "tesseract_version": tesseract_version,
    }


# =========================================================
# MAIN ENDPOINT
# =========================================================

@app.post("/ocr", response_model=OCRResponse)
def run_ocr(req: OCRRequest):
    if not req.image_paths:
        raise HTTPException(
            status_code=400,
            detail="image_paths is required",
        )

    if req.psm < 0 or req.psm > 13:
        raise HTTPException(
            status_code=400,
            detail="psm must be between 0 and 13",
        )

    per_page: List[Dict[str, Any]] = []
    all_words: List[Dict[str, Any]] = []
    page_confidences: List[float] = []

    for page_index, original_path in enumerate(
        req.image_paths,
        start=1,
    ):
        path = validate_shared_path(original_path)

        try:
            with Image.open(path) as opened_image:
                opened_image.load()
                image = opened_image.copy()

        except Exception as exception:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"cannot open image {original_path}: "
                    f"{str(exception)}"
                ),
            )

        best = choose_best_ocr(
            img=image,
            lang=req.lang,
            requested_psm=req.psm,
            page_index=page_index,
        )

        page_words = best.get("words", [])
        all_words.extend(page_words)

        page_confidence = float(
            best.get("confidence", 0.0)
        )
        page_confidences.append(page_confidence)

        page_reconstructed = postprocess_invoice_ocr(
            reconstruct_text_from_words(page_words)
        )

        raw_chosen_text = best.get("text", "")

        processed_chosen_text = postprocess_invoice_ocr(
            clean_ocr_text(raw_chosen_text)
        )

        reconstructed_score = score_ocr_result(
            page_reconstructed,
            page_words,
        )

        direct_score = score_ocr_result(
            processed_chosen_text,
            page_words,
        )

        if (
            page_reconstructed
            and reconstructed_score >= direct_score
        ):
            chosen_text = page_reconstructed
            selected_text_source = "reconstructed"
        else:
            chosen_text = processed_chosen_text
            selected_text_source = "direct"

        chosen_text = postprocess_invoice_ocr(
            clean_ocr_text(chosen_text)
        )

        per_page.append({
            "page": page_index,
            "path": original_path,
            "text": chosen_text,
            "raw_text": raw_chosen_text,
            "reconstructed_text": page_reconstructed,
            "selected_text_source": selected_text_source,
            "words": page_words,
            "confidence": round(page_confidence, 2),
            "ocr_variant": best.get("variant", "unknown"),
            "psm": best.get("psm", req.psm),
            "score": round(
                float(best.get("score", 0.0)),
                2,
            ),
            "tested_variants": best.get(
                "tested_variants",
                [],
            ),
        })

    full_text_parts: List[str] = []

    for page in per_page:
        full_text_parts.append(
            (
                f"\n===== PAGE {page['page']} =====\n"
                f"{page['text']}"
            )
        )

    full_text = postprocess_invoice_ocr(
        clean_ocr_text("\n".join(full_text_parts))
    )

    reconstructed_text = postprocess_invoice_ocr(
        reconstruct_text_from_words(all_words)
    )

    confidence = (
        round(
            sum(page_confidences)
            / len(page_confidences),
            2,
        )
        if page_confidences
        else 0.0
    )

    low_confidence_words = [
        word
        for word in all_words
        if word.get("conf", 100) < 60
    ]

    quality = build_quality(
        confidence=confidence,
        all_words=all_words,
        per_page=per_page,
    )

    return OCRResponse(
        pages=len(req.image_paths),
        per_page=per_page,
        full_text=full_text,
        reconstructed_text=reconstructed_text,
        words=all_words,
        confidence=confidence,
        avg_confidence=confidence,
        low_confidence_words=low_confidence_words,
        source_type="ocr",
        quality=quality,
    )