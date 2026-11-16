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
 * @param {{ filename?: string, backgroundColor?: string, expandScrollContainers?: boolean }} [opts]
 */
export async function exportElementToPdf(el, opts = {}) {
  if (!el) return;
  const {
    filename = "dashboard.pdf",
    backgroundColor,
    expandScrollContainers = false,
  } = opts;

  const [{ default: jsPDF }, { toPng }] = await Promise.all([
    import("jspdf"),
    import("html-to-image"),
  ]);

  // Expand so overflow/scrolled content is fully captured, then restore.
  // Opt-in for panels with nested tables; existing callers keep their original capture behavior.
  const elements = [
    el,
    ...(expandScrollContainers
      ? [...el.querySelectorAll("*")].filter((node) => {
          const style = window.getComputedStyle(node);
          return /(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`);
        })
      : []),
  ];
  const previous = elements.map((node) => ({
    node,
    height: node.style.height,
    maxHeight: node.style.maxHeight,
    overflow: node.style.overflow,
    overflowX: node.style.overflowX,
    overflowY: node.style.overflowY,
  }));
  for (const { node } of previous) {
    node.style.height = "auto";
    node.style.maxHeight = "none";
    node.style.overflow = "visible";
  }

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
    for (const {
      node,
      height,
      maxHeight,
      overflow,
      overflowX,
      overflowY,
    } of previous) {
      node.style.height = height;
      node.style.maxHeight = maxHeight;
      node.style.overflow = overflow;
      if (expandScrollContainers) {
        // Restoring only the shorthand loses an original overflow-x:auto declaration.
        node.style.overflowX = overflowX;
        node.style.overflowY = overflowY;
      }
    }
  }
}
