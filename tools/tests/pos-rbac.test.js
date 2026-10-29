const test = require('node:test');
const assert = require('node:assert/strict');

test('P01: non-owner staff are shielded from SaaS upgrade pricing modals', () => {
  let upgradeShown = false;
  let policyNotified = false;

  const showUpgrade = () => { upgradeShown = true; };
  const notify = (msg) => {
    if (msg.includes('restricted by store policy')) policyNotified = true;
  };

  const requireFeature = (feature, role) => {
    const hasFeature = false;
    if (hasFeature) return true;
    if (role && role !== 'owner') {
      notify('This capability is restricted by store policy. Please contact your store owner to enable it.');
      return false;
    }
    showUpgrade();
    return false;
  };

  // Cashier test
  assert.equal(requireFeature('controls', 'cashier'), false);
  assert.equal(policyNotified, true);
  assert.equal(upgradeShown, false);

  // Owner test
  policyNotified = false;
  assert.equal(requireFeature('controls', 'owner'), false);
  assert.equal(policyNotified, false);
  assert.equal(upgradeShown, true);
});

test('P02: blind cash drawer close hides expected cash total from cashier', () => {
  const calcShift = (s) => ({ expected: 125000, cash: 105000 });
  const shift = { opening_cash: 20000 };

  const getShiftPreview = (role) => {
    const c = calcShift(shift);
    if (role === 'cashier') {
      return {
        isBlind: true,
        html: 'Blind Drawer Reconciliation: Count all physical cash in your drawer'
      };
    }
    return {
      isBlind: false,
      expected: c.expected,
      html: `Expected physical cash in drawer: ${c.expected}`
    };
  };

  const cashierPreview = getShiftPreview('cashier');
  assert.equal(cashierPreview.isBlind, true);
  assert.equal(cashierPreview.html.includes('125000'), false);

  const managerPreview = getShiftPreview('manager');
  assert.equal(managerPreview.isBlind, false);
  assert.equal(managerPreview.expected, 125000);
});

test('P03: continuous register mode handles cashier vs standard completion', () => {
  let modalClosed = false;
  let readyNextCustomer = false;

  const onSaleComplete = (role, continuousMode) => {
    modalClosed = false;
    readyNextCustomer = false;
    const isRegisterCashier = role === 'cashier' || continuousMode;
    if (!isRegisterCashier) {
      modalClosed = true;
    } else {
      readyNextCustomer = true;
    }
  };

  // Cashier sale: modal remains open, ready for next customer
  onSaleComplete('cashier', false);
  assert.equal(modalClosed, false);
  assert.equal(readyNextCustomer, true);

  // Manager standard sale: modal closes
  onSaleComplete('manager', false);
  assert.equal(modalClosed, true);
  assert.equal(readyNextCustomer, false);
});

test('P04: supervisor override requires manager or owner role', () => {
  const employees = [
    { id: '1', name: 'Alice Cashier', role: 'cashier', active: true },
    { id: '2', name: 'Bob Manager', role: 'manager', active: true },
    { id: '3', name: 'Charlie Inactive Mgr', role: 'manager', active: false }
  ];

  const checkSupervisorRole = (empId) => {
    const emp = employees.find(e => e.id === empId && e.active);
    if (!emp) return false;
    return emp.role === 'manager' || emp.role === 'owner';
  };

  assert.equal(checkSupervisorRole('1'), false); // Cashier cannot override
  assert.equal(checkSupervisorRole('2'), true);  // Active Manager can override
  assert.equal(checkSupervisorRole('3'), false); // Inactive Manager cannot override
});
