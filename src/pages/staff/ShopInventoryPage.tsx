import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus } from 'lucide-react';
import { apiFetch, ApiError } from '../../lib/api';
import { formatINR, formatIstDate } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

export function ShopInventoryPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'STOCK' | 'ORDERS' | 'MOVEMENTS'>('STOCK');
  const [lowOnly, setLowOnly] = useState(false);

  const [restockTarget, setRestockTarget] = useState<{
    variantId: number;
    label: string;
    mode: 'RESTOCK' | 'ADJUSTMENT';
  } | null>(null);
  const [qtyDelta, setQtyDelta] = useState(10);
  const [unitCostInr, setUnitCostInr] = useState(500);
  const [reason, setReason] = useState('Supplier restock batch');

  const { data: productsData, refetch: refetchProducts } = useQuery<{
    products: Array<{
      id: number;
      name: string;
      category: string;
      brand: string;
      pricePaise: number;
      costPricePaise: number;
      reorderLevel: number;
      isLowStock: boolean;
      variants: Array<{ id: number; sku: string; size: string; color: string; stockQty: number }>;
    }>;
  }>({
    queryKey: ['staff-shop-products', lowOnly],
    queryFn: () => apiFetch(`/shop/products?lowStockOnly=${lowOnly}`),
  });

  const { data: ordersData, refetch: refetchOrders } = useQuery<{
    orders: Array<{
      id: number;
      orderNumber: string;
      customerName: string;
      channel: string;
      fulfilmentType: string;
      status: string;
      totalPaise: number;
      createdAt: string;
      items: Array<{ id: number; productName: string; quantity: number }>;
    }>;
  }>({
    queryKey: ['staff-shop-orders'],
    queryFn: () => apiFetch('/shop/orders'),
  });

  const { data: movementsData, refetch: refetchMovements } = useQuery<{
    movements: Array<{
      id: number;
      sku: string;
      productName: string;
      size: string;
      movementType: string;
      quantityDelta: number;
      reason: string;
      createdAt: string;
    }>;
  }>({
    queryKey: ['staff-shop-movements'],
    queryFn: () => apiFetch('/shop/movements'),
  });

  const { data: lowStockData } = useQuery<{
    items: Array<{ variantId: number; productName: string; sku: string; stockQty: number; reorderLevel: number }>;
  }>({
    queryKey: ['staff-low-stock'],
    queryFn: () => apiFetch('/shop/low-stock'),
  });

  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockTarget) return;
    try {
      await apiFetch('/shop/restock', {
        method: 'POST',
        body: JSON.stringify({
          variantId: restockTarget.variantId,
          quantityDelta: qtyDelta,
          movementType: restockTarget.mode,
          unitCostPaise: restockTarget.mode === 'RESTOCK' ? unitCostInr * 100 : null,
          reason,
        }),
      });
      toast('Inventory updated!', 'success');
      setRestockTarget(null);
      refetchProducts();
      refetchMovements();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Stock update failed.', 'error');
    }
  };

  const updateOrderStatus = async (
    orderId: number,
    status: 'CONFIRMED' | 'READY' | 'OUT_FOR_DELIVERY' | 'COMPLETED' | 'CANCELLED'
  ) => {
    try {
      await apiFetch(`/shop/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast(`Order updated to ${status}`, 'success');
      refetchOrders();
      refetchProducts();
      refetchMovements();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Status update failed.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Pro Shop &amp; Inventory</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Shared stock pool across Counter POS and Online Orders · Low-stock alerts: {lowStockData?.items.length || 0}
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl">
          {[
            { id: 'STOCK', label: 'Stock & Restock' },
            { id: 'ORDERS', label: 'Order Fulfilment' },
            { id: 'MOVEMENTS', label: 'Stock Movements' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold ${
                tab === t.id ? 'bg-white dark:bg-lime-400 text-slate-950 shadow-sm' : 'text-slate-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {lowStockData && lowStockData.items.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4 flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2.5 text-amber-700 dark:text-amber-300 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {lowStockData.items.length} SKU(s) at or below reorder threshold (e.g. {lowStockData.items[0].productName}: {lowStockData.items[0].stockQty} left)
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setTab('STOCK');
              setLowOnly((v) => !v);
            }}
            className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-semibold whitespace-nowrap"
          >
            {lowOnly ? 'Show All SKUs' : 'Filter Low Stock'}
          </button>
        </div>
      )}

      {tab === 'STOCK' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-500">
                  <th className="px-5 py-3">SKU</th>
                  <th className="px-5 py-3">Product / Variant</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3 text-right">Price</th>
                  <th className="px-5 py-3 text-right">Stock / Reorder</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                {(productsData?.products || []).flatMap((p) =>
                  p.variants.map((v) => {
                    const isLow = v.stockQty <= p.reorderLevel;
                    return (
                      <tr key={v.id}>
                        <td className="px-5 py-3 font-mono">{v.sku}</td>
                        <td className="px-5 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{p.name}</div>
                          <div className="text-slate-500">{v.size} · {v.color}</div>
                        </td>
                        <td className="px-5 py-3">{p.category}</td>
                        <td className="px-5 py-3 text-right font-mono">{formatINR(p.pricePaise)}</td>
                        <td className="px-5 py-3 text-right font-mono">
                          <span className={isLow ? 'text-rose-500 font-bold' : 'text-emerald-500 font-semibold'}>
                            {v.stockQty}
                          </span>{' '}
                          / {p.reorderLevel}
                        </td>
                        <td className="px-5 py-3 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRestockTarget({ variantId: v.id, label: `${p.name} (${v.size})`, mode: 'RESTOCK' });
                              setQtyDelta(12);
                              setReason('Supplier purchase restock');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-lime-400 text-slate-950 font-semibold"
                          >
                            <Plus className="w-3 h-3" /> Restock
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRestockTarget({ variantId: v.id, label: `${p.name} (${v.size})`, mode: 'ADJUSTMENT' });
                              setQtyDelta(-1);
                              setReason('Damaged / audit count adjustment');
                            }}
                            className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 font-semibold"
                          >
                            Adjust
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'ORDERS' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-500">
                  <th className="px-5 py-3">Order #</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Channel / Type</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-right">Workflow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                {(ordersData?.orders || []).slice(0, 40).map((o) => (
                  <tr key={o.id}>
                    <td className="px-5 py-3 font-mono font-semibold">{o.orderNumber}</td>
                    <td className="px-5 py-3">
                      <div>{o.customerName}</div>
                      <div className="text-slate-500">{o.items.map((i) => `${i.productName} ×${i.quantity}`).join(', ')}</div>
                    </td>
                    <td className="px-5 py-3">{o.channel} · {o.fulfilmentType}</td>
                    <td className="px-5 py-3 font-semibold">{o.status}</td>
                    <td className="px-5 py-3 text-right font-mono">{formatINR(o.totalPaise)}</td>
                    <td className="px-5 py-3 text-right space-x-1.5">
                      {o.status === 'PLACED' && (
                        <button onClick={() => updateOrderStatus(o.id, 'CONFIRMED')} className="px-2 py-1 rounded bg-sky-500 text-white font-semibold">Confirm</button>
                      )}
                      {o.status === 'CONFIRMED' && (
                        <button
                          onClick={() => updateOrderStatus(o.id, o.fulfilmentType === 'DELIVERY' ? 'OUT_FOR_DELIVERY' : 'READY')}
                          className="px-2 py-1 rounded bg-amber-400 text-slate-950 font-semibold"
                        >
                          {o.fulfilmentType === 'DELIVERY' ? 'Dispatch' : 'Ready'}
                        </button>
                      )}
                      {(o.status === 'READY' || o.status === 'OUT_FOR_DELIVERY') && (
                        <button onClick={() => updateOrderStatus(o.id, 'COMPLETED')} className="px-2 py-1 rounded bg-lime-400 text-slate-950 font-semibold">Complete</button>
                      )}
                      {!['COMPLETED', 'CANCELLED'].includes(o.status) && (
                        <button onClick={() => updateOrderStatus(o.id, 'CANCELLED')} className="px-2 py-1 rounded border border-rose-500/40 text-rose-500">Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'MOVEMENTS' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-500">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3 text-right">Delta</th>
                <th className="px-5 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
              {(movementsData?.movements || []).map((m) => (
                <tr key={m.id}>
                  <td className="px-5 py-3 font-mono">{formatIstDate(m.createdAt)}</td>
                  <td className="px-5 py-3">{m.productName} ({m.size})</td>
                  <td className="px-5 py-3 font-semibold">{m.movementType}</td>
                  <td className={`px-5 py-3 text-right font-mono font-bold ${m.quantityDelta > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {restockTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-display font-bold text-lg">
              {restockTarget.mode === 'RESTOCK' ? 'Restock Inventory' : 'Stock Adjustment'}
            </h3>
            <p className="text-xs text-slate-500">{restockTarget.label}</p>
            <form onSubmit={handleStockSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Quantity Change</label>
                <input
                  required
                  type="number"
                  value={qtyDelta}
                  onChange={(e) => setQtyDelta(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                />
              </div>
              {restockTarget.mode === 'RESTOCK' && (
                <div>
                  <label className="block text-xs font-medium mb-1">Unit Cost (₹)</label>
                  <input
                    type="number"
                    min={1}
                    value={unitCostInr}
                    onChange={(e) => setUnitCostInr(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium mb-1">Reason / Supplier Ref</label>
                <input
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setRestockTarget(null)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-lime-400 text-slate-950 text-xs font-semibold">
                  Apply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
