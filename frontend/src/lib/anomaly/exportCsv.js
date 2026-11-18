import { formatTime } from "./model.js";

const cell = (value) => {
  const text = value == null ? "" : String(value);
  const safe =
    typeof value === "string" && /^[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

/** Export selected raw tag buckets, never chart-normalized values. */
export default function exportTagCsv(model, tags, from, to) {
  const rows = [
    [
      "timestamp_ist",
      ...tags.flatMap((tag) => [`${tag}_avg`, `${tag}_min`, `${tag}_max`]),
    ],
  ];
  const start = Math.max(0, Math.ceil((from - model.tagStart) / model.tagStep));
  const end = Math.floor((to - model.tagStart) / model.tagStep);
  for (let i = start; i <= end; i++)
    rows.push([
      formatTime(model.tagStart + i * model.tagStep),
      ...tags.flatMap((tag) => {
        const series = model.getTagSeries(tag);
        return [series.a[i], series.lo[i], series.hi[i]];
      }),
    ]);
  const url = URL.createObjectURL(
    new Blob([rows.map((row) => row.map(cell).join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `CTP_Quintoplex_demo_${formatTime(from).slice(0, 10)}_${formatTime(to).slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
