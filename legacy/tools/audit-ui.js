const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const pwaJs = fs.existsSync(path.join(root, 'js', 'pwa-install.js')) ? fs.readFileSync(path.join(root, 'js', 'pwa-install.js'), 'utf8') : '';
const cameraJs = fs.existsSync(path.join(root, 'js', 'camera-scanner.js')) ? fs.readFileSync(path.join(root, 'js', 'camera-scanner.js'), 'utf8') : '';

const allJs = appJs + '\n' + pwaJs + '\n' + cameraJs;

// -------------------------------------------------------------
// 1. Audit Controls in index.html
// -------------------------------------------------------------
const items = [];

function cleanText(t) {
  return t ? t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
}

function findHandlerEvidence(tagStr, id, attrs, formId) {
  const evidences = [];

  const dataOpen = attrs.match(/\bdata-open\s*=\s*["']([^"']+)["']/i)?.[1];
  const dataPage = attrs.match(/\bdata-page\s*=\s*["']([^"']+)["']/i)?.[1];
  const dataMobilePage = attrs.match(/\bdata-mobile-page\s*=\s*["']([^"']+)["']/i)?.[1];
  const dataMobileMore = attrs.match(/\bdata-mobile-more\s*=\s*["']([^"']+)["']/i)?.[1];
  const dataPlan = attrs.match(/\bdata-plan\s*=\s*["']([^"']+)["']/i)?.[1];
  const onclick = attrs.match(/\bonclick\s*=\s*["']([^"']+)["']/i)?.[1];

  if (dataOpen) evidences.push(`[data-open="${dataOpen}"]`);
  if (dataPage) evidences.push(`[data-page="${dataPage}"]`);
  if (dataMobilePage) evidences.push(`[data-mobile-page="${dataMobilePage}"]`);
  if (dataMobileMore) evidences.push(`[data-mobile-more="${dataMobileMore}"]`);
  if (dataPlan) evidences.push(`[data-plan="${dataPlan}"]`);
  if (onclick) evidences.push(`onclick="${onclick.replace(/"/g, '&quot;')}"`);
  if (attrs.includes('cancel-btn')) evidences.push('cancel-btn dialog closer');

  if (id) {
    if (allJs.includes(`$('#${id}')`) || allJs.includes(`getElementById('${id}')`) || allJs.includes(`id === '${id}'`) || allJs.includes(`id==='${id}'`)) {
      evidences.push(`referenced by #${id} in JS`);
    }
    const listenerRegex = new RegExp(`(?:\\$|document\\.querySelector|getElementById)\\(['"#]?${id}['"]?\\)\\s*\\.(?:onclick|addEventListener|onsubmit)`);
    if (listenerRegex.test(allJs)) {
      evidences.push(`explicit listener on #${id}`);
    }
  }

  if (attrs.includes('type="submit"') && formId) {
    evidences.push(`submit button for form #${formId}`);
  } else if (formId && (allJs.includes(`$('#${formId}')`) || allJs.includes(`getElementById('${formId}')`))) {
    evidences.push(`inside form #${formId} handled in JS`);
  }

  return evidences;
}

// 1. Buttons
const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
let m;
while ((m = buttonRegex.exec(indexHtml)) !== null) {
  const attrs = m[1];
  const inner = cleanText(m[2]) || '[icon]';
  const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
  
  // Find enclosing form id if any
  const upToIndex = indexHtml.lastIndexOf('<form', m.index);
  let formId = null;
  if (upToIndex !== -1) {
    const nextFormClose = indexHtml.indexOf('</form>', upToIndex);
    if (nextFormClose > m.index) {
      const formTag = indexHtml.slice(upToIndex, indexHtml.indexOf('>', upToIndex) + 1);
      const formIdMatch = formTag.match(/\bid\s*=\s*["']([^"']+)["']/i);
      if (formIdMatch) formId = formIdMatch[1];
    }
  }

  const id = idMatch ? idMatch[1] : '';
  const evidences = findHandlerEvidence(m[0], id, attrs, formId);
  const status = evidences.length > 0 ? 'BOUND' : 'UNBOUND';

  items.push({
    kind: 'button',
    id: id || '(no id)',
    label: inner.slice(0, 40),
    evidence: evidences.join('; ') || 'None',
    status
  });
}

// 2. Dialogs
const dialogRegex = /<dialog\b([^>]*)>/gi;
while ((m = dialogRegex.exec(indexHtml)) !== null) {
  const attrs = m[1];
  const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
  const id = idMatch ? idMatch[1] : '(no id)';
  const inJs = allJs.includes(id);
  const openCount = (indexHtml.match(new RegExp(`data-open=["']${id}["']`, 'g')) || []).length;
  const evidence = `open count in HTML: ${openCount}; in JS: ${inJs ? 'yes' : 'no'}`;
  items.push({
    kind: 'dialog',
    id,
    label: id,
    evidence,
    status: (inJs || openCount > 0) ? 'BOUND' : 'UNBOUND'
  });
}

// 3. Forms
const formRegex = /<form\b([^>]*)>/gi;
while ((m = formRegex.exec(indexHtml)) !== null) {
  const attrs = m[1];
  const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
  const id = idMatch ? idMatch[1] : '(no id)';
  const inJs = allJs.includes(id);
  items.push({
    kind: 'form',
    id,
    label: id,
    evidence: inJs ? `handled in JS` : 'None',
    status: inJs ? 'BOUND' : 'UNBOUND'
  });
}

// 4. Pages
const pageRegex = /<div\b[^>]*\bid=["'](page-[^"']+)["'][^>]*>/gi;
while ((m = pageRegex.exec(indexHtml)) !== null) {
  const pageId = m[1];
  const pageName = pageId.replace('page-', '');
  const inJs = allJs.includes(pageName);
  items.push({
    kind: 'page',
    id: pageId,
    label: pageName,
    evidence: inJs ? `routed in app.js showPage` : 'None',
    status: inJs ? 'BOUND' : 'UNBOUND'
  });
}

// Generate docs/ui-audit.md
let md = `# Kivu Solutions UI Audit Report\n\n`;
md += `Generated: ${new Date().toISOString()}\n`;
md += `Total Controls & Surfaces Audited: ${items.length}\n`;
const unboundCount = items.filter(i => i.status === 'UNBOUND').length;
md += `Bound: ${items.length - unboundCount} | Unbound: ${unboundCount}\n\n`;

md += `| Kind | ID | Label / Context | Handler Evidence | Status |\n`;
md += `|---|---|---|---|---|\n`;
for (const item of items) {
  const statusIcon = item.status === 'BOUND' ? '✅' : '⚠️ UNBOUND';
  md += `| ${item.kind} | \`${item.id}\` | ${item.label.replace(/\|/g, '/')} | ${item.evidence.replace(/\|/g, '/')} | ${statusIcon} |\n`;
}

fs.writeFileSync(path.join(root, 'docs', 'ui-audit.md'), md, 'utf8');
console.log(`[audit-ui] Wrote docs/ui-audit.md (${items.length} items, ${unboundCount} unbound)`);

// -------------------------------------------------------------
// 2. RPC Contract Generation (docs/rpc-contract.md)
// -------------------------------------------------------------
const rpcCallRegex = /\.rpc\(\s*['"]([a-zA-Z0-9_]+)['"](?:\s*,\s*(\{[\s\S]*?\}))?\s*\)/g;
const rpcMap = new Map();

let rpcMatch;
while ((rpcMatch = rpcCallRegex.exec(appJs)) !== null) {
  const name = rpcMatch[1];
  const rawArgs = rpcMatch[2] || '{}';
  const argKeys = [...rawArgs.matchAll(/([a-zA-Z0-9_]+)\s*:/g)].map(x => x[1]);
  
  if (!rpcMap.has(name)) {
    rpcMap.set(name, {
      name,
      callCount: 0,
      argumentKeys: new Set()
    });
  }
  const entry = rpcMap.get(name);
  entry.callCount++;
  argKeys.forEach(k => entry.argumentKeys.add(k));
}

let rpcMd = `# Kivu Solutions — Supabase RPC Contract\n\n`;
rpcMd += `Generated: ${new Date().toISOString()}\n`;
rpcMd += `Total Distinct RPCs: ${rpcMap.size}\n\n`;
rpcMd += `| # | RPC Name | Call Count in app.js | Expected Parameter Keys |\n`;
rpcMd += `|---|---|---|---|\n`;

let idx = 1;
for (const [name, data] of [...rpcMap.entries()].sort((a,b) => a[0].localeCompare(b[0]))) {
  const args = [...data.argumentKeys].join(', ') || '(none)';
  rpcMd += `| ${idx++} | \`${name}\` | ${data.callCount} | \`${args}\` |\n`;
}

fs.writeFileSync(path.join(root, 'docs', 'rpc-contract.md'), rpcMd, 'utf8');
console.log(`[audit-ui] Wrote docs/rpc-contract.md (${rpcMap.size} RPCs)`);
