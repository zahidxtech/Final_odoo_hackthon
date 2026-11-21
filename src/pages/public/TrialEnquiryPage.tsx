import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { apiFetch, ApiError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { formatINR, getTodayIstStr, addDaysStr } from '../../lib/format';

export function TrialEnquiryPage() {
  const { toast } = useToast();
  const [trialDone, setTrialDone] = useState<{ id: number; courtName: string; date: string; time: string } | null>(null);
  const [enquiryDone, setEnquiryDone] = useState(false);

  // Trial booking form
  const [courtId, setCourtId] = useState<number>(1);
  const [bookingDate, setBookingDate] = useState(addDaysStr(getTodayIstStr(), 1));
  const [startTimeHHMM, setStartTimeHHMM] = useState('09:00');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'UPI' | 'ONLINE'>('UPI');
  const [trialSubmitting, setTrialSubmitting] = useState(false);

  // Enquiry form
  const [eqName, setEqName] = useState('');
  const [eqEmail, setEqEmail] = useState('');
  const [eqPhone, setEqPhone] = useState('');
  const [eqInterest, setEqInterest] = useState('GOLD_MEMBERSHIP');
  const [eqMessage, setEqMessage] = useState('');
  const [eqSubmitting, setEqSubmitting] = useState(false);

  const { data: courtsData } = useQuery<{
    courts: Array<{ id: number; name: string; sport: string; hourlyRatePaise: number }>;
  }>({
    queryKey: ['public-courts'],
    queryFn: () => apiFetch('/bookings/courts'),
  });

  const handleTrialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrialSubmitting(true);
    try {
      const res = await apiFetch<{ booking: { id: number; courtName: string } }>('/bookings/trial', {
        method: 'POST',
        body: JSON.stringify({
          courtId,
          bookingDate,
          startTimeHHMM,
          guestName,
          guestPhone,
          guestEmail: guestEmail || undefined,
          paymentMethod,
        }),
      });
      setTrialDone({
        id: res.booking.id,
        courtName: res.booking.courtName,
        date: bookingDate,
        time: startTimeHHMM,
      });
      toast('Trial session booked!', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Unable to book trial slot.', 'error');
    } finally {
      setTrialSubmitting(false);
    }
  };

  const handleEnquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEqSubmitting(true);
    try {
      await apiFetch('/crm/leads/public', {
        method: 'POST',
        body: JSON.stringify({
          fullName: eqName,
          email: eqEmail,
          phone: eqPhone,
          interest: eqInterest,
          message: eqMessage,
        }),
      });
      setEnquiryDone(true);
      toast('Enquiry submitted! Our front desk has been notified.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to submit enquiry.', 'error');
    } finally {
      setEqSubmitting(false);
    }
  };

  const timeOptions = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-10">
      <div className="max-w-2xl space-y-2">
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">
          Book a Trial Session or Send an Enquiry
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Experience our courts as a guest or ask our membership team about Gold, Silver, Junior Academy, and Corporate packages.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Book a Trial */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 lg:p-8 space-y-6">
          <div>
            <h2 className="font-display text-xl font-bold">01. Book a 60-Min Trial Session</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Instant guest reservation with simulated checkout.
            </p>
          </div>

          {trialDone ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-lime-400">
                <CheckCircle2 className="w-5 h-5" />
                Trial Booking #{trialDone.id} Confirmed
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {trialDone.courtName} reserved on {trialDone.date} at {trialDone.time} IST. Check in at the Front Desk 10 minutes before start.
              </p>
              <button
                type="button"
                onClick={() => setTrialDone(null)}
                className="px-4 py-2 rounded-lg bg-lime-400 text-slate-950 text-xs font-semibold"
              >
                Book Another Slot
              </button>
            </div>
          ) : (
            <form onSubmit={handleTrialSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Court</label>
                <select
                  value={courtId}
                  onChange={(e) => setCourtId(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  {(courtsData?.courts || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.sport}) — {formatINR(c.hourlyRatePaise)}/hr
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date</label>
                  <input
                    required
                    type="date"
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Start Time</label>
                  <select
                    value={startTimeHHMM}
                    onChange={(e) => setStartTimeHHMM(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  >
                    {timeOptions.map((t) => (
                      <option key={t} value={t}>{t} IST</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Your Name</label>
                  <input
                    required
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phone</label>
                  <input
                    required
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="+91 98201 00000"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Email</label>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="you@example.in"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['UPI', 'CARD', 'ONLINE'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`py-2 rounded-lg text-xs font-semibold border ${
                        paymentMethod === m
                          ? 'bg-slate-900 text-white dark:bg-lime-400 dark:text-slate-950 border-transparent'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={trialSubmitting}
                className="w-full py-3 rounded-xl bg-lime-400 text-slate-950 font-semibold text-sm hover:bg-lime-300 disabled:opacity-50"
              >
                {trialSubmitting ? 'Confirming Trial...' : 'Pay & Confirm Trial Session'}
              </button>
            </form>
          )}
        </div>

        {/* Membership & Corporate Enquiry */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 lg:p-8 space-y-6">
          <div>
            <h2 className="font-display text-xl font-bold">02. Membership &amp; Corporate Enquiry</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Sends directly to our membership advisors with quote follow-up.
            </p>
          </div>

          {enquiryDone ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-lime-400">
                <CheckCircle2 className="w-5 h-5" />
                Enquiry Received
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Thank you! Our front-desk team has logged your enquiry and will reach out with a tailored quote.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEnquiryDone(false);
                  setEqMessage('');
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Send Another Enquiry
              </button>
            </div>
          ) : (
            <form onSubmit={handleEnquirySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Full Name</label>
                <input
                  required
                  type="text"
                  value={eqName}
                  onChange={(e) => setEqName(e.target.value)}
                  placeholder="Your name or company contact"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Email</label>
                  <input
                    required
                    type="email"
                    value={eqEmail}
                    onChange={(e) => setEqEmail(e.target.value)}
                    placeholder="name@company.in"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phone</label>
                  <input
                    required
                    type="tel"
                    value={eqPhone}
                    onChange={(e) => setEqPhone(e.target.value)}
                    placeholder="+91 98201 00000"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Interest</label>
                <select
                  value={eqInterest}
                  onChange={(e) => setEqInterest(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="GOLD_MEMBERSHIP">Gold Premier Membership</option>
                  <option value="SILVER_MEMBERSHIP">Silver Club Membership</option>
                  <option value="JUNIOR_ACADEMY">Junior Academy (Under 18)</option>
                  <option value="CORPORATE">Corporate Wellness / Bulk Passes</option>
                  <option value="TRIAL">Coaching &amp; Private Trial</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Message</label>
                <textarea
                  required
                  rows={4}
                  value={eqMessage}
                  onChange={(e) => setEqMessage(e.target.value)}
                  placeholder="Tell us preferred sports, timings, or team size..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={eqSubmitting}
                className="w-full py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-semibold text-sm hover:opacity-90 disabled:opacity-50"
              >
                {eqSubmitting ? 'Sending...' : 'Submit Enquiry'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
