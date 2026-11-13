import theme from "@/theme.js";

export function chatChartFilename(resultId, extension) {
  const ext = String(extension || "").replace(/^\./, "");
  const safeId = String(resultId ?? "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return `jk-agent-plot${safeId ? `-${safeId}` : ""}${ext ? `.${ext}` : ""}`;
}

export async function downloadElementAsPng(el, filename) {
  if (!el) return;
  const { toPng } = await import("html-to-image");
  const dataUrl = await toPng(el, {
    backgroundColor: theme.palette.common.white,
    pixelRatio: 2,
    cacheBust: true,
  });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
