import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { AvailabilityGrid } from '../../components/AvailabilityGrid';
import { apiFetch } from '../../lib/api';
import { formatINR, formatIstDate, formatIstTime } from '../../lib/format';

export function AvailabilityPage() {
  const { data: socialData } = useQuery<{
    sessions: Array<{
      id: number;
      title: string;
      courtName: string;
      sport: string;
      sessionDate: string;
      startTime: string;
      endTime: string;
      joinedCount: number;
      capacity: number;
      pricePerHeadPaise: number;
      status: string;
    }>;
  }>({
    queryKey: ['public-social-sessions'],
    queryFn: () => apiFetch('/bookings/social'),
  });

  const upcomingSocials = (socialData?.sessions || []).filter((s) => s.status !== 'COMPLETED' && s.status !== 'CANCELLED').slice(0, 3);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">
          Live Court Availability &amp; Trial Booking
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          60-minute sessions starting every 30 minutes. Click any green Free slot to book a guest trial or sign in for member rates.
        </p>
      </div>

      <AvailabilityGrid mode="PUBLIC" />

      {upcomingSocials.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Upcoming Friday Night Social Play
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {upcomingSocials.map((s) => (
              <div
                key={s.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
              >
                <div className="text-xs text-sky-600 dark:text-sky-400 font-semibold">
                  {s.sport} · {s.courtName}
                </div>
                <div className="font-display font-semibold text-lg text-slate-900 dark:text-white">{s.title}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {formatIstDate(s.sessionDate)} · {formatIstTime(s.startTime)}–{formatIstTime(s.endTime)}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-sm">
                  <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                    <Users className="w-4 h-4 text-sky-400" />
                    {s.joinedCount}/{s.capacity} joined
                  </span>
                  <span className="font-mono font-semibold tabular-nums">{formatINR(s.pricePerHeadPaise)} / head</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
