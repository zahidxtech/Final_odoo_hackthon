import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ShoppingBag, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import { CartDrawer } from './CartDrawer';

export function PublicLayout() {
  const { user } = useAuth();
  const { totalCount, setIsOpen } = useCart();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const portalTarget = user
    ? user.role === 'MEMBER'
      ? '/member'
      : '/staff'
    : '/login';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-[#070E1A] dark:text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/90 dark:bg-[#070E1A]/90 border-b border-slate-200 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line brand wordmark */}
          <Link
            to="/"
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            Alpha Sports Club
          </Link>

          {/* Zone 2: 5 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                  isActive ? 'text-slate-900 dark:text-lime-400 underline underline-offset-8' : ''
                }`
              }
            >
              Overview
            </NavLink>
            <NavLink
              to="/plans"
              className={({ isActive }) =>
                `hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                  isActive ? 'text-slate-900 dark:text-lime-400 underline underline-offset-8' : ''
                }`
              }
            >
              Plans
            </NavLink>
            <NavLink
              to="/availability"
              className={({ isActive }) =>
                `hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                  isActive ? 'text-slate-900 dark:text-lime-400 underline underline-offset-8' : ''
                }`
              }
            >
              Availability
            </NavLink>
            <NavLink
              to="/shop"
              className={({ isActive }) =>
                `hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                  isActive ? 'text-slate-900 dark:text-lime-400 underline underline-offset-8' : ''
                }`
              }
            >
              Pro Shop
            </NavLink>
            <NavLink
              to="/enquiry"
              className={({ isActive }) =>
                `hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                  isActive ? 'text-slate-900 dark:text-lime-400 underline underline-offset-8' : ''
                }`
              }
            >
              Trial &amp; Enquiry
            </NavLink>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            {totalCount > 0 && (
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                aria-label="Open shopping bag"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <ShoppingBag className="w-4 h-4 text-lime-500" />
                <span className="font-mono tabular-nums">{totalCount}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(portalTarget)}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-lime-400 text-slate-950 hover:bg-lime-300 transition-colors whitespace-nowrap shrink-0"
            >
              {user ? (user.role === 'MEMBER' ? 'Member Portal' : 'Staff Console') : 'Member Login'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#050A14]">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-sm text-slate-500 dark:text-slate-400">
          <div className="space-y-1">
            <div className="font-display font-semibold text-slate-900 dark:text-white">Alpha Sports Club</div>
            <p className="text-xs">100 Feet Road, Indiranagar, Bengaluru · Open Daily 06:00 – 22:00 IST</p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <Link to="/availability" className="hover:text-slate-900 dark:hover:text-white">Live Courts</Link>
            <Link to="/plans" className="hover:text-slate-900 dark:hover:text-white">Membership Plans</Link>
            <Link to="/shop" className="hover:text-slate-900 dark:hover:text-white">Pro Shop</Link>
            <Link to="/enquiry" className="hover:text-slate-900 dark:hover:text-white">Book a Trial</Link>
            <a href="/api/docs" target="_blank" rel="noreferrer" className="hover:text-slate-900 dark:hover:text-white">API Docs</a>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
        </div>
      </footer>

      <CartDrawer />
    </div>
  );
}
