import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Printer } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatIstDate } from '../../lib/format';

export function MemberCardPage() {
  const { data, isLoading } = useQuery<{
    profile: {
      memberCode: string;
      qrToken: string;
      fullName: string;
      email: string;
      phone: string;
      status: string;
      currentMembership?: { startDate: string; endDate: string };
      plan?: {
        code: string;
        name: string;
        courtDiscountPct: number;
        shopDiscountPct: number;
        barDiscountPct: number;
      };
    };
  }>({
    queryKey: ['member-history'],
    queryFn: () => apiFetch('/members/me/history'),
  });

  if (isLoading || !data) {
    return <div className="py-12 text-center text-sm text-slate-500">Loading your digital pass...</div>;
  }

  const p = data.profile;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="font-display text-2xl font-bold">Digital Membership Card</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Scan at the front desk, court gates, Pro Shop, or Club Lounge.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Printer className="w-4 h-4" />
          Print Pass
        </button>
      </div>

      {/* Membership Card */}
      <div className="bg-[#0A1324] text-white border border-slate-700 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold tracking-widest uppercase text-lime-400">
              Alpha Sports Club · {p.plan?.name}
            </div>
            <h2 className="font-display text-2xl font-bold mt-1">{p.fullName}</h2>
            <div className="font-mono text-sm text-slate-300 mt-0.5">{p.memberCode}</div>
          </div>
          <div className="text-right text-xs">
            <div className="text-slate-400">Status</div>
            <div className="font-semibold text-lime-400">{p.status}</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6 bg-white/5 border border-white/10 rounded-xl p-5">
          <div className="bg-white p-3 rounded-xl shrink-0">
            <QRCodeSVG value={p.qrToken} size={132} level="M" />
          </div>
          <div className="space-y-2 text-xs text-slate-300 w-full">
            <div>
              <div className="text-slate-400">QR Pass Token</div>
              <div className="font-mono text-[11px] break-all text-white">{p.qrToken}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10 tabular-nums">
              <div>
                <div className="text-slate-400">Member Since</div>
                <div className="font-mono text-white">{formatIstDate(p.currentMembership?.startDate)}</div>
              </div>
              <div>
                <div className="text-slate-400">Valid Through</div>
                <div className="font-mono text-white">{formatIstDate(p.currentMembership?.endDate)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/10 text-xs tabular-nums">
          <div>
            <div className="text-slate-400">Courts</div>
            <div className="font-semibold text-white">{p.plan?.courtDiscountPct ?? 0}% off</div>
          </div>
          <div>
            <div className="text-slate-400">Pro Shop</div>
            <div className="font-semibold text-white">{p.plan?.shopDiscountPct ?? 0}% off</div>
          </div>
          <div>
            <div className="text-slate-400">Bar &amp; Lounge</div>
            <div className="font-semibold text-white">{p.plan?.barDiscountPct ?? 0}% off</div>
          </div>
        </div>
      </div>
    </div>
  );
}
