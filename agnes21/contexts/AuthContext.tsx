import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { authService } from '../../services/authService';

export interface AgnesUser {
  id: string;
  name: string;
  email: string;
  role?: string;
  division?: 'insurance' | 'retail';
}

interface AgnesAuthContextType {
  user: AgnesUser | null;
}

const AgnesAuthContext = createContext<AgnesAuthContextType>({ user: null });

interface AgnesAuthProviderProps {
  children: ReactNode;
}

export const AgnesAuthProvider: React.FC<AgnesAuthProviderProps> = ({ children }) => {
  const currentUser = authService.getCurrentUser();

  const user = useMemo<AgnesUser | null>(() => {
    if (!currentUser) return null;
    return {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      role: currentUser.role,
      division: 'insurance'
    };
  }, [currentUser]);

  return (
    <AgnesAuthContext.Provider value={{ user }}>
      {children}
    </AgnesAuthContext.Provider>
  );
};

export const useAuth = (): AgnesAuthContextType => {
  return useContext(AgnesAuthContext);
};

