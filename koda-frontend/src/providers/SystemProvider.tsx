import React, { createContext, useContext, useState } from 'react';

export type SystemKey = 'all' | 'administrativo' | 'financiero' | 'contable' | 'fiscal' | 'nomina';

interface SystemContextType {
  activeSystem: SystemKey;
  setActiveSystem: (system: SystemKey) => void;
}

const SystemContext = createContext<SystemContextType | undefined>(undefined);

export const SystemProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSystem, setActiveSystemState] = useState<SystemKey>(() => {
    return (localStorage.getItem('koda_active_system') as SystemKey) || 'all';
  });

  const setActiveSystem = (system: SystemKey) => {
    setActiveSystemState(system);
    localStorage.setItem('koda_active_system', system);
  };

  return (
    <SystemContext.Provider value={{ activeSystem, setActiveSystem }}>
      {children}
    </SystemContext.Provider>
  );
};

export const useSystem = () => {
  const context = useContext(SystemContext);
  if (!context) {
    throw new Error('useSystem must be used within a SystemProvider');
  }
  return context;
};
