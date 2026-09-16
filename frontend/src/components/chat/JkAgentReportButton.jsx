import { useState } from "react";
import { Button, CircularProgress, Tooltip } from "@mui/material";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import { downloadChatReportPdf } from "@/api/chat.js";

/**
 * Saves the PDF a `/report` response generated. Shown when the assistant
 * reports `report_available`.
 *
 * The file arrives as a Blob rather than via a direct link because the
 * backend route sits behind the auth gate — an <a href> would send no
 * Authorization header.
 *
 * @param {{ reportId: string, reportType?: string }} props
 */
export default function JkAgentReportButton({ reportId, reportType }) {
  const [status, setStatus] = useState("idle"); // idle | loading | error

  const handleDownload = async () => {
    setStatus("loading");
    try {
      const blob = await downloadChatReportPdf(reportId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jk-agent-report-${reportType ?? reportId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revoke so the browser has a tick to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  return (
    <Tooltip
      title={
        status === "error"
          ? "Report download failed — try again"
          : "Download the generated report as PDF"
      }
      arrow
    >
      <span>
        <Button
          size="small"
          variant="outlined"
          color={status === "error" ? "error" : "primary"}
          onClick={handleDownload}
          disabled={status === "loading"}
          startIcon={
            status === "loading" ? (
              <CircularProgress size={14} color="inherit" />
            ) : (
              <PictureAsPdfRoundedIcon sx={{ fontSize: 16 }} />
            )
          }
          sx={{ mt: 1, fontSize: "0.75rem", textTransform: "none", py: 0.25 }}
        >
          {status === "error" ? "Retry report" : "Download report (PDF)"}
        </Button>
      </span>
    </Tooltip>
  );
}
