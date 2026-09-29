import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const result = await api('/auth/me');
      setUser(result.user);
      return result.user;
    } catch (error) {
      // logout เฉพาะ 401 (token หมดอายุ / ไม่มี session)
      // กรณี 500 หรือ network error → ไม่ logout เพื่อไม่ให้ user หลุดโดยไม่จำเป็น
      if (error.status === 401) setUser(null);
      return null;
    }
  };

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, []);

  const login = async (credentials) => {
    const result = await api('/auth/login', { method: 'POST', body: credentials });
    setUser(result.user);
    return result.user;
  };

  const register = async (details) => {
    const result = await api('/auth/register', { method: 'POST', body: details });
    setUser(result.user);
    return result.user;
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  };

  const [authModal, setAuthModal] = useState(null); // 'login' | 'register' | null

  const openAuthModal = (view) => setAuthModal(view);
  const closeAuthModal = () => setAuthModal(null);

  return (
    <AuthContext.Provider value={{
      user, loading, isAuthenticated: Boolean(user),
      login, register, logout, refreshUser,
      authModal, openAuthModal, closeAuthModal
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
