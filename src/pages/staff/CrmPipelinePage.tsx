import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, CheckCircle2, FileText, LayoutGrid, List, Plus, UserPlus, X } from 'lucide-react';
import { apiFetch, ApiError } from '../../lib/api';
import { calculateAgeFromDob, formatINR, formatIstDate } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

type LeadStatus = 'NEW' | 'CONTACTED' | 'QUOTE_SENT' | 'WON' | 'LOST';

interface LeadNote {
  id: number;
  note: string;
  authorName: string;
  createdAt: string;
}

interface LeadQuote {
  id: number;
  quoteNumber: string;
  planId: number;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  quotedAmountPaise: number;
  discountPaise: number;
  finalAmountPaise: number;
  validUntil: string;
  notes: string | null;
  createdAt: string;
}

interface Lead {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  source: 'WEBSITE' | 'PHONE' | 'WALK_IN' | 'REFERRAL';
  interest: string;
  message: string;
  status: LeadStatus;
  assignedName: string | null;
  followUpDate: string | null;
  convertedMemberId: number | null;
  createdAt: string;
  notes: LeadNote[];
  quotes: LeadQuote[];
}

const STAGES: Array<{ id: LeadStatus; label: string; tone: string }> = [
  { id: 'NEW', label: 'New Enquiry', tone: 'text-sky-500' },
  { id: 'CONTACTED', label: 'Contacted', tone: 'text-amber-500' },
  { id: 'QUOTE_SENT', label: 'Quote Sent', tone: 'text-violet-500' },
  { id: 'WON', label: 'Won / Member', tone: 'text-emerald-500' },
  { id: 'LOST', label: 'Lost', tone: 'text-slate-400' },
];

export function CrmPipelinePage() {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<'KANBAN' | 'LIST'>('KANBAN');
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);

  const { data, refetch } = useQuery<{ leads: Lead[] }>({
    queryKey: ['crm-leads'],
    queryFn: () => apiFetch('/crm/leads'),
  });

  const leads = data?.leads || [];
  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;

  // New Lead form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newSource, setNewSource] = useState<'WALK_IN' | 'PHONE' | 'REFERRAL' | 'WEBSITE'>('WALK_IN');
  const [newInterest, setNewInterest] = useState('Gold Membership');
  const [newMessage, setNewMessage] = useState('');

  // Note & Follow-up state
  const [noteText, setNoteText] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  // Quote modal state
  const [quotePlan, setQuotePlan] = useState<'GOLD' | 'SILVER' | 'JUNIOR'>('GOLD');
  const [quoteCycle, setQuoteCycle] = useState<'MONTHLY' | 'ANNUAL'>('ANNUAL');
  const [quoteDiscountInr, setQuoteDiscountInr] = useState(2000);
  const [quoteNotes, setQuoteNotes] = useState('Includes complimentary welcome coaching clinic.');

  // Convert modal state
  const [convDob, setConvDob] = useState('1994-06-15');
  const [convPlan, setConvPlan] = useState<'GOLD' | 'SILVER' | 'JUNIOR'>('GOLD');
  const [convCycle, setConvCycle] = useState<'MONTHLY' | 'ANNUAL'>('ANNUAL');
  const [convPayment, setConvPayment] = useState<'CARD' | 'UPI' | 'CASH' | 'ONLINE'>('CARD');
  const [convEmgName, setConvEmgName] = useState('');
  const [convEmgPhone, setConvEmgPhone] = useState('');

  const convAge = calculateAgeFromDob(convDob);
  const convIsJunior = convAge !== null && convAge < 18;

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ lead: Lead }>('/crm/leads', {
        method: 'POST',
        body: JSON.stringify({
          fullName: newName,
          email: newEmail,
          phone: newPhone,
          source: newSource,
          interest: newInterest,
          message: newMessage,
        }),
      });
      toast(`Lead created for ${res.lead.fullName}`, 'success');
      setShowNewModal(false);
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewMessage('');
      setSelectedLeadId(res.lead.id);
      refetch();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to create lead.', 'error');
    }
  };

  const handleStatusChange = async (leadId: number, status: LeadStatus) => {
    try {
      await apiFetch(`/crm/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast(`Stage updated to ${status.replace('_', ' ')}`, 'info');
      refetch();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Update failed.', 'error');
    }
  };

  const handleUpdateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !followUpDate) return;
    try {
      await apiFetch(`/crm/leads/${selectedLead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ followUpDate }),
      });
      toast(`Follow-up reminder set for ${formatIstDate(followUpDate)}`, 'success');
      refetch();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update follow-up.', 'error');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !noteText.trim()) return;
    try {
      await apiFetch(`/crm/leads/${selectedLead.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note: noteText }),
      });
      setNoteText('');
      toast('Follow-up note added', 'success');
      refetch();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to add note.', 'error');
    }
  };

  const handleSendQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;
    try {
      const res = await apiFetch<{ quote: { quoteNumber: string; finalAmountPaise: number } }>(
        `/crm/leads/${selectedLead.id}/quotes`,
        {
          method: 'POST',
          body: JSON.stringify({
            planCode: quotePlan,
            billingCycle: quoteCycle,
            discountPaise: Math.max(0, Math.round(quoteDiscountInr * 100)),
            notes: quoteNotes,
          }),
        }
      );
      toast(`Quote ${res.quote.quoteNumber} sent (${formatINR(res.quote.finalAmountPaise)})`, 'success');
      setShowQuoteModal(false);
      refetch();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send quote.', 'error');
    }
  };

  const handleConvertLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;
    try {
      const res = await apiFetch<{ member: { memberCode: string; fullName: string } }>(
        `/crm/leads/${selectedLead.id}/convert`,
        {
          method: 'POST',
          body: JSON.stringify({
            dob: convDob,
            planCode: convIsJunior ? 'JUNIOR' : convPlan,
            billingCycle: convCycle,
            paymentMethod: convPayment,
            emergencyContactName: convEmgName,
            emergencyContactPhone: convEmgPhone,
          }),
        }
      );
      toast(`Converted to Member ${res.member.memberCode} (${res.member.fullName})!`, 'success');
      setShowConvertModal(false);
      refetch();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Conversion failed.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Enquiries &amp; CRM Pipeline</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Track website enquiries, walk-in tours, membership quotes, follow-ups, and 1-click member conversions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('KANBAN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                viewMode === 'KANBAN' ? 'bg-white dark:bg-lime-400 text-slate-950 shadow-sm' : 'text-slate-500'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('LIST')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                viewMode === 'LIST' ? 'bg-white dark:bg-lime-400 text-slate-950 shadow-sm' : 'text-slate-500'
              }`}
            >
              <List className="w-3.5 h-3.5" /> List
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="px-4 py-2 rounded-xl bg-lime-400 text-slate-950 text-xs font-semibold hover:bg-lime-300 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> New Lead
          </button>
        </div>
      </div>

      {/* Stage Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 tabular-nums">
        {STAGES.map((st) => {
          const count = leads.filter((l) => l.status === st.id).length;
          return (
            <div key={st.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className={`text-xs font-semibold ${st.tone}`}>{st.label}</div>
              <div className="font-display text-2xl font-bold mt-1">{count}</div>
            </div>
          );
        })}
      </div>

      {/* Kanban or List View */}
      {viewMode === 'KANBAN' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
          {STAGES.map((stage) => {
            const colLeads = leads.filter((l) => l.status === stage.id);
            return (
              <div
                key={stage.id}
                className="bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-3 min-h-[260px]"
              >
                <div className="flex items-center justify-between px-1">
                  <span className={`text-xs font-semibold ${stage.tone}`}>{stage.label}</span>
                  <span className="text-xs font-mono text-slate-500">{colLeads.length}</span>
                </div>
                <div className="space-y-2.5">
                  {colLeads.map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => {
                        setSelectedLeadId(lead.id);
                        setFollowUpDate(lead.followUpDate || '');
                      }}
                      className={`w-full text-left bg-white dark:bg-slate-950 border rounded-xl p-3.5 space-y-1.5 transition-colors ${
                        selectedLeadId === lead.id
                          ? 'border-lime-400 ring-1 ring-lime-400'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="font-semibold text-sm truncate">{lead.fullName}</div>
                      <div className="text-[11px] text-slate-500">
                        {lead.interest} · {lead.source}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">{lead.phone}</div>
                      {lead.followUpDate && (
                        <div className="text-[11px] text-amber-500 flex items-center gap-1 pt-0.5">
                          <Calendar className="w-3 h-3" /> Follow-up {formatIstDate(lead.followUpDate)}
                        </div>
                      )}
                      {lead.quotes.length > 0 && (
                        <div className="text-[11px] text-violet-500 font-mono">
                          {lead.quotes[0].quoteNumber} · {formatINR(lead.quotes[0].finalAmountPaise)}
                        </div>
                      )}
                    </button>
                  ))}
                  {colLeads.length === 0 && (
                    <div className="py-8 text-center text-xs text-slate-400">No leads in this stage</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-500">
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Interest &amp; Source</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Follow-Up</th>
                <th className="px-4 py-3">Latest Quote</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-sm">{lead.fullName}</div>
                    <div className="text-slate-500 font-mono">{lead.email} · {lead.phone}</div>
                  </td>
                  <td className="px-4 py-3">{lead.interest} · {lead.source}</td>
                  <td className="px-4 py-3 font-semibold">{lead.status.replace('_', ' ')}</td>
                  <td className="px-4 py-3 font-mono">{lead.followUpDate ? formatIstDate(lead.followUpDate) : '—'}</td>
                  <td className="px-4 py-3 font-mono">
                    {lead.quotes[0] ? `${lead.quotes[0].quoteNumber} (${formatINR(lead.quotes[0].finalAmountPaise)})` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLeadId(lead.id);
                        setFollowUpDate(lead.followUpDate || '');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold hover:border-lime-400"
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Selected Lead Detail Panel */}
      {selectedLead && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="text-xs text-slate-500">
                Lead #{selectedLead.id} · {selectedLead.source} · Created {formatIstDate(selectedLead.createdAt)}
              </div>
              <h2 className="font-display text-2xl font-bold mt-1">{selectedLead.fullName}</h2>
              <div className="text-xs text-slate-500 mt-1">
                {selectedLead.email} · {selectedLead.phone} · Interest: <strong>{selectedLead.interest}</strong>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">{selectedLead.message}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedLead.status}
                onChange={(e) => handleStatusChange(selectedLead.id, e.target.value as LeadStatus)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold"
              >
                {STAGES.map((st) => (
                  <option key={st.id} value={st.id}>{st.label}</option>
                ))}
              </select>

              {!selectedLead.convertedMemberId && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowQuoteModal(true)}
                    className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:border-lime-400"
                  >
                    <FileText className="w-3.5 h-3.5" /> Send Quote
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConvertModal(true)}
                    className="px-3.5 py-2 rounded-lg bg-lime-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-lime-300"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Convert to Member
                  </button>
                </>
              )}
              {selectedLead.convertedMemberId && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500">
                  <CheckCircle2 className="w-4 h-4" /> Converted (Member #{selectedLead.convertedMemberId})
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Follow-up & Quotes */}
            <div className="lg:col-span-5 space-y-5">
              <form onSubmit={handleUpdateFollowUp} className="space-y-2">
                <label className="block text-xs font-semibold">Follow-Up Reminder Date</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-lg bg-slate-900 text-white dark:bg-slate-800 text-xs font-semibold"
                  >
                    Set Reminder
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Quotes Sent</h3>
                {selectedLead.quotes.length === 0 ? (
                  <p className="text-xs text-slate-500">No quotes generated yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedLead.quotes.map((q) => (
                      <div key={q.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                        <div className="flex justify-between font-semibold">
                          <span className="font-mono">{q.quoteNumber}</span>
                          <span className="font-mono text-lime-600 dark:text-lime-400">{formatINR(q.finalAmountPaise)}</span>
                        </div>
                        <div className="text-slate-500">
                          {q.billingCycle} · Base {formatINR(q.quotedAmountPaise)} · Discount {formatINR(q.discountPaise)} · Valid until {formatIstDate(q.validUntil)}
                        </div>
                        {q.notes && <div className="text-slate-400">{q.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Notes Timeline */}
            <div className="lg:col-span-7 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes &amp; Activity Log</h3>
              <form onSubmit={handleAddNote} className="flex gap-2">
                <input
                  required
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Log a call summary, court tour note, or preference..."
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-lime-400 text-slate-950 text-xs font-semibold"
                >
                  Add Note
                </button>
              </form>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
                {selectedLead.notes.map((n) => (
                  <div key={n.id} className="py-2.5 text-xs space-y-1">
                    <div className="flex justify-between text-slate-500">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{n.authorName}</span>
                      <span>{formatIstDate(n.createdAt)}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">{n.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Lead Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateLead}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Add Walk-in / Phone Lead</h3>
              <button type="button" onClick={() => setShowNewModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Full Name"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Email"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
              <input
                required
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Phone"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={newSource}
                onChange={(e) => setNewSource(e.target.value as typeof newSource)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
              >
                <option value="WALK_IN">Walk-In</option>
                <option value="PHONE">Phone Call</option>
                <option value="REFERRAL">Referral</option>
                <option value="WEBSITE">Website</option>
              </select>
              <input
                required
                value={newInterest}
                onChange={(e) => setNewInterest(e.target.value)}
                placeholder="Interest (e.g. Gold Tennis)"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
            </div>
            <textarea
              required
              rows={3}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Enquiry notes..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-lime-400 text-slate-950 font-semibold text-sm">
              Create Lead
            </button>
          </form>
        </div>
      )}

      {/* Quote Modal */}
      {showQuoteModal && selectedLead && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSendQuote}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Send Membership Quote</h3>
              <button type="button" onClick={() => setShowQuoteModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="text-xs text-slate-500">Recipient: <strong>{selectedLead.fullName}</strong> ({selectedLead.email})</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1">Plan</label>
                <select
                  value={quotePlan}
                  onChange={(e) => setQuotePlan(e.target.value as typeof quotePlan)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                >
                  <option value="GOLD">Gold Premier (₹45,000/yr)</option>
                  <option value="SILVER">Silver Club (₹25,000/yr)</option>
                  <option value="JUNIOR">Junior Academy (₹15,000/yr)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1">Billing Cycle</label>
                <select
                  value={quoteCycle}
                  onChange={(e) => setQuoteCycle(e.target.value as typeof quoteCycle)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                >
                  <option value="ANNUAL">Annual</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs mb-1">Welcome Discount (₹)</label>
              <input
                type="number"
                min={0}
                value={quoteDiscountInr}
                onChange={(e) => setQuoteDiscountInr(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs mb-1">Notes</label>
              <textarea
                rows={2}
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-lime-400 text-slate-950 font-semibold text-sm">
              Generate &amp; Send Quote
            </button>
          </form>
        </div>
      )}

      {/* Convert to Member Modal */}
      {showConvertModal && selectedLead && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleConvertLead}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Convert Lead to Member</h3>
              <button type="button" onClick={() => setShowConvertModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="text-xs text-slate-500">
              {selectedLead.fullName} · {selectedLead.email} · {selectedLead.phone}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1">Date of Birth</label>
                <input
                  required
                  type="date"
                  value={convDob}
                  onChange={(e) => setConvDob(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
                {convIsJunior && <p className="text-[11px] text-amber-500 mt-1">Under 18: Junior plan locked</p>}
              </div>
              <div>
                <label className="block text-xs mb-1">Plan</label>
                <select
                  disabled={convIsJunior}
                  value={convIsJunior ? 'JUNIOR' : convPlan}
                  onChange={(e) => setConvPlan(e.target.value as typeof convPlan)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                >
                  <option value="GOLD">Gold Premier</option>
                  <option value="SILVER">Silver Club</option>
                  <option value="JUNIOR">Junior Academy</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={convCycle}
                onChange={(e) => setConvCycle(e.target.value as typeof convCycle)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
              >
                <option value="ANNUAL">Annual Billing</option>
                <option value="MONTHLY">Monthly Billing</option>
              </select>
              <select
                value={convPayment}
                onChange={(e) => setConvPayment(e.target.value as typeof convPayment)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
              >
                <option value="CARD">Card</option>
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                value={convEmgName}
                onChange={(e) => setConvEmgName(e.target.value)}
                placeholder="Emergency Contact Name"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
              <input
                required
                value={convEmgPhone}
                onChange={(e) => setConvEmgPhone(e.target.value)}
                placeholder="Emergency Phone"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-lime-400 text-slate-950 font-semibold text-sm">
              Complete Registration &amp; Issue Pass
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
