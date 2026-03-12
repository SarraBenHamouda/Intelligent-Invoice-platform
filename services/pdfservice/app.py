import os
import uuid
from typing import Optional, List

import fitz
from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel

SHARED_DIR = os.environ.get("SHARED_DIR", "/shared")
INPUT_DIR = os.path.join(SHARED_DIR, "input")
RENDER_DIR = os.path.join(SHARED_DIR, "rendered")

os.makedirs(INPUT_DIR, exist_ok=True)
os.makedirs(RENDER_DIR, exist_ok=True)

app = FastAPI(title="pdfservice")


class AnalyzeResponse(BaseModel):
    job_id: str
    filename: str
    stored_pdf_path: str
    page_count: int
    source_type: str
    extracted_text: str
    extracted_text_preview: str
    rendered_pages: List[str]


def detect_source_type(doc: fitz.Document, all_text: str) -> str:
    page_count = len(doc)
    pages_with_text = 0

    for page in doc:
        txt = page.get_text("text").strip()
        if len(txt) > 20:
            pages_with_text += 1

    if pages_with_text == 0:
        return "scanned"
    if pages_with_text == page_count:
        return "pdf_text"
    return "mixed"


@app.get("/health")
def health():
    return {"status": "ok", "service": "pdfservice"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    job_id = uuid.uuid4().hex
    filename = f"{job_id}_{file.filename}"
    pdf_path = os.path.join(INPUT_DIR, filename)

    content = await file.read()
    with open(pdf_path, "wb") as f:
        f.write(content)

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid PDF: {str(e)}")

    extracted_parts = []
    rendered_pages = []

    for i, page in enumerate(doc):
        extracted_parts.append(page.get_text("text"))

        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        image_path = os.path.join(RENDER_DIR, f"{job_id}_page_{i+1}.png")
        pix.save(image_path)
        rendered_pages.append(image_path)

    full_text = "\n".join(extracted_parts).strip()
    source_type = detect_source_type(doc, full_text)

    return AnalyzeResponse(
        job_id=job_id,
        filename=file.filename,
        stored_pdf_path=pdf_path,
        page_count=len(doc),
        source_type=source_type,
        extracted_text=full_text,
        extracted_text_preview=full_text[:1000],
        rendered_pages=rendered_pages,
    )