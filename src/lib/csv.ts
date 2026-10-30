/** Builds a CSV file from rows and triggers a download. */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const q = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const csv = [keys.map(q).join(','), ...rows.map(r => keys.map(k => q(r[k])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Parses CSV text with a header row (quoted fields, CRLF or LF line endings). */
export function parseCsv(text: string): Record<string, string>[] {
  const out: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"') { if (quoted && n === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && n === '\n') i++;
      row.push(cell); if (row.some(x => x.trim())) out.push(row); row = []; cell = '';
    } else cell += c;
  }
  row.push(cell); if (row.some(x => x.trim())) out.push(row);
  if (out.length < 2) return [];
  const head = out[0].map(h => h.trim().toLowerCase().replace(/^﻿/, ''));
  return out.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}
