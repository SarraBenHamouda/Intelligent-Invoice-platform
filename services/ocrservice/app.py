import os
from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image, ImageOps
import pytesseract

SHARED_DIR = os.environ.get("SHARED_DIR", "/shared")

app = FastAPI(title="ocrservice")


class OCRRequest(BaseModel):
    image_paths: List[str]
    lang: str = "fra+eng"
    psm: int = 6


class OCRResponse(BaseModel):
    pages: int
    per_page: List[str]
    full_text: str


def preprocess(img: Image.Image) -> Image.Image:
    img = img.convert("L")

    img = ImageOps.autocontrast(img)

    img = img.point(lambda x: 0 if x < 140 else 255, "1")

    return img

for i, line in enumerate(lines):

    price = float(line.get("unit_price", 0) or 0)

    if price > 1000:
        issues.append({
            "type": "suspicious",
            "field": f"lines[{i}].unit_price",
            "message": "unit_price too large (possible OCR error)"
        })
        

@app.get("/health")
def health():
    return {"status": "ok", "service": "ocrservice"}


@app.post("/ocr", response_model=OCRResponse)
def run_ocr(req: OCRRequest):
    per_page = []

    for path in req.image_paths:
        if not path.startswith(SHARED_DIR):
            raise HTTPException(status_code=400, detail=f"path outside shared dir: {path}")
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail=f"file not found: {path}")

        img = Image.open(path)
        img = preprocess(img)

        config = f"--psm {req.psm}"
        text = pytesseract.image_to_string(img, lang=req.lang, config=config)
        per_page.append(text)

    full_text = "\n".join(per_page).strip()

    return OCRResponse(
        pages=len(req.image_paths),
        per_page=per_page,
        full_text=full_text
    )