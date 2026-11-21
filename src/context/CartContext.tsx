import React, { createContext, useContext, useState } from 'react';

export interface CartItem {
  variantId: number;
  productId: number;
  productName: string;
  variantLabel: string;
  unitPricePaise: number;
  maxStock: number;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  addItem: (item: Omit<CartItem, 'quantity'>, qty?: number) => void;
  updateQty: (variantId: number, qty: number) => void;
  removeItem: (variantId: number) => void;
  clearCart: () => void;
  totalCount: number;
  subtotalPaise: number;
}

const CartContext = createContext<CartContextValue>({
  items: [],
  isOpen: false,
  setIsOpen: () => {},
  addItem: () => {},
  updateQty: () => {},
  removeItem: () => {},
  clearCart: () => {},
  totalCount: 0,
  subtotalPaise: 0,
});

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addItem = (item: Omit<CartItem, 'quantity'>, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.variantId === item.variantId);
      if (existing) {
        const nextQty = Math.min(item.maxStock, existing.quantity + qty);
        return prev.map((i) => (i.variantId === item.variantId ? { ...i, quantity: nextQty } : i));
      }
      return [...prev, { ...item, quantity: Math.min(item.maxStock, qty) }];
    });
    setIsOpen(true);
  };

  const updateQty = (variantId: number, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.variantId !== variantId));
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(i.maxStock, qty) } : i))
    );
  };

  const removeItem = (variantId: number) => {
    setItems((prev) => prev.filter((i) => i.variantId !== variantId));
  };

  const clearCart = () => setItems([]);

  const totalCount = items.reduce((acc, i) => acc + i.quantity, 0);
  const subtotalPaise = items.reduce((acc, i) => acc + i.unitPricePaise * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, isOpen, setIsOpen, addItem, updateQty, removeItem, clearCart, totalCount, subtotalPaise }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
