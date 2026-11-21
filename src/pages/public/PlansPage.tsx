import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { formatINR } from '../../lib/format';

export function PlansPage() {
  const { data, isLoading } = useQuery<{
    plans: Array<{
      id: number;
      code: string;
      name: string;
      description: string;
      monthlyPricePaise: number;
      annualPricePaise: number;
      courtDiscountPct: number;
      shopDiscountPct: number;
      barDiscountPct: number;
      maxBookingsPerDay: number;
      freeHoursPerMonth: number;
      allowedStartHour: number;
      allowedEndHour: number;
      maxAgeYears: number | null;
    }>;
  }>({
    queryKey: ['public-plans'],
    queryFn: () => apiFetch('/members/plans'),
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-12">
      <div className="max-w-2xl space-y-3">
        <h1 className="font-display text-4xl font-bold text-slate-900 dark:text-white">
          Membership Plans &amp; Entitlements
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Choose Gold Premier for unlimited court access, Silver Club for flexible multi-sport savings, or Junior Academy for athletes under 18.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-500">Loading plans...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(data?.plans || []).map((plan) => (
              <div
                key={plan.id}
                className={`rounded-2xl p-8 border flex flex-col justify-between ${
                  plan.code === 'GOLD'
                    ? 'bg-slate-900 text-white border-lime-400/70'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="space-y-4">
                  <div className="text-xs font-semibold tracking-wider text-lime-500 uppercase">{plan.code}</div>
                  <h2 className="font-display text-2xl font-bold">{plan.name}</h2>
                  <div className="space-y-1 tabular-nums">
                    <div className="font-mono text-3xl font-bold">
                      {formatINR(plan.monthlyPricePaise)}
                      <span className="text-xs font-normal opacity-70"> / mo</span>
                    </div>
                    <div className="text-xs opacity-75 font-mono">
                      Or {formatINR(plan.annualPricePaise)} billed annually (2 months free)
                    </div>
                  </div>
                  <p className="text-sm opacity-80 leading-relaxed">{plan.description}</p>
                </div>

                <div className="mt-8 space-y-3">
                  <Link
                    to={`/login?mode=register&plan=${plan.code}`}
                    className="block w-full py-3 rounded-xl bg-lime-400 text-slate-950 font-semibold text-sm text-center hover:bg-lime-300 transition-colors"
                  >
                    Enroll in {plan.name}
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Side-by-Side Comparison Matrix */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-lg font-semibold">Side-by-Side Benefits &amp; Rules</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                    <th className="px-6 py-3 font-semibold">Entitlement</th>
                    {(data?.plans || []).map((p) => (
                      <th key={p.id} className="px-6 py-3 font-semibold">{p.name}</th>
                    ))}
                    <th className="px-6 py-3 font-semibold">Walk-in / Guest</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                  <tr>
                    <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400">Court Rate Discount</td>
                    {(data?.plans || []).map((p) => (
                      <td key={p.id} className="px-6 py-3.5 font-mono font-semibold">
                        {p.courtDiscountPct === 100 ? 'Free (100%)' : `${p.courtDiscountPct}% off`}
                      </td>
                    ))}
                    <td className="px-6 py-3.5 font-mono">Full rate (1.2x peak)</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400">Pro Shop Discount</td>
                    {(data?.plans || []).map((p) => (
                      <td key={p.id} className="px-6 py-3.5 font-mono">{p.shopDiscountPct}% off</td>
                    ))}
                    <td className="px-6 py-3.5 font-mono">0%</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400">Bar &amp; Cafeteria Discount</td>
                    {(data?.plans || []).map((p) => (
                      <td key={p.id} className="px-6 py-3.5 font-mono">{p.barDiscountPct}% off</td>
                    ))}
                    <td className="px-6 py-3.5 font-mono">0%</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400">Daily Active Booking Limit</td>
                    {(data?.plans || []).map((p) => (
                      <td key={p.id} className="px-6 py-3.5 font-mono">{p.maxBookingsPerDay} / day</td>
                    ))}
                    <td className="px-6 py-3.5 font-mono">Pay per slot</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400">Permitted Playing Hours</td>
                    {(data?.plans || []).map((p) => (
                      <td key={p.id} className="px-6 py-3.5 font-mono">
                        {String(p.allowedStartHour).padStart(2, '0')}:00 – {String(p.allowedEndHour).padStart(2, '0')}:00
                      </td>
                    ))}
                    <td className="px-6 py-3.5 font-mono">06:00 – 22:00</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400">Age Eligibility</td>
                    {(data?.plans || []).map((p) => (
                      <td key={p.id} className="px-6 py-3.5">
                        {p.maxAgeYears ? `Under 18 (≤ ${p.maxAgeYears} yrs)` : '18+ years'}
                      </td>
                    ))}
                    <td className="px-6 py-3.5">All ages</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
