import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { AuthProvider, useAuth, useShop } from '@/auth/AuthProvider';
import { FeedbackProvider, useFeedback } from '@/components/feedback';
import { PrintProvider } from '@/components/print';
import { AppShell } from '@/layout/AppShell';
import { AuthScreen } from '@/pages/AuthScreen';
import { Spinner, EmptyState } from '@/components/ui';
import { navFor } from '@/layout/nav';
import { FEATURE_MIN_PLAN, PAGE_FEATURE, type PageKey } from '@/lib/access';
import { offlineQueue } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { APP_VERSION } from '@/config';
import { Lock } from 'lucide-react';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Sell = lazy(() => import('@/pages/Sell'));
const Sales = lazy(() => import('@/pages/Sales'));
const Products = lazy(() => import('@/pages/Products'));
const Stock = lazy(() => import('@/pages/Stock'));
const Suppliers = lazy(() => import('@/pages/Suppliers'));
const Expenses = lazy(() => import('@/pages/Expenses'));
const Staff = lazy(() => import('@/pages/Staff'));
const Shifts = lazy(() => import('@/pages/Shifts'));
const Approvals = lazy(() => import('@/pages/Approvals'));
const Reports = lazy(() => import('@/pages/Reports'));
const Tables = lazy(() => import('@/pages/Tables'));
const Plans = lazy(() => import('@/pages/Plans'));
const Settings = lazy(() => import('@/pages/Settings'));
const Admin = lazy(() => import('@/pages/Admin'));

const PAGES: Record<PageKey, React.ComponentType> = {
  dashboard: Dashboard, sell: Sell, sales: Sales, products: Products, stock: Stock, suppliers: Suppliers,
  expenses: Expenses, staff: Staff, shifts: Shifts, approvals: Approvals, reports: Reports, tables: Tables,
  plans: Plans, settings: Settings, admin: Admin
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } }
});

/** Shows the page if the role may open it; owners see an upgrade card for plan-locked pages. */
function Guarded({ page }: { page: PageKey }) {
  const { pages, hasFeature } = useShop();
  if (!pages.includes(page)) return <Navigate to={navFor(pages[0] ?? 'dashboard').path} replace />;
  const feature = PAGE_FEATURE[page];
  if (feature && !hasFeature(feature)) {
    return (
      <div className="card mx-auto mt-10 max-w-lg">
        <EmptyState
          icon={<Lock />}
          title={`${navFor(page).label} needs ${FEATURE_MIN_PLAN[feature]}`}
          description="Upgrade your plan to unlock this part of Kivu. Your data is kept while you decide."
          action={<a href="#/plans" className="text-sm font-semibold text-brand-600 hover:underline">View plans</a>}
        />
      </div>
    );
  }
  const Page = PAGES[page];
  return <Page />;
}

/** Replays sales made offline as soon as the device is online again. */
function OfflineSync() {
  const { shop, session } = useShop();
  const qc = useQueryClient();
  const { toast } = useFeedback();
  useEffect(() => {
    let running = false;
    const sync = async () => {
      if (running || !navigator.onLine) return;
      running = true;
      try {
        const queued = await offlineQueue.list(shop.id);
        let synced = 0;
        for (const q of queued) {
          if (q.user_id !== session.user.id) continue;
          await offlineQueue.update(q.client_ref, { status: 'syncing' });
          const { error } = await supabase.rpc('record_sale_cart_v48', { p_items: q.items, p_payment: q.payment, p_discount: q.discount, p_customer_id: null, p_customer_name: null, p_client_ref: q.client_ref });
          if (error) await offlineQueue.update(q.client_ref, { status: 'failed', last_error: error.message });
          else { await offlineQueue.remove(q.client_ref); synced++; }
        }
        if (synced) {
          toast('success', `${synced} offline sale${synced === 1 ? '' : 's'} synced`);
          void qc.invalidateQueries({ queryKey: ['sales'] });
          void qc.invalidateQueries({ queryKey: ['products'] });
        }
      } finally {
        running = false;
      }
    };
    void sync();
    window.addEventListener('online', sync);
    const timer = window.setInterval(sync, 60_000);
    return () => { window.removeEventListener('online', sync); window.clearInterval(timer); };
  }, [shop.id, session.user.id, qc, toast]);
  return null;
}

/** Registers this device so the owner can see and revoke signed-in devices. */
function DeviceHeartbeat() {
  const { signOut } = useShop();
  const { toast } = useFeedback();
  useEffect(() => {
    let key = '';
    try {
      key = localStorage.getItem('duka_device_key') || '';
      if (!key) { key = crypto.randomUUID(); localStorage.setItem('duka_device_key', key); }
    } catch { return; }
    const label = `${/Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'Phone' : 'Computer'} · ${navigator.platform || 'Browser'}`;
    const beat = async () => {
      if (!navigator.onLine) return;
      const { data, error } = await supabase.rpc('register_app_device', { p_device_key: key, p_device_label: label, p_app_version: APP_VERSION });
      if (!error && (data as { revoked?: boolean } | null)?.revoked) {
        try { localStorage.removeItem('duka_device_key'); } catch { /* ignore */ }
        toast('warning', 'This device was signed out by the owner');
        await signOut();
      }
    };
    void beat();
    const timer = window.setInterval(beat, 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [signOut, toast]);
  return null;
}

function SignedInApp() {
  const { pages } = useShop();
  return (
    <AppShell>
      <OfflineSync />
      <DeviceHeartbeat />
      <Suspense fallback={<Spinner />}>
        <Routes>
          {(Object.keys(PAGES) as PageKey[]).map(page => (
            <Route key={page} path={navFor(page).path} element={<Guarded page={page} />} />
          ))}
          <Route path="*" element={<Navigate to={navFor(pages[0] ?? 'dashboard').path} replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

function Gate() {
  const { state } = useAuth();
  if (state.status === 'loading') return <FullScreen><Spinner label="Opening your shop…" /></FullScreen>;
  if (state.status === 'signed-out') return <AuthScreen />;
  if (state.status === 'blocked') return <AuthScreen blockedMessage={state.message} />;
  return <SignedInApp />;
}

const FullScreen = ({ children }: { children: ReactNode }) => <div className="grid min-h-dvh place-items-center">{children}</div>;

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <FeedbackProvider>
        <AuthProvider>
          <PrintProvider>
            <HashRouter>
              <Gate />
            </HashRouter>
          </PrintProvider>
        </AuthProvider>
      </FeedbackProvider>
    </QueryClientProvider>
  );
}
