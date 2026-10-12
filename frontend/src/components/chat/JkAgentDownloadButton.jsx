import { useState } from "react";
import { Button, CircularProgress, Tooltip } from "@mui/material";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { downloadChatResult } from "@/api/chat.js";
import { buildCsv, downloadCsv } from "@/lib/csv.js";

/**
 * Fetches the full cached result for a chat response and saves it as CSV.
 * Shown whenever the assistant reports `download_available` — that flag is
 * set for small results too, so it is not gated on `is_large_result`.
 *
 * Column order follows the upstream's `columns` array rather than the key
 * order of the row objects, which is not guaranteed.
 *
 * @param {{ resultId: string, rowCount?: number }} props
 */
export default function JkAgentDownloadButton({ resultId, rowCount }) {
  const [status, setStatus] = useState("idle"); // idle | loading | error

  const handleDownload = async () => {
    setStatus("loading");
    try {
      const result = await downloadChatResult(resultId);
      const headers = result.columns ?? [];
      const rows = (result.rows ?? []).map((row) =>
        headers.map((header) => row[header]),
      );
      downloadCsv(`jk-agent-${resultId}.csv`, buildCsv(headers, rows));
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  const label =
    status === "error"
      ? "Retry download"
      : rowCount
        ? `Download CSV (${rowCount} rows)`
        : "Download CSV";

  return (
    <Tooltip
      title={
        status === "error"
          ? "Download failed — try again"
          : "Download the full result as CSV"
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
              <DownloadRoundedIcon sx={{ fontSize: 16 }} />
            )
          }
          sx={{
            mt: 1,
            mr: 1,
            fontSize: "0.75rem",
            textTransform: "none",
            py: 0.25,
          }}
        >
          {label}
        </Button>
      </span>
    </Tooltip>
  );
}
