const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const dsCss = fs.readFileSync(path.join(root, 'css', 'kivu-ds.css'), 'utf8');

const between = (start, end) => {
  const a = appJs.indexOf(start);
  const b = appJs.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`Could not extract block starting at: ${start}`);
  return appJs.slice(a, b);
};

test('V01: design system stylesheet loads after the legacy stylesheet and is cached offline', () => {
  const legacy = indexHtml.indexOf('css/style.css');
  const ds = indexHtml.indexOf('css/kivu-ds.css');
  assert.ok(legacy > 0 && ds > legacy, 'kivu-ds.css must be linked after style.css');
  assert.match(swJs, /'\.\/css\/kivu-ds\.css\?v=[0-9.]+'/);
});

test('V02: phone bottom navigation is hidden while the sign-in screen is shown', () => {
  assert.ok(dsCss.includes('#appShell.hidden ~ .mobile-bottom-nav { display: none !important; }'));
  assert.ok(indexHtml.indexOf('id="appShell"') < indexHtml.indexOf('class="mobile-bottom-nav'), 'sibling selector relies on DOM order');
});

test('V03: sales category pills and channel cards are wired', () => {
  assert.ok(appJs.includes('window.filterSalesCategory=function(cat)'));
  for (const id of ['salesCashToday', 'salesMomoToday', 'salesBankToday', 'salesCreditToday']) {
    assert.ok(appJs.includes(`'#${id}'`), `${id} must be written by renderSalesChannelCards`);
  }
});

test('V04: CSV import splits Windows (CRLF) and Unix line endings identically', () => {
  const fn = appJs.match(/function parseCsv\(text\)\{[\s\S]*?\n/)[0];
  const ctx = {};
  vm.runInNewContext(fn + '\nthis.parseCsv=parseCsv;', ctx);
  const crlf = ctx.parseCsv('name,price\r\nRice,7500\r\n"Sugar, 1kg",1600\r\n');
  const lf = ctx.parseCsv('name,price\nRice,7500\n"Sugar, 1kg",1600\n');
  assert.equal(JSON.stringify(crlf), JSON.stringify(lf));
  assert.equal(crlf[0].price, '7500');
  assert.equal(crlf[1].name, 'Sugar, 1kg');
});

test('V05: day bucketing and minute-of-day use Africa/Kigali whatever the device zone', () => {
  const helpers = appJs.match(/const pad2=[^\n]+\n[\s\S]*?const day=localDay;/)[0];
  const minute = between('const kigaliTimeFmt=', 'function setKpiDelta');
  const ctx = { Intl, Date, Number };
  vm.runInNewContext(helpers + '\n' + minute + '\nthis.api={day,kigaliMinuteOfDay};', ctx);
  // 22:30 UTC is 00:30 the next day in Kigali
  assert.equal(ctx.api.day('2026-10-29T22:30:00Z'), '2026-10-30');
  assert.equal(ctx.api.kigaliMinuteOfDay('2026-10-29T22:30:00Z'), 30);
});

test('V06: KPI comparison labels are honest about direction and missing baselines', () => {
  const block = between('function setKpiDelta', 'function renderDashboardInsights');
  const ctx = {};
  vm.runInNewContext(block + '\nthis.setKpiDelta=setKpiDelta;', ctx);
  const el = () => {
    const classes = new Set(['hidden']);
    return { textContent: '', classList: { add: (...c) => c.forEach(x => classes.add(x)), remove: (...c) => c.forEach(x => classes.delete(x)), has: c => classes.has(c) } };
  };
  const a = el(); ctx.setKpiDelta(a, 0, 0);
  assert.ok(a.classList.has('hidden'), 'no data on either day hides the badge');
  const b = el(); ctx.setKpiDelta(b, 1500, 1000);
  assert.equal(b.textContent, '▲ 50% vs yesterday'); assert.ok(b.classList.has('up'));
  const c = el(); ctx.setKpiDelta(c, 1500, 1000, { higherIsGood: false });
  assert.ok(c.classList.has('down'), 'rising expenses are flagged as bad');
  const d = el(); ctx.setKpiDelta(d, 500, 0);
  assert.equal(d.textContent, '▲ New vs yesterday');
});

test('V07: Escape is handled natively per dialog instead of closing the first open dialog', () => {
  const esc = between("} else if (e.key === 'Escape') {", "} else if");
  assert.equal(esc.includes('.close()'), false);
  assert.ok(appJs.includes("d.addEventListener('cancel',()=>{"));
});

test('V08: owner device list is rendered by the active Settings renderer', () => {
  const last = appJs.lastIndexOf('renderSettingsV41=function(){');
  assert.ok(appJs.slice(last, appJs.indexOf('};', last)).includes('renderOwnerDevices()'));
  assert.equal((appJs.match(/^function renderDukaAdmin\(/gm) || []).length, 1);
});

test('V09: no static inline styles outside compatibility anchors and JS-driven sizes', () => {
  const htmlStyles = (indexHtml.match(/style="[^"]*"/g) || [])
    .filter(s => !/^style="display:none!important;?"$/.test(s) && s !== 'style="width:0%"');
  assert.deepEqual(htmlStyles, [], 'move presentation into css/kivu-ds.css');
  const jsStyles = (appJs.match(/style="[^"]*"/g) || []).filter(s => !s.includes('${'));
  assert.deepEqual(jsStyles, [], 'templates may only use style="" for computed values');
});

test('V10: multi-line card buttons are exempt from the single-line button rule', () => {
  assert.ok(dsCss.includes('.btn.btn-role-sim, .btn.quick-action-card'));
  assert.match(dsCss, /\.btn\.btn-role-sim[^{]*\{[^}]*white-space: normal/);
});

test('V11: print buttons print one full-length document instead of a screen-sized slice', () => {
  for (const [btn, id] of [["#printReceiptBtn').onclick", 'receiptModal'], ["#printZReportBtn')?.addEventListener('click'", 'zReportModal'], ["#printLedgerBtn'); if(prBtn) prBtn.onclick", 'customerLedgerModal']]) {
    const at = appJs.indexOf(btn);
    assert.ok(at > 0, `${btn} handler present`);
    assert.ok(appJs.slice(at, at + 120).includes(`kivuPrintDialog('${id}')`), `${btn} must print ${id} via kivuPrintDialog`);
  }
  assert.ok(appJs.includes("window.addEventListener('beforeprint'"), 'Ctrl+P picks the open document');
  assert.ok(appJs.includes("$$('dialog.print-target').forEach"), 'clearing must iterate all marked dialogs');
  const print = dsCss.slice(dsCss.lastIndexOf('@media print'));
  assert.ok(print.includes('body.kivu-printing > *:not(dialog.print-target) { display: none !important; }'));
  assert.match(print, /dialog\.print-target \{[^}]*max-height: none !important;[^}]*overflow: visible !important;/);
  assert.match(print, /#receiptContent,[\s\S]*?position: static !important;/);
});
