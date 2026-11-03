"""
rca_fill.py - fills the JK Tyre Root Cause Analysis master template
(UTQM.00.SQ-156, Rev 01) with a record from RCAEntryDialog and exports it to PDF.

The master workbook (RCA_Master_Template.xlsx) is a blank copy of the original
Excel form; this module only writes values into its cells, so fonts, borders,
merged cells, column widths, row heights, logo and page setup come from the
template itself. The PDF is produced by LibreOffice (headless), i.e. the Excel
sheet is printed to PDF exactly as Excel would lay it out.

Layout selection
  1 cause chain      -> sheet "Single Cause"  (standard 5-Why form)
  2-3 cause chains   -> sheet "Multi Cause"   (3-column CT-failure form)
  more than 5 Whys   -> extra 2-row Why blocks are inserted below Why5, styled
                        like Why5 (the form says "Add more Why if required")

Only deviations from the template, and only when needed so nothing is cut off:
  - text cells that receive a value get "wrap text" switched on
  - if a value is longer than its box, that box's rows are made taller

CLI
  python rca_fill.py record.json out.pdf [--before before.jpg] [--after after.jpg] [--xlsx out.xlsx]
"""
from __future__ import annotations

import argparse
import io
import json
import math
import os
import shutil
import subprocess
import tempfile
from copy import copy
from datetime import date
from pathlib import Path

import openpyxl
from openpyxl.cell.rich_text import CellRichText, TextBlock
from openpyxl.cell.text import InlineFont
from openpyxl.drawing.image import Image as XLImage
from openpyxl.drawing.spreadsheet_drawing import AnchorMarker, OneCellAnchor
from openpyxl.drawing.xdr import XDRPositiveSize2D
from openpyxl.utils import column_index_from_string, get_column_letter

try:
    from PIL import Image as PILImage, ImageOps
except ImportError:  # photos are optional
    PILImage = None

HERE = Path(__file__).resolve().parent
MASTER = Path(os.environ.get("RCA_MASTER_TEMPLATE", HERE / "RCA_Master_Template.xlsx"))
SOFFICE = os.environ.get("SOFFICE_BIN", "soffice")

TICK = "\u2713"  # ✓  (plain Unicode tick in the cell's own font - renders on any server, unlike Wingdings "ü")
IMPACT_ROWS = {"Productivity": 5, "Quality": 6, "Cost": 7, "Delivery": 8, "Safety": 9, "Morale": 10}
CFT_ROWS = {"prod": 5, "mech": 6, "eei": 7, "tech": 8, "qa": 9}

EMU_PER_PX = 9525
PX_PER_PT = 96 / 72


# --------------------------------------------------------------------------- #
# small helpers                                                               #
# --------------------------------------------------------------------------- #

def _s(v) -> str:
    return v.strip() if isinstance(v, str) else ""


def fmt_date(iso: str) -> str:
    """'2026-09-04' -> '04.09.2026' (format used on the plant's sheets)."""
    iso = _s(iso)
    if not iso:
        return ""
    try:
        return date.fromisoformat(iso[:10]).strftime("%d.%m.%Y")
    except ValueError:
        return iso


def col_px(ws, col: int) -> float:
    letter = get_column_letter(col)
    dim = ws.column_dimensions.get(letter)
    w = dim.width if dim is not None and dim.width else (ws.sheet_format.defaultColWidth or 8.43)
    return w * 7 + 5


def row_pt(ws, row: int) -> float:
    dim = ws.row_dimensions.get(row)
    h = dim.height if dim is not None and dim.height else None
    return h or ws.sheet_format.defaultRowHeight or 15


def merged_range_of(ws, coord: str):
    cell = ws[coord]
    for rng in ws.merged_cells.ranges:
        if rng.min_row == cell.row and rng.min_col == cell.column:
            return rng.min_row, rng.min_col, rng.max_row, rng.max_col
    return cell.row, cell.column, cell.row, cell.column


def label_of(ws, coord: str) -> str:
    v = ws[coord].value
    if v is None:
        return ""
    return str(v)


def ensure_fits(ws, coord: str, text: str, font_pt: float | None = None):
    """Grow the rows of the merged box at `coord` if `text` would not fit."""
    if not text:
        return
    r1, c1, r2, c2 = merged_range_of(ws, coord)
    size = font_pt or (ws[coord].font.sz or 11)
    width_px = sum(col_px(ws, c) for c in range(c1, c2 + 1)) - 8
    char_px = size * PX_PER_PT * 0.55  # average Arial glyph width (slightly conservative)
    per_line = max(1, int(width_px // char_px))
    lines = sum(max(1, math.ceil(len(p) / per_line)) for p in text.split("\n"))
    need_pt = lines * size * 1.22 + 6
    have_pt = sum(row_pt(ws, r) for r in range(r1, r2 + 1))
    if need_pt > have_pt + 0.5:
        extra = (need_pt - have_pt) / (r2 - r1 + 1)
        for r in range(r1, r2 + 1):
            ws.row_dimensions[r].height = round(row_pt(ws, r) + extra, 2)


def put(ws, coord: str, value: str, sep: str = " ", wrap: bool = True):
    """Write `label + sep + value` (label = the template text already in the cell)."""
    value = _s(value)
    if not value:
        return
    label = label_of(ws, coord)
    text = f"{label}{sep}{value}" if label else value
    cell = ws[coord]
    cell.value = text
    if wrap:
        al = copy(cell.alignment)
        al.wrap_text = True
        cell.alignment = al
    ensure_fits(ws, coord, text)


def put_bold_value(ws, coord: str, value: str):
    """Label in regular weight + value in bold (as on the original 'Eliminated' cell)."""
    value = _s(value)
    if not value:
        return
    f = ws[coord].font
    label = label_of(ws, coord)
    ws[coord].value = CellRichText([
        TextBlock(InlineFont(rFont=f.name, sz=f.sz, b=False), label + " "),
        TextBlock(InlineFont(rFont=f.name, sz=f.sz, b=True), value),
    ])


def tick(ws, coord: str):
    cell = ws[coord]
    al = copy(cell.alignment)
    al.horizontal = "center"
    al.vertical = "center"
    cell.alignment = al
    cell.value = TICK


# --------------------------------------------------------------------------- #
# inserting extra Why blocks (keeps merges, borders and row heights)          #
# --------------------------------------------------------------------------- #

def insert_why_blocks(ws, at_row: int, n_blocks: int, merge_spans, labels_fn):
    """Insert n 2-row Why blocks at `at_row`, cloned from the 2 rows above it."""
    if n_blocks <= 0:
        return
    n = 2 * n_blocks
    max_row = ws.max_row

    # 1. detach merges that sit below the insertion point, shift them later
    below = [r for r in list(ws.merged_cells.ranges) if r.min_row >= at_row]
    for r in below:
        ws.merged_cells.ranges.discard(r)

    # 2. remember row heights below the insertion point
    heights = {r: (ws.row_dimensions[r].height if r in ws.row_dimensions else None) for r in range(at_row, max_row + 1)}

    # 3. move cells (values + styles, merged placeholders included)
    ws.insert_rows(at_row, n)

    # 4. re-attach shifted merges and heights
    for r in below:
        r.shift(0, n)
        ws.merged_cells.ranges.add(r)
    for r in range(at_row, max_row + n + 1):
        ws.row_dimensions[r].height = None
    for r, h in heights.items():
        ws.row_dimensions[r + n].height = h

    # 5. build the new blocks from the template block (the 2 rows above at_row)
    t1, t2 = at_row - 2, at_row - 1
    max_col = ws.max_column
    for b in range(n_blocks):
        r1 = at_row + 2 * b
        for c1, c2 in merge_spans:
            ws.merge_cells(start_row=r1, start_column=c1, end_row=r1 + 1, end_column=c2)
        for c in range(1, max_col + 1):
            for src, dst in ((t1, r1), (t2, r1 + 1)):
                s, d = ws.cell(src, c), ws.cell(dst, c)
                d._style = copy(s._style)
        ws.row_dimensions[r1].height = ws.row_dimensions[t1].height
        ws.row_dimensions[r1 + 1].height = ws.row_dimensions[t2].height
        for coord_col, text in labels_fn(b):
            ws[f"{coord_col}{r1}"].value = text

    # 6. print area follows the form
    if ws.print_area:
        pa = ws.print_area if isinstance(ws.print_area, str) else ws.print_area[0]
        rng = pa.split("!")[-1].replace("$", "")
        a, z = rng.split(":")
        zc = "".join(ch for ch in z if ch.isalpha())
        zr = int("".join(ch for ch in z if ch.isdigit()))
        ws.print_area = f"{a}:{zc}{zr + n}"


# --------------------------------------------------------------------------- #
# photos                                                                      #
# --------------------------------------------------------------------------- #

def _px_to_marker(ws, col0: int, row0: int, dx_px: float, dy_px: float) -> AnchorMarker:
    """Turn a pixel offset from (col0,row0) [1-based] into a cell anchor."""
    c, x = col0, dx_px
    while x >= col_px(ws, c):
        x -= col_px(ws, c)
        c += 1
    r, y = row0, dy_px
    while y >= row_pt(ws, r) * PX_PER_PT:
        y -= row_pt(ws, r) * PX_PER_PT
        r += 1
    return AnchorMarker(col=c - 1, colOff=int(x * EMU_PER_PX), row=r - 1, rowOff=int(y * EMU_PER_PX))


def place_photo(ws, data: bytes | None, box: tuple[str, int, str, int], pad_px: int = 6):
    """Fit `data` (image bytes) inside the cell box (col1,row1,col2,row2), centred."""
    if not data or PILImage is None:
        return
    c1, r1 = column_index_from_string(box[0]), box[1]
    c2, r2 = column_index_from_string(box[2]), box[3]
    box_w = sum(col_px(ws, c) for c in range(c1, c2 + 1)) - 2 * pad_px
    box_h = sum(row_pt(ws, r) for r in range(r1, r2 + 1)) * PX_PER_PT - 2 * pad_px

    img = ImageOps.exif_transpose(PILImage.open(io.BytesIO(data)))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.thumbnail((1600, 1600))  # keep the workbook/PDF light
    scale = min(box_w / img.width, box_h / img.height)
    w, h = img.width * scale, img.height * scale

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    xl = XLImage(buf)
    xl.width, xl.height = w, h
    off_x = pad_px + (box_w - w) / 2
    off_y = pad_px + (box_h - h) / 2
    marker = _px_to_marker(ws, c1, r1, off_x, off_y)
    xl.anchor = OneCellAnchor(_from=marker, ext=XDRPositiveSize2D(int(w * EMU_PER_PX), int(h * EMU_PER_PX)))
    ws.add_image(xl)


# --------------------------------------------------------------------------- #
# field mapping                                                               #
# --------------------------------------------------------------------------- #

def _common_header(ws, rec):
    h = rec.get("header", {}) or {}
    d = fmt_date(h.get("date"))
    shift = _s(h.get("shift"))
    put(ws, "B3", f"{d} '{shift}'" if d and shift else d or (f"'{shift}'" if shift else ""))
    put(ws, "E3", h.get("dept"))
    put(ws, "H3", h.get("machineArea"))
    put(ws, "K3", h.get("mpcp"))
    put(ws, "B4", rec.get("physicalPhenomena"))
    put(ws, "B8", rec.get("immediateCorrection"))

    for imp in rec.get("impacts", []) or []:
        if imp in IMPACT_ROWS:
            tick(ws, f"L{IMPACT_ROWS[imp]}")

    cft = rec.get("cft", {}) or {}
    for key, row in CFT_ROWS.items():
        put(ws, f"N{row}", cft.get(key), wrap=False)
    other_name, other_fn = _s(cft.get("othersName")), _s(cft.get("othersFunction"))
    if other_name:
        put(ws, "N10", f"{other_name} ({other_fn})" if other_fn else other_name)


def _closure(ws, rec, mode_row: int, status_coord: str, docs_coord: str):
    modes = rec.get("countermeasureModes", []) or []
    for mode, col in (("Kaizen", "C"), ("QIP", "E"), ("QCC", "G")):
        if mode in modes:
            tick(ws, f"{col}{mode_row}")
    # 'Other' tick cell: the team writes the mode name there (e.g. "OPL" on the HTDG sheet)
    other = [m for m in ("OPL",) if m in modes]
    if "Other" in modes:
        other.append(_s(rec.get("countermeasureOther")) or "Other")
    if other:
        put(ws, f"I{mode_row}", ", ".join(other))
        al = copy(ws[f"I{mode_row}"].alignment)
        al.horizontal = "center"
        ws[f"I{mode_row}"].alignment = al

    put_bold_value(ws, status_coord, rec.get("rootCauseStatus"))

    docs = rec.get("documentsStandardized", {}) or {}
    doc, ref = _s(docs.get("document")), _s(docs.get("refNo"))
    put(ws, docs_coord, f"{doc} (Ref. No. {ref})" if doc and ref else doc or ref)


def fill_single(ws, rec, before: bytes | None, after: bytes | None):
    chain = (rec.get("chains") or [{}])[0]
    whys = [w for w in (chain.get("whys") or [])]
    while whys and not _s(whys[-1]):
        whys.pop()
    extra = max(0, len(whys) - 5)
    insert_why_blocks(ws, 21, extra, merge_spans=[(2, 14)],
                      labels_fn=lambda b: [("B", f"Why{6 + b}:")])
    d = 2 * extra

    _common_header(ws, rec)
    for i, w in enumerate(whys):
        put(ws, f"B{11 + 2 * i}", w)

    put(ws, f"B{22 + d}", chain.get("rootCause"))
    ca, pa = _s(chain.get("correctiveAction")), _s(chain.get("preventiveAction"))
    put(ws, f"J{22 + d}", f"Corrective Action- {ca}\nPreventive Action- {pa}" if pa else ca)
    put(ws, f"J{25 + d}", fmt_date(chain.get("completionDate")))
    _closure(ws, rec, mode_row=26 + d, status_coord=f"B{27 + d}", docs_coord=f"K{27 + d}")

    place_photo(ws, before, ("C", 29 + d, "I", 46 + d))
    place_photo(ws, after, ("K", 29 + d, "N", 46 + d))


def fill_multi(ws, rec, before: bytes | None, after: bytes | None):
    chains = (rec.get("chains") or [])[:3]
    cols = ["B", "F", "K"]
    trimmed = []
    for c in chains:
        w = list(c.get("whys") or [])
        while w and not _s(w[-1]):
            w.pop()
        trimmed.append(w)
    extra = max(0, max((len(w) for w in trimmed), default=0) - 5)
    insert_why_blocks(ws, 22, extra, merge_spans=[(2, 5), (6, 10), (11, 14)],
                      labels_fn=lambda b: [("B", f"Why{6 + b}:"), ("F", f"Why-{6 + b}:"), ("K", f"Why-{6 + b}:")])
    d = 2 * extra

    _common_header(ws, rec)
    for ci, (c, whys) in enumerate(zip(chains, trimmed)):
        col = cols[ci]
        put(ws, f"{col}11", c.get("cause"))
        for i, w in enumerate(whys):
            put(ws, f"{col}{12 + 2 * i}", w)
        put(ws, f"{col}{22 + d}", c.get("rootCause"))
        ca, pa = _s(c.get("correctiveAction")), _s(c.get("preventiveAction"))
        put(ws, f"{col}{24 + d}", f"{ca}\nPreventive action: {pa}" if pa else ca, sep="\n")
        put(ws, f"{col}{26 + d}", fmt_date(c.get("completionDate")))
    _closure(ws, rec, mode_row=29 + d, status_coord=f"B{30 + d}", docs_coord=f"K{30 + d}")

    place_photo(ws, before, ("B", 32 + d, "H", 48 + d))
    place_photo(ws, after, ("J", 32 + d, "N", 48 + d))


# --------------------------------------------------------------------------- #
# public API                                                                  #
# --------------------------------------------------------------------------- #

def build_workbook(rec: dict, before: bytes | None = None, after: bytes | None = None) -> bytes:
    """Return the filled RCA workbook (.xlsx bytes) - one sheet, ready to print."""
    wb = openpyxl.load_workbook(MASTER, rich_text=True)
    multi = len([c for c in (rec.get("chains") or []) if c]) > 1
    keep = "Multi Cause" if multi else "Single Cause"
    for name in list(wb.sheetnames):
        if name != keep:
            del wb[name]
    ws = wb[keep]
    (fill_multi if multi else fill_single)(ws, rec, before, after)
    ws.title = "RCA"
    wb.active = 0
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def xlsx_to_pdf(xlsx_bytes: bytes, timeout: int = 90) -> bytes:
    """Print the workbook to PDF with LibreOffice (isolated profile per call -> safe in parallel)."""
    work = Path(tempfile.mkdtemp(prefix="rca_"))
    profile = Path(tempfile.mkdtemp(prefix="rca_lo_"))
    try:
        src = work / "rca.xlsx"
        src.write_bytes(xlsx_bytes)
        cmd = [SOFFICE, f"-env:UserInstallation=file://{profile}", "--headless", "--norestore",
               "--convert-to", "pdf", "--outdir", str(work), str(src)]
        subprocess.run(cmd, check=True, timeout=timeout, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        pdf = work / "rca.pdf"
        if not pdf.exists():
            raise RuntimeError("LibreOffice did not produce a PDF")
        return pdf.read_bytes()
    finally:
        shutil.rmtree(work, ignore_errors=True)
        shutil.rmtree(profile, ignore_errors=True)


def build_pdf(rec: dict, before: bytes | None = None, after: bytes | None = None) -> bytes:
    return xlsx_to_pdf(build_workbook(rec, before, after))


def suggested_filename(rec: dict, ext: str = "pdf") -> str:
    h = rec.get("header", {}) or {}
    parts = ["RCA", _s(h.get("machineArea")), _s(h.get("date"))]
    stem = "_".join(p for p in parts if p) or "RCA"
    stem = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in stem)
    return f"{stem}.{ext}"


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("record")
    ap.add_argument("out_pdf")
    ap.add_argument("--before")
    ap.add_argument("--after")
    ap.add_argument("--xlsx", help="also save the filled Excel")
    a = ap.parse_args()
    rec = json.loads(Path(a.record).read_text(encoding="utf-8"))
    b = Path(a.before).read_bytes() if a.before else None
    f = Path(a.after).read_bytes() if a.after else None
    xb = build_workbook(rec, b, f)
    if a.xlsx:
        Path(a.xlsx).write_bytes(xb)
    Path(a.out_pdf).write_bytes(xlsx_to_pdf(xb))
    print("wrote", a.out_pdf)
