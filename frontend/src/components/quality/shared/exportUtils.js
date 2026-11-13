/** Download helpers behind the Quality Card export button. */
import { C } from "./theme.js";

export function _safeName(s) {
  return (
    (s || "export")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 60) || "export"
  );
}
export function _dl(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}
export function _tableToCSV(tbl) {
  return Array.from(tbl.querySelectorAll("tr"))
    .map((tr) =>
      Array.from(tr.querySelectorAll("th,td"))
        .map((c) => {
          const t = (c.innerText || "").trim().replace(/\s+/g, " ");
          return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
        })
        .join(","),
    )
    .join("\n");
}
export function _svgToPNG(svg, scale, onDone) {
  try {
    const bbox = svg.getBoundingClientRect();
    const w = Math.max(bbox.width, 1),
      h = Math.max(bbox.height, 1);
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    if (!clone.getAttribute("width")) clone.setAttribute("width", w);
    if (!clone.getAttribute("height")) clone.setAttribute("height", h);
    if (!clone.getAttribute("viewBox"))
      clone.setAttribute("viewBox", "0 0 " + w + " " + h);
    const xml = new XMLSerializer().serializeToString(clone);
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = C.cd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => onDone(b));
    };
    img.onerror = () => onDone(null);
    img.src =
      "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  } catch {
    onDone(null);
  }
}
