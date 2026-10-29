const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
let hasError = false;

function logError(msg) {
  console.error(`❌ [ERROR] ${msg}`);
  hasError = true;
}

function logOk(msg) {
  console.log(`✅ [OK] ${msg}`);
}

function logInfo(msg) {
  console.log(`ℹ️ [INFO] ${msg}`);
}

// -------------------------------------------------------------
// 1. Syntax Check via `node -c`
// -------------------------------------------------------------
console.log('\n--- 1. JavaScript Syntax Check ---');
const jsFiles = [
  'sw.js',
  'js/app.js',
  'js/config.js',
  'js/offline-queue.js',
  'js/camera-scanner.js',
  'js/pwa-install.js',
  'tools/bump-version.js'
];

for (const rel of jsFiles) {
  const full = path.join(root, rel);
  if (fs.existsSync(full)) {
    try {
      execFileSync(process.execPath, ['-c', full]);
      logOk(`Syntax valid: ${rel}`);
    } catch (e) {
      logError(`Syntax error in ${rel}: ${e.message}`);
    }
  }
}

// -------------------------------------------------------------
// 2. Version Consistency Check
// -------------------------------------------------------------
console.log('\n--- 2. Version Consistency Check ---');
const versionJsonPath = path.join(root, 'tools', 'version.json');
let expectedVersion = '5.2.1';
if (fs.existsSync(versionJsonPath)) {
  try {
    const vData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
    expectedVersion = vData.version;
    logInfo(`Expected asset version: ${expectedVersion}`);
  } catch (e) {
    logError(`tools/version.json malformed: ${e.message}`);
  }
} else {
  logError('tools/version.json missing');
}

// Check index.html
const indexHtmlPath = path.join(root, 'index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const indexVersions = [...indexHtml.matchAll(/\?v=([0-9.]+)/g)].map(m => m[1]);
const mismatchedIndex = indexVersions.filter(v => v !== expectedVersion);
if (mismatchedIndex.length > 0) {
  logError(`index.html contains mismatched ?v=: found ${[...new Set(mismatchedIndex)].join(', ')} (expected ${expectedVersion})`);
} else {
  logOk(`index.html asset query strings match ${expectedVersion} (${indexVersions.length} instances)`);
}

// Check sw.js
const swJsPath = path.join(root, 'sw.js');
const swJs = fs.readFileSync(swJsPath, 'utf8');
const expectedCache = `kivu-v${expectedVersion.replace(/\./g, '-')}-shell`;
const cacheMatch = swJs.match(/const CACHE\s*=\s*'([^']+)'/);
if (!cacheMatch || cacheMatch[1] !== expectedCache) {
  logError(`sw.js CACHE name mismatch: found "${cacheMatch ? cacheMatch[1] : 'none'}" (expected "${expectedCache}")`);
} else {
  logOk(`sw.js CACHE name matches: ${expectedCache}`);
}
const swVersions = [...swJs.matchAll(/\?v=([0-9.]+)/g)].map(m => m[1]);
const mismatchedSw = swVersions.filter(v => v !== expectedVersion);
if (mismatchedSw.length > 0) {
  logError(`sw.js contains mismatched asset versions: ${[...new Set(mismatchedSw)].join(', ')}`);
} else {
  logOk(`sw.js SHELL assets match version ${expectedVersion}`);
}

// Check app.js SW register
const appJsPath = path.join(root, 'js', 'app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');
const appSwMatch = appJs.match(/navigator\.serviceWorker\.register\('\.\/sw\.js\?v=([0-9.]+)'/);
if (!appSwMatch) {
  logError('Could not find navigator.serviceWorker.register with ?v= in js/app.js');
} else if (appSwMatch[1] !== expectedVersion) {
  logError(`app.js SW registration version drift: found ?v=${appSwMatch[1]} (expected ?v=${expectedVersion})`);
} else {
  logOk(`app.js SW registration version matches: ${expectedVersion}`);
}

// -------------------------------------------------------------
// 3. HTML DOM IDs & Baseline Protection
// -------------------------------------------------------------
console.log('\n--- 3. DOM IDs Baseline Audit ---');
const htmlIdRegex = /\bid\s*=\s*["']([^"']+)["']/g;
const htmlIds = new Set();
let match;
while ((match = htmlIdRegex.exec(indexHtml)) !== null) {
  htmlIds.add(match[1]);
}
logInfo(`Total unique DOM IDs in index.html: ${htmlIds.size}`);

const baselineIdsPath = path.join(root, 'tools', 'baseline-ids.json');
if (!fs.existsSync(baselineIdsPath)) {
  const sortedIds = [...htmlIds].sort();
  fs.writeFileSync(baselineIdsPath, JSON.stringify(sortedIds, null, 2) + '\n', 'utf8');
  logOk(`Created tools/baseline-ids.json with ${sortedIds.length} IDs`);
} else {
  const baselineIds = JSON.parse(fs.readFileSync(baselineIdsPath, 'utf8'));
  const missingFromHtml = baselineIds.filter(id => !htmlIds.has(id));
  if (missingFromHtml.length > 0) {
    logError(`CRITICAL RULE 1 VIOLATION: Baseline DOM IDs missing from index.html: ${missingFromHtml.join(', ')}`);
  } else {
    logOk(`All ${baselineIds.length} baseline DOM IDs preserved in index.html`);
  }
}

// -------------------------------------------------------------
// 4. Supabase RPC Calls Baseline Audit
// -------------------------------------------------------------
console.log('\n--- 4. Supabase RPC Baseline Audit ---');
const rpcRegex = /\.rpc\(\s*['"]([a-zA-Z0-9_]+)['"]/g;
const appRpcs = new Set();
while ((match = rpcRegex.exec(appJs)) !== null) {
  appRpcs.add(match[1]);
}
logInfo(`Total distinct RPCs called in js/app.js: ${appRpcs.size}`);

const baselineRpcsPath = path.join(root, 'tools', 'baseline-rpcs.json');
if (!fs.existsSync(baselineRpcsPath)) {
  const sortedRpcs = [...appRpcs].sort();
  fs.writeFileSync(baselineRpcsPath, JSON.stringify(sortedRpcs, null, 2) + '\n', 'utf8');
  logOk(`Created tools/baseline-rpcs.json with ${sortedRpcs.length} RPCs`);
} else {
  const baselineRpcs = JSON.parse(fs.readFileSync(baselineRpcsPath, 'utf8'));
  const missingRpcs = baselineRpcs.filter(rpc => !appRpcs.has(rpc));
  if (missingRpcs.length > 0) {
    logError(`CRITICAL RULE 1 VIOLATION: Baseline RPCs missing from js/app.js: ${missingRpcs.join(', ')}`);
  } else {
    logOk(`All ${baselineRpcs.length} baseline RPCs preserved in js/app.js`);
  }
}

// -------------------------------------------------------------
// 5. Codebase Metrics & Pattern Checks
// -------------------------------------------------------------
console.log('\n--- 5. Pattern & Metric Audit ---');
// Count alert, confirm, prompt in app.js (excluding comments)
const codeLines = appJs.split('\n').filter(l => !l.trim().startsWith('//'));
const codeText = codeLines.join('\n');
const alertCount = (codeText.match(/\balert\s*\(/g) || []).length;
const confirmCount = (codeText.match(/\bconfirm\s*\(/g) || []).length;
const promptCount = (codeText.match(/\bprompt\s*\(/g) || []).length;
const toIsoSliceCount = (codeText.match(/toISOString\(\)\.slice\(0,\s*10\)/g) || []).length;

logInfo(`Native dialogs in js/app.js: alert=${alertCount}, confirm=${confirmCount}, prompt=${promptCount}`);
logInfo(`UTC date slicing (toISOString().slice(0, 10)) count: ${toIsoSliceCount}`);

// Check if forbidden patterns enforcement is required (e.g. env var STRICT_PATTERNS=true)
if (process.env.STRICT_PATTERNS === 'true') {
  if (alertCount > 0 || confirmCount > 0 || promptCount > 0) {
    logError(`Strict check failed: native alert/confirm/prompt still present in js/app.js`);
  }
  if (toIsoSliceCount > 0) {
    logError(`Strict check failed: toISOString().slice(0, 10) still present in js/app.js`);
  }
}

// Summary
console.log('\n--- Audit Summary ---');
if (hasError) {
  console.error('❌ Check FAILED. Fix issues above.');
  process.exit(1);
} else {
  console.log('✅ All checks PASSED successfully.');
  process.exit(0);
}
