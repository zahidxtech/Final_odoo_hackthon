import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, type UserRole } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ApiError } from '../../lib/api';
import { calculateAgeFromDob } from '../../lib/format';

export function AuthPage() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login';
  const initialPlan = (searchParams.get('plan') as 'GOLD' | 'SILVER' | 'JUNIOR') || 'GOLD';

  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Registration state
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [dob, setDob] = useState('1994-06-15');
  const [planCode, setPlanCode] = useState<'GOLD' | 'SILVER' | 'JUNIOR'>(initialPlan);
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('ANNUAL');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'UPI' | 'ONLINE'>('UPI');

  const { user, login, verifyEmailOtp, register } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const age = calculateAgeFromDob(dob);
  const isUnder18 = age !== null && age < 18;

  useEffect(() => {
    if (isUnder18 && planCode !== 'JUNIOR') {
      setPlanCode('JUNIOR');
    }
  }, [isUnder18, planCode]);

  const routeByRole = (role: UserRole) => {
    if (role === 'MEMBER') return '/member';
    if (role === 'BAR_STAFF') return '/staff/bar';
    if (role === 'SHOP_STAFF') return '/staff/shop';
    if (role === 'OWNER') return '/staff/owner';
    return '/staff';
  };

  useEffect(() => {
    if (user) {
      navigate(routeByRole(user.role), { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.requiresEmailVerification) {
        setVerificationEmail(result.email);
        setOtpCode('');
        toast('Check your email for a verification code.', 'info');
      } else {
        toast(`Signed in as ${result.user.fullName}`, 'success');
        navigate(routeByRole(result.user.role));
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Login failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationEmail) return;
    setSubmitting(true);
    try {
      const loggedIn = await verifyEmailOtp(verificationEmail, otpCode);
      toast(`Signed in as ${loggedIn.fullName}`, 'success');
      navigate(routeByRole(loggedIn.role));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Email verification failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const challenge = await register({
        fullName,
        email: regEmail,
        phone,
        password: regPassword,
        dob,
        planCode: isUnder18 ? 'JUNIOR' : planCode,
        billingCycle,
        emergencyContactName,
        emergencyContactPhone,
        paymentMethod,
      });
      setEmail(challenge.email);
      setPassword(regPassword);
      setVerificationEmail(challenge.email);
      setOtpCode('');
      toast('Check your email to verify your new account.', 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Registration failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 lg:p-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {mode === 'login' ? 'Sign in to Alpha Sports Club' : 'Join Alpha Sports Club'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Members access court booking &amp; QR pass; staff access operations console.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
            <button
              type="button"
              disabled={Boolean(verificationEmail)}
              onClick={() => setMode('login')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold ${
                mode === 'login' ? 'bg-white dark:bg-lime-400 text-slate-950 shadow-sm' : 'text-slate-500'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              disabled={Boolean(verificationEmail)}
              onClick={() => setMode('register')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold ${
                mode === 'register' ? 'bg-white dark:bg-lime-400 text-slate-950 shadow-sm' : 'text-slate-500'
              }`}
            >
              New Member
            </button>
          </div>
        </div>

        {verificationEmail ? (
          <div className="max-w-lg mx-auto space-y-5">
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Verify your email
              </h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Enter the six-digit code sent to <strong>{verificationEmail}</strong>. Check your spam folder too.
              </p>
            </div>
            <form onSubmit={handleEmailVerification} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Verification code
                </label>
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tracking-[0.3em]"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-lime-400 text-slate-950 font-semibold text-sm hover:bg-lime-300 disabled:opacity-50"
              >
                {submitting ? 'Verifying...' : 'Verify email and continue'}
              </button>
            </form>
            <p className="text-xs text-slate-500">
              Didn’t receive a code? Return to sign in and submit your password again to request another.
            </p>
            <button
              type="button"
              onClick={() => {
                setVerificationEmail(null);
                setOtpCode('');
                setMode('login');
              }}
              className="text-xs font-medium text-slate-500 hover:text-lime-600"
            >
              Back to sign in
            </button>
          </div>
        ) : mode === 'login' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <form onSubmit={handleLogin} className="lg:col-span-7 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Email</label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Password</label>
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-lime-400 text-slate-950 font-semibold text-sm hover:bg-lime-300 disabled:opacity-50"
              >
                {submitting ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <div className="text-xs font-semibold text-slate-900 dark:text-white">Email verification</div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Every sign-in and new registration requires a one-time code sent to the email on the account.
                Use an address whose inbox you can access; sample demo accounts may not receive mail.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Full Name</label>
                <input
                  required
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date of Birth</label>
                <input
                  required
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
                {isUnder18 && (
                  <p className="text-[11px] text-amber-500 mt-1">
                    Under 18 detected ({age} yrs) — Junior Academy plan automatically enforced.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Email</label>
                <input
                  required
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phone</label>
                <input
                  required
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Password</label>
                <input
                  required
                  minLength={6}
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Membership Plan</label>
                <select
                  disabled={isUnder18}
                  value={isUnder18 ? 'JUNIOR' : planCode}
                  onChange={(e) => setPlanCode(e.target.value as 'GOLD' | 'SILVER' | 'JUNIOR')}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm disabled:opacity-60"
                >
                  <option value="GOLD">Gold Premier (₹4,500/mo · ₹45,000/yr)</option>
                  <option value="SILVER">Silver Club (₹2,500/mo · ₹25,000/yr)</option>
                  <option value="JUNIOR">Junior Academy (₹1,500/mo · ₹15,000/yr)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Emergency Contact Name</label>
                <input
                  required
                  type="text"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Emergency Contact Phone</label>
                <input
                  required
                  type="tel"
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Billing Cycle</label>
                <select
                  value={billingCycle}
                  onChange={(e) => setBillingCycle(e.target.value as 'MONTHLY' | 'ANNUAL')}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="ANNUAL">Annual</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'CARD' | 'UPI' | 'ONLINE')}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="UPI">UPI</option>
                  <option value="CARD">Card</option>
                  <option value="ONLINE">NetBanking / Online</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-lime-400 text-slate-950 font-semibold text-sm hover:bg-lime-300 disabled:opacity-50"
            >
              {submitting ? 'Creating Membership...' : 'Complete Registration & Pay'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
