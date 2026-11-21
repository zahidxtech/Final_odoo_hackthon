import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Calendar,
  CreditCard,
  History,
  Home,
  LogOut,
  Moon,
  ShoppingBag,
  Sun,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useCart } from '../context/CartContext';
import { CartDrawer } from './CartDrawer';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function MemberLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { totalCount, setIsOpen } = useCart();
  const navigate = useNavigate();

  const { data: historyData } = useQuery<{
    profile: { plan?: { shopDiscountPct?: number } };
  }>({
    queryKey: ['member-history'],
    queryFn: () => apiFetch('/members/me/history'),
    enabled: Boolean(user?.memberId),
  });

  const navItems = [
    { to: '/member', label: 'Home', icon: Home, end: true },
    { to: '/member/bookings', label: 'Courts', icon: Calendar },
    { to: '/member/card', label: 'Club Card', icon: CreditCard },
    { to: '/member/shop', label: 'Pro Shop', icon: ShoppingBag },
    { to: '/member/history', label: 'History', icon: History },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-[#070E1A] dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A1324]">
        <div className="px-6 h-16 flex items-center border-b border-slate-200 dark:border-slate-800">
          <Link to="/" className="font-display text-lg font-bold tracking-tight whitespace-nowrap">
            Alpha Sports Club
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
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
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div className="px-2 py-1 text-xs text-slate-500 dark:text-slate-400">
            <div className="font-semibold text-slate-900 dark:text-white truncate">{user?.fullName}</div>
            <div className="font-mono">{user?.memberCode || 'Member'}</div>
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
                navigate('/');
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        <header className="sticky top-0 z-30 h-14 px-4 lg:px-8 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#070E1A]/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="lg:hidden font-display font-bold text-base">Alpha Sports Club</span>
            <span className="hidden lg:inline text-xs font-medium text-slate-500 dark:text-slate-400">
              Member Portal · {user?.memberCode}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ShoppingBag className="w-4 h-4 text-lime-500" />
              Bag ({totalCount})
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile Fixed Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-[#0A1324]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium ${
                  isActive ? 'text-lime-600 dark:text-lime-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <CartDrawer memberDiscountPct={historyData?.profile?.plan?.shopDiscountPct || 0} />
    </div>
  );
}
