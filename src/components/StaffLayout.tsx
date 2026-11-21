import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Coffee,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  Search,
  Sun,
  UserCheck,
  Users,
  Briefcase,
  X,
  Menu,
} from 'lucide-react';
import { useAuth, type UserRole } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { formatIstDate } from '../lib/format';

interface NavEntry {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  end?: boolean;
}

const STAFF_NAV: NavEntry[] = [
  { to: '/staff', label: 'Front Desk', icon: UserCheck, roles: ['OWNER', 'MANAGER', 'FRONT_DESK'], end: true },
  { to: '/staff/bar', label: 'Bar & KDS', icon: Coffee, roles: ['OWNER', 'MANAGER', 'BAR_STAFF', 'FRONT_DESK'] },
  { to: '/staff/shop', label: 'Shop & Inventory', icon: Package, roles: ['OWNER', 'MANAGER', 'SHOP_STAFF', 'FRONT_DESK'] },
  { to: '/staff/crm', label: 'CRM & Leads', icon: Users, roles: ['OWNER', 'MANAGER', 'FRONT_DESK'] },
  { to: '/staff/hr', label: 'HR & Payroll', icon: Briefcase, roles: ['OWNER', 'MANAGER', 'FRONT_DESK', 'BAR_STAFF', 'SHOP_STAFF'] },
  { to: '/staff/owner', label: 'Owner Dashboard', icon: BarChart3, roles: ['OWNER', 'MANAGER'] },
  { to: '/staff/finance', label: 'Finance & Settings', icon: CreditCard, roles: ['OWNER', 'MANAGER'] },
];

export function StaffLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState('');
  const [showNotifs, setShowNotifs] = useState(false);

  const visibleNav = STAFF_NAV.filter((item) => user && item.roles.includes(user.role));

  const { data: searchResults } = useQuery<{
    members: Array<{ id: number; memberCode: string; fullName: string; phone: string; status: string; plan?: { name: string } }>;
  }>({
    queryKey: ['global-member-search', globalQuery],
    queryFn: () => apiFetch(`/members?q=${encodeURIComponent(globalQuery)}`),
    enabled: globalQuery.trim().length >= 2 && Boolean(user && ['OWNER', 'MANAGER', 'FRONT_DESK', 'BAR_STAFF', 'SHOP_STAFF'].includes(user.role)),
  });

  const { data: notifData } = useQuery<{
    notifications: Array<{ id: number; title: string; body: string; isRead: boolean; createdAt: string }>;
  }>({
    queryKey: ['staff-notifications'],
    queryFn: () => apiFetch('/notifications'),
    refetchInterval: 20000,
  });

  const unreadCount = notifData?.notifications.filter((n) => !n.isRead).length || 0;

  const markRead = async (id: number) => {
    await apiFetch(`/notifications/${id}/read`, { method: 'POST' });
    queryClient.invalidateQueries({ queryKey: ['staff-notifications'] });
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-[#070E1A] dark:text-slate-100">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A1324] transition-transform lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-6 h-16 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <Link to="/" className="font-display text-lg font-bold tracking-tight whitespace-nowrap">
            Alpha Sports Club
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="lg:hidden p-1.5 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-lime-400 text-slate-950 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
          <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
            <Link
              to="/"
              className="flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              <LayoutDashboard className="w-4 h-4" />
              Public Website
            </Link>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="text-xs">
            <div className="font-semibold text-slate-900 dark:text-white truncate">{user?.fullName}</div>
            <div className="text-slate-500 dark:text-slate-400">{user?.role.replace('_', ' ')}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              Theme
            </button>
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 px-4 lg:px-8 flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#070E1A]/90 backdrop-blur-md no-print">
          <div className="flex items-center gap-3 flex-1 max-w-md relative">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                placeholder="Quick member lookup (name, phone, CC-00001, QR)..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-lime-400"
              />
              {globalQuery.trim().length >= 2 && searchResults && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {searchResults.members.length === 0 ? (
                    <div className="p-3 text-xs text-slate-500">No members matched.</div>
                  ) : (
                    searchResults.members.slice(0, 6).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setGlobalQuery('');
                          navigate(`/staff?memberId=${m.id}`);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">{m.fullName}</div>
                          <div className="text-slate-500 font-mono">
                            {m.memberCode} · {m.phone}
                          </div>
                        </div>
                        <span className="font-medium text-lime-600 dark:text-lime-400">
                          {m.plan?.name} · {m.status}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifs((v) => !v)}
              aria-label="Notifications"
              className="relative inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Bell className="w-4 h-4" />
              <span className="font-mono tabular-nums">{unreadCount}</span>
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold">Club Alerts &amp; Notifications</span>
                  <button type="button" onClick={() => setShowNotifs(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {notifData?.notifications.length === 0 ? (
                    <div className="p-4 text-xs text-slate-500">All caught up.</div>
                  ) : (
                    notifData?.notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-3 text-xs space-y-1 ${n.isRead ? 'opacity-60' : 'bg-lime-400/5'}`}
                      >
                        <div className="font-semibold text-slate-900 dark:text-white">{n.title}</div>
                        <p className="text-slate-600 dark:text-slate-400">{n.body}</p>
                        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                          <span>{formatIstDate(n.createdAt)}</span>
                          {!n.isRead && (
                            <button
                              type="button"
                              onClick={() => markRead(n.id)}
                              className="text-lime-600 dark:text-lime-400 font-medium"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-[1440px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
