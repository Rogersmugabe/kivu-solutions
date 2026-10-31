import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, LogOut, Menu, Plus, Wifi, WifiOff, X, ChevronDown, Lock, LifeBuoy } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { FEATURE_MIN_PLAN, PAGE_FEATURE, ROLE_LABELS, planFor, subscriptionStatus } from '@/lib/access';
import { formatDate } from '@/lib/format';
import { Button, cx } from '@/components/ui';
import { NAV_GROUPS, ALL_NAV } from './nav';
import { useOnlineStatus } from '@/lib/offline';

const COLLAPSE_KEY = 'kivu.sidebar.collapsed';

function readCollapsed() {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
}

export function AppShell({ children }: { children: ReactNode }) {
  const { shop, profile, role, pages, hasFeature, signOut } = useShop();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const online = useOnlineStatus();

  useEffect(() => { try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* storage unavailable */ } }, [collapsed]);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const current = ALL_NAV.find(i => (i.path === '/' ? location.pathname === '/' : location.pathname.startsWith(i.path)));
  const status = subscriptionStatus(shop);
  const groups = NAV_GROUPS.map(g => ({ ...g, items: g.items.filter(i => pages.includes(i.key)) })).filter(g => g.items.length);

  const sidebar = (isMobile: boolean) => (
    <div className="flex h-full flex-col">
      <div className={cx('flex h-16 items-center gap-3 border-b border-zinc-200/70 px-4', collapsed && !isMobile && 'justify-center px-0')}>
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink text-sm font-bold text-white">K</div>
        {(!collapsed || isMobile) && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{shop.name}</p>
            <p className="truncate text-xs text-zinc-500">{planFor(shop.plan).label}</p>
          </div>
        )}
        {isMobile && (
          <button type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)} className="grid size-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"><X className="size-4" /></button>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map(group => (
          <div key={group.label} className="mb-5 last:mb-0">
            {(!collapsed || isMobile) ? (
              <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{group.label}</p>
            ) : <div className="mx-auto mb-2 h-px w-6 bg-zinc-200" aria-hidden />}
            <ul className="space-y-0.5">
              {group.items.map(item => {
                const feature = PAGE_FEATURE[item.key];
                const locked = !!feature && !hasFeature(feature);
                const Icon = item.icon;
                return (
                  <li key={item.key}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      title={collapsed && !isMobile ? item.label : locked && feature ? `Requires ${FEATURE_MIN_PLAN[feature]}` : undefined}
                      className={({ isActive }) => cx(
                        'group flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors',
                        collapsed && !isMobile && 'justify-center px-0',
                        isActive ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                      )}
                    >
                      <Icon className="size-[18px] shrink-0" aria-hidden />
                      {(!collapsed || isMobile) && <span className="flex-1 truncate">{item.label}</span>}
                      {(!collapsed || isMobile) && locked && <Lock className="size-3.5 opacity-60" aria-label="Upgrade required" />}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {!isMobile && (
        <div className="border-t border-zinc-200/70 p-3">
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className={cx('flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900', collapsed && 'justify-center px-0')}
          >
            {collapsed ? <ChevronsRight className="size-[18px]" /> : <><ChevronsLeft className="size-[18px]" /><span>Collapse</span></>}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className={cx('fixed inset-y-0 left-0 z-30 hidden border-r border-zinc-200/70 bg-white transition-[width] duration-200 lg:block', collapsed ? 'w-[68px]' : 'w-64')}>
        {sidebar(false)}
      </aside>

      {/* Mobile drawer */}
      <div className={cx('fixed inset-0 z-40 lg:hidden', mobileOpen ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!mobileOpen}>
        <div className={cx('absolute inset-0 bg-ink/40 transition-opacity', mobileOpen ? 'opacity-100' : 'opacity-0')} onClick={() => setMobileOpen(false)} />
        <aside className={cx('absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-[var(--shadow-pop)] transition-transform duration-200', mobileOpen ? 'translate-x-0' : '-translate-x-full')} role="dialog" aria-label="Menu">
          {sidebar(true)}
        </aside>
      </div>

      <div className={cx('transition-[padding] duration-200', collapsed ? 'lg:pl-[68px]' : 'lg:pl-64')}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-zinc-200/70 bg-white/85 px-4 backdrop-blur sm:px-6">
          <button type="button" className="grid size-9 place-items-center rounded-lg border border-zinc-200 text-zinc-700 lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu className="size-[18px]" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">{current?.title ?? 'Kivu'}</h1>
          <span className={cx('hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex', online ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
            {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}{online ? 'Online' : 'Offline'}
          </span>
          {pages.includes('sell') && location.pathname !== '/sell' && (
            <Button variant="money" size="sm" icon={<Plus />} onClick={() => navigate('/sell')}>New sale</Button>
          )}
          <UserMenu name={profile.full_name || 'Account'} roleLabel={ROLE_LABELS[role]} onSignOut={signOut} />
        </header>

        {(status === 'grace' || status === 'expired' || status === 'suspended') && (
          <div className={cx('border-b px-4 py-2.5 text-center text-[13px] sm:px-6', status === 'grace' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-700')}>
            {status === 'grace' && <>Your plan payment is overdue. Renew before {formatDate(shop.grace_ends_at)} to keep every feature.</>}
            {status === 'expired' && <>Your subscription has ended. You are on Kivu Lite features until you renew.</>}
            {status === 'suspended' && <>This business has been suspended by Kivu support. Contact Platinum Tech.</>}
            {role === 'owner' && <> <NavLink to="/plans" className="font-semibold underline underline-offset-2">View plans</NavLink></>}
          </div>
        )}

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function UserMenu({ name, roleLabel, onSignOut }: { name: string; roleLabel: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', onKey); };
  }, [open]);
  const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-zinc-100">
        <span className="grid size-8 place-items-center rounded-full bg-zinc-900 text-xs font-semibold text-white">{initials || 'K'}</span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-[140px] truncate text-[13px] font-medium leading-tight">{name}</span>
          <span className="block text-[11px] text-zinc-500">{roleLabel}</span>
        </span>
        <ChevronDown className="hidden size-4 text-zinc-400 sm:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-[var(--shadow-pop)]">
          <div className="px-2.5 py-2 sm:hidden">
            <p className="text-sm font-medium">{name}</p>
            <p className="text-xs text-zinc-500">{roleLabel}</p>
          </div>
          <NavLink to="/help" role="menuitem" onClick={() => setOpen(false)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100">
            <LifeBuoy className="size-4" /> Help & user guide
          </NavLink>
          <button type="button" role="menuitem" onClick={onSignOut} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
