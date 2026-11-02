# RCA Why-Why Module: Developer Guide

> In this repo the export service lives here in `rca-service/` (the guide's
> `backend/` folder). The dialog is `frontend/src/pages/engineering/rca/`, and
> the browser reaches the service through the Node backend
> (`POST /api/v1/rca/pdf`, forwarded to `RCA_SERVICE_URL`). `deploy-test.sh`
> runs it as the `jk-rca-pdf` container on `jk-net`.

Digital entry for the JK Tyre **Root Cause Analysis (Why-Why)** form
(Doc No **UTQM.00.SQ-156**, Rev 01, Rev. Date 09.02.2026), with a PDF download
that reproduces the official Excel sheet.

```
User fills dialog ──► Submit ──────────► your backend (store the record)
                 └──► Download PDF ───► RCA export service ──► PDF of the official sheet
```

---

## 1. What's in this folder

| Path | What it is |
|---|---|
| `frontend/RCAEntryDialog.jsx` | The entry dialog. One React component, no dependencies besides React, styles built in. |
| `backend/app.py` | Export service API (FastAPI). |
| `backend/rca_fill.py` | Writes the record into the Excel template and converts it to PDF. Also usable as a CLI. |
| `backend/RCA_Master_Template.xlsx` | **Blank master form** made from the plant's original Excel. Sheets: `Single Cause`, `Multi Cause`. Do not edit by hand. |
| `backend/Dockerfile` | Runs the service with LibreOffice and the fonts it needs. |
| `backend/requirements.txt` | Python dependencies. |
| `backend/sample_record.json` | Example record for testing. |
| `backend/tools/build_master.py` | Only needed if the plant revises the form (see §8). |
| `samples/*.pdf` | Reference output. Use these to check your deployment produces the same result. |

---

## 2. Quick start (about 10 minutes)

### Step 1: Run the export service
```bash
cd backend
docker build -t rca-pdf .
docker run -d -p 8010:8010 --name rca-pdf rca-pdf
curl http://localhost:8010/api/rca/health      # → {"ok": true, ...}
```

Without Docker, install LibreOffice (`soffice` must be on PATH), then:
```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8010
```

### Step 2: Smoke test
```bash
curl -F "record=<sample_record.json" http://localhost:8010/api/rca/pdf -o test.pdf
```
Open `test.pdf` and compare it with `samples/Sample_RCA_7_whys_long_text.pdf`.

### Step 3: Add the dialog to the dashboard
Copy `frontend/RCAEntryDialog.jsx` into the app, then:

```jsx
import RCAEntryDialog from "./RCAEntryDialog";

const [open, setOpen] = useState(false);

<button onClick={() => setOpen(true)}>+ New RCA</button>

<RCAEntryDialog
  open={open}
  onClose={() => setOpen(false)}
  onSubmit={async (record) => { await saveRca(record); setOpen(false); }}   // your API
  onSaveDraft={async (record) => saveRcaDraft(record)}                     // optional
  pdfEndpoint="/api/rca/pdf"                                               // default
  machineOptions={["Banbury 1", "Banbury 4", "132 KV Switch Yard"]}        // optional
/>
```

### Step 4: Route the PDF endpoint
Pick one:
- **Reverse proxy (recommended):** route `/api/rca/*` to `http://<service-host>:8010`. The default `pdfEndpoint` then works.
- **Direct URL:** pass `pdfEndpoint="http://<service-host>:8010/api/rca/pdf"`, and start the service with `-e RCA_CORS_ORIGINS=https://<dashboard-host>`.

---

## 3. Dialog props

| Prop | Required | Description |
|---|---|---|
| `open` | yes | Show or hide the dialog. |
| `onClose` | yes | Called on Cancel, ×, Esc or a backdrop click. Asks the user to confirm if there are unsaved changes. |
| `onSubmit(record)` | yes | Called after validation passes. Can be async; the buttons are disabled while it runs. |
| `onSaveDraft(record)` | no | Saves without validation. If omitted, `onSubmit` is called with `status: "draft"`. |
| `initialValues` | no | A record to edit (same shape as the output). |
| `deptOptions`, `machineOptions` | no | Suggestion lists for Dept and Machine. Free text is still allowed. |
| `pdfEndpoint` | no | URL of the export service. Default `/api/rca/pdf`. |
| `onDownloadPdf(record)` | no | Override: return a `Blob` yourself instead of calling `pdfEndpoint`. |

**Theme:** change the CSS variables at the top of the `CSS` string in the file (`--rcad-accent`, `--rcad-border` and so on). All classes are prefixed `rcad-`, so they won't clash with dashboard styles.

---

## 4. The record (what `onSubmit` receives and what the PDF service takes)

```jsonc
{
  "form":   { "docNo": "UTQM.00.SQ-156", "rev": "01", "revDate": "09.02.2026" },
  "status": "submitted",                       // or "draft"
  "header": { "date": "2026-09-04", "shift": "C", "dept": "EE&I",
              "machineArea": "Banbury 4", "mpcp": "" },
  "physicalPhenomena": "…",
  "immediateCorrection": "…",
  "impacts": ["Productivity", "Cost"],         // Productivity|Quality|Cost|Delivery|Safety|Morale
  "cft": { "prod": "…", "mech": "…", "eei": "…", "tech": "", "qa": "",
           "othersFunction": "", "othersName": "" },
  "chains": [                                  // 1 = single cause, 2–3 = multi cause
    { "cause": "",                             // only used when there are 2–3 chains
      "whys": ["…", "…", "…"],                 // 3 to 10 entries, trailing empties removed
      "rootCause": "…", "correctiveAction": "…", "preventiveAction": "…",
      "completionDate": "2026-09-20" }
  ],
  "countermeasureModes": ["Kaizen"],           // Kaizen|QIP|QCC|OPL|Other
  "countermeasureOther": "",                   // text when "Other" is ticked
  "rootCauseStatus": "Eliminated",             // Eliminated|Repeated
  "documentsStandardized": { "document": "…", "refNo": "…" },
  "evidence": { "before": File|null, "after": File|null },
  "savedAt": "2026-10-30T08:00:00.000Z"
}
```

**Storing it:** the `evidence` photos are browser `File` objects. Upload them to your file store and keep the URLs; store everything else as JSON or in columns. Suggested table: one row per RCA, with `chains` as a JSON column (or a child table of chains with a child table of whys if you need to report on Why depth).

**Validation done in the dialog** (repeat it on your backend):
- Required: date, shift, dept, machine, physical phenomena, immediate correction.
- At least 1 impact ticked and at least 1 CFT name.
- Each chain: at least 3 Whys with no gaps, plus root cause, corrective action and completion date.
- Completion date must not be before the incident date.
- At least 1 countermeasure mode; "Other" needs its text.
- Eliminated or Repeated must be chosen.
- With 2+ chains, every chain needs a cause name.
- If a standardized document is named, its reference number is required.

---

## 5. Export service API

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/rca/pdf` | multipart: `record` (JSON string, required), `before` (image, optional), `after` (image, optional) | `application/pdf`, `Content-Disposition: attachment; filename="RCA_<machine>_<date>.pdf"` |
| `POST` | `/api/rca/xlsx` | same | The filled Excel (not used by the UI yet) |
| `GET` | `/api/rca/health` | none | `{ "ok": true, "template_exists": true }` |

Errors come back as `{"detail": "…"}`:
- 400: bad JSON
- 413: a photo is larger than 15 MB
- 500: conversion failed
- 504: timeout after 90 s

The dialog shows the `detail` text in red in its footer.

**Environment variables (all optional):**

| Variable | Use |
|---|---|
| `RCA_CORS_ORIGINS` | Comma-separated dashboard origins, when calling the service cross-origin. |
| `RCA_MASTER_TEMPLATE` | Path to a different master template. |
| `SOFFICE_BIN` | Path to `soffice` if it isn't on PATH. |

**Performance:** about 3–4 s per PDF; about 10 s when 3 run at once on one CPU. Each conversion uses its own LibreOffice profile, so parallel requests are safe. Scale with `--workers` or more containers.

---

## 6. How the PDF is built

1. Load `RCA_Master_Template.xlsx`.
2. Pick the sheet: **1 chain → `Single Cause`**, **2–3 chains → `Multi Cause`**. The other sheet is deleted.
3. If any chain has more than 5 Whys, insert extra 2-row Why blocks under Why5, copying Why5's formatting.
4. Write each value after its label in the cell (see the map below).
5. Place the photos, scaled to fit, in the Before/After boxes.
6. LibreOffice prints the sheet to PDF: A4 landscape, fitted to one page.

### Field → cell map (`Single Cause`)

| Record field | Cell | Printed as |
|---|---|---|
| `header.date` + `shift` | B3 | `Date & Shift: 04.09.2026 'C'` |
| `header.dept` / `machineArea` / `mpcp` | E3 / H3 / K3 | after `Dept:` / `Machine No/Area:` / `MP/CP:` |
| `physicalPhenomena` | B4 | after `Physical Phenomena (Explain):` |
| `immediateCorrection` | B8 | after `Immediate Correction :` |
| `impacts[]` | L5–L10 | ✓ in the matching row |
| `cft.prod/mech/eei/tech/qa` | N5–N9 | name |
| `cft.othersName` + `othersFunction` | N10 | `Name (Function)` |
| `whys[0..4]` | B11, B13, B15, B17, B19 | after `Why1 (Start with phenomenon) :` … `Why5:` |
| `whys[5..]` | inserted rows | `Why6:` … |
| `rootCause` | B22 | |
| `correctiveAction` + `preventiveAction` | J22 | `Corrective Action- … / Preventive Action- …` (only CA if PA is empty) |
| `completionDate` | J25 | `Date of Completion: 20.09.2026` |
| Kaizen / QIP / QCC | C26 / E26 / G26 | ✓ |
| OPL / Other | I26 | text, e.g. `OPL, Poka-yoke` |
| `rootCauseStatus` | B27 | label normal, value **bold** |
| `documentsStandardized` | K27 | `Document (Ref. No. …)` |
| `evidence.before` / `after` | C29:I46 / K29:N46 | photo, centred |

Rows from Root Cause downward move down by 2 for each extra Why.

**`Multi Cause`:** chains 1, 2 and 3 go in column groups B:E, F:J and K:N.
- Cause-n: row 11
- Whys: rows 12–21
- Root Cause-n: row 22
- Corrective action-n: row 24 (preventive action on the next line)
- Date of Completion: row 26
- Modes: row 29
- Status: B30
- Documents: K30
- Photos: B32:H48 / J32:N48

---

## 7. Test checklist before go-live

- [ ] `GET /api/rca/health` returns `ok: true` from the dashboard's network.
- [ ] Download PDF on an empty form shows red errors and does **not** download.
- [ ] Single-cause case: PDF matches `samples/Sample_RCA_single_cause_DISC_INS.pdf` (logo, borders, layout).
- [ ] 3-cause case matches `samples/Sample_RCA_three_causes_CT_failure.pdf`.
- [ ] 7 Whys plus long text matches `samples/Sample_RCA_7_whys_long_text.pdf` (extra Why rows, nothing cut off, one page).
- [ ] Before and After photos (portrait and landscape phone photos) show up the right way round.
- [ ] Ticks appear as ✓ in the impact and countermeasure boxes.
- [ ] Two users downloading at the same time both get correct PDFs.

---

## 8. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Text looks wider or narrower than the samples | Fonts missing. Install `fonts-liberation` (Arial twin), `fonts-crosextra-carlito` (Calibri twin) and `fonts-dejavu-core` (✓ glyph). The Dockerfile already does this. |
| Tick shows as a box or as "ü" | No font with the ✓ glyph. Install `fonts-dejavu-core`. |
| 500 "LibreOffice did not produce a PDF" | `soffice` isn't installed or isn't on PATH. Set `SOFFICE_BIN`. |
| 504 timeout | Server overloaded or the first LibreOffice start is slow. Add workers or CPU. |
| CORS error in the browser console | Set `RCA_CORS_ORIGINS`, or use the reverse-proxy option. |
| Button shows "PDF download failed: 404" | `pdfEndpoint` is wrong, or `/api/rca/*` isn't routed to the service. |

**Form revision (new Rev of UTQM.00.SQ-156):** get the updated Excel from the plant and run
`python tools/build_master.py <new_original.xlsx> RCA_Master_Template.xlsx`.
If any cell moved, update the cell numbers in `rca_fill.py` (`fill_single`, `fill_multi`), and update `RCA_FORM_META` in the JSX.

---

## 9. Known differences from the hand-filled Excel

- Ticks print as **✓** instead of hand-drawn ovals or the Wingdings symbol. The Wingdings symbol doesn't render on servers without that font.
- If text is longer than its box, the box's rows grow (nothing is cut off). The sheet still fits on one page.
- In the 3-cause sheet, the print area is limited to the form itself. The original printed at 37% with a large blank margin.
- Dates print as `dd.mm.yyyy`.
