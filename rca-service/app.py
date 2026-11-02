"""
RCA export service - turns an RCAEntryDialog record into the official
Root Cause Analysis sheet (UTQM.00.SQ-156) as PDF (or filled Excel).

  POST /api/rca/pdf    multipart/form-data: record=<JSON>, before=<image?>, after=<image?>  -> application/pdf
  POST /api/rca/xlsx   same input                                                           -> filled .xlsx
  GET  /api/rca/health

Run:  uvicorn app:app --host 0.0.0.0 --port 8010
Env:  RCA_CORS_ORIGINS="http://localhost:5173,https://ofod.example.com"   (optional)
      RCA_MASTER_TEMPLATE=/path/RCA_Master_Template.xlsx                    (optional)
      SOFFICE_BIN=/usr/bin/soffice                                          (optional)
"""
import json
import os
import subprocess
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

import rca_fill

app = FastAPI(title="RCA export service")

origins = [o.strip() for o in os.environ.get("RCA_CORS_ORIGINS", "").split(",") if o.strip()]
if origins:
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["POST", "GET"],
                       allow_headers=["*"], expose_headers=["Content-Disposition"])

MAX_PHOTO_BYTES = 15 * 1024 * 1024


def _read(upload: Optional[UploadFile]) -> Optional[bytes]:
    if upload is None:
        return None
    data = upload.file.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, f"{upload.filename}: photo larger than 15 MB")
    return data or None


def _parse(record: str) -> dict:
    try:
        rec = json.loads(record)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"record is not valid JSON: {e}")
    if not isinstance(rec, dict):
        raise HTTPException(400, "record must be a JSON object")
    return rec


def _attachment(body: bytes, media: str, filename: str) -> Response:
    return Response(body, media_type=media, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# plain `def` -> FastAPI runs these in its thread pool, so LibreOffice calls don't block the event loop
@app.post("/api/rca/pdf")
def rca_pdf(record: str = Form(...), before: Optional[UploadFile] = File(None), after: Optional[UploadFile] = File(None)):
    rec = _parse(record)
    try:
        pdf = rca_fill.build_pdf(rec, _read(before), _read(after))
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "PDF conversion timed out")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"PDF export failed: {e}")
    return _attachment(pdf, "application/pdf", rca_fill.suggested_filename(rec, "pdf"))


@app.post("/api/rca/xlsx")
def rca_xlsx(record: str = Form(...), before: Optional[UploadFile] = File(None), after: Optional[UploadFile] = File(None)):
    rec = _parse(record)
    xb = rca_fill.build_workbook(rec, _read(before), _read(after))
    return _attachment(xb, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                       rca_fill.suggested_filename(rec, "xlsx"))


@app.get("/api/rca/health")
def health():
    return {"ok": True, "template": str(rca_fill.MASTER), "template_exists": rca_fill.MASTER.exists()}
