import type { BulkPass } from '@aiaia/api';
import { passQrSvg } from './pass-actions';

/** Passes per A4 sheet: 2 columns x 4 rows. */
export const PASSES_PER_PAGE = 8;

/** Splits the passes into A4 pages of PASSES_PER_PAGE, in order. */
export function chunkPages<T>(rows: readonly T[], perPage = PASSES_PER_PAGE): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));
  return pages;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The printable document: one `.page` per 8 passes, each pass a cut-out card with the name,
 * branch and the static signed QR. `svgs[i]` is the QR of `passes[i]` (from passQrSvg).
 */
export function sheetHtml(
  title: string,
  passes: readonly BulkPass[],
  svgs: readonly string[],
): string {
  const pages = chunkPages(passes.map((p, i) => ({ p, svg: svgs[i] ?? '' })));
  const body = pages
    .map(
      (page) =>
        `<section class="page">${page
          .map(
            ({ p, svg }) =>
              `<div class="pass"><div class="qr">${svg}</div><div class="name">${escapeHtml(
                p.full_name,
              )}</div><div class="branch">${escapeHtml(p.branch_name)}</div><div class="foot">AIAIA delegate pass</div></div>`,
          )
          .join('')}</section>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page{size:A4;margin:10mm}
*{box-sizing:border-box}
body{margin:0;font-family:sans-serif;color:#000;background:#fff}
.page{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4,1fr);gap:4mm;height:277mm;break-after:page;page-break-after:always}
.page:last-child{break-after:auto;page-break-after:auto}
.pass{border:1px dashed #888;padding:3mm;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}
.qr{width:42mm;height:42mm}.qr svg{width:100%;height:100%}
.name{font-weight:bold;font-size:12pt;margin-top:2mm;text-align:center}
.branch,.foot{font-size:9pt;text-align:center}
</style></head><body>${body}</body></html>`;
}

/**
 * Web only: builds the sheet and opens the browser's print dialog from a hidden iframe, so nothing
 * is rendered or stored on a server. Resolves once the dialog has been handed the document.
 */
export async function printSheet(title: string, passes: readonly BulkPass[]): Promise<void> {
  const svgs = await Promise.all(passes.map((p) => passQrSvg(p.qr)));
  const html = sheetHtml(title, passes, svgs);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  // Remove after the dialog closes (print() blocks in most browsers; afterprint covers the rest).
  setTimeout(() => frame.remove(), 1000);
}
