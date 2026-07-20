'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchWithAuth } from '@/utils/api';

export interface User {
  id: number;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  favoriteIds: number[];
  refreshFavorites: () => Promise<void>;
  toggleFavorite: (merchantId: number) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  login: () => {},
  logout: () => {},
  favoriteIds: [],
  refreshFavorites: async () => {},
  toggleFavorite: async () => false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);

  const refreshFavorites = async () => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('ntc_token') : null;
    if (!t) {
      setFavoriteIds([]);
      return;
    }
    try {
      const res = await fetchWithAuth('/api/assistant/favorites/ids');
      if (res.ok) {
        const data = await res.json();
        setFavoriteIds(data);
      }
    } catch {
      // ignore error
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('ntc_token');
    if (storedToken) {
      fetchWithAuth('/api/auth/me')
        .then((res) => (res.ok ? res.json() : null))
        .then((userData) => {
          if (userData) {
            setToken(storedToken);
            setUser(userData);
            refreshFavorites();
          } else {
            localStorage.removeItem('ntc_token');
            setToken(null);
          }
        })
        .catch(() => {
          localStorage.removeItem('ntc_token');
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('ntc_token', newToken);
    setToken(newToken);
    setUser(newUser);
    refreshFavorites();
  };

  const logout = () => {
    localStorage.removeItem('ntc_token');
    setToken(null);
    setUser(null);
    setFavoriteIds([]);
  };

  const toggleFavorite = async (merchantId: number): Promise<boolean> => {
    if (!user) return false;
    const isFav = favoriteIds.includes(merchantId);
    const method = isFav ? 'DELETE' : 'POST';
    const res = await fetchWithAuth(`/api/assistant/favorites/${merchantId}`, { method });
    if (res.ok) {
      if (isFav) {
        setFavoriteIds((prev) => prev.filter((id) => id !== merchantId));
      } else {
        setFavoriteIds((prev) => [...prev, merchantId]);
      }
      return true;
    }
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        favoriteIds,
        refreshFavorites,
        toggleFavorite,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
