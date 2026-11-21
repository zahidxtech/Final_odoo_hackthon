import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, ChevronLeft, ChevronRight, Users, X, Check } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import { addDaysStr, formatINR, formatIstDate, getTodayIstStr } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface SlotCell {
  time: string;
  startMs: number;
  endMs: number;
  state: 'FREE' | 'BOOKED' | 'MINE' | 'SOCIAL' | 'BLOCKED';
  reason?: string;
  blockType?: string;
  socialSessionId?: number;
  title?: string;
  joinedCount?: number;
  capacity?: number;
  pricePerHeadPaise?: number;
  isViewerJoined?: boolean;
  bookingId?: number;
  bookedStartTime?: string;
  bookedEndTime?: string;
}

interface AvailabilityResponse {
  date: string;
  slotLabels: string[];
  courts: Array<{
    court: {
      id: number;
      name: string;
      sport: string;
      surface: string;
      hourlyRatePaise: number;
      isIndoor: boolean;
    };
    slots: SlotCell[];
  }>;
}

interface QuoteResponse {
  quote: {
    courtId: number;
    courtName: string;
    sport: string;
    planCode: string;
    memberName: string | null;
    isPeak: boolean;
    baseAmountPaise: number;
    discountPct: number;
    discountAmountPaise: number;
    finalAmountPaise: number;
  };
}

interface AvailabilityGridProps {
  mode: 'PUBLIC' | 'MEMBER' | 'STAFF';
  staffSelectedMemberId?: number | null;
  onBooked?: () => void;
}

export function AvailabilityGrid({ mode, staffSelectedMemberId, onBooked }: AvailabilityGridProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState(getTodayIstStr());
  const [sportFilter, setSportFilter] = useState<string>('ALL');
  const [selectedSlot, setSelectedSlot] = useState<{
    courtId: number;
    courtName: string;
    sport: string;
    time: string;
    cell: SlotCell;
  } | null>(null);

  // Booking modal state
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [bookingType, setBookingType] = useState<'MEMBER' | 'WALK_IN' | 'PHONE'>(
    staffSelectedMemberId ? 'MEMBER' : 'WALK_IN'
  );
  const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'UPI' | 'CASH' | 'ONLINE'>('CARD');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, refetch } = useQuery<AvailabilityResponse>({
    queryKey: ['availability', selectedDate, sportFilter, user?.id],
    queryFn: () => apiFetch(`/bookings/availability?date=${selectedDate}&sport=${sportFilter}`),
    refetchInterval: 15000, // Live 15s polling
  });

  const targetMemberIdForQuote =
    mode === 'MEMBER'
      ? user?.memberId
      : mode === 'STAFF' && bookingType === 'MEMBER'
        ? staffSelectedMemberId
        : null;

  const { data: quoteData, error: quoteError } = useQuery<QuoteResponse>({
    queryKey: ['booking-quote', selectedSlot?.courtId, selectedSlot?.time, targetMemberIdForQuote],
    queryFn: () =>
      apiFetch(
        `/bookings/quote?courtId=${selectedSlot!.courtId}&startTime=${selectedSlot!.time}${
          targetMemberIdForQuote ? `&memberId=${targetMemberIdForQuote}` : ''
        }`
      ),
    enabled: Boolean(selectedSlot && selectedSlot.cell.state === 'FREE'),
    retry: false,
  });

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;
    setSubmitting(true);

    try {
      if (selectedSlot.cell.state === 'SOCIAL' && selectedSlot.cell.socialSessionId) {
        const payload =
          mode === 'MEMBER' || (mode === 'STAFF' && staffSelectedMemberId)
            ? { memberId: mode === 'MEMBER' ? user?.memberId : staffSelectedMemberId, paymentMethod }
            : { guestName, guestPhone, paymentMethod };

        await apiFetch(`/bookings/social/${selectedSlot.cell.socialSessionId}/join`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast('Joined social play session!', 'success');
      } else if (mode === 'PUBLIC' && !user) {
        await apiFetch('/bookings/trial', {
          method: 'POST',
          body: JSON.stringify({
            courtId: selectedSlot.courtId,
            bookingDate: selectedDate,
            startTimeHHMM: selectedSlot.time,
            guestName,
            guestPhone,
            guestEmail: guestEmail || undefined,
            paymentMethod: paymentMethod === 'CASH' ? 'CARD' : paymentMethod,
          }),
        });
        toast('Trial session booked! Confirmation ready.', 'success');
      } else {
        const useMemberId =
          mode === 'MEMBER'
            ? user?.memberId
            : bookingType === 'MEMBER'
              ? staffSelectedMemberId
              : null;

        await apiFetch('/bookings', {
          method: 'POST',
          body: JSON.stringify({
            courtId: selectedSlot.courtId,
            bookingDate: selectedDate,
            startTimeHHMM: selectedSlot.time,
            memberId: useMemberId || null,
            guestName: useMemberId ? null : guestName,
            guestPhone: useMemberId ? null : guestPhone,
            bookingType: useMemberId ? 'MEMBER' : bookingType,
            paymentMethod,
            notes: notes || null,
          }),
        });
        toast('Court booking confirmed!', 'success');
      }

      setSelectedSlot(null);
      setNotes('');
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      onBooked?.();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Unable to complete booking.';
      toast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const sports = ['ALL', 'TENNIS', 'CRICKET', 'PADEL', 'BADMINTON'];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg overflow-x-auto">
          {sports.map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSportFilter(sp)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                sportFilter === sp
                  ? 'bg-slate-900 text-white dark:bg-lime-400 dark:text-slate-950'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {sp === 'ALL' ? 'All Sports' : sp.charAt(0) + sp.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedDate(addDaysStr(selectedDate, -1))}
            aria-label="Previous day"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
            <Calendar className="w-4 h-4 text-lime-500" />
            <input
              type="date"
              aria-label="Select booking date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm font-medium focus:outline-none tabular-nums"
            />
          </div>
          <button
            type="button"
            onClick={() => setSelectedDate(addDaysStr(selectedDate, 1))}
            aria-label="Next day"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(getTodayIstStr())}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            Today
          </button>
        </div>
      </div>

      {/* Legend (unboxed clean indicators paired with text labels) */}
      <div className="flex flex-wrap items-center gap-6 text-xs text-slate-600 dark:text-slate-400 px-1">
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/60" /> Free (60 min)
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-slate-300 dark:bg-slate-700 border border-slate-400 dark:border-slate-600" /> Booked
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-lime-400/30 border border-lime-400" /> My Booking
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-sky-500/25 border border-sky-400" /> Social Play
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/60" /> Blocked
        </span>
        <span className="ml-auto font-mono tabular-nums">{formatIstDate(selectedDate)} · IST</span>
      </div>

      {/* Grid Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading live court availability...</div>
        ) : !data || data.courts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No courts active for selected filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                  <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-950 text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-200 min-w-[180px] border-r border-slate-200 dark:border-slate-800">
                    Court / Rate
                  </th>
                  {data.slotLabels.map((time) => (
                    <th
                      key={time}
                      className="px-1.5 py-3 text-center font-mono tabular-nums font-medium text-slate-500 dark:text-slate-400 min-w-[58px]"
                    >
                      {time}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.courts.map(({ court, slots }) => (
                  <tr key={court.id} className="border-b border-slate-100 dark:border-slate-800/70 last:border-0">
                    <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-4 py-2.5 border-r border-slate-200 dark:border-slate-800">
                      <div className="font-semibold text-slate-900 dark:text-white text-sm">{court.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {court.sport} · {formatINR(court.hourlyRatePaise)}/hr
                      </div>
                    </td>
                    {slots.map((cell) => {
                      const canClick =
                        cell.state === 'FREE' ||
                        (cell.state === 'SOCIAL' && (cell.joinedCount ?? 0) < (cell.capacity ?? 8) && !cell.isViewerJoined);

                      let cellStyle =
                        'bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 cursor-pointer';
                      let label = 'Free';

                      if (cell.state === 'BOOKED') {
                        cellStyle =
                          'bg-slate-200/70 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 border-slate-300/60 dark:border-slate-700 cursor-not-allowed';
                        label = 'Booked';
                      } else if (cell.state === 'MINE') {
                        cellStyle =
                          'bg-lime-400/25 text-lime-800 dark:text-lime-300 border-lime-400/70 font-semibold cursor-default';
                        label = 'Mine';
                      } else if (cell.state === 'SOCIAL') {
                        cellStyle = canClick
                          ? 'bg-sky-500/20 hover:bg-sky-500/35 text-sky-700 dark:text-sky-300 border-sky-400/60 cursor-pointer font-semibold'
                          : 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-400/40 cursor-default';
                        label = `${cell.joinedCount}/${cell.capacity}`;
                      } else if (cell.state === 'BLOCKED') {
                        cellStyle =
                          'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 cursor-not-allowed';
                        label = 'Blocked';
                      }

                      return (
                        <td key={cell.time} className="p-1 text-center">
                          <button
                            type="button"
                            disabled={!canClick}
                            title={
                              cell.state === 'BLOCKED'
                                ? `${cell.blockType}: ${cell.reason}`
                                : cell.state === 'SOCIAL'
                                  ? `${cell.title} (${cell.joinedCount}/${cell.capacity})`
                                  : `${court.name} at ${cell.time} (${label})`
                            }
                            onClick={() => {
                              if (!canClick) return;
                              setBookingType(
                                mode === 'STAFF' && staffSelectedMemberId
                                  ? 'MEMBER'
                                  : mode === 'MEMBER'
                                    ? 'MEMBER'
                                    : 'WALK_IN'
                              );
                              setSelectedSlot({
                                courtId: court.id,
                                courtName: court.name,
                                sport: court.sport,
                                time: cell.time,
                                cell,
                              });
                            }}
                            className={`w-full h-9 rounded border text-[11px] font-mono tabular-nums transition-colors ${cellStyle}`}
                          >
                            {label}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Booking / Social Join Modal */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {selectedSlot.cell.state === 'SOCIAL' ? selectedSlot.cell.title : 'Confirm Court Booking'}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {selectedSlot.courtName} · {formatIstDate(selectedDate)} · {selectedSlot.time} (60 min)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSlot(null)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmBooking} className="space-y-4">
              {selectedSlot.cell.state === 'SOCIAL' ? (
                <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium text-sky-700 dark:text-sky-300">
                      <Users className="w-4 h-4" /> Friday Social Play
                    </span>
                    <span className="font-mono tabular-nums">
                      {selectedSlot.cell.joinedCount}/{selectedSlot.cell.capacity} joined
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700 dark:text-slate-200 font-semibold pt-1">
                    <span>Per-head fee</span>
                    <span className="font-mono tabular-nums">
                      {formatINR(selectedSlot.cell.pricePerHeadPaise)}
                    </span>
                  </div>
                </div>
              ) : quoteError ? (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 rounded-xl p-3 text-sm">
                  {(quoteError as Error).message}
                </div>
              ) : quoteData ? (
                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Standard Rate ({quoteData.quote.isPeak ? 'Peak Hours' : '60 min'})</span>
                    <span className="font-mono tabular-nums">{formatINR(quoteData.quote.baseAmountPaise)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 dark:text-lime-400">
                    <span>Plan Benefit ({quoteData.quote.planCode} · {quoteData.quote.discountPct}% off)</span>
                    <span className="font-mono tabular-nums">-{formatINR(quoteData.quote.discountAmountPaise)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span>Total Due</span>
                    <span className="font-mono tabular-nums">{formatINR(quoteData.quote.finalAmountPaise)}</span>
                  </div>
                </div>
              ) : null}

              {mode === 'STAFF' && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Booking Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['MEMBER', 'WALK_IN', 'PHONE'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        disabled={t === 'MEMBER' && !staffSelectedMemberId}
                        onClick={() => setBookingType(t)}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-colors ${
                          bookingType === t
                            ? 'bg-lime-400 text-slate-950 border-lime-400'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40'
                        }`}
                      >
                        {t === 'MEMBER' ? 'Member' : t === 'WALK_IN' ? 'Walk-in' : 'Phone'}
                      </button>
                    ))}
                  </div>
                  {bookingType === 'MEMBER' && staffSelectedMemberId && (
                    <p className="text-xs text-lime-500">Booking for selected member ID #{staffSelectedMemberId}</p>
                  )}
                </div>
              )}

              {((mode === 'PUBLIC' && !user) || (mode === 'STAFF' && bookingType !== 'MEMBER')) && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Player Full Name
                    </label>
                    <input
                      required
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="e.g. Kabir Sharma"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Phone Number
                    </label>
                    <input
                      required
                      type="tel"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="+91 98201 00000"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    />
                  </div>
                  {mode === 'PUBLIC' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Email (for confirmation)
                      </label>
                      <input
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        placeholder="you@example.in"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                      />
                    </div>
                  )}
                </div>
              )}

              {(selectedSlot.cell.state === 'SOCIAL' || (quoteData && quoteData.quote.finalAmountPaise > 0)) && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Payment Method (Simulated)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['CARD', 'UPI', ...(mode === 'STAFF' ? (['CASH'] as const) : (['ONLINE'] as const))] as const).map((pm) => (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => setPaymentMethod(pm)}
                        className={`py-2 rounded-lg text-xs font-semibold border ${
                          paymentMethod === pm
                            ? 'bg-slate-900 text-white dark:bg-lime-400 dark:text-slate-950 border-transparent'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {pm}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mode !== 'PUBLIC' && selectedSlot.cell.state === 'FREE' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ball machine, hitting partner, etc."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Free cancellation up to 4 hours prior to session start. Max 2 active bookings per member per day.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedSlot(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || Boolean(quoteError)}
                  className="px-5 py-2 rounded-lg text-sm font-semibold bg-lime-400 text-slate-950 hover:bg-lime-300 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {submitting ? 'Confirming...' : selectedSlot.cell.state === 'SOCIAL' ? 'Join & Pay' : 'Confirm Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
