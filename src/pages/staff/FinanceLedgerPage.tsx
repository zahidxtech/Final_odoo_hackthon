import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus, Printer, X } from 'lucide-react';
import { apiFetch, ApiError } from '../../lib/api';
import { addDaysStr, formatINR, formatIstDate, getTodayIstStr } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

interface TxRow {
  id: number;
  txType: 'INCOME' | 'EXPENSE' | 'REFUND';
  source: string;
  paymentMethod: string;
  amountPaise: number;
  taxPaise: number;
  description: string;
  occurredAt: string;
}

interface ExpenseRow {
  id: number;
  category: string;
  vendorName: string;
  description: string;
  amountPaise: number;
  taxPaise: number;
  expenseDate: string;
  dueDate: string | null;
  status: 'PAID' | 'PAYABLE';
}

interface ClientRow {
  id: number;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  gstNumber: string | null;
  billingAddress: string;
}

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  invoiceType: string;
  issueDate: string;
  dueDate: string;
  status: string;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  paidPaise: number;
  notes: string | null;
  client: ClientRow | null;
  member: { fullName: string; memberCode: string } | null;
  items: Array<{ id: number; description: string; quantity: number; unitPricePaise: number; taxRatePct: number; lineTotalPaise: number }>;
}

interface AuditLogRow {
  id: number;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  detailsJson: string;
  createdAt: string;
}

interface SettingRow {
  key: string;
  value: string;
  updatedAt: string;
}

export function FinanceLedgerPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'LEDGER' | 'INVOICES' | 'EXPENSES' | 'TAX' | 'AUDIT' | 'SETTINGS'>('LEDGER');
  const [txFilter, setTxFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE' | 'REFUND'>('ALL');
  const [printInvoice, setPrintInvoice] = useState<InvoiceRow | null>(null);

  const { data: ledgerData } = useQuery<{ transactions: TxRow[] }>({
    queryKey: ['finance-ledger'],
    queryFn: () => apiFetch('/finance/ledger'),
  });

  const { data: expensesData, refetch: refetchExpenses } = useQuery<{ expenses: ExpenseRow[] }>({
    queryKey: ['finance-expenses'],
    queryFn: () => apiFetch('/finance/expenses'),
  });

  const { data: invoicesData, refetch: refetchInvoices } = useQuery<{ clients: ClientRow[]; invoices: InvoiceRow[] }>({
    queryKey: ['finance-invoices'],
    queryFn: () => apiFetch('/finance/invoices'),
  });

  const { data: auditData } = useQuery<{ logs: AuditLogRow[] }>({
    queryKey: ['finance-audit'],
    queryFn: () => apiFetch('/finance/audit-logs'),
    enabled: tab === 'AUDIT',
  });

  const { data: settingsData, refetch: refetchSettings } = useQuery<{ settings: SettingRow[] }>({
    queryKey: ['finance-settings'],
    queryFn: () => apiFetch('/finance/settings'),
    enabled: tab === 'SETTINGS',
  });

  // Add Expense form
  const [expCategory, setExpCategory] = useState<'RENT' | 'UTILITIES' | 'SALARIES' | 'INVENTORY_PURCHASE' | 'MAINTENANCE' | 'MARKETING'>('MAINTENANCE');
  const [expVendor, setExpVendor] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expAmountInr, setExpAmountInr] = useState(5000);
  const [expTaxInr, setExpTaxInr] = useState(900);
  const [expStatus, setExpStatus] = useState<'PAID' | 'PAYABLE'>('PAID');

  // Create Corporate Client & Invoice forms
  const [showClientModal, setShowClientModal] = useState(false);
  const [cName, setCName] = useState('');
  const [cContact, setCContact] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cGst, setCGst] = useState('');
  const [cAddr, setCAddr] = useState('');

  const [invClientId, setInvClientId] = useState<number>(1);
  const [invDesc, setInvDesc] = useState('Annual Corporate Wellness & Court Block');
  const [invQty, setInvQty] = useState(1);
  const [invUnitInr, setInvUnitInr] = useState(25000);
  const [invTaxPct, setInvTaxPct] = useState(18);

  // Settings drafts
  const [settingEdits, setSettingEdits] = useState<Record<string, string>>({});

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category: expCategory,
          vendorName: expVendor,
          description: expDesc,
          amountPaise: Math.round(expAmountInr * 100),
          taxPaise: Math.round(expTaxInr * 100),
          expenseDate: getTodayIstStr(),
          status: expStatus,
          isRecurring: false,
        }),
      });
      toast('Expense recorded!', 'success');
      setExpVendor('');
      setExpDesc('');
      refetchExpenses();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to record expense.', 'error');
    }
  };

  const handleMarkExpensePaid = async (id: number) => {
    try {
      await apiFetch(`/finance/expenses/${id}/pay`, { method: 'POST' });
      toast('Expense marked as paid & posted to ledger!', 'success');
      refetchExpenses();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed.', 'error');
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ client: ClientRow }>('/finance/clients', {
        method: 'POST',
        body: JSON.stringify({
          companyName: cName,
          contactPerson: cContact,
          email: cEmail,
          phone: cPhone,
          gstNumber: cGst || undefined,
          billingAddress: cAddr,
        }),
      });
      toast(`Client ${res.client.companyName} added!`, 'success');
      setShowClientModal(false);
      setInvClientId(res.client.id);
      refetchInvoices();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to create client.', 'error');
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/finance/invoices', {
        method: 'POST',
        body: JSON.stringify({
          clientId: invClientId,
          dueDate: addDaysStr(getTodayIstStr(), 15),
          items: [
            {
              description: invDesc,
              quantity: invQty,
              unitPricePaise: Math.round(invUnitInr * 100),
              taxRatePct: invTaxPct,
            },
          ],
        }),
      });
      toast('Corporate invoice generated!', 'success');
      refetchInvoices();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to create invoice.', 'error');
    }
  };

  const handlePayInvoice = async (inv: InvoiceRow) => {
    const remaining = inv.totalPaise - inv.paidPaise;
    if (remaining <= 0) return;
    try {
      await apiFetch(`/finance/invoices/${inv.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ amountPaise: remaining, method: 'BANK_TRANSFER' }),
      });
      toast(`Invoice ${inv.invoiceNumber} marked PAID`, 'success');
      refetchInvoices();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Payment recording failed.', 'error');
    }
  };

  const handleSaveSetting = async (key: string, currentValue: string) => {
    const nextVal = settingEdits[key] ?? currentValue;
    try {
      await apiFetch(`/finance/settings/${key}`, {
        method: 'PATCH',
        body: JSON.stringify({ value: nextVal }),
      });
      toast(`Updated setting ${key}`, 'success');
      refetchSettings();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Update failed.', 'error');
    }
  };

  const transactions = (ledgerData?.transactions || []).filter((t) => txFilter === 'ALL' || t.txType === txFilter);
  const taxCollected = (ledgerData?.transactions || [])
    .filter((t) => t.txType === 'INCOME')
    .reduce((acc, t) => acc + t.taxPaise, 0);
  const inputCredit = (ledgerData?.transactions || [])
    .filter((t) => t.txType === 'EXPENSE')
    .reduce((acc, t) => acc + t.taxPaise, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold">Finance, Invoices, Taxes &amp; Club Settings</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Unified ledger, corporate B2B invoicing, expense payables, GST summary, audit log, and club policy config.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl overflow-x-auto">
          {[
            { id: 'LEDGER', label: 'Unified Ledger' },
            { id: 'INVOICES', label: 'Invoices & Clients' },
            { id: 'EXPENSES', label: 'Expenses & Payables' },
            { id: 'TAX', label: 'GST Summary' },
            { id: 'AUDIT', label: 'Audit Log' },
            { id: 'SETTINGS', label: 'Settings' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap ${
                tab === t.id ? 'bg-white dark:bg-lime-400 text-slate-950 shadow-sm' : 'text-slate-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'LEDGER' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display font-semibold">Transaction Ledger (Latest 300)</h2>
            <div className="flex gap-1.5">
              {(['ALL', 'INCOME', 'EXPENSE', 'REFUND'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTxFilter(f)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold ${
                    txFilter === f ? 'bg-slate-900 text-white dark:bg-lime-400 dark:text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type · Source</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3 text-right">Tax (GST)</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2.5 font-mono">{formatIstDate(t.occurredAt)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          t.txType === 'INCOME'
                            ? 'text-emerald-500 font-semibold'
                            : t.txType === 'EXPENSE'
                              ? 'text-rose-500 font-semibold'
                              : 'text-amber-500 font-semibold'
                        }
                      >
                        {t.txType}
                      </span>{' '}
                      · {t.source}
                    </td>
                    <td className="px-4 py-2.5">{t.description}</td>
                    <td className="px-4 py-2.5 font-mono">{t.paymentMethod}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">{formatINR(t.taxPaise)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{formatINR(t.amountPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'INVOICES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-display font-semibold">Invoices ({invoicesData?.invoices.length || 0})</h2>
              <button
                type="button"
                onClick={() => setShowClientModal(true)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Corporate Client
              </button>
            </div>
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-500">
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Billed To</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                {(invoicesData?.invoices || []).map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 font-mono font-semibold">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3">
                      {inv.client?.companyName || inv.member?.fullName || 'Client'} · {inv.invoiceType}
                    </td>
                    <td className="px-4 py-3 font-mono">{formatIstDate(inv.dueDate)}</td>
                    <td className="px-4 py-3 font-semibold">
                      <span
                        className={
                          inv.status === 'PAID'
                            ? 'text-emerald-500'
                            : inv.status === 'OVERDUE'
                              ? 'text-rose-500'
                              : 'text-amber-500'
                        }
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{formatINR(inv.totalPaise)}</td>
                    <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setPrintInvoice(inv)}
                        className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 font-semibold"
                      >
                        Print View
                      </button>
                      {inv.status !== 'PAID' && (
                        <button
                          type="button"
                          onClick={() => handlePayInvoice(inv)}
                          className="px-2.5 py-1 rounded bg-lime-400 text-slate-950 font-semibold"
                        >
                          Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={handleCreateInvoice}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 self-start"
          >
            <h3 className="font-display font-semibold">Issue Corporate Invoice</h3>
            <select
              value={invClientId}
              onChange={(e) => setInvClientId(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
            >
              {(invoicesData?.clients || []).map((c) => (
                <option key={c.id} value={c.id}>{c.companyName}</option>
              ))}
            </select>
            <input
              required
              value={invDesc}
              onChange={(e) => setInvDesc(e.target.value)}
              placeholder="Line item description"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Qty</label>
                <input
                  type="number"
                  min={1}
                  value={invQty}
                  onChange={(e) => setInvQty(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Unit (₹)</label>
                <input
                  type="number"
                  min={1}
                  value={invUnitInr}
                  onChange={(e) => setInvUnitInr(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">GST %</label>
                <input
                  type="number"
                  min={0}
                  max={28}
                  value={invTaxPct}
                  onChange={(e) => setInvTaxPct(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
              </div>
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-lime-400 text-slate-950 text-xs font-semibold">
              Create &amp; Send Invoice
            </button>
          </form>
        </div>
      )}

      {tab === 'EXPENSES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 font-display font-semibold">
              Club Expenses &amp; Vendor Payables
            </div>
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Category · Vendor</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Total incl. GST</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                {(expensesData?.expenses || []).map((ex) => (
                  <tr key={ex.id}>
                    <td className="px-4 py-3 font-mono">{formatIstDate(ex.expenseDate)}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{ex.vendorName}</div>
                      <div className="text-slate-500">{ex.category}</div>
                    </td>
                    <td className="px-4 py-3">{ex.description}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{formatINR(ex.amountPaise + ex.taxPaise)}</td>
                    <td className="px-4 py-3 text-right">
                      {ex.status === 'PAYABLE' ? (
                        <button
                          type="button"
                          onClick={() => handleMarkExpensePaid(ex.id)}
                          className="px-2.5 py-1 rounded bg-amber-400 text-slate-950 font-semibold"
                        >
                          Pay Payable
                        </button>
                      ) : (
                        <span className="text-emerald-500 font-semibold">PAID</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={handleAddExpense}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 self-start"
          >
            <h3 className="font-display font-semibold">Record Expense / Payable</h3>
            <select
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value as typeof expCategory)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
            >
              <option value="RENT">Rent</option>
              <option value="UTILITIES">Utilities</option>
              <option value="INVENTORY_PURCHASE">Inventory Purchase</option>
              <option value="MAINTENANCE">Court Maintenance</option>
              <option value="MARKETING">Marketing</option>
              <option value="SALARIES">Salaries</option>
            </select>
            <input
              required
              value={expVendor}
              onChange={(e) => setExpVendor(e.target.value)}
              placeholder="Vendor name"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
            <input
              required
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              placeholder="Description"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Base (₹)</label>
                <input
                  type="number"
                  min={1}
                  value={expAmountInr}
                  onChange={(e) => setExpAmountInr(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Input GST (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={expTaxInr}
                  onChange={(e) => setExpTaxInr(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
              </div>
            </div>
            <select
              value={expStatus}
              onChange={(e) => setExpStatus(e.target.value as 'PAID' | 'PAYABLE')}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
            >
              <option value="PAID">Paid Immediately</option>
              <option value="PAYABLE">Add to Accounts Payable</option>
            </select>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-lime-400 text-slate-950 text-xs font-semibold">
              Save Expense
            </button>
          </form>
        </div>
      )}

      {tab === 'TAX' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-w-2xl space-y-4 tabular-nums">
          <h2 className="font-display text-lg font-bold">GST Tax Collected vs Input Tax Credit</h2>
          <p className="text-xs text-slate-500">
            18% GST on Memberships, Pro Shop &amp; Corporate Invoices; 5% GST on Bar &amp; Cafeteria F&amp;B.
          </p>
          <div className="space-y-3 text-sm border-t border-b border-slate-200 dark:border-slate-800 py-4">
            <div className="flex justify-between">
              <span>Output GST Collected (Sales &amp; Memberships)</span>
              <span className="font-mono font-bold">{formatINR(taxCollected)}</span>
            </div>
            <div className="flex justify-between text-emerald-500">
              <span>Input Tax Credit (Vendor Purchases &amp; Expenses)</span>
              <span className="font-mono font-bold">-{formatINR(inputCredit)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200 dark:border-slate-800">
              <span>Net GST Liability Payable</span>
              <span className="font-mono text-lime-600 dark:text-lime-400">
                {formatINR(Math.max(0, taxCollected - inputCredit))}
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === 'AUDIT' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 font-display font-semibold">
            Security &amp; Operations Audit Trail
          </div>
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-500">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(auditData?.logs || []).map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2.5 font-mono whitespace-nowrap">{formatIstDate(log.createdAt)}</td>
                  <td className="px-4 py-2.5 font-semibold">{log.actorName}</td>
                  <td className="px-4 py-2.5 font-mono text-lime-600 dark:text-lime-400">{log.action}</td>
                  <td className="px-4 py-2.5 font-mono">{log.entityType} #{log.entityId}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-500 max-w-md truncate">{log.detailsJson}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'SETTINGS' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-w-2xl space-y-4">
          <h2 className="font-display text-lg font-bold">Club Policies &amp; Tax Rates</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(settingsData?.settings || []).map((st) => (
              <div key={st.key} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-mono font-semibold">{st.key}</div>
                  <div className="text-slate-400">Updated {formatIstDate(st.updatedAt)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={settingEdits[st.key] ?? st.value}
                    onChange={(e) => setSettingEdits((prev) => ({ ...prev, [st.key]: e.target.value }))}
                    className="w-32 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveSetting(st.key, st.value)}
                    className="px-3 py-1.5 rounded-lg bg-lime-400 text-slate-950 font-semibold inline-flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Save
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Corporate Client Modal */}
      {showClientModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateClient}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">Add Corporate Client</h3>
              <button type="button" onClick={() => setShowClientModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <input required value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Company Name" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs" />
            <input required value={cContact} onChange={(e) => setCContact(e.target.value)} placeholder="Contact Person" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs" />
            <div className="grid grid-cols-2 gap-2">
              <input required type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="Email" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs" />
              <input required value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="Phone" className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs" />
            </div>
            <input value={cGst} onChange={(e) => setCGst(e.target.value)} placeholder="GSTIN (optional)" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs" />
            <input required value={cAddr} onChange={(e) => setCAddr(e.target.value)} placeholder="Billing Address" className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs" />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-lime-400 text-slate-950 font-semibold text-xs">
              Save Client
            </button>
          </form>
        </div>
      )}

      {/* Printable Invoice Modal */}
      {printInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white text-slate-900 rounded-2xl p-8 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="font-display text-xl font-bold">Alpha Sports Club — Tax Invoice</h3>
                <div className="text-xs font-mono text-slate-500">{printInvoice.invoiceNumber}</div>
              </div>
              <button type="button" onClick={() => setPrintInvoice(null)} className="no-print text-slate-400 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-slate-500">Billed To</div>
                <div className="font-semibold text-sm">{printInvoice.client?.companyName || printInvoice.member?.fullName}</div>
                {printInvoice.client?.gstNumber && <div className="font-mono">GSTIN: {printInvoice.client.gstNumber}</div>}
                {printInvoice.client?.billingAddress && <div className="text-slate-500">{printInvoice.client.billingAddress}</div>}
              </div>
              <div className="text-right">
                <div>Issue Date: <span className="font-mono">{formatIstDate(printInvoice.issueDate)}</span></div>
                <div>Due Date: <span className="font-mono">{formatIstDate(printInvoice.dueDate)}</span></div>
                <div className="font-semibold mt-1">Status: {printInvoice.status}</div>
              </div>
            </div>
            <table className="w-full text-xs text-left border-t border-b border-slate-200">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2">Description</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Unit</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {printInvoice.items.map((it) => (
                  <tr key={it.id}>
                    <td className="py-2">{it.description} ({it.taxRatePct}% GST)</td>
                    <td className="py-2 text-right font-mono">{it.quantity}</td>
                    <td className="py-2 text-right font-mono">{formatINR(it.unitPricePaise)}</td>
                    <td className="py-2 text-right font-mono">{formatINR(it.lineTotalPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 text-xs text-right tabular-nums">
              <div>Subtotal: <span className="font-mono">{formatINR(printInvoice.subtotalPaise)}</span></div>
              <div>GST: <span className="font-mono">{formatINR(printInvoice.taxPaise)}</span></div>
              <div className="text-base font-bold">Total: <span className="font-mono">{formatINR(printInvoice.totalPaise)}</span></div>
              <div className="text-emerald-600">Paid: <span className="font-mono">{formatINR(printInvoice.paidPaise)}</span></div>
            </div>
            <div className="flex justify-end no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" /> Print Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
