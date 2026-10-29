const test = require('node:test');
const assert = require('node:assert/strict');

// Mock localStorage
const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};

const NOTIF_READ_STORAGE_KEY = 'kivu_read_notifs_v3_';
const shop = { id: 'shop_test_123' };

function getReadNotificationsMap() {
  const sid = shop?.id || 'default';
  try { return JSON.parse(localStorage.getItem(NOTIF_READ_STORAGE_KEY + sid) || '{}'); } catch(_e) { return {}; }
}
function saveReadNotificationsMap(map) {
  const sid = shop?.id || 'default';
  try { localStorage.setItem(NOTIF_READ_STORAGE_KEY + sid, JSON.stringify(map || {})); } catch(_e) {}
}

test('N01: notifications marked as read persist across simulated page reloads', () => {
  localStorage.clear();

  // 1. Initial simulated backend notifications (read_at is null)
  const initialShopNotifs = [
    { id: 'notif_sub_01', title: 'Subscription Expiring', message: 'Expires in 12 days', read_at: null },
    { id: 'notif_stock_02', title: 'Low Stock Alert', message: 'Flour is running low', read_at: null }
  ];

  // Check read status before mark read
  let readMap = getReadNotificationsMap();
  assert.equal(Boolean(readMap['notif_sub_01']), false);
  assert.equal(Boolean(readMap['notif_stock_02']), false);

  // 2. Mark all as read
  const now = Date.now();
  initialShopNotifs.forEach(n => {
    n.read_at = new Date().toISOString();
    readMap[n.id] = now;
    readMap['stored_' + n.id] = now;
  });
  saveReadNotificationsMap(readMap);

  // 3. Simulate reload: backend is queried anew and STILL returns read_at: null (e.g. Supabase RLS did not persist)
  const reloadedShopNotifs = [
    { id: 'notif_sub_01', title: 'Subscription Expiring', message: 'Expires in 12 days', read_at: null },
    { id: 'notif_stock_02', title: 'Low Stock Alert', message: 'Flour is running low', read_at: null }
  ];

  // Re-read map from localStorage
  const reloadedMap = getReadNotificationsMap();
  reloadedShopNotifs.forEach(n => {
    const isRead = Boolean(n.read_at) || Boolean(reloadedMap[n.id]) || Boolean(reloadedMap['stored_' + n.id]);
    assert.equal(isRead, true, `Notification ${n.id} must remain read after reload`);
  });
});

test('N02: single notification mark read marks only targeted notification', () => {
  localStorage.clear();

  const notifs = [
    { id: 'notif_01', title: 'Alert 1', read_at: null },
    { id: 'notif_02', title: 'Alert 2', read_at: null }
  ];

  const readMap = getReadNotificationsMap();
  // Mark only notif_01
  readMap['notif_01'] = Date.now();
  readMap['stored_notif_01'] = Date.now();
  saveReadNotificationsMap(readMap);

  // Simulate reload
  const reloadedMap = getReadNotificationsMap();
  const isRead01 = Boolean(reloadedMap['notif_01']) || Boolean(reloadedMap['stored_notif_01']);
  const isRead02 = Boolean(reloadedMap['notif_02']) || Boolean(reloadedMap['stored_notif_02']);

  assert.equal(isRead01, true);
  assert.equal(isRead02, false);
});
