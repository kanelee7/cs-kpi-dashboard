'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';

type CompactModeContextValue = {
  isCompact: boolean;
  toggleCompact: () => void;
};

const CompactModeContext = createContext<CompactModeContextValue | undefined>(undefined);

export function CompactModeProvider({ children }: { children: React.ReactNode }) {
  const [isCompact, setIsCompact] = useState(false);

  const toggleCompact = useCallback(() => {
    setIsCompact(prev => !prev);
  }, []);

  return (
    <CompactModeContext.Provider value={{ isCompact, toggleCompact }}>
      {children}
    </CompactModeContext.Provider>
  );
}

export function useCompactMode(): CompactModeContextValue {
  const ctx = useContext(CompactModeContext);
  if (!ctx) {
    throw new Error('useCompactMode must be used within a CompactModeProvider');
  }
  return ctx;
}

