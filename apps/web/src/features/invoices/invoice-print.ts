
export function printInvoiceElement(elementId: string, title: string): boolean {
  const el = document.getElementById(elementId);
  if (!el) return false;
  const win = window.open("", "_blank");
  if (!win) return false;
  const safeTitle = title.replace(/[<>&"]/g, "");
  win.document.write(`<!DOCTYPE html><html><head><title>${safeTitle}</title>
<style>@page{margin:10mm}body{margin:0;font-family:system-ui,sans-serif}
.invoice-root{max-width:210mm;margin:0 auto}</style></head>
<body><div class="invoice-root">${el.innerHTML}</div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<${"/"}script></body></html>`);
  win.document.close();
  return true;
}

