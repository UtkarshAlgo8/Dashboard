import CardDownloadButton from "@/components/CardDownloadButton.jsx";
import { toExportTable, toFileSlug } from "@/lib/tableExport.js";

/**
 * Download for one Engineering plot or table: Excel of `rows` laid out by
 * `columns` (the same `{ key, label, render }` columns the table shows), plus
 * a PDF of `targetRef`'s element when one is given — a chart passes its panel,
 * a table passes none and offers Excel only.
 *
 * @param {object} props
 * @param {{ key?: string, label: string, render?: Function }[]} props.columns
 * @param {object[]} props.rows rows in the order to export
 * @param {string} props.name download name, slugged into the file name
 * @param {import("react").RefObject<HTMLElement>} [props.targetRef]
 */
function ExportButton({ columns, rows, name, targetRef }) {
  const exported = toExportTable(columns, rows ?? []);
  return (
    <CardDownloadButton
      cardRef={targetRef}
      headers={exported.headers}
      rows={exported.rows}
      filename={toFileSlug(`engineering-${name}`)}
      sx={{ width: 28, height: 28, borderRadius: 1, flexShrink: 0 }}
    />
  );
}

export default ExportButton;
