import { useEffect, useRef } from "react";
import CardDownloadButton from "@/components/CardDownloadButton.jsx";
import { useToast } from "@/components/common/useToast.js";
import {
  maintenanceExportRows,
  saveMaintenanceWorkbook,
} from "@/lib/maintenanceDownloads.js";

/** Opt-in Maintenance adapter: consistent capture, typed tables or server workbooks, and scoped cancellation. */
export default function MaintenanceDownloadButton({
  cardRef,
  headers,
  rows = [],
  filename,
  disabled = false,
  downloadExcel,
  onBusyChange,
}) {
  const toast = useToast();
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), [filename]);
  const exportExcel = downloadExcel
    ? async () => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        try {
          const blob = await downloadExcel({ signal: controller.signal });
          if (!controller.signal.aborted)
            saveMaintenanceWorkbook(blob, filename);
        } catch (error) {
          if (!controller.signal.aborted) throw error;
        }
      }
    : undefined;
  return (
    <CardDownloadButton
      key={filename}
      cardRef={cardRef}
      headers={headers}
      rows={maintenanceExportRows(headers, rows)}
      filename={filename}
      disabled={disabled}
      excelExport={exportExcel}
      expandScrollContainers
      onBusyChange={onBusyChange}
      onExportError={(error) =>
        toast.error(`Download failed: ${error.message}`)
      }
    />
  );
}
