import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, QrCode, RefreshCw, Search, ShoppingCart, UserPlus } from 'lucide-react';
import { AvailabilityGrid } from '../../components/AvailabilityGrid';
import { QrScannerModal } from '../../components/QrScannerModal';
import { apiFetch, ApiError } from '../../lib/api';
import { calculateAgeFromDob, formatINR, formatIstDate, getTodayIstStr } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

interface MemberSummary {
  id: number;
  memberCode: string;
  qrToken: string;
  fullName: string;
  email: string;
  phone: string;
  dob: string;
  status: string;
  daysToExpiry: number | null;
  creditBalancePaise: number;
  currentMembership?: { startDate: string; endDate: string };
  plan?: { code: string; name: string; shopDiscountPct: number };
}

export function FrontDeskPage() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'LOOKUP' | 'REGISTER' | 'BOOKINGS' | 'POS'>('LOOKUP');
  const [memberQuery, setMemberQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    const paramId = searchParams.get('memberId');
    if (paramId) {
      setSelectedMemberId(Number(paramId));
      setTab('LOOKUP');
    }
  }, [searchParams]);

  const { data: membersData, refetch: refetchMembers } = useQuery<{ members: MemberSummary[] }>({
    queryKey: ['staff-members', memberQuery, statusFilter],
    queryFn: () => apiFetch(`/members?q=${encodeURIComponent(memberQuery)}&status=${statusFilter}`),
  });

  const { data: historyData, refetch: refetchHistory } = useQuery<{
    profile: MemberSummary;
    bookings: Array<{ id: number; courtName: string; bookingDate: string; status: string; finalAmountPaise: number }>;
    shopOrders: Array<{ id: number; orderNumber: string; totalPaise: number; status: string; createdAt: string }>;
    tabs: Array<{ id: number; status: string; totalPaise: number; paidPaise: number }>;
  }>({
    queryKey: ['staff-member-history', selectedMemberId],
    queryFn: () => apiFetch(`/members/${selectedMemberId}/history`),
    enabled: Boolean(selectedMemberId),
  });

  const { data: todayBookingsData, refetch: refetchTodayBookings } = useQuery<{
    bookings: Array<{
      id: number;
      courtName: string;
      bookingDate: string;
      startHHMM: string;
      endHHMM: string;
      memberName: string | null;
      guestName: string | null;
      bookingType: string;
      status: string;
      finalAmountPaise: number;
    }>;
  }>({
    queryKey: ['staff-today-bookings'],
    queryFn: () => apiFetch(`/bookings?date=${getTodayIstStr()}`),
  });

  // Registration form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regDob, setRegDob] = useState('1995-04-10');
  const [regEmergencyName, setRegEmergencyName] = useState('');
  const [regEmergencyPhone, setRegEmergencyPhone] = useState('');
  const [regPlan, setRegPlan] = useState<'GOLD' | 'SILVER' | 'JUNIOR'>('GOLD');
  const [regCycle, setRegCycle] = useState<'MONTHLY' | 'ANNUAL'>('ANNUAL');
  const [regPay, setRegPay] = useState<'CASH' | 'CARD' | 'UPI'>('CARD');
  const [regPhoto, setRegPhoto] = useState<string | null>(null);

  const regAge = calculateAgeFromDob(regDob);
  const regIsUnder18 = regAge !== null && regAge < 18;
  useEffect(() => {
    if (regIsUnder18 && regPlan !== 'JUNIOR') setRegPlan('JUNIOR');
  }, [regIsUnder18, regPlan]);

  // Counter POS state
  const { data: shopProductsData, refetch: refetchShop } = useQuery<{
    products: Array<{
      id: number;
      name: string;
      category: string;
      pricePaise: number;
      variants: Array<{ id: number; sku: string; size: string; color: string; stockQty: number }>;
    }>;
  }>({
    queryKey: ['pos-products'],
    queryFn: () => apiFetch('/shop/products'),
  });
  const [posCart, setPosCart] = useState<Array<{ variantId: number; name: string; pricePaise: number; qty: number }>>([]);
  const [posPayMethod, setPosPayMethod] = useState<'CASH' | 'CARD' | 'UPI'>('CARD');
  const [posWalkinName, setPosWalkinName] = useState('Walk-in Customer');

  // Social session quick-create state
  const [socialTitle, setSocialTitle] = useState('Friday Night Floodlight Social');
  const [socialDate, setSocialDate] = useState(getTodayIstStr());
  const [socialTime, setSocialTime] = useState('19:00');
  const [socialCap, setSocialCap] = useState(8);
  const [socialPrice, setSocialPrice] = useState(400);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRegPhoto(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ member: MemberSummary }>('/members', {
        method: 'POST',
        body: JSON.stringify({
          fullName: regName,
          email: regEmail,
          phone: regPhone,
          dob: regDob,
          photoUrl: regPhoto,
          emergencyContactName: regEmergencyName,
          emergencyContactPhone: regEmergencyPhone,
          planCode: regIsUnder18 ? 'JUNIOR' : regPlan,
          billingCycle: regCycle,
          paymentMethod: regPay,
        }),
      });
      toast(`Registered ${res.member.fullName} (${res.member.memberCode})`, 'success');
      setSelectedMemberId(res.member.id);
      setTab('LOOKUP');
      refetchMembers();
      setRegName('');
      setRegEmail('');
      setRegPhone('');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Registration failed.', 'error');
    }
  };

  const handleSyncStatuses = async () => {
    try {
      const res = await apiFetch<{ updatedCount: number; notificationsCreated: number }>('/members/sync-statuses', {
        method: 'POST',
      });
      toast(`Synced memberships: ${res.updatedCount} updated, ${res.notificationsCreated} alerts sent.`, 'info');
      refetchMembers();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Sync failed.', 'error');
    }
  };

  const handleMemberLifecycle = async (action: 'RENEW' | 'FREEZE' | 'ACTIVE') => {
    if (!selectedMemberId) return;
    try {
      if (action === 'RENEW') {
        const plan = historyData?.profile.plan?.code || 'SILVER';
        await apiFetch(`/members/${selectedMemberId}/renew`, {
          method: 'POST',
          body: JSON.stringify({ planCode: plan, billingCycle: 'ANNUAL', paymentMethod: 'CARD' }),
        });
        toast('Membership renewed for 1 year!', 'success');
      } else {
        await apiFetch(`/members/${selectedMemberId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: action === 'FREEZE' ? 'FROZEN' : 'ACTIVE' }),
        });
        toast(`Member status set to ${action}`, 'info');
      }
      refetchMembers();
      refetchHistory();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Action failed.', 'error');
    }
  };

  const handleAttendance = async (bookingId: number, status: 'CHECKED_IN' | 'COMPLETED' | 'NO_SHOW') => {
    try {
      await apiFetch(`/bookings/${bookingId}/attendance`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast(`Marked booking #${bookingId} as ${status}`, 'success');
      refetchTodayBookings();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Update failed.', 'error');
    }
  };

  const handleCreateSocial = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/bookings/social', {
        method: 'POST',
        body: JSON.stringify({
          title: socialTitle,
          courtId: 2,
          sessionDate: socialDate,
          startTimeHHMM: socialTime,
          durationMinutes: 90,
          capacity: socialCap,
          pricePerHeadPaise: socialPrice * 100,
        }),
      });
      toast('Social session created!', 'success');
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to create social session.', 'error');
    }
  };

  const selectedMember = membersData?.members.find((m) => m.id === selectedMemberId) || historyData?.profile;
  const posSubtotal = posCart.reduce((acc, i) => acc + i.pricePaise * i.qty, 0);
  const posDiscPct = selectedMember?.plan?.shopDiscountPct || 0;
  const posDiscount = Math.round((posSubtotal * posDiscPct) / 100);
  const posTotal = posSubtotal - posDiscount;

  const handlePosCheckout = async () => {
    if (posCart.length === 0) return;
    try {
      const res = await apiFetch<{ order: { orderNumber: string } }>('/shop/orders', {
        method: 'POST',
        body: JSON.stringify({
          memberId: selectedMember?.id || null,
          customerName: selectedMember?.fullName || posWalkinName,
          customerPhone: selectedMember?.phone || '+91 98000 00000',
          channel: 'POS',
          fulfilmentType: 'COUNTER',
          paymentMethod: posPayMethod,
          items: posCart.map((i) => ({ variantId: i.variantId, quantity: i.qty })),
        }),
      });
      toast(`POS Sale ${res.order.orderNumber} completed!`, 'success');
      setPosCart([]);
      refetchShop();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'POS checkout failed.', 'error');
    }
  };

  const handleQrScanLookup = async (rawValue: string) => {
    const res = await apiFetch<{ member: MemberSummary }>(
      `/members/qr-lookup?token=${encodeURIComponent(rawValue)}`
    );
    setSelectedMemberId(res.member.id);
    setMemberQuery(res.member.memberCode);
    setStatusFilter('ALL');
    setTab('LOOKUP');
    setScannerOpen(false);
    toast(
      `Pass verified: ${res.member.fullName} (${res.member.memberCode}) · ${res.member.status}`,
      res.member.status === 'ACTIVE' ? 'success' : 'info'
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Front Desk Console</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Member lookup, walk-in registrations, court desk, attendance check-in, and counter POS.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl overflow-x-auto">
          {[
            { id: 'LOOKUP', label: 'Members & Lookup' },
            { id: 'REGISTER', label: 'Register Member' },
            { id: 'BOOKINGS', label: 'Booking Desk' },
            { id: 'POS', label: 'Counter POS' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
                tab === t.id ? 'bg-white dark:bg-lime-400 text-slate-950 shadow-sm' : 'text-slate-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Member Banner */}
      {selectedMember && (
        <div className="bg-lime-400/10 border border-lime-400/40 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            Active Context: <strong>{selectedMember.fullName}</strong> ({selectedMember.memberCode}) ·{' '}
            {selectedMember.plan?.name} · Status: <strong>{selectedMember.status}</strong>
          </div>
          <button
            type="button"
            onClick={() => setSelectedMemberId(null)}
            className="text-slate-500 hover:text-slate-900 dark:hover:text-white underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {tab === 'LOOKUP' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Search & List */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder="Name, phone, CC-00001, or QR scan..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-lime-400 text-slate-950 text-xs font-semibold hover:bg-lime-300 shrink-0"
                >
                  <QrCode className="w-4 h-4" />
                  Scan QR
                </button>
                <button
                  type="button"
                  onClick={handleSyncStatuses}
                  title="Sync Expiring & Expired Statuses"
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-1.5 overflow-x-auto">
                {['ALL', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'FROZEN'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold whitespace-nowrap ${
                      statusFilter === st ? 'bg-slate-900 text-white dark:bg-lime-400 dark:text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
              {(membersData?.members || []).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMemberId(m.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center justify-between gap-2 ${
                    selectedMemberId === m.id ? 'bg-lime-400/10' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{m.fullName}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      {m.memberCode} · {m.phone}
                    </div>
                  </div>
                  <div className="text-right shrink-0 text-[11px]">
                    <div className="font-semibold">{m.plan?.code}</div>
                    <div
                      className={
                        m.status === 'ACTIVE'
                          ? 'text-emerald-500'
                          : m.status === 'EXPIRING_SOON'
                            ? 'text-amber-500'
                            : 'text-rose-500'
                      }
                    >
                      {m.status}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Member Timeline & Actions */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            {!selectedMemberId || !historyData ? (
              <div className="py-20 text-center text-sm text-slate-500">
                Select a member from the directory to view profile, history timeline, and quick actions.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="text-xs font-mono text-lime-500">{historyData.profile.memberCode} · {historyData.profile.qrToken}</div>
                    <h2 className="font-display text-2xl font-bold mt-1">{historyData.profile.fullName}</h2>
                    <div className="text-xs text-slate-500 mt-1">
                      {historyData.profile.email} · {historyData.profile.phone} · DOB: {historyData.profile.dob}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Plan: <strong>{historyData.profile.plan?.name}</strong> · Expires:{' '}
                      {formatIstDate(historyData.profile.currentMembership?.endDate)} ({historyData.profile.status})
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTab('BOOKINGS')}
                      className="px-3 py-1.5 rounded-lg bg-lime-400 text-slate-950 text-xs font-semibold"
                    >
                      Book Court
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('POS')}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                    >
                      POS Sale
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMemberLifecycle('RENEW')}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                    >
                      Renew 1 Yr
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleMemberLifecycle(historyData.profile.status === 'FROZEN' ? 'ACTIVE' : 'FREEZE')
                      }
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                    >
                      {historyData.profile.status === 'FROZEN' ? 'Unfreeze' : 'Freeze'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm">Recent Court Bookings</h3>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {historyData.bookings.slice(0, 6).map((b) => (
                        <div key={b.id} className="py-2 flex justify-between">
                          <span>{b.courtName} ({formatIstDate(b.bookingDate)})</span>
                          <span className="font-mono">{b.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm">Recent Shop &amp; Bar</h3>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {historyData.shopOrders.slice(0, 4).map((o) => (
                        <div key={o.id} className="py-2 flex justify-between">
                          <span className="font-mono">{o.orderNumber}</span>
                          <span className="font-mono">{formatINR(o.totalPaise)}</span>
                        </div>
                      ))}
                      {historyData.tabs.slice(0, 2).map((t) => (
                        <div key={t.id} className="py-2 flex justify-between text-amber-500">
                          <span>Bar Tab #{t.id} ({t.status})</span>
                          <span className="font-mono">{formatINR(t.totalPaise)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'REGISTER' && (
        <form
          onSubmit={handleRegister}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-w-3xl space-y-5"
        >
          <div className="flex items-center gap-2 font-display text-lg font-semibold">
            <UserPlus className="w-5 h-5 text-lime-500" />
            New Member Registration
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Full Name</label>
              <input
                required
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Date of Birth</label>
              <input
                required
                type="date"
                value={regDob}
                onChange={(e) => setRegDob(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
              {regIsUnder18 && (
                <p className="text-[11px] text-amber-500 mt-1">
                  Under 18 ({regAge} yrs): Junior Academy plan required.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Email</label>
              <input
                required
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Phone</label>
              <input
                required
                type="tel"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Emergency Contact Name</label>
              <input
                required
                value={regEmergencyName}
                onChange={(e) => setRegEmergencyName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Emergency Contact Phone</label>
              <input
                required
                value={regEmergencyPhone}
                onChange={(e) => setRegEmergencyPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Membership Plan</label>
              <select
                disabled={regIsUnder18}
                value={regIsUnder18 ? 'JUNIOR' : regPlan}
                onChange={(e) => setRegPlan(e.target.value as 'GOLD' | 'SILVER' | 'JUNIOR')}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="GOLD">Gold Premier (₹45,000/yr)</option>
                <option value="SILVER">Silver Club (₹25,000/yr)</option>
                <option value="JUNIOR">Junior Academy (₹15,000/yr)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Billing &amp; Payment</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={regCycle}
                  onChange={(e) => setRegCycle(e.target.value as 'MONTHLY' | 'ANNUAL')}
                  className="px-2 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                >
                  <option value="ANNUAL">Annual</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
                <select
                  value={regPay}
                  onChange={(e) => setRegPay(e.target.value as 'CASH' | 'CARD' | 'UPI')}
                  className="px-2 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                >
                  <option value="CARD">Card</option>
                  <option value="UPI">UPI</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Member Photo (Optional)</label>
              <input type="file" accept="image/*" onChange={handlePhotoUpload} className="text-xs" />
            </div>
          </div>
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-lime-400 text-slate-950 font-semibold text-sm hover:bg-lime-300"
          >
            Register Member &amp; Issue QR Pass
          </button>
        </form>
      )}

      {tab === 'BOOKINGS' && (
        <div className="space-y-8">
          <AvailabilityGrid
            mode="STAFF"
            staffSelectedMemberId={selectedMemberId}
            onBooked={() => refetchTodayBookings()}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <h2 className="font-display text-lg font-semibold">Today&apos;s Check-In Desk</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-500">
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Court</th>
                      <th className="px-4 py-3">Player</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                    {(todayBookingsData?.bookings || []).map((b) => (
                      <tr key={b.id}>
                        <td className="px-4 py-3 font-mono">{b.startHHMM}–{b.endHHMM}</td>
                        <td className="px-4 py-3 font-medium">{b.courtName}</td>
                        <td className="px-4 py-3">{b.memberName || b.guestName || 'Guest'} ({b.bookingType})</td>
                        <td className="px-4 py-3 font-semibold">{b.status}</td>
                        <td className="px-4 py-3 text-right space-x-2">
                          {b.status === 'CONFIRMED' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleAttendance(b.id, 'CHECKED_IN')}
                                className="px-2 py-1 rounded bg-lime-400 text-slate-950 font-semibold"
                              >
                                Check In
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAttendance(b.id, 'NO_SHOW')}
                                className="px-2 py-1 rounded border border-rose-500/40 text-rose-500"
                              >
                                No-Show
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <form
              onSubmit={handleCreateSocial}
              className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 self-start"
            >
              <h3 className="font-display font-semibold text-base">Schedule Social Play Session</h3>
              <input
                required
                value={socialTitle}
                onChange={(e) => setSocialTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={socialDate}
                  onChange={(e) => setSocialDate(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
                <input
                  type="time"
                  value={socialTime}
                  onChange={(e) => setSocialTime(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Capacity</label>
                  <input
                    type="number"
                    min={2}
                    max={16}
                    value={socialCap}
                    onChange={(e) => setSocialCap(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Price/head (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={socialPrice}
                    onChange={(e) => setSocialPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-sky-500 text-white text-xs font-semibold hover:bg-sky-400"
              >
                Create Social Session
              </button>
            </form>
          </div>
        </div>
      )}

      {tab === 'POS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[600px] overflow-y-auto pr-1">
            {(shopProductsData?.products || []).map((p) => {
              const v = p.variants[0];
              if (!v) return null;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={v.stockQty <= 0}
                  onClick={() => {
                    setPosCart((prev) => {
                      const ex = prev.find((i) => i.variantId === v.id);
                      if (ex) {
                        return prev.map((i) => (i.variantId === v.id ? { ...i, qty: Math.min(v.stockQty, i.qty + 1) } : i));
                      }
                      return [...prev, { variantId: v.id, name: `${p.name} (${v.size})`, pricePaise: p.pricePaise, qty: 1 }];
                    });
                  }}
                  className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-lime-400 rounded-xl p-4 space-y-1.5 disabled:opacity-40"
                >
                  <div className="text-[11px] text-slate-500">{p.category} · Stock: {v.stockQty}</div>
                  <div className="font-semibold text-sm line-clamp-1">{p.name}</div>
                  <div className="font-mono text-sm font-bold text-lime-600 dark:text-lime-400">{formatINR(p.pricePaise)}</div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 self-start">
            <div className="flex items-center gap-2 font-display font-semibold text-lg">
              <ShoppingCart className="w-5 h-5 text-lime-500" /> Counter POS Cart
            </div>
            {!selectedMember && (
              <input
                type="text"
                value={posWalkinName}
                onChange={(e) => setPosWalkinName(e.target.value)}
                placeholder="Customer name"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
            )}
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto text-xs">
              {posCart.length === 0 ? (
                <div className="py-6 text-center text-slate-500">Tap products to add to counter sale.</div>
              ) : (
                posCart.map((c) => (
                  <div key={c.variantId} className="py-2 flex items-center justify-between gap-2">
                    <span className="truncate">{c.name} ×{c.qty}</span>
                    <span className="font-mono">{formatINR(c.pricePaise * c.qty)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1 text-xs tabular-nums">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-mono">{formatINR(posSubtotal)}</span>
              </div>
              {posDiscount > 0 && (
                <div className="flex justify-between text-lime-500">
                  <span>Member Discount ({posDiscPct}%)</span>
                  <span className="font-mono">-{formatINR(posDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm pt-1">
                <span>Total</span>
                <span className="font-mono">{formatINR(posTotal)}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['CARD', 'UPI', 'CASH'] as const).map((pm) => (
                <button
                  key={pm}
                  type="button"
                  onClick={() => setPosPayMethod(pm)}
                  className={`py-2 rounded-lg text-xs font-semibold border ${
                    posPayMethod === pm ? 'bg-slate-900 text-white dark:bg-lime-400 dark:text-slate-950 border-transparent' : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {pm}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={posCart.length === 0}
              onClick={handlePosCheckout}
              className="w-full py-3 rounded-xl bg-lime-400 text-slate-950 font-semibold text-sm hover:bg-lime-300 disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" /> Complete POS Sale
            </button>
          </div>
        </div>
      )}

      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleQrScanLookup}
      />
    </div>
  );
}
