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
  Tooltip,
  Typography,
} from "@mui/material";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import { useToast } from "@/components/common";
import { fetchSchedulerMailPreview, sendSchedulerMail } from "@/api/mail.js";

// The preview is fetched in the background when the header mounts and kept
// for a few minutes, so the pop-up opens with the recipients already there.
// Clicking while the dashboard is loading would otherwise queue the request
// behind the page's own data calls (the browser allows ~6 per host).
const PREVIEW_TTL_MS = 2 * 60 * 1000;
let previewCache = null; // { at, data }
let previewInFlight = null;

function loadPreview() {
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

function freshPreview() {
  return previewCache && Date.now() - previewCache.at < PREVIEW_TTL_MS
    ? previewCache.data
    : null;
}

/**
 * Navbar mail icon. Click → confirm modal listing the configured recipients
 * → Send mails the Daily Infiniti Scheduler (Scheduler Adherence) report for
 * yesterday's plant day. Recipients are fixed on the backend.
 */
function SendMailButton() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  // Warm the preview once the page has settled. A failure here is silent;
  // clicking the icon retries and shows the error.
  useEffect(() => {
    const id = setTimeout(() => {
      if (!freshPreview()) loadPreview().catch(() => {});
    }, 1500);
    return () => clearTimeout(id);
  }, []);

  const handleOpen = async () => {
    setOpen(true);
    setError(null);
    const cached = freshPreview();
    setInfo(cached);
    if (cached) return;
    setLoading(true);
    try {
      setInfo(await loadPreview());
    } catch (err) {
      setError(err.message || "Could not prepare the mail.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!sending) setOpen(false);
  };

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      await sendSchedulerMail({ date: info.reportDate });
      toast.success("Mail sent");
      // "Already sent" has changed — re-read next time.
      previewCache = null;
      setOpen(false);
    } catch (err) {
      const problems = err.details?.problems;
      setError(
        problems?.length ? `${err.message} ${problems.join(" ")}` : err.message,
      );
    } finally {
      setSending(false);
    }
  };

  const recipients = info ? [...(info.to ?? []), ...(info.cc ?? [])] : [];
  const problems = info?.dataCheck?.problems ?? [];
  const canSend = Boolean(info?.dataCheck?.ok) && !sending;

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
            width: 440,
            maxWidth: "calc(100% - 32px)",
          },
        }}
      >
        <DialogTitle sx={{ fontSize: 18, fontWeight: 600 }}>
          Send mail?
        </DialogTitle>
        <DialogContent>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            info && (
              <>
                <Typography sx={{ fontSize: 14, mb: 1.5 }}>
                  Send <b>{info.subject}</b> to{" "}
                  {recipients.length
                    ? `these ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}:`
                    : "the configured recipients?"}
                </Typography>
                {[
                  ["To", info.to ?? []],
                  ["CC", info.cc ?? []],
                ].map(
                  ([label, list]) =>
                    list.length > 0 && (
                      <Box key={label} sx={{ mb: 1.5, fontSize: 13.5 }}>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>
                          {label}
                        </Typography>
                        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                          {list.map((email) => (
                            <li key={email}>{email}</li>
                          ))}
                        </Box>
                      </Box>
                    ),
                )}
                {info.alreadySent && (
                  <Alert severity="warning" sx={{ mb: 1 }}>
                    This day&apos;s mail was already sent by{" "}
                    {info.alreadySent.by}.
                  </Alert>
                )}
                {problems.length > 0 && (
                  <Alert severity="error" sx={{ mb: 1 }}>
                    The mail cannot be sent:
                    {problems.map((p) => (
                      <Box key={p}>• {p}</Box>
                    ))}
                  </Alert>
                )}
              </>
            )
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={sending} color="inherit">
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSend} disabled={!canSend}>
            {sending ? <CircularProgress size={18} color="inherit" /> : "Send"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default SendMailButton;
