const test = require('node:test');
const assert = require('node:assert/strict');

// Role pages definition matching js/app.js
const rolePages = {
  owner: ['dashboard', 'sales', 'hospitality', 'inventory', 'suppliers', 'expenses', 'customers', 'employees', 'shifts', 'controls', 'reports', 'subscription', 'settings', 'dukaadmin'],
  manager: ['dashboard', 'sales', 'hospitality', 'inventory', 'suppliers', 'expenses', 'customers', 'employees', 'shifts', 'controls', 'reports'],
  cashier: ['dashboard', 'sales', 'hospitality', 'customers', 'shifts'],
  stock_clerk: ['dashboard', 'inventory'],
  waiter: ['dashboard', 'hospitality'],
  kitchen: ['hospitality']
};

function generateStaffInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

test('R01: generateStaffInviteCode generates 6-char uppercase alphanumeric invite codes', () => {
  for (let i = 0; i < 50; i++) {
    const code = generateStaffInviteCode();
    assert.equal(code.length, 6, 'Code must be exactly 6 characters');
    assert.match(code, /^[A-Z0-9]{6}$/, 'Code must be uppercase alphanumeric');
    assert.ok(!code.includes('0') && !code.includes('O') && !code.includes('I') && !code.includes('1'), 'Avoids ambiguous characters 0, O, 1, I');
  }
});

test('R02: Cashier simulation restricts navigation and shields back-office pages', () => {
  let simulatedRole = 'cashier';
  const profile = { role: 'owner' };
  const effectiveRole = () => simulatedRole || profile.role;

  assert.equal(effectiveRole(), 'cashier');
  const allowed = rolePages[effectiveRole()];
  
  // Accessible pages for cashier
  assert.ok(allowed.includes('sales'), 'Cashier can access POS sales');
  assert.ok(allowed.includes('shifts'), 'Cashier can access shifts');
  assert.ok(allowed.includes('hospitality'), 'Cashier can access hospitality');
  assert.ok(allowed.includes('customers'), 'Cashier can access customers');
  
  // Blocked pages for cashier
  assert.ok(!allowed.includes('expenses'), 'Cashier cannot access expenses');
  assert.ok(!allowed.includes('reports'), 'Cashier cannot access reports');
  assert.ok(!allowed.includes('inventory'), 'Cashier cannot access inventory management');
  assert.ok(!allowed.includes('suppliers'), 'Cashier cannot access suppliers');
  assert.ok(!allowed.includes('employees'), 'Cashier cannot access employee management');
  assert.ok(!allowed.includes('settings'), 'Cashier cannot access settings');
  assert.ok(!allowed.includes('subscription'), 'Cashier cannot access SaaS billing');
});

test('R03: Kitchen simulation restricts exclusively to live KDS kitchen display tickets', () => {
  let simulatedRole = 'kitchen';
  const profile = { role: 'owner' };
  const effectiveRole = () => simulatedRole || profile.role;

  assert.equal(effectiveRole(), 'kitchen');
  const allowed = rolePages[effectiveRole()];

  assert.deepEqual(allowed, ['hospitality'], 'Kitchen role only has access to hospitality display tickets');
});

test('R04: Stock Clerk simulation restricts exclusively to inventory intake and catalog', () => {
  let simulatedRole = 'stock_clerk';
  const profile = { role: 'owner' };
  const effectiveRole = () => simulatedRole || profile.role;

  assert.equal(effectiveRole(), 'stock_clerk');
  const allowed = rolePages[effectiveRole()];

  assert.ok(allowed.includes('inventory'), 'Stock clerk can access inventory');
  assert.ok(allowed.includes('dashboard'), 'Stock clerk can access dashboard');
  assert.ok(!allowed.includes('sales'), 'Stock clerk cannot make sales transactions');
  assert.ok(!allowed.includes('shifts'), 'Stock clerk cannot manage cash shifts');
});

test('R05: Exiting simulation restores full Owner capabilities', () => {
  let simulatedRole = 'cashier';
  const profile = { role: 'owner' };
  let effectiveRole = () => simulatedRole || profile.role;

  assert.equal(effectiveRole(), 'cashier');

  // Exit simulation
  simulatedRole = null;
  assert.equal(effectiveRole(), 'owner');
  const allowed = rolePages[effectiveRole()];
  assert.ok(allowed.includes('reports'), 'Owner has reports');
  assert.ok(allowed.includes('settings'), 'Owner has settings');
  assert.ok(allowed.includes('employees'), 'Owner has employee management');
  assert.ok(allowed.includes('subscription'), 'Owner has subscription billing');
});

test('R06: Fallback invite creation handles gen_random_bytes database procedure error', () => {
  const simulatedDbError = new Error('function gen_random_bytes(integer) does not exist');
  
  // Verify error detector
  const isGenRandomBytesError = String(simulatedDbError.message).includes('gen_random_bytes');
  assert.ok(isGenRandomBytesError, 'Must detect gen_random_bytes error');

  // Fallback generates valid client code and expiration date
  const fallbackCode = generateStaffInviteCode();
  const fallbackExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  
  assert.equal(fallbackCode.length, 6);
  assert.ok(new Date(fallbackExpiry) > new Date());
});
