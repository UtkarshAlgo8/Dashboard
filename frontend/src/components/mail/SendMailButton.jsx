import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import { useToast } from "@/components/common";
import { fetchSchedulerMailPreview, sendSchedulerMail } from "@/api/mail.js";

// The default day's preview is fetched in the background when the header
// mounts and kept for a few minutes, so the pop-up opens with everything
// already there. Clicking while the dashboard is loading would otherwise
// queue the request behind the page's own data calls (~6 per host).
const PREVIEW_TTL_MS = 2 * 60 * 1000;
let previewCache = null; // { at, data }
let previewInFlight = null;

function loadDefaultPreview() {
  if (!previewInFlight) {
    previewInFlight = fetchSchedulerMailPreview()
      .then((data) => {
        previewCache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        previewInFlight = null;
      });
  }
  return previewInFlight;
}

function freshDefaultPreview() {
  return previewCache && Date.now() - previewCache.at < PREVIEW_TTL_MS
    ? previewCache.data
    : null;
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

function toList(text) {
  return [
    ...new Set(
      text
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

const MANUAL_FIELDS = [
  { key: "gt", label: "GT Building" },
  { key: "rc4", label: "4RC" },
  { key: "mixing", label: "Mixing" },
];

function manualError(value) {
  if (value === "") return "Required";
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? null : "0 – 100";
}

/** Today in IST as YYYY-MM-DD — the latest day the date picker allows. */
function todayIst() {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

function RecipientList({ label, list }) {
  if (!list.length) return null;
  return (
    <Box sx={{ mb: 1, fontSize: 13.5 }}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{label}</Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {list.map((email) => (
          <li key={email}>{email}</li>
        ))}
      </Box>
    </Box>
  );
}

/**
 * Navbar mail icon → pop-up to send the Daily Infiniti Scheduler (Scheduler
 * Adherence) mail. Choose the report day, the row-3 GT Building / 4RC /
 * Mixing values, and Official recipients (from the backend env) or Custom
 * ones (for checking the mail first). The backend re-validates everything.
 */
function SendMailButton() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [date, setDate] = useState("");
  const [mode, setMode] = useState("official");
  const [toText, setToText] = useState("");
  const [ccText, setCcText] = useState("");
  const [manual, setManual] = useState(null); // { gt, rc4, mixing } as strings
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  // Warm the default day's preview once the page has settled. A failure here
  // is silent; clicking the icon retries and shows the error.
  useEffect(() => {
    const id = setTimeout(() => {
      if (!freshDefaultPreview()) loadDefaultPreview().catch(() => {});
    }, 1500);
    return () => clearTimeout(id);
  }, []);

  /** Show a loaded preview; fill the row-3 fields the first time only. */
  const applyPreview = (data) => {
    setInfo(data);
    setDate(data.reportDate);
    setManual(
      (m) =>
        m ??
        Object.fromEntries(
          MANUAL_FIELDS.map(({ key }) => [
            key,
            String(data.manualDefaults?.[key] ?? ""),
          ]),
        ),
    );
  };

  const runLoad = async (loader) => {
    setLoading(true);
    setError(null);
    try {
      applyPreview(await loader());
    } catch (err) {
      setError(err.message || "Could not prepare the mail.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    setError(null);
    const cached = freshDefaultPreview();
    if (cached) applyPreview(cached);
    else runLoad(loadDefaultPreview);
  };

  const handleDateChange = (value) => {
    setDate(value);
    if (value) runLoad(() => fetchSchedulerMailPreview({ date: value }));
  };

  const handleClose = () => {
    if (!sending) setOpen(false);
  };

  const custom = mode === "custom";
  const customTo = toList(toText);
  const customCc = toList(ccText);
  const to = custom ? customTo : (info?.official?.to ?? []);
  const cc = custom ? customCc : (info?.official?.cc ?? []);
  const badCustom = custom
    ? [...customTo, ...customCc].filter((e) => !EMAIL_RE.test(e))
    : [];
  const recipientIssues = custom
    ? [
        ...(customTo.length ? [] : ["Add at least one To address."]),
        ...(badCustom.length
          ? [`Invalid email address: ${badCustom.join(", ")}.`]
          : []),
      ]
    : (info?.official?.problems ?? []);
  const manualErrors = manual
    ? Object.fromEntries(
        MANUAL_FIELDS.map(({ key }) => [key, manualError(manual[key])]),
      )
    : {};
  const manualOk =
    Boolean(manual) && !Object.values(manualErrors).some(Boolean);
  const problems = info?.dataCheck?.problems ?? [];
  const recipientCount = to.length + cc.length;
  const canSend =
    Boolean(info?.dataCheck?.ok) &&
    recipientIssues.length === 0 &&
    manualOk &&
    !loading &&
    !sending;

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      await sendSchedulerMail({
        date,
        manual: Object.fromEntries(
          MANUAL_FIELDS.map(({ key }) => [key, Number(manual[key])]),
        ),
        mode,
        ...(custom ? { to: customTo, cc: customCc } : {}),
      });
      toast.success(custom ? "Mail sent to custom recipients" : "Mail sent");
      // "Already sent" may have changed — re-read next time.
      previewCache = null;
      setOpen(false);
    } catch (err) {
      const list = err.details?.problems;
      setError(list?.length ? `${err.message} ${list.join(" ")}` : err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Tooltip title="Send Scheduler Adherence mail">
        <IconButton
          onClick={handleOpen}
          aria-label="Send Scheduler Adherence mail"
          sx={{
            width: 34,
            height: 34,
            border: 1,
            borderColor: "divider",
            color: "text.secondary",
          }}
        >
          <MailOutlineIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>

      <Dialog
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: {
            borderRadius: "10px",
            width: 500,
            maxWidth: "calc(100% - 32px)",
          },
        }}
      >
        <DialogTitle sx={{ fontSize: 18, fontWeight: 600 }}>
          Send mail?
        </DialogTitle>
        <DialogContent>
          {!info && loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            info && (
              <Stack spacing={2} sx={{ pt: 0.5 }}>
                <TextField
                  label="Report date"
                  type="date"
                  size="small"
                  value={date}
                  onChange={(e) => handleDateChange(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ max: todayIst() }}
                  helperText={
                    loading
                      ? "Loading this day's values…"
                      : `Plant day, 07:00 to 07:00. Default: ${info.defaultDate}.`
                  }
                />

                <Typography sx={{ fontSize: 14 }}>
                  Subject: <b>{info.subject}</b>
                </Typography>

                <Box>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: 1 }}>
                    Row 3 — Daily Schedule Fulfillment % (Curing{" "}
                    {info.values?.daily_fulfilment_pct != null
                      ? `${Number(info.values.daily_fulfilment_pct).toFixed(2)}%`
                      : "not available"}{" "}
                    comes from the data)
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    {MANUAL_FIELDS.map(({ key, label }) => (
                      <TextField
                        key={key}
                        label={label}
                        size="small"
                        type="number"
                        value={manual?.[key] ?? ""}
                        onChange={(e) =>
                          setManual((m) => ({ ...m, [key]: e.target.value }))
                        }
                        error={Boolean(manualErrors[key])}
                        helperText={manualErrors[key] || " "}
                        inputProps={{ min: 0, max: 100, step: 0.01 }}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">%</InputAdornment>
                          ),
                        }}
                      />
                    ))}
                  </Stack>
                </Box>

                <Box>
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={mode}
                    onChange={(_e, v) => v && setMode(v)}
                    sx={{ mb: 1.5 }}
                  >
                    <ToggleButton value="official">Official</ToggleButton>
                    <ToggleButton value="custom">Custom</ToggleButton>
                  </ToggleButtonGroup>
                  {custom ? (
                    <Stack spacing={1.5}>
                      <TextField
                        label="To"
                        size="small"
                        value={toText}
                        onChange={(e) => setToText(e.target.value)}
                        placeholder="name@algo8.ai, …"
                        helperText="Comma-separated. For checking the mail before the official send."
                        multiline
                        maxRows={3}
                      />
                      <TextField
                        label="CC (optional)"
                        size="small"
                        value={ccText}
                        onChange={(e) => setCcText(e.target.value)}
                        multiline
                        maxRows={3}
                      />
                      {info.customAllowedDomains?.length > 0 && (
                        <Typography
                          sx={{ fontSize: 12, color: "text.secondary" }}
                        >
                          Allowed domains:{" "}
                          {info.customAllowedDomains.join(", ")}
                        </Typography>
                      )}
                    </Stack>
                  ) : (
                    <>
                      <RecipientList label="To" list={to} />
                      <RecipientList label="CC" list={cc} />
                    </>
                  )}
                </Box>

                {!custom && info.alreadySent && (
                  <Alert severity="warning">
                    The official mail for this day was already sent by{" "}
                    {info.alreadySent.by}.
                  </Alert>
                )}
                {(problems.length > 0 || recipientIssues.length > 0) && (
                  <Alert severity="error">
                    The mail cannot be sent:
                    {[...problems, ...recipientIssues].map((p) => (
                      <Box key={p}>• {p}</Box>
                    ))}
                  </Alert>
                )}
              </Stack>
            )
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={sending} color="inherit">
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSend} disabled={!canSend}>
            {sending ? (
              <CircularProgress size={18} color="inherit" />
            ) : recipientCount ? (
              `Send to ${recipientCount}`
            ) : (
              "Send"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default SendMailButton;
