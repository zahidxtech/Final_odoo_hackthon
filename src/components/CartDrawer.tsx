import React, { useState } from 'react';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch, ApiError } from '../lib/api';
import { formatINR } from '../lib/format';
import { useQueryClient } from '@tanstack/react-query';

export function CartDrawer({ memberDiscountPct = 0 }: { memberDiscountPct?: number }) {
  const { items, isOpen, setIsOpen, updateQty, removeItem, clearCart, subtotalPaise } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fulfilmentType, setFulfilmentType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [customerName, setCustomerName] = useState(user?.fullName || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('Bengaluru');
  const [postalCode, setPostalCode] = useState('560038');
  const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'UPI' | 'ONLINE'>('UPI');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const discountPaise = Math.round((subtotalPaise * memberDiscountPct) / 100);
  const discountedSubtotal = subtotalPaise - discountPaise;
  const deliveryFeePaise = fulfilmentType === 'DELIVERY' && discountedSubtotal < 250000 && items.length > 0 ? 10000 : 0;
  const totalPaise = discountedSubtotal + deliveryFeePaise;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    setSubmitting(true);
    try {
      const res = await apiFetch<{ order: { orderNumber: string } }>('/shop/orders', {
        method: 'POST',
        body: JSON.stringify({
          memberId: user?.memberId || null,
          customerName: customerName || user?.fullName || 'Guest Customer',
          customerPhone: customerPhone || user?.phone || '+91 98000 00000',
          customerEmail: customerEmail || user?.email || null,
          channel: 'ONLINE',
          fulfilmentType,
          paymentMethod,
          items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
          deliveryAddress:
            fulfilmentType === 'DELIVERY'
              ? { addressLine, city, postalCode }
              : undefined,
        }),
      });
      toast(`Order ${res.order.orderNumber} placed successfully!`, 'success');
      clearCart();
      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['shop-orders'] });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Checkout failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full flex flex-col border-l border-slate-200 dark:border-slate-800 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 font-display font-semibold text-lg">
            <ShoppingBag className="w-5 h-5 text-lime-500" />
            Pro Shop Bag ({items.reduce((a, b) => a + b.quantity, 0)})
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close bag"
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {items.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-sm">
              Your bag is empty. Add rackets, balls, shoes, or apparel from the Pro Shop.
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.variantId}
                    className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-slate-900 dark:text-white truncate">{item.productName}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{item.variantLabel}</div>
                      <div className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300 mt-1">
                        {formatINR(item.unitPricePaise)} each
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQty(item.variantId, item.quantity - 1)}
                        className="w-7 h-7 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-5 text-center text-xs font-mono tabular-nums">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.variantId, item.quantity + 1)}
                        className="w-7 h-7 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.variantId)}
                        aria-label="Remove item"
                        className="p-1 text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <form id="cart-checkout-form" onSubmit={handleCheckout} className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Fulfilment</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFulfilmentType('PICKUP')}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border ${
                        fulfilmentType === 'PICKUP'
                          ? 'bg-lime-400 text-slate-950 border-lime-400'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      Pickup at Club (Free)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFulfilmentType('DELIVERY')}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border ${
                        fulfilmentType === 'DELIVERY'
                          ? 'bg-lime-400 text-slate-950 border-lime-400'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      Home Delivery
                    </button>
                  </div>
                </div>

                {!user && (
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      required
                      type="text"
                      placeholder="Full Name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                    />
                    <input
                      required
                      type="tel"
                      placeholder="Phone Number"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                    />
                    <input
                      type="email"
                      placeholder="Email (optional)"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                    />
                  </div>
                )}

                {fulfilmentType === 'DELIVERY' && (
                  <div className="space-y-2">
                    <input
                      required
                      type="text"
                      placeholder="Street Address"
                      value={addressLine}
                      onChange={(e) => setAddressLine(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        required
                        type="text"
                        placeholder="City"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                      />
                      <input
                        required
                        type="text"
                        placeholder="Postal Code"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['UPI', 'CARD', 'ONLINE'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`py-2 rounded-lg text-xs font-semibold border ${
                          paymentMethod === m
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 border-transparent'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </form>
            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="p-6 border-t border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50 dark:bg-slate-950">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatINR(subtotalPaise)}</span>
              </div>
              {discountPaise > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-lime-400">
                  <span>Member Discount ({memberDiscountPct}%)</span>
                  <span className="font-mono tabular-nums">-{formatINR(discountPaise)}</span>
                </div>
              )}
              {fulfilmentType === 'DELIVERY' && (
                <div className="flex justify-between text-slate-500">
                  <span>Delivery Fee (Free over ₹2,500)</span>
                  <span className="font-mono tabular-nums">{deliveryFeePaise === 0 ? 'Free' : formatINR(deliveryFeePaise)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-2 border-t border-slate-200 dark:border-slate-800">
                <span>Total</span>
                <span className="font-mono tabular-nums">{formatINR(totalPaise)}</span>
              </div>
            </div>
            <button
              type="submit"
              form="cart-checkout-form"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-lime-400 text-slate-950 font-semibold text-sm hover:bg-lime-300 disabled:opacity-50"
            >
              {submitting ? 'Processing Payment...' : `Pay ${formatINR(totalPaise)} & Place Order`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
