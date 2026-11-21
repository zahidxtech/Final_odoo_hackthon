import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Calendar, Clock, MapPin, ShieldCheck, ShoppingBag } from 'lucide-react';
import { HeroSiteVideo } from '../../components/HeroSiteVideo';
import { apiFetch } from '../../lib/api';
import { formatINR } from '../../lib/format';

export function HomePage() {
  const { data: plansData } = useQuery<{
    plans: Array<{
      id: number;
      code: string;
      name: string;
      description: string;
      monthlyPricePaise: number;
      annualPricePaise: number;
      courtDiscountPct: number;
      shopDiscountPct: number;
      barDiscountPct: number;
    }>;
  }>({
    queryKey: ['public-plans'],
    queryFn: () => apiFetch('/members/plans'),
  });

  const { data: shopData } = useQuery<{
    products: Array<{
      id: number;
      name: string;
      category: string;
      brand: string;
      pricePaise: number;
      totalStock: number;
      imageUrl?: string;
    }>;
  }>({
    queryKey: ['public-shop-preview'],
    queryFn: () => apiFetch('/shop/products'),
  });

  return (
    <div className="space-y-20 pb-20">
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 pt-10 lg:pt-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 lg:p-10">
            <div className="space-y-5">
              <p className="text-xs font-semibold tracking-wider uppercase text-lime-600 dark:text-lime-400">
                Bengaluru · Championship Courts &amp; Clubhouse
              </p>
              <h1
                className="font-display font-bold tracking-tight text-slate-900 dark:text-white leading-[1.08]"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', textWrap: 'balance' }}
              >
                One club for tennis, cricket nets, padel, and recovery.
              </h1>
              <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Book floodlit hard courts, indoor cricket lanes with bowling machines, and panoramic padel courts in real time—backed by our pro shop and courtside recovery bar.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-8">
              <Link
                to="/availability"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-lime-400 text-slate-950 font-semibold text-sm hover:bg-lime-300 transition-colors whitespace-nowrap"
              >
                Check Live Courts <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/enquiry"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Book a Trial Session
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6">
            <HeroSiteVideo />
          </div>
        </div>

        {/* 4-Column Club Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {[
            { label: 'Championship Courts', value: '6 Courts', sub: 'Tennis · Cricket · Padel' },
            { label: 'Booking Window', value: '06:00 – 22:00', sub: '60-min slots every 30 min' },
            { label: 'Friday Social Play', value: '19:00 IST', sub: '₹400 per player · 8 spots' },
            { label: 'Pro Shop & Lounge', value: 'Up to 15% Off', sub: 'Automatic member savings' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5"
            >
              <div className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</div>
              <div className="font-display text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {stat.value}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{stat.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Facilities & Sports Bento Grid */}
      <section className="max-w-7xl mx-auto px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-bold text-slate-900 dark:text-white">
              Facilities built for serious match play
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-2xl">
              Every court surface, indoor cricket lane, and clubhouse kitchen is unified under live availability and instant member privileges.
            </p>
          </div>
          <Link to="/availability" className="text-sm font-semibold text-lime-600 dark:text-lime-400 hover:underline whitespace-nowrap">
            View today&apos;s slot grid →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="aspect-[4/3] bg-slate-800 overflow-hidden">
              <img
                src="/src/assets/images/facility_cricket_nets_1795254056914.jpg"
                alt="Covered indoor cricket practice nets with turf wickets"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6 space-y-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">01 · Indoor Cricket</div>
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Turf Lanes &amp; Bowling Machines
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Two covered full-run-up lanes with programmable pace/spin delivery and video review bays.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="aspect-[4/3] bg-slate-800 overflow-hidden">
              <img
                src="/src/assets/images/facility_padel_badminton_1795254057212.jpg"
                alt="Panoramic glass padel court inside athletic pavilion"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6 space-y-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">02 · Padel &amp; Tennis</div>
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Panoramic Padel &amp; DecoTurf Tennis
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Three championship tennis courts (hard + clay) plus a climate-ventilated panoramic glass padel court.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="aspect-[4/3] bg-slate-800 overflow-hidden">
              <img
                src="/src/assets/images/clubhouse_bar_lounge_1795254058476.jpg"
                alt="Alpha Sports Club recovery bar and courtside lounge"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6 space-y-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">03 · Recovery Lounge</div>
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Courtside Kitchen &amp; Member Tabs
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Single-origin espresso, recovery smoothies, and whole-food bowls billed effortlessly to your member tab.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Plans Preview */}
      <section className="max-w-7xl mx-auto px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-bold text-slate-900 dark:text-white">
              Transparent membership tiers
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              Plan benefits apply automatically across court reservations, Pro Shop checkout, and bar tabs.
            </p>
          </div>
          <Link to="/plans" className="text-sm font-semibold text-lime-600 dark:text-lime-400 hover:underline whitespace-nowrap">
            Compare full entitlements →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(plansData?.plans || []).map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl p-6 border flex flex-col justify-between ${
                plan.code === 'GOLD'
                  ? 'bg-slate-900 text-white border-lime-400/60 dark:bg-slate-900'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="space-y-4">
                <div className="text-xs font-semibold tracking-wider uppercase text-lime-500">{plan.code}</div>
                <h3 className="font-display text-2xl font-bold">{plan.name}</h3>
                <div className="font-mono text-2xl font-bold tabular-nums">
                  {formatINR(plan.monthlyPricePaise)}
                  <span className="text-xs font-normal opacity-70"> / month</span>
                </div>
                <p className="text-sm opacity-80 leading-relaxed">{plan.description}</p>
                <ul className="space-y-2 pt-3 border-t border-slate-200/20 text-sm tabular-nums">
                  <li>Court rate: {plan.courtDiscountPct === 100 ? 'Complimentary (100% off)' : `${plan.courtDiscountPct}% discount`}</li>
                  <li>Pro Shop discount: {plan.shopDiscountPct}% off</li>
                  <li>Bar &amp; Cafe discount: {plan.barDiscountPct}% off</li>
                </ul>
              </div>
              <Link
                to={`/login?mode=register&plan=${plan.code}`}
                className="mt-6 w-full py-2.5 rounded-xl bg-lime-400 text-slate-950 font-semibold text-sm text-center hover:bg-lime-300 transition-colors"
              >
                Join {plan.name}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Pro Shop Preview + Social Proof */}
      <section className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-5 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 aspect-[4/3]">
          <img
            src="/src/assets/images/shop_pro_gear_1795254057097.jpg"
            alt="Alpha Sports Club Pro Shop tennis rackets, balls, and court shoes"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-2">
            <h2 className="font-display text-3xl font-bold text-slate-900 dark:text-white">
              Pro Shop &amp; Racket Stringing
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Same shared inventory at the front-desk counter and online. Order for courtside pickup or doorstep delivery.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(shopData?.products || []).slice(0, 4).map((p) => (
              <div
                key={p.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs text-slate-500 dark:text-slate-400">{p.brand} · {p.category}</div>
                  <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">{p.name}</div>
                </div>
                <div className="font-mono text-sm font-semibold tabular-nums shrink-0">{formatINR(p.pricePaise)}</div>
              </div>
            ))}
          </div>
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ShoppingBag className="w-4 h-4 text-lime-500" />
            Browse Pro Shop
          </Link>
        </div>
      </section>

      {/* Testimonials & Visit Details */}
      <section className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            &ldquo;Moving from WhatsApp booking threads to live 30-minute court grids cut our weekly scheduling friction to zero. I book Court 1 in ten seconds and settle my post-match espresso tab on my phone.&rdquo;
          </p>
          <div className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
            <strong className="text-slate-900 dark:text-white">Arjun Mehta</strong> · Gold Premier Member since 2024
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            &ldquo;Our corporate wellness team books the covered cricket lanes every Thursday evening. Automated GST invoicing and instant slot confirmation make administration effortless.&rdquo;
          </p>
          <div className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
            <strong className="text-slate-900 dark:text-white">Ankit Verma</strong> · Workplace Wellness Lead, Razorpay
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">Visit Alpha Sports Club</h3>
          <div className="space-y-2.5 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-lime-500 shrink-0 mt-0.5" />
              <span>100 Feet Road, Indiranagar, Bengaluru 560038</span>
            </div>
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-lime-500 shrink-0 mt-0.5" />
              <span>Daily 06:00 – 22:00 IST (Floodlights until 22:00)</span>
            </div>
            <div className="flex items-start gap-2.5">
              <Calendar className="w-4 h-4 text-lime-500 shrink-0 mt-0.5" />
              <span>Friday Social Mixer · Every Friday at 19:00</span>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-lime-500 shrink-0 mt-0.5" />
              <span>Free cancellation up to 4 hours before start</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
