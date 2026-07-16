import os
import re
from typing import Any, Dict, List, Tuple

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from PIL import Image, ImageOps, ImageFilter
import pytesseract
from pytesseract import Output


SHARED_DIR = os.environ.get("SHARED_DIR", "/shared")

# Minimum image width for OCR. Good for invoices/tables.
MIN_OCR_WIDTH = 2200

app = FastAPI(title="ocrservice-teif-ready")


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
    if img.width < MIN_OCR_WIDTH:
        scale = MIN_OCR_WIDTH / img.width
        img = img.resize(
            (int(img.width * scale), int(img.height * scale)),
            Image.Resampling.LANCZOS,
        )
    return img


def preprocess_soft(img: Image.Image) -> Image.Image:
    """
    Soft preprocessing:
    Good for normal scanned PDFs and rendered pages.
    """
    img = resize_if_needed(img)
    img = img.convert("L")
    img = ImageOps.autocontrast(img)
    img = img.filter(ImageFilter.SHARPEN)
    return img


def preprocess_binary(img: Image.Image) -> Image.Image:
    """
    Binary preprocessing:
    Better for weak scans, gray background, low contrast.
    """
    img = resize_if_needed(img)
    img = img.convert("L")
    img = ImageOps.autocontrast(img)
    img = img.filter(ImageFilter.SHARPEN)

    # Threshold. 180 works better than 140 for many invoice scans.
    img = img.point(lambda p: 255 if p > 180 else 0)

    return img


def try_orientation_fix(img: Image.Image) -> Image.Image:
    """
    Try to auto-detect rotation using Tesseract OSD.
    If OSD fails, return original.
    """
    try:
        osd = pytesseract.image_to_osd(img)
        m = re.search(r"Rotate:\s+(\d+)", osd)

        if m:
            angle = int(m.group(1))

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
        return max(0, min(100, int(float(value))))
    except Exception:
        return 0


def clean_ocr_text(text: str) -> str:
    if not text:
        return ""

    text = text.replace("\r", "\n")
    text = text.replace("\u00a0", " ")

    replacements = {
        "T.V.A": "TVA",
        "T V A": "TVA",
        "T.T.C.": "TTC",
        "T.T.C": "TTC",
        "T T C": "TTC",
        "H.T": "HT",
        "H T": "HT",
        "NET À PAYER": "NET A PAYER",
        "NET A PAYER": "NET A PAYER",
        "N°": "Numero",
        "Nº": "Numero",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def postprocess_invoice_ocr(text: str) -> str:
    """
    Post-processing métier pour factures OCR.
    Ne remplace pas l'extraction, mais améliore le texte avant extractionserviceocr.
    """
    if not text:
        return ""

    fixes = {
        "Frage": "Page",
        "Fage": "Page",
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

    for old, new in fixes.items():
        text = text.replace(old, new)

    # Nettoyer les caractères parasites après les nombres: 600,000] -> 600,000
    text = re.sub(r"(\d+[,.]\d{2,3})\]", r"\1", text)

    # Corriger les codes client OCR:
    # co000088 / c0000088 / C000088 -> C0000088
    text = re.sub(
        r"\b[cC][oO0](\d{5,})\b",
        lambda m: "C0" + m.group(1),
        text
    )

    # Corriger FA 260079 si OCR lit F4 ou espace bizarre
    text = re.sub(r"\bF[A4]\s+(\d{4,})\b", r"FA \1", text)

    # Corriger quelques erreurs fréquentes sur Tenor
    text = re.sub(r"\bT[EÉ]NOR\b", "TENOR", text, flags=re.IGNORECASE)
    text = re.sub(r"\bAFRIQUE\b", "AFRIQUE", text, flags=re.IGNORECASE)

    clean_lines = []
    useful_keywords = [
        "facture", "date", "client", "total", "tva", "ttc", "ht",
        "référence", "reference", "désignation", "designation",
        "matricule", "fiscal", "net", "payer", "tenor",
        "montant", "prix", "quantité", "quantite", "remise",
        "livré", "livre", "assistance", "consultix", "tunis",
        "timbre", "page", "email", "site", "web"
    ]

    for line in text.splitlines():
        l = line.strip()
        if not l:
            continue

        lower = l.lower()
        has_digit = bool(re.search(r"\d", l))
        has_keyword = any(k in lower for k in useful_keywords)

        # Supprimer seulement les petites lignes clairement inutiles.
        # Exemple: ÉTÉPER, KEXXX, signes isolés.
        if len(l) <= 10 and not has_digit and not has_keyword:
            continue

        clean_lines.append(l)

    return "\n".join(clean_lines).strip()


def build_tesseract_config(psm: int) -> str:
    return (
        f"--oem 3 "
        f"--psm {psm} "
        "-c preserve_interword_spaces=1 "
        "-c tessedit_char_blacklist=|"
    )


def run_tesseract(img: Image.Image, lang: str, psm: int) -> Tuple[str, Dict[str, Any]]:
    config = build_tesseract_config(psm)

    text = pytesseract.image_to_string(
        img,
        lang=lang,
        config=config
    )

    data = pytesseract.image_to_data(
        img,
        lang=lang,
        config=config,
        output_type=Output.DICT
    )

    return clean_ocr_text(text), data


def words_from_tesseract_data(data: Dict[str, Any], page_index: int) -> List[Dict[str, Any]]:
    page_words: List[Dict[str, Any]] = []
    count = len(data.get("text", []))

    for idx in range(count):
        word_text = str(data.get("text", [""])[idx]).strip()

        if not word_text:
            continue

        x = data.get("left", [0])[idx]
        y = data.get("top", [0])[idx]
        w = data.get("width", [0])[idx]
        h = data.get("height", [0])[idx]
        conf = parse_confidence(data.get("conf", [0])[idx])

        page_words.append({
            "text": word_text,
            "x0": round(float(x), 2),
            "y0": round(float(y), 2),
            "x1": round(float(x + w), 2),
            "y1": round(float(y + h), 2),
            "conf": conf,
            "page": page_index,
            "block_no": int(data.get("block_num", [0])[idx]),
            "line_no": int(data.get("line_num", [0])[idx]),
            "word_no": int(data.get("word_num", [0])[idx]),
        })

    return page_words


def confidence_from_words(words: List[Dict[str, Any]]) -> float:
    if not words:
        return 0.0

    valid = [w["conf"] for w in words if w.get("conf", 0) > 0]

    if not valid:
        return 0.0

    return round(sum(valid) / len(valid), 2)


def reconstruct_text_from_words(words: List[Dict[str, Any]]) -> str:
    """
    Rebuild lines using OCR coordinates.
    Important for invoice tables.
    """
    if not words:
        return ""

    sorted_words = sorted(
        words,
        key=lambda w: (
            w["page"],
            round(w["y0"] / 10) * 10,
            w["x0"]
        )
    )

    lines = []
    current_line = []
    current_page = None
    current_y = None

    for w in sorted_words:
        page = w["page"]
        y = round(w["y0"] / 10) * 10

        if current_y is None:
            current_y = y
            current_page = page

        if page != current_page or abs(y - current_y) > 12:
            if current_line:
                lines.append(" ".join(x["text"] for x in current_line))

            if page != current_page:
                lines.append(f"\n===== PAGE {page} =====")

            current_line = [w]
            current_y = y
            current_page = page
        else:
            current_line.append(w)

    if current_line:
        lines.append(" ".join(x["text"] for x in current_line))

    return clean_ocr_text("\n".join(lines))


def score_ocr_result(text: str, words: List[Dict[str, Any]]) -> float:
    """
    Select best OCR variant.
    Higher is better.
    """
    score = 0.0

    confidence = confidence_from_words(words)
    score += confidence

    keywords = [
        "facture", "avoir", "total", "tva", "ttc", "ht",
        "client", "date", "reference", "référence",
        "designation", "désignation", "quantité", "quantite",
        "prix", "montant", "net a payer", "net à payer",
        "timbre", "siret", "siren", "matricule", "fiscal"
    ]

    lower = text.lower()

    for k in keywords:
        if k in lower:
            score += 3

    # Reward useful numbers
    numbers = re.findall(r"\d+[,.]\d{2,4}", text)
    score += min(len(numbers), 20)

    # Reward invoice numbers
    if re.search(r"\bFA\s*\d{4,}\b", text, re.IGNORECASE):
        score += 5

    # Reward date
    if re.search(r"\b\d{2}/\d{2}/\d{4}\b", text):
        score += 5

    # Penalize too short text
    if len(text) < 100:
        score -= 30

    return score


def choose_best_ocr(img: Image.Image, lang: str, requested_psm: int, page_index: int) -> Dict[str, Any]:
    """
    Try multiple OCR strategies.
    """
    variants = []

    soft = preprocess_soft(img)
    binary = preprocess_binary(img)

    soft = try_orientation_fix(soft)
    binary = try_orientation_fix(binary)

    psm_candidates = []
    for psm in [requested_psm, 6, 4, 11]:
        if psm not in psm_candidates:
            psm_candidates.append(psm)

    for label, image_variant in [
        ("soft", soft),
        ("binary", binary),
    ]:
        for psm in psm_candidates:
            try:
                text, data = run_tesseract(image_variant, lang, psm)
                words = words_from_tesseract_data(data, page_index)
                score = score_ocr_result(text, words)

                variants.append({
                    "variant": label,
                    "psm": psm,
                    "text": text,
                    "words": words,
                    "confidence": confidence_from_words(words),
                    "score": score,
                })

            except Exception:
                continue

    if not variants:
        return {
            "variant": "failed",
            "psm": requested_psm,
            "text": "",
            "words": [],
            "confidence": 0.0,
            "score": 0.0,
        }

    variants.sort(key=lambda x: x["score"], reverse=True)
    return variants[0]


def build_quality(
    confidence: float,
    all_words: List[Dict[str, Any]],
    per_page: List[Dict[str, Any]]
) -> Dict[str, Any]:
    warnings = []

    full_text = "\n".join(page.get("text", "") for page in per_page)

    if confidence < 70:
        warnings.append("OCR confidence is under 70%. Manual validation is recommended.")

    if not all_words:
        warnings.append("No OCR words detected.")

    required_patterns = {
        "invoice_or_facture": r"\bFA\s*\d{4,}\b|\bFacture\b",
        "date": r"\b\d{2}/\d{2}/\d{4}\b",
        "client": r"\bC\d{5,}\b",
        "total_ttc": r"\b\d+[,.]\d{3}\s*TND\b|\bTTC\b",
        "tax": r"\bTVA\b|\b19[,.]00\b|\b7[,.]00\b",
    }

    missing = []

    for name, pattern in required_patterns.items():
        if not re.search(pattern, full_text, re.IGNORECASE):
            missing.append(name)

    if missing:
        warnings.append(f"Missing important invoice fields after OCR: {', '.join(missing)}")

    garbage_words = [
        w for w in all_words
        if w.get("conf", 100) < 40 and len(str(w.get("text", ""))) > 3
    ]

    if len(garbage_words) >= 5:
        warnings.append("Several low-confidence suspicious OCR words detected.")

    for page in per_page:
        if page.get("confidence", 0) < 70:
            warnings.append(f"Page {page.get('page')} has weak OCR confidence.")

        if len(page.get("text", "")) < 100:
            warnings.append(f"Page {page.get('page')} has very little OCR text.")

    return {
        "status": "ok" if not warnings else "needs_manual_validation",
        "warnings": warnings,
        "low_confidence_threshold": 70,
        "word_count": len(all_words),
        "missing_fields": missing,
    }


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "ocrservice"
    }


# =========================================================
# MAIN ENDPOINT
# =========================================================

@app.post("/ocr", response_model=OCRResponse)
def run_ocr(req: OCRRequest):
    if not req.image_paths:
        raise HTTPException(status_code=400, detail="image_paths is required")

    per_page: List[Dict[str, Any]] = []
    all_words: List[Dict[str, Any]] = []
    confidences: List[float] = []

    for page_index, path in enumerate(req.image_paths, start=1):
        if not path.startswith(SHARED_DIR):
            raise HTTPException(
                status_code=400,
                detail=f"path outside shared dir: {path}"
            )

        if not os.path.exists(path):
            raise HTTPException(
                status_code=404,
                detail=f"file not found: {path}"
            )

        try:
            img = Image.open(path)
            img.load()
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"cannot open image {path}: {str(e)}"
            )

        best = choose_best_ocr(
            img=img,
            lang=req.lang,
            requested_psm=req.psm,
            page_index=page_index
        )

        page_words = best["words"]
        all_words.extend(page_words)
        confidences.append(best["confidence"])

        page_reconstructed = reconstruct_text_from_words(page_words)
        page_reconstructed = postprocess_invoice_ocr(page_reconstructed)

        chosen_text = best["text"]

        # Prefer reconstructed text if it is rich enough.
        if len(page_reconstructed) > len(chosen_text) * 0.8:
            chosen_text = page_reconstructed

        chosen_text = clean_ocr_text(chosen_text)
        chosen_text = postprocess_invoice_ocr(chosen_text)

        per_page.append({
            "page": page_index,
            "text": chosen_text,
            "raw_text": best["text"],
            "reconstructed_text": page_reconstructed,
            "words": page_words,
            "confidence": round(best["confidence"], 2),
            "ocr_variant": best["variant"],
            "psm": best["psm"],
            "score": round(best["score"], 2),
        })

    full_text_parts = []

    for page in per_page:
        full_text_parts.append(f"\n===== PAGE {page['page']} =====\n{page['text']}")

    full_text = clean_ocr_text("\n".join(full_text_parts))
    full_text = postprocess_invoice_ocr(full_text)

    reconstructed_text = reconstruct_text_from_words(all_words)
    reconstructed_text = postprocess_invoice_ocr(reconstructed_text)

    confidence = round(sum(confidences) / len(confidences), 2) if confidences else 0.0

    low_confidence_words = [
        word for word in all_words
        if word.get("conf", 100) < 60
    ]

    quality = build_quality(
        confidence=confidence,
        all_words=all_words,
        per_page=per_page
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