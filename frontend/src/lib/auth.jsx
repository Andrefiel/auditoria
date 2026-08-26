import { createContext, useContext, useState, useCallback } from 'react';
import { api, setSession, clearSession, getUser } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getUser());

  const login = useCallback(async (username, password, website = '') => {
    const { token, user: u } = await api.login(username, password, website);
    setSession(token, u);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
