import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Calendar, Coffee, CreditCard, ShoppingBag } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatINR, formatIstDate, formatIstTime, getTodayIstStr } from '../../lib/format';

export function MemberDashboardPage() {
  const today = getTodayIstStr();

  const { data, isLoading } = useQuery<{
    profile: {
      id: number;
      memberCode: string;
      fullName: string;
      status: string;
      daysToExpiry: number | null;
      creditBalancePaise: number;
      currentMembership?: { endDate: string; startDate: string };
      plan?: {
        code: string;
        name: string;
        courtDiscountPct: number;
        shopDiscountPct: number;
        barDiscountPct: number;
        maxBookingsPerDay: number;
      };
    };
    bookings: Array<{
      id: number;
      courtName: string;
      sport: string;
      bookingDate: string;
      startTime: string;
      endTime: string;
      status: string;
      finalAmountPaise: number;
    }>;
    shopOrders: Array<{
      id: number;
      orderNumber: string;
      status: string;
      fulfilmentType: string;
      totalPaise: number;
      createdAt: string;
    }>;
    tabs: Array<{
      id: number;
      status: string;
      totalPaise: number;
      paidPaise: number;
    }>;
  }>({
    queryKey: ['member-history'],
    queryFn: () => apiFetch('/members/me/history'),
  });

  if (isLoading || !data) {
    return <div className="py-12 text-center text-sm text-slate-500">Loading your member dashboard...</div>;
  }

  const { profile, bookings, shopOrders, tabs } = data;
  const bookingsToday = bookings.filter((b) => b.bookingDate === today && b.status !== 'CANCELLED').length;
  const maxPerDay = profile.plan?.maxBookingsPerDay ?? 2;
  const openTabBalance = tabs
    .filter((t) => t.status === 'OPEN')
    .reduce((acc, t) => acc + Math.max(0, t.totalPaise - t.paidPaise), 0);
  const upcomingBookings = bookings.filter((b) => b.bookingDate >= today && b.status !== 'CANCELLED').slice(0, 5);
  const showExpiryWarning = profile.daysToExpiry !== null && profile.daysToExpiry <= 15;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">
            Welcome back, {profile.fullName}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
            {profile.memberCode} · {profile.plan?.name || 'Member'} · Status: {profile.status}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/member/bookings"
            className="px-4 py-2.5 rounded-xl bg-lime-400 text-slate-950 font-semibold text-xs hover:bg-lime-300"
          >
            Book a Court
          </Link>
          <Link
            to="/member/card"
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Show QR Pass
          </Link>
        </div>
      </div>

      {showExpiryWarning && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-amber-700 dark:text-amber-300">
                {profile.daysToExpiry! < 0
                  ? 'Membership Expired'
                  : `Membership Expiring in ${profile.daysToExpiry} Day(s)`}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Expiry date: {formatIstDate(profile.currentMembership?.endDate)}. Renew now to preserve court booking and discount privileges.
              </p>
            </div>
          </div>
          <Link
            to="/member/history"
            className="px-4 py-2 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold whitespace-nowrap self-start sm:self-auto"
          >
            Renew Plan
          </Link>
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Membership Plan</span>
            <CreditCard className="w-4 h-4 text-lime-500" />
          </div>
          <div className="font-display text-xl font-bold">{profile.plan?.name || '—'}</div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {profile.daysToExpiry !== null ? `${Math.max(0, profile.daysToExpiry)} days left` : 'Active'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Today&apos;s Bookings</span>
            <Calendar className="w-4 h-4 text-sky-400" />
          </div>
          <div className="font-mono text-xl font-bold tabular-nums">
            {bookingsToday} / {maxPerDay}
          </div>
          <div className="text-xs text-slate-500">Daily booking quota</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Open Bar Tab</span>
            <Coffee className="w-4 h-4 text-amber-400" />
          </div>
          <div className="font-mono text-xl font-bold tabular-nums">{formatINR(openTabBalance)}</div>
          <div className="text-xs text-slate-500">
            {openTabBalance > 0 ? 'Settle before exit at lounge' : 'All tabs settled'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Club Credit</span>
            <ShoppingBag className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-mono text-xl font-bold tabular-nums">{formatINR(profile.creditBalancePaise)}</div>
          <div className="text-xs text-slate-500">
            Shop {profile.plan?.shopDiscountPct ?? 0}% · Bar {profile.plan?.barDiscountPct ?? 0}% off
          </div>
        </div>
      </div>

      {/* Upcoming Bookings & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Upcoming Bookings</h2>
            <Link to="/member/bookings" className="text-xs font-semibold text-lime-600 dark:text-lime-400 hover:underline">
              Manage all →
            </Link>
          </div>
          {upcomingBookings.length === 0 ? (
            <div className="text-sm text-slate-500 py-6">No upcoming court bookings.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcomingBookings.map((b) => (
                <div key={b.id} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">{b.courtName}</div>
                    <div className="text-xs text-slate-500 font-mono tabular-nums">
                      {formatIstDate(b.bookingDate)} · {formatIstTime(b.startTime)}–{formatIstTime(b.endTime)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs font-semibold tabular-nums">
                      {b.finalAmountPaise === 0 ? 'Complimentary' : formatINR(b.finalAmountPaise)}
                    </div>
                    <div className="text-[11px] text-lime-600 dark:text-lime-400">{b.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Recent Pro Shop Orders</h2>
            <Link to="/member/shop" className="text-xs font-semibold text-lime-600 dark:text-lime-400 hover:underline">
              Shop gear →
            </Link>
          </div>
          {shopOrders.length === 0 ? (
            <div className="text-sm text-slate-500 py-6">No pro shop orders yet.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {shopOrders.slice(0, 5).map((o) => (
                <div key={o.id} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-mono font-semibold text-slate-900 dark:text-white">{o.orderNumber}</div>
                    <div className="text-xs text-slate-500">
                      {o.fulfilmentType} · {formatIstDate(o.createdAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs font-semibold tabular-nums">{formatINR(o.totalPaise)}</div>
                    <div className="text-[11px] text-slate-500">{o.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
