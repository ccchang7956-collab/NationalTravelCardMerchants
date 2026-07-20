'use client';

import React from 'react';
import { motion, PanInfo } from 'framer-motion';

export type SnapState = 'collapsed' | 'half' | 'full';

export interface MobileBottomSheetProps {
  snapState: SnapState;
  onSnapChange: (state: SnapState) => void;
  children: React.ReactNode;
}

const HEIGHT_MAP: Record<SnapState, string> = {
  collapsed: '80px',
  half: '45vh',
  full: '90vh',
};

const NEXT_SNAP_STATE: Record<SnapState, SnapState> = {
  collapsed: 'half',
  half: 'full',
  full: 'collapsed',
};

export const MobileBottomSheet: React.FC<MobileBottomSheetProps> = ({
  snapState,
  onSnapChange,
  children,
}) => {
  const handleHandleClick = () => {
    const nextState = NEXT_SNAP_STATE[snapState];
    onSnapChange(nextState);
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const offsetY = info.offset.y;
    const velocityY = info.velocity.y;

    if (offsetY < -50 || velocityY < -300) {
      // Dragging up
      if (snapState === 'collapsed') {
        onSnapChange('half');
      } else if (snapState === 'half') {
        onSnapChange('full');
      }
    } else if (offsetY > 50 || velocityY > 300) {
      // Dragging down
      if (snapState === 'full') {
        onSnapChange('half');
      } else if (snapState === 'half') {
        onSnapChange('collapsed');
      }
    }
  };

  return (
    <motion.div
      data-testid="bottom-sheet"
      className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
      style={{ height: HEIGHT_MAP[snapState] }}
      animate={{ height: HEIGHT_MAP[snapState] }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
    >
      <div
        data-testid="drag-handle"
        onClick={handleHandleClick}
        className="w-full flex justify-center items-center py-3 cursor-pointer select-none touch-none group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        aria-label="Toggle Bottom Sheet Height"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleHandleClick();
          }
        }}
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full group-hover:bg-slate-400 dark:group-hover:bg-slate-600 transition-colors" />
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-slate-900 dark:text-slate-100">
        {children}
      </div>
    </motion.div>
  );
};

export default MobileBottomSheet;
