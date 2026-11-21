import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShopPage } from '../public/ShopPage';
import { apiFetch, ApiError } from '../../lib/api';
import { formatINR, formatIstDate } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

export function MemberShopPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: ordersData, refetch } = useQuery<{
    orders: Array<{
      id: number;
      orderNumber: string;
      fulfilmentType: string;
      status: string;
      subtotalPaise: number;
      discountPaise: number;
      totalPaise: number;
      createdAt: string;
      items: Array<{ id: number; productName: string; variantLabel: string; quantity: number }>;
    }>;
  }>({
    queryKey: ['shop-orders'],
    queryFn: () => apiFetch('/shop/orders'),
  });

  const handleCancelOrder = async (orderId: number) => {
    try {
      await apiFetch(`/shop/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      toast('Order cancelled and stock restored.', 'info');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['products'] });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Cannot cancel order.', 'error');
    }
  };

  return (
    <div className="space-y-10">
      {ordersData && ordersData.orders.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display text-lg font-semibold">My Shop Orders &amp; Tracking</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {ordersData.orders.slice(0, 6).map((ord) => (
              <div key={ord.id} className="p-4 lg:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-mono font-semibold text-slate-900 dark:text-white">
                    {ord.orderNumber} · {ord.fulfilmentType}
                  </div>
                  <div className="text-xs text-slate-500">
                    {ord.items.map((i) => `${i.productName} ×${i.quantity}`).join(', ')} · {formatIstDate(ord.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-mono font-semibold tabular-nums">{formatINR(ord.totalPaise)}</div>
                    <div className="text-xs font-semibold text-lime-600 dark:text-lime-400">{ord.status}</div>
                  </div>
                  {['PLACED', 'CONFIRMED'].includes(ord.status) && (
                    <button
                      type="button"
                      onClick={() => handleCancelOrder(ord.id)}
                      className="text-xs font-semibold text-rose-500 hover:underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="-mx-6">
        <ShopPage />
      </div>
    </div>
  );
}
