const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Extract functions directly from live js/app.js
const appJs = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

const moneyMatch = appJs.match(/const money\s*=\s*[^;]+;/)?.[0];
const dayMatch = appJs.match(/(?:(?:const|let|var)\s+pad2[\s\S]*?)?(?:const|let|var)\s+day\s*=\s*[^;]+;/)?.[0];
const parseMoneyMatch = appJs.match(/function parseMoney\([\s\S]*?\n\}/)?.[0];
const formatMoneyMatch = appJs.match(/function formatMoneyString\([\s\S]*?\n\}/)?.[0];

if (!moneyMatch || !dayMatch || !parseMoneyMatch || !formatMoneyMatch) {
  throw new Error('Failed to extract helpers from js/app.js');
}

// Evaluate extracted code in safe context
const helperCode = `
  ${moneyMatch}
  ${parseMoneyMatch}
  ${formatMoneyMatch}
  ${dayMatch}
  return { money, parseMoney, formatMoneyString, day };
`;

const { money, parseMoney, formatMoneyString, day } = new Function(helperCode)();

test('T01: money(2000000) formats as integer RWF with commas', () => {
  // en-RW Intl produces comma-separated digits and ' RWF'
  const res = money(2000000);
  assert.equal(res.replace(/\u00a0/g, ' '), '2,000,000 RWF');
});

test('T02: money(1999.6) rounds correctly to 2,000 RWF', () => {
  const res = money(1999.6);
  assert.equal(res.replace(/\u00a0/g, ' '), '2,000 RWF');
});

test('T03: parseMoney("2,000,000") parses to 2000000', () => {
  assert.equal(parseMoney('2,000,000'), 2000000);
});

test('T04: parseMoney("") and invalid strings parse to 0', () => {
  assert.equal(parseMoney(''), 0);
  assert.equal(parseMoney('abc'), 0);
  assert.equal(parseMoney(null), 0);
});

test('T05: formatMoneyString formats numbers with thousands separators', () => {
  assert.equal(formatMoneyString('2000000'), '2,000,000');
  assert.equal(formatMoneyString(500), '500');
});

test('T06: day() timezone test - 22:30 UTC is 00:30 next day in Africa/Kigali (UTC+2)', () => {
  // 22:30Z on Oct 29 is 00:30 on Oct 30 in Rwanda
  assert.equal(day('2026-10-29T22:30:00Z'), '2026-10-30');
});

test('T07: day() daytime test', () => {
  assert.equal(day('2026-10-29T10:00:00Z'), '2026-10-29');
});

test('T08: day() leap year month-end boundary test', () => {
  // 23:30Z on Feb 29 2028 is 01:30 on Mar 1 2028 in Rwanda
  assert.equal(day('2028-02-29T23:30:00Z'), '2028-03-01');
});
