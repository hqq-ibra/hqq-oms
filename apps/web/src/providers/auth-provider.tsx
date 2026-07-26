'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'HQQ_ACCESS_TOKEN',
  REFRESH_TOKEN: 'HQQ_REFRESH_TOKEN',
  USER: 'HQQ_USER',
} as const;

export interface User {
  id: string;
  email: string;
  name?: string;
  /** Set by the API login/refresh response. ADMIN bypasses per-permission checks. */
  role?: string;
  /** Flattened to permission keys by the API (auth.service maps permissionKey). */
  permissions?: string[];
  [key: string]: unknown;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  getToken: () => Promise<string | null>;
  mounted: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string, bufferMs = 60 * 1000): boolean {
  const exp = parseJwtExp(token);
  if (!exp) return true;
  return Date.now() >= exp - bufferMs;
}

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  user?: User;
}> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
  try {
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || 'Token refresh failed');
    }
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function loadFromStorage(): AuthState {
  if (typeof window === 'undefined') {
    return {
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    };
  }
  try {
    const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    const userStr = localStorage.getItem(STORAGE_KEYS.USER);
    let user: User | null = null;
    if (userStr) {
      try {
        user = JSON.parse(userStr) as User;
      } catch {
        // Invalid JSON in storage - ignore
      }
    }
    return {
      user,
      accessToken,
      refreshToken,
      isAuthenticated: !!accessToken,
    };
  } catch {
    return {
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    };
  }
}

function saveToStorage(state: Partial<AuthState>) {
  if (typeof window === 'undefined') return;
  if (state.accessToken != null)
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, state.accessToken);
  if (state.refreshToken != null)
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, state.refreshToken);
  if (state.user != null)
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(state.user));
}

function clearStorage() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
}

const INITIAL_STATE: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setState(loadFromStorage());
    setMounted(true);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Login failed');
    }
    const data = await res.json();
    const { accessToken, refreshToken, user } = data;
    const newState: AuthState = {
      user: user ?? null,
      accessToken: accessToken ?? null,
      refreshToken: refreshToken ?? null,
      isAuthenticated: !!accessToken,
    };
    setState(newState);
    saveToStorage(newState);
  }, []);

  const logout = useCallback(() => {
    setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
    clearStorage();
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    const { accessToken, refreshToken } = loadFromStorage();
    if (!accessToken && !refreshToken) return null;

    if (accessToken && !isTokenExpired(accessToken)) return accessToken;

    if (!refreshToken) {
      logout();
      return null;
    }

    try {
      const data = await refreshAccessToken(refreshToken);
      const newState: AuthState = {
        user: data.user ?? state.user,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken ?? refreshToken,
        isAuthenticated: true,
      };
      setState(newState);
      saveToStorage(newState);
      return data.accessToken;
    } catch {
      logout();
      return null;
    }
  }, [logout, state.user]);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    getToken,
    mounted,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
