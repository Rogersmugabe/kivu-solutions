import { useEffect, useState, useSyncExternalStore } from 'react';

/* ------------------------------ Online status ------------------------------ */

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); };
}
export const useOnlineStatus = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

/* ------------------------- Offline sale queue (IndexedDB) ------------------------- */
// A sale made without internet is stored on the device with a stable client_ref. When the
// connection returns it is replayed through record_sale_cart_v48, which treats client_ref as
// an idempotency key, so a retried sale is never recorded twice.

export interface QueuedSale {
  client_ref: string;
  shop_id: string;
  user_id: string;
  items: unknown[];
  payment: string;
  discount: number;
  created_at: string;
  status: 'pending' | 'syncing' | 'failed';
  last_error?: string | null;
}

const DB_NAME = 'kivu-offline-v1'; // same database as the previous app, so queued sales survive the upgrade
const STORE = 'sales';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'client_ref' });
        s.createIndex('shop_id', 'shop_id');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req ? (req.result as T) : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

export const offlineQueue = {
  async add(sale: Omit<QueuedSale, 'status' | 'created_at'> & { created_at?: string }) {
    await tx('readwrite', s => s.put({ ...sale, created_at: sale.created_at ?? new Date().toISOString(), status: 'pending', last_error: null }));
    notify();
  },
  async list(shopId: string): Promise<QueuedSale[]> {
    const all = ((await tx<QueuedSale[]>('readonly', s => s.getAll())) ?? []) as QueuedSale[];
    return all.filter(x => x.shop_id === shopId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  },
  async update(ref: string, patch: Partial<QueuedSale>) {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      const store = t.objectStore(STORE);
      const get = store.get(ref);
      get.onsuccess = () => { if (get.result) store.put({ ...get.result, ...patch }); };
      t.oncomplete = () => { db.close(); resolve(); };
      t.onerror = () => { db.close(); reject(t.error); };
    });
    notify();
  },
  async remove(ref: string) {
    await tx('readwrite', s => s.delete(ref));
    notify();
  },
  subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
};

export function useQueuedSales(shopId: string) {
  const [items, setItems] = useState<QueuedSale[]>([]);
  useEffect(() => {
    let alive = true;
    const refresh = () => offlineQueue.list(shopId).then(x => { if (alive) setItems(x); }).catch(() => {});
    refresh();
    const off = offlineQueue.subscribe(refresh);
    return () => { alive = false; off(); };
  }, [shopId]);
  return items;
}

export const newClientRef = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/* -------------------------- Offline product catalogue -------------------------- */
// The POS keeps the last loaded catalogue so it can keep selling while offline.

const catalogueKey = (shopId: string) => `kivu.catalogue.${shopId}`;
export function saveCatalogue(shopId: string, products: unknown[]) {
  try { localStorage.setItem(catalogueKey(shopId), JSON.stringify(products)); } catch { /* quota or private mode */ }
}
export function loadCatalogue<T>(shopId: string): T[] {
  try { return JSON.parse(localStorage.getItem(catalogueKey(shopId)) || '[]') as T[]; } catch { return []; }
}
