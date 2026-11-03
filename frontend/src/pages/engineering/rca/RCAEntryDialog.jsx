/**
 * RCAEntryDialog.jsx
 * ---------------------------------------------------------------------------
 * Single-dialog data-entry form for the JK Tyre "Root Cause Analysis"
 * (Why-Why) format — Doc No UTQM.00.SQ-156, Rev 01, Rev. Date 09.02.2026.
 *
 * Every field maps 1:1 to the Excel template sections:
 *   Header            -> Date & Shift, Dept, Machine No/Area, MP/CP
 *   Problem           -> Physical Phenomena (Explain), Immediate Correction
 *   Impacts           -> Productivity / Quality / Cost / Delivery / Safety / Morale
 *   CFT               -> Prod. / Mech. / EEI. / Tech. / QA / Others (Specify)
 *   Why-Why           -> Why1 (start with phenomenon) … Why5 (+ add more Why)
 *                        Up to 3 parallel cause chains (the "CT failure" variant)
 *   Root cause / CA   -> Root Cause, Corrective Action, Date of Completion
 *   Countermeasure    -> Kaizen / QIP / QCC / OPL / Other (tick appropriate)
 *   Closure           -> Root Cause Eliminated/Repeated, Documents Standardized
 *   Evidence          -> Before / After photos
 *
 * No external dependencies (React only). Styles are scoped under `.rcad-`
 * and themable through CSS variables on `.rcad-overlay` (see CSS below).
 *
 * USAGE
 *   import RCAEntryDialog from "./RCAEntryDialog";
 *
 *   const [open, setOpen] = useState(false);
 *   <RCAEntryDialog
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     onSubmit={async (record) => { await api.post("/rca", toFormData(record)); setOpen(false); }}
 *     onSaveDraft={(record) => api.post("/rca/draft", record)}       // optional
 *     initialValues={existingRecord}                                   // optional (edit mode)
 *     deptOptions={["EE&I", "Mechanical", "Production", "Quality", "Technical"]}  // optional
 *     machineOptions={["Banbury 4", "132 KV Switch Yard", "HTDG"]}     // optional
 *     pdfEndpoint="/api/rca/pdf"                                       // optional (default shown)
 *   />
 *
 * DOWNLOAD PDF
 *   The "Download PDF" button validates the form, then POSTs multipart/form-data
 *   { record: <JSON of the record below, photos replaced by file names>, before: File?, after: File? }
 *   to `pdfEndpoint` (the RCA export service, app.py) and saves the returned PDF.
 *   The PDF is the original Excel RCA sheet (UTQM.00.SQ-156) filled with these values.
 *   To route it differently, pass `onDownloadPdf={async (record) => Blob}` instead.
 *
 * OUTPUT RECORD (passed to onSubmit / onSaveDraft)
 *   {
 *     form:   { docNo, rev, revDate },
 *     status: "submitted" | "draft",
 *     header: { date: "YYYY-MM-DD", shift: "A"|"B"|"C", dept, machineArea, mpcp },
 *     physicalPhenomena, immediateCorrection,
 *     impacts: ["Productivity", ...],
 *     cft: { prod, mech, eei, tech, qa, othersFunction, othersName },
 *     chains: [{ cause, whys: [string], rootCause, correctiveAction,
 *                preventiveAction, completionDate: "YYYY-MM-DD" }],
 *     countermeasureModes: ["Kaizen", ...], countermeasureOther,
 *     rootCauseStatus: "Eliminated" | "Repeated" | "",
 *     documentsStandardized: { document, refNo },
 *     evidence: { before: File|null, after: File|null },   // raw File objects — upload them yourself
 *     savedAt: ISO timestamp
 *   }
 *   Empty trailing Why rows are stripped from `whys` before the record is emitted.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toPdfFormData } from "./rcaPdfForm.js";

/* ------------------------------------------------------------------------ */
/* Fixed template constants (do not change without a form revision)          */
/* ------------------------------------------------------------------------ */

const RCA_FORM_META = {
  title: "Root Cause Analysis",
  docNo: "UTQM.00.SQ-156",
  rev: "01",
  revDate: "09.02.2026",
};

const SHIFTS = ["A", "B", "C"];
const IMPACTS = [
  "Productivity",
  "Quality",
  "Cost",
  "Delivery",
  "Safety",
  "Morale",
];
const CFT_FUNCTIONS = [
  { key: "prod", label: "Prod." },
  { key: "mech", label: "Mech." },
  { key: "eei", label: "EEI." },
  { key: "tech", label: "Tech." },
  { key: "qa", label: "QA" },
];
const COUNTERMEASURE_MODES = ["Kaizen", "QIP", "QCC", "OPL", "Other"];
const ROOT_CAUSE_STATUS = ["Eliminated", "Repeated"];

const DEFAULT_WHY_SLOTS = 5; // template has Why1–Why5
const MIN_FILLED_WHYS = 3; // minimum depth for a valid why-why
const MAX_WHYS = 10;
const MAX_CHAINS = 3; // template "CT failure" variant has 3 cause columns

/* ------------------------------------------------------------------------ */
/* State helpers                                                            */
/* ------------------------------------------------------------------------ */

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const newChain = () => ({
  cause: "",
  whys: Array(DEFAULT_WHY_SLOTS).fill(""),
  rootCause: "",
  correctiveAction: "",
  preventiveAction: "",
  completionDate: "",
});

const blankRecord = () => ({
  header: { date: today(), shift: "", dept: "", machineArea: "", mpcp: "" },
  physicalPhenomena: "",
  immediateCorrection: "",
  impacts: [],
  cft: {
    prod: "",
    mech: "",
    eei: "",
    tech: "",
    qa: "",
    othersFunction: "",
    othersName: "",
  },
  chains: [newChain()],
  countermeasureModes: [],
  countermeasureOther: "",
  rootCauseStatus: "",
  documentsStandardized: { document: "", refNo: "" },
  evidence: { before: null, after: null },
});

const mergeInitial = (init) => {
  const base = blankRecord();
  if (!init) return base;
  const chains = (
    init.chains && init.chains.length ? init.chains : base.chains
  ).map((c) => {
    const merged = { ...newChain(), ...c };
    const whys = [...(merged.whys || [])];
    while (whys.length < DEFAULT_WHY_SLOTS) whys.push("");
    return { ...merged, whys };
  });
  return {
    ...base,
    ...init,
    header: { ...base.header, ...(init.header || {}) },
    cft: { ...base.cft, ...(init.cft || {}) },
    documentsStandardized: {
      ...base.documentsStandardized,
      ...(init.documentsStandardized || {}),
    },
    evidence: { ...base.evidence, ...(init.evidence || {}) },
    chains,
  };
};

const filled = (s) => typeof s === "string" && s.trim().length > 0;

const toggleIn = (arr, v) =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

/* ------------------------------------------------------------------------ */
/* Validation                                                               */
/* ------------------------------------------------------------------------ */

function validate(r) {
  const e = {};
  if (!filled(r.header.date)) e["header.date"] = "Required";
  if (!r.header.shift) e["header.shift"] = "Select shift";
  if (!filled(r.header.dept)) e["header.dept"] = "Required";
  if (!filled(r.header.machineArea)) e["header.machineArea"] = "Required";
  if (!filled(r.physicalPhenomena))
    e.physicalPhenomena = "Describe what was observed";
  if (!filled(r.immediateCorrection)) e.immediateCorrection = "Required";
  if (r.impacts.length === 0) e.impacts = "Tick at least one impact";
  if (
    !CFT_FUNCTIONS.some((f) => filled(r.cft[f.key])) &&
    !filled(r.cft.othersName)
  )
    e.cft = "Name at least one CFT member";
  if (filled(r.cft.othersName) && !filled(r.cft.othersFunction))
    e["cft.othersFunction"] = "Specify function";

  const multi = r.chains.length > 1;
  r.chains.forEach((c, i) => {
    const k = `chains.${i}`;
    if (multi && !filled(c.cause)) e[`${k}.cause`] = "Name this cause";
    // whys must be filled contiguously from Why1, minimum depth MIN_FILLED_WHYS
    let lastFilled = -1;
    c.whys.forEach((w, j) => {
      if (filled(w)) lastFilled = j;
    });
    for (let j = 0; j <= Math.max(lastFilled, MIN_FILLED_WHYS - 1); j++) {
      if (!filled(c.whys[j]))
        e[`${k}.whys.${j}`] =
          j < MIN_FILLED_WHYS
            ? "Required"
            : "Fill the gap — whys must be continuous";
    }
    if (!filled(c.rootCause)) e[`${k}.rootCause`] = "Required";
    if (!filled(c.correctiveAction)) e[`${k}.correctiveAction`] = "Required";
    if (!filled(c.completionDate)) e[`${k}.completionDate`] = "Required";
    else if (filled(r.header.date) && c.completionDate < r.header.date)
      e[`${k}.completionDate`] = "Cannot be before the incident date";
  });

  if (r.countermeasureModes.length === 0)
    e.countermeasureModes = "Tick the implementation mode";
  if (r.countermeasureModes.includes("Other") && !filled(r.countermeasureOther))
    e.countermeasureOther = "Specify";
  if (!r.rootCauseStatus) e.rootCauseStatus = "Select Eliminated or Repeated";
  if (
    filled(r.documentsStandardized.document) &&
    !filled(r.documentsStandardized.refNo)
  )
    e["documentsStandardized.refNo"] = "Reference No. required";
  return e;
}

function toOutput(r, status) {
  return {
    form: {
      docNo: RCA_FORM_META.docNo,
      rev: RCA_FORM_META.rev,
      revDate: RCA_FORM_META.revDate,
    },
    status,
    ...r,
    countermeasureOther: r.countermeasureModes.includes("Other")
      ? r.countermeasureOther
      : "",
    chains: r.chains.map((c) => {
      const whys = [...c.whys];
      while (whys.length && !filled(whys[whys.length - 1])) whys.pop();
      return { ...c, cause: r.chains.length > 1 ? c.cause : "", whys };
    }),
    savedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------------ */
/* Scoped CSS                                                               */
/* ------------------------------------------------------------------------ */

const CSS = `
.rcad-overlay{
  --rcad-accent:#1f4e79; --rcad-accent-soft:#e8eff7; --rcad-text:#1d2329; --rcad-muted:#5f6b76;
  --rcad-border:#d4dae0; --rcad-bg:#ffffff; --rcad-surface:#f6f8fa; --rcad-error:#b42318; --rcad-error-soft:#fdecea;
  --rcad-ok:#1e7a46; --rcad-radius:8px;
  position:fixed; inset:0; background:rgba(16,24,32,.55); display:flex; align-items:center; justify-content:center;
  z-index:1000; padding:16px; font-family:inherit; color:var(--rcad-text);
}
.rcad-overlay *{box-sizing:border-box}
.rcad-dialog{background:var(--rcad-bg); width:min(1040px,100%); max-height:calc(100vh - 32px); display:flex; flex-direction:column;
  border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,.3); overflow:hidden; font-size:14px; line-height:1.4}
.rcad-head{display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:16px 20px; border-bottom:1px solid var(--rcad-border)}
.rcad-title{margin:0; font-size:18px; font-weight:600}
.rcad-sub{margin:2px 0 0; color:var(--rcad-muted); font-size:13px}
.rcad-meta{display:flex; gap:6px; flex-wrap:wrap; align-items:center}
.rcad-tag{font-size:12px; padding:3px 8px; border:1px solid var(--rcad-border); border-radius:999px; color:var(--rcad-muted); background:var(--rcad-surface); white-space:nowrap}
.rcad-x{border:0; background:transparent; font-size:22px; line-height:1; cursor:pointer; color:var(--rcad-muted); padding:2px 6px; border-radius:6px}
.rcad-x:hover{background:var(--rcad-surface); color:var(--rcad-text)}
.rcad-body{overflow-y:auto; padding:4px 20px 20px; flex:1}
.rcad-sec{padding:16px 0; border-bottom:1px solid var(--rcad-border)}
.rcad-sec:last-child{border-bottom:0}
.rcad-sec h3{margin:0 0 12px; font-size:14px; font-weight:600; display:flex; align-items:center; gap:8px}
.rcad-num{display:inline-flex; width:22px; height:22px; border-radius:50%; background:var(--rcad-accent); color:#fff; font-size:12px; align-items:center; justify-content:center; flex:none}
.rcad-hint{font-weight:400; color:var(--rcad-muted); font-size:12px}
.rcad-grid{display:grid; gap:12px}
.rcad-g4{grid-template-columns:repeat(4,minmax(0,1fr))}
.rcad-g3{grid-template-columns:repeat(3,minmax(0,1fr))}
.rcad-g2{grid-template-columns:repeat(2,minmax(0,1fr))}
@media (max-width:760px){
  .rcad-g4,.rcad-g3,.rcad-g2{grid-template-columns:1fr}
  .rcad-head{flex-wrap:wrap}
  .rcad-headtext{flex:1 1 0; min-width:0}
  .rcad-meta{order:3; flex-basis:100%}
  .rcad-why{grid-template-columns:1fr auto}
  .rcad-whylab{grid-column:1/-1; padding-top:0}
  .rcad-addwhy{margin-left:0 !important}
}
.rcad-field{display:flex; flex-direction:column; gap:4px; min-width:0}
.rcad-label{font-size:12px; font-weight:600; color:var(--rcad-muted)}
.rcad-req{color:var(--rcad-error); margin-left:2px}
.rcad-input,.rcad-ta,.rcad-select{width:100%; border:1px solid var(--rcad-border); border-radius:var(--rcad-radius); padding:8px 10px; font:inherit; color:inherit; background:#fff}
.rcad-ta{resize:vertical; min-height:64px}
.rcad-input:focus,.rcad-ta:focus,.rcad-select:focus{outline:2px solid var(--rcad-accent); outline-offset:-1px; border-color:var(--rcad-accent)}
.rcad-bad .rcad-input,.rcad-bad .rcad-ta,.rcad-input.rcad-bad,.rcad-ta.rcad-bad{border-color:var(--rcad-error); background:var(--rcad-error-soft)}
.rcad-err{color:var(--rcad-error); font-size:12px}
.rcad-seg{display:inline-flex; border:1px solid var(--rcad-border); border-radius:var(--rcad-radius); overflow:hidden; width:fit-content}
.rcad-seg button{border:0; background:#fff; padding:8px 16px; cursor:pointer; font:inherit; border-right:1px solid var(--rcad-border)}
.rcad-seg button:last-child{border-right:0}
.rcad-seg button[aria-pressed="true"]{background:var(--rcad-accent); color:#fff}
.rcad-chips{display:flex; flex-wrap:wrap; gap:8px}
.rcad-chip{border:1px solid var(--rcad-border); background:#fff; border-radius:999px; padding:6px 12px; cursor:pointer; font:inherit; display:inline-flex; gap:6px; align-items:center}
.rcad-chip[aria-pressed="true"]{background:var(--rcad-accent-soft); border-color:var(--rcad-accent); color:var(--rcad-accent); font-weight:600}
.rcad-chip .rcad-tick{width:14px; height:14px; border:1.5px solid currentColor; border-radius:3px; display:inline-flex; align-items:center; justify-content:center; font-size:11px; line-height:1}
.rcad-cft{display:grid; grid-template-columns:120px 1fr; gap:6px 10px; align-items:center}
.rcad-cft .rcad-label{margin:0}
.rcad-tabs{display:flex; gap:4px; border-bottom:1px solid var(--rcad-border); margin-bottom:12px; flex-wrap:wrap}
.rcad-tab{border:0; background:transparent; padding:8px 12px; cursor:pointer; font:inherit; color:var(--rcad-muted); border-bottom:2px solid transparent; margin-bottom:-1px; display:inline-flex; gap:6px; align-items:center}
.rcad-tab[aria-selected="true"]{color:var(--rcad-accent); border-bottom-color:var(--rcad-accent); font-weight:600}
.rcad-tab .rcad-dot{width:7px; height:7px; border-radius:50%; background:var(--rcad-error)}
.rcad-why{display:grid; grid-template-columns:110px 1fr auto; gap:10px; align-items:start; position:relative}
.rcad-why + .rcad-why{margin-top:8px}
.rcad-whylab{padding-top:8px; font-weight:600; font-size:13px}
.rcad-whylab small{display:block; font-weight:400; color:var(--rcad-muted); font-size:11px}
.rcad-btn{border:1px solid var(--rcad-border); background:#fff; border-radius:var(--rcad-radius); padding:8px 14px; cursor:pointer; font:inherit; color:inherit}
.rcad-btn:hover{background:var(--rcad-surface)}
.rcad-btn:disabled{opacity:.5; cursor:not-allowed}
.rcad-btn-link{border:0; background:transparent; color:var(--rcad-accent); cursor:pointer; font:inherit; padding:4px 0; font-size:13px}
.rcad-btn-link:disabled{color:var(--rcad-muted); cursor:not-allowed}
.rcad-btn-icon{border:0; background:transparent; color:var(--rcad-muted); cursor:pointer; padding:8px; font-size:16px; line-height:1; border-radius:6px}
.rcad-btn-icon:hover{background:var(--rcad-surface); color:var(--rcad-error)}
.rcad-primary{background:var(--rcad-accent); border-color:var(--rcad-accent); color:#fff}
.rcad-primary:hover{background:var(--rcad-accent); filter:brightness(1.1)}
.rcad-row{display:flex; gap:12px; align-items:center; flex-wrap:wrap}
.rcad-radio{display:inline-flex; gap:6px; align-items:center; cursor:pointer}
.rcad-photo{border:1.5px dashed var(--rcad-border); border-radius:var(--rcad-radius); min-height:150px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:10px; background:var(--rcad-surface); position:relative; text-align:center; color:var(--rcad-muted)}
.rcad-photo img{max-width:100%; max-height:200px; border-radius:6px; object-fit:contain}
.rcad-photo input{position:absolute; inset:0; opacity:0; cursor:pointer}
.rcad-photo .rcad-btn-link{position:relative; z-index:1}
.rcad-foot{display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 20px; border-top:1px solid var(--rcad-border); background:var(--rcad-surface); flex-wrap:wrap}
.rcad-foot .rcad-row{gap:8px}
.rcad-summary{color:var(--rcad-error); font-size:13px}
.rcad-saved{color:var(--rcad-ok); font-size:13px}
`;

/* ------------------------------------------------------------------------ */
/* Small presentational pieces                                              */
/* ------------------------------------------------------------------------ */

function Field({ label, required, error, hint, children, className = "" }) {
  return (
    <label className={`rcad-field ${error ? "rcad-bad" : ""} ${className}`}>
      <span className="rcad-label">
        {label}
        {required && <span className="rcad-req">*</span>}
        {hint && <span className="rcad-hint"> — {hint}</span>}
      </span>
      {children}
      {error && <span className="rcad-err">{error}</span>}
    </label>
  );
}

function Chip({ on, onClick, children }) {
  return (
    <button
      type="button"
      className="rcad-chip"
      aria-pressed={on}
      onClick={onClick}
    >
      <span className="rcad-tick" aria-hidden="true">
        {on ? "✓" : ""}
      </span>
      {children}
    </button>
  );
}

function PhotoSlot({ label, file, onChange }) {
  const url = useMemo(
    () =>
      file instanceof Blob
        ? URL.createObjectURL(file)
        : typeof file === "string"
          ? file
          : null,
    [file],
  );
  useEffect(
    () => () => {
      if (url && file instanceof Blob) URL.revokeObjectURL(url);
    },
    [url, file],
  );
  return (
    <div className="rcad-field">
      <span className="rcad-label">{label}</span>
      <div className="rcad-photo">
        {url ? (
          <>
            <img src={url} alt={`${label} photo`} />
            <button
              type="button"
              className="rcad-btn-link"
              onClick={() => onChange(null)}
            >
              Remove photo
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 24 }} aria-hidden="true">
              📷
            </span>
            <span>Click or drop a photo</span>
            <span className="rcad-hint">
              JPG / PNG — mark the defect area before uploading
            </span>
            <input
              type="file"
              accept="image/*"
              aria-label={`${label} photo`}
              onChange={(e) =>
                onChange(
                  e.target.files && e.target.files[0]
                    ? e.target.files[0]
                    : null,
                )
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Main component                                                           */
/* ------------------------------------------------------------------------ */

export default function RCAEntryDialog({
  open,
  onClose,
  onSubmit,
  onSaveDraft,
  initialValues,
  deptOptions = [
    "EE&I",
    "Electrical",
    "Mechanical",
    "Production",
    "Quality",
    "Technical",
  ],
  machineOptions = [],
  pdfEndpoint = "/api/rca/pdf",
  onDownloadPdf,
}) {
  const [rec, setRec] = useState(() => mergeInitial(initialValues));
  const [activeChain, setActiveChain] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  // Why1 mirrors Physical Phenomena until the user edits Why1 themselves
  const [why1Linked, setWhy1Linked] = useState(
    () => !filled(initialValues?.chains?.[0]?.whys?.[0]),
  );
  const bodyRef = useRef(null);
  const dialogRef = useRef(null);

  // reset whenever the dialog is (re)opened or handed a different record
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevInitial, setPrevInitial] = useState(initialValues);
  if (open !== prevOpen || initialValues !== prevInitial) {
    setPrevOpen(open);
    setPrevInitial(initialValues);
    if (open) {
      setRec(mergeInitial(initialValues));
      setActiveChain(0);
      setShowErrors(false);
      setDirty(false);
      setNotice("");
      setWhy1Linked(!filled(initialValues?.chains?.[0]?.whys?.[0]));
    }
  }

  const errors = useMemo(() => validate(rec), [rec]);
  const errCount = Object.keys(errors).length;
  const err = (k) => (showErrors ? errors[k] : undefined);
  const chainHasErr = (i) =>
    showErrors && Object.keys(errors).some((k) => k.startsWith(`chains.${i}.`));

  /* ---------- updaters ---------- */
  const update = (fn) => {
    setRec((r) => fn(structuredCloneSafe(r)));
    setDirty(true);
    setNotice("");
  };
  const setHeader = (k, v) =>
    update((r) => {
      r.header[k] = v;
      return r;
    });
  const setCft = (k, v) =>
    update((r) => {
      r.cft[k] = v;
      return r;
    });
  const setChain = (i, k, v) =>
    update((r) => {
      r.chains[i][k] = v;
      return r;
    });
  const setWhy = (i, j, v) => {
    if (i === 0 && j === 0) setWhy1Linked(false);
    update((r) => {
      r.chains[i].whys[j] = v;
      return r;
    });
  };
  const setPhenomenon = (v) =>
    update((r) => {
      r.physicalPhenomena = v;
      if (why1Linked) r.chains[0].whys[0] = v;
      return r;
    });
  const addWhy = (i) =>
    update((r) => {
      if (r.chains[i].whys.length < MAX_WHYS) r.chains[i].whys.push("");
      return r;
    });
  const removeWhy = (i, j) =>
    update((r) => {
      r.chains[i].whys.splice(j, 1);
      return r;
    });
  const addChain = () => {
    if (rec.chains.length >= MAX_CHAINS) return;
    update((r) => {
      r.chains.push(newChain());
      return r;
    });
    setActiveChain(rec.chains.length);
  };
  const removeChain = (i) => {
    update((r) => {
      r.chains.splice(i, 1);
      return r;
    });
    setActiveChain((a) => Math.max(0, a >= i ? a - 1 : a));
  };
  const applyLastWhy = (i) => {
    const w = [...rec.chains[i].whys].reverse().find(filled);
    if (w) setChain(i, "rootCause", w);
  };

  /* ---------- close / keyboard ---------- */
  const requestClose = () => {
    if (busy) return;
    if (dirty && !window.confirm("Discard the unsaved RCA entry?")) return;
    onClose && onClose();
  };
  const closeRef = useRef(requestClose);
  useEffect(() => {
    closeRef.current = requestClose; // always the latest (sees current dirty/busy)
  });
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      const el =
        dialogRef.current &&
        dialogRef.current.querySelector(
          ".rcad-body input, .rcad-body textarea",
        );
      if (el) el.focus();
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  /* ---------- actions ---------- */
  const scrollToFirstError = (errs) => {
    const first = Object.keys(errs)[0];
    if (!first) return;
    const m = first.match(/^chains\.(\d+)\./);
    if (m) setActiveChain(Number(m[1]));
    setTimeout(() => {
      const el =
        bodyRef.current &&
        bodyRef.current.querySelector(".rcad-bad, .rcad-err");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 30);
  };

  const handleSubmit = async () => {
    setShowErrors(true);
    if (errCount) {
      scrollToFirstError(errors);
      return;
    }
    try {
      setBusy(true);
      await (onSubmit && onSubmit(toOutput(rec, "submitted")));
      setDirty(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDraft = async () => {
    const fn = onSaveDraft || onSubmit;
    if (!fn) return;
    try {
      setBusy(true);
      await fn(toOutput(rec, "draft"));
      setDirty(false);
      setNotice(
        `Draft saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPdf = async () => {
    setShowErrors(true);
    setPdfError("");
    if (errCount) {
      scrollToFirstError(errors);
      return;
    }
    const record = toOutput(rec, "submitted");
    try {
      setPdfBusy(true);
      let blob;
      let filename = pdfFileName(record);
      if (onDownloadPdf) {
        blob = await onDownloadPdf(record);
      } else {
        const res = await fetch(pdfEndpoint, {
          method: "POST",
          body: toPdfFormData(record),
        });
        if (!res.ok) {
          let msg = `${res.status} ${res.statusText}`;
          try {
            const j = await res.json();
            if (j && j.detail) msg = j.detail;
          } catch {
            /* not JSON */
          }
          throw new Error(msg);
        }
        const cd = res.headers.get("Content-Disposition") || "";
        const m = cd.match(/filename="?([^";]+)"?/i);
        if (m) filename = m[1];
        blob = await res.blob();
      }
      if (blob) saveBlob(blob, filename);
    } catch (e) {
      setPdfError(`PDF download failed: ${e && e.message ? e.message : e}`);
    } finally {
      setPdfBusy(false);
    }
  };

  if (!open) return null;

  const multi = rec.chains.length > 1;
  const ci = Math.min(activeChain, rec.chains.length - 1);
  const chain = rec.chains[ci];
  const ck = `chains.${ci}`;

  return (
    <div
      className="rcad-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <style>{CSS}</style>
      <div
        className="rcad-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rcad-title"
        ref={dialogRef}
      >
        {/* ---------------- Header ---------------- */}
        <div className="rcad-head">
          <div className="rcad-headtext">
            <h2 className="rcad-title" id="rcad-title">
              {RCA_FORM_META.title} — Why-Why Analysis
            </h2>
            <p className="rcad-sub">
              Fields marked <span className="rcad-req">*</span> are required.
              Why1 starts from the observed phenomenon.
            </p>
          </div>
          <div className="rcad-meta">
            <span className="rcad-tag">Doc No: {RCA_FORM_META.docNo}</span>
            <span className="rcad-tag">Rev: {RCA_FORM_META.rev}</span>
            <span className="rcad-tag">Rev. Date: {RCA_FORM_META.revDate}</span>
          </div>
          <button
            type="button"
            className="rcad-x"
            aria-label="Close"
            onClick={requestClose}
          >
            ×
          </button>
        </div>

        <div className="rcad-body" ref={bodyRef}>
          {/* ---------------- 1. Incident details ---------------- */}
          <section className="rcad-sec">
            <h3>
              <span className="rcad-num">1</span>Incident details
            </h3>
            <div className="rcad-grid rcad-g4">
              <Field label="Date" required error={err("header.date")}>
                <input
                  type="date"
                  className="rcad-input"
                  value={rec.header.date}
                  max={today()}
                  onChange={(e) => setHeader("date", e.target.value)}
                />
              </Field>
              <div
                className={`rcad-field ${err("header.shift") ? "rcad-bad" : ""}`}
              >
                <span className="rcad-label">
                  Shift<span className="rcad-req">*</span>
                </span>
                <div className="rcad-seg" role="group" aria-label="Shift">
                  {SHIFTS.map((s, i) => (
                    <button
                      key={s}
                      type="button"
                      className={i === 0 ? "rcad-seg-first" : ""}
                      aria-pressed={rec.header.shift === s}
                      onClick={() => setHeader("shift", s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {err("header.shift") && (
                  <span className="rcad-err">{err("header.shift")}</span>
                )}
              </div>
              <Field label="Dept" required error={err("header.dept")}>
                <input
                  className="rcad-input"
                  list="rcad-dept-list"
                  value={rec.header.dept}
                  placeholder="e.g. EE&I"
                  onChange={(e) => setHeader("dept", e.target.value)}
                />
                <datalist id="rcad-dept-list">
                  {deptOptions.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </Field>
              <Field
                label="Machine No / Area"
                required
                error={err("header.machineArea")}
              >
                <input
                  className="rcad-input"
                  list="rcad-machine-list"
                  value={rec.header.machineArea}
                  placeholder="e.g. Banbury 4"
                  onChange={(e) => setHeader("machineArea", e.target.value)}
                />
                <datalist id="rcad-machine-list">
                  {machineOptions.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </Field>
            </div>
            <div className="rcad-grid rcad-g4" style={{ marginTop: 12 }}>
              <Field label="MP / CP" hint="reference, if applicable">
                <input
                  className="rcad-input"
                  value={rec.header.mpcp}
                  placeholder="e.g. 2.8E.2.8.2"
                  onChange={(e) => setHeader("mpcp", e.target.value)}
                />
              </Field>
            </div>
          </section>

          {/* ---------------- 2. Problem ---------------- */}
          <section className="rcad-sec">
            <h3>
              <span className="rcad-num">2</span>Problem
            </h3>
            <div className="rcad-grid rcad-g2">
              <Field
                label="Physical Phenomena (Explain)"
                required
                error={err("physicalPhenomena")}
                hint="what was seen / measured, no causes"
              >
                <textarea
                  className="rcad-ta"
                  rows={3}
                  value={rec.physicalPhenomena}
                  placeholder="e.g. Compound not coming in proper sheet form; TSS getting empty batch to batch"
                  onChange={(e) => setPhenomenon(e.target.value)}
                />
              </Field>
              <Field
                label="Immediate Correction"
                required
                error={err("immediateCorrection")}
                hint="containment done on the spot"
              >
                <textarea
                  className="rcad-ta"
                  rows={3}
                  value={rec.immediateCorrection}
                  placeholder="e.g. Tripped motor reset, external fan provided for HPP motor cooling"
                  onChange={(e) =>
                    update((r) => {
                      r.immediateCorrection = e.target.value;
                      return r;
                    })
                  }
                />
              </Field>
            </div>
          </section>

          {/* ---------------- 3. Impact & CFT ---------------- */}
          <section className="rcad-sec">
            <h3>
              <span className="rcad-num">3</span>Impact &amp; cross-functional
              team
            </h3>
            <div className="rcad-grid rcad-g2">
              <div className="rcad-field">
                <span className="rcad-label">
                  Impacts on (tick applicable)
                  <span className="rcad-req">*</span>
                </span>
                <div className="rcad-chips">
                  {IMPACTS.map((x) => (
                    <Chip
                      key={x}
                      on={rec.impacts.includes(x)}
                      onClick={() =>
                        update((r) => {
                          r.impacts = toggleIn(r.impacts, x);
                          return r;
                        })
                      }
                    >
                      {x}
                    </Chip>
                  ))}
                </div>
                {err("impacts") && (
                  <span className="rcad-err">{err("impacts")}</span>
                )}
              </div>
              <div className="rcad-field">
                <span className="rcad-label">
                  CFT (Cross Function Team) details
                  <span className="rcad-req">*</span>
                </span>
                <div className="rcad-cft">
                  {CFT_FUNCTIONS.map((f) => (
                    <React.Fragment key={f.key}>
                      <span className="rcad-label">{f.label}</span>
                      <input
                        className="rcad-input"
                        value={rec.cft[f.key]}
                        placeholder="Name"
                        aria-label={`${f.label} member name`}
                        onChange={(e) => setCft(f.key, e.target.value)}
                      />
                    </React.Fragment>
                  ))}
                  <input
                    className={`rcad-input ${err("cft.othersFunction") ? "rcad-bad" : ""}`}
                    value={rec.cft.othersFunction}
                    placeholder="Others (specify)"
                    aria-label="Other function"
                    onChange={(e) => setCft("othersFunction", e.target.value)}
                  />
                  <input
                    className="rcad-input"
                    value={rec.cft.othersName}
                    placeholder="Name"
                    aria-label="Other member name"
                    onChange={(e) => setCft("othersName", e.target.value)}
                  />
                </div>
                {(err("cft") || err("cft.othersFunction")) && (
                  <span className="rcad-err">
                    {err("cft") || err("cft.othersFunction")}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* ---------------- 4. Why-Why + 5. Root cause & action ---------------- */}
          <section className="rcad-sec">
            <h3>
              <span className="rcad-num">4</span>Why-Why analysis
              <span className="rcad-hint">
                each Why answers the one above it
              </span>
            </h3>

            {(multi || rec.chains.length < MAX_CHAINS) && (
              <div className="rcad-tabs" role="tablist">
                {rec.chains.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    className="rcad-tab"
                    aria-selected={i === ci}
                    onClick={() => setActiveChain(i)}
                  >
                    {multi
                      ? `Cause-${i + 1}${filled(c.cause) ? `: ${c.cause.slice(0, 24)}${c.cause.length > 24 ? "…" : ""}` : ""}`
                      : "Cause chain"}
                    {chainHasErr(i) && (
                      <span className="rcad-dot" aria-label="has errors" />
                    )}
                  </button>
                ))}
                {rec.chains.length < MAX_CHAINS && (
                  <button
                    type="button"
                    className="rcad-tab"
                    onClick={addChain}
                    title="Use when one event has several separate effects to analyse (e.g. failure, collateral damage, risk of repeat)"
                  >
                    + Add cause chain
                  </button>
                )}
              </div>
            )}

            {multi && (
              <div
                className="rcad-row"
                style={{ marginBottom: 12, alignItems: "flex-end" }}
              >
                <Field
                  label={`Cause-${ci + 1}`}
                  required
                  error={err(`${ck}.cause`)}
                  className=""
                >
                  <input
                    className="rcad-input"
                    style={{ minWidth: 320 }}
                    value={chain.cause}
                    placeholder="e.g. Equipment damage nearby"
                    onChange={(e) => setChain(ci, "cause", e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="rcad-btn"
                  onClick={() => removeChain(ci)}
                >
                  Remove this chain
                </button>
              </div>
            )}

            {chain.whys.map((w, j) => {
              const e = err(`${ck}.whys.${j}`);
              const linked = ci === 0 && j === 0 && why1Linked;
              return (
                <React.Fragment key={j}>
                  <div className="rcad-why">
                    <div className="rcad-whylab">
                      Why{j + 1}
                      {j < MIN_FILLED_WHYS && (
                        <span className="rcad-req">*</span>
                      )}
                      {j === 0 && <small>start with phenomenon</small>}
                    </div>
                    <div className={`rcad-field ${e ? "rcad-bad" : ""}`}>
                      <textarea
                        className="rcad-ta"
                        rows={1}
                        style={{ minHeight: 40 }}
                        value={w}
                        aria-label={`Why ${j + 1}`}
                        placeholder={
                          j === 0
                            ? "Restate the phenomenon"
                            : `Why did Why${j} happen?`
                        }
                        onChange={(ev) => setWhy(ci, j, ev.target.value)}
                      />
                      {linked && filled(w) && (
                        <span className="rcad-hint">
                          Copied from Physical Phenomena — edit to override
                        </span>
                      )}
                      {e && <span className="rcad-err">{e}</span>}
                    </div>
                    {j >= DEFAULT_WHY_SLOTS ? (
                      <button
                        type="button"
                        className="rcad-btn-icon"
                        aria-label={`Remove Why ${j + 1}`}
                        onClick={() => removeWhy(ci, j)}
                      >
                        ✕
                      </button>
                    ) : (
                      <span style={{ width: 32 }} />
                    )}
                  </div>
                </React.Fragment>
              );
            })}
            <div
              className="rcad-addwhy"
              style={{ marginLeft: 120, marginTop: 6 }}
            >
              <button
                type="button"
                className="rcad-btn-link"
                disabled={chain.whys.length >= MAX_WHYS}
                onClick={() => addWhy(ci)}
              >
                + Add more Why
              </button>
            </div>

            <h3 style={{ marginTop: 20 }}>
              <span className="rcad-num">5</span>Root cause &amp; action
              {multi ? ` — Cause-${ci + 1}` : ""}
            </h3>
            <div className="rcad-grid rcad-g2">
              <Field label="Root Cause" required error={err(`${ck}.rootCause`)}>
                <textarea
                  className="rcad-ta"
                  rows={3}
                  value={chain.rootCause}
                  placeholder="The actionable cause — normally the last Why"
                  onChange={(e) => setChain(ci, "rootCause", e.target.value)}
                />
                <span>
                  <button
                    type="button"
                    className="rcad-btn-link"
                    onClick={(e) => {
                      e.preventDefault();
                      applyLastWhy(ci);
                    }}
                  >
                    Use last Why as root cause
                  </button>
                </span>
              </Field>
              <div className="rcad-grid">
                <Field
                  label="Corrective Action"
                  required
                  error={err(`${ck}.correctiveAction`)}
                  hint="permanent fix for this root cause"
                >
                  <textarea
                    className="rcad-ta"
                    rows={2}
                    value={chain.correctiveAction}
                    onChange={(e) =>
                      setChain(ci, "correctiveAction", e.target.value)
                    }
                  />
                </Field>
                <Field
                  label="Preventive Action"
                  hint="stops recurrence elsewhere / horizontal deployment"
                >
                  <textarea
                    className="rcad-ta"
                    rows={2}
                    value={chain.preventiveAction}
                    onChange={(e) =>
                      setChain(ci, "preventiveAction", e.target.value)
                    }
                  />
                </Field>
              </div>
            </div>
            <div className="rcad-grid rcad-g4" style={{ marginTop: 12 }}>
              <Field
                label="Date of Completion"
                required
                error={err(`${ck}.completionDate`)}
              >
                <input
                  type="date"
                  className="rcad-input"
                  value={chain.completionDate}
                  min={rec.header.date || undefined}
                  onChange={(e) =>
                    setChain(ci, "completionDate", e.target.value)
                  }
                />
              </Field>
            </div>
          </section>

          {/* ---------------- 6. Countermeasure & closure ---------------- */}
          <section className="rcad-sec">
            <h3>
              <span className="rcad-num">6</span>Countermeasure &amp; closure
            </h3>
            <div className="rcad-grid rcad-g2">
              <div className="rcad-field">
                <span className="rcad-label">
                  Counter Measure implementation Mode (tick appropriate)
                  <span className="rcad-req">*</span>
                </span>
                <div className="rcad-chips">
                  {COUNTERMEASURE_MODES.map((m) => (
                    <Chip
                      key={m}
                      on={rec.countermeasureModes.includes(m)}
                      onClick={() =>
                        update((r) => {
                          r.countermeasureModes = toggleIn(
                            r.countermeasureModes,
                            m,
                          );
                          return r;
                        })
                      }
                    >
                      {m}
                    </Chip>
                  ))}
                </div>
                {rec.countermeasureModes.includes("Other") && (
                  <input
                    className={`rcad-input ${err("countermeasureOther") ? "rcad-bad" : ""}`}
                    style={{ marginTop: 8 }}
                    value={rec.countermeasureOther}
                    placeholder="Specify other mode"
                    aria-label="Other implementation mode"
                    onChange={(e) =>
                      update((r) => {
                        r.countermeasureOther = e.target.value;
                        return r;
                      })
                    }
                  />
                )}
                {(err("countermeasureModes") || err("countermeasureOther")) && (
                  <span className="rcad-err">
                    {err("countermeasureModes") || err("countermeasureOther")}
                  </span>
                )}
              </div>
              <div className="rcad-field">
                <span className="rcad-label">
                  Root Cause Eliminated / Repeated
                  <span className="rcad-req">*</span>
                </span>
                <div
                  className="rcad-row"
                  role="radiogroup"
                  aria-label="Root cause status"
                >
                  {ROOT_CAUSE_STATUS.map((s) => (
                    <label key={s} className="rcad-radio">
                      <input
                        type="radio"
                        name="rcad-status"
                        checked={rec.rootCauseStatus === s}
                        onChange={() =>
                          update((r) => {
                            r.rootCauseStatus = s;
                            return r;
                          })
                        }
                      />
                      {s}
                    </label>
                  ))}
                </div>
                {err("rootCauseStatus") && (
                  <span className="rcad-err">{err("rootCauseStatus")}</span>
                )}
              </div>
            </div>
            <div className="rcad-grid rcad-g2" style={{ marginTop: 12 }}>
              <Field
                label="Documents Standardized"
                hint="SOP / OPL / checksheet updated"
              >
                <input
                  className="rcad-input"
                  value={rec.documentsStandardized.document}
                  placeholder="e.g. TSS replacement checklist"
                  onChange={(e) =>
                    update((r) => {
                      r.documentsStandardized.document = e.target.value;
                      return r;
                    })
                  }
                />
              </Field>
              <Field
                label="Reference No."
                error={err("documentsStandardized.refNo")}
              >
                <input
                  className="rcad-input"
                  value={rec.documentsStandardized.refNo}
                  placeholder="Document reference number"
                  onChange={(e) =>
                    update((r) => {
                      r.documentsStandardized.refNo = e.target.value;
                      return r;
                    })
                  }
                />
              </Field>
            </div>
          </section>

          {/* ---------------- 7. Evidence ---------------- */}
          <section className="rcad-sec">
            <h3>
              <span className="rcad-num">7</span>Evidence{" "}
              <span className="rcad-hint">optional</span>
            </h3>
            <div className="rcad-grid rcad-g2">
              <PhotoSlot
                label="Before"
                file={rec.evidence.before}
                onChange={(f) =>
                  update((r) => {
                    r.evidence.before = f;
                    return r;
                  })
                }
              />
              <PhotoSlot
                label="After"
                file={rec.evidence.after}
                onChange={(f) =>
                  update((r) => {
                    r.evidence.after = f;
                    return r;
                  })
                }
              />
            </div>
          </section>
        </div>

        {/* ---------------- Footer ---------------- */}
        <div className="rcad-foot">
          <div aria-live="polite">
            {showErrors && errCount > 0 && (
              <span className="rcad-summary">
                {errCount} field{errCount > 1 ? "s" : ""} need attention
              </span>
            )}
            {notice && <span className="rcad-saved">{notice}</span>}
            {pdfError && <span className="rcad-summary">{pdfError}</span>}
          </div>
          <div className="rcad-row">
            <button
              type="button"
              className="rcad-btn"
              onClick={handleDownloadPdf}
              disabled={busy || pdfBusy}
              title="Download this RCA on the official UTQM.00.SQ-156 sheet"
            >
              {pdfBusy ? "Preparing PDF…" : "Download PDF"}
            </button>
            <button
              type="button"
              className="rcad-btn"
              onClick={requestClose}
              disabled={busy}
            >
              Cancel
            </button>
            {(onSaveDraft || onSubmit) && (
              <button
                type="button"
                className="rcad-btn"
                onClick={handleDraft}
                disabled={busy || pdfBusy}
              >
                Save draft
              </button>
            )}
            {onSubmit && (
              <button
                type="button"
                className="rcad-btn rcad-primary"
                onClick={handleSubmit}
                disabled={busy || pdfBusy}
              >
                {busy ? "Saving…" : "Submit RCA"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* PDF helpers */
function pdfFileName(record) {
  const h = record.header || {};
  const stem = ["RCA", h.machineArea, h.date]
    .filter((x) => x && String(x).trim())
    .join("_")
    .replace(/[^A-Za-z0-9_-]+/g, "_");
  return `${stem || "RCA"}.pdf`;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Deep copy that keeps File/Blob objects by reference (structuredClone would copy them). */
function structuredCloneSafe(r) {
  return {
    ...r,
    header: { ...r.header },
    impacts: [...r.impacts],
    cft: { ...r.cft },
    chains: r.chains.map((c) => ({ ...c, whys: [...c.whys] })),
    countermeasureModes: [...r.countermeasureModes],
    documentsStandardized: { ...r.documentsStandardized },
    evidence: { ...r.evidence },
  };
}
