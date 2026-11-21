import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, setAuthToken } from '../lib/api';

export type UserRole = 'OWNER' | 'MANAGER' | 'FRONT_DESK' | 'BAR_STAFF' | 'SHOP_STAFF' | 'MEMBER';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  memberId?: number | null;
  memberCode?: string | null;
}

export type EmailVerificationChallenge = {
  requiresEmailVerification: true;
  email: string;
};

export type LoginResult =
  | EmailVerificationChallenge
  | { requiresEmailVerification: false; user: AuthUser };

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyEmailOtp: (email: string, code: string) => Promise<AuthUser>;
  register: (payload: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    dob: string;
    planCode: 'GOLD' | 'SILVER' | 'JUNIOR';
    billingCycle: 'MONTHLY' | 'ANNUAL';
    emergencyContactName: string;
    emergencyContactPhone: string;
    paymentMethod: 'CARD' | 'UPI' | 'ONLINE';
  }) => Promise<EmailVerificationChallenge>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {
    throw new Error('AuthProvider missing');
  },
  verifyEmailOtp: async () => {
    throw new Error('AuthProvider missing');
  },
  register: async () => {
    throw new Error('AuthProvider missing');
  },
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiFetch<{ user: AuthUser }>('/auth/me');
      setUser(res.user);
    } catch {
      setUser(null);
      setAuthToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const res = await apiFetch<
      | EmailVerificationChallenge
      | { requiresEmailVerification: false; token: string; user: AuthUser }
    >('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.requiresEmailVerification) return res;
    setAuthToken(res.token);
    setUser(res.user);
    const loginResult: LoginResult = {
      requiresEmailVerification: false,
      user: res.user,
    };
    return loginResult;
  };

  const verifyEmailOtp = async (email: string, code: string) => {
    const res = await apiFetch<{ token: string; user: AuthUser }>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
    setAuthToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const register = async (payload: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    dob: string;
    planCode: 'GOLD' | 'SILVER' | 'JUNIOR';
    billingCycle: 'MONTHLY' | 'ANNUAL';
    emergencyContactName: string;
    emergencyContactPhone: string;
    paymentMethod: 'CARD' | 'UPI' | 'ONLINE';
  }): Promise<EmailVerificationChallenge> => {
    return apiFetch<EmailVerificationChallenge>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, verifyEmailOtp, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
