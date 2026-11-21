import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Copy, Download, Printer, Share2 } from 'lucide-react';
import { apiFetch, ApiError } from '../../lib/api';
import { addDaysStr, formatINR, formatIstDate, getTodayIstStr } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

export interface OwnerDashboardPayload {
  period: string;
  startDate: string;
  endDate: string;
  kpis: {
    totalRevenuePaise: number;
    totalExpensesPaise: number;
    netProfitPaise: number;
    taxCollectedPaise: number;
    netTaxPayablePaise: number;
    outstandingDuesPaise: number;
    payablesPaise: number;
    courtUtilisationPct: number;
    activeMembersCount: number;
    expiringSoonCount: number;
    expiredMembersCount: number;
    totalBookingsCount: number;
  };
  revenueBySource: Array<{ source: string; amountPaise: number; amountInr: number }>;
  revenueByMethod: Array<{ method: string; amountPaise: number; amountInr: number }>;
  dailyTrend: Array<{ date: string; revenue: number; expenses: number }>;
  heatmapBuckets: Record<string, number>;
  topProducts: Array<{ name: string; qty: number; revenuePaise: number }>;
  topBarItems: Array<{ name: string; qty: number; revenuePaise: number }>;
  alerts: {
    expiringMembers: Array<{ id: number; memberCode: string; fullName: string; phone: string }>;
    lowStockItems: Array<{ variantId: number; productName: string; sku: string; stockQty: number; lowStockThreshold: number }>;
    pendingLeavesCount: number;
    overdueInvoices: Array<{ id: number; invoiceNumber: string; totalPaise: number; paidPaise: number }>;
  };
}

const CHART_COLORS = ['#637545', '#9BA685', '#455230', '#7F9161', '#C4CCB4'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = ['06', '08', '10', '12', '14', '16', '18', '20'];

export function DashboardReportView({
  data,
  readOnly = false,
}: {
  data: OwnerDashboardPayload;
  readOnly?: boolean;
}) {
  const { toast } = useToast();
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const handleExportCsv = () => {
    const rows = [
      ['Alpha Sports Club Financial Report', `${data.startDate} to ${data.endDate}`],
      [],
      ['KPI', 'Amount (INR)'],
      ['Total Revenue', (data.kpis.totalRevenuePaise / 100).toFixed(2)],
      ['Total Expenses', (data.kpis.totalExpensesPaise / 100).toFixed(2)],
      ['Net Profit', (data.kpis.netProfitPaise / 100).toFixed(2)],
      ['GST Collected', (data.kpis.taxCollectedPaise / 100).toFixed(2)],
      ['Net GST Payable', (data.kpis.netTaxPayablePaise / 100).toFixed(2)],
      ['Outstanding Receivables', (data.kpis.outstandingDuesPaise / 100).toFixed(2)],
      ['Court Utilisation %', String(data.kpis.courtUtilisationPct)],
      [],
      ['Revenue by Source', 'Amount (INR)'],
      ...data.revenueBySource.map((s) => [s.source, String(s.amountInr)]),
      [],
      ['Date', 'Revenue (INR)', 'Expenses (INR)'],
      ...data.dailyTrend.map((d) => [d.date, String(d.revenue), String(d.expenses)]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alpha-sports-club-report-${data.startDate}-to-${data.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV report downloaded', 'success');
  };

  const handleCreateShareLink = async () => {
    try {
      const res = await apiFetch<{ token: string; expiresAt: string }>('/finance/share-report', {
        method: 'POST',
        body: JSON.stringify({
          period: data.period,
          startDate: data.startDate,
          endDate: data.endDate,
        }),
      });
      const url = `${window.location.origin}/report/${res.token}`;
      setShareUrl(url);
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url).catch(() => {});
      }
      toast('Read-only share link created (valid 7 days)!', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to create share link.', 'error');
    }
  };

  const sourceData = data.revenueBySource.filter((s) => s.amountInr > 0);
  const methodData = data.revenueByMethod.filter((m) => m.amountInr > 0);

  return (
    <div className="space-y-6">
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="text-xs text-slate-500">
            Reporting window: <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{formatIstDate(data.startDate)} – {formatIstDate(data.endDate)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:border-lime-400"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:border-lime-400"
            >
              <Printer className="w-3.5 h-3.5" /> Print PDF
            </button>
            <button
              type="button"
              onClick={handleCreateShareLink}
              className="px-3.5 py-2 rounded-xl bg-lime-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-lime-300"
            >
              <Share2 className="w-3.5 h-3.5" /> Share Read-Only Link
            </button>
          </div>
        </div>
      )}

      {shareUrl && (
        <div className="bg-lime-400/10 border border-lime-400/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs no-print">
          <div className="font-mono truncate">{shareUrl}</div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(shareUrl);
              toast('Copied link to clipboard', 'info');
            }}
            className="px-3 py-1.5 rounded-lg bg-lime-400 text-slate-950 font-semibold inline-flex items-center gap-1"
          >
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
        </div>
      )}

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-500">Net Revenue</div>
          <div className="font-display text-2xl font-bold text-lime-600 dark:text-lime-400 mt-1">
            {formatINR(data.kpis.totalRevenuePaise)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">GST Collected: {formatINR(data.kpis.taxCollectedPaise)}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-500">Expenses &amp; Net Profit</div>
          <div className="font-display text-2xl font-bold mt-1">
            {formatINR(data.kpis.netProfitPaise)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Expenses: {formatINR(data.kpis.totalExpensesPaise)}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-500">Court Utilisation</div>
          <div className="font-display text-2xl font-bold text-sky-500 mt-1">
            {data.kpis.courtUtilisationPct}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{data.kpis.totalBookingsCount} bookings in window</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-500">Active Members &amp; Dues</div>
          <div className="font-display text-2xl font-bold mt-1">{data.kpis.activeMembersCount}</div>
          <div className="text-[11px] text-amber-500 mt-1">
            Receivables: {formatINR(data.kpis.outstandingDuesPaise)}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="font-display font-semibold text-base">Revenue vs Expenses Trend (₹)</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#9BA685" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => String(v).slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" name="Revenue (₹)" stroke="#637545" fill="#637545" fillOpacity={0.2} />
                <Area type="monotone" dataKey="expenses" name="Expenses (₹)" stroke="#9BA685" fill="#9BA685" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="font-display font-semibold text-base">Revenue by Source (₹)</h2>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sourceData} dataKey="amountInr" nameKey="source" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {sourceData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
            {data.revenueBySource.map((s, idx) => (
              <div key={s.source} className="flex items-center justify-between gap-2">
                <span className="text-slate-500 truncate">
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                  {s.source.replace('_', ' ')}
                </span>
                <span className="font-mono font-semibold">{formatINR(s.amountPaise)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Methods + Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="font-display font-semibold text-base">Revenue by Payment Method (₹)</h2>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={methodData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#9BA685" opacity={0.3} />
                <XAxis dataKey="method" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="amountInr" name="Amount (₹)" fill="#637545" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 overflow-x-auto">
          <h2 className="font-display font-semibold text-base">Court Utilisation Heatmap (Bookings by Day × Hour)</h2>
          <table className="w-full text-[11px] text-center tabular-nums">
            <thead>
              <tr className="text-slate-500">
                <th className="py-1 text-left">Hour</th>
                {DAYS.map((d) => (
                  <th key={d} className="py-1">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOURS.map((hr) => (
                <tr key={hr}>
                  <td className="py-1 text-left font-mono text-slate-500">{hr}:00</td>
                  {DAYS.map((d) => {
                    const count = (data.heatmapBuckets[`${d}-${hr}`] || 0) + (data.heatmapBuckets[`${d}-${String(Number(hr) + 1).padStart(2, '0')}`] || 0);
                    const cls =
                      count >= 6
                        ? 'bg-lime-400 text-slate-950 font-bold'
                        : count >= 3
                          ? 'bg-lime-400/50 text-slate-900 dark:text-white'
                          : count > 0
                            ? 'bg-lime-400/20'
                            : 'bg-slate-100 dark:bg-slate-800/50 text-slate-400';
                    return (
                      <td key={d} className="p-0.5">
                        <div className={`py-1.5 rounded ${cls}`}>{count}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Items & Operational Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="font-display font-semibold text-base">Top Pro Shop Products</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
            {data.topProducts.map((p) => (
              <div key={p.name} className="py-2 flex justify-between gap-2">
                <span className="truncate">{p.name} ({p.qty})</span>
                <span className="font-mono font-semibold shrink-0">{formatINR(p.revenuePaise)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="font-display font-semibold text-base">Top Bar &amp; Cafeteria Items</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
            {data.topBarItems.map((b) => (
              <div key={b.name} className="py-2 flex justify-between gap-2">
                <span className="truncate">{b.name} ({b.qty})</span>
                <span className="font-mono font-semibold shrink-0">{formatINR(b.revenuePaise)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="font-display font-semibold text-base">Action Alerts</h3>
          <div className="space-y-2 tabular-nums">
            <div className="flex justify-between">
              <span className="text-slate-500">Expiring Members (≤14d)</span>
              <span className="font-mono font-bold text-amber-500">{data.kpis.expiringSoonCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Low Stock SKUs</span>
              <span className="font-mono font-bold text-rose-500">{data.alerts.lowStockItems.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Pending Leave Requests</span>
              <span className="font-mono font-bold">{data.alerts.pendingLeavesCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Overdue Invoices</span>
              <span className="font-mono font-bold text-rose-500">{data.alerts.overdueInvoices.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Payables Due</span>
              <span className="font-mono font-bold">{formatINR(data.kpis.payablesPaise)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OwnerDashboardPage() {
  const today = getTodayIstStr();
  const [period, setPeriod] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>('MONTH');
  const [customStart, setCustomStart] = useState(addDaysStr(today, -29));
  const [customEnd, setCustomEnd] = useState(today);

  const { data, isLoading } = useQuery<OwnerDashboardPayload>({
    queryKey: ['owner-dashboard', period, customStart, customEnd],
    queryFn: () =>
      apiFetch(
        `/finance/dashboard?period=${period}${
          period === 'CUSTOM' ? `&startDate=${customStart}&endDate=${customEnd}` : ''
        }`
      ),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold">Owner Executive Dashboard</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time financial performance, court utilisation heatmap, GST position, and operational alerts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl">
            {(['TODAY', 'WEEK', 'MONTH', 'CUSTOM'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  period === p ? 'bg-white dark:bg-lime-400 text-slate-950 shadow-sm' : 'text-slate-500'
                }`}
              >
                {p === 'TODAY' ? 'Today' : p === 'WEEK' ? 'This Week' : p === 'MONTH' ? 'This Month' : 'Custom'}
              </button>
            ))}
          </div>

          {period === 'CUSTOM' && (
            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
              <span>–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
          )}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="py-20 text-center text-sm text-slate-500">Loading financial analytics...</div>
      ) : (
        <DashboardReportView data={data} />
      )}
    </div>
  );
}
