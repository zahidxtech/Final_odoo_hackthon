import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../../lib/api';
import { formatINR, formatIstDate, calculateAgeFromDob } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

export function MemberHistoryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'BOOKINGS' | 'ORDERS' | 'BAR' | 'INVOICES'>('BOOKINGS');
  const [renewOpen, setRenewOpen] = useState(false);
  const [planCode, setPlanCode] = useState<'GOLD' | 'SILVER' | 'JUNIOR'>('GOLD');
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('ANNUAL');
  const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'UPI' | 'ONLINE'>('UPI');
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, refetch } = useQuery<{
    profile: {
      dob: string;
      status: string;
      plan?: { code: string; name: string };
      currentMembership?: { endDate: string };
    };
    bookings: Array<{ id: number; courtName: string; bookingDate: string; status: string; finalAmountPaise: number }>;
    shopOrders: Array<{ id: number; orderNumber: string; fulfilmentType: string; status: string; totalPaise: number; createdAt: string }>;
    tabs: Array<{ id: number; status: string; totalPaise: number; paidPaise: number; openedAt: string }>;
    barOrders: Array<{ id: number; orderNumber: string; totalPaise: number; billingStatus: string; createdAt: string }>;
    invoices: Array<{ id: number; invoiceNumber: string; issueDate: string; status: string; totalPaise: number }>;
  }>({
    queryKey: ['member-history'],
    queryFn: () => apiFetch('/members/me/history'),
  });

  if (isLoading || !data) {
    return <div className="py-12 text-center text-sm text-slate-500">Loading history...</div>;
  }

  const age = calculateAgeFromDob(data.profile.dob);
  const isUnder18 = age !== null && age < 18;

  const handleRenew = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/members/me/renew', {
        method: 'POST',
        body: JSON.stringify({
          planCode: isUnder18 ? 'JUNIOR' : planCode,
          billingCycle,
          paymentMethod,
        }),
      });
      toast('Membership renewed / updated successfully!', 'success');
      setRenewOpen(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['member-history'] });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Unable to renew plan.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Activity, Tabs &amp; Invoices</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Current plan: {data.profile.plan?.name} · Valid through {formatIstDate(data.profile.currentMembership?.endDate)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPlanCode((data.profile.plan?.code as 'GOLD' | 'SILVER' | 'JUNIOR') || 'GOLD');
            setRenewOpen(true);
          }}
          className="px-4 py-2.5 rounded-xl bg-lime-400 text-slate-950 font-semibold text-xs hover:bg-lime-300 self-start sm:self-auto"
        >
          Renew / Change Plan
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl w-fit">
        {(['BOOKINGS', 'ORDERS', 'BAR', 'INVOICES'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === t ? 'bg-white dark:bg-lime-400 text-slate-950 shadow-sm' : 'text-slate-500'
            }`}
          >
            {t === 'BOOKINGS' ? 'Bookings' : t === 'ORDERS' ? 'Shop Orders' : t === 'BAR' ? 'Bar & Tabs' : 'Invoices'}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {tab === 'BOOKINGS' && (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs text-slate-500">
                <th className="px-6 py-3">Court</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
              {data.bookings.map((b) => (
                <tr key={b.id}>
                  <td className="px-6 py-3 font-medium">{b.courtName}</td>
                  <td className="px-6 py-3 font-mono text-xs">{formatIstDate(b.bookingDate)}</td>
                  <td className="px-6 py-3 text-xs">{b.status}</td>
                  <td className="px-6 py-3 text-right font-mono">{formatINR(b.finalAmountPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'ORDERS' && (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs text-slate-500">
                <th className="px-6 py-3">Order #</th>
                <th className="px-6 py-3">Fulfilment</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
              {data.shopOrders.map((o) => (
                <tr key={o.id}>
                  <td className="px-6 py-3 font-mono font-semibold">{o.orderNumber}</td>
                  <td className="px-6 py-3 text-xs">{o.fulfilmentType}</td>
                  <td className="px-6 py-3 font-mono text-xs">{formatIstDate(o.createdAt)}</td>
                  <td className="px-6 py-3 text-xs">{o.status}</td>
                  <td className="px-6 py-3 text-right font-mono">{formatINR(o.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'BAR' && (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs text-slate-500">
                <th className="px-6 py-3">Order / Tab</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Billing</th>
                <th className="px-6 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
              {data.barOrders.map((bo) => (
                <tr key={bo.id}>
                  <td className="px-6 py-3 font-mono font-semibold">{bo.orderNumber}</td>
                  <td className="px-6 py-3 font-mono text-xs">{formatIstDate(bo.createdAt)}</td>
                  <td className="px-6 py-3 text-xs">{bo.billingStatus}</td>
                  <td className="px-6 py-3 text-right font-mono">{formatINR(bo.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'INVOICES' && (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs text-slate-500">
                <th className="px-6 py-3">Invoice #</th>
                <th className="px-6 py-3">Issued</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
              {data.invoices.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-6 text-center text-slate-500 text-xs">
                    No membership invoices yet.
                  </td>
                </tr>
              ) : (
                data.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-6 py-3 font-mono font-semibold">{inv.invoiceNumber}</td>
                    <td className="px-6 py-3 font-mono text-xs">{formatIstDate(inv.issueDate)}</td>
                    <td className="px-6 py-3 text-xs">{inv.status}</td>
                    <td className="px-6 py-3 text-right font-mono">{formatINR(inv.totalPaise)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {renewOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-lg font-bold">Renew or Change Membership Plan</h3>
            <p className="text-xs text-slate-500">Plan changes apply immediately to all future bookings.</p>
            <form onSubmit={handleRenew} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Plan</label>
                <select
                  disabled={isUnder18}
                  value={isUnder18 ? 'JUNIOR' : planCode}
                  onChange={(e) => setPlanCode(e.target.value as 'GOLD' | 'SILVER' | 'JUNIOR')}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="GOLD">Gold Premier (₹4,500/mo · ₹45,000/yr)</option>
                  <option value="SILVER">Silver Club (₹2,500/mo · ₹25,000/yr)</option>
                  <option value="JUNIOR">Junior Academy (₹1,500/mo · ₹15,000/yr)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={billingCycle}
                  onChange={(e) => setBillingCycle(e.target.value as 'MONTHLY' | 'ANNUAL')}
                  className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="ANNUAL">Annual</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'CARD' | 'UPI' | 'ONLINE')}
                  className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="UPI">UPI</option>
                  <option value="CARD">Card</option>
                  <option value="ONLINE">Online</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenewOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-lime-400 text-slate-950 text-xs font-semibold"
                >
                  {submitting ? 'Processing...' : 'Confirm & Pay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
