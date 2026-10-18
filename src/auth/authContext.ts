import { createContext } from 'react';
import type { Me } from '@/api/types';

export type AuthState = {
  user: Me | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<Me>;
  acceptInvite: (token: string, name: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);
