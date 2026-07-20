'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { HeartIcon as HeartOutline } from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';
import { PlusIcon } from '@heroicons/react/24/outline';
import AuthModal from '@/components/AuthModal';
import AddExpenseModal from '@/components/AddExpenseModal';

interface MerchantActionsProps {
  merchant: {
    id: number;
    name: string;
  };
  variant?: 'card' | 'detail';
}

export default function MerchantActions({ merchant, variant = 'card' }: MerchantActionsProps) {
  const { user, favoriteIds, toggleFavorite } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [favLoading, setFavLoading] = useState(false);

  const isFav = favoriteIds.includes(merchant.id);

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      setIsAuthOpen(true);
      return;
    }
    setFavLoading(true);
    try {
      await toggleFavorite(merchant.id);
    } finally {
      setFavLoading(false);
    }
  };

  const handleExpenseClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      setIsAuthOpen(true);
      return;
    }
    setIsExpenseOpen(true);
  };

  if (variant === 'detail') {
    return (
      <>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleFavoriteClick}
            disabled={favLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 cursor-pointer ${
              isFav
                ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/20'
                : 'bg-card border-border/80 text-muted hover:text-foreground hover:bg-muted-bg'
            }`}
          >
            {isFav ? (
              <HeartSolid className="w-5 h-5 text-red-500 animate-in zoom-in-75 duration-150" />
            ) : (
              <HeartOutline className="w-5 h-5" />
            )}
            <span>{isFav ? '已收藏' : '加入收藏'}</span>
          </button>

          <button
            type="button"
            onClick={handleExpenseClick}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-all duration-200 shadow-xs cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            <span>➕ 記帳</span>
          </button>
        </div>

        <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
        <AddExpenseModal
          isOpen={isExpenseOpen}
          onClose={() => setIsExpenseOpen(false)}
          defaultMerchantId={merchant.id}
          defaultMerchantName={merchant.name}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1.5 z-10" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={handleFavoriteClick}
          disabled={favLoading}
          title={isFav ? '取消收藏' : '加入收藏'}
          className={`p-1.5 rounded-lg border transition-all duration-200 cursor-pointer ${
            isFav
              ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20'
              : 'bg-card/80 border-border/50 text-muted hover:text-red-500 hover:bg-muted-bg'
          }`}
        >
          {isFav ? (
            <HeartSolid className="w-4 h-4 text-red-500" />
          ) : (
            <HeartOutline className="w-4 h-4" />
          )}
        </button>

        <button
          type="button"
          onClick={handleExpenseClick}
          title="快速記帳"
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-accent/10 text-accent font-medium hover:bg-accent/20 transition-all duration-200 cursor-pointer"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>記帳</span>
        </button>
      </div>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <AddExpenseModal
        isOpen={isExpenseOpen}
        onClose={() => setIsExpenseOpen(false)}
        defaultMerchantId={merchant.id}
        defaultMerchantName={merchant.name}
      />
    </>
  );
}
