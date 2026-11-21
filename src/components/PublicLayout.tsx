import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, MapPin, ShoppingBag, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import { CartDrawer } from './CartDrawer';
import clubLogo from '../assets/images/alpha-sports-club-logo.png';

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
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/90 dark:bg-slate-950/90 border-b border-slate-200 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line brand wordmark */}
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            <img src={clubLogo} alt="" className="h-10 w-8 object-contain" />
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

      <footer className="border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 font-display font-semibold text-slate-900 dark:text-white">
                <img src={clubLogo} alt="" className="h-9 w-8 object-contain" />
                Alpha Sports Club
              </div>
              <p className="max-w-xs text-sm leading-relaxed">
                Championship courts, cricket nets, padel, and a courtside lounge, all in one club.
              </p>
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-lime-500" />
                <span>100 Feet Road, Indiranagar, Bengaluru 560038</span>
              </div>
            </div>

            <div>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
                Explore
              </h2>
              <ul className="space-y-3 text-sm">
                <li><Link to="/" className="hover:text-slate-900 dark:hover:text-white">Club overview</Link></li>
                <li><Link to="/availability" className="hover:text-slate-900 dark:hover:text-white">Live court availability</Link></li>
                <li><Link to="/plans" className="hover:text-slate-900 dark:hover:text-white">Membership plans</Link></li>
                <li><Link to="/shop" className="hover:text-slate-900 dark:hover:text-white">Pro Shop</Link></li>
              </ul>
            </div>

            <div>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
                At the club
              </h2>
              <ul className="space-y-3 text-sm">
                <li>Tennis, cricket, padel &amp; badminton</li>
                <li>Pro Shop and courtside cafe</li>
                <li>Friday Social Mixer · 19:00 IST</li>
              </ul>
            </div>

            <div className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
                Plan your visit
              </h2>
              <div className="flex items-start gap-2 text-sm">
                <Clock className="w-4 h-4 mt-0.5 shrink-0 text-lime-500" />
                <span>Open daily · 06:00–22:00 IST</span>
              </div>
              <p className="text-sm leading-relaxed">
                Book a trial session to explore the facilities and find your next game.
              </p>
              <Link
                to="/enquiry"
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-lime-400 hover:underline"
              >
                Book a trial <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-4 border-t border-slate-200 pt-5 text-xs dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} Alpha Sports Club. All rights reserved.</span>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link to="/enquiry" className="hover:text-slate-900 dark:hover:text-white">Trial &amp; Enquiry</Link>
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
        </div>
      </footer>

      <CartDrawer />
    </div>
  );
}
