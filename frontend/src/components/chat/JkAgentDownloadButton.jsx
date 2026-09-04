import { useState } from "react";
import { Button, CircularProgress, Tooltip } from "@mui/material";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { downloadChatResult } from "@/api/chat.js";
import { exportRowsAsExcel } from "@/lib/xlsx.js";

/**
 * Fetches the full cached result for a chat response and downloads it as
 * an .xlsx file. Shown on messages where the assistant flagged
 * `is_large_result && download_available`.
 *
 * @param {{ resultId: string, columns?: string[] }} props
 */
export default function JkAgentDownloadButton({ resultId, columns }) {
  const [status, setStatus] = useState("idle"); // idle | loading | error

  const handleDownload = async () => {
    setStatus("loading");
    try {
      const result = await downloadChatResult(resultId);
      await exportRowsAsExcel({
        headers: result.columns ?? columns ?? [],
        rows: result.rows ?? [],
        filename: `jk-agent-${resultId}`,
        sheetName: "Result",
      });
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  return (
    <Tooltip title={status === "error" ? "Download failed — try again" : "Download full result as Excel"} arrow>
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
          sx={{ mt: 1, fontSize: "0.75rem", textTransform: "none", py: 0.25 }}
        >
          {status === "error" ? "Retry download" : "Download Excel"}
        </Button>
      </span>
    </Tooltip>
  );
}
