"""
One-time script: builds RCA_Master_Template.xlsx from the original April workbook
(why_why_17042026_3.xlsx). Keeps two sheets exactly as designed and clears only
the case data:

  "Single Cause"  <- 'Why Why Analysis - RCA DISC INS'  (standard 5-Why layout, logo, Before/After area)
  "Multi Cause"   <- 'Why Why Analysis - CT failure'    (3 parallel cause chains)

Everything else (column widths, row heights, merges, borders, fonts, fills,
alignment, page setup, logo) is carried over untouched by openpyxl.
Drawn shapes (tick ovals, photo highlight circles, empty leftover text boxes)
and the case photos are not carried over - they were case data.

Usage:  python build_master.py <original.xlsx> <out_master.xlsx>
"""
import sys
import openpyxl
from openpyxl.cell.rich_text import CellRichText, TextBlock
from openpyxl.cell.text import InlineFont

SRC_SINGLE = "Why Why Analysis - RCA DISC INS"
SRC_MULTI = "Why Why Analysis - CT failure"

# Cell -> blank-template text (the fixed label that precedes the user value).
# None = cell is a pure entry cell and is emptied.
SINGLE_LABELS = {
    "B3": "Date & Shift:", "E3": "Dept:", "H3": "Machine No/Area:", "K3": "MP/CP:",
    "B4": "Physical Phenomena (Explain):", "B8": "Immediate Correction :",
    "N5": None, "N6": None, "N7": None, "N8": None, "N9": None, "N10": None,
    "L5": None, "L6": None, "L7": None, "L8": None, "L9": None, "L10": None,
    "B11": "Why1 (Start with phenomenon) :", "B13": "Why2:", "B15": "Why3:", "B17": "Why4:", "B19": "Why5:",
    "B22": None, "J22": None, "J25": "Date of Completion:",
    "C26": None, "E26": None, "G26": None, "I26": None,
    "B27": "Root Cause Eliminated/Repeated:", "K27": None,
}

MULTI_LABELS = {
    "B3": "Date & Shift:", "E3": "Dept:", "H3": "Machine No/Area:", "K3": "MP/CP:",
    "B4": "Physical Phenomena (Explain):", "B8": "Immediate Correction :-",
    "N5": None, "N6": None, "N7": None, "N8": None, "N9": None, "N10": None,
    "L5": None, "L6": None, "L7": None, "L8": None, "L9": None, "L10": None,
    "B11": "Cause-1 :", "F11": "Cause-2 :", "K11": "Cause -3 :",
    "B12": "Why-1:", "B14": "Why2:", "B16": "Why3:", "B18": "Why4:", "B20": "Why5:",
    "F12": "Why-1:", "F14": "Why-2:", "F16": "Why-3:", "F18": "Why-4:", "F20": "Why-5:",
    "K12": "Why-1:", "K14": "Why-2:", "K16": "Why-3:", "K18": "Why-4:", "K20": "Why-5:",
    "B22": "Root Cause-1:", "F22": "Root Cause-2:", "K22": "Root Cause-3:",
    "B24": "Corrective action -1 :", "F24": "Corrective action -2 :", "K24": "Corrective action -3:",
    "B26": "Date of Completion:", "F26": "Date of Completion:", "K26": "Date of Completion:",
    "C29": None, "E29": None, "G29": None, "I29": None,
    "B30": "Root Cause Eliminated/Repeated:", "K30": None,
}


def clear_sheet(ws, labels):
    for coord, label in labels.items():
        ws[coord].value = label
    # keep only the logo (anchored in row 2 / index 1); drop case photos
    ws._images = [im for im in ws._images if im.anchor._from.row <= 1]


def main(src, out):
    wb = openpyxl.load_workbook(src, rich_text=True)
    for name in list(wb.sheetnames):
        if name not in (SRC_SINGLE, SRC_MULTI):
            del wb[name]
    # ~8,000 legacy (#REF!) workbook names inherited from an old file - unused by the form
    for n in list(wb.defined_names.keys()):
        del wb.defined_names[n]

    s = wb[SRC_SINGLE]
    clear_sheet(s, SINGLE_LABELS)
    # original shows the label in regular weight (value was bold) - keep that look
    s["B27"].value = CellRichText([TextBlock(InlineFont(rFont="Arial", sz=14, b=False), "Root Cause Eliminated/Repeated:")])
    s.title = "Single Cause"

    m = wb[SRC_MULTI]
    clear_sheet(m, MULTI_LABELS)
    # original print area A1:AD66 printed the form at 37% with a large empty margin;
    # limit printing to the form itself (A1:O50). Sheet formatting is unchanged.
    m.print_area = "A1:O50"
    m.title = "Multi Cause"

    wb.active = 0
    wb.save(out)
    print("saved", out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
