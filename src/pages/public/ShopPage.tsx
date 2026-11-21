import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ShoppingBag } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatINR } from '../../lib/format';
import { useCart } from '../../context/CartContext';

interface ProductRow {
  id: number;
  name: string;
  sku: string;
  category: string;
  brand: string;
  description: string;
  imageUrl?: string;
  pricePaise: number;
  reorderLevel: number;
  totalStock: number;
  variants: Array<{
    id: number;
    sku: string;
    size: string;
    color: string;
    stockQty: number;
    priceOverridePaise?: number | null;
  }>;
}

export function ShopPage() {
  const [category, setCategory] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedVariantByProd, setSelectedVariantByProd] = useState<Record<number, number>>({});
  const { addItem, setIsOpen, totalCount } = useCart();

  const { data, isLoading } = useQuery<{ products: ProductRow[] }>({
    queryKey: ['products', category, search],
    queryFn: () => apiFetch(`/shop/products?category=${category}&search=${encodeURIComponent(search)}`),
  });

  const categories = ['ALL', 'RACKETS', 'BALLS', 'SHOES', 'ACCESSORIES', 'APPAREL'];

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">Pro Shop Catalogue</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Live club inventory shared with the front-desk counter. Choose club pickup or doorstep delivery.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-lime-400 text-white dark:text-slate-950 font-semibold text-sm whitespace-nowrap shrink-0"
        >
          <ShoppingBag className="w-4 h-4" />
          Open Bag ({totalCount})
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                category === cat
                  ? 'bg-white dark:bg-lime-400 text-slate-950 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat === 'ALL' ? 'All Gear' : cat.charAt(0) + cat.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rackets, brands, SKU..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-500 py-12 text-center">Loading Pro Shop catalogue...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {(data?.products || []).map((prod) => {
            const activeVariantId = selectedVariantByProd[prod.id] ?? prod.variants[0]?.id;
            const activeVariant = prod.variants.find((v) => v.id === activeVariantId) || prod.variants[0];
            const outOfStock = !activeVariant || activeVariant.stockQty <= 0;

            return (
              <div
                key={prod.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between transition-transform hover:-translate-y-0.5"
              >
                <div>
                  <div className="aspect-[4/3] bg-slate-800 overflow-hidden">
                    <img
                      src={prod.imageUrl || '/src/assets/images/shop_pro_gear_1795254057097.jpg'}
                      alt={prod.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-5 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>{prod.brand} · {prod.category}</span>
                      <span className={outOfStock ? 'text-rose-500 font-medium' : 'text-emerald-600 dark:text-lime-400 font-mono tabular-nums'}>
                        {outOfStock ? 'Out of stock' : `${activeVariant.stockQty} in stock`}
                      </span>
                    </div>
                    <h3 className="font-semibold text-base text-slate-900 dark:text-white leading-snug">{prod.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{prod.description}</p>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-2 space-y-3">
                  {prod.variants.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {prod.variants.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelectedVariantByProd((prev) => ({ ...prev, [prod.id]: v.id }))}
                          className={`px-2.5 py-1 rounded text-xs font-medium border ${
                            activeVariant?.id === v.id
                              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 border-transparent'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {v.size}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="font-mono text-base font-bold tabular-nums">
                      {formatINR(activeVariant?.priceOverridePaise ?? prod.pricePaise)}
                    </span>
                    <button
                      type="button"
                      disabled={outOfStock}
                      onClick={() =>
                        addItem({
                          variantId: activeVariant.id,
                          productId: prod.id,
                          productName: prod.name,
                          variantLabel: `${activeVariant.size} · ${activeVariant.color}`,
                          unitPricePaise: activeVariant.priceOverridePaise ?? prod.pricePaise,
                          maxStock: activeVariant.stockQty,
                        })
                      }
                      className="px-4 py-2 rounded-lg bg-lime-400 text-slate-950 text-xs font-semibold hover:bg-lime-300 disabled:opacity-40"
                    >
                      {outOfStock ? 'Unavailable' : 'Add to Bag'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
