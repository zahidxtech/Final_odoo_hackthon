import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { apiFetch, ApiError } from '../../lib/api';
import { formatINR, formatIstTime, getTodayIstStr } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

export function BarKdsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'POS' | 'KDS' | 'TABS' | 'MENU' | 'CLOSING'>('POS');
  const [selectedTableId, setSelectedTableId] = useState<number | null>(1);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [cart, setCart] = useState<Array<{ menuItemId: number; name: string; pricePaise: number; qty: number }>>([]);
  const [payMethod, setPayMethod] = useState<'CASH' | 'CARD' | 'UPI'>('CARD');
  const [chargeToTab, setChargeToTab] = useState(false);

  const { data: menuData, refetch: refetchMenu } = useQuery<{
    items: Array<{ id: number; name: string; category: string; pricePaise: number; isAvailable: boolean }>;
  }>({
    queryKey: ['bar-menu'],
    queryFn: () => apiFetch('/bar/menu'),
  });

  const { data: tablesData, refetch: refetchTables } = useQuery<{
    tables: Array<{ id: number; tableNumber: string; zone: string; seats: number; status: string; memberName: string | null; unpaidTotalPaise: number }>;
  }>({
    queryKey: ['bar-tables'],
    queryFn: () => apiFetch('/bar/tables'),
    refetchInterval: 10000,
  });

  const { data: kdsData, refetch: refetchKds } = useQuery<{
    orders: Array<{
      id: number;
      orderNumber: string;
      tableNumber: string | null;
      memberName: string | null;
      staffName: string;
      kdsStatus: string;
      billingStatus: string;
      totalPaise: number;
      createdAt: string;
      items: Array<{ id: number; itemName: string; quantity: number }>;
    }>;
  }>({
    queryKey: ['bar-kds'],
    queryFn: () => apiFetch('/bar/orders/kds'),
    refetchInterval: 8000,
  });

  const { data: tabsData, refetch: refetchTabs } = useQuery<{
    tabs: Array<{
      id: number;
      memberId: number;
      memberName: string;
      memberCode: string;
      status: string;
      totalPaise: number;
      paidPaise: number;
      balanceDuePaise: number;
    }>;
  }>({
    queryKey: ['bar-tabs'],
    queryFn: () => apiFetch('/bar/tabs'),
  });

  const { data: memberLookup } = useQuery<{
    members: Array<{ id: number; fullName: string; memberCode: string; plan?: { barDiscountPct: number; name: string } }>;
  }>({
    queryKey: ['bar-member-lookup', memberSearch],
    queryFn: () => apiFetch(`/members?q=${encodeURIComponent(memberSearch)}`),
    enabled: memberSearch.trim().length >= 2,
  });

  const [closingDate, setClosingDate] = useState(getTodayIstStr());
  const { data: closingData } = useQuery<{
    report: {
      date: string;
      orderCount: number;
      totalBilledPaise: number;
      totalCollectedPaise: number;
      totalDiscountsPaise: number;
      totalTaxPaise: number;
      outstandingTabBalancePaise: number;
      byPaymentMethod: Record<string, number>;
      topItems: Array<{ name: string; quantity: number; revenuePaise: number }>;
      byStaff: Array<{ staffName: string; orderCount: number; salesPaise: number }>;
    };
  }>({
    queryKey: ['bar-closing', closingDate],
    queryFn: () => apiFetch(`/bar/closing-report?date=${closingDate}`),
  });

  const selectedMemberObj = memberLookup?.members.find((m) => m.id === selectedMemberId);
  const barDiscPct = selectedMemberObj?.plan?.barDiscountPct || 0;
  const subtotal = cart.reduce((acc, i) => acc + i.pricePaise * i.qty, 0);
  const discount = Math.round((subtotal * barDiscPct) / 100);
  const tax = Math.round(((subtotal - discount) * 5) / 100);
  const total = subtotal - discount + tax;

  const submitBarOrder = async () => {
    if (cart.length === 0) return;
    try {
      await apiFetch('/bar/orders', {
        method: 'POST',
        body: JSON.stringify({
          tableId: selectedTableId,
          memberId: selectedMemberId,
          chargeToTab,
          paymentMethod: chargeToTab ? undefined : payMethod,
          items: cart.map((c) => ({ menuItemId: c.menuItemId, quantity: c.qty })),
        }),
      });
      toast(chargeToTab ? 'Order added to member tab & sent to KDS!' : 'Bar order paid & sent to KDS!', 'success');
      setCart([]);
      refetchKds();
      refetchTables();
      refetchTabs();
      queryClient.invalidateQueries({ queryKey: ['bar-closing'] });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to create bar order.', 'error');
    }
  };

  const advanceKds = async (orderId: number, nextStatus: 'PREPARING' | 'READY' | 'SERVED') => {
    await apiFetch(`/bar/orders/${orderId}/kds`, {
      method: 'PATCH',
      body: JSON.stringify({ kdsStatus: nextStatus }),
    });
    refetchKds();
  };

  const handleSettleTab = async (tabId: number, amountPaise: number, method: 'CASH' | 'CARD' | 'UPI') => {
    try {
      await apiFetch(`/bar/tabs/${tabId}/settle`, {
        method: 'POST',
        body: JSON.stringify({ payments: [{ method, amountPaise }] }),
      });
      toast('Member tab settled!', 'success');
      refetchTabs();
      queryClient.invalidateQueries({ queryKey: ['bar-closing'] });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to settle tab.', 'error');
    }
  };

  const toggleMenuAvail = async (id: number, isAvailable: boolean) => {
    await apiFetch(`/bar/menu/${id}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ isAvailable }),
    });
    refetchMenu();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Bar, Cafeteria &amp; Kitchen Display</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Table management, automatic member discounts, live KDS queue, member tabs, and daily closing report.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl overflow-x-auto">
          {[
            { id: 'POS', label: 'Tables & Order Pad' },
            { id: 'KDS', label: 'Kitchen Display (KDS)' },
            { id: 'TABS', label: 'Member Tabs' },
            { id: 'MENU', label: 'Menu Toggle' },
            { id: 'CLOSING', label: 'Closing Report' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
                tab === t.id ? 'bg-white dark:bg-lime-400 text-slate-950 shadow-sm' : 'text-slate-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'POS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            {/* Tables Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {(tablesData?.tables || []).map((tbl) => (
                <button
                  key={tbl.id}
                  type="button"
                  onClick={() => setSelectedTableId(tbl.id)}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    selectedTableId === tbl.id
                      ? 'border-lime-400 bg-lime-400/10'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>{tbl.tableNumber}</span>
                    <span
                      className={
                        tbl.status === 'FREE'
                          ? 'text-emerald-500'
                          : tbl.status === 'OCCUPIED'
                            ? 'text-amber-500'
                            : 'text-rose-500'
                      }
                    >
                      {tbl.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-1">{tbl.memberName || tbl.zone}</div>
                </button>
              ))}
            </div>

            {/* Menu Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[460px] overflow-y-auto pr-1">
              {(menuData?.items || [])
                .filter((m) => m.isAvailable)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setCart((prev) => {
                        const ex = prev.find((i) => i.menuItemId === m.id);
                        if (ex) return prev.map((i) => (i.menuItemId === m.id ? { ...i, qty: i.qty + 1 } : i));
                        return [...prev, { menuItemId: m.id, name: m.name, pricePaise: m.pricePaise, qty: 1 }];
                      });
                    }}
                    className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-lime-400 rounded-xl p-3.5 space-y-1"
                  >
                    <div className="text-[10px] text-slate-500 uppercase">{m.category}</div>
                    <div className="font-medium text-xs line-clamp-1">{m.name}</div>
                    <div className="font-mono text-xs font-bold text-lime-600 dark:text-lime-400">{formatINR(m.pricePaise)}</div>
                  </button>
                ))}
            </div>
          </div>

          {/* Ticket Builder */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 self-start">
            <h2 className="font-display font-semibold text-base">
              Order Ticket · {tablesData?.tables.find((t) => t.id === selectedTableId)?.tableNumber || 'Counter'}
            </h2>
            <div className="space-y-2">
              <input
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Attach member (for discount / tab)..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
              {memberLookup && memberSearch.trim().length >= 2 && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-32 overflow-y-auto">
                  {memberLookup.members.slice(0, 4).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedMemberId(m.id);
                        setMemberSearch(m.fullName);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex justify-between"
                    >
                      <span>{m.fullName}</span>
                      <span className="font-mono text-lime-500">{m.plan?.barDiscountPct ?? 0}% off</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto text-xs">
              {cart.length === 0 ? (
                <div className="py-6 text-center text-slate-500">Tap menu items to add.</div>
              ) : (
                cart.map((c) => (
                  <div key={c.menuItemId} className="py-2 flex justify-between items-center">
                    <span>{c.name} ×{c.qty}</span>
                    <span className="font-mono">{formatINR(c.pricePaise * c.qty)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1 text-xs tabular-nums">
              <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{formatINR(subtotal)}</span></div>
              {discount > 0 && (
                <div className="flex justify-between text-lime-500">
                  <span>Member Discount ({barDiscPct}%)</span><span className="font-mono">-{formatINR(discount)}</span>
                </div>
              )}
              <div className="flex justify-between"><span>F&amp;B GST (5%)</span><span className="font-mono">{formatINR(tax)}</span></div>
              <div className="flex justify-between font-bold text-sm pt-1"><span>Total</span><span className="font-mono">{formatINR(total)}</span></div>
            </div>

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={chargeToTab}
                disabled={!selectedMemberId}
                onChange={(e) => setChargeToTab(e.target.checked)}
              />
              Charge to Member Running Tab
            </label>

            {!chargeToTab && (
              <div className="grid grid-cols-3 gap-2">
                {(['CARD', 'UPI', 'CASH'] as const).map((pm) => (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => setPayMethod(pm)}
                    className={`py-2 rounded-lg text-xs font-semibold border ${
                      payMethod === pm ? 'bg-slate-900 text-white dark:bg-lime-400 dark:text-slate-950 border-transparent' : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {pm}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={cart.length === 0}
              onClick={submitBarOrder}
              className="w-full py-3 rounded-xl bg-lime-400 text-slate-950 font-semibold text-sm hover:bg-lime-300 disabled:opacity-40"
            >
              Send to Kitchen &amp; {chargeToTab ? 'Add to Tab' : `Pay ${formatINR(total)}`}
            </button>
          </div>
        </div>
      )}

      {tab === 'KDS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(['NEW', 'PREPARING', 'READY', 'SERVED'] as const).map((col) => {
            const colOrders = (kdsData?.orders || []).filter((o) => o.kdsStatus === col).slice(0, 12);
            return (
              <div key={col} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold pb-2 border-b border-slate-200 dark:border-slate-800">
                  <span>{col}</span>
                  <span className="font-mono">{colOrders.length}</span>
                </div>
                <div className="space-y-3">
                  {colOrders.map((o) => (
                    <div key={o.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                      <div className="flex justify-between font-mono font-semibold">
                        <span>{o.orderNumber}</span>
                        <span>{o.tableNumber || 'Counter'}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {formatIstTime(o.createdAt)} · By {o.staffName}
                      </div>
                      <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                        {o.items.map((it) => (
                          <li key={it.id}>{it.quantity}× {it.itemName}</li>
                        ))}
                      </ul>
                      {col === 'NEW' && (
                        <button
                          type="button"
                          onClick={() => advanceKds(o.id, 'PREPARING')}
                          className="w-full py-1.5 rounded bg-amber-400 text-slate-950 font-semibold"
                        >
                          Start Preparing
                        </button>
                      )}
                      {col === 'PREPARING' && (
                        <button
                          type="button"
                          onClick={() => advanceKds(o.id, 'READY')}
                          className="w-full py-1.5 rounded bg-sky-500 text-white font-semibold"
                        >
                          Mark Ready
                        </button>
                      )}
                      {col === 'READY' && (
                        <button
                          type="button"
                          onClick={() => advanceKds(o.id, 'SERVED')}
                          className="w-full py-1.5 rounded bg-lime-400 text-slate-950 font-semibold"
                        >
                          Mark Served
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'TABS' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs text-slate-500">
                <th className="px-6 py-3">Member</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Total</th>
                <th className="px-6 py-3 text-right">Balance Due</th>
                <th className="px-6 py-3 text-right">Settle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
              {(tabsData?.tabs || []).map((t) => (
                <tr key={t.id}>
                  <td className="px-6 py-3.5 font-medium">{t.memberName} ({t.memberCode})</td>
                  <td className="px-6 py-3.5 text-xs font-semibold">{t.status}</td>
                  <td className="px-6 py-3.5 text-right font-mono">{formatINR(t.totalPaise)}</td>
                  <td className="px-6 py-3.5 text-right font-mono font-bold text-amber-500">{formatINR(t.balanceDuePaise)}</td>
                  <td className="px-6 py-3.5 text-right space-x-2">
                    {t.status === 'OPEN' && t.balanceDuePaise > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSettleTab(t.id, t.balanceDuePaise, 'UPI')}
                          className="px-3 py-1 rounded bg-lime-400 text-slate-950 text-xs font-semibold"
                        >
                          Settle UPI
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSettleTab(t.id, t.balanceDuePaise, 'CARD')}
                          className="px-3 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                        >
                          Card
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'MENU' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs text-slate-500">
                <th className="px-6 py-3">Item</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3 text-right">Price</th>
                <th className="px-6 py-3 text-right">Availability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
              {(menuData?.items || []).map((m) => (
                <tr key={m.id}>
                  <td className="px-6 py-3 font-medium">{m.name}</td>
                  <td className="px-6 py-3 text-xs text-slate-500">{m.category}</td>
                  <td className="px-6 py-3 text-right font-mono">{formatINR(m.pricePaise)}</td>
                  <td className="px-6 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleMenuAvail(m.id, !m.isAvailable)}
                      className={`px-3 py-1 rounded text-xs font-semibold ${
                        m.isAvailable ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500'
                      }`}
                    >
                      {m.isAvailable ? 'Available' : 'Sold Out'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'CLOSING' && closingData && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium">Closing Date:</label>
              <input
                type="date"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold no-print"
            >
              <Printer className="w-4 h-4" /> Print Closing Sheet
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="text-xs text-slate-500">Collected Today</div>
              <div className="font-mono text-2xl font-bold mt-1">{formatINR(closingData.report.totalCollectedPaise)}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="text-xs text-slate-500">Cash / Card / UPI</div>
              <div className="font-mono text-xs mt-2 space-y-0.5">
                <div>Cash: {formatINR(closingData.report.byPaymentMethod.CASH)}</div>
                <div>Card: {formatINR(closingData.report.byPaymentMethod.CARD)}</div>
                <div>UPI: {formatINR(closingData.report.byPaymentMethod.UPI)}</div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="text-xs text-slate-500">Discounts Given</div>
              <div className="font-mono text-2xl font-bold mt-1">{formatINR(closingData.report.totalDiscountsPaise)}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="text-xs text-slate-500">Outstanding Tabs</div>
              <div className="font-mono text-2xl font-bold text-amber-500 mt-1">
                {formatINR(closingData.report.outstandingTabBalancePaise)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="font-display font-semibold">Top Selling Items</h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs tabular-nums">
                {closingData.report.topItems.map((it) => (
                  <div key={it.name} className="py-2 flex justify-between">
                    <span>{it.name} (×{it.quantity})</span>
                    <span className="font-mono">{formatINR(it.revenuePaise)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="font-display font-semibold">Sales by Staff</h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs tabular-nums">
                {closingData.report.byStaff.map((st) => (
                  <div key={st.staffName} className="py-2 flex justify-between">
                    <span>{st.staffName} ({st.orderCount} orders)</span>
                    <span className="font-mono">{formatINR(st.salesPaise)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
