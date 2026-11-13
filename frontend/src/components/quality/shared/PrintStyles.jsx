import { C } from "./theme.js";

/* ─── PRINT STYLESHEET ─── */
export function PrintStyles() {
  return (
    <style>{`@media print{
  @page{size:A3 landscape;margin:10mm;}
  html,body{background:${C.cd} !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .no-print,.no-print *{display:none !important;}
  [style*="position: sticky"],[style*="position:sticky"]{position:static !important;top:auto !important;}
  [style*="position: fixed"],[style*="position:fixed"]{position:static !important;}
  [style*="overflow-x: auto"],[style*="overflowX"]{overflow:visible !important;}
  [style*="overflow-y: auto"],[style*="overflow:auto"]{overflow:visible !important;max-height:none !important;}
  [style*="min-height: 100vh"],[style*="minHeight"]{min-height:0 !important;}
  button{cursor:default !important;}
  table{page-break-inside:avoid;}
}`}</style>
  );
}
