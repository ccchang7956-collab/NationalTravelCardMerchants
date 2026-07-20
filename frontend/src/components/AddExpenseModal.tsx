'use client';

import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '@/utils/api';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMerchantId?: number | null;
  defaultMerchantName?: string;
  onSuccess?: () => void;
}

export default function AddExpenseModal({
  isOpen,
  onClose,
  defaultMerchantId = null,
  defaultMerchantName = '',
  onSuccess,
}: AddExpenseModalProps) {
  const getTodayString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [merchantName, setMerchantName] = useState(defaultMerchantName);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<'觀光旅遊' | '自行運用'>('觀光旅遊');
  const [expenseDate, setExpenseDate] = useState(getTodayString());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMerchantName(defaultMerchantName);
      setExpenseDate(getTodayString());
      setError('');
    }
  }, [isOpen, defaultMerchantName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const parsedAmount = parseInt(amount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('請輸入有效的消費金額（需大於 0）');
      return;
    }

    if (!merchantName.trim()) {
      setError('請輸入商店名稱');
      return;
    }

    setLoading(true);

    try {
      const res = await fetchWithAuth('/api/assistant/expenses', {
        method: 'POST',
        body: JSON.stringify({
          merchant_id: defaultMerchantId,
          merchant_name: merchantName.trim(),
          amount: parsedAmount,
          category,
          expense_date: expenseDate,
          note: note.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || '新增記帳失敗');
      }

      setAmount('');
      setNote('');
      if (onSuccess) onSuccess();
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

        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <span>➕</span> 新增國旅卡刷卡記帳
        </h3>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">商店名稱</label>
            <input
              type="text"
              required
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              placeholder="例如：臺北四季飯店"
              className="w-full px-3.5 py-2.5 rounded-xl bg-muted-bg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm transition-all text-foreground"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">消費金額 (TWD)</label>
              <input
                type="number"
                required
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="2000"
                className="w-full px-3.5 py-2.5 rounded-xl bg-muted-bg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm transition-all text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">補助額度類別</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as '觀光旅遊' | '自行運用')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-muted-bg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm transition-all text-foreground"
              >
                <option value="觀光旅遊">觀光旅遊 (8,000)</option>
                <option value="自行運用">自行運用 (8,000)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">刷卡日期</label>
            <input
              type="date"
              required
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-muted-bg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm transition-all text-foreground"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">備註 (可選)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：住宿補助費"
              className="w-full px-3.5 py-2.5 rounded-xl bg-muted-bg border border-border focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm transition-all text-foreground"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent/90 focus:ring-4 focus:ring-accent/20 transition-all disabled:opacity-50"
          >
            {loading ? '儲存中...' : '儲存記帳'}
          </button>
        </form>
      </div>
    </div>
  );
}
