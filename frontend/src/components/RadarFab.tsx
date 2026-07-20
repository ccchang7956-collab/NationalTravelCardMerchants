'use client';

import React from 'react';
import { RadioIcon } from '@heroicons/react/24/outline';

interface RadarFabProps {
  onClick: () => void;
}

export default function RadarFab({ onClick }: RadarFabProps) {
  return (
    <button
      onClick={onClick}
      aria-label="開啟周邊國旅卡特約店家雷達"
      className="fixed bottom-20 right-4 sm:bottom-8 sm:right-8 z-40 flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all group"
    >
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-300 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-200"></span>
      </span>
      <RadioIcon className="w-5 h-5 group-hover:rotate-12 transition-transform" />
      <span className="font-semibold text-sm tracking-wide">周邊雷達</span>
    </button>
  );
}
