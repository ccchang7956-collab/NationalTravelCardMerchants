'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchWithAuth } from '@/utils/api';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'login' | 'register';
}

export default function AuthModal({ isOpen, onClose, initialTab = 'login' }: AuthModalProps) {
  const { login } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload = tab === 'login' ? { email, password } : { email, password, name };

    try {
      const res = await fetchWithAuth(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || '操作失敗');
      }

      login(data.access_token, data.user);
      onClose();
    } catch (err: any) {
      setError(err.message || '連線錯誤');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-card border border-border/80 rounded-2xl p-6 w-full max-w-md shadow-xl relative animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-muted-bg transition-colors"
          aria-label="關閉"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>

        {/* Tab switch */}
        <div className="flex border-b border-border mb-6">
          <button
            type="button"
            className={`flex-1 py-3 text-center text-sm font-medium transition-colors border-b-2 ${
              tab === 'login'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
            onClick={() => {
              setTab('login');
              setError('');
            }}
          >
            登入
          </button>
          <button
            type="button"
            className={`flex-1 py-3 text-center text-sm font-medium transition-colors border-b-2 ${
              tab === 'register'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
            onClick={() => {
              setTab('register');
              setError('');
            }}
          >
            註冊
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'register' && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1">姓名 / 稱呼</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：王小明"
                className="w-full px-3.5 py-2.5 rounded-xl bg-muted-bg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm transition-all text-foreground"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted mb-1">電子郵件</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-muted-bg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm transition-all text-foreground"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">密碼</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 個字元"
              className="w-full px-3.5 py-2.5 rounded-xl bg-muted-bg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm transition-all text-foreground"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 focus:ring-4 focus:ring-accent/20 transition-all disabled:opacity-50"
          >
            {loading ? '處理中...' : tab === 'login' ? '登入助手' : '註冊帳號'}
          </button>
        </form>
      </div>
    </div>
  );
}
