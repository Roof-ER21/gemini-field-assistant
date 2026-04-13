import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService, Division } from '../services/authService';
import { API_BASE_URL } from '../services/config';

interface DivisionContextType {
  division: Division;
  isRetail: boolean;
  isInsurance: boolean;
  hasDivision: boolean;
  setDivision: (division: Division) => Promise<boolean>;
}

const DivisionContext = createContext<DivisionContextType>({
  division: 'insurance',
  isRetail: false,
  isInsurance: true,
  hasDivision: true,
  setDivision: async () => false,
});

export const useDivision = () => useContext(DivisionContext);

export const DivisionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const user = authService.getCurrentUser();
  const [division, setDivisionState] = useState<Division>(user?.division || 'insurance');
  const [hasDivision, setHasDivision] = useState<boolean>(!!user?.division);

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser?.division) {
      setDivisionState(currentUser.division);
      setHasDivision(true);
    } else {
      setHasDivision(false);
    }
  }, []);

  const setDivision = useCallback(async (newDivision: Division): Promise<boolean> => {
    try {
      // Update locally
      await authService.updateUserProfile({ division: newDivision } as any);
      setDivisionState(newDivision);
      setHasDivision(true);

      // Update on server
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        fetch(`${API_BASE_URL}/api/users/me`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': currentUser.email,
          },
          body: JSON.stringify({ division: newDivision }),
        }).catch(err => console.warn('Failed to sync division to server:', err));
      }

      return true;
    } catch (error) {
      console.error('Failed to set division:', error);
      return false;
    }
  }, []);

  return (
    <DivisionContext.Provider value={{
      division,
      isRetail: division === 'retail',
      isInsurance: division === 'insurance',
      hasDivision,
      setDivision,
    }}>
      {children}
    </DivisionContext.Provider>
  );
};

export default DivisionContext;
