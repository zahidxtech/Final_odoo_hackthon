import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Check, Printer, X } from 'lucide-react';
import { apiFetch, ApiError } from '../../lib/api';
import { formatINR, formatIstDate, getTodayIstStr } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

interface Employee {
  id: number;
  employeeCode: string;
  fullName: string;
  department: string;
  designation: string;
  phone: string;
  email: string;
  monthlySalaryPaise: number;
  leaveBalanceDays: number;
  isActive: boolean;
}

interface Shift {
  id: number;
  employeeId: number;
  employeeName: string;
  shiftDate: string;
  shiftType: 'MORNING' | 'EVENING' | 'NIGHT';
  startTime: string;
  endTime: string;
  station: string;
}

interface AttendanceRow {
  id: number;
  employeeName: string;
  workDate: string;
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
}

interface LeaveReq {
  id: number;
  employeeId: number;
  employeeName: string;
  department: string;
  leaveType: 'CASUAL' | 'SICK' | 'EARNED';
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface Payslip {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  designation: string;
  baseSalaryPaise: number;
  overtimePaise: number;
  deductionsPaise: number;
  netPayPaise: number;
}

interface PayrollRun {
  id: number;
  payMonth: string;
  totalGrossPaise: number;
  totalDeductionsPaise: number;
  totalNetPaise: number;
  status: string;
  processedAt: string;
  payslips: Payslip[];
}

export function HrPayrollPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isManagerOrOwner = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const [tab, setTab] = useState<'EMPLOYEES' | 'SHIFTS' | 'LEAVES' | 'PAYROLL'>('EMPLOYEES');
  const [selectedSlip, setSelectedSlip] = useState<{ run: PayrollRun; slip: Payslip } | null>(null);

  const { data, refetch } = useQuery<{
    employees: Employee[];
    shifts: Shift[];
    attendance: AttendanceRow[];
    leaveRequests: LeaveReq[];
    payrollRuns: PayrollRun[];
  }>({
    queryKey: ['hr-overview'],
    queryFn: () => apiFetch('/hr/overview'),
  });

  // Assign Shift form
  const [shiftEmpId, setShiftEmpId] = useState<number>(1);
  const [shiftDate, setShiftDate] = useState(getTodayIstStr());
  const [shiftType, setShiftType] = useState<'MORNING' | 'EVENING' | 'NIGHT'>('MORNING');
  const [shiftStart, setShiftStart] = useState('06:00');
  const [shiftEnd, setShiftEnd] = useState('14:00');
  const [shiftStation, setShiftStation] = useState('Front Desk');

  // Leave request form
  const [leaveEmpId, setLeaveEmpId] = useState<number>(1);
  const [leaveType, setLeaveType] = useState<'CASUAL' | 'SICK' | 'EARNED'>('CASUAL');
  const [leaveStart, setLeaveStart] = useState(getTodayIstStr());
  const [leaveEnd, setLeaveEnd] = useState(getTodayIstStr());
  const [leaveDays, setLeaveDays] = useState(1);
  const [leaveReason, setLeaveReason] = useState('');

  // Payroll run month
  const [payMonth, setPayMonth] = useState(getTodayIstStr().slice(0, 7));

  const handleAssignShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/hr/shifts', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: shiftEmpId,
          shiftDate,
          shiftType,
          startTime: shiftStart,
          endTime: shiftEnd,
          station: shiftStation,
        }),
      });
      toast('Shift assigned!', 'success');
      refetch();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to assign shift.', 'error');
    }
  };

  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/hr/leaves', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: leaveEmpId,
          leaveType,
          startDate: leaveStart,
          endDate: leaveEnd,
          daysCount: leaveDays,
          reason: leaveReason,
        }),
      });
      toast('Leave request submitted!', 'success');
      setLeaveReason('');
      refetch();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to submit leave request.', 'error');
    }
  };

  const handleReviewLeave = async (id: number, decision: 'APPROVED' | 'REJECTED') => {
    try {
      await apiFetch(`/hr/leaves/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ decision }),
      });
      toast(`Leave request ${decision.toLowerCase()}`, 'success');
      refetch();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Review failed.', 'error');
    }
  };

  const handleRunPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/hr/payroll/run', {
        method: 'POST',
        body: JSON.stringify({ payMonth }),
      });
      toast(`Payroll processed for ${payMonth} & posted to Expenses!`, 'success');
      refetch();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Payroll run failed.', 'error');
    }
  };

  const employees = data?.employees || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold">HR, Shifts, Leaves &amp; Payroll</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Staff directory, shift roster, attendance logs, leave approvals, and monthly payroll payslips.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl overflow-x-auto">
          {[
            { id: 'EMPLOYEES', label: 'Staff & Attendance' },
            { id: 'SHIFTS', label: 'Shifts' },
            { id: 'LEAVES', label: 'Leave Requests' },
            { id: 'PAYROLL', label: 'Payroll & Payslips' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap ${
                tab === t.id ? 'bg-white dark:bg-lime-400 text-slate-950 shadow-sm' : 'text-slate-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'EMPLOYEES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 font-display font-semibold">
              Employees ({employees.length})
            </div>
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-500">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Name &amp; Designation</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3 text-right">Monthly Salary</th>
                  <th className="px-4 py-3 text-right">Leave Bal.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                {employees.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 font-mono">{e.employeeCode}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-sm">{e.fullName}</div>
                      <div className="text-slate-500">{e.designation} · {e.phone}</div>
                    </td>
                    <td className="px-4 py-3">{e.department}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatINR(e.monthlySalaryPaise)}</td>
                    <td className="px-4 py-3 text-right font-mono">{e.leaveBalanceDays} d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 font-display font-semibold">
              Recent Attendance Log
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[480px] overflow-y-auto text-xs">
              {(data?.attendance || []).slice(0, 20).map((a) => (
                <div key={a.id} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{a.employeeName}</div>
                    <div className="text-slate-500 font-mono">
                      {formatIstDate(a.workDate)} · {a.checkInTime || '--'}–{a.checkOutTime || '--'}
                    </div>
                  </div>
                  <span className={a.status === 'PRESENT' ? 'text-emerald-500 font-semibold' : 'text-amber-500 font-semibold'}>
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'SHIFTS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 font-display font-semibold">
              Assigned Staff Shifts
            </div>
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Staff Member</th>
                  <th className="px-4 py-3">Shift</th>
                  <th className="px-4 py-3">Hours</th>
                  <th className="px-4 py-3">Station</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                {(data?.shifts || []).slice(0, 30).map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-mono">{formatIstDate(s.shiftDate)}</td>
                    <td className="px-4 py-3 font-semibold">{s.employeeName}</td>
                    <td className="px-4 py-3">{s.shiftType}</td>
                    <td className="px-4 py-3 font-mono">{s.startTime}–{s.endTime}</td>
                    <td className="px-4 py-3">{s.station}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isManagerOrOwner && (
            <form
              onSubmit={handleAssignShift}
              className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 self-start"
            >
              <div className="flex items-center gap-2 font-display font-semibold">
                <CalendarClock className="w-4 h-4 text-lime-500" /> Assign Shift
              </div>
              <select
                value={shiftEmpId}
                onChange={(e) => setShiftEmpId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName} ({e.department})</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={shiftDate}
                  onChange={(e) => setShiftDate(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
                <select
                  value={shiftType}
                  onChange={(e) => setShiftType(e.target.value as typeof shiftType)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                >
                  <option value="MORNING">Morning</option>
                  <option value="EVENING">Evening</option>
                  <option value="NIGHT">Night</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="time"
                  value={shiftStart}
                  onChange={(e) => setShiftStart(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
                <input
                  type="time"
                  value={shiftEnd}
                  onChange={(e) => setShiftEnd(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
              </div>
              <input
                required
                value={shiftStation}
                onChange={(e) => setShiftStation(e.target.value)}
                placeholder="Station (e.g. Bar Counter)"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
              <button type="submit" className="w-full py-2.5 rounded-xl bg-lime-400 text-slate-950 text-xs font-semibold">
                Save Shift
              </button>
            </form>
          )}
        </div>
      )}

      {tab === 'LEAVES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 font-display font-semibold">
              Leave Requests
            </div>
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-500">
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Dates &amp; Type</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Status</th>
                  {isManagerOrOwner && <th className="px-4 py-3 text-right">Approval</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(data?.leaveRequests || []).map((lr) => (
                  <tr key={lr.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{lr.employeeName}</div>
                      <div className="text-slate-500">{lr.department}</div>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {formatIstDate(lr.startDate)} – {formatIstDate(lr.endDate)} ({lr.daysCount}d · {lr.leaveType})
                    </td>
                    <td className="px-4 py-3 max-w-xs">{lr.reason}</td>
                    <td className="px-4 py-3 font-semibold">
                      <span
                        className={
                          lr.status === 'APPROVED'
                            ? 'text-emerald-500'
                            : lr.status === 'REJECTED'
                              ? 'text-rose-500'
                              : 'text-amber-500'
                        }
                      >
                        {lr.status}
                      </span>
                    </td>
                    {isManagerOrOwner && (
                      <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                        {lr.status === 'PENDING' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleReviewLeave(lr.id, 'APPROVED')}
                              className="px-2.5 py-1 rounded bg-lime-400 text-slate-950 font-semibold"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewLeave(lr.id, 'REJECTED')}
                              className="px-2.5 py-1 rounded border border-rose-500/40 text-rose-500 font-semibold"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={handleCreateLeave}
            className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 self-start"
          >
            <h3 className="font-display font-semibold">Apply for Leave</h3>
            <select
              value={leaveEmpId}
              onChange={(e) => setLeaveEmpId(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.fullName} (Bal: {e.leaveBalanceDays}d)</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value as typeof leaveType)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
              >
                <option value="CASUAL">Casual</option>
                <option value="SICK">Sick</option>
                <option value="EARNED">Earned</option>
              </select>
              <input
                type="number"
                min={1}
                max={30}
                value={leaveDays}
                onChange={(e) => setLeaveDays(Number(e.target.value))}
                placeholder="Days"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={leaveStart}
                onChange={(e) => setLeaveStart(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
              <input
                type="date"
                value={leaveEnd}
                onChange={(e) => setLeaveEnd(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
              />
            </div>
            <textarea
              required
              rows={2}
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              placeholder="Reason for leave..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-lime-400 text-slate-950 text-xs font-semibold">
              Submit Leave Request
            </button>
          </form>
        </div>
      )}

      {tab === 'PAYROLL' && (
        <div className="space-y-6">
          {isManagerOrOwner && (
            <form
              onSubmit={handleRunPayroll}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 no-print"
            >
              <div>
                <h2 className="font-display font-semibold text-base">Run Monthly Payroll</h2>
                <p className="text-xs text-slate-500">
                  Computes base pay minus 8% statutory deductions, issues payslips, and posts net payout to the Expense Ledger.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={payMonth}
                  onChange={(e) => setPayMonth(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs font-mono"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-lime-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-lime-300"
                >
                  <Check className="w-4 h-4" /> Process Payroll
                </button>
              </div>
            </form>
          )}

          {(data?.payrollRuns || []).map((run) => (
            <div key={run.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-display font-bold text-lg">Payroll Run · {run.payMonth}</div>
                  <div className="text-xs text-slate-500">
                    Processed {formatIstDate(run.processedAt)} · Status: {run.status}
                  </div>
                </div>
                <div className="flex gap-6 text-xs tabular-nums">
                  <div>
                    <div className="text-slate-500">Gross</div>
                    <div className="font-mono font-bold">{formatINR(run.totalGrossPaise)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Deductions</div>
                    <div className="font-mono font-bold text-rose-500">-{formatINR(run.totalDeductionsPaise)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Net Paid</div>
                    <div className="font-mono font-bold text-lime-600 dark:text-lime-400">{formatINR(run.totalNetPaise)}</div>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-500">
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3 text-right">Base Salary</th>
                      <th className="px-4 py-3 text-right">Deductions</th>
                      <th className="px-4 py-3 text-right">Net Pay</th>
                      <th className="px-4 py-3 text-right">Payslip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                    {run.payslips.map((slip) => (
                      <tr key={slip.id}>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{slip.employeeName}</div>
                          <div className="text-slate-500">{slip.employeeCode} · {slip.designation}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{formatINR(slip.baseSalaryPaise)}</td>
                        <td className="px-4 py-3 text-right font-mono text-rose-500">-{formatINR(slip.deductionsPaise)}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold">{formatINR(slip.netPayPaise)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedSlip({ run, slip })}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold hover:border-lime-400"
                          >
                            View Slip
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Printable Payslip Modal */}
      {selectedSlip && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white text-slate-900 rounded-2xl p-8 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="font-display text-xl font-bold">Alpha Sports Club — Salary Payslip</h3>
                <div className="text-xs text-slate-500">Pay Period: {selectedSlip.run.payMonth}</div>
              </div>
              <button type="button" onClick={() => setSelectedSlip(null)} className="no-print text-slate-400 hover:text-slate-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-slate-500">Employee Name</div>
                <div className="font-semibold">{selectedSlip.slip.employeeName}</div>
              </div>
              <div>
                <div className="text-slate-500">Employee Code</div>
                <div className="font-mono font-semibold">{selectedSlip.slip.employeeCode}</div>
              </div>
              <div>
                <div className="text-slate-500">Designation</div>
                <div className="font-semibold">{selectedSlip.slip.designation}</div>
              </div>
              <div>
                <div className="text-slate-500">Payment Status</div>
                <div className="font-semibold text-emerald-600">{selectedSlip.run.status}</div>
              </div>
            </div>
            <div className="border-t border-b border-slate-200 py-4 space-y-2 text-sm tabular-nums">
              <div className="flex justify-between">
                <span>Basic Salary</span>
                <span className="font-mono">{formatINR(selectedSlip.slip.baseSalaryPaise)}</span>
              </div>
              <div className="flex justify-between">
                <span>Overtime</span>
                <span className="font-mono">{formatINR(selectedSlip.slip.overtimePaise)}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>PF &amp; TDS Deductions (8%)</span>
                <span className="font-mono">-{formatINR(selectedSlip.slip.deductionsPaise)}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-2 border-t border-slate-200">
                <span>Net Pay Disbursed</span>
                <span className="font-mono">{formatINR(selectedSlip.slip.netPayPaise)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" /> Print Payslip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
