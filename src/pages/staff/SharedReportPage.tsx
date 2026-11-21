import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatIstDate } from '../../lib/format';
import { DashboardReportView, type OwnerDashboardPayload } from './OwnerDashboardPage';

export function SharedReportPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery<{ expiresAt: string; dashboard: OwnerDashboardPayload }>({
    queryKey: ['shared-report', token],
    queryFn: () => apiFetch(`/finance/share-report/${token}`),
    enabled: Boolean(token),
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070E1A] text-slate-900 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A1324] px-6 py-4 flex items-center justify-between no-print">
        <div>
          <Link to="/" className="font-display text-lg font-bold">Alpha Sports Club</Link>
          <span className="ml-3 text-xs text-slate-500">Read-Only Financial Report</span>
        </div>
        <div className="flex items-center gap-3">
          {data?.expiresAt && (
            <span className="text-xs text-slate-500">Link valid until {formatIstDate(data.expiresAt)}</span>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-lg bg-lime-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Print Report
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="py-20 text-center text-sm text-slate-500">Loading shared report...</div>
        ) : error || !data ? (
          <div className="py-20 text-center space-y-3">
            <h1 className="font-display text-2xl font-bold">Report Unavailable</h1>
            <p className="text-sm text-slate-500">This report link does not exist or has expired.</p>
            <Link to="/" className="inline-block px-4 py-2 rounded-lg bg-lime-400 text-slate-950 text-xs font-semibold">
              Return Home
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-2xl font-bold">
                Alpha Sports Club · Executive Report ({formatIstDate(data.dashboard.startDate)} – {formatIstDate(data.dashboard.endDate)})
              </h1>
            </div>
            <DashboardReportView data={data.dashboard} readOnly />
          </div>
        )}
      </main>
    </div>
  );
}
