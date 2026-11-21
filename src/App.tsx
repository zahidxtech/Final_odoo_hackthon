import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth, type UserRole } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';

import { PublicLayout } from './components/PublicLayout';
import { MemberLayout } from './components/MemberLayout';
import { StaffLayout } from './components/StaffLayout';

import { HomePage } from './pages/public/HomePage';
import { PlansPage } from './pages/public/PlansPage';
import { AvailabilityPage } from './pages/public/AvailabilityPage';
import { ShopPage } from './pages/public/ShopPage';
import { TrialEnquiryPage } from './pages/public/TrialEnquiryPage';
import { AuthPage } from './pages/public/AuthPage';

import { MemberDashboardPage } from './pages/member/MemberDashboardPage';
import { MemberBookingsPage } from './pages/member/MemberBookingsPage';
import { MemberCardPage } from './pages/member/MemberCardPage';
import { MemberShopPage } from './pages/member/MemberShopPage';
import { MemberHistoryPage } from './pages/member/MemberHistoryPage';

import { FrontDeskPage } from './pages/staff/FrontDeskPage';
import { BarKdsPage } from './pages/staff/BarKdsPage';
import { ShopInventoryPage } from './pages/staff/ShopInventoryPage';
import { CrmPipelinePage } from './pages/staff/CrmPipelinePage';
import { HrPayrollPage } from './pages/staff/HrPayrollPage';
import { OwnerDashboardPage } from './pages/staff/OwnerDashboardPage';
import { FinanceLedgerPage } from './pages/staff/FinanceLedgerPage';
import { SharedReportPage } from './pages/staff/SharedReportPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});

const STAFF_ROLES: UserRole[] = ['OWNER', 'MANAGER', 'FRONT_DESK', 'BAR_STAFF', 'SHOP_STAFF'];

function getDefaultHomeForRole(role: UserRole): string {
  switch (role) {
    case 'OWNER':
    case 'MANAGER':
      return '/staff/owner';
    case 'BAR_STAFF':
      return '/staff/bar';
    case 'SHOP_STAFF':
      return '/staff/shop';
    case 'FRONT_DESK':
      return '/staff';
    case 'MEMBER':
    default:
      return '/member';
  }
}

function RequireRoles({ allowed, children }: { allowed: UserRole[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#070E1A] text-sm text-slate-500">
        Verifying session...
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!allowed.includes(user.role)) {
    return <Navigate to={getDefaultHomeForRole(user.role)} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <CartProvider>
              <BrowserRouter>
                <Routes>
                  {/* Public Website */}
                  <Route element={<PublicLayout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/plans" element={<PlansPage />} />
                    <Route path="/availability" element={<AvailabilityPage />} />
                    <Route path="/shop" element={<ShopPage />} />
                    <Route path="/enquiry" element={<TrialEnquiryPage />} />
                    <Route path="/login" element={<AuthPage />} />
                  </Route>

                  {/* Standalone Shareable Read-Only Executive Report */}
                  <Route path="/report/:token" element={<SharedReportPage />} />

                  {/* Member Portal */}
                  <Route
                    path="/member"
                    element={
                      <RequireRoles allowed={['MEMBER', ...STAFF_ROLES]}>
                        <MemberLayout />
                      </RequireRoles>
                    }
                  >
                    <Route index element={<MemberDashboardPage />} />
                    <Route path="bookings" element={<MemberBookingsPage />} />
                    <Route path="card" element={<MemberCardPage />} />
                    <Route path="shop" element={<MemberShopPage />} />
                    <Route path="history" element={<MemberHistoryPage />} />
                  </Route>

                  {/* Staff Back-Office & Owner Executive Console */}
                  <Route
                    path="/staff"
                    element={
                      <RequireRoles allowed={STAFF_ROLES}>
                        <StaffLayout />
                      </RequireRoles>
                    }
                  >
                    <Route
                      index
                      element={
                        <RequireRoles allowed={['OWNER', 'MANAGER', 'FRONT_DESK']}>
                          <FrontDeskPage />
                        </RequireRoles>
                      }
                    />
                    <Route
                      path="bar"
                      element={
                        <RequireRoles allowed={['OWNER', 'MANAGER', 'BAR_STAFF', 'FRONT_DESK']}>
                          <BarKdsPage />
                        </RequireRoles>
                      }
                    />
                    <Route
                      path="shop"
                      element={
                        <RequireRoles allowed={['OWNER', 'MANAGER', 'SHOP_STAFF', 'FRONT_DESK']}>
                          <ShopInventoryPage />
                        </RequireRoles>
                      }
                    />
                    <Route
                      path="crm"
                      element={
                        <RequireRoles allowed={['OWNER', 'MANAGER', 'FRONT_DESK']}>
                          <CrmPipelinePage />
                        </RequireRoles>
                      }
                    />
                    <Route
                      path="hr"
                      element={
                        <RequireRoles allowed={STAFF_ROLES}>
                          <HrPayrollPage />
                        </RequireRoles>
                      }
                    />
                    <Route
                      path="owner"
                      element={
                        <RequireRoles allowed={['OWNER', 'MANAGER']}>
                          <OwnerDashboardPage />
                        </RequireRoles>
                      }
                    />
                    <Route
                      path="finance"
                      element={
                        <RequireRoles allowed={['OWNER', 'MANAGER']}>
                          <FinanceLedgerPage />
                        </RequireRoles>
                      }
                    />
                  </Route>

                  {/* Catch-all */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </BrowserRouter>
            </CartProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
