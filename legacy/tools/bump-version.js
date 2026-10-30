const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];
if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error('Usage: node tools/bump-version.js <M.m.p>');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const versionJsonPath = path.join(root, 'tools', 'version.json');
const indexHtmlPath = path.join(root, 'index.html');
const swJsPath = path.join(root, 'sw.js');
const appJsPath = path.join(root, 'js', 'app.js');

// 1. Update tools/version.json
fs.writeFileSync(versionJsonPath, JSON.stringify({ version: newVersion }, null, 2) + '\n', 'utf8');
console.log(`[bump-version] Updated tools/version.json to ${newVersion}`);

// 2. Update index.html query params
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
indexHtml = indexHtml.replace(/\?v=[0-9.]+/g, `?v=${newVersion}`);
fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
console.log(`[bump-version] Updated index.html ?v= to ${newVersion}`);

// 3. Update sw.js CACHE name and SHELL asset versions
const cacheDashed = newVersion.replace(/\./g, '-');
let swJs = fs.readFileSync(swJsPath, 'utf8');
swJs = swJs.replace(/const CACHE\s*=\s*'kivu-v[0-9-]+-shell';/, `const CACHE='kivu-v${cacheDashed}-shell';`);
swJs = swJs.replace(/\?v=[0-9.]+/g, `?v=${newVersion}`);
fs.writeFileSync(swJsPath, swJs, 'utf8');
console.log(`[bump-version] Updated sw.js (CACHE: kivu-v${cacheDashed}-shell, ?v=${newVersion})`);

// 4. Update js/app.js service worker registration string
let appJs = fs.readFileSync(appJsPath, 'utf8');
appJs = appJs.replace(/\.\/sw\.js\?v=[0-9.]+/g, `./sw.js?v=${newVersion}`);
fs.writeFileSync(appJsPath, appJs, 'utf8');
console.log(`[bump-version] Updated js/app.js SW register query to ${newVersion}`);

console.log(`[bump-version] Successfully aligned all files to version ${newVersion}`);
