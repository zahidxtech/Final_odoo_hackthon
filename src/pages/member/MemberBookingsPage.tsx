import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, X } from 'lucide-react';
import { AvailabilityGrid } from '../../components/AvailabilityGrid';
import { apiFetch, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatINR, formatIstDate, formatIstTime, getTodayIstStr } from '../../lib/format';

export function MemberBookingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = getTodayIstStr();

  const [rescheduleTarget, setRescheduleTarget] = useState<{
    id: number;
    courtId: number;
    courtName: string;
    bookingDate: string;
  } | null>(null);
  const [newDate, setNewDate] = useState(today);
  const [newTime, setNewTime] = useState('18:00');

  const { data: bookingsData, refetch: refetchBookings } = useQuery<{
    bookings: Array<{
      id: number;
      courtId: number;
      courtName: string;
      sport: string;
      bookingDate: string;
      startTime: string;
      endTime: string;
      startHHMM: string;
      endHHMM: string;
      finalAmountPaise: number;
      status: string;
    }>;
  }>({
    queryKey: ['bookings', user?.memberId],
    queryFn: () => apiFetch('/bookings'),
  });

  const { data: socialData, refetch: refetchSocial } = useQuery<{
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
      participants: Array<{ memberId: number | null; displayName: string }>;
    }>;
  }>({
    queryKey: ['social-sessions'],
    queryFn: () => apiFetch('/bookings/social'),
  });

  const activeTodayCount = (bookingsData?.bookings || []).filter(
    (b) => b.bookingDate === today && b.status !== 'CANCELLED'
  ).length;

  const handleCancel = async (bookingId: number) => {
    try {
      const res = await apiFetch<{ message: string }>(`/bookings/${bookingId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ refundAsCredit: true }),
      });
      toast(res.message, 'success');
      refetchBookings();
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      queryClient.invalidateQueries({ queryKey: ['member-history'] });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Unable to cancel.', 'error');
    }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget) return;
    try {
      await apiFetch(`/bookings/${rescheduleTarget.id}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({ bookingDate: newDate, startTimeHHMM: newTime, courtId: rescheduleTarget.courtId }),
      });
      toast('Booking rescheduled successfully!', 'success');
      setRescheduleTarget(null);
      refetchBookings();
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Unable to reschedule.', 'error');
    }
  };

  const handleJoinSocial = async (sessionId: number) => {
    try {
      await apiFetch(`/bookings/social/${sessionId}/join`, {
        method: 'POST',
        body: JSON.stringify({ paymentMethod: 'UPI' }),
      });
      toast('Joined Friday Social Play!', 'success');
      refetchSocial();
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not join session.', 'error');
    }
  };

  const handleLeaveSocial = async (sessionId: number) => {
    try {
      await apiFetch(`/bookings/social/${sessionId}/leave`, { method: 'POST', body: JSON.stringify({}) });
      toast('Left social session.', 'info');
      refetchSocial();
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not leave session.', 'error');
    }
  };

  const openSocials = (socialData?.sessions || []).filter((s) => s.status !== 'COMPLETED' && s.status !== 'CANCELLED');

  return (
    <div className="space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Court Bookings &amp; Social Play</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click any green Free slot to book (60-min session) · Daily quota used today:{' '}
            <span className="font-mono font-semibold text-lime-600 dark:text-lime-400">{activeTodayCount}/2</span>
          </p>
        </div>
      </div>

      <AvailabilityGrid mode="MEMBER" onBooked={() => refetchBookings()} />

      {/* Friday Social Sessions */}
      {openSocials.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold">Friday Night Social Play Sessions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {openSocials.map((s) => {
              const isJoined = s.participants.some((p) => p.memberId === user?.memberId);
              const isFull = s.joinedCount >= s.capacity;
              return (
                <div
                  key={s.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
                >
                  <div className="text-xs text-sky-500 font-semibold">
                    {s.sport} · {s.courtName}
                  </div>
                  <div className="font-semibold text-base">{s.title}</div>
                  <div className="text-xs text-slate-500 font-mono tabular-nums">
                    {formatIstDate(s.sessionDate)} · {formatIstTime(s.startTime)}–{formatIstTime(s.endTime)}
                  </div>
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="inline-flex items-center gap-1.5 font-mono">
                      <Users className="w-4 h-4 text-sky-400" />
                      {s.joinedCount}/{s.capacity} joined
                    </span>
                    <span className="font-mono font-semibold">{formatINR(s.pricePerHeadPaise)} / head</span>
                  </div>
                  {isJoined ? (
                    <button
                      type="button"
                      onClick={() => handleLeaveSocial(s.id)}
                      className="w-full py-2 rounded-lg border border-rose-500/40 text-rose-500 text-xs font-semibold hover:bg-rose-500/10"
                    >
                      Leave Session
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isFull}
                      onClick={() => handleJoinSocial(s.id)}
                      className="w-full py-2 rounded-lg bg-sky-500 text-white text-xs font-semibold hover:bg-sky-400 disabled:opacity-40"
                    >
                      {isFull ? 'Session Full' : 'Join & Pay'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* My Bookings Table */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-lg font-semibold">My Reservations</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs text-slate-500">
                <th className="px-6 py-3 font-semibold">Court</th>
                <th className="px-6 py-3 font-semibold">Date &amp; Time</th>
                <th className="px-6 py-3 font-semibold">Rate Paid</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
              {(bookingsData?.bookings || []).slice(0, 20).map((b) => (
                <tr key={b.id}>
                  <td className="px-6 py-3.5 font-medium">{b.courtName}</td>
                  <td className="px-6 py-3.5 font-mono text-xs">
                    {formatIstDate(b.bookingDate)} · {b.startHHMM}–{b.endHHMM}
                  </td>
                  <td className="px-6 py-3.5 font-mono">
                    {b.finalAmountPaise === 0 ? 'Free (Plan)' : formatINR(b.finalAmountPaise)}
                  </td>
                  <td className="px-6 py-3.5 text-xs font-semibold">{b.status}</td>
                  <td className="px-6 py-3.5 text-right space-x-2">
                    {b.status === 'CONFIRMED' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setRescheduleTarget({
                              id: b.id,
                              courtId: b.courtId,
                              courtName: b.courtName,
                              bookingDate: b.bookingDate,
                            });
                            setNewDate(b.bookingDate);
                            setNewTime(b.startHHMM);
                          }}
                          className="text-xs font-semibold text-sky-500 hover:underline"
                        >
                          Reschedule
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancel(b.id)}
                          className="text-xs font-semibold text-rose-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-lg">Reschedule {rescheduleTarget.courtName}</h3>
              <button type="button" onClick={() => setRescheduleTarget(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReschedule} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">New Date</label>
                <input
                  required
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">New Start Time (30-min grid)</label>
                <select
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  {['06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '10:00', '16:00', '17:00', '18:00', '18:30', '19:00', '19:30', '20:00'].map(
                    (t) => (
                      <option key={t} value={t}>{t}</option>
                    )
                  )}
                </select>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl bg-lime-400 text-slate-950 font-semibold text-sm">
                Confirm Reschedule
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
