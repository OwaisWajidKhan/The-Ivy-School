import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('access_token')));

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('access_token', data.data.accessToken);
    localStorage.setItem('refresh_token', data.data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.data.user));
    setUser(data.data.user);
    return data.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch { /* ignore */ }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setUser(null);
    window.location.href = '/login';
  }, []);

  const refreshMe = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    localStorage.setItem('user', JSON.stringify(data.data.user));
    setUser(data.data.user);
    return data.data.user;
  }, []);

  useEffect(() => {
    if (loading) {
      api.get('/auth/me')
        .then(({ data }) => {
          localStorage.setItem('user', JSON.stringify(data.data.user));
          setUser(data.data.user);
        })
        .catch(() => {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
        })
        .finally(() => setLoading(false));
    }
  }, [loading]);

  const hasPermission = useCallback((perm) => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    return (user.permissions || []).includes(perm);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, refreshMe, loading, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
