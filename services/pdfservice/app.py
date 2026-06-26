import os
import uuid
import re
from typing import Any, Dict, List

import fitz
from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel


SHARED_DIR = os.environ.get("SHARED_DIR", "/shared")
INPUT_DIR = os.path.join(SHARED_DIR, "input")
RENDER_DIR = os.path.join(SHARED_DIR, "rendered")

os.makedirs(INPUT_DIR, exist_ok=True)
os.makedirs(RENDER_DIR, exist_ok=True)

app = FastAPI(title="pdfservice-teif-ready")


# =========================================================
# CONFIG
# =========================================================

# 4x = around 288 DPI. Better for scanned invoices and small tables.
# If OCR becomes slow, change to fitz.Matrix(3, 3).
RENDER_MATRIX = fitz.Matrix(4, 4)

# If native text is too small or poor, consider page scanned.
MIN_TEXT_LEN_PER_PAGE = 80

# Minimum useful words to consider the page native text.
MIN_WORDS_PER_PAGE = 15


# =========================================================
# MODELS
# =========================================================

class PageText(BaseModel):
    page: int
    text: str
    text_preview: str
    text_len: int
    word_count: int
    has_native_text: bool


class AnalyzeResponse(BaseModel):
    job_id: str
    filename: str
    stored_pdf_path: str
    page_count: int
    source_type: str
    extracted_text: str
    extracted_text_preview: str
    rendered_pages: List[str]
    pages: List[PageText]
    words: List[Dict[str, Any]]
    blocks: List[Dict[str, Any]]
    word_count: int
    pages_with_text: int
    document_info: Dict[str, Any]
    quality: Dict[str, Any]


# =========================================================
# TEXT CLEANING
# =========================================================

def clean_pdf_text(text: str) -> str:
    if not text:
        return ""

    text = text.replace("\r", "\n")
    text = text.replace("\u00a0", " ")

    # Keep line breaks but clean useless spaces
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def normalize_table_text(text: str) -> str:
    """
    Small cleanup to help extractionservice.
    Does not change values, only improves readability.
    """
    if not text:
        return ""

    text = clean_pdf_text(text)

    replacements = {
        "NET A PAYER": "NET A PAYER",
        "NET À PAYER": "NET A PAYER",
        "T.T.C.": "TTC",
        "T.V.A": "TVA",
        "H.T.": "HT",
        "N°": "Numero",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    return text.strip()


# =========================================================
# WORDS / BLOCKS EXTRACTION
# =========================================================

def words_from_page(page: fitz.Page, page_number: int) -> List[Dict[str, Any]]:
    """
    Extract words with coordinates.
    This is very useful later if we want to rebuild invoice tables.
    """
    out = []

    for w in page.get_text("words"):
        # PyMuPDF word tuple:
        # x0, y0, x1, y1, word, block_no, line_no, word_no
        x0, y0, x1, y1, text = w[0], w[1], w[2], w[3], w[4]

        if not str(text).strip():
            continue

        out.append({
            "text": str(text).strip(),
            "x0": round(x0, 2),
            "y0": round(y0, 2),
            "x1": round(x1, 2),
            "y1": round(y1, 2),
            "page": page_number,
            "block_no": int(w[5]) if len(w) > 5 else None,
            "line_no": int(w[6]) if len(w) > 6 else None,
            "word_no": int(w[7]) if len(w) > 7 else None,
        })

    return out


def blocks_from_page(page: fitz.Page, page_number: int) -> List[Dict[str, Any]]:
    """
    Extract text blocks with coordinates.
    Useful for supplier/customer/header zones.
    """
    out = []

    blocks = page.get_text("blocks")

    for b in blocks:
        # x0, y0, x1, y1, text, block_no, block_type
        x0, y0, x1, y1, text = b[0], b[1], b[2], b[3], b[4]

        text = clean_pdf_text(str(text))

        if not text:
            continue

        out.append({
            "text": text,
            "x0": round(x0, 2),
            "y0": round(y0, 2),
            "x1": round(x1, 2),
            "y1": round(y1, 2),
            "page": page_number,
            "block_no": int(b[5]) if len(b) > 5 else None,
            "block_type": int(b[6]) if len(b) > 6 else None,
        })

    return out


def text_from_words(words: List[Dict[str, Any]]) -> str:
    """
    Rebuild text from words using coordinates.
    This often gives better table order than page.get_text("text").
    """
    if not words:
        return ""

    # Group by approximate y position
    sorted_words = sorted(words, key=lambda w: (w["page"], round(w["y0"] / 3) * 3, w["x0"]))

    lines = []
    current_line = []
    current_y = None

    for w in sorted_words:
        y = round(w["y0"] / 3) * 3

        if current_y is None:
            current_y = y

        if abs(y - current_y) > 4:
            lines.append(" ".join([x["text"] for x in current_line]))
            current_line = [w]
            current_y = y
        else:
            current_line.append(w)

    if current_line:
        lines.append(" ".join([x["text"] for x in current_line]))

    return clean_pdf_text("\n".join(lines))


# =========================================================
# SOURCE TYPE DETECTION
# =========================================================

def page_has_native_text(page_text: str, word_count: int) -> bool:
    text_len = len(page_text.strip())

    if text_len >= MIN_TEXT_LEN_PER_PAGE and word_count >= MIN_WORDS_PER_PAGE:
        return True

    return False


def detect_source_type(page_count: int, pages_with_text: int) -> str:
    if pages_with_text == 0:
        return "scanned"

    if pages_with_text == page_count:
        return "pdf_text"

    return "mixed"


def build_quality(source_type: str, pages: List[Dict[str, Any]], word_count: int) -> Dict[str, Any]:
    warnings = []

    if source_type == "scanned":
        warnings.append("No reliable native text found. OCR is required.")

    if source_type == "mixed":
        warnings.append("Mixed PDF detected. Some pages need OCR, some have native text.")

    if word_count == 0:
        warnings.append("No words extracted from PDF native layer.")

    low_text_pages = [
        p["page"] for p in pages
        if p["text_len"] < MIN_TEXT_LEN_PER_PAGE
    ]

    return {
        "warnings": warnings,
        "low_text_pages": low_text_pages,
        "render_dpi_approx": 288,
        "status": "ok" if not warnings else "needs_attention"
    }


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "pdfservice"
    }


# =========================================================
# MAIN ENDPOINT
# =========================================================

@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    job_id = uuid.uuid4().hex
    safe_original_name = os.path.basename(file.filename)
    stored_filename = f"{job_id}_{safe_original_name}"
    pdf_path = os.path.join(INPUT_DIR, stored_filename)

    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Empty PDF file")

    with open(pdf_path, "wb") as f:
        f.write(content)

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid PDF: {str(e)}")

    if len(doc) == 0:
        doc.close()
        raise HTTPException(status_code=400, detail="PDF has no pages")

    rendered_pages: List[str] = []
    all_words: List[Dict[str, Any]] = []
    all_blocks: List[Dict[str, Any]] = []
    page_results: List[Dict[str, Any]] = []

    extracted_text_parts: List[str] = []
    pages_with_text = 0

    for i, page in enumerate(doc):
        page_number = i + 1

        # Native text
        native_text = normalize_table_text(page.get_text("text"))

        # Words / blocks
        page_words = words_from_page(page, page_number)
        page_blocks = blocks_from_page(page, page_number)

        all_words.extend(page_words)
        all_blocks.extend(page_blocks)

        # Coordinate rebuilt text
        words_text = text_from_words(page_words)

        # Choose the better native extraction for extractionservice
        # For native PDFs, PyMuPDF native text often keeps invoice rows better.
        # words_text is useful for visual debugging, but it can split table rows badly.
        if native_text and len(native_text) > 100:
            best_text = native_text
        else:
            best_text = words_text

        best_text = normalize_table_text(best_text)

        has_text = page_has_native_text(best_text, len(page_words))

        if has_text:
            pages_with_text += 1

        extracted_text_parts.append(f"\n===== PAGE {page_number} =====\n{best_text}")

        # Always render pages, even native PDFs.
        # This allows OCR fallback and visual debugging.
        pix = page.get_pixmap(matrix=RENDER_MATRIX, alpha=False)
        image_path = os.path.join(RENDER_DIR, f"{job_id}_page_{page_number}.png")
        pix.save(image_path)
        rendered_pages.append(image_path)

        page_results.append({
            "page": page_number,
            "text": best_text,
            "text_preview": best_text[:1000],
            "text_len": len(best_text),
            "word_count": len(page_words),
            "has_native_text": has_text
        })

    full_text = clean_pdf_text("\n".join(extracted_text_parts))
    page_count = len(doc)
    source_type = detect_source_type(page_count, pages_with_text)

    metadata = doc.metadata or {}

    document_info = {
        "title": metadata.get("title", "") or "",
        "author": metadata.get("author", "") or "",
        "subject": metadata.get("subject", "") or "",
        "creator": metadata.get("creator", "") or "",
        "producer": metadata.get("producer", "") or "",
        "creation_date": metadata.get("creationDate", "") or "",
        "modification_date": metadata.get("modDate", "") or "",
        "is_encrypted": bool(doc.is_encrypted),
        "is_pdf": bool(doc.is_pdf),
    }

    quality = build_quality(
        source_type=source_type,
        pages=page_results,
        word_count=len(all_words)
    )

    doc.close()

    return AnalyzeResponse(
        job_id=job_id,
        filename=file.filename,
        stored_pdf_path=pdf_path,
        page_count=page_count,
        source_type=source_type,
        extracted_text=full_text,
        extracted_text_preview=full_text[:1500],
        rendered_pages=rendered_pages,
        pages=page_results,
        words=all_words,
        blocks=all_blocks,
        word_count=len(all_words),
        pages_with_text=pages_with_text,
        document_info=document_info,
        quality=quality,
    )