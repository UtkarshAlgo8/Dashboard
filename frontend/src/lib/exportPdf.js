/**
 * Export a DOM element to a single-page PDF via html-to-image + jsPDF.
 *
 * "Without split": the PDF page is sized to the captured content, so the
 * whole element lands on ONE page instead of being paginated.
 *
 * The element is temporarily expanded (height/overflow) before capture so
 * a scroll container's FULL content is rendered, not just the visible part.
 * Libraries are dynamically imported so they stay out of the main bundle.
 *
 * We use html-to-image (SVG foreignObject) rather than html2canvas — it's
 * far more tolerant of modern CSS, which avoids the silent capture
 * failures that made the download (and its button animation) never fire.
 *
 * @param {HTMLElement} el
 * @param {{ filename?: string, backgroundColor?: string }} [opts]
 */
export async function exportElementToPdf(el, opts = {}) {
  if (!el) return;
  const { filename = "dashboard.pdf", backgroundColor } = opts;

  const [{ default: jsPDF }, { toPng }] = await Promise.all([
    import("jspdf"),
    import("html-to-image"),
  ]);

  // Expand so overflow/scrolled content is fully captured, then restore.
  const prev = {
    height: el.style.height,
    maxHeight: el.style.maxHeight,
    overflow: el.style.overflow,
  };
  el.style.height = "auto";
  el.style.maxHeight = "none";
  el.style.overflow = "visible";

  // Reflow so scrollWidth/scrollHeight reflect the expanded size.
  const width = el.scrollWidth;
  const height = el.scrollHeight;

  try {
    const dataUrl = await toPng(el, {
      width,
      height,
      backgroundColor,
      pixelRatio: 2,
      cacheBust: true,
    });

    const pdf = new jsPDF({
      orientation: width >= height ? "landscape" : "portrait",
      unit: "px",
      format: [width, height],
      compress: true,
    });
    pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
    pdf.save(filename);
  } finally {
    el.style.height = prev.height;
    el.style.maxHeight = prev.maxHeight;
    el.style.overflow = prev.overflow;
  }
}
