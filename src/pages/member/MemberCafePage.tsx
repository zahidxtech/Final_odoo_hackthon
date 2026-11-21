import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Coffee, Minus, Plus, ShoppingBag } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { ApiError, apiFetch } from '../../lib/api';
import { formatINR, formatIstDate } from '../../lib/format';

interface MenuItem {
  id: number;
  name: string;
  category: string;
  description: string;
  pricePaise: number;
  isAvailable: boolean;
}

interface OrderItem {
  menuItemId: number;
  quantity: number;
}

export function MemberCafePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [category, setCategory] = useState('ALL');
  const [chargeToTab, setChargeToTab] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'UPI'>('CARD');
  const [placingOrder, setPlacingOrder] = useState(false);

  const { data: menuData, isLoading, isError } = useQuery<{ items: MenuItem[] }>({
    queryKey: ['member-cafe-menu'],
    queryFn: () => apiFetch('/bar/menu?availableOnly=true'),
  });
  const { data: history } = useQuery<{
    profile: { plan?: { barDiscountPct?: number } };
    barOrders: Array<{
      id: number;
      orderNumber: string;
      status?: string;
      kdsStatus: string;
      billingStatus: string;
      totalPaise: number;
      createdAt: string;
    }>;
  }>({
    queryKey: ['member-history'],
    queryFn: () => apiFetch('/members/me/history'),
  });

  const menuItems = menuData?.items ?? [];
  const categories = ['ALL', ...Array.from(new Set(menuItems.map((item) => item.category)))];
  const filteredItems = category === 'ALL'
    ? menuItems
    : menuItems.filter((item) => item.category === category);
  const cartItems = useMemo(
    () => cart.flatMap((entry) => {
      const item = menuItems.find((menuItem) => menuItem.id === entry.menuItemId);
      return item ? [{ ...item, quantity: entry.quantity }] : [];
    }),
    [cart, menuItems],
  );
  const subtotal = cartItems.reduce((sum, item) => sum + item.pricePaise * item.quantity, 0);
  const discountPct = history?.profile.plan?.barDiscountPct ?? 0;
  const discount = Math.round((subtotal * discountPct) / 100);
  const tax = Math.round(((subtotal - discount) * 5) / 100);
  const total = subtotal - discount + tax;

  const setQuantity = (itemId: number, quantity: number) => {
    setCart((current) => quantity <= 0
      ? current.filter((entry) => entry.menuItemId !== itemId)
      : current.map((entry) => entry.menuItemId === itemId ? { ...entry, quantity } : entry));
  };

  const placeOrder = async () => {
    if (!cart.length || placingOrder) return;
    setPlacingOrder(true);
    try {
      const result = await apiFetch<{ order: { orderNumber: string } }>('/bar/member-orders', {
        method: 'POST',
        body: JSON.stringify({ chargeToTab, paymentMethod, items: cart }),
      });
      toast(`Cafe order ${result.order.orderNumber} placed successfully.`, 'success');
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ['member-history'] });
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Unable to place your cafe order.', 'error');
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <div className="space-y-7">
      <header>
        <div className="flex items-center gap-2">
          <Coffee className="h-6 w-6 text-lime-500" />
          <h1 className="font-display text-2xl font-bold">Cafe &amp; Lounge</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Browse the menu, place an order, and send it straight to the kitchen.
          {discountPct > 0 && <span className="ml-1 text-lime-600 dark:text-lime-400">{discountPct}% member savings applied.</span>}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((itemCategory) => (
              <button
                key={itemCategory}
                type="button"
                onClick={() => setCategory(itemCategory)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${
                  category === itemCategory
                    ? 'bg-lime-400 text-slate-950'
                    : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                {itemCategory === 'ALL' ? 'All items' : itemCategory}
              </button>
            ))}
          </div>

          {isLoading ? (
            <p className="py-12 text-center text-sm text-slate-500">Loading cafe menu...</p>
          ) : isError ? (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
              Could not load the cafe menu. Please try again in a moment.
            </p>
          ) : filteredItems.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">No items are currently available.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {filteredItems.map((item) => {
                const quantity = cart.find((entry) => entry.menuItemId === item.id)?.quantity ?? 0;
                return (
                  <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{item.category}</div>
                    <h2 className="mt-1 font-semibold">{item.name}</h2>
                    {item.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.description}</p>}
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="font-mono text-sm font-bold text-lime-600 dark:text-lime-400">{formatINR(item.pricePaise)}</span>
                      {quantity === 0 ? (
                        <button
                          type="button"
                          onClick={() => setQuantity(item.id, 1)}
                          className="inline-flex items-center gap-1 rounded-lg bg-lime-400 px-3 py-2 text-xs font-semibold text-slate-950"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`Remove one ${item.name}`}
                            onClick={() => setQuantity(item.id, quantity - 1)}
                            className="rounded-md border border-slate-300 p-1.5 dark:border-slate-700"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-5 text-center text-sm font-semibold">{quantity}</span>
                          <button
                            type="button"
                            aria-label={`Add one ${item.name}`}
                            onClick={() => setQuantity(item.id, quantity + 1)}
                            className="rounded-md border border-slate-300 p-1.5 dark:border-slate-700"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 xl:sticky xl:top-20">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-lime-500" />
            <h2 className="font-display text-lg font-semibold">Your Order</h2>
          </div>
          {cartItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Choose menu items to get started.</p>
          ) : (
            <div className="mt-4 max-h-64 space-y-3 overflow-y-auto">
              {cartItems.map((item) => (
                <div key={item.id} className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{item.name} × {item.quantity}</span>
                  <span className="shrink-0 font-mono">{formatINR(item.pricePaise * item.quantity)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-xs dark:border-slate-800">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatINR(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between text-lime-600 dark:text-lime-400"><span>Member discount ({discountPct}%)</span><span>−{formatINR(discount)}</span></div>}
            <div className="flex justify-between"><span>F&amp;B GST (5%)</span><span>{formatINR(tax)}</span></div>
            <div className="flex justify-between pt-1 text-sm font-bold"><span>Total</span><span>{formatINR(total)}</span></div>
          </div>
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" checked={chargeToTab} onChange={(event) => setChargeToTab(event.target.checked)} />
            Add this order to my member tab
          </label>
          {!chargeToTab && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(['CARD', 'UPI'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`rounded-lg border py-2 text-xs font-semibold ${
                    paymentMethod === method
                      ? 'border-lime-400 bg-lime-400 text-slate-950'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={!cart.length || placingOrder}
            onClick={placeOrder}
            className="mt-4 w-full rounded-lg bg-lime-400 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {placingOrder ? 'Placing order...' : chargeToTab ? `Send to Kitchen · ${formatINR(total)}` : `Pay & Send to Kitchen · ${formatINR(total)}`}
          </button>
        </aside>
      </div>

      {!!history?.barOrders.length && (
        <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="font-display font-semibold">Recent Cafe Orders</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.barOrders.slice(0, 5).map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <div>
                  <div className="font-mono font-semibold">{order.orderNumber}</div>
                  <div className="text-xs text-slate-500">{formatIstDate(order.createdAt)} · {order.billingStatus.replaceAll('_', ' ')}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-semibold">{formatINR(order.totalPaise)}</div>
                  <div className="text-xs text-lime-600 dark:text-lime-400">{order.kdsStatus}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
