'use client';

import React, { useState } from 'react';
import RadarFab from '@/components/RadarFab';
import dynamic from 'next/dynamic';

const RadarSheet = dynamic(() => import('@/components/RadarSheet'), { ssr: false, loading: () => <p role="status" className="fixed bottom-24 right-6 bg-card p-3 rounded-lg shadow">正在載入附近商店…</p> });

export default function GlobalRadar() {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <>
      <RadarFab onClick={() => setIsOpen(true)} />
      {isOpen && <RadarSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />}
    </>
  );
}
