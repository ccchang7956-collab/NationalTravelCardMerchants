'use client';

import React, { useState } from 'react';
import RadarFab from '@/components/RadarFab';
import RadarSheet from '@/components/RadarSheet';

export default function GlobalRadar() {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <>
      <RadarFab onClick={() => setIsOpen(true)} />
      <RadarSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
