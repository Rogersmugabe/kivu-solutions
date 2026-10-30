const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appJs = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');

const between = (start, end) => {
  const a = appJs.indexOf(start);
  const b = appJs.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`Could not extract block starting at: ${start}`);
  return appJs.slice(a, b);
};

const memoryStorage = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};

test('S01: no inline event handler splices escaped user text into JavaScript', () => {
  const risky = appJs.match(/on[a-z]+="[^"]*\$\{esc\(/g) || [];
  assert.deepEqual(risky, []);
  assert.equal(appJs.includes('safeJsName'), false);
});

test('S02: delegated actions pass hostile strings as plain data and ignore non-allow-listed handlers', () => {
  const block = between('const KIVU_SAFE_ACTIONS', '/* GLOBAL KEYBOARD ACCESSIBILITY');
  let clickListener = null;
  const calls = [];
  const sandbox = {
    window: {
      openCustomerLedgerByName: arg => calls.push(['ledger', arg]),
      kivuEvil: () => calls.push(['evil'])
    },
    document: { addEventListener: (type, fn) => { if (type === 'click') clickListener = fn; } }
  };
  vm.runInNewContext(block, sandbox);
  assert.equal(typeof clickListener, 'function');

  const hostile = "x');alert(1);//\" onmouseover=\"alert(2)";
  const fakeTarget = action => ({ closest: () => ({ dataset: { kivuAction: action, kivuArg: hostile } }) });
  clickListener({ target: fakeTarget('openCustomerLedgerByName') });
  clickListener({ target: fakeTarget('kivuEvil') });

  assert.deepEqual(calls, [['ledger', hostile]]);
});

test('S03: PIN unlock and supervisor override never sign in on the main client', () => {
  const unlock = between('window.unlockTerminalWithPin = async function', '// Wire Lock Keypad');
  const override = between('window.authorizeSupervisorOverride = async function', "$('#supervisorAuthorizeBtn')");
  assert.equal(unlock.includes('sb.auth.signInWithPassword'), false);
  assert.equal(override.includes('sb.auth.signInWithPassword'), false);
  assert.ok(override.includes("signOut({ scope: 'local' })"), 'temporary supervisor session must be revoked');

  const verifier = between('function getPinVerifierClient()', 'async function verifyStaffPin');
  assert.ok(verifier.includes('persistSession: false'));
  assert.ok(verifier.includes('autoRefreshToken: false'));
});

test('S04: terminal lock persists across reloads and clears on unlock / sign-out', () => {
  const block = between('var kivuTerminalLocked = false;', "$('#terminalLockModal')?.addEventListener('cancel'");
  const shown = [];
  const modal = { open: false, showModal() { this.open = true; shown.push('lock'); } };
  const storage = memoryStorage();
  const make = () => {
    const ctx = {
      shop: { id: 'shop-1', name: 'Test Shop' },
      localStorage: storage,
      document: { getElementById: id => (id === 'terminalLockModal' ? modal : null) }
    };
    vm.runInNewContext(block + '\nthis.api={isTerminalLocked,setTerminalLockFlag,clearTerminalLock,restoreTerminalLock};', ctx);
    return ctx.api;
  };

  const first = make();
  assert.equal(first.isTerminalLocked(), false);
  first.setTerminalLockFlag();

  // Simulated page reload: fresh in-memory state, same storage.
  modal.open = false;
  const reloaded = make();
  assert.equal(reloaded.isTerminalLocked(), true);
  reloaded.restoreTerminalLock();
  assert.equal(modal.open, true);

  reloaded.clearTerminalLock();
  assert.equal(make().isTerminalLocked(), false);
});

test('S05: Escape, backdrop clicks and shortcuts cannot dismiss or bypass the lock screen', () => {
  const keyHandler = between("window.addEventListener('keydown', e => {", "} else if (e.key === 'Escape') {");
  assert.ok(keyHandler.includes('isTerminalLocked()'));
  assert.ok(keyHandler.includes('stopImmediatePropagation'));
  assert.ok(appJs.includes("d.id!=='terminalLockModal'"), 'backdrop click must skip the lock dialog');
  assert.ok(appJs.includes("addEventListener('cancel', e => { if (isTerminalLocked()) e.preventDefault(); })"));
  assert.ok(appJs.includes("$('#terminalLockModal')?.addEventListener('close'"), 'lock must re-open if closed while locked');
});

test('S06: F2 point-of-sale shortcut requires a signed-in sales role', () => {
  const f2 = between("if (e.key === 'F2') {", "const modal = $('#saleModal');");
  assert.ok(f2.includes('if (!session || !profile) return;'));
  assert.ok(f2.includes("can('owner', 'manager', 'cashier')"));
});

test('S07: repeated wrong PINs trigger a temporary device lockout', () => {
  const block = between('const PIN_MAX_ATTEMPTS', 'let terminalPinBuffer');
  const ctx = { shop: { id: 'shop-1' }, localStorage: memoryStorage(), Date, Math, JSON };
  vm.runInNewContext(block + '\nthis.api={pinLockoutSeconds,recordPinFailure,resetPinThrottle};', ctx);
  const { pinLockoutSeconds, recordPinFailure, resetPinThrottle } = ctx.api;
  for (let i = 0; i < 4; i++) recordPinFailure('unlock');
  assert.equal(pinLockoutSeconds('unlock'), 0);
  recordPinFailure('unlock');
  assert.ok(pinLockoutSeconds('unlock') > 0);
  assert.equal(pinLockoutSeconds('override'), 0, 'throttles are tracked per PIN pad');
  resetPinThrottle('unlock');
  assert.equal(pinLockoutSeconds('unlock'), 0);
});
